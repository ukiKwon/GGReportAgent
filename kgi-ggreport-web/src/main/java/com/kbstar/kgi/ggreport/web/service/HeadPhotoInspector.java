package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.ApiException;

import javax.imageio.IIOException;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 기관장 사진 검사·재인코딩(NEXT 72·77, 026) — 올라온 JPG/PNG 를 <b>서버가 다시 만든 JPEG</b>로 바꿔 보관한다(원본·EXIF·ICC·텍스트 청크·꼬리 데이터는 버린다).
 *
 * <p>방어: 머리글 크기 상한(6000×6000, 2,500만 화소)·하한(120×160), 축소 읽기(subsampling)로 메모리 상한, 유한 대기열(스레드 2·대기 4 — 가득 차면 503),
 * 시간 초과 시 {@code reader.abort()}, 메타데이터 읽지 않음, JDK 내장 리더·라이터만(외부 플러그인 배제), 호출마다 새 메모리 스트림(전역 캐시 설정은 건드리지 않는다).
 * 저장 직전 자기 출력을 마커 허용 목록·EOI 뒤 0바이트로 다시 검사한다(실패하면 500, 저장 안 함).
 * 오류 문구에 내부 정보·입력값을 싣지 않는다.
 */
final class HeadPhotoInspector {

    static final long MAX_BYTES = 5L * 1024 * 1024;
    static final long TIMEOUT_MS = 8000;
    static final int MAX_DIM = 6000;
    /** 점진적 JPEG 는 축소 읽기를 해도 전체 계수 버퍼를 네이티브 메모리에 잡는다 — 1,200만 화소로 낮춘다(security 하-1). */
    static final long MAX_PIXELS = 12_000_000L;
    static final int MIN_W = 120;
    static final int MIN_H = 160;
    static final int OUT_W = 600;
    static final int OUT_H = 800;

