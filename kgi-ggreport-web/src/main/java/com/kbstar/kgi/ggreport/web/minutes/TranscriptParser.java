package com.kbstar.kgi.ggreport.web.minutes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 원문(클로바 노트 텍스트) 파서 — 설계 3-4.
 * 머리줄 {@code 참석자 N / MM:SS}(또는 {@code H:MM:SS}) 다음 줄들이 그 발언의 본문이다.
 * 머리줄은 파일 첫 줄이거나 앞줄이 빈 줄일 때만 인정한다(발언 끝의 "/ 12:30" 오인 방지).
 * 이름으로 바뀐 화자 표기는 글자를 버리고 "참석자 k" 번호만 붙인다(R14 — 이름·사번 짝짓기 금지).
 */
public final class TranscriptParser {
    public static final int MAX_UTTERANCES = 10000;
    /** 화자 번호 상한(SPEAKER_NO 열 크기). 이름으로 바뀐 표기에 붙이는 새 번호가 넘으면 422 LIMIT_SPEAKER. */
    public static final int MAX_SPEAKER_NO = 999;
    /** 본문이 빈 발언의 고정 본문(잡음으로 표시). */
    public static final String EMPTY_BODY = "(내용 없음)";
    static final String TIME = "(?:(\\d{1,2}):)?(\\d{1,3}):([0-5]\\d)";
    private static final Pattern HEADER = Pattern.compile("^(.{1,30}?)\\s*/\\s*" + TIME + "\\s*$");
    private static final Pattern PARTICIPANT = Pattern.compile("^참석자\\s*(\\d{1,3})$");
    private static final Pattern NOISE = Pattern.compile("^(NG|음+|어+|아+|네+|예+)[.!?…]*$", Pattern.CASE_INSENSITIVE);

    private TranscriptParser() {
    }

    public static final class Utterance {
        public final int seqNo;
        public final int speakerNo;
        public final int startSec;
        public final boolean noise;
        public final String body;
        /** 저장 전 미리보기에서 고친 발언인지(EDITED_YN). */
        public final boolean edited;

        public Utterance(int seqNo, int speakerNo, int startSec, boolean noise, String body) {
            this(seqNo, speakerNo, startSec, noise, body, false);
        }

        public Utterance(int seqNo, int speakerNo, int startSec, boolean noise, String body, boolean edited) {
            this.seqNo = seqNo;
            this.speakerNo = speakerNo;
            this.startSec = startSec;
            this.noise = noise;
            this.body = body;
            this.edited = edited;
        }
    }

    public static final class Result {
        public final List<Utterance> utterances;
        /** 이름 등으로 적혀 있어 "참석자 k" 로 바꾼 머리줄 수(MASK_LABEL_CNT). */
        public final int labelCount;
        /** 첫 머리줄 앞에서 버린 비어 있지 않은 줄 수(PREAMBLE_SKIPPED). */
        public final int preambleLines;
        /** 시각이 거꾸로 간 횟수(TIME_NOT_SORTED). */
        public final int timeNotSorted;

        Result(List<Utterance> u, int labelCount, int preambleLines, int timeNotSorted) {
            this.utterances = Collections.unmodifiableList(u);
            this.labelCount = labelCount;
            this.preambleLines = preambleLines;
            this.timeNotSorted = timeNotSorted;
        }

        public int speakerCount() {
            Set<Integer> s = new HashSet<Integer>();
            for (Utterance u : utterances) {
                s.add(Integer.valueOf(u.speakerNo));
            }
            return s.size();
        }

        public int noiseCount() {
            int n = 0;
            for (Utterance u : utterances) {
                if (u.noise) {
                    n++;
                }
            }
            return n;
        }

        /** 가장 늦은 발언 시작 시각(초) — 시각이 거꾸로 간 파일이어도 최댓값. */
        public int durationSec() {
            int max = 0;
            for (Utterance u : utterances) {
                max = Math.max(max, u.startSec);
            }
            return max;
        }
    }

    /** 시각 토큰 → 초. 시(時)가 있으면 분은 60 미만이어야 한다. 잘못이면 -1. */
    static int toSec(String h, String m, String s) {
        int hh = h == null ? 0 : Integer.parseInt(h);
        int mm = Integer.parseInt(m);
        int ss = Integer.parseInt(s);
        if (h != null && mm >= 60) {
            return -1;
        }
        return hh * 3600 + mm * 60 + ss;
    }

    /** 머리줄 모양인지(앞줄 조건은 보지 않는다). 시간대별 요약 칸에 원문을 올렸는지 알아볼 때 쓴다. */
    static boolean looksLikeHeader(String line) {
        Matcher m = HEADER.matcher(line);
        return m.matches() && toSec(m.group(2), m.group(3), m.group(4)) >= 0 && !sentenceLike(m.group(1));
    }

