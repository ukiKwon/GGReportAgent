package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFill;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import com.kbstar.kgi.ggreport.web.dto.BoardWriteIn;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.Semaphore;

/**
 * 이사회 자료 작성(무상태): 엑셀 업로드 → 매핑 칸 값, 화면 값 → 초안 워드. 원본 바이트는 요청 끝에 버린다.
 * 개인정보: 응답에 실리는 범위(지도 range) 안에서 걸리면 거부, 밖이면 경고(종류·칸 수·좌표만, 값 없음) — 2026-11-02 확정.
 * 로그에는 예외 클래스 이름만 남긴다(POI 메시지·경로 없음).
 */
@Service
public class BoardWriteService {

    private static final Logger log = LoggerFactory.getLogger(BoardWriteService.class);
    static final long MB = 1024L * 1024;
    static final int MAX_DRAFT_TABLES = 20;
    static final int MAX_DRAFT_CELLS = 500;
    static final int MAX_PII_CELLS = 20;

    private final BoardFormService forms;
    private final BoardExcelMap map;
    private final int maxMb;
    private final int concurrency;
    private final XlsxBook.Limits limits;
    private final Semaphore slots;

    public BoardWriteService(BoardFormService forms, BoardExcelMap map,
                             @Value("${ggreport.board-write.max-mb:5}") int maxMb,
                             @Value("${ggreport.board-write.max-unpacked-entry-mb:20}") int entryMb,
                             @Value("${ggreport.board-write.max-unpacked-total-mb:40}") int totalMb,
                             @Value("${ggreport.board-write.max-cells:200000}") int maxCells,
                             @Value("${ggreport.board-write.concurrency:2}") int concurrency) {
        this.forms = forms;
        this.map = map;
        this.maxMb = maxMb;
        this.concurrency = concurrency;
        this.limits = new XlsxBook.Limits(entryMb * MB, totalMb * MB, maxCells);
        this.slots = new Semaphore(concurrency);
    }

    public int getMaxMb() { return maxMb; }

    int availableSlots() { return slots.availablePermits(); }

    int getConcurrency() { return concurrency; }

