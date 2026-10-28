package com.kbstar.kgi.ggreport.web.docfill;

import org.apache.poi.xwpf.usermodel.IBody;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFHeader;
import org.apache.poi.xwpf.usermodel.XWPFHyperlinkRun;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.xmlbeans.XmlCursor;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTR;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTRPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 워드 문서에서 키워드를 찾아 그 <b>옆에</b> 값을 적는다. LLM 없이 규칙만으로 돈다.
 *
 * <h3>"옆"의 뜻 — 두 가지뿐이다</h3>
 * <ol>
 *   <li><b>표 안의 라벨 칸</b>: 칸의 글이 키워드(뒤에 {@code :}가 붙어도 됨)뿐이면 <b>오른쪽 칸</b>에 적는다.
 *       병합 칸은 건너뛴다(가로 병합은 칸이 하나라서 다음 칸이 곧 오른쪽, 세로 병합의 이어짐 칸이면
 *       그 병합의 시작 칸에 적는다).</li>
 *   <li><b>문단 안의 글</b>: 키워드(와 뒤따르는 {@code :}) <b>바로 뒤</b>에 끼워 넣는다.</li>
 * </ol>
 * 라벨이 값 <b>위쪽</b>에 있는 세로 배치는 지원하지 않는다.
 *
 * <h3>Word가 글을 쪼개는 문제</h3>
 * Word는 서식이 바뀌는 지점마다 글을 run으로 쪼갠다(편집 이력만으로도 "사업명"이 "사업"+"명"이 된다).
 * 그래서 키워드를 run 하나씩 비교하면 <b>눈에 보이는 키워드를 못 찾는다.</b> 문단의 run을 이어 붙인
 * 글에서 찾고, 삽입 위치가 run 한가운데면 run을 <b>둘로 갈라</b> 사이에 넣는다(서식은 복사한다).
 *
 * <h3>안전장치</h3>
 * <ul>
 *   <li>이미 같은 값이 적혀 있으면 건드리지 않는다 — <b>두 번 돌려도 같은 결과</b>다.</li>
 *   <li>기입할 자리에 다른 내용이 있으면 덮어쓰지 않고 충돌로 보고한다(표의 오른쪽 칸은 규칙이
 *       허용할 때만 덮어씀).</li>
 *   <li>한 번 기입한 문단·칸은 다시 훑지 않는다 — 값 안에 키워드가 들어 있어도 연쇄로 채우지 않는다.</li>
 *   <li>모르는 구조(하이퍼링크 run 등)는 추측해서 끼워 넣지 않고 {@code 미지원}으로 보고한다.</li>
 * </ul>
 */
public final class WordFiller {

    private static final char OPAQUE = '￼';

    /** 한 run의 글과 위치. */
    private static final class RunInfo {
        final int index;          // p.getRuns() 안의 순번
        final XWPFRun run;
        final String text;
        final boolean plain;      // w:t 하나뿐인 단순 run — 안전하게 쪼갤 수 있다
        int start;
        int end;

        RunInfo(int index, XWPFRun run, String text, boolean plain) {
            this.index = index;
            this.run = run;
            this.text = text;
            this.plain = plain;
        }
    }

    /** 문단 하나와 그 문단이 놓인 칸(본문이면 null). */
    private static final class Site {
        final XWPFParagraph paragraph;
        final XWPFTableCell cell;
        final XWPFTableRow row;
        final XWPFTable table;

        Site(XWPFParagraph paragraph, XWPFTableCell cell, XWPFTableRow row, XWPFTable table) {
            this.paragraph = paragraph;
            this.cell = cell;
            this.row = row;
            this.table = table;
        }
    }

    private enum Outcome { FILLED, ALREADY, CONFLICT, UNSUPPORTED }

    private final Set<XWPFParagraph> touched =
            java.util.Collections.newSetFromMap(new IdentityHashMap<XWPFParagraph, Boolean>());

