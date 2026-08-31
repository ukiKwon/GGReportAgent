package com.kb.uploader.service;

import com.kb.uploader.dto.ParsedFileName;
import org.springframework.stereotype.Service;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

@Service
public class FileParserService {

    private static final Set<String> ALLOWED_EXTENSIONS =
        new HashSet<>(Arrays.asList("pdf", "hwp", "md"));

    public Optional<ParsedFileName> parse(String filename) {
        if (filename == null || filename.isEmpty()) return Optional.empty();

        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx < 0) return Optional.empty();

        String ext = filename.substring(dotIdx + 1).toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(ext)) return Optional.empty();

        String nameWithoutExt = filename.substring(0, dotIdx);
        String[] tokens = nameWithoutExt.split("_", -1);

        if (tokens.length < 3) return Optional.empty();
        if (!tokens[0].matches("\\d{4}")) return Optional.empty();

        String year = tokens[0];
        String institutionName = tokens[1];
        String description = String.join("_",
            Arrays.copyOfRange(tokens, 2, tokens.length));

        return Optional.of(new ParsedFileName(year, institutionName, description, ext));
    }
}
