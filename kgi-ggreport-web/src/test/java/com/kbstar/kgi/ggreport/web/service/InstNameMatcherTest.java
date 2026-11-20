package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;

/** 기관명 사전·스캔(NEXT 106). 정식 기관 이름만 잡는다 — 약칭은 일부러 잡지 않는다. DB·Spring 없음. */
public class InstNameMatcherTest {

    private static final List<InstNameMatcher.Row> ROWS = Arrays.asList(
            new InstNameMatcher.Row("gangnam", "강남구", "11"),
            new InstNameMatcher.Row("seocho", "서초구", "11"),
            new InstNameMatcher.Row("gangseo-s", "강서구", "11"),
            new InstNameMatcher.Row("gangseo-b", "부산 강서구청", "26"),
            new InstNameMatcher.Row("jung-s", "중구", "11"),
            new InstNameMatcher.Row("jung-b", "부산 중구청", "26"),
            new InstNameMatcher.Row("jung-d", "대구 중구청", "27"),
            new InstNameMatcher.Row("seongdong", "성동구", "11"),
            new InstNameMatcher.Row("seo-b", "부산 서구청", "26"),
            new InstNameMatcher.Row("dong-b", "부산 동구청", "26"),
            new InstNameMatcher.Row("edu-g", "경기도교육청", "41"),
            new InstNameMatcher.Row("dup1", "한빛대학교", null),
            new InstNameMatcher.Row("dup2", "한빛대학교", null),
            new InstNameMatcher.Row("hosp", "재단법인 한빛병원", null),
            new InstNameMatcher.Row("eng", "KB Bank Center", null),
            new InstNameMatcher.Row("sj", "세종특별자치시", "36"),
            new InstNameMatcher.Row("jg", "전남광주통합특별시", "46"),
            new InstNameMatcher.Row("gwangsan", "광주광역시 광산구", "46"));

    private static List<String> ids(String current, String text) {
        List<String> out = new ArrayList<String>();
        for (InstNameMatcher.Found f : InstNameMatcher.build(ROWS, current).scan(InstNameMatcher.normalize(text))) {
            out.add(f.instId);
        }
        return out;
    }

    @Test public void 다른_구를_찾는다() { assertEquals(Arrays.asList("seocho"), ids("gangnam", "서초구 사업을 참고")); }
    @Test public void 성동구_안의_동구는_잡지_않는다() { assertEquals(Arrays.asList("seongdong"), ids("gangnam", "성동구")); }
    @Test public void 두글자_맨몸은_잡지_않는다() { assertEquals(0, ids("gangnam", "서구 문화 중구난방").size()); }

    @Test public void 동명_맨몸_강서구는_못잡고_시도를_붙이면_잡는다() {
        assertEquals(0, ids("gangnam", "강서구").size());   // 알려진 빈틈 — 화면 문구에 밝힌다
        assertEquals(Arrays.asList("gangseo-s"), ids("gangnam", "서울 강서구"));
        assertEquals(Arrays.asList("gangseo-b"), ids("gangnam", "부산 강서구"));
    }

    @Test public void 현재_기관과_현재_시도는_보고하지_않는다() {
        assertEquals(0, ids("jung-b", "부산광역시 중구 / 중구").size());
        assertEquals(0, ids("gangnam", "서울특별시 서울시 강남구청").size());
    }

    @Test public void 다른_시도의_같은_이름_구는_잡는다() {
        assertEquals(Arrays.asList("jung-d", "jung-d"), ids("jung-b", "대구 중구, 대구광역시 중구청"));
    }

    @Test public void 공백은_무시하고_문단_경계는_넘지_않는다() {
        assertEquals(Arrays.asList("seocho"), ids("gangnam", "서 초 구"));
        assertEquals(0, ids("gangnam", "서초|구").size());
    }

    @Test public void 모호한_이름과_접두를_뗀_일반어는_빼고_전체이름은_잡는다() {
        assertEquals(0, ids("gangnam", "한빛대학교").size());
        assertEquals(0, ids("gangnam", "교육청 협의").size());
        assertEquals(Arrays.asList("edu-g"), ids("gangnam", "경기도교육청"));
    }

