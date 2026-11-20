package com.kbstar.kgi.ggreport.web.service;

import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * 같은 (작업, 파일 이름)의 디스크 쓰기·지우기·재검사와 점검 기록을 한 줄로 세운다(NEXT 106, security S13).
 * ⚠️ 한 JVM 안에서만 유효하다 — 서버를 여러 대로 늘리면 다시 본다(요약은 크기·수정시각 대조로 STALE 을 보인다).
 */
final class TaskFileLocks {

    private static final ReentrantLock[] STRIPES = new ReentrantLock[64];

    static {
        for (int i = 0; i < STRIPES.length; i++) {
            STRIPES[i] = new ReentrantLock();
        }
    }

    private TaskFileLocks() {
    }

    static <T> T with(String taskId, String name, Supplier<T> body) {
        ReentrantLock l = STRIPES[(String.valueOf(taskId) + '\u0000' + name).hashCode() & (STRIPES.length - 1)];
        l.lock();
        try {
            return body.get();
        } finally {
            l.unlock();
        }
    }
}
