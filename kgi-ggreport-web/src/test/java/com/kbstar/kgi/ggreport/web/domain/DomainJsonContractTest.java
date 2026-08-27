package com.kbstar.kgi.ggreport.web.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.golden.GoldenSnapshot;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * POJO 를 직렬화한 <b>키 집합</b>이 골든 JSON 의 키 집합과 같은지 본다.
 *
 * <p>이 테스트가 막는 것은 단계 2의 가장 값싼 실패다 — 필드 하나를 빠뜨리거나
 * 이름을 camelCase 로 내보내면 <b>골든 34건이 통째로 실패</b>하는데, 그때 나오는
 * 차이 목록은 길어서 원인이 묻힌다. 여기서는 DB 도 컨트롤러도 없이 그 계약만 본다.
 *
 * <p>값은 보지 않는다(골든의 값은 시나리오가 만든 것이라 빈 POJO 와 다르다).
 * <b>키와 명명 규칙만</b>이 여기의 관심사다.
 *
 * <p>⚠️ 스프링 컨텍스트의 {@link ObjectMapper} 를 쓴다 — 직접 {@code new ObjectMapper()}
 * 를 만들면 {@code JacksonConfig} 가 실제로 걸렸는지를 못 본다. 그러면 설정이 빠져도
 * 이 테스트만 통과하는 잘못된 안심이 생긴다.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class DomainJsonContractTest {

    @Autowired
    private ObjectMapper mapper;

    // ── 명명 규칙 자체 ────────────────────────────────────────────────────────

    @Test
    public void 키는_snake_case다() throws Exception {
        JsonNode json = serialize(new Institution());
        assertTrue("institution_id 가 없다 — SNAKE_CASE 설정이 안 걸렸다",
                json.has("institution_id"));
        assertTrue("institutionId 가 그대로 나갔다 — SNAKE_CASE 설정이 안 걸렸다",
                !json.has("institutionId"));
    }

    @Test
    public void null_필드도_키로_남는다() throws Exception {
        JsonNode json = serialize(new Institution());
        assertTrue("region_code 키가 사라졌다 — null 을 빼는 설정이 켜져 있다",
                json.has("region_code"));
        assertTrue(json.get("region_code").isNull());
    }

    // ── 타입별 키 계약 ────────────────────────────────────────────────────────

    @Test
    public void Institution_키가_골든과_같다() throws Exception {
        assertKeysMatch(new Institution(), "01_institution_detail", "");
        assertKeysMatch(new Institution(), "00_institutions_list", "[0]");
    }

    @Test
    public void BidCase_키가_골든과_같다() throws Exception {
        assertKeysMatch(new BidCase(), "10_bidcase_create", "");
        assertKeysMatch(new BidCase(), "25_bidcases_assignee_view", "[0]");
    }

    @Test
    public void BidCaseDetail_키가_골든과_같다() throws Exception {
        assertKeysMatch(new BidCaseDetail(), "14_bidcase_detail_confirmed", "");
    }

    @Test
    public void ParticipationDecisionOut_키가_골든과_같다() throws Exception {
        assertKeysMatch(new ParticipationDecisionOut(), "11_participation_tier1", "");
    }

    @Test
    public void ParticipationDecisionEntry_키가_골든과_같다() throws Exception {
        assertKeysMatch(new ParticipationDecisionEntry(),
                "11_participation_tier1", "participation_decision[0]");
    }

    /**
     * ⚠️ {@code final_approver} 는 <b>키로는 있고 값은 언제나 null</b> 이다
     * (원본 SELECT 에 컬럼이 없다). 키까지 없애면 골든이 깨진다.
     */
    @Test
    public void TaskSummary_키가_골든과_같다() throws Exception {
        assertKeysMatch(new TaskSummary(), "14_bidcase_detail_confirmed", "tasks[0]");
    }

    @Test
    public void Task_키가_골든과_같다() throws Exception {
        assertKeysMatch(new Task(), "15_task0_draft_claim", "");
    }

    @Test
    public void Notification_키가_골든과_같다() throws Exception {
        assertKeysMatch(new Notification(), "27_notifications_sales", "[0]");
    }

    /** 빈 목록은 {@code null} 이 아니라 {@code []} 로 나간다(골든 {@code 10}·{@code 14}). */
    @Test
    public void 빈_목록은_null이_아니다() throws Exception {
        assertTrue(serialize(new BidCase()).get("participation_decision").isArray());
        assertTrue(serialize(new BidCaseDetail()).get("tasks").isArray());
        assertTrue(serialize(new TaskDetail()).get("messages").isArray());
    }

    /** 아직 아무것도 안 쓴 작업의 {@code draft_content} 는 {@code ""} 다({@code null} 이 아니다). */
    @Test
    public void 작성물이_없으면_빈_문자열이다() throws Exception {
        Task task = new Task();
        task.setDraftContent(null);          // Oracle 에서 CLOB 이 NULL 로 오는 상황
        assertEquals("", serialize(task).get("draft_content").asText());
    }

    // ── 도우미 ───────────────────────────────────────────────────────────────

    private JsonNode serialize(Object value) throws Exception {
        return mapper.readTree(mapper.writeValueAsString(value));
    }

    /**
     * @param pointer 골든 본문 안에서 비교할 위치. {@code ""}(본문 자체),
     *                {@code "[0]"}(배열 첫 원소), {@code "tasks[0]"} 형태를 받는다.
     */
    private void assertKeysMatch(Object pojo, String goldenName, String pointer) throws Exception {
        JsonNode expected = at(goldenBody(goldenName), pointer);
        if (!expected.isObject()) {
            fail(goldenName + " 의 " + pointer + " 가 객체가 아니다 — 골든이 바뀌었는지 확인할 것");
        }
        assertEquals(goldenName + (pointer.isEmpty() ? "" : " / " + pointer)
                        + " 의 키가 " + pojo.getClass().getSimpleName() + " 와 다르다",
                fieldNames(expected), fieldNames(serialize(pojo)));
    }

    private static JsonNode goldenBody(String name) {
        Path file = GoldenSnapshot.goldenApiDir().resolve(name + ".json");
        return GoldenSnapshot.load(file).body();
    }

    /** {@code a[0].b} 대신 {@code "a[0]"}·{@code ""} 정도만 받는 최소 구현. */
    private static JsonNode at(JsonNode root, String pointer) {
        JsonNode cur = root;
        for (String seg : split(pointer)) {
            cur = seg.startsWith("[")
                    ? cur.path(Integer.parseInt(seg.substring(1, seg.length() - 1)))
                    : cur.path(seg);
        }
        return cur;
    }

    private static List<String> split(String pointer) {
        List<String> out = new ArrayList<>();
        StringBuilder buf = new StringBuilder();
        for (int i = 0; i < pointer.length(); i++) {
            char c = pointer.charAt(i);
            if (c == '[') {
                if (buf.length() > 0) { out.add(buf.toString()); buf.setLength(0); }
                int end = pointer.indexOf(']', i);
                out.add(pointer.substring(i, end + 1));
                i = end;
            } else if (c == '.') {
                if (buf.length() > 0) { out.add(buf.toString()); buf.setLength(0); }
            } else {
                buf.append(c);
            }
        }
        if (buf.length() > 0) { out.add(buf.toString()); }
        return out;
    }

    private static Set<String> fieldNames(JsonNode node) {
        Set<String> out = new LinkedHashSet<>();
        for (Iterator<String> it = node.fieldNames(); it.hasNext(); ) {
            out.add(it.next());
        }
        return out;
    }
}
