package com.kbstar.kgi.ggreport.web.minutes;

import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

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
    public static final int EDIT_MAX_CHARS = 20000;
    /** 화자 번호 → 정규화한 역할 라벨(빈 라벨 제외). */
    public final Map<Integer, String> labels;
    /** 저장 전 수정분(라벨·발언)의 확인값. 수정이 없으면 null. */
    public final String editsDigest;
    public final int editedCnt;

    /** 저장 전 수정분 — 받은 그대로(정규화 전). 서비스가 모양(번호·개수)만 걸러 넘긴다. */
    public static final class Edits {
        public static final Edits NONE = new Edits(null, null);
        final Map<Integer, String> labels;
        final Map<Integer, String> utters;

        public Edits(Map<Integer, String> labels, Map<Integer, String> utters) {
            this.labels = labels == null ? Collections.<Integer, String>emptyMap() : new TreeMap<Integer, String>(labels);
            this.utters = utters == null ? Collections.<Integer, String>emptyMap() : new TreeMap<Integer, String>(utters);
        }
    }

    private MinutesParse(Builder b) {
        this.labels = Collections.unmodifiableMap(b.labels);
        this.editsDigest = b.editsDigest;
        this.editedCnt = b.editedCnt;
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
        Map<Integer, String> labels = new TreeMap<Integer, String>();
        String editsDigest;
        int editedCnt;
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
        return parse(transcript, timeline, summary, title, masker, terms, release, Edits.NONE, budget);
    }

    public static MinutesParse parse(byte[] transcript, byte[] timeline, byte[] summary, String title,
                                     MinutesMasker masker, Collection<String> terms, Collection<String> release,
                                     Edits edits, MinutesBudget budget) {
        Builder b = new Builder();
        MinutesText.Prepared pt = MinutesText.prepare(transcript, "transcript");
        b.encTranscript = pt.encoding;
        TranscriptParser.Result tr = TranscriptParser.parse(pt.lines, budget);
        Map<Integer, String> editTexts = prepareEdits(tr, edits.utters, masker, terms, release, budget);   // 가리기 전에 바꿔 끼운다

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
        b.labels = prepareLabels(tr, edits.labels, masker, s, budget);
        if (title != null) {
            String t = MinutesText.normalizeText(title, "title").replace('\n', ' ').trim();
            b.title = clip(s.mask(t), TITLE_MAX);
        }
        for (TranscriptParser.Utterance u : tr.utterances) {
            String e = editTexts.get(Integer.valueOf(u.seqNo));
            b.utterances.add(new TranscriptParser.Utterance(u.seqNo, u.speakerNo, u.startSec, u.noise,
                    s.mask(e == null ? u.body : e), e != null));
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
        b.digest = digest(tr, tl, sm);   // 가리기 전 정규화 내용 — 가림 단어·해제를 바꿔도 같은 값(중복 검사를 가림 단어로 피할 수 없다). 수정분 제외
        b.editedCnt = editTexts.size();
        b.editsDigest = editsDigest(b.labels, editTexts);
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
        return sha256Hex(sb.toString());
    }

    /**
     * 미리보기 확인값 = H(내용 확인값 + 정규화·정렬한 가림 단어 + 해제 목록). 저장 때 이 값이 같아야 한다 —
     * 미리보기 뒤에 해제를 늘리거나 가림 단어를 빼고 저장하지 못하게(PREVIEW_CHANGED). 중복 검사·CONTENT_DIGEST 는 digest 그대로.
     * 정규화는 마스커와 같다({@link MinutesText#fold} 후 소문자) — 같은 가림 결과면 같은 값이다.
     */
    public static String previewDigest(String digest, Collection<String> terms, Collection<String> release) {
        char sep = '\u0001';
        StringBuilder sb = new StringBuilder("p1:").append(digest).append(sep);
        for (String t : normalizedSorted(terms)) {
            sb.append(t).append(sep);
        }
        sb.append('\u0002');
        for (String t : normalizedSorted(release)) {
            sb.append(t).append(sep);
        }
        return sha256Hex(sb.toString());
    }

    private static List<String> normalizedSorted(Collection<String> in) {
        TreeSet<String> s = new TreeSet<String>();
        if (in != null) {
            for (String x : in) {
                if (x == null) {
                    continue;
                }
                String n = MinutesText.fold(x).toLowerCase(Locale.ROOT).trim();
                if (!n.isEmpty()) {
                    s.add(n);
                }
            }
        }
        return new ArrayList<String>(s);
    }

    private static Map<Integer, String> prepareEdits(TranscriptParser.Result tr, Map<Integer, String> raw, MinutesMasker masker,
                                                     Collection<String> terms, Collection<String> release, MinutesBudget budget) {
        Map<Integer, String> out = new TreeMap<Integer, String>();
        if (raw.isEmpty()) {
            return out;
        }
        Map<Integer, String> orig = new HashMap<Integer, String>();
        for (TranscriptParser.Utterance u : tr.utterances) {
            orig.put(Integer.valueOf(u.seqNo), u.body);
        }
        MinutesMasker.Session base = masker.newSession(terms, release, budget);   // 기준 가림 — 본 세션의 건수·적중에 섞이지 않게 따로
        for (Map.Entry<Integer, String> e : raw.entrySet()) {
            int seq = e.getKey().intValue();
            String o = orig.get(e.getKey());
            if (o == null) {
                throw new MinutesException(422, "EDIT_SEQ_UNKNOWN", "edit", 0, seq, null);
            }
            String t;
            try {
                t = MinutesText.normalizeText(e.getValue(), "edit").trim();
            } catch (MinutesException x) {
                throw new MinutesException(x.getStatus(), x.getCode(), "edit", x.getLine(), seq, null);
            }
            if (t.isEmpty() || t.length() > EDIT_MAX_CHARS) {
                throw new MinutesException(422, "LIMIT_EDIT_LEN", "edit", 0, seq, null);
            }
            String[] ls = t.split("\n", -1);
            for (int i = 0; i < ls.length; i++) {
                if (ls[i].length() > MinutesText.MAX_LINE_CHARS) {
                    throw new MinutesException(422, "LIMIT_LINE", "edit", i + 1, seq, null);
                }
            }
            // 가림 토큰 보존 — 실수로 지우는 것을 막는다(종류별 개수 검사 — 옮기기는 막지 않음).
            // 기준과 고친 글을 같은 base 세션(같은 terms·release)으로 가려 비교한다 — 고친 뒤 추가한 가릴 단어나
            // 풀어 둔 '가리지 않기'가 지우지 않은 자리를 지운 것으로 잡히지 않게. 저장 본문은 본 세션이 따로 가린다.
            Map<String, Integer> removed = MinutesMasker.removedTokens(base.mask(o), base.mask(t));
            if (!removed.isEmpty()) {
                throw new MinutesException(422, "EDIT_MASK_REMOVED", "edit", 0, seq, removed);
            }
            if (!t.equals(o)) {   // 원문과 같으면 고친 것으로 치지 않는다
                out.put(e.getKey(), t);
            }
        }
        return out;
    }

    private static Map<Integer, String> prepareLabels(TranscriptParser.Result tr, Map<Integer, String> raw, MinutesMasker masker,
                                                      MinutesMasker.Session s, MinutesBudget budget) {
        Map<Integer, String> out = new TreeMap<Integer, String>();
        if (raw.isEmpty()) {
            return out;
        }
        Set<Integer> speakers = new HashSet<Integer>();
        for (TranscriptParser.Utterance u : tr.utterances) {
            speakers.add(Integer.valueOf(u.speakerNo));
        }
        for (Map.Entry<Integer, String> e : raw.entrySet()) {
            int no = e.getKey().intValue();
            if (!speakers.contains(e.getKey())) {
                throw new MinutesException(422, "LABEL_SPEAKER_UNKNOWN", "speaker_label", 0, no, null);
            }
            String l = SpeakerLabels.normalize(e.getValue(), no);
            if (l == null) {
                continue;
            }
            SpeakerLabels.requireClean(masker, l, no, budget);
            if (s.hitsTerm(l)) {
                throw SpeakerLabels.invalid(no, "term");
            }
            out.put(e.getKey(), l);
        }
        return out;
    }

    /** 수정분 확인값 — 가리기 전 정규화 라벨·수정글. 없으면 null. 화면이 본 결과와 저장 결과를 맞추는 용도(보안 검사는 저장 때 전부 다시 한다). */
    private static String editsDigest(Map<Integer, String> labels, Map<Integer, String> edits) {
        if (labels.isEmpty() && edits.isEmpty()) {
            return null;
        }
        char sep = '\u0001';
        StringBuilder sb = new StringBuilder("e1:").append(MinutesMasker.RULE_VER).append(sep);
        for (Map.Entry<Integer, String> e : labels.entrySet()) {
            sb.append(e.getKey()).append(sep).append(e.getValue()).append(sep);
        }
        sb.append('\u0002');
        for (Map.Entry<Integer, String> e : edits.entrySet()) {
            sb.append(e.getKey()).append(sep).append(e.getValue()).append(sep);
        }
        return sha256Hex(sb.toString());
    }

    private static String sha256Hex(String in) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(in.getBytes(Charset.forName("UTF-8")));
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
