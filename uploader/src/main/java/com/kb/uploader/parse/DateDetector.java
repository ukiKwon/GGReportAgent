package com.kb.uploader.parse;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 제안서 연도, RFP 공고일 추정. */
@Component
public class DateDetector {

    private static final Pattern YEAR = Pattern.compile("(?<!\\d)(20\\d{2})\\s*(?:년|\\.|-|/)");
    private static final Pattern DATE = Pattern.compile(
        "(?<!\\d)(20\\d{2})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})(?!\\d)");
    /**
     * 공고일 <b>레이블</b>. 종전에는 "공고" 라는 말이 든 줄이면 무조건 후보로 봤는데,
     * 2026-09-23 실제 HWP(서울에너지공사 금고 지정)에서 "재공고 입찰에 부칠 수 있음" 줄에 걸려
     * <b>바로 다음 줄</b>의 "약정기간: 2027. 1. 1. ~" 을 공고일로 잡았다(파일명까지 20270101 로 생성).
     * 그래서 "…공고일/공고일자/게시일" 처럼 <b>날짜를 가리키는 레이블</b>일 때만 본다.
     */
    private static final Pattern NOTICE_LABEL = Pattern.compile(
        "(?:입찰|사업|용역)?\\s*공\\s*고\\s*(?:일자|일|년월일)|게\\s*시\\s*일|공\\s*고\\s*게\\s*시");

    /** 기간을 적은 줄. 시작일이 공고일로 오인되기 쉬워 표지 fallback 에서 뺀다. */
    private static final Pattern PERIOD_LINE = Pattern.compile(
        "(?:약정|계약|사업|용역|과업|수행|이행|지정|협약)\\s*기\\s*간|~|∼");

    /** 표지에 흔한 "2026. 8." 처럼 <b>일(日)이 없는</b> 연·월 표기. */
    private static final Pattern YEAR_MONTH = Pattern.compile(
        "(?<!\\d)(20\\d{2})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]?\\s*$");

    /** 슬라이드 본문에서 가장 많이 나온 연도. 표지(1번)와 앞쪽 슬라이드에 가중치를 준다. */
    public Optional<String> detectProposalYear(List<SlideContent> slides) {
        int maxYear = LocalDate.now().getYear() + 2;
        Map<Integer, Integer> score = new HashMap<>();
        for (SlideContent s : slides) {
            int weight = s.getIndex() == 1 ? 5 : (s.getIndex() <= 3 ? 3 : 1);
            Matcher m = YEAR.matcher(s.getTitle() + "\n" + s.getTextFull());
            while (m.find()) {
                int y = Integer.parseInt(m.group(1));
                if (y >= 2000 && y <= maxYear) score.merge(y, weight, Integer::sum);
            }
        }
        Integer best = null;
        for (Map.Entry<Integer, Integer> e : score.entrySet()) {
            if (best == null || e.getValue() > score.get(best)
                || (e.getValue().equals(score.get(best)) && e.getKey() > best)) {
                best = e.getKey();
            }
        }
        return best == null ? Optional.empty() : Optional.of(String.valueOf(best));
    }

    /**
     * 공고일을 찾는다. yyyyMMdd. 순서대로 본다.
     *
     * <ol>
     *   <li>"공고일자 : 2024. 3. 15." 처럼 <b>레이블과 같은 줄</b>의 날짜</li>
     *   <li>레이블만 있고 값이 비면 바로 다음 줄 (표에서 칸이 갈린 경우)</li>
     *   <li>문서 <b>표지 범위</b>(앞 15줄)의 첫 날짜. 단 "약정기간 …~…" 처럼 기간을 적은 줄은 뺀다</li>
     *   <li>표지의 연·월 표기("2026. 8.") → 그 달 1일로 <b>추정</b></li>
     * </ol>
     *
     * ⚠️ 이 값이 산출물 <b>파일명의 앞자리</b>가 되므로 틀리면 정렬·검색이 통째로 어긋난다.
     *    확신이 낮은 후보를 넓게 받기보다 못 찾는 편(=Optional.empty)이 낫다.
     */
    public Optional<String> detectNoticeDate(List<String> lines) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher label = NOTICE_LABEL.matcher(line);
            if (!label.find()) continue;
            // 레이블 **뒤쪽**만 본다. 앞에 있는 날짜는 다른 항목의 값이다.
            Optional<String> d = firstDate(line.substring(label.end()));
            if (!d.isPresent()) d = firstDate(line);
            if (!d.isPresent() && i + 1 < lines.size()) d = firstDate(lines.get(i + 1));
            if (d.isPresent()) return d;
        }

        int limit = Math.min(lines.size(), COVER_LINES);
        for (int i = 0; i < limit; i++) {
            if (PERIOD_LINE.matcher(lines.get(i)).find()) continue;
            Optional<String> d = firstDate(lines.get(i));
            if (d.isPresent()) return d;
        }
        for (int i = 0; i < limit; i++) {
            if (PERIOD_LINE.matcher(lines.get(i)).find()) continue;
            Matcher m = YEAR_MONTH.matcher(lines.get(i).trim());
            if (m.find()) {
                int month = Integer.parseInt(m.group(2));
                if (month >= 1 && month <= 12) {
                    return Optional.of(String.format("%s%02d01", m.group(1), month));
                }
            }
        }
        return Optional.empty();
    }

    /** 표지로 볼 앞부분 줄 수. 본문 깊숙한 곳의 날짜까지 끌어오면 오답이 는다. */
    private static final int COVER_LINES = 15;

    static Optional<String> firstDate(String line) {
        Matcher m = DATE.matcher(line);
        while (m.find()) {
            int month = Integer.parseInt(m.group(2));
            int day = Integer.parseInt(m.group(3));
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return Optional.of(String.format("%s%02d%02d", m.group(1), month, day));
            }
        }
        return Optional.empty();
    }
}
