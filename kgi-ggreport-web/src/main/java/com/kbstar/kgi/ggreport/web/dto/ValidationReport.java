package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.util.ArrayList;
import java.util.List;

/**
 * 코퍼스 검사 결과 — Python {@code corpus_validator.ValidationReport}.
 *
 * <p>{@code ok} 는 <b>오류가 없다</b>는 뜻이지 경고가 없다는 뜻이 아니다. 경고는
 * 사람이 판단할 여지가 있는 항목이라 등록을 막지 않는다 — 등록({@code POST /corpus})은
 * 오류가 있을 때만 422 로 거절하고, 경고는 응답에 실어 보여만 준다.
 */
public class ValidationReport {

    private final List<ValidationIssue> errors = new ArrayList<>();
    private final List<ValidationIssue> warnings = new ArrayList<>();

    public List<ValidationIssue> getErrors() { return errors; }

    public List<ValidationIssue> getWarnings() { return warnings; }

    public void error(int rule, String file, String message) {
        errors.add(new ValidationIssue(rule, file, message));
    }

    public void warn(int rule, String file, String message) {
        warnings.add(new ValidationIssue(rule, file, message));
    }

    /** 오류가 없으면 통과. 경고는 통과를 막지 않는다. */
    @JsonIgnore
    public boolean isOk() {
        return errors.isEmpty();
    }
}