    @Test public void 법인_접두는_떼고_등록하고_영문은_소문자로_통일한다() {
        assertEquals(Arrays.asList("hosp"), ids("gangnam", "재단법인 한빛병원 사례"));
        assertEquals(Arrays.asList("hosp"), ids("gangnam", "(재)한빛병원"));
        assertEquals(Arrays.asList("eng"), ids("gangnam", "kb BANK center"));
        assertEquals("한빛병원", InstNameMatcher.stripCorp("(사) 한빛병원"));
    }

    @Test public void 전남광주통합특별시는_시도급으로_46의_옛_표기와_같이_잡는다() {
        assertEquals(Arrays.asList("jg"), ids("gangnam", "전남광주통합특별시"));
        assertEquals(Arrays.asList("gwangsan"), ids("gangnam", "전남광주통합특별시 광산구"));
        assertEquals(Arrays.asList("gwangsan"), ids("gangnam", "광주광역시 광산구"));
    }

    @Test public void 낱말_경계에_걸린_일치는_버린다() {
        assertEquals("서초구청에서는 잡는다", Arrays.asList("seocho"), ids("gangnam", "서초구청에서 안내"));
        assertEquals("서초구청년센터는 버린다", 0, ids("gangnam", "서초구청년센터").size());
        assertEquals("서초구민은 버린다", 0, ids("gangnam", "서초구민 대상").size());
        assertEquals("세종청사는 버린다", 0, ids("gangnam", "세종청사 방문").size());
        assertEquals("세종시청은 잡는다", Arrays.asList("sj"), ids("gangnam", "세종시청 방문"));
    }

    /** 원문 위치(orig)와 함께 스캔 — 서비스가 쓰는 방식. */
    private static List<String> idsRaw(String current, String text) {
        InstNameMatcher.Normalized nz = InstNameMatcher.normalizeWithMap(text);
        List<String> out = new ArrayList<String>();
        for (InstNameMatcher.Found f : InstNameMatcher.build(ROWS, current).scan(nz.text, nz.orig, text)) {
            out.add(f.instId);
        }
        return out;
    }

    @Test public void 일치_뒤에_원문_공백이_있으면_낱말_경계로_버리지_않는다() {
        assertEquals(Arrays.asList("seocho"), idsRaw("gangnam", "서초구청 사업 추진"));
        assertEquals(Arrays.asList("seocho"), idsRaw("gangnam", "서초구청 사회복지과"));
        assertEquals(Arrays.asList("seocho"), idsRaw("gangnam", "서초구 민간위탁"));
        assertEquals(Arrays.asList("sj"), idsRaw("gangnam", "세종시 민관협력"));
        assertEquals(Arrays.asList("seocho"), idsRaw("gangnam", "서초구 청년정책"));
        assertEquals("줄바꿈도 공백", Arrays.asList("seocho"), idsRaw("gangnam", "서초구청\n사업"));
    }

    @Test public void 공백_없이_붙은_낱말_경계는_원문_기준으로도_버린다() {
        assertEquals(0, idsRaw("gangnam", "서초구청년센터").size());
        assertEquals(0, idsRaw("gangnam", "세종시청사 방문").size());
        assertEquals(0, idsRaw("gangnam", "세종시민 대상").size());
        assertEquals(0, idsRaw("gangnam", "서초구민 대상").size());
    }

    @Test public void 정규화로_글자가_늘어도_원문_위치_배열이_맞다() {
        String[] raws = {"㈜KB국민", "가…가나", "1.……… 3", "㉑㉒㉓ ﷺ 가"};
        for (String raw : raws) {
            InstNameMatcher.Normalized nz = InstNameMatcher.normalizeWithMap(raw);
            assertEquals(raw, nz.text.length(), nz.orig.length);
        }
        assertEquals("(주)kb국민", InstNameMatcher.normalize("㈜KB국민"));
        assertEquals("가...가나", InstNameMatcher.normalize("가…가나"));
        assertEquals("1..........3",InstNameMatcher.normalize("1.……… 3"));
    }

    @Test public void 문맥은_원문_앞뒤_12자_80자_이내() {
        String raw = "이번 사업은|서초구 사례를 참고했다";
        InstNameMatcher.Normalized nz = InstNameMatcher.normalizeWithMap(raw);
        InstNameMatcher.Found f = InstNameMatcher.build(ROWS, "gangnam").scan(nz.text).get(0);
        String c = InstNameMatcher.context(raw, nz, f);
        assertEquals(true, c.contains("서초구") && c.contains(" / ") && c.length() <= 80);
    }
}
