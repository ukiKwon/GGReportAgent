package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/** 목표·관심 기관(043·044) 입력 검사와 판정 — 순수 로직. 오류 문구는 고정 문구뿐(입력값·내부 정보 없음). 글자 규칙은 BankContractRules.text 와 같다. */
final class BidTargetRules {

    static final String G_TAG = "TARGET_TAG", G_CANCEL = "TARGET_CANCEL_REASON", CANCEL_ETC = "ETC";
    static final String KIND_GOAL = "GOAL", KIND_WATCH = "WATCH";
    static final String BASIS_CLOSED = "NOTICE_CLOSED", BASIS_NO_BID = "NOTICE_NO_BID", BASIS_CONTRACT = "CONTRACT_DECIDED";
    static final int YEARS_AHEAD = 2;
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,20}");
    static final Pattern EMP_NO = Pattern.compile("[0-9]{7}");
    static final String FORBIDDEN_MSG = "목표 기관 기록에 넣을 수 없는 내용(정당·전화번호)이 있습니다. 해당 부분을 지우고 다시 입력해 주세요.";

    static final String WATCH_YEAR_MSG = "관심 기관에는 연도를 두지 않습니다. 연도를 정해 노리려면 목표로 옮겨 주세요.";
    private static final String YEAR_RANGE_MSG = "목표 연도는 올해부터 2년 뒤까지 고를 수 있습니다.";

    static final class Parsed { int year; boolean watch; String tag, memo, owner; }
    static final class CancelParsed { String reasonCd, reasonEtc; }

    private BidTargetRules() { }

    static boolean yearSelectable(int y, int thisYear) { return y >= thisYear && y <= thisYear + YEARS_AHEAD; }

    /** 넣기 구분 — 비우면 목표. */
    static String kind(String raw) {
        if (raw == null || raw.trim().isEmpty()) return KIND_GOAL;
        String v = raw.trim();
        if (KIND_GOAL.equals(v) || KIND_WATCH.equals(v)) return v;
        throw bad("구분은 목표 또는 관심 중에서 골라 주세요.");
    }

    /** 옮길 곳 — 필수. */
    static String moveKind(String raw) {
        if (raw == null || raw.trim().isEmpty()) throw bad("옮길 곳(목표 또는 관심)을 골라 주세요.");
        return kind(raw);
    }

    static String kindOf(BidTarget t) { return KIND_WATCH.equals(t.getKindCd()) ? KIND_WATCH : KIND_GOAL; }

    /** 겹침 판정 대상인 '현재' 기록인가 — 관심, 또는 올해 이후 목표(지난해 목표는 빼고 본다). */
    static boolean isCurrent(BidTarget t, int thisYear) {
        if (KIND_WATCH.equals(kindOf(t))) return true;
        return t.getTargetYear() != null && t.getTargetYear().intValue() >= thisYear;
    }

    /** 관심 넣기·고치기 — 연도를 보내면 400. */
    static Parsed parseWatch(BidTargetIn in, BankContractRules.CodeCheck codes) {
        if (in.getTargetYear() != null) throw bad(WATCH_YEAR_MSG);
        Parsed p = new Parsed();
        p.watch = true;
        common(p, in, codes);
        return p;
    }

    /** 옮길 때 연도 — 관심은 없음(보내면 400), 목표는 필수·올해~+2. */
    static Integer moveYear(Integer raw, boolean toWatch, int thisYear) {
        if (toWatch) {
            if (raw != null) throw bad(WATCH_YEAR_MSG);
            return null;
        }
        if (raw == null) throw bad("목표로 옮길 때는 목표 연도를 골라 주세요.");
        if (!yearSelectable(raw.intValue(), thisYear)) throw bad(YEAR_RANGE_MSG);
        return raw;
    }

    /** keepYear = 고치기일 때 지금 목표 연도(넣기면 null). 안 보내면 넣기는 올해, 고치기는 그대로. 그대로 두는 연도는 지난해여도 허용(1월에 메모만 고치기). */
    static Parsed parse(BidTargetIn in, int thisYear, Integer keepYear, BankContractRules.CodeCheck codes) {
        Parsed p = new Parsed();
        Integer y = in.getTargetYear() != null ? in.getTargetYear() : (keepYear != null ? keepYear : Integer.valueOf(thisYear));
        boolean unchanged = keepYear != null && y.intValue() == keepYear.intValue();
        if (!unchanged && !yearSelectable(y, thisYear)) throw bad(YEAR_RANGE_MSG);
        p.year = y;
        common(p, in, codes);
        return p;
    }

    private static void common(Parsed p, BidTargetIn in, BankContractRules.CodeCheck codes) {
        p.tag = code(in.getTagCd(), G_TAG, codes, "태그를 목록에서 골라 주세요.");
        p.memo = BankContractRules.text(in.getMemo(), 100, "메모는 100자 이내여야 합니다.");
        String o = in.getOwnerEmpNo() == null ? null : in.getOwnerEmpNo().trim();
        if (o != null && o.isEmpty()) o = null;
        if (o != null && !EMP_NO.matcher(o).matches()) throw bad(BidTargetService.OWNER_MSG);
        p.owner = o;
        new MemoScreen("TARGET_FORBIDDEN", FORBIDDEN_MSG).free(p.memo).throwIfAny();
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
        boolean yearSame = p.watch ? c.getTargetYear() == null : Integer.valueOf(p.year).equals(c.getTargetYear());
        return yearSame && Objects.equals(c.getTagCd(), p.tag)
                && Objects.equals(c.getMemo(), p.memo) && Objects.equals(c.getOwnerEmpNo(), p.owner);
    }

    /**
     * 올해 입찰 종료 근거(서버가 아는 것만). 없으면 null. 화면만 아는 근거(행안부·기관 자료)는 여기 없다 — 화면은 주의만.
     * ① 공고 상태: 기관의 마지막 회차가 (열려 있고 기관 자료가 넘어가지 않았고 최신 판정 CLOSED/NO_BID) 또는 (NO_BID 로 닫혔고 그 뒤 넘어가지 않음), 판정 시각이 올해.
     *    NoticeRoundService.current() 와 같은 기준 — 화면이 /notice-rounds/current 의 status_cd·round_closed·handled_at 으로 같은 판정을 한다.
     *    판정은 NoticeRoundRules.advanced·CLOSED·NO_BID, NoticeRoundService.CLOSE_NO_BID(같은 package 멤버)를 그대로 부른다.
     * ② 금고 약정(039): 시작 전(FUTURE)인 줄이 있음 = 다음 협약이 정해짐(BankContractRules.termState).
     */
    static Map<String, Object> bidClosedBasis(NoticeRoundView n, List<BankContract> lines, LocalDate today) {
        String y = String.valueOf(today.getYear());
        if (n != null && n.getHandledAt() != null && n.getHandledAt().startsWith(y)) {
            String code = null;
            if (n.getCloseReasonCd() != null) {
                String base = n.getClosedLastBid() != null ? n.getClosedLastBid() : n.getAnchorLastBid();
                if (NoticeRoundService.CLOSE_NO_BID.equals(n.getCloseReasonCd()) && !NoticeRoundRules.advanced(base, n.getCurLastBid())) code = BASIS_NO_BID;
            } else if (!NoticeRoundRules.advanced(n.getAnchorLastBid(), n.getCurLastBid())) {
                if (NoticeRoundRules.CLOSED.equals(n.getStatusCd())) code = BASIS_CLOSED;
                else if (NoticeRoundRules.NO_BID.equals(n.getStatusCd())) code = BASIS_NO_BID;
            }
            if (code != null) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                m.put("basis_cd", code);
                m.put("basis_date", n.getHandledAt().length() >= 10 ? n.getHandledAt().substring(0, 10) : null);
                m.put("round_seq", n.getRoundSeq());
                return m;
            }
        }
        if (lines != null) {
            for (BankContract c : lines) {
                if (!"FUTURE".equals(BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today))) continue;
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                m.put("basis_cd", BASIS_CONTRACT);
                m.put("basis_date", c.getTermFrom());
                m.put("contract_no", c.getContractNo());
                return m;
            }
        }
        return null;
    }

    /**
     * 다음 협약 종료(039 근거만, 없으면 null). 금고 순위마다 '이미 정해진 약정'(지금·시작 전)의 가장 늦은 끝을 구하고 그중 가장 이른 것 —
     * 다음 입찰이 열릴 가장 가까운 자리. 끝을 모르는 줄은 뺀다. 날짜를 만들어 내지 않고 저장된 TERM_TO 문자열을 그대로 돌려준다.
     */
    static String nextTermTo(List<BankContract> lines, LocalDate today) {
        if (lines == null) return null;
        Map<String, LocalDate> end = new HashMap<String, LocalDate>();
        Map<String, String> raw = new HashMap<String, String>();
        for (BankContract c : lines) {
            String st = BankContractRules.termState(c.getTermFrom(), c.getTermTo(), today);
            if (!"CURRENT".equals(st) && !"FUTURE".equals(st)) continue;
            LocalDate e = BankContractRules.endOrNull(c.getTermTo());
            if (e == null) continue;
            String k = c.getRankCd() == null ? "" : c.getRankCd();
            LocalDate prev = end.get(k);
            if (prev == null || e.isAfter(prev)) { end.put(k, e); raw.put(k, c.getTermTo()); }
        }
        String out = null;
        LocalDate min = null;
        for (Map.Entry<String, LocalDate> e : end.entrySet()) {
            if (min == null || e.getValue().isBefore(min)) { min = e.getValue(); out = raw.get(e.getKey()); }
        }
        return out;
    }

    /** RFP 협약 개시일 — 비우면 null(지움). YYYY-MM-DD 실제 날짜, 연도는 목표 연도 또는 다음 해(개시는 입찰한 해나 그다음 해). */
    static String termStart(String raw, int targetYear) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) return null;
        if (!v.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw bad("협약 개시일은 YYYY-MM-DD 형식이어야 합니다.");
        LocalDate d;
        try { d = LocalDate.parse(v); } catch (RuntimeException e) { throw bad("협약 개시일이 올바른 날짜가 아닙니다."); }
        if (d.getYear() < targetYear || d.getYear() > targetYear + 1) throw bad("협약 개시일은 목표 연도나 그다음 해 날짜여야 합니다.");
        return v;
    }

    private static String code(String raw, String group, BankContractRules.CodeCheck codes, String msg) {
        String v = raw == null ? null : raw.trim();
        if (v == null || !CODE.matcher(v).matches() || !codes.enabled(group, v)) throw bad(msg);
        return v;
    }

    private static ApiException bad(String m) { return ApiException.badRequest(m); }
}
