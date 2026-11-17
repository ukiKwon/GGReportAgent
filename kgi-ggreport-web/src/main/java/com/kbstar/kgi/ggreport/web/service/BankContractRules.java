package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.dto.BankContractCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BankContractIn;
import com.kbstar.kgi.ggreport.web.support.HeadForbidden;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.net.URI;
import java.net.URLDecoder;
import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 금고 약정 기록(039) 입력 검사. 오류 문구는 고정 문구뿐(입력값·내부 정보 없음). 서버는 링크를 열지 않는다. */
final class BankContractRules {

    static final String G_BANK = "BANK", G_RANK = "BANK_RANK", G_SRC = "BANK_CONTRACT_SRC", G_CANCEL = "BANK_CANCEL_REASON";
    static final String G_ACCOUNT = "BANK_ACCOUNT", ACCOUNT_ETC = "ETC";
    static final String BANK_ETC = "ETC", CANCEL_ETC = "ETC";
    static final String RANK_FIRST = "FIRST", RANK_SECOND = "SECOND";
    static final String SRC_LINK = "LINK", SRC_DOC_NO = "DOC_NO", SRC_STAFF = "STAFF";
    static final String TYPE_LOCAL_GOV = "지자체";
    static final List<String> RANK_ORDER = Arrays.asList("FIRST", "SECOND", "NONE", "JOINT");
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,30}");
    private static final Pattern TERM = Pattern.compile("\\d{4}(-\\d{2}(-\\d{2})?)?");

    /** 코드표 조회 — enabled 는 ENABLED=1 만 true(X01·X02 는 false), names 는 ENABLED=1 인 표시명. */
    interface CodeCheck {
        boolean enabled(String group, String code);
        List<String> names(String group);
    }

    static final class Parsed {
        String rank, bank, bankEtc, termFrom, termTo, srcKind, srcUrl, srcNo, checkedDate, checkedDept, note, account, accountEtc;
    }

    static final class CancelParsed {
        String reasonCd, reasonEtc;
    }

    private BankContractRules() { }

    // ---- 순위·기간 ----

    /** 지자체·교육청 = FIRST/SECOND 만, 그 밖(법원·공공기관 등) = NONE/JOINT 만. TYPE 이 비어 있으면(옛 시드) 막지 않는다. */
    static boolean rankAllowed(String rank, String instType) {
        String t = instType == null ? "" : instType.trim();
        if (t.isEmpty()) return true;
        return rankChecked(rank) == fixedRankType(t);
    }

    /** 1·2금고를 쓰는 기관 종류(지자체·교육청). 맡는 회계 칸도 이 종류만 받는다(TYPE 이 비어 있어도 거부). */
    static boolean fixedRankType(String instType) {
        String t = instType == null ? "" : instType.trim();
        return TYPE_LOCAL_GOV.equals(t) || "교육청".equals(t);
    }

    /** 1금고·2금고인가. */
    static boolean rankChecked(String rank) {
        return RANK_FIRST.equals(rank) || RANK_SECOND.equals(rank);
    }

    /** S2 겹침 대상 — 1·2금고는 같은 순위끼리, 공동 지정은 '같은 은행'이 기간이 겹칠 때만, 순위 없음은 검사 안 함. */
    static boolean overlapScope(String rank, String bankA, String etcA, String bankB, String etcB) {
        if (rankChecked(rank)) return true;
        if (!"JOINT".equals(rank) || bankA == null || !bankA.equals(bankB)) return false;
        return !BANK_ETC.equals(bankA) || (etcA != null && etcB != null && squash(etcA).equals(squash(etcB)));
    }

    /**
     * 두 약정 기간이 겹치는가. 한쪽 끝과 다른 쪽 시작은 둘 중 더 거친 자릿수(연·연-월·일)까지 잘라 비교하고, 같으면 맞닿음(겹침 아님).
     * 시작(term_from)이 비어 있으면 그 쪽은 시작을 모르는 줄이라 '상대 끝이 먼저 오는' 경우만 겹침에서 빠진다.
     */
    static boolean overlaps(String aFrom, String aTo, String bFrom, String bTo) {
        return !(endsBeforeOrTouches(aTo, bFrom) || endsBeforeOrTouches(bTo, aFrom));
    }

    static boolean endsBeforeOrTouches(String to, String from) {
        if (to == null || from == null) return false;
        int n = Math.min(to.length(), from.length());
        return to.substring(0, n).compareTo(from.substring(0, n)) <= 0;
    }

    /** CURRENT / PAST / FUTURE — 저장값이 깨져 있으면 UNKNOWN(손으로 고친 DB 대비). */
    static String termState(String from, String to, LocalDate today) {
        try {
            if (to != null && end(to).isBefore(today)) return "PAST";
            if (from != null && start(from).isAfter(today)) return "FUTURE";
            return "CURRENT";
        } catch (RuntimeException e) {
            return "UNKNOWN";
        }
    }

    static LocalDate endOrNull(String t) {
        try { return t == null ? null : end(t); } catch (RuntimeException e) { return null; }
    }

    static String term(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        if (!TERM.matcher(s).matches()) throw bad("약정 기간은 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.");
        int y = Integer.parseInt(s.substring(0, 4));
        if (y < 1990 || y > 2100) throw bad("약정 기간 범위(1990~2100)를 벗어났습니다.");
        try { start(s); end(s); } catch (DateTimeException e) { throw bad("존재하지 않는 날짜입니다."); }
        return s;
    }

    static LocalDate start(String t) {
        if (t.length() == 4) return LocalDate.of(Integer.parseInt(t), 1, 1);
        if (t.length() == 7) return YearMonth.parse(t).atDay(1);
        return LocalDate.parse(t);
    }

    static LocalDate end(String t) {
        if (t.length() == 4) return LocalDate.of(Integer.parseInt(t), 12, 31);
        if (t.length() == 7) return YearMonth.parse(t).atEndOfMonth();
        return LocalDate.parse(t);
    }

    // ---- 저장 본문 ----

    static Parsed parse(BankContractIn in, String instType, LocalDate today, CodeCheck codes) {
        Parsed p = new Parsed();
        p.rank = code(in.getRankCd(), G_RANK, codes, "허용되지 않는 금고 순위입니다.");
        if (!rankAllowed(p.rank, instType)) {
            throw bad("이 기관 종류에는 쓸 수 없는 금고 순위입니다.");
        }
        p.bank = code(in.getBankCd(), G_BANK, codes, "허용되지 않는 은행입니다.");   // ENABLED=1 만 — X01·X02 는 여기서 400
        String etc = text(in.getBankNameEtc(), 30, "기타 은행 이름은 30자 이내여야 합니다.");
        if (BANK_ETC.equals(p.bank)) {
            if (etc == null) throw bad("기타를 고르면 은행 이름을 적어야 합니다.");
            if (looksListedBank(etc, codes.names(G_BANK))) throw bad("목록에 있는 은행은 목록에서 고르세요.");   // S3
            p.bankEtc = etc;
        } else if (etc != null) {
            throw bad("은행 이름 직접 입력은 '기타'를 고를 때만 씁니다.");
        }
        p.termFrom = term(in.getTermFrom());
        p.termTo = term(in.getTermTo());
        if (p.termTo == null) throw bad("약정 끝(YYYY, YYYY-MM 또는 YYYY-MM-DD)이 필요합니다.");
        if (p.termFrom != null && start(p.termFrom).isAfter(end(p.termTo))) throw bad("약정 시작이 끝보다 늦습니다.");

        p.srcKind = code(in.getSrcKind(), G_SRC, codes, "허용되지 않는 출처 종류입니다.");
        p.srcUrl = InstitutionEditRules.url(in.getSrcUrl());
        p.srcNo = InstitutionEditRules.notice(in.getSrcNo());
        String cd = in.getCheckedDate() == null ? null : in.getCheckedDate().trim();
        if (cd == null || cd.isEmpty()) throw bad("확인일(YYYY-MM-DD)이 필요합니다.");
        p.checkedDate = InstitutionEditRules.date(cd);
        if (LocalDate.parse(p.checkedDate).isAfter(today)) throw bad("확인일은 오늘보다 뒤일 수 없습니다.");
        p.checkedDept = text(in.getCheckedDept(), 50, "확인한 부서명은 50자 이내여야 합니다.");
        if (SRC_STAFF.equals(p.srcKind)) {
            if (p.checkedDept == null) throw bad("담당자 확인은 확인한 기관 부서명이 필요합니다.");
        } else if (p.srcUrl == null && p.srcNo == null) {
            throw bad("출처 링크 또는 문서·공고 번호가 필요합니다.");
        }
        if (SRC_LINK.equals(p.srcKind) && p.srcUrl == null) throw bad("공고·문서 링크를 고르면 링크가 필요합니다.");
        if (SRC_DOC_NO.equals(p.srcKind) && p.srcNo == null) throw bad("문서·공고 번호를 고르면 번호가 필요합니다.");
        p.note = text(in.getNote(), 100, "비고는 100자 이내여야 합니다.");

        // 맡는 회계(선택) — 지자체·교육청 약정에서만
        String acEtc = text(in.getAccountEtc(), 30, "기타 회계 이름은 30자 이내여야 합니다.");
        String ac = in.getAccountCd() == null ? null : in.getAccountCd().trim();
        if (ac != null && ac.isEmpty()) ac = null;
        if (ac == null) {
            if (acEtc != null) throw bad("회계 직접 입력은 '기타'를 고를 때만 씁니다.");
        } else {
            if (!fixedRankType(instType)) throw bad("맡는 회계는 지자체·교육청 약정에서만 입력합니다.");
            p.account = code(ac, G_ACCOUNT, codes, "허용되지 않는 회계 구분입니다.");
            if (ACCOUNT_ETC.equals(p.account)) {
                if (acEtc == null) throw bad("기타를 고르면 회계 이름을 적어야 합니다.");
                p.accountEtc = acEtc;
            } else if (acEtc != null) {
                throw bad("회계 직접 입력은 '기타'를 고를 때만 씁니다.");
            }
        }

        Screen s = new Screen();
        s.free(p.bankEtc);                // 개인정보·정당·전화번호
        s.free(p.checkedDept);
        s.free(p.note);
        s.free(p.accountEtc);
        s.name(p.checkedDept);            // S4 사람 이름+직함. [확장 자리] note 도 보려면 s.name(p.note) 한 줄 추가(오탐이 늘어난다)
        s.ident(p.srcNo);                 // S5 번호 칸 — 개인정보·전화번호만(정당 낱말은 안 봄)
        s.ident(queryOf(p.srcUrl));       // S5 링크는 쿼리 부분만 같은 검사(경로·호스트는 안 봄)
        s.throwIfAny();
        return p;
    }

    /** 취소 사유(S10 필수) — 코드는 BANK_CANCEL_REASON, ETC 면 짧은 글(개인정보 검사). */
    static CancelParsed parseCancel(BankContractCancelIn in, CodeCheck codes) {
        CancelParsed c = new CancelParsed();
        c.reasonCd = code(in.getCancelReasonCd(), G_CANCEL, codes, "취소 사유를 목록에서 골라 주세요.");
        String etc = text(in.getCancelReasonEtc(), 50, "기타 취소 사유는 50자 이내여야 합니다.");
        if (CANCEL_ETC.equals(c.reasonCd)) {
            if (etc == null) throw bad("기타를 고르면 취소 사유를 적어야 합니다.");
            c.reasonEtc = etc;
        } else if (etc != null) {
            throw bad("취소 사유 직접 입력은 '기타'를 고를 때만 씁니다.");
        }
        Screen s = new Screen();
        s.free(c.reasonEtc);
        s.name(c.reasonEtc);   // N2 사람 이름+직함
        s.throwIfAny();
        return c;
    }

    static boolean same(BankContract c, Parsed p) {
        return Objects.equals(c.getRankCd(), p.rank) && Objects.equals(c.getBankCd(), p.bank)
                && Objects.equals(c.getBankNameEtc(), p.bankEtc) && Objects.equals(c.getTermFrom(), p.termFrom)
                && Objects.equals(c.getTermTo(), p.termTo) && Objects.equals(c.getSrcKind(), p.srcKind)
                && Objects.equals(c.getSrcUrl(), p.srcUrl) && Objects.equals(c.getSrcNo(), p.srcNo)
                && Objects.equals(c.getCheckedDate(), p.checkedDate) && Objects.equals(c.getCheckedDept(), p.checkedDept)
                && Objects.equals(c.getAccountCd(), p.account) && Objects.equals(c.getAccountEtc(), p.accountEtc)
                && Objects.equals(c.getNote(), p.note);
    }

    /** 겹침 확인 이어받기(NEXT 89②): 직전 rev 가 겹침을 확인했고(OVERLAP_CONFIRMED=1) 순위·은행·기간이 그대로면 true. 하나라도 바뀌면 false. 취소 행은 save() 가 앞에서 막는다. */
    static boolean carriesOverlap(BankContract prev, Parsed p) {
        return prev != null && prev.getOverlapConfirmed() == 1
                && Objects.equals(prev.getRankCd(), p.rank) && Objects.equals(prev.getBankCd(), p.bank)
                && Objects.equals(prev.getBankNameEtc(), p.bankEtc)
                && Objects.equals(prev.getTermFrom(), p.termFrom) && Objects.equals(prev.getTermTo(), p.termTo);
    }

    private static String code(String raw, String group, CodeCheck codes, String msg) {
        String v = raw == null ? null : raw.trim();
        if (v == null || !CODE.matcher(v).matches() || !codes.enabled(group, v)) throw bad(msg);
        return v;
    }

    /** 앞뒤 공백 제거, 빈 값은 null, 줄바꿈·제어 문자와 서식 문자(S7, U+202E·U+200B 등 — SafeUrl 과 같은 기준) 거부, 글자 수(코드 포인트) 상한. */
    static String text(String raw, int max, String lenMsg) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty()) return null;
        for (int i = 0; i < v.length(); ) {
            int cp = v.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isISOControl(cp)) throw bad("줄바꿈·제어 문자는 넣을 수 없습니다.");
            if (Character.getType(cp) == Character.FORMAT) throw bad("보이지 않는 서식 문자는 넣을 수 없습니다.");
        }
        if (v.codePointCount(0, v.length()) > max) throw bad(lenMsg);
        return v;
    }

    // ---- S3: 기타 은행 이름이 목록 은행을 흉내 내는가 ----

    /** 영문 약어는 앞뒤가 영문이 아닐 때만(케이뱅크·Kbank 같은 다른 은행을 안 막으려고). 목록 은행 핵심어를 바꾸려면 이 한 줄. */
    private static final Pattern LISTED_BANK = Pattern.compile(
            "국민|농협|신한|수협|우리은행|하나은행|기업은행|부산은행|경남은행|광주은행|전북은행|제주은행|대구은행|아이엠뱅크"
                    + "|(?<![a-z])(?:kb|nh|ibk|bnk|im)(?![a-z])");

    /** NFKC·소문자·글자와 숫자만 남김(공백·기호·서식 문자 제거) 뒤 핵심어 포함 또는 코드표 이름 포함이면 true. */
    static boolean looksListedBank(String etc, List<String> codeNames) {
        String n = squash(etc);
        if (LISTED_BANK.matcher(n).find()) return true;
        for (String name : codeNames) {
            String k = squash(name);
            if (k.length() >= 3 && n.contains(k)) return true;
        }
        return false;
    }

    static String squash(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder b = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isLetterOrDigit(cp)) b.appendCodePoint(cp);
        }
        return b.toString();
    }

    // ---- S4: 사람 이름 + 직함 ----

    private static final Pattern PERSON = Pattern.compile(
            "([가-힣]{2,})(\\s*\\(?\\s*)(주무관|주사보|주사|계장|팀장|과장|담당자|님|씨)\\)?(?:님)?"
                    + "(?:(?![가-힣])|(?=[은는이가의을를과와도에께]))");
    private static final String[] ORG_END = {"과", "팀", "부", "실", "국", "청", "처", "센터", "담당"};
    private static final Set<String> GENERIC = new HashSet<String>(Arrays.asList(
            "담당", "담당자", "관계자", "책임자", "직원", "고객", "해당", "실무", "업무", "부서", "기관"));
    private static final Set<String> ROLE_ONLY = new HashSet<String>(Arrays.asList("과장", "팀장", "계장"));

    /**
     * "홍길동 주무관"·"김철수 과장님"·"박민수주사" 같은 이름+직함. 부서 이름(재정과 팀장), 일반 낱말(담당자님),
     * 공백 없는 두 글자+과장·팀장·계장(재정과장 = 부서 줄임말+직함)은 통과시킨다. 사전·정규식 기반이라 새 표현은 샐 수 있다(5절).
     */
    static boolean hasPersonName(String text) {
        Matcher m = PERSON.matcher(Normalizer.normalize(text, Normalizer.Form.NFKC));
        while (m.find()) {
            String name = m.group(1), gap = m.group(2), title = m.group(3);
            if (name.length() > 4) {   // N1 앞에 한글이 붙은 경우('재정과홍길동주무관') — 뒤 세 글자를 이름으로 본다
                if (gap.isEmpty() && ROLE_ONLY.contains(title)) continue;   // '재정과세입팀장' 같은 부서+직함은 통과
                name = name.substring(name.length() - 3);
            }
            if (name.length() >= 3) {
                boolean org = false;
                for (String e : ORG_END) if (name.endsWith(e)) { org = true; break; }
                if (org) continue;
            }
            if (GENERIC.contains(name)) continue;
            if (gap.isEmpty() && name.length() == 2 && ROLE_ONLY.contains(title)) continue;
            return true;
        }
        return false;
    }

    // ---- S5: 링크의 쿼리 부분 ----

    static String queryOf(String url) {
        if (url == null) return null;
        try {
            String q = new URI(url).getRawQuery();
            if (q == null) return null;
            try { return URLDecoder.decode(q, "UTF-8"); } catch (Exception e) { return q; }
        } catch (Exception e) {
            return null;
        }
    }

    // ---- 개인정보·금지어 모음 → 422 (종류만, 입력값은 싣지 않는다) ----

    private static final class Screen {
        private final Map<String, Integer> pii = new LinkedHashMap<String, Integer>();
        private final List<HeadForbidden.Kind> forb = new ArrayList<HeadForbidden.Kind>();

        /** 자유 글: 개인정보 → 정당·전화번호. */
        void free(String t) { if (t == null) return; scanPii(t); scanForbidden(t, true); }
        /** 번호·링크 쿼리: 개인정보·전화번호만(정당 낱말은 보지 않는다 — 문서 번호 오탐 방지). */
        void ident(String t) { if (t == null) return; scanPii(t); scanForbidden(t, false); }
        void name(String t) { if (t != null && hasPersonName(t)) bump("NAME"); }

        private void scanPii(String t) { for (Pii.Finding f : Pii.scanLoose(t)) bump(f.getKind()); }

        private void scanForbidden(String t, boolean party) {
            for (HeadForbidden.Kind k : HeadForbidden.scan(t)) {
                if ((k == HeadForbidden.Kind.PHONE || (party && k == HeadForbidden.Kind.PARTY)) && !forb.contains(k)) forb.add(k);
            }
        }

        private void bump(String k) { Integer n = pii.get(k); pii.put(k, n == null ? 1 : n + 1); }

        void throwIfAny() {
            if (!pii.isEmpty()) {
                List<Map<String, Object>> kinds = new ArrayList<Map<String, Object>>();
                for (Map.Entry<String, Integer> e : pii.entrySet()) {
                    Map<String, Object> k = new LinkedHashMap<String, Object>();
                    k.put("kind", e.getKey());
                    k.put("count", e.getValue());
                    kinds.add(k);
                }
                String msg = "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 부분을 지우고 다시 입력해 주세요.";
                if (pii.containsKey("NAME")) msg += " 담당자 이름은 적지 말고 부서명만 적어 주세요.";
                throw unprocessable("PII_BLOCKED", msg, kinds);
            }
            if (!forb.isEmpty()) {
                List<Map<String, Object>> kinds = new ArrayList<Map<String, Object>>();
                for (HeadForbidden.Kind k : forb) {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("kind", k.name());
                    m.put("label", k.getLabel());
                    kinds.add(m);
                }
                throw unprocessable("CONTRACT_FORBIDDEN", "금고 약정 기록에 넣을 수 없는 내용(정당·전화번호)이 있습니다. 해당 부분을 지우고 다시 입력해 주세요.", kinds);
            }
        }
    }

    private static ApiException unprocessable(String code, String msg, Object kinds) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", msg);
        d.put("kinds", kinds);
        return ApiException.withDetail(422, d);
    }

    private static ApiException bad(String m) { return ApiException.badRequest(m); }
}
