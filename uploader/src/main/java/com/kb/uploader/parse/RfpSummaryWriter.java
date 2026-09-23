package com.kb.uploader.parse;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RFP 추출 결과를 사람이 읽는 Markdown 요약으로 만든다 (LLM 없이 규칙 + TextRank).
 * 목표: 이 파일만 읽어도 발주기관·사업·요구사항·평가 배점을 파악할 수 있을 것.
 */
@Component
public class RfpSummaryWriter {

    static final String NEED_CHECK = "확인 필요";

    private static final Pattern HEADING = Pattern.compile(
        "^(?:제\\s*\\d+\\s*[장절]|[IVX]{1,4}\\s*[.)]|\\d{1,2}\\s*[.)]|\\d{1,2}(?:\\.\\d{1,2}){1,2}\\.?|[가-하]\\s*[.)]|[□■◎▣◇◆])\\s*\\S.{0,40}$");
    private static final Pattern REQ_ID = Pattern.compile("(?<![A-Z])([A-Z]{2,4})\\s?-\\s?(\\d{2,4})(?!\\d)");
    private static final Pattern SCORE_HEADER = Pattern.compile("배\\s*점|평\\s*가\\s*항\\s*목|평\\s*가\\s*요\\s*소|평\\s*가\\s*부\\s*문|점\\s*수");
    private static final Pattern NUMBER = Pattern.compile("^(\\d{1,3}(?:\\.\\d{1,2})?)\\s*점?$");
    private static final Pattern SCORE_LINE = Pattern.compile("^(.{2,50}?)\\s*[|:：]?\\s+(\\d{1,3}(?:\\.\\d)?)\\s*점?\\s*$");
    private static final Pattern TOTAL_ROW = Pattern.compile("^(?:합\\s*계|총\\s*계|계|총\\s*점|소\\s*계)$");
    private static final Pattern TECH_PRICE = Pattern.compile(
        "기술[^\\n]{0,15}?(\\d{2})\\s*(?:%|점|퍼센트)[^\\n]{0,40}?가격[^\\n]{0,15}?(\\d{2})\\s*(?:%|점|퍼센트)");
    private static final Pattern TECH_PRICE_RATIO = Pattern.compile("기술\\s*[:：]?\\s*가격[^\\n\\d]{0,20}(\\d{2})\\s*[:：]\\s*(\\d{2})");

    private static final Map<String, String> REQ_CATEGORY = new LinkedHashMap<>();
    static {
        REQ_CATEGORY.put("SFR", "기능");
        REQ_CATEGORY.put("ECR", "장비구성");
        REQ_CATEGORY.put("PER", "성능");
        REQ_CATEGORY.put("INR", "인터페이스");
        REQ_CATEGORY.put("SIR", "인터페이스");
        REQ_CATEGORY.put("DAR", "데이터");
        REQ_CATEGORY.put("TER", "테스트");
        REQ_CATEGORY.put("SER", "보안");
        REQ_CATEGORY.put("QUR", "품질");
        REQ_CATEGORY.put("COR", "제약사항");
        REQ_CATEGORY.put("PMR", "프로젝트관리");
        REQ_CATEGORY.put("PSR", "프로젝트지원");
        REQ_CATEGORY.put("MAR", "유지관리");
    }

    private final TextRankSummarizer textRank;

    public RfpSummaryWriter(TextRankSummarizer textRank) {
        this.textRank = textRank;
    }

    public static final class Meta {
        final String originalName;
        final String institutionName;
        final String category;
        final String noticeDate;   // yyyyMMdd 또는 null
        final String parsedAt;     // yyyy-MM-dd HH:mm:ss

        public Meta(String originalName, String institutionName, String category,
                    String noticeDate, String parsedAt) {
            this.originalName = originalName;
            this.institutionName = institutionName;
            this.category = category;
            this.noticeDate = noticeDate;
            this.parsedAt = parsedAt;
        }
    }

    static final class Section {
        final String title;
        final List<String> lines = new ArrayList<>();
        Section(String title) { this.title = title; }
    }

