package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.dto.ValidationReport;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 기관 코퍼스({@code corpus/institutions/{기관}/})가 institution-corpus-format 규격을
 * 지키는지 검사한다 — Python {@code server/corpus_validator.py}.
 *
 * <p>규칙 번호(1~12)는 <b>응답에 그대로 실린다</b>. 사람이 규격 문서와 대조하는 키라서
 * 재배치하거나 다시 매기지 말 것 — 번호가 곧 계약이다.
 *
 * <p>오류/경고의 구분도 계약이다. <b>오류만 등록을 막고</b>(422), 경고는 사람이 판단할
 * 여지가 있어 보여만 준다. 경고를 오류로 올리면 정상 코퍼스가 등록되지 않는다.
 */
public final class CorpusValidator {

    static final int SPEC_MIN_FILES = 8;
    static final int SPEC_MAX_FILES = 10;
    static final String[] PLAN_PREFIXES = {"00", "01", "02", "03", "04", "05"};
    private static final Pattern NUMBERED_NAME = Pattern.compile("^(\\d{2})_");

    static final String[] IDEA_BLOCKS = {"연계 구청사업/근거", "구체적 상품/협력 형태", "은행 기대효과"};
    private static final Pattern SPEC_CITATION = Pattern.compile("spec/(\\d{2})");
    private static final Pattern PLAN_CITATION = Pattern.compile("plan\\s+([A-Z]{2}-\\d+)");

    /** ⚠️ 제안 주체(KB/국민은행)는 <b>일부러 빠져 있다</b> — 자기 이름은 위반이 아니다. */
    private static final String[] BANNED_BANK_NAMES = {
            "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
            "SC제일은행", "카카오뱅크", "토스뱅크", "케이뱅크",
    };
    private static final Pattern SELF_CHECK = Pattern.compile("총\\s*\\d+\\s*건|합계");
    private static final String[] CROSS_CHECK_LABELS = {"확인됨", "부분확인", "확인안됨"};
    private static final Pattern SCORE_PAIR = Pattern.compile("(\\d+)\\s*/\\s*(\\d+)");

    private CorpusValidator() {
    }

    public static ValidationReport validate(Path root) {
        ValidationReport report = new ValidationReport();
        if (!Files.isDirectory(root)) {
            report.error(1, null, "디렉터리가 아닙니다: " + root);
            return report;
        }
        List<String> specNumbers = checkSpecStructure(root, report);
        checkPlanStructure(root, report);
        checkBankIdeasPresence(root, report);
        checkEncoding(root, report);
        checkCitations(root, specNumbers, report);
        checkBankIdeasContent(root, report);
        checkSoftRules(root, report);
        return report;
    }

    // ── 규칙 1·2·5 ────────────────────────────────────────────────────

    /** @return spec 파일 번호 목록(내용 규칙에서 재사용한다). */
    private static List<String> checkSpecStructure(Path root, ValidationReport report) {
        Path specDir = root.resolve("spec");
        if (!Files.isDirectory(specDir)) {
            report.error(1, "spec", "spec 디렉터리가 없습니다");
            return Collections.emptyList();
        }

        List<String> files = txtNames(specDir);
        if (files.size() < SPEC_MIN_FILES || files.size() > SPEC_MAX_FILES) {
            report.error(1, "spec", "spec .txt 파일이 " + files.size() + "개입니다 ("
                    + SPEC_MIN_FILES + "~" + SPEC_MAX_FILES + "개여야 합니다)");
        }

        List<String> numbers = new ArrayList<>();
        for (String name : files) {
            Matcher m = NUMBERED_NAME.matcher(name);
            if (!m.find()) {
                report.error(1, "spec/" + name, "파일명이 'NN_' 접두사로 시작하지 않습니다");
                continue;
            }
            numbers.add(m.group(1));
        }

        Set<String> duplicates = new TreeSet<>();
        for (String n : numbers) {
            if (Collections.frequency(numbers, n) > 1) {
                duplicates.add(n);
            }
        }
        for (String dup : duplicates) {
            report.error(1, "spec", "번호 " + dup + "가 중복됩니다");
        }

        if (!numbers.isEmpty() && !numbers.contains("00")) {
            report.error(1, "spec", "00번 파일이 없습니다");
        }

        // 규칙 2 — 번호 구멍은 경고다(중간에 빠진 것이 의도일 수 있다).
        TreeSet<Integer> ints = new TreeSet<>();
        for (String n : numbers) {
            ints.add(Integer.parseInt(n));
        }
        if (!ints.isEmpty()) {
            List<String> missing = new ArrayList<>();
            for (int n = ints.first(); n <= ints.last(); n++) {
                if (!ints.contains(n)) {
                    missing.add(String.format("%02d", n));
                }
            }
            if (!missing.isEmpty()) {
                report.warn(2, "spec", "번호가 비어 있습니다: " + String.join(", ", missing));
            }
        }

        // 규칙 5 — 두 종류는 정확히 1개씩이어야 한다.
        String[][] required = {
                {"홈페이지검색확인결과", "홈페이지 확인"},
                {"민원게시판", "민원게시판"},
        };
        for (String[] pair : required) {
            int hits = 0;
            for (String name : files) {
                if (name.contains(pair[0])) {
                    hits++;
                }
            }
            if (hits != 1) {
                report.error(5, "spec", pair[1] + " 파일이 " + hits + "개입니다 (정확히 1개여야 합니다)");
            }
        }
        return numbers;
    }

