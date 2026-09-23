package com.kb.uploader.controller;

import com.kb.uploader.code.DocumentType;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
 * 입찰공고문(RFP) 요약 조회 REST API (외부 agent 호출용, 인증 없음).
 *
 * <p>제안서는 산출물이 JSON 이라 그대로 내려주면 되지만 RFP 산출물은 Markdown 이라 쓰는 쪽이 갈린다.
 * 그래서 같은 주소에서 두 가지로 준다.
 * <ul>
 *   <li>기본(JSON): 메타데이터 + {@code markdown} 필드에 원문 문자열</li>
 *   <li>{@code ?format=text} 또는 {@code Accept: text/markdown}: md 원문 그대로 (LLM 입력용)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/rfps")
public class RfpApiController {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final MediaType MARKDOWN = new MediaType("text", "markdown", StandardCharsets.UTF_8);

    private final UploadedFileMapper fileMapper;

    public RfpApiController(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    /** 파싱에 성공한 RFP 목록. 모든 조건은 선택. */
    @GetMapping
    public Map<String, Object> search(@RequestParam(required = false) String institution,
                                      @RequestParam(required = false) String noticeDate,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        String inst = trimToNull(institution);
        String docDate = trimToNull(noticeDate);

        List<UploadedFile> rows = fileMapper.searchRfps(inst, docDate, (p - 1) * s, s);
        long total = fileMapper.countRfps(inst, docDate);

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

    /**
     * RFP 한 건의 요약.
     *
     * @param format {@code json}(기본) 이면 메타데이터 + markdown 필드, {@code text} 면 md 원문
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id,
                                    @RequestParam(required = false) String format,
                                    @RequestHeader(name = HttpHeaders.ACCEPT, required = false) String accept)
            throws IOException {
        Optional<UploadedFile> found = fileMapper.findById(id);
        if (!found.isPresent() || !DocumentType.RFP.equals(found.get().getDocType())) {
            return error(HttpStatus.NOT_FOUND, "입찰공고문(RFP)을 찾을 수 없습니다 (id=" + id + ")");
        }
        UploadedFile f = found.get();
        if (!"SUCCESS".equals(f.getParseStatus()) || f.getOutputPath() == null) {
            return error(HttpStatus.NOT_FOUND, "파싱에 성공하지 않은 공고문입니다 (id=" + id + ", 상태="
                    + f.getParseStatus() + ")");
        }
        Path md = Paths.get(f.getOutputPath());
        if (!Files.exists(md)) {
            return error(HttpStatus.NOT_FOUND, "요약 MD 파일이 없습니다: " + md.getFileName());
        }
        String markdown = new String(Files.readAllBytes(md), StandardCharsets.UTF_8);

        if (wantsRawMarkdown(format, accept)) {
            return ResponseEntity.ok().contentType(MARKDOWN).body(markdown);
        }
        Map<String, Object> body = summary(f);
        body.put("markdown", markdown);
        return ResponseEntity.ok(body);
    }

    /** {@code ?format=text} 가 우선이고, 없으면 Accept 헤더가 md/plain 만 받겠다고 한 경우. */
    private static boolean wantsRawMarkdown(String format, String accept) {
        if (StringUtils.hasText(format)) {
            String f = format.trim().toLowerCase();
            return "text".equals(f) || "md".equals(f) || "markdown".equals(f);
        }
        if (!StringUtils.hasText(accept)) return false;
        String a = accept.toLowerCase();
        if (a.contains("application/json") || a.contains("*/*")) return false;
        return a.contains("text/markdown") || a.contains("text/plain");
    }

    private static Map<String, Object> summary(UploadedFile f) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", f.getId());
        m.put("fileName", f.getOriginalName());
        m.put("institutionName", f.getInstitutionName());
        m.put("institutionCategory", f.getCategoryLabel());
        m.put("noticeDate", f.getDocDate());
        m.put("pageCount", f.getPageCount());
        m.put("mdFileName", f.getOutputFileName());
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
