package com.kbstar.kgi.ggreport.web;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.junit4.SpringRunner;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 테스트가 <b>개발용 DB 가 아니라 테스트 설정</b>을 잡는지 고정한다.
 *
 * <p>2026-08-27 실측으로 확인한 실제 결함이다 — surefire 의 작업 디렉터리가 모듈
 * 폴더라 {@code ./config/application.properties}(환경별 설정 사본, gitignored)가
 * {@code src/test/resources/application.properties} 의 H2 설정을 <b>통째로 덮고
 * 있었다.</b> 테스트는 그동안 로컬 MySQL 에 붙고 있었다.
 *
 * <p>증상이 없어서 오래 갈 수 있는 종류였다. 이 PC 에는 MySQL 이 떠 있어 테스트가
 * 그냥 통과했지만, ⓐ 개발자마다 {@code config/} 내용이 달라 결과가 갈리고
 * ⓑ {@code databaseIdProvider} 가 그 접속의 벤더를 읽으므로 <b>어느 방언 분기가
 * 테스트되는지까지 PC 마다 달라진다.</b>
 *
 * <p>고친 방법은 pom 의 surefire {@code spring.config.location=optional:classpath:/}
 * 다(그쪽 주석에 근거가 있다). 그 설정이 지워지면 이 테스트가 먼저 실패한다.
 *
 * <p>⚠️ README §7 이 경고하는 {@code application-test.properties} 함정과는 <b>다른
 * 결함이다.</b> 그쪽은 "프로파일을 안 켜서 무시됨", 이쪽은 "읽히긴 하는데 덮임"이다.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class TestConfigIsolationTest {

    @Autowired
    private Environment env;

    @Test
    public void 테스트는_H2를_잡는다() {
        String url = env.getProperty("spring.datasource.url");
        assertTrue("테스트가 개발용 DB 를 잡았다: " + url
                        + " — pom 의 surefire spring.config.location 설정을 확인할 것",
                url != null && url.startsWith("jdbc:h2:"));
    }

    @Test
    public void 산출물_루트도_테스트용이다() {
        // 같은 덮어쓰기가 있었다면 ggreport.output-root 도 개발용(C:/ggreport-out-local)을
        // 가리켰을 것이다 — 테스트가 실제 산출물 폴더에 쓰는 것을 막는다.
        String root = env.getProperty("ggreport.output-root");
        assertNotNull("ggreport.output-root 가 아예 없다", root);
        assertFalse("산출물 루트가 개발용을 가리킨다: " + root, root.contains("ggreport-out-local"));
    }
}
