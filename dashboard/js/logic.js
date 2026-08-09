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
    if (!logic.effectiveBid(rec).date) return '?';
    return '';
  };

  logic.markerShape = function (type) {
    const map = { '대학병원':'circle', '공기업':'square', '공공기관':'triangle', '지자체':'polygon',
      '대학교':'pentagon' };
    return map[type] || 'diamond';
  };

  logic.FILTERABLE_TYPES = ['공공기관','공기업','대학병원','대학교'];

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
