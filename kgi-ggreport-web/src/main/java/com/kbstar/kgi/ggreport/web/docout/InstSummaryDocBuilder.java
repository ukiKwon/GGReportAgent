package com.kbstar.kgi.ggreport.web.docout;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 기관 정보 요약 양식(049) 저장 내용(정규 JSON) → 출력 모델.
 * RENDER_VER 1 = 기대효과 없음, 2 = '기타 사항'에 '우리 회사 기대효과' 소제목+목록(비면 소제목도 생략, 사용자 11-23 Q-2026-11-09-01). 1·2 판은 1쪽만, 옛 조립 그대로 계속 출력한다.
 * RENDER_VER 3 = 샘플 두 쪽(NEXT 113 ④): 연도 표 종료 뒤 칸 값 출력·자금수익 굵게, 현황 표 첫 칸 머리=head_title(기본 '기관장'), 예산 운영 방식 표 머리 줄,
 * '※ 조직현황 :', MMDA 산정 기준 '·' 들여 쓰기와 서술 줄 각주(표 뒤 주석이 번호를 이어받음), 사업 줄 굵게, '현 거래 은행' 자동 줄 제외,
 * 2쪽(tables.scoring 이 있으면 쪽 나눔 뒤 평가 기준표).
 * 모든 글자는 {@link DocModel.Run} 문자열로만 넣는다 — URL·하이퍼링크·필드 코드가 없다(렌더러는 setStringValue 만 쓴다).
 * 확정본은 저장된 판의 {@code RENDER_VER} 로 그 판의 JSON 에서 매번 다시 만든다 — 렌더러를 고치면 옛 판 분기를 남기고 RENDER_VER 를 올린다.
 */
public final class InstSummaryDocBuilder {

    public static final int RENDER_VER = 3;

    /** 이 서버가 출력할 수 있는 저장 판의 RENDER_VER — 옛 판 분기를 남긴다(확정본이 막히지 않게). */
    public static boolean supports(int renderVer) {
        return renderVer >= 1 && renderVer <= RENDER_VER;
    }

    private static final String DASH_EMPTY = "—";
    private static final String DRAFT_PREFIX = "[확정 전 초안] ";

    private InstSummaryDocBuilder() {
    }

