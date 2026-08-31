package com.kb.uploader.controller;

import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/file-status")
public class KGI12200$FileStatusDelete {

    private final UploadedFileMapper fileMapper;

    public KGI12200$FileStatusDelete(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @PostMapping("/{id}/delete")
    public String execute(@PathVariable Long id, RedirectAttributes ra) {
        fileMapper.softDeleteById(id);
        ra.addFlashAttribute("message", "파일이 목록에서 제거되었습니다.");
        return "redirect:/file-status";
    }
}
