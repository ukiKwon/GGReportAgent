package com.kbstar.kgi.ggreport.web.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 옛 입찰 흐름(참여 결정 3단·무가드 공고 생성·조회)의 열림 여부.
 *
 * <p>닫힘(false)이면 NEXT 70 보안 조건 B1·B5가 걸린다: 참여 결정은 410, 공고 생성은 관리자 전용,
 * 담당자 뷰는 본인만, 상세는 워크플로 열람 권한 필요.
 *
 * <p>⚠️ 기본값은 지금 <b>열림(true)</b>이다 — 사용자 결정(2026-11-10): 참여 결정은 사전준비의
 * '제안서 작성하기'(세 팀 작업 생성)가 생길 때 함께 닫는다. 그 커밋에서 기본값을 false로 바꾼다.
 * 골든 10~14·25(기준 업무 시나리오 시험)는 옛 흐름을 재생하므로 시험({@code AppTest})에서는 늘 열림이다.
 */
@Component
public class LegacyFlowSwitch {

    private static final Logger LOG = LoggerFactory.getLogger(LegacyFlowSwitch.class);
    private volatile boolean open;

    public LegacyFlowSwitch(@Value("${ggreport.legacy-flow.open:true}") boolean open) {
        this.open = open;
        if (open) {
            LOG.warn("ggreport.legacy-flow.open=true — 옛 참여 결정·무가드 입찰 건 경로가 열려 있다"
                    + "(NEXT 70 '제안서 작성하기' 적용 때 닫는다)");
        }
    }

    public boolean isOpen() { return open; }

    /** 시험 전용. 바꾼 시험은 반드시 finally/@After 에서 원래 값으로 되돌린다. */
    public void setOpenForTest(boolean v) { this.open = v; }
}
