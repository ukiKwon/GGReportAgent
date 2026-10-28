package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/** 시스템 관리 API 의 요청 본문 모음. JSON 키는 snake_case 다(JacksonConfig). */
public final class SysAdminIn {

    private SysAdminIn() {
    }

    public static class Login {
        private String empNo;
        public String getEmpNo() { return empNo; }
        public void setEmpNo(String empNo) { this.empNo = empNo; }
    }

    public static class Screen {
        private String screen;
        public String getScreen() { return screen; }
        public void setScreen(String screen) { this.screen = screen; }
    }

    public static class UserForm {
        private String empNo;
        private String name;
        private String role;
        private String positionTitle;
        private String approvalGrade;

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
    }

    public static class Status {
        private String status;
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
    }

    /** 메뉴 하나의 권한 4칸. 바뀐 메뉴만 보낸다(통째로 덮어쓰지 않는다). */
    public static class PermChanges {
        private List<Perm> changes = new ArrayList<>();
        public List<Perm> getChanges() { return changes; }
        public void setChanges(List<Perm> changes) { this.changes = changes; }
    }

    public static class Perm {
        private String menu;
        private boolean view;
        private boolean write;
        private boolean edit;
        private boolean approve;

        public String getMenu() { return menu; }
        public void setMenu(String menu) { this.menu = menu; }
        public boolean isView() { return view; }
        public void setView(boolean view) { this.view = view; }
        public boolean isWrite() { return write; }
        public void setWrite(boolean write) { this.write = write; }
        public boolean isEdit() { return edit; }
        public void setEdit(boolean edit) { this.edit = edit; }
        public boolean isApprove() { return approve; }
        public void setApprove(boolean approve) { this.approve = approve; }
    }
}
