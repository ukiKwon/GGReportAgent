package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.domain.InstHead;
import com.kbstar.kgi.ggreport.web.domain.InstHeadPhoto;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.HeadIn;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionHeadMapper;
import com.kbstar.kgi.ggreport.web.support.HeadForbidden;
import com.kbstar.kgi.ggreport.web.support.HeadMask;
import com.kbstar.kgi.ggreport.web.support.HeadText;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 기관장 사진(NEXT 72·77, 026) — 올리기·내려받기·무효·복원·최근 변경 목록.
 *
 * <p>규칙(사용자 결정 2026-11-11): 사진은 현 기관장(CURRENT) 머리에만 붙고 한 머리에 ACTIVE 하나. 이용 조건(PHOTO_LICENSE)은 ENABLED=1 인 것(KOGL1·INST_PERMIT)만 받는다.
 * 새로 올리면 옛 ACTIVE 는 REPLACED 로 보관(교체는 영업팀 누구나). 무효는 올린 사람 또는 팀장·부장, 무효 때 직전 REPLACED 를 자동 복원(파일이 있을 때만).
 * 복원(A14)·최근 변경 목록(P1)은 팀장·부장만. REPLACED 사진 열람도 팀장·부장만.
 *
 * <p>저장: 서버가 {@link HeadPhotoInspector} 로 다시 만든 JPEG 만 보관한다(원본·EXIF·원래 파일 이름 미보관). 파일 이름은 서버가 만든 32자리 키뿐.
 * 임시 파일에 쓴 뒤 이동하고 정규 경로가 저장 루트 아래인지 확인한다. DB 저장이 실패하거나 트랜잭션이 되돌아가면 파일을 지운다.
 * 읽을 때는 키 형식·루트 아래·링크 아닌 일반 파일·크기·SHA256 을 다시 대조한다(하나라도 틀리면 500, 본문은 나가지 않는다).
 * 느린 검사(디코드)는 잠금·트랜잭션 밖에서 하고, 그 뒤 기관 행 잠금 → 재확인 → 저장 → INSERT 순이다.
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 역할 검사는 업무 규칙이지 사칭 방지가 아니다(UPLOADED_VERIFIED 가 사실만 적는다). 오류 문구에 파일 이름·값을 싣지 않는다.
 */
@Service
public class HeadPhotoService {

    private static final Logger LOG = LoggerFactory.getLogger(HeadPhotoService.class);

    /** 파일 하나 상한. BoardWriteLimitFilter 가 같은 값으로 본문 상한을 건다. */
    public static final long MAX_FILE_BYTES = 5L * 1024 * 1024;

    private static final Pattern STORE_KEY = Pattern.compile("[0-9a-f]{32}");
    private static final int CHANGES_MAX = 200;

    private final InstitutionHeadMapper mapper;
    private final InstHeadSettings settings;
    private final TransactionTemplate tx;

    public HeadPhotoService(InstitutionHeadMapper mapper, InstHeadSettings settings, PlatformTransactionManager txm) {
        this.mapper = mapper;
        this.settings = settings;
        this.tx = new TransactionTemplate(txm);
    }

    // ── 올리기(A11) ──────────────────────────────────────────────────────

