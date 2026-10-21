package com.kbstar.kgi.ggreport.web.dto;

/**
 * {@code POST /institutions/{id}/complete} 의 응답 —
 * {@code {"archive_dir": …, "completed_by": …}}.
 *
 * <p>{@code completedBy} 는 {@code X-User-Id} 헤더 그대로다. 누가 눌렀는지가 응답에
 * 실려야 화면이 "누가 완료함"을 바로 보여 줄 수 있다.
 */
public class CompleteResponse {

    private String archiveDir;
    private String completedBy;

    public CompleteResponse() {
    }

    public CompleteResponse(String archiveDir, String completedBy) {
        this.archiveDir = archiveDir;
        this.completedBy = completedBy;
    }

    public String getArchiveDir() { return archiveDir; }
    public void setArchiveDir(String archiveDir) { this.archiveDir = archiveDir; }

    public String getCompletedBy() { return completedBy; }
    public void setCompletedBy(String completedBy) { this.completedBy = completedBy; }
}
