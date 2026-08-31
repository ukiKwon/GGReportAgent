package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.Task;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.PptxBuilder;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 7단계 취합 — 3팀 초안을 제안서 PPTX 한 벌로 묶는다.
 * Python {@code server/assembler.assemble_deliverable} (단계 5 Task 5.2).
 *
 * <p>최종 확정({@code POST /bidcases/{id}/finalize})이 부른다. 만든 파일 경로를
 * {@code INSTITUTIONS.PPTX_PATH} 에 적어 두면 산출물 화면이 그걸 연다.
 */
@Service
public class DeliverableAssembler {

    /**
     * 슬라이드에 싣는 팀 순서.
     *
     * <p>⚠️ <b>원본의 결함을 그대로 옮기지 않았다.</b> 원본은
     * {@code TEAM_ORDER = ["영업", "IT", "예산"]} 인데 실제 팀 이름은
     * {@code 영업·전산·예산} 이다({@code role_router.ROLES}). {@code "IT"} 는 옛 이름의
     * 잔해이고 — {@code server/db.py} 에 {@code UPDATE tasks SET team='전산' WHERE
     * team='IT'} 마이그레이션까지 있다 — 그래서 <b>전산팀 초안이 제안서에서 통째로
     * 빠진다.</b> 오류도 경고도 없이 슬라이드 한 장이 없어질 뿐이라 아무도 모른다
     * (원본 테스트 {@code test_assembler.py} 도 {@code "IT"} 로 넣어 못 잡았다).
     *
     * <p>{@link Teams#AUTHORING_TEAMS} 를 쓴다 — 팀 이름의 정본은 한 곳이어야 한다는
     * 것이 {@code server/teams.py} 를 만든 이유이기도 하다.
     */
    private static final List<String> TEAM_ORDER = Teams.AUTHORING_TEAMS;

    private final AppProperties properties;
    private final InstitutionMapper institutions;
    private final TaskMapper tasks;

    public DeliverableAssembler(AppProperties properties, InstitutionMapper institutions,
                                TaskMapper tasks) {
        this.properties = properties;
        this.tasks = tasks;
        this.institutions = institutions;
    }

    /**
     * 취합하고 {@code PPTX_PATH} 를 기록한 뒤 그 경로를 돌려준다.
     *
     * <p>⚠️ <b>배점표는 싣지 않는다</b>(빈 목록 → "(배점표 없음)" 한 줄). 원본이
     * {@code build_pptx(sections, [], …)} 로 부르기 때문이다 — 배점표가 실리는 것은
     * 오케스트레이터 쪽 경로({@code pptx_builder_node})다.
     *
     * <p>⚠️ 저장 위치가 <b>기관 id</b> 폴더다({@code {output_root}/{institution_id}/}).
     * 작업 파일·산출물은 전부 <b>기관명</b> 폴더({@code {output_root}/{name_ko}/})를
     * 쓰는데 여기만 다르다 — 원본이 그렇고, 이 경로는 DB 에 적혀 그대로 열리는 값이라
     * 조용히 바꾸지 않았다.
     */
    public String assemble(String bidCaseId, String institutionId) throws IOException {
        Institution institution = institutions.selectById(institutionId);
        if (institution == null) {
            throw new IllegalStateException("bid case not found: " + bidCaseId);
        }

        Map<String, String> drafts = draftsByTeam(bidCaseId);
        List<PptxBuilder.Section> sections = new ArrayList<PptxBuilder.Section>();
        for (String team : TEAM_ORDER) {
            if (drafts.containsKey(team)) {
                sections.add(new PptxBuilder.Section(
                        team + " 파트", drafts.get(team), Collections.<String>emptyList()));
            }
        }

        File output = new File(new File(properties.getOutputRoot(), institutionId),
                institutionId + "_제안서.pptx");
        String path = PptxBuilder.build(sections, Collections.<PptxBuilder.Criterion>emptyList(),
                output, institution.getNameKo());

        institutions.updatePptxPath(institutionId, path);
        return path;
    }

    private Map<String, String> draftsByTeam(String bidCaseId) {
        Map<String, String> drafts = new LinkedHashMap<String, String>();
        for (String team : tasks.selectTeams(bidCaseId)) {
            drafts.put(team, null);
        }
        // selectTeams 는 팀 이름만 준다 — 본문은 작업별로 읽는다. 작업 수가 3건이라
        // 한 번에 읽는 전용 SELECT 를 새로 만들 이유가 없다.
        for (com.kbstar.kgi.ggreport.web.domain.TaskSummary summary
                : tasks.selectSummaries(bidCaseId)) {
            Task task = tasks.selectById(summary.getTaskId());
            if (task != null) {
                // Task 세터가 null → "" 로 정규화한다(Oracle 이 ''를 NULL 로 바꾸므로).
                drafts.put(task.getTeam(), task.getDraftContent());
            }
        }
        return drafts;
    }
}
