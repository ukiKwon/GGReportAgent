package com.kbstar.kgi.ggreport.web.support;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

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
            new Type("BOARD_FINAL", "이사회 자료 최종 확정", false, "작성자 → 팀장 → 부장"),
            new Type("MATCH_MEMBERS", "과제 매칭 — 멤버 구성", false,
                    "요청 팀 → 상대 부서장(부서장 부재 시 팀장급 대결 가능)"),
            new Type("FINAL_SUBMIT", "최종 확인·제출 확정", false, "팀장 → 부장")));

    public static Type find(String key) {
        for (Type t : ALL) {
            if (t.getKey().equals(key)) {
                return t;
            }
        }
        return null;
    }
}
