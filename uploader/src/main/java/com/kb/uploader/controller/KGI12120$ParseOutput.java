package com.kb.uploader.controller;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

/**
 * 파싱 산출물(JSON/MD) 보기·내려받기 (2026-09-23 신설).
 *
 * <p>⚠️ Content-Type 을 text/plain; charset=UTF-8 로 고정한다. 브라우저가 인코딩을 추측하면
 * 한글 요약이 깨져 보인다.
 */
@Controller
@RequestMapping("/parse-status")
public class KGI12120$ParseOutput {

    private final UploadedFileMapper fileMapper;

    public KGI12120$ParseOutput(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    @GetMapping("/{id}/output")
    @ResponseBody
    public ResponseEntity<byte[]> execute(@PathVariable Long id,
                                          @RequestParam(defaultValue = "false") boolean download)
            throws IOException {
        Optional<UploadedFile> file = fileMapper.findById(id);
        if (!file.isPresent() || file.get().getOutputPath() == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        Path path = Paths.get(file.get().getOutputPath());
        if (!Files.exists(path)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        ContentDisposition disposition = ContentDisposition.builder(download ? "attachment" : "inline")
                .filename(path.getFileName().toString(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(Files.readAllBytes(path));
    }
}