    /**
     * 순서(트랜잭션 밖): 크기(413) → 확장자(400 UNSUPPORTED_FORMAT) → 매직 바이트(400 FORMAT_MISMATCH) → 이용 조건(422 LICENSE_NOT_ALLOWED) →
     * 출처 종류(422) → 글자·URL·날짜 → 검사기. 이후 한 트랜잭션: 기관 잠금 → 현 기관장 재확인(409 NO_HEAD·STATE_CHANGED) → 저장 → INSERT → 옛 ACTIVE→REPLACED → 이력.
     */
    public Map<String, Object> upload(final SysUser me, final Actor actor, final String instId, final Long headId, MultipartFile file,
                                      String licenseRaw, String kindRaw, String titleRaw, String urlRaw, String checkedOnRaw) {
        if (headId == null || headId < 1) {
            throw coded(400, "BAD_VALUE", "대상 기관장을 지정하세요.");
        }
        if (file == null || file.isEmpty()) {
            throw coded(400, "BAD_VALUE", "파일을 선택하세요.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw tooLarge();
        }
        String ext = extOf(file.getOriginalFilename());   // 원래 파일 이름은 어디에도 저장하지 않는다
        if (!"jpg".equals(ext) && !"jpeg".equals(ext) && !"png".equals(ext)) {
            throw coded(400, "UNSUPPORTED_FORMAT", "JPG 또는 PNG 사진만 올릴 수 있습니다.");
        }
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw coded(400, "BAD_VALUE", "파일을 읽을 수 없습니다.");
        }
        if (data.length > MAX_FILE_BYTES) {
            throw tooLarge();
        }
        boolean png = "png".equals(ext);
        if (png ? !isPng(data) : !isJpeg(data)) {
            throw coded(400, "FORMAT_MISMATCH", "파일 내용이 확장자와 맞지 않습니다.");
        }
        String license = licenseRaw == null ? "" : licenseRaw.trim();
        if (license.isEmpty() || license.length() > 20 || mapper.countEnabledCode("PHOTO_LICENSE", license) == 0) {
            throw coded(422, "LICENSE_NOT_ALLOWED", "허용되지 않는 이용 조건입니다.");
        }
        String kind = kindRaw == null ? "" : kindRaw.trim();
        if (kind.isEmpty() || kind.length() > 20 || mapper.countEnabledCode("HEAD_SRC", kind) == 0) {
            throw coded(422, "SRC_KIND_NOT_ALLOWED", "허용되지 않는 출처 종류입니다.");
        }
        String title = HeadText.requireLine("src_title", titleRaw, 100, false);
        HeadForbidden.rejectAny(title);
        String url = HeadText.requireUrl(urlRaw);
        String checkedOn = HeadText.requireCheckedOn(checkedOnRaw);

        final HeadPhotoInspector.Result r = HeadPhotoInspector.inspect(png ? "png" : "jpg", data);   // 느린 검사 — 잠금 밖에서
        final String origSha = sha256(data);
        final String sha = sha256(r.jpeg);
        final String origExt = png ? "png" : "jpg";
        final String fLicense = license;
        final String fKind = kind;
        final String fTitle = title;
        final String fUrl = url;
        final String fChecked = checkedOn;

        return tx.execute(status -> {
            if (mapper.lockInstitution(instId) == null) {
                throw InstitutionHeadService.hidden();
            }
            InstHead cur = mapper.selectCurrentHeadForUpdate(instId);
            if (cur == null || InstitutionHeadService.isEmptyHead(mapper, cur.getHeadId())) {   // 빈 머리도 현 기관장 없음(11-13 가)
                throw coded(409, "NO_HEAD", "현 기관장이 없어 사진을 올릴 수 없습니다. 먼저 기관장을 등록하세요.");
            }
            if (!cur.getHeadId().equals(headId)) {
                throw InstitutionHeadService.stateChanged();
            }
            InstHeadPhoto old = mapper.selectActivePhotoForUpdate(cur.getHeadId());
            String key = UUID.randomUUID().toString().replace("-", "");
            Path stored = store(r.jpeg, key);
            deleteOnRollback(stored);
            String now = Times.nowIso();
            try {
                if (old != null && mapper.updatePhotoState(old.getPhotoId(), "ACTIVE", "REPLACED", me.getEmpNo(), now) != 1) {
                    throw InstitutionHeadService.stateChanged();
                }
                InstHeadPhoto p = new InstHeadPhoto();
                p.setHeadId(cur.getHeadId());
                p.setInstitutionId(instId);
                p.setStateCd("ACTIVE");
                p.setStoreKey(key);
                p.setSha256(sha);
                p.setOrigSha256(origSha);
                p.setOrigExt(origExt);
                p.setSizeBytes(r.jpeg.length);
                p.setImgW(r.width);
                p.setImgH(r.height);
                p.setLicenseCd(fLicense);
                p.setSrcKindCd(fKind);
                p.setSrcTitle(fTitle);
                p.setSrcUrl(fUrl);
                p.setCheckedOn(fChecked);
                p.setUploadedBy(me.getEmpNo());
                p.setUploadedAt(now);
                p.setUploadedVerified(InstitutionHeadService.verified(actor));
                mapper.insertPhoto(p);
                InstitutionHeadService.writeLog(mapper, old == null ? "PHOTO_ADD" : "PHOTO_REPLACE", instId, cur.getHeadId(), null, null,
                        p.getPhotoId(), old == null ? null : old.getPhotoId(), null, null, null, me, actor, 1);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("photo_id", p.getPhotoId());
                out.put("head_id", cur.getHeadId());
                out.put("replaced_photo_id", old == null ? null : old.getPhotoId());
                return out;
            } catch (RuntimeException e) {
                deleteQuietly(stored);   // DB 가 실패하면 파일을 남기지 않는다
                throw e;
            }
        });
    }

