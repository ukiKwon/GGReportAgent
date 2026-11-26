package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** NEXT 129 ⑤ — 대본 Word 요청의 ai_fields 검사(감사 기록 전용). */
public class ScriptAiFieldsTest {

    private static void bad(List<String> raw) {
        try {
            ScriptAiFields.parse(raw);
            fail("400 이어야 한다: " + raw);
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
        }
    }

    @Test
    public void 중복은_하나로_고정_순서() {
        assertEquals(Arrays.asList("intro", "effect"), ScriptAiFields.parse(Arrays.asList("effect", "intro", "intro")));
    }

    @Test
    public void null과_빈_목록은_빈_목록() {
        assertEquals(Collections.emptyList(), ScriptAiFields.parse(null));
        assertEquals(Collections.emptyList(), ScriptAiFields.parse(Collections.<String>emptyList()));
    }

    @Test
    public void 유효_키_여덟_개_반복은_접어_받는다() {
        assertEquals(Arrays.asList("intro", "effect"),
                ScriptAiFields.parse(Arrays.asList("intro", "effect", "intro", "effect", "intro", "effect", "intro", "effect")));
    }

    @Test
    public void 모르는_키와_아홉_개_이상과_null_원소는_400() {
        bad(Arrays.asList("profit_note"));
        bad(Arrays.asList("status_note"));
        bad(Arrays.asList("intro", "effect", "intro", "effect", "intro", "effect", "intro", "effect", "intro"));
        bad(Arrays.asList((String) null));
    }

    @Test
    public void 행위_코드는_30자_이내() {
        assertEquals("SCRIPT_DOCX_AI_INTRO", ScriptAiFields.actionOf("intro"));
        assertEquals("SCRIPT_DOCX_AI_EFFECT", ScriptAiFields.actionOf("effect"));
        assertTrue(ScriptAiFields.actionOf("effect").length() <= 30);
    }
}
