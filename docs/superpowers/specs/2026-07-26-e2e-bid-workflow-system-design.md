# 입찰~제안서 제출 End-to-End 워크플로우 시스템 설계 문서

- **작성일**: 2026-07-26
- **상태**: 확정 (브레인스토밍 승인 완료)
- **위치**: 신규 (기존 `dashboard/` · `report/` · `agent/` 를 컴포넌트로 흡수하는 상위 시스템)
- **선행 스펙**: `agent/docs/superpowers/specs/2026-07-21-rfp-agent-team-design.md`
  (agent 파이프라인 확장안). **본 문서가 그 상위 설계이며, 선행 스펙의 핵심 결정 #4/#5
  (Claude Agent SDK 서브에이전트로 스킬 재사용 / CLI 단독 실행)는 폐쇄망 제약과 충돌해
  본 문서의 아키텍처로 대체된다.** 선행 스펙의 노드 분해(`rfp_locate_node`/
  `spec_research_node`/`plan_writer_node`) 아이디어 자체는 유효하며 아래 ④에 흡수했다.

---

## ① 목적 / 범위

사용자가 실제로 수행하는 입찰~제안 업무를 9단계로 정리했다:

```
입찰현황 파악(종합적 분석) → 입찰 상황 발생 → RFI 공시 → RFI 분석 →
제안서 기획 → 제안서 세부기획(영업팀/전산팀/예산팀) →
제안서 취합(디자이너 작업) → 제안서 검토(오탈자/RFI 비교 분석) → 제안서 제출
```

목표는 이 9단계 전체를 수행하는 **하나의 시스템**을 구축하는 것이다. 기존
`dashboard/`(대시보드 UI) · `report/`(산출물 뷰) · `agent/`(LangGraph 파이프라인)는
이 시스템을 구성하는 **컴포넌트/프로토타입**으로 재편입되며, 그 자체가 목표가 아니다.

**핵심 제약 3가지**

1. **배포 형태**: 운영은 완전 물리적 망분리가 원칙이나, 실제로는 **부분 폐쇄망**
   — 1~3단계(공개 데이터)는 클라우드 DMZ, 4~9단계(민감정보)는 폐쇄망.
2. **LLM**: 폐쇄망에서 사용 가능한 로컬 서빙 오픈소스 모델만 사용. 현재 확보된
   모델은 **GPT-OSS 120B** 1종뿐이나, 모델 교체가 예상되므로 어댑터로 분리.
3. **두 트랙, 동일 코드베이스**: Track 1(로컬 완전 폐쇄망 운영) / Track 2(AWS+Vercel
   클라우드 데모·설득용, LLM은 폐쇄망과 동일하게 자체 호스팅 오픈소스 모델만 사용).
   환경변수(엔드포인트 URL·저장소 위치 등)로만 갈라지고 코드 분기는 없다.

**범위 밖**

- 나라장터 등 공고 사이트의 실시간 크롤링 세부 구현(1~2단계 "탐지" 로직 자체) —
  이번 설계는 그 탐지 결과를 **입력으로 받는 이후 구조**를 다룬다. 크롤링 소스/주기는
  별도 스펙.
- 실제 AWS 계정/인프라 프로비저닝 절차(IAM, VPC 등 구체 설정값) — writing-plans
  단계에서 배포 첫 마일스톤(AWS FastAPI hello-world 배포·접속확인)으로 다룬다.

---

## ② 전체 아키텍처

