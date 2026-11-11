package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.dto.InboxImportResponse;
import com.kbstar.kgi.ggreport.web.dto.InboxValidateResponse;
import com.kbstar.kgi.ggreport.web.dto.RfpFileEntry;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.BatchSchema;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Stream;

/**
 * 반입 배치를 망 안 상태에 반영한다 — Task 5B.5.
 * Python {@code server/inbox_import.py} ({@code collector/SCHEMA.md} §⑥의 2·4·5·6단계).
 *
 * <p><b>망 경계</b>: 이 서비스는 <b>자기 파일시스템의 inbox 만 읽는다.</b> 망 밖을
 * 향한 요청도, 역방향 콜백도 만들지 않는다(SCHEMA.md §⑩-5).
 *
 * <p>NEXT 72(2026-11-11): DB 단계는 {@link InboxDbApplier}(별도 빈, 실제 트랜잭션), 링크·크기 사전 점검,
 * 같은 batch_id 재반입 시 보관본을 지우지 않고 접미사로 보존, 오류 문구에 내부 경로를 싣지 않음.
 */
@Service
public class InboxService {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** 읽기 상한(S5) — 264곳 CSV·수백 건 manifest 는 이보다 훨씬 작다. */
    public static final long MAX_MANIFEST_BYTES = 8L * 1024 * 1024;
    public static final long MAX_CSV_BYTES = 4L * 1024 * 1024;
    private static final int MAX_ERRORS_SHOWN = 20;
    private static final int MAX_ARCHIVE_COPIES = 999;

    private final InstitutionMapper institutions;
    private final InboxDbApplier dbApplier;
    private final AppProperties properties;

    public InboxService(InstitutionMapper institutions, InboxDbApplier dbApplier,
                        AppProperties properties) {
        this.institutions = institutions;
        this.dbApplier = dbApplier;
        this.properties = properties;
    }

    /**
     * {@code batch_id} 형식을 <b>먼저</b> 보고, 그 다음 실재를 본다.
     *
     * <p>⚠️ 경로 문자열을 차단 목록으로 거르지 않고 <b>형식(허용 목록)</b> 으로
     * 검사한다. {@link BatchSchema#BATCH_ID_RE} 는 {@code /} · {@code \} · {@code ..} ·
     * {@code :} 를 애초에 허용하지 않으므로 경로 이탈이 <b>구조적으로 불가능</b>하다.
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
        List<String> errors = validationErrors(resolveBatchDir(batchId));
        return new InboxValidateResponse(batchId, errors);
    }

    /** 파일 구조 사전 점검 → 통과하면 계약 검사(링크·과대 파일이면 BatchSchema 가 읽기 전에 멈춘다). */
    private List<String> validationErrors(Path batchDir) {
        List<String> pre = precheck(batchDir);
        return pre.isEmpty() ? BatchSchema.validate(batchDir) : pre;
    }

    /**
     * SCHEMA §⑤ 의 심볼릭 링크 금지와 manifest·CSV 크기 상한(NEXT 72 S5 일부).
     * ⚠️ Windows 디렉터리 junction 은 {@code isSymbolicLink} 가 false 라 잡지 못한다 — 알려진 한계.
     */
    List<String> precheck(Path batchDir) {
        List<String> errors = new ArrayList<>();
        if (Files.isSymbolicLink(batchDir)) {
            errors.add("배치 폴더가 심볼릭 링크입니다");
            return errors;
        }
        try (Stream<Path> walk = Files.walk(batchDir)) {   // 기본값: 링크를 따라가지 않는다
            walk.filter(Files::isSymbolicLink).limit(MAX_ERRORS_SHOWN).forEach(p ->
                    errors.add("심볼릭 링크는 허용되지 않습니다: "
                            + batchDir.relativize(p).toString().replace('\\', '/')));
        } catch (IOException | UncheckedIOException exc) {
            errors.add("배치 폴더를 읽을 수 없습니다");
            return errors;
        }
        checkSize(batchDir.resolve("manifest.json"), MAX_MANIFEST_BYTES, "manifest.json", errors);
        checkSize(batchDir.resolve("institutions.csv"), MAX_CSV_BYTES, "institutions.csv", errors);
        return errors;
    }

