package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code POST /institutions/{id}/chat} 본문. Python {@code routers/chat.ChatIn}.
 *
 * <p>⚠️ {@code author} 를 <b>헤더가 아니라 본문으로</b> 받는 것은 의도다 —
 * {@code X-User-Id} 는 ASCII 만 실을 수 있어 한글 이름이 들어가지 않는다
 * (원본 주석: "A1 F10과 같은 이유"). 화면도 본문으로 보낸다
 * ({@code frontend/js/chat.js}).
 */
public class ChatIn {

    private String content;

    /** 없을 수 있다(계정 정보를 안 붙이고 부르는 경로). */
    private String author;

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }
}
