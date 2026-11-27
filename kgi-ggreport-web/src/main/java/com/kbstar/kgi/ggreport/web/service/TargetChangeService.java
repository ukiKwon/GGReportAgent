package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqAct;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqItem;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.dto.TargetChangeIn;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * 목표 기관 변경(NEXT 105, 056) — 일괄 검사·결재 항목 저장·승인 반영·영업부장 바로 반영.
 * 066 — 결재 항목 = 건(한 요청에 같은 기관 여러 건, PK REQ_ID·ITEM_NO). 결재 중 잠금은 건 단위 + 칸 단위 키 보호(SLOT_PENDING).
 * 잠금: 상신·바로 반영의 첫 DB 문장 = 기관 행 FOR UPDATE(정렬 순서, 교착 방지) — MySQL RR 일관 읽기가 잠금 뒤에 시작(BidTargetService.save 규칙).
 * ⚠️ 승인 경로(ApprovalRequestService.decide)는 요청·사용자를 먼저 읽어 일관 읽기 시점이 잠금보다 이르다. 결재 중인 기관은 모든 쓰기가
 *    CHANGE_PENDING 으로 막혀 그 사이 바뀐 행이 없고, 같은 REV PK(DuplicateKey→409)가 마지막 방어선이다.
 * ⚠️ 역할·사번은 X-Emp-No 자기신고 위의 업무 규칙(보안 경계 아님). 오류 detail 에는 item_no·기관 이름만(입력값 없음).
 */
@Service
public class TargetChangeService {
    static final int MAX_ITEMS = 20, REASON_MAX = 200, PAYLOAD_MAX_BYTES = 3800;   // S5 — 4000 CHAR 칸이 STANDARD 에서는 4000 바이트
    static final String OP_ADD = "ADD", OP_EDIT = "EDIT", OP_CANCEL = "CANCEL", OP_TO_WATCH = "TO_WATCH", OP_TO_GOAL = "TO_GOAL";
    private static final Set<String> OPS = new HashSet<String>(Arrays.asList(OP_ADD, OP_EDIT, OP_CANCEL, OP_TO_WATCH, OP_TO_GOAL));
    public static final String ACT_SUBMIT = "SUBMIT", ACT_APPROVE = "APPROVE", ACT_REJECT = "REJECT", ACT_CANCEL = "CANCEL";
    public static final String BASIS_REQUESTER = "REQUESTER", BASIS_LINE = "LINE", BASIS_HEAD = "HEAD";
    public static final String DIRECT_ROLE = BidTargetService.DIRECT_ROLE, DIRECT_VALUE_EDIT = BidTargetService.DIRECT_VALUE_EDIT;   // NEXT 114
    private static final String CHANGED_MSG = "결재를 올린 뒤 이 기관의 목표 기록이 바뀌었습니다. 반려하고 다시 요청해 주세요.";
    private static final String YEAR_PASSED_MSG = "결재를 올린 뒤 해가 바뀌어 고른 목표 연도가 지났습니다. 반려하고 다시 요청해 주세요.";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final BidTargetMapper mapper;
    private final BidTargetService targets;
    private final BidAssignmentService assignments;
    private final SysUserMapper users;

    public TargetChangeService(BidTargetMapper mapper, BidTargetService targets, BidAssignmentService assignments, SysUserMapper users) {
        this.mapper = mapper;
        this.targets = targets;
        this.assignments = assignments;
        this.users = users;
    }

    static final class Planned {
        int itemNo; String inst, op, warnCd, tag, memo, owner, ownerName, cancelCd, cancelEtc; BidTarget cur; Integer toYear;
        boolean valueOnly;   // EDIT 이고 연도·주 담당 그대로(NEXT 114)
        String aim, aimEdit;   // 063 — 금고 방식·바뀜 종류(FIRST|CHANGE|CLEAR|null, 접근 이력용)
        String aimEtc;         // 066 — 기타(OTHER) 금고 방식 이름
        String subject, subjectEtc;   // NEXT 125 — ADD·TO_GOAL 은 반영할 대상, 그 밖은 그 건의 대상(요청 때 스냅샷)
    }

    public static final class Plan {
        final List<Planned> items = new ArrayList<Planned>();
        String reason, title, payload; SysUser approver;
        String requesterEmp;   // 061 — TO_WATCH 의 관심 주인·관심 기록 소유 검사(요청자 = 바로 반영이면 본인)
        boolean valueOnly;   // 모든 항목이 valueOnly → 결재 없이 바로
        public boolean isValueOnly() { return valueOnly; }
        public SysUser getApprover() { return approver; }
        public String getTitle() { return title; }
        public String getPayload() { return payload; }
        public int size() { return items.size(); }
    }

    /** 결재선 밖 영업부장도 이 유형을 반려·취소할 수 있다(사용자 11-20 ③). 승인은 결재선만. */
    public static boolean headOverride(SysUser me, SysUser requester) {
        return me != null && requester != null && "ACTIVE".equals(me.getStatus())
                && HeadRules.ROLE_HEAD.equals(HeadRules.roleOf(me.getRole())) && !me.getEmpNo().equals(requester.getEmpNo());
    }

    public boolean direct(SysUser me) { return targets.directGoal(me); }

    // ── 형식 검사 + 잠금 ─────────────────────────────────────────────

