package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 권한 저장 — Task 5B.4. {@code PUT /menus}.
 *
 * <p>⚠️ <b>{@code @Transactional} 로 롤백한다.</b> {@code ROLE_MENUS} 에 행이 남으면
 * 그 뒤에 도는 메뉴 조회 골든({@code 04}·{@code 05})이 기본값 대신 저장값을 보게 되어
 * <b>실행 순서에 따라</b> 깨진다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class MenuSaveApiTest {

    private static final String ADMIN = "8203417";        // 마스터(전산팀) — 유일한 관리자 시드
    private static final String SALES_MEMBER = "3918264"; // 김영업(영업팀) — 관리자 아님

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private com.kbstar.kgi.ggreport.web.service.MenuService menuService;

    /** 서비스 직접 호출(행위자 없음) — 본인 역할 줄 규칙 없이 잠김 방지 판정만 본다. */
    private void saveDirect(String role, String menu, boolean enabled) {
        com.kbstar.kgi.ggreport.web.dto.MenuChangesIn.MenuChange c = new com.kbstar.kgi.ggreport.web.dto.MenuChangesIn.MenuChange();
        c.setRole(role);
        c.setMenu(menu);
        c.setEnabled(enabled);
        menuService.save(java.util.Collections.singletonList(c));
    }

    private org.springframework.test.web.servlet.ResultActions save(String changes) throws Exception {
        return saveAs(ADMIN, changes);
    }

    private org.springframework.test.web.servlet.ResultActions saveAs(String emp, String changes) throws Exception {
        return mockMvc.perform(put("/menus")
                .header(Actor.HEADER, emp)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"changes\":" + changes + "}"));
    }

    private String roleMenus(String role) throws Exception {
        return mockMvc.perform(get("/menus").param("role", role))
                .andReturn().getResponse().getContentAsString();
    }

    /** R2: 관리자가 아니면 403 — 값은 그대로다. */
    @Test
    public void 관리자가_아니면_403이고_저장되지_않는다() throws Exception {
        String before = roleMenus("예산팀");
        saveAs(SALES_MEMBER, "[{\"role\":\"예산팀\",\"menu\":\"knowledge\",\"enabled\":false}]")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").exists());
        org.junit.Assert.assertEquals(before, roleMenus("예산팀"));
    }

    /** R2: 사번 헤더가 없으면 401 — 값은 그대로다. */
    @Test
    public void 사번_헤더가_없으면_401이고_저장되지_않는다() throws Exception {
        String before = roleMenus("예산팀");
        mockMvc.perform(put("/menus")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changes\":[{\"role\":\"예산팀\",\"menu\":\"knowledge\",\"enabled\":false}]}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").exists());
        org.junit.Assert.assertEquals(before, roleMenus("예산팀"));
    }

    /** 조치 D 회귀: 깨진 JSON 같은 스프링 MVC 오류는 500 으로 둔갑하지 않고 400 이다. */
    @Test
    public void 깨진_JSON은_400이다() throws Exception {
        mockMvc.perform(put("/menus").header(Actor.HEADER, ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 바뀐_칸만_저장하고_개수를_돌려준다() throws Exception {
        save("[{\"role\":\"예산팀\",\"menu\":\"knowledge\",\"enabled\":false}]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(1));

        mockMvc.perform(get("/menus").param("role", "예산팀"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.menus.knowledge").value(false));
    }

    /** 같은 칸을 다시 저장해도 늘지 않는다(upsert) — 갱신 먼저, 없으면 삽입. */
    @Test
    public void 같은_칸을_두_번_저장해도_안전하다() throws Exception {
        save("[{\"role\":\"예산팀\",\"menu\":\"knowledge\",\"enabled\":false}]")
                .andExpect(status().isOk());
        save("[{\"role\":\"예산팀\",\"menu\":\"knowledge\",\"enabled\":true}]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(1));

        mockMvc.perform(get("/menus").param("role", "예산팀"))
                .andExpect(jsonPath("$.menus.knowledge").value(true));
    }

    /**
     * ⚠️ 이 테스트가 이 클래스의 이유다. 권한관리를 <b>모든 역할에서 끄면</b> 아무도 이
     * 화면에 들어올 수 없고, <b>되돌릴 화면이 바로 그 화면</b>이라 복구 방법이 없다.
     * 판정은 저장 <b>전</b>이어야 한다 — 저장하고 확인하면 이미 늦다.
     */
    @Test
    public void 권한관리를_모든_역할에서_끄는_저장은_거부한다() throws Exception {
        // 기본값에서 admin 이 켜진 곳은 전산팀 하나다(Menus 기본 격자). API 로는 마스터(전산팀) 본인 역할 줄이라 먼저 400.
        save("[{\"role\":\"전산팀\",\"menu\":\"admin\",\"enabled\":false}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists());
        // 잠김 방지 판정 자체는 서비스에서 고정한다(행위자 없음)
        try {
            saveDirect("전산팀", "admin", false);
            org.junit.Assert.fail("모든 관리자가 사라지는 저장은 400 이어야 한다");
        } catch (com.kbstar.kgi.ggreport.web.web.ApiException e) {
            org.junit.Assert.assertEquals(400, e.getStatus());
        }

        // 거부됐으므로 저장 전 상태 그대로여야 한다 — 반쯤 적용되면 안 된다.
        mockMvc.perform(get("/menus").param("role", "전산팀"))
                .andExpect(jsonPath("$.menus.admin").value(true));
    }

    /** 다른 역할에 먼저 켜 두면 옮기는 것은 된다 — 잠기는 저장만 막는 것이지 고정이 아니다. */
    @Test
    public void 다른_역할에_먼저_켜두면_옮길_수_있다() throws Exception {
        userAdminView(SALES_MEMBER, true);   // 다른 역할(영업팀)의 관리자가 바꾼다 — 자기 역할 줄은 못 바꾼다(11-16)
        saveAs(SALES_MEMBER, "[{\"role\":\"영업팀장\",\"menu\":\"admin\",\"enabled\":true},"
                + "{\"role\":\"전산팀\",\"menu\":\"admin\",\"enabled\":false}]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(2));

        mockMvc.perform(get("/menus").param("role", "영업팀장"))
                .andExpect(jsonPath("$.menus.admin").value(true));
        mockMvc.perform(get("/menus").param("role", "전산팀"))
                .andExpect(jsonPath("$.menus.admin").value(false));
    }

    @Test
    public void 모르는_메뉴나_역할은_400이다() throws Exception {
        save("[{\"role\":\"영업팀\",\"menu\":\"없는메뉴\",\"enabled\":true}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("모르는 메뉴입니다: 없는메뉴"));

        save("[{\"role\":\"없는역할\",\"menu\":\"chat\",\"enabled\":true}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("모르는 역할입니다: 없는역할"));
    }

    /** 빈 변경 목록은 오류가 아니다 — 화면이 아무것도 안 바꾸고 저장을 누를 수 있다. */
    @Test
    public void 빈_변경목록은_0건_저장이다() throws Exception {
        save("[]").andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(0));
    }

    // ── NEXT 84: 잠김 방지는 '칸'이 아니라 '권한관리를 볼 수 있는 활성 사용자'로 판정한다 ──

    private void userAdminView(String emp, boolean view) throws Exception {
        mockMvc.perform(put("/sysadmin/perms/" + emp).header(Actor.HEADER, ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"changes\":[{\"menu\":\"admin\",\"view\":" + view + "}]}"))
                .andExpect(status().isOk());
    }

    /** 전산팀장 역할에 켜 두면(033 과 같은 상태) 전산팀 역할의 권한관리를 꺼도 된다. */
    @Test
    public void 전산팀장에_켜두면_전산팀_역할의_권한관리를_꺼도_된다() throws Exception {
        userAdminView(SALES_MEMBER, true);
        saveAs(SALES_MEMBER, "[{\"role\":\"전산팀장\",\"menu\":\"admin\",\"enabled\":true},{\"role\":\"전산팀\",\"menu\":\"admin\",\"enabled\":false}]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(2));
    }

    /** 역할 칸은 켜져 있어도 그 역할 사람이 모두 사용자 예외로 꺼져 있으면 잠기는 저장이다 — 거부. */
    @Test
    public void 역할에_켜져_있어도_볼_수_있는_활성_사용자가_없으면_거부한다() throws Exception {
        save("[{\"role\":\"전산팀장\",\"menu\":\"admin\",\"enabled\":true}]").andExpect(status().isOk());
        userAdminView("6295038", false);
        userAdminView("8892046", false);
        try {   // 행위자 없는 서비스 호출로 잠김 방지만 본다(API 로는 마스터 본인 역할 줄이라 먼저 400)
            saveDirect("전산팀", "admin", false);
            org.junit.Assert.fail();
        } catch (com.kbstar.kgi.ggreport.web.web.ApiException e) {
            org.junit.Assert.assertEquals(400, e.getStatus());
        }
        mockMvc.perform(get("/menus").param("role", "전산팀"))
                .andExpect(jsonPath("$.menus.admin").value(true));
    }

    /** 사용자 예외로 관리자인 사람이 남으면 역할 칸을 모두 꺼도 잠기지 않는다. */
    @Test
    public void 사용자_예외_관리자가_남으면_역할_권한관리를_모두_꺼도_된다() throws Exception {
        userAdminView(SALES_MEMBER, true);
        saveAs(SALES_MEMBER, "[{\"role\":\"전산팀\",\"menu\":\"admin\",\"enabled\":false}]").andExpect(status().isOk());
    }

    @Test
    public void 관리자는_자기_역할_줄을_바꿀_수_없다() throws Exception {   // 사용자 11-16 ⓐ, security 중-1
        save("[{\"role\":\"전산팀\",\"menu\":\"chat\",\"enabled\":false}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("다른 역할의 관리자")));
        save("[{\"role\":\"예산팀\",\"menu\":\"chat\",\"enabled\":false}]").andExpect(status().isOk());
    }
}
