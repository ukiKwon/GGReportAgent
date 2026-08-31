package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.Message;
import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.mapper.MessageMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 완료 아카이브 — Task 5B.6. Python {@code server/archive.py}.
 *
 * <p>최종 승인 뒤 작업물 일체를 내부 저장소에 남긴다. 산출물 파일 + 작업/댓글 덤프 +
 * manifest 까지가 여기 몫이다.
 */
@Service
public class ArchiveService {

    /** 이름이 정확히 일치할 때만 옮기는 산출물. 원본 {@code ARTIFACT_NAMES}. */
    private static final List<String> ARTIFACT_NAMES =
            Arrays.asList("rfp_text.txt", "rfp_scoring.json", "coverage_map.json");

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final TaskMapper tasks;
    private final MessageMapper messages;
    private final AppProperties properties;

    public ArchiveService(TaskMapper tasks, MessageMapper messages, AppProperties properties) {
        this.tasks = tasks;
        this.messages = messages;
        this.properties = properties;
    }

    /**
     * 기관의 완료 산출물을 아카이브하고 그 경로를 돌려준다.
     *
     * <p>{@code bidCaseId} 가 {@code null} 이면 작업 덤프는 <b>빈 배열</b>이고, 파일
     * 복사와 manifest 작성은 그대로 한다 — 공고가 아직 없는 기관도 있을 수 있다.
     */
    public String archive(Institution institution, String bidCaseId) {
        Path archiveRoot = Paths.get(properties.getArchiveRoot()).toAbsolutePath().normalize();
        String day = ZonedDateTime.now(ZoneOffset.UTC).format(DAY);
        Path dest = archiveRoot.resolve(institution.getNameKo()).resolve(day).normalize();

        // ⚠️ dest 는 기관명으로 조립되는데 바로 아래에서 통째로 지운다. 기관명에
        //    `..` 가 섞이면 아카이브 밖 디렉터리를 지운다 — 지우기 전에 울타리를 본다.
        if (!dest.startsWith(archiveRoot)) {
            throw ApiException.badRequest(
                    "아카이브 경로가 뿌리를 벗어납니다: '" + institution.getNameKo() + "'");
        }

        try {
            if (Files.exists(dest)) {
                deleteTree(dest);
            }
            Files.createDirectories(dest);

            List<String> copied = copyArtifacts(institution.getNameKo(), dest);
            writeJson(dest.resolve("tasks_dump.json"), tasksDump(bidCaseId));

            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("institution_id", institution.getInstitutionId());
            manifest.put("name_ko", institution.getNameKo());
            manifest.put("archived_at", Times.nowIso());
            List<String> files = new ArrayList<>(copied);
            files.add("tasks_dump.json");
            manifest.put("files", files);
            writeJson(dest.resolve("manifest.json"), manifest);
        } catch (IOException exc) {
            throw new ApiException(500, "아카이브에 실패했습니다: " + exc.getMessage());
        }
        return relative(dest);
    }

    /**
     * ⚠️ <b>{@code .pptx} 는 확장자를 소문자로 낮춰 비교한다.</b> 대소문자로 제안서를
     * 놓치면 아카이브에서 <b>통째로 빠지는데</b> 오류가 나지 않아 아무도 모른다.
     */
    private List<String> copyArtifacts(String nameKo, Path dest) throws IOException {
        List<String> copied = new ArrayList<>();
        Path srcDir = Paths.get(properties.getOutputRoot()).resolve(nameKo);
        if (!Files.isDirectory(srcDir)) {
            return copied;
        }
        try (java.nio.file.DirectoryStream<Path> stream = Files.newDirectoryStream(srcDir)) {
            for (Path p : stream) {
                String name = p.getFileName().toString();
                if (!Files.isRegularFile(p)) {
                    continue;
                }
                if (ARTIFACT_NAMES.contains(name) || name.toLowerCase().endsWith(".pptx")) {
                    Files.copy(p, dest.resolve(name), StandardCopyOption.REPLACE_EXISTING);
                    copied.add(name);
                }
            }
        }
        java.util.Collections.sort(copied);
        return copied;
    }

    /** 작업 + 그 작업의 댓글까지. 나중에 "무엇을 왜 이렇게 썼나"를 되짚는 자리다. */
    private List<Map<String, Object>> tasksDump(String bidCaseId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (bidCaseId == null) {
            return out;
        }
        for (Task task : tasks.selectByBidCase(bidCaseId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("task_id", task.getTaskId());
            row.put("bid_case_id", task.getBidCaseId());
            row.put("team", task.getTeam());
            row.put("status", task.getStatus());
            row.put("progress_pct", task.getProgressPct());
            row.put("draft_content", task.getDraftContent());
            row.put("assignee", task.getAssignee());
            row.put("approver", task.getApprover());
            row.put("final_approver", task.getFinalApprover());

            List<Map<String, Object>> dumped = new ArrayList<>();
            for (Message m : messages.selectByTask(task.getTaskId())) {
                Map<String, Object> one = new LinkedHashMap<>();
                one.put("role", m.getRole());
                one.put("content", m.getContent());
                one.put("created_at", m.getCreatedAt());
                dumped.add(one);
            }
            row.put("messages", dumped);
            out.add(row);
        }
        return out;
    }

    private static void writeJson(Path path, Object value) throws IOException {
        byte[] bytes = JSON.writerWithDefaultPrettyPrinter()
                .writeValueAsString(value).getBytes(StandardCharsets.UTF_8);
        Files.write(path, bytes);
    }

    /** 리포 안이면 상대경로로 — 절대경로를 응답에 실으면 환경이 바뀔 때 의미가 없다. */
    private String relative(Path path) {
        Path repoRoot = Paths.get(properties.getRepoRoot()).toAbsolutePath().normalize();
        return path.startsWith(repoRoot)
                ? repoRoot.relativize(path).toString().replace('\\', '/')
                : path.toString().replace('\\', '/');
    }

    private static void deleteTree(Path dir) throws IOException {
        Files.walkFileTree(dir, new java.nio.file.SimpleFileVisitor<Path>() {
            @Override
            public java.nio.file.FileVisitResult visitFile(Path file,
                    java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult postVisitDirectory(Path d, IOException exc)
                    throws IOException {
                Files.delete(d);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
    }
}
