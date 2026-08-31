package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;

import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기관 CSV 반입 파서 — Python {@code server/csv_import.parse_csv}.
 *
 * <p>⚠️ <b>{@link #HEADER_MAP} 은 수집기와의 계약이다.</b> 바깥 망에서 도는 수집기는
 * 이 저장소 코드를 임포트하지 않고 {@code corpus/inbox/} 에 파일만 떨군다
 * ({@code collector/SCHEMA.md}). 그 계약의 CSV 쪽 절반이 이 표이므로,
 * <b>고치려면 {@code SCHEMA.md} 를 먼저 읽고 양쪽을 함께 고쳐야 한다.</b>
 */
public final class InstitutionCsv {

    /** 한글 헤더 → 필드. 순서는 {@code SCHEMA.md} 의 표와 같게 둔다(대조하며 읽는다). */
    public static final Map<String, String> HEADER_MAP;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("기관명", "nameKo");
        m.put("기관구분", "type");
        m.put("지역코드", "regionCode");
        m.put("입찰주기", "term");
        m.put("지난입찰일", "lastBid");
        m.put("입찰예상일", "contractEnd");
        HEADER_MAP = java.util.Collections.unmodifiableMap(m);
    }

    private InstitutionCsv() {
    }

    /** 파일 내용이 계약을 어겼을 때. 호출부가 400 으로 바꾼다. */
    public static class CsvFormatException extends RuntimeException {
        public CsvFormatException(String message) {
            super(message);
        }
    }

    /**
     * 바이트를 행 목록으로. 원본과 같은 규칙 셋을 지킨다.
     *
     * <ol>
     *   <li><b>빈 칸은 "안 보낸 것"이다</b>(필드를 세팅하지 않는다). 그래야 upsert 의
     *       {@code COALESCE} 가 기존 값을 살린다 — 같은 표를 다시 올리는 것이 정상
     *       경로이므로, 빈 칸이 기존 값을 지우면 반입할수록 데이터가 줄어든다.</li>
     *   <li><b>{@code 기관명} 이 없으면 그 행에서 실패한다</b>(행 번호를 붙인다).
     *       이름은 upsert 의 키라서 없으면 무엇을 갱신할지 정할 수 없다.</li>
     *   <li>{@code 입찰주기} 는 정수다. 숫자가 아니면 행 번호와 함께 실패한다.</li>
     * </ol>
     */
    public static List<InstitutionImportRow> parse(byte[] raw) {
        String text = decode(raw);
        List<List<String>> records = CsvReader.readAll(text);
        if (records.isEmpty()) {
            return new ArrayList<>();
        }

        List<String> header = records.get(0);
        List<InstitutionImportRow> rows = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            List<String> record = records.get(i);
            // 원본 `csv.DictReader` 는 헤더 다음 행부터 1 로 센다.
            rows.add(toRow(header, record, i));
        }
        return rows;
    }

    private static InstitutionImportRow toRow(List<String> header, List<String> record, int rowNum) {
        InstitutionImportRow row = new InstitutionImportRow();
        boolean hasName = false;

        for (Map.Entry<String, String> entry : HEADER_MAP.entrySet()) {
            String value = cell(header, record, entry.getKey());
            if (value.isEmpty()) {
                continue;
            }
            String field = entry.getValue();
            if ("nameKo".equals(field)) {
                row.setNameKo(value);
                hasName = true;
            } else if ("type".equals(field)) {
                row.setType(value);
            } else if ("regionCode".equals(field)) {
                row.setRegionCode(value);
            } else if ("term".equals(field)) {
                row.setTerm(parseTerm(value, rowNum));
            } else if ("lastBid".equals(field)) {
                row.setLastBid(value);
            } else if ("contractEnd".equals(field)) {
                row.setContractEnd(value);
            }
        }

        if (!hasName) {
            throw new CsvFormatException("row " + rowNum + ": 기관명이 비어 있습니다");
        }
        return row;
    }

    private static Integer parseTerm(String value, int rowNum) {
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException exc) {
            throw new CsvFormatException("row " + rowNum + ": 입찰주기가 정수가 아닙니다 (" + value + ")");
        }
    }

    private static String cell(List<String> header, List<String> record, String koHeader) {
        int idx = header.indexOf(koHeader);
        if (idx < 0 || idx >= record.size()) {
            return "";
        }
        String v = record.get(idx);
        return v == null ? "" : v.trim();
    }

    /**
     * ⚠️ <b>{@code cp949} 폴백을 지우지 말 것.</b> 이 표는 사람이 한국어 윈도우
     * 엑셀에서 "CSV로 저장"해 만든다 — 그 결과물이 UTF-8 이 아니라 {@code cp949}
     * 인 경우가 흔하다. UTF-8 만 읽으면 한글 기관명이 전부 깨진 채 반입돼
     * <b>중복 기관이 조용히 생긴다</b>(이름이 키다).
     *
     * <p>UTF-8 BOM({@code utf-8-sig})도 잘라낸다 — 남으면 첫 헤더가
     * {@code "﻿기관명"} 이 되어 이름 열을 통째로 못 찾는다.
     */
    private static String decode(byte[] raw) {
        byte[] bytes = stripBom(raw);
        try {
            CharsetDecoder strict = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            return strict.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (java.nio.charset.CharacterCodingException notUtf8) {
            return new String(bytes, cp949());
        }
    }

    /** JDK 8 표준 이름은 {@code x-windows-949} 다. 없는 JVM 이면 {@code EUC-KR} 로 내려간다. */
    private static Charset cp949() {
        for (String name : new String[]{"x-windows-949", "MS949", "EUC-KR"}) {
            if (Charset.isSupported(name)) {
                return Charset.forName(name);
            }
        }
        return StandardCharsets.UTF_8;
    }

    private static byte[] stripBom(byte[] raw) {
        if (raw.length >= 3 && (raw[0] & 0xFF) == 0xEF && (raw[1] & 0xFF) == 0xBB && (raw[2] & 0xFF) == 0xBF) {
            byte[] out = new byte[raw.length - 3];
            System.arraycopy(raw, 3, out, 0, out.length);
            return out;
        }
        return raw;
    }

    /**
     * RFC 4180 최소 구현 — 따옴표 · 이스케이프({@code ""}) · 필드 안 줄바꿈까지.
     *
     * <p>직접 만든 이유는 폐쇄망이다. CSV 라이브러리 하나를 위해 반입 절차를 한 번
     * 더 돌리는 것보다, 계약이 고정된 표 하나를 읽는 코드를 두는 편이 싸다
     * (설계 §2 "망" 행).
     */
    static final class CsvReader {

        private CsvReader() {
        }

        static List<List<String>> readAll(String text) {
            // 줄 단위로 읽지 않는다 — 따옴표 안에 줄바꿈이 들어올 수 있어 문자 단위로 훑는다.
            List<List<String>> out = new ArrayList<>();
            List<String> record = new ArrayList<>();
            StringBuilder field = new StringBuilder();
            boolean quoted = false;
            boolean any = false;

            for (int i = 0; i < text.length(); i++) {
                char c = text.charAt(i);
                if (quoted) {
                    if (c == '"') {
                        if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                            field.append('"');
                            i++;
                        } else {
                            quoted = false;
                        }
                    } else {
                        field.append(c);
                    }
                    continue;
                }
                if (c == '"') {
                    quoted = true;
                    any = true;
                } else if (c == ',') {
                    record.add(field.toString());
                    field.setLength(0);
                    any = true;
                } else if (c == '\r') {
                    // CRLF 의 CR 은 버린다. 단독 CR 도 줄바꿈으로 본다.
                    if (i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                        continue;
                    }
                    record.add(field.toString());
                    field.setLength(0);
                    out.add(record);
                    record = new ArrayList<>();
                    any = false;
                } else if (c == '\n') {
                    record.add(field.toString());
                    field.setLength(0);
                    out.add(record);
                    record = new ArrayList<>();
                    any = false;
                } else {
                    field.append(c);
                    any = true;
                }
            }
            if (any || field.length() > 0) {
                record.add(field.toString());
                out.add(record);
            }
            // 완전히 빈 줄은 행으로 세지 않는다(엑셀이 끝에 붙이는 빈 줄).
            List<List<String>> cleaned = new ArrayList<>();
            for (List<String> r : out) {
                if (r.size() == 1 && r.get(0).trim().isEmpty()) {
                    continue;
                }
                cleaned.add(r);
            }
            return cleaned;
        }
    }
}
