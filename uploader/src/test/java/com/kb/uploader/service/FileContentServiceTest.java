package com.kb.uploader.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import static org.junit.Assert.*;

public class FileContentServiceTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private FileContentService sut;

    @Before
    public void setUp() {
        sut = new FileContentService();
    }

    @Test
    public void md_파일_텍스트_추출() throws Exception {
        File md = tempFolder.newFile("test.md");
        Files.write(md.toPath(), "# 제목\n내용".getBytes(StandardCharsets.UTF_8));

        String result = sut.extractText(md.getAbsolutePath());

        assertEquals("# 제목\n내용", result);
    }

    @Test
    public void pdf_파일_텍스트_추출() throws Exception {
        File pdf = tempFolder.newFile("test.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(PDType1Font.HELVETICA, 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("quarterly report content");
                cs.endText();
            }
            doc.save(pdf);
        }

        String result = sut.extractText(pdf.getAbsolutePath());

        assertNotNull(result);
        assertTrue(result.contains("quarterly report content"));
    }

    // ── 못 뽑으면 언제나 null (2026-08-27 사용자 승인) ──────────────────────
    //
    // 종전에는 실패를 대괄호 안내 문자열로 돌려줬고, 이 테스트가 그걸 **계약으로**
    // 고정하고 있었다. 두 가지가 문제였다:
    //   ⓐ 호출부가 실패를 판정할 방법이 문자열 대조뿐 — 문구 한 글자에 조용히 깨진다.
    //      JSON API 재정의의 parseDoc 은 "실패하면 .md 를 만들지 않고 null 반환"이라
    //      이 판정이 꼭 필요하다.
    //   ⓑ 실패 메시지에 **서버 파일 경로**가 담겨 응답으로 그대로 나갔다.
    // 바꾸지 못했던 이유(= /api/files/search 의 content 가 그 문자열을 싣고 있었다)는
    // 그 API 가 재정의로 삭제되면서 사라졌다 — 운영 호출부 0건.

    @Test
    public void hwp_바이너리는_null() throws Exception {
        File hwp = tempFolder.newFile("test.hwp");
        Files.write(hwp.toPath(), "dummy".getBytes());

        assertNull("HWP 바이너리는 아직 미지원이다 — 안내 문자열이 아니라 null 이어야"
                        + " parseDoc 이 '실패'로 판정한다",
                sut.extractText(hwp.getAbsolutePath()));
    }

    @Test
    public void 추출_실패는_null이고_경로가_새지_않는다() {
        String result = sut.extractText("/nonexistent/path/file.md");

        assertNull("실패는 null 이다. 실제: " + result, result);
        // 사유는 로그에만 남긴다 — 반환값·응답·파일에는 싣지 않는다.
    }

    @Test
    public void 지원하지_않는_확장자도_null() {
        assertNull(sut.extractText("/some/path/file.zip"));
        assertNull(sut.extractText(null));
    }
}
