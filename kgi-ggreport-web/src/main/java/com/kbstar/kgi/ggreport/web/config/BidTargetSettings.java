package com.kbstar.kgi.ggreport.web.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.time.MonthDay;
import java.time.format.DateTimeParseException;

/**
 * 목표 기관 결재·자동 이월(NEXT 105) 운영 설정. 코드 기본값이 있어 키가 없어도 기동한다.
 * approval.enabled=false → 영업 계열 전원이 결재 없이 바로 바꾼다(되돌리기 스위치). carry.enabled=false → 자동 이월 끔.
 * carry.default-start = RFP 협약 개시일 기록이 없을 때 목표 연도 다음 해의 이 날(MM-DD)을 개시일로 본다.
 */
@Component
public class BidTargetSettings {
    private volatile boolean approvalRequired;
    private volatile boolean carryEnabled;
    private volatile MonthDay carryDefaultStart;

    // 코드 기본값은 둘 다 true — 화면(NEXT 105)이 일괄 요청·이월을 붙였다. 끄려면 ggreport.bid-target.approval.enabled=false · carry.enabled=false(되돌리기 스위치).
    // (화면 적용 커밋에서 true 로 바꿨다. 값은 로컬 config로 덮을 수 있다.)
    public BidTargetSettings(@Value("${ggreport.bid-target.approval.enabled:true}") boolean approvalRequired,
                             @Value("${ggreport.bid-target.carry.enabled:true}") boolean carryEnabled,
                             @Value("${ggreport.bid-target.carry.default-start:01-01}") String carryDefaultStart) {
        this.approvalRequired = approvalRequired;
        this.carryEnabled = carryEnabled;
        this.carryDefaultStart = parse(carryDefaultStart);
    }

    static MonthDay parse(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (!s.matches("[0-9]{2}-[0-9]{2}")) throw new IllegalStateException("ggreport.bid-target.carry.default-start must be MM-DD");
        try { return MonthDay.parse("--" + s); }
        catch (DateTimeParseException e) { throw new IllegalStateException("ggreport.bid-target.carry.default-start must be a valid MM-DD"); }
    }

    public boolean isApprovalRequired() { return approvalRequired; }
    public boolean isCarryEnabled() { return carryEnabled; }

    /** 개시일 기록이 없을 때 목표 연도 Y 의 판정일 = (Y+1)년 이 날(기본 1월 1일 — 금고 약정은 보통 입찰 다음 해 1월 개시). */
    public MonthDay getCarryDefaultStart() { return carryDefaultStart; }
    /** "MM-DD" */
    public String defaultStartText() { return carryDefaultStart.toString().substring(2); }

    /** 시험용 — 바꾼 시험은 finally 에서 되돌린다(컨텍스트 하나 공유). */
    public void setApprovalRequired(boolean v) { approvalRequired = v; }
    public void setCarryEnabled(boolean v) { carryEnabled = v; }
    public void setCarryDefaultStart(MonthDay v) { carryDefaultStart = v; }
}
