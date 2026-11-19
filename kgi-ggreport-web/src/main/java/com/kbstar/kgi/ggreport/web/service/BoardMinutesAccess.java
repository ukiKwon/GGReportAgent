package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.MinutesSettings;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.BoardMinutesMapper;
import com.kbstar.kgi.ggreport.web.support.ApproverRules;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 이사회 회의록(047) 접근 판정 — 사용자 확정(2026-11-19): 기본 열람은 영업팀장·영업부장, 공개범위는 사람 단위이고 <b>부장급만 바꾼다</b>,
 * 이사회 자료(020) 권한은 상속하지 않는다(020 을 볼 수 있어도 회의록은 없으면 404). 020 판정({@link BoardAccess})은 호출만 한다.
 *
 * <p>판정 순서(처음 맞는 것): 삭제됨 → 부장급(HEAD) → 영업팀장·영업부장(DEFAULT) → 등록자(UPLOADER, 올린 뒤 N일·지금도 그 건 담당일 때만)
 * → 개인 공개(GRANTEE) → 관리자(ADMIN, 감사 열람만) → 없음(NONE).
 * 이력은 부장급·등록자만 본다(비부장 영업팀장은 볼 수는 있으므로 403). 볼 수 없으면 404 로 존재를 숨긴다.
 * ⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다(Actor) — 업무 규칙(실수 방지)이지 사칭 방지가 아니다.
 */
@Component
public class BoardMinutesAccess {

    /** 이 사람이 회의록에 닿은 경로(감사 VIA_CD). */
    public enum Via { HEAD, DEFAULT, UPLOADER, GRANTEE, WRITER, ADMIN, NONE }

    /** 한 회의록에 대한 한 사람의 권한(불변). */
    public static final class Decision {
        public final Via via;
        public final boolean view;
        public final boolean edit;
        public final boolean todo;
        public final boolean history;
        public final boolean scopeView;
        public final boolean scopeEdit;
        public final boolean delete;
        public final boolean acts;
        /** 이사회 자료(020) 값을 화면이 그려도 되는가 — 020 규칙으로만 정한다(회의록 권한과 별개). */
        public final boolean viewMaterial;

        Decision(Via via, boolean view, boolean edit, boolean todo, boolean history, boolean scopeView,
                 boolean scopeEdit, boolean delete, boolean acts, boolean viewMaterial) {
            this.via = via;
            this.view = view;
            this.edit = edit;
            this.todo = todo;
            this.history = history;
            this.scopeView = scopeView;
            this.scopeEdit = scopeEdit;
            this.delete = delete;
            this.acts = acts;
            this.viewMaterial = viewMaterial;
        }
    }

    private final BoardAccess board;
    private final BoardMinutesMapper mapper;
    private final PermissionService perms;
    private final MinutesSettings settings;

    public BoardMinutesAccess(BoardAccess board, BoardMinutesMapper mapper, PermissionService perms, MinutesSettings settings) {
        this.board = board;
        this.mapper = mapper;
        this.perms = perms;
        this.settings = settings;
    }

    /** 기본 열람자 = 활성 영업팀장·영업부장. */
    public boolean isDefaultViewer(SysUser u) {
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            return false;
        }
        String role = BoardAccess.role(u);
        return BidAssignmentService.LEAD_ROLE.equals(role) || BidAssignmentService.HEAD_ROLE.equals(role);
    }

    /** 부장급 = 기본 열람자 ∧ 결재 등급·역할 단계 2 이상(영업부장 역할 또는 부장·대표 등급). */
    public boolean isHeadGrade(SysUser u) {
        return isDefaultViewer(u) && ApproverRules.levelByGradeRole(u) >= 2;
    }

    /** 업로드 자격 = 그 입찰 건의 현재 담당자(020 쓰기 자격과 같다). */
    public boolean canUpload(SysUser me, String bidCaseId) {
        return me != null && board.canWriteCase(me.getEmpNo(), bidCaseId);
    }

    /** 등록자 예외의 시작 시각(문자열 비교용 UTC 고정 폭). */
    public String uploaderSince() {
        return Times.iso(Instant.now().minus(settings.getUploaderDays(), ChronoUnit.DAYS));
    }

    @Transactional(readOnly = true)
    public Decision decide(SysUser me, BoardMinutes head) {
        if (me == null || head == null) {
            return none();
        }
        if (head.isDeleted()) {
            if (isHeadGrade(me)) {
                return new Decision(Via.HEAD, false, false, false, false, false, false, false, true, false);
            }
            if (perms.canAdmin(me.getEmpNo())) {
                return new Decision(Via.ADMIN, false, false, false, false, false, false, false, true, false);
            }
            return none();
        }
        boolean viewMaterial = board.canViewCase(me.getEmpNo(), head.getBidCaseId());
        if (isHeadGrade(me)) {
            return new Decision(Via.HEAD, true, true, true, true, true, true, true, true, viewMaterial);
        }
        if (isDefaultViewer(me)) {
            return new Decision(Via.DEFAULT, true, true, true, false, true, false, false, false, viewMaterial);
        }
        if (settings.getUploaderDays() > 0 && me.getEmpNo().equals(head.getCreatedBy())
                && head.getCreatedAt() != null && head.getCreatedAt().compareTo(uploaderSince()) >= 0
                && board.canWriteCase(me.getEmpNo(), head.getBidCaseId())) {
            return new Decision(Via.UPLOADER, true, true, true, true, false, false, false, false, viewMaterial);
        }
        if (mapper.countGrant(head.getMinutesId(), me.getEmpNo(), Times.todayKst()) > 0) {
            return new Decision(Via.GRANTEE, true, false, false, false, false, false, false, false, viewMaterial);
        }
        if (perms.canAdmin(me.getEmpNo())) {
            return new Decision(Via.ADMIN, false, false, false, false, false, false, false, true, false);
        }
        return none();
    }

    public static Decision none() {
        return new Decision(Via.NONE, false, false, false, false, false, false, false, false, false);
    }
}
