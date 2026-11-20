package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import com.kbstar.kgi.ggreport.web.web.DesignGate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.List;

/**
 * 작업 첨부(디자이너 작업물) — Task 5B.1. Python {@code server/routers/tasks.py} 의
 * {@code /files} 4종 + {@code server/task_files.py}.
 *
 * <p>경로 위생은 {@link TaskFiles} 가 끝낸다. 이 클래스가 하는 일은 <b>누가 무엇에
 * 손댈 수 있는지</b>다:
 * <ul>
 *   <li>없는 작업이면 404</li>
 *   <li>미배정이면 <b>먼저 손댄 사람이 맡는다</b>(선점) — 남의 것이면 403</li>
 *   <li>읽기(목록·내려받기)에는 담당 검사를 걸지 않는다 — 원본과 같다. 디자이너가
 *       다른 팀의 산출물을 받아 가는 것이 이 화면의 목적이라, 소유자만 읽게 하면
 *       기능 자체가 성립하지 않는다</li>
 * </ul>
 */
@Service
public class TaskFileService {

    private static final Logger LOG = LoggerFactory.getLogger(TaskFileService.class);

    private final TaskMapper tasks;
    private final AppProperties properties;
    private final DocCheckService docChecks;
    /** 켜면 매크로·ActiveX·PDF 스크립트·실행이 든 파일을 400 으로 거부(기본 off, 팀 결정 11-20). 첨부 PDF 는 거부하지 않는다. */
    private final boolean rejectUnsafe;

    public TaskFileService(TaskMapper tasks, AppProperties properties, DocCheckService docChecks,
                           @Value("${ggreport.task-files.reject-unsafe:false}") boolean rejectUnsafe) {
        this.tasks = tasks;
        this.properties = properties;
        this.docChecks = docChecks;
        this.rejectUnsafe = rejectUnsafe;
    }

