package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.web.ApiException;
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

    private final TaskMapper tasks;
    private final AppProperties properties;

    public TaskFileService(TaskMapper tasks, AppProperties properties) {
        this.tasks = tasks;
        this.properties = properties;
    }

    /** 업로드. 담당이 비어 있으면 올린 사람이 담당이 된다. */
    public TaskFileEntry save(String taskId, String actor, String filename, byte[] data) {
        TaskContext ctx = requireContext(taskId);
        requireOwner(ctx, actor);
        tasks.claimAssigneeIfUnset(taskId, actor);
        try {
            return TaskFiles.save(properties.getOutputRoot(), ctx.getInstitutionName(),
                    taskId, filename, data);
        } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        } catch (IOException io) {
            // 디스크 쪽 실패는 사용자가 고칠 수 없다 — 사유를 감추지 말고 500 으로 올린다.
            throw new IllegalStateException("작업물 저장 실패: " + taskId, io);
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

    public void remove(String taskId, String actor, String name) {
        TaskContext ctx = requireContext(taskId);
        requireOwner(ctx, actor);
        boolean removed;
        try {
            removed = TaskFiles.remove(properties.getOutputRoot(), ctx.getInstitutionName(),
                    taskId, name);
        } catch (TaskFiles.FileRejected | IllegalArgumentException rejected) {
            throw ApiException.badRequest(rejected.getMessage());
        }
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

    /** 미배정이면 선점, 남의 것이면 403. {@code TaskCommandService} 와 같은 관행이다. */
    private static void requireOwner(TaskContext ctx, String actor) {
        if (ctx.getAssignee() != null && !ctx.getAssignee().equals(actor)) {
            throw new ApiException(403, "only the assignee can modify this task");
        }
    }
}
