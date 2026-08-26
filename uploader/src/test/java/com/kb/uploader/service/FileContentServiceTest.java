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

    // 아래 두 건은 종전에 null 을 기대했으나 실제 동작과 어긋나 실패하고 있었다.
    // FileContentService 는 "왜 본문이 없는지"를 호출부(FileSearchApiController 의
    // FileItem.content)가 구분할 수 있도록 대괄호로 감싼 안내 문자열을 돌려준다.
    // 서비스가 아니라 테스트를 실제 계약에 맞춘다 — 서비스를 null 로 되돌리면 이미
    // 나가고 있는 API 응답의 의미가 바뀐다.

    @Test
    public void hwp_파일_미지원_안내_반환() throws Exception {
        File hwp = tempFolder.newFile("test.hwp");
        Files.write(hwp.toPath(), "dummy".getBytes());

        assertEquals("[HWP 바이너리 형식 - 텍스트 추출 미지원]",
                     sut.extractText(hwp.getAbsolutePath()));
    }

    @Test
    public void 존재하지_않는_파일_실패_안내_반환() {
        String result = sut.extractText("/nonexistent/path/file.md");

        assertNotNull(result);
        assertTrue("추출 실패는 대괄호 안내 문자열로 돌아온다. 실제: " + result,
                   result.startsWith("[텍스트 추출 실패:"));
    }

    @Test
    public void 지원하지_않는_확장자는_null_반환() {
        // 안내 문자열을 돌려주는 것은 "추출을 시도했는데 안 된" 경우다.
        // 애초에 다루지 않는 확장자는 그대로 null 이다 — 이 구분을 고정해 둔다.
        assertNull(sut.extractText("/some/path/file.zip"));
        assertNull(sut.extractText(null));
    }
}
