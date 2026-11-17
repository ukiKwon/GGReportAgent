package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckExcl;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckFile;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 외부 확인(checks[]) 반입 2~3단계 — 검사·제외·보관 + 저장할 행(042) 만들기. <b>DB 쓰기는 호출자(InboxService → ExtCheckStore)</b> 가 한다.
 *
 * <p>공통 순서(설계 v3 §4): ① batchDir·files/ 실제 경로 확인(링크·junction 거부) ② 선언 파일을 NOFOLLOW 로 열어 서버 임시 폴더로 복사하며
 * 바이트·sha256 확인 — 이후 검사·저장은 모두 사본에서 ③ check 단위 판정(manifest 글자 + 첨부) ④ 통과 check 의 첨부만
 * {@code corpus/ext_check/<CHECK_KEY>/<check_id>_<순번>.<확장자>} 로 보관 ⑤ 처리 뒤(422 포함) 원본 삭제·보관 manifest 재작성은 호출자(InboxService)가 한다.
 *
 * <p>응답·오류에는 파일명·경로·값을 싣지 않는다 — 사유 코드·위치 코드·건수·check_id(형식 검사 통과값)·서버가 만든 키/이름뿐이다.
 */
@Service
public class ExtCheckImporter {

    /** true = 걸린 check 만 제외(기본), false = 하나라도 걸리면 묶음 전체 422(팀이 바꿀 수 있는 스위치). */
    static final boolean EXCLUDE_PER_CHECK = true;

    private static final long MAX_FILE_BYTES = 20L * 1024 * 1024;
    private static final int MAX_ROWS_PER_CHECK = 20;
    /** EXT_CHECK_EXCL 에 남기는 check 당 사유 행 상한 */
    private static final int MAX_EXCL_ROWS_STORED = 100;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties properties;
    private final InstitutionMapper institutions;

    public ExtCheckImporter(AppProperties properties, InstitutionMapper institutions) {
        this.properties = properties;
        this.institutions = institutions;
    }

    /** 처리 결과. failure 가 있으면 호출자는 정리(원본 삭제·manifest 재작성·보관) 뒤 그것을 던진다. */
    static final class Result {
        final Map<String, Object> response = new LinkedHashMap<String, Object>();
        final List<ExtCheck> saves = new ArrayList<ExtCheck>();           // 저장할 통과 check(+첨부 행)
        final List<ExtCheckExcl> excls = new ArrayList<ExtCheckExcl>();   // 제외 이력(사유·위치·건수)
        final List<Path> storedDirs = new ArrayList<Path>();              // 저장 실패 때 되돌릴 보관 폴더
        byte[] archiveManifest;
        ApiException failure;
    }

    private static final class Row {
        final String reason;
        final String locator;
        final int seq;          // 0 = check 자체, 1.. = 첨부 순번
        int count;

        Row(String reason, String locator, int seq, int count) {
            this.reason = reason;
            this.locator = locator;
            this.seq = seq;
            this.count = count;
        }
    }

    private static final class Staged {
        final Path file;
        final String ext;
        final int seq;
        final String sha;
        final long size;

        Staged(Path file, String ext, int seq, String sha, long size) {
            this.file = file;
            this.ext = ext;
            this.seq = seq;
            this.sha = sha;
            this.size = size;
        }
    }

    private static final class BatchReject extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String code;

        BatchReject(String code, String message, String where) {
            super(code + ": " + message + " (" + where + ")", null, false, false);
            this.code = code;
        }

