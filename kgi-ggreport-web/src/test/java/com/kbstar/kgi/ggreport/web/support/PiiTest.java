package com.kbstar.kgi.ggreport.web.support;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 개인정보 검출 — Python {@code agent/tests/test_pii.py} 의 케이스를 그대로 옮겼다.
 * 회귀 항목 두 개(주민번호 오분류·접두사 하드코딩)가 특히 중요하다.
 */
public class PiiTest {

    @Test
    public void 휴대폰을_찾고_가운데를_가린다() {
        List<Pii.Finding> found = Pii.scan("담당자 연락처는 010-1234-5678 입니다.");
        assertEquals(1, found.size());
        assertEquals("휴대폰", found.get(0).getKind());
        assertEquals("010-****-5678", found.get(0).getValue());
    }

    @Test
    public void 주민등록번호는_뒷자리를_통째로_가린다() {
        List<Pii.Finding> found = Pii.scan("주민번호 901231-1234567 기재");
        assertEquals("주민등록번호", found.get(0).getKind());
        assertFalse("뒷자리가 그대로 노출됐다 — 검사 결과가 2차 유출 경로가 된다",
                found.get(0).getValue().contains("1234567"));
    }

    @Test
    public void 이메일은_로컬파트_첫_글자만_남긴다() {
        List<Pii.Finding> found = Pii.scan("문의: kim.damdang@example.com");
        assertEquals("이메일", found.get(0).getKind());
        assertTrue(found.get(0).getValue(), found.get(0).getValue().startsWith("k***@"));
    }

    /** 로컬파트가 한 글자여도 안전해야 한다(정규식의 두 번째 그룹이 빈 문자열). */
    @Test
    public void 로컬파트가_한_글자인_이메일() {
        List<Pii.Finding> found = Pii.scan("연락처: k@example.com");
        assertEquals(1, found.size());
        assertEquals("k***@example.com", found.get(0).getValue());
    }

    @Test
    public void 개인정보가_없으면_빈_목록이다() {
        assertTrue(Pii.scan("연락처 표기는 대표번호 02-120으로 통일한다.").isEmpty());
        assertTrue(Pii.scan(null).isEmpty());
        assertTrue(Pii.scan("").isEmpty());
    }

    /**
     * 회귀: {@code 010101-…} 처럼 <b>주민번호 앞자리가 휴대폰 접두사와 같으면</b>
     * 한 값이 두 번 보고된다. 스팬 겹침 검사가 그걸 막는다.
     */
    @Test
    public void 주민번호가_휴대폰으로_중복_검출되지_않는다() {
        List<Pii.Finding> found = Pii.scan("주민번호 010101-1234567 기재");
        assertEquals("한 값이 두 번 보고됐다: " + found, 1, found.size());
        assertEquals("주민등록번호", found.get(0).getKind());
        assertFalse(found.get(0).getValue().contains("1234567"));
    }

    /** 회귀: 접두사를 {@code 010} 으로 박아 두면 011 사용자가 010 으로 둔갑한다. */
    @Test
    public void 휴대폰_접두사_011이_보존된다() {
        List<Pii.Finding> found = Pii.scan("연락처 011-1234-5678");
        assertEquals(1, found.size());
        assertEquals("011-****-5678", found.get(0).getValue());
    }

    @Test
    public void 외국인등록번호는_뒷자리를_통째로_가린다() {
        List<Pii.Finding> found = Pii.scan("외국인 901231-5234567 등록");
        assertEquals(1, found.size());
        assertEquals("외국인등록번호", found.get(0).getKind());
        assertEquals("901231-*******", found.get(0).getValue());
        assertEquals("외국인등록번호", Pii.scan("990101-8234567").get(0).getKind());   // 8로 시작하는 뒷자리도
    }

    /** 앞자리가 휴대폰 접두사(010)와 같아도 한 값이 두 번 보고되지 않는다. */
    @Test
    public void 외국인등록번호가_휴대폰으로_중복_검출되지_않는다() {
        List<Pii.Finding> found = Pii.scan("010101-5234567");
        assertEquals(String.valueOf(found), 1, found.size());
        assertEquals("외국인등록번호", found.get(0).getKind());
    }

    @Test
    public void 잘못된_날짜의_주민번호_모양은_검출하지_않는다() {
        assertTrue(Pii.scan("991332-1234567").isEmpty());   // 13월
        assertTrue(Pii.scan("990100-1234567").isEmpty());   // 0일
        assertTrue(Pii.scan("990132-1234567").isEmpty());   // 32일
        assertTrue(Pii.scan("991332-5234567").isEmpty());   // 외국인 모양도 날짜 검사
    }

    @Test
    public void 긴_숫자열_속에서는_오탐하지_않는다() {
        assertTrue(Pii.scan("1901231-1234567").isEmpty());   // 앞에 숫자가 붙음
        assertTrue(Pii.scan("901231-12345678").isEmpty());   // 뒤에 숫자가 붙음
        assertTrue(Pii.scan("01012345678901").isEmpty());    // 휴대폰 뒤에 숫자가 붙음
        assertTrue(Pii.scan("20101234567").isEmpty());       // 휴대폰 앞에 숫자가 붙음
    }

    @Test
    public void Luhn_유효한_카드번호는_앞4_뒤4만_남긴다() {
        List<Pii.Finding> found = Pii.scan("카드 4111-1111-1111-1111 결제");
        assertEquals(1, found.size());
        assertEquals("카드번호", found.get(0).getKind());
        assertEquals("4111-****-****-1111", found.get(0).getValue());
        assertEquals("5500-****-****-0004", Pii.scan("5500 0000 0000 0004").get(0).getValue());   // 공백 구분자
    }

    @Test
    public void Luhn_무효인_16자리는_카드번호가_아니다() {
        assertTrue(Pii.scan("4111-1111-1111-1112").isEmpty());
        assertTrue(Pii.scan("1234-5678-9012-3456").isEmpty());
    }

    @Test
    public void 카드번호_앞뒤에_숫자가_붙으면_검출하지_않는다() {
        assertTrue(Pii.scan("94111-1111-1111-1111").isEmpty());
        assertTrue(Pii.scan("4111-1111-1111-11119").isEmpty());
    }

    /** 신규 종류는 기존 셋 뒤에 붙는다 — 주민→휴대폰→이메일→외국인→카드. */
    @Test
    public void 검출_순서는_기존_뒤에_신규가_붙는다() {
        List<Pii.Finding> found = Pii.scan(
                "카드 4111-1111-1111-1111, 외국인 901231-5234567, a@b.com, 010-1234-5678, 주민 901231-1234567");
        assertEquals("[주민등록번호=901231-*******, 휴대폰=010-****-5678, 이메일=a***@b.com, "
                + "외국인등록번호=901231-*******, 카드번호=4111-****-****-1111]", found.toString());
    }
}
