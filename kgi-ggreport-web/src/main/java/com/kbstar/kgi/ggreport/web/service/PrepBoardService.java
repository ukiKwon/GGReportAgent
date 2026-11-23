package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardBank;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardCheck;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardRef;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepBoardIn;
import com.kbstar.kgi.ggreport.web.mapper.BankContractMapper;
import com.kbstar.kgi.ggreport.web.mapper.ExtCheckMapper;
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

import java.time.LocalDate;
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
 * 대시보드(NEXT 102) — 행 = 제안 확정 건(기관당 활성 1줄, include_ended 면 끝난 건은 건마다 1줄 — planner 11-23 P3-6), 열 = 엑셀 체크리스트 27칸(PrepBoardColumns).
 * 이름 가림: 상세를 못 여는 끝난 건(ended·can_view=false)은 확정자·담당자·체크자 이름을 모두 싣지 않는다(planner 11-23 P3-4).
 * 칸 값은 아이콘 4값(V 완료 DONE · △ 진행 IN_PROGRESS · - 대상 아님 NA · 빈칸 시작 전 NONE, 사용자 11-20 ③). 날짜는 입력받지 않고 서버가 체크한 날(KST)을 남긴다.
 * 열람: 영업팀·영업팀장·영업부장(영업부서 전원, ⑥) — 디자이너·그 밖은 403. 체크: 그 건의 활성 담당자만(setTask 와 같은 규칙, 팀장·부장도 담당이 아니면 403).
 * 입찰 예정일(⑤, 사용자 11-23): 공고가 나온 기관은 공고 제출 마감일(EXT_CHECK notice·found·DEADLINE_AT 최신 1건, 지났어도 그대로), 없으면 약정 만료일.
 * 근거는 bid_expected_basis(notice|expiry). 행 순서: 입찰 예정일 오름차순(없으면 맨 뒤) → 확정 시각 → 기관 이름.
 * 저장: 건 행 잠금 → 담당 검사(security 3·4) → … → 추가 전용 INSERT + 성공 감사(같은 트랜잭션). 감사·접근 이력에 아이콘 값·날짜·이름을 넣지 않는다.
 * ⚠️ 사번은 X-Emp-No 자기신고 — 역할·담당 검사는 업무 규칙(실수 방지)이지 사칭 방지가 아니다.
 */
@Service
public class PrepBoardService {

