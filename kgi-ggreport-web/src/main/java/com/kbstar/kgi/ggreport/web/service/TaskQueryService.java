package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.TaskListRow;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.TaskFiles;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 역할별 작업 목록 — <b>기관 횡단</b>이다. Python {@code routers/tasks.list_tasks}.
 *
 * <p>{@code team} 은 필수다 — 없이 열면 남의 작업까지 보이는 전체 조회가 된다
 * ({@code GET /notifications} 의 {@code recipient} 필수와 같은 이유).
 */
@Service
public class TaskQueryService {

    private final TaskMapper mapper;
    private final AppProperties properties;

    public TaskQueryService(TaskMapper mapper, AppProperties properties) {
        this.mapper = mapper;
        this.properties = properties;
    }

    public List<TaskListRow> listForTeam(String team, List<String> statuses) {
        List<TaskListRow> rows = mapper.selectListForTeam(team, statuses);
        for (TaskListRow row : rows) {
            row.setFileCount(fileCount(row.getInstitutionName(), row.getTaskId()));
        }
        return rows;
    }

    /**
     * 파일 수는 DB 가 아니라 파일 시스템에서 센다.
     *
     * <p>경로 조각이 이상하면({@code ..} 등) {@link TaskFiles} 가 예외를 던지는데,
     * <b>목록 조회 전체를 500 으로 만들지 않는다</b> — 한 행 때문에 작업함이 통째로
     * 안 열리는 것이 더 나쁘다. 그 행만 0으로 두고 나머지를 보여준다.
     */
    private int fileCount(String institutionName, String taskId) {
        try {
            return TaskFiles.count(properties.getOutputRoot(), institutionName, taskId);
        } catch (IllegalArgumentException e) {
            return 0;
        }
    }
}
