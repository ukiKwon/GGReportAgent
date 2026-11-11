package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.Ids;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 반입 배치의 DB 단계 — 기관 upsert + 공고별 bid_case upsert 를 <b>한 트랜잭션</b>으로 처리한다(NEXT 72 S4).
 *
 * <p>⚠️ {@link InboxService} 안의 같은 객체 호출로는 {@code @Transactional} 프록시가 걸리지 않아
 * (record 중간 422 가 나도 앞 레코드가 남았다) 별도 빈의 public 메서드로 분리했다. 호출은 반드시
 * 다른 빈(InboxService)에서 해야 한다. 파일 읽기(CSV 파싱)는 호출자가 끝내고 rows 로 넘긴다.
 */
@Service
public class InboxDbApplier {

    private static final String CONFIDENCE_DEFAULT = "예상";

    private final InstitutionMapper institutions;
    private final BidCaseMapper bidCases;
    private final BidCaseCommandService bidCaseCommands;

    public InboxDbApplier(InstitutionMapper institutions, BidCaseMapper bidCases,
                          BidCaseCommandService bidCaseCommands) {
        this.institutions = institutions;
        this.bidCases = bidCases;
        this.bidCaseCommands = bidCaseCommands;
    }

    /** 반영 결과 — 기관 ID 목록과 공고별 created/updated. */
    public static final class Result {
        public final List<String> institutionIds;
        public final Map<String, List<String>> bidCases;

        Result(List<String> institutionIds, Map<String, List<String>> bidCases) {
            this.institutionIds = institutionIds;
            this.bidCases = bidCases;
        }
    }

    /** RuntimeException(ApiException 포함)이 나면 이 메서드의 모든 DB 변경이 롤백된다. */
    @Transactional
    public Result apply(List<InstitutionImportRow> rows, String sourceSlug, JsonNode records) {
        List<String> institutionIds = new ArrayList<>();
        for (InstitutionImportRow row : rows) {
            institutionIds.add(upsertInstitution(row));
        }

        Map<String, List<String>> summary = new LinkedHashMap<>();
        summary.put("created", new ArrayList<String>());
        summary.put("updated", new ArrayList<String>());

        for (int index = 0; index < records.size(); index++) {
            JsonNode record = records.get(index);
            String nameKo = record.path("institution").path("name_ko").asText(null);
            String institutionId = nameKo == null ? null : institutions.selectIdByName(nameKo);
            if (institutionId == null) {
                // ⚠️ 조용히 건너뛰지 않는다. SCHEMA §④ 가 records[].institution.name_ko 를
                //    CSV '기관명' 과 같은 값으로 못 박으므로, 못 찾는 것은 배치가 계약을
                //    어긴 것이다. 건너뛰면 일정 없는 유령 공고가 남는다.
                throw ApiException.withDetail(422, Collections.singletonMap("errors",
                        Collections.singletonList(
                                "records[" + index + "]: CSV에 없는 기관명입니다 ('" + nameKo + "')")));
            }
            upsertBidCaseFromNotice(institutionId, sourceSlug, record, summary);
        }
        return new Result(institutionIds, summary);
    }

    /** {@code repository.upsert_institution} — 이름이 키다(기관 ID 키 전환은 NEXT 72 C3). */
    private String upsertInstitution(InstitutionImportRow row) {
        String existingId = institutions.selectIdByName(row.getNameKo());
        if (existingId != null) {
            institutions.updateFromImport(existingId, row);
            return existingId;
        }
        String institutionId = Ids.institution();
        institutions.insert(institutionId, row);
        return institutionId;
    }

    /**
     * manifest 레코드 1건을 {@code bid_cases} 에 반영한다 — Python {@code upsert_bid_case_from_notice}.
     *
     * <p>유일키는 {@code (source_slug, notice_id)} 다. 같은 공고를 다시 수집하는 것은
     * 정상이고 <b>나중 배치가 이긴다</b>(SCHEMA §④).
     *
     * <p>⚠️ <b>신뢰도에 따라 날짜를 넣는 컬럼이 갈리고, 반대쪽은 건드리지 않는다.</b>
     * 예상이 확정으로 승격될 때 예전 예상값을 지우면 "언제 예상했었나"가 사라진다.
     */
    private void upsertBidCaseFromNotice(String institutionId, String sourceSlug,
                                         JsonNode record, Map<String, List<String>> summary) {
        String noticeId = record.path("notice_id").asText(null);
        String title = record.path("title").asText(null);
        String noticeUrl = record.path("evidence").path("url").asText(null);

        JsonNode schedule = record.path("schedule");
        String confidence = schedule.path("confidence").asText(null);
        if (confidence == null || confidence.isEmpty()) {
            confidence = CONFIDENCE_DEFAULT;
        }
        String date = scheduleDateFrom(schedule);

        String existingId = bidCases.selectIdByNotice(sourceSlug, noticeId);
        if (existingId != null) {
            bidCases.updateFromNotice(existingId, confidence, date, title, noticeUrl, Times.nowIso());
            summary.get("updated").add(existingId);
            return;
        }

        BidCase made = bidCaseCommands.create(institutionId);
        String bidCaseId = made.getBidCaseId();
        bidCases.updateFromNotice(bidCaseId, confidence, date, title, noticeUrl, Times.nowIso());
        bidCases.updateNoticeMeta(bidCaseId, sourceSlug, noticeId, title, noticeUrl);
        summary.get("created").add(bidCaseId);
    }

    /**
     * 공고 일정 중 "입찰이 언제인가"를 고른다 — Python {@code schedule_date_from}.
     * {@code deadline_at} 1순위, 없으면 {@code contract_end}, 둘 다 없으면 null(공고는 실재하므로 건은 만든다).
     */
    private static String scheduleDateFrom(JsonNode schedule) {
        String deadline = schedule.path("deadline_at").asText(null);
        if (deadline != null && !deadline.isEmpty()) {
            return deadline;
        }
        String contractEnd = schedule.path("contract_end").asText(null);
        return contractEnd == null || contractEnd.isEmpty() ? null : contractEnd;
    }
}
