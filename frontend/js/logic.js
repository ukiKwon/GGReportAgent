(function (root) {
  'use strict';
  const logic = {};

  // HTML 엔티티 이스케이프(공유). render.js/app.js의 모든 텍스트 싱크가 이걸 사용.
  logic.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  };

  // 레코드의 전체 표시 필드(순서 고정) — 편집 모달/팝오버가 공유.
  // 이 중 서버 registry에 대응 필드가 없는 것들은 store.LOCAL_ONLY_FIELDS 참고
  // (서버 모드에서 편집 overlay가 덮어도 되는 필드 = 그것뿐이다).
  logic.ALL_FIELDS = ['name','type','region','subRegion','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt'];

  // 서버 모드에서 **저장 경로가 아예 없는** 필드. 편집창에서 잠가 무음 실패를 막는다.
  // 기관명(name)이 그렇다: PUT 페이로드에도 InstitutionUpdateIn에도 없고,
  // store.LOCAL_ONLY_FIELDS에도 없어서 고쳐도 서버·화면 어디에도 남지 않았다.
  // 서버에 name_ko 갱신을 넣는 것도 간단하지 않다 — 기관명은 serverdata.mergeUnion의
  // 병합 키라, 서버에서 바꾸면 번들 행과의 매칭이 끊겨 같은 기관이 두 줄로 갈라진다.
  logic.SERVER_UNSAVABLE_FIELDS = ['name'];

  logic.FIELD_LABELS = { name:'기관명', type:'기관구분', region:'지역코드', subRegion:'구시군코드',
    term:'입찰주기', lastBid:'지난 입찰일', contractEnd:'입찰예상일', confirmed:'확정여부',
    lng:'경도', lat:'위도', sources:'출처', updatedAt:'수정일' };

  // 지자체 기관명 → 행정구역 폴리곤명 정규화. '마포구청'→'마포구', '서울시청(예시)'→'서울시'.
  // subRegion 코드가 비어 있는 레코드를 구/시군 면에 붙이는 폴백 매칭에 쓴다.
  logic.normalizeMuniName = function (s) {
    return String(s == null ? '' : s).replace(/\([^)]*\)\s*$/, '').trim().replace(/청$/, '');
  };

  // 계정 전환기(데모 전용) 표기. 역할만 있는 항목은 사람이 아님을 드러낸다 —
  // 시스템 알림이 역할 앞으로 오기 때문에 역할도 하나의 "계정"이 된다.
  logic.accountLabel = function (a) {
    if (!a) return '';
    if (!a.name) return '(역할만) ' + (a.team || '');
    return a.team ? a.name + ' (' + a.team + ')' : a.name;
  };

  // select의 value 하나에 이름·소속을 실어 왕복시킨다. 구분자는 사람이 입력할 수 없는
  // 제어문자(U+241F)라 이름이나 팀명과 충돌하지 않는다.
  const ACCOUNT_SEP = '␟';
  logic.accountValue = function (a) {
    return ((a && a.name) || '') + ACCOUNT_SEP + ((a && a.team) || '');
  };
  logic.parseAccountValue = function (v) {
    const parts = String(v == null ? '' : v).split(ACCOUNT_SEP);
    return { name: parts[0] || '', team: parts[1] || '' };
  };

  logic.URGENCY = { RED:'red', ORANGE:'orange', YELLOW:'yellow', BLUE:'blue', GRAY:'gray' };

  // 지도 라벨 겹침 해소(순수 계산). boxes: [{x,y,w,h}] — y는 라벨 중심.
  // 겹치는 쌍을 세로로 밀어내고, 각 박스에 적용할 y 이동량 배열을 돌려준다.
  // DOM을 모르는 순수 함수라 렌더 없이 검증할 수 있다.
  logic.separateLabelsY = function (boxes, gap, passes) {
    const g = gap == null ? 2 : gap;
    const n = (passes == null ? 3 : passes);
    const dy = boxes.map(function () { return 0; });
    for (let pass = 0; pass < n; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          // 가로가 안 겹치면 세로가 겹쳐도 글자끼리는 안 부딪힌다
          const overlapX = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
          if (overlapX <= 0) continue;
          const ay = a.y + dy[i], by = b.y + dy[j];
          const overlapY = Math.min(ay + a.h / 2, by + b.h / 2) - Math.max(ay - a.h / 2, by - b.h / 2);
          if (overlapY <= 0) continue;
          const push = overlapY / 2 + g;
          // 위에 있는 쪽을 더 위로, 아래쪽을 더 아래로
          if (ay <= by) { dy[i] -= push; dy[j] += push; }
          else { dy[i] += push; dy[j] -= push; }
        }
      }
    }
    return dy;
  };

  logic.daysUntil = function (contractEnd, today) {
    if (!contractEnd) return Infinity;
    const end = new Date(contractEnd + 'T00:00:00');
    if (isNaN(end.getTime())) return Infinity;
    return Math.floor((end - today) / 86400000);
  };

  logic.computeUrgency = function (contractEnd, today) {
    const d = logic.daysUntil(contractEnd, today);
    if (d === Infinity) return logic.URGENCY.GRAY;
    if (d <= 182) return logic.URGENCY.RED;   // 6개월(≈182일) 이내, 과거 포함
    if (d <= 365) return logic.URGENCY.ORANGE;
    if (d <= 730) return logic.URGENCY.YELLOW;
    return logic.URGENCY.BLUE;
  };

  logic.addYears = function (dateStr, years) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (isNaN(d.getTime())) return null;
    d.setUTCFullYear(d.getUTCFullYear() + Number(years));
    return d.toISOString().slice(0, 10);
  };

  // 유효 입찰예상일 + confidence 유도(저장하지 않음)
  logic.effectiveBid = function (rec) {
    if (rec.contractEnd) return { date: rec.contractEnd, confidence: rec.confirmed ? '확정' : '추측' };
    if (rec.lastBid && rec.term) {
      const d = logic.addYears(rec.lastBid, rec.term);
      if (d) return { date: d, confidence: '추측' };
    }
    return { date: null, confidence: '미상' };
  };

  logic.urgencyOf = function (rec, today) {
    return logic.computeUrgency(logic.effectiveBid(rec).date, today);
  };

  // D-day 표기. 지난 날짜를 'D-' + 음수로 이으면 'D--3' 같은 글자가 나온다 —
  // 전국 데이터가 들어오면서 **이미 공고가 뜬 진행 중인 건**이 생겨 실제로 드러났다.
  // 관례대로 지난 것은 D+n, 당일은 D-day로 쓴다.
  logic.formatDDay = function (rec, today) {
    const d = logic.daysUntil(logic.effectiveBid(rec).date, today);
    if (d === Infinity) return '미상';
    if (d === 0) return 'D-day';
    return d > 0 ? 'D-' + d : 'D+' + (-d);
  };

  logic.formatBidDate = function (rec) {
    const e = logic.effectiveBid(rec);
    return e.date ? (e.date + '(' + e.confidence + ')') : '미상';
  };

  // 같은 기관이 일반구 폴리곤 수만큼 반복 등록될 수 있다(ⓐ안 — 수원 4·성남 3 등이
  // 전부 같은 시 값을 든다). 임박 TOP5 티커처럼 **기관 단위**로 보여야 하는 곳에서
  // 그대로 쓰면 한 시가 여러 자리를 차지해 다른 기관이 밀려난다. 입력 순서를
  // 보존하고 첫 등장만 남기므로 sortByUrgency 뒤에 쓰면 임박순이 유지된다.
  // 키가 name만이 아니라 region+name인 이유: 동명 기관이 실제로 있다
  // (경기 광주시청처럼 — 지역이 다르면 다른 기관이므로 둘 다 남아야 한다).
  logic.dedupeByInstitution = function (list) {
    const seen = new Set();
    return list.filter(function (r) {
      const key = (r.region || '') + '|' + (r.name || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // ── 공고 예정일 경과(NEXT 30 추가 요건, 1단계 — 화면만) ─────────────────────────
  // 로컬 날짜 'YYYY-MM-DD'. toISOString()은 UTC라 한국 시각 00~09시에 하루 전 날짜가 나온다
  // (티커 '기준' 표기가 하루 늦던 버그). 연·월·일을 로컬 값으로 직접 조립한다.
  logic.localDateStr = function (d) {
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  // 화면 글자는 '추정', 내부 값은 '추측' 유지(테스트·비교 코드가 이 값에 결합돼 있다).
  logic.confidenceLabel = function (c) { return c === '추측' ? '추정' : c; };
  // formatBidDate의 화면용. 내부 값을 그대로 노출하지 않는다.
  logic.formatBidDateLabel = function (rec) {
    const e = logic.effectiveBid(rec);
    return e.date ? (e.date + '(' + logic.confidenceLabel(e.confidence) + ')') : '미상';
  };

  // 데이터 정정(NEXT 30-1) 전 임시 — 공고일이 contractEnd 칸에 들어 있어 날짜 의미가
  // 확인될 때까지 '날짜 의미 확인 중'을 붙이는 15기관(region|name, dedupeByInstitution과 같은 키).
  // 정정이 끝나 contractEnd 의미가 바로잡히면 이 상수와 표식을 함께 지운다.
  // data/ 파일은 건드리지 않는다.
  logic.OVERDUE_CHECK_KEYS = [
    // 2026-11-11: 회차 종료가 확인된 8곳(인천·강남·동대문·종로·구로·춘천·청주·포항)은 lastBid로 옮겨 뺐다(NEXT 30-1).
    '11|관악구청', '41|광명시청', '42|삼척시청', '42|양양군청', '45|정읍시청',
    '47|영천시청', '47|청송군청'];
  logic.instKey = function (r) { return (r.region || '') + '|' + (r.name || ''); };
  logic.isDateUnderReview = function (rec) {
    return logic.OVERDUE_CHECK_KEYS.indexOf(logic.instKey(rec)) >= 0;
  };

  // 경과 판정: 오늘 > 공고 예정일(유예 없음, 확정·추정 동일). 날짜 미상은 판정하지 않고
  // 건수만 센다. 기관 단위로 중복을 먼저 제거한다(수원 4구 등이 건수를 부풀리지 않게).
  // 반환 items는 최근에 지난 순(days 오름차순). days = 예정일이 지난 일수(양수).
  logic.overdueSummary = function (list, today) {
    const deduped = logic.dedupeByInstitution(list || []);
    const items = [];
    let unknown = 0;
    deduped.forEach(function (r) {
      const e = logic.effectiveBid(r);
      const d = e.date ? logic.daysUntil(e.date, today) : Infinity;
      if (d === Infinity) { unknown += 1; return; }
      if (d >= 0) return;               // 오늘이 예정일이거나 아직 남음 — 경과 아님
      const check = logic.isDateUnderReview(r);
      items.push({ rec: r, name: r.name || '', region: r.region || '', date: e.date, days: -d,
        kind: check ? 'check' : (e.confidence === '확정' ? 'fixed' : 'est'), check: check });
    });
    items.sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)); });
    return { items: items, unknown: unknown, total: deduped.length };
  };

  // 패널 묶음: 관심 지역(watched 코드 목록)에 속한 건은 '관심 지역'에만 넣고 시·도 묶음에서는
  // 뺀다(두 번 세지 않음). 시·도는 건수 많은 순, 같으면 코드 순.
  logic.groupOverdue = function (items, watched, nameOf) {
    const w = watched || [];
    const watch = [], rest = {};
    items.forEach(function (it) {
      if (w.indexOf(it.region) >= 0) watch.push(it);
      else (rest[it.region] = rest[it.region] || []).push(it);
    });
    const bySido = Object.keys(rest).map(function (code) {
      return { code: code, name: nameOf ? nameOf(code) : code, items: rest[code] };
    }).sort(function (a, b) {
      return (b.items.length - a.items.length) || (a.code < b.code ? -1 : (a.code > b.code ? 1 : 0));
    });
    return { watch: watch, bySido: bySido };
  };

  // 팝업의 시·도별 건수(관심 지역 구분 없이 전체). 건수 많은 순, 같으면 코드 순.
  logic.countBySido = function (items, nameOf) {
    const m = {};
    items.forEach(function (it) { m[it.region] = (m[it.region] || 0) + 1; });
    return Object.keys(m).map(function (code) {
      return { code: code, name: nameOf ? nameOf(code) : code, n: m[code] };
    }).sort(function (a, b) { return (b.n - a.n) || (a.code < b.code ? -1 : (a.code > b.code ? 1 : 0)); });
  };

  // 팝업 상위 N건: 관심 지역 먼저 → 최근에 지난 순 → '날짜 의미 확인 중'은 맨 뒤.
  logic.pickTopOverdue = function (items, watched, n) {
    const w = watched || [];
    return items.slice().sort(function (a, b) {
      return (a.check ? 1 : 0) - (b.check ? 1 : 0)
        || (w.indexOf(a.region) >= 0 ? 0 : 1) - (w.indexOf(b.region) >= 0 ? 0 : 1)
        || a.days - b.days
        || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    }).slice(0, n == null ? 5 : n);
  };

  // 로그인 직후 팝업: 영업 계열 + 미처리 1건 이상 + 오늘 그만 보기 안 눌렀을 때만.
  logic.shouldShowOverduePopup = function (o) {
    return !!(o && o.sales && o.count > 0 && !o.skipped);
  };

  logic.REQUIRED_FIELDS = ['name','type','region'];

  logic.validateRecord = function (rec) {
    const missing = [];
    logic.REQUIRED_FIELDS.forEach(function (f) {
      if (rec[f] === undefined || rec[f] === null || rec[f] === '') missing.push(f);
    });
    return { valid: missing.length === 0, missing: missing };
  };

  logic.recordGlyph = function (rec) {
    if (!logic.validateRecord(rec).valid) return '!';
    if (!logic.effectiveBid(rec).date) return '⚠️';
    return '';
  };

  logic.markerShape = function (type) {
    // '대학'·'병원'은 정본 종류 이름(NEXT 72/78) — 기존 '대학교'·'대학병원'과 같은 모양을 쓴다.
    const map = { '대학병원':'circle', '병원':'circle', '공기업':'square', '공공기관':'triangle', '지자체':'polygon',
      '대학교':'pentagon', '대학':'pentagon' };
    return map[type] || 'diamond';
  };

  // 지도 색 섞기가 보는 기관 종류 5종(정본, NEXT 78). 데이터·사이드바의 옛 이름은 종류로 접는다.
  // FILTERABLE_TYPES는 마커·랭킹 필터의 체크박스 이름(옛 이름)이라 그대로 둔다 — 체크박스(index.html)가
  // 5종으로 바뀌기 전에 이 목록을 바꾸면 마커·랭킹 필터가 조용히 꺼진다.
  logic.TYPE_KINDS = ['지자체','공공기관','대학','법원','병원'];
  logic.KIND_OF_TYPE = { '지자체':'지자체', '공공기관':'공공기관', '공기업':'공공기관',
    '대학':'대학', '대학교':'대학', '법원':'법원', '병원':'병원', '대학병원':'병원' };
  logic.kindOf = function (type) { return logic.KIND_OF_TYPE[type] || null; };

  logic.FILTERABLE_TYPES = ['공공기관','공기업','대학병원','대학교'];

  // ── 지도 지역 색 섞기(NEXT 78, C안 '바닥 섞기 + ▲개수') ──────────────────────────
  // 규격: handoff/agents/design-reviewer/2026-11-11_1616_a821ad3f.md §3.
  // 기관 점수: 6개월 안(경과 포함) +2, 6~12개월 +1, 1~2년 −1, 2년 넘음 −2, 날짜 미상은 계산에서 뺀다(null).
  logic.instScore = function (rec, today) {
    const d = logic.daysUntil(logic.effectiveBid(rec).date, today);
    if (d === Infinity) return null;
    if (d <= 182) return 2;
    if (d <= 365) return 1;
    if (d <= 730) return -1;
    return -2;
  };

  // 평균 m → 5단: r3 진빨강 · r2 빨강 · p 보라 · b2 파랑 · b3 진파랑.
  logic.mixBandOf = function (m) {
    if (m >= 1.5) return 'r3';
    if (m >= 0.5) return 'r2';
    if (m > -0.5) return 'p';
    if (m > -1.5) return 'b2';
    return 'b3';
  };

  // 가장 임박한 기관 = 날짜가 있는 기관 중 남은 일수가 가장 작은 것(경과는 가장 앞). 같은 날이면
  // 확정이 먼저, 그래도 같으면 입력 순서. ▲를 정한 기관과 면 클릭으로 잡히는 기관이 같아야 한다.
  logic.mostImminent = function (list, today) {
    let best = null, bestD = Infinity, bestFixed = false;
    (list || []).forEach(function (r) {
      const e = logic.effectiveBid(r);
      const d = logic.daysUntil(e.date, today);
      if (d === Infinity) return;
      const fixed = e.confidence === '확정';
      if (best === null || d < bestD || (d === bestD && fixed && !bestFixed)) {
        best = r; bestD = d; bestFixed = fixed;
      }
    });
    return best;
  };

  // 지역(또는 면) 하나의 섞기 결과. list는 호출자가 켠 종류·기관 단위 중복 제거를 마친 목록.
  // band: 'none'(기관 0곳) | 'gray'(날짜 있는 기관 0곳) | r3·r2·p·b2·b3.
  // 6개월 안 또는 6~12개월 기관이 있으면 파랑 쪽으로 못 내려가고 최소 보라(c안 바닥).
  // urgent = 6개월 안 기관 수(▲n), urgentAllEst = 그 기관이 전부 추정이면 true(속 빈 △).
  logic.regionMix = function (list, today) {
    const items = list || [];
    const info = { total: items.length, dated: 0, unknown: 0, mean: null, band: 'none',
      within6: 0, to12: 0, to24: 0, over24: 0, urgent: 0, urgentAllEst: false, imminent: null };
    let sum = 0, allEst = true;
    items.forEach(function (r) {
      const s = logic.instScore(r, today);
      if (s === null) { info.unknown += 1; return; }
      info.dated += 1; sum += s;
      if (s === 2) {
        info.within6 += 1;
        if (logic.effectiveBid(r).confidence === '확정') allEst = false;
      } else if (s === 1) info.to12 += 1;
      else if (s === -1) info.to24 += 1;
      else info.over24 += 1;
    });
    info.urgent = info.within6;
    info.urgentAllEst = info.urgent > 0 && allEst;
    if (info.dated === 0) info.band = items.length ? 'gray' : 'none';
    else {
      info.mean = sum / info.dated;
      info.band = logic.mixBandOf(info.mean);
      if ((info.within6 + info.to12) > 0 && (info.band === 'b2' || info.band === 'b3')) info.band = 'p';
    }
    info.imminent = logic.mostImminent(items, today);
    return info;
  };

  // 라벨 뒤에 붙는 ▲n. 6개월 안 기관이 없으면 ''. 모두 추정이면 속 빈 △.
  logic.urgentMark = function (info) {
    if (!info || !(info.urgent > 0)) return '';
    return (info.urgentAllEst ? '△' : '▲') + info.urgent;
  };

  logic.visibleMarkers = function (list, enabledTypes) {
    return list.filter(function (r) {
      if (r.type === '지자체') return false;
      if (logic.FILTERABLE_TYPES.indexOf(r.type) >= 0) return enabledTypes.has(r.type);
      return true; // 미정의 유형(◆)은 항상 표시
    });
  };

  logic.sortByUrgency = function (list, today) {
    return list.slice().sort(function (a, b) {
      return logic.daysUntil(logic.effectiveBid(a).date, today)
           - logic.daysUntil(logic.effectiveBid(b).date, today);
    });
  };

  logic.sortByInterest = function (list, today, isInterested) {
    const on = [], off = [];
    list.forEach(function (r) { (isInterested(r) ? on : off).push(r); });
    return logic.sortByUrgency(on, today).concat(logic.sortByUrgency(off, today));
  };

  logic.CSV_HEADERS = ['기관명','기관구분','지역코드','구시군코드','입찰주기','지난입찰일','입찰예상일','확정여부','경도','위도','출처','수정일'];
  logic._HEADER_KEY = { '기관명':'name','기관구분':'type','지역코드':'region','구시군코드':'subRegion',
    '입찰주기':'term','지난입찰일':'lastBid','입찰예상일':'contractEnd','확정여부':'confirmed',
    '경도':'lng','위도':'lat','출처':'sources','수정일':'updatedAt' };

  // RFC4180 유사: 따옴표/쉼표/개행 처리
  logic._splitCsvLine = function (line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur); return out;
  };

  logic.parseCsv = function (text) {
    const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    const headers = logic._splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      const cells = logic._splitCsvLine(line);
      const rec = {};
      headers.forEach(function (h, i) {
        const key = logic._HEADER_KEY[h]; if (!key) return;
        const v = (cells[i] || '').trim();
        if (key === 'term') rec.term = v ? Number(v) : undefined;
        else if (key === 'lng' || key === 'lat') rec[key] = v ? Number(v) : null;
        else if (key === 'confirmed') rec.confirmed = /^(y|yes|true|1)$/i.test(v);
        else if (key === 'sources') rec.sources = v ? v.split(';').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else rec[key] = v;
      });
      return rec;
    });
  };

  logic.buildCsvTemplate = function () {
    const example = ['마포구청(예시)','지자체','11','11140','2','2022-12-05','','', '', '', '공고URL', '2026-07-25'];
    return '﻿' + logic.CSV_HEADERS.join(',') + '\n' + example.join(',') + '\n';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
