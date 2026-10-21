package com.kb.uploader.config;

import com.kb.uploader.code.DocumentType;

import java.util.Map;

/** {@code BID_PROPOSAL} ↔ {@code '01'} — 자세한 이유는 {@link CodeTypeHandler}. */
public class DocumentTypeTypeHandler extends CodeTypeHandler {

    @Override
    protected Map<String, String> nameToCode() {
        return DocumentType.nameToCode();
    }

    @Override
    protected Map<String, String> codeToName() {
        return DocumentType.codeToName();
    }
}
