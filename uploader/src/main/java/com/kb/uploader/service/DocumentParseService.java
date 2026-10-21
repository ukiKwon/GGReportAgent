package com.kb.uploader.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.kb.uploader.code.DocumentType;
import com.kb.uploader.code.SystemUser;
import com.kb.uploader.domain.Institution;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.parse.DateDetector;
import com.kb.uploader.parse.ExtractedDocument;
import com.kb.uploader.parse.InstitutionMatcher;
import com.kb.uploader.parse.PptExtractor;
import com.kb.uploader.parse.ProposalDocument;
import com.kb.uploader.parse.RfpExtractor;
import com.kb.uploader.parse.RfpSummaryWriter;
import com.kb.uploader.parse.SlideContent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 업로드 원본(userdata)을 파싱해 산출물을 만든다 (2026-09-23 신설).
 *
 * <ul>
 *   <li>입찰제안서: {@code {연도}_{기관분류}_{기관명}_{파싱yyyyMMdd}_bid_proposal.json}</li>
 *   <li>RFP: {@code {공고yyyyMMdd}_{기관분류}_{기관명}_{파싱yyyyMMdd}.md}</li>
 * </ul>
 *
 * <p>종전의 {@code ClassificationService}(파일명으로 기관을 찾아 폴더를 옮기던 것)를 대신한다.
 * 원본은 옮기지 않고 {@code userdata/} 에 그대로 둔다.
 *
 * <p>⚠️ 감사 2열은 이 클래스가 채운다. 파싱은 배치·화면 양쪽에서 불리므로
 * {@link SystemUser#get()} 값을 그대로 쓰고, 시각은 파싱일시와 같은 값으로 둔다.
 */
@Service
public class DocumentParseService {

    private static final Logger log = LoggerFactory.getLogger(DocumentParseService.class);

    static final String UNKNOWN_NOTICE_DATE = "공고일미상";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    private final PptExtractor pptExtractor;
    private final RfpExtractor rfpExtractor;
    private final InstitutionMatcher institutionMatcher;
    private final DateDetector dateDetector;
    private final RfpSummaryWriter rfpSummaryWriter;
    private final FileStorageService storageService;
    private final InstitutionMapper institutionMapper;
    private final UploadedFileMapper fileMapper;

    public DocumentParseService(PptExtractor pptExtractor, RfpExtractor rfpExtractor,
                                InstitutionMatcher institutionMatcher, DateDetector dateDetector,
                                RfpSummaryWriter rfpSummaryWriter, FileStorageService storageService,
                                InstitutionMapper institutionMapper, UploadedFileMapper fileMapper) {
        this.pptExtractor = pptExtractor;
        this.rfpExtractor = rfpExtractor;
        this.institutionMatcher = institutionMatcher;
        this.dateDetector = dateDetector;
        this.rfpSummaryWriter = rfpSummaryWriter;
        this.storageService = storageService;
        this.institutionMapper = institutionMapper;
        this.fileMapper = fileMapper;
    }

    /** 파싱하고 결과(성공/실패)를 DB 에 기록한다. 예외를 밖으로 던지지 않는다. */
    public UploadedFile parse(UploadedFile file) {
        try {
            String docType = file.getDocType();   // 원본 확장자로 판별한다(스키마 무변경안)
            if (DocumentType.BID_PROPOSAL.equals(docType)) {
                parseProposal(file);
            } else if (DocumentType.RFP.equals(docType)) {
                parseRfp(file);
            } else {
                throw new IllegalStateException("문서 종류가 없는 이전 방식 업로드입니다");
            }
        } catch (Exception e) {
            // ⚠️ 실패 사유를 담을 컬럼이 없다(스키마 무변경안). 로그가 유일한 기록이므로
            //    스택까지 남긴다 — 화면에는 "실패" 표시만 나간다.
            log.warn("파싱 실패: {} — {}", file.getOriginalName(),
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName(), e);
            file.markParseFailed(originalPath(file));
        }
        stampAudit(file);
        fileMapper.updateParseResult(file);
        return file;
    }

    /** 이전 산출물을 지우고 userdata 원본으로 다시 파싱한다. */
    public Optional<UploadedFile> reparse(Long id) {
        Optional<UploadedFile> found = fileMapper.findById(id);
        if (!found.isPresent()) return Optional.empty();
        UploadedFile file = found.get();
        try {
            storageService.deleteIfExists(file.getOutputPath());   // 성공 건만 값이 있다
        } catch (Exception e) {
            log.warn("이전 산출물 삭제 실패: {}", file.getOutputPath(), e);
        }
        return Optional.of(parse(file));
    }

    private void parseProposal(UploadedFile file) throws Exception {
        LocalDateTime now = LocalDateTime.now();
        List<SlideContent> slides = pptExtractor.extract(Paths.get(originalPath(file)));
        if (slides.isEmpty()) throw new IllegalStateException("슬라이드가 없습니다");

        StringBuilder all = new StringBuilder();
        for (SlideContent s : slides) {
            all.append(s.getTitle()).append('\n').append(s.getTextFull()).append('\n');
        }
        InstitutionMatcher.Match inst = institutionMatcher.match(all.toString(), institutions());

        List<String> notes = new ArrayList<String>();
        Optional<String> detected = dateDetector.detectProposalYear(slides);
        String year;
        if (detected.isPresent()) {
            year = detected.get();
        } else {
            notes.add("제안서 연도를 찾지 못해 업로드 연도로 대체");
            year = String.valueOf(now.getYear());
        }
        note(notes, inst);

        ProposalDocument doc = new ProposalDocument(file.getOriginalName(), now.format(STAMP), slides);
        String fileName = String.join("_", year, inst.getCategory(), inst.getName(), now.format(DAY))
                + "_bid_proposal.json";
        Path out = storageService.writeOutput(storageService.getProposalJsonDir(), fileName,
                mapper.writeValueAsBytes(doc));

        logNotes(file, notes);
        file.markParsed(inst.getName(), inst.getCategory(), year, out.toString(), now);
    }

    private void parseRfp(UploadedFile file) throws Exception {
        LocalDateTime now = LocalDateTime.now();
        ExtractedDocument doc = rfpExtractor.extract(Paths.get(originalPath(file)));
        List<String> lines = doc.lines();

        InstitutionMatcher.Match inst = institutionMatcher.match(doc.fullText(), institutions());
        List<String> notes = new ArrayList<String>();
        Optional<String> notice = dateDetector.detectNoticeDate(lines);
        if (!notice.isPresent()) notes.add("공고일을 찾지 못함");
        note(notes, inst);

        String markdown = rfpSummaryWriter.write(doc, new RfpSummaryWriter.Meta(
                file.getOriginalName(), inst.getName(), inst.getCategory(),
                notice.orElse(null), now.format(STAMP)));

        String fileName = String.join("_", notice.orElse(UNKNOWN_NOTICE_DATE),
                inst.getCategory(), inst.getName(), now.format(DAY)) + ".md";
        Path out = storageService.writeOutput(storageService.getRfpMdDir(), fileName,
                markdown.getBytes(StandardCharsets.UTF_8));

        logNotes(file, notes);
        file.markParsed(inst.getName(), inst.getCategory(), notice.orElse(null), out.toString(), now);
    }

    private List<Institution> institutions() {
        return institutionMapper.findAll();
    }

    /**
     * 감사 2열. 규칙(2026-09-08 확정)대로 <b>그 행을 마지막으로 건드린 시각</b>을 넣는다.
     * 파싱은 분류일시가 없을 수도 있어 파싱일시를 쓴다.
     */
    private static void stampAudit(UploadedFile file) {
        file.setSystemUserNo(SystemUser.get());
        file.setSystemUsedAt(file.getParsedAt() != null ? file.getParsedAt() : LocalDateTime.now());
    }

    private static void note(List<String> notes, InstitutionMatcher.Match inst) {
        if (InstitutionMatcher.UNKNOWN_NAME.equals(inst.getName())) {
            notes.add("기관명을 찾지 못함");
        } else if (!inst.isRegistered() && UploadedFile.UNKNOWN_CATEGORY.equals(inst.getCategory())) {
            notes.add("기관 테이블에 없는 기관(" + inst.getName() + ") → 미분류");
        }
    }

    /** 참고 사항(기관 미상 등)도 컬럼이 없어 로그에만 남긴다. */
    private static void logNotes(UploadedFile file, List<String> notes) {
        if (!notes.isEmpty()) {
            log.info("파싱 참고: {} — {}", file.getOriginalName(), String.join(" / ", notes));
        }
    }

    /**
     * 원본 경로를 재구성한다. 파싱에 성공하면 저장경로가 산출물로 바뀌므로,
     * 재파싱할 때 원본을 다시 찾으려면 {@code userdata + 원본파일명} 으로 계산해야 한다.
     * ⚠️ 그래서 업로드 때 <b>실제로 저장된 파일명</b>을 원본파일명에 넣는다(FileUploadService).
     */
    private String originalPath(UploadedFile file) {
        return storageService.getUserdataDir().resolve(file.getOriginalName()).toString();
    }
}
