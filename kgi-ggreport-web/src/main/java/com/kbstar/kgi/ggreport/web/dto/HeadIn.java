package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 기관장 정보(NEXT 72·77, 026) API 입력. 상태·처리자·역할·기관·사번은 받지 않는다(서버가 Actor·USERS·DB 로 정한다) — 모르는 키는 무시한다.
 * 키는 snake_case(JacksonConfig). 값 검사는 서비스(HeadText·HeadForbidden)가 한다.
 */
public class HeadIn {

    private HeadIn() {
    }

    /** 출처 — 칸 값·사진마다 붙는다. kind 는 HEAD_SRC 코드(ENABLED=1), url 은 http/https 만(서버는 열지 않는다). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Source {
        private String kind;
        private String title;
        private String url;
        private String published;
        private String checkedOn;

        public String getKind() { return kind; }
        public void setKind(String v) { this.kind = v; }
        public String getTitle() { return title; }
        public void setTitle(String v) { this.title = v; }
        public String getUrl() { return url; }
        public void setUrl(String v) { this.url = v; }
        public String getPublished() { return published; }
        public void setPublished(String v) { this.published = v; }
        public String getCheckedOn() { return checkedOn; }
        public void setCheckedOn(String v) { this.checkedOn = v; }
    }

    /** {@code POST /institutions/{id}/heads} — 기관장 등록. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Head {
        private String name;
        private String position;
        private Boolean acting;
        private String firstTakeOffice;
        private String termStart;
        private String termEnd;
        private Source source;

        public String getName() { return name; }
        public void setName(String v) { this.name = v; }
        public String getPosition() { return position; }
        public void setPosition(String v) { this.position = v; }
        public Boolean getActing() { return acting; }
        public void setActing(Boolean v) { this.acting = v; }
        public String getFirstTakeOffice() { return firstTakeOffice; }
        public void setFirstTakeOffice(String v) { this.firstTakeOffice = v; }
        public String getTermStart() { return termStart; }
        public void setTermStart(String v) { this.termStart = v; }
        public String getTermEnd() { return termEnd; }
        public void setTermEnd(String v) { this.termEnd = v; }
        public Source getSource() { return source; }
        public void setSource(Source v) { this.source = v; }
    }

    /** {@code POST /institutions/{id}/head/items} — 칸 입력. 글자 칸은 value, 날짜 칸은 date, 권한대행은 flag(0/1), 학력·경력의 기간은 from·to. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        private Long headId;
        private String fieldCd;
        private String value;
        private String date;
        private String from;
        private String to;
        private Integer flag;
        private Source source;

        public Long getHeadId() { return headId; }
        public void setHeadId(Long v) { this.headId = v; }
        public String getFieldCd() { return fieldCd; }
        public void setFieldCd(String v) { this.fieldCd = v; }
        public String getValue() { return value; }
        public void setValue(String v) { this.value = v; }
        public String getDate() { return date; }
        public void setDate(String v) { this.date = v; }
        public String getFrom() { return from; }
        public void setFrom(String v) { this.from = v; }
        public String getTo() { return to; }
        public void setTo(String v) { this.to = v; }
        public Integer getFlag() { return flag; }
        public void setFlag(Integer v) { this.flag = v; }
        public Source getSource() { return source; }
        public void setSource(Source v) { this.source = v; }
    }

    /** 기각·무효 사유(1~200자). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Reason {
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }

    /** {@code POST /institution-heads/unmatched/{headId}/assign} — 매칭 대기 후보를 지정할 기관. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Assign {
        private String institutionId;

        public String getInstitutionId() { return institutionId; }
        public void setInstitutionId(String v) { this.institutionId = v; }
    }
}
