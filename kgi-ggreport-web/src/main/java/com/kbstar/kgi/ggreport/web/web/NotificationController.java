package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.dto.NoteIn;
import com.kbstar.kgi.ggreport.web.service.NotificationCommandService;
import com.kbstar.kgi.ggreport.web.service.NotificationQueryService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.List;
import java.util.Map;

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
    private final NotificationCommandService commands;

    public NotificationController(NotificationQueryService notifications,
                                  NotificationCommandService commands) {
        this.notifications = notifications;
        this.commands = commands;
    }

    /**
     * 사람이 보내는 쪽지 — Task 5B.3. {@code 201}.
     *
     * <p>⚠️ <b>{@code kind} 는 본문으로 받지 않는다</b>({@code 쪽지} 고정).
     * {@code 결재요청}·{@code 되물음}·{@code 이관} 은 그래프만 만들 수 있어야 흐름을
     * 신뢰할 수 있다 — 받으면 사람이 결재요청을 위조할 수 있다.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Notification send(@RequestBody NoteIn body) {
        return commands.send(body);
    }

    /** 읽음 처리. 이미 읽은 것을 다시 눌러도 안전하다 — {@code {"read": false}} 로 알려줄 뿐. */
    @PostMapping("/{notificationId}/read")
    public Map<String, Boolean> read(@PathVariable String notificationId) {
        return Collections.singletonMap("read", commands.markRead(notificationId));
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
