package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.ConsistencyFinding;
import com.kbstar.kgi.ggreport.web.dto.ConsistencyResponse;
import com.kbstar.kgi.ggreport.web.dto.ConsistencyRow;
import com.kbstar.kgi.ggreport.web.mapper.ConsistencyMapper;
import com.kbstar.kgi.ggreport.web.support.ScoringConsistency;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 정합성 점검 — 9단계 워크플로와 참여 결정이 앞뒤 맞는지 규칙으로 훑는다.
 * Python {@code server/consistency.py} 의 이관본이다.
 *
 * <p><b>LLM 을 쓰지 않는다.</b> 여기서 보는 것은 전부 참/거짓이 분명한 선후 규칙이라
 * (참여확정 → 팀 작업 → 5·6단계) 판단이 필요 없다.
 *
 * <p>{@code POST /run} 의 가드가 <b>앞으로</b> 어긋나는 것을 막는다면, 이 서비스는
 * <b>이미 어긋나 있는</b> 데이터를 찾는다 — 가드가 생기기 전에 만들어진 상태가
 * 남아 있기 때문이다.
 */
@Service
public class ConsistencyService {

    /** 3단계(RFI 공시)부터는 참여 결정이 끝나 있어야 한다 — 1·2단계는 결정 이전이라 정상이다. */
    private static final int ADVANCED_STAGE = 3;

    private final ConsistencyMapper mapper;
    private final AppProperties properties;
    private final JsonFiles jsonFiles;

    public ConsistencyService(ConsistencyMapper mapper, AppProperties properties,
                              JsonFiles jsonFiles) {
        this.mapper = mapper;
        this.properties = properties;
        this.jsonFiles = jsonFiles;
    }

    /** 규칙 하나 — 이름 · 왜 문제인지 · 어긋났을 때의 사유 문구(아니면 null). */
    private interface Rule {
        String name();
        String why();
        String check(ConsistencyRow row, String scoringCheck);
    }

    private final List<Rule> rules = Arrays.<Rule>asList(
            rule("stage_without_bid_case", "단계는 올라갔는데 근거가 될 공고가 없다",
                    (row, scoring) -> {
                        if (row.getStage() >= ADVANCED_STAGE && row.getParticipationStatus() == null) {
                            return row.getNameKo() + ": " + row.getStage()
                                    + "단계까지 진행됐는데 공고(bid_case)가 없습니다"
                                    + " — 반입이 누락됐거나 단계가 잘못 올라갔습니다";
                        }
                        return null;
                    }),
            rule("stage_without_confirmation", "참여 결정 전에 워크플로가 진행됐다",
                    (row, scoring) -> {
                        if (row.getStage() >= ADVANCED_STAGE
                                && "검토중".equals(row.getParticipationStatus())) {
                            return row.getNameKo() + ": " + row.getStage()
                                    + "단계까지 진행됐는데 참여 결정이 '"
                                    + row.getParticipationStatus() + "'입니다 — 참여확정이"
                                    + " 팀 Task를 만들고 그 뒤에 5·6단계가 흐릅니다";
                        }
                        return null;
                    }),
            rule("declined_but_advanced", "참여하지 않기로 했는데 진행됐다",
                    (row, scoring) -> {
                        String status = row.getParticipationStatus();
                        if (row.getStage() >= ADVANCED_STAGE
                                && ("미참여확정".equals(status) || "보류".equals(status))) {
                            return row.getNameKo() + ": 참여 결정이 '" + status + "'인데 "
                                    + row.getStage() + "단계까지 진행됐습니다 — 중단됐어야 합니다";
                        }
                        return null;
                    }),
            // research_status 가 '대기'인 채로 참여확정된 것은 **정상**이다 — 코퍼스가
            // 반입되면 그때 작업을 만든다. '완료'인데도 작업이 없을 때만 만들어졌어야
            // 할 것이 안 만들어진 것이다(오탐을 내면 경고를 아무도 안 읽는다).
            rule("confirmed_without_tasks", "참여확정인데 팀 작업이 만들어지지 않았다",
                    (row, scoring) -> {
                        if ("참여확정".equals(row.getParticipationStatus())
                                && "완료".equals(row.getResearchStatus())
                                && row.getTaskCount() == 0) {
                            return row.getNameKo() + ": 참여확정이고 조사도 완료인데 팀 Task가"
                                    + " 하나도 없습니다 — create_tasks_for_bid_case가 돌지 않았습니다";
                        }
                        return null;
                    }),
            // 배점표의 합계가 총점과 다르다 — LLM 이 개별 배점을 지어낸 신호다.
            // 산출물 파일이 없으면(아직 3단계 전) 아무 말도 하지 않는다 — 오탐 금지.
            rule("scoring_sum_mismatch", "배점표 합계가 총점과 맞지 않는다",
                    (row, scoring) -> scoring == null ? null : row.getNameKo() + ": " + scoring));

    public ConsistencyResponse check(String institutionId) {
        List<ConsistencyFinding> findings = new ArrayList<>();
        for (ConsistencyRow row : mapper.selectRows(institutionId)) {
            String scoringCheck = scoringCheck(row.getNameKo());
            for (Rule rule : rules) {
                String message = rule.check(row, scoringCheck);
                if (message != null) {
                    findings.add(new ConsistencyFinding(row.getInstitutionId(), row.getNameKo(),
                            rule.name(), rule.why(), message));
                }
            }
        }
        return new ConsistencyResponse(findings);
    }

    /**
     * {@code {output_root}/{기관명}/rfp_scoring.json} 을 읽어 배점 합계를 검사한다.
     *
     * <p>파일이 없거나 깨졌으면 null — <b>없는 것은 어긋난 것이 아니다.</b> 3단계
     * 전이면 아직 안 만들어진 게 정상이고, 여기서 경고를 내면 25개 기관이 전부 빨개진다.
     */
    private String scoringCheck(String nameKo) {
        if (nameKo == null || nameKo.isEmpty()) {
            return null;
        }
        JsonNode scoring = jsonFiles.readOrNull(
                new File(new File(properties.getOutputRoot(), nameKo), "rfp_scoring.json"));
        return ScoringConsistency.check(scoring);
    }

    private interface Check {
        String apply(ConsistencyRow row, String scoringCheck);
    }

    private static Rule rule(String name, String why, Check check) {
        return new Rule() {
            @Override public String name() { return name; }
            @Override public String why() { return why; }
            @Override public String check(ConsistencyRow row, String scoringCheck) {
                return check.apply(row, scoringCheck);
            }
        };
    }
}
