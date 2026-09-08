package com.kb.uploader.config;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;

/**
 * 자바가 쓰는 <b>이름</b>과 DB 에 들어가는 <b>코드</b>를 잇는다.
 *
 * <p><b>왜 두는가.</b> 사내 DB 표준의 {@code 구분코드} 는 5자리 이하여야 하는데
 * 우리가 쓰는 값({@code UNCLASSIFIED}·{@code 지방자치단체})은 그보다 길다.
 * 값을 코드로 바꾸면 도메인·서비스·컨트롤러·화면·테스트가 전부 바뀌므로,
 * <b>변환을 여기 한 곳에 가둔다.</b> 그 덕에 자바 쪽은 종전 값을 그대로 쓴다.
 *
 * <p>⚠️ <b>모르는 값이 오면 조용히 넘기지 않고 예외를 던진다.</b> 코드가 안 맞으면
 * 증상이 "저장은 됐는데 조회가 안 됨" 처럼 엉뚱하게 나타나기 때문이다.
 *
 * <p>⚠️ 두 하위 구현 모두 자바 타입이 {@code String} 이라 <b>자동 등록(type-handlers-package)
 * 을 쓸 수 없다</b> — 같은 타입에 둘이 걸려 어느 쪽이 잡힐지 알 수 없다.
 * 그래서 Mapper XML 에서 {@code typeHandler=} 로 <b>자리마다 명시</b>한다.
 */
public abstract class CodeTypeHandler extends BaseTypeHandler<String> {

    protected abstract Map<String, String> nameToCode();

    protected abstract Map<String, String> codeToName();

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, String name, JdbcType jdbcType)
            throws SQLException {
        String code = nameToCode().get(name);
        if (code == null) {
            throw new SQLException(getClass().getSimpleName()
                    + ": 코드로 옮길 수 없는 값이다 — '" + name + "'. 아는 값: " + nameToCode().keySet());
        }
        ps.setString(i, code);
    }

    @Override
    public String getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toName(rs.getString(columnName));
    }

    @Override
    public String getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toName(rs.getString(columnIndex));
    }

    @Override
    public String getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toName(cs.getString(columnIndex));
    }

    private String toName(String code) throws SQLException {
        if (code == null) {
            return null;
        }
        String trimmed = code.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String name = codeToName().get(trimmed);
        if (name == null) {
            throw new SQLException(getClass().getSimpleName()
                    + ": DB 에 모르는 코드가 들어 있다 — '" + trimmed + "'. 아는 코드: " + codeToName().keySet());
        }
        return name;
    }
}
