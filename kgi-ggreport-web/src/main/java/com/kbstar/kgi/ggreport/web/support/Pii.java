package com.kbstar.kgi.ggreport.web.support;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 개인정보 검출 — Python {@code agent/orchestrator/pii.py} 의 이관본.
 *
 * <p><b>결정적 정규식만 쓴다(LLM 이 아니다).</b> 그리고 <b>검출값을 마스킹해서</b>
 * 보고한다 — 검사 결과 자체가 개인정보 2차 유출 경로가 되면 안 된다.
 *
 * <p>⚠️ <b>주민등록번호와 겹치는 휴대폰 매치는 버린다.</b> 주민번호 뒷자리
 * ({@code 1~4} 로 시작하는 7자리)가 휴대폰 패턴에 걸려 <b>한 값이 두 번</b> 보고되기
 * 때문이다. 원본이 스팬 겹침을 검사하는 이유가 그것이고, 여기서도 같게 옮겼다.
 */
public final class Pii {

    private static final Pattern MOBILE =
            Pattern.compile("(?<!\\d)(01[016789])[-\\s]?(\\d{3,4})[-\\s]?(\\d{4})(?!\\d)");
    private static final Pattern RRN =
            Pattern.compile("(?<!\\d)(\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))[-\\s]?([1-4]\\d{6})(?!\\d)");
    private static final Pattern EMAIL = Pattern.compile(
            "([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})");
    private static final Pattern FOREIGN =
            Pattern.compile("(?<!\\d)(\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))[-\\s]?([5-8]\\d{6})(?!\\d)");
    private static final Pattern CARD =
            Pattern.compile("(?<!\\d)(\\d{4})([- ])(\\d{4})\\2(\\d{4})\\2(\\d{4})(?!\\d)");

    private Pii() {
    }

    /** 한 건. {@code value} 는 <b>이미 마스킹된</b> 값이다. */
    public static final class Finding {
        private final String kind;
        private final String value;

        Finding(String kind, String value) {
            this.kind = kind;
            this.value = value;
        }

        public String getKind()  { return kind; }
        public String getValue() { return value; }

        @Override
        public String toString() {
            return kind + "=" + value;
        }
    }

    /**
     * 검출 순서 — 주민등록번호 → 휴대폰 → 이메일 → (신규) 외국인등록번호 → 카드번호.
     * 앞의 셋은 원본과 같다. 화면이 목록을 그대로 뿌리므로 순서가 곧 표시 순서다.
     * 숫자 패턴은 앞뒤가 숫자이면 일치로 보지 않는다(긴 숫자열 속 오탐 방지).
     */
    public static List<Finding> scan(String text) {
        List<Finding> found = new ArrayList<Finding>();
        if (text == null || text.isEmpty()) {
            return found;
        }

        // 주민·외국인등록번호 스팬 — 아래 휴대폰·카드 검사에서 겹침을 판정한다.
        Set<int[]> spans = new LinkedHashSet<int[]>();
        Matcher rrn = RRN.matcher(text);
        while (rrn.find()) {
            spans.add(new int[]{rrn.start(), rrn.end()});
            found.add(new Finding("주민등록번호", rrn.group(1) + "-*******"));
        }
        List<Finding> foreign = new ArrayList<Finding>();   // 표시 순서상 이메일 뒤에 붙인다
        Matcher fgn = FOREIGN.matcher(text);
        while (fgn.find()) {
            spans.add(new int[]{fgn.start(), fgn.end()});
            foreign.add(new Finding("외국인등록번호", fgn.group(1) + "-*******"));
        }

        Matcher mobile = MOBILE.matcher(text);
        while (mobile.find()) {
            if (overlaps(mobile.start(), mobile.end(), spans)) {
                continue;
            }
            spans.add(new int[]{mobile.start(), mobile.end()});
            // 접두사를 살려 010/011/016/017/018/019 를 구분해 보여준다.
            found.add(new Finding("휴대폰", mobile.group(1) + "-****-" + mobile.group(3)));
        }

        Matcher email = EMAIL.matcher(text);
        while (email.find()) {
            found.add(new Finding("이메일", email.group(1) + "***@" + email.group(3)));
        }

        found.addAll(foreign);

        // 카드번호 — 4-4-4-4 형태 + Luhn 검사를 통과한 것만(아무 16자리 숫자는 버린다). 앞 4·뒤 4만 남긴다.
        Matcher card = CARD.matcher(text);
        while (card.find()) {
            if (overlaps(card.start(), card.end(), spans)) {
                continue;
            }
            String digits = card.group(1) + card.group(3) + card.group(4) + card.group(5);
            if (luhn(digits)) {
                found.add(new Finding("카드번호", card.group(1) + "-****-****-" + card.group(5)));
            }
        }
        return found;
    }

    /** Luhn 검사 — 카드번호 오탐(아무 16자리 숫자)을 걸러낸다. */
    static boolean luhn(String digits) {
        int sum = 0;
        boolean dbl = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int d = digits.charAt(i) - '0';
            if (dbl) {
                d *= 2;
                if (d > 9) {
                    d -= 9;
                }
            }
            sum += d;
            dbl = !dbl;
        }
        return sum % 10 == 0;
    }

    /** 두 스팬이 겹치면 {@code start1 < end2 && start2 < end1}. */
    private static boolean overlaps(int start, int end, Set<int[]> spans) {
        for (int[] span : spans) {
            if (start < span[1] && span[0] < end) {
                return true;
            }
        }
        return false;
    }
}
