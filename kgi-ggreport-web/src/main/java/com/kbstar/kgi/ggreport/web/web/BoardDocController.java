package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocDocx;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 이사회 자료 양식: 목록·JSON 구조·docx 샘플. 저장은 없다(무상태). 값은 모두 가상. */
@RestController
@RequestMapping("/board-docs")
public class BoardDocController {

    /**
     * 새 메뉴 키를 만들지 않고 기존 '작업함' 조회 권한에 묶는다(제안값 — 허용 역할은 기획 확정 전).
     * 키를 바꾸려면 이 상수 한 줄이다.
     */
    static final String MENU_KEY = "tasks";

    private static final MediaType DOCX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    private final MenuGuard guard;

    public BoardDocController(MenuGuard guard) {
        this.guard = guard;
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest req) {
        guard.require(req, MENU_KEY);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", BoardDocSpec.DEFAULT_ID);
        item.put("name", BoardDocSpec.DEFAULT_NAME);
        List<Map<String, Object>> items = new ArrayList<>();
        items.add(item);
        return Collections.<String, Object>singletonMap("items", items);
    }

    @GetMapping("/{id}")
    public BoardDocSpec.Doc detail(@PathVariable("id") String id,
                                   @RequestParam(name = "values", defaultValue = "sample") String values,
                                   HttpServletRequest req) {
        guard.require(req, MENU_KEY);
        return load(id, values);
    }

    @GetMapping("/{id}/docx")
    public ResponseEntity<byte[]> docx(@PathVariable("id") String id,
                                       @RequestParam(name = "values", defaultValue = "sample") String values,
                                       HttpServletRequest req) {
        guard.require(req, MENU_KEY);
        BoardDocSpec.Doc doc = load(id, values);
        String name = "이사회자료_기본양식_" + ("blank".equals(values) ? "빈양식" : "샘플") + ".docx";
        String encoded;
        try {
            encoded = URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            throw new IllegalStateException(never);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"board_doc.docx\"; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(DOCX)
                .body(BoardDocDocx.build(doc));
    }

    private static BoardDocSpec.Doc load(String id, String values) {
        boolean sample;
        if ("sample".equals(values)) {
            sample = true;
        } else if ("blank".equals(values)) {
            sample = false;
        } else {
            throw ApiException.badRequest("values 는 sample 또는 blank 만 쓸 수 있습니다.");
        }
        BoardDocSpec.Doc doc = BoardDocSpec.find(id, sample);
        if (doc == null) {
            throw ApiException.notFound("양식을 찾을 수 없습니다.");
        }
        return doc;
    }
}
