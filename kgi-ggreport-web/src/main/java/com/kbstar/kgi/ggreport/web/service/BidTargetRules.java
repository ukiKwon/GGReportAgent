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
    // 072 — 구분 4값(사용자 11-27). 저장은 한 칸 TAG_CD. 대상 축(재유치/신규)·방식 축(입찰/수의계약)은 코드에서 읽는다.
    static final String TAG_RETAIN_BID = "RETAIN", TAG_RETAIN_PRIVATE = "RETAIN_PRIVATE", TAG_NEW_BID = "NEW", TAG_NEW_PRIVATE = "NEW_PRIVATE";
    static final String TAG_LEGACY_REGAIN = "REGAIN";   // 059 되찾기 도전 — 072 부터 사용 안 함, 신규 입찰로 이관
    static boolean tagRetain(String tag) { return TAG_RETAIN_BID.equals(tag) || TAG_RETAIN_PRIVATE.equals(tag); }
    static boolean tagPrivate(String tag) { return TAG_RETAIN_PRIVATE.equals(tag) || TAG_NEW_PRIVATE.equals(tag); }
    /** 072 이전에 올린 결재 대기 항목의 옛 코드 → 지금 코드. 그 밖은 그대로. */
    static String tagMigrated(String tag) { return TAG_LEGACY_REGAIN.equals(tag) ? TAG_NEW_BID : tag; }
    static final String WARN_NO_BID_PRIVATE = "NO_BID_PRIVATE";   // 결재 항목 경고 — 수의계약이라 '입찰 없음' 근거로 막지 않고 통과(결재자가 본다)
    static final String KIND_GOAL = "GOAL", KIND_WATCH = "WATCH";
    static final String G_AIM = "TARGET_AIM_RANK";   // 063 금고 방식(1금고·2금고·단수금고·주거래)
    static final String AIM_FIRST = "FIRST", AIM_CHANGE = "CHANGE", AIM_CLEAR = "CLEAR";   // aimEdit 결과(접근 이력용 종류, 값 아님)
    static final String AIM_OTHER = "OTHER";   // 066 기타 — 이름 칸 AIM_RANK_ETC 필수
    static final String AIM_ETC_MSG = "기타 금고 방식 이름은 1~30자로 적어 주세요.";
    static final String AIM_ETC_ONLY_MSG = "금고 방식 이름 직접 입력은 '기타'를 고를 때만 씁니다.";
    static final String WATCH_AIM_MSG = "관심 기관에는 금고 방식을 두지 않습니다. 목표로 옮긴 뒤 정해 주세요.";
    static final String ADD_AIM_MSG = "금고 방식은 목표로 넣은 뒤 표에서 고릅니다.";
    static final String BASIS_CLOSED = "NOTICE_CLOSED", BASIS_NO_BID = "NOTICE_NO_BID", BASIS_CONTRACT = "CONTRACT_DECIDED";
    static final int YEARS_AHEAD = 2;
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,20}");
    static final Pattern EMP_NO = Pattern.compile("[0-9]{7}");
    static final String FORBIDDEN_MSG = "목표 기관 기록에 넣을 수 없는 내용(정당·전화번호)이 있습니다. 해당 부분을 지우고 다시 입력해 주세요.";

    static final String WATCH_YEAR_MSG = "관심 기관에는 연도를 두지 않습니다. 연도를 정해 노리려면 목표로 옮겨 주세요.";
    private static final String YEAR_RANGE_MSG = "목표 연도는 올해부터 2년 뒤까지 고를 수 있습니다.";

    static final class Parsed { int year; boolean watch; String tag, memo, owner, aim, aimEtc; }
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
        String t = in.getTagCd() == null ? null : in.getTagCd().trim();
        p.tag = t == null || t.isEmpty() ? null : code(t, G_TAG, codes, "태그를 목록에서 골라 주세요.");   // 11-25 — 구분은 비워 둘 수 있다(NULL = '-')
        p.memo = BankContractRules.text(in.getMemo(), 100, "메모는 100자 이내여야 합니다.");
        String o = in.getOwnerEmpNo() == null ? null : in.getOwnerEmpNo().trim();
        if (o != null && o.isEmpty()) o = null;
        if (o != null && !EMP_NO.matcher(o).matches()) throw bad(BidTargetService.OWNER_MSG);
        p.owner = o;
        p.aim = aim(in.getAimRankCd(), p.watch, codes);
        p.aimEtc = aimEtc(in.getAimRankEtc(), p.aim);
        new MemoScreen("TARGET_FORBIDDEN", FORBIDDEN_MSG).free(p.memo).free(p.aimEtc).throwIfAny();
    }

    /**
     * 066 — 기타(OTHER)면 이름 1~30자 필수(NFKC·보이지 않는 공백 정리 뒤 저장), 아니면 이름이 오면 400. 제어문자는 text() 가 400.
     * 오류 문구에 원문을 싣지 않는다. 코드는 aim() 이 코드표(TARGET_AIM_RANK)로 먼저 검증한다.
     */
    static String aimEtc(String raw, String aim) {
        String v = BankContractRules.text(raw == null ? null : normalizeName(raw), 30, AIM_ETC_MSG);
        if (AIM_OTHER.equals(aim)) {
            if (v == null) throw bad(AIM_ETC_MSG);
            return v;
        }
        if (v != null) throw bad(AIM_ETC_ONLY_MSG);
        return null;
    }

    /** NFKC + NBSP·전각 공백·폭 없는 공백 → 공백 하나, 앞뒤 공백 제거(보이는 글자는 그대로). */
    static String normalizeName(String s) {
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFKC)
                .replaceAll("[\\s\\u00A0\\u3000\\u200B\\uFEFF]+", " ").trim();
    }

    /** 063 — 금고 방식. 비우면 null. 관심에 값을 보내면 400. */
    static String aim(String raw, boolean watch, BankContractRules.CodeCheck codes) {
        String v = raw == null ? null : raw.trim();
        if (v == null || v.isEmpty()) return null;
        if (watch) throw bad(WATCH_AIM_MSG);
        return code(v, G_AIM, codes, "금고 방식을 목록에서 골라 주세요.");
    }

    /** 063 — 목표로 처음 넣을 때(단건·일괄 ADD)는 금고 방식을 비운다. 비어 있지 않으면 400(security 11-25). */
    static void requireNoAimOnAdd(String raw) {
        if (raw != null && !raw.trim().isEmpty()) throw bad(ADD_AIM_MSG);
    }

    /**
     * NEXT 114 — 고치기에서 보내지 않은 메모·금고 방식(null)은 지금 값 그대로(빈 문자열은 지움, 위 파싱이 null 로 만든다).
     * 화면에서 메모 칸을 없앴다 — 메모를 모르는 본문이 옛 메모를 지우지 않게. 이어받은 값은 다시 검사하지 않는다(이월과 같음).
     */
    static void keepUnsent(Parsed p, String memoRaw, String aimRaw, BidTarget cur) {
        if (cur == null) return;
        if (memoRaw == null) p.memo = cur.getMemo();
        // 066 — 금고 방식을 안 보내면 코드·기타 이름 모두 그대로. 코드만 보내고 OTHER 를 유지하면 이름도 보내야 한다(aimEtc 가 400).
        if (aimRaw == null) { p.aim = cur.getAimRankCd(); p.aimEtc = cur.getAimRankEtc(); }
    }

    /** 금고 방식이 어떻게 바뀌나 — null(그대로) | FIRST(비어 있던 것에 처음) | CHANGE(기타 이름만 바뀐 것 포함) | CLEAR. */
    static String aimEdit(BidTarget cur, Parsed p) {
        String before = cur == null ? null : cur.getAimRankCd();
        if (Objects.equals(before, p.aim)) {
            return Objects.equals(cur == null ? null : cur.getAimRankEtc(), p.aimEtc) ? null : AIM_CHANGE;
        }
        return before == null ? AIM_FIRST : p.aim == null ? AIM_CLEAR : AIM_CHANGE;
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
                && Objects.equals(c.getMemo(), p.memo) && Objects.equals(c.getOwnerEmpNo(), p.owner)
                && Objects.equals(c.getAimRankCd(), p.aim) && Objects.equals(c.getAimRankEtc(), p.aimEtc);
    }

    /**
     * NEXT 114(사용자 11-24 밤) — 목표 고치기 중 연도·주 담당이 그대로(구분 태그·메모·금고 방식만 바뀜)면 결재 없이 바로. 넣기(cur==null)·관심은 false.
     * 금고 방식은 구분 태그처럼 값 고치기다(바꾸기·지우기도 바로, 사용자 11-25) — 이 함수에 금고 방식 조건을 넣지 않는다.
     * 단건 save 와 일괄 TargetChangeService.planItem 이 이 함수 하나를 쓴다.
     * NEXT 125 — 바로 반영이어도 키 판정(checkGoalSlots)·순위 잠금(checkRankLock)은 거친다(사용자 11-26 ①).
     */
    static boolean valueOnlyEdit(BidTarget cur, Parsed p, int thisYear) {
        return cur != null && !p.watch && KIND_GOAL.equals(kindOf(cur))
                && cur.getTargetYear() != null && cur.getTargetYear() >= thisYear   // 지난해 목표는 결재(security F1)
                && Integer.valueOf(p.year).equals(cur.getTargetYear())
                && Objects.equals(cur.getOwnerEmpNo(), p.owner);
    }

    /**
     * 올해 입찰 종료 근거(서버가 아는 것만). 없으면 null. 화면만 아는 근거(행안부·기관 자료)는 여기 없다 — 화면은 주의만.
     * ① 공고 상태: 기관의 마지막 회차가 (열려 있고 기관 자료가 넘어가지 않았고 최신 판정 CLOSED/NO_BID) 또는 (NO_BID 로 닫혔고 그 뒤 넘어가지 않음), 판정 시각이 올해.
     *    NoticeRoundService.current() 와 같은 기준 — 화면이 /notice-rounds/current 의 status_cd·round_closed·handled_at 으로 같은 판정을 한다.
     *    판정은 NoticeRoundRules.advanced·CLOSED·NO_BID, NoticeRoundService.CLOSE_NO_BID(같은 package 멤버)를 그대로 부른다.
     * ② 금고 약정(039): 시작 전(FUTURE)인 줄이 있음 = 다음 협약이 정해짐(BankContractRules.termState).
     */
    static Map<String, Object> bidClosedBasis(NoticeRoundView n, List<BankContract> lines, LocalDate today) { return bidClosedBasis(n, lines, today, null); }

    /** 072 — tag 가 수의계약이면 '입찰 없음' 근거는 끝남이 아니다(사용자 11-27 — 공고 없이 진행). 공고 종료·약정 확정 근거는 그대로 본다. */
    static Map<String, Object> bidClosedBasis(NoticeRoundView n, List<BankContract> lines, LocalDate today, String tag) {
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
            if (code != null && !(BASIS_NO_BID.equals(code) && tagPrivate(tag))) {
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

    /** 061 — ♥ 구분(선택값) 검사. */
    static String tag(String raw, BankContractRules.CodeCheck codes) { return code(raw, G_TAG, codes, "태그를 목록에서 골라 주세요."); }

    private static String code(String raw, String group, BankContractRules.CodeCheck codes, String msg) {
        String v = raw == null ? null : raw.trim();
        if (v == null || !CODE.matcher(v).matches() || !codes.enabled(group, v)) throw bad(msg);
        return v;
    }

    private static ApiException bad(String m) { return ApiException.badRequest(m); }
}
