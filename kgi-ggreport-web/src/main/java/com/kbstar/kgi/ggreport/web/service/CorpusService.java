package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.dto.CorpusRegisterResponse;
import com.kbstar.kgi.ggreport.web.dto.ValidationReport;
import com.kbstar.kgi.ggreport.web.mapper.BidCaseMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import com.kbstar.kgi.ggreport.web.support.CorpusValidator;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * 코퍼스 경로 검사·등록 — Task 5B.5.
 * Python {@code routers/institutions.post_corpus_validate} · {@code post_corpus_register}.
 *
 * <p>두 엔드포인트의 차이는 <b>쓰기 여부와 실패 처리</b> 하나다 — 검사는 결과만
 * 돌려주고(오류가 있어도 200), 등록은 <b>오류가 있으면 422 로 거절</b>한다.
 * 경고는 어느 쪽도 막지 않는다.
 */
@Service
public class CorpusService {

    private final InstitutionMapper institutions;
    private final BidCaseMapper bidCases;
    private final BidCaseCommandService bidCaseCommands;
    private final AppProperties properties;

    public CorpusService(InstitutionMapper institutions, BidCaseMapper bidCases,
                         BidCaseCommandService bidCaseCommands, AppProperties properties) {
        this.institutions = institutions;
        this.bidCases = bidCases;
        this.bidCaseCommands = bidCaseCommands;
        this.properties = properties;
    }

    /** 검사만 — DB 도 파일도 건드리지 않는다. */
    public ValidationReport validate(String institutionId, String rawPath) {
        requireInstitution(institutionId);
        return CorpusValidator.validate(safePath(rawPath));
    }

    /**
     * 코퍼스를 기관에 연결한다.
     *
     * <p>⚠️ <b>여기서 밀려 있던 입찰건이 풀린다.</b> 참여확정은 했지만 코퍼스가 없어
     * {@code research_status='대기'} 로 멈춰 있던 건들을 {@code 완료} 로 바꾸고 팀별
     * 작업을 만든다 — <b>코퍼스 등록이 워크플로의 방아쇠다.</b> 이 부수효과를 빼면
     * 사람이 코퍼스를 넣어도 작업이 영원히 안 생긴다.
     *
     * <p>등록과 활성화가 <b>한 트랜잭션</b>이다. 경로만 붙고 작업이 안 만들어지면
     * 화면상 "코퍼스는 있는데 할 일이 없는" 상태가 되어 원인을 찾기 어렵다.
     */
    @Transactional
    public CorpusRegisterResponse register(String institutionId, String rawPath) {
        requireInstitution(institutionId);

        Path resolved = safePath(rawPath);
        ValidationReport report = CorpusValidator.validate(resolved);
        if (!report.isOk()) {
            // 원본과 같은 모양: 본문이 {"detail": {"errors": [...]}} 다.
            // ⚠️ 경고는 싣지 않는다 — 거절 사유가 아닌 것이 사유 목록에 섞이면
            //    사람이 무엇을 고쳐야 하는지 흐려진다(원본도 errors 만 싣는다).
            throw ApiException.withDetail(422,
                    java.util.Collections.singletonMap("errors", report.getErrors()));
        }

        String relative = relativeToRepo(resolved);
        institutions.updateGiganlistDir(institutionId, relative);

        List<String> activated = new ArrayList<>();
        for (String bidCaseId : bidCases.selectPendingActivation(institutionId)) {
            bidCases.updateResearchStatus(bidCaseId, "완료");
            bidCaseCommands.createTasksForBidCase(bidCaseId);
            activated.add(bidCaseId);
        }

        return new CorpusRegisterResponse(relative, activated, report.getWarnings());
    }

    private void requireInstitution(String institutionId) {
        if (institutions.selectById(institutionId) == null) {
            throw ApiException.notFound("institution not found");
        }
    }

    /**
     * 리포 루트 기준 상대경로만 허용한다 — 원본 {@code _safe_corpus_path}. 위반은 400.
     *
     * <p>⚠️ <b>정규화한 뒤에 울타리를 검사한다.</b> 문자열만 보면
     * {@code corpus/../../etc} 가 통과한다. {@code normalize()} 로 {@code ..} 를 접은
     * 다음 {@code startsWith} 로 확인해야 실제로 막힌다 — 이 순서를 바꾸면 방어가
     * 사라진다.
     *
     * <p>{@code TaskFiles} 의 첨부 경로 방어와 같은 부류이고, 이유도 같다. 이 API 는
     * 사용자가 준 문자열을 그대로 파일시스템에 대는 몇 안 되는 자리다.
     */
    Path safePath(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw ApiException.badRequest("상대경로만 허용됩니다");
        }
        Path candidate = Paths.get(raw.trim());
        if (candidate.isAbsolute()) {
            throw ApiException.badRequest("상대경로만 허용됩니다");
        }
        Path root = repoRoot();
        Path resolved = root.resolve(candidate).normalize();
        if (!resolved.startsWith(root)) {
            throw ApiException.badRequest("리포지토리 밖 경로는 허용되지 않습니다");
        }
        if (!java.nio.file.Files.isDirectory(resolved)) {
            throw ApiException.badRequest("디렉터리가 아닙니다");
        }
        return resolved;
    }

    private Path repoRoot() {
        return Paths.get(properties.getRepoRoot()).toAbsolutePath().normalize();
    }

    /** DB 에는 <b>상대경로</b>로 저장한다 — 절대경로를 넣으면 환경이 바뀔 때 전부 깨진다. */
    private String relativeToRepo(Path resolved) {
        return repoRoot().relativize(resolved).toString().replace('\\', '/');
    }
}
