package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;

/**
 * 산출물 JSON 파일 읽기 — {@code rfp_scoring.json}·{@code coverage_map.json}.
 *
 * <p>⚠️ <b>웹 응답용 {@code ObjectMapper} 를 쓰지 않는다.</b> 그쪽은 snake_case
 * 전략이 걸려 있어 POJO 로 읽을 때 키 규칙이 섞인다. 여기서 읽는 것은
 * {@link JsonNode} 라 명명 전략과 무관하지만, <b>같은 인스턴스를 공유하면</b>
 * 나중에 누군가 POJO 역직렬화를 붙였을 때 조용히 규칙이 바뀐다.
 *
 * <p>⚠️ <b>파일이 없거나 깨졌으면 {@code null} 이다 — 예외가 아니다.</b>
 * 3단계(배점표 추출) 전에는 없는 것이 정상이고, 여기서 500 을 내면 25개 기관이
 * 전부 빨개진다. "없는 것은 어긋난 것이 아니다."
 */
@Component
public class JsonFiles {

    private final ObjectMapper mapper = new ObjectMapper();

    /** 읽지 못하면 null(없음·깨짐·권한 모두). */
    public JsonNode readOrNull(File file) {
        if (file == null || !file.isFile()) {
            return null;
        }
        try {
            return mapper.readTree(file);
        } catch (IOException e) {
            return null;
        }
    }
}
