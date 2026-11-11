package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.InboxImportResponse;
import com.kbstar.kgi.ggreport.web.dto.InboxValidateResponse;
import com.kbstar.kgi.ggreport.web.service.InboxService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 망 밖 수집기가 떨군 배치의 검사·반입 — Task 5B.5.
 * Python {@code server/routers/inbox.py}.
 *
 * <p>⚠️ <b>이 컨트롤러는 읽기만 한다 — 망 밖을 향한 요청도 역방향 콜백도 만들지
 * 않는다</b>({@code collector/SCHEMA.md} §⑩-5). 수집기와의 접점은 파일시스템
 * ({@code corpus/inbox/}) 하나뿐이고, 그것이 폐쇄망 배포의 전제다.
 *
 * <p><b>호출자 제한(NEXT 72 S1, 사용자 11-11 '영업팀 누구나')</b>: 활성 영업팀·영업팀장·영업부장만.
 * 디자이너·마스터·관리자는 403. 사번 없음 401, 미등록·비활성 403 — 모두 접근 이력 DENIED(고정 문구).
 * 가드는 batch_id 형식·실재 검사보다 <b>먼저</b>라 권한 없는 호출자에게 배치 존재 여부를 알리지 않는다.
 * ⚠️ 사번은 X-Emp-No 자기신고다 — 업무 규칙이지 사칭 방지가 아니다.
 */
@RestController
@RequestMapping("/inbox")
public class InboxController {

    static final String DENIED_MESSAGE = "수집 결과를 반입할 권한이 없습니다.";

    /** 영업팀 전원 — BidAssignmentService.requireSalesTeam·nav.js TEAM_ROLES 와 같은 집합. */
    private static final Set<String> SALES_TEAM_ROLES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("영업팀", "영업팀장", "영업부장")));

    private final InboxService inbox;
    private final MenuGuard guard;

    public InboxController(InboxService inbox, MenuGuard guard) {
        this.inbox = inbox;
        this.guard = guard;
    }

    /**
     * 검사만 — DB 도 파일도 무변경. <b>오류가 있어도 200</b> 이다.
     *
     * <p>{@code batch_id} 형식이 틀리면 <b>400</b>, inbox 에 없으면 <b>404</b>.
     */
    @PostMapping("/{batchId}/validate")
    public InboxValidateResponse validate(@PathVariable String batchId, HttpServletRequest req) {
        requireSalesTeam(req);
        return inbox.validate(batchId);
    }

    /**
     * 반입 — 기관 upsert · 공고 upsert · 첨부 이동 · 배치 보관.
     *
     * <p>규격 위반이면 <b>422</b>({@code {"detail": {"errors": [...]}}}).
     */
    @PostMapping("/{batchId}/import")
    public InboxImportResponse importBatch(@PathVariable String batchId, HttpServletRequest req) {
        requireSalesTeam(req);
        return inbox.importBatch(batchId);
    }

    /** 401/403(미등록·비활성)은 MenuGuard 가 DENIED 로 남기고, 역할 403 은 여기서 같은 방식으로 남긴다. */
    private void requireSalesTeam(HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        String role = me.getRole() == null ? null : me.getRole().trim();
        if (role == null || !SALES_TEAM_ROLES.contains(role)) {
            throw guard.denied(req, new ApiException(403, DENIED_MESSAGE));
        }
    }
}
