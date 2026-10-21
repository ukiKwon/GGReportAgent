package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.dto.ValidationIssue;
import com.kbstar.kgi.ggreport.web.dto.ValidationReport;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 코퍼스 규격 검사기 — Task 5B.5. Python {@code server/corpus_validator.py} 의 이식.
 *
 * <p>규칙 번호는 <b>응답에 그대로 실리는 계약</b>이라 번호까지 확인한다. 그리고
 * <b>오류/경고의 구분</b>도 확인한다 — 경고를 오류로 올리면 정상 코퍼스가 등록되지
 * 않고, 오류를 경고로 내리면 깨진 코퍼스가 통과한다.
 */
public class CorpusValidatorTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    // ── 코퍼스 만들기 도구 ────────────────────────────────────────────

    /** 규격을 지키는 최소 코퍼스. 각 테스트는 여기서 <b>한 가지만</b> 망가뜨린다. */
    private Path validCorpus() throws IOException {
        Path root = tmp.newFolder("dobong").toPath();
        Path spec = Files.createDirectory(root.resolve("spec"));
        Path plan = Files.createDirectory(root.resolve("plan"));

        write(spec.resolve("00_인덱스.txt"), "총 8건 확인함");
        write(spec.resolve("01_사업목록.txt"), "내용");
        write(spec.resolve("02_예산.txt"), "내용");
        write(spec.resolve("03_홈페이지검색확인결과.txt"), "확인됨");
        write(spec.resolve("04_민원게시판_2026년정리.txt"), "내용");
        write(spec.resolve("05_기타.txt"), "내용");
        write(spec.resolve("06_기타2.txt"), "내용");
        write(spec.resolve("07_기타3.txt"), "내용");

        write(plan.resolve("00_제안개요.txt"), "내용");
        write(plan.resolve("01_요약표.txt"), "IT-1 FN-1");
        write(plan.resolve("02_IT.txt"), "내용");
        write(plan.resolve("03_금전.txt"), "내용");
        write(plan.resolve("04_로드맵.txt"), "내용");
        write(plan.resolve("05_검증결과.txt"), "신뢰도 74/100");

        write(root.resolve("bank_ideas_draft.txt"), ideas(1));
        return root;
    }

    /** 아이디어 {@code n} 개 = 3블록 × n. */
    private static String ideas(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append("연계 구청사업/근거: spec/01\n");
            sb.append("구체적 상품/협력 형태: 대출\n");
            sb.append("은행 기대효과: 수익\n");
        }
        return sb.toString();
    }

    private static void write(Path path, String text) throws IOException {
        Files.write(path, text.getBytes(StandardCharsets.UTF_8));
    }

    private static List<Integer> rulesOf(List<ValidationIssue> issues) {
        List<Integer> out = new ArrayList<>();
        for (ValidationIssue i : issues) {
            out.add(i.getRule());
        }
        return out;
    }

    private static String messages(ValidationReport r) {
        StringBuilder sb = new StringBuilder();
        for (ValidationIssue i : r.getErrors()) {
            sb.append("[E").append(i.getRule()).append("] ").append(i.getMessage()).append('\n');
        }
        for (ValidationIssue i : r.getWarnings()) {
            sb.append("[W").append(i.getRule()).append("] ").append(i.getMessage()).append('\n');
        }
        return sb.toString();
    }

    // ── 통과 ──────────────────────────────────────────────────────────

    @Test
    public void 규격을_지킨_코퍼스는_통과한다() throws Exception {
        ValidationReport r = CorpusValidator.validate(validCorpus());
        assertTrue("오류가 있으면 안 된다:\n" + messages(r), r.isOk());
        assertTrue("경고도 없어야 한다:\n" + messages(r), r.getWarnings().isEmpty());
    }

    @Test
    public void 디렉터리가_아니면_규칙1_오류다() throws Exception {
        ValidationReport r = CorpusValidator.validate(tmp.getRoot().toPath().resolve("없음"));
        assertFalse(r.isOk());
        assertEquals(java.util.Collections.singletonList(1), rulesOf(r.getErrors()));
    }

    // ── 규칙 1·2·5 (spec) ─────────────────────────────────────────────

    @Test
    public void spec이_없으면_규칙1_오류다() throws Exception {
        Path root = validCorpus();
        deleteTree(root.resolve("spec"));
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(1));
    }

    @Test
    public void spec_파일이_8개_미만이면_규칙1_오류다() throws Exception {
        Path root = validCorpus();
        Files.delete(root.resolve("spec/07_기타3.txt"));
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(1));
    }

    @Test
    public void NN_접두사가_없는_파일은_규칙1_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("spec/이름없음.txt"), "내용");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(1));
    }

    /** ⚠️ 번호 구멍은 <b>경고</b>다 — 중간이 빠진 것이 의도일 수 있어 막지 않는다. */
    @Test
    public void 번호가_비면_규칙2_경고이지_오류가_아니다() throws Exception {
        Path root = validCorpus();
        Files.move(root.resolve("spec/05_기타.txt"), root.resolve("spec/09_기타.txt"));

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue("등록을 막으면 안 된다:\n" + messages(r), r.isOk());
        assertTrue(rulesOf(r.getWarnings()).contains(2));
    }

    @Test
    public void 홈페이지_확인_파일이_둘이면_규칙5_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("spec/08_홈페이지검색확인결과_사본.txt"), "확인됨");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(5));
    }

    // ── 규칙 3 (plan) ─────────────────────────────────────────────────

    @Test
    public void plan이_6개가_아니면_규칙3_오류다() throws Exception {
        Path root = validCorpus();
        Files.delete(root.resolve("plan/05_검증결과.txt"));
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(3));
    }

    // ── 규칙 4 (bank_ideas_draft) ─────────────────────────────────────

    @Test
    public void bank_ideas_draft가_없으면_규칙4_오류다() throws Exception {
        Path root = validCorpus();
        Files.delete(root.resolve("bank_ideas_draft.txt"));
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(4));
    }

    /**
     * ⚠️ 단수형 오타를 <b>따로</b> 잡는다. "없습니다"만 알리면 파일을 만들어 둔 사람이
     * 원인을 못 찾는다 — 오타 하나로 헤매는 자리라 사유를 갈라 두었다.
     */
    @Test
    public void 단수형_파일명은_사유가_따로_나온다() throws Exception {
        Path root = validCorpus();
        Files.move(root.resolve("bank_ideas_draft.txt"), root.resolve("bank_idea_draft.txt"));

        ValidationReport r = CorpusValidator.validate(root);
        boolean toldAboutTypo = false;
        for (ValidationIssue i : r.getErrors()) {
            if (i.getRule() == 4 && i.getMessage().contains("복수형")) {
                toldAboutTypo = true;
            }
        }
        assertTrue("단수형이라는 사실을 알려야 한다:\n" + messages(r), toldAboutTypo);
    }

    // ── 규칙 9 (인코딩) ───────────────────────────────────────────────

    /**
     * ⚠️ <b>이 테스트가 검증기에서 제일 중요하다.</b> 자바 기본 디코더는 깨진 바이트를
     * {@code U+FFFD} 로 바꾸고 넘어가므로, 느슨하게 읽으면 cp949 파일도 "UTF-8 로
     * 읽힌다" — 규칙 9 가 통째로 무력해진다.
     */
    @Test
    public void UTF8이_아닌_파일은_규칙9_오류다() throws Exception {
        Path root = validCorpus();
        Charset cp949 = Charset.forName(Charset.isSupported("x-windows-949") ? "x-windows-949" : "EUC-KR");
        Files.write(root.resolve("spec/06_기타2.txt"), "한글이 깨진 파일".getBytes(cp949));

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue("cp949 를 UTF-8 로 읽어 넘기면 안 된다:\n" + messages(r),
                rulesOf(r.getErrors()).contains(9));
    }

    // ── 규칙 6 (인용) ─────────────────────────────────────────────────

    @Test
    public void 없는_spec을_인용하면_규칙6_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "연계 구청사업/근거: spec/42\n구체적 상품/협력 형태: 대출\n은행 기대효과: 수익\n");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(6));
    }

    @Test
    public void plan01에_없는_항목을_인용하면_규칙6_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "연계 구청사업/근거: plan ZZ-9\n구체적 상품/협력 형태: 대출\n은행 기대효과: 수익\n");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(6));
    }

    // ── 규칙 8 (3블록) + 규칙 7 (은행명) ──────────────────────────────

    @Test
    public void 블록_라벨이_없으면_규칙8_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"), "아무 내용도 없음\n");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(8));
    }

    @Test
    public void 블록이_3의_배수가_아니면_규칙8_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                ideas(1) + "연계 구청사업/근거: spec/01\n구체적 상품/협력 형태: 대출\n");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(8));
    }

    @Test
    public void 블록_순서가_어긋나면_규칙8_오류다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "구체적 상품/협력 형태: 대출\n연계 구청사업/근거: spec/01\n은행 기대효과: 수익\n");
        assertTrue(rulesOf(CorpusValidator.validate(root).getErrors()).contains(8));
    }

    /** ⚠️ 순서가 한 번 어긋나면 이후가 전부 밀리므로 <b>첫 지점만</b> 보고한다. */
    @Test
    public void 순서_오류는_첫_지점만_보고한다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "구체적 상품/협력 형태: 대출\n연계 구청사업/근거: spec/01\n은행 기대효과: 수익\n"
                        + "구체적 상품/협력 형태: 예금\n연계 구청사업/근거: spec/02\n은행 기대효과: 수익\n");

        int orderErrors = 0;
        for (ValidationIssue i : CorpusValidator.validate(root).getErrors()) {
            if (i.getRule() == 8 && i.getMessage().contains("순서")) {
                orderErrors++;
            }
        }
        assertEquals("첫 지점 하나만 보고해야 한다", 1, orderErrors);
    }

    /**
     * ⚠️ 실존 금융기관명은 <b>경고</b>다(등록을 막지 않는다). 그리고 상품/협력 블록
     * 에서만 본다 — 근거 블록에는 구청 사업 설명상 등장할 수 있다.
     */
    @Test
    public void 상품블록의_타행명은_규칙7_경고다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "연계 구청사업/근거: spec/01\n구체적 상품/협력 형태: 신한은행 제휴\n은행 기대효과: 수익\n");

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue("등록을 막으면 안 된다:\n" + messages(r), r.isOk());
        assertTrue(rulesOf(r.getWarnings()).contains(7));
    }

    /** ⚠️ 제안 주체(KB·국민은행)는 <b>일부러 목록에 없다</b> — 자기 이름은 위반이 아니다. */
    @Test
    public void 자행명은_경고하지_않는다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "연계 구청사업/근거: spec/01\n구체적 상품/협력 형태: KB국민은행 제휴\n은행 기대효과: 수익\n");

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue("자기 이름을 쓰는 것은 위반이 아니다:\n" + messages(r), r.getWarnings().isEmpty());
    }

    @Test
    public void 근거블록의_타행명은_보지_않는다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("bank_ideas_draft.txt"),
                "연계 구청사업/근거: 신한은행과 협약한 사업\n구체적 상품/협력 형태: 대출\n은행 기대효과: 수익\n");

        assertTrue(CorpusValidator.validate(root).getWarnings().isEmpty());
    }

    // ── 규칙 10·11·12 (전부 경고) ─────────────────────────────────────

    @Test
    public void 점수_합이_총점과_다르면_규칙10_경고다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("plan/05_검증결과.txt"), "총점 74/100 · 항목 20/40 · 항목 20/60");

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue("경고여야 한다:\n" + messages(r), r.isOk());
        assertTrue(rulesOf(r.getWarnings()).contains(10));
    }

    @Test
    public void 홈페이지_확인에_분류값이_없으면_규칙11_경고다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("spec/03_홈페이지검색확인결과.txt"), "분류값이 없는 본문");

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue(r.isOk());
        assertTrue(rulesOf(r.getWarnings()).contains(11));
    }

    @Test
    public void 인덱스에_자체검산이_없으면_규칙12_경고다() throws Exception {
        Path root = validCorpus();
        write(root.resolve("spec/00_인덱스.txt"), "검산 문장이 없는 본문");

        ValidationReport r = CorpusValidator.validate(root);
        assertTrue(r.isOk());
        assertTrue(rulesOf(r.getWarnings()).contains(12));
    }

    // ── 도구 ──────────────────────────────────────────────────────────

    private static void deleteTree(Path dir) throws IOException {
        Files.walkFileTree(dir, new java.nio.file.SimpleFileVisitor<Path>() {
            @Override
            public java.nio.file.FileVisitResult visitFile(Path file,
                    java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult postVisitDirectory(Path d, IOException exc)
                    throws IOException {
                Files.delete(d);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
    }
}
