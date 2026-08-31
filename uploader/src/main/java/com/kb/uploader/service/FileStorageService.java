package com.kb.uploader.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
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

    public FileStorageService(@Value("${upload.base-dir}") String baseDir) {
        this.baseDir = baseDir;
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
        file.transferTo(target.toFile());
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
}
