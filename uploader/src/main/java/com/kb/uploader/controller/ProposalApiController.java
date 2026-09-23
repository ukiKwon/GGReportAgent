package com.kb.uploader.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kb.uploader.code.DocumentType;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 입찰제안서 조회 REST API (외부 agent 호출용, 인증 없음).
 *
 * <p>같은 저장소의 {@code FileSearchApiController} 와 같은 방식이라 화면번호를 쓰지 않는다.
 */
@RestController
@RequestMapping("/api/proposals")
public class ProposalApiController {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final UploadedFileMapper fileMapper;
    private final ObjectMapper mapper;

    public ProposalApiController(UploadedFileMapper fileMapper, ObjectMapper mapper) {
        this.fileMapper = fileMapper;
        this.mapper = mapper;
    }

    /** 파싱에 성공한 입찰제안서 목록. 모든 조건은 선택. */
    @GetMapping
    public Map<String, Object> search(@RequestParam(required = false) String institution,
                                      @RequestParam(required = false) String year,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        // ⚠️ Oracle 은 빈 문자열을 NULL 로 취급한다. 조건이 비면 null 을 넘긴다(기존 search 와 같은 규칙).
        String inst = trimToNull(institution);
        String docDate = trimToNull(year);

        List<UploadedFile> rows = fileMapper.searchProposals(inst, docDate, (p - 1) * s, s);
        long total = fileMapper.countProposals(inst, docDate);

        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (UploadedFile f : rows) items.add(summary(f));

        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("total", total);
        body.put("page", p);
        body.put("size", s);
        body.put("totalPages", (int) Math.ceil((double) total / s));
        body.put("items", items);
        return body;
    }

    /** 제안서 한 건의 파싱 JSON 전체 (slides 포함). */
    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) throws IOException {
        Optional<UploadedFile> found = fileMapper.findById(id);
        if (!found.isPresent() || !DocumentType.BID_PROPOSAL.equals(found.get().getDocType())) {
            return error(HttpStatus.NOT_FOUND, "입찰제안서를 찾을 수 없습니다 (id=" + id + ")");
        }
        UploadedFile f = found.get();
        if (!"SUCCESS".equals(f.getParseStatus()) || f.getOutputPath() == null) {
            return error(HttpStatus.NOT_FOUND, "파싱에 성공하지 않은 제안서입니다 (id=" + id + ", 상태="
                    + f.getParseStatus() + ")");
        }
        Path json = Paths.get(f.getOutputPath());
        if (!Files.exists(json)) {
            return error(HttpStatus.NOT_FOUND, "파싱 JSON 파일이 없습니다: " + json.getFileName());
        }
        JsonNode parsed = mapper.readTree(json.toFile());
        ObjectNode body = mapper.createObjectNode();
        body.put("id", f.getId());
        body.put("institutionName", f.getInstitutionName());
        body.put("institutionCategory", f.getCategoryLabel());
        body.put("year", f.getDocDate());
        body.put("jsonFileName", json.getFileName().toString());
        body.setAll((ObjectNode) parsed);
        return ResponseEntity.ok(body);
    }

    private static Map<String, Object> summary(UploadedFile f) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", f.getId());
        m.put("fileName", f.getOriginalName());
        m.put("institutionName", f.getInstitutionName());
        m.put("institutionCategory", f.getCategoryLabel());
        m.put("year", f.getDocDate());
        m.put("totalSlides", f.getPageCount());
        m.put("jsonFileName", f.getOutputFileName());
        m.put("uploadedAt", f.getUploadedAt() != null ? f.getUploadedAt().format(TS) : null);
        m.put("parsedAt", f.getParsedAt() != null ? f.getParsedAt().format(TS) : null);
        return m;
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Collections.singletonMap("error", message));
    }

    private static String trimToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
