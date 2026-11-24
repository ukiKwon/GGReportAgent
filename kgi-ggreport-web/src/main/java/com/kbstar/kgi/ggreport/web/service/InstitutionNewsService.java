package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.InstNewsImport;
import com.kbstar.kgi.ggreport.web.domain.InstNewsItem;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionNewsMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionPlanMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.CsvLimits;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.support.NewsCsv;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Matcher;

/**
 * 기관 관련 뉴스(060, NEXT 107) — 사업계획을 못 찾은 기관의 대체 자료 반입·조회.
 * 구조는 InstitutionPlanService.apply 와 같다: 검증은 트랜잭션 밖(NewsCsv), 안에서는 기관 잠금 → 같은 파일(409 MSG_SAME) → 이른 날짜(409 MSG_OLDER)
 * → 판·항목 INSERT → 감사(NEWS_IMPORT/OK) → 열린 수집 요청 닫기(onNewsImported)를 한 트랜잭션으로. 실패(400·404·409·413·500)도 INST_PLAN_ACT 에 남긴다.
 * 409 문구는 InstitutionPlanService.MSG_SAME·MSG_OLDER 상수를 그대로 쓴다 — PlanInboxService.classify 가 글자 비교로 ALREADY·OLDER 를 가른다(security 하2).
 * 감사·조회에 제목·요약·URL·언론사는 싣지 않는다. 반입자 사번·SHA 는 조회 응답에 내보내지 않는다.
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다. 관리자 검사는 업무 규칙이지 사칭 방지가 아니다.
 */
@Service
public class InstitutionNewsService {

    private static final Logger LOG = LoggerFactory.getLogger(InstitutionNewsService.class);
    public static final String ACTION_NEWS_IMPORT = "NEWS_IMPORT";
    public static final String PLAN_FOUND = "PLAN_FOUND";
    public static final String NEWS_ONLY = "NEWS_ONLY";
    public static final String NOT_FOUND = "NOT_FOUND";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final InstitutionPlanService plans;
    private final InstitutionPlanMapper planMapper;
    private final InstitutionNewsMapper mapper;
    private final PlanAudit audit;
    private final PlanCollectService collect;
    private final TransactionTemplate tx;

    public InstitutionNewsService(InstitutionPlanService plans, InstitutionPlanMapper planMapper, InstitutionNewsMapper mapper,
                                  PlanAudit audit, PlanCollectService collect, PlatformTransactionManager txm) {
        this.plans = plans;
        this.planMapper = planMapper;
        this.mapper = mapper;
        this.audit = audit;
        this.collect = collect;
        this.tx = new TransactionTemplate(txm);
    }

    LocalDate today() { return LocalDate.now(SEOUL); }

    // ── 반입(관리자) ──
    /** 파일 올리기(multipart). 원래 파일 이름은 날짜 판정에만 쓰고 저장하지 않는다. */
    public Map<String, Object> importUpload(String instId, MultipartFile file, String batchRaw, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.newsUpload();
        String inst = null;   // 감사 기관ID — canonical 이 성공한 뒤에만 채운다(실패하면 NONE)
        String sha = null;
        try {
            inst = canonical(instId);
            if (file == null || file.isEmpty()) throw ApiException.badRequest("파일을 선택하세요.");
            if (file.getSize() > CsvLimits.MAX_FILE_BYTES) throw InstitutionPlanService.tooLarge();
            String fileDate = fileDate(inst, file.getOriginalFilename());
            String batch = InstitutionPlanService.batch(batchRaw);
            byte[] raw;
            try { raw = file.getBytes(); } catch (IOException e) { throw ApiException.badRequest("파일을 읽을 수 없습니다."); }
            if (raw.length > CsvLimits.MAX_FILE_BYTES) throw InstitutionPlanService.tooLarge();
            sha = InstitutionPlanService.sha256(raw);
            return apply(inst, raw, sha, fileDate, batch, actor, ui);
        } catch (ApiException e) {
            failed(inst, HeadAudit.outcomeOf(e.getStatus()), sha, actor, ui);
            throw e;
        } catch (RuntimeException e) {
            failed(inst, "ERROR", sha, actor, ui);
            throw e;
        }
    }

