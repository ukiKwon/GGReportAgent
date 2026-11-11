package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.metadata.IIOMetadata;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 기관장 사진 검사기(NEXT 72·77) — 시험 입력은 전부 이 테스트가 만든다(바이너리 파일 없음).
 * 메타데이터·꼬리 데이터를 끼운 JPEG/PNG 가 서버가 다시 만든 깨끗한 JPEG 로 나오는지, 크기 상한·하한·손상, 대기열(503)·시간 초과(abort).
 */
public class HeadPhotoInspectorTest {

    // ── 시험 입력 만들기 ─────────────────────────────────────────────────

    private static BufferedImage gradient(int w, int h, int type) {
        BufferedImage img = new BufferedImage(w, h, type);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int r = (x * 255) / w;
                int g = (y * 255) / h;
                img.setRGB(x, y, (0xFF << 24) | (r << 16) | (g << 8) | 0x80);
            }
        }
        return img;
    }

    private static byte[] write(BufferedImage img, String fmt) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(img, fmt, bos));
        return bos.toByteArray();
    }

    private static byte[] jpeg(int w, int h) throws IOException {
        return write(gradient(w, h, BufferedImage.TYPE_INT_RGB), "jpg");
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        for (byte[] p : parts) {
            bos.write(p, 0, p.length);
        }
        return bos.toByteArray();
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.ISO_8859_1);
    }

    /** JPEG 마커 세그먼트 — FF marker len(2) payload. */
    private static byte[] seg(int marker, byte[] payload) {
        int len = payload.length + 2;
        return concat(new byte[]{(byte) 0xFF, (byte) marker, (byte) (len >> 8), (byte) len}, payload);
    }

    /** 첫 APP0(JFIF) 바로 뒤에 세그먼트들을 끼운다. */
    private static byte[] insertAfterApp0(byte[] jpeg, byte[]... segs) {
        assertEquals(0xE0, jpeg[3] & 0xFF);
        int app0Len = ((jpeg[4] & 0xFF) << 8) | (jpeg[5] & 0xFF);
        int at = 2 + 2 + app0Len;
        byte[] head = Arrays.copyOfRange(jpeg, 0, at);
        byte[] tail = Arrays.copyOfRange(jpeg, at, jpeg.length);
        return concat(head, concat(segs), tail);
    }

    private static byte[] zip() throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bos)) {
            z.putNextEntry(new ZipEntry("secret.txt"));
            z.write(ascii("hidden payload"));
            z.closeEntry();
        }
        return bos.toByteArray();
    }

    private static byte[] pngChunk(String type, byte[] data) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bos);
        out.writeInt(data.length);
        byte[] t = ascii(type);
        out.write(t);
        out.write(data);
        CRC32 crc = new CRC32();
        crc.update(t);
        crc.update(data);
        out.writeInt((int) crc.getValue());
        return bos.toByteArray();
    }

    private static byte[] deflate(byte[] raw) {
        Deflater d = new Deflater();
        d.setInput(raw);
        d.finish();
        byte[] buf = new byte[1024];
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        while (!d.finished()) {
            int n = d.deflate(buf);
            bos.write(buf, 0, n);
        }
        d.end();
        return bos.toByteArray();
    }

    private static String latin(byte[] b) {
        return new String(b, StandardCharsets.ISO_8859_1);
    }

    private static String codeOf(ApiException e) {
        return String.valueOf(((Map<?, ?>) e.getDetailObject()).get("code"));
    }

    // ── 37·38·39 ─────────────────────────────────────────────────────────

    @Test
    public void 메타데이터와_꼬리를_끼운_JPEG는_깨끗한_JPEG로_다시_만들어진다() throws Exception {
        byte[] base = jpeg(300, 400);
        byte[] exif = seg(0xE1, concat(ascii("Exif\0\0"), ascii("GPSMARKERTEST")));
        byte[] com = seg(0xFE, ascii("COMMENTTEST"));
        byte[] icc = seg(0xE2, concat(ascii("ICC_PROFILE\0"), new byte[]{1, 1}, ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData()));
        byte[] ps = seg(0xED, ascii("Photoshop 3.0\0"));
        byte[] dirty = concat(insertAfterApp0(base, exif, com, icc, ps), zip());
        String dirtyText = latin(dirty);
        assertTrue("시험 입력에 표지가 들어 있어야 의미가 있다",
                dirtyText.contains("GPSMARKERTEST") && dirtyText.contains("COMMENTTEST") && dirtyText.contains("ICC_PROFILE")
                        && dirtyText.contains("Photoshop") && dirtyText.contains("PK\3\4"));

        HeadPhotoInspector.Result r = HeadPhotoInspector.inspect("jpg", dirty);

        HeadPhotoInspector.requireCleanJpeg(r.jpeg);   // 마커 허용 목록·EOI 뒤 0바이트
        assertAllowedMarkersOnly(r.jpeg);
        assertEquals(0xFF, r.jpeg[r.jpeg.length - 2] & 0xFF);
        assertEquals(0xD9, r.jpeg[r.jpeg.length - 1] & 0xFF);
        String out = latin(r.jpeg);
        for (String bad : new String[]{"Exif", "ICC_PROFILE", "Photoshop", "PK\3\4", "GPSMARKERTEST", "COMMENTTEST", "secret.txt"}) {
            assertFalse("저장본에 남으면 안 된다: " + bad, out.contains(bad));
        }
        assertTrue(r.width <= 600 && r.height <= 800);
        assertNotEquals(HeadPhotoService.sha256(dirty), HeadPhotoService.sha256(r.jpeg));
        BufferedImage back = ImageIO.read(new ByteArrayInputStream(r.jpeg));
        assertNotNull("다시 읽혀야 한다", back);
        assertEquals(r.width, back.getWidth());
        assertEquals(r.height, back.getHeight());
    }

    private static void assertAllowedMarkersOnly(byte[] b) {
        Set<Integer> ok = new HashSet<>(Arrays.asList(0xD8, 0xE0, 0xDB, 0xC0, 0xC4, 0xDA, 0xD9));
        int i = 2;
        assertEquals(0xD8, b[1] & 0xFF);
        while (i + 4 <= b.length) {
            assertEquals(0xFF, b[i] & 0xFF);
            int m = b[i + 1] & 0xFF;
            assertTrue("허용 밖 마커 " + Integer.toHexString(m), ok.contains(m));
            int len = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
            i += 2 + len;
            if (m == 0xDA) {
                return;
            }
        }
        fail("SOS 를 못 찾았다");
    }

    @Test
    public void PNG의_텍스트_청크와_IEND_뒤_꼬리는_버려진다() throws Exception {
        byte[] png = write(gradient(300, 400, BufferedImage.TYPE_INT_RGB), "png");
        byte[] iend = Arrays.copyOfRange(png, png.length - 12, png.length);
        byte[] body = Arrays.copyOfRange(png, 0, png.length - 12);
        byte[] text = pngChunk("tEXt", ascii("Comment\0PNGTEXTTEST"));
        byte[] ztxt = pngChunk("zTXt", concat(ascii("Comment\0\0"), deflate(ascii("PNGTEXTTEST zipped"))));
        byte[] itxt = pngChunk("iTXt", concat(ascii("Comment\0\0\0\0\0"), ascii("PNGTEXTTEST intl")));
        byte[] dirty = concat(body, text, ztxt, itxt, iend, zip());
        assertTrue(latin(dirty).contains("PNGTEXTTEST"));

        HeadPhotoInspector.Result r = HeadPhotoInspector.inspect("png", dirty);

        assertEquals(0xFF, r.jpeg[0] & 0xFF);
        assertEquals(0xD8, r.jpeg[1] & 0xFF);
        HeadPhotoInspector.requireCleanJpeg(r.jpeg);
        String out = latin(r.jpeg);
        for (String bad : new String[]{"PNGTEXTTEST", "tEXt", "iTXt", "zTXt", "PK\3\4"}) {
            assertFalse("저장본에 남으면 안 된다: " + bad, out.contains(bad));
        }
    }

    @Test
    public void 완전_투명_PNG는_흰색_배경이_된다() throws Exception {
        BufferedImage clear = new BufferedImage(200, 300, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = clear.createGraphics();
        g.setComposite(java.awt.AlphaComposite.Clear);
        g.fillRect(0, 0, 200, 300);
        g.dispose();

        HeadPhotoInspector.Result r = HeadPhotoInspector.inspect("png", write(clear, "png"));

        BufferedImage back = ImageIO.read(new ByteArrayInputStream(r.jpeg));
        for (int[] xy : new int[][]{{0, 0}, {199, 0}, {0, 299}, {199, 299}, {100, 150}}) {
            Color c = new Color(back.getRGB(xy[0], xy[1]));
            assertTrue("흰색이어야 한다 " + c, c.getRed() >= 250 && c.getGreen() >= 250 && c.getBlue() >= 250);
        }
    }

    // ── 40 ───────────────────────────────────────────────────────────────

    @Test
    public void 머리글만_50000x50000인_PNG는_바로_거부한다() throws Exception {
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        DataOutputStream d = new DataOutputStream(ihdr);
        d.writeInt(50000);
        d.writeInt(50000);
        d.write(new byte[]{8, 2, 0, 0, 0});
        byte[] sig = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        byte[] fake = concat(sig, pngChunk("IHDR", ihdr.toByteArray()), pngChunk("IEND", new byte[0]));
        long t0 = System.nanoTime();
        try {
            HeadPhotoInspector.inspect("png", fake);
            fail("400 IMAGE_TOO_LARGE_DIM 이어야 한다");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
            assertEquals("IMAGE_TOO_LARGE_DIM", codeOf(e));
        }
        assertTrue("1초 안에 거부해야 한다", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0) < 1000);
    }

    @Test
    public void 너무_작은_사진은_거부한다() throws Exception {
        for (String fmt : new String[]{"jpg", "png"}) {
            try {
                HeadPhotoInspector.inspect(fmt, write(gradient(100, 100, BufferedImage.TYPE_INT_RGB), fmt));
                fail("400 IMAGE_TOO_SMALL 이어야 한다");
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
                assertEquals("IMAGE_TOO_SMALL", codeOf(e));
            }
        }
    }

    @Test
    public void 잘린_JPEG는_읽을_수_없다고_거부한다() throws Exception {
        byte[] cut = Arrays.copyOf(jpeg(300, 400), 200);
        try {
            HeadPhotoInspector.inspect("jpg", cut);
            fail("400 IMAGE_UNREADABLE 이어야 한다");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
            assertEquals("IMAGE_UNREADABLE", codeOf(e));
        }
    }

    // ── 41 ───────────────────────────────────────────────────────────────

    @Test
    public void 자기_출력_검사는_APP1과_꼬리_바이트를_거부한다() throws Exception {
        byte[] clean = HeadPhotoInspector.inspect("jpg", jpeg(300, 400)).jpeg;
        HeadPhotoInspector.requireCleanJpeg(clean);
        byte[] withExif = insertAfterApp0(clean, seg(0xE1, ascii("Exif\0\0X")));
        byte[] trailing = concat(clean, new byte[]{0});
        for (byte[] bad : new byte[][]{withExif, trailing, new byte[]{1, 2, 3, 4, 5}}) {
            try {
                HeadPhotoInspector.requireCleanJpeg(bad);
                fail("거부돼야 한다");
            } catch (ApiException e) {
                assertEquals(500, e.getStatus());
            }
        }
    }

    // ── 42 ───────────────────────────────────────────────────────────────

    @Test
    public void 대기열이_가득_차면_503_PHOTO_BUSY다() throws Exception {
        ThreadPoolExecutor pool = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new SynchronousQueue<Runnable>(), new ThreadPoolExecutor.AbortPolicy());
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        try {
            pool.submit(new java.util.concurrent.Callable<Integer>() {
                @Override
                public Integer call() throws Exception {
                    started.countDown();
                    release.await(10, TimeUnit.SECONDS);
                    return 1;
                }
            });
            assertTrue(started.await(5, TimeUnit.SECONDS));
            try {
                HeadPhotoInspector.runBounded(pool, new java.util.concurrent.Callable<Integer>() {
                    @Override
                    public Integer call() {
                        return 2;
                    }
                }, new AtomicReference<ImageReader>(), 1000);
                fail("503 이어야 한다");
            } catch (ApiException e) {
                assertEquals(503, e.getStatus());
                assertEquals("PHOTO_BUSY", codeOf(e));
            }
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    /** abort 호출을 기록하는 가짜 리더. */
    private static final class FakeReader extends ImageReader {
        volatile boolean aborted;

        FakeReader() {
            super(null);
        }

        @Override public int getNumImages(boolean allowSearch) { return 1; }
        @Override public int getWidth(int imageIndex) { return 1; }
        @Override public int getHeight(int imageIndex) { return 1; }
        @Override public Iterator<ImageTypeSpecifier> getImageTypes(int imageIndex) { return Collections.<ImageTypeSpecifier>emptyList().iterator(); }
        @Override public IIOMetadata getStreamMetadata() { return null; }
        @Override public IIOMetadata getImageMetadata(int imageIndex) { return null; }
        @Override public BufferedImage read(int imageIndex, ImageReadParam param) { return null; }

        @Override
        public void abort() {
            aborted = true;
            super.abort();
        }
    }

    @Test
    public void 시간이_넘으면_abort를_부르고_400이다() throws Exception {
        ThreadPoolExecutor pool = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new SynchronousQueue<Runnable>(), new ThreadPoolExecutor.AbortPolicy());
        final FakeReader fake = new FakeReader();
        final AtomicReference<ImageReader> holder = new AtomicReference<ImageReader>(fake);
        try {
            HeadPhotoInspector.runBounded(pool, new java.util.concurrent.Callable<Integer>() {
                @Override
                public Integer call() throws Exception {
                    Thread.sleep(5000);
                    return 1;
                }
            }, holder, 100);
            fail("400 FILE_REJECTED 이어야 한다");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
            assertEquals("FILE_REJECTED", codeOf(e));
        } finally {
            pool.shutdownNow();
        }
        assertTrue("reader.abort() 를 불러야 한다", fake.aborted);
    }

    // ── 43 ───────────────────────────────────────────────────────────────

    @Test
    public void 전역_캐시_설정을_건드리지_않는다() throws Exception {
        boolean before = ImageIO.getUseCache();
        HeadPhotoInspector.inspect("jpg", jpeg(300, 400));
        assertEquals(before, ImageIO.getUseCache());
        String src = new String(Files.readAllBytes(
                Paths.get("src/main/java/com/kbstar/kgi/ggreport/web/service/HeadPhotoInspector.java")), StandardCharsets.UTF_8);
        assertFalse("운영 코드가 전역 캐시 설정을 바꾸면 안 된다", src.contains("setUseCache"));
    }

    @Test
    public void 팔레트_PNG의_zTXt_압축_폭탄은_디코드_전에_걷어낸다_security_중_2() throws Exception {
        BufferedImage idx = new BufferedImage(300, 400, BufferedImage.TYPE_BYTE_INDEXED);
        Graphics2D g = idx.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 150, 400);
        g.dispose();
        byte[] png = write(idx, "png");
        byte[] iend = Arrays.copyOfRange(png, png.length - 12, png.length);
        byte[] body = Arrays.copyOfRange(png, 0, png.length - 12);
        byte[] bomb = pngChunk("zTXt", concat(ascii("Bomb\0\0"), deflate(new byte[30 * 1024 * 1024])));   // 30MB 로 풀리는 작은 청크
        byte[] icc = pngChunk("iCCP", concat(ascii("p\0\0"), deflate(new byte[10 * 1024 * 1024])));
        byte[] dirty = concat(body, bomb, icc, iend, zip());
        assertTrue("시험 입력은 작아야 의미가 있다", dirty.length < 200_000);

        byte[] clean = HeadPhotoInspector.sanitizePng(dirty);
        String text = latin(clean);
        assertFalse(text.contains("zTXt") || text.contains("iCCP"));
        assertTrue(text.contains("IHDR") && text.contains("PLTE") && text.contains("IDAT") && text.contains("IEND"));
        assertFalse("IEND 뒤 꼬리도 버린다", text.contains("PK\3\4"));
        assertTrue(clean.length < dirty.length);

        long t0 = System.nanoTime();
        HeadPhotoInspector.Result r = HeadPhotoInspector.inspect("png", dirty);
        assertTrue("바로 처리돼야 한다", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0) < 5000);
        HeadPhotoInspector.requireCleanJpeg(r.jpeg);
    }

    @Test
    public void 깨진_PNG는_청크_훑기에서_거부한다() throws Exception {
        byte[] png = write(gradient(300, 400, BufferedImage.TYPE_INT_RGB), "png");
        byte[] noEnd = Arrays.copyOf(png, png.length - 12);   // IEND 없음
        byte[] badLen = png.clone();
        badLen[8] = 0x7F;   // 첫 청크 길이가 남은 바이트보다 크다
        for (byte[] bad : new byte[][]{noEnd, badLen, new byte[]{1, 2, 3}, new byte[40]}) {
            try {
                HeadPhotoInspector.sanitizePng(bad);
                fail("거부돼야 한다");
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
                assertEquals("IMAGE_UNREADABLE", codeOf(e));
            }
        }
    }

    @Test
    public void 최대_화소는_천이백만이다() {
        assertEquals(12_000_000L, HeadPhotoInspector.MAX_PIXELS);
    }

    @Test
    public void 축소_읽기_간격과_맞춤_크기() throws Exception {
        assertEquals(1, HeadPhotoInspector.subsample(300, 400));
        assertEquals(1, HeadPhotoInspector.subsample(600, 800));
        assertTrue(HeadPhotoInspector.subsample(6000, 6000) >= 3);
        HeadPhotoInspector.Result big = HeadPhotoInspector.inspect("jpg", jpeg(1200, 1600));
        assertEquals("1200x1600 은 비율을 지켜 600x800 으로 줄어든다", 600, big.width);
        assertEquals(800, big.height);
    }
}
