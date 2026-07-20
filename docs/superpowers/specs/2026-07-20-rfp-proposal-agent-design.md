# RFP 기반 제안서 작성 Agent — 설계 스펙

- 작성일: 2026-07-20 (2026-07-20 15:30경 갱신 — Skill 기반 아키텍처 반영,
  2026-07-20 15:45경 갱신 — `report_archive/` 과거 PPTX 재사용 반영)
- 상태: 승인됨. 단, ①/②단계는 별도로 먼저 구현된 Claude Code Skill
  (`rfp-locate`, `institution-corpus-format`, `docs/superpowers/plans/2026-07-20-agent-data-skills.md`로
  구현 완료·main에 병합됨)을 호출하는 방향으로 아키텍처 수정. 이 문서의 "폴더 구조"·
  "참고한 기존 자료" 섹션은 그에 맞춰 갱신됨(하단 참고). 또한 `report_archive/`(과거에
  작성된 기관별 제안서 PPTX 저장소, `GGReportAgent/` 바로 아래, 현재 이 환경에서는 비어
  있으나 실제 운영 시 데이터가 채워져 있다고 가정)를 ②/④ 단계에 반영.

## 배경 및 목적

GGReportAgent는 서울시 5개 구청(도봉/노원/광진/동대문/동작) 대상 KB 파트너십 제안서를
대화형 세션과 백그라운드 리서치 에이전트로 수작업 제작한 결과물 저장소다. `{district}/spec/`
(기관 리서치 원자료), `{district}/plan/`(실제 제안 문서), `{district}/bank_ideas_draft.txt`
(은행 결합 아이디어 초안), `total/*.docx|html`(최종 통합 산출물)까지 전부 사람이 대화로
지휘해 만들었고, 이를 재현하는 자동화 프로그램은 없었다.

이 스펙은 그 작업 패턴을 프로그램화하는 agent를 정의한다: **새로운 RFP(공고문)가 주어지면,
과거 GGReportAgent 작업물을 참고/재사용해 배점표에 맞춘 제안서(PPTX)를 자동 생성하고,
배점표 커버리지를 스스로 검증하는 멀티에이전트 파이프라인**.

## 범위

**포함**:
- RFP PDF 파싱(텍스트 우선, 이미지 fallback) 및 배점표/요구사항 추출
- 기관 유형 분류(시/구/군/공공기관) 및 기존 기관 데이터 재사용 판단
- 신규 기관일 경우 웹검색 기반 spec 자료 자동 생성(기존 `spec/` 포맷과 동일)
- 배점표 항목에 맞춘 제안서 콘텐츠 작성(GGReportAgent 기존 문서 톤 반영)
- PPTX 슬라이드 렌더링(배점표 자체 포함)
- 배점표 항목별 커버리지 검증 및 미흡 시 재작성 루프(최대 3회)
- 기존 5개 구청 폴더를 `giganlist/` 아래로 통합하는 구조 변경(구현 단계에서 수행)

**제외(이번 스펙 범위 밖)**:
- `total/` DOCX/HTML 산출물 로직 변경(기존 `build_report.py`/`build_html_report.py`는
  `giganlist/` 경로 참조만 수정, 그 외 기능 변경 없음)
- 실시간/대화형 UI (CLI 또는 함수 호출 기반 PoC로 충분)
- 여러 RFP 동시 처리(배치)나 스케줄링

## 아키텍처

**단순 순차 파이프라인**(LangGraph 아님). 이유: 이 워크플로우는 사실상 항상 동일한 순서로
진행되며 분기가 필요한 지점이 없다(검증 실패 시 되돌아가는 것 외). supervisor LLM 호출
비용/지연 없이 디버깅도 쉬움 — PoC 단계에 적합한 과잉설계 회피.

