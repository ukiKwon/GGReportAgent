package com.kbstar.kgi.ggreport.web.docout;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 기관장 정보 상세({@code InstitutionHeadService.detail} 결과) → 문서 모델(NEXT 100 S1).
 * 제목 「참고자료 N. 「기관명」 기관장 정보」 아래 2열 겉 표 — 인적 사항·학력·경력·출처. 확정된 칸만 쓴다.
 * 사진·후보 값·사번(created_by)·이전 기관장은 넣지 않는다(detail 의 head 만 읽고, 사진·후보 키는 건드리지 않는다). URL 은 일반 글자(링크 아님).
 */
public final class HeadDocBuilder {

    private static final Map<String, String> SRC_KIND = new HashMap<String, String>();
    private static final Map<String, String> FIELD_LABEL = new HashMap<String, String>();
    private static final List<String> FIELD_ORDER = Collections.unmodifiableList(Arrays.asList(
            "NAME", "POSITION", "ACTING", "FIRST_TAKE_OFFICE", "TERM_START", "TERM_END"));

    static {
        SRC_KIND.put("HOMEPAGE", "기관 누리집");
        SRC_KIND.put("NEC", "중앙선거관리위원회");
        SRC_KIND.put("ALIO", "알리오");
        SRC_KIND.put("CLEANEYE", "클린아이");
        SRC_KIND.put("GAZETTE", "관보·고시");
        SRC_KIND.put("PRESS", "언론 보도");
        SRC_KIND.put("OTHER", "기타 공개 자료");
        FIELD_LABEL.put("NAME", "성명");
        FIELD_LABEL.put("POSITION", "직위");
        FIELD_LABEL.put("ACTING", "권한대행");
        FIELD_LABEL.put("FIRST_TAKE_OFFICE", "첫 취임일");
        FIELD_LABEL.put("TERM_START", "임기 시작");
        FIELD_LABEL.put("TERM_END", "임기 끝");
    }

    private HeadDocBuilder() {
    }

    /**
     * 문서에 담을 확정 칸이 하나라도 있는지 — 권한대행 밖 확정 값·학력·경력 중 하나. 사진만 있거나 권한대행 칸만 있으면 false
     * (그런 머리는 빈 문서가 되므로 호출부가 409 HEAD_EMPTY 로 막는다). 생년월일은 문서에 넣지 않으므로 이 판정에서도 뺀다(사용자 11-19).
     */
    public static boolean hasContent(Map<String, Object> detail) {
        Map<String, Object> head = map(detail.get("head"));
        for (String key : map(head.get("fields")).keySet()) {
            if (!"ACTING".equals(key) && !"BIRTH_DATE".equals(key)) {
                return true;
            }
        }
        return !listOf(head.get("education")).isEmpty() || !listOf(head.get("career")).isEmpty();
    }

    /** detail 의 현 기관장 번호(감사 표 HEAD_ID 용). 없으면 null. */
    public static Long headIdOf(Map<String, Object> detail) {
        Object id = map(detail.get("head")).get("head_id");
        return id instanceof Number ? Long.valueOf(((Number) id).longValue()) : null;
    }

    /** @param baseDate 기준일 yyyy-MM-dd(문서를 만든 날, 서울 기준) */
    public static DocModel build(Map<String, Object> detail, String instName, int refNo, String baseDate) {
        Map<String, Object> head = map(detail.get("head"));
        Map<String, Object> fields = map(head.get("fields"));

        List<DocModel.Block> blocks = new ArrayList<DocModel.Block>();
        blocks.add(new DocModel.Heading("참고자료 " + refNo + ". 「" + nz(instName) + "」 기관장 정보", 14));

        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        rows.add(row("인적 사항", personal(head)));
        rows.add(row("학력", dashList(listOf(head.get("education")))));
        rows.add(row("경력", dashList(listOf(head.get("career")))));
        rows.add(row("출처", sources(fields, Boolean.TRUE.equals(head.get("acting")), listOf(head.get("education")), listOf(head.get("career")))));
        blocks.add(new DocModel.Table(2, new double[]{18, 82}, rows, 0, false));

        blocks.add(new DocModel.Para(Collections.singletonList(DocModel.Run.of("확정된 값만 담았습니다. 기준일 " + nz(baseDate))),
                DocModel.Bullet.NONE, 0, 9, DocModel.Align.LEFT));
        return new DocModel(blocks);
    }

