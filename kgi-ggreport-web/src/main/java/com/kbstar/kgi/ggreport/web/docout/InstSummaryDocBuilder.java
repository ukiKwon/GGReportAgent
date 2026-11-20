package com.kbstar.kgi.ggreport.web.docout;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 기관 정보 요약 양식(049) 저장 내용(정규 JSON) → 출력 모델. 1쪽만 만든다(2쪽 평가표는 S4: TPL_VER 2·RENDER_VER 2).
 * 모든 글자는 {@link DocModel.Run} 문자열로만 넣는다 — URL·하이퍼링크·필드 코드가 없다(렌더러는 setStringValue 만 쓴다).
 * 확정본은 저장된 판의 {@code RENDER_VER} 로 그 판의 JSON 에서 매번 다시 만든다 — 렌더러를 고치면 옛 판 분기를 남기고 RENDER_VER 를 올린다.
 */
public final class InstSummaryDocBuilder {

    public static final int RENDER_VER = 1;

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
        if (renderVer != RENDER_VER) {
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
        rows.add(Arrays.asList(DocModel.Cell.header("추진 배경").withSpan(1, 3), DocModel.Cell.of(background(content, inst))));
        rows.add(Collections.singletonList(DocModel.Cell.of(bizBlocks(content))));
        rows.add(Collections.singletonList(DocModel.Cell.of(fundBlocks(content))));
        rows.add(Arrays.asList(DocModel.Cell.header("기타 사항"), DocModel.Cell.of(etcBlocks(content))));
        blocks.add(new DocModel.Table(2, new double[]{14, 86}, rows, 0, false));
        return new DocModel(blocks);
    }

    // ── 추진 배경 ───────────────────────────────────────────────────────

    private static List<DocModel.Block> background(JsonNode c, String inst) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, inst + " 현황"));
        for (String line : list(c, "overview")) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
        }
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "기관 주요 현황"));
        List<DocModel.Cell> head = new ArrayList<DocModel.Cell>();
        List<DocModel.Cell> val = new ArrayList<DocModel.Cell>();
        String[][] cols = {{"기관장", fact(c, "head_name")}, {"예산", fact(c, "budget")}, {"임직원 수", fact(c, "staff")},
                {"주무기관", fact(c, "supervisor")}, {"기관 형태", fact(c, "inst_type")}, {"소재지", fact(c, "address")}};
        for (String[] col : cols) {
            head.add(DocModel.Cell.header(col[0]));
            val.add(DocModel.Cell.text(col[1] == null ? DASH_EMPTY : col[1]));
        }
        b.add(new DocModel.Table(6, null, Arrays.asList(head, val), 1, true));
        String org = fact(c, "org_note");
        if (org != null) {
            b.add(DocModel.Para.plain("※ 조직현황 " + org));
        }
        return b;
    }

    // ── 기관 주요 사업 ──────────────────────────────────────────────────

    private static List<DocModel.Block> bizBlocks(JsonNode c) {
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

    private static List<DocModel.Block> fundBlocks(JsonNode c) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "운영자금 관련 고려사항"));
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "예산 운영 방식"));
        JsonNode fundRows = c.path("tables").path("fund").path("rows");
        if (fundRows.isArray() && fundRows.size() > 0) {
            List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
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
            b.add(new DocModel.Table(2, new double[]{20, 80}, rows, 0, true));
        }
        b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "MMDA 예상 평잔 산정 기준"));
        for (String line : list(c, "mmda_basis")) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
        }
        JsonNode years = c.path("tables").path("years");
        if (years.isObject()) {
            b.add(yearsTable(years));
            int no = 0;
            for (JsonNode note : years.path("notes")) {
                String t = text(note);
                if (t != null) {
                    no++;
                    b.add(new DocModel.Para(Collections.singletonList(DocModel.Run.of("주" + no + ") " + t)),
                            DocModel.Bullet.NONE, 0, 9, DocModel.Align.LEFT));
                }
            }
        }
        return b;
    }

    private static DocModel.Table yearsTable(JsonNode y) {
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
        income.add(DocModel.Cell.text("자금수익"));
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

    private static DocModel.Cell valueCell(String v, boolean hatch) {
        return new DocModel.Cell(Collections.<DocModel.Block>singletonList(DocModel.Para.plain(v == null ? "" : v)),
                1, 1, false, hatch ? DocModel.Shade.HATCH : DocModel.Shade.NONE, DocModel.Align.RIGHT);
    }

    // ── 기타 사항 ───────────────────────────────────────────────────────

    private static List<DocModel.Block> etcBlocks(JsonNode c) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(DocModel.Para.bullet(DocModel.Bullet.DASH, "경쟁은행 동향 및 중점 제안 사항"));
        String bank = fact(c, "current_bank");
        if (bank != null) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "현 거래 은행: " + bank));
        }
        for (String line : list(c, "competition")) {
            b.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, line));
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
