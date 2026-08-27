package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code NOTIFICATIONS}(쪽지·알림). 출처는 {@code server/notification_repository.py}.
 */
@Mapper
public interface NotificationMapper {

    /** {@code create_notification}. */
    int insert(Notification notification);

    /** {@code list_notifications} — 한 수신자, {@code ORDER BY CREATED_AT DESC}. 골든 {@code 27}. */
    List<Notification> selectByRecipient(@Param("recipient") String recipient,
                                         @Param("unreadOnly") boolean unreadOnly);

    /**
     * {@code list_notifications_for} — 쪽지함은 <b>'내 소속 + 내 이름'</b> 을 함께 본다.
     *
     * <p>⚠️ 원본의 {@code LIMIT ?} 는 <b>Oracle 에 없고</b>, Oracle 12c 의
     * {@code FETCH FIRST … ROWS ONLY} 는 <b>MySQL 에 없다.</b> 두 DB 에 다 있는
     * {@code ROW_NUMBER() OVER (…)} 로 옮겨 Mapper XML 을 한 벌로 유지한다
     * (Oracle 12c+ · MySQL 8.0+ · H2 모두 지원한다).
     *
     * <p>{@code recipients} 가 비면 <b>호출하지 않는다</b> — 원본이 빈 목록을 즉시
     * 돌려주고, {@code IN ()} 은 어느 DB 에서도 문법 오류다.
     */
    List<Notification> selectByRecipients(@Param("recipients") List<String> recipients,
                                          @Param("unreadOnly") boolean unreadOnly,
                                          @Param("limit") int limit);

    /** {@code get_notification}. 없으면 null. */
    Notification selectById(@Param("notificationId") String notificationId);

    /**
     * 지금까지 알림이 간 수신자 전부(원본 {@code teams.known_recipients}).
     * {@code Teams.inboxName()} 의 재료이자 계정 목록의 '역할' 쪽이다.
     */
    List<String> selectDistinctRecipients();

    /**
     * {@code mark_read} — <b>안 읽은 것만</b> 찍는다. 이미 읽은 알림을 다시 열어도
     * 최초 확인 시각이 바뀌지 않는다. 호출부는 갱신 행 수로 "처음 읽었는지"를 안다.
     */
    int markRead(@Param("notificationId") String notificationId, @Param("readAt") String readAt);

    /**
     * 타임라인(골든 {@code 29})의 쪽지 쪽. {@code KIND} 가 {@code role} 자리로 온다 —
     * 쪽지에는 팀이 없어서 화면이 그 칸을 종류 표시로 쓴다.
     */
    List<com.kbstar.kgi.ggreport.web.dto.TimelineEvent> selectTimeline(
            @Param("institutionId") String institutionId);

    /** 워크플로 상태의 {@code notifications_unread} — 골든 {@code 30}. */
    int countUnread(@Param("institutionId") String institutionId);

}