    private static List<DocModel.Cell> row(String label, List<DocModel.Block> content) {
        List<DocModel.Cell> r = new ArrayList<DocModel.Cell>();
        r.add(DocModel.Cell.header(label));
        r.add(DocModel.Cell.of(content));
        return r;
    }

    private static List<DocModel.Block> personal(Map<String, Object> head) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        String name = str(head.get("name"));
        if (!name.isEmpty()) {
            out.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "성명: " + name));
        }
        String pos = str(head.get("position"));
        boolean acting = Boolean.TRUE.equals(head.get("acting"));
        if (!pos.isEmpty() || acting) {
            out.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "직위: " + pos + (acting ? "(권한대행)" : "")));
        }
        String first = str(head.get("first_take_office"));
        if (!first.isEmpty()) {
            out.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "첫 취임일: " + first));
        }
        String s = str(head.get("term_start"));
        String e = str(head.get("term_end"));
        if (!s.isEmpty() || !e.isEmpty()) {
            out.add(DocModel.Para.bullet(DocModel.Bullet.CIRCLE_O, "현 임기: " + s + " ~ " + e));
        }
        if (out.isEmpty()) {
            out.add(DocModel.Para.plain("확정된 값이 없습니다."));
        }
        return out;
    }

    private static List<DocModel.Block> dashList(List<Map<String, Object>> items) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        for (Map<String, Object> i : items) {
            out.add(DocModel.Para.bullet(DocModel.Bullet.DASH, itemText(i)));
        }
        if (out.isEmpty()) {
            out.add(DocModel.Para.plain("확정된 값이 없습니다."));
        }
        return out;
    }

    private static String itemText(Map<String, Object> i) {
        String v = str(i.get("value"));
        String from = str(i.get("from"));
        String to = str(i.get("to"));
        if (!from.isEmpty() || !to.isEmpty()) {
            return v + " (" + from + " ~ " + to + ")";
        }
        return v;
    }

    /** 권한대행이 '아니오'면 인적 사항에 그 줄이 없으므로 출처 절에도 그 줄을 쓰지 않는다(화면에 없는 값의 출처가 문서에만 남지 않게). */
    private static List<DocModel.Block> sources(Map<String, Object> fields, boolean acting,
                                                List<Map<String, Object>> edu, List<Map<String, Object>> career) {
        List<DocModel.Block> out = new ArrayList<DocModel.Block>();
        for (String f : FIELD_ORDER) {
            if ("ACTING".equals(f) && !acting) {
                continue;
            }
            Map<String, Object> field = map(fields.get(f));
            if (!field.isEmpty()) {
                addSource(out, FIELD_LABEL.get(f), map(field.get("source")));
            }
        }
        for (Map<String, Object> i : edu) {
            addSource(out, "학력", map(i.get("source")));
        }
        for (Map<String, Object> i : career) {
            addSource(out, "경력", map(i.get("source")));
        }
        if (out.isEmpty()) {
            out.add(DocModel.Para.plain("출처 정보가 없습니다."));
        }
        return out;
    }

    private static void addSource(List<DocModel.Block> out, String label, Map<String, Object> src) {
        String kind = str(src.get("kind"));
        String kindLabel = SRC_KIND.containsKey(kind) ? SRC_KIND.get(kind) : kind;
        StringBuilder b = new StringBuilder(label).append(": ").append(kindLabel);
        String title = str(src.get("title"));
        if (!title.isEmpty()) {
            b.append(" 「").append(title).append("」");
        }
        String checked = str(src.get("checked_on"));
        if (!checked.isEmpty()) {
            b.append(", 확인일 ").append(checked);
        }
        String url = str(src.get("url"));
        if (!url.isEmpty()) {
            b.append(", ").append(url);   // 일반 글자 — 링크로 만들지 않는다
        }
        out.add(DocModel.Para.bullet(DocModel.Bullet.DASH, b.toString()));
    }

    // ── 값 꺼내기 ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : Collections.<String, Object>emptyMap();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listOf(Object o) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        if (o instanceof List) {
            for (Object x : (List<Object>) o) {
                if (x instanceof Map) {
                    out.add((Map<String, Object>) x);
                }
            }
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
