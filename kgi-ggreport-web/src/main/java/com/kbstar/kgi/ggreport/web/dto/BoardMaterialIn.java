package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** 이사회 자료 저장 API 입력. 전역 SNAKE_CASE 설정에 의존한다(BidAssignIn.emp_nos 와 같은 방식). 모르는 키는 무시한다. */
public class BoardMaterialIn {

    /** POST /board-materials : {bid_case_id, year, form_id?, form_version?} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Create {
        private String bidCaseId;
        private Integer year;
        private String formId;
        private Integer formVersion;

        public String getBidCaseId() { return bidCaseId; }
        public void setBidCaseId(String v) { this.bidCaseId = v; }
        public Integer getYear() { return year; }
        public void setYear(Integer v) { this.year = v; }
        public String getFormId() { return formId; }
        public void setFormId(String v) { this.formId = v; }
        public Integer getFormVersion() { return formVersion; }
        public void setFormVersion(Integer v) { this.formVersion = v; }
    }

    /** POST /board-materials/{id}/snapshots : {base_snap_no, note?, tables:[{ref, cells:{칸키:값}}]} — 값 칸만. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Save {
        private Integer baseSnapNo;
        private String note;
        private List<BoardWriteIn.TableIn> tables;

        public Integer getBaseSnapNo() { return baseSnapNo; }
        public void setBaseSnapNo(Integer v) { this.baseSnapNo = v; }
        public String getNote() { return note; }
        public void setNote(String v) { this.note = v; }
        public List<BoardWriteIn.TableIn> getTables() { return tables; }
        public void setTables(List<BoardWriteIn.TableIn> v) { this.tables = v; }
    }

    /** POST /board-materials/{id}/submit : {snap_no?} — 화면이 보여 준(제출 줄의) 버전. 없으면(본문 없음·{}) 현재 버전을 제출한다(옛 화면 호환). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Submit {
        private Integer snapNo;

        public Integer getSnapNo() { return snapNo; }
        public void setSnapNo(Integer v) { this.snapNo = v; }
    }

    /** POST /board-materials/{id}/rework : {reason} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Rework {
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }

    /** POST /board-materials/{id}/result : {result: SCHEDULED|PASSED|REJECTED, meeting_date?} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Result {
        private String result;
        private String meetingDate;

        public String getResult() { return result; }
        public void setResult(String v) { this.result = v; }
        public String getMeetingDate() { return meetingDate; }
        public void setMeetingDate(String v) { this.meetingDate = v; }
    }
}
