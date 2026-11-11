package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.InstHead;
import com.kbstar.kgi.ggreport.web.domain.InstHeadItem;
import com.kbstar.kgi.ggreport.web.domain.InstHeadPhoto;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * INST_HEAD · INST_HEAD_ITEM · INST_HEAD_PHOTO · INST_HEAD_LOG · INST_HEAD_ACT (026).
 * <b>모든 대상 id 는 기관과 묶어서 조회한다</b>({@code WHERE INSTITUTION_ID = ? AND X_ID = ?}) — 다른 기관의 id 를 찍어도 안 보인다(IDOR 방지).
 * 상태 전이는 전부 조건부 UPDATE 다 — 0행이면 그 사이 다른 처리가 먼저 끝난 것이다(서비스가 409 STATE_CHANGED).
 * 칸은 이름으로 나열한다(SELECT * 금지). 모든 SELECT 는 로컬 캐시를 비운다(flushCache) — 같은 트랜잭션 안의 재조회가 낡은 값을 주지 않게.
 * 집계 조회(Map)의 열 이름은 대문자 별칭이다.
 */
@Mapper
public interface InstitutionHeadMapper {

    // ── 잠금·존재 ───────────────────────────────────────────────────────

    /** 기관 행 잠금(기관 단위 직렬화). 없으면 null. */
    String lockInstitution(@Param("institutionId") String institutionId);

    /** 기관이 있으면 그 id, 없으면 null(잠금 없음). */
    String institutionExists(@Param("institutionId") String institutionId);

    /** COMMON_CODE 에서 ENABLED=1 인 코드면 1(허용 목록 검사 — 라이선스·출처 종류). */
    int countEnabledCode(@Param("group") String group, @Param("code") String code);

    // ── 머리 ────────────────────────────────────────────────────────────

    InstHead selectCurrentHead(@Param("institutionId") String institutionId);

    InstHead selectCurrentHeadForUpdate(@Param("institutionId") String institutionId);

    /** 기관과 묶은 머리(잠금). 없으면 null. */
    InstHead selectHeadForUpdate(@Param("headId") Long headId, @Param("institutionId") String institutionId);

    /** 기관과 묶은 머리(읽기). */
    InstHead selectHead(@Param("headId") Long headId, @Param("institutionId") String institutionId);

    /** 매칭 대기 후보 머리(INSTITUTION_ID 없음 ∧ CANDIDATE) — 읽기. 이미 매칭됐거나 상태가 다르면 null. */
    InstHead selectUnmatchedHead(@Param("headId") Long headId);

    /** 머리 번호만으로 잠금(매칭 지정·기각 — 이미 매칭된 머리는 서비스가 409 로 가른다). */
    InstHead selectHeadByIdForUpdate(@Param("headId") Long headId);

    List<InstHead> selectCandidateHeads(@Param("institutionId") String institutionId);

    int countCandidateHeads(@Param("institutionId") String institutionId);

    List<InstHead> selectUnmatchedHeads();

    int countUnmatchedHeads();

    int insertHead(InstHead h);

    /** 상태 전이(from → to) + 확정·기각자. 0행이면 그 사이 바뀐 것. */
    int updateHeadStatus(@Param("headId") Long headId, @Param("from") String from, @Param("to") String to,
                         @Param("by") String by, @Param("at") String at);

    /** CURRENT → FORMER(교체 확정자·시각 기록). */
    int endHead(@Param("headId") Long headId, @Param("by") String by, @Param("at") String at);

    /** 매칭 대기(INSTITUTION_ID 없음 ∧ CANDIDATE) → 기관 지정. to 는 CANDIDATE 또는 MERGED, mergedInto 는 MERGED 일 때만. */
    int assignHead(@Param("headId") Long headId, @Param("institutionId") String institutionId, @Param("to") String to,
                   @Param("mergedInto") Long mergedInto, @Param("by") String by, @Param("at") String at);

    // ── 칸 ──────────────────────────────────────────────────────────────

    /** 기관과 묶은 칸(잠금). 없으면 null. */
    InstHeadItem selectItemForUpdate(@Param("itemId") Long itemId, @Param("institutionId") String institutionId);

    /** 머리의 칸 중 그 칸 종류·상태인 것(번호순). */
    List<InstHeadItem> selectItemsOfHeadField(@Param("headId") Long headId, @Param("fieldCd") String fieldCd,
                                              @Param("stateCd") String stateCd);

    /** 머리의 칸 중 그 상태인 것 전부(번호순). */
    List<InstHeadItem> selectItemsOfHead(@Param("headId") Long headId, @Param("stateCd") String stateCd);

    /** 기관의 CONFIRMED·CANDIDATE 칸 전부(번호순) — 상세 화면용. 이전 기관장 칸도 섞여 있으므로 호출자가 머리로 거른다. */
    List<InstHeadItem> selectLiveItemsOfInstitution(@Param("institutionId") String institutionId);

    /** 그 칸 종류의 CONFIRMED·CANDIDATE 수(EDU·CAREER 상한). */
    int countLiveItems(@Param("headId") Long headId, @Param("fieldCd") String fieldCd);

    /** 머리의 열린(CANDIDATE) 칸 수(머리당 50 상한). */
    int countOpenItems(@Param("headId") Long headId);

    int insertItem(InstHeadItem i);

