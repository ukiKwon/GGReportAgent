package com.kbstar.kgi.ggreport.web.docfill;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 규칙별 처리 결과. <b>조용히 넘어가지 않는 것</b>이 이 보고서의 존재 이유다 — 키워드를 못 찾았거나
 * 엑셀 값이 비었는데 문서만 말끔히 나가면, 제출 직전까지 아무도 빈칸을 모른다.
 */
public final class FillReport {

    public enum Status {
        /** 전부 기입했다. */
        FILLED,
        /** 일부만 기입했다(나머지는 충돌·미지원). */
        PARTIAL,
        /** 이미 같은 값이 적혀 있어 손대지 않았다(재실행 안전). */
        ALREADY_FILLED,
        /** 기입할 자리에 다른 내용이 있어 보호했다. */
        CONFLICT,
        /** 문서에서 키워드를 못 찾았다. */
        KEYWORD_NOT_FOUND,
        /** 엑셀에서 값을 못 가져왔다(시트·머리글·행 없음, 빈 값, 오류값). */
        SOURCE_PROBLEM,
        /** 키워드는 찾았지만 지원하지 않는 위치라 건너뛰었다(하이퍼링크 안 등). */
        UNSUPPORTED
    }

    /** 규칙 한 줄의 결과. */
    public static final class Entry {
        private final String rule;
        private final String keyword;
        private String value;
        private int filled;
        private int already;
        private int conflict;
        private int unsupported;
        private int found;
        private String sourceProblem;
        private final List<String> warnings = new ArrayList<String>();

        Entry(String rule, String keyword) {
            this.rule = rule;
            this.keyword = keyword;
        }

        void value(String v) { this.value = v; }
        void sourceProblem(String p) { this.sourceProblem = p; }
        void foundOne() { found++; }
        void filled() { filled++; }
        void already() { already++; }
        void conflict() { conflict++; }
        void unsupported() { unsupported++; }
        void warn(String w) { warnings.add(w); }

        public String rule() { return rule; }
        public String keyword() { return keyword; }
        public String value() { return value; }
        public int found() { return found; }
        public int filledCount() { return filled; }
        public int alreadyCount() { return already; }
        public int conflictCount() { return conflict; }
        public int unsupportedCount() { return unsupported; }
        public String sourceProblem() { return sourceProblem; }
        public List<String> warnings() { return Collections.unmodifiableList(warnings); }

        public Status status() {
            if (sourceProblem != null) return Status.SOURCE_PROBLEM;
            if (found == 0) return Status.KEYWORD_NOT_FOUND;
            int bad = conflict + unsupported;
            if (filled > 0 && bad > 0) return Status.PARTIAL;
            if (filled > 0) return Status.FILLED;
            if (conflict > 0) return Status.CONFLICT;
            if (unsupported > 0) return Status.UNSUPPORTED;
            return Status.ALREADY_FILLED;
        }

        @Override
        public String toString() {
            return status() + " " + rule
                    + (sourceProblem != null ? " — " + sourceProblem : "")
                    + " (찾음 " + found + ", 기입 " + filled + ", 기존 " + already
                    + ", 충돌 " + conflict + ", 미지원 " + unsupported + ")"
                    + (warnings.isEmpty() ? "" : " " + warnings);
        }
    }

    private final List<Entry> entries = new ArrayList<Entry>();

    Entry add(String rule, String keyword) {
        Entry e = new Entry(rule, keyword);
        entries.add(e);
        return e;
    }

    public List<Entry> entries() { return Collections.unmodifiableList(entries); }

    /** 모든 규칙이 기입됐거나 이미 기입돼 있는가(= 사람이 볼 문제가 없는가). */
    public boolean allOk() {
        for (Entry e : entries) {
            Status s = e.status();
            if (s != Status.FILLED && s != Status.ALREADY_FILLED) return false;
        }
        return true;
    }

    public Entry of(String keyword) {
        for (Entry e : entries) if (e.keyword().equals(keyword)) return e;
        return null;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        for (Entry e : entries) sb.append(e).append('\n');
        return sb.toString();
    }
}
