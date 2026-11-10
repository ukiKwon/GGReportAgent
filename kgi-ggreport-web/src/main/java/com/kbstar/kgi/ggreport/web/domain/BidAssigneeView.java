package com.kbstar.kgi.ggreport.web.domain;

/** 현재 담당자 1명(BID_ASSIGNMENT ACTIVE_YN=1 + USERS 이름·직위). */
public class BidAssigneeView {

    private String empNo;
    private String name;
    private String positionTitle;
    private String assignedAt;

    public String getEmpNo() { return empNo; }
    public void setEmpNo(String v) { this.empNo = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getPositionTitle() { return positionTitle; }
    public void setPositionTitle(String v) { this.positionTitle = v; }
    public String getAssignedAt() { return assignedAt; }
    public void setAssignedAt(String v) { this.assignedAt = v; }
}
