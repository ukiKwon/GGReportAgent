package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;
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

    private final NotificationMapper notifications;

    public NotificationCommandService(NotificationMapper notifications) {
        this.notifications = notifications;
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