    // ── 내려받기(A12) ────────────────────────────────────────────────────

    /**
     * 사진 본문 — 현 기관장 머리의 ACTIVE 는 영업 전원, REPLACED 는 팀장·부장만. 그 밖(다른 기관·이전 기관장·무효·번호 형식 밖)은 404.
     * 디스크에서 읽을 때 키 형식·루트·일반 파일·크기·SHA256 을 다시 대조한다 — 하나라도 틀리면 500(본문 안 나감).
     */
    @Transactional(readOnly = true)
    public byte[] content(SysUser me, String instId, Long photoId) {
        InstHeadPhoto p = photoId == null ? null : mapper.selectPhoto(photoId, instId);
        if (p == null) {
            throw InstitutionHeadService.hidden();
        }
        InstHead h = mapper.selectHead(p.getHeadId(), instId);
        if (h == null || !"CURRENT".equals(h.getStatusCd())) {
            throw InstitutionHeadService.hidden();
        }
        boolean ok = "ACTIVE".equals(p.getStateCd()) || ("REPLACED".equals(p.getStateCd()) && HeadRules.isLead(me.getRole()));
        if (!ok) {
            throw InstitutionHeadService.hidden();
        }
        return readVerified(p);
    }

    private byte[] readVerified(InstHeadPhoto p) {
        Path path = pathOf(p.getStoreKey());
        if (path == null) {
            LOG.error("head photo bad store key id={}", p.getPhotoId());
            throw new ApiException(500, "사진을 읽지 못했습니다.");
        }
        byte[] bytes;
        try {
            Path root = root();
            if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                    || !path.toRealPath().startsWith(root.toRealPath())
                    || Files.size(path) > MAX_FILE_BYTES) {
                LOG.error("head photo file check failed id={}", p.getPhotoId());
                throw new ApiException(500, "사진을 읽지 못했습니다.");
            }
            bytes = Files.readAllBytes(path);
        } catch (IOException e) {
            LOG.error("head photo read failed id={}", p.getPhotoId(), e);
            throw new ApiException(500, "사진을 읽지 못했습니다.");
        }
        if (!p.getSha256().equals(sha256(bytes))) {
            LOG.error("head photo hash mismatch id={}", p.getPhotoId());
            throw new ApiException(500, "사진 무결성 검사에 실패했습니다. 관리자에게 알려 주세요.");
        }
        return bytes;
    }

    // ── 무효(A13)·복원(A14) ──────────────────────────────────────────────

    /** 사진 무효 — 올린 사람 또는 팀장·부장, 사유 필수. 직전 REPLACED 사진이 있고 파일이 남아 있으면 자동 복원한다(없으면 사진 없음). */
    @Transactional
    public Map<String, Object> voidPhoto(SysUser me, Actor actor, String instId, Long photoId, HeadIn.Reason in) {
        String reason = HeadText.requireReason(in == null ? null : in.getReason());
        lockInst(instId);
        InstHeadPhoto p = photoId == null ? null : mapper.selectPhotoForUpdate(photoId, instId);
        if (p == null) {
            throw InstitutionHeadService.hidden();
        }
        InstHead h = mapper.selectHead(p.getHeadId(), instId);
        if (h == null) {
            throw InstitutionHeadService.hidden();
        }
        if (!"CURRENT".equals(h.getStatusCd()) || !"ACTIVE".equals(p.getStateCd())) {
            throw InstitutionHeadService.stateChanged();
        }
        if (!HeadRules.canVoid(me.getRole(), me.getEmpNo(), p.getUploadedBy(), null)) {   // 사진은 확정 단계가 없다 — 올린 사람 기준
            throw InstitutionHeadService.forbidden("NOT_OWNER");
        }
        String now = Times.nowIso();
        if (mapper.updatePhotoState(photoId, "ACTIVE", "VOIDED", me.getEmpNo(), now) != 1) {
            throw InstitutionHeadService.stateChanged();
        }
        int self = me.getEmpNo().equals(p.getUploadedBy()) ? 1 : 0;
        InstitutionHeadService.writeLog(mapper, "PHOTO_VOID", instId, p.getHeadId(), null, null, photoId, null, null, null, reason,
                me, actor, self);
        Long restored = null;
        // 권한대행 밖 확정 칸이 하나도 없는 머리면 되살리지 않는다 — 이 무효로 머리가 비어 '현 기관장 없음'이 된다(11-13 가). 되살리면 이름 없는 사진만 남는다.
        List<InstHeadPhoto> prevs = mapper.countShownItems(p.getHeadId()) > 0
                ? mapper.selectReplacedPhotos(p.getHeadId()) : new ArrayList<InstHeadPhoto>();
        // 직전에 쓰던 사진 순(REPLACED 로 내려간 시각이 최근인 순)으로 보며, 파일이 남아 있는 첫 사진을 복원한다(없으면 다음 후보, 다 없으면 사진 없음).
        for (InstHeadPhoto prev : prevs) {
            Path f = pathOf(prev.getStoreKey());
            if (f != null && Files.isRegularFile(f, LinkOption.NOFOLLOW_LINKS)
                    && mapper.updatePhotoState(prev.getPhotoId(), "REPLACED", "ACTIVE", null, null) == 1) {
                restored = prev.getPhotoId();
                InstitutionHeadService.writeLog(mapper, "PHOTO_RESTORE", instId, p.getHeadId(), null, null, restored, photoId, null,
                        null, null, me, actor, 0);
                break;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("photo_id", photoId);
        out.put("head_id", p.getHeadId());
        out.put("restored_photo_id", restored);
        out.put("head_empty", InstitutionHeadService.isEmptyHead(mapper, p.getHeadId()));
        return out;
    }

    /** 사진 복원 — 팀장·부장만. REPLACED → ACTIVE, 현재 ACTIVE 는 REPLACED 로 맞바꾼다. 파일이 없으면 409 FILE_MISSING. */
    @Transactional
    public Map<String, Object> restore(SysUser me, Actor actor, String instId, Long photoId) {
        if (!HeadRules.isLead(me.getRole())) {
            throw InstitutionHeadService.coded(403, "LEAD_ONLY", "영업팀장 또는 영업부장만 사진을 복원할 수 있습니다.");
        }
        lockInst(instId);
        InstHeadPhoto p = photoId == null ? null : mapper.selectPhotoForUpdate(photoId, instId);
        if (p == null) {
            throw InstitutionHeadService.hidden();
        }
        InstHead h = mapper.selectHead(p.getHeadId(), instId);
        if (h == null) {
            throw InstitutionHeadService.hidden();
        }
        if (!"CURRENT".equals(h.getStatusCd()) || !"REPLACED".equals(p.getStateCd())) {
            throw InstitutionHeadService.stateChanged();
        }
        if (InstitutionHeadService.isEmptyHead(mapper, p.getHeadId())) {   // 빈 머리 = 현 기관장 없음 — 사진만 되살려 이름 없는 카드를 만들지 않는다
            throw coded(409, "NO_HEAD", "현 기관장이 없어 사진을 복원할 수 없습니다. 먼저 기관장을 등록하세요.");
        }
        Path f = pathOf(p.getStoreKey());
        if (f == null || !Files.isRegularFile(f, LinkOption.NOFOLLOW_LINKS)) {
            throw coded(409, "FILE_MISSING", "사진 파일이 서버에 없어 복원할 수 없습니다.");
        }
        String now = Times.nowIso();
        InstHeadPhoto active = mapper.selectActivePhotoForUpdate(p.getHeadId());
        if (active != null && mapper.updatePhotoState(active.getPhotoId(), "ACTIVE", "REPLACED", me.getEmpNo(), now) != 1) {
            throw InstitutionHeadService.stateChanged();
        }
        if (mapper.updatePhotoState(photoId, "REPLACED", "ACTIVE", null, null) != 1) {
            throw InstitutionHeadService.stateChanged();
        }
        InstitutionHeadService.writeLog(mapper, "PHOTO_RESTORE", instId, p.getHeadId(), null, null, photoId,
                active == null ? null : active.getPhotoId(), null, null, null, me, actor, 0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("photo_id", photoId);
        out.put("head_id", p.getHeadId());
        out.put("replaced_photo_id", active == null ? null : active.getPhotoId());
        return out;
    }

    // ── 최근 사진 변경 목록(P1) ──────────────────────────────────────────

    /** 최근 사진 올림·교체·무효·복원 목록 — 팀장·부장만. 이름은 가린다. days 1~90(기본 30), 최대 200행. */
    @Transactional(readOnly = true)
    public Map<String, Object> changes(SysUser me, Integer daysRaw) {
        if (!HeadRules.isLead(me.getRole())) {
            throw InstitutionHeadService.coded(403, "LEAD_ONLY", "영업팀장 또는 영업부장만 볼 수 있습니다.");
        }
        int days = daysRaw == null ? 30 : daysRaw;
        if (days < 1 || days > 90) {
            throw coded(400, "BAD_VALUE", "기간은 1~90일로 지정하세요.");
        }
        String since = Times.iso(Instant.now().minus(days, ChronoUnit.DAYS));
        List<Map<String, Object>> rows = new ArrayList<>();
        boolean truncated = false;
        for (Map<String, Object> r : mapper.selectPhotoChanges(since)) {
            if (rows.size() >= CHANGES_MAX) {
                truncated = true;
                break;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("log_id", r.get("LOG_ID"));
            m.put("event_cd", r.get("EVENT_CD"));
            m.put("institution_id", r.get("INSTITUTION_ID"));
            m.put("head_id", r.get("HEAD_ID"));
            Object nm = r.get("NAME_VAL");
            m.put("name_masked", nm == null ? null : HeadMask.name(String.valueOf(nm)));
            m.put("photo_id", r.get("PHOTO_ID"));
            m.put("from_photo_id", r.get("FROM_PHOTO_ID"));
            m.put("actor_emp_no", r.get("ACTOR_EMP_NO"));
            m.put("actor_role", r.get("ACTOR_ROLE"));
            Object sf = r.get("SELF_FLAG");
            m.put("self", sf instanceof Number && ((Number) sf).intValue() == 1);
            m.put("logged_at", r.get("LOGGED_AT"));
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", rows);
        out.put("truncated", truncated);
        return out;
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    private void lockInst(String instId) {
        if (mapper.lockInstitution(instId) == null) {
            throw InstitutionHeadService.hidden();
        }
    }

    /** 파일 이름의 확장자(소문자) — 경로 부분은 버린다. 이름 자체는 저장하지 않는다. */
    static String extOf(String filename) {
        String raw = filename == null ? "" : filename.replace('\\', '/');
        raw = raw.substring(raw.lastIndexOf('/') + 1);
        int dot = raw.lastIndexOf('.');
        String ext = dot < 0 ? "" : raw.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
        return ext.length() > 8 ? "" : ext;
    }

    static boolean isJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    static boolean isPng(byte[] b) {
        int[] sig = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        if (b.length < sig.length) {
            return false;
        }
        for (int i = 0; i < sig.length; i++) {
            if ((b[i] & 0xFF) != sig[i]) {
                return false;
            }
        }
        return true;
    }

    // ── 디스크(PrepAttachService 의 저장·경로 함수를 복제 — 공용화는 cleaner 몫) ──────────────

    private Path root() {
        return Paths.get(settings.getPhotoDir()).toAbsolutePath().normalize();
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
            throw new ApiException(500, "사진을 저장하지 못했습니다.");
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
            LOG.error("head photo store failed", e);
            if (tmp != null) {
                deleteQuietly(tmp);
            }
            throw new ApiException(500, "사진을 저장하지 못했습니다.");
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
            LOG.warn("head photo cleanup failed: {}", e.getClass().getSimpleName());
        }
    }

    static String sha256(byte[] data) {
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

    private static ApiException coded(int status, String code, String message) {
        return InstitutionHeadService.coded(status, code, message);
    }
}
