package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.golden.GoldenSnapshot;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * PDF 텍스트 추출을 골든({@code golden/artifacts/suwon_rfp_text.txt})과 대조한다 —
 * 단계 5 Task 5.1. 원본은 <b>pypdf</b>, 여기는 <b>PDFBox 2.0.x</b> 다.
 *
 * <p><b>무엇을 같다고 볼 것인가</b>(계획의 판정 기준: "단순 공백 차이는 수용,
 * 표 붕괴 양상이 달라지면 보정"). 2026-08-27 실측 결과:
 *
 * <table border="1">
 *   <tr><th></th><th>pypdf(골든)</th><th>PDFBox</th></tr>
 *   <tr><td>페이지</td><td>6</td><td>6</td></tr>
 *   <tr><td>글자 수</td><td>3,972</td><td>4,296</td></tr>
 *   <tr><td>줄 수</td><td>8</td><td>170</td></tr>
 *   <tr><td><b>공백 뺀 본문</b></td><td colspan="2"><b>완전히 같다</b></td></tr>
 * </table>
 *
 * <p>즉 <b>글자는 하나도 다르지 않고, 줄바꿈만 다르다.</b> pypdf 는 한 페이지를 거의
 * 한 줄로 뭉개고 PDFBox 는 원문의 줄을 살린다 — 늘어난 324자는 전부 그 줄바꿈이다.
 * "표 붕괴 양상이 달라졌나"의 답은 <b>아니오</b>이고(오히려 PDFBox 쪽이 원문 배치에
 * 가깝다), 그래서 <b>보정하지 않고 수용한다.</b>
 *
 * <p>⚠️ <b>다만 이 텍스트는 LLM 프롬프트로 들어간다.</b> 줄바꿈이 달라지면 배점표
 * 구조화 결과가 달라질 수 있다 — 그 산출물은 골든 비교 대상이 아니고(비결정적),
 * 지어낸 배점은 {@link ScoringConsistency} 가 잡는다. 사내 모델로 실호출할 때
 * 이 차이를 함께 볼 것(NEXT.md 항목 5).
 *
 * <p>그래서 이 테스트는 <b>글자(공백 제외)와 페이지 수</b>만 못 박는다. 줄바꿈까지
 * 고정하면 PDFBox 판올림마다 무의미하게 깨진다.
 */
public class PdfTextGoldenTest {

    private static final String PDF = "corpus/rfp/수원시 금고 지정 계획 공고문.pdf";
    private static final String GOLDEN_TEXT = "golden/artifacts/suwon_rfp_text.txt";
    private static final String GOLDEN_META = "golden/artifacts/suwon_rfp_text.meta.json";

    @Test
    public void 공백을_빼면_골든과_글자가_같다() throws Exception {
        Path repo = GoldenSnapshot.repoRoot();
        PdfText.Result actual = PdfText.extract(new File(repo.resolve(PDF).toString()));
        String golden = new String(Files.readAllBytes(repo.resolve(GOLDEN_TEXT)),
                StandardCharsets.UTF_8);

        assertEquals("공백을 뺀 본문이 골든과 다르다 — 이건 줄바꿈 차이가 아니라"
                        + " 추출 자체가 달라진 것이다(폰트·인코딩 처리 의심)",
                strip(golden), strip(actual.fullText()));
    }

    @Test
    public void 페이지_수와_이상판정이_골든과_같다() throws Exception {
        Path repo = GoldenSnapshot.repoRoot();
        PdfText.Result actual = PdfText.extract(new File(repo.resolve(PDF).toString()));
        JsonNode meta = new ObjectMapper().readTree(repo.resolve(GOLDEN_META).toFile());

        assertEquals("페이지 수가 다르다", meta.path("pages").asInt(), actual.pages().size());
        assertFalse("골든은 정상 추출인데 여기서는 이상으로 판정됐다: "
                + actual.abnormalReason(), actual.isAbnormal());
        assertEquals("골든의 이상 판정과 다르다",
                meta.path("is_abnormal").asBoolean(), actual.isAbnormal());
    }

    /**
     * 임계값은 <b>원본과 같은 값이어야 한다</b> — 사람이 스킬로 처리했을 때와
     * 파이프라인이 자동으로 처리했을 때의 판단이 갈리면 안 된다는 것이 원본
     * {@code agent/rfp_text.py} 가 이 상수를 한 곳에만 둔 이유다.
     */
    @Test
    public void 이상판정_임계값이_원본과_같다() {
        assertEquals(50, PdfText.MIN_CHARS_PER_PAGE);
        assertEquals(0.01, PdfText.MAX_REPLACEMENT_RATIO, 0.0);
    }

    /** 줄바꿈이 <b>늘어난다</b>는 사실 자체를 기록해 둔다 — 줄면 그건 다른 얘기다. */
    @Test
    public void 줄바꿈은_골든보다_많다() throws Exception {
        Path repo = GoldenSnapshot.repoRoot();
        PdfText.Result actual = PdfText.extract(new File(repo.resolve(PDF).toString()));
        String golden = new String(Files.readAllBytes(repo.resolve(GOLDEN_TEXT)),
                StandardCharsets.UTF_8);

        assertTrue("PDFBox 가 pypdf 보다 줄을 적게 냈다 — 원문 배치를 잃었다는 뜻이라"
                        + " 배점표 추출 입력이 나빠진다",
                lines(actual.fullText()) > lines(golden));
    }

    private static String strip(String s) {
        return s.replaceAll("\\s+", "");
    }

    private static int lines(String s) {
        return s.replace("\r\n", "\n").split("\n", -1).length;
    }
}
