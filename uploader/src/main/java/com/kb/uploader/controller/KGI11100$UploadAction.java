package com.kb.uploader.controller;

import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileUploadService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.stream.Collectors;

@Controller
@RequestMapping("/upload")
public class KGI11100$UploadAction {

    private final FileUploadService uploadService;
    private final UploadedFileMapper fileMapper;
    private final InstitutionMapper instMapper;

    public KGI11100$UploadAction(FileUploadService uploadService,
                                 UploadedFileMapper fileMapper,
                                 InstitutionMapper instMapper) {
        this.uploadService = uploadService;
        this.fileMapper = fileMapper;
        this.instMapper = instMapper;
    }

    @PostMapping
    public String execute(@RequestParam("files") List<MultipartFile> files,
                          @RequestParam(defaultValue = "") String institution,
                          @RequestParam(defaultValue = "") String year,
                          @RequestParam(defaultValue = "") String category,
                          Model model) {
        populateCategories(model);
        model.addAttribute("unclassifiedCount", fileMapper.countByStatus("UNCLASSIFIED"));

        List<MultipartFile> validFiles = files.stream()
                .filter(f -> !f.isEmpty())
                .collect(Collectors.toList());
        if (validFiles.isEmpty()) {
            model.addAttribute("errorMessage", "파일을 선택해 주세요.");
            return "upload";
        }

        List<UploadResultItem> results = uploadService.upload(validFiles, institution, year, category);
        model.addAttribute("results", results);
        return "upload";
    }

    private void populateCategories(Model model) {
        List<String> categories = instMapper.findAll().stream()
                .map(i -> i.getCategory())
                .filter(c -> c != null && !c.trim().isEmpty())
                .distinct().sorted()
                .collect(Collectors.toList());
        model.addAttribute("categories", categories);
    }
}