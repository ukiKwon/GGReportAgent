package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.DocCheckHitRow;
import com.kbstar.kgi.ggreport.web.domain.DocCheckLogRow;
import com.kbstar.kgi.ggreport.web.domain.DocCheckRow;
import com.kbstar.kgi.ggreport.web.domain.InstNameRow;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.DocCheckAckIn;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;
import com.kbstar.kgi.ggreport.web.mapper.DocCheckMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 작업함 파일 점검(NEXT 106) — 다른 기관 이름 검출·의도적 언급 표시·미확인 제출 감사.
 * <ul>
 *   <li>대외비: 파일 속 글·문맥을 DB·로그·감사에 남기지 않는다. 문맥은 요청 때 파일을 다시 읽어 즉석 계산(활성 사용자만).</li>
 *   <li>동시성: 파일 쓰기+기록은 {@link TaskFileLocks}, 표시·제출 감사 일련번호는 TASKS FOR UPDATE, 추출 자리는 {@link DocCheckRunner}.</li>
 *   <li>⚠️ 사번·화면·버튼은 자기신고다(EMP_VERIFIED=0 정상). 담당 비교는 업무 규칙이지 사칭 방지가 아니다.</li>
 * </ul>
 */
@Service
public class DocCheckService {

    static final int CHECKER_VER = 1;
    static final int HIT_CAP = 2000;
    static final int ACK_MAX_ITEMS = 200;
    private static final long DICT_TTL_MS = 10L * 60 * 1000;
    static final String EV_ACK = "ACK";
    static final String EV_UNACK = "UNACK";
    static final String EV_SUBMIT = "SUBMIT_OPEN";
    private static final List<String> KIND_ORDER = Arrays.asList("SLIDE", "NOTE", "PAGE", "MASTER", "META", "OTHER");
    private static final Pattern SHA = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern INST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    private final DocCheckMapper mapper;
    private final TaskMapper tasks;
    private final SysUserMapper users;
    private final AppProperties properties;
    private final DocCheckRunner runner;
    private final TransactionTemplate tx;

    private volatile List<InstNameMatcher.Row> dictRows;
    private volatile long dictLoadedAt;

    public DocCheckService(DocCheckMapper mapper, TaskMapper tasks, SysUserMapper users, AppProperties properties,
                           DocCheckRunner runner, PlatformTransactionManager txManager) {
        this.mapper = mapper;
        this.tasks = tasks;
        this.users = users;
        this.properties = properties;
        this.runner = runner;
        this.tx = new TransactionTemplate(txManager);
    }

    // ── 업로드·삭제(TaskFileService 가 부른다) ─────────────────────────────

    /** 저장 <b>전에</b> 메모리에서 글을 뽑는다(security S1). 던지지 않는다. */
    public TaskDocExtractor.Extracted extract(String safeName, final byte[] data) {
        return runner.run(TaskDocExtractor.extOf(safeName), () -> data);
    }

    /** 저장 직후 기록(파일 잠금 안에서 부른다). 스캔은 트랜잭션 밖, 쓰기만 한 트랜잭션. 예외는 호출자가 삼킨다(업로드 성공 우선). */
    public void record(final TaskContext ctx, final String name, final File file, byte[] data,
                       final TaskDocExtractor.Extracted ex) {
        record(ctx, name, file, sha256(data), ex);
    }

    /** 해시를 이미 구한 경우(스트리밍 해시). */
    void record(final TaskContext ctx, final String name, final File file, final String sha,
                final TaskDocExtractor.Extracted ex) {
        final Scan scan = ex.parsed() ? scan(ctx.getInstitutionId(), ex) : new Scan();
        final long size = file.length();
        final long mtime = file.lastModified();
        tx.executeWithoutResult(s -> write(ctx, name, sha, size, mtime, ex, scan));
    }

