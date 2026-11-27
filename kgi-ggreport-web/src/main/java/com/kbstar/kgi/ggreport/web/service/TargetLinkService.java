package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.PrepBoardCheck;
import com.kbstar.kgi.ggreport.web.domain.TargetCaseRef;
import com.kbstar.kgi.ggreport.web.dto.BidTargetLinkIn;
import com.kbstar.kgi.ggreport.web.mapper.BidTargetMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;

/**
 * NEXT 125 — 목표 건 ↔ 제안 건 연결 쓰기. 제안 확정·되살리기·확정 취소·중단(6e PrepService)과 현황판 [연결 확인](link)이 부른다.
 * 연결·비우기 = 목표 건의 새 REV(ACTION_CD=SAVE) — 수정자·자기신고 여부·화면·버튼이 행에 남는다. 결재 없음(목표 연도·대상·담당 불변).
 * 공개 메서드(confirmInferred 제외)는 부른 쪽이 기관 행 잠금을 먼저 잡은 트랜잭션 안에서 부른다.
 * 한 공고 건은 살아 있는 목표 건 하나에만 이어진다(requireCaseFree — 건을 고른 뒤 모든 분기에서 한 번).
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙.
 */
@Service
public class TargetLinkService {
    private static final String CASE_ID = "[A-Za-z0-9._-]{1,64}";

    private final BidTargetMapper mapper;
    private final BidTargetService targets;
    private final PrepMapper preps;

    public TargetLinkService(BidTargetMapper mapper, BidTargetService targets, PrepMapper preps) {
        this.mapper = mapper;
        this.targets = targets;
        this.preps = preps;
    }

    /** 제안 확정 — 살아 있는 올해 목표 건·그 건 결재 중 아님·진행 중(막는 활성) 제안 없음(명시·추정)·협약 완료 아님. 탈락 건은 막지 않는다(재공고 확정). */
    public BidTarget requireGoalForConfirm(String inst, int targetNo, int thisYear) {
        BidTarget t = liveGoal(inst, targetNo);
        if (t == null || t.getTargetYear() == null || t.getTargetYear().intValue() != thisYear) throw notGoal();
        if (mapper.countPendingByTarget(inst, targetNo) > 0) throw coded(409, "GOAL_CHANGE_PENDING", BidTargetKeys.TARGET_PENDING_MSG);
        Map<String, Map<String, String>> marks = marksOf();
        List<TargetCaseRef> cases = mapper.selectCasesOfInst(inst);
        for (TargetCaseRef c : cases) {
            if (!c.getBidCaseId().equals(t.getBidCaseId())) continue;
            Map<String, String> m = marks.containsKey(c.getBidCaseId()) ? marks.get(c.getBidCaseId()) : Collections.<String, String>emptyMap();
            if (PrepStage5.ST_CONTRACTED.equals(PrepStage5.status(c.getStateCd(), c.getOpenedAt(), m))) {
                throw coded(409, "GOAL_CONTRACTED", "이미 협약이 끝난 목표 건입니다.");   // 팀 결정(되돌리기 쉬움)
            }
            if (BidTargetKeys.blocking(c, marks)) throw already();
        }
        if (BidTargetKeys.infer(liveGoals(inst), cases, marks).containsKey(inst + "#" + targetNo)) throw already();
        return t;
    }

    /** 사전준비 시작 — 이 건에 이어진 살아 있는 목표 건(없으면 null: 호출 쪽이 옛 기관 판정). */
    public BidTarget goalOfCase(String inst, String bid) {
        for (BidTarget o : liveGoals(inst)) if (bid.equals(o.getBidCaseId())) return o;
        return null;
    }

    /** 시작 조건(건 기준): 올해 목표·그 건 결재 중 아님. */
    public void requireGoalForStart(BidTarget g, int thisYear) {
        if (g.getTargetYear() == null || g.getTargetYear().intValue() != thisYear) throw notGoal();
        if (mapper.countPendingByTarget(g.getInstitutionId(), g.getTargetNo()) > 0) throw coded(409, "GOAL_CHANGE_PENDING", BidTargetKeys.TARGET_PENDING_MSG);
    }

    /** 다른 살아 있는 목표 건의 최신 연결이 이 건이면 409 CASE_LINKED(security 막을 것 ①). */
    public void requireCaseFree(String inst, String bid, int targetNo) {
        for (BidTarget o : liveGoals(inst)) {
            if (o.getTargetNo() != targetNo && bid.equals(o.getBidCaseId())) throw coded(409, "CASE_LINKED", "이 공고는 이미 다른 목표 건과 이어져 있습니다.");
        }
    }