    public String write(ExtractedDocument doc, Meta meta) {
        List<String> lines = doc.lines();
        List<Section> sections = sections(lines);
        StringBuilder md = new StringBuilder();

        String projectName = orCheck(projectName(doc, lines));
        md.append("# ").append(projectName).append("\n\n");
        md.append("> 입찰공고문(RFP) 자동 요약 · 원본: `").append(meta.originalName)
          .append("` · 파싱: ").append(meta.parsedAt).append("\n")
          .append("> 규칙 기반 추출 + TextRank 요약입니다. \"").append(NEED_CHECK)
          .append("\" 항목은 원문에서 찾지 못한 값이니 원본을 확인하세요.\n\n");

        // 1. 개요
        md.append("## 1. 사업 개요\n\n");
        md.append("| 항목 | 내용 |\n|---|---|\n");
        row(md, "사업명", projectName);
        row(md, "발주기관", meta.institutionName);
        row(md, "기관분류", meta.category);
        row(md, "공고일", meta.noticeDate != null ? formatDate(meta.noticeDate) : NEED_CHECK);
        // 약정·협약·지정 기간도 같은 자리에 쓴다. 금고 지정처럼 "사업기간" 이라는 말을 아예
        // 쓰지 않는 공고가 있어 2026-09-23 에 추가했다.
        row(md, "사업기간", orCheck(field(doc, lines, "사업기간", "용역기간", "과업기간", "계약기간",
            "수행기간", "사업 기간", "약정기간", "협약기간", "지정기간", "이행기간")));
        row(md, "사업예산", orCheck(field(doc, lines, "사업예산", "소요예산", "추정가격", "사업비", "예산액", "배정예산", "기초금액", "사업금액")));
        row(md, "제안서 제출", orCheck(field(doc, lines, "제안서제출", "제안서 제출", "제출기한", "제출마감", "접수마감", "제안서접수", "입찰서제출", "접수기간")));
        row(md, "계약방법", orCheck(field(doc, lines, "계약방법", "계약방식", "입찰방법", "낙찰자결정방법", "낙찰자 결정방법")));
        md.append('\n');

        // 2. 목적·배경
        md.append("## 2. 사업 목적 및 배경\n\n");
        bullets(md, topicSummary(sections, lines, "목적|배경|필요성|추진\\s*방향", 5));

        // 3. 범위·과업
        md.append("## 3. 사업 범위 및 주요 과업\n\n");
        bullets(md, topicSummary(sections, lines, "범위|과업|사업\\s*내용|구축\\s*내용|주요\\s*내용|추진\\s*내용", 8));

        // 4. 요구사항
        md.append("## 4. 요구사항\n\n");
        requirements(md, doc, lines);

        // 5. 평가·배점
        md.append("## 5. 평가 방법 및 배점표\n\n");
        scoring(md, doc, lines, sections);

        // 6. 참가자격·제출
        md.append("## 6. 입찰 참가자격 및 제출 안내\n\n");
        bullets(md, topicSummary(sections, lines, "참가\\s*자격|입찰\\s*참가|제출|유의|제안서\\s*작성|안내", 6));

        // 7. 핵심 문장
        md.append("## 7. 핵심 문장 (TextRank Top 10)\n\n");
        bullets(md, textRank.summarize(textRank.splitSentences(lines), 10));

        // 부록
        md.append("## 부록. 원문 목차\n\n");
        int shown = 0;
        for (Section s : sections) {
            if (s.title == null) continue;
            md.append("- ").append(escape(s.title)).append('\n');
            if (++shown >= 80) { md.append("- …\n"); break; }
        }
        if (shown == 0) md.append("- (목차를 인식하지 못함)\n");
        md.append('\n');
        return md.toString();
    }

    // ── 사업명 / 레이블 필드 ─────────────────────────────────────────────

