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

    public String getOutputRoot() { return outputRoot; }
    public void setOutputRoot(String outputRoot) { this.outputRoot = outputRoot; }

    public String getCorpusRoot() { return corpusRoot; }
    public void setCorpusRoot(String corpusRoot) { this.corpusRoot = corpusRoot; }

    public String getArchiveRoot() { return archiveRoot; }
    public void setArchiveRoot(String archiveRoot) { this.archiveRoot = archiveRoot; }

    /**
     * 데모 여부. 화면이 QA용 계정 전환기를 띄울지 판단하는 데만 쓴다(운영에선 안 뜬다).
     * Python 은 {@code create_app(demo=…)} 인자였다 — Java 는 설정 키로 받는다.
     */
    private boolean demo = false;

    public boolean isDemo() { return demo; }
    public void setDemo(boolean demo) { this.demo = demo; }
}
