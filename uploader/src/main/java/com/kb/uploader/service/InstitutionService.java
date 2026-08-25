package com.kb.uploader.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.uploader.domain.Institution;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.InstitutionMapper;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class InstitutionService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final InstitutionMapper institutionMapper;
    private final ClassificationService classificationService;
    private final UploadedFileMapper uploadedFileMapper;

    public InstitutionService(InstitutionMapper institutionMapper,
                              ClassificationService classificationService,
                              UploadedFileMapper uploadedFileMapper) {
        this.institutionMapper = institutionMapper;
        this.classificationService = classificationService;
        this.uploadedFileMapper = uploadedFileMapper;
    }

    public List<Institution> findAll() {
        return institutionMapper.findAll();
    }

    public Institution save(String name, String category) {
        Optional<Institution> existing = institutionMapper.findByName(name);
        if (existing.isPresent()) {
            existing.get().updateCategory(category);
            institutionMapper.update(existing.get());
            return existing.get();
        }
        Institution inst = new Institution(name, category);
        institutionMapper.insert(inst);
        return inst;
    }

    public void deleteById(Long id) {
        institutionMapper.deleteById(id);
    }

    public byte[] exportToJson() throws IOException {
        Map<String, List<String>> grouped = institutionMapper.findAll().stream()
            .collect(Collectors.groupingBy(
                Institution::getCategory,
                Collectors.mapping(Institution::getName, Collectors.toList())));
        return MAPPER.writerWithDefaultPrettyPrinter().writeValueAsBytes(grouped);
    }

    @Transactional
    public void importFromJson(byte[] json) throws IOException {
        Map<String, List<String>> data = MAPPER.readValue(json,
            new TypeReference<Map<String, List<String>>>() {});
        institutionMapper.deleteAll();
        data.forEach((category, names) ->
            names.forEach(name -> institutionMapper.insert(new Institution(name, category))));
        List<UploadedFile> pending = uploadedFileMapper.findByStatus("UNCLASSIFIED");
        pending.forEach(f -> classificationService.classify(f));
    }

    public byte[] exportToXlsx() throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("기관목록");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("기관명");
            header.createCell(1).setCellValue("카테고리");
            int rowNum = 1;
            for (Institution inst : institutionMapper.findAll()) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(inst.getName());
                row.createCell(1).setCellValue(inst.getCategory());
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Transactional
    public void importFromXlsx(byte[] xlsx) throws IOException {
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            Sheet sheet = wb.getSheetAt(0);
            institutionMapper.deleteAll();
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                Cell nameCell = row.getCell(0);
                Cell categoryCell = row.getCell(1);
                if (nameCell == null) continue;
                String name = nameCell.getStringCellValue().trim();
                String category = categoryCell != null
                    ? categoryCell.getStringCellValue().trim() : "";
                if (!name.isEmpty()) {
                    institutionMapper.insert(new Institution(name, category));
                }
            }
        }
        List<UploadedFile> pending = uploadedFileMapper.findByStatus("UNCLASSIFIED");
        pending.forEach(f -> classificationService.classify(f));
    }
}
