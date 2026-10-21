package com.kb.uploader.parse;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.util.List;

/** 입찰제안서 파싱 JSON 파일의 구조. */
@JsonPropertyOrder({"file_name", "ppt_path", "total_slides", "created_at", "slides"})
public class ProposalDocument {

    public static final String PPT_PATH_PREFIX = "agents/bid_proposal/resource/";

    @JsonProperty("file_name")
    private String fileName;
    @JsonProperty("ppt_path")
    private String pptPath;
    @JsonProperty("total_slides")
    private int totalSlides;
    @JsonProperty("created_at")
    private String createdAt;
    private List<SlideContent> slides;

    public ProposalDocument() {}

    public ProposalDocument(String originalFileName, String createdAt, List<SlideContent> slides) {
        this.fileName = originalFileName;
        this.pptPath = PPT_PATH_PREFIX + originalFileName;
        this.totalSlides = slides.size();
        this.createdAt = createdAt;
        this.slides = slides;
    }

    @JsonProperty("file_name")
    public String getFileName() { return fileName; }
    @JsonProperty("ppt_path")
    public String getPptPath() { return pptPath; }
    @JsonProperty("total_slides")
    public int getTotalSlides() { return totalSlides; }
    @JsonProperty("created_at")
    public String getCreatedAt() { return createdAt; }
    public List<SlideContent> getSlides() { return slides; }
}
