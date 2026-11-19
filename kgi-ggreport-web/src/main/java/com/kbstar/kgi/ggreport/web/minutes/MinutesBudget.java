package com.kbstar.kgi.ggreport.web.minutes;

/**
 * 파싱·가림 전체의 시간 예산(security R2, 기본 10초). 256번 tick 마다 nanoTime 을 본다.
 * {@link com.kbstar.kgi.ggreport.web.support.Pii#scanExternal(String, long)} 의 마감 시각으로도 같은 값을 넘긴다.
 */
public final class MinutesBudget {
    public static final long DEFAULT_NANOS = 10000000000L;

    private final long deadline;
    private int ticks;

    public MinutesBudget(long budgetNanos) {
        this.deadline = System.nanoTime() + budgetNanos;
    }

    public static MinutesBudget standard() {
        return new MinutesBudget(DEFAULT_NANOS);
    }

    /** 줄·항목 하나를 처리할 때마다 부른다. */
    public void tick(String slot, int line) {
        if ((++ticks & 255) == 0) {
            check(slot, line);
        }
    }

    /** 마감을 넘겼으면 422 PARSE_TIMEOUT. */
    public void check(String slot, int line) {
        if (System.nanoTime() - deadline > 0) {
            throw MinutesException.unprocessable("PARSE_TIMEOUT", slot, line);
        }
    }

    public long deadlineNanos() {
        return deadline;
    }
}
