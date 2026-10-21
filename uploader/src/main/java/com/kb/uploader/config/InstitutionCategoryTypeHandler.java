package com.kb.uploader.config;

import com.kb.uploader.code.InstitutionCategory;

import java.util.Map;

/** {@code 지방자치단체} ↔ {@code '01'} — 자세한 이유는 {@link CodeTypeHandler}. */
public class InstitutionCategoryTypeHandler extends CodeTypeHandler {

    @Override
    protected Map<String, String> nameToCode() {
        return InstitutionCategory.nameToCode();
    }

    @Override
    protected Map<String, String> codeToName() {
        return InstitutionCategory.codeToName();
    }
}
