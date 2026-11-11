package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 기관장 정보(NEXT 72·77, 026) 운영 설정 — {@link AppProperties.InstHead} 위의 얇은 창구.
 * 스위치({@code ggreport.inst-head.enabled}, 기본 켬)를 끄면 기관장 API 전부 <b>404 FEATURE_OFF</b> 이고 DB 를 건드리지 않는다
 * (503 이 아닌 이유: 503 은 사진 처리 대기열 가득 참(PHOTO_BUSY)에 쓰고, 꺼짐은 오래 가는 설정이라 재시도 신호가 아니며,
 * Oracle 에 DDL 을 적용하기 전에도 코드를 배포할 수 있게 한다).
 */
@Component
public class InstHeadSettings {

    private final AppProperties props;
    private final Environment env;

    public InstHeadSettings(AppProperties props, Environment env) {
        this.props = props;
        this.env = env;
    }

    /**
     * 기동 검사 — 켜져 있는데 사진 폴더가 (ⓐ) 자리표시('&lt;' 로 시작: 운영·검증 설정의 미정 값)이거나 (ⓑ) 상대경로이면서 활성 프로필이 있고 그 프로필이
     * out-local·local·dev·test 가 아니면 기동을 실패시킨다(사진이 WAS 작업 폴더에 쌓이는 것 방지). 이 앱은 프로필 대신 설정 사본(config-envs)으로 환경을
     * 가르므로 프로필이 없으면 ⓑ 는 판정할 수 없다 — 그때는 ⓐ(자리표시)가 운영 누락을 막는다. 경로 값은 메시지에 싣지 않는다.
     */
    @PostConstruct
    void validate() {
        if (!isEnabled()) {
            return;
        }
        String dir = getPhotoDir() == null ? "" : getPhotoDir().trim();
        if (dir.isEmpty() || dir.startsWith("<")) {
            throw new IllegalStateException("ggreport.inst-head.photo-dir 가 비었거나 자리표시 상태입니다 — 웹 루트 밖 절대경로로 설정하세요.");
        }
        if (!Paths.get(dir).isAbsolute()) {
            String[] active = env.getActiveProfiles();
            boolean dev = false;
            for (String p : active) {
                if ("out-local".equals(p) || "local".equals(p) || "dev".equals(p) || "test".equals(p)) {
                    dev = true;
                }
            }
            if (active.length > 0 && !dev) {
                throw new IllegalStateException("ggreport.inst-head.photo-dir 는 이 환경에서 절대경로여야 합니다.");
            }
        }
    }

    public boolean isEnabled() {
        return props.getInstHead().isEnabled();
    }

    /** 테스트용 — 끈 테스트는 finally 에서 반드시 true 로 되돌린다(컨텍스트 하나 공유). */
    public void setEnabled(boolean enabled) {
        props.getInstHead().setEnabled(enabled);
    }

    public String getPhotoDir() {
        return props.getInstHead().getPhotoDir();
    }

    public int getPhotoRetentionDays() {
        return props.getInstHead().getPhotoRetentionDays();
    }

    public int getViewWarnPerDay() {
        return props.getInstHead().getViewWarnPerDay();
    }

    /** 꺼져 있으면 404 FEATURE_OFF. DB 를 건드리기 전에 가장 먼저 부른다. */
    public void requireEnabled() {
        if (!isEnabled()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", "FEATURE_OFF");
            d.put("message", "이 기능은 꺼져 있습니다.");
            throw ApiException.withDetail(404, d);
        }
    }
}
