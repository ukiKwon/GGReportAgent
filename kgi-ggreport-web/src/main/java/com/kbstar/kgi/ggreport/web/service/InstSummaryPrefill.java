package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.docout.InstSummaryTpl;
import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.InstBasic;
import com.kbstar.kgi.ggreport.web.domain.InstHead;
import com.kbstar.kgi.ggreport.web.domain.InstHeadItem;
import com.kbstar.kgi.ggreport.web.domain.PlanImportRef;
import com.kbstar.kgi.ggreport.web.domain.PlanSeedItem;
import com.kbstar.kgi.ggreport.web.mapper.BankContractMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionHeadMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepFormMapper;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기관 정보 요약 양식(049) 미리 채움 — 사실 칸(FACT)의 현재 원본과 씨앗(기관 주요 사업·연도 표 시작 연도)을 <b>읽기만</b> 한다.
 * <ul>
 *   <li>기관명·기관 형태: INSTITUTIONS. 기관장: 현 기관장(CURRENT)의 <b>NAME 확정 칸만</b> — 생년월일(055)·사진·경력 등 다른 칸은 읽지 않는다(security 11-20).
 *       기관장 기능 스위치가 꺼져 있으면 읽지 않는다. {@code InstitutionHeadService.detail} 은 부르지 않고 매퍼를 직접 읽는다(영업 역할 검사 때문 — 감사 공백은 보고서 5절).</li>
 *   <li>현 거래 은행: 금고 약정(039) 중 취소 안 된 줄 가운데 만기(TERM_TO)가 오늘 이후인 줄, 없으면 만기가 가장 늦은 한 줄.</li>
 *   <li>기관 주요 사업 씨앗: 최신 사업계획 반입(034)의 상위 사업. 글자 정리(제어 문자·200자)와 개인정보 검사(Pii.scanLoose)를 거치고, 걸린 줄은 빼고 개수만 센다(security 하-3).</li>
 * </ul>
 * 출처(src)는 {kind, ref, title, url, published, checked_on, at} — ref 가 '낡음' 판정의 열쇠다(원본이 바뀌면 ref 나 값이 달라진다).
 */
@Service
public class InstSummaryPrefill {

    public static final String KIND_INST = "INST_MASTER";
    public static final String KIND_BANK = "BANK_CONTRACT";
    public static final String KIND_PLAN = "PLAN_IMPORT";
    static final int SEED_LINE_MAX = 200;
    static final int SEED_TITLE_MAX = 60;

    /** 사실 칸 한 개의 현재 원본 — val 이 null 이면 원본 없음(src 도 null). */
    public static final class Fact {
        private final String val;
        private final Map<String, Object> src;

        public Fact(String val, Map<String, Object> src) {
            this.val = val;
            this.src = src;
        }

        public String getVal() { return val; }
        public Map<String, Object> getSrc() { return src; }

        public String ref() {
            Object r = src == null ? null : src.get("ref");
            return r == null ? null : r.toString();
        }
    }

    /** 기관 주요 사업 씨앗 — src 는 반입 판 출처, rows 는 정리된 행(최대 40), dropped 는 개인정보·빈 칸으로 뺀 줄·행 수. */
    public static final class BizSeed {
        private final Map<String, Object> src;
        private final List<Map<String, Object>> rows;
        private final int dropped;

        BizSeed(Map<String, Object> src, List<Map<String, Object>> rows, int dropped) {
            this.src = src;
            this.rows = rows;
            this.dropped = dropped;
        }

        public Map<String, Object> getSrc() { return src; }
        public List<Map<String, Object>> getRows() { return rows; }
        public int getDropped() { return dropped; }
    }

    private final PrepFormMapper mapper;
    private final InstitutionHeadMapper heads;
    private final BankContractMapper banks;
    private final InstHeadSettings headSettings;

    public InstSummaryPrefill(PrepFormMapper mapper, InstitutionHeadMapper heads, BankContractMapper banks, InstHeadSettings headSettings) {
        this.mapper = mapper;
        this.heads = heads;
        this.banks = banks;
        this.headSettings = headSettings;
    }

    /** 기관장 기능이 켜져 있는가 — 꺼져 있으면 head_name 은 필수가 아니다. */
    public boolean headEnabled() {
        return headSettings.isEnabled();
    }

    /** FACT 네 칸의 현재 원본(키 순서 고정). 같은 트랜잭션의 읽기 전용 조회다. */
    @Transactional(readOnly = true)
    public Map<String, Fact> snapshot(String institutionId) {
        String at = Times.nowIso();
        Map<String, Fact> out = new LinkedHashMap<String, Fact>();
        InstBasic b = mapper.selectInstBasic(institutionId);
        String name = b == null ? null : blankToNull(b.getNameKo());
        out.put("inst_name", name == null ? none() : new Fact(name, src(KIND_INST, "INST:" + institutionId, "기관 기본 정보", null, null, null, at)));
        String type = b == null ? null : blankToNull(b.getType());
        out.put("inst_type", type == null ? none() : new Fact(type, src(KIND_INST, "INST:" + institutionId, "기관 기본 정보", null, null, null, at)));
        out.put("head_name", headFact(institutionId, at));
        out.put("current_bank", bankFact(institutionId, at));
        return out;
    }

