# 5-report 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `report/5-report.html`을 서울 25개 자치구 지도 기반의 단일 자립형 HTML 대시보드로 채운다. 5개 대상구(도봉·노원·광진·동대문·동작)는 활성 데이터를 담고, 나머지 20개 구는 확장을 위한 빈 자리로만 존재한다.

**Architecture:** 외부 라이브러리 없는 단일 HTML 파일(인라인 CSS+JS). 데이터는 파일 상단 `<script>`의 `DISTRICTS` 객체(JSON 문법)에 전부 내장. 좌측 사이드바(대시보드/리포트 탭) → 대시보드 탭은 SVG 지도(클릭 시 구가 전체화면으로 확장, 내부 3개 서브탭) → 리포트 탭은 주제별 5구 비교 그리드.

**Tech Stack:** 순수 HTML/CSS/JavaScript(ES2017+), Node.js는 테스트(데이터 검증)용으로만 사용, 브라우저 런타임 의존성 없음.

## Global Constraints

- 외부 CDN·폰트·라이브러리 사용 금지 — 파일 하나로 오프라인 완전 작동해야 함(스펙 §1, §5)
- `DISTRICTS` 데이터 블록은 `JSON.parse`로 파싱 가능한 순수 JSON 문법으로 작성(주석·트레일링 콤마·따옴표 없는 키 금지) — 테스트에서 정규식으로 추출해 파싱하기 때문
- 25개 구 전부 `DISTRICTS`에 키로 존재해야 함, 활성 5개 외 20개는 `name`/`active:false`/`mapCell`만 있으면 됨(스펙 §3-1)
- 다크/라이트 모드 둘 다 `prefers-color-scheme`로 대응(스펙 §5)
- 이 저장소는 git 저장소가 아니므로 각 태스크의 "커밋" 스텝은 **생략**하고, 대신 태스크 완료 시 파일 저장 확인만 한다
- **spec 기반 사실(조사자료)은 절대 추측/창작 금지** — `issues`, `score`, `budget`, `validation`의 `rationale` 등 spec에서 확인된 사실을 담는 필드는 반드시 `report/5-report.md` 원문에서 그대로 인용한다(원문에 없으면 빈 값이 아니라 원문을 다시 읽어서라도 정확히 채운다). 반면 `bank_idea_draft.txt`에서 가져오는 `bankIdeas`는 그 문서 자체가 spec 사실에 기반한 새로운 제안(아이디어)을 담고 있으므로, 문서에 적힌 제안 내용을 그대로 옮기는 것은 "창작"이 아니라 정상적인 인용이다 — 구분 기준은 "내가 새로 지어내는가"이지 "제안성 내용인가"가 아니다.

---

## Task 1: 파일 스캐폴딩 + 25개 구 데이터 골격 + 검증 하네스

**Files:**
- Create: `report/5-report.html`

**Interfaces:**
- Produces: `DISTRICTS` 객체(25개 키), `switchTab(tab)` 함수, `#tab-dashboard`/`#tab-report` 컨테이너 — 이후 모든 태스크가 이 위에 내용을 채움

- [ ] **Step 1: `report/5-report.html` 파일 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>서울시 5개 구청 사업제안 대시보드</title>
<style>
  :root {
    --bg:#0f0f1a; --panel:#14142a; --panel2:#1c1c34; --border:#2a2a4a;
    --text:#eee; --muted:#9999bb; --accent:#6c8cff;
    --score-good:#2ecc71; --score-mid:#f39c12; --score-bad:#e94b3c;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg:#f4f5fa; --panel:#ffffff; --panel2:#eef0f8; --border:#dde1ee;
      --text:#1a1a2e; --muted:#666688; --accent:#3355dd;
    }
  }
  * { box-sizing:border-box; }
  html, body { height:100%; margin:0; }
  body { font-family:-apple-system,"Segoe UI","Malgun Gothic",sans-serif; background:var(--bg); color:var(--text); }
  #app-shell { display:flex; height:100vh; min-height:480px; }
  #sidebar { width:160px; background:var(--panel); border-right:1px solid var(--border); padding:20px 0; flex-shrink:0; }
  .nav-item { padding:14px 20px; cursor:pointer; font-size:14px; font-weight:600; border-left:3px solid transparent; opacity:.6; user-select:none; }
  .nav-item.active { border-left-color:var(--accent); background:rgba(108,140,255,.12); opacity:1; }
  #main-area { flex:1; position:relative; overflow:auto; }
  .tab-panel { display:none; position:absolute; inset:0; }
  .tab-panel.visible { display:block; }
</style>
</head>
<body>
<div id="app-shell">
  <div id="sidebar">
    <div class="nav-item active" data-tab="dashboard" onclick="switchTab('dashboard')">🗺 대시보드</div>
    <div class="nav-item" data-tab="report" onclick="switchTab('report')">📊 리포트</div>
  </div>
  <div id="main-area">
    <div id="tab-dashboard" class="tab-panel visible"></div>
    <div id="tab-report" class="tab-panel"></div>
  </div>