    // ── 규칙 3 ────────────────────────────────────────────────────────

    private static void checkPlanStructure(Path root, ValidationReport report) {
        Path planDir = root.resolve("plan");
        if (!Files.isDirectory(planDir)) {
            report.error(3, "plan", "plan 디렉터리가 없습니다");
            return;
        }
        List<String> files = txtNames(planDir);
        if (files.size() != PLAN_PREFIXES.length) {
            report.error(3, "plan", "plan .txt 파일이 " + files.size() + "개입니다 (정확히 6개)");
        }

        List<String> prefixes = new ArrayList<>();
        for (String name : files) {
            Matcher m = NUMBERED_NAME.matcher(name);
            if (m.find()) {
                prefixes.add(m.group(1));
            }
        }
        for (String expected : PLAN_PREFIXES) {
            int count = Collections.frequency(prefixes, expected);
            if (count != 1) {
                report.error(3, "plan", expected + "으로 시작하는 파일이 " + count + "개입니다");
            }
        }
    }

    // ── 규칙 4 ────────────────────────────────────────────────────────

    /**
     * ⚠️ 단수형({@code bank_idea_draft.txt})을 <b>따로 잡아낸다.</b> 그냥 "없습니다"만
     * 알리면 사람이 파일을 만들어 뒀는데도 없다고 나와 원인을 못 찾는다 — 오타 하나
     * 때문에 헤매는 자리라 사유를 갈라 두었다.
     */
    private static void checkBankIdeasPresence(Path root, ValidationReport report) {
        if (Files.isRegularFile(root.resolve("bank_idea_draft.txt"))) {
            report.error(4, "bank_idea_draft.txt",
                    "단수형 파일명입니다 — bank_ideas_draft.txt(복수형)로 바꾸세요");
        }
        if (!Files.isRegularFile(root.resolve("bank_ideas_draft.txt"))) {
            report.error(4, "bank_ideas_draft.txt", "파일이 없습니다");
        }
    }

    // ── 규칙 9 ────────────────────────────────────────────────────────

    private static void checkEncoding(Path root, ValidationReport report) {
        for (Path path : allTxt(root)) {
            if (readStrictUtf8(path) == null) {
                report.error(9, rel(root, path), "UTF-8로 디코딩할 수 없습니다");
            }
        }
    }

    // ── 규칙 6 ────────────────────────────────────────────────────────

