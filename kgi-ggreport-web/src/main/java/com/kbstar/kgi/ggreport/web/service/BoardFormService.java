package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardFormJson;
import com.kbstar.kgi.ggreport.web.domain.BoardForm;
import com.kbstar.kgi.ggreport.web.domain.BoardFormVer;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardFormIn;
import com.kbstar.kgi.ggreport.web.mapper.BoardFormMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 이사회 자료 양식 커스텀. 양식은 팀 단위로 공유하고(TEAM_KEY), 편집하면 새 버전 행을 더한다(불변).
 * default_doc 은 코드의 수정 불가 원본이라 DB 에 없고, 복제본만 편집한다.
 *
 * <p>⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다(Actor). 권한 문지기는 컨트롤러의 MenuGuard 가 맡고,
 * 여기서는 팀 범위만 가른다. 남의 팀 양식은 "없음(404)"과 같게 응답해 존재를 숨긴다.
 */
@Service
public class BoardFormService {

    static final String MENU_KEY = "tasks";
    static final String ACTIVE = "ACTIVE";
    static final String ARCHIVED = "ARCHIVED";
    /**
     * 저장 JSON 상한(UTF-8 바이트). 글자 수가 아니라 바이트로 센다 — 구조(fmt 2)·옛 cells 병기까지 담겨도
     * 정상 입력(칸 문구 100자 × 카탈로그 151칸, 이스케이프 포함)이 거부되지 않을 만큼 넉넉히 잡고, 그 너머만 막는다.
     * 칸 수·글자 수는 build 가 이미 제한한다(칸 문구 100자, 구조는 카탈로그 고정). PUT 본문은 필터가 512KB 로 먼저 막는다.
     */
    static final int MAX_JSON_BYTES = 240000;

    static final String NOT_FOUND = "양식을 찾을 수 없습니다.";
    static final String BAD_FMT = "지원하지 않는 양식 저장 형식입니다.";
    static final String PII_FOUND = "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 문구를 지우고 다시 저장해 주세요.";
    static final String CONFLICT = "다른 사람이 먼저 저장했습니다. 새로 고친 뒤 다시 편집해 주세요.";
    static final String DUP_NAME = "이미 같은 이름의 양식이 있습니다.";

    private final BoardFormMapper forms;
    private final SysUserMapper users;
    private final PermissionService permissions;

    public BoardFormService(BoardFormMapper forms, SysUserMapper users, PermissionService permissions) {
        this.forms = forms;
        this.users = users;
        this.permissions = permissions;
    }

    // ── 조회 ──

    @Transactional(readOnly = true)
    public Map<String, Object> list(String empNo, String status) {
        String team = teamOf(empNo);
        String st = normalizeStatus(status);
        List<Map<String, Object>> items = new ArrayList<>();
        for (BoardForm f : forms.selectByTeam(team, st)) {
            items.add(summary(f));
        }
        Map<String, Object> base = new LinkedHashMap<>();
        base.put("id", BoardDocSpec.DEFAULT_ID);
        base.put("name", BoardDocSpec.DEFAULT_NAME);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("team_key", team);
        out.put("can_edit", permissions.canEdit(empNo, MENU_KEY));
        out.put("can_write", permissions.canWrite(empNo, MENU_KEY));
        out.put("base", base);
        out.put("items", items);
        return out;
    }

