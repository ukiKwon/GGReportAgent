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

    /**
     * 시스템 쪽지의 보낸 사람 예약값(NEXT 100 ⑥, security M3). 디자인 검토 흐름(DesignReviewService)이 보내는 쪽지의 sender 는 항상 이 값이고,
     * 사람이 보내는 공개 경로({@link #send})는 이 이름을 400 으로 거절한다 — 아무나 시스템 쪽지를 위조하지 못하게.
     */
    public static final String SYSTEM_SENDER = "시스템";

    /** 보낸 사람이 비었을 때 저장하는 값 — 시스템 쪽지(예약 이름)와 구분되는 비예약 표시(security N1). */
    public static final String UNKNOWN_SENDER = "보낸 사람 미상";

    /** NFKC 로 모양을 맞춘 뒤 공백·서식·제어 문자를 지운 값이 예약 이름이면 true — 전각 공백·분해형 한글 같은 위조를 같이 막는다(security N2). */
    static boolean isReservedSender(String sender) {
        if (sender == null) {
            return false;
        }
        String folded = java.text.Normalizer.normalize(sender, java.text.Normalizer.Form.NFKC);
        return SYSTEM_SENDER.equals(folded.replaceAll("[\\p{Z}\\p{Cf}\\p{Cc}\\s]+", ""));
    }

    /** 옛 작업 결재 계열 쪽지의 종류. */
    static final String KIND_APPROVAL_REQUEST = "결재요청";

    /**
     * 결재 요청 쪽지(결재자에게 가는 '결재알림' + 옛 '결재요청')를 보낼지 — 기본 꺼짐(사용자 11-23: 결재함은 머리 띠 [결재함 n]).
     * 꺼도 요청자에게 가는 '결재결과'와 감사 기록은 그대로다. 필드 주입이라 생성자(시험이 직접 new 한다)는 그대로다.
     */
    @org.springframework.beans.factory.annotation.Value("${ggreport.notify.approval-request.enabled:false}")
    private boolean approvalRequestEnabled;

    public boolean approvalRequestEnabled() {
        return approvalRequestEnabled;
    }

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
        if (isReservedSender(body.getSender())) {
            throw ApiException.badRequest("sender에 쓸 수 없는 이름입니다");
        }
        String sender = body.getSender() == null || java.text.Normalizer.normalize(body.getSender(), java.text.Normalizer.Form.NFKC)
                .replaceAll("[\\p{Z}\\p{Cf}\\p{Cc}\\s]+", "").isEmpty()
                ? UNKNOWN_SENDER : body.getSender();
        return create(body.getRecipient(), NOTE_KIND, body.getContent(),
                body.getInstitutionId(), body.getTaskId(), null, null, sender);
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
        if (KIND_APPROVAL_REQUEST.equals(kind) && !approvalRequestEnabled) {
            return null;   // 옛 '결재요청' 쪽지 끔 — 호출자는 반환값을 쓰지 않는다
        }
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
