package com.kb.uploader.parse;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;

/** NEXT 39: pptx 는 POI 로 열기 전에 ZipGuard 검사. */
public class PptExtractorTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static byte[] pptx() throws Exception {
        try (XMLSlideShow s = new XMLSlideShow()) {
            s.createSlide().createTextBox().setText("안녕 제안");
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            s.write(o);
            return o.toByteArray();
        }
    }

    @Test
    public void 정상_pptx_통과() throws Exception {
        Path p = tmp.newFile("a.pptx").toPath();
        Files.write(p, pptx());
        assertEquals(1, new PptExtractor().extract(p).size());
    }

    @Test(expected = IOException.class)
    public void 중복_entry_pptx는_거부() throws Exception {
        Path p = tmp.newFile("d.pptx").toPath();
        Files.write(p, ZipFixtures.duplicateEntry(pptx(), "[Content_Types].xml"));
        new PptExtractor().extract(p);
    }
}
