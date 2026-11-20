package com.kbstar.kgi.ggreport.web.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** 작업함 파일 글 추출(NEXT 106) — 손으로 만든 최소 pptx·PDFBox 로 만든 PDF. 파일은 디스크에 쓰지 않는다. */
public class TaskDocExtractorTest {

    private static final String NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
    private static final String NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CT_OK = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
            + "<Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>";

    private static long deadline() {
        return System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
    }

    private static String slide(String text) {
        return "<p:sld xmlns:p=\"" + NS_P + "\" xmlns:a=\"" + NS_A + "\"><p:txBody><a:p><a:r><a:t>" + text + "</a:t></a:r></a:p></p:txBody></p:sld>";
    }

    private static String presentation(boolean withOrder) {
        return "<p:presentation xmlns:p=\"" + NS_P + "\" xmlns:r=\"" + NS_R + "\">"
                + (withOrder ? "<p:sldIdLst><p:sldId id=\"256\" r:id=\"rId3\"/><p:sldId id=\"257\" r:id=\"rId2\"/></p:sldIdLst>" : "")
                + "</p:presentation>";
    }

    private static final String PRES_RELS = "<Relationships xmlns=\"" + NS_REL + "\">"
            + "<Relationship Id=\"rId2\" Type=\"x\" Target=\"slides/slide1.xml\"/>"
            + "<Relationship Id=\"rId3\" Type=\"x\" Target=\"slides/slide2.xml\"/></Relationships>";

    private static final String NOTE_RELS = "<Relationships xmlns=\"" + NS_REL + "\">"
            + "<Relationship Id=\"rId1\" Type=\"x\" Target=\"../slides/slide1.xml\"/></Relationships>";

    private static final String CORE = "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\""
            + " xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>문서제목</dc:title></cp:coreProperties>";

