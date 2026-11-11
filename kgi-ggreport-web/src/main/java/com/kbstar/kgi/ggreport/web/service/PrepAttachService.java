package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.BidPrepAttach;
import com.kbstar.kgi.ggreport.web.domain.BidPrepTask;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 사전준비 첨부 원본 보관(NEXT 71, 025) — 올리기·목록·내려받기·무효 처리. T3 확정본 지정은 {@link PrepService} 가 한다.
 *
 * <p>규칙(사용자 결정 2026-11-10): 형식은 xlsx·docx·pdf·hwpx 만(HWP 거부), 주민·외국인등록·카드번호는 차단(422), 이메일·전화는 경고 후 저장,
 * 열람·내려받기는 <b>그 건의 활성 담당자와 영업부장</b>만(그 밖은 없는 건과 같은 404), 올리기·무효 처리는 활성 담당자만,
 * 원본 보관 — 물리 삭제는 없고 무효 처리(VALID_YN=0)만 있다. 확정본으로 지정된 첨부는 무효 처리할 수 없다(409 ATTACH_IN_USE).
 *
 * <p>저장: 파일 이름은 서버가 만든 32자리 키뿐이다(원래 이름은 DB 에만). 임시 파일에 쓴 뒤 이동하고 정규 경로가 저장 루트 아래인지 확인한다.
 * DB 저장이 실패하거나 트랜잭션이 되돌아가면 파일을 지운다. 건당 50개·300MB 한도는 무효 처리한 것도 센다(파일이 남으므로).
 * 같은 건 안의 올리기·무효 처리·확정본 지정은 BID_PREP 행 FOR UPDATE 로 직렬화한다 — 잠금은 느린 검사(파일 열기) 뒤에 잡는다.
 *
 * <p>⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 이 담당자·영업부장 검사는 업무 규칙이지 사칭 방지가 아니다(UPLOADED_VERIFIED 가 사실만 적는다).
 * 오류 문구·접근 이력에 파일 이름·값을 싣지 않는다.
 */
@Service
public class PrepAttachService {

    private static final Logger LOG = LoggerFactory.getLogger(PrepAttachService.class);

    /** 파일 하나 상한(D4). BoardWriteLimitFilter 가 같은 값으로 본문 상한을 건다. */
    public static final long MAX_FILE_BYTES = 30L * 1024 * 1024;
    static final long MAX_TOTAL_BYTES = 300L * 1024 * 1024;
    static final int MAX_COUNT = 50;
    static final int MAX_NAME = 200;

    private static final String TASK_T3 = "T3";
    private static final String TASK_T4 = "T4";
    private static final Pattern STORE_KEY = Pattern.compile("[0-9a-f]{32}");

    private final PrepMapper mapper;
    private final BidAssignmentService assignments;
    private final SysUserMapper users;
    private final AppProperties props;

    public PrepAttachService(PrepMapper mapper, BidAssignmentService assignments, SysUserMapper users,
                             AppProperties props) {
        this.mapper = mapper;
        this.assignments = assignments;
        this.users = users;
        this.props = props;
    }

    /** 내려받기 결과 — 원래 이름(헤더 인코딩용)과 본문. */
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

    // ── 올리기(9) ────────────────────────────────────────────────────────

    /**
     * 순서: 담당자(403) → 건(404)·상태(409) → 과제 코드·파일 있음(400) → 크기(413) → 이름(400)·확장자(400)·머리말(400) → 한도(409 ATTACH_LIMIT) →
     * 내용 검사(400·422) → 건 잠금·상태·한도 재확인 → 저장·DB 기록.
     */
    @Transactional
    public Map<String, Object> upload(SysUser me, Actor actor, String bidCaseId, String taskCdRaw, MultipartFile file) {
        if (!assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "이 입찰 건의 담당자만 첨부를 올릴 수 있습니다.");
        }
        BidPrep p = requirePrep(bidCaseId);
        if (!PrepService.TASK_STATES.contains(p.getStateCd())) {
            throw stateChanged();
        }
        String task = taskCdRaw == null ? "" : taskCdRaw.trim();
        if (!TASK_T3.equals(task) && !TASK_T4.equals(task)) {
            throw coded(400, "BAD_VALUE", "첨부할 과제를 고르세요(수익성 분석표 또는 RFP 붙임서류).");
        }
        if (file == null || file.isEmpty()) {
            throw coded(400, "BAD_VALUE", "파일을 선택하세요.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw tooLarge();
        }
        String name = cleanName(file.getOriginalFilename());
        String ext = PrepAttachInspector.extOf(name);
        PrepAttachInspector.requireAllowedExt(ext);
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw coded(400, "BAD_VALUE", "파일을 읽을 수 없습니다.");
        }
        if (data.length > MAX_FILE_BYTES) {
            throw tooLarge();
        }
        PrepAttachInspector.checkMagic(ext, data);
        requireRoom(bidCaseId, data.length);
        PrepAttachInspector.rejectBlockedText(name);
        PrepAttachInspector.Result scan = PrepAttachInspector.inspect(ext, data);   // 느린 검사 — 건 잠금 밖에서
        String sha = sha256(data);

