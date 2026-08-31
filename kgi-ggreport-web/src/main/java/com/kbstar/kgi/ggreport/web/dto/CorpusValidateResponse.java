package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code POST /institutions/{id}/corpus/validate} 의 응답.
 *
 * <p>⚠️ <b>오류가 있어도 200 이다.</b> 이 엔드포인트는 "검사 결과를 보여 주는" 것이지
 * 판정을 강제하는 것이 아니다 — 사람이 고칠 목록을 받아 보는 화면이 소비한다.
 * 거절은 등록({@code POST /corpus}) 쪽에서만 일어난다(422).
 */
public class CorpusValidateResponse {

    private boolean ok;
    private List<ValidationIssue> errors;
    private List<ValidationIssue> warnings;

    public CorpusValidateResponse() {
    }

    public CorpusValidateResponse(ValidationReport report) {
        this.ok = report.isOk();
        this.errors = report.getErrors();
        this.warnings = report.getWarnings();
    }

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }

    public List<ValidationIssue> getErrors() { return errors; }
    public void setErrors(List<ValidationIssue> errors) { this.errors = errors; }

    public List<ValidationIssue> getWarnings() { return warnings; }
    public void setWarnings(List<ValidationIssue> warnings) { this.warnings = warnings; }
}
