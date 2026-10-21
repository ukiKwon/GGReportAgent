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

        // ── 2026-09-23 파싱 전환: KPI 축이 분류 → 파싱으로 바뀌었다 ──
        long total        = fileMapper.countAll();
        long parseSuccess = fileMapper.countParseSuccess();
        long parseFailed  = fileMapper.countParseFailed();
        long unclassified = fileMapper.countParsedUnclassified();

        model.addAttribute("total", total);
        model.addAttribute("parseSuccess", parseSuccess);
        model.addAttribute("parseFailed", parseFailed);
        model.addAttribute("unclassified", unclassified);
        model.addAttribute("proposalCount", fileMapper.countProposalDocs());
        model.addAttribute("rfpCount", fileMapper.countRfpDocs());
        // 좌측 네비 배지 — 미분류 건수에서 파싱 실패 건수로 바뀌었다
        model.addAttribute("parseFailedCount", parseFailed);

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
