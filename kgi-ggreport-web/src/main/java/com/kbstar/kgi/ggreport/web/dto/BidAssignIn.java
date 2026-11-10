package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code POST /bidcases/{id}/assignments} 본문 — {@code {"emp_nos": ["3918264", ...]}}.
 * 배정자·역할·시각은 받지 않는다(서버가 Actor·USERS 로 채운다). 모르는 키(by·role 등)는 무시한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BidAssignIn {

    private List<String> empNos = new ArrayList<>();

    public List<String> getEmpNos() { return empNos; }
    public void setEmpNos(List<String> empNos) { this.empNos = empNos; }
}
