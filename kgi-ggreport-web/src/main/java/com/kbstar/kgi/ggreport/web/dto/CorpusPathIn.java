package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code POST /institutions/{id}/corpus{,/validate}} 의 본문 — Python {@code CorpusPathIn}.
 *
 * <p>{@code path} 는 <b>리포 루트 기준 상대경로</b>다(예: {@code corpus/institutions/dobong}).
 * 절대경로와 울타리 밖 경로는 400 이다 — 검사는 {@code CorpusService.safePath}.
 */
public class CorpusPathIn {

    private String path;

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
}
