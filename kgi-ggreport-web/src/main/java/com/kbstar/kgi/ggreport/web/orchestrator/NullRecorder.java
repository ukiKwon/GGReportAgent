package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 아무것도 기록하지 않는 {@link Recorder} — 노드 로직을 DB 없이 돌려 보는 테스트용.
 * Python {@code ports.NullRecorder} 와 같은 자리다.
 */
public class NullRecorder implements Recorder {

    @Override
    public void setStage(int stage) {
    }

    @Override
    public void taskOpen(String team) {
    }

    @Override
    public void taskUpdate(String team, String status, int progressPct) {
    }

    @Override
    public void message(String team, String role, String content, String author, String model) {
    }

    @Override
    public void notify(String recipient, String kind, String content) {
    }
}
