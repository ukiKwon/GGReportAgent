package com.kb.uploader.service;

import com.kb.uploader.code.DocumentType;
import com.kb.uploader.code.SystemUser;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.dto.UploadResultItem;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 업로드 오케스트레이션 (2026-09-23 파싱 전환).
 *
 * <p>종전에는 파일명을 해석해 기관을 알아낸 뒤 폴더를 옮겼다. 이제는 <b>확장자만 검증</b>하고
 * 원본을 userdata 에 보관한 다음 {@link DocumentParseService} 가 문서 내용을 읽는다.
 *
 * <p>⚠️ 한 파일이 실패해도 나머지는 계속 처리한다 — 여러 건을 한 번에 올리는 화면이라
 * 중간에 멈추면 무엇이 처리됐는지 알 수 없다.
 */
@Service
public class FileUploadService {

    private static final Logger log = LoggerFactory.getLogger(FileUploadService.class);

    private final FileStorageService storageService;
    private final DocumentParseService parseService;
    private final UploadedFileMapper fileMapper;

    public FileUploadService(FileStorageService storageService,
                             DocumentParseService parseService,
                             UploadedFileMapper fileMapper) {
        this.storageService = storageService;
        this.parseService = parseService;
        this.fileMapper = fileMapper;
    }

    /**
     * @param docType {@link DocumentType#BID_PROPOSAL} 또는 {@link DocumentType#RFP}
     */
    public List<UploadResultItem> upload(String docType, List<MultipartFile> files) {
        List<UploadResultItem> results = new ArrayList<UploadResultItem>();
        for (MultipartFile file : files) {
            String originalName = FileStorageService.safeFileName(file.getOriginalFilename());
            if (file.isEmpty()
                    && (file.getOriginalFilename() == null || file.getOriginalFilename().isEmpty())) {
                continue; // 파일을 고르지 않고 전송한 빈 파트
            }
            if (!DocumentType.accepts(docType, originalName)) {
                results.add(new UploadResultItem(originalName, false, null,
                        "허용되지 않는 확장자 ("
                                + String.join(", ", DocumentType.extensions(docType)) + "만 가능)"));
                continue;
            }
            try {
                Path saved = storageService.saveOriginal(file, originalName);
                // ⚠️ 중복 이름이면 _yyyyMMddHHmmss 가 붙는다. **실제로 저장된 이름**을 넣어야
                //    나중에 userdata + 원본파일명 으로 원본을 다시 찾을 수 있다(스키마 무변경안).
                String savedName = saved.getFileName().toString();
                UploadedFile entity = new UploadedFile(savedName, saved.toString());
                entity.setSystemUserNo(SystemUser.get());
                entity.setSystemUsedAt(entity.getUploadedAt());
                fileMapper.insert(entity);

                UploadedFile parsed = parseService.parse(entity);
                boolean ok = parsed.isParsed();
                results.add(new UploadResultItem(originalName, ok,
                        ok ? parsed.getCategoryLabel() : null,
                        ok ? "파싱 완료 → " + parsed.getOutputFileName()
                           : "파싱 실패 — 사유는 서버 로그를 확인하세요"));
            } catch (Exception e) {
                log.error("업로드 처리 실패: {}", originalName, e);
                results.add(new UploadResultItem(originalName, false, null, "오류: " + e.getMessage()));
            }
        }
        return results;
    }
}
