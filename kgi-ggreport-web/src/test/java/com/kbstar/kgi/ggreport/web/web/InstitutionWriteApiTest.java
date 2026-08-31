package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 기관 쓰기 — Task 5B.5 의 앞쪽 둘. {@code POST /institutions} · {@code PUT /institutions/{id}}.
 *
 * <p>골든에 이 경로들의 응답이 없다(캡처 대상이 아니었다). 그래서 골든 비교가 아니라
 * <b>계약 테스트</b>로 고정한다 — 상태코드 · 본문 키 · 오류 모양.
 *
 * <p>⚠️ <b>{@code @Transactional} 로 롤백한다.</b> 여기서 만든 기관이 남으면
 * 기관 목록을 세는 테스트(골든 {@code 00}·{@code 01})가 실행 순서에 따라 깨진다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionWriteApiTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper json = new ObjectMapper();

    /**
     * ⚠️ <b>인코딩을 명시하지 않으면 한글이 깨져 비교가 통째로 어긋난다.</b>
     * 응답 바이트는 정상 UTF-8 인데 {@code getContentAsString()} 이 기본 문자셋으로
     * 읽는다 — 같은 함정이 {@code NotificationWriteApiTest}·{@code GoldenRunner} 에도
     * 적혀 있다. 이 프로젝트에서 한글 본문을 읽는 자리에는 항상 따라붙는다.
     */
    private MockHttpServletResponse create(String body) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post("/institutions")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
        response.setCharacterEncoding("UTF-8");
        return response;
    }

    private JsonNode created(String body) throws Exception {
        MockHttpServletResponse res = create(body);
        assertEquals(res.getContentAsString(), 201, res.getStatus());
        return json.readTree(res.getContentAsString());
    }

    // ---------------------------------------------------------------- 추가

    @Test
    public void 기관을_추가하면_201과_서버발급_id를_돌려준다() throws Exception {
        JsonNode made = created("{\"name_ko\":\"테스트구청\",\"region_code\":\"11999\","
                + "\"type\":\"자치구\",\"term\":3}");

        assertEquals("테스트구청", made.path("name_ko").asText());
        assertEquals("11999", made.path("region_code").asText());
        assertEquals(3, made.path("term").asInt());
        assertTrue("id 모양이 원본(new-token_hex(4))과 다르다: " + made.path("institution_id"),
                made.path("institution_id").asText().matches("new-[0-9a-f]{8}"));
        assertEquals("새 기관은 stage 1 로 시작한다", 1, made.path("stage").asInt());
    }

    @Test
    public void 추가한_기관이_목록과_상세에_바로_보인다() throws Exception {
        String id = created("{\"name_ko\":\"보이는구청\"}").path("institution_id").asText();

        mockMvc.perform(get("/institutions/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name_ko").value("보이는구청"));
    }

    /**
     * ⚠️ <b>이 테스트가 이 클래스의 이유다.</b> 같은 이름 재등록은 <b>409</b>이고,
     * CSV 반입({@code POST /import})의 upsert 와 <b>일부러 다르다</b> — 표를 다시
     * 올리는 것은 정상이지만 사람이 같은 이름을 다시 누르는 것은 실수다.
     * 이 비대칭을 "일관성"이라는 이유로 없애면 중복 기관이 조용히 쌓인다.
     */
    @Test
    public void 같은_이름을_다시_추가하면_409다() throws Exception {
        created("{\"name_ko\":\"중복구청\"}");

        MockHttpServletResponse again = create("{\"name_ko\":\"중복구청\"}");

        assertEquals(409, again.getStatus());
        assertTrue("사유에 어떤 이름이 걸렸는지가 있어야 사람이 바로 고친다: "
                        + again.getContentAsString(),
                json.readTree(again.getContentAsString()).path("detail").asText()
                        .contains("중복구청"));
    }

    /** 앞뒤 공백은 이름의 일부가 아니다 — 그대로 두면 눈에 안 보이는 중복이 생긴다. */
    @Test
    public void 이름의_앞뒤_공백은_저장_전에_잘린다() throws Exception {
        assertEquals("공백구청", created("{\"name_ko\":\"  공백구청  \"}")
                .path("name_ko").asText());

        assertEquals("공백만 다른 이름은 같은 이름으로 걸려야 한다",
                409, create("{\"name_ko\":\"공백구청\"}").getStatus());
    }

    @Test
    public void 이름이_비어_있으면_400이다() throws Exception {
        assertEquals(400, create("{\"name_ko\":\"   \"}").getStatus());
        assertEquals(400, create("{}").getStatus());
    }

    // ---------------------------------------------------------------- 편집

    @Test
    public void 보내지_않은_필드는_보존된다() throws Exception {
        String id = created("{\"name_ko\":\"보존구청\",\"region_code\":\"11111\",\"term\":5}")
                .path("institution_id").asText();

        mockMvc.perform(put("/institutions/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"시청\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("시청"))
                .andExpect(jsonPath("$.region_code").value("11111"))
                .andExpect(jsonPath("$.term").value(5));
    }

    /**
     * ⚠️ <b>{@code null} 은 "지움"이고 미전송은 "보존"이다 — 둘을 같게 만들지 말 것.</b>
     * 원본이 예전에 {@code COALESCE} 라 둘을 구분하지 못했고, 그 탓에 {@code term}
     * (숫자)은 한 번 넣으면 <b>비울 방법이 아예 없었다.</b> 그 결함을 고친 뒤의
     * 의미론을 옮긴 것이다.
     *
     * <p>{@code COALESCE} 규칙은 CSV 반입 쪽({@code updateFromImport})에만 남는다.
     */
    @Test
    public void null로_보낸_필드는_지워진다() throws Exception {
        String id = created("{\"name_ko\":\"지움구청\",\"region_code\":\"12222\",\"term\":7}")
                .path("institution_id").asText();

        mockMvc.perform(put("/institutions/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":null,\"region_code\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.term").doesNotExist())
                .andExpect(jsonPath("$.region_code").doesNotExist());
    }

    /** 화면에서 입력칸을 비운 것이 곧 지우려는 뜻이다 — 빈 문자열도 지움으로 본다. */
    @Test
    public void 빈_문자열도_지움으로_본다() throws Exception {
        String id = created("{\"name_ko\":\"빈칸구청\",\"type\":\"자치구\"}")
                .path("institution_id").asText();

        mockMvc.perform(put("/institutions/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").doesNotExist());
    }

    /**
     * ⚠️ 아무 필드도 안 보내면 <b>UPDATE 를 돌리지 않는다.</b> 돌리면 MyBatis
     * {@code <set>} 이 비어 SQL 문법 오류가 난다 — 500 이 아니라 현재 값 200 이다.
     */
    @Test
    public void 빈_본문은_오류가_아니라_현재_값을_돌려준다() throws Exception {
        String id = created("{\"name_ko\":\"무변경구청\",\"type\":\"자치구\"}")
                .path("institution_id").asText();

        mockMvc.perform(put("/institutions/" + id)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name_ko").value("무변경구청"))
                .andExpect(jsonPath("$.type").value("자치구"));
    }

    /**
     * {@code stage} 는 편집 대상이 아니다 — 화면 편집이 진행 단계를 되돌리면
     * 워크플로가 이미 지난 노드를 다시 돌게 된다. 모델에 필드가 없어 조용히 무시된다.
     */
    @Test
    public void stage는_편집으로_바뀌지_않는다() throws Exception {
        String id = created("{\"name_ko\":\"단계구청\"}").path("institution_id").asText();

        mockMvc.perform(put("/institutions/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stage\":7,\"type\":\"시청\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value(1))
                .andExpect(jsonPath("$.type").value("시청"));
    }

    @Test
    public void 없는_기관을_편집하면_404다() throws Exception {
        mockMvc.perform(put("/institutions/new-deadbeef")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"시청\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("institution not found"));
    }

    /** 이름이 같아도 서로 다른 행이어야 한다 — id 는 매번 새로 발급된다. */
    @Test
    public void 서로_다른_기관은_서로_다른_id를_받는다() throws Exception {
        String a = created("{\"name_ko\":\"가구청\"}").path("institution_id").asText();
        String b = created("{\"name_ko\":\"나구청\"}").path("institution_id").asText();
        assertNotEquals(a, b);
    }
}