    /** 파일을 지웠을 때(파일 잠금 안). 의도적 언급 기록(DOC_CHECK_LOG)은 남긴다 — 감사 이력이다. */
    public void onFileRemoved(final String taskId, String name) {
        final String key = nameKey(name);
        tx.executeWithoutResult(s -> {
            mapper.deleteHits(taskId, key);
            mapper.deleteCheck(taskId, key);
        });
    }

    /** 업로드가 파일 쓰기 직전에 디자이너 작업의 잠김 여부를 다시 확인하는 데 쓴다(없으면 null). 캐시를 타지 않는 읽기. */
    public String currentStatus(String taskId) {
        return mapper.lockTask(taskId);
    }

    // ── 조회 ─────────────────────────────────────────────────────────────
    // 트랜잭션을 걸지 않는다 — 문맥 계산(최대 20초) 동안 DB 연결을 쥐지 않게.

    public Map<String, Object> summary(String taskId) {
        TaskContext ctx = requireContext(taskId);
        Counts c = new Counts();
        List<Map<String, Object>> files = new ArrayList<Map<String, Object>>();
        for (FileView v : views(ctx, null)) {
            c.add(v);
            files.add(fileSummary(v));
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("task_id", taskId);
        out.put("file_count", files.size());
        out.put("unconfirmed_count", c.open);
        out.put("not_checked_count", c.notChecked);
        out.put("partial_count", c.partial);
        out.put("clean", !files.isEmpty() && c.open == 0 && c.notChecked == 0 && c.partial == 0);
        out.put("submit_confirm_needed", c.open > 0);   // 제출 확인창 대상 = 미확인 검출이 있을 때만(점검 못 함만 있으면 아님)
        out.put("files", files);
        return out;
    }

    public Map<String, Object> detail(String taskId, String rawName, boolean withContext) {
        TaskContext ctx = requireContext(taskId);
        String name = safeName(rawName);
        File disk = existing(ctx, name);
        FileView v = views(ctx, name).get(0);
        Map<Key, List<String>> contexts = null;
        boolean asked = withContext && v.fresh && !v.hits.isEmpty() && parsed(v.state);
        if (asked) {
            contexts = contexts(ctx, name, disk, v);
        }
        return fileDetail(v, withContext, contexts);
    }

    /** 다시 점검(사전이 바뀌었거나 BUSY·TIMEOUT 였을 때). 파일 잠금 아래에서 읽고·뽑고·기록한다. 자리가 없으면 503. */
    public Map<String, Object> recheck(String taskId, String rawName) {
        final TaskContext ctx = requireContext(taskId);
        final String name = safeName(rawName);
        final File disk = existing(ctx, name);
        TaskFileLocks.with(taskId, name, () -> {
            final byte[][] held = new byte[1][];
            TaskDocExtractor.Extracted ex = runner.run(TaskDocExtractor.extOf(name),
                    () -> held[0] = Files.readAllBytes(disk.toPath()));
            if (TaskDocExtractor.R_BUSY.equals(ex.reason)) {
                throw busy();
            }
            String sha;
            if (held[0] != null) {
                sha = sha256(held[0]);
            } else {   // 파싱하지 않는 형식(ppt·png·zip) — 해시만 필요하니 통째로 읽지 않고 흘려 보내며 계산한다(security N1)
                try {
                    sha = sha256File(disk);
                } catch (java.nio.file.NoSuchFileException | java.io.FileNotFoundException gone) {
                    throw ApiException.notFound("파일이 없습니다.");   // 점검 도중 지워졌다
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("doc-check read failed", e);
                }
            }
            record(ctx, name, disk, sha, ex);
            return null;
        });
        return detail(taskId, name, false);
    }

    // ── 의도적 언급 표시 ─────────────────────────────────────────────────

    /**
     * 표시·해제(1~200줄). 담당 본인만(S7 — USERS 행 기준, by 를 보지 않는다). 디자이너 작업은 대기·작성중일 때만(잠기면 409).
     * 본 결과(sha256)와 지금 결과가 다르면 409 DOC_CHECK_STALE. 기록은 DOC_CHECK_LOG 에 덧붙이기만 한다(S8).
     */
    @Transactional
    public Map<String, Object> ack(String taskId, String rawName, SysUser me, Actor actor, BoardUiIds.Ui ui, DocCheckAckIn in) {
        String status = mapper.lockTask(taskId);   // 트랜잭션 첫 DB 문장 — TASKS 행 FOR UPDATE(다른 쓰기 경로와 같은 잠금 순서)
        if (status == null) {
            throw ApiException.notFound("task not found");
        }
        TaskContext ctx = requireContext(taskId);
        requireAckOwner(ctx, me);
        String name = safeName(rawName);
        validate(in);
        if (Teams.DESIGNER_TEAM.equals(ctx.getTeam()) && !Teams.isWorking(status)) {
            throw DesignReviewService.coded(409, "TASK_LOCKED",
                    "의견을 받는 중이거나 확정된 작업은 표시를 바꿀 수 없습니다. 먼저 [다시 수정]을 눌러 주세요.");
        }
        existing(ctx, name);
        FileView v = views(ctx, name).get(0);
        if (!v.fresh || !parsed(v.state) || !v.row.getFileSha256().equals(in.getSha256())) {
            throw DesignReviewService.coded(409, "DOC_CHECK_STALE", "점검 결과가 바뀌었습니다. 새로 고친 뒤 다시 표시해 주세요.");
        }
        Map<Key, HitView> byKey = new HashMap<Key, HitView>();
        for (HitView h : v.hits) {
            byKey.put(new Key(h.hit.getFoundInstId(), h.hit.getLocKind(), h.hit.getLocNo()), h);
        }
        boolean want = in.getAcked();
        int seq = mapper.selectMaxSeq(taskId);
        String now = Times.nowIso();
        Set<Key> seen = new HashSet<Key>();
        for (DocCheckAckIn.Item it : in.getItems()) {
            Key k = new Key(it.getInstId(), it.getLocKind(), it.getLocNo());
            if (!seen.add(k)) {
                continue;
            }
            HitView h = byKey.get(k);
            if (h == null) {
                throw ApiException.badRequest("표시할 줄을 찾을 수 없습니다.");   // 롤백 — 앞서 넣은 줄도 남지 않는다
            }
            if (h.acked == want) {
                continue;   // 이미 그 상태 — 이력을 늘리지 않는다
            }
            DocCheckLogRow r = logRow(taskId, ++seq, want ? EV_ACK : EV_UNACK, actor, me.getEmpNo(), ui, now);
            r.setNameKey(nameKey(name));   // 파일 이름은 평문으로 저장하지 않는다 — 해시만(security N10)
            r.setFileSha256(v.row.getFileSha256());
            r.setFoundInstId(k.instId);
            r.setLocKind(k.kind);
            r.setLocNo(k.no);
            mapper.insertLog(r);
        }
        return fileDetail(views(ctx, name).get(0), false, null);
    }

    // ── 제출 감사 ────────────────────────────────────────────────────────

    /**
     * 제출이 <b>성공한 뒤</b> <b>미확인 검출(HIT)이 남아 있을 때만</b> SUBMIT_OPEN 한 줄(누가·어느 화면·어느 버튼·건수).
     * 점검 못 함(이미지·zip·ppt 등)·일부 점검만 있고 미확인 검출이 없으면 감사·확인창 대상이 아니다(요약에는 계속 표시, 팀 결정 11-20).
     * 건수는 서버가 다시 센다(화면이 확인창을 띄웠는지와 무관). 계산 실패는 조용히 건너뛴다 — 제출 흐름을 바꾸지 않는다.
     */
    @Transactional
    public void recordSubmit(String taskId, Actor actor, BoardUiIds.Ui ui) {
        if (mapper.lockTask(taskId) == null) {   // 트랜잭션 첫 DB 문장
            return;
        }
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            return;
        }
        Counts c = new Counts();
        try {
            for (FileView v : views(ctx, null)) {
                c.add(v);
            }
        } catch (RuntimeException e) {
            return;   // 경로 가드 등 — 감사 줄을 못 만들 뿐 제출은 이미 끝났다
        }
        if (c.open == 0) {
            return;
        }
        DocCheckLogRow r = logRow(taskId, mapper.selectMaxSeq(taskId) + 1, EV_SUBMIT, actor, actor.getEmpNo(), ui, Times.nowIso());
        r.setOpenCount(c.open);
        r.setNotCheckedCount(c.notChecked);
        r.setPartialCount(c.partial);
        mapper.insertLog(r);
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private void write(TaskContext ctx, String name, String sha, long size, long mtime,
                       TaskDocExtractor.Extracted ex, Scan scan) {
        String taskId = ctx.getTaskId();
        String key = nameKey(name);
        String state = ex.state;
        String reason = ex.reason;
        if (scan.capped) {
            state = TaskDocExtractor.PARTIAL;
            reason = "HIT_CAP";
        }
        mapper.deleteHits(taskId, key);
        mapper.deleteCheck(taskId, key);
        DocCheckRow row = new DocCheckRow();
        row.setTaskId(taskId);
        row.setNameKey(key);
        row.setFileSha256(sha);
        row.setFileSize(size);
        row.setFileMtimeMs(mtime);
        row.setInstitutionId(ctx.getInstitutionId());
        row.setStateCd(state);
        row.setReasonCd(reason);
        row.setHasImages(ex.hasImages ? 1 : 0);
        row.setHasEmbedded(ex.hasEmbedded ? 1 : 0);
        row.setOrderApprox(ex.orderApprox ? 1 : 0);
        row.setHitRows(scan.counts.size());
        row.setCheckerVer(CHECKER_VER);
        row.setCheckedAt(Times.nowIso());
        mapper.insertCheck(row);
        for (Map.Entry<Key, int[]> e : scan.counts.entrySet()) {
            DocCheckHitRow h = new DocCheckHitRow();
            h.setTaskId(taskId);
            h.setNameKey(key);
            h.setFoundInstId(e.getKey().instId);
            h.setLocKind(e.getKey().kind);
            h.setLocNo(e.getKey().no);
            h.setHitCount(e.getValue()[0]);
            mapper.insertHit(h);
        }
    }

    private static final class Scan {
        final Map<Key, int[]> counts = new LinkedHashMap<Key, int[]>();
        boolean capped;
    }

    private Scan scan(String currentInstId, TaskDocExtractor.Extracted ex) {
        InstNameMatcher m = InstNameMatcher.build(dictRows(), currentInstId);
        Scan s = new Scan();
        for (TaskDocExtractor.Part p : ex.parts) {
            InstNameMatcher.Normalized nz = InstNameMatcher.normalizeWithMap(p.text);
            for (InstNameMatcher.Found f : m.scan(nz.text, nz.orig, p.text)) {
                Key k = new Key(f.instId, p.kind, p.no);
                int[] c = s.counts.get(k);
                if (c == null) {
                    if (s.counts.size() >= HIT_CAP) {   // security S5
                        s.capped = true;
                        continue;
                    }
                    c = new int[1];
                    s.counts.put(k, c);
                }
                c[0]++;
            }
        }
        return s;
    }

    private Map<Key, List<String>> contexts(TaskContext ctx, String name, final File disk, FileView v) {
        final byte[][] held = new byte[1][];
        TaskDocExtractor.Extracted ex = runner.run(TaskDocExtractor.extOf(name),
                () -> held[0] = Files.readAllBytes(disk.toPath()));
        if (TaskDocExtractor.R_BUSY.equals(ex.reason)) {
            throw busy();
        }
        if (held[0] == null || !ex.parsed() || !sha256(held[0]).equals(v.row.getFileSha256())) {
            return null;   // 그사이 파일이 바뀌었거나 다시 못 읽음 — context_state UNAVAILABLE
        }
        Set<Key> wanted = new HashSet<Key>();
        for (HitView h : v.hits) {
            wanted.add(new Key(h.hit.getFoundInstId(), h.hit.getLocKind(), h.hit.getLocNo()));
        }
        InstNameMatcher m = InstNameMatcher.build(dictRows(), ctx.getInstitutionId());
        Map<Key, List<String>> out = new HashMap<Key, List<String>>();
        for (TaskDocExtractor.Part p : ex.parts) {
            InstNameMatcher.Normalized nz = InstNameMatcher.normalizeWithMap(p.text);
            for (InstNameMatcher.Found f : m.scan(nz.text, nz.orig, p.text)) {
                Key k = new Key(f.instId, p.kind, p.no);
                if (!wanted.contains(k)) {
                    continue;
                }
                List<String> l = out.get(k);
                if (l == null) {
                    l = new ArrayList<String>();
                    out.put(k, l);
                }
                if (l.size() < 3) {
                    l.add(InstNameMatcher.context(p.text, nz, f));
                }
            }
        }
        return out;
    }

    private List<FileView> views(TaskContext ctx, String onlyName) {
        List<String> names = new ArrayList<String>();
        if (onlyName != null) {
            names.add(onlyName);
        } else {
            for (TaskFileEntry e : listing(ctx)) {
                names.add(e.getName());
            }
        }
        if (names.isEmpty()) {
            return Collections.emptyList();
        }
        String taskId = ctx.getTaskId();
        Map<String, DocCheckRow> checks = new HashMap<String, DocCheckRow>();
        for (DocCheckRow r : mapper.selectChecks(taskId)) {
            checks.put(r.getNameKey(), r);
        }
        Map<String, List<DocCheckHitRow>> hits = new HashMap<String, List<DocCheckHitRow>>();
        for (DocCheckHitRow h : mapper.selectHits(taskId, onlyName == null ? null : nameKey(onlyName))) {
            List<DocCheckHitRow> l = hits.get(h.getNameKey());
            if (l == null) {
                l = new ArrayList<DocCheckHitRow>();
                hits.put(h.getNameKey(), l);
            }
            l.add(h);
        }
        Map<String, AckState> acks = ackStates(taskId);
        Map<String, String> instNames = instNames();
        List<FileView> out = new ArrayList<FileView>();
        for (String n : names) {
            out.add(view(ctx, n, checks, hits, acks, instNames));
        }
        return out;
    }

    private FileView view(TaskContext ctx, String name, Map<String, DocCheckRow> checks,
                          Map<String, List<DocCheckHitRow>> hits, Map<String, AckState> acks, Map<String, String> instNames) {
        FileView v = new FileView(name);
        String key = nameKey(name);
        DocCheckRow row = checks.get(key);
        File disk = TaskFiles.resolve(properties.getOutputRoot(), ctx.getInstitutionName(), ctx.getTaskId(), name);
        v.row = row;
        v.fresh = row != null && disk.isFile() && row.getFileSize() == disk.length()
                && row.getFileMtimeMs() == disk.lastModified() && row.getCheckerVer() == CHECKER_VER
                && String.valueOf(ctx.getInstitutionId()).equals(row.getInstitutionId());
        if (!v.fresh) {
            v.state = TaskDocExtractor.NOT_CHECKED;
            v.reason = "STALE";
            return v;
        }
        v.state = row.getStateCd();
        v.reason = row.getReasonCd();
        List<DocCheckHitRow> hs = hits.get(key);
        if (hs == null) {
            return v;
        }
        for (DocCheckHitRow h : hs) {
            AckState a = acks.get(ackKey(row.getFileSha256(), h.getFoundInstId(), h.getLocKind(), h.getLocNo()));
            HitView hv = new HitView(h, instNames.get(h.getFoundInstId()), a);
            v.hits.add(hv);
            if (hv.acked) {
                v.acked++;
            } else {
                v.unconfirmed++;
            }
        }
        Collections.sort(v.hits, HIT_ORDER);
        return v;
    }

    private static final Comparator<HitView> HIT_ORDER = new Comparator<HitView>() {
        @Override
        public int compare(HitView a, HitView b) {
            int k = Integer.compare(kindRank(a.hit.getLocKind()), kindRank(b.hit.getLocKind()));
            if (k != 0) {
                return k;
            }
            int n = Integer.compare(a.hit.getLocNo(), b.hit.getLocNo());
            if (n != 0) {
                return n;
            }
            return String.valueOf(a.instName).compareTo(String.valueOf(b.instName));
        }
    };

    private static int kindRank(String kind) {
        int i = KIND_ORDER.indexOf(kind);
        return i < 0 ? KIND_ORDER.size() : i;
    }

    private Map<String, Object> fileSummary(FileView v) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("name", v.name);
        m.put("state", v.state);
        m.put("reason", v.reason);
        m.put("has_images", v.fresh && v.row.getHasImages() == 1);
        m.put("has_embedded", v.fresh && v.row.getHasEmbedded() == 1);
        m.put("order_approx", v.fresh && v.row.getOrderApprox() == 1);
        m.put("checked_at", v.fresh ? v.row.getCheckedAt() : null);
        m.put("hit_count", v.hits.size());
        m.put("unconfirmed_count", v.unconfirmed);
        m.put("acked_count", v.acked);
        return m;
    }

