package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.NoticeRoundLog;
import com.kbstar.kgi.ggreport.web.dto.NoticeRoundIn;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 공고 상태 기록(037)의 입력 검사·회차 넘어감 판정. DB 없이 시험한다. 오류 문구는 design-reviewer 11-16 규격, 내부 정보·입력값 없음. */
final class NoticeRoundRules {

    static final String IN_PROGRESS = "IN_PROGRESS";
    static final String CLOSED = "CLOSED";
    static final String DELAYED = "DELAYED";
    static final Set<String> STATUSES = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(IN_PROGRESS, CLOSED, DELAYED)));
    static final int OPINION_MAX = 500;
    static final int NEXT_CHECK_MAX_DAYS = 366;   // 팀 결정(열린 질문 3) — 끝없는 대기로 미처리에서 영영 빠지는 것을 막는다
    static final int AUTO_DAYS_MAX = 36600;
    static final String FORMAT = "요청 형식이 올바르지 않습니다. 화면을 새로 불러온 뒤 다시 저장하세요.";
    static final String OPINION_PII = "의견에 주민등록번호·전화번호 같은 개인정보를 적을 수 없습니다.";
    static final Map<String, String> BASIS;
    static final Map<String, String> AUTO;
    private static final Pattern YMD = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern LOOSE_YMD = Pattern.compile("^([0-9]{4})\\s*[-./]\\s*([0-9]{1,2})\\s*[-./]\\s*([0-9]{1,2})(?:[T ].*)?$");

    static {
        Map<String, String> b = new HashMap<String, String>();
        b.put("notice", "NOTICE");
        b.put("cycle", "CYCLE");
        b.put("expiry", "EXPIRY");
        BASIS = Collections.unmodifiableMap(b);
        Map<String, String> a = new HashMap<String, String>();
        a.put("before", "BEFORE");
        a.put("receiving", "RECEIVING");
        a.put("deadline_unknown", "DEADLINE_UNKNOWN");
        a.put("deadline_passed", "DEADLINE_PASSED");
        a.put("overdue", "OVERDUE");
        AUTO = Collections.unmodifiableMap(a);
    }

    private NoticeRoundRules() {
    }

    static final class Parsed {
        Integer roundSeq;
        int baseRev;
        String status;
        String opinion;
        String nextCheck;
        String dueDate;
        String dueBasis;
        int dueConfirmed;
        String autoKind;
        Integer autoDays;
    }

    /** 기관 자료가 다음 회차로 넘어갔나 — 둘 다 있고 지금 값이 기준보다 뒤일 때만. NULL·같음·앞당김은 false(닫지 않음). */
    static boolean advanced(String anchor, String current) {
        LocalDate a = looseDate(anchor);
        LocalDate c = looseDate(current);
        return a != null && c != null && c.isAfter(a);
    }

    /**
     * LAST_BID 같은 날짜 문자열을 날짜로 읽는다 — 숫자 3묶음(연4-월1~2-일1~2)을 '-'·'.'·'/' 로 구분한 것(2022-10-18, 2022.10.18, 2024-7-24),
     * 뒤에 시각이 붙어도 된다(T 또는 공백 뒤). 없는 날짜(2026-02-30)·읽을 수 없는 값(미상)은 null — 비교가 안 되면 '넘어감 아님'으로 본다.
     */
    static LocalDate looseDate(String s) {
        String t = trim(s);
        if (t == null) {
            return null;
        }
        Matcher m = LOOSE_YMD.matcher(t);
        if (!m.matches()) {
            return null;
        }
        try {
            return LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
        } catch (DateTimeException e) {
            return null;
        }
    }

    static boolean sameJudgment(NoticeRoundLog cur, Parsed p) {
        return p.status.equals(cur.getStatusCd())
                && Objects.equals(p.opinion, trim(cur.getOpinion()))
                && Objects.equals(p.nextCheck, trim(cur.getNextCheckDate()));
    }

    static Parsed parse(NoticeRoundIn in, LocalDate today) {
        if (in == null) {
            throw bad("body", FORMAT);
        }
        Parsed p = new Parsed();
        Integer base = in.getBaseRevNo();
        Integer seq = in.getRoundSeq();
        if (base == null || base < 0 || (seq != null && seq < 1) || ((seq == null) != (base == 0))) {
            throw bad("base_rev_no", FORMAT);
        }
        p.roundSeq = seq;
        p.baseRev = base;

        String st = trim(in.getStatusCd());
        if (st == null || !STATUSES.contains(st)) {
            throw bad("status_cd", "판정을 하나 고르세요.");
        }
        p.status = st;

        p.opinion = opinion(in.getOpinion());
        if (p.opinion == null && CLOSED.equals(st)) {
            throw bad("opinion", "공고 종료로 적을 때는 의견이 필요합니다. 무엇을 보고 끝났다고 판단했는지 적으세요.");
        }
        if (p.opinion == null && DELAYED.equals(st)) {
            throw bad("opinion", "지연·재공고 대기로 적을 때는 의견이 필요합니다. 왜 늦어지는지 적으세요.");
        }

        String nc = CLOSED.equals(st) ? null : trim(in.getNextCheckDate());   // 공고 종료는 다음 확인일을 두지 않는다(화면도 숨김)
        if (nc != null) {
            LocalDate d = date(nc);
            if (d == null || !d.isAfter(today)) {
                throw bad("next_check_date", "다음 확인일은 내일 이후 날짜로 고르세요.");
            }
            if (d.isAfter(today.plusDays(NEXT_CHECK_MAX_DAYS))) {
                throw bad("next_check_date", "다음 확인일은 1년 안의 날짜로 고르세요.");
            }
        } else if (DELAYED.equals(st)) {
            throw bad("next_check_date", "지연·재공고 대기는 다음 확인일이 필요합니다. 다시 확인할 날을 고르세요.");
        }
        p.nextCheck = nc;

        NoticeRoundIn.Snapshot s = in.getSnapshot();
        if (s != null) {
            String dd = trim(s.getDueDate());
            if (dd != null && date(dd) == null) {
                throw bad("snapshot.due_date", FORMAT);
            }
            p.dueDate = dd;
            String b = trim(s.getDueBasis());
            if (b != null && !BASIS.containsKey(b)) {
                throw bad("snapshot.due_basis", FORMAT);
            }
            p.dueBasis = b == null ? null : BASIS.get(b);
            p.dueConfirmed = Boolean.TRUE.equals(s.getDueConfirmed()) ? 1 : 0;
            String k = trim(s.getAutoKind());
            if (k != null && !AUTO.containsKey(k)) {
                throw bad("snapshot.auto_kind", FORMAT);
            }
            p.autoKind = k == null ? null : AUTO.get(k);
            Integer days = s.getAutoDays();
            if (days != null && Math.abs((long) days) > AUTO_DAYS_MAX) {
                throw bad("snapshot.auto_days", FORMAT);
            }
            p.autoDays = days;
        }
        return p;
    }

    /**
     * 앞뒤 공백 제거, 줄바꿈 \n 통일. 글자 검사는 {@code HeadText.requireLine} 과 같은 기준 — 코드 포인트마다 제어(CONTROL)·서식(FORMAT)·
     * 줄/문단 구분자·짝 없는 서로게이트를 거부하되 \n·\t 만 허용한다. 500자(코드 포인트 — Oracle CHAR·utf8mb4 와 같은 셈).
     * 개인정보(주민번호·전화번호 등, {@link Pii#scan})가 하나라도 있으면 400 — 추가 전용 표라 앱으로 지울 수 없어서다(security 11-16 중-3).
     * 오류에 입력값·검출값은 싣지 않는다. 비면 null.
     */
    static String opinion(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replace("\r\n", "\n").replace('\r', '\n').trim();
        if (s.isEmpty()) {
            return null;
        }
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            if (cp == '\n' || cp == '\t') {
                continue;
            }
            int ty = Character.getType(cp);
            if (ty == Character.CONTROL || ty == Character.FORMAT || ty == Character.LINE_SEPARATOR
                    || ty == Character.PARAGRAPH_SEPARATOR || ty == Character.SURROGATE) {
                throw bad("opinion", "의견에 쓸 수 없는 문자가 있습니다.");
            }
        }
        int n = s.codePointCount(0, s.length());
        if (n > OPINION_MAX) {
            throw bad("opinion", "의견은 500자까지 적을 수 있습니다(지금 " + n + "자).");
        }
        if (!Pii.scanLoose(s).isEmpty()) {   // 전각 숫자·'.'·공백 구분자 우회까지(HeadForbidden 과 같은 검사)
            throw bad("opinion", OPINION_PII);
        }
        return s;
    }

    static LocalDate date(String s) {
        if (s == null || !YMD.matcher(s).matches()) {
            return null;
        }
        try {
            return LocalDate.parse(s);   // ISO_LOCAL_DATE 는 STRICT — 2026-02-30 거부
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    static String trim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    static ApiException bad(String field, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "INVALID");
        d.put("field", field);
        d.put("message", message);
        return ApiException.withDetail(400, d);
    }
}
