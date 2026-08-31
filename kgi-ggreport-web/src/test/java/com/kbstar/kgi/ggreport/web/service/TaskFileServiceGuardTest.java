package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 첨부 4종이 경로 가드에 걸렸을 때 <b>같은 모양으로 실패하는지</b> — 2026-08-28 커밋
 * 보안 리뷰 지적(처리 비대칭).
 *
 * <p>가드 자체는 {@code TaskFilesTest} 가 본다. 여기서 보는 것은 <b>서비스가 그 예외를
 * 무엇으로 바꾸는가</b>다. 예전에는 {@code listing} 만 안 잡아서, 같은 원인이 업로드
 * 에서는 400, 목록에서는 <b>500</b>(스택 트레이스가 나가고 화면에는 사유가 안 남는다)
 * 으로 갈렸다.
 *
 * <p>이상한 기관명은 DB 에 넣어서는 만들 수 없어(정상 시드는 멀쩡하다) 매퍼를 가짜로
 * 세운다. CSV 반입 경로가 있어 <b>기관명은 신뢰 대상이 아니라는</b> 것이
 * {@code TaskFiles} 가 밝힌 전제다.
 */
public class TaskFileServiceGuardTest {

    private TaskFileService service;

    @Before
    public void setUp() {
        TaskContext ctx = new TaskContext();
        ctx.setTaskId("task-aaaaaaaa");
        ctx.setInstitutionName("../탈출을노린기관명");

        TaskMapper tasks = mock(TaskMapper.class);
        when(tasks.selectContext(anyString())).thenReturn(ctx);

        AppProperties properties = new AppProperties();
        properties.setOutputRoot("data/report_new");

        service = new TaskFileService(tasks, properties);
    }

    @Test
    public void 목록도_400이다() {
        try {
            service.listing("task-aaaaaaaa");
            fail("경로 가드에 걸려야 한다");
        } catch (ApiException expected) {
            assertEquals("업로드·내려받기와 같은 400 이어야 한다", 400, expected.getStatus());
        }
    }

    @Test
    public void 내려받기도_400이다() {
        try {
            service.resolve("task-aaaaaaaa", "제안서.pptx");
            fail("경로 가드에 걸려야 한다");
        } catch (ApiException expected) {
            assertEquals(400, expected.getStatus());
        }
    }

    @Test
    public void 삭제도_400이다() {
        try {
            service.remove("task-aaaaaaaa", "최 디자이너", "제안서.pptx");
            fail("경로 가드에 걸려야 한다");
        } catch (ApiException expected) {
            assertEquals(400, expected.getStatus());
        }
    }

    @Test
    public void 업로드도_400이다() {
        try {
            service.save("task-aaaaaaaa", "최 디자이너", "제안서.pptx", new byte[]{1, 2, 3});
            fail("경로 가드에 걸려야 한다");
        } catch (ApiException expected) {
            assertEquals(400, expected.getStatus());
        }
    }
}
