package com.kbstar.kgi.ggreport.web.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.nio.charset.Charset;

/**
 * 이사회 회의록(047) 설정. 코드 기본값은 <b>꺼짐</b>·인증 필수 — 운영(stg/prod)은 설정 파일에 키를 넣지 않으므로 꺼진 채 시작한다.
 * 개발축(out-local)과 테스트가 {@code enabled=true}, {@code require-verified=false} 로 켠다.
 * CP949 문자셋이 JVM 에 없으면 켜져 있어도 스스로 끈다(CP949 파일을 못 읽는 채로 올라가지 않게).
 * ⚠️ require-verified=true 는 앞단 인증(getRemoteUser)이 사번을 넘길 때만 통과한다 — X-Emp-No 자기신고는 거부된다.
 */
@Component
public class MinutesSettings {

    private static final Logger log = LoggerFactory.getLogger(MinutesSettings.class);

    static final int DAYS_MAX = 90;
    static final int FILE_KB_MAX = 2048;

    @Value("${ggreport.minutes.enabled:false}")
    private boolean enabled;
    @Value("${ggreport.minutes.require-verified:true}")
    private boolean requireVerified;
    @Value("${ggreport.minutes.uploader-days:14}")
    private int uploaderDays;
    @Value("${ggreport.minutes.max-file-kb:2048}")
    private int maxFileKb;

    @PostConstruct
    void check() {
        uploaderDays = Math.max(0, Math.min(DAYS_MAX, uploaderDays));
        maxFileKb = Math.max(1, Math.min(FILE_KB_MAX, maxFileKb));
        if (enabled && !Charset.isSupported("x-windows-949") && !Charset.isSupported("MS949")) {
            enabled = false;
            log.warn("minutes disabled: CP949 charset missing");
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isRequireVerified() {
        return requireVerified;
    }

    /** 등록자가 올린 뒤 계속 볼 수 있는 일수(0 이면 등록자 예외 없음). */
    public int getUploaderDays() {
        return uploaderDays;
    }

    /** 파일 한 개의 상한(바이트). */
    public long getMaxFileBytes() {
        return maxFileKb * 1024L;
    }
}
