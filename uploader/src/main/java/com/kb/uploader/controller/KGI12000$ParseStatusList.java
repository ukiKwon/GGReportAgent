package com.kb.uploader.controller;

import com.kb.uploader.code.DocumentType;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * 파싱 현황 목록 (2026-09-23 신설, 옛 "파일 처리 상태" 화면을 대신한다).
 *
 * <p>분류 축 하나로 보던 화면을 <b>파싱 축</b>으로 바꾼 것이다. 파싱 성공/실패와
 * 기관 미분류가 서로 다른 축이라 필터도 따로 둔다.
 */
@Controller
@RequestMapping("/parse-status")
public class KGI12000$ParseStatusList {

    private final UploadedFileMapper fileMapper;

    public KGI12000$ParseStatusList(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping
    public String execute(@RequestParam(required = false) String docType,
                          @RequestParam(required = false) String parseStatus,
                          @RequestParam(required = false) String category,
                          Model model) {
        boolean unclassifiedOnly = "미분류".equals(category);
        List<UploadedFile> files = fileMapper.searchParseStatus(
                emptyToNull(docType), emptyToNull(parseStatus), unclassifiedOnly);

        model.addAttribute("files", files);
        model.addAttribute("docTypes", DocumentType.nameToCode().keySet());
        model.addAttribute("docType", docType);
        model.addAttribute("parseStatus", parseStatus);
        model.addAttribute("category", category);
        model.addAttribute("successCount", fileMapper.countParseSuccess());
        model.addAttribute("parseFailedCount", fileMapper.countParseFailed());
        model.addAttribute("unclassifiedCount", fileMapper.countParsedUnclassified());
        return "parse-status";
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s : null;
    }
}
