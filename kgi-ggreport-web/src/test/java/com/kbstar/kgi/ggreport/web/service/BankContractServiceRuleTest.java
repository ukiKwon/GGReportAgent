package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BankContract;
import org.junit.Test;

import static org.junit.Assert.*;

/** cancelRule·editedByOther — 줄 권한 응답값(can_cancel·edited_by_other)의 순수 규칙. */
public class BankContractServiceRuleTest {

    @Test public void 취소_규칙() {
        assertTrue(BankContractService.cancelRule("SAVE", "A", "A", false));    // 처음 입력자
        assertFalse(BankContractService.cancelRule("SAVE", "A", "B", false));   // 다른 팀원
        assertTrue(BankContractService.cancelRule("SAVE", "A", "B", true));     // 팀장·부장
        assertFalse(BankContractService.cancelRule("CANCEL", "A", "A", true));  // 이미 취소된 줄
        assertFalse(BankContractService.cancelRule("SAVE", null, null, true));  // 사번 없음
        assertFalse(BankContractService.cancelRule("SAVE", null, "B", false));  // 처음 입력자 모름
    }

    @Test public void 남이_고침은_사번_비교() {
        BankContract c = new BankContract();
        c.setFirstEditorEmpNo("A"); c.setEditorEmpNo("A"); c.setFirstEditorName("홍"); c.setEditorName("홍");
        assertFalse(BankContractService.editedByOther(c));
        c.setEditorEmpNo("B");                                                  // 이름은 같고 사번만 다름
        assertTrue(BankContractService.editedByOther(c));
        c.setFirstEditorEmpNo(null);
        assertFalse(BankContractService.editedByOther(c));
    }
}
