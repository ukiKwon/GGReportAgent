package com.kbstar.kgi.ggreport.web.docout;

/** 받침에 따른 조사 고르기(순수 함수). 한글은 받침 유무, 숫자는 읽는 소리(영·삼·육=받침, 일·칠·팔=ㄹ받침) 기준. 영문자·판단 불가는 UNKNOWN. */
public final class KoreanJosa {

    public static final int NONE = 0;
    public static final int RIEUL = 1;
    public static final int FINAL = 2;
    public static final int UNKNOWN = 3;

    private KoreanJosa() {
    }

    /** 끝에서부터 한글·숫자·영문자가 나올 때까지 건너뛰어(공백·괄호·」·〕 등) 받침 종류를 돌려준다. */
    public static int last(String s) {
        if (s == null) {
            return UNKNOWN;
        }
        for (int i = s.length() - 1; i >= 0; i--) {
            char c = s.charAt(i);
            if (c >= 0xAC00 && c <= 0xD7A3) {
                int jong = (c - 0xAC00) % 28;
                return jong == 0 ? NONE : jong == 8 ? RIEUL : FINAL;
            }
            if (c >= '0' && c <= '9') {
                switch (c) {
                    case '0': case '3': case '6':
                        return FINAL;
                    case '1': case '7': case '8':
                        return RIEUL;
                    default:
                        return NONE;
                }
            }
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
                return UNKNOWN;
            }
        }
        return UNKNOWN;
    }

    /** 은/는 */
    public static String eunNeun(String s) {
        int k = last(s);
        return k == NONE ? "는" : k == UNKNOWN ? "은(는)" : "은";
    }

    /** 이/가 */
    public static String iGa(String s) {
        int k = last(s);
        return k == NONE ? "가" : k == UNKNOWN ? "이(가)" : "이";
    }

    /** 으로/로 (ㄹ받침은 '로') */
    public static String euroRo(String s) {
        int k = last(s);
        return k == FINAL ? "으로" : k == UNKNOWN ? "(으)로" : "로";
    }
}
