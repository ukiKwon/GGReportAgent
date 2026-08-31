package com.kbstar.kgi.ggreport.web.dto;

/**
 * 코퍼스 검사 위반 1건 — Python {@code corpus_validator.ValidationIssue}.
 *
 * <p>응답 키는 {@code rule}·{@code file}·{@code message} 셋이다(원본 {@code _issues}).
 * 화면이 이 모양으로 목록을 그리므로 키를 바꾸지 말 것.
 *
 * <p>{@code file} 은 <b>코퍼스 루트 기준 상대경로</b>이고, 디렉터리 자체를 가리킬 때는
 * {@code "spec"} 처럼 폴더명만 온다. 루트 자체가 문제일 때만 {@code null} 이다.
 */
public class ValidationIssue {

    private int rule;
    private String file;
    private String message;

    public ValidationIssue() {
    }

    public ValidationIssue(int rule, String file, String message) {
        this.rule = rule;
        this.file = file;
        this.message = message;
    }

    public int getRule() { return rule; }
    public void setRule(int rule) { this.rule = rule; }

    public String getFile() { return file; }
    public void setFile(String file) { this.file = file; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
