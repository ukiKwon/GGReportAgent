package com.kbstar.kgi.ggreport.web.docout;

import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** HeadDocBuilder.hasContent — 권한대행·생년월일 칸만 있으면 문서에 담을 내용이 없다(생년월일은 Word 에 넣지 않는다, 사용자 결정 2026-11-19). */
public class HeadDocBuilderHasContentTest {

    private static Map<String, Object> detail(String... fieldKeys) {
        Map<String, Object> fields = new HashMap<String, Object>();
        for (String k : fieldKeys) {
            fields.put(k, new HashMap<String, Object>());
        }
        Map<String, Object> head = new HashMap<String, Object>();
        head.put("fields", fields);
        head.put("education", new ArrayList<Map<String, Object>>());
        head.put("career", new ArrayList<Map<String, Object>>());
        Map<String, Object> d = new HashMap<String, Object>();
        d.put("head", head);
        return d;
    }

    @Test
    public void 생년월일만_있으면_false다() {
        assertFalse(HeadDocBuilder.hasContent(detail("BIRTH_DATE")));
    }

    @Test
    public void 권한대행과_생년월일만_있어도_false다() {
        assertFalse(HeadDocBuilder.hasContent(detail("ACTING", "BIRTH_DATE")));
    }

    @Test
    public void 생년월일에_이름이_더해지면_true다() {
        assertTrue(HeadDocBuilder.hasContent(detail("BIRTH_DATE", "NAME")));
    }

    @Test
    public void 생년월일만_있어도_학력이_있으면_true다() {
        Map<String, Object> d = detail("BIRTH_DATE");
        @SuppressWarnings("unchecked")
        Map<String, Object> head = (Map<String, Object>) d.get("head");
        List<Map<String, Object>> edu = new ArrayList<Map<String, Object>>();
        edu.add(new HashMap<String, Object>());
        head.put("education", edu);
        assertTrue(HeadDocBuilder.hasContent(d));
    }
}
