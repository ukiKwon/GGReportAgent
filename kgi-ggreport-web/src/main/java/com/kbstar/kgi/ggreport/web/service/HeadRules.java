package com.kbstar.kgi.ggreport.web.service;

import java.util.Set;

/**
 * 기관장 정보(NEXT 72·77, 026)의 권한 규칙 — 순수 로직(DB 없음). ⚠️ 사번·역할은 X-Emp-No 자기신고 위의 업무 규칙이다(사칭 방지가 아니다).
 *
 * <p>충돌 해소(Q1·Q2·M6): 충돌 없는 후보의 확정·기각은 영업팀 누구나(본인 포함 — 이력의 SELF_FLAG 로 드러남). 충돌이 있으면 팀장·부장만 해소하고,
 * 본인이 낸 후보를 본인이 확정할 수 없으며(SELF_RESOLVE), 충돌 상대 확정값의 입력·확정자는 그 후보를 기각해 자기 값을 지킬 수 없다(OWN_VALUE_GUARD).
 * 본인 후보 회수(기각)는 언제나 가능하다. 영업부장은 팀장과 같은 자격·같은 제한이다("팀장 부재" 조건은 두지 않는다 — 서버가 부재를 모른다).
 * <p>'충돌 있음'의 머리 단위 기준은 '현 기관장 있음'이다 — CURRENT 머리가 없거나, 있어도 권한대행 밖 확정 칸·사진이 하나도 없는 빈 머리면
 * 현 기관장 없음으로 보고 충돌이 아니다(11-13 사용자 결정 가, InstitutionHeadService.isEmptyHead).
 */
public final class HeadRules {

    public static final String ROLE_MEMBER = "영업팀";
    public static final String ROLE_LEAD = "영업팀장";
    public static final String ROLE_HEAD = "영업부장";

    public enum Action { CONFIRM, REJECT }

    private HeadRules() {
    }

    public static String roleOf(String role) {
        return role == null ? "" : role.trim();
    }

    /** 기관장 정보를 쓸 수 있는 역할 — 영업팀·영업팀장·영업부장. 그 밖(디자이너·마스터·관리자 등)은 403. */
    public static boolean isSales(String role) {
        String r = roleOf(role);
        return ROLE_MEMBER.equals(r) || ROLE_LEAD.equals(r) || ROLE_HEAD.equals(r);
    }

    public static boolean isLead(String role) {
        String r = roleOf(role);
        return ROLE_LEAD.equals(r) || ROLE_HEAD.equals(r);
    }

    /**
     * 막는 사유 코드(없으면 null). conflict: 후보가 확정값과(또는 다른 열린 후보와) 다르다. owners: 충돌 상대 확정값의 {CREATED_BY, DECIDED_BY}
     * (머리 단위는 현 CURRENT 머리의 두 값). proposer: 후보를 낸 사람(CREATED_BY — 반입 후보는 반입 버튼을 누른 사람).
     */
    public static String blockCode(Action a, String role, String actor, String proposer, Set<String> owners, boolean conflict) {
        boolean self = actor != null && actor.equals(proposer);
        if (a == Action.REJECT && self) {
            return null;   // 본인 후보 회수는 언제나 가능
        }
        if (!conflict) {
            return null;   // Q1: 충돌 없으면 영업팀 누구나(본인 포함, LOG SELF_FLAG=1)
        }
        if (!isLead(role)) {
            return "LEAD_ONLY";
        }
        if (a == Action.CONFIRM && self) {
            return "SELF_RESOLVE";   // 본인이 낸 값은 본인이 확정 못 한다
        }
        if (a == Action.REJECT && owners != null && owners.contains(actor)) {
            return "OWN_VALUE_GUARD";   // 자기 확정값 지키기 차단
        }
        return null;   // 확정값 입력자가 남의 후보를 '확정'(자기 값 양보)하는 것은 허용
    }

    /**
     * 확정값·사진 무효 — 팀장·부장, 또는 그 값을 넣고(creator) 확정도 본인이 한(decidedBy) 사람(11-13 사용자 결정, security 중).
     * 남이 확정한 값은 넣은 사람이라도 팀장·부장만 무효한다. 사진은 확정 단계가 없어 decidedBy=null(올린 사람 기준).
     * 확정자가 비어 있는 옛 행도 넣은 사람 기준이다. ⚠️ 사번·역할은 X-Emp-No 자기신고 위의 업무 규칙이다.
     */
    public static boolean canVoid(String role, String actor, String creator, String decidedBy) {
        if (isLead(role)) {
            return true;
        }
        return actor != null && actor.equals(creator) && (decidedBy == null || actor.equals(decidedBy));
    }
}