    private Map<String, Object> fileDetail(FileView v, boolean withContext, Map<Key, List<String>> contexts) {
        Map<String, Object> m = fileSummary(v);
        m.put("sha256", v.fresh ? v.row.getFileSha256() : null);
        if (withContext && contexts == null && !v.hits.isEmpty()) {
            m.put("context_state", "UNAVAILABLE");
        }
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        for (HitView h : v.hits) {
            Map<String, Object> r = new LinkedHashMap<String, Object>();
            r.put("inst_id", h.hit.getFoundInstId());
            r.put("inst_name", h.instName);
            r.put("loc_kind", h.hit.getLocKind());
            r.put("loc_no", h.hit.getLocNo());
            r.put("count", h.hit.getHitCount());
            r.put("acked", h.acked);
            r.put("acked_by_name", h.acked ? h.byName : null);   // 사번은 싣지 않는다(security S11)
            r.put("acked_at", h.acked ? h.at : null);
            if (contexts != null) {
                List<String> c = contexts.get(new Key(h.hit.getFoundInstId(), h.hit.getLocKind(), h.hit.getLocNo()));
                r.put("contexts", c == null ? Collections.<String>emptyList() : c);
            }
            rows.add(r);
        }
        m.put("hits", rows);
        return m;
    }

    private Map<String, AckState> ackStates(String taskId) {
        Map<String, AckState> out = new HashMap<String, AckState>();
        for (DocCheckLogRow r : mapper.selectAckLog(taskId)) {
            if (r.getLocNo() == null) {
                continue;
            }
            out.put(ackKey(r.getFileSha256(), r.getFoundInstId(), r.getLocKind(), r.getLocNo()),
                    new AckState(EV_ACK.equals(r.getEventCd()), r.getEmpName(), r.getActedAt()));   // SEQ 순 — 마지막 줄이 현재 상태
        }
        return out;
    }

