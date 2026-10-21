package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 배치 폴더가 {@code collector/SCHEMA.md} v1 을 지키는지 검사한다 —
 * Python {@code contract/batch_schema.py} 의 이식.
 *
 * <p><b>중립 계약이다.</b> 망 밖(collector)과 망 안이 같은 규격을 본다. 파이썬 쪽은
 * 한 모듈을 양쪽이 import 해 "두 개의 진실"을 막았는데, 자바로 오면서 <b>언어가
 * 갈려 그 방법을 쓸 수 없다</b> — 이 파일이 파이썬 원본의 사본이라는 뜻이다.
 * ⚠️ <b>SCHEMA v2 가 나오면 {@code contract/batch_schema.py} 와 이 파일을 함께
 * 고쳐야 한다.</b> 한쪽만 고치면 수집기가 만든 배치를 망 안이 거부한다.
 *
 * <p>실패는 예외가 아니라 <b>메시지 목록</b>이다 — 사람이 배치를 고치려면 무엇이
 * 몇 번째에서 틀렸는지 한 번에 다 봐야 하기 때문이다(첫 오류에서 멈추지 않는다).
 */
public final class BatchSchema {

    private static final int[] SUPPORTED_SCHEMA_VERSIONS = {1};
    private static final Pattern DATE_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    /**
     * ⚠️ <b>이 정규식이 경로 이탈 방어다.</b> {@code /} · {@code \} · {@code ..} ·
     * {@code :} 를 애초에 허용하지 않으므로, 차단 목록으로 거르는 것보다 안전하다
     * (허용 목록 방식). {@code resolve} 하기 <b>전에</b> 이것부터 본다.
     */
    public static final Pattern BATCH_ID_RE =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}_\\d{4}_[a-z0-9-]+$");

    private static final String[] CONFIDENCE_VALUES = {"확정", "예상"};
    private static final String[] REQUIRED_RECORD_FIELDS = {"notice_id", "title", "institution", "evidence"};
    private static final Pattern WINDOWS_DRIVE = Pattern.compile("^[A-Za-z]:");

    private static final ObjectMapper JSON = new ObjectMapper();

    private BatchSchema() {
    }

    /** @return 오류 메시지 목록. 비어 있으면 통과. */
    public static List<String> validate(Path batchDir) {
        List<String> errors = new ArrayList<>();
        if (!Files.isDirectory(batchDir)) {
            errors.add("배치 디렉터리가 아닙니다: " + batchDir);
            return errors;
        }

        Path manifestPath = batchDir.resolve("manifest.json");
        if (!Files.isRegularFile(manifestPath)) {
            errors.add("manifest.json이 없습니다");
            return errors;
        }

        JsonNode manifest;
        try {
            byte[] raw = Files.readAllBytes(manifestPath);
            manifest = JSON.readTree(new String(raw, StandardCharsets.UTF_8));
        } catch (Exception exc) {
            errors.add("manifest.json을 읽을 수 없습니다: " + exc.getMessage());
            return errors;
        }

        // ⚠️ 상위 버전은 조용히 부분 처리하지 않는다(SCHEMA.md §⑨) — 모르는 규격을
        //    아는 만큼만 읽으면 빠진 필드가 "없는 값"으로 반입된다.
        JsonNode versionNode = manifest.path("schema_version");
        boolean supported = false;
        for (int v : SUPPORTED_SCHEMA_VERSIONS) {
            if (versionNode.isInt() && versionNode.asInt() == v) {
                supported = true;
            }
        }
        if (!supported) {
            errors.add("지원하지 않는 schema_version입니다: " + repr(versionNode));
            return errors;
        }

        JsonNode batchIdNode = manifest.path("batch_id");
        String batchId = batchIdNode.isTextual() ? batchIdNode.asText() : null;
        if (batchId == null || !BATCH_ID_RE.matcher(batchId).matches()) {
            errors.add("batch_id 형식이 잘못됐습니다: " + repr(batchIdNode));
        } else if (!batchId.equals(batchDir.getFileName().toString())) {
            errors.add("batch_id(" + batchId + ")와 폴더명(" + batchDir.getFileName() + ")이 다릅니다");
        }

        if (isBlank(manifest.path("collected_at"))) {
            errors.add("collected_at이 없습니다");
        }
        if (isBlank(manifest.path("source").path("slug"))) {
            errors.add("source.slug이 없습니다");
        }
        if (!Files.isRegularFile(batchDir.resolve("institutions.csv"))) {
            errors.add("institutions.csv가 없습니다");
        }

        JsonNode records = manifest.path("records");
        if (!records.isArray()) {
            errors.add("records가 배열이 아닙니다");
            return errors;
        }

        Set<String> seen = new LinkedHashSet<>();
        for (int i = 0; i < records.size(); i++) {
            errors.addAll(validateRecord(records.get(i), i, batchDir, seen));
        }
        return errors;
    }

    private static List<String> validateRecord(JsonNode record, int index, Path batchDir, Set<String> seen) {
        String where = "records[" + index + "]";
        List<String> errors = new ArrayList<>();
        if (!record.isObject()) {
            errors.add(where + ": 객체가 아닙니다");
            return errors;
        }

        for (String name : REQUIRED_RECORD_FIELDS) {
            if (isBlank(record.path(name))) {
                errors.add(where + "." + name + "이(가) 없습니다");
            }
        }

        JsonNode noticeId = record.path("notice_id");
        if (noticeId.isTextual()) {
            if (!seen.add(noticeId.asText())) {
                errors.add(where + ": notice_id가 중복입니다 (" + noticeId.asText() + ")");
            }
        }

        JsonNode institution = record.path("institution");
        if (institution.isObject() && isBlank(institution.path("name_ko"))) {
            errors.add(where + ".institution.name_ko가 없습니다");
        }

        JsonNode schedule = record.path("schedule");
        if (schedule.isObject()) {
            for (String key : new String[]{"posted_at", "deadline_at", "contract_end", "last_bid"}) {
                JsonNode value = schedule.path(key);
                if (!value.isMissingNode() && !value.isNull()
                        && !DATE_RE.matcher(value.asText()).matches()) {
                    errors.add(where + ".schedule." + key + ": YYYY-MM-DD가 아닙니다 (" + repr(value) + ")");
                }
            }
            JsonNode confidence = schedule.path("confidence");
            if (!confidence.isMissingNode() && !confidence.isNull()
                    && !Arrays.asList(CONFIDENCE_VALUES).contains(confidence.asText())) {
                errors.add(where + ".schedule.confidence: 허용값이 아닙니다 (" + repr(confidence) + ")");
            }
        }

        JsonNode attachments = record.path("attachments");
        if (attachments.isArray()) {
            for (JsonNode attachment : attachments) {
                errors.addAll(validateAttachment(attachment, where, batchDir));
            }
        }
        return errors;
    }

    /**
     * 첨부 경로 검사 — <b>네 겹</b>이다. 배치는 망 밖에서 만들어져 들어오므로
     * 여기 적힌 경로는 신뢰할 수 없는 입력이다.
     */
    private static List<String> validateAttachment(JsonNode attachment, String where, Path batchDir) {
        List<String> out = new ArrayList<>();
        if (!attachment.isTextual()) {
            out.add(where + ".attachments: 문자열 경로여야 합니다");
            return out;
        }
        String value = attachment.asText();
        if (value.startsWith("/") || WINDOWS_DRIVE.matcher(value).find()) {
            out.add(where + ".attachments: 절대경로는 허용되지 않습니다 (" + value + ")");
            return out;
        }
        if (hasParentRef(value)) {
            out.add(where + ".attachments: 상위 경로 참조는 허용되지 않습니다 (" + value + ")");
            return out;
        }
        if (!value.startsWith("files/")) {
            out.add(where + ".attachments: files/ 아래여야 합니다 (" + value + ")");
            return out;
        }
        if (!Files.isRegularFile(batchDir.resolve(value))) {
            out.add(where + ".attachments: 파일이 없습니다 (" + value + ")");
        }
        return out;
    }

    /** {@code Path(attachment).parts} 대응 — 구분자를 양쪽 다 본다(배치는 윈도우에서 올 수 있다). */
    private static boolean hasParentRef(String value) {
        for (String part : value.split("[/\\\\]")) {
            if ("..".equals(part)) {
                return true;
            }
        }
        return false;
    }

    /** 없음 · null · 빈 문자열을 모두 "없다"로 본다 — 원본 {@code not record.get(name)}. */
    private static boolean isBlank(JsonNode node) {
        return node.isMissingNode() || node.isNull()
                || (node.isTextual() && node.asText().isEmpty());
    }

    /** 원본 {@code !r} 자리 — 값이 없을 때 {@code None} 으로 보이는 것까지 맞춘다. */
    private static String repr(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return "None";
        }
        return node.isTextual() ? "'" + node.asText() + "'" : node.asText();
    }
}
