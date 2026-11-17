package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckFile;
import com.kbstar.kgi.ggreport.web.mapper.ExtCheckMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 외부 확인 열람(NEXT 90 3단계). 키는 DB 가 발급한 값만 쓰고 클라이언트가 보낸 경로·파일명은 쓰지 않는다.
 * 오류 문구에는 내부 경로·키·SQL 을 싣지 않는다(404 는 고정 문구).
 */
@Service
public class ExtCheckQueryService {

    public static final int HISTORY_LIMIT = 20;
    private static final long MAX_FILE_BYTES = 20L * 1024 * 1024;
    private static final String NOT_FOUND = "자료를 찾을 수 없습니다.";
    public static final Pattern KEY_RE = Pattern.compile("[0-9a-f]{32}");
    private static final Pattern SEQ_RE = Pattern.compile("[0-9]{1,3}");
    /** STORED_NAME = '<키>/<check_id>_<순번>.<확장자>' — 서버가 만든 형식만 읽는다. */
    private static final Pattern STORED_RE = Pattern.compile("[0-9a-f]{32}/[A-Za-z0-9_-]{1,40}_[0-9]{1,3}\\.(?:pdf|hwp|hwpx)");

    private final ExtCheckMapper mapper;
    private final InstitutionMapper institutions;
    private final AppProperties properties;

    public ExtCheckQueryService(ExtCheckMapper mapper, InstitutionMapper institutions, AppProperties properties) {
        this.mapper = mapper;
        this.institutions = institutions;
        this.properties = properties;
    }

    public static final class Download {
        private final String name;
        private final byte[] bytes;

        Download(String name, byte[] bytes) {
            this.name = name;
            this.bytes = bytes;
        }
        public String getName() { return name; }
        public byte[] getBytes() { return bytes; }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> list(String institutionId) {
        if (institutionId == null || institutionId.trim().isEmpty() || institutionId.length() > 64 || hasControl(institutionId)) {
            throw ApiException.badRequest("institution_id 가 필요합니다.");     // 받은 값은 싣지 않는다
        }
        if (institutions.selectById(institutionId) == null) {
            throw ApiException.notFound("기관을 찾을 수 없습니다.");
        }
        List<ExtCheck> latest = mapper.selectLatestResolved(institutionId, "notice", new RowBounds(0, 1));
        String lastError = mapper.selectLastErrorAt(institutionId, "notice");
        List<ExtCheck> history = mapper.selectHistory(institutionId, new RowBounds(0, HISTORY_LIMIT));

        List<String> keys = new ArrayList<String>();
        for (ExtCheck c : history) {
            keys.add(c.getCheckKey());
        }
        for (ExtCheck c : latest) {
            if (!keys.contains(c.getCheckKey())) {
                keys.add(c.getCheckKey());
            }
        }
        Map<String, List<ExtCheckFile>> filesByKey = new LinkedHashMap<String, List<ExtCheckFile>>();
        if (!keys.isEmpty()) {
            for (ExtCheckFile f : mapper.selectFilesByKeys(keys)) {
                List<ExtCheckFile> l = filesByKey.get(f.getCheckKey());
                if (l == null) {
                    l = new ArrayList<ExtCheckFile>();
                    filesByKey.put(f.getCheckKey(), l);
                }
                l.add(f);
            }
        }
        List<Map<String, Object>> hist = new ArrayList<Map<String, Object>>();
        for (ExtCheck c : history) {
            hist.add(item(c, filesByKey.get(c.getCheckKey())));
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", institutionId);
        out.put("notice", latest.isEmpty() ? null : item(latest.get(0), filesByKey.get(latest.get(0).getCheckKey())));
        out.put("last_error_at", lastError);
        out.put("history", hist);
        out.put("history_limit", HISTORY_LIMIT);
        return out;
    }

    private static Map<String, Object> item(ExtCheck c, List<ExtCheckFile> files) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("check_key", c.getCheckKey());
        m.put("source_kind", c.getSourceKind());
        m.put("source_slug", c.getSourceSlug());
        m.put("status", c.getStatusCd());
        m.put("checked_at", c.getCheckedAt());
        m.put("imported_at", c.getImportedAt());
        m.put("error_code", c.getErrorCd());
        if (c.getMatchConf() != null) {
            Map<String, Object> match = new LinkedHashMap<String, Object>();
            match.put("confidence", c.getMatchConf());
            match.put("basis", c.getMatchBasis() == null || c.getMatchBasis().isEmpty()
                    ? Collections.<String>emptyList() : Arrays.asList(c.getMatchBasis().split(",")));
            m.put("match", match);
        } else {
            m.put("match", null);
        }
        m.put("title", c.getTitle());
        m.put("number", c.getItemNo());
        m.put("publisher", c.getPublisher());
        m.put("posted_at", c.getPostedAt());
        m.put("deadline_at", c.getDeadlineAt());
        m.put("url", c.getSrcUrl());
        List<Map<String, Object>> fs = new ArrayList<Map<String, Object>>();
        if (files != null) {
            for (ExtCheckFile f : files) {                    // stored_name·sha256 은 내보내지 않는다
                Map<String, Object> x = new LinkedHashMap<String, Object>();
                x.put("seq", f.getFileSeq());
                x.put("format", f.getFormatCd());
                x.put("size", f.getFileSize());
                x.put("download_path", "/ext-checks/" + c.getCheckKey() + "/files/" + f.getFileSeq());
                fs.add(x);
            }
        }
        m.put("files", fs);
        return m;
    }

    /** 형식이 틀리거나 DB 에 없거나 파일이 루트 밖·없음이면 모두 같은 404(고정 문구). */
    @Transactional(readOnly = true)
    public Download download(String checkKey, String seq) {
        if (checkKey == null || !KEY_RE.matcher(checkKey).matches() || seq == null || !SEQ_RE.matcher(seq).matches()) {
            throw ApiException.notFound(NOT_FOUND);
        }
        ExtCheckFile f = mapper.selectFile(checkKey, Integer.parseInt(seq));
        if (f == null || f.getStoredName() == null || !STORED_RE.matcher(f.getStoredName()).matches()
                || !f.getStoredName().startsWith(checkKey + "/")) {
            throw ApiException.notFound(NOT_FOUND);
        }
        try {
            Path root = Paths.get(properties.getExtCheckRoot()).toRealPath();
            Path p = root.resolve(f.getStoredName());
            BasicFileAttributes a = Files.readAttributes(p, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!a.isRegularFile() || a.size() > MAX_FILE_BYTES) {
                throw ApiException.notFound(NOT_FOUND);
            }
            Path real = p.toRealPath();
            Path dir = real.getParent();
            if (!real.startsWith(root) || dir == null || dir.getFileName() == null
                    || !dir.getFileName().toString().equalsIgnoreCase(checkKey) || !root.equals(dir.getParent())) {
                throw ApiException.notFound(NOT_FOUND);
            }
            String name = f.getStoredName().substring(f.getStoredName().indexOf('/') + 1);   // 서버 생성명
            return new Download(name, Files.readAllBytes(real));
        } catch (IOException e) {
            throw ApiException.notFound(NOT_FOUND);
        }
    }

    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isISOControl(s.charAt(i))) {
                return true;
            }
        }
        return false;
    }
}
