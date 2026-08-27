package com.kbstar.kgi.ggreport.web.support;

import java.io.File;

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
