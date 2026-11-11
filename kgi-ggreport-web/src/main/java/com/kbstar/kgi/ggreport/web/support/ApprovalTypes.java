package com.kbstar.kgi.ggreport.web.support;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 결재 유형 카탈로그. 원칙: <b>기능을 쓰는 것은 결재하지 않고, 확정·신청만 결재한다</b>
 * (예: 이사회 자료를 올려 작성하는 것은 기능, 최종으로 확정하는 것은 결재).
 *
 * <p>{@code submittable} 인 유형만 지금 상신할 수 있다. 나머지는 해당 기능(이사회 자료·과제 매칭·제출)이
 * 구현될 때 상신 버튼과 후처리를 붙인다 — 결재선 설계만 여기 적어 둔다.
 */
public final class ApprovalTypes {

    private ApprovalTypes() {
    }

    public static final String PERM_REQUEST = "PERM_REQUEST";
    public static final String ASSIGNEE_CHANGE = "ASSIGNEE_CHANGE";
    public static final String BOARD_SUBMIT = "BOARD_SUBMIT";
    /** 사전준비 개설 신청(NEXT 70) — 승인되면 지명자가 담당자로 배정되고 사전준비가 시작된다. */
    public static final String BID_OPEN = "BID_OPEN";
    /** 사전준비 기획승인(NEXT 70) — 영업부장 고정. 승인이 5번 게이트(기획승인) 통과다. */
    public static final String PREP_APPROVAL = "PREP_APPROVAL";

    /** 대결 승인을 허용하지 않는 유형 — 결재자 본인만 승인한다(019 담당자 변경). 기존 유형 동작은 그대로다. */
    public static final Set<String> NO_PROXY =
            Collections.unmodifiableSet(new HashSet<String>(
                    Arrays.asList(ASSIGNEE_CHANGE, BOARD_SUBMIT, BID_OPEN, PREP_APPROVAL)));

    /** 사전준비(NEXT 70)가 쓰는 유형 — 영업팀 내부 정보라 관리자 전체 목록·타인 취소에서 제외한다. */
    public static boolean isPrep(String key) {
        return BID_OPEN.equals(key) || PREP_APPROVAL.equals(key);
    }

    public static final class Type {
        private final String key;
        private final String label;
        private final boolean submittable;
        private final String line;

        Type(String key, String label, boolean submittable, String line) {
            this.key = key;
            this.label = label;
            this.submittable = submittable;
            this.line = line;
        }

        public String getKey() { return key; }
        public String getLabel() { return label; }
        public boolean isSubmittable() { return submittable; }
        public String getLine() { return line; }
    }

    public static final List<Type> ALL = Collections.unmodifiableList(Arrays.asList(
            new Type(PERM_REQUEST, "권한 신청", true,
                    "신청자 → 상위 결재자(팀장) → (시스템 관리·결재 권한이 포함되면) 시스템 관리자 확인"),
            new Type("MATCH_MEMBERS", "과제 매칭 — 멤버 구성", false,
                    "요청 팀 → 상대 부서장(부서장 부재 시 팀장급 대결 가능)"),
            new Type("FINAL_SUBMIT", "최종 확인·제출 확정", false, "팀장 → 부장"),
            new Type(ASSIGNEE_CHANGE, "담당자 변경", true,
                    "담당자(또는 영업팀장) → 영업팀장 (영업팀장이 관련되면 영업부장) · 대결 불가"),
            new Type(BOARD_SUBMIT, "이사회 자료 제출", true,
                    "담당자 → 영업팀장 (영업팀장이 관련되면 영업부장) · 대결 불가"),
            new Type(BID_OPEN, "사전준비 개설 신청", true,
                    "신청자 → 영업팀장 (신청자·지명자 중 영업팀장이 있으면 영업부장) · 대결 불가"),
            new Type(PREP_APPROVAL, "사전준비 기획승인", true,
                    "담당자 → 영업부장 · 대결 불가")));

    public static Type find(String key) {
        for (Type t : ALL) {
            if (t.getKey().equals(key)) {
                return t;
            }
        }
        return null;
    }
}
