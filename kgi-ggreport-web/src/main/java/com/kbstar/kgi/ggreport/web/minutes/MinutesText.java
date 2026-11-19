package com.kbstar.kgi.ggreport.web.minutes;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.text.Normalizer;
import java.util.Locale;

/**
 * 회의록 txt 한 파일의 바이트 → 검사된 줄 배열 (security R1~R4, 설계 3-3).
 * 순서: 빈 파일 → UTF-16 BOM → 바이너리 서명 → NUL → 엄격 UTF-8(BOM 제거) → 엄격 CP949 → 실패.
 * 이어서 CRLF/CR→LF → 양방향 제어 거부(NFKC 전) → 보이지 않는 문자(서식 Cf·한글 채움·변이 선택자 등) 제거 → NFKC → 같은 제거 한 번 더
 * → 제어 문자 거부 → 줄 수·줄 길이 상한. 모두 코드포인트 단위.
 * ⚠️ 기존 InstitutionCsv.decode 의 관대한 대체 경로는 쓰지 않는다(깨진 바이트가 대체 문자로 바뀌어 이름 대조를 빠져나감).
 * 오류에는 코드·칸·줄 번호만 담는다(원문 줄·파일명 없음).
 */
public final class MinutesText {
    public static final int MAX_LINES = 50000;
    public static final int MAX_LINE_CHARS = 4000;
    public static final String ENC_UTF8 = "UTF-8";
    public static final String ENC_CP949 = "CP949";

    private MinutesText() {
    }

    /** 디코딩·정규화·상한 검사를 마친 결과. */
    public static final class Prepared {
        public final String encoding;
        public final String[] lines;

        Prepared(String encoding, String[] lines) {
            this.encoding = encoding;
            this.lines = lines;
        }
    }

    /** 원래 파일명이 .txt 로 끝나는지만 본다. 파일명은 저장·기록·응답하지 않는다(R5). */
    public static void checkFileName(String originalName, String slot) {
        if (originalName == null || !originalName.toLowerCase(Locale.ROOT).endsWith(".txt")) {
            throw MinutesException.unprocessable("NOT_TXT", slot, 0);
        }
    }

