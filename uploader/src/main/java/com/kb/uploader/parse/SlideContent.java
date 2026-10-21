package com.kb.uploader.parse;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"index", "title", "text_full", "has_image"})
public class SlideContent {

    private int index;
    private String title;
    @JsonProperty("text_full")
    private String textFull;
    @JsonProperty("has_image")
    private boolean hasImage;

    public SlideContent() {}

    public SlideContent(int index, String title, String textFull, boolean hasImage) {
        this.index = index;
        this.title = title;
        this.textFull = textFull;
        this.hasImage = hasImage;
    }

    public int getIndex() { return index; }
    public String getTitle() { return title; }
    @JsonProperty("text_full")
    public String getTextFull() { return textFull; }
    @JsonProperty("has_image")
    public boolean isHasImage() { return hasImage; }
}
