package com.kbstar.kgi.ggreport.web.mapper.handler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionEntry;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.io.IOException;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code BID_CASES.PARTICIPATION_DECISION}(CLOB) ↔ {@code List<ParticipationDecisionEntry>}.
 *
 * <p>원본은 {@code json.dumps(..., ensure_ascii=False)} 로 저장했다 — 한글이 이스케이프
 * 없이 그대로 들어 있다. Jackson 도 기본이 그러하므로 저장 모양이 같다.
 *
 * <p><b>없음의 표현은 언제나 빈 목록이다.</b> DB 값이 NULL 이든 빈 문자열이든
 * {@code "[]"} 든 {@code new ArrayList<>()} 를 돌려준다 — 셋 다 실제로 생긴다:
 * Oracle 은 {@code ''} 를 NULL 로 바꾸고, MySQL 미러는 LONGTEXT 에 DEFAULT 를 못 줘
 * 앱이 값을 안 넣으면 NULL 이 된다. JSON 에 {@code null} 이 나가면 골든이 깨진다.
 *
 * <p>⚠️ <b>알 수 없는 키에는 일부러 엄격하다</b>(Jackson 기본값). 이 CLOB 을 쓰는 곳은
 * Python 원본과 이 클래스뿐이라 키 6개({@code tier/role/by/at/choice/comment})가
 * 계약이다. 모르는 키를 조용히 버리면 결재 이력의 일부가 소리 없이 사라진다.
 *
 * <p>⚠️ <b>{@code setString} 으로 CLOB 에 쓴다.</b> ojdbc8 은 32KB 미만이면 이 방식을
 * 받아 준다. 이 값은 3단 결재라 최대 3건(수백 바이트)으로 구조상 제한돼 있어 넘길 수
 * 없다 — 만약 이 CLOB 에 대용량이 들어오게 바뀌면 {@code setCharacterStream} 으로
 * 바꿔야 한다.
 *
 * <p>XML 에서 <b>명시적으로</b> 참조한다({@code typeHandler="…"}). 전역 등록
 * ({@code mybatis.type-handlers-package})을 쓰지 않는 이유는 그 설정이 5개 환경
 * properties 에 모두 들어가야 하고 하나만 빠져도 그 환경에서만 깨지기 때문이다.
 */
@MappedTypes(List.class)
@MappedJdbcTypes(value = {JdbcType.CLOB, JdbcType.LONGVARCHAR, JdbcType.VARCHAR}, includeNullJdbcType = true)
public class ParticipationDecisionTypeHandler
        extends BaseTypeHandler<List<ParticipationDecisionEntry>> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final TypeReference<List<ParticipationDecisionEntry>> LIST_TYPE =
            new TypeReference<List<ParticipationDecisionEntry>>() { };

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i,
                                    List<ParticipationDecisionEntry> parameter,
                                    JdbcType jdbcType) throws SQLException {
        ps.setString(i, toJson(parameter));
    }

    @Override
    public List<ParticipationDecisionEntry> getNullableResult(ResultSet rs, String columnName)
            throws SQLException {
        return fromJson(rs.getString(columnName));
    }

    @Override
    public List<ParticipationDecisionEntry> getNullableResult(ResultSet rs, int columnIndex)
            throws SQLException {
        return fromJson(rs.getString(columnIndex));
    }

    @Override
    public List<ParticipationDecisionEntry> getNullableResult(CallableStatement cs, int columnIndex)
            throws SQLException {
        return fromJson(cs.getString(columnIndex));
    }

    /** {@code null} 은 빈 배열로 쓴다 — DB 에 NULL 을 남기지 않는다(위 클래스 주석). */
    static String toJson(List<ParticipationDecisionEntry> value) {
        try {
            return MAPPER.writeValueAsString(value == null ? new ArrayList<>() : value);
        } catch (IOException e) {
            throw new IllegalStateException("참여결정 이력을 JSON 으로 만들지 못했다", e);
        }
    }

    static List<ParticipationDecisionEntry> fromJson(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<ParticipationDecisionEntry> parsed = MAPPER.readValue(json, LIST_TYPE);
            return parsed == null ? new ArrayList<ParticipationDecisionEntry>() : parsed;
        } catch (IOException e) {
            // 조용히 빈 목록으로 넘기지 않는다 — 결재 이력이 사라진 채로 화면이 정상처럼
            // 보이는 것이 파싱 실패로 500 이 나는 것보다 나쁘다.
            throw new IllegalStateException("참여결정 이력 JSON 을 읽지 못했다: " + json, e);
        }
    }
}
