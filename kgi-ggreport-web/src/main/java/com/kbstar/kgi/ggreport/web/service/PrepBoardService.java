package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardCheck;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardRef;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepBoardIn;
import com.kbstar.kgi.ggreport.web.mapper.BankContractMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepBoardMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 대시보드(NEXT 102) — 행 = 제안 확정 기관(BID_PREP 기관당 1줄), 열 = 엑셀 체크리스트 27칸(PrepBoardColumns).
 * 칸 값은 아이콘 4값(V 완료 DONE · △ 진행 IN_PROGRESS · - 대상 아님 NA · 빈칸 시작 전 NONE, 사용자 11-20 ③). 날짜는 입력받지 않고 서버가 체크한 날(KST)을 남긴다.
 * 열람: 영업팀·영업팀장·영업부장(영업부서 전원, ⑥) — 디자이너·그 밖은 403. 체크: 그 건의 활성 담당자만(setTask 와 같은 규칙, 팀장·부장도 담당이 아니면 403).
 * 행 순서: 입찰 예정일 오름차순(없으면 맨 뒤) → 확정 시각 → 기관 이름.
 * 저장: 건 행 잠금 → 담당 검사(security 3·4) → … → 추가 전용 INSERT + 성공 감사(같은 트랜잭션). 감사·접근 이력에 아이콘 값·날짜·이름을 넣지 않는다.
 * ⚠️ 사번은 X-Emp-No 자기신고 — 역할·담당 검사는 업무 규칙(실수 방지)이지 사칭 방지가 아니다.
 */
@Service
public class PrepBoardService {

    public static final String ACT_LIST = "DASH_LIST";
    public static final String ACT_LIST_ENDED = "DASH_LIST_ENDED";   // include_ended 를 켠 목록(security F2) — 끝난 건을 보았는지 감사에 남긴다
    public static final String ACT_CHECK = "DASH_CHECK";
    public static final String ACT_SAME = "DASH_CHECK_SAME";
    static final String NONE = "NONE", IN_PROGRESS = "IN_PROGRESS", DONE = "DONE", NA = "NA";
    static final String MARK_GROUP = "DASH_MARK";          // 054 코드표
    private static final List<String> MARKS = Collections.unmodifiableList(Arrays.asList(DONE, IN_PROGRESS, NA, NONE));
    private static final Map<String, String> SYMBOLS;
    private static final Map<String, String> DEFAULT_NAMES;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    static {
        Map<String, String> s = new LinkedHashMap<String, String>();
        s.put(DONE, "V"); s.put(IN_PROGRESS, "△"); s.put(NA, "-"); s.put(NONE, "");
        SYMBOLS = Collections.unmodifiableMap(s);
        Map<String, String> n = new LinkedHashMap<String, String>();
        n.put(DONE, "완료"); n.put(IN_PROGRESS, "진행"); n.put(NA, "대상 아님"); n.put(NONE, "시작 전");
        DEFAULT_NAMES = Collections.unmodifiableMap(n);
    }

    private final PrepMapper preps;
    private final PrepBoardMapper mapper;
    private final PrepService prep;
    private final BidAssignmentService assignments;
    private final BankContractMapper banks;
    private final NoticeRoundService notices;
    private final PrepAudit audit;

    public PrepBoardService(PrepMapper preps, PrepBoardMapper mapper, PrepService prep, BidAssignmentService assignments,
                            BankContractMapper banks, NoticeRoundService notices, PrepAudit audit) {
        this.preps = preps; this.mapper = mapper; this.prep = prep; this.assignments = assignments;
        this.banks = banks; this.notices = notices; this.audit = audit;
    }

    /** 영업부서 전원 — 영업팀·영업팀장·영업부장(사용자 11-20 ⑥). */
    static boolean canList(SysUser u) {
        String r = u.getRole() == null ? "" : u.getRole().trim();
        return BidAssignmentService.MEMBER_ROLE.equals(r) || BidAssignmentService.LEAD_ROLE.equals(r)
                || BidAssignmentService.HEAD_ROLE.equals(r);
    }

