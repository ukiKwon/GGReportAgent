package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.DocumentParseService;
import com.kb.uploader.service.InstitutionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Optional;

/**
 * 기관을 지정해 다시 분류한다 (2026-09-23 파싱 전환에 맞춰 동작 교체).
 *
 * <p>종전에는 파일을 {@code classified/} 폴더로 <b>옮기는</b> 것이 분류였다. 이제는 폴더를 옮기지
 * 않으므로 이 화면의 일은 <b>기관을 기관 테이블에 등록하고 그 문서를 재파싱</b>하는 것이다.
 * 재파싱하면 InstitutionMatcher 가 방금 등록한 기관을 찾아 기관분류가 확정되고,
 * 산출물 파일명도 {@code {날짜}_{기관분류}_{기관명}_…} 으로 다시 만들어진다.
 *
 * <p>⚠️ 기관명만 바꾸고 재파싱을 하지 않으면 산출물 파일명이 옛 기관명 그대로 남아
 * DB 와 파일이 어긋난다. 그래서 두 가지를 한 번에 한다.
 */
@Controller
@RequestMapping("/file-status")
public class KGI12100$FileStatusClassify {

    private static final Logger log = LoggerFactory.getLogger(KGI12100$FileStatusClassify.class);

    private final UploadedFileMapper fileMapper;
    private final InstitutionService institutionService;
    private final DocumentParseService parseService;

    public KGI12100$FileStatusClassify(UploadedFileMapper fileMapper,
                                       InstitutionService institutionService,
                                       DocumentParseService parseService) {
        this.fileMapper = fileMapper;
        this.institutionService = institutionService;
        this.parseService = parseService;
    }

    @PostMapping("/{id}/classify")
    public String execute(@PathVariable Long id,
                          @RequestParam String category,
                          @RequestParam(defaultValue = "") String institution,
                          RedirectAttributes ra) {
        Optional<UploadedFile> found = fileMapper.findById(id);
        if (!found.isPresent()) {
            ra.addFlashAttribute("error", "파일을 찾을 수 없습니다 (id=" + id + ")");
            return "redirect:/file-status/classified";
        }
        String name = institution.trim();
        if (name.isEmpty()) {
            ra.addFlashAttribute("error", "기관명을 입력해 주세요.");
            return "redirect:/file-status/classified";
        }

        try {
            institutionService.save(name, category.trim());
            Optional<UploadedFile> result = parseService.reparse(id);
            if (result.isPresent() && result.get().isParsed()) {
                ra.addFlashAttribute("message",
                        "기관 등록 후 재파싱 완료: " + name + " → " + result.get().getOutputFileName());
            } else {
                // ⚠️ 실패 사유는 컬럼이 없어 저장하지 않는다(스키마 무변경안) — 로그를 봐야 한다.
                ra.addFlashAttribute("error",
                        "기관은 등록했으나 재파싱에 실패했습니다 — 사유는 서버 로그를 확인하세요");
            }
        } catch (Exception e) {
            log.warn("기관 지정 재파싱 실패: id={}", id, e);
            ra.addFlashAttribute("error", "처리 실패: " + e.getMessage());
        }
        return "redirect:/file-status/classified";
    }
}
