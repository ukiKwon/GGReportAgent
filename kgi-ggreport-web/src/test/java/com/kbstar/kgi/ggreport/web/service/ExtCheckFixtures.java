package com.kbstar.kgi.ggreport.web.service;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** 외부 확인 반입 시험 자료 — 전부 코드에서 만든다. 번호·메일은 가상이다. */
public final class ExtCheckFixtures {
    private ExtCheckFixtures() {
    }

    public static final String PHONE = "010-1234-5678";
    /** 대표번호(1588-1234)만 든 평범한 글. 쪽당 30자를 충분히 넘는다. */
    public static final String PLAIN = "Safe deposit tender notice for the district office. Public contact line 1588-1234. "
            + "Please submit documents by the deadline.";

    public interface Cust {
        void apply(PDDocument d) throws IOException;
    }

    public static byte[] build(int pages, String text, Cust c) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                PDPage p = new PDPage();
                doc.addPage(p);
                if (text != null) {
                    try (PDPageContentStream cs = new PDPageContentStream(doc, p)) {
                        cs.beginText();
                        cs.setFont(PDType1Font.HELVETICA, 10);
                        cs.newLineAtOffset(40, 700);
                        cs.showText(text);
                        cs.endText();
                    }
                }
            }
            if (c != null) {
                c.apply(doc);
            }
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            doc.save(o);
            return o.toByteArray();
        }
    }

    public static byte[] pdf(String text) throws IOException {
        return build(1, text, null);
    }

    public static byte[] pdfAuthor(String author) throws IOException {
        return build(1, PLAIN, d -> d.getDocumentInformation().setAuthor(author));
    }

    public static byte[] pdfJs() throws IOException {
        return build(1, PLAIN, d -> d.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert('x')")));
    }

    public static byte[] pdfEncrypted() throws IOException {
        return build(1, PLAIN, d -> {
            StandardProtectionPolicy sp = new StandardProtectionPolicy("owner-pw-x", "user-pw-x", new AccessPermission());
            sp.setEncryptionKeyLength(128);
            d.protect(sp);
        });
    }

    /** 새 판을 덧붙인 것처럼 startxref 가 두 번 나온다(증분 저장의 표지). */
    public static byte[] pdfIncremental() throws IOException {
        byte[] a = pdf(PLAIN);
        byte[] tail = "\nstartxref\n0\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        byte[] r = new byte[a.length + tail.length];
        System.arraycopy(a, 0, r, 0, a.length);
        System.arraycopy(tail, 0, r, a.length, tail.length);
        return r;
    }

    public static byte[] pdfImageOnly() throws IOException {
        return build(1, null, d -> {
            PDPage page = d.getPage(0);
            PDImageXObject img = LosslessFactory.createFromImage(d, new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB));
            try (PDPageContentStream cs = new PDPageContentStream(d, page, PDPageContentStream.AppendMode.APPEND, true)) {
                cs.drawImage(img, 10, 10);
            }
        });
    }

    /** 이미지가 Form XObject 안에만 있는 쪽(하-6). */
    public static byte[] pdfFormImage() throws IOException {
        return build(1, null, d -> {
            PDImageXObject img = LosslessFactory.createFromImage(d, new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB));
            PDAppearanceStream form = new PDAppearanceStream(d);
            form.setBBox(new PDRectangle(0, 0, 100, 100));
            form.setResources(new PDResources());
            try (PDPageContentStream fcs = new PDPageContentStream(d, form)) {
                fcs.drawImage(img, 0, 0);
            }
            try (PDPageContentStream cs = new PDPageContentStream(d, d.getPage(0), PDPageContentStream.AppendMode.APPEND, true)) {
                cs.drawForm(form);
            }
        });
    }

    /** 내용 스트림에 BI…ID…EI 인라인 이미지만 둔 쪽. */
    public static byte[] pdfInlineImage() throws IOException {
        return build(1, null, d -> {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            bo.write("q 10 0 0 10 20 20 cm\nBI /W 1 /H 1 /BPC 8 /CS /G ID ".getBytes(StandardCharsets.US_ASCII));
            bo.write(0x80);
            bo.write("\nEI Q\n".getBytes(StandardCharsets.US_ASCII));
            PDStream s = new PDStream(d);
            try (OutputStream os = s.createOutputStream(COSName.FLATE_DECODE)) {
                os.write(bo.toByteArray());
            }
            d.getPage(0).setContents(s);
        });
    }

    /** 본문은 평범하고 링크 주석의 URI 에만 값이 있는 쪽. */
    public static byte[] pdfLinkUri(String uri) throws IOException {
        return build(1, PLAIN, d -> {
            PDAnnotationLink l = new PDAnnotationLink();
            l.setRectangle(new PDRectangle(10, 10, 20, 20));
            PDActionURI a = new PDActionURI();
            a.setURI(uri);
            l.setAction(a);
            List<PDAnnotation> list = new ArrayList<PDAnnotation>();
            list.add(l);
            d.getPage(0).setAnnotations(list);
        });
    }

    public static byte[] pdfPages(int n) throws IOException {
        return build(n, null, null);
    }

    public static byte[] pdfBookmark(String title) throws IOException {
        return build(1, PLAIN, d -> {
            PDDocumentOutline o = new PDDocumentOutline();
            d.getDocumentCatalog().setDocumentOutline(o);
            PDOutlineItem it = new PDOutlineItem();
            it.setTitle(title);
            o.addLast(it);
        });
    }

    public static byte[] pdfAnnot(String contents) throws IOException {
        return build(1, PLAIN, d -> {
            PDAnnotationText a = new PDAnnotationText();
            a.setContents(contents);
            a.setRectangle(new PDRectangle(10, 10, 20, 20));
            List<PDAnnotation> l = new ArrayList<PDAnnotation>();
            l.add(a);
            d.getPage(0).setAnnotations(l);
        });
    }

    /** zip 을 코드로 쓴다. 이름 검사를 하지 않는 ZipOutputStream 이라 ../ 같은 이름도 넣을 수 있다. */
    public static final class Zip {
        private final ByteArrayOutputStream bo = new ByteArrayOutputStream();
        private final ZipOutputStream z = new ZipOutputStream(bo);

        public Zip add(String name, String text) throws IOException {
            return addBytes(name, text.getBytes(StandardCharsets.UTF_8));
        }

        public Zip addBytes(String name, byte[] b) throws IOException {
            z.putNextEntry(new ZipEntry(name));
            z.write(b);
            z.closeEntry();
            return this;
        }

        public byte[] bytes() throws IOException {
            z.close();
            return bo.toByteArray();
        }
    }

    public static final String LONG_BODY = PLAIN + " " + PLAIN;

    public static Zip hwpx(String body) throws IOException {
        return new Zip().add("mimetype", "application/hwp+zip").add("version.xml", "<v/>")
                .add("Contents/section0.xml", "<sec><p><t>" + body + "</t></p></sec>");
    }
}
