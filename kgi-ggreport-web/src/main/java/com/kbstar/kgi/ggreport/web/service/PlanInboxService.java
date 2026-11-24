package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.CsvLimits;
import com.kbstar.kgi.ggreport.web.support.NewsCsv;
import com.kbstar.kgi.ggreport.web.support.PlanCsv;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryIteratorException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

/**
 * 사업계획 서버 폴더 반입(NEXT 56, collector/SCHEMA.md ⑪). 폴더는 설정 ggreport.plan-inbox.location 한 곳 — 요청으로 경로를 받지 않는다(시드 선례). 비면 꺼짐(503).
 * <ul>
 *   <li>폴더는 읽기만 한다 — 옮기거나 지우지 않는다(uploader DB 의 저장 경로 보존). 처리 여부는 INST_PLAN_IMPORT(기관·SHA-256)로 판정한다.</li>
 *   <li>파일 이름은 PlanCsv.FILE_NAME(_plan.csv) 또는 NewsCsv.FILE_NAME(_news.csv)만 — 종류는 서버에서 '어느 정규식이 맞았나'로만 정한다(요청 값을 되받지 않는다).
 *       구분자·'.'·':'·'~' 불가. 링크·폴더·장치 거부, 실제 경로의 부모가 root 여야 한다. 하드링크·확인 뒤 바꿔치기는 막지 못한다(알려진 한계 — 폴더 쓰기 권한이 신뢰 경계).</li>
 *   <li>상한: 이름 열거 100,000 · 확인은 이름 날짜 내림차순 최신 100개·읽기 64MB·20초(넘으면 NOT_CHECKED) · 파일 5MB · 반입 한 번 100파일(50기관 × 사업계획·뉴스 2종). 폴더 확인·반입은 JVM 안에서 동시에 1건(409 BUSY).</li>
 *   <li>반입은 InstitutionPlanService.importFile(=apply) — 파일마다 독립 트랜잭션·감사 1행, 묶음은 BATCH_ID 'inbox-…'.</li>
 * </ul>
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다. 권한 검사는 업무 규칙이지 사칭 방지가 아니다.
 */
@Service
public class PlanInboxService {

    private static final Logger LOG = LoggerFactory.getLogger(PlanInboxService.class);
    public static final String OFF = "PLAN_INBOX_OFF";
    public static final String BAD_CONFIG = "PLAN_INBOX_BAD_CONFIG";
    static final int MAX_ENTRIES = 100000;               // 이름 열거 상한(이름만 — 싸다, security S2)
    static final int MAX_LIST = 100;                     // 내용까지 확인하는 파일 수(이름 날짜 최신부터)
    static final int MAX_IMPORT = 100;                   // SCHEMA ⑪-5(목록 한 번 = 50기관 × 사업계획·뉴스 2종)
    static final String KIND_PLAN = "PLAN";
    static final String KIND_NEWS = "NEWS";
    static final long SCAN_BUDGET = 64L * 1024 * 1024;   // 확인 한 번에 읽는 바이트 상한
    static final Duration SCAN_TIME = Duration.ofSeconds(20);   // 확인 한 번의 읽기 시간 상한(security S3)
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Comparator<String> NEWEST_FIRST =
            Comparator.comparing(PlanInboxService::dateOf).reversed().thenComparing(Comparator.<String>naturalOrder());
    // 반입 순서: 이른 날짜 → 같은 날짜면 사업계획(_plan)이 뉴스(_news)보다 먼저 → 이름순.
    // 뉴스가 먼저 들어가면 열린 수집 요청을 '뉴스로 대체'로 닫아, 같은 실행의 사업계획 반입이 요청에 반영되지 않는다(qa 107 P2).
    private static final Comparator<String> OLDEST_FIRST =
            Comparator.comparing(PlanInboxService::dateOf)
                    .thenComparing((String n) -> KIND_NEWS.equals(kindOf(n)) ? 1 : 0)
                    .thenComparing(Comparator.<String>naturalOrder());

    private final InstitutionPlanService plans;
    private final InstitutionNewsService news;
    private final PlanAudit audit;
    private final String location;
    private final Duration scanTime;
    private final long scanBudget;
    /** 폴더 확인·반입 공용 — 한 번에 1건(security S3). 노드가 여럿이면 노드마다 따로다(판 중복은 apply 의 잠금·SHA 가드가 막는다). */
    private final AtomicBoolean busy = new AtomicBoolean(false);

