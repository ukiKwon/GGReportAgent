package com.kb.uploader.controller;

import com.kb.uploader.service.FileStorageService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/file-status/cleanup-dirs")
public class KGI12500$CleanupDirs {

    private final FileStorageService storageService;

    public KGI12500$CleanupDirs(FileStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping
    public String execute(RedirectAttributes ra) {
        int deleted = storageService.cleanEmptyClassifiedDirs();
        ra.addFlashAttribute("message", "빈 폴더 " + deleted + "개 정리 완료.");
        return "redirect:/file-status/classified";
    }
}
