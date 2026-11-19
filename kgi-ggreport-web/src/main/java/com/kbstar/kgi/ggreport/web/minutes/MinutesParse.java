package com.kbstar.kgi.ggreport.web.minutes;

import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원문·시간대별 요약·맞춤 요약을 읽어 가린 결과 한 묶음 — 설계 3-3·3-4·3-5.
 * 미리보기와 확정이 같은 함수를 부른다(서버는 상태를 들지 않고 확정 때 처음부터 다시 계산한다).
 * 이 묶음의 글은 모두 가린 뒤의 것이다. 원본·파일명·가림 단어는 들어 있지 않다.
 */
public final class MinutesParse {
    public static final int TITLE_MAX = SummaryParser.MAX_TITLE_CHARS;

    public final String encTranscript;
    public final String encTimeline;
    public final String encSummary;
    /** 가린 제목. 제목을 받지 않았으면 null. */
    public final String title;
    public final List<TranscriptParser.Utterance> utterances;
    public final List<TimelineParser.Segment> segments;
    public final List<SummaryParser.Section> sections;
    public final SegmentLinker.Link link;
    public final int speakerCnt;
    public final int durationSec;
    public final int noiseCnt;
    public final int maskPii;
    public final int maskName;
    public final int maskTitle;
    public final int maskTerm;
    public final int maskLine;
    public final int maskLabel;
    public final int released;
    /** 경고 코드 → 건수(PREAMBLE_SKIPPED·TIME_NOT_SORTED·SEG_OVERLAP·SEG_BEYOND_END·LABEL_RENAMED). 0건은 넣지 않는다. */
    public final Map<String, Integer> warnings;
    /** 이름 사전에 걸린 이름 → 적중 수(해제된 것 포함). */
    public final Map<String, Integer> nameCandidates;
    public final String digest;

    private MinutesParse(Builder b) {
        this.encTranscript = b.encTranscript;
        this.encTimeline = b.encTimeline;
        this.encSummary = b.encSummary;
        this.title = b.title;
        this.utterances = Collections.unmodifiableList(b.utterances);
        this.segments = Collections.unmodifiableList(b.segments);
        this.sections = Collections.unmodifiableList(b.sections);
        this.link = b.link;
        this.speakerCnt = b.speakerCnt;
        this.durationSec = b.durationSec;
        this.noiseCnt = b.noiseCnt;
        this.maskPii = b.maskPii;
        this.maskName = b.maskName;
        this.maskTitle = b.maskTitle;
        this.maskTerm = b.maskTerm;
        this.maskLine = b.maskLine;
        this.maskLabel = b.maskLabel;
        this.released = b.released;
        this.warnings = Collections.unmodifiableMap(b.warnings);
        this.nameCandidates = Collections.unmodifiableMap(b.nameCandidates);
        this.digest = b.digest;
    }

    private static final class Builder {
        String encTranscript;
        String encTimeline;
        String encSummary;
        String title;
        List<TranscriptParser.Utterance> utterances = new ArrayList<TranscriptParser.Utterance>();
        List<TimelineParser.Segment> segments = new ArrayList<TimelineParser.Segment>();
        List<SummaryParser.Section> sections = new ArrayList<SummaryParser.Section>();
        SegmentLinker.Link link;
        int speakerCnt;
        int durationSec;
        int noiseCnt;
        int maskPii;
        int maskName;
        int maskTitle;
        int maskTerm;
        int maskLine;
        int maskLabel;
        int released;
        Map<String, Integer> warnings = new LinkedHashMap<String, Integer>();
        Map<String, Integer> nameCandidates;
        String digest;
    }

    public int utterCnt() {
        return utterances.size();
    }

    public int segCnt() {
        return segments.size();
    }

    /** 표준 10초 예산으로 읽는다. timeline·summary·title 은 null 허용. */
    public static MinutesParse parse(byte[] transcript, byte[] timeline, byte[] summary, String title,
                                     MinutesMasker masker, Collection<String> terms, Collection<String> release) {
        return parse(transcript, timeline, summary, title, masker, terms, release, MinutesBudget.standard());
    }

