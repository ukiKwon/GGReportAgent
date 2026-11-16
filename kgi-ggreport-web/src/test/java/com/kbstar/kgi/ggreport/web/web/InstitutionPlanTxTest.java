package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/**
 * 기관 사업계획 반입 — 실패한 반입은 판을 하나도 남기지 않고, 실패 감사(INVALID)는 커밋된 채 남는다.
 *
 * <p>⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다(InboxTxRollbackTest 와 같은 이유) — 테스트 트랜잭션이 서비스·감사 트랜잭션을
 * 삼키면 "롤백 + 감사는 커밋" 을 볼 수 없다. 대신 직접 만든 행을 앞뒤로 지운다(기관 jongno 의 INST_PLAN_* 전부).
 */
@RunWith(SpringRunner.class)
@AppTest
public class InstitutionPlanTxTest {

    private static final String ADMIN = "8203417";
    private static final String INST = "jongno";
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;

    @Before
    public void 앞정리() { clean(); }

    @After
    public void 뒤정리() { clean(); }

    private void clean() {
        jdbc.update("DELETE FROM INST_PLAN_ITEM WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_DOC WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", INST);
        jdbc.update("DELETE FROM INST_PLAN_ACT WHERE INSTITUTION_ID=?", INST);
    }

    private static String row(String checked, String no, String bstate, String amount, String unit) {
        return String.join(",", INST, "종로 롤백 시험(가상)", "4개년계획", "2023", "2030", "https://example.kr/plan.pdf", checked,
                "plan-collector/1.0", "1", "시험 분야", no, "", "롤백 사업 " + no, "", bstate, amount, unit, "", "", "", "", "");
    }

    @Test
    public void 마지막_행의_금액이_16자리면_400이고_판은_없고_INVALID만_커밋된다() throws Exception {
        LocalDate d = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        String iso = d.toString();
        String csv = HDR + "\n"
                + row(iso, "1", "원문에 없음", "", "") + "\n"
                + row(iso, "2", "금액", "300", "백만원") + "\n"
                + row(iso, "3", "금액", "1234567890123456", "백만원") + "\n";
        String name = INST + "_" + d.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + "_plan.csv";

        MockHttpServletResponse res = mockMvc.perform(multipart("/institutions/" + INST + "/plans/import")
                        .file(new MockMultipartFile("file", name, "text/csv", csv.getBytes(StandardCharsets.UTF_8)))
                        .header("X-Emp-No", ADMIN))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");

        assertEquals(res.getContentAsString(), 400, res.getStatus());
        assertTrue(res.getContentAsString(), res.getContentAsString().contains("row 3"));
        assertEquals(0, (int) jdbc.queryForObject("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=?", Integer.class, INST));
        assertEquals(0, (int) jdbc.queryForObject("SELECT COUNT(*) FROM INST_PLAN_ITEM WHERE INSTITUTION_ID=?", Integer.class, INST));
        assertEquals("실패 감사는 커밋된 채 남는다", 1, (int) jdbc.queryForObject(
                "SELECT COUNT(*) FROM INST_PLAN_ACT WHERE INSTITUTION_ID=? AND ACTION_CD='IMPORT' AND OUTCOME='INVALID'",
                Integer.class, INST));
    }
}