</div>
<script>
const DISTRICTS = {
  "dobong": {"name":"도봉구","active":true,"mapCell":"dobong"},
  "nowon": {"name":"노원구","active":true,"mapCell":"nowon"},
  "gwangjin": {"name":"광진구","active":true,"mapCell":"gwangjin"},
  "dongdaemun": {"name":"동대문구","active":true,"mapCell":"dongdaemun"},
  "dongjak": {"name":"동작구","active":true,"mapCell":"dongjak"},
  "eunpyeong": {"name":"은평구","active":false,"mapCell":"eunpyeong"},
  "gangbuk": {"name":"강북구","active":false,"mapCell":"gangbuk"},
  "seodaemun": {"name":"서대문구","active":false,"mapCell":"seodaemun"},
  "jongno": {"name":"종로구","active":false,"mapCell":"jongno"},
  "seongbuk": {"name":"성북구","active":false,"mapCell":"seongbuk"},
  "jungnang": {"name":"중랑구","active":false,"mapCell":"jungnang"},
  "mapo": {"name":"마포구","active":false,"mapCell":"mapo"},
  "junggu": {"name":"중구","active":false,"mapCell":"junggu"},
  "yongsan": {"name":"용산구","active":false,"mapCell":"yongsan"},
  "seongdong": {"name":"성동구","active":false,"mapCell":"seongdong"},
  "gangseo": {"name":"강서구","active":false,"mapCell":"gangseo"},
  "yangcheon": {"name":"양천구","active":false,"mapCell":"yangcheon"},
  "yeongdeungpo": {"name":"영등포구","active":false,"mapCell":"yeongdeungpo"},
  "seocho": {"name":"서초구","active":false,"mapCell":"seocho"},
  "gangnam": {"name":"강남구","active":false,"mapCell":"gangnam"},
  "songpa": {"name":"송파구","active":false,"mapCell":"songpa"},
  "gangdong": {"name":"강동구","active":false,"mapCell":"gangdong"},
  "guro": {"name":"구로구","active":false,"mapCell":"guro"},
  "geumcheon": {"name":"금천구","active":false,"mapCell":"geumcheon"},
  "gwanak": {"name":"관악구","active":false,"mapCell":"gwanak"}
};
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab===tab));
  document.getElementById('tab-dashboard').classList.toggle('visible', tab==='dashboard');
  document.getElementById('tab-report').classList.toggle('visible', tab==='report');
}
</script>
</body>
</html>
```

- [ ] **Step 2: 데이터 골격 검증**

Run:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
const m=html.match(/const DISTRICTS = (\{[\s\S]*?\});/);
if(!m) throw new Error('DISTRICTS block not found');
const data=JSON.parse(m[1]);
const keys=Object.keys(data);
console.assert(keys.length===25, 'expected 25 districts, got '+keys.length);
const active=keys.filter(k=>data[k].active===true);
console.assert(active.length===5, 'expected 5 active, got '+active.length);
console.assert(JSON.stringify(active.sort())===JSON.stringify(['dobong','dongdaemun','dongjak','gwangjin','nowon']), 'active set mismatch: '+active);
console.log('OK: 25 districts, 5 active');
"
```
Expected: `OK: 25 districts, 5 active`

- [ ] **Step 3: 브라우저 수동 확인**

`report/5-report.html`을 브라우저로 열어 사이드바에 "🗺 대시보드"/"📊 리포트" 두 항목이 보이고, "📊 리포트"를 클릭하면 강조 표시가 옮겨가는지 확인(내용은 아직 비어있는 게 정상).

---

## Task 2: 도봉구 데이터 채우기

**Files:**
- Modify: `report/5-report.html` (DISTRICTS.dobong)

**Interfaces:**
- Consumes: Task 1의 `DISTRICTS.dobong` 스텁
- Produces: `DISTRICTS.dobong`에 `score, budget, issues[], itProjects[], fnProjects[], validation[], verdictScore, verdictBasis, bankIdeas{categories,top3}` 필드 완성 — 이후 모든 렌더링 태스크가 이 shape을 그대로 사용

- [ ] **Step 1: `dobong/bank_idea_draft.txt`를 읽고 은행 아이디어를 카테고리별로 정리**

파일 전체를 읽어 문서 안의 카테고리 구분(예: 소상공인금융/청년금융/IT·데이터협력/주택금융/PF·신디케이트론 등, 실제 문서의 소제목을 그대로 카테고리명으로 사용)별로 아이디어 제목만 추출하고, 문서의 "Top 3 추천"(또는 이에 상응하는 우선순위 절)에 나열된 항목을 top3로 뽑는다.

- [ ] **Step 2: `DISTRICTS.dobong`을 아래로 교체**

```json
"dobong": {
  "name":"도봉구","active":true,"mapCell":"dobong",
  "score":74,
  "budget":"20~30억원 (구 예산 7,919억원 대비 약 0.25~0.4%)",
  "issues":[
    "4개년계획 121개 사업 중 표본조사한 88개 중 27%(24개) 확인안됨, 5장 청렴행정도시 확인율 18%로 최저",
    "민원 채널 4종 이상 파편화, '구청장에게 바란다'는 답변완료 표시 없이 처리경과 추적 곤란",
    "2026년 최다 민원: 창동역 민자역사 출입구·보행로 신설 요청 집중",
    "간판개선·언덕길 열선 등 소규모 생활사업은 예산 배정에도 검색 자체가 안 됨"
  ],
  "itProjects":[
    {"code":"전산화지원사업1","name":"도봉구 통합 사업정보 검색 플랫폼 구축","budget":"450~600백만원","priority":"최우선","basis":"88개 표본 중 27%(24개) 미확인"},
    {"code":"전산화지원사업2","name":"민원 처리 현황 통합 대시보드 & 알림톡 연동","budget":"300~450백만원","priority":"최우선","basis":"민원 채널 파편화"},
    {"code":"전산화지원사업3","name":"창동역 일대 공사구간 스마트 보행안전 시스템","budget":"180~250백만원","priority":"상","basis":"2026년 최다민원"},
    {"code":"전산화지원사업4","name":"소규모 생활사업 홍보 자동화(SNS/지도 매시업)","budget":"80~120백만원","priority":"중","basis":"소규모사업 저인지도"}
  ],
  "fnProjects":[
    {"code":"금융지원사업1","name":"소상공인 간판개선·시설현대화 매칭 지원금 확대","budget":"500~800백만원(기존 대비 증액)","priority":"상","basis":"간판개선 확인안됨"},
    {"code":"금융지원사업2","name":"창동역 공사기간 인근 상가 영업피해 완충 지원금","budget":"300~500백만원","priority":"상","basis":"GTX-C 장기공사"},
    {"code":"금융지원사업3","name":"청년 디지털 창업 인턴십 확대","budget":"200~300백만원","priority":"중","basis":"청년인턴십 확인됨(확대여지)"}
  ],
  "validation":[
    {"code":"전산화지원사업1","overlap":"신규(단, 주의 필요)","grade":"중","rationale":"기존 계획사업(5-3 스마트데이터 허브센터, 5,000백만원)과 중복 검토 없이 완전 신규처럼 제안됨","recommendation":"5-3 사업과의 관계(통합/대체/역할분담) 명시할 것"},
    {"code":"전산화지원사업2","overlap":"신규","grade":"상","rationale":"실제 확인된 문제(4채널 분산, 옴부즈만 완료율 100% vs 타채널 처리중)를 정확히 근거로 삼음","recommendation":"없음(가장 근거가 탄탄한 제안)"},
    {"code":"전산화지원사업3","overlap":"신규(기존 대형사업의 공백 보완)","grade":"상","rationale":"CCTV 스마트안전도시 인용이 '확인됨'이 아니라 '부분확인'이었음(근거 등급 과장)","recommendation":"CCTV 인용 등급을 부분확인으로 정정할 것"},
    {"code":"전산화지원사업4","overlap":"신규(기존 사업들의 홍보 보완)","grade":"상","rationale":"소규모 생활사업 저인지도 패턴 정확히 인용","recommendation":"없음"},
    {"code":"금융지원사업1","overlap":"확장(기존 사업의 방식 전환)","grade":"중","rationale":"간판개선사업과 시설현대화사업을 같은 계열로 묶은 서술의 근거가 약함","recommendation":"두 사업이 실제 같은 예산 항목인지 사실 확인 필요"},
    {"code":"금융지원사업2","overlap":"신규","grade":"중","rationale":"지원단가(월 20~30만원)가 근거 없는 추정치","recommendation":"지원단가 근거 구체화 또는 추정치임을 명시"},
    {"code":"금융지원사업3","overlap":"확장","grade":"상","rationale":"기존 청년인턴십 사업의 자연스러운 확장, 근거 인용 정확","recommendation":"없음"}
  ],
  "verdictScore":74,
  "verdictBasis":"IT-1의 기존 계획사업 중복 미검토(-15), IT-3의 CCTV 인용 오류(-7), FN-1/FN-2의 근거 부족 추정치(-4). 100-15-7-4=74점.",
  "bankIdeas":{
    "categories": {"__READ_FROM_SOURCE__": "Step 1에서 dobong/bank_idea_draft.txt를 읽고 실제 카테고리명과 아이디어 제목으로 이 객체를 채운다. 예: {\"소상공인금융\":[\"...\",\"...\"], \"청년금융\":[\"...\"]}"},
    "top3": ["__READ_FROM_SOURCE__: Step 1의 Top3 목록으로 교체"]
  }
}
```

