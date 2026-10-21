package com.kb.uploader.mapper;

import java.time.LocalDateTime;
import com.kb.uploader.domain.UploadedFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UploadedFileMapper {

    void insert(UploadedFile file);

    void update(UploadedFile file);

    void softDeleteById(@Param("id") Long id,
                        @Param("systemUserNo") String systemUserNo,
                        @Param("systemUsedAt") LocalDateTime systemUsedAt);

    void rejectById(@Param("id") Long id,
                    @Param("systemUserNo") String systemUserNo,
                        @Param("systemUsedAt") LocalDateTime systemUsedAt);

    Optional<UploadedFile> findById(@Param("id") Long id);

    List<UploadedFile> findByStatus(@Param("status") String status);

    List<UploadedFile> findClassifiedByUnknownInstitution();

    long countAll();

    long countByStatus(@Param("status") String status);

    List<UploadedFile> findRecent(@Param("limit") int limit);

    List<UploadedFile> findByInstitutionNameContaining(
            @Param("keyword") String keyword,
            @Param("offset") int offset,
            @Param("limit") int limit);

    long countByInstitutionNameContaining(@Param("keyword") String keyword);

    List<UploadedFile> search(@Param("institution") String institution,
                              @Param("year") String year,
                              @Param("keyword") String keyword);

    // ── 2026-09-23 파싱 전환 (스키마 무변경안) ─────────────────────────
    // ⚠️ 컬럼을 늘리지 않았다. 문서종류·파싱 성공 여부는 XML 이 **파일명 확장자**로 판별한다.
    //    판별 규칙 정본은 code/DocumentType 이고 XML 의 sql 조각이 그 SQL 판이다.

    /** 파싱 결과 기록. 저장경로내용(산출물/원본)·분류일시(파싱시각)·문서년에 태운다. */
    void updateParseResult(UploadedFile file);

    long countParseSuccess();

    long countParseFailed();

    long countProposalDocs();

    long countRfpDocs();

    /** 파싱은 성공했는데 기관을 못 찾은 건(기관분류 NULL). */
    long countParsedUnclassified();

    /** 파싱 현황 화면. docType 은 "BID_PROPOSAL"·"RFP", parseStatus 는 "SUCCESS"·"FAILED". */
    List<UploadedFile> searchParseStatus(@Param("docType") String docType,
                                         @Param("parseStatus") String parseStatus,
                                         @Param("unclassifiedOnly") Boolean unclassifiedOnly);

    List<UploadedFile> searchProposals(@Param("institution") String institution,
                                       @Param("docDate") String docDate,
                                       @Param("offset") int offset,
                                       @Param("limit") int limit);

    long countProposals(@Param("institution") String institution,
                        @Param("docDate") String docDate);

    List<UploadedFile> searchRfps(@Param("institution") String institution,
                                  @Param("docDate") String docDate,
                                  @Param("offset") int offset,
                                  @Param("limit") int limit);

    long countRfps(@Param("institution") String institution,
                   @Param("docDate") String docDate);
}
