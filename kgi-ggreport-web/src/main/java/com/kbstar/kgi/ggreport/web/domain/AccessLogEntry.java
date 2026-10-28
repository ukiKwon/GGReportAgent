package com.kbstar.kgi.ggreport.web.domain;

/** 접근 이력 1행({@code ACCESS_LOG}). 본문·비밀번호·쿼리값은 담지 않는다. */
public class AccessLogEntry {

    private Long logId;
    private String occurredAt;
    private String empNo;
    private boolean empVerified;
    private String eventType;
    private String httpMethod;
    private String reqPath;
    private Integer statusCode;
    private String clientIp;
    private String userAgent;
    private Integer durationMs;
    private String detail;

    public Long getLogId() { return logId; }
    public void setLogId(Long logId) { this.logId = logId; }

    public String getOccurredAt() { return occurredAt; }
    public void setOccurredAt(String occurredAt) { this.occurredAt = occurredAt; }

    public String getEmpNo() { return empNo; }
    public void setEmpNo(String empNo) { this.empNo = empNo; }

    public boolean isEmpVerified() { return empVerified; }
    public void setEmpVerified(boolean empVerified) { this.empVerified = empVerified; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getReqPath() { return reqPath; }
    public void setReqPath(String reqPath) { this.reqPath = reqPath; }

    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer statusCode) { this.statusCode = statusCode; }

    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }

    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }

    public Integer getDurationMs() { return durationMs; }
    public void setDurationMs(Integer durationMs) { this.durationMs = durationMs; }

    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
