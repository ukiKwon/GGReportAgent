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
public class KGI13300$InstitutionExportJson {

    private final InstitutionService institutionService;

    public KGI13300$InstitutionExportJson(InstitutionService institutionService) {
        this.institutionService = institutionService;
    }

    @GetMapping("/export/json")
    public ResponseEntity<byte[]> execute() throws IOException {
        byte[] data = institutionService.exportToJson();
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"institutions.json\"")
            .contentType(MediaType.APPLICATION_JSON)
            .body(data);
    }
}
