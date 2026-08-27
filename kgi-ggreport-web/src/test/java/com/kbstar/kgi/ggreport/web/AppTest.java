package com.kbstar.kgi.ggreport.web;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 통합 테스트가 <b>단 하나의</b> 스프링 컨텍스트를 공유하게 만드는 표식.
 *
 * <p><b>왜 이런 게 있나.</b> 테스트 스키마는 Oracle 정본 DDL({@code 001·002})을 그대로
 * 돌린다 — 정본을 그대로 써야 "여기 통과"가 의미가 있기 때문이다. 그런데 그 DDL 은
 * <b>멱등하지 않고</b>, 테스트 H2 는 {@code DB_CLOSE_DELAY=-1} 이라 컨텍스트가 죽어도
 * 살아 있다. 그래서 스프링 컨텍스트가 <b>두 벌</b> 뜨는 순간 같은 DB 에 {@code 001} 이
 * 두 번 돌고 {@code Table "INSTITUTIONS" already exists} 로 죽는다.
 *
 * <p>컨텍스트는 애노테이션·프로퍼티 조합이 다르면 갈라진다. 실제로
 * {@code @SpringBootTest} 만 붙인 기존 테스트와 {@code @AutoConfigureMockMvc} 를 더한
 * 컨트롤러 테스트가 서로 다른 컨텍스트를 만들어 위 오류가 났다(2026-08-27). 조합을
 * 여기 한 곳에 모아 두면 그 갈라짐이 생기지 않는다.
 *
 * <p><b>규칙: 통합 테스트는 {@code @SpringBootTest} 를 직접 쓰지 말고 이걸 쓴다.</b>
 * 새 옵션(프로퍼티·{@code @MockBean} 등)이 필요하면 그 테스트에만 붙이지 말고 여기서
 * 정한다 — 한 클래스에만 붙이는 순간 컨텍스트가 둘이 된다.
 *
 * <p>{@code @RunWith(SpringRunner.class)} 는 각 클래스에 그대로 둔다. JUnit 4 의 러너
 * 탐색이 메타 애노테이션까지 보긴 하지만, 러너가 어디서 오는지는 눈에 보이는 편이 낫다.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@SpringBootTest
@AutoConfigureMockMvc
public @interface AppTest {
}
