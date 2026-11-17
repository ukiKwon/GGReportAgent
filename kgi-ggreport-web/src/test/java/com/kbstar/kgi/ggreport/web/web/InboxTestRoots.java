package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AppProperties;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

/**
 * 반입 계열 시험이 시험마다(실행마다) 고유한 폴더를 쓰게 한다 — 고정 폴더 target/inbox-test 를 여러 시험 클래스·
 * 다른 mvn 실행이 같이 쓰며 서로 지우던 것을 끊는다. AppProperties 싱글턴 값을 바꿨다가 close() 에서 되돌린다.
 * (@TestPropertySource 는 컨텍스트가 둘이 되어 DDL 이 중복되므로 쓰지 않는다.)
 */
final class InboxTestRoots {

    final Path base, inbox, rfp, batches, ext;
    private final AppProperties props;
    private final String oInbox, oRfp, oBatches, oExt;

    private InboxTestRoots(AppProperties props, Path base) throws IOException {
        this.props = props;
        this.base = base;
        this.inbox = Files.createDirectories(base.resolve("inbox"));
        this.rfp = Files.createDirectories(base.resolve("rfp"));
        this.batches = Files.createDirectories(base.resolve("batches"));
        this.ext = Files.createDirectories(base.resolve("ext_check"));
        oInbox = props.getInboxRoot();
        oRfp = props.getRfpRoot();
        oBatches = props.getBatchesRoot();
        oExt = props.getExtCheckRoot();
        props.setInboxRoot(inbox.toString());
        props.setRfpRoot(rfp.toString());
        props.setBatchesRoot(batches.toString());
        props.setExtCheckRoot(ext.toString());
    }

    static InboxTestRoots open(AppProperties props) throws IOException {
        Path parent = Files.createDirectories(Paths.get("target", "inbox-test-run").toAbsolutePath());
        return new InboxTestRoots(props, Files.createTempDirectory(parent, "r-"));
    }

    void close() {
        props.setInboxRoot(oInbox);
        props.setRfpRoot(oRfp);
        props.setBatchesRoot(oBatches);
        props.setExtCheckRoot(oExt);
        deleteQuietly(base);          // 못 지워도 시험은 실패시키지 않는다(고유 폴더라 다음 시험에 영향 없음)
    }

    static void deleteQuietly(Path p) {
        try {
            if (!Files.exists(p)) {
                return;
            }
            Files.walkFileTree(p, new SimpleFileVisitor<Path>() {
                @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) {
                    try { Files.delete(f); } catch (IOException ignore) { }
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult postVisitDirectory(Path d, IOException e) {
                    try { Files.delete(d); } catch (IOException ignore) { }
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignore) { }
    }
}