    private static void checkSize(Path file, long max, String label, List<String> errors) {
        try {
            if (Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) && Files.size(file) > max) {
                errors.add(label + ": 크기 상한(" + (max / (1024 * 1024)) + " MiB)을 넘습니다");
            }
        } catch (IOException exc) {
            errors.add(label + "을(를) 읽을 수 없습니다");
        }
    }

    /**
     * 배치를 반영한다 — 기관 upsert · 공고 upsert · 첨부 이동 · 배치 보관.
     *
     * <p>⚠️ <b>DB 를 먼저 커밋하고 파일을 나중에 옮긴다. 순서를 뒤집지 말 것.</b>
     * 파일부터 옮기면 DB 단계에서 실패했을 때 배치는 이미 inbox 에서 사라진 뒤라
     * <b>되돌릴 수도 재시도할 수도 없다.</b> 이 순서면 파일 단계가 실패해도 배치가
     * inbox 에 남아 사람이 고친 뒤 다시 부를 수 있고, DB 단계는 upsert 라 재실행이 안전하다.
     */
    public InboxImportResponse importBatch(String batchId) {
        Path batchDir = resolveBatchDir(batchId);

        List<String> errors = validationErrors(batchDir);
        if (!errors.isEmpty()) {
            throw ApiException.withDetail(422, Collections.singletonMap("errors", errors));
        }

        JsonNode manifest = readManifest(batchDir);
        String sourceSlug = manifest.path("source").path("slug").asText();
        JsonNode records = manifest.path("records");
        List<InstitutionImportRow> rows = readInstitutionRows(batchDir);

        // 다른 빈(InboxDbApplier)의 public @Transactional — 중간 레코드 실패 시 전체 롤백(S4).
        InboxDbApplier.Result db = dbApplier.apply(rows, sourceSlug, records);

        // ── 여기부터 파일 이동: 롤백이 없다 ────────────────────────────
        List<RfpFileEntry> rfpFiles = moveAttachments(batchDir, records);
        String archivedTo = archiveBatch(batchDir, batchId);

        return new InboxImportResponse(batchId, db.institutionIds, db.bidCases, rfpFiles, archivedTo);
    }

    /** CSV 를 읽어 파싱한다(트랜잭션 밖). 형식 오류는 422. */
    private List<InstitutionImportRow> readInstitutionRows(Path batchDir) {
        byte[] raw = readBounded(batchDir.resolve("institutions.csv"), MAX_CSV_BYTES, "institutions.csv");
        try {
            return InstitutionCsv.parse(raw);
        } catch (InstitutionCsv.CsvFormatException exc) {
            throw ApiException.withDetail(422,
                    Collections.singletonMap("errors",
                            Collections.singletonList("institutions.csv: " + exc.getMessage())));
        }
    }

    // ── 파일 단계 (롤백 없음) ─────────────────────────────────────────

    /**
     * 첨부를 {@code corpus/rfp/} 로 옮기고, <b>공고당 첫 번째만</b>
     * {@code institutions.rfp_path} 에 남긴다.
     *
     * <p>⚠️ 같은 파일명이면 덮어쓴다(S9 후반, 후속) — 배치 안 파일명이 {@code {notice_id}_{원본}} 이라
     * 같은 공고의 재수집으로 본다.
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
                    Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    stored.add(destination);
                }
                String nameKo = record.path("institution").path("name_ko").asText(null);
                String institutionId = nameKo == null ? null : institutions.selectIdByName(nameKo);
                String rfpPath = repoRelative(stored.get(0));
                institutions.updateRfpPath(institutionId, rfpPath);
                moved.add(new RfpFileEntry(institutionId, rfpPath));
            } catch (IOException exc) {
                throw new ApiException(500, "첨부를 옮기지 못했습니다.");   // 경로 등 내부 정보는 싣지 않는다
            }
        }
        return moved;
    }

    /**
     * 처리된 배치를 inbox 밖으로 치운다 — 그래야 inbox 가 "미처리만"이 된다.
     *
     * <p>지우지 않는 이유는 {@code evidence.url} 과 수집 시각이 <b>반입 근거</b>라 감사에 필요하기 때문이다.
     * 같은 batch_id 가 이미 보관돼 있으면 덮거나 지우지 않고 {@code _2}, {@code _3} … 을 붙인다(S9).
     * 정상 batch_id 는 {@code [a-z0-9-]+} 로 끝나 밑줄 접미사와 겹치지 않는다.
     */
    private String archiveBatch(Path batchDir, String batchId) {
        try {
            Path batchesRoot = Paths.get(properties.getBatchesRoot());
            Files.createDirectories(batchesRoot);
            Path destination = batchesRoot.resolve(batchId);
            for (int copy = 2; Files.exists(destination, LinkOption.NOFOLLOW_LINKS); copy++) {
                if (copy > MAX_ARCHIVE_COPIES) {
                    throw new ApiException(409, "같은 배치의 보관본이 너무 많습니다.");
                }
                destination = batchesRoot.resolve(batchId + "_" + copy);
            }
            Files.move(batchDir, destination);   // REPLACE_EXISTING 없음 — 경합 시 실패가 덮어쓰기보다 낫다
            return repoRelative(destination);
        } catch (IOException exc) {
            throw new ApiException(500, "배치를 보관하지 못했습니다.");
        }
    }

    private JsonNode readManifest(Path batchDir) {
        byte[] raw = readBounded(batchDir.resolve("manifest.json"), MAX_MANIFEST_BYTES, "manifest.json");
        try {
            return JSON.readTree(new String(raw, StandardCharsets.UTF_8));
        } catch (IOException exc) {
            // 여기 오기 전에 BatchSchema 가 이미 걸렀어야 한다.
            throw new ApiException(500, "manifest.json을 읽을 수 없습니다.");
        }
    }

    /** 링크를 따르지 않고(NOFOLLOW_LINKS) 상한을 넘으면 중단하며 읽는다(Java 8). */
    private static byte[] readBounded(Path file, long max, String label) {
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            long total = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > max) {
                    throw ApiException.withDetail(422, Collections.singletonMap("errors",
                            Collections.singletonList(label + ": 크기 상한을 넘습니다")));
                }
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (IOException exc) {
            throw new ApiException(500, label + "을(를) 읽을 수 없습니다.");
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
