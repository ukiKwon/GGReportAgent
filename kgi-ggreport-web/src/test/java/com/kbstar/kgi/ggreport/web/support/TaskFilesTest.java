package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.dto.TaskFileEntry;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 첨부 파일의 <b>경로 위생</b>을 고정한다 — Task 5B.1 에서 가장 위험한 부분이다.
 *
 * <p>클라이언트가 준 파일명으로 디스크에 쓰는 코드다. 원본이 이 규칙을 순수 함수로
 * 떼어 따로 고정해 둔 이유가 그것이고({@code server/tests/test_task_files.py}),
 * 이관본도 같은 자리에 같은 그물을 둔다.
 */
public class TaskFilesTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private static final String INSTITUTION = "노원구";
    private static final String TASK_ID = "task-1234abcd";

    private String root() {
        return temp.getRoot().getAbsolutePath();
    }

    // ── safeName ──────────────────────────────────────────────────────

    @Test
    public void 경로_성분을_떼어낸다() {
        assertEquals("제안서.pptx", TaskFiles.safeName("../../etc/제안서.pptx"));
    }

    /**
     * ⚠️ 역슬래시도 자른다. {@code File#getName()} 은 <b>실행 중인 OS 의 구분자</b>만
     * 자르므로, 리눅스에서 돌면 {@code C:\x\a.pptx} 가 통째로 파일명이 된다.
     */
    @Test
    public void 윈도우_구분자도_자른다() {
        assertEquals("a.pptx", TaskFiles.safeName("C:\\Users\\x\\a.pptx"));
    }

    @Test
    public void 허용하지_않는_확장자는_거부한다() {
        for (String bad : new String[]{"x.exe", "x.sh", "x.bat", "확장자없음"}) {
            try {
                TaskFiles.safeName(bad);
                fail("거부해야 한다: " + bad);
            } catch (TaskFiles.FileRejected expected) {
                assertTrue("사유에 가능한 형식이 보여야 한다",
                        expected.getMessage().contains(".pptx"));
            }
        }
    }

    @Test
    public void 숨김파일과_빈_이름은_거부한다() {
        for (String bad : new String[]{".hidden.pdf", "", "  ", ".", ".."}) {
            try {
                TaskFiles.safeName(bad);
                fail("거부해야 한다: '" + bad + "'");
            } catch (TaskFiles.FileRejected expected) {
                // 사유는 사람이 읽고 고칠 수 있으면 된다
            }
        }
    }

    // ── taskDir ───────────────────────────────────────────────────────

    /**
     * ⚠️ 조각 검사가 왜 따로 필요한가. {@code taskId} 가 {@code ../..} 이면 최종 경로가
     * 뿌리 <b>안쪽</b>(다른 기관 폴더)에 떨어져 "뿌리 밖인가" 검사만으로는 통과한다.
     * 두 겹이어야 막힌다.
     */
    @Test
    public void 조각에_경로_구분자나_점점이_있으면_거부한다() {
        String[][] bad = {
                {INSTITUTION, ".."},
                {INSTITUTION, "../other"},
                {"..", TASK_ID},
                {"a/b", TASK_ID},
                {INSTITUTION, "a\\b"},
                {"", TASK_ID},
        };
        for (String[] pair : bad) {
            try {
                TaskFiles.taskDir(root(), pair[0], pair[1]);
                fail("거부해야 한다: " + pair[0] + " / " + pair[1]);
            } catch (IllegalArgumentException expected) {
                // 기대한 거부
            }
        }
    }

    @Test
    public void 저장_위치는_기관_design_작업id다() {
        File dir = TaskFiles.taskDir(root(), INSTITUTION, TASK_ID);
        File expected = new File(new File(new File(temp.getRoot(), INSTITUTION), "design"), TASK_ID);
        assertEquals(expected.getAbsolutePath(), dir.getAbsolutePath());
    }

    // ── save / listing / resolve / remove ─────────────────────────────

    private TaskFileEntry put(String name, String body) throws IOException {
        return TaskFiles.save(root(), INSTITUTION, TASK_ID, name,
                body.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void 저장하고_목록에서_보인다() throws IOException {
        TaskFileEntry saved = put("제안서.pptx", "본문");

        assertEquals("제안서.pptx", saved.getName());
        assertEquals(6, saved.getSize());          // "본문" = UTF-8 6바이트
        assertFalse("처음 저장은 덮어쓴 것이 아니다", saved.isReplaced());
        assertTrue("시각이 다른 기록과 같은 모양이어야 한다",
                saved.getUploadedAt().endsWith("+00:00"));

        List<TaskFileEntry> rows = TaskFiles.listing(root(), INSTITUTION, TASK_ID);
        assertEquals(1, rows.size());
        assertEquals("제안서.pptx", rows.get(0).getName());
    }

    /** 덮어쓰기는 허용하되 <b>조용히</b> 하지 않는다 — 화면이 알려줄 수 있어야 한다. */
    @Test
    public void 같은_이름을_다시_올리면_replaced로_알린다() throws IOException {
        put("제안서.pptx", "1차");
        TaskFileEntry again = put("제안서.pptx", "2차");

        assertTrue(again.isReplaced());
        assertEquals("덮어썼으므로 하나만 남는다",
                1, TaskFiles.listing(root(), INSTITUTION, TASK_ID).size());
    }

    @Test
    public void 폴더가_없으면_빈_목록이다() {
        // 없는 것은 오류가 아니다 — 아직 아무것도 안 올린 작업이 정상 상태다.
        assertTrue(TaskFiles.listing(root(), INSTITUTION, "task-없는것").isEmpty());
    }

    @Test
    public void 목록은_이름순이다() throws IOException {
        put("b.pdf", "b");
        put("a.pdf", "a");
        put("c.pdf", "c");

        List<TaskFileEntry> rows = TaskFiles.listing(root(), INSTITUTION, TASK_ID);
        assertEquals("a.pdf", rows.get(0).getName());
        assertEquals("b.pdf", rows.get(1).getName());
        assertEquals("c.pdf", rows.get(2).getName());
    }

    @Test
    public void 지우면_true_없으면_false다() throws IOException {
        put("제안서.pptx", "본문");

        assertTrue(TaskFiles.remove(root(), INSTITUTION, TASK_ID, "제안서.pptx"));
        assertFalse(TaskFiles.remove(root(), INSTITUTION, TASK_ID, "제안서.pptx"));
        assertTrue(TaskFiles.listing(root(), INSTITUTION, TASK_ID).isEmpty());
    }

    /** 내려받기·삭제도 <b>저장 때와 같은 규칙</b>으로 이름을 씻는다. */
    @Test
    public void 내려받기_이름도_다시_씻는다() throws IOException {
        put("제안서.pptx", "본문");

        File resolved = TaskFiles.resolve(root(), INSTITUTION, TASK_ID, "../제안서.pptx");
        assertTrue(resolved.isFile());
        assertEquals(TaskFiles.taskDir(root(), INSTITUTION, TASK_ID).getAbsolutePath(),
                resolved.getParentFile().getAbsolutePath());
    }

    @Test
    public void 너무_큰_파일은_거부한다() {
        byte[] tooBig = new byte[(int) TaskFiles.MAX_BYTES + 1];
        try {
            TaskFiles.save(root(), INSTITUTION, TASK_ID, "큰것.zip", tooBig);
            fail("거부해야 한다");
        } catch (TaskFiles.FileRejected expected) {
            assertTrue(expected.getMessage().contains("50MB"));
        } catch (IOException io) {
            fail("IO 오류가 아니라 거부여야 한다: " + io);
        }
    }
}
