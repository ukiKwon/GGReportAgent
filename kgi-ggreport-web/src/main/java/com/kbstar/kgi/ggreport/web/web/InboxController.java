package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.InboxImportResponse;
import com.kbstar.kgi.ggreport.web.dto.InboxValidateResponse;
import com.kbstar.kgi.ggreport.web.service.InboxService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 망 밖 수집기가 떨군 배치의 검사·반입 — Task 5B.5.
 * Python {@code server/routers/inbox.py}.
 *
 * <p>⚠️ <b>이 컨트롤러는 읽기만 한다 — 망 밖을 향한 요청도 역방향 콜백도 만들지
 * 않는다</b>({@code collector/SCHEMA.md} §⑩-5). 수집기와의 접점은 파일시스템
 * ({@code corpus/inbox/}) 하나뿐이고, 그것이 폐쇄망 배포의 전제다.
 */
@RestController
@RequestMapping("/inbox")
public class InboxController {

    private final InboxService inbox;

    public InboxController(InboxService inbox) {
        this.inbox = inbox;
    }

    /**
     * 검사만 — DB 도 파일도 무변경. <b>오류가 있어도 200</b> 이다.
     *
     * <p>{@code batch_id} 형식이 틀리면 <b>400</b>, inbox 에 없으면 <b>404</b>.
     */
    @PostMapping("/{batchId}/validate")
    public InboxValidateResponse validate(@PathVariable String batchId) {
        return inbox.validate(batchId);
    }

    /**
     * 반입 — 기관 upsert · 공고 upsert · 첨부 이동 · 배치 보관.
     *
     * <p>규격 위반이면 <b>422</b>({@code {"detail": {"errors": [...]}}}).
     */
    @PostMapping("/{batchId}/import")
    public InboxImportResponse importBatch(@PathVariable String batchId) {
        return inbox.importBatch(batchId);
    }
}
