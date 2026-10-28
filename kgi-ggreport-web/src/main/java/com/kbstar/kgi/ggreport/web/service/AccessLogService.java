package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import com.kbstar.kgi.ggreport.web.mapper.AccessLogMapper;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 접근 이력 — 보안 감사 로그.
 *
 * <p><b>기록 규칙</b>: 본문·비밀번호·질의 값은 받지도 않는다(호출부가 경로만 넘긴다). 줄바꿈 등 제어 문자는
 * 공백으로 바꿔 로그 위조(줄 삽입)를 막고, 열 길이에 맞게 자른다.
 *
 * <p>⚠️ <b>{@code REQUIRES_NEW}</b> — 거부·실패 기록은 호출한 요청이 예외로 롤백돼도 <b>남아야</b> 한다.
 * 같은 트랜잭션에 묶으면 "막힌 시도"가 막힌 순간 함께 사라진다. 기록 실패는 요청을 깨뜨리지 않는다
 * (로그를 못 남겼다고 업무가 멈추면 안 된다 — 대신 서버 로그에 경고).
 */
@Service
public class AccessLogService {

    private static final Logger LOG = LoggerFactory.getLogger(AccessLogService.class);
    public static final int MAX_PAGE_SIZE = 200;

    private final AccessLogMapper mapper;

    public AccessLogService(AccessLogMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Actor actor, String eventType, String method, String path, Integer status,
                       String ip, String userAgent, Integer durationMs, String detail) {
        try {
            AccessLogEntry e = new AccessLogEntry();
            e.setOccurredAt(Times.nowIso());
            e.setEmpNo(actor == null ? null : actor.getEmpNo());
            e.setEmpVerified(actor != null && actor.isVerified());
            e.setEventType(eventType);
            e.setHttpMethod(clip(method, 10));
            e.setReqPath(clip(path, 300));
            e.setStatusCode(status);
            e.setClientIp(clip(ip, 64));
            e.setUserAgent(clip(userAgent, 200));
            e.setDurationMs(durationMs);
            e.setDetail(clip(detail, 300));
            mapper.insert(e);
        } catch (RuntimeException ex) {
            LOG.warn("접근 이력을 남기지 못했다: {} {}", eventType, ex.toString());
        }
    }

    /** 최신순. from/to 는 {@code YYYY-MM-DD}(없으면 무제한). */
    @Transactional(readOnly = true)
    public Page search(String from, String to, String empNo, String eventType, int page, int size) {
        int sz = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        int pg = Math.max(0, page);
        String f = isDay(from) ? from + "T00:00:00" : null;
        String t = isDay(to) ? to + "T23:59:59.999999" : null;
        String e = blank(empNo) ? null : empNo.trim();
        String ev = blank(eventType) ? null : eventType.trim();
        int total = mapper.count(f, t, e, ev);
        List<AccessLogEntry> rows = mapper.search(f, t, e, ev, pg * sz, sz);
        return new Page(rows, total, pg, sz);
    }

    public static class Page {
        private final List<AccessLogEntry> items;
        private final int total;
        private final int page;
        private final int size;

        Page(List<AccessLogEntry> items, int total, int page, int size) {
            this.items = items;
            this.total = total;
            this.page = page;
            this.size = size;
        }

        public List<AccessLogEntry> getItems() { return items; }
        public int getTotal() { return total; }
        public int getPage() { return page; }
        public int getSize() { return size; }
    }

    private static boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static boolean isDay(String s) {
        return s != null && s.matches("\\d{4}-\\d{2}-\\d{2}");
    }

    /** 제어 문자 제거 + 길이 제한. */
    static String clip(String s, int max) {
        if (s == null) {
            return null;
        }
        String clean = s.replaceAll("[\\p{Cntrl}]", " ");
        return clean.length() > max ? clean.substring(0, max) : clean;
    }
}
