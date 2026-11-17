package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.InstPlanDoc;
import com.kbstar.kgi.ggreport.web.domain.InstPlanImport;
import com.kbstar.kgi.ggreport.web.domain.InstPlanItem;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionPlanMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.CsvLimits;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.support.PlanCsv;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 기관 사업계획 1단계(034) — 반입·시드·조회·'자료 없음' 목록.
 * 검증은 모두 트랜잭션 밖(PlanCsv)에서 끝낸다. 트랜잭션 안에서는 기관 잠금 → 같은 파일 재반입(409) → INSERT → 감사(OK)만 한다(한 트랜잭션, 조건 9).
 * 실패(400·404·409·413·500)도 INST_PLAN_ACT 에 남긴다(별도 트랜잭션, 조건 7). 오류 문구에는 행 번호만 싣는다.
 * 임박 판정은 여기 없다 — 그 기준(effectiveBid·약정 만료·진행 중 공고)은 프런트 logic.js 에만 있고 약정 만료는 DB 칸이 없다.
 * ⚠️ 반입자 사번은 X-Emp-No 자기신고일 수 있다. 관리자 검사는 업무 규칙이지 사칭 방지가 아니다.
 * 수집자(COLLECTOR_AGENT)는 수집 프로그램 식별자다 — 누가 올렸나는 INST_PLAN_IMPORT.IMPORTED_BY·시각이 맡는다.
 */
@Service
public class InstitutionPlanService {

    private static final Logger LOG = LoggerFactory.getLogger(InstitutionPlanService.class);
    public static final String ORIGIN_IMPORT = "IMPORT";
    public static final String ORIGIN_SEED = "SEED_TXT";
    public static final String ACTION_IMPORT = "IMPORT";
    public static final String ACTION_SEED = "SEED";
    public static final String ACTION_MISSING = "MISSING_CSV";
    static final int STALE_MONTHS = 12;
    static final int MISSING_MAX_IDS = 1000;   // Oracle IN 목록 상한과 같다
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Pattern BATCH = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    private final InstitutionPlanMapper mapper;
    private final PlanAudit audit;
    private final PlanCollectService collect;
    private final TransactionTemplate tx;
    private final ResourcePatternResolver resources = new PathMatchingResourcePatternResolver();
    private final String seedLocation;

    public InstitutionPlanService(InstitutionPlanMapper mapper, PlanAudit audit, PlanCollectService collect, PlatformTransactionManager txm,
                                  @Value("${ggreport.plan-seed.location:classpath*:plan-seed/}") String seedLocation) {
        this.mapper = mapper;
        this.audit = audit;
        this.collect = collect;
        this.tx = new TransactionTemplate(txm);
        this.seedLocation = seedLocation.endsWith("/") ? seedLocation : seedLocation + "/";
    }

    LocalDate today() { return LocalDate.now(SEOUL); }

    // ── 반입(관리자) ──
    public Map<String, Object> importUpload(String instId, MultipartFile file, String batchRaw, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.upload();
        String sha = null;
        try {
            instId = canonicalId(instId);   // 이하 저장·잠금·감사·파일명 대조는 정식 표기로
            if (file == null || file.isEmpty()) throw ApiException.badRequest("파일을 선택하세요.");
            if (file.getSize() > CsvLimits.MAX_FILE_BYTES) throw tooLarge();
            String fileDate = fileDate(instId, file.getOriginalFilename());   // 원래 파일 이름은 어디에도 저장하지 않는다
            String batch = batch(batchRaw);
            byte[] raw;
            try { raw = file.getBytes(); } catch (IOException e) { throw ApiException.badRequest("파일을 읽을 수 없습니다."); }
            if (raw.length > CsvLimits.MAX_FILE_BYTES) throw tooLarge();
            sha = sha256(raw);
            return apply(instId, raw, sha, fileDate, ORIGIN_IMPORT, batch, actor, ui, ACTION_IMPORT);
        } catch (ApiException e) {
            failed(instId, ACTION_IMPORT, HeadAudit.outcomeOf(e.getStatus()), sha, actor, ui);
            throw e;
        } catch (RuntimeException e) {
            failed(instId, ACTION_IMPORT, "ERROR", sha, actor, ui);
            throw e;
        }
    }