    List<InstNameMatcher.Row> dictRows() {
        long now = System.currentTimeMillis();
        List<InstNameMatcher.Row> rows = dictRows;
        if (rows == null || now - dictLoadedAt > DICT_TTL_MS) {
            List<InstNameMatcher.Row> fresh = new ArrayList<InstNameMatcher.Row>();
            for (InstNameRow r : mapper.selectInstitutionRows()) {
                fresh.add(new InstNameMatcher.Row(r.getInstitutionId(), r.getNameKo(), r.getRegionCode()));
            }
            rows = Collections.unmodifiableList(fresh);
            dictRows = rows;
            dictLoadedAt = now;
        }
        return rows;
    }

    private Map<String, String> instNames() {
        Map<String, String> m = new HashMap<String, String>();
        for (InstNameMatcher.Row r : dictRows()) {
            m.put(r.id, r.nameKo);
        }
        return m;
    }

    /** 세 팀·디자이너 공통: 담당이 내 사번이거나, 내 이름이면서 ACTIVE 사용자 중 그 이름이 유일할 때만(S7). by·X-User-Id 는 보지 않는다. */
    private void requireAckOwner(TaskContext ctx, SysUser me) {
        String a = ctx.getAssignee() == null ? "" : ctx.getAssignee().trim();
        if (a.isEmpty() || me == null) {
            throw deniedOwner();
        }
        if (a.equals(me.getEmpNo())) {
            return;
        }
        String nm = me.getName() == null ? "" : me.getName().trim();
        if (!nm.isEmpty() && a.equals(nm) && activeNamed(nm) == 1) {
            return;
        }
        throw deniedOwner();
    }

