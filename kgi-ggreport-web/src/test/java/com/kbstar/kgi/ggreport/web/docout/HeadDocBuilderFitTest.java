package com.kbstar.kgi.ggreport.web.docout;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** 1장 맞춤 사진 단계 선택(추정, NEXT 100 S1 · 사용자 11-23). 가상 값만. */
public class HeadDocBuilderFitTest {

    private static final List<String> INFO = Arrays.asList("성 명 : 홍길동", "만 56세", "구청장\n(2023.12 ~ 2027.12)", "첫 취임일 : 2018.07.01");
    private static final List<String> NONE = Collections.<String>emptyList();

    private static List<String> rows(int n) {
        List<String> l = new ArrayList<String>();
        for (int i = 0; i < n; i++) {
            l.add("가나다라마바사 경력 " + i);
        }
        return l;
    }

    private static String repeat(char c, int n) {
        return new String(new char[n]).replace('\0', c);
    }

    @Test
    public void 줄바꿈_수는_가중_글자수로_센다() {
        assertEquals(1, HeadDocBuilder.wrapLines("", 28));
        assertEquals(1, HeadDocBuilder.wrapLines("가", 28));
        assertEquals("ASCII 56자 = 28", 1, HeadDocBuilder.wrapLines(repeat('a', 56), 28));
        assertEquals(2, HeadDocBuilder.wrapLines(repeat('a', 57), 28));
        assertEquals(3, HeadDocBuilder.wrapLines(repeat('가', 60), 28));
        assertEquals("\\n 은 줄을 나눈다", 2, HeadDocBuilder.wrapLines("구청장\n(2023.12 ~ 2027.12)", 13));
    }

    @Test
    public void 학력_경력이_없거나_적으면_가장_큰_단계_S3() {
        assertEquals(3, HeadDocBuilder.chooseStage(INFO, true, NONE, NONE));
        assertEquals(3, HeadDocBuilder.chooseStage(INFO, true, rows(2), rows(10)));
        assertEquals("두 절 13행까지 S3", 3, HeadDocBuilder.chooseStage(INFO, true, rows(1), rows(12)));
    }

    @Test
    public void 행이_늘면_단계가_내려가고_넘치면_S0이다() {
        assertEquals("한 절만 15행: S3 는 넘고 S2 는 들어간다", 2, HeadDocBuilder.chooseStage(INFO, true, NONE, rows(15)));
        assertEquals("두 절 14행: S1 도 넘으면 S0", 0, HeadDocBuilder.chooseStage(INFO, true, rows(2), rows(12)));
        assertEquals("어느 단계도 안 들어가면 S0(2쪽으로 넘김)", 0, HeadDocBuilder.chooseStage(INFO, true, rows(10), rows(30)));
    }

    @Test
    public void 단계는_행이_늘수록_커지지_않는다() {
        int prev = 3;
        for (int n = 0; n <= 30; n++) {
            int s = HeadDocBuilder.chooseStage(INFO, true, rows(2), rows(n));
            assertTrue("n=" + n, s <= prev);
            prev = s;
        }
    }

    @Test
    public void 내용이_길면_줄바꿈이_높이에_반영된다() {
        List<String> shortRows = rows(5);
        List<String> longRows = new ArrayList<String>(shortRows);
        longRows.set(0, repeat('가', 60));   // 3줄 = +2×5.6
        double a = HeadDocBuilder.estimateMm(3, INFO, true, NONE, shortRows);
        double b = HeadDocBuilder.estimateMm(3, INFO, true, NONE, longRows);
        assertEquals(11.2, b - a, 0.01);
        assertEquals("한 절 14행(239.5mm)은 S3", 3, HeadDocBuilder.chooseStage(INFO, true, NONE, rows(14)));
        List<String> mixed = new ArrayList<String>(rows(14));
        mixed.set(0, repeat('가', 60));   // +11.2mm → 250.7mm
        assertTrue("긴 줄 때문에 S3 보다 작은 단계", HeadDocBuilder.chooseStage(INFO, true, NONE, mixed) < 3);
    }

    @Test
    public void 제목이_길어_두_줄이면_높이에_더하고_단계가_같거나_낮다() {
        String shortTitle = "서울시 가구청 홍길동 구청장 Profile";
        String longTitle = "가나다라마바사아자차카타파하가나다라마바사아자공단 홍길동 이사장 Profile";
        assertEquals(10.3, HeadDocBuilder.estimateMm(longTitle, 3, INFO, true, rows(2), rows(10))
                - HeadDocBuilder.estimateMm(shortTitle, 3, INFO, true, rows(2), rows(10)), 0.01);
        assertEquals("짧은 제목·두 절 13행은 S3", 3, HeadDocBuilder.chooseStage(shortTitle, INFO, true, rows(2), rows(11)));
        assertTrue("긴 제목이면 한 단계 이상 낮다", HeadDocBuilder.chooseStage(longTitle, INFO, true, rows(2), rows(11)) < 3);
    }

    @Test
    public void 정보_줄이_길어_줄바꿈되면_사진보다_높아질_수_있다() {
        List<String> longInfo = new ArrayList<String>();
        for (int i = 0; i < 12; i++) {
            longInfo.add("가나다라마바사아자차카타파하가나다라마바사아자차카");
        }
        double h = HeadDocBuilder.estimateMm(3, longInfo, true, NONE, NONE);
        assertTrue("정보 합이 사진(92.3)보다 높으면 정보 합이 행 높이", h > 23 + 92.3 + 1 + 0.01);
    }

    @Test
    public void 사진이_없으면_정보_줄만_전체_폭으로_센다() {
        double with = HeadDocBuilder.estimateMm(0, INFO, true, NONE, NONE);
        double without = HeadDocBuilder.estimateMm(0, INFO, false, NONE, NONE);
        assertEquals(23 + 44.6, without, 0.01);
        assertTrue(with > without);
    }
}
