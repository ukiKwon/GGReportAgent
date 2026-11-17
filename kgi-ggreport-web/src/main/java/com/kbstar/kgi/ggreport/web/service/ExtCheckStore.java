package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.ExtCheck;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckExcl;
import com.kbstar.kgi.ggreport.web.domain.ExtCheckFile;
import com.kbstar.kgi.ggreport.web.mapper.ExtCheckMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 외부 확인 반입 3단계 — 통과 check·첨부·제외 이력을 한 트랜잭션으로 저장한다. 호출은 반드시 다른 빈(InboxService)에서. */
@Service
public class ExtCheckStore {

    /** EXT_CHECK.BATCH_ID 열 길이. batch_id 형식 검사(BATCH_ID_RE)는 길이 상한이 없어서 호출부가 먼저 본다. */
    public static final int MAX_BATCH_ID_LEN = 80;

    private final ExtCheckMapper mapper;

    public ExtCheckStore(ExtCheckMapper mapper) {
        this.mapper = mapper;
    }

    /** 이 batch_id 로 저장·제외 이력이 이미 있으면 true(재반입 차단). */
    public boolean batchExists(String batchId) {
        return mapper.countByBatch(batchId) > 0 || mapper.countExclByBatch(batchId) > 0;
    }

    /** 하나라도 실패하면 전부 롤백(RuntimeException). 같은 (batch_id, check_id) 는 UQ 가 DuplicateKeyException 으로 막는다. */
    @Transactional
    public void save(List<ExtCheck> checks, List<ExtCheckExcl> excls) {
        for (ExtCheck c : checks) {
            mapper.insertCheck(c);
            for (ExtCheckFile f : c.getFiles()) {
                mapper.insertFile(f);
            }
        }
        for (ExtCheckExcl e : excls) {
            mapper.insertExcl(e);
        }
    }
}