    String projectName(ExtractedDocument doc, List<String> lines) {
        String v = field(doc, lines, "사업명", "용역명", "과업명", "사업명칭", "건명");
        if (v != null) return tighten(v);
        int limit = Math.min(lines.size(), 40);
        for (int i = 0; i < limit; i++) {
            String l = lines.get(i);
            if (l.contains("제안요청서") && l.length() > 8) {
                String t = l.replace("제안요청서", "").replaceAll("[\\[\\]()「」『』]", "").trim();
                if (t.length() >= 4) return tighten(t);
            }
        }
        for (int i = 0; i < limit; i++) {
            String l = lines.get(i);
            if (l.length() >= 8 && l.length() <= 80 && l.matches(".*(사업|구축|용역|개발|고도화|운영)$")) {
                return tighten(l);
            }
        }
        return null;
    }

    /**
     * 자간을 벌린 한글을 붙인다. "사 업 개 요" → "사업개요".
     *
     * <p>한글 문서는 제목에 자간을 주려고 글자마다 공백을 넣는 일이 흔한데, 추출하면 그 공백이
     * 그대로 남아 제목이 "사 업 개 요" 로 나온다. 한 글자짜리 토막이 대부분일 때만 붙이므로
     * "서울에너지공사 금고 지정" 처럼 정상적인 띄어쓰기는 건드리지 않는다.
     */
    static String tighten(String s) {
        if (s == null) return null;
        String[] parts = s.trim().split("\\s+");
        if (parts.length < 3) return s.trim();
        int single = 0;
        for (String p : parts) {
            if (p.length() == 1) single++;
        }
        if (single * 5 < parts.length * 4) return s.trim();   // 80% 미만이면 정상 띄어쓰기다
        StringBuilder sb = new StringBuilder();
        for (String p : parts) sb.append(p);
        return sb.toString();
    }

    /** 표의 "레이블 | 값" 행 또는 본문의 "레이블 : 값"에서 값을 찾는다. */
    String field(ExtractedDocument doc, List<String> lines, String... labels) {
        List<Pattern> patterns = new ArrayList<>();
        List<Pattern> linePatterns = new ArrayList<>();
        for (String label : labels) {
            patterns.add(Pattern.compile(spaced(label)));
            linePatterns.add(Pattern.compile("^[^가-힣A-Za-z]{0,6}" + spaced(label) + "\\s*[:：|]\\s*(.+)$"));
        }

        for (DocBlock t : doc.getTables()) {
            for (List<String> row : t.getRows()) {
                // ⚠️ 머리글 행을 "레이블 | 값" 으로 착각하면 안 된다. 2026-09-23 에 실제 HWP
                //    (서울에너지공사 금고 지정)에서 별지 서식의 실적표 머리글
                //    `연번 | 사업명 | 사업개요 | 사업기간` 때문에 사업명이 "사 업 개 요",
                //    사업기간이 "발 주 처" 로 잡혔다. 오른쪽 칸이 값이 아니라 **옆 칸 제목**이었다.
                if (isHeaderRow(row)) continue;
                for (int c = 0; c < row.size() - 1; c++) {
                    String key = stripDecor(row.get(c));
                    if (key.length() > 20) continue;
                    for (Pattern p : patterns) {
                        if (p.matcher(key).matches()) {
                            for (int v = c + 1; v < row.size(); v++) {
                                String val = row.get(v).trim();
                                if (val.isEmpty() || val.equals(row.get(c))) continue;
                                if (isLabelWord(val)) continue;   // 값 자리에 또 레이블이면 머리글이다
                                return clip(val, 200);
                            }
                        }
                    }
                }
            }
        }
        for (String line : lines) {
            for (Pattern p : linePatterns) {
                Matcher m = p.matcher(line);
                if (m.find()) {
                    String val = m.group(1).trim();
                    if (!val.isEmpty()) return clip(val, 200);
                }
            }
        }
        return null;
    }

    private static String spaced(String label) {
        StringBuilder sb = new StringBuilder();
        for (char ch : label.replace(" ", "").toCharArray()) {
            if (sb.length() > 0) sb.append("\\s*");
            sb.append(Pattern.quote(String.valueOf(ch)));
        }
        return sb.toString();
    }