    int confirmItem(@Param("itemId") Long itemId, @Param("by") String by, @Param("at") String at);

    int supersedeItem(@Param("itemId") Long itemId, @Param("by") String by, @Param("at") String at,
                      @Param("supersededBy") Long supersededBy);

    int rejectItem(@Param("itemId") Long itemId, @Param("by") String by, @Param("at") String at);

    int voidItem(@Param("itemId") Long itemId, @Param("by") String by, @Param("at") String at);

    /** 머리의 후보 칸을 전부 확정(머리 확정 때). 건수를 돌려준다. */
    int confirmItemsOfHead(@Param("headId") Long headId, @Param("by") String by, @Param("at") String at);

    /** 머리의 후보 칸을 전부 기각(머리 기각 때). */
    int rejectItemsOfHead(@Param("headId") Long headId, @Param("by") String by, @Param("at") String at);

    /** 매칭 지정 — 머리의 칸에 기관을 채운다. */
    int setItemsInstitution(@Param("headId") Long headId, @Param("institutionId") String institutionId);

    /** 합치기 — 후보 칸을 현 기관장 머리로 옮긴다(CANDIDATE 만). 건수를 돌려준다. */
    int moveCandidateItems(@Param("fromHeadId") Long fromHeadId, @Param("toHeadId") Long toHeadId,
                           @Param("institutionId") String institutionId);

    // ── 사진 ────────────────────────────────────────────────────────────

    /** 기관과 묶은 사진(읽기). */
    InstHeadPhoto selectPhoto(@Param("photoId") Long photoId, @Param("institutionId") String institutionId);

    InstHeadPhoto selectPhotoForUpdate(@Param("photoId") Long photoId, @Param("institutionId") String institutionId);

    InstHeadPhoto selectActivePhoto(@Param("headId") Long headId);

    InstHeadPhoto selectActivePhotoForUpdate(@Param("headId") Long headId);

    /** 머리의 교체된(REPLACED) 사진 — 최근 것 먼저. */
    List<InstHeadPhoto> selectReplacedPhotos(@Param("headId") Long headId);

    int insertPhoto(InstHeadPhoto p);

    /** 사진 상태 전이(from → to). by·at 은 REPLACED·VOIDED 때 처리자, ACTIVE 로 되돌릴 때는 null. */
    int updatePhotoState(@Param("photoId") Long photoId, @Param("from") String from, @Param("to") String to,
                         @Param("by") String by, @Param("at") String at);

    // ── 목록·집계 ───────────────────────────────────────────────────────

    /** 현 기관장(CURRENT) 머리 전부. */
    List<InstHead> selectCurrentHeads();

    /** CURRENT 머리의 CONFIRMED 단일 칸(이름·직위·권한대행·날짜 3종) 전부 — 목록·대기열 집계용. */
    List<InstHeadItem> selectCurrentConfirmedSingleItems();

    /** 열린(CANDIDATE) 칸 전부(기관이 있는 것) — headStatus 를 채운다. 대기열 집계용. */
    List<InstHeadItem> selectOpenCandidateItems();

    /** 기관별 열린 칸 수 — 열 INSTITUTION_ID·N. */
    List<Map<String, Object>> selectOpenCandidateCounts();

    /** CURRENT 머리 중 ACTIVE 사진이 있는 머리 번호. */
    List<Long> selectHeadIdsWithActivePhoto();

    /** 매칭 대기 머리별 이름·직위(후보 칸)·열린 칸 수 — 열 HEAD_ID·NAME_VAL·POSITION_VAL·N. */
    List<Map<String, Object>> selectUnmatchedSummaries();

    /** 최근 사진 변경 이력(올림·교체·무효·복원) — 열 LOG_ID·EVENT_CD·INSTITUTION_ID·HEAD_ID·PHOTO_ID·FROM_PHOTO_ID·ACTOR_EMP_NO·ACTOR_ROLE·SELF_FLAG·LOGGED_AT·NAME_VAL. */
    List<Map<String, Object>> selectPhotoChanges(@Param("since") String since);

    // ── 이력·감사 ───────────────────────────────────────────────────────

    int insertLog(@Param("institutionId") String institutionId, @Param("headId") Long headId,
                  @Param("eventCd") String eventCd, @Param("itemId") Long itemId, @Param("fromItemId") Long fromItemId,
                  @Param("photoId") Long photoId, @Param("fromPhotoId") Long fromPhotoId, @Param("fromHeadId") Long fromHeadId,
                  @Param("batchId") String batchId, @Param("reason") String reason,
                  @Param("actorEmpNo") String actorEmpNo, @Param("actorRole") String actorRole,
                  @Param("selfFlag") int selfFlag, @Param("verified") int verified, @Param("now") String now);

    int insertAct(@Param("institutionId") String institutionId, @Param("headId") Long headId,
                  @Param("actionCd") String actionCd, @Param("outcome") String outcome, @Param("targetId") Long targetId,
                  @Param("actorEmpNo") String actorEmpNo, @Param("verified") int verified,
                  @Param("screenId") String screenId, @Param("buttonId") String buttonId,
                  @Param("uiValid") int uiValid, @Param("now") String now);

    /** 그 사번의 그 시각 이후 열람(VIEW 계열) 성공 건수 — 하루 열람 경고용. */
    int countViewsSince(@Param("actorEmpNo") String actorEmpNo, @Param("since") String since);
}
