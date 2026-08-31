package com.kbstar.kgi.ggreport.web.config;

import org.apache.ibatis.mapping.DatabaseIdProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * 접속한 DB 의 방언을 정한다 — Mapper XML 의 {@code databaseId} 속성이 이 값을 본다.
 *
 * <p><b>왜 두는가.</b> SQL 몇 자리는 Oracle 과 MySQL 에서 문법이 갈린다(§7-2 표).
 * 한쪽만 남기고 다른 쪽을 주석 처리하면 ⓐ 배포 때 사람이 주석을 풀어야 하고
 * ⓑ 주석 쪽은 테스트가 못 봐서 조용히 낡는다. {@code databaseId} 를 쓰면 <b>두 문장이
 * 모두 살아 있고</b> 접속한 DB 에 맞는 쪽만 로드된다 — 배포 시 XML 수정 0건이다.
 *
 * <p>⚠️ <b>2026-08-26 의 "databaseIdProvider 불필요" 판단을 뒤집은 것이다</b>(사용자
 * 확정 2026-08-27). 그때의 근거는 {@code SEQ_NO} 덕분에 <b>INSERT</b> 가 양쪽에서
 * 같아졌다는 것이었고 그 사실은 지금도 유효하다 — INSERT 는 여전히 한 벌이다.
 * 갈리는 것은 페이징·준결합 같은 <b>조회</b> 쪽이다.
 *
 * <p>⚠️ <b>이 빈은 기동 시 DB 에 실제로 접속한다</b>(제품명을 읽어야 한다).
 * DataSource 가 죽어 있으면 앱이 안 뜬다 — 지연 발견보다 낫다고 보고 그대로 둔다.
 */
@Configuration
public class MyBatisConfig {

    /** 내부망 전 구간(local/dev/stg/prod). */
    public static final String ORACLE = "oracle";
    /** 외부망 로컬(out-local) 전용. */
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
                    String product = conn.getMetaData().getDatabaseProductName();
                    return resolve(product);
                }
            }

            @Override
            public void setProperties(java.util.Properties p) {
                // 매핑을 설정 파일로 빼지 않는다 — 5개 환경 properties 중 하나만
                // 빠지면 그 환경에서만 방언이 어긋난다(JacksonConfig 와 같은 이유).
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
            // ⚠️ 테스트용 H2 는 `MODE=Oracle` 로 뜬다(src/test/resources). 그래서
            //    oracle 분기를 로드한다 — **이건 어느 분기를 파싱할지 정하는 것일 뿐,
            //    H2 가 Oracle 을 검증한다는 뜻이 절대 아니다**(설계 §8). 대신 이 매핑
            //    덕분에 기본 테스트가 도는 SQL 이 내부망에서 도는 SQL 과 같은 문장이 된다.
            return ORACLE;
        }
        throw new IllegalStateException(
                "지원하지 않는 DB 다: " + product
                        + " — Mapper 의 방언 분기(oracle/mysql)를 고를 수 없다."
                        + " 벤더를 늘리려면 MyBatisConfig.resolve() 와 Mapper XML 의"
                        + " databaseId 분기를 함께 추가할 것");
    }
}
