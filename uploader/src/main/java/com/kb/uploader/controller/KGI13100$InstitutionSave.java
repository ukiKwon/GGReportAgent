package com.kb.uploader.controller;

import com.kb.uploader.service.InstitutionService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/institutions")
public class KGI13100$InstitutionSave {

    private final InstitutionService institutionService;

    public KGI13100$InstitutionSave(InstitutionService institutionService) {
        this.institutionService = institutionService;
    }

    @PostMapping
    public String execute(@RequestParam String name,
                          @RequestParam String category,
                          RedirectAttributes ra) {
        institutionService.save(name.trim(), category.trim());
        ra.addFlashAttribute("message", "기관이 등록되었습니다: " + name);
        return "redirect:/institutions";
    }
}
