package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 디자이너 작업물 파일 보관 위치. Python {@code server/task_files.py} 의 이관본
 * (단계 2에 필요한 <b>세기</b>까지만 — 저장·삭제·내려받기는 단계 5에서 온다).
 *
 * <p>저장 위치는 {@code {outputRoot}/{기관명}/design/{taskId}/} 다. {@code taskId} 로
 * 한 겹 더 내려가는 이유: 한 기관이 여러 공고를 가질 수 있어(1:N) 기관 밑에 바로
 * 두면 다른 공고의 작업물과 섞인다.
 *
 * <p>⚠️ <b>경로 위생을 여기서 끝낸다.</b> 기관명은 DB 에서 오지만 <b>반입 경로가
 * 있으므로 신뢰하지 않는다.</b> 두 겹으로 막는다: ① 조각에 구분자·{@code ..} 가
 * 없어야 하고 ② 조립 결과가 뿌리 안쪽이어야 한다. ①이 없으면 {@code taskId} 가
 * {@code ../..} 일 때 최종 경로가 뿌리 <b>안쪽</b>(다른 기관 폴더)에 떨어져 ②를
 * 통과하면서도 제 자리를 벗어난다.
 */
public final class TaskFiles {

    private TaskFiles() {
    }

    private static final String DESIGN_DIRNAME = "design";

    /** 디자이너 산출물로 실제로 오갈 것들만 — <b>실행파일이 공유 폴더에 쌓이면 안 된다.</b> */
    static final List<String> ALLOWED_EXTS = Collections.unmodifiableList(Arrays.asList(
            ".pptx", ".ppt", ".pdf", ".png", ".jpg", ".jpeg", ".zip"));

    /** 폐쇄망이라도 디스크는 유한하다. */
    static final long MAX_BYTES = 50L * 1024 * 1024;

    /** 사람이 읽고 바로 고칠 수 있는 사유를 담는다. 컨트롤러가 400 으로 바꾼다. */
    public static class FileRejected extends RuntimeException {
        public FileRejected(String message) {
            super(message);
        }
    }

    /** 올라온 파일 수. 폴더가 없으면 0 — <b>없는 것은 오류가 아니다.</b> */
    public static int count(String outputRoot, String institutionName, String taskId) {
        File dir = taskDir(outputRoot, institutionName, taskId);
        File[] entries = dir.listFiles();
        if (entries == null) {
            return 0;
        }
        int n = 0;
        for (File f : entries) {
            if (f.isFile()) {
                n++;
            }
        }
        return n;
    }

    /** 작업물 폴더. 제 자리를 벗어나면 {@link IllegalArgumentException}. */
    public static File taskDir(String outputRoot, String institutionName, String taskId) {
        String name = plainSegment(institutionName, "기관명");
        String tid = plainSegment(taskId, "task_id");
        File root = new File(outputRoot).getAbsoluteFile();
        File target = new File(new File(new File(root, name), DESIGN_DIRNAME), tid);
        // 두 번째 그물 — 조각 검사를 빠져나간 무엇이 있어도 뿌리 밖으로는 못 나간다.
        String rootPath = root.toPath().normalize().toString();
        String targetPath = target.toPath().normalize().toString();
        if (!targetPath.startsWith(rootPath + File.separator)) {
            throw new IllegalArgumentException(
                    "작업물 경로가 뿌리를 벗어납니다: " + institutionName + " / " + taskId);
        }
        return new File(targetPath);
    }