    @Autowired
    public PlanInboxService(InstitutionPlanService plans, InstitutionNewsService news, PlanAudit audit,
                            @Value("${ggreport.plan-inbox.location:}") String location) {
        this(plans, news, audit, location, SCAN_TIME);
    }

    /** 시험용 — 확인 시간 상한을 바꾼다. */
    PlanInboxService(InstitutionPlanService plans, InstitutionNewsService news, PlanAudit audit, String location, Duration scanTime) {
        this(plans, news, audit, location, scanTime, SCAN_BUDGET);
    }

    /** 시험용 — 확인 시간 상한과 읽기 바이트 상한을 바꾼다. */
    PlanInboxService(InstitutionPlanService plans, InstitutionNewsService news, PlanAudit audit, String location, Duration scanTime, long scanBudget) {
        this.plans = plans;
        this.news = news;
        this.audit = audit;
        this.location = location == null ? "" : location.trim();
        this.scanTime = scanTime;
        this.scanBudget = scanBudget;
    }

    public boolean enabled() { return !location.isEmpty(); }

    /** 설정 폴더의 실제 경로. 꺼짐 503 OFF, 없음·폴더 아님 503 BAD_CONFIG — 경로는 응답·로그에 싣지 않는다. */
    Path root() {
        if (location.isEmpty()) {
            throw PlanCollectService.err(503, OFF, "사업계획 반입 폴더가 설정되지 않았습니다. 파일 올리기로 반입해 주세요.");
        }
        try {
            Path real = Paths.get(location).toRealPath();
            if (!Files.isDirectory(real)) throw new IOException("not a directory");
            return real;
        } catch (IOException | InvalidPathException e) {
            LOG.error("plan-inbox root unavailable code={}", BAD_CONFIG);
            throw badConfig();
        }
    }

    /** 폴더 확인 — DB·파일 무변경. 형식 밖 이름은 개수만 센다(이름을 되돌려 주지 않는다). */
    public Map<String, Object> scan() {
        final Path root = root();
        if (!busy.compareAndSet(false, true)) throw busyError();
        try {
            List<String> names = new ArrayList<>();
            int ignored = 0, seen = 0;
            boolean truncated = false;
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(root)) {
                for (Path p : ds) {
                    if (++seen > MAX_ENTRIES) {
                        truncated = true;
                        break;
                    }
                    String n = p.getFileName().toString();
                    if (kindOf(n) != null) names.add(n); else ignored++;
                }
            } catch (IOException | DirectoryIteratorException e) {
                LOG.error("plan-inbox list failed code={}", BAD_CONFIG);
                throw badConfig();
            }
            names.sort(NEWEST_FIRST);   // 열거 순서와 무관하게 최신 날짜부터(security S2)
            if (names.size() > MAX_LIST) {
                truncated = true;
                names = new ArrayList<>(names.subList(0, MAX_LIST));
            }
            final long deadline = System.nanoTime() + scanTime.toNanos();
            final long[] budget = {scanBudget};
            final PlanCsv.Codes codes = plans.planCodes();   // 한 번만(security S3)
            List<Map<String, Object>> items = new ArrayList<>();
            Map<String, Integer> counts = new TreeMap<>();
            for (final String n : names) {
                final String kind = kindOf(n);
                Supplier<byte[]> reader = () -> {
                    if (System.nanoTime() - deadline > 0) throw new InstitutionPlanService.FileProblem("NOT_CHECKED");
                    return readSafe(root, n, budget);
                };
                Map<String, Object> it = KIND_NEWS.equals(kind) ? news.inspect(n, reader) : plans.inspect(n, reader, codes);
                it.put("kind", kind);   // 기존 키는 그대로, kind 만 더한다
                items.add(it);
                counts.merge(String.valueOf(it.get("status_cd")), 1, Integer::sum);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("items", items);
            out.put("status_counts", counts);
            out.put("ignored_count", ignored);
            out.put("truncated", truncated);
            out.put("max_import", MAX_IMPORT);
            return out;
        } finally {
            busy.set(false);
        }
    }

