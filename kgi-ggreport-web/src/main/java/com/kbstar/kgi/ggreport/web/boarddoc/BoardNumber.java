package com.kbstar.kgi.ggreport.web.boarddoc;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;

/**
 * 백만원 → 억원 환산·괄호 병기(순수 함수). 합산을 먼저 하고 ÷100 은 한 번만, 둘째 자리 HALF_UP.
 * 부품이 비었거나 오류인 경우의 처리(failed)는 호출자 몫 — 여기에는 null 이 들어오지 않아야 한다.
 */
public final class BoardNumber {

    private static final BigDecimal ZERO_2 = new BigDecimal("0.00");

    private BoardNumber() {
    }

    /** 원값(백만원) 합. 빈 목록·null 원소는 거부(0 으로 치지 않는다). */
    public static BigDecimal sum(List<BigDecimal> parts) {
        if (parts == null || parts.isEmpty()) {
            throw new IllegalArgumentException("NO_PARTS");
        }
        BigDecimal acc = BigDecimal.ZERO;
        for (BigDecimal p : parts) {
            if (p == null) {
                throw new IllegalArgumentException("NULL_PART");
            }
            acc = acc.add(p);
        }
        return acc;
    }

    /** 백만원 → 억원 문자열: ÷100, 소수 둘째 자리 HALF_UP, 천 단위 쉼표, 음수는 ASCII '-', 반올림 뒤 0 이면 "0.00". */
    public static String eok(BigDecimal million) {
        return format(eokValue(million));
    }

    /** 백만원 → 억원 숫자(÷100, 소수 둘째 자리 HALF_UP). 합계 파생(derive_sum)이 이 값을 더한다. */
    public static BigDecimal eokValue(BigDecimal million) {
        if (million == null) {
            throw new IllegalArgumentException("NULL_VALUE");
        }
        return million.movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
    }

    /** 억원 숫자 → 문자열: 둘째 자리 HALF_UP, 천 단위 쉼표, 음수는 ASCII '-', 0 이면 "0.00". */
    public static String format(BigDecimal eok) {
        BigDecimal v = eok.setScale(2, RoundingMode.HALF_UP);
        if (v.signum() == 0) {
            return ZERO_2.toPlainString();
        }
        DecimalFormat df = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.ROOT));
        df.setRoundingMode(RoundingMode.HALF_UP);
        String body = df.format(v.abs());
        return v.signum() < 0 ? "-" + body : body;
    }

    /** 한 칸 두 값 병기. */
    public static String paren(String main, String sub) {
        return main + " (" + sub + ")";
    }
}
