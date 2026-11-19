package com.kbstar.kgi.ggreport.web.minutes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 시간대별 요약 파서(상태 기계) — 설계 3-4.
 * {@code 시작 ~ 끝} 줄이 새 구간을 연다. 같은 줄 뒤에 글자가 있으면 그것이 주제어 줄(옛 한 줄 형식),
 * 아니면 다음 일반 줄이 주제어 줄이다. {@code - } 줄은 항목, 그 뒤 일반 줄은 앞 항목에 이어 붙인다.
 */
public final class TimelineParser {
    public static final int MAX_SEGMENTS = 200;
    public static final int MAX_ITEMS = 500;
    public static final int MAX_ITEM_CHARS = 1000;
    public static final int MAX_KEYWORD_CHARS = 500;
    private static final int MAX_PREAMBLE_LINES = 5;
    private static final String T = TranscriptParser.TIME;
    private static final Pattern RANGE = Pattern.compile("^" + T + "\\s*[~\\-–]\\s*" + T + "(?:\\s+(.+))?$");
    private static final Pattern BULLET = Pattern.compile("^[-•*]\\s+(.+)$");

    private TimelineParser() {
    }

    public static final class Segment {
        public final int segNo;
        public final int startSec;
        public final int endSec;
        /** 쉼표 구분 원형(없으면 빈 문자열). */
        public final String keywords;
        public final List<String> items;
        /** 구간 줄 번호(1부터). 오류·진단용. */
        public final int line;

        public Segment(int segNo, int startSec, int endSec, String keywords, List<String> items, int line) {
            this.segNo = segNo;
            this.startSec = startSec;
            this.endSec = endSec;
            this.keywords = keywords == null ? "" : keywords;
            this.items = Collections.unmodifiableList(new ArrayList<String>(items));
            this.line = line;
        }

        /** 쉼표로 나눈 주제어 목록. */
        public List<String> keywordList() {
            List<String> out = new ArrayList<String>();
            for (String k : keywords.split(",")) {
                String t = k.trim();
                if (!t.isEmpty()) {
                    out.add(t);
                }
            }
            return out;
        }
    }

    public static final class Result {
        public final List<Segment> segments;
        public final int preambleLines;
        public final int overlapCount;

        Result(List<Segment> segments, int preambleLines, int overlapCount) {
            this.segments = Collections.unmodifiableList(segments);
            this.preambleLines = preambleLines;
            this.overlapCount = overlapCount;
        }
    }

    /** 시간 범위 줄({@code 00:00 ~ 05:30 …})인지. 맞춤 요약 칸에 시간대별 요약을 올렸는지 알아볼 때 쓴다. */
    static boolean isRangeLine(String s) {
        Matcher m = RANGE.matcher(s.trim());
        return m.matches() && TranscriptParser.toSec(m.group(1), m.group(2), m.group(3)) >= 0
                && TranscriptParser.toSec(m.group(4), m.group(5), m.group(6)) >= 0;
    }

    private static final class Builder {
        final int line;
        final int start;
        final int end;
        String keywords;
        final List<String> items = new ArrayList<String>();

        Builder(int line, int start, int end) {
            this.line = line;
            this.start = start;
            this.end = end;
        }
    }

