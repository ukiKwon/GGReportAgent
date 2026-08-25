package com.kb.uploader.mapper;

import com.kb.uploader.domain.Institution;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface InstitutionMapper {

    void insert(Institution institution);

    void update(Institution institution);

    void deleteById(@Param("id") Long id);

    void deleteAll();

    Optional<Institution> findByName(@Param("name") String name);

    List<Institution> findAll();
}