    /**
     * @param renderVer 저장된 판의 RENDER_VER — 지원하지 않는 값이면 {@link IllegalStateException}(호출부가 409 RENDER_UNSUPPORTED 로 바꾼다)
     * @param draft     확정 전 초안이면 제목 앞에 표시한다
     * @throws IllegalArgumentException 연도 범위가 1~10열을 벗어날 때({@link Groups#yearColumns} — 호출부가 400/409 로 바꾼다)
     */
    public static DocModel build(JsonNode content, int renderVer, boolean draft) {
        if (!supports(renderVer)) {
            throw new IllegalStateException("unsupported render version");
        }
        String inst = orEmpty(fact(content, "inst_name"));
        String bidKind = orEmpty(fact(content, "bid_kind"));
        List<DocModel.Block> blocks = new ArrayList<DocModel.Block>();
        StringBuilder title = new StringBuilder();
        if (draft) {
            title.append(DRAFT_PREFIX);
        }
        title.append("참고자료 1. 「").append(inst).append("」");
        if (!bidKind.isEmpty()) {
            title.append(' ').append(bidKind);
        }
        title.append(" 관련 요약");
        blocks.add(new DocModel.Heading(title.toString(), 14));
        blocks.add(DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold("■ [" + inst + "] 입찰 관련 주요내용")));

        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        boolean v3 = renderVer >= 3;
        rows.add(Arrays.asList(DocModel.Cell.header("추진 배경").withSpan(1, 3), DocModel.Cell.of(background(content, inst, v3))));
        rows.add(Collections.singletonList(DocModel.Cell.of(bizBlocks(content, v3))));
        rows.add(Collections.singletonList(DocModel.Cell.of(fundBlocks(content, v3))));
        rows.add(Arrays.asList(DocModel.Cell.header("기타 사항"), DocModel.Cell.of(etcBlocks(content, renderVer))));
        blocks.add(new DocModel.Table(2, new double[]{14, 86}, rows, 0, false));
        if (v3) {
            blocks.addAll(scoringBlocks(content, inst, bidKind));
        }
        return new DocModel(blocks);
    }

    // ── 추진 배경 ───────────────────────────────────────────────────────

    private static List<DocModel.Block> background(JsonNode c, String inst, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, inst + " 현황"));
        for (String line : list(c, "overview")) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
        }
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "기관 주요 현황"));
        List<DocModel.Cell> head = new ArrayList<DocModel.Cell>();
        List<DocModel.Cell> val = new ArrayList<DocModel.Cell>();
        String headTitle = "기관장";
        if (v3 && fact(c, "head_title") != null) {
            headTitle = fact(c, "head_title");
        }
        String[][] cols = {{headTitle, fact(c, "head_name")}, {"예산", fact(c, "budget")}, {"임직원 수", fact(c, "staff")},
                {"주무기관", fact(c, "supervisor")}, {"기관 형태", fact(c, "inst_type")}, {"소재지", fact(c, "address")}};
        for (String[] col : cols) {
            head.add(DocModel.Cell.header(col[0]));
            val.add(DocModel.Cell.text(col[1] == null ? DASH_EMPTY : col[1]));
        }
        b.add(new DocModel.Table(6, null, Arrays.asList(head, val), 1, true));
        String org = fact(c, "org_note");
        if (org != null) {
            b.add(DocModel.Para.plain(v3 ? "※ 조직현황 : " + org : "※ 조직현황 " + org));
        }
        return b;
    }

    // ── 기관 주요 사업 ──────────────────────────────────────────────────

    private static List<DocModel.Block> bizBlocks(JsonNode c, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "기관 주요 사업"));
        JsonNode bizRows = c.path("tables").path("biz").path("rows");
        int n = bizRows.isArray() ? bizRows.size() : 0;
        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        rows.add(Arrays.asList(DocModel.Cell.header("구분").withSpan(2, 1), DocModel.Cell.header("내용")));
        if (n == 0) {
            rows.add(Collections.singletonList(DocModel.Cell.text(DASH_EMPTY).withSpan(3, 1)));
        } else {
            List<String> parents = new ArrayList<String>();
            List<String> keys = new ArrayList<String>();
            for (JsonNode r : bizRows) {
                parents.add("");
                String sub = text(r.path("sub"));
                keys.add(sub == null ? null : orEmpty(text(r.path("group"))));
            }
            int[] spans = Groups.rowspans(parents, keys);
            for (int i = 0; i < n; i++) {
                JsonNode r = bizRows.get(i);
                String group = orEmpty(text(r.path("group")));
                String sub = text(r.path("sub"));
                List<DocModel.Block> lines = new ArrayList<DocModel.Block>();
                for (JsonNode l : r.path("lines")) {
                    if (v3 && l.isObject()) {   // v3 줄 = {text, bold}
                        String bt = text(l.path("text"));
                        if (bt != null) {
                            lines.add(DocModel.Para.of(DocModel.Bullet.DASH, 0,
                                    l.path("bold").asBoolean(false) ? DocModel.Run.bold(bt) : DocModel.Run.of(bt)));
                        }
                        continue;
                    }
                    String t = text(l);
                    if (t != null) {
                        lines.add(DocModel.Para.bullet(DocModel.Bullet.DASH, t));
                    }
                }
                if (lines.isEmpty()) {
                    lines.add(DocModel.Para.plain(""));
                }
                List<DocModel.Cell> row = new ArrayList<DocModel.Cell>();
                if (sub == null) {
                    row.add(DocModel.Cell.text(group).withSpan(2, 1));
                } else {
                    if (spans[i] > 0) {
                        row.add(DocModel.Cell.text(group).withSpan(1, spans[i]));
                    }
                    row.add(DocModel.Cell.text(sub));
                }
                row.add(DocModel.Cell.of(lines));
                rows.add(row);
            }
        }
        b.add(new DocModel.Table(3, new double[]{18, 18, 64}, rows, 1, true));
        return b;
    }

    // ── 운영자금 관련 고려사항 ──────────────────────────────────────────

    private static List<DocModel.Block> fundBlocks(JsonNode c, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "운영자금 관련 고려사항"));
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "예산 운영 방식"));
        JsonNode fundRows = c.path("tables").path("fund").path("rows");
        if (fundRows.isArray() && fundRows.size() > 0) {
            List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
            if (v3) {
                rows.add(Arrays.asList(DocModel.Cell.header("구분"), DocModel.Cell.header("내용")));
            }
            for (JsonNode r : fundRows) {
                List<DocModel.Block> lines = new ArrayList<DocModel.Block>();
                for (JsonNode l : r.path("lines")) {
                    String t = text(l.path("text"));
                    if (t == null) {
                        continue;
                    }
                    if (l.path("lv").asInt(0) == 1) {
                        lines.add(DocModel.Para.of(DocModel.Bullet.CIRCLE_O, 1, DocModel.Run.of(t)));
                    } else {
                        lines.add(DocModel.Para.bullet(DocModel.Bullet.DASH, t));
                    }
                }
                if (lines.isEmpty()) {
                    lines.add(DocModel.Para.plain(""));
                }
                rows.add(Arrays.asList(DocModel.Cell.text(orEmpty(text(r.path("kind")))), DocModel.Cell.of(lines)));
            }
            b.add(new DocModel.Table(2, new double[]{20, 80}, rows, v3 ? 1 : 0, true));
        }
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "MMDA 예상 평잔 산정 기준"));
        int no = 0;
        if (v3) {
            // 한 단계 들여 쓴 '·' 줄 — DocxKit 에 '·' 글머리가 없어 전각 공백 + '· ' 를 글자로 넣는다. 서술 줄마다 각주 0~1개, 그 줄 바로 아래 '주n)'.
            for (JsonNode l : c.path("lists").path("mmda_basis")) {
                String t = l.isObject() ? text(l.path("text")) : text(l);
                if (t == null) {
                    continue;
                }
                b.add(DocModel.Para.plain("　· " + t));
                String note = l.isObject() ? text(l.path("note")) : null;
                if (note != null) {
                    no++;
                    b.add(footnote(no, note));
                }
            }
        } else {
            for (String line : list(c, "mmda_basis")) {
                b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
            }
        }
        JsonNode years = c.path("tables").path("years");
        if (years.isObject()) {
            b.add(yearsTable(years, v3));
            for (JsonNode note : years.path("notes")) {
                String t = text(note);
                if (t != null) {
                    no++;
                    b.add(footnote(no, t));
                }
            }
        }
        return b;
    }

    private static DocModel.Para footnote(int no, String t) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.of("주" + no + ") " + t)),
                DocModel.Bullet.NONE, 0, 9, DocModel.Align.LEFT);
    }

    private static DocModel.Table yearsTable(JsonNode y, boolean v3) {
        int from = y.path("from").asInt();
        int to = y.path("to").asInt();
        int n = Groups.yearColumns(from, to);   // 1~10열 밖이면 IllegalArgumentException
        JsonNode endNode = y.path("end");
        Integer end = endNode.isInt() ? Integer.valueOf(endNode.asInt()) : null;
        List<DocModel.Cell> head = new ArrayList<DocModel.Cell>();
        List<DocModel.Cell> mmda = new ArrayList<DocModel.Cell>();
        List<DocModel.Cell> income = new ArrayList<DocModel.Cell>();
        head.add(DocModel.Cell.header("구분(" + orEmpty(text(y.path("unit"))) + ")"));
        mmda.add(DocModel.Cell.text("MMDA 연평잔"));
        income.add(v3 ? boldCell("자금수익", DocModel.Align.LEFT) : DocModel.Cell.text("자금수익"));
        for (int yr = from; yr <= to; yr++) {
            String key = String.valueOf(yr);
            if (end != null && yr == end.intValue()) {
                head.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(
                        DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(key), DocModel.Run.sup("협약 종료"))),
                        1, 1, true, DocModel.Shade.HEADER, DocModel.Align.CENTER));
            } else {
                head.add(DocModel.Cell.header(key));
            }
            boolean after = end != null && yr > end.intValue();
            if (v3) {   // 종료 뒤 연도 칸에도 값을 쓰고 빗금은 '협약 뒤' 표시로만 둔다. 자금수익 줄은 굵게(샘플).
                String mv = text(y.path("mmda").path(key));
                String iv = text(y.path("income").path(key));
                mmda.add(valueCell(mv, after));
                income.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(
                        DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(iv == null ? "" : iv))),
                        1, 1, false, after ? DocModel.Shade.HATCH : DocModel.Shade.NONE, DocModel.Align.RIGHT));
                continue;
            }
            mmda.add(valueCell(after ? null : text(y.path("mmda").path(key)), after));
            income.add(valueCell(after ? null : text(y.path("income").path(key)), after));
        }
        double[] w = new double[1 + n];
        w[0] = 16;
        for (int i = 1; i <= n; i++) {
            w[i] = 84.0 / n;
        }
        return new DocModel.Table(1 + n, w, Arrays.asList(head, mmda, income), 1, true);
    }

    private static DocModel.Cell boldCell(String t, DocModel.Align align) {
        return new DocModel.Cell(Collections.<DocModel.Block>singletonList(DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(t))),
                1, 1, false, DocModel.Shade.NONE, align);
    }

    private static DocModel.Cell valueCell(String v, boolean hatch) {
        return new DocModel.Cell(Collections.<DocModel.Block>singletonList(DocModel.Para.plain(v == null ? "" : v)),
                1, 1, false, hatch ? DocModel.Shade.HATCH : DocModel.Shade.NONE, DocModel.Align.RIGHT);
    }

    // ── 기타 사항 ───────────────────────────────────────────────────────

    private static List<DocModel.Block> etcBlocks(JsonNode c, int renderVer) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "경쟁은행 동향 및 중점 제안 사항"));
        String bank = fact(c, "current_bank");
        if (bank != null && renderVer < 3) {   // v3: 자동 '현 거래 은행' 줄은 Word 에서 뺀다(값은 저장·화면 참고용으로 유지)
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "현 거래 은행: " + bank));
        }
        for (String line : list(c, "competition")) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
        }
        if (renderVer >= 2) {
            List<String> effect = list(c, "effect");
            if (!effect.isEmpty()) {   // 선택 칸 — 비면 빈 소제목을 남기지 않는다(제출 문서에 빈 제목이 보이지 않게)
                b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "우리 회사 기대효과"));
                for (String line : effect) {
                    b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
                }
            }
        }
        return b;
    }

    // ── 2쪽 평가 기준표(v3) ─────────────────────────────────────────────

    private static final String[] TOTAL_LABELS = {"계", "합계", "총점", "총계"};

    /**
     * tables.scoring 이 있고 칸이 하나 이상이면 [쪽 나눔 + 제목 + ■ 소제목 + 병합 표(+합계 줄)]. 없으면 빈 목록(1쪽만).
     * 칸 범위·겹침이 어긋나면 IllegalArgumentException(호출부가 409 RENDER_UNSUPPORTED). 격자에서 비는 자리는 빈 칸으로 채운다.
     * 머리 줄 수 = 첫 행 칸의 세로 병합(≤2) 또는 가로 병합이 있고 표가 3행 이상이면 2, 아니면 1(행이 하나면 0) — 쪽마다 반복·음영.
     */
    private static List<DocModel.Block> scoringBlocks(JsonNode c, String inst, String bidKind) {
        JsonNode s = c.path("tables").path("scoring");
        JsonNode cells = s.path("cells");
        if (!s.isObject() || !cells.isArray() || cells.size() == 0) {
            return Collections.emptyList();
        }
        int rn = s.path("row_count").asInt(0);
        int cn = s.path("col_count").asInt(0);
        if (rn < 1 || rn > InstSummaryTpl.MAX_SCORING_ROWS || cn < 1 || cn > InstSummaryTpl.MAX_SCORING_COLS) {
            throw new IllegalArgumentException("scoring size");
        }
        int[][] owner = new int[rn][cn];   // 칸 번호 + 1, 0 = 빈 자리
        int[] cr = new int[cells.size()];
        int[] cc = new int[cells.size()];
        int[] rs = new int[cells.size()];
        int[] cs = new int[cells.size()];
        String[] tx = new String[cells.size()];
        for (int i = 0; i < cells.size(); i++) {
            JsonNode n = cells.get(i);
            cr[i] = n.path("r").asInt(-1);
            cc[i] = n.path("c").asInt(-1);
            rs[i] = n.path("rs").asInt(1);
            cs[i] = n.path("cs").asInt(1);
            tx[i] = orEmpty(text(n.path("text")));
            if (cr[i] < 0 || cc[i] < 0 || rs[i] < 1 || cs[i] < 1 || rs[i] > rn || cs[i] > cn
                    || (long) cr[i] + rs[i] > rn || (long) cc[i] + cs[i] > cn) {
                throw new IllegalArgumentException("scoring cell range");
            }
            for (int r = cr[i]; r < cr[i] + rs[i]; r++) {
                for (int k = cc[i]; k < cc[i] + cs[i]; k++) {
                    if (owner[r][k] != 0) {
                        throw new IllegalArgumentException("scoring cells overlap");
                    }
                    owner[r][k] = i + 1;
                }
            }
        }
        int headRows = rn == 1 ? 0 : 1;
        if (rn >= 2) {
            for (int i = 0; i < cr.length; i++) {
                if (cr[i] == 0 && (rs[i] == 2 || (cs[i] > 1 && rn > 2))) {
                    headRows = 2;
                }
            }
        }
        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        boolean hasTotalRow = false;
        for (int r = 0; r < rn; r++) {
            List<DocModel.Cell> row = new ArrayList<DocModel.Cell>();
            for (int k = 0; k < cn; k++) {
                int o = owner[r][k];
                if (o == 0) {
                    row.add(DocModel.Cell.text(""));   // 원본에 없는 자리 — 격자를 채운다
                    continue;
                }
                int i = o - 1;
                if (cr[i] != r || cc[i] != k) {
                    continue;   // 다른 칸의 병합 자리
                }
                DocModel.Cell cell = r < headRows ? DocModel.Cell.header(tx[i]) : DocModel.Cell.text(tx[i]);
                row.add(cell.withSpan(cs[i], rs[i]));
                for (String label : TOTAL_LABELS) {
                    if (label.equals(tx[i].trim())) {
                        hasTotalRow = true;
                    }
                }
            }
            rows.add(row);
        }
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(new DocModel.PageBreak());
        StringBuilder title = new StringBuilder("참고자료 2. 「").append(inst).append("」");
        if (!bidKind.isEmpty()) {
            title.append(' ').append(bidKind);
        }
        title.append(" 평가 기준표");
        b.add(new DocModel.Heading(title.toString(), 14));
        b.add(DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold("■ 평가 항목 및 배점 기준")));
        b.add(new DocModel.Table(cn, null, rows, headRows, true));
        JsonNode total = s.path("total");
        if (total.isIntegralNumber() && !hasTotalRow) {   // 표에 '계·합계' 줄이 없을 때만 합계 줄을 덧붙인다
            b.add(new DocModel.Para(Collections.singletonList(DocModel.Run.bold("합계 " + total.asInt() + "점")),
                    DocModel.Bullet.NONE, 0, DocModel.Para.DEFAULT_PT, DocModel.Align.RIGHT));
        }
        return b;
    }

    // ── JSON 읽기 도우미(저장본은 서버가 쓴 정규형이다) ───────────────────

    private static String text(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) {
            return null;
        }
        String t = n.asText();
        return t == null || t.trim().isEmpty() ? null : t;
    }

    /** fields.{key}.val — 비면 null. */
    private static String fact(JsonNode c, String key) {
        return text(c.path("fields").path(key).path("val"));
    }

    private static List<String> list(JsonNode c, String key) {
        List<String> out = new ArrayList<String>();
        for (JsonNode n : c.path("lists").path(key)) {
            String t = text(n);
            if (t != null) {
                out.add(t);
            }
        }
        return out;
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