    /** 규칙 하나를 문서에 적용하고 결과를 {@code entry}에 남긴다. */
    void apply(XWPFDocument doc, FillRule rule, String value, FillReport.Entry entry) {
        List<Site> sites = new ArrayList<Site>();
        collect(doc, sites);
        for (XWPFHeader h : doc.getHeaderList()) collect(h, sites);
        for (XWPFFooter f : doc.getFooterList()) collect(f, sites);

        boolean first = rule.occurrence() == FillRule.Occurrence.FIRST;
        for (Site site : sites) {
            if (touched.contains(site.paragraph)) continue;
            List<RunInfo> runs = runInfos(site.paragraph);
            String text = join(runs);
            List<Integer> hits = occurrences(text, rule.keyword());
            if (hits.isEmpty()) continue;

            // FIRST는 문서 순서상 첫 위치 하나만, ALL은 전부. 뒤에서부터 처리한다 — 앞 위치의
            // 오프셋이 뒤쪽 수정에 영향받지 않는다.
            if (rule.isLabelOnly()) {
                List<Integer> keep = new ArrayList<Integer>();
                for (int at : hits) if (isLabelPosition(site, text, at, rule.keyword())) keep.add(at);
                hits = keep;
                if (hits.isEmpty()) continue;
            }
            for (int h = (first ? 0 : hits.size() - 1); h >= 0; h--) {
                entry.foundOne();
                record(entry, handle(site, runs, text, hits.get(h), rule, value, entry));
                if (first) return;
            }
        }
    }

    /** 라벨 자리인가: 표의 라벨 칸이거나, 키워드 바로 뒤(공백 허용)에 콜론이 온다. */
    private static boolean isLabelPosition(Site site, String text, int at, String keyword) {
        if (site.cell != null && isLabelCell(site.cell, keyword)) return true;
        int j = at + keyword.length();
        while (j < text.length() && Character.isWhitespace(text.charAt(j))) j++;
        return j < text.length() && (text.charAt(j) == ':' || text.charAt(j) == '：');
    }

    // ── 위치 결정 ──────────────────────────────────────────────────────────

    private Outcome handle(Site site, List<RunInfo> runs, String text, int at,
                           FillRule rule, String value, FillReport.Entry entry) {
        int kwEnd = at + rule.keyword().length();
        if (site.cell != null && isLabelCell(site.cell, rule.keyword())) {
            XWPFTableCell target = rightNeighbor(site, entry);
            if (target != null) return writeCell(target, value, rule.isOverwrite(), entry);
            // 오른쪽 칸이 없으면(마지막 열) 같은 칸 안에서 문단 방식으로 적는다.
            entry.warn("라벨 칸의 오른쪽에 칸이 없어 같은 칸 안에 적었다");
        }
        return insertAfter(site.paragraph, runs, text, kwEnd, value, entry);
    }

    /** 칸의 글 전체가 키워드(+선택적 콜론)뿐인가. */
    private static boolean isLabelCell(XWPFTableCell cell, String keyword) {
        String t = cell.getText() == null ? "" : cell.getText().trim();
        return Pattern.compile("^" + Pattern.quote(keyword) + "\\s*[:：]?$").matcher(t).matches();
    }

    /** 같은 행에서 오른쪽 칸. 세로 병합의 이어짐 칸이면 같은 열의 병합 시작 칸을 돌려준다. */
    private XWPFTableCell rightNeighbor(Site site, FillReport.Entry entry) {
        List<XWPFTableCell> cells = site.row.getTableCells();
        int idx = cells.indexOf(site.cell);
        if (idx < 0 || idx + 1 >= cells.size()) return null;
        XWPFTableCell next = cells.get(idx + 1);
        if (!isVMergeContinuation(next)) return next;

        int grid = gridStart(cells, idx + 1);
        List<XWPFTableRow> rows = site.table.getRows();
        for (int r = rows.indexOf(site.row) - 1; r >= 0; r--) {
            XWPFTableCell up = cellAtGrid(rows.get(r).getTableCells(), grid);
            if (up == null) break;
            if (!isVMergeContinuation(up)) {
                entry.warn("오른쪽 칸이 세로 병합의 이어짐 칸이라 병합 시작 칸(" + (r + 1) + "행)에 적었다");
                return up;
            }
        }
        entry.warn("오른쪽 칸이 세로 병합의 이어짐 칸인데 시작 칸을 찾지 못했다");
        return null;
    }

