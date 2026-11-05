package com.kbstar.kgi.ggreport.web.boarddoc;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Spring 테스트가 옛 형식 지도(excel-map-legacy.json, 가상 엑셀 {@link BoardExcelFixture#xlsx} 와 짝)를 쓰게 한다.
 * 실제 지도(excel-map.json, v2)는 {@link BoardProfitSampleTest} 가 따로 시험한다. {@code @Import} 로 붙인 테스트에만 적용.
 */
@TestConfiguration
public class LegacyBoardMapConfig {

    @Bean
    @Primary
    public BoardExcelMap legacyBoardExcelMap() {
        return BoardExcelFixture.legacyMap();
    }
}
