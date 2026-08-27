package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code GET /consistency}. 골든 {@code 07}({@code {"findings": [], "ok": true}})·{@code 28}.
 *
 * <p>{@code ok} 는 {@code findings} 가 비었다는 뜻이다 — 화면이 목록 길이를 다시
 * 세지 않게 서버가 판단해서 준다.
 */
public class ConsistencyResponse {

    private List<ConsistencyFinding> findings;
    private boolean ok;

    public ConsistencyResponse() {
    }

    public ConsistencyResponse(List<ConsistencyFinding> findings) {
        this.findings = findings;
        this.ok = findings.isEmpty();
    }

    public List<ConsistencyFinding> getFindings() { return findings; }
    public void setFindings(List<ConsistencyFinding> findings) { this.findings = findings; }

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }
}
