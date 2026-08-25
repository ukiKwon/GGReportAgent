package com.kb.uploader.controller;

import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/upload")
public class KGI11000$UploadView {

    private final UploadedFileMapper fileMapper;

    public KGI11000$UploadView(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping
    public String execute(Model model) {
        model.addAttribute("unclassifiedCount", fileMapper.countByStatus("UNCLASSIFIED"));
        return "upload";
    }
}
