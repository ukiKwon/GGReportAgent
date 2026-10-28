package com.kbstar.kgi.ggreport.web.docfill;

import org.apache.poi.xwpf.usermodel.XWPFDocument;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

/**
 * 엑셀의 값을 워드 양식의 키워드 옆에 적는다 — <b>LLM 없이 규칙(매핑)만으로</b>.
 *
 * <p>같은 엑셀·같은 양식·같은 규칙이면 결과는 언제나 같고, 두 번 돌려도 같다.
 * 규칙 하나가 틀려도 나머지는 계속 처리하고, 무엇이 왜 안 됐는지는 {@link FillReport}에 남긴다.
 */
public final class ExcelWordFiller {

    private ExcelWordFiller() {
    }

    /**
     * @param xlsx  값을 읽을 엑셀(.xlsx)
     * @param docx  양식(.docx)
     * @param rules 매핑 규칙
     * @param out   채워진 워드가 쓰일 곳
     * @return 규칙별 결과 — 호출한 쪽은 {@link FillReport#allOk()}가 아니면 사람에게 알려야 한다
     */
    public static FillReport fill(InputStream xlsx, InputStream docx, List<FillRule> rules,
                                  OutputStream out) throws IOException {
        FillReport report = new FillReport();
        ExcelSource source = ExcelSource.open(xlsx);
        try {
            XWPFDocument doc = new XWPFDocument(docx);
            try {
                WordFiller filler = new WordFiller();
                for (FillRule rule : rules) {
                    FillReport.Entry entry = report.add(rule.toString(), rule.keyword());
                    ExcelSource.Found found = rule.isCellRule()
                            ? source.valueAt(rule.sheet(), rule.cell())
                            : source.lookup(rule.sheet(), rule.headerRow(), rule.valueHeader(),
                                            rule.keyHeader(), rule.keyValue());
                    if (found.problem != null) {
                        entry.sourceProblem(found.problem);   // 값이 없으면 문서는 건드리지 않는다
                        continue;
                    }
                    entry.value(found.value);
                    filler.apply(doc, rule, found.value, entry);
                }
                doc.write(out);
            } finally {
                doc.close();
            }
        } finally {
            source.close();
        }
        return report;
    }
}
