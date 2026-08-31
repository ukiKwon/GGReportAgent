package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * 쪽지함 조회. Python {@code routers/notifications.py} 의 GET 쪽.
 *
 * <p>수신자는 사람 이름일 수도 <b>역할</b>일 수도 있다(영업팀·디자이너 — 그래프의
 * 알림이 쓰는 값). 그래서 조회는 항상 {@code recipient} 를 여러 개 받는다.
 */
@Service
public class NotificationQueryService {

    private final NotificationMapper mapper;

    public NotificationQueryService(NotificationMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * ⚠️ {@code recipients} 가 비면 <b>SQL 을 부르지 않는다</b> — 원본이 빈 목록을
     * 즉시 돌려주고, {@code IN ()} 은 어느 DB 에서도 문법 오류다.
     */
    public List<Notification> forRecipients(List<String> recipients, boolean unreadOnly, int limit) {
        if (recipients == null || recipients.isEmpty()) {
            return Collections.emptyList();
        }
        return mapper.selectByRecipients(recipients, unreadOnly, limit);
    }
}
