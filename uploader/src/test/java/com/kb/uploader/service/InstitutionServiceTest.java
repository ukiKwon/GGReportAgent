package com.kb.uploader.service;

import com.kb.uploader.domain.Institution;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class InstitutionServiceTest {

    private InstitutionMapper institutionMapper;
    private ClassificationService classificationService;
    private UploadedFileMapper uploadedFileMapper;
    private InstitutionService sut;

    @Before
    public void setUp() {
        institutionMapper = mock(InstitutionMapper.class);
        classificationService = mock(ClassificationService.class);
        uploadedFileMapper = mock(UploadedFileMapper.class);
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.emptyList());
        sut = new InstitutionService(institutionMapper, classificationService, uploadedFileMapper);
    }

    @Test
    public void findAll_저장소_목록_위임() {
        List<Institution> expected = Arrays.asList(
            new Institution("서울대학교", "대학교"),
            new Institution("서울특별시", "지자체")
        );
        when(institutionMapper.findAll()).thenReturn(expected);

        List<Institution> result = sut.findAll();

        assertEquals(2, result.size());
        verify(institutionMapper).findAll();
    }

    @Test
    public void save_신규기관_insert() {
        when(institutionMapper.findByName("서울대학교")).thenReturn(Optional.empty());

        Institution result = sut.save("서울대학교", "대학교");

        assertNotNull(result);
        assertEquals("서울대학교", result.getName());
        verify(institutionMapper).insert(any(Institution.class));
        verify(institutionMapper, never()).update(any());
    }

    @Test
    public void save_기존기관_카테고리갱신_update() {
        Institution existing = new Institution("서울대학교", "기타");
        when(institutionMapper.findByName("서울대학교")).thenReturn(Optional.of(existing));

        Institution result = sut.save("서울대학교", "대학교");

        assertEquals("대학교", result.getCategory());
        verify(institutionMapper).update(existing);
        verify(institutionMapper, never()).insert(any());
    }

    @Test
    public void deleteById_저장소_삭제_위임() {
        sut.deleteById(1L);
        verify(institutionMapper).deleteById(1L);
    }

    @Test
    public void exportToJson_카테고리별_그룹핑() throws Exception {
        when(institutionMapper.findAll()).thenReturn(Arrays.asList(
            new Institution("서울대학교", "대학교"),
            new Institution("연세대학교", "대학교"),
            new Institution("서울특별시", "지자체")
        ));

        byte[] json = sut.exportToJson();
        String result = new String(json, "UTF-8");

        assertTrue(result.contains("대학교"));
        assertTrue(result.contains("서울대학교"));
        assertTrue(result.contains("지자체"));
    }

    @Test
    public void exportToJson_빈목록_빈객체반환() throws Exception {
        when(institutionMapper.findAll()).thenReturn(Collections.emptyList());

        byte[] json = sut.exportToJson();
        String result = new String(json, "UTF-8");

        assertTrue(result.contains("{") && result.contains("}"));
    }

    @Test
    public void importFromJson_기존데이터_교체() throws Exception {
        String json = "{\"대학교\":[\"서울대학교\",\"연세대학교\"],\"지자체\":[\"서울특별시\"]}";

        sut.importFromJson(json.getBytes("UTF-8"));

        verify(institutionMapper).deleteAll();
        verify(institutionMapper, times(3)).insert(any(Institution.class));
    }

    @Test
    public void importFromJson_단일카테고리() throws Exception {
        String json = "{\"대학교\":[\"KAIST\"]}";

        sut.importFromJson(json.getBytes("UTF-8"));

        verify(institutionMapper).deleteAll();
        verify(institutionMapper, times(1)).insert(any(Institution.class));
    }

    @Test
    public void exportToXlsx_바이트_생성확인() throws Exception {
        when(institutionMapper.findAll()).thenReturn(Arrays.asList(
            new Institution("서울대학교", "대학교"),
            new Institution("서울특별시", "지자체")
        ));

        byte[] xlsx = sut.exportToXlsx();

        assertNotNull(xlsx);
        assertTrue("XLSX 바이트가 비어있음", xlsx.length > 0);
    }

    @Test
    public void exportToXlsx_후_importFromXlsx_roundtrip() throws Exception {
        when(institutionMapper.findAll()).thenReturn(Arrays.asList(
            new Institution("서울대학교", "대학교"),
            new Institution("연세대학교", "대학교"),
            new Institution("서울특별시", "지자체")
        ));

        byte[] xlsx = sut.exportToXlsx();

        reset(institutionMapper);
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.emptyList());
        sut.importFromXlsx(xlsx);

        verify(institutionMapper).deleteAll();
        verify(institutionMapper, times(3)).insert(any(Institution.class));
    }

    @Test
    public void importFromXlsx_deleteAll_후_재저장() throws Exception {
        when(institutionMapper.findAll()).thenReturn(Arrays.asList(
            new Institution("KAIST", "대학교")
        ));
        byte[] xlsx = sut.exportToXlsx();

        reset(institutionMapper);
        when(uploadedFileMapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.emptyList());
        sut.importFromXlsx(xlsx);

        verify(institutionMapper).deleteAll();
        verify(institutionMapper, times(1)).insert(any(Institution.class));
    }
}
