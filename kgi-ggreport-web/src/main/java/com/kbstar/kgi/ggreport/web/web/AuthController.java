package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.SysAdminIn;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.AuthService;
import com.kbstar.kgi.ggreport.web.support.Menus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 사번 로그인·로그아웃·화면 열람 기록. 접근 이력의 입구다.
 *
 * <p>로그인은 사번이 등록·활성인지 확인할 뿐 <b>비밀번호는 보지 않는다</b>({@link AuthService} 참조).
 * 응답에는 화면이 프로필을 채울 값(사번·이름·역할·직위·결재 등급)만 담는다.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService auth;
    private final AccessLogService accessLog;

    public AuthController(AuthService auth, AccessLogService accessLog) {
        this.auth = auth;
        this.accessLog = accessLog;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody SysAdminIn.Login in, HttpServletRequest req) {
        SysUser u = auth.login(in.getEmpNo(), req.getRemoteAddr(), req.getHeader("User-Agent"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("emp_no", u.getEmpNo());
        out.put("name", u.getName());
        out.put("role", u.getRole());
        out.put("position_title", u.getPositionTitle());
        out.put("approval_grade", u.getApprovalGrade());
        return out;
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest req) {
        accessLog.record(Actor.of(req), "LOGOUT", "POST", "/auth/logout", 200,
                req.getRemoteAddr(), req.getHeader("User-Agent"), null, null);
        return java.util.Collections.<String, Object>singletonMap("ok", true);
    }

    /** 화면 열람 기록 — 화면 이름은 알려진 메뉴 키·'view:' 꼴만 받는다(임의 문자열은 버린다). */
    @PostMapping("/screen")
    public Map<String, Object> screen(@RequestBody SysAdminIn.Screen in, HttpServletRequest req) {
        String s = in.getScreen();
        boolean ok = s != null && s.matches("[a-z]{2,20}(:[a-z_]{2,20})?")
                && Menus.MENU_KEYS.contains(s.split(":")[0]);
        if (ok) {
            accessLog.record(Actor.of(req), "SCREEN_VIEW", "POST", "/auth/screen", 200,
                    req.getRemoteAddr(), req.getHeader("User-Agent"), null, s);
        }
        return java.util.Collections.<String, Object>singletonMap("ok", ok);
    }
}