    public Map<String, Object> excelMap() {
        List<Map<String, Object>> tables = new ArrayList<>();
        for (BoardExcelMap.TableMap t : map.tables()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ref", t.getRef());
            m.put("sheet", t.getSheet());
            m.put("range", t.getRange() == null ? null : t.getRange().formatAsString());
            m.put("kind", t.isNamed() ? "named" : "cell_range");
            tables.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mapping_ver", map.getMappingVer());
        out.put("max_mb", maxMb);
        out.put("tables", tables);
        return out;
    }

    public Map<String, Object> upload(String empNo, String id, String version, MultipartFile file) {
        BoardFormService.WriteTarget target = forms.formForWrite(empNo, id, version);
        if (file == null || file.isEmpty()) {
            throw fail(400, "EMPTY_FILE", "빈 파일입니다. 엑셀(.xlsx) 파일을 골라 주세요.");
        }
        if (file.getSize() > maxMb * MB) {
            Map<String, Object> d = detail("FILE_TOO_LARGE", "파일이 너무 큽니다. " + maxMb + "MB 이하만 올릴 수 있습니다.");
            d.put("max_mb", maxMb);
            throw ApiException.withDetail(413, d);
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (name.endsWith(".xlsm")) {
            throw fail(422, "MACRO", "매크로가 든 파일은 올릴 수 없습니다. 매크로 없는 .xlsx 로 저장해 주세요.");
        }
        if (!name.endsWith(".xlsx")) {
            throw fail(415, "NOT_XLSX", "엑셀(.xlsx) 파일만 올릴 수 있습니다. 암호가 걸린 파일은 암호를 풀고 저장해 주세요.");
        }
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw fail(422, "BROKEN", MSG_BROKEN);
        }
        if (!slots.tryAcquire()) {
            throw fail(503, "BUSY", "다른 작업을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.");
        }
        try {
            try (XlsxBook book = open(data)) {
                return process(target, book);
            }
        } finally {
            slots.release();
        }
    }

    private XlsxBook open(byte[] data) {
        try {
            return XlsxBook.open(data, limits);
        } catch (XlsxBook.Rejected r) {
            if (r.cause != null) {
                log.warn("엑셀 열기 실패: {}", r.cause);
            }
            throw fail(r.status, r.code, message(r.code));
        }
    }

    private Map<String, Object> process(BoardFormService.WriteTarget target, XlsxBook book) {
        List<XlsxBook.PiiHit> inside = new ArrayList<>();
        List<XlsxBook.PiiHit> outside = new ArrayList<>();
        for (XlsxBook.PiiHit h : book.scanPii()) {
            (map.covers(h.sheet, h.row, h.col) ? inside : outside).add(h);
        }
        if (!inside.isEmpty()) {
            throw ApiException.withDetail(422, pii(detail("PII_DETECTED",
                    "작성에 쓰는 칸에 개인정보로 보이는 값이 있어 처리하지 않았습니다. 해당 칸을 지우고 다시 올려 주세요."), inside));
        }
        List<String> refs = new ArrayList<>();
        for (BoardDocSpec.Table t : target.getDoc().getTables()) {
            if (map.table(t.getId()) != null) {
                refs.add(t.getId());
            }
        }
        List<Map<String, Object>> reasons = BoardExcelFill.structure(book, map, refs);
        if (!reasons.isEmpty()) {
            Map<String, Object> d = detail("STRUCTURE_MISMATCH",
                    "엑셀에 필요한 시트가 없어 처리하지 않았습니다. 시트 이름을 확인해 주세요.");
            d.put("reasons", reasons);
            throw ApiException.withDetail(422, d);
        }
        Map<String, Object> filled = BoardExcelFill.fill(book, map, target.getDoc());
        List<Map<String, Object>> warnings = new ArrayList<>();
        List<String> labelRefs = BoardExcelFill.labelMismatchRefs(filled);
        if (!labelRefs.isEmpty()) {
            Map<String, Object> lw = detail("LABEL_MISMATCH",
                    "엑셀의 머리글이 예상과 달라 해당 표의 칸을 직접 확인해야 합니다. 대부분 다르면 값을 채우지 않았습니다.");
            lw.put("tables", labelRefs);
            warnings.add(lw);
        }
        if (book.hasExternalLinks()) {
            warnings.add(detail("EXTERNAL_LINK", "다른 파일을 참조하는 연결이 있습니다. 값은 마지막으로 저장된 값입니다."));
        }
        if (!outside.isEmpty()) {
            warnings.add(pii(detail("PII_OUTSIDE_RANGE",
                    "작성에 쓰지 않는 칸에 개인정보로 보이는 값이 있습니다(응답에는 싣지 않았습니다)."), outside));
        }
        Map<String, Object> form = new LinkedHashMap<>();
        form.put("id", target.getId());
        form.put("version", target.getVersion());
        form.put("name", target.getName());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("form", form);
        out.put("mapping_ver", map.getMappingVer());
        out.putAll(filled);
        out.put("warnings", warnings);
        return out;
    }

    public BoardDocSpec.Doc draft(String empNo, String id, BoardWriteIn in) {
        if (in == null || in.getTables() == null || in.getTables().size() > MAX_DRAFT_TABLES) {
            throw fail(400, "BAD_REQUEST", "표 목록(tables)이 올바르지 않습니다.");
        }
        BoardFormService.WriteTarget target = forms.formForWrite(empNo, id,
                in.getVersion() == null ? null : String.valueOf(in.getVersion()));
        Map<String, Map<String, String>> values = new LinkedHashMap<>();
        Map<String, Integer> kinds = new LinkedHashMap<>();
        for (BoardWriteIn.TableIn t : in.getTables()) {
            if (t == null || t.getRef() == null || values.containsKey(t.getRef())
                    || (t.getCells() != null && t.getCells().size() > MAX_DRAFT_CELLS)) {
                throw fail(400, "BAD_REQUEST", "표 목록(tables)이 올바르지 않습니다.");
            }
            Map<String, String> cells = t.getCells() == null ? new LinkedHashMap<String, String>() : t.getCells();
            for (String v : cells.values()) {
                if (v != null && v.length() > BoardDocSpec.MAX_CELL) {   // 개인정보 정규식은 길이에 비례해 느려지므로 먼저 막는다(보안 점검)
                    throw fail(400, "BAD_VALUE", "칸 문구는 " + BoardDocSpec.MAX_CELL + "자 이하로 입력해 주세요.");
                }
                for (Pii.Finding f : Pii.scan(v)) {
                    Integer n = kinds.get(f.getKind());
                    kinds.put(f.getKind(), n == null ? 1 : n + 1);
                }
            }
            values.put(t.getRef(), cells);
        }
        if (!kinds.isEmpty()) {
            Map<String, Object> d = detail("PII_DETECTED", "개인정보로 보이는 값이 있어 초안을 만들지 않았습니다.");
            d.put("kinds", kindList(kinds));
            throw ApiException.withDetail(422, d);
        }
        try {
            return BoardDocSpec.withValues(target.getDoc(), values);
        } catch (BoardDocSpec.EditException e) {
            throw fail(400, "BAD_VALUE", e.getMessage());
        }
    }

    // ── 내부 ──

    static final String MSG_BROKEN = "파일을 읽을 수 없습니다. 엑셀에서 다시 저장한 뒤 올려 주세요.";

    private static String message(String code) {
        switch (code) {
            case "NOT_XLSX": return "엑셀(.xlsx) 파일만 올릴 수 있습니다. 암호가 걸린 파일은 암호를 풀고 저장해 주세요.";
            case "MACRO": return "매크로가 든 파일은 올릴 수 없습니다. 매크로 없는 .xlsx 로 저장해 주세요.";
            case "TOO_LARGE_UNPACKED": return "파일 내용이 너무 큽니다(압축을 푼 크기 기준).";
            case "DUPLICATE_ENTRY": return "파일 구조가 올바르지 않습니다(중복 항목).";
            case "TOO_MANY_CELLS": return "칸이 너무 많습니다. 필요한 시트만 남겨 다시 올려 주세요.";
            default: return MSG_BROKEN;
        }
    }

    /**
     * count = 걸린 <b>칸</b> 수(한 칸에 여러 종류가 있어도 1). 시트 이름 적발은 칸이 아니므로 count 에서 빼고
     * 있을 때만 sheet_name_count 로 따로 싣는다. kinds[].count = 그 종류가 걸린 위치(칸·시트 이름) 수.
     * cells = 좌표(시트 이름은 "#순번!(시트 이름)") 최대 {@value #MAX_PII_CELLS}개.
     */
    private static Map<String, Object> pii(Map<String, Object> d, List<XlsxBook.PiiHit> hits) {
        Map<String, Integer> kinds = new LinkedHashMap<>();
        List<String> cells = new ArrayList<>();
        Set<String> cellKeys = new HashSet<>();
        Set<String> sheetNames = new HashSet<>();
        for (XlsxBook.PiiHit h : hits) {
            Integer n = kinds.get(h.kind);
            kinds.put(h.kind, n == null ? 1 : n + 1);
            if (h.row < 0) {
                sheetNames.add(h.sheet);
            } else {
                cellKeys.add(h.sheet + "\u0000" + h.row + ":" + h.col);
            }
            if (cells.size() < MAX_PII_CELLS && !cells.contains(h.ref())) {
                cells.add(h.ref());
            }
        }
        d.put("kinds", kindList(kinds));
        d.put("count", cellKeys.size());
        if (!sheetNames.isEmpty()) {
            d.put("sheet_name_count", sheetNames.size());
        }
        d.put("cells", cells);
        return d;
    }

    private static List<Map<String, Object>> kindList(Map<String, Integer> kinds) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Integer> e : kinds.entrySet()) {
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("kind", e.getKey());
            k.put("count", e.getValue());
            out.add(k);
        }
        return out;
    }

    static Map<String, Object> detail(String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return d;
    }

    static ApiException fail(int status, String code, String message) {
        return ApiException.withDetail(status, detail(code, message));
    }
}
