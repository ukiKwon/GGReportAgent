package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.InstBasic;
import com.kbstar.kgi.ggreport.web.domain.PlanImportRef;
import com.kbstar.kgi.ggreport.web.domain.PlanSeedItem;
import com.kbstar.kgi.ggreport.web.domain.PrepForm;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVer;
import com.kbstar.kgi.ggreport.web.domain.PrepFormVerRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * BID_PREP_FORM · BID_PREP_FORM_VER (049) + 양식 전용 감사·이력 INSERT(BID_PREP_LOG·BID_PREP_ACT 의 FORM_VER 열).
 * 판(VER)은 INSERT 만 있다 — UPDATE·DELETE 문장은 일부러 없다. 헤더는 조건부 UPDATE 다(0행이면 그 사이 다른 처리가 먼저 끝난 것).
 * 모든 SELECT 는 flushCache — 같은 트랜잭션에서 BID_PREP 행 잠금 뒤 다시 읽어도 낡은 값을 주지 않게.
 * 양쪽 방언 같은 문장(ANSI)이고 행 수 제한 구문을 쓰지 않는다(Oracle 11g 호환). 전부 읽기만 하는 조회(selectInstBasic 이하)는 미리 채움 전용이다.
 */
@Mapper
public interface PrepFormMapper {

    // ── 헤더 ────────────────────────────────────────────────────────────

    PrepForm selectForm(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd);

    /** 헤더 잠금 — 호출자는 반드시 BID_PREP 행 잠금(PrepMapper.selectStateForUpdate)을 먼저 잡는다(잠금 순서 BID_PREP → BID_PREP_FORM). 조인 없음. */
    PrepForm selectFormForUpdate(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd);

    int insertForm(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd, @Param("taskCd") String taskCd,
                   @Param("by") String by, @Param("now") String now);

    /** 현재 판 번호를 올린다 — 확정되지 않았고 CUR_VER 가 base 일 때만. 0행이면 409 VER_CHANGED. */
    int bumpCurVer(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd, @Param("base") int base,
                   @Param("next") int next, @Param("by") String by, @Param("now") String now);

    /** 확정 — CUR_VER 가 ver 이고 아직 확정되지 않았을 때만. */
    int markConfirmed(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd, @Param("ver") int ver,
                      @Param("sha") String sha, @Param("by") String by, @Param("verified") int verified, @Param("now") String now);

    /** 확정 취소 — CONFIRMED_VER 가 ver 일 때만. */
    int clearConfirmed(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd, @Param("ver") int ver,
                       @Param("by") String by, @Param("now") String now);

    // ── 판 ──────────────────────────────────────────────────────────────

    /** 한 판(내용 포함). 없으면 null. */
    PrepFormVer selectVer(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd, @Param("verNo") int verNo);

    /** 판 목록(내용 제외) — 최신 판 먼저. */
    List<PrepFormVerRow> selectVers(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd);

    int countVers(@Param("bidCaseId") String bidCaseId, @Param("formCd") String formCd);

    /** 판 추가 — contentJson 은 CLOB 으로 넣는다. savedByName 은 쓰지 않는다. */
    int insertVer(PrepFormVer v);

    // ── 이력·감사(BID_PREP_LOG·BID_PREP_ACT 의 FORM_VER 열 포함 INSERT — PrepMapper 는 고치지 않는다) ──

    int insertFormLog(@Param("bidCaseId") String bidCaseId, @Param("eventCd") String eventCd, @Param("fromState") String fromState,
                      @Param("toState") String toState, @Param("taskCd") String taskCd, @Param("reason") String reason,
                      @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified, @Param("now") String now,
                      @Param("formVer") Integer formVer);

    int insertFormAct(@Param("bidCaseId") String bidCaseId, @Param("actionCd") String actionCd, @Param("outcome") String outcome,
                      @Param("stateCd") String stateCd, @Param("taskCd") String taskCd, @Param("actorEmpNo") String actorEmpNo,
                      @Param("verified") int verified, @Param("screenId") String screenId, @Param("buttonId") String buttonId,
                      @Param("uiValid") int uiValid, @Param("now") String now, @Param("formVer") Integer formVer);

    // ── 권한 판정용(잠금 뒤 재확인에도 쓴다 — flushCache) ────────────────

    /** 그 사번이 그 건의 현재(ACTIVE_YN=1) 담당자면 1. */
    int countActiveAssignee(@Param("bidCaseId") String bidCaseId, @Param("empNo") String empNo);

    /** 그 건의 디자이너 팀 작업(TASKS) 담당(ASSIGNEE). 작업이 없으면 null. 미배정이면 빈 값. */
    String selectDesignerAssignee(@Param("bidCaseId") String bidCaseId, @Param("team") String team);

    // ── 미리 채움(읽기 전용) ─────────────────────────────────────────────

    InstBasic selectInstBasic(@Param("institutionId") String institutionId);

    /** 기관의 최신 사업계획 반입 판. 반입이 없으면 null. */
    PlanImportRef selectLatestPlanImport(@Param("institutionId") String institutionId);

    /** 그 판의 상위(PARENT_NO 없음) 사업을 문서·행 순서로 전부. 40개 제한은 호출자가 자른다(행 수 제한 구문 없음). */
    List<PlanSeedItem> selectPlanItems(@Param("importId") Long importId);
}