**주의:** `bankIdeas` 필드의 `__READ_FROM_SOURCE__` 플레이스홀더는 반드시 Step 1에서 읽은 실제 파일 내용으로 교체한다 — 최종 커밋 시 이 문자열이 남아있으면 안 됨(Step 3에서 검증).

- [ ] **Step 3: 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
const m=html.match(/const DISTRICTS = (\{[\s\S]*?\});/);
const data=JSON.parse(m[1]);
const d=data.dobong;
console.assert(d.itProjects.length===4, 'dobong itProjects should be 4');
console.assert(d.fnProjects.length===3, 'dobong fnProjects should be 3');
console.assert(d.validation.length===7, 'dobong validation should be 7 entries');
console.assert(!JSON.stringify(d).includes('__READ_FROM_SOURCE__'), 'placeholder still present in dobong.bankIdeas');
console.assert(Object.keys(d.bankIdeas.categories).length>0, 'bankIdeas.categories empty');
console.assert(d.bankIdeas.top3.length>=3, 'bankIdeas.top3 should have at least 3 items');
console.log('OK: dobong complete');
"
```
Expected: `OK: dobong complete`

---

## Task 3: 동작구 데이터 채우기

**Files:**
- Modify: `report/5-report.html` (DISTRICTS.dongjak)

**Interfaces:**
- Consumes: Task 1의 `DISTRICTS.dongjak` 스텁, Task 2와 동일 shape
- Produces: `DISTRICTS.dongjak` 완성

- [ ] **Step 1: `dongjak/bank_idea_draft.txt`를 읽고 은행 아이디어를 카테고리별로 정리** (Task 2 Step 1과 동일한 방식)

- [ ] **Step 2: `DISTRICTS.dongjak`을 아래로 교체**

```json
"dongjak": {
  "name":"동작구","active":true,"mapCell":"dongjak",
  "score":84,
  "budget":"17~25억원 (구 예산 9,331.3억원 대비 약 0.18~0.27%)",
  "issues":[
    "22개 표본 중 확인안됨9%+부분확인32%, 2026년 신규 개관사업(JUMP1·동작청년센터 등)에 집중",
    "'구청장에게 바란다'·'옴부즈만 민원 신청' 게시판이 외부에서 완전 차단",
    "동작구의회 회의록(assembly.dongjak.go.kr) 의존 구조 - 구 자체 통합 추적 페이지 부재",
    "세대별 39개 중점사업 대부분 예산액이 카드형 설명에 명시되지 않음"
  ],
  "itProjects":[
    {"code":"전산화지원사업1","name":"신규사업 개시 알림형 통합 사업정보 페이지 구축","budget":"350~500백만원","priority":"최우선","basis":"신규사업 확인안됨·부분확인 다수"},
    {"code":"전산화지원사업2","name":"민원채널 접근성 복구 & 처리현황 공개 대시보드","budget":"300~450백만원","priority":"최우선","basis":"민원채널 완전차단"},
    {"code":"전산화지원사업3","name":"동작구의회 회의록 연계 사업추적 검색 위젯","budget":"120~180백만원","priority":"상","basis":"의회회의록 의존 구조"},
    {"code":"전산화지원사업4","name":"세대별 생애주기 사업 안내 챗봇/카카오톡 알림","budget":"100~150백만원","priority":"중","basis":"예산·시점 미기재로 인지도 낮음"}
  ],
  "fnProjects":[
    {"code":"금융지원사업1","name":"신규 개관시설 초기 이용 활성화 지원금(효도카드/청년센터/JUMP1 연계)","budget":"250~400백만원","priority":"상","basis":"신규사업 확인안됨·부분확인"},
    {"code":"금융지원사업2","name":"노후 소규모 공동주택·빌라 안전개선 지원 확대","budget":"400~600백만원","priority":"상","basis":"노후단독주택 보수비 지원 기존사업 확대"},
    {"code":"금융지원사업3","name":"청년 문화생활·식비 지원 국내 IT 서포터즈 연계형 확대","budget":"150~250백만원","priority":"중","basis":"청년 문화생활비·식비지원 확인됨(확대여지)"}
  ],
  "validation":[
    {"code":"전산화지원사업1","overlap":"신규","grade":"상","rationale":"확인안됨9%+부분확인32%=41% 수치를 정확히 인용","recommendation":"'정적 렌더링(SSG)' 표현을 [설계 옵션]으로 격하 표기 권고"},
    {"code":"전산화지원사업2","overlap":"신규","grade":"상","rationale":"WebFetch 2회 시도 후 빈페이지 반환이라는 사실과 정확히 일치","recommendation":"'완전 차단' 표현이 근거자료의 '추정' 수준보다 단정적 - 표현 순화 권고"},
    {"code":"전산화지원사업3","overlap":"신규","grade":"상","rationale":"의회 회의록이 핵심 확인 소스라는 점과 노량진 옛청사부지 등 사례 인용 정확","recommendation":"없음(근거 인용 정확도 높음)"},
    {"code":"전산화지원사업4","overlap":"확장/보완","grade":"중","rationale":"세대별 39개 사업 예산액 미기재 서술 정확히 인용","recommendation":"'챗봇' 표현이 과대 - '알림톡 자동발송' 수준으로 하향 조정 권고"},
    {"code":"금융지원사업1","overlap":"확장","grade":"중","rationale":"효도건강생활비·청년문화생활비 등 기존 확정사업 예산에 조기신청 인센티브를 얹는 방식","recommendation":"예산 편성 방식(추가재원 vs 재배분)을 명확히 구분 표기 권고"},
    {"code":"금융지원사업2","overlap":"확장","grade":"상","rationale":"담장300만원·축대600만원 등 기존 3개 지원사업 통합신청창구화, 인용 정확도 가장 높음","recommendation":"없음"},
    {"code":"금융지원사업3","overlap":"확장","grade":"중","rationale":"청년 전월세지원 320명 모집 등 수치 정확히 일치","recommendation":"동작청년센터 시설 중복 활용에 따른 공간부족 검토 항목 로드맵에 추가 권고"}
  ],
  "verdictScore":84,
  "verdictBasis":"근거 인용 정확성 38/40, 사업분류 정확성 27/30, 타당성 19/30. 안전지원과 등 일부 제안부서명이 조직표에 직접 등장하지 않아 실존 확정 불가, 동작청년센터 공간 중복 활용 검토 누락으로 감점.",
  "bankIdeas":{
    "categories": {"__READ_FROM_SOURCE__": "Step 1에서 dongjak/bank_idea_draft.txt를 읽고 실제 카테고리명과 아이디어 제목으로 채운다"},
    "top3": ["__READ_FROM_SOURCE__: Step 1의 Top3 목록으로 교체"]
  }
}
```

- [ ] **Step 3: 검증** (Task 2 Step 3와 동일 스크립트, `data.dobong` → `data.dongjak`로 교체해서 실행)

Expected: `OK: dongjak complete`

---

## Task 4: 노원구 데이터 채우기

**Files:**
- Modify: `report/5-report.html` (DISTRICTS.nowon)

**Interfaces:**
- Consumes: Task 1의 `DISTRICTS.nowon` 스텁, Task 2와 동일 shape
- Produces: `DISTRICTS.nowon` 완성

**참고:** 이 태스크는 도봉구/동작구와 달리 이 계획 문서에 완성된 데이터가 주어지지 않는다 — 아래 두 원본 파일을 직접 읽고 스키마에 맞춰 작성해야 한다(추측 금지, 반드시 원문에서 인용).

- [ ] **Step 1: 원본 자료 읽기**
  - `report/5-report.md`의 1036~2095번째 줄(노원구 1페이지 요약 + 상세 기획안 전체 섹션)을 읽는다
  - `nowon/bank_idea_draft.txt` 전체를 읽는다

- [ ] **Step 2: 아래 스키마를 그대로 따라 `DISTRICTS.nowon`을 채운다** (Task 2의 `dobong` 객체를 예시 형식으로 참고)

```json
"nowon": {
  "name":"노원구","active":true,"mapCell":"nowon",
  "score": "<report/5-report.md에서 그대로: 88>",
  "budget": "<1페이지 요약의 '제안 총예산' 문구 그대로>",
  "issues": ["<spec 조사에서 확인된 핵심 문제 4개 불릿, 원문 그대로 4개>"],
  "itProjects": ["<IT/디지털 기획 사업 제안 섹션의 4건, 각각 {code,name,budget,priority,basis}>"],
  "fnProjects": ["<금전적 지원 사업 제안 섹션의 3건, 각각 {code,name,budget,priority,basis}>"],
  "validation": ["<6. 타당성 검증 결과의 사업별 검증표 7건, 각각 {code,overlap,grade,rationale,recommendation}>"],
  "verdictScore": "<신뢰도 점수, 원문 숫자 그대로>",
  "verdictBasis": "<신뢰도 점수 산출 근거 문단 요약>",
  "bankIdeas": {
    "categories": "<nowon/bank_idea_draft.txt의 카테고리별 아이디어 제목 목록>",
    "top3": ["<Top3 추천 목록>"]
  }
}
```

주의: `code` 필드는 원문의 "IT-1"/"FN-1" 표기를 "전산화지원사업1"/"금융지원사업1" 형식으로 바꿔서 적는다(이 프로젝트 전체에서 이미 이렇게 통일되어 있음 — report/5-report.md 자체도 이 표기로 한글화되어 있으므로 원문 그대로 복사하면 됨).

- [ ] **Step 3: 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
const m=html.match(/const DISTRICTS = (\{[\s\S]*?\});/);
const data=JSON.parse(m[1]);
const d=data.nowon;
console.assert(d.itProjects.length===4, 'nowon itProjects should be 4');
console.assert(d.fnProjects.length===3, 'nowon fnProjects should be 3');
console.assert(d.validation.length===7, 'nowon validation should be 7 entries');
console.assert(typeof d.score==='number' && d.score>0, 'nowon score missing');
console.assert(Object.keys(d.bankIdeas.categories).length>0, 'bankIdeas.categories empty');
console.assert(d.bankIdeas.top3.length>=3, 'bankIdeas.top3 should have at least 3 items');
console.log('OK: nowon complete');
"
```
Expected: `OK: nowon complete`

