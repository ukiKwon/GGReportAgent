package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.NoticeInstRef;
import com.kbstar.kgi.ggreport.web.domain.NoticeRound;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundLog;
import com.kbstar.kgi.ggreport.web.domain.NoticeRoundView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;

/** NOTICE_ROUND · NOTICE_ROUND_LOG(037). 이력은 INSERT 만 — 수정·삭제 문장은 일부러 없다. 회차는 닫힘·기준 채우기 UPDATE 만. */
@Mapper
public interface NoticeRoundMapper {

    /** 기관 행 잠금(FOR UPDATE) + 지금 LAST_BID. 기관이 없으면 null. */
    NoticeInstRef lockInstitution(@Param("institutionId") String institutionId);

    /** 잠그지 않는 읽기. */
    NoticeInstRef selectInstitution(@Param("institutionId") String institutionId);

    /** 열린 회차(정상이면 0~1개) — 순번 큰 것 먼저. */
    List<NoticeRound> selectOpenRounds(@Param("institutionId") String institutionId);

    int selectMaxRoundSeq(@Param("institutionId") String institutionId);

    int insertRound(@Param("institutionId") String institutionId, @Param("roundSeq") int roundSeq, @Param("sourceCd") String sourceCd,
                    @Param("anchorLastBid") String anchorLastBid, @Param("now") String now, @Param("by") String by);

    /** 빈 기준(ANCHOR_LAST_BID IS NULL)만 채운다. */
    int fillAnchor(@Param("institutionId") String institutionId, @Param("roundSeq") int roundSeq, @Param("lastBid") String lastBid);

    /** 열린 회차를 닫는다(CLOSED_AT IS NULL 일 때만). */
    int closeRound(@Param("institutionId") String institutionId, @Param("roundSeq") int roundSeq, @Param("now") String now,
                   @Param("reasonCd") String reasonCd, @Param("by") String by, @Param("lastBid") String lastBid);

    /** 그 회차의 최신(최대 REV_NO) 판정. 없으면 null. */
    NoticeRoundLog selectLatestLog(@Param("institutionId") String institutionId, @Param("roundSeq") int roundSeq);

    int insertLog(NoticeRoundLog row);

    /** 열린 회차마다 최신 판정 + 기관의 지금 LAST_BID. */
    List<NoticeRoundView> selectOpenCurrent();

    /** 입찰 없음(NO_BID)으로 닫힌 회차가 그 기관의 마지막 회차인 기관마다 그 회차의 최신 판정 + 기관의 지금 LAST_BID. 기준값 비교(advanced)는 서비스가 한다. */
    List<NoticeRoundView> selectClosedNoBidCurrent();

    /** 한 기관의 입찰 없음 닫힌 마지막 회차 + 최신 판정(0~1행). 기준값 비교는 서비스가 한다(PrepNobidService). */
    List<NoticeRoundView> selectClosedNoBidOne(@Param("institutionId") String institutionId);

    List<NoticeRound> selectRounds(@Param("institutionId") String institutionId, RowBounds rb);

    List<NoticeRoundLog> selectLogs(@Param("institutionId") String institutionId, RowBounds rb);
}
