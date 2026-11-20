package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.*;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.TargetResultMapper;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;

/**
 * 협약 성과(NEXT 104) — 목표 연도별 성공·실패·대기·미등록·뺀 곳. 읽기 전용, 금고 약정(039) 줄만 근거(추정 없음).
 * ⚠️ 역할은 X-Emp-No 자기신고 위의 업무 규칙이다(사칭 방지 아님). 403 은 '이 모아 보기'만 막는다 — map 보기 권한이 있는 사람은
 * 기존 API(/bid-targets, history, /bank-contracts/summary, bank-years)로 같은 원자료를 이미 읽는다(원자료 차단이 아님, security F2).
 */
@Service
public class TargetResultService {
    public static final String DENIED_MSG = "협약 성과 모아 보기는 영업부서와 전산 계열만 볼 수 있습니다.";
    /** 응답의 주 담당 이름(개인별 성과표가 될 수 있음, security F4). 사용자 11-20: 성공·실패 표에 담당자 이름을 붙이지 않는다 — false 면 owner_name 은 null(키는 유지), true 로 바꾸면 이름을 낸다. */
    static final boolean SHOW_OWNER = false;
    static final int TARGET_MAX = 2000, LINE_MAX = 20000;
    private static final String SERVER_TEAM = "전산";
    private static final String MASKED = "기타(가림)";

    private final TargetResultMapper mapper;
    private final BidTargetMapper targets;   // selectNoticeLastForYear 읽기만(다른 세션 소유 — 수정 없음)

    public TargetResultService(TargetResultMapper mapper, BidTargetMapper targets) {
        this.mapper = mapper;
        this.targets = targets;
    }

