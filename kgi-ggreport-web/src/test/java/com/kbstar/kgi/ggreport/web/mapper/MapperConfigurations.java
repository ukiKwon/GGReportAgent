package com.kbstar.kgi.ggreport.web.mapper;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Map;

/**
 * Mapper XML 을 <b>방언을 지정해</b> 따로 파싱한다. DB 도 스프링 컨텍스트도 없이 돈다.
 *
 * <p>이게 필요한 이유: {@code databaseId} 분기는 <b>접속한 DB 에 맞는 쪽만 로드된다.</b>
 * 그래서 스프링이 띄운 {@code Configuration} 하나만 보면 <b>언제나 한 방언만</b> 보이고,
 * 다른 쪽은 오타가 있어도 그 DB 에 배포하기 전까지 아무도 모른다. 여기서 두 벌을 각각
 * 만들어 <b>양쪽을 같은 무게로</b> 검사한다.
 *
 * <p>⚠️ 여기서 보는 것은 "XML 이 파싱되고 어떤 SQL 문자열이 만들어지는가"까지다.
 * 그 SQL 이 Oracle 에서 실제로 도는지는 <b>내부망 Oracle 의 몫</b>이다(설계 §8).
 */
final class MapperConfigurations {

    private MapperConfigurations() {
    }

    /** {@code src/main/resources/mapper/*.xml} 를 주어진 방언으로 파싱한 설정. */
    static Configuration parse(String databaseId) {
        Configuration cfg = new Configuration();
        cfg.setDatabaseId(databaseId);
        // 운영 설정(mybatis.configuration.map-underscore-to-camel-case)과 같게 맞춘다.
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.getTypeAliasRegistry().registerAliases("com.kbstar.kgi.ggreport.web.domain");

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

    static Resource[] mapperResources() {
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
    static String sql(Configuration cfg, Class<?> mapper, String method, Map<String, Object> params) {
        MappedStatement ms = cfg.getMappedStatement(mapper.getName() + "." + method);
        return ms.getBoundSql(params).getSql().replaceAll("\\s+", " ").trim();
    }
}
