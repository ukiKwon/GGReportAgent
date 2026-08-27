package com.kbstar.kgi.ggreport.web.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * REST 응답 JSON 의 모양을 고정한다.
 *
 * <p>골든 34건이 전부 <b>snake_case 키</b>에 <b>{@code null} 필드도 그대로 실린</b>
 * 모양이다(pydantic 기본 동작). 이 둘이 어긋나면 34건이 <b>전부</b> 실패하므로,
 * 이관 검증의 전제에 해당한다.
 *
 * <p>⚠️ <b>왜 {@code application.properties} 가 아니라 자바 설정인가.</b>
 * 명명 전략은 환경 설정이 아니라 <b>REST 계약</b>이다 — 5개 축(local/dev/stg/prod/
 * out-local) 어디서든 같아야 한다. 그런데 properties 로 두면 두 방향에서 가려질 수
 * 있다: ⓐ 기동 디렉터리의 {@code config/application.properties} 가 클래스패스 값을
 * 덮고, ⓑ 테스트 클래스패스({@code src/test/resources/application.properties})가
 * {@code classpath:/application.properties} 조회에서 먼저 걸려 main 쪽 파일을
 * <b>통째로 가린다.</b> 어느 쪽이든 "설정 파일 한 줄이 빠져서 골든 34건이 깨지는"
 * 실패가 되고, 원인이 코드에 없어 찾기 어렵다. 빈으로 두면 가려지지 않는다.
 *
 * <p>{@code JacksonSnakeCaseTest} 가 이 설정이 실제로 걸렸는지를 고정한다.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer ggreportJsonContract() {
        return builder -> {
            // institutionId → institution_id
            builder.propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
            // Jackson 기본값과 같지만 명시한다 — 이건 "기본값이라 안 적었다"가 아니라
            // **골든이 요구하는 계약**이다. null 을 빼면 프런트가 없는 키를 만나
            // undefined 로 읽는다(값이 null 인 것과 다르게 동작하는 자리가 있다).
            builder.serializationInclusion(JsonInclude.Include.ALWAYS);
        };
    }
}