    public static MinutesParse parse(byte[] transcript, byte[] timeline, byte[] summary, String title,
                                     MinutesMasker masker, Collection<String> terms, Collection<String> release,
                                     MinutesBudget budget) {
        Builder b = new Builder();
        MinutesText.Prepared pt = MinutesText.prepare(transcript, "transcript");
        b.encTranscript = pt.encoding;
        TranscriptParser.Result tr = TranscriptParser.parse(pt.lines, budget);

        TimelineParser.Result tl = null;
        if (timeline != null) {
            MinutesText.Prepared p = MinutesText.prepare(timeline, "timeline");
            b.encTimeline = p.encoding;
            tl = TimelineParser.parse(p.lines, budget);
        }
        SummaryParser.Result sm = null;
        if (summary != null) {
            MinutesText.Prepared p = MinutesText.prepare(summary, "summary");
            b.encSummary = p.encoding;
            sm = SummaryParser.parse(p.lines, budget);
        }

        MinutesMasker.Session s = masker.newSession(terms, release, budget);
        if (title != null) {
            String t = MinutesText.normalizeText(title, "title").replace('\n', ' ').trim();
            b.title = clip(s.mask(t), TITLE_MAX);
        }
        for (TranscriptParser.Utterance u : tr.utterances) {
            b.utterances.add(new TranscriptParser.Utterance(u.seqNo, u.speakerNo, u.startSec, u.noise, s.mask(u.body)));
        }
        if (tl != null) {
            for (TimelineParser.Segment g : tl.segments) {
                List<String> items = new ArrayList<String>();
                for (String it : g.items) {
                    items.add(clip(s.mask(it), TimelineParser.MAX_ITEM_CHARS));
                }
                b.segments.add(new TimelineParser.Segment(g.segNo, g.startSec, g.endSec,
                        clip(s.mask(g.keywords), TimelineParser.MAX_KEYWORD_CHARS), items, g.line));
            }
        }
        if (sm != null) {
            for (SummaryParser.Section sec : sm.sections) {
                List<String> items = new ArrayList<String>();
                for (String it : sec.items) {
                    items.add(clip(s.mask(it), TimelineParser.MAX_ITEM_CHARS));
                }
                String t = sec.title == null ? null : clip(s.mask(sec.title), SummaryParser.MAX_TITLE_CHARS);
                b.sections.add(new SummaryParser.Section(sec.kind, sec.sectionNo, t, items));
            }
        }
        s.validateRelease();

        b.link = SegmentLinker.link(b.segments, b.utterances);
        b.speakerCnt = tr.speakerCount();
        b.durationSec = tr.durationSec();
        b.noiseCnt = tr.noiseCount();
        b.maskPii = s.piiCount();
        b.maskName = s.nameCount();
        b.maskTitle = s.titleCount();
        b.maskTerm = s.termCount();
        b.maskLine = s.lineCount();
        b.maskLabel = tr.labelCount;
        b.released = s.releasedCount();
        b.nameCandidates = new LinkedHashMap<String, Integer>(s.nameHits());

        int beyond = 0;
        for (TimelineParser.Segment g : b.segments) {
            if (g.endSec > tr.durationSec() + 60) {
                beyond++;
            }
        }
        put(b.warnings, "PREAMBLE_SKIPPED", tr.preambleLines + (tl == null ? 0 : tl.preambleLines));
        put(b.warnings, "TIME_NOT_SORTED", tr.timeNotSorted);
        put(b.warnings, "SEG_OVERLAP", tl == null ? 0 : tl.overlapCount);
        put(b.warnings, "SEG_BEYOND_END", beyond);
        put(b.warnings, "LABEL_RENAMED", tr.labelCount);
        b.digest = digest(tr, tl, sm);   // 가리기 전 정규화 내용 — 가림 단어·해제를 바꿔도 같은 값(중복 검사를 가림 단어로 피할 수 없다)
        return new MinutesParse(b);
    }

    private static void put(Map<String, Integer> m, String k, int n) {
        if (n > 0) {
            m.put(k, Integer.valueOf(n));
        }
    }

    private static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    /**
     * SHA-256(RULE_VER + <b>가리기 전</b> 정규화 내용을 정해진 순서로 이은 것). 가림 단어·해제 목록이 값에 들어가지 않는다 —
     * 미리보기와 확정 사이에 그것만 바뀌어도 PREVIEW_CHANGED 가 나지 않고, 같은 회의록을 가림 단어만 바꿔 다시 올려도 중복으로 잡힌다.
     * 이 값은 원문을 되짚는 데 쓰지 않는다(단방향 해시, 저장 열 64자). 제목·회의일은 넣지 않는다(미리보기에 없을 수 있다).
     */
    private static String digest(TranscriptParser.Result tr, TimelineParser.Result tl, SummaryParser.Result sm) {
        char sep = '\u0001';
        StringBuilder sb = new StringBuilder(MinutesMasker.RULE_VER).append(sep);
        for (TranscriptParser.Utterance u : tr.utterances) {
            sb.append(u.seqNo).append(sep).append(u.speakerNo).append(sep).append(u.startSec).append(sep)
                    .append(u.noise ? '1' : '0').append(sep).append(u.body).append(sep);
        }
        sb.append('\u0002');
        if (tl != null) {
            for (TimelineParser.Segment g : tl.segments) {
                sb.append(g.segNo).append(sep).append(g.startSec).append(sep).append(g.endSec).append(sep).append(g.keywords).append(sep);
                for (String it : g.items) {
                    sb.append(it).append(sep);
                }
                sb.append('\u0003');
            }
        }
        sb.append('\u0002');
        if (sm != null) {
            for (SummaryParser.Section sec : sm.sections) {
                sb.append(sec.kind.name()).append(sep).append(sec.sectionNo).append(sep).append(sec.title == null ? "" : sec.title).append(sep);
                for (String it : sec.items) {
                    sb.append(it).append(sep);
                }
                sb.append('\u0003');
            }
        }
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(Charset.forName("UTF-8")));
            StringBuilder hex = new StringBuilder(64);
            for (byte x : d) {
                hex.append(String.format("%02x", Integer.valueOf(x & 0xFF)));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
    }
}
