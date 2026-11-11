package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 기관장 정보 금지 내용 검사 — 차단 표·통과 표를 그대로 고정한다(사전 기반이라 오탐·누락이 있다는 전제의 회귀 방어선). */
public class HeadForbiddenTest {

    private static void blocked(HeadForbidden.Kind kind, String... texts) {
        for (String t : texts) {
            assertTrue("차단돼야 한다: " + t + " → " + kind, HeadForbidden.scan(t).contains(kind));
        }
    }

    private static void passes(String... texts) {
        for (String t : texts) {
            assertTrue("통과해야 한다: " + t + " → " + HeadForbidden.scan(t), HeadForbidden.scan(t).isEmpty());
        }
    }

    @Test
    public void 정당_표현은_막는다() {
        blocked(HeadForbidden.Kind.PARTY, "더불어민주당 지역위원장", "국민의 힘 최고위원", "새희망당 대변인", "국민의힘", "미래당 사무총장");
    }

    @Test
    public void 정당과_비슷한_낱말은_통과한다() {
        passes("CJ제일제당 대표이사", "예술의전당 이사", "기획담당관", "경로당 연합회장", "정당한 절차 개선 위원");
    }

    @Test
    public void 범죄_건강_종교_가족_경조사를_막는다() {
        blocked(HeadForbidden.Kind.CRIME, "징역");
        blocked(HeadForbidden.Kind.HEALTH, "투병");
        blocked(HeadForbidden.Kind.RELIGION, "교회 장로");
        blocked(HeadForbidden.Kind.FAMILY, "배우자");
        blocked(HeadForbidden.Kind.EVENT, "별세");
    }

    @Test
    public void 비슷한_낱말은_통과한다() {
        passes("자매결연 추진단장", "딸기축제 위원장", "○○신도시 추진단장", "저출산 대책 위원", "다자녀 지원 위원");
    }

    @Test
    public void 정상_직함_학력_자문직은_낱말_일부여도_통과한다_qa_P1() {
        passes("서울특별시 재난안전과장", "지역발전과장", "과학기술정보통신부 차관", "과학기술정보통신부 기획조정실장", "OO인권사무소장",
                "구로구 신도림동장", "고려대학교 회계학과", "정보통신 자문위원", "국토교통부 고문", "도시계획과장", "산부인과 자문의");
    }

    @Test
    public void 이름_칸은_낱말_검사에서_제외하고_전화번호만_본다() {
        for (String name : new String[]{"고희정", "신도윤", "권사랑", "장남희", "조문희", "신자영", "손자영", "김부인"}) {
            HeadForbidden.rejectName(name);   // 예외 없음
        }
        try {
            HeadForbidden.rejectName("02-123-4567");
            fail("이름 칸의 전화번호는 거부");
        } catch (ApiException e) {
            assertEquals(422, e.getStatus());
        }
    }

    @Test
    public void 구체적_표현은_여전히_막는다() {
        blocked(HeadForbidden.Kind.CRIME, "전과 2범", "벌금형 선고", "집행유예", "불구속 기소", "구속 수감");
        blocked(HeadForbidden.Kind.HEALTH, "암 진단", "입원 치료", "수술을 받음", "투병 중");
        blocked(HeadForbidden.Kind.RELIGION, "목사", "신부님", "스님", "권사님", "집사", "교회 출석", "성당 신자");
        blocked(HeadForbidden.Kind.FAMILY, "부인은 교수", "아들 결혼", "딸의 학교", "자녀 두 명", "장남");
        blocked(HeadForbidden.Kind.EVENT, "부친상", "모친상", "결혼식 참석", "부고", "별세", "조문");
        blocked(HeadForbidden.Kind.PARTY, "당원", "○○ 지역 당원 모임", "미래당 시당 위원장");
    }

    @Test
    public void 유선전화와_대표번호를_막는다() {
        blocked(HeadForbidden.Kind.PHONE, "02-123-4567", "(031)123-4567", "02.123.4567", "1588-1234",
                "０２－１２３－４５６７");
    }

    @Test
    public void 연도_기간과_일반_경력은_통과한다() {
        passes("1995-2002 ○○시 부시장", "서울특별시 행정국장", "행정학 석사");
    }

    @Test
    public void 공백과_서식문자로_돌려_쓴_정당명도_막는다() {
        blocked(HeadForbidden.Kind.PARTY, "국 민 의 힘", "국민" + (char) 0x200B + "의힘", "더불어 민주당");
    }

    @Test
    public void 휴대폰은_PII_BLOCKED로_먼저_막고_입력값을_싣지_않는다() {
        try {
            HeadForbidden.rejectAny("010-1234-5678");
            fail("422 PII_BLOCKED 여야 한다");
        } catch (ApiException e) {
            assertEquals(422, e.getStatus());
            Map<?, ?> d = (Map<?, ?>) e.getDetailObject();
            assertEquals("PII_BLOCKED", d.get("code"));
            assertFalse(String.valueOf(d).contains("1234"));
        }
    }

    @Test
    public void 금지_내용은_422_HEAD_FORBIDDEN이고_종류만_싣는다() {
        try {
            HeadForbidden.rejectAny("더불어민주당 지역위원장", "02-123-4567");
            fail("422 HEAD_FORBIDDEN 여야 한다");
        } catch (ApiException e) {
            assertEquals(422, e.getStatus());
            Map<?, ?> d = (Map<?, ?>) e.getDetailObject();
            assertEquals("HEAD_FORBIDDEN", d.get("code"));
            String s = String.valueOf(d);
            assertTrue(s.contains("PARTY") && s.contains("PHONE"));
            assertFalse(s.contains("더불어") || s.contains("123-4567"));
        }
    }

    @Test
    public void null과_빈_값은_건너뛴다() {
        HeadForbidden.rejectAny((String) null, "", "홍길동");
        assertTrue(HeadForbidden.scan(null).isEmpty());
        assertTrue(HeadForbidden.scan("").isEmpty());
    }
}
