package com.kbstar.kgi.ggreport.web.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 파일 시스템 뿌리 3곳. Python {@code create_app()} 의 같은 이름 인자에 대응한다.
 *
 * <p>⚠️ <b>기본값을 코드에 둔다.</b> 설정 파일은 5축(local/dev/stg/prod/out-local)이라
 * 새 키를 추가하면 다섯 곳을 모두 고쳐야 하고, 하나만 빠지면 <b>그 환경에서만</b>
 * 경로가 비어 엉뚱한 곳을 읽는다. 환경마다 달라야 하는 것({@code output-root})만
 * 설정 파일에 있고, 나머지는 리포 구조상 고정이라 여기서 기본값을 준다.
 *
 * <p>상대경로는 <b>기동 디렉터리 기준</b>이다 — Python 과 같다.
 */
@Component
@ConfigurationProperties(prefix = "ggreport")
public class AppProperties {

    /** 산출물·아카이브 뿌리. Python {@code output_root}(= {@code data/report_new}). */
    private String outputRoot = "data/report_new";

    /** 지식 탭 '원문 열기'가 읽어도 되는 뿌리. 색인 루트와 같은 값이어야 한다. */
    private String corpusRoot = "corpus";

    /** 완료된 건의 보관 뿌리. Python {@code agent/paths.DEFAULT_ARCHIVE_ROOT}. */
    private String archiveRoot = "data/report_archive";

    /**
     * 코퍼스 경로 등록({@code POST /institutions/{id}/corpus})이 허용하는 <b>바깥
     * 울타리</b>. Python {@code routers/institutions.REPO_ROOT} 에 대응한다.
     *
     * <p>사용자가 보낸 경로는 이 뿌리 기준 상대경로여야 하고, 정규화한 뒤에도 이
     * 아래에 있어야 한다 — 그래야 {@code ../../etc} 같은 입력이 막힌다. 기본값
     * {@code "."} 은 기동 디렉터리, 즉 리포 루트다(Python 과 같은 전제).
     */
    private String repoRoot = ".";

    public String getOutputRoot() { return outputRoot; }
    public void setOutputRoot(String outputRoot) { this.outputRoot = outputRoot; }

    public String getCorpusRoot() { return corpusRoot; }
    public void setCorpusRoot(String corpusRoot) { this.corpusRoot = corpusRoot; }

    public String getArchiveRoot() { return archiveRoot; }
    public void setArchiveRoot(String archiveRoot) { this.archiveRoot = archiveRoot; }

    public String getRepoRoot() { return repoRoot; }
    public void setRepoRoot(String repoRoot) { this.repoRoot = repoRoot; }

    /**
     * 망 밖 수집기가 배치를 떨구는 자리. Python {@code create_app(inbox_root=…)}.
     * ⚠️ 이 앱은 <b>여기를 읽기만 한다</b> — 망 밖을 향한 요청도 역방향 콜백도 만들지
     * 않는다({@code collector/SCHEMA.md} §⑩-5).
     */
    private String inboxRoot = "corpus/inbox";

    /** 반입된 공고문 PDF 가 옮겨 갈 자리. Python {@code rfp_root}. */
    private String rfpRoot = "corpus/rfp";

    /**
     * 처리된 배치를 치워 두는 자리. Python {@code batches_root}.
     *
     * <p>지우지 않는 이유는 {@code evidence.url} 과 수집 시각이 <b>반입 근거</b>라
     * 감사에 필요하기 때문이다. inbox 를 "미처리만"으로 유지하는 것이 목적이다.
     */
    private String batchesRoot = "data/batches";

    public String getInboxRoot() { return inboxRoot; }
    public void setInboxRoot(String inboxRoot) { this.inboxRoot = inboxRoot; }

    public String getRfpRoot() { return rfpRoot; }
    public void setRfpRoot(String rfpRoot) { this.rfpRoot = rfpRoot; }

    public String getBatchesRoot() { return batchesRoot; }
    public void setBatchesRoot(String batchesRoot) { this.batchesRoot = batchesRoot; }

    /**
     * 제안서 사전준비 첨부 원본(NEXT 71, 025)이 놓일 폴더 — 파일은 서버가 만든 32자리 키 이름으로만 저장한다.
     * ⚠️ DB 와 함께 이 폴더도 백업 대상이다(파일이 정본). 물리 삭제는 하지 않는다(보존 '계속').
     * 상대경로는 기동 디렉터리 기준이다. 운영은 웹 루트 밖 경로를 권장한다.
     */
    private String prepAttachDir = "data/prep-attach";

    public String getPrepAttachDir() { return prepAttachDir; }
    public void setPrepAttachDir(String prepAttachDir) { this.prepAttachDir = prepAttachDir; }

    /**
     * 기관장 정보(NEXT 72·77, 026) 설정 묶음 — {@code ggreport.inst-head.*}. 기본값은 코드에 둔다(키가 빠진 PC 에서도 뜬다).
     * 스위치 {@code enabled} 는 기본 켬(사용자 결정 2026-11-11) — 끄면 기관장 API 전부 404 FEATURE_OFF 이고 DB 를 건드리지 않는다.
     * ⚠️ 사진 폴더도 DB 와 함께 백업 대상이다. 운영은 웹 루트 밖 절대경로.
     */
    public static class InstHead {
        private volatile boolean enabled = true;
        private String photoDir = "data/head-photo";
        /** 옛 사진 보존 일수 — -1 = 미정(삭제 안 함). 삭제 작업은 아직 없다. */
        private int photoRetentionDays = -1;
        /** 사번별 하루 열람(VIEW 계열) 경고 기준 — 넘는 순간 앱 로그 WARN 한 번(값 없음). */
        private int viewWarnPerDay = 50;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getPhotoDir() { return photoDir; }
        public void setPhotoDir(String photoDir) { this.photoDir = photoDir; }
        public int getPhotoRetentionDays() { return photoRetentionDays; }
        public void setPhotoRetentionDays(int photoRetentionDays) { this.photoRetentionDays = photoRetentionDays; }
        public int getViewWarnPerDay() { return viewWarnPerDay; }
        public void setViewWarnPerDay(int viewWarnPerDay) { this.viewWarnPerDay = viewWarnPerDay; }
    }

    private final InstHead instHead = new InstHead();

    public InstHead getInstHead() { return instHead; }

    /**
     * 데모 여부. 화면이 QA용 계정 전환기를 띄울지 판단하는 데만 쓴다(운영에선 안 뜬다).
     * Python 은 {@code create_app(demo=…)} 인자였다 — Java 는 설정 키로 받는다.
     */
    private boolean demo = false;

    public boolean isDemo() { return demo; }
    public void setDemo(boolean demo) { this.demo = demo; }
}
