package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.config.MyBatisConfig;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Mapper 인터페이스의 메서드와 XML 의 statement 가 <b>1:1</b> 인지 본다. DB 없이 돈다.
 *
 * <p>왜 필요한가: MyBatis 는 바인딩이 없는 메서드를 <b>호출할 때</b> 비로소
 * {@code BindingException: Invalid bound statement} 로 죽는다. 기동 때는 조용하다.
 * 그래서 오타 하나가 단계 2 후반의 어느 화면에서야 터지고, 그때는 원인이 XML 인지
 * 컨트롤러인지 구분이 안 된다. 여기서 <b>기동 직후에</b> 잡는다.
 *
 * <p>반대 방향도 본다 — <b>XML 에만 있고 인터페이스에 없는 statement</b>. 그건 죽은
 * SQL 이거나(누가 메서드를 지웠다) 이름 오타의 잔해다. 남겨 두면 다음 사람이 "이미
 * 있는 줄 알고" 다시 쓰지 않는다.
 *
 * <p>⚠️ 이 테스트는 <b>SQL 이 맞는지 보지 않는다.</b> Mapper·DDL 의 실검증은
 * 내부망 Oracle 의 몫이다(설계 §8) — H2·MySQL 통과는 Oracle 합격의 근거가 아니다.
 * 여기서 보는 것은 "XML 이 파싱되고 이름이 이어져 있다"까지다.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class MapperStatementBindingTest {

    /** registry 7테이블에 하나씩. 개수를 박아 두면 새 Mapper 를 만들고 등록을 잊는 것도 잡힌다. */
    private static final int EXPECTED_MAPPER_COUNT = 7;

    @Autowired
    private SqlSessionFactory sqlSessionFactory;

    private Configuration configuration() {
        return sqlSessionFactory.getConfiguration();
    }

    /**
     * 방언이 <b>정해져 있는지</b>. {@code null} 이면 {@code databaseId} 가 붙은 문장이
     * 하나도 로드되지 않는다 — 그 상태로도 기동은 성공하므로 여기서 못 박는다.
     * 테스트 DB 는 H2({@code MODE=Oracle})라 {@code oracle} 분기를 쓴다.
     */
    @Test
    public void 스프링_컨텍스트의_방언이_정해져_있다() {
        assertEquals("databaseIdProvider 빈이 안 걸렸다",
                MyBatisConfig.ORACLE, configuration().getDatabaseId());
    }

    @Test
    public void Mapper가_전부_등록됐다() {
        Collection<Class<?>> mappers = configuration().getMapperRegistry().getMappers();
        assertEquals("등록된 Mapper 수가 다르다: " + simpleNames(mappers),
                EXPECTED_MAPPER_COUNT, mappers.size());
    }

    @Test
    public void 모든_메서드에_대응하는_statement가_있다() {
        List<String> missing = new ArrayList<>();
        for (Class<?> mapper : configuration().getMapperRegistry().getMappers()) {
            for (Method method : mapper.getDeclaredMethods()) {
                if (method.isSynthetic() || method.isDefault()) {
                    continue;
                }
                String id = mapper.getName() + "." + method.getName();
                if (!configuration().hasStatement(id)) {
                    missing.add(mapper.getSimpleName() + "." + method.getName());
                }
            }
        }
        if (!missing.isEmpty()) {
            fail("XML 에 statement 가 없는 Mapper 메서드: " + new TreeSet<>(missing)
                    + " — 호출하기 전까지는 예외가 안 난다는 점에 주의할 것");
        }
    }

    @Test
    public void XML에만_있는_statement가_없다() {
        List<String> orphans = new ArrayList<>();
        for (Class<?> mapper : configuration().getMapperRegistry().getMappers()) {
            String namespace = mapper.getName();
            TreeSet<String> methodNames = new TreeSet<>();
            for (Method method : mapper.getDeclaredMethods()) {
                methodNames.add(method.getName());
            }
            for (String id : configuration().getMappedStatementNames()) {
                if (!id.startsWith(namespace + ".")) {
                    continue;
                }
                String tail = id.substring(namespace.length() + 1);
                // 짧은 이름(= 네임스페이스 없는 별칭)은 여기 안 걸린다. 중첩 이름도 없다.
                if (tail.indexOf('.') < 0 && !methodNames.contains(tail)) {
                    orphans.add(mapper.getSimpleName() + "." + tail);
                }
            }
        }
        if (!orphans.isEmpty()) {
            fail("인터페이스에 없는 XML statement: " + new TreeSet<>(orphans)
                    + " — 죽은 SQL 이거나 이름 오타다");
        }
    }

    /**
     * ⚠️ <b>A안(방언 분기)의 핵심 안전망이다.</b> {@code databaseId} 가 붙은 문장은
     * 접속한 DB 에 맞는 쪽만 로드되므로, 위의 세 테스트는 <b>지금 접속한 방언 한 벌</b>만
     * 본다. MySQL 변형만 추가하고 Oracle 변형을 잊으면 위 테스트는 통과하고 <b>내부망에
     * 올린 뒤에야</b> {@code Invalid bound statement} 로 터진다. 여기서 두 방언을 각각
     * 파싱해 <b>양쪽 모두</b>에 모든 메서드가 있는지 본다.
     */
    @Test
    public void 두_방언_모두에서_모든_메서드가_바인딩된다() {
        Map<String, Configuration> byDialect = new LinkedHashMap<>();
        byDialect.put(MyBatisConfig.ORACLE, MapperConfigurations.parse(MyBatisConfig.ORACLE));
        byDialect.put(MyBatisConfig.MYSQL, MapperConfigurations.parse(MyBatisConfig.MYSQL));

        List<String> missing = new ArrayList<>();
        for (Map.Entry<String, Configuration> dialect : byDialect.entrySet()) {
            for (Class<?> mapper : configuration().getMapperRegistry().getMappers()) {
                for (Method method : mapper.getDeclaredMethods()) {
                    if (method.isSynthetic() || method.isDefault()) {
                        continue;
                    }
                    String id = mapper.getName() + "." + method.getName();
                    if (!dialect.getValue().hasStatement(id)) {
                        missing.add(dialect.getKey() + ": "
                                + mapper.getSimpleName() + "." + method.getName());
                    }
                }
            }
        }
        if (!missing.isEmpty()) {
            fail("한쪽 방언에만 있는 statement: " + new TreeSet<>(missing)
                    + " — databaseId 분기는 한 쌍이다. 두 문장을 함께 고칠 것");
        }
    }

    @Test
    public void 벤더_판정이_두_DB와_H2를_안다() {
        assertEquals(MyBatisConfig.ORACLE, MyBatisConfig.resolve("Oracle"));
        assertEquals(MyBatisConfig.MYSQL, MyBatisConfig.resolve("MySQL"));
        // 테스트용 H2 는 MODE=Oracle 로 뜨므로 oracle 분기를 로드한다 —
        // H2 가 Oracle 을 검증한다는 뜻이 아니다(MyBatisConfig 주석).
        assertEquals(MyBatisConfig.ORACLE, MyBatisConfig.resolve("H2"));
    }

    /**
     * 모르는 벤더에서 조용히 넘어가면 {@code databaseId} 문장이 <b>하나도</b> 로드되지
     * 않은 채 기동이 성공하고, 증상은 그 화면에서만 나는 {@code Invalid bound statement}
     * 다. 그래서 기동 때 소리 내어 죽인다.
     */
    @Test(expected = IllegalStateException.class)
    public void 모르는_벤더는_소리내어_죽는다() {
        MyBatisConfig.resolve("PostgreSQL");
    }

    @Test
    public void 참여결정_TypeHandler가_실려_있다() {
        // XML 에서 typeHandler 를 문자열로 참조하므로, 클래스명이 틀리면 여기서 드러난다
        // (MyBatis 는 XML 파싱 시점에 그 클래스를 로드한다 — 컨텍스트가 뜨면 통과다).
        assertTrue("BidCaseMapper 의 조회 statement 가 없다",
                configuration().hasStatement(BidCaseMapper.class.getName() + ".selectById"));
    }

    private static TreeSet<String> simpleNames(Collection<Class<?>> classes) {
        TreeSet<String> out = new TreeSet<>();
        for (Class<?> c : classes) {
            out.add(c.getSimpleName());
        }
        return out;
    }
}