    /**
     * 머리줄 앞부분이 화자 표기가 아니라 문장 같은지 — '참석자 N' 이 아니고, 공백이 둘 이상이며 숫자·문장부호가 섞여 있으면
     * 본문 속 "다음 회의는 3월 5일 / 10:30" 같은 줄로 보고 머리줄로 삼지 않는다. 이름만 있는 표기(글자와 공백뿐)는 그대로 화자다.
     */
    static boolean sentenceLike(String label) {
        String l = label.trim().replaceAll("\\s+", " ");
        if (PARTICIPANT.matcher(l).matches()) {
            return false;
        }
        int spaces = 0;
        boolean mixed = false;
        for (int i = 0; i < l.length(); i++) {
            char c = l.charAt(i);
            if (c == ' ') {
                spaces++;
            } else if (!Character.isLetter(c)) {
                mixed = true;
            }
        }
        return spaces >= 2 && mixed;
    }

    public static Result parse(String[] lines, MinutesBudget budget) {
        final String slot = "transcript";
        List<Integer> headIdx = new ArrayList<Integer>();
        List<String> labels = new ArrayList<String>();
        List<Integer> secs = new ArrayList<Integer>();
        boolean prevBlankOrHeader = true;
        int maxN = 0;
        for (int i = 0; i < lines.length; i++) {
            budget.tick(slot, i + 1);
            String line = lines[i];
            boolean header = false;
            if (prevBlankOrHeader) {
                Matcher m = HEADER.matcher(line);
                if (m.matches()) {
                    int sec = toSec(m.group(2), m.group(3), m.group(4));
                    if (sec >= 0 && !sentenceLike(m.group(1))) {
                        header = true;
                        if (headIdx.size() >= MAX_UTTERANCES) {
                            throw MinutesException.unprocessable("LIMIT_UTTERANCES", slot, i + 1);
                        }
                        String label = m.group(1).trim().replaceAll("\\s+", " ");
                        headIdx.add(Integer.valueOf(i));
                        labels.add(label);
                        secs.add(Integer.valueOf(sec));
                        Matcher p = PARTICIPANT.matcher(label);
                        if (p.matches()) {
                            maxN = Math.max(maxN, Integer.parseInt(p.group(1)));
                        }
                    }
                }
            }
            prevBlankOrHeader = line.trim().isEmpty();   // 머리줄 바로 다음 줄은 머리줄이 아니다(본문 끝 "/ 12:30" 오인 방지)
        }
        if (headIdx.isEmpty()) {
            throw MinutesException.unprocessable("TRANSCRIPT_NO_UTTERANCE", slot, 0);
        }
        int preamble = 0;
        for (int i = 0; i < headIdx.get(0).intValue(); i++) {
            if (!lines[i].trim().isEmpty()) {
                preamble++;
            }
        }
        Map<String, Integer> renamed = new LinkedHashMap<String, Integer>();
        int nextK = maxN + 1;
        int labelCount = 0;
        int notSorted = 0;
        int prevSec = -1;
        List<Utterance> out = new ArrayList<Utterance>(headIdx.size());
        for (int j = 0; j < headIdx.size(); j++) {
            int from = headIdx.get(j).intValue() + 1;
            int to = j + 1 < headIdx.size() ? headIdx.get(j + 1).intValue() : lines.length;
            String label = labels.get(j);
            Matcher p = PARTICIPANT.matcher(label);
            int speaker;
            if (p.matches()) {
                speaker = Integer.parseInt(p.group(1));
            } else {
                Integer k = renamed.get(label);
                if (k == null) {
                    k = Integer.valueOf(nextK++);
                    renamed.put(label, k);
                }
                speaker = k.intValue();
                labelCount++;
            }
            if (speaker > MAX_SPEAKER_NO) {
                throw MinutesException.unprocessable("LIMIT_SPEAKER", slot, headIdx.get(j).intValue() + 1);
            }
            int sec = secs.get(j).intValue();
            if (prevSec >= 0 && sec < prevSec) {
                notSorted++;
            }
            prevSec = sec;
            String body = joinTrimmed(lines, from, to);
            if (body.trim().isEmpty()) {   // 본문이 빈 발언 — 고정 본문 + 잡음(빈 글이 저장 열 NOT NULL 을 건드리지 않게)
                out.add(new Utterance(j + 1, speaker, sec, true, EMPTY_BODY));
            } else {
                out.add(new Utterance(j + 1, speaker, sec, isNoise(body), body));
            }
        }
        return new Result(out, labelCount, preamble, notSorted);
    }

    private static String joinTrimmed(String[] lines, int from, int to) {
        int a = from;
        int b = to;
        while (a < b && lines[a].trim().isEmpty()) {
            a++;
        }
        while (b > a && lines[b - 1].trim().isEmpty()) {
            b--;
        }
        StringBuilder sb = new StringBuilder();
        for (int i = a; i < b; i++) {
            if (i > a) {
                sb.append('\n');
            }
            sb.append(lines[i]);
        }
        return sb.toString();
    }

    static boolean isNoise(String body) {
        String compact = body.replaceAll("\\s+", "");
        return compact.length() <= 2 || NOISE.matcher(body.trim()).matches();
    }
}
