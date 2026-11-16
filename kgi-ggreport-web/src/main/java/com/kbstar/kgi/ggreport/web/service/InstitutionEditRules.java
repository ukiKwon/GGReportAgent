package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

/** PUT /institutions/{id} 의 입력 검사와 '확정/추정·운영 상태' 규칙. 오류 문구는 고정 문구뿐(내부 정보 없음). */
final class InstitutionEditRules {

    static final String OP_GROUP = "INST_OP_STATUS";
    static final String OP_PLANNED = "PLANNED";
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern OPEN = Pattern.compile("\\d{4}(-\\d{2}(-\\d{2})?)?");
    private static final Pattern NO = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N} _./()\\-]{0,49}");
    private static final String URL_MSG = "출처 링크는 http 또는 https 주소(500자 이내)여야 합니다.";
    static final int TYPE_MAX = 50;      // INSTITUTIONS.TYPE VARCHAR(50)
    static final int LAST_BID_MAX = 40;  // INSTITUTIONS.LAST_BID VARCHAR(40) (004 이후)

    interface CodeCheck {
        boolean enabled(String group, String code);
    }

    /** 바뀐 칸 1개 = 이력 1행. */
    static final class Change {
        final String field;
        final String oldVal;
        final String newVal;
        final String srcUrl;
        final String srcNo;

        Change(String field, String oldVal, String newVal, String srcUrl, String srcNo) {
            this.field = field;
            this.oldVal = oldVal;
            this.newVal = newVal;
            this.srcUrl = srcUrl;
            this.srcNo = srcNo;
        }
    }

    private InstitutionEditRules() {
    }

    /** 검증하고, 결정된 값을 upd 에 써 넣어(묶음 칸은 한 번에 저장) 바뀐 칸 목록을 돌려준다. 위반이면 400. */
    static List<Change> resolve(Institution cur, InstitutionUpdateIn upd, CodeCheck codes) {
        List<Change> out = new ArrayList<>();
        plain(out, "REGION_CODE", cur.getRegionCode(), upd.present("regionCode"), upd.getRegionCode());
        maxLen(upd.present("type"), upd.getType(), TYPE_MAX, "기관 유형은 " + TYPE_MAX + "자 이내여야 합니다.");
        maxLen(upd.present("lastBid"), upd.getLastBid(), LAST_BID_MAX, "최근 입찰 정보는 " + LAST_BID_MAX + "자 이내여야 합니다.");
        plain(out, "TYPE", cur.getType(), upd.present("type"), upd.getType());
        plain(out, "LAST_BID", cur.getLastBid(), upd.present("lastBid"), upd.getLastBid());
        plain(out, "TERM", str(cur.getTerm()), upd.present("term"), str(upd.getTerm()));
        contractEnd(out, cur, upd);
        opStatus(out, cur, upd, codes);
        return out;
    }

    /** 반입이 입찰 예정일을 바꾸는가 — 보낸 값이 있고(빈 문자열 아님) 기존과 다름. updateFromImport 의 dateChanged 인자. */
    static boolean importDateChanged(Institution cur, InstitutionImportRow row) {
        String v = row.getContractEnd();
        return v != null && !v.isEmpty() && !v.equals(cur == null ? null : cur.getContractEnd());
    }

    /**
     * CSV·inbox 반입이 바꿀 칸 목록(보안 검토 B3). SQL({@code updateFromImport})은 보낸 값이 있을 때만 덮고,
     * 입찰 예정일이 바뀌면 확정을 0 으로 내린다 — 같은 규칙으로 <b>바뀌기 전 값</b>({@code cur})과 비교한다.
     */
    static List<Change> diffImport(Institution cur, InstitutionImportRow row) {
        List<Change> out = new ArrayList<>();
        importPlain(out, "REGION_CODE", cur.getRegionCode(), row.getRegionCode());
        importPlain(out, "TYPE", cur.getType(), row.getType());
        importPlain(out, "LAST_BID", cur.getLastBid(), row.getLastBid());
        importPlain(out, "TERM", str(cur.getTerm()), str(row.getTerm()));
        if (importDateChanged(cur, row)) {   // SQL 판정과 같은 함수 — 빈 문자열 = 안 보냄(qa P3-3)
            String newEnd = row.getContractEnd();
            out.add(new Change("CONTRACT_END", cut(cur.getContractEnd()), cut(newEnd), null, null));
            if (cur.isContractEndConfirmed()) {
                out.add(new Change("CONTRACT_END_CONFIRMED", "Y", "N", null, null));   // 확정 강등
            }
        }
        return out;
    }

    private static void importPlain(List<Change> out, String f, String oldV, String newV) {
        if (newV != null && !Objects.equals(oldV, newV)) {
            out.add(new Change(f, cut(oldV), cut(newV), null, null));
        }
    }

    private static void plain(List<Change> out, String f, String oldV, boolean sent, String newV) {
        if (sent && !Objects.equals(oldV, newV)) {
            out.add(new Change(f, cut(oldV), cut(newV), null, null));
        }
    }

    private static void contractEnd(List<Change> out, Institution cur, InstitutionUpdateIn upd) {
        boolean dateSent = upd.present("contractEnd");
        boolean confSent = upd.present("contractEndConfirmed");
        boolean urlSent = upd.present("contractEndSrcUrl");
        boolean noSent = upd.present("contractEndSrcNo");
        if (!dateSent && !confSent && !urlSent && !noSent) {
            return;
        }

        String oldDate = cur.getContractEnd();
        String newDate = oldDate;
        if (dateSent) {
            newDate = upd.getContractEnd() == null ? null : date(upd.getContractEnd());
        }
        boolean dateChanged = !Objects.equals(oldDate, newDate);

        Boolean confIn = upd.getContractEndConfirmed();
        if (confSent && confIn == null) {
            throw bad("확정 여부는 true 또는 false 여야 합니다.");
        }
        boolean oldConf = cur.isContractEndConfirmed();
        boolean newConf;
        if (newDate == null) {
            if (confSent && confIn) {
                throw bad("입찰 예정일이 없으면 확정할 수 없습니다.");
            }
            newConf = false;
        } else if (dateChanged) {
            if (!confSent) {
                throw bad("입찰 예정일을 바꿀 때는 확정/추정(contract_end_confirmed)을 함께 보내야 합니다.");
            }
            newConf = confIn;
        } else {
            newConf = confSent ? confIn : oldConf;
        }
        boolean confChanged = newConf != oldConf;
        if (!dateChanged && !confChanged && !urlSent && !noSent) {
            if (dateSent) {
                upd.setContractEnd(newDate);   // 같은 날짜여도 공백 제거본을 저장한다(qa P3-1). 값은 기존과 같은 날짜
            }
            return;   // 바뀐 것 없음 — 출처 없는 옛 확정 행을 건드리지 않는다
        }

        String url = null;
        String no = null;
        if (newConf) {
            boolean keep = !dateChanged && oldConf;   // 같은 날짜의 확정이 이어질 때만 옛 출처를 이어 쓴다
            url = urlSent ? url(upd.getContractEndSrcUrl()) : (keep ? cur.getContractEndSrcUrl() : null);
            no = noSent ? notice(upd.getContractEndSrcNo()) : (keep ? cur.getContractEndSrcNo() : null);
            if (url == null && no == null) {
                throw bad("확정하려면 출처(공고 링크 또는 번호)가 필요합니다.");
            }
        }
        boolean srcChanged = newConf && oldConf
                && (!Objects.equals(url, cur.getContractEndSrcUrl()) || !Objects.equals(no, cur.getContractEndSrcNo()));
        upd.setContractEnd(newDate);
        upd.setContractEndConfirmed(newConf);
        upd.setContractEndSrcUrl(url);
        upd.setContractEndSrcNo(no);
        if (dateChanged) {
            out.add(new Change("CONTRACT_END", cut(oldDate), cut(newDate), null, null));
        }
        if (confChanged || srcChanged) {
            out.add(new Change("CONTRACT_END_CONFIRMED", yn(oldConf), yn(newConf), url, no));
        }
    }

    private static void opStatus(List<Change> out, Institution cur, InstitutionUpdateIn upd, CodeCheck codes) {
        boolean stSent = upd.present("opStatus");
        boolean odSent = upd.present("openDate");
        boolean urlSent = upd.present("opSrcUrl");
        boolean noSent = upd.present("opSrcNo");
        if (!stSent && !odSent && !urlSent && !noSent) {
            return;
        }

        String oldSt = cur.getOpStatus() == null ? "OPERATING" : cur.getOpStatus();
        String newSt = oldSt;
        if (stSent) {
            newSt = upd.getOpStatus();
            if (newSt == null || !codes.enabled(OP_GROUP, newSt)) {
                throw bad("허용되지 않는 운영 상태입니다.");
            }
        }
        String oldOd = cur.getOpenDate();
        String newOd = oldOd;
        if (odSent) {
            newOd = upd.getOpenDate() == null ? null : openDate(upd.getOpenDate());
        }
        if (OP_PLANNED.equals(newSt) && newOd == null) {
            throw bad("개원 예정에는 개원 예정일(연, 연-월 또는 연-월-일)이 필요합니다.");
        }
        boolean stChanged = !oldSt.equals(newSt);
        boolean odChanged = !Objects.equals(oldOd, newOd);

        String url = cur.getOpSrcUrl();
        String no = cur.getOpSrcNo();
        if (stChanged) {
            url = urlSent ? url(upd.getOpSrcUrl()) : null;
            no = noSent ? notice(upd.getOpSrcNo()) : null;
            if (url == null && no == null) {
                throw bad("운영 상태를 바꾸려면 출처(링크 또는 번호)가 필요합니다.");
            }
        } else {
            if (urlSent) {
                url = url(upd.getOpSrcUrl());
            }
            if (noSent) {
                no = notice(upd.getOpSrcNo());
            }
            // 보안 검토 L1: 상태를 바꾸지 않는 저장이 출처를 둘 다 지우면 사람이 정한 상태가 시드 소유로 돌아간다.
            if ((urlSent || noSent) && url == null && no == null) {
                throw bad("운영 상태의 출처(링크 또는 번호)를 모두 비울 수 없습니다.");
            }
        }
        upd.setOpStatus(newSt);
        upd.setOpenDate(newOd);
        upd.setOpSrcUrl(url);
        upd.setOpSrcNo(no);
        if (stChanged) {
            out.add(new Change("OP_STATUS", oldSt, newSt, url, no));
        }
        if (odChanged) {
            out.add(new Change("OPEN_DATE", cut(oldOd), cut(newOd), null, null));
        }
    }

    // ---- 형식 검사 (서버는 링크를 열지 않는다 — SSRF 면 없음) ----

    static String date(String v) {
        String s = v.trim();
        if (!DATE.matcher(s).matches()) {
            throw bad("날짜는 YYYY-MM-DD 형식이어야 합니다.");
        }
        try {
            LocalDate d = LocalDate.parse(s);
            if (d.getYear() < 2000 || d.getYear() > 2100) {
                throw bad("날짜 범위(2000~2100)를 벗어났습니다.");
            }
        } catch (java.time.DateTimeException e) {
            throw bad("존재하지 않는 날짜입니다.");
        }
        return s;
    }

    static String openDate(String v) {
        String s = v.trim();
        if (!OPEN.matcher(s).matches()) {
            throw bad("개원 예정일은 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.");
        }
        try {
            int y = Integer.parseInt(s.substring(0, 4));
            if (y < 2000 || y > 2100) {
                throw bad("개원 예정일 범위(2000~2100)를 벗어났습니다.");
            }
            if (s.length() == 7) {
                YearMonth.parse(s);
            }
            if (s.length() == 10) {
                LocalDate.parse(s);
            }
        } catch (java.time.DateTimeException e) {
            throw bad("존재하지 않는 날짜입니다.");
        }
        return s;
    }

    static String url(String raw) {
        if (raw == null) {
            return null;
        }
        String v = raw.trim();
        if (v.isEmpty()) {
            return null;
        }
        if (!com.kbstar.kgi.ggreport.web.support.SafeUrl.isHttp(v)) {
            throw bad(URL_MSG);
        }
        return v;
    }

    static String notice(String raw) {
        if (raw == null) {
            return null;
        }
        String v = raw.trim();
        if (v.isEmpty()) {
            return null;
        }
        if (!NO.matcher(v).matches()) {
            throw bad("공고 번호 형식이 올바르지 않습니다(50자 이내, 문자·숫자·공백·-_./()).");
        }
        return v;
    }

    /** 보낸 칸이 DB 칸 길이(코드 포인트)를 넘으면 400 — 안 막으면 DB 오류로 500 이 된다(84② 11-16). 문구에 입력값을 싣지 않는다. */
    private static void maxLen(boolean sent, String v, int max, String msg) {
        if (sent && v != null && v.codePointCount(0, v.length()) > max) {
            throw bad(msg);
        }
    }

    private static ApiException bad(String m) {
        return ApiException.badRequest(m);
    }

    private static String yn(boolean b) {
        return b ? "Y" : "N";
    }

    private static String str(Integer i) {
        return i == null ? null : String.valueOf(i);
    }

    private static String cut(String s) {
        return s == null ? null : (s.length() > 60 ? s.substring(0, 60) : s);
    }
}
