package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.BidTargetSettings;
import com.kbstar.kgi.ggreport.web.domain.*;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetMoveIn;
import com.kbstar.kgi.ggreport.web.dto.BidTermIn;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDate;
import java.util.*;

/**
 * 올해 목표 기관(043, 입찰 현황판 재설계 1단계) — 추가 전용, 결재 없음. 넣기 = 새 TARGET_NO, 고치기 = 같은 번호 새 REV, 빼기 = CANCEL 행.
 * 기관 행 FOR UPDATE 로 직렬화(039 와 같은 잠금). 쓰기 자격 = 기관 레코드 수정 권한 AND 영업 계열 — BankContractService.canEdit 와 같은 두 줄(복제,
 * 나중에 PermissionService 한 메서드로 올릴 것). 빼기도 영업 계열 누구나(사용자 11-17 "누구나 넣고 뺌").
 * 감사 = 행마다 수정자·이름 스냅샷·자기신고 여부·화면·버튼·시각(039 방식). ⚠️ 사번은 X-Emp-No 자기신고일 수 있다(사칭 방지 아님).
 * 태그 기본값은 화면이 판정해 보낸다(근거 LOFIN_2026·KB_VERIFIED 가 화면 자료) — 서버는 코드표만 확인한다.
 * 연도별 유치 상태는 새 표 없이 039 줄에서 계산한다({@link BankYears}).
 */
@Service
public class BidTargetService {

    static final String ACTION_SAVE = "SAVE";
    static final String ACTION_CANCEL = "CANCEL";
    static final String ACTION_MOVE = "MOVE";   // 044 — 목표↔관심 옮기기(같은 번호 새 REV 한 행)
    static final String ACTION_CARRY = "CARRY";            // 056 — 자동 이월 REV 1
    static final String CANCEL_CARRY_REVOKED = "CARRY_REVOKED";   // 056 — 이월 자동 취소 사유(코드표 ENABLED=0, 서버만 씀)
    static final int CARRY_MAX_INST = 300;                 // 한 번 호출에 처리할 기관 상한(넘으면 more=true, 화면이 한 번 더)
    public static final String DIRECT_ROLE = "ROLE", DIRECT_VALUE_EDIT = "VALUE_EDIT", DIRECT_WATCH = "WATCH";   // 바로 반영 근거(NEXT 114)
    public static final String APPROVAL_MSG = "목표 기관 정보를 바꾸려면 결재가 필요합니다. 체크한 뒤 [결재 요청]으로 올려 주세요.";
    private static final String WATCH_DUP_MSG = "이미 관심 기관입니다.";
    static final String NOT_OWNER_MSG = "다른 사람의 관심 기관은 바꿀 수 없습니다.";
    static final String WATCH_USER_MSG = "등록된 사용자만 관심 기관을 쓸 수 있습니다.";
    public static final String SRC_GIVEN = "GIVEN", SRC_NONE = "NONE";   // 061 ♥ 구분 출처(접근 이력용). NEXT 114 ⑥ — 안 오면 서버가 정하지 않고 비운다(NONE)
    private static final String KIND_EDIT_MSG = "목표·관심 구분을 바꾸려면 옮기기를 써 주세요.";
    static final String CLOSED_MSG = "이 기관은 올해 입찰이 끝난 것으로 기록되어 있어 올해 목표로 넣을 수 없습니다. 관심 기관이나 다음 해 목표로 넣을 수 있습니다. 정보가 틀리면 '입찰 공고 현황'에서 고쳐 주세요.";
    static final int HISTORY_MAX = 200;
    static final int SUMMARY_MAX = 5000;
    static final int NO_MAX = 999999;   // TARGET_NO·REV_NO 칸(6자리)
    public static final String DENIED_MSG = "올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.";
    static final String OWNER_MSG = "주 담당은 영업부서 직원 중에서 골라 주세요.";
    private static final String YEAR_MSG = "연도는 YYYY 형식(1990~2100)이어야 합니다.";
    static final String LIMIT_MSG = "이 기관의 목표 기록이 더 늘릴 수 없는 한도에 닿았습니다.";

    private final BidTargetMapper mapper;
    private final SysUserMapper users;
    private final PermissionService permissions;
    private final PrepMapper preps;   // 진행 중 제안(입찰 종료 예외) — 읽기만
    private final int delayDays;
    private final BidTargetSettings settings;
    private final TransactionTemplate readTx, writeTx;

    public BidTargetService(BidTargetMapper mapper, SysUserMapper users, PermissionService permissions, PrepMapper preps,
                            BidTargetSettings settings, PlatformTransactionManager txm,
                            @Value("${ggreport.bid-board.delay-days:30}") int delayDays) {
        if (delayDays < 1 || delayDays > 180) throw new IllegalStateException("ggreport.bid-board.delay-days must be between 1 and 180");
        this.mapper = mapper;
        this.users = users;
        this.permissions = permissions;
        this.preps = preps;
        this.delayDays = delayDays;
        this.settings = settings;
        // 기본 전파(REQUIRED): 컨트롤러에서 부르면 트랜잭션 밖이라 execute 마다 새 트랜잭션. carry() 에 @Transactional 을 붙이지 않는다(S2).
        this.readTx = new TransactionTemplate(txm);
        this.readTx.setReadOnly(true);
        this.writeTx = new TransactionTemplate(txm);
    }

    /** 결재 없이 목표를 바로 바꿀 수 있나 — 영업부장(사용자 11-20 ①). 스위치를 끄면 영업 계열 전원. ⚠️ 자기신고 위의 업무 규칙. */
    boolean directGoal(SysUser u) {
        if (u == null || !HeadRules.isSales(u.getRole())) return false;
        return !settings.isApprovalRequired() || HeadRules.ROLE_HEAD.equals(HeadRules.roleOf(u.getRole()));
    }

    static ApiException pendingConflict(BidTarget cur) { return conflict("CHANGE_PENDING", BidTargetKeys.TARGET_PENDING_MSG, cur); }

    static final String PREP_ACTIVE_MSG = "제안을 준비 중인 기관은 목표 기관에서 제외하거나 관심 기관으로 옮길 수 없습니다. 제안 준비 화면에서 중단한 뒤 다시 하세요.";

    /**
     * 11-27 — 진행 중 제안 준비 건(활성 상태 = PrepNobidService.ACTIVE_STATES: CONFIRMED·OPEN_PENDING·IN_PROGRESS·APPROVAL_PENDING·WRITABLE·WRITING)이
     * 있는 기관은 목표 제외(CANCEL)·관심 이동(TO_WATCH)을 할 수 없다 → 409 PREP_ACTIVE. 기관 잠금 안에서 부른다.
     */
    void requireNoActivePrep(String inst) { requireNoActivePrep(inst, PREP_ACTIVE_MSG); }

    /** 결재 승인 시점용 문장(결재자에게 보이는 말). 코드는 같은 PREP_ACTIVE. */
    static final String PREP_ACTIVE_APPROVE_MSG = "요청 뒤 이 기관의 제안 준비가 시작되어 반영할 수 없습니다. 반려하고, 담당이 제안 준비를 정리한 뒤 다시 요청하게 해 주세요.";

