package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.*;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
    static final int HISTORY_MAX = 200;
    static final int SUMMARY_MAX = 5000;
    static final int NO_MAX = 999999;   // TARGET_NO·REV_NO 칸(6자리)
    public static final String DENIED_MSG = "올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.";
    static final String OWNER_MSG = "주 담당은 영업부서 직원 중에서 골라 주세요.";
    private static final String YEAR_MSG = "연도는 YYYY 형식(1990~2100)이어야 합니다.";
    private static final String LIMIT_MSG = "이 기관의 목표 기록이 더 늘릴 수 없는 한도에 닿았습니다.";

    private final BidTargetMapper mapper;
    private final SysUserMapper users;
    private final PermissionService permissions;
    private final int delayDays;

    public BidTargetService(BidTargetMapper mapper, SysUserMapper users, PermissionService permissions,
                            @Value("${ggreport.bid-board.delay-days:30}") int delayDays) {
        if (delayDays < 1 || delayDays > 180) throw new IllegalStateException("ggreport.bid-board.delay-days must be between 1 and 180");
        this.mapper = mapper;
        this.users = users;
        this.permissions = permissions;
        this.delayDays = delayDays;
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
        int year = yearParam(yearRaw, today.getYear());
        boolean edit = canEdit(empNo);
        Map<String, List<BankContract>> lines = byInstitution(mapper.selectContractsForYear(year));
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (BidTarget t : mapper.selectActiveByYear(year)) {
            Map<String, Object> v = view(t, false, edit);
            v.put("edited_by_other", editedByOther(t));
            v.put("can_cancel", edit);
            v.put("bank", BankYears.summary(lines.get(t.getInstitutionId()), today));
            items.add(v);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("year", year);
        out.put("today", today.toString());
        out.put("delay_days", delayDays);
        out.put("can_edit", edit);
        out.put("selectable_years", selectableYears(today.getYear()));
        out.put("items", items);
        out.put("codes", codes());
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> history(String instRaw) {
        String inst = requireInstId(instRaw);
        if (mapper.selectInstitution(inst) == null) throw ApiException.notFound("institution not found");
        List<BidTarget> rows = mapper.selectHistory(inst, new RowBounds(0, HISTORY_MAX + 1));   // 상한+1개를 읽어 정확히 판정(QA P3-2)
        boolean truncated = rows.size() > HISTORY_MAX;
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (BidTarget t : truncated ? rows.subList(0, HISTORY_MAX) : rows) items.add(view(t, true, false));
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
        int thisYear = today().getYear();
        BidTarget cur = null;
        if (in.getTargetNo() != null) {
            cur = mapper.selectLatestTarget(inst, in.getTargetNo());
            if (cur == null) throw ApiException.notFound("target not found");
            if (ACTION_CANCEL.equals(cur.getActionCd())) {
                throw conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다. 다시 넣으려면 새로 추가하세요.", cur);
            }
            if (in.getBaseRevNo() == null) throw ApiException.badRequest("고칠 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
            if (in.getBaseRevNo() != cur.getRevNo()) {
                throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.", cur);
            }
        }
        BidTargetRules.Parsed p = BidTargetRules.parse(in, thisYear, cur == null ? null : Integer.valueOf(cur.getTargetYear()), codeCheck());
        String ownerName = ownerName(p.owner, cur);
        if (cur != null && BidTargetRules.same(cur, p)) {
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("saved", false);
            out.put("code", "NO_CHANGE");
            out.put("target_no", cur.getTargetNo());
            out.put("rev_no", cur.getRevNo());
            return out;
        }
        for (BidTarget o : mapper.selectActiveByInst(inst)) {
            if (cur != null && o.getTargetNo() == cur.getTargetNo()) continue;
            if (o.getTargetYear() == p.year) throw conflict("DUP_TARGET", "이 기관은 같은 연도 목표에 이미 들어 있습니다.", o);
        }
        int newNo = cur == null ? mapper.selectMaxTargetNo(inst) + 1 : cur.getTargetNo();
        int newRev = cur == null ? 1 : cur.getRevNo() + 1;
        if (newNo > NO_MAX || newRev > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, cur);   // S4 — 6자리 칸 넘침은 DB 오류가 아니라 409
        BidTarget row = new BidTarget();
        row.setInstitutionId(inst);
        row.setTargetNo(newNo);
        row.setRevNo(newRev);
        row.setActionCd(ACTION_SAVE);
        row.setTargetYear(p.year);
        row.setTagCd(p.tag);
        row.setMemo(p.memo);
        row.setOwnerEmpNo(p.owner);
        row.setOwnerName(ownerName);
        return insert(row, actor, ui);
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
        if (ACTION_CANCEL.equals(cur.getActionCd())) throw conflict("ALREADY_CANCELLED", "이미 목표에서 뺀 기록입니다.", cur);
        if (in.getBaseRevNo() != cur.getRevNo()) throw conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 빼 주세요.", cur);
        BidTargetRules.CancelParsed cp = BidTargetRules.parseCancel(in, codeCheck());
        if (cur.getRevNo() + 1 > NO_MAX) throw conflict("LIMIT", LIMIT_MSG, cur);   // S4
        cur.setRevNo(cur.getRevNo() + 1);   // 값은 직전 행 그대로, 행동·사유·수정자만 새로
        cur.setActionCd(ACTION_CANCEL);
        cur.setCancelReasonCd(cp.reasonCd);
        cur.setCancelReasonEtc(cp.reasonEtc);
        return insert(cur, actor, ui);
    }

    private Map<String, Object> insert(BidTarget row, Actor actor, BoardUiIds.Ui ui) {
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !HeadRules.isSales(me.getRole())) throw new ApiException(403, DENIED_MSG);   // 컨트롤러가 먼저 막는다(방어)
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
    private String ownerName(String owner, BidTarget cur) {
        if (owner == null) return null;
        if (cur != null && owner.equals(cur.getOwnerEmpNo())) return cur.getOwnerName();
        SysUser o = users.selectByEmpNo(owner);
        if (o == null || !"ACTIVE".equals(o.getStatus()) || !HeadRules.isSales(o.getRole())) throw ApiException.badRequest(OWNER_MSG);
        return o.getName();
    }

    static boolean editedByOther(BidTarget t) {
        String f = t.getFirstEditorEmpNo(), e = t.getEditorEmpNo();
        return f != null && e != null && !f.equals(e);
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

    private BankContractRules.CodeCheck codeCheck() {
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
        m.put("tags", codeList(BidTargetRules.G_TAG));
        m.put("cancel_reasons", codeList(BidTargetRules.G_CANCEL));
        return m;
    }

    private List<Map<String, Object>> codeList(String group) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BankContractCode c : mapper.selectCodes(group)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("code", c.getCode()); m.put("name", c.getCodeName()); out.add(m);
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
        m.put("target_year", t.getTargetYear());
        m.put("tag_cd", t.getTagCd());
        m.put("tag_name", t.getTagName());
        m.put("memo", t.getMemo() == null ? "" : t.getMemo());
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

    private static ApiException conflict(String code, String message, BidTarget cur) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        Map<String, Object> latest = null;
        if (cur != null) {
            latest = new LinkedHashMap<String, Object>();
            latest.put("target_no", cur.getTargetNo());
            latest.put("rev_no", cur.getRevNo());
            latest.put("action_cd", cur.getActionCd());
            latest.put("target_year", cur.getTargetYear());
            latest.put("editor_name", cur.getEditorName());
            latest.put("saved_at", cur.getSavedAt());
        }
        d.put("latest", latest);
        return ApiException.withDetail(409, d);
    }
}
