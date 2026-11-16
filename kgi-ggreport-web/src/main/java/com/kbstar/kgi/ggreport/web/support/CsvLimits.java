package com.kbstar.kgi.ggreport.web.support;

import java.util.ArrayList;
import java.util.List;

/**
 * CSV 반입 상한 + RFC 4180 최소 리더 — 기관 반입(InstitutionCsv)과 사업계획 반입(PlanCsv)이 같이 쓴다(보안 검토 2026-11-16 조건 2).
 * 직접 만든 이유는 폐쇄망(라이브러리 반입 비용). 위반은 {@link InstitutionCsv.CsvFormatException}(호출부가 400) — 사유에 행 번호만 싣는다.
 */
public final class CsvLimits {

    public static final long MAX_FILE_BYTES = 5L * 1024 * 1024;
    public static final int MAX_DATA_ROWS = 5000;
    public static final int MAX_CELL_CHARS = 1000;
    public static final int MAX_COLUMNS = 64;

    /** 기관 반입: 따옴표 위치는 예전처럼 너그럽게(엑셀 산출물 호환). 미종결 따옴표·상한만 막는다. */
    public static final CsvLimits INSTITUTION = new CsvLimits(false);
    /** 사업계획 반입: 따옴표는 칸 맨 앞에서만 열고, 닫은 뒤에는 쉼표·줄바꿈만 온다. */
    public static final CsvLimits PLAN = new CsvLimits(true);

    private final boolean strictQuotes;

    private CsvLimits(boolean strictQuotes) {
        this.strictQuotes = strictQuotes;
    }

    public static void checkSize(long bytes) {
        if (bytes > MAX_FILE_BYTES) {
            throw new InstitutionCsv.CsvFormatException("파일이 너무 큽니다(5MB 이하).");
        }
    }

    /** 빈 줄을 뺀 기록 목록 + 각 기록의 원시 행 번호(빈 줄 포함, 머리행 = 0 → 첫 사업 행 = 1; 오류 사유의 'row N' 과 같은 기준). */
    public static final class Parsed {
        public final List<List<String>> records;
        public final List<Integer> rawRows;

        Parsed(List<List<String>> records, List<Integer> rawRows) {
            this.records = records;
            this.rawRows = rawRows;
        }
    }

    /** 줄 단위가 아니라 문자 단위로 훑는다(따옴표 안 줄바꿈). 완전히 빈 줄은 행으로 세지 않는다. */
    public List<List<String>> readAll(String text) {
        return parse(text).records;
    }

    /** {@link #readAll} 과 같되 원시 행 번호를 함께 준다 — 검사기가 리더와 같은 번호로 오류를 말하게. */
    public Parsed parse(String text) {
        List<List<String>> out = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        boolean closed = false;
        boolean any = false;
        int quoteRow = -1;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        quoted = false;
                        closed = true;
                    }
                } else {
                    field.append(c);
                }
                cellLimit(field, out.size());
                continue;
            }
            if (c == '"') {
                if (strictQuotes && (field.length() > 0 || closed)) {
                    throw bad(out.size(), "따옴표 위치가 올바르지 않습니다.");
                }
                quoted = true;
                any = true;
                quoteRow = out.size();
            } else if (c == ',') {
                endField(record, field, out.size());
                closed = false;
                any = true;
            } else if (c == '\r' || c == '\n') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    continue;   // CRLF 의 CR. 단독 CR 도 줄바꿈으로 본다
                }
                endField(record, field, out.size());
                closed = false;
                endRecord(out, record);
                record = new ArrayList<>();
                any = false;
            } else {
                if (strictQuotes && closed) {
                    throw bad(out.size(), "따옴표 위치가 올바르지 않습니다.");
                }
                field.append(c);
                any = true;
                cellLimit(field, out.size());
            }
        }
        if (quoted) {
            throw bad(quoteRow, "따옴표가 닫히지 않았습니다.");
        }
        if (any || field.length() > 0) {
            endField(record, field, out.size());
            endRecord(out, record);
        }
        List<List<String>> cleaned = new ArrayList<>();
        List<Integer> rawRows = new ArrayList<>();
        for (int k = 0; k < out.size(); k++) {
            List<String> r = out.get(k);
            if (r.size() == 1 && r.get(0).trim().isEmpty()) {
                continue;
            }
            cleaned.add(r);
            rawRows.add(k);
        }
        if (cleaned.size() > MAX_DATA_ROWS + 1) {
            throw new InstitutionCsv.CsvFormatException("행이 너무 많습니다(5,000행 이하).");
        }
        return new Parsed(cleaned, rawRows);
    }

    private static void endField(List<String> record, StringBuilder field, int row) {
        record.add(field.toString());
        field.setLength(0);
        if (record.size() > MAX_COLUMNS) {
            throw bad(row, "열이 너무 많습니다(64열 이하).");
        }
    }

    private static void endRecord(List<List<String>> out, List<String> record) {
        out.add(record);
        if (out.size() > MAX_DATA_ROWS * 2 + 1) {   // 빈 줄 포함 원시 행 상한(메모리 방어)
            throw new InstitutionCsv.CsvFormatException("행이 너무 많습니다(5,000행 이하).");
        }
    }

    private static void cellLimit(StringBuilder f, int row) {
        if (f.length() > MAX_CELL_CHARS) {
            throw bad(row, "칸이 너무 깁니다(1,000자 이하).");
        }
    }

    static InstitutionCsv.CsvFormatException bad(int row, String m) {
        return new InstitutionCsv.CsvFormatException(row <= 0 ? "header: " + m : "row " + row + ": " + m);
    }
}
