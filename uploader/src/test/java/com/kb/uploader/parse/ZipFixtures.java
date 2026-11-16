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

    /**
     * 두 번째 로컬 헤더 앞에 가짜 서명 4바이트(PK\1\2)를 끼운다. ZipInputStream 은 거기서 끝나 첫 entry 만 보고,
     * ZipFile 은 목차(오프셋·목차 시작 위치를 +4 로 고쳐 둠)로 둘 다 연다. 입력은 entry 가 2개 이상인 zip.
     */
    public static byte[] hideAfterFirst(byte[] zip) {
        int p = -1;
        for (int i = 4; i + 4 <= zip.length; i++) {
            if (zip[i] == 'P' && zip[i + 1] == 'K' && zip[i + 2] == 3 && zip[i + 3] == 4) {
                p = i;
                break;
            }
        }
        int eocd = -1;
        for (int i = zip.length - 22; i >= 0; i--) {
            if (zip[i] == 'P' && zip[i + 1] == 'K' && zip[i + 2] == 5 && zip[i + 3] == 6) {
                eocd = i;
                break;
            }
        }
        if (p < 0 || eocd < 0) {
            throw new IllegalArgumentException("zip 구조를 못 찾음");
        }
        byte[] out = new byte[zip.length + 4];
        System.arraycopy(zip, 0, out, 0, p);
        out[p] = 'P';
        out[p + 1] = 'K';
        out[p + 2] = 1;
        out[p + 3] = 2;
        System.arraycopy(zip, p, out, p + 4, zip.length - p);
        int e = eocd + 4;
        int cen = le32(out, e + 16);
        put32(out, e + 16, cen + 4);
        int count = le16(out, e + 10);
        int pos = cen + 4;
        for (int k = 0; k < count; k++) {
            int off = le32(out, pos + 42);
            if (off >= p) {
                put32(out, pos + 42, off + 4);
            }
            pos += 46 + le16(out, pos + 28) + le16(out, pos + 30) + le16(out, pos + 32);
        }
        return out;
    }

    /**
     * entry 1개짜리 zip 두 개(같은 이름·같은 해제 크기)로, 스트림은 shown 을 읽고 목차는 hidden 을 가리키는 파일을 만든다:
     * [shown 로컬 부분][가짜 PK\1\2][hidden 로컬 부분][hidden 목차·EOCD(오프셋 보정)]. 내용 바꿔치기 시험용(security N1).
     */
    public static byte[] swapHidden(byte[] shown, byte[] hidden) {
        int shownCd = cdStart(shown);
        int hiddenCd = cdStart(hidden);
        int base = shownCd + 4;
        byte[] out = new byte[base + hidden.length];
        System.arraycopy(shown, 0, out, 0, shownCd);
        out[shownCd] = 'P';
        out[shownCd + 1] = 'K';
        out[shownCd + 2] = 1;
        out[shownCd + 3] = 2;
        System.arraycopy(hidden, 0, out, base, hidden.length);
        int cen = base + hiddenCd;
        put32(out, cen + 42, le32(out, cen + 42) + base);              // 로컬 헤더 위치
        int eocd = base + hidden.length - 22;
        put32(out, eocd + 16, le32(out, eocd + 16) + base);            // 목차 시작 위치
        return out;
    }

    /** 암호화 OOXML 모양(OLE + EncryptionInfo + EncryptedPackage)을 만든다. 비밀번호는 시험용 가상값. */
    public static byte[] encryptedOoxml(byte[] plainZip) throws Exception {
        try (org.apache.poi.poifs.filesystem.POIFSFileSystem fs = new org.apache.poi.poifs.filesystem.POIFSFileSystem()) {
            org.apache.poi.poifs.crypt.EncryptionInfo info =
                    new org.apache.poi.poifs.crypt.EncryptionInfo(org.apache.poi.poifs.crypt.EncryptionMode.standard);
            org.apache.poi.poifs.crypt.Encryptor enc = info.getEncryptor();
            enc.confirmPassword("test-pw");
            try (java.io.OutputStream os = enc.getDataStream(fs)) {
                os.write(plainZip);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            fs.writeFilesystem(out);
            return out.toByteArray();
        }
    }

    private static int cdStart(byte[] zip) {
        return le32(zip, zip.length - 22 + 16);    // 주석 없는 EOCD 가정
    }

    private static int le16(byte[] b, int i) {
        return (b[i] & 0xFF) | ((b[i + 1] & 0xFF) << 8);
    }

    private static int le32(byte[] b, int i) {
        return le16(b, i) | (le16(b, i + 2) << 16);
    }

    private static void put32(byte[] b, int i, int v) {
        b[i] = (byte) v;
        b[i + 1] = (byte) (v >>> 8);
        b[i + 2] = (byte) (v >>> 16);
        b[i + 3] = (byte) (v >>> 24);
    }
}
