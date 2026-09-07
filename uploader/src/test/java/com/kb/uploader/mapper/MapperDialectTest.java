package com.kb.uploader.mapper;

import com.kb.uploader.config.MyBatisConfig;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.executor.keygen.SelectKeyGenerator;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.Configuration;
import org.junit.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Mapper XML 의 <b>방언 분기</b>({@code databaseId})를 두 방언으로 각각 파싱해 본다.
 * DB 도 스프링 컨텍스트도 없이 돈다.
 *
 * <p><b>왜 필요한가.</b> {@code databaseId} 분기는 <b>접속한 DB 에 맞는 쪽만
 * 로드된다.</b> uploader 의 테스트 H2 는 {@code MODE=MySQL} 이라
 * ({@code src/test/resources/application.properties}) 나머지 테스트 9개는 언제나
 * <b>mysql 분기만</b> 실행한다 — oracle 분기는 오타가 있어도 내부망에 배포하기
 * 전까지 아무도 모른다. 여기서 두 벌을 각각 만들어 같은 무게로 검사한다.
 *
 * <p>⚠️ 여기서 보는 것은 "XML 이 파싱되고 어떤 SQL 문자열이 만들어지는가"까지다.
 * 그 SQL 이 Oracle 에서 실제로 도는지는 <b>내부망 Oracle 의 몫</b>이다.
 */
public class MapperDialectTest {

    /** 방언 분기가 걸린 statement 전부. 한쪽에만 있으면 안 된다. */
    private static final String[] BRANCHED = {
            UploadedFileMapper.class.getName() + ".insert",
            UploadedFileMapper.class.getName() + ".findRecent",
            UploadedFileMapper.class.getName() + ".findByInstitutionNameContaining",
            UploadedFileMapper.class.getName() + ".countByInstitutionNameContaining",
            UploadedFileMapper.class.getName() + ".search",
            InstitutionMapper.class.getName() + ".insert",
    };

    @Test
    public void 두_방언_모두에서_모든_statement_가_바인딩된다() {
        Configuration mysql = parse(MyBatisConfig.MYSQL);
        Configuration oracle = parse(MyBatisConfig.ORACLE);

        for (String id : BRANCHED) {
            assertTrue("mysql 분기에 없다: " + id, mysql.hasStatement(id));
            assertTrue("oracle 분기에 없다: " + id, oracle.hasStatement(id));
        }

        // 분기가 없는 문장까지 포함해 **같은 id 집합**이 나와야 한다 — 한쪽에만 문장을
        // 추가하면 여기서 걸린다.
        //
        // ⚠️ 개수로 비교하면 안 된다. oracle 분기의 <selectKey> 는 MyBatis 가
        //    `insert!selectKey` 라는 별도 statement 로 등록해서 oracle 쪽이 항상 더
        //    많다(시퀀스를 쓰니 당연하다). 그 파생 문장을 빼고 비교한다.
        assertEquals("두 방언의 statement 목록이 다르다",
                statementIds(mysql), statementIds(oracle));
    }

    /** {@code selectKey} 파생을 뺀, 이 프로젝트 Mapper 의 statement id 집합. */
    private static java.util.Set<String> statementIds(Configuration cfg) {
        java.util.Set<String> ids = new java.util.TreeSet<>();
        for (String id : cfg.getMappedStatementNames()) {
            // getMappedStatementNames 는 짧은 이름도 함께 돌려준다 — FQCN 만 본다.
            if (id.startsWith("com.kb.uploader.") && !id.endsWith(SelectKeyGenerator.SELECT_KEY_SUFFIX)) {
                ids.add(id);
            }
        }
        return ids;
    }

    @Test
    public void 페이징은_방언마다_다른_문장이_나온다() {
        Map<String, Object> params = new HashMap<>();
        params.put("limit", 10);

        assertTrue("mysql 은 LIMIT 을 써야 한다",
                sql(parse(MyBatisConfig.MYSQL), UploadedFileMapper.class, "findRecent", params)
                        .contains("LIMIT"));
        assertTrue("oracle 은 ROWNUM 을 써야 한다",
                sql(parse(MyBatisConfig.ORACLE), UploadedFileMapper.class, "findRecent", params)
                        .contains("ROWNUM"));
    }