    /** 행 순서 — 입찰 예정일 오름차순(없으면 맨 뒤) → 확정 시각 → 기관 이름. */
    static final Comparator<BidPrep> ROW_ORDER = new Comparator<BidPrep>() {
        @Override
        public int compare(BidPrep a, BidPrep b) {
            int c = nullsLast(dueOf(a), dueOf(b));
            if (c != 0) { return c; }
            c = nullsLast(a.getConfirmedAt(), b.getConfirmedAt());
            if (c != 0) { return c; }
            return nullsLast(a.getInstitutionName(), b.getInstitutionName());
        }
    };

    private static String dueOf(BidPrep p) {
        String d = p.getContractEnd();
        return d == null || d.trim().isEmpty() ? null : d.trim();
    }

    private static int nullsLast(String a, String b) {
        if (a == null) { return b == null ? 0 : 1; }
        if (b == null) { return -1; }
        return a.compareTo(b);
    }

    // ── 목록(행 × 열 한 번에) ─────────────────────────────────────────
    @Transactional(readOnly = true)
    public Map<String, Object> list(SysUser me, boolean includeEnded) {
        if (!canList(me)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        Map<String, BidPrep> pick = new LinkedHashMap<String, BidPrep>();   // selectList 는 CONFIRMED_AT DESC — 기관당 활성 건 우선(024 잠금 규칙이 활성 1건 보장)
        for (BidPrep p : preps.selectList()) {
            boolean active = !PrepService.CANCELLED.equals(p.getStateCd());
            BidPrep cur = pick.get(p.getInstitutionId());
            if (cur == null) {
                if (active || includeEnded) { pick.put(p.getInstitutionId(), p); }
            } else if (active && PrepService.CANCELLED.equals(cur.getStateCd())) {
                pick.put(p.getInstitutionId(), p);
            }
        }
        List<BidPrep> ordered = new ArrayList<BidPrep>(pick.values());
        Collections.sort(ordered, ROW_ORDER);
        Map<String, List<BidPrepTask>> tasks = new HashMap<String, List<BidPrepTask>>();
        for (BidPrepTask t : mapper.selectAllTasks()) { bucket(tasks, t.getBidCaseId()).add(t); }
        Map<String, List<String>> names = new HashMap<String, List<String>>();
        Set<String> mine = new HashSet<String>();   // 활성 담당(isActiveAssignee 와 같은 기준: BID_ASSIGNMENT.ACTIVE_YN=1 + 사번) — 묶음 질의로 판정
        for (PrepBoardRef a : mapper.selectActiveAssignees()) {
            if (a.getName() != null) { bucket(names, a.getBidCaseId()).add(a.getName()); }
            if (me.getEmpNo().equals(a.getEmpNo())) { mine.add(a.getBidCaseId()); }
        }
        Map<String, String> confirmers = new HashMap<String, String>();
        for (PrepBoardRef c : mapper.selectConfirmers()) { confirmers.put(c.getBidCaseId(), c.getName()); }
        Set<String> designFinal = new HashSet<String>(mapper.selectDesignFinalCases(Teams.DESIGNER_TEAM, Teams.FINAL_STATUS));
        Map<String, Map<String, Object>> notice = new HashMap<String, Map<String, Object>>();
        Object items = notices.current(me.getEmpNo()).get("items");
        if (items instanceof List) {
            for (Object o : (List<?>) items) {
                @SuppressWarnings("unchecked") Map<String, Object> n = (Map<String, Object>) o;
                notice.put(String.valueOf(n.get("institution_id")), n);
            }
        }
        Map<String, String> noticeNames = codeNames("NOTICE_STATUS");
        Map<String, Map<String, PrepBoardCheck>> checks = new HashMap<String, Map<String, PrepBoardCheck>>();
        for (PrepBoardCheck c : mapper.selectCurrent()) {
            Map<String, PrepBoardCheck> m = checks.get(c.getBidCaseId());
            if (m == null) { m = new HashMap<String, PrepBoardCheck>(); checks.put(c.getBidCaseId(), m); }
            m.put(c.getColCd(), c);
        }
        String today = Times.todayKst();
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        for (BidPrep p : ordered) {
            String bid = p.getBidCaseId();
            List<BidPrepTask> ts = tasks.containsKey(bid) ? tasks.get(bid) : Collections.<BidPrepTask>emptyList();
            Map<String, String> st = ts.isEmpty() ? Collections.<String, String>emptyMap() : prep.boardTaskStates(p, ts);
            Map<String, PrepBoardCheck> ck = checks.containsKey(bid) ? checks.get(bid) : Collections.<String, PrepBoardCheck>emptyMap();
            boolean ended = PrepService.CANCELLED.equals(p.getStateCd());
            boolean canView = prep.boardCanSee(me, p);
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("bid_case_id", bid);
            m.put("institution_id", p.getInstitutionId());
            m.put("institution_name", p.getInstitutionName());
            m.put("bid_expected_date", dueOf(p));
            m.put("state_cd", p.getStateCd());
            m.put("state_name", PrepService.boardStateName(p));
            m.put("ended", ended);
            m.put("confirmed_at", p.getConfirmedAt());
            // 상세를 못 여는 확정 취소 건의 확정자 이름은 가린다(security F3 기본값 — 기획 답 전까지). 사번은 싣지 않는다.
            m.put("confirmed_by_name", !canView && ended ? null : confirmers.get(bid));
            m.put("assignee_names", names.containsKey(bid) ? names.get(bid) : Collections.<String>emptyList());
            m.put("current_banks", currentBanks(p.getInstitutionId(), today));
            m.put("can_view", canView);
            m.put("is_mine", mine.contains(bid));
            m.put("can_check", mine.contains(bid) && PrepService.TASK_STATES.contains(p.getStateCd()));
            Map<String, Object> cells = new LinkedHashMap<String, Object>();
            for (PrepBoardColumns.Col c : PrepBoardColumns.ALL) {
                if (PrepBoardColumns.NOTICE.equals(c.kind)) {
                    cells.put(c.cd, noticeCell(notice.get(p.getInstitutionId()), noticeNames));
                } else if (PrepBoardColumns.AUTO.equals(c.kind)) {
                    cells.put(c.cd, autoCell(c.cd, p, ts, st, designFinal.contains(bid)));
                } else {
                    cells.put(c.cd, manualCell(ck.get(c.cd)));
                }
            }
            m.put("cells", cells);
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("columns", columns());
        out.put("groups", PrepBoardColumns.GROUPS);
        out.put("marks", marks());
        out.put("today", today);
        out.put("rows", rows);
        return out;
    }

    private static Map<String, Object> autoCell(String cd, BidPrep p, List<BidPrepTask> ts, Map<String, String> st, boolean designFinal) {
        if ("INST_ANALYSIS".equals(cd)) { return taskCell(ts, st, "T1"); }
        if ("PROFIT".equals(cd)) { return taskCell(ts, st, "T3"); }
        if ("PROPOSAL".equals(cd)) {
            if (designFinal) { return cell(DONE, null, "AUTO"); }
            return cell(PrepService.WRITING.equals(p.getStateCd()) ? IN_PROGRESS : NONE, null, "AUTO");
        }
        return cell(NONE, null, "AUTO");
    }

    /** 과제 → 아이콘: DONE=V(완료 시각의 KST 날짜), NOT_APPLICABLE='-', 그 밖(개설 전·잠김·할 일·준비 중)=빈칸. △는 추정하지 않는다. */
    private static Map<String, Object> taskCell(List<BidPrepTask> ts, Map<String, String> st, String taskCd) {
        String s = st.get(taskCd);
        if ("DONE".equals(s)) {
            String at = null;
            for (BidPrepTask t : ts) {
                if (taskCd.equals(t.getTaskCd())) { at = kstDate(t.getDoneAt()); }
            }
            return cell(DONE, at, "AUTO");
        }
        return cell("NOT_APPLICABLE".equals(s) ? NA : NONE, null, "AUTO");
    }

    /** 공고 상태 기록(037) 값 그대로 — 읽기 전용(사용자 ②). 기록 없으면 코드 null. */
    private static Map<String, Object> noticeCell(Map<String, Object> n, Map<String, String> names) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        String code = n == null ? null : (String) n.get("status_cd");
        m.put("mark_cd", null);
        m.put("marked_on", n == null ? null : kstDate((String) n.get("handled_at")));
        m.put("source", PrepBoardColumns.NOTICE);
        m.put("notice_status_cd", code);
        m.put("notice_status_name", code == null ? null : names.containsKey(code) ? names.get(code) : code);
        return m;
    }

    private static Map<String, Object> manualCell(PrepBoardCheck c) {
        String mark = c == null ? NONE : c.getMarkCd();
        Map<String, Object> m = cell(mark, c == null || NONE.equals(mark) ? null : c.getMarkDate(), "MANUAL");
        m.put("rev_no", c == null ? 0 : c.getRevNo());
        m.put("by_name", c == null ? null : c.getActorName());   // 영업부서 전원 열람(⑥)
        m.put("emp_verified", c != null && c.getEmpVerified() == 1);   // false = 자기신고
        return m;
    }

    private static Map<String, Object> cell(String mark, String date, String source) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("mark_cd", mark);
        m.put("marked_on", date);
        m.put("source", source);
        return m;
    }

