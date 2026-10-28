package com.kbstar.kgi.ggreport.web.docfill;

/**
 * 매핑 규칙 한 줄 — <b>워드의 키워드</b>와 <b>엑셀에서 가져올 값의 위치</b>.
 *
 * <p>위치를 적는 방법은 둘이다.
 * <ul>
 *   <li>{@link #cell} — 시트와 셀 주소({@code "B3"}). 양식이 고정된 엑셀에 쓴다.</li>
 *   <li>{@link #lookup} — <b>머리글 이름</b>으로 찾는다("기관명이 노원구인 행의 계약금액 열").
 *       행이 늘고 줄어도 깨지지 않는다.</li>
 * </ul>
 *
 * <p>규칙은 LLM이 아니라 <b>사람이 적는다</b>. 같은 입력이면 항상 같은 결과가 나온다는 것이
 * 이 기능의 전제다.
 */
public final class FillRule {

    /** 같은 키워드가 문서에 여러 번 나올 때. */
    public enum Occurrence {
        /** 문서 순서상 첫 번째만. */
        FIRST,
        /** 나오는 곳 전부(기본값). */
        ALL
    }

    private final String keyword;
    private final String sheet;
    private final String cell;
    private final int headerRow;
    private final String valueHeader;
    private final String keyHeader;
    private final String keyValue;
    private boolean overwrite = false;
    private Occurrence occurrence = Occurrence.ALL;
    private boolean labelOnly = false;

    private FillRule(String keyword, String sheet, String cell,
                     int headerRow, String valueHeader, String keyHeader, String keyValue) {
        if (keyword == null || keyword.trim().isEmpty()) {
            throw new IllegalArgumentException("키워드가 비어 있다");
        }
        this.keyword = keyword.trim();
        this.sheet = sheet;
        this.cell = cell;
        this.headerRow = headerRow;
        this.valueHeader = valueHeader;
        this.keyHeader = keyHeader;
        this.keyValue = keyValue;
    }

    /** 시트(null이면 첫 시트)의 셀 주소에서 가져온다. 병합 셀 안의 주소를 줘도 병합의 첫 칸 값을 쓴다. */
    public static FillRule cell(String keyword, String sheet, String address) {
        if (address == null || address.trim().isEmpty()) {
            throw new IllegalArgumentException("셀 주소가 비어 있다");
        }
        return new FillRule(keyword, sheet, address.trim(), 0, null, null, null);
    }

    /**
     * 머리글 행({@code headerRow}, 1부터)에서 {@code keyHeader} 열 값이 {@code keyValue}인 행을 찾아
     * 그 행의 {@code valueHeader} 열 값을 가져온다.
     */
    public static FillRule lookup(String keyword, String sheet, int headerRow,
                                  String valueHeader, String keyHeader, String keyValue) {
        if (headerRow < 1) throw new IllegalArgumentException("머리글 행은 1 이상이다");
        return new FillRule(keyword, sheet, null, headerRow, valueHeader, keyHeader, keyValue);
    }

    /** 기입할 자리에 이미 다른 내용이 있을 때 덮어쓸지(표의 오른쪽 칸에만 적용). 기본은 보호(덮어쓰지 않음). */
    public FillRule overwrite(boolean overwrite) {
        this.overwrite = overwrite;
        return this;
    }

    /**
     * <b>라벨 자리만</b> 채운다 — 표의 라벨 칸(글이 키워드뿐)이거나 {@code 키워드:} 꼴일 때만.
     * 문장 속에 섞인 같은 글자는 건너뛴다. 키워드가 더 긴 단어의 일부일 때("기관명" ⊂ "수요기관명")를
     * 막는 장치다 — 한국어는 조사가 붙어 단어 경계를 믿을 수 없어서, 기본(꺼짐)은 글자 그대로 찾는다.
     */
    public FillRule labelOnly(boolean labelOnly) {
        this.labelOnly = labelOnly;
        return this;
    }

    public FillRule occurrence(Occurrence occurrence) {
        this.occurrence = occurrence;
        return this;
    }

    public String keyword() { return keyword; }
    public String sheet() { return sheet; }
    public boolean isCellRule() { return cell != null; }
    public String cell() { return cell; }
    public int headerRow() { return headerRow; }
    public String valueHeader() { return valueHeader; }
    public String keyHeader() { return keyHeader; }
    public String keyValue() { return keyValue; }
    public boolean isOverwrite() { return overwrite; }
    public boolean isLabelOnly() { return labelOnly; }
    public Occurrence occurrence() { return occurrence; }

    @Override
    public String toString() {
        return isCellRule()
                ? keyword + " ← " + (sheet == null ? "(첫 시트)" : sheet) + "!" + cell
                : keyword + " ← " + (sheet == null ? "(첫 시트)" : sheet) + "[" + keyHeader + "=" + keyValue + "]." + valueHeader;
    }
}
