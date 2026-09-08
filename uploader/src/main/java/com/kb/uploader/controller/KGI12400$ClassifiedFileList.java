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
@RequestMapping("/file-status/classified")
public class KGI12400$ClassifiedFileList {


    private final UploadedFileMapper fileMapper;

    public KGI12400$ClassifiedFileList(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping
    public String execute(Model model) {
        List<UploadedFile> classifiedFiles = fileMapper.findByStatus("CLASSIFIED");
        long unclassified = fileMapper.countByStatus("UNCLASSIFIED");
        model.addAttribute("classifiedFiles", classifiedFiles);
        model.addAttribute("categories", InstitutionCategory.names());
        model.addAttribute("unclassifiedCount", unclassified);
        return "classified-rework";
    }
}
