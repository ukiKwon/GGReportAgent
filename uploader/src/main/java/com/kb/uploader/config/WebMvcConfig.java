package com.kb.uploader.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** {@link SystemUserInterceptor} 를 모든 요청에 건다. */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final SystemUserInterceptor systemUserInterceptor;

    public WebMvcConfig(SystemUserInterceptor systemUserInterceptor) {
        this.systemUserInterceptor = systemUserInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(systemUserInterceptor);
    }
}
