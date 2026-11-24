package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.PlanCollectReq;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;
import java.util.Map;

/** 사업계획 수집 요청(045). 상태 전이는 전부 조건부 UPDATE — 영향 행 수로 경쟁을 판정한다. DELETE 없음. */
@Mapper
public interface PlanCollectMapper {
    List<String> selectIdsIgnoreCase(@Param("institutionId") String institutionId);
    String lockInstitution(@Param("institutionId") String institutionId);
    String selectInstitutionName(@Param("institutionId") String institutionId);
    List<String> selectLatestSrcUrls(@Param("institutionId") String institutionId);

    PlanCollectReq selectOpenByInst(@Param("institutionId") String institutionId);
    PlanCollectReq selectByKey(@Param("reqKey") String reqKey);
    PlanCollectReq selectBySeq(@Param("institutionId") String institutionId, @Param("reqSeq") int reqSeq);
    List<PlanCollectReq> selectRecentClosed(@Param("since") String since);
    String selectLastRunStartedAt(@Param("institutionId") String institutionId);
    List<PlanCollectReq> selectByKeys(@Param("keys") List<String> keys);
    List<PlanCollectReq> selectOpenList();
    List<PlanCollectReq> selectClosedList(RowBounds bounds);
    List<Map<String, Object>> countOpenByStatus();
    int nextSeq(@Param("institutionId") String institutionId);
    int insertReq(PlanCollectReq row);

    Map<String, Object> selectRequester(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq, @Param("empNo") String empNo);
    int insertRequester(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq, @Param("empNo") String empNo,
                        @Param("at") String at, @Param("verified") int verified);
    int reviveRequester(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq, @Param("empNo") String empNo,
                        @Param("at") String at, @Param("verified") int verified);
    int cancelRequester(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq, @Param("empNo") String empNo,
                        @Param("at") String at);
    int countActiveRequesters(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq);
    List<String> selectActiveRequesterEmpNos(@Param("institutionId") String institutionId, @Param("reqSeq") Integer reqSeq);
    List<Map<String, Object>> selectRequestersOfKeys(@Param("keys") List<String> keys);
    List<Map<String, Object>> selectOpenRequesters();

    int markRunning(@Param("reqKey") String reqKey, @Param("mode") String mode, @Param("empNo") String empNo, @Param("at") String at,
                    @Param("verified") int verified, @Param("domains") String domains);
    int recordSent(@Param("reqKey") String reqKey, @Param("jobId") String jobId);
    int revertRunning(@Param("reqKey") String reqKey, @Param("code") String code);
    int closeReq(@Param("reqKey") String reqKey, @Param("to") String to, @Param("fromStates") List<String> fromStates,
                 @Param("at") String at, @Param("empNo") String empNo, @Param("reason") String reason);
    int applyOpen(@Param("institutionId") String institutionId, @Param("importId") Long importId, @Param("at") String at,
                  @Param("empNo") String empNo);
    int applyOpenNews(@Param("institutionId") String institutionId, @Param("at") String at, @Param("empNo") String empNo);
}