    // ── 시드(관리자, 서버 고정 원천: 설정 ggreport.plan-seed.location — 요청으로 경로·파일을 받지 않는다) ──
    public Map<String, Object> importSeed(String instId, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.seed();
        String sha = null;
        try {
            instId = canonicalId(instId);
            Resource res = seedResource(instId);
            if (res == null) throw ApiException.notFound("이 기관의 시드 파일이 없습니다.");
            String fileDate = fileDate(instId, res.getFilename());
            byte[] raw = readCapped(res);
            sha = sha256(raw);
            return apply(instId, raw, sha, fileDate, ORIGIN_SEED, null, actor, ui, ACTION_SEED);
        } catch (ApiException e) {
            failed(instId, ACTION_SEED, HeadAudit.outcomeOf(e.getStatus()), sha, actor, ui);
            throw e;
        } catch (RuntimeException e) {
            failed(instId, ACTION_SEED, "ERROR", sha, actor, ui);
            throw e;
        }
    }

    private Map<String, Object> apply(String instId, byte[] raw, String sha, String fileDate, String origin, String batch,
                                      Actor actor, BoardUiIds.Ui ui, String action) {
        final PlanCsv.Result r;
        try {
            r = PlanCsv.parse(raw, new PlanCsv.Options(instId, fileDate, ORIGIN_SEED.equals(origin), today()), codes().resolver);
        } catch (InstitutionCsv.CsvFormatException e) {
            throw ApiException.badRequest(e.getMessage());
        }
        return tx.execute(status -> {
            if (mapper.lockInstitution(instId) == null) throw ApiException.notFound("institution not found");
            InstPlanImport last = mapper.selectLatestImport(instId);
            if (last != null && sha.equals(last.getFileSha256())) {
                throw new ApiException(409, "이미 반입된 파일과 같습니다. 새 판을 만들지 않았습니다.");
            }
            // 판 되돌림 가드(팀 결정 2026-11-16): 수집 판이 있는 기관에 시드를 얹지 않고, 현재 판보다 이른 날짜 파일도 받지 않는다
            if (ORIGIN_SEED.equals(origin) && mapper.countImportsByOrigin(instId, ORIGIN_IMPORT) > 0) {
                throw new ApiException(409, "수집된 판이 있어 시드를 적용할 수 없습니다.");
            }
            if (last != null && last.getFileDate() != null && fileDate.compareTo(last.getFileDate()) < 0) {
                throw new ApiException(409, "현재 판보다 이전 날짜의 파일입니다.");
            }
            InstPlanImport imp = new InstPlanImport();
            imp.setInstitutionId(instId);
            imp.setOriginCd(origin);
            imp.setFileDate(fileDate);
            imp.setFileSha256(sha);
            imp.setFileBytes((long) raw.length);
            imp.setItemCount(r.rows);
            imp.setDocCount(r.docs.size());
            imp.setWarnCount(r.warnCount);
            imp.setBatchId(batch);
            imp.setImportedBy(actor.getEmpNo());
            imp.setImportedAt(Times.nowIso());
            imp.setImportedVerified(actor.isVerified() ? 1 : 0);
            mapper.insertImport(imp);
            int seq = 0;
            for (PlanCsv.Doc d : r.docs) {
                InstPlanDoc doc = new InstPlanDoc();
                doc.setImportId(imp.getImportId());
                doc.setInstitutionId(instId);
                doc.setDocSeq(++seq);
                doc.setTitle(d.title);
                doc.setSrcKindCd(d.srcKind);
                doc.setPeriodFrom(d.from);
                doc.setPeriodTo(d.to);
                doc.setSrcUrl(d.url);
                doc.setUrlMissing(d.urlMissing ? 1 : 0);
                doc.setCheckedOn(d.checkedOn);
                doc.setCollectorAgent(d.collectorAgent);
                doc.setPageRange(d.pageRange);
                doc.setNote(d.note);
                mapper.insertDoc(doc);
                for (PlanCsv.Item it : d.items) {
                    mapper.insertItem(itemRow(doc, it));
                }
            }
            // 성공 감사는 같은 트랜잭션 — 감사 없이 판이 생기지 않는다(기록 실패면 전체 롤백·500)
            mapper.insertAct(instId, imp.getImportId(), action, "OK", r.rows, sha, actor.getEmpNo(),
                    actor.isVerified() ? 1 : 0, ui.getScreen(), ui.getButton(), 1, Times.nowIso());
            if (ORIGIN_IMPORT.equals(origin)) {
                // 045: 그 기관의 열린 수집 요청 → 반영됨 + COLLECT_APPLY 감사(같은 트랜잭션 — 판과 요청 상태가 갈라지지 않는다). SEED 는 세지 않는다.
                // 요청자 쪽지만 저장점으로 떼어 실패해도 반입을 막지 않는다(qa P2-1). 045 표가 없으면 500 — 배포 순서 'DB 045 먼저'(README §8).
                collect.onImported(instId, imp.getImportId(), actor, ui);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("import_id", imp.getImportId());
            out.put("institution_id", instId);
            out.put("origin_cd", origin);
            out.put("doc_count", r.docs.size());
            out.put("item_count", r.rows);
            out.put("file_sha256", sha);
            out.put("warning_count", r.warnCount);
            List<Map<String, Object>> ws = new ArrayList<>();
            for (PlanCsv.Warning w : r.warnings) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("row", w.row);
                m.put("code", w.code);
                ws.add(m);
            }
            out.put("warnings", ws);
            return out;
        });
    }