---

## Task 5: 광진구 데이터 채우기

**Files:**
- Modify: `report/5-report.html` (DISTRICTS.gwangjin)

**Interfaces:**
- Consumes: Task 1의 `DISTRICTS.gwangjin` 스텁, Task 2와 동일 shape

- [ ] **Step 1: 원본 자료 읽기**
  - `report/5-report.md`의 2096~3195번째 줄(광진구 1페이지 요약 + 상세 기획안 전체 섹션)을 읽는다
  - `gwangjin/bank_idea_draft.txt` 전체를 읽는다

- [ ] **Step 2: Task 4 Step 2와 동일한 스키마로 `DISTRICTS.gwangjin`을 채운다.**

**주의(중요):** 광진구 신뢰도 점수는 2026-07-18 재검증에서 88 → **84**로 수정되었다(FN-1의 침수방지시설 통계 출처가 spec/06이 아닌 spec/08이었던 오표기 발견). `verdictScore`는 반드시 **84**로 적고, `verdictBasis`에 이 출처 오표기 건을 감점 사유로 포함시킬 것 — report/5-report.md의 광진구 "3. 신뢰도 점수" 섹션(84/100로 이미 수정되어 있음)을 그대로 따르면 된다.

- [ ] **Step 3: 검증** (Task 4 Step 3 스크립트에서 `nowon` → `gwangjin`)