    /** 이름→내용(문자열 또는 byte[]) 순서대로 zip 으로 만든다. 이름이 겹쳐도(대소문자 다름) 그대로 쓴다. */
    private static byte[] zip(Object... nameThenContent) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bos)) {
            for (int i = 0; i < nameThenContent.length; i += 2) {
                z.putNextEntry(new ZipEntry((String) nameThenContent[i]));
                Object c = nameThenContent[i + 1];
                z.write(c instanceof byte[] ? (byte[]) c : ((String) c).getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        return bos.toByteArray();
    }

    private static byte[] basePptx(boolean withOrder, Object... extra) throws IOException {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("[Content_Types].xml", CT_OK);
        m.put("ppt/presentation.xml", presentation(withOrder));
        m.put("ppt/_rels/presentation.xml.rels", PRES_RELS);
        m.put("ppt/slides/slide1.xml", slide("도봉구 사례"));
        m.put("ppt/slides/slide2.xml", slide("둘째 장"));
        m.put("ppt/notesSlides/notesSlide1.xml", slide("노트 내용"));
        m.put("ppt/notesSlides/_rels/notesSlide1.xml.rels", NOTE_RELS);
        m.put("docProps/core.xml", CORE);
        for (int i = 0; i < extra.length; i += 2) {
            m.put((String) extra[i], extra[i + 1]);
        }
        Object[] flat = new Object[m.size() * 2];
        int k = 0;
        for (Map.Entry<String, Object> e : m.entrySet()) {
            flat[k++] = e.getKey();
            flat[k++] = e.getValue();
        }
        return zip(flat);
    }

    private static TaskDocExtractor.Part find(TaskDocExtractor.Extracted ex, String kind, int no) {
        for (TaskDocExtractor.Part p : ex.parts) {
            if (p.kind.equals(kind) && p.no == no) {
                return p;
            }
        }
        return null;
    }

    @Test
    public void pptx는_보이는_순서로_번호를_매기고_노트와_문서정보를_가른다() throws IOException {
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pptx", basePptx(true), deadline());
        assertEquals(TaskDocExtractor.DONE, ex.state);
        assertFalse(ex.orderApprox);
        TaskDocExtractor.Part s = find(ex, "SLIDE", 2);   // slide1.xml 이 sldIdLst 에서 둘째
        assertNotNull(s);
        assertTrue(s.text.contains("도봉구"));
        assertTrue(find(ex, "SLIDE", 1).text.contains("둘째"));
        assertTrue(find(ex, "NOTE", 2).text.contains("노트"));
        assertTrue(find(ex, "META", 0).text.contains("문서제목"));
    }

    @Test
    public void 슬라이드_순서_정보가_없으면_파일_번호를_쓰고_근사로_표시한다() throws IOException {
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pptx", basePptx(false), deadline());
        assertEquals(TaskDocExtractor.DONE, ex.state);
        assertTrue(ex.orderApprox);
        assertNotNull(find(ex, "SLIDE", 1));
    }

    @Test
    public void 번호가_넘치는_슬라이드는_OTHER_0이고_예외가_없다() throws IOException {
        byte[] d = basePptx(true, "ppt/slides/slide99999999.xml", slide("넘침"));
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pptx", d, deadline());
        assertEquals(TaskDocExtractor.DONE, ex.state);
        assertTrue(find(ex, "OTHER", 0).text.contains("넘침"));
    }

    @Test
    public void 매크로는_ACTIVE_CONTENT다() throws IOException {
        TaskDocExtractor.Extracted a = TaskDocExtractor.extract("pptx", basePptx(true, "ppt/vbaProject.bin", new byte[]{1, 2}), deadline());
        assertEquals("ACTIVE_CONTENT", a.reason);
        assertTrue(a.unsafe());
        assertFalse(a.parsed());
        String macroCt = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml\"/></Types>";
        byte[] d = zip("[Content_Types].xml", macroCt, "ppt/presentation.xml", presentation(true));
        assertEquals("ACTIVE_CONTENT", TaskDocExtractor.extract("pptx", d, deadline()).reason);
    }

    @Test
    public void 대소문자만_다른_같은_이름은_BROKEN이다() throws IOException {
        byte[] d = basePptx(true, "PPT/slides/slide1.xml", slide("같은 이름"));
        assertEquals("BROKEN", TaskDocExtractor.extract("pptx", d, deadline()).reason);
    }

    @Test
    public void 마감이_지났으면_TIMEOUT이다() throws IOException {
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pptx", basePptx(true), System.nanoTime() - 1);
        assertEquals("TIMEOUT", ex.reason);
        assertTrue(ex.inconclusive());
    }

    @Test
    public void 항목_하나가_30MB를_넘으면_TOO_LARGE다() throws IOException {
        byte[] big = new byte[31 * 1024 * 1024];
        Arrays.fill(big, (byte) 'a');
        String head = "<p:sld xmlns:p=\"" + NS_P + "\">";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bos.write(head.getBytes(StandardCharsets.UTF_8));
        bos.write(big);
        bos.write("</p:sld>".getBytes(StandardCharsets.UTF_8));
        byte[] d = zip("[Content_Types].xml", CT_OK, "ppt/presentation.xml", presentation(true),
                "ppt/slides/slide1.xml", bos.toByteArray());
        assertEquals("TOO_LARGE", TaskDocExtractor.extract("pptx", d, deadline()).reason);
    }

    @Test
    public void 그림과_끼워넣은_개체는_표시만_하고_점검은_된다() throws IOException {
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pptx",
                basePptx(true, "ppt/media/image1.png", new byte[]{1}, "ppt/embeddings/x.xlsx", new byte[]{2}), deadline());
        assertEquals(TaskDocExtractor.DONE, ex.state);
        assertTrue(ex.hasImages);
        assertTrue(ex.hasEmbedded);
    }

    @Test
    public void 읽지_않는_형식과_맞지_않는_머리말() {
        assertEquals("FORMAT_UNSUPPORTED", TaskDocExtractor.extract("ppt", null, 0L).reason);
        assertEquals("IMAGE_ONLY", TaskDocExtractor.extract("png", null, 0L).reason);
        assertEquals("IMAGE_ONLY", TaskDocExtractor.extract("jpeg", null, 0L).reason);
        assertEquals("ARCHIVE", TaskDocExtractor.extract("zip", null, 0L).reason);
        assertEquals("FORMAT_MISMATCH", TaskDocExtractor.extract("pptx", "abc".getBytes(StandardCharsets.UTF_8), deadline()).reason);
        assertEquals("FORMAT_MISMATCH", TaskDocExtractor.extract("pdf", "abc".getBytes(StandardCharsets.UTF_8), deadline()).reason);
    }

    // ── pdf ──

    private static PDDocument twoPages() throws IOException {
        PDDocument doc = new PDDocument();
        String[] texts = {"Seocho page one", "Second page"};
        for (String t : texts) {
            PDPage p = new PDPage(PDRectangle.A4);
            doc.addPage(p);
            try (PDPageContentStream cs = new PDPageContentStream(doc, p)) {
                cs.beginText();
                cs.setFont(PDType1Font.HELVETICA, 12);
                cs.newLineAtOffset(50, 700);
                cs.showText(t);
                cs.endText();
            }
        }
        return doc;
    }

    private static byte[] save(PDDocument doc) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        doc.save(bos);
        doc.close();
        return bos.toByteArray();
    }

    @Test
    public void pdf는_쪽마다_글을_뽑는다() throws IOException {
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pdf", save(twoPages()), deadline());
        assertEquals(TaskDocExtractor.DONE, ex.state);
        assertTrue(find(ex, "PAGE", 1).text.contains("Seocho"));
        assertTrue(find(ex, "PAGE", 2).text.contains("Second"));
    }

    @Test
    public void pdf_자바스크립트는_ACTIVE_CONTENT다() throws IOException {
        PDDocument doc = twoPages();
        doc.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert(1)"));
        TaskDocExtractor.Extracted ex = TaskDocExtractor.extract("pdf", save(doc), deadline());
        assertEquals("ACTIVE_CONTENT", ex.reason);
        assertTrue(ex.unsafe());
    }

    @Test
    public void 암호_pdf는_ENCRYPTED다() throws IOException {
        PDDocument doc = twoPages();
        StandardProtectionPolicy spp = new StandardProtectionPolicy("owner-pw", "user-pw", new AccessPermission());
        spp.setEncryptionKeyLength(128);
        doc.protect(spp);
        assertEquals("ENCRYPTED", TaskDocExtractor.extract("pdf", save(doc), deadline()).reason);
    }

    @Test
    public void PDF_이름_찾기는_뒤_글자가_이름_글자면_다른_이름이다() {
        byte[] a = "x /JavaScript\n".getBytes(StandardCharsets.ISO_8859_1);
        byte[] b = "x /JavaScriptX\n".getBytes(StandardCharsets.ISO_8859_1);
        assertTrue(TaskDocExtractor.hasName(a, "/JavaScript"));
        assertFalse(TaskDocExtractor.hasName(b, "/JavaScript"));
        assertTrue(TaskDocExtractor.hasName("/EmbeddedFile".getBytes(StandardCharsets.ISO_8859_1), "/EmbeddedFile"));
    }
}
