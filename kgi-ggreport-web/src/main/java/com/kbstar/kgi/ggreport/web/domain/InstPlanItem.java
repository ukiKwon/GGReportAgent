package com.kbstar.kgi.ggreport.web.domain;

import java.math.BigDecimal;

/** INST_PLAN_ITEM(034) — 사업·하위사업 1개 = 1행. */
public class InstPlanItem {

    private Long itemId;
    private Long docId;
    private Long importId;
    private String institutionId;
    private Integer rowNo;
    private String fieldNo;
    private String fieldName;
    private String itemNo;
    private String parentNo;
    private String itemName;
    private String content;
    private String budgetStateCd;
    private BigDecimal budgetAmount;
    private String budgetUnitCd;
    private String budgetYears;
    private String pageNo;
    private String checkCd;
    private String progressCd;
    private BigDecimal execRate;
    private String note;

    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }
    public Long getDocId() { return docId; }
    public void setDocId(Long docId) { this.docId = docId; }
    public Long getImportId() { return importId; }
    public void setImportId(Long importId) { this.importId = importId; }
    public String getInstitutionId() { return institutionId; }
    public void setInstitutionId(String institutionId) { this.institutionId = institutionId; }
    public Integer getRowNo() { return rowNo; }
    public void setRowNo(Integer rowNo) { this.rowNo = rowNo; }
    public String getFieldNo() { return fieldNo; }
    public void setFieldNo(String fieldNo) { this.fieldNo = fieldNo; }
    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }
    public String getItemNo() { return itemNo; }
    public void setItemNo(String itemNo) { this.itemNo = itemNo; }
    public String getParentNo() { return parentNo; }
    public void setParentNo(String parentNo) { this.parentNo = parentNo; }
    public String getItemName() { return itemName; }
    public void setItemName(String itemName) { this.itemName = itemName; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getBudgetStateCd() { return budgetStateCd; }
    public void setBudgetStateCd(String budgetStateCd) { this.budgetStateCd = budgetStateCd; }
    public BigDecimal getBudgetAmount() { return budgetAmount; }
    public void setBudgetAmount(BigDecimal budgetAmount) { this.budgetAmount = budgetAmount; }
    public String getBudgetUnitCd() { return budgetUnitCd; }
    public void setBudgetUnitCd(String budgetUnitCd) { this.budgetUnitCd = budgetUnitCd; }
    public String getBudgetYears() { return budgetYears; }
    public void setBudgetYears(String budgetYears) { this.budgetYears = budgetYears; }
    public String getPageNo() { return pageNo; }
    public void setPageNo(String pageNo) { this.pageNo = pageNo; }
    public String getCheckCd() { return checkCd; }
    public void setCheckCd(String checkCd) { this.checkCd = checkCd; }
    public String getProgressCd() { return progressCd; }
    public void setProgressCd(String progressCd) { this.progressCd = progressCd; }
    public BigDecimal getExecRate() { return execRate; }
    public void setExecRate(BigDecimal execRate) { this.execRate = execRate; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