    /** DB 전 형식 검사(0개·21개 이상·빈 항목·모르는 동작·동작에 안 맞는 칸·같은 기관 두 번) → 기관 행을 정렬 순서로 잠근다. */
    @Transactional
    public void lockAll(TargetChangeIn in) {
        if (in == null || in.getItems() == null || in.getItems().isEmpty()) throw ApiException.badRequest("바꿀 기관을 하나 이상 골라 주세요.");
        if (in.getItems().size() > MAX_ITEMS) throw ApiException.badRequest("한 번에 " + MAX_ITEMS + "곳까지 올릴 수 있습니다. 나눠서 요청해 주세요.");
        // 066 — 한 요청에 같은 기관의 여러 건(결재 항목 = 건, PK REQ_ID·ITEM_NO). 같은 목표 건 두 번만 막는다. 잠금은 기관마다 한 번, 정렬 순서(교착 방지)
        Map<String, Integer> seen = new HashMap<String, Integer>();
        Set<String> targetsSeen = new HashSet<String>(), watchSeen = new HashSet<String>();
        int no = 0;
        for (TargetChangeIn.Item it : in.getItems()) {
            no++;
            if (it == null) throw item(400, "BAD_VALUE", "빈 항목이 있습니다.", no);
            shape(it, no);
            if (seen.containsKey(it.getInstitutionId())) {
                // 스위치(multi-subject) 꺼짐 = 옛 화면과 같은 모습 — 한 요청에 같은 기관은 한 번만(DUP_INST). 켜지면 같은 기관의 여러 건 허용
                if (!targets.multiSubject()) throw item(400, "DUP_INST", "한 요청에 같은 기관은 한 번만 넣을 수 있습니다.", no);
            } else {
                seen.put(it.getInstitutionId(), no);
            }
            if (it.getTargetNo() != null && !targetsSeen.add(it.getInstitutionId() + "#" + it.getTargetNo())) {
                throw item(400, "DUP_ITEM", "한 요청에 같은 목표 건은 한 번만 넣을 수 있습니다.", no);
            }
            // qa P2-2 — 관심은 사람마다 기관당 1개: 한 요청에 같은 기관을 관심으로 옮기는 항목이 둘이면 막는다(반영 전 행만 보는 판정이 못 본다)
            if (OP_TO_WATCH.equals(it.getOpCd()) && !watchSeen.add(it.getInstitutionId())) {
                throw item(400, "DUP_WATCH", "한 요청에 같은 기관을 관심으로 두 번 옮길 수 없습니다. 관심은 기관당 하나입니다.", no);
            }
        }
        for (String inst : new TreeSet<String>(seen.keySet())) {
            if (mapper.lockInstitution(inst) == null) throw item(404, "NOT_FOUND", "기관을 찾을 수 없습니다.", seen.get(inst).intValue());
        }
    }

    private static void shape(TargetChangeIn.Item it, int no) {
        String inst = it.getInstitutionId() == null ? null : it.getInstitutionId().trim();
        if (!InstitutionHeadService.validInstId(inst)) throw item(404, "NOT_FOUND", "기관을 찾을 수 없습니다.", no);
        it.setInstitutionId(inst);
        String op = it.getOpCd() == null ? "" : it.getOpCd().trim();
        if (!OPS.contains(op)) throw item(400, "BAD_VALUE", "동작을 목록에서 골라 주세요.", no);
        it.setOpCd(op);
        boolean add = OP_ADD.equals(op), edit = OP_EDIT.equals(op), cancel = OP_CANCEL.equals(op);
        if (add ? (it.getTargetNo() != null || it.getBaseRevNo() != null) : (it.getTargetNo() == null || it.getBaseRevNo() == null)) {
            throw item(400, "BAD_VALUE", add ? "새로 넣을 때는 기록 번호를 보내지 않습니다." : "바꿀 기록 번호와 화면이 본 기록 번호(base_rev_no)가 필요합니다.", no);
        }
        // 063 의 'ADD 에 금고 방식 400' 은 스위치(multi-subject)를 봐야 해서 planItem 으로 옮겼다(NEXT 125 — 꺼짐이면 옛 규칙 그대로)
        boolean values = it.getTagCd() != null || it.getMemo() != null || it.getOwnerEmpNo() != null || it.getAimRankCd() != null || it.getAimRankEtc() != null;
        boolean cancelVals = it.getCancelReasonCd() != null || it.getCancelReasonEtc() != null;
        boolean subjVals = BidTargetKeys.subjectGiven(it.getBidSubjectCd(), it.getBidSubjectEtc());
        boolean yearOk = add || edit || OP_TO_GOAL.equals(op);
        if ((values && !(add || edit)) || (cancelVals && !cancel) || (it.getTargetYear() != null && !yearOk)
                || (subjVals && !(add || edit || OP_TO_GOAL.equals(op)))) {
            throw item(400, "BAD_VALUE", "이 동작에 쓰지 않는 값이 들어 있습니다.", no);
        }
    }

    // ── 상신·바로 반영 검사(잠금 안) ─────────────────────────────────

