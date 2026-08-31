package com.kbstar.kgi.ggreport.web;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 입찰 워크플로우 지원 시스템 — Python(FastAPI + LangGraph)에서 이관한 Java 진입점.
 *
 * <p>운영에서는 이 클래스의 {@code main}이 아니라 {@link ServletInitializer}를 통해
 * WebLogic이 기동한다. {@code main}은 외부망 로컬 개발용이다.
 */
@SpringBootApplication
public class GgReportWebApplication {

    public static void main(String[] args) {
        SpringApplication.run(GgReportWebApplication.class, args);
    }
}
