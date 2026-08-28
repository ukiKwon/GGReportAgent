package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 작업함 API — Task 5B.1. 첨부 4종 + 작업 상세.
 *
 * <p>골든에 이 경로들의 응답이 없다(캡처 대상이 아니었다). 그래서 <b>계약 테스트</b>로
 * 고정한다 — 상태코드·본문 키·오류 모양, 그리고 <b>경로 탈출 거부</b>.
 *
 * <p>없는 작업만 상대한다: 실제 업로드 흐름은 공고·작업 데이터가 필요한데 그건
 * {@code GoldenWriteScenarioTest} 가 순서대로 만든다. 여기서 같은 데이터를 또 만들면
 * 이 클래스가 {@code @Transactional} 이 아니라 <b>다른 테스트의 빈 상태 기대를 깨뜨린다</b>
 * (2026-08-28 대화 테스트에서 실제로 겪은 일이다).
 */
@RunWith(SpringRunner.class)
@AppTest
public class TaskFilesApiTest {

    @Autowired
    private MockMvc mockMvc;

    private static final String MISSING = "task-00000000";

    @Test
    public void 없는_작업의_상세는_404다() throws Exception {
        mockMvc.perform(get("/tasks/" + MISSING))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("task not found"));
    }

    @Test
    public void 없는_작업의_첨부목록은_404다() throws Exception {
        mockMvc.perform(get("/tasks/" + MISSING + "/files"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("task not found"));
    }

    /**
     * ⚠️ 없는 작업이면 <b>파일 시스템에 손대기 전에</b> 404 여야 한다. 순서가 뒤집히면
     * 존재하지 않는 작업 이름으로 폴더가 생긴다.
     */
    @Test
    public void 없는_작업에_올리면_404다() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "제안서.pptx", MediaType.APPLICATION_OCTET_STREAM_VALUE,
                "본문".getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/tasks/" + MISSING + "/files").file(file)
                        .param("by", "최 디자이너")
                        .header("X-User-Id", "designer"))
                .andExpect(status().isNotFound());
    }

    @Test
    public void 없는_작업의_파일을_지우면_404다() throws Exception {
        mockMvc.perform(delete("/tasks/" + MISSING + "/files/제안서.pptx")
                        .param("by", "최 디자이너")
                        .header("X-User-Id", "designer"))
                .andExpect(status().isNotFound());
    }

    /**
     * {@code X-User-Id} 는 필수다 — 누가 한 요청인지가 담당으로 그대로 박히므로
     * 익명으로 진행되지 않는다.
     */
    @Test
    public void 삭제에_사용자_헤더가_없으면_400이다() throws Exception {
        mockMvc.perform(delete("/tasks/" + MISSING + "/files/제안서.pptx"))
                .andExpect(status().isBadRequest());
    }

    /**
     * 오류 본문 모양이 계약이다 — 화면이 {@code detail} 키를 읽는다.
     * Spring 기본 오류 본문으로 나가면 문구가 빈다.
     */
    @Test
    public void 오류_본문은_detail_키를_쓴다() throws Exception {
        mockMvc.perform(get("/tasks/" + MISSING + "/files"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.detail").exists());
    }

    /**
     * 없는 파일은 404. 내려받기 경로가 존재하고 400 이 아니라는 것도 여기서 확인된다
     * (경로 매핑 오타를 잡는 자리다).
     *
     * <p>⚠️ <b>이 404 응답에도 {@code Content-Disposition} 이 붙는다 — 우리가 단 것이
     * 아니다.</b> 경로 마지막 조각이 {@code 제안서.pptx} 라 확장자가 있어 보이고,
     * Spring MVC 가 RFD(Reflected File Download) 공격 방어로
     * {@code inline;filename=f.txt} 를 붙인다
     * ({@code AbstractMessageConverterMethodProcessor#addContentDispositionHeader}).
     * 처음엔 "헤더가 없어야 한다"고 단정했다가 이 테스트가 실패해서 알았다. 방어가
     * 맞으므로 코드가 아니라 기대를 고쳤고, 대신 <b>실제로 확인해야 할 것</b>을 본다:
     * 파일을 못 찾았는데 <b>첨부(attachment)로 내려보내지는 않는다.</b>
     */
    @Test
    public void 없는_파일을_내려받으면_404고_첨부로_나가지_않는다() throws Exception {
        mockMvc.perform(get("/tasks/" + MISSING + "/files/제안서.pptx"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").exists())
                .andExpect(result -> {
                    String disposition =
                            result.getResponse().getHeader("Content-Disposition");
                    if (disposition != null && disposition.contains("attachment")) {
                        throw new AssertionError(
                                "실패 응답이 첨부로 나가면 안 된다: " + disposition);
                    }
                });
    }
}
