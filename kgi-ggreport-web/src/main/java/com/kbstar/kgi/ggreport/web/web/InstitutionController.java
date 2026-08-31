package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import com.kbstar.kgi.ggreport.web.dto.ArtifactsResponse;
import com.kbstar.kgi.ggreport.web.dto.CheckpointIn;
import com.kbstar.kgi.ggreport.web.dto.CoverageMapResponse;
import com.kbstar.kgi.ggreport.web.dto.ImportResponse;
import com.kbstar.kgi.ggreport.web.dto.TimelineResponse;
import com.kbstar.kgi.ggreport.web.dto.WorkflowStatusResponse;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.service.CoverageMapService;
import com.kbstar.kgi.ggreport.web.service.InstitutionCommandService;
import com.kbstar.kgi.ggreport.web.service.InstitutionService;
import com.kbstar.kgi.ggreport.web.service.OrchestratorService;
import com.kbstar.kgi.ggreport.web.service.WorkflowStatusService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 기관 조회 — 골든 {@code 00}·{@code 01}·{@code 02}·{@code 08}·{@code 09}.
 *
 * <p>⚠️ <b>경로에 후행 슬래시를 두지 않는다.</b> 원본은
 * {@code APIRouter(prefix="/institutions")} + {@code @router.get("")} 라 정확히
 * {@code /institutions} 이고, 화면과 골든이 그 주소로 부른다.
 *
 * <p>워크플로 탭이 읽는 두 가지({@code /status}·{@code /timeline})도 여기 있다 —
 * 원본은 {@code routers/workflow.py} 에 있지만 URL 접두사가 같아서 한 컨트롤러로 모았다.
 * 나누면 같은 {@code @RequestMapping} 이 둘이 되어 어디에 붙일지가 매번 판단거리가 된다.
 *
 * <p>실행({@code /run})과 게이트 결재({@code /checkpoint})도 여기 있다 — 단계 4.
 * 손으로 넣는 쓰기 둘(POST/PUT)은 Task 5B.5 에서 붙였다.
 * 아직 없는 것은 {@code /import}·{@code /corpus}·{@code /complete} 다.
 */
@RestController
@RequestMapping("/institutions")
public class InstitutionController {

    private final InstitutionService institutions;
    private final InstitutionCommandService institutionCommands;
    private final CoverageMapService coverageMap;
    private final WorkflowStatusService workflow;
    private final OrchestratorService orchestrator;

    public InstitutionController(InstitutionService institutions,
                                 InstitutionCommandService institutionCommands,
                                 CoverageMapService coverageMap,
                                 WorkflowStatusService workflow,
                                 OrchestratorService orchestrator) {
        this.institutions = institutions;
        this.institutionCommands = institutionCommands;
        this.coverageMap = coverageMap;
        this.workflow = workflow;
        this.orchestrator = orchestrator;
    }

    @GetMapping
    public List<Institution> list() {
        return institutions.list();
    }

    /**
     * 기관 추가 — 원본 {@code POST /institutions}. <b>201</b> 이다.
     *
     * <p>같은 이름이면 <b>409</b>({@code 이미 있는 기관명입니다 (…)}) —
     * CSV 반입의 upsert 와 일부러 다르다
     * ({@link InstitutionCommandService#create} 주석).
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Institution create(@RequestBody InstitutionImportRow body) {
        return institutionCommands.create(body);
    }

    /**
     * 기관 편집 — 원본 {@code PUT /institutions/{id}} (부분 갱신).
     *
     * <p>보내지 않은 필드는 보존, {@code null} 로 보낸 필드는 지움.
     * 없는 기관이면 <b>404</b>.
     */
    @PutMapping("/{institutionId}")
    public Institution update(@PathVariable String institutionId,
                              @RequestBody InstitutionUpdateIn body) {
        return institutionCommands.update(institutionId, body);
    }

    /**
     * CSV 반입 — 원본 {@code POST /institutions/import}. {@code multipart} 다.
     *
     * <p>이름으로 찾아 <b>upsert</b> 한다(같은 표를 다시 올리는 것이 정상 경로).
     * 표 전체가 한 트랜잭션이라 <b>한 행이 깨지면 아무것도 들어가지 않는다.</b>
     * 형식 오류는 <b>400</b> 이고 사유에 행 번호가 들어 있다.
     */
    @PostMapping("/import")
    public ImportResponse importCsv(@RequestParam("file") MultipartFile file) throws IOException {
        List<String> ids;
        try {
            ids = institutionCommands.importCsv(file.getBytes());
        } catch (InstitutionCsv.CsvFormatException exc) {
            throw ApiException.badRequest(exc.getMessage());
        }
        return new ImportResponse(ids);
    }

    @GetMapping("/{institutionId}")
    public Institution detail(@PathVariable String institutionId) {
        return institutions.require(institutionId);
    }

    @GetMapping("/{institutionId}/artifacts")
    public ArtifactsResponse artifacts(@PathVariable String institutionId) {
        return new ArtifactsResponse(institutions.require(institutionId));
    }

    /**
     * 워크플로 탭 폴링 — 골든 {@code 30}. 단계·작업 상태·안 읽은 쪽지 수.
     *
     * <p>⚠️ {@code running}·{@code pending_gate}·{@code failed} 는 아직 고정값이다
     * (오케스트레이터 이관 전 — {@link WorkflowStatusService} 주석).
     */
    @GetMapping("/{institutionId}/status")
    public WorkflowStatusResponse status(@PathVariable String institutionId) {
        return workflow.status(institutionId);
    }

    /** 단계별 수행 내용 — 메시지와 쪽지를 한 줄기로. 골든 {@code 29}. */
    @GetMapping("/{institutionId}/timeline")
    public TimelineResponse timeline(@PathVariable String institutionId) {
        return workflow.timeline(institutionId);
    }

    /**
     * 오케스트레이터 실행 시작 — 원본 {@code POST /institutions/{id}/run}.
     *
     * <p><b>202 다.</b> 실행은 게이트까지 가서 멈추고, 진행 상황은 {@code /status} 를
     * 폴링해 본다.
     */
    @PostMapping("/{institutionId}/run")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> run(@PathVariable String institutionId) {
        orchestrator.start(institutions.require(institutionId));
        return Collections.singletonMap("status", "started");
    }

    /**
     * 게이트 결재 — 원본 {@code POST /institutions/{id}/checkpoint}.
     *
     * <p>기다리는 게이트가 없으면 <b>409</b>({@code no pending gate}), 아직 도는 중이면
     * <b>409</b>({@code graph still running}).
     */
    @PostMapping("/{institutionId}/checkpoint")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> checkpoint(@PathVariable String institutionId,
                                          @RequestBody CheckpointIn body,
                                          @RequestHeader("X-User-Id") String userId) {
        String by = body.getBy() == null || body.getBy().trim().isEmpty()
                ? userId : body.getBy().trim();
        orchestrator.resume(institutionId, body.isApproved(), by, body.getComment());
        return Collections.singletonMap("status", "resumed");
    }

    /** 배점표 항목 ↔ 팀 작성물 커버리지 — 배점표 매핑 뷰의 데이터원. */
    @GetMapping("/{institutionId}/coverage-map")
    public CoverageMapResponse coverageMap(@PathVariable String institutionId) {
        return coverageMap.coverageMap(institutions.require(institutionId));
    }
}
