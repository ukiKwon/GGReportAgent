package com.kbstar.kgi.ggreport.web.service;

import java.io.IOException;

/**
 * 브라우저가 응답 도중 끊었다 — <b>실패가 아니라 중단</b>이다.
 *
 * <p>둘을 가르는 것이 이 클래스의 존재 이유다. 원본 파이썬은 이 구분이 언어에서
 * 공짜였다: 클라이언트 끊김은 {@code GeneratorExit}({@code BaseException})라
 * {@code except Exception} 에 걸리지 않고 {@code finally} 로 직행한다
 * ({@code server/routers/chat.py} 주석). 자바에는 그 구분이 없어 둘 다
 * {@link IOException} 으로 오므로, <b>쓰기에서 난 IO 오류만</b> 이 예외로 바꿔
 * 같은 갈래를 만든다.
 *
 * <p>구분이 무너지면 생기는 일: 사용자가 탭을 닫았을 뿐인데 이력에
 * {@code [답변 실패] …} 가 남는다. 그 문구는 <b>다음 질문 때 대화 맥락으로 모델에
 * 다시 들어가므로</b>, 멀쩡한 대화가 "실패했다"는 전제를 달고 이어진다.
 */
public class ClientGoneException extends IOException {

    public ClientGoneException(IOException cause) {
        super(cause);
    }
}
