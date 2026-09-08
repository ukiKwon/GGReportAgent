package com.kb.uploader.controller;

import com.kb.uploader.code.InstitutionCategory;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

@Controller
@RequestMapping("/file-status")
public class KGI12000$FileStatusList {


    private final UploadedFileMapper fileMapper;

    public KGI12000$FileStatusList(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping
    public String execute(Model model) {
        List<UploadedFile> unclassified = fileMapper.findByStatus("UNCLASSIFIED");
        List<UploadedFile> unknownFiles = fileMapper.findClassifiedByUnknownInstitution();
        model.addAttribute("files", unclassified);
        model.addAttribute("unknownFiles", unknownFiles);
        model.addAttribute("categories", InstitutionCategory.names());
        model.addAttribute("unclassifiedCount", (long) unclassified.size());
        return "file-status";
    }
}
