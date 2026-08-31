package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.golden.GoldenRunner;
import com.kbstar.kgi.ggreport.web.golden.GoldenSnapshot;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.fail;

/**
 * 단계 2에서 <b>지금 재생 가능한</b> 골든만 실제로 대조한다.
 *
 * <p>고르는 기준은 하나다 — <b>공고·결재 데이터 없이 답이 정해지는가</b>. 아래 9건은
 * 기관 시드(Task 2.3 · {@code db/oracle/003_seed_institutions.sql})까지만 있으면
 * 응답이 확정된다: 기관 목록·상세·없는 기관 404·산출물 경로, 계정과 메뉴 2건(코드
 * 상수), 원문 열람(파일시스템), 정합성 초기 상태.
 *
 * <p>나머지는 여기 넣지 않는다:
 * <ul>
 *   <li>{@code 08}(배점 커버리지) — 시드로는 안 된다. {@code {output_root}/노원구/}
 *       밑의 <b>3단계 산출물</b>({@code rfp_scoring.json})을 읽는데 그 폴더는
 *       {@code data/}(gitignored) 라 리포에 없다. 단계 3에서 본다.</li>
 *   <li>{@code 25·26·27} — 골든 본문이 결재 시나리오(10~24) 이후의 상태다.
 *       빈 상태 응답만 {@link EmptyStateApiTest} 에서 본다.</li>
 * </ul>
 *
 * <p>⚠️ 통과했다고 이관이 끝난 게 아니다. 여기서 확정되는 것은 <b>URL·상태코드·
 * 키 이름·직렬화 규약</b>(snake_case, null 유지)이다. 데이터가 실린 경로는
 * 시드·결재가 붙는 다음 단계에서 다시 본다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class GoldenReadApiTest {

    /** 파일명 그대로. 순서는 무관하다 — 전부 상태를 바꾸지 않는 조회다. */
    private static final List<String> REPLAYABLE = Arrays.asList(
            "00_institutions_list",
            "01_institution_detail",
            "02_institution_404",
            "03_accounts",
            "04_menus_default",
            "05_menus_team_lead",
            "06_document_read",
            "07_consistency_initial",
            "09_artifacts_nowon");

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void 조회_골든_9건이_그대로_재생된다() throws Exception {
        GoldenRunner runner = new GoldenRunner(mockMvc);
        Path dir = GoldenSnapshot.goldenApiDir();

        // ⚠️ 실패해도 즉시 던지지 않는다. 한 건 고칠 때마다 다시 돌려서 다음 실패를
        //    찾는 것보다, 6건의 어긋남을 한 번에 보는 편이 원인 추정에 훨씬 낫다
        //    (예: 전부 키 이름이 틀리면 개별 컨트롤러가 아니라 Jackson 설정 문제다).
        List<String> failures = new ArrayList<>();
        for (String name : REPLAYABLE) {
            GoldenSnapshot snapshot = GoldenSnapshot.load(dir.resolve(name + ".json"));
            GoldenRunner.Result result = runner.run(snapshot);
            if (!result.passed()) {
                failures.add(result.failure());
            }
        }
        if (!failures.isEmpty()) {
            fail(failures.size() + "/" + REPLAYABLE.size() + "건이 골든과 다르다:\n\n"
                    + String.join("\n\n", failures));
        }
    }
}
