package com.kbstar.kgi.ggreport.web.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 접근 이력 인터셉터를 건다. 건너뛸 요청의 판정은 {@link AccessLogInterceptor} 가 한다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AccessLogInterceptor accessLog;

    public WebConfig(AccessLogInterceptor accessLog) {
        this.accessLog = accessLog;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(accessLog);
    }
}