    /** 서버 폴더 반입(PlanInboxService) — 이름·바이트는 호출자가 설정 폴더에서 읽은 값. */
    public Map<String, Object> importFile(String fileName, byte[] raw, String batchRaw, Actor actor, BoardUiIds.Ui ui) {
        Matcher fm = NewsCsv.FILE_NAME.matcher(fileName == null ? "" : fileName);
        String rawId = fm.matches() ? fm.group(1) : null;
        String inst = null;
        String sha = null;
        try {
            if (rawId == null) throw ApiException.badRequest("파일 이름은 {기관ID}_{확인일YYYYMMDD}_news.csv 형식이어야 합니다.");
            inst = canonical(rawId);
            if (raw == null) throw ApiException.badRequest("파일을 읽을 수 없습니다.");
            if (raw.length > CsvLimits.MAX_FILE_BYTES) throw InstitutionPlanService.tooLarge();
            String fileDate = fileDate(inst, fileName);
            String batch = InstitutionPlanService.batch(batchRaw);
            sha = InstitutionPlanService.sha256(raw);
            return apply(inst, raw, sha, fileDate, batch, actor, ui);
        } catch (ApiException e) {
            failed(inst, HeadAudit.outcomeOf(e.getStatus()), sha, actor, ui);
            throw e;
        } catch (RuntimeException e) {
            failed(inst, "ERROR", sha, actor, ui);
            throw e;
        }
    }