    /**
     * 허용 목록. 영업 계열(Teams.isSalesFamily = 영업팀·영업팀장·영업부장·디자이너) + 전산 계열(전산팀·전산팀장, 11-19 시스템 전체 보기 전용).
     * 알려진 역할(Teams.ROLES)이어야 한다 — 모르는 역할·이름이 바뀐 역할·NBSP 가 붙은 값은 거부(닫힌 쪽으로 실패).
     */
    public static boolean canView(String role) {
        String r = HeadRules.roleOf(role);
        return Teams.ROLES.contains(r) && (Teams.isSalesFamily(r) || SERVER_TEAM.equals(Teams.teamOf(r)));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> report(String yearRaw) {
        LocalDate today = LocalDate.parse(Times.todayKst());
        int thisYear = today.getYear();
        int year = BidTargetService.yearParam(yearRaw, thisYear);

        List<BidTarget> rows = mapper.selectGoalRows(year, new RowBounds(0, TARGET_MAX + 1));
        boolean truncated = rows.size() > TARGET_MAX;
        if (truncated) rows = rows.subList(0, TARGET_MAX);
        List<BankContract> lineRows = mapper.selectLinesForYear(year, new RowBounds(0, LINE_MAX + 1));
        if (lineRows.size() > LINE_MAX) throw new ApiException(409, "집계할 약정 기록이 너무 많습니다. 담당자에게 알려 주세요.");
        Map<String, List<BankContract>> lines = new HashMap<String, List<BankContract>>();
        for (BankContract c : lineRows) {
            List<BankContract> l = lines.get(c.getInstitutionId());
            if (l == null) { l = new ArrayList<BankContract>(); lines.put(c.getInstitutionId(), l); }
            l.add(c);
        }
        Map<String, NoticeRoundView> notices = new HashMap<String, NoticeRoundView>();
        if (year == thisYear) {
            for (NoticeRoundView n : targets.selectNoticeLastForYear(year)) {
                if (!notices.containsKey(n.getInstitutionId())) notices.put(n.getInstitutionId(), n);
            }
        }
        Map<String, BidPrep> preps = new HashMap<String, BidPrep>();   // 기관별 최신(쿼리가 UPDATED_AT 내림차순)
        // 확정 시각은 UTC ISO 문자열(Times.iso) — 한국 시각 그 해 = [(Y-1)-12-31T15:00:00, Y-12-31T15:00:00). 'Z' 없이 접두 비교(저장값이 더 길어 경계가 정확).
        String confirmFrom = (year - 1) + "-12-31T15:00:00", confirmTo = year + "-12-31T15:00:00";
        for (BidPrep p : mapper.selectPrepsForYear(year, confirmFrom, confirmTo)) {
            if (!preps.containsKey(p.getInstitutionId())) preps.put(p.getInstitutionId(), p);
        }
        Map<String, String> rankNames = names("BANK_RANK"), srcNames = names("BANK_CONTRACT_SRC");

        Set<String> activeInst = new HashSet<String>();
        for (BidTarget t : rows) if (isActive(t, year)) activeInst.add(t.getInstitutionId());

        int[] n = new int[10];   // 0 target 1 success 2 retain 3 new 4 first 5 second 6 fail 7 pending 8 unreg 9 removed
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        Map<String, BidTarget> removedLatest = new LinkedHashMap<String, BidTarget>();   // 기관당 가장 늦게 뺀 기록 하나(P3-6)
        for (BidTarget t : rows) {
            String inst = t.getInstitutionId();
            if (!isActive(t, year)) {
                if (activeInst.contains(inst)) continue;   // 취소 뒤 같은 해에 다시 넣음 — 살아 있는 쪽만
                if (isCorrection(t, year)) continue;       // 잘못 넣음·중복 취소 = 입력 정정 — '뺀 곳'이 아님
                BidTarget prev = removedLatest.get(inst);
                if (prev == null || newerRemoval(t, prev)) removedLatest.put(inst, t);
                continue;
            }
            List<BankContract> l = lines.get(inst);
            Map<String, Object> basis = year == thisYear ? BidTargetRules.bidClosedBasis(notices.get(inst), l, today) : null;
            TargetResultRules.Verdict v = TargetResultRules.judge(l, t.getTagCd(), year, thisYear, basis);
            n[0]++;
            if (TargetResultRules.SUCCESS.equals(v.resultCd)) {
                n[1]++;
                if (TargetResultRules.RETAIN.equals(v.winKind)) n[2]++; else n[3]++;
                if ("FIRST".equals(v.kbLine.getRankCd())) n[4]++; else if ("SECOND".equals(v.kbLine.getRankCd())) n[5]++;
            } else if (TargetResultRules.FAIL.equals(v.resultCd)) n[6]++;
            else if (TargetResultRules.PENDING.equals(v.resultCd)) n[7]++;
            else n[8]++;
            items.add(itemView(t, v, basis, year == thisYear, preps.get(inst), rankNames, srcNames));
        }

        List<Map<String, Object>> removed = new ArrayList<Map<String, Object>>();
        for (BidTarget t : removedLatest.values()) removed.add(removedView(t, year));
        n[9] = removed.size();

        Map<String, Object> sum = new LinkedHashMap<String, Object>();
        sum.put("target_n", n[0]); sum.put("success_n", n[1]); sum.put("success_retain_n", n[2]); sum.put("success_new_n", n[3]);
        sum.put("success_first_n", n[4]); sum.put("success_second_n", n[5]); sum.put("fail_n", n[6]);
        sum.put("pending_n", n[7]); sum.put("unregistered_n", n[8]); sum.put("removed_n", n[9]);
        int den = n[1] + n[6];
        sum.put("success_rate", den == 0 ? null : Double.valueOf(Math.round(n[1] * 1000.0 / den) / 10.0));
        sum.put("rate_numerator", n[1]); sum.put("rate_denominator", den);

        Map<String, Object> rule = new LinkedHashMap<String, Object>();
        rule.put("judged_by", "금고 약정 기록(039)");
        rule.put("start_window", "약정 시작 월 기준(1월 시작은 전년도 목표)");
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("year", year); out.put("today", today.toString()); out.put("truncated", truncated);
        out.put("rule", rule);
        // F5 — 잘리면 숫자·뺀 곳은 부분 집계라 내지 않는다(화면은 '건수 초과' 안내만).
        out.put("summary", truncated ? null : sum);
        out.put("items", items);
        out.put("removed_items", truncated ? null : removed);
        return out;
    }

    private static boolean isActive(BidTarget t, int year) {
        return BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(t)) && !BidTargetService.ACTION_CANCEL.equals(t.getActionCd())
                && t.getTargetYear() != null && t.getTargetYear().intValue() == year;
    }

    /** a 가 b 보다 늦게 뺀 기록인가(SAVED_AT 은 UTC ISO 문자열 비교, 같으면 목표 번호가 큰 쪽). */
    private static boolean newerRemoval(BidTarget a, BidTarget b) {
        String x = a.getSavedAt() == null ? "" : a.getSavedAt(), y = b.getSavedAt() == null ? "" : b.getSavedAt();
        int r = x.compareTo(y);
        return r > 0 || (r == 0 && a.getTargetNo() > b.getTargetNo());
    }