    /** 고를 수 있는 표 목록. 팀과 무관하다. */
    public Map<String, Object> catalog() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (BoardDocSpec.Table t : BoardDocSpec.catalog(true)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ref", t.getId());
            m.put("mapping", t.getMapping());
            m.put("title", t.getTitle());
            m.put("columns", t.getColumns());
            m.put("row_count", t.getRows().size());
            m.put("notes", t.getNotes());
            m.put("unit", t.getUnit());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("catalog_ver", BoardDocSpec.CATALOG_VER);
        out.put("items", items);
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> detail(String empNo, String id, String version, boolean sample) {
        BoardForm f = load(empNo, id);
        BoardFormVer v = pickVersion(f, version);
        return view(f, v, sample, permissions.canEdit(empNo, MENU_KEY));
    }

    /** docx 용 Doc. 권한·팀 범위·버전 선택은 detail 과 같다. */
    @Transactional(readOnly = true)
    public BoardDocSpec.Doc docOf(String empNo, String id, String version, boolean sample) {
        BoardForm f = load(empNo, id);
        return docOf(f, pickVersion(f, version), sample);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> versions(String empNo, String id) {
        BoardForm f = load(empNo, id);
        List<Map<String, Object>> items = new ArrayList<>();
        for (BoardFormVer v : forms.selectVersions(f.getFormId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("version", v.getVerNo());
            m.put("name", v.getName());
            m.put("catalog_ver", v.getCatalogVer());
            m.put("created_by", v.getCreatedBy());
            m.put("created_at", v.getCreatedAt());
            m.put("is_current", v.getVerNo() == f.getCurrentVer());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("form_id", f.getFormId());
        out.put("current_version", f.getCurrentVer());
        out.put("items", items);
        return out;
    }

    /** 작성 대상. id 는 String(default_doc) 또는 Long(양식 번호). 매핑 칸은 빈 값(sample=false). */
    public static final class WriteTarget {
        private final Object id;
        private final Integer version;
        private final String name;
        private final BoardDocSpec.Doc doc;

        WriteTarget(Object id, Integer version, String name, BoardDocSpec.Doc doc) {
            this.id = id; this.version = version; this.name = name; this.doc = doc;
        }

        public Object getId() { return id; }
        public Integer getVersion() { return version; }
        public String getName() { return name; }
        public BoardDocSpec.Doc getDoc() { return doc; }
    }

    /** 남의 팀 404, 보관 양식 400, default_doc+version 400. 권한 문지기는 컨트롤러(requireWrite). */
    @Transactional(readOnly = true)
    public WriteTarget formForWrite(String empNo, String id, String version) {
        if (BoardDocSpec.DEFAULT_ID.equals(id)) {
            if (version != null && !version.isEmpty()) {
                throw ApiException.badRequest("기본 양식에는 version 을 쓸 수 없습니다.");
            }
            teamOf(empNo);
            BoardDocSpec.Doc d = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
            return new WriteTarget(BoardDocSpec.DEFAULT_ID, null, d.getName(), d);
        }
        BoardForm f = load(empNo, id);
        if (!ACTIVE.equals(f.getStatus())) {
            throw ApiException.badRequest("보관된 양식으로는 작성할 수 없습니다. 먼저 복원해 주세요.");
        }
        BoardFormVer v = pickVersion(f, version);
        return new WriteTarget(f.getFormId(), v.getVerNo(), v.getName(), docOf(f, v, false));
    }

    // ── 쓰기 (호출 전에 컨트롤러가 requireEdit 를 지난다) ──

    @Transactional
    public Map<String, Object> copy(String empNo, BoardFormIn.Copy in) {
        if (in == null) {
            throw ApiException.badRequest("요청 내용이 없습니다.");
        }
        String team = teamOf(empNo);
        String name = validName(in.getName());
        rejectPii(name);
        String baseDoc;
        BoardDocSpec.Doc source;
        if (in.getSourceFormId() != null) {
            BoardForm src = load(empNo, String.valueOf(in.getSourceFormId()));
            BoardFormVer sv = forms.selectVersion(src.getFormId(), src.getCurrentVer());
            if (sv == null) {
                throw ApiException.notFound(NOT_FOUND);
            }
            baseDoc = src.getBaseDoc();
            source = docOf(src, sv, false);
        } else if (in.getSource() == null || BoardDocSpec.DEFAULT_ID.equals(in.getSource())) {
            baseDoc = BoardDocSpec.DEFAULT_ID;
            source = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
        } else {
            throw ApiException.notFound(NOT_FOUND);
        }
        checkNameFree(team, name, null);
        String json = BoardFormJson.toJson(source);
        String stamp = Times.nowIso();
        BoardForm f = new BoardForm();
        f.setTeamKey(team);
        f.setName(name);
        f.setBaseDoc(baseDoc);
        f.setStatus(ACTIVE);
        f.setCurrentVer(1);
        f.setCreatedBy(empNo);
        f.setCreatedAt(stamp);
        f.setUpdatedBy(empNo);
        f.setUpdatedAt(stamp);
        forms.insertForm(f);
        BoardFormVer v = newVersion(f.getFormId(), 1, name, json, empNo, stamp);
        forms.insertVersion(v);
        return view(f, v, true, true);
    }

    @Transactional
    public Map<String, Object> save(String empNo, String id, BoardFormIn.Save in) {
        BoardForm f = load(empNo, id);
        if (!ACTIVE.equals(f.getStatus())) {
            throw ApiException.badRequest("보관된 양식은 수정할 수 없습니다. 먼저 복원해 주세요.");
        }
        if (in == null || in.getBaseVersion() == null) {
            throw ApiException.badRequest("기준 버전(base_version)이 필요합니다.");
        }
        if (!supportedFmt(in.getFmt())) {
            throw ApiException.badRequest(BAD_FMT);        // 모르는 형식 번호 — 입력값은 되돌려 싣지 않는다
        }
        if (in.getBaseVersion().intValue() != f.getCurrentVer()) {
            throw new ApiException(409, CONFLICT);
        }
        String name = in.getName() == null ? f.getName() : validName(in.getName());
        rejectPii(name);
        checkNameFree(f.getTeamKey(), name, f.getFormId());
        BoardDocSpec.Doc doc = buildDoc("form_" + f.getFormId(), name, toEdits(in.getTables()), false);
        rejectPii(doc);
        String json = BoardFormJson.toJson(doc);
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES) {
            throw ApiException.badRequest("양식 내용이 너무 큽니다.");
        }
        verifyRoundTrip(name, json);
        BoardFormVer cur = forms.selectVersion(f.getFormId(), f.getCurrentVer());
        // 옛 포맷(fmt 없음)으로 저장된 현재 버전도 같은 내용이면 '바뀐 것 없음' — 현재 버전을 새 포맷으로 정규화해서 비교한다.
        if (cur != null && name.equals(cur.getName()) && cur.getCatalogVer() == BoardDocSpec.CATALOG_VER
                && json.equals(normalizedJson(f, cur))) {
            Map<String, Object> same = view(f, cur, true, true);
            same.put("changed", false);
            return same;
        }
        int next = f.getCurrentVer() + 1;
        String stamp = Times.nowIso();
        if (forms.updateHeader(f.getFormId(), f.getCurrentVer(), next, name, empNo, stamp) == 0) {
            throw new ApiException(409, CONFLICT);
        }
        BoardFormVer v = newVersion(f.getFormId(), next, name, json, empNo, stamp);
        forms.insertVersion(v);
        f.setCurrentVer(next);
        f.setName(name);
        f.setUpdatedBy(empNo);
        f.setUpdatedAt(stamp);
        Map<String, Object> out = view(f, v, true, true);
        out.put("changed", true);
        return out;
    }

    @Transactional
    public Map<String, Object> setArchived(String empNo, String id, boolean archived) {
        BoardForm f = load(empNo, id);
        String target = archived ? ARCHIVED : ACTIVE;
        if (!target.equals(f.getStatus())) {
            if (!archived && forms.countActiveByName(f.getTeamKey(), f.getName(), f.getFormId()) > 0) {
                throw ApiException.badRequest(
                        "같은 이름의 양식이 이미 있어 복원할 수 없습니다. 활성 양식의 이름을 바꾸거나 보관한 뒤 다시 시도해 주세요.");
            }
            forms.updateStatus(f.getFormId(), target, empNo, Times.nowIso());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("form_id", f.getFormId());
        out.put("status", target);
        return out;
    }

    // ── 내부 ──

    /** 공유 범위 키 = 소속 팀. 디자이너는 영업팀 소속으로 본다({@link ApproverRules#team}). */
    private String teamOf(String empNo) {
        SysUser u = users.selectByEmpNo(empNo);
        if (u == null) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
        return ApproverRules.team(u);
    }

    private BoardForm load(String empNo, String id) {
        Long formId = parseId(id);
        BoardForm f = formId == null ? null : forms.selectForm(formId);
        if (f == null || !teamOf(empNo).equals(f.getTeamKey())) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return f;
    }

    private BoardFormVer pickVersion(BoardForm f, String version) {
        int no = f.getCurrentVer();
        if (version != null && !version.isEmpty()) {
            Long parsed = parseId(version);
            if (parsed == null || parsed.longValue() < 1 || version.length() > 6) {
                throw ApiException.badRequest("version 은 1 이상의 정수여야 합니다.");
            }
            no = parsed.intValue();
        }
        BoardFormVer v = forms.selectVersion(f.getFormId(), no);
        if (v == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return v;
    }

    private static BoardFormVer newVersion(Long formId, int verNo, String name, String json, String empNo, String stamp) {
        BoardFormVer v = new BoardFormVer();
        v.setFormId(formId);
        v.setVerNo(verNo);
        v.setName(name);
        v.setCatalogVer(BoardDocSpec.CATALOG_VER);
        v.setSpecJson(json);
        v.setCreatedBy(empNo);
        v.setCreatedAt(stamp);
        return v;
    }

    private BoardDocSpec.Doc docOf(BoardForm f, BoardFormVer v, boolean sample) {
        try {
            return BoardDocSpec.build("form_" + f.getFormId(), v.getName(), BoardFormJson.parse(v.getSpecJson()), sample);
        } catch (BoardDocSpec.EditException e) {
            throw new IllegalStateException("stored board form is not valid");
        }
    }

    /** 현재 버전을 읽어 새 포맷 JSON 으로 다시 쓴 것. 읽을 수 없으면 null(= 같지 않음 → 저장하면 새 버전이 읽을 수 있는 상태로 만든다). */
    private String normalizedJson(BoardForm f, BoardFormVer cur) {
        try {
            return BoardFormJson.toJson(docOf(f, cur, false));
        } catch (IllegalStateException e) {
            return null;
        }
    }

    /**
     * 저장 직전 한 번 왕복: 방금 만든 JSON 을 parse → build → toJson 했을 때 똑같아야 한다.
     * 아니면 읽을 수 없는/다르게 읽히는 버전이 저장될 뻔한 것이므로 서버 결함(500)으로 막는다.
     */
    private static void verifyRoundTrip(String name, String json) {
        try {
            BoardDocSpec.Doc again = BoardDocSpec.build("rt", name, BoardFormJson.parse(json), false);
            if (json.equals(BoardFormJson.toJson(again))) {
                return;
            }
        } catch (RuntimeException e) {
            // 아래에서 고정 문구로 던진다
        }
        throw new IllegalStateException("board form round trip failed");
    }

    /** 요청 fmt: 생략(null) 또는 정수 1·2 만 허용. */
    static boolean supportedFmt(Object fmt) {
        if (fmt == null) {
            return true;
        }
        return fmt instanceof Integer && (((Integer) fmt).intValue() == 1 || ((Integer) fmt).intValue() == BoardDocSpec.FORM_FMT);
    }

    private static void rejectPii(String text) {
        if (text != null && !Pii.scan(text).isEmpty()) {
            throw new ApiException(422, PII_FOUND);
        }
    }

    /** 제목·사용자가 쓴 칸 문구(엑셀 연결 칸 제외)에 개인정보가 있으면 422 고정 문구. 검출값은 싣지 않는다. */
    private static void rejectPii(BoardDocSpec.Doc doc) {
        for (BoardDocSpec.Table t : doc.getTables()) {
            rejectPii(t.getTitle());
            for (List<BoardDocSpec.Cell> row : t.getRows()) {
                for (BoardDocSpec.Cell c : row) {
                    if (!c.isMapped()) {
                        rejectPii(c.getText());
                    }
                }
            }
        }
    }

    private static BoardDocSpec.Doc buildDoc(String id, String name, List<BoardDocSpec.TableEdit> edits, boolean sample) {
        try {
            return BoardDocSpec.build(id, name, edits, sample);
        } catch (BoardDocSpec.EditException e) {
            throw ApiException.badRequest(e.getMessage());
        }
    }

    private static String validName(String raw) {
        try {
            return BoardDocSpec.validName(raw);
        } catch (BoardDocSpec.EditException e) {
            throw ApiException.badRequest(e.getMessage());
        }
    }

    private static List<BoardDocSpec.TableEdit> toEdits(List<BoardFormIn.TableIn> tables) {
        if (tables == null) {
            return null;
        }
        List<BoardDocSpec.TableEdit> out = new ArrayList<>();
        for (BoardFormIn.TableIn t : tables) {
            out.add(t == null ? null : new BoardDocSpec.TableEdit(t.getRef(), t.getTitle(), t.getNotes(), t.getCells()));
        }
        return out;
    }

    private void checkNameFree(String team, String name, Long excludeId) {
        if (forms.countActiveByName(team, name, excludeId) > 0) {
            throw ApiException.badRequest(DUP_NAME);
        }
    }

    private static String normalizeStatus(String status) {
        if (status == null || status.trim().isEmpty() || "active".equalsIgnoreCase(status.trim())) {
            return ACTIVE;
        }
        if ("archived".equalsIgnoreCase(status.trim())) {
            return ARCHIVED;
        }
        if ("all".equalsIgnoreCase(status.trim())) {
            return null;
        }
        throw ApiException.badRequest("status 는 active, archived, all 중 하나여야 합니다.");
    }

    private static Long parseId(String s) {
        if (s == null || s.isEmpty() || s.length() > 15) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) < '0' || s.charAt(i) > '9') {
                return null;
            }
        }
        return Long.valueOf(s);
    }

    private static Map<String, Object> summary(BoardForm f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("form_id", f.getFormId());
        m.put("name", f.getName());
        m.put("base_doc", f.getBaseDoc());
        m.put("status", f.getStatus());
        m.put("current_version", f.getCurrentVer());
        m.put("created_by", f.getCreatedBy());
        m.put("created_at", f.getCreatedAt());
        m.put("updated_by", f.getUpdatedBy());
        m.put("updated_at", f.getUpdatedAt());
        return m;
    }

    private Map<String, Object> view(BoardForm f, BoardFormVer v, boolean sample, boolean canEdit) {
        BoardDocSpec.Doc doc = docOf(f, v, sample);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("form_id", f.getFormId());
        m.put("name", v.getName());
        m.put("base_doc", f.getBaseDoc());
        m.put("team_key", f.getTeamKey());
        m.put("status", f.getStatus());
        m.put("version", v.getVerNo());
        m.put("current_version", f.getCurrentVer());
        m.put("catalog_ver", v.getCatalogVer());
        m.put("catalog_outdated", v.getCatalogVer() != BoardDocSpec.CATALOG_VER);
        m.put("editable", canEdit && ACTIVE.equals(f.getStatus()) && v.getVerNo() == f.getCurrentVer());
        m.put("updated_by", v.getCreatedBy());
        m.put("updated_at", v.getCreatedAt());
        List<Map<String, Object>> tables = new ArrayList<>();
        for (BoardDocSpec.Table t : doc.getTables()) {
            Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("id", t.getId());
            tm.put("ref", t.getId());
            tm.put("mapping", t.getMapping());
            tm.put("title", t.getTitle());
            tm.put("columns", t.getColumns());
            tm.put("row_ids", new ArrayList<>(t.getRowIds()));
            tm.put("col_ids", new ArrayList<>(t.getColIds()));
            List<List<Map<String, Object>>> rows = new ArrayList<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<BoardDocSpec.Cell> src = t.getRows().get(r);
                List<Map<String, Object>> row = new ArrayList<>();
                for (int i = 0; i < src.size(); i++) {
                    BoardDocSpec.Cell c = src.get(i);
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("key", c.getKey());
                    cm.put("row_id", c.getRowId());
                    cm.put("col_id", c.getColId());
                    cm.put("text", c.getText());
                    cm.put("colspan", c.getColspan());
                    cm.put("rowspan", c.getRowspan());
                    cm.put("header", c.isHeader());
                    cm.put("mapped", c.isMapped());
                    cm.put("input", c.isInput());
                    cm.put("align", c.getAlign());
                    cm.put("editable", !c.isMapped());      // PR-1: 구조 편집 전이라 기존과 같다(연결 칸만 잠김)
                    row.add(cm);
                }
                rows.add(row);
            }
            tm.put("rows", rows);
            tm.put("notes", t.getNotes());
            tm.put("unit", t.getUnit());
            tables.add(tm);
        }
        m.put("tables", tables);
        return m;
    }
}
