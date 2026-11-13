package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.InstHead;
import com.kbstar.kgi.ggreport.web.domain.InstHeadItem;
import com.kbstar.kgi.ggreport.web.domain.InstHeadPhoto;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.HeadIn;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionHeadMapper;
import com.kbstar.kgi.ggreport.web.support.HeadForbidden;
import com.kbstar.kgi.ggreport.web.support.HeadMask;
import com.kbstar.kgi.ggreport.web.support.HeadText;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 기관장 정보(NEXT 72·77, 026) — 목록·대기열·상세·등록·칸 입력·확정·기각·무효·매칭 대기 후보. 사진은 {@link HeadPhotoService}.
 *
 * <p>규칙: 값은 칸마다 출처와 함께 1행(후보·확정·대체). 현 기관장이 없으면(빈 머리 포함 — {@link #isEmptyHead}) 직접 입력이 곧 확정(CURRENT/CONFIRMED), 있으면 다른 값은 후보(CANDIDATE)로 들어가
 * 충돌 해소({@link HeadRules})를 거친다. 이전 기관장(FORMER)·바뀐 값(SUPERSEDED)은 지우지 않고 화면에서 숨긴다.
 * <b>모든 대상 id 는 기관과 묶어 조회한다</b> — 행이 없으면 404(그 id 가 있다는 사실이 새지 않게), 있는데 상태가 다르면 409 STATE_CHANGED.
 * 쓰기는 전부 한 트랜잭션이고 <b>기관 행 잠금이 먼저</b>다 — 같은 기관의 쓰기는 거기서 직렬화된다(그래서 현 머리·ACTIVE 사진 조회는 FOR UPDATE 없이 읽는다:
 * 빈 결과 FOR UPDATE 는 MySQL 에서 gap 잠금 교착을 부른다). 그 뒤 칸·머리 행을 잠근다(칸 확정·기각·무효는 칸 → 머리, 머리 확정·기각은 머리, U3·U4 는 머리만).
 * 이력(INST_HEAD_LOG)에는 id·코드·역할·사유만 남긴다 — 이름·칸 값은 넣지 않는다. 서버는 출처 URL 을 열지 않는다.
 * ⚠️ 사번·역할은 X-Emp-No 자기신고 위의 업무 규칙이다(사칭 방지가 아니다).
 */
@Service
public class InstitutionHeadService {

    static final Set<String> SINGLE = Collections.unmodifiableSet(new LinkedHashSet<String>(Arrays.asList(
            "NAME", "POSITION", "ACTING", "FIRST_TAKE_OFFICE", "TERM_START", "TERM_END")));
    static final Set<String> DATES = Collections.unmodifiableSet(new LinkedHashSet<String>(Arrays.asList(
            "FIRST_TAKE_OFFICE", "TERM_START", "TERM_END")));
    static final int EDU_MAX = 10;
    static final int CAREER_MAX = 20;
    static final int OPEN_ITEM_MAX = 50;
    static final int CANDIDATE_HEAD_MAX = 10;
    static final int UNMATCHED_LIST_MAX = 500;

    private static final Pattern ID = Pattern.compile("[1-9][0-9]{0,17}");

    private final InstitutionHeadMapper mapper;

    public InstitutionHeadService(InstitutionHeadMapper mapper) {
        this.mapper = mapper;
    }

    // ── 도우미(정적) ─────────────────────────────────────────────────────

    /** 경로의 숫자 번호 — 형식 밖이면 null(호출자가 404). */
    public static Long parseId(String raw) {
        if (raw == null || !ID.matcher(raw).matches()) {
            return null;
        }
        return Long.valueOf(raw);
    }

    /** 기관 id 형식 — 1~64자, 공백·'/'·'\'·제어문자 없음. */
    public static boolean validInstId(String s) {
        if (s == null || s.isEmpty() || s.length() > 64) {
            return false;
        }
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c <= 0x20 || c == 0x7F || c == '/' || c == '\\' || Character.isWhitespace(c) || Character.isISOControl(c)) {
                return false;
            }
        }
        return true;
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    static ApiException hidden() {
        return ApiException.notFound("not found");
    }

    static ApiException stateChanged() {
        return coded(409, "STATE_CHANGED", "그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.");
    }

    static ApiException noHead() {
        return coded(409, "NO_HEAD", "현 기관장이 없습니다. [기관장 추가]로 먼저 등록하세요.");
    }

    static ApiException forbidden(String code) {
        String msg;
        if ("LEAD_ONLY".equals(code)) {
            msg = "충돌하는 값은 영업팀장 또는 영업부장만 처리할 수 있습니다.";
        } else if ("SELF_RESOLVE".equals(code)) {
            msg = "본인이 낸 값은 본인이 확정할 수 없습니다.";
        } else if ("OWN_VALUE_GUARD".equals(code)) {
            msg = "본인이 입력·확정한 값과 충돌하는 후보는 직접 기각할 수 없습니다.";
        } else if ("NOT_OWNER".equals(code)) {
            msg = "그 값을 넣은 사람 또는 영업팀장·영업부장만 무효 처리할 수 있습니다.";
        } else {
            msg = "이 기능을 쓸 권한이 없습니다.";
        }
        return coded(403, code, msg);
    }

    static int verified(Actor actor) {
        return actor != null && actor.isVerified() ? 1 : 0;
    }

    /** 이력 한 줄 — id·코드·역할·사유만. selfFlag: 처리자가 대상 후보를 낸 사람(반입자 포함)과 같으면 1. */
    static void writeLog(InstitutionHeadMapper mapper, String event, String instId, Long headId, Long itemId, Long fromItemId,
                         Long photoId, Long fromPhotoId, Long fromHeadId, String batchId, String reason,
                         SysUser me, Actor actor, int selfFlag) {
        String role = HeadRules.roleOf(me.getRole());
        mapper.insertLog(instId, headId, event, itemId, fromItemId, photoId, fromPhotoId, fromHeadId, batchId, reason,
                me.getEmpNo(), role.length() > 20 ? role.substring(0, 20) : role, selfFlag, verified(actor), Times.nowIso());
    }

    private void log(String event, String instId, Long headId, Long itemId, Long fromItemId, Long fromHeadId, String reason,
                     SysUser me, Actor actor, int selfFlag) {
        writeLog(mapper, event, instId, headId, itemId, fromItemId, null, null, fromHeadId, null, reason, me, actor, selfFlag);
    }

    private static int self(SysUser me, String proposer) {
        return me.getEmpNo() != null && me.getEmpNo().equals(proposer) ? 1 : 0;
    }

    /**
     * 빈 머리 — CURRENT 이지만 권한대행(ACTING) 밖의 확정 칸(이름·직위·날짜·학력·경력)과 ACTIVE 사진이 하나도 없다(확정 값을 모두 무효 처리한 결과).
     * 서버는 이것을 '현 기관장 없음'으로 본다(11-13 사용자 결정 가). 화면 headcard.js hc.isEmptyHead 와 같은 기준이다(권한대행 '아니오'는 카드에 안 보이므로 뺀다).
     * 호출자는 기관 행 잠금 뒤에 부른다(같은 기관의 쓰기는 거기서 직렬화된다).
     */
    static boolean isEmptyHead(InstitutionHeadMapper mapper, Long headId) {
        return mapper.countShownItems(headId) == 0 && mapper.countActivePhotos(headId) == 0;
    }

    /** 판정용 현 기관장 — CURRENT 머리가 없거나 빈 머리면 null(충돌 아님). 기관 잠금 뒤에 부른다. */
    private InstHead liveCurrent(String instId) {
        InstHead cur = mapper.selectCurrentHeadForUpdate(instId);
        return cur != null && isEmptyHead(mapper, cur.getHeadId()) ? null : cur;
    }

    /**
     * 빈 머리 정리 — CURRENT → VOIDED(숨김, 이전 기관장 FORMER 와 구분 — 이름 없는 머리가 이전 기관장 이력에 쌓이지 않게)로 내리고,
     * 그 머리의 열린 후보 칸을 새 현 머리로 옮긴다(후보 그대로 — 새 확정값과 다시 비교돼 다르면 충돌, 잃지 않게). 확정 칸(권한대행 등)은 옮기지 않는다.
     * 이력: HEAD_VOID(HEAD_ID=새 머리, FROM_HEAD_ID=빈 머리) + 옮겼으면 HEAD_MERGE. 옮긴 칸 수를 돌려준다.
     * ⚠️ 머리 확정(A8)에서는 confirmItemsOfHead 뒤에 부른다 — 앞에서 부르면 옮긴 후보까지 함께 확정된다.
     */
    private int retireEmptyHead(Long emptyHeadId, Long intoHeadId, String instId, SysUser me, Actor actor, String now, int selfFlag) {
        if (mapper.voidEmptyHead(emptyHeadId, me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        int moved = mapper.moveCandidateItems(emptyHeadId, intoHeadId, instId);
        log("HEAD_VOID", instId, intoHeadId, null, null, emptyHeadId, null, me, actor, selfFlag);
        if (moved > 0) {
            log("HEAD_MERGE", instId, intoHeadId, null, null, emptyHeadId, null, me, actor, selfFlag);
        }
        return moved;
    }

    /** 같음 비교 키 — 글자는 공백 무시, 날짜는 문자열, 권한대행은 0/1. */
    static String keyOf(InstHeadItem i) {
        String f = i.getFieldCd();
        if ("ACTING".equals(f)) {
            return String.valueOf(i.getValFlag() == null ? 0 : i.getValFlag());
        }
        if (DATES.contains(f)) {
            return i.getValDate() == null ? "" : i.getValDate();
        }
        return HeadText.compareKey(i.getValText());
    }

    private static Object valueOf(InstHeadItem i) {
        String f = i.getFieldCd();
        if ("ACTING".equals(f)) {
            return i.getValFlag() != null && i.getValFlag() == 1;
        }
        if (DATES.contains(f)) {
            return i.getValDate();
        }
        return i.getValText();
    }

    private static Map<String, Object> sourceMap(InstHeadItem i) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("kind", i.getSrcKindCd());
        s.put("title", i.getSrcTitle());
        s.put("url", i.getSrcUrl());
        s.put("published", i.getSrcPublished());
        s.put("checked_on", i.getCheckedOn());
        return s;
    }

    private static Map<String, Object> itemMap(InstHeadItem i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("item_id", i.getItemId());
        m.put("head_id", i.getHeadId());
        m.put("field_cd", i.getFieldCd());
        m.put("value", valueOf(i));
        m.put("from", i.getValFrom());
        m.put("to", i.getValTo());
        m.put("source", sourceMap(i));
        m.put("origin", i.getOriginCd());
        m.put("created_by", i.getCreatedBy());
        m.put("created_verified", i.getCreatedVerified() == 1);
        return m;
    }

    /** 단일 칸 후보 x 가 같은 머리의 확정값과(또는 같은 칸의 다른 열린 후보와) 다르면 충돌. 학력·경력(목록 칸)은 충돌이 없다. */
    static boolean conflictOf(InstHeadItem x, List<InstHeadItem> confirmed, List<InstHeadItem> open) {
        if (!SINGLE.contains(x.getFieldCd())) {
            return false;
        }
        String key = keyOf(x);
        for (InstHeadItem c : confirmed) {
            if (!keyOf(c).equals(key)) {
                return true;
            }
        }
        for (InstHeadItem o : open) {
            if (!o.getItemId().equals(x.getItemId()) && !keyOf(o).equals(key)) {
                return true;
            }
        }
        return false;
    }

    private static Set<String> ownersOf(List<InstHeadItem> confirmed) {
        Set<String> s = new HashSet<>();
        for (InstHeadItem c : confirmed) {
            if (c.getCreatedBy() != null) {
                s.add(c.getCreatedBy());
            }
            if (c.getDecidedBy() != null) {
                s.add(c.getDecidedBy());
            }
        }
        return s;
    }

    /** 기각용 — 확정값의 입력·확정자에 더해 같은 칸의 <b>다른 열린 후보를 낸 사람</b>도 지키는 쪽으로 본다(후보 기각 뒤 자기 후보 확정 우회 차단, security 중-1). */
    private static Set<String> rejectOwners(InstHeadItem x, List<InstHeadItem> confirmed, List<InstHeadItem> open) {
        Set<String> s = ownersOf(confirmed);
        for (InstHeadItem o : open) {
            if (!o.getItemId().equals(x.getItemId()) && o.getCreatedBy() != null) {
                s.add(o.getCreatedBy());
            }
        }
        return s;
    }

    private static Set<String> ownersOf(InstHead cur) {
        Set<String> s = new HashSet<>();
        if (cur != null) {
            if (cur.getCreatedBy() != null) {
                s.add(cur.getCreatedBy());
            }
            if (cur.getDecidedBy() != null) {
                s.add(cur.getDecidedBy());
            }
        }
        return s;
    }

    // ── 출처·값 검사 ─────────────────────────────────────────────────────

    private static final class Src {
        String kind;
        String title;
        String url;
        String published;
        String checkedOn;
    }

    private Src source(HeadIn.Source s) {
        if (s == null) {
            throw coded(400, "BAD_VALUE", "출처를 입력하세요.");
        }
        Src r = new Src();
        String kind = s.getKind() == null ? "" : s.getKind().trim();
        if (kind.isEmpty() || kind.length() > 20 || mapper.countEnabledCode("HEAD_SRC", kind) == 0) {
            throw coded(422, "SRC_KIND_NOT_ALLOWED", "허용되지 않는 출처 종류입니다.");
        }
        r.kind = kind;
        r.title = HeadText.requireLine("src_title", s.getTitle(), 100, false);
        r.url = HeadText.requireUrl(s.getUrl());
        r.published = HeadText.optionalDate("published", s.getPublished());
        r.checkedOn = HeadText.requireCheckedOn(s.getCheckedOn());
        return r;
    }

    private InstHeadItem newItem(Long headId, String instId, String field, String state, SysUser me, Actor actor, Src src, String now) {
        InstHeadItem i = new InstHeadItem();
        i.setHeadId(headId);
        i.setInstitutionId(instId);
        i.setFieldCd(field);
        i.setStateCd(state);
        i.setOriginCd("MANUAL");
        i.setSrcKindCd(src.kind);
        i.setSrcTitle(src.title);
        i.setSrcUrl(src.url);
        i.setSrcPublished(src.published);
        i.setCheckedOn(src.checkedOn);
        i.setCreatedBy(me.getEmpNo());
        i.setCreatedAt(now);
        i.setCreatedVerified(verified(actor));
        if ("CONFIRMED".equals(state)) {
            i.setDecidedBy(me.getEmpNo());
            i.setDecidedAt(now);
        }
        return i;
    }

    /** 칸 종류별 값을 검사해 item 에 채운다(형식 오류 400). 금지 내용 검사는 호출자가 한다. 채운 글자 값을 돌려준다(없으면 null). */
    private static String fillValue(InstHeadItem i, HeadIn.Item in) {
        String f = i.getFieldCd();
        if ("NAME".equals(f)) {
            i.setValText(HeadText.requireLine("name", in.getValue(), 30, true));
        } else if ("POSITION".equals(f)) {
            i.setValText(HeadText.requireLine("position", in.getValue(), 40, false));
        } else if ("EDU".equals(f)) {
            i.setValText(HeadText.requireLine("edu", in.getValue(), 60, false));
            i.setValFrom(HeadText.requirePeriod("from", in.getFrom()));
            i.setValTo(HeadText.requirePeriod("to", in.getTo()));
            requireOrder(i);
        } else if ("CAREER".equals(f)) {
            i.setValText(HeadText.requireLine("career", in.getValue(), 60, false));
            i.setValFrom(HeadText.requirePeriod("from", in.getFrom()));
            i.setValTo(HeadText.requirePeriod("to", in.getTo()));
            requireOrder(i);
        } else if ("ACTING".equals(f)) {
            Integer flag = in.getFlag();
            if (flag == null || (flag != 0 && flag != 1)) {
                throw coded(400, "BAD_VALUE", "권한대행 여부는 0 또는 1 이어야 합니다.");
            }
            i.setValFlag(flag);
        } else {   // 날짜 칸
            i.setValDate(HeadText.requireDate(f, in.getDate()));
        }
        return i.getValText();
    }

    private static void requireOrder(InstHeadItem i) {
        if (i.getValFrom() != null && i.getValTo() != null && i.getValFrom().compareTo(i.getValTo()) > 0) {
            throw coded(400, "INVALID_DATE", "시작이 끝보다 늦을 수 없습니다.");
        }
    }

    // ── 목록(A1)·대기열(A2) ──────────────────────────────────────────────

    /** 현 기관장 목록(가림). 이름은 가린 값만, 학력·경력·사진 번호는 없다. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        List<InstHead> heads = mapper.selectCurrentHeads();
        Map<Long, Map<String, InstHeadItem>> byHead = new HashMap<>();
        Map<Long, String> lastChecked = new HashMap<>();
        for (InstHeadItem i : mapper.selectCurrentConfirmedSingleItems()) {
            Map<String, InstHeadItem> m = byHead.get(i.getHeadId());
            if (m == null) {
                m = new HashMap<>();
                byHead.put(i.getHeadId(), m);
            }
            m.put(i.getFieldCd(), i);
            String prev = lastChecked.get(i.getHeadId());
            if (i.getCheckedOn() != null && (prev == null || prev.compareTo(i.getCheckedOn()) < 0)) {
                lastChecked.put(i.getHeadId(), i.getCheckedOn());
            }
        }
        Map<String, Integer> open = openCounts();
        Set<Long> photos = new HashSet<>(mapper.selectHeadIdsWithActivePhoto());
        Set<Long> empty = new HashSet<>(mapper.selectEmptyCurrentHeadIds());
        List<Map<String, Object>> out = new ArrayList<>();
        for (InstHead h : heads) {
            if (empty.contains(h.getHeadId())) {
                continue;   // 빈 머리 = 현 기관장 없음 — 목록에 이름 없는 행을 내지 않는다
            }
            Map<String, InstHeadItem> m = byHead.containsKey(h.getHeadId()) ? byHead.get(h.getHeadId()) : new HashMap<String, InstHeadItem>();
            InstHeadItem name = m.get("NAME");
            InstHeadItem pos = m.get("POSITION");
            InstHeadItem acting = m.get("ACTING");
            InstHeadItem end = m.get("TERM_END");
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("institution_id", h.getInstitutionId());
            r.put("head_id", h.getHeadId());
            r.put("name_masked", name == null ? null : HeadMask.name(name.getValText()));
            r.put("position", pos == null ? null : pos.getValText());
            r.put("acting", acting != null && acting.getValFlag() != null && acting.getValFlag() == 1);
            r.put("term_end", end == null ? null : end.getValDate());
            r.put("last_checked_on", lastChecked.get(h.getHeadId()));
            r.put("open_candidates", open.containsKey(h.getInstitutionId()) ? open.get(h.getInstitutionId()) : 0);
            r.put("has_photo", photos.contains(h.getHeadId()));
            out.add(r);
        }
        return out;
    }

    private Map<String, Integer> openCounts() {
        Map<String, Integer> open = new HashMap<>();
        for (Map<String, Object> row : mapper.selectOpenCandidateCounts()) {
            Object inst = row.get("INSTITUTION_ID");
            Object n = row.get("N");
            if (inst != null && n instanceof Number) {
                open.put(String.valueOf(inst), ((Number) n).intValue());
            }
        }
        return open;
    }

    /** 대기열 — 기관별 열린 후보 수·충돌 수·칸 종류(값 없음) + 매칭 대기 건수. */
    @Transactional(readOnly = true)
    public Map<String, Object> queue() {
        // 충돌 기준은 상세(A3)·확정(A6)과 같은 conflictOf — 확정값과 다르거나 같은 칸의 다른 열린 후보와 다르면 충돌(qa P3-4)
        Map<String, List<InstHeadItem>> confirmed = new HashMap<>();   // "headId|field" → 확정 칸
        Map<String, List<InstHeadItem>> openBy = new HashMap<>();      // "headId|field" → 열린 후보 칸
        Set<String> instWithCurrent = new HashSet<>();
        for (InstHeadItem i : mapper.selectCurrentConfirmedSingleItems()) {
            addTo(confirmed, i.getHeadId() + "|" + i.getFieldCd(), i);
        }
        Set<Long> emptyHeads = new HashSet<>(mapper.selectEmptyCurrentHeadIds());
        for (InstHead h : mapper.selectCurrentHeads()) {
            if (!emptyHeads.contains(h.getHeadId())) {   // 빈 머리면 후보 기관장을 충돌로 세지 않는다(상세·A8 과 같은 기준)
                instWithCurrent.add(h.getInstitutionId());
            }
        }
        List<InstHeadItem> openItems = mapper.selectOpenCandidateItems();
        for (InstHeadItem i : openItems) {
            addTo(openBy, i.getHeadId() + "|" + i.getFieldCd(), i);
        }
        Map<String, int[]> counts = new LinkedHashMap<>();
        Map<String, Set<String>> fields = new LinkedHashMap<>();
        for (InstHeadItem i : openItems) {
            boolean conflict;
            if ("CANDIDATE".equals(i.getHeadStatus())) {
                conflict = instWithCurrent.contains(i.getInstitutionId());
            } else {
                String k = i.getHeadId() + "|" + i.getFieldCd();
                conflict = conflictOf(i, listOf(confirmed, k), listOf(openBy, k));
            }
            int[] n = counts.get(i.getInstitutionId());
            if (n == null) {
                n = new int[2];
                counts.put(i.getInstitutionId(), n);
                fields.put(i.getInstitutionId(), new LinkedHashSet<String>());
            }
            n[0]++;
            if (conflict) {
                n[1]++;
            }
            fields.get(i.getInstitutionId()).add(i.getFieldCd());
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map.Entry<String, int[]> e : counts.entrySet()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("institution_id", e.getKey());
            r.put("open_count", e.getValue()[0]);
            r.put("conflict_count", e.getValue()[1]);
            r.put("field_cds", new ArrayList<>(fields.get(e.getKey())));
            rows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("institutions", rows);
        out.put("unmatched_count", mapper.countUnmatchedHeads());
        return out;
    }

    private static void addTo(Map<String, List<InstHeadItem>> m, String k, InstHeadItem i) {
        List<InstHeadItem> l = m.get(k);
        if (l == null) {
            l = new ArrayList<>();
            m.put(k, l);
        }
        l.add(i);
    }

    private static List<InstHeadItem> listOf(Map<String, List<InstHeadItem>> m, String k) {
        List<InstHeadItem> l = m.get(k);
        return l == null ? new ArrayList<InstHeadItem>() : l;
    }

    // ── 상세(A3) ─────────────────────────────────────────────────────────

    /** 상세 — 원문 이름·칸·출처·후보. 현 기관장이 없으면 head:null. 없는 기관은 404. 이전 기관장·대체된 값은 내보내지 않는다. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(SysUser me, Actor actor, String instId) {
        if (mapper.institutionExists(instId) == null) {
            throw hidden();
        }
        String role = me.getRole();
        String emp = me.getEmpNo();
        InstHead cur = mapper.selectCurrentHead(instId);
        Map<Long, List<InstHeadItem>> byHead = new LinkedHashMap<>();
        for (InstHeadItem i : mapper.selectLiveItemsOfInstitution(instId)) {
            List<InstHeadItem> l = byHead.get(i.getHeadId());
            if (l == null) {
                l = new ArrayList<>();
                byHead.put(i.getHeadId(), l);
            }
            l.add(i);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("institution_id", instId);
        out.put("viewer_role", HeadRules.roleOf(role));
        out.put("viewer_verified", actor != null && actor.isVerified());

        List<Map<String, Object>> candidates = new ArrayList<>();
        boolean headEmpty = true;   // 현 기관장 없음 = head:null 이거나 빈 머리(isEmptyHead 와 같은 기준 — 권한대행 칸 제외)
        if (cur == null) {
            out.put("head", null);
            out.put("head_empty", true);
        } else {
            List<InstHeadItem> items = byHead.containsKey(cur.getHeadId()) ? byHead.get(cur.getHeadId()) : new ArrayList<InstHeadItem>();
            Map<String, List<InstHeadItem>> confirmedBy = new HashMap<>();
            Map<String, List<InstHeadItem>> openBy = new HashMap<>();
            for (InstHeadItem i : items) {
                Map<String, List<InstHeadItem>> target = "CONFIRMED".equals(i.getStateCd()) ? confirmedBy : openBy;
                List<InstHeadItem> l = target.get(i.getFieldCd());
                if (l == null) {
                    l = new ArrayList<>();
                    target.put(i.getFieldCd(), l);
                }
                l.add(i);
            }
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("head_id", cur.getHeadId());
            Map<String, Object> fieldsOut = new LinkedHashMap<>();
            String lastChecked = null;
            int sourceCount = 0;
            int shownCount = 0;   // 권한대행 밖 확정 칸 수 — 빈 머리 판정
            List<Map<String, Object>> edu = new ArrayList<>();
            List<Map<String, Object>> career = new ArrayList<>();
            for (InstHeadItem i : items) {
                if (!"CONFIRMED".equals(i.getStateCd())) {
                    continue;
                }
                sourceCount++;
                if (!"ACTING".equals(i.getFieldCd())) {
                    shownCount++;
                }
                if (i.getCheckedOn() != null && (lastChecked == null || lastChecked.compareTo(i.getCheckedOn()) < 0)) {
                    lastChecked = i.getCheckedOn();
                }
                if ("EDU".equals(i.getFieldCd())) {
                    edu.add(itemMap(i));
                } else if ("CAREER".equals(i.getFieldCd())) {
                    career.add(itemMap(i));
                } else {
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("item_id", i.getItemId());
                    f.put("value", valueOf(i));
                    f.put("source", sourceMap(i));
                    f.put("created_by", i.getCreatedBy());
                    f.put("created_verified", i.getCreatedVerified() == 1);
                    fieldsOut.put(i.getFieldCd(), f);
                }
            }
            h.put("name", fieldValue(fieldsOut, "NAME"));
            h.put("position", fieldValue(fieldsOut, "POSITION"));
            Object acting = fieldValue(fieldsOut, "ACTING");
            h.put("acting", acting instanceof Boolean && (Boolean) acting);
            h.put("first_take_office", fieldValue(fieldsOut, "FIRST_TAKE_OFFICE"));
            h.put("term_start", fieldValue(fieldsOut, "TERM_START"));
            h.put("term_end", fieldValue(fieldsOut, "TERM_END"));
            h.put("fields", fieldsOut);
            h.put("education", edu);
            h.put("career", career);
            InstHeadPhoto p = mapper.selectActivePhoto(cur.getHeadId());
            if (p == null) {
                h.put("photo", null);
            } else {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("photo_id", p.getPhotoId());
                pm.put("license_cd", p.getLicenseCd());
                Map<String, Object> ps = new LinkedHashMap<>();
                ps.put("kind", p.getSrcKindCd());
                ps.put("title", p.getSrcTitle());
                ps.put("url", p.getSrcUrl());
                ps.put("checked_on", p.getCheckedOn());
                pm.put("source", ps);
                pm.put("checked_on", p.getCheckedOn());
                pm.put("uploaded_by", p.getUploadedBy());
                pm.put("uploaded_verified", p.getUploadedVerified() == 1);
                h.put("photo", pm);
            }
            h.put("source_count", sourceCount);
            h.put("last_checked_on", lastChecked);
            out.put("head", h);   // 빈 머리도 머리는 그대로 낸다(그 머리의 후보 처리·화면 호환) — 판정은 head_empty 로
            headEmpty = shownCount == 0 && p == null;
            out.put("head_empty", headEmpty);

            for (InstHeadItem i : items) {
                if (!"CANDIDATE".equals(i.getStateCd())) {
                    continue;
                }
                List<InstHeadItem> conf = confirmedBy.containsKey(i.getFieldCd()) ? confirmedBy.get(i.getFieldCd()) : new ArrayList<InstHeadItem>();
                List<InstHeadItem> open = openBy.containsKey(i.getFieldCd()) ? openBy.get(i.getFieldCd()) : new ArrayList<InstHeadItem>();
                boolean conflict = conflictOf(i, conf, open);
                Set<String> owners = ownersOf(conf);
                String bc = HeadRules.blockCode(HeadRules.Action.CONFIRM, role, emp, i.getCreatedBy(), owners, conflict);
                String br = HeadRules.blockCode(HeadRules.Action.REJECT, role, emp, i.getCreatedBy(), rejectOwners(i, conf, open), conflict);
                Map<String, Object> c = itemMap(i);
                c.put("conflict", conflict);
                c.put("can_confirm", bc == null);
                c.put("can_reject", br == null);
                c.put("block_code", bc);
                c.put("reject_block_code", br);
                candidates.add(c);
            }
        }
        out.put("candidates", candidates);

        InstHead live = headEmpty ? null : cur;   // 빈 머리면 후보 기관장은 충돌이 아니다(현 기관장 없음과 같다)
        List<Map<String, Object>> candHeads = new ArrayList<>();
        for (InstHead ch : mapper.selectCandidateHeads(instId)) {
            List<InstHeadItem> items = byHead.containsKey(ch.getHeadId()) ? byHead.get(ch.getHeadId()) : new ArrayList<InstHeadItem>();
            boolean conflict = live != null;
            Set<String> owners = ownersOf(live);
            String bc = HeadRules.blockCode(HeadRules.Action.CONFIRM, role, emp, ch.getCreatedBy(), owners, conflict);
            String br = HeadRules.blockCode(HeadRules.Action.REJECT, role, emp, ch.getCreatedBy(), owners, conflict);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("head_id", ch.getHeadId());
            String name = null;
            String position = null;
            List<Map<String, Object>> itemList = new ArrayList<>();
            for (InstHeadItem i : items) {
                if ("NAME".equals(i.getFieldCd())) {
                    name = i.getValText();
                } else if ("POSITION".equals(i.getFieldCd())) {
                    position = i.getValText();
                }
                itemList.add(itemMap(i));
            }
            m.put("name", name);
            m.put("position", position);
            m.put("origin", ch.getOriginCd());
            m.put("created_by", ch.getCreatedBy());
            m.put("created_verified", ch.getCreatedVerified() == 1);
            m.put("item_count", items.size());
            m.put("items", itemList);
            m.put("can_confirm", bc == null);
            m.put("can_reject", br == null);
            m.put("block_code", bc);
            m.put("reject_block_code", br);
            candHeads.add(m);
        }
        out.put("candidate_heads", candHeads);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Object fieldValue(Map<String, Object> fields, String field) {
        Object f = fields.get(field);
        return f == null ? null : ((Map<String, Object>) f).get("value");
    }

    // ── 등록(A4)·칸 입력(A5) ─────────────────────────────────────────────

    /** 기관장 등록 — 현 기관장이 없거나 빈 머리면 바로 확정(CURRENT, 빈 머리는 VOIDED 로 정리·열린 후보는 새 머리로), 있으면 후보 머리(CANDIDATE, 충돌). 결과 state: CURRENT | CANDIDATE. */
    @Transactional
    public Map<String, Object> addHead(SysUser me, Actor actor, String instId, HeadIn.Head in) {
        if (in == null) {
            throw coded(400, "BAD_VALUE", "내용을 입력하세요.");
        }
        String name = HeadText.requireLine("name", in.getName(), 30, true);
        String position = HeadText.requireLine("position", in.getPosition(), 40, false);
        String first = HeadText.optionalDate("first_take_office", in.getFirstTakeOffice());
        String start = HeadText.optionalDate("term_start", in.getTermStart());
        String end = HeadText.optionalDate("term_end", in.getTermEnd());
        lockInst(instId);   // 첫 DB 읽기(source) 전에 기관 행을 잠근다 — MySQL RR 의 스냅샷이 잠금을 기다리기 전에 잡히면 동시 등록이 낡은 값을 본다
        Src src = source(in.getSource());
        HeadForbidden.rejectName(name);   // 이름 칸은 전화번호·개인정보만(낱말 검사 제외)
        HeadForbidden.rejectAny(position, src.title);

        if (mapper.lockInstitution(instId) == null) {
            throw hidden();
        }
        InstHead cur = mapper.selectCurrentHeadForUpdate(instId);
        // 빈 머리(권한대행 밖 확정 칸·사진 없음) = 현 기관장 없음(11-13 사용자 결정 가) — 바로 확정하고 빈 머리는 아래에서 VOIDED 로 정리한다
        InstHead emptied = cur != null && isEmptyHead(mapper, cur.getHeadId()) ? cur : null;
        boolean direct = cur == null || emptied != null;
        if (!direct && mapper.countCandidateHeads(instId) >= CANDIDATE_HEAD_MAX) {
            throw coded(409, "CANDIDATE_LIMIT", "열린 후보 기관장이 너무 많습니다. 기존 후보를 먼저 처리하세요.");
        }
        String now = Times.nowIso();
        InstHead h = new InstHead();
        h.setInstitutionId(instId);
        h.setStatusCd(direct ? "CURRENT" : "CANDIDATE");
        h.setOriginCd("MANUAL");
        h.setCreatedBy(me.getEmpNo());
        h.setCreatedAt(now);
        h.setCreatedVerified(verified(actor));
        if (direct) {
            h.setDecidedBy(me.getEmpNo());
            h.setDecidedAt(now);
        }
        mapper.insertHead(h);
        String state = direct ? "CONFIRMED" : "CANDIDATE";
        List<Long> ids = new ArrayList<>();
        ids.add(addHeadItem(h, "NAME", state, me, actor, src, now, name, null, null));
        ids.add(addHeadItem(h, "POSITION", state, me, actor, src, now, position, null, null));
        if (in.getActing() != null) {
            ids.add(addHeadItem(h, "ACTING", state, me, actor, src, now, null, null, in.getActing() ? 1 : 0));
        }
        if (first != null) {
            ids.add(addHeadItem(h, "FIRST_TAKE_OFFICE", state, me, actor, src, now, null, first, null));
        }
        if (start != null) {
            ids.add(addHeadItem(h, "TERM_START", state, me, actor, src, now, null, start, null));
        }
        if (end != null) {
            ids.add(addHeadItem(h, "TERM_END", state, me, actor, src, now, null, end, null));
        }
        log("HEAD_ADD", instId, h.getHeadId(), null, null, null, null, me, actor, 1);
        int moved = emptied == null ? 0 : retireEmptyHead(emptied.getHeadId(), h.getHeadId(), instId, me, actor, now, 1);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("head_id", h.getHeadId());
        out.put("state", direct ? "CURRENT" : "CANDIDATE");
        out.put("conflict", !direct);
        out.put("item_ids", ids);
        out.put("voided_head_id", emptied == null ? null : emptied.getHeadId());
        out.put("moved_item_count", moved);
        return out;
    }

    private Long addHeadItem(InstHead h, String field, String state, SysUser me, Actor actor, Src src, String now,
                             String text, String date, Integer flag) {
        InstHeadItem i = newItem(h.getHeadId(), h.getInstitutionId(), field, state, me, actor, src, now);
        i.setValText(text);
        i.setValDate(date);
        i.setValFlag(flag);
        mapper.insertItem(i);
        return i.getItemId();
    }

    /** 칸 입력 — 현 기관장(CURRENT) 머리에만. 결과 state: CONFIRMED | CANDIDATE. */
    @Transactional
    public Map<String, Object> addItem(SysUser me, Actor actor, String instId, HeadIn.Item in) {
        if (in == null || in.getHeadId() == null || in.getHeadId() < 1) {
            throw coded(400, "BAD_VALUE", "대상 기관장을 지정하세요.");
        }
        String field = in.getFieldCd() == null ? "" : in.getFieldCd().trim();
        boolean multi = "EDU".equals(field) || "CAREER".equals(field);
        if (!SINGLE.contains(field) && !multi) {
            throw coded(422, "FIELD_NOT_ALLOWED", "허용되지 않는 칸입니다.");
        }
        lockInst(instId);   // 첫 DB 읽기(source) 전에 기관 행을 잠근다(addHead 와 같은 이유)
        Src src = source(in.getSource());
        InstHeadItem x = newItem(in.getHeadId(), instId, field, "CANDIDATE", me, actor, src, Times.nowIso());
        String text = fillValue(x, in);
        if ("NAME".equals(field)) {
            HeadForbidden.rejectName(text);
            HeadForbidden.rejectAny(src.title);
        } else {
            HeadForbidden.rejectAny(text, src.title);
        }

        if (mapper.lockInstitution(instId) == null) {
            throw hidden();
        }
        InstHead head = mapper.selectHeadForUpdate(in.getHeadId(), instId);
        if (head == null) {
            throw hidden();
        }
        if (!"CURRENT".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        if (isEmptyHead(mapper, head.getHeadId())) {   // 빈 머리 = 현 기관장 없음 — 새 값은 [기관장 추가](A4)로 넣는다(이름 없는 머리 되살리기 방지)
            throw noHead();
        }
        if (mapper.countOpenItems(head.getHeadId()) >= OPEN_ITEM_MAX
                || ("EDU".equals(field) && mapper.countLiveItems(head.getHeadId(), field) >= EDU_MAX)
                || ("CAREER".equals(field) && mapper.countLiveItems(head.getHeadId(), field) >= CAREER_MAX)) {
            throw coded(409, "ITEM_LIMIT", "더 이상 입력할 수 없습니다(칸 수 상한).");
        }
        InstHeadItem old = null;
        boolean confirm;
        boolean conflict = false;
        if (multi) {
            confirm = true;
        } else {
            List<InstHeadItem> conf = mapper.selectItemsOfHeadField(head.getHeadId(), field, "CONFIRMED");
            List<InstHeadItem> open = mapper.selectItemsOfHeadField(head.getHeadId(), field, "CANDIDATE");
            old = conf.isEmpty() ? null : conf.get(0);
            if (old != null && keyOf(old).equals(keyOf(x))) {
                confirm = true;   // 같은 값을 다시 확인 — 새 출처로 대체한다
            } else {
                confirm = old == null && open.isEmpty();
                conflict = !confirm && conflictOf(x, conf, open);   // 상세(A3)와 같은 기준(qa P3-5)
            }
        }
        String now = x.getCreatedAt();
        if (confirm) {
            x.setStateCd("CONFIRMED");
            x.setDecidedBy(me.getEmpNo());
            x.setDecidedAt(now);
        }
        mapper.insertItem(x);
        log("ITEM_ADD", instId, head.getHeadId(), x.getItemId(), null, null, null, me, actor, 1);
        if (confirm && old != null) {
            if (mapper.supersedeItem(old.getItemId(), me.getEmpNo(), now, x.getItemId()) != 1) {
                throw stateChanged();
            }
            log("ITEM_SUPERSEDE", instId, head.getHeadId(), x.getItemId(), old.getItemId(), null, null, me, actor, 1);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item_id", x.getItemId());
        out.put("head_id", head.getHeadId());
        out.put("state", confirm ? "CONFIRMED" : "CANDIDATE");
        out.put("conflict", conflict);
        return out;
    }

    // ── 칸 확정(A6)·기각(A7)·무효(A10) ───────────────────────────────────

    /** 후보 칸 확정. 후보 머리의 칸은 머리째로만 확정한다(409 CONFIRM_VIA_HEAD). */
    @Transactional
    public Map<String, Object> confirmItem(SysUser me, Actor actor, String instId, Long itemId) {
        lockInst(instId);
        InstHeadItem item = mapper.selectItemForUpdate(itemId, instId);
        if (item == null) {
            throw hidden();
        }
        if (!"CANDIDATE".equals(item.getStateCd())) {
            throw stateChanged();
        }
        InstHead head = mapper.selectHeadForUpdate(item.getHeadId(), instId);
        if (head == null) {
            throw hidden();
        }
        if ("CANDIDATE".equals(head.getStatusCd())) {
            throw coded(409, "CONFIRM_VIA_HEAD", "후보 기관장의 칸은 기관장 단위로 확정합니다.");
        }
        if (!"CURRENT".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        List<InstHeadItem> conf = mapper.selectItemsOfHeadField(head.getHeadId(), item.getFieldCd(), "CONFIRMED");
        List<InstHeadItem> open = mapper.selectItemsOfHeadField(head.getHeadId(), item.getFieldCd(), "CANDIDATE");
        boolean conflict = conflictOf(item, conf, open);
        String bc = HeadRules.blockCode(HeadRules.Action.CONFIRM, me.getRole(), me.getEmpNo(), item.getCreatedBy(), ownersOf(conf), conflict);
        if (bc != null) {
            throw forbidden(bc);
        }
        String now = Times.nowIso();
        Long supersededId = null;
        if (SINGLE.contains(item.getFieldCd()) && !conf.isEmpty()) {
            supersededId = conf.get(0).getItemId();
            if (mapper.supersedeItem(supersededId, me.getEmpNo(), now, itemId) != 1) {
                throw stateChanged();
            }
        }
        if (mapper.confirmItem(itemId, me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        log("ITEM_CONFIRM", instId, head.getHeadId(), itemId, supersededId, null, null, me, actor, self(me, item.getCreatedBy()));
        if (supersededId != null) {   // A5 의 대체 경로와 같게 ITEM_SUPERSEDE 도 남긴다(qa P3-9)
            log("ITEM_SUPERSEDE", instId, head.getHeadId(), itemId, supersededId, null, null, me, actor, self(me, item.getCreatedBy()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item_id", itemId);
        out.put("head_id", head.getHeadId());
        out.put("superseded_item_id", supersededId);
        return out;
    }

    /** 후보 칸 기각·회수 — 사유 필수. 본인 후보 회수는 언제나 가능. */
    @Transactional
    public Map<String, Object> rejectItem(SysUser me, Actor actor, String instId, Long itemId, HeadIn.Reason in) {
        String reason = HeadText.requireReason(in == null ? null : in.getReason());
        lockInst(instId);
        InstHeadItem item = mapper.selectItemForUpdate(itemId, instId);
        if (item == null) {
            throw hidden();
        }
        if (!"CANDIDATE".equals(item.getStateCd())) {
            throw stateChanged();
        }
        InstHead head = mapper.selectHeadForUpdate(item.getHeadId(), instId);
        if (head == null) {
            throw hidden();
        }
        boolean conflict;
        Set<String> owners;
        if ("CANDIDATE".equals(head.getStatusCd())) {
            InstHead cur = liveCurrent(instId);   // 빈 머리면 null — 충돌 아님(A8·A9 와 같은 기준)
            conflict = cur != null;
            owners = ownersOf(cur);
        } else if ("CURRENT".equals(head.getStatusCd())) {
            List<InstHeadItem> conf = mapper.selectItemsOfHeadField(head.getHeadId(), item.getFieldCd(), "CONFIRMED");
            List<InstHeadItem> open = mapper.selectItemsOfHeadField(head.getHeadId(), item.getFieldCd(), "CANDIDATE");
            conflict = conflictOf(item, conf, open);
            owners = rejectOwners(item, conf, open);
        } else {
            throw stateChanged();
        }
        String bc = HeadRules.blockCode(HeadRules.Action.REJECT, me.getRole(), me.getEmpNo(), item.getCreatedBy(), owners, conflict);
        if (bc != null) {
            throw forbidden(bc);
        }
        if (mapper.rejectItem(itemId, me.getEmpNo(), Times.nowIso()) != 1) {
            throw stateChanged();
        }
        log("ITEM_REJECT", instId, head.getHeadId(), itemId, null, null, reason, me, actor, self(me, item.getCreatedBy()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item_id", itemId);
        out.put("head_id", head.getHeadId());
        return out;
    }

    /** 확정값 무효 — 그 값을 넣은 사람 또는 팀장·부장. 사유 필수. */
    @Transactional
    public Map<String, Object> voidItem(SysUser me, Actor actor, String instId, Long itemId, HeadIn.Reason in) {
        String reason = HeadText.requireReason(in == null ? null : in.getReason());
        lockInst(instId);
        InstHeadItem item = mapper.selectItemForUpdate(itemId, instId);
        if (item == null) {
            throw hidden();
        }
        if (!"CONFIRMED".equals(item.getStateCd())) {
            throw stateChanged();
        }
        InstHead head = mapper.selectHeadForUpdate(item.getHeadId(), instId);
        if (head == null) {
            throw hidden();
        }
        if (!"CURRENT".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        if (!HeadRules.canVoid(me.getRole(), me.getEmpNo(), item.getCreatedBy())) {
            throw forbidden("NOT_OWNER");
        }
        if (SINGLE.contains(item.getFieldCd())) {   // 확정값을 무효로 만들어 충돌을 없앤 뒤 자기 후보를 직접 확정하는 우회 차단(security 중-1)
            for (InstHeadItem o : mapper.selectItemsOfHeadField(head.getHeadId(), item.getFieldCd(), "CANDIDATE")) {
                if (me.getEmpNo() != null && me.getEmpNo().equals(o.getCreatedBy())) {
                    throw forbidden("OWN_VALUE_GUARD");
                }
            }
        }
        if (mapper.voidItem(itemId, me.getEmpNo(), Times.nowIso()) != 1) {
            throw stateChanged();
        }
        log("ITEM_VOID", instId, head.getHeadId(), itemId, null, null, reason, me, actor, self(me, item.getCreatedBy()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item_id", itemId);
        out.put("head_id", head.getHeadId());
        out.put("head_empty", isEmptyHead(mapper, head.getHeadId()));   // 참이면 화면은 같은 팝업에서 [기관장 추가] 양식으로 바꾼다
        return out;
    }

    private void lockInst(String instId) {
        if (mapper.lockInstitution(instId) == null) {
            throw hidden();
        }
    }

    // ── 후보 머리 확정(A8)·기각(A9) ──────────────────────────────────────

    /** 후보 머리 확정 — 그 머리의 후보 칸 전부 함께. 현 기관장이 있으면 FORMER(숨김)로 내린다. 같은 칸 후보끼리 다르면 409 HEAD_ITEMS_CONFLICT. */
    @Transactional
    public Map<String, Object> confirmHead(SysUser me, Actor actor, String instId, Long headId) {
        lockInst(instId);
        InstHead head = mapper.selectHeadForUpdate(headId, instId);
        if (head == null) {
            throw hidden();
        }
        if (!"CANDIDATE".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        InstHead cur = mapper.selectCurrentHeadForUpdate(instId);
        boolean curEmpty = cur != null && isEmptyHead(mapper, cur.getHeadId());   // 빈 머리 = 현 기관장 없음 → 충돌 아님
        InstHead live = curEmpty ? null : cur;
        String bc = HeadRules.blockCode(HeadRules.Action.CONFIRM, me.getRole(), me.getEmpNo(), head.getCreatedBy(),
                ownersOf(live), live != null);
        if (bc != null) {
            throw forbidden(bc);
        }
        Map<String, String> keys = new HashMap<>();
        for (InstHeadItem i : mapper.selectItemsOfHead(headId, "CANDIDATE")) {
            if (!SINGLE.contains(i.getFieldCd())) {
                continue;
            }
            String prev = keys.get(i.getFieldCd());
            if (prev != null && !prev.equals(keyOf(i))) {
                throw coded(409, "HEAD_ITEMS_CONFLICT", "같은 칸에 서로 다른 값이 있어 확정할 수 없습니다. 칸별로 먼저 정리하세요.");
            }
            keys.put(i.getFieldCd(), keyOf(i));
        }
        String now = Times.nowIso();
        Long formerId = null;
        if (live != null) {
            if (mapper.endHead(live.getHeadId(), me.getEmpNo(), now) != 1) {
                throw stateChanged();
            }
            formerId = live.getHeadId();
            // 옛 기관장(FORMER)의 열린 후보 칸은 처리할 길이 없어지므로 자동 기각한다(qa P2-1). 사유 코드 HEAD_REPLACED.
            // 빈 머리는 FORMER 로 내리지 않고(VOIDED) 후보도 기각하지 않는다 — 아래에서 새 머리로 옮긴다.
            if (mapper.rejectItemsOfHead(formerId, me.getEmpNo(), now) > 0) {
                log("ITEM_REJECT", instId, formerId, null, null, null, "HEAD_REPLACED", me, actor, 0);
            }
        }
        if (mapper.updateHeadStatus(headId, "CANDIDATE", "CURRENT", me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        mapper.confirmItemsOfHead(headId, me.getEmpNo(), now);
        int self = self(me, head.getCreatedBy());
        int moved = 0;
        if (curEmpty) {   // ⚠️ confirmItemsOfHead 뒤 — 옮긴 칸은 후보로 남는다
            moved = retireEmptyHead(cur.getHeadId(), headId, instId, me, actor, now, self);
        }
        if (formerId != null) {
            log("HEAD_REPLACE", instId, headId, null, null, formerId, null, me, actor, self);
        }
        log("HEAD_CONFIRM", instId, headId, null, null, formerId, null, me, actor, self);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("head_id", headId);
        out.put("former_head_id", formerId);
        out.put("voided_head_id", curEmpty ? cur.getHeadId() : null);
        out.put("moved_item_count", moved);
        return out;
    }

    /** 후보 머리 기각 — 사유 필수. */
    @Transactional
    public Map<String, Object> rejectHead(SysUser me, Actor actor, String instId, Long headId, HeadIn.Reason in) {
        String reason = HeadText.requireReason(in == null ? null : in.getReason());
        lockInst(instId);
        InstHead head = mapper.selectHeadForUpdate(headId, instId);
        if (head == null) {
            throw hidden();
        }
        if (!"CANDIDATE".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        InstHead cur = liveCurrent(instId);   // 빈 머리면 null — 충돌 아님
        String bc = HeadRules.blockCode(HeadRules.Action.REJECT, me.getRole(), me.getEmpNo(), head.getCreatedBy(),
                ownersOf(cur), cur != null);
        if (bc != null) {
            throw forbidden(bc);
        }
        String now = Times.nowIso();
        if (mapper.updateHeadStatus(headId, "CANDIDATE", "REJECTED", me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        mapper.rejectItemsOfHead(headId, me.getEmpNo(), now);
        log("HEAD_REJECT", instId, headId, null, null, null, reason, me, actor, self(me, head.getCreatedBy()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("head_id", headId);
        return out;
    }

    // ── 매칭 대기 후보(U1~U4) ────────────────────────────────────────────

    /** 매칭 대기 목록(가림, 최대 500). */
    @Transactional(readOnly = true)
    public Map<String, Object> unmatched() {
        Map<Long, Map<String, Object>> sum = new HashMap<>();
        for (Map<String, Object> r : mapper.selectUnmatchedSummaries()) {
            Object id = r.get("HEAD_ID");
            if (id instanceof Number) {
                sum.put(((Number) id).longValue(), r);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        boolean truncated = false;
        for (InstHead h : mapper.selectUnmatchedHeads()) {
            if (rows.size() >= UNMATCHED_LIST_MAX) {
                truncated = true;
                break;
            }
            Map<String, Object> s = sum.containsKey(h.getHeadId()) ? sum.get(h.getHeadId()) : new HashMap<String, Object>();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("head_id", h.getHeadId());
            m.put("src_org_cd", h.getSrcOrgCd());
            m.put("src_org_name", h.getSrcOrgName());
            Object nm = s.get("NAME_VAL");
            m.put("name_masked", nm == null ? null : HeadMask.name(String.valueOf(nm)));
            m.put("position", s.get("POSITION_VAL"));
            m.put("batch_id", h.getBatchId());
            m.put("created_by", h.getCreatedBy());
            m.put("created_verified", h.getCreatedVerified() == 1);
            m.put("created_at", h.getCreatedAt());
            Object n = s.get("N");
            m.put("open_item_count", n instanceof Number ? ((Number) n).intValue() : 0);
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", rows);
        out.put("truncated", truncated);
        return out;
    }

    /** 매칭 대기 상세 — 원문 이름·칸·출처(매칭 판단용). 이미 매칭됐거나 없으면 404. */
    @Transactional(readOnly = true)
    public Map<String, Object> unmatchedDetail(Actor actor, Long headId) {
        InstHead h = mapper.selectUnmatchedHead(headId);
        if (h == null) {
            throw hidden();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("head_id", h.getHeadId());
        out.put("src_org_cd", h.getSrcOrgCd());
        out.put("src_org_name", h.getSrcOrgName());
        out.put("batch_id", h.getBatchId());
        out.put("origin", h.getOriginCd());
        out.put("created_by", h.getCreatedBy());
        out.put("created_verified", h.getCreatedVerified() == 1);
        out.put("created_at", h.getCreatedAt());
        out.put("viewer_verified", actor != null && actor.isVerified());
        List<Map<String, Object>> items = new ArrayList<>();
        for (InstHeadItem i : mapper.selectItemsOfHead(headId, "CANDIDATE")) {
            items.add(itemMap(i));
        }
        out.put("items", items);
        return out;
    }

    /**
     * 기관 지정 — 대상 기관 잠금 → 머리 잠금(이미 매칭됐거나 후보가 아니면 409). 현 기관장과 이름(compareKey)이 같으면 칸을 그 머리로 옮겨 합치고(MERGED),
     * 아니면 그 기관의 후보 머리가 된다(열린 후보 머리 10개 상한). 없는 기관은 422 INSTITUTION_NOT_FOUND.
     */
    @Transactional
    public Map<String, Object> assign(SysUser me, Actor actor, Long headId, HeadIn.Assign in) {
        String inst = in == null ? null : in.getInstitutionId();
        if (!validInstId(inst)) {
            throw coded(400, "BAD_VALUE", "기관을 지정하세요.");
        }
        if (mapper.lockInstitution(inst) == null) {
            throw coded(422, "INSTITUTION_NOT_FOUND", "그 기관을 찾을 수 없습니다.");
        }
        InstHead head = mapper.selectHeadByIdForUpdate(headId);
        if (head == null) {
            throw hidden();
        }
        if (head.getInstitutionId() != null || !"CANDIDATE".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        InstHead cur = mapper.selectCurrentHeadForUpdate(inst);
        String now = Times.nowIso();
        int self = self(me, head.getCreatedBy());
        boolean merge = false;
        if (cur != null) {
            List<InstHeadItem> theirs = mapper.selectItemsOfHeadField(headId, "NAME", "CANDIDATE");
            List<InstHeadItem> mine = mapper.selectItemsOfHeadField(cur.getHeadId(), "NAME", "CONFIRMED");
            merge = !theirs.isEmpty() && !mine.isEmpty() && keyOf(theirs.get(0)).equals(keyOf(mine.get(0)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        if (merge) {
            int moving = mapper.selectItemsOfHead(headId, "CANDIDATE").size();
            if (mapper.countOpenItems(cur.getHeadId()) + moving > OPEN_ITEM_MAX) {   // 합쳐서 열린 칸 50 을 넘기지 않는다(security 하-3)
                throw coded(409, "ITEM_LIMIT", "합치면 열린 칸이 너무 많아집니다. 기존 후보 칸을 먼저 처리하세요.");
            }
            mapper.moveCandidateItems(headId, cur.getHeadId(), inst);
            if (mapper.assignHead(headId, inst, "MERGED", cur.getHeadId(), me.getEmpNo(), now) != 1) {
                throw stateChanged();
            }
            log("HEAD_MATCH", inst, headId, null, null, null, null, me, actor, self);
            log("HEAD_MERGE", inst, cur.getHeadId(), null, null, headId, null, me, actor, self);
            out.put("result", "MERGED");
            out.put("into_head_id", cur.getHeadId());
        } else {
            if (mapper.countCandidateHeads(inst) >= CANDIDATE_HEAD_MAX) {
                throw coded(409, "CANDIDATE_LIMIT", "열린 후보 기관장이 너무 많습니다. 기존 후보를 먼저 처리하세요.");
            }
            if (mapper.assignHead(headId, inst, "CANDIDATE", null, me.getEmpNo(), now) != 1) {
                throw stateChanged();
            }
            mapper.setItemsInstitution(headId, inst);
            log("HEAD_MATCH", inst, headId, null, null, null, null, me, actor, self);
            out.put("result", "CANDIDATE_HEAD");
            out.put("into_head_id", headId);
        }
        return out;
    }

    /** 매칭 대기 후보 기각 — 사유 필수. */
    @Transactional
    public Map<String, Object> rejectUnmatched(SysUser me, Actor actor, Long headId, HeadIn.Reason in) {
        String reason = HeadText.requireReason(in == null ? null : in.getReason());
        InstHead head = mapper.selectHeadByIdForUpdate(headId);
        if (head == null) {
            throw hidden();
        }
        if (head.getInstitutionId() != null || !"CANDIDATE".equals(head.getStatusCd())) {
            throw stateChanged();
        }
        String now = Times.nowIso();
        if (mapper.updateHeadStatus(headId, "CANDIDATE", "REJECTED", me.getEmpNo(), now) != 1) {
            throw stateChanged();
        }
        mapper.rejectItemsOfHead(headId, me.getEmpNo(), now);
        log("HEAD_REJECT", null, headId, null, null, null, reason, me, actor, self(me, head.getCreatedBy()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("head_id", headId);
        return out;
    }
}