    /**
     * direct = 영업부장(또는 스위치 끔, 사유를 받지 않는다 — 저장할 곳이 없다). 그 밖에는 모든 항목이 구분·메모만 고치는 EDIT 이면 바로(valueOnly), 아니면 결재 요청.
     * 사유: 들어왔으면 항목보다 먼저 형식·개인정보 검사(이전 순서 유지), 결재 요청인데 비었으면 항목 검사 뒤 400.
     */
    @Transactional
    public Plan plan(TargetChangeIn in, boolean direct, String requesterEmp) {
        Plan plan = new Plan();
        plan.requesterEmp = requesterEmp;
        String raw = in.getReason();
        boolean hasReason = raw != null && !raw.trim().isEmpty();
        if (!direct && hasReason) checkReason(plan, raw);
        LocalDate today = LocalDate.parse(Times.todayKst());
        BankContractRules.CodeCheck codes = targets.codeCheck();
        int no = 0;
        for (TargetChangeIn.Item it : in.getItems()) {
            no++;
            try { plan.items.add(planItem(no, it, today, codes, requesterEmp)); }
            catch (ApiException e) { throw withItem(e, no, null); }
        }
        boolean all = true;
        for (Planned p : plan.items) if (!p.valueOnly) { all = false; break; }
        plan.valueOnly = all;
        if (!direct && !all && !hasReason) checkReason(plan, raw);   // 400 "사유를 입력하세요."
        checkSlots(plan.items, null);   // NEXT 125 — 기관마다 '바뀐 뒤 모습' 한 번(바로 반영이어도 키 판정은 거친다, 사용자 11-26 ①). 입력 오류(400) 뒤
        return plan;
    }

    /** 기관별 바뀐 뒤 모습으로 키 검사(DUP_TARGET·SLOT_PENDING). 항목 번호(그 기관 첫 항목)를 오류 detail 에 붙인다(입력값 없음). selfReq = 승인 재검사 때 자기 요청. */
    private void checkSlots(List<Planned> items, Long selfReq) {
        Map<String, List<Planned>> by = new TreeMap<String, List<Planned>>();
        for (Planned p : items) {
            List<Planned> l = by.get(p.inst);
            if (l == null) { l = new ArrayList<Planned>(); by.put(p.inst, l); }
            l.add(p);
        }
        for (Map.Entry<String, List<Planned>> e : by.entrySet()) {
            List<BidTargetKeys.Slot> ch = new ArrayList<BidTargetKeys.Slot>();
            Set<Integer> rm = new HashSet<Integer>();
            for (Planned p : e.getValue()) {
                if (OP_ADD.equals(p.op)) ch.add(new BidTargetKeys.Slot(-p.itemNo, p.toYear, p.subject, p.subjectEtc, p.aim));
                else if (OP_EDIT.equals(p.op) || OP_TO_GOAL.equals(p.op)) ch.add(new BidTargetKeys.Slot(p.cur.getTargetNo(), p.toYear, p.subject, p.subjectEtc, p.aim));
                else rm.add(p.cur.getTargetNo());
            }
            try { targets.checkGoalSlots(e.getKey(), ch, rm, selfReq); }
            catch (ApiException x) { throw withItem(x, e.getValue().get(0).itemNo, null); }
        }
    }

    private static void checkReason(Plan plan, String raw) {
        plan.reason = BoardMaterialService.checkedText(raw, REASON_MAX, "사유", true);   // 제어문자 400·개인정보 422(S1)
        new MemoScreen("TARGET_FORBIDDEN", BidTargetRules.FORBIDDEN_MSG).free(plan.reason).throwIfAny();
    }

