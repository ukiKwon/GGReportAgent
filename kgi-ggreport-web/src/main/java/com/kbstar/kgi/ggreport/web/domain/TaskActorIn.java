package com.kbstar.kgi.ggreport.web.domain;

/**
 * 누가 하는지. Python {@code server/models.TaskActorIn}.
 *
 * <p>⚠️ <b>한글 이름은 헤더에 못 싣는다</b>({@code X-User-Id} 는 ASCII 만 — A1 F10).
 * 그래서 브라우저는 헤더에 기술 식별자를 넣고 <b>사람 이름은 본문으로</b> 보낸다.
 * 이게 없으면 담당자 이름이 한글인 작업은 API 로 아무것도 할 수 없다(언제나 403).
 * 워크플로의 {@code CheckpointIn.by} 와 같은 관행이다.
 */
public class TaskActorIn {

    private String by;

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }
}
