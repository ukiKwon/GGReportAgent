package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 배점 합계 검증 — 단계 5 Task 5.3. Python {@code agent/tests/test_scoring_consistency.py}
 * 의 케이스를 <b>실측값 그대로</b> 옮겼다.
 *
 * <p><b>모델 성능에 기대지 않는 방어다.</b> 2026-08-04 실측(수원시 공고문, 정답 6항목
 * 합 100): {@code llama3.1:8b} → 16항목 합 <b>96</b>, {@code qwen3:14b} → 15항목 합
 * <b>108</b>. 둘 다 분류는 맞췄고 숫자만 지어냈으며 <b>모델을 키워도 같은 양상이
 * 반복됐다</b> — 그래서 규칙으로 잡는다.
 *
 * <p>2026-08-10 실측: {@code qwen3.5:9b} 는 반대로 표를 <b>정확히</b> 읽어 계+대분류+세부를
 * 평면 목록에 담았고(합 300) 옛 규칙이 <b>정확한 추출을 오탐</b>했다. 그래서 레벨
 * 그룹별 합산으로 바뀌었다 — 아래 계층 케이스가 그 구조 그대로다.
 *
 * <p>⚠️ <b>오탐을 내면 안 된다.</b> 경고가 한 번이라도 틀리면 그 다음부터 아무도 읽지
 * 않는다 — 그게 이 규칙이 "어느 한 레벨이라도 맞으면 통과"인 이유다.
 */
