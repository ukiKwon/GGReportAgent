package com.kb.uploader.controller;

import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/file-status")
public class KGI12300$FileStatusReject {

    private final UploadedFileMapper fileMapper;

    public KGI12300$FileStatusReject(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @PostMapping("/{id}/reject")
    public String execute(@PathVariable Long id, RedirectAttributes ra) {
        fileMapper.rejectById(id);
        ra.addFlashAttribute("message", "반려 처리되었습니다.");
        return "redirect:/file-status";
    }
}
