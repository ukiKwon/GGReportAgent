package com.kbstar.kgi.ggreport.web.support;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 팀 이름 ↔ 쪽지 수신자 이름 — 두 이름 체계 사이의 <b>유일한</b> 변환 자리.
 * Python {@code server/teams.py} 의 이관본이다.
 *
 * <p>{@code TASKS.TEAM} 은 {@code 영업} 인데 그래프의 알림은 {@code 영업팀} 앞으로
 * 간다. 이 어긋남을 화면마다 따로 풀면(예: {@code '영업' + '팀'}) 한쪽만 고쳤을 때
 * 조용히 갈라진다 — 계정 전환기와 디자이너 뷰의 '문의' 버튼이 같은 답을 써야 해서
 * 여기로 모았다.
 *
 * <p>⚠️ <b>단계 2에 필요한 것만 옮겼다.</b> {@code compose}/{@code split_role}/
 * {@code positions_for}(프로필 화면이 쓰는 소속×직책 변환)와 {@code lead_of}·
 * {@code is_lead}(결재 라우팅)는 아직 없다 — 단계 4·5에서 그 엔드포인트와 함께 온다.
 */
public final class Teams {

    private Teams() {
    }

    /**
     * 사람이 작성물을 쓰는 3팀. <b>그래프의 역할 목록과 같아야 한다</b> — 참여확정은
     * 이 목록으로 작업을 만들고 5단계는 그래프 쪽 목록으로 만드는데, 이름이 다르면
     * {@code UNIQUE(BID_CASE_ID, TEAM)} 이 못 막아 한 공고에 두 벌이 생긴다
     * (실제로 'IT'와 '전산'이 그랬다).
     */
    public static final List<String> AUTHORING_TEAMS =
            Collections.unmodifiableList(Arrays.asList("영업", "전산", "예산"));

    /**
     * 사람이 아니라 <b>에이전트가 도는 단계</b>의 이름. 이쪽도 {@code TASKS} 행을
     * 갖지만 사람 작성물이 없어, 팀 목록을 그냥 뽑으면 사람 작성물 자리에 섞인다.
     */
    public static final List<String> AGENT_TEAMS =
            Collections.unmodifiableList(Arrays.asList("RFI분석", "취합", "검증"));

    public static final String DESIGNER_TEAM = "디자이너";

    public static final String TEAM_SUFFIX = "팀";
    public static final String LEAD_SUFFIX = "팀장";
    public static final String HEAD_SUFFIX = "부장";

    /** 디자이너는 영업팀 소속(사용자 확정). */
    public static final String DESIGNER_HOME_TEAM = "영업";
    /** 영업부장 — 흐름의 마지막 결재자. */
    public static final String FINAL_APPROVER = DESIGNER_HOME_TEAM + HEAD_SUFFIX;

    /** 영업팀·전산팀·예산팀. */
    public static final List<String> MEMBER_ROLES = withSuffix(AUTHORING_TEAMS, TEAM_SUFFIX);
    /** 영업팀장·전산팀장·예산팀장. */
    public static final List<String> LEAD_ROLES = withSuffix(AUTHORING_TEAMS, LEAD_SUFFIX);

    /**
     * 저장·API·{@code ROLE_MENUS} 가 쓰는 <b>합쳐진 역할 문자열</b> 목록.
     * 소속×직책은 화면에서 고르는 방식이고, 저장은 언제나 이 한 문자열이다 —
     * 둘로 쪼개 저장하면 이미 쌓인 프로필·알림 수신자가 전부 갈라진다.
     */
    public static final List<String> ROLES = allRoles();

    private static List<String> withSuffix(List<String> teams, String suffix) {
        List<String> out = new ArrayList<>();
        for (String team : teams) {
            out.add(team + suffix);
        }
        return Collections.unmodifiableList(out);
    }

    private static List<String> allRoles() {
        List<String> out = new ArrayList<>(MEMBER_ROLES);
        out.addAll(LEAD_ROLES);
        out.add(DESIGNER_TEAM);
        out.add(FINAL_APPROVER);
        return Collections.unmodifiableList(out);
    }

    /** 사람이 글을 쓰는 팀인가. 디자이너가 '문의'할 상대이기도 하다. */
    public static boolean isAuthoringTeam(String team) {
        return !AGENT_TEAMS.contains(team);
    }

    /**
     * 작업의 팀 이름을 <b>그 팀이 실제로 쪽지를 받는 이름</b>으로 바꾼다.
     *
     * <p>아는 팀({@code 영업}·{@code 전산}·{@code 예산})이면 {@code 팀} 접미사가
     * 답이다 — 수신자 목록을 뒤지지 않는다. <b>팀장 역할이 생기면서 이게 필요해졌다</b>:
     * {@code startsWith} 로 아무거나 고르면 {@code 전산} → {@code 전산팀장} 이 걸려,
     * 전산 팀원인 사람이 계정 전환기에 <b>팀장으로</b> 나온다(데모에서 실제로 그랬다).
     *
     * <p>모르는 값(에이전트 단계 이름 등)은 기존 추론을 쓰되 <b>가장 짧은 후보</b>를
     * 고른다 — 긴 쪽은 대개 더 좁은 역할이라 원래 팀과 다른 사람이 된다.
     */
    public static String inboxName(String team, List<String> recipients) {
        if (recipients.contains(team)) {
            return team;
        }
        if (AUTHORING_TEAMS.contains(team)) {
            return team + TEAM_SUFFIX;
        }
        String best = null;
        for (String r : recipients) {
            if (r.equals(team) || !r.startsWith(team)) {
                continue;
            }
            if (best == null || r.length() < best.length()
                    || (r.length() == best.length() && r.compareTo(best) < 0)) {
                best = r;
            }
        }
        return best != null ? best : team;
    }
}
