package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.MenusResponse;
import com.kbstar.kgi.ggreport.web.dto.RoleMenusResponse;
import com.kbstar.kgi.ggreport.web.service.MenuService;
import com.kbstar.kgi.ggreport.web.support.Menus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 역할별 메뉴 조회. 골든 {@code 04}·{@code 05}.
 *
 * <ul>
 *   <li>{@code GET /menus?role=영업팀} — 화면이 탭을 켜고 끌 때</li>
 *   <li>{@code GET /menus} — 관리 화면이 쓰는 역할×메뉴 격자</li>
 * </ul>
 *
 * <p>⚠️ <b>{@code role} 말고 다른 질의 파라미터는 무시한다.</b> 골든 {@code 05} 는
 * {@code ?team=전산팀&position=팀장} 을 보내는데 서버가 {@code role} 만 보므로 응답이
 * 골든 {@code 04} 와 <b>바이트 단위로 같다</b>(실측 확인). Spring 은 모르는 질의
 * 파라미터에 기본적으로 관대하므로 그대로 재현된다 — 여기에 {@code team}/
 * {@code position} 처리를 <b>친절하게 추가하면 골든이 깨진다.</b>
 *
 * <p>저장({@code PUT})은 아직 없다 — 단계 2는 조회만이다.
 */
@RestController
@RequestMapping("/menus")
public class MenuController {

    private final MenuService menus;

    public MenuController(MenuService menus) {
        this.menus = menus;
    }

    @GetMapping
    public Object get(@RequestParam(name = "role", required = false) String role) {
        if (role != null) {
            return new RoleMenusResponse(role, menus.menusFor(role));
        }
        // 관리 화면용 — 메뉴 정의(라벨·서버전용 여부)까지 함께 준다.
        return new MenusResponse(Menus.MENUS, menus.allRoles());
    }
}