    /** 폴더 확인(읽기 전용, DB·파일 무변경) — InstitutionPlanService.inspect 와 같은 순서(같은 SHA → IMPORTED, 이른 날짜 → OLDER, 그다음 내용 검사). */
    public Map<String, Object> inspect(String fileName, Supplier<byte[]> reader) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("file_name", fileName);
        m.put("institution_id", null);
        m.put("name_ko", null);
        m.put("file_date", null);
        Matcher fm = NewsCsv.FILE_NAME.matcher(fileName == null ? "" : fileName);
        if (!fm.matches()) return status(m, "BAD_NAME");
        String inst = plans.canonicalOrNull(fm.group(1));
        if (inst == null) return status(m, "NO_INSTITUTION");
        m.put("institution_id", inst);
        m.put("name_ko", planMapper.selectInstitutionName(inst));
        String fileDate;
        try {
            fileDate = fileDate(inst, fileName);
        } catch (ApiException e) {
            return status(m, "BAD_DATE");
        }
        m.put("file_date", fileDate);
        byte[] raw;
        try {
            raw = reader.get();
        } catch (InstitutionPlanService.FileProblem e) {
            return status(m, e.getCode());
        }
        if (mapper.countImportBySha(inst, InstitutionPlanService.sha256(raw)) > 0) return status(m, "IMPORTED");
        InstNewsImport last = mapper.selectLatestImport(inst);
        if (last != null && last.getFileDate() != null && fileDate.compareTo(last.getFileDate()) < 0) return status(m, "OLDER");
        try {
            NewsCsv.Result r = NewsCsv.parse(raw, new NewsCsv.Options(inst, fileDate, today()));
            m.put("item_count", r.rows.size());
            return status(m, "READY");
        } catch (InstitutionCsv.CsvFormatException e) {
            m.put("message", e.getMessage());
            return status(m, "INVALID");
        }
    }

    private Map<String, Object> apply(String instId, byte[] raw, String sha, String fileDate, String batch, Actor actor, BoardUiIds.Ui ui) {
        final NewsCsv.Result r;
        try {
            r = NewsCsv.parse(raw, new NewsCsv.Options(instId, fileDate, today()));
        } catch (InstitutionCsv.CsvFormatException e) {
            throw ApiException.badRequest(e.getMessage());
        }
        return tx.execute(status -> {
            if (planMapper.lockInstitution(instId) == null) throw ApiException.notFound("institution not found");
            InstNewsImport last = mapper.selectLatestImport(instId);
            if (last != null && sha.equals(last.getFileSha256())) throw new ApiException(409, InstitutionPlanService.MSG_SAME);
            if (mapper.countImportBySha(instId, sha) > 0) throw new ApiException(409, InstitutionPlanService.MSG_SAME);   // 예전 판 내용으로 되돌리지 않는다(폴더 반입 멱등)
            if (last != null && last.getFileDate() != null && fileDate.compareTo(last.getFileDate()) < 0) {
                throw new ApiException(409, InstitutionPlanService.MSG_OLDER);
            }
            InstNewsImport imp = new InstNewsImport();
            imp.setInstitutionId(instId);
            imp.setFileDate(fileDate);
            imp.setFileSha256(sha);
            imp.setFileBytes((long) raw.length);
            imp.setItemCount(r.rows.size());
            imp.setBatchId(batch);
            imp.setImportedBy(actor.getEmpNo());
            imp.setImportedAt(Times.nowIso());
            imp.setImportedVerified(actor.isVerified() ? 1 : 0);
            mapper.insertImport(imp);
            for (NewsCsv.Row n : r.rows) {
                InstNewsItem it = new InstNewsItem();
                it.setImportId(imp.getImportId());
                it.setInstitutionId(instId);
                it.setRowNo(n.row);
                it.setFieldCd(n.fieldCd);
                it.setTitle(n.title);
                it.setPress(n.press);
                it.setPublishedOn(n.publishedOn);
                it.setSrcUrl(n.url);
                it.setSummary(n.summary);
                it.setCheckedOn(n.checkedOn);
                it.setCollectorAgent(n.collectorAgent);
                mapper.insertItem(it);
            }
            // 성공 감사는 같은 트랜잭션 — 감사 없이 판이 생기지 않는다(기록 실패면 전체 롤백·500)
            planMapper.insertAct(instId, imp.getImportId(), ACTION_NEWS_IMPORT, "OK", r.rows.size(), sha, actor.getEmpNo(),
                    actor.isVerified() ? 1 : 0, ui.getScreen(), ui.getButton(), 1, Times.nowIso());
            // 열린 수집 요청 닫기(팀 결정 11-24: 뉴스 반입이 요청을 닫는다) — onImported 와 별개 경로(중2)
            collect.onNewsImported(instId, imp.getImportId(), actor, ui);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("import_id", imp.getImportId());
            out.put("institution_id", instId);
            out.put("item_count", r.rows.size());
            out.put("file_sha256", sha);
            return out;
        });
    }

    // ── 조회 ──
    /** 기관의 현재(가장 큰 IMPORT_ID) 뉴스 판. 판이 없으면 200 + has_news=false. 반입자 사번·SHA 는 싣지 않는다. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(String instId) {
        String inst = plans.canonicalOrNull(instId);
        if (inst == null) throw ApiException.notFound("institution not found");
        LocalDate today = today();
        InstNewsImport imp = mapper.selectLatestImport(inst);
        String planState = planMapper.selectLatestImport(inst) != null ? PLAN_FOUND : imp != null ? NEWS_ONLY : NOT_FOUND;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("institution_id", inst);
        out.put("name_ko", planMapper.selectInstitutionName(inst));
        out.put("today", today.toString());
        out.put("stale_months", InstitutionPlanService.STALE_MONTHS);
        out.put("plan_state", planState);
        out.put("has_news", imp != null);
        List<Map<String, Object>> items = new ArrayList<>();
        if (imp == null) {
            out.put("import_id", null);
            out.put("file_date", null);
            out.put("checked_on", null);
            out.put("window_from", null);
            out.put("window_to", null);
            out.put("item_count", 0);
            out.put("stale", false);
        } else {
            LocalDate checked = LocalDate.parse(imp.getFileDate());
            out.put("import_id", imp.getImportId());
            out.put("file_date", imp.getFileDate());
            out.put("checked_on", imp.getFileDate());
            out.put("window_from", checked.minusYears(1).toString());
            out.put("window_to", imp.getFileDate());
            out.put("item_count", imp.getItemCount());
            out.put("stale", InstitutionPlanService.isStale(imp.getFileDate(), today));
            for (InstNewsItem it : mapper.selectItemsOfImport(imp.getImportId())) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("news_id", it.getNewsId());
                m.put("field_cd", it.getFieldCd());
                m.put("field_name", NewsCsv.fieldName(it.getFieldCd()));
                m.put("title", it.getTitle());
                m.put("press", it.getPress());
                m.put("published_on", it.getPublishedOn());
                m.put("url", it.getSrcUrl());
                m.put("summary", it.getSummary());
                m.put("checked_on", it.getCheckedOn());
                m.put("collector_agent", it.getCollectorAgent());
                m.put("stale", InstitutionPlanService.isStale(it.getCheckedOn(), today));
                items.add(m);
            }
        }
        out.put("items", items);
        return out;
    }

    // ── 보조 ──
    private String canonical(String raw) {
        String c = plans.canonicalOrNull(raw);
        if (c == null) throw ApiException.notFound("institution not found");
        return c;
    }

    private static Map<String, Object> status(Map<String, Object> m, String code) {
        m.put("status_cd", code);
        return m;
    }

    /** 파일 이름 → 확인일(ISO). 이름 형식·기관ID(대소문자 무시)·실제 달력 날짜를 본다. 원래 이름은 어디에도 저장하지 않는다. */
    static String fileDate(String instId, String original) {
        String name = original == null ? "" : original;
        int cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (cut >= 0) name = name.substring(cut + 1);
        Matcher m = NewsCsv.FILE_NAME.matcher(name);
        if (!m.matches()) throw ApiException.badRequest("파일 이름은 {기관ID}_{확인일YYYYMMDD}_news.csv 형식이어야 합니다.");
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

    private void failed(String instId, String outcome, String sha, Actor actor, BoardUiIds.Ui ui) {
        try {
            audit.record(instId, null, ACTION_NEWS_IMPORT, outcome, null, sha, actor, ui);
        } catch (RuntimeException ex) {
            LOG.error("inst-news audit failed outcome={}", outcome);   // 값·파일 이름 없음
        }
    }
}
