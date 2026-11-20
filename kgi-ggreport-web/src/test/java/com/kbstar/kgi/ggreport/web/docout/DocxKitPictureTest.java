package com.kbstar.kgi.ggreport.web.docout;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** DocModel.Picture + DocxKit 그림 넣기(추가만 — 기존 블록·시그니처 무변경, e4 11-20). */
public class DocxKitPictureTest {
    private static byte[] jpeg(int w, int h, int seed) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                img.setRGB(x, y, (((x * 7 + seed) & 255) << 16) | (((y * 5 + seed) & 255) << 8) | seed);
            }
        }
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", o);
        return o.toByteArray();
    }

    @Test
    public void 본문과_표_칸_안의_그림이_모두_들어가고_문서가_열린다() throws Exception {
        DocModel.Picture top = DocModel.Picture.jpeg(jpeg(60, 80, 3), 30, 40, "본문 그림");
        DocModel.Picture inCell = DocModel.Picture.jpeg(jpeg(30, 40, 200), 30, 40, "칸 그림");
        List<DocModel.Block> cellBlocks = new ArrayList<DocModel.Block>();
        cellBlocks.add(inCell);
        cellBlocks.add(DocModel.Para.plain("캡션"));
        List<List<DocModel.Cell>> rows = new ArrayList<List<DocModel.Cell>>();
        rows.add(Arrays.asList(DocModel.Cell.header("머리"), DocModel.Cell.of(cellBlocks)));
        DocModel doc = new DocModel(Arrays.<DocModel.Block>asList(top, new DocModel.Table(2, null, rows, 0, false)));
        byte[] b = DocxKit.render(doc, null);
        try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(b))) {
            assertEquals(2, d.getAllPictures().size());
            assertEquals(1, d.getTables().size());
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void 크기가_범위_밖이면_거부한다() throws Exception {
        DocModel.Picture.jpeg(jpeg(10, 10, 1), 0, 40, "x");
    }

    @Test
    public void 그림이_없는_기존_문서는_그대로다() {
        byte[] b = DocxKit.render(new DocModel(Collections.<DocModel.Block>singletonList(DocModel.Para.plain("본문"))), null);
        assertTrue(b.length > 0);
    }
}
