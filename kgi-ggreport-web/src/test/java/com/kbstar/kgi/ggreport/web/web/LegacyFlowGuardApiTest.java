package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.config.StaticCacheFilter;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 70 보안 조건 — 옛 흐름 스위치(B1·B5), 분석 실행 가드(B4), 캐시·접근 이력의 정적 판정(D9).
 *
 * <p>스위치는 지금 기본 열림(사용자 결정: '제안서 작성하기'와 함께 닫음)이라, 닫힘 동작은 이 테스트가
 * 스위치를 잠시 닫아 확인하고 finally 에서 되돌린다. 사번: 영업팀 3918264, 영업팀장 5047192, 영업부장 2674805, 관리자 8203417.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class LegacyFlowGuardApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LegacyFlowSwitch legacy;

    private int status(MockHttpServletRequestBuilder b, String emp) throws Exception {
        if (emp != null) {
            b = b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    private MockHttpServletRequestBuilder createCase() {
        return post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"nowon\",\"title\":\"스위치 테스트\"}");
    }

    private MockHttpServletRequestBuilder decide() {
        return post("/bidcases/any-case/participation-decisions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"tier\":1,\"role\":\"영업팀\",\"by\":\"x\",\"choice\":\"참여\"}");
    }

    @Test
    public void 옛_흐름이_닫히면_참여결정은_410_공고생성은_관리자만_조회는_가드() throws Exception {
        assertTrue("기본값은 지금 열림(사용자 결정)", legacy.isOpen());
        legacy.setOpenForTest(false);
        try {
            assertEquals(401, status(decide(), null));
            assertEquals(410, status(decide(), "3918264"));
            assertEquals(401, status(createCase(), null));
            assertEquals(403, status(createCase(), "5047192"));
            assertEquals(200, status(createCase(), "8203417"));
            assertEquals(401, status(get("/bidcases").param("team", "영업팀").param("assignee", "아무개"), null));
            assertEquals(403, status(get("/bidcases").param("team", "영업팀").param("assignee", "남의이름"), "3918264"));
            assertEquals(401, status(get("/bidcases/any-case"), null));
            assertEquals(200, status(get("/bidcases/latest"), null));   // 지도용, 그대로
        } finally {
            legacy.setOpenForTest(true);
        }
        // 다시 열면 옛 동작
        assertEquals(200, status(createCase(), null));
    }

    @Test
    public void 분석_실행은_영업팀장이나_그_기관_담당자만() throws Exception {
        assertEquals(401, status(post("/institutions/nowon/run"), null));
        assertEquals(403, status(post("/institutions/nowon/run"), "2674805"));   // 영업부장 제외(사용자 11-10)
        assertEquals(403, status(post("/institutions/nowon/run"), "3918264"));   // 담당 아닌 영업팀원
    }

    @Test
    public void 정적_판정은_화면_폴더만_API_다운로드는_캐시도_건너뛰기도_없다() {
        assertNull(StaticCacheFilter.policyFor("/tasks/1/files/a.png", ""));
        assertNull(StaticCacheFilter.policyFor("/institutions/x/files/a.js", ""));
        assertEquals("no-cache", StaticCacheFilter.policyFor("/geo/seoul.js", ""));
        assertTrue(StaticCacheFilter.isStaticPath("/favicon.ico"));
        assertTrue(StaticCacheFilter.isStaticPath("/js/app.js"));
        assertFalse(StaticCacheFilter.isStaticPath("/tasks/1/files/a.xlsx"));
        java.io.File front = new java.io.File("../frontend");
        java.io.File[] dirs = front.listFiles(java.io.File::isDirectory);
        if (dirs != null) {
            for (java.io.File d : dirs) {
                String n = d.getName();
                if ("test".equals(n) || "target".equals(n)) {
                    continue;
                }
                assertTrue("frontend/" + n + " 가 정적 폴더 목록에 없다", StaticCacheFilter.isStaticPath("/" + n + "/x.js"));
            }
        }
    }
}
