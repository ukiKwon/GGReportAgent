package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code POST /institutions/import} 의 응답 — Python 의
 * {@code {"imported": len(ids), "institution_ids": ids}}.
 *
 * <p>⚠️ <b>{@code imported} 는 "새로 만든 수"가 아니라 "처리한 행 수"다.</b> 반입은
 * upsert 라 같은 표를 다시 올리면 새 행이 하나도 안 생겨도 {@code imported} 는 그대로
 * 행 수다. 화면이 "N건 반입"이라고 쓰는 근거가 이 값이므로 의미를 바꾸지 말 것 —
 * "새로 만든 수"로 바꾸면 재반입이 늘 0건으로 보여 사람이 실패로 읽는다.
 *
 * <p>{@code institutionIds} 는 <b>표의 행 순서 그대로</b>이고, 기존 행이면 그 id 다.
 */
public class ImportResponse {

    private int imported;
    private List<String> institutionIds;

    public ImportResponse() {
    }

    public ImportResponse(List<String> institutionIds) {
        this.institutionIds = institutionIds;
        this.imported = institutionIds.size();
    }

    public int getImported() { return imported; }
    public void setImported(int imported) { this.imported = imported; }

    public List<String> getInstitutionIds() { return institutionIds; }
    public void setInstitutionIds(List<String> institutionIds) { this.institutionIds = institutionIds; }
}
