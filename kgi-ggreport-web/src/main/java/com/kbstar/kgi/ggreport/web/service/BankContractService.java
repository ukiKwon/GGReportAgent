package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BankContractCode;
import com.kbstar.kgi.ggreport.web.domain.BankContractInst;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BankContractCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BankContractIn;
import com.kbstar.kgi.ggreport.web.mapper.BankContractMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * 금고 약정 기록(039, NEXT 72·88·89) — 추가 전용. 고치기 = 같은 줄 새 REV, 지우기 = CANCEL 행. 기관 행 FOR UPDATE 로 직렬화.
 * 저장 자격 = 기관 레코드 수정 권한 AND 영업팀·영업팀장·영업부장. NoticeRoundService.canJudge 와 같은 두 줄을 복제했다(공고 정책과 갈라질 수 있어
 * 의존하지 않음) — 어긋나지 않는지는 BankContractApiTest 의 일치 시험이 본다. 나중에 PermissionService 한 메서드로 올릴 것.
 * 줄 권한(S6, 사용자 답 11-17): 고치기 = 영업팀 누구나, 취소 = 입력한 본인 또는 영업팀장·영업부장({@link HeadRules#isLead}).
 * ⚠️ 수정자는 Actor(X-Emp-No 자기신고일 수 있음)로만 채운다 — 본문의 수정자 값은 받지 않는다. 응답 emp_verified 가 그 표시(표지는 화면).
 * contractExpiry·OURS_SCOPE 는 건드리지 않는다.
 */
@Service
public class BankContractService {

    static final String ACTION_SAVE = "SAVE";
    static final String ACTION_CANCEL = "CANCEL";
    static final String ORIGIN_MANUAL = "MANUAL";
    static final int HISTORY_MAX = 200;

    private final BankContractMapper mapper;
    private final SysUserMapper users;
    private final PermissionService permissions;

    public BankContractService(BankContractMapper mapper, SysUserMapper users, PermissionService permissions) {
        this.mapper = mapper;
        this.users = users;
        this.permissions = permissions;
    }

    /** 컨트롤러 403 과 current() 의 can_edit 가 이 함수 하나를 쓴다. ⚠️ 자기신고 위의 업무 규칙(사칭 방지 아님). */
    @Transactional(readOnly = true)
    public boolean canEdit(String empNo) {
        if (empNo == null || !permissions.canEditInstitution(empNo)) return false;
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && HeadRules.isSales(u.getRole());
    }

    /** 줄 권한은 이 메서드 하나. 고치기는 canEdit 를 통과한 영업팀 누구나, 취소는 입력한 본인(EDITOR_EMP_NO 일치) 또는 영업팀장·부장. */
    private boolean canChangeLine(BankContract cur, Actor actor, boolean cancel) {
        if (!cancel) return true;
        // 입력자 본인 = 줄을 처음 만든 사람(REV_NO=1). 남이 고쳐 최신 수정자가 바뀌어도 원 입력자 기준(security S6-a)
        String first = mapper.selectFirstEditor(cur.getInstitutionId(), cur.getContractNo());
        if (first != null && first.equals(actor.getEmpNo())) return true;
        SysUser u = users.selectByEmpNo(actor.getEmpNo());
        return u != null && HeadRules.isLead(u.getRole());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> current(String instRaw, String empNo) {
        String inst = requireInstId(instRaw);
        BankContractInst ref = mapper.selectInstitution(inst);
        if (ref == null) throw ApiException.notFound("institution not found");
        LocalDate today = LocalDate.parse(Times.todayKst());
        List<BankContract> rows = new ArrayList<BankContract>(mapper.selectLatestValid(inst));
        Collections.sort(rows, LINE_ORDER);
        List<Map<String, Object>> lines = new ArrayList<Map<String, Object>>();
        for (BankContract c : rows) {
            Map<String, Object> v = view(c, today, false);
            v.put("overlap_with", overlapWith(c, rows));   // 지금 유효한 같은 순위 줄 중 기간이 겹치는 줄 번호(화면 겹침 표시용)
            lines.add(v);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", inst);
        out.put("lines", lines);
        out.put("history_count", mapper.countRows(inst));
        out.put("can_edit", canEdit(empNo));
        out.put("today", today.toString());
        out.put("codes", codes(ref.getType()));
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> history(String instRaw) {
        String inst = requireInstId(instRaw);
        if (mapper.selectInstitution(inst) == null) throw ApiException.notFound("institution not found");
        LocalDate today = LocalDate.parse(Times.todayKst());
        List<BankContract> rows = mapper.selectHistory(inst, new RowBounds(0, HISTORY_MAX));
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (BankContract c : rows) items.add(view(c, today, true));
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", inst);
        out.put("items", items);
        out.put("truncated", rows.size() >= HISTORY_MAX);
        return out;
    }

    /** 호출 전에 컨트롤러가 requireInstitutionEdit 와 {@link #canEdit} 를 지난다. */
    @Transactional
    public Map<String, Object> save(String instRaw, BankContractIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        if (in == null) throw ApiException.badRequest("저장할 내용이 없습니다.");
        // ⚠️ 첫 DB 문장은 기관 행 잠금(MySQL RR 첫 일관 읽기 — NoticeRoundService.save 와 같은 이유). 위에 SELECT 를 끼우지 않는다.
        BankContractInst ref = mapper.lockInstitution(inst);
        if (ref == null) throw ApiException.notFound("institution not found");
        LocalDate today = LocalDate.parse(Times.todayKst());
        BankContractRules.Parsed p = BankContractRules.parse(in, ref.getType(), today, codeCheck());
        int contractNo;
        int rev;
        Integer excludeLine = null;   // 겹침 검사에서 뺄 자기 줄
        BankContract prev = null;     // 고치기일 때의 직전 rev(겹침 확인 이어받기·처음 입력자 복사용)
        if (in.getContractNo() == null) {
            contractNo = mapper.selectMaxContractNo(inst) + 1;
            rev = 1;
        } else {
            BankContract cur = mapper.selectLatestLine(inst, in.getContractNo());
            if (cur == null) throw ApiException.notFound("contract not found");
            if (ACTION_CANCEL.equals(cur.getActionCd())) {
                throw conflict("ALREADY_CANCELLED", "이미 취소된 약정입니다. 새 약정으로 추가하세요.", cur);
            }
            if (!canChangeLine(cur, actor, false)) throw new ApiException(403, "이 약정 줄은 고칠 수 없습니다.");
            if (in.getBaseRevNo() == null) throw ApiException.badRequest("고칠 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
            if (in.getBaseRevNo() != cur.getRevNo()) {
                throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", cur);
            }
            if (BankContractRules.same(cur, p)) {
                Map<String, Object> out = new LinkedHashMap<String, Object>();
                out.put("saved", false);
                out.put("code", "NO_CHANGE");
                out.put("contract_no", cur.getContractNo());
                out.put("rev_no", cur.getRevNo());
                return out;
            }
            contractNo = cur.getContractNo();
            rev = cur.getRevNo() + 1;
            excludeLine = cur.getContractNo();
            prev = cur;
        }
        // S2 — 같은 순위에서 기간이 겹치는 유효 줄. 확인(confirm_overlap)하면 저장하고 줄에 겹침 표시를 남긴다.
        List<BankContract> over = findOverlaps(inst, p, excludeLine);
        boolean overlapConfirmed = false;
        if (!over.isEmpty()) {
            // 직접 확인했거나, 직전 rev 가 확인했고 순위·은행·기간이 그대로면 이어받는다(비고만 고쳐도 다시 묻지 않음).
            // 새 rev 의 OVERLAP_CONFIRMED=1 이 이력에 남는다. 하나라도 바뀌어 여전히 겹치면 409 DUP_RANK.
            if (!Boolean.TRUE.equals(in.getConfirmOverlap()) && !BankContractRules.carriesOverlap(prev, p)) throw dupRank(over);
            overlapConfirmed = true;
        }
        BankContract row = new BankContract();
        row.setInstitutionId(inst);
        row.setContractNo(contractNo);
        row.setRevNo(rev);
        row.setActionCd(ACTION_SAVE);
        row.setOriginCd(ORIGIN_MANUAL);
        row.setRankCd(p.rank);
        row.setBankCd(p.bank);
        row.setBankNameEtc(p.bankEtc);
        row.setTermFrom(p.termFrom);
        row.setTermTo(p.termTo);
        row.setSrcKind(p.srcKind);
        row.setSrcUrl(p.srcUrl);
        row.setSrcNo(p.srcNo);
        row.setCheckedDate(p.checkedDate);
        row.setCheckedDept(p.checkedDept);
        row.setNote(p.note);
        row.setAccountCd(p.account);
        row.setAccountEtc(p.accountEtc);
        row.setOverlapConfirmed(overlapConfirmed ? 1 : 0);
        if (prev != null) {   // 응답용: 처음 입력자는 줄이 이어지는 동안 그대로
            row.setFirstEditorEmpNo(prev.getFirstEditorEmpNo());
            row.setFirstEditorName(prev.getFirstEditorName());
            row.setFirstSavedAt(prev.getFirstSavedAt());
        }
        return insert(row, actor, ui, today);
    }

    @Transactional
    public Map<String, Object> cancel(String instRaw, String contractNoRaw, BankContractCancelIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        int no = requireContractNo(contractNoRaw);
        if (in == null || in.getBaseRevNo() == null) throw ApiException.badRequest("취소할 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
        BankContractInst ref = mapper.lockInstitution(inst);   // 첫 DB 문장
        if (ref == null) throw ApiException.notFound("institution not found");
        BankContract cur = mapper.selectLatestLine(inst, no);
        if (cur == null) throw ApiException.notFound("contract not found");
        if (ACTION_CANCEL.equals(cur.getActionCd())) throw conflict("ALREADY_CANCELLED", "이미 취소된 약정입니다.", cur);
        if (!canChangeLine(cur, actor, true)) throw new ApiException(403, "이 약정 줄은 입력한 본인이나 영업팀장·영업부장만 취소할 수 있습니다.");
        if (in.getBaseRevNo() != cur.getRevNo()) {
            throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 취소하세요.", cur);
        }
        BankContractRules.CancelParsed cp = BankContractRules.parseCancel(in, codeCheck());   // S10 사유 필수
        cur.setRevNo(cur.getRevNo() + 1);   // 값은 직전 행 그대로 복사, 행동·사유·수정자만 새로
        cur.setActionCd(ACTION_CANCEL);
        cur.setOriginCd(ORIGIN_MANUAL);
        cur.setCancelReasonCd(cp.reasonCd);
        cur.setCancelReasonEtc(cp.reasonEtc);
        return insert(cur, actor, ui, LocalDate.parse(Times.todayKst()));
    }

    private Map<String, Object> insert(BankContract row, Actor actor, BoardUiIds.Ui ui, LocalDate today) {
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !HeadRules.isSales(me.getRole())) {   // 컨트롤러 canEdit 가 막는다(방어)
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        row.setEditorEmpNo(actor.getEmpNo());
        row.setEditorName(me.getName());
        row.setEmpVerified(actor.isVerified() ? 1 : 0);
        row.setScreenId(ui.getScreen());
        row.setButtonId(ui.getButton());
        row.setUiValid(ui.isValid() ? 1 : 0);
        row.setSavedAt(Times.nowIso());
        if (row.getRevNo() == 1) {   // 새 줄은 자기 자신이 처음 입력자(고치기·취소는 직전 행에서 복사돼 온다)
            row.setFirstEditorEmpNo(row.getEditorEmpNo());
            row.setFirstEditorName(row.getEditorName());
            row.setFirstSavedAt(row.getSavedAt());
        }
        try {
            mapper.insertRow(row);
        } catch (DuplicateKeyException e) {   // 잠금이 있어 정상 경로에선 오지 않는다 — PK 가 마지막 방어선
            throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", null);
        }
        row.setBankName(nameOf(BankContractRules.G_BANK, row.getBankCd()));
        row.setCancelReasonName(row.getCancelReasonCd() == null ? null : nameOf(BankContractRules.G_CANCEL, row.getCancelReasonCd()));
        row.setAccountName(row.getAccountCd() == null ? null : nameOf(BankContractRules.G_ACCOUNT, row.getAccountCd()));
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("saved", true);
        out.put("institution_id", row.getInstitutionId());
        out.put("contract_no", row.getContractNo());
        out.put("rev_no", row.getRevNo());
        out.put("action_cd", row.getActionCd());
        out.put("line", view(row, today, true));
        return out;
    }

    // ---- S2 겹침 ----

    private List<BankContract> findOverlaps(String inst, BankContractRules.Parsed p, Integer excludeLine) {
        List<BankContract> out = new ArrayList<BankContract>();
        if ("NONE".equals(p.rank)) return out;   // 순위 없음은 검사 안 함(1·2금고는 같은 순위, 공동은 같은 은행만)
        for (BankContract c : mapper.selectLatestValid(inst)) {
            if (excludeLine != null && c.getContractNo() == excludeLine) continue;
            if (p.rank.equals(c.getRankCd())
                    && BankContractRules.overlapScope(p.rank, p.bank, p.bankEtc, c.getBankCd(), c.getBankNameEtc())
                    && BankContractRules.overlaps(c.getTermFrom(), c.getTermTo(), p.termFrom, p.termTo)) out.add(c);
        }
        Collections.sort(out, LINE_ORDER);
        return out;
    }

    private List<Integer> overlapWith(BankContract c, List<BankContract> all) {
        List<Integer> out = new ArrayList<Integer>();
        if ("NONE".equals(c.getRankCd())) return out;
        for (BankContract o : all) {
            if (o.getContractNo() != c.getContractNo() && c.getRankCd().equals(o.getRankCd())
                    && BankContractRules.overlapScope(c.getRankCd(), c.getBankCd(), c.getBankNameEtc(), o.getBankCd(), o.getBankNameEtc())
                    && BankContractRules.overlaps(c.getTermFrom(), c.getTermTo(), o.getTermFrom(), o.getTermTo())) {
                out.add(o.getContractNo());
            }
        }
        return out;
    }

    private static ApiException dupRank(List<BankContract> over) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        for (BankContract c : over) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("contract_no", c.getContractNo());
            m.put("rev_no", c.getRevNo());
            m.put("rank_cd", c.getRankCd());
            m.put("bank_name", bankLabel(c));
            m.put("term_from", c.getTermFrom());
            m.put("term_to", c.getTermTo());
            m.put("editor_name", c.getEditorName());
            list.add(m);
        }
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "DUP_RANK");
        d.put("message", "같은 순위에 기간이 겹치는 약정이 있습니다. 확인한 뒤 겹침을 알고 저장하려면 확인 표시를 하고 다시 저장하세요.");
        d.put("overlaps", list);
        return ApiException.withDetail(409, d);
    }

    // ---- 코드표 ----

    private BankContractRules.CodeCheck codeCheck() {
        return new BankContractRules.CodeCheck() {
            @Override
            public boolean enabled(String group, String code) {
                return mapper.countEnabledCode(group, code) > 0;   // ENABLED=1 만 — X01·X02 는 false
            }
            @Override
            public List<String> names(String group) {
                List<String> o = new ArrayList<String>();
                for (BankContractCode c : mapper.selectCodes(group)) o.add(c.getCodeName());
                return o;
            }
        };
    }

    private String nameOf(String group, String code) {
        for (BankContractCode c : mapper.selectCodes(group)) {
            if (c.getCode().equals(code)) return c.getCodeName();
        }
        return null;
    }

    private Map<String, Object> codes(String instType) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("banks", codeList(mapper.selectCodes(BankContractRules.G_BANK), null));
        m.put("ranks", codeList(mapper.selectCodes(BankContractRules.G_RANK), instType));
        m.put("src_kinds", codeList(mapper.selectCodes(BankContractRules.G_SRC), null));
        m.put("cancel_reasons", codeList(mapper.selectCodes(BankContractRules.G_CANCEL), null));
        // 지자체·교육청 외에는 빈 목록 = 화면이 칸을 숨기는 근거
        m.put("accounts", BankContractRules.fixedRankType(instType)
                ? codeList(mapper.selectCodes(BankContractRules.G_ACCOUNT), null) : new ArrayList<Map<String, Object>>());
        return m;
    }

    private static List<Map<String, Object>> codeList(List<BankContractCode> rows, String rankInstType) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BankContractCode c : rows) {
            if (rankInstType != null && !BankContractRules.rankAllowed(c.getCode(), rankInstType)) continue;
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("code", c.getCode());
            m.put("name", c.getCodeName());
            out.add(m);
        }
        return out;
    }

    /** 1금고→2금고→순위 없음→공동, 같은 순위면 끝 날짜 늦은 것, 그다음 줄 번호 큰 것. */
    private static final Comparator<BankContract> LINE_ORDER = new Comparator<BankContract>() {
        @Override
        public int compare(BankContract a, BankContract b) {
            int ra = rankIdx(a.getRankCd()), rb = rankIdx(b.getRankCd());
            if (ra != rb) return ra - rb;
            LocalDate ea = BankContractRules.endOrNull(a.getTermTo()), eb = BankContractRules.endOrNull(b.getTermTo());
            if (ea != null && eb != null && !ea.equals(eb)) return eb.compareTo(ea);
            if (ea == null ^ eb == null) return ea == null ? 1 : -1;
            return b.getContractNo() - a.getContractNo();
        }
    };

    private static int rankIdx(String r) {
        int i = BankContractRules.RANK_ORDER.indexOf(r);
        return i < 0 ? 99 : i;
    }

    private static String bankLabel(BankContract c) {
        return BankContractRules.BANK_ETC.equals(c.getBankCd()) ? c.getBankNameEtc() : c.getBankName();
    }

    /** 화면용 한 줄. 사번·화면·버튼·UI_VALID 는 내보내지 않는다(감사 전용). emp_verified=false 는 자기신고 표시(표지는 화면). */
    private static Map<String, Object> view(BankContract c, LocalDate today, boolean withAction) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("contract_no", c.getContractNo());
        m.put("rev_no", c.getRevNo());
        if (withAction) m.put("action_cd", c.getActionCd());
        m.put("origin_cd", c.getOriginCd());
        m.put("rank_cd", c.getRankCd());
        m.put("bank_cd", c.getBankCd());
        m.put("bank_name", bankLabel(c));
        m.put("bank_name_etc", c.getBankNameEtc());
        m.put("term_from", c.getTermFrom());
        m.put("term_to", c.getTermTo());
        m.put("term_state", BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today));
        m.put("src_kind", c.getSrcKind());
        m.put("src_url", c.getSrcUrl());
        m.put("src_no", c.getSrcNo());
        m.put("checked_date", c.getCheckedDate());
        m.put("checked_dept", c.getCheckedDept());
        m.put("note", c.getNote() == null ? "" : c.getNote());
        m.put("account_cd", c.getAccountCd());
        m.put("account_name", BankContractRules.ACCOUNT_ETC.equals(c.getAccountCd()) ? c.getAccountEtc() : c.getAccountName());
        m.put("account_etc", c.getAccountEtc());
        m.put("overlap_confirmed", c.getOverlapConfirmed() == 1);   // 저장할 때 겹침을 알고 확인한 줄
        if (withAction) {
            m.put("cancel_reason_cd", c.getCancelReasonCd());
            m.put("cancel_reason_name", BankContractRules.CANCEL_ETC.equals(c.getCancelReasonCd()) ? c.getCancelReasonEtc() : c.getCancelReasonName());
        }
        m.put("editor_name", c.getEditorName());
        m.put("emp_verified", c.getEmpVerified() == 1);
        m.put("saved_at", c.getSavedAt());
        m.put("first_editor_name", c.getFirstEditorName());   // 줄을 처음 만든 사람(REV_NO=1 행 조인). 사번은 내보내지 않는다
        m.put("first_saved_at", c.getFirstSavedAt());
        return m;
    }

    private static String requireInstId(String raw) {
        if (!InstitutionHeadService.validInstId(raw)) throw ApiException.notFound("institution not found");
        return raw;
    }

    private static int requireContractNo(String raw) {
        if (raw == null || !raw.matches("[1-9][0-9]{0,8}")) throw ApiException.notFound("contract not found");
        return Integer.parseInt(raw);
    }

    private static ApiException conflict(String code, String message, BankContract cur) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        Map<String, Object> latest = null;
        if (cur != null) {
            latest = new LinkedHashMap<String, Object>();
            latest.put("contract_no", cur.getContractNo());
            latest.put("rev_no", cur.getRevNo());
            latest.put("action_cd", cur.getActionCd());
            latest.put("editor_name", cur.getEditorName());
            latest.put("saved_at", cur.getSavedAt());
        }
        d.put("latest", latest);
        return ApiException.withDetail(409, d);
    }
}
