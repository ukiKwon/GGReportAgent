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
}
