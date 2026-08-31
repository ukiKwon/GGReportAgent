package com.kbstar.kgi.ggreport.web.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 기관 부분 갱신 입력. Python {@code server/models.InstitutionUpdateIn}.
 *
 * <p>⚠️ <b>"안 보냄" 과 "{@code null} 을 보냄" 을 구분해야 한다.</b> 원본은 pydantic 의
 * {@code model_fields_set}({@code exclude_unset})으로 둘을 갈랐다 —
 * {@code {"term": null}} 은 <b>지움</b>이고 {@code {}} 는 <b>보존</b>이다. 예전에
 * {@code COALESCE(?, 기존값)} 으로 둘을 같게 취급했더니 숫자인 {@code term} 은 한 번
 * 넣으면 <b>비울 방법이 아예 없었다.</b> 그 결함을 되살리지 않으려고, 여기서는
 * <b>세터가 호출된 필드명을 모아 둔다</b> — Jackson 은 JSON 에 있는 키의 세터만
 * 부르므로 이것이 곧 {@code model_fields_set} 이다.
 *
 * <p>{@code region_code}·{@code type}·{@code contract_end}·{@code last_bid} 네 개는
 * <b>빈 문자열을 지움으로 본다</b>(원본과 동일). 이 필드들에 진짜 빈 문자열은 의미가
 * 없고, 화면에서 입력칸을 비운 것이 곧 지우려는 뜻이다. 정규화는 <b>세터 안에서</b>
 * 끝내므로 게터를 읽는 쪽(Mapper XML)은 규칙을 몰라도 된다.
 *
 * <p>⚠️ 아무 필드도 안 보냈으면({@link #nothingSet()}) <b>UPDATE 를 돌리지 않는다</b> —
 * 원본이 그렇고, MyBatis {@code <set>} 이 비면 SQL 문법 오류가 난다. 그 판단은
 * 호출부(서비스/컨트롤러)의 몫이다.
 */
public class InstitutionUpdateIn {

    /** 실제로 전송된 필드명(자바 프로퍼티명). Mapper XML 의 {@code <if>} 가 읽는다. */
    private final Set<String> present = new LinkedHashSet<>();

    private String regionCode;
    private String type;
    private String contractEnd;
    private String lastBid;
    private Integer term;

    private static String blankToNull(String v) {
        return (v != null && v.isEmpty()) ? null : v;
    }

    public String getRegionCode() { return regionCode; }
    public void setRegionCode(String regionCode) {
        present.add("regionCode");
        this.regionCode = blankToNull(regionCode);
    }

    public String getType() { return type; }
    public void setType(String type) {
        present.add("type");
        this.type = blankToNull(type);
    }

    public String getContractEnd() { return contractEnd; }
    public void setContractEnd(String contractEnd) {
        present.add("contractEnd");
        this.contractEnd = blankToNull(contractEnd);
    }

    public String getLastBid() { return lastBid; }
    public void setLastBid(String lastBid) {
        present.add("lastBid");
        this.lastBid = blankToNull(lastBid);
    }

    /** 숫자라 빈 문자열 규칙이 없다. {@code null} 이 곧 지움이다. */
    public Integer getTerm() { return term; }
    public void setTerm(Integer term) {
        present.add("term");
        this.term = term;
    }

    /**
     * 이 필드가 요청 본문에 <b>실려 왔는지</b>. 값이 {@code null} 인 것과 다르다.
     *
     * <p>Mapper XML 에서 {@code <if test="upd.present('term')">} 로 쓴다.
     */
    @JsonIgnore
    public boolean present(String field) {
        return present.contains(field);
    }

    /** 보낸 필드가 하나도 없다 — 호출부는 UPDATE 를 건너뛰고 현재 값을 그대로 돌려준다. */
    @JsonIgnore
    public boolean nothingSet() {
        return present.isEmpty();
    }

    /** 전송된 필드명 목록(진단·테스트용). */
    @JsonIgnore
    public Set<String> presentFields() {
        return Collections.unmodifiableSet(present);
    }
}
