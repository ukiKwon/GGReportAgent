package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Assume;
import org.junit.Test;

import java.nio.charset.Charset;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.UTF8;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.cp;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.expect;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class MinutesTextTest {

    private static void prepareFails(String code, final byte[] b) {
        expect(code, new Runnable() {
            @Override
            public void run() {
                MinutesText.prepare(b, "transcript");
            }
        });
    }

    @Test
    public void utf8을_판별한다() {
        MinutesText.Prepared p = MinutesText.prepare("첫째 줄\n둘째 줄".getBytes(UTF8), "transcript");
        assertEquals("UTF-8", p.encoding);
        assertEquals(2, p.lines.length);
        assertEquals("둘째 줄", p.lines[1]);
    }

    @Test
    public void utf8_BOM은_떼어낸다() {
        byte[] body = "가나다".getBytes(UTF8);
        byte[] b = new byte[body.length + 3];
        b[0] = (byte) 0xEF;
        b[1] = (byte) 0xBB;
        b[2] = (byte) 0xBF;
        System.arraycopy(body, 0, b, 3, body.length);
        MinutesText.Prepared p = MinutesText.prepare(b, "transcript");
        assertEquals("UTF-8", p.encoding);
        assertEquals("가나다", p.lines[0]);
    }

    @Test
    public void cp949를_판별한다() {
        Charset cp = MinutesText.cp949();
        Assume.assumeNotNull(cp);
        MinutesText.Prepared p = MinutesText.prepare("회의록 시험 문장입니다".getBytes(cp), "transcript");
        assertEquals("CP949", p.encoding);
        assertEquals("회의록 시험 문장입니다", p.lines[0]);
    }

    @Test
    public void UTF16_BOM은_거부한다() {
        prepareFails("ENCODING_UTF16", new byte[]{(byte) 0xFF, (byte) 0xFE, 'a', 0});
        prepareFails("ENCODING_UTF16", new byte[]{(byte) 0xFE, (byte) 0xFF, 0, 'a'});
    }

    @Test
    public void 어느_쪽으로도_읽히지_않으면_거부한다() {
        prepareFails("ENCODING_UNKNOWN", new byte[]{(byte) 0xFF, (byte) 0xFF, 'a', 'b'});
    }

    @Test
    public void NUL과_바이너리_서명과_빈_파일을_거부한다() {
        prepareFails("NUL_BYTE", new byte[]{'a', 'b', 0, 'c'});
        prepareFails("BINARY_SIGNATURE", "%PDF-1.4 가짜".getBytes(UTF8));
        prepareFails("BINARY_SIGNATURE", new byte[]{'P', 'K', 3, 4});
        prepareFails("BINARY_SIGNATURE", new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        prepareFails("BINARY_SIGNATURE", "{\\rtf1 abc".getBytes(UTF8));
        prepareFails("EMPTY_FILE", new byte[0]);
        prepareFails("EMPTY_FILE", new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
    }

    @Test
    public void 양방향_제어문자는_줄_번호만_알리고_거부한다() {
        final byte[] b = ("abc\n" + cp(0x202E) + "def").getBytes(UTF8);
        MinutesException e = expect("CONTROL_CHAR", new Runnable() {
            @Override
            public void run() {
                MinutesText.prepare(b, "transcript");
            }
        });
        assertEquals(2, e.getLine());
        assertEquals("transcript", e.getSlot());
        assertFalse(e.toDetail().toString().contains("def"));
    }

    @Test
    public void 줄_길이_상한을_넘으면_거부한다() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < MinutesText.MAX_LINE_CHARS + 1; i++) {
            sb.append('a');
        }
        MinutesException e = expect("LIMIT_LINE", new Runnable() {
            @Override
            public void run() {
                MinutesText.prepare(new StringBuilder().append("ok\n").append(repeat('a', MinutesText.MAX_LINE_CHARS + 1)).toString().getBytes(UTF8), "transcript");
            }
        });
        assertEquals(2, e.getLine());
    }

    private static String repeat(char c, int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(c);
        }
        return sb.toString();
    }

    @Test
    public void 폭_없는_문자는_지우고_CRLF는_LF가_된다() {
        MinutesText.Prepared p = MinutesText.prepare(("가" + cp(0x200B) + "상" + cp(0x200D) + "일\r\n둘째\r셋째").getBytes(UTF8), "transcript");
        assertEquals(3, p.lines.length);
        assertEquals("가상일", p.lines[0]);
        assertEquals("셋째", p.lines[2]);
    }

    @Test
    public void 서식_문자와_한글_채움과_변이_선택자도_지운다() {
        // 소프트 하이픈(00AD)·한글 채움(3164·FFA0·115F·1160)·결합 그래프 결합자(034F)·몽골 변이(180B)·변이 선택자(FE0F·E0100)·단어 결합자(2060)·FEFF
        int[] hidden = {0x00AD, 0x3164, 0xFFA0, 0x115F, 0x1160, 0x034F, 0x180B, 0xFE0F, 0xE0100, 0x2060, 0xFEFF};
        for (int h : hidden) {
            String text = "김" + cp(h) + "영업";
            assertEquals(Integer.toHexString(h), "김영업", MinutesText.prepare(text.getBytes(UTF8), "t").lines[0]);
            assertEquals(Integer.toHexString(h), "김영업", MinutesText.fold(text));
            assertEquals(Integer.toHexString(h), "김영업", MinutesText.normalizeText(text, "t"));
        }
        assertEquals("김영업", MinutesText.fold(cp(0x3164) + "김" + cp(0x00AD) + cp(0x3164) + "영" + cp(0xFE0F) + "업" + cp(0x3164) + " "));
    }

    @Test
    public void 양방향_제어는_종류와_위치에_상관없이_줄_번호와_함께_거부한다() {
        int[] bidi = {0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069, 0x061C};
        for (int c : bidi) {
            final byte[] b = ("가\r\n나\r\n다" + cp(c) + "라").getBytes(UTF8);
            MinutesException e = expect("CONTROL_CHAR", new Runnable() {
                @Override
                public void run() {
                    MinutesText.prepare(b, "transcript");
                }
            });
            assertEquals(Integer.toHexString(c), 3, e.getLine());
        }
        expect("CONTROL_CHAR", new Runnable() {
            @Override
            public void run() {
                MinutesText.normalizeText("수정" + cp(0x202E) + "글", "edit");
            }
        });
    }

    @Test
    public void NFKC로_전각문자를_접는다() {
        String full = cp(0xFF10) + cp(0xFF11) + cp(0xFF10);   // 전각 0 1 0
        MinutesText.Prepared p = MinutesText.prepare(full.getBytes(UTF8), "transcript");
        assertEquals("010", p.lines[0]);
    }

    @Test
    public void 파일명은_txt만_받는다() {
        MinutesText.checkFileName("a.TXT", "transcript");
        expect("NOT_TXT", new Runnable() {
            @Override
            public void run() {
                MinutesText.checkFileName("a.hwp", "transcript");
            }
        });
        expect("NOT_TXT", new Runnable() {
            @Override
            public void run() {
                MinutesText.checkFileName(null, "transcript");
            }
        });
    }

    @Test
    public void 시간_예산을_넘기면_거부한다() {
        final MinutesBudget expired = new MinutesBudget(-1L);
        expect("PARSE_TIMEOUT", new Runnable() {
            @Override
            public void run() {
                expired.check("transcript", 1);
            }
        });
        assertTrue(MinutesBudget.standard().deadlineNanos() - System.nanoTime() > 0);
    }
}
