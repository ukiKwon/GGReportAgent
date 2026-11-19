package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.BoardMinutesIn;
import org.springframework.web.multipart.MultipartFile;

/**
 * 업로드·미리보기 한 건의 입력 묶음. 파일은 {@link MultipartFile} 참조만 든다 — 서비스가 업로드 자격을 확인한 <b>뒤에</b> 크기를 보고
 * 바이트를 읽는다(권한 없는 사람이 파싱 비용을 쓰지 못하게). 파일명은 확장자 검사에만 쓰고 저장·기록하지 않는다.
 */
public final class MinutesUpload {

    private final MultipartFile transcript;
    private final MultipartFile timeline;
    private final MultipartFile summary;
    private final BoardMinutesIn.MinutesOptions options;

    public MinutesUpload(MultipartFile transcript, MultipartFile timeline, MultipartFile summary,
                         BoardMinutesIn.MinutesOptions options) {
        this.transcript = transcript;
        this.timeline = timeline;
        this.summary = summary;
        this.options = options;
    }

    public MultipartFile getTranscript() { return transcript; }
    public MultipartFile getTimeline() { return timeline; }
    public MultipartFile getSummary() { return summary; }
    public BoardMinutesIn.MinutesOptions getOptions() { return options; }
}
