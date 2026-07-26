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
  logic.ALL_FIELDS = ['name','type','region','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt'];

  logic.FIELD_LABELS = { name:'기관명', type:'기관구분', region:'지역코드', term:'입찰주기',
    lastBid:'지난 입찰일', contractEnd:'입찰예상일', confirmed:'확정여부', lng:'경도', lat:'위도',
    sources:'출처', updatedAt:'수정일' };

  logic.URGENCY = { RED:'red', ORANGE:'orange', YELLOW:'yellow', BLUE:'blue', GRAY:'gray' };

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
    const map = { '대학병원':'circle', '공기업':'square', '공공기관':'triangle', '지자체':'polygon' };
    return map[type] || 'diamond';
  };

  logic.FILTERABLE_TYPES = ['공공기관','공기업','대학병원'];

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

  logic.CSV_HEADERS = ['기관명','기관구분','지역코드','입찰주기','지난입찰일','입찰예상일','확정여부','경도','위도','출처','수정일'];
  logic._HEADER_KEY = { '기관명':'name','기관구분':'type','지역코드':'region','입찰주기':'term',
    '지난입찰일':'lastBid','입찰예상일':'contractEnd','확정여부':'confirmed','경도':'lng','위도':'lat',
    '출처':'sources','수정일':'updatedAt' };

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
    const example = ['서울시청(예시)','지자체','11','2','2022-12-05','','', '', '', '공고URL', '2026-07-25'];
    return '﻿' + logic.CSV_HEADERS.join(',') + '\n' + example.join(',') + '\n';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
