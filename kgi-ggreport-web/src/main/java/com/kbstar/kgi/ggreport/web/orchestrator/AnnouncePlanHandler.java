package com.kbstar.kgi.ggreport.web.orchestrator;

import java.util.Collections;
import java.util.Map;

/**
 * 3팀 초안이 합류한 직후, 기획승인 게이트 <b>직전</b>에 결재요청 알림을 딱 1회 보낸다.
 *
 * <p>⚠️ <b>왜 게이트가 아니라 별도 노드인가.</b> 게이트는 결재가 올 때마다 <b>다시
 * 실행된다</b>(멈춘 지점부터가 아니라 그 노드부터). 알림을 게이트 본문에 두면 반려 →
 * 재작성 → 재승인을 돌 때마다 같은 쪽지가 쌓인다. 원본이 이 노드를 따로 뺀 이유가
 * 그것이고, 여기서도 같게 옮겼다.
 */
public class AnnouncePlanHandler implements NodeHandler {

    @Override
    public Map<String, Object> run(Map<String, Object> state, Recorder recorder) {
        recorder.notify("영업팀", "결재요청",
                "기획승인 대기 — 3팀 초안이 준비됐다. 검토 후 승인/반려 바랍니다.");
        return Collections.emptyMap();
    }
}
