package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocDocx;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.dto.BoardFormIn;
import com.kbstar.kgi.ggreport.web.service.BoardFormService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.Map;

/**
 * 이사회 자료 양식 커스텀 API. 조회는 tasks 메뉴 조회 권한, 쓰기는 tasks 메뉴 수정(CAN_EDIT) 권한 또는 관리자.
 * 기존 /board-docs(무상태 기본 양식)는 그대로 둔다.
 */
@RestController
@RequestMapping("/board-forms")
public class BoardFormController {

    static final String MENU_KEY = BoardDocController.MENU_KEY;
    static final String EDIT_DENIED = "양식을 편집할 권한이 없습니다.";

    private static final MediaType DOCX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    private final MenuGuard guard;
    private final BoardFormService service;

    public BoardFormController(MenuGuard guard, BoardFormService service) {
        this.guard = guard;
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(name = "status", defaultValue = "active") String status,
                                    HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        return service.list(a.getEmpNo(), status);
    }

    @GetMapping("/catalog")
    public Map<String, Object> catalog(HttpServletRequest req) {
        guard.require(req, MENU_KEY);
        return service.catalog();
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable("id") String id,
                                      @RequestParam(name = "version", required = false) String version,
                                      @RequestParam(name = "values", defaultValue = "sample") String values,
                                      HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        return service.detail(a.getEmpNo(), id, version, isSample(values));
    }

    @GetMapping("/{id}/versions")
    public Map<String, Object> versions(@PathVariable("id") String id, HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        return service.versions(a.getEmpNo(), id);
    }

    @GetMapping("/{id}/docx")
    public ResponseEntity<byte[]> docx(@PathVariable("id") String id,
                                       @RequestParam(name = "version", required = false) String version,
                                       @RequestParam(name = "values", defaultValue = "sample") String values,
                                       HttpServletRequest req) {
        Actor a = guard.require(req, MENU_KEY);
        boolean sample = isSample(values);
        BoardDocSpec.Doc doc = service.docOf(a.getEmpNo(), id, version, sample);
        String base = doc.getName().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        String name = base + (sample ? "" : "_빈양식") + ".docx";
        String encoded;
        try {
            encoded = URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException never) {
            throw new IllegalStateException(never);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"board_form.docx\"; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(DOCX)
                .body(BoardDocDocx.build(doc));
    }

    @PostMapping("/copy")
    public Map<String, Object> copy(@RequestBody BoardFormIn.Copy in, HttpServletRequest req) {
        Actor a = guard.requireEdit(req, MENU_KEY, EDIT_DENIED);
        return service.copy(a.getEmpNo(), in);
    }

    @PutMapping("/{id}")
    public Map<String, Object> save(@PathVariable("id") String id, @RequestBody BoardFormIn.Save in,
                                    HttpServletRequest req) {
        Actor a = guard.requireEdit(req, MENU_KEY, EDIT_DENIED);
        return service.save(a.getEmpNo(), id, in);
    }

    @PostMapping("/{id}/archive")
    public Map<String, Object> archive(@PathVariable("id") String id, HttpServletRequest req) {
        Actor a = guard.requireEdit(req, MENU_KEY, EDIT_DENIED);
        return service.setArchived(a.getEmpNo(), id, true);
    }

    @PostMapping("/{id}/restore")
    public Map<String, Object> restore(@PathVariable("id") String id, HttpServletRequest req) {
        Actor a = guard.requireEdit(req, MENU_KEY, EDIT_DENIED);
        return service.setArchived(a.getEmpNo(), id, false);
    }

    private static boolean isSample(String values) {
        if ("sample".equals(values)) {
            return true;
        }
        if ("blank".equals(values)) {
            return false;
        }
        throw ApiException.badRequest("values 는 sample 또는 blank 만 쓸 수 있습니다.");
    }
}
