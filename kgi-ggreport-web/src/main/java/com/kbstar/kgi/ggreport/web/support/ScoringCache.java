package com.kbstar.kgi.ggreport.web.support;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 선정 평가표 읽기 결과 기억(NEXT 121 하-2) — 항목 수 상한 + 무게 예산(무게 = 글자 수 + 문자열마다 24). 넘으면 가장 오래 안 쓴 것부터 버린다.
 * 항목 수만으로는 메모리가 묶이지 않는다(한 결과 최악 수백만 자: 행 200×칸 12×2000자 + 병합 칸).
 * 결과 null(읽었지만 표 없음)도 기억한다(무게 0, 항목 수에는 든다). 한 항목이 예산의 1/8 을 넘으면 기억하지 않는다. 메서드는 모두 synchronized.
 */
public final class ScoringCache {

    /** 기억해 둔 값 — getResult() 가 null 이면 '읽었지만 표 없음'. */
    public static final class Hit {
        private final ScoringTable.Result result;
        private final long weight;

        Hit(ScoringTable.Result result, long weight) {
            this.result = result;
            this.weight = weight;
        }

        public ScoringTable.Result getResult() { return result; }
    }

    private final int maxEntries;
    private final long budget;
    private final long entryMax;
    private final LinkedHashMap<String, Hit> map = new LinkedHashMap<String, Hit>(64, 0.75f, true);
    private long total;

    public ScoringCache(int maxEntries, long budgetChars) {
        if (maxEntries < 1 || budgetChars < 8) {
            throw new IllegalArgumentException("bad cache limits");
        }
        this.maxEntries = maxEntries;
        this.budget = budgetChars;
        this.entryMax = budgetChars / 8;
    }

    /** 없으면 null. 있으면 최근 사용으로 옮긴다. */
    public synchronized Hit get(String key) {
        return map.get(key);
    }

    /** 기억했으면 true. 한 항목이 예산의 1/8 을 넘으면 false(다음 요청이 다시 읽는다 — 파일당 30MB·파싱 시간 상한은 그대로). */
    public synchronized boolean put(String key, ScoringTable.Result r) {
        long w = weigh(r);
        remove(key);
        if (w > entryMax) {
            return false;
        }
        map.put(key, new Hit(r, w));
        total += w;
        Iterator<Map.Entry<String, Hit>> it = map.entrySet().iterator();
        while ((map.size() > maxEntries || total > budget) && it.hasNext()) {
            Map.Entry<String, Hit> e = it.next();
            if (e.getKey().equals(key)) {
                continue;   // 방금 넣은 것(맨 뒤)은 남긴다 — w <= entryMax <= budget 이라 여기까지 오지 않는다
            }
            total -= e.getValue().weight;
            it.remove();
        }
        return true;
    }

    synchronized int size() { return map.size(); }

    synchronized long totalChars() { return total; }

    private void remove(String key) {
        Hit old = map.remove(key);
        if (old != null) {
            total -= old.weight;
        }
    }

    /** 무게 = 글자 수 + 문자열마다 24(String 객체 부담, 빈 칸도 센다). 행·병합 칸·후보 표 머리를 모두 센다. */
    static long weigh(ScoringTable.Result r) {
        if (r == null) {
            return 0;
        }
        long w = 0;
        if (r.getRows() != null) {
            for (List<String> row : r.getRows()) {
                if (row != null) {
                    for (String s : row) { w += len(s); }
                }
            }
        }
        if (r.getCells() != null) {
            for (ScoringTable.Cell c : r.getCells()) { w += len(c == null ? null : c.getText()); }
        }
        if (r.getCandidateHeads() != null) {
            for (String h : r.getCandidateHeads()) { w += len(h); }
        }
        return w;
    }

    private static long len(String s) {
        return 24L + (s == null ? 0 : s.length());
    }
}