    @Test
    public void oracle_문장에는_mysql_전용_문법이_남아_있지_않다() {
        Configuration oracle = parse(MyBatisConfig.ORACLE);
        for (String id : oracle.getMappedStatementNames()) {
            // getMappedStatementNames 는 짧은 이름도 함께 돌려준다 — FQCN 만 본다.
            if (!id.startsWith("com.kb.uploader.")) {
                continue;
            }
            String text = oracle.getMappedStatement(id).getBoundSql(emptyParams()).getSql()
                    .replaceAll("\\s+", " ").toUpperCase();
            assertTrue("oracle 분기에 MySQL 전용 LIMIT 이 남아 있다: " + id, !text.contains(" LIMIT "));
            assertTrue("oracle 분기에 MySQL 전용 CONCAT( 이 남아 있다: " + id, !text.contains("CONCAT("));
        }
    }

    @Test
    public void 벤더_이름을_방언으로_해석한다() {
        assertEquals(MyBatisConfig.ORACLE, MyBatisConfig.resolve("Oracle"));
        assertEquals(MyBatisConfig.MYSQL, MyBatisConfig.resolve("MySQL"));
        assertEquals(MyBatisConfig.MYSQL, MyBatisConfig.resolve("MariaDB"));
        // 테스트 H2 는 MODE=MySQL 로 뜨므로 mysql 분기를 로드해야 한다.
        assertEquals(MyBatisConfig.MYSQL, MyBatisConfig.resolve("H2"));
    }

    @Test
    public void 모르는_벤더는_기동_때_소리내어_죽는다() {
        try {
            MyBatisConfig.resolve("PostgreSQL");
            fail("모르는 벤더인데 예외가 안 났다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("PostgreSQL"));
        }
    }

    // ── 도우미 ──────────────────────────────────────────────────────

    private static Configuration parse(String databaseId) {
        Configuration cfg = new Configuration();
        cfg.setDatabaseId(databaseId);
        // 운영 설정(mybatis.configuration.map-underscore-to-camel-case)과 같게 맞춘다.
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.getTypeAliasRegistry().registerAliases("com.kb.uploader.domain");

        Map<String, org.apache.ibatis.parsing.XNode> fragments = cfg.getSqlFragments();
        for (Resource resource : mapperResources()) {
            String path = "mapper/" + resource.getFilename();
            try (InputStream in = resource.getInputStream()) {
                new XMLMapperBuilder(in, cfg, path, fragments).parse();
            } catch (IOException e) {
                throw new UncheckedIOException("Mapper XML 을 읽지 못했다: " + path, e);
            }
        }
        return cfg;
    }

    private static Resource[] mapperResources() {
        try {
            Resource[] found = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:mapper/*.xml");
            if (found.length == 0) {
                throw new IllegalStateException(
                        "mapper/*.xml 을 못 찾았다 — 빌드 산출물(target/classes)이 없는지 확인할 것");
            }
            return found;
        } catch (IOException e) {
            throw new UncheckedIOException("mapper/*.xml 탐색 실패", e);
        }
    }

    /** 공백을 한 칸으로 눌러 비교하기 좋게 만든 최종 SQL. */
    private static String sql(Configuration cfg, Class<?> mapper, String method, Map<String, Object> params) {
        MappedStatement ms = cfg.getMappedStatement(mapper.getName() + "." + method);
        return ms.getBoundSql(params).getSql().replaceAll("\\s+", " ").trim();
    }

    /** 모든 파라미터를 null 로 채운 맵 — 동적 SQL 이 있어도 파싱은 된다. */
    private static Map<String, Object> emptyParams() {
        Map<String, Object> p = new HashMap<>();
        for (String key : new String[]{"id", "limit", "offset", "keyword", "institution",
                "year", "status", "name", "category", "modifiedAt", "originalName",
                "storedPath", "institutionName", "uploadedAt", "classifiedAt"}) {
            p.put(key, null);
        }
        return p;
    }
}
