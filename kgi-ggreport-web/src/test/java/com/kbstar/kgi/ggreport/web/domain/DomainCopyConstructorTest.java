package com.kbstar.kgi.ggreport.web.domain;

import org.junit.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * 복사 생성자가 <b>필드를 하나도 빠뜨리지 않는지</b> 리플렉션으로 본다.
 *
 * <p>원본은 {@code BidCaseDetail(**bid_case.model_dump(), tasks=…)} 라 필드를 빠뜨릴
 * 수가 없었다. 자바에서는 손으로 옮기므로 <b>필드를 추가하고 복사 생성자를 안 고치는</b>
 * 실수가 가능하다. 그때 증상은 고약하다 — 목록 응답({@code BidCase})은 멀쩡한데
 * 상세 응답({@code BidCaseDetail})에서만 그 필드가 비어서, 원인이 Mapper 인지 컨트롤러
 * 인지 한참 헤맨다. 필드를 늘리면 이 테스트가 먼저 실패한다.
 */
public class DomainCopyConstructorTest {

    @Test
    public void BidCaseDetail이_모든_필드를_복사한다() throws Exception {
        BidCase src = fillAll(new BidCase(), BidCase.class);
        BidCaseDetail copy = new BidCaseDetail(src, Collections.<TaskSummary>emptyList());
        assertAllFieldsEqual(BidCase.class, src, copy);
    }

    @Test
    public void ParticipationDecisionOut이_모든_필드를_복사한다() throws Exception {
        BidCase src = fillAll(new BidCase(), BidCase.class);
        ParticipationDecisionOut copy =
                new ParticipationDecisionOut(src, Collections.<TaskSummary>emptyList(), true);
        assertAllFieldsEqual(BidCase.class, src, copy);
        assertTrue(copy.isRunStarted());
    }

    @Test
    public void TaskDetail이_모든_필드를_복사한다() throws Exception {
        Task src = fillAll(new Task(), Task.class);
        TaskDetail copy = new TaskDetail(src, Collections.<Message>emptyList());
        assertAllFieldsEqual(Task.class, src, copy);
    }

    /** 목록은 복사본이 아니라 같은 참조를 쓴다 — 원본 pydantic 도 그렇고, 읽기 전용이다. */
    @Test
    public void 참여결정_목록은_같은_참조다() throws Exception {
        BidCase src = fillAll(new BidCase(), BidCase.class);
        BidCaseDetail copy = new BidCaseDetail(src, null);
        assertSame(src.getParticipationDecision(), copy.getParticipationDecision());
    }

    /** {@code null} 을 넘겨도 목록 필드는 빈 목록이 된다(JSON 에 {@code null} 이 나가면 안 된다). */
    @Test
    public void 목록에_null을_넘겨도_빈_목록이_된다() {
        assertEquals(0, new BidCaseDetail(new BidCase(), null).getTasks().size());
        assertEquals(0, new TaskDetail(new Task(), null).getMessages().size());
    }

    // ── 도우미 ───────────────────────────────────────────────────────────────

    private static <T> T fillAll(T target, Class<?> declaredIn) throws Exception {
        for (Field f : copyableFields(declaredIn)) {
            f.setAccessible(true);
            f.set(target, sentinel(f));
        }
        return target;
    }

    private static void assertAllFieldsEqual(Class<?> declaredIn, Object src, Object copy)
            throws Exception {
        for (Field f : copyableFields(declaredIn)) {
            f.setAccessible(true);
            assertEquals("복사 생성자가 " + declaredIn.getSimpleName() + "." + f.getName()
                            + " 을 빠뜨렸다",
                    f.get(src), f.get(copy));
        }
    }

    private static List<Field> copyableFields(Class<?> type) {
        List<Field> out = new ArrayList<>();
        for (Field f : type.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) {
                continue;
            }
            out.add(f);
        }
        return out;
    }

    /** 기본값과 확실히 다른 값을 넣어야 "복사 안 했는데 우연히 같은" 통과를 막는다. */
    private static Object sentinel(Field f) {
        Class<?> t = f.getType();
        if (t == String.class)  { return "값-" + f.getName(); }
        if (t == int.class || t == Integer.class) { return 42; }
        if (t == boolean.class || t == Boolean.class) { return Boolean.TRUE; }
        if (List.class.isAssignableFrom(t)) { return new ArrayList<>(); }
        throw new IllegalStateException(
                "이 테스트가 모르는 필드 타입이다: " + f.getName() + " : " + t
                        + " — sentinel() 에 규칙을 추가할 것");
    }
}
