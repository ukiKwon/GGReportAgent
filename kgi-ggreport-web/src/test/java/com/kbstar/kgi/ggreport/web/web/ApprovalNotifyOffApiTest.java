package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.service.NotificationCommandService;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.aop.framework.AopProxyUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 결재 요청 쪽지 끄기(ggreport.notify.approval-request.enabled=false, 사용자 11-23).
 * 시험 설정은 켜 두므로(컨텍스트를 쪼개지 않으려고) 이 시험이 런타임에 끄고 {@code @After} 에서 되돌린다.
 * 결재자 '결재알림'과 옛 '결재요청'만 사라지고, 결재함·'결재결과'·그 밖의 kind 는 그대로다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class ApprovalNotifyOffApiTest {

    private static final String MEMBER = "3918264";
    private static final String LEAD = "5047192";
    private static final String KNOWLEDGE_WRITE = "[{\"menu\":\"knowledge\",\"view\":true,\"write\":true}]";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private NotificationCommandService notes;

    private Object target() {
        return AopProxyUtils.getSingletonTarget(notes) != null ? AopProxyUtils.getSingletonTarget(notes) : notes;
    }

    @Before
    public void turnOff() {
        ReflectionTestUtils.setField(target(), "approvalRequestEnabled", false);
    }

    @After
    public void turnOn() {
        ReflectionTestUtils.setField(target(), "approvalRequestEnabled", true);
    }

    private JsonNode call(String emp, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b,
                          String body) throws Exception {
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        String text = mockMvc.perform(b.header(Actor.HEADER, emp)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return JSON.readTree(text);
    }

    private List<JsonNode> notesTo(String emp, String kind) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode n : call(emp, get("/notifications").param("recipient", emp), null)) {
            if (kind.equals(n.get("kind").asText())) {
                out.add(n);
            }
        }
        return out;
    }

    @Test
    public void 상신해도_결재알림은_0건이고_결재함에는_보인다_결과_쪽지는_요청자에게_간다() throws Exception {
        long id = call(MEMBER, post("/approval-requests/perm"),
                "{\"reason\":\"업무상 필요\",\"changes\":" + KNOWLEDGE_WRITE + "}").get("req_id").asLong();
        assertEquals(0, notesTo(LEAD, "결재알림").size());

        boolean inInbox = false;
        for (JsonNode n : call(LEAD, get("/approval-requests").param("box", "inbox"), null).get("items")) {
            inInbox |= n.get("req_id").asLong() == id;
        }
        assertTrue("쪽지를 꺼도 결재함에는 보여야 한다", inInbox);

        call(LEAD, post("/approval-requests/" + id + "/decide"), "{\"decision\":\"APPROVE\",\"comment\":\"확인\"}");
        assertEquals(1, notesTo(MEMBER, "결재결과").size());
    }

    @Test
    public void 반려해도_요청자_결재결과_쪽지는_1건이다() throws Exception {
        long id = call(MEMBER, post("/approval-requests/perm"),
                "{\"reason\":\"업무상 필요\",\"changes\":" + KNOWLEDGE_WRITE + "}").get("req_id").asLong();
        call(LEAD, post("/approval-requests/" + id + "/decide"), "{\"decision\":\"REJECT\",\"comment\":\"사유\"}");
        assertEquals(0, notesTo(LEAD, "결재알림").size());
        assertEquals(1, notesTo(MEMBER, "결재결과").size());
    }

    @Test
    public void 옛_결재요청_kind는_만들지_않고_그_밖의_kind는_그대로_만든다() throws Exception {
        assertNull(notes.create(LEAD, "결재요청", "제출 — 결재를 부탁드립니다.", null));
        assertEquals(0, notesTo(LEAD, "결재요청").size());
        assertNotNull(notes.create(LEAD, "쪽지", "일반 쪽지", null));
        assertEquals(1, notesTo(LEAD, "쪽지").size());
    }
}
