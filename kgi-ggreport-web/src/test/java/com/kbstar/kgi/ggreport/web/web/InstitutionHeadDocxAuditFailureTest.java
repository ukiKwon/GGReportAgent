package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionPlanMapper;
import com.kbstar.kgi.ggreport.web.service.HeadAudit;
import com.kbstar.kgi.ggreport.web.service.HeadPhotoService;
import com.kbstar.kgi.ggreport.web.service.InstitutionHeadService;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * NEXT 100 S1 · qa D2 — 기관장 정보 .docx 의 성공 감사(HEAD_DOCX/OK)는 <b>응답 전에</b> 기록한다. 기록이 실패하면 500 이고 문서가 나가지 않는다.
 * 스프링 컨텍스트 없이 컨트롤러를 Mockito 협력 객체와 직접 세운다(PrepAuditIsolationTest 와 같은 방식 — {@code @MockBean} 은 AppTest 의 단일 컨텍스트 규칙을 깬다).
 * 응답 변환은 실제 {@link ApiExceptionHandler} 를 붙여 본다. '본문 0바이트' = docx 바이트(zip 'PK')·첨부 헤더가 없다는 뜻이다
 * (500 은 전역 처리기의 고정 문구 JSON 한 줄만 싣는다).
 * 이 시험의 기관장·기관 이름은 모두 가상이다.
 */
public class InstitutionHeadDocxAuditFailureTest {

    private static final String EMP = "3918264";
    private static final String INST = "nowon";
    private static final String SECRET = "jdbc-secret-detail-xyz";   // 감사 예외 메시지 — 응답에 새면 안 된다

    private HeadAudit audit;
    private InstitutionHeadService heads;
    private InstitutionPlanMapper plans;
    private MockMvc mvc;

    @Before
    public void 준비() {
        audit = mock(HeadAudit.class);
        heads = mock(InstitutionHeadService.class);
        plans = mock(InstitutionPlanMapper.class);
        MenuGuard guard = mock(MenuGuard.class);
        SysUser me = new SysUser();
        me.setEmpNo(EMP);
        me.setStatus("ACTIVE");
        me.setRole("영업팀");
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenReturn(me);
        when(plans.selectInstitutionName(INST)).thenReturn("가상구청");
        InstitutionHeadController ctl = new InstitutionHeadController(mock(InstHeadSettings.class), guard, audit, heads,
                mock(HeadPhotoService.class), plans);
        mvc = MockMvcBuilders.standaloneSetup(ctl).setControllerAdvice(new ApiExceptionHandler(false)).build();
    }

    private static MockHttpServletRequestBuilder docxReq() {
        return get("/institutions/" + INST + "/head/docx").header("X-Emp-No", EMP)
                .header("X-Screen-Id", "head_card").header("X-Button-Id", "head_docx");
    }

    private static Map<String, Object> field(String value) {
        Map<String, Object> src = new LinkedHashMap<>();
        src.put("kind", "HOMEPAGE");
        src.put("title", "가상 출처");
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("value", value);
        f.put("source", src);
        return f;
    }

    /** 현 기관장 77 번 — 확정 이름 하나. */
    private static Map<String, Object> detailWithName() {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("NAME", field("가상일"));
        Map<String, Object> head = new LinkedHashMap<>();
        head.put("head_id", Long.valueOf(77L));
        head.put("name", "가상일");
        head.put("fields", fields);
        head.put("education", Collections.emptyList());
        head.put("career", Collections.emptyList());
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("head", head);
        d.put("head_empty", Boolean.FALSE);
        return d;
    }

    @Test
    public void 성공_감사_기록이_터지면_500이고_문서도_첨부_헤더도_나가지_않는다() throws Exception {
        when(heads.detail(any(), any(), eq(INST))).thenReturn(detailWithName());
        doThrow(new IllegalStateException(SECRET)).when(audit)
                .record(any(), any(), eq("HEAD_DOCX"), eq("OK"), any(), any(), any());

        MockHttpServletResponse r = mvc.perform(docxReq()).andReturn().getResponse();

        assertEquals(500, r.getStatus());
        assertNull("첨부 헤더 없음", r.getHeader("Content-Disposition"));
        assertTrue(String.valueOf(r.getContentType()), String.valueOf(r.getContentType()).startsWith("application/json"));
        byte[] body = r.getContentAsByteArray();
        assertFalse("docx(zip) 바이트가 나가면 안 된다", body.length >= 2 && body[0] == 'P' && body[1] == 'K');
        assertFalse("감사 예외 메시지가 응답에 새면 안 된다", new String(body, StandardCharsets.UTF_8).contains(SECRET));
        verify(audit).record(eq(INST), eq(77L), eq("HEAD_DOCX"), eq("OK"), isNull(), any(), any());
    }

    @Test
    public void 대조군_감사가_성공하면_200이고_감사_행에_현_기관장_번호가_실린다() throws Exception {
        when(heads.detail(any(), any(), eq(INST))).thenReturn(detailWithName());

        MockHttpServletResponse r = mvc.perform(docxReq()).andReturn().getResponse();

        assertEquals(200, r.getStatus());
        byte[] body = r.getContentAsByteArray();
        assertTrue(body.length > 2 && body[0] == 'P' && body[1] == 'K');
        verify(audit).record(eq(INST), eq(77L), eq("HEAD_DOCX"), eq("OK"), isNull(), any(), any());
    }

    @Test
    public void 사진만_있어_확정_칸이_없으면_409이고_BLOCKED로_감사한다() throws Exception {
        Map<String, Object> head = new LinkedHashMap<>();
        head.put("head_id", Long.valueOf(77L));
        head.put("fields", new LinkedHashMap<String, Object>());
        head.put("education", Collections.emptyList());
        head.put("career", Collections.emptyList());
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("head", head);
        d.put("head_empty", Boolean.FALSE);   // 사진이 있어 서비스는 비지 않았다고 본다
        when(heads.detail(any(), any(), eq(INST))).thenReturn(d);

        MockHttpServletResponse r = mvc.perform(docxReq()).andReturn().getResponse();

        assertEquals(409, r.getStatus());
        assertTrue(r.getContentAsString(StandardCharsets.UTF_8), r.getContentAsString(StandardCharsets.UTF_8).contains("HEAD_EMPTY"));
        verify(audit).record(eq(INST), isNull(), eq("HEAD_DOCX"), eq("BLOCKED"), isNull(), any(), any());
    }
}
