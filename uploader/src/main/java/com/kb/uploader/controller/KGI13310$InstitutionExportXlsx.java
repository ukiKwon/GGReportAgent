package com.kb.uploader.controller;

import com.kb.uploader.service.InstitutionService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.io.IOException;

@Controller
@RequestMapping("/institutions")
public class KGI13310$InstitutionExportXlsx {

    private final InstitutionService institutionService;

    public KGI13310$InstitutionExportXlsx(InstitutionService institutionService) {
        this.institutionService = institutionService;
    }

    @GetMapping("/export/xlsx")
    public ResponseEntity<byte[]> execute() throws IOException {
        byte[] data = institutionService.exportToXlsx();
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"institutions.xlsx\"")
            .contentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(data);
    }
}
