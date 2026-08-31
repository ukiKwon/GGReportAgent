package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.ChatMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code CHAT_MESSAGES}(기관별 대화창). 출처는 {@code server/chat_repository.py}.
 */
@Mapper
public interface ChatMessageMapper {

    /** {@code add_chat_message}. */
    int insert(ChatMessage chatMessage);

    /** {@code list_chat_messages} — {@code ORDER BY CREATED_AT}(오래된 것부터). */
    List<ChatMessage> selectByInstitution(@Param("institutionId") String institutionId);
}
