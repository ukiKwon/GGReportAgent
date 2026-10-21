package com.kb.uploader.config;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * 자바 {@link LocalDateTime} 과 사내 인포타입 {@code 일시20}(CHARACTER 20) 을 잇는다.
 *
 * <p>저장 형식은 <b>{@code YYYYMMDDHH24MISS}</b> 14자다(사내 표준). 컬럼이 20자인 것은
 * 여유일 뿐이라 우리는 14자만 채운다.
 *
 * <p><b>왜 두는가.</b> 표준이 시각을 문자열로 두라고 하는데 도메인은
 * {@code LocalDateTime} 이다. 도메인을 문자열로 바꾸면 {@code UploadedFile}·서비스·
 * 화면·테스트가 전부 바뀌므로, <b>변환을 여기 한 곳에 가둔다.</b>
 *
 * <p>⚠️ 읽을 때 {@code trim()} 한다. 컬럼이 고정폭 {@code CHAR} 로 만들어지면
 * 뒤에 공백이 붙어 오는데, 그대로 파싱하면 {@code DateTimeParseException} 이 난다.
 *
 * <p>⚠️ <b>정렬이 문자열 정렬</b>이 된다. {@code YYYYMMDDHH24MISS} 는 자릿수가 고정이라
 * 사전순 = 시간순이 맞지만, 형식을 바꾸면 그 성질이 깨진다
 * ({@code ORDER BY 업로드일시 DESC} 가 조용히 어긋난다).
 */
public class LocalDateTimeStringTypeHandler extends BaseTypeHandler<LocalDateTime> {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, LocalDateTime parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setString(i, parameter.format(FORMAT));
    }

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public LocalDateTime getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private LocalDateTime parse(String raw) throws SQLException {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        try {
            return LocalDateTime.parse(value, FORMAT);
        } catch (DateTimeParseException e) {
            throw new SQLException("일시 형식이 YYYYMMDDHH24MISS 가 아니다 — '" + value + "'", e);
        }
    }
}
