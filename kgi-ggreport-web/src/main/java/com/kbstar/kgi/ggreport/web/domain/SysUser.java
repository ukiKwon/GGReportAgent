package com.kbstar.kgi.ggreport.web.domain;

/** 사용자 1행({@code USERS}). 이름이 {@code User} 가 아닌 것은 Spring Security 등과의 혼동을 피하려는 것이다. */
public class SysUser {

    private String empNo;
    private String name;
    private String role;
    private String positionTitle;
    private String approvalGrade;
    /** 상위 결재자 사번. NULL = 최상위이거나 아직 정해지지 않음(상태는 서비스가 판정). */
    private String approverEmpNo;
    /** 0 = 팀·직위로 자동 결정, 1 = 관리자가 지정. */
    private int approverManual;
    private String status;
    private int failedLogins;
    private String lastLoginAt;
    private String createdAt;
    private String updatedAt;

    public String getEmpNo() { return empNo; }
    public void setEmpNo(String empNo) { this.empNo = empNo; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getPositionTitle() { return positionTitle; }
    public void setPositionTitle(String positionTitle) { this.positionTitle = positionTitle; }

    public String getApprovalGrade() { return approvalGrade; }
    public void setApprovalGrade(String approvalGrade) { this.approvalGrade = approvalGrade; }

    public String getApproverEmpNo() { return approverEmpNo; }
    public void setApproverEmpNo(String approverEmpNo) { this.approverEmpNo = approverEmpNo; }
    public int getApproverManual() { return approverManual; }
    public void setApproverManual(int approverManual) { this.approverManual = approverManual; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getFailedLogins() { return failedLogins; }
    public void setFailedLogins(int failedLogins) { this.failedLogins = failedLogins; }

    public String getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(String lastLoginAt) { this.lastLoginAt = lastLoginAt; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
