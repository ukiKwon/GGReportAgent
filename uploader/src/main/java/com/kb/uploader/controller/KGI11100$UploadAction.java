package com.kb.uploader.controller;

import com.kb.uploader.code.DocumentType;
import com.kb.uploader.dto.UploadResultItem;
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

/**
 * 업로드 실행 (2026-09-23 파싱 전환).
 *
 * <p>업로드 창구가 <b>둘</b>로 갈렸다. 문서 종류마다 받는 확장자가 다르고 만드는 산출물도 다르다.
 * 기관·연도·분류를 손으로 넣던 파라미터는 없앴다 — 이제 문서 본문에서 찾는다.
 */
@Controller
@RequestMapping("/upload")
public class KGI11100$UploadAction {

    private final FileUploadService uploadService;
    private final UploadedFileMapper fileMapper;

    public KGI11100$UploadAction(FileUploadService uploadService,
                                 UploadedFileMapper fileMapper) {
        this.uploadService = uploadService;
        this.fileMapper = fileMapper;
    }

    /** 입찰제안서 (ppt, pptx) */
    @PostMapping("/proposal")
    public String executeProposal(@RequestParam("files") List<MultipartFile> files, Model model) {
        return handle(DocumentType.BID_PROPOSAL, files, model);
    }

    /** 입찰공고문 RFP (pdf, hwp, hwpx) */
    @PostMapping("/rfp")
    public String executeRfp(@RequestParam("files") List<MultipartFile> files, Model model) {
        return handle(DocumentType.RFP, files, model);
    }

    private String handle(String docType, List<MultipartFile> files, Model model) {
        model.addAttribute("parseFailedCount", fileMapper.countByParseStatus("FAILED"));

        List<MultipartFile> validFiles = files.stream()
                .filter(f -> !f.isEmpty())
                .collect(Collectors.toList());
        if (validFiles.isEmpty()) {
            model.addAttribute("errorMessage", "파일을 선택해 주세요.");
            return "upload";
        }

        List<UploadResultItem> results = uploadService.upload(docType, validFiles);
        model.addAttribute("results", results);
        model.addAttribute("uploadedType", DocumentType.label(docType));
        return "upload";
    }
}
