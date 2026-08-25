package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.dto.FileDownloadResponse;
import com.kb.uploader.dto.FileSearchResponse;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.FileContentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/files")
public class FileSearchApiController {

    private final UploadedFileMapper fileMapper;
    private final FileContentService contentService;

    public FileSearchApiController(UploadedFileMapper fileMapper,
                                   FileContentService contentService) {
        this.fileMapper = fileMapper;
        this.contentService = contentService;
    }

    @GetMapping("/search")
    public FileSearchResponse search(
            @RequestParam(defaultValue = "") String institution,
            @RequestParam(defaultValue = "") String year,
            @RequestParam(defaultValue = "") String keyword) {

        List<FileSearchResponse.FileItem> items = fileMapper.search(institution, year, keyword)
                .stream()
                .map(f -> new FileSearchResponse.FileItem(
                        f.getId(),
                        f.getOriginalName(),
                        f.getInstitutionName(),
                        f.getYear(),
                        f.getCategory(),
                        f.getStatus(),
                        f.getUploadedAt() != null ? f.getUploadedAt().toString() : null,
                        contentService.extractText(f.getStoredPath())))
                .collect(Collectors.toList());

        return new FileSearchResponse(items);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<?> download(@PathVariable Long id) {
        UploadedFile file = fileMapper.findById(id).orElse(null);
        if (file == null || "DELETED".equals(file.getStatus())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Collections.singletonMap("error", "파일을 찾을 수 없습니다."));
        }

        Path path = Paths.get(file.getStoredPath());
        if (!Files.exists(path)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Collections.singletonMap("error", "파일이 서버에 존재하지 않습니다."));
        }

        byte[] bytes;
        try {
            bytes = Files.readAllBytes(path);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Collections.singletonMap("error", "파일 읽기 실패: " + e.getMessage()));
        }

        return ResponseEntity.ok(new FileDownloadResponse(
                file.getId(),
                file.getOriginalName(),
                resolveMimeType(file.getOriginalName()),
                bytes.length,
                Base64.getEncoder().encodeToString(bytes)
        ));
    }

    private static String resolveMimeType(String fileName) {
        if (fileName == null) return "application/octet-stream";
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".pdf"))  return "application/pdf";
        if (lower.endsWith(".hwp"))  return "application/haansofthwp";
        if (lower.endsWith(".hwpx")) return "application/haansofthwpx";
        if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (lower.endsWith(".xls"))  return "application/vnd.ms-excel";
        return "application/octet-stream";
    }
}
