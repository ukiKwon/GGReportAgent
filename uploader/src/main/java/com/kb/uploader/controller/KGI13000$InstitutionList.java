package com.kb.uploader.controller;

import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.InstitutionService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/institutions")
public class KGI13000$InstitutionList {

    private final InstitutionService institutionService;
    private final UploadedFileMapper fileMapper;

    public KGI13000$InstitutionList(InstitutionService institutionService,
                                     UploadedFileMapper fileMapper) {
        this.institutionService = institutionService;
        this.fileMapper = fileMapper;
    }

    @GetMapping
    public String execute(Model model) {
        model.addAttribute("institutions", institutionService.findAll());
        model.addAttribute("unclassifiedCount", fileMapper.countByStatus("UNCLASSIFIED"));
        return "institution";
    }
}
