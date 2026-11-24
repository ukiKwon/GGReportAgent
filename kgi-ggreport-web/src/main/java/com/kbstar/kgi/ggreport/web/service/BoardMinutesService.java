package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.config.MinutesSettings;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesAct;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesItem;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesLog;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesRev;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesScope;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesSeg;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesSpeaker;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesUtter;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardMinutesIn;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.BoardMinutesMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.minutes.MinutesBudget;
import com.kbstar.kgi.ggreport.web.minutes.MinutesException;
import com.kbstar.kgi.ggreport.web.minutes.MinutesMasker;
import com.kbstar.kgi.ggreport.web.minutes.MinutesParse;
import com.kbstar.kgi.ggreport.web.minutes.MinutesText;
import com.kbstar.kgi.ggreport.web.minutes.SegmentLinker;
import com.kbstar.kgi.ggreport.web.minutes.SpeakerLabels;
import com.kbstar.kgi.ggreport.web.minutes.SummaryParser;
import com.kbstar.kgi.ggreport.web.minutes.TimelineParser;
import com.kbstar.kgi.ggreport.web.minutes.TranscriptParser;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import com.kbstar.kgi.ggreport.web.web.MinutesUpload;
import org.apache.ibatis.session.RowBounds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * 이사회 회의록(047) 업무 — 미리보기·등록·열람·수정·할 일·공개범위·삭제·이력·감사 열람. 권한 판정은 {@link BoardMinutesAccess}(컨트롤러가 계산해 넘긴다),
 * 감사 기록은 컨트롤러의 {@link BoardMinutesAudit}. 이 클래스는 020 서비스를 부르지 않고 매퍼를 읽기·잠금으로만 쓴다.
 *
 * <p>글은 모두 가린 뒤의 것만 저장·응답한다(원본·파일명·가림 단어는 저장하지 않는다). 무거운 파싱은 트랜잭션 밖에서 하고 잠금은 짧게 잡는다.
 * 볼 수 없는 회의록은 404(존재 은닉), 볼 수는 있으나 권한이 없으면 403. 오류 메시지·detail 에 본문·가림 단어·사번을 싣지 않는다.
 * ⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다 — 업무 규칙(실수 방지)이지 사칭 방지가 아니다.
 */
@Service
public class BoardMinutesService {

    static final int LIST_CAP = 300;
    static final int HISTORY_CAP = 200;
    static final int ACT_CAP = 500;
    static final int MINUTES_MAX = 10;
    static final int SCOPE_MAX = 30;
    static final int CANDIDATE_CAP = 2000;
    static final int UPLOAD_RULES_VER = 1;   // 업로드 화면 운용 수칙 4줄의 판 — 화면 문구가 바뀌면 올린다
    static final int UTTER_EDIT_MAX = MinutesParse.EDIT_MAX_CHARS;
    static final int UTTER_EDITS_MAX = 2000;   // 저장 전 수정 발언 수 상한
    static final int ITEM_EDIT_MAX = 1000;
    static final int TITLE_MAX = 100;
    static final String MEETING_MIN = "2000-01-01";
    private static final Pattern HEX64 = Pattern.compile("[0-9a-f]{64}");

    private final BoardMinutesMapper mapper;
    private final BoardMaterialMapper materials;
    private final BoardMinutesAccess access;
    private final MinutesSettings settings;
    private final SysUserMapper users;
    private final TransactionTemplate tx;
    private final ObjectMapper om;

    public BoardMinutesService(BoardMinutesMapper mapper, BoardMaterialMapper materials, BoardMinutesAccess access,
                               MinutesSettings settings, SysUserMapper users, PlatformTransactionManager txm, ObjectMapper om) {
        this.om = om;
        this.mapper = mapper;
        this.materials = materials;
        this.access = access;
        this.settings = settings;
        this.users = users;
        this.tx = new TransactionTemplate(txm);
    }

    // ── 공통 ─────────────────────────────────────────────────────────────

    /** 양의 정수 번호(앞 0 없음, 18자리까지). 아니면 null → 호출자가 404. */
    public static Long parseId(String s) {
        if (s == null || s.isEmpty() || s.length() > 18 || s.charAt(0) < '1' || s.charAt(0) > '9') {
            return null;
        }
        for (int i = 1; i < s.length(); i++) {
            if (s.charAt(i) < '0' || s.charAt(i) > '9') {
                return null;
            }
        }
        return Long.valueOf(s);
    }

    private static Integer parseNo(String s) {
        if (s == null || s.length() > 6) {
            return null;
        }
        Long n = parseId(s);
        return n == null ? null : Integer.valueOf(n.intValue());
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }

    private static ApiException notFound() {
        return ApiException.notFound("회의록을 찾을 수 없습니다.");
    }

    private static ApiException forbidden() {
        return new ApiException(403, "이 회의록에서 할 수 없는 일입니다.");
    }