    private static String stripDecor(String s) {
        return s.replaceAll("^[\\s\\d.)○●□■◎▶·\\-*]+", "").replaceAll("[\\s:：]+$", "").trim();
    }

    /**
     * 표의 머리글로 자주 쓰이는 낱말. 값 자리에 이런 말만 들어 있으면 그 행은 데이터가 아니라 제목줄이다.
     * ⚠️ 자간을 벌린 한글("사 업 명")이 흔해 공백을 지우고 비교한다.
     */
    private static final Set<String> HEADER_WORDS = new HashSet<>(Arrays.asList(
        "연번", "번호", "순번", "구분", "항목", "세부항목", "비고", "배점", "평가항목", "평가기준",
        "사업명", "사업개요", "사업기간", "용역명", "과업명", "발주처", "발주기관", "계약기간",
        "수행기간", "계약금액", "사업금액", "금액", "기간", "내용", "실적", "합계", "계"));

    private static boolean isLabelWord(String cell) {
        String flat = stripDecor(cell).replaceAll("\\s+", "");
        if (flat.isEmpty() || flat.length() > 10) return false;
        flat = flat.replaceAll("\\(.*?\\)", "");   // "사업기간(예정)" 도 머리글이다
        return HEADER_WORDS.contains(flat);
    }

    /** 레이블 같은 칸이 둘 이상이면 머리글 행으로 본다. */
    private static boolean isHeaderRow(List<String> row) {
        if (row.size() < 2) return false;
        int labels = 0;
        for (String cell : row) {
            if (isLabelWord(cell)) labels++;
        }
        return labels >= 2;
    }

    // ── 섹션 분할 / 주제 요약 ────────────────────────────────────────────

    List<Section> sections(List<String> lines) {
        List<Section> result = new ArrayList<>();
        Section cur = new Section(null);
        result.add(cur);
        for (String l : lines) {
            if (l.length() <= 45 && HEADING.matcher(l).matches() && !l.contains("|")) {
                cur = new Section(l);
                result.add(cur);
            } else {
                cur.lines.add(l);
            }
        }
        return result;
    }

    private List<String> topicSummary(List<Section> sections, List<String> lines, String topicRegex, int topN) {
        Pattern topic = Pattern.compile(topicRegex);
        List<String> body = new ArrayList<>();
        for (Section s : sections) {
            if (s.title != null && topic.matcher(s.title).find()) body.addAll(s.lines);
        }
        if (body.isEmpty()) {
            // 해당 제목을 못 찾으면 주제어가 들어간 문장만 모아 순위를 매긴다
            for (String l : lines) if (topic.matcher(l).find()) body.add(l);
        }
        List<String> sentences = textRank.splitSentences(body);
        if (sentences.isEmpty()) {
            // 개조식 문서: 짧은 항목을 그대로 사용
            for (String l : body) {
                String t = l.replaceAll("^[\\s\\-·•○●□■◎▶▷※*]+", "").trim();
                if (t.length() >= 6 && !t.contains("|")) sentences.add(t);
                if (sentences.size() >= topN * 3) break;
            }
            return sentences.subList(0, Math.min(topN, sentences.size()));
        }
        return textRank.summarize(sentences, topN);
    }

    // ── 요구사항 ─────────────────────────────────────────────────────────

    static final class Requirement {
        final String id;
        String name = "";
        String definition = "";
        Requirement(String id) { this.id = id; }
    }

