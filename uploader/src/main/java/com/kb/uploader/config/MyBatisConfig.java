package com.kb.uploader.config;

import org.apache.ibatis.mapping.DatabaseIdProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * 접속한 DB 의 방언을 정한다 — Mapper XML 의 {@code databaseId} 속성이 이 값을 본다.
 *
 * <p><b>왜 두는가.</b> uploader 의 SQL 몇 자리는 Oracle 과 MySQL 에서 문법이 갈린다
 * (페이징 {@code LIMIT}/{@code ROWNUM}, 문자열 연결 {@code CONCAT()}/{@code ||},
 * 키 생성 {@code useGeneratedKeys}/{@code selectKey}). 종전에는 MySQL 문장만 살아
 * 있고 Oracle 문장은 <b>주석</b>으로 들어 있었다 — ⓐ 배포 때 사람이 주석을 풀어야 하고
 * ⓑ 주석 쪽은 테스트가 못 봐서 조용히 낡는다. {@code databaseId} 를 쓰면 두 문장이
 * 모두 살아 있고 접속한 DB 에 맞는 쪽만 로드된다 — 배포 시 XML 수정 0건이다.
 *
 * <p>본체({@code kgi-ggreport-web})의 같은 이름 클래스와 <b>같은 방식</b>이다.
 * 다른 곳은 아래 {@code resolve} 의 H2 처리 한 군데뿐이다.
 *
 * <p>⚠️ <b>이 빈은 기동 시 DB 에 실제로 접속한다</b>(제품명을 읽어야 한다).
 * DataSource 가 죽어 있으면 앱이 안 뜬다 — 지연 발견보다 낫다고 보고 그대로 둔다.
 */
@Configuration
public class MyBatisConfig {

    /** 내부망 전 구간(local/dev/stg/prod). */
    public static final String ORACLE = "oracle";
    /** 외부망 로컬(out-local)과 테스트 H2. */
    public static final String MYSQL = "mysql";

    /**
     * {@code VendorDatabaseIdProvider} 를 쓰지 않는 이유는 <b>모르는 벤더에서 조용히
     * {@code null} 을 돌려주기</b> 때문이다. 그러면 {@code databaseId} 가 붙은 문장이
     * 하나도 로드되지 않고, 증상은 기동 성공 뒤 그 화면에서만 나는
     * {@code Invalid bound statement} 다 — 원인을 찾기 매우 어렵다. 여기서는 <b>기동 때
     * 소리 내어 죽는다.</b>
     */
    @Bean
    public DatabaseIdProvider databaseIdProvider() {
        return new DatabaseIdProvider() {
            @Override
            public String getDatabaseId(DataSource dataSource) throws SQLException {
                try (Connection conn = dataSource.getConnection()) {
                    return resolve(conn.getMetaData().getDatabaseProductName());
                }
            }

            @Override
            public void setProperties(java.util.Properties p) {
                // 매핑을 설정 파일로 빼지 않는다 — 5개 환경 properties 중 하나만
                // 빠지면 그 환경에서만 방언이 어긋난다.
            }
        };
    }

    /**
     * @param product {@code DatabaseMetaData.getDatabaseProductName()}
     * @throws IllegalStateException 모르는 벤더
     */
    public static String resolve(String product) {
        if (product == null) {
            throw new IllegalStateException("DB 제품명을 읽지 못했다");
        }
        String name = product.toLowerCase();
        if (name.contains("oracle")) {
            return ORACLE;
        }
        if (name.contains("mysql") || name.contains("mariadb")) {
            return MYSQL;
        }
        if (name.contains("h2")) {
            // ⚠️ 여기가 본체와 다르다. 본체의 테스트 H2 는 `MODE=Oracle` 이라 oracle
            //    분기를 로드하지만, uploader 의 테스트 H2 는 `MODE=MySQL` 로 뜨고
            //    `schema-mysql.sql` 로 테이블을 만든다(src/test/resources).
            //    그러므로 mysql 분기를 로드해야 기존 테스트 9개가 그대로 돈다.
            //    ⚠️ 그래서 **런타임 테스트는 oracle 분기를 한 번도 실행하지 않는다.**
            //    그 공백은 MapperDialectTest 가 두 방언을 각각 파싱해 메운다
            //    — DB 없이 "문장이 만들어지는지"까지만 본다(설계 §8과 같은 선).
            return MYSQL;
        }
        throw new IllegalStateException(
                "지원하지 않는 DB 다: " + product
                        + " — Mapper 의 방언 분기(oracle/mysql)를 고를 수 없다."
                        + " 벤더를 늘리려면 MyBatisConfig.resolve() 와 Mapper XML 의"
                        + " databaseId 분기를 함께 추가할 것");
    }
}
