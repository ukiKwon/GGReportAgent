package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import java.util.Objects;
import java.util.regex.Pattern;

/** 올해 목표 기관(043) 입력 검사 — 순수 로직. 오류 문구는 고정 문구뿐(입력값·내부 정보 없음). 글자 규칙은 BankContractRules.text 와 같다. */
final class BidTargetRules {

    static final String G_TAG = "TARGET_TAG", G_CANCEL = "TARGET_CANCEL_REASON", CANCEL_ETC = "ETC";
    static final int YEARS_AHEAD = 2;
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,20}");
    static final Pattern EMP_NO = Pattern.compile("[0-9]{7}");
    static final String FORBIDDEN_MSG = "목표 기관 기록에 넣을 수 없는 내용(정당·전화번호)이 있습니다. 해당 부분을 지우고 다시 입력해 주세요.";

    static final class Parsed { int year; String tag, memo, owner; }
    static final class CancelParsed { String reasonCd, reasonEtc; }

    private BidTargetRules() { }

    static boolean yearSelectable(int y, int thisYear) { return y >= thisYear && y <= thisYear + YEARS_AHEAD; }

    /** keepYear = 고치기일 때 지금 목표 연도(넣기면 null). 안 보내면 넣기는 올해, 고치기는 그대로. 그대로 두는 연도는 지난해여도 허용(1월에 메모만 고치기). */
    static Parsed parse(BidTargetIn in, int thisYear, Integer keepYear, BankContractRules.CodeCheck codes) {
        Parsed p = new Parsed();
        Integer y = in.getTargetYear() != null ? in.getTargetYear() : (keepYear != null ? keepYear : Integer.valueOf(thisYear));
        boolean unchanged = keepYear != null && y.intValue() == keepYear.intValue();
        if (!unchanged && !yearSelectable(y, thisYear)) throw bad("목표 연도는 올해부터 2년 뒤까지 고를 수 있습니다.");
        p.year = y;
        p.tag = code(in.getTagCd(), G_TAG, codes, "태그를 목록에서 골라 주세요.");
        p.memo = BankContractRules.text(in.getMemo(), 100, "메모는 100자 이내여야 합니다.");
        String o = in.getOwnerEmpNo() == null ? null : in.getOwnerEmpNo().trim();
        if (o != null && o.isEmpty()) o = null;
        if (o != null && !EMP_NO.matcher(o).matches()) throw bad(BidTargetService.OWNER_MSG);
        p.owner = o;
        new MemoScreen("TARGET_FORBIDDEN", FORBIDDEN_MSG).free(p.memo).throwIfAny();
        return p;
    }

    static CancelParsed parseCancel(BidTargetCancelIn in, BankContractRules.CodeCheck codes) {
        CancelParsed c = new CancelParsed();
        c.reasonCd = code(in.getCancelReasonCd(), G_CANCEL, codes, "빼는 사유를 목록에서 골라 주세요.");
        String etc = BankContractRules.text(in.getCancelReasonEtc(), 50, "기타 사유는 50자 이내여야 합니다.");
        if (CANCEL_ETC.equals(c.reasonCd)) {
            if (etc == null) throw bad("기타를 고르면 사유를 적어야 합니다.");
            c.reasonEtc = etc;
        } else if (etc != null) {
            throw bad("사유 직접 입력은 '기타'를 고를 때만 씁니다.");
        }
        new MemoScreen("TARGET_FORBIDDEN", FORBIDDEN_MSG).free(c.reasonEtc).name(c.reasonEtc).throwIfAny();
        return c;
    }

    static boolean same(BidTarget c, Parsed p) {
        return c.getTargetYear() == p.year && Objects.equals(c.getTagCd(), p.tag)
                && Objects.equals(c.getMemo(), p.memo) && Objects.equals(c.getOwnerEmpNo(), p.owner);
    }

    private static String code(String raw, String group, BankContractRules.CodeCheck codes, String msg) {
        String v = raw == null ? null : raw.trim();
        if (v == null || !CODE.matcher(v).matches() || !codes.enabled(group, v)) throw bad(msg);
        return v;
    }

    private static ApiException bad(String m) { return ApiException.badRequest(m); }
}
