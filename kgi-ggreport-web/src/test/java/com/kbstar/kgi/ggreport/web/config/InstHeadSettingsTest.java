package com.kbstar.kgi.ggreport.web.config;

import org.junit.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.Assert.fail;

/** 기관장 정보 기동 검사(security 중-3) — 켜져 있는데 사진 폴더가 자리표시이거나, 개발 프로필이 아닌 환경에서 상대경로면 기동 실패. */
public class InstHeadSettingsTest {

    private static InstHeadSettings settings(boolean enabled, String dir, String... profiles) {
        AppProperties p = new AppProperties();
        p.getInstHead().setEnabled(enabled);
        p.getInstHead().setPhotoDir(dir);
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return new InstHeadSettings(p, env);
    }

    private static void rejected(InstHeadSettings s) {
        try {
            s.validate();
            fail("기동이 실패해야 한다");
        } catch (IllegalStateException expected) {
            // 기대한 실패
        }
    }

    @Test
    public void 자리표시나_빈_폴더는_켜져_있으면_실패한다() {
        rejected(settings(true, "<PROD-HEAD-PHOTO-DIR>"));
        rejected(settings(true, "<PROD-HEAD-PHOTO-DIR>", "dev"));
        rejected(settings(true, ""));
        rejected(settings(true, "  "));
    }

    @Test
    public void 개발_프로필이_아닌_환경의_상대경로는_실패한다() {
        rejected(settings(true, "data/head-photo", "prod"));
        rejected(settings(true, "data/head-photo", "stg"));
    }

    @Test
    public void 정상_설정은_통과한다() {
        // 절대경로는 OS마다 모양이 달라('/app/...'는 Windows에서 상대경로) 실행 OS 기준 절대경로로 만든다
        settings(true, java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "head-photo").toAbsolutePath().toString(), "prod").validate();
        settings(true, "data/head-photo", "out-local").validate();
        settings(true, "data/head-photo", "local").validate();
        settings(true, "data/head-photo", "dev").validate();
        settings(true, "target/head-photo-test", "test").validate();
        settings(true, "target/head-photo-test").validate();   // 프로필이 없으면(설정 사본 방식) 자리표시만 막는다
    }

    @Test
    public void 꺼져_있으면_검사하지_않는다() {
        settings(false, "<PROD-HEAD-PHOTO-DIR>", "prod").validate();
        settings(false, "data/head-photo", "prod").validate();
    }
}