    private int activeNamed(String name) {
        int n = 0;
        for (SysUser u : users.selectAll()) {
            if ("ACTIVE".equals(u.getStatus()) && u.getName() != null && name.equals(u.getName().trim())) {
                n++;
            }
        }
        return n;
    }

    private static void validate(DocCheckAckIn in) {
        if (in == null || in.getAcked() == null) {
            throw ApiException.badRequest("표시 여부(acked)가 필요합니다.");
        }
        if (in.getSha256() == null || !SHA.matcher(in.getSha256()).matches()) {
            throw ApiException.badRequest("파일 식별값이 올바르지 않습니다.");
        }
        List<DocCheckAckIn.Item> items = in.getItems();
        if (items == null || items.isEmpty() || items.size() > ACK_MAX_ITEMS) {
            throw ApiException.badRequest("표시할 줄은 1~" + ACK_MAX_ITEMS + "개입니다.");
        }
        for (DocCheckAckIn.Item it : items) {
            if (it == null || it.getInstId() == null || !INST_ID.matcher(it.getInstId()).matches()
                    || it.getLocKind() == null || !KIND_ORDER.contains(it.getLocKind())
                    || it.getLocNo() == null || it.getLocNo() < 0 || it.getLocNo() > TaskDocExtractor.MAX_LOC_NO) {
                throw ApiException.badRequest("표시할 줄의 값이 올바르지 않습니다.");
            }
        }
    }