    /** 그 해 목표를 CANCEL 로 뺀 기록 중 사유가 잘못 넣음(WRONG)·중복(DUP) — 입력 정정이라 '뺀 곳'에서 제외. */
    private static boolean isCorrection(BidTarget t, int year) {
        if (!BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(t)) || !BidTargetService.ACTION_CANCEL.equals(t.getActionCd())) return false;
        if (t.getTargetYear() == null || t.getTargetYear().intValue() != year) return false;
        return "WRONG".equals(t.getCancelReasonCd()) || "DUP".equals(t.getCancelReasonCd());
    }

    private Map<String, String> names(String group) {
        Map<String, String> m = new HashMap<String, String>();
        for (BankContractCode c : mapper.selectCodes(group)) m.put(c.getCode(), c.getCodeName());
        return m;
    }

    private static Map<String, Object> head(BidTarget t) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("institution_id", t.getInstitutionId()); m.put("institution_name", t.getInstitutionName());
        m.put("region_code", t.getRegionCode()); m.put("target_no", t.getTargetNo());
        m.put("tag_cd", t.getTagCd()); m.put("tag_name", t.getTagName());
        m.put("owner_name", SHOW_OWNER ? t.getOwnerName() : null);
        return m;
    }

    private static Map<String, Object> removedView(BidTarget t, int year) {
        Map<String, Object> m = head(t);
        String kind = BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(t)) ? "MOVE_TO_WATCH"
                : (t.getTargetYear() == null || t.getTargetYear().intValue() != year ? "YEAR_CHANGED" : "CANCEL");
        m.put("removed_kind", kind);
        boolean cancel = "CANCEL".equals(kind);
        m.put("reason_cd", cancel ? t.getCancelReasonCd() : null);
        String name = null;
        if (cancel) name = BidTargetRules.CANCEL_ETC.equals(t.getCancelReasonCd()) ? safeFree(t.getCancelReasonEtc()) : t.getCancelReasonName();
        m.put("reason_name", name);
        m.put("removed_at", t.getSavedAt());
        return m;
    }

    /** F3 — 입력 때와 같은 자유 글 검사를 내보내기 직전에 한 번 더(검사 도입 전 옛 행 대비). 걸리면 값을 가린다. */
    static String safeFree(String etc) {
        if (etc == null) return null;
        try {
            new MemoScreen("TARGET_FORBIDDEN", BidTargetRules.FORBIDDEN_MSG).free(etc).name(etc).throwIfAny();
            return etc;
        } catch (ApiException e) {
            return MASKED;
        }
    }

    private static Map<String, Object> itemView(BidTarget t, TargetResultRules.Verdict v, Map<String, Object> basis, boolean thisYear,
                                                BidPrep p, Map<String, String> rankNames, Map<String, String> srcNames) {
        Map<String, Object> m = head(t);
        Map<String, Object> prep = new LinkedHashMap<String, Object>();
        prep.put("kind", p == null ? "NONE" : ("CANCELLED".equals(p.getStateCd()) ? "CANCELLED" : "ACTIVE"));
        prep.put("state_cd", p == null ? null : p.getStateCd());
        prep.put("state_name", p == null ? null : p.getStateName());
        m.put("prep", prep);
        m.put("result_cd", v.resultCd);
        m.put("win_kind", v.winKind);
        m.put("win_kind_basis", v.winKindBasis);
        m.put("win_rank_cd", v.kbLine == null ? null : v.kbLine.getRankCd());
        m.put("win_rank_name", v.kbLine == null ? null : rankNames.get(v.kbLine.getRankCd()));
        List<Map<String, Object>> banks = new ArrayList<Map<String, Object>>();
        for (BankContract c : v.lines) {
            Map<String, Object> b = new LinkedHashMap<String, Object>();
            b.put("rank_cd", c.getRankCd()); b.put("rank_name", rankNames.get(c.getRankCd()));
            b.put("bank_cd", c.getBankCd());
            b.put("bank_name", BankContractRules.BANK_ETC.equals(c.getBankCd()) ? c.getBankNameEtc() : c.getBankName());
            b.put("is_kb", BankYears.KB_BANK.equals(c.getBankCd()));
            b.put("term_from", c.getTermFrom()); b.put("term_to", c.getTermTo());
            banks.add(b);
        }
        m.put("banks", banks);
        if (v.evidence == null) m.put("evidence", null);
        else {
            Map<String, Object> e = new LinkedHashMap<String, Object>();
            e.put("contract_no", v.evidence.getContractNo()); e.put("src_kind_cd", v.evidence.getSrcKind());
            e.put("src_kind_name", srcNames.get(v.evidence.getSrcKind())); e.put("checked_date", v.evidence.getCheckedDate());
            m.put("evidence", e);
        }
        m.put("bid_basis", basis);
        m.put("no_bid", thisYear ? Boolean.valueOf(basis != null && BidTargetRules.BASIS_NO_BID.equals(basis.get("basis_cd"))) : null);
        return m;
    }
}
