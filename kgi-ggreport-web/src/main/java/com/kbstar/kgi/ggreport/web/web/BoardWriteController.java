package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocDocx;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.dto.BoardWriteIn;
import com.kbstar.kgi.ggreport.web.service.BoardAccess;
import com.kbstar.kgi.ggreport.web.service.BoardWriteService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;

/**
 * 이사회 자료 작성. 지도 조회는 tasks 조회, 업로드·초안은 <b>그 입찰 건의 현재 담당자만</b>(020 — 메뉴 CAN_WRITE·관리자 예외 없음, bid_case_id 필수).
 * ⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다(Actor) — 앞단 인증 전에는 보안 경계가 아니다.
 * 접근 이력 detail 에는 결과 code·개인정보 종류 수·파일 크기만 남긴다(파일명·값 없음).
 */
@RestController
@RequestMapping("/board-forms")
public class BoardWriteController {

    static final String MENU_KEY = BoardDocController.MENU_KEY;
    static final String WRITE_DENIED = "이사회 자료를 작성할 권한이 없습니다.";
    private static final MediaType DOCX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    private final MenuGuard guard;
    private final BoardWriteService service;
    private final BoardAccess access;

    public BoardWriteController(MenuGuard guard, BoardWriteService service, BoardAccess access) {
        this.guard = guard;
        this.service = service;
        this.access = access;
    }

    /**
     * 020: 작성(엑셀 업로드·초안 docx)은 그 입찰 건의 현재 담당자만 — 메뉴의 CAN_WRITE 로는 더 이상 열리지 않는다(관리자 예외 없음).
     * bid_case_id 가 없으면 400(BID_CASE_REQUIRED), 담당이 아니면 403(DENIED 기록). 입찰 건 존재 여부는 알리지 않는다.
     */
    private void requireCaseWriter(HttpServletRequest req, Actor a, String bidCaseId) {
        String bid = bidCaseId == null ? "" : bidCaseId.trim();
        if (bid.isEmpty() || bid.length() > 64) {
            throw fail(400, "BID_CASE_REQUIRED", "입찰 건(bid_case_id)을 지정하세요.");
        }
        if (!access.canWriteCase(a.getEmpNo(), bid)) {
            throw guard.denied(req, new ApiException(403, WRITE_DENIED));
        }
    }

    private static ApiException fail(int status, String code, String message) {
        java.util.Map<String, Object> d = new java.util.LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    @GetMapping("/excel-map")
    public Map<String, Object> excelMap(HttpServletRequest req) {
        guard.require(req, MENU_KEY);
        return service.excelMap();
    }

    @PostMapping("/{id}/excel")
    public Map<String, Object> upload(@PathVariable("id") String id,
                                      @RequestParam(name = "file", required = false) MultipartFile file,
                                      @RequestParam(name = "version", required = false) String version,
                                      @RequestParam(name = "bid_case_id", required = false) String bidCaseId,
                                      HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        requireCaseWriter(req, a, bidCaseId);
        long size = file == null ? 0 : file.getSize();
        try {
            Map<String, Object> out = service.upload(a.getEmpNo(), id, version, file);
            audit(req, "OK", size, kinds(out.get("warnings")));
            return out;
        } catch (ApiException e) {
            audit(req, codeOf(e), size, kinds(e.getDetailObject()));
            throw e;
        } catch (RuntimeException | Error e) {
            audit(req, "500", size, 0);        // 예상 못 한 실패도 접근 이력에 남긴다(본문·값 없음)
            throw e;
        }
    }

    @PostMapping("/{id}/draft-docx")
    public ResponseEntity<byte[]> draft(@PathVariable("id") String id, @RequestBody BoardWriteIn in,
                                        HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        requireCaseWriter(req, a, in == null ? null : in.getBidCaseId());
        BoardDocSpec.Doc doc;
        try {
            doc = service.draft(a.getEmpNo(), id, in);
        } catch (ApiException e) {
            audit(req, codeOf(e), -1, kinds(e.getDetailObject()));
            throw e;
        } catch (RuntimeException | Error e) {
            audit(req, "500", -1, 0);
            throw e;
        }
        audit(req, "OK", -1, 0);
        String name = doc.getName().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_") + "_초안.docx";
        String encoded;
        try {
            encoded = URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            throw new IllegalStateException(never);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"board_draft.docx\"; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(DOCX)
                .body(BoardDocDocx.build(doc));
    }

    private static void audit(HttpServletRequest req, String code, long size, int kinds) {
        req.setAttribute(AccessLogInterceptor.DETAIL,
                "board-write code=" + code + " pii_kinds=" + kinds + (size >= 0 ? " size=" + size : ""));
    }

    private static String codeOf(ApiException e) {
        Object d = e.getDetailObject();
        return d instanceof Map && ((Map<?, ?>) d).get("code") instanceof String
                ? (String) ((Map<?, ?>) d).get("code") : String.valueOf(e.getStatus());
    }

    /** detail 객체 또는 warnings 목록 안의 kinds 개수 합. */
    private static int kinds(Object o) {
        int n = 0;
        if (o instanceof Map && ((Map<?, ?>) o).get("kinds") instanceof List) {
            n += ((List<?>) ((Map<?, ?>) o).get("kinds")).size();
        } else if (o instanceof List) {
            for (Object w : (List<?>) o) {
                n += kinds(w);
            }
        }
        return n;
    }
}
