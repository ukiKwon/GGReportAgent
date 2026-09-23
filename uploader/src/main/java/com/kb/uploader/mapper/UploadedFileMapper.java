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

    // ── 2026-09-23 파싱 전환 ──────────────────────────────────────────
    /** 파싱 결과 기록. JPA 의 더티체킹 대신 쓰는 UPDATE 다. */
    void updateParseResult(UploadedFile file);

    long countByParseStatus(@Param("parseStatus") String parseStatus);

    long countByDocType(@Param("docType") String docType);

    /** 파싱은 성공했는데 기관을 못 찾은 건(기관분류 NULL). */
    long countParsedUnclassified();

    /** 파싱 현황 화면. 조건은 모두 선택이며 null 이면 걸지 않는다. */
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
