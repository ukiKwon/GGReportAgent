package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.HandoffResponse;
import com.kbstar.kgi.ggreport.web.dto.HandoffTeam;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 이관 패키지의 <b>부분 실패 격리</b> — 2026-08-28 커밋 보안 리뷰(경로 가드 처리
 * 비대칭) 지적을 받아 넣었다.
 *
 * <p><b>취약점은 아니었다</b> — {@code TaskFiles.taskDir} 의 두 겹 가드는 이 경로에서도
 * 그대로 돌아 탈출을 막는다. 문제는 <b>걸렸을 때의 처리</b>였다: 팀 한 줄의
 * {@code taskId} 가 가드에 걸리면 예외가 위로 올라가 <b>응답 전체가 500</b> 이 되고,
 * 디자이너는 <b>다른 팀 산출물까지 못 본다.</b> 이관 패키지가 통째로 비면 "아직 아무도
 * 안 올렸다"로 보이고 원인은 화면 어디에도 안 나온다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는다 — 이상한 {@code taskId} 를 DB 에 넣을 수 없으므로
 * ({@code Ids.task()} 가 만든다) 매퍼를 가짜로 세워야만 이 갈래를 밟을 수 있다.
 */
public class HandoffFileGuardTest {

    private TaskMapper tasks;
    private HandoffService service;

    @Before
    public void setUp() {
        tasks = mock(TaskMapper.class);

        TaskContext ctx = new TaskContext();
        ctx.setTaskId("task-aaaaaaaa");
        ctx.setTeam("디자이너");
        ctx.setBidCaseId("bc-aaaaaaaa");
        ctx.setInstitutionId("nowon");
        ctx.setInstitutionName("노원구");
        ctx.setStage(6);
        when(tasks.selectContext(anyString())).thenReturn(ctx);

        NotificationMapper notifications = mock(NotificationMapper.class);
        when(notifications.selectDistinctRecipients()).thenReturn(Collections.emptyList());

        InstitutionMapper institutions = mock(InstitutionMapper.class);
        when(institutions.selectById(anyString())).thenReturn(null);

        AppProperties properties = new AppProperties();
        properties.setOutputRoot("data/report_new");

        service = new HandoffService(tasks, institutions, notifications,
                new JsonFiles(), properties);
    }

    private static HandoffTeam team(String name, String taskId) {
        HandoffTeam row = new HandoffTeam();
        row.setTeam(name);
        row.setTaskId(taskId);
        row.setStatus("작성중");
        return row;
    }

    /**
     * ⚠️ 이 테스트가 이 클래스의 이유다. {@code ../..} 는 가드에 걸리는데, 그 한 줄이
     * <b>나머지 팀까지 죽이면 안 된다.</b>
     */
    @Test
    public void 한_팀의_경로가_가드에_걸려도_나머지_팀은_그대로_온다() {
        when(tasks.selectHandoffTeams(anyString(), anyString())).thenReturn(
                new ArrayList<>(Arrays.asList(
                        team("영업", "task-11111111"),
                        team("전산", "../../etc"),          // 가드에 걸리는 값
                        team("예산", "task-33333333"))));

        HandoffResponse out = service.of("task-aaaaaaaa");

        List<String> names = new ArrayList<>();
        for (HandoffTeam row : out.getTeams()) {
            names.add(row.getTeam());
        }
        assertEquals("세 팀이 모두 실려야 한다 — 한 줄이 전체를 죽이면 안 된다",
                Arrays.asList("영업", "전산", "예산"), names);

        for (HandoffTeam row : out.getTeams()) {
            assertTrue(row.getTeam() + " 의 첨부 목록이 null 이다 — 화면이 깨진다",
                    row.getFiles() != null);
        }
        assertTrue("가드에 걸린 팀은 빈 목록이어야 한다",
                out.getTeams().get(1).getFiles().isEmpty());
    }

    /** 격리는 첨부 목록에만 적용된다 — 나머지 필드는 그대로 채워져야 한다. */
    @Test
    public void 가드에_걸린_팀도_문의처와_상태는_실린다() {
        when(tasks.selectHandoffTeams(anyString(), anyString())).thenReturn(
                new ArrayList<>(Collections.singletonList(team("전산", ".."))));

        HandoffResponse out = service.of("task-aaaaaaaa");

        HandoffTeam row = out.getTeams().get(0);
        assertEquals("전산팀", row.getContact());
        assertTrue("아직 결재 전이므로 working 이어야 한다", row.isWorking());
        assertEquals(Collections.singletonList("전산"), out.getWaitingOn());
    }

    /** 에이전트 단계는 애초에 목록에 안 들어간다 — 격리 이전 단계에서 걸러진다. */
    @Test
    public void 에이전트_단계는_격리_대상도_아니다() {
        when(tasks.selectHandoffTeams(anyString(), anyString())).thenReturn(
                new ArrayList<>(Arrays.asList(
                        team("RFI분석", "../나쁜값"),
                        team("영업", "task-11111111"))));

        HandoffResponse out = service.of("task-aaaaaaaa");

        assertEquals(1, out.getTeams().size());
        assertEquals("영업", out.getTeams().get(0).getTeam());
    }
}
