package com.kb.uploader.controller;

import com.kb.uploader.code.InstitutionCategory;
import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

@Controller
@RequestMapping("/file-status/classified")
public class KGI12400$ClassifiedFileList {


    private final UploadedFileMapper fileMapper;

    public KGI12400$ClassifiedFileList(UploadedFileMapper fileMapper) {
        this.fileMapper = fileMapper;
    }

    /**
     * 파싱은 됐는데 <b>기관을 못 찾은</b> 건을 모은다 (2026-09-23 파싱 전환에 맞춰 조건 교체).
     *
     * <p>종전 조건은 {@code 기관명 = '알수없음' AND 분류상태구분 = '02'} 였는데, 새 파싱 경로는
     * 기관을 못 찾으면 이름을 "기관미상" 으로 두고 분류상태를 미분류로 남긴다. 그래서
     * <b>기관영업분류구분이 NULL</b> 인 것을 기준으로 바꿨다 — 그 값이 곧 "미분류" 다.
     */
    @GetMapping
    public String execute(Model model) {
        List<UploadedFile> classifiedFiles =
                fileMapper.searchParseStatus(null, "SUCCESS", Boolean.TRUE);
        model.addAttribute("classifiedFiles", classifiedFiles);
        model.addAttribute("categories", InstitutionCategory.names());
        model.addAttribute("parseFailedCount", fileMapper.countParseFailed());
        return "classified-rework";
    }
}
