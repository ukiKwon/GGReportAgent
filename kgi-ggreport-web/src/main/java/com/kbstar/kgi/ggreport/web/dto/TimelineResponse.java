package com.kbstar.kgi.ggreport.web.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code GET /institutions/{id}/timeline} — 골든 {@code 29}.
 *
 * <p>배열을 그대로 내보내지 않고 {@code {"events": […]}} 로 감싼다(원본 그대로).
 */
public class TimelineResponse {

    private List<TimelineEvent> events = new ArrayList<TimelineEvent>();

    public TimelineResponse() {
    }

    public TimelineResponse(List<TimelineEvent> events) {
        this.events = events;
    }

    public List<TimelineEvent> getEvents() { return events; }
    public void setEvents(List<TimelineEvent> events) { this.events = events; }
}
