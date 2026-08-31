package com.kbstar.kgi.ggreport.web.dto;

/**
 * 메뉴 정의 한 줄({@code GET /menus} 의 {@code menus[]}). 골든 {@code 04}·{@code 05}.
 *
 * <p>{@code serverOnly} → {@code server_only} 로 나간다.
 */
public class MenuDefinition {

    private String key;
    private String label;
    private boolean serverOnly;

    public MenuDefinition() {
    }

    public MenuDefinition(String key, String label, boolean serverOnly) {
        this.key = key;
        this.label = label;
        this.serverOnly = serverOnly;
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public boolean isServerOnly() { return serverOnly; }
    public void setServerOnly(boolean serverOnly) { this.serverOnly = serverOnly; }
}
