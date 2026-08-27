package com.kbstar.kgi.ggreport.web.support;

import org.apache.poi.xslf.usermodel.SlideLayout;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFSlideLayout;
import org.apache.poi.xslf.usermodel.XSLFSlideMaster;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextShape;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;

/**
 * 제안서 PPTX 생성 — Python {@code agent/nodes/pptx_builder.build_pptx} 의 이관본
 * (단계 5 Task 5.2). POI 5.2.x(XSLF).
 *
 * <p>슬라이드 구성은 원본 그대로다: <b>표지 → 평가 배점표 → 섹션마다 한 장</b>.
 * 골든은 바이너리가 아니라 <b>슬라이드별 텍스트</b>({@code golden/artifacts/pptx_slides.json})
 * 로 대조한다 — pptx 는 zip 이라 내부 타임스탬프가 비결정적이다.
 *
 * <p>⚠️ <b>python-pptx 와 POI 는 기본 템플릿이 다르다.</b> 원본은
 * {@code prs.slide_layouts[0]}(표지)·{@code [1]}(제목+내용)을 <b>번호로</b> 집는데,
 * POI 의 기본 템플릿은 배치 순서가 그와 같다는 보장이 없다. 그래서 번호가 아니라
 * <b>{@link SlideLayout} 종류로</b> 찾는다({@code TITLE}·{@code TITLE_AND_CONTENT}).
 *
 * <p>⚠️ <b>과거 유사제안 붙이기({@code _add_archive_reference_section})는 아직 없다.</b>
 * 원본은 아카이브 pptx 의 도형을 XML 째로 복사해 붙인다. 그 경로는 아카이브가 있는
 * 기관에서만 타고 골든에도 없다 — 아카이브 이관(단계 5 후반)에서 함께 옮긴다.
 */
public final class PptxBuilder {

    /** 배점표가 비었을 때 넣는 자리표시 문구(원본 그대로). */
    private static final String NO_SCORING = "(배점표 없음)";

    private PptxBuilder() {
    }

    /** 배점표 한 줄. 원본의 {@code {category, item, score}} 와 같다. */
    public static final class Criterion {
        private final String category;
        private final String item;
        private final Integer score;

        public Criterion(String category, String item, Integer score) {
            this.category = category;
            this.item = item;
            this.score = score;
        }

        String line() {
            return category + ": " + item + " (" + score + "점)";
        }
    }

    /** 본문 한 장. {@code sources} 가 비어 있지 않으면 '근거자료:' 줄이 붙는다. */
    public static final class Section {
        private final String title;
        private final String content;
        private final List<String> sources;

        public Section(String title, String content, List<String> sources) {
            this.title = title;
            this.content = content;
            this.sources = sources;
        }
    }

    /**
     * 파일로 저장하고 그 경로를 돌려준다. 상위 폴더는 만들어 준다.
     *
     * @param institutionName 표지에 쓰는 기관명 — 원본 기본값은 {@code "기관"} 이다
     */
    public static String build(List<Section> sections, List<Criterion> scoringTable,
                               File output, String institutionName) throws IOException {
        File parent = output.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) {
            throw new IOException("산출물 폴더를 만들지 못했다: " + parent);
        }

