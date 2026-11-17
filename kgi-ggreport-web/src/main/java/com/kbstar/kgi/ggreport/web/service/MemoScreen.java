package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.support.HeadForbidden;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import java.util.*;

/** 자유 글 칸 검사(043 메모·취소 사유, 설명회 기록(046 예약) 메모). 개인정보 → 422 PII_BLOCKED, 정당·전화번호 → 422 {forbiddenCode}.
 *  응답에는 종류·개수만(입력값 없음). BankContractRules.Screen 과 같은 기준 — 나중에 하나로 합칠 것. */
final class MemoScreen {
    private final String forbiddenCode, forbiddenMsg;
    private final Map<String, Integer> pii = new LinkedHashMap<String, Integer>();
    private final List<HeadForbidden.Kind> forb = new ArrayList<HeadForbidden.Kind>();

    MemoScreen(String forbiddenCode, String forbiddenMsg) { this.forbiddenCode = forbiddenCode; this.forbiddenMsg = forbiddenMsg; }

    MemoScreen free(String t) {
        if (t == null) return this;
        for (Pii.Finding f : Pii.scanLoose(t)) bump(f.getKind());
        for (HeadForbidden.Kind k : HeadForbidden.scan(t)) {
            if ((k == HeadForbidden.Kind.PHONE || k == HeadForbidden.Kind.PARTY) && !forb.contains(k)) forb.add(k);
        }
        return this;
    }

    MemoScreen name(String t) { if (t != null && BankContractRules.hasPersonName(t)) bump("NAME"); return this; }

    void throwIfAny() {
        if (!pii.isEmpty()) {
            List<Map<String, Object>> kinds = new ArrayList<Map<String, Object>>();
            for (Map.Entry<String, Integer> e : pii.entrySet()) {
                Map<String, Object> k = new LinkedHashMap<String, Object>();
                k.put("kind", e.getKey()); k.put("count", e.getValue()); kinds.add(k);
            }
            String msg = "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 부분을 지우고 다시 입력해 주세요.";
            if (pii.containsKey("NAME")) msg += " 사람 이름은 적지 말아 주세요.";
            throw unprocessable("PII_BLOCKED", msg, kinds);
        }
        if (!forb.isEmpty()) {
            List<Map<String, Object>> kinds = new ArrayList<Map<String, Object>>();
            for (HeadForbidden.Kind k : forb) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                m.put("kind", k.name()); m.put("label", k.getLabel()); kinds.add(m);
            }
            throw unprocessable(forbiddenCode, forbiddenMsg, kinds);
        }
    }

    private void bump(String k) { Integer n = pii.get(k); pii.put(k, n == null ? 1 : n + 1); }

    private static ApiException unprocessable(String code, String msg, Object kinds) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code); d.put("message", msg); d.put("kinds", kinds);
        return ApiException.withDetail(422, d);
    }
}
