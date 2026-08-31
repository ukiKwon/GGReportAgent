package com.kb.uploader.mapper;

import com.kb.uploader.domain.UploadedFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UploadedFileMapper {

    void insert(UploadedFile file);

    void update(UploadedFile file);

    void softDeleteById(@Param("id") Long id);

    void rejectById(@Param("id") Long id);

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
}
