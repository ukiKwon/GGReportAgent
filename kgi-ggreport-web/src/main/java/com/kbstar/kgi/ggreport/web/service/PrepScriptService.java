package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.docout.BoardScriptDocBuilder;
import com.kbstar.kgi.ggreport.web.docout.BoardScriptInput;
import com.kbstar.kgi.ggreport.web.docout.DocxKit;
import com.kbstar.kgi.ggreport.web.docout.InstSummaryTpl;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidTerm;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialSnap;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.PrepForm;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVer;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepScriptIn;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepFormMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepScriptMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 이사회 발표 대본 Word(NEXT 113 ⑤, T6 선택 과제) — 저장 없음·DB 변경 없음. 손 입력 칸을 검사해 받고, 자동 값(기관·요약 양식·이사회 자료 표 A·B·약정 시작)을 모아
 * {@link BoardScriptDocBuilder} 로 조립한 뒤 docx 바이트를 돌려준다.
 *
 * <p><b>권한</b>(⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다): 그 건의 사전준비를 볼 수 있는 사람({@link PrepService#requireVisible}), 못 보면 404.
 * 이사회 자료 숫자(표 A·B)는 그 위에 {@link BoardAccess#canViewCase}(담당자·영업부장)일 때만 쓴다. 요약 양식 값(임직원 수·예산·현 거래 은행·기대효과)은
 * 양식 열람 판정({@link PrepFormService#canReadForm})을 통과한 사람에게만 채운다(security 11-26 중). 아니면 〔확인 필요〕 괄호.
 * <p><b>입력 검사</b>: 칸마다 길이 상한, 제어·서식 문자 거부(BoardDocSpec.clean 과 같은 규칙), 오류는 400 BAD_VALUE(key, 고정 문구 — 입력값 미포함).
 * <p><b>감사</b>: 이 서비스는 읽기 전용 트랜잭션이라 쓰지 않는다. 컨트롤러가 BID_PREP_ACT(SCRIPT_DOCX·T6)와, 확정 이사회 자료를 읽었으면
 * BOARD_MATERIAL_ACT(SCRIPT_DOCX)를 쓴다 — 근거는 {@link DocOut} 의 자료 번호·판 번호·요약 양식 판(숫자만). 손 입력 본문은 어디에도 기록하지 않는다.
 */
@Service
public class PrepScriptService {

    static final int MAX_FREE_RAW = 1500;
    static final int MAX_FREE_TOTAL = 1000;
    static final int MAX_FREE_LINES = 12;
    static final int MAX_FREE_LINE = 300;
    private static final Pattern ROUND = Pattern.compile("[0-9]{1,3}");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String ACTION_SAVE = "SAVE";
    private static final int MAX_BOARD_ROWS = 20;

    /** 내려받기 결과 — 파일 바이트·기관명(파일 이름용)·확정 전 초안 여부·감사 근거(숫자만). */
    public static final class DocOut {
        private final byte[] bytes;
        private final String instName;
        private final boolean draft;
        private final Long boardId;            // 읽은 이사회 자료 번호(없으면 null)
        private final Integer boardSnap;       // 읽은 판 번호(확정 판 또는 현재 판)
        private final boolean boardConfirmed;  // 확정(CONFIRMED) 자료를 읽었는가 — BOARD_MATERIAL_ACT 대상
        private final Integer formVer;         // 쓴 요약 양식 판(없으면 null)

        DocOut(byte[] bytes, String instName, boolean draft, Long boardId, Integer boardSnap, boolean boardConfirmed, Integer formVer) {
            this.bytes = bytes;
            this.instName = instName;
            this.draft = draft;
            this.boardId = boardId;
            this.boardSnap = boardSnap;
            this.boardConfirmed = boardConfirmed;
            this.formVer = formVer;
        }

        public byte[] getBytes() { return bytes; }
        public String getInstName() { return instName; }
        public boolean isDraft() { return draft; }
        public Long getBoardId() { return boardId; }
        public Integer getBoardSnap() { return boardSnap; }
        public boolean isBoardConfirmed() { return boardConfirmed; }
        public Integer getFormVer() { return formVer; }
    }

    /** 문서 만들기 실패 — 어느 이사회 자료를 읽다 실패했는지(숫자·확정 여부)만 싣는다. IllegalStateException 이라 기존 500 일반 문구 처리 그대로. */
    public static final class BuildFailed extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        private final transient Long boardId;
        private final boolean boardConfirmed;

        BuildFailed(Long boardId, boolean boardConfirmed, Throwable cause) {
            super("script build failed", cause);
            this.boardId = boardId;
            this.boardConfirmed = boardConfirmed;
        }

        public Long getBoardId() { return boardId; }
        public boolean isBoardConfirmed() { return boardConfirmed; }
    }

    private final PrepService prep;
    private final PrepFormService prepForms;
    private final PrepFormMapper forms;
    private final PrepScriptMapper scripts;
    private final BoardMaterialMapper boards;
    private final BoardFormService boardForms;
    private final BoardAccess boardAccess;
    private final InstitutionMapper institutions;
    private final BidTargetMapper targets;

    public PrepScriptService(PrepService prep, PrepFormService prepForms, PrepFormMapper forms, PrepScriptMapper scripts,
                             BoardMaterialMapper boards, BoardFormService boardForms, BoardAccess boardAccess,
                             InstitutionMapper institutions, BidTargetMapper targets) {
        this.prep = prep;
        this.prepForms = prepForms;
        this.forms = forms;
        this.scripts = scripts;
        this.boards = boards;
        this.boardForms = boardForms;
        this.boardAccess = boardAccess;
        this.institutions = institutions;
        this.targets = targets;
    }

    @Transactional(readOnly = true)
    public DocOut docx(SysUser me, String bid, PrepScriptIn in) {
        BidPrep p = prep.requireVisible(me, bid);   // 못 보면 404 — 입력 검사보다 먼저(건 존재를 알리지 않는다)
        BoardScriptInput x = new BoardScriptInput();
        applyHand(x, me, in == null ? new PrepScriptIn() : in);
        Basis basis = loadAuto(x, me, p, bid);
        byte[] bytes;
        try {
            bytes = DocxKit.render(BoardScriptDocBuilder.build(x), DocxKit.Footer.pageNumberOnly());
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new BuildFailed(basis.boardId, basis.boardConfirmed, e);   // 컨트롤러가 확정 자료 감사에 ERROR 한 줄을 남길 수 있게 근거를 싣는다
        }
        return new DocOut(bytes, x.instName, x.draft, basis.boardId, basis.boardSnap, basis.boardConfirmed, basis.formVer);
    }

    // ── 손 입력 검사 ────────────────────────────────────────────────────

    private static void applyHand(BoardScriptInput x, SysUser me, PrepScriptIn in) {
        x.meeting = meeting(in.getMeeting());
        String round = line(in.getRound(), 3, "round", "차수");
        if (round != null && !ROUND.matcher(round).matches()) {
            throw bad("round", "차수는 숫자로 입력해 주세요.");
        }
        x.round = round;
        x.agendaNo = line(in.getAgendaNo(), 30, "agenda_no", "의안번호");
        x.speakerDept = line(in.getSpeakerDept(), 40, "speaker_dept", "발표자 소속");
        String name = line(in.getSpeakerName(), 30, "speaker_name", "발표자 이름");
        x.speakerName = name != null ? name : lenient(me.getName(), 30);                 // 비우면 내려받는 사람
        String title = line(in.getSpeakerTitle(), 30, "speaker_title", "발표자 직함");
        x.speakerTitle = title != null ? title : lenient(me.getPositionTitle(), 30);
        Integer years = in.getTermYears();
        if (years != null && (years < 1 || years > 30)) {
            throw bad("term_years", "약정기간은 1~30년으로 입력해 주세요.");
        }
        x.termYears = years;
        x.reviewWhen = line(in.getReviewWhen(), 40, "review_when", "심의 예상 시기");
        x.accounting = line(in.getAccounting(), 40, "accounting", "회계처리 방식");
        x.amountMode = amountMode(in.getAmountMode());
        x.intro = lines(in.getIntro(), "intro", "사전 설명");
        x.statusNote = lines(in.getStatusNote(), "status_note", "현황 부연");
        x.effect = lines(in.getEffect(), "effect", "기대효과");
        x.profitNote = lines(in.getProfitNote(), "profit_note", "수익성 부연");
    }

    private static String meeting(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty() || "BOARD".equals(v) || "이사회".equals(v)) {
            return BoardScriptDocBuilder.MEETING_BOARD;
        }
        if ("COMMITTEE".equals(v) || "출연금심의위원회".equals(v)) {
            return BoardScriptDocBuilder.MEETING_COMMITTEE;
        }
        throw bad("meeting", "회의 종류가 올바르지 않습니다.");
    }

    /** 대본 본문과 AI 초안(ScriptDraftService)이 같은 규칙을 쓰도록 패키지 공개. 비움 → TOTAL, 모르는 값 → 400 amount_mode. */
    static String amountMode(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty() || BoardScriptDocBuilder.AMOUNT_TOTAL.equals(v)) {
            return BoardScriptDocBuilder.AMOUNT_TOTAL;   // 비우면 표 합계(사용자 결정 11-27)
        }
        if (BoardScriptDocBuilder.AMOUNT_EXCL_IT.equals(v)) {
            return BoardScriptDocBuilder.AMOUNT_EXCL_IT;
        }
        throw bad("amount_mode", "승인 금액 기준이 올바르지 않습니다.");
    }

    /** 한 줄 칸 — null·빈 글자는 null. 제어·서식 문자는 400, 길이 초과는 400. */
    static String line(String raw, int max, String key, String label) {
        if (raw == null) {
            return null;
        }
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int type = Character.getType(cp);
            if (type == Character.CONTROL || type == Character.SURROGATE || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR || type == Character.FORMAT
                    || cp == 0xFFFE || cp == 0xFFFF
                    || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C) {   // BoardDocSpec.clean 과 같은 규칙(방향 격리 문자 포함)
                throw bad(key, label + "에 쓸 수 없는 문자가 있습니다.");
            }
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            return null;
        }
        if (s.length() > max) {
            throw bad(key, label + "은(는) " + max + "자 이하로 입력해 주세요.");
        }
        return s;
    }

    /** 여러 줄 칸 — 줄바꿈으로만 나눈다(탭 등 다른 제어문자는 거부). 12줄·줄당 300자·합계 1,000자. */
    static List<String> lines(String raw, String key, String label) {
        List<String> out = new ArrayList<String>();
        if (raw == null || raw.trim().isEmpty()) {
            return out;
        }
        if (raw.length() > MAX_FREE_RAW) {
            throw bad(key, label + "이(가) 너무 깁니다. 줄여 주세요.");
        }
        int total = 0;
        for (String part : raw.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) {
            String s = line(part, MAX_FREE_LINE, key, label);
            if (s != null) {
                out.add(s);
                total += s.length();
            }
        }
        if (out.size() > MAX_FREE_LINES || total > MAX_FREE_TOTAL) {
            throw bad(key, label + "은(는) " + MAX_FREE_LINES + "줄, " + MAX_FREE_TOTAL + "자 이하로 입력해 주세요.");
        }
        return out;
    }

    /** DB 값 정리 — 쓸 수 없으면 오류 없이 null(손 입력이 아니라 저장된 값이다). */
    private static String lenient(String raw, int max) {
        try {
            return line(raw, max, "x", "x");
        } catch (ApiException e) {
            return null;
        }
    }

    private static ApiException bad(String key, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "BAD_VALUE");
        d.put("message", message);
        d.put("key", key);
        return ApiException.withDetail(400, d);
    }

    // ── 자동 값 ─────────────────────────────────────────────────────────

    /** 감사 근거 — 숫자·플래그뿐. */
    private static final class Basis {
        Long boardId;
        Integer boardSnap;
        boolean boardConfirmed;
        Integer formVer;
    }

    private Basis loadAuto(BoardScriptInput x, SysUser me, BidPrep p, String bid) {
        Basis basis = new Basis();
        Institution inst = institutions.selectById(p.getInstitutionId());
        x.instType = inst == null ? null : lenient(inst.getType(), 50);
        x.region = inst == null ? null : WorkflowOverviewService.regionName(inst.getRegionCode());

        // 요약 양식(기관 정보 요약): 양식 열람 판정을 통과한 사람에게만(security 11-26 중). 확정 판 우선, 없으면 현재 판. 값은 사람이 쓴 문자열 그대로.
        boolean summaryConfirmed = false;
        JsonNode content = null;
        if (prepForms.canReadForm(me, p)) {
            PrepForm f = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
            Integer verNo = null;
            if (f != null && f.getConfirmedVer() != null) {
                verNo = f.getConfirmedVer();
                summaryConfirmed = true;
            } else if (f != null && f.getCurVer() > 0) {
                verNo = f.getCurVer();
            }
            if (verNo != null) {
                PrepFormVer v = forms.selectVer(bid, InstSummaryTpl.FORM_CD, verNo);
                content = v == null || v.getContentJson() == null ? null : parse(v.getContentJson());
                if (content != null) {
                    basis.formVer = verNo;
                } else {
                    summaryConfirmed = false;
                }
            }
        }
        String name = lenient(p.getInstitutionName(), 100);
        if (name == null && content != null) {
            name = lenient(text(content.path("fields").path("inst_name").path("val")), 100);
        }
        if (name == null && inst != null) {
            name = lenient(inst.getNameKo(), 100);
        }
        x.instName = name;
        if (content != null) {
            x.staff = lenient(text(content.path("fields").path("staff").path("val")), 100);
            x.budget = lenient(text(content.path("fields").path("budget").path("val")), 100);
            x.currentBank = lenient(text(content.path("fields").path("current_bank").path("val")), 200);
            for (JsonNode n : content.path("lists").path("effect")) {
                String e = lenient(text(n), MAX_FREE_LINE);
                if (e != null && x.effectDefault.size() < 10) {
                    x.effectDefault.add(e);
                }
            }
        }

        // 이사회 자료: 확정 판 우선, 없으면 현재 판. 숫자는 담당자·영업부장만(BoardAccess.canViewCase).
        BoardMaterial chosen = null;
        boolean boardConfirmed = false;
        if (boardAccess.canReadCase(me.getEmpNo(), bid)) {   // 읽기 — 그 건의 자기 팀 영업팀장 포함(11-27)
            // 같은 건에 이사회 자료가 여러 개면 최신 하나만 쓴다(질의 정렬: BOARD_YEAR 큰 것, 같으면 MATERIAL_ID 큰 것 — 사용자 11-26).
            // 옛 연도의 확정본이 있어도 그쪽으로 넘어가지 않는다.
            int seen = 0;
            for (Long id : scripts.selectBoardIds(bid)) {
                if (seen++ >= MAX_BOARD_ROWS) {
                    break;
                }
                BoardMaterial m = boards.selectOne(id);
                if (m == null) {
                    continue;
                }
                chosen = m;
                boardConfirmed = BoardMaterialService.CONFIRMED.equals(m.getStatusCd()) && m.getConfirmedSnap() != null;
                break;
            }
        }
        BoardScriptFigures fig = null;
        if (chosen != null) {
            int snapNo = boardConfirmed ? chosen.getConfirmedSnap() : chosen.getCurSnap();
            basis.boardId = chosen.getMaterialId();
            basis.boardSnap = snapNo >= 1 ? Integer.valueOf(snapNo) : null;
            basis.boardConfirmed = boardConfirmed;
            BoardMaterialSnap s = snapNo >= 1 ? boards.selectSnap(chosen.getMaterialId(), snapNo) : null;
            if (s != null) {
                try {
                    fig = BoardScriptFigures.of(boardForms.docForStoredAny(chosen.getFormId(), chosen.getFormVer()), valuesOf(s.getValuesJson()));
                } catch (IllegalStateException e) {
                    fig = null;   // 저장된 양식을 읽지 못함 — 숫자를 만들지 않고 '확인 필요'로 둔다
                }
            }
            String md = chosen.getMeetingDate();
            x.year = md != null && md.matches("[0-9]{4}.*") ? Integer.valueOf(md.substring(0, 4)) : Integer.valueOf(chosen.getBoardYear());
        }
        x.boardMissing = fig == null;
        if (fig != null) {
            x.amountExclIt = fig.exclIt;
            x.amountTotal = fig.total;
            x.profit = fig.profit;
        }
        x.draft = !(boardConfirmed && summaryConfirmed);
        x.termStart = chosen == null ? null : termStart(p.getInstitutionId(), chosen.getBoardYear());   // 이사회 연도를 모르면 시작일을 짐작하지 않는다(security 11-26 하)
        return basis;
    }

    /** RFP 협약 개시일 — 이사회 연도와 같은 목표 연도의 SAVE 행(질의가 연도별 최신 행만 준다). 없으면 null. */
    private String termStart(String institutionId, int boardYear) {
        for (BidTerm t : targets.selectTermsOf(institutionId)) {
            if (ACTION_SAVE.equals(t.getActionCd()) && t.getTermStart() != null && t.getTargetYear() == boardYear) {
                return t.getTermStart();
            }
        }
        return null;
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            return null;
        }
    }

    private static String text(JsonNode n) {
        return n != null && n.isTextual() && !n.asText().trim().isEmpty() ? n.asText().trim() : null;
    }

    /** 저장 JSON → {표 ref: {칸 key: 값}} (BoardMaterialService.tablesOf 와 같은 읽기). 못 읽으면 빈 맵. */
    private static Map<String, Map<String, String>> valuesOf(String json) {
        Map<String, Map<String, String>> out = new LinkedHashMap<String, Map<String, String>>();
        JsonNode root = json == null ? null : parse(json);
        if (root == null) {
            return out;
        }
        Iterator<Map.Entry<String, JsonNode>> it = root.path("tables").fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            Map<String, String> cells = new LinkedHashMap<String, String>();
            Iterator<Map.Entry<String, JsonNode>> ci = e.getValue().fields();
            while (ci.hasNext()) {
                Map.Entry<String, JsonNode> c = ci.next();
                cells.put(c.getKey(), c.getValue().asText());
            }
            out.put(e.getKey(), cells);
        }
        return out;
    }
}