    private List<Map<String, Object>> currentBanks(String inst, String today) {   // 행당 1질의 — 남은 비용(security 6, 백 단위가 넘으면 묶음 질의로)
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BankContract c : banks.selectLatestValid(inst)) {
            if (c.getTermTo() == null || c.getTermTo().compareTo(today) < 0) { continue; }
            Map<String, Object> b = new LinkedHashMap<String, Object>();
            b.put("rank_cd", c.getRankCd());
            b.put("bank_name", c.getBankName() != null ? c.getBankName() : c.getBankNameEtc());
            b.put("term_to", c.getTermTo());
            out.add(b);
        }
        return out;
    }

    // ── 손 체크 저장 ──────────────────────────────────────────────────
    /**
     * ⓪ 영업부서 밖 역할 403(canList, DB 접근 없음 — QA P3-5) → ① 건 행 잠금(형식이 맞을 때만) → ② 건 없음·비담당 403(같은 응답) → ③ 열 형식·존재 404 → ④ 자동·공고 열 409 NOT_MANUAL →
     * ⑤ 입력 400 → ⑥ 상태 409 STATE_CHANGED → ⑦ 개정 번호 409 STALE_CHECK → ⑧ 같은 값이면 저장 없이 DASH_CHECK_SAME →
     * ⑨ INSERT(PK 중복도 409 STALE_CHECK) + 성공 감사(같은 트랜잭션).
     * 잠금을 먼저 두는 이유: 담당 해제와 줄을 세우고(security 3), MySQL REPEATABLE READ 의 읽기 시점을 잠금 뒤로 미뤄 ⑦이 실제로 걸리게 한다(security 4).
     * 이 트랜잭션의 첫 문장은 반드시 FOR UPDATE 여야 한다 — 앞에 일반 SELECT 를 넣지 말 것.
     */
    @Transactional
    public Map<String, Object> save(SysUser me, Actor actor, BoardUiIds.Ui ui, String bidCaseId, String colRaw,
                                    PrepBoardIn.Check in) {
        if (!canList(me)) {   // 담당 배정이 남은 채 역할이 영업 밖으로 바뀐 사용자(QA P3-5) — DB 접근 전에 거른다(잠금 규칙과 무관). 컨트롤러가 DENIED 감사를 남긴다.
            throw new ApiException(403, "이 입찰 건의 담당자만 체크할 수 있습니다.");
        }
        boolean wellFormed = bidCaseId != null && bidCaseId.matches("[A-Za-z0-9._-]{1,64}");
        String state = wellFormed ? preps.selectStateForUpdate(bidCaseId) : null;
        if (state == null || !assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 체크할 수 있습니다.");
        }
        PrepBoardColumns.Col col = PrepBoardColumns.byCode(colRaw);
        if (col == null) {
            throw ApiException.notFound("board column not found");
        }
        if (!col.editable()) {
            throw coded(409, "NOT_MANUAL", "시스템 기록으로 채워지는 칸이라 직접 체크할 수 없습니다.");
        }
        String mark = in == null || in.getMarkCd() == null ? "" : in.getMarkCd().trim();
        if (!MARKS.contains(mark)) {
            throw coded(400, "BAD_MARK", "표시는 완료·진행·대상 아님·시작 전 중 하나여야 합니다.");
        }
        Integer base = in.getBaseRev();
        if (base == null || base.intValue() < 0) {
            throw coded(400, "BAD_VALUE", "base_rev가 필요합니다.");
        }
        if (!PrepService.TASK_STATES.contains(state)) {
            throw coded(409, "STATE_CHANGED", "그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.");
        }
        PrepBoardCheck cur = mapper.selectCurrentOne(bidCaseId, col.cd);
        int curRev = cur == null ? 0 : cur.getRevNo();
        if (curRev != base.intValue()) {
            throw stale();
        }
        String curMark = cur == null ? NONE : cur.getMarkCd();
        boolean same = curMark.equals(mark);
        PrepBoardCheck saved = cur;
        if (!same) {
            PrepBoardCheck c = new PrepBoardCheck();
            c.setBidCaseId(bidCaseId); c.setColCd(col.cd); c.setRevNo(curRev + 1);
            c.setMarkCd(mark); c.setPrevMarkCd(cur == null ? null : curMark); c.setMarkDate(Times.todayKst());
            c.setActorEmpNo(me.getEmpNo()); c.setActorName(actorName(me));
            c.setEmpVerified(BoardMaterialService.verified(actor));
            c.setScreenId(ui.getScreen()); c.setButtonId(ui.getButton()); c.setUiValid(ui.isValid() ? 1 : 0);
            c.setSavedAt(Times.nowIso());
            try {
                mapper.insertCheck(c);
            } catch (DuplicateKeyException e) {   // 잠금을 지나친 동시 저장의 마지막 방어선
                throw stale();
            }
            saved = c;
        }
        audit.record(bidCaseId, same ? ACT_SAME : ACT_CHECK, "OK", state, PrepBoardColumns.AUDIT_PREFIX + col.cd, actor, ui);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("bid_case_id", bidCaseId);
        out.put("col_cd", col.cd);
        out.put("saved", !same);
        out.put("cell", manualCell(saved));
        return out;
    }

    /** Oracle 은 '' 를 NULL 로 본다(ACTOR_NAME NOT NULL → ORA-01400) — 이름이 비면 사번으로(security 5). 50자로 자른다. */
    static String actorName(SysUser me) {
        String n = me.getName() == null ? "" : me.getName().trim();
        if (n.isEmpty()) { n = me.getEmpNo(); }
        return n.length() > 50 ? n.substring(0, 50) : n;
    }

    /** UTC ISO(Times.nowIso) → 한국 날짜. 읽을 수 없으면 null(원문을 잘라 내보내지 않는다). */
    static String kstDate(String iso) {
        if (iso == null || iso.trim().isEmpty()) { return null; }
        try {
            return OffsetDateTime.parse(iso.trim()).atZoneSameInstant(KST).toLocalDate().toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private Map<String, String> codeNames(String group) {
        Map<String, String> m = new HashMap<String, String>();
        for (BankContractCode c : mapper.selectCodes(group)) { m.put(c.getCode(), c.getCodeName()); }
        return m;
    }

    private List<Map<String, Object>> marks() {   // 허용 값은 코드(MARKS)가 정본, 이름은 054 코드표(없으면 기본 이름)
        Map<String, String> names = codeNames(MARK_GROUP);
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (String k : MARKS) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("mark_cd", k);
            m.put("symbol", SYMBOLS.get(k));
            m.put("name", names.containsKey(k) ? names.get(k) : DEFAULT_NAMES.get(k));
            out.add(m);
        }
        return out;
    }

    private static List<Map<String, Object>> columns() {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (PrepBoardColumns.Col c : PrepBoardColumns.ALL) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("col_cd", c.cd); m.put("label", c.label); m.put("group", c.group);
            m.put("kind", c.kind); m.put("editable", c.editable());
            out.add(m);
        }
        return out;
    }

    private static <T> List<T> bucket(Map<String, List<T>> m, String k) {
        List<T> l = m.get(k);
        if (l == null) { l = new ArrayList<T>(); m.put(k, l); }
        return l;
    }

    private static ApiException stale() {
        return coded(409, "STALE_CHECK", "다른 사람이 먼저 바꿨습니다. 새로 고친 뒤 다시 시도하세요.");
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