public class ScoringConsistencyTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── 실측 재현 ────────────────────────────────────────────────────────

    @Test
    public void llama_실측_합계_96을_잡는다() {
        String msg = ScoringConsistency.check(flat(100,
                0, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8, 8, 8, 8, 9, 9));
        assertNotNull("합 96 ≠ 총점 100 인데 통과시켰다", msg);
        assertTrue(msg, msg.contains("96") && msg.contains("100"));
        // 얼마나 어긋났는지 부호까지 보여준다 — 사람이 표를 다시 볼 때의 단서다.
        assertTrue(msg, msg.contains("-4"));
    }

    /** 총점을 <b>넘긴</b> 경우 — 더 큰 모델이 더 자신 있게 지어낸 결과다. */
    @Test
    public void qwen_실측_합계_108을_잡는다() {
        String msg = ScoringConsistency.check(flat(100,
                1, 2, 3, 5, 5, 6, 7, 7, 7, 8, 8, 8, 8, 8, 25));
        assertNotNull(msg);
        assertTrue(msg, msg.contains("108") && msg.contains("+8"));
    }

    @Test
    public void 정답은_통과한다() {
        assertNull(ScoringConsistency.check(flat(100, 7, 8, 17, 21, 22, 25)));
    }

    // ── 계층 배점표 (2026-08-10 qwen3.5:9b 실측 구조) ─────────────────────

    /** 전체 합 300 이지만 각 레벨이 전부 총점 100 과 일치한다 — 정확한 추출이다. */
    @Test
    public void 계층_합300은_오탐하지_않는다() {
        assertNull(ScoringConsistency.check(leveled(100, qwen35Rows())));
    }

    /** 세부 레벨이 불완전해도(표 일부만 옮김) 대분류가 맞으면 경고하지 않는다. */
    @Test
    public void 한_레벨만_맞아도_통과한다() {
        assertNull(ScoringConsistency.check(
                leveled(100, new int[][]{{2, 50}, {2, 50}, {3, 30}})));
    }

    /**
     * 계 행은 총점의 재진술이라 사실상 항상 맞는 그룹이다 — 하위 레벨이 불완전해도
     * 경고하지 않는다(불완전 ≠ 조작. 조작 방어의 최종선은 5·8단계 사람 승인이다).
     */
    @Test
    public void 계_행이_맞으면_그것만으로_통과한다() {
        assertNull(ScoringConsistency.check(
                leveled(100, new int[][]{{1, 100}, {2, 45}, {2, 45}, {3, 95}})));
    }

    @Test
    public void 모든_레벨이_어긋나면_그룹별_합계를_보여준다() {
        String msg = ScoringConsistency.check(
                leveled(100, new int[][]{{1, 110}, {2, 45}, {2, 45}, {3, 95}}));
        assertNotNull(msg);
        assertTrue(msg, msg.contains("계 합 110점"));
        assertTrue(msg, msg.contains("대분류 합 90점"));
        assertTrue(msg, msg.contains("세부 합 95점"));
    }

    /** 무레벨 행은 '단층' 그룹 — 그 그룹이 총점과 맞으면 통과한다. */
    @Test
    public void 레벨과_무레벨이_섞여도_그룹으로_다룬다() {
        ObjectNode scoring = leveled(100, new int[][]{{2, 30}});
        appendCriterion(scoring, null, 60);
        appendCriterion(scoring, null, 40);
        assertNull(ScoringConsistency.check(scoring));
    }

    // ── 오탐 금지 ────────────────────────────────────────────────────────

    @Test
    public void 배점표가_없으면_아무_말도_안_한다() {
        // 배점표가 없는 공고문은 정당한 결과다 — 여기서 경고하면 그건 오탐이다.
        assertNull(ScoringConsistency.check(flat(100)));
        assertNull("총점을 못 뽑은 경우도 이 규칙이 할 말이 없다",
                ScoringConsistency.check(flat(0, 10, 20)));
        assertNull(ScoringConsistency.check(null));
    }

    @Test
    public void 부호_표기가_Python의_포맷과_같다() {
        // Python 은 `{:+d}` 다 — 음수도 양수도 부호가 붙는다.
        assertEquals("+8", ScoringConsistency.signed(8));
        assertEquals("-4", ScoringConsistency.signed(-4));
        assertEquals("+0", ScoringConsistency.signed(0));
    }

    // ── 픽스처 ───────────────────────────────────────────────────────────

    private static ObjectNode flat(int total, int... scores) {
        ObjectNode scoring = MAPPER.createObjectNode();
        scoring.put("total_score", total);
        ArrayNode criteria = scoring.putArray("criteria");
        for (int i = 0; i < scores.length; i++) {
            ObjectNode c = criteria.addObject();
            c.put("category", "c");
            c.put("item", "i" + i);
            c.put("score", scores[i]);
        }
        return scoring;
    }

    /** {@code rows[i] = {level, score}}. */
    private static ObjectNode leveled(int total, int[][] rows) {
        ObjectNode scoring = MAPPER.createObjectNode();
        scoring.put("total_score", total);
        scoring.putArray("criteria");
        for (int[] row : rows) {
            appendCriterion(scoring, Integer.valueOf(row[0]), row[1]);
        }
        return scoring;
    }

    /** {@code level} 이 null 이면 <b>필드 자체를 뺀다</b>(옛 파일 모양). */
    private static void appendCriterion(ObjectNode scoring, Integer level, int score) {
        ObjectNode c = ((ArrayNode) scoring.get("criteria")).addObject();
        c.put("category", "c");
        c.put("item", "i" + ((ArrayNode) scoring.get("criteria")).size());
        c.put("score", score);
        if (level != null) {
            c.put("level", level.intValue());
        }
    }

    /** 수원시 공고문을 정확히 읽은 결과: 계(100) + 대분류 5개(합 100) + 세부 15개(합 100). */
    private static int[][] qwen35Rows() {
        int[] main = {25, 21, 22, 25, 7};
        int[] detail = {8, 17, 8, 7, 5, 1, 7, 8, 7, 6, 8, 8, 3, 2, 5};
        int[][] rows = new int[1 + main.length + detail.length][2];
        int i = 0;
        rows[i++] = new int[]{1, 100};
        for (int s : main) {
            rows[i++] = new int[]{2, s};
        }
        for (int s : detail) {
            rows[i++] = new int[]{3, s};
        }
        return rows;
    }
}
