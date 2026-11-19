package com.kbstar.kgi.ggreport.web.domain;

/** BOARD_MINUTES_REV 한 행(047) — 수정 이력. OLD_TEXT·NEW_TEXT 는 저장 때 가린 글만. editedByName 은 JOIN 으로만 채워진다. */
public class BoardMinutesRev {
    private Long minutesId;
    private int revNo;
    private String targetKind;
    private Integer targetNo;
    private String fieldCd;
    private String oldText;
    private String newText;
    private String editedBy;
    private String editedByName;
    private String editedAt;

    public Long getMinutesId() { return minutesId; }
    public void setMinutesId(Long v) { this.minutesId = v; }
    public int getRevNo() { return revNo; }
    public void setRevNo(int v) { this.revNo = v; }
    public String getTargetKind() { return targetKind; }
    public void setTargetKind(String v) { this.targetKind = v; }
    public Integer getTargetNo() { return targetNo; }
    public void setTargetNo(Integer v) { this.targetNo = v; }
    public String getFieldCd() { return fieldCd; }
    public void setFieldCd(String v) { this.fieldCd = v; }
    public String getOldText() { return oldText; }
    public void setOldText(String v) { this.oldText = v; }
    public String getNewText() { return newText; }
    public void setNewText(String v) { this.newText = v; }
    public String getEditedBy() { return editedBy; }
    public void setEditedBy(String v) { this.editedBy = v; }
    public String getEditedByName() { return editedByName; }
    public void setEditedByName(String v) { this.editedByName = v; }
    public String getEditedAt() { return editedAt; }
    public void setEditedAt(String v) { this.editedAt = v; }
}
