package com.kb.uploader.config;

import com.kb.uploader.code.ClassificationStatus;

import java.util.Map;

/** {@code UNCLASSIFIED} ↔ {@code '01'} — 자세한 이유는 {@link CodeTypeHandler}. */
public class ClassificationStatusTypeHandler extends CodeTypeHandler {

    @Override
    protected Map<String, String> nameToCode() {
        return ClassificationStatus.nameToCode();
    }

    @Override
    protected Map<String, String> codeToName() {
        return ClassificationStatus.codeToName();
    }
}
