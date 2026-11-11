package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.HeadIn;
import com.kbstar.kgi.ggreport.web.service.HeadAudit;
import com.kbstar.kgi.ggreport.web.service.HeadPhotoService;
import com.kbstar.kgi.ggreport.web.service.HeadRules;
import com.kbstar.kgi.ggreport.web.service.InstitutionHeadService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.HeadUiIds;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기관장 정보(NEXT 72·77, 026) — 기관 단위 경로({@code /institutions/{id}/head...})와 목록·대기열·매칭 대기({@code /institution-heads/...}).
 *
 * <p>모든 경로의 공통 순서: ① 스위치(끄면 404 FEATURE_OFF — DB 를 건드리지 않는다) → ② 사번 없음 401 → ③ 미등록·비활성 403 →
 * ④ 영업팀·영업팀장·영업부장이 아니면 403(접근 이력·감사 표 모두 DENIED) → ⑤ 서비스. 서비스가 던진 403 도 DENIED 로 남긴다(사유는 고정 코드뿐).
 * 건 단위 행위는 {@code INST_HEAD_ACT} 에 결과(OK·DENIED·HIDDEN·BLOCKED·INVALID·BUSY·ERROR)와 함께 남기고, 성공한 읽기는 <b>응답 전에</b> 기록한다
 * (기록이 실패하면 500, 데이터 안 나감). 목록(A1)의 성공은 가린 값이라 접근 이력에만 남긴다. 접근 이력에는 경로·상태·행위 코드만(이름·값·쿼리 없음).
 * 경로 번호가 숫자 형식이 아니면 404(감사 표 TARGET_ID 는 비운다).
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 */
@RestController
public class InstitutionHeadController {

    private final InstHeadSettings settings;
    private final MenuGuard guard;
    private final HeadAudit audit;
    private final InstitutionHeadService heads;
    private final HeadPhotoService photos;

    public InstitutionHeadController(InstHeadSettings settings, MenuGuard guard, HeadAudit audit,
                                     InstitutionHeadService heads, HeadPhotoService photos) {
        this.settings = settings;
        this.guard = guard;
        this.audit = audit;
        this.heads = heads;
        this.photos = photos;
    }

    private interface Call<T> {
        T apply(SysUser me, Actor actor);
    }

    // ── 목록·대기열(A1·A2) ───────────────────────────────────────────────

    /** A1 — 현 기관장 목록(가림). */
    @GetMapping("/institution-heads")
    public List<Map<String, Object>> list(HttpServletRequest req) {
        return run(req, null, null, null, "LIST", false, new Call<List<Map<String, Object>>>() {
            @Override
            public List<Map<String, Object>> apply(SysUser me, Actor actor) {
                return heads.list();
            }
        });
    }