    /** 다른 살아 있는 목표 건에 이어진 건 번호들(되살리기 후보 거르기). */
    public Set<String> linkedElsewhere(String inst, int targetNo) {
        Set<String> s = new HashSet<String>();
        for (BidTarget o : liveGoals(inst)) if (o.getTargetNo() != targetNo && o.getBidCaseId() != null) s.add(o.getBidCaseId());
        return s;
    }

    /**
     * 연결 — 순위: 한쪽이 비면 다른 쪽 값, 둘 다 있고 다르면 409 RANK_MISMATCH. 미정이 값이 되면 키·칸 결재 검사(security ⑤).
     * 기타(OTHER)면 코드만 맞추고 이름(AIM_RANK_ETC)은 목표 건에 그대로 둔다. t 는 최신 행이어야 한다(호출 쪽이 방금 읽은 것).
     */
    public Map<String, Object> link(BidTarget t, String bid, String caseRank, Actor actor, BoardUiIds.Ui ui) {
        requireCaseFree(t.getInstitutionId(), bid, t.getTargetNo());
        String aim = t.getAimRankCd();
        if (aim != null && caseRank != null && !aim.equals(caseRank)) throw coded(409, "RANK_MISMATCH", "공고의 금고 순위가 목표 건과 다릅니다.");
        String resolved = aim != null ? aim : caseRank;
        if (aim == null && resolved != null) {
            targets.checkGoalSlots(t.getInstitutionId(), Collections.singletonList(
                    new BidTargetKeys.Slot(t.getTargetNo(), t.getTargetYear(), t.getBidSubjectCd(), t.getBidSubjectEtc(), resolved)), null, null);
        }
        if (caseRank == null && resolved != null) mapper.updateCaseRankIfNull(bid, resolved);
        if (t.getRevNo() + 1 > BidTargetService.NO_MAX) throw BidTargetService.conflict("LIMIT", BidTargetService.LIMIT_MSG, t);
        t.setRevNo(t.getRevNo() + 1); t.setActionCd(BidTargetService.ACTION_SAVE); t.setBidCaseId(bid); t.setAimRankCd(resolved);
        t.setCancelReasonCd(null); t.setCancelReasonEtc(null);
        return targets.insert(t, actor, ui, null);
    }

    /** 확정 취소·중단 — 이 건에 이어진 살아 있는 목표 건의 연결을 비우는 REV(잠든 연결 없애기, security 막을 것 ①). 없으면 0. */
    public int unlinkOnEnd(String inst, String bid, Actor actor, BoardUiIds.Ui ui) {
        int n = 0;
        for (BidTarget o : liveGoals(inst)) {
            if (!bid.equals(o.getBidCaseId())) continue;
            if (o.getRevNo() + 1 > BidTargetService.NO_MAX) throw BidTargetService.conflict("LIMIT", BidTargetService.LIMIT_MSG, o);
            o.setRevNo(o.getRevNo() + 1); o.setActionCd(BidTargetService.ACTION_SAVE); o.setBidCaseId(null);
            o.setCancelReasonCd(null); o.setCancelReasonEtc(null);
            targets.insert(o, actor, ui, null);
            n++;
        }
        return n;
    }

    /** 옛 경로(스위치 꺼짐에서만) — 올해 살아 있는 MAIN_BANK 목표 건 중 연결 없고 그 건 결재 중 아닌 것이 딱 1개이면 잇는다. 잇지 않으면 false. */
    public boolean autoLink(String inst, String bid, int thisYear, Actor actor, BoardUiIds.Ui ui) {
        if (targets.multiSubject()) return false;   // 스위치가 켜지면 target_no 로만 잇는다(옛 자동 연결은 꺼짐 전용, security)
        BidTarget only = null;
        int n = 0;
        for (BidTarget o : liveGoals(inst)) {
            String subj = o.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : o.getBidSubjectCd();
            if (!BidSubjects.MAIN_BANK.equals(subj) || o.getBidCaseId() != null) continue;
            if (o.getTargetYear() == null || o.getTargetYear().intValue() != thisYear) continue;
            if (mapper.countPendingByTarget(inst, o.getTargetNo()) > 0) continue;
            only = o; n++;
        }
        if (n != 1 || linkedElsewhere(inst, only.getTargetNo()).contains(bid)) return false;
        link(only, bid, null, actor, ui);
        return true;
    }

