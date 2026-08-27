package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.service.NotificationQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 쪽지함 조회 — 골든 {@code 27}.
 *
 * <p>{@code recipient} 는 <b>필수이고 여러 개</b>다 — 없이 열면 남의 쪽지함까지
 * 보이는 전체 조회가 되고, 수신자가 사람 이름일 수도 역할일 수도 있어서 쪽지함은
 * '내 소속 + 내 이름'을 함께 본다.
 *
 * <p>발송({@code POST})·읽음 처리는 아직 없다 — 단계 2는 조회만이다.
 */
@RestController
@RequestMapping("/notifications")
public class NotificationController {

    /** 원본 {@code Query(default=50, ge=1, le=200)} 과 같은 범위다. */
    private static final int LIMIT_MIN = 1;
    private static final int LIMIT_MAX = 200;

    private final NotificationQueryService notifications;

    public NotificationController(NotificationQueryService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public List<Notification> list(
            @RequestParam("recipient") List<String> recipient,
            @RequestParam(name = "unread_only", defaultValue = "false") boolean unreadOnly,
            @RequestParam(name = "limit", defaultValue = "50") int limit) {
        if (recipient.isEmpty()) {
            throw ApiException.badRequest("recipient가 비어 있습니다");
        }
        if (limit < LIMIT_MIN || limit > LIMIT_MAX) {
            throw ApiException.badRequest(
                    "limit은 " + LIMIT_MIN + "~" + LIMIT_MAX + " 범위여야 합니다: " + limit);
        }
        return notifications.forRecipients(recipient, unreadOnly, limit);
    }
}
