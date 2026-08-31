package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * 기관 CSV 반입 — Task 5B.5. {@code POST /institutions/import}.
 *
 * <p>골든에 없는 경로라 <b>계약 테스트</b>로 고정한다.
 *
 * <p>여기서 지키는 것은 셋이다 — <b>upsert 의미론</b>(같은 표를 다시 올리는 것이
 * 정상), <b>빈 칸은 기존 값을 덮지 않는다</b>, <b>표 전체가 한 트랜잭션</b>.
 * 셋 다 틀려도 예외가 안 나서 실행으로는 못 찾는다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionImportApiTest {

    private static final String HEADER = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일";

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    private MockHttpServletResponse upload(byte[] csv) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(multipart("/institutions/import")
                        .file(new MockMultipartFile("file", "표.csv", "text/csv", csv)))
                .andReturn().getResponse();
        response.setCharacterEncoding("UTF-8");
        return response;
    }

    private JsonNode imported(String csv) throws Exception {
        MockHttpServletResponse res = upload(csv.getBytes(StandardCharsets.UTF_8));
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        return json.readTree(res.getContentAsString());
    }

    private JsonNode institution(String id) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(get("/institutions/" + id))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return json.readTree(res.getContentAsString());
    }

    // ---------------------------------------------------------------- 기본

    @Test
    public void 표를_올리면_행_수와_id_목록을_돌려준다() throws Exception {
        JsonNode out = imported(HEADER + "\n"
                + "반입가구청,자치구,11110,3,2024-01-01,2027-01-01\n"
                + "반입나구청,시청,11120,4,2023-05-05,2027-05-05\n");

        assertEquals(2, out.path("imported").asInt());
        assertEquals(2, out.path("institution_ids").size());
        assertTrue(out.path("institution_ids").get(0).asText().matches("new-[0-9a-f]{8}"));
    }

    /**
     * ⚠️ <b>같은 표를 다시 올리는 것이 정상 경로다.</b> 이름으로 찾아 갱신하므로 행이
     * 두 배가 되면 안 되고, id 도 그대로여야 한다 — 새 id 를 발급하면 기존 입찰건·
     * 작업이 붙어 있던 기관과 끊긴다.
     */
    @Test
    public void 같은_표를_다시_올리면_새로_만들지_않고_갱신한다() throws Exception {
        String csv = HEADER + "\n재반입구청,자치구,11130,3,2024-02-02,2027-02-02\n";

        String first = imported(csv).path("institution_ids").get(0).asText();
        JsonNode second = imported(csv);

        assertEquals("재반입도 행 수는 그대로 센다", 1, second.path("imported").asInt());
        assertEquals("같은 이름은 같은 id 여야 한다",
                first, second.path("institution_ids").get(0).asText());
    }

    /**
     * ⚠️ <b>빈 칸은 "안 보낸 것"이지 "지움"이 아니다.</b> 덮어쓰면 반입할수록 데이터가
     * 줄어든다 — 부분만 채운 표를 올리는 것이 흔한 사용이기 때문이다.
     * (손편집 {@code PUT} 이 빈 문자열을 "지움"으로 보는 것과 <b>일부러 다르다</b>.)
     */
    @Test
    public void 빈_칸은_기존_값을_덮지_않는다() throws Exception {
        String id = imported(HEADER + "\n보존반입구청,자치구,11140,3,2024-03-03,2027-03-03\n")
                .path("institution_ids").get(0).asText();

        imported(HEADER + "\n보존반입구청,,,,,\n");

        JsonNode after = institution(id);
        assertEquals("자치구", after.path("type").asText());
        assertEquals("11140", after.path("region_code").asText());
        assertEquals(3, after.path("term").asInt());
    }

    @Test
    public void 채워_보낸_칸만_갱신된다() throws Exception {
        String id = imported(HEADER + "\n갱신반입구청,자치구,11150,3,,\n")
                .path("institution_ids").get(0).asText();

        imported(HEADER + "\n갱신반입구청,시청,,,,\n");

        JsonNode after = institution(id);
        assertEquals("시청", after.path("type").asText());
        assertEquals("보내지 않은 칸은 그대로", "11150", after.path("region_code").asText());
    }

    // ---------------------------------------------------------------- 인코딩

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> 이 표는 사람이 한국어 윈도우 엑셀에서
     * "CSV로 저장"해 만드는데 그 결과가 {@code cp949} 인 경우가 흔하다. UTF-8 만 읽으면
     * 한글 기관명이 깨진 채 반입되고, <b>이름이 upsert 키라서 중복 기관이 조용히
     * 생긴다</b>(오류가 안 난다).
     */
    @Test
    public void cp949로_저장된_표도_읽는다() throws Exception {
        Charset cp949 = Charset.forName(Charset.isSupported("x-windows-949") ? "x-windows-949" : "EUC-KR");
        byte[] csv = (HEADER + "\n인코딩구청,자치구,11160,3,,\n").getBytes(cp949);

        MockHttpServletResponse res = upload(csv);
        assertEquals(200, res.getStatus());

        String id = json.readTree(res.getContentAsString())
                .path("institution_ids").get(0).asText();
        assertEquals("인코딩구청", institution(id).path("name_ko").asText());
    }

    /** BOM 이 남으면 첫 헤더가 {@code "﻿기관명"} 이 되어 이름 열을 통째로 못 찾는다. */
    @Test
    public void UTF8_BOM이_붙어_있어도_헤더를_찾는다() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
        out.write((HEADER + "\nBOM구청,자치구,11170,3,,\n").getBytes(StandardCharsets.UTF_8));

        MockHttpServletResponse res = upload(out.toByteArray());
        assertEquals(200, res.getStatus());
        assertEquals("BOM구청", institution(json.readTree(res.getContentAsString())
                .path("institution_ids").get(0).asText()).path("name_ko").asText());
    }

    // ---------------------------------------------------------------- 실패

    /**
     * ⚠️ <b>표 전체가 한 트랜잭션이다.</b> 반쯤 반입된 표는 무엇이 들어갔는지 사람이
     * 알 수 없어 다시 올리는 것 말고는 복구 방법이 없다.
     */
    @Test
    public void 한_행이_깨지면_앞_행도_들어가지_않는다() throws Exception {
        MockHttpServletResponse res = upload((HEADER + "\n"
                + "롤백가구청,자치구,11180,3,,\n"
                + "롤백나구청,자치구,11190,셋,,\n").getBytes(StandardCharsets.UTF_8));

        assertEquals(400, res.getStatus());
        assertTrue("사유에 몇 번째 행인지가 있어야 사람이 고칠 수 있다: " + res.getContentAsString(),
                json.readTree(res.getContentAsString()).path("detail").asText().contains("row 2"));

        mockMvc.perform(get("/institutions"))
                .andExpect(jsonPath("$[?(@.name_ko == '롤백가구청')]").isEmpty());
    }

    /** 이름은 upsert 키다 — 없으면 무엇을 갱신할지 정할 수 없다. */
    @Test
    public void 기관명이_빈_행은_400이다() throws Exception {
        MockHttpServletResponse res = upload((HEADER + "\n,자치구,11200,3,,\n")
                .getBytes(StandardCharsets.UTF_8));

        assertEquals(400, res.getStatus());
        assertTrue(json.readTree(res.getContentAsString()).path("detail").asText().contains("row 1"));
    }

    @Test
    public void 헤더만_있는_표는_0건이다() throws Exception {
        JsonNode out = imported(HEADER + "\n");
        assertEquals(0, out.path("imported").asInt());
        assertEquals(0, out.path("institution_ids").size());
    }

    /** 엑셀이 끝에 붙이는 빈 줄을 행으로 세면 "기관명이 빈 행"이 되어 통째로 400 이 된다. */
    @Test
    public void 끝에_붙은_빈_줄은_행으로_세지_않는다() throws Exception {
        assertEquals(1, imported(HEADER + "\n빈줄구청,자치구,11210,3,,\n\n")
                .path("imported").asInt());
    }

    /** 따옴표 안의 쉼표는 칸 구분이 아니다 — 기관명에 쉼표가 들어가면 열이 밀린다. */
    @Test
    public void 따옴표_안의_쉼표는_칸을_나누지_않는다() throws Exception {
        String id = imported(HEADER + "\n\"따옴표,구청\",자치구,11220,3,,\n")
                .path("institution_ids").get(0).asText();

        JsonNode made = institution(id);
        assertEquals("따옴표,구청", made.path("name_ko").asText());
        assertEquals("열이 밀리면 여기가 어긋난다", "자치구", made.path("type").asText());
    }
}
