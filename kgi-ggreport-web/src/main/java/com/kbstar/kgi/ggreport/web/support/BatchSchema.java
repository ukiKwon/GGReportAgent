package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
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
    /** checks[] 가 생긴 minor (SCHEMA.md ④-2). contract/batch_schema.py 와 같은 값. */
    private static final int SCHEMA_MINOR_MAX = 1;
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
            errors.add("manifest.json을 읽을 수 없습니다");   // 예외 문구에는 manifest 조각이 들어갈 수 있어 싣지 않는다(security 하-4)
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

        // checks 가 있는데 minor 를 모르면 조용히 버리지 않고 배치를 거부한다(security 1차 (e)).
        final boolean hasChecks = !absent(manifest.path("checks"));
        if (hasChecks) {
            JsonNode minor = manifest.path("schema_minor");
            if (!(minor.isInt() && minor.asInt() >= 1 && minor.asInt() <= SCHEMA_MINOR_MAX)) {
                errors.add("UNSUPPORTED_MINOR: schema_minor가 없거나 지원 범위(1~" + SCHEMA_MINOR_MAX + ")를 벗어났습니다");
                return errors;
            }
        }

        JsonNode batchIdNode = manifest.path("batch_id");
        String batchId = batchIdNode.isTextual() ? batchIdNode.asText() : null;
        if (batchId == null || !BATCH_ID_RE.matcher(batchId).matches()) {
            errors.add("batch_id 형식이 잘못됐습니다: " + repr(batchIdNode));
        } else if (!batchId.equals(batchDir.getFileName().toString())) {
            errors.add("batch_id(" + batchId + ")와 폴더명(" + batchDir.getFileName() + ")이 다릅니다");
        }
        if (hasChecks && batchId != null && BATCH_ID_RE.matcher(batchId).matches() && !batchId.contains(EXTCHECK_PREFIX)) {
            errors.add("batch_id: checks 배치는 'extcheck'를 포함해야 합니다");     // 받은 값은 싣지 않는다
        }

        if (isBlank(manifest.path("collected_at"))) {
            errors.add("collected_at이 없습니다");
        }
        JsonNode slugNode = manifest.path("source").path("slug");
        if (isBlank(slugNode)) {
            errors.add("source.slug이 없습니다");
        } else if (hasChecks && !(slugNode.isTextual() && slugNode.asText().startsWith(EXTCHECK_PREFIX))) {
            errors.add("source.slug: checks 배치는 'extcheck'로 시작해야 합니다");
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
        errors.addAll(validateChecks(manifest, batchDir));
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
            out.add(where + ".attachments: 절대경로는 허용되지 않습니다");
            return out;
        }
        if (hasParentRef(value)) {
            out.add(where + ".attachments: 상위 경로 참조는 허용되지 않습니다");
            return out;
        }
        if (!value.startsWith("files/")) {
            out.add(where + ".attachments: files/ 아래여야 합니다");
            return out;
        }
        if (!Files.isRegularFile(batchDir.resolve(value))) {
            out.add(where + ".attachments: 파일이 없습니다");
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

    // ── checks[] — SCHEMA.md ④-2 (v1.1). 형식만 본다. 개인정보·파일 내용 검사는 서버의 별도 단계다. ──
    // ⚠️ contract/batch_schema.py 의 _validate_checks 와 한 쌍이다. 오류 문구에는 받은 값을 싣지 않는다.
    private static final int MAX_CHECKS = 2000;
    private static final int MAX_CHECK_ATTACHMENTS = 5;
    private static final long MAX_FILE_BYTES = 20L * 1024 * 1024;
    private static final long MAX_BATCH_BYTES = 200L * 1024 * 1024;
    private static final int MAX_REPORTED_COUNT = 100000;
    private static final int MAX_CHECK_PATH_LEN = 86;
    private static final String[] CHECK_STATUSES = {"found", "not_found", "error"};
    private static final String[] CHECK_KINDS = {"notice", "press"};
    private static final String[] CONFIDENCE_LEVELS = {"high", "mid", "low"};
    private static final String[] REPORTED_SCOPES = {"body", "meta", "annot", "form", "bookmark", "filename"};
    public static final Pattern CHECK_ID_RE = Pattern.compile("[A-Za-z0-9_-]{1,40}");
    private static final Pattern SOURCE_SLUG_RE = Pattern.compile("[a-z0-9-]{1,30}");
    /** checks 배치의 source.slug 접두·batch_id 포함 규칙 — .gitignore 의 corpus/inbox/(extcheck 포함 폴더) 규칙과 짝. contract/batch_schema.py 의 EXTCHECK_PREFIX 와 같은 값. */
    private static final String EXTCHECK_PREFIX = "extcheck";
    private static final Pattern CODE_RE = Pattern.compile("[a-z_]{1,30}");
    private static final Pattern REGION_RE = Pattern.compile("[0-9]{2,5}");
    private static final Pattern DATE_STRICT_RE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}");
    private static final Pattern DATETIME_RE = Pattern.compile(
            "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?[+-][0-9]{2}:[0-9]{2}");
    private static final Pattern URL_RE = Pattern.compile("https?://[\\x21-\\x7E]{1,490}");
    private static final Pattern SHA256_RE = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern CHECK_PATH_RE = Pattern.compile("files/(?!\\.)[A-Za-z0-9._-]+\\.(?:pdf|hwp|hwpx)");
    private static final Pattern RESERVED_NAME_RE = Pattern.compile("(?i)con|prn|aux|nul|com[1-9]|lpt[1-9]");
    private static final Pattern TOOL_RE = Pattern.compile("[A-Za-z0-9._ -]{1,40}");

    private static boolean absent(JsonNode n) { return n.isMissingNode() || n.isNull(); }
    private static boolean fullMatch(Pattern p, JsonNode n) { return n.isTextual() && p.matcher(n.asText()).matches(); }
    private static boolean optMatch(Pattern p, JsonNode n) { return absent(n) || fullMatch(p, n); }
    private static boolean inSet(JsonNode n, String[] allowed) {
        return n.isTextual() && Arrays.asList(allowed).contains(n.asText());
    }
    private static boolean intInRange(JsonNode n, long lo, long hi) {
        return n.isIntegralNumber() && n.canConvertToLong() && n.asLong() >= lo && n.asLong() <= hi;
    }
    private static boolean optText(JsonNode n, int max) { return absent(n) || textOk(n, max); }

    /** 비어 있지 않은 문자열, 코드 포인트 길이 상한, 제어·서식·줄/문단 구분·짝 없는 서로게이트 문자 없음. */
    private static boolean textOk(JsonNode n, int max) {
        if (!n.isTextual()) {
            return false;
        }
        String s = n.asText();
        if (s.trim().isEmpty() || s.codePointCount(0, s.length()) > max) {
            return false;
        }
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            int t = Character.getType(cp);
            if (t == Character.CONTROL || t == Character.FORMAT || t == Character.LINE_SEPARATOR
                    || t == Character.PARAGRAPH_SEPARATOR || t == Character.SURROGATE) {
                return false;
            }
        }
        return true;
    }

    private static List<String> validateChecks(JsonNode manifest, Path batchDir) {
        List<String> errors = new ArrayList<>();
        JsonNode checks = manifest.path("checks");
        if (absent(checks)) {
            return errors;
        }
        if (!checks.isArray()) {
            errors.add("checks가 배열이 아닙니다");
            return errors;
        }
        if (checks.size() > MAX_CHECKS) {
            errors.add("checks 건수가 상한(" + MAX_CHECKS + ")을 넘습니다");
            return errors;
        }
        Set<String> ids = new LinkedHashSet<>();
        Set<String> paths = new LinkedHashSet<>();
        long[] total = {0L};
        for (int i = 0; i < checks.size(); i++) {
            errors.addAll(validateCheck(checks.get(i), i, batchDir, ids, paths, total));
        }
        if (total[0] > MAX_BATCH_BYTES) {
            errors.add("checks 첨부 합계가 상한(200 MiB)을 넘습니다");
        }
        return errors;
    }

    private static List<String> validateCheck(JsonNode check, int index, Path batchDir,
                                              Set<String> ids, Set<String> paths, long[] total) {
        String where = "checks[" + index + "]";
        List<String> errors = new ArrayList<>();
        if (!check.isObject()) {
            errors.add(where + ": 객체가 아닙니다");
            return errors;
        }
        JsonNode id = check.path("check_id");
        if (!fullMatch(CHECK_ID_RE, id)) {
            errors.add(where + ".check_id: 형식이 잘못됐습니다");
        } else if (!ids.add(id.asText().toLowerCase(Locale.ROOT))) {   // Windows 는 대소문자를 구분하지 않는다
            errors.add(where + ".check_id: 중복입니다");
        }

        JsonNode inst = check.path("institution");
        if (!inst.isObject()) {
            errors.add(where + ".institution: 객체가 아닙니다");
        } else {
            if (!textOk(inst.path("name_ko"), 100)) {
                errors.add(where + ".institution.name_ko: 형식이 잘못됐습니다");
            }
            if (!optText(inst.path("type"), 30)) {
                errors.add(where + ".institution.type: 형식이 잘못됐습니다");
            }
            for (String key : new String[]{"region_code", "sub_region_code"}) {
                if (!optMatch(REGION_RE, inst.path(key))) {
                    errors.add(where + ".institution." + key + ": 형식이 잘못됐습니다");
                }
            }
        }

        JsonNode statusNode = check.path("status");
        if (!inSet(statusNode, CHECK_STATUSES)) {
            errors.add(where + ".status: 허용값이 아닙니다");
        }
        String status = statusNode.isTextual() ? statusNode.asText() : "";
        if (!fullMatch(DATETIME_RE, check.path("checked_at"))) {
            errors.add(where + ".checked_at: 형식이 잘못됐습니다");
        }
        JsonNode kindNode = check.path("source_kind");
        if (!inSet(kindNode, CHECK_KINDS)) {
            errors.add(where + ".source_kind: 허용값이 아닙니다");
        }
        String kind = kindNode.isTextual() ? kindNode.asText() : "";
        if (!fullMatch(SOURCE_SLUG_RE, check.path("source_slug"))) {
            errors.add(where + ".source_slug: 형식이 잘못됐습니다");
        }

        JsonNode code = check.path("error_code");
        boolean codeOk = "error".equals(status) ? fullMatch(CODE_RE, code) : optMatch(CODE_RE, code);
        if (!codeOk) {
            errors.add(where + ".error_code: 형식이 잘못됐습니다");
        }
        if ("found".equals(status)) {
            errors.addAll(validateFound(check, where, kind));
        }

        JsonNode attachments = check.path("attachments");
        if (!absent(attachments)) {
            if (!attachments.isArray() || attachments.size() > MAX_CHECK_ATTACHMENTS) {
                errors.add(where + ".attachments: 배열이 아니거나 건수 상한(" + MAX_CHECK_ATTACHMENTS + ")을 넘습니다");
            } else {
                for (int j = 0; j < attachments.size(); j++) {
                    errors.addAll(validateCheckAttachment(attachments.get(j),
                            where + ".attachments[" + j + "]", batchDir, paths, total));
                }
            }
        }
        return errors;
    }

    private static List<String> validateFound(JsonNode check, String where, String kind) {
        List<String> out = new ArrayList<>();
        JsonNode match = check.path("match");
        if (!match.isObject()) {
            out.add(where + ".match: 객체가 아닙니다");
        } else {
            if (!inSet(match.path("confidence"), CONFIDENCE_LEVELS)) {
                out.add(where + ".match.confidence: 허용값이 아닙니다");
            }
            JsonNode basis = match.path("basis");
            boolean ok = basis.isArray() && basis.size() >= 1 && basis.size() <= 6;
            if (ok) {
                for (JsonNode b : basis) {
                    ok = ok && fullMatch(CODE_RE, b);
                }
            }
            if (!ok) {
                out.add(where + ".match.basis: 형식이 잘못됐습니다");
            }
        }
        if ("notice".equals(kind)) {
            JsonNode n = check.path("notice");
            if (!n.isObject()) {
                out.add(where + ".notice: 객체가 아닙니다");
            } else {
                if (!textOk(n.path("title"), 300)) {
                    out.add(where + ".notice.title: 형식이 잘못됐습니다");
                }
                if (!optText(n.path("number"), 60)) {
                    out.add(where + ".notice.number: 형식이 잘못됐습니다");
                }
                for (String key : new String[]{"posted_at", "deadline_at"}) {
                    if (!optMatch(DATE_STRICT_RE, n.path(key))) {
                        out.add(where + ".notice." + key + ": YYYY-MM-DD가 아닙니다");
                    }
                }
                if (!optMatch(URL_RE, n.path("url"))) {
                    out.add(where + ".notice.url: 형식이 잘못됐습니다");
                }
            }
        } else if ("press".equals(kind)) {
            JsonNode p = check.path("press");
            if (!p.isObject()) {
                out.add(where + ".press: 객체가 아닙니다");
            } else {
                if (!textOk(p.path("title"), 200)) {
                    out.add(where + ".press.title: 형식이 잘못됐습니다");
                }
                if (!optText(p.path("publisher"), 60)) {
                    out.add(where + ".press.publisher: 형식이 잘못됐습니다");
                }
                if (!optMatch(DATE_STRICT_RE, p.path("published_at"))) {
                    out.add(where + ".press.published_at: YYYY-MM-DD가 아닙니다");
                }
                if (!optMatch(URL_RE, p.path("url"))) {
                    out.add(where + ".press.url: 형식이 잘못됐습니다");
                }
            }
        }
        return out;
    }

    private static List<String> validateCheckAttachment(JsonNode att, String w, Path batchDir,
                                                        Set<String> paths, long[] total) {
        List<String> out = new ArrayList<>();
        if (!att.isObject()) {
            out.add(w + ": 객체가 아닙니다");
            return out;
        }
        JsonNode pathNode = att.path("path");
        boolean pathOk = false;
        if (pathNode.isTextual()) {
            String p = pathNode.asText();
            pathOk = p.length() <= MAX_CHECK_PATH_LEN && CHECK_PATH_RE.matcher(p).matches()
                    && !RESERVED_NAME_RE.matcher(p.substring(6).split("\\.", 2)[0]).matches();
        }
        if (!pathOk) {
            out.add(w + ".path: 허용되지 않는 경로 형식입니다");           // 받은 값은 싣지 않는다
        } else if (!paths.add(pathNode.asText().toLowerCase(Locale.ROOT))) {
            out.add(w + ".path: 중복입니다");
        } else if (!Files.isRegularFile(batchDir.resolve(pathNode.asText()), LinkOption.NOFOLLOW_LINKS)) {
            out.add(w + ".path: 파일이 없습니다");
        }
        if (!fullMatch(SHA256_RE, att.path("sha256"))) {
            out.add(w + ".sha256: 형식이 잘못됐습니다");
        }
        JsonNode size = att.path("size");
        if (intInRange(size, 1, MAX_FILE_BYTES)) {
            total[0] += size.asLong();
        } else {
            out.add(w + ".size: 1바이트~20 MiB 정수여야 합니다");
        }
        for (String key : new String[]{"reported_tool", "reported_version"}) {
            if (!optMatch(TOOL_RE, att.path(key))) {
                out.add(w + "." + key + ": 형식이 잘못됐습니다");
            }
        }
        for (String key : new String[]{"reported_phones_removed", "reported_landlines_masked", "reported_emails_masked"}) {
            JsonNode v = att.path(key);
            if (!absent(v) && !intInRange(v, 0, MAX_REPORTED_COUNT)) {
                out.add(w + "." + key + ": 0 이상 정수여야 합니다");
            }
        }
        JsonNode scope = att.path("reported_scope");
        if (!absent(scope)) {
            boolean ok = scope.isArray() && scope.size() <= REPORTED_SCOPES.length;
            if (ok) {
                for (JsonNode s : scope) {
                    ok = ok && inSet(s, REPORTED_SCOPES);
                }
            }
            if (!ok) {
                out.add(w + ".reported_scope: 허용값이 아닙니다");
            }
        }
        return out;
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
