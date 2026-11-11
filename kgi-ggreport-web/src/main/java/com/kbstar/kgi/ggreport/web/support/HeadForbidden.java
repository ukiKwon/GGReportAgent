package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 기관장 정보(NEXT 72·77, 026) 글자 칸의 금지 내용 검사 — 정당·범죄 경력·건강·종교·가족·경조사·전화번호(사용자 결정 2026-11-11).
 * 걸리면 저장하지 않고 422 {@code HEAD_FORBIDDEN} 이며 응답에는 <b>종류만</b> 싣는다(입력값 금지).
 *
 * <p>방식(qa P1, 팀 결정): 부분 문자열이 아니라 <b>구체적 표현</b>만 본다. 정당은 정당명 목록(공백 제거본)과 "○○당 + 직책" 형태,
 * 그 밖의 종류는 <b>단어 경계</b>({@link #w})로 본다 — 단어 앞에 한글이 붙어 있으면 다른 낱말의 일부로 보고(재난안전과장의 '전과', 통신부의 '신부',
 * 인권사무소장의 '권사'), 뒤에는 끝·한글 아닌 글자·조사만 허용한다. 공백은 한 칸으로만 접고 지우지 않는다("고려대학교 회계학과"의 '교회' 오탐 방지).
 * <b>이름(NAME) 칸은 이 검사에서 제외</b>한다 — 전화번호·개인정보 검사만({@link #rejectName}). 사람 이름(고희정·신도윤 등)이 낱말과 겹치기 때문이다.
 *
 * <p>⚠️ 사전 기반이라 새 정당명·은어·외국어는 빠질 수 있다(테스트 표로 고정). 단어 확정은 기획 몫이다(이관).
 * 주소·계좌·여권은 검출하지 못한다. 검사 대상: POSITION·EDU·CAREER·SRC_TITLE·SRC_ORG_NAME·모든 REASON(+ NAME 은 전화번호만). SRC_URL 은 대상이 아니다.
 */
public final class HeadForbidden {

    public enum Kind {
        PARTY("정당"), CRIME("범죄 경력"), HEALTH("건강"), RELIGION("종교"), FAMILY("가족 관계"), EVENT("경조사"), PHONE("전화번호");

        private final String label;

        Kind(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /** 단어 경계 패턴 — 앞에 한글이 없고, 뒤는 끝·한글 아닌 글자·조사(은는이가의을를과와도에형으로)만. */
    private static Pattern w(String words) {
        return Pattern.compile("(?<![가-힣])(?:" + words + ")(?:(?![가-힣])|(?=[은는이가의을를과와도에형으]))");
    }

    private static final String[] PARTY_NAMES = {"더불어민주당", "민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "정의당", "녹색정의당", "녹색당",
            "기본소득당", "사회민주당", "새로운미래", "자유통일당", "우리공화당", "국민의미래", "더불어민주연합", "미래한국당", "더불어시민당", "미래통합당",
            "자유한국당", "바른미래당", "바른정당", "국민의당", "민생당", "민주평화당", "새누리당", "한나라당", "새정치민주연합", "민주통합당", "통합진보당",
            "열린우리당", "자유선진당", "친박연대", "새천년민주당", "민주노동당", "창조한국당", "대안신당", "노동당"};
    /** 정당 낱말 — 단어 경계. 담당·해당·식당·제당·전당 등은 '당' 앞 글자 예외로 거른다. */
    private static final String NOT_DANG = "(?<![담해상배할타부적충감수제식강학서본성전회명경])";
    private static final Pattern PARTY_WORDS = Pattern.compile(
            w("당원협의회|당협위원장|원내대표|원내수석|최고위원|중앙당|시당위원장|도당위원장|창당|탈당|입당|복당|공천|당원|당적").pattern()
                    + "|" + NOT_DANG + "당대표");
    private static final Pattern PARTY_ROLE = Pattern.compile(
            "([가-힣]{1,12}당) ?(?:시당|도당|중앙당|당원|대변인|수석대변인|사무총장|정책위의장|지역위원장|위원장|대표|소속|후보|비례대표|중앙위원|최고위원)");
    private static final String[] NON_PARTY_DANG = {"담당", "해당", "상당", "배당", "할당", "타당", "부당", "적당", "충당", "감당", "수당", "당당",
            "제당", "식당", "강당", "학당", "서당", "본당", "성당", "예배당", "사당", "전당", "회당", "공회당", "명당", "경로당", "서원당"};

    private static final Pattern CRIME = Pattern.compile(
            "전과 ?[0-9]+범|" + w("전과|벌금형|집행유예|선고유예|징역|실형|구속|기소|유죄|무죄|형사처벌|수감|복역|피의자|피고인|입건|당선무효|선거법위반").pattern());
    private static final Pattern HEALTH = Pattern.compile(
            "암 ?진단|요양 ?중|건강 ?악화|건강상의? ?이유|" + w("투병|입원|수술|질환|지병|병력|장애등급|진단서").pattern());
    private static final Pattern RELIGION = Pattern.compile(
            "교회 ?(?:출석|봉사|다니|다녀)|기독교|개신교|천주교|원불교|이슬람|"
                    + w("목사님|신부님|권사님|집사님|장로님|목사|장로|집사|스님|승려|권사|신부|수녀|신자|불자|교인|세례|성당|사찰|교회").pattern());
    private static final Pattern FAMILY = Pattern.compile(
            w("배우자|부인|남편|아내|아들|딸|장남|장녀|차남|차녀|자녀|부친|모친|아버지|어머니|사위|며느리|손자|손녀|조카|장모|처가|시댁").pattern());
    private static final Pattern EVENT = Pattern.compile(
            w("부친상|모친상|빙부상|빙모상|결혼식|혼인|이혼|재혼|약혼|별세|부고|장례|빈소|조문|발인|돌잔치|회갑|칠순|팔순|출산").pattern());
    private static final Pattern LANDLINE = Pattern.compile(
            "(?<!\\d)\\(?0(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|50[2-8])\\)?[-\\s]?\\d{3,4}[-\\s]?\\d{4}(?!\\d)");
    /** 1588-xxxx 등 대표번호. */
    private static final Pattern REP_NUMBER = Pattern.compile("(?<!\\d)1[568]\\d{2}-\\d{4}(?!\\d)");

    private HeadForbidden() {
    }

    private static boolean skip(int cp) {
        return Character.getType(cp) == Character.FORMAT || cp == 0x00B7 || cp == 0x30FB;
    }

    /** 정당명 비교용 — NFKC + 공백·서식문자·가운뎃점 제거("국민 의힘" 우회 차단). */
    static String key(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC);
        StringBuilder b = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isWhitespace(cp) || skip(cp)) {
                continue;
            }
            b.appendCodePoint(cp);
        }
        return b.toString();
    }

    /** 단어 경계 검사용 — NFKC + 서식문자·가운뎃점 제거 + 공백은 한 칸으로 접는다(지우지 않는다). */
    static String spaced(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC);
        StringBuilder b = new StringBuilder(n.length());
        boolean lastSpace = false;
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            i += Character.charCount(cp);
            if (skip(cp)) {
                continue;
            }
            if (Character.isWhitespace(cp)) {
                if (!lastSpace) {
                    b.append(' ');
                }
                lastSpace = true;
                continue;
            }
            lastSpace = false;
            b.appendCodePoint(cp);
        }
        return b.toString().trim();
    }

    public static List<Kind> scan(String text) {
        List<Kind> out = scanText(text);
        if (hasPhone(text) && !out.contains(Kind.PHONE)) {
            out.add(Kind.PHONE);
        }
        return out;
    }

    private static List<Kind> scanText(String text) {
        List<Kind> out = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        String k = key(text);
        String s = spaced(text);
        if (containsAny(k, PARTY_NAMES) || PARTY_WORDS.matcher(s).find() || partyRole(k) || partyRole(s)) {
            out.add(Kind.PARTY);
        }
        if (CRIME.matcher(s).find()) {
            out.add(Kind.CRIME);
        }
        if (HEALTH.matcher(s).find()) {
            out.add(Kind.HEALTH);
        }
        if (RELIGION.matcher(s).find()) {
            out.add(Kind.RELIGION);
        }
        if (FAMILY.matcher(s).find()) {
            out.add(Kind.FAMILY);
        }
        if (EVENT.matcher(s).find()) {
            out.add(Kind.EVENT);
        }
        return out;
    }

    private static boolean hasPhone(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        String f = Pii.foldLoose(text);   // 전각 숫자·대시류·'.' 구분자 정규화
        return LANDLINE.matcher(f).find() || REP_NUMBER.matcher(f).find();
    }

    private static boolean containsAny(String k, String[] words) {
        for (String w : words) {
            if (k.contains(w)) {
                return true;
            }
        }
        return false;
    }

    private static boolean partyRole(String k) {
        Matcher m = PARTY_ROLE.matcher(k);
        while (m.find()) {
            String head = m.group(1);
            boolean exempt = false;
            for (String w : NON_PARTY_DANG) {
                if (head.endsWith(w)) {
                    exempt = true;
                    break;
                }
            }
            if (!exempt) {
                return true;
            }
        }
        return false;
    }

    /**
     * 각 글자 칸을 먼저 개인정보 검사(주민·외국인등록·카드·휴대폰·이메일 → 422 PII_BLOCKED, 종류·건수만)로 보고, 다음 금지 내용 검사
     * (422 HEAD_FORBIDDEN, 종류만). 입력값은 응답·로그에 싣지 않는다. null·빈 값은 건너뛴다.
     */
    public static void rejectAny(String... texts) {
        check(false, texts);
    }

    /** 이름 칸용 — 개인정보·전화번호만 본다(정당·범죄 등 낱말 검사는 제외: 사람 이름이 낱말과 겹친다). */
    public static void rejectName(String name) {
        check(true, name);
    }

    private static void check(boolean nameOnly, String... texts) {
        Map<String, Integer> pii = new LinkedHashMap<>();
        for (String t : texts) {
            if (t == null || t.isEmpty()) {
                continue;
            }
            for (Pii.Finding f : Pii.scanLoose(t)) {
                Integer n = pii.get(f.getKind());
                pii.put(f.getKind(), n == null ? 1 : n + 1);
            }
        }
        if (!pii.isEmpty()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", "PII_BLOCKED");
            d.put("message", "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 부분을 지우고 다시 입력해 주세요.");
            List<Map<String, Object>> kinds = new ArrayList<>();
            for (Map.Entry<String, Integer> e : pii.entrySet()) {
                Map<String, Object> k = new LinkedHashMap<>();
                k.put("kind", e.getKey());
                k.put("count", e.getValue());
                kinds.add(k);
            }
            d.put("kinds", kinds);
            throw ApiException.withDetail(422, d);
        }
        List<Kind> found = new ArrayList<>();
        for (String t : texts) {
            List<Kind> ks = nameOnly ? phoneOnly(t) : scan(t);
            for (Kind k : ks) {
                if (!found.contains(k)) {
                    found.add(k);
                }
            }
        }
        if (!found.isEmpty()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", "HEAD_FORBIDDEN");
            d.put("message", "기관장 정보에 넣을 수 없는 내용이 있습니다. 해당 부분을 지우고 다시 입력해 주세요.");
            List<Map<String, Object>> kinds = new ArrayList<>();
            for (Kind k : found) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("kind", k.name());
                m.put("label", k.getLabel());
                kinds.add(m);
            }
            d.put("kinds", kinds);
            throw ApiException.withDetail(422, d);
        }
    }

    private static List<Kind> phoneOnly(String t) {
        List<Kind> out = new ArrayList<>();
        if (hasPhone(t)) {
            out.add(Kind.PHONE);
        }
        return out;
    }
}