    private static ApiException revChanged(int current) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "REV_CHANGED");
        d.put("message", "다른 사람이 먼저 고쳤습니다. 새로 고친 뒤 다시 시도해 주세요.");
        d.put("current_rev", Integer.valueOf(current));
        return ApiException.withDetail(409, d);
    }

    /** 볼 수 없으면 404. 그 위에 allowed 가 아니면 403. */
    private static void requireView(BoardMinutes head, BoardMinutesAccess.Decision d, boolean allowed) {
        if (head == null || d == null || !d.view) {
            throw notFound();
        }
        if (!allowed) {
            throw forbidden();
        }
    }

    private static int requireRev(Integer revNo) {
        if (revNo == null || revNo.intValue() < 0) {
            throw coded(400, "REV_NO_REQUIRED", "버전 번호(rev_no)가 없거나 올바르지 않습니다.");
        }
        return revNo.intValue();
    }

    /** 요청마다 새로 만든다(USERS 수백 행). 가림 사전은 상태와 무관하게 모든 사용자 이름. */
    MinutesMasker masker() {
        return new MinutesMasker(mapper.selectAllUserNames());
    }

    private static String strictDate(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.length() != 10) {
            return null;
        }
        try {
            return LocalDate.parse(t).toString().equals(t) ? t : null;
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** 회의일: 엄격한 yyyy-MM-dd, 2000-01-01 이상, 오늘(KST) 이하. 아니면 422. */
    private static String meetingDate(String s) {
        String t = strictDate(s);
        if (t == null || t.compareTo(MEETING_MIN) < 0 || t.compareTo(Times.todayKst()) > 0) {
            throw coded(422, "MEETING_DATE_INVALID", "회의일은 2000-01-01부터 오늘까지의 날짜(yyyy-MM-dd)여야 합니다.");
        }
        return t;
    }

    private static String optDate(String s) {
        if (s == null || s.trim().isEmpty()) {
            return null;
        }
        String t = strictDate(s);
        if (t == null) {
            throw new ApiException(400, "날짜는 yyyy-MM-dd 형식이어야 합니다.");
        }
        return t;
    }

    private static Integer parseYear(String s) {
        if (s == null || s.trim().isEmpty()) {
            return null;
        }
        Long n = parseId(s.trim());
        if (n == null || n.longValue() < 2000 || n.longValue() > 2100) {
            throw new ApiException(400, "연도는 2000~2100 사이여야 합니다.");
        }
        return Integer.valueOf(n.intValue());
    }

    /** LIKE 검색어 — 앞뒤 공백 제거, 80자 상한(초과 400), ! % _ 를 '!' 로 이스케이프. 비면 null. */
    private static String like(String s) {
        if (s == null || s.trim().isEmpty()) {
            return null;
        }
        String t = s.trim();
        if (t.length() > 80) {
            throw new ApiException(400, "검색어는 80자 이하로 입력해 주세요.");
        }
        return t.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private static String time(int sec) {
        int s = Math.max(0, sec);
        return s >= 3600
                ? String.format("%d:%02d:%02d", Integer.valueOf(s / 3600), Integer.valueOf(s / 60 % 60), Integer.valueOf(s % 60))
                : String.format("%02d:%02d", Integer.valueOf(s / 60), Integer.valueOf(s % 60));
    }

    // ── 응답 모양 ────────────────────────────────────────────────────────

    private Map<String, Object> rowMap(BoardMinutes h, BoardMinutesAccess.Via via) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("minutes_id", h.getMinutesId());
        m.put("material_id", h.getMaterialId());
        m.put("institution_id", h.getInstitutionId());
        m.put("institution_name", h.getInstitutionName());
        m.put("board_year", Integer.valueOf(h.getBoardYear()));
        m.put("meeting_date", h.getMeetingDate());
        m.put("title", h.getTitle());
        m.put("utter_cnt", Integer.valueOf(h.getUtterCnt()));
        m.put("speaker_cnt", Integer.valueOf(h.getSpeakerCnt()));
        m.put("duration_sec", Integer.valueOf(h.getDurationSec()));
        m.put("seg_cnt", Integer.valueOf(h.getSegCnt()));
        m.put("rev_no", Integer.valueOf(h.getRevNo()));
        m.put("created_by_name", h.getCreatedByName());
        m.put("created_at", h.getCreatedAt());
        m.put("_via", via);   // 내부 키 — 컨트롤러가 감사 기록 뒤 응답 전에 뺀다
        return m;
    }

    private static Map<String, Object> stats(BoardMinutes h, int itemCnt) {
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("utter_cnt", Integer.valueOf(h.getUtterCnt()));
        s.put("speaker_cnt", Integer.valueOf(h.getSpeakerCnt()));
        s.put("duration_sec", Integer.valueOf(h.getDurationSec()));
        s.put("noise_cnt", Integer.valueOf(h.getNoiseCnt()));
        s.put("seg_cnt", Integer.valueOf(h.getSegCnt()));
        s.put("item_cnt", Integer.valueOf(itemCnt));
        return s;
    }

    private static Map<String, Object> masked(BoardMinutes h) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("pii", Integer.valueOf(h.getMaskPiiCnt()));
        m.put("name", Integer.valueOf(h.getMaskNameCnt()));
        m.put("title", Integer.valueOf(h.getMaskTitleCnt()));
        m.put("term", Integer.valueOf(h.getMaskTermCnt()));
        m.put("line", Integer.valueOf(h.getMaskLineCnt()));
        m.put("label", Integer.valueOf(h.getMaskLabelCnt()));
        m.put("released", Integer.valueOf(h.getReleaseCnt()));
        return m;
    }

    private Map<String, Object> viewer(BoardMinutesAccess.Decision d, BoardMinutes head, SysUser me) {
        Map<String, Object> v = new LinkedHashMap<String, Object>();
        v.put("via", d.via.name());
        v.put("can_edit", Boolean.valueOf(d.edit));
        v.put("can_check_todo", Boolean.valueOf(d.todo));
        v.put("can_view_history", Boolean.valueOf(d.history));
        v.put("can_scope", Boolean.valueOf(d.scopeView));
        v.put("can_scope_edit", Boolean.valueOf(d.scopeEdit));
        v.put("can_delete", Boolean.valueOf(d.delete));
        v.put("can_view_acts", Boolean.valueOf(d.acts));
        v.put("can_view_material", Boolean.valueOf(d.viewMaterial));
        String untilAt = null;
        String until = null;
        if (d.via == BoardMinutesAccess.Via.UPLOADER) {          // 올린 시각 + uploader-days 까지
            untilAt = uploaderUntilAt(head.getCreatedAt());
            until = untilAt == null ? null
                    : OffsetDateTime.parse(untilAt).atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDate().toString();
        } else if (d.via == BoardMinutesAccess.Via.GRANTEE) {    // 공개범위 종료일(그날 포함)
            until = grantUntilOf(head.getMinutesId().longValue(), me.getEmpNo());
        }
        v.put("view_until", until);       // yyyy-MM-dd(KST) — 부장급·기본 열람자는 null(기한 없음)
        v.put("view_until_at", untilAt);  // 등록자만 정확한 끝 시각(ISO), 그 밖 null
        return v;
    }

    private String uploaderUntilAt(String createdAt) {
        if (createdAt == null) {
            return null;
        }
        try {
            return Times.iso(OffsetDateTime.parse(createdAt).toInstant().plus(settings.getUploaderDays(), ChronoUnit.DAYS));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private String grantUntilOf(long id, String empNo) {
        for (BoardMinutesScope s : mapper.selectScope(id)) {
            if (empNo.equals(s.getGrantValue())) {
                return s.getGrantUntil();
            }
        }
        return null;
    }

    private static Map<String, Object> itemMap(BoardMinutesItem it) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("item_no", Integer.valueOf(it.getItemNo()));
        m.put("text", it.getBody());
        m.put("edited", Boolean.valueOf(it.getEditedYn() == 1));
        return m;
    }

    private static Map<String, Object> todoMap(BoardMinutesItem it) {
        Map<String, Object> m = itemMap(it);
        m.put("done", Boolean.valueOf(it.getDoneYn() == 1));
        m.put("done_by_name", it.getDoneByName());
        m.put("done_at", it.getDoneAt());
        return m;
    }

    private static SegmentLinker.Link link(List<BoardMinutesSeg> segs, List<BoardMinutesUtter> utters) {
        List<TimelineParser.Segment> sg = new ArrayList<TimelineParser.Segment>();
        for (BoardMinutesSeg s : segs) {
            sg.add(new TimelineParser.Segment(s.getSegNo(), s.getStartSec(), s.getEndSec(), s.getKeywords(),
                    Collections.<String>emptyList(), 0));
        }
        List<TranscriptParser.Utterance> ul = new ArrayList<TranscriptParser.Utterance>();
        for (BoardMinutesUtter u : utters) {
            ul.add(new TranscriptParser.Utterance(u.getSeqNo(), u.getSpeakerNo(), u.getStartSec(), u.getNoiseYn() == 1, ""));
        }
        return SegmentLinker.link(sg, ul);
    }

    /** summary{topics,todos,others}·segments·out_of_segment_cnt — 상세와 미리보기가 같은 모양을 쓴다. */
    private void putSummary(Map<String, Object> out, List<BoardMinutesUtter> utters, List<BoardMinutesSeg> segs,
                            List<BoardMinutesItem> items) {
        SegmentLinker.Link link = link(segs, utters);
        List<Map<String, Object>> topics = new ArrayList<Map<String, Object>>();
        List<Map<String, Object>> todos = new ArrayList<Map<String, Object>>();
        Map<Integer, Map<String, Object>> others = new LinkedHashMap<Integer, Map<String, Object>>();
        Map<Integer, List<Map<String, Object>>> bySeg = new LinkedHashMap<Integer, List<Map<String, Object>>>();
        for (BoardMinutesItem it : items) {
            String k = it.getKindCd();
            if ("TOPIC".equals(k)) {
                topics.add(itemMap(it));
            } else if ("TODO".equals(k)) {
                todos.add(todoMap(it));
            } else if ("OTHER".equals(k)) {
                Integer no = Integer.valueOf(it.getSectionNo() == null ? 0 : it.getSectionNo().intValue());
                Map<String, Object> sec = others.get(no);
                if (sec == null) {
                    sec = new LinkedHashMap<String, Object>();
                    sec.put("section_no", no);
                    sec.put("title", it.getSectionTitle());
                    sec.put("items", new ArrayList<Map<String, Object>>());
                    others.put(no, sec);
                }
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> list = (List<Map<String, Object>>) sec.get("items");
                list.add(itemMap(it));
            } else if ("SEG".equals(k) && it.getSegNo() != null) {
                List<Map<String, Object>> list = bySeg.get(it.getSegNo());
                if (list == null) {
                    list = new ArrayList<Map<String, Object>>();
                    bySeg.put(it.getSegNo(), list);
                }
                list.add(itemMap(it));
            }
        }
        Map<String, Object> summary = new LinkedHashMap<String, Object>();
        summary.put("topics", topics);
        summary.put("todos", todos);
        summary.put("others", new ArrayList<Map<String, Object>>(others.values()));
        out.put("summary", summary);
        List<Map<String, Object>> segList = new ArrayList<Map<String, Object>>();
        for (BoardMinutesSeg s : segs) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("seg_no", Integer.valueOf(s.getSegNo()));
            m.put("start_sec", Integer.valueOf(s.getStartSec()));
            m.put("end_sec", Integer.valueOf(s.getEndSec()));
            m.put("keywords", new TimelineParser.Segment(s.getSegNo(), s.getStartSec(), s.getEndSec(), s.getKeywords(),
                    Collections.<String>emptyList(), 0).keywordList());
            List<Map<String, Object>> its = bySeg.get(Integer.valueOf(s.getSegNo()));
            m.put("items", its == null ? new ArrayList<Map<String, Object>>() : its);
            m.put("first_seq", link.firstSeq(s.getSegNo()));
            m.put("utter_cnt", Integer.valueOf(link.utterCnt(s.getSegNo())));
            segList.add(m);
        }
        out.put("segments", segList);
        out.put("out_of_segment_cnt", Integer.valueOf(link.outOfSegmentCnt()));
    }

    /** 화자 목록 [{speaker_no, speaker, label, utter_cnt, first_seq}] — 번호순. first_seq = 그 화자의 첫 발언 번호. */
    private static List<Map<String, Object>> speakers(List<BoardMinutesUtter> utters, Map<Integer, String> labels) {
        Map<Integer, Integer> cnt = new TreeMap<Integer, Integer>();
        Map<Integer, Integer> first = new HashMap<Integer, Integer>();      // 잡음이 아닌 첫 발언(화면 firstOf 와 같은 기준)
        Map<Integer, Integer> firstAny = new HashMap<Integer, Integer>();   // 모두 잡음일 때의 첫 발언
        for (BoardMinutesUtter u : utters) {
            Integer k = Integer.valueOf(u.getSpeakerNo());
            Integer c = cnt.get(k);
            cnt.put(k, Integer.valueOf(c == null ? 1 : c.intValue() + 1));
            // utters 는 SEQ_NO 순(selectUtterIndex ORDER BY SEQ_NO, 미리보기는 파싱 순)
            if (!firstAny.containsKey(k)) {
                firstAny.put(k, Integer.valueOf(u.getSeqNo()));
            }
            if (u.getNoiseYn() != 1 && !first.containsKey(k)) {
                first.put(k, Integer.valueOf(u.getSeqNo()));
            }
        }
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (Map.Entry<Integer, Integer> e : cnt.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("speaker_no", e.getKey());
            m.put("speaker", "참석자 " + e.getKey());
            m.put("label", labels.get(e.getKey()));
            m.put("utter_cnt", e.getValue());
            m.put("first_seq", first.containsKey(e.getKey()) ? first.get(e.getKey()) : firstAny.get(e.getKey()));
            out.add(m);
        }
        return out;
    }

    /** 라벨 고르기 규칙 — 화면은 이 목록으로 고르기만 한다(자유 입력 칸 없음). */
    private static Map<String, Object> labelRules() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("affiliations", SpeakerLabels.AFFILIATIONS);
        m.put("roles", SpeakerLabels.ROLES);
        m.put("side_role", SpeakerLabels.SIDE);
        m.put("max_ordinal", Integer.valueOf(SpeakerLabels.MAX_ORDINAL));
        m.put("max_chars", Integer.valueOf(SpeakerLabels.MAX_CHARS));
        return m;
    }

    private Map<Integer, String> labelsOf(long id) {
        Map<Integer, String> m = new TreeMap<Integer, String>();
        for (BoardMinutesSpeaker s : mapper.selectSpeakers(id)) {
            m.put(Integer.valueOf(s.getSpeakerNo()), s.getLabel());
        }
        return m;
    }

    private static ApiException editsInvalid() {
        return coded(400, "EDITS_INVALID", "고친 내용을 읽을 수 없습니다. 미리보기부터 다시 하세요.");
    }

    /** edits 파트 JSON 을 읽는다 — 업로드 자격 확인(requireUploader) 뒤에만 불린다. 깨졌으면 400 EDITS_INVALID(원문 비노출). */
    private MinutesParse.Edits readEdits(String json) {
        if (json == null || json.trim().isEmpty()) {
            return MinutesParse.Edits.NONE;
        }
        BoardMinutesIn.EditsIn in;
        try {
            in = om.readValue(json, BoardMinutesIn.EditsIn.class);
        } catch (IOException | RuntimeException e) {
            throw editsInvalid();
        }
        return toEdits(in);
    }

    /** edits 파트의 모양만 거른다(번호·개수·원시 길이). 내용 검사·가림은 MinutesParse 가 한다. */
    private static MinutesParse.Edits toEdits(BoardMinutesIn.EditsIn in) {
        if (in == null) {
            return MinutesParse.Edits.NONE;
        }
        Map<Integer, String> labels = new TreeMap<Integer, String>();
        if (in.getSpeakerLabels() != null) {
            if (in.getSpeakerLabels().size() > SpeakerLabels.MAX_ENTRIES) {
                throw editsInvalid();
            }
            for (Map.Entry<String, String> e : in.getSpeakerLabels().entrySet()) {
                Integer no = parseNo(e.getKey());
                if (no == null || no.intValue() > TranscriptParser.MAX_SPEAKER_NO) {
                    throw editsInvalid();
                }
                labels.put(no, e.getValue() == null ? "" : e.getValue());
            }
        }
        Map<Integer, String> utters = new TreeMap<Integer, String>();
        if (in.getUtterEdits() != null) {
            if (in.getUtterEdits().size() > UTTER_EDITS_MAX) {
                throw editsInvalid();
            }
            for (BoardMinutesIn.UtterEdit u : in.getUtterEdits()) {
                if (u == null || u.getSeqNo() == null || u.getSeqNo().intValue() < 1
                        || u.getSeqNo().intValue() > TranscriptParser.MAX_UTTERANCES) {
                    throw editsInvalid();
                }
                if (u.getText() == null || u.getText().length() > UTTER_EDIT_MAX * 4) {
                    throw new MinutesException(422, "LIMIT_EDIT_LEN", "edit", 0, u.getSeqNo().intValue(), null);
                }
                if (utters.put(u.getSeqNo(), u.getText()) != null) {
                    throw editsInvalid();   // 같은 발언을 두 번
                }
            }
        }
        return new MinutesParse.Edits(labels, utters);
    }

    private static List<Map<String, Object>> transcriptItems(List<BoardMinutesUtter> utters, SegmentLinker.Link link,
                                                             Map<Integer, String> labels) {
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < utters.size(); i++) {
            BoardMinutesUtter u = utters.get(i);
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("seq_no", Integer.valueOf(u.getSeqNo()));
            m.put("speaker", "참석자 " + u.getSpeakerNo());
            m.put("speaker_no", Integer.valueOf(u.getSpeakerNo()));
            m.put("speaker_label", labels.get(Integer.valueOf(u.getSpeakerNo())));   // 없으면 null → 화면은 '참석자 N'
            m.put("start_sec", Integer.valueOf(u.getStartSec()));
            m.put("time", time(u.getStartSec()));
            m.put("seg_no", link.segNoOf(i));
            m.put("noise", Boolean.valueOf(u.getNoiseYn() == 1));
            m.put("text", u.getBody());
            m.put("edited", Boolean.valueOf(u.getEditedYn() == 1));
            items.add(m);
        }
        return items;
    }

    // ── 읽기 ─────────────────────────────────────────────────────────────

    /** 모아보기 — 최대 LIST_CAP 행. 행마다 내부 키 {@code _via}(컨트롤러가 감사 뒤 뺀다). */
    public Map<String, Object> list(SysUser me, String q, String year, String from, String to) {
        Integer y = parseYear(year);
        String f = optDate(from);
        String t = optDate(to);
        boolean viewAll = access.isDefaultViewer(me);
        BoardMinutesAccess.Via allVia = access.isHeadGrade(me) ? BoardMinutesAccess.Via.HEAD : BoardMinutesAccess.Via.DEFAULT;
        List<BoardMinutes> rows = mapper.selectList(me.getEmpNo(), viewAll, access.uploaderSince(), Times.todayKst(),
                like(q), y, f, t, new RowBounds(0, LIST_CAP + 1));
        boolean truncated = rows.size() > LIST_CAP;
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < rows.size() && i < LIST_CAP; i++) {
            BoardMinutes h = rows.get(i);
            if (viewAll) {
                items.add(rowMap(h, allVia));
                continue;
            }
            BoardMinutesAccess.Decision d = access.decide(me, h);   // 등록자 행은 SQL 이 넓게 걸러 오므로 담당 해제 등을 여기서 다시 거른다
            if (d.view) {
                items.add(rowMap(h, d.via));
            }
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("items", items);
        out.put("truncated", Boolean.valueOf(truncated));
        return out;
    }

    /** 이사회 자료 상세의 탭 목록 — 자료가 없거나 권한이 없어도 같은 200 빈 응답(존재를 드러내지 않는다). */
    public Map<String, Object> listByMaterial(SysUser me, String mid) {
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        boolean canUpload = false;
        Long id = parseId(mid);
        BoardMaterial m = id == null ? null : materials.selectOne(id);
        if (m != null) {
            canUpload = access.canUpload(me, m.getBidCaseId());
            for (BoardMinutes h : mapper.selectByMaterial(id.longValue())) {
                BoardMinutesAccess.Decision d = access.decide(me, h);
                if (d.view) {
                    items.add(rowMap(h, d.via));
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("items", items);
        out.put("can_upload", Boolean.valueOf(canUpload));
        return out;
    }

    public Map<String, Object> detail(SysUser me, BoardMinutes head, BoardMinutesAccess.Decision d) {
        requireView(head, d, true);
        long id = head.getMinutesId().longValue();
        List<BoardMinutesUtter> utters = mapper.selectUtterIndex(id);
        List<BoardMinutesSeg> segs = mapper.selectSegs(id);
        List<BoardMinutesItem> items = mapper.selectItems(id);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("minutes_id", head.getMinutesId());
        out.put("material_id", head.getMaterialId());
        out.put("institution_id", head.getInstitutionId());
        out.put("institution_name", head.getInstitutionName());
        out.put("board_year", Integer.valueOf(head.getBoardYear()));
        out.put("meeting_date", head.getMeetingDate());
        out.put("title", head.getTitle());
        out.put("rev_no", Integer.valueOf(head.getRevNo()));
        out.put("confidential", Boolean.TRUE);
        out.put("stats", stats(head, items.size()));
        out.put("masked", masked(head));
        out.put("speakers", speakers(utters, labelsOf(id)));
        if (d.edit) {
            out.put("speaker_label_rules", labelRules());
        }
        putSummary(out, utters, segs, items);
        out.put("created_by_name", head.getCreatedByName());
        out.put("created_at", head.getCreatedAt());
        out.put("updated_at", head.getUpdatedAt());
        out.put("viewer", viewer(d, head, me));
        return out;
    }

    public Map<String, Object> transcript(SysUser me, BoardMinutes head, BoardMinutesAccess.Decision d) {
        requireView(head, d, true);
        long id = head.getMinutesId().longValue();
        List<BoardMinutesUtter> utters = mapper.selectUtters(id);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("minutes_id", head.getMinutesId());
        out.put("rev_no", Integer.valueOf(head.getRevNo()));
        out.put("items", transcriptItems(utters, link(mapper.selectSegs(id), utters), labelsOf(id)));
        return out;
    }

    /** 변경 이력 + 수정 전후 글(부장급·등록자만). 글은 읽을 때 현재 규칙으로 다시 가린다(나중에 사전에 오른 이름까지). */
    public Map<String, Object> history(BoardMinutes head, BoardMinutesAccess.Decision d) {
        requireView(head, d, d != null && d.history);
        long id = head.getMinutesId().longValue();
        List<Map<String, Object>> logs = new ArrayList<Map<String, Object>>();
        for (BoardMinutesLog l : mapper.selectLogs(id, new RowBounds(0, HISTORY_CAP))) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("event", l.getEventCd());
            m.put("rev_no", l.getRevNo());
            m.put("target_kind", l.getTargetKind());
            m.put("target_no", l.getTargetNo());
            m.put("actor_name", l.getActorName());
            m.put("at", l.getLoggedAt());
            m.put("scope_before_cnt", scopeCount(l.getScopeBefore()));
            m.put("scope_after_cnt", scopeCount(l.getScopeAfter()));
            logs.add(m);
        }
        MinutesMasker mk = masker();
        MinutesBudget b = MinutesBudget.standard();
        MinutesMasker.Session s = mk.newSession(null, null, b);
        List<Map<String, Object>> revs = new ArrayList<Map<String, Object>>();
        for (BoardMinutesRev r : mapper.selectRevs(id, new RowBounds(0, HISTORY_CAP))) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("rev_no", Integer.valueOf(r.getRevNo()));
            m.put("target_kind", r.getTargetKind());
            m.put("target_no", r.getTargetNo());
            m.put("field", r.getFieldCd());
            m.put("old_text", r.getOldText() == null ? null : s.mask(r.getOldText()));
            m.put("new_text", r.getNewText() == null ? null : s.mask(r.getNewText()));
            m.put("edited_by_name", r.getEditedByName());
            m.put("edited_at", r.getEditedAt());
            revs.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("logs", logs);
        out.put("revs", revs);
        return out;
    }

    private static Integer scopeCount(String s) {
        if (s == null) {
            return null;
        }
        return Integer.valueOf(s.isEmpty() ? 0 : s.split(",", -1).length);
    }

    /** 공개범위 목록(사람 단위) — 부장급·기본 열람자(영업팀장)만. */
    public List<Map<String, Object>> scope(BoardMinutes head, BoardMinutesAccess.Decision d) {
        requireView(head, d, d != null && d.scopeView);
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        String today = Times.todayKst();
        for (BoardMinutesScope s : mapper.selectScope(head.getMinutesId().longValue())) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("emp_no", s.getGrantValue());
            m.put("name", s.getName());
            m.put("active", Boolean.valueOf("ACTIVE".equals(s.getStatus())));
            m.put("grant_until", s.getGrantUntil());
            m.put("expired", Boolean.valueOf(s.getGrantUntil() != null && s.getGrantUntil().compareTo(today) < 0));
            m.put("granted_at", s.getGrantedAt());
            out.add(m);
        }
        return out;
    }

    /**
     * 공개범위 후보(부장급만) — {@link BoardMinutesAccess#isScopeCandidate}(scopeAdd 와 같은 규칙: 영업부서 + 임원급, 관리자·기본 열람자 제외).
     * 이미 공개된 사람은 granted·grant_until. 이름순, CANDIDATE_CAP 까지.
     */
    public Map<String, Object> scopeCandidates(BoardMinutes head, BoardMinutesAccess.Decision d) {
        requireView(head, d, d != null && d.scopeEdit);
        String today = Times.todayKst();
        Map<String, String> granted = new HashMap<String, String>();
        for (BoardMinutesScope s : mapper.selectScope(head.getMinutesId().longValue())) {
            granted.put(s.getGrantValue(), s.getGrantUntil());
        }
        List<SysUser> pool = new ArrayList<SysUser>();
        for (SysUser u : users.selectAll()) {
            if (access.isScopeCandidate(u)) {
                pool.add(u);
            }
        }
        Collections.sort(pool, new Comparator<SysUser>() {
            @Override
            public int compare(SysUser a, SysUser b) {
                String x = a.getName() == null ? "" : a.getName();
                String y = b.getName() == null ? "" : b.getName();
                int c = x.compareTo(y);
                return c != 0 ? c : a.getEmpNo().compareTo(b.getEmpNo());
            }
        });
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < pool.size() && i < CANDIDATE_CAP; i++) {
            SysUser u = pool.get(i);
            String until = granted.get(u.getEmpNo());
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("emp_no", u.getEmpNo());
            m.put("name", u.getName());
            m.put("role", u.getRole());
            m.put("position_title", u.getPositionTitle());
            m.put("granted", Boolean.valueOf(until != null));
            m.put("grant_until", until);
            m.put("expired", Boolean.valueOf(until != null && until.compareTo(today) < 0));
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("items", items);
        out.put("truncated", Boolean.valueOf(pool.size() > CANDIDATE_CAP));
        out.put("grant_until_max", LocalDate.parse(today).plusDays(365).toString());
        out.put("scope_max", Integer.valueOf(SCOPE_MAX));
        return out;
    }

    /** 접근 감사 열람(부장급·관리자). 삭제된 회의록도 본다. 존재하지 않으면 404. */
    public List<Map<String, Object>> acts(BoardMinutes head, BoardMinutesAccess.Decision d) {
        if (head == null || d == null || (!d.view && !d.acts)) {
            throw notFound();
        }
        if (!d.acts) {
            throw forbidden();
        }
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        for (BoardMinutesAct a : mapper.selectActs(head.getMinutesId().longValue(), new RowBounds(0, ACT_CAP))) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("act_id", a.getActId());
            m.put("action", a.getActionCd());
            m.put("outcome", a.getOutcome());
            m.put("via", a.getViaCd());
            m.put("actor_emp_no", a.getActorEmpNo());
            m.put("actor_name", a.getActorName());
            m.put("emp_verified", Boolean.valueOf(a.getEmpVerified() == 1));
            m.put("screen_id", a.getScreenId());
            m.put("button_id", a.getButtonId());
            m.put("ui_valid", Boolean.valueOf(a.getUiValid() == 1));
            m.put("at", a.getLoggedAt());
            out.add(m);
        }
        return out;
    }

    // ── 업로드 ───────────────────────────────────────────────────────────

    /** 파싱 결과를 저장·표시용 행으로 — 미리보기와 등록이 같은 번호 매김을 쓴다. */
    private static final class Built {
        final List<BoardMinutesUtter> utters = new ArrayList<BoardMinutesUtter>();
        final List<BoardMinutesSeg> segs = new ArrayList<BoardMinutesSeg>();
        final List<BoardMinutesItem> items = new ArrayList<BoardMinutesItem>();
    }

    private static Built build(MinutesParse p) {
        Built b = new Built();
        for (TranscriptParser.Utterance u : p.utterances) {
            BoardMinutesUtter r = new BoardMinutesUtter();
            r.setSeqNo(u.seqNo);
            r.setSpeakerNo(u.speakerNo);
            r.setStartSec(u.startSec);
            r.setNoiseYn(u.noise ? 1 : 0);
            r.setBody(u.body);
            r.setEditedYn(u.edited ? 1 : 0);
            b.utters.add(r);
        }
        int no = 0;
        for (TimelineParser.Segment g : p.segments) {
            BoardMinutesSeg s = new BoardMinutesSeg();
            s.setSegNo(g.segNo);
            s.setStartSec(g.startSec);
            s.setEndSec(g.endSec);
            s.setKeywords(g.keywords == null || g.keywords.isEmpty() ? null : g.keywords);
            b.segs.add(s);
            int sort = 0;
            for (String text : g.items) {
                BoardMinutesItem it = new BoardMinutesItem();
                it.setItemNo(++no);
                it.setKindCd("SEG");
                it.setSegNo(Integer.valueOf(g.segNo));
                it.setSortNo(++sort);
                it.setBody(text);
                b.items.add(it);
            }
        }
        for (SummaryParser.Section sec : p.sections) {
            int sort = 0;
            for (String text : sec.items) {
                BoardMinutesItem it = new BoardMinutesItem();
                it.setItemNo(++no);
                it.setKindCd(sec.kind.name());
                if (sec.kind == SummaryParser.Kind.OTHER) {
                    it.setSectionNo(Integer.valueOf(sec.sectionNo));
                    it.setSectionTitle(sec.title);
                }
                it.setSortNo(++sort);
                it.setBody(text);
                b.items.add(it);
            }
        }
        return b;
    }

    private BoardMaterial requireMaterial(String mid) {
        Long id = parseId(mid);
        BoardMaterial m = id == null ? null : materials.selectOne(id);
        if (m == null) {
            throw ApiException.notFound("이사회 자료를 찾을 수 없습니다.");
        }
        return m;
    }

    private static ApiException optionsInvalid() {
        return coded(400, "OPTIONS_INVALID", "업로드 옵션을 읽을 수 없습니다.");
    }

    /** 미리보기(confirm=false)는 값이 있을 때만, 등록(confirm=true)은 회의일·제목·미리보기 확인값을 모두 요구한다. 원문은 되돌려 주지 않는다. */
    private static BoardMinutesIn.MinutesOptions checkOptions(BoardMinutesIn.MinutesOptions in, boolean confirm) {
        BoardMinutesIn.MinutesOptions o = in;
        if (o == null) {
            if (confirm) {
                throw optionsInvalid();
            }
            o = new BoardMinutesIn.MinutesOptions();
        }
        String date = o.getMeetingDate();
        if (date == null || date.trim().isEmpty()) {
            if (confirm) {
                throw coded(422, "MEETING_DATE_INVALID", "회의일을 입력하세요.");
            }
            o.setMeetingDate(null);
        } else {
            o.setMeetingDate(meetingDate(date));
        }
        String title = o.getTitle();
        if (title == null || title.trim().isEmpty()) {
            if (confirm) {
                throw coded(422, "TITLE_REQUIRED", "제목을 입력하세요.");
            }
            o.setTitle(null);
        } else if (title.trim().length() > TITLE_MAX) {
            throw coded(422, "TITLE_REQUIRED", "제목은 1~" + TITLE_MAX + "자로 입력하세요.");
        } else {
            o.setTitle(title.trim());
        }
        if ((o.getTerms() != null && o.getTerms().size() > MinutesMasker.MAX_TERMS)
                || (o.getRelease() != null && o.getRelease().size() > MinutesMasker.MAX_TERMS)) {
            throw optionsInvalid();
        }
        if (confirm && (o.getPreviewDigest() == null || !HEX64.matcher(o.getPreviewDigest()).matches())) {
            throw optionsInvalid();
        }
        if (o.getEditsDigest() != null && !HEX64.matcher(o.getEditsDigest()).matches()) {
            throw optionsInvalid();
        }
        if (confirm && !Boolean.TRUE.equals(o.getRulesAck())) {
            throw coded(422, "RULES_ACK_REQUIRED", "운용 수칙을 확인했다는 체크가 있어야 저장할 수 있습니다.");
        }
        return o;
    }

    /** options 파트 JSON 을 읽는다 — 업로드 자격 확인 뒤에만 불린다. 비었으면 null, 깨졌으면 400 OPTIONS_INVALID(원문 비노출). */
    private BoardMinutesIn.MinutesOptions readOptions(String json) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            return om.readValue(json, BoardMinutesIn.MinutesOptions.class);
        } catch (IOException | RuntimeException e) {
            throw optionsInvalid();
        }
    }

    /** 크기·확장자를 먼저 보고(바이트 읽기 전) 통과하면 읽는다. 파일명은 확장자 검사에만 쓴다. */
    private void precheck(MultipartFile f, String slot) {
        if (f == null) {
            return;
        }
        if (f.getSize() == 0) {
            throw com.kbstar.kgi.ggreport.web.minutes.MinutesException.unprocessable("EMPTY_FILE", slot, 0);
        }
        if (f.getSize() > settings.getMaxFileBytes()) {
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("code", "FILE_TOO_LARGE");
            d.put("message", "파일이 너무 큽니다. " + (settings.getMaxFileBytes() / (1024L * 1024L)) + "MB 이하만 올릴 수 있습니다.");
            d.put("slot", slot);
            throw ApiException.withDetail(413, d);
        }
        MinutesText.checkFileName(f.getOriginalFilename(), slot);
    }

    private static byte[] bytes(MultipartFile f) {
        if (f == null) {
            return null;
        }
        try {
            return f.getBytes();
        } catch (IOException e) {
            throw coded(400, "BAD_REQUEST", "업로드한 내용을 읽을 수 없습니다. 파일을 다시 선택해 올려 주세요.");
        }
    }

    /** 업로드 자격(담당자)·옵션·파일을 확인하고 파싱한다. 아무것도 저장하지 않는다(미리보기와 등록이 함께 쓴다). */
    private MinutesParse parseUpload(MinutesUpload in, BoardMinutesIn.MinutesOptions o) {
        MinutesParse.Edits edits = readEdits(in.getEditsJson());   // 업로드 자격 확인(requireUploader) 뒤에만 불린다
        return MinutesParse.parse(bytes(in.getTranscript()), bytes(in.getTimeline()), bytes(in.getSummary()),
                o.getTitle(), masker(), o.getTerms(), o.getRelease(), edits, MinutesBudget.standard());
    }

    private void requireUploader(SysUser me, BoardMaterial m, MinutesUpload in) {
        if (!access.canUpload(me, m.getBidCaseId())) {
            throw new ApiException(403, "이 이사회 자료의 회의록을 올릴 권한이 없습니다.");   // 파싱 전에 거부(CPU 낭비 방지)
        }
        if (in == null || in.getTranscript() == null) {
            throw coded(422, "TRANSCRIPT_REQUIRED", "원문 파일(transcript)을 올리세요.");
        }
        precheck(in.getTranscript(), "transcript");   // 크기·확장자는 옵션 검사보다 먼저(바이트는 아직 읽지 않는다)
        precheck(in.getTimeline(), "timeline");
        precheck(in.getSummary(), "summary");
    }

    /** 미리보기 — 저장하지 않는다. 가린 결과·건수·경고·이름 후보·확인값(preview_digest)을 돌려준다. */
    public Map<String, Object> preview(SysUser me, Actor actor, String mid, MinutesUpload in) {
        BoardMaterial m = requireMaterial(mid);
        requireUploader(me, m, in);
        BoardMinutesIn.MinutesOptions o = checkOptions(readOptions(in.getOptionsJson()), false);
        MinutesParse p = parseUpload(in, o);
        Built b = build(p);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("material_id", m.getMaterialId());
        out.put("institution_name", m.getInstitutionName());
        out.put("board_year", Integer.valueOf(m.getBoardYear()));
        out.put("meeting_date", o.getMeetingDate());
        out.put("title", p.title);
        BoardMinutes h = headOf(me, m, o, p);
        out.put("stats", stats(h, b.items.size()));
        out.put("masked", masked(h));
        putSummary(out, b.utters, b.segs, b.items);
        out.put("transcript", transcriptItems(b.utters, link(b.segs, b.utters), p.labels));
        out.put("speakers", speakers(b.utters, p.labels));
        out.put("speaker_label_rules", labelRules());
        out.put("edited_cnt", Integer.valueOf(p.editedCnt));
        List<Map<String, Object>> warnings = new ArrayList<Map<String, Object>>();
        for (Map.Entry<String, Integer> e : p.warnings.entrySet()) {
            Map<String, Object> w = new LinkedHashMap<String, Object>();
            w.put("code", e.getKey());
            w.put("count", e.getValue());
            warnings.add(w);
        }
        out.put("warnings", warnings);
        List<Map<String, Object>> names = new ArrayList<Map<String, Object>>();
        for (Map.Entry<String, Integer> e : p.nameCandidates.entrySet()) {
            Map<String, Object> n = new LinkedHashMap<String, Object>();
            n.put("term", e.getKey());
            n.put("hits", e.getValue());
            names.add(n);
        }
        out.put("name_candidates", names);
        out.put("preview_digest", MinutesParse.previewDigest(p.digest, o.getTerms(), o.getRelease()));
        out.put("edits_digest", p.editsDigest);   // null = 고친 것 없음. 저장 때 options.edits_digest 로 그대로 돌려보낸다
        return out;
    }

    private BoardMinutes headOf(SysUser me, BoardMaterial m, BoardMinutesIn.MinutesOptions o, MinutesParse p) {
        String now = Times.nowIso();
        BoardMinutes h = new BoardMinutes();
        h.setMaterialId(m.getMaterialId());
        h.setBidCaseId(m.getBidCaseId());
        h.setInstitutionId(m.getInstitutionId());
        h.setBoardYear(m.getBoardYear());
        h.setMeetingDate(o.getMeetingDate());
        h.setTitle(p.title);
        h.setEncTranscript(p.encTranscript);
        h.setEncTimeline(p.encTimeline);
        h.setEncSummary(p.encSummary);
        h.setUtterCnt(p.utterCnt());
        h.setSpeakerCnt(p.speakerCnt);
        h.setDurationSec(p.durationSec);
        h.setNoiseCnt(p.noiseCnt);
        h.setSegCnt(p.segCnt());
        h.setMaskPiiCnt(p.maskPii);
        h.setMaskNameCnt(p.maskName);
        h.setMaskTitleCnt(p.maskTitle);
        h.setMaskTermCnt(p.maskTerm);
        h.setMaskLineCnt(p.maskLine);
        h.setMaskLabelCnt(p.maskLabel);
        h.setReleaseCnt(p.released);
        h.setRuleVer(MinutesMasker.RULE_VER);
        h.setContentDigest(p.digest);
        h.setCreatedBy(me.getEmpNo());
        h.setCreatedAt(now);
        h.setUpdatedBy(me.getEmpNo());
        h.setUpdatedAt(now);
        return h;
    }

    /** 등록 — 미리보기와 같은 입력을 처음부터 다시 계산해 확인값이 같을 때만 저장한다(다르면 409 PREVIEW_CHANGED). 한 트랜잭션. */
    public Map<String, Object> upload(final SysUser me, final Actor actor, String mid, MinutesUpload in) {
        final BoardMaterial m = requireMaterial(mid);
        requireUploader(me, m, in);
        BoardMinutesIn.MinutesOptions o = checkOptions(readOptions(in.getOptionsJson()), true);
        final MinutesParse p = parseUpload(in, o);   // 무거운 일은 트랜잭션 밖에서
        if (p.title == null || p.title.trim().isEmpty()) {
            throw coded(422, "TITLE_REQUIRED", "제목을 입력하세요.");
        }
        String wantEdits = o.getEditsDigest();
        if (!MinutesParse.previewDigest(p.digest, o.getTerms(), o.getRelease()).equals(o.getPreviewDigest())
                || (p.editsDigest == null ? wantEdits != null : !p.editsDigest.equals(wantEdits))) {
            throw coded(409, "PREVIEW_CHANGED", "미리보기 뒤에 내용이 바뀌었습니다. 미리보기를 다시 확인해 주세요.");
        }
        final Built b = build(p);
        final BoardMinutes head = headOf(me, m, o, p);
        final long materialId = m.getMaterialId().longValue();
        return tx.execute(s -> {
            materials.lockAssignCase(m.getBidCaseId());   // 020 과 같은 직렬화(배정 변경 승인과)
            if (!access.canUpload(me, m.getBidCaseId())) {
                throw new ApiException(403, "이 이사회 자료의 회의록을 올릴 권한이 없습니다.");
            }
            mapper.lockMaterial(materialId);
            if (mapper.countActiveByMaterial(materialId) >= MINUTES_MAX) {
                throw coded(409, "MINUTES_CAP", "이 이사회 자료에는 회의록을 " + MINUTES_MAX + "건까지 올릴 수 있습니다.");
            }
            List<Long> dup = mapper.selectIdsByDigest(materialId, p.digest);
            if (!dup.isEmpty()) {
                Map<String, Object> d = new LinkedHashMap<String, Object>();
                d.put("code", "ALREADY_UPLOADED");
                d.put("message", "같은 내용의 회의록이 이미 올라와 있습니다.");
                BoardMinutes existing = mapper.selectHead(dup.get(0).longValue());
                if (existing != null && access.decide(me, existing).view) {
                    d.put("minutes_id", existing.getMinutesId());   // 볼 수 있는 사람에게만
                }
                throw ApiException.withDetail(409, d);
            }
            mapper.insertHead(head);
            Long id = head.getMinutesId();
            for (BoardMinutesUtter u : b.utters) {
                u.setMinutesId(id);
                mapper.insertUtter(u);
            }
            for (BoardMinutesSeg g : b.segs) {
                g.setMinutesId(id);
                mapper.insertSeg(g);
            }
            for (BoardMinutesItem it : b.items) {
                it.setMinutesId(id);
                mapper.insertItem(it);
            }
            for (Map.Entry<Integer, String> e : p.labels.entrySet()) {
                mapper.insertSpeaker(id.longValue(), e.getKey().intValue(), e.getValue());
            }
            log(id.longValue(), materialId, "UPLOAD", Integer.valueOf(0), null, null, null, null, me, actor);
            log(id.longValue(), materialId, "RULES_ACK", null, "RULES", Integer.valueOf(UPLOAD_RULES_VER), null, null, me, actor);
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("minutes_id", id);
            out.put("material_id", m.getMaterialId());
            out.put("rev_no", Integer.valueOf(0));
            out.put("stats", stats(head, b.items.size()));
            out.put("masked", masked(head));
            out.put("edited_cnt", Integer.valueOf(p.editedCnt));
            out.put("label_cnt", Integer.valueOf(p.labels.size()));
            return out;
        });
    }

    // ── 쓰기 ─────────────────────────────────────────────────────────────

    private void log(long minutesId, long materialId, String event, Integer rev, String kind, Integer no,
                     String before, String after, SysUser me, Actor actor) {
        BoardMinutesLog l = new BoardMinutesLog();
        l.setMinutesId(Long.valueOf(minutesId));
        l.setMaterialId(Long.valueOf(materialId));
        l.setEventCd(event);
        l.setRevNo(rev);
        l.setTargetKind(kind);
        l.setTargetNo(no);
        l.setScopeBefore(before);
        l.setScopeAfter(after);
        l.setActorEmpNo(me.getEmpNo());
        l.setEmpVerified(actor != null && actor.isVerified() ? 1 : 0);
        l.setLoggedAt(Times.nowIso());
        mapper.insertLog(l);
    }

    private void rev(long id, int revNo, String kind, Integer no, String field, String oldText, String newText, SysUser me, String now) {
        BoardMinutesRev r = new BoardMinutesRev();
        r.setMinutesId(Long.valueOf(id));
        r.setRevNo(revNo);
        r.setTargetKind(kind);
        r.setTargetNo(no);
        r.setFieldCd(field);
        r.setOldText(oldText);
        r.setNewText(newText);
        r.setEditedBy(me.getEmpNo());
        r.setEditedAt(now);
        mapper.insertRev(r);
    }

    public Map<String, Object> editUtter(SysUser me, Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                         String seq, BoardMinutesIn.EditIn in) {
        requireView(head, d, d != null && d.edit);
        Integer no = parseNo(seq);
        if (no == null) {
            throw notFound();
        }
        return editText(me, actor, head, in, "UTTER", no.intValue(), UTTER_EDIT_MAX);
    }

    public Map<String, Object> editItem(SysUser me, Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                        String itemNo, BoardMinutesIn.EditIn in) {
        requireView(head, d, d != null && d.edit);
        Integer no = parseNo(itemNo);
        if (no == null) {
            throw notFound();
        }
        return editText(me, actor, head, in, "ITEM", no.intValue(), ITEM_EDIT_MAX);
    }

    private Map<String, Object> editText(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesIn.EditIn in,
                                         final String kind, final int no, int max) {
        if (in == null) {
            throw coded(400, "BAD_REQUEST", "요청 내용이 없습니다.");
        }
        final int revNo = requireRev(in.getRevNo());
        String raw = in.getText();
        if (raw == null || raw.length() > max * 4) {
            throw coded(422, "LIMIT_EDIT_LEN", "글자 수가 맞지 않습니다(1~" + max + "자).");
        }
        final MinutesBudget budget = MinutesBudget.standard();
        final MinutesMasker mk = masker();
        final String clean = mk.requireClean(raw, budget);   // 걸리면 422 MASK_REQUIRED(건수만). 저장하는 글은 이 값(검사한 글과 같게)
        if (clean.trim().isEmpty() || clean.length() > max) {
            throw coded(422, "LIMIT_EDIT_LEN", "글자 수가 맞지 않습니다(1~" + max + "자).");
        }
        final long id = head.getMinutesId().longValue();
        final String now = Times.nowIso();
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.edit);
            if (h.getRevNo() != revNo) {
                throw revChanged(h.getRevNo());
            }
            String old;
            if ("UTTER".equals(kind)) {
                old = mapper.selectUtterBody(id, no);
            } else {
                BoardMinutesItem it = mapper.selectItem(id, no);
                old = it == null ? null : it.getBody();
            }
            if (old == null) {
                throw notFound();
            }
            // 가림 토큰 보존 — 저장된 가린 본문(old)보다 토큰이 줄면 거부(UTTER·ITEM 공통). 값은 싣지 않고 종류별 빠진 수만.
            Map<String, Integer> removed = MinutesMasker.removedTokens(old, clean);
            if (!removed.isEmpty()) {
                throw new MinutesException(422, "EDIT_MASK_REMOVED", "edit", 0, no, removed);
            }
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            if (old.equals(clean)) {
                out.put("changed", Boolean.FALSE);
                out.put("rev_no", Integer.valueOf(h.getRevNo()));
                return out;
            }
            int next = h.getRevNo() + 1;
            if (mapper.bumpRev(id, h.getRevNo(), next, me.getEmpNo(), now) != 1) {
                throw revChanged(h.getRevNo());
            }
            if ("UTTER".equals(kind)) {
                mapper.updateUtterBody(id, no, clean);
            } else {
                mapper.updateItemBody(id, no, clean);
            }
            // OLD_TEXT 도 현재 규칙으로 다시 가린 글만 남긴다(등록 때 해제한 이름이 이력에 되살아나지 않게)
            rev(id, next, kind, Integer.valueOf(no), "BODY", mk.newSession(null, null, budget).mask(old), clean, me, now);
            log(id, h.getMaterialId().longValue(), "EDIT", Integer.valueOf(next), kind, Integer.valueOf(no), null, null, me, actor);
            out.put("changed", Boolean.TRUE);
            out.put("rev_no", Integer.valueOf(next));
            return out;
        });
    }

    /** 발화자 역할 라벨 하나(저장 후) — 고정 어휘만, 빈 값이면 지운다. 버전을 올리고 이력(이전→이후)·LOG 를 남긴다. 권한은 고치기와 같다. */
    public Map<String, Object> editSpeaker(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                           String speakerNo, BoardMinutesIn.SpeakerIn in) {
        requireView(head, d, d != null && d.edit);
        Integer no = parseNo(speakerNo);
        if (no == null || no.intValue() > TranscriptParser.MAX_SPEAKER_NO) {
            throw notFound();
        }
        if (in == null) {
            throw coded(400, "BAD_REQUEST", "요청 내용이 없습니다.");
        }
        final int revNo = requireRev(in.getRevNo());
        final int sp = no.intValue();
        final String label = SpeakerLabels.normalize(in.getLabel(), sp);   // 형식 밖 → 422 LABEL_INVALID{form}
        if (label != null) {
            SpeakerLabels.requireClean(masker(), label, sp, MinutesBudget.standard());   // 직원 명단·PII → 422{name|pii|title}
        }
        final long id = head.getMinutesId().longValue();
        final String now = Times.nowIso();
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.edit);
            if (h.getRevNo() != revNo) {
                throw revChanged(h.getRevNo());
            }
            if (mapper.countUtterBySpeaker(id, sp) == 0) {
                throw notFound();
            }
            String old = mapper.selectSpeakerLabel(id, sp);
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("speaker_no", Integer.valueOf(sp));
            out.put("label", label);
            if (old == null ? label == null : old.equals(label)) {
                out.put("changed", Boolean.FALSE);
                out.put("rev_no", Integer.valueOf(h.getRevNo()));
                return out;
            }
            int next = h.getRevNo() + 1;
            if (mapper.bumpRev(id, h.getRevNo(), next, me.getEmpNo(), now) != 1) {
                throw revChanged(h.getRevNo());
            }
            mapper.deleteSpeaker(id, sp);
            if (label != null) {
                mapper.insertSpeaker(id, sp, label);
            }
            rev(id, next, "SPEAKER", Integer.valueOf(sp), "LABEL", old, label, me, now);
            log(id, h.getMaterialId().longValue(), "EDIT", Integer.valueOf(next), "SPEAKER", Integer.valueOf(sp), null, null, me, actor);
            out.put("changed", Boolean.TRUE);
            out.put("rev_no", Integer.valueOf(next));
            return out;
        });
    }

    /** 제목 또는 회의일 한 칸(한 번에 한 칸 — 버전 하나에 이력 한 줄). */
    public Map<String, Object> editMeta(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                        BoardMinutesIn.MetaIn in) {
        requireView(head, d, d != null && d.edit);
        if (in == null) {
            throw coded(400, "BAD_REQUEST", "요청 내용이 없습니다.");
        }
        final int revNo = requireRev(in.getRevNo());
        final boolean isTitle = "title".equals(in.getField());
        if (!isTitle && !"meeting_date".equals(in.getField())) {
            throw coded(400, "FIELD_INVALID", "고칠 수 있는 칸은 title, meeting_date 입니다.");
        }
        final MinutesBudget budget = MinutesBudget.standard();
        final MinutesMasker mk = masker();
        final String value;
        if (isTitle) {
            String raw = in.getValue();
            if (raw == null || raw.length() > TITLE_MAX * 4) {
                throw coded(422, "LIMIT_EDIT_LEN", "제목은 1~" + TITLE_MAX + "자로 입력하세요.");
            }
            String clean = mk.requireClean(raw, budget).replace('\n', ' ').trim();
            if (clean.isEmpty() || clean.length() > TITLE_MAX) {
                throw coded(422, "LIMIT_EDIT_LEN", "제목은 1~" + TITLE_MAX + "자로 입력하세요.");
            }
            value = clean;
        } else {
            value = meetingDate(in.getValue());
        }
        final long id = head.getMinutesId().longValue();
        final String now = Times.nowIso();
        return tx.execute(s -> {
            BoardMinutes locked = lockAndRecheck(me, head, x -> x.edit);
            if (locked.getRevNo() != revNo) {
                throw revChanged(locked.getRevNo());
            }
            BoardMinutes cur = mapper.selectHead(id);
            String old = isTitle ? cur.getTitle() : cur.getMeetingDate();
            if (isTitle) {
                // 가림 토큰 보존 — editText 와 같은 기준(저장된 제목 대비). 값은 싣지 않고 종류별 빠진 수만, slot=title.
                Map<String, Integer> removed = MinutesMasker.removedTokens(old, value);
                if (!removed.isEmpty()) {
                    throw new MinutesException(422, "EDIT_MASK_REMOVED", "title", 0, removed);
                }
            }
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("field", isTitle ? "title" : "meeting_date");
            out.put("value", value);
            if (value.equals(old)) {
                out.put("changed", Boolean.FALSE);
                out.put("rev_no", Integer.valueOf(locked.getRevNo()));
                return out;
            }
            int next = locked.getRevNo() + 1;
            if (mapper.bumpRev(id, locked.getRevNo(), next, me.getEmpNo(), now) != 1) {
                throw revChanged(locked.getRevNo());
            }
            mapper.updateMeta(id, isTitle ? value : null, isTitle ? null : value);
            rev(id, next, "META", null, isTitle ? "TITLE" : "MEETING_DATE",
                isTitle ? mk.newSession(null, null, budget).mask(old) : old, value, me, now);
            log(id, locked.getMaterialId().longValue(), "EDIT", Integer.valueOf(next), "META", null, null, null, me, actor);
            out.put("changed", Boolean.TRUE);
            out.put("rev_no", Integer.valueOf(next));
            return out;
        });
    }

    /** 할 일 체크 — 멱등, 버전(REV)을 올리지 않는다. 누가·언제 체크했는지는 항목과 LOG 에 남는다. */
    public Map<String, Object> todo(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                    String itemNo, BoardMinutesIn.TodoIn in) {
        requireView(head, d, d != null && d.todo);
        Integer no = parseNo(itemNo);
        if (no == null) {
            throw notFound();
        }
        if (in == null || in.getDone() == null) {
            throw coded(400, "BAD_REQUEST", "done 값(true/false)이 필요합니다.");
        }
        final int itemNumber = no.intValue();
        final boolean done = in.getDone().booleanValue();
        final long id = head.getMinutesId().longValue();
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.todo);
            BoardMinutesItem it = mapper.selectItem(id, itemNumber);
            if (it == null) {
                throw notFound();
            }
            if (!"TODO".equals(it.getKindCd())) {
                throw coded(400, "NOT_TODO", "다음 할 일 항목이 아닙니다.");
            }
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("item_no", Integer.valueOf(itemNumber));
            out.put("done", Boolean.valueOf(done));
            if ((it.getDoneYn() == 1) == done) {
                out.put("changed", Boolean.FALSE);
                return out;
            }
            mapper.updateItemDone(id, itemNumber, done ? 1 : 0, me.getEmpNo(), Times.nowIso());
            log(id, h.getMaterialId().longValue(), done ? "TODO_DONE" : "TODO_UNDONE", null, "ITEM", Integer.valueOf(itemNumber),
                    null, null, me, actor);
            out.put("changed", Boolean.TRUE);
            return out;
        });
    }

    private static String empList(List<BoardMinutesScope> rows, String except) {
        List<String> emps = new ArrayList<String>();
        for (BoardMinutesScope r : rows) {
            emps.add(r.getGrantValue());
        }
        Collections.sort(emps);
        StringBuilder sb = new StringBuilder();
        for (String e : emps) {
            if (e.equals(except)) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(e);
        }
        return sb.toString();
    }

    private static String sortedWith(List<BoardMinutesScope> rows, String extra) {
        List<String> emps = new ArrayList<String>();
        for (BoardMinutesScope r : rows) {
            emps.add(r.getGrantValue());
        }
        if (extra != null && !emps.contains(extra)) {
            emps.add(extra);
        }
        Collections.sort(emps);
        StringBuilder sb = new StringBuilder();
        for (String e : emps) {
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(e);
        }
        return sb.toString();
    }

    /** 재판정에서 거부될 때 새 판정의 경로(VIA)를 컨트롤러 감사 기록에 싣는 예외(상태·문구는 ApiException 그대로). */
    public static final class RecheckException extends ApiException {
        private final BoardMinutesAccess.Via via;

        RecheckException(int status, String message, BoardMinutesAccess.Via via) {
            super(status, message);
            this.via = via;
        }

        public BoardMinutesAccess.Via getVia() {
            return via;
        }
    }

    /**
     * 쓰기 트랜잭션 안 재판정 — 배정 잠금(업로드·020 과 같은 순서: BID_ASSIGN_CASE → 머리) 뒤 머리를 잠그고 사용자·판정을 다시 읽는다.
     * 요청 시작 뒤 담당 해제·역할 변경·삭제가 끼어들었으면 볼 수 없으면 404, 볼 수는 있으나 권한을 잃었으면 403.
     */
    private BoardMinutes lockAndRecheck(SysUser me, BoardMinutes head, Predicate<BoardMinutesAccess.Decision> allowed) {
        if (head.getBidCaseId() != null) {
            materials.lockAssignCase(head.getBidCaseId());
        }
        BoardMinutes h = mapper.lockHead(head.getMinutesId().longValue());
        if (h == null || h.isDeleted()) {
            throw new RecheckException(404, "회의록을 찾을 수 없습니다.", BoardMinutesAccess.Via.NONE);
        }
        BoardMinutesAccess.Decision now = access.decide(users.selectByEmpNo(me.getEmpNo()), h);
        if (!now.view) {
            throw new RecheckException(404, "회의록을 찾을 수 없습니다.", now.via);
        }
        if (!allowed.test(now)) {
            throw new RecheckException(403, "이 회의록에서 할 수 없는 일입니다.", now.via);
        }
        return h;
    }

    /** 공개범위 추가·연장(부장급만). 사람 단위 — 대상은 후보 규칙({@link BoardMinutesAccess#isScopeCandidate}). 사번은 응답·오류에 싣지 않는다. */
    public Map<String, Object> scopeAdd(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                        BoardMinutesIn.ScopeIn in) {
        requireView(head, d, d != null && d.scopeEdit);
        if (in == null) {
            throw coded(400, "BAD_REQUEST", "요청 내용이 없습니다.");
        }
        final String target = in.getEmpNo() == null ? null : in.getEmpNo().trim();
        SysUser t = MenuPerms.isEmpNo(target) ? users.selectByEmpNo(target) : null;
        if (t == null || !"ACTIVE".equals(t.getStatus())) {   // 없는 사번·비활성
            throw coded(400, "SCOPE_TARGET_INVALID", "공개할 사람을 확인할 수 없습니다.");
        }
        // 활성인데 후보 규칙(isScopeCandidate)에 안 맞으면 별도 코드. 기본 열람자(영업팀장·영업부장)만 아래에서 '이미 기본 열람자'로 먼저 돌려보낸다.
        // 존재 노출: 이 API는 부장급만 부르므로 수용(qa P2-1, 11-24).
        if (!access.isDefaultViewer(t) && !access.isScopeCandidate(t)) {
            throw coded(400, "SCOPE_TARGET_NOT_ELIGIBLE", "공개 대상이 아닙니다. 회의록은 영업부서와 임원급에게만 공개할 수 있습니다.");
        }
        String until = strictDate(in.getGrantUntil());
        String today = Times.todayKst();
        if (until == null || until.compareTo(today) < 0 || until.compareTo(LocalDate.parse(today).plusDays(365).toString()) > 0) {
            throw coded(400, "GRANT_UNTIL_INVALID", "종료일은 오늘부터 365일 이내의 날짜(yyyy-MM-dd)여야 합니다.");
        }
        final String grantUntil = until;
        final long id = head.getMinutesId().longValue();
        final Map<String, Object> out = new LinkedHashMap<String, Object>();
        if (access.isDefaultViewer(t)) {   // 영업팀장·영업부장은 이미 기본 열람자
            out.put("changed", Boolean.FALSE);
            out.put("reason", "ALREADY_DEFAULT");
            return out;
        }
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.scopeEdit);
            List<BoardMinutesScope> rows = mapper.selectScope(id);
            BoardMinutesScope existing = null;
            for (BoardMinutesScope r : rows) {
                if (target.equals(r.getGrantValue())) {
                    existing = r;
                }
            }
            String now = Times.nowIso();
            String event;
            if (existing != null) {
                if (grantUntil.equals(existing.getGrantUntil())) {
                    out.put("changed", Boolean.FALSE);
                    return out;
                }
                existing.setMinutesId(Long.valueOf(id));
                existing.setGrantUntil(grantUntil);
                existing.setGrantedBy(me.getEmpNo());
                existing.setGrantedAt(now);
                mapper.updateScopeUntil(existing);
                event = "SCOPE_EXTEND";
            } else {
                if (rows.size() >= SCOPE_MAX) {
                    throw coded(422, "SCOPE_CAP", "공개 대상은 " + SCOPE_MAX + "명까지 지정할 수 있습니다.");
                }
                BoardMinutesScope n = new BoardMinutesScope();
                n.setMinutesId(Long.valueOf(id));
                n.setGrantType("EMP");
                n.setGrantValue(target);
                n.setGrantUntil(grantUntil);
                n.setGrantedBy(me.getEmpNo());
                n.setGrantedAt(now);
                mapper.insertScope(n);
                event = "SCOPE_ADD";
            }
            log(id, h.getMaterialId().longValue(), event, null, "SCOPE", null, empList(rows, null), sortedWith(rows, target), me, actor);
            out.put("changed", Boolean.TRUE);
            out.put("event", event);
            return out;
        });
    }

    public Map<String, Object> scopeRemove(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                           BoardMinutesIn.ScopeIn in) {
        requireView(head, d, d != null && d.scopeEdit);
        final String target = in == null || in.getEmpNo() == null ? null : in.getEmpNo().trim();
        if (!MenuPerms.isEmpNo(target)) {
            throw coded(400, "SCOPE_TARGET_INVALID", "공개를 거둘 사람을 확인할 수 없습니다.");
        }
        final long id = head.getMinutesId().longValue();
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.scopeEdit);
            List<BoardMinutesScope> rows = mapper.selectScope(id);
            boolean present = false;
            for (BoardMinutesScope r : rows) {
                present |= target.equals(r.getGrantValue());
            }
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            if (!present) {
                out.put("changed", Boolean.FALSE);
                return out;
            }
            mapper.deleteScope(id, target);
            log(id, h.getMaterialId().longValue(), "SCOPE_REMOVE", null, "SCOPE", null, empList(rows, null), empList(rows, target),
                    me, actor);
            out.put("changed", Boolean.TRUE);
            return out;
        });
    }

    /** 삭제(부장급만) — 본문·구간·항목·공개범위·수정 이력을 지우고 머리만 '(삭제됨)' 표시로 남긴다. LOG·ACT 는 남는다. */
    public Map<String, Object> delete(final SysUser me, final Actor actor, BoardMinutes head, BoardMinutesAccess.Decision d,
                                      BoardMinutesIn.DeleteIn in) {
        requireView(head, d, d != null && d.delete);
        final int revNo = requireRev(in == null ? null : in.getRevNo());
        final long id = head.getMinutesId().longValue();
        return tx.execute(s -> {
            BoardMinutes h = lockAndRecheck(me, head, x -> x.delete);
            if (h.getRevNo() != revNo) {
                throw revChanged(h.getRevNo());
            }
            mapper.deleteUtters(id);
            mapper.deleteSegs(id);
            mapper.deleteItems(id);
            mapper.deleteScopes(id);
            mapper.deleteRevs(id);
            mapper.deleteSpeakers(id);
            mapper.markDeleted(id, me.getEmpNo(), Times.nowIso());
            log(id, h.getMaterialId().longValue(), "DELETE", Integer.valueOf(h.getRevNo()), null, null, null, null, me, actor);
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("deleted", Boolean.TRUE);
            return out;
        });
    }
}