    /** 기관 주요 사업 씨앗. 반입이 없으면 null. */
    @Transactional(readOnly = true)
    public BizSeed seedBiz(String institutionId) {
        PlanImportRef ref = mapper.selectLatestPlanImport(institutionId);
        if (ref == null || ref.getImportId() == null) {
            return null;
        }
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        int dropped = 0;
        for (PlanSeedItem it : mapper.selectPlanItems(ref.getImportId())) {
            if (rows.size() >= InstSummaryTpl.MAX_BIZ_ROWS) {
                break;
            }
            String field = seedText(it.getFieldName(), SEED_TITLE_MAX);
            String item = seedText(it.getItemName(), SEED_TITLE_MAX);
            if (field == BLOCKED || item == BLOCKED) {   // 같은 객체 비교 — 개인정보로 걸린 표식
                dropped++;
                continue;
            }
            String group = field != null ? field : item;
            String sub = field != null ? item : null;
            if (group == null) {
                dropped++;
                continue;
            }
            List<String> lines = new ArrayList<String>();
            String content = seedText(it.getContent(), SEED_LINE_MAX);
            if (content == BLOCKED) {
                dropped++;
            } else if (content != null) {
                lines.add(content);
            }
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("group", group);
            row.put("sub", sub);
            row.put("lines", lines);
            rows.add(row);
        }
        Map<String, Object> src = src(KIND_PLAN, planRef(ref.getImportId()), "기관 사업계획", null, null, ref.getFileDate(), Times.nowIso());
        return new BizSeed(src, rows, dropped);
    }

    /** 연도 표의 시작 연도 = 현재 약정 만기(TERM_TO) 연도 + 1. 약정이 없거나 만기 연도를 읽을 수 없으면 null. */
    @Transactional(readOnly = true)
    public Integer seedYearFrom(String institutionId) {
        Integer max = null;
        for (BankContract c : currentLines(institutionId)) {
            Integer y = yearOf(c.getTermTo());
            if (y != null && (max == null || y.intValue() > max.intValue())) {
                max = y;
            }
        }
        return nextYear(max);
    }

    /** 만기 연도 + 1, 저장 검사 상한(2100)을 넘으면 2100 으로 자른다 — 손대지 않은 연도 표가 BAD_YEARS 400 을 내지 않게. null 이면 null. */
    static Integer nextYear(Integer termYear) {
        return termYear == null ? null : Integer.valueOf(Math.min(termYear.intValue() + 1, 2100));
    }

    /** 최신 사업계획 반입의 출처 참조("PLAN_IMPORT:{id}"). 반입이 없으면 null. */
    @Transactional(readOnly = true)
    public String latestPlanRef(String institutionId) {
        PlanImportRef ref = mapper.selectLatestPlanImport(institutionId);
        return ref == null || ref.getImportId() == null ? null : planRef(ref.getImportId());
    }

    static String planRef(Long importId) {
        return KIND_PLAN + ":" + importId;
    }

    // ── 사실 칸 ─────────────────────────────────────────────────────────

    private Fact headFact(String institutionId, String at) {
        if (!headSettings.isEnabled()) {
            return none();
        }
        InstHead head = heads.selectCurrentHead(institutionId);
        if (head == null || head.getHeadId() == null) {
            return none();
        }
        // NAME 칸만 읽는다 — 같은 머리의 BIRTH_DATE(055)·직위·경력 칸은 이 양식에 싣지 않는다.
        List<InstHeadItem> names = heads.selectItemsOfHeadField(head.getHeadId(), "NAME", "CONFIRMED");
        for (InstHeadItem n : names) {
            String v = blankToNull(n.getValText());
            if (v != null && n.getItemId() != null) {
                return new Fact(v, src(blankToNull(n.getSrcKindCd()), "HEAD_ITEM:" + n.getItemId(), n.getSrcTitle(),
                        n.getSrcUrl(), n.getSrcPublished(), n.getCheckedOn(), at));
            }
        }
        return none();
    }

    private Fact bankFact(String institutionId, String at) {
        List<BankContract> lines = currentLines(institutionId);
        if (lines.isEmpty()) {
            return none();
        }
        StringBuilder val = new StringBuilder();
        StringBuilder ref = new StringBuilder();
        String checked = null;
        for (BankContract c : lines) {
            if (val.length() > 0) {
                val.append(" / ");
                ref.append('|');
            }
            val.append(bankText(c));
            ref.append("BANK:").append(c.getContractNo()).append('.').append(c.getRevNo());
            if (c.getCheckedDate() != null && (checked == null || c.getCheckedDate().compareTo(checked) > 0)) {
                checked = c.getCheckedDate();
            }
        }
        return new Fact(val.toString(), src(KIND_BANK, ref.toString(), "금고 약정 기록", null, null, checked, at));
    }