    private static DocCheckLogRow logRow(String taskId, int seq, String event, Actor actor, String empNo,
                                         BoardUiIds.Ui ui, String now) {
        DocCheckLogRow r = new DocCheckLogRow();
        r.setTaskId(taskId);
        r.setSeqNo(seq);
        r.setEventCd(event);
        r.setEmpNo(empNo);
        r.setEmpVerified(actor != null && actor.isVerified() ? 1 : 0);
        r.setScreenId(ui == null ? BoardUiIds.UNKNOWN : ui.getScreen());
        r.setButtonId(ui == null ? BoardUiIds.UNKNOWN : ui.getButton());
        r.setUiValid(ui != null && ui.isValid() ? 1 : 0);
        r.setActedAt(now);
        return r;
    }

    private TaskContext requireContext(String taskId) {
        TaskContext ctx = tasks.selectContext(taskId);
        if (ctx == null) {
            throw ApiException.notFound("task not found");
        }
        return ctx;
    }

    /** 점검 대상 목록 — 올리기 규칙(safeName) 밖 파일(Thumbs.db·desktop.ini·.DS_Store·허용 밖 확장자)은 뺀다(500 금지). */
    private List<TaskFileEntry> listing(TaskContext ctx) {
        try {
            List<TaskFileEntry> all = TaskFiles.listing(properties.getOutputRoot(), ctx.getInstitutionName(), ctx.getTaskId());
            List<TaskFileEntry> ok = new ArrayList<TaskFileEntry>(all.size());
            for (TaskFileEntry e : all) {
                try {
                    if (TaskFiles.safeName(e.getName()).equals(e.getName())) {
                        ok.add(e);
                    }
                } catch (TaskFiles.FileRejected skip) {
                    // 점검 대상이 아니다
                }
            }
            return ok;
        } catch (TaskFiles.FileRejected | IllegalArgumentException e) {
            throw ApiException.badRequest("작업물 위치가 올바르지 않습니다.");
        }
    }

