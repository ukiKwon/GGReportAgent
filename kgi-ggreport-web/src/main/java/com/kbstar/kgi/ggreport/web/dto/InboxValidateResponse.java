package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code POST /inbox/{batch}/validate} 의 응답.
 *
 * <p>⚠️ 코퍼스 검사({@link CorpusValidateResponse})와 달리 <b>경고가 없다.</b>
 * 배치는 형식 계약이라 "애매하지만 통과"가 존재하지 않는다(설계 §⑨-6).
 * 오류가 있어도 <b>200</b> 이고, 거절은 반입 쪽에서만 일어난다(422).
 */
public class InboxValidateResponse {

    private boolean ok;
    private List<String> errors;
    private String batchId;

    public InboxValidateResponse() {
    }

    public InboxValidateResponse(String batchId, List<String> errors) {
        this.batchId = batchId;
        this.errors = errors;
        this.ok = errors.isEmpty();
    }

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }

    public List<String> getErrors() { return errors; }
    public void setErrors(List<String> errors) { this.errors = errors; }

    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }
}
