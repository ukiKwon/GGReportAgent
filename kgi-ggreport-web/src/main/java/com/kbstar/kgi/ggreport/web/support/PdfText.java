package com.kbstar.kgi.ggreport.web.support;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 공고문 PDF → 텍스트. Python {@code agent/rfp_text.py} 의 이관본(단계 5 Task 5.1).
 *
 * <p>원본은 <b>pypdf</b> 를 쓴다({@code golden/README.md} 는 pdfplumber 라고 적어 뒀지만
 * 코드는 pypdf 다). 여기서는 PDFBox 2.0.x 다 — 라이브러리가 다르니 <b>공백·줄바꿈이
 * 똑같이 나오지 않는다.</b> 무엇을 수용하고 무엇을 보정할지는 {@code PdfTextGoldenTest}
 * 가 실측으로 판정한다.
 *
 * <p>여기까지가 기계가 확실히 할 수 있는 일이고, <b>배점표를 표로 복원하는 것은
 * 아니다</b> — 추출된 텍스트에서 항목/세부항목/배점의 컬럼 경계가 무너진다. 그 복원은
 * LLM 의 몫이고, 지어낸 배점은 {@link ScoringConsistency} 가 잡는다.
 */
public final class PdfText {

    /**
     * 이상 판정 임계값. <b>원본과 같은 값이어야 한다</b> — 사람이 스킬로 처리했을 때와
     * 파이프라인이 자동으로 처리했을 때의 판단이 갈리면 안 된다.
     */
    public static final int MIN_CHARS_PER_PAGE = 50;
    public static final double MAX_REPLACEMENT_RATIO = 0.01;

    /** 인코딩이 깨졌을 때 나오는 대체 문자. CID 폰트·이미지 PDF 가 여기 걸린다. */
    private static final char REPLACEMENT = '�';

    private PdfText() {
    }

    public static Result extract(File pdf) throws IOException {
        List<String> pages = new ArrayList<String>();
        PDDocument document = PDDocument.load(pdf);
        try {
            PDFTextStripper stripper = new PDFTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                // ⚠️ 페이지를 통째로 한 번에 뽑지 않고 한 장씩 뽑는다 — 원본이
                //    페이지 리스트를 만들고 "\n" 으로 잇기 때문이다. 한 번에 뽑으면
                //    페이지 경계의 줄바꿈 수가 달라지고, 평균 글자수(이상 판정의
                //    입력)도 계산할 수 없다.
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                pages.add(stripper.getText(document));
            }
        } finally {
            document.close();
        }
        return new Result(pages);
    }

    /** 추출 결과 + 이상 판정. */
    public static final class Result {

        private final List<String> pages;
        private final String fullText;
        private final double avgCharsPerPage;
        private final boolean abnormal;
        private final String abnormalReason;

        Result(List<String> pages) {
            this.pages = Collections.unmodifiableList(pages);
            this.fullText = String.join("\n", pages);

            int total = 0;
            for (String page : pages) {
                total += page.length();
            }
            this.avgCharsPerPage = pages.isEmpty() ? 0 : (double) total / pages.size();

            String reason = null;
            if (avgCharsPerPage < MIN_CHARS_PER_PAGE) {
                reason = "avg chars/page " + round1(avgCharsPerPage)
                        + " is below " + MIN_CHARS_PER_PAGE + " threshold";
            } else if (!fullText.isEmpty()) {
                int replacements = 0;
                for (int i = 0; i < fullText.length(); i++) {
                    if (fullText.charAt(i) == REPLACEMENT) {
                        replacements++;
                    }
                }
                double ratio = (double) replacements / fullText.length();
                if (ratio > MAX_REPLACEMENT_RATIO) {
                    reason = "replacement char (�) ratio " + percent(ratio)
                            + " exceeds " + percent(MAX_REPLACEMENT_RATIO);
                }
            }
            this.abnormal = reason != null;
            this.abnormalReason = reason;
        }

        public List<String> pages()      { return pages; }
        public String fullText()         { return fullText; }
        public double avgCharsPerPage()  { return avgCharsPerPage; }
        /** 추출 결과를 <b>못 믿을</b> 상태인가. true 면 사람이 봐야 한다. */
        public boolean isAbnormal()      { return abnormal; }
        /** 이상이 아니면 null. */
        public String abnormalReason()   { return abnormalReason; }

        private static String round1(double v) {
            return String.format("%.1f", v);
        }

        private static String percent(double v) {
            return String.format("%.1f%%", v * 100);
        }
    }
}