    /**
     * 추정 → 명시(현황판 [연결 확인], 버튼 link_bid_case). 서버가 다시 계산한 추정 연결과 같은 건만 굳힌다. 결재 없음(목표 내용 불변).
     * 순서: 형식 400 → 기관 잠금 → 살아 있는 목표 건 아님 404 → STALE → CHANGE_PENDING → ALREADY_LINKED → NOT_INFERRED → 연결.
     */
    @Transactional
    public Map<String, Object> confirmInferred(String instRaw, String noRaw, BidTargetLinkIn in, Actor actor, BoardUiIds.Ui ui) {
        if (!InstitutionHeadService.validInstId(instRaw)) throw ApiException.notFound("institution not found");
        if (noRaw == null || !noRaw.matches("[1-9][0-9]{0,8}")) throw ApiException.notFound("target not found");
        if (in == null || in.getBaseRevNo() == null) throw ApiException.badRequest("연결할 때는 화면이 본 기록 번호(base_rev_no)가 필요합니다.");
        String bid = in.getBidCaseId() == null ? "" : in.getBidCaseId().trim();
        if (!bid.matches(CASE_ID)) throw ApiException.badRequest("연결할 제안 건을 골라 주세요.");
        String inst = instRaw;
        int no = Integer.parseInt(noRaw);
        if (mapper.lockInstitution(inst) == null) throw ApiException.notFound("institution not found");   // 첫 DB 문장
        BidTarget t = liveGoal(inst, no);
        if (t == null) throw ApiException.notFound("target not found");
        if (in.getBaseRevNo().intValue() != t.getRevNo()) throw BidTargetService.conflict("STALE", "다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 시도해 주세요.", t);
        if (mapper.countPendingByTarget(inst, no) > 0) throw BidTargetService.pendingConflict(t);
        if (t.getBidCaseId() != null) throw coded(409, "ALREADY_LINKED", "이미 공고와 이어진 목표 건입니다.");
        List<TargetCaseRef> cases = mapper.selectCasesOfInst(inst);
        Map<String, String> inferred = BidTargetKeys.infer(liveGoals(inst), cases, marksOf());
        if (!bid.equals(inferred.get(inst + "#" + no))) throw coded(409, "NOT_INFERRED", "서버가 추정한 연결과 다릅니다. 화면을 새로 고쳐 주세요.");
        String caseRank = null;
        for (TargetCaseRef c : cases) if (bid.equals(c.getBidCaseId())) caseRank = c.getBidRankCd();
        link(t, bid, caseRank, actor, ui);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("target_no", t.getTargetNo());
        out.put("rev_no", t.getRevNo());
        out.put("bid_case_id", bid);
        return out;
    }

    // ---- 도움 ----

    private List<BidTarget> liveGoals(String inst) {
        List<BidTarget> out = new ArrayList<BidTarget>();
        for (BidTarget o : mapper.selectActiveByInst(inst)) if (BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(o))) out.add(o);
        return out;
    }

    private BidTarget liveGoal(String inst, int no) {
        BidTarget t = mapper.selectLatestTarget(inst, no);
        if (t == null || BidTargetService.ACTION_CANCEL.equals(t.getActionCd()) || !BidTargetRules.KIND_GOAL.equals(BidTargetRules.kindOf(t))) return null;
        return t;
    }

    /** 건 번호 → (칸 → 현재 값). PrepStage5·BidTargetKeys.infer 의 입력. */
    private Map<String, Map<String, String>> marksOf() {
        Map<String, Map<String, String>> out = new HashMap<String, Map<String, String>>();
        for (PrepBoardCheck k : preps.selectStageMarks()) {
            Map<String, String> m = out.get(k.getBidCaseId());
            if (m == null) { m = new HashMap<String, String>(); out.put(k.getBidCaseId(), m); }
            m.put(k.getColCd(), k.getMarkCd());
        }
        return out;
    }

    private static ApiException notGoal() {
        return coded(409, "NOT_GOAL_TARGET", "이 목표 건은 올해 목표가 아니어서 제안 확정을 할 수 없습니다.");
    }

    private static ApiException already() {
        return coded(409, "PREP_ALREADY_ACTIVE", "이 목표 건에는 이미 진행 중인 제안 건이 있습니다.");
    }

    private static ApiException coded(int status, String code, String message) {
        return BidTargetService.detail(status, code, message, null);
    }
}