```
┌─────────────────── 클라우드 DMZ (인터넷 연결, 공개데이터만) ───────────────────┐
│  FastAPI (AWS)                                                              │
│   1단계 입찰현황 파악 ─ 2단계 입찰상황 발생 ─ 3단계 RFI 공시                   │
│   산출: CSV export (등록기관/공고 목록)                                       │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │  반입 게이트 (수동 파일 이동)
                                 ▼
┌─────────────────── 폐쇄망 (민감정보, 외부 연결 없음) ─────────────────────────┐
│  Next.js (프론트) + FastAPI (백엔드) — 로컬 프로세스                          │
│   CSV 업로드(기존 dashboard 기능 재사용) → registry(SQLite) upsert            │
│   4단계 RFI분석 → 5단계 제안서기획 → 6단계 세부기획(3팀) →                    │
│   7단계 취합 → 8단계 검토 → 9단계 제출(사람)                                  │
│   LLM: GPT-OSS 120B, LAN 전용 OpenAI-호환 엔드포인트                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Track 1(운영)**: 위 그림 그대로. Next.js·FastAPI 모두 폐쇄망 내부 로컬 프로세스.
- **Track 2(데모)**: DMZ와 폐쇄망 구분 없이 **AWS(FastAPI 백엔드) + Vercel(Next.js
  프론트)** 로 전체를 클라우드에 배포. LLM은 AWS 내 자체 호스팅 GPT-OSS 120B(또는
  대체 오픈소스 모델) 엔드포인트만 호출 — 상용 API(OpenAI/Anthropic) 호출 금지.
- 코드 갈림은 없고 `.env`의 `LLM_BASE_URL`, `REGISTRY_DB_PATH`, `DEPLOY_TRACK` 등
  값만 다르다.

---

## ③ 레지스트리 스키마 & 저장소 전환

현재 기관 식별자가 4곳에 분산되어 있다(`dashboard/data/institutions.js`의 한글명+
지역코드, `giganlist/` 영문 슬러그 폴더명, `agent/state.py`의 `institution_name`/
`matched_district`, `report/build_html_report.py`의 하드코딩 dict). 이를
`institution_id`(신규 canonical 키, `giganlist/{id}/` 폴더명과 강제 일치)로 통합한다.

| 필드 | 설명 |
|---|---|
| `institution_id` | 신규 canonical 슬러그 (giganlist 폴더명과 일치) |
| `name_ko` | 화면 표시용 한글명 |
| `region_code` | 지역 표준코드 |
| `type` | 지자체/대학병원/공공기관/공기업 |
| `contract_end` / `last_bid` / `term` | 기존 dashboard 스키마 유지 |
| `stage` | **신규**, 1~9 정수. 워크플로우 현재 위치 |
| `giganlist_dir` | `institution_spec_dir` 매핑 |
| `rfp_path` / `scoring_table` | agent/state.py에서 이관 |
| `pptx_path` | 최종 산출물 경로 |

**저장소 전환**: 현재 `dashboard/js/store.js`는 브라우저 `localStorage`가 유일한
저장소다. 이를 **서버 SQLite 파일**로 이관해 팀 전체가 하나의 상태를 공유하는
authoritative store로 삼는다. `localStorage`는 개인 UI 선호(관심기관 ♥, 정렬순서
등)만 남긴다.

**DMZ 반입 게이트**: DMZ FastAPI가 위 필드 중 1~3단계 해당분(공개데이터)만 CSV로
export → 폐쇄망에서는 **기존 dashboard CSV 업로드 기능을 그대로 재사용**해 반입,
`institution_id` 기준 upsert(이름 매칭 실패 시 신규 슬러그 발급).

---

## ④ 9단계 상태머신 + API

| 단계 | 실행 위치 | 로직(신규/재사용) | 체크포인트 |
|---|---|---|---|
| 1 입찰현황 파악 | DMZ | 신규: 모니터링 수집 | — |
| 2 입찰상황 발생 | DMZ | 신규: 트리거 감지 → CSV export | — |
| 3 RFI 공시 | DMZ / 수동 | 신규: `rfp_locate_node`(선행스펙 아이디어 재사용, Claude Agent SDK 의존 제거하고 순수 requests/parsing으로 재구현) | — |
| 4 RFI 분석 | 폐쇄망 | 재사용: `rfp_analysis_node` | — |
| 5 제안서 기획 | 폐쇄망 | 신규: `spec_research_node`/`plan_writer_node`(선행스펙 아이디어 재사용) | 🛑 spec 검토 승인 |
| 6 세부기획(3팀) | 폐쇄망 | 신규: `content_writer_node` 역할분화(⑤ 참조) | — |
| 7 취합 | 폐쇄망 | 재사용: `pptx_builder_node` | — |
| 8 검토 | 폐쇄망 | 확장: `verification_node`(오탈자·RFI 역대조 추가) | 🛑 최종 검수 승인 |
| 9 제출 | 사람 | `stage`를 "제출완료"로 마킹만 | — |

`registry.stage` 값이 전체를 구동한다: `advance` 호출 시 현재 `stage`에 대응하는
노드만 실행하고, 완료되면 `stage+1`로 갱신한다.

**API 엔드포인트**

```
GET  /institutions                  # 목록 (대시보드 뷰 백업)
GET  /institutions/{id}             # 상세
POST /institutions/import           # DMZ→폐쇄망 CSV 반입 (기존 업로드 UI 재사용)
POST /institutions/{id}/advance     # 현재 stage에 맞는 파이프라인 노드 실행 (4단계~)
GET  /institutions/{id}/status      # 진행상황 폴링 (6단계 병렬팀 특히 필요)
POST /institutions/{id}/checkpoint  # 🛑 지점 승인/반려
GET  /institutions/{id}/artifacts   # spec/plan/pptx 등 산출물 목록
```

---

## ⑤ 6단계 AI 팀(영업/전산/예산) 분화

**콘텐츠 생성 원칙(하이브리드)**: 로컬 오픈소스 모델의 한국어 품질 불확실성 때문에,
본문/근거는 `giganlist/{id}/spec,plan,bank_ideas_draft.txt` 코퍼스에서 조립하고
**LLM은 문장 다듬기(polish)만** 수행한다. 자유생성으로 인한 할루시네이션 리스크를
최소화하는 것이 목적이며, 기존 `agent/nodes/content_writer.py`의 단일 작성자 패턴을
3역할로 나누되 이 원칙은 그대로 유지한다.

**라우팅**: `role_router_node` — `scoring_table` 각 항목을 규칙기반 키워드로 3팀에
배정("예산/가격/비용"→예산팀, "IT/시스템/전산/플랫폼"→전산팀, 그 외→영업팀). 애매한
항목만 LLM 분류로 폴백(분류는 자유생성이 아니라 저위험 작업).

| 역할 | 담당 범위 | 근거 코퍼스 |
|---|---|---|
| 영업팀 | 협력취지/기관수요/관계형성 | `spec/`(민원게시판, 사업목록) + `bank_ideas_draft.txt` |
| 전산팀 | IT/디지털 구현 타당성 | `plan/02_IT디지털기획_사업제안` |
| 예산팀 | 가격/예산/ROI | `plan/03_금전적지원_사업제안` |

**실행**: `content_writer_node`를 3벌로 복제해 역할별 코퍼스만 바꿔 LangGraph
병렬 분기로 실행한다. `ProposalState.sections`를 `Annotated[list[dict], operator.add]`
로 변경해 병렬 결과가 자동 병합되도록 한다 — 별도 merge 노드 불필요. 이후
`verification_node`는 병합된 전체 `sections`에 대해 기존 로직 그대로 1회 실행한다.

체크포인트는 6단계에 추가하지 않는다 — 사람 검토는 5단계(spec 승인)·8단계(최종검수)
2곳에만 둔다(선행스펙의 "체크포인트 최소화" 원칙을 그대로 계승).

---

## ⑥ LLM 백엔드 어댑터

`agent/llm.py`의 `get_llm()`은 이미 `langchain_openai.ChatOpenAI` 기반이라
OpenAI-호환 엔드포인트라면 어느 모델이든 `base_url` 교체만으로 붙는다.

```python
def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    return ChatOpenAI(
        model=os.environ["LLM_MODEL"],       # 기본값 "gpt-oss-120b"
        base_url=os.environ["LLM_BASE_URL"],  # 폐쇄망 LAN 엔드포인트 or 클라우드 자체호스팅
        api_key=os.environ.get("LLM_API_KEY", "not-needed"),
        temperature=temperature,
    )