    public static final String ACT_LIST = "DASH_LIST";
    public static final String ACT_LIST_ENDED = "DASH_LIST_ENDED";   // include_ended 를 켠 목록(security F2) — 끝난 건을 보았는지 감사에 남긴다
    public static final String ACT_CHECK = "DASH_CHECK";
    public static final String ACT_SAME = "DASH_CHECK_SAME";
    public static final String ACT_LIST_ROW = "DASH_LIST_ROW";   // 목록에 실린 결재 끝난 건마다 한 줄(planner 11-23 P3-3) — 요약 줄과 같은 LOGGED_AT
    /** 목록 감사에 건 번호를 남기는 상태 — 사전준비 승인(결재)이 끝난 건. 사용자 불변 규칙 "결재 끝난 건의 모든 행위는 누가·어느 화면·어느 버튼". */
    public static final Set<String> AUDIT_ROW_STATES = Collections.unmodifiableSet(new HashSet<String>(
            Arrays.asList(PrepService.WRITABLE, PrepService.WRITING)));
    /**
     * 대시보드 손 체크 허용 상태 — 개설 승인 이후(진행·결재 대기·작성 가능·작성 중)만(NEXT 102 팀 결정 A, planner 11-23 밤).
     * 승인 전(CONFIRMED·OPEN_PENDING)은 담당 배정이 아직 없어 체크 주체가 없으므로 읽기 전용, 취소·중단도 막힌다. 허용 목록이라 모르는 상태는 409.
     * PrepService.TASK_STATES(과제 체크)와 일부러 따로 둔다 — 그쪽을 바꾸지 말 것(fa 담당).
     * 승인 전 건은 실제 흐름에서 담당 검사에서 먼저 403(D31), 담당이 남은 합성 상태는 상태 검사에서 409 STATE_CHANGED(D24).
     */
    static final Set<String> CHECK_STATES = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            PrepService.IN_PROGRESS, PrepService.APPROVAL_PENDING, PrepService.WRITABLE, PrepService.WRITING)));
    static final String BASIS_NOTICE = "notice", BASIS_EXPIRY = "expiry";
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
    private final BankContractMapper banks;   // P3-8 뒤 목록은 mapper 묶음 질의를 쓴다 — 생성자 시그니처 유지용(PrepBoardServiceTest), 다음 정리 때 제거
    private final NoticeRoundService notices;
    private final PrepAudit audit;
    private final ExtCheckMapper extChecks;

    public PrepBoardService(PrepMapper preps, PrepBoardMapper mapper, PrepService prep, BidAssignmentService assignments,
                            BankContractMapper banks, NoticeRoundService notices, PrepAudit audit, ExtCheckMapper extChecks) {
        this.preps = preps; this.mapper = mapper; this.prep = prep; this.assignments = assignments;
        this.banks = banks; this.notices = notices; this.audit = audit; this.extChecks = extChecks;
    }

    /** 영업부서 전원 — 영업팀·영업팀장·영업부장(사용자 11-20 ⑥). */
    static boolean canList(SysUser u) {
        String r = u.getRole() == null ? "" : u.getRole().trim();
        return BidAssignmentService.MEMBER_ROLE.equals(r) || BidAssignmentService.LEAD_ROLE.equals(r)
                || BidAssignmentService.HEAD_ROLE.equals(r);
    }

    /** 행 순서 — 입찰 예정일(공고 마감일 우선, 없으면 약정 만료일) 오름차순(없으면 맨 뒤) → 확정 시각 → 기관 이름. noticeDue: 기관 → 공고 마감일. */
    static Comparator<BidPrep> rowOrder(final Map<String, String> noticeDue) {
        return new Comparator<BidPrep>() {
            @Override
            public int compare(BidPrep a, BidPrep b) {
                int c = nullsLast(dueOf(a, noticeDue), dueOf(b, noticeDue));
                if (c != 0) { return c; }
                c = nullsLast(a.getConfirmedAt(), b.getConfirmedAt());
                if (c != 0) { return c; }
                return nullsLast(a.getInstitutionName(), b.getInstitutionName());
            }
        };
    }

    /** 공고 마감일이 없을 때의 순서(약정 만료일만) — U5 가 고정한다. */
    static final Comparator<BidPrep> ROW_ORDER = rowOrder(Collections.<String, String>emptyMap());

    static String dueOf(BidPrep p, Map<String, String> noticeDue) {
        String n = p.getInstitutionId() == null ? null : noticeDue.get(p.getInstitutionId());
        return n != null ? n : expiryOf(p);
    }

    private static String expiryOf(BidPrep p) {
        String d = p.getContractEnd();
        return d == null || d.trim().isEmpty() ? null : d.trim();
    }

    /** 기관 → 공고 제출 마감일(YYYY-MM-DD, 엄격 검사). 묶음 질의 한 번. 형식이 틀린 값은 버린다(약정 만료일로 돌아간다 — 원문을 내보내지 않는다). */
    private Map<String, String> noticeDeadlines() {
        Map<String, String> m = new HashMap<String, String>();
        for (ExtCheck c : extChecks.selectLatestNoticeDeadlines()) {
            String d = c.getDeadlineAt() == null ? "" : c.getDeadlineAt().trim();
            if (c.getInstitutionId() == null || d.isEmpty()) { continue; }
            try {
                m.put(c.getInstitutionId(), LocalDate.parse(d).toString());
            } catch (DateTimeParseException e) {
                // 형식 밖 — 버린다
            }
        }
        return m;
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
        // 활성 건은 기관당 1줄(selectList 는 CONFIRMED_AT DESC — 024 잠금 규칙이 활성 1건 보장, 어긋나면 최근 확정 1건).
        // 끝난 건(CANCELLED)은 include_ended 일 때 건마다 1줄 — 같은 기관의 옛 취소·중단 건도 열 수 있게(planner 11-23 P3-6).
        List<BidPrep> ordered = new ArrayList<BidPrep>();
        Set<String> activeInst = new HashSet<String>();
        for (BidPrep p : preps.selectList()) {
            if (!PrepService.CANCELLED.equals(p.getStateCd())) {
                if (activeInst.add(p.getInstitutionId())) { ordered.add(p); }
            } else if (includeEnded) {
                ordered.add(p);
            }
        }
        Map<String, String> noticeDue = noticeDeadlines();
        Collections.sort(ordered, rowOrder(noticeDue));
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
        Map<String, List<Map<String, Object>>> banksByInst = currentBanksByInst(today);   // P3-8: 기관별 묶음 1회
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        for (BidPrep p : ordered) {
            String bid = p.getBidCaseId();
            List<BidPrepTask> ts = tasks.containsKey(bid) ? tasks.get(bid) : Collections.<BidPrepTask>emptyList();
            Map<String, String> st = ts.isEmpty() ? Collections.<String, String>emptyMap() : prep.boardTaskStates(p, ts);
            Map<String, PrepBoardCheck> ck = checks.containsKey(bid) ? checks.get(bid) : Collections.<String, PrepBoardCheck>emptyMap();
            boolean ended = PrepService.CANCELLED.equals(p.getStateCd());
            boolean canView = prep.boardCanSee(me, p);
            boolean hideNames = ended && !canView;   // P3-4: 상세를 못 여는 끝난 건은 사람 이름 3종(확정자·담당자·체크자)을 모두 가린다. 사번은 원래 싣지 않는다.
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("bid_case_id", bid);
            m.put("institution_id", p.getInstitutionId());
            m.put("institution_name", p.getInstitutionName());
            String due = dueOf(p, noticeDue);
            m.put("bid_expected_date", due);
            m.put("bid_expected_basis", due == null ? null : noticeDue.containsKey(p.getInstitutionId()) ? BASIS_NOTICE : BASIS_EXPIRY);
            m.put("state_cd", p.getStateCd());
            m.put("state_name", PrepService.boardStateName(p));
            m.put("ended", ended);
            m.put("confirmed_at", p.getConfirmedAt());
            m.put("confirmed_by_name", hideNames ? null : confirmers.get(bid));
            m.put("assignee_names", hideNames || !names.containsKey(bid) ? Collections.<String>emptyList() : names.get(bid));
            m.put("current_banks", banksByInst.containsKey(p.getInstitutionId())
                    ? banksByInst.get(p.getInstitutionId()) : Collections.<Map<String, Object>>emptyList());
            m.put("can_view", canView);
            m.put("is_mine", mine.contains(bid));
            m.put("can_check", mine.contains(bid) && CHECK_STATES.contains(p.getStateCd()));
            Map<String, Object> cells = new LinkedHashMap<String, Object>();
            for (PrepBoardColumns.Col c : PrepBoardColumns.ALL) {
                if (PrepBoardColumns.NOTICE.equals(c.kind)) {
                    cells.put(c.cd, noticeCell(notice.get(p.getInstitutionId()), noticeNames));
                } else if (PrepBoardColumns.AUTO.equals(c.kind)) {
                    cells.put(c.cd, autoCell(c.cd, p, ts, st, designFinal.contains(bid)));
                } else {
                    cells.put(c.cd, manualCell(ck.get(c.cd), hideNames));
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

    /** 목록 감사용 — 응답 rows 중 AUDIT_ROW_STATES 건의 {건 번호, 상태}. 실제 응답에 실린 행만 센다(사용자가 본 표 기준). */
    public static List<String[]> auditRows(Map<String, Object> out) {
        List<String[]> res = new ArrayList<String[]>();
        Object rows = out == null ? null : out.get("rows");
        if (!(rows instanceof List)) { return res; }
        for (Object o : (List<?>) rows) {
            if (!(o instanceof Map)) { continue; }
            Map<?, ?> r = (Map<?, ?>) o;
            Object bid = r.get("bid_case_id");
            Object st = r.get("state_cd");
            if (bid instanceof String && st instanceof String && AUDIT_ROW_STATES.contains(st)) {
                res.add(new String[]{(String) bid, (String) st});
            }
        }
        return res;
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
        return manualCell(c, false);
    }

    /** hideName: 상세를 못 여는 끝난 건(P3-4) — 칸 값·날짜·개정 번호는 그대로, 체크한 사람 이름만 뺀다. */
    private static Map<String, Object> manualCell(PrepBoardCheck c, boolean hideName) {
        String mark = c == null ? NONE : c.getMarkCd();
        Map<String, Object> m = cell(mark, c == null || NONE.equals(mark) ? null : c.getMarkDate(), "MANUAL");
        m.put("rev_no", c == null ? 0 : c.getRevNo());
        m.put("by_name", c == null || hideName ? null : c.getActorName());   // 영업부서 전원 열람(⑥), 단 P3-4 가림
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

    /** 기관 → 지금 유효한(만료 안 된) 약정 줄. 질의 1회(qa P3-8 — 예전엔 행마다 selectLatestValid). 같은 기관 안 순서는 줄 번호순. */
    private Map<String, List<Map<String, Object>>> currentBanksByInst(String today) {
        Map<String, List<Map<String, Object>>> out = new HashMap<String, List<Map<String, Object>>>();
        for (PrepBoardBank c : mapper.selectLatestValidBanks()) {
            if (c.getTermTo() == null || c.getTermTo().compareTo(today) < 0) { continue; }
            Map<String, Object> b = new LinkedHashMap<String, Object>();
            b.put("rank_cd", c.getRankCd());
            b.put("bank_name", c.getBankName());
            b.put("term_to", c.getTermTo());
            List<Map<String, Object>> l = out.get(c.getInstitutionId());
            if (l == null) { l = new ArrayList<Map<String, Object>>(); out.put(c.getInstitutionId(), l); }
            l.add(b);
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
        if (!CHECK_STATES.contains(state)) {   // 승인 전·취소·중단·모르는 상태는 막는다(NEXT 102 팀 결정 A)
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
