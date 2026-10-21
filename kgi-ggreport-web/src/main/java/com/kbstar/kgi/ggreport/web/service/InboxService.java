package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.dto.InboxImportResponse;
import com.kbstar.kgi.ggreport.web.dto.InboxValidateResponse;
import com.kbstar.kgi.ggreport.web.dto.RfpFileEntry;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.BatchSchema;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 반입 배치를 망 안 상태에 반영한다 — Task 5B.5.
 * Python {@code server/inbox_import.py} ({@code collector/SCHEMA.md} §⑥의 2·4·5·6단계).
 *
 * <p><b>망 경계</b>: 이 서비스는 <b>자기 파일시스템의 inbox 만 읽는다.</b> 망 밖을
 * 향한 요청도, 역방향 콜백도 만들지 않는다(SCHEMA.md §⑩-5).
 */
@Service
public class InboxService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CONFIDENCE_CONFIRMED = "확정";
    private static final String CONFIDENCE_DEFAULT = "예상";

    private final InstitutionMapper institutions;
    private final BidCaseMapper bidCases;
    private final BidCaseCommandService bidCaseCommands;
    private final AppProperties properties;

    public InboxService(InstitutionMapper institutions, BidCaseMapper bidCases,
                        BidCaseCommandService bidCaseCommands, AppProperties properties) {
        this.institutions = institutions;
        this.bidCases = bidCases;
        this.bidCaseCommands = bidCaseCommands;
        this.properties = properties;
    }

    /**
     * {@code batch_id} 형식을 <b>먼저</b> 보고, 그 다음 실재를 본다.
     *
     * <p>⚠️ 경로 문자열을 차단 목록으로 거르지 않고 <b>형식(허용 목록)</b> 으로
     * 검사한다. {@link BatchSchema#BATCH_ID_RE} 는 {@code /} · {@code \} · {@code ..} ·
     * {@code :} 를 애초에 허용하지 않으므로 경로 이탈이 <b>구조적으로 불가능</b>하다 —
     * 차단 목록보다 안전하고, 새 우회 문자를 쫓아다닐 필요가 없다.
     */
    Path resolveBatchDir(String batchId) {
        if (batchId == null || !BatchSchema.BATCH_ID_RE.matcher(batchId).matches()) {
            throw ApiException.badRequest("batch_id 형식이 잘못됐습니다: '" + batchId + "'");
        }
        Path batchDir = Paths.get(properties.getInboxRoot()).resolve(batchId);
        if (!Files.isDirectory(batchDir)) {
            throw ApiException.notFound("inbox에 배치가 없습니다: " + batchId);
        }
        return batchDir;
    }

    /**
     * 검사만 — DB 도 파일도 건드리지 않는다.
     *
     * <p>⚠️ 코퍼스 검사기와 달리 <b>경고가 없다.</b> 배치는 형식 계약이라 "애매하지만
     * 통과"가 존재하지 않는다(설계 §⑨-6).
     */
    public InboxValidateResponse validate(String batchId) {
        List<String> errors = BatchSchema.validate(resolveBatchDir(batchId));
        return new InboxValidateResponse(batchId, errors);
    }

    /**
     * 배치를 반영한다 — 기관 upsert · 공고 upsert · 첨부 이동 · 배치 보관.
     *
     * <p>⚠️ <b>DB 를 먼저 커밋하고 파일을 나중에 옮긴다. 순서를 뒤집지 말 것.</b>
     * 파일부터 옮기면 DB 단계에서 실패했을 때 배치는 이미 inbox 에서 사라진 뒤라
     * <b>되돌릴 수도 재시도할 수도 없다.</b> 이 순서면 파일 단계가 실패해도 배치가
     * inbox 에 남아 사람이 고친 뒤 다시 부를 수 있고, DB 단계는 upsert 라 재실행이
     * 안전하다. (파일 이동에는 롤백이 없다 — 그래서 순서가 방어책이다.)
     */
    public InboxImportResponse importBatch(String batchId) {
        Path batchDir = resolveBatchDir(batchId);

        List<String> errors = BatchSchema.validate(batchDir);
        if (!errors.isEmpty()) {
            throw ApiException.withDetail(422, Collections.singletonMap("errors", errors));
        }

        JsonNode manifest = readManifest(batchDir);
        String sourceSlug = manifest.path("source").path("slug").asText();
        JsonNode records = manifest.path("records");

        DbResult db = applyToDb(batchDir, sourceSlug, records);

        // ── 여기부터 파일 이동: 롤백이 없다 ────────────────────────────
        List<RfpFileEntry> rfpFiles = moveAttachments(batchDir, records);
        String archivedTo = archiveBatch(batchDir, batchId);

        return new InboxImportResponse(batchId, db.institutionIds, db.bidCases, rfpFiles, archivedTo);
    }

    // ── DB 단계 ───────────────────────────────────────────────────────

    private static final class DbResult {
        final List<String> institutionIds;
        final Map<String, List<String>> bidCases;

        DbResult(List<String> institutionIds, Map<String, List<String>> bidCases) {
            this.institutionIds = institutionIds;
            this.bidCases = bidCases;
        }
    }

    /** 기관 upsert + 공고별 bid_case upsert 를 <b>한 트랜잭션</b>으로 처리한다. */
    @Transactional
    DbResult applyToDb(Path batchDir, String sourceSlug, JsonNode records) {
        List<InstitutionImportRow> rows;
        try {
            rows = InstitutionCsv.parse(Files.readAllBytes(batchDir.resolve("institutions.csv")));
        } catch (InstitutionCsv.CsvFormatException exc) {
            throw ApiException.withDetail(422,
                    Collections.singletonMap("errors",
                            Collections.singletonList("institutions.csv: " + exc.getMessage())));
        } catch (IOException exc) {
            throw ApiException.badRequest("institutions.csv를 읽을 수 없습니다: " + exc.getMessage());
        }

        List<String> institutionIds = new ArrayList<>();
        for (InstitutionImportRow row : rows) {
            institutionIds.add(upsertInstitution(row));
        }

        Map<String, List<String>> summary = new LinkedHashMap<>();
        summary.put("created", new ArrayList<String>());
        summary.put("updated", new ArrayList<String>());

        for (int index = 0; index < records.size(); index++) {
            JsonNode record = records.get(index);
            String nameKo = record.path("institution").path("name_ko").asText(null);
            String institutionId = nameKo == null ? null : institutions.selectIdByName(nameKo);
            if (institutionId == null) {
                // ⚠️ 조용히 건너뛰지 않는다. SCHEMA §④ 가 records[].institution.name_ko 를
                //    CSV '기관명' 과 같은 값으로 못 박으므로, 못 찾는 것은 배치가 계약을
                //    어긴 것이다. 건너뛰면 일정 없는 유령 공고가 남는다.
                throw ApiException.withDetail(422, Collections.singletonMap("errors",
                        Collections.singletonList(
                                "records[" + index + "]: CSV에 없는 기관명입니다 ('" + nameKo + "')")));
            }
            upsertBidCaseFromNotice(institutionId, sourceSlug, record, summary);
        }
        return new DbResult(institutionIds, summary);
    }

    /** {@code repository.upsert_institution} — 이름이 키다. */
    private String upsertInstitution(InstitutionImportRow row) {
        String existingId = institutions.selectIdByName(row.getNameKo());
        if (existingId != null) {
            institutions.updateFromImport(existingId, row);
            return existingId;
        }
        String institutionId = Ids.institution();
        institutions.insert(institutionId, row);
        return institutionId;
    }

    /**
     * manifest 레코드 1건을 {@code bid_cases} 에 반영한다 —
     * Python {@code upsert_bid_case_from_notice}.
     *
     * <p>유일키는 {@code (source_slug, notice_id)} 다. 같은 공고를 다시 수집하는 것은
     * 정상이고 <b>나중 배치가 이긴다</b>(SCHEMA §④).
     *
     * <p>⚠️ <b>신뢰도에 따라 날짜를 넣는 컬럼이 갈리고, 반대쪽은 건드리지 않는다.</b>
     * 예상이 확정으로 승격될 때 예전 예상값을 지우면 "언제 예상했었나"가 사라진다.
     */
    private void upsertBidCaseFromNotice(String institutionId, String sourceSlug,
                                         JsonNode record, Map<String, List<String>> summary) {
        String noticeId = record.path("notice_id").asText(null);
        String title = record.path("title").asText(null);
        String noticeUrl = record.path("evidence").path("url").asText(null);

        JsonNode schedule = record.path("schedule");
        String confidence = schedule.path("confidence").asText(null);
        if (confidence == null || confidence.isEmpty()) {
            confidence = CONFIDENCE_DEFAULT;
        }
        String date = scheduleDateFrom(schedule);
        boolean confirmed = CONFIDENCE_CONFIRMED.equals(confidence);

        String existingId = bidCases.selectIdByNotice(sourceSlug, noticeId);
        if (existingId != null) {
            bidCases.updateFromNotice(existingId, confidence, date, title, noticeUrl, Times.nowIso());
            summary.get("updated").add(existingId);
            return;
        }

        BidCase made = bidCaseCommands.create(institutionId);
        String bidCaseId = made.getBidCaseId();
        bidCases.updateFromNotice(bidCaseId, confidence, date, title, noticeUrl, Times.nowIso());
        bidCases.updateNoticeMeta(bidCaseId, sourceSlug, noticeId, title, noticeUrl);
        summary.get("created").add(bidCaseId);
    }

    /**
     * 공고 일정 4개 중 "입찰이 언제인가"를 고른다 — Python {@code schedule_date_from}.
     *
     * <p>{@code deadline_at} 이 1순위이고, 없으면 {@code contract_end} 로 폴백한다
     * (계약 종료가 곧 다음 입찰 시점이라는 것이 이 리포의 기존 해석이고,
     * {@code InstitutionCsv.HEADER_MAP} 도 '입찰예상일'을 {@code contract_end} 에
     * 매핑한다). 둘 다 없으면 {@code null} — <b>공고는 실재하므로 건은 만든다.</b>
     */
    private static String scheduleDateFrom(JsonNode schedule) {
        String deadline = schedule.path("deadline_at").asText(null);
        if (deadline != null && !deadline.isEmpty()) {
            return deadline;
        }
        String contractEnd = schedule.path("contract_end").asText(null);
        return contractEnd == null || contractEnd.isEmpty() ? null : contractEnd;
    }

    // ── 파일 단계 (롤백 없음) ─────────────────────────────────────────

    /**
     * 첨부를 {@code corpus/rfp/} 로 옮기고, <b>공고당 첫 번째만</b>
     * {@code institutions.rfp_path} 에 남긴다.
     *
     * <p>{@code rfp_path} 가 단일 컬럼이고 SCHEMA §⑤ 도 "공고문 PDF"를 단수로
     * 전제하므로, 나머지 첨부는 파일만 옮긴다. 배치 안 파일명이 이미
     * {@code {notice_id}_{원본파일명}} 이라 이름을 새로 조립할 필요가 없다.
     */
    private List<RfpFileEntry> moveAttachments(Path batchDir, JsonNode records) {
        Path rfpRoot = Paths.get(properties.getRfpRoot());
        List<RfpFileEntry> moved = new ArrayList<>();

        for (JsonNode record : records) {
            JsonNode attachments = record.path("attachments");
            if (!attachments.isArray() || attachments.size() == 0) {
                continue;
            }
            try {
                Files.createDirectories(rfpRoot);
                List<Path> stored = new ArrayList<>();
                for (JsonNode attachment : attachments) {
                    Path source = batchDir.resolve(attachment.asText());
                    Path destination = rfpRoot.resolve(source.getFileName().toString());
                    // 같은 공고의 재수집이므로 나중 배치가 이긴다 — 덮어쓴다.
                    Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    stored.add(destination);
                }
                String nameKo = record.path("institution").path("name_ko").asText(null);
                String institutionId = nameKo == null ? null : institutions.selectIdByName(nameKo);
                String rfpPath = repoRelative(stored.get(0));
                institutions.updateRfpPath(institutionId, rfpPath);
                moved.add(new RfpFileEntry(institutionId, rfpPath));
            } catch (IOException exc) {
                throw new ApiException(500, "첨부를 옮기지 못했습니다: " + exc.getMessage());
            }
        }
        return moved;
    }

    /**
     * 처리된 배치를 inbox 밖으로 치운다 — 그래야 inbox 가 "미처리만"이 된다.
     *
     * <p>지우지 않는 이유는 {@code evidence.url} 과 수집 시각이 <b>반입 근거</b>라
     * 감사에 필요하기 때문이다.
     */
    private String archiveBatch(Path batchDir, String batchId) {
        try {
            Path batchesRoot = Paths.get(properties.getBatchesRoot());
            Files.createDirectories(batchesRoot);
            Path destination = batchesRoot.resolve(batchId);
            if (Files.exists(destination)) {
                deleteTree(destination);
            }
            Files.move(batchDir, destination, StandardCopyOption.REPLACE_EXISTING);
            return repoRelative(destination);
        } catch (IOException exc) {
            throw new ApiException(500, "배치를 보관하지 못했습니다: " + exc.getMessage());
        }
    }

    private static void deleteTree(Path dir) throws IOException {
        Files.walkFileTree(dir, new java.nio.file.SimpleFileVisitor<Path>() {
            @Override
            public java.nio.file.FileVisitResult visitFile(Path file,
                    java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult postVisitDirectory(Path d, IOException exc)
                    throws IOException {
                Files.delete(d);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
    }

    private JsonNode readManifest(Path batchDir) {
        try {
            byte[] raw = Files.readAllBytes(batchDir.resolve("manifest.json"));
            return JSON.readTree(new String(raw, StandardCharsets.UTF_8));
        } catch (IOException exc) {
            // 여기 오기 전에 BatchSchema 가 이미 걸렀어야 한다.
            throw new ApiException(500, "manifest.json을 읽을 수 없습니다: " + exc.getMessage());
        }
    }

    /** 리포 안이면 상대경로로, 밖(테스트의 임시 폴더 등)이면 그대로. */
    private String repoRelative(Path path) {
        Path repoRoot = Paths.get(properties.getRepoRoot()).toAbsolutePath().normalize();
        Path resolved = path.toAbsolutePath().normalize();
        if (resolved.startsWith(repoRoot)) {
            return repoRoot.relativize(resolved).toString().replace('\\', '/');
        }
        return resolved.toString().replace('\\', '/');
    }
}