Expected: `OK: gwangjin complete`, 그리고 별도로:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
const data=JSON.parse(html.match(/const DISTRICTS = (\{[\s\S]*?\});/)[1]);
console.assert(data.gwangjin.verdictScore===84, 'gwangjin verdictScore must be 84 (post-revalidation), got '+data.gwangjin.verdictScore);
console.log('OK: gwangjin score is 84');
"
```

---

## Task 6: 동대문구 데이터 채우기

**Files:**
- Modify: `report/5-report.html` (DISTRICTS.dongdaemun)

**Interfaces:**
- Consumes: Task 1의 `DISTRICTS.dongdaemun` 스텁, Task 2와 동일 shape

- [ ] **Step 1: 원본 자료 읽기**
  - `report/5-report.md`의 3196~4230번째 줄(동대문구 1페이지 요약 + 상세 기획안 전체 섹션)을 읽는다
  - `dongdaemun/bank_idea_draft.txt` 전체를 읽는다

- [ ] **Step 2: Task 4 Step 2와 동일한 스키마로 `DISTRICTS.dongdaemun`을 채운다.**

- [ ] **Step 3: 검증** (Task 4 Step 3 스크립트에서 `nowon` → `dongdaemun`)

Expected: `OK: dongdaemun complete`

---

## Task 7: 사이드바 탭 전환 확정 + 점수 색상 유틸리티

**Files:**
- Modify: `report/5-report.html`

**Interfaces:**
- Consumes: Task 1의 `switchTab`
- Produces: `scoreColor(score)` 함수(모든 이후 태스크가 점수 색상 표시에 사용) — 색상을 구별 데이터 필드로 중복 저장하지 않고 점수에서 매번 계산(DRY)

- [ ] **Step 1: `<script>` 블록에 아래 함수 추가** (`DISTRICTS` 선언 바로 다음)

```javascript
function scoreColor(score) {
  if (score >= 85) return 'var(--score-good)';
  if (score >= 75) return 'var(--score-mid)';
  return 'var(--score-bad)';
}
```

- [ ] **Step 2: 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
console.assert(html.includes('function scoreColor'), 'scoreColor function missing');
console.assert(/score >= 85/.test(html), 'scoreColor threshold logic missing');
console.log('OK: scoreColor present');
"
```
Expected: `OK: scoreColor present`

---

## Task 8: SVG 지도 (25개 자치구, 활성/비활성 렌더링)

**Files:**
- Modify: `report/5-report.html`

**Interfaces:**
- Consumes: `DISTRICTS`, `scoreColor(score)`
- Produces: `renderMap()` 함수, `openDistrict(id)` 함수(Task 9가 확장) — `#tab-dashboard`를 채움

- [ ] **Step 1: `<style>`에 지도 관련 스타일 추가**

```css
.gu { stroke:var(--bg); stroke-width:2; cursor:pointer; transition: filter .2s, opacity .2s; }
.gu.placeholder { fill:var(--panel2); opacity:.6; }
.gu.placeholder:hover { opacity:.85; }
.gu.gu-active:hover { filter:brightness(1.15); }
.d-label { fill:var(--text); font-size:12px; font-weight:600; pointer-events:none; }
#map-footnote { fill:var(--muted); font-size:11px; }
```

- [ ] **Step 2: `renderMap()` 함수 추가 — 브레인스토밍 목업에서 검증된 25개 구 좌표를 그대로 사용**