    private File existing(TaskContext ctx, String name) {
        File f;
        try {
            f = TaskFiles.resolve(properties.getOutputRoot(), ctx.getInstitutionName(), ctx.getTaskId(), name);
        } catch (TaskFiles.FileRejected | IllegalArgumentException e) {
            throw ApiException.badRequest("작업물 위치가 올바르지 않습니다.");
        }
        if (!f.isFile()) {
            throw ApiException.notFound("파일이 없습니다.");
        }
        return f;
    }

    private static String safeName(String raw) {
        try {
            return TaskFiles.safeName(raw);
        } catch (TaskFiles.FileRejected e) {
            throw ApiException.badRequest("파일 이름이 올바르지 않습니다.");   // 입력값을 되돌려 싣지 않는다
        }
    }

    private static boolean parsed(String state) {
        return TaskDocExtractor.DONE.equals(state) || TaskDocExtractor.PARTIAL.equals(state);
    }

    private static ApiException busy() {
        return DesignReviewService.coded(503, "DOC_CHECK_BUSY", "지금 다른 파일을 점검하고 있습니다. 잠시 뒤 다시 시도해 주세요.");
    }

    private static ApiException deniedOwner() {
        return new ApiException(403, "이 작업을 처리할 수 있는 담당자가 아닙니다.");
    }