    private void requirements(StringBuilder md, ExtractedDocument doc, List<String> lines) {
        Map<String, Requirement> reqs = new LinkedHashMap<>();

        for (DocBlock t : doc.getTables()) {
            List<List<String>> rows = t.getRows();
            for (int r = 0; r < rows.size(); r++) {
                List<String> row = rows.get(r);
                for (int c = 0; c < row.size(); c++) {
                    String id = reqId(row.get(c));
                    if (id == null || !row.get(c).trim().replace(" ", "").startsWith(id)) continue;
                    Requirement req = reqs.computeIfAbsent(id, Requirement::new);
                    // 목록형 표: 같은 행의 다른 셀 = 명칭, 가장 긴 셀 = 정의
                    for (int k = 0; k < row.size(); k++) {
                        if (k == c) continue;
                        String cell = row.get(k).trim();
                        if (cell.isEmpty() || isReqLabel(cell)) continue;
                        if (req.name.isEmpty() && cell.length() <= 60) req.name = cell;
                        else if (cell.length() > req.definition.length() && !cell.equals(req.name)) req.definition = cell;
                    }
                    // 상세형 표: "요구사항 명칭 | 값", "정의 | 값" 행이 같은 표에 있음
                    for (int rr = r + 1; rr < Math.min(rows.size(), r + 8); rr++) {
                        List<String> other = rows.get(rr);
                        if (other.isEmpty()) continue;
                        String key = other.get(0).replace(" ", "");
                        if (reqId(String.join(" ", other)) != null) break;
                        String val = lastNonEmpty(other);
                        if (val == null || val.equals(other.get(0))) continue;
                        if (req.name.isEmpty() && key.matches(".*(명칭|요구사항명).*")) req.name = val;
                        else if (req.definition.isEmpty() && key.matches(".*(정의|세부내용|상세설명|내용).*")) req.definition = val;
                    }
                }
            }
        }
        // 표로 인식되지 않은 경우(PDF 등): 본문 줄에서 ID 뒤 텍스트를 명칭으로
        for (String line : lines) {
            Matcher m = REQ_ID.matcher(line);
            if (!m.find() || m.start() > 3) continue;
            String id = m.group(1) + "-" + m.group(2);
            if (!REQ_CATEGORY.containsKey(m.group(1))) continue;
            Requirement req = reqs.computeIfAbsent(id, Requirement::new);
            if (req.name.isEmpty()) {
                String rest = line.substring(m.end()).replaceAll("^[\\s|:：.)]+", "").trim();
                if (!rest.isEmpty()) {
                    String[] split = splitNameAndDefinition(rest.split("\\s*\\|\\s*")[0]);
                    req.name = split[0];
                    if (req.definition.isEmpty()) req.definition = split[1];
                }
            }
        }

        if (reqs.isEmpty()) {
            md.append("- 요구사항 고유번호(SFR-001 형식)를 찾지 못했습니다. ").append(NEED_CHECK).append("\n\n");
            return;
        }

        Map<String, Integer> byCat = new LinkedHashMap<>();
        for (Requirement r : reqs.values()) byCat.merge(categoryLabel(r.id), 1, Integer::sum);
        StringBuilder summary = new StringBuilder();
        for (Map.Entry<String, Integer> e : byCat.entrySet()) {
            if (summary.length() > 0) summary.append(", ");
            summary.append(e.getKey()).append(' ').append(e.getValue());
        }
        md.append("총 **").append(reqs.size()).append("건** (").append(summary).append(")\n\n");
        md.append("| 고유번호 | 분류 | 요구사항 명칭 | 정의(요약) |\n|---|---|---|---|\n");
        for (Requirement r : reqs.values()) {
            md.append("| ").append(r.id)
              .append(" | ").append(categoryLabel(r.id))
              .append(" | ").append(escape(r.name.isEmpty() ? NEED_CHECK : r.name))
              .append(" | ").append(escape(clip(r.definition, 150)))
              .append(" |\n");
        }
        md.append('\n');
    }

