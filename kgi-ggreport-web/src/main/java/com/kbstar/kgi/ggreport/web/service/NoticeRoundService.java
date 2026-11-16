package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.NoticeInstRef;
import com.kbstar.kgi.ggreport.web.domain.NoticeRound;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundLog;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.NoticeRoundIn;
import com.kbstar.kgi.ggreport.web.mapper.NoticeRoundMapper;
import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.NoticeUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 공고 상태 기록(037, NEXT 30 2단계) — 입찰 회차 + 판정 이력(추가 전용).
 * <ul>
 *   <li>회차 키 = 기관 + 회차 순번. 회차 행은 첫 판정 저장 때 생긴다. 기관당 열린 회차 1개 — 기관 행 FOR UPDATE 로 직렬화.</li>
 *   <li>회차 닫힘: 저장 때 서버 DB 의 INSTITUTIONS.LAST_BID 가 ANCHOR_LAST_BID 보다 뒤면 닫고 새 회차에 적는다(화면 값으로 닫지 않는다).</li>
 *   <li>낙관적 잠금: 화면이 본 (round_seq, base_rev_no) 가 지금과 다르면 409(STALE·ROUND_CHANGED).</li>
 *   <li>'공고 종료' + 진행 중 제안 → 버튼이 save_confirmed 가 아니면 409 ACTIVE_PREP_CONFIRM_REQUIRED(막지 않고 확인만 요구).</li>
 *   <li>저장 자격 = 기관 레코드 수정 권한 AND 영업팀·영업팀장·영업부장({@link #canJudge}) — 컨트롤러 거부와 current() 의 can_edit 가 같은 함수를 쓴다(security 11-16 중-1·중-4).</li>
 * </ul>
 * ⚠️ 처리자는 Actor(X-Emp-No 자기신고일 수 있음)로만 채운다. 경과·미처리·자동 표시는 화면이 계산하고 서버는 스냅샷만 남긴다(planner 11-16 Q-07 ②).
 */
@Service
public class NoticeRoundService {

    static final String CLOSE_SOURCE_ADVANCED = "SOURCE_ADVANCED";
    static final String SRC_INST_DATA = "INST_DATA";
    static final int HISTORY_ROUNDS = 20;
    static final int HISTORY_LOGS = 200;

    private final NoticeRoundMapper mapper;
    private final PrepMapper preps;
    private final SysUserMapper users;
    private final PermissionService permissions;

    public NoticeRoundService(NoticeRoundMapper mapper, PrepMapper preps, SysUserMapper users, PermissionService permissions) {
        this.mapper = mapper;
        this.preps = preps;
        this.users = users;
        this.permissions = permissions;
    }

    /**
     * 공고 상태를 저장할 수 있는 사람인가 — 기관 레코드 수정 권한(map·regions edit)이 있고 역할이 영업팀·영업팀장·영업부장일 때만.
     * 컨트롤러의 403 과 current() 의 can_edit 가 이 함수 하나를 쓴다(화면은 보이는데 서버가 막는 갈림 방지).
     * ⚠️ 사번·역할은 X-Emp-No 자기신고 위의 업무 규칙이다(사칭 방지가 아니다).
     */
    @Transactional(readOnly = true)
    public boolean canJudge(String empNo) {
        if (!permissions.canEditInstitution(empNo)) {
            return false;
        }
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && HeadRules.isSales(u.getRole());
    }

    /** 기관별 지금 회차의 최신 판정(기관 자료가 넘어간 회차는 뺀다 — 화면은 그 기관을 '기록 없음'으로 센다). */
    @Transactional(readOnly = true)
    public Map<String, Object> current(String empNo) {
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        Set<String> seen = new HashSet<String>();
        for (NoticeRoundView v : mapper.selectOpenCurrent()) {
            if (!seen.add(v.getInstitutionId())) {
                continue;   // 열린 회차가 둘(정합성 깨짐, Q10) — 순번 큰 것만
            }
            if (NoticeRoundRules.advanced(v.getAnchorLastBid(), v.getCurLastBid())) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("institution_id", v.getInstitutionId());
            m.put("round_seq", v.getRoundSeq());
            m.put("rev_no", v.getRevNo());
            m.put("status_cd", v.getStatusCd());
            m.put("next_check_date", v.getNextCheckDate());
            m.put("handler_name", v.getHandlerName());
            m.put("emp_verified", v.getEmpVerified() == 1);
            m.put("handled_at", v.getHandledAt());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("items", items);
        out.put("can_edit", canJudge(empNo));
        out.put("today", Times.todayKst());
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> history(String instRaw) {
        String inst = requireInstId(instRaw);
        NoticeInstRef ref = mapper.selectInstitution(inst);
        if (ref == null) {
            throw ApiException.notFound("institution not found");
        }
        List<NoticeRoundLog> logs = mapper.selectLogs(inst, new RowBounds(0, HISTORY_LOGS + 1));   // 한 건 더 읽어 넘쳤는지 안다
        boolean truncated = logs.size() > HISTORY_LOGS;
        if (truncated) {
            logs = logs.subList(0, HISTORY_LOGS);
        }
        Map<Integer, List<Map<String, Object>>> byRound = new HashMap<Integer, List<Map<String, Object>>>();
        for (NoticeRoundLog l : logs) {
            List<Map<String, Object>> list = byRound.get(l.getRoundSeq());
            if (list == null) {
                list = new ArrayList<Map<String, Object>>();
                byRound.put(l.getRoundSeq(), list);
            }
            list.add(logView(l));
        }
        List<Map<String, Object>> rounds = new ArrayList<Map<String, Object>>();
        for (NoticeRound r : mapper.selectRounds(inst, new RowBounds(0, HISTORY_ROUNDS))) {
            boolean open = r.getClosedAt() == null;
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("round_seq", r.getRoundSeq());
            m.put("open", open);
            m.put("stale", open && NoticeRoundRules.advanced(r.getAnchorLastBid(), ref.getLastBid()));
            m.put("opened_at", r.getOpenedAt());
            m.put("closed_at", r.getClosedAt());
            m.put("close_reason_cd", r.getCloseReasonCd());
            List<Map<String, Object>> ls = byRound.get(r.getRoundSeq());
            m.put("logs", ls == null ? Collections.<Map<String, Object>>emptyList() : ls);
            rounds.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("institution_id", inst);
        out.put("rounds", rounds);
        out.put("truncated", truncated);
        return out;
    }

    /** 호출 전에 컨트롤러가 requireInstitutionEdit 와 {@link #canJudge} 를 지난다. */
    @Transactional
    public Map<String, Object> save(String instRaw, NoticeRoundIn in, Actor actor, BoardUiIds.Ui ui) {
        String inst = requireInstId(instRaw);
        NoticeRoundRules.Parsed p = NoticeRoundRules.parse(in, LocalDate.parse(Times.todayKst()));
        // ⚠️ 이 트랜잭션의 첫 DB 문장은 기관 행 잠금이다 — 위에 SELECT 를 끼우지 않는다(MySQL RR 첫 일관 읽기, PrepService.confirm 과 같은 이유).
        NoticeInstRef ref = mapper.lockInstitution(inst);
        if (ref == null) {
            throw ApiException.notFound("institution not found");
        }
        String now = Times.nowIso();
        List<NoticeRound> opens = mapper.selectOpenRounds(inst);
        NoticeRound open = opens.isEmpty() ? null : opens.get(0);
        Integer closedSeq = null;
        if (open != null && open.getAnchorLastBid() == null && ref.getLastBid() != null) {
            mapper.fillAnchor(inst, open.getRoundSeq(), ref.getLastBid());   // 빈 기준을 채울 뿐 닫지 않는다(자료가 늦게 채워진 것)
        } else if (open != null && NoticeRoundRules.advanced(open.getAnchorLastBid(), ref.getLastBid())) {
            mapper.closeRound(inst, open.getRoundSeq(), now, CLOSE_SOURCE_ADVANCED, actor.getEmpNo(), ref.getLastBid());
            closedSeq = open.getRoundSeq();
            open = null;
        }
        Integer curSeq = open == null ? null : open.getRoundSeq();
        NoticeRoundLog cur = curSeq == null ? null : mapper.selectLatestLog(inst, curSeq);
        int curRev = cur == null ? 0 : cur.getRevNo();
        if (!Objects.equals(curSeq, p.roundSeq)) {
            throw conflict("ROUND_CHANGED", "회차가 바뀌었거나 다른 사람이 먼저 기록했습니다. 목록을 새로 불러온 뒤 다시 저장하세요.", cur);
        }
        if (curRev != p.baseRev) {
            throw conflict("STALE", "다른 사람이 먼저 기록했습니다. 최신 기록을 확인하고 다시 저장하세요.", cur);
        }
        if (cur != null && NoticeRoundRules.sameJudgment(cur, p)) {
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("saved", false);
            out.put("code", "NO_CHANGE");
            out.put("round_seq", curSeq);
            out.put("rev_no", curRev);
            return out;
        }
        List<String> active = preps.selectActiveStatesByInstitution(inst);
        String activeState = active.isEmpty() ? null : active.get(0);
        if (NoticeRoundRules.CLOSED.equals(p.status) && activeState != null && !NoticeUiIds.SAVE_CONFIRMED.equals(ui.getButton())) {
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "ACTIVE_PREP_CONFIRM_REQUIRED");
            d.put("message", "진행 중인 제안이 있습니다. 공고 종료로 기록하려면 확인한 뒤 다시 저장하세요.");
            d.put("prep_state_cd", activeState);
            throw ApiException.withDetail(409, d);
        }
        SysUser me = users.selectByEmpNo(actor.getEmpNo());
        if (me == null || !HeadRules.isSales(me.getRole())) {   // 컨트롤러 canJudge 가 막는다(방어)
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        int seq;
        boolean opened = false;
        try {
            if (curSeq == null) {
                seq = mapper.selectMaxRoundSeq(inst) + 1;
                mapper.insertRound(inst, seq, SRC_INST_DATA, ref.getLastBid(), now, actor.getEmpNo());
                opened = true;
            } else {
                seq = curSeq;
            }
            NoticeRoundLog row = new NoticeRoundLog();
            row.setInstitutionId(inst);
            row.setRoundSeq(seq);
            row.setRevNo(curRev + 1);
            row.setStatusCd(p.status);
            row.setPrevStatusCd(cur == null ? null : cur.getStatusCd());
            row.setOpinion(p.opinion);
            row.setNextCheckDate(p.nextCheck);
            row.setPrevNextCheck(cur == null ? null : cur.getNextCheckDate());
            row.setActivePrep(activeState == null ? 0 : 1);
            row.setActivePrepState(activeState);
            row.setSnapDueDate(p.dueDate);
            row.setSnapDueBasis(p.dueBasis);
            row.setSnapDueConfirmed(p.dueConfirmed);
            row.setSnapAutoKind(p.autoKind);
            row.setSnapAutoDays(p.autoDays);
            row.setSnapLastBid(ref.getLastBid());
            row.setHandlerEmpNo(actor.getEmpNo());
            row.setHandlerName(me.getName());
            row.setEmpVerified(actor.isVerified() ? 1 : 0);
            row.setScreenId(ui.getScreen());
            row.setButtonId(ui.getButton());
            row.setUiValid(ui.isValid() ? 1 : 0);
            row.setHandledAt(now);
            mapper.insertLog(row);
        } catch (DuplicateKeyException e) {   // 잠금이 있어 정상 경로에선 오지 않는다 — PK 가 마지막 방어선
            throw conflict("STALE", "다른 사람이 먼저 기록했습니다. 최신 기록을 확인하고 다시 저장하세요.", null);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("saved", true);
        out.put("institution_id", inst);
        out.put("round_seq", seq);
        out.put("rev_no", curRev + 1);
        out.put("round_opened", opened);
        out.put("closed_round_seq", closedSeq);
        out.put("status_cd", p.status);
        out.put("next_check_date", p.nextCheck);
        out.put("handler_name", me.getName());
        out.put("emp_verified", actor.isVerified());
        out.put("handled_at", now);
        return out;
    }

    private static String requireInstId(String raw) {
        if (!InstitutionHeadService.validInstId(raw)) {
            throw ApiException.notFound("institution not found");
        }
        return raw;
    }

    private static ApiException conflict(String code, String message, NoticeRoundLog cur) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        Map<String, Object> latest = null;
        if (cur != null) {
            latest = new LinkedHashMap<String, Object>();
            latest.put("round_seq", cur.getRoundSeq());
            latest.put("rev_no", cur.getRevNo());
            latest.put("status_cd", cur.getStatusCd());
            latest.put("handler_name", cur.getHandlerName());
            latest.put("handled_at", cur.getHandledAt());
        }
        d.put("latest", latest);
        return ApiException.withDetail(409, d);
    }

    /** 화면용 이력 한 건. 사번·화면·버튼은 내보내지 않는다(감사 전용, design 6-B). */
    private static Map<String, Object> logView(NoticeRoundLog l) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("rev_no", l.getRevNo());
        m.put("status_cd", l.getStatusCd());
        m.put("prev_status_cd", l.getPrevStatusCd());
        m.put("opinion", l.getOpinion() == null ? "" : l.getOpinion());
        m.put("next_check_date", l.getNextCheckDate());
        m.put("prev_next_check_date", l.getPrevNextCheck());
        m.put("active_prep", l.getActivePrep() == 1);
        m.put("handler_name", l.getHandlerName());
        m.put("emp_verified", l.getEmpVerified() == 1);
        m.put("handled_at", l.getHandledAt());
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("due_date", l.getSnapDueDate());
        s.put("due_basis", l.getSnapDueBasis() == null ? null : l.getSnapDueBasis().toLowerCase(Locale.ROOT));
        s.put("due_confirmed", l.getSnapDueConfirmed() == 1);
        s.put("auto_kind", l.getSnapAutoKind() == null ? null : l.getSnapAutoKind().toLowerCase(Locale.ROOT));
        s.put("auto_days", l.getSnapAutoDays());
        m.put("snapshot", s);
        return m;
    }
}
