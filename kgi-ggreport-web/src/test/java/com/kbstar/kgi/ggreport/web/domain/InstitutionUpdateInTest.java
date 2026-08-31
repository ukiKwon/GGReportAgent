package com.kbstar.kgi.ggreport.web.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 부분 갱신의 "안 보냄 ≠ null" 규칙을 고정한다.
 *
 * <p>이관 전 이 자리에서 실제 결함이 있었다 — {@code COALESCE(?, 기존값)} 으로 둘을
 * 같게 취급했더니 숫자인 {@code term} 은 한 번 넣으면 <b>비울 방법이 아예 없었다.</b>
 * Mapper XML 의 {@code <if test="upd.present(…)">} 가 이 클래스의 판정을 그대로
 * 쓰므로, 여기서 규칙이 깨지면 그 결함이 되살아난다.
 *
 * <p>Jackson 이 <b>JSON 에 있는 키의 세터만</b> 부른다는 성질에 기대므로, 테스트도
 * 세터를 직접 부르지 않고 <b>역직렬화로</b> 확인한다 — 그것이 실제 경로다.
 */
public class InstitutionUpdateInTest {

    /** 컨트롤러가 쓰는 것과 같은 명명 규칙(snake_case). */
    private final ObjectMapper mapper = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    private InstitutionUpdateIn parse(String json) throws Exception {
        return mapper.readValue(json, InstitutionUpdateIn.class);
    }

    @Test
    public void 아무것도_안_보내면_갱신할_것이_없다() throws Exception {
        InstitutionUpdateIn upd = parse("{}");
        assertTrue(upd.nothingSet());
        assertFalse(upd.present("term"));
    }

    @Test
    public void null을_보내면_지움이다() throws Exception {
        InstitutionUpdateIn upd = parse("{\"term\": null}");
        assertFalse(upd.nothingSet());
        assertTrue("term 을 보냈는데 present 가 false 다 — 지울 방법이 사라진다",
                upd.present("term"));
        assertNull(upd.getTerm());
    }

    @Test
    public void 안_보낸_필드는_보존이다() throws Exception {
        InstitutionUpdateIn upd = parse("{\"term\": 3}");
        assertTrue(upd.present("term"));
        assertFalse("보내지도 않은 region_code 가 갱신 대상이 됐다",
                upd.present("regionCode"));
        assertEquals(Integer.valueOf(3), upd.getTerm());
    }

    @Test
    public void 문자열_네_개는_빈_문자열이_지움이다() throws Exception {
        InstitutionUpdateIn upd = parse(
                "{\"region_code\": \"\", \"type\": \"\", \"contract_end\": \"\", \"last_bid\": \"\"}");
        assertTrue(upd.present("regionCode"));
        assertNull("빈 문자열이 그대로 저장되면 화면에서 지울 수가 없다", upd.getRegionCode());
        assertNull(upd.getType());
        assertNull(upd.getContractEnd());
        assertNull(upd.getLastBid());
    }

    @Test
    public void 값이_있으면_그대로다() throws Exception {
        InstitutionUpdateIn upd = parse("{\"region_code\": \"11\"}");
        assertEquals("11", upd.getRegionCode());
        assertEquals(1, upd.presentFields().size());
    }
}
