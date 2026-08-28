package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.domain.TaskActorIn;
import com.kbstar.kgi.ggreport.web.domain.TaskApprovalIn;
import com.kbstar.kgi.ggreport.web.domain.TaskDraftIn;
import com.kbstar.kgi.ggreport.web.domain.TaskDetail;
import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;
import com.kbstar.kgi.ggreport.web.dto.TaskListRow;
import com.kbstar.kgi.ggreport.web.service.TaskCommandService;
import com.kbstar.kgi.ggreport.web.service.TaskFileService;
import com.kbstar.kgi.ggreport.web.service.TaskQueryService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.List;

/**
 * 역할별 작업 목록 — <b>기관 횡단</b>이다. 골든 {@code 26}.
 *
 * <p>{@code team} 은 필수다. {@code status} 는 여러 개 올 수 있고, 없으면 상태로
 * 거르지 않는다.
 *
 * <p>결재 흐름(임시저장·제출·결재)이 여기 있다 — 골든 {@code 15}~{@code 23}.
 * 작업 상세({@code GET /tasks/{id}})·파일·대화는 아직 없다.
 *
 * <p>⚠️ <b>{@code X-User-Id} 헤더가 필수다.</b> 누가 한 요청인지가 담당·결재자로 그대로
 * 박히므로 기본값을 주지 않는다 — 빠지면 400 이지, 익명으로 진행되지 않는다.
 * 한글 이름은 이 헤더에 못 실어서(ASCII 전용) 본문의 {@code by} 가 헤더를 이긴다.
 */
@RestController
@RequestMapping("/tasks")
public class TaskController {

    private final TaskQueryService tasks;
    private final TaskCommandService commands;
    private final TaskFileService files;

    public TaskController(TaskQueryService tasks, TaskCommandService commands,
                          TaskFileService files) {
        this.tasks = tasks;
        this.commands = commands;
        this.files = files;
    }

    @GetMapping
    public List<TaskListRow> list(
            @RequestParam("team") String team,
            @RequestParam(name = "status", required = false) List<String> status) {
        if (team.isEmpty()) {
            throw ApiException.badRequest("team이 비어 있습니다");
        }
        return tasks.listForTeam(team, status);
    }

    /** 작업 상세 — 본문 + 그 작업에 달린 기록. 없으면 404. */
    @GetMapping("/{taskId}")
    public TaskDetail detail(@PathVariable String taskId) {
        return tasks.detail(taskId);
    }

    // ── 첨부(디자이너 작업물) — Task 5B.1 ────────────────────────────────
    // ⚠️ 경로 위생은 support/TaskFiles 가 끝낸다. 여기서 파일명을 다시 조립하지 말 것.

    /**
     * 업로드. {@code multipart} 라 {@code by} 도 폼 필드로 온다(본문이 JSON 이 아니다).
     *
     * <p>{@code 201} 이고, 같은 이름을 덮어썼으면 응답의 {@code replaced} 로 알린다 —
     * <b>조용히 덮어쓰지 않는다.</b>
     */
    @PostMapping("/{taskId}/files")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskFileEntry upload(@PathVariable String taskId,
                                @RequestParam("file") MultipartFile file,
                                @RequestParam(name = "by", required = false) String by,
                                @RequestHeader("X-User-Id") String userId) throws IOException {
        return files.save(taskId, actor(by, userId), file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping("/{taskId}/files")
    public List<TaskFileEntry> fileList(@PathVariable String taskId) {
        return files.listing(taskId);
    }

    /**
     * 내려받기.
     *
     * <p>⚠️ 한글 파일명은 {@code Content-Disposition} 에 그대로 실을 수 없다(헤더는
     * ASCII 다). RFC 5987 의 {@code filename*=UTF-8''…} 로 싣는다 — 이걸 빼면
     * 브라우저가 이름을 깨뜨리거나 {@code taskId} 를 파일명으로 저장한다.
     */
    @GetMapping("/{taskId}/files/{name}")
    public ResponseEntity<Resource> download(@PathVariable String taskId,
                                             @PathVariable String name) {
        File file = files.resolve(taskId, name);
        String encoded;
        try {
            encoded = URLEncoder.encode(file.getName(), "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            throw new IllegalStateException(never);   // UTF-8 은 항상 있다
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + encoded)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(file.length())
                .body(new FileSystemResource(file));
    }

    /** 삭제. {@code DELETE} 는 본문을 싣지 않는 관행이라 {@code by} 를 쿼리로 받는다. */
    @DeleteMapping("/{taskId}/files/{name}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFile(@PathVariable String taskId,
                           @PathVariable String name,
                           @RequestParam(name = "by", required = false) String by,
                           @RequestHeader("X-User-Id") String userId) {
        files.remove(taskId, actor(by, userId), name);
    }

    /**
     * 이 요청을 실제로 한 사람. <b>{@code by} 가 헤더를 이긴다</b> —
     * {@code X-User-Id} 에는 ASCII 만 실을 수 있어 한글 이름은 본문·폼으로 온다.
     * ({@code TaskCommandService} 의 같은 규칙 — 그쪽은 JSON 본문이라 거기서 푼다.)
     */
    private static String actor(String by, String userId) {
        String trimmed = by == null ? "" : by.trim();
        return trimmed.isEmpty() ? userId : trimmed;
    }

    /** 임시저장 — 골든 {@code 15}. 기록을 남기지 않고, 첫 저장이 담당을 선점한다. */
    @PatchMapping("/{taskId}/draft")
    public Task draft(@PathVariable String taskId,
                      @RequestBody TaskDraftIn body,
                      @RequestHeader("X-User-Id") String userId) {
        return commands.patchDraft(taskId, body, userId);
    }

    /**
     * 제출 — 골든 {@code 16}. 본문은 <b>없어도 된다</b>(원본 {@code TaskActorIn | None}).
     * 한글 이름 담당자만 {@code {"by": …}} 를 싣는다.
     */
    @PostMapping("/{taskId}/submit")
    public Task submit(@PathVariable String taskId,
                       @RequestBody(required = false) TaskActorIn body,
                       @RequestHeader("X-User-Id") String userId) {
        return commands.submit(taskId, body == null ? null : body.getBy(), userId);
    }

    /** 결재 — 골든 {@code 17}. {@code approved=false} 면 반려 사유가 담당자에게 간다. */
    @PostMapping("/{taskId}/approve")
    public Task approve(@PathVariable String taskId,
                        @RequestBody TaskApprovalIn body,
                        @RequestHeader("X-User-Id") String userId) {
        return commands.approve(taskId, body, userId);
    }
}
