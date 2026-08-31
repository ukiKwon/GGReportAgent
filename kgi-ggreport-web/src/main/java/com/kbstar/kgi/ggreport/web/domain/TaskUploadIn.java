package com.kbstar.kgi.ggreport.web.domain;

/**
 * 작성물 업로드 입력. Python {@code server/routers/tasks.TaskUploadIn}.
 *
 * <p>⚠️ <b>{@link TaskMessageIn} 과 형태가 같은 것은 의도적인 별칭이다</b>(M-7).
 * {@code {"content": …}} 로 모양은 같지만 의미가 다르다 — 대화 한 줄이 아니라
 * 업로드된 작성물이다. <b>"중복 모델"로 보고 지우지 말 것</b>: 지우면 엔드포인트
 * 시그니처의 의미 구분만 잃는다.
 *
 * <p>{@code by} 는 {@link TaskActorIn} 과 같은 이유로 있다 — 한글 이름을
 * {@code X-User-Id} 헤더에 못 싣기 때문이다. 원본이 {@code TaskActorIn} 을 상속하지
 * 않고 필드를 직접 둔 모양 그대로 옮긴다.
 */
public class TaskUploadIn extends TaskMessageIn {

    private String by;

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }
}