    /** "민원접수 기능 온라인으로 민원을 …" 처럼 한 줄에 붙어 있는 명칭과 정의를 나눈다. */
    static String[] splitNameAndDefinition(String rest) {
        String[] words = rest.split("\\s+");
        StringBuilder name = new StringBuilder();
        int i = 0;
        // 명칭은 보통 두 어절 이내이고, "…기능/관리/통제" 같은 말로 끝난다
        while (i < words.length && i < 2 && name.length() + words[i].length() <= 20) {
            if (name.length() > 0) name.append(' ');
            name.append(words[i++]);
            if (words[i - 1].matches(".*(기능|관리|통제|속도|성능|요건|사항|처리|연계|지원|보안|품질)$")) break;
        }
        StringBuilder def = new StringBuilder();
        while (i < words.length) {
            if (def.length() > 0) def.append(' ');
            def.append(words[i++]);
        }
        return new String[]{name.toString(), def.toString()};
    }

    private static String reqId(String text) {
        Matcher m = REQ_ID.matcher(text);
        while (m.find()) {
            if (REQ_CATEGORY.containsKey(m.group(1))) return m.group(1) + "-" + m.group(2);
        }
        return null;
    }

    private static boolean isReqLabel(String cell) {
        String k = cell.replace(" ", "");
        return k.matches("(요구사항)?(고유번호|분류|명칭|정의|세부내용|구분|번호|ID)");
    }

    private static String categoryLabel(String id) {
        String prefix = id.substring(0, id.indexOf('-'));
        String c = REQ_CATEGORY.get(prefix);
        return c != null ? c : prefix;
    }

    // ── 평가 / 배점 ─────────────────────────────────────────────────────

    private void scoring(StringBuilder md, ExtractedDocument doc, List<String> lines, List<Section> sections) {
        String full = String.join("\n", lines);
        Matcher tp = TECH_PRICE.matcher(full);
        Matcher tr = TECH_PRICE_RATIO.matcher(full);
        if (tp.find()) {
            md.append("- **기술 : 가격 = ").append(tp.group(1)).append(" : ").append(tp.group(2)).append("**\n");
        } else if (tr.find()) {
            md.append("- **기술 : 가격 = ").append(tr.group(1)).append(" : ").append(tr.group(2)).append("**\n");
        } else {
            md.append("- 기술/가격 평가 비율: ").append(NEED_CHECK).append('\n');
        }
        md.append('\n');

        int tables = 0;
        for (DocBlock t : doc.getTables()) {
            if (!isScoreTable(t.getRows())) continue;
            tables++;
            md.append("**배점표 ").append(tables).append("**\n\n");
            appendTable(md, t.getRows());
            String check = scoreCheck(t.getRows());
            if (check != null) md.append('\n').append(check).append('\n');
            md.append('\n');
        }
        if (tables > 0) return;

        // 표 구조가 없는 경우(PDF): "평가" 섹션의 "항목 … NN점" 줄로 복원
        List<String[]> items = new ArrayList<>();
        List<String> pool = new ArrayList<>();
        for (Section s : sections) {
            if (s.title != null && s.title.matches(".*(평가|배점).*")) pool.addAll(s.lines);
        }
        if (pool.isEmpty()) {
            for (int i = 0; i < lines.size(); i++) {
                if (SCORE_HEADER.matcher(lines.get(i)).find()) {
                    pool.addAll(lines.subList(i, Math.min(lines.size(), i + 60)));
                    break;
                }
            }
        }
        for (String l : pool) {
            Matcher m = SCORE_LINE.matcher(l);
            if (m.matches() && !m.group(1).matches(".*\\d{4}.*")) {
                items.add(new String[]{m.group(1).replaceAll("[\\s|]+$", "").trim(), m.group(2)});
            }
        }
        if (items.isEmpty()) {
            md.append("- 배점표를 찾지 못했습니다. ").append(NEED_CHECK).append("\n\n");
            return;
        }
        md.append("| 평가항목 | 배점 |\n|---|---|\n");
        double sum = 0;
        String stated = null;
        for (String[] it : items) {
            md.append("| ").append(escape(it[0])).append(" | ").append(it[1]).append(" |\n");
            if (TOTAL_ROW.matcher(it[0].replace(" ", "")).matches()) stated = it[1];
            else sum += Double.parseDouble(it[1]);
        }
        md.append("\n- 항목 합계(검산): ").append(fmt(sum))
          .append(stated != null ? " / 문서상 합계: " + stated : "")
          .append("\n- ※ 줄 단위로 복원한 표라 대·중·소 항목이 섞여 있을 수 있습니다.\n\n");
    }

