package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.kbstar.kgi.ggreport.web.docout.DocModel;
import com.kbstar.kgi.ggreport.web.docout.DocxKit;
import com.kbstar.kgi.ggreport.web.docout.Groups;
import com.kbstar.kgi.ggreport.web.docout.InstSummaryDocBuilder;
import com.kbstar.kgi.ggreport.web.docout.InstSummaryTpl;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.PrepForm;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVer;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVerRow;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepFormIn;
import com.kbstar.kgi.ggreport.web.mapper.PrepFormMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.service.InstSummaryPrefill.BizSeed;
import com.kbstar.kgi.ggreport.web.service.InstSummaryPrefill.Fact;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * 사전준비 양식 '기관 정보 요약'(T1, 049) — 미리 채움·저장(판 추가)·확정·확정 취소·판 목록·.docx 출력. 정본 = 확정 판(CONFIRMED_VER)의 정규 JSON(SHA-256 박제),
 * 파일은 그 판에서 매번 다시 만든 출력물이다. 판은 추가만 하고 바꾸지 않는다.
 *
 * <p><b>권한</b>(⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다).
 * 열람·판 목록·내려받기: 영업팀의 그 건 활성 담당 ∨ 영업팀장 ∨ 영업부장 ∨ 그 건의 디자이너 작업(TASKS)이 본인에게 배정된 디자이너. 그 밖(옛 담당·전산·예산 포함)은 404.
 * 디자이너 판정은 BID_ASSIGNMENT 가 아니라 TASKS.ASSIGNEE 이며 빈 담당(선점 분기)은 쓰지 않는다(security 11-20 상-1).
 * 쓰기(미리 채움·저장·확정): 영업팀·영업팀장 <b>이면서</b> 그 건의 활성 담당. 확정 취소: 위와 같거나 영업팀장(비담당 포함). 그 밖은 403(건 조회보다 먼저).
 * 쓰기는 사전준비 상태 IN_PROGRESS 에서만(아니면 409 FORM_LOCKED), 확정된 양식은 먼저 [확정 취소](사유)를 해야 고친다(409 FORM_CONFIRMED).
 * 쓰기는 BID_PREP 행(FOR UPDATE) → BID_PREP_FORM 행 순서로 잠그고, 잠근 뒤 활성 담당을 한 번 더 확인한다(security 하-4).
 *
 * <p><b>감사</b>: 쓰기 4종의 성공 줄(BID_PREP_ACT, FORM_VER 포함)과 확정·확정 취소 업무 이력(BID_PREP_LOG)은 이 서비스가 <b>같은 트랜잭션</b>에서 쓴다(security 중-1).
 * 읽기·내려받기의 성공 줄과 모든 실패 줄은 컨트롤러가 기록한다. 값·사유·이름·파일명은 기록하지 않는다.
 *
 * <p><b>저장 형식</b>: 정규 JSON 문자열이 곧 저장본이고 해시는 그 문자열 UTF-8 의 SHA-256 이다(키 정렬·정수만). 같은 내용을 다시 저장·미리 채움해도 새 판을 만들지 않는다
 * ({@code changed:false}) — 그래서 미리 채움에서 값·ref 가 같은 칸은 이전 판의 출처(at 포함)를 그대로 둔다(security 중-2·중-3ⓐ).
 */
@Service
public class PrepFormService {

    static final String KIND_PREFILL = "PREFILL";
    static final String KIND_DRAFT = "DRAFT";
    static final String ACT_PREFILL = "FORM_PREFILL";
    static final String ACT_SAVE = "FORM_SAVE";
    static final String ACT_CONFIRM = "FORM_CONFIRM";
    static final String ACT_UNCONFIRM = "FORM_UNCONFIRM";

    private static final String DENIED = "이 기능을 쓸 권한이 없습니다.";
    private static final Pattern SAFE_KEY = Pattern.compile("[a-z_]{1,40}");
    private static final Pattern YEAR_KEY = Pattern.compile("[0-9]{4}");
    private static final Pattern AMOUNT = Pattern.compile("-?[0-9]{1,13}(\\.[0-9]{1,3})?");
    private static final String YEARS_MSG = "연도 범위는 1~" + Groups.MAX_YEAR_COLUMNS + "년으로 지정하세요.";
    private static final String DEFAULT_UNIT = "억원";
    private static final ObjectMapper JSON = new ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    private final PrepFormMapper forms;
    private final PrepMapper prepMapper;
    private final InstSummaryPrefill prefill;
    private final PrepFormAudit audit;
    private final DesignReviewService design;

    public PrepFormService(PrepFormMapper forms, PrepMapper prepMapper, InstSummaryPrefill prefill, PrepFormAudit audit,
                           DesignReviewService design) {
        this.forms = forms;
        this.prepMapper = prepMapper;
        this.prefill = prefill;
        this.audit = audit;
        this.design = design;
    }

    /** 내려받기 결과 — 파일 바이트·기관명(파일 이름용)·판 번호(감사용). */
    public static final class DocOut {
        private final byte[] bytes;
        private final String instName;
        private final int verNo;

        DocOut(byte[] bytes, String instName, int verNo) {
            this.bytes = bytes;
            this.instName = instName;
            this.verNo = verNo;
        }

        public byte[] getBytes() { return bytes; }
        public String getInstName() { return instName; }
        public int getVerNo() { return verNo; }
    }

    // ── 읽기 ────────────────────────────────────────────────────────────

    /** 양식 한 장(칸 지도·현재 판 내용·확정·낡은 칸·내 권한). 판이 없으면 content 는 null 이다. */
    @Transactional(readOnly = true)
    public Map<String, Object> view(SysUser me, String bid, String formCd) {
        BidPrep p = requireReader(me, bid);
        requireFormCd(formCd);
        return viewOf(me, p, forms.selectForm(bid, InstSummaryTpl.FORM_CD), p.getStateCd());
    }

    /** 판 목록(내용 제외) — 최신 판 먼저. 저장한 사람은 이름만. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> versions(SysUser me, String bid, String formCd) {
        requireReader(me, bid);
        requireFormCd(formCd);
        PrepForm f = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        Integer confirmed = f == null ? null : f.getConfirmedVer();
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (PrepFormVerRow r : forms.selectVers(bid, InstSummaryTpl.FORM_CD)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("ver_no", r.getVerNo());
            m.put("kind_cd", r.getKindCd());
            m.put("base_ver", r.getBaseVer());
            m.put("saved_by_name", r.getSavedByName());
            m.put("saved_at", r.getSavedAt());
            m.put("sha256", r.getContentSha256());
            m.put("confirmed", confirmed != null && confirmed.intValue() == r.getVerNo());
            out.add(m);
        }
        return out;
    }

    /**
     * .docx 출력 — confirmed=true 면 확정 판(없으면 409 NOT_CONFIRMED), false 면 현재 판(없으면 409 FORM_EMPTY, 제목에 '[확정 전 초안]').
     * 저장본을 다시 해시해 박제값과 다르면 409 FORM_INTEGRITY(확정본이 바뀌었으면 내보내지 않는다). 화면·버튼 식별자가 유효하지 않으면 400 UI_ID_REQUIRED.
     */
    @Transactional(readOnly = true)
    public DocOut docx(SysUser me, BoardUiIds.Ui ui, String bid, String formCd, boolean confirmed) {
        requireReader(me, bid);
        requireFormCd(formCd);
        requireUi(ui);
        PrepForm f = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        int verNo;
        if (confirmed) {
            if (f == null || f.getConfirmedVer() == null) {
                throw coded(409, "NOT_CONFIRMED", "확정된 양식이 없습니다.");
            }
            verNo = f.getConfirmedVer().intValue();
        } else {
            if (f == null || f.getCurVer() == 0) {
                throw coded(409, "FORM_EMPTY", "저장된 양식이 없습니다. 먼저 불러오기·저장을 하세요.");
            }
            verNo = f.getCurVer();
        }
        PrepFormVer v = loadVer(bid, verNo);
        if (confirmed && !Objects.equals(v.getContentSha256(), f.getConfirmedSha256())) {
            throw integrity();
        }
        if (!InstSummaryDocBuilder.supports(v.getRenderVer())) {
            throw coded(409, "RENDER_UNSUPPORTED", "이 판은 지금 서버가 출력할 수 없는 형식입니다.");
        }
        JsonNode content = parse(v.getContentJson());
        DocModel doc;
        try {
            doc = InstSummaryDocBuilder.build(content, v.getRenderVer(), !confirmed);
        } catch (IllegalArgumentException e) {
            throw coded(409, "RENDER_UNSUPPORTED", "저장된 연도 범위 또는 평가 기준표를 문서로 만들 수 없습니다.");
        }
        byte[] bytes = DocxKit.render(doc, DocxKit.Footer.pageNumberOnly());
        return new DocOut(bytes, text(content.path("fields").path("inst_name").path("val")), verNo);
    }