```
① rfp_analysis        rfp-locate Skill 호출 (Claude가 SKILL.md 워크플로우를 직접 수행:
                       RFP/ 탐색 → scripts/extract_text.py로 pypdf 추출 →
                       is_abnormal시 scripts/render_pages.py + Vision fallback →
                       배점표 구조화 → report_new/{institution}/rfp_scoring.json,
                       rfp_text.txt 저장)
                       agent/ 코드는 이 산출물을 읽기만 함 — PDF 파싱 로직을
                       재구현하지 않음
        ↓
② institution_match    기관 유형 분류(시/구/군 지자체 vs 공공기관) 후
                       giganlist/ 아래 기존 기관과 대조
                       - 완전 동일 기관 → 기존 spec/plan 그대로 재사용
                       - 신규 기관 → institution-corpus-format Skill의 포맷 규칙에
                         따라 웹검색 기반 spec/ .txt 신규 생성(giganlist/{new}/spec/)
                       ※ 웹검색(WebSearch/WebFetch)은 Claude Code 하네스 도구이며
                       일반 Python 함수로 호출 불가 — 이 단계는 순수 파이썬 노드가
                       아니라 Claude가 직접 수행하거나 Agent(서브에이전트) 호출로
                       구현해야 함(아래 "아키텍처 수정 사항" 참고)
                       추가로, report_archive/ 아래 동일/유사 기관의 과거 PPTX가
                       있는지 함께 조회(archive_match). 있으면 archive_pptx_path에
                       기록 — ④에서 이 파일을 소비.
        ↓
③ content_writer       배점표 항목별로 섹션 작성. institution-corpus-format Skill의
                       포맷 규칙(번호 섹션, "근거자료: spec/NN" 인용, 축 구조, 요약표,
                       Top3+비고 블록)을 그대로 따름. archive_pptx_path가 있으면 그
                       슬라이드 구성/순서를 구조적 참고 패턴으로 활용(§"과거 PPTX
                       활용 규칙" 참고)
        ↓
④ pptx_builder         배점표 항목 → 슬라이드 매핑, PPTX 렌더링
                       (배점표 자체도 슬라이드로 포함; 항목 과다시 카테고리 그룹핑)
                       archive_pptx_path가 있으면 그 원문 슬라이드를 그대로 복사해
                       "과거 유사제안 참고" 섹션으로 새 PPTX 끝에 별도 추가(원문 수정 없음)
        ↓
⑤ verification         배점표 항목별 커버리지 검사 (누락 항목 탐지)
                       - 누락 발견 시 → ③으로 되돌아가 보완 (최대 3회 재시도)
                       - 3회 초과시 → 미완료 항목 경고 슬라이드 포함해 확정
                       - 완료 시 → 최종 PPTX 확정
```

### 아키텍처 수정 사항 (2026-07-20 15:30 갱신)

1. **①은 이제 별도 Skill**: `rfp-locate`(`.claude/skills/rfp-locate/`)가 PDF 탐색·추출·
   배점표 구조화를 전담. `agent/nodes/rfp_analysis.py`는 `report_new/{institution}/
   rfp_scoring.json`을 읽어 `ProposalState`에 채워 넣는 얇은 어댑터로 축소.
2. **②의 웹검색은 Python 함수가 될 수 없음**: `WebSearch`/`WebFetch`는 Claude Code
   하네스에서만 존재하는 도구이며 `agent/tools/institution_research.py` 같은 순수
   파이썬 모듈이 직접 호출할 방법이 없다(proj2에도 이런 노드가 없었던 이유이기도 함).
   따라서 신규 기관 조사 단계는 다음 중 하나로 구현해야 한다:
   - (권장) Claude가 파이프라인 실행 중 이 단계에서 직접 웹검색을 수행하고
     `institution-corpus-format` Skill 포맷대로 `.txt`를 작성 — `agent/pipeline.py`는
     이 단계를 "Claude가 수행할 하위 작업"으로 표시만 하고 실제 검색은 하지 않음
   - Agent(서브에이전트) 도구로 조사 전용 서브에이전트를 기동해 결과 파일을 쓰게 하고,
     `agent/` 코드는 그 결과 파일의 존재/형식만 검증
   - 순수 자동화(사람 개입 없는 배치 실행)가 필요하다면 별도 LLM API 기반 웹검색
     클라이언트(예: LLM tool-use로 검색 API 연동)를 새로 구축해야 하며, 이는 이번
     PoC 범위 밖(추가 스펙 필요)
3. **③은 institution-corpus-format Skill의 포맷 규칙을 코드로 강제하지 않고 참조**:
   `content_writer` 노드의 프롬프트가 이 Skill의 표/규칙을 인용하되, 실제 파일 포맷
   검증(파일명 패턴, 인용 형식)은 `agent/tools/spec_loader.py`가 가벼운 구조 검사로 수행.
4. **`report_archive/` 과거 PPTX 재사용 추가(2026-07-20 15:45)**: `GGReportAgent/
   report_archive/`는 과거에 작성된 기관별 제안서 PPTX를 보관하는 폴더로, 이번 세션
   기준으로는 비어 있지만 실제 운영 환경에서는 데이터가 채워져 있다고 가정하고 설계한다.
   ②(institution_match) 단계에서 giganlist/ 기관 대조와 별개로 report_archive/도 함께
   조회해 동일/유사 기관의 과거 PPTX 유무를 확인한다. 발견 시:
   - **구조 참고**: 그 PPTX의 슬라이드 순서/구성 패턴을 ③(content_writer)이 새 배점표
     기반 섹션을 설계할 때 참고 템플릿으로 사용(내용은 새로 작성 — giganlist 스타일
     참고와 동일한 성격)
   - **원문 별도 포함**: 동시에 그 PPTX의 슬라이드를 그대로 복사해 최종 PPTX 끝에
     "과거 유사제안 참고" 섹션으로 별도 배치(원문 수정 없이 삽입, 새로 작성한 배점표
     기반 콘텐츠와 명확히 구분)
   두 활용 방식은 상호 배타적이지 않고 함께 적용된다(사용자 확정 사항).

