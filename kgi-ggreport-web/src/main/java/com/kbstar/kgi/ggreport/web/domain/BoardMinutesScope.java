package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_SCOPE 한 행(047) — 공개범위(사람 단위). name·status 는 USERS JOIN 으로만 채워진다. */
public class BoardMinutesScope {
    private Long minutesId;
    private String grantType;
    private String grantValue;
    private String grantUntil;
    private String grantedBy;
    private String grantedAt;
    private String name;
    private String status;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public String getGrantType() { return grantType; }
    public void setGrantType(String v) { this.grantType = v; }
    public String getGrantValue() { return grantValue; }
    public void setGrantValue(String v) { this.grantValue = v; }
    public String getGrantUntil() { return grantUntil; }
    public void setGrantUntil(String v) { this.grantUntil = v; }
    public String getGrantedBy() { return grantedBy; }
    public void setGrantedBy(String v) { this.grantedBy = v; }
    public String getGrantedAt() { return grantedAt; }
    public void setGrantedAt(String v) { this.grantedAt = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
}
