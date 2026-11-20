package com.kbstar.kgi.ggreport.web.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.concurrent.Callable;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 작업함 파일 추출의 문지기(NEXT 106, security S2·S3·S4). 업로드·재검사·문맥 보기가 <b>같은 자리</b>(기본 2)를 나눠 쓴다.
 * 자리가 없으면 기다리지 않고 NOT_CHECKED/BUSY. 파일 읽기(loader)는 자리를 잡은 <b>뒤에</b> 한다.
 * PDF 는 별도 스레드(대기열 없음 — 넘치면 BUSY)에서 돌고, 시간이 지나도 PDFBox 가 멈추지 않을 수 있어 자리는 그 스레드가 실제로 끝날 때 반납한다.
 */
@Component
public class DocCheckRunner {

    static final long SECONDS = 20;

    private final Semaphore permits;
    private final ThreadPoolExecutor pdfPool;

    public DocCheckRunner(@Value("${ggreport.task-files.doc-check.max-concurrent:2}") int maxConcurrent) {
        int n = Math.max(1, Math.min(4, maxConcurrent));
        this.permits = new Semaphore(n);
        // 최대 n+1: 자리(permits)가 상한을 지킨다. 끝난 스레드가 자리를 반납한 직후 아직 풀로 돌아가지 못한 틈에 새 요청이 와도 거부(BUSY)되지 않게 여유 1.
        this.pdfPool = new ThreadPoolExecutor(n, n + 1, 60L, TimeUnit.SECONDS, new SynchronousQueue<Runnable>(), r -> {
            Thread t = new Thread(r, "task-doc-pdf");
            t.setDaemon(true);
            return t;
        }, new ThreadPoolExecutor.AbortPolicy());
        this.pdfPool.allowCoreThreadTimeOut(true);
    }

    /** 절대 던지지 않는다. loader 는 파싱 형식(pptx·pdf)일 때만, 자리를 잡은 뒤 한 번 부른다. */
    TaskDocExtractor.Extracted run(final String ext, Callable<byte[]> loader) {
        if (!TaskDocExtractor.parses(ext)) {
            return TaskDocExtractor.extract(ext, null, 0L);
        }
        if (!permits.tryAcquire()) {
            return TaskDocExtractor.Extracted.none(TaskDocExtractor.R_BUSY);
        }
        boolean handedOff = false;
        try {
            final byte[] data;
            try {
                data = loader.call();
            } catch (Exception e) {
                return TaskDocExtractor.Extracted.none("BROKEN");
            }
            final long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(SECONDS);
            if (!"pdf".equals(ext)) {
                return TaskDocExtractor.extract(ext, data, deadline);   // pptx — 요청 스레드, 마감으로 끊는다
            }
            final FutureTask<TaskDocExtractor.Extracted> task =
                    new FutureTask<TaskDocExtractor.Extracted>(() -> TaskDocExtractor.extract(ext, data, deadline));
            try {
                pdfPool.execute(() -> {
                    try {
                        task.run();          // 취소된 FutureTask 도 여기까지는 온다 — 자리 반납이 새지 않는다
                    } finally {
                        permits.release();
                    }
                });
                handedOff = true;
            } catch (RejectedExecutionException full) {
                return TaskDocExtractor.Extracted.none(TaskDocExtractor.R_BUSY);
            }
            try {
                return task.get(SECONDS + 1, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                task.cancel(true);
                return TaskDocExtractor.Extracted.none("TIMEOUT");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                task.cancel(true);
                return TaskDocExtractor.Extracted.none("TIMEOUT");
            } catch (ExecutionException | CancellationException e) {
                return TaskDocExtractor.Extracted.error();
            }
        } finally {
            if (!handedOff) {
                permits.release();
            }
        }
    }

    /** 시험용. */
    int available() {
        return permits.availablePermits();
    }

    @PreDestroy
    void shutdown() {
        pdfPool.shutdownNow();
    }
}
