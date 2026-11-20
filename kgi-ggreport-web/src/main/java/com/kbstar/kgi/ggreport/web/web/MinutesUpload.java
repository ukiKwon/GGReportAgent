package com.kbstar.kgi.ggreport.web.web;

import org.springframework.web.multipart.MultipartFile;

/**
 * 업로드·미리보기 한 건의 입력 묶음. 파일은 {@link MultipartFile} 참조만 든다 — 서비스가 업로드 자격을 확인한 <b>뒤에</b> 크기를 보고
 * 바이트를 읽는다(권한 없는 사람이 파싱 비용을 쓰지 못하게). 파일명은 확장자 검사에만 쓰고 저장·기록하지 않는다.
 * options·edits 는 <b>JSON 문자열만</b> 든다(크기는 컨트롤러가 이미 봤다) — Jackson 파싱은 서비스가 업로드 자격 확인 뒤에 한다.
 */
public final class MinutesUpload {

    private final MultipartFile transcript;
    private final MultipartFile timeline;
    private final MultipartFile summary;
    private final String optionsJson;
    private final String editsJson;

    public MinutesUpload(MultipartFile transcript, MultipartFile timeline, MultipartFile summary,
                         String optionsJson, String editsJson) {
        this.transcript = transcript;
        this.timeline = timeline;
        this.summary = summary;
        this.optionsJson = optionsJson;
        this.editsJson = editsJson;
    }

    public MultipartFile getTranscript() { return transcript; }
    public MultipartFile getTimeline() { return timeline; }
    public MultipartFile getSummary() { return summary; }
    public String getOptionsJson() { return optionsJson; }
    public String getEditsJson() { return editsJson; }
}
