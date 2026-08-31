package com.kbstar.kgi.ggreport.web;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * WAR로 패키징해 WebLogic에 배포하기 위한 부트스트랩.
 *
 * <p>WAS는 컨테이너 관리 스레드를 전제하므로 앱이 스레드를 직접 만들면 안 된다
 * (설계 §2·§4). 재분류/오케스트레이터 같은 백그라운드 작업은 {@code @Scheduled}가
 * 아니라 CommonJ WorkManager 경로로 붙인다(단계 4, Task 4.2).
 */
public class ServletInitializer extends SpringBootServletInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(GgReportWebApplication.class);
    }
}
