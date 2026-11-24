package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.config.MinutesSettings;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardMinutesIn;
import com.kbstar.kgi.ggreport.web.minutes.MinutesException;
import com.kbstar.kgi.ggreport.web.service.BoardMinutesAccess;
import com.kbstar.kgi.ggreport.web.service.BoardMinutesAudit;
import com.kbstar.kgi.ggreport.web.service.BoardMinutesService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.MinutesUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.util.WebUtils;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * 이사회 회의록(047). 경로는 {@code /board-minutes} 와 이사회 자료 하위 {@code /board-materials/{mid}/minutes}(020 컨트롤러와 겹치지 않는다).
 * 호출자 확인은 {@link MenuGuard#requireActiveUser}(401/403 DENIED, 메뉴 무관) — 권한 판정은 {@link BoardMinutesAccess}(020 권한을 상속하지 않는다).
 *
 * <p>공통 관문({@link #exec}): 기능이 꺼져 있으면 모든 경로가 404(기록 없음) → 호출자 확인 → (설정 시) 앞단 인증 필수 → 화면·버튼 식별자(쓰기·원문·이력·감사는 필수, 아니면 400 UI_ID_REQUIRED)
 * → 본 처리 → 감사 기록. 볼 수 없는 회의록은 404, 볼 수는 있으나 권한이 없으면 403(ACCESS_LOG DENIED). 모든 응답에 {@code Cache-Control: no-store}({@code MinutesLimitFilter}).
 * 접근 이력(ACCESS_LOG) detail 에는 번호·코드·건수뿐 — 본문·제목·가림 단어·파일명·사번 없음.
 * ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 자기신고다 — 사칭·위조 방지가 아니다.
 */
@RestController
public class BoardMinutesController {

    private static final Set<String> PARTS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "transcript", "timeline", "summary", "options", "edits")));
    private static final int OPTIONS_MAX_BYTES = 16 * 1024;
    private static final int EDITS_MAX_BYTES = 512 * 1024;   // MinutesLimitFilter 업로드 여유 1MB 안

    private final MenuGuard guard;
    private final MinutesSettings settings;
    private final BoardMinutesService service;
    private final BoardMinutesAudit audit;
    private final BoardMinutesAccess access;

    public BoardMinutesController(MenuGuard guard, MinutesSettings settings, BoardMinutesService service,
                                  BoardMinutesAudit audit, BoardMinutesAccess access) {
        this.guard = guard;
        this.settings = settings;
        this.service = service;
        this.audit = audit;
        this.access = access;
    }

    /** 한 요청의 호출자·대상 회의록·판정. head·d 는 자료 기준 호출이면 null/NONE. */
    private static final class Call {
        final SysUser me;
        final BoardMinutes head;
        final BoardMinutesAccess.Decision d;
        final BoardMinutesAudit.Ctx ctx;
        final Actor actor;

        Call(SysUser me, BoardMinutes head, BoardMinutesAccess.Decision d, BoardMinutesAudit.Ctx ctx, Actor actor) {
            this.me = me;
            this.head = head;
            this.d = d;
            this.ctx = ctx;
            this.actor = actor;
        }
    }

    // ── 읽기 ──

    @GetMapping("/board-minutes")
    public Map<String, Object> list(@RequestParam(name = "q", required = false) String q,
                                    @RequestParam(name = "year", required = false) String year,
                                    @RequestParam(name = "meeting_from", required = false) String from,
                                    @RequestParam(name = "meeting_to", required = false) String to,
                                    HttpServletRequest req) {
        Map<String, Object> out = exec(req, nullCtx(), "board-minutes code=LIST", "LIST", false, BoardMinutesAccess.Via.NONE,
                c -> service.list(c.me, q, year, from, to));
        return recordRows(out, "LIST", req);
    }

    @GetMapping("/board-materials/{mid}/minutes")
    public Map<String, Object> listByMaterial(@PathVariable String mid, HttpServletRequest req) {
        Map<String, Object> out = exec(req, nullCtx(), "board-minutes code=LIST_MATERIAL", "LIST_MATERIAL", false,
                BoardMinutesAccess.Via.NONE, c -> service.listByMaterial(c.me, mid));
        return recordRows(out, "LIST_MATERIAL", req);
    }

    @GetMapping("/board-minutes/{id}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "VIEW_SUMMARY"), "VIEW_SUMMARY", false, BoardMinutesAccess.Via.NONE,
                c -> service.detail(c.me, c.head, c.d));
    }

    @GetMapping("/board-minutes/{id}/transcript")
    public Map<String, Object> transcript(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "VIEW_TRANSCRIPT"), "VIEW_TRANSCRIPT", true, BoardMinutesAccess.Via.NONE,
                c -> service.transcript(c.me, c.head, c.d));
    }

    @GetMapping("/board-minutes/{id}/history")
    public Map<String, Object> history(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "HISTORY"), "HISTORY", true, BoardMinutesAccess.Via.NONE,
                c -> service.history(c.head, c.d));
    }

    @GetMapping("/board-minutes/{id}/scope")
    public List<Map<String, Object>> scope(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "SCOPE_VIEW"), "SCOPE_VIEW", false, BoardMinutesAccess.Via.NONE,
                c -> service.scope(c.head, c.d));
    }

    /** 공개범위 후보(부장급만). 사람을 더할 때 고를 목록 — 서버가 scopeAdd 와 같은 규칙으로 거른다. */
    @GetMapping("/board-minutes/{id}/scope/candidates")
    public Map<String, Object> scopeCandidates(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "SCOPE_CANDIDATES"), "SCOPE_CANDIDATES", true, BoardMinutesAccess.Via.NONE,
                c -> service.scopeCandidates(c.head, c.d));
    }

    @GetMapping("/board-minutes/{id}/acts")
    public List<Map<String, Object>> acts(@PathVariable String id, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "ACTS"), "ACTS", true, BoardMinutesAccess.Via.NONE,
                c -> service.acts(c.head, c.d));
    }

    // ── 업로드 ──

    /** 미리보기 — multipart(transcript·timeline?·summary?·options). 저장하지 않는다. */
    @PostMapping("/board-materials/{mid}/minutes/preview")
    public Map<String, Object> preview(@PathVariable String mid, HttpServletRequest req) {
        return exec(req, forMaterial(mid), materialDetail(mid, "PREVIEW"), "PREVIEW", true, BoardMinutesAccess.Via.WRITER,
                c -> service.preview(c.me, c.actor, mid, readUpload(req)));
    }

    /** 등록 — multipart. options.preview_digest 가 미리보기와 같아야 한다(다르면 409 PREVIEW_CHANGED). */
    @PostMapping("/board-materials/{mid}/minutes")
    public ResponseEntity<Map<String, Object>> upload(@PathVariable String mid, HttpServletRequest req) {
        Map<String, Object> out = exec(req, forMaterial(mid), materialDetail(mid, "UPLOAD"), "UPLOAD", true,
                BoardMinutesAccess.Via.WRITER, c -> {
                    Map<String, Object> r = service.upload(c.me, c.actor, mid, readUpload(req));
                    if (c.ctx != null && r.get("minutes_id") instanceof Number) {
                        c.ctx.setMinutesId(Long.valueOf(((Number) r.get("minutes_id")).longValue()));   // OK 한 줄에 새 번호를 싣는다
                    }
                    return r;
                });
        Object stats = out.get("stats");
        if (stats instanceof Map) {
            Map<?, ?> s = (Map<?, ?>) stats;
            req.setAttribute(AccessLogInterceptor.DETAIL, "board-minutes id=" + out.get("minutes_id") + " code=UPLOAD utter="
                    + s.get("utter_cnt") + " seg=" + s.get("seg_cnt") + " item=" + s.get("item_cnt")
                    + " edit=" + out.get("edited_cnt") + " label=" + out.get("label_cnt") + " ack=1");   // ack=1: 서버가 수칙 확인을 강제하므로 저장된 건은 늘 1   // 건수뿐 — 본문·제목·파일명·라벨·고친 글 없음
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    // ── 쓰기 ──

    @PutMapping("/board-minutes/{id}/utterances/{seq}")
    public Map<String, Object> editUtter(@PathVariable String id, @PathVariable String seq,
                                         @RequestBody BoardMinutesIn.EditIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "EDIT_UTTER"), "EDIT_UTTER", true, BoardMinutesAccess.Via.NONE,
                c -> service.editUtter(c.me, c.actor, c.head, c.d, seq, in));
    }

    /** 발화자 역할 라벨 하나(저장 후). 권한은 고치기와 같다(can_edit). */
    @PutMapping("/board-minutes/{id}/speakers/{no}")
    public Map<String, Object> editSpeaker(@PathVariable String id, @PathVariable String no,
                                           @RequestBody BoardMinutesIn.SpeakerIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "EDIT_LABEL"), "EDIT_LABEL", true, BoardMinutesAccess.Via.NONE,
                c -> service.editSpeaker(c.me, c.actor, c.head, c.d, no, in));
    }

    @PutMapping("/board-minutes/{id}/items/{no}")
    public Map<String, Object> editItem(@PathVariable String id, @PathVariable String no,
                                        @RequestBody BoardMinutesIn.EditIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "EDIT_ITEM"), "EDIT_ITEM", true, BoardMinutesAccess.Via.NONE,
                c -> service.editItem(c.me, c.actor, c.head, c.d, no, in));
    }

    @PutMapping("/board-minutes/{id}/meta")
    public Map<String, Object> editMeta(@PathVariable String id, @RequestBody BoardMinutesIn.MetaIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "EDIT_META"), "EDIT_META", true, BoardMinutesAccess.Via.NONE,
                c -> service.editMeta(c.me, c.actor, c.head, c.d, in));
    }

    @PostMapping("/board-minutes/{id}/items/{no}/done")
    public Map<String, Object> todo(@PathVariable String id, @PathVariable String no,
                                    @RequestBody BoardMinutesIn.TodoIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "TODO"), "TODO", true, BoardMinutesAccess.Via.NONE,
                c -> service.todo(c.me, c.actor, c.head, c.d, no, in));
    }

    @PostMapping("/board-minutes/{id}/scope/add")
    public Map<String, Object> scopeAdd(@PathVariable String id, @RequestBody BoardMinutesIn.ScopeIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "SCOPE_ADD"), "SCOPE_ADD", true, BoardMinutesAccess.Via.NONE,
                c -> service.scopeAdd(c.me, c.actor, c.head, c.d, in));
    }

    @PostMapping("/board-minutes/{id}/scope/remove")
    public Map<String, Object> scopeRemove(@PathVariable String id, @RequestBody BoardMinutesIn.ScopeIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "SCOPE_REMOVE"), "SCOPE_REMOVE", true, BoardMinutesAccess.Via.NONE,
                c -> service.scopeRemove(c.me, c.actor, c.head, c.d, in));
    }

    @PostMapping("/board-minutes/{id}/delete")
    public Map<String, Object> delete(@PathVariable String id, @RequestBody BoardMinutesIn.DeleteIn in, HttpServletRequest req) {
        return exec(req, forMinutes(id), detail(id, "DELETE"), "DELETE", true, BoardMinutesAccess.Via.NONE,
                c -> service.delete(c.me, c.actor, c.head, c.d, in));
    }

    // ── 목록 감사 ──

    /** 행마다 한 줄 기록(응답 전 — 실패하면 500, 데이터 안 나감) 뒤 내부 키 {@code _via} 를 뺀다. */
    private Map<String, Object> recordRows(Map<String, Object> out, String action, HttpServletRequest req) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        audit.recordRows(items, action, Actor.of(req), MinutesUiIds.of(req));
        if (items != null) {
            for (Map<String, Object> it : items) {
                it.remove("_via");
            }
        }
        return out;
    }

    // ── multipart ──

    /**
     * 파트 구성 검사 — 허용 이름(transcript·timeline·summary·options·edits)만, 파일 파트는 같은 이름 한 개씩 최대 5개(아니면 400 TOO_MANY_PARTS).
     * edits 는 512KB 까지.
     * options 는 JSON 파트(파일 Blob 또는 문자열 폼 값)이고 16KB 를 넘거나 JSON 이 깨졌으면 400 OPTIONS_INVALID — 원문은 되돌려 주지 않는다.
     * 파일은 {@link MultipartFile} 참조만 넘긴다(서비스가 업로드 자격을 확인한 뒤에 크기를 보고 바이트를 읽는다).
     */
    private MinutesUpload readUpload(HttpServletRequest req) {
        MultipartHttpServletRequest mr = WebUtils.getNativeRequest(req, MultipartHttpServletRequest.class);
        if (mr == null) {
            throw coded(400, "BAD_REQUEST", "업로드한 내용을 읽을 수 없습니다. 파일을 다시 선택해 올려 주세요.");
        }
        int total = 0;
        for (Map.Entry<String, List<MultipartFile>> e : mr.getMultiFileMap().entrySet()) {
            total += e.getValue().size();
            if (!PARTS.contains(e.getKey()) || e.getValue().size() != 1 || total > 5) {
                throw coded(400, "TOO_MANY_PARTS", "허용되지 않는 파일 칸이 있습니다.");
            }
        }
        Map<String, MultipartFile> files = mr.getFileMap();
        // 문자열만 읽는다 — Jackson 파싱은 서비스가 업로드 자격 확인(requireUploader) 뒤에 한다(권한 없는 사람이 파싱 비용을 쓰지 못하게)
        String json = jsonPart(mr, files, "options", OPTIONS_MAX_BYTES, BoardMinutesController::optionsInvalid);
        String edits = jsonPart(mr, files, "edits", EDITS_MAX_BYTES, BoardMinutesController::editsInvalid);
        return new MinutesUpload(files.get("transcript"), files.get("timeline"), files.get("summary"), json, edits);
    }

    /** JSON 파트(파일 Blob 또는 폼 문자열)의 문자열. 상한을 넘거나 읽지 못하면 err. */
    private static String jsonPart(MultipartHttpServletRequest mr, Map<String, MultipartFile> files, String name, int max,
                                   Supplier<ApiException> err) {
        MultipartFile f = files.get(name);
        try {
            if (f != null) {
                if (f.getSize() > max) {
                    throw err.get();
                }
                return new String(f.getBytes(), StandardCharsets.UTF_8);
            }
            String p = mr.getParameter(name);
            if (p != null && p.getBytes(StandardCharsets.UTF_8).length > max) {
                throw err.get();
            }
            return p;
        } catch (IOException e) {
            throw err.get();
        }
    }

    private static ApiException optionsInvalid() {
        return coded(400, "OPTIONS_INVALID", "업로드 옵션을 읽을 수 없습니다.");
    }

    private static ApiException editsInvalid() {
        return coded(400, "EDITS_INVALID", "고친 내용을 읽을 수 없습니다. 미리보기부터 다시 하세요.");
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    // ── 공통 관문 ──

    private Supplier<BoardMinutesAudit.Ctx> nullCtx() {
        return () -> null;
    }

    private Supplier<BoardMinutesAudit.Ctx> forMinutes(final String id) {
        return () -> audit.forMinutes(id);
    }

    private Supplier<BoardMinutesAudit.Ctx> forMaterial(final String mid) {
        return () -> audit.forMaterial(mid);
    }

    /** 접근 이력 detail — 번호가 올바른 숫자일 때만 싣는다(경로 값을 그대로 남기지 않는다). */
    private static String detail(String id, String action) {
        return BoardMinutesService.parseId(id) == null ? "board-minutes code=" + action
                : "board-minutes id=" + id + " code=" + action;
    }

    private static String materialDetail(String mid, String action) {
        return BoardMinutesService.parseId(mid) == null ? "board-minutes code=" + action
                : "board-minutes mid=" + mid + " code=" + action;
    }

    private <T> T exec(HttpServletRequest req, Supplier<BoardMinutesAudit.Ctx> ctxSupplier, String detail, String action,
                       boolean uiRequired, BoardMinutesAccess.Via okVia, Function<Call, T> call) {
        if (!settings.isEnabled()) {
            throw new ApiException(404, "찾을 수 없습니다.");   // 꺼져 있으면 존재를 숨긴다(기록 없음)
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, detail);
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = MinutesUiIds.of(req);
        BoardMinutesAudit.Ctx ctx = ctxSupplier.get();
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() != 401) {   // 사번이 확인된 비활성·미등록(403)만 ACT. 사번 없는 401 은 ACCESS_LOG 에만(기록량 상한 없음 방지)
                audit.record(ctx, action, BoardMinutesAudit.outcomeOf(e.getStatus()), BoardMinutesAccess.Via.NONE, actor, ui);
            }
            throw e;
        }
        if (settings.isRequireVerified() && !actor.isVerified()) {
            audit.record(ctx, action, "DENIED", BoardMinutesAccess.Via.NONE, actor, ui);
            throw guard.denied(req, coded(403, "VERIFIED_REQUIRED", "이 기능은 사내 인증을 거친 접속에서만 쓸 수 있습니다."));
        }
        BoardMinutes head = ctx == null ? null : ctx.getHead();
        BoardMinutesAccess.Decision d = access.decide(me, head);
        BoardMinutesAccess.Via via = d.via;
        try {
            if (uiRequired && !ui.isValid()) {
                throw coded(400, "UI_ID_REQUIRED", "화면 정보가 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.");   // 헤더 이름·입력값 비노출
            }
            T out;
            try {
                out = call.apply(new Call(me, head, d, ctx, actor));
            } catch (MinutesException e) {
                throw ApiException.withDetail(e.getStatus(), e.toDetail());   // 코드·칸·줄 번호·종류별 건수만
            } catch (ApiException e) {
                if (e instanceof BoardMinutesService.RecheckException) {
                    via = ((BoardMinutesService.RecheckException) e).getVia();   // 쓰기 트랜잭션 안 재판정 — 새 판정의 경로를 ACT 에 남긴다
                }
                if (e.getStatus() == 403) {
                    throw guard.denied(req, e);   // 쓰기·열람 거부를 ACCESS_LOG DENIED 로 남긴다(고정 문구만)
                }
                throw e;
            }
            audit.record(ctx, action, "OK", via == BoardMinutesAccess.Via.NONE ? okVia : via, actor, ui);   // 읽기는 응답 전 — 실패하면 500, 데이터 안 나감
            return out;
        } catch (ApiException e) {
            audit.record(ctx, action, BoardMinutesAudit.outcomeOf(e.getStatus()), via, actor, ui);
            throw e;
        } catch (RuntimeException e) {
            audit.record(ctx, action, "ERROR", via, actor, ui);
            throw e;
        }
    }
}