    /** 확정 판이 있고 저장본의 두 해시가 모두 맞는가 — S3 의 'T1 완료' 판정용(읽기 전용). */
    @Transactional(readOnly = true)
    public boolean isConfirmedIntact(String bid) {
        PrepForm f = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        if (f == null || f.getConfirmedVer() == null || f.getConfirmedSha256() == null) {
            return false;
        }
        PrepFormVer v = forms.selectVer(bid, InstSummaryTpl.FORM_CD, f.getConfirmedVer().intValue());
        return v != null && f.getConfirmedSha256().equals(v.getContentSha256())
                && v.getContentSha256().equals(sha256Hex(v.getContentJson()));
    }

    // ── 쓰기: 미리 채움·저장 ────────────────────────────────────────────

    /** 원본에서 사실 칸(과 씨앗)을 다시 채워 새 판(PREFILL)을 만든다. 결과가 이전 판과 같으면 새 판 없이 changed:false. */
    @Transactional
    public Map<String, Object> prefill(SysUser me, Actor a, BoardUiIds.Ui ui, String bid, String formCd, PrepFormIn.Prefill in) {
        requireWriterRole(me, bid, false);
        requireFormCd(formCd);
        requireUi(ui);
        String state = lockCase(bid);
        recheckWriter(me, bid, false);
        int base = baseVerOf(in);
        BidPrep p = prepMapper.selectPrep(bid);
        PrepForm f = lockForm(me, bid, base);
        requireEditable(f, base);
        Set<String> want = wanted(in == null ? null : in.getKeys());
        Map<String, Object> next = currentContentMap(bid, f);
        applyPrefill(next, p.getInstitutionId(), want);
        boolean changed = commit(me, a, bid, f, base, KIND_PREFILL, next);
        return saved(me, a, ui, p, bid, ACT_PREFILL, state, changed);
    }

    /** 편집 칸 전체를 교체해 새 판(DRAFT)을 만든다. FACT 칸·biz 출처는 이전 판 그대로. 같은 내용이면 새 판 없이 changed:false. */
    @Transactional
    public Map<String, Object> saveDraft(SysUser me, Actor a, BoardUiIds.Ui ui, String bid, String formCd, PrepFormIn.Draft in) {
        requireWriterRole(me, bid, false);
        requireFormCd(formCd);
        requireUi(ui);
        String state = lockCase(bid);
        recheckWriter(me, bid, false);
        int base = baseVerOf(in);
        BidPrep p = prepMapper.selectPrep(bid);
        PrepForm f = lockForm(me, bid, base);
        requireEditable(f, base);
        Map<String, Object> next = buildDraft(currentContentMap(bid, f), in);
        boolean changed = commit(me, a, bid, f, base, KIND_DRAFT, next);
        return saved(me, a, ui, p, bid, ACT_SAVE, state, changed);
    }

    // ── 쓰기: 확정·확정 취소 ────────────────────────────────────────────

    /**
     * 확정 — 확정돼 있으면 409 ALREADY_CONFIRMED, 판 번호가 다르거나 판이 없으면 409 VER_CHANGED, 저장본 해시가 다르면 409 FORM_INTEGRITY,
     * 필수 칸이 비면 409 FORM_INCOMPLETE(missing_keys), 낡은 사실 칸이 있으면 409 FORM_STALE(stale_keys).
     */
    @Transactional
    public Map<String, Object> confirm(SysUser me, Actor a, BoardUiIds.Ui ui, String bid, String formCd, PrepFormIn.Base in) {
        requireWriterRole(me, bid, false);
        requireFormCd(formCd);
        requireUi(ui);
        String state = lockCase(bid);
        recheckWriter(me, bid, false);
        int base = baseVerOf(in);
        BidPrep p = prepMapper.selectPrep(bid);
        PrepForm f = forms.selectFormForUpdate(bid, InstSummaryTpl.FORM_CD);
        if (f != null && f.getConfirmedVer() != null) {
            throw coded(409, "ALREADY_CONFIRMED", "이미 확정된 양식입니다.");
        }
        if (f == null || f.getCurVer() == 0 || base != f.getCurVer()) {
            throw versionChanged();
        }
        PrepFormVer v = loadVer(bid, f.getCurVer());
        JsonNode content = parse(v.getContentJson());
        List<String> missing = missingRequired(content, prefill.headEnabled());
        if (!missing.isEmpty()) {
            throw coded(409, "FORM_INCOMPLETE", "필수 칸이 비어 있습니다.", "missing_keys", missing);
        }
        List<String> stale = staleKeys(content, prefill.snapshot(p.getInstitutionId()));
        if (!stale.isEmpty()) {
            throw coded(409, "FORM_STALE", "원본이 바뀐 칸이 있습니다. 원본을 다시 불러온 뒤 확정하세요.", "stale_keys", stale);
        }
        String now = Times.nowIso();
        int verified = BoardMaterialService.verified(a);
        if (forms.markConfirmed(bid, InstSummaryTpl.FORM_CD, f.getCurVer(), v.getContentSha256(), me.getEmpNo(), verified, now) != 1) {
            throw versionChanged();
        }
        forms.insertFormLog(bid, ACT_CONFIRM, state, state, InstSummaryTpl.TASK_CD, null, me.getEmpNo(), verified, now, f.getCurVer());
        PrepForm after = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        audit.record(bid, ACT_CONFIRM, "OK", state, f.getCurVer(), a, ui);
        return viewOf(me, p, after, state);
    }

    /**
     * 확정 취소(사유 1~200자) — 영업 활성 담당 또는 영업팀장(비담당 포함). 확정이 없으면 409 NOT_CONFIRMED. 사유는 확정 취소 이력에만 남고
     * 공개 범위는 사전준비 이력의 확정 취소 사유와 같다(PrepService.ACT_REASON_EVENTS). 응답에 unconfirmed_ver(취소한 판 번호)를 싣는다.
     */
    @Transactional
    public Map<String, Object> unconfirm(SysUser me, Actor a, BoardUiIds.Ui ui, String bid, String formCd, PrepFormIn.Unconfirm in) {
        requireWriterRole(me, bid, true);
        requireFormCd(formCd);
        requireUi(ui);
        String state = lockCase(bid);
        recheckWriter(me, bid, true);
        BidPrep p = prepMapper.selectPrep(bid);
        PrepForm f = forms.selectFormForUpdate(bid, InstSummaryTpl.FORM_CD);
        if (f == null || f.getConfirmedVer() == null) {
            throw coded(409, "NOT_CONFIRMED", "확정된 양식이 아닙니다.");
        }
        String reason = text(in == null ? null : in.getReason(), 200, "사유", true, "reason");
        int ver = f.getConfirmedVer().intValue();
        String now = Times.nowIso();
        if (forms.clearConfirmed(bid, InstSummaryTpl.FORM_CD, ver, me.getEmpNo(), now) != 1) {
            throw versionChanged();
        }
        forms.insertFormLog(bid, ACT_UNCONFIRM, state, state, InstSummaryTpl.TASK_CD, reason, me.getEmpNo(),
                BoardMaterialService.verified(a), now, ver);
        PrepForm after = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        audit.record(bid, ACT_UNCONFIRM, "OK", state, ver, a, ui);
        Map<String, Object> out = viewOf(me, p, after, state);
        out.put("unconfirmed_ver", ver);
        return out;
    }

    // ── 권한 ────────────────────────────────────────────────────────────