    /**
     * 고른 파일 반입. 파일별 result_cd: IMPORTED · ALREADY · OLDER · INVALID(message) · NOT_FOUND · TOO_LARGE · UNSAFE · GONE · UNREADABLE · CONFLICT · ERROR.
     * 오류가 있어도 200. DB 장애면 멈추고 던진다(500, 앞선 파일은 커밋 유지 — requestBatch 선례).
     */
    public Map<String, Object> importFiles(List<String> raw, Actor actor, BoardUiIds.Ui ui) {
        List<String> names;
        try {
            names = names(raw);
        } catch (ApiException e) {
            failed(null, InstitutionPlanService.ACTION_IMPORT, "INVALID", actor, ui);   // 종류를 알 수 없는 단계(이름 검사 전)는 IMPORT
            throw e;
        }
        Path root;
        try {
            root = root();
        } catch (ApiException e) {
            failed(null, InstitutionPlanService.ACTION_IMPORT, "INBOX_OFF", actor, ui);
            throw e;
        }
        if (!busy.compareAndSet(false, true)) {
            failed(null, InstitutionPlanService.ACTION_IMPORT, "BUSY", actor, ui);
            throw busyError();
        }
        try {
            String batch = "inbox-" + LocalDateTime.now(SEOUL).format(STAMP) + "-"
                    + String.format("%04x", ThreadLocalRandom.current().nextInt(0x10000));   // 같은 초 겹침 방지(S10)
            List<Map<String, Object>> rs = new ArrayList<>();
            int ok = 0, already = 0, err = 0;
            for (String n : names) {
                final boolean isNews = KIND_NEWS.equals(kindOf(n));
                final String action = isNews ? InstitutionNewsService.ACTION_NEWS_IMPORT : InstitutionPlanService.ACTION_IMPORT;
                String canon = plans.canonicalOrNull(idOf(n));   // 감사·응답의 기관ID — 정식 표기, 실패면 null(security S9)
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("file_name", n);
                r.put("kind", isNews ? KIND_NEWS : KIND_PLAN);
                r.put("institution_id", canon);
                try {
                    byte[] bytes = readSafe(root, n, null);
                    Map<String, Object> out = isNews ? news.importFile(n, bytes, batch, actor, ui) : plans.importFile(n, bytes, batch, actor, ui);
                    r.put("institution_id", out.get("institution_id"));
                    r.put("result_cd", "IMPORTED");
                    r.put("import_id", out.get("import_id"));
                    r.put("item_count", out.get("item_count"));
                    if (!isNews) r.put("warning_count", out.get("warning_count"));
                    ok++;
                } catch (InstitutionPlanService.FileProblem e) {
                    r.put("result_cd", e.getCode());
                    failed(canon, action, e.getCode(), actor, ui);
                    err++;
                } catch (ApiException e) {   // importFile 이 감사를 이미 남겼다
                    String code = classify(e);
                    r.put("result_cd", code);
                    if ("INVALID".equals(code)) r.put("message", e.getMessage());   // 'row n: 고정 문구' 또는 이름·날짜 고정 문구(S1)
                    if ("ALREADY".equals(code)) already++; else err++;
                } catch (RuntimeException e) {
                    if (PlanCollectService.isOutage(e)) throw e;
                    LOG.warn("plan-inbox import error code=ERROR err={}", e.getClass().getSimpleName());
                    r.put("result_cd", "ERROR");
                    err++;
                }
                rs.add(r);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("batch_id", batch);
            out.put("imported_count", ok);
            out.put("already_count", already);
            out.put("error_count", err);
            out.put("results", rs);
            return out;
        } finally {
            busy.set(false);
        }
    }

    static List<String> names(List<String> raw) {
        if (raw == null || raw.isEmpty() || raw.size() > MAX_IMPORT) {
            throw PlanCollectService.err(400, "BAD_FILES", "파일은 1~" + MAX_IMPORT + "개여야 합니다.");
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : raw) {
            if (s == null || kindOf(s) == null) {
                throw PlanCollectService.err(400, "BAD_FILES", "파일 이름 형식이 올바르지 않습니다.");
            }
            out.add(s);
        }
        List<String> list = new ArrayList<>(out);
        list.sort(OLDEST_FIRST);   // 같은 기관 여러 날짜면 이른 것부터 — 늦은 것이 먼저 들어가 이른 것이 OLDER 로 막히지 않게
        return list;
    }

    /** name 은 FILE_NAME 통과값. 링크·폴더·장치 거부, 실제 경로의 부모가 root·이름이 같아야(대소문자 무시) 한다. budget 이 null 이면 예산 없음(반입). */
    static byte[] readSafe(Path root, String name, long[] budget) {
        Path p = root.resolve(name);
        BasicFileAttributes a;
        Path real;
        try {
            a = Files.readAttributes(p, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!a.isRegularFile()) throw new InstitutionPlanService.FileProblem("UNSAFE");
            real = p.toRealPath();
        } catch (NoSuchFileException e) {
            throw new InstitutionPlanService.FileProblem("GONE");
        } catch (IOException e) {
            throw new InstitutionPlanService.FileProblem("UNREADABLE");
        }
        if (!root.equals(real.getParent()) || real.getFileName() == null
                || !real.getFileName().toString().equalsIgnoreCase(name)) {
            throw new InstitutionPlanService.FileProblem("UNSAFE");
        }
        if (a.size() > CsvLimits.MAX_FILE_BYTES) throw new InstitutionPlanService.FileProblem("TOO_LARGE");
        if (budget != null) {
            if (budget[0] < a.size()) throw new InstitutionPlanService.FileProblem("NOT_CHECKED");
            budget[0] -= a.size();
        }
        try (InputStream in = Files.newInputStream(p, LinkOption.NOFOLLOW_LINKS)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.min(a.size() + 16, CsvLimits.MAX_FILE_BYTES + 16));
            byte[] buf = new byte[8192];
            long total = 0;
            int r;
            while ((r = in.read(buf)) > 0) {
                total += r;
                if (total > CsvLimits.MAX_FILE_BYTES) throw new InstitutionPlanService.FileProblem("TOO_LARGE");   // 확인 뒤 커진 파일
                out.write(buf, 0, r);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new InstitutionPlanService.FileProblem("UNREADABLE");
        }
    }

    /** 문자열 ApiException 은 detailObject 가 null 이다 — getMessage() 로 가른다(security S1). */
    static String classify(ApiException e) {
        String msg = e.getMessage();
        switch (e.getStatus()) {
            case 400: return "INVALID";
            case 404: return "NOT_FOUND";
            case 413: return "TOO_LARGE";
            case 409:
                if (InstitutionPlanService.MSG_SAME.equals(msg)) return "ALREADY";
                if (InstitutionPlanService.MSG_OLDER.equals(msg)) return "OLDER";
                return "CONFLICT";
            default: return "ERROR";
        }
    }

    /** 종류 — 이름 정규식이 어느 쪽에 맞았나로만 정한다(요청 값을 되받지 않는다). 어느 쪽도 아니면 null. */
    static String kindOf(String n) {
        if (n == null) return null;
        if (PlanCsv.FILE_NAME.matcher(n).matches()) return KIND_PLAN;
        if (NewsCsv.FILE_NAME.matcher(n).matches()) return KIND_NEWS;
        return null;
    }

    /** {id}_{YYYYMMDD}_plan.csv 또는 _news.csv → YYYYMMDD / {id}. 두 접미사('_plan.csv'·'_news.csv')가 9자라 같은 위치로 자른다(통과값만). */
    static String dateOf(String n) { return n.substring(n.length() - 17, n.length() - 9); }
    static String idOf(String n) { return n.substring(0, n.length() - 18); }

    private static ApiException badConfig() {
        return PlanCollectService.err(503, BAD_CONFIG, "사업계획 반입 폴더를 읽을 수 없습니다. 개발부서 설정을 확인해 주세요.");
    }

    private static ApiException busyError() {
        return PlanCollectService.err(409, "BUSY", "다른 폴더 확인·반입이 진행 중입니다. 잠시 후 다시 눌러 주세요.");
    }

    private void failed(String inst, String action, String outcome, Actor actor, BoardUiIds.Ui ui) {
        try {
            audit.record(inst, null, action, outcome, null, null, actor, ui);
        } catch (RuntimeException ex) {
            LOG.error("plan-inbox audit failed outcome={}", outcome);   // 값·이름 없음
        }
    }
}
