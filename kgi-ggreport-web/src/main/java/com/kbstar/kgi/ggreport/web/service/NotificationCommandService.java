package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

/**
 * 쪽지 발송 — Python {@code notification_repository.create_notification}.
 *
 * <p>조회는 {@link NotificationQueryService} 에 있다. 쓰기를 갈라 둔 것은 트랜잭션
 * 경계가 다르기 때문이다 — 쪽지는 <b>부르는 쪽 트랜잭션에 얹힌다</b>(참여확정 처리가
 * 롤백되면 "시작하지 못했습니다" 쪽지도 함께 사라져야 한다).
 */
@Service
public class NotificationCommandService {

    /** 사람이 만들 수 있는 유일한 종류. 나머지는 그래프만 만든다. */
    static final String NOTE_KIND = "쪽지";

    private final NotificationMapper notifications;

    public NotificationCommandService(NotificationMapper notifications) {
        this.notifications = notifications;
    }

    /**
     * 사람이 보내는 쪽지 — Task 5B.2. Python {@code post_note}.
     *
     * <p>⚠️ <b>{@code kind} 를 {@code 쪽지} 로 고정한다.</b> 본문으로 받지 않는다 —
     * {@code 결재요청}·{@code 되물음}·{@code 이관} 은 그래프(시스템)만 만들 수 있어야
     * 흐름을 신뢰할 수 있다. 받으면 사람이 결재요청을 위조할 수 있다.
     */
    public Notification send(com.kbstar.kgi.ggreport.web.dto.NoteIn body) {
        if (body.getRecipient() == null || body.getRecipient().trim().isEmpty()) {
            throw ApiException.badRequest("recipient가 비어 있습니다");
        }
        return create(body.getRecipient(), NOTE_KIND, body.getContent(),
                body.getInstitutionId(), body.getTaskId(), null, null, body.getSender());
    }

    /**
     * 읽음 처리. 없으면 404.
     *
     * <p>⚠️ <b>이미 읽은 것을 다시 눌러도 안전하다</b> — 예외가 아니라 {@code read=false}
     * 로 알려줄 뿐이다. 쪽지함은 여러 탭에서 열려 있을 수 있어 같은 요청이 두 번 오는
     * 것이 정상 경로다.
     */
    public boolean markRead(String notificationId) {
        if (notifications.selectById(notificationId) == null) {
            throw ApiException.notFound("notification not found");
        }
        return notifications.markRead(notificationId, Times.nowIso()) > 0;
    }

    /** 원본의 위치 인자 3개(수신자·종류·본문) + 자주 쓰는 선택 인자 하나. */
    public Notification create(String recipient, String kind, String content,
                               String institutionId) {
        return create(recipient, kind, content, institutionId, null, null, null, null);
    }

    public Notification create(String recipient, String kind, String content,
                               String institutionId, String taskId, String link,
                               Integer stage, String sender) {
        Notification n = new Notification();
        n.setNotificationId(Ids.notification());
        n.setRecipient(recipient);
        n.setKind(kind);
        n.setContent(content);
        n.setInstitutionId(institutionId);
        n.setTaskId(taskId);
        n.setLink(link);
        n.setCreatedAt(Times.nowIso());
        n.setStage(stage);
        n.setSender(sender);
        notifications.insert(n);
        return n;
    }
}
