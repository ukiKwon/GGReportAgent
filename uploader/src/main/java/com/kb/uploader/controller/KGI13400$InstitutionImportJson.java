package com.kb.uploader.controller;

import com.kb.uploader.service.InstitutionService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.io.IOException;

@Controller
@RequestMapping("/institutions")
public class KGI13400$InstitutionImportJson {

    private final InstitutionService institutionService;

    public KGI13400$InstitutionImportJson(InstitutionService institutionService) {
        this.institutionService = institutionService;
    }

    @PostMapping("/import/json")
    public String execute(@RequestParam("file") MultipartFile file,
                          RedirectAttributes ra) throws IOException {
        institutionService.importFromJson(file.getBytes());
        ra.addFlashAttribute("message", "JSON 가져오기 완료. 미분류 파일 재처리 중...");
        return "redirect:/institutions";
    }
}
