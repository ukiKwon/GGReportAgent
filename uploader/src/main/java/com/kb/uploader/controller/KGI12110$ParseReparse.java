package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.service.DocumentParseService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Optional;

/**
 * 수동 재파싱 (2026-09-23 신설).
 *
 * <p>종전의 5분 주기 재분류 배치를 대신한다. 기관 정보를 고친 뒤 다시 돌리고 싶을 때 누른다.
 * 감사 컬럼의 시스템사용자번호는 SystemUserInterceptor 가 이 클래스명에서 뽑아 넣는다.
 */
@Controller
@RequestMapping("/parse-status")
public class KGI12110$ParseReparse {

    private final DocumentParseService parseService;

    public KGI12110$ParseReparse(DocumentParseService parseService) {
        this.parseService = parseService;
    }

    @PostMapping("/{id}/reparse")
    public String execute(@PathVariable Long id, RedirectAttributes ra) {
        Optional<UploadedFile> result = parseService.reparse(id);
        if (!result.isPresent()) {
            ra.addFlashAttribute("error", "파일을 찾을 수 없습니다 (id=" + id + ")");
        } else if ("SUCCESS".equals(result.get().getParseStatus())) {
            ra.addFlashAttribute("message", "재파싱 완료: " + result.get().getOriginalName()
                    + " → " + result.get().getOutputFileName());
        } else {
            ra.addFlashAttribute("error", "재파싱 실패: " + result.get().getOriginalName()
                    + " — " + result.get().getParseMessage());
        }
        return "redirect:/parse-status";
    }
}