```javascript
const MAP_PATHS = {
  eunpyeong:   "M40,40 L160,40 L160,130 L100,150 L40,120 Z",
  gangbuk:     "M380,40 L480,40 L480,130 L390,140 L370,90 Z",
  dobong:      "M480,30 L590,25 L600,110 L500,125 L480,90 Z",
  nowon:       "M590,25 L710,35 L720,120 L600,110 Z",
  seodaemun:   "M160,40 L260,55 L255,140 L160,130 Z",
  jongno:      "M260,55 L370,90 L390,140 L280,155 L255,140 Z",
  seongbuk:    "M390,140 L500,125 L510,205 L400,220 Z",
  jungnang:    "M600,110 L720,120 L730,210 L615,215 Z",
  mapo:        "M100,150 L255,140 L245,225 L120,230 Z",
  junggu:      "M280,155 L390,140 L400,220 L300,235 Z",
  dongdaemun:  "M400,220 L510,205 L520,285 L410,300 Z",
  gwangjin:    "M520,285 L615,215 L730,210 L720,300 L600,320 Z",
  yongsan:     "M245,225 L300,235 L400,220 L410,300 L280,310 Z",
  seongdong:   "M410,300 L520,285 L600,320 L500,345 L420,335 Z",
  gangseo:     "M15,410 L120,405 L130,500 L20,515 Z",
  yangcheon:   "M120,405 L220,415 L225,495 L130,500 Z",
  yeongdeungpo:"M220,415 L300,405 L310,490 L225,495 Z",
  dongjak:     "M300,405 L400,390 L410,470 L310,490 Z",
  seocho:      "M400,390 L470,418 L480,500 L410,470 Z",
  gangnam:     "M470,418 L560,400 L580,485 L480,500 Z",
  songpa:      "M560,400 L640,385 L660,470 L580,485 Z",
  gangdong:    "M640,385 L720,375 L740,455 L660,470 Z",
  guro:        "M20,515 L130,500 L135,590 L30,595 Z",
  geumcheon:   "M130,500 L225,495 L220,585 L135,590 Z",
  gwanak:      "M225,495 L310,490 L305,580 L220,585 Z"
};

const MAP_LABEL_POS = {
  dobong: [540,72], nowon: [655,75], dongdaemun: [460,255],
  gwangjin: [630,258], dongjak: [355,440]
};

function renderMap() {
  const svgParts = [];
  svgParts.push('<svg id="seoul-map" viewBox="0 0 800 620" style="width:100%;height:100%;display:block;">');

  Object.entries(MAP_PATHS).forEach(([id, path]) => {
    const d = DISTRICTS[id];
    const cls = d.active ? 'gu gu-active' : 'gu placeholder';
    const fill = d.active ? scoreColor(d.score) : '';
    const style = fill ? ` style="fill:${fill}"` : '';
    svgParts.push(`<path class="${cls}" data-id="${id}"${style} d="${path}" onclick="openDistrict('${id}')"></path>`);
  });

  Object.entries(MAP_LABEL_POS).forEach(([id, pos]) => {
    const d = DISTRICTS[id];
    svgParts.push(`<text x="${pos[0]}" y="${pos[1]}" class="d-label" text-anchor="middle">${d.name}<tspan x="${pos[0]}" dy="15" font-weight="700" font-size="15">${d.score}</tspan></text>`);
  });

  svgParts.push('<path d="M20,320 C160,300 260,345 380,335 C480,325 520,350 620,340 C700,332 760,355 780,345 L780,395 C700,410 640,385 560,400 C470,418 400,390 300,405 C200,420 100,395 20,410 Z" fill="#1a3550" opacity="0.85"></path>');
  svgParts.push('<text x="700" y="380" class="map-footnote" font-style="italic">한강</text>');
  svgParts.push('<text x="400" y="605" text-anchor="middle" id="map-footnote">회색 = 아직 자료 없음(클릭 시 안내) · 색 있는 구 = 이번 프로젝트 대상</text>');
  svgParts.push('</svg>');

  document.getElementById('tab-dashboard').innerHTML = svgParts.join('');
}

function openDistrict(id) {
  const d = DISTRICTS[id];
  if (!d.active) {
    alert(d.name + ' - 아직 자료가 준비되지 않았습니다.');
    return;
  }
  showDistrictDetail(id);
}

renderMap();
```

