package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * 기관 조회. Python {@code server/repository.py} 의 읽기 쪽 + 라우터의 404 판정.
 */
@Service
public class InstitutionService {

    private final InstitutionMapper mapper;

    public InstitutionService(InstitutionMapper mapper) {
        this.mapper = mapper;
    }

    public List<Institution> list() {
        List<Institution> all = mapper.selectAll();
        LocalDate today = LocalDate.now(InstitutionRules.SEOUL);
        for (Institution i : all) {
            InstitutionRules.decorate(i, today);   // open_check_needed 계산 플래그
        }
        return all;
    }

    /** 없으면 null. 404 로 바꾸는 것은 {@link #require} 의 몫이다. */
    public Institution find(String institutionId) {
        return InstitutionRules.decorate(mapper.selectById(institutionId), LocalDate.now(InstitutionRules.SEOUL));
    }

    /**
     * 없으면 404.
     *
     * <p>⚠️ 사유 문구 {@code "institution not found"} 는 <b>영어 그대로</b>다 —
     * 골든 {@code 02} 가 고정했다. 번역하면 골든이 깨진다("동작 동일"이 목표이지
     * "더 나은 문구"가 아니다).
     */
    public Institution require(String institutionId) {
        Institution institution = mapper.selectById(institutionId);
        if (institution == null) {
            throw ApiException.notFound("institution not found");
        }
        return InstitutionRules.decorate(institution, LocalDate.now(InstitutionRules.SEOUL));
    }
}
