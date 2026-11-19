package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.PrepIn;
import com.kbstar.kgi.ggreport.web.mapper.NoticeRoundMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepNobidAckMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * '입찰 없음'인데 제안이 진행 중인 건 알림(048, 사용자 11-19). 사전준비 상세에서 건 하나를 열 때만 판정한다(design 11-19 6-1).
 * <ul>
 *   <li>대상(applicable): 건이 활성 상태이고, 그 기관의 마지막 회차가 입찰 없음(NO_BID)으로 닫혔고, 기관 자료가 그 뒤로 넘어가지 않았다
 *       (NoticeRoundService.current() 의 닫힌 회차 규칙과 같다).</li>
 *   <li>받는 사람(팝업): 영업팀·영업팀장·영업부장 중 — 영업팀장·영업부장, 그 건의 활성 담당자, 개설 전 건의 확정 취소 권한자. 그 밖(디자이너 포함)은 사실 줄만(fact_only).</li>
 *   <li>다시 안 뜸: 같은 사람·같은 기관·같은 회차·같은 공고 기록 시각(HANDLED_AT)의 [계속 작성] 기록이 있으면 fact_only. 판정은 서버가 한다.</li>
 *   <li>공고 기록자 이름·시각은 입찰 공고 현황(map) 조회 권한이 있을 때만 싣는다 — 메뉴 권한 우회 방지(security 11-19 중-4).</li>
 *   <li>정리 버튼 판정은 PrepService.canUnconfirm/canCancel 하나를 쓴다(HeadRules 와 섞지 않는다, 중-1).</li>
 * </ul>
 * [계속 작성]은 업무 상태(BID_PREP·NOTICE_ROUND)를 바꾸지 않고 PREP_NOBID_ACK 한 줄만 남긴다.
 * 주의: 사번·화면·버튼은 X-Emp-No 등 자기신고다 — 다른 사람 사번으로 보내면 그 사람의 알림이 꺼진다(수용 위험, security 하-5). EMP_VERIFIED 는 사실만 적는다.
 */
@Service
public class PrepNobidService {

    /** 입찰 공고 현황 화면의 서버 메뉴 키 — NoticeRoundController.VIEW_MENU 와 같은 값(메뉴 키 8개 동결). */
    static final String NOTICE_MENU = "map";
    static final String MODE_POPUP = "popup";
    static final String MODE_FACT = "fact_only";
    static final String MODE_NONE = "none";
    static final String TIDY_UNCONFIRM = "UNCONFIRM";
    static final String TIDY_CANCEL = "CANCEL";
    static final String TIDY_OPEN_PENDING = "OPEN_PENDING";
    static final String TIDY_PLAN_PENDING = "PLAN_PENDING";
    static final String TIDY_NONE = "NONE";
    private static final int NO_MAX = 999999;   // NUMBER(6)

