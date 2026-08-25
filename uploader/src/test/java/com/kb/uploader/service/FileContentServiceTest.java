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

    @Test
    public void hwp_파일_null_반환() throws Exception {
        File hwp = tempFolder.newFile("test.hwp");
        Files.write(hwp.toPath(), "dummy".getBytes());

        assertNull(sut.extractText(hwp.getAbsolutePath()));
    }

    @Test
    public void 존재하지_않는_파일_null_반환() {
        assertNull(sut.extractText("/nonexistent/path/file.md"));
    }
}