    /** 현재 약정 줄(순위·줄 번호 순) — 취소 안 된 줄 중 만기가 오늘 이후인 줄, 없으면 만기가 가장 늦은 한 줄. */
    List<BankContract> currentLines(String institutionId) {
        List<BankContract> valid = new ArrayList<BankContract>(banks.selectLatestValid(institutionId));
        if (valid.isEmpty()) {
            return Collections.emptyList();
        }
        String today = Times.todayKst();
        List<BankContract> now = new ArrayList<BankContract>();
        BankContract latest = null;
        for (BankContract c : valid) {
            String end = endOf(c.getTermTo());
            if (end.compareTo(today) >= 0) {
                now.add(c);
            }
            if (latest == null || end.compareTo(endOf(latest.getTermTo())) > 0) {
                latest = c;
            }
        }
        if (now.isEmpty()) {
            now.add(latest);
        }
        Collections.sort(now, new Comparator<BankContract>() {
            @Override
            public int compare(BankContract a, BankContract b) {
                int r = Integer.compare(rankOrder(a.getRankCd()), rankOrder(b.getRankCd()));
                return r != 0 ? r : Integer.compare(a.getContractNo(), b.getContractNo());
            }
        });
        return now;
    }

    /** 만기 문자열(YYYY | YYYY-MM | YYYY-MM-DD)을 그 기간의 마지막 날 쪽으로 늘려 문자열 비교가 되게 한다. */
    static String endOf(String termTo) {
        String t = termTo == null ? "" : termTo.trim();
        if (t.length() == 4) {
            return t + "-12-31";
        }
        if (t.length() == 7) {
            return t + "-31";
        }
        return t;
    }

    static Integer yearOf(String term) {
        if (term == null || term.trim().length() < 4) {
            return null;
        }
        String y = term.trim().substring(0, 4);
        return y.matches("[0-9]{4}") ? Integer.valueOf(Integer.parseInt(y)) : null;
    }

    private static int rankOrder(String rankCd) {
        if ("FIRST".equals(rankCd) || "SINGLE".equals(rankCd)) {
            return 1;
        }
        if ("SECOND".equals(rankCd)) {
            return 2;
        }
        if ("JOINT".equals(rankCd)) {
            return 3;
        }
        return 4;
    }

    private static String rankText(String rankCd) {
        if ("FIRST".equals(rankCd)) {
            return "1금고";
        }
        if ("SECOND".equals(rankCd)) {
            return "2금고";
        }
        if ("JOINT".equals(rankCd)) {
            return "공동 지정";
        }
        if ("SINGLE".equals(rankCd)) {
            return "단수 금고";
        }
        return "";
    }

    /** "{순위} {은행명} ({시작}~{만기})" — 시작이 없으면 "(~만기)". */
    static String bankText(BankContract c) {
        String bank = "ETC".equals(c.getBankCd()) && blankToNull(c.getBankNameEtc()) != null ? c.getBankNameEtc()
                : blankToNull(c.getBankName()) != null ? c.getBankName() : orEmpty(c.getBankCd());
        String rank = rankText(c.getRankCd());
        String from = c.getTermFrom() == null ? "" : c.getTermFrom();
        return (rank.isEmpty() ? "" : rank + " ") + bank + " (" + from + "~" + orEmpty(c.getTermTo()) + ")";
    }

    // ── 도우미 ──────────────────────────────────────────────────────────

    private static Fact none() {
        return new Fact(null, null);
    }

    private static Map<String, Object> src(String kind, String ref, String title, String url, String published, String checkedOn, String at) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("kind", kind);
        m.put("ref", ref);
        m.put("title", title);
        m.put("url", url);
        m.put("published", published);
        m.put("checked_on", checkedOn);
        m.put("at", at);
        return m;
    }

    /** 개인정보로 걸린 씨앗 글자의 표식 — 같은 객체인지(==)로만 비교한다. */
    private static final String BLOCKED = new String("\u0000blocked");

    /** 씨앗 글자 정리 — 제어·서식·방향 문자 제거, 앞뒤 공백 제거, max 자로 자르기. 비면 null, 개인정보로 보이면 {@link #BLOCKED}. */
    static String seedText(String raw, int max) {
        if (raw == null) {
            return null;
        }
        StringBuilder b = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int ty = Character.getType(cp);
            if (cp == '\n' || cp == '\t' || cp == '\r') {
                b.append(' ');
            } else if (ty == Character.CONTROL || ty == Character.FORMAT || ty == Character.SURROGATE
                    || ty == Character.LINE_SEPARATOR || ty == Character.PARAGRAPH_SEPARATOR
                    || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C) {
                continue;
            } else {
                b.appendCodePoint(cp);
            }
        }
        String t = b.toString().trim();
        // 자르기 전 원문에도 건다 — 경계에 걸려 잘린 주민번호 앞부분은 자른 뒤에는 패턴이 안 잡힌다.
        boolean pii = !Pii.scanLoose(t).isEmpty();
        if (t.length() > max) {
            int end = max;
            if (Character.isHighSurrogate(t.charAt(end - 1))) {
                end--;
            }
            t = t.substring(0, end).trim();
        }
        if (t.isEmpty()) {
            return null;
        }
        if (pii || !Pii.scanLoose(t).isEmpty()) {
            return BLOCKED;
        }
        return t;
    }

    private static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
