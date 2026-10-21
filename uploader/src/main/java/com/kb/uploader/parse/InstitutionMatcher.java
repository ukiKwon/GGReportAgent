package com.kb.uploader.parse;

import com.kb.uploader.domain.Institution;
import com.kb.uploader.domain.UploadedFile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 문서 본문에서 기관명을 찾는다.
 * 1) 기관 테이블에 등록된 이름이 본문에 몇 번 나오는지 센다 (긴 이름 우선, 동점이면 먼저 나온 것)
 * 2) 없으면 "발주기관: OOO" 같은 레이블에서 추출
 * 3) 그래도 없으면 기관 접미사(대학교·병원·공단 등)가 붙은 가장 잦은 단어
 */
@Component
public class InstitutionMatcher {

    public static final String UNKNOWN_NAME = "기관미상";

    private static final Pattern LABEL = Pattern.compile(
        "(?:발\\s*주\\s*기\\s*관|수\\s*요\\s*기\\s*관|주\\s*관\\s*기\\s*관|발\\s*주\\s*처|기\\s*관\\s*명|제안요청기관)"
        + "\\s*[:：|]?\\s*([가-힣A-Za-z0-9·()]{2,30})");

    private static final Pattern ORG_SUFFIX = Pattern.compile(
        "([가-힣]{2,20}(?:대학교병원|대학병원|대학교|병원|특별시|광역시|특별자치시|특별자치도|시청|도청|군청|구청"
        + "|공사|공단|진흥원|연구원|재단|위원회|개발원|정보원|관리원|평가원|센터))");

    public static final class Match {
        private final String name;
        private final String category;
        private final boolean registered;

        Match(String name, String category, boolean registered) {
            this.name = name;
            this.category = category;
            this.registered = registered;
        }

        public String getName() { return name; }
        public String getCategory() { return category; }
        public boolean isRegistered() { return registered; }
    }

    public Match match(String text, List<Institution> institutions) {
        if (text == null) text = "";
        Match registered = matchRegistered(text, institutions);
        if (registered != null) return registered;

        Matcher m = LABEL.matcher(text);
        if (m.find()) {
            String name = trimParen(m.group(1));
            if (name.length() >= 2) {
                return new Match(name, categoryOf(name, institutions), false);
            }
        }

        String frequent = mostFrequent(ORG_SUFFIX, text);
        if (frequent != null) {
            return new Match(frequent, categoryOf(frequent, institutions), false);
        }
        return new Match(UNKNOWN_NAME, UploadedFile.UNKNOWN_CATEGORY, false);
    }

    private Match matchRegistered(String text, List<Institution> institutions) {
        List<Institution> sorted = new ArrayList<>(institutions);
        sorted.sort(Comparator.comparingInt((Institution i) -> i.getName().length()).reversed());

        boolean[] covered = new boolean[text.length()];
        Institution best = null;
        int bestCount = 0;
        int bestFirst = Integer.MAX_VALUE;

        for (Institution inst : sorted) {
            String name = inst.getName();
            if (name == null || name.trim().length() < 2) continue;
            int count = 0;
            int first = -1;
            int from = 0;
            int idx;
            while ((idx = text.indexOf(name, from)) >= 0) {
                if (!isCovered(covered, idx, name.length())) {
                    count++;
                    if (first < 0) first = idx;
                    for (int k = idx; k < idx + name.length(); k++) covered[k] = true;
                }
                from = idx + name.length();
            }
            if (count > bestCount || (count == bestCount && count > 0 && first < bestFirst)) {
                best = inst;
                bestCount = count;
                bestFirst = first;
            }
        }
        return best == null ? null : new Match(best.getName(), best.getCategory(), true);
    }

    private static boolean isCovered(boolean[] covered, int start, int len) {
        for (int k = start; k < start + len; k++) {
            if (covered[k]) return true;
        }
        return false;
    }

    private static String categoryOf(String name, List<Institution> institutions) {
        for (Institution i : institutions) {
            if (i.getName().equals(name)) return i.getCategory();
        }
        return UploadedFile.UNKNOWN_CATEGORY;
    }

    private static String mostFrequent(Pattern p, String text) {
        Map<String, Integer> counts = new HashMap<>();
        Map<String, Integer> firstPos = new HashMap<>();
        Matcher m = p.matcher(text);
        while (m.find()) {
            String k = m.group(1);
            counts.merge(k, 1, Integer::sum);
            firstPos.putIfAbsent(k, m.start());
        }
        String best = null;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (best == null
                || e.getValue() > counts.get(best)
                || (e.getValue().equals(counts.get(best)) && firstPos.get(e.getKey()) < firstPos.get(best))) {
                best = e.getKey();
            }
        }
        return best;
    }

    private static String trimParen(String s) {
        int p = s.indexOf('(');
        return (p > 1 ? s.substring(0, p) : s).trim();
    }
}