    private static void checkCitations(Path root, List<String> specNumbers, ValidationReport report) {
        Path plan01 = firstMatch(root.resolve("plan"), "01_", ".txt");
        String plan01Text = "";
        if (plan01 != null) {
            String t = readStrictUtf8(plan01);
            plan01Text = t == null ? "" : t;
        }

        for (Path path : allTxt(root)) {
            String text = readStrictUtf8(path);
            if (text == null) {
                continue;  // 규칙 9 가 이미 보고했다
            }
            String relPath = rel(root, path);

            Set<String> cited = new TreeSet<>();
            Matcher m = SPEC_CITATION.matcher(text);
            while (m.find()) {
                cited.add(m.group(1));
            }
            for (String number : cited) {
                if (!specNumbers.contains(number)) {
                    report.error(6, relPath, "spec/" + number + "을 인용했지만 그런 spec 파일이 없습니다");
                }
            }

            if ("bank_ideas_draft.txt".equals(path.getFileName().toString())) {
                Set<String> items = new TreeSet<>();
                Matcher pm = PLAN_CITATION.matcher(text);
                while (pm.find()) {
                    items.add(pm.group(1));
                }
                for (String item : items) {
                    if (!plan01Text.contains(item)) {
                        report.error(6, relPath, "plan " + item + "을 인용했지만 plan/01에 없습니다");
                    }
                }
            }
        }
    }

    // ── 규칙 8(오류) + 규칙 7(경고) ────────────────────────────────────

    /** 블록 라벨 1개의 위치. */
    private static final class BlockHit {
        final int index;
        final int lineNo;
        final String line;

        BlockHit(int index, int lineNo, String line) {
            this.index = index;
            this.lineNo = lineNo;
            this.line = line;
        }
    }

    private static void checkBankIdeasContent(Path root, ValidationReport report) {
        Path path = root.resolve("bank_ideas_draft.txt");
        if (!Files.isRegularFile(path)) {
            return;
        }
        String text = readStrictUtf8(path);
        if (text == null) {
            return;
        }

        List<BlockHit> positions = blockPositions(text);
        for (int order = 0; order < positions.size(); order++) {
            BlockHit hit = positions.get(order);
            if (hit.index != order % 3) {
                report.error(8, "bank_ideas_draft.txt", hit.lineNo + "행: 3블록 순서가 어긋납니다 "
                        + "(기대: " + IDEA_BLOCKS[order % 3] + ", 실제: " + IDEA_BLOCKS[hit.index] + ")");
                // 한 번 어긋나면 이후는 전부 밀리므로 첫 지점만 보고한다.
                break;
            }
            if (hit.index == 1) {  // 상품/협력 형태 블록에서만 은행명을 본다
                for (String name : BANNED_BANK_NAMES) {
                    if (hit.line.contains(name)) {
                        report.warn(7, "bank_ideas_draft.txt",
                                hit.lineNo + "행: 상품/협력 형태 블록에 실존 금융기관명 '" + name + "'");
                    }
                }
            }
        }

        if (positions.isEmpty()) {
            report.error(8, "bank_ideas_draft.txt", "3블록 라벨을 하나도 찾지 못했습니다");
        } else if (positions.size() % 3 != 0) {
            report.error(8, "bank_ideas_draft.txt", "블록 라벨이 총 " + positions.size()
                    + "개로 3의 배수가 아닙니다 (마지막 아이디어 항목의 블록이 불완전합니다)");
        }
    }

    private static List<BlockHit> blockPositions(String text) {
        List<BlockHit> out = new ArrayList<>();
        String[] lines = text.split("\r\n|\r|\n", -1);
        for (int i = 0; i < lines.length; i++) {
            for (int index = 0; index < IDEA_BLOCKS.length; index++) {
                if (lines[i].contains(IDEA_BLOCKS[index])) {
                    out.add(new BlockHit(index, i + 1, lines[i]));
                }
            }
        }
        return out;
    }

    // ── 규칙 10·11·12 (전부 경고) ──────────────────────────────────────