        String state = mapper.selectStateForUpdate(bidCaseId);   // 이 뒤부터 같은 건의 올리기·무효·지정이 줄을 선다
        if (state == null) {
            throw ApiException.notFound("prep not found");
        }
        if (!PrepService.TASK_STATES.contains(state)) {
            throw stateChanged();
        }
        requireRoom(bidCaseId, data.length);

        String key = UUID.randomUUID().toString().replace("-", "");
        Path stored = store(data, key);
        deleteOnRollback(stored);
        String now = Times.nowIso();
        int verified = BoardMaterialService.verified(actor);
        BidPrepAttach a = new BidPrepAttach();
        a.setBidCaseId(bidCaseId);
        a.setTaskCd(task);
        a.setOrigName(name);
        a.setExtCd(ext);
        a.setSizeBytes(data.length);
        a.setSha256(sha);
        a.setStoreKey(key);
        a.setPiiState(scan.checked ? "CHECKED" : "UNCHECKED");
        a.setPiiNote(PrepAttachInspector.note(scan.warnings));
        a.setUploadedBy(me.getEmpNo());
        a.setUploadedAt(now);
        a.setUploadedVerified(verified);
        try {
            mapper.insertAttach(a);
            mapper.insertLogAttach(bidCaseId, "ATTACH_ADD", state, state, task, a.getAttachId(), null, null,
                    me.getEmpNo(), verified, now);
        } catch (RuntimeException e) {
            deleteQuietly(stored);   // DB 가 실패하면 파일을 남기지 않는다
            throw e;
        }
        Map<String, Object> m = row(a, null, new HashMap<String, String>());
        Map<String, Object> pii = new LinkedHashMap<>();
        pii.put("blocked", false);
        pii.put("warnings", PrepAttachInspector.warningList(scan.warnings));
        pii.put("checked", scan.checked);
        m.put("pii", pii);
        return m;
    }

    // ── 목록(10)·내려받기(11) ────────────────────────────────────────────

    /** 목록 — 활성 담당자·영업팀장·영업부장.그 밖은 404(건이 없는 것과 같은 응답). 메타만(파일 본체 없음). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(SysUser me, String bidCaseId) {
        requireViewer(me, bidCaseId);
        Long confirmed = confirmedId(bidCaseId);
        Map<String, String> names = new HashMap<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidPrepAttach a : mapper.selectAttachList(bidCaseId)) {
            out.add(row(a, confirmed, names));
        }
        return out;
    }

    /**
     * 내려받기 — 목록과 같은 열람 규칙. 번호는 숫자만 받는다(그 밖은 404). 디스크 파일의 해시를 다시 계산해 기록과 다르면 500(내용을 내보내지 않는다).
     * 무효 처리된 첨부도 내려받을 수 있다(원본 보관). 감사 기록은 컨트롤러가 성공·실패 모두 남긴다.
     */
    @Transactional(readOnly = true)
    public Download download(SysUser me, String bidCaseId, String attachIdRaw) {
        requireViewer(me, bidCaseId);
        Long id = parseId(attachIdRaw);
        BidPrepAttach a = id == null ? null : mapper.selectAttach(bidCaseId, id);
        if (a == null) {
            throw ApiException.notFound("attachment not found");
        }
        Path path = pathOf(a.getStoreKey());
        byte[] bytes;
        try {
            if (path == null || !Files.isRegularFile(path)) {
                throw coded(404, "FILE_MISSING", "첨부 파일이 서버에 없습니다. 관리자에게 알려 주세요.");
            }
            bytes = Files.readAllBytes(path);
        } catch (IOException e) {
            LOG.error("prep attach read failed id={}", a.getAttachId(), e);
            throw new ApiException(500, "첨부 파일을 읽지 못했습니다.");
        }
        if (!a.getSha256().equals(sha256(bytes))) {
            LOG.error("prep attach hash mismatch id={}", a.getAttachId());
            throw new ApiException(500, "첨부 파일 무결성 검사에 실패했습니다. 관리자에게 알려 주세요.");
        }
        return new Download(a.getOrigName(), bytes);
    }

    // ── 무효 처리(12) ────────────────────────────────────────────────────

    /**
     * 무효 처리(논리 삭제) — 올린 사람이면서 지금 활성 담당자이거나 영업팀장일 때만(사용자 결정 2026-11-11). 이미 무효면 409 STATE_CHANGED, 확정본이면 409 ATTACH_IN_USE.
     * 사유 필수(1~200자, 개인정보 422). 파일은 지우지 않는다.
     */
    @Transactional
    public Map<String, Object> voidAttach(SysUser me, Actor actor, String bidCaseId, String attachIdRaw, PrepIn.Reason in) {
        boolean lead = BidAssignmentService.LEAD_ROLE.equals(me.getRole() == null ? "" : me.getRole().trim());
        if (!lead && !assignments.isActiveAssignee(bidCaseId, me.getEmpNo())) {
            throw new ApiException(403, "첨부를 올린 담당자 또는 영업팀장만 무효 처리할 수 있습니다.");
        }
        requirePrep(bidCaseId);
        String state = mapper.selectStateForUpdate(bidCaseId);
        if (state == null) {
            throw ApiException.notFound("prep not found");
        }
        if (!PrepService.TASK_STATES.contains(state)) {
            throw stateChanged();
        }
        Long id = parseId(attachIdRaw);
        BidPrepAttach a = id == null ? null : mapper.selectAttach(bidCaseId, id);
        if (a == null) {
            throw ApiException.notFound("attachment not found");
        }
        if (!lead && !me.getEmpNo().equals(a.getUploadedBy())) {
            throw new ApiException(403, "첨부를 올린 담당자 또는 영업팀장만 무효 처리할 수 있습니다.");
        }
        if (a.getValidYn() != 1) {
            throw stateChanged();
        }
        if (mapper.countRefUse(bidCaseId, id) > 0) {
            throw coded(409, "ATTACH_IN_USE", "확정본으로 지정된 첨부는 무효 처리할 수 없습니다. 먼저 확정본 지정을 해제하세요.");
        }
        String reason = BoardMaterialService.checkedText(in == null ? null : in.getReason(), 200, "사유", true);
        String now = Times.nowIso();
        if (mapper.voidAttach(bidCaseId, id, me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        mapper.insertLogAttach(bidCaseId, "ATTACH_VOID", state, state, a.getTaskCd(), id, null, reason,
                me.getEmpNo(), BoardMaterialService.verified(actor), now);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attach_id", id);
        m.put("valid", false);
        return m;
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    /** 감사용 — 숫자 번호면 Long, 아니면 null. */
    public static Long parseId(String raw) {
        if (raw == null || !raw.matches("[0-9]{1,18}")) {
            return null;
        }
        return Long.valueOf(raw);
    }

    private void requireViewer(SysUser me, String bidCaseId) {
        boolean ok = bidCaseId != null && !bidCaseId.isEmpty() && bidCaseId.length() <= 64
                && (BidAssignmentService.HEAD_ROLE.equals(me.getRole() == null ? "" : me.getRole().trim())
                || BidAssignmentService.LEAD_ROLE.equals(me.getRole() == null ? "" : me.getRole().trim())   // 영업팀장도 열람(사용자 결정 2026-11-11)
                || assignments.isActiveAssignee(bidCaseId, me.getEmpNo()));
        if (!ok || mapper.selectPrep(bidCaseId) == null) {
            throw ApiException.notFound("prep not found");   // 없는 건과 열람 불가는 같은 응답
        }
    }

    private BidPrep requirePrep(String bidCaseId) {
        BidPrep p = bidCaseId == null || bidCaseId.isEmpty() || bidCaseId.length() > 64 ? null : mapper.selectPrep(bidCaseId);
        if (p == null) {
            throw ApiException.notFound("prep not found");
        }
        return p;
    }

    private Long confirmedId(String bidCaseId) {
        for (BidPrepTask t : mapper.selectTasks(bidCaseId)) {
            if (TASK_T3.equals(t.getTaskCd())) {
                return t.getRefAttachId();
            }
        }
        return null;
    }

    private void requireRoom(String bidCaseId, long add) {
        if (mapper.countAttach(bidCaseId) >= MAX_COUNT || mapper.sumAttachBytes(bidCaseId) + add > MAX_TOTAL_BYTES) {
            throw coded(409, "ATTACH_LIMIT", "이 입찰 건에 올릴 수 있는 첨부는 " + MAX_COUNT + "개·"
                    + (MAX_TOTAL_BYTES / (1024 * 1024)) + "MB까지입니다.");
        }
    }

    private Map<String, Object> row(BidPrepAttach a, Long confirmedId, Map<String, String> nameCache) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attach_id", a.getAttachId());
        m.put("bid_case_id", a.getBidCaseId());
        m.put("task_cd", a.getTaskCd());
        m.put("name", a.getOrigName());
        m.put("ext", a.getExtCd());
        m.put("size_bytes", a.getSizeBytes());
        m.put("sha256", a.getSha256());
        m.put("pii_state", a.getPiiState());   // CHECKED | UNCHECKED(검사 못 함 — 화면이 배지로 보인다)
        m.put("pii_note", a.getPiiNote());     // 종류·건수만("이메일 2") — 경고 배지용
        m.put("valid", a.getValidYn() == 1);
        m.put("confirmed", confirmedId != null && confirmedId.equals(a.getAttachId()));
        m.put("uploaded_by", person(a.getUploadedBy(), nameCache));
        m.put("uploaded_at", a.getUploadedAt());
        m.put("emp_verified", a.getUploadedVerified() == 1);   // false = 올린 사람 사번은 자기신고
        m.put("voided_by", a.getVoidedBy() == null ? null : person(a.getVoidedBy(), nameCache));
        m.put("voided_at", a.getVoidedAt());
        return m;
    }

    private Map<String, Object> person(String emp, Map<String, String> nameCache) {
        String name;
        if (nameCache.containsKey(emp)) {
            name = nameCache.get(emp);
        } else {
            SysUser u = users.selectByEmpNo(emp);
            name = u == null ? null : u.getName();
            nameCache.put(emp, name);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("emp_no", emp);
        m.put("name", name);
        return m;
    }

    /**
     * 올라온 이름 → 저장할 원래 이름. 경로 부분을 떼고, 빈 이름·'.' 로 시작·제어/서식 문자·200자 초과는 400.
     * (이 이름은 DB 에만 남는다 — 디스크 파일 이름·URL 에는 쓰지 않는다.)
     */
    static String cleanName(String filename) {
        String raw = filename == null ? "" : filename.replace('\\', '/');
        raw = raw.substring(raw.lastIndexOf('/') + 1).trim();
        if (raw.isEmpty() || raw.startsWith(".")) {
            throw coded(400, "BAD_VALUE", "파일 이름이 올바르지 않습니다.");
        }
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int ty = Character.getType(cp);
            if (ty == Character.CONTROL || ty == Character.FORMAT || ty == Character.SURROGATE
                    || ty == Character.LINE_SEPARATOR || ty == Character.PARAGRAPH_SEPARATOR
                    || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C) {
                throw coded(400, "BAD_VALUE", "파일 이름에 쓸 수 없는 문자가 있습니다.");
            }
        }
        if (raw.length() > MAX_NAME) {
            throw coded(400, "BAD_VALUE", "파일 이름은 " + MAX_NAME + "자 이하여야 합니다.");
        }
        return raw;
    }

    // ── 디스크 ───────────────────────────────────────────────────────────

    private Path root() {
        return Paths.get(props.getPrepAttachDir()).toAbsolutePath().normalize();
    }

    /** 키 이름의 파일 경로 — 키 형식이 아니거나 루트 밖이면 null. */
    private Path pathOf(String key) {
        if (key == null || !STORE_KEY.matcher(key).matches()) {
            return null;
        }
        Path root = root();
        Path p = root.resolve(key).normalize();
        return root.equals(p.getParent()) ? p : null;
    }

    /** 임시 파일에 쓰고 키 이름으로 옮긴다(덮어쓰지 않는다). 정규 경로가 저장 루트 아래가 아니면 지우고 500. */
    private Path store(byte[] data, String key) {
        Path target = pathOf(key);
        if (target == null) {
            throw new ApiException(500, "첨부 파일을 저장하지 못했습니다.");
        }
        Path root = root();
        Path tmp = null;
        try {
            Files.createDirectories(root);
            if (Files.exists(target)) {
                throw new IOException("target exists");
            }
            tmp = Files.createTempFile(root, "up-", ".tmp");
            Files.write(tmp, data);
            try {
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, target);
            }
            if (!target.toRealPath().startsWith(root.toRealPath())) {
                Files.deleteIfExists(target);
                throw new IOException("outside root");
            }
            return target;
        } catch (IOException e) {
            LOG.error("prep attach store failed", e);
            if (tmp != null) {
                deleteQuietly(tmp);
            }
            throw new ApiException(500, "첨부 파일을 저장하지 못했습니다.");
        }
    }

    /** 트랜잭션이 되돌아가면(커밋 실패 포함) 방금 쓴 파일을 지운다. */
    private static void deleteOnRollback(final Path file) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) {
                    deleteQuietly(file);
                }
            }
        });
    }

    private static void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException e) {
            LOG.warn("prep attach cleanup failed: {}", e.getClass().getSimpleName());
        }
    }

    private static String sha256(byte[] data) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : d) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);   // SHA-256 은 모든 JRE 에 있다
        }
    }

    private static ApiException tooLarge() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "FILE_TOO_LARGE");
        d.put("message", "파일이 너무 큽니다. " + (MAX_FILE_BYTES / (1024 * 1024)) + "MB 이하만 올릴 수 있습니다.");
        d.put("max_mb", MAX_FILE_BYTES / (1024 * 1024));
        return ApiException.withDetail(413, d);
    }

    private static ApiException stateChanged() {
        return coded(409, "STATE_CHANGED", "그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.");
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
