package com.kb.uploader.controller;

import com.kb.uploader.service.PlanCsvUploadService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/**
 * upload.html 을 그리는 세 컨트롤러에 '사업계획 CSV 켜짐' 여부를 넣는다(기존 컨트롤러 생성자 무변경).
 * 서비스는 선택 주입 — @WebMvcTest 같은 슬라이스 컨텍스트에는 서비스 빈이 없으므로 그때는 꺼짐으로 본다.
 */
@ControllerAdvice(assignableTypes = {KGI11000$UploadView.class, KGI11100$UploadAction.class,
        KGI11200$PlanCsvUploadAction.class})
public class PlanCsvModelAdvice {

    private final ObjectProvider<PlanCsvUploadService> service;

    public PlanCsvModelAdvice(ObjectProvider<PlanCsvUploadService> service) {
        this.service = service;
    }

    @ModelAttribute("planCsvEnabled")
    public boolean planCsvEnabled() {
        PlanCsvUploadService s = service.getIfAvailable();
        return s != null && s.enabled();
    }
}
