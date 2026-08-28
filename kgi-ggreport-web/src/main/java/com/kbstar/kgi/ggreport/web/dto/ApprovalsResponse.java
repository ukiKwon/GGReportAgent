package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * 결재함 응답. Python {@code {"role": …, "items": [...]}}.
 *
 * <p>{@code role} 을 되돌려주는 이유: 화면이 계정 전환기로 역할을 바꿔 가며 부르는데,
 * 응답만 보고 <b>어느 역할의 결재함인지</b> 알 수 있어야 늦게 도착한 응답이 다른
 * 역할의 화면을 덮는 것을 막을 수 있다.
 */
public class ApprovalsResponse {

    private String role;
    private List<ApprovalItem> items = new ArrayList<>();

    public ApprovalsResponse() {
    }

    public ApprovalsResponse(String role, List<ApprovalItem> items) {
        this.role = role;
        this.items = items;
    }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public List<ApprovalItem> getItems() { return items; }
    public void setItems(List<ApprovalItem> items) { this.items = items; }
}
