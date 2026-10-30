package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.OverviewPair;
import com.kbstar.kgi.ggreport.web.domain.OverviewRun;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.WorkflowOverviewItem;
import com.kbstar.kgi.ggreport.web.dto.WorkflowOverviewResponse;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.mapper.WorkflowOverviewMapper;
import com.kbstar.kgi.ggreport.web.orchestrator.OrchRun;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 모든 기관의 현재 진행 상태를 한 번에 — GET /workflow/overview. 읽기 전용, 쿼리 수 상수(기관 수와 무관).
 *
 * <p>done = 최신 공고가 '제출완료' (complete() 는 STAGE 를 올리지 않고 공고 상태만 바꾼다).
 * <p>gate = 마지막 실행이 PENDING_APPROVAL 일 때만. state 는 마지막 실행 상태, 실행이 없으면 NONE.
 * <p>mine = TASKS.ASSIGNEE 가 호출자 사번 또는 이름과 같은 기관. ASSIGNEE 가 이름 문자열이라 동명이인은 구분하지 못한다.
 */
@Service
public class WorkflowOverviewService {

    static final String[] STAGE_LABELS = {
            "입찰현황 파악", "입찰상황 발생", "RFI 공시", "RFI 분석", "제안서 기획",
            "세부기획", "취합", "검토", "제출"};
    static final String SUBMITTED = "제출완료";

    /** 시군구코드 앞 2자리(시도) → 이름. 모르는 코드는 null. */
    private static final Map<String, String> SIDO = new HashMap<String, String>();

    static {
        String[][] t = {{"11", "서울"}, {"26", "부산"}, {"27", "대구"}, {"28", "인천"}, {"29", "광주"},
                {"30", "대전"}, {"31", "울산"}, {"36", "세종"}, {"41", "경기"}, {"42", "강원"},
                {"43", "충북"}, {"44", "충남"}, {"45", "전북"}, {"46", "전남"}, {"47", "경북"},
                {"48", "경남"}, {"50", "제주"}, {"51", "강원"}, {"52", "전북"}};
        for (String[] r : t) {
            SIDO.put(r[0], r[1]);
        }
    }

    private final InstitutionMapper institutions;
    private final WorkflowOverviewMapper overview;
    private final SysUserMapper users;

    public WorkflowOverviewService(InstitutionMapper institutions, WorkflowOverviewMapper overview,
                                   SysUserMapper users) {
        this.institutions = institutions;
        this.overview = overview;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public WorkflowOverviewResponse overview(Actor actor) {
        Map<String, OverviewRun> runs = new HashMap<String, OverviewRun>();
        for (OverviewRun r : overview.selectLatestRuns()) {
            runs.put(r.getInstitutionId(), r);               // RUN_ID 오름차순 → 동률이면 뒤가 이긴다
        }
        Map<String, Integer> counts = new HashMap<String, Integer>();
        for (OverviewPair p : overview.selectBidCounts()) {
            counts.put(p.getInstitutionId(), Integer.valueOf(p.getValue().trim()));
        }
        Map<String, String> latestBid = new HashMap<String, String>();
        for (OverviewPair p : overview.selectLatestBidStatuses()) {
            latestBid.put(p.getInstitutionId(), p.getValue());
        }
        Map<String, List<String>> assignees = new HashMap<String, List<String>>();
        for (OverviewPair p : overview.selectAssignees()) {
            String name = p.getValue() == null ? "" : p.getValue().trim();
            if (name.isEmpty()) {
                continue;
            }
            List<String> l = assignees.get(p.getInstitutionId());
            if (l == null) {
                l = new ArrayList<String>();
                assignees.put(p.getInstitutionId(), l);
            }
            if (!l.contains(name)) {
                l.add(name);
            }
        }

        SysUser me = actor.isKnown() ? users.selectByEmpNo(actor.getEmpNo()) : null;
        String myName = me == null || me.getName() == null ? null : me.getName().trim();

        List<WorkflowOverviewItem> items = new ArrayList<WorkflowOverviewItem>();
        List<String> mine = new ArrayList<String>();
        for (Institution inst : institutions.selectAll()) {              // ORDER BY INSTITUTION_ID
            String id = inst.getInstitutionId();
            OverviewRun run = runs.get(id);
            List<String> who = assignees.containsKey(id) ? assignees.get(id) : Collections.<String>emptyList();

            WorkflowOverviewItem it = new WorkflowOverviewItem();
            it.setInstitutionId(id);
            it.setName(inst.getNameKo());
            it.setRegionCode(inst.getRegionCode());
            it.setRegion(regionName(inst.getRegionCode()));
            it.setStage(inst.getStage());
            it.setStageLabel(inst.getStage() >= 1 && inst.getStage() <= STAGE_LABELS.length
                    ? STAGE_LABELS[inst.getStage() - 1] : null);
            it.setState(run == null ? "NONE" : run.getStatus());
            it.setGate(run != null && OrchRun.PENDING_APPROVAL.equals(run.getStatus())
                    ? run.getPendingGate() : null);
            it.setDone(SUBMITTED.equals(latestBid.get(id)));
            it.setBidCount(counts.containsKey(id) ? counts.get(id).intValue() : 0);
            it.setAssignees(who);
            it.setUpdatedAt(run == null ? null : run.getUpdatedAt());
            items.add(it);

            if (me != null && (who.contains(actor.getEmpNo()) || (myName != null && who.contains(myName)))) {
                mine.add(id);
            }
        }
        return new WorkflowOverviewResponse(items, mine);
    }

    static String regionName(String regionCode) {
        if (regionCode == null || regionCode.length() < 2) {
            return null;
        }
        return SIDO.get(regionCode.substring(0, 2));
    }
}