    void requireNoActivePrep(String inst, String message) {
        List<String> caseIds = preps.selectActiveCaseIdsByInstitution(inst);
        if (caseIds.isEmpty()) return;
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "PREP_ACTIVE");
        d.put("message", message);
        d.put("latest", null);
        d.put("institution_ids", Collections.singletonList(inst));
        d.put("bid_case_ids", new ArrayList<String>(caseIds));
        throw ApiException.withDetail(409, d);
    }

    /**
     * NEXT 125 — 결재 중 잠금은 건 단위(사용자 11-26 ③): 결재 중인 그 목표 건(TARGET_NO)만 막는다. 새로 넣기(cur == null)는
     * 칸 검사 checkGoalSlots(SLOT_PENDING)가 막는다. 기관 잠금 안에서 부른다.
     */
    void requireNoPending(String inst, BidTarget cur) {
        if (cur != null && mapper.countPendingByTarget(inst, cur.getTargetNo()) > 0) throw pendingConflict(cur);
    }

    /** S9 — 역할 때문에 거절하는 것이라 403(+code). 컨트롤러가 ACCESS_LOG DENIED 로 남긴다. */
    private void requireDirect(Actor actor, BidTarget cur) {
        if (!directGoal(users.selectByEmpNo(actor.getEmpNo()))) throw detail(403, "APPROVAL_REQUIRED", APPROVAL_MSG, cur);
    }

    /**
     * 061 — 관심 기록은 주인만 고치고 옮기고 뺀다. 목표 기록은 보지 않는다. 403 에 latest 를 싣지 않는다(남의 기록 정보 비노출).
     * 호출 순서: cur == null 확인 바로 다음, ALREADY_CANCELLED·STALE 보다 먼저(security 중-1). ⚠️ 자기신고 사번 위의 업무 규칙.
     */
    static void requireWatchOwner(BidTarget cur, String empNo) {
        if (BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(cur)) && (empNo == null || !empNo.equals(cur.getWatchEmpNo()))) {
            throw detail(403, "NOT_WATCH_OWNER", NOT_OWNER_MSG, null);
        }
    }

    /** 컨트롤러 403 과 list() 의 can_edit·can_cancel 이 이 함수 하나를 쓴다. ⚠️ 자기신고 위의 업무 규칙. */
    @Transactional(readOnly = true)
    public boolean canEdit(String empNo) {
        if (empNo == null || !permissions.canEditInstitution(empNo)) return false;
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && HeadRules.isSales(u.getRole());
    }

    // ---- 조회 ----

    @Transactional(readOnly = true)
    public Map<String, Object> list(String yearRaw, String empNo) {
        LocalDate today = today();
        int thisYear = today.getYear();
        int year = yearParam(yearRaw, thisYear);
        boolean edit = canEdit(empNo);
        String goalMode = !edit ? null : directGoal(users.selectByEmpNo(empNo)) ? "DIRECT" : "APPROVAL";
        List<BidTargetReqItem> pendAll = mapper.selectPendingItems();
        Map<String, BidTargetReqItem> pending = pendingMap(pendAll);
        Map<String, List<BankContract>> lines = byInstitution(mapper.selectContractsForYear(year));
        Map<String, NoticeRoundView> notices = new HashMap<String, NoticeRoundView>();
        if (year == thisYear) {
            for (NoticeRoundView n : mapper.selectNoticeLastForYear(year)) {
                if (!notices.containsKey(n.getInstitutionId())) notices.put(n.getInstitutionId(), n);
            }
        }
        Map<String, BidTerm> terms = new HashMap<String, BidTerm>();
        for (BidTerm t : mapper.selectTermsForYear(year)) terms.put(t.getInstitutionId(), t);
        // NEXT 125 — 목표 건 줄: 이은 공고(명시·추정)·건 상태·펼침 줄 값. /preps 열람 범위(영업 계열·디자이너)에만 제안 건 값을 싣는다(security 11절 4)
        SysUser viewer = users.selectByEmpNo(empNo);
        boolean seePrep = viewer != null && Teams.isSalesFamily(viewer.getRole());
        List<BidTarget> goals = mapper.selectActiveByYear(year);
        List<TargetCaseRef> caseList = mapper.selectCasesForYear(year);
        Map<String, TargetCaseRef> cases = new HashMap<String, TargetCaseRef>();
        for (TargetCaseRef c : caseList) cases.put(c.getBidCaseId(), c);
        Map<String, Map<String, String>> marks = new HashMap<String, Map<String, String>>();
        for (PrepBoardCheck k : preps.selectStageMarks()) {
            Map<String, String> m = marks.get(k.getBidCaseId());
            if (m == null) { m = new HashMap<String, String>(); marks.put(k.getBidCaseId(), m); }
            m.put(k.getColCd(), k.getMarkCd());
        }
        Map<String, String> inferred = BidTargetKeys.infer(goals, caseList, marks);
        // 펼침 줄의 공고일·마감 — 기관 최신 '찾은 공고'(EXT_CHECK). 지난해 목표 줄은 옛 공고와 섞지 않는다
        Map<String, ExtCheck> notice = new HashMap<String, ExtCheck>();
        if (year >= thisYear) for (ExtCheck n : mapper.selectLatestNotices()) notice.put(n.getInstitutionId(), n);
        Set<String> goalInsts = new HashSet<String>();
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (BidTarget t : goals) {
            List<BankContract> l = lines.get(t.getInstitutionId());
            String subj = t.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : t.getBidSubjectCd();
            boolean main = BidSubjects.MAIN_BANK.equals(subj);   // 공고 상태(037)·약정(039)·개시일은 금고 주기 — 금고 밖 건은 '—'(null)
            Map<String, Object> v = view(t, false, edit);
            v.put("edited_by_other", editedByOther(t));
            v.put("can_cancel", edit);
            // 사용자 11-26 ④ — 현 금고 은행은 금고 건에만, 그 순위 줄로(1·2금고 건은 그 순위만, 단수·주거래·기타·미정은 전체). 금고 밖 = null
            List<BankContract> rl = main ? BidTargetKeys.linesFor(l, t.getAimRankCd()) : null;
            v.put("bank", main ? BankYears.summary(rl, today) : null);
            v.put("next_term_to", main ? BidTargetRules.nextTermTo(rl, today) : null);
            // 올해 목표에만 — 서버 근거(공고 상태·금고 약정). 진행 중 제안 여부는 화면이 줄의 제안 단계로 함께 본다.
            Map<String, Object> closed = main && year == thisYear ? BidTargetRules.bidClosedBasis(notices.get(t.getInstitutionId()), l, today, t.getTagCd()) : null;   // 072 수의계약이면 입찰 없음 ≠ 끝남
            v.put("bid_closed", closed);
            BidTerm tm = main ? terms.get(t.getInstitutionId()) : null;   // INST_BID_TERM = 금고 건의 RFP 협약 개시일
            boolean has = tm != null && ACTION_SAVE.equals(tm.getActionCd());
            v.put("term_start", has ? tm.getTermStart() : null);                 // RFP 협약 개시일(기록)
            v.put("term_rev_no", tm == null ? 0 : tm.getRevNo());                // 개시일 저장의 base_rev_no
            v.put("judge_from", !main ? null : has ? tm.getTermStart()
                    : settings.getCarryDefaultStart().atYear(year + 1).toString());   // 협약 성과 달성 판정일·관심 이월 기준일(기록 없으면 추정)
            v.put("judge_from_assumed", main && !has);
            String link = t.getBidCaseId(), basis = link == null ? null : "LINKED";
            String key = t.getInstitutionId() + "#" + t.getTargetNo();
            if (link == null && inferred.containsKey(key)) { link = inferred.get(key); basis = "INFERRED"; }
            TargetCaseRef c = link == null ? null : cases.get(link);
            Map<String, String> mk = c == null || !marks.containsKey(c.getBidCaseId()) ? Collections.<String, String>emptyMap() : marks.get(c.getBidCaseId());
            boolean active = c != null && PrepStage5.blocking(c.getStateCd(), mk);
            String[] st = c == null ? new String[]{PrepStage5.BEFORE, null} : PrepStage5.of(c.getStateCd(), c.getOpenedAt(), mk);
            String rc = PrepStage5.resultCd(mk.get("RESULT"));
            v.put("bid_case_id", seePrep ? link : null);
            v.put("link_basis", seePrep ? basis : null);
            v.put("prep_state_cd", seePrep && c != null ? c.getStateCd() : null);
            v.put("case_status", seePrep ? (c == null ? PrepStage5.ST_NONE : PrepStage5.status(c.getStateCd(), c.getOpenedAt(), mk)) : null);   // '상태' 열(사용자 11-26 ①)
            v.put("stage5_cd", seePrep ? st[0] : null);
            v.put("end_kind", seePrep ? st[1] : null);
            v.put("result_cd", seePrep ? rc : null);
            v.put("result_recheck", seePrep && PrepStage5.R_UNDECIDED.equals(rc));   // 옛 '완료' — 담당이 선정/탈락을 다시 고름
            v.put("rank_locked", seePrep && "LINKED".equals(basis) && active && t.getAimRankCd() != null);
            v.put("prep_cleanup_needed", seePrep && main && active && closed != null && BidTargetRules.BASIS_NO_BID.equals(closed.get("basis_cd"))
                    && !kbNow(rl, today));   // 입찰 없음 + 타행 유지인데 진행 중 준비(사용자 11-26 Q2ⓐ)
            // 펼침 줄(사용자 11-26 ③) — 공고명은 이은 건 제목을 먼저, 없으면 금고 건만 기관 최신 찾은 공고 제목. 공고일·마감은 금고 건에만(수집 검색어가 금고 문맥뿐), 금고 밖 = null('—')
            ExtCheck nt = main ? notice.get(t.getInstitutionId()) : null;
            String caseTitle = c != null ? BidSubjects.blankToNull(c.getBidTitle()) : BidSubjects.blankToNull(t.getBidTitle());
            v.put("bid_title", caseTitle != null ? caseTitle : nt == null ? null : BidSubjects.blankToNull(nt.getTitle()));   // null = 공고 전(화면 표기)
            v.put("notice_posted_at", nt == null ? null : dateOnly(nt.getPostedAt()));       // 공고일 YYYY-MM-DD(형식 밖이면 null)
            v.put("notice_deadline_at", nt == null ? null : dateOnly(nt.getDeadlineAt()));   // 접수 마감
            v.put("notice_basis", nt == null ? null : "INST_NOTICE");                       // 기관 최신 찾은 공고(1·2금고 두 줄은 같은 값일 수 있다)
            // 주 담당 이름 = view() 의 owner_name(열람자 모두 — 지금 목록 규칙), 사번은 쓰기 자격자에게만(그대로)
            v.put("change_mode", goalMode);
            v.put("aim_mode", aimMode(t, edit, goalMode, thisYear));   // 063 — 이 줄의 금고 방식 고르기: DIRECT|APPROVAL|null
            putPending(v, pending.get(t.getInstitutionId() + "#" + t.getTargetNo()), edit);   // 결재 중 = 그 건(사용자 11-26 ③)
            goalInsts.add(t.getInstitutionId());
            items.add(v);
        }
        Map<String, List<BankContract>> wlines = byInstitution(mapper.selectContractsForWatch(empNo));
        List<Map<String, Object>> watch = new ArrayList<Map<String, Object>>();
        for (BidTarget t : mapper.selectActiveWatch(empNo)) {   // 061 — 내 관심만
            List<BankContract> l = wlines.get(t.getInstitutionId());
            Map<String, Object> v = view(t, false, edit);
            v.put("edited_by_other", editedByOther(t));
            v.put("can_cancel", edit);
            v.put("bank", BankYears.summary(l, today));
            v.put("next_term_to", BidTargetRules.nextTermTo(l, today));
            v.put("change_mode", edit ? "DIRECT" : null);
            putPending(v, pending.get(t.getInstitutionId() + "#" + t.getTargetNo()), edit);
            watch.add(v);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("year", year);
        out.put("today", today.toString());
        out.put("delay_days", delayDays);
        out.put("can_edit", edit);
        out.put("selectable_years", selectableYears(thisYear));
        out.put("items", items);
        out.put("goal_case_n", items.size());                                           // NEXT 125 — 머리 숫자: 건 수 + 기관 수
        out.put("goal_institution_n", goalInsts.size());
        out.put("multi_subject", settings.isMultiSubject());                            // 화면이 '입찰 대상'·1+2금고 나누기를 보일지
        out.put("watch_items", watch);
        out.put("pending_goal_items", pendingGoalItems(pendAll, year));   // NEXT 114 — 줄이 없는 기관의 '목표 기관 결재 대기' 표시용(팀 공유)
        out.put("goal_change_mode", goalMode);                                          // 목표 넣기 버튼: DIRECT|APPROVAL|null
        out.put("value_edit_mode", edit ? "DIRECT" : null);                            // 목표 구분·메모 고치기: 쓰기 자격자는 결재 없이(NEXT 114)
        out.put("carry_due", edit && year == thisYear ? carryPlan(today).size() : 0);  // >0 이면 화면이 POST /bid-targets/carry 한 번
        out.put("carry_default_start", settings.defaultStartText());
        out.put("codes", codes());
        return out;
    }

    /** 결재 중 항목 → 열쇠 "기관#목표건번호"(건 단위, 사용자 11-26 ③). 번호가 없는 ADD 항목은 pending_goal_items 로만 나간다. */
    private static Map<String, BidTargetReqItem> pendingMap(List<BidTargetReqItem> all) {
        Map<String, BidTargetReqItem> m = new HashMap<String, BidTargetReqItem>();
        for (BidTargetReqItem x : all) {
            if (x.getTargetNo() == null) continue;
            String k = x.getInstitutionId() + "#" + x.getTargetNo();
            if (!m.containsKey(k)) m.put(k, x);
        }
        return m;
    }

    private static boolean kbNow(List<BankContract> l, LocalDate today) {
        if (l == null) return false;
        for (BankContract c : l) if (BankYears.KB_BANK.equals(c.getBankCd()) && "CURRENT".equals(BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today))) return true;
        return false;
    }

    /** 'YYYY-MM-DD…' 앞 10자를 엄격히 읽는다 — 형식 밖이면 null(원문을 내보내지 않는다, PrepBoardService.noticeDeadlines 와 같은 규칙). */
    static String dateOnly(String s) {
        if (s == null || s.trim().length() < 10) return null;
        try { return LocalDate.parse(s.trim().substring(0, 10)).toString(); } catch (RuntimeException e) { return null; }
    }

    /**
     * NEXT 114 — 그 해 목표가 되려고 결재 중인 기관(넣기·관심→목표·연도 바꾸기, TO_YEAR = year). 기관당 1개, 기관 id·연도만
     * (요청자·사유·번호 없음 — 결재 중 여부는 모두에게라는 S8 과 같은 범위). PrepService.requireGoalTarget 의 countPendingGoalForYear 와 같은 판정.
     */
    static List<Map<String, Object>> pendingGoalItems(List<BidTargetReqItem> all, int year) {
        Set<String> seen = new HashSet<String>();
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BidTargetReqItem x : all) {
            String op = x.getOpCd();
            boolean toGoal = TargetChangeService.OP_ADD.equals(op) || TargetChangeService.OP_TO_GOAL.equals(op) || TargetChangeService.OP_EDIT.equals(op);
            String subj = x.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : x.getBidSubjectCd();
            // NEXT 125 — 같은 기관이라도 대상·금고 순위가 다른 결재 중 건은 따로(건 단위)
            if (!toGoal || x.getToYear() == null || x.getToYear().intValue() != year || !seen.add(x.getInstitutionId() + "|" + subj + "|" + x.getAimRankCd())) continue;
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("institution_id", x.getInstitutionId());
            m.put("target_year", year);
            m.put("bid_subject_cd", subj);
            m.put("aim_rank_cd", x.getAimRankCd());
            out.add(m);
        }
        return out;
    }

    /** S8 — 결재 중 여부는 모두에게, 상세(요청 번호·동작·요청자 이름)는 쓰기 자격자에게만. */
    private static void putPending(Map<String, Object> v, BidTargetReqItem x, boolean edit) {
        v.put("change_pending", x != null);
        if (edit && x != null) {
            Map<String, Object> p = new LinkedHashMap<String, Object>();
            p.put("req_id", x.getReqId()); p.put("op_cd", x.getOpCd());
            p.put("requested_by_name", x.getRequesterName()); p.put("created_at", x.getReqCreatedAt());
            v.put("change_pending_info", p);
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> history(String instRaw, String empNo) {
        String inst = requireInstId(instRaw);
        if (mapper.selectInstitution(inst) == null) throw ApiException.notFound("institution not found");
        // 061 — 남의 관심 기록은 SQL 에서 걸러 한도가 목표 이력을 못 밀어내게 한다(security 중-2). 상한+1개를 읽어 정확히 판정(QA P3-2)
        List<BidTarget> rows = mapper.selectHistory(inst, empNo, new RowBounds(0, HISTORY_MAX + 1));
        boolean truncated = rows.size() > HISTORY_MAX;
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        boolean edit = canEdit(empNo);
        for (BidTarget t : truncated ? rows.subList(0, HISTORY_MAX) : rows) {
            Map<String, Object> v = view(t, true, false);
            if (edit) { v.put("requested_by_name", t.getRequestedByName()); v.put("first_requested_by_name", t.getFirstRequestedByName()); }
            items.add(v);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", inst);
        out.put("items", items);
        out.put("truncated", truncated);
        return out;
    }

    /** 기관 상세 '연도별 금고 은행' 연표. 기본 범위 = 올해-16 ~ 올해+4, 최대 40년. */
    @Transactional(readOnly = true)
    public Map<String, Object> bankYears(String instRaw, String fromRaw, String toRaw) {
        String inst = requireInstId(instRaw);
        if (mapper.selectInstitution(inst) == null) throw ApiException.notFound("institution not found");
        LocalDate today = today();
        int from = yearParam(fromRaw, today.getYear() - BankYears.DEFAULT_BACK);
        int to = yearParam(toRaw, today.getYear() + BankYears.DEFAULT_AHEAD);
        if (from > to || to - from + 1 > BankYears.MAX_SPAN) {
            throw ApiException.badRequest("연도 범위는 시작이 끝보다 늦지 않게, 최대 40년까지 고를 수 있습니다.");
        }
        List<BankContract> lines = mapper.selectContractsOf(inst);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", inst);
        out.put("today", today.toString());
        out.put("from", from);
        out.put("to", to);
        out.put("summary", BankYears.summary(lines, today));
        out.put("years", BankYears.table(lines, from, to));
        return out;
    }

    /**
     * 현황판용 — 039 기록이 있는 기관마다 지금 줄·국민은행 상태(NEXT 94① kbboard endOpts().direct 자리).
     * 상한(SUMMARY_MAX 줄)을 넘으면 마지막 기관 묶음은 줄이 잘렸을 수 있어 결과에서 뺀다(불완전한 kb_now 판정 금지, 보안 S1). truncated=true 유지.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> bankSummary() {
        LocalDate today = today();
        // 상한+1개를 읽어 정확히 판정(QA P3-2): 정확히 상한이면 truncated=false. 넘으면 마지막 묶음(여분 1줄이 든 기관)만 뺀다.
        List<BankContract> all = mapper.selectContractsAll(new RowBounds(0, SUMMARY_MAX + 1));
        boolean truncated = all.size() > SUMMARY_MAX;
        Map<String, List<BankContract>> grouped = byInstitution(all);
        if (truncated && !grouped.isEmpty()) {
            String lastKey = null;
            for (String k : grouped.keySet()) lastKey = k;   // LinkedHashMap — 정렬 순서상 마지막 기관
            grouped.remove(lastKey);
        }
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (Map.Entry<String, List<BankContract>> e : grouped.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("institution_id", e.getKey());
            m.putAll(BankYears.summary(e.getValue(), today));
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("today", today.toString());
        out.put("items", items);
        out.put("truncated", truncated);
        return out;
    }

    // ---- 쓰기 ----

    /** 호출 전에 컨트롤러가 requireInstitutionEdit 와 {@link #canEdit} 를 지난다. */
    @Transactional
    public Map<String, Object> save(String instRaw, BidTargetIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        if (in == null) throw ApiException.badRequest("저장할 내용이 없습니다.");
        // ⚠️ 첫 DB 문장은 기관 행 잠금(MySQL RR 첫 일관 읽기 — BankContractService.save 와 같은 이유). 위에 SELECT 를 끼우지 않는다.
        BankContractInst ref = mapper.lockInstitution(inst);
        if (ref == null) throw ApiException.notFound("institution not found");
        LocalDate today = today();
        int thisYear = today.getYear();
        BidTarget cur = null;
        if (in.getTargetNo() != null) {
            cur = mapper.selectLatestTarget(inst, in.getTargetNo());
            if (cur == null) throw ApiException.notFound("target not found");
            requireWatchOwner(cur, actor.getEmpNo());   // 061 — 관심 고치기는 주인만(valueOnly 경로 포함, 구분·메모 고치기도 같다)
            if (ACTION_CANCEL.equals(cur.getActionCd())) {
                throw conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다. 다시 넣으려면 새로 추가하세요.", cur);
            }
            if (in.getBaseRevNo() == null) throw ApiException.badRequest("고칠 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
            if (in.getBaseRevNo() != cur.getRevNo()) {
                throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", cur);
            }
        }
        String kind = cur == null ? BidTargetRules.kind(in.getKindCd()) : BidTargetRules.kindOf(cur);
        if (cur != null && in.getKindCd() != null && !kind.equals(BidTargetRules.kind(in.getKindCd()))) throw ApiException.badRequest(KIND_EDIT_MSG);
        boolean watch = BidTargetRules.KIND_WATCH.equals(kind);
        // NEXT 125 — 금고 순위가 건 키라 스위치가 켜지면 넣을 때 고른다(1금고·2금고). 꺼짐 = 옛 063 규칙(넣을 때 금고 방식은 비운다, 관심은 parseWatch 가 400)
        if (cur == null && !watch && !settings.isMultiSubject()) BidTargetRules.requireNoAimOnAdd(in.getAimRankCd());
        if (watch && BidTargetKeys.subjectGiven(in.getBidSubjectCd(), in.getBidSubjectEtc())) throw ApiException.badRequest(BidTargetKeys.WATCH_SUBJECT_MSG);
        String[] subj = watch ? new String[]{BidSubjects.MAIN_BANK, null}
                : cur == null ? BidTargetKeys.subject(in.getBidSubjectCd(), in.getBidSubjectEtc(), codeCheck())
                : fixedSubject(cur, in.getBidSubjectCd(), in.getBidSubjectEtc());
        if (!watch) BidTargetKeys.requireSubjectAllowed(subj[0], cur == null, settings.isMultiSubject());
        BidTargetRules.Parsed p = watch ? BidTargetRules.parseWatch(in, codeCheck())
                : BidTargetRules.parse(in, thisYear, cur == null ? null : cur.getTargetYear(), codeCheck());
        BidTargetRules.keepUnsent(p, in.getMemo(), in.getAimRankCd(), cur);   // NEXT 114 — 빠진 메모·금고 방식은 지금 값 그대로
        String ownerName = ownerName(p.owner, cur);
        if (cur != null && BidTargetRules.same(cur, p)) {
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("saved", false);
            out.put("code", "NO_CHANGE");
            out.put("target_no", cur.getTargetNo());
            out.put("rev_no", cur.getRevNo());
            return out;
        }
        Integer year = watch ? null : Integer.valueOf(p.year);
        if (!watch) BidTargetKeys.requireRankFits(subj[0], p.aim);
        if (!watch) requireYearUnlinked(cur, year);   // 팀 결정 — 입찰 건에 이어진 목표는 연도를 못 바꾼다
        requireNoPending(inst, cur);
        if (watch && cur == null) requireNoMyToWatchPending(inst, actor.getEmpNo());   // qa P2-1 — watchOn 과 같은 검사
        boolean fillCaseRank = !watch && checkRankLock(cur, p.aim);   // 진행 중 제안과 이어진 건의 순위 잠금. 미정→값은 한 번 허용(true = 공고 순위도 채움)
        if (watch) checkWatchOverlap(inst, cur == null ? 0 : cur.getTargetNo(), actor.getEmpNo());
        else checkGoalSlots(inst, Collections.singletonList(new BidTargetKeys.Slot(cur == null ? 0 : cur.getTargetNo(), year, subj[0], subj[1], p.aim)), null, null);   // 바로 반영이어도 키 판정은 거친다(사용자 11-26 ①)
        Map<String, Object> warning = null;
        boolean mainSubject = BidSubjects.MAIN_BANK.equals(subj[0]);   // 공고 종료(037)·약정(039)은 금고 주기 — 그 밖 대상은 보지 않는다
        if (!watch && mainSubject && p.year == thisYear && (cur == null || !year.equals(cur.getTargetYear()))) warning = closedCheck(inst, today, p.tag);
        // 072 security 5 — 올해 목표에서 구분을 '수의계약 → 입찰'로 바로 고치면 입찰 끝남 검사를 다시 받는다(근거가 있으면 409, 진행 중 제안이 있으면 경고)
        else if (!watch && mainSubject && p.year == thisYear && cur != null && BidTargetRules.tagPrivate(cur.getTagCd()) && !BidTargetRules.tagPrivate(p.tag)) warning = closedCheck(inst, today, p.tag);
        boolean valueEdit = BidTargetRules.valueOnlyEdit(cur, p, thisYear);
        String aimEdit = BidTargetRules.aimEdit(cur, p);
        boolean roleDirect = !watch && directGoal(users.selectByEmpNo(actor.getEmpNo()));   // 영업부장 등 역할상 바로 가능(security F4)
        if (!watch && !valueEdit) requireDirect(actor, cur);   // 목표 넣기·연도·주 담당 = 결재(관심·구분·메모는 바로, NEXT 114). 결재 중 잠금은 위 requireNoPending
        int newNo = cur == null ? mapper.selectMaxTargetNo(inst) + 1 : cur.getTargetNo();
        int newRev = cur == null ? 1 : cur.getRevNo() + 1;
        if (newNo > NO_MAX || newRev > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, cur);   // S4 — 6자리 칸 넘침은 DB 오류가 아니라 409
        BidTarget row = new BidTarget();
        row.setInstitutionId(inst);
        row.setTargetNo(newNo);
        row.setRevNo(newRev);
        row.setActionCd(ACTION_SAVE);
        row.setKindCd(kind);
        row.setTargetYear(year);
        row.setTagCd(p.tag);
        row.setMemo(p.memo);
        row.setOwnerEmpNo(p.owner);
        row.setOwnerName(ownerName);
        row.setWatchEmpNo(watch ? actor.getEmpNo() : null);   // 고치기면 위 requireWatchOwner 로 주인 = 본인
        row.setAimRankCd(p.aim);
        row.setAimRankEtc(p.aimEtc);
        row.setBidSubjectCd(subj[0]); row.setBidSubjectEtc(subj[1]);
        row.setBidCaseId(cur == null ? null : cur.getBidCaseId());   // 새 행 객체 — 이은 공고를 잃지 않게 옮긴다
        Map<String, Object> out = insert(row, actor, ui);
        if (fillCaseRank) mapper.updateCaseRankIfNull(cur.getBidCaseId(), p.aim);
        out.put("mode", "DIRECT");
        out.put("direct_basis", watch ? DIRECT_WATCH : roleDirect ? DIRECT_ROLE : DIRECT_VALUE_EDIT);
        if (aimEdit != null) out.put("aim_edit", aimEdit);   // FIRST|CHANGE|CLEAR — 접근 이력 종류(값 아님)
        // 072 security 5 — 입찰 ↔ 수의계약이 바뀌면 접근 이력에 전·후 구분 코드(코드표 코드, 개인정보 아님)
        if (cur != null && BidTargetRules.tagPrivate(cur.getTagCd()) != BidTargetRules.tagPrivate(p.tag)) out.put("tag_flip", tagOrDash(cur.getTagCd()) + ">" + tagOrDash(p.tag));
        if (warning != null) out.put("warning", warning);
        return out;
    }

    /**
     * 목표↔관심 옮기기(044) — 같은 번호의 새 REV 한 행(ACTION_CD=MOVE). 태그·메모·주 담당은 그대로 옮긴다.
     * 관심→목표는 연도 필수(올해~+2), 올해면 입찰 종료 검사. 목표→관심은 연도를 비우고, 다른 '현재' 목표가 남아 있으면 409.
     */
    @Transactional
    public Map<String, Object> move(String instRaw, String targetNoRaw, BidTargetMoveIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        int no = requireTargetNo(targetNoRaw);
        if (in == null || in.getBaseRevNo() == null) throw ApiException.badRequest("옮길 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
        String to = BidTargetRules.moveKind(in.getToKindCd());
        BankContractInst ref = mapper.lockInstitution(inst);   // 첫 DB 문장
        if (ref == null) throw ApiException.notFound("institution not found");
        BidTarget cur = mapper.selectLatestTarget(inst, no);
        if (cur == null) throw ApiException.notFound("target not found");
        requireWatchOwner(cur, actor.getEmpNo());   // 061 — 관심→목표는 주인만
        if (ACTION_CANCEL.equals(cur.getActionCd())) throw conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다.", cur);
        if (in.getBaseRevNo() != cur.getRevNo()) throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 옮겨 주세요.", cur);
        if (to.equals(BidTargetRules.kindOf(cur))) throw ApiException.badRequest("이미 그 구분에 있는 기록입니다.");
        requireNoPending(inst, cur);   // 결재 중이면 겹침·종료·연도 검사보다 먼저 CHANGE_PENDING
        LocalDate today = today();
        int thisYear = today.getYear();
        boolean toWatch = BidTargetRules.KIND_WATCH.equals(to);
        Integer year = BidTargetRules.moveYear(in.getTargetYear(), toWatch, thisYear);
        if (toWatch) checkWatchOverlap(inst, no, actor.getEmpNo());
        else {
            // NEXT 125 — 관심→목표: 대상은 기본 MAIN_BANK(관심 행은 늘 그렇다), 금고 순위는 관심 행 값을 잇는다. 새 건의 키는 칸 검사가 판정
            String aim = BidSubjects.MAIN_BANK.equals(cur.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : cur.getBidSubjectCd()) ? cur.getAimRankCd() : null;
            checkGoalSlots(inst, Collections.singletonList(new BidTargetKeys.Slot(no, year, cur.getBidSubjectCd(), cur.getBidSubjectEtc(), aim)), null, null);
        }
        Map<String, Object> warning = !toWatch && year.intValue() == thisYear
                && BidSubjects.MAIN_BANK.equals(cur.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : cur.getBidSubjectCd()) ? closedCheck(inst, today, cur.getTagCd()) : null;
        requireDirect(actor, cur);   // 옮기기는 어느 방향이든 목표가 바뀐다
        if (toWatch) requireNoActivePrep(inst);   // 11-27 — 제안 준비 중인 기관은 관심으로 옮길 수 없다
        if (cur.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, cur);
        if (toWatch) clearForWatch(cur);   // 관심 행 = 대상 없음(MAIN_BANK)·기타 이름 없음·공고 연결 없음(앞 REV 에 연결 이력이 남는다)
        cur.setRevNo(cur.getRevNo() + 1);
        cur.setActionCd(ACTION_MOVE);
        cur.setKindCd(to);
        cur.setTargetYear(year);
        cur.setWatchEmpNo(toWatch ? actor.getEmpNo() : null);   // 목표→관심 = 옮긴 사람의 관심, 관심→목표 = 팀 목표(그 사람의 ♥는 꺼진다)
        cur.setCancelReasonCd(null);
        cur.setCancelReasonEtc(null);
        Map<String, Object> out = insert(cur, actor, ui);
        if (warning != null) out.put("warning", warning);
        return out;
    }

    /** 목표→관심: 관심 행은 대상 없음(MAIN_BANK)·기타 이름 없음·공고 연결 없음(security 고칠 것 ④). 앞 REV 에 이력이 남는다. */
    static void clearForWatch(BidTarget cur) {
        cur.setBidCaseId(null);
        cur.setBidSubjectCd(BidSubjects.MAIN_BANK); cur.setBidSubjectEtc(null);
        // 금고 순위·기타 이름은 비우지 않는다 — 관심으로 갔다 와도 금고 방식을 이어받는다(063 기존 동작, 시험이 고정)
    }

    /**
     * NEXT 125 — 목표 건 키 검사(BidTargetKeys). 잠금 안에서 부른다. changes = 바뀐 뒤 모습(no>0 기존 건, no<=0 새 건),
     * removed = 목표에서 빠지는 번호, selfReq = 승인 재검사 때 자기 요청(null = 상신·단건).
     * ① 키를 바꾸는 변경(새 건·연도·대상·순위가 다른 기존 건)이 건드리는 칸에 다른 결재 중 항목이 있으면 409 SLOT_PENDING —
     *    칸마다 결재 중 요청은 많아야 하나라서 두 요청이 각각 통과해 키가 깨지지 않는다(security 정보행). latest 는 싣지 않는다(다른 요청의 건 정보 비노출).
     * ② 바뀐 뒤 모습이 규칙을 어기면 409 DUP_TARGET(코드는 옛 규칙과 같다 — 화면 분기 유지). 061 — 관심은 목표를 막지 않는다.
     */
    void checkGoalSlots(String inst, List<BidTargetKeys.Slot> changes, Set<Integer> removed, Long selfReq) {
        Map<Integer, BidTarget> live = new HashMap<Integer, BidTarget>();
        Map<Integer, BidTargetKeys.Slot> after = new LinkedHashMap<Integer, BidTargetKeys.Slot>();
        for (BidTarget o : mapper.selectActiveByInst(inst)) {
            if (BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(o))) continue;
            live.put(o.getTargetNo(), o);
            after.put(o.getTargetNo(), BidTargetKeys.Slot.of(o));
        }
        Set<String> touched = new HashSet<String>();
        for (BidTargetKeys.Slot s : changes) {
            BidTargetKeys.Slot before = s.no > 0 ? after.get(s.no) : null;
            boolean keyChange = before == null || !before.bucket().equals(s.bucket()) || !Objects.equals(before.aim, s.aim);
            if (!keyChange) continue;
            if (s.year != null) touched.add(s.bucket());
            if (before != null) touched.add(before.bucket());
        }
        if (!touched.isEmpty()) {
            Set<String> pend = BidTargetKeys.pendingBuckets(mapper.selectPendingItemsByInst(inst), selfReq);
            for (String b : touched) if (pend.contains(b)) throw conflict("SLOT_PENDING", BidTargetKeys.SLOT_PENDING_MSG, null);
        }
        if (removed != null) for (Integer n : removed) after.remove(n);
        List<BidTargetKeys.Slot> all = new ArrayList<BidTargetKeys.Slot>();
        for (BidTargetKeys.Slot s : changes) if (s.no > 0) after.remove(s.no);   // 바뀌는 건은 뒤로 — 충돌 때 latest 는 원래 있던(안 바뀐) 건이 먼저
        all.addAll(after.values());
        for (BidTargetKeys.Slot s : changes) if (s.no > 0) all.add(s);
        for (BidTargetKeys.Slot s : changes) if (s.no <= 0) all.add(s);
        BidTargetKeys.Slot bad = BidTargetKeys.conflictOf(all, settings.isMultiSubject());
        if (bad != null) throw conflict("DUP_TARGET", BidTargetKeys.DUP_MSG, bad.no > 0 ? live.get(bad.no) : null);
    }

    /**
     * NEXT 125 — 진행 중 제안과 명시 연결된 건의 금고 순위 잠금(코드만 비교 — 기타 이름만 고치기는 허용).
     * 미정→값은 한 번 허용(true = 공고 순위도 채울 것). 값→다른 값·지움은 409 RANK_LOCKED. 잠금 안.
     */
    boolean checkRankLock(BidTarget cur, String newAim) {
        if (cur == null || cur.getBidCaseId() == null || Objects.equals(cur.getAimRankCd(), newAim)) return false;
        if (cur.getAimRankCd() == null && newAim != null) {   // 미정→값: 이어진 공고에 순위가 이미 있고 다르면 409(TargetLinkService.link 와 같은 규칙, security)
            for (TargetCaseRef c : mapper.selectCasesOfInst(cur.getInstitutionId())) {
                if (cur.getBidCaseId().equals(c.getBidCaseId()) && c.getBidRankCd() != null && !c.getBidRankCd().equals(newAim)) {
                    throw conflict("RANK_MISMATCH", "공고의 금고 순위가 목표 건과 다릅니다.", cur);
                }
            }
        }
        BidPrep p = preps.selectPrep(cur.getBidCaseId());
        if (p == null || !PrepStage5.blocking(p.getStateCd(), stageMarksOf(cur.getBidCaseId()))) return false;
        if (cur.getAimRankCd() != null) throw conflict("RANK_LOCKED", BidTargetKeys.RANK_LOCKED_MSG, cur);
        return true;
    }

    private Map<String, String> stageMarksOf(String bid) {
        Map<String, String> m = new HashMap<String, String>();
        for (PrepBoardCheck c : preps.selectStageMarksOf(bid)) m.put(c.getColCd(), c.getMarkCd());
        return m;
    }

    boolean multiSubject() { return settings.isMultiSubject(); }

    static final String YEAR_LINKED_MSG = "입찰 건에 이어진 목표는 연도를 바꿀 수 없습니다. 연결을 푼 뒤 바꾸세요.";

    /** 팀 결정(11-27) — 입찰 건(BID_CASE_ID)에 이어진 목표 건의 연도 바꾸기는 막는다(단건·결재 상신·승인 모두). 409 YEAR_LINKED. */
    static void requireYearUnlinked(BidTarget cur, Integer newYear) {
        if (cur != null && cur.getBidCaseId() != null && newYear != null && !newYear.equals(cur.getTargetYear())) {
            throw conflict("YEAR_LINKED", YEAR_LINKED_MSG, cur);
        }
    }

    /** 내가 올린 목표→관심(TO_WATCH) 결재가 진행 중이면 409 CHANGE_PENDING(승인 때 ALREADY_WATCH 로 막히지 않게, NEXT 117 P3-a). */
    void requireNoMyToWatchPending(String inst, String empNo) {
        for (BidTargetReqItem x : mapper.selectPendingItemsByInst(inst)) {
            if (TargetChangeService.OP_TO_WATCH.equals(x.getOpCd()) && empNo.equals(x.getRequesterEmpNo())) throw pendingConflict(null);
        }
    }

    /** 고치기 — 대상은 바꿀 수 없다(보냈으면 지금 값과 같아야). 기타가 아닌 건에 이름이 오면 400. */
    static String[] fixedSubject(BidTarget cur, String cdRaw, String etcRaw) {
        String cd = cur.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : cur.getBidSubjectCd();
        if (!BidSubjects.ETC.equals(cd) && etcRaw != null && !etcRaw.trim().isEmpty()) throw ApiException.badRequest(BidTargetKeys.ETC_ONLY_MSG);
        if (BidTargetKeys.subjectGiven(cdRaw, etcRaw)) {
            String c = cdRaw == null || cdRaw.trim().isEmpty() ? BidSubjects.MAIN_BANK : cdRaw.trim();
            if (!c.equals(cd) || (BidSubjects.ETC.equals(cd) && !BidTargetKeys.etcKey(etcRaw).equals(BidTargetKeys.etcKey(cur.getBidSubjectEtc())))) {
                throw ApiException.badRequest(BidTargetKeys.SUBJECT_FIXED_MSG);
            }
        }
        return new String[]{cd, cur.getBidSubjectEtc()};
    }

    /** 061 — 관심은 사람마다 기관당 1개. 남의 관심·팀 목표와는 겹쳐도 된다. 잠금 안에서 부른다. 409 의 latest 는 내 기록이다. */
    void checkWatchOverlap(String inst, int skipNo, String watchEmp) {
        if (watchEmp == null) throw new IllegalStateException("watch owner required");
        for (BidTarget o : mapper.selectActiveByInst(inst)) {
            if (o.getTargetNo() == skipNo) continue;
            if (BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(o)) && watchEmp.equals(o.getWatchEmpNo())) throw conflict("ALREADY_WATCH", WATCH_DUP_MSG, o);
        }
    }

    /** 접근 이력용 — 구분 코드(없으면 '-'). */
    static String tagOrDash(String tag) { return tag == null ? "-" : tag; }

    /** 올해 목표가 될 때 — 서버 근거가 있으면 409 INST_BID_CLOSED. 그 기관에 진행 중 제안이 있으면 막지 않고 warning 을 돌려준다(planner 3-2). 잠금 안에서 부른다. */
    Map<String, Object> closedCheck(String inst, LocalDate today) { return closedCheck(inst, today, null); }

    /** 072 — 그 기관의 마지막 공고 회차가 '입찰 없음' 근거인가(구분과 상관없이). 수의계약 구분이라 통과시켰는지 결재자에게 알리는 데 쓴다. */
    boolean noBidBasis(String inst, LocalDate today) {
        List<NoticeRoundView> ns = mapper.selectNoticeLast(inst);
        Map<String, Object> b = BidTargetRules.bidClosedBasis(ns.isEmpty() ? null : ns.get(0), null, today, null);
        return b != null && BidTargetRules.BASIS_NO_BID.equals(b.get("basis_cd"));
    }

    /** 072 — tag = 그 목표가 가질 구분. 수의계약이면 '입찰 없음'으로는 막지 않는다. */
    Map<String, Object> closedCheck(String inst, LocalDate today, String tag) {
        List<NoticeRoundView> ns = mapper.selectNoticeLast(inst);
        Map<String, Object> basis = BidTargetRules.bidClosedBasis(ns.isEmpty() ? null : ns.get(0), mapper.selectContractsOf(inst), today, tag);
        if (basis == null) return null;
        List<String> active = preps.selectActiveStatesByInstitution(inst);
        if (active.isEmpty()) {
            List<Integer> next = new ArrayList<Integer>();
            for (int y = today.getYear() + 1; y <= today.getYear() + BidTargetRules.YEARS_AHEAD; y++) next.add(y);
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "INST_BID_CLOSED");
            d.put("message", CLOSED_MSG);
            d.put("latest", null);
            d.put("basis", basis);
            d.put("next_years", next);
            throw ApiException.withDetail(409, d);
        }
        Map<String, Object> w = new LinkedHashMap<String, Object>();
        w.put("code", "INST_BID_CLOSED");
        w.put("basis", basis);
        w.put("prep_state_cd", active.get(0));
        return w;
    }

    @Transactional
    public Map<String, Object> cancel(String instRaw, String targetNoRaw, BidTargetCancelIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        int no = requireTargetNo(targetNoRaw);
        if (in == null || in.getBaseRevNo() == null) throw ApiException.badRequest("뺄 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
        BankContractInst ref = mapper.lockInstitution(inst);   // 첫 DB 문장
        if (ref == null) throw ApiException.notFound("institution not found");
        BidTarget cur = mapper.selectLatestTarget(inst, no);
        if (cur == null) throw ApiException.notFound("target not found");
        requireWatchOwner(cur, actor.getEmpNo());   // 061
        if (ACTION_CANCEL.equals(cur.getActionCd())) throw conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다.", cur);
        if (in.getBaseRevNo() != cur.getRevNo()) throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 빼 주세요.", cur);
        requireNoPending(inst, cur);   // 결재 중이면 사유 검사보다 먼저 CHANGE_PENDING
        BidTargetRules.CancelParsed cp = BidTargetRules.parseCancel(in, codeCheck());
        if (!BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(cur))) {
            requireDirect(actor, cur);
            requireNoActivePrep(inst);   // 11-27 — 목표 제외는 제안 준비 중이 아닐 때만(관심 빼기는 해당 없음)
        }
        if (cur.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, cur);   // S4
        cur.setRevNo(cur.getRevNo() + 1);   // 값은 직전 행 그대로, 행동·사유·수정자만 새로
        cur.setActionCd(ACTION_CANCEL);
        cur.setCancelReasonCd(cp.reasonCd);
        cur.setCancelReasonEtc(cp.reasonEtc);
        cur.setBidCaseId(null);   // NEXT 125 — 빼기 REV 는 공고 연결 없음(앞 REV 에 연결 이력이 남는다)
        return insert(cur, actor, ui);
    }

    private Map<String, Object> insert(BidTarget row, Actor actor, BoardUiIds.Ui ui) { return insert(row, actor, ui, null); }

    /** reqId = 결재로 반영할 때 요청 번호(직접·이월은 null). 행 객체를 재사용해도 옛 번호가 따라가지 않게 항상 덮어쓴다. */
    Map<String, Object> insert(BidTarget row, Actor actor, BoardUiIds.Ui ui, Long reqId) {
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !HeadRules.isSales(me.getRole())) throw new ApiException(403, DENIED_MSG);   // 컨트롤러가 먼저 막는다(방어)
        return write(row, me, actor, ui, reqId);
    }

    /** 한 행 쓰기 + 조회 결과. 자격 검사는 부른 쪽(insert = 영업 계열, ♥ = 등록된 ACTIVE 사용자). reqId 는 항상 덮어쓴다. */
    private Map<String, Object> write(BidTarget row, SysUser me, Actor actor, BoardUiIds.Ui ui, Long reqId) {
        if (row.getBidSubjectCd() == null) row.setBidSubjectCd(BidSubjects.MAIN_BANK);   // 066 NOT NULL — NULL 을 넣으면 DEFAULT 가 안 먹는다
        row.setApprovalReqId(reqId);
        row.setEditorEmpNo(actor.getEmpNo());
        row.setEditorName(me.getName());
        row.setEmpVerified(actor.isVerified() ? 1 : 0);
        row.setScreenId(ui.getScreen());
        row.setButtonId(ui.getButton());
        row.setUiValid(ui.isValid() ? 1 : 0);
        row.setSavedAt(Times.nowIso());
        try {
            mapper.insertRow(row);
        } catch (DuplicateKeyException e) {   // 잠금이 있어 정상 경로에선 오지 않는다 — PK 가 마지막 방어선
            throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", null);
        }
        BidTarget saved = mapper.selectLatestTarget(row.getInstitutionId(), row.getTargetNo());   // 조인값(이름·태그 이름·처음 입력자)
        BidTarget shown = saved == null ? row : saved;
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("saved", true);
        out.put("institution_id", row.getInstitutionId());
        out.put("target_no", row.getTargetNo());
        out.put("rev_no", row.getRevNo());
        out.put("action_cd", row.getActionCd());
        out.put("edited_by_other", editedByOther(shown));   // 이번 수정자 ≠ 처음 넣은 사람(사번 없이 참/거짓만, 접근 이력 other=1|0 용)
        out.put("item", view(shown, true, true));
        return out;
    }

    /** 바꾸지 않은 주 담당은 다시 검사하지 않는다(퇴직·이동 뒤에도 메모만 고칠 수 있게). 새로 고른 주 담당은 영업부서 활성 사용자만. */
    String ownerName(String owner, BidTarget cur) {
        if (owner == null) return null;
        if (cur != null && owner.equals(cur.getOwnerEmpNo())) return cur.getOwnerName();
        SysUser o = users.selectByEmpNo(owner);
        if (o == null || !"ACTIVE".equals(o.getStatus()) || !HeadRules.isSales(o.getRole())) throw ApiException.badRequest(OWNER_MSG);
        return o.getName();
    }

    /** 결재로 넣은 행은 요청자를 기준으로 하고, 자동 이월은 사람 주인이 없다(S11 ②). */
    static boolean editedByOther(BidTarget t) {
        if (ACTION_CARRY.equals(t.getFirstActionCd())) return false;
        String f = t.getFirstRequesterEmpNo() != null ? t.getFirstRequesterEmpNo() : t.getFirstEditorEmpNo();
        String e = t.getRequesterEmpNo() != null ? t.getRequesterEmpNo() : t.getEditorEmpNo();
        return f != null && e != null && !f.equals(e);
    }

    // ---- 자동 이월(056, NEXT 105) ----

    /** 이월·자동 취소할 기관(정렬). 읽기만 — list()·carry() 가 같은 판정을 쓴다. */
    List<String> carryPlan(LocalDate today) {
        if (!settings.isCarryEnabled()) return Collections.emptyList();
        int thisYear = today.getYear(), from = thisYear - 1;
        Map<String, List<BidTarget>> byInst = new LinkedHashMap<String, List<BidTarget>>();
        for (BidTarget t : mapper.selectLatestForCarry(from, thisYear)) {
            List<BidTarget> l = byInst.get(t.getInstitutionId());
            if (l == null) { l = new ArrayList<BidTarget>(); byInst.put(t.getInstitutionId(), l); }
            l.add(t);
        }
        Map<String, List<BankContract>> lines = byInstitution(mapper.selectContractsForCarry(from, thisYear));
        Map<String, Map<Integer, String>> starts = startsByInst(mapper.selectTermsForCarry(from, thisYear));
        Set<String> pending = new HashSet<String>();   // 이월은 자동 처리라 기관 단위로 보수적으로(결재 중인 기관은 건너뜀)
        for (BidTargetReqItem x : mapper.selectPendingItems()) pending.add(x.getInstitutionId());
        List<String> out = new ArrayList<String>();
        for (Map.Entry<String, List<BidTarget>> e : byInst.entrySet()) {
            if (pending.contains(e.getKey())) continue;
            for (BidTarget src : CarryRules.sourcesOf(e.getValue(), from, thisYear)) {
                if (!BidSubjects.MAIN_BANK.equals(src.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : src.getBidSubjectCd())) continue;   // NEXT 125 — 비금고 건은 금고 약정으로 판정하지 않는다
                if (!CarryRules.decide(src, e.getValue(), lines.get(e.getKey()), starts.get(e.getKey()), today,
                        settings.getCarryDefaultStart()).isEmpty()) { out.add(e.getKey()); break; }
            }
        }
        Collections.sort(out);
        return out;
    }

    /**
     * 자동 관심 이월(사용자 11-20 ②④, 11-26 목표 이월 폐지) — 결재 없음(사용자가 정한 자동 규칙). ⚠️ @Transactional 을 붙이지 않는다:
     * 후보는 읽기 트랜잭션, 쓰기는 기관마다 새 트랜잭션이고 첫 문장이 기관 잠금(S2). 한 기관이 409 면 그 기관만 건너뛴다.
     */
    public Map<String, Object> carry(final Actor actor, final BoardUiIds.Ui ui) {
        if (!settings.isCarryEnabled()) throw conflict("CARRY_DISABLED", "자동 이월이 꺼져 있습니다.", null);
        final LocalDate today = today();
        List<String> insts = readTx.execute(s -> carryPlan(today));
        boolean more = insts.size() > CARRY_MAX_INST;
        int carried = 0, revoked = 0, skipped = 0;
        for (final String inst : more ? insts.subList(0, CARRY_MAX_INST) : insts) {
            try {
                int[] r = writeTx.execute(s -> carryInst(inst, today, actor, ui));
                carried += r[0]; revoked += r[1];
            } catch (ApiException e) {
                skipped++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("carried", carried); out.put("revoked", revoked); out.put("skipped", skipped); out.put("more", more);
        out.put("carry_default_start", settings.defaultStartText());
        return out;
    }

    /** 한 기관 — 첫 DB 문장 = 잠금. 결재 중이면 아무것도 안 함. 원천(작년·올해 목표)마다 거둘 것 먼저, 그다음 새 이월. */
    int[] carryInst(String inst, LocalDate today, Actor actor, BoardUiIds.Ui ui) {
        if (mapper.lockInstitution(inst) == null) return new int[]{0, 0};   // 첫 DB 문장(S2)
        if (mapper.countPendingByInst(inst) > 0) return new int[]{0, 0};
        int thisYear = today.getYear();
        List<BankContract> lines = mapper.selectContractsOf(inst);
        Map<Integer, String> starts = startsOf(mapper.selectTermsOf(inst));
        int carried = 0, revoked = 0;
        for (BidTarget first : CarryRules.sourcesOf(mapper.selectLatestByInst(inst), thisYear - 1, thisYear)) {
            List<BidTarget> rows = mapper.selectLatestByInst(inst);   // 앞 원천에서 쓴 것까지 반영
            BidTarget src = null;
            for (BidTarget t : rows) if (t.getTargetNo() == first.getTargetNo()) src = t;
            if (src == null || ACTION_CANCEL.equals(src.getActionCd())) continue;
            if (!BidSubjects.MAIN_BANK.equals(src.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : src.getBidSubjectCd())) continue;   // NEXT 125 — 비금고 건은 자동 이월하지 않는다
            CarryRules.Decision d = CarryRules.decide(src, rows, lines, starts, today, settings.getCarryDefaultStart());   // 순위별 약정 거르기는 S4(성과·이월 건 단위화)에서 — 지금은 기관 약정 전체(기존 동작)
            for (BidTarget c : d.revoke) {
                if (c.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, c);
                c.setRevNo(c.getRevNo() + 1); c.setActionCd(ACTION_CANCEL); c.setCancelReasonCd(CANCEL_CARRY_REVOKED); c.setCancelReasonEtc(null);
                insert(c, actor, ui, null);
                revoked++;
            }
            if (d.carryKind == null) continue;
            if (BidTargetRules.KIND_WATCH.equals(d.carryKind) && CarryRules.watchOwnerOf(src) == null) continue;   // 061 — 주인을 정할 수 없으면 주인 없는 관심을 만들지 않는다
            int newNo = mapper.selectMaxTargetNo(inst) + 1;
            if (newNo > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, src);
            BidTarget row = new BidTarget();
            row.setInstitutionId(inst); row.setTargetNo(newNo); row.setRevNo(1); row.setActionCd(ACTION_CARRY);
            row.setKindCd(d.carryKind); row.setTargetYear(null);          // 11-26 — 이월은 관심뿐(목표 연도 NULL)
            row.setTagCd(src.getTagCd()); row.setMemo(src.getMemo()); row.setOwnerEmpNo(src.getOwnerEmpNo()); row.setOwnerName(src.getOwnerName());   // 이어받은 값은 다시 검사하지 않는다
            row.setAimRankCd(src.getAimRankCd());   // 063 — 금고 방식도 잇는다(팀 결정 11-25)
            row.setAimRankEtc(src.getAimRankEtc());   // 066 — 기타 이름도
            row.setBidSubjectCd(BidSubjects.MAIN_BANK); row.setBidSubjectEtc(null); row.setBidCaseId(null);   // 관심 행 = MAIN_BANK·연결 없음(이월은 금고 건만)
            row.setCarryFromNo(src.getTargetNo()); row.setCarryBasisCd(d.verdict);
            row.setWatchEmpNo(BidTargetRules.KIND_WATCH.equals(d.carryKind) ? CarryRules.watchOwnerOf(src) : null);   // 061 — 이월 관심 주인
            insert(row, actor, ui, null);
            carried++;
        }
        return new int[]{carried, revoked};
    }

    static Map<Integer, String> startsOf(List<BidTerm> rows) {
        Map<Integer, String> m = new HashMap<Integer, String>();
        for (BidTerm t : rows) if (ACTION_SAVE.equals(t.getActionCd()) && t.getTermStart() != null) m.put(t.getTargetYear(), t.getTermStart());
        return m;
    }

    private static Map<String, Map<Integer, String>> startsByInst(List<BidTerm> rows) {
        Map<String, Map<Integer, String>> m = new HashMap<String, Map<Integer, String>>();
        for (BidTerm t : rows) {
            if (!ACTION_SAVE.equals(t.getActionCd()) || t.getTermStart() == null) continue;
            Map<Integer, String> x = m.get(t.getInstitutionId());
            if (x == null) { x = new HashMap<Integer, String>(); m.put(t.getInstitutionId(), x); }
            x.put(t.getTargetYear(), t.getTermStart());
        }
        return m;
    }

    // ---- 061 지도 ♥ = 내 관심 기관(사람별) ----

    /**
     * ♥ 켬(멱등). 이미 켜져 있으면 그대로(구분도 안 바꿈). 내가 전에 끈 '처음부터 관심이던' 기록이 있으면 그 번호에 새 REV(번호 소모 방지, 값은 비우고 시작).
     * 구분(tag_cd)이 오지 않으면 비운다(NULL, NEXT 114 ⑥ — 현황판 [추가]와 같다). 서버가 근거로 기본값을 정하지 않는다. 오면 코드표 검사 후 그 값.
     * 목표에서 옮겨 왔거나 자동 이월로 생긴 기록은 다시 쓰지 않고 새 번호(security 하-2). 결재·결재 중 잠금과 무관(개인 기록).
     * 첫 DB 문장 = 기관 잠금. ⚠️ 자기신고 사번 위의 업무 규칙.
     */
    @Transactional
    public Map<String, Object> watchOn(String instRaw, String tagRaw, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        if (mapper.lockInstitution(inst) == null) throw ApiException.notFound("institution not found");
        SysUser me = watchUser(actor);
        BidTarget[] m = mine(inst, actor.getEmpNo());
        if (m[0] != null) return watchState(inst, m[0], true);
        requireNoMyToWatchPending(inst, actor.getEmpNo());   // 내가 올린 목표→관심 결재가 진행 중이면 ♥로 먼저 켜지 않는다(승인 때 ALREADY_WATCH 로 막힘)
        boolean given = tagRaw != null && !tagRaw.trim().isEmpty();
        String tag = given ? BidTargetRules.tag(tagRaw, codeCheck()) : null;   // NEXT 114 ⑥ — 안 오면 비움(기본 구분을 서버가 정하지 않는다)
        BidTarget row;
        if (m[1] != null) {
            row = m[1];
            if (row.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, null);
            row.setRevNo(row.getRevNo() + 1);
        } else {
            int newNo = mapper.selectMaxTargetNo(inst) + 1;
            if (newNo > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, null);
            row = new BidTarget();
            row.setInstitutionId(inst); row.setTargetNo(newNo); row.setRevNo(1);
        }
        row.setActionCd(ACTION_SAVE); row.setKindCd(BidTargetRules.KIND_WATCH); row.setTargetYear(null); row.setTagCd(tag);
        row.setMemo(null); row.setOwnerEmpNo(null); row.setOwnerName(null); row.setAimRankCd(null);   // 다시 켤 때 옛 값을 잇지 않는다
        row.setAimRankEtc(null); row.setBidSubjectCd(BidSubjects.MAIN_BANK); row.setBidSubjectEtc(null); row.setBidCaseId(null);   // 066 — 관심 행 = MAIN_BANK·이름 없음·연결 없음
        row.setCancelReasonCd(null); row.setCancelReasonEtc(null); row.setCarryFromNo(null); row.setCarryBasisCd(null);
        row.setWatchEmpNo(actor.getEmpNo());
        Map<String, Object> out = write(row, me, actor, ui, null);
        out.put("watching", true); out.put("changed", true); out.put("tag_source", given ? SRC_GIVEN : SRC_NONE);
        return out;
    }

    /** ♥ 끔(멱등) — 사유 없는 CANCEL 행. 내 관심이 없으면 그대로 200. 그 기록이 결재 중인 항목(TO_GOAL 등)의 대상이면 409 CHANGE_PENDING(security 하-1). */
    @Transactional
    public Map<String, Object> watchOff(String instRaw, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        if (mapper.lockInstitution(inst) == null) throw ApiException.notFound("institution not found");
        SysUser me = watchUser(actor);
        BidTarget cur = mine(inst, actor.getEmpNo())[0];
        if (cur == null) return watchState(inst, null, false);
        for (BidTargetReqItem x : mapper.selectPendingItemsByInst(inst)) {
            if (x.getTargetNo() != null && x.getTargetNo().intValue() == cur.getTargetNo()) {
                throw pendingConflict(null);   // latest 를 싣지 않는다 — 내 기록이지만 일관되게
            }
        }
        if (cur.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, null);
        cur.setRevNo(cur.getRevNo() + 1);
        cur.setActionCd(ACTION_CANCEL); cur.setCancelReasonCd(null); cur.setCancelReasonEtc(null);
        Map<String, Object> out = write(cur, me, actor, ui, null);
        out.put("watching", false); out.put("changed", true);
        return out;
    }

    /** 지도 첫 그림용 — 내 관심 기관 목록(가볍게). */
    @Transactional(readOnly = true)
    public Map<String, Object> myWatchList(String empNo) {
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (BidTarget t : mapper.selectActiveWatch(empNo)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("institution_id", t.getInstitutionId()); m.put("institution_name", t.getInstitutionName());
            m.put("target_no", t.getTargetNo()); m.put("rev_no", t.getRevNo());
            m.put("tag_cd", t.getTagCd()); m.put("tag_name", t.getTagName());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("items", items); out.put("n", items.size());
        return out;
    }

    /** [0] = 내 살아 있는 관심, [1] = 내가 끈 관심 중 다시 써도 되는(처음부터 관심, 자동 이월 아님) 번호가 가장 큰 것. 잠금 안에서. */
    private BidTarget[] mine(String inst, String empNo) {
        BidTarget alive = null, dead = null;
        for (BidTarget o : mapper.selectLatestByInst(inst)) {
            if (!BidTargetRules.KIND_WATCH.equals(BidTargetRules.kindOf(o)) || !empNo.equals(o.getWatchEmpNo())) continue;
            if (ACTION_CANCEL.equals(o.getActionCd())) {
                boolean reusable = BidTargetRules.KIND_WATCH.equals(o.getFirstKindCd()) && !ACTION_CARRY.equals(o.getFirstActionCd())
                        && mapper.countMoveRows(inst, o.getTargetNo()) == 0;   // 옮김(MOVE)이 한 번이라도 섞인 번호는 목표 이력이 있으니 재사용하지 않는다
                if (reusable && (dead == null || o.getTargetNo() > dead.getTargetNo())) dead = o;
            } else if (alive == null) alive = o;
        }
        return new BidTarget[]{alive, dead};
    }

    private SysUser watchUser(Actor actor) {
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !"ACTIVE".equals(me.getStatus())) throw detail(403, "WATCH_USER_DENIED", WATCH_USER_MSG, null);
        return me;
    }

    private static Map<String, Object> watchState(String inst, BidTarget t, boolean watching) {
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("saved", false); out.put("watching", watching); out.put("changed", false);
        out.put("institution_id", inst);
        out.put("target_no", t == null ? null : t.getTargetNo());
        out.put("rev_no", t == null ? null : t.getRevNo());
        return out;
    }

    /** RFP 협약 개시일(NEXT 105) — 영업 계열 누구나, 결재 없음(RFP 사실). 첫 DB 문장 = 기관 잠금. 비우면 지움(CANCEL 행). */
    @Transactional
    public Map<String, Object> saveTerm(String instRaw, BidTermIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        if (in == null || in.getTargetYear() == null) throw ApiException.badRequest("목표 연도를 골라 주세요.");
        if (mapper.lockInstitution(inst) == null) throw ApiException.notFound("institution not found");
        int thisYear = today().getYear(), y = in.getTargetYear().intValue();
        if (y < thisYear - 1 || y > thisYear + BidTargetRules.YEARS_AHEAD) throw ApiException.badRequest("개시일은 작년부터 2년 뒤까지의 목표 연도에만 적을 수 있습니다.");
        String d = BidTargetRules.termStart(in.getTermStart(), y);
        BidTerm cur = mapper.selectLatestTerm(inst, y);
        int curRev = cur == null ? 0 : cur.getRevNo();
        int base = in.getBaseRevNo() == null ? 0 : in.getBaseRevNo().intValue();
        if (base != curRev) throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", null);
        boolean alive = cur != null && ACTION_SAVE.equals(cur.getActionCd());
        if (d == null ? !alive : (alive && d.equals(cur.getTermStart()))) {
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("saved", false); out.put("code", "NO_CHANGE"); out.put("rev_no", curRev);
            return out;
        }
        if (curRev + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, null);
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !HeadRules.isSales(me.getRole())) throw new ApiException(403, DENIED_MSG);
        BidTerm row = new BidTerm();
        row.setInstitutionId(inst); row.setTargetYear(y); row.setRevNo(curRev + 1);
        row.setActionCd(d == null ? ACTION_CANCEL : ACTION_SAVE); row.setTermStart(d);
        row.setEditorEmpNo(actor.getEmpNo()); row.setEditorName(me.getName()); row.setEmpVerified(actor.isVerified() ? 1 : 0);
        row.setScreenId(ui.getScreen()); row.setButtonId(ui.getButton()); row.setUiValid(ui.isValid() ? 1 : 0); row.setSavedAt(Times.nowIso());
        try { mapper.insertTerm(row); }
        catch (DuplicateKeyException e) { throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", null); }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("saved", true); out.put("institution_id", inst); out.put("target_year", y); out.put("rev_no", curRev + 1); out.put("term_start", d);
        return out;
    }

    // ---- 도움 ----

    private static LocalDate today() { return LocalDate.parse(Times.todayKst()); }

    static int yearParam(String raw, int dflt) {
        if (raw == null || raw.trim().isEmpty()) return dflt;
        String s = raw.trim();
        if (!s.matches("[0-9]{4}")) throw ApiException.badRequest(YEAR_MSG);
        int y = Integer.parseInt(s);
        if (y < 1990 || y > 2100) throw ApiException.badRequest(YEAR_MSG);
        return y;
    }

    private static List<Integer> selectableYears(int thisYear) {
        List<Integer> out = new ArrayList<Integer>();
        for (int y = thisYear; y <= thisYear + BidTargetRules.YEARS_AHEAD; y++) out.add(y);
        return out;
    }

    private static Map<String, List<BankContract>> byInstitution(List<BankContract> rows) {
        Map<String, List<BankContract>> m = new LinkedHashMap<String, List<BankContract>>();
        for (BankContract c : rows) {
            List<BankContract> l = m.get(c.getInstitutionId());
            if (l == null) { l = new ArrayList<BankContract>(); m.put(c.getInstitutionId(), l); }
            l.add(c);
        }
        return m;
    }

    BankContractRules.CodeCheck codeCheck() {
        return new BankContractRules.CodeCheck() {
            @Override public boolean enabled(String group, String code) { return mapper.countEnabledCode(group, code) > 0; }
            @Override public List<String> names(String group) {
                List<String> o = new ArrayList<String>();
                for (BankContractCode c : mapper.selectCodes(group)) o.add(c.getCodeName());
                return o;
            }
        };
    }

    private Map<String, Object> codes() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("tags", tagCodeList());   // 072 — 구분 4값 + 두 축
        m.put("cancel_reasons", codeList(BidTargetRules.G_CANCEL));
        m.put("aim_ranks", codeList(BidTargetRules.G_AIM));   // 063 금고 방식(066 부터 '기타' 포함)
        m.put("subjects", codeList(BidSubjects.GROUP));        // NEXT 125 입찰 대상
        return m;
    }

    /** 063 — 이 목표 줄에서 금고 방식을 고르면: 영업부장 DIRECT · 지난해 목표 APPROVAL(구분 고치기와 같은 규칙) · 그 밖 쓰기 자격자 DIRECT · 자격 없으면 null. */
    private String aimMode(BidTarget t, boolean edit, String goalMode, int thisYear) {
        if (!edit) return null;
        if ("DIRECT".equals(goalMode)) return "DIRECT";
        return t.getTargetYear() == null || t.getTargetYear().intValue() < thisYear ? "APPROVAL" : "DIRECT";
    }

    private List<Map<String, Object>> codeList(String group) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BankContractCode c : mapper.selectCodes(group)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("code", c.getCode()); m.put("name", c.getCodeName()); out.add(m);
        }
        return out;
    }

    /** 072 — 구분 코드마다 대상 축(audience_cd RETAIN|NEW)과 수의계약 여부를 붙인다. 이름·순서는 코드표 그대로. */
    private List<Map<String, Object>> tagCodeList() {
        List<Map<String, Object>> out = codeList(BidTargetRules.G_TAG);
        for (Map<String, Object> m : out) {
            String c = (String) m.get("code");
            m.put("audience_cd", BidTargetRules.tagRetain(c) ? "RETAIN" : "NEW");
            m.put("private_contract", BidTargetRules.tagPrivate(c));
        }
        return out;
    }

    /** 화면용. 수정자 사번·화면·버튼·UI_VALID 는 내보내지 않는다(감사 전용). 주 담당 사번은 쓰기 자격자에게만(담당 고르기 화면용). */
    private static Map<String, Object> view(BidTarget t, boolean withAction, boolean showOwnerEmpNo) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("institution_id", t.getInstitutionId());
        m.put("institution_name", t.getInstitutionName());
        m.put("region_code", t.getRegionCode());
        m.put("target_no", t.getTargetNo());
        m.put("rev_no", t.getRevNo());
        if (withAction) m.put("action_cd", t.getActionCd());
        m.put("kind_cd", BidTargetRules.kindOf(t));
        m.put("target_year", t.getTargetYear());
        m.put("tag_cd", t.getTagCd());
        m.put("tag_name", t.getTagName());
        m.put("memo", t.getMemo() == null ? "" : t.getMemo());
        m.put("aim_rank_cd", t.getAimRankCd());     // 063 — null = '-'(아직 안 정함)
        m.put("aim_rank_name", t.getAimRankName());
        String subj = t.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : t.getBidSubjectCd();
        boolean other = BidTargetRules.AIM_OTHER.equals(t.getAimRankCd());
        m.put("aim_rank_etc", t.getAimRankEtc());                                           // 기타 이름(손 입력 — 화면 esc)
        m.put("aim_rank_label", other && t.getAimRankEtc() != null ? t.getAimRankEtc() : t.getAimRankName());
        m.put("aim_rank_sort", BidTargetKeys.aimSort(subj, t.getAimRankCd(), t.getAimRankSort()));   // 1금고→2금고→단수→주거래→기타→정하지 않음(90)→해당 없음(99)
        m.put("bid_subject_cd", subj);                                                      // NEXT 125
        m.put("bid_subject_name", BidSubjects.label(subj, t.getBidSubjectEtc(), t.getBidSubjectName()));   // ETC 손 이름 — 화면은 esc()
        m.put("rank_state", BidTargetKeys.rankState(subj, t.getAimRankCd()));               // NA 해당 없음 | UNDECIDED 미정 | SET
        m.put("owner_name", t.getOwnerName());
        if (showOwnerEmpNo) m.put("owner_emp_no", t.getOwnerEmpNo());
        if (withAction) {
            m.put("cancel_reason_cd", t.getCancelReasonCd());
            m.put("cancel_reason_name", BidTargetRules.CANCEL_ETC.equals(t.getCancelReasonCd()) ? t.getCancelReasonEtc() : t.getCancelReasonName());
        }
        m.put("editor_name", t.getEditorName());
        m.put("emp_verified", t.getEmpVerified() == 1);
        m.put("saved_at", t.getSavedAt());
        m.put("first_editor_name", t.getFirstEditorName());
        m.put("first_saved_at", t.getFirstSavedAt());
        m.put("carried", ACTION_CARRY.equals(t.getFirstActionCd()));        // 화면: '작년 목표에서 넘어옴(자동)'
        m.put("carry_basis_cd", t.getFirstCarryBasisCd());                  // UNREGISTERED|FAIL|PENDING|null
        if (withAction) m.put("approval_req_id", t.getApprovalReqId());
        return m;
    }

    private static String requireInstId(String raw) {
        if (!InstitutionHeadService.validInstId(raw)) throw ApiException.notFound("institution not found");
        return raw;
    }

    private static int requireTargetNo(String raw) {
        if (raw == null || !raw.matches("[1-9][0-9]{0,8}")) throw ApiException.notFound("target not found");
        return Integer.parseInt(raw);
    }

    static ApiException conflict(String code, String message, BidTarget cur) { return detail(409, code, message, cur); }

    static ApiException detail(int status, String code, String message, BidTarget cur) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        Map<String, Object> latest = null;
        if (cur != null) {
            latest = new LinkedHashMap<String, Object>();
            latest.put("target_no", cur.getTargetNo());
            latest.put("rev_no", cur.getRevNo());
            latest.put("action_cd", cur.getActionCd());
            latest.put("kind_cd", BidTargetRules.kindOf(cur));
            latest.put("target_year", cur.getTargetYear());
            latest.put("editor_name", cur.getEditorName());
            latest.put("saved_at", cur.getSavedAt());
        }
        d.put("latest", latest);
        return ApiException.withDetail(status, d);
    }
}