        XMLSlideShow show = new XMLSlideShow();
        try {
            addTitleSlide(show, institutionName);
            addScoringSlide(show, scoringTable);
            for (Section section : sections) {
                addSectionSlide(show, section);
            }
            OutputStream out = new FileOutputStream(output);
            try {
                show.write(out);
            } finally {
                out.close();
            }
        } finally {
            show.close();
        }
        return output.getPath();
    }

    private static void addTitleSlide(XMLSlideShow show, String institutionName) {
        XSLFSlide slide = show.createSlide(layout(show, SlideLayout.TITLE));
        XSLFTextShape title = title(slide);
        title.setText(institutionName + " 제안서");
        keepOnly(slide, title);
    }

    private static void addScoringSlide(XMLSlideShow show, List<Criterion> scoringTable) {
        XSLFSlide slide = show.createSlide(layout(show, SlideLayout.TITLE_AND_CONTENT));
        XSLFTextShape title = title(slide);
        title.setText("평가 배점표");
        XSLFTextShape body = body(slide);
        if (scoringTable == null || scoringTable.isEmpty()) {
            body.setText(NO_SCORING);
        } else {
            body.setText(scoringTable.get(0).line());
            for (int i = 1; i < scoringTable.size(); i++) {
                addParagraph(body, scoringTable.get(i).line(), 0);
            }
        }
        keepOnly(slide, title, body);
    }

    private static void addSectionSlide(XMLSlideShow show, Section section) {
        XSLFSlide slide = show.createSlide(layout(show, SlideLayout.TITLE_AND_CONTENT));
        XSLFTextShape title = title(slide);
        title.setText(section.title);
        XSLFTextShape body = body(slide);
        body.setText(section.content);
        if (section.sources != null && !section.sources.isEmpty()) {
            // 원본은 level=1(한 단 들여쓰기)로 넣는다. 텍스트는 같고 들여쓰기만 다르므로
            // 골든(슬라이드별 텍스트)에는 안 보이지만, 화면에서는 보인다.
            addParagraph(body, "근거자료: " + String.join(", ", section.sources), 1);
        }
        keepOnly(slide, title, body);
    }

    private static void addParagraph(XSLFTextShape body, String text, int indentLevel) {
        XSLFTextParagraph paragraph = body.addNewTextParagraph();
        paragraph.setIndentLevel(indentLevel);
        paragraph.addNewTextRun().setText(text);
    }

    /**
     * 레이아웃을 <b>종류로</b> 찾는다(번호가 아니라). 없으면 소리 내어 죽는다 —
     * 조용히 다른 레이아웃을 쓰면 자리표시가 어긋나 제목이 본문 자리에 들어간다.
     */
    private static XSLFSlideLayout layout(XMLSlideShow show, SlideLayout kind) {
        for (XSLFSlideMaster master : show.getSlideMasters()) {
            XSLFSlideLayout found = master.getLayout(kind);
            if (found != null) {
                return found;
            }
        }
        throw new IllegalStateException("기본 템플릿에 " + kind + " 레이아웃이 없다 —"
                + " POI 판이 바뀌었거나 템플릿이 교체됐다");
    }

    private static XSLFTextShape title(XSLFSlide slide) {
        XSLFTextShape shape = slide.getPlaceholder(0);
        if (shape == null) {
            throw new IllegalStateException("제목 자리표시가 없는 레이아웃이다");
        }
        return shape;
    }

    private static XSLFTextShape body(XSLFSlide slide) {
        XSLFTextShape shape = slide.getPlaceholder(1);
        if (shape == null) {
            throw new IllegalStateException("본문 자리표시가 없는 레이아웃이다");
        }
        return shape;
    }

    /**
     * 우리가 글을 넣은 도형만 남기고 <b>나머지 자리표시는 지운다.</b>
     *
     * <p>⚠️ <b>이게 없으면 골든이 깨진다(2026-08-27 실측).</b> POI 의 기본 표지
     * 레이아웃은 부제 자리표시를 안내 문구
     * ({@code "Click to edit Master subtitle style"})와 함께 물고 온다 — 비어 있지
     * 않으므로 "빈 것만 지우기"로는 안 걸리고, 골든이 세는 슬라이드 텍스트에
     * 원본에는 없는 줄이 하나 더 생긴다. 실제 화면에도 그 안내 문구가 그대로 보인다.
     *
     * <p>python-pptx 는 안 쓴 자리표시를 남기되 <b>글자가 비어</b> 있어서 이 문제가
     * 없었다 — 라이브러리가 달라 새로 생긴 차이다.
     */
    private static void keepOnly(XSLFSlide slide, XSLFTextShape... written) {
        for (XSLFShape shape : slide.getShapes().toArray(new XSLFShape[0])) {
            if (!(shape instanceof XSLFTextShape)) {
                continue;
            }
            boolean keep = false;
            for (XSLFTextShape kept : written) {
                if (kept == shape) {
                    keep = true;
                    break;
                }
            }
            if (!keep) {
                slide.removeShape(shape);
            }
        }
    }
}
