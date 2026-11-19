package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesAct;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.BoardMinutesMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 이사회 회의록(047) 모든 행위의 감사 기록 — 누가·어느 화면·어느 버튼·언제·어느 회의록·어떤 경로(VIA)로. 확정 건에 한정하지 않고 모든 회의록이다.
 * 읽기·거부(403)·은닉(404)·충돌(409)·입력 오류(400)도 남긴다. {@link BoardMaterialAudit} 와 같은 방식이다.
 *
 * <p>컨트롤러에는 트랜잭션이 없으므로 이 기록은 서비스 실패와 무관하게 따로 커밋된다. 성공한 읽기는 응답 <b>전에</b> 기록한다 —
 * 기록이 실패하면 500 이고 데이터는 나가지 않는다(fail-closed). 쓰기는 이미 커밋된 뒤라 기록 실패가 쓰기를 되돌리지 못한다
 * (업로드·수정·공개범위·삭제의 LOG 는 같은 트랜잭션이다).
 * ⚠️ 사번·화면·버튼은 자기신고다. 본문·제목·가림 단어·파일명은 기록하지 않는다.
 */
@Service
public class BoardMinutesAudit {

    private final BoardMinutesMapper mapper;
    private final BoardMaterialMapper materials;

    public BoardMinutesAudit(BoardMinutesMapper mapper, BoardMaterialMapper materials) {
        this.mapper = mapper;
        this.materials = materials;
    }

    /** 행위 대상 — minutesId 는 업로드 성공 뒤 채운다(그 전엔 null). */
    public static final class Ctx {
        private Long minutesId;
        private final Long materialId;
        private final BoardMinutes head;

        Ctx(Long minutesId, Long materialId, BoardMinutes head) {
            this.minutesId = minutesId;
            this.materialId = materialId;
            this.head = head;
        }

        public Long getMinutesId() { return minutesId; }
        public void setMinutesId(Long v) { this.minutesId = v; }
        public Long getMaterialId() { return materialId; }
        /** 요청 시작 때 읽은 머리(삭제된 건 포함). 자료 기준 Ctx 는 null. */
        public BoardMinutes getHead() { return head; }
    }

    /** 회의록 번호로 — 없거나 형식이 틀리면 null(기록 생략). 삭제된 건도 잡는다. */
    @Transactional(readOnly = true)
    public Ctx forMinutes(String id) {
        Long n = BoardMinutesService.parseId(id);
        BoardMinutes h = n == null ? null : mapper.selectHead(n);
        return h == null ? null : new Ctx(h.getMinutesId(), h.getMaterialId(), h);
    }

    /** 이사회 자료 번호로(업로드·목록용) — 없으면 null. 020 매퍼는 읽기만 한다. */
    @Transactional(readOnly = true)
    public Ctx forMaterial(String mid) {
        Long n = BoardMinutesService.parseId(mid);
        BoardMaterial m = n == null ? null : materials.selectOne(n);
        return m == null ? null : new Ctx(null, m.getMaterialId(), null);
    }

    /** ctx 가 null 이면 아무것도 하지 않는다. outcome: OK/DENIED/HIDDEN/BLOCKED/INVALID/ERROR. */
    @Transactional
    public void record(Ctx ctx, String action, String outcome, BoardMinutesAccess.Via via, Actor actor, BoardUiIds.Ui ui) {
        if (ctx == null) {
            return;
        }
        insert(ctx.minutesId, ctx.materialId, action, outcome, via, actor, ui);
    }

    /**
     * 목록 조회 감사 — 응답에 담긴 행마다 한 줄. 한 트랜잭션. 응답 전에 부른다(실패하면 500, 데이터 안 나감).
     * 행의 {@code minutes_id}·{@code material_id}·{@code _via}(내부 키 — 호출자가 응답 전에 뺀다)를 읽는다.
     */
    @Transactional
    public void recordRows(List<Map<String, Object>> rows, String action, Actor actor, BoardUiIds.Ui ui) {
        if (rows == null) {
            return;
        }
        for (Map<String, Object> r : rows) {
            Object id = r.get("minutes_id");
            Object mid = r.get("material_id");
            Object via = r.get("_via");
            insert(id instanceof Number ? Long.valueOf(((Number) id).longValue()) : null,
                    mid instanceof Number ? Long.valueOf(((Number) mid).longValue()) : null,
                    action, "OK", via instanceof BoardMinutesAccess.Via ? (BoardMinutesAccess.Via) via : BoardMinutesAccess.Via.NONE,
                    actor, ui);
        }
    }

    public static String outcomeOf(int status) {
        if (status == 403 || status == 401) {
            return "DENIED";
        }
        if (status == 404) {
            return "HIDDEN";
        }
        if (status == 409) {
            return "BLOCKED";
        }
        return status == 400 || status == 413 || status == 422 ? "INVALID" : "ERROR";
    }

    private void insert(Long minutesId, Long materialId, String action, String outcome, BoardMinutesAccess.Via via,
                        Actor actor, BoardUiIds.Ui ui) {
        BoardMinutesAct a = new BoardMinutesAct();
        a.setMinutesId(minutesId);
        a.setMaterialId(materialId);
        a.setActionCd(action);
        a.setOutcome(outcome);
        a.setViaCd(via == null ? BoardMinutesAccess.Via.NONE.name() : via.name());
        a.setActorEmpNo(actor != null && actor.isKnown() ? actor.getEmpNo() : null);
        a.setEmpVerified(actor != null && actor.isVerified() ? 1 : 0);
        a.setScreenId(ui.getScreen());
        a.setButtonId(ui.getButton());
        a.setUiValid(ui.isValid() ? 1 : 0);
        a.setLoggedAt(Times.nowIso());
        mapper.insertAct(a);
    }
}
