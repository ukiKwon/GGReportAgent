package com.kb.uploader.parse;

import java.util.Collections;
import java.util.List;

/** 문서에서 추출한 블록 하나: 문단 텍스트 또는 표(행 × 셀). */
public final class DocBlock {

    private final String text;
    private final List<List<String>> rows;

    private DocBlock(String text, List<List<String>> rows) {
        this.text = text;
        this.rows = rows;
    }

    public static DocBlock text(String text) {
        return new DocBlock(text, null);
    }

    public static DocBlock table(List<List<String>> rows) {
        return new DocBlock(null, Collections.unmodifiableList(rows));
    }

    public boolean isTable() { return rows != null; }
    public String getText() { return text; }
    public List<List<String>> getRows() { return rows; }

    /** 표는 셀을 " | "로, 행을 줄바꿈으로 이어 평문으로 만든다. */
    public String asPlainText() {
        if (!isTable()) return text;
        StringBuilder sb = new StringBuilder();
        for (List<String> row : rows) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(String.join(" | ", row));
        }
        return sb.toString();
    }
}
