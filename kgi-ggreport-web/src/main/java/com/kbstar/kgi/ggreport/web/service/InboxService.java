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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    private static final Logger log = LoggerFactory.getLogger(InboxService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    /** 읽기 상한(S5) — 264곳 CSV·수백 건 manifest 는 이보다 훨씬 작다. */
    public static final long MAX_MANIFEST_BYTES = 8L * 1024 * 1024;
    public static final long MAX_CSV_BYTES = 4L * 1024 * 1024;
    private static final int MAX_ERRORS_SHOWN = 20;
    private static final int MAX_ARCHIVE_COPIES = 999;

    private final InstitutionMapper institutions;
    private final InboxDbApplier dbApplier;
    private final AppProperties properties;
    private final ExtCheckImporter extChecks;

    public InboxService(InstitutionMapper institutions, InboxDbApplier dbApplier,
                        AppProperties properties, ExtCheckImporter extChecks) {
        this.institutions = institutions;
        this.dbApplier = dbApplier;
        this.properties = properties;
        this.extChecks = extChecks;
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
            if (walk.anyMatch(Files::isSymbolicLink)) {
                errors.add("심볼릭 링크는 허용되지 않습니다");   // 이름·위치는 싣지 않는다
            }
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
    public Object importBatch(String batchId) {
        Path batchDir = resolveBatchDir(batchId);

        List<String> errors = validationErrors(batchDir);
        if (!errors.isEmpty()) {
            throw ApiException.withDetail(422, Collections.singletonMap("errors", errors));
        }

        JsonNode manifest = readManifest(batchDir);
        JsonNode checks = manifest.path("checks");
        if (!checks.isMissingNode() && !checks.isNull()) {
            return importExternalChecks(batchDir, batchId, manifest);
        }
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

    /**
     * 외부 확인 배치(NEXT 90 2단계) — 검사·제외·보관만, DB 는 쓰지 않는다. records 와 섞인 배치는 거부한다(반쪽 반영 방지, 아무것도 지우지 않음).
     * 구조가 안전하지 않으면(링크·junction) 422 로 끝내고 <b>아무것도 지우지 않는다</b>. 그 밖에는 결과(422·500 포함)와 상관없이
     * 원본(files/·CSV 등)을 지우고, manifest 를 값 없는 보관본으로 다시 써서 배치를 보관 폴더로 옮긴다.
     * <b>원본을 다 지우지 못했으면 보관 폴더로 옮기지 않고 inbox 에 남긴다</b>(하-10). 모든 실패 응답의 detail 에 {@code originals_deleted} 가 들어간다.
     */
    private Map<String, Object> importExternalChecks(Path batchDir, String batchId, JsonNode manifest) {
        JsonNode records = manifest.path("records");
        if (records.isArray() && records.size() > 0) {
            throw withOriginalsDeleted(ApiException.withDetail(422, Collections.singletonMap("errors",
                    Collections.singletonList("MIXED_BATCH_NOT_SUPPORTED: 외부 확인(checks)과 records 를 한 배치에 섞을 수 없습니다"))), false);
        }
        ExtCheckImporter.Result r;
        try {
            r = extChecks.process(batchDir, batchId, manifest);
        } catch (ApiException e) {
            throw withOriginalsDeleted(e, false);               // 구조 거부(LINK_NOT_ALLOWED) — 아무것도 지우지 않았다
        }
        boolean originalsDeleted = ExtCheckImporter.scrub(batchDir);
        boolean manifestRewritten = true;
        try {
            Path m = batchDir.resolve("manifest.json");
            Path t = batchDir.resolve("manifest.json.new");
            Files.write(t, r.archiveManifest);
            Files.move(t, m, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exc) {
            manifestRewritten = false;
            try {   // 원문 글자가 보관되지 않게 — 못 다시 쓰면 지운다
                Files.deleteIfExists(batchDir.resolve("manifest.json"));
            } catch (IOException ignore) {
                originalsDeleted = false;
            }
        }
        String archivedTo = null;
        if (originalsDeleted) {
            try {
                archivedTo = archiveBatch(batchDir, batchId);
            } catch (ApiException e) {
                throw withOriginalsDeleted(e, true);            // 원본은 지웠고 보관 이동만 실패
            }
        } else {
            // 원본이 남은 채로 batches 로 옮기면 원문이 보관본에 섞인다. inbox 에 두고 사람이 정리한다(batch_id 는 형식 검사를 통과한 값).
            log.error("외부 확인 원본을 모두 지우지 못해 배치를 inbox 에 남깁니다. batch_id={}", batchId);
        }
        if (r.failure != null) {
            throw withOriginalsDeleted(r.failure, originalsDeleted);
        }
        if (!manifestRewritten) {
            throw withOriginalsDeleted(new ApiException(500, "보관 manifest 를 다시 쓰지 못했습니다."), originalsDeleted);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>(r.response);
        out.put("originals_deleted", originalsDeleted);
        out.put("archived_to", archivedTo);                     // 옮기지 않았으면 null
        return out;
    }

    /** 실패 응답의 detail 에 originals_deleted 를 더한다. 기존 detail 객체의 키는 그대로 두고, 문자열 사유(500 등)는 고정 문구 객체로 바꾼다. */
    private static ApiException withOriginalsDeleted(ApiException e, boolean deleted) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        Object o = e.getDetailObject();
        if (o instanceof Map) {
            for (Map.Entry<?, ?> en : ((Map<?, ?>) o).entrySet()) {
                d.put(String.valueOf(en.getKey()), en.getValue());
            }
        } else {
            d.put("code", "EXTERNAL_CHECK_FAILED");
            d.put("message", e.getMessage() != null ? e.getMessage() : "외부 확인 배치를 처리하지 못했습니다.");   // 서비스가 만든 고정 한글 문구
        }
        d.put("originals_deleted", deleted);
        return ApiException.withDetail(e.getStatus(), d);
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