    private static void checkSoftRules(Path root, ValidationReport report) {
        // 규칙 10 — 검증 문서의 항목 점수 합이 총점과 맞는지.
        Path plan05 = firstMatch(root.resolve("plan"), "05_", ".txt");
        String text = plan05 == null ? null : readStrictUtf8(plan05);
        if (text != null) {
            List<int[]> pairs = new ArrayList<>();
            Matcher m = SCORE_PAIR.matcher(text);
            while (m.find()) {
                pairs.add(new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))});
            }
            List<Integer> totals = new ArrayList<>();
            List<int[]> parts = new ArrayList<>();
            for (int[] p : pairs) {
                if (p[1] == 100) {
                    totals.add(p[0]);
                } else {
                    parts.add(p);
                }
            }
            int partDenominator = 0;
            int partSum = 0;
            for (int[] p : parts) {
                partDenominator += p[1];
                partSum += p[0];
            }
            // ⚠️ 조건이 좁은 것은 <b>의도적</b>이다 — 총점이 정확히 하나이고 항목
            // 분모 합이 100 일 때만 본다. 그 밖의 표기는 오탐이 나서 아예 건드리지 않는다.
            if (totals.size() == 1 && !parts.isEmpty() && partDenominator == 100
                    && partSum != totals.get(0)) {
                report.warn(10, "plan/" + plan05.getFileName(),
                        "항목 점수 합 " + partSum + "이 총점 " + totals.get(0) + "과 다릅니다");
            }
        }

        // 규칙 11 — 홈페이지 확인 문서에 분류값이 있는지.
        Path homepage = firstContaining(root.resolve("spec"), "홈페이지검색확인결과");
        text = homepage == null ? null : readStrictUtf8(homepage);
        if (text != null) {
            boolean found = false;
            for (String label : CROSS_CHECK_LABELS) {
                if (text.contains(label)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                report.warn(11, "spec/" + homepage.getFileName(),
                        "확인됨/부분확인/확인안됨 분류값을 찾지 못했습니다");
            }
        }

        // 규칙 12 — 인덱스에 자체검산 문장이 있는지.
        Path spec00 = firstMatch(root.resolve("spec"), "00_", ".txt");
        text = spec00 == null ? null : readStrictUtf8(spec00);
        if (text != null && !SELF_CHECK.matcher(text).find()) {
            report.warn(12, "spec/" + spec00.getFileName(), "자체검산 문장을 찾지 못했습니다");
        }
    }

    // ── 파일 도구 ──────────────────────────────────────────────────────

    /**
     * ⚠️ <b>느슨하게 읽으면 규칙 9 가 통째로 무력해진다.</b> 자바의 기본 디코더는
     * 깨진 바이트를 {@code U+FFFD} 로 바꾸고 넘어가므로, 그대로 쓰면 cp949 파일도
     * "UTF-8 로 읽힌다". 원본 {@code path.read_text(encoding="utf-8")} 은 예외를
     * 던지므로 여기서도 {@code REPORT} 로 맞춘다.
     *
     * @return 디코딩 실패면 {@code null}
     */
    static String readStrictUtf8(Path path) {
        try {
            byte[] raw = Files.readAllBytes(path);
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(raw))
                    .toString();
        } catch (CharacterCodingException notUtf8) {
            return null;
        } catch (IOException unreadable) {
            return null;
        }
    }

    /** 디렉터리 바로 아래 {@code *.txt} 파일명, 이름 오름차순(원본 {@code sorted}). */
    private static List<String> txtNames(Path dir) {
        List<String> out = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.txt")) {
            for (Path p : stream) {
                if (Files.isRegularFile(p)) {
                    out.add(p.getFileName().toString());
                }
            }
        } catch (IOException ignored) {
            return out;
        }
        Collections.sort(out);
        return out;
    }

    /** 하위 전체의 {@code *.txt}, 경로 오름차순(원본 {@code sorted(root.rglob)}). */
    private static List<Path> allTxt(Path root) {
        final List<Path> out = new ArrayList<>();
        try {
            Files.walkFileTree(root, new java.nio.file.SimpleFileVisitor<Path>() {
                @Override
                public java.nio.file.FileVisitResult visitFile(Path file,
                        java.nio.file.attribute.BasicFileAttributes attrs) {
                    if (file.getFileName().toString().endsWith(".txt")) {
                        out.add(file);
                    }
                    return java.nio.file.FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
            return out;
        }
        Collections.sort(out);
        return out;
    }

    private static Path firstMatch(Path dir, String prefix, String suffix) {
        for (String name : txtNames(dir)) {
            if (name.startsWith(prefix) && name.endsWith(suffix)) {
                return dir.resolve(name);
            }
        }
        return null;
    }

    private static Path firstContaining(Path dir, String needle) {
        for (String name : txtNames(dir)) {
            if (name.contains(needle)) {
                return dir.resolve(name);
            }
        }
        return null;
    }

    /** 항상 {@code /} 구분자다 — 윈도우에서 만든 응답이 리눅스와 달라지면 안 된다. */
    private static String rel(Path root, Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }
}
