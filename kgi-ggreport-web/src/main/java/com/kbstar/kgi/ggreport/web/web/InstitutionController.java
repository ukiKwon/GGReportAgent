package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.ArtifactsResponse;
import com.kbstar.kgi.ggreport.web.dto.CoverageMapResponse;
import com.kbstar.kgi.ggreport.web.service.CoverageMapService;
import com.kbstar.kgi.ggreport.web.service.InstitutionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 기관 조회 — 골든 {@code 00}·{@code 01}·{@code 02}·{@code 08}·{@code 09}.
 *
 * <p>⚠️ <b>경로에 후행 슬래시를 두지 않는다.</b> 원본은
 * {@code APIRouter(prefix="/institutions")} + {@code @router.get("")} 라 정확히
 * {@code /institutions} 이고, 화면과 골든이 그 주소로 부른다.
 *
 * <p>쓰기(POST/PUT/import/corpus)는 아직 없다 — 단계 2는 조회만이다.
 */
@RestController
@RequestMapping("/institutions")
public class InstitutionController {

    private final InstitutionService institutions;
    private final CoverageMapService coverageMap;

    public InstitutionController(InstitutionService institutions, CoverageMapService coverageMap) {
        this.institutions = institutions;
        this.coverageMap = coverageMap;
    }

    @GetMapping
    public List<Institution> list() {
        return institutions.list();
    }

    @GetMapping("/{institutionId}")
    public Institution detail(@PathVariable String institutionId) {
        return institutions.require(institutionId);
    }

    @GetMapping("/{institutionId}/artifacts")
    public ArtifactsResponse artifacts(@PathVariable String institutionId) {
        return new ArtifactsResponse(institutions.require(institutionId));
    }

    /** 배점표 항목 ↔ 팀 작성물 커버리지 — 배점표 매핑 뷰의 데이터원. */
    @GetMapping("/{institutionId}/coverage-map")
    public CoverageMapResponse coverageMap(@PathVariable String institutionId) {
        return coverageMap.coverageMap(institutions.require(institutionId));
    }
}