    public static Prepared prepare(byte[] b, String slot) {
        if (b == null || b.length == 0) {
            throw MinutesException.unprocessable("EMPTY_FILE", slot, 0);
        }
        if (b.length >= 2 && ((b[0] & 0xFF) == 0xFE && (b[1] & 0xFF) == 0xFF || (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xFE)) {
            throw MinutesException.unprocessable("ENCODING_UTF16", slot, 0);
        }
        if (hasSignature(b)) {
            throw MinutesException.unprocessable("BINARY_SIGNATURE", slot, 0);
        }
        for (int i = 0; i < b.length; i++) {
            if (b[i] == 0) {
                throw MinutesException.unprocessable("NUL_BYTE", slot, 0);
            }
        }
        int off = 0;
        if (b.length >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) {
            off = 3;
        }
        if (off >= b.length) {
            throw MinutesException.unprocessable("EMPTY_FILE", slot, 0);
        }
        String text;
        String enc;
        try {
            text = decodeStrict(b, off, Charset.forName("UTF-8"));
            enc = ENC_UTF8;
        } catch (CharacterCodingException e) {
            Charset cp949 = cp949();
            if (cp949 == null) {
                throw MinutesException.unprocessable("ENCODING_UNKNOWN", slot, 0);
            }
            try {
                text = decodeStrict(b, off, cp949);
                enc = ENC_CP949;
            } catch (CharacterCodingException e2) {
                throw MinutesException.unprocessable("ENCODING_UNKNOWN", slot, 0);
            }
        }
        String normalized = normalize(text, slot);
        return new Prepared(enc, splitLines(normalized, slot));
    }

    /** 수정 저장·제목 등 짧은 글 입력용 — 같은 정규화·제어문자 검사. 줄 상한은 보지 않는다. */
    public static String normalizeText(String s, String slot) {
        return normalize(s == null ? "" : s, slot);
    }

    /** 이름 사전·가림 단어용 — 예외 없이 보이지 않는 문자 제거 + NFKC + 한 번 더 제거 + trim 만 한다(글 본문과 같은 {@link #fold1}). */
    public static String fold(String s) {
        if (s == null) {
            return "";
        }
        return fold1(s).trim();
    }

    /** 보이지 않는 문자 제거 → NFKC → 같은 제거 한 번 더(NFKC 가 새로 만들어 내는 채움 문자까지). 코드포인트 단위. */
    private static String fold1(String s) {
        return stripInvisible(Normalizer.normalize(stripInvisible(s), Normalizer.Form.NFKC));
    }

    /** 이 시스템이 읽을 수 있는 CP949 문자셋(없으면 null). */
    public static Charset cp949() {
        String[] names = {"x-windows-949", "MS949"};
        for (String n : names) {
            try {
                if (Charset.isSupported(n)) {
                    return Charset.forName(n);
                }
            } catch (RuntimeException ignore) {
                // 다음 이름을 시도
            }
        }
        return null;
    }

    /** 제어 문자(탭·LF 제외 C0, DEL, C1, 양방향 제어, U+FFFD)인지. */
    static boolean isForbidden(char c) {
        if (c == '\n' || c == '\t') {
            return false;
        }
        return c < 0x20 || c == 0x7F || (c >= 0x80 && c <= 0x9F)
                || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c == 0xFFFD;
    }

    private static boolean hasSignature(byte[] b) {
        return starts(b, new int[]{'P', 'K'}) || starts(b, new int[]{'%', 'P', 'D', 'F'}) || starts(b, new int[]{'M', 'Z'})
                || starts(b, new int[]{0xD0, 0xCF, 0x11, 0xE0}) || starts(b, new int[]{'{', '\\', 'r', 't', 'f'});
    }

    private static boolean starts(byte[] b, int[] sig) {
        if (b.length < sig.length) {
            return false;
        }
        for (int i = 0; i < sig.length; i++) {
            if ((b[i] & 0xFF) != sig[i]) {
                return false;
            }
        }
        return true;
    }

    private static String decodeStrict(byte[] b, int off, Charset cs) throws CharacterCodingException {
        CharsetDecoder d = cs.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        return d.decode(ByteBuffer.wrap(b, off, b.length - off)).toString();
    }

    /** 양방향 제어(202A~202E·2066~2069·061C) — 정규화 전에 만나면 거부한다(지워서 숨기지 않는다). */
    private static boolean isBidi(int cp) {
        return (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C;
    }

    /**
     * 눈에 보이지 않아 이름 대조를 빠져나가게 하는 문자인지 — 서식 문자(Cf: 폭 없는 문자·소프트 하이픈·FEFF 등) 전부,
     * 한글 채움(115F·1160·3164·FFA0), 결합 그래프 결합자(034F), 몽골 자유 변이(180B~180F), 변이 선택자(FE00~FE0F·E0100~E01EF).
     */
    static boolean isInvisible(int cp) {
        return Character.getType(cp) == Character.FORMAT
                || cp == 0x115F || cp == 0x1160 || cp == 0x3164 || cp == 0xFFA0 || cp == 0x034F
                || (cp >= 0x180B && cp <= 0x180F) || (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0100 && cp <= 0xE01EF);
    }

    private static String stripInvisible(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        int i = 0;
        while (i < s.length()) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            if (!isInvisible(cp)) {
                sb.appendCodePoint(cp);
            }
        }
        return sb.toString();
    }

    private static String normalize(String text, String slot) {
        String raw = text.replace("\r\n", "\n").replace('\r', '\n');
        int line = 1;
        for (int i = 0; i < raw.length(); i++) {   // NFKC·제거 전에 양방향 제어를 거부한다(줄 번호는 원문 기준)
            char c = raw.charAt(i);
            if (c == '\n') {
                line++;
            } else if (isBidi(c)) {
                throw MinutesException.unprocessable("CONTROL_CHAR", slot, line);
            }
        }
        String t = fold1(raw);
        line = 1;
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c == '\n') {
                line++;
            } else if (isForbidden(c)) {
                throw MinutesException.unprocessable("CONTROL_CHAR", slot, line);
            }
        }
        return t;
    }

    private static String[] splitLines(String t, String slot) {
        int n = 1;
        for (int i = 0; i < t.length(); i++) {
            if (t.charAt(i) == '\n') {
                n++;
            }
        }
        if (t.endsWith("\n")) {
            n--;
        }
        if (n > MAX_LINES) {
            throw MinutesException.unprocessable("LIMIT_LINES", slot, MAX_LINES + 1);
        }
        String[] lines = new String[n];
        int idx = 0;
        int start = 0;
        for (int i = 0; i <= t.length() && idx < n; i++) {
            if (i == t.length() || t.charAt(i) == '\n') {
                String l = t.substring(start, i);
                if (l.length() > MAX_LINE_CHARS) {
                    throw MinutesException.unprocessable("LIMIT_LINE", slot, idx + 1);
                }
                lines[idx++] = l;
                start = i + 1;
            }
        }
        return lines;
    }
}
