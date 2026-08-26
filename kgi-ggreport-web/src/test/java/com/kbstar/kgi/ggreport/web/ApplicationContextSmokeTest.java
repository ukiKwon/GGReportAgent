package com.kbstar.kgi.ggreport.web;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit4.SpringRunner;

import javax.sql.DataSource;

import static org.junit.Assert.assertNotNull;

/**
 * 골격이 실제로 뜨는지만 본다(단계 1).
 *
 * <p>이 테스트가 잡아 주는 것은 "설정 파일 한 줄 때문에 컨텍스트가 안 뜨는" 종류의
 * 사고다 — WAR 를 WebLogic 에 올려 봐야 알게 되면 되돌리는 비용이 크다. 실제 조회·
 * 화면 검증은 단계 2부터 골든 비교로 한다.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class ApplicationContextSmokeTest {

    @Autowired
    private ApplicationContext context;

    @Autowired
    private DataSource dataSource;

    @Test
    public void 컨텍스트가_뜬다() {
        assertNotNull(context);
    }

    @Test
    public void DataSource가_구성된다() {
        // MyBatis 가 SqlSessionFactory 를 만들려면 DataSource 가 있어야 한다.
        // 여기서는 H2 다 — 내부망 Oracle 정합성의 근거가 아니다(클래스 주석 참조).
        assertNotNull(dataSource);
    }
}