- [ ] **Step 3: 자동 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
console.assert(html.includes('function renderMap'), 'renderMap missing');
console.assert(html.includes('function openDistrict'), 'openDistrict missing');
console.assert((html.match(/gangnam:/g)||[]).length>=1, 'gangnam path missing from MAP_PATHS');
const pathCount = (html.match(/M[\d.]+,[\d.]+ L/g)||[]).length;
console.assert(pathCount===25, 'expected 25 map paths, found '+pathCount);
console.log('OK: map paths = '+pathCount);
"
```
Expected: `OK: map paths = 25`

- [ ] **Step 4: 브라우저 수동 확인**

`report/5-report.html`을 열어 5개 색 구역 + 20개 회색 구역이 보이는지, 회색 구역 클릭 시 "아직 자료가 준비되지 않았습니다" alert이 뜨는지 확인. (활성 구 클릭은 Task 9에서 상세화면이 생긴 뒤 다시 확인)

---

## Task 9: 구 상세 전체화면 오버레이 (서브탭 3개)

**Files:**
- Modify: `report/5-report.html`

**Interfaces:**
- Consumes: `DISTRICTS`, `scoreColor(score)`, `openDistrict(id)`(Task 8에서 호출)
- Produces: `showDistrictDetail(id)`, `closeDistrictDetail()`, `switchDetailTab(sub)`

- [ ] **Step 1: `<style>`에 오버레이 스타일 추가**

```css
#detail-overlay { position:fixed; inset:0; z-index:1000; display:none; background:var(--bg); overflow:auto; }
#detail-overlay.show { display:block; animation: growin .35s ease; }
@keyframes growin { from{opacity:0; transform:scale(.96);} to{opacity:1; transform:scale(1);} }
.detail-header { padding:24px 32px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); }
.detail-subtabs { display:flex; gap:4px; padding:0 32px; border-bottom:1px solid var(--border); }
.detail-subtab { padding:10px 16px; cursor:pointer; font-size:13px; font-weight:600; opacity:.6; border-bottom:2px solid transparent; }
.detail-subtab.active { opacity:1; border-bottom-color:var(--accent); }
.detail-body { padding:24px 32px; }
.topic-chip { display:inline-block; background:var(--panel2); border-radius:20px; padding:6px 14px; margin:4px 6px 4px 0; font-size:12px; }
.proj-card { background:var(--panel2); border-radius:8px; padding:14px; margin-bottom:10px; }
.proj-card .code { font-size:11px; opacity:.6; }
.proj-card .name { font-weight:700; margin:4px 0; }
.proj-card .meta { font-size:12px; opacity:.75; }
.vtable { width:100%; border-collapse:collapse; font-size:12px; margin-top:16px; }
.vtable th, .vtable td { text-align:left; padding:8px; border-bottom:1px solid var(--border); vertical-align:top; }
.bank-cat { margin-bottom:16px; }
.bank-cat h4 { font-size:13px; margin:0 0 6px 0; opacity:.8; }
.top3-badge { background:var(--accent); color:#fff; border-radius:4px; padding:2px 6px; font-size:10px; margin-right:6px; }
</style>
```

(주의: 이 `</style>` 태그는 Task 8에서 만든 `<style>` 블록 안에 이어붙이는 것이 아니라, 기존 `<style>...</style>` 블록의 닫는 태그 바로 앞에 위 CSS를 삽입한다. 새 `<style>` 태그를 중복으로 열지 않는다.)

- [ ] **Step 2: `<body>` 끝(`</body>` 앞)에 오버레이 컨테이너 추가**

```html
<div id="detail-overlay">
  <div class="detail-header">
    <div>
      <h2 id="detail-title" style="margin:0;"></h2>
      <div id="detail-subtitle" style="opacity:.7; font-size:13px;"></div>
    </div>
    <button onclick="closeDistrictDetail()" style="background:var(--panel2); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px 16px; cursor:pointer;">← 지도로 돌아가기</button>
  </div>
  <div class="detail-subtabs">
    <div class="detail-subtab active" data-sub="summary" onclick="switchDetailTab('summary')">핵심요약</div>
    <div class="detail-subtab" data-sub="projects" onclick="switchDetailTab('projects')">IT·금전사업</div>
    <div class="detail-subtab" data-sub="bank" onclick="switchDetailTab('bank')">은행아이디어</div>
  </div>
  <div class="detail-body" id="detail-body"></div>
</div>
```

- [ ] **Step 3: `<script>`에 상세화면 렌더링 함수 추가**

```javascript
let currentDistrictId = null;

function showDistrictDetail(id) {
  currentDistrictId = id;
  const d = DISTRICTS[id];
  document.getElementById('detail-title').textContent = d.name;
  document.getElementById('detail-subtitle').innerHTML =
    `신뢰도 점수 <b style="color:${scoreColor(d.score)}">${d.score}</b> · 제안 총예산 ${d.budget}`;
  switchDetailTab('summary');
  document.getElementById('detail-overlay').classList.add('show');
}

function closeDistrictDetail() {
  document.getElementById('detail-overlay').classList.remove('show');
}

function switchDetailTab(sub) {
  document.querySelectorAll('.detail-subtab').forEach(t => t.classList.toggle('active', t.dataset.sub===sub));
  const d = DISTRICTS[currentDistrictId];
  const body = document.getElementById('detail-body');

  if (sub === 'summary') {
    body.innerHTML = `
      <div>${d.issues.map(i => `<span class="topic-chip">${i}</span>`).join('')}</div>
      <p style="margin-top:20px; font-size:13px; opacity:.85;">${d.verdictBasis}</p>
    `;
  } else if (sub === 'projects') {
    const projCard = p => `
      <div class="proj-card">
        <div class="code">${p.code}</div>
        <div class="name">${p.name}</div>
        <div class="meta">${p.budget} · 우선순위: ${p.priority} · 근거: ${p.basis}</div>
      </div>`;
    const vRow = v => `
      <tr>
        <td>${v.code}</td><td>${v.overlap}</td><td>${v.grade}</td>
        <td>${v.rationale}</td><td>${v.recommendation}</td>
      </tr>`;
    body.innerHTML = `
      <h3 style="font-size:14px;">IT/디지털 사업</h3>
      ${d.itProjects.map(projCard).join('')}
      <h3 style="font-size:14px; margin-top:20px;">금전지원 사업</h3>
      ${d.fnProjects.map(projCard).join('')}
      <h3 style="font-size:14px; margin-top:24px;">타당성 검증표</h3>
      <table class="vtable">
        <thead><tr><th>코드</th><th>중복여부</th><th>등급</th><th>판단근거</th><th>수정권고</th></tr></thead>
        <tbody>${d.validation.map(vRow).join('')}</tbody>
      </table>
    `;
  } else if (sub === 'bank') {
    const cats = Object.entries(d.bankIdeas.categories)
      .map(([cat, items]) => `
        <div class="bank-cat">
          <h4>${cat}</h4>
          <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>`).join('');
    body.innerHTML = `
      <div style="margin-bottom:16px;">
        ${d.bankIdeas.top3.map(t => `<span class="top3-badge">TOP3</span>${t}<br>`).join('')}
      </div>
      ${cats}
    `;
  }
}
```

- [ ] **Step 4: 자동 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
['showDistrictDetail','closeDistrictDetail','switchDetailTab'].forEach(fn=>{
  console.assert(html.includes('function '+fn), fn+' missing');
});
console.log('OK: detail overlay functions present');
"
```
Expected: `OK: detail overlay functions present`

- [ ] **Step 5: 브라우저 수동 확인**

5개 활성 구를 전부 클릭 → 전체화면 오버레이가 뜨는지, "핵심요약"/"IT·금전사업"/"은행아이디어" 서브탭이 각각 정상 전환되는지, "은행아이디어" 탭에 `__READ_FROM_SOURCE__` 같은 플레이스홀더 문자열이 하나도 안 남아있는지, "← 지도로 돌아가기"가 잘 동작하는지 5구 전부 확인.

---

## Task 10: 리포트 탭 (주제별 5구 비교)

**Files:**
- Modify: `report/5-report.html`

**Interfaces:**
- Consumes: `DISTRICTS`, `scoreColor(score)`
- Produces: `renderReportTab()`(사이드바에서 "리포트" 클릭 시 최초 1회 실행되도록 `switchTab` 확장)

- [ ] **Step 1: Task 1의 `switchTab` 함수를 아래로 교체** (리포트 탭 최초 진입 시 렌더링 트리거 추가)

```javascript
let reportRendered = false;
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab===tab));
  document.getElementById('tab-dashboard').classList.toggle('visible', tab==='dashboard');
  document.getElementById('tab-report').classList.toggle('visible', tab==='report');
  if (tab === 'report' && !reportRendered) {
    renderReportTab();
    reportRendered = true;
  }
}
```

- [ ] **Step 2: `<style>`에 리포트 탭 스타일 추가**

```css
#report-container { padding:24px 32px; }
#topic-select { background:var(--panel2); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px 12px; font-size:13px; }
#topic-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-top:16px; }
.report-col { background:var(--panel2); border-radius:8px; padding:12px; font-size:12px; }
.report-col h4 { margin:0 0 8px 0; font-size:13px; }
.report-proj-line { padding:6px 0; border-bottom:1px solid var(--border); }
.report-proj-line:last-child { border-bottom:none; }
```

- [ ] **Step 3: `<script>`에 리포트 탭 렌더링 함수 추가**

```javascript
const REPORT_TOPICS = {
  it: {
    label: 'IT/디지털 사업',
    render: d => d.itProjects.map(p => `<div class="report-proj-line"><b>${p.name}</b><br>${p.budget} · ${p.priority}</div>`).join('')
  },
  fn: {
    label: '금전지원 사업',
    render: d => d.fnProjects.map(p => `<div class="report-proj-line"><b>${p.name}</b><br>${p.budget} · ${p.priority}</div>`).join('')
  },
  score: {
    label: '검증 신뢰도 점수',
    render: d => `<div style="font-size:28px; font-weight:700; color:${scoreColor(d.score)}">${d.score}</div><div style="margin-top:8px;">${d.verdictBasis}</div>`
  },
  bank: {
    label: '은행 결합 아이디어',
    render: d => `<div>카테고리 ${Object.keys(d.bankIdeas.categories).length}개</div><div style="margin-top:8px;">${d.bankIdeas.top3.map(t => '· '+t).join('<br>')}</div>`
  }
};

function renderReportTab() {
  const activeIds = Object.keys(DISTRICTS).filter(id => DISTRICTS[id].active);
  const container = document.getElementById('tab-report');
  container.innerHTML = `
    <div id="report-container">
      <label style="font-size:13px; opacity:.7;">주제 선택:
        <select id="topic-select" onchange="renderTopicGrid()">
          ${Object.entries(REPORT_TOPICS).map(([k,t]) => `<option value="${k}">${t.label}</option>`).join('')}
        </select>
      </label>
      <div id="topic-grid"></div>
    </div>
  `;
  renderTopicGrid();

  function renderTopicGrid() {
    const topic = REPORT_TOPICS[document.getElementById('topic-select').value];
    document.getElementById('topic-grid').innerHTML = activeIds.map(id => {
      const d = DISTRICTS[id];
      return `<div class="report-col"><h4>${d.name}</h4>${topic.render(d)}</div>`;
    }).join('');
  }
  window.renderTopicGrid = renderTopicGrid;
}
```

- [ ] **Step 4: 자동 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
console.assert(html.includes('function renderReportTab'), 'renderReportTab missing');
console.assert(html.includes('REPORT_TOPICS'), 'REPORT_TOPICS missing');
console.log('OK: report tab code present');
"
```
Expected: `OK: report tab code present`

- [ ] **Step 5: 브라우저 수동 확인**

좌측 "📊 리포트" 클릭 → 5개 구 칼럼이 나타나는지, 주제 드롭다운을 4가지 다 돌려봤을 때 각각 다른 내용(IT 4건/금전 3건/점수+총평/카테고리수+Top3)이 나오는지, 회색(비활성) 구가 그리드에 안 나타나는지 확인.

---

## Task 11: 반응형·테마 마무리 + 전체 수동 QA

**Files:**
- Modify: `report/5-report.html`

**Interfaces:**
- Consumes: 전체 파일(이전 태스크 전부)

- [ ] **Step 1: `<style>`에 반응형 보정 추가**

```css
@media (max-width: 640px) {
  #sidebar { width:56px; }
  .nav-item { padding:14px 8px; font-size:11px; text-align:center; }
  #topic-grid { grid-template-columns:repeat(2,1fr); }
  .detail-header, .detail-body, .detail-subtabs { padding-left:16px; padding-right:16px; }
}
```

- [ ] **Step 2: 최종 데이터 무결성 전체 검증**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('report/5-report.html','utf8');
const data=JSON.parse(html.match(/const DISTRICTS = (\{[\s\S]*?\});/)[1]);
const activeIds=['dobong','nowon','gwangjin','dongdaemun','dongjak'];
activeIds.forEach(id=>{
  const d=data[id];
  console.assert(d.itProjects.length===4, id+' itProjects != 4');
  console.assert(d.fnProjects.length===3, id+' fnProjects != 3');
  console.assert(d.validation.length===7, id+' validation != 7');
  console.assert(d.issues.length===4, id+' issues != 4');
  console.assert(d.bankIdeas.top3.length>=3, id+' bankIdeas.top3 too short');
  console.assert(Object.keys(d.bankIdeas.categories).length>0, id+' bankIdeas.categories empty');
});
console.assert(data.gwangjin.verdictScore===84, 'gwangjin score must be 84');
console.assert(!html.includes('__READ_FROM_SOURCE__'), 'placeholder leaked into final file');
console.log('OK: all 5 active districts complete, no placeholders');
"
```
Expected: `OK: all 5 active districts complete, no placeholders`

- [ ] **Step 3: 브라우저 수동 QA 체크리스트** (스펙 §8 그대로)

- [ ] 활성 5개 구 전체 클릭 → 상세화면 3개 서브탭 모두 정상 표시
- [ ] 비활성 20개 구 클릭 → 안내 메시지(alert) 정상 표시
- [ ] 리포트 탭에서 주제 4종 전환 정상
- [ ] 브라우저 창을 640px 이하로 좁혀도 레이아웃 안 깨짐
- [ ] OS 다크모드/라이트모드 전환 시 둘 다 가독성 확인
- [ ] 인터넷 연결을 끈 상태에서 파일을 열어도 정상 작동(오프라인 확인)

---

## Self-Review Notes

- **Spec coverage:** §1(목적)→Global Constraints, §2-1(지도)→Task 8, §2-2(상세화면)→Task 9, §2-3(리포트탭)→Task 10, §3(확장성 스키마)→Task 1~7, §4(SVG좌표)→Task 8, §5(스타일)→Task 1+11, §6(데이터흐름)→전체, §7(예외처리)→Task 8 openDistrict, §8(테스트)→Task 11 Step 3. 전 섹션 커버됨.
- **Placeholder scan:** `__READ_FROM_SOURCE__` 문자열은 의도적 장치(Task 4/5/6이 실제로 원본을 읽어 교체하도록 강제) — Task 11 Step 2에서 최종적으로 이 문자열이 하나도 안 남았는지 검증하므로 "방치되는 placeholder"가 아님.
- **Type consistency:** `openDistrict(id)`(Task 8)가 `showDistrictDetail(id)`(Task 9)를 호출하는 시그니처 일치 확인. `scoreColor(score)`(Task 7)를 Task 8·9·10이 모두 동일한 시그니처로 사용. `DISTRICTS[id].active`/`.score`/`.budget`/`.issues`/`.itProjects`/`.fnProjects`/`.validation`/`.verdictScore`/`.verdictBasis`/`.bankIdeas.categories`/`.bankIdeas.top3` 필드명이 Task 1~10 전체에서 동일하게 사용됨을 확인함.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-18-5-report-dashboard.md`.**
