package com.kb.uploader.service;

import com.kb.uploader.dto.ParsedFileName;
import org.junit.Test;
import java.util.Optional;
import static org.junit.Assert.*;

public class FileParserServiceTest {

    private final FileParserService sut = new FileParserService();

    @Test
    public void 정상_파일명_파싱() {
        Optional<ParsedFileName> result = sut.parse("2024_서울대학교_보고서.pdf");
        assertTrue(result.isPresent());
        assertEquals("2024", result.get().getYear());
        assertEquals("서울대학교", result.get().getInstitutionName());
        assertEquals("보고서", result.get().getDescription());
        assertEquals("pdf", result.get().getExtension());
    }

    @Test
    public void 설명에_언더스코어_포함시_기관명만_두번째_토큰() {
        Optional<ParsedFileName> result = sut.parse("2024_서울대학교_2024년_연간보고서.pdf");
        assertTrue(result.isPresent());
        assertEquals("서울대학교", result.get().getInstitutionName());
        assertEquals("2024년_연간보고서", result.get().getDescription());
    }

    @Test
    public void 년도가_4자리_숫자_아니면_빈_Optional() {
        assertFalse(sut.parse("년도없는_서울대학교_보고서.pdf").isPresent());
        assertFalse(sut.parse("24_서울대학교_보고서.pdf").isPresent());
        assertFalse(sut.parse("abcd_서울대학교_보고서.pdf").isPresent());
    }

    @Test
    public void 구분자_2개_미만이면_빈_Optional() {
        assertFalse(sut.parse("2024_서울대학교.pdf").isPresent());
        assertFalse(sut.parse("2024.pdf").isPresent());
    }

    @Test
    public void 허용되지_않은_확장자는_빈_Optional() {
        assertFalse(sut.parse("2024_서울대학교_보고서.xlsx").isPresent());
        assertFalse(sut.parse("2024_서울대학교_보고서.txt").isPresent());
    }

    @Test
    public void 파일명이_null이면_빈_Optional() {
        assertFalse(sut.parse(null).isPresent());
    }
}
