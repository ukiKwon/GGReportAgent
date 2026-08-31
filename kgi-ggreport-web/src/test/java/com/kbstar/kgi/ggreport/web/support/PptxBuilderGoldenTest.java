package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.golden.GoldenSnapshot;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * PPTX 생성을 골든({@code golden/artifacts/pptx_slides.json})과 대조한다 —
 * 단계 5 Task 5.2. 원본은 python-pptx, 여기는 POI(XSLF).
 *
 * <p><b>바이너리가 아니라 슬라이드별 텍스트를 비교한다.</b> pptx 는 zip 이라 내부
 * 타임스탬프가 비결정적이어서 파일을 그대로 대조할 수 없다 —
 * {@code golden/README.md} 가 정한 방식이다. 수집 규칙도 캡처와 같게 맞춘다:
 * <b>텍스트 프레임이 있는 모든 도형</b>의 <b>비어 있지 않은 문단</b>.
 *
 * <p>입력(고정 픽스처)도 캡처와 같은 것을 쓴다 — 배점표는 {@code rfp-locate} 스킬의
 * 수원시 <b>정답지</b>이고, 섹션 2개는 캡처 스크립트에 박힌 문장 그대로다.
 * 여기 문자열을 바꾸면 골든이 깨진다(값 임의 변경 금지).
 *
 * <p>⚠️ 서식(글꼴·색·들여쓰기)은 이 비교의 대상이 아니다 — 계획대로 <b>육안 검증
 * 1회</b>의 몫이다. 여기서 보장하는 것은 "어떤 장에 어떤 글이 있는가"까지다.
 */
public class PptxBuilderGoldenTest {

    private static final String SCORING_FIXTURE =
            ".claude/skills/rfp-locate/references/scoring_schema.json";
    private static final String GOLDEN_SLIDES = "golden/artifacts/pptx_slides.json";

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void 슬라이드별_텍스트가_골든과_같다() throws Exception {
        Path repo = GoldenSnapshot.repoRoot();
        ObjectMapper mapper = new ObjectMapper();

        File output = new File(temp.newFolder("out"), "golden.pptx");
        PptxBuilder.build(captureSections(), criteria(repo, mapper), output, "노원구");

        JsonNode expected = mapper.readTree(repo.resolve(GOLDEN_SLIDES).toFile());
        List<List<String>> actual = readSlideTexts(output);

        assertEquals("슬라이드 수가 다르다: " + actual, expected.size(), actual.size());
        for (int i = 0; i < expected.size(); i++) {
            List<String> want = new ArrayList<String>();
            for (JsonNode line : expected.get(i)) {
                want.add(line.asText());
            }
            assertEquals("슬라이드 " + i + " 의 텍스트가 골든과 다르다",
                    want, actual.get(i));
        }
    }

    /** 배점표가 비면 원본과 같은 자리표시 문구가 들어간다 — 빈 장을 내보내지 않는다. */
    @Test
    public void 배점표가_비면_자리표시_문구가_들어간다() throws Exception {
        File output = new File(temp.newFolder("empty"), "empty.pptx");
        PptxBuilder.build(Collections.<PptxBuilder.Section>emptyList(),
                Collections.<PptxBuilder.Criterion>emptyList(), output, "기관");

        List<List<String>> slides = readSlideTexts(output);
        assertEquals("표지 + 배점표 두 장이어야 한다", 2, slides.size());
        assertEquals(Arrays.asList("기관 제안서"), slides.get(0));
        assertEquals(Arrays.asList("평가 배점표", "(배점표 없음)"), slides.get(1));
    }

    /** 상위 폴더가 없어도 만들어 준다 — 산출물 경로는 기관명 폴더 밑이다. */
    @Test
    public void 없는_폴더에도_저장된다() throws Exception {
        File output = new File(temp.newFolder("root"), "노원구/노원구_제안서.pptx");
        PptxBuilder.build(Collections.<PptxBuilder.Section>emptyList(),
                Collections.<PptxBuilder.Criterion>emptyList(), output, "노원구");
        assertTrue("파일이 안 만들어졌다: " + output, output.isFile());
    }

    /** 캡처 스크립트({@code golden/capture.py})에 박힌 섹션 2개 그대로. */
    private static List<PptxBuilder.Section> captureSections() {
        return Arrays.asList(
                new PptxBuilder.Section("제안 개요", "골든 캡처 고정 본문 — 값 임의 변경 금지",
                        Arrays.asList("spec/01", "plan FN-1")),
                new PptxBuilder.Section("세부 계획", "두 번째 섹션 고정 본문",
                        Collections.<String>emptyList()));
    }

    private static List<PptxBuilder.Criterion> criteria(Path repo, ObjectMapper mapper)
            throws Exception {
        JsonNode scoring = mapper.readTree(repo.resolve(SCORING_FIXTURE).toFile());
        List<PptxBuilder.Criterion> out = new ArrayList<PptxBuilder.Criterion>();
        for (JsonNode c : scoring.path("criteria")) {
            out.add(new PptxBuilder.Criterion(
                    c.path("category").asText(), c.path("item").asText(),
                    c.hasNonNull("score") ? Integer.valueOf(c.get("score").asInt()) : null));
        }
        return out;
    }

    /** 캡처와 같은 규칙: 텍스트 프레임이 있는 모든 도형의 비어 있지 않은 문단. */
    private static List<List<String>> readSlideTexts(File pptx) throws Exception {
        List<List<String>> slides = new ArrayList<List<String>>();
        InputStream in = new FileInputStream(pptx);
        try {
            XMLSlideShow show = new XMLSlideShow(in);
            try {
                for (XSLFSlide slide : show.getSlides()) {
                    List<String> texts = new ArrayList<String>();
                    for (XSLFShape shape : slide.getShapes()) {
                        if (!(shape instanceof XSLFTextShape)) {
                            continue;
                        }
                        for (XSLFTextParagraph p : ((XSLFTextShape) shape).getTextParagraphs()) {
                            String text = p.getText();
                            if (text != null && !text.isEmpty()) {
                                texts.add(text);
                            }
                        }
                    }
                    slides.add(texts);
                }
            } finally {
                show.close();
            }
        } finally {
            in.close();
        }
        return slides;
    }
}