    private Planned planItem(int no, TargetChangeIn.Item it, LocalDate today, BankContractRules.CodeCheck codes, String requesterEmp) {
        int thisYear = today.getYear();
        Planned p = new Planned();
        p.itemNo = no; p.inst = it.getInstitutionId(); p.op = it.getOpCd();
        // NEXT 125 — 결재 중 잠금은 건 단위(사용자 11-26 ③): 결재 중인 그 목표 건만 막는다. 넣기·키 바꾸기는 칸 검사(checkSlots → SLOT_PENDING)가 막는다.
        if (it.getTargetNo() != null && mapper.countPendingByTarget(p.inst, it.getTargetNo().intValue()) > 0) throw BidTargetService.pendingConflict(null);
        if (OP_ADD.equals(p.op)) {
            if (!targets.multiSubject()) BidTargetRules.requireNoAimOnAdd(it.getAimRankCd());   // 스위치 꺼짐 = 옛 063 규칙(넣을 때 금고 방식은 비운다)
            String[] s = BidTargetKeys.subject(it.getBidSubjectCd(), it.getBidSubjectEtc(), codes);
            BidTargetKeys.requireSubjectAllowed(s[0], true, targets.multiSubject());
            BidTargetRules.Parsed v = BidTargetRules.parse(asIn(it), thisYear, null, codes);
            fill(p, v, targets.ownerName(v.owner, null));
            p.subject = s[0]; p.subjectEtc = s[1];
            BidTargetKeys.requireRankFits(p.subject, p.aim);
            if (BidSubjects.MAIN_BANK.equals(p.subject) && p.toYear.intValue() == thisYear) p.warnCd = warn(targets.closedCheck(p.inst, today));
            return p;
        }
        BidTarget cur = mapper.selectLatestTarget(p.inst, it.getTargetNo().intValue());
        if (cur == null) throw ApiException.notFound("target not found");
        BidTargetService.requireWatchOwner(cur, requesterEmp);   // 061 중-1 — 관심 기록이면 op 와 무관하게 먼저(ALREADY_CANCELLED·STALE 의 latest 로 남의 기록이 새지 않게)
        if (BidTargetService.ACTION_CANCEL.equals(cur.getActionCd())) throw BidTargetService.conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다.", cur);
        if (it.getBaseRevNo().intValue() != cur.getRevNo()) throw BidTargetService.conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 올려 주세요.", cur);
        p.cur = cur;
        p.subject = cur.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : cur.getBidSubjectCd(); p.subjectEtc = cur.getBidSubjectEtc();
        boolean goal = BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(cur));
        if (OP_TO_GOAL.equals(p.op) ? goal : !goal) {
            throw ApiException.badRequest(OP_TO_GOAL.equals(p.op) ? "이미 목표인 기록입니다." : "목표 기록만 결재로 바꿉니다. 관심 기록은 바로 고칠 수 있습니다.");
        }
        switch (p.op) {
            case OP_EDIT: {
                BidTargetRules.Parsed v = BidTargetRules.parse(asIn(it), thisYear, cur.getTargetYear(), codes);
                BidTargetRules.keepUnsent(v, it.getMemo(), it.getAimRankCd(), cur);   // 빠진 메모·금고 방식은 그대로
                if (BidTargetRules.same(cur, v)) throw ApiException.badRequest("바뀐 내용이 없습니다.");
                BidTargetService.fixedSubject(cur, it.getBidSubjectCd(), it.getBidSubjectEtc());   // 대상은 바꿀 수 없다(보냈으면 같은 값만)
                fill(p, v, targets.ownerName(v.owner, cur));
                BidTargetKeys.requireRankFits(p.subject, p.aim);
                BidTargetService.requireYearUnlinked(cur, p.toYear);   // 팀 결정 — 입찰 건에 이어진 목표는 연도를 못 바꾼다
                p.aimEdit = BidTargetRules.aimEdit(cur, v);
                p.valueOnly = BidTargetRules.valueOnlyEdit(cur, v, thisYear);   // 단건 save 와 같은 판정 하나(NEXT 114·063, 지난해 목표는 결재 — security F1)
                targets.checkRankLock(cur, p.aim);   // 409 RANK_LOCKED(상신 때도 막는다 — 승인 때 replan 이 다시 본다)
                if (!p.toYear.equals(cur.getTargetYear())) {
                    if (BidSubjects.MAIN_BANK.equals(p.subject) && p.toYear.intValue() == thisYear) p.warnCd = warn(targets.closedCheck(p.inst, today));
                }
                return p;
            }
            case OP_CANCEL: {
                BidTargetCancelIn c = new BidTargetCancelIn();
                c.setBaseRevNo(it.getBaseRevNo()); c.setCancelReasonCd(it.getCancelReasonCd()); c.setCancelReasonEtc(it.getCancelReasonEtc());
                BidTargetRules.CancelParsed cp = BidTargetRules.parseCancel(c, codes);
                p.cancelCd = cp.reasonCd; p.cancelEtc = cp.reasonEtc;
                targets.requireNoActivePrep(p.inst);   // 11-27 PREP_ACTIVE
                return p;
            }
            case OP_TO_WATCH:
                targets.checkWatchOverlap(p.inst, cur.getTargetNo(), requesterEmp);
                targets.requireNoActivePrep(p.inst);   // 11-27 PREP_ACTIVE
                return p;
            default: {   // TO_GOAL
                p.toYear = BidTargetRules.moveYear(it.getTargetYear(), false, thisYear);
                if (BidTargetKeys.subjectGiven(it.getBidSubjectCd(), it.getBidSubjectEtc())) {   // 관심 → 목표: 대상은 기본 MAIN_BANK, 바꾸려면 여기서 고른다
                    String[] s = BidTargetKeys.subject(it.getBidSubjectCd(), it.getBidSubjectEtc(), codes);
                    p.subject = s[0]; p.subjectEtc = s[1];
                }
                BidTargetKeys.requireSubjectAllowed(p.subject, true, targets.multiSubject());
                boolean mainTo = BidSubjects.MAIN_BANK.equals(p.subject);
                p.aim = mainTo ? cur.getAimRankCd() : null; p.aimEtc = mainTo ? cur.getAimRankEtc() : null;
                if (mainTo && p.toYear.intValue() == thisYear) p.warnCd = warn(targets.closedCheck(p.inst, today));
                return p;
            }
        }
    }

    /** 결재자·제목·payload. payload = 사유 + 기관 id·동작만(이름·메모 없음, S5 바이트 검사). */
    public void prepare(Plan plan, SysUser me) {
        boolean lead = HeadRules.ROLE_LEAD.equals(HeadRules.roleOf(me.getRole()));
        plan.approver = assignments.resolveApprover(me, lead);   // 팀원 → 영업팀장, 영업팀장 → 영업부장
        Map<String, Object> payload = new LinkedHashMap<String, Object>();
        payload.put("reason", plan.reason);
        payload.put("n", plan.items.size());
        List<Map<String, Object>> xs = new ArrayList<Map<String, Object>>();
        for (Planned p : plan.items) {
            Map<String, Object> x = new LinkedHashMap<String, Object>();
            x.put("institution_id", p.inst); x.put("op_cd", p.op); xs.add(x);
        }
        payload.put("items", xs);
        String json;
        try { json = JSON.writeValueAsString(payload); } catch (IOException e) { throw new ApiException(500, "요청 내용을 저장할 수 없습니다."); }
        if (json.getBytes(StandardCharsets.UTF_8).length > PAYLOAD_MAX_BYTES) {
            throw ApiException.badRequest("한 번에 올리기에 내용이 너무 깁니다. 사유를 줄이거나 나눠서 요청해 주세요.");
        }
        plan.payload = json;
        String first = mapper.selectInstitutionName(plan.items.get(0).inst);
        first = first == null ? "" : (first.length() > 100 ? first.substring(0, 100) : first);
        Set<String> insts = new LinkedHashSet<String>();   // 같은 기관의 여러 건은 한 곳으로(제목은 서로 다른 기관 수)
        for (Planned p : plan.items) insts.add(p.inst);
        int n = insts.size();
        plan.title = "목표 기관 변경 — " + first + (n > 1 ? " 외 " + (n - 1) + "곳" : "") + (plan.items.size() > n ? " (" + plan.items.size() + "건)" : "");
    }

    /** 결재 항목 행 + 상신 감사 1행(누가·어느 화면·버튼, S11 ①). */
    @Transactional
    public void claim(Plan plan, Long reqId, SysUser me, Actor actor, BoardUiIds.Ui ui, String now) {
        for (Planned p : plan.items) {
            BidTargetReqItem x = new BidTargetReqItem();
            x.setReqId(reqId); x.setInstitutionId(p.inst); x.setItemNo(p.itemNo); x.setOpCd(p.op);
            if (p.cur != null) {
                x.setTargetNo(Integer.valueOf(p.cur.getTargetNo())); x.setBaseRevNo(Integer.valueOf(p.cur.getRevNo()));
                x.setBaseKindCd(BidTargetRules.kindOf(p.cur)); x.setBaseYear(p.cur.getTargetYear());
            }
            x.setToYear(p.toYear); x.setTagCd(p.tag); x.setMemo(p.memo); x.setOwnerEmpNo(p.owner); x.setOwnerName(p.ownerName);
            x.setCancelReasonCd(p.cancelCd); x.setCancelReasonEtc(p.cancelEtc); x.setWarnCd(p.warnCd);
            x.setAimRankCd(p.aim);   // 063 — EDIT 승인 때 지워지지 않게 요청 때 값을 싣는다(security 11-25 3번). ADD 는 스위치가 켜졌을 때만 값(NEXT 125)
            x.setAimRankEtc(p.aimEtc);   // 066 — 기타 이름도 같은 이유로
            x.setBidSubjectCd(p.subject == null ? BidSubjects.MAIN_BANK : p.subject); x.setBidSubjectEtc(p.subjectEtc);   // NEXT 125 — 건의 대상 스냅샷
            x.setRequesterEmpNo(me.getEmpNo()); x.setRequesterName(me.getName()); x.setCreatedAt(now);
            mapper.insertReqItem(x);
        }
        recordAct(reqId, ACT_SUBMIT, BASIS_REQUESTER, me, actor, ui);
    }

    /** 바로 반영 — basis ROLE(영업부장·스위치 끔) | VALUE_EDIT(구분·메모만). 행: 수정자 = 본인, 화면·버튼 = 보낸 값(허용 목록). */
    @Transactional
    public Map<String, Object> applyDirect(Plan plan, Actor actor, BoardUiIds.Ui ui, String basis) {
        List<Map<String, Object>> done = new ArrayList<Map<String, Object>>();
        int aims = 0;
        for (Planned p : plan.items) { done.add(write(p, actor, ui, null, plan.requesterEmp)); if (p.aimEdit != null) aims++; }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("mode", "DIRECT");
        out.put("direct_basis", basis);
        out.put("applied", done.size());
        out.put("aim_edits", aims);   // 063 — 금고 방식이 바뀐 항목 수(접근 이력용, 값 아님)
        out.put("items", done);
        return out;
    }

    // ── 승인 반영 ─────────────────────────────────────────────────

    /** ApprovalRequestService.applyApproved 가 같은 트랜잭션에서 부른다. 전부 반영하거나 하나도 안 함(S12 재검사 포함). */
    @Transactional
    public String apply(ApprovalRequest r, SysUser decider, Actor actor, BoardUiIds.Ui ui) {
        List<BidTargetReqItem> items = mapper.selectReqItems(r.getReqId());
        if (items.isEmpty()) throw new ApiException(409, "요청 항목을 찾을 수 없습니다.");
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        boolean reqLead = requester != null && HeadRules.ROLE_LEAD.equals(HeadRules.roleOf(requester.getRole()));
        String dr = decider == null ? "" : HeadRules.roleOf(decider.getRole());
        if (!(HeadRules.ROLE_HEAD.equals(dr) || (!reqLead && HeadRules.ROLE_LEAD.equals(dr)))) {
            throw new ApiException(403, "이 요청을 결재할 수 없습니다.");   // 방어 — eligibility 가 먼저 막는다
        }
        if (requester == null || !"ACTIVE".equals(requester.getStatus()) || !HeadRules.isSales(requester.getRole())) {
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "REQUESTER_INACTIVE");
            d.put("message", "요청자가 더 이상 영업부서 사용자가 아니어서 반영할 수 없습니다. 반려해 주세요.");
            throw ApiException.withDetail(409, d);
        }
        TreeSet<String> insts = new TreeSet<String>();
        for (BidTargetReqItem x : items) insts.add(x.getInstitutionId());
        for (String inst : insts) mapper.lockInstitution(inst);
        LocalDate today = LocalDate.parse(Times.todayKst());
        BankContractRules.CodeCheck codes = targets.codeCheck();
        List<Planned> plans = new ArrayList<Planned>();
        for (BidTargetReqItem x : items) {
            try { plans.add(replan(x, today, codes, r.getRequesterEmpNo())); }
            catch (ApiException e) { throw withItem(e, x.getItemNo(), x.getInstitutionName()); }
        }
        checkSlots(plans, r.getReqId());   // NEXT 125 — 승인 때 키 재검사(자기 요청은 결재 중 칸에서 뺀다)
        for (Planned p : plans) write(p, actor, ui, r.getReqId(), r.getRequesterEmpNo());
        return "목표 기관 변경 반영: " + plans.size() + "건";
    }

    private Planned replan(BidTargetReqItem x, LocalDate today, BankContractRules.CodeCheck codes, String requesterEmp) {
        int thisYear = today.getYear();
        Planned p = new Planned();
        p.itemNo = x.getItemNo(); p.inst = x.getInstitutionId(); p.op = x.getOpCd();
        if (!OP_ADD.equals(p.op)) {
            BidTarget cur = x.getTargetNo() == null ? null : mapper.selectLatestTarget(p.inst, x.getTargetNo().intValue());
            if (cur != null) BidTargetService.requireWatchOwner(cur, requesterEmp);   // 061 중-1 — ITEM_CHANGED 의 latest 로 남의 관심 기록이 새지 않게 먼저
            if (cur == null || BidTargetService.ACTION_CANCEL.equals(cur.getActionCd()) || x.getBaseRevNo() == null
                    || cur.getRevNo() != x.getBaseRevNo().intValue() || !BidTargetRules.kindOf(cur).equals(x.getBaseKindCd())) {
                throw BidTargetService.conflict("ITEM_CHANGED", CHANGED_MSG, cur);
            }
            p.cur = cur;
        }
        p.subject = x.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : x.getBidSubjectCd(); p.subjectEtc = x.getBidSubjectEtc();   // NEXT 125 — 요청 때 스냅샷
        switch (p.op) {
            case OP_ADD:
            case OP_EDIT: {
                if (x.getTagCd() != null && !codes.enabled(BidTargetRules.G_TAG, x.getTagCd())) throw invalid("태그가 더 이상 쓰이지 않습니다.", p.cur);   // 11-25 — 구분 비움(NULL) 허용
                // 기존 건 고치기는 스위치가 꺼져도 승인된다(security ②ⓑ) — 새로 만들 때만 꺼짐을 막는다
                if (!codes.enabled(BidSubjects.GROUP, p.subject) || (OP_ADD.equals(p.op) && !targets.multiSubject() && !BidSubjects.MAIN_BANK.equals(p.subject))) {
                    throw invalid("입찰 대상이 더 이상 쓰이지 않습니다.", p.cur);
                }
                if (OP_ADD.equals(p.op) && !targets.multiSubject() && x.getAimRankCd() != null) throw invalid("금고 순위는 목표로 넣은 뒤 고릅니다.", p.cur);
                String curAim = p.cur == null ? null : p.cur.getAimRankCd();
                if (x.getAimRankCd() != null && !x.getAimRankCd().equals(curAim) && !codes.enabled(BidTargetRules.G_AIM, x.getAimRankCd())) {
                    throw invalid("금고 방식이 더 이상 쓰이지 않습니다.", p.cur);   // 새로 고른 값만 다시 검사(이어받기만 한 값 때문에 다른 결재가 막히지 않게)
                }
                p.toYear = x.getToYear(); p.tag = x.getTagCd(); p.memo = x.getMemo(); p.owner = x.getOwnerEmpNo(); p.aim = x.getAimRankCd(); p.aimEtc = x.getAimRankEtc();
                try { p.ownerName = targets.ownerName(p.owner, p.cur); }   // 새로 고른 주 담당만 다시 검사(활성 영업)
                catch (ApiException e) { throw invalid("주 담당이 더 이상 영업부서 활성 사용자가 아닙니다.", p.cur); }
                if (OP_EDIT.equals(p.op)) BidTargetService.requireYearUnlinked(p.cur, p.toYear);   // 요청 뒤 입찰 건이 이어졌으면 승인 때도 막는다(YEAR_LINKED)
                if (OP_EDIT.equals(p.op)) targets.checkRankLock(p.cur, p.aim);   // 요청 뒤 연결된 제안이 진행 중이 됐으면 승인 때도 막는다(409 RANK_LOCKED)
                if (p.cur == null || !p.toYear.equals(p.cur.getTargetYear())) {
                    if (p.toYear.intValue() < thisYear) throw BidTargetService.conflict("YEAR_PASSED", YEAR_PASSED_MSG, p.cur);
                    if (BidSubjects.MAIN_BANK.equals(p.subject) && p.toYear.intValue() == thisYear) targets.closedCheck(p.inst, today);
                }
                return p;
            }
            case OP_CANCEL:
                if (x.getCancelReasonCd() == null || !codes.enabled(BidTargetRules.G_CANCEL, x.getCancelReasonCd())) throw invalid("빼는 사유가 더 이상 쓰이지 않습니다.", p.cur);
                p.cancelCd = x.getCancelReasonCd(); p.cancelEtc = x.getCancelReasonEtc();
                targets.requireNoActivePrep(p.inst, BidTargetService.PREP_ACTIVE_APPROVE_MSG);   // 11-27 — 요청 뒤 준비가 시작됐을 수 있어 승인 때 다시(결재자용 문장)
                return p;
            case OP_TO_WATCH:
                targets.checkWatchOverlap(p.inst, p.cur.getTargetNo(), requesterEmp);
                targets.requireNoActivePrep(p.inst, BidTargetService.PREP_ACTIVE_APPROVE_MSG);   // 11-27 PREP_ACTIVE(결재자용 문장)
                return p;
            default: {   // TO_GOAL
                p.toYear = x.getToYear();
                if (p.toYear == null || p.toYear.intValue() < thisYear) throw BidTargetService.conflict("YEAR_PASSED", YEAR_PASSED_MSG, p.cur);
                if (!codes.enabled(BidSubjects.GROUP, p.subject) || (!targets.multiSubject() && !BidSubjects.MAIN_BANK.equals(p.subject))) {
                    throw invalid("입찰 대상이 더 이상 쓰이지 않습니다.", p.cur);
                }
                boolean mainTo = BidSubjects.MAIN_BANK.equals(p.subject);
                p.aim = mainTo ? p.cur.getAimRankCd() : null; p.aimEtc = mainTo ? p.cur.getAimRankEtc() : null;
                if (mainTo && p.toYear.intValue() == thisYear) targets.closedCheck(p.inst, today);
                return p;
            }
        }
    }

    /** 한 항목을 INST_BID_TARGET 한 행으로. 같은 요청에 같은 기관의 여러 ADD 가 있어도 항목마다 MAX+1 을 다시 읽어 번호가 겹치지 않는다. */
    private Map<String, Object> write(Planned p, Actor actor, BoardUiIds.Ui ui, Long reqId, String watchOwner) {
        BidTarget row;
        // 같은 요청에 같은 기관의 여러 ADD 가 있어도 항목마다 MAX+1 을 다시 읽어 번호가 겹치지 않는다(앞 ADD 행이 먼저 INSERT 됨, 066)
        boolean fillCaseRank = OP_EDIT.equals(p.op) && targets.checkRankLock(p.cur, p.aim);   // 순위 잠금 재확인(같은 잠금 안 — 앞 판정과 같다). 미정→값이면 공고 순위도 채운다
        if (OP_ADD.equals(p.op)) {
            row = new BidTarget();
            row.setInstitutionId(p.inst);
            row.setTargetNo(mapper.selectMaxTargetNo(p.inst) + 1);
            row.setRevNo(1);
        } else {
            row = p.cur;
            row.setRevNo(p.cur.getRevNo() + 1);
        }
        if (row.getTargetNo() > BidTargetService.NO_MAX || row.getRevNo() > BidTargetService.NO_MAX) {
            throw BidTargetService.conflict("LIMIT", BidTargetService.LIMIT_MSG, p.cur);
        }
        row.setCancelReasonCd(null); row.setCancelReasonEtc(null);
        if (OP_ADD.equals(p.op) || OP_EDIT.equals(p.op)) {
            row.setActionCd(BidTargetService.ACTION_SAVE); row.setKindCd(BidTargetRules.KIND_GOAL); row.setTargetYear(p.toYear);
            row.setTagCd(p.tag); row.setMemo(p.memo); row.setOwnerEmpNo(p.owner); row.setOwnerName(p.ownerName);
            row.setAimRankCd(p.aim);
            row.setAimRankEtc(p.aimEtc);
            if (OP_ADD.equals(p.op)) {   // 새 건 — 대상·공고 연결(연결은 제안 확정 때 새 REV 로 적는다). 고치기는 건의 대상·연결을 그대로 이어간다
                row.setBidSubjectCd(p.subject); row.setBidSubjectEtc(p.subjectEtc); row.setBidCaseId(null);
            }
            row.setWatchEmpNo(null);
        } else if (OP_CANCEL.equals(p.op)) {
            row.setActionCd(BidTargetService.ACTION_CANCEL); row.setCancelReasonCd(p.cancelCd); row.setCancelReasonEtc(p.cancelEtc);
            row.setBidCaseId(null);   // 빼기 REV 는 연결 없음(앞 REV 에 이력이 남는다)
        } else if (OP_TO_WATCH.equals(p.op)) {
            row.setActionCd(BidTargetService.ACTION_MOVE); row.setKindCd(BidTargetRules.KIND_WATCH); row.setTargetYear(null);
            row.setWatchEmpNo(watchOwner);   // 061 — 요청자의 관심(바로 반영이면 본인)
            BidTargetService.clearForWatch(row);   // 관심 행 = 대상 없음(MAIN_BANK)·기타 이름 없음·공고 연결 없음 (금고 순위는 남긴다 — 063 팀 정본)
        } else {
            row.setActionCd(BidTargetService.ACTION_MOVE); row.setKindCd(BidTargetRules.KIND_GOAL); row.setTargetYear(p.toYear);
            row.setWatchEmpNo(null);   // 관심→목표 = 팀 목표
            row.setBidSubjectCd(p.subject); row.setBidSubjectEtc(p.subjectEtc); row.setAimRankCd(p.aim); row.setAimRankEtc(p.aimEtc); row.setBidCaseId(null);
        }
        Map<String, Object> out = targets.insert(row, actor, ui, reqId);
        if (fillCaseRank) mapper.updateCaseRankIfNull(p.cur.getBidCaseId(), p.aim);
        return out;
    }

    // ── 감사·카드 ─────────────────────────────────────────────────

    /** 결재 행위 1행 — 누가(사번·이름·자기신고 여부)·어느 화면·버튼·근거. 결재와 같은 트랜잭션. */
    public void recordAct(Long reqId, String act, String basis, SysUser me, Actor actor, BoardUiIds.Ui ui) {
        BoardUiIds.Ui u = ui == null ? BoardUiIds.unknown() : ui;
        BidTargetReqAct a = new BidTargetReqAct();
        a.setReqId(reqId); a.setActCd(act); a.setActorBasis(basis);
        a.setActorEmpNo(me.getEmpNo()); a.setActorName(me.getName());
        a.setEmpVerified(actor != null && actor.isVerified() ? 1 : 0);
        a.setScreenId(u.getScreen()); a.setButtonId(u.getButton()); a.setUiValid(u.isValid() ? 1 : 0);
        a.setActedAt(Times.nowIso());
        mapper.insertReqAct(a);
    }

    /** 결재 카드 — 기관·동작·이전→이후. 사번은 넣지 않는다. */
    public List<Map<String, Object>> itemsOf(Long reqId) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BidTargetReqItem x : mapper.selectReqItems(reqId)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("item_no", x.getItemNo());
            m.put("institution_id", x.getInstitutionId());
            m.put("institution_name", x.getInstitutionName());
            m.put("op_cd", x.getOpCd());
            m.put("target_no", x.getTargetNo());
            Map<String, Object> before = null;
            if (x.getBaseRevNo() != null) {
                before = new LinkedHashMap<String, Object>();
                before.put("kind_cd", x.getBaseKindCd()); before.put("target_year", x.getBaseYear());
                before.put("tag_name", x.getBaseTagName()); before.put("memo", x.getBaseMemo() == null ? "" : x.getBaseMemo());
                before.put("owner_name", x.getBaseOwnerName());
                before.put("aim_rank_cd", x.getBaseAimRankCd()); before.put("aim_rank_name", x.getBaseAimRankName());
                before.put("aim_rank_etc", x.getBaseAimRankEtc());   // 066 — 기타 이름(손 입력 — 화면 이스케이프)
            }
            m.put("before", before);
            m.put("to_year", x.getToYear());
            m.put("tag_name", x.getTagName());
            boolean aimKept = !OP_ADD.equals(x.getOpCd()) && !OP_EDIT.equals(x.getOpCd());   // TO_GOAL·TO_WATCH·CANCEL 은 금고 방식을 건드리지 않는다 — '이후'도 이전 값(security 11-25 4번)
            m.put("aim_rank_cd", aimKept ? x.getBaseAimRankCd() : x.getAimRankCd());
            m.put("aim_rank_name", aimKept ? x.getBaseAimRankName() : x.getAimRankName());
            m.put("aim_rank_etc", aimKept ? x.getBaseAimRankEtc() : x.getAimRankEtc());
            String subj = x.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : x.getBidSubjectCd();
            m.put("bid_subject_cd", subj);                                                                       // NEXT 125 — 카드 = 건
            m.put("bid_subject_name", BidSubjects.label(subj, x.getBidSubjectEtc(), x.getBidSubjectName()));     // ETC 손 이름 — 화면 이스케이프
            m.put("rank_state", BidTargetKeys.rankState(subj, aimKept ? x.getBaseAimRankCd() : x.getAimRankCd()));
            m.put("bid_title", BidSubjects.blankToNull(x.getBidTitle()));                                       // null = 공고 전
            m.put("memo", x.getMemo());
            m.put("owner_name", x.getOwnerName());
            m.put("cancel_reason_name", BidTargetRules.CANCEL_ETC.equals(x.getCancelReasonCd()) ? x.getCancelReasonEtc() : x.getCancelReasonName());
            m.put("warn_cd", x.getWarnCd());
            out.add(m);
        }
        return out;
    }

    // ── 도움 ─────────────────────────────────────────────────────

    private static BidTargetIn asIn(TargetChangeIn.Item it) {
        BidTargetIn in = new BidTargetIn();
        in.setTargetYear(it.getTargetYear()); in.setTagCd(it.getTagCd()); in.setMemo(it.getMemo()); in.setOwnerEmpNo(it.getOwnerEmpNo());
        in.setAimRankCd(it.getAimRankCd()); in.setAimRankEtc(it.getAimRankEtc());
        return in;
    }

    private static void fill(Planned p, BidTargetRules.Parsed v, String ownerName) {
        p.toYear = Integer.valueOf(v.year); p.tag = v.tag; p.memo = v.memo; p.owner = v.owner; p.ownerName = ownerName; p.aim = v.aim; p.aimEtc = v.aimEtc;
    }

    private static String warn(Map<String, Object> w) { return w == null ? null : "INST_BID_CLOSED"; }

    private static ApiException invalid(String why, BidTarget cur) {
        return BidTargetService.conflict("ITEM_INVALID", why + " 반려하고 다시 요청해 주세요.", cur);
    }

    private static ApiException item(int status, String code, String message, int itemNo) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code); d.put("message", message); d.put("item_no", itemNo);
        return ApiException.withDetail(status, d);
    }

    /** 항목 번호(와 기관 이름)를 오류 detail 에 더한다. 메시지는 서버 고정 문구뿐(입력값 없음). */
    static ApiException withItem(ApiException e, int itemNo, String instName) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        Object o = e.getDetailObject();
        if (o instanceof Map) {
            for (Map.Entry<?, ?> x : ((Map<?, ?>) o).entrySet()) d.put(String.valueOf(x.getKey()), x.getValue());
        } else {
            d.put("code", e.getStatus() == 404 ? "NOT_FOUND" : e.getStatus() == 422 ? "PII_DETECTED" : "BAD_VALUE");
            d.put("message", e.getMessage());
        }
        d.put("item_no", itemNo);
        if (instName != null) d.put("institution_name", instName);
        return ApiException.withDetail(e.getStatus(), d);
    }
}
