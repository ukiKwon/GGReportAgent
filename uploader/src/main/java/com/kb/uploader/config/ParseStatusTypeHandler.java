package com.kb.uploader.config;

import com.kb.uploader.code.ParseStatus;

import java.util.Map;

/** {@code SUCCESS} ↔ {@code '02'} — 자세한 이유는 {@link CodeTypeHandler}. */
public class ParseStatusTypeHandler extends CodeTypeHandler {

    @Override
    protected Map<String, String> nameToCode() {
        return ParseStatus.nameToCode();
    }

    @Override
    protected Map<String, String> codeToName() {
        return ParseStatus.codeToName();
    }
}
