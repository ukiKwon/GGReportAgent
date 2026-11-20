package com.kbstar.kgi.ggreport.web.domain;

/** DOC_CHECK_HIT 한 줄(057). 파일 속 글은 없다. */
public class DocCheckHitRow {
    private String taskId;
    private String nameKey;
    private String foundInstId;
    private String locKind;
    private int locNo;
    private int hitCount;

    public String getTaskId() { return taskId; }
    public void setTaskId(String v) { taskId = v; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String v) { nameKey = v; }
    public String getFoundInstId() { return foundInstId; }
    public void setFoundInstId(String v) { foundInstId = v; }
    public String getLocKind() { return locKind; }
    public void setLocKind(String v) { locKind = v; }
    public int getLocNo() { return locNo; }
    public void setLocNo(int v) { locNo = v; }
    public int getHitCount() { return hitCount; }
    public void setHitCount(int v) { hitCount = v; }
}
