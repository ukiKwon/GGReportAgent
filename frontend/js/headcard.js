(function (root) {
  'use strict';
  // 기관장 카드(NEXT 77 1단계). 입찰 현황판(dashboard.js) 상세 칸의 '기관장' 절을 서버 기관장 API에 붙인다.
  // 시안 docs/design/2026-11-11_기관장카드_시안.html — 점수·등급 없이 사실 항목만, 임기·학력·경력은 출처와 함께.
  // 서버: InstitutionHeadController(GET /institutions/{id}/head 등). 화면 이름·버튼 ID는 서버 HeadUiIds 허용 목록의 값만 보낸다
  // (허용 목록 밖이면 감사 기록이 UNKNOWN이 된다). 순수 부분(termInfo·cardHtml·sectionHtml·modalHtml·buildXxx)은 node 테스트 대상이고,
  // DOM 부분(openModal 이하)은 브라우저에서만 쓴다. 새 판정 로직 없이 logic.js(daysUntil·safeHttpUrl·esc)를 조합한다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const errtext = isNode ? require('./errtext.js') : root.errtext;
  const esc = logic.esc;
  const hc = {};

  // ── 상수(서버와 같은 값) ────────────────────────────────────────────
  hc.SCREEN = 'head_card';
  hc.POP_SCREEN = 'map_popover';   // 지도 팝오버 [기관장 보기] 전용 화면 이름(서버 HeadUiIds.SCREENS에 이미 있음)
  hc.BTN = {
    open: 'open_card', refresh: 'refresh', headAdd: 'head_add', headConfirm: 'head_confirm', headReject: 'head_reject',
    itemAdd: 'item_add', itemConfirm: 'item_confirm', itemReject: 'item_reject', itemWithdraw: 'item_withdraw', itemVoid: 'item_void',
    photoUpload: 'photo_upload', photoView: 'photo_view', photoVoid: 'photo_void', photoRestore: 'photo_restore',   // photoRestore: 4단계(사진 변경 이력 화면)에서 쓴다
    popView: 'head_view',   // 지도 팝오버 [기관장 보기](화면 map_popover)
  };
  hc.DEBOUNCE_MS = 400;   // 기관을 고른 뒤 이 시간 안에 다른 기관으로 옮기면 앞 기관은 읽지 않는다(열람 기록이 과하게 쌓이지 않게). 0이면 바로 읽는다(시험용)
  hc.SALES_ROLES = ['영업팀', '영업팀장', '영업부장'];
  hc.LEAD_ROLES = ['영업팀장', '영업부장'];
  // HEAD_FIELD 8종(서버 026_inst_head.sql). kind: text|flag|date|period
  hc.FIELDS = [
    { cd: 'NAME', label: '이름', kind: 'text', max: 30 },
    { cd: 'POSITION', label: '직위', kind: 'text', max: 40 },
    { cd: 'ACTING', label: '권한대행 여부', kind: 'flag' },
    { cd: 'FIRST_TAKE_OFFICE', label: '첫 취임일', kind: 'date' },
    { cd: 'TERM_START', label: '현 임기 시작일', kind: 'date' },
    { cd: 'TERM_END', label: '임기 만료일', kind: 'date' },
    { cd: 'EDU', label: '학력', kind: 'period', max: 60 },
    { cd: 'CAREER', label: '경력', kind: 'period', max: 60 },
  ];
  // HEAD_SRC 7종
  hc.SOURCES = [
    { cd: 'HOMEPAGE', label: '기관 누리집' }, { cd: 'NEC', label: '중앙선거관리위원회' }, { cd: 'ALIO', label: '알리오' },
    { cd: 'CLEANEYE', label: '클린아이' }, { cd: 'GAZETTE', label: '관보·고시' }, { cd: 'PRESS', label: '언론 보도' },
    { cd: 'OTHER', label: '기타 공개 자료' },
  ];
  // PHOTO_LICENSE 중 서버가 지금 받는 것(ENABLED=1)만 고르게 한다. 나머지는 읽기용 이름표.
  hc.LICENSES = [
    { cd: 'KOGL1', label: '공공누리 제1유형(출처표시)' }, { cd: 'INST_PERMIT', label: '기관 직접 허락' },
  ];
  const LICENSE_NAMES = {
    KOGL1: '공공누리 제1유형(출처표시)', KOGL2: '공공누리 제2유형', KOGL3: '공공누리 제3유형', KOGL4: '공공누리 제4유형',
    INST_PERMIT: '기관 직접 허락', PRESS_PERMIT: '언론사 허락',
  };
  hc.PHOTO_MAX_BYTES = 5 * 1024 * 1024;   // HeadPhotoService.MAX_FILE_BYTES
  hc.REASON_MAX = 200;
  const BLOCK = {
    LEAD_ONLY: '충돌하는 값은 영업팀장 또는 영업부장만 처리할 수 있습니다.',
    SELF_RESOLVE: '본인이 낸 값은 본인이 확정할 수 없습니다.',
    OWN_VALUE_GUARD: '본인이 입력·확정한 값과 충돌하는 후보는 직접 기각할 수 없습니다.',
  };
  hc.TEXT = {
    loading: '기관장 정보를 불러오는 중입니다…',
    none: '이 기관의 기관장은 아직 등록되지 않았습니다. 공개 자료를 확인해 출처와 함께 추가하세요.',
    emptied: '기관장 정보가 모두 무효 처리되어 지금 확정된 기관장이 없습니다.',
    off: '기관장 정보 기능을 쓰지 않도록 설정되어 있습니다(사용 안 함). 관리자가 켜면 이 자리에 카드가 보입니다.',
    login: '로그인한 사번이 확인되지 않아 기관장 정보를 볼 수 없습니다. 다시 로그인하세요.',
    denied: '이 정보를 볼 권한이 없습니다(영업 계열 사용자만, 또는 사용자 등록 상태 확인 필요).',
    role: '기관장 정보는 영업팀·영업팀장·영업부장만 볼 수 있습니다.',
    notfound: '서버에서 이 기관을 찾지 못했습니다. 서버에 등록된 기관만 기관장 정보를 관리합니다.',
    noid: '서버에 등록된 기관만 기관장 정보를 관리합니다. 이 기관은 내장 자료에만 있어 기관장 정보를 쓸 수 없습니다.',
    offline: '서버에 연결되면 기관장 정보를 볼 수 있습니다.',
    error: '기관장 정보를 불러오지 못했습니다.',
    network: '서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.',
  };

  // ── 순수: 값 도우미 ────────────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v); }
  function trim(v) { return str(v).trim(); }
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function chip(t) { return '<span class="pop-unk">' + esc(t || '미확인') + '</span>'; }
  hc.fieldLabel = function (cd) {
    const f = hc.FIELDS.filter(function (x) { return x.cd === cd; })[0];
    return f ? f.label : str(cd);
  };
  hc.fieldOf = function (cd) { return hc.FIELDS.filter(function (x) { return x.cd === cd; })[0] || null; };
  function srcLabel(kind) {
    const s = hc.SOURCES.filter(function (x) { return x.cd === kind; })[0];
    return s ? s.label : str(kind);
  }
  hc.licenseLabel = function (cd) { return LICENSE_NAMES[cd] || str(cd); };
  hc.isSales = function (role) { return hc.SALES_ROLES.indexOf(trim(role)) >= 0; };
  hc.isLead = function (role) { return hc.LEAD_ROLES.indexOf(trim(role)) >= 0; };
  // 서버 A3 응답(d)에 확정된 기관장이 없는가. head:null이거나, 확정 값을 모두 무효 처리해 이름·확정 항목·사진이 하나도 없는 빈 머리면 참.
  // 이름 없이 다른 확정 항목(직위·학력·경력·사진)이 남아 있으면 거짓 — 보이는 값과 무효 처리 버튼을 숨기지 않는다.
  hc.isEmptyHead = function (d) {
    if (d && typeof d.head_empty === 'boolean') return d.head_empty;   // 서버 판정(InstitutionHeadService.isEmptyHead)이 정본, 없을 때만 아래 대비 판정
    const h = d && d.head;
    if (!h) return true;
    if (trim(h.name)) return false;
    // 권한대행 여부(ACTING)는 '아니오'도 확정 항목으로 남지만 카드에 보이지 않으므로 판정에서 뺀다(qa 11-13 P2-2)
    if (h.fields && Object.keys(h.fields).some(function (k) { return k !== 'ACTING'; })) return false;
    if ((h.education || []).length || (h.career || []).length) return false;
    return !h.photo;
  };
  // 확정 대기 후보 수(후보 항목 + 후보 기관장)
  hc.candCount = function (d) { return ((d && d.candidates) || []).length + ((d && d.candidate_heads) || []).length; };
  // 편집 팝업 제목: 확정된 기관장이 없으면 '기관장 추가', 있으면 '기관장 정보 편집'(ok↔none 전환 때 repaintModal이 다시 쓴다)
  hc.modalTitle = function (view) { return hc.isEmptyHead(view && view.data) ? '기관장 추가' : '기관장 정보 편집'; };

  // 임기 남은 기간. today는 자정 Date. 만료일이 없거나 형식이 틀리면 null.
  //  1개월 이상 남음 → '임기 n년 n개월'(0인 쪽은 생략) / 1개월 미만 → 'D-n'(임기 만료까지) / 오늘 → 'D-day' / 지남 → '만료 n일 지남'
  hc.termInfo = function (termEnd, today) {
    const p = parseYmd(termEnd);
    if (!p || !(today instanceof Date) || isNaN(today.getTime())) return null;
    const days = logic.daysUntil(termEnd, today);
    if (days === Infinity || days === -Infinity || isNaN(days)) return null;
    if (days < 0) return { kind: 'over', days: -days, k: '임기', big: '만료', s: (-days) + '일 지남', text: '임기 만료 ' + (-days) + '일 지남' };
    if (days === 0) return { kind: 'last', days: 0, k: '임기', big: 'D-day', s: '오늘 만료', text: '임기 D-day' };
    let months = (p[0] - today.getFullYear()) * 12 + (p[1] - (today.getMonth() + 1));
    if (p[2] < today.getDate()) months -= 1;
    if (months < 1) return { kind: 'days', days: days, k: '임기 만료까지', big: 'D-' + days, s: '', text: '임기 만료까지 D-' + days };
    const y = Math.floor(months / 12), m = months % 12;
    const big = (y ? y + '년' : '') + (y && m ? ' ' : '') + (m ? m + '개월' : '');
    return { kind: 'term', days: days, months: months, k: '임기', big: big, s: '남음', text: '임기 ' + big };
  };

  // 카드 맨 위 큰 숫자: 임기 만료일이 확정 항목으로 있으면 임기 남은 기간(출처 표시), 없으면 입찰 D-day.
  // bid = { days(남음, 지남이면 음수), date, label(확정/추정) } | null
  hc.bigInfo = function (head, bid, today) {
    const h = head || {};
    const te = h.term_end;
    const t = te ? hc.termInfo(te, today) : null;
    if (t) {
      const f = h.fields && h.fields.TERM_END;
      return { type: 'term', k: t.k, big: t.big, s: t.s, text: t.text, date: te, src: f && f.source ? f.source : null };
    }
    // 공고 진행 중인 기관: 접수 중이면 '마감 D-n'(출처: 공고), 그 밖(마감일 미확인·마감 지남)은 '공고 진행 중' 칩
    if (bid && bid.notice) {
      const d = bid.days;
      if (bid.receiving && typeof d === 'number' && isFinite(d) && d >= 0) {
        const big = d === 0 ? 'D-day' : 'D-' + d;
        return { type: 'notice', receiving: true, k: '마감', big: big, s: '', text: '마감 ' + big, date: str(bid.date), src: null };
      }
      return { type: 'notice', receiving: false, k: '', big: '', s: '', text: '공고 진행 중', date: '', src: null };
    }
    if (bid && bid.date && typeof bid.days === 'number' && isFinite(bid.days)) {
      const d = bid.days;
      const big = d < 0 ? 'D+' + (-d) : (d === 0 ? 'D-day' : 'D-' + d);
      return { type: 'bid', k: d < 0 ? '공고 예정일 지남' : '입찰 공고 예정', big: big, s: '', text: '입찰 ' + big, date: bid.date, label: str(bid.label), src: null };
    }
    return null;
  };

  // ── 순수: 출처·값 표시 ─────────────────────────────────────────────
  // s = { kind, title, url, checked_on }. 주소는 logic.safeHttpUrl을 통과한 http(s)만 링크로 만든다.
  hc.srcHtml = function (s) {
    if (!s) return '<span class="hc-src">출처 없음</span>';
    const parts = [];
    if (s.kind) parts.push(esc(srcLabel(s.kind)));
    const url = logic.safeHttpUrl(s.url);
    const title = trim(s.title);
    if (url) parts.push('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title || url) + '</a>');
    else if (title) parts.push(esc(title));
    if (s.checked_on) parts.push('확인 ' + esc(s.checked_on));
    return '<span class="hc-src">' + parts.join(' · ') + '</span>';
  };
  function period(it) {
    const f = trim(it.from), t = trim(it.to);
    if (f && t) return f + '~' + t;
    if (f) return f + '~';
    if (t) return '~' + t;
    return '';
  }
  hc.valueText = function (it) {
    const f = it.field_cd, v = it.value;
    if (f === 'ACTING') return v === true ? '예(권한대행)' : '아니오';
    if (f === 'EDU' || f === 'CAREER') { const p = period(it); return str(v) + (p ? ' (' + p + ')' : ''); }
    return str(v);
  };
  function sortPeriod(list) {   // 최근 것이 위로(끝 연월이 없으면 현재 진행으로 보아 맨 위)
    const key = function (it) { return (trim(it.to) || (trim(it.from) ? '9999-99' : '0000-00')) + '|' + trim(it.from); };
    return (list || []).slice().sort(function (a, b) { const x = key(a), y = key(b); return x < y ? 1 : (x > y ? -1 : 0); });
  }

  // ── 순수: 카드 ─────────────────────────────────────────────────────
  function sil(label) {
    return '<svg class="hc-sil" viewBox="0 0 100 133" role="img" aria-label="' + esc(label) + '"><circle cx="50" cy="44" r="22"/><path d="M10 133C10 98 28 78 50 78S90 98 90 133Z"/></svg>';
  }

  function photoHtml(h, view) {
    const p = h.photo;
    let frame = sil('사진 없음'), cap = '사진 없음. 공공누리 제1유형 사진이나 기관이 허락한 사진만 올릴 수 있습니다.';
    if (p) {
      const ph = view && view.photo ? view.photo : {};
      const lic = hc.licenseLabel(p.license_cd);
      const src = p.source || {};
      cap = '사진 · ' + esc(lic) + (src.title ? ' · ' + esc(src.title) : '');
      if (ph.url && ph.id === p.photo_id) frame = '<img src="' + esc(ph.url) + '" alt="기관장 사진" width="117" height="156">';
      else if (ph.state === 'err') { frame = sil('사진을 불러오지 못했습니다'); cap = '사진을 불러오지 못했습니다. [새로 고침]으로 다시 시도하세요. · ' + esc(lic); }
      else { frame = sil('사진 불러오는 중'); cap = '사진을 불러오는 중… · ' + esc(lic); }
      return '<div class="hc-photo"><div class="hc-frame">' + frame + '</div><p class="hc-cap">' + cap + '</p></div>';
    }
    return '<div class="hc-photo"><div class="hc-frame">' + frame + '</div><p class="hc-cap">' + esc(cap) + '</p></div>';
  }

  function srcKey(s) { return s ? [str(s.kind), trim(s.title), trim(s.url), str(s.checked_on)].join('\u0001') : ''; }
  // 날짜 3칸(첫 취임일·현 임기 시작·임기 만료). 출처가 같으면 각주 하나로 모으고 값 옆에는 표식(1, 2…)만 둔다.
  // 값이 없는 칸은 표식 없이 미확인 칩. 칸(dd)이 aria-describedby로 각주를 가리킨다.
  hc.factsHtml = function (h) {
    const specs = [['첫 취임일', 'FIRST_TAKE_OFFICE', 'first_take_office'], ['현 임기 시작', 'TERM_START', 'term_start'], ['임기 만료', 'TERM_END', 'term_end']];
    const notes = [];
    const cells = specs.map(function (sp) {
      const val = h[sp[2]];
      if (!val) return '<div><dt>' + esc(sp[0]) + '</dt><dd>' + chip() + '</dd></div>';
      const f = h.fields && h.fields[sp[1]];
      const s = f && f.source ? f.source : null;
      const key = srcKey(s);
      let n = 0;
      for (let i = 0; i < notes.length; i += 1) { if (notes[i].key === key) { n = i + 1; break; } }
      if (!n) { notes.push({ key: key, src: s }); n = notes.length; }
      return '<div><dt>' + esc(sp[0]) + '</dt><dd aria-describedby="hc-fn-' + n + '">' + mono(val) + '<sup class="hc-fnref" aria-hidden="true">' + n + '</sup><span class="sr-only">(출처 ' + n + ')</span></dd></div>';
    }).join('');
    const foot = notes.map(function (x, i) {
      return '<p class="hc-fn" id="hc-fn-' + (i + 1) + '"><sup aria-hidden="true">' + (i + 1) + '</sup><span class="sr-only">출처 ' + (i + 1) + ':</span> ' + (x.src ? '출처: ' : '') + hc.srcHtml(x.src) + '</p>';
    }).join('');
    return '<dl class="hc-facts">' + cells + '</dl>' + (foot ? '<div class="hc-fns">' + foot + '</div>' : '');
  };

  function listHtml(items, emptyText) {
    if (!items.length) return '<span class="hc-none">' + chip(emptyText) + '</span>';
    function li(it) {
      const p = period(it);
      return '<li>' + (p ? '<span class="yr">' + esc(p) + '</span>' : '') + esc(it.value) + '<br>' + hc.srcHtml(it.source) + '</li>';
    }
    const first = items.slice(0, 4).map(li).join('');
    const rest = items.slice(4);
    return '<ul>' + first + '</ul>' + (rest.length ? '<details class="hc-more"><summary>나머지 ' + rest.length + '건 보기</summary><ul>' + rest.map(li).join('') + '</ul></details>' : '');
  }

  // view = { status:'ok', data(A3 응답), photo:{id,url,state} } / ctx = { today, bid }
  hc.cardHtml = function (view, ctx) {
    ctx = ctx || {};
    const d = view.data || {}, h = d.head || {};
    const big = hc.bigInfo(h, ctx.bid, ctx.today);
    let band;
    if (big && big.type === 'notice' && !big.receiving) {
      band = '<div class="hc-big"><span class="pop-unk">공고 진행 중</span></div><span class="hc-bigsrc">출처: 공고 · 임기 만료일은 아직 확인되지 않았습니다</span>';
    } else if (big) {
      const aria = big.text + (big.s ? ' ' + big.s : '');
      let sub;
      if (big.type === 'term') sub = '<span class="hc-bigsrc">만료일 ' + mono(big.date) + ' ' + hc.srcHtml(big.src) + '</span>';
      else if (big.type === 'notice') sub = '<span class="hc-bigsrc">출처: 공고 · 접수 마감 ' + mono(big.date) + ' · 임기 만료일은 아직 확인되지 않았습니다</span>';
      else sub = '<span class="hc-bigsrc">공고 예정 ' + mono(big.date) + (big.label ? ' ' + esc(big.label) : '') + ' · 임기 만료일은 아직 확인되지 않았습니다</span>';
      band ='<div class="hc-big" role="group" aria-label="' + esc(aria) + '"><span class="k" aria-hidden="true">' + esc(big.k) + '</span><b aria-hidden="true">' + esc(big.big) + '</b>' +
        (big.s ? '<span class="s" aria-hidden="true">' + esc(big.s) + '</span>' : '') + '</div>' + sub;
    } else {
      band = '<div class="hc-big"><span class="k">임기 만료일과 입찰 예정일을 모릅니다</span></div><span class="hc-bigsrc">' + chip() + '</span>';
    }
    const nameHtml = h.name ? esc(h.name) : chip('이름 미확인');
    const pos = h.position ? esc(h.position) : chip('직위 미확인');
    const acting = h.acting ? '<span class="hc-badge">권한대행</span>' : '';
    const cands = hc.candCount(d);
    const candBtn = cands ? '<button type="button" class="hc-cand" data-hc="edit">확정 대기 후보 ' + cands + '건 보기</button>' : '';
    const edu = sortPeriod(h.education), career = sortPeriod(h.career);
    return '<article class="hc-card" aria-labelledby="hc-name">' +
      '<div class="hc-band">' + band + '</div>' +
      '<div class="hc-body">' + photoHtml(h, view) +
      '<div class="hc-who"><h4 id="hc-name">' + nameHtml + '</h4><div class="hc-pos">' + pos + acting + '</div>' +
      hc.factsHtml(h) + '</div></div>' +
      '<dl class="hc-items"><dt>학력</dt><dd>' + listHtml(edu, '학력 미확인') + '</dd><dt>경력</dt><dd>' + listHtml(career, '경력 미확인') + '</dd></dl>' +
      '<div class="hc-foot"><span>출처 <span class="v">' + (Number(h.source_count) || 0) + '</span>건 · 최근 확인 ' +
      (h.last_checked_on ? mono(h.last_checked_on) : chip()) + '</span>' + candBtn +
      '<span class="hc-log">열람 기록이 남습니다</span>' +
      '<span class="sp"><button type="button" data-hc="refresh">새로 고침</button><button type="button" data-hc="edit">편집</button></span></div></article>';
  };

  function stateHtml(text, btn) {
    return '<p class="db-empty hc-state" role="status">' + esc(text) + '</p>' + (btn || '');
  }

  // 상세 칸의 '기관장' 절 전체. view.status: ok|none|loading|off|login|denied|role|notfound|noid|offline|error
  hc.sectionHtml = function (view, ctx) {
    const st = view && view.status;
    let body;
    if (st === 'ok') body = hc.cardHtml(view, ctx);
    else if (st === 'none') {
      const nd = view.data, nc = hc.candCount(nd);
      const voided = !!(nd && nd.head);   // 무효 처리로 비게 된 경우(head:null이 아님)
      body = stateHtml(voided ? hc.TEXT.emptied + ' 공개 자료를 확인해 출처와 함께 추가하세요.' : hc.TEXT.none,
        '<p class="hc-act"><button type="button" class="db-next" data-hc="add-head">기관장 추가</button>' +
        (nc ? '<button type="button" class="hc-cand" data-hc="edit">확정 대기 후보 ' + nc + '건 보기</button>' : '') +
        '<button type="button" data-hc="refresh">새로 고침</button></p>');   // 다른 사람이 그 사이 등록했을 수 있다(design 11-13)
    }
    else if (st === 'loading' || st === 'idle' || !st) body = '<p class="db-empty hc-state" role="status" aria-busy="true">' + esc(hc.TEXT.loading) + '</p>';
    else if (st === 'error') {
      body = '<p class="db-empty hc-state" role="alert">' + esc(view.text || (view.code ? hc.TEXT.error : hc.TEXT.network)) + (view.code ? ' (' + esc(view.code) + ')' : '') + '</p>' +
        '<p class="hc-act"><button type="button" data-hc="refresh">다시 불러오기</button></p>';
    } else if (st === 'denied' || st === 'notfound' || st === 'login') {   // 꺼짐(off)을 뺀 오류 상태는 다시 불러올 수 있다
      body = stateHtml(hc.TEXT[st], '<p class="hc-act"><button type="button" data-hc="refresh">다시 불러오기</button></p>');
    } else if (hc.TEXT[st]) body = stateHtml(hc.TEXT[st]);
    else body = stateHtml(hc.TEXT.error);
    return '<div class="db-sec hc-sec" id="hc-sec"><h3>기관장</h3>' + body + '</div>';
  };

  // ── 요청 ───────────────────────────────────────────────────────────
  function uiHeaders(button, screen) { return { 'X-Screen-Id': screen || hc.SCREEN, 'X-Button-Id': button }; }
  function base(instId) { return '/institutions/' + encodeURIComponent(instId); }
  function failFrom(r, j) {
    const e = new Error('http ' + r.status);
    e.status = r.status;
    e.detail = j && j.detail;
    return e;
  }
  // 성공하면 JSON, 실패하면 status·detail을 단 Error(네트워크 실패는 status 없음). 멀티파트는 form에 FormData를 넘긴다(Content-Type은 브라우저가 정한다).
  hc.request = function (method, url, body, button, form, screen) {
    const init = { method: method, headers: uiHeaders(button, screen) };
    if (form) init.body = form;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw failFrom(r, j);
        return j;
      });
    });
  };
  // 사진 본문은 <img src>로 바로 걸 수 없다(신원 헤더가 안 붙는다) — fetch로 받아 Blob 주소로 보여 준다.
  hc.fetchPhoto = function (instId, photoId) {
    return fetch(base(instId) + '/head/photos/' + encodeURIComponent(photoId) + '/content', { method: 'GET', headers: uiHeaders(hc.BTN.photoView) }).then(function (r) {
      if (r.ok) return r.blob();
      return r.json().catch(function () { return {}; }).then(function (j) { throw failFrom(r, j); });
    });
  };

  // 서버 응답 → 카드 상태. 404 FEATURE_OFF=기능 꺼짐, 그 밖의 404=서버에 없는 기관.
  hc.classify = function (status, detail) {
    const p = errtext.parse(detail);
    if (status === 404 && p.code === 'FEATURE_OFF') return { status: 'off' };
    if (status === 404) return { status: 'notfound' };
    if (status === 401) return { status: 'login' };
    if (status === 403) return { status: 'denied' };
    return { status: 'error', text: status ? (p.message || hc.TEXT.error) : hc.TEXT.network };
  };
  // 쓰기 오류를 사람 글로. 서버 문구(금지 표현·검사 사유)는 그대로 보여 준다.
  hc.errText = function (status, detail) {
    const p = errtext.parse(detail);
    const generic404 = status === 404 && /^not found$/i.test(p.message);
    if (p.message && !generic404) return p.message;
    if (!status) return hc.TEXT.network;
    if (status === 401) return hc.TEXT.login;
    if (status === 403) return '이 기능을 쓸 권한이 없습니다.';
    if (status === 404) return '대상을 찾지 못했습니다. 새로 고친 뒤 다시 시도하세요.';
    if (status === 413) return '파일이 너무 큽니다. 5MB 이하로 줄여 올리세요.';
    return '처리하지 못했습니다 (' + status + ')';
  };

  // ── 상태(현재 선택한 기관 하나) ────────────────────────────────────
  // emp = 이 상태를 읽은 사번(사용자가 바뀌면 다시 읽는다). timer/cancel = 기관 선택 뒤 대기 중인 읽기(debounce)
  function fresh() { return { instId: '', emp: '', status: 'idle', data: null, text: '', code: 0, quietFail: false, photo: { id: 0, url: '', state: '' }, repaint: null, cancel: null }; }
  let V = fresh();
  function revokeUrl(u) {
    if (u && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
  }
  function revoke(v) { if (v && v.photo) revokeUrl(v.photo.url); }
  hc.view = function () { return V; };
  hc.reset = function () { if (V.cancel) V.cancel(); revoke(V); V = fresh(); if (hc.closeModal) hc.closeModal(false); };
  // 사용자(사번·계정)가 바뀌거나 로그아웃할 때 app.js가 부른다 — 앞 사용자가 읽은 카드·사진·열린 모달을 버린다.
  hc.onProfileChange = function () {
    hc.reset();
    // 지도 팝오버의 기관장 결과도 버린다 — 계정이 바뀐 뒤 앞 사번의 늦은 응답이 새 사용자 화면에 붙지 않게(security 11-13 하)
    if (typeof document !== 'undefined' && document.getElementById) {
      const pop = document.getElementById('popover');
      if (pop) { pop.__hcTok = (pop.__hcTok || 0) + 1; pop.__hcBusy = false; pop.__hcRec = null; const o = pop.querySelector && pop.querySelector('#pop-head-out'); if (o) o.innerHTML = ''; }
    }
  };

  function syncPhoto(mine) {
    const p = mine.data && mine.data.head && mine.data.head.photo;
    if (!p) { revoke(mine); mine.photo = { id: 0, url: '', state: '' }; return; }
    if (mine.photo.id === p.photo_id && (mine.photo.url || mine.photo.state === 'loading')) return;   // 이미 받았거나 받는 중이면 다시 요청하지 않는다
    revoke(mine);
    mine.photo = { id: p.photo_id, url: '', state: 'loading' };
    hc.fetchPhoto(mine.instId, p.photo_id).then(function (blob) {
      if (V !== mine || mine.photo.id !== p.photo_id) return;
      revokeUrl(mine.photo.url);
      mine.photo.url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') ? URL.createObjectURL(blob) : '';
      mine.photo.state = mine.photo.url ? 'ok' : 'err';
    }).catch(function () {
      if (V === mine && mine.photo.id === p.photo_id) mine.photo.state = 'err';
    }).then(function () { if (V === mine && mine.repaint) mine.repaint(); });
  }

  // quiet=true면 카드를 '불러오는 중'으로 바꾸지 않는다(편집 모달에서 저장한 뒤 다시 읽을 때).
  function loadInto(mine, button, quiet) {
    if (!quiet) mine.status = 'loading';
    return hc.request('GET', base(mine.instId) + '/head', undefined, button, undefined, mine.screen || undefined).then(function (d) {
      if (V !== mine) return;
      mine.data = d;
      mine.status = hc.isEmptyHead(d) ? 'none' : 'ok';
      mine.text = ''; mine.code = 0; mine.quietFail = false;
      syncPhoto(mine);
    }).catch(function (e) {
      if (V !== mine) return;
      if (quiet) { mine.quietFail = true; return; }   // 저장 뒤 조용한 재조회가 실패해도 카드·모달은 그대로 두고 모달 안에서 알린다
      const c = hc.classify(e.status, e.detail);
      mine.status = c.status; mine.text = c.text || ''; mine.code = e.status || 0;
    }).then(function () { if (V === mine && mine.repaint) mine.repaint(); });
  }

  // 같은 기관을 고르고 있는 동안은 한 번만 읽는다(다시 그릴 때마다 열람 기록이 쌓이지 않게). 기관이 바뀌면 새로 읽는다.
  // 사번(emp)이 달라지면(사용자 전환) 같은 기관이어도 다시 읽는다. 기관을 고른 뒤 DEBOUNCE_MS가 지나야 읽는다 —
  // 그 안에 다른 기관으로 옮기면(reset이 대기를 취소) 앞 기관은 읽지 않는다.
  hc.ensure = function (instId, repaint, emp, screen) {
    const who = str(emp);
    if (V.instId === instId && V.emp === who && V.status !== 'idle') { V.repaint = repaint || V.repaint; return Promise.resolve(); }
    hc.reset();
    const mine = V;
    mine.instId = instId; mine.emp = who; mine.status = 'loading'; mine.repaint = repaint || null;
    if (screen) mine.screen = screen;   // 지도 상세 팝업은 'map_popover'(서버 허용 목록에 있음). 없으면 기본 head_card
    const ms = Number(hc.DEBOUNCE_MS) || 0;
    if (ms <= 0) return loadInto(mine, hc.BTN.open, false);
    return new Promise(function (resolve) {
      const t = setTimeout(function () {
        mine.cancel = null;
        if (V !== mine) { resolve(); return; }
        loadInto(mine, hc.BTN.open, false).then(resolve);
      }, ms);
      mine.cancel = function () { clearTimeout(t); mine.cancel = null; resolve(); };
    });
  };
  hc.refresh = function (quiet, button) {
    if (!V.instId) return Promise.resolve();
    if (V.cancel) V.cancel();   // 대기 중이던 읽기는 이 요청이 대신한다(캐시 없이 바로 다시 읽는다)
    const p = loadInto(V, button || hc.BTN.refresh, !!quiet);
    if (!quiet && V.repaint) V.repaint();   // [새로 고침]을 누르면 바로 '불러오는 중'으로 바뀐다
    return p;
  };

  // 서버 모드·사번·기관 id·역할 검사. 통과 못 하면 서버를 부르지 않는다('' = 통과).
  hc.gate = function (rec, env) {
    env = env || {};
    if (!env.serverMode || !env.hasEmp) return 'offline';
    if (!rec || !rec.institutionId) return 'noid';
    if (!hc.isSales(env.role)) return 'role';
    return '';
  };
  // 대시보드 상세 칸이 부르는 단 하나의 진입점 → '기관장' 절 HTML. env = { serverMode, hasEmp, role, emp, today, bid, repaint }
  hc.paneSection = function (rec, env) {
    env = env || {};
    const g = hc.gate(rec, env);
    if (g) {
      if (V.instId) hc.reset();
      return hc.sectionHtml({ status: g }, env);
    }
    hc.ensure(rec.institutionId, env.repaint, env.emp, env.screen);
    return hc.sectionHtml(V, env);
  };

  // ── 순수: 요청 본문 ────────────────────────────────────────────────
  function srcBody(v) {
    const s = { kind: trim(v.src_kind), title: trim(v.src_title), checked_on: trim(v.checked_on) };
    if (trim(v.src_url)) s.url = trim(v.src_url);
    return s;
  }
  // 칸 후보 한 건(POST /institutions/{id}/head/items). v = 폼 값(value·date·flag·from·to·src_*·checked_on)
  hc.buildItemBody = function (headId, fieldCd, v) {
    const f = hc.fieldOf(fieldCd);
    const b = { head_id: Number(headId), field_cd: fieldCd, source: srcBody(v) };
    const kind = f ? f.kind : 'text';
    if (kind === 'date') b.date = trim(v.date);
    else if (kind === 'flag') b.flag = Number(v.flag) === 1 ? 1 : 0;
    else {
      b.value = trim(v.value);
      if (kind === 'period') {
        if (trim(v.from)) b.from = trim(v.from);
        if (trim(v.to)) b.to = trim(v.to);
      }
    }
    return b;
  };
  // 기관장 등록(POST /institutions/{id}/heads)
  hc.buildHeadBody = function (v) {
    const b = { name: trim(v.name), position: trim(v.position), source: srcBody(v) };
    if (trim(v.acting) === '0' || trim(v.acting) === '1') b.acting = trim(v.acting) === '1';
    if (trim(v.first_take_office)) b.first_take_office = trim(v.first_take_office);
    if (trim(v.term_start)) b.term_start = trim(v.term_start);
    if (trim(v.term_end)) b.term_end = trim(v.term_end);
    return b;
  };
  // 사진 올리기 멀티파트(POST /institutions/{id}/head/photos): file, head_id, license_cd, src_kind, src_title, src_url?, checked_on
  hc.buildPhotoForm = function (headId, v, file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('head_id', String(headId));
    fd.append('license_cd', trim(v.license_cd));
    fd.append('src_kind', trim(v.src_kind));
    fd.append('src_title', trim(v.src_title));
    if (trim(v.src_url)) fd.append('src_url', trim(v.src_url));
    fd.append('checked_on', trim(v.checked_on));
    return fd;
  };
  // 쓰기 요청 묶음(화면 이름·버튼 ID가 함께 간다) — 편집 모달이 쓰고, 테스트가 가짜 fetch로 확인한다.
  hc.addItem = function (instId, headId, fieldCd, v) {
    return hc.request('POST', base(instId) + '/head/items', hc.buildItemBody(headId, fieldCd, v), hc.BTN.itemAdd);
  };
  hc.addHead = function (instId, v) {
    return hc.request('POST', base(instId) + '/heads', hc.buildHeadBody(v), hc.BTN.headAdd);
  };
  hc.uploadPhoto = function (instId, headId, v, file) {
    return hc.request('POST', base(instId) + '/head/photos', undefined, hc.BTN.photoUpload, hc.buildPhotoForm(headId, v, file));
  };
  // 올리기 전 빠른 검사(서버가 같은 규칙으로 다시 검사한다) → 안내 글 | ''
  hc.photoCheck = function (v, file) {
    if (!file) return '사진 파일을 고르세요.';
    if (!trim(v.license_cd)) return '이용 조건을 고르세요. 공공누리 제1유형이거나 기관이 직접 허락한 사진만 올릴 수 있습니다.';
    if (typeof file.size === 'number' && file.size > hc.PHOTO_MAX_BYTES) return '사진이 5MB를 넘습니다. 5MB 이하로 줄여 올리세요.';
    const name = str(file.name).toLowerCase();
    if (name && !/\.(jpe?g|png)$/.test(name)) return 'JPG 또는 PNG 사진만 올릴 수 있습니다.';
    return '';
  };
  // 서버가 내려 준 can_void(입력자·확정자·역할을 함께 본 판정, 11-13)가 정본 — 없을 때만 아래 대비 판정(입력자 기준)
  hc.canVoidOf = function (x, createdBy, viewerRole, emp) {
    return x && typeof x.can_void === 'boolean' ? x.can_void : hc.canVoid(createdBy, viewerRole, emp);
  };
  hc.canVoid = function (createdBy, viewerRole, emp) {
    return hc.isLead(viewerRole) || (!!emp && !!createdBy && createdBy === emp);
  };

  // ── 순수: 편집 모달 ────────────────────────────────────────────────
  function opt(value, label, sel) { return '<option value="' + esc(value) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function todayStr(today) {
    return today instanceof Date && !isNaN(today.getTime()) ? logic.localDateStr(today) : '';
  }
  hc.sourceFieldsHtml = function (today) {
    const t = todayStr(today);
    return '<label class="hc-lab">출처 종류<select name="src_kind" required>' + opt('', '고르세요', true) +
      hc.SOURCES.map(function (s) { return opt(s.cd, s.label, false); }).join('') + '</select></label>' +
      '<label class="hc-lab">출처 이름(100자 이내)<input type="text" name="src_title" maxlength="100" required autocomplete="off" placeholder="예: 가람시 누리집 시장 소개"></label>' +
      '<label class="hc-lab wide">출처 주소(선택, http 또는 https)<input type="text" name="src_url" maxlength="1000" autocomplete="off" placeholder="https://"></label>' +
      '<label class="hc-lab">확인한 날<input type="date" name="checked_on" required min="2000-01-01"' + (t ? ' max="' + esc(t) + '" value="' + esc(t) + '"' : '') + '></label>';
  };
  // 항목 종류에 따라 바뀌는 값 칸
  hc.valueRowHtml = function (fieldCd) {
    const f = hc.fieldOf(fieldCd) || hc.FIELDS[0];
    if (f.kind === 'flag') return '<label class="hc-lab">권한대행 여부<select name="flag">' + opt('0', '아니오(정식 임명)', true) + opt('1', '예(권한대행)', false) + '</select></label>';
    if (f.kind === 'date') return '<label class="hc-lab">' + esc(f.label) + '<input type="date" name="date" required min="1900-01-01"></label>';
    if (f.kind === 'period') {
      return '<label class="hc-lab wide">' + esc(f.label) + ' 내용(' + f.max + '자 이내)<input type="text" name="value" maxlength="' + f.max + '" required autocomplete="off"></label>' +
        '<label class="hc-lab">시작(YYYY 또는 YYYY-MM)<input type="text" name="from" maxlength="7" inputmode="numeric" autocomplete="off" placeholder="2018"></label>' +
        '<label class="hc-lab">끝(비우면 현재)<input type="text" name="to" maxlength="7" inputmode="numeric" autocomplete="off" placeholder="2022-06"></label>';
    }
    return '<label class="hc-lab wide">' + esc(f.label) + '(' + f.max + '자 이내)<input type="text" name="value" maxlength="' + f.max + '" required autocomplete="off"' +
      (f.cd === 'NAME' ? ' placeholder="숫자는 쓸 수 없습니다"' : '') + '></label>';
  };
  function headFormHtml(prefix, today, submitLabel, descId) {
    return '<form class="hc-form" data-form="add-head" novalidate>' +
      '<label class="hc-lab">이름(30자 이내, 숫자 불가)<input type="text" name="name" id="' + prefix + '-name" maxlength="30" required autocomplete="off"' + (descId ? ' aria-describedby="' + esc(descId) + '"' : '') + '></label>' +
      '<label class="hc-lab">직위(40자 이내)<input type="text" name="position" maxlength="40" required autocomplete="off" placeholder="예: 가람시장"></label>' +
      '<label class="hc-lab">권한대행 여부<select name="acting">' + opt('', '모름(비워 둠)', true) + opt('0', '아니오(정식 임명)', false) + opt('1', '예(권한대행)', false) + '</select></label>' +
      '<label class="hc-lab">첫 취임일(선택)<input type="date" name="first_take_office" min="1900-01-01"></label>' +
      '<label class="hc-lab">현 임기 시작일(선택)<input type="date" name="term_start" min="1900-01-01"></label>' +
      '<label class="hc-lab">임기 만료일(선택)<input type="date" name="term_end" min="1900-01-01"></label>' +
      hc.sourceFieldsHtml(today) +
      '<div class="hc-actions wide"><button type="submit" class="db-next">' + esc(submitLabel) + '</button></div></form>';
  }

  function msgHtml(M) {
    if (!M || !M.msg || !M.msg.text) return '';
    const retry = M.msg.retry ? '<p class="hc-act"><button type="button" data-m="reload">다시 불러오기</button></p>' : '';
    return (M.msg.err ? '<p class="hc-err" role="alert">' + esc(M.msg.text) + '</p>' : '<p class="hc-ok">' + esc(M.msg.text) + '</p>') + retry;
  }
  // 위험 행위(기각·무효·교체 확정)는 확인 단계를 모달 안에서 한 번 더 거친다. 브라우저 확인창은 쓰지 않는다.
  function pendingHtml(p) {
    return '<div class="hc-confirmbox" role="group" aria-labelledby="hc-pb-t"><p id="hc-pb-t">' + esc(p.text) + '</p>' +
      (p.reason ? '<label class="hc-lab">사유(필수, ' + hc.REASON_MAX + '자 이내)<input type="text" id="hc-reason" maxlength="' + hc.REASON_MAX + '" autocomplete="off"></label>' +
        '<p class="hc-hint">사유에는 개인정보를 적지 마세요. 처리한 사람과 사유가 기록에 남습니다.</p>' : '') +
      '<div class="hc-actions"><button type="button" data-m="do" class="hc-danger">' + esc(p.go) + '</button><button type="button" data-m="cancel">취소</button></div></div>';
  }
  function isPending(M, act, id) { return !!(M && M.pending && M.pending.act === act && String(M.pending.id) === String(id)); }
  function whyHtml(id, code) { return '<small class="hc-why" id="' + esc(id) + '">' + esc(BLOCK[code] || '지금은 처리할 수 없습니다.') + '</small>'; }

  function candidateRow(c, d, M, ctx) {
    const self = !!(ctx.emp && c.created_by === ctx.emp);
    const lab = hc.fieldLabel(c.field_cd);
    const confirmBtn = '<button type="button" data-m="confirm-item" data-id="' + esc(c.item_id) + '" aria-label="' + esc(lab + ' 후보 확정') + '"' +
      (c.can_confirm ? '' : ' disabled aria-describedby="hc-wc-' + esc(c.item_id) + '"') + '>확정</button>';
    const rejectBtn = '<button type="button" data-m="ask-reject-item" data-id="' + esc(c.item_id) + '" data-self="' + (self ? '1' : '0') + '" aria-label="' + esc(lab + (self ? ' 후보 회수' : ' 후보 기각')) + '"' +
      (c.can_reject ? '' : ' disabled aria-describedby="hc-wr-' + esc(c.item_id) + '"') + '>' + (self ? '회수' : '기각') + '</button>';
    const pend = isPending(M, 'reject-item', c.item_id) ? pendingHtml(M.pending) : '';
    return '<li class="hc-row"><div class="hc-main"><b>' + esc(lab) + '</b> ' + mono(hc.valueText(c)) +
      (c.conflict ? ' <span class="hc-badge">확정값과 다름</span>' : '') +
      '<div>' + hc.srcHtml(c.source) + ' <span class="hc-by">입력 ' + esc(c.created_by) + '</span></div></div>' +
      '<div class="hc-btns">' + confirmBtn + rejectBtn + '</div>' +
      (c.can_confirm ? '' : whyHtml('hc-wc-' + c.item_id, c.block_code)) + (c.can_reject ? '' : whyHtml('hc-wr-' + c.item_id, c.reject_block_code)) +
      pend + '</li>';
  }
  function candidateHeadRow(ch, d, M, ctx) {
    const self = !!(ctx.emp && ch.created_by === ctx.emp);
    const cur = d.head && d.head.name ? d.head.name : '';
    const lab = (ch.name || '이름 미확인') + ' 후보 기관장';
    const confirmBtn = '<button type="button" data-m="ask-confirm-head" data-id="' + esc(ch.head_id) + '" aria-label="' + esc(lab + ' 확정') + '"' +
      (ch.can_confirm ? '' : ' disabled aria-describedby="hc-hc-' + esc(ch.head_id) + '"') + '>기관장으로 확정</button>';
    const rejectBtn = '<button type="button" data-m="ask-reject-head" data-id="' + esc(ch.head_id) + '" data-self="' + (self ? '1' : '0') + '" aria-label="' + esc(lab + (self ? ' 회수' : ' 기각')) + '"' +
      (ch.can_reject ? '' : ' disabled aria-describedby="hc-hr-' + esc(ch.head_id) + '"') + '>' + (self ? '회수' : '기각') + '</button>';
    const pend = isPending(M, 'confirm-head', ch.head_id) || isPending(M, 'reject-head', ch.head_id) ? pendingHtml(M.pending) : '';
    // 교체 확정의 근거가 보이도록 서버가 주는 항목(임기일·학력·경력 등)과 출처를 요약해 보여 준다(최대 6건, 나머지는 건수만).
    const its = Array.isArray(ch.items) ? ch.items : [];
    const sum = its.slice(0, 6).map(function (it) {
      return '<div class="hc-src"><b>' + esc(hc.fieldLabel(it.field_cd)) + '</b> ' + mono(hc.valueText(it)) + ' ' + hc.srcHtml(it.source) + '</div>';
    }).join('') + (its.length > 6 ? '<div class="hc-src">외 ' + (its.length - 6) + '건</div>' : '');
    return '<li class="hc-row"><div class="hc-main"><b>' + esc(ch.name || '이름 미확인') + '</b> ' + esc(ch.position || '') +
      ' <span class="hc-badge">' + (cur ? '현 기관장 ' + esc(cur) + '과 충돌' : '후보') + '</span>' +
      '<div><span class="hc-src">항목 ' + (Number(ch.item_count) || 0) + '건</span> <span class="hc-by">입력 ' + esc(ch.created_by) + '</span></div>' + sum + '</div>' +
      '<div class="hc-btns">' + confirmBtn + rejectBtn + '</div>' +
      (ch.can_confirm ? '' : whyHtml('hc-hc-' + ch.head_id, ch.block_code)) + (ch.can_reject ? '' : whyHtml('hc-hr-' + ch.head_id, ch.reject_block_code)) +
      pend + '</li>';
  }
  function confirmedRow(it, d, M, ctx) {
    const lab = hc.fieldLabel(it.field_cd);
    const can = hc.canVoidOf(it, it.created_by, d.viewer_role, ctx.emp);
    const btn = can ? '<div class="hc-btns"><button type="button" data-m="ask-void-item" data-id="' + esc(it.item_id) + '" aria-label="' + esc(lab + ' 확정값 무효 처리') + '">무효 처리</button></div>' : '';
    const pend = isPending(M, 'void-item', it.item_id) ? pendingHtml(M.pending) : '';
    return '<li class="hc-row"><div class="hc-main"><b>' + esc(lab) + '</b> ' + mono(hc.valueText(it)) +
      '<div>' + hc.srcHtml(it.source) + ' <span class="hc-by">입력 ' + esc(it.created_by) + '</span></div></div>' + btn + pend + '</li>';
  }
  function confirmedItems(h) {
    const out = [];
    const f = h.fields || {};
    hc.FIELDS.forEach(function (fd) {
      const x = f[fd.cd];
      if (x) out.push({ item_id: x.item_id, field_cd: fd.cd, value: x.value, source: x.source, created_by: x.created_by, can_void: x.can_void });
    });
    sortPeriod(h.education).concat(sortPeriod(h.career)).forEach(function (it) { out.push(it); });
    return out;
  }

  // 목록 부분(후보·확정 항목·사진). 저장 뒤 이 부분만 다시 그린다.
  hc.modalListsHtml = function (view, M, ctx) {
    ctx = ctx || {};
    const d = view.data || {}, h = d.head;
    let out = '';
    const cands = d.candidates || [], heads = d.candidate_heads || [];
    if (!cands.length && !heads.length && hc.isEmptyHead(d)) return '';   // 기관장도 후보도 없으면 '0건' 절을 숨겨 양식이 맨 위에 온다
    out += '<section class="hc-m-sec" aria-labelledby="hc-s1"><h4 id="hc-s1">확정 대기 후보 <span class="v">' + (cands.length + heads.length) + '</span>건</h4>';
    if (cands.length + heads.length) {
      out += '<ul class="hc-list">' + heads.map(function (x) { return candidateHeadRow(x, d, M, ctx); }).join('') + cands.map(function (x) { return candidateRow(x, d, M, ctx); }).join('') + '</ul>';
    } else out += '<p class="db-empty">확정을 기다리는 후보가 없습니다.</p>';
    out += '</section>';
    if (h && !hc.isEmptyHead(d)) {
      const items = confirmedItems(h);
      out += '<section class="hc-m-sec" aria-labelledby="hc-s2"><h4 id="hc-s2">확정된 항목 <span class="v">' + items.length + '</span>건</h4>' +
        (items.length ? '<ul class="hc-list">' + items.map(function (x) { return confirmedRow(x, d, M, ctx); }).join('') + '</ul>' : '<p class="db-empty">확정된 항목이 없습니다.</p>') + '</section>';
      const p = h.photo;
      let photoRow = '<p class="db-empty">올려 둔 사진이 없습니다.</p>';
      if (p) {
        const can = hc.canVoidOf(p, p.uploaded_by, d.viewer_role, ctx.emp);
        photoRow = '<ul class="hc-list"><li class="hc-row"><div class="hc-main"><b>현재 사진</b> ' + esc(hc.licenseLabel(p.license_cd)) +
          '<div>' + hc.srcHtml(p.source) + ' <span class="hc-by">올림 ' + esc(p.uploaded_by) + '</span></div></div>' +
          (can ? '<div class="hc-btns"><button type="button" data-m="ask-void-photo" data-id="' + esc(p.photo_id) + '" aria-label="현재 사진 무효 처리">무효 처리</button></div>' : '') +
          (isPending(M, 'void-photo', p.photo_id) ? pendingHtml(M.pending) : '') + '</li></ul>';
      }
      // 무효 처리한 사진의 복원 버튼은 없다 — 서버는 무효 시 바로 앞 사진을 자동으로 되살리고 VOIDED는 복원할 수 없다(409).
      // 보관된(REPLACED) 사진 복원은 4단계 '사진 변경 이력' 화면에서 한다.
      out += '<section class="hc-m-sec" aria-labelledby="hc-s3"><h4 id="hc-s3">사진</h4>' + photoRow + '</section>';
    }
    return out;
  };

  // 입력 부분(기관장 등록 또는 항목 후보 추가 + 사진 올리기). 저장에 성공했을 때만 다시 그린다(실패하면 적은 값이 남는다).
  hc.modalFormsHtml = function (view, M, ctx) {
    ctx = ctx || {};
    const d = view.data || {}, h = d.head;
    let out = '';
    if (hc.isEmptyHead(d)) {
      // head:null이든 빈 머리든 서버는 바로 확정한다(빈 머리는 숨김 처리·열린 후보는 새 기관장으로 옮김). 동시에 먼저 등록한 사람이 있으면 후보로 들어간다.
      const hint = (h ? hc.TEXT.emptied + ' ' : '현 기관장이 없어 ') + '입력한 값이 바로 확정됩니다. 공개 자료로 확인한 사실만 출처와 함께 적으세요.';
      out += '<section class="hc-m-sec" aria-labelledby="hc-s4"><h4 id="hc-s4">기관장 추가</h4>' +
        '<p class="hc-hint" id="hc-s4-hint">' + esc(hint) + '</p>' + headFormHtml('hf', ctx.today, '추가', 'hc-s4-hint') + '</section>';
      return out;
    }
    const fcd = (M && M.field) || 'NAME';
    out += '<section class="hc-m-sec" aria-labelledby="hc-s4"><h4 id="hc-s4">항목 후보 추가</h4>' +
      '<p class="hc-hint">확정된 값과 다르면 후보로 들어가 확정 대기 목록에서 처리합니다. 학력·경력은 바로 확정됩니다. 정당 직책·범죄 경력은 저장되지 않습니다.</p>' +
      '<form class="hc-form" data-form="add-item" novalidate>' +
      '<label class="hc-lab">항목 종류<select name="field_cd" id="hc-field">' + hc.FIELDS.map(function (f) { return opt(f.cd, f.label, f.cd === fcd); }).join('') + '</select></label>' +
      '<div class="hc-valrow" id="hc-valrow">' + hc.valueRowHtml(fcd) + '</div>' + hc.sourceFieldsHtml(ctx.today) +
      '<div class="hc-actions wide"><button type="submit" class="db-next">후보 추가</button></div></form></section>';
    out += '<section class="hc-m-sec" aria-labelledby="hc-s5"><h4 id="hc-s5">사진 올리기</h4>' +
      '<p class="hc-hint">JPG 또는 PNG, 5MB 이하. 서버가 사진을 다시 만들어 저장하고 원래 파일 이름과 촬영 정보는 남기지 않습니다. 새로 올리면 지금 사진은 보관됩니다. 공공누리 제1유형이거나 기관이 직접 허락한 사진만 올립니다.</p>' +
      '<form class="hc-form" data-form="photo" novalidate>' +
      '<label class="hc-lab wide">사진 파일<input type="file" name="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" required></label>' +
      '<label class="hc-lab wide">이용 조건(필수)<select name="license_cd" required>' + opt('', '고르세요', true) + hc.LICENSES.map(function (l) { return opt(l.cd, l.label, false); }).join('') + '</select></label>' +
      hc.sourceFieldsHtml(ctx.today) +
      '<div class="hc-actions wide"><button type="submit" class="db-next">사진 올리기</button></div></form></section>';
    out += '<details class="hc-m-sec hc-newhead"><summary>다른 사람을 새 기관장 후보로 추가(교체)</summary>' +
      '<p class="hc-hint">현 기관장과 다른 사람을 넣으면 후보 기관장이 되고, 확정하면 지금 기관장이 이전 기관장으로 바뀝니다.</p>' + headFormHtml('hf', ctx.today, '후보 기관장 추가') + '</details>';
    return out;
  };

  hc.modalHtml = function (view, M, ctx) {
    return '<div class="modal-overlay hc-ov" id="hc-m-ov"><div class="modal-box hc-modal" role="dialog" aria-modal="true" aria-labelledby="hc-m-title">' +
      '<h3 id="hc-m-title" tabindex="-1">' + esc(hc.modalTitle(view)) + '</h3>' +
      '<div class="modal-scroll hc-m-body">' +
      '<p class="hc-hint">공개 자료로 확인한 사실만 출처와 함께 적습니다. 입력·확정·기각·무효는 처리한 사람과 함께 모두 기록됩니다.</p>' +
      '<div id="hc-m-status" tabindex="-1" aria-live="polite">' + msgHtml(M) + '</div>' +
      '<div id="hc-m-lists">' + hc.modalListsHtml(view, M, ctx) + '</div>' +
      '<div id="hc-m-forms">' + hc.modalFormsHtml(view, M, ctx) + '</div></div>' +
      '<div class="hc-m-foot"><button type="button" data-m="close" id="hc-m-close">닫기</button></div></div></div>';
  };

  // ── DOM(브라우저 전용) ─────────────────────────────────────────────
  let M = null;   // 열려 있는 편집 모달의 상태
  function q(sel) { return M && M.el ? M.el.querySelector(sel) : null; }
  function envNow() { return M && M.envFn ? (M.envFn() || {}) : {}; }

  function formValues(form) {
    const o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && el.type !== 'file') o[el.name] = el.value;
    });
    return o;
  }
  function setMsg(text, err, retry) {
    if (!M) return;
    M.msg = { text: text, err: !!err, retry: !!retry };
    const el = q('#hc-m-status');
    if (el) el.innerHTML = msgHtml(M);
  }
  // 반환: 이번 다시 그리기로 기관장 상태가 바뀌어 입력 양식을 새로 그렸고 그 결과가 'none'이면 true(호출자가 양식 첫 칸으로 포커스를 옮긴다)
  function repaintModal(withForms) {
    if (!M) return false;
    if (V.status !== 'ok' && V.status !== 'none') { hc.closeModal(true); return false; }
    const switched = M.mode !== V.status;
    M.mode = V.status;
    const l = q('#hc-m-lists');
    if (l) l.innerHTML = hc.modalListsHtml(V, M, envNow());
    if (switched) { const t = q('#hc-m-title'); if (t) t.textContent = hc.modalTitle(V); }
    if (withForms || switched) { const f = q('#hc-m-forms'); if (f) f.innerHTML = hc.modalFormsHtml(V, M, envNow()); }
    return switched && V.status === 'none';
  }
  function focusStatus() { const s = q('#hc-m-status'); if (s) s.focus(); }
  // 기관장이 없게 된 직후에는 같은 팝업의 '기관장 추가' 양식 첫 칸(이름)으로, 그 밖에는 결과 안내로.
  function focusAfter(toNone) {
    if (toNone) { const n = q('#hf-name'); if (n) { n.focus(); return; } }
    focusStatus();
  }

  // 쓰기 한 건: 요청 → 다시 읽기(카드·모달 갱신) → 안내. 진행 중에는 다른 클릭을 받지 않는다.
  // btn = 방금 수행한 쓰기의 버튼 ID — 뒤따르는 자동 재조회도 같은 버튼 ID로 감사 기록에 남는다(서버 허용 목록의 값만).
  function act(fn, okText, withForms, btn) {
    if (!M || M.busy) return;
    const reBtn = btn || hc.BTN.refresh;
    M.busy = true;
    q('.hc-modal').classList.add('hc-busy');
    q('.hc-modal').setAttribute('aria-busy', 'true');
    fn().then(function (res) {
      M.pending = null;
      const okMsg = typeof okText === 'function' ? okText(res) : okText;
      return hc.refresh(true, reBtn).then(function () {
        if (!M) return;
        if (V.quietFail) setMsg('저장은 됐지만 새로 읽지 못했습니다. 화면의 내용이 최신이 아닐 수 있습니다.', true, true);
        else setMsg(okMsg, false);
        focusAfter(repaintModal(withForms));
      });
    }).catch(function (e) {
      if (!M) return;
      setMsg(hc.errText(e.status, e.detail), true);
      if (e.status === 409 || e.status === 404) {   // 그 사이 바뀐 건 — 최신으로 다시 읽어 목록을 맞춘다
        M.pending = null;
        return hc.refresh(true, reBtn).then(function () { focusAfter(repaintModal(false)); });
      }
      repaintModal(false);
      focusStatus();
    }).then(function () {
      if (!M) return;
      M.busy = false;
      const box = q('.hc-modal');
      if (box) { box.classList.remove('hc-busy'); box.removeAttribute('aria-busy'); }
    });
  }

  function itemUrl(id, tail) { return base(V.instId) + '/head/items/' + encodeURIComponent(id) + '/' + tail; }
  function headUrl(id, tail) { return base(V.instId) + '/heads/' + encodeURIComponent(id) + '/' + tail; }
  function photoUrl(id, tail) { return base(V.instId) + '/head/photos/' + encodeURIComponent(id) + '/' + tail; }

  // 선택자 문자열에 넣는 값은 CSS.escape(없으면 영숫자·-_만 남긴다)
  function cssq(v) {
    const s = str(v);
    return typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/[^\w-]/g, '');
  }
  function askPending(p, btn) {
    M.pending = p;
    M.askSel = '[data-m="' + cssq(btn.getAttribute('data-m')) + '"][data-id="' + cssq(btn.getAttribute('data-id')) + '"]';
    repaintModal(false);
    const r = q('#hc-reason') || q('[data-m=do]');
    if (r) r.focus();
  }

  // 확인 단계를 접고 포커스를 처음 누른 버튼으로 돌린다.
  function cancelPending() {
    const sel = M.askSel;
    M.pending = null; M.askSel = '';
    repaintModal(false);
    const again = sel ? M.el.querySelector(sel) : null;
    if (again) again.focus(); else focusStatus();
  }

  function doPending() {
    const p = M.pending;
    if (!p) return;
    let reason = '';
    if (p.reason) {
      reason = trim((q('#hc-reason') || {}).value);
      if (!reason) { setMsg('사유를 적으세요.', true); const r = q('#hc-reason'); if (r) { r.setAttribute('aria-invalid', 'true'); r.focus(); } return; }
      if (reason.length > hc.REASON_MAX) { setMsg('사유는 ' + hc.REASON_MAX + '자 이내로 적으세요.', true); return; }
    }
    if (p.act === 'reject-item') {
      const b = p.self ? hc.BTN.itemWithdraw : hc.BTN.itemReject;
      act(function () { return hc.request('POST', itemUrl(p.id, 'reject'), { reason: reason }, b); }, p.self ? '후보를 회수했습니다.' : '후보를 기각했습니다.', false, b);
    } else if (p.act === 'void-item') act(function () { return hc.request('POST', itemUrl(p.id, 'void'), { reason: reason }, hc.BTN.itemVoid); }, '확정값을 무효 처리했습니다.', false, hc.BTN.itemVoid);
    else if (p.act === 'reject-head') act(function () { return hc.request('POST', headUrl(p.id, 'reject'), { reason: reason }, hc.BTN.headReject); }, p.self ? '후보 기관장을 회수했습니다.' : '후보 기관장을 기각했습니다.', false, hc.BTN.headReject);
    else if (p.act === 'confirm-head') act(function () { return hc.request('POST', headUrl(p.id, 'confirm'), undefined, hc.BTN.headConfirm); }, '기관장으로 확정했습니다.', true, hc.BTN.headConfirm);
    else if (p.act === 'void-photo') {
      // 서버가 무효 처리와 함께 바로 앞 사진을 자동으로 되살린다 — 응답의 restored_photo_id로 결과를 안내한다.
      act(function () { return hc.request('POST', photoUrl(p.id, 'void'), { reason: reason }, hc.BTN.photoVoid); }, function (res) {
        return res && res.restored_photo_id ? '사진을 무효 처리했습니다. 바로 앞 사진으로 되돌렸습니다.' : '사진을 무효 처리했습니다. 사진이 없어졌습니다(실루엣 표시).';
      }, false, hc.BTN.photoVoid);
    }
  }

  // 저장 뒤 새로 읽지 못했을 때 모달 안 [다시 불러오기]
  function reloadInModal() {
    if (!M || M.busy) return;
    M.busy = true;
    hc.refresh(true, hc.BTN.refresh).then(function () {
      if (!M) return;
      if (V.quietFail) setMsg('아직 새로 읽지 못했습니다. 서버 연결을 확인하고 다시 시도하세요.', true, true);
      else setMsg('새로 읽었습니다.', false);
      focusAfter(repaintModal(true));
    }).then(function () { if (M) M.busy = false; });
  }

  function onMClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('button[data-m]') : null;
    if (!b || !M || M.busy) return;
    const id = b.getAttribute('data-id');
    const self = b.getAttribute('data-self') === '1';
    switch (b.getAttribute('data-m')) {
      case 'close': hc.closeModal(true); break;
      case 'cancel': cancelPending(); break;
      case 'do': doPending(); break;
      case 'reload': reloadInModal(); break;
      case 'confirm-item': act(function () { return hc.request('POST', itemUrl(id, 'confirm'), undefined, hc.BTN.itemConfirm); }, '후보를 확정했습니다.', false, hc.BTN.itemConfirm); break;
      case 'ask-reject-item': askPending({ act: 'reject-item', id: id, self: self, reason: true, go: self ? '회수하기' : '기각하기', text: self ? '내가 낸 후보를 회수합니다. 사유를 적으세요.' : '이 후보를 기각합니다. 기각하면 되돌릴 수 없습니다.' }, b); break;
      case 'ask-void-item': askPending({ act: 'void-item', id: id, reason: true, go: '무효 처리하기', text: '이 확정값을 무효 처리합니다. 카드에서 사라지고 기록만 남습니다.' }, b); break;
      case 'ask-reject-head': askPending({ act: 'reject-head', id: id, self: self, reason: true, go: self ? '회수하기' : '기각하기', text: self ? '내가 낸 후보 기관장을 회수합니다. 사유를 적으세요.' : '이 후보 기관장을 기각합니다. 기각하면 되돌릴 수 없습니다.' }, b); break;
      case 'ask-confirm-head': {
        const cur = V.data && V.data.head && V.data.head.name;
        askPending({ act: 'confirm-head', id: id, reason: false, go: '기관장으로 확정하기', text: cur ? '확정하면 현재 기관장(' + cur + ')이 이전 기관장으로 바뀌고 열려 있던 후보 항목은 자동 기각됩니다.' : '이 사람을 현 기관장으로 확정합니다.' }, b);
        break;
      }
      case 'ask-void-photo': askPending({ act: 'void-photo', id: id, reason: true, go: '무효 처리하기', text: '현재 사진을 무효 처리합니다. 바로 앞 사진이 있으면 자동으로 되살아납니다.' }, b); break;
      default: break;
    }
  }

  function onMSubmit(e) {
    const form = e.target;
    if (!form || !form.getAttribute || !M) return;
    e.preventDefault();
    if (M.busy) return;
    const kind = form.getAttribute('data-form');
    const v = formValues(form);
    const headId = V.data && V.data.head ? V.data.head.head_id : 0;
    if (kind === 'add-item') {
      act(function () { return hc.addItem(V.instId, headId, v.field_cd, v); },
        function (r) { return r && r.state === 'CONFIRMED' ? '확정 항목으로 입력했습니다.' : '후보로 넣었습니다. 위 확정 대기 후보에서 확정하세요.' + (r && r.conflict ? ' 확정값과 다른 값이라 영업팀장·영업부장이 처리합니다.' : ''); }, true, hc.BTN.itemAdd);
    } else if (kind === 'add-head') {
      act(function () { return hc.addHead(V.instId, v); },
        function (r) { return r && r.state === 'CURRENT' ? '기관장을 추가했습니다.' : '후보 기관장으로 넣었습니다. 위 확정 대기 후보에서 처리하세요.'; }, true, hc.BTN.headAdd);
    } else if (kind === 'photo') {
      const fileEl = form.elements.file;
      const file = fileEl && fileEl.files && fileEl.files[0];
      const bad = hc.photoCheck(v, file);
      if (bad) { setMsg(bad, true); focusStatus(); return; }
      act(function () { return hc.uploadPhoto(V.instId, headId, v, file); }, '사진을 올렸습니다.', true, hc.BTN.photoUpload);
    }
  }

  function onMChange(e) {
    if (e.target && e.target.id === 'hc-field' && M) {
      M.field = e.target.value;
      const row = q('#hc-valrow');
      if (row) row.innerHTML = hc.valueRowHtml(M.field);
    }
  }

  function onMKey(e) {
    if (!M) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (M.busy) return;
      if (M.pending) { cancelPending(); return; }
      hc.closeModal(true);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = Array.prototype.filter.call(M.el.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]'), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !M.el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // envFn() → { today, role, emp, repaint, bid } — 열 때와 다시 그릴 때마다 최신 값을 받는다.
  hc.openModal = function (envFn, opts) {
    if (typeof document === 'undefined' || M) return;
    if (V.status !== 'ok' && V.status !== 'none') return;
    M = { envFn: envFn, opener: document.activeElement, pending: null, askSel: '', field: 'NAME', busy: false, msg: null, el: null, mode: V.status };
    const tmp = document.createElement('div');
    tmp.innerHTML = hc.modalHtml(V, M, envNow());
    M.el = tmp.firstChild;
    document.body.appendChild(M.el);
    M.el.addEventListener('click', onMClick);
    M.el.addEventListener('submit', onMSubmit);
    M.el.addEventListener('change', onMChange);
    M.el.addEventListener('keydown', onMKey);
    const first = opts && opts.focus === 'add-head' ? M.el.querySelector('#hf-name') : null;
    (first || M.el.querySelector('#hc-m-title')).focus();
  };

  hc.closeModal = function (refocus) {
    if (!M) return;
    const m = M;
    M = null;
    if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (refocus && typeof document !== 'undefined') {
      // 처음 누른 버튼이 다시 그려져 사라졌으면(ok↔none 전환) 지금 보이는 [기관장 추가]·[편집]으로, 그것도 없으면 기관 이름으로
      const qs = function (s) { return typeof document.querySelector === 'function' ? document.querySelector(s) : null; };
      const t = m.opener && document.body.contains(m.opener) ? m.opener
        : (qs('#dm-box [data-hc="add-head"]') || qs('#dm-box [data-hc="edit"]') || qs('#dm-name')   // 지도 상세 팝업이 열려 있으면 그 안에서 먼저(숨은 현황판에도 같은 id가 있을 수 있다)
          || qs('#hc-sec [data-hc="add-head"]') || qs('#hc-sec [data-hc="edit"]') || document.getElementById('db-name'));
      if (t && t.focus) t.focus();
    }
  };
  hc.isModalOpen = function () { return !!M; };

  // 상세 칸의 [편집]·[기관장 추가]·[새로 고침] 버튼(data-hc). envFn은 openModal과 같다.
  hc.onPaneClick = function (what, envFn) {
    if (what === 'refresh') {
      const env = envFn() || {};
      V.repaint = env.repaint || V.repaint;
      return hc.refresh(false, hc.BTN.refresh);
    }
    if (what === 'edit') { hc.openModal(envFn, {}); return null; }
    if (what === 'add-head') { hc.openModal(envFn, { focus: 'add-head' }); return null; }
    return null;
  };

  // ── 지도 팝오버 [기관장 보기] ───────────────────────────────────────
  // 버튼을 눌렀을 때만 서버(GET /institutions/{id}/head)를 읽는다(자동 조회 금지 — 지도를 훑을 때 열람 기록이 쌓이지 않게, 사용자 11-13).
  // 감사 기록 화면=map_popover, 버튼=head_view. 사진은 부르지 않는다. 결과는 팝오버 DOM에만 두고(캐시 없음) 팝오버를 닫거나
  // 다른 기관을 고르면 showPopover가 다시 써서 버려진다. 같은 기관에서 다시 누르면 다시 읽는다.
  hc.POP_ERR = {
    off: '기관장 정보 기능이 꺼져 있습니다.',
    login: '로그인한 사번이 확인되지 않습니다. 다시 로그인하세요.',
    denied: '이 정보를 볼 권한이 없습니다.',
    notfound: '서버에서 이 기관을 찾지 못했습니다.',
    error: '기관장 정보를 불러오지 못했습니다.',
  };
  // 브라우저에서만: 서버 모드·사번·역할·오늘(자정). 노드 시험은 env를 직접 넘긴다(dashboard.js와 같은 출처).
  hc.popEnv = function () {
    const s = root.store;
    function pick(f) { try { return f(); } catch (e) { return undefined; } }
    const d = new Date();
    return {
      serverMode: !!pick(function () { return s.isServerMode(); }),
      hasEmp: !!pick(function () { return (s.loadSession() || {}).emp; }),
      role: pick(function () { return (s.loadProfile().team || '').trim(); }) || '',
      today: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    };
  };
  // view.status: loading | ok | none | off | login | denied | notfound | error(text는 서버 문구·연결 실패 안내)
  hc.popHeadHtml = function (view, today) {
    const st = view && view.status;
    if (st === 'loading') return '<span class="pop-hmore">불러오는 중…</span>';
    if (st === 'ok') {
      const h = (view.data && view.data.head) || {};
      const f = h.fields || {};
      const te = trim(h.term_end);
      const ti = te ? hc.termInfo(te, today) : null;
      const src = (te && f.TERM_END && f.TERM_END.source) || (f.NAME && f.NAME.source) || null;
      const who = (h.name ? '<b>' + esc(h.name) + '</b>' : chip('이름 미확인')) + (h.position ? ' ' + esc(h.position) : '') + (h.acting ? ' (권한대행)' : '');
      const term = ti ? esc(ti.text) + ' · 만료 ' + mono(te) : chip('임기 만료일 미확인');
      return '<div class="pop-hrow">' + who + '</div><div class="pop-hrow">' + term + '</div>' +
        '<div class="pop-hrow">출처: ' + hc.srcHtml(src) + '</div><div class="pop-hrow pop-hmore">현황판에서 자세히 확인하세요.</div>';
    }
    if (st === 'none') return '<span class="pop-hmore">등록된 기관장이 없습니다. 현황판에서 추가할 수 있습니다.</span>';
    return '<span class="pop-hmore">' + esc((view && view.text) || hc.POP_ERR[st] || hc.POP_ERR.error) + '</span>';
  };
  function popWire(pop) {
    if (pop.__hcWired) return;
    pop.__hcWired = true;
    pop.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-pop-head]') : null;
      if (!t) return;
      ev.stopPropagation();   // 결과를 쓰면 버튼 자리가 다시 그려질 수 있다 — 문서의 '바깥 클릭' 핸들러가 팝오버를 닫지 않게 한다
      hc.popLoad(pop);
    });
  }
  function popFit(pop) {   // 결과가 붙어 길어진 팝오버가 화면 아래로 넘지 않게
    if (typeof window === 'undefined' || !pop.style) return;
    pop.style.top = Math.max(8, Math.min(parseFloat(pop.style.top) || 8, window.innerHeight - pop.offsetHeight - 8)) + 'px';
  }
  // render.showPopover가 팝오버 마크업을 쓴 직후 부른다. 조회는 하지 않는다 — 조건을 통과하면 버튼만 놓는다.
  hc.decoratePopover = function (pop, rec, env) {
    if (!pop || typeof pop.querySelector !== 'function') return;
    const dd = pop.querySelector('#pop-head');
    if (!dd) return;
    pop.__hcTok = (pop.__hcTok || 0) + 1;   // 앞 기관의 늦은 응답은 버린다
    pop.__hcBusy = false;
    pop.__hcRec = null;
    popWire(pop);
    const e = env || hc.popEnv();
    if (hc.gate(rec, e)) return;   // 정적 모드·로그인 없음·비영업·서버에 없는 기관 → 기존 '현황판에서 확인' 칩 그대로
    pop.__hcRec = rec;
    pop.__hcToday = e.today;
    dd.innerHTML = '<button type="button" class="pop-hbtn" data-pop-head="view">기관장 보기</button>' +
      '<span class="pop-hlog">열람 기록이 남습니다</span><div class="pop-hout" id="pop-head-out" aria-live="polite"></div>';
  };
  hc.popLoad = function (pop) {
    const rec = pop.__hcRec;
    if (!rec || !rec.institutionId || pop.__hcBusy) return Promise.resolve();
    const tok = pop.__hcTok;
    const btn = pop.querySelector('[data-pop-head]');
    const out = pop.querySelector('#pop-head-out');
    pop.__hcBusy = true;
    if (btn) btn.setAttribute('aria-disabled', 'true');   // disabled는 포커스를 잃는다
    if (out) out.innerHTML = hc.popHeadHtml({ status: 'loading' });
    function finish(view) {
      if (pop.__hcTok !== tok || pop.__hcRec !== rec || (pop.style && pop.style.display !== 'block')) { if (pop.__hcTok === tok) pop.__hcBusy = false; return; }   // 닫히거나 다른 기관으로 바뀜
      pop.__hcBusy = false;
      const o = pop.querySelector('#pop-head-out');
      if (o) o.innerHTML = hc.popHeadHtml(view, pop.__hcToday);
      const b = pop.querySelector('[data-pop-head]');
      if (b) { b.removeAttribute('aria-disabled'); b.textContent = '다시 불러오기'; }
      popFit(pop);
    }
    return hc.request('GET', base(rec.institutionId) + '/head', undefined, hc.BTN.popView, undefined, hc.POP_SCREEN).then(function (d) {
      finish(hc.isEmptyHead(d) ? { status: 'none' } : { status: 'ok', data: d });
    }).catch(function (e) {
      const c = hc.classify(e && e.status, e && e.detail);
      finish({ status: c.status, text: c.text || '' });
    });
  };

  if (isNode) module.exports = hc;
  else root.headcard = hc;
})(typeof self !== 'undefined' ? self : this);