    private static String roleOf(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    private static boolean isMember(SysUser u) {
        return BidAssignmentService.MEMBER_ROLE.equals(roleOf(u));
    }

    private static boolean isLead(SysUser u) {
        return BidAssignmentService.LEAD_ROLE.equals(roleOf(u));
    }

    private static boolean isHead(SysUser u) {
        return BidAssignmentService.HEAD_ROLE.equals(roleOf(u));
    }

    private static boolean isDesigner(SysUser u) {
        return Teams.DESIGNER_TEAM.equals(roleOf(u));
    }

    private static boolean validBid(String bid) {
        return bid != null && !bid.isEmpty() && bid.length() <= 64;
    }

    private boolean activeAssignee(String bid, SysUser me) {
        return validBid(bid) && me.getEmpNo() != null && forms.countActiveAssignee(bid, me.getEmpNo()) > 0;
    }

    /** 열람 대상 건을 돌려준다. 못 보면(없는 건과 같은 응답) 404. */
    private BidPrep requireReader(SysUser me, String bid) {
        BidPrep p = validBid(bid) ? prepMapper.selectPrep(bid) : null;
        if (p == null || !canRead(me, p)) {
            throw ApiException.notFound("prep not found");
        }
        return p;
    }

    /** 영업 활성 담당 ∨ 영업팀장 ∨ 영업부장 ∨ (디자이너 ∧ 그 건 디자이너 작업의 담당이 비어 있지 않고 본인). 선점 분기는 쓰지 않는다. */
    private boolean canRead(SysUser me, BidPrep p) {
        if (isLead(me) || isHead(me)) {
            return true;
        }
        if (isMember(me)) {
            return activeAssignee(p.getBidCaseId(), me);
        }
        if (isDesigner(me)) {
            String assignee = forms.selectDesignerAssignee(p.getBidCaseId(), Teams.DESIGNER_TEAM);
            if (assignee == null || assignee.trim().isEmpty()) {
                return false;
            }
            try {
                design.requireDesignerOwner(me, assignee);
                return true;
            } catch (ApiException e) {
                return false;
            }
        }
        return false;
    }

    private boolean canWrite(SysUser me, String bid) {
        return (isMember(me) || isLead(me)) && activeAssignee(bid, me);
    }

    /** 쓰기 역할 403 — 건 조회보다 먼저(비담당이면 건이 있든 없든 같은 응답). allowLead 면 영업팀장은 담당이 아니어도 통과(확정 취소). */
    private void requireWriterRole(SysUser me, String bid, boolean allowLead) {
        if (!isMember(me) && !isLead(me)) {
            throw new ApiException(403, DENIED);
        }
        if (allowLead && isLead(me)) {
            return;
        }
        if (!activeAssignee(bid, me)) {
            throw new ApiException(403, DENIED);
        }
    }

    /** 건 잠금을 잡은 뒤 한 번 더 — 그 사이 담당이 해제됐으면 403(security 하-4). */
    private void recheckWriter(SysUser me, String bid, boolean allowLead) {
        requireWriterRole(me, bid, allowLead);
    }

    private static void requireFormCd(String formCd) {
        if (!InstSummaryTpl.FORM_CD.equals(formCd)) {
            throw ApiException.notFound("form not found");
        }
    }

    private static void requireUi(BoardUiIds.Ui ui) {
        if (ui == null || !ui.isValid()) {
            throw coded(400, "UI_ID_REQUIRED", "화면·버튼 식별자가 필요합니다.");
        }
    }

    // ── 잠금·판 ─────────────────────────────────────────────────────────

    /** BID_PREP 행을 FOR UPDATE 로 잡고 상태를 확인한다. 건이 없으면 404, IN_PROGRESS 가 아니면 409 FORM_LOCKED(state_cd). */
    private String lockCase(String bid) {
        String st = validBid(bid) ? prepMapper.selectStateForUpdate(bid) : null;
        if (st == null) {
            throw ApiException.notFound("prep not found");
        }
        if (!PrepService.IN_PROGRESS.equals(st)) {
            throw coded(409, "FORM_LOCKED", "지금은 양식을 고칠 수 없는 상태입니다. 사전준비 승인 중이거나 승인된 뒤에는 고칠 수 없습니다.", "state_cd", st);
        }
        return st;
    }

    private static int baseVerOf(PrepFormIn.Base in) {
        Integer b = in == null ? null : in.getBaseVer();
        if (b == null || b.intValue() < 0 || b.intValue() > 999999) {
            throw coded(400, "BAD_VALUE", "화면이 본 판 번호(base_ver)가 필요합니다.", "key", "base_ver");
        }
        return b.intValue();
    }

    /** 헤더 잠금 — 없으면 base 가 0 일 때만 새로 만든다(BID_PREP 잠금이 직렬화하므로 경합은 없고, 중복 키는 방어로 409). */
    private PrepForm lockForm(SysUser me, String bid, int base) {
        PrepForm f = forms.selectFormForUpdate(bid, InstSummaryTpl.FORM_CD);
        if (f != null) {
            return f;
        }
        if (base != 0) {
            throw versionChanged();
        }
        try {
            forms.insertForm(bid, InstSummaryTpl.FORM_CD, InstSummaryTpl.TASK_CD, me.getEmpNo(), Times.nowIso());
        } catch (DuplicateKeyException e) {
            throw versionChanged();
        }
        return forms.selectFormForUpdate(bid, InstSummaryTpl.FORM_CD);
    }

    private static void requireEditable(PrepForm f, int base) {
        if (f.getConfirmedVer() != null) {
            throw coded(409, "FORM_CONFIRMED", "확정된 양식입니다. 고치려면 먼저 확정을 취소하세요.");
        }
        if (base != f.getCurVer()) {
            throw versionChanged();
        }
    }

    /** 저장본(문자열)을 다시 해시해 박제값과 같을 때만 돌려준다 — DB 를 직접 고쳤으면 409 FORM_INTEGRITY. 판이 없으면 409 VER_CHANGED. */
    private PrepFormVer loadVer(String bid, int verNo) {
        PrepFormVer v = forms.selectVer(bid, InstSummaryTpl.FORM_CD, verNo);
        if (v == null) {
            throw versionChanged();
        }
        if (v.getContentJson() == null || !sha256Hex(v.getContentJson()).equals(v.getContentSha256())) {
            throw integrity();
        }
        return v;
    }

    private Map<String, Object> currentContentMap(String bid, PrepForm f) {
        return f.getCurVer() > 0 ? upgrade(parseMap(loadVer(bid, f.getCurVer()).getContentJson())) : emptyContent();
    }

    /**
     * 옛 칸 지도(TPL_VER 1·2)로 저장된 판을 새 칸 지도(3)로 올린다 — 새로 생긴 LIST 칸은 빈 목록, head_title 은 빈 칸, tables.scoring 은 null,
     * mmda_basis 의 문자열 줄은 {text, note:null}, biz 의 문자열 줄은 {text, bold:false}. 저장된 옛 판 문자열·해시는 건드리지 않는다(읽은 사본만 올린다).
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> upgrade(Map<String, Object> m) {
        m.put("tpl_ver", InstSummaryTpl.TPL_VER);
        Object ls = m.get("lists");
        if (!(ls instanceof Map)) {
            ls = new LinkedHashMap<String, Object>();
            m.put("lists", ls);
        }
        for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.LIST)) {
            if (!((Map<String, Object>) ls).containsKey(k.getKey())) {
                ((Map<String, Object>) ls).put(k.getKey(), new ArrayList<Object>());
            }
        }
        normalizeLines(m);
        Object fs = m.get("fields");
        if (fs instanceof Map) {
            for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.TEXT)) {
                if (!((Map<String, Object>) fs).containsKey(k.getKey())) {
                    ((Map<String, Object>) fs).put(k.getKey(), textMap(null, null));
                }
            }
        }
        Object ts = m.get("tables");
        if (ts instanceof Map && !((Map<String, Object>) ts).containsKey("scoring")) {
            ((Map<String, Object>) ts).put("scoring", null);
        }
        return m;
    }

    /** mmda_basis·biz 줄의 문자열을 v3 모양({text,note}·{text,bold})으로 — 이미 객체인 줄은 그대로. */
    @SuppressWarnings("unchecked")
    static void normalizeLines(Map<String, Object> m) {
        Object ls = m.get("lists");
        if (ls instanceof Map && ((Map<String, Object>) ls).get("mmda_basis") instanceof List) {
            List<Object> out = new ArrayList<Object>();
            for (Object o : (List<Object>) ((Map<String, Object>) ls).get("mmda_basis")) {
                if (o instanceof String) {
                    Map<String, Object> line = new LinkedHashMap<String, Object>();
                    line.put("text", o);
                    line.put("note", null);
                    out.add(line);
                } else {
                    out.add(o);
                }
            }
            ((Map<String, Object>) ls).put("mmda_basis", out);
        }
        Object ts = m.get("tables");
        Object biz = ts instanceof Map ? ((Map<String, Object>) ts).get("biz") : null;
        Object rows = biz instanceof Map ? ((Map<String, Object>) biz).get("rows") : null;
        if (rows instanceof List) {
            for (Object r : (List<Object>) rows) {
                if (r instanceof Map && ((Map<String, Object>) r).get("lines") instanceof List) {
                    List<Object> out = new ArrayList<Object>();
                    for (Object o : (List<Object>) ((Map<String, Object>) r).get("lines")) {
                        if (o instanceof String) {
                            Map<String, Object> line = new LinkedHashMap<String, Object>();
                            line.put("text", o);
                            line.put("bold", Boolean.FALSE);
                            out.add(line);
                        } else {
                            out.add(o);
                        }
                    }
                    ((Map<String, Object>) r).put("lines", out);
                }
            }
        }
    }

    /**
     * 새 내용을 판으로 추가한다. 현재 판과 정규 JSON 이 같으면(해시 동일) 아무것도 쓰지 않고 false. 판 상한·크기 상한은 여기서 본다.
     * @return 새 판을 만들었으면 true
     */
    private boolean commit(SysUser me, Actor a, String bid, PrepForm f, int base, String kind, Map<String, Object> next) {
        String json = canonical(next);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > InstSummaryTpl.MAX_CONTENT_BYTES) {
            throw coded(400, "CONTENT_TOO_LARGE", "양식 내용이 너무 큽니다. 줄이거나 나눠 주세요.");
        }
        String sha = sha256Hex(json);
        if (f.getCurVer() > 0) {
            PrepFormVer cur = forms.selectVer(bid, InstSummaryTpl.FORM_CD, f.getCurVer());
            if (cur != null && sha.equals(cur.getContentSha256())) {
                return false;
            }
        }
        if (forms.countVers(bid, InstSummaryTpl.FORM_CD) >= InstSummaryTpl.MAX_VERSIONS) {
            throw coded(409, "TOO_MANY_VERSIONS", "이 양식에 저장된 판이 너무 많아 더 저장할 수 없습니다. 영업팀장에게 알리고 개발부서에 정리를 요청해 주세요.");
        }
        int nextNo = f.getCurVer() + 1;
        PrepFormVer v = new PrepFormVer();
        v.setBidCaseId(bid);
        v.setFormCd(InstSummaryTpl.FORM_CD);
        v.setVerNo(nextNo);
        v.setKindCd(kind);
        v.setBaseVer(base);
        v.setTplVer(InstSummaryTpl.TPL_VER);
        v.setRenderVer(InstSummaryDocBuilder.RENDER_VER);
        v.setContentJson(json);
        v.setContentSha256(sha);
        v.setContentBytes(bytes.length);
        v.setSavedBy(me.getEmpNo());
        v.setSavedVerified(BoardMaterialService.verified(a));
        v.setSavedAt(Times.nowIso());
        try {
            forms.insertVer(v);
        } catch (DuplicateKeyException e) {
            throw versionChanged();
        }
        if (forms.bumpCurVer(bid, InstSummaryTpl.FORM_CD, base, nextNo, me.getEmpNo(), v.getSavedAt()) != 1) {
            throw versionChanged();
        }
        return true;
    }