## 데이터 형태

```python
class ProposalState(TypedDict, total=False):
    rfp_path: str
    rfp_text: str
    scoring_table: list[dict]       # [{item, weight, description}, ...]
    requirements: list[dict]        # [{item, category, weight, risk_flag}, ...]
    institution_name: str
    institution_type: str           # "시"/"구"/"군"/"공공기관"
    matched_district: str | None    # giganlist/ 아래 완전 동일 기관 매칭시 폴더명
    institution_spec_dir: str       # 재사용 또는 신규 생성된 spec/ 폴더 경로
    archive_pptx_path: str | None   # report_archive/ 아래 동일/유사 기관 과거 PPTX 경로
    sections: list[dict]            # [{scoring_item, title, content, sources}, ...]
    pptx_path: str
    coverage_report: list[dict]     # [{scoring_item, covered: bool, gap_note}, ...]
    revision_count: int
```

각 역할의 입출력은 위 아키텍처 다이어그램의 단계별 설명과 1:1 대응.

## 기관 매칭 규칙

1. RFP 본문에서 발주 기관명과 기관 유형(시/구/군 지자체 vs 공공기관·공사·공단 등)을 분류
2. `giganlist/` 아래 기존 기관(현재 5개 구청)과 **완전 동일 기관**인지 확인
   - 동일 → 해당 `spec/`, `plan/`을 그대로 로드해 재사용
   - 동일하지 않으면(유형만 유사해도) → 신규 기관으로 취급, `research_institution` 호출
3. 유형 분류가 모호한 경우 LLM에 1회 재질의, 그래도 불확실하면 안전하게 "신규"로 간주
   (과매칭보다 과소매칭이 안전)
4. 5개 구청 자료는 유형이 다르면 참고용 스타일 템플릿으로만 사용(설계 확정 사항)
5. `report_archive/` 아래 동일/유사 기관명의 과거 PPTX 파일명을 별도로 조회(파일명에
   기관명이 포함된다고 가정 — 정확한 명명 규칙은 구현 단계에서 실제 파일 확인 후 확정).
   발견 시 `archive_pptx_path`에 기록 — giganlist 매칭과 독립적으로 병행 판단(giganlist
   매칭이 없어도 archive PPTX만 있을 수 있고, 그 반대도 가능)

## 폴더 구조

```
GGReportAgent/
  agent/                          ← 새 패키지
    __init__.py
    state.py                      # ProposalState
    llm.py                        # get_llm() - proj2 관례 재사용(env var 우선 + getpass fallback)
    pipeline.py                   # 5단계 순차 실행 + verification 재시도 루프
    nodes/
      rfp_analysis.py
      institution_match.py
      content_writer.py
      pptx_builder.py
      verification.py
    tools/
      # pdf_parser.py는 만들지 않음 — rfp-locate Skill(.claude/skills/rfp-locate/)이
      # 이미 scripts/extract_text.py + scripts/render_pages.py로 이 역할을 수행함.
      # rfp_analysis 노드는 그 Skill이 report_new/{institution}/rfp_scoring.json에
      # 남긴 결과를 읽기만 한다.
      institution_research.py      # 신규 기관 조사 결과 파일(.txt)의 존재/형식 검증만
                                    # 담당 — 웹검색 자체는 Claude/서브에이전트가 수행
                                    # (아키텍처 수정 사항 §2 참고)
      spec_loader.py                # giganlist/{institution}/spec,plan/ 로드 +
                                    # institution-corpus-format Skill 규칙 대비
                                    # 파일명 패턴/인용 형식 가벼운 구조 검사
    tests/
      test_rfp_analysis.py
      test_institution_match.py
      test_content_writer.py
      test_pptx_builder.py
      test_verification.py
      fixtures/

  giganlist/                       ← 기관 자료 통합 폴더 (구현 단계에서 이동)
    dobong/            (spec/+plan/+bank_ideas_draft.txt)
    nowon/
    gwangjin/
    dongdaemun/
    dongjak/
    suwon/              ← 신규 기관 조사 시 이 아래 생성 (예시)

  RFP/                              # 기존 - 입력 RFP PDF 위치
  report_new/                       # 기존 - 생성된 PPTX 저장 위치
  report_archive/                   # 기존 - 과거 작성된 기관별 제안서 PPTX 보관
                                    # (이번 세션엔 비어있으나 운영 시 데이터 있다고 가정)
  total/                            # 기존 최종 산출물 (변경 없음)
```

