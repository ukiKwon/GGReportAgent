package com.kb.uploader.service;

import com.kb.uploader.domain.Institution;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

@Service
public class ClassificationService {

    private static final Logger log = LoggerFactory.getLogger(ClassificationService.class);

    private final InstitutionMapper institutionMapper;
    private final UploadedFileMapper fileMapper;
    private final FileStorageService storageService;

    public ClassificationService(InstitutionMapper institutionMapper,
                                 UploadedFileMapper fileMapper,
                                 FileStorageService storageService) {
        this.institutionMapper = institutionMapper;
        this.fileMapper = fileMapper;
        this.storageService = storageService;
    }

    public boolean classify(UploadedFile file) {
        Optional<Institution> inst = institutionMapper.findByName(file.getInstitutionName());
        if (!inst.isPresent()) return false;

        try {
            Path source = Paths.get(file.getStoredPath());
            Path dest = storageService.moveToClassified(
                source, inst.get().getCategory(), file.getYear(), file.getInstitutionName());
            file.classify(inst.get().getCategory(), dest.toString());
            fileMapper.update(file);
            return true;
        } catch (Exception e) {
            log.error("파일 분류 실패: {}", file.getOriginalName(), e);
            return false;
        }
    }
}