    /** 쓰기 마무리 — 최신 헤더를 다시 읽어 OK 감사 줄(FORM_VER=현재 판)을 같은 트랜잭션에서 쓰고 view 와 같은 모양으로 돌려준다. */
    private Map<String, Object> saved(SysUser me, Actor a, BoardUiIds.Ui ui, BidPrep p, String bid, String action, String state, boolean changed) {
        PrepForm after = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
        audit.record(bid, action, "OK", state, after.getCurVer(), a, ui);
        Map<String, Object> out = viewOf(me, p, after, state);
        out.put("changed", changed);
        return out;
    }

    // ── 보기 ────────────────────────────────────────────────────────────

    private Map<String, Object> viewOf(SysUser me, BidPrep p, PrepForm f, String stateCd) {
        String bid = p.getBidCaseId();
        int cur = f == null ? 0 : f.getCurVer();
        boolean confirmed = f != null && f.getConfirmedVer() != null;
        PrepFormVer v = cur > 0 ? forms.selectVer(bid, InstSummaryTpl.FORM_CD, cur) : null;
        JsonNode content = v == null ? null : JSON.valueToTree(upgrade(parseMap(v.getContentJson())));   // 옛 판도 v3 모양으로 읽는다(저장본은 그대로)
        Map<String, Fact> now = content != null || confirmed ? prefill.snapshot(p.getInstitutionId()) : null;
        List<String> stale = new ArrayList<String>();
        List<String> missingSrc = new ArrayList<String>();
        List<Map<String, Object>> notices = new ArrayList<Map<String, Object>>();
        List<String> changedKeys = new ArrayList<String>();
        if (content != null) {
            if (!confirmed) {
                stale = staleKeys(content, now);
            }
            missingSrc = missingSources(content, now);
            notices = seedNotices(content, prefill.latestPlanRef(p.getInstitutionId()));
        }
        Map<String, Object> confirmedOut = null;
        if (confirmed) {
            JsonNode cc = content;
            if (f.getConfirmedVer().intValue() != cur) {
                PrepFormVer cv = forms.selectVer(bid, InstSummaryTpl.FORM_CD, f.getConfirmedVer().intValue());
                cc = cv == null ? null : parse(cv.getContentJson());
            }
            if (cc != null) {
                changedKeys = staleKeys(cc, now);
            }
            confirmedOut = new LinkedHashMap<String, Object>();
            confirmedOut.put("ver", f.getConfirmedVer());
            confirmedOut.put("sha256", f.getConfirmedSha256());
            confirmedOut.put("by_name", f.getConfirmedByName());
            confirmedOut.put("at", f.getConfirmedAt());
        }
        boolean inProgress = PrepService.IN_PROGRESS.equals(stateCd);
        boolean writer = canWrite(me, bid);
        boolean canEdit = writer && inProgress && !confirmed;
        Map<String, Object> viewer = new LinkedHashMap<String, Object>();
        viewer.put("can_edit", canEdit);
        viewer.put("can_confirm", canEdit && cur > 0);
        viewer.put("can_unconfirm", (writer || isLead(me)) && (isMember(me) || isLead(me)) && inProgress && confirmed);
        viewer.put("can_download", true);
        viewer.put("lock_reason", !inProgress ? "STATE" : confirmed ? "CONFIRMED" : null);

        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("bid_case_id", bid);
        out.put("form_cd", InstSummaryTpl.FORM_CD);
        out.put("task_cd", InstSummaryTpl.TASK_CD);
        out.put("state_cd", stateCd);
        out.put("tpl", tplOf());
        out.put("cur_ver", cur);
        out.put("kind_cd", v == null ? null : v.getKindCd());
        out.put("saved_by_name", v == null ? null : v.getSavedByName());
        out.put("saved_at", v == null ? null : v.getSavedAt());
        out.put("content", content);
        out.put("confirmed", confirmedOut);
        out.put("stale_keys", stale);
        out.put("sources_missing", missingSrc);
        out.put("seed_notices", notices);
        out.put("confirmed_changed_keys", changedKeys);
        out.put("viewer", viewer);
        return out;
    }

