(function (root) {
  'use strict';
  // 기관 편집(NEXT 72, 030 뒤) — 입찰 예정일(추정/공고로 확정+출처)·운영 상태·기본 정보를 묶음별로 저장한다.
  // 규격 정본: handoff/agents/design-reviewer/2026-11-15_1928_a7fbd71e.md §4~§6. 서버 규칙: InstitutionEditRules.java.
  // 순수 부분(검사·본문 만들기·HTML 조각)은 node 테스트 대상이고, DOM 부분(ie.open)은 브라우저에서만 쓴다.
  const hasReq = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const logic = hasReq ? require('./logic.js') : root.logic;
  const errtext = hasReq ? require('./errtext.js') : root.errtext;
  const esc = logic.esc;
  const ie = {};

  ie.SCREEN = 'institution_edit';
  // 서버 X-Button-Id 허용 목록(InstUiIds)과 1:1. 모달을 여는 동작(open_edit)은 서버로 가는 요청이 없어 쓰지 않는다.
  ie.BTN = { basic: 'save_basic', sched: 'save_schedule', status: 'save_open_status', open: 'open_edit' };
  ie.NET = '서버에 연결하지 못해 저장하지 않았습니다. 서버가 켜져 있는지 확인하세요.';

  // 서버 InstitutionEditRules 문구와 같은 글자(화면 사전 검사와 서버 응답이 따로 놀지 않게).
  ie.MSG = {
    date: '날짜는 YYYY-MM-DD 형식이어야 합니다.',
    dateNone: '존재하지 않는 날짜입니다.',
    dateRange: '날짜 범위(2000~2100)를 벗어났습니다.',
    needSrc: '확정하려면 출처(공고 링크 또는 번호)가 필요합니다.',
    url: '출처 링크는 http 또는 https 주소(500자 이내)여야 합니다.',
    no: '공고 번호 형식이 올바르지 않습니다(50자 이내, 문자·숫자·공백·-_./()).',
    plannedNeedsDate: '개원 예정에는 개원 예정일(연, 연-월 또는 연-월-일)이 필요합니다.',
    opNeedSrc: '운영 상태를 바꾸려면 출처(링크 또는 번호)가 필요합니다.',
    openDate: '개원 예정일은 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.',
    openRange: '개원 예정일 범위(2000~2100)를 벗어났습니다.',
  };

  // ── 형식 검사(서버와 같은 규칙) ───────────────────────────────────
  function exists(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  // 입찰 예정일: 문제 없으면 ''.
  ie.dateMsg = function (s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ie.MSG.date;
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (!exists(y, m, d)) return ie.MSG.dateNone;
    if (y < 2000 || y > 2100) return ie.MSG.dateRange;
    return '';
  };
  // 개원 예정일(연 | 연-월 | 연-월-일): 문제 없으면 ''.
  ie.openDateMsg = function (s) {
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return ie.MSG.openDate;
    const y = +s.slice(0, 4);
    if (y < 2000 || y > 2100) return ie.MSG.openRange;
    if (s.length === 7 && (+s.slice(5, 7) < 1 || +s.slice(5, 7) > 12)) return ie.MSG.dateNone;
    if (s.length === 10 && !exists(y, +s.slice(5, 7), +s.slice(8, 10))) return ie.MSG.dateNone;
    return '';
  };
  // 링크 검사: 서버 InstitutionEditRules.url과 같은 규칙(java.net.URI 해석·host 필수·사용자 정보 거부·공백/제어/서식 문자 거부·500자).
  // Java URI가 거부하는 것 — 허용 밖 글자(| 등), 잘못된 % 인코딩, 밑줄·한글 호스트(host가 비어 보임) — 를 같이 거른다.
  const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
  function hostOk(h) {
    if (/^\[[0-9A-Fa-f:.]+\]$/.test(h)) return true;                       // IPv6 리터럴
    const labels = h.split('.');
    if (labels.some(function (l) { return !HOST_LABEL.test(l); })) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;                         // IPv4
    return /^[A-Za-z]/.test(labels[labels.length - 1]);                      // 이름 호스트의 마지막 조각은 영문으로 시작
  }
  ie.urlMsg = function (s) {
    if (s.length > 500) return ie.MSG.url;
    if (/[\u0000- \u007f]/.test(s) || /\p{Cf}/u.test(s)) return ie.MSG.url;   // 제어·공백·DEL·보이지 않는 서식 문자(U+200B·U+202E 등)
    const m = /^https?:\/\/([^\/?#]*)([^]*)$/i.exec(s);
    if (!m) return ie.MSG.url;
    const auth = m[1], rest = m[2];
    if (auth.indexOf('@') >= 0) return ie.MSG.url;                           // 사용자 정보(user:pw@)
    const hp = /^(.*?)(?::(\d*))?$/.exec(auth);
    const host = hp ? hp[1] : '';
    if (!host || !hostOk(host)) return ie.MSG.url;
    if (/["<>\\^`{|}\[\]]/.test(rest) || /%(?![0-9A-Fa-f]{2})/.test(rest) || (rest.match(/#/g) || []).length > 1) return ie.MSG.url;
    return '';
  };
  ie.noMsg = function (s) {
    return /^[\p{L}\p{N}][\p{L}\p{N} _.\/()\-]{0,49}$/u.test(s) ? '' : ie.MSG.no;
  };

  // ── 초기값: 서버 기관 행의 원래 값(공고로 덮이기 전) ─────────────
  // serverdata.mapServerRow가 rec._inst에 보관한 값을 쓴다. 서버 칸이 없는 행(번들·옛 서버)은 rec 칸으로 대신한다.
  ie.initial = function (rec) {
    const r = rec || {};
    const i = r._inst;
    const sched = i
      ? { date: i.contractEnd || '', confirmed: i.confirmed === true, srcUrl: i.srcUrl || '', srcNo: i.srcNo || '' }
      : { date: r.contractEnd || '', confirmed: r.confirmed === true, srcUrl: r.contractEndSrcUrl || '', srcNo: r.contractEndSrcNo || '' };
    return {
      sched: sched,
      status: { status: r.opStatus === '개원 예정' ? 'PLANNED' : 'OPERATING', openDate: r.openDate || '', srcUrl: r.opSrcUrl || '', srcNo: r.opSrcNo || '' },
      bid: r._bid ? { date: r._bid.date, confirmed: !!r._bid.confirmed } : null,
      openCheck: r.openCheckNeeded === true,
    };
  };

  function t(s) { return String(s == null ? '' : s).trim(); }

  // ── 입찰 예정일 묶음(save_schedule) ───────────────────────────────
  // f = { date, confirmed, url, no }, opts.local = 서버에 등록되지 않은(파일 모드) 기관 — 출처 없이 이 PC에만 저장.
  // → { changed, dateChanged, confirmed, required, showSrc, errors:[{msg, ids}], body }
  ie.scheduleCheck = function (init, f, opts) {
    const local = !!(opts && opts.local);
    const date = t(f.date);
    const confirmed = !!f.confirmed && date !== '';
    const dateChanged = date !== (init.date || '');
    const confChanged = confirmed !== !!init.confirmed;
    const url = t(f.url), no = t(f.no);
    const hadSrc = !!(init.srcUrl || init.srcNo);
    const showSrc = confirmed && !local;
    // 출처가 꼭 필요한 경우: 날짜를 바꿈 / 원래 추정이었음 / 원래 확정인데 출처가 없음
    const required = showSrc && (dateChanged || !init.confirmed || !hadSrc);
    const srcTyped = showSrc && (url !== '' || no !== '');
    const changed = dateChanged || confChanged || srcTyped;
    const errors = [];
    if (dateChanged && date !== '') {
      const m = ie.dateMsg(date);
      if (m) errors.push({ msg: m, ids: ['ie-ce'] });
    }
    if (showSrc) {
      if (required && url === '' && no === '') errors.push({ msg: ie.MSG.needSrc, ids: ['ie-cu', 'ie-cn'] });
      if (url !== '') { const m = ie.urlMsg(url); if (m) errors.push({ msg: m, ids: ['ie-cu'] }); }
      if (no !== '') { const m = ie.noMsg(no); if (m) errors.push({ msg: m, ids: ['ie-cn'] }); }
    }
    // 보내는 규칙(규격 6-A): 날짜는 바뀐 경우에만(키 자체를 안 넣음), 확정 여부는 늘, 출처는 확정이고 비어 있지 않을 때만.
    const body = {};
    if (dateChanged) body.contract_end = date === '' ? null : date;
    body.contract_end_confirmed = confirmed;
    if (showSrc && url !== '') body.contract_end_src_url = url;
    if (showSrc && no !== '') body.contract_end_src_no = no;
    // 출처가 필요한 이유(힌트 문구용, 첫 번째로 맞는 하나): 날짜를 바꿈 → 원래 추정 → 원래 확정인데 출처 없음
    const reason = !required ? '' : dateChanged ? 'moved' : !init.confirmed ? 'est' : 'nosrc';
    return { changed: changed, dateChanged: dateChanged, confirmed: confirmed, required: required, reason: reason, showSrc: showSrc, errors: errors, body: body };
  };
  ie.SRC_HINT = {
    moved: '날짜를 바꾸면 현재 출처는 이어지지 않습니다. 공고 링크와 공고 번호 중 하나는 꼭 적습니다.',
    est: '공고로 확정하려면 공고 링크와 공고 번호 중 하나는 꼭 적습니다.',
    nosrc: '현재 출처가 기록되지 않았습니다. 공고 링크와 공고 번호 중 하나는 꼭 적습니다.',
    none: '비워 두면 현재 출처를 그대로 씁니다.',
  };
  // 저장이 끝난 뒤의 기준값 — 서버가 정하는 규칙(같은 날짜의 확정만 옛 출처를 잇는다)을 그대로 따른다.
  ie.afterSchedule = function (init, f) {
    const date = t(f.date);
    const confirmed = !!f.confirmed && date !== '';
    if (!confirmed) return { date: date, confirmed: false, srcUrl: '', srcNo: '' };
    const keep = date === (init.date || '') && !!init.confirmed;
    return { date: date, confirmed: true, srcUrl: t(f.url) || (keep ? init.srcUrl : ''), srcNo: t(f.no) || (keep ? init.srcNo : '') };
  };

  // ── 운영 상태 묶음(save_open_status) ──────────────────────────────
  // f = { status:'OPERATING'|'PLANNED', openDate, url, no }
  ie.statusCheck = function (init, f) {
    const st = f.status === 'PLANNED' ? 'PLANNED' : 'OPERATING';
    const od = t(f.openDate), url = t(f.url), no = t(f.no);
    const stChanged = st !== init.status;
    const odChanged = od !== (init.openDate || '');
    const changed = stChanged || odChanged || url !== '' || no !== '';
    const errors = [];
    if (od !== '' && (odChanged || st === 'PLANNED')) {
      const m = ie.openDateMsg(od);
      if (m) errors.push({ msg: m, ids: ['ie-od'] });
    }
    if (st === 'PLANNED' && od === '') errors.push({ msg: ie.MSG.plannedNeedsDate, ids: ['ie-od'] });
    if (stChanged && url === '' && no === '') errors.push({ msg: ie.MSG.opNeedSrc, ids: ['ie-ou', 'ie-on'] });
    if (url !== '') { const m = ie.urlMsg(url); if (m) errors.push({ msg: m, ids: ['ie-ou'] }); }
    if (no !== '') { const m = ie.noMsg(no); if (m) errors.push({ msg: m, ids: ['ie-on'] }); }
    // 각각 바뀐 경우에만, 출처는 비어 있지 않을 때만(서버의 '출처를 모두 비울 수 없습니다'가 화면 흐름에서 나지 않게).
    const body = {};
    if (stChanged) body.op_status = st;
    if (odChanged) body.open_date = od === '' ? null : od;
    if (url !== '') body.op_src_url = url;
    if (no !== '') body.op_src_no = no;
    return { changed: changed, stChanged: stChanged, required: stChanged, errors: errors, body: body };
  };
  ie.afterStatus = function (init, f) {
    const st = f.status === 'PLANNED' ? 'PLANNED' : 'OPERATING';
    const stChanged = st !== init.status;
    return { status: st, openDate: t(f.openDate),
      srcUrl: stChanged ? t(f.url) : (t(f.url) || init.srcUrl), srcNo: stChanged ? t(f.no) : (t(f.no) || init.srcNo) };
  };

  // ── 기본 정보 묶음(save_basic) ────────────────────────────────────
  ie.BASIC_FIELDS = ['name', 'type', 'region', 'subRegion', 'term', 'lastBid', 'contractExpiry', 'lng', 'lat', 'sources'];
  ie.basicValues = function (rec) {
    const out = {};
    ie.BASIC_FIELDS.forEach(function (f) {
      out[f] = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] == null ? '' : String(rec[f]));
    });
    return out;
  };
  // 바뀐 칸 이름 목록(기관명은 서버 모드에서 잠겨 있어 호출 쪽이 vals에서 뺀다).
  ie.basicChanged = function (base, vals) {
    return Object.keys(vals).filter(function (f) { return vals[f] !== (base[f] == null ? '' : base[f]); });
  };
  // 서버로 보낼 본문 — 바뀐 서버 칸만. 비운 칸은 null(지움).
  // 숫자 칸: 입찰주기는 0 이상의 정수, 경도·위도는 소수 가능. 비운 칸은 검사하지 않는다(지움).
  const INT = /^\d+$/, DEC = /^-?\d+(\.\d+)?$/;
  ie.NUM_MSG = { term: '입찰주기는 숫자(년)로 적습니다.', lng: '경도는 숫자로 적습니다.', lat: '위도는 숫자로 적습니다.' };
  // 바뀐 숫자 칸이 숫자가 아니면 [{ msg, fields:[칸 이름] }] — 저장을 막고 묶음 안에 보여 준다.
  ie.basicErrors = function (base, vals) {
    const errors = [];
    ie.basicChanged(base, vals).forEach(function (f) {
      if (!ie.NUM_MSG[f]) return;
      const v = t(vals[f]);
      if (v !== '' && !(f === 'term' ? INT : DEC).test(v)) errors.push({ msg: ie.NUM_MSG[f], ids: [], fields: [f] });
    });
    return errors;
  };
  ie.basicPatch = function (base, vals) {
    const body = {};
    const changed = ie.basicChanged(base, vals);
    const map = { region: 'region_code', type: 'type', lastBid: 'last_bid' };
    changed.forEach(function (f) {
      const v = t(vals[f]);
      if (map[f]) body[map[f]] = v === '' ? null : v;
      else if (f === 'term') {
        if (v === '') body.term = null;
        else if (INT.test(v)) body.term = Number(v);
        // 숫자가 아니면 본문에 넣지 않는다(NaN → null로 서버 값이 지워지는 것 방지) — 호출 쪽이 basicErrors로 먼저 막는다
      }
    });
    return body;
  };
  // 이 PC(로컬 overlay)에 둘 칸 — 값이 바뀐 것만. 경도·위도는 숫자로 저장한다(지도는 typeof number인 기관만 마커로 그린다).
  ie.basicLocal = function (base, vals) {
    const out = {};
    ie.basicChanged(base, vals).forEach(function (f) {
      if (f === 'sources') out[f] = vals[f].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      else if ((f === 'lng' || f === 'lat') && DEC.test(t(vals[f]))) out[f] = Number(t(vals[f]));
      else out[f] = vals[f];
    });
    return out;
  };

  // ── 오류 글 ───────────────────────────────────────────────────────
  // 서버 detail 문구를 그대로 보여 준다(headcard.errText와 같은 방식). 문구가 없으면 상태 번호별 안내.
  ie.errText = function (status, detail) {
    const p = errtext.parse(detail);
    const generic404 = status === 404 && /^not found$/i.test(p.message);
    if (p.message && !generic404) return p.message;
    if (!status) return ie.NET;
    if (status === 401) return '로그인이 필요합니다. 로그인한 뒤 다시 저장하세요.';
    if (status === 403) return '이 기능을 쓸 권한이 없습니다.';
    if (status === 404) return '대상을 찾지 못했습니다. 새로 고친 뒤 다시 시도하세요.';
    return '저장하지 못했습니다 (' + status + ')';
  };
  ie.headers = function (button) {
    return { 'Content-Type': 'application/json', 'X-Screen-Id': ie.SCREEN, 'X-Button-Id': button };
  };

  // ── 출처 표시(링크는 safeHttpUrl → esc → 새 창) ───────────────────
  ie.hostOf = function (u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  };
  // 출처 링크·번호 한 줄 조각. 둘 다 없으면 '' (호출 쪽이 '출처 미기록'을 정한다). noLabel = 번호 앞 이름.
  ie.srcInner = function (url, no, noLabel) {
    const u = logic.safeHttpUrl(url);
    const raw = t(url);
    const n = t(no);
    const parts = [];
    if (u) {
      const host = ie.hostOf(u) || u;
      parts.push('<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(u) + '">' + esc(host) + '</a> <span class="db-why">(인터넷 PC에서 열림)</span>');
    } else if (raw) parts.push(esc(raw));   // 안전하지 않은 주소는 링크 없이 글자로만
    if (n) parts.push(esc(noLabel || '공고 번호') + ' <span class="v">' + esc(n) + '</span>');
    return parts.join(' · ');
  };
  // 6-D: 확정 날짜 옆 출처. 표시 날짜가 기관 행의 확정 값일 때만(공고에서 온 날짜면 '공고 진행' 절이 맡는다).
  ie.confirmSrcHtml = function (rec) {
    const i = rec && rec._inst;
    if (!i || i.confirmed !== true || rec._bid) return '';
    const inner = ie.srcInner(i.srcUrl, i.srcNo, '공고 번호');
    return '<br><span class="db-why">출처</span> ' + (inner || '<span class="pop-unk">출처 미기록</span>');
  };
  // 6-D: 개원 예정 기관의 운영 상태 줄 내용(dd 안). 운영 중이면 ''.
  ie.opLineHtml = function (rec) {
    if (!rec || rec.opStatus !== '개원 예정') return '';
    const inner = rec._inst ? ie.srcInner(rec.opSrcUrl, rec.opSrcNo, '번호') : '';
    const src = rec._inst ? '<br><span class="db-why">출처</span> ' + (inner || '<span class="pop-unk">출처 미기록</span>') : '';
    return '개원 예정' + (rec.openDate ? ' · 개원 예정일 <span class="v">' + esc(rec.openDate) + '</span>' : '') + src;
  };

  // ── 개원 확인 필요(6-E) ───────────────────────────────────────────
  // 서버가 open_check_needed로 알려 준 개원 예정 기관(개원 예정일이 지남). 개원 예정일 빠른 순 → 이름.
  ie.isOpenCheck = function (r) { return !!r && r.openCheckNeeded === true && r.opStatus === '개원 예정'; };
  ie.openCheckList = function (list) {
    return (list || []).filter(ie.isOpenCheck)
      .sort(function (a, b) {
        const x = a.openDate || '', y = b.openDate || '';
        return x < y ? -1 : (x > y ? 1 : ((a.name || '') < (b.name || '') ? -1 : 1));
      });
  };
  // 운영 상태 묶음을 펼치는가: 법원 · 개원 예정 · 개원 확인 필요.
  ie.expandStatus = function (rec) {
    return !!rec && (rec.type === '법원' || rec.opStatus === '개원 예정' || rec.openCheckNeeded === true);
  };

  // ── HTML 조각 ─────────────────────────────────────────────────────
  function lab(id, text, value, extra) {
    return '<label class="ie-lab' + (extra && extra.cls ? ' ' + extra.cls : '') + '"><span class="ie-lt" id="' + id + '-t">' + esc(text) + '</span><input id="' + id + '" autocomplete="off"' +
      (value != null ? ' value="' + esc(value) + '"' : '') + (extra && extra.attr ? ' ' + extra.attr : '') + '></label>';
  }
  function radios(name, legend, items) {
    return '<fieldset class="ie-radio"><legend>' + esc(legend) + '</legend>' + items.map(function (it) {
      return '<label><input type="radio" name="' + name + '" value="' + it[0] + '"' + (it[2] ? ' ' + it[2] : '') + '> ' + esc(it[1]) + '</label>';
    }).join('') + '</fieldset>';
  }
  function curSrc(id, url, no, noLabel, always) {
    const inner = ie.srcInner(url, no, noLabel);
    if (!inner && !always) return '<p class="ie-cur" id="' + id + '" hidden></p>';
    return '<p class="ie-cur" id="' + id + '">현재 출처: ' + (inner || '<span class="pop-unk">출처 미기록</span>') + '</p>';
  }
  function row(g, label) {
    return '<p class="ie-err" id="ie-' + g + '-err" role="alert"></p>' +
      '<div class="ie-row"><button type="button" id="ie-save-' + g + '" disabled>' + esc(label) + '</button></div>' +
      '<p class="ie-ok" id="ie-' + g + '-ok" role="status"></p>';
  }

  // opts = { local } — local이면 출처 칸 없이 이 PC에만 저장하는 모양.
  ie.schedHtml = function (init, opts) {
    const local = !!(opts && opts.local);
    const s = init.sched;
    let h = '<fieldset class="ie-fs" id="ie-sched"><legend>입찰 예정일</legend><div class="ie-grid">';
    if (init.bid) {
      h += '<p class="ie-note">반입된 공고가 있어 지도·현황판에는 공고 날짜 <span class="v">' + esc(init.bid.date) + '</span>(' +
        (init.bid.confirmed ? '공고로 확정' : '추정') + ')가 보입니다. 여기 값은 공고가 없을 때 쓰는 기관 기본값입니다.</p>';
    }
    h += lab('ie-ce', '입찰 예정일', s.date, { attr: 'inputmode="numeric" placeholder="YYYY-MM-DD" aria-describedby="ie-sched-err"' }) + '<span></span>';
    h += radios('ie-cf', '날짜 근거', [['false', '추정'], ['true', '공고로 확정', 'aria-describedby="ie-cf-h"']]);
    h += '<p class="ie-note" id="ie-cf-h" hidden>날짜가 없으면 확정할 수 없습니다.</p>';
    if (!local) {
      h += curSrc('ie-cur-s', s.confirmed ? s.srcUrl : '', s.confirmed ? s.srcNo : '', '공고 번호');
      h += '<div class="ie-src" id="ie-src" hidden><p class="ie-note" id="ie-src-h"></p>' +
        lab('ie-cu', '공고 링크', '', { attr: 'placeholder="https://" aria-describedby="ie-src-h ie-sched-err"' }) +
        lab('ie-cn', '공고 번호', '', { attr: 'placeholder="예: R26BK01234567" aria-describedby="ie-src-h ie-sched-err"' }) + '</div>';
    }
    return h + row('sched', '입찰 예정일 저장') + '</div></fieldset>';
  };

  ie.statusHtml = function (rec, init) {
    const s = init.status;
    let h = '<fieldset class="ie-fs" id="ie-status"><legend>운영 상태</legend><div class="ie-grid">';
    if (init.openCheck) {
      h += '<p class="ie-warn">개원 예정일(<span class="v">' + esc(s.openDate) + '</span>)이 지났습니다. 개원했으면 출처와 함께 \'운영\'으로 바꾸고, 아직이면 새 개원 예정일을 넣으세요.</p>';
    }
    h += radios('ie-os', '상태', [['OPERATING', '운영'], ['PLANNED', '개원 예정']]);
    h += lab('ie-od', '개원일', s.openDate, { attr: 'placeholder="2028 또는 2028-03 또는 2028-03-01" aria-describedby="ie-status-err"' }) + '<span></span>';
    h += curSrc('ie-cur-o', s.srcUrl, s.srcNo, '번호', true);
    h += '<div class="ie-src" id="ie-osrc"><p class="ie-note" id="ie-osrc-h"></p>' +
      lab('ie-ou', '출처 링크', '', { attr: 'placeholder="https://" aria-describedby="ie-osrc-h ie-status-err"' }) +
      lab('ie-on', '출처 번호', '', { attr: 'placeholder="공고·보도자료 번호" aria-describedby="ie-osrc-h ie-status-err"' }) + '</div>';
    h += row('status', '운영 상태 저장') + '</div></fieldset>';
    if (ie.expandStatus(rec)) return h;
    return '<details class="ie-det" id="ie-st-det"><summary>운영 상태: 운영 — 바꿀 때만 펼치세요</summary>' + h + '</details>';
  };

  ie.basicHtml = function (rec, ctx) {
    const base = ie.basicValues(rec);
    const L = logic.FIELD_LABELS;
    let h = '<fieldset class="ie-fs" id="ie-basic"><legend>기본 정보</legend><div class="ie-grid">';
    ie.BASIC_FIELDS.forEach(function (f) {
      const locked = ctx.server && logic.SERVER_UNSAVABLE_FIELDS.indexOf(f) >= 0;
      const label = (f === 'term' ? '입찰주기(년)' : (L[f] || f)) + (locked ? ' (서버 모드에서는 변경 불가)' : '');
      h += '<label class="ie-lab' + (f === 'sources' ? ' ie-wide' : '') + '"><span class="ie-lt">' + esc(label) + '</span><input data-f="' + f + '" autocomplete="off" value="' + esc(base[f]) + '"' +
        (locked ? ' disabled title="기관명은 서버 등록·병합의 기준 이름이라 화면에서 바꿀 수 없습니다"' : '') + '></label>';
    });
    h += '<p class="ie-note ie-wide">출처는 쉼표로 나눠 한 개 이상 적습니다.</p>';
    return h + row('basic', '기본 정보 저장') + '</div></fieldset>';
  };

  ie.subHtml = function (rec, regionName) {
    const kind = logic.kindOf(rec.type) || rec.type || '';
    let h = [rec.name || '(이름없음)', kind, regionName].filter(Boolean).map(esc).join(' · ');
    if (rec.orgCode) h += ' · 기관 코드 <span class="v">' + esc(rec.orgCode) + '</span>';
    if (rec.g2bCode) h += ' · 나라장터 코드 <span class="v">' + esc(rec.g2bCode) + '</span>';
    return h;
  };

  // ── DOM(브라우저 전용) ────────────────────────────────────────────
  let cur = null;

  ie.isOpen = function () { return !!cur; };

  // rec 편집창을 연다. opts = { opener, focus:'status'|'bank', bootstrap:()=>Promise, repaint:()=>void }
  ie.open = function (rec, opts) {
    opts = opts || {};
    if (typeof document === 'undefined' || !rec) return;
    const modal = document.getElementById('edit-modal');
    const wrap = document.getElementById('edit-fields');
    const box = document.getElementById('ie-box');
    if (!modal || !wrap) return;
    if (cur) cur.teardown();

    const server = !!(root.store && root.store.isServerMode());
    const registered = server && !!rec.institutionId;
    const act = document.activeElement;
    const S = {
      rec: rec, server: server, registered: registered, init: ie.initial(rec), base: ie.basicValues(rec), busy: {}, confirm: false,
      opener: opts.opener || (act && act !== document.body ? act : null), lastFocus: null,
    };
    cur = S;

    // 서버 모드인데 서버에 없는 기관(번들에만 있음) — 날짜·운영 상태는 고칠 곳이 없다. 이 PC 전용 칸만 둔다.
    // 서버 모드가 아니면(파일 모드) 날짜·근거를 이 PC에만 저장한다.
    const showSched = !server || registered;
    const local = !server;
    let html = '';
    if (server && !registered) {
      html += '<p class="ie-note ie-lone">서버에 등록되지 않은 기관이라 입찰 예정일·운영 상태는 바꿀 수 없습니다. 아래에서는 좌표·출처 등 이 PC에만 저장하는 칸을 고칩니다.</p>';
    }
    if (showSched) html += ie.schedHtml(S.init, { local: local });
    if (registered) html += ie.statusHtml(rec, S.init);
    if (registered && root.bankcontract) html += root.bankcontract.groupHtml();   // 금고 약정(NEXT 89): 운영 상태 다음, 기본 정보 앞
    html += ie.basicHtml(rec, { server: server });
    wrap.innerHTML = html;
    S.bankCtl = registered && root.bankcontract ? root.bankcontract.attach({ wrap: wrap, rec: rec }) : null;
    const regionName = (root.render && root.render.REGION_NAME && root.render.REGION_NAME[rec.region]) || '';
    const subEl = document.getElementById('ie-sub');
    if (subEl) subEl.innerHTML = ie.subHtml(rec, regionName);
    modal.style.display = 'block';

    function q(sel) { return wrap.querySelector(sel); }
    function val(id) { const e = q('#' + id); return e ? e.value : ''; }
    function radioVal(name) { const e = q('input[name=' + name + ']:checked'); return e ? e.value : ''; }
    function setRadio(name, v) { const e = q('input[name=' + name + '][value="' + v + '"]'); if (e) e.checked = true; }
    function setText(id, s) { const e = q('#' + id); if (e) e.textContent = s; }

    function readSched() { return { date: val('ie-ce'), confirmed: radioVal('ie-cf') === 'true', url: val('ie-cu'), no: val('ie-cn') }; }
    function readStatus() { return { status: radioVal('ie-os'), openDate: val('ie-od'), url: val('ie-ou'), no: val('ie-on') }; }
    function readBasic() {
      const v = {};
      wrap.querySelectorAll('#ie-basic input[data-f]').forEach(function (inp) { if (!inp.disabled) v[inp.dataset.f] = inp.value; });
      return v;
    }
    function fillSched(s) {
      const ce = q('#ie-ce'); if (!ce) return;
      ce.value = s.date; setRadio('ie-cf', s.confirmed ? 'true' : 'false');
      const u = q('#ie-cu'), n = q('#ie-cn'); if (u) u.value = ''; if (n) n.value = '';
      const cs = q('#ie-cur-s');
      if (cs) {
        const inner = s.confirmed ? ie.srcInner(s.srcUrl, s.srcNo, '공고 번호') : '';
        cs.hidden = !inner; cs.innerHTML = inner ? '현재 출처: ' + inner : '';
      }
    }
    function fillStatus(s) {
      if (!q('#ie-od')) return;
      setRadio('ie-os', s.status); q('#ie-od').value = s.openDate;
      q('#ie-ou').value = ''; q('#ie-on').value = '';
      const inner = ie.srcInner(s.srcUrl, s.srcNo, '번호');
      q('#ie-cur-o').innerHTML = '현재 출처: ' + (inner || '<span class="pop-unk">출처 미기록</span>');
    }

    function clearMsg(g) {
      setText('ie-' + g + '-err', ''); setText('ie-' + g + '-ok', '');
      const ids = { sched: ['ie-ce', 'ie-cu', 'ie-cn'], status: ['ie-od', 'ie-ou', 'ie-on'], basic: [] }[g];
      ids.forEach(function (id) { const e = q('#' + id); if (e) e.removeAttribute('aria-invalid'); });
      wrap.querySelectorAll('#ie-' + g + ' input[data-f]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    }
    function showErr(g, errors) {
      const e = errors[0];
      setText('ie-' + g + '-err', e.msg);
      (e.ids || []).forEach(function (id) { const el = q('#' + id); if (el) el.setAttribute('aria-invalid', 'true'); });
      // 기본 정보 묶음은 칸 id 대신 data-f 이름(fields)으로 가리킨다
      const fl = (e.fields || []).map(function (n) { return q('#ie-basic input[data-f="' + n + '"]'); }).filter(Boolean);
      fl.forEach(function (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'ie-basic-err'); });
      const first = fl[0] || (e.ids && e.ids[0] ? q('#' + e.ids[0]) : null);
      if (first) first.focus();
    }
    function saveBtn(g, c) {
      const b = q('#ie-save-' + g); if (!b) return;
      b.disabled = !c.changed || !!S.busy[g];
      b.textContent = S.busy[g] ? '저장 중…' : { sched: '입찰 예정일 저장', status: '운영 상태 저장', basic: '기본 정보 저장' }[g];
    }

    function refreshSched() {
      if (!q('#ie-sched')) return;
      const ce = q('#ie-ce');
      const hasDate = ce.value.trim() !== '';
      const yes = q('input[name=ie-cf][value=true]');
      yes.disabled = !hasDate;
      if (!hasDate && yes.checked) setRadio('ie-cf', 'false');
      q('#ie-cf-h').hidden = hasDate;
      const c = ie.scheduleCheck(S.init.sched, readSched(), { local: !S.registered });
      const src = q('#ie-src');
      if (src) {
        src.hidden = !c.showSrc;
        setText('ie-src-h', ie.SRC_HINT[c.reason || 'none']);
        const mark = c.required ? ' (필수)' : '';
        setText('ie-cu-t', '공고 링크' + mark); setText('ie-cn-t', '공고 번호' + mark);
        ['ie-cu', 'ie-cn'].forEach(function (id) { const e = q('#' + id); if (c.required) e.setAttribute('aria-required', 'true'); else e.removeAttribute('aria-required'); });
      }
      saveBtn('sched', c);
      return c;
    }
    function refreshStatus() {
      if (!q('#ie-status')) return;
      const f = readStatus();
      const planned = f.status === 'PLANNED';
      setText('ie-od-t', planned ? '개원 예정일 (필수)' : '개원일');
      const od = q('#ie-od'); if (planned) od.setAttribute('aria-required', 'true'); else od.removeAttribute('aria-required');
      const c = ie.statusCheck(S.init.status, f);
      setText('ie-osrc-h', c.required ? '상태를 바꿀 때는 출처 링크와 출처 번호 중 하나는 꼭 적습니다.' : '비워 두면 현재 출처를 그대로 씁니다.');
      ['ie-ou', 'ie-on'].forEach(function (id) {
        const e = q('#' + id); if (c.required) e.setAttribute('aria-required', 'true'); else e.removeAttribute('aria-required');
      });
      setText('ie-ou-t', '출처 링크' + (c.required ? ' (필수)' : '')); setText('ie-on-t', '출처 번호' + (c.required ? ' (필수)' : ''));
      saveBtn('status', c);
      return c;
    }
    function refreshBasic() {
      if (!q('#ie-basic')) return;
      saveBtn('basic', { changed: ie.basicChanged(S.base, readBasic()).length > 0 });
    }
    function refresh(g) {
      if (g === 'sched') refreshSched(); else if (g === 'status') refreshStatus(); else refreshBasic();
    }
    function dirtyNames() {
      const out = [];
      if (q('#ie-sched') && ie.scheduleCheck(S.init.sched, readSched(), { local: !S.registered }).changed) out.push('입찰 예정일');
      if (q('#ie-status') && ie.statusCheck(S.init.status, readStatus()).changed) out.push('운영 상태');
      if (S.bankCtl && S.bankCtl.dirty()) out.push('금고 약정');
      if (q('#ie-basic') && ie.basicChanged(S.base, readBasic()).length) out.push('기본 정보');
      return out;
    }

    function put(button, body) {
      return fetch('/institutions/' + encodeURIComponent(S.rec.institutionId), {
        method: 'PUT', headers: ie.headers(button), body: JSON.stringify(body),
      }).then(function (r) {
        if (r.ok) return { ok: true };
        return r.json().catch(function () { return null; }).then(function (b) {
          return { ok: false, msg: ie.errText(r.status, b && b.detail) };
        });
      }, function () { return { ok: false, msg: ie.NET }; });
    }
    // 서버 저장 뒤: 목록을 다시 받아 화면을 다시 그리고, 모달의 기준 기관 행을 새 값으로 바꾼다.
    function reload() {
      const done = function () {
        const list = (root.store && root.store.loadData && root.store.loadData()) || [];
        const fresh = list.filter(function (r) { return r.institutionId === S.rec.institutionId; })[0];
        if (fresh && root.store.applyEdits) S.rec = root.store.applyEdits([fresh])[0] || fresh;
        if (opts.repaint) opts.repaint();
      };
      return (opts.bootstrap ? Promise.resolve(opts.bootstrap()) : Promise.resolve()).then(done, done);
    }
    function finish(g, okText) {
      setText('ie-' + g + '-ok', okText);
      refresh(g);
      const first = { sched: '#ie-ce', status: '#ie-od', basic: '#ie-basic input[data-f]:not([disabled])' }[g];
      const e = q(first); if (e && e.focus) e.focus();
    }
    // 서버 저장 한 건. after = 성공 뒤 기준값을 바꾸는 함수.
    function saveServer(g, button, body, okText, after) {
      if (S.busy[g]) return;
      S.busy[g] = true; refresh(g);
      return put(button, body).then(function (res) {
        S.busy[g] = false;
        if (cur !== S) return;
        if (!res.ok) { showErr(g, [{ msg: res.msg, ids: [] }]); refresh(g); return; }
        return reload().then(function () {
          if (cur !== S) return;
          after();
          finish(g, okText);
        });
      });
    }

    function saveSched() {
      const f = readSched();
      const c = ie.scheduleCheck(S.init.sched, f, { local: !S.registered });
      clearMsg('sched');
      if (c.errors.length) { showErr('sched', c.errors); return; }
      if (!S.registered) {   // 파일 모드: 이 PC에만 저장
        root.store.setEdit(S.rec.name, { contractEnd: t(f.date), confirmed: c.confirmed });
        S.init.sched = { date: t(f.date), confirmed: c.confirmed, srcUrl: '', srcNo: '' };
        if (opts.repaint) opts.repaint();
        finish('sched', '입찰 예정일을 저장했습니다.');
        return;
      }
      const next = ie.afterSchedule(S.init.sched, f);
      return saveServer('sched', ie.BTN.sched, c.body, '입찰 예정일을 저장했습니다.', function () {
        S.init.sched = next; fillSched(next);
      });
    }
    function saveStatus() {
      const f = readStatus();
      const c = ie.statusCheck(S.init.status, f);
      clearMsg('status');
      if (c.errors.length) { showErr('status', c.errors); return; }
      const next = ie.afterStatus(S.init.status, f);
      return saveServer('status', ie.BTN.status, c.body, '운영 상태를 저장했습니다.', function () {
        S.init.status = next; fillStatus(next);
      });
    }
    function saveBasic() {
      const vals = readBasic();
      clearMsg('basic');
      const numErr = ie.basicErrors(S.base, vals);
      if (numErr.length) { showErr('basic', numErr); return; }
      const merged = Object.assign({}, S.rec);
      const local = ie.basicLocal(S.base, vals);
      Object.keys(local).forEach(function (f) { merged[f] = local[f]; });
      const v = logic.validateRecord(merged);
      if (!v.valid) {
        const ids = v.missing.map(function (k) { return k; });
        const msg = '필수 항목이 비어 있습니다: ' + v.missing.map(function (k) { return logic.FIELD_LABELS[k] || k; }).join(', ') + '.';
        setText('ie-basic-err', msg);
        const el = q('#ie-basic input[data-f="' + ids[0] + '"]');
        if (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'ie-basic-err'); el.focus(); }
        return;
      }
      const patch = ie.basicPatch(S.base, vals);
      const keep = function () {
        if (Object.keys(local).length) root.store.setEdit(S.rec.name, local);   // 로컬 전용 칸 overlay는 항상 유지
        S.base = Object.assign({}, S.base, vals);
        if (opts.repaint) opts.repaint();   // 서버 저장 뒤 다시 그린 화면에 로컬 칸도 반영
      };
      if (S.registered && Object.keys(patch).length) {
        return saveServer('basic', ie.BTN.basic, patch, '기본 정보를 저장했습니다.', keep);
      }
      keep();
      finish('basic', '기본 정보를 저장했습니다.' + (server && !S.registered ? ' (서버에 없는 기관이라 이 PC에만 저장됩니다.)' : ''));
    }

    // ── 닫기·포커스 ──
    function focusables() {
      return Array.prototype.filter.call(modal.querySelectorAll('button, input, select, textarea, a[href], summary'), function (n) {
        return !n.disabled && n.getClientRects().length > 0;
      });
    }
    function removeConfirm() {
      const cb = document.getElementById('ie-cbox'); if (cb) cb.remove();
      S.confirm = false;
    }
    function keepEditing() {
      removeConfirm();
      const b = S.lastFocus && document.body.contains(S.lastFocus) ? S.lastFocus : document.getElementById('edit-cancel');
      if (b && b.focus) b.focus();
    }
    function closeNow() {
      S.teardown();
      const o = S.opener;
      if (o && o.focus && document.body.contains(o)) o.focus();
    }
    function requestClose() {
      if (S.confirm) { keepEditing(); return; }
      const names = dirtyNames();
      if (!names.length) { closeNow(); return; }
      S.lastFocus = document.activeElement;
      const foot = document.getElementById('ie-foot');
      const cb = document.createElement('div');
      cb.id = 'ie-cbox'; cb.className = 'hc-confirmbox ie-cbox'; cb.setAttribute('role', 'group'); cb.setAttribute('aria-labelledby', 'ie-cb-t');
      cb.innerHTML = '<p id="ie-cb-t">저장하지 않은 변경이 있습니다: ' + esc(names.join(', ')) + '.</p>' +
        '<div class="ie-row"><button type="button" id="ie-cb-drop">버리고 닫기</button><button type="button" id="ie-cb-keep">계속 편집</button></div>';
      foot.insertBefore(cb, foot.firstChild);
      S.confirm = true;
      document.getElementById('ie-cb-keep').focus();
    }
    function onKey(e) {
      if (cur !== S) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(), a = document.activeElement;
      if (!f.length) { e.preventDefault(); if (box) box.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (a === first || f.indexOf(a) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !modal.contains(a))) { e.preventDefault(); first.focus(); }
    }
    let downOn = null;
    function onDown(e) { downOn = e.target; }
    function onBackdrop(e) { if (e.target === modal && downOn === modal) requestClose(); }

    S.teardown = function () {
      document.removeEventListener('keydown', onKey, true);
      modal.removeEventListener('mousedown', onDown);
      modal.removeEventListener('click', onBackdrop);
      wrap.oninput = wrap.onchange = wrap.onclick = null;
      if (S.bankCtl) { S.bankCtl.teardown(); S.bankCtl = null; }
      removeConfirm();
      modal.style.display = 'none';
      wrap.innerHTML = '';
      if (cur === S) cur = null;
    };
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('mousedown', onDown);
    modal.addEventListener('click', onBackdrop);
    document.getElementById('edit-cancel').onclick = requestClose;
    const foot = document.getElementById('ie-foot');
    foot.onclick = function (e) {
      const id = e.target && e.target.id;
      if (id === 'ie-cb-drop') closeNow();
      else if (id === 'ie-cb-keep') keepEditing();
    };

    function onEdit(e) {
      if (S.bankCtl && e.target.closest && e.target.closest('#ie-bank')) { S.bankCtl.input(e); return; }
      const g = e.target.closest ? (e.target.closest('#ie-sched') ? 'sched' : e.target.closest('#ie-status') ? 'status' : e.target.closest('#ie-basic') ? 'basic' : '') : '';
      if (!g) return;
      clearMsg(g);
      refresh(g);
    }
    wrap.oninput = onEdit;
    wrap.onchange = onEdit;
    wrap.onclick = function (e) {
      if (S.bankCtl && S.bankCtl.click(e)) return;
      const id = e.target && e.target.id;
      if (id === 'ie-save-sched') saveSched();
      else if (id === 'ie-save-status') saveStatus();
      else if (id === 'ie-save-basic') saveBasic();
    };

    // 처음 값 채우기 → 상태 맞추기 → 포커스
    fillSched(S.init.sched);
    fillStatus(S.init.status);
    refreshSched(); refreshStatus(); refreshBasic();
    const det = q('#ie-st-det');
    let target = null;
    if (opts.focus === 'status') {
      if (det) det.open = true;
      target = q('input[name=ie-os]:checked') || q('#ie-od');
    }
    if (!target) target = q('#ie-ce') || q('#ie-basic input[data-f]:not([disabled])');
    if (target && target.focus) target.focus(); else if (box) box.focus();
    if (opts.focus === 'bank' && S.bankCtl) S.bankCtl.focus();
  };

  if (hasReq) module.exports = ie; else root.instedit = ie;
})(typeof self !== 'undefined' ? self : this);
