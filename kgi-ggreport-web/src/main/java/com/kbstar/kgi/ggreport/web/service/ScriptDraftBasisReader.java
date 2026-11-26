package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.docout.InstSummaryTpl;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialSnap;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.PrepForm;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVer;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepFormMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepScriptMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 발표 대본 AI 초안(NEXT 129 ⑤)의 입력 묶음 — PrepScriptService.loadAuto 와 <b>같은 열람 규칙</b>으로 읽는다:
 * 요약 양식은 canReadForm, 이사회 숫자는 canViewCase(담당자·영업부장)일 때만. 404·403·409 는 ScriptDraftService.prepare 가 먼저 판정한다.
 * ⚠️ loadAuto 가 private 이라 읽기를 옮겨 적었다 — 그쪽 규칙이 바뀌면 여기도 같이. 6e 가 공용 읽기를 빼 주면 이 클래스를 그쪽 호출로 줄인다.
 * 개인정보: 기관장 이름·직함·소재지는 읽지 않는다. 조직현황·MMDA 산정 근거·이사회 연도도 읽지 않는다(사용자 A-3, security 하-4).
 * 읽은 글마다 Pii.scan 에 걸리거나 7자리 숫자(사번 모양)가 있으면 그 값을 버린다(사람 이름은 정규식으로 못 잡는다 — 한계).
 * 읽기 전용 트랜잭션 — LLM 호출은 이 트랜잭션이 끝난 뒤(DB 연결을 몇 분씩 잡지 않게).
 */
@Service
public class ScriptDraftBasisReader {

    static final int MAX_BOARD_ROWS = 20;
    static final int MAX_LIST_ITEMS = 5;
    static final int MAX_NOTICE_ITEMS = 20;
    static final int MAX_NOTICE_LINE = 300;
    static final int MAX_NOTICE_CHARS = 3_000;
    private static final Pattern EMP_LIKE = Pattern.compile("(?<![0-9])[0-9]{7}(?![0-9])");
    private static final ObjectMapper JSON = new ObjectMapper();

    public static final class Basis {
        String instName;
        String instType;
        String region;
        String supervisor;
        String staff;
        String budget;
        String currentBank;
        final List<String> overview = new ArrayList<String>();
        final List<String> competition = new ArrayList<String>();
        final List<String> effect = new ArrayList<String>();
        final List<String> notice = new ArrayList<String>();
        BigDecimal amountExclIt;
        BigDecimal amountTotal;
        BigDecimal profit;
        Long boardId;
        Integer boardSnap;
        boolean boardConfirmed;
        Integer formVer;
        boolean summaryConfirmed;
        int piiDropped;

        public Long getBoardId() { return boardId; }
        public Integer getBoardSnap() { return boardSnap; }
        public boolean isBoardConfirmed() { return boardConfirmed; }
        public Integer getFormVer() { return formVer; }
        boolean hasBoardFigures() { return amountExclIt != null || amountTotal != null || profit != null; }
    }

    private final PrepFormService prepForms;
    private final PrepFormMapper forms;
    private final PrepScriptMapper scripts;
    private final BoardMaterialMapper boards;
    private final BoardFormService boardForms;
    private final BoardAccess boardAccess;
    private final InstitutionMapper institutions;
    private final ObjectProvider<NoticeBasisSource> notices;

    public ScriptDraftBasisReader(PrepFormService prepForms, PrepFormMapper forms, PrepScriptMapper scripts,
                                  BoardMaterialMapper boards, BoardFormService boardForms, BoardAccess boardAccess,
                                  InstitutionMapper institutions, ObjectProvider<NoticeBasisSource> notices) {
        this.prepForms = prepForms;
        this.forms = forms;
        this.scripts = scripts;
        this.boards = boards;
        this.boardForms = boardForms;
        this.boardAccess = boardAccess;
        this.institutions = institutions;
        this.notices = notices;
    }