    private static boolean isVMergeContinuation(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || pr.getVMerge() == null) return false;
        STMerge.Enum val = pr.getVMerge().getVal();
        return val == null || val == STMerge.CONTINUE;   // val 생략 = continue
    }

    private static int span(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || pr.getGridSpan() == null || pr.getGridSpan().getVal() == null) return 1;
        return pr.getGridSpan().getVal().intValue();
    }

    private static int gridStart(List<XWPFTableCell> cells, int idx) {
        int g = 0;
        for (int i = 0; i < idx; i++) g += span(cells.get(i));
        return g;
    }

    private static XWPFTableCell cellAtGrid(List<XWPFTableCell> cells, int grid) {
        int g = 0;
        for (XWPFTableCell c : cells) {
            if (g == grid) return c;
            g += span(c);
            if (g > grid) return null;   // 병합 한가운데를 가리킨다 — 같은 칸이 아니다
        }
        return null;
    }

    // ── 표 오른쪽 칸에 쓰기 ────────────────────────────────────────────────

    private Outcome writeCell(XWPFTableCell target, String value, boolean overwrite, FillReport.Entry entry) {
        String existing = target.getText() == null ? "" : target.getText().trim();
        if (existing.equals(value.trim())) return Outcome.ALREADY;
        if (!existing.isEmpty() && !overwrite) {
            entry.warn("오른쪽 칸에 다른 내용이 있어 덮어쓰지 않았다: '" + abbreviate(existing) + "'");
            return Outcome.CONFLICT;
        }
        List<XWPFParagraph> ps = target.getParagraphs();
        XWPFParagraph p = ps.get(0);
        // 비어 있던 칸의 첫 run 서식(글꼴·크기)을 물려받는다 — 없으면 문서 기본 서식.
        CTRPr inherit = null;
        if (!p.getRuns().isEmpty() && p.getRuns().get(0).getCTR().getRPr() != null) {
            inherit = (CTRPr) p.getRuns().get(0).getCTR().getRPr().copy();
        }
        // 덮어쓰기: 첫 문단의 run을 모두 지우고 나머지 문단은 비운다.
        for (int i = p.getRuns().size() - 1; i >= 0; i--) p.removeRun(i);
        for (int i = ps.size() - 1; i >= 1; i--) target.removeParagraph(i);
        XWPFRun r = p.createRun();
        if (inherit != null) r.getCTR().setRPr(inherit);
        writeText(r, value);
        touched.add(p);
        return Outcome.FILLED;
    }

    // ── 문단 안에 끼워 넣기 ────────────────────────────────────────────────

    private Outcome insertAfter(XWPFParagraph p, List<RunInfo> runs, String text, int kwEnd,
                                String value, FillReport.Entry entry) {
        int pos = kwEnd;
        int j = pos;
        while (j < text.length() && Character.isWhitespace(text.charAt(j))) j++;
        boolean colon = j < text.length() && (text.charAt(j) == ':' || text.charAt(j) == '：');
        if (colon) pos = j + 1;

        String rest = text.substring(pos);
        String restTrim = stripLeading(rest);
        String v = value.trim();
        if (restTrim.startsWith(v)) return Outcome.ALREADY;
        if (colon && !restTrim.isEmpty()) {
            entry.warn("'" + rest.trim() + "' 가 이미 적혀 있어 덮어쓰지 않았다(문단 안 덮어쓰기는 지원하지 않는다)");
            return Outcome.CONFLICT;
        }

        RunInfo host = runContaining(runs, pos - 1);   // 키워드(콜론)의 마지막 글자가 있는 run
        if (host == null || !host.plain || host.run instanceof XWPFHyperlinkRun) {
            entry.warn("키워드가 하이퍼링크·필드 등 지원하지 않는 위치에 있다");
            return Outcome.UNSUPPORTED;
        }
        boolean needLead = !Character.isWhitespace(text.charAt(pos - 1));
        boolean needTrail = !rest.isEmpty() && !Character.isWhitespace(rest.charAt(0));
        String insert = (needLead ? " " : "") + v + (needTrail ? " " : "");

        int at = host.index + 1;
        if (pos < host.end) {
            // run 한가운데 — 둘로 가른다. 오른쪽 조각은 같은 서식의 새 run.
            String left = host.text.substring(0, pos - host.start);
            String right = host.text.substring(pos - host.start);
            host.run.setText(left, 0);
            XWPFRun tail = p.insertNewRun(at);
            copyFormat(host.run, tail);
            tail.setText(right);
            XWPFRun mid = p.insertNewRun(at);
            copyFormat(host.run, mid);
            writeText(mid, insert);
        } else {
            XWPFRun mid = p.insertNewRun(at);
            copyFormat(host.run, mid);
            writeText(mid, insert);
        }
        touched.add(p);
        return Outcome.FILLED;
    }

    private static RunInfo runContaining(List<RunInfo> runs, int charPos) {
        for (RunInfo r : runs) if (r.start <= charPos && charPos < r.end) return r;
        return null;
    }

    private static void copyFormat(XWPFRun from, XWPFRun to) {
        CTRPr rpr = from.getCTR().getRPr();
        if (rpr != null) to.getCTR().setRPr((CTRPr) rpr.copy());
    }

    /** 여러 줄 값은 줄바꿈(w:br)으로 이어 쓴다. */
    private static void writeText(XWPFRun run, String value) {
        String[] lines = value.split("\r?\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) run.addBreak();
            run.setText(lines[i]);
        }
    }

    // ── 문서 훑기 ──────────────────────────────────────────────────────────

    private void collect(IBody body, List<Site> out) {
        for (IBodyElement el : body.getBodyElements()) {
            if (el instanceof XWPFParagraph) {
                out.add(new Site((XWPFParagraph) el, null, null, null));
            } else if (el instanceof XWPFTable) {
                collectTable((XWPFTable) el, out);
            }
        }
    }

    private void collectTable(XWPFTable table, List<Site> out) {
        for (XWPFTableRow row : table.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                for (IBodyElement el : cell.getBodyElements()) {
                    if (el instanceof XWPFParagraph) {
                        out.add(new Site((XWPFParagraph) el, cell, row, table));
                    } else if (el instanceof XWPFTable) {
                        collectTable((XWPFTable) el, out);   // 중첩 표
                    }
                }
            }
        }
    }

    private static List<RunInfo> runInfos(XWPFParagraph p) {
        List<RunInfo> list = new ArrayList<RunInfo>();
        int pos = 0;
        List<XWPFRun> runs = p.getRuns();
        for (int i = 0; i < runs.size(); i++) {
            XWPFRun r = runs.get(i);
            boolean[] plain = {true};
            String t = textOf(r.getCTR(), plain);
            RunInfo info = new RunInfo(i, r, t, plain[0] && !(r instanceof XWPFHyperlinkRun));
            info.start = pos;
            pos += t.length();
            info.end = pos;
            list.add(info);
        }
        return list;
    }

    /**
     * run의 글. 탭·줄바꿈은 눈에 보이는 문자로, 그림·필드 같은 그 밖의 것은 자리만 차지하는
     * 문자({@code U+FFFC})로 바꿔 <b>오프셋이 어긋나지 않게</b> 한다 — 이 문자는 키워드와 일치할 수 없다.
     * 글(w:t) 하나 말고 다른 것이 섞인 run은 {@code plain=false}라 쪼개지 않는다.
     */
    private static String textOf(CTR ctr, boolean[] plain) {
        // ⚠️ XmlBeans의 DOM은 getTextContent() 등 DOM Level 3을 구현하지 않아 예외가 난다
        // (스파이크에서 실측). 자식 요소는 XmlCursor로 훑는다.
        StringBuilder sb = new StringBuilder();
        int tCount = 0;
        XmlCursor c = ctr.newCursor();
        try {
            if (c.toFirstChild()) {
                do {
                    String name = c.getName().getLocalPart();
                    if (name.equals("rPr")) continue;
                    if (name.equals("t")) {
                        sb.append(c.getTextValue());
                        tCount++;
                    } else if (name.equals("tab")) {
                        sb.append('\t');
                        plain[0] = false;
                    } else if (name.equals("br") || name.equals("cr")) {
                        sb.append('\n');
                        plain[0] = false;
                    } else {
                        sb.append(OPAQUE);
                        plain[0] = false;
                    }
                } while (c.toNextSibling());
            }
        } finally {
            c.dispose();
        }
        if (tCount != 1) plain[0] = false;
        return sb.toString();
    }

    private static String join(List<RunInfo> runs) {
        StringBuilder sb = new StringBuilder();
        for (RunInfo r : runs) sb.append(r.text);
        return sb.toString();
    }

    private static List<Integer> occurrences(String text, String keyword) {
        List<Integer> hits = new ArrayList<Integer>();
        int from = 0;
        while (true) {
            int i = text.indexOf(keyword, from);
            if (i < 0) break;
            hits.add(i);
            from = i + keyword.length();
        }
        return hits;
    }

    private static String stripLeading(String s) {
        int i = 0;
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        return s.substring(i);
    }

    private static String abbreviate(String s) {
        return s.length() <= 20 ? s : s.substring(0, 20) + "…";
    }

    private static void record(FillReport.Entry e, Outcome o) {
        switch (o) {
            case FILLED: e.filled(); break;
            case ALREADY: e.already(); break;
            case CONFLICT: e.conflict(); break;
            default: e.unsupported(); break;
        }
    }
}
