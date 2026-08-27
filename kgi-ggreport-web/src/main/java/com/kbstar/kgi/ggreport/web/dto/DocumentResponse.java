package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code GET /documents?path=…} — 원문 열람. 골든 {@code 06}.
 *
 * <p>{@code path} 는 <b>요청에 들어온 저장 경로 그대로</b> 돌려준다(절대경로가
 * 아니다) — 화면이 그 값으로 다시 요청할 수 있어야 하고, 서버의 실제 디렉터리
 * 구조를 밖으로 흘리지 않는다.
 *
 * <p>{@code truncated} 는 본문이 상한에서 잘렸는지, {@code chars} 는 <b>자르기 전</b>
 * 전체 길이다. 둘을 함께 줘야 화면이 "일부만 보고 있다"를 정확히 말할 수 있다.
 */
public class DocumentResponse {

    private String path;
    private String filename;
    private String text;
    private boolean truncated;
    private int chars;

    public DocumentResponse() {
    }

    public DocumentResponse(String path, String filename, String text, boolean truncated, int chars) {
        this.path = path;
        this.filename = filename;
        this.text = text;
        this.truncated = truncated;
        this.chars = chars;
    }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public boolean isTruncated() { return truncated; }
    public void setTruncated(boolean truncated) { this.truncated = truncated; }

    public int getChars() { return chars; }
    public void setChars(int chars) { this.chars = chars; }
}