    public static Result parse(String[] lines, MinutesBudget budget) {
        final String slot = "timeline";
        int ranges = 0;
        int headers = 0;
        for (int i = 0; i < lines.length; i++) {
            budget.tick(slot, i + 1);
            if (isRangeLine(lines[i])) {
                ranges++;
            } else if (TranscriptParser.looksLikeHeader(lines[i])) {
                headers++;
            }
        }
        if (ranges == 0 && headers >= 2) {
            throw MinutesException.unprocessable("TIMELINE_LOOKS_TRANSCRIPT", slot, 0);
        }

        List<Builder> segs = new ArrayList<Builder>();
        Builder cur = null;
        boolean expectKeywords = false;
        int preamble = 0;
        int itemTotal = 0;
        for (int i = 0; i < lines.length; i++) {
            budget.tick(slot, i + 1);
            String s = lines[i].trim();
            if (s.isEmpty()) {
                continue;
            }
            Matcher m = RANGE.matcher(s);
            if (m.matches()) {
                int a = TranscriptParser.toSec(m.group(1), m.group(2), m.group(3));
                int b = TranscriptParser.toSec(m.group(4), m.group(5), m.group(6));
                if (a >= 0 && b >= 0) {
                    if (a > b) {
                        throw MinutesException.unprocessable("TIMELINE_RANGE", slot, i + 1);
                    }
                    if (segs.size() >= MAX_SEGMENTS) {
                        throw MinutesException.unprocessable("LIMIT_SEGMENTS", slot, i + 1);
                    }
                    cur = new Builder(i + 1, a, b);
                    segs.add(cur);
                    String rest = m.group(7);
                    if (rest != null && !rest.trim().isEmpty()) {
                        cur.keywords = rest.trim();   // 자르기는 가린 뒤에서만(MinutesParse) — 가리기 전에 자르면 이름 중간이 잘려 가림이 빗나간다
                        expectKeywords = false;
                    } else {
                        expectKeywords = true;
                    }
                    continue;
                }
            }
            if (cur == null) {
                preamble++;
                if (preamble > MAX_PREAMBLE_LINES) {
                    throw MinutesException.unprocessable("TIMELINE_FORMAT", slot, i + 1);
                }
                continue;
            }
            Matcher bm = BULLET.matcher(s);
            if (bm.matches()) {
                if (++itemTotal > MAX_ITEMS) {
                    throw MinutesException.unprocessable("LIMIT_ITEMS", slot, i + 1);
                }
                String text = bm.group(1).trim();
                if (text.length() > MAX_ITEM_CHARS) {
                    throw MinutesException.unprocessable("LIMIT_ITEM_LEN", slot, i + 1);
                }
                cur.items.add(text);
                expectKeywords = false;
                continue;
            }
            if (expectKeywords) {
                cur.keywords = s;   // 가리기 전 자르기 없음(위와 같은 이유)
                expectKeywords = false;
                continue;
            }
            if (!cur.items.isEmpty()) {
                int last = cur.items.size() - 1;
                String joined = cur.items.get(last) + " " + s;
                if (joined.length() > MAX_ITEM_CHARS) {
                    throw MinutesException.unprocessable("LIMIT_ITEM_LEN", slot, i + 1);
                }
                cur.items.set(last, joined);
            }
            // 항목도 주제어도 기다리지 않는 일반 줄(앞 구간에 아무것도 없을 때)은 버린다.
        }
        if (segs.isEmpty()) {
            throw MinutesException.unprocessable("TIMELINE_FORMAT", slot, 0);
        }
        List<Segment> out = new ArrayList<Segment>(segs.size());
        for (int k = 0; k < segs.size(); k++) {
            Builder b = segs.get(k);
            out.add(new Segment(k + 1, b.start, b.end, b.keywords, b.items, b.line));
        }
        return new Result(out, preamble, countOverlap(out));
    }

    /** 시작 순으로 늘어놓고 앞 구간 끝보다 먼저 시작하는 구간 수. */
    static int countOverlap(List<Segment> segs) {
        List<Segment> sorted = new ArrayList<Segment>(segs);
        Collections.sort(sorted, new Comparator<Segment>() {
            @Override
            public int compare(Segment x, Segment y) {
                return x.startSec < y.startSec ? -1 : (x.startSec == y.startSec ? 0 : 1);
            }
        });
        int n = 0;
        int maxEnd = -1;
        for (Segment s : sorted) {
            if (maxEnd >= 0 && s.startSec < maxEnd) {
                n++;
            }
            maxEnd = Math.max(maxEnd, s.endSec);
        }
        return n;
    }
}
