package com.kb.uploader.config;

import org.junit.Test;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * `config-envs/` 5개 환경 설정이 <b>서로 빠진 키 없이</b> 같은 모양인지 본다.
 *
 * <p><b>왜 필요한가.</b> 이 프로젝트는 Spring 프로파일이 아니라 <b>설정 파일 교체</b>
 * 방식이라(README §7-1), 키를 하나 추가할 때 5개 파일을 각각 고쳐야 한다. 한 곳을
 * 빠뜨리면 <b>그 환경에서만</b> 문제가 나고, 그 환경은 대개 내부망이라 늦게 발견된다.
 *
 * <p>실제로 그런 일이 있었다 — {@code mybatis.*} 3줄이 {@code local}·{@code out-local}
 * 에만 있고 {@code dev}·{@code stg}·{@code prod} 에는 없어서, 내부망 배포 시 Mapper XML
 * 미탐색·언더스코어 매핑 누락이 날 수 있는 상태였다(README §13-①, 2026-08-31 채움).
 * 이 테스트는 <b>그 재발을 막는다.</b>
 */
public class ConfigEnvsTest {

    /** 환경이 달라도 <b>모든 파일에 반드시 있어야</b> 하는 키. */
    private static final List<String> REQUIRED = Arrays.asList(
            "mybatis.mapper-locations",
            "mybatis.type-aliases-package",
            "mybatis.configuration.map-underscore-to-camel-case",
            "upload.base-dir",
            "reclassification.cron");

    /**
     * DataSource 계열은 환경마다 방식이 갈려서(내부망 prod 는 JNDI, 나머지는 직접 접속)
     * 여기서 요구하지 않는다 — 대신 <b>둘 중 하나는</b> 있어야 한다.
     */
    private static final String JNDI = "spring.datasource.jndi-name";
    private static final String URL = "spring.datasource.url";

    @Test
    public void 모든_환경에_필수_키가_있다() {
        List<String> missing = new ArrayList<>();
        for (File env : envDirs()) {
            Properties p = load(new File(env, "application.properties"));
            for (String key : REQUIRED) {
                if (!p.containsKey(key)) {
                    missing.add(env.getName() + " : " + key);
                }
            }
        }
        if (!missing.isEmpty()) {
            fail("config-envs 에서 빠진 키가 있다 — 5개 파일을 같이 고칠 것:\n  "
                    + String.join("\n  ", missing));
        }
    }

    @Test
    public void 모든_환경이_DataSource_를_어떤_방식으로든_정한다() {
        for (File env : envDirs()) {
            Properties p = load(new File(env, "application.properties"));
            boolean jndi = notBlank(p.getProperty(JNDI));
            boolean direct = notBlank(p.getProperty(URL));
            assertTrue(env.getName() + " : JNDI 도 URL 도 없다", jndi || direct);
        }
    }

    @Test
    public void 환경_폴더는_5개다() {
        List<String> names = new ArrayList<>();
        for (File env : envDirs()) {
            names.add(env.getName());
        }
        java.util.Collections.sort(names);
        // 환경을 늘리거나 줄이면 README §7-2 의 표도 함께 고쳐야 한다.
        org.junit.Assert.assertEquals(
                Arrays.asList("dev", "local", "out-local", "prod", "stg"), names);
    }

    // ── 도우미 ──────────────────────────────────────────────────────

    private static File[] envDirs() {
        // surefire 의 작업 디렉터리는 프로젝트 루트(uploader/)다.
        File root = new File("config-envs");
        File[] dirs = root.listFiles(File::isDirectory);
        if (dirs == null || dirs.length == 0) {
            throw new IllegalStateException(
                    "config-envs/ 를 못 찾았다: " + root.getAbsolutePath());
        }
        return dirs;
    }

    private static Properties load(File file) {
        if (!file.isFile()) {
            throw new IllegalStateException("설정 파일이 없다: " + file.getPath());
        }
        Properties p = new Properties();
        try (InputStream in = new FileInputStream(file)) {
            // .properties 기본은 ISO-8859-1 이지만 이 파일들엔 한글 주석이 있다.
            p.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("설정 파일을 읽지 못했다: " + file.getPath(), e);
        }
        return p;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
