package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.OrchMapper;
import com.kbstar.kgi.ggreport.web.orchestrator.OrchRun;
import com.kbstar.kgi.ggreport.web.orchestrator.OrchestratorEngine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 오케스트레이터 실행의 <b>바깥 경계</b> — Python {@code server/orchestrator_service.py}.
 * 컨트롤러와 조회 서비스는 이 클래스만 본다.
 *
 * <p>원본의 {@code _running}·{@code _failed} 딕셔너리 자리는 전부 {@code ORCH_RUN}
 * 조회로 바뀌었다. 프로세스가 죽었다 떠도 상태가 남는다.
 */
@Service
public class OrchestratorService {

    private final OrchMapper orch;
    private final OrchestratorEngine engine;
    private final BidCaseMapper bidCases;
    private final AppProperties properties;

    public OrchestratorService(OrchMapper orch, OrchestratorEngine engine,
                               BidCaseMapper bidCases, AppProperties properties) {
        this.orch = orch;
        this.engine = engine;
        this.bidCases = bidCases;
        this.properties = properties;
    }

    /**
     * 그래프 시작 입력 — 원본 {@code build_run_input}.
     *
     * <p>⚠️ <b>{@code archiveRoot} 를 반드시 실는다.</b> 원본은 한때 여기에
     * {@code "report_archive"} 를 박아 뒀는데 실제 뿌리는 {@code data/report_archive} 라,
     * 이전 회차 제안서를 찾는 노드가 <b>늘 빈 폴더를 봤다.</b> 예외가 안 나서
     * "이전 제안서 없음"과 구별되지 않던 종류의 조용한 오작동이다.
     */
    public Map<String, Object> buildRunInput(Institution institution) {
        Map<String, Object> input = new LinkedHashMap<String, Object>();
        input.put("institution_id", institution.getInstitutionId());
        input.put("institution_name", institution.getNameKo());
        input.put("giganlist_dir", "corpus/institutions");
        input.put("report_new_dir", properties.getOutputRoot());
        // 반입 안 됐으면 null 유지 — rfi 노드가 산출물 존재로 판단한다.
        input.put("rfp_path", institution.getRfpPath());
        input.put("stage", institution.getStage());
        input.put("sections", new java.util.ArrayList<Object>());
        input.put("archive_dir", properties.getArchiveRoot());
        return input;
    }

    /**
     * 엔진의 예외를 HTTP 로 옮긴다 — 엔진은 프레임워크를 모른 채 두려고 여기서 감싼다.
     * 원본도 같은 자리에서 {@code RuntimeError} → 409 로 바꿨다.
     */
    @Transactional
    public OrchRun start(Institution institution) {
        try {
            return engine.start(institution.getInstitutionId(),
                    latestBidCaseId(institution.getInstitutionId()),
                    buildRunInput(institution));
        } catch (IllegalStateException alreadyRunning) {
            throw new ApiException(409, "already running");
        }
    }

    @Transactional
    public OrchRun resume(String institutionId, boolean approved, String by, String comment) {
        try {
            return engine.resume(institutionId, approved, by, comment);
        } catch (NoSuchElementException noGate) {
            throw new ApiException(409, "no pending gate");
        } catch (IllegalStateException stillRunning) {
            throw new ApiException(409, "graph still running");
        }
    }

    /** 도는 중인가. 게이트에서 <b>기다리는 중은 아니다</b>(그건 사람 차례다). */
    public boolean isRunning(String institutionId) {
        OrchRun run = orch.selectActiveRun(institutionId);
        return run != null && OrchRun.RUNNING.equals(run.getStatus());
    }

    /** 기다리는 게이트 이름. 없으면 null. */
    public String pendingGate(String institutionId) {
        OrchRun run = orch.selectActiveRun(institutionId);
        return run == null ? null : run.getPendingGate();
    }

    /**
     * <b>직전</b> 실행이 예외로 끝났는가. 새로 시작하면 새 RUN 이 마지막이 되므로
     * 자연히 지워진다(원본의 {@code _failed.discard} 자리).
     */
    public boolean hasFailed(String institutionId) {
        OrchRun latest = orch.selectLatestRun(institutionId);
        return latest != null && OrchRun.FAILED.equals(latest.getStatus());
    }

    /**
     * 실행을 시작할 수 있는 기관의 최신 공고. 없으면 null —
     * 원본은 {@code adhoc-…} 문자열을 만들었지만 여기서는 {@code BID_CASE_ID} 가
     * 외래키라 <b>없는 값을 지어낼 수 없다</b>(넣으면 INSERT 가 죽는다).
     */
    private String latestBidCaseId(String institutionId) {
        for (BidCase bidCase : latestPerInstitution()) {
            if (institutionId.equals(bidCase.getInstitutionId())) {
                return bidCase.getBidCaseId();
            }
        }
        return null;
    }

    private List<BidCase> latestPerInstitution() {
        return bidCases.selectLatestPerInstitution();
    }
}
