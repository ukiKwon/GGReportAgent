package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.dto.MenuDefinition;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 역할별 메뉴 <b>정의와 기본값</b>. Python {@code server/menus.py} 의 이관본이다.
 * 저장된 값은 {@code ROLE_MENUS} 테이블에 있고 여기 값을 덮어쓴다.
 *
 * <p>기본값을 코드에 두는 이유: 빈 운영 DB 에서도 화면이 정상이어야 하고, 나중에
 * 메뉴를 하나 추가했을 때 <b>아무도 그걸 못 보는 상태</b>가 되면 안 된다
 * (DB 에 행이 없다는 것은 '꺼짐'이 아니라 '아직 정하지 않음'이다).
 *
 * <p>⚠️ <b>권한은 화면 노출 제어이지 보안 경계가 아니다.</b> 프로필은 자기신고
 * (localStorage)이고 API 는 그대로 열려 있다. 실제 차단은 폐쇄망 + 앞단 인증이
 * 맡는다. 메뉴를 껐다고 그 데이터가 보호되는 것은 아니다.
 */
public final class Menus {

    private Menus() {
    }

    /** 관리 화면 자신. 이걸 모든 역할에서 끄면 되돌릴 수 없어 저장을 거부한다. */
    public static final String ADMIN_MENU = "admin";

    /**
     * {@code key} 는 탭 버튼 id 의 꼬리({@code tab-btn-<key>})와 같다 — 화면이 그대로
     * 조립한다. {@code serverOnly} 면 {@code file://} 에서는 켜져 있어도 숨는다(API 가
     * 없으므로).
     */
    public static final List<MenuDefinition> MENUS = Collections.unmodifiableList(Arrays.asList(
            new MenuDefinition("map", "전국 지도", false),
            new MenuDefinition("regions", "전국 지역별", false),
            new MenuDefinition("workflow", "워크플로", true),
            new MenuDefinition("chat", "대화", true),
            new MenuDefinition("knowledge", "지식", true),
            new MenuDefinition("tasks", "작업함", true),
            new MenuDefinition("approvals", "결재함", true),
            new MenuDefinition(ADMIN_MENU, "권한관리", true)));

    public static final List<String> MENU_KEYS = menuKeys();

    private static final Map<String, Map<String, Boolean>> DEFAULT_MENUS = defaults();

    /** 모르는 역할(오타·옛 소속)에게 주는 값. 관리 화면이나 결재함을 열어주지 않는다. */
    private static final Map<String, Boolean> FALLBACK_MENUS = row();

    private static List<String> menuKeys() {
        List<String> out = new ArrayList<>();
        for (MenuDefinition m : MENUS) {
            out.add(m.getKey());
        }
        return Collections.unmodifiableList(out);
    }

    /**
     * 켜진 것만 적고 나머지는 꺼진 것으로 채운다.
     *
     * <p>{@code map}·{@code regions} 는 누구나 본다 — 이 시스템의 기본 화면이다.
     */
    private static Map<String, Boolean> row(String... on) {
        Map<String, Boolean> base = new LinkedHashMap<>();
        for (String key : MENU_KEYS) {
            base.put(key, Boolean.FALSE);
        }
        base.put("map", Boolean.TRUE);
        base.put("regions", Boolean.TRUE);
        for (String key : on) {
            base.put(key, Boolean.TRUE);
        }
        return base;
    }

    private static Map<String, Map<String, Boolean>> defaults() {
        Map<String, Map<String, Boolean>> out = new LinkedHashMap<>();
        // 팀원: 자기 작업함 + 협업 도구. 결재는 하지 않는다.
        for (String role : Teams.MEMBER_ROLES) {
            out.put(role, row("workflow", "chat", "knowledge", "tasks"));
        }
        // 팀장: 거기에 결재함.
        for (String role : Teams.LEAD_ROLES) {
            out.put(role, row("workflow", "chat", "knowledge", "tasks", "approvals"));
        }
        // 디자이너: 받은 것을 열어보고 작업물을 올린다. 워크플로 현황판은 필요 없다.
        out.put(Teams.DESIGNER_TEAM, row("chat", "knowledge", "tasks"));
        // 영업부장: 전국 지도 · 결재함 · 대화 셋만(사용자가 직접 고른 조합).
        // 워크플로 현황판도 지역별도 보지 않는다 — 결재에 필요한 맥락은 결재함 카드
        // 안에 통째로 실려 오고, 나머지는 켜고 싶으면 전산팀이 권한관리에서 켠다.
        Map<String, Boolean> head = row("approvals", "chat");
        head.put("regions", Boolean.FALSE);
        out.put(Teams.FINAL_APPROVER, head);
        // 전산팀이 시스템 운영자를 겸한다(사용자 확정).
        out.get("전산팀").put(ADMIN_MENU, Boolean.TRUE);
        return Collections.unmodifiableMap(out);
    }

    /** 그 역할이 볼 메뉴. DB 에 저장된 값이 기본값을 덮어쓴다. */
    public static Map<String, Boolean> menusFor(String role, Map<String, Map<String, Boolean>> overrides) {
        Map<String, Boolean> base = new LinkedHashMap<>(
                DEFAULT_MENUS.containsKey(role) ? DEFAULT_MENUS.get(role) : FALLBACK_MENUS);
        Map<String, Boolean> saved = overrides == null ? null : overrides.get(role);
        if (saved != null) {
            for (Map.Entry<String, Boolean> e : saved.entrySet()) {
                // 정의에서 사라진 옛 메뉴 키는 조용히 무시한다.
                if (base.containsKey(e.getKey())) {
                    base.put(e.getKey(), e.getValue());
                }
            }
        }
        return base;
    }

    public static Map<String, Map<String, Boolean>> allRoles(Map<String, Map<String, Boolean>> overrides) {
        Map<String, Map<String, Boolean>> out = new LinkedHashMap<>();
        for (String role : Teams.ROLES) {
            out.put(role, menusFor(role, overrides));
        }
        return out;
    }
}
