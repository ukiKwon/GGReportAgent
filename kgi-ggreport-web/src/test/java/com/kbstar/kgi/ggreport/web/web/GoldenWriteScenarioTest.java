package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.golden.GoldenRunner;
import com.kbstar.kgi.ggreport.web.golden.GoldenSnapshot;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

/**
 * 결재 시나리오 골든을 <b>순서대로</b> 재생한다 — 지금은 {@code 10}~{@code 14}
 * (공고 생성 → 참여결정 3단 → 확정 상세).
 *
 * <p>앞의 조회 골든들과 다른 점 셋:
 * <ol>
 *   <li><b>순서가 곧 상태다.</b> {@code 11} 은 {@code 10} 이 만든 공고를 전제하고,
 *       {@code 13} 은 앞의 두 결재를 전제한다. 그래서 테스트 메서드 하나 안에서
 *       이어 돌린다 — 메서드를 쪼개면 JUnit 이 순서를 보장하지 않아 <b>가끔</b> 깨진다.</li>
 *   <li><b>URL 에 실제 id 를 끼워야 한다.</b> 골든의 URL 은 정규화를 거쳐
 *       {@code /bidcases/bc-<ID>/…} 로 저장돼 있다. {@code 10} 의 응답에서 진짜 id 를
 *       꺼내 바꿔 넣는다({@code Result.rawBody()} 가 그 용도다).</li>
 *   <li><b>{@code @Transactional} 로 롤백한다.</b> 테스트 컨텍스트는 하나뿐이라
 *       ({@code AppTest}) 여기서 만든 공고·작업·쪽지가 남으면 {@code EmptyStateApiTest}
 *       (빈 배열 계약)와 {@code GoldenReadApiTest} 의 {@code 07}(정합성)이 실행 순서에
 *       따라 깨진다. MockMvc 호출이 같은 스레드에서 돌아 서비스의 트랜잭션이 이
 *       트랜잭션에 합류하므로 롤백이 실제로 먹는다.</li>
 * </ol>
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class GoldenWriteScenarioTest {

    @Autowired
    private MockMvc mockMvc;

    private GoldenRunner runner;
    private Path goldenDir;

    @Before
    public void setUp() {
        runner = new GoldenRunner(mockMvc);
        goldenDir = GoldenSnapshot.goldenApiDir();
    }

    @Test
    public void 공고생성부터_참여확정까지_골든_10_14() throws Exception {
        JsonNode created = play("10_bidcase_create", null);
        String bidCaseId = created.path("bid_case_id").asText(null);
        assertNotNull("공고 id 가 안 왔다", bidCaseId);

        // ⚠️ 정규화 정규식(`\b(bc|…)-[0-9a-f]{8}\b`)에 걸리는 모양이어야 골든 비교가
        //    성립한다. 여기서 못 박지 않으면 id 모양이 바뀌었을 때 증상이 "본문 전체가
        //    다르다"로만 나타나 원인을 찾기 어렵다.
        assertEquals("공고 id 모양이 원본(bc-token_hex(4))과 다르다",
                true, bidCaseId.matches("bc-[0-9a-f]{8}"));

        play("11_participation_tier1", bidCaseId);
        play("12_participation_tier2", bidCaseId);

        JsonNode confirmed = play("13_participation_tier3", bidCaseId);
        // 3단 결재가 통과한 그 순간 팀별 작업 3건이 생긴다 — 골든 본문이 이미 이걸
        // 대조하지만, 깨졌을 때 무엇이 틀렸는지 한 줄로 보이게 따로 확인한다.
        assertEquals("참여확정이 아니다", "참여확정",
                confirmed.path("participation_status").asText());
        assertEquals("팀별 작업이 3건이 아니다", 3, confirmed.path("tasks").size());
        assertEquals("작업 정렬이 팀 이름순이 아니다(영업·예산·전산)",
                "영업/예산/전산", teamsOf(confirmed));

        play("14_bidcase_detail_confirmed", bidCaseId);
        참여확정_직후_쪽지가_한_건_남는다();
    }

    /**
     * 참여확정은 분석 자동 시작을 시도하고, <b>못 시작하면 이유를 쪽지로 남긴다</b>
     * (도봉구는 {@code rfp_path} 가 비어 있어 언제나 이 경로다). 조용히 실패하면 아무도
     * 분석이 안 도는 줄 모른 채 기다린다.
     *
     * <p>기대 문구는 <b>골든 {@code 27} 에서 읽어 온다</b> — 여기 문자열을 손으로 적으면
     * 둘이 갈라져도 테스트가 통과해 버린다. 골든 27 자체의 재생은 결재 흐름 전체가
     * 붙은 뒤(3단계)에 한다.
     */
    private void 참여확정_직후_쪽지가_한_건_남는다() throws Exception {
        JsonNode expected = GoldenSnapshot.load(
                goldenDir.resolve("27_notifications_sales.json")).body();

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/notifications").param("recipient", "영업팀"))
                .andReturn().getResponse();
        // ⚠️ 인코딩을 명시하지 않으면 한글이 깨져 비교가 통째로 어긋난다(GoldenRunner 와 같다).
        response.setCharacterEncoding("UTF-8");
        JsonNode actual = new ObjectMapper().readTree(response.getContentAsString());

        assertEquals("쪽지가 1건이 아니다", expected.size(), actual.size());
        assertEquals("쪽지 본문이 골든 27 과 다르다",
                expected.get(0).path("content").asText(),
                actual.get(0).path("content").asText());
    }

    /**
     * 스냅샷 한 건을 재생하고 <b>정규화 전</b> 본문을 돌려준다.
     *
     * @param bidCaseId null 이 아니면 URL 의 {@code bc-<ID>} 를 이 값으로 바꾼다
     */
    private JsonNode play(String name, String bidCaseId) throws Exception {
        GoldenSnapshot snapshot = GoldenSnapshot.load(goldenDir.resolve(name + ".json"));
        if (bidCaseId != null) {
            snapshot = snapshot.withUrl(snapshot.url().replace("bc-<ID>", bidCaseId));
        }
        GoldenRunner.Result result = runner.run(snapshot);
        if (!result.passed()) {
            fail(name + " 이 골든과 다르다:\n" + result.failure());
        }
        return result.rawBody();
    }

    private static String teamsOf(JsonNode body) {
        StringBuilder out = new StringBuilder();
        for (JsonNode task : body.path("tasks")) {
            if (out.length() > 0) {
                out.append('/');
            }
            out.append(task.path("team").asText());
        }
        return out.toString();
    }
}