    private static final ThreadPoolExecutor POOL = new ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<Runnable>(4), r -> {
        Thread t = new Thread(r, "head-photo-decode");
        t.setDaemon(true);
        return t;
    }, new ThreadPoolExecutor.AbortPolicy());

    /** 검사·재인코딩 결과 — 저장할 JPEG 바이트와 그 크기(가로·세로). */
    static final class Result {
        final byte[] jpeg;
        final int width;
        final int height;

        Result(byte[] jpeg, int width, int height) {
            this.jpeg = jpeg;
            this.width = width;
            this.height = height;
        }
    }

    private HeadPhotoInspector() {
    }

    /** ext: jpg·jpeg·png(소문자). 느린 검사이므로 트랜잭션·잠금 밖에서 부른다. */
    static Result inspect(String ext, byte[] data) {
        final String fmt = "png".equals(ext) ? "png" : "jpeg";
        if ("png".equals(ext)) {
            data = sanitizePng(data);   // 디코드 전에 보조 청크(zTXt·iCCP 압축 폭탄 등)를 걷어낸다
        }
        final byte[] input = data;
        final AtomicReference<ImageReader> holder = new AtomicReference<>();
        BufferedImage rgb = runBounded(POOL, new Callable<BufferedImage>() {
            @Override
            public BufferedImage call() throws Exception {
                return decode(fmt, input, holder);
            }
        }, holder, TIMEOUT_MS);
        byte[] out;
        try {
            out = encode(rgb);
        } catch (IOException e) {
            throw new ApiException(500, "사진을 처리하지 못했습니다.");
        }
        return new Result(out, rgb.getWidth(), rgb.getHeight());
    }

    private static final Set<String> PNG_KEEP = new HashSet<>(Arrays.asList(
            "IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB", "pHYs"));

    /**
     * PNG 청크를 훑어 IHDR·PLTE·tRNS·IDAT·IEND·gAMA·cHRM·sRGB·pHYs 만 남긴 바이트열을 돌려준다(그 밖의 tEXt·zTXt·iTXt·iCCP·eXIf 등과 IEND 뒤 꼬리는 버린다).
     * JDK PNG 리더는 메타데이터 무시 설정이어도 팔레트 이미지에서 보조 청크를 해석할 수 있어, 압축 폭탄을 디코더에 넘기지 않으려는 것이다.
     * 서명이 틀리거나 청크 길이가 남은 바이트를 넘거나 IEND 가 없으면 400 IMAGE_UNREADABLE. 청크의 CRC 는 그대로 가져가며(리더가 검사한다) 여기서 풀거나 계산하지 않는다.
     */
    static byte[] sanitizePng(byte[] b) {
        final int[] sig = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        if (b.length < 8 + 12) {
            throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
        }
        for (int i = 0; i < sig.length; i++) {
            if ((b[i] & 0xFF) != sig[i]) {
                throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(b.length);
        out.write(b, 0, 8);
        int pos = 8;
        boolean end = false;
        while (pos + 12 <= b.length) {
            long len = ((b[pos] & 0xFFL) << 24) | ((b[pos + 1] & 0xFFL) << 16) | ((b[pos + 2] & 0xFFL) << 8) | (b[pos + 3] & 0xFFL);
            if (len < 0 || len > b.length - pos - 12) {
                throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
            }
            String type = new String(b, pos + 4, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
            int total = (int) len + 12;
            if (PNG_KEEP.contains(type)) {
                out.write(b, pos, total);
            }
            pos += total;
            if ("IEND".equals(type)) {
                end = true;
                break;
            }
        }
        if (!end) {
            throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
        }
        return out.toByteArray();
    }

    static <T> T runBounded(ThreadPoolExecutor pool, Callable<T> task, AtomicReference<ImageReader> holder, long timeoutMs) {
        Future<T> f;
        try {
            f = pool.submit(task);
        } catch (RejectedExecutionException e) {
            throw coded(503, "PHOTO_BUSY", "사진 처리 요청이 많습니다. 잠시 뒤 다시 올려 주세요.");
        }
        try {
            return f.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            ImageReader r = holder.get();
            if (r != null) {
                r.abort();   // cancel(true) 만으로는 디코드가 멈추지 않는다
            }
            f.cancel(true);
            pool.remove((Runnable) f);   // 대기열에 남았으면 실행하지 않는다
            throw coded(400, "FILE_REJECTED", "사진을 처리하는 데 시간이 너무 오래 걸려 올릴 수 없습니다.");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof ApiException) {
                throw (ApiException) e.getCause();
            }
            throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            f.cancel(true);
            throw coded(400, "FILE_REJECTED", "사진 처리가 중단되었습니다. 다시 시도해 주세요.");
        }
    }

    private static BufferedImage decode(String fmt, byte[] data, AtomicReference<ImageReader> holder) throws IOException {
        ImageReader reader = jdkReader(fmt);
        holder.set(reader);
        try (ImageInputStream iis = new MemoryCacheImageInputStream(new ByteArrayInputStream(data))) {
            reader.setInput(iis, false, true);   // 메타데이터 무시(EXIF·텍스트 청크를 읽지 않는다)
            int w = reader.getWidth(0);
            int h = reader.getHeight(0);   // 머리글만 읽는다
            if (w > MAX_DIM || h > MAX_DIM || (long) w * h > MAX_PIXELS) {
                throw coded(400, "IMAGE_TOO_LARGE_DIM", "사진의 가로·세로가 너무 큽니다.");
            }
            if (w < MIN_W || h < MIN_H) {
                throw coded(400, "IMAGE_TOO_SMALL", "사진이 너무 작습니다(가로 " + MIN_W + "·세로 " + MIN_H + " 이상).");
            }
            ImageReadParam p = reader.getDefaultReadParam();
            int s = subsample(w, h);
            if (s > 1) {
                p.setSourceSubsampling(s, s, 0, 0);   // 메모리 상한
            }
            BufferedImage src = reader.read(0, p);
            if (src == null) {
                throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다.");
            }
            return fit(src, w, h);
        } catch (IIOException e) {   // CMYK·손상 등
            throw coded(400, "IMAGE_UNREADABLE", "사진을 읽을 수 없습니다. 일반 JPG/PNG로 다시 저장해 올려 주세요.");
        } finally {
            reader.dispose();
        }
    }

    /** 목표(600×800) 크기의 2배 해상도는 남기는 축소 읽기 간격. */
    static int subsample(int w, int h) {
        double scale = Math.min(1.0, Math.min(600.0 / w, 800.0 / h));
        return Math.max(1, (int) Math.floor(1.0 / scale / 2.0));
    }

    /** RGB(sRGB), 투명은 흰색, 600×800 안, 확대 없음. ow·oh 는 원본 크기. */
    static BufferedImage fit(BufferedImage src, int ow, int oh) {
        double scale = Math.min(1.0, Math.min(600.0 / ow, 800.0 / oh));
        int tw = Math.max(1, (int) Math.round(ow * scale));
        int th = Math.max(1, (int) Math.round(oh * scale));
        BufferedImage dst = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dst.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.drawImage(src, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        return dst;
    }

    static byte[] encode(BufferedImage rgb) throws IOException {
        ImageWriter w = jdkWriter("jpeg");
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ImageOutputStream ios = new MemoryCacheImageOutputStream(bos)) {
            w.setOutput(ios);
            ImageWriteParam p = w.getDefaultWriteParam();
            p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            p.setCompressionQuality(0.85f);
            w.write(null, new IIOImage(rgb, null, null), p);   // 스트림·이미지 메타데이터 null
        } finally {
            w.dispose();
        }
        byte[] out = bos.toByteArray();
        requireCleanJpeg(out);   // 자기 출력 검사 — 실패면 500, 저장 안 함
        return out;
    }

    // ── 마커 허용 목록과 EOI 뒤 0바이트(운영 코드와 테스트가 같은 함수를 쓴다) ──────────────────

    /** APP0(JFIF)·DQT·SOF0·DHT·SOS. */
    private static final Set<Integer> HEADER_OK = new HashSet<>(Arrays.asList(0xE0, 0xDB, 0xC0, 0xC4, 0xDA));

    static void requireCleanJpeg(byte[] b) {
        if (b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) {
            throw dirty();
        }
        int i = 2;
        boolean app0 = false;
        boolean sos = false;
        while (i + 4 <= b.length) {
            if ((b[i] & 0xFF) != 0xFF) {
                throw dirty();
            }
            int m = b[i + 1] & 0xFF;
            if (!HEADER_OK.contains(m)) {
                throw dirty();   // APP1(EXIF·XMP)·APP2(ICC)·APP13(IPTC)·COM 등 모두 거부
            }
            int len = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
            if (len < 2 || i + 2 + len > b.length) {
                throw dirty();
            }
            if (m == 0xE0) {
                if (app0 || len < 7 || i + 9 > b.length || b[i + 4] != 'J' || b[i + 5] != 'F' || b[i + 6] != 'I'
                        || b[i + 7] != 'F' || b[i + 8] != 0) {
                    throw dirty();
                }
                app0 = true;
            }
            i += 2 + len;
            if (m == 0xDA) {
                sos = true;
                break;
            }
        }
        if (!sos || !app0) {
            throw dirty();
        }
        for (; i + 1 < b.length; i++) {   // 엔트로피 데이터: FF00(채움)·RSTn 만 허용
            if ((b[i] & 0xFF) != 0xFF) {
                continue;
            }
            int m = b[i + 1] & 0xFF;
            if (m == 0x00 || (m >= 0xD0 && m <= 0xD7)) {
                i++;
                continue;
            }
            if (m == 0xD9 && i + 2 == b.length) {
                return;   // EOI 이고 그 뒤 0바이트
            }
            throw dirty();
        }
        throw dirty();
    }

    private static ApiException dirty() {
        return new ApiException(500, "사진을 처리하지 못했습니다.");
    }

    // ── JDK 내장 리더·라이터만 ──────────────────────────────────────────────────────────

    private static final String JDK_PLUGINS = "com.sun.imageio.plugins.";

    private static ImageReader jdkReader(String fmt) {
        Iterator<ImageReader> it = ImageIO.getImageReadersByFormatName(fmt);
        while (it.hasNext()) {
            ImageReader r = it.next();
            if (r.getClass().getName().startsWith(JDK_PLUGINS)) {
                return r;
            }
            r.dispose();
        }
        throw new ApiException(500, "사진을 처리하지 못했습니다.");
    }

    private static ImageWriter jdkWriter(String fmt) {
        Iterator<ImageWriter> it = ImageIO.getImageWritersByFormatName(fmt);
        while (it.hasNext()) {
            ImageWriter w = it.next();
            if (w.getClass().getName().startsWith(JDK_PLUGINS)) {
                return w;
            }
            w.dispose();
        }
        throw new ApiException(500, "사진을 처리하지 못했습니다.");
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