    static boolean isScoreTable(List<List<String>> rows) {
        int headerRows = Math.min(2, rows.size());
        boolean header = false;
        for (int r = 0; r < headerRows; r++) {
            for (String cell : rows.get(r)) {
                if (SCORE_HEADER.matcher(cell).find()) header = true;
            }
        }
        if (!header) return false;
        int numeric = 0;
        for (List<String> row : rows) {
            for (String cell : row) if (NUMBER.matcher(cell.trim()).matches()) { numeric++; break; }
        }
        return numeric >= 2;
    }

    /** 배점 열을 찾아 합계를 검산한다. */
    static String scoreCheck(List<List<String>> rows) {
        List<String> header = rows.get(0);
        int col = -1;
        for (int c = 0; c < header.size(); c++) {
            if (header.get(c).replaceAll("\\s", "").matches(".*(배점|점수).*")) col = c;
        }
        if (col < 0) return null;
        double sum = 0;
        String stated = null;
        for (int r = 1; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            if (col >= row.size()) continue;
            Matcher m = NUMBER.matcher(row.get(col).trim());
            if (!m.matches()) continue;
            boolean total = false;
            for (String cell : row) if (TOTAL_ROW.matcher(cell.replace(" ", "")).matches()) total = true;
            if (total) stated = m.group(1);
            else sum += Double.parseDouble(m.group(1));
        }
        if (sum == 0) return null;
        return "- 배점 열 합계(검산): " + fmt(sum) + (stated != null ? " / 문서상 합계: " + stated : "");
    }

    // ── Markdown 유틸 ───────────────────────────────────────────────────

    static void appendTable(StringBuilder md, List<List<String>> rows) {
        int cols = 0;
        for (List<String> r : rows) cols = Math.max(cols, r.size());
        boolean[] used = new boolean[cols];
        for (List<String> r : rows) {
            for (int c = 0; c < r.size(); c++) if (!r.get(c).trim().isEmpty()) used[c] = true;
        }
        List<Integer> keep = new ArrayList<>();
        for (int c = 0; c < cols; c++) if (used[c]) keep.add(c);
        if (keep.isEmpty()) return;

        for (int r = 0; r < rows.size(); r++) {
            md.append('|');
            for (int c : keep) {
                String cell = c < rows.get(r).size() ? rows.get(r).get(c) : "";
                md.append(' ').append(escape(cell)).append(" |");
            }
            md.append('\n');
            if (r == 0) {
                md.append('|');
                for (int i = 0; i < keep.size(); i++) md.append("---|");
                md.append('\n');
            }
        }
    }

    private static void row(StringBuilder md, String key, String value) {
        md.append("| ").append(key).append(" | ").append(escape(value)).append(" |\n");
    }

    private static void bullets(StringBuilder md, List<String> items) {
        if (items.isEmpty()) {
            md.append("- 관련 내용을 찾지 못했습니다. ").append(NEED_CHECK).append('\n');
        }
        for (String s : items) md.append("- ").append(escape(s)).append('\n');
        md.append('\n');
    }

    private static String lastNonEmpty(List<String> row) {
        for (int i = row.size() - 1; i >= 0; i--) {
            if (!row.get(i).trim().isEmpty()) return row.get(i).trim();
        }
        return null;
    }

    static String escape(String s) {
        if (s == null) return "";
        return s.replace("|", "\\|").replace("\n", " ");
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    private static String orCheck(String s) {
        return s == null || s.trim().isEmpty() ? NEED_CHECK : s;
    }

    private static String fmt(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.format(Locale.ROOT, "%.1f", d);
    }

    private static String formatDate(String yyyyMMdd) {
        return yyyyMMdd.substring(0, 4) + "-" + yyyyMMdd.substring(4, 6) + "-" + yyyyMMdd.substring(6, 8);
    }
}
