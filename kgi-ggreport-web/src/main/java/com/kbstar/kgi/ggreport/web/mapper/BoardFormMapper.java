package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.BoardForm;
import com.kbstar.kgi.ggreport.web.domain.BoardFormVer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code BOARD_FORM} · {@code BOARD_FORM_VER}. 지우는 문장은 없다(버전은 불변, 삭제는 ARCHIVED 표시). */
@Mapper
public interface BoardFormMapper {

    int insertForm(BoardForm f);

    int insertVersion(BoardFormVer v);

    BoardForm selectForm(@Param("id") Long id);

    /** status 가 null 이면 상태 무관. */
    List<BoardForm> selectByTeam(@Param("team") String team, @Param("status") String status);

    /** 팀 안의 활성 양식 중 같은 이름 수. excludeId 가 있으면 그 양식은 뺀다. */
    int countActiveByName(@Param("team") String team, @Param("name") String name, @Param("excludeId") Long excludeId);

    BoardFormVer selectVersion(@Param("id") Long id, @Param("verNo") int verNo);

    /** SPEC_JSON 은 싣지 않는다(최신순). */
    List<BoardFormVer> selectVersions(@Param("id") Long id);

    /** 낙관적 락: 기대한 CURRENT_VER 일 때만 갱신. 0 이면 누가 먼저 저장한 것. */
    int updateHeader(@Param("id") Long id, @Param("expectedVer") int expectedVer, @Param("newVer") int newVer,
                     @Param("name") String name, @Param("actor") String actor, @Param("at") String at);

    int updateStatus(@Param("id") Long id, @Param("status") String status,
                     @Param("actor") String actor, @Param("at") String at);
}
