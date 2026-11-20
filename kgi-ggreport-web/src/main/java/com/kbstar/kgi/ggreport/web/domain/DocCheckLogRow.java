package com.kbstar.kgi.ggreport.web.domain;

/** DOC_CHECK_LOG 한 줄(057, 추가 전용). empName 은 읽기 때 USERS 에서 붙는다(저장 칸 아님). */
public class DocCheckLogRow {
    private String taskId;
    private int seqNo;
    private String eventCd;
    private String nameKey;
    private String fileSha256;
    private String foundInstId;
    private String locKind;
    private Integer locNo;
    private Integer openCount;
    private Integer notCheckedCount;
    private Integer partialCount;
    private String empNo;
    private int empVerified;
    private String screenId;
    private String buttonId;
    private int uiValid;
    private String actedAt;
    private String empName;

    public String getTaskId() { return taskId; }
    public void setTaskId(String v) { taskId = v; }
    public int getSeqNo() { return seqNo; }
    public void setSeqNo(int v) { seqNo = v; }
    public String getEventCd() { return eventCd; }
    public void setEventCd(String v) { eventCd = v; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String v) { nameKey = v; }
    public String getFileSha256(){ return fileSha256; }
    public void setFileSha256(String v) { fileSha256 = v; }
    public String getFoundInstId() { return foundInstId; }
    public void setFoundInstId(String v) { foundInstId = v; }
    public String getLocKind() { return locKind; }
    public void setLocKind(String v) { locKind = v; }
    public Integer getLocNo() { return locNo; }
    public void setLocNo(Integer v) { locNo = v; }
    public Integer getOpenCount() { return openCount; }
    public void setOpenCount(Integer v) { openCount = v; }
    public Integer getNotCheckedCount() { return notCheckedCount; }
    public void setNotCheckedCount(Integer v) { notCheckedCount = v; }
    public Integer getPartialCount() { return partialCount; }
    public void setPartialCount(Integer v) { partialCount = v; }
    public String getEmpNo() { return empNo; }
    public void setEmpNo(String v) { empNo = v; }
    public int getEmpVerified() { return empVerified; }
    public void setEmpVerified(int v) { empVerified = v; }
    public String getScreenId() { return screenId; }
    public void setScreenId(String v) { screenId = v; }
    public String getButtonId() { return buttonId; }
    public void setButtonId(String v) { buttonId = v; }
    public int getUiValid() { return uiValid; }
    public void setUiValid(int v) { uiValid = v; }
    public String getActedAt() { return actedAt; }
    public void setActedAt(String v) { actedAt = v; }
    public String getEmpName() { return empName; }
    public void setEmpName(String v) { empName = v; }
}
