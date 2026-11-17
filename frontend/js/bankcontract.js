(function (root) {
  'use strict';
  // 금고 약정(NEXT 89, 039) — 기관 상세 '현재 금고 은행' 4번째 갈래 + 기관 정보 변경 창 '금고 약정' 묶음.
  // 규격: design-reviewer 2026-11-16_1752_a65ba7b1.md 6-1~6-2. 서버: BankContractController·Service·Rules.
  // 약정 응답은 rec.bank·OURS_SCOPE(현황판 '국민은행이 맡은 기관')에 섞지 않는다 — 이 파일은 상세·변경 창 표시만 한다.
  const hasReq = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const logic = hasReq ? require('./logic.js') : root.logic;
  const errtext = hasReq ? require('./errtext.js') : root.errtext;
  const ie = hasReq ? require('./instedit.js') : root.instedit;
  const esc = logic.esc;
  const bc = { env: {} };

  bc.SCREEN = 'institution_edit';                                   // 서버 InstUiIds.SCREEN_INSTITUTION_EDIT
  bc.BTN = { save: 'save_bank_contract', cancel: 'cancel_bank_contract' };   // InstUiIds.BTN_*
  bc.MSG = {
    noChange: '바뀐 내용이 없어 저장하지 않았습니다.',
    deleted: '금고 약정을 지웠습니다. 지운 기록은 이력에 남습니다.',
    reloaded: '최신 기록을 불러왔습니다. 확인한 뒤 다시 저장하세요.',
    reloadedCancel: '최신 기록을 불러왔습니다. 확인한 뒤 다시 지우세요.',
    noEdit: '금고 약정은 영업팀이 입력합니다.',
    alreadyCancelled: '이미 지워진 약정입니다. 목록을 새로 불러왔습니다.',
    empty: '지금 약정은 기록이 없습니다. 새 약정을 입력하면 여기에 보입니다.',
    kbNote: '직접 입력한 약정은 입찰 현황판 \'국민은행이 맡은 기관\' 수에 넣지 않습니다.',
    term: '약정 기간은 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.',
    termRange: '약정 기간 범위(1990~2100)를 벗어났습니다.',
    termNone: '존재하지 않는 날짜입니다.',
    termOrder: '약정 시작이 끝보다 늦습니다.',
    future: '확인일은 오늘보다 뒤일 수 없습니다.',
  };
  const RANK_NAME = { FIRST: '1금고', SECOND: '2금고', JOINT: '공동 지정', NONE: '금고 은행' };
  bc.SRC_FIELDS = { LINK: ['url'], DOC_NO: ['no'], PRESS: ['url', 'no'], STAFF: ['dept'] };
  bc.BLANK = { bank: '', etc: '', rank: '', ac: '', acetc: '', from: '', to: '', kind: '', url: '', no: '', dept: '', date: '', note: '' };

  function t(s) { return String(s == null ? '' : s).trim(); }
  function E(s) { return esc(s == null ? '' : s); }
  function mono(s) { return '<span class="v">' + E(s) + '</span>'; }
  function day(s) { return String(s || '').slice(0, 10); }

  // ── 요청·상태(기관 하나만 쥔다) ───────────────────────────────────────
  function getFetch() { return bc.env.fetch || (typeof fetch === 'function' ? fetch : null); }
  function store() { return bc.env.store || root.store || null; }
  function emp() { try { return String((store().loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  bc.canLoad = function () { try { return !!(store() && store().isServerMode() && emp() && getFetch()); } catch (e) { return false; } };
  function base(id) { return '/institutions/' + encodeURIComponent(id) + '/bank-contracts'; }
  bc.headers = function (button) { return { 'Content-Type': 'application/json', 'X-Screen-Id': bc.SCREEN, 'X-Button-Id': button }; };

  let LIS = [];
  const S = { id: '', emp: '', seq: 0, st: 'idle', code: 0, data: null, histOpen: false, histSt: 'idle', hist: null, hseq: 0 };
  function resetState(id, e) {
    Object.assign(S, { id: id, emp: e, seq: S.seq + 1, st: 'idle', code: 0, data: null, histOpen: false, histSt: 'idle', hist: null, hseq: S.hseq + 1 });
  }
  function notify() { LIS.slice().forEach(function (f) { try { f(); } catch (e) { /* 한 구독자의 오류가 다른 구독자를 막지 않는다 */ } }); }
  bc.onChange = function (fn) { LIS.push(fn); return function () { LIS = LIS.filter(function (x) { return x !== fn; }); }; };
  bc.reset = function () { resetState('', ''); };   // 시험용

  // 기관 id의 약정 상태. 서버 모드·로그인이 아니면 null(화면은 기존 3갈래 그대로). 기관이 바뀌면 한 번 받아 온다(실패 뒤 자동 재시도 없음).
  bc.view = function (id) {
    id = String(id || '');
    if (!id || !bc.canLoad()) return null;
    const e = emp();
    if (S.id !== id || S.emp !== e) { resetState(id, e); bc.load(id); }
    return { st: S.st, code: S.code, data: S.data, histOpen: S.histOpen, histSt: S.histSt, hist: S.hist };
  };
  bc.load = function (id, quiet) {
    const f = getFetch();
    if (!f || S.id !== id) return Promise.resolve();
    const my = ++S.seq;
    if (!quiet || S.st !== 'ok') S.st = 'loading';
    return f(base(id)).then(function (r) {
      if (!r.ok) return { fail: r.status };
      return r.json().then(function (d) { return { d: d || {} }; });
    }).catch(function () { return { fail: 0 }; }).then(function (x) {
      if (my !== S.seq || S.id !== id) return;
      if (x.d) { S.data = x.d; S.st = 'ok'; S.code = 0; }
      else { S.st = (x.fail === 401 || x.fail === 403) ? 'denied' : 'error'; S.code = x.fail; S.data = null; }
      notify();
    });
  };
  bc.loadHist = function (id) {
    const f = getFetch();
    if (!f || S.id !== id) return Promise.resolve();
    const my = ++S.hseq;
    S.histSt = 'loading';
    return f(base(id) + '/history').then(function (r) {
      if (!r.ok) return { fail: r.status };
      return r.json().then(function (d) { return { d: d || {} }; });
    }).catch(function () { return { fail: 0 }; }).then(function (x) {
      if (my !== S.hseq || S.id !== id) return;
      if (x.d) { S.hist = x.d; S.histSt = 'ok'; } else { S.hist = null; S.histSt = (x.fail === 401 || x.fail === 403) ? 'denied' : 'error'; }
      notify();
    });
  };
  bc.setHistOpen = function (id, open) {
    if (S.id !== id) return;
    S.histOpen = !!open;
    if (open && S.histSt !== 'ok' && S.histSt !== 'loading') bc.loadHist(id);
  };
  bc.refresh = function (id) { const p = bc.load(id, true); if (S.histOpen) bc.loadHist(id); return p; };

  function post(url, button, body) {
    const f = getFetch();
    if (!f) return Promise.resolve({ status: 0, body: null });
    return f(url, { method: 'POST', headers: bc.headers(button), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, body: j }; }); },
        function () { return { status: 0, body: null }; });
  }
  bc.save = function (id, body) { return post(base(id), bc.BTN.save, body); };
  bc.cancel = function (id, no, body) { return post(base(id) + '/' + encodeURIComponent(no) + '/cancel', bc.BTN.cancel, body); };

  // 저장·취소 응답 해석. 서버 문구(detail.message)를 그대로 쓴다.
  bc.outcome = function (x, op) {
    const s = x ? x.status : 0;
    const d = x && x.body ? x.body.detail : null;
    const p = errtext.parse(d);
    if (s === 201) return { kind: 'saved' };
    if (s === 200) return { kind: 'nochange', msg: bc.MSG.noChange };
    if (s === 409 && p.code === 'DUP_RANK') return { kind: 'overlap', msg: p.message, overlaps: d && Array.isArray(d.overlaps) ? d.overlaps : [] };
    if (s === 409 && p.code === 'ALREADY_CANCELLED') return { kind: 'stale', code: p.code, msg: bc.MSG.alreadyCancelled };
    if (s === 409) return { kind: 'stale', code: p.code, msg: (p.message ? p.message + ' ' : '') + (op === 'cancel' ? bc.MSG.reloadedCancel : bc.MSG.reloaded) };
    if (s === 400 || s === 422) return { kind: 'field', code: p.code, msg: p.message || ie.errText(s, d) };
    return { kind: 'error', msg: ie.errText(s, d) };
  };

  // ── 상세 절: 갈래 고르기 ──────────────────────────────────────────────
  bc.group = function (lines) {
    const g = { cur: [], fut: [], past: [] };
    (lines || []).forEach(function (l) {
      if (!l) return;
      (l.term_state === 'FUTURE' ? g.fut : l.term_state === 'PAST' ? g.past : g.cur).push(l);   // UNKNOWN은 지금 줄로 보되 기간에 '미확인'
    });
    return g;
  };
  function latestPast(past) {
    return past.slice().sort(function (a, b) { return String(b.term_to || '') < String(a.term_to || '') ? -1 : 1; })[0];
  }
  // 우선순위(규격 P1-2): CURRENT 직접 입력 > 수집값 > PAST 직접 입력(만료). collected = 기존 갈래(c.kb·c.next)가 있는가.
  bc.plan = function (lines, collected) {
    const g = bc.group(lines);
    if (g.cur.length) return { mode: 'direct', rows: g.cur.concat(g.fut), g: g, noCur: false };
    if (collected) return { mode: 'legacy', rows: g.fut.concat(g.past), g: g, noCur: false };
    if (g.fut.length || g.past.length) return { mode: 'direct', rows: g.fut.concat(g.past.length ? [latestPast(g.past)] : []), g: g, noCur: true };
    return { mode: 'legacy', rows: [], g: g, noCur: false };
  };
  // 수집 은행 이름과 직접 입력 은행 이름 비교용 열쇠(정규화 규칙은 개발 이관: 'KB국민은행'↔'국민은행').
  bc.bankKey = function (s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9ㄱ-ㆎ가-힣]/g, '')
      .replace(/^kb(?=국민)/, '').replace(/^nh(?=농협)/, '').replace(/^kb$/, '국민').replace(/은행$/, '');
  };
  function rankName(l, ranks) {
    if (l.rank_cd === 'NONE') return RANK_NAME.NONE;
    const hit = (ranks || []).filter(function (r) { return r.code === l.rank_cd; })[0];
    return (hit && hit.name) || RANK_NAME[l.rank_cd] || String(l.rank_cd || '');
  }
  bc.rankName = rankName;

  function whoHtml(l) {
    return '<span class="bk-who">입력 ' + E(l.editor_name) + ' · ' + mono(day(l.saved_at)) +
      (l.emp_verified === true ? '' : ' · 로그인 연동 전') + '</span>';
  }
  function srcHtml(l) {
    const k = l.src_kind;
    const label = k === 'PRESS' ? '기사 번호' : k === 'LINK' ? '문서 번호' : '문서·공고 번호';
    const inner = ie.srcInner(l.src_url, l.src_no, label);
    let s;
    if (k === 'STAFF') s = '담당자 확인 · ' + E(l.checked_dept) + (inner ? ' · ' + inner : '');
    else s = (k === 'PRESS' ? '언론 보도 · ' : '') + (inner || '<span class="pop-unk">출처 미기록</span>');
    return '출처 ' + s + (l.checked_date ? ' · 확인일 ' + mono(l.checked_date) : '');
  }
  // 줄 하나 = dt + dd. o = { ranks, same }
  function rowHtml(l, o) {
    const s = l.term_state;
    const dt = s === 'FUTURE' ? E(String(l.term_from || '').slice(0, 4)) + '년부터' : E(rankName(l, o.ranks));
    let term;
    if (s === 'UNKNOWN') term = '약정 기간 <span class="pop-unk">미확인</span>';
    else if (l.term_from) term = '약정 ' + mono(l.term_from + ' ~ ' + l.term_to);
    else term = '약정 끝 ' + mono(l.term_to);
    const ov = Array.isArray(l.overlap_with) && l.overlap_with.length ? '<span class="bk-ln db-chk">같은 순위 약정과 기간이 겹칩니다</span>' : '';
    return '<dt>' + dt + '</dt><dd>' +
      '<span class="bk-ln">' + (s === 'FUTURE' ? E(rankName(l, o.ranks)) + ' · ' : '') + E(l.bank_name) + (s === 'PAST' ? ' <span class="wf-badge pp-cancel">만료</span>' : '') +
      ' <span class="wf-badge pp-neutral">직접 입력</span>' + (o.same ? ' <span class="db-why">· 수집 기록과 같음</span>' : '') + '</span>' +
      '<span class="bk-ln db-why">' + term + '</span>' + ov +
      (l.account_name ? '<span class="bk-ln db-why">맡는 회계 ' + E(l.account_name) + '</span>' : '') +
      '<span class="bk-ln db-why">' + srcHtml(l) + '</span>' +
      (l.note ? '<span class="bk-ln db-why">비고 ' + E(l.note) + '</span>' : '') + whoHtml(l) + '</dd>';
  }
  function histItem(x) {
    const per = x.term_from ? x.term_from + ' ~ ' + x.term_to : (x.term_to ? '끝 ' + x.term_to : '');
    const del = x.action_cd === 'CANCEL';
    return '<li>' + mono(day(x.saved_at)) + ' ' + E(x.editor_name) + (x.emp_verified === true ? '' : ' · 로그인 연동 전') + ' ' + (del ? '지움' : '저장') +
      ' — ' + E(x.bank_name) + (per ? ' ' + E(per) : '') + (del && x.cancel_reason_name ? ' · 사유 ' + E(x.cancel_reason_name) : '') + '</li>';
  }
  function histHtml(view, n) {
    let body;
    if (view.histSt === 'ok' && view.hist) {
      const items = Array.isArray(view.hist.items) ? view.hist.items : [];
      body = '<ul class="bk-hist-list">' + items.map(histItem).join('') + '</ul>' + (view.hist.truncated ? '<p class="db-why">최근 기록만 보입니다.</p>' : '');
    } else if (view.histSt === 'error' || view.histSt === 'denied') body = '<p class="db-why">수정 이력을 불러오지 못했습니다.</p>';
    else body = '<p class="db-why" aria-busy="true">불러오는 중…</p>';
    return '<details class="db-src bk-hist"' + (view.histOpen ? ' open' : '') + '><summary id="bk-hist-sum">수정 이력 ' + Number(n) + '건 보기</summary>' + body + '</details>';
  }

  // 절 전체. view = bc.view() 결과(서버 모드), o = { legacyDl, legacyNote, collected, hasKb, col }
  //  col = { name, slot, date, extra:[[dt, dd]] } — 기존 수집 갈래(c.kb·c.next)의 요약(병기용)
  bc.sectionHtml = function (view, o) {
    o = o || {};
    const ok = !!(view && view.st === 'ok' && view.data);
    const data = ok ? view.data : {};
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const ranks = (data.codes && data.codes.ranks) || [];
    const p = bc.plan(lines, !!o.collected);
    const col = o.col && o.col.name ? o.col : null;
    const key = col ? bc.bankKey(col.name) : '';
    let dl, note = '';
    if (p.mode === 'direct') {
      const slotRank = col && /^\s*([12])/.test(String(col.slot || '')) ? (RegExp.$1 === '1' ? 'FIRST' : 'SECOND') : '';   // 수집 슬롯을 모르면 은행만 비교
      const sameOf = function (l) { return !!key && bc.bankKey(l.bank_name) === key && (!slotRank || l.rank_cd === slotRank); };   // 은행·순위 둘 다 같을 때만 '같음'
      const same = p.g.cur.some(sameOf);
      const rows = p.rows.map(function (l) {
        const cur = l.term_state !== 'FUTURE' && l.term_state !== 'PAST';
        return rowHtml(l, { ranks: ranks, same: cur && sameOf(l) });
      });
      if (p.g.cur.length && col && !same) {
        rows.push('<dt>수집 기록</dt><dd><span class="bk-ln"><span class="wf-badge pp-cancel">수집</span> ' + E(col.name) + (col.slot ? ' · ' + E(col.slot) + '금고' : '') +
          (col.date ? ' <span class="db-why">출처 기준일 ' + mono(col.date) + '</span>' : '') + ' <span class="db-chk">수집 기록과 다름</span></span></dd>');
      }
      if (p.g.cur.length && o.col && Array.isArray(o.col.extra)) {
        o.col.extra.forEach(function (x) { rows.push('<dt>' + E(x[0]) + '</dt><dd>' + E(x[1]) + ' <span class="wf-badge pp-cancel">수집</span></dd>'); });
      }
      dl = '<dl class="db-dl">' + rows.join('') + '</dl>';
      if (p.noCur) note = '<p class="db-empty">' + bc.MSG.empty + '</p>';
      else if (!o.hasKb && p.g.cur.some(function (l) { return /국민|kb/i.test(String(l.bank_name || '')); })) note = '<p class="db-empty">' + bc.MSG.kbNote + '</p>';
    } else {
      dl = o.legacyDl || '<dl class="db-dl"><dt>금고 은행</dt><dd><span class="pop-unk">미확인</span></dd></dl>';
      const rows = p.rows.map(function (l) { return rowHtml(l, { ranks: ranks, same: false }); }).join('');
      if (rows) dl = dl.replace(/<\/dl>$/, rows + '</dl>');
      note = o.legacyNote || '';
    }
    let state = '';
    if (view && view.st === 'denied') state = '<p class="db-why bk-state">금고 약정 기록을 볼 권한이 없습니다.</p>';
    else if (view && view.st === 'error') state = '<p class="db-why bk-state" role="alert">금고 약정 기록을 불러오지 못했습니다. <button type="button" id="bk-retry">다시 불러오기</button></p>';
    else if (view && view.st !== 'ok') state = '<p class="db-why bk-state" role="status" aria-busy="true"><span class="pop-unk">불러오는 중</span></p>';
    let foot = '';
    if (ok) {
      const n = Number(data.history_count) || 0;
      const hist = n >= 2 ? histHtml(view, n) : '';
      const btn = data.can_edit ? '<button type="button" id="bk-edit">' + (lines.length ? '금고 약정 고치기' : '금고 약정 입력') + '</button>' : '<span class="db-why">' + bc.MSG.noEdit + '</span>';
      foot = '<div class="bk-foot">' + hist + btn + '</div>';
    }
    return '<div class="db-sec" id="db-bank"><h3>현재 금고 은행</h3>' + dl + note + state + foot + '</div>';
  };

  // ── 변경 창: 형식 검사·본문 ───────────────────────────────────────────
  function exists(y, m, d) { const x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; }
  bc.termMsg = function (s) {
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return bc.MSG.term;
    const y = +s.slice(0, 4);
    if (y < 1990 || y > 2100) return bc.MSG.termRange;
    if (s.length >= 7 && (+s.slice(5, 7) < 1 || +s.slice(5, 7) > 12)) return bc.MSG.termNone;
    if (s.length === 10 && !exists(y, +s.slice(5, 7), +s.slice(8, 10))) return bc.MSG.termNone;
    return '';
  };
  function startOf(s) { return s.length === 4 ? s + '-01-01' : s.length === 7 ? s + '-01' : s; }
  function endOf(s) {
    if (s.length === 4) return s + '-12-31';
    if (s.length === 7) { const last = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).getUTCDate(); return s + '-' + (last < 10 ? '0' : '') + last; }
    return s;
  }
  // f = 폼 값(bc.BLANK 모양), o = { today, contractNo, baseRev, confirmOverlap }
  // → { need:[빠진 칸 이름], errors:[{msg, ids}], body, ok }
  bc.check = function (f, o) {
    o = o || {};
    const v = {};
    Object.keys(bc.BLANK).forEach(function (k) { v[k] = t(f[k]); });
    const need = [], errors = [];
    if (!v.bank) need.push('은행'); else if (v.bank === 'ETC' && !v.etc) need.push('기타 은행 이름');
    if (!v.rank) need.push('금고 순위');
    if (v.ac === 'ETC' && !v.acetc) need.push('기타 회계 이름');
    if (!v.to) need.push('약정 끝');
    if (!v.kind) need.push('출처 종류');
    else if (v.kind === 'LINK' && !v.url) need.push('링크');
    else if (v.kind === 'DOC_NO' && !v.no) need.push('문서·공고 번호');
    else if (v.kind === 'PRESS' && !v.url && !v.no) need.push('기사 링크 또는 기사 번호');
    else if (v.kind === 'STAFF' && !v.dept) need.push('확인한 기관 부서');
    if (!v.date) need.push('확인일');
    const sf = bc.SRC_FIELDS[v.kind] || [];
    let fromOk = true, toOk = true;
    if (v.from) { const m = bc.termMsg(v.from); if (m) { errors.push({ msg: m, ids: ['ie-bk-from'] }); fromOk = false; } }
    if (v.to) { const m = bc.termMsg(v.to); if (m) { errors.push({ msg: m, ids: ['ie-bk-to'] }); toOk = false; } }
    if (v.from && v.to && fromOk && toOk && startOf(v.from) > endOf(v.to)) errors.push({ msg: bc.MSG.termOrder, ids: ['ie-bk-from', 'ie-bk-to'] });
    if (sf.indexOf('url') >= 0 && v.url) { const m = ie.urlMsg(v.url); if (m) errors.push({ msg: m, ids: ['ie-bk-url'] }); }
    if (sf.indexOf('no') >= 0 && v.no) { const m = ie.noMsg(v.no); if (m) errors.push({ msg: m, ids: ['ie-bk-no'] }); }
    if (v.date) {
      const m = ie.dateMsg(v.date);
      if (m) errors.push({ msg: m, ids: ['ie-bk-date'] });
      else if (o.today && v.date > o.today) errors.push({ msg: bc.MSG.future, ids: ['ie-bk-date'] });
    }
    // 보내는 규칙: 숨긴 칸은 보내지 않는다(서버가 '기타' 외 직접 입력·종류 밖 값을 거절한다). 비운 칸은 null.
    const body = { rank_cd: v.rank, bank_cd: v.bank, term_to: v.to, src_kind: v.kind, checked_date: v.date, term_from: v.from || null, note: v.note || null };
    if (v.bank === 'ETC') body.bank_name_etc = v.etc;
    if (sf.indexOf('url') >= 0 && v.url) body.src_url = v.url;
    if (sf.indexOf('no') >= 0 && v.no) body.src_no = v.no;
    if (sf.indexOf('dept') >= 0 && v.dept) body.checked_dept = v.dept;
    if (v.ac) { body.account_cd = v.ac; if (v.ac === 'ETC') body.account_etc = v.acetc; } else body.account_cd = null;
    if (o.contractNo) { body.contract_no = o.contractNo; body.base_rev_no = o.baseRev; }
    if (o.confirmOverlap) body.confirm_overlap = true;
    return { need: need, errors: errors, body: body, ok: !need.length && !errors.length };
  };
  bc.formFromLine = function (l) {
    return { bank: l.bank_cd || '', etc: l.bank_cd === 'ETC' ? (l.bank_name_etc || '') : '', rank: l.rank_cd || '',
      ac: l.account_cd || '', acetc: l.account_cd === 'ETC' ? (l.account_etc || '') : '', from: l.term_from || '', to: l.term_to || '',
      kind: l.src_kind || '', url: l.src_url || '', no: l.src_no || '', dept: l.checked_dept || '', date: l.checked_date || '', note: l.note || '' };
  };
  // STALE 뒤 새로 받은 목록에서 그 줄의 최신 rev로 맞춘다(안 맞추면 재저장이 계속 409).
  bc.syncRev = function (meta, lines) {
    const l = meta && meta.no && Array.isArray(lines) ? lines.filter(function (x) { return Number(x.contract_no) === Number(meta.no); })[0] : null;
    if (l) meta.rev = Number(l.rev_no);
    return meta;
  };
  // 저장 실패(stale·field·error) 뒤 포커스 대상 id: 저장 버튼이 눌릴 수 있으면 그것, 아니면 오류 문구 요소.
  bc.failFocus = function (saveDisabled) { return saveDisabled ? 'ie-bank-err' : 'ie-bk-save'; };
  bc.sameForm = function (a, b) {
    return Object.keys(bc.BLANK).every(function (k) { return t(a[k]) === t(b[k]); });
  };
  bc.SRC_NOTE = {
    '': '출처 종류를 고르면 적을 칸이 보입니다.',
    PRESS: '링크와 번호 중 하나는 적어야 합니다.',
    STAFF: '담당자 확인은 기관 부서명만 적습니다. 담당자 이름·전화번호는 적지 않습니다.',
  };

  // ── 변경 창: 마크업 ──────────────────────────────────────────────────
  bc.groupHtml = function () {
    return '<fieldset class="ie-fs" id="ie-bank" tabindex="-1"><legend>금고 약정</legend><div class="ie-grid">' +
      '<div class="ie-wide" id="ie-bk-list"></div><div class="ie-bk-formbox" id="ie-bk-form" hidden></div>' +
      '<p class="ie-err" id="ie-bank-err" role="alert"></p><p class="ie-ok" id="ie-bank-ok" role="status"></p></div></fieldset>';
  };
  bc.formHtml = function (codes, f, o) {
    codes = codes || {}; f = f || bc.BLANK; o = o || {};
    const banks = codes.banks || [], ranks = codes.ranks || [], kinds = codes.src_kinds || [], accts = codes.accounts || [];
    const sf = bc.SRC_FIELDS[f.kind] || [];
    const inp = function (id, text, val, attr, hidden, cls) {
      return '<label class="ie-lab' + (cls ? ' ' + cls : '') + '" id="' + id + '-l"' + (hidden ? ' hidden' : '') + '><span class="ie-lt" id="' + id + '-t">' + E(text) +
        '</span><input id="' + id + '" autocomplete="off" value="' + E(val) + '" ' + (attr || '') + '></label>';
    };
    const sel = function (id, text, list, val, first, req) {
      return '<label class="ie-lab" id="' + id + '-l"><span class="ie-lt" id="' + id + '-t">' + E(text) + '</span><select id="' + id + '"' + (req ? ' aria-required="true"' : '') + '><option value="">' + E(first) + '</option>' +
        list.map(function (c) { return '<option value="' + E(c.code) + '"' + (c.code === val ? ' selected' : '') + '>' + E(c.code === 'ETC' ? '기타(직접 적기)' : c.name) + '</option>'; }).join('') + '</select></label>';
    };
    const radio = function (name, legend, list, val) {
      return '<fieldset class="ie-radio wrap" role="radiogroup" aria-required="true"><legend>' + E(legend) + '</legend>' + list.map(function (c) {
        return '<label><input type="radio" name="' + name + '" value="' + E(c.code) + '"' + (c.code === val ? ' checked' : '') + '> ' + E(c.name) + '</label>';
      }).join('') + '</fieldset>';
    };
    const hasFirst = ranks.some(function (r) { return r.code === 'FIRST'; });
    let h = '<div role="group" aria-labelledby="ie-bk-form-t"><p class="ie-lt bk-form-t" id="ie-bk-form-t">' + E(o.title || '약정 추가') + '</p><div class="ie-grid">';
    h += sel('ie-bk-bank', '은행 (필수)', banks, f.bank, '은행 고르기', true) + inp('ie-bk-etc', '기타 은행 이름 (필수)', f.etc, 'maxlength="30"', f.bank !== 'ETC');
    h += radio('ie-bk-rank', '금고 순위 (필수)', ranks, f.rank);
    if (!hasFirst) h += '<p class="ie-note">1금고·2금고는 지자체·교육청만 고를 수 있습니다.</p>';
    if (accts.length) h += sel('ie-bk-ac', '맡는 회계 (선택)', accts, f.ac, '선택 안 함', false) + inp('ie-bk-acetc', '기타 회계 이름 (필수)', f.acetc, 'maxlength="30"', f.ac !== 'ETC');
    h += inp('ie-bk-from', '약정 시작', f.from, 'placeholder="2023 / 2023-01 / 2023-01-01" maxlength="10"') +
      inp('ie-bk-to', '약정 끝 (필수)', f.to, 'aria-required="true" placeholder="2023 / 2023-01 / 2023-01-01" maxlength="10"');
    h += radio('ie-bk-kind', '출처 종류 (필수)', kinds, f.kind);
    h += '<p class="ie-note" id="ie-bk-srcnote">' + E(bc.SRC_NOTE[f.kind] || (f.kind ? '' : bc.SRC_NOTE[''])) + '</p>';
    h += inp('ie-bk-url', '링크', f.url, 'placeholder="https://" maxlength="500" aria-describedby="ie-bk-srcnote"', sf.indexOf('url') < 0) +
      inp('ie-bk-no', '문서·공고 번호', f.no, 'placeholder="예: 제2023-154호" maxlength="50" aria-describedby="ie-bk-srcnote"', sf.indexOf('no') < 0) +
      inp('ie-bk-dept', '확인한 기관 부서', f.dept, 'placeholder="예: 재무과 자금팀" maxlength="50" aria-describedby="ie-bk-srcnote"', sf.indexOf('dept') < 0);
    h += inp('ie-bk-date', '확인일 (필수)', f.date, 'aria-required="true" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10"') + '<span></span>';
    h += inp('ie-bk-note', '비고', f.note, 'maxlength="100" placeholder="예: 2금고는 별도 공고"', false, 'ie-wide');
    h += '<p class="ie-note" id="ie-bank-need"></p>';
    h += '<div class="hc-confirmbox ie-cbox" id="ie-bk-ovbox" role="group" aria-labelledby="ie-bk-ov-t" hidden></div>';
    h += '<div class="ie-row"><button type="button" id="ie-bk-save" disabled>금고 약정 저장</button><button type="button" id="ie-bk-cancel">작성 취소</button></div>';
    return h + '</div></div>';
  };
  bc.overlapHtml = function (list, ranks) {
    return '<p id="ie-bk-ov-t">같은 순위에 기간이 겹치는 약정이 있습니다.</p><ul class="bk-hist-list">' + (list || []).map(function (l) {
      const per = l.term_from ? l.term_from + ' ~ ' + l.term_to : '끝 ' + l.term_to;
      return '<li>' + E(rankName(l, ranks)) + ' ' + E(l.bank_name) + ' · ' + mono(per) + ' (입력 ' + E(l.editor_name) + ')</li>';
    }).join('') + '</ul><div class="ie-row"><button type="button" id="ie-bk-ov-yes">겹침을 알고 저장</button><button type="button" id="ie-bk-ov-no">돌아가서 고치기</button></div>';
  };
  function listRow(l, ranks) {
    const n = Number(l.contract_no);
    const per = l.term_from ? l.term_from + ' ~ ' + l.term_to : '끝 ' + l.term_to;
    return '<div class="ie-bk-row"><div class="ie-bk-main"><span class="bk-ln">' + E(rankName(l, ranks)) + ' ' + E(l.bank_name) +
      (l.term_state === 'PAST' ? ' <span class="wf-badge pp-cancel">만료</span>' : '') + ' · ' + mono(per) + '</span>' + whoHtml(l) + '</div>' +
      '<div class="sp"><button type="button" data-bk-edit="' + n + '" aria-label="' + E('고치기 — ' + rankName(l, ranks) + ' ' + (l.bank_name || '')) + '">고치기</button>' +
      '<button type="button" data-bk-del="' + n + '" aria-label="' + E('지우기 — ' + rankName(l, ranks) + ' ' + (l.bank_name || '')) + '">지우기</button></div></div>';
  }
  function delBox(l, d, D) {
    const reasons = ((d.codes || {}).cancel_reasons || []).map(function (c) {
      return '<option value="' + E(c.code) + '"' + (c.code === D.why ? ' selected' : '') + '>' + E(c.name) + '</option>';
    }).join('');
    return '<div class="hc-confirmbox ie-bk-delbox" id="ie-bk-delbox" role="group" aria-labelledby="ie-bk-del-t"><p id="ie-bk-del-t">' + E(l.bank_name) + ' 약정을 지웁니다. 지운 기록도 이력에 남습니다.</p>' +
      '<label class="ie-lab"><span class="ie-lt">지우는 사유 (필수)</span><select id="ie-bk-why" aria-required="true"><option value="">사유 고르기</option>' + reasons + '</select></label>' +
      '<label class="ie-lab" id="ie-bk-whyetc-l" hidden><span class="ie-lt">사유 직접 적기 (필수)</span><input id="ie-bk-whyetc" maxlength="50" autocomplete="off" value="' + E(D.etc) + '"></label>' +
      '<div class="ie-row"><button type="button" id="ie-bk-del-yes" disabled>지우기</button><button type="button" id="ie-bk-del-no">그대로 두기</button></div></div>';
  }

  // ── 변경 창: 컨트롤러(브라우저 전용) ────────────────────────────────────
  // ctx = { wrap:#edit-fields, rec }. 반환 = { dirty(), click(e), input(e), focus(), teardown() }. instedit.js가 호출한다.
  bc.attach = function (ctx) {
    const wrap = ctx.wrap, id = String(ctx.rec && ctx.rec.institutionId || '');
    const C = { form: null, init: null, del: null, busy: false, dead: false, wantFocus: false };
    const q = function (s) { return wrap.querySelector(s); };
    const setText = function (i, s) { const e = q('#' + i); if (e) e.textContent = s; };
    const data = function () { const v = bc.view(id); return v && v.st === 'ok' ? v.data : null; };
    const val = function (i) { const e = q('#' + i); return e ? e.value : ''; };
    const radioVal = function (n) { const e = q('input[name="' + n + '"]:checked'); return e ? e.value : ''; };
    function read() {
      return { bank: val('ie-bk-bank'), etc: val('ie-bk-etc'), rank: radioVal('ie-bk-rank'), ac: val('ie-bk-ac'), acetc: val('ie-bk-acetc'),
        from: val('ie-bk-from'), to: val('ie-bk-to'), kind: radioVal('ie-bk-kind'), url: val('ie-bk-url'), no: val('ie-bk-no'),
        dept: val('ie-bk-dept'), date: val('ie-bk-date'), note: val('ie-bk-note') };
    }
    function clearMsg() {
      setText('ie-bank-err', ''); setText('ie-bank-ok', '');
      wrap.querySelectorAll('#ie-bank [aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    }
    function showErr(e) {
      setText('ie-bank-err', e.msg);
      (e.ids || []).forEach(function (i) { const el = q('#' + i); if (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'ie-bank-err'); } });
      const f = e.ids && e.ids[0] ? q('#' + e.ids[0]) : null;
      if (f && f.focus) f.focus();
    }

    function refreshDel() {
      const D = C.del; if (!D) return;
      const why = q('#ie-bk-why'), etc = q('#ie-bk-whyetc');
      if (!why) return;
      D.why = why.value; D.etc = etc ? etc.value : '';
      const el = q('#ie-bk-whyetc-l'); if (el) el.hidden = D.why !== 'ETC';
      const yes = q('#ie-bk-del-yes');
      if (yes) { yes.disabled = !D.why || (D.why === 'ETC' && !t(D.etc)) || C.busy; yes.textContent = C.busy ? '지우는 중…' : '지우기'; }
    }
    function paintList() {
      const box = q('#ie-bk-list');
      if (!box || C.dead) return;
      const v = bc.view(id);
      let h;
      if (!v) h = '<p class="ie-note">서버에 연결하면 금고 약정을 입력할 수 있습니다.</p>';
      else if (v.st === 'denied') h = '<p class="ie-note">금고 약정 기록을 볼 권한이 없습니다.</p>';
      else if (v.st === 'error') h = '<p class="ie-note">금고 약정 기록을 불러오지 못했습니다. <button type="button" id="ie-bk-retry">다시 불러오기</button></p>';
      else if (v.st !== 'ok') h = '<p class="ie-note" aria-busy="true">불러오는 중…</p>';
      else if (!v.data.can_edit) h = '<p class="ie-note">' + bc.MSG.noEdit + '</p>';
      else {
        const d = v.data, lines = Array.isArray(d.lines) ? d.lines : [], ranks = (d.codes || {}).ranks;
        h = lines.length ? lines.map(function (l) { return listRow(l, ranks) + (C.del && C.del.no === Number(l.contract_no) ? delBox(l, d, C.del) : ''); }).join('')
          : '<p class="ie-note">입력한 약정이 없습니다.</p>';
        if (!C.form) h += '<div class="ie-row"><button type="button" id="ie-bk-add">약정 추가</button></div>';
      }
      const a = wrap.ownerDocument && wrap.ownerDocument.activeElement;   // 다시 그려도 포커스가 BODY로 가지 않게 같은 버튼으로 돌린다
      let keep = '';
      if (a && box.contains(a)) keep = a.id ? '#' + a.id : a.hasAttribute('data-bk-edit') ? '[data-bk-edit="' + a.getAttribute('data-bk-edit') + '"]' : a.hasAttribute('data-bk-del') ? '[data-bk-del="' + a.getAttribute('data-bk-del') + '"]' : '';
      box.innerHTML = h;
      if (keep) { const k = q(keep); if (k && k.focus) k.focus(); }
      refreshDel();
      if (C.wantFocus && v && v.st === 'ok') { C.wantFocus = false; const b = q('#ie-bk-add') || q('[data-bk-edit]'); if (b && b.focus) b.focus(); }
    }
    function refreshForm() {
      if (!C.form) return;
      const f = read(), d = data() || {};
      const set = function (i, on) { const e = q('#' + i + '-l'); if (e) e.hidden = !on; };
      set('ie-bk-etc', f.bank === 'ETC'); set('ie-bk-acetc', f.ac === 'ETC');
      const sf = bc.SRC_FIELDS[f.kind] || [];
      set('ie-bk-url', sf.indexOf('url') >= 0); set('ie-bk-no', sf.indexOf('no') >= 0); set('ie-bk-dept', sf.indexOf('dept') >= 0);
      setText('ie-bk-url-t', f.kind === 'PRESS' ? '기사 링크' : '링크 (필수)');
      setText('ie-bk-no-t', f.kind === 'PRESS' ? '기사 번호' : '문서·공고 번호 (필수)');
      setText('ie-bk-dept-t', '확인한 기관 부서 (필수)');
      setText('ie-bk-srcnote', bc.SRC_NOTE[f.kind] != null ? bc.SRC_NOTE[f.kind] : '');
      const c = bc.check(f, { today: d.today });
      setText('ie-bank-need', c.need.length ? '저장하려면: ' + c.need.join(', ') : '');
      const b = q('#ie-bk-save');
      if (b) { b.disabled = c.need.length > 0 || C.busy; b.textContent = C.busy ? '저장 중…' : '금고 약정 저장'; }
    }
    function openForm(f, meta) {
      const d = data(); if (!d) return;
      const box = q('#ie-bk-form'); if (!box) return;
      C.form = meta; C.init = Object.assign({}, f); C.del = null;
      box.innerHTML = bc.formHtml(d.codes, f, { title: meta.title });
      box.hidden = false;
      clearMsg(); paintList(); refreshForm();
      const first = q('#ie-bk-bank'); if (first && first.focus) first.focus();
    }
    function closeForm(focusAdd) {
      C.form = null; C.init = null;
      const box = q('#ie-bk-form'); if (box) { box.innerHTML = ''; box.hidden = true; }
      paintList();
      if (focusAdd) { const b = q('#ie-bk-add'); if (b && b.focus) b.focus(); }
    }
    function save(confirmOverlap) {
      if (C.busy || !C.form) return;
      const f = read(), d = data() || {};
      clearMsg();
      const c = bc.check(f, { today: d.today, contractNo: C.form.no, baseRev: C.form.rev, confirmOverlap: !!confirmOverlap });
      if (c.errors.length) { showErr(c.errors[0]); return; }
      if (c.need.length) { refreshForm(); return; }
      C.busy = true; refreshForm();
      bc.save(id, c.body).then(function (x) {
        C.busy = false;
        const o = bc.outcome(x, 'save');
        if (o.kind === 'saved' || o.kind === 'stale') {   // 닫혔어도 상세는 최신으로
          const rf = bc.refresh(id);
          if (o.kind === 'stale' && C.form) rf.then(function () { if (!C.dead && C.form) bc.syncRev(C.form, (data() || {}).lines); });   // 재저장이 계속 409가 되지 않게 최신 rev로
        }
        if (C.dead) return;
        if (o.kind === 'saved') { closeForm(true); setText('ie-bank-ok', '금고 약정을 저장했습니다.'); return; }
        refreshForm();
        if (o.kind === 'nochange') { setText('ie-bank-ok', o.msg); return; }
        if (o.kind === 'overlap') {
          const ov = q('#ie-bk-ovbox');
          if (ov) { ov.innerHTML = bc.overlapHtml(o.overlaps, (d.codes || {}).ranks); ov.hidden = false; const b = q('#ie-bk-ov-no'); if (b && b.focus) b.focus(); }
          return;
        }
        setText('ie-bank-err', o.msg);   // stale·field·error — 폼 값과 base_rev_no는 그대로 둔다(최신 기록은 위 목록에 다시 보임)
        const fe = q('#' + bc.failFocus(!!(q('#ie-bk-save') || {}).disabled));   // 포커스가 BODY로 가지 않게
        if (fe) { if (fe.id === 'ie-bank-err') fe.setAttribute('tabindex', '-1'); if (fe.focus) fe.focus(); }
      });
    }
    function doDelete() {
      const D = C.del;
      if (C.busy || !D) return;
      const body = { base_rev_no: D.rev, cancel_reason_cd: D.why };
      if (D.why === 'ETC') body.cancel_reason_etc = t(D.etc);
      C.busy = true; refreshDel(); clearMsg();
      bc.cancel(id, D.no, body).then(function (x) {
        C.busy = false;
        const o = bc.outcome(x, 'cancel');
        if (o.kind === 'saved' || o.kind === 'stale') bc.refresh(id);
        if (C.dead) return;
        if (o.kind === 'saved') { C.del = null; paintList(); setText('ie-bank-ok', bc.MSG.deleted); const ab = q('#ie-bk-add'); if (ab && ab.focus) ab.focus(); return; }
        if (o.kind === 'stale') C.del = null;
        paintList(); setText('ie-bank-err', o.msg);
        const fb = q('#ie-bk-del-no') || q('#ie-bk-add'); if (fb && fb.focus) fb.focus();   // 403은 서버 문구 그대로(입력한 본인·영업팀장·영업부장만)
      });
    }
    function lineOf(no) { const d = data(); return d && Array.isArray(d.lines) ? d.lines.filter(function (l) { return Number(l.contract_no) === no; })[0] : null; }

    const off = bc.onChange(function () { paintList(); });
    const ctl = {
      dirty: function () { return !!C.form && !bc.sameForm(read(), C.init || bc.BLANK); },
      input: function (e) {
        const tg = e.target;
        if (tg.closest && tg.closest('#ie-bk-form')) { clearMsg(); const ov = q('#ie-bk-ovbox'); if (ov && !ov.hidden) { ov.hidden = true; ov.innerHTML = ''; } refreshForm(); }
        else if (tg.id === 'ie-bk-why' || tg.id === 'ie-bk-whyetc') refreshDel();
      },
      click: function (e) {
        const b = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!b || !b.closest('#ie-bank')) return false;
        const bid = b.id;
        if (bid === 'ie-bk-add') openForm(Object.assign({}, bc.BLANK), { no: 0, rev: 0, title: '약정 추가' });
        else if (b.hasAttribute('data-bk-edit')) {
          const no = Number(b.getAttribute('data-bk-edit')), l = lineOf(no);
          if (l) openForm(bc.formFromLine(l), { no: no, rev: Number(l.rev_no), title: '약정 고치기 — ' + rankName(l, ((data() || {}).codes || {}).ranks) + ' ' + (l.bank_name || '') });
        } else if (b.hasAttribute('data-bk-del')) {
          const no = Number(b.getAttribute('data-bk-del')), l = lineOf(no);
          if (l) { C.del = { no: no, rev: Number(l.rev_no), why: '', etc: '' }; clearMsg(); paintList(); const n = q('#ie-bk-del-no'); if (n && n.focus) n.focus(); }
        } else if (bid === 'ie-bk-del-no') {
          const no = C.del && C.del.no; C.del = null; paintList();
          const r = q('[data-bk-del="' + no + '"]'); if (r && r.focus) r.focus();
        } else if (bid === 'ie-bk-del-yes') doDelete();
        else if (bid === 'ie-bk-save') save(false);
        else if (bid === 'ie-bk-ov-yes') save(true);
        else if (bid === 'ie-bk-ov-no') { const ov = q('#ie-bk-ovbox'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } const s = q('#ie-bk-save'); if (s && s.focus) s.focus(); }
        else if (bid === 'ie-bk-cancel') closeForm(true);
        else if (bid === 'ie-bk-retry') bc.load(id);
        return true;
      },
      focus: function () {
        const f = q('#ie-bank');
        if (f && f.scrollIntoView) f.scrollIntoView({ block: 'start' });
        C.wantFocus = true; paintList();
        if (C.wantFocus && f && f.focus) f.focus();   // 아직 못 받았으면 묶음 틀에 두고, 도착하면 [약정 추가]로 옮긴다
      },
      teardown: function () { C.dead = true; off(); },
    };
    paintList();
    return ctl;
  };

  if (hasReq) module.exports = bc; else root.bankcontract = bc;
})(typeof self !== 'undefined' ? self : this);