    /** A2 — 기관별 열린 후보 수(값 없음) + 매칭 대기 건수. */
    @GetMapping("/institution-heads/candidates")
    public Map<String, Object> queue(HttpServletRequest req) {
        return run(req, null, null, null, "QUEUE_VIEW", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.queue();
            }
        });
    }

    // ── 상세(A3) ─────────────────────────────────────────────────────────

    /** A3 — 상세(원문 이름·칸·출처·후보). no-store. 응답 전에 감사 기록. */
    @GetMapping("/institutions/{institutionId}/head")
    public ResponseEntity<Map<String, Object>> detail(@PathVariable final String institutionId, HttpServletRequest req) {
        Map<String, Object> out = run(req, institutionId, null, null, "VIEW", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.detail(me, actor, institutionId);
            }
        });
        return noStore(out, HttpStatus.OK);
    }

    // ── 등록(A4)·칸 입력(A5) ─────────────────────────────────────────────

    /** A4 — 기관장 등록. 현 기관장이 없으면 201 CURRENT, 있으면 202 후보(conflict:true). */
    @PostMapping("/institutions/{institutionId}/heads")
    public ResponseEntity<Map<String, Object>> addHead(@PathVariable final String institutionId, @RequestBody final HeadIn.Head body,
                                                       HttpServletRequest req) {
        Map<String, Object> out = run(req, institutionId, null, null, "HEAD_ADD", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.addHead(me, actor, institutionId, body);
            }
        });
        return ResponseEntity.status("CURRENT".equals(out.get("state")) ? HttpStatus.CREATED : HttpStatus.ACCEPTED).body(out);
    }

    /** A5 — 칸 입력. 201 CONFIRMED / 202 CANDIDATE. */
    @PostMapping("/institutions/{institutionId}/head/items")
    public ResponseEntity<Map<String, Object>> addItem(@PathVariable final String institutionId, @RequestBody final HeadIn.Item body,
                                                       HttpServletRequest req) {
        Map<String, Object> out = run(req, institutionId, null, null, "ITEM_ADD", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.addItem(me, actor, institutionId, body);
            }
        });
        return ResponseEntity.status("CONFIRMED".equals(out.get("state")) ? HttpStatus.CREATED : HttpStatus.ACCEPTED).body(out);
    }

    // ── 칸 확정·기각·무효(A6·A7·A10) ─────────────────────────────────────

    @PostMapping("/institutions/{institutionId}/head/items/{itemId}/confirm")
    public Map<String, Object> confirmItem(@PathVariable final String institutionId, @PathVariable final String itemId,
                                           HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(itemId);
        return run(req, institutionId, null, id, "ITEM_CONFIRM", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.confirmItem(me, actor, institutionId, requireId(id));
            }
        });
    }

    @PostMapping("/institutions/{institutionId}/head/items/{itemId}/reject")
    public Map<String, Object> rejectItem(@PathVariable final String institutionId, @PathVariable final String itemId,
                                          @RequestBody final HeadIn.Reason body, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(itemId);
        return run(req, institutionId, null, id, "ITEM_REJECT", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.rejectItem(me, actor, institutionId, requireId(id), body);
            }
        });
    }

    @PostMapping("/institutions/{institutionId}/head/items/{itemId}/void")
    public Map<String, Object> voidItem(@PathVariable final String institutionId, @PathVariable final String itemId,
                                        @RequestBody final HeadIn.Reason body, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(itemId);
        return run(req, institutionId, null, id, "ITEM_VOID", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.voidItem(me, actor, institutionId, requireId(id), body);
            }
        });
    }

    // ── 후보 머리 확정·기각(A8·A9) ───────────────────────────────────────

    @PostMapping("/institutions/{institutionId}/heads/{headId}/confirm")
    public Map<String, Object> confirmHead(@PathVariable final String institutionId, @PathVariable final String headId,
                                           HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(headId);
        return run(req, institutionId, id, null, "HEAD_CONFIRM", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.confirmHead(me, actor, institutionId, requireId(id));
            }
        });
    }

    @PostMapping("/institutions/{institutionId}/heads/{headId}/reject")
    public Map<String, Object> rejectHead(@PathVariable final String institutionId, @PathVariable final String headId,
                                          @RequestBody final HeadIn.Reason body, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(headId);
        return run(req, institutionId, id, null, "HEAD_REJECT", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.rejectHead(me, actor, institutionId, requireId(id), body);
            }
        });
    }

    // ── 사진(A11~A14, P1) ────────────────────────────────────────────────

    /** A11 — multipart {@code file, head_id, license_cd, src_kind, src_title, src_url?, checked_on}. 본문 상한은 BoardWriteLimitFilter. */
    @PostMapping("/institutions/{institutionId}/head/photos")
    public ResponseEntity<Map<String, Object>> uploadPhoto(@PathVariable final String institutionId,
                                                           @RequestParam(name = "file", required = false) final MultipartFile file,
                                                           @RequestParam(name = "head_id", required = false) final String headId,
                                                           @RequestParam(name = "license_cd", required = false) final String license,
                                                           @RequestParam(name = "src_kind", required = false) final String kind,
                                                           @RequestParam(name = "src_title", required = false) final String title,
                                                           @RequestParam(name = "src_url", required = false) final String url,
                                                           @RequestParam(name = "checked_on", required = false) final String checkedOn,
                                                           HttpServletRequest req) {
        final Long hid = InstitutionHeadService.parseId(headId);
        Map<String, Object> out = run(req, institutionId, hid, null, "PHOTO_UPLOAD", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return photos.upload(me, actor, institutionId, hid, file, license, kind, title, url, checkedOn);
            }
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    /**
     * A12 — 사진 본문(JPEG). 응답 전에 감사 기록(PHOTO_VIEW). 헤더: inline·Content-Length·no-store·nosniff·
     * {@code Content-Security-Policy: default-src 'none'; sandbox}·{@code Cross-Origin-Resource-Policy: same-origin}.
     */
    @GetMapping("/institutions/{institutionId}/head/photos/{photoId}/content")
    public ResponseEntity<byte[]> photoContent(@PathVariable final String institutionId, @PathVariable final String photoId,
                                               HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(photoId);
        byte[] bytes = run(req, institutionId, null, id, "PHOTO_VIEW", true, new Call<byte[]>() {
            @Override
            public byte[] apply(SysUser me, Actor actor) {
                return photos.content(me, institutionId, requireId(id));
            }
        });
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.IMAGE_JPEG);
        h.setContentLength(bytes.length);
        h.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"photo.jpg\"");
        h.set(HttpHeaders.CACHE_CONTROL, "no-store");
        h.set(HttpHeaders.PRAGMA, "no-cache");
        h.set("X-Content-Type-Options", "nosniff");
        h.set("Content-Security-Policy", "default-src 'none'; sandbox");
        h.set("Cross-Origin-Resource-Policy", "same-origin");
        return new ResponseEntity<>(bytes, h, HttpStatus.OK);
    }

    @PostMapping("/institutions/{institutionId}/head/photos/{photoId}/void")
    public Map<String, Object> voidPhoto(@PathVariable final String institutionId, @PathVariable final String photoId,
                                         @RequestBody final HeadIn.Reason body, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(photoId);
        return run(req, institutionId, null, id, "PHOTO_VOID", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return photos.voidPhoto(me, actor, institutionId, requireId(id), body);
            }
        });
    }

    @PostMapping("/institutions/{institutionId}/head/photos/{photoId}/restore")
    public Map<String, Object> restorePhoto(@PathVariable final String institutionId, @PathVariable final String photoId,
                                            HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(photoId);
        return run(req, institutionId, null, id, "PHOTO_RESTORE", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return photos.restore(me, actor, institutionId, requireId(id));
            }
        });
    }

    /** P1 — 최근 사진 올림·교체·무효·복원 목록(팀장·부장만, 이름은 가림). days 1~90. */
    @GetMapping("/institution-heads/photo-changes")
    public Map<String, Object> photoChanges(@RequestParam(name = "days", required = false) final String days, HttpServletRequest req) {
        return run(req, null, null, null, "PHOTO_CHANGES_VIEW", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                Integer d = null;
                if (days != null && !days.isEmpty()) {
                    if (!days.matches("[0-9]{1,3}")) {
                        throw coded(400, "BAD_VALUE", "기간은 1~90일로 지정하세요.");
                    }
                    d = Integer.valueOf(days);
                }
                return photos.changes(me, d);
            }
        });
    }

    // ── 매칭 대기 후보(U1~U4) ────────────────────────────────────────────

    /** U1 — 매칭 대기 목록(가림). */
    @GetMapping("/institution-heads/unmatched")
    public Map<String, Object> unmatched(HttpServletRequest req) {
        return run(req, null, null, null, "UNMATCHED_LIST", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.unmatched();
            }
        });
    }

    /** U2 — 매칭 대기 상세(원문 이름·칸·출처). no-store. 응답 전에 감사 기록. */
    @GetMapping("/institution-heads/unmatched/{headId}")
    public ResponseEntity<Map<String, Object>> unmatchedDetail(@PathVariable final String headId, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(headId);
        Map<String, Object> out = run(req, null, id, null, "UNMATCHED_VIEW", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.unmatchedDetail(actor, requireId(id));
            }
        });
        return noStore(out, HttpStatus.OK);
    }

    /** U3 — 기관 지정. 감사 행위 코드는 HEAD_MATCH. */
    @PostMapping("/institution-heads/unmatched/{headId}/assign")
    public Map<String, Object> assign(@PathVariable final String headId, @RequestBody final HeadIn.Assign body, HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(headId);
        return run(req, null, id, null, "HEAD_MATCH", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.assign(me, actor, requireId(id), body);
            }
        });
    }

    /** U4 — 매칭 대기 후보 기각. */
    @PostMapping("/institution-heads/unmatched/{headId}/reject")
    public Map<String, Object> rejectUnmatched(@PathVariable final String headId, @RequestBody final HeadIn.Reason body,
                                               HttpServletRequest req) {
        final Long id = InstitutionHeadService.parseId(headId);
        return run(req, null, id, null, "UNMATCHED_REJECT", true, new Call<Map<String, Object>>() {
            @Override
            public Map<String, Object> apply(SysUser me, Actor actor) {
                return heads.rejectUnmatched(me, actor, requireId(id), body);
            }
        });
    }

    // ── 내부 ────────────────────────────────────────────────────────────

    private static Long requireId(Long id) {
        if (id == null) {
            throw ApiException.notFound("not found");   // 번호 형식 밖 — 있다는 사실을 알리지 않는다
        }
        return id;
    }

    private static ResponseEntity<Map<String, Object>> noStore(Map<String, Object> body, HttpStatus status) {
        HttpHeaders h = new HttpHeaders();
        h.set(HttpHeaders.CACHE_CONTROL, "no-store");
        h.set(HttpHeaders.PRAGMA, "no-cache");
        return new ResponseEntity<>(body, h, status);
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    private static String codeOf(ApiException e) {
        Object d = e.getDetailObject();
        if (d instanceof Map) {
            Object c = ((Map<?, ?>) d).get("code");
            if (c != null) {
                return String.valueOf(c);
            }
        }
        return "FORBIDDEN";
    }

    /**
     * 공통 틀 — 스위치 → 활성 사용자(401/403) → 영업 역할(403) → 실행 → 감사 기록(성공·실패 모두). 서비스의 403 은 DENIED 로 접근 이력에도 남긴다.
     * 기관 id 가 형식 밖이면 404. 감사 표의 기관·대상 번호는 형식이 맞는 값만 싣는다.
     */
    private <T> T run(HttpServletRequest req, String instRaw, Long headId, Long targetId, String action, boolean actOk,
                      Call<T> fn) {
        settings.requireEnabled();   // 끄면 404 FEATURE_OFF — DB 를 건드리지 않는다(감사 표 포함)
        BoardUiIds.Ui ui = HeadUiIds.of(req);
        Actor actor = Actor.of(req);
        String inst = instRaw != null && InstitutionHeadService.validInstId(instRaw) ? instRaw : null;
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403 && actor.isKnown()) {   // 사번 없는 401 은 감사 표를 늘리지 않는다
                audit.record(inst, headId, action, "DENIED", targetId, actor, ui);
            }
            throw e;
        }
        if (!HeadRules.isSales(me.getRole())) {
            audit.record(inst, headId, action, "DENIED", targetId, actor, ui);
            throw guard.denied(req, new ApiException(403, "이 기능을 쓸 권한이 없습니다."));
        }
        if (instRaw != null && inst == null) {
            audit.record(null, headId, action, "HIDDEN", targetId, actor, ui);
            throw ApiException.notFound("not found");
        }
        T out;
        try {
            out = fn.apply(me, actor);
        } catch (ApiException e) {
            try {   // 감사 기록 실패가 원래 오류(사용자가 받을 응답)를 덮지 않게 한다(security 하-4)
                audit.record(inst, headId, action, HeadAudit.outcomeOf(e.getStatus()), targetId, actor, ui);
            } catch (RuntimeException ignored) {
                // 기록 실패는 삼킨다
            }
            if (e.getStatus() == 403) {
                guard.denied(req, new ApiException(403, "head " + codeOf(e)));   // 접근 이력에는 고정 코드만
            }
            throw e;
        } catch (RuntimeException e) {   // ApiException 밖의 실패(DB 등) — 감사 표에 ERROR 만 남기고 그대로 던진다(전역 처리기가 500 으로 답한다)
            try {
                audit.record(inst, headId, action, "ERROR", targetId, actor, ui);
            } catch (RuntimeException ignored) {
                // 감사 기록 실패가 원래 오류를 가리지 않게 한다
            }
            throw e;
        }
        if (actOk) {
            Long head = headId;
            Long target = targetId;
            if (out instanceof Map) {
                Map<?, ?> m = (Map<?, ?>) out;
                if (head == null && m.get("head_id") instanceof Number) {
                    head = ((Number) m.get("head_id")).longValue();
                }
                if (target == null) {
                    Object t = m.get("item_id") != null ? m.get("item_id") : m.get("photo_id");
                    if (t instanceof Number) {
                        target = ((Number) t).longValue();
                    }
                }
            }
            audit.record(inst, head, action, "OK", target, actor, ui);
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-head inst=" + (inst == null ? "-" : inst) + " code=" + action);
        return out;
    }
}
