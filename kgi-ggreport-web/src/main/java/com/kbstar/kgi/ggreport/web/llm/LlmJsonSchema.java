package com.kbstar.kgi.ggreport.web.llm;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 구조화 출력 대상 클래스의 JSON 스키마(문자열 상수). 없으면 어댑터는 format 없이 부르고 응답에서 JSON 블록만 뽑는다. */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface LlmJsonSchema {
    String value();
}