```

모델 교체(gemma/Llama4/GLM 등)는 `.env`만 바꾸면 되고 코드 변경이 없다. 하드코딩된
`"gpt-4o-mini"`와 `getpass()` API 키 입력 방식은 제거 대상.

---

## ⑦ 기존 코드 영향 범위

- **`agent/state.py`**: `ProposalState`에 `role_assignments`(역할 라우팅 결과) 추가,
  `sections`를 reducer 적용 필드로 변경.
- **`agent/llm.py`**: ⑥의 어댑터 방식으로 교체.
- **`agent/nodes/content_writer.py`**: 역할별 코퍼스 파라미터를 받도록 확장(3개
  role-scoped 인스턴스로 재사용, 코드 중복 최소화).
- **`agent/pipeline.py`**: 신규 노드(`rfp_locate_node`, `spec_research_node`,
  `plan_writer_node`, `role_router_node`) 삽입 + 병렬 분기 그래프로 재구성.
- **`dashboard/js/store.js`**: 서버 API(`GET/POST /institutions*`) 호출로 교체,
  개인 선호값만 localStorage 유지.
- **`dashboard/` → Next.js 이관**: 기존 정적 JS 자산(지도 렌더링, CSV
  파싱/내보내기 로직)은 컴포넌트로 이식, 신규로 재작성하지 않는다.
- **`report/build_html_report.py`**: 하드코딩 dict(`district_colors`,
  `trust_scores` 등)를 registry 조회로 대체 — 산출물 렌더링은 유지, 데이터 소스만 교체.

---

## ⑧ 구현 순서 (writing-plans 단계에서 세부 계획 분리)

본 스펙은 범위가 넓어 단일 구현계획으로 묶지 않고, 아래 순서의 **sub-project**로
나눠 각각 별도 plan을 작성한다(설계는 본 문서 하나로 충분, 계획만 분리):

0. **레지스트리**: SQLite 스키마 + `institutions` API (③④)
1. **DMZ FastAPI (AWS)**: 1~3단계, hello-world 배포·접속확인 마일스톤 먼저
2. **폐쇄망 백엔드 코어**: 4·7·8단계(기존 노드 재사용) + CSV 반입 게이트
3. **agent 신규 노드**: `rfp_locate_node`/`spec_research_node`/`plan_writer_node`
4. **6단계 3팀 분화**: `role_router_node` + `content_writer_node` 역할 분화
5. **Next.js 프론트**: 기존 dashboard 자산 이식
6. **Track 2 배포**: AWS+Vercel 클라우드 데모 구성

---

## 스펙 자체 검증 메모

- 플레이스홀더(TBD 등) 없음.
- ②(아키텍처)·④(상태머신)·⑤(6단계 팀)가 서로 모순 없이 일관: DMZ=1~3, 폐쇄망=4~9,
  체크포인트는 5·8 두 곳뿐이라는 원칙이 전 섹션에서 동일하게 유지됨.
- 범위가 넓어 ⑧에서 구현 순서를 sub-project로 명시 분리해 단일 계획 과부하를 방지.
- "체크포인트"·"코퍼스"·"반입 게이트" 등 용어는 최초 등장 시 정의를 병기해 중의성 제거.
