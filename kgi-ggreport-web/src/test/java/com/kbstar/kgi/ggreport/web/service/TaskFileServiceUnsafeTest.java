package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.TaskContext;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 업로드 거부(rejectUnsafe)가 <b>디스크에 손대기 전에</b> 일어나는지(NEXT 106, security S1).
 * 거부해도 같은 이름의 이전 파일이 그대로 남아야 한다. DB·Spring 없이 서비스만 본다.
 */
public class TaskFileServiceUnsafeTest {

    private static final String TID = "task-unsafe01";
    private static final String INST = "가상구";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private AppProperties properties;
    private TaskMapper tasks;
    private DocCheckService docChecks;

    @Before
    public void setUp() throws IOException {
        TaskContext ctx = new TaskContext();
        ctx.setTaskId(TID);
        ctx.setInstitutionName(INST);
        ctx.setInstitutionId("inst-x");
        ctx.setAssignee("가상담당");
        ctx.setTeam("영업");
        ctx.setStatus("작성중");
        tasks = mock(TaskMapper.class);
        when(tasks.selectContext(anyString())).thenReturn(ctx);
        properties = new AppProperties();
        properties.setOutputRoot(tmp.getRoot().getAbsolutePath());
        docChecks = mock(DocCheckService.class);
        TaskFiles.save(properties.getOutputRoot(), INST, TID, "a.pptx", "OLD".getBytes(StandardCharsets.UTF_8));
    }

    private String disk() throws IOException {
        File f = TaskFiles.resolve(properties.getOutputRoot(), INST, TID, "a.pptx");
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void 매크로가_든_파일은_400이고_이전_파일이_그대로다() throws IOException {
        when(docChecks.extract(anyString(), any(byte[].class))).thenReturn(TaskDocExtractor.Extracted.none("ACTIVE_CONTENT"));
        TaskFileService s = new TaskFileService(tasks, properties, docChecks, true);
        try {
            s.save(TID, "가상담당", "a.pptx", "NEW".getBytes(StandardCharsets.UTF_8));
            fail("거부되어야 한다");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
        }
        assertEquals("OLD", disk());
        verify(docChecks, never()).record(any(), anyString(), any(), any(byte[].class), any());
    }

    @Test
    public void 점검을_못_끝냈으면_닫는_쪽으로_503이고_이전_파일이_그대로다() throws IOException {
        when(docChecks.extract(anyString(), any(byte[].class))).thenReturn(TaskDocExtractor.Extracted.none("BUSY"));
        TaskFileService s = new TaskFileService(tasks, properties, docChecks, true);
        try {
            s.save(TID, "가상담당", "a.pptx", "NEW".getBytes(StandardCharsets.UTF_8));
            fail("거부되어야 한다");
        } catch (ApiException e) {
            assertEquals(503, e.getStatus());
        }
        assertEquals("OLD", disk());
    }

    @Test
    public void 거부_스위치가_꺼져_있으면_저장하고_기록을_한_번_부른다() throws IOException {
        when(docChecks.extract(anyString(), any(byte[].class))).thenReturn(TaskDocExtractor.Extracted.none("ACTIVE_CONTENT"));
        TaskFileService s = new TaskFileService(tasks, properties, docChecks, false);
        s.save(TID, "가상담당", "a.pptx", "NEW".getBytes(StandardCharsets.UTF_8));
        assertEquals("NEW", disk());
        verify(docChecks, times(1)).record(any(), anyString(), any(), any(byte[].class), any());
    }
}
