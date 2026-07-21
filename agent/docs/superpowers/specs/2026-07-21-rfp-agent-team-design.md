# RFP 제안서 에이전트 팀 — 확장 가능한 end-to-end 파이프라인 설계

## 배경

`agent/` 폴더에는 이미 LangGraph 스타일 파이프라인(`institution_match_node` →
`content_writer_node`/`verification_node` 반복 → `pptx_builder_node`)이 구현되어 있다.
이 파이프라인은 "RFP 배점표와 institution spec이 이미 주어졌다"는 전제에서 시작하며,
`giganlist/{구}/spec/`을 읽어 제안서 섹션을 채우는 역할까지만 담당한다.

이번에 채우려는 공백은 그 앞뒤 두 곳이다:

1. **RFP를 어떻게 찾아오는가** — 지금은 `institution_name`을 사람이 입력해야 시작된다.
2. **spec/plan/bank_ideas_draft를 어떻게 만드는가** — 기존 25개구는 이미 리서치가
   끝나 있지만, 신규 기관(giganlist에 없는 구)이 들어오면 이 산출물이 없다.

목표는 "기관명(또는 RFP 관련 키워드)만 입력하면 RFP 탐색 → (신규 기관이면) spec/plan/
bank_ideas_draft 생성 → 보고서 작성 → PPT 생성까지" 자동으로 수행하는, 특정 구 하나에
종속되지 않는 확장 가능한 단일 파이프라인이다.

## 전체 흐름

```
$ python -m agent.main "서초구 금고 지정 공고"

[1/6] rfp_locate_node         — rfp-locate 스킬로 RFP PDF 탐색/확보
[2/6] institution_match_node  — giganlist 기존 구 매칭 or 신규 판정 (기존 코드 재사용)
        ├─ 기존 구 매칭 → spec 이미 있음, 3단계 스킵
        └─ 신규 기관   → spec_research_node로 진행
[3/6] spec_research_node      — (신규 기관만) WebSearch/WebFetch로 예산·홈페이지·
        민원게시판 조사 → institution-corpus-format 규격대로
        giganlist/{신규구}/spec/ 생성
        → 🛑 사용자 검토/승인 체크포인트 (파이프라인의 유일한 정지점)
[4/6] plan_writer_node        — spec 기반 plan/(00_제안개요 ~ 05_검증결과) +
        bank_ideas_draft.txt 생성 (신규 노드, institution-corpus-format 규격 준수)
[5/6] content_writer_node /
      verification_node       — RFP 배점표 커버리지 반복 (기존 코드 재사용)
[6/6] pptx_builder_node       — 최종 PPT 생성 (기존 코드 재사용)
```

기존 구 매칭 시에는 2단계 이후 바로 5단계로 넘어가므로, 체크포인트 없이 완전 자동
진행된다. 체크포인트는 "신규 기관 리서치가 틀렸을 수 있다"는 리스크에만 걸려 있다.

## 핵심 설계 결정

1. **기존 `agent/` 노드는 변경 없이 재사용한다.** `institution_match_node`,
   `content_writer_node`, `verification_node`, `pptx_builder_node`는 그대로 둔다.
   새로 만드는 노드는 `rfp_locate_node`, `spec_research_node`, `plan_writer_node`
   3개뿐이다.
2. **확장성은 분기가 아니라 상태로 표현한다.** 신규 기관이든 기존 25개구든 진입점은
   동일한 `python -m agent.main "<기관명>"`이며, `institution_match_node`가 채우는
   `matched_district`/`institution_spec_dir` 필드의 존재 여부로 파이프라인이 3단계를
   실행할지 스킵할지 스스로 결정한다. 새 노드를 추가할 지역/기관 종류별로 만들 필요가
   없다.
3. **체크포인트는 spec 생성 직후 1곳뿐이다.** plan→보고서→PPT는 자동 진행한다. 이는
   기존 25개구 작업에서 spec/plan 품질을 `05_검증결과`(사후 신뢰도 점수)로 걸러온
   관행과 일치시킨 것이다.
4. **스킬을 노드 안에서 그대로 재사용한다.** `rfp_locate_node`는 rfp-locate 스킬의
   탐색 로직을 호출하고, `spec_research_node`/`plan_writer_node`는
   institution-corpus-format 스킬의 포맷 규격을 프롬프트에 그대로 주입해 giganlist와
   동일한 산출물 포맷을 강제한다.
5. **실행 방식은 CLI 스크립트.** `python -m agent.main "<기관명>"` — 기존
   `agent/pipeline.py`의 `run_pipeline()` 구조와 일관되게, 터미널에서 한 번에 전 단계를
   실행한다.

## 미확정 사항 / 다음 설계에서 다룰 것

- `spec_research_node`/`plan_writer_node`는 WebSearch/WebFetch 같은 도구 호출이
  필요한데, 현재 `agent/llm.py`의 `get_llm()`은 순수 텍스트 LLM 반환 구조라 도구
  바인딩 확장이 필요할 수 있다. 구현 계획(writing-plans) 단계에서 `get_llm()`
  확장 여부 또는 별도 도구 호출 경로를 정한다.
- `rfp_locate_node`가 rfp-locate 스킬을 "노드 코드 안에서" 어떻게 호출할지(서브프로세스/
  서브에이전트 위임 등 구체 메커니즘)는 미정 — 구현 계획에서 확정.
- 신규 기관 판정 시 `institution_spec_dir`를 새로 어느 경로(`giganlist/{신규구}/spec`)에
  쓸지, 디렉터리명 규칙(영문 슬러그 등 기존 25개구 관례를 따름)을 구현 계획에서 명시한다.

## 범위 밖 (이번 스펙에서 다루지 않음)

- 나라장터 등 공고 사이트의 주기적 크롤링/모니터링 — 이번엔 "이미 아는 RFP 1건"으로
  end-to-end를 먼저 검증하기로 결정. 모니터링은 파이프라인 검증 후 별도 스펙으로 추가.
