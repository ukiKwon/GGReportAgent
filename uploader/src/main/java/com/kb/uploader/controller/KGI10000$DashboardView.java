package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@Controller
public class KGI10000$DashboardView {

    private final UploadedFileMapper fileMapper;

    public KGI10000$DashboardView(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping("/")
    public String execute(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "1") int page,
            Model model) {

        long total        = fileMapper.countAll();
        long classified   = fileMapper.countByStatus("CLASSIFIED");
        long unclassified = fileMapper.countByStatus("UNCLASSIFIED");
        long excluded     = fileMapper.countByStatus("REJECTED") + fileMapper.countByStatus("DELETED");

        model.addAttribute("total", total);
        model.addAttribute("classified", classified);
        model.addAttribute("unclassified", unclassified);
        model.addAttribute("excluded", excluded);
        model.addAttribute("unclassifiedCount", unclassified);

        List<UploadedFile> recent = fileMapper.findRecent(10);
        model.addAttribute("recentFiles", recent);

        if (keyword != null && !keyword.trim().isEmpty()) {
            int pageSize = 20;
            int offset = (page - 1) * pageSize;
            List<UploadedFile> content =
                    fileMapper.findByInstitutionNameContaining(keyword.trim(), offset, pageSize);
            long totalCount = fileMapper.countByInstitutionNameContaining(keyword.trim());
            model.addAttribute("searchResult",
                    new PageImpl<>(content, PageRequest.of(page - 1, pageSize), totalCount));
            model.addAttribute("keyword", keyword);
            model.addAttribute("currentPage", page);
        }

        return "dashboard";
    }
}
