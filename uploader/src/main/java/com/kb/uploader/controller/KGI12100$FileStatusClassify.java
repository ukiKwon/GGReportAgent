package com.kb.uploader.controller;

import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/file-status")
public class KGI12100$FileStatusClassify {

    private static final Logger log = LoggerFactory.getLogger(KGI12100$FileStatusClassify.class);

    private final UploadedFileMapper fileMapper;
    private final FileStorageService storageService;

    public KGI12100$FileStatusClassify(UploadedFileMapper fileMapper,
                                       FileStorageService storageService) {
        this.fileMapper = fileMapper;
        this.storageService = storageService;
    }

    @PostMapping("/{id}/classify")
    public String execute(@PathVariable Long id,
                          @RequestParam String category,
                          @RequestParam(defaultValue = "") String institution,
                          @RequestParam(defaultValue = "") String year,
                          RedirectAttributes ra) {
        fileMapper.findById(id).ifPresent(file -> {
            if (!institution.trim().isEmpty()) {
                file.setInstitutionName(institution.trim());
            }
            if (!year.trim().isEmpty()) {
                file.setYear(year.trim());
            }
            String instName = file.getInstitutionName() != null ? file.getInstitutionName() : "알수없음";
            try {
                java.nio.file.Path source = java.nio.file.Paths.get(file.getStoredPath());
                java.nio.file.Path dest = storageService.moveToClassified(
                        source,
                        category,
                        file.getYear() != null ? file.getYear() : "미확인",
                        instName
                );
                file.classify(category, dest.toString());
                fileMapper.update(file);
            } catch (Exception e) {
                log.warn("수동 분류 처리 실패: {}", file.getOriginalName(), e);
            }
        });
        ra.addFlashAttribute("message", "분류 처리 완료");
        return "redirect:/file-status";
    }
}
