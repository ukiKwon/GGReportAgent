package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.Message;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code MESSAGES}(작업별 대화·기록). 출처는 {@code server/task_repository.py}.
 */
@Mapper
public interface MessageMapper {

    /**
     * {@code list_messages} — {@code ORDER BY CREATED_AT}.
     *
     * <p>정렬 키가 ISO 8601 <b>문자열</b>이라 사전순 = 시간순이다(설계 §5-C).
     * 같은 밀리초에 두 건이 들어가면 순서가 정해지지 않는데, 이는 원본도 같다.
     */
    List<Message> selectByTask(@Param("taskId") String taskId);

    /**
     * {@code add_message}. {@code author}·{@code stage}·{@code model} 은 모르는
     * 호출부가 안 채우면 NULL 로 남는다 — 특히 {@code model} 이 채워져 있다는 것은
     * 그 기록이 <b>실제로 LLM 을 썼다</b>는 뜻이다.
     */
    int insert(Message message);
}
