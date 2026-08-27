package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.Account;
import com.kbstar.kgi.ggreport.web.dto.AccountsResponse;
import com.kbstar.kgi.ggreport.web.dto.AssigneeTeam;
import com.kbstar.kgi.ggreport.web.mapper.NotificationMapper;
import com.kbstar.kgi.ggreport.web.mapper.TaskMapper;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 계정 목록 — 데모 화면의 계정 전환기가 쓴다. Python {@code server/routers/accounts.py}.
 *
 * <p>목록을 코드에 박지 않고 <b>실데이터에서 뽑는다</b>. 그래야 데모 데이터를 고쳐도
 * 목록이 따라오고, 빈 운영 DB 에서는 자동으로 비어(전환기도 숨는다) 엉뚱한 신원이
 * 생기지 않는다.
 *
 * <ul>
 *   <li><b>사람</b>: {@code TASKS.ASSIGNEE}(담당이 정해진 작업)</li>
 *   <li><b>역할</b>: {@code NOTIFICATIONS.RECIPIENT} 중 사람 이름이 아닌 것
 *       (영업팀·디자이너 등). 시스템 알림은 사람이 아니라 역할 앞으로 오기 때문에
 *       이쪽도 계정이 되어야 그 역할의 쪽지함을 볼 수 있다.</li>
 * </ul>
 */
@Service
public class AccountService {

    private final TaskMapper taskMapper;
    private final NotificationMapper notificationMapper;
    private final AppProperties properties;

    public AccountService(TaskMapper taskMapper, NotificationMapper notificationMapper,
                          AppProperties properties) {
        this.taskMapper = taskMapper;
        this.notificationMapper = notificationMapper;
        this.properties = properties;
    }

    public AccountsResponse accounts() {
        List<AssigneeTeam> raw = taskMapper.selectAssigneeTeams();
        List<String> recipients = notificationMapper.selectDistinctRecipients();

        List<Account> accounts = new ArrayList<>();
        Set<String> names = new HashSet<>();
        for (AssigneeTeam row : raw) {
            // 팀명→쪽지 수신자 변환은 서버가 한다(Teams.inboxName) — 화면이
            // '영업'+'팀' 규칙을 복제하면 계정 전환기와 답이 갈라진다.
            accounts.add(new Account(row.getAssignee(),
                    Teams.inboxName(row.getTeam(), recipients)));
            names.add(row.getAssignee());
        }
        for (String recipient : recipients) {
            // 사람 이름 앞으로 온 쪽지는 역할이 아니다.
            if (!names.contains(recipient)) {
                accounts.add(new Account(null, recipient));
            }
        }
        return new AccountsResponse(properties.isDemo(), accounts);
    }
}
