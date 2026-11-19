package com.kbstar.kgi.ggreport.web.minutes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 시간 구간 ↔ 발언 연결 — 설계 3-4. 저장하지 않고 읽을 때 계산한다.
 * 발언 시작 시각 t 가 {@code start ≤ t ≤ end} 인 첫 구간(시작 순)에 붙는다. 어느 구간에도 없으면 '구간 밖'(null).
 */
public final class SegmentLinker {
    private SegmentLinker() {
    }

    public static final class Link {
        private final Integer[] segNoByUtter;
        private final Map<Integer, Integer> firstSeq;
        private final Map<Integer, Integer> utterCnt;
        private final int outOfSegmentCnt;

        Link(Integer[] segNoByUtter, Map<Integer, Integer> firstSeq, Map<Integer, Integer> utterCnt, int out) {
            this.segNoByUtter = segNoByUtter;
            this.firstSeq = firstSeq;
            this.utterCnt = utterCnt;
            this.outOfSegmentCnt = out;
        }

        /** 발언 목록의 index 번째 발언이 속한 구간 번호. 구간 밖이면 null. */
        public Integer segNoOf(int utterIndex) {
            return segNoByUtter[utterIndex];
        }

        /** 구간의 첫 발언 seq_no. 발언이 없으면 null. */
        public Integer firstSeq(int segNo) {
            return firstSeq.get(Integer.valueOf(segNo));
        }

        public int utterCnt(int segNo) {
            Integer n = utterCnt.get(Integer.valueOf(segNo));
            return n == null ? 0 : n.intValue();
        }

        public int outOfSegmentCnt() {
            return outOfSegmentCnt;
        }
    }

    public static Link link(List<TimelineParser.Segment> segments, List<TranscriptParser.Utterance> utterances) {
        List<TimelineParser.Segment> sorted = new ArrayList<TimelineParser.Segment>(segments);
        Collections.sort(sorted, new Comparator<TimelineParser.Segment>() {
            @Override
            public int compare(TimelineParser.Segment a, TimelineParser.Segment b) {
                return a.startSec < b.startSec ? -1 : (a.startSec == b.startSec ? 0 : 1);
            }
        });
        Integer[] by = new Integer[utterances.size()];
        Map<Integer, Integer> first = new HashMap<Integer, Integer>();
        Map<Integer, Integer> cnt = new HashMap<Integer, Integer>();
        int out = 0;
        for (int i = 0; i < utterances.size(); i++) {
            TranscriptParser.Utterance u = utterances.get(i);
            Integer hit = null;
            for (TimelineParser.Segment s : sorted) {
                if (s.startSec <= u.startSec && u.startSec <= s.endSec) {
                    hit = Integer.valueOf(s.segNo);
                    break;
                }
            }
            by[i] = hit;
            if (hit == null) {
                out++;
            } else {
                if (!first.containsKey(hit)) {
                    first.put(hit, Integer.valueOf(u.seqNo));
                }
                Integer c = cnt.get(hit);
                cnt.put(hit, Integer.valueOf(c == null ? 1 : c.intValue() + 1));
            }
        }
        return new Link(by, first, cnt, out);
    }
}
