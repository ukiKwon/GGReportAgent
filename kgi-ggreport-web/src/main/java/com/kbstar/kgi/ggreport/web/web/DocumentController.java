package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.DocumentResponse;
import com.kbstar.kgi.ggreport.web.service.DocumentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 원문 열람 — 지식 탭이 검색 결과의 파일 전체를 보여주기 위한 창구. 골든 {@code 06}.
 *
 * <p>{@code path} 는 필수이고 빈 문자열도 안 된다 — 경로 가드는
 * {@link DocumentService} 가 맡는다.
 */
@RestController
@RequestMapping("/documents")
public class DocumentController {

    private final DocumentService documents;

    public DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @GetMapping
    public DocumentResponse get(@RequestParam("path") String path) {
        if (path == null || path.isEmpty()) {
            throw ApiException.badRequest("path가 비어 있습니다");
        }
        return documents.read(path);
    }
}
