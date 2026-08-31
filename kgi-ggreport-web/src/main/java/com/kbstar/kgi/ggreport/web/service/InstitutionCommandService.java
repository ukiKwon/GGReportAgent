package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기관 쓰기 — Task 5B.5. Python {@code repository.create_institution} ·
 * {@code update_institution} + {@code routers/institutions.py} 의 상태코드 판정.
 *
 * <p>조회는 {@link InstitutionService} 에 있다. 이 저장소의 다른 짝들과 같은 이유로
 * 갈라 뒀다({@code BidCaseQuery/Command}, {@code TaskQuery/Command}) — 쓰기는
 * 트랜잭션 경계를 가지고 조회는 갖지 않는다.
 */
@Service
public class InstitutionCommandService {

    private final InstitutionMapper mapper;

    public InstitutionCommandService(InstitutionMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 화면의 '기관 추가' — 원본 {@code POST /institutions} (201).
     *
     * <p>⚠️ <b>같은 이름이면 409 다. CSV 반입({@code POST /import})의 upsert 와
     * 일부러 다르다.</b> 표를 다시 올리는 것은 정상이지만, 사람이 같은 이름을 다시
     * 누르는 것은 거의 언제나 오타나 중복 등록이다. 이 비대칭을 "일관성"이라는
     * 이유로 없애지 말 것 — 두 경로의 사용자 의도가 다르다.
     *
     * <p>id 는 서버가 발급한다({@code new-<hex8>}). 이름을 그대로 id 로 쓰면
     * 한글·공백·개명 문제를 전부 떠안는다.
     *
     * <p>⚠️ 중복 검사와 INSERT 사이에는 경합 구간이 있다. 같은 이름을 두 사람이
     * 동시에 누르면 둘 다 통과할 수 있다 — <b>원본도 같다</b>. 최종 방어는
     * {@code NAME_KO} 유니크 제약이어야 하는데 현재 스키마에 없으므로, 여기서
     * 막지 못한 중복은 DB 까지 들어간다. 제약 추가는 이관 범위 밖이라 사실만 남긴다.
     */
    @Transactional
    public Institution create(InstitutionImportRow row) {
        String name = row.getNameKo() == null ? "" : row.getNameKo().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("기관명이 비어 있습니다");
        }
        row.setNameKo(name);

        if (mapper.selectIdByName(name) != null) {
            throw new ApiException(409, "이미 있는 기관명입니다 (" + name + ")");
        }

        String institutionId = Ids.institution();
        mapper.insert(institutionId, row);
        return mapper.selectById(institutionId);
    }

    /**
     * 화면 편집 반영 — 원본 {@code PUT /institutions/{id}} (부분 갱신).
     *
     * <p><b>보내지 않은 필드는 보존하고, {@code null} 로 보낸 필드는 지운다.</b>
     * 이 구분이 요점이다 — 예전 원본은 {@code COALESCE} 라 둘을 같게 취급해서
     * {@code term}(숫자)을 한 번 넣으면 <b>비울 방법이 없었다</b>. 그 결함을 고친
     * 뒤의 의미론을 옮긴 것이므로 {@code COALESCE} 로 되돌리지 말 것
     * (그 규칙은 {@code updateFromImport} 쪽에만 있다).
     *
     * <p>⚠️ 아무 필드도 안 보냈으면 <b>UPDATE 를 돌리지 않고</b> 현재 값을 돌려준다.
     * 원본이 그렇고, {@code <set>} 이 비면 SQL 문법 오류가 난다.
     *
     * <p>{@code stage} 같은 워크플로 필드는 {@link InstitutionUpdateIn} 에 아예 없어
     * 자동으로 무시된다 — 화면 편집이 진행 단계를 되돌릴 수 없어야 한다.
     */
    @Transactional
    public Institution update(String institutionId, InstitutionUpdateIn upd) {
        Institution existing = mapper.selectById(institutionId);
        if (existing == null) {
            throw ApiException.notFound("institution not found");
        }
        if (upd.nothingSet()) {
            return existing;
        }
        mapper.updateFields(institutionId, upd);
        return mapper.selectById(institutionId);
    }
}
