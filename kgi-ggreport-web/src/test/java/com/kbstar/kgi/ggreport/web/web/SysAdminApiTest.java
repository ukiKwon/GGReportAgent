package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 시스템 관리 API(사용자·권한·접근 이력). 시드 사용자(009): 마스터 {@code 8203417}(전산팀 = 유일한 관리자),
 * 영업팀 팀원 {@code 3918264}, 영업팀장 {@code 5047192}.
 *
 * <p>⚠️ {@code @Transactional} 로 사용자·권한 변경은 롤백한다. 단 접근 이력은 {@code REQUIRES_NEW} 로
 * <b>따로 커밋</b>되므로(막힌 시도가 롤백으로 사라지면 안 된다) 테스트가 끝나도 남는다 — 그래서 이력은
 * "있다/내용이 이렇다"로만 단정하고 개수의 정확한 값에 기대지 않는다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class SysAdminApiTest {

    private static final String ADMIN = "8203417";
    private static final String SALES_MEMBER = "3918264";

    @Autowired
    private MockMvc mockMvc;

    private ResultActions asAdmin(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b)
            throws Exception {
        return mockMvc.perform(b.header(Actor.HEADER, ADMIN));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder json(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b, String body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    /**
     * 시드에서 전산팀 역할 5명이 모두 관리자다(역할 기본값). "마지막 관리자" 시나리오를 만들려면
     * 마스터만 남겨야 한다 — 나머지 4명의 권한관리 조회를 끈다(다른 관리자가 있으니 허용된다).
     */
    private void leaveOnlyMaster() throws Exception {
        for (String other : new String[]{"4482971", "4907362", "6513840", "2748195"}) {
            asAdmin(json(put("/sysadmin/perms/" + other), "{\"changes\":[{\"menu\":\"admin\",\"view\":false}]}"))
                    .andExpect(status().isOk());
        }
    }

    // ── 문지기 ────────────────────────────────────────────────────────

    @Test
    public void 사번이_없으면_401() throws Exception {
        mockMvc.perform(get("/sysadmin/users")).andExpect(status().isUnauthorized());
    }

    @Test
    public void 관리자가_아니면_403이고_거부가_이력에_남는다() throws Exception {
        mockMvc.perform(get("/sysadmin/users").header(Actor.HEADER, SALES_MEMBER))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").exists());
        asAdmin(get("/sysadmin/access-log").param("event", "DENIED").param("emp", SALES_MEMBER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(greaterThan(0)))
                .andExpect(jsonPath("$.items[0].event_type").value("DENIED"))
                .andExpect(jsonPath("$.items[0].emp_verified").value(false));
    }

    @Test
    public void 형식이_틀린_사번_헤더는_없는_것으로_본다() throws Exception {
        mockMvc.perform(get("/sysadmin/users").header(Actor.HEADER, "12345"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/sysadmin/users").header(Actor.HEADER, "1234567' OR '1'='1"))
                .andExpect(status().isUnauthorized());
    }

    // ── 사용자 ────────────────────────────────────────────────────────

    @Test
    public void 관리자는_사용자_목록과_선택지를_본다() throws Exception {
        asAdmin(get("/sysadmin/users")).andExpect(status().isOk())
                .andExpect(jsonPath("$.users", hasSize(25)))
                .andExpect(jsonPath("$.users[0].emp_no").value("1473958"));
        asAdmin(get("/sysadmin/meta")).andExpect(status().isOk())
                .andExpect(jsonPath("$.grades.TEAM_LEAD").value("팀장급"))
                .andExpect(jsonPath("$.grades.DEPT_HEAD").value("부장급"))
                .andExpect(jsonPath("$.grades.EXECUTIVE").value("대표급"))
                .andExpect(jsonPath("$.menus[?(@.key=='approvals')].approvable").value(hasItem(true)))
                .andExpect(jsonPath("$.menus[?(@.key=='map')].approvable").value(hasItem(false)));
    }

    @Test
    public void 사용자_등록은_서버가_다시_검증한다() throws Exception {
        String ok = "{\"emp_no\":\"1111111\",\"name\":\"가상직원\",\"role\":\"영업팀\",\"position_title\":\"계장\",\"approval_grade\":\"NONE\"}";
        asAdmin(json(post("/sysadmin/users"), ok)).andExpect(status().isOk())
                .andExpect(jsonPath("$.emp_no").value("1111111"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        asAdmin(json(post("/sysadmin/users"), ok)).andExpect(status().isConflict());
        asAdmin(json(post("/sysadmin/users"), ok.replace("1111111", "11111")))
                .andExpect(status().isBadRequest());
        asAdmin(json(post("/sysadmin/users"), ok.replace("1111111", "2222222").replace("영업팀", "없는역할")))
                .andExpect(status().isBadRequest());
        asAdmin(json(post("/sysadmin/users"), ok.replace("1111111", "3333333").replace("NONE", "CEO")))
                .andExpect(status().isBadRequest());
        asAdmin(json(post("/sysadmin/users"), ok.replace("1111111", "4444444").replace("가상직원", "  ")))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 마지막_관리자는_잠그거나_퇴직시키거나_역할을_바꿀_수_없다() throws Exception {
        leaveOnlyMaster();
        asAdmin(json(put("/sysadmin/users/" + ADMIN + "/status"), "{\"status\":\"LOCKED\"}"))
                .andExpect(status().isBadRequest());
        asAdmin(json(put("/sysadmin/users/" + ADMIN + "/status"), "{\"status\":\"RETIRED\"}"))
                .andExpect(status().isBadRequest());
        asAdmin(json(put("/sysadmin/users/" + ADMIN), "{\"name\":\"마스터\",\"role\":\"영업팀\"}"))
                .andExpect(status().isBadRequest());
        asAdmin(get("/sysadmin/users")).andExpect(jsonPath("$.users[?(@.emp_no=='" + ADMIN + "')].status")
                .value(hasItem("ACTIVE")));
    }

    @Test
    public void 잠긴_사용자는_로그인할_수_없고_해제하면_된다() throws Exception {
        asAdmin(json(put("/sysadmin/users/" + SALES_MEMBER + "/status"), "{\"status\":\"LOCKED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("LOCKED"));
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"" + SALES_MEMBER + "\"}"))
                .andExpect(status().isForbidden());
        asAdmin(json(put("/sysadmin/users/" + SALES_MEMBER + "/status"), "{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"" + SALES_MEMBER + "\"}"))
                .andExpect(status().isOk());
    }

    // ── 권한 ──────────────────────────────────────────────────────────

    @Test
    public void 역할_기본값을_보여_주고_결재_가능_메뉴를_표시한다() throws Exception {
        asAdmin(get("/sysadmin/perms/" + SALES_MEMBER)).andExpect(status().isOk())
                .andExpect(jsonPath("$.menus[?(@.menu_key=='map')].view").value(hasItem(true)))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='map')].source").value(hasItem("role")))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='approvals')].view").value(hasItem(false)))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='approvals')].approvable").value(hasItem(true)))
                // 모르는(결재 개념이 없는) 메뉴는 결재를 체크해 두지 않는다
                .andExpect(jsonPath("$.menus[?(@.menu_key=='map')].approve").value(hasItem(false)));
    }

    @Test
    public void 결재를_켜면_조회가_자동으로_켜지고_변경_이력이_남는다() throws Exception {
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"approvals\",\"view\":false,\"write\":false,\"edit\":false,\"approve\":true}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(1));
        asAdmin(get("/sysadmin/perms/" + SALES_MEMBER))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='approvals')].view").value(hasItem(true)))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='approvals')].approve").value(hasItem(true)))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='approvals')].source").value(hasItem("user")));
        asAdmin(get("/sysadmin/perm-changes").param("emp", SALES_MEMBER)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].item").value(hasItem("perm:approvals:CAN_APPROVE")))
                .andExpect(jsonPath("$.items[*].item").value(hasItem("perm:approvals:CAN_VIEW")))
                .andExpect(jsonPath("$.items[0].actor_emp_no").value(ADMIN));
    }

    @Test
    public void 결재가_없는_메뉴에는_결재_권한을_줄_수_없다() throws Exception {
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"map\",\"view\":true,\"write\":false,\"edit\":false,\"approve\":true}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("결재")));
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"nope\",\"view\":true}]}")).andExpect(status().isBadRequest());
    }

    @Test
    public void 조회를_끄면_작성_수정_결재도_꺼지고_같은_값_저장은_이력을_늘리지_않는다() throws Exception {
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"tasks\",\"view\":true,\"write\":true,\"edit\":true,\"approve\":true}]}"))
                .andExpect(jsonPath("$.saved").value(1));
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"tasks\",\"view\":false,\"write\":true,\"edit\":true,\"approve\":true}]}"))
                .andExpect(jsonPath("$.saved").value(1));
        asAdmin(get("/sysadmin/perms/" + SALES_MEMBER))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='tasks')].write").value(hasItem(false)))
                .andExpect(jsonPath("$.menus[?(@.menu_key=='tasks')].approve").value(hasItem(false)));
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"tasks\",\"view\":false,\"write\":false,\"edit\":false,\"approve\":false}]}"))
                .andExpect(jsonPath("$.saved").value(0));
    }

    @Test
    public void 마지막_관리자의_권한관리_조회는_끌_수_없다() throws Exception {
        leaveOnlyMaster();
        asAdmin(json(put("/sysadmin/perms/" + ADMIN),
                "{\"changes\":[{\"menu\":\"admin\",\"view\":false}]}"))
                .andExpect(status().isBadRequest());
        asAdmin(get("/sysadmin/users")).andExpect(status().isOk());   // 여전히 들어올 수 있다
    }

    @Test
    public void 다른_관리자를_먼저_만들면_옮길_수_있다() throws Exception {
        leaveOnlyMaster();
        asAdmin(json(put("/sysadmin/perms/" + SALES_MEMBER),
                "{\"changes\":[{\"menu\":\"admin\",\"view\":true}]}")).andExpect(jsonPath("$.saved").value(1));
        asAdmin(json(put("/sysadmin/perms/" + ADMIN),
                "{\"changes\":[{\"menu\":\"admin\",\"view\":false}]}")).andExpect(status().isOk());
    }

    // ── 로그인·접근 이력 ──────────────────────────────────────────────

    @Test
    public void 사번_로그인은_프로필을_돌려주고_실패는_구분없이_401() throws Exception {
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"5047192\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("이영업"))
                .andExpect(jsonPath("$.role").value("영업팀장"))
                .andExpect(jsonPath("$.approval_grade").value("TEAM_LEAD"));
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"0000000\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"abc\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(json(post("/auth/login"), "{}")).andExpect(status().isUnauthorized());
        asAdmin(get("/sysadmin/access-log").param("event", "LOGIN_OK").param("emp", "5047192"))
                .andExpect(jsonPath("$.total").value(greaterThan(0)));
        asAdmin(get("/sysadmin/access-log").param("event", "LOGIN_FAIL"))
                .andExpect(jsonPath("$.items[*].detail").value(hasItem("unknown employee")))
                .andExpect(jsonPath("$.items[*].detail").value(hasItem("bad format")));
    }

    @Test
    public void API_요청이_사번과_함께_남고_본문과_질의값은_남지_않는다() throws Exception {
        mockMvc.perform(get("/menus").param("role", "SECRET-QUERY-VALUE").header(Actor.HEADER, "5047192"))
                .andExpect(status().isOk());
        asAdmin(get("/sysadmin/access-log").param("event", "API").param("emp", "5047192").param("size", "5"))
                .andExpect(jsonPath("$.items[0].req_path").value("/menus"))
                .andExpect(jsonPath("$.items[0].http_method").value("GET"))
                .andExpect(jsonPath("$.items[0].status_code").value(200))
                .andExpect(jsonPath("$.items[0].emp_verified").value(false))
                .andExpect(jsonPath("$.items[*].req_path").value(not(hasItem(containsString("SECRET")))));
    }

    @Test
    public void 로그_위조를_위한_줄바꿈은_공백이_된다() throws Exception {
        mockMvc.perform(json(post("/auth/login"), "{\"emp_no\":\"5047192\"}")
                .header("User-Agent", "evil\r\n2026-01-01 LOGIN_OK admin")).andExpect(status().isOk());
        asAdmin(get("/sysadmin/access-log").param("event", "LOGIN_OK").param("emp", "5047192").param("size", "1"))
                .andExpect(jsonPath("$.items[0].user_agent").value("evil  2026-01-01 LOGIN_OK admin"));
    }

    @Test
    public void 화면_열람은_알려진_메뉴_키만_기록한다() throws Exception {
        mockMvc.perform(json(post("/auth/screen"), "{\"screen\":\"admin:users\"}").header(Actor.HEADER, "5047192"))
                .andExpect(jsonPath("$.ok").value(true));
        mockMvc.perform(json(post("/auth/screen"), "{\"screen\":\"<script>\"}").header(Actor.HEADER, "5047192"))
                .andExpect(jsonPath("$.ok").value(false));
        mockMvc.perform(json(post("/auth/screen"), "{\"screen\":\"hacker\"}").header(Actor.HEADER, "5047192"))
                .andExpect(jsonPath("$.ok").value(false));
    }

    @Test
    public void 접근_이력_조회는_필터와_쪽수_상한을_가진다() throws Exception {
        asAdmin(get("/sysadmin/access-log").param("size", "100000")).andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200));
        asAdmin(get("/sysadmin/access-log").param("from", "2999-01-01"))
                .andExpect(jsonPath("$.total").value(0));
        asAdmin(get("/sysadmin/access-log").param("from", "not-a-date")).andExpect(status().isOk());
    }
}
