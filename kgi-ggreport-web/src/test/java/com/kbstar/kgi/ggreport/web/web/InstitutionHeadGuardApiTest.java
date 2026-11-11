package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 기관장 정보 문지기·스위치(NEXT 72·77) — 사번 없음 401·미등록 403·영업 밖 403·스위치 꺼짐 404·형식 밖 번호 404·기관 API 에 기관장 키 없음. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadGuardApiTest extends HeadApiTestBase {

    private int denied(String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", path);
    }

    @Test
    public void 사번이_없으면_401이고_접근_이력에_DENIED가_남는다() throws Exception {
        int before = denied("/institution-heads");
        int actBefore = count("SELECT COUNT(*) FROM INST_HEAD_ACT");
        MvcResult r = getAs("/institution-heads", null);
        assertEquals(text(r), 401, r.getResponse().getStatus());
        assertEquals(before + 1, denied("/institution-heads"));
        assertEquals("사번 없는 401 은 감사 표를 늘리지 않는다", actBefore, count("SELECT COUNT(*) FROM INST_HEAD_ACT"));
    }

    @Test
    public void 디자이너는_403이고_감사_표에_DENIED가_NONE_기관으로_남는다() throws Exception {
        int before = denied("/institution-heads");
        MvcResult r = getAs("/institution-heads", DESIGNER);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals(before + 1, denied("/institution-heads"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='LIST' AND OUTCOME='DENIED'"
                + " AND INSTITUTION_ID='NONE' AND ACTOR_EMP_NO=?", DESIGNER));
        // 기관 단위 경로도 같다 — 기관 id 는 형식이 맞으면 남긴다
        MvcResult d = getAs(headPath(INST), DESIGNER);
        assertEquals(403, d.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='VIEW' AND OUTCOME='DENIED' AND INSTITUTION_ID=?", INST));
    }

    @Test
    public void 비활성_사용자는_403이다() throws Exception {
        String old = jdbc.queryForObject("SELECT STATUS FROM USERS WHERE EMP_NO=?", String.class, T1);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", T1);
        try {
            MvcResult r = getAs("/institution-heads", T1);
            assertEquals(text(r), 403, r.getResponse().getStatus());
        } finally {
            jdbc.update("UPDATE USERS SET STATUS=? WHERE EMP_NO=?", old, T1);
        }
    }

    @Test
    public void 영업팀_팀장_부장은_통과한다() throws Exception {
        for (String emp : new String[]{T1, L1, D1}) {
            MvcResult r = getAs("/institution-heads", emp);
            assertEquals(emp + " " + text(r), 200, r.getResponse().getStatus());
        }
    }

    @Test
    public void 스위치를_끄면_모든_기관장_경로가_404_FEATURE_OFF이고_DB를_건드리지_않는다() throws Exception {
        int actBefore = count("SELECT COUNT(*) FROM INST_HEAD_ACT");
        settings.setEnabled(false);
        try {
            String[] gets = {"/institution-heads", headPath(INST), "/institution-heads/unmatched", "/institution-heads/candidates"};
            for (String p : gets) {
                MvcResult r = getAs(p, T1);
                assertEquals(p, 404, r.getResponse().getStatus());
                assertEquals(p, "FEATURE_OFF", code(json(r)));
            }
            MvcResult up = postJson(headPath(INST) + "/photos", T1, "{}");
            assertEquals(404, up.getResponse().getStatus());
            assertEquals("FEATURE_OFF", code(json(up)));
            MvcResult add = postJson(headsPath(INST), T1, headJson("홍길동", "구청장"));
            assertEquals(404, add.getResponse().getStatus());
            assertEquals("FEATURE_OFF", code(json(add)));
            assertEquals("꺼진 동안 감사 표는 그대로", actBefore, count("SELECT COUNT(*) FROM INST_HEAD_ACT"));
            assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=?", INST));
        } finally {
            settings.setEnabled(true);
        }
        assertEquals(200, getAs("/institution-heads", T1).getResponse().getStatus());
    }

    @Test
    public void 형식_밖_번호는_404이고_감사_표의_대상_번호는_비어_있다() throws Exception {
        MvcResult r = postJson(headPath(INST) + "/items/abc/confirm", T1, "{}");
        assertEquals(text(r), 404, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='ITEM_CONFIRM' AND OUTCOME='HIDDEN'"
                + " AND TARGET_ID IS NULL AND INSTITUTION_ID=?", INST));
        MvcResult zero = postJson(headPath(INST) + "/items/0/confirm", T1, "{}");
        assertEquals(404, zero.getResponse().getStatus());
        MvcResult longId = getAs(headPath(INST) + "/photos/1234567890123456789012/content", T1);
        assertEquals(404, longId.getResponse().getStatus());
    }

    @Test
    public void 기관_API_응답에는_기관장_키가_없다() throws Exception {
        MvcResult list = getAs("/institutions", T1);
        assertEquals(200, list.getResponse().getStatus());
        String s = text(list);
        assertFalse(s.contains("name_masked") || s.contains("head_id"));
        MvcResult one = getAs("/institutions/" + INST, T1);
        assertEquals(200, one.getResponse().getStatus());
        JsonNode j = json(one);
        assertTrue(j.isObject());
        assertFalse(text(one).contains("name_masked") || text(one).contains("head_id"));
    }
}
