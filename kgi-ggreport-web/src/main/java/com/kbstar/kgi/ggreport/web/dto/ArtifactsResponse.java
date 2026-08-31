package com.kbstar.kgi.ggreport.web.dto;

import com.kbstar.kgi.ggreport.web.domain.Institution;

/**
 * {@code GET /institutions/{id}/artifacts} — 기관에 붙은 파일 3개. 골든 {@code 09}.
 *
 * <p>{@link Institution} 의 부분집합이지 별도 저장소가 아니다. 화면이 "자료가
 * 붙었는가"만 볼 때 기관 전체를 받지 않아도 되게 하는 좁은 창구다.
 */
public class ArtifactsResponse {

    private String giganlistDir;
    private String rfpPath;
    private String pptxPath;

    public ArtifactsResponse() {
    }

    public ArtifactsResponse(Institution institution) {
        this.giganlistDir = institution.getGiganlistDir();
        this.rfpPath = institution.getRfpPath();
        this.pptxPath = institution.getPptxPath();
    }

    public String getGiganlistDir() { return giganlistDir; }
    public void setGiganlistDir(String giganlistDir) { this.giganlistDir = giganlistDir; }

    public String getRfpPath() { return rfpPath; }
    public void setRfpPath(String rfpPath) { this.rfpPath = rfpPath; }

    public String getPptxPath() { return pptxPath; }
    public void setPptxPath(String pptxPath) { this.pptxPath = pptxPath; }
}
