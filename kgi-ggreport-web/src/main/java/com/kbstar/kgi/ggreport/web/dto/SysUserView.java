package com.kbstar.kgi.ggreport.web.dto;

import com.kbstar.kgi.ggreport.web.domain.SysUser;

import java.util.ArrayList;
import java.util.List;

/**
 * 사용자 관리 화면용 — {@link SysUser} + 결재라인 해석.
 *
 * <p>{@code approverState}: {@code AUTO_OK}(자동으로 정해짐) · {@code TOP}(최상위) ·
 * {@code NEEDS}(자동 불가 — 지정 필요, 사유는 {@code approverNote}) · {@code MANUAL_OK}(지정됨) ·
 * {@code MANUAL_INVALID}(지정한 결재자가 더는 활성이 아님 — 재지정 필요).
 */
public class SysUserView extends SysUser {

    private String approverMode;
    private String approverName;
    private String approverState;
    private String approverNote;
    private List<Step> chain = new ArrayList<>();

    public static class Step {
        private final String empNo;
        private final String name;
        private final String positionTitle;
        private final String status;

        public Step(String empNo, String name, String positionTitle, String status) {
            this.empNo = empNo;
            this.name = name;
            this.positionTitle = positionTitle;
            this.status = status;
        }

        public String getEmpNo() { return empNo; }
        public String getName() { return name; }
        public String getPositionTitle() { return positionTitle; }
        public String getStatus() { return status; }
    }

    public String getApproverMode() { return approverMode; }
    public void setApproverMode(String approverMode) { this.approverMode = approverMode; }
    public String getApproverName() { return approverName; }
    public void setApproverName(String approverName) { this.approverName = approverName; }
    public String getApproverState() { return approverState; }
    public void setApproverState(String approverState) { this.approverState = approverState; }
    public String getApproverNote() { return approverNote; }
    public void setApproverNote(String approverNote) { this.approverNote = approverNote; }
    public List<Step> getChain() { return chain; }
    public void setChain(List<Step> chain) { this.chain = chain; }
}
