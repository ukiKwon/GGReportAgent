package com.kb.uploader.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);
    private static final DateTimeFormatter TS_FMT =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final String baseDir;
    // ── 2026-09-23 파싱 전환: 원본 보관 / 산출물 경로 ──
    private final String userdataDir;
    private final String proposalJsonDir;
    private final String rfpMdDir;

    public FileStorageService(@Value("${upload.base-dir}") String baseDir,
                              @Value("${upload.userdata-dir}") String userdataDir,
                              @Value("${upload.proposal-json-dir}") String proposalJsonDir,
                              @Value("${upload.rfp-md-dir}") String rfpMdDir) {
        this.baseDir = baseDir;
        this.userdataDir = userdataDir;
        this.proposalJsonDir = proposalJsonDir;
        this.rfpMdDir = rfpMdDir;
    }

    public Path saveToUnclassified(MultipartFile file, String filename) throws IOException {
        Path dir = Paths.get(baseDir, "unclassified");
        Files.createDirectories(dir);
        Path target = dir.resolve(filename);
        if (Files.exists(target)) {
            int dot = filename.lastIndexOf('.');
            String ts = LocalDateTime.now().format(TS_FMT);
            filename = (dot >= 0)
                    ? filename.substring(0, dot) + "_" + ts + filename.substring(dot)
                    : filename + "_" + ts;
            target = dir.resolve(filename);
        }
        // transferTo(File)은 내부적으로 Part.write(경로)를 호출하는데, 서블릿 스펙상 그 경로는
        // multipart 임시 위치 기준 상대경로다. WebLogic은 절대경로를 그대로 이어 붙여
        // "<도메인>/.../C:/uploader-local/..." 같은 잘못된 경로를 만든다. 스트림 복사로 우회한다.
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    public Path moveToClassified(Path source, String category,
                                 String year, String institutionName) throws IOException {
        Path dir = Paths.get(baseDir, "classified", category, year, institutionName);
        Files.createDirectories(dir);
        Path target = dir.resolve(source.getFileName());
        Path oldParent = source.getParent();
        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        deleteEmptyParents(oldParent, Paths.get(baseDir, "classified"));
        return target;
    }

    private void deleteEmptyParents(Path dir, Path stopAt) {
        try {
            while (dir != null && dir.startsWith(stopAt) && !dir.equals(stopAt)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
                    if (stream.iterator().hasNext()) return;
                }
                Files.delete(dir);
                dir = dir.getParent();
            }
        } catch (IOException e) {
            log.warn("빈 디렉토리 정리 실패: {}", dir, e);
        }
    }

    public int cleanEmptyClassifiedDirs() {
        Path classifiedBase = Paths.get(baseDir, "classified");
        if (!Files.exists(classifiedBase)) return 0;
        final int[] count = {0};
        try {
            Files.walkFileTree(classifiedBase, new SimpleFileVisitor<Path>() {
                @Override
                public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                    if (dir.equals(classifiedBase)) return FileVisitResult.CONTINUE;
                    try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
                        if (!stream.iterator().hasNext()) {
                            Files.delete(dir);
                            count[0]++;
                        }
                    } catch (IOException e) {
                        log.warn("빈 디렉토리 삭제 실패: {}", dir, e);
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("빈 디렉토리 일괄 정리 실패", e);
        }
        return count[0];
    }

    public Path buildUnclassifiedPath(String filename) {
        return Paths.get(baseDir, "unclassified", filename);
    }

    // ── 2026-09-23 파싱 전환 ──────────────────────────────────────────
    // 원본을 옮기지 않고 userdata 에 보관하고, 파싱 산출물을 따로 쓴다.

    /** 원본 보관. 같은 이름이 있으면 _yyyyMMddHHmmss 를 붙인다. */
    public Path saveOriginal(MultipartFile file, String filename) throws IOException {
        Path dir = Paths.get(userdataDir);
        Files.createDirectories(dir);
        filename = safeFileName(filename);
        Path target = dir.resolve(filename);
        if (Files.exists(target)) {
            int dot = filename.lastIndexOf('.');
            String ts = LocalDateTime.now().format(TS_FMT);
            filename = (dot >= 0)
                    ? filename.substring(0, dot) + "_" + ts + filename.substring(dot)
                    : filename + "_" + ts;
            target = dir.resolve(filename);
        }
        // ⚠️ transferTo(File) 을 쓰지 않는 이유는 saveToUnclassified 주석 참조(WebLogic 경로 문제).
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    /** 산출물(JSON·MD)을 쓴다. 같은 이름이 있으면 _2, _3 … 을 붙인다. */
    public Path writeOutput(Path dir, String filename, byte[] content) throws IOException {
        Files.createDirectories(dir);
        filename = safeFileName(filename);
        Path target = dir.resolve(filename);
        int dot = filename.lastIndexOf('.');
        String base = dot >= 0 ? filename.substring(0, dot) : filename;
        String ext = dot >= 0 ? filename.substring(dot) : "";
        for (int n = 2; Files.exists(target); n++) {
            target = dir.resolve(base + "_" + n + ext);
        }
        Files.write(target, content);
        return target;
    }

    /** 재파싱 때 이전 산출물을 지운다. 없으면 조용히 넘어간다. */
    public void deleteIfExists(String path) throws IOException {
        if (path == null || path.trim().isEmpty()) return;
        Files.deleteIfExists(Paths.get(path));
    }

    /**
     * 파일명에서 경로 구분자를 떼어 낸다.
     * ⚠️ 브라우저에 따라 전체 경로를 보내고, 악의적 요청은 "../" 를 섞는다.
     *    그대로 resolve 하면 저장 디렉터리 밖으로 나간다.
     */
    public static String safeFileName(String name) {
        if (name == null) return "unnamed";
        String only = name.replace('\\', '/');
        int slash = only.lastIndexOf('/');
        if (slash >= 0) only = only.substring(slash + 1);
        only = only.trim();
        return only.isEmpty() ? "unnamed" : only;
    }

    public Path getUserdataDir() { return Paths.get(userdataDir); }
    public Path getProposalJsonDir() { return Paths.get(proposalJsonDir); }
    public Path getRfpMdDir() { return Paths.get(rfpMdDir); }
}
