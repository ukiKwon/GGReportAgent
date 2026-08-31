package com.kbstar.kgi.ggreport.web.dto;

/**
 * 배점표 항목 1건 + 그 항목을 어느 팀이 채웠는지. 골든 {@code 08}.
 *
 * <p>⚠️ <b>여기에 개인정보 건수를 싣지 않는다.</b> PII 는 업로드 본문 <b>1회 스캔
 * 결과(= 팀 단위 사실)</b>라 항목별로 분해할 수 없다. 예전에 항목마다 같은 값을
 * 복제해 내려줬더니 화면이 항목 수만큼 부풀려 세거나(3건·12항목 → 36건) 팀당
 * {@code max} 를 집는 휴리스틱으로 방어해야 했다. 지금은 {@link CoverageTeam} 이
 * 팀당 한 번만 싣는다 — <b>여기에 다시 넣으면 읽는 쪽이 또 합산한다.</b>
 */
public class CoverageCriterion {

    private String category;
    private String item;
    private Integer score;
    /** 이 항목을 채운 팀. 아직 아무도 안 채웠으면 null. */
    private String team;
    private boolean covered;
    private String gapNote;

    public CoverageCriterion() {
    }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getItem() { return item; }
    public void setItem(String item) { this.item = item; }

    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public boolean isCovered() { return covered; }
    public void setCovered(boolean covered) { this.covered = covered; }

    public String getGapNote() { return gapNote; }
    public void setGapNote(String gapNote) { this.gapNote = gapNote; }
}
