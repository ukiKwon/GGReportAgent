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
 * v3 서식은 사용자 샘플에 맞춘다(11-26 디자인 규격): 표 열 폭·칸 가운데·굵게·'- '/■ 소제목·'YYYY년'·위첨자 단위/각주, 평가표 열 폭은 글자 길이 비례 + 글자 단계(A/B/C).
 * v3 확정본이 아직 없어 RENDER_VER 는 올리지 않고 v3 분기 안에서만 고쳤다(1·2 판 출력은 그대로).
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
        List<DocModel.Block> blocks = page1Blocks(content, renderVer, draft, inst, bidKind);
        if (renderVer < 3) {
            return new DocModel(blocks);
        }
        // v3: 1쪽 단계(A/B/C)를 줄 수 추정으로 정해 exact 줄 간격을 입히고, 2쪽은 평가표 단계로 따로 입힌다.
        List<DocModel.Block> out = new ArrayList<DocModel.Block>(tighten(blocks, STAGES[fitStage(blocks)[0]]));
        out.addAll(scoringBlocks(content, inst, bidKind));
        return new DocModel(out).withPageMargins(V3_MARGINS).withSpacerLine(SPACER_PT);
    }

    /**
     * v3 1쪽 단계 선택 결과 {단계 0=A·1=B·2=C, 추정 높이 pt} — 시험·진단용(확정 전 초안 표시 없이 계산).
     * 추정이라 실제 Word 와 다를 수 있다.
     */
    static double[] page1Fit(JsonNode content) {
        String inst = orEmpty(fact(content, "inst_name"));
        String bidKind = orEmpty(fact(content, "bid_kind"));
        int[] f = fitStage(page1Blocks(content, RENDER_VER, false, inst, bidKind));
        return new double[]{f[0], page1Height(page1Blocks(content, RENDER_VER, false, inst, bidKind), f[0])};
    }

    private static List<DocModel.Block> page1Blocks(JsonNode content, int renderVer, boolean draft, String inst, String bidKind) {
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
        boolean v3 = renderVer >= 3;
        if (v3) {
            blocks.add(squareHead("■ [" + inst + "] 입찰 관련 주요내용"));
        } else {
            blocks.add(DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold("■ [" + inst + "] 입찰 관련 주요내용")));
        }

        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        // v3 이름표 = 두 줄·보통 굵기·음영 없음·가운데/가운데(샘플), 겉 표 8/92
        rows.add(Arrays.asList(v3 ? midText("추진\n배경", false, DocModel.Align.CENTER, 1, 3) : DocModel.Cell.header("추진 배경").withSpan(1, 3),
                DocModel.Cell.of(background(content, inst, v3))));
        rows.add(Collections.singletonList(DocModel.Cell.of(bizBlocks(content, v3))));
        rows.add(Collections.singletonList(DocModel.Cell.of(fundBlocks(content, v3))));
        rows.add(Arrays.asList(v3 ? midText("기타\n사항", false, DocModel.Align.CENTER, 1, 1) : DocModel.Cell.header("기타 사항"),
                DocModel.Cell.of(etcBlocks(content, renderVer))));
        blocks.add(new DocModel.Table(2, v3 ? new double[]{8, 92} : new double[]{14, 86}, rows, 0, false));
        return blocks;
    }

    // ── 추진 배경 ───────────────────────────────────────────────────────

    private static List<DocModel.Block> background(JsonNode c, String inst, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(dashHead(inst + " 현황", v3));
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
        String[][] cols = {{headTitle, fact(c, "head_name")}, {"예산", fact(c, "budget")}, {v3 ? "임직원수" : "임직원 수", fact(c, "staff")},
                {"주무기관", fact(c, "supervisor")}, {v3 ? "기관형태" : "기관 형태", fact(c, "inst_type")}, {"소재지", fact(c, "address")}};
        for (String[] col : cols) {
            head.add(DocModel.Cell.header(col[0]));
            val.add(DocModel.Cell.text(col[1] == null ? DASH_EMPTY : col[1]));
        }
        b.add(new DocModel.Table(6, v3 ? new double[]{13, 20, 16, 17, 20, 14} : null, Arrays.asList(head, val), 1, true));
        String org = fact(c, "org_note");
        if (org != null) {
            b.add(DocModel.Para.plain(v3 ? "※ 조직현황 : " + org : "※ 조직현황 " + org));
        }
        return b;
    }

    // ── 기관 주요 사업 ──────────────────────────────────────────────────

    private static List<DocModel.Block> bizBlocks(JsonNode c, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(dashHead("기관 주요 사업", v3));
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
                boolean allBold = true;   // v3: sub 없는 행은 내용 줄이 모두 굵으면 이름표도 굵게(입력 칸 없이 유도)
                for (JsonNode l : r.path("lines")) {
                    if (v3 && l.isObject()) {   // v3 줄 = {text, bold}
                        String bt = text(l.path("text"));
                        if (bt != null) {
                            boolean bold = l.path("bold").asBoolean(false);
                            allBold &= bold;
                            lines.add(DocModel.Para.of(DocModel.Bullet.DASH, 0, bold ? DocModel.Run.bold(bt) : DocModel.Run.of(bt)));
                        }
                        continue;
                    }
                    String t = text(l);
                    if (t != null) {
                        allBold = false;
                        lines.add(DocModel.Para.bullet(DocModel.Bullet.DASH, t));
                    }
                }
                if (lines.isEmpty()) {
                    allBold = false;
                    lines.add(DocModel.Para.plain(""));
                }
                List<DocModel.Cell> row = new ArrayList<DocModel.Cell>();
                if (sub == null) {
                    row.add(v3 ? midText(group, allBold, DocModel.Align.CENTER, 2, 1) : DocModel.Cell.text(group).withSpan(2, 1));
                } else {
                    if (spans[i] > 0) {
                        row.add(v3 ? midText(group, false, DocModel.Align.CENTER, 1, spans[i]) : DocModel.Cell.text(group).withSpan(1, spans[i]));
                    }
                    row.add(v3 ? midText(sub, false, DocModel.Align.CENTER, 1, 1) : DocModel.Cell.text(sub));
                }
                row.add(DocModel.Cell.of(lines));
                rows.add(row);
            }
        }
        b.add(new DocModel.Table(3, v3 ? new double[]{8, 20, 72} : new double[]{18, 18, 64}, rows, 1, true));
        return b;
    }

    // ── 운영자금 관련 고려사항 ──────────────────────────────────────────

    private static List<DocModel.Block> fundBlocks(JsonNode c, boolean v3) {
        List<DocModel.Block> b = new ArrayList<DocModel.Block>();
        b.add(dashHead("운영자금 관련 고려사항", v3));
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
                String kind = orEmpty(text(r.path("kind")));
                rows.add(Arrays.asList(v3 ? midText(kind, false, DocModel.Align.CENTER, 1, 1) : DocModel.Cell.text(kind), DocModel.Cell.of(lines)));
            }
            b.add(new DocModel.Table(2, v3 ? new double[]{13, 87} : new double[]{20, 80}, rows, v3 ? 1 : 0, true));
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
                String note = l.isObject() ? text(l.path("note")) : null;
                if (note != null) {   // 각주 표시는 줄 끝 위첨자(문장 중간 위치는 입력 칸이 없어 하지 않는다)
                    no++;
                    b.add(DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.of("　· " + t), DocModel.Run.sup("주" + no + ")")));
                    b.add(footnote(no, note, true));
                } else {
                    b.add(DocModel.Para.plain("　· " + t));
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
                    b.add(footnote(no, t, false));
                }
            }
        }
        return b;
    }

    /** indent = 전각 공백 2개로 윗줄 본문 첫 글자 근처에 맞춘다(들여쓰기 API 가 없어 근사 — 표 뒤 주석은 들여쓰지 않는다). */
    private static DocModel.Para footnote(int no, String t, boolean indent) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.of((indent ? "　　" : "") + "주" + no + ") " + t)),
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
        String unit = orEmpty(text(y.path("unit")));
        if (v3) {   // 샘플: 굵은 '구분' + 위첨자 '(단위 : 억원)'(작은 글자 API 가 없어 위첨자로 근사), 줄 이름은 가운데
            head.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(unit.isEmpty()
                    ? DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold("구분"))
                    : DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold("구분"), DocModel.Run.sup("(단위 : " + unit + ")"))),
                    1, 1, true, DocModel.Shade.HEADER, DocModel.Align.CENTER));
            mmda.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(DocModel.Para.plain("MMDA 연평잔")),
                    1, 1, false, DocModel.Shade.NONE, DocModel.Align.CENTER));
            income.add(boldCell("자금수익", DocModel.Align.CENTER));
        } else {
            head.add(DocModel.Cell.header("구분(" + unit + ")"));
            mmda.add(DocModel.Cell.text("MMDA 연평잔"));
            income.add(DocModel.Cell.text("자금수익"));
        }
        for (int yr = from; yr <= to; yr++) {
            String key = String.valueOf(yr);
            String yhead = v3 ? key + "년" : key;
            if (end != null && yr == end.intValue()) {
                head.add(new DocModel.Cell(Collections.<DocModel.Block>singletonList(
                        DocModel.Para.of(DocModel.Bullet.NONE, 0, DocModel.Run.bold(yhead), DocModel.Run.sup("협약 종료"))),
                        1, 1, true, DocModel.Shade.HEADER, DocModel.Align.CENTER));
            } else {
                head.add(DocModel.Cell.header(yhead));
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
        w[0] = v3 ? 20 : 16;   // v3: '구분(단위 : 억원)'이 들어갈 자리(샘플 19.8%)
        for (int i = 1; i <= n; i++) {
            w[i] = (100.0 - w[0]) / n;
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
        b.add(dashHead("경쟁은행 동향 및 중점 제안 사항", renderVer >= 3));
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
                b.add(dashHead("우리 회사 기대효과", renderVer >= 3));
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
        // 열 폭 = 글자 길이 비례(샘플 22×5 → 13.75/13.75/50/8.75/13.75), 칸 맞춤·굵게·글자 단계는 이 폭에서 정한다.
        int[] head = new int[cn];
        int[] body = new int[cn];
        boolean[] totalRow = new boolean[rn];
        boolean hasTotalRow = false;
        boolean boldCol0 = false;   // 0열이 묶음 열(세로 병합 칸이 있음)이면 그 열 본문을 굵게
        for (int i = 0; i < cr.length; i++) {
            int len = glyphLen(tx[i]);
            if (cs[i] == 1) {
                if (cr[i] < headRows) {
                    head[cc[i]] = Math.max(head[cc[i]], len);
                } else {
                    body[cc[i]] = Math.max(body[cc[i]], len);
                }
            }
            if (cc[i] == 0 && rs[i] > 1) {
                boldCol0 = true;
            }
            for (String label : TOTAL_LABELS) {
                if (label.equals(tx[i].trim())) {
                    hasTotalRow = true;
                    totalRow[cr[i]] = true;
                }
            }
        }
        double[] pct = new double[cn];
        for (int k = 0; k < cn; k++) {
            pct[k] = Math.max(7, Math.min(40, Math.max(head[k] + 2, body[k])));   // 머리 +2 = 굵은 글자 여유, 7 = 숫자 열 하한, 40 = 긴 서술 열 상한
        }
        int[] stage = scoringStage(pct, cr, cc, rs, cs, tx, rn);
        int pt = stage[0];
        int sb = stage[1];
        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        for (int r = 0; r < rn; r++) {
            List<DocModel.Cell> row = new ArrayList<DocModel.Cell>();
            for (int k = 0; k < cn; k++) {
                int o = owner[r][k];
                boolean headRow = r < headRows;
                DocModel.Align colAlign = pct[k] >= 30 ? DocModel.Align.LEFT : DocModel.Align.CENTER;   // 긴 서술 열만 왼쪽
                if (o == 0) {   // 원본에 없는 자리 — 격자를 채운다
                    row.add(headRow ? headCell("", 1, 1, pt, sb) : midText("", false, colAlign, 1, 1, pt, sb));
                    continue;
                }
                int i = o - 1;
                if (cr[i] != r || cc[i] != k) {
                    continue;   // 다른 칸의 병합 자리
                }
                if (headRow) {
                    row.add(headCell(tx[i], cs[i], rs[i], pt, sb));
                } else {
                    boolean bold = boldCol0 && cc[i] == 0 && !totalRow[r];   // 합계 줄은 모두 보통
                    row.add(midText(tx[i], bold, cs[i] > 1 ? DocModel.Align.CENTER : colAlign, cs[i], rs[i], pt, sb));
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
        b.add(squareHead("■ 평가 항목 및 배점 기준"));
        b.add(new DocModel.Table(cn, pct, rows, headRows, true));
        JsonNode total = s.path("total");
        if (total.isIntegralNumber() && !hasTotalRow) {   // 표에 '계·합계' 줄이 없을 때만 합계 줄을 덧붙인다
            b.add(new DocModel.Para(Collections.singletonList(DocModel.Run.bold("합계 " + total.asInt() + "점")),
                    DocModel.Bullet.NONE, 0, DocModel.Para.DEFAULT_PT, DocModel.Align.RIGHT));
        }
        return tighten(b, pt == 10 ? P2_10 : P2_9);
    }

    // ── v3 서식 도우미 ───────────────────────────────────────────────────

    /** v3 쪽 여백 — 위·아래 850tw(1.5cm), 좌우 1134 그대로, 바닥글 거리 425tw. 쓸 수 있는 높이 = (16838 − 1700) / 20 = 756.9pt. */
    private static final DocxKit.PageMargins V3_MARGINS = new DocxKit.PageMargins(850, 850, 1134, 1134, 709, 425);
    private static final double PAGE_H_PT = (DocxKit.PAGE_H - 2 * 850) / 20.0;
    /** 안전 여유 — 추정과 Word 실제의 차이를 받는 몫. */
    private static final double SAFETY_PT = 20;
    /** 간격용·쪽 나눔 문단의 exact 줄 높이(pt). */
    private static final double SPACER_PT = 3;
    /** 칸 위아래 여백(40tw × 2) + 테두리. */
    private static final double ROW_EXTRA_PT = 4;
    /** 2쪽 표 예산(pt) = 쪽 높이 − 제목(18+6) − ■(15) − 합계 문단(16) − 쪽 나눔 문단(3) − 여유(10). */
    private static final double TABLE_BUDGET_PT = 689;

    /** 글자 단계 — 글자 크기(pt)와 exact 줄 높이(pt). */
    private static final class Fmt {
        final int body;
        final double bodyLn;
        final int note;
        final double noteLn;
        final int sq;
        final double sqLn;
        final int title;
        final double titleLn;

        Fmt(int body, double bodyLn, int note, double noteLn, int sq, double sqLn, int title, double titleLn) {
            this.body = body;
            this.bodyLn = bodyLn;
            this.note = note;
            this.noteLn = noteLn;
            this.sq = sq;
            this.sqLn = sqLn;
            this.title = title;
            this.titleLn = titleLn;
        }
    }

    /** 1쪽 단계 A·B·C. */
    private static final Fmt[] STAGES = {
        new Fmt(10, 14, 9, 12, 11, 15, 14, 18),
        new Fmt(9, 12.5, 8, 11, 11, 15, 14, 18),
        new Fmt(9, 12, 8, 11, 10, 13.5, 13, 17)};
    /** 2쪽 평가표 단계 — 본문·표 10pt/14pt 또는 9pt/12.5pt(칸 안 글자 9 는 본문과 같은 크기로 본다). */
    private static final Fmt P2_10 = new Fmt(10, 14, 9, 12, 11, 15, 14, 18);
    private static final Fmt P2_9 = new Fmt(9, 12.5, 9, 12.5, 11, 15, 14, 18);

    /** 글자 단계를 입힌 새 블록 목록 — 글자 크기(10→본문·9→각주·11→■)와 exact 줄 간격을 넣고, 간격을 따로 정하지 않은 문단은 앞·뒤 0. */
    private static List<DocModel.Block> tighten(List<DocModel.Block> in, Fmt f) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        for (DocModel.Block b : in) {
            if (b instanceof DocModel.Heading) {
                out.add(new DocModel.Heading(((DocModel.Heading) b).getText(), f.title).withLineSpacing(f.titleLn));
            } else if (b instanceof DocModel.Para) {
                DocModel.Para p = (DocModel.Para) b;
                int size = p.getSize() == 11 ? f.sq : p.getSize() == 9 ? f.note : f.body;
                double ln = p.getSize() == 11 ? f.sqLn : p.getSize() == 9 ? f.noteLn : f.bodyLn;
                DocModel.Para n = new DocModel.Para(p.getRuns(), p.getBullet(), p.getLevel(), size, p.getAlign());
                n = p.getSpaceBeforePt() >= 0 ? n.withSpacing(p.getSpaceBeforePt(), p.getSpaceAfterPt()) : n.withSpacing(0, 0);
                out.add(n.withLineSpacing(ln));
            } else if (b instanceof DocModel.Table) {
                DocModel.Table t = (DocModel.Table) b;
                List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
                for (List<DocModel.Cell> r : t.getRows()) {
                    List<DocModel.Cell> row = new ArrayList<DocModel.Cell>();
                    for (DocModel.Cell c : r) {
                        row.add(new DocModel.Cell(tighten(c.getBlocks(), f), c.getColspan(), c.getRowspan(), c.isHeader(), c.getShade(), c.getAlign())
                                .withVAlign(c.getVAlign()));
                    }
                    rows.add(row);
                }
                DocModel.Table nt = new DocModel.Table(t.getColumns(), t.getColWidthsPct(), rows, t.getHeaderRows(), t.isRowsCantSplit());
                out.add(t.isBorderless() ? nt.withoutBorders() : nt);
            } else {
                out.add(b);
            }
        }
        return out;
    }

    /** 1쪽 블록의 추정 높이(pt) — 그 단계를 입힌 뒤 줄 수 × 줄 높이 + 표 행 여백 + 쪽 나눔 문단. */
    private static double page1Height(List<DocModel.Block> blocks, int stage) {
        return estimate(tighten(blocks, STAGES[stage]), DocxKit.BODY_W) + SPACER_PT;
    }

    /** 처음으로 {쪽 높이 − 여유} 안에 들어가는 단계. C 로도 넘치면 C(내용은 자르지 않는다). */
    private static int[] fitStage(List<DocModel.Block> blocks) {
        for (int s = 0; s < STAGES.length - 1; s++) {
            if (page1Height(blocks, s) <= PAGE_H_PT - SAFETY_PT) {
                return new int[]{s};
            }
        }
        return new int[]{STAGES.length - 1};
    }

    /** 블록 목록 높이 — 폭은 tw(표 칸 안이면 칸 안쪽 폭). DocxKit 이 끼우는 간격용 문단(표 뒤·표끼리 사이)도 센다. */
    private static double estimate(List<DocModel.Block> blocks, int widthTw) {
        double h = 0;
        DocModel.Block prev = null;
        double widthPt = widthTw / 20.0;
        for (DocModel.Block b : blocks) {
            if (b instanceof DocModel.Table && prev instanceof DocModel.Table) {
                h += SPACER_PT;
            }
            if (b instanceof DocModel.Heading) {
                DocModel.Heading hd = (DocModel.Heading) b;
                h += textLines(hd.getText(), hd.getSize(), widthPt) * lineHeight(hd.getLineTw(), hd.getSize()) + 6;   // 제목 뒤 6pt
            } else if (b instanceof DocModel.Para) {
                h += paraHeight((DocModel.Para) b, widthPt);
            } else if (b instanceof DocModel.PageBreak) {
                h += SPACER_PT;
            } else if (b instanceof DocModel.Table) {
                h += tableHeight((DocModel.Table) b, widthTw);
            }
            prev = b;
        }
        if (prev == null || prev instanceof DocModel.Table) {
            h += SPACER_PT;
        }
        return h;
    }

    private static double lineHeight(int lineTw, int size) {
        return lineTw >= 0 ? lineTw / 20.0 : size * 1.7;   // 맑은 고딕 기본 줄 높이 ≈ 글자 크기의 1.7배
    }

    /** 줄바꿈 기준 줄 수 합 — 한 줄 폭 = glyphLen(한글 2·그 밖 1) × 글자 pt / 2. */
    private static int textLines(String text, int size, double availPt) {
        double avail = Math.max(size, availPt);
        int lines = 0;
        for (String seg : text.split("\n", -1)) {
            lines += Math.max(1, (int) Math.ceil(glyphLen(seg) * size / 2.0 / avail));
        }
        return lines;
    }

    private static double paraHeight(DocModel.Para p, double widthPt) {
        StringBuilder sb = new StringBuilder();
        for (DocModel.Run r : p.getRuns()) {
            sb.append(r.getText());
        }
        double avail = widthPt;
        if (p.getBullet() != DocModel.Bullet.NONE) {
            double hanging = p.getBullet() == DocModel.Bullet.SQUARE ? Math.round(p.getSize() * 20 * 1.3) : p.getSize() * 20;
            avail -= (hanging + p.getLevel() * 260) / 20.0;
        }
        double before = p.getSpaceBeforePt() >= 0 ? p.getSpaceBeforePt() : 0;
        double after = p.getSpaceAfterPt() >= 0 ? p.getSpaceAfterPt() : 2;
        return textLines(sb.toString(), p.getSize(), avail) * lineHeight(p.getLineTw(), p.getSize()) + before + after;
    }

    private static double tableHeight(DocModel.Table t, int widthTw) {
        int[] gw = DocxKit.widths(t, widthTw);
        int[][] start = t.layout();
        double h = 1;
        for (int r = 0; r < t.getRows().size(); r++) {
            double rowH = ROW_EXTRA_PT;
            List<DocModel.Cell> row = t.getRows().get(r);
            for (int i = 0; i < row.size(); i++) {
                DocModel.Cell c = row.get(i);
                if (c.getRowspan() > 1) {
                    continue;   // 세로 병합 칸은 행 높이 계산에서 뺀다(이름표 칸)
                }
                int span = 0;
                for (int k = start[r][i]; k < start[r][i] + c.getColspan(); k++) {
                    span += gw[k];
                }
                rowH = Math.max(rowH, estimate(c.getBlocks(), span - 2 * DocxKit.CELL_MAR_LR) + ROW_EXTRA_PT);
            }
            h += rowH;
        }
        return h;
    }

    /** 소제목 굵게 — v3 는 '- ' 글머리 줄도 같은 run 이라 함께 굵다(샘플). */
    private static DocModel.Para dashHead(String t, boolean v3) {
        return v3 ? DocModel.Para.of(DocModel.Bullet.DASH, 0, DocModel.Run.bold(t)) : DocModel.Para.bullet(DocModel.Bullet.DASH, t);
    }

    /** ■ 소제목 — 굵게 11pt(제목 14 > ■ 11 > 본문 10). */
    private static DocModel.Para squareHead(String t) {
        return new DocModel.Para(Collections.singletonList(DocModel.Run.bold(t)), DocModel.Bullet.NONE, 0, 11, DocModel.Align.LEFT);
    }

    private static DocModel.Cell midText(String t, boolean bold, DocModel.Align align, int cs, int rs) {
        return midText(t, bold, align, cs, rs, DocModel.Para.DEFAULT_PT, -1);
    }

    /** 세로 가운데 칸 한 개 — sb&lt;0 이면 문단 간격 기본값, 아니면 앞·뒤 sb pt. */
    private static DocModel.Cell midText(String t, boolean bold, DocModel.Align align, int cs, int rs, int pt, int sb) {
        DocModel.Para p = new DocModel.Para(Collections.singletonList(bold ? DocModel.Run.bold(t) : DocModel.Run.of(t)),
                DocModel.Bullet.NONE, 0, pt, DocModel.Align.LEFT);
        return midCell(Collections.<DocModel.Block>singletonList(sb < 0 ? p : p.withSpacing(sb, sb)), align, cs, rs);
    }

    /** 세로 가운데 칸 helper — header 가 아니면서 Cell.withVAlign(CENTER)(음영 없음). */
    private static DocModel.Cell midCell(List<DocModel.Block> blocks, DocModel.Align align, int cs, int rs) {
        return new DocModel.Cell(blocks, cs, rs, false, DocModel.Shade.NONE, align).withVAlign(DocModel.VAlign.CENTER);
    }

    /** 평가표 머리 칸 — Cell.header 와 같되(굵게·음영·가운데) 글자 크기·간격을 본문 단계에 맞춘다. */
    private static DocModel.Cell headCell(String t, int cs, int rs, int pt, int sb) {
        DocModel.Para p = new DocModel.Para(Collections.singletonList(DocModel.Run.bold(t)), DocModel.Bullet.NONE, 0, pt, DocModel.Align.CENTER);
        return new DocModel.Cell(Collections.<DocModel.Block>singletonList(p.withSpacing(sb, sb)), cs, rs, true,
                DocModel.Shade.HEADER, DocModel.Align.CENTER);
    }

    /** 글자 길이 — 한글·한자·전각 2, 그 밖 1, 줄바꿈 기준 가장 긴 줄. */
    private static int glyphLen(String s) {
        int best = 0;
        int cur = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '\n') {
                best = Math.max(best, cur);
                cur = 0;
            } else {
                cur += isWide(ch) ? 2 : 1;
            }
        }
        return Math.max(best, cur);
    }

    private static boolean isWide(char c) {
        return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3000 && c <= 0x303F) || (c >= 0x3130 && c <= 0x318F)
                || (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xFF00 && c <= 0xFFEF);
    }

    /**
     * 평가표 글자 단계 = {글자 pt, 칸 문단 앞·뒤 pt}. 줄 수를 추정해 A(10pt·3/3) → B(10pt·0/0) → C(9pt·0/0) 중 처음 쪽에 들어가는 단계.
     * 추정이라 실제 Word 와 다를 수 있다 — C 로도 넘치면 C 로 두고 다음 쪽으로 넘긴다(9pt 아래로는 내리지 않는다).
     */
    private static int[] scoringStage(double[] pct, int[] cr, int[] cc, int[] rs, int[] cs, String[] tx, int rn) {
        int n = pct.length;
        double sum = 0;
        for (double p : pct) {
            sum += p;
        }
        int[] gw = new int[n];   // DocxKit 의 열 폭 계산과 같은 식
        int used = 0;
        for (int k = 0; k < n - 1; k++) {
            gw[k] = (int) Math.round(DocxKit.BODY_W * pct[k] / sum);
            used += gw[k];
        }
        gw[n - 1] = DocxKit.BODY_W - used;
        int[] rowLines = new int[rn];
        Arrays.fill(rowLines, 1);
        for (int i = 0; i < cr.length; i++) {
            if (rs[i] != 1) {
                continue;   // 세로 병합 칸은 계산에서 뺀다
            }
            int span = 0;
            for (int k = cc[i]; k < cc[i] + cs[i]; k++) {
                span += gw[k];
            }
            double cap = Math.max(1.0, (span - 200) / (DocModel.Para.DEFAULT_PT * 10.0));   // 칸 용량(글자 단위, 10pt)
            int lines = 0;
            for (String line : tx[i].split("\n", -1)) {
                lines += Math.max(1, (int) Math.ceil(glyphLen(line) / cap));
            }
            rowLines[cr[i]] = Math.max(rowLines[cr[i]], lines);
        }
        int total = 0;
        for (int l : rowLines) {
            total += l;
        }
        if (total * 14 + rn * 10 <= TABLE_BUDGET_PT) {   // 줄 14pt(10pt 글자 exact) + 칸 앞뒤 3+3 + 위아래 여백 4
            return new int[]{10, 3};
        }
        if (total * 14 + rn * 4 <= TABLE_BUDGET_PT) {
            return new int[]{10, 0};
        }
        return new int[]{9, 0};
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
