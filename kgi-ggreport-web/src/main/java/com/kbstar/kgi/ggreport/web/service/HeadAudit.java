package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.InstHeadSettings;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionHeadMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 기관장 정보 행위 감사(INST_HEAD_ACT, 026) — 누가·어느 화면·어느 버튼·언제·어느 기관. {@link PrepAudit} 와 같은 모양이다.
 * 컨트롤러에는 트랜잭션이 없으므로 컨트롤러가 부른 기록은 서비스 실패와 무관하게 따로 커밋된다. 성공한 읽기는 응답 전에 기록한다(실패하면 500, 데이터 안 나감).
 * 본문·값·사유·이름·파일명은 기록하지 않는다. instId 가 null 이거나 형식 밖이면 'NONE'. ⚠️ 사번·화면·버튼은 모두 클라이언트 자기신고다.
 *
 * <p>하루 열람 경고(M8): 사번별 VIEW 계열(VIEW·PHOTO_VIEW·UNMATCHED_VIEW) 성공이 기준(기본 50)을 넘는 순간 앱 로그 WARN 한 번(값 없음) — 막지는 않는다.
 */
@Service
public class HeadAudit {

    private static final Logger LOG = LoggerFactory.getLogger(HeadAudit.class);
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final InstitutionHeadMapper mapper;
    private final InstHeadSettings settings;

    public HeadAudit(InstitutionHeadMapper mapper, InstHeadSettings settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    /** outcome: OK / DENIED / HIDDEN / BLOCKED / INVALID / BUSY / ERROR. */
    @Transactional
    public void record(String instId, Long headId, String action, String outcome, Long targetId, Actor actor,
                       BoardUiIds.Ui ui) {
        String inst = instId != null && InstitutionHeadService.validInstId(instId) ? instId : "NONE";
        String emp = actor != null && actor.isKnown() ? actor.getEmpNo() : null;
        mapper.insertAct(inst, headId, action, outcome, targetId, emp, actor != null && actor.isVerified() ? 1 : 0,
                ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, Times.nowIso());
        if (emp != null && "OK".equals(outcome) && isView(action)) {
            warnIfMany(emp);
        }
    }

    private void warnIfMany(String emp) {
        int limit = settings.getViewWarnPerDay();
        if (limit <= 0) {
            return;
        }
        String since = Times.iso(LocalDate.now(SEOUL).atStartOfDay(SEOUL).toInstant());   // 서울 날짜 0시(UTC 로 환산)
        int n = mapper.countViewsSince(emp, since);
        if (n == limit + 1) {
            LOG.warn("inst-head view threshold actor={} count={}", emp, n);   // 값(이름·기관)은 싣지 않는다
        }
    }

    private static boolean isView(String action) {
        return "VIEW".equals(action) || "PHOTO_VIEW".equals(action) || "UNMATCHED_VIEW".equals(action);
    }

    /** HTTP 상태 → 결과 코드. PrepAudit 규칙에 503 → BUSY 를 더한다. */
    public static String outcomeOf(int status) {
        if (status == 401 || status == 403) {
            return "DENIED";
        }
        if (status == 404) {
            return "HIDDEN";
        }
        if (status == 409) {
            return "BLOCKED";
        }
        if (status == 400 || status == 413 || status == 422) {
            return "INVALID";
        }
        if (status == 503) {
            return "BUSY";
        }
        return "ERROR";
    }
}