    @Transactional(readOnly = true)
    public Basis read(SysUser me, BidPrep p) {
        String bid = p.getBidCaseId();
        Basis b = new Basis();
        Institution inst = institutions.selectById(p.getInstitutionId());
        b.instType = inst == null ? null : clean(b, inst.getType(), 50);
        b.region = inst == null ? null : clean(b, WorkflowOverviewService.regionName(inst.getRegionCode()), 20);

        JsonNode content = null;
        if (prepForms.canReadForm(me, p)) {
            PrepForm f = forms.selectForm(bid, InstSummaryTpl.FORM_CD);
            Integer verNo = null;
            boolean confirmed = false;
            if (f != null && f.getConfirmedVer() != null) {
                verNo = f.getConfirmedVer();
                confirmed = true;
            } else if (f != null && f.getCurVer() > 0) {
                verNo = f.getCurVer();
            }
            if (verNo != null) {
                PrepFormVer v = forms.selectVer(bid, InstSummaryTpl.FORM_CD, verNo);
                content = v == null || v.getContentJson() == null ? null : parse(v.getContentJson());
                if (content != null) {
                    b.formVer = verNo;
                    b.summaryConfirmed = confirmed;
                }
            }
        }
        String name = clean(b, p.getInstitutionName(), 100);
        if (name == null && content != null) {
            name = clean(b, text(field(content, "inst_name")), 100);
        }
        if (name == null && inst != null) {
            name = clean(b, inst.getNameKo(), 100);
        }
        b.instName = name;
        if (content != null) {          // head_name·head_title·address·org_note·mmda_basis 는 읽지 않는다(개인정보·사용자 A-3)
            b.supervisor = clean(b, text(field(content, "supervisor")), 60);
            b.staff = clean(b, text(field(content, "staff")), 40);
            b.budget = clean(b, text(field(content, "budget")), 60);
            b.currentBank = clean(b, text(field(content, "current_bank")), 200);
            list(b, content, "overview", b.overview);
            list(b, content, "competition", b.competition);
            list(b, content, "effect", b.effect);
        }

        if (boardAccess.canViewCase(me.getEmpNo(), bid)) {   // 이중 방어 — 최신 자료 하나(PrepScriptService 와 같은 규칙, 사용자 11-26)
            BoardMaterial chosen = null;
            boolean confirmed = false;
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
                confirmed = BoardMaterialService.CONFIRMED.equals(m.getStatusCd()) && m.getConfirmedSnap() != null;
                break;
            }
            if (chosen != null) {
                int snapNo = confirmed ? chosen.getConfirmedSnap() : chosen.getCurSnap();
                b.boardId = chosen.getMaterialId();
                b.boardSnap = snapNo >= 1 ? Integer.valueOf(snapNo) : null;
                b.boardConfirmed = confirmed;
                BoardMaterialSnap s = snapNo >= 1 ? boards.selectSnap(chosen.getMaterialId(), snapNo) : null;
                BoardScriptFigures fig = null;
                if (s != null) {
                    try {
                        fig = BoardScriptFigures.of(boardForms.docForStoredAny(chosen.getFormId(), chosen.getFormVer()), valuesOf(s.getValuesJson()));
                    } catch (IllegalStateException e) {
                        fig = null;   // 양식을 못 읽음 — 숫자를 만들지 않는다
                    }
                }
                if (fig != null) {
                    b.amountExclIt = fig.exclIt;
                    b.amountTotal = fig.total;
                    b.profit = fig.profit;
                }
            }
        }

        NoticeBasisSource src = notices.getIfAvailable();   // 지금은 구현 빈이 없다 — 공고 자료 없이 만든다
        if (src != null) {
            int total = 0;
            List<String> lines = src.lines(me, p);
            if (lines != null) {
                for (String raw : lines) {
                    String v = clean(b, raw, MAX_NOTICE_LINE);
                    if (v == null) continue;
                    if (b.notice.size() >= MAX_NOTICE_ITEMS || total + v.length() > MAX_NOTICE_CHARS) break;
                    b.notice.add(v);
                    total += v.length();
                }
            }
        }
        return b;
    }

    /** 제어·서식·사설 문자는 공백, 공백 접기, 길이 자르기(서로게이트 반쪽 방지), Pii.scan 에 걸리거나 7자리 숫자(사번 모양)면 버리고 센다. */
    static String clean(Basis b, String raw, int max) {
        if (raw == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int t = Character.getType(cp);
            boolean bad = t == Character.CONTROL || t == Character.FORMAT || t == Character.SURROGATE
                    || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR
                    || t == Character.PRIVATE_USE || t == Character.UNASSIGNED;
            sb.appendCodePoint(bad ? ' ' : cp);
        }
        String s = sb.toString().replaceAll("\\s+", " ").trim();
        if (s.isEmpty()) {
            return null;
        }
        if (s.length() > max) {
            int end = Character.isHighSurrogate(s.charAt(max - 1)) ? max - 1 : max;
            s = s.substring(0, end).trim();
        }
        if (ScriptDraftService.piiFound(s) || EMP_LIKE.matcher(s).find()) {   // Pii.scan + 유선전화까지(scanExternal). 사번 모양(7자리 숫자) 버림 — 사용자 A-3, security 중-1
            if (b != null) {
                b.piiDropped++;
            }
            return null;
        }
        return s;
    }

    private static void list(Basis b, JsonNode content, String key, List<String> out) {
        for (JsonNode n : content.path("lists").path(key)) {
            String v = clean(b, text(n), 300);
            if (v != null && out.size() < MAX_LIST_ITEMS) {
                out.add(v);
            }
        }
    }

    private static JsonNode field(JsonNode content, String key) {
        return content.path("fields").path(key).path("val");
    }

    private static String text(JsonNode n) {
        return n != null && n.isTextual() && !n.asText().trim().isEmpty() ? n.asText().trim() : null;
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            return null;
        }
    }

    /** PrepScriptService.valuesOf 와 같은 읽기(그쪽이 private). */
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
