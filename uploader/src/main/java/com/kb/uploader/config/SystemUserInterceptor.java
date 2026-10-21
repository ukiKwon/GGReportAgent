package com.kb.uploader.config;

import com.kb.uploader.code.SystemUser;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 요청마다 {@link SystemUser} 에 화면번호를 넣고, 끝나면 지운다.
 *
 * <p>값은 <b>컨트롤러 클래스명에서 자동으로</b> 나온다({@code KGI11100$UploadAction} →
 * {@code GI11100}). 컨트롤러마다 손으로 심지 않으므로 <b>화면이 늘어도 이 파일은 그대로다.</b>
 *
 * <p>⚠️ {@code afterCompletion} 에서 <b>반드시 지운다.</b> WAS 는 스레드를 재사용하므로,
 * 안 지우면 다음 요청이 이전 화면번호를 물려받아 <b>감사 기록이 조용히 틀어진다.</b>
 */
@Component
public class SystemUserInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (handler instanceof HandlerMethod) {
            SystemUser.set(SystemUser.ofController(((HandlerMethod) handler).getBeanType()));
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        SystemUser.clear();
    }
}
