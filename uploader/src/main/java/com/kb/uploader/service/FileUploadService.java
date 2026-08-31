package com.kb.uploader.service;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.dto.ParsedFileName;
import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class FileUploadService {

    private final FileParserService parserService;
    private final FileStorageService storageService;
    private final ClassificationService classificationService;
    private final UploadedFileMapper fileMapper;

    public FileUploadService(FileParserService parserService,
                             FileStorageService storageService,
                             ClassificationService classificationService,
                             UploadedFileMapper fileMapper) {
        this.parserService = parserService;
        this.storageService = storageService;
        this.classificationService = classificationService;
        this.fileMapper = fileMapper;
    }

    public List<UploadResultItem> upload(List<MultipartFile> files) {
        return upload(files, "", "", "");
    }

    public List<UploadResultItem> upload(List<MultipartFile> files,
                                         String instOverride, String yearOverride, String categoryOverride) {
        List<UploadResultItem> results = new ArrayList<>();
        for (MultipartFile file : files) {
            String originalName = file.getOriginalFilename();
            try {
                Optional<ParsedFileName> parsed = parserService.parse(originalName);
                if (!parsed.isPresent()) {
                    boolean hasOverride = instOverride != null && !instOverride.trim().isEmpty();
                    Path saved = storageService.saveToUnclassified(file, originalName);
                    UploadedFile entity = new UploadedFile(
                            originalName, saved.toString(),
                            (yearOverride != null && !yearOverride.trim().isEmpty()) ? yearOverride.trim() : null,
                            hasOverride ? instOverride.trim() : "알수없음");
                    fileMapper.insert(entity);
                    if (hasOverride) {
                        boolean ok = classificationService.classify(entity);
                        results.add(new UploadResultItem(originalName, ok,
                                ok ? entity.getCategory() : null,
                                ok ? "수동 입력으로 분류 완료" : "미분류 (기관 미등록 — 기관 관리에서 등록 필요)"));
                    } else {
                        results.add(new UploadResultItem(originalName, false, null,
                                "파일명 형식 불일치 (년도_기관명_설명.확장자 필요)"));
                    }
                    continue;
                }
                ParsedFileName p = parsed.get();
                Path saved = storageService.saveToUnclassified(file, originalName);
                UploadedFile entity = new UploadedFile(
                        originalName, saved.toString(), p.getYear(), p.getInstitutionName());
                fileMapper.insert(entity);

                boolean ok = classificationService.classify(entity);
                results.add(new UploadResultItem(
                        originalName, ok,
                        ok ? entity.getCategory() : null,
                        ok ? "분류 완료" : "미분류 (기관 미등록)"));
            } catch (Exception e) {
                results.add(new UploadResultItem(originalName, false, null,
                        "오류: " + e.getMessage()));
            }
        }
        return results;
    }
}
