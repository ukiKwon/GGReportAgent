package com.kbstar.kgi.ggreport.web.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 발표 대본(NEXT 113 ⑤) 전용 읽기 질의 — 쓰는 문장 없음. ANSI 문장(양쪽 방언 공통). */
@Mapper
public interface PrepScriptMapper {

    /** 그 입찰 건의 이사회 자료 번호 — 연도·번호 내림차순(잠금 없음). 없으면 빈 목록. */
    List<Long> selectBoardIds(@Param("bidCaseId") String bidCaseId);
}