        ApiException toApi() {
            return ApiException.withDetail(422, Collections.singletonMap("errors", Collections.singletonList(getMessage())));
        }
    }

    // ── 처리 ──────────────────────────────────────────────────────────

    /**
     * @throws ApiException 422 LINK_NOT_ALLOWED — 구조가 안전하지 않으면 <b>아무것도 지우지 않고</b> 던진다
     *         (junction 을 따라가 밖의 파일을 지우지 않기 위해서다).
     */
    Result process(Path batchDir, String batchId, JsonNode manifest) {
        Path filesReal = verifyLayout(batchDir, batchId);
        JsonNode checks = manifest.path("checks");
        List<Map<String, Object>> passed = new ArrayList<Map<String, Object>>();
        List<Map<String, Object>> excluded = new ArrayList<Map<String, Object>>();
        List<Path> storedDirs = new ArrayList<Path>();
        List<ExtCheck> saves = new ArrayList<ExtCheck>();
        List<ExtCheckExcl> excls = new ArrayList<ExtCheckExcl>();
        String now = Times.nowIso();
        ArrayNode archived = JSON.createArrayNode();
        Path tmp = null;
        ApiException failure = null;
        String failureCode = null;
        try {
            tmp = Files.createTempDirectory("extchk-");
            for (int i = 0; i < checks.size(); i++) {
                evalCheck(checks.get(i), i, batchDir, filesReal, tmp, passed, excluded, storedDirs, archived, batchId, now, saves, excls);
            }
        } catch (BatchReject r) {
            failure = r.toApi();
            failureCode = r.code;
        } catch (IOException e) {
            failure = new ApiException(500, "외부 확인 첨부를 처리하지 못했습니다.");
            failureCode = "PROCESSING_FAILED";
        } catch (RuntimeException e) {
            failure = new ApiException(500, "외부 확인 첨부를 처리하지 못했습니다.");
            failureCode = "PROCESSING_FAILED";
        } finally {
            if (tmp != null) {
                deleteTree(tmp);
            }
        }
        if (failure == null && !EXCLUDE_PER_CHECK && !excluded.isEmpty()) {
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "EXTERNAL_CHECK_REJECTED");
            d.put("excluded", excluded);
            failure = ApiException.withDetail(422, d);
            failureCode = "EXTERNAL_CHECK_REJECTED";
        }
        if (failure != null) {                       // 묶음 거부 — 이미 보관한 것도 되돌린다
            for (Path d : storedDirs) {
                deleteTree(d);
            }
            passed.clear();
            archived.removeAll();
            saves.clear();
            excls.clear();
            storedDirs.clear();          // 위 반복에서 이미 지웠다
        }
        Result res = new Result();
        res.failure = failure;
        res.saves.addAll(saves);
        res.excls.addAll(excls);
        res.storedDirs.addAll(storedDirs);
        res.archiveManifest = archiveManifest(manifest, archived, failureCode);
        res.response.put("batch_id", batchId);
        res.response.put("kind", "external_checks");
        res.response.put("checks_total", checks.size());
        res.response.put("passed_count", passed.size());
        res.response.put("excluded_count", countDistinctChecks(excluded));
        res.response.put("passed", passed);
        res.response.put("excluded", excluded);
        return res;
    }

    private static int countDistinctChecks(List<Map<String, Object>> excluded) {
        java.util.Set<Object> ids = new java.util.LinkedHashSet<Object>();
        for (Map<String, Object> m : excluded) {
            ids.add(m.get("check_id"));
        }
        return ids.size();
    }

    private void evalCheck(JsonNode check, int index, Path batchDir, Path filesReal, Path tmp,
                           List<Map<String, Object>> passed, List<Map<String, Object>> excluded,
                           List<Path> storedDirs, ArrayNode archived,
                           String batchId, String now, List<ExtCheck> saves, List<ExtCheckExcl> excls) throws IOException {
        String checkId = check.path("check_id").asText();     // 형식 검사 통과값 [A-Za-z0-9_-]{1,40}
        List<Row> rows = new ArrayList<Row>();

        scanField(rows, check.path("institution").path("name_ko"), "institution");
        scanField(rows, check.path("institution").path("type"), "institution");
        scanField(rows, check.path("notice").path("title"), "notice");
        scanField(rows, check.path("notice").path("number"), "notice");
        scanUrl(rows, check.path("notice").path("url"), "notice");
        scanField(rows, check.path("press").path("title"), "press");
        scanField(rows, check.path("press").path("publisher"), "press");
        scanUrl(rows, check.path("press").path("url"), "press");

        String nameKo = check.path("institution").path("name_ko").asText(null);
        String institutionId = nameKo == null ? null : institutions.selectIdByName(nameKo);
        if (institutionId == null) {
            addRow(rows, "INSTITUTION_NOT_FOUND", "institution", 0, 1);
        }

        List<Staged> staged = new ArrayList<Staged>();
        JsonNode atts = check.path("attachments");
        if (rows.isEmpty() && atts.isArray()) {              // 이미 제외된 check 의 첨부는 열지 않는다
            for (int j = 0; j < atts.size(); j++) {
                JsonNode att = atts.get(j);
                int seq = j + 1;
                String where = "checks[" + index + "].attachments[" + j + "]";
                Path copy = copyToTemp(att, filesReal, tmp, index + "_" + seq, where);
                ExtCheckInspector.Outcome o = ExtCheckInspector.inspect(copy, ExtCheckInspector.extOf(att.path("path").asText()));
                if (o.hits.isEmpty()) {
                    staged.add(new Staged(copy, o.ext, seq, att.path("sha256").asText(), att.path("size").asLong()));
                } else {
                    for (ExtCheckInspector.Hit h : o.hits) {
                        addRow(rows, h.reason, h.locator, seq, h.count);
                    }
                }
            }
        }

        if (!rows.isEmpty()) {
            int shown = 0;
            ObjectNode ex = archived.addObject();
            ex.put("check_id", checkId);
            ex.put("excluded", true);
            ArrayNode reasons = ex.putArray("reasons");
            for (Row r : rows) {
                reasons.add(r.reason + "@" + r.locator);
                if (shown < MAX_EXCL_ROWS_STORED) {
                    excls.add(new ExtCheckExcl(batchId, checkId, r.seq, clip(r.reason, 30), clip(r.locator, 20), r.count, now));
                }
                if (shown++ < MAX_ROWS_PER_CHECK) {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("check_id", checkId);
                    m.put("reason", r.reason);
                    m.put("locator", r.locator);
                    m.put("count", r.count);
                    m.put("file_seq", r.seq);
                    excluded.add(m);
                }
            }
            return;
        }

        String key = randomKey();
        List<Map<String, Object>> files = new ArrayList<Map<String, Object>>();
        List<ExtCheckFile> fileRows = new ArrayList<ExtCheckFile>();
        if (!staged.isEmpty()) {
            Path dir = Paths.get(properties.getExtCheckRoot()).resolve(key);
            Files.createDirectories(dir);
            storedDirs.add(dir);
            for (Staged s : staged) {
                String stored = checkId + "_" + s.seq + "." + s.ext;     // 서버가 만든 이름 — 원본 파일명은 쓰지 않는다
                Files.copy(s.file, dir.resolve(stored));
                Map<String, Object> f = new LinkedHashMap<String, Object>();
                f.put("seq", s.seq);
                f.put("stored_name", key + "/" + stored);
                f.put("ext", s.ext);
                files.add(f);
                fileRows.add(new ExtCheckFile(key, s.seq, s.ext, key + "/" + stored, s.sha, s.size));
            }
        }
        Map<String, Object> p = new LinkedHashMap<String, Object>();
        p.put("check_id", checkId);
        p.put("institution_id", institutionId);
        p.put("check_key", key);
        p.put("files", files);
        passed.add(p);
        archived.add(sanitized(check, key, files));
        saves.add(toRow(check, key, institutionId, batchId, checkId, now, fileRows));
    }

    /** 저장 행 — 검사를 통과한 글자만. url 은 ? # 아래를 자른 값. */
    private static ExtCheck toRow(JsonNode c, String key, String institutionId, String batchId, String checkId,
                                  String now, List<ExtCheckFile> files) {
        ExtCheck e = new ExtCheck();
        e.setCheckKey(key);
        e.setInstitutionId(institutionId);
        e.setBatchId(batchId);
        e.setCheckId(checkId);
        e.setCheckedAt(text(c.path("checked_at")));
        String kind = text(c.path("source_kind"));
        e.setSourceKind(kind);
        e.setSourceSlug(text(c.path("source_slug")));
        e.setStatusCd(text(c.path("status")));
        e.setErrorCd(text(c.path("error_code")));
        JsonNode m = c.path("match");
        e.setMatchConf(text(m.path("confidence")));
        if (m.path("basis").isArray()) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode b : m.path("basis")) {
                if (b.isTextual()) {
                    sb.append(sb.length() == 0 ? "" : ",").append(b.asText());
                }
            }
            e.setMatchBasis(sb.length() == 0 ? null : sb.toString());
        }
        boolean press = "press".equals(kind);
        JsonNode body = press ? c.path("press") : c.path("notice");
        e.setTitle(text(body.path("title")));
        if (press) {
            e.setPublisher(text(body.path("publisher")));
            e.setPostedAt(text(body.path("published_at")));
        } else {
            e.setItemNo(text(body.path("number")));
            e.setPostedAt(text(body.path("posted_at")));
            e.setDeadlineAt(text(body.path("deadline_at")));
        }
        String url = text(body.path("url"));
        e.setSrcUrl(url == null ? null : cutUrl(url));
        e.setImportedAt(now);
        e.setFiles(files);
        return e;
    }

    private static String text(JsonNode n) {
        return n != null && n.isTextual() ? n.asText() : null;
    }

    private static String clip(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /** 저장 실패 때 보관 manifest 를 다시 만든다 — 통과 check 없이 사유 코드만. */
    byte[] failedArchive(JsonNode manifest, String code) {
        return archiveManifest(manifest, JSON.createArrayNode(), code);
    }

    // ── 사본 만들기 ───────────────────────────────────────────────────

    private Path copyToTemp(JsonNode att, Path filesReal, Path tmp, String tag, String where) throws IOException {
        String rel = att.path("path").asText();                        // files/<ASCII 이름> — 형식 검사 통과값
        String name = rel.substring(rel.lastIndexOf('/') + 1);
        if (filesReal == null) {
            throw new BatchReject("LINK_NOT_ALLOWED", "첨부 위치가 안전하지 않습니다", where);
        }
        Path src = filesReal.resolve(name);
        Path real;
        BasicFileAttributes a;
        try {
            real = src.toRealPath();
            a = Files.readAttributes(src, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (IOException e) {
            throw new BatchReject("FILE_UNREADABLE", "첨부를 읽을 수 없습니다", where);
        }
        if (!isChild(filesReal, real, name) || !a.isRegularFile()) {
            throw new BatchReject("LINK_NOT_ALLOWED", "첨부 위치가 안전하지 않습니다", where);
        }
        Path dst = tmp.resolve(tag + ".bin");
        MessageDigest md = sha256();
        long n = 0;
        try (InputStream in = Files.newInputStream(src, LinkOption.NOFOLLOW_LINKS);      // 기본 데이터 스트림만 — ADS 는 떨어진다
             OutputStream out = Files.newOutputStream(dst)) {
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) != -1) {
                n += r;
                if (n > MAX_FILE_BYTES) {
                    throw new BatchReject("FILE_TOO_LARGE", "첨부가 상한(20 MiB)을 넘습니다", where);
                }
                md.update(buf, 0, r);
                out.write(buf, 0, r);
            }
        }
        if (!hex(md.digest()).equals(att.path("sha256").asText())) {
            throw new BatchReject("SHA256_MISMATCH", "선언한 sha256 과 파일이 다릅니다", where);
        }
        if (n != att.path("size").asLong(-1L)) {
            throw new BatchReject("SIZE_MISMATCH", "선언한 크기와 파일이 다릅니다", where);
        }
        return dst;
    }

    private Path verifyLayout(Path batchDir, String batchId) {
        try {
            Path inboxReal = Paths.get(properties.getInboxRoot()).toRealPath();
            Path batchReal = batchDir.toRealPath();
            if (!isChild(inboxReal, batchReal, batchId)) {
                throw layout();
            }
            Path files = batchDir.resolve("files");
            if (!Files.exists(files, LinkOption.NOFOLLOW_LINKS)) {
                return null;
            }
            Path filesReal = files.toRealPath();               // junction·심볼릭 링크면 부모가 batchReal 이 아니다
            if (!isChild(batchReal, filesReal, "files") || !Files.isDirectory(filesReal, LinkOption.NOFOLLOW_LINKS)) {
                throw layout();
            }
            return filesReal;
        } catch (IOException e) {
            throw layout();
        }
    }

    private static ApiException layout() {
        return ApiException.withDetail(422, Collections.singletonMap("errors",
                Collections.singletonList("LINK_NOT_ALLOWED: 배치 폴더 구조가 안전하지 않습니다")));
    }

    /** child 의 실제 경로가 parent/name 인가(Windows 라 이름은 대소문자 무시). */
    private static boolean isChild(Path parent, Path child, String name) {
        return child.getParent() != null && parent.equals(child.getParent())
                && child.getFileName() != null && child.getFileName().toString().equalsIgnoreCase(name);
    }

    // ── 글자 검사(manifest 글자) ──────────────────────────────────────

    private static void scanField(List<Row> rows, JsonNode n, String locator) {
        if (n == null || !n.isTextual()) {
            return;
        }
        scanString(rows, n.asText(), locator);
    }

    /** url 은 ?·# 아래를 서버가 자르므로 자른 값만 검사·보관한다. */
    private static void scanUrl(List<Row> rows, JsonNode n, String locator) {
        if (n == null || !n.isTextual()) {
            return;
        }
        scanString(rows, cutUrl(n.asText()), locator);
    }

    private static void scanString(List<Row> rows, String text, String locator) {
        try {
            for (Pii.Finding f : Pii.scanExternal(text)) {
                addRow(rows, ExtCheckInspector.reasonOf(f.getKind()), locator, 0, 1);
            }
        } catch (Pii.ScanTimeoutException e) {
            addRow(rows, "TIMEOUT", locator, 0, 1);
        }
    }

    private static String cutUrl(String u) {
        int q = u.indexOf('?');
        int h = u.indexOf('#');
        int cut = q < 0 ? h : (h < 0 ? q : Math.min(q, h));
        return cut < 0 ? u : u.substring(0, cut);
    }

    private static void addRow(List<Row> rows, String reason, String locator, int seq, int count) {
        for (Row r : rows) {
            if (r.reason.equals(reason) && r.locator.equals(locator) && r.seq == seq) {
                r.count += count;
                return;
            }
        }
        rows.add(new Row(reason, locator, seq, count));
    }

    // ── 보관 manifest(화이트리스트 복사 — 모르는 필드는 버린다) ─────────

    private static ObjectNode sanitized(JsonNode check, String key, List<Map<String, Object>> files) {
        ObjectNode o = JSON.createObjectNode();
        o.put("check_id", check.path("check_id").asText());
        o.put("check_key", key);
        ObjectNode inst = o.putObject("institution");
        for (String k : new String[]{"name_ko", "type", "region_code", "sub_region_code"}) {
            copyText(inst, k, check.path("institution").path(k));
        }
        for (String k : new String[]{"status", "checked_at", "source_kind", "source_slug", "error_code"}) {
            copyText(o, k, check.path(k));
        }
        JsonNode match = check.path("match");
        if (match.isObject()) {
            ObjectNode m = o.putObject("match");
            copyText(m, "confidence", match.path("confidence"));
            ArrayNode basis = m.putArray("basis");
            for (JsonNode b : match.path("basis")) {
                if (b.isTextual()) {
                    basis.add(b.asText());
                }
            }
        }
        JsonNode notice = check.path("notice");
        if (notice.isObject()) {
            ObjectNode n = o.putObject("notice");
            for (String k : new String[]{"title", "number", "posted_at", "deadline_at"}) {
                copyText(n, k, notice.path(k));
            }
            if (notice.path("url").isTextual()) {
                n.put("url", cutUrl(notice.path("url").asText()));
            }
        }
        JsonNode press = check.path("press");
        if (press.isObject()) {
            ObjectNode p = o.putObject("press");
            for (String k : new String[]{"title", "publisher", "published_at"}) {
                copyText(p, k, press.path(k));
            }
            if (press.path("url").isTextual()) {
                p.put("url", cutUrl(press.path("url").asText()));
            }
        }
        ArrayNode st = o.putArray("stored");
        for (Map<String, Object> f : files) {
            ObjectNode s = st.addObject();
            s.put("seq", ((Integer) f.get("seq")).intValue());
            s.put("name", String.valueOf(f.get("stored_name")));
        }
        return o;                                  // attachments·reported_*·sha256·size 는 담지 않는다(자기신고, 원본은 삭제)
    }

    private static void copyText(ObjectNode dst, String key, JsonNode src) {
        if (src != null && src.isTextual()) {
            dst.put(key, src.asText());
        }
    }

    private static byte[] archiveManifest(JsonNode manifest, ArrayNode archived, String failureCode) {
        ObjectNode root = JSON.createObjectNode();
        root.put("schema_version", 1);
        root.put("schema_minor", manifest.path("schema_minor").asInt(1));
        copyText(root, "batch_id", manifest.path("batch_id"));
        copyText(root, "collected_at", manifest.path("collected_at"));
        copyText(root.putObject("source"), "slug", manifest.path("source").path("slug"));
        root.putArray("records");
        root.set("checks", archived);
        if (failureCode != null) {
            root.put("rejected", failureCode);
        }
        return root.toString().getBytes(StandardCharsets.UTF_8);
    }

    // ── 원본 삭제 ─────────────────────────────────────────────────────

    /**
     * 배치 폴더 안에서 manifest.json 만 남기고 모두 지운다. 디렉터리는 실제 경로가 제자리일 때만 안으로 들어가고,
     * junction·링크는 <b>링크 자체만</b> 지운다(대상을 따라가지 않는다). 하나라도 못 지우면 false.
     */
    static boolean scrub(Path batchDir) {
        boolean ok = true;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(batchDir)) {
            for (Path p : ds) {
                if ("manifest.json".equals(p.getFileName().toString())) {
                    continue;
                }
                ok &= deleteTree(p);
            }
        } catch (IOException | RuntimeException e) {
            return false;
        }
        return ok;
    }

    static boolean deleteTree(Path p) {
        boolean ok = true;
        try {
            BasicFileAttributes a = Files.readAttributes(p, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (a.isDirectory() && !a.isSymbolicLink() && isRealDir(p)) {
                try (DirectoryStream<Path> ds = Files.newDirectoryStream(p)) {
                    for (Path c : ds) {
                        ok &= deleteTree(c);
                    }
                }
            }
            Files.delete(p);
        } catch (IOException | RuntimeException e) {
            return false;
        }
        return ok;
    }

    private static boolean isRealDir(Path p) {
        try {
            Path real = p.toRealPath();
            Path parentReal = p.toAbsolutePath().getParent().toRealPath();
            return parentReal.equals(real.getParent()) && real.getFileName().toString().equalsIgnoreCase(p.getFileName().toString());
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    // ── 작은 도우미 ───────────────────────────────────────────────────

    private static String randomKey() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return hex(b);
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 을 쓸 수 없습니다");
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) {
            sb.append(Character.forDigit((x >> 4) & 0xF, 16)).append(Character.forDigit(x & 0xF, 16));
        }
        return sb.toString();
    }
}
