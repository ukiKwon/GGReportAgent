package com.kbstar.kgi.ggreport.web.minutes;

import com.kbstar.kgi.ggreport.web.support.Pii;
import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 실제 내보내기 샘플(data/boardOfDirectors/, CP949) 회귀. {@code -Dminutes.realDir=<폴더>} 가 없으면 건너뛴다.
 * ⚠️ 샘플에는 실명이 있다 — 단언은 건수만 하고 본문·줄·이름을 출력하거나 메시지에 넣지 않는다.
 * 파일 구분: 이름에 summary 가 있으면 맞춤 요약, timetable 이 있으면 시간대별 요약, 그 밖의 txt 는 원문.
 * 실행: mvn -q -o test -Dtest=MinutesRealSampleTest -Dminutes.realDir=../data/boardOfDirectors
 */
public class MinutesRealSampleTest {

    private static byte[] read(File f) throws IOException {
        return Files.readAllBytes(f.toPath());
    }

    @Test
    public void 실제_샘플의_건수가_맞다() throws IOException {
        String dir = System.getProperty("minutes.realDir");
        Assume.assumeTrue(dir != null && !dir.trim().isEmpty());
        File[] files = new File(dir).listFiles();
        Assume.assumeTrue(files != null);

        byte[] transcript = null;
        byte[] timeline = null;
        byte[] summary = null;
        for (File f : files) {
            String n = f.getName().toLowerCase(Locale.ROOT);
            if (!n.endsWith(".txt")) {
                continue;
            }
            if (n.contains("summary")) {
                summary = read(f);
            } else if (n.contains("timetable")) {
                timeline = read(f);
            } else {
                transcript = read(f);
            }
        }
        Assume.assumeTrue(transcript != null && timeline != null && summary != null);

        // 테스트 전용 가상 이름 사전(실명 아님) — 사전 경로가 실제 샘플에서도 도는지 보고 건수만 출력한다(본문·이름은 출력하지 않는다).
        MinutesMasker masker = new MinutesMasker(Arrays.asList("가상일", "도담", "Zorin"));
        MinutesParse p = MinutesParse.parse(transcript, timeline, summary, null, masker, null, null);
        System.out.println("minutes-real-sample mask counts: pii=" + p.maskPii + " name=" + p.maskName
                + " title=" + p.maskTitle + " line=" + p.maskLine);

        assertEquals("원문 인코딩", MinutesText.ENC_CP949, p.encTranscript);
        assertEquals("발언 수", 59, p.utterCnt());
        assertEquals("구간 수", 10, p.segCnt());
        int topics = 0;
        int todos = 0;
        for (SummaryParser.Section s : p.sections) {
            if (s.kind == SummaryParser.Kind.TOPIC) {
                topics += s.items.size();
            } else if (s.kind == SummaryParser.Kind.TODO) {
                todos += s.items.size();
            }
        }
        assertEquals("주요 주제 항목 수", 4, topics);
        assertEquals("다음 할 일 항목 수", 4, todos);

        int leaks = 0;
        for (TranscriptParser.Utterance u : p.utterances) {
            if (!Pii.scanExternal(u.body).isEmpty()) {
                leaks++;
            }
        }
        assertEquals("가림 뒤에도 개인정보 검사에 걸리는 발언 수", 0, leaks);
        assertTrue("다이제스트", p.digest.length() == 64);
        List<String> none = new ArrayList<String>(p.warnings.keySet());
        assertTrue("경고 종류 수는 5 이하", none.size() <= 5);
    }
}
