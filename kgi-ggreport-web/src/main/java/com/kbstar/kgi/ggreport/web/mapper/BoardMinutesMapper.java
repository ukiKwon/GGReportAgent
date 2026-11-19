package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BoardMinutes;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesAct;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesItem;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesLog;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesRev;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesScope;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesSeg;
import com.kbstar.kgi.ggreport.web.domain.BoardMinutesUtter;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.session.RowBounds;

import java.util.List;

/**
 * BOARD_MINUTES · _UTTER · _SEG · _ITEM · _SCOPE · _REV · _LOG · _ACT (047). 양쪽 방언에서 같은 문장이다(databaseId 분기 없음).
 * 페이징은 RowBounds, LIKE 는 CONCAT 두 번 + ESCAPE '!', 잠금은 JOIN·집계 없는 FOR UPDATE.
 * CLOB 칸(BODY·OLD_TEXT·NEW_TEXT)은 정렬·DISTINCT·WHERE 에 쓰지 않는다. _LOG·_ACT 는 지우는 문장이 없다(추가 전용).
 */
@Mapper
public interface BoardMinutesMapper {

    // ── 사전·참조 ──

    /** 가림 사전(R9) — 상태와 무관하게 모든 사용자 이름. */
    List<String> selectAllUserNames();

    /** 자료 행을 잠가 같은 자료의 동시 업로드(상한·중복 검사)를 직렬화한다. */
    Long lockMaterial(@Param("mid") long mid);

    // ── 머리 ──

    int insertHead(BoardMinutes m);

    /** 삭제된 건 포함. 기관명·등록자 이름 칸까지 채운다. */
    BoardMinutes selectHead(@Param("id") long id);

    /** 쓰기 판정용 현재 읽기 — 번호·자료·REV·삭제 여부만, 행을 잠근다. 없으면 null. */
    BoardMinutes lockHead(@Param("id") long id);

    int countActiveByMaterial(@Param("mid") long mid);

    List<Long> selectIdsByDigest(@Param("mid") long mid, @Param("digest") String digest);

    List<BoardMinutes> selectByMaterial(@Param("mid") long mid);

    List<BoardMinutes> selectList(@Param("empNo") String empNo, @Param("viewAll") boolean viewAll,
                                  @Param("uploaderSince") String uploaderSince, @Param("today") String today,
                                  @Param("q") String q, @Param("year") Integer year,
                                  @Param("meetingFrom") String meetingFrom, @Param("meetingTo") String meetingTo,
                                  RowBounds rows);

    /** 낙관적 버전 올리기 — REV_NO 가 base 이고 삭제되지 않았을 때만 1행. */
    int bumpRev(@Param("id") long id, @Param("base") int base, @Param("next") int next,
                @Param("by") String by, @Param("now") String now);

    /** 제목 또는 회의일 한 칸(null 인 쪽은 건드리지 않는다). */
    int updateMeta(@Param("id") long id, @Param("title") String title, @Param("meetingDate") String meetingDate);

    /** 삭제 표시 — 제목을 지운다. 본문 행은 서비스가 따로 지운다. */
    int markDeleted(@Param("id") long id, @Param("by") String by, @Param("now") String now);

    // ── 본문 ──

    int insertUtter(BoardMinutesUtter u);

    int insertSeg(BoardMinutesSeg s);

    int insertItem(BoardMinutesItem i);

    List<BoardMinutesUtter> selectUtters(@Param("id") long id);

    /** 발언 본문 없이 번호·화자·시각만(상세 화면의 구간 연결 계산용 — CLOB 을 읽지 않는다). */
    List<BoardMinutesUtter> selectUtterIndex(@Param("id") long id);

    List<BoardMinutesSeg> selectSegs(@Param("id") long id);

    List<BoardMinutesItem> selectItems(@Param("id") long id);

    /** 발언 본문 한 건 — 없으면 null. */
    String selectUtterBody(@Param("id") long id, @Param("seq") int seq);

    int updateUtterBody(@Param("id") long id, @Param("seq") int seq, @Param("body") String body);

    BoardMinutesItem selectItem(@Param("id") long id, @Param("no") int no);

    int updateItemBody(@Param("id") long id, @Param("no") int no, @Param("body") String body);

    /** 할 일(KIND_CD='TODO') 항목만. */
    int updateItemDone(@Param("id") long id, @Param("no") int no, @Param("done") int done,
                       @Param("by") String by, @Param("now") String now);

    // ── 공개범위 ──

    /** 그 사람에게 아직 유효한(종료일 ≥ 오늘) 개인 공개가 있는가. */
    int countGrant(@Param("id") long id, @Param("empNo") String empNo, @Param("today") String today);

    List<BoardMinutesScope> selectScope(@Param("id") long id);

    int insertScope(BoardMinutesScope s);

    int updateScopeUntil(BoardMinutesScope s);

    int deleteScope(@Param("id") long id, @Param("empNo") String empNo);

    // ── 이력·감사 ──

    int insertRev(BoardMinutesRev r);

    List<BoardMinutesRev> selectRevs(@Param("id") long id, RowBounds rows);

    int insertLog(BoardMinutesLog l);

    List<BoardMinutesLog> selectLogs(@Param("id") long id, RowBounds rows);

    int insertAct(BoardMinutesAct a);

    List<BoardMinutesAct> selectActs(@Param("id") long id, RowBounds rows);

    // ── 삭제(본문 소거) ──

    int deleteUtters(@Param("id") long id);

    int deleteSegs(@Param("id") long id);

    int deleteItems(@Param("id") long id);

    int deleteScopes(@Param("id") long id);

    int deleteRevs(@Param("id") long id);
}
