package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class SegmentLinkerTest {

    private static TimelineParser.Segment seg(int no, int s, int e) {
        return new TimelineParser.Segment(no, s, e, "", new ArrayList<String>(), no);
    }

    private static TranscriptParser.Utterance utt(int seq, int sec) {
        return new TranscriptParser.Utterance(seq, 1, sec, false, "가상 발언 " + seq);
    }

    @Test
    public void 구간_사이_빈_시간의_발언은_구간_밖이다() {
        List<TimelineParser.Segment> segs = Arrays.asList(seg(1, 0, 100), seg(2, 200, 300));
        List<TranscriptParser.Utterance> us = Arrays.asList(utt(1, 10), utt(2, 150), utt(3, 250), utt(4, 301));
        SegmentLinker.Link l = SegmentLinker.link(segs, us);
        assertEquals(Integer.valueOf(1), l.segNoOf(0));
        assertNull(l.segNoOf(1));
        assertEquals(Integer.valueOf(2), l.segNoOf(2));
        assertNull(l.segNoOf(3));
        assertEquals(2, l.outOfSegmentCnt());
        assertEquals(1, l.utterCnt(1));
        assertEquals(1, l.utterCnt(2));
        assertEquals(Integer.valueOf(3), l.firstSeq(2));
    }

    @Test
    public void 경계_시각은_앞_구간에_붙고_구간_순서는_시작_순으로_본다() {
        List<TimelineParser.Segment> segs = Arrays.asList(seg(2, 100, 200), seg(1, 0, 100));
        List<TranscriptParser.Utterance> us = Arrays.asList(utt(1, 100), utt(2, 101));
        SegmentLinker.Link l = SegmentLinker.link(segs, us);
        assertEquals(Integer.valueOf(1), l.segNoOf(0));
        assertEquals(Integer.valueOf(2), l.segNoOf(1));
        assertEquals(0, l.outOfSegmentCnt());
    }

    @Test
    public void 구간이_없으면_모든_발언이_구간_밖이다() {
        SegmentLinker.Link l = SegmentLinker.link(new ArrayList<TimelineParser.Segment>(), Arrays.asList(utt(1, 1), utt(2, 2)));
        assertEquals(2, l.outOfSegmentCnt());
        assertNull(l.firstSeq(1));
        assertEquals(0, l.utterCnt(1));
    }
}