    static String nameKey(String name) {
        return sha256(name.getBytes(StandardCharsets.UTF_8));
    }

    static String sha256(byte[] data) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 파일을 메모리에 올리지 않고 SHA-256(8KB씩). */
    static String sha256File(File f) throws java.io.IOException {
        try (java.io.InputStream in = new DigestInputStream(Files.newInputStream(f.toPath()), digest())) {
            byte[] buf = new byte[8192];
            DigestInputStream d = (DigestInputStream) in;
            while (d.read(buf) >= 0) {
                // 읽으면서 해시가 갱신된다
            }
            return hex(d.getMessageDigest().digest());
        }
    }

    private static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String hex(byte[] d) {
        StringBuilder sb = new StringBuilder(64);
        for (byte b : d) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    private static String ackKey(String sha, String inst, String kind, int no) {
        return sha + '\u0000' + inst + '\u0000' + kind + '\u0000' + no;
    }

    static final class Key {
        final String instId;
        final String kind;
        final int no;

        Key(String instId, String kind, int no) {
            this.instId = instId;
            this.kind = kind;
            this.no = no;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Key)) {
                return false;
            }
            Key k = (Key) o;
            return no == k.no && instId.equals(k.instId) && kind.equals(k.kind);
        }

        @Override
        public int hashCode() {
            return (instId.hashCode() * 31 + kind.hashCode()) * 31 + no;
        }
    }

    private static final class AckState {
        final boolean acked;
        final String byName;
        final String at;

        AckState(boolean acked, String byName, String at) {
            this.acked = acked;
            this.byName = byName;
            this.at = at;
        }
    }

    private static final class HitView {
        final DocCheckHitRow hit;
        final String instName;
        final boolean acked;
        final String byName;
        final String at;

        HitView(DocCheckHitRow hit, String instName, AckState a) {
            this.hit = hit;
            this.instName = instName;
            this.acked = a != null && a.acked;
            this.byName = a == null ? null : a.byName;
            this.at = a == null ? null : a.at;
        }
    }

    private static final class FileView {
        final String name;
        DocCheckRow row;
        boolean fresh;
        String state;
        String reason;
        final List<HitView> hits = new ArrayList<HitView>();
        int unconfirmed;
        int acked;

        FileView(String name) {
            this.name = name;
        }
    }

    private static final class Counts {
        int open;
        int notChecked;
        int partial;

        void add(FileView v) {
            if (TaskDocExtractor.PARTIAL.equals(v.state)) {
                partial++;
            } else if (!TaskDocExtractor.DONE.equals(v.state)) {
                notChecked++;   // NOT_CHECKED·ERROR·STALE
            }
            open += v.unconfirmed;
        }
    }
}
