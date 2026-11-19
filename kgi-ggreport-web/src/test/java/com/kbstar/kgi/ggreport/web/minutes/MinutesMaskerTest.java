package com.kbstar.kgi.ggreport.web.minutes;

import com.kbstar.kgi.ggreport.web.support.Pii;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.budget;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.cp;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.expect;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 이름 사전의 이름은 모두 가상이다(가상일·도담·Zorin). */
public class MinutesMaskerTest {

    private static final MinutesMasker M = new MinutesMasker(Arrays.asList("가상일", "도담", "Zorin"));

    private static MinutesMasker.Session session() {
        return M.newSession(null, null, budget());
    }

    @Test
    public void 휴대폰_이메일_주민번호는_가림으로_바뀐다() {
        MinutesMasker.Session s = session();
        String out = s.mask("연락처 010-1234-5678 입니다. 메일 test.user@example.com 주민 900101-1234567");
        assertEquals("연락처 [가림] 입니다. 메일 [가림] 주민 [가림]", out);
        assertEquals(3, s.piiCount());
    }

    @Test
    public void 해제를_요청해도_개인정보는_남지_않는다() {
        MinutesMasker.Session s = M.newSession(null, Collections.singletonList("가상일"), budget());
        String out = s.mask("가상일 010-1234-5678");
        assertEquals("가상일 [가림]", out);      // 이름은 해제로 그대로 두고, 전화는 가린다
        assertEquals(1, s.releasedCount());
        assertEquals(0, s.nameCount());
        s.validateRelease();                    // 이번 업로드에서 걸린 이름이므로 통과
    }

    @Test
    public void 구분자를_바꾼_번호도_가린다() {
        List<String> inputs = Arrays.asList("010 1234 5678", "010/1234/5678", "01012345678", "9001011234567",
                "카드 1234-5678-9012-3456", "전화 02-345-6789", "a@b.co");
        for (String in : inputs) {
            String out = session().mask(in);
            assertFalse(in, out.matches(".*\\d{4}.*"));
            assertTrue(in, Pii.scanExternal(out).isEmpty());
        }
    }

    @Test
    public void 안전망은_정규식이_놓친_번호의_줄을_통째로_가린다() {
        // 전각 숫자는 정규식(\d)이 못 잡고 Pii.scanExternal 의 접힘(비ASCII 십진 숫자 → ASCII)이 잡는다.
        MinutesMasker.Session s = session();
        String out = s.mask("전화는 ０１０-１２３４-５６７８ 입니다");
        assertEquals(MinutesMasker.LINE_TOKEN, out);
        assertEquals(1, s.lineCount());
        assertEquals(0, s.piiCount());
        assertTrue(Pii.scanExternal(out).isEmpty());
    }

    @Test
    public void 이름_사전에_걸린_이름은_고정_표기로_바뀐다() {
        MinutesMasker.Session s = session();
        assertEquals("[이름]님이 오셨습니다", s.mask("가상일님이 오셨습니다"));
        assertEquals("[이름] 씨 입니다", s.mask("zorin 씨 입니다"));
        assertEquals(2, s.nameCount());
        assertEquals(Integer.valueOf(1), s.nameHits().get("가상일"));
    }

    @Test
    public void 폭_없는_문자로_쪼갠_이름도_정규화_뒤에_가려진다() {
        String line = MinutesText.prepare("가​상​일님".getBytes(MinutesTestSupport.UTF8), "t").lines[0];
        assertEquals("[이름]님", session().mask(line));
    }

    @Test
    public void 두_글자_이름은_경계가_있을_때만_가린다() {
        MinutesMasker.Session s = session();
        assertEquals("[이름] 님이 말했다", s.mask("도담 님이 말했다"));
        assertEquals("[이름]는 왔다", s.mask("도담는 왔다"));   // 조사가 오면 가린다(문법은 따지지 않는다)
        assertEquals("가도담나 서도담지", s.mask("가도담나 서도담지"));   // 앞 글자가 한글이면 가리지 않는다
        assertEquals(2, s.nameCount());
    }

    @Test
    public void 성과_직함은_성만_가린다() {
        MinutesMasker.Session s = session();
        assertEquals("[이름] 부장님 말씀", s.mask("김 부장님 말씀"));
        assertEquals("[이름]과장이 확인", s.mask("박과장이 확인"));
        assertEquals(2, s.titleCount());
    }

    @Test
    public void 담당자_지정_단어는_긴_것부터_가리고_라틴은_대소문자를_가리지_않는다() {
        MinutesMasker.Session s = M.newSession(Arrays.asList("가나", "가나다라", "ABC"), null, budget());
        assertEquals("[이름]마 [이름]", s.mask("가나다라마 가나"));
        assertEquals("[이름] [이름] x", s.mask("abc Abc x"));
        assertEquals(4, s.termCount());
    }

    @Test
    public void 가림_단어가_잘못되면_400이다() {
        expect("TERMS_INVALID", new Runnable() {
            @Override
            public void run() {
                M.newSession(Collections.singletonList("a"), null, budget());
            }
        });
        expect("TERMS_INVALID", new Runnable() {
            @Override
            public void run() {
                M.newSession(Collections.singletonList("가나\u0007다"), null, budget());
            }
        });
        final List<String> many = new ArrayList<String>();
        for (int i = 0; i < 101; i++) {
            many.add("단어" + i);
        }
        MinutesException e = expect("TERMS_INVALID", new Runnable() {
            @Override
            public void run() {
                M.newSession(many, null, budget());
            }
        });
        assertEquals(400, e.getStatus());
    }

