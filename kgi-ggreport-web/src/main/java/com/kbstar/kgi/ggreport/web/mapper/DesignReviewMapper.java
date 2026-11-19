package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.DesignComment;
import com.kbstar.kgi.ggreport.web.domain.DesignReadyCase;
import com.kbstar.kgi.ggreport.web.domain.DesignRecipient;
import com.kbstar.kgi.ggreport.web.domain.DesignRound;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 디자인 검토 흐름(051) — DESIGN_ROUND · DESIGN_ROUND_RECIP · DESIGN_COMMENT · DESIGN_ACK.
 * 쓰기는 모두 추가 전용이고 UPDATE 는 회차 닫기 한 문장뿐이다(WHERE CLOSED_AT IS NULL). 동시성은 {@link #lockTask} 가 맡는다 —
 * 회차 열기·닫기, 의견·확인함의 열림 판정, 의견 30건 상한은 모두 이 잠금 아래에서 읽고 쓴다(security M1).
 */
@Mapper
public interface DesignReviewMapper {

    /** TASKS 행을 FOR UPDATE 로 잡고 그 상태를 돌려준다. 작업이 없으면 null. 트랜잭션의 첫 문장이어야 한다. */
    String lockTask(@Param("taskId") String taskId);

    int selectMaxRound(@Param("taskId") String taskId);

    DesignRound selectRound(@Param("taskId") String taskId, @Param("roundNo") int roundNo);

    int insertRound(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("bidCaseId") String bidCaseId,
                    @Param("openedBy") String openedBy, @Param("verified") int verified,
                    @Param("openedAt") String openedAt, @Param("recipCount") int recipCount);

    /** 열려 있는 회차만 닫는다. 0행이면 이미 닫혔거나 없다. */
    int closeRound(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("closeCd") String closeCd,
                   @Param("closedBy") String closedBy, @Param("closedAt") String closedAt);

    int insertRecipient(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo,
                        @Param("reasonCd") String reasonCd, @Param("notificationId") String notificationId);

    /** 그 회차 받는 사람이면 1, 아니면 0. */
    int countRecipient(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo);

    /** 어느 회차든 받는 사람이었으면 1 이상. */
    int countRecipientAny(@Param("taskId") String taskId, @Param("empNo") String empNo);

    int countComments(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo);

    int insertComment(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo,
                      @Param("seqNo") int seqNo, @Param("body") String body, @Param("verified") int verified,
                      @Param("createdAt") String createdAt);

    int countAck(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo);

    int insertAck(@Param("taskId") String taskId, @Param("roundNo") int roundNo, @Param("empNo") String empNo,
                  @Param("verified") int verified, @Param("ackedAt") String ackedAt);

    List<DesignRound> selectRounds(@Param("taskId") String taskId);

    List<DesignRecipient> selectRecipients(@Param("taskId") String taskId);

    List<DesignComment> selectComments(@Param("taskId") String taskId);

    /** 세 팀(teams)이 모두 approvedStatus 이고 디자이너 작업(designerTeam)이 아직 없는 건. */
    List<DesignReadyCase> selectReady(@Param("teams") List<String> teams, @Param("teamCount") int teamCount,
                                      @Param("approvedStatus") String approvedStatus,
                                      @Param("designerTeam") String designerTeam);
}
