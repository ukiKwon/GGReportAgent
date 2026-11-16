package com.kbstar.kgi.ggreport.web.domain;

/** 권한 변경 이력 1행({@code PERM_CHANGE_LOG}). */
public class PermChange {

    private Long chgId;
    private String changedAt;
    private String actorEmpNo;
    private String targetEmpNo;
    private String item;
    private String beforeValue;
    private String afterValue;
    private String targetRole;                 // 역할×메뉴 격자 변경 행(이때 targetEmpNo 는 null) — 036
    private String screenId = "UNKNOWN";       // 어느 화면(AdminUiIds 허용 목록, 밖이면 UNKNOWN)
    private String buttonId = "UNKNOWN";       // 어느 버튼
    private boolean uiValid;
    private boolean empVerified;               // 앞단 인증 주체면 true, X-Emp-No 자기신고면 false

    public Long getChgId() { return chgId; }
    public void setChgId(Long chgId) { this.chgId = chgId; }

    public String getChangedAt() { return changedAt; }
    public void setChangedAt(String changedAt) { this.changedAt = changedAt; }

    public String getActorEmpNo() { return actorEmpNo; }
    public void setActorEmpNo(String actorEmpNo) { this.actorEmpNo = actorEmpNo; }

    public String getTargetEmpNo() { return targetEmpNo; }
    public void setTargetEmpNo(String targetEmpNo) { this.targetEmpNo = targetEmpNo; }

    public String getItem() { return item; }
    public void setItem(String item) { this.item = item; }

    public String getBeforeValue() { return beforeValue; }
    public void setBeforeValue(String beforeValue) { this.beforeValue = beforeValue; }

    public String getAfterValue() { return afterValue; }
    public void setAfterValue(String afterValue) { this.afterValue = afterValue; }

    public String getTargetRole() { return targetRole; }
    public void setTargetRole(String targetRole) { this.targetRole = targetRole; }

    public String getScreenId() { return screenId; }
    public void setScreenId(String screenId) { this.screenId = screenId; }

    public String getButtonId() { return buttonId; }
    public void setButtonId(String buttonId) { this.buttonId = buttonId; }

    public boolean isUiValid() { return uiValid; }
    public void setUiValid(boolean uiValid) { this.uiValid = uiValid; }

    public boolean isEmpVerified() { return empVerified; }
    public void setEmpVerified(boolean empVerified) { this.empVerified = empVerified; }
}
