package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.InstitutionPlanMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PlanCsv;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.regex.Pattern;

/** 사업계획 반입·시드·내려받기 감사(INST_PLAN_ACT, 034). {@link HeadAudit} 와 같은 모양 — 본문·파일 이름·칸 값은 싣지 않는다. */
@Service
public class PlanAudit {

    private static final Pattern SHA = Pattern.compile("[0-9a-f]{64}");
    private final InstitutionPlanMapper mapper;

    public PlanAudit(InstitutionPlanMapper mapper) {
        this.mapper = mapper;
    }

    /** ⚠️ 사번은 자기신고일 수 있다(EMP_VERIFIED 가 사실만 적는다). instId 가 null 이거나 형식 밖이면 'NONE'. */
    @Transactional
    public void record(String instId, Long importId, String action, String outcome, Integer items, String sha, Actor actor,
                       BoardUiIds.Ui ui) {
        String inst = PlanCsv.validId(instId) ? instId : "NONE";
        String emp = actor != null && actor.isKnown() ? actor.getEmpNo() : null;
        mapper.insertAct(inst, importId, action, outcome, items, sha != null && SHA.matcher(sha).matches() ? sha : null,
                emp, actor != null && actor.isVerified() ? 1 : 0, ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, Times.nowIso());
    }
}
