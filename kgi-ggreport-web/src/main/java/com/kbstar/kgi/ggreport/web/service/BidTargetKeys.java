package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import com.kbstar.kgi.ggreport.web.domain.BidTarget;
import com.kbstar.kgi.ggreport.web.domain.BidTargetReqItem;
import com.kbstar.kgi.ggreport.web.domain.TargetCaseRef;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import java.util.*;

/**
 * NEXT 125(사용자 11-26) — 목표 = 입찰 건. 업무 키 = 기관 + 입찰 대상(ETC 는 이름까지) + 금고 순위(AIM_RANK_CD) + 목표 연도.
 * 금고 순위는 MAIN_BANK 건에만(NULL = 미정), 그 밖 대상은 늘 NULL(해당 없음). 같은 (기관·연도·대상)에 살아 있는 목표 건 1개,
 * 스위치(multi-subject)가 켜졌을 때만 MAIN_BANK 1금고+2금고 두 건을 함께 둘 수 있다(기타·단수·주거래·미정은 혼자).
 * 판정은 '바뀐 뒤 모습' 전체(일괄 요청의 미정→1금고 + 2금고 넣기가 함께 통과). 순수 로직(DB 없음). 오류 문구는 고정 문구(입력값 없음).
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙.
 */
final class BidTargetKeys {
    static final String DUP_MSG = "이 기관은 같은 연도·같은 입찰 대상의 목표 건이 이미 있습니다. 금고는 1금고와 2금고만 함께 둘 수 있습니다.";
    static final String RANK_NA_MSG = "금고 순위는 입찰 대상이 '주거래은행·금고'인 목표 건에만 정합니다.";
    static final String SUBJECT_MSG = "입찰 대상을 목록에서 골라 주세요.";
    static final String ETC_MSG = "기타 입찰 대상 이름은 1~50자로 적어 주세요.";
    static final String ETC_ONLY_MSG = "입찰 대상 이름 직접 입력은 '기타'를 고를 때만 씁니다.";
    static final String SUBJECT_FIXED_MSG = "입찰 대상은 바꿀 수 없습니다. 목표에서 빼고 새로 넣어 주세요.";
    static final String SUBJECT_OFF_MSG = "주거래은행·금고 밖의 입찰 대상은 아직 목표로 넣을 수 없습니다.";
    static final String WATCH_SUBJECT_MSG = "관심 기관에는 입찰 대상을 두지 않습니다.";
    static final String RANK_LOCKED_MSG = "제안 준비가 진행 중인 공고와 이어진 목표 건은 금고 순위를 바꿀 수 없습니다(미정이면 한 번 정할 수 있습니다).";
    static final String SLOT_PENDING_MSG = "같은 연도·같은 입찰 대상의 목표 건에 결재가 진행 중입니다. 결재가 끝난 뒤 다시 시도해 주세요.";
    static final String TARGET_PENDING_MSG = "이 목표 건은 변경 결재가 진행 중입니다. 결재가 끝난 뒤 다시 시도해 주세요.";
    static final String NA = "NA", UNDECIDED = "UNDECIDED", SET = "SET";

    /** 업무 키 한 칸 — 연도·대상·(기타면 정규화 이름) 이 같으면 같은 칸. 금고 순위는 칸 안의 구분. */
    static final class Slot {
        final int no;            // 기존 건 번호(>0) 또는 새 건(<=0)
        final Integer year;
        final String subject, etcKey, aim;
        Slot(int no, Integer year, String subject, String etc, String aim) {
            this.no = no; this.year = year;
            this.subject = subject == null ? BidSubjects.MAIN_BANK : subject;
            this.etcKey = BidSubjects.ETC.equals(this.subject) ? etcKey(etc) : "";
            this.aim = aim;
        }
        static Slot of(BidTarget t) { return new Slot(t.getTargetNo(), t.getTargetYear(), t.getBidSubjectCd(), t.getBidSubjectEtc(), t.getAimRankCd()); }
        String bucket() { return year + "|" + subject + "|" + etcKey; }
    }

    private BidTargetKeys() { }

    /** NFKC + 보이지 않는 공백·NBSP·전각 공백을 공백 하나로 → trim → 소문자(security 고칠 것 ⑥). */
    static String etcKey(String etc) {
        if (etc == null) return "";
        String n = java.text.Normalizer.normalize(etc, java.text.Normalizer.Form.NFKC);
        return n.replaceAll("[\\s\\u00A0\\u3000\\u200B\\uFEFF]+", " ").trim().toLowerCase(Locale.ROOT);
    }