    @Test
    public void 이번_업로드에서_걸리지_않은_이름은_해제할_수_없다() {
        final MinutesMasker.Session s = M.newSession(null, Collections.singletonList("도담"), budget());
        s.mask("아무 이름도 없는 말");
        MinutesException e = expect("RELEASE_INVALID", new Runnable() {
            @Override
            public void run() {
                s.validateRelease();
            }
        });
        assertEquals(400, e.getStatus());
    }

    @Test
    public void 가린_결과는_다시_가려도_같고_줄바꿈은_유지된다() {
        MinutesMasker.Session s = session();
        String once = s.mask("가상일\n둘째 줄 010-1234-5678");
        assertEquals("[이름]\n둘째 줄 [가림]", once);
        assertEquals(once, session().mask(once));
    }

    @Test
    public void 가린_결과에는_개인정보_검사가_늘_비어_있다() {
        List<String> inputs = Arrays.asList(
                "010-1234-5678과 test@example.com 그리고 900101-1234567",
                "전화 ０１０-１２３４-５６７８ 입니다",
                "가상일 부장이 02-123-4567 로 연락");
        for (String in : inputs) {
            String out = session().mask(in);
            assertTrue(in, Pii.scanExternal(out).isEmpty());
        }
    }

    @Test
    public void 수정_저장은_가릴_것이_남아_있으면_건수만_알리고_거부한다() {
        final MinutesBudget b = budget();
        MinutesException e = expect("MASK_REQUIRED", new Runnable() {
            @Override
            public void run() {
                M.requireClean("가상일이 참석했다", b);
            }
        });
        Map<String, Integer> kinds = e.getKinds();
        assertEquals(Integer.valueOf(1), kinds.get("name"));
        assertFalse(e.toDetail().toString().contains("가상일"));
        assertEquals(422, e.getStatus());

        assertEquals(Integer.valueOf(1), M.check("010-1234-5678", b).get("pii"));
        assertEquals(Integer.valueOf(1), M.check("김 부장", b).get("title"));
    }

    @Test
    public void 직접_입력한_고정_표기와_깨끗한_글은_수정_저장을_통과한다() {
        M.requireClean("[이름]이 참석했다. 안건은 가상 안건이다.", budget());
        assertTrue(M.check("깨끗한 글", budget()).isEmpty());
    }

    @Test
    public void 수정_저장은_정규화된_글을_돌려준다() {
        assertEquals("[이름]이 참석했다", M.requireClean("[이름]이" + cp(0x200B) + " 참석했다", budget()));
        assertEquals("Hello 안건 3", M.requireClean("Ｈｅｌｌｏ" + cp(0x00AD) + " 안건 ３", budget()));
    }

    @Test
    public void 보이지_않는_문자로_쪼갠_이름도_수정_저장에서_걸린다() {
        int[] hidden = {0x00AD, 0x3164, 0xFFA0, 0xFE0F, 0x200B, 0x034F, 0x180B};
        for (int code : hidden) {
            String h = cp(code);
            final String text = "가" + h + "상" + h + "일이 참석했다";
            MinutesException e = expect("MASK_REQUIRED", new Runnable() {
                @Override
                public void run() {
                    M.requireClean(text, budget());
                }
            });
            assertEquals(Integer.valueOf(1), e.getKinds().get("name"));
            assertEquals(422, e.getStatus());
            // 업로드 경로도 같다 — 정규화한 줄이 가려진다
            String line = MinutesText.prepare(text.getBytes(MinutesTestSupport.UTF8), "t").lines[0];
            assertEquals("[이름]이 참석했다", session().mask(line));
        }
    }

    @Test
    public void 양방향_제어가_섞인_수정_글은_422_CONTROL_CHAR다() {
        expect("CONTROL_CHAR", new Runnable() {
            @Override
            public void run() {
                M.requireClean("가" + cp(0x202E) + "상일", budget());
            }
        });
    }

    @Test
    public void 두_글자_이름은_더_많은_조사_앞에서_가려진다() {
        String[] tails = {"에서", "하고", "랑", "로", "으로", "처럼", "께서", "에게서", "부터", "까지"};
        for (String t : tails) {
            MinutesMasker.Session s = session();
            assertEquals("[이름]" + t + " 말했다", s.mask("도담" + t + " 말했다"));
            assertEquals(t, 1, s.nameCount());
        }
    }

    @Test
    public void 라틴_이름은_단어_경계에서만_가려진다() {
        MinutesMasker.Session s = session();
        assertEquals("Zorinsky 발표", s.mask("Zorinsky 발표"));
        assertEquals("xZorin 발표", s.mask("xZorin 발표"));
        assertEquals("([이름]) 발표, [이름]님", s.mask("(Zorin) 발표, Zorin님"));
        assertEquals("[이름]", s.mask("zorin"));
        assertEquals(3, s.nameCount());
    }

    @Test
    public void 등록_때_해제한_이름도_수정_때는_다시_걸린다() {
        // 수정 검사는 해제 목록 없이 돌린다
        assertEquals(Integer.valueOf(1), M.check("도담 님 말씀", budget()).get("name"));
    }
}
