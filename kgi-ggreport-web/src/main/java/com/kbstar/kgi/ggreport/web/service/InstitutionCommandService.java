package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import com.kbstar.kgi.ggreport.web.dto.CompleteResponse;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.InstitutionCsv;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

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

    /** 제출 대기 단계. 이 단계에서만 완료할 수 있다. */
    private static final int STAGE_READY_TO_SUBMIT = 9;

    private final InstitutionMapper mapper;
    private final BidCaseMapper bidCases;
    private final ArchiveService archive;

    public InstitutionCommandService(InstitutionMapper mapper, BidCaseMapper bidCases,
                                     ArchiveService archive) {
        this.mapper = mapper;
        this.bidCases = bidCases;
        this.archive = archive;
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

    /**
     * CSV 반입 — 원본 {@code POST /institutions/import}.
     *
     * <p><b>이름으로 찾아 upsert 한다</b> — 같은 표를 다시 올리는 것이 정상 경로이기
     * 때문이다. 그래서 빈 칸은 기존 값을 <b>덮지 않는다</b>({@code updateFromImport}
     * 의 {@code COALESCE}). 사람이 누르는 '기관 추가'가 409 인 것과 일부러 다르다.
     *
     * <p>⚠️ <b>표 전체가 한 트랜잭션이다.</b> 한 행이 깨지면 앞 행도 들어가지 않는다 —
     * 원본이 {@code commit=False} 로 모아 두고 마지막에 한 번 커밋하며, 중간 실패 시
     * {@code rollback()} 한다. 반쯤 반입된 표는 무엇이 들어갔는지 사람이 알 수 없어
     * 다시 올리는 것 말고는 복구 방법이 없다.
     *
     * <p>파싱 실패는 {@link InstitutionCsv.CsvFormatException} 으로 올라와 컨트롤러가
     * 400 으로 바꾼다 — 행 번호가 사유에 들어 있다.
     *
     * @return 반입된 기관 id 목록(표의 행 순서 그대로, 기존 행이면 그 id)
     */
    @Transactional
    public List<String> importCsv(byte[] raw) {
        List<InstitutionImportRow> rows = InstitutionCsv.parse(raw);
        List<String> ids = new ArrayList<>(rows.size());
        for (InstitutionImportRow row : rows) {
            ids.add(upsert(row));
        }
        return ids;
    }

    /** {@code repository.upsert_institution} — 이름이 키다. */
    private String upsert(InstitutionImportRow row) {
        String existingId = mapper.selectIdByName(row.getNameKo());
        if (existingId != null) {
            mapper.updateFromImport(existingId, row);
            return existingId;
        }
        String institutionId = Ids.institution();
        mapper.insert(institutionId, row);
        return institutionId;
    }

    /**
     * 완료 처리 — 원본 {@code POST /institutions/{id}/complete}. Task 5B.6.
     *
     * <p><b>단계 9(제출 대기)에서만</b> 할 수 있다(아니면 409). 산출물을 아카이브하고
     * 최신 공고를 {@code 제출완료} 로 바꾼다.
     *
     * <p>⚠️ <b>최신 공고 1건에만 스코프한다.</b> 기관은 1:N 으로 공고를 가지므로,
     * 과거 건(예: 유찰 후 재입찰)의 상태와 작업을 덮어쓰거나 아카이브에 섞으면 안 된다.
     *
     * <p>⚠️ <b>원본의 후속 색인(reindex)은 아직 없다.</b> 파이썬은 완료 뒤 아카이브
     * 산출물을 지식 탭에서 검색할 수 있게 백그라운드로 색인한다. 자바에는 <b>검색
     * 계층 자체가 없어서</b>(단계 3 — 문의 3 회신 대기) 넣을 자리가 없다. 단계 3 이
     * 붙을 때 <b>여기에 후속 작업을 다시 달아야 한다.</b> 그때도 원본 규칙은 그대로다 —
     * 백그라운드로 돌리고(임베딩이 청크당 1초대라 응답을 붙잡으면 완료 버튼이 멈춘
     * 것처럼 보인다), <b>실패해도 완료는 200</b> 이다(부수 작업이 결재를 되돌리면 안 된다).
     */
    @Transactional
    public CompleteResponse complete(String institutionId, String userId) {
        Institution institution = mapper.selectById(institutionId);
        if (institution == null) {
            throw ApiException.notFound("institution not found");
        }
        if (institution.getStage() != STAGE_READY_TO_SUBMIT) {
            throw new ApiException(409, "stage 9(제출 대기)에서만 완료할 수 있다");
        }

        String bidCaseId = bidCases.selectLatestIdByInstitution(institutionId);
        String dest = archive.archive(institution, bidCaseId);
        if (bidCaseId != null) {
            bidCases.updateParticipationStatus(bidCaseId, "제출완료");
        }
        return new CompleteResponse(dest, userId);
    }
}
