package com.kbstar.kgi.ggreport.web.dto;

/**
 * 정합성 점검이 찾아낸 어긋남 1건. 골든 {@code 07}(빈 목록)·{@code 28}.
 *
 * <p>{@code why} 는 <b>규칙이 왜 있는지</b>, {@code message} 는 <b>이 기관에서 무엇이</b>
 * 어긋났는지다. 둘을 함께 줘야 사람이 고칠 수 있다 — 규칙 이름만으로는 무엇을
 * 해야 하는지 알 수 없다.
 */
public class ConsistencyFinding {

    private String institutionId;
    private String nameKo;
    private String rule;
    private String why;
    private String message;

    public ConsistencyFinding() {
    }

    public ConsistencyFinding(String institutionId, String nameKo,
                              String rule, String why, String message) {
        this.institutionId = institutionId;
        this.nameKo = nameKo;
        this.rule = rule;
        this.why = why;
        this.message = message;
    }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getNameKo() { return nameKo; }
    public void setNameKo(String nameKo) { this.nameKo = nameKo; }

    public String getRule() { return rule; }
    public void setRule(String rule) { this.rule = rule; }

    public String getWhy() { return why; }
    public void setWhy(String why) { this.why = why; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