    /**
     * 업로드. 담당이 비어 있으면 올린 사람이 담당이 된다.
     * 내용 점검(NEXT 106)은 <b>디스크에 쓰기 전에</b> 메모리에서 끝낸다(security S1) — 거부해도 같은 이름의 이전 파일이 그대로 남는다.
     * 디스크 쓰기와 점검 기록은 (작업, 이름) 잠금 아래에서 한 줄로 선다(S13). 기록 실패는 업로드를 실패시키지 않는다(WARN, 예외 종류만).
     */
    public TaskFileEntry save(final String taskId, String actor, String filename, final byte[] data) {
        final TaskContext ctx = requireContext(taskId);
        requireOwner(ctx, actor);
        requireEditable(ctx);
        tasks.claimAssigneeIfUnset(taskId, actor);
        final String name;
        try {
            TaskFiles.requireSize(data);
            name = TaskFiles.safeName(filename);
        } catch (TaskFiles.FileRejected rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        }
        final TaskDocExtractor.Extracted ex = docChecks.extract(name, data);
        if (rejectUnsafe) {
            requireSafe(ex);
        }
        return TaskFileLocks.with(taskId, name, () -> {
            // 줄무늬 잠금 안, 디스크에 쓰기 직전에 다시 확인 — 앞선 검사 뒤 [디자인 작업 완료]가 들어왔으면 쓰지 않는다(qa P2-3).
            // ⚠️ 이 읽기와 쓰기 사이의 아주 좁은 틈은 남는다(TASKS 행 잠금을 쓰는 동안 쥐지는 않는다).
            if (Teams.DESIGNER_TEAM.equals(ctx.getTeam())) {
                String latest = docChecks.currentStatus(taskId);
                if (latest == null) {
                    throw ApiException.notFound("task not found");
                }
                requireEditable(ctx.getTeam(), latest);
            }
            TaskFileEntry saved;
            try {
                saved = TaskFiles.save(properties.getOutputRoot(), ctx.getInstitutionName(), taskId, name, data);
            } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
                throw ApiException.badRequest(rejected.getMessage());
            } catch (IOException io) {
                // 디스크 쪽 실패는 사용자가 고칠 수 없다 — 사유를 감추지 말고 500 으로 올린다.
                throw new IllegalStateException("작업물 저장 실패: " + taskId, io);
            }
            try {
                docChecks.record(ctx, saved.getName(), TaskFiles.resolve(properties.getOutputRoot(),
                        ctx.getInstitutionName(), taskId, saved.getName()), data, ex);
            } catch (RuntimeException e) {
                LOG.warn("doc-check record failed task={} type={}", DesignGate.key(taskId), e.getClass().getSimpleName());
            }
            return saved;
        });
    }

    /** rejectUnsafe 가 켜졌을 때만. 결론을 못 낸 점검(BUSY·TIMEOUT·ERROR)은 실패하면 닫는 쪽(503)으로 둔다. */
    private static void requireSafe(TaskDocExtractor.Extracted ex) {
        if (ex == null) {
            return;
        }
        if (ex.unsafe()) {
            throw DesignReviewService.coded(400, "ACTIVE_CONTENT", "매크로·스크립트가 들어 있는 파일은 올릴 수 없습니다.");
        }
        if (ex.inconclusive()) {
            throw DesignReviewService.coded(503, "DOC_CHECK_BUSY", "파일을 점검하지 못해 올리지 않았습니다. 잠시 뒤 다시 올려 주세요.");
        }
    }

    /**
     * 첨부 목록.
     *
     * <p>⚠️ 경로 가드에 걸리면 <b>400 이다.</b> 예전에는 이 메서드만 예외를 안 잡아
     * 같은 원인이 업로드에서는 400, 목록에서는 <b>500</b> 으로 갈렸다(스택 트레이스가
     * 나가고 화면에는 사유가 안 남는다). 네 경로가 같은 모양으로 실패해야 한다.
     */
    public List<TaskFileEntry> listing(String taskId) {
        TaskContext ctx = requireContext(taskId);
        try {
            return TaskFiles.listing(properties.getOutputRoot(), ctx.getInstitutionName(), taskId);
        } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        }
    }

    /** 내려받을 실제 파일. 없으면 404, 이름이 수상하면 400. */
    public File resolve(String taskId, String name) {
        TaskContext ctx = requireContext(taskId);
        File file;
        try {
            file = TaskFiles.resolve(properties.getOutputRoot(), ctx.getInstitutionName(),
                    taskId, name);
        } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        }
        if (!file.isFile()) {
            throw ApiException.notFound("파일이 없습니다: " + name);
        }
        return file;
    }

    public void remove(final String taskId, String actor, String name) {
        final TaskContext ctx = requireContext(taskId);
        requireOwner(ctx, actor);
        requireEditable(ctx);
        final String safe;
        try {
            safe = TaskFiles.safeName(name);
        } catch (TaskFiles.FileRejected rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        }
        boolean removed = TaskFileLocks.with(taskId, safe, () -> {
            boolean r;
            try {
                r = TaskFiles.remove(properties.getOutputRoot(), ctx.getInstitutionName(), taskId, safe);
            } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
                throw ApiException.badRequest(rejected.getMessage());
            }
            if (r) {
                try {
                    docChecks.onFileRemoved(taskId, safe);
                } catch (RuntimeException e) {
                    LOG.warn("doc-check remove failed task={} type={}", DesignGate.key(taskId), e.getClass().getSimpleName());
                }
            }
            return r;
        });
        if (!removed) {
            throw ApiException.notFound("파일이 없습니다: " + name);
        }
    }

    private TaskContext requireContext(String taskId) {
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            throw ApiException.notFound("task not found");
        }
        return ctx;
    }

    /**
     * 디자이너 작업은 대기·작성중일 때만 파일을 바꿀 수 있다(051) — 의견을 받는 중(1차완료)이거나 부장께 올라간·확정된 뒤에는 검토 대상물이 바뀌면 안 된다.
     * 409 {@code TASK_LOCKED}. 세 팀 작업에는 영향이 없다. ⚠️ 검사 뒤 디스크에 쓰는 순서라 완료 요청과 동시에 오면 한 건이 새어 들 수 있다(security L3, 권장 과제).
     */
    private static void requireEditable(TaskContext ctx) {
        requireEditable(ctx.getTeam(), ctx.getStatus());
    }

    private static void requireEditable(String team, String status) {
        if (Teams.DESIGNER_TEAM.equals(team) && !Teams.isWorking(status)) {
            throw DesignReviewService.coded(409, "TASK_LOCKED",
                    "의견을 받는 중이거나 확정된 작업은 파일을 바꿀 수 없습니다. 먼저 [다시 수정]을 눌러 주세요.");
        }
    }

    /** 미배정이면 선점, 남의 것이면 403. {@code TaskCommandService} 와 같은 관행이다. */
    private static void requireOwner(TaskContext ctx, String actor) {
        if (ctx.getAssignee() != null && !ctx.getAssignee().equals(actor)) {
            throw new ApiException(403, "only the assignee can modify this task");
        }
    }
}
