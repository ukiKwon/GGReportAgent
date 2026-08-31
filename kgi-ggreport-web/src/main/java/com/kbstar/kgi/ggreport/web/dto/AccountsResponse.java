package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/**
 * {@code GET /accounts}. 골든 {@code 03} 은 빈 DB 라 {@code {"demo": false,
 * "accounts": []}} 다.
 *
 * <p>목록을 코드에 박지 않고 <b>실데이터에서 뽑는다</b>. 그래야 데모 데이터를 고쳐도
 * 목록이 따라오고, 빈 운영 DB 에서는 자동으로 비어(전환기도 숨는다) 엉뚱한 신원이
 * 생기지 않는다.
 */
public class AccountsResponse {

    private boolean demo;
    private List<Account> accounts;

    public AccountsResponse() {
    }

    public AccountsResponse(boolean demo, List<Account> accounts) {
        this.demo = demo;
        this.accounts = accounts;
    }

    public boolean isDemo() { return demo; }
    public void setDemo(boolean demo) { this.demo = demo; }

    public List<Account> getAccounts() { return accounts; }
    public void setAccounts(List<Account> accounts) { this.accounts = accounts; }
}
