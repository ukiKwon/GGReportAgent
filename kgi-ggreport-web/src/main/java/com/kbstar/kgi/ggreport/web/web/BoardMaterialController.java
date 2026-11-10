package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardMaterialIn;
import com.kbstar.kgi.ggreport.web.service.BoardMaterialAudit;
import com.kbstar.kgi.ggreport.web.service.BoardMaterialService;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 이사회 자료 저장·제출·확정(020). 경로는 {@code /board-materials}(기존 {@code /board-docs/{id}} 는 docx 구조 API).
 * 호출자 확인은 {@link MenuGuard#requireActiveUser}(401/403 DENIED, 메뉴 무관). 권한 판정(담당자·결재 경로)은 서비스가 한다.
 *
 * <p>모든 쓰기(POST)는 헤더 {@code X-Screen-Id}·{@code X-Button-Id} 가 허용 목록 안이어야 한다(아니면 400 UI_ID_REQUIRED, 원문 비노출).
 * 읽기(GET)는 값이 없어도 되지만 확정 자료이면 {@code UNKNOWN}·ui_valid=false 로 남는다. 확정 자료에 대한 모든 호출(거부·은닉 포함)은
 * {@link BoardMaterialAudit} 가 따로 기록한다. 접근 이력(ACCESS_LOG) detail 에는 자료 번호·코드·버전 번호뿐 — 값·메모·사유·사번·이름 없음.
 * ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 모두 자기신고다 — 사칭·위조 방지가 아니다.
 */
@RestController
@RequestMapping("/board-materials")
public class BoardMaterialController {

    private final MenuGuard guard;
    private final BoardMaterialService service;
    private final BoardMaterialAudit audit;

    public BoardMaterialController(MenuGuard guard, BoardMaterialService service, BoardMaterialAudit audit) {
        this.guard = guard;
        this.service = service;
        this.audit = audit;
    }

    // ── 조회 ──

    @GetMapping
    public Map<String, Object> list(@RequestParam(name = "q", required = false) String q,
                                    @RequestParam(name = "status", required = false) String status,
                                    @RequestParam(name = "year", required = false) String year,
                                    @RequestParam(name = "assignee", required = false) String assignee,
                                    @RequestParam(name = "meeting_from", required = false) String meetingFrom,
                                    @RequestParam(name = "meeting_to", required = false) String meetingTo,
                                    HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        return service.list(me, q, status, year, assignee, meetingFrom, meetingTo);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest req) {
        return run(req, id, "VIEW", false, me -> service.detail(me, id));
    }

    @GetMapping("/{id}/snapshots")
    public Map<String, Object> snapshots(@PathVariable String id, HttpServletRequest req) {
        return run(req, id, "SNAPSHOT_LIST", false, me -> service.snapshots(me, id));
    }

    @GetMapping("/{id}/snapshots/{snapNo}")
    public Map<String, Object> snapshot(@PathVariable String id, @PathVariable String snapNo, HttpServletRequest req) {
        return run(req, id, "SNAPSHOT_VIEW", false, me -> service.snapshot(me, id, snapNo));
    }

    @GetMapping("/{id}/history")
    public List<Map<String, Object>> history(@PathVariable String id, HttpServletRequest req) {
        return run(req, id, "HISTORY", false, me -> service.history(me, id));
    }

    @GetMapping("/{id}/acts")
    public List<Map<String, Object>> acts(@PathVariable String id, HttpServletRequest req) {
        return run(req, id, "ACTS", false, me -> service.acts(me, id));
    }

    // ── 쓰기 ──

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody BoardMaterialIn.Create in, HttpServletRequest req) {
        Map<String, Object> out = run(req, null, "CREATE", true, me -> service.create(me, Actor.of(req), in));
        req.setAttribute(AccessLogInterceptor.DETAIL, "board-material id=" + out.get("material_id")
                + " case=" + out.get("bid_case_id") + " code=CREATE");
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @PostMapping("/{id}/snapshots")
    public ResponseEntity<Map<String, Object>> save(@PathVariable String id, @RequestBody BoardMaterialIn.Save in,
                                                    HttpServletRequest req) {
        Map<String, Object> out = run(req, id, "SAVE", true, me -> service.saveSnapshot(me, Actor.of(req), id, in));
        boolean changed = Boolean.TRUE.equals(out.get("changed"));
        req.setAttribute(AccessLogInterceptor.DETAIL, "board-material id=" + id + " code=" + (changed ? "SNAP" : "SNAP_SAME")
                + " snap=" + out.get("snap_no"));
        return ResponseEntity.status(changed ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    // ── 공통: 호출자 확인 + 화면·버튼 식별자 검증 + 확정 건 감사 기록 + 403 DENIED 기록 ──

    private <T> T run(HttpServletRequest req, String id, String action, boolean write, Function<SysUser, T> call) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = BoardUiIds.of(req);
        BoardMaterialAudit.Ctx ctx = id == null ? null : audit.before(id);   // 확정 자료가 아니면 null — 이하 기록 생략
        try {
            SysUser me = guard.requireActiveUser(req);
            if (write && !ui.isValid()) {
                throw uiRequired();
            }
            T out;
            try {
                out = call.apply(me);
            } catch (ApiException e) {
                if (e.getStatus() == 403) {
                    throw guard.denied(req, e);   // 쓰기 거부를 ACCESS_LOG DENIED 로 남긴다(고정 문구만)
                }
                throw e;
            }
            audit.record(ctx, action, "OK", actor, ui);   // 읽기는 응답 전에 — 실패하면 500, 데이터 안 나감
            return out;
        } catch (ApiException e) {
            audit.record(ctx, action, outcomeOf(e.getStatus()), actor, ui);
            throw e;
        }
    }

    private static String outcomeOf(int status) {
        if (status == 403 || status == 401) {
            return "DENIED";
        }
        if (status == 404) {
            return "HIDDEN";
        }
        if (status == 409) {
            return "BLOCKED";
        }
        return status == 400 || status == 413 || status == 422 ? "INVALID" : "ERROR";
    }

    private static ApiException uiRequired() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "UI_ID_REQUIRED");
        d.put("message", "화면·버튼 식별자(X-Screen-Id, X-Button-Id)가 없거나 올바르지 않습니다.");   // 입력값 비노출
        return ApiException.withDetail(400, d);
    }
}