    /** NA 해당 없음(금고 밖) | UNDECIDED 미정 | SET. */
    static String rankState(String subject, String aim) {
        if (subject != null && !BidSubjects.MAIN_BANK.equals(subject)) return NA;
        return aim == null ? UNDECIDED : SET;
    }

    /**
     * 정렬값: 코드표 SORT_NO(1금고 1·2금고 2·단수 3·주거래 4·기타 5), 정하지 않음 90, 해당 없음(금고 밖) 99.
     * 코드표에 없는 값은 89(미정보다 앞, 알 수 없는 코드가 맨 뒤로 숨지 않게).
     */
    static int aimSort(String subject, String aim, Integer codeSort) {
        if (subject != null && !BidSubjects.MAIN_BANK.equals(subject)) return 99;
        if (aim == null) return 90;
        return codeSort == null ? 89 : codeSort.intValue();
    }

    /** [코드, 기타 이름]. 비우면 MAIN_BANK. 켜진 코드만. ETC 는 이름 1~50자(글자 규칙 + 금칙), 그 밖에 이름이 오면 400. 스위치는 requireSubjectAllowed. */
    static String[] subject(String cdRaw, String etcRaw, BankContractRules.CodeCheck codes) {
        String cd = cdRaw == null ? "" : cdRaw.trim();
        if (cd.isEmpty()) cd = BidSubjects.MAIN_BANK;
        if (!cd.matches("[A-Z0-9_]{1,20}") || !codes.enabled(BidSubjects.GROUP, cd)) throw ApiException.badRequest(SUBJECT_MSG);
        String etc = BankContractRules.text(etcRaw, 50, ETC_MSG);
        if (BidSubjects.ETC.equals(cd)) {
            if (etc == null) throw ApiException.badRequest(ETC_MSG);
            new MemoScreen("TARGET_FORBIDDEN", BidTargetRules.FORBIDDEN_MSG).free(etc).throwIfAny();
        } else if (etc != null) {
            throw ApiException.badRequest(ETC_ONLY_MSG);
        }
        return new String[]{cd, etc};
    }

    static boolean subjectGiven(String cd, String etc) {
        return (cd != null && !cd.trim().isEmpty()) || (etc != null && !etc.trim().isEmpty());
    }

    static void requireRankFits(String subject, String aim) {
        if (aim != null && subject != null && !BidSubjects.MAIN_BANK.equals(subject)) throw ApiException.badRequest(RANK_NA_MSG);
    }

    /** 스위치 검사 하나(security 막을 것 ②): 꺼짐 = 새 비금고 건 만들기(ADD·TO_GOAL)만 400. 기존 건 고치기·빼기·확정은 허용. */
    static void requireSubjectAllowed(String subject, boolean creating, boolean multi) {
        if (creating && !multi && subject != null && !BidSubjects.MAIN_BANK.equals(subject)) throw ApiException.badRequest(SUBJECT_OFF_MSG);
    }

    /**
     * 바뀐 뒤 모습에서 규칙을 어기는 건 하나(이미 있던 건 먼저). 맞으면 null. year == null 은 목표가 아니라 뺀다.
     * 스위치가 꺼지면 1금고+2금고 쌍도 막는다(기관·연도·대상당 1건 — 옛 화면이 줄을 덮어 숨기지 않게).
     */
    static Slot conflictOf(Collection<Slot> after, boolean multi) {
        Map<String, List<Slot>> by = new LinkedHashMap<String, List<Slot>>();
        for (Slot s : after) {
            if (s.year == null) continue;
            List<Slot> l = by.get(s.bucket());
            if (l == null) { l = new ArrayList<Slot>(); by.put(s.bucket(), l); }
            l.add(s);
        }
        for (List<Slot> l : by.values()) {
            if (l.size() < 2 || (multi && pairOk(l))) continue;
            for (Slot s : l) if (s.no > 0) return s;
            return l.get(0);
        }
        return null;
    }

    /** 함께 둘 수 있는 짝 = MAIN_BANK 1금고+2금고뿐. 기타(OTHER)·단수·주거래·미정은 혼자. */
    private static boolean pairOk(List<Slot> l) {
        if (l.size() != 2 || !BidSubjects.MAIN_BANK.equals(l.get(0).subject)) return false;
        Set<String> r = new HashSet<String>();
        for (Slot s : l) r.add(s.aim);
        return r.size() == 2 && r.contains("FIRST") && r.contains("SECOND");
    }

