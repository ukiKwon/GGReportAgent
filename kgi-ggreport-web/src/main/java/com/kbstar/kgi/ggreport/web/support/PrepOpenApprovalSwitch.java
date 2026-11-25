package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.config.BidTargetSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 사전준비 개설 신청(BID_OPEN, 팀장 결재)을 새로 올릴 수 있는가 — 사용자 11-25(NEXT 114): 결재는 '목표 기관 추가' 1번이므로 기본 꺼짐.
 * 꺼짐(기본): POST …/prep/open-requests 는 409 OPEN_APPROVAL_CLOSED, 담당자 지정은 POST …/prep/start(결재 없음, 팀장 알림).
 * 켜짐: 옛 흐름으로 되돌린다 — 개설 신청만 열리고 …/prep/start 는 409 OPEN_APPROVAL_ON(결재를 건너뛰는 길이 함께 열려 있지 않게).
 * 켜지는 조건(둘 중 하나, security 11-25): ① 속성 ggreport.prep.open-approval.enabled=true ② 목표 기관 결재가 꺼져 있을 때
 * ({@link BidTargetSettings#isApprovalRequired()} 가 false — 결재 없이 목표가 생기는 길이 열리면 개설 결재가 자동으로 돌아와 '결재 0' 경로를 닫는다).
 * 어느 쪽이든 이미 올라간 BID_OPEN(개설 대기)의 승인·반려·회수·대결은 그대로다(옛 건은 끝까지 — PREP_APPROVAL 폐지와 같은 원칙).
 * 시험 컨텍스트는 하나로 캐시되므로(test application.properties 30–32) 속성이 아니라 {@link #setForTest} 로 바꾼다.
 */
@Component
public class PrepOpenApprovalSwitch {

    private static final Logger LOG = LoggerFactory.getLogger(PrepOpenApprovalSwitch.class);

    private final boolean property;
    private final BidTargetSettings targetSettings;
    private volatile boolean forcedOnForTest;

    public PrepOpenApprovalSwitch(@Value("${ggreport.prep.open-approval.enabled:false}") boolean property,
                                  BidTargetSettings targetSettings) {
        this.property = property;
        this.targetSettings = targetSettings;
        if (property) {
            LOG.warn("ggreport.prep.open-approval.enabled=true — 사전준비 개설 신청(팀장 결재) 옛 흐름이 열려 있고 결재 없는 시작은 막혀 있다");
        } else if (!targetSettings.isApprovalRequired()) {
            LOG.warn("ggreport.bid-target.approval.enabled=false — 목표 기관 결재가 꺼져 있어 사전준비 개설 신청(팀장 결재) 옛 흐름이 자동으로 열려 있고 결재 없는 시작은 막혀 있다");
        }
    }

    /** 켜짐 = 속성 ∨ 목표 결재 꺼짐(실시간) ∨ 시험 강제. */
    public boolean isOn() {
        return forcedOnForTest || property || !targetSettings.isApprovalRequired();
    }

    /** 시험 전용. true = 강제로 켬, false = 강제를 풀어 기본 판정으로 되돌림. 바꾼 시험은 반드시 @After 에서 false 로 되돌린다. */
    public void setForTest(boolean v) { this.forcedOnForTest = v; }
}
