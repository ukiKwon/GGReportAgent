package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.dto.NoticeRoundIn;
import com.kbstar.kgi.ggreport.web.service.NoticeRoundService;
import com.kbstar.kgi.ggreport.web.support.NoticeUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 공고 상태 기록(037). 조회는 map 조회 권한(전 팀), 저장은 기관 레코드 수정 권한(map·regions edit)과
 * 영업팀·영업팀장·영업부장 역할을 <b>둘 다</b> 통과해야 한다({@link NoticeRoundService#canJudge} — current() 의 can_edit 와 같은 함수).
 * 401/403 은 DENIED 로 접근 이력에 남긴다(본문·쿼리값 없음). 접근 이력 DETAIL 에는 건수·REV·사유 코드만 싣는다(의견 본문 금지).
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 앞단 인증 전에는 권한 검사도 보안 경계가 아니다.
 */
@RestController
public class NoticeRoundController {

    static final String VIEW_MENU = "map";   // 입찰 공고 현황 화면의 서버 메뉴 키(nav.js:66). 메뉴 키 8개 동결
    private static final Pattern CODE = Pattern.compile("[A-Z_]{1,40}");

    private final NoticeRoundService rounds;
    private final MenuGuard guard;

    public NoticeRoundController(NoticeRoundService rounds, MenuGuard guard) {
        this.rounds = rounds;
        this.guard = guard;
    }

    @GetMapping("/notice-rounds/current")
    public Map<String, Object> current(HttpServletRequest req) {
        Actor actor = guard.require(req, VIEW_MENU);
        Map<String, Object> out = rounds.current(actor.getEmpNo());
        req.setAttribute(AccessLogInterceptor.DETAIL, "notice-round current n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @GetMapping("/institutions/{institutionId}/notice-rounds")
    public Map<String, Object> history(@PathVariable String institutionId, HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        return rounds.history(institutionId);
    }

    @PostMapping("/institutions/{institutionId}/notice-rounds/judgments")
    public ResponseEntity<Map<String, Object>> save(@PathVariable String institutionId,
                                                    @RequestBody(required = false) NoticeRoundIn body,
                                                    HttpServletRequest req) {
        Actor actor = guard.requireInstitutionEdit(req);
        if (!rounds.canJudge(actor.getEmpNo())) {   // 서비스 트랜잭션(기관 행 잠금) 전에 거른다
            throw guard.denied(req, new ApiException(403, "이 기능을 쓸 권한이 없습니다."));
        }
        Map<String, Object> out;
        try {
            out = rounds.save(institutionId, body, actor, NoticeUiIds.of(req));
        } catch (ApiException e) {
            req.setAttribute(AccessLogInterceptor.DETAIL, failDetail(e));   // 409 의 사유 코드가 이력에 남게(security 하-3). 코드만 — 의견·날짜 없음
            throw e;
        }
        boolean saved = Boolean.TRUE.equals(out.get("saved"));
        req.setAttribute(AccessLogInterceptor.DETAIL, saved ? "notice-round save rev=" + out.get("rev_no") : "notice-round save no-change");
        return ResponseEntity.status(saved ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    /** "notice-round save <상태> <code>" — code 는 대문자·밑줄만(예: STALE, ACTIVE_PREP_CONFIRM_REQUIRED). 없으면 상태만. */
    private static String failDetail(ApiException e) {
        String code = null;
        Object d = e.getDetailObject();
        if (d instanceof Map) {
            Object c = ((Map<?, ?>) d).get("code");
            if (c instanceof String && CODE.matcher((String) c).matches()) {
                code = (String) c;
            }
        }
        return "notice-round save " + e.getStatus() + (code == null ? "" : " " + code);
    }
}
