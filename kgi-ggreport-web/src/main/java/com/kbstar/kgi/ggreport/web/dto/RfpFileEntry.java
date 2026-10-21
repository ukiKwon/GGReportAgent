package com.kbstar.kgi.ggreport.web.dto;

/**
 * 반입으로 기관에 붙은 공고문 1건 — {@code {"institution_id": …, "rfp_path": …}}.
 *
 * <p>공고당 <b>첫 번째 첨부만</b> 여기 실린다. {@code RFP_PATH} 가 단일 컬럼이고
 * SCHEMA §⑤ 도 "공고문 PDF"를 단수로 전제하기 때문이다 — 나머지 첨부는 파일만
 * 옮겨지고 DB 에는 남지 않는다.
 */
public class RfpFileEntry {

    private String institutionId;
    private String rfpPath;

    public RfpFileEntry() {
    }

    public RfpFileEntry(String institutionId, String rfpPath) {
        this.institutionId = institutionId;
        this.rfpPath = rfpPath;
    }

    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }

    public String getRfpPath() { return rfpPath; }
    public void setRfpPath(String rfpPath) { this.rfpPath = rfpPath; }
}
