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

        결재_3세트를_돈다(confirmed);
        제출이_각_팀장에게_결재요청을_보낸다();
    }

    /**
     * 제출은 <b>알림까지가 한 동작</b>이다 — 예전에는 상태만 바꾸고 아무에게도 알리지
     * 않아 "제출해도 아무 일이 안 일어나는" 상태였다. 골든 {@code 16}·{@code 19}·
     * {@code 22} 의 본문은 작업 한 건이라 이 쪽지를 <b>보지 못한다.</b>
     *
     * <p>수신자 이름이 특히 틀리기 쉬운 자리다: 작업의 팀은 {@code 영업} 인데 쪽지는
     * {@code 영업팀장} 앞으로 가야 한다({@code Teams.leadOf}). {@code 영업} 이나
     * {@code 영업팀} 으로 새면 팀장 결재함이 영원히 비고 아무도 그걸 모른다.
     */
    private void 제출이_각_팀장에게_결재요청을_보낸다() throws Exception {
        for (String lead : new String[]{"영업팀장", "예산팀장", "전산팀장"}) {
            JsonNode inbox = inboxOf(lead);
            assertEquals(lead + " 결재함이 1건이 아니다", 1, inbox.size());
            assertEquals(lead + " 쪽지 종류가 다르다",
                    "결재요청", inbox.get(0).path("kind").asText());
        }
        // 팀원 앞으로는 새지 않았는지 — 참여확정 쪽지 1건 그대로여야 한다.
        assertEquals("영업팀 쪽지가 늘었다(제출 알림이 팀장이 아니라 팀으로 갔다)",
                1, inboxOf("영업팀").size());
    }

    /**
     * 골든 {@code 15}~{@code 23} — 작업 3건을 각각 임시저장 → 제출 → 결재.
     *
     * <p>⚠️ <b>어느 작업이 {@code task0} 인지는 골든 파일 이름이 정한다.</b> URL 은
     * 셋 다 {@code /tasks/task-<ID>/…} 로 똑같이 정규화돼 있어 URL 만으로는 구분되지
     * 않는다. 캡처 당시의 {@code task0}·{@code task1}·{@code task2} 는 골든 {@code 13}
     * 의 {@code tasks} 배열 순서(= 팀 이름순 영업·예산·전산)다. 그래서 그 순서로
     * 짝지어 돈다 — 골든 본문에 {@code team} 이 들어 있어 잘못 짝지으면 바로 드러난다.
     */
    private void 결재_3세트를_돈다(JsonNode confirmed) throws Exception {
        JsonNode taskList = confirmed.path("tasks");
        String[][] steps = {
                {"15_task0_draft_claim", "16_task0_submit", "17_task0_approve"},
                {"18_task1_draft_claim", "19_task1_submit", "20_task1_approve"},
                {"21_task2_draft_claim", "22_task2_submit", "23_task2_approve"},
        };
        for (int i = 0; i < steps.length; i++) {
            String taskId = taskList.get(i).path("task_id").asText();
            assertEquals("작업 id 모양이 원본(task-token_hex(4))과 다르다",
                    true, taskId.matches("task-[0-9a-f]{8}"));
            for (String name : steps[i]) {
                play(name, taskId);
            }
        }
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

        JsonNode actual = inboxOf("영업팀");

        assertEquals("쪽지가 1건이 아니다", expected.size(), actual.size());
        assertEquals("쪽지 본문이 골든 27 과 다르다",
                expected.get(0).path("content").asText(),
                actual.get(0).path("content").asText());
    }

    /**
     * 스냅샷 한 건을 재생하고 <b>정규화 전</b> 본문을 돌려준다.
     *
     * @param id null 이 아니면 URL 의 자리표시자를 이 값으로 바꾼다.
     *           접두사로 무엇을 바꿀지 정한다({@code bc-…} → {@code bc-<ID>},
     *           {@code task-…} → {@code task-<ID>}).
     */
    private JsonNode play(String name, String id) throws Exception {
        GoldenSnapshot snapshot = GoldenSnapshot.load(goldenDir.resolve(name + ".json"));
        if (id != null) {
            String placeholder = id.substring(0, id.indexOf('-') + 1) + "<ID>";
            String url = snapshot.url().replace(placeholder, id);
            if (url.equals(snapshot.url())) {
                fail(name + " 의 URL 에 " + placeholder + " 가 없다: " + snapshot.url()
                        + " — 골든이 바뀌었거나 잘못된 id 를 넘겼다(치환이 조용히"
                        + " 안 되면 그 다음 요청이 404 로 나서 원인이 흐려진다)");
            }
            snapshot = snapshot.withUrl(url);
        }
        GoldenRunner.Result result = runner.run(snapshot);
        if (!result.passed()) {
            fail(name + " 이 골든과 다르다:\n" + result.failure());
        }
        return result.rawBody();
    }

    /** 한 수신자의 쪽지함. */
    private JsonNode inboxOf(String recipient) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/notifications").param("recipient", recipient))
                .andReturn().getResponse();
        // ⚠️ 인코딩을 명시하지 않으면 한글이 깨져 비교가 통째로 어긋난다(GoldenRunner 와 같다).
        response.setCharacterEncoding("UTF-8");
        return new ObjectMapper().readTree(response.getContentAsString());
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
