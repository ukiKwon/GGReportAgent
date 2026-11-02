package com.kbstar.kgi.ggreport.web.docfill;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * OOXML(zip)을 POI 로 열기 전에 실제로 풀어 보며 검사한다. 헤더의 크기 필드는 믿지 않고 읽은 바이트를 센다.
 * 중복 entry 이름(대소문자·앞 '/' 무시)은 거부한다 — CVE-2025-31672 완화(POI 5.2.3 은 중복을 막지 않는다).
 * POI 의 OPCPackage.open(InputStream) 도 로컬 헤더를 순서대로 읽으므로 같은 entry 집합을 본다.
 */
public final class ZipGuard {

    public static final int MAX_ENTRIES = 2000;

    private ZipGuard() {
    }

    public static final class Result {
        public final Set<String> names;      // 소문자로 정규화
        public final byte[] contentTypes;    // [Content_Types].xml, 없으면 null
        public final long unpacked;

        Result(Set<String> names, byte[] contentTypes, long unpacked) {
            this.names = names;
            this.contentTypes = contentTypes;
            this.unpacked = unpacked;
        }
    }

    /** code: TOO_LARGE_UNPACKED | DUPLICATE_ENTRY | BROKEN. 메시지·스택 없음. */
    public static final class Rejected extends Exception {
        public final String code;

        Rejected(String code) {
            super(code, null, false, false);
            this.code = code;
        }
    }

    public static Result check(byte[] zip, long maxEntry, long maxTotal) throws Rejected {
        Set<String> names = new LinkedHashSet<>();
        byte[] ct = null;
        long total = 0;
        byte[] buf = new byte[8192];
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                String name = e.getName().replace('\\', '/').toLowerCase(Locale.ROOT);
                while (name.startsWith("/")) {
                    name = name.substring(1);
                }
                if (!names.add(name)) {
                    throw new Rejected("DUPLICATE_ENTRY");
                }
                if (names.size() > MAX_ENTRIES) {
                    throw new Rejected("TOO_LARGE_UNPACKED");
                }
                ByteArrayOutputStream kept = "[content_types].xml".equals(name) ? new ByteArrayOutputStream() : null;
                long size = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    size += n;
                    total += n;
                    if (size > maxEntry || total > maxTotal) {
                        throw new Rejected("TOO_LARGE_UNPACKED");
                    }
                    if (kept != null) {
                        kept.write(buf, 0, n);
                    }
                }
                if (kept != null) {
                    ct = kept.toByteArray();
                }
            }
        } catch (IOException | IllegalArgumentException ex) {   // 깨진 zip·잘못된 이름 인코딩
            throw new Rejected("BROKEN");
        }
        if (names.isEmpty()) {
            throw new Rejected("BROKEN");
        }
        return new Result(names, ct, total);
    }
}