    // ── 조회 ──
    @Transactional(readOnly = true)
    public Map<String, Object> status() {
        LocalDate today = today();
        Map<Long, List<InstPlanDoc>> byImport = new HashMap<>();
        for (InstPlanDoc d : mapper.selectLatestDocs()) {
            byImport.computeIfAbsent(d.getImportId(), k -> new ArrayList<>()).add(d);
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (InstPlanImport imp : mapper.selectLatestImports()) {
            List<InstPlanDoc> docs = byImport.getOrDefault(imp.getImportId(), Collections.<InstPlanDoc>emptyList());
            String oldest = null;
            int ended = 0, stale = 0, noUrl = 0;
            for (InstPlanDoc d : docs) {
                if (oldest == null || d.getCheckedOn().compareTo(oldest) < 0) oldest = d.getCheckedOn();
                if (periodEnded(d, today)) ended++;
                if (isStale(d.getCheckedOn(), today)) stale++;
                if (one(d.getUrlMissing())) noUrl++;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("institution_id", imp.getInstitutionId());
            m.put("doc_count", docs.size());
            m.put("item_count", imp.getItemCount());
            m.put("oldest_checked_on", oldest);
            m.put("stale", stale > 0);
            m.put("stale_doc_count", stale);
            m.put("period_ended", !docs.isEmpty() && ended == docs.size());
            m.put("period_ended_doc_count", ended);
            m.put("url_missing_doc_count", noUrl);
            m.put("origin_cd", imp.getOriginCd());
            m.put("imported_at", imp.getImportedAt());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", today.toString());
        out.put("stale_months", STALE_MONTHS);
        out.put("items", items);
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> detail(String instId) {
        instId = canonicalId(instId);
        String name = mapper.selectInstitutionName(instId);
        if (name == null) throw ApiException.notFound("institution not found");
        LocalDate today = today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("institution_id", instId);
        out.put("name_ko", name);
        out.put("today", today.toString());
        InstPlanImport imp = mapper.selectLatestImport(instId);
        List<Map<String, Object>> docs = new ArrayList<>();
        if (imp == null) {
            out.put("import", null);
        } else {
            Map<String, Object> im = new LinkedHashMap<>();   // 반입자 사번·해시는 싣지 않는다(최소 노출 — 감사 표에 있다)
            im.put("import_id", imp.getImportId());
            im.put("origin_cd", imp.getOriginCd());
            im.put("imported_at", imp.getImportedAt());
            im.put("file_date", imp.getFileDate());
            out.put("import", im);
            Map<Long, List<InstPlanItem>> byDoc = new HashMap<>();
            for (InstPlanItem it : mapper.selectItemsOfImport(imp.getImportId())) {
                byDoc.computeIfAbsent(it.getDocId(), k -> new ArrayList<>()).add(it);
            }
            Map<String, String> kindNames = codes().names.getOrDefault("PLAN_SRC_KIND", Collections.<String, String>emptyMap());
            for (InstPlanDoc d : mapper.selectDocsOfImport(imp.getImportId())) {
                docs.add(docJson(d, byDoc.getOrDefault(d.getDocId(), Collections.<InstPlanItem>emptyList()), today, kindNames));
            }
        }
        out.put("docs", docs);
        return out;
    }

    private Map<String, Object> docJson(InstPlanDoc d, List<InstPlanItem> items, LocalDate today, Map<String, String> kindNames) {
        Map<String, List<InstPlanItem>> children = new HashMap<>();
        for (InstPlanItem it : items) {
            if (it.getParentNo() != null) children.computeIfAbsent(it.getParentNo(), k -> new ArrayList<>()).add(it);
        }
        int confirmed = 0, partial = 0, unconfirmed = 0, notChecked = 0;
        Set<String> units = new HashSet<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (InstPlanItem it : items) {
            String c = it.getCheckCd();
            if ("CONFIRMED".equals(c)) confirmed++;
            else if ("PARTIAL".equals(c)) partial++;
            else if ("UNCONFIRMED".equals(c)) unconfirmed++;
            else notChecked++;
            if (PlanCsv.AMOUNT.equals(it.getBudgetStateCd())) units.add(it.getBudgetUnitCd());
            rows.add(itemJson(it, children.get(it.getItemNo())));
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("doc_id", d.getDocId());
        m.put("title", d.getTitle());
        m.put("src_kind_cd", d.getSrcKindCd());
        m.put("src_kind_name", kindNames.get(d.getSrcKindCd()));
        m.put("period_from", d.getPeriodFrom());
        m.put("period_to", d.getPeriodTo());
        m.put("period_ended", periodEnded(d, today));
        m.put("src_url", d.getSrcUrl());
        m.put("url_missing", one(d.getUrlMissing()));
        m.put("checked_on", d.getCheckedOn());
        m.put("stale", isStale(d.getCheckedOn(), today));
        m.put("page_range", d.getPageRange());
        m.put("note", d.getNote());
        Map<String, Object> cc = new LinkedHashMap<>();
        cc.put("confirmed", confirmed);
        cc.put("partial", partial);
        cc.put("unconfirmed", unconfirmed);
        cc.put("not_checked", notChecked);
        m.put("check_counts", cc);
        m.put("budget_unit_cd", units.size() == 1 ? units.iterator().next() : null);   // 문서 안 금액 단위가 하나면 열 머리 표기용
        m.put("items", rows);
        return m;
    }

    private static Map<String, Object> itemJson(InstPlanItem it, List<InstPlanItem> kids) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("item_id", it.getItemId());
        m.put("row_no", it.getRowNo());
        m.put("field_no", it.getFieldNo());
        m.put("field_name", it.getFieldName());
        m.put("item_no", it.getItemNo());
        m.put("parent_no", it.getParentNo());
        m.put("name", it.getItemName());
        m.put("content", it.getContent());
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("state_cd", it.getBudgetStateCd());
        b.put("amount", plain(it.getBudgetAmount()));
        b.put("unit_cd", it.getBudgetUnitCd());
        b.put("years", it.getBudgetYears());
        m.put("budget", b);
        m.put("calculated", calculated(it, kids));
        m.put("page", it.getPageNo());
        m.put("check_cd", it.getCheckCd());
        m.put("progress_cd", it.getProgressCd());   // DROPPED = 행 배지 '폐기'(공약이행 문서만)
        m.put("exec_rate", plain(it.getExecRate()));
        m.put("note", it.getNote());
        return m;
    }

    /**
     * 하위사업 합 계산값(팀 결정 2026-11-16): 상위사업 자신의 예산이 '금액'이 아니고 하위가 있을 때만 낸다.
     * 하위가 전부 금액이고 단위가 하나면 AMOUNT·합계, 하나라도 금액이 아니거나 단위가 섞이면 UNVERIFIED. 저장하지 않는다.
     */
    static Map<String, Object> calculated(InstPlanItem parent, List<InstPlanItem> kids) {
        if (kids == null || kids.isEmpty() || PlanCsv.AMOUNT.equals(parent.getBudgetStateCd())) return null;
        String unit = null;
        BigDecimal sum = BigDecimal.ZERO;
        boolean ok = true;
        for (InstPlanItem k : kids) {
            if (!PlanCsv.AMOUNT.equals(k.getBudgetStateCd()) || k.getBudgetAmount() == null || k.getBudgetUnitCd() == null
                    || (unit != null && !unit.equals(k.getBudgetUnitCd()))) {
                ok = false;
                break;
            }
            unit = k.getBudgetUnitCd();
            sum = sum.add(k.getBudgetAmount());
        }
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("is_calculated", true);
        c.put("state_cd", ok ? PlanCsv.AMOUNT : "UNVERIFIED");
        c.put("amount", ok ? plain(sum) : null);
        c.put("unit_cd", ok ? unit : null);
        c.put("child_count", kids.size());
        return c;
    }

    // ── '자료 없음' 목록 CSV(입찰 임박 순서는 화면이 보낸 순서 그대로) ──
    public static final class CsvOut {
        public final byte[] body;
        public final int rows;
        CsvOut(byte[] body, int rows) { this.body = body; this.rows = rows; }
    }

    @Transactional(readOnly = true)
    public CsvOut missingCsv(List<String> raw) {
        if (raw == null || raw.isEmpty() || raw.size() > MISSING_MAX_IDS) {
            throw ApiException.badRequest("기관 목록은 1~1,000개여야 합니다.");
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (String s : raw) {
            if (!PlanCsv.validId(s)) throw ApiException.badRequest("기관 목록에 형식이 맞지 않는 값이 있습니다.");
            ids.add(s);
        }
        Set<String> have = new HashSet<>();
        for (InstPlanImport i : mapper.selectLatestImports()) have.add(i.getInstitutionId());
        Map<String, List<Map<String, Object>>> byUpper = new HashMap<>();
        for (Map<String, Object> row : mapper.selectInstitutionsIn(new ArrayList<>(ids))) {
            byUpper.computeIfAbsent(str(row.get("INSTITUTION_ID")).toUpperCase(Locale.ROOT), k -> new ArrayList<>()).add(row);
        }
        StringBuilder sb = new StringBuilder("\uFEFF");   // UTF-8 BOM(엑셀이 한글을 바로 읽게)
        line(sb, "기관ID", "기관명", "지역코드", "기관구분", "올릴 파일 이름");
        int n = 0;
        Set<String> done = new HashSet<>();
        for (String id : ids) {
            List<Map<String, Object>> cand = byUpper.get(id.toUpperCase(Locale.ROOT));   // id 는 validId 를 통과한 ASCII
            Map<String, Object> row = null;
            if (cand != null) {
                for (Map<String, Object> c : cand) if (id.equals(str(c.get("INSTITUTION_ID")))) row = c;
                if (row == null && cand.size() == 1) row = cand.get(0);
            }
            if (row == null) continue;   // 없는 기관 id 는 건너뛴다(사유를 싣지 않는다)
            String canon = str(row.get("INSTITUTION_ID"));
            if (!done.add(canon) || have.contains(canon)) continue;   // 자료가 있거나, 같은 기관을 대소문자만 달리 두 번 보내도 한 줄
            line(sb, canon, str(row.get("NAME_KO")), str(row.get("REGION_CODE")), str(row.get("INST_TYPE")), canon + "_YYYYMMDD_plan.csv");
            n++;
        }
        return new CsvOut(sb.toString().getBytes(StandardCharsets.UTF_8), n);
    }

    /** admin.csvCell(admin.js:232)과 같은 규칙 — = + - @ TAB CR 로 시작하면 ' 를 붙이고 따옴표로 감싼다(보안 조건 6ⓑ). */
    static String csvCell(String v) {
        String t = v == null ? "" : v;
        if (!t.isEmpty() && "=+-@\t\r".indexOf(t.charAt(0)) >= 0) t = "'" + t;
        return "\"" + t.replace("\"", "\"\"") + "\"";
    }

    private static void line(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(csvCell(cells[i]));
        }
        sb.append("\r\n");
    }

    // ── 보조 ──
    /** 경로·본문의 기관ID → INSTITUTIONS 의 정식 표기. 형식 검사 → 대소문자 무시 조회 → 정확히 일치하는 것 우선, 하나뿐이면 그것, 없거나 모호하면 404(11-16 팀 결정: 대문자 나라장터 ID 43건 허용). */
    private String canonicalId(String raw) {
        if (!PlanCsv.validId(raw)) throw ApiException.notFound("institution not found");
        List<String> hit = mapper.selectIdsIgnoreCase(raw);
        if (hit.contains(raw)) return raw;
        if (hit.size() == 1) return hit.get(0);
        throw ApiException.notFound("institution not found");
    }
    static String fileDate(String instId, String original) {
        String name = original == null ? "" : original;
        int cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (cut >= 0) name = name.substring(cut + 1);
        Matcher m = PlanCsv.FILE_NAME.matcher(name);
        if (!m.matches()) throw ApiException.badRequest("파일 이름은 {기관ID}_{확인일YYYYMMDD}_plan.csv 형식이어야 합니다.");
        if (!m.group(1).equalsIgnoreCase(instId)) throw ApiException.badRequest("파일 이름의 기관ID가 반입 대상 기관과 다릅니다.");
        String d = m.group(2);
        String iso = d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6);
        try {
            LocalDate.parse(iso);
        } catch (DateTimeException e) {
            throw ApiException.badRequest("파일 이름의 날짜가 올바르지 않습니다.");
        }
        return iso;
    }

    private static String batch(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String v = raw.trim();
        if (!BATCH.matcher(v).matches()) throw ApiException.badRequest("배치 id 형식이 올바르지 않습니다.");
        return v;
    }

    private Resource seedResource(String instId) {
        Resource[] found;
        try {
            found = resources.getResources(seedLocation + instId + "_*_plan.csv");   // instId 는 [A-Za-z0-9-] 만 — 와일드카드가 끼어들 수 없다
        } catch (IOException e) {
            return null;
        }
        Resource best = null;
        String bestName = null;
        for (Resource r : found) {
            String n = r.getFilename();
            if (n == null || !n.startsWith(instId + "_") || !PlanCsv.FILE_NAME.matcher(n).matches()) continue;
            if (bestName == null || n.compareTo(bestName) > 0) {
                best = r;
                bestName = n;
            }
        }
        return best;
    }

    private static byte[] readCapped(Resource res) {
        try (InputStream in = res.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > CsvLimits.MAX_FILE_BYTES) throw tooLarge();
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("plan seed unreadable");
        }
    }

    private void failed(String instId, String action, String outcome, String sha, Actor actor, BoardUiIds.Ui ui) {
        try {
            audit.record(instId, null, action, outcome, null, sha, actor, ui);
        } catch (RuntimeException ex) {
            LOG.error("inst-plan audit failed action={} outcome={}", action, outcome);   // 값·파일 이름 없음
        }
    }

    /** COMMON_CODE PLAN_* — 코드와 한글 이름 둘 다 같은 코드로 푼다. */
    private static final class CodeTable {
        final PlanCsv.Codes resolver;
        final Map<String, Map<String, String>> names;
        CodeTable(PlanCsv.Codes resolver, Map<String, Map<String, String>> names) { this.resolver = resolver; this.names = names; }
    }

    private CodeTable codes() {
        final Map<String, Map<String, String>> lookup = new HashMap<>();
        Map<String, Map<String, String>> names = new HashMap<>();
        for (Map<String, Object> row : mapper.selectPlanCodes()) {
            String g = str(row.get("CODE_GROUP")), c = str(row.get("CODE")), n = str(row.get("CODE_NAME"));
            Map<String, String> m = lookup.computeIfAbsent(g, k -> new HashMap<>());
            m.put(c, c);
            if (n != null) {
                m.putIfAbsent(n, c);
                names.computeIfAbsent(g, k -> new HashMap<>()).put(c, n);
            }
        }
        return new CodeTable((group, raw) -> {
            Map<String, String> m = lookup.get(group);
            return m == null || raw == null ? null : m.get(raw.trim());
        }, names);
    }

    static boolean isStale(String checkedOn, LocalDate today) {
        return LocalDate.parse(checkedOn).isBefore(today.minusMonths(STALE_MONTHS));   // 12개월 '초과'
    }

    static boolean periodEnded(InstPlanDoc d, LocalDate today) {
        return d.getPeriodTo() != null && d.getPeriodTo() < today.getYear();
    }

    private static InstPlanItem itemRow(InstPlanDoc doc, PlanCsv.Item it) {
        InstPlanItem r = new InstPlanItem();
        r.setDocId(doc.getDocId());
        r.setImportId(doc.getImportId());
        r.setInstitutionId(doc.getInstitutionId());
        r.setRowNo(it.row);
        r.setFieldNo(it.fieldNo);
        r.setFieldName(it.fieldName);
        r.setItemNo(it.no);
        r.setParentNo(it.parentNo);
        r.setItemName(it.name);
        r.setContent(it.content);
        r.setBudgetStateCd(it.budgetState);
        r.setBudgetAmount(it.amount);
        r.setBudgetUnitCd(it.budgetUnit);
        r.setBudgetYears(it.budgetYears);
        r.setPageNo(it.page);
        r.setCheckCd(it.check);
        r.setProgressCd(it.progress);
        r.setExecRate(it.rate);
        r.setNote(it.note);
        return r;
    }

    private static ApiException tooLarge() { return new ApiException(413, "파일이 너무 큽니다(5MB 이하)."); }
    private static boolean one(Integer v) { return v != null && v == 1; }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String plain(BigDecimal v) { return v == null ? null : v.stripTrailingZeros().toPlainString(); }

    static String sha256(byte[] data) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
