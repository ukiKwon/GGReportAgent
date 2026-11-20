package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepFormIn;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.service.PrepFormAudit;
import com.kbstar.kgi.ggreport.web.service.PrepFormService;
import com.kbstar.kgi.ggreport.web.service.PrepService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PrepFormUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 사전준비 양식 '기관 정보 요약'(049, NEXT 100 S2) — PrepController 와 따로 둔다(그 파일은 다른 세션 소유). 감사 틀은 {@code PrepController.run} 과 같다.
 * 호출자 확인은 {@link MenuGuard#requireActiveUser}(401/403 DENIED) — 사번이 확인된 403 은 BID_PREP_ACT 에도 DENIED, 사번 없는 401 은 ACCESS_LOG 에만.
 * 역할 검사 403 은 서비스가 던지고 여기서 DENIED 로 접근 이력에 남긴다. 접근 이력(ACCESS_LOG.DETAIL)에는
 * {@code prep-form case=… state=… code=… ver=n} 만 남기고 값·사유·이름·파일명은 넣지 않는다.
 * <ul>
 *   <li>읽기·내려받기의 성공 줄(FORM_VIEW·FORM_HISTORY·FORM_DOCX·FORM_DRAFT_DOCX)은 응답 전에 여기서 기록한다(기록이 실패하면 500, 데이터 안 나감).</li>
 *   <li>쓰기 4종(FORM_PREFILL·FORM_SAVE·FORM_CONFIRM·FORM_UNCONFIRM)의 성공 줄은 서비스가 업무와 같은 트랜잭션에서 쓴다(security 11-20 중-1) — 여기서는 실패 줄만.</li>
 *   <li>모든 실패 줄(DENIED·HIDDEN·BLOCKED·INVALID·ERROR)은 여기서 따로 커밋한다. 기록이 실패해도 원래 응답을 덮지 않는다.</li>
 * </ul>
 * 식별자(X-Screen-Id·X-Button-Id): 열람·판 목록은 UNKNOWN 이어도 통과(기록만), 쓰기·내려받기는 유효하지 않으면 400 UI_ID_REQUIRED(서비스).
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 */
@RestController
public class PrepFormController {

    private static final Logger LOG = LoggerFactory.getLogger(PrepFormController.class);
    private static final String NO_CASE = "NONE";
    private static final MediaType DOCX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    private static final String BASE = "/bidcases/{bidCaseId}/prep/forms/{formCd}";

    private final PrepFormService forms;
    private final PrepService prep;
    private final PrepFormAudit audit;
    private final MenuGuard guard;

    public PrepFormController(PrepFormService forms, PrepService prep, PrepFormAudit audit, MenuGuard guard) {
        this.forms = forms;
        this.prep = prep;
        this.audit = audit;
        this.guard = guard;
    }

    /** 양식 한 장(칸 지도·내용·낡은 칸·내 권한). */
    @GetMapping(BASE)
    public Map<String, Object> view(@PathVariable String bidCaseId, @PathVariable String formCd, HttpServletRequest req) {
        return run(req, bidCaseId, "FORM_VIEW", true, me -> forms.view(me, bidCaseId, formCd));
    }

    /** 판 목록(내용 제외, 저장한 사람 이름만). */
    @GetMapping(BASE + "/versions")
    public List<Map<String, Object>> versions(@PathVariable String bidCaseId, @PathVariable String formCd, HttpServletRequest req) {
        return run(req, bidCaseId, "FORM_HISTORY", true, me -> forms.versions(me, bidCaseId, formCd));
    }

    /** 원본에서 사실 칸(과 씨앗)을 다시 채운다. */
    @PostMapping(BASE + "/prefill")
    public Map<String, Object> prefill(@PathVariable String bidCaseId, @PathVariable String formCd,
                                       @RequestBody(required = false) PrepFormIn.Prefill body, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        return run(req, bidCaseId, "FORM_PREFILL", false, me -> forms.prefill(me, actor, ui, bidCaseId, formCd, body));
    }

    /** 편집 칸 저장(전체 교체). */
    @PutMapping(BASE + "/draft")
    public Map<String, Object> saveDraft(@PathVariable String bidCaseId, @PathVariable String formCd,
                                         @RequestBody(required = false) PrepFormIn.Draft body, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        return run(req, bidCaseId, "FORM_SAVE", false, me -> forms.saveDraft(me, actor, ui, bidCaseId, formCd, body));
    }

    /** 확정. */
    @PostMapping(BASE + "/confirm")
    public Map<String, Object> confirm(@PathVariable String bidCaseId, @PathVariable String formCd,
                                       @RequestBody(required = false) PrepFormIn.Base body, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        return run(req, bidCaseId, "FORM_CONFIRM", false, me -> forms.confirm(me, actor, ui, bidCaseId, formCd, body));
    }

    /** 확정 취소(사유 필수). */
    @PostMapping(BASE + "/unconfirm")
    public Map<String, Object> unconfirm(@PathVariable String bidCaseId, @PathVariable String formCd,
                                         @RequestBody(required = false) PrepFormIn.Unconfirm body, HttpServletRequest req) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        return run(req, bidCaseId, "FORM_UNCONFIRM", false, me -> forms.unconfirm(me, actor, ui, bidCaseId, formCd, body));
    }

    /** 확정본 .docx — 확정 판에서 다시 만든 파일. */
    @GetMapping(BASE + "/confirmed-docx")
    public ResponseEntity<byte[]> confirmedDocx(@PathVariable String bidCaseId, @PathVariable String formCd, HttpServletRequest req) {
        return docx(req, bidCaseId, formCd, true);
    }

    /** 초안 .docx — 현재 판, 제목에 '[확정 전 초안]'. */
    @GetMapping(BASE + "/draft-docx")
    public ResponseEntity<byte[]> draftDocx(@PathVariable String bidCaseId, @PathVariable String formCd, HttpServletRequest req) {
        return docx(req, bidCaseId, formCd, false);
    }

    private ResponseEntity<byte[]> docx(HttpServletRequest req, String bid, String formCd, boolean confirmed) {
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        PrepFormService.DocOut out = run(req, bid, confirmed ? "FORM_DOCX" : "FORM_DRAFT_DOCX", true,
                me -> forms.docx(me, ui, bid, formCd, confirmed));
        String safe = (out.getInstName() == null ? "" : out.getInstName()).replaceAll("[^0-9A-Za-z가-힣]", "_");
        if (safe.length() > 40) {
            safe = safe.substring(0, 40);
        }
        String file = "기관정보요약_" + safe + "_v" + out.getVerNo() + (confirmed ? "" : "_초안") + "_" + Times.todayKst().replace("-", "") + ".docx";
        String encoded;
        try {
            encoded = URLEncoder.encode(file, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            throw new IllegalStateException(never);   // UTF-8 은 모든 JRE 에 있다
        }
        HttpHeaders h = new HttpHeaders();
        h.setContentType(DOCX);
        h.setContentLength(out.getBytes().length);
        h.set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"inst_summary.docx\"; filename*=UTF-8''" + encoded);
        h.set(HttpHeaders.CACHE_CONTROL, "no-store");
        h.set(HttpHeaders.PRAGMA, "no-cache");
        h.set("X-Content-Type-Options", "nosniff");
        return new ResponseEntity<byte[]>(out.getBytes(), h, HttpStatus.OK);
    }

    // ── 내부 ────────────────────────────────────────────────────────────

    /**
     * 공통 틀 — 활성 사용자 확인(401/403 DENIED) → 행위 직전 건 상태 → 실행 → (읽기면) BID_PREP_ACT OK 줄. 실패는 결과 코드와 함께 남긴다.
     * recordOk=false(쓰기)면 성공 줄은 서비스가 이미 썼다.
     */
    private <T> T run(HttpServletRequest req, String bid, String action, boolean recordOk, Function<SysUser, T> fn) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = PrepFormUiIds.of(req);
        String auditBid = caseKey(bid);   // 경로 원문이 형식 밖이면 NONE — 감사 칸·접근 이력에 자유 문구를 넣지 않는다
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {   // 사번이 확인된 비활성·미등록만 ACT. 사번 없는 401 은 ACCESS_LOG 에만
                auditFailure(auditBid, action, "DENIED", null, actor, ui);
            }
            throw e;
        }
        String before;
        try {
            before = prep.stateOf(bid);
        } catch (RuntimeException e) {
            auditFailure(auditBid, action, "ERROR", NO_CASE, actor, ui);
            throw e;
        }
        T out;
        try {
            out = fn.apply(me);
        } catch (ApiException e) {
            if (e.getStatus() != 401) {
                auditFailure(auditBid, action, PrepAudit.outcomeOf(e.getStatus()), before, actor, ui);   // 같은 결과 코드 표
            }
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        } catch (RuntimeException e) {   // DB 오류 등 — ERROR 로 남기고 그대로 던진다
            auditFailure(auditBid, action, "ERROR", before, actor, ui);
            throw e;
        }
        Integer ver = formVerOf(out);
        if (recordOk) {
            try {
                audit.record(bid, action, "OK", before, ver, actor, ui);
            } catch (RuntimeException e) {
                LOG.error("사전준비 양식 성공 감사를 남기지 못했다(응답 500): action={} case={} cause={}", action, auditBid, e.getClass().getSimpleName());
                throw e;
            }
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "prep-form case=" + auditBid + " state=" + before + " code=" + action
                + (ver == null ? "" : " ver=" + ver));
        return out;
    }

    /** 감사·접근 이력에 남길 판 번호 — 쓰기 결과의 cur_ver(확정 취소는 취소한 판 unconfirmed_ver), 내려받기는 판 번호. 판 목록은 없다. */
    private static Integer formVerOf(Object out) {
        if (out instanceof PrepFormService.DocOut) {
            return ((PrepFormService.DocOut) out).getVerNo();
        }
        if (out instanceof Map) {
            Object u = ((Map<?, ?>) out).get("unconfirmed_ver");
            Object c = u != null ? u : ((Map<?, ?>) out).get("cur_ver");
            return c instanceof Integer && (Integer) c > 0 ? (Integer) c : null;   // 0 = 아직 판 없음 → 비움
        }
        return null;
    }

    private void auditFailure(String bid, String action, String outcome, String before, Actor actor, BoardUiIds.Ui ui) {
        try {
            String st = before != null ? before : NO_CASE.equals(bid) ? NO_CASE : prep.stateOf(bid);
            audit.record(bid, action, outcome, st, null, actor, ui);
        } catch (RuntimeException ex) {
            LOG.warn("사전준비 양식 실패 감사를 남기지 못했다: action={} outcome={} cause={}", action, outcome, ex.getClass().getSimpleName());
        }
    }

    private static String caseKey(String bid) {
        String b = bid == null ? "" : bid.trim();
        return b.matches("[A-Za-z0-9._-]{1,64}") ? b : NO_CASE;
    }

}