    /** 결재 중 항목이 건드리는 칸(바뀌기 전 = BASE 가 목표였을 때, 바뀐 뒤 = TO_YEAR). selfReq 의 항목은 뺀다(승인 재검사). */
    static Set<String> pendingBuckets(List<BidTargetReqItem> pend, Long selfReq) {
        Set<String> out = new HashSet<String>();
        for (BidTargetReqItem x : pend) {
            if (selfReq != null && selfReq.equals(x.getReqId())) continue;
            String subj = x.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : x.getBidSubjectCd();
            if (x.getBaseYear() != null && BidTargetRules.KIND_GOAL.equals(x.getBaseKindCd())) out.add(new Slot(0, x.getBaseYear(), subj, x.getBidSubjectEtc(), null).bucket());
            if (x.getToYear() != null) out.add(new Slot(0, x.getToYear(), subj, x.getBidSubjectEtc(), null).bucket());
        }
        return out;
    }

    /** 금고 약정 줄을 그 건의 순위로 거른다 — 1·2금고 건은 그 순위 줄만, 그 밖(미정·단수·주거래·기타)은 모두. */
    static List<BankContract> linesFor(List<BankContract> lines, String aim) {
        if (lines == null || !("FIRST".equals(aim) || "SECOND".equals(aim))) return lines;
        List<BankContract> out = new ArrayList<BankContract>();
        for (BankContract c : lines) if (aim.equals(c.getRankCd())) out.add(c);
        return out;
    }

    /** 진행 중(새 확정을 막는 활성)인가 — 상태 6종이면서 탈락·협약 완료가 아님(PrepStage5). marks = 건 번호 → (칸 → 현재 값). */
    static boolean blocking(TargetCaseRef c, Map<String, Map<String, String>> marks) {
        Map<String, String> m = marks.containsKey(c.getBidCaseId()) ? marks.get(c.getBidCaseId()) : Collections.<String, String>emptyMap();
        return PrepStage5.blocking(c.getStateCd(), m);
    }

    /**
     * 명시 연결이 없는 목표 건 → 추정 제안 건(열쇠 "기관#번호"). 같은 (기관·대상·연도)에 연결 없는 목표 건이 1개이고,
     * 어느 목표에도 명시 연결 안 된 진행 중 제안이 1개(확정 KST 연도 = 목표 연도, 순위 어긋나지 않음)일 때만. 쓰기 없음.
     */
    static Map<String, String> infer(List<BidTarget> goals, List<TargetCaseRef> cases, Map<String, Map<String, String>> marks) {
        Set<String> linked = new HashSet<String>();
        for (BidTarget t : goals) if (t.getBidCaseId() != null) linked.add(t.getBidCaseId());
        Map<String, List<BidTarget>> open = new LinkedHashMap<String, List<BidTarget>>();
        for (BidTarget t : goals) {
            if (t.getBidCaseId() != null || t.getTargetYear() == null) continue;
            String k = t.getInstitutionId() + "|" + Slot.of(t).bucket();
            List<BidTarget> l = open.get(k);
            if (l == null) { l = new ArrayList<BidTarget>(); open.put(k, l); }
            l.add(t);
        }
        Map<String, String> out = new HashMap<String, String>();
        for (List<BidTarget> l : open.values()) {
            if (l.size() != 1) continue;
            BidTarget t = l.get(0);
            Slot s = Slot.of(t);
            String hit = null;
            int n = 0;
            for (TargetCaseRef c : cases) {
                if (!t.getInstitutionId().equals(c.getInstitutionId()) || linked.contains(c.getBidCaseId()) || !blocking(c, marks)) continue;
                String cs = c.getBidSubjectCd() == null ? BidSubjects.MAIN_BANK : c.getBidSubjectCd();
                if (!s.subject.equals(cs)) continue;
                if (BidSubjects.ETC.equals(cs) && c.getBidSubjectEtc() != null && !s.etcKey.equals(etcKey(c.getBidSubjectEtc()))) continue;
                String d = PrepBoardService.kstDate(c.getConfirmedAt());
                if (d == null || !d.startsWith(String.valueOf(t.getTargetYear()))) continue;
                if (t.getAimRankCd() != null && c.getBidRankCd() != null && !t.getAimRankCd().equals(c.getBidRankCd())) continue;
                hit = c.getBidCaseId();
                n++;
            }
            if (n == 1) out.put(t.getInstitutionId() + "#" + t.getTargetNo(), hit);
        }
        return out;
    }
}