    /**
     * 경로 성분을 떼고 확장자를 검사한 파일명.
     *
     * <p>⚠️ {@code File#getName()} 만 쓰지 않는 이유: 그건 <b>실행 중인 OS 의 구분자</b>만
     * 자른다. 리눅스에서 돌면 {@code "C:\\x\\a.pptx"} 가 통째로 파일명이 된다.
     * 두 구분자를 모두 잘라야 플랫폼과 무관하게 같은 결과가 나온다(원본과 같은 규칙).
     *
     * @throws FileRejected 사람이 읽고 바로 고칠 수 있는 사유를 담는다.
     */
    public static String safeName(String filename) {
        String raw = filename == null ? "" : filename.replace('\\', '/');
        raw = raw.substring(raw.lastIndexOf('/') + 1).trim();
        if (raw.isEmpty() || ".".equals(raw) || "..".equals(raw)) {
            throw new FileRejected("파일명이 비어 있습니다");
        }
        if (raw.startsWith(".")) {
            // 숨김파일은 화면 목록에서 눈에 안 띄어 남아 있는 줄도 모르게 된다.
            throw new FileRejected("'.'으로 시작하는 파일은 올릴 수 없습니다: " + raw);
        }
        int dot = raw.lastIndexOf('.');
        String ext = dot < 0 ? "" : raw.substring(dot).toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTS.contains(ext)) {
            throw new FileRejected("올릴 수 없는 형식입니다("
                    + (ext.isEmpty() ? "확장자 없음" : ext) + ") — 가능한 형식: "
                    + String.join(", ", ALLOWED_EXTS));
        }
        return raw;
    }

    /**
     * 저장하고 그 결과를 돌려준다. 같은 이름이면 덮어쓰되 {@code replaced} 로 알린다.
     *
     * <p>덮어쓰기를 허용하는 이유: 디자이너가 수정본을 같은 이름으로 다시 올리는 것이
     * 자연스러운 흐름이다. 다만 <b>조용히</b> 덮어쓰지는 않는다.
     */
    public static TaskFileEntry save(String outputRoot, String institutionName, String taskId,
                                     String filename, byte[] data) throws IOException {
        if (data.length > MAX_BYTES) {
            throw new FileRejected(String.format(Locale.ROOT,
                    "파일이 너무 큽니다(%.1fMB) — %dMB까지 올릴 수 있습니다",
                    data.length / 1024.0 / 1024.0, MAX_BYTES / 1024 / 1024));
        }
        String name = safeName(filename);
        File dir = taskDir(outputRoot, institutionName, taskId);
        if (!dir.isDirectory() && !dir.mkdirs()) {
            throw new IOException("작업물 폴더를 만들지 못했습니다: " + dir);
        }
        File target = new File(dir, name);
        boolean replaced = target.isFile();
        Files.write(target.toPath(), data);
        return entry(target, replaced);
    }

    /** 올라온 파일 목록(이름순). 폴더가 없으면 빈 목록 — <b>없는 것은 오류가 아니다.</b> */
    public static List<TaskFileEntry> listing(String outputRoot, String institutionName,
                                              String taskId) {
        File[] entries = taskDir(outputRoot, institutionName, taskId).listFiles();
        if (entries == null) {
            return Collections.emptyList();
        }
        List<File> files = new ArrayList<>();
        for (File f : entries) {
            if (f.isFile()) {
                files.add(f);
            }
        }
        files.sort(Comparator.comparing(File::getName));
        List<TaskFileEntry> rows = new ArrayList<>(files.size());
        for (File f : files) {
            rows.add(entry(f, false));
        }
        return rows;
    }

    /** 내려받기용 실제 경로. 이름은 저장 때와 <b>같은 규칙</b>으로 다시 씻는다. */
    public static File resolve(String outputRoot, String institutionName, String taskId,
                               String name) {
        return new File(taskDir(outputRoot, institutionName, taskId), safeName(name));
    }

    /** 지웠으면 {@code true}, 원래 없었으면 {@code false}. */
    public static boolean remove(String outputRoot, String institutionName, String taskId,
                                 String name) {
        File target = resolve(outputRoot, institutionName, taskId, name);
        return target.isFile() && target.delete();
    }

    /**
     * ⚠️ 시각은 {@link Times} 를 쓴다 — 목록의 {@code uploaded_at} 이 DB 의 다른
     * 시각들과 <b>같은 모양</b>이어야 화면이 한 규칙으로 파싱한다.
     */
    private static TaskFileEntry entry(File file, boolean replaced) {
        return new TaskFileEntry(file.getName(), file.length(),
                Times.iso(Instant.ofEpochMilli(file.lastModified())), replaced);
    }

    private static String plainSegment(String value, String label) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty() || ".".equals(text) || "..".equals(text)) {
            throw new IllegalArgumentException(label + "이(가) 비어 있거나 올바르지 않습니다: " + value);
        }
        if (text.indexOf('/') >= 0 || text.indexOf('\\') >= 0
                || text.indexOf(File.separatorChar) >= 0) {
            throw new IllegalArgumentException(label + "에 경로 구분자를 쓸 수 없습니다: " + value);
        }
        return text;
    }
}
