package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 디자인 검토 흐름(051) API 입력. 전역 SNAKE_CASE 설정에 의존한다({@code round_no}). 작성자·사번·시각은 받지 않는다(서버가 Actor·USERS 로 정한다) —
 * 모르는 키는 무시한다.
 */
public class DesignIn {

    private DesignIn() {
    }

    /** {@code POST /tasks/{id}/design/comments}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Comment {
        private Integer roundNo;
        private String body;

        public Integer getRoundNo() { return roundNo; }
        public void setRoundNo(Integer v) { this.roundNo = v; }
        public String getBody() { return body; }
        public void setBody(String v) { this.body = v; }
    }

    /** {@code POST /tasks/{id}/design/ack}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Ack {
        private Integer roundNo;

        public Integer getRoundNo() { return roundNo; }
        public void setRoundNo(Integer v) { this.roundNo = v; }
    }
}
