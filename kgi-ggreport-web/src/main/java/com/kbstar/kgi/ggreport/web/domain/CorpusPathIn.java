package com.kbstar.kgi.ggreport.web.domain;

/**
 * 코퍼스 경로 입력. Python {@code server/models.CorpusPathIn}.
 *
 * <p>기관에 조사 자료 폴더({@code giganlist_dir})를 붙일 때 쓴다. 이 값이 채워지면
 * 그 기관의 {@code research_status} 가 '완료'가 되고, 참여확정됐지만 자료가 없어
 * 밀려 있던 입찰 건의 팀별 작업이 생성된다.
 */
public class CorpusPathIn {

    private String path;

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
}
