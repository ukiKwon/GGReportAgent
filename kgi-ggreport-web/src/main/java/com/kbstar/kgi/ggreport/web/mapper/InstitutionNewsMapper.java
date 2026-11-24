package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.InstNewsImport;
import com.kbstar.kgi.ggreport.web.domain.InstNewsItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 기관 뉴스(060) — INST_NEWS_*. INSERT·SELECT 만(판은 쌓기만 한다). 기관 잠금·감사·기관명은 InstitutionPlanMapper 것을 쓴다. */
@Mapper
public interface InstitutionNewsMapper {
    InstNewsImport selectLatestImport(@Param("institutionId") String institutionId);
    int countImportBySha(@Param("institutionId") String institutionId, @Param("sha") String sha);
    List<InstNewsItem> selectItemsOfImport(@Param("importId") Long importId);
    int insertImport(InstNewsImport row);
    int insertItem(InstNewsItem row);
}
