package com.kb.uploader.controller;

import com.kb.uploader.service.PlanCsvUploadService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.stream.Collectors;

/** 사업계획 CSV 업로드 (NEXT 56 U1). 설계·한계는 {@link PlanCsvUploadService} 주석. */
@Controller
@RequestMapping("/upload")
public class KGI11200$PlanCsvUploadAction {

    private final PlanCsvUploadService service;

    public KGI11200$PlanCsvUploadAction(PlanCsvUploadService service) {
        this.service = service;
    }

    @PostMapping("/plan-csv")
    public String execute(@RequestParam("files") List<MultipartFile> files,
                          @RequestParam(value = "uploaderName", required = false) String uploaderName,
                          HttpServletRequest request, Model model) {
        List<MultipartFile> named = files.stream()
                .filter(f -> f.getOriginalFilename() != null && !f.getOriginalFilename().trim().isEmpty())
                .collect(Collectors.toList());
        if (named.isEmpty()) {
            model.addAttribute("errorMessage", "파일을 선택해 주세요.");
            return "upload";
        }
        try {
            // 올린 사람은 자기신고, remoteUser 는 컨테이너가 주는 경우만. client IP 는 참고값(X-Forwarded-For 는 믿지 않음).
            model.addAttribute("planResults",
                    service.upload(named, uploaderName, request.getRemoteUser(), request.getRemoteAddr()));
        } catch (PlanCsvUploadService.PlanCsvException e) {
            model.addAttribute("errorMessage", e.getMessage());   // 고정 문구만
        }
        return "upload";
    }
}
