package com.kb.uploader.controller;

import com.kb.uploader.service.InstitutionService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/institutions")
public class KGI13200$InstitutionDelete {

    private final InstitutionService institutionService;

    public KGI13200$InstitutionDelete(InstitutionService institutionService) {
        this.institutionService = institutionService;
    }

    @PostMapping("/{id}/delete")
    public String execute(@PathVariable Long id, RedirectAttributes ra) {
        institutionService.deleteById(id);
        ra.addFlashAttribute("message", "삭제 완료");
        return "redirect:/institutions";
    }
}
