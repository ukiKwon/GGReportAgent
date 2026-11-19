package com.kbstar.kgi.ggreport.web.docout;

import java.util.List;

/** 반복 행의 세로 병합·가변 열 계산 도우미(NEXT 100 S0) — 행을 복제한 뒤 병합을 고치지 않고 데이터에서 매번 새로 계산한다. */
public final class Groups {

    public static final int MAX_YEAR_COLUMNS = 10;

    private Groups() {
    }

    /**
     * 같은 부모 안에서 <b>연속으로</b> 같은 키인 행을 묶는다. 결과는 묶음의 첫 행에 길이 n, 나머지 행에 0(그 행은 칸을 생략).
     * 부모가 달라지면 같은 키라도 새로 묶는다. null 키는 어느 것과도 같지 않다(혼자 한 묶음).
     * 예: parent [X,X,Y], keys [a,a,a] → [2,0,1].
     */
    public static int[] rowspans(List<String> parentKeys, List<String> keys) {
        if (parentKeys == null || keys == null || parentKeys.size() != keys.size()) {
            throw new IllegalArgumentException("parentKeys and keys must be the same size");
        }
        int n = keys.size();
        int[] out = new int[n];
        int first = 0;
        for (int i = 0; i < n; i++) {
            boolean same = i > 0 && keys.get(i) != null && keys.get(i).equals(keys.get(i - 1))
                    && parentKeys.get(i) != null && parentKeys.get(i).equals(parentKeys.get(i - 1));
            if (same) {
                out[first]++;
            } else {
                first = i;
                out[i] = 1;
            }
        }
        return out;
    }

    /**
     * 가변 연도 열 수 = to - from + 1. 상한 {@link #MAX_YEAR_COLUMNS}, 넘거나 거꾸로면 {@link IllegalArgumentException}.
     * docout 은 web 계층(ApiException)을 모른다 — 호출부(컨트롤러·서비스, S2 이후)가 이 예외를 400 으로 감싼다(메시지는 사용자에게 보여도 되는 고정 문구).
     */
    public static int yearColumns(int from, int to) {
        int n = to - from + 1;
        if (n < 1 || n > MAX_YEAR_COLUMNS) {
            throw new IllegalArgumentException("연도 범위는 1~" + MAX_YEAR_COLUMNS + "년으로 지정하세요.");
        }
        return n;
    }
}
