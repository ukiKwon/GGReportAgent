package com.kbstar.kgi.ggreport.web.domain;

/** 디자인 검토 의견 1행(DESIGN_COMMENT, 051) + 작성자 이름(조회용 조인). */
public class DesignComment {

    private int roundNo;
    private String empNo;
    private String name;
    private int seqNo;
    private String body;
    private String createdAt;

    public int getRoundNo() { return roundNo; }
    public void setRoundNo(int v) { this.roundNo = v; }
    public String getEmpNo() { return empNo; }
    public void setEmpNo(String v) { this.empNo = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public int getSeqNo() { return seqNo; }
    public void setSeqNo(int v) { this.seqNo = v; }
    public String getBody() { return body; }
    public void setBody(String v) { this.body = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
