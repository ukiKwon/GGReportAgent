package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.kbstar.kgi.ggreport.web.llm.LlmJsonSchema;

/** AI 초안 응답 모양 — 2칸 모두 문자열(근거 없으면 ""). */
@LlmJsonSchema("{\"type\":\"object\",\"properties\":{"
        + "\"intro\":{\"type\":\"string\"},\"effect\":{\"type\":\"string\"}},"
        + "\"required\":[\"intro\",\"effect\"]}")
public class ScriptDraftOut {
    @JsonProperty("intro") public String intro;
    @JsonProperty("effect") public String effect;

    String get(String key) {
        if ("intro".equals(key)) return intro;
        if ("effect".equals(key)) return effect;
        return null;
    }
}
