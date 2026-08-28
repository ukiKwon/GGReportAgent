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

    @Autowired
    private MockMvc mockMvc;

    private org.springframework.test.web.servlet.ResultActions save(String changes) throws Exception {
        return mockMvc.perform(put("/menus")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"changes\":" + changes + "}"));
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
        // 기본값에서 admin 이 켜진 곳은 전산팀 하나다(Menus 기본 격자).
        save("[{\"role\":\"전산팀\",\"menu\":\"admin\",\"enabled\":false}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists());

        // 거부됐으므로 저장 전 상태 그대로여야 한다 — 반쯤 적용되면 안 된다.
        mockMvc.perform(get("/menus").param("role", "전산팀"))
                .andExpect(jsonPath("$.menus.admin").value(true));
    }

    /** 다른 역할에 먼저 켜 두면 옮기는 것은 된다 — 잠기는 저장만 막는 것이지 고정이 아니다. */
    @Test
    public void 다른_역할에_먼저_켜두면_옮길_수_있다() throws Exception {
        save("[{\"role\":\"영업팀장\",\"menu\":\"admin\",\"enabled\":true},"
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
}