    /** 활성 건 상태 — PrepMapper.countActiveByInstitution·selectActiveStatesByInstitution 의 목록과 같아야 한다(바꾸면 셋 다). */
    static final Set<String> ACTIVE_STATES = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            PrepService.CONFIRMED, PrepService.OPEN_PENDING, PrepService.IN_PROGRESS,
            PrepService.APPROVAL_PENDING, PrepService.WRITABLE, PrepService.WRITING)));

    private final PrepService prep;
    private final NoticeRoundMapper rounds;
    private final PrepNobidAckMapper acks;
    private final BidAssignmentService assignments;
    private final PermissionService permissions;

    public PrepNobidService(PrepService prep, NoticeRoundMapper rounds, PrepNobidAckMapper acks,
                            BidAssignmentService assignments, PermissionService permissions) {
        this.prep = prep;
        this.rounds = rounds;
        this.acks = acks;
        this.assignments = assignments;
        this.permissions = permissions;
    }

    /**
     * 사전준비 상세의 {@code nobid_notice}. 열람 규칙은 상세와 같다(못 보면 404). 키는 늘 같은 순서로 다 싣는다(대상 아님이면 값만 null/false).
     * 다른 사람의 [계속 작성] 기록은 싣지 않는다(acked 는 본인 것만).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> view(SysUser me, String bidCaseId) {
        BidPrep p = prep.requireVisible(me, bidCaseId);
        NoticeRoundView v = currentNoBid(p);
        boolean applicable = v != null;
        boolean recipient = applicable && isRecipient(me, p);
        boolean seeNotice = applicable && permissions.canView(me.getEmpNo(), NOTICE_MENU);
        boolean acked = applicable
                && acks.selectAckedAt(me.getEmpNo(), p.getInstitutionId(), v.getRoundSeq(), v.getHandledAt()) != null;
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("applicable", applicable);
        m.put("mode", !applicable ? MODE_NONE : recipient && !acked ? MODE_POPUP : MODE_FACT);
        m.put("institution_id", p.getInstitutionId());
        m.put("round_seq", applicable ? v.getRoundSeq() : null);
        m.put("rev_no", applicable ? v.getRevNo() : null);
        m.put("status_cd", applicable ? v.getStatusCd() : null);
        m.put("handled_at", seeNotice ? v.getHandledAt() : null);
        m.put("handler_name", seeNotice ? v.getHandlerName() : null);
        m.put("emp_verified", seeNotice ? Boolean.valueOf(v.getEmpVerified() == 1) : null);   // false = 자기신고
        m.put("can_view_notice", seeNotice);
        m.put("acked", acked);
        m.put("can_ack", recipient);
        m.put("tidy_action", applicable ? tidyAction(me, p) : TIDY_NONE);
        return m;
    }

    /**
     * [계속 작성] 기록. 순서: 역할(403) → 본문(400) → 건(404, 상세와 같은 열람 규칙) → 받는 사람(403) → 대상 여부(409 NOT_APPLICABLE)
     * → 최신 여부(409 NOTICE_CHANGED) → INSERT(중복 키면 saved=false). 저장 값은 모두 서버가 다시 읽은 값이다.
     */
    @Transactional
    public Map<String, Object> ack(SysUser me, Actor actor, String bidCaseId, PrepIn.NobidAck in, BoardUiIds.Ui ui) {
        if (!PrepService.isSalesOrHead(me)) {   // 역할 403 이 본문(400)·건 조회(404)보다 먼저(security F4, 11-19 하-2)
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        int seq = checkedNo(in == null ? null : in.getRoundSeq());
        int rev = checkedNo(in == null ? null : in.getRevNo());
        BidPrep p = prep.requireVisible(me, bidCaseId);
        if (!isRecipient(me, p)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        NoticeRoundView v = currentNoBid(p);
        if (v == null) {
            throw coded(409, "NOT_APPLICABLE", "이 건은 지금 '입찰 없음' 알림 대상이 아닙니다. 새로 고친 뒤 확인하세요.");
        }
        if (v.getRoundSeq().intValue() != seq || v.getRevNo().intValue() != rev) {
            throw coded(409, "NOTICE_CHANGED", "공고 기록이 바뀌었습니다. 새로 고친 뒤 다시 확인하세요.");
        }
        String now = Times.nowIso();
        boolean saved = true;
        try {
            acks.insertAck(me.getEmpNo(), p.getInstitutionId(), v.getRoundSeq(), v.getHandledAt(), v.getRevNo(),
                    p.getBidCaseId(), p.getStateCd(), BoardMaterialService.verified(actor),
                    ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, now);
        } catch (DuplicateKeyException e) {   // 같은 사람·같은 공고 기록 — 이미 기록됨(두 번 누름·두 탭, security 중-3)
            saved = false;
        }
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("saved", saved);
        m.put("institution_id", p.getInstitutionId());
        m.put("acked_at", saved ? now : acks.selectAckedAt(me.getEmpNo(), p.getInstitutionId(), v.getRoundSeq(), v.getHandledAt()));
        return m;
    }

    /** 활성 건 + 그 기관의 입찰 없음 닫힌 마지막 회차 + 기관 자료가 넘어가지 않음. 아니면 null. */
    private NoticeRoundView currentNoBid(BidPrep p) {
        if (!ACTIVE_STATES.contains(p.getStateCd())) {
            return null;
        }
        List<NoticeRoundView> rows = rounds.selectClosedNoBidOne(p.getInstitutionId());
        if (rows.isEmpty()) {
            return null;
        }
        NoticeRoundView v = rows.get(0);
        String base = v.getClosedLastBid() != null ? v.getClosedLastBid() : v.getAnchorLastBid();   // NoticeRoundService.current() 와 같은 기준
        return NoticeRoundRules.advanced(base, v.getCurLastBid()) ? null : v;
    }

    /** 팝업 받는 사람 — 영업 계열(디자이너 제외) 중 팀장·부장, 활성 담당자, 개설 전 건의 확정 취소 권한자(design 11-19 권장). */
    private boolean isRecipient(SysUser me, BidPrep p) {
        if (!PrepService.isSalesOrHead(me)) {
            return false;
        }
        if (PrepService.isLeadOrHead(me)) {
            return true;
        }
        if (assignments.isActiveAssignee(p.getBidCaseId(), me.getEmpNo())) {
            return true;
        }
        String st = p.getStateCd();
        return (PrepService.CONFIRMED.equals(st) || PrepService.OPEN_PENDING.equals(st))
                && PrepService.hasUnconfirmAuthority(me, p);
    }

    /** [제안 진행 정리하기] 버튼 판정 — 실행은 기존 unconfirm·cancel API 가 다시 판정한다. 막힌 상태 코드는 언젠가 정리할 권한이 있는 사람에게만. */
    private static String tidyAction(SysUser me, BidPrep p) {
        if (PrepService.canUnconfirm(me, p)) {
            return TIDY_UNCONFIRM;
        }
        if (PrepService.canCancel(me, p)) {
            return TIDY_CANCEL;
        }
        if (PrepService.OPEN_PENDING.equals(p.getStateCd()) && PrepService.hasUnconfirmAuthority(me, p)) {
            return TIDY_OPEN_PENDING;   // 개설 신청을 먼저 회수·반려
        }
        if (PrepService.APPROVAL_PENDING.equals(p.getStateCd()) && PrepService.hasCancelAuthority(me)) {
            return TIDY_PLAN_PENDING;   // 사전준비 승인 요청을 먼저 회수·반려
        }
        return TIDY_NONE;
    }

    private static int checkedNo(Integer v) {
        if (v == null || v.intValue() < 1 || v.intValue() > NO_MAX) {
            throw coded(400, "BAD_VALUE", "확인한 공고 기록 번호(round_seq·rev_no)가 올바르지 않습니다.");
        }
        return v.intValue();
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
