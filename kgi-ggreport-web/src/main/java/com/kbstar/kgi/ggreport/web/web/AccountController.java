package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.AccountsResponse;
import com.kbstar.kgi.ggreport.web.service.AccountService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 계정 목록 — 데모 화면의 계정 전환기가 쓴다. 골든 {@code 03}. */
@RestController
@RequestMapping("/accounts")
public class AccountController {

    private final AccountService accounts;

    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping
    public AccountsResponse list() {
        return accounts.accounts();
    }
}
