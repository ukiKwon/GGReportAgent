package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.InstPlanDoc;
import com.kbstar.kgi.ggreport.web.domain.InstPlanImport;
import com.kbstar.kgi.ggreport.web.domain.InstPlanItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 기관 사업계획(034) — INST_PLAN_*. INSERT·SELECT 만 있다(판은 쌓기만 한다). */
@Mapper
public interface InstitutionPlanMapper {
    List<String> selectIdsIgnoreCase(@Param("institutionId") String institutionId);
    String lockInstitution(@Param("institutionId") String institutionId);
    String selectInstitutionName(@Param("institutionId") String institutionId);
    List<Map<String, Object>> selectInstitutionsIn(@Param("ids") List<String> ids);
    List<Map<String, Object>> selectPlanCodes();
    InstPlanImport selectLatestImport(@Param("institutionId") String institutionId);
    int countImportsByOrigin(@Param("institutionId") String institutionId, @Param("originCd") String originCd);
    int countImportBySha(@Param("institutionId") String institutionId, @Param("sha") String sha);
    List<InstPlanImport> selectLatestImports();
    List<InstPlanDoc> selectLatestDocs();
    List<InstPlanDoc> selectDocsOfImport(@Param("importId") Long importId);
    List<InstPlanItem> selectItemsOfImport(@Param("importId") Long importId);
    int insertImport(InstPlanImport row);
    int insertDoc(InstPlanDoc row);
    int insertItem(InstPlanItem row);
    int insertAct(@Param("institutionId") String institutionId, @Param("importId") Long importId, @Param("actionCd") String actionCd,
                  @Param("outcome") String outcome, @Param("itemCount") Integer itemCount, @Param("sha") String sha,
                  @Param("empNo") String empNo, @Param("empVerified") int empVerified, @Param("screenId") String screenId,
                  @Param("buttonId") String buttonId, @Param("uiValid") int uiValid, @Param("loggedAt") String loggedAt);
}
