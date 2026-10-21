package com.kb.uploader.parse;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** RFP 추출 결과: 원문 순서대로의 문단·표 블록. */
public class ExtractedDocument {

    private final List<DocBlock> blocks = new ArrayList<>();

    public void addText(String text) {
        if (text == null) return;
        for (String line : text.split("\\r?\\n")) {
            String t = normalize(line);
            if (!t.isEmpty()) blocks.add(DocBlock.text(t));
        }
    }

    public void addTable(List<List<String>> rows) {
        List<List<String>> cleaned = new ArrayList<>();
        for (List<String> row : rows) {
            List<String> r = new ArrayList<>();
            boolean any = false;
            for (String cell : row) {
                String c = normalize(cell == null ? "" : cell.replaceAll("\\s*\\r?\\n\\s*", " "));
                r.add(c);
                if (!c.isEmpty()) any = true;
            }
            if (any) cleaned.add(r);
        }
        if (!cleaned.isEmpty()) blocks.add(DocBlock.table(cleaned));
    }

    public List<DocBlock> getBlocks() { return Collections.unmodifiableList(blocks); }

    public List<DocBlock> getTables() {
        List<DocBlock> tables = new ArrayList<>();
        for (DocBlock b : blocks) if (b.isTable()) tables.add(b);
        return tables;
    }

    /** 표를 포함한 전체 텍스트를 줄 단위로 반환한다. */
    public List<String> lines() {
        List<String> lines = new ArrayList<>();
        for (DocBlock b : blocks) {
            for (String l : b.asPlainText().split("\n")) {
                if (!l.trim().isEmpty()) lines.add(l.trim());
            }
        }
        return lines;
    }

    public String fullText() {
        return String.join("\n", lines());
    }

    public boolean isEmpty() { return blocks.isEmpty(); }

    static String normalize(String s) {
        // 전각 공백, NBSP, 탭 → 공백 1개
        return s.replace('　', ' ').replace(' ', ' ').replace('\t', ' ')
                .replaceAll(" {2,}", " ").trim();
    }
}