**명명 규칙**: 신규 기관 폴더명은 로마자 표기 소문자(예: 수원시 → `suwon`), `giganlist/`
바로 아래 위치.

**구현 단계에서 함께 처리할 이동 작업**: 기존 5개 구청 폴더를 `giganlist/` 아래로 이동,
`build_report.py`/`build_html_report.py`의 상대경로 참조(`{district}/plan/...`) 수정.

## 에러 처리 & 검증 루프

**① rfp_analysis**
- pypdf 추출 텍스트가 임계치(페이지당 평균 약 50자) 미만이면 이미지/CID 폰트 PDF로 판단
- Fallback: PyMuPDF 페이지 이미지 렌더링 → Vision LLM 순차 전달로 텍스트/배점표 복원
  (도봉구 PDF 선례와 동일 절차, `구청_log.md` 14:11~14:29 참고)
- 배점표가 없는 RFP는 `scoring_table`을 빈 리스트로 두고 경고 로그, ④/⑤는 `requirements`
  기준으로 폴백 동작

**② institution_match**
- 유형 분류 모호 시 LLM 재질의 1회 → 여전히 불확실하면 신규 기관으로 간주

**③↔⑤ 검증 재시도 루프**
- `verification`이 미충족 항목을 `coverage_report`에 담아 `content_writer`로 재진입
- 최대 재시도 3회, 초과시 미완료 항목 경고 슬라이드 포함해 확정(무한루프 방지)
- 재시도마다 `revision_count` 증가, 이전 실패 사유(`gap_note`)를 다음 프롬프트에 포함

**④ pptx_builder**
- 배점표 세부항목이 많으면(예: 20개 이상) 상위 카테고리로 그룹핑해 슬라이드 구성

**로깅**: 각 단계 상태 스냅샷을 `report_new/{run_id}/pipeline_log.json`에 기록, 실패
단계/재시도 횟수 사후 추적 가능.

## 테스트 전략

- 핵심 로직(PDF 파싱, 배점표 매칭, 파일 형식 I/O)은 mock/고정 픽스처로 빠르게 검증
- LLM이 관여하는 부분(신규 기관 조사, 콘텐츠 작성, 검증 판정)은 별도 마커로 표시해
  기본 테스트 실행에서 제외하고, 별도 플래그로 선택적 실제 호출 테스트 수행
- `proj2/rfp_agent/tests/`의 구조를 참고하되 mock 계층을 추가하는 점이 차이

## API 키 처리

`proj2/rfp_agent/llm.py`의 `get_llm()` 관례를 그대로 재사용: 환경변수(`OPENAI_API_KEY`)
우선 확인, 미설정 시 `getpass`로 대화형 입력. CLAUDE.md의 기존 관례(하드코딩 금지, 환경변수/
UI 입력 사용)와 일치.

## 참고한 기존 자료 (재사용 대상)

- `.claude/skills/rfp-locate/` — RFP PDF 탐색·추출·배점표 구조화 Skill(완성, main 병합됨).
  `rfp_analysis` 노드가 호출/소비. `scripts/extract_text.py`(pypdf + 비정상 판정),
  `scripts/render_pages.py`(PyMuPDF fallback), `references/scoring_schema.json`(배점표
  JSON 스키마, 수원시 사례로 검증됨) 포함.
- `.claude/skills/institution-corpus-format/` — spec/plan/bank_ideas_draft 표준 포맷
  Skill(완성, main 병합됨). `content_writer`/`spec_loader`가 이 규칙을 참조.
- `proj2/rfp_agent/state.py` — `AgentState` TypedDict 필드 shape (설계 패턴 참고, 완성
  라이브러리 아님 — `rfp_analysis.py` 노드 하나만 실제 구현되어 있었음)
- `proj2/rfp_agent/llm.py` — `get_llm()` 키 처리 관례
- `{district}/plan/00_제안개요_및_배경.txt`, `bank_ideas_draft.txt` 등 — 문서 톤/포맷 템플릿
  (institution-corpus-format Skill의 레퍼런스로도 발췌되어 있음)
- `구청_log.md` — 도봉구 PDF의 이미지 fallback 필요 사례(CID 폰트)
- `docs/superpowers/plans/2026-07-20-agent-data-skills.md` — 위 두 Skill의 구현 계획(완료)

## 미해결 세부사항 (writing-plans 단계에서 구체화)

- `research_institution`이 생성하는 `.txt` 파일 개수/제목이 조사 가능한 내용에 따라
  유동적인데, 이를 검증하는 `00_인덱스.txt` 자동 생성 로직의 구체 알고리즘
- 배점표 항목과 섹션/슬라이드 매핑 시 항목명 간 유사도 판정 방식(임베딩 vs LLM 직접 매핑)
  — PoC 단계이므로 LLM 직접 매핑으로 시작하는 것을 권장하되 최종 결정은 구현 계획에서
