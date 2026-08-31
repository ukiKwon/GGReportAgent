package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code POST /institutions/{id}/corpus} 의 응답.
 *
 * <p>{@code activatedBidCases} 가 이 응답의 요점이다 — 코퍼스가 없어 밀려 있던
 * 입찰건이 <b>이 호출로 풀렸다</b>는 사실을 화면이 알아야 "작업이 생겼습니다"를
 * 안내할 수 있다. 비어 있는 것도 정상이다(밀린 건이 없었다는 뜻).
 *
 * <p>{@code warnings} 는 등록을 막지 않은 항목이다 — 오류였다면 422 로 끝났다.
 */
public class CorpusRegisterResponse {

    private String giganlistDir;
    private List<String> activatedBidCases;
    private List<ValidationIssue> warnings;

    public CorpusRegisterResponse() {
    }

    public CorpusRegisterResponse(String giganlistDir, List<String> activatedBidCases,
                                  List<ValidationIssue> warnings) {
        this.giganlistDir = giganlistDir;
        this.activatedBidCases = activatedBidCases;
        this.warnings = warnings;
    }

    public String getGiganlistDir() { return giganlistDir; }
    public void setGiganlistDir(String giganlistDir) { this.giganlistDir = giganlistDir; }

    public List<String> getActivatedBidCases() { return activatedBidCases; }
    public void setActivatedBidCases(List<String> activatedBidCases) { this.activatedBidCases = activatedBidCases; }

    public List<ValidationIssue> getWarnings() { return warnings; }
    public void setWarnings(List<ValidationIssue> warnings) { this.warnings = warnings; }
}
