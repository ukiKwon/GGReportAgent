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
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    static final int MAX_JSON = 60000;

    static final String NOT_FOUND = "양식을 찾을 수 없습니다.";
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

    // ── 쓰기 (호출 전에 컨트롤러가 requireEdit 를 지난다) ──

    @Transactional
    public Map<String, Object> copy(String empNo, BoardFormIn.Copy in) {
        if (in == null) {
            throw ApiException.badRequest("요청 내용이 없습니다.");
        }
        String team = teamOf(empNo);
        String name = validName(in.getName());
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
        if (in.getBaseVersion().intValue() != f.getCurrentVer()) {
            throw new ApiException(409, CONFLICT);
        }
        String name = in.getName() == null ? f.getName() : validName(in.getName());
        checkNameFree(f.getTeamKey(), name, f.getFormId());
        BoardDocSpec.Doc doc = buildDoc("form_" + f.getFormId(), name, toEdits(in.getTables()), false);
        String json = BoardFormJson.toJson(doc);
        if (json.length() > MAX_JSON) {
            throw ApiException.badRequest("양식 내용이 너무 큽니다.");
        }
        BoardFormVer cur = forms.selectVersion(f.getFormId(), f.getCurrentVer());
        if (cur != null && json.equals(cur.getSpecJson()) && name.equals(cur.getName())
                && cur.getCatalogVer() == BoardDocSpec.CATALOG_VER) {
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
            List<List<Map<String, Object>>> rows = new ArrayList<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<BoardDocSpec.Cell> src = t.getRows().get(r);
                List<Map<String, Object>> row = new ArrayList<>();
                for (int i = 0; i < src.size(); i++) {
                    BoardDocSpec.Cell c = src.get(i);
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("key", BoardDocSpec.cellKey(r, i));
                    cm.put("text", c.getText());
                    cm.put("colspan", c.getColspan());
                    cm.put("rowspan", c.getRowspan());
                    cm.put("header", c.isHeader());
                    cm.put("mapped", c.isMapped());
                    cm.put("align", c.getAlign());
                    cm.put("editable", !c.isMapped());
                    row.add(cm);
                }
                rows.add(row);
            }
            tm.put("rows", rows);
            tm.put("notes", t.getNotes());
            tables.add(tm);
        }
        m.put("tables", tables);
        return m;
    }
}
