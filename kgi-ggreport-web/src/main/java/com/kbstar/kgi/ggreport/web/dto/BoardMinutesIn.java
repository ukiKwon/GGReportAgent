package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * 이사회 회의록(047) API 입력. 키는 snake_case(JacksonConfig 전역 설정). 모르는 키는 무시한다.
 * 작성자·사번·시각은 받지 않는다(서버가 Actor·USERS 로 정한다). 파일명은 받지 않는다(저장·기록하지 않는다).
 */
public class BoardMinutesIn {

    /** 업로드·미리보기의 options 파트: {meeting_date, title, terms[], release[], preview_digest, edits_digest}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class MinutesOptions {
        private String meetingDate;
        private String title;
        private List<String> terms;
        private List<String> release;
        private String previewDigest;
        private String editsDigest;

        public String getEditsDigest() { return editsDigest; }
        public void setEditsDigest(String v) { this.editsDigest = v; }
        public String getMeetingDate() { return meetingDate; }
        public void setMeetingDate(String v) { this.meetingDate = v; }
        public String getTitle() { return title; }
        public void setTitle(String v) { this.title = v; }
        public List<String> getTerms() { return terms; }
        public void setTerms(List<String> v) { this.terms = v; }
        public List<String> getRelease() { return release; }
        public void setRelease(List<String> v) { this.release = v; }
        public String getPreviewDigest() { return previewDigest; }
        public void setPreviewDigest(String v) { this.previewDigest = v; }
    }

    /** 업로드·미리보기의 edits 파트(JSON, 512KB): {speaker_labels:{"번호":"라벨"}, utter_edits:[{seq_no, text}]} — 저장 전 수정분. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EditsIn {
        private Map<String, String> speakerLabels;
        private List<UtterEdit> utterEdits;

        public Map<String, String> getSpeakerLabels() { return speakerLabels; }
        public void setSpeakerLabels(Map<String, String> v) { this.speakerLabels = v; }
        public List<UtterEdit> getUtterEdits() { return utterEdits; }
        public void setUtterEdits(List<UtterEdit> v) { this.utterEdits = v; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class UtterEdit {
        private Integer seqNo;
        private String text;

        public Integer getSeqNo() { return seqNo; }
        public void setSeqNo(Integer v) { this.seqNo = v; }
        public String getText() { return text; }
        public void setText(String v) { this.text = v; }
    }

    /** PUT /board-minutes/{id}/speakers/{no} : {label(빈 값 = 지움), rev_no} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SpeakerIn {
        private String label;
        private Integer revNo;

        public String getLabel() { return label; }
        public void setLabel(String v) { this.label = v; }
        public Integer getRevNo() { return revNo; }
        public void setRevNo(Integer v) { this.revNo = v; }
    }

    /** PUT /board-minutes/{id}/utterances/{seq} · /items/{no} : {text, rev_no} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EditIn {
        private String text;
        private Integer revNo;

        public String getText() { return text; }
        public void setText(String v) { this.text = v; }
        public Integer getRevNo() { return revNo; }
        public void setRevNo(Integer v) { this.revNo = v; }
    }

    /** PUT /board-minutes/{id}/meta : {field: title|meeting_date, value, rev_no} — 한 번에 한 칸. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class MetaIn {
        private String field;
        private String value;
        private Integer revNo;

        public String getField() { return field; }
        public void setField(String v) { this.field = v; }
        public String getValue() { return value; }
        public void setValue(String v) { this.value = v; }
        public Integer getRevNo() { return revNo; }
        public void setRevNo(Integer v) { this.revNo = v; }
    }

    /** POST /board-minutes/{id}/items/{no}/done : {done} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TodoIn {
        private Boolean done;

        public Boolean getDone() { return done; }
        public void setDone(Boolean v) { this.done = v; }
    }

    /** POST /board-minutes/{id}/scope/add : {emp_no, grant_until} · /scope/remove : {emp_no} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ScopeIn {
        private String empNo;
        private String grantUntil;

        public String getEmpNo() { return empNo; }
        public void setEmpNo(String v) { this.empNo = v; }
        public String getGrantUntil() { return grantUntil; }
        public void setGrantUntil(String v) { this.grantUntil = v; }
    }

    /** POST /board-minutes/{id}/delete : {rev_no} — 사유 칸은 두지 않는다. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DeleteIn {
        private Integer revNo;

        public Integer getRevNo() { return revNo; }
        public void setRevNo(Integer v) { this.revNo = v; }
    }
}
