package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.dto.PrepFormIn;
import com.kbstar.kgi.ggreport.web.service.InstSummaryPrefill.Fact;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** NEXT 100 S2 — 양식 저장 내용의 정규화·해시·낡음 판정·엄격 입력 검사 단위 시험(DB·스프링 없음). */
public class PrepFormContentTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(String single) {
        try {
            return OM.readTree(single.replace('\'', '"'));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static PrepFormIn.Draft draft(String fields, String lists, String tables) {
        PrepFormIn.Draft d = new PrepFormIn.Draft();
        d.setBaseVer(0);
        d.setFields(fields == null ? null : json(fields));
        d.setLists(lists == null ? null : json(lists));
        d.setTables(tables == null ? null : json(tables));
        return d;
    }

    private static ApiException expect(PrepFormIn.Draft d, int status, String code) {
        try {
            PrepFormService.buildDraft(PrepFormService.emptyContent(), d);
            fail("거부돼야 한다: " + code);
            return null;
        } catch (ApiException e) {
            assertEquals(status, e.getStatus());
            assertEquals(code, ((Map<?, ?>) e.getDetailObject()).get("code"));
            return e;
        }
    }

    @Test
    public void 키_순서만_다른_같은_내용은_같은_문자열_같은_해시다() {
        Map<String, Object> a = new LinkedHashMap<String, Object>();
        a.put("b", 1);
        a.put("a", Collections.singletonMap("y", 2));
        Map<String, Object> b = new LinkedHashMap<String, Object>();
        b.put("a", Collections.singletonMap("y", 2));
        b.put("b", 1);
        assertEquals(PrepFormService.canonical(a), PrepFormService.canonical(b));
        assertEquals(PrepFormService.sha256Hex(PrepFormService.canonical(a)), PrepFormService.sha256Hex(PrepFormService.canonical(b)));
        assertEquals(64, PrepFormService.sha256Hex("x").length());
        assertNotEquals(PrepFormService.sha256Hex("x"), PrepFormService.sha256Hex("y"));
    }

    @Test
    public void 같은_편집_내용은_어느_경로로_만들어도_같은_정규_문자열이다() {
        Map<String, Object> viaEmpty = PrepFormService.buildDraft(PrepFormService.emptyContent(), draft(null, null, null));
        Map<String, Object> viaBlank = PrepFormService.buildDraft(PrepFormService.emptyContent(),
                draft("{'bid_kind':{'val':'  ','note':null}}", "{'overview':[]}", "{'years':null}"));
        assertEquals(PrepFormService.canonical(PrepFormService.emptyContent()), PrepFormService.canonical(viaEmpty));
        assertEquals(PrepFormService.canonical(viaEmpty), PrepFormService.canonical(viaBlank));
    }

    @Test
    public void 낡음_저장_ref와_현재_ref가_다르면_그_칸만_낡았다() {
        JsonNode c = json("{'fields':{'inst_name':{'val':'가','src':{'ref':'INST:x'}},'inst_type':{'val':null,'src':null},"
                + "'head_name':{'val':'나','src':{'ref':'HEAD_ITEM:5'}},'current_bank':{'val':null,'src':null}}}");
        Map<String, Fact> now = new HashMap<String, Fact>();
        now.put("inst_name", new Fact("가", Collections.<String, Object>singletonMap("ref", "INST:x")));
        now.put("head_name", new Fact("나", Collections.<String, Object>singletonMap("ref", "HEAD_ITEM:9")));
        List<String> stale = PrepFormService.staleKeys(c, now);
        assertEquals(Collections.singletonList("head_name"), stale);
    }

    @Test
    public void 낡음_저장이_비었는데_원본이_생기면_낡았고_둘_다_비면_누락_안내만() {
        JsonNode c = json("{'fields':{'inst_name':{'val':'가','src':{'ref':'INST:x'}},'inst_type':{'val':null,'src':null},"
                + "'head_name':{'val':null,'src':null},'current_bank':{'val':null,'src':null}}}");
        Map<String, Fact> now = new HashMap<String, Fact>();
        now.put("inst_name", new Fact("가", Collections.<String, Object>singletonMap("ref", "INST:x")));
        now.put("current_bank", new Fact("1금고 가 (2020~2024)", Collections.<String, Object>singletonMap("ref", "BANK:1.1")));
        assertEquals(Collections.singletonList("current_bank"), PrepFormService.staleKeys(c, now));
        List<String> missing = PrepFormService.missingSources(c, now);
        assertTrue(missing.contains("inst_type"));
        assertTrue(missing.contains("head_name"));
        assertTrue(!missing.contains("current_bank"));
    }

    @Test
    public void 필수_칸은_기관장_기능이_꺼지면_기관장을_뺀다() {
        JsonNode c = json("{'fields':{'inst_name':{'val':'가'},'head_name':{'val':null},'bid_kind':{'val':null}},'lists':{'overview':['x']}}");
        assertEquals(java.util.Arrays.asList("head_name", "bid_kind"), PrepFormService.missingRequired(c, true));
        assertEquals(Collections.singletonList("bid_kind"), PrepFormService.missingRequired(c, false));
    }

    @Test
    public void 씨앗_안내는_개수만_싣고_새_반입이면_NEWER_IMPORT() {
        JsonNode c = json("{'tables':{'biz':{'src':{'ref':'PLAN_IMPORT:1'},'dropped':3,'rows':[]}}}");
        List<Map<String, Object>> n = PrepFormService.seedNotices(c, "PLAN_IMPORT:2");
        assertEquals(2, n.size());
        assertEquals("NEWER_IMPORT", n.get(0).get("reason"));
        assertEquals(3, n.get(1).get("count"));
        assertEquals(1, PrepFormService.seedNotices(c, "PLAN_IMPORT:1").size());
    }

    @Test
    public void 사실_칸을_본문에_넣으면_FIELD_READONLY_모르는_키는_UNKNOWN_KEY_개수만() {
        ApiException e = expect(draft("{'head_name':{'val':'x'}}", null, null), 400, "FIELD_READONLY");
        assertEquals(Collections.singletonList("head_name"), ((Map<?, ?>) e.getDetailObject()).get("keys"));
        ApiException u = expect(draft("{'foo':{'val':'x'},'<script>':1}", null, null), 400, "UNKNOWN_KEY");
        Map<?, ?> d = (Map<?, ?>) u.getDetailObject();
        assertEquals(2, d.get("count"));
        assertEquals("안전한 모양의 키만", Collections.singletonList("foo"), d.get("keys"));
        assertTrue(!String.valueOf(d).contains("script"));
    }

    @Test
    public void 형이_다르면_BAD_TYPE_이다_글자_변환을_하지_않는다() {
        expect(draft("{'bid_kind':{'val':123}}", null, null), 400, "BAD_TYPE");
        expect(draft(null, "{'overview':'글자 하나'}", null), 400, "BAD_TYPE");
        expect(draft(null, null, "{'years':{'unit':'억원','from':'2027','to':2028,'end':null}}"), 400, "BAD_TYPE");
        expect(draft(null, null, "{'years':{'unit':'억원','from':2027.5,'to':2028,'end':null}}"), 400, "BAD_TYPE");
        expect(draft(null, null, "{'fund':{'rows':[{'kind':'a','lines':[{'lv':'0','text':'t'}]}]}}"), 400, "BAD_TYPE");
    }

    @Test
    public void 연도_범위와_금액_형식을_검사한다() {
        expect(draft(null, null, "{'years':{'unit':'억원','from':2027,'to':2040,'end':null}}"), 400, "BAD_YEARS");
        expect(draft(null, null, "{'years':{'unit':'억원','from':2027,'to':2028,'end':2030}}"), 400, "BAD_YEARS");
        expect(draft(null, null, "{'years':{'unit':'억원','from':2027,'to':2028,'end':null,'mmda':{'2031':'1'}}}"), 400, "BAD_YEARS");
        expect(draft(null, null, "{'years':{'unit':'억원','from':2027,'to':2028,'end':null,'mmda':{'2027':'1e30'}}}"), 400, "BAD_VALUE");
    }

    @Test
    public void 개인정보와_줄바꿈과_개수_초과를_막고_응답에_입력_값이_없다() {
        ApiException p = expect(draft(null, "{'overview':['900101-1234567']}", null), 422, "PII_DETECTED");
        assertEquals("overview", ((Map<?, ?>) p.getDetailObject()).get("key"));
        assertTrue(!String.valueOf(p.getDetailObject()).contains("900101"));
        expect(draft(null, "{'overview':['가\\n나']}", null), 400, "BAD_VALUE");
        expect(draft(null, "{'overview':['1','2','3','4','5','6','7','8','9','10','11']}", null), 400, "TOO_MANY");
    }

    @Test
    public void 정상_본문은_빈_칸을_빈_값으로_채워_정규화한다() {
        Map<String, Object> m = PrepFormService.buildDraft(PrepFormService.emptyContent(),
                draft("{'bid_kind':{'val':' 금고 지정 ','note':'공고문'}}", "{'overview':['현황 1','']}",
                        "{'years':{'unit':'억원','from':2027,'to':2028,'end':2027,'mmda':{'2027':'1200'},'income':{},'notes':[]}}"));
        String s = PrepFormService.canonical(m);
        assertTrue(s, s.contains("\"val\":\"금고 지정\""));
        assertTrue(s, s.contains("\"overview\":[\"현황 1\"]"));
        assertTrue(s, s.contains("\"mmda\":{\"2027\":\"1200\"}"));
    }

    @Test
    public void 씨앗_글자는_200자로_자르고_제어문자를_빼고_개인정보는_표식으로_거른다() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 300; i++) {
            b.append('가');
        }
        assertEquals(200, InstSummaryPrefill.seedText(b.toString(), 200).length());
        assertEquals("ab c", InstSummaryPrefill.seedText("a\u0001b\nc", 200));
        assertNull(InstSummaryPrefill.seedText("   ", 200));
        String blocked = InstSummaryPrefill.seedText("문의 900101-1234567", 200);
        assertTrue("표식은 원문이 아니다", !blocked.contains("900101"));
    }

    @Test
    public void 씨앗_글자는_200자_경계에_걸린_주민번호도_자르기_전_원문으로_걸러낸다() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 195; i++) {
            b.append('가');
        }
        // 주민번호 앞 10자("900101-123")만 200자 안에 남는 위치 — 자른 뒤에는 패턴이 안 잡힌다
        String raw = b.toString() + " 900101-1234567 끝";
        String cut = raw.substring(0, 200);
        assertTrue("전제: 잘린 글자만으로는 안 잡힌다", Pii.scanLoose(cut).isEmpty());
        assertTrue(!Pii.scanLoose(raw).isEmpty());
        String r = InstSummaryPrefill.seedText(raw, 200);
        assertTrue("표식이어야 한다", r != null && !r.contains("900101"));
        assertEquals(InstSummaryPrefill.seedText("문의 900101-1234567", 200), r);
    }

    @Test
    public void 연도_표_씨앗은_만기_연도_다음_해이고_2100을_넘으면_2100으로_자른다() {
        assertNull(InstSummaryPrefill.nextYear(null));
        assertEquals(Integer.valueOf(2091), InstSummaryPrefill.nextYear(2090));
        assertEquals(Integer.valueOf(2100), InstSummaryPrefill.nextYear(2099));
        assertEquals(Integer.valueOf(2100), InstSummaryPrefill.nextYear(2100));
        assertEquals(Integer.valueOf(2100), InstSummaryPrefill.nextYear(9999));
    }

    @Test
    public void 만기_문자열은_기간의_끝날로_늘려_비교한다() {
        assertEquals("2026-12-31", InstSummaryPrefill.endOf("2026"));
        assertEquals("2026-03-31", InstSummaryPrefill.endOf("2026-03"));
        assertEquals("2026-03-05", InstSummaryPrefill.endOf("2026-03-05"));
        assertEquals(Integer.valueOf(2026), InstSummaryPrefill.yearOf("2026-03"));
        assertNull(InstSummaryPrefill.yearOf("abc"));
    }
}
