package com.kbstar.kgi.ggreport.web.minutes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 맞춤 요약 파서 — 설계 3-4. 일반 줄은 소제목, {@code - } 줄은 그 소제목의 항목이다.
 * 소제목은 '주요 주제'(TOPIC)·'다음 할 일'(TODO)·그 밖(OTHER, 제목 보존)으로 나눈다.
 * 들여쓴 줄은 앞 항목에 이어 붙인다. 항목이 하나도 없으면 422 SUMMARY_NO_ITEMS.
 */
public final class SummaryParser {
    public static final int MAX_TITLE_CHARS = 100;
    private static final Pattern BULLET = Pattern.compile("^[-•*]\\s+(.+)$");

    private SummaryParser() {
    }

    public enum Kind { TOPIC, TODO, OTHER }

    public static final class Section {
        public final Kind kind;
        /** OTHER 묶음 번호(1부터). TOPIC·TODO 는 0. */
        public int sectionNo;
        /** OTHER 제목(없으면 null). */
        public final String title;
        public final List<String> items;

        public Section(Kind kind, int sectionNo, String title, List<String> items) {
            this.kind = kind;
            this.sectionNo = sectionNo;
            this.title = title;
            this.items = new ArrayList<String>(items);
        }
    }

    public static final class Result {
        public final List<Section> sections;

        Result(List<Section> sections) {
            this.sections = Collections.unmodifiableList(sections);
        }

        public int itemCount() {
            int n = 0;
            for (Section s : sections) {
                n += s.items.size();
            }
            return n;
        }
    }

    public static Result parse(String[] lines, MinutesBudget budget) {
        final String slot = "summary";
        for (int i = 0; i < lines.length; i++) {
            budget.tick(slot, i + 1);
            if (TimelineParser.isRangeLine(lines[i])) {
                throw MinutesException.unprocessable("SUMMARY_LOOKS_TIMELINE", slot, i + 1);
            }
        }
        List<Section> all = new ArrayList<Section>();
        Section cur = null;
        int itemTotal = 0;
        for (int i = 0; i < lines.length; i++) {
            budget.tick(slot, i + 1);
            String raw = lines[i];
            String s = raw.trim();
            if (s.isEmpty()) {
                continue;
            }
            Matcher bm = BULLET.matcher(s);
            if (bm.matches()) {
                if (cur == null) {
                    cur = new Section(Kind.OTHER, 0, null, Collections.<String>emptyList());
                    all.add(cur);
                }
                if (++itemTotal > TimelineParser.MAX_ITEMS) {
                    throw MinutesException.unprocessable("LIMIT_ITEMS", slot, i + 1);
                }
                String text = bm.group(1).trim();
                if (text.length() > TimelineParser.MAX_ITEM_CHARS) {
                    throw MinutesException.unprocessable("LIMIT_ITEM_LEN", slot, i + 1);
                }
                cur.items.add(text);
                continue;
            }
            if (cur != null && !cur.items.isEmpty() && Character.isWhitespace(raw.charAt(0))) {
                int last = cur.items.size() - 1;
                String joined = cur.items.get(last) + " " + s;
                if (joined.length() > TimelineParser.MAX_ITEM_CHARS) {
                    throw MinutesException.unprocessable("LIMIT_ITEM_LEN", slot, i + 1);
                }
                cur.items.set(last, joined);
                continue;
            }
            cur = heading(s);
            all.add(cur);
        }
        List<Section> kept = new ArrayList<Section>();
        int otherNo = 0;
        for (Section s : all) {
            if (s.items.isEmpty()) {
                continue;
            }
            if (s.kind == Kind.OTHER) {
                s.sectionNo = ++otherNo;
            }
            kept.add(s);
        }
        if (kept.isEmpty()) {
            throw MinutesException.unprocessable("SUMMARY_NO_ITEMS", slot, 0);
        }
        return new Result(kept);
    }

    private static Section heading(String s) {
        String t = s;
        while (t.endsWith(":") || t.endsWith("：")) {
            t = t.substring(0, t.length() - 1).trim();
        }
        String compact = t.replaceAll("\\s+", "");
        Kind kind;
        // 공백을 뺀 전체가 정확히 그 말일 때만(끝의 ':' 는 위에서 뺐다) — "할일 없음 관련 논의" 같은 긴 제목이 TODO 로 잡히지 않게
        if (compact.equals("주요주제")) {
            kind = Kind.TOPIC;
        } else if (compact.equals("다음할일") || compact.equals("다음에할일") || compact.equals("할일")) {
            kind = Kind.TODO;
        } else {
            kind = Kind.OTHER;
        }
        String title = kind == Kind.OTHER && !t.isEmpty() ? t : null;   // 자르기는 가린 뒤에서만(MinutesParse)
        return new Section(kind, 0, title, Collections.<String>emptyList());
    }
}
