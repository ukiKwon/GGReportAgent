package com.kb.uploader.parse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** 시험용 zip 도구(NEXT 39). */
public final class ZipFixtures {
    private ZipFixtures() {
    }

    public static byte[] zip(String name, byte[] data) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            z.putNextEntry(new ZipEntry(name));
            z.write(data);
            z.closeEntry();
        }
        return out.toByteArray();
    }

    /** 내용 0 으로 채운 entry(압축 후 작다). */
    public static byte[] zeros(String name, int size) throws IOException {
        return zip(name, new byte[size]);
    }

    /** 기존 zip 의 entry 를 모두 옮기고 끝에 하나를 덧붙인다. */
    public static byte[] addEntry(byte[] zip, String name, byte[] data) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip));
             ZipOutputStream z = new ZipOutputStream(out)) {
            ZipEntry e;
            byte[] buf = new byte[8192];
            while ((e = in.getNextEntry()) != null) {
                z.putNextEntry(new ZipEntry(e.getName()));
                int n;
                while ((n = in.read(buf)) > 0) {
                    z.write(buf, 0, n);
                }
                z.closeEntry();
            }
            z.putNextEntry(new ZipEntry(name));
            z.write(data);
            z.closeEntry();
        }
        return out.toByteArray();
    }

    /**
     * 기존 zip 에 같은 이름(existing)의 entry 를 하나 더 만든다. ZipOutputStream 은 중복을 거부하므로
     * 끝 글자를 '~' 로 바꾼 이름으로 쓴 뒤, 바이트에서 그 이름을 원래 이름으로 되돌린다(같은 길이).
     */
    public static byte[] duplicateEntry(byte[] zip, String existing) throws IOException {
        String fake = existing.substring(0, existing.length() - 1) + "~";
        byte[] b = addEntry(zip, fake, new byte[]{'x'});
        byte[] f = fake.getBytes(StandardCharsets.UTF_8);
        byte[] r = existing.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i + f.length <= b.length; i++) {
            boolean m = true;
            for (int k = 0; k < f.length && m; k++) {
                m = b[i + k] == f[k];
            }
            if (m) {
                System.arraycopy(r, 0, b, i, r.length);
            }
        }
        return b;
    }
}