    private Map<String, Object> tplOf() {
        boolean headOn = prefill.headEnabled();
        List<Map<String, Object>> keys = new ArrayList<Map<String, Object>>();
        for (InstSummaryTpl.Key k : InstSummaryTpl.KEYS) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("key", k.getKey());
            m.put("kind", k.getKind().name());
            m.put("label", k.getLabel());
            m.put("required", k.isRequired() && (headOn || !"head_name".equals(k.getKey())));
            m.put("max_len", k.getMaxLen());
            m.put("max_items", k.getMaxItems());
            m.put("fix_screen", k.getFixScreen());
            keys.add(m);
        }
        Map<String, Object> tpl = new LinkedHashMap<String, Object>();
        tpl.put("tpl_ver", InstSummaryTpl.TPL_VER);
        tpl.put("keys", keys);
        return tpl;
    }

    // ── 낡음·누락·알림 판정(정적 — 시험하기 쉽게) ─────────────────────────

    /**
     * 사실 칸마다 (저장 ref ≠ 현재 ref) 또는 (저장 값 ≠ 현재 값)이면 낡음. 저장이 비었는데 현재 원본이 있어도 낡음.
     * 저장·현재가 모두 비면 낡음이 아니다(그건 {@link #missingSources}).
     */
    static List<String> staleKeys(JsonNode content, Map<String, Fact> now) {
        List<String> out = new ArrayList<String>();
        for (String key : InstSummaryTpl.factKeys()) {
            JsonNode f = content.path("fields").path(key);
            String storedVal = text(f.path("val"));
            String storedRef = text(f.path("src").path("ref"));
            Fact cur = now == null ? null : now.get(key);
            String curVal = cur == null ? null : cur.getVal();
            String curRef = cur == null ? null : cur.ref();
            if (storedVal == null && curVal == null) {
                continue;
            }
            if (!Objects.equals(storedVal, curVal) || !Objects.equals(storedRef, curRef)) {
                out.add(key);
            }
        }
        return out;
    }

    /** 사실 칸 중 저장값도 현재 원본도 없는 칸(원본을 먼저 채워야 한다는 안내용). */
    static List<String> missingSources(JsonNode content, Map<String, Fact> now) {
        List<String> out = new ArrayList<String>();
        for (String key : InstSummaryTpl.factKeys()) {
            Fact cur = now == null ? null : now.get(key);
            if (text(content.path("fields").path(key).path("val")) == null && (cur == null || cur.getVal() == null)) {
                out.add(key);
            }
        }
        return out;
    }

    /**
     * 씨앗 안내 — biz 의 반입 출처가 최신 반입이 아니면 NEWER_IMPORT(확정을 막지 않는다), 씨앗에서 개인정보 등으로 뺀 줄이 있으면 ROWS_DROPPED(개수만).
     * 각 항목 {key, reason[, count]}.
     */
    static List<Map<String, Object>> seedNotices(JsonNode content, String latestPlanRef) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        JsonNode biz = content.path("tables").path("biz");
        String srcRef = text(biz.path("src").path("ref"));
        if (srcRef != null && latestPlanRef != null && !srcRef.equals(latestPlanRef)) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("key", "biz");
            m.put("reason", "NEWER_IMPORT");
            out.add(m);
        }
        int dropped = biz.path("dropped").asInt(0);
        if (dropped > 0) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("key", "biz");
            m.put("reason", "ROWS_DROPPED");
            m.put("count", dropped);
            out.add(m);
        }
        return out;
    }

    /** 필수 칸 중 빈 것(칸 지도 순서). head_name 은 기관장 기능이 켜져 있을 때만 필수다. */
    static List<String> missingRequired(JsonNode content, boolean headEnabled) {
        List<String> out = new ArrayList<String>();
        for (InstSummaryTpl.Key k : InstSummaryTpl.KEYS) {
            if (!k.isRequired() || ("head_name".equals(k.getKey()) && !headEnabled)) {
                continue;
            }
            boolean empty;
            if (k.getKind() == InstSummaryTpl.Kind.LIST) {
                empty = true;
                for (JsonNode n : content.path("lists").path(k.getKey())) {
                    if (text(n) != null) {
                        empty = false;
                    }
                }
            } else {
                empty = text(content.path("fields").path(k.getKey()).path("val")) == null;
            }
            if (empty) {
                out.add(k.getKey());
            }
        }
        return out;
    }

    // ── 미리 채움 적용 ──────────────────────────────────────────────────

    /** keys 검사 — null 이면 null(전부). FACT 키·"biz"·"years" 밖이거나 중복이면 400 UNKNOWN_KEY(개수만). */
    private static Set<String> wanted(List<String> keys) {
        if (keys == null) {
            return null;
        }
        Set<String> ok = new HashSet<String>(InstSummaryTpl.factKeys());
        ok.add("biz");
        ok.add("years");
        Set<String> out = new LinkedHashSet<String>();
        List<String> bad = new ArrayList<String>();
        for (String k : keys) {
            if (k != null && ok.contains(k) && out.add(k)) {
                continue;
            }
            bad.add(k);
        }
        if (!bad.isEmpty()) {
            throw unknownKeys(bad);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private void applyPrefill(Map<String, Object> next, String institutionId, Set<String> want) {
        Map<String, Object> fields = (Map<String, Object>) next.get("fields");
        Map<String, Fact> now = prefill.snapshot(institutionId);
        for (String key : InstSummaryTpl.factKeys()) {
            if (want != null && !want.contains(key)) {
                continue;
            }
            Fact fresh = now.get(key);
            Object old = fields.get(key);
            if (old instanceof Map && sameFact((Map<String, Object>) old, fresh)) {
                continue;   // 값·ref 가 같으면 이전 출처(at 포함)를 그대로 둔다 — 그래야 같은 내용이 새 판이 되지 않는다
            }
            fields.put(key, factMap(fresh));
        }
        Map<String, Object> tables = (Map<String, Object>) next.get("tables");
        Map<String, Object> biz = (Map<String, Object>) tables.get("biz");
        boolean explicitBiz = want != null && want.contains("biz");
        boolean emptyBiz = ((List<Object>) biz.get("rows")).isEmpty();
        if (explicitBiz || (want == null && emptyBiz)) {
            BizSeed seed = prefill.seedBiz(institutionId);
            if (seed == null) {
                if (explicitBiz) {
                    throw coded(409, "NO_PLAN_IMPORT", "이 기관에 반입된 사업계획이 없습니다.");
                }
            } else {
                Map<String, Object> b = new LinkedHashMap<String, Object>();
                b.put("src", sameSrc(biz.get("src"), seed.getSrc()) ? biz.get("src") : seed.getSrc());
                b.put("dropped", seed.getDropped());
                b.put("rows", new ArrayList<Object>(seed.getRows()));
                tables.put("biz", b);
            }
        }
        boolean explicitYears = want != null && want.contains("years");
        if (explicitYears || (want == null && tables.get("years") == null)) {
            Integer from = prefill.seedYearFrom(institutionId);
            if (from == null) {
                if (explicitYears) {
                    throw coded(409, "NO_CONTRACT", "이 기관에 현재 금고 약정 기록이 없어 시작 연도를 정할 수 없습니다.");
                }
            } else {
                Map<String, Object> y = new LinkedHashMap<String, Object>();
                y.put("unit", DEFAULT_UNIT);
                y.put("from", from);
                y.put("to", from);
                y.put("end", null);
                y.put("mmda", new TreeMap<String, Object>());
                y.put("income", new TreeMap<String, Object>());
                y.put("notes", new ArrayList<Object>());
                tables.put("years", y);
            }
        }
        normalizeLines(next);   // 씨앗 줄(문자열)을 v3 줄 모양으로
    }

    @SuppressWarnings("unchecked")
    private static boolean sameFact(Map<String, Object> old, Fact fresh) {
        Object ov = old.get("val");
        Object os = old.get("src");
        String oldVal = ov == null ? null : ov.toString();
        String oldRef = os instanceof Map && ((Map<String, Object>) os).get("ref") != null
                ? ((Map<String, Object>) os).get("ref").toString() : null;
        return Objects.equals(oldVal, fresh.getVal()) && Objects.equals(oldRef, fresh.ref());
    }

    @SuppressWarnings("unchecked")
    private static boolean sameSrc(Object old, Map<String, Object> fresh) {
        if (!(old instanceof Map)) {
            return false;
        }
        Object r = ((Map<String, Object>) old).get("ref");
        return r != null && r.equals(fresh.get("ref"));
    }

    private static Map<String, Object> factMap(Fact f) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("val", f.getVal());
        m.put("src", f.getSrc());
        return m;
    }

    // ── 저장 내용 만들기(엄격 검사) ──────────────────────────────────────

    /** 빈 양식 — 모든 칸 키가 늘 들어 있어 같은 내용은 어느 경로로 만들어도 같은 문자열이 된다. */
    static Map<String, Object> emptyContent() {
        Map<String, Object> root = new LinkedHashMap<String, Object>();
        root.put("v", 1);
        root.put("form", InstSummaryTpl.FORM_CD);
        root.put("tpl_ver", InstSummaryTpl.TPL_VER);
        Map<String, Object> fields = new LinkedHashMap<String, Object>();
        for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.FACT)) {
            fields.put(k.getKey(), factMap(new Fact(null, null)));
        }
        for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.TEXT)) {
            fields.put(k.getKey(), textMap(null, null));
        }
        root.put("fields", fields);
        Map<String, Object> lists = new LinkedHashMap<String, Object>();
        for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.LIST)) {
            lists.put(k.getKey(), new ArrayList<Object>());
        }
        root.put("lists", lists);
        Map<String, Object> tables = new LinkedHashMap<String, Object>();
        Map<String, Object> biz = new LinkedHashMap<String, Object>();
        biz.put("src", null);
        biz.put("dropped", 0);
        biz.put("rows", new ArrayList<Object>());
        tables.put("biz", biz);
        Map<String, Object> fund = new LinkedHashMap<String, Object>();
        fund.put("rows", new ArrayList<Object>());
        tables.put("fund", fund);
        tables.put("years", null);
        tables.put("scoring", null);
        root.put("tables", tables);
        return root;
    }

    private static Map<String, Object> textMap(String val, String note) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("val", val);
        m.put("note", note);
        return m;
    }

    private static final Set<String> TEXT_PROPS = new HashSet<String>(Arrays.asList("val", "note"));
    private static final Set<String> BIZ_PROPS = new HashSet<String>(Arrays.asList("rows", "src", "dropped"));
    private static final Set<String> BIZ_ROW_PROPS = new HashSet<String>(Arrays.asList("group", "sub", "lines"));
    private static final Set<String> FUND_PROPS = new HashSet<String>(Arrays.asList("rows"));
    private static final Set<String> FUND_ROW_PROPS = new HashSet<String>(Arrays.asList("kind", "lines"));
    private static final Set<String> FUND_LINE_PROPS = new HashSet<String>(Arrays.asList("lv", "text"));
    private static final Set<String> YEARS_PROPS = new HashSet<String>(Arrays.asList("unit", "from", "to", "end", "mmda", "income", "notes"));

    /**
     * 본문의 편집 칸(fields 의 TEXT, lists, tables) 전체 + 이전 판의 FACT 칸·biz 출처. 모르는 키 400 UNKNOWN_KEY(개수만), FACT 키 400 FIELD_READONLY,
     * 형이 다르면 400 BAD_TYPE(key), 글자 규칙 위반 400·개인정보 422(key, 입력 값은 싣지 않는다). 본문에 빠진 편집 칸은 빈 값이 된다.
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> buildDraft(Map<String, Object> prev, PrepFormIn.Draft in) {
        Map<String, Object> next = emptyContent();
        Map<String, Object> prevFields = (Map<String, Object>) prev.get("fields");
        Map<String, Object> fields = (Map<String, Object>) next.get("fields");
        for (String key : InstSummaryTpl.factKeys()) {
            Object old = prevFields.get(key);
            if (old != null) {
                fields.put(key, old);
            }
        }
        // fields — TEXT 칸
        JsonNode fin = in == null ? null : in.getFields();
        if (fin != null && !fin.isNull()) {
            requireObject(fin, "fields");
            List<String> unknown = new ArrayList<String>();
            List<String> readonly = new ArrayList<String>();
            for (Iterator<String> it = fin.fieldNames(); it.hasNext(); ) {
                String k = it.next();
                InstSummaryTpl.Key tk = InstSummaryTpl.of(k);
                if (tk == null || (tk.getKind() != InstSummaryTpl.Kind.FACT && tk.getKind() != InstSummaryTpl.Kind.TEXT)) {
                    unknown.add(k);
                } else if (tk.getKind() == InstSummaryTpl.Kind.FACT) {
                    readonly.add(k);
                }
            }
            if (!unknown.isEmpty()) {
                throw unknownKeys(unknown);
            }
            if (!readonly.isEmpty()) {
                throw coded(400, "FIELD_READONLY", "원본에서 채우는 칸은 이 화면에서 고칠 수 없습니다.", "keys", readonly);
            }
            for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.TEXT)) {
                JsonNode n = fin.get(k.getKey());
                if (n == null || n.isNull()) {
                    continue;
                }
                requireObject(n, k.getKey());
                requireOnly(n, TEXT_PROPS);
                String val = text(strictText(n.get("val"), k.getKey()), k.getMaxLen(), k.getLabel(), false, k.getKey());
                String note = text(strictText(n.get("note"), k.getKey()), InstSummaryTpl.MAX_NOTE, "출처 메모", false, k.getKey());
                oneLine(val, k.getKey());
                oneLine(note, k.getKey());
                fields.put(k.getKey(), textMap(val, note));
            }
        }
        // lists
        Map<String, Object> lists = (Map<String, Object>) next.get("lists");
        JsonNode lin = in == null ? null : in.getLists();
        if (lin != null && !lin.isNull()) {
            requireObject(lin, "lists");
            List<String> unknown = new ArrayList<String>();
            for (Iterator<String> it = lin.fieldNames(); it.hasNext(); ) {
                String k = it.next();
                InstSummaryTpl.Key tk = InstSummaryTpl.of(k);
                if (tk == null || tk.getKind() != InstSummaryTpl.Kind.LIST) {
                    unknown.add(k);
                }
            }
            if (!unknown.isEmpty()) {
                throw unknownKeys(unknown);
            }
            for (InstSummaryTpl.Key k : InstSummaryTpl.keysOf(InstSummaryTpl.Kind.LIST)) {
                if ("mmda_basis".equals(k.getKey())) {
                    lists.put(k.getKey(), noteLines(lin.get(k.getKey()), k.getMaxItems(), k.getMaxLen(), k.getLabel(), k.getKey()));
                } else {
                    lists.put(k.getKey(), strictList(lin.get(k.getKey()), k.getMaxItems(), k.getMaxLen(), k.getLabel(), k.getKey()));
                }
            }
        }
        // tables
        Map<String, Object> tables = (Map<String, Object>) next.get("tables");
        Map<String, Object> prevTables = (Map<String, Object>) prev.get("tables");
        Map<String, Object> prevBiz = (Map<String, Object>) prevTables.get("biz");
        JsonNode tin = in == null ? null : in.getTables();
        if (tin != null && !tin.isNull()) {
            requireObject(tin, "tables");
            List<String> unknown = new ArrayList<String>();
            for (Iterator<String> it = tin.fieldNames(); it.hasNext(); ) {
                String k = it.next();
                InstSummaryTpl.Key tk = InstSummaryTpl.of(k);
                if (tk == null || tk.getKind() != InstSummaryTpl.Kind.TABLE) {
                    unknown.add(k);
                }
            }
            if (!unknown.isEmpty()) {
                throw unknownKeys(unknown);
            }
            ((Map<String, Object>) tables.get("biz")).put("rows", bizRows(tin.get("biz")));
            tables.put("years", years(tin.get("years")));
            ((Map<String, Object>) tables.get("fund")).put("rows", fundRows(tin.get("fund")));
            tables.put("scoring", scoring(tin.get("scoring")));
        }
        // 본문에 없는 편집 칸은 빈 값이다(전체 교체). 단 biz 의 출처·뺀 개수는 서버 것을 그대로 둔다 — 클라이언트 값은 받지 않는다.
        Map<String, Object> bizOut = (Map<String, Object>) tables.get("biz");
        bizOut.put("src", prevBiz == null ? null : prevBiz.get("src"));
        bizOut.put("dropped", prevBiz == null || prevBiz.get("dropped") == null ? 0 : prevBiz.get("dropped"));
        return next;
    }

    private static List<Object> bizRows(JsonNode n) {
        List<Object> rows = new ArrayList<Object>();
        if (n == null || n.isNull()) {
            return rows;
        }
        requireObject(n, "biz");
        requireOnly(n, BIZ_PROPS);
        JsonNode arr = n.get("rows");
        if (arr == null || arr.isNull()) {
            return rows;
        }
        requireArray(arr, "biz");
        if (arr.size() > InstSummaryTpl.MAX_BIZ_ROWS) {
            throw tooMany("biz");
        }
        for (JsonNode r : arr) {
            requireObject(r, "biz");
            requireOnly(r, BIZ_ROW_PROPS);
            String group = text(strictText(r.get("group"), "biz"), 60, "대분류", true, "biz");
            oneLine(group, "biz");
            String sub = r.get("sub") == null || r.get("sub").isNull() ? null : text(strictText(r.get("sub"), "biz"), 60, "하위 구분", false, "biz");
            oneLine(sub, "biz");
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("group", group);
            row.put("sub", sub);
            row.put("lines", bizLines(r.get("lines")));
            rows.add(row);
        }
        return rows;
    }

    private static final Set<String> BIZ_LINE_PROPS = new HashSet<String>(Arrays.asList("text", "bold"));
    private static final Set<String> NOTE_LINE_PROPS = new HashSet<String>(Arrays.asList("text", "note"));
    private static final Set<String> SCORING_PROPS = new HashSet<String>(Arrays.asList("cells", "row_count", "col_count", "total", "source"));
    private static final Set<String> SCORING_CELL_PROPS = new HashSet<String>(Arrays.asList("r", "c", "rs", "cs", "text"));
    private static final Set<String> SCORING_SRC_PROPS = new HashSet<String>(Arrays.asList("attach_id", "file", "table"));

    /** 사업 내용 줄 — 문자열(굵게 아님) 또는 {text, bold}. 저장 모양은 늘 {text, bold:boolean}. 최대 5줄·줄당 200자, 빈 글자 줄은 뺀다. */
    private static List<Object> bizLines(JsonNode n) {
        List<Object> out = new ArrayList<Object>();
        if (n == null || n.isNull()) {
            return out;
        }
        requireArray(n, "biz");
        if (n.size() > 5) {
            throw tooMany("biz");
        }
        for (JsonNode e : n) {
            if (e == null || e.isNull()) {
                throw badType("biz");
            }
            boolean bold = false;
            String t;
            if (e.isObject()) {
                requireOnly(e, BIZ_LINE_PROPS);
                JsonNode b = e.get("bold");
                if (b != null && !b.isNull()) {
                    if (!b.isBoolean()) {
                        throw badType("biz");
                    }
                    bold = b.asBoolean();
                }
                t = text(strictText(e.get("text"), "biz"), 200, "사업 내용", false, "biz");
            } else {
                t = text(strictText(e, "biz"), 200, "사업 내용", false, "biz");
            }
            oneLine(t, "biz");
            if (t != null) {
                Map<String, Object> line = new LinkedHashMap<String, Object>();
                line.put("text", t);
                line.put("bold", bold);
                out.add(line);
            }
        }
        return out;
    }

    /** 서술 줄 + 각주(MMDA 산정 기준) — 문자열 또는 {text, note}. 저장 모양은 늘 {text, note|null}. 글자가 빈 줄은 각주째 뺀다. */
    private static List<Object> noteLines(JsonNode n, int maxItems, int maxLen, String label, String key) {
        List<Object> out = new ArrayList<Object>();
        if (n == null || n.isNull()) {
            return out;
        }
        requireArray(n, key);
        if (n.size() > maxItems) {
            throw tooMany(key);
        }
        for (JsonNode e : n) {
            if (e == null || e.isNull()) {
                throw badType(key);
            }
            String t;
            String note = null;
            if (e.isObject()) {
                requireOnly(e, NOTE_LINE_PROPS);
                t = text(strictText(e.get("text"), key), maxLen, label, false, key);
                note = text(strictText(e.get("note"), key), 300, "각주", false, key);
            } else {
                t = text(strictText(e, key), maxLen, label, false, key);
            }
            oneLine(t, key);
            oneLine(note, key);
            if (t != null) {
                Map<String, Object> line = new LinkedHashMap<String, Object>();
                line.put("text", t);
                line.put("note", note);
                out.add(line);
            }
        }
        return out;
    }

    /**
     * 2쪽 평가 기준표 — {cells:[{r,c,rs,cs,text}], row_count, col_count, total, source:{attach_id,file,table}}. null 이면 2쪽 없음.
     * 행 1~200·열 1~12·칸 글자 ≤500(줄바꿈 허용·개인정보 검사)·r/c ≥0·rs/cs ≥1·범위 안·겹침 없음. 격자에 빈 자리가 있어도 된다(Word 가 채운다).
     * 위반은 400 BAD_SCORING(key=scoring) 또는 BAD_TYPE·TOO_MANY·UNKNOWN_KEY. 저장 모양은 칸을 (r,c) 순으로 정렬한다.
     */
    private static Map<String, Object> scoring(JsonNode n) {
        if (n == null || n.isNull()) {
            return null;
        }
        requireObject(n, "scoring");
        requireOnly(n, SCORING_PROPS);
        int rn = strictInt(n.get("row_count"), "scoring");
        int cn = strictInt(n.get("col_count"), "scoring");
        if (rn < 1 || rn > InstSummaryTpl.MAX_SCORING_ROWS || cn < 1 || cn > InstSummaryTpl.MAX_SCORING_COLS) {
            throw badScoring("평가 기준표는 행 1~" + InstSummaryTpl.MAX_SCORING_ROWS + "·열 1~" + InstSummaryTpl.MAX_SCORING_COLS + " 범위여야 합니다.");
        }
        JsonNode arr = n.get("cells");
        requireArray(arr, "scoring");
        if (arr.size() > rn * cn) {
            throw tooMany("scoring");
        }
        boolean[][] occ = new boolean[rn][cn];
        List<int[]> pos = new ArrayList<int[]>();
        List<String> txt = new ArrayList<String>();
        for (JsonNode c : arr) {
            requireObject(c, "scoring");
            requireOnly(c, SCORING_CELL_PROPS);
            int r = strictInt(c.get("r"), "scoring");
            int k = strictInt(c.get("c"), "scoring");
            int rs = strictInt(c.get("rs"), "scoring");
            int cs = strictInt(c.get("cs"), "scoring");
            if (r < 0 || k < 0 || rs < 1 || cs < 1 || rs > rn || cs > cn
                    || (long) r + rs > rn || (long) k + cs > cn) {
                throw badScoring("평가 기준표 칸의 위치·병합 범위가 표 밖입니다.");
            }
            for (int i = r; i < r + rs; i++) {
                for (int j = k; j < k + cs; j++) {
                    if (occ[i][j]) {
                        throw badScoring("평가 기준표의 칸이 서로 겹칩니다.");
                    }
                    occ[i][j] = true;
                }
            }
            String t = text(strictText(c.get("text"), "scoring"), InstSummaryTpl.MAX_SCORING_CELL, "평가 기준표 칸", false, "scoring");
            pos.add(new int[]{r, k, rs, cs});
            txt.add(t == null ? "" : t);
        }
        Integer total = null;
        JsonNode tn = n.get("total");
        if (tn != null && !tn.isNull()) {
            int t = strictInt(tn, "scoring");
            if (t < 0 || t > 100000) {
                throw badScoring("합계 값이 범위를 벗어났습니다.");
            }
            total = Integer.valueOf(t);
        }
        Map<String, Object> source = null;
        JsonNode sn = n.get("source");
        if (sn != null && !sn.isNull()) {
            requireObject(sn, "scoring");
            requireOnly(sn, SCORING_SRC_PROPS);
            JsonNode an = sn.get("attach_id");
            Long attach = null;
            if (an != null && !an.isNull()) {
                if (!an.isIntegralNumber() || !an.canConvertToLong() || an.asLong() < 0) {
                    throw badType("scoring");
                }
                attach = Long.valueOf(an.asLong());
            }
            String file = text(strictText(sn.get("file"), "scoring"), 200, "원본 파일명", false, "scoring");
            oneLine(file, "scoring");
            Integer table = null;
            JsonNode tb = sn.get("table");
            if (tb != null && !tb.isNull()) {
                int ti = strictInt(tb, "scoring");
                if (ti < 0 || ti > InstSummaryTpl.MAX_SCORING_TABLE_INDEX) {
                    throw badScoring("원본 표 번호가 범위를 벗어났습니다.");
                }
                table = Integer.valueOf(ti);
            }
            source = new LinkedHashMap<String, Object>();
            source.put("attach_id", attach);
            source.put("file", file);
            source.put("table", table);
        }
        List<Integer> order = new ArrayList<Integer>();
        for (int i = 0; i < pos.size(); i++) {
            order.add(i);
        }
        final List<int[]> fpos = pos;
        java.util.Collections.sort(order, new java.util.Comparator<Integer>() {
            @Override
            public int compare(Integer a, Integer b) {
                int[] x = fpos.get(a.intValue());
                int[] y = fpos.get(b.intValue());
                return x[0] != y[0] ? Integer.compare(x[0], y[0]) : Integer.compare(x[1], y[1]);
            }
        });
        List<Object> cells = new ArrayList<Object>();
        for (Integer i : order) {
            int[] p = pos.get(i.intValue());
            Map<String, Object> cell = new LinkedHashMap<String, Object>();
            cell.put("r", p[0]);
            cell.put("c", p[1]);
            cell.put("rs", p[2]);
            cell.put("cs", p[3]);
            cell.put("text", txt.get(i.intValue()));
            cells.add(cell);
        }
        if (cells.isEmpty()) {
            return null;   // 칸이 없는 표는 2쪽 없음과 같다
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("cells", cells);
        out.put("row_count", rn);
        out.put("col_count", cn);
        out.put("total", total);
        out.put("source", source);
        return out;
    }

    private static ApiException badScoring(String msg) {
        return coded(400, "BAD_SCORING", msg, "key", "scoring");
    }

    private static List<Object> fundRows(JsonNode n) {
        List<Object> rows = new ArrayList<Object>();
        if (n == null || n.isNull()) {
            return rows;
        }
        requireObject(n, "fund");
        requireOnly(n, FUND_PROPS);
        JsonNode arr = n.get("rows");
        if (arr == null || arr.isNull()) {
            return rows;
        }
        requireArray(arr, "fund");
        if (arr.size() > InstSummaryTpl.MAX_FUND_ROWS) {
            throw tooMany("fund");
        }
        for (JsonNode r : arr) {
            requireObject(r, "fund");
            requireOnly(r, FUND_ROW_PROPS);
            String kind = text(strictText(r.get("kind"), "fund"), 60, "운영 방식 구분", true, "fund");
            oneLine(kind, "fund");
            List<Object> lines = new ArrayList<Object>();
            JsonNode la = r.get("lines");
            if (la != null && !la.isNull()) {
                requireArray(la, "fund");
                if (la.size() > 10) {
                    throw tooMany("fund");
                }
                for (JsonNode l : la) {
                    requireObject(l, "fund");
                    requireOnly(l, FUND_LINE_PROPS);
                    int lv = strictInt(l.get("lv"), "fund");
                    if (lv < 0 || lv > 1) {
                        throw coded(400, "BAD_VALUE", "들여쓰기 단계는 0 또는 1이어야 합니다.", "key", "fund");
                    }
                    String t = text(strictText(l.get("text"), "fund"), 300, "운영 방식 내용", true, "fund");
                    oneLine(t, "fund");
                    Map<String, Object> line = new LinkedHashMap<String, Object>();
                    line.put("lv", lv);
                    line.put("text", t);
                    lines.add(line);
                }
            }
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("kind", kind);
            row.put("lines", lines);
            rows.add(row);
        }
        return rows;
    }

    private static Map<String, Object> years(JsonNode n) {
        if (n == null || n.isNull()) {
            return null;
        }
        requireObject(n, "years");
        requireOnly(n, YEARS_PROPS);
        String unit = text(strictText(n.get("unit"), "years"), 20, "단위", true, "years");
        oneLine(unit, "years");
        int from = strictInt(n.get("from"), "years");
        int to = strictInt(n.get("to"), "years");
        if (from < 2000 || from > 2100 || to < 2000 || to > 2100) {
            throw badYears();
        }
        try {
            Groups.yearColumns(from, to);
        } catch (IllegalArgumentException e) {
            throw badYears();
        }
        Integer end = null;
        JsonNode en = n.get("end");
        if (en != null && !en.isNull()) {
            int e = strictInt(en, "years");
            if (e < from || e > to) {
                throw badYears();
            }
            end = Integer.valueOf(e);
        }
        Map<String, Object> y = new LinkedHashMap<String, Object>();
        y.put("unit", unit);
        y.put("from", from);
        y.put("to", to);
        y.put("end", end);
        y.put("mmda", yearValues(n.get("mmda"), from, to));
        y.put("income", yearValues(n.get("income"), from, to));
        y.put("notes", strictList(n.get("notes"), 5, 300, "주석", "years"));
        return y;
    }

    private static Map<String, Object> yearValues(JsonNode n, int from, int to) {
        Map<String, Object> out = new TreeMap<String, Object>();
        if (n == null || n.isNull()) {
            return out;
        }
        requireObject(n, "years");
        for (Iterator<String> it = n.fieldNames(); it.hasNext(); ) {
            String k = it.next();
            if (!YEAR_KEY.matcher(k).matches() || Integer.parseInt(k) < from || Integer.parseInt(k) > to) {
                throw badYears();
            }
            JsonNode v = n.get(k);
            if (v == null || v.isNull()) {
                continue;
            }
            String s = strictText(v, "years");
            if (s == null || s.isEmpty()) {
                continue;
            }
            if (!AMOUNT.matcher(s).matches()) {
                throw coded(400, "BAD_VALUE", "연도별 금액은 숫자(소수 3자리까지)로 입력하세요.", "key", "years");
            }
            out.put(k, s);
        }
        return out;
    }

    // ── 엄격 형 검사 도우미 ─────────────────────────────────────────────

    private static void requireObject(JsonNode n, String key) {
        if (n == null || !n.isObject()) {
            throw badType(key);
        }
    }

    private static void requireArray(JsonNode n, String key) {
        if (n == null || !n.isArray()) {
            throw badType(key);
        }
    }

    /** 글자는 isTextual 일 때만 — 숫자·객체·배열을 글자로 바꾸지 않는다. null·없음은 null. */
    private static String strictText(JsonNode n, String key) {
        if (n == null || n.isNull()) {
            return null;
        }
        if (!n.isTextual()) {
            throw badType(key);
        }
        return n.asText();
    }

    /** 정수는 isIntegralNumber ∧ canConvertToInt — 2027.5·1e30·"2027" 은 400 BAD_TYPE. */
    private static int strictInt(JsonNode n, String key) {
        if (n == null || !n.isIntegralNumber() || !n.canConvertToInt()) {
            throw badType(key);
        }
        return n.asInt();
    }

    private static void requireOnly(JsonNode obj, Set<String> allowed) {
        List<String> unknown = new ArrayList<String>();
        for (Iterator<String> it = obj.fieldNames(); it.hasNext(); ) {
            String k = it.next();
            if (!allowed.contains(k)) {
                unknown.add(k);
            }
        }
        if (!unknown.isEmpty()) {
            throw unknownKeys(unknown);
        }
    }

    private static List<Object> strictList(JsonNode n, int maxItems, int maxLen, String label, String key) {
        List<Object> out = new ArrayList<Object>();
        if (n == null || n.isNull()) {
            return out;
        }
        requireArray(n, key);
        if (n.size() > maxItems) {
            throw tooMany(key);
        }
        for (JsonNode e : n) {
            if (e == null || e.isNull()) {
                throw badType(key);
            }
            String t = text(strictText(e, key), maxLen, label, false, key);
            oneLine(t, key);
            if (t != null) {
                out.add(t);
            }
        }
        return out;
    }

    /** 사용자 글자 검사(제어·서식 문자 거부·길이·개인정보 422) — BoardMaterialService.checkedText 를 쓰고 오류에 칸 키를 붙인다(입력 값은 싣지 않는다). */
    private static String text(String raw, int max, String label, boolean required, String key) {
        try {
            return BoardMaterialService.checkedText(raw, max, label, required);
        } catch (ApiException e) {
            throw withKey(e, key);
        }
    }

    private static void oneLine(String v, String key) {
        if (v != null && v.indexOf('\n') >= 0) {
            throw coded(400, "BAD_VALUE", "줄바꿈은 쓸 수 없습니다. 항목을 나눠 입력하세요.", "key", key);
        }
    }

    private static ApiException withKey(ApiException e, String key) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        Object d = e.getDetailObject();
        if (d instanceof Map) {
            for (Map.Entry<?, ?> en : ((Map<?, ?>) d).entrySet()) {
                m.put(String.valueOf(en.getKey()), en.getValue());
            }
        } else {
            m.put("message", e.getMessage());
        }
        m.put("key", key);
        return ApiException.withDetail(e.getStatus(), m);
    }

    private static ApiException badType(String key) {
        return coded(400, "BAD_TYPE", "입력 형식이 맞지 않는 칸이 있습니다.", "key", key);
    }

    private static ApiException tooMany(String key) {
        return coded(400, "TOO_MANY", "입력할 수 있는 개수를 넘었습니다.", "key", key);
    }

    private static ApiException badYears() {
        return coded(400, "BAD_YEARS", YEARS_MSG, "key", "years");
    }

    /** 모르는 키 — 응답에는 개수와, 형식이 안전한([a-z_]{1,40}) 키만 최대 10개(입력 문자열을 되돌려 보내지 않는다, security 하-1). */
    private static ApiException unknownKeys(Collection<String> keys) {
        List<String> safe = new ArrayList<String>();
        for (String k : keys) {
            if (k != null && SAFE_KEY.matcher(k).matches() && safe.size() < 10) {
                safe.add(k);
            }
        }
        return coded(400, "UNKNOWN_KEY", "알 수 없는 칸이 있습니다.", "count", keys.size(), "keys", safe);
    }

    private static ApiException versionChanged() {
        return coded(409, "VER_CHANGED", "그 사이 양식이 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.");
    }

    private static ApiException integrity() {
        return coded(409, "FORM_INTEGRITY", "저장된 양식이 변경된 흔적이 있어 사용할 수 없습니다. 담당 개발부서에 알려 주세요.");
    }

    static ApiException coded(int status, String code, String message, Object... kv) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            d.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return ApiException.withDetail(status, d);
    }

    // ── JSON·해시 ───────────────────────────────────────────────────────

    /** 정규 JSON — 키 정렬, 정수만(소수 없음), UTF-8. 이 문자열이 곧 저장본이고 해시 대상이다. */
    static String canonical(Map<String, Object> m) {
        try {
            return JSON.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("form json failed");
        }
    }

    static String sha256Hex(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder(64);
            for (byte x : h) {
                b.append(String.format("%02x", x & 0xff));
            }
            return b.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            throw new ApiException(500, "저장된 양식을 읽을 수 없습니다.");
        }
    }

    private static Map<String, Object> parseMap(String json) {
        try {
            return JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() { });
        } catch (IOException e) {
            throw new ApiException(500, "저장된 양식을 읽을 수 없습니다.");
        }
    }

    private static String text(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) {
            return null;
        }
        String t = n.asText();
        return t == null || t.trim().isEmpty() ? null : t;
    }
}
