package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.CoverageCriterion;
import com.kbstar.kgi.ggreport.web.dto.CoverageMapResponse;
import com.kbstar.kgi.ggreport.web.dto.CoverageTeam;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 배점표 항목 ↔ 팀 작성물 커버리지 병합. Python
 * {@code routers/institutions.get_coverage_map} + {@code upload_check.load_coverage_map}.
 *
 * <p>읽는 파일은 둘 다 {@code {output_root}/{기관명}/} 밑에 있다 —
 * {@code rfp_scoring.json}(3단계 산출물)과 {@code coverage_map.json}(업로드 즉시검사).
 */
@Service
public class CoverageMapService {

    /** {@code coverage_map.json} 의 현재 형식. */
    public static final int COVERAGE_MAP_VERSION = 2;

    private final AppProperties properties;
    private final JsonFiles jsonFiles;

    public CoverageMapService(AppProperties properties, JsonFiles jsonFiles) {
        this.properties = properties;
        this.jsonFiles = jsonFiles;
    }

    public CoverageMapResponse coverageMap(Institution institution) {
        File dir = new File(properties.getOutputRoot(), institution.getNameKo());
        JsonNode scoring = jsonFiles.readOrNull(new File(dir, "rfp_scoring.json"));
        if (scoring == null) {
            // 아직 3단계 전 — 빈 상태가 정상이다. **키는 다 채워 보낸다**(응답 DTO 주석).
            return new CoverageMapResponse();
        }

        Coverage coverage = loadCoverageMap(new File(dir, "coverage_map.json"));

        List<CoverageCriterion> criteria = new ArrayList<>();
        for (JsonNode c : scoring.path("criteria")) {
            Map<String, Object> cov = coverage.items.get(c.path("item").asText(null));
            CoverageCriterion out = new CoverageCriterion();
            out.setCategory(text(c.get("category")));
            out.setItem(text(c.get("item")));
            out.setScore(c.hasNonNull("score") ? Integer.valueOf(c.get("score").asInt()) : null);
            out.setTeam(cov == null ? null : (String) cov.get("team"));
            out.setCovered(cov != null && Boolean.TRUE.equals(cov.get("covered")));
            out.setGapNote(cov == null ? null : (String) cov.get("gapNote"));
            criteria.add(out);
        }

        // 배점표에서 사라진 팀의 stale 값은 싣지 않는다 — 유령 팀이 화면에 뜨는 것을 막는다.
        Set<String> liveTeams = new HashSet<>();
        for (CoverageCriterion c : criteria) {
            if (c.getTeam() != null) {
                liveTeams.add(c.getTeam());
            }
        }
        List<CoverageTeam> teams = new ArrayList<>();
        for (Map.Entry<String, Integer> e : coverage.teams.entrySet()) {   // TreeMap = 이름순
            if (liveTeams.contains(e.getKey())) {
                teams.add(new CoverageTeam(e.getKey(), e.getValue()));
            }
        }

        int totalScore = scoring.path("total_score").asInt(0);
        return new CoverageMapResponse(criteria, totalScore, teams);
    }

    /** {@code items}(항목별 커버리지) + {@code teams}(팀별 PII 건수). */
    static final class Coverage {
        final Map<String, Map<String, Object>> items = new LinkedHashMap<>();
        /** 이름순 — 응답의 {@code teams} 정렬이 여기서 정해진다(원본 {@code sorted()}). */
        final Map<String, Integer> teams = new TreeMap<>();
    }

    /**
     * {@code coverage_map.json} 을 <b>항상 v2 모양</b>으로 돌려준다.
     *
     * <p>v1 은 항목명을 그대로 최상위 키로 쓰고 {@code pii_count} 를 <b>항목마다
     * 복제</b>해 넣었다. PII 는 업로드 본문 1회 스캔 결과(= 팀 단위 사실)라 항목별로
     * 분해할 수 없는데도 그렇게 저장한 탓에 ⓐ화면이 항목 수만큼 부풀려 세거나
     * (3건·12항목 → 36건) ⓑ배점표를 다시 뽑아 어떤 항목이 그 팀 배정에서 빠지면 옛
     * 값이 stale 로 남아 같은 팀 항목끼리 값이 갈렸다.
     *
     * <p>⚠️ <b>옛 파일을 고쳐 쓰지 않고 읽을 때 올려서 본다</b> — 이미 만들어진
     * 산출물이(아카이브에 복사된 것 포함) 그대로 열려야 하기 때문이다.
     * 값이 갈린 v1 파일은 <b>가장 큰 것</b>을 택한다: 개인정보를 놓치는 방향이 더 위험하다.
     */
    Coverage loadCoverageMap(File file) {
        Coverage out = new Coverage();
        JsonNode data = jsonFiles.readOrNull(file);
        if (data == null) {
            return out;
        }
        if (data.path("version").asInt(0) == COVERAGE_MAP_VERSION) {
            for (Iterator<Map.Entry<String, JsonNode>> it = data.path("items").fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                out.items.put(e.getKey(), item(e.getValue()));
            }
            for (Iterator<Map.Entry<String, JsonNode>> it = data.path("teams").fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                out.teams.put(e.getKey(), e.getValue().path("pii_count").asInt(0));
            }
            return out;
        }

        for (Iterator<Map.Entry<String, JsonNode>> it = data.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode row = e.getValue();
            if (!row.isObject()) {
                continue;
            }
            out.items.put(e.getKey(), item(row));
            String team = text(row.get("team"));
            if (team != null) {
                int seen = out.teams.containsKey(team) ? out.teams.get(team) : 0;
                out.teams.put(team, Math.max(seen, row.path("pii_count").asInt(0)));
            }
        }
        return out;
    }

    private static Map<String, Object> item(JsonNode row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("team", text(row.get("team")));
        out.put("covered", row.path("covered").asBoolean(false));
        out.put("gapNote", text(row.get("gap_note")));
        return out;
    }

    /** {@code null} 노드와 JSON {@code null} 을 모두 자바 {@code null} 로 편다. */
    private static String text(JsonNode node) {
        return (node == null || node.isNull()) ? null : node.asText();
    }
}
