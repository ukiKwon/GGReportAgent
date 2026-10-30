package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 쪽지 수신자 1차 방어(NotificationGuard). 시드: 3918264 김영업(영업팀), 5047192 이영업(영업팀장), 8203417 마스터(전산팀). */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class NotificationGuardApiTest {

    private static final String SRC = "notification-guard-test";
    private static final String MEMBER = "3918264";
    private static final String LEAD = "5047192";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ConfigurableEnvironment env;
    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void enforceOn() {
        env.getPropertySources().addFirst(new MapPropertySource(SRC,
                Collections.<String, Object>singletonMap(NotificationGuard.PROP, "true")));
    }

    @After
    public void enforceOff() {
        env.getPropertySources().remove(SRC);
    }

    @Test
    public void 본인_사번_이름_소속_쪽지는_읽는다() throws Exception {
        send(MEMBER, "사번용");
        send("김영업", "이름용");
        send("영업팀", "소속용");
        assertEquals(1, inbox(MEMBER, 200, MEMBER).size());
        assertEquals(1, inbox(MEMBER, 200, "김영업").size());
        assertEquals(1, inbox(MEMBER, 200, "영업팀").size());
    }

    @Test
    public void 남의_사번만_요청하면_403이고_본문에_내부정보가_없다() throws Exception {
        send(LEAD, "팀장용");
        String body = mockMvc.perform(get("/notifications").param("recipient", LEAD).header("X-Emp-No", MEMBER))
                .andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(false, body.contains("팀장용"));
    }

    @Test
    public void 팀원은_상위_역할_이름으로_온_쪽지를_못_본다() throws Exception {
        send("영업팀장", "팀장 앞");
        inbox(MEMBER, 403, "영업팀장");
    }

    @Test
    public void 팀장은_소속_단체_쪽지를_본다() throws Exception {
        send("영업팀", "팀 전체");
        assertEquals(1, inbox(LEAD, 200, "영업팀").size());
    }

    @Test
    public void 일부만_남의_것이면_본인_것만_돌려준다() throws Exception {
        send(MEMBER, "내 것");
        send(LEAD, "남의 것");
        JsonNode got = inbox(MEMBER, 200, MEMBER, LEAD);
        assertEquals(1, got.size());
        assertEquals("내 것", got.get(0).path("content").asText());
    }

    @Test
    public void 헤더가_없으면_401_등록되지_않은_사번은_403() throws Exception {
        mockMvc.perform(get("/notifications").param("recipient", MEMBER)).andExpect(status().isUnauthorized());
        inbox("9999999", 403, "9999999");
    }

    @Test
    public void 읽음처리는_본인_쪽지만() throws Exception {
        String id = send(MEMBER, "읽기").path("notification_id").asText();
        mockMvc.perform(post("/notifications/" + id + "/read")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/notifications/" + id + "/read").header("X-Emp-No", LEAD))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/notifications/" + id + "/read").header("X-Emp-No", MEMBER))
                .andExpect(status().isOk());
    }

    @Test
    public void 없는_쪽지_읽음처리는_로그인했으면_404() throws Exception {
        mockMvc.perform(post("/notifications/ntf-00000000/read").header("X-Emp-No", MEMBER))
                .andExpect(status().isNotFound());
    }

    @Test
    public void 검사를_끄면_헤더_없이도_조회된다_호환모드() throws Exception {
        env.getPropertySources().remove(SRC);
        env.getPropertySources().addFirst(new MapPropertySource(SRC,
                Collections.<String, Object>singletonMap(NotificationGuard.PROP, "false")));
        mockMvc.perform(get("/notifications").param("recipient", "영업팀")).andExpect(status().isOk());
    }

    // -- 도구 --
    private JsonNode send(String to, String content) throws Exception {
        String res = mockMvc.perform(post("/notifications").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient\":\"" + to + "\",\"content\":\"" + content + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readTree(res);
    }

    private JsonNode inbox(String emp, int expected, String... recipients) throws Exception {
        MockHttpServletRequestBuilder b = get("/notifications").header("X-Emp-No", emp);
        for (String r : recipients) {
            b = b.param("recipient", r);
        }
        String res = mockMvc.perform(b).andExpect(status().is(expected)).andReturn()
                .getResponse().getContentAsString(StandardCharsets.UTF_8);
        return expected == 200 ? json.readTree(res) : null;
    }
}
