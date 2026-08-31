package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code POST /bidcases} 요청 본문 — 골든 {@code 10}.
 *
 * <p>⚠️ <b>필드가 하나뿐인 것이 계약이다.</b> 원본은 {@code body: dict} 를 받아
 * {@code body["institution_id"]} 만 꺼내 쓴다. 골든 {@code 10} 은 {@code title}·
 * {@code note} 를 함께 보내지만 <b>저장되지 않고</b> 응답의 {@code title} 도 null 이다
 * ({@code TITLE} 컬럼은 반입 경로만 채운다). 여기에 필드를 늘려 친절하게 받으면
 * 골든이 즉시 깨진다.
 *
 * <p>{@code ignoreUnknown} 을 <b>애노테이션으로</b> 박는다 — Spring Boot 기본값이지만
 * 설정 한 줄로 뒤집히는 자리라, 이 계약이 전역 설정에 매달려 있으면 안 된다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidCaseCreateIn {

    private String institutionId;

    public String getInstitutionId() {
        return institutionId;
    }

    public void setInstitutionId(String institutionId) {
        this.institutionId = institutionId;
    }
}
