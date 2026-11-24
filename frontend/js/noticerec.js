(function (root) {
  'use strict';
  // 공고 상태 기록(NEXT 30 2단계, 2026-11-16) — 서버 API 호출·현재 기록 목록 상태·상세 칸 '공고 상태 기록' 절의 순수 HTML·검증.
  // 규격: handoff/agents/design-reviewer/2026-11-16_1440_abc6228b.md. 서버: handoff/agents/backend-dev/2026-11-16_1457_ad331791.md 3-0.
  // 판정(미처리 등)과 상태 표는 logic.js(recordView·REC_STATUSES) 한 곳. 화면 상태(초안·오류·이력)는 dashboard.js가 쥔다.
  // 사용자·서버 글자는 전부 esc(). confirm() 없음.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const esc = logic.esc;
  const nr = {};
  nr.env = {};                                   // 시험용 주입: { store, fetch }
  nr.SCREEN = 'bid_notice';
  nr.STATUSES = logic.REC_STATUSES.map(function (s) { return s.code; });
  nr.LABEL = logic.REC_STATUS_LABEL;
  nr.OPINION_MAX = 500;
  nr.TIMEOUT_MS = 10000;                         // 현재 기록 목록 요청 제한 시간
  nr.NEXT_MAX_DAYS = 366;                       // 서버 NEXT_CHECK_MAX_DAYS와 같다

  // ── 현재 기록 목록(/notice-rounds/current) ───────────────────────────
  // 항목에는 round_closed·close_reason_cd가 있다. NO_BID로 닫힌 마지막 회차도 status_cd 'NO_BID'·round_closed true로 들어온다.
  const S = { status: 'idle', code: 0, byId: {}, canEdit: false, today: '', emp: '', seq: 0, listeners: [] };
  function store() { return nr.env.store || root.store || null; }
  function getFetch() { return nr.env.fetch || (typeof fetch === 'function' ? fetch : null); }
  function emp() { try { return String((store().loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  nr.canLoad = function () { try { return !!(store() && store().isServerMode() && emp() && getFetch()); } catch (e) { return false; } };
  function sync() {                              // 사용자가 바뀌면 앞 사람의 값을 버린다
    const e = emp();
    if (S.emp !== e) { S.emp = e; S.status = 'idle'; S.byId = {}; S.canEdit = false; S.today = ''; S.seq += 1; }
  }
  // 'offline'(서버 미연결) | 'idle'(아직 안 받음) | 'loading' | 'ok' | 'error' | 'denied'
  nr.state = function () { sync(); return nr.canLoad() ? S.status : 'offline'; };
  nr.listCode = function () { sync(); return S.code; };   // 목록 요청이 실패한 HTTP 코드(401·403·0). 성공이면 0
  nr.snap = function () { sync(); return nr.canLoad() && S.status === 'ok' ? { byId: S.byId, today: S.today } : null; };
  nr.canEdit = function () { sync(); return nr.canLoad() && S.status === 'ok' && S.canEdit; };   // 저장 버튼은 이것만 본다(역할 문자열 판정 금지)
  nr.today = function (localToday) { sync(); return (S.status === 'ok' && S.today) || localToday || ''; };
  nr.onChange = function (fn) { S.listeners.push(fn); return function () { S.listeners = S.listeners.filter(function (x) { return x !== fn; }); }; };
  function notify() { S.listeners.slice().forEach(function (f) { try { f(); } catch (e) { /* 한 구독자의 오류가 다른 구독자를 막지 않는다 */ } }); }
  nr.load = function () {
    sync();
    if (!nr.canLoad()) return Promise.resolve();
    const my = ++S.seq;
    if (S.status !== 'ok') S.status = 'loading';   // 이미 받은 값이 있으면 다시 받는 동안 그대로 둔다(깜박임 방지)
    // 응답이 오지 않아도 TIMEOUT_MS 뒤에는 실패로 보고 진행한다(로그인 팝업 판정이 끝없이 보류되지 않게).
    let timer = null;
    const slow = new Promise(function (res) { timer = setTimeout(function () { res({ fail: 0 }); }, nr.TIMEOUT_MS); });
    const real = getFetch()('/notice-rounds/current').then(function (r) {
      if (!r.ok) return { fail: r.status };
      return r.json().then(function (d) { return { d: d || {} }; });
    }).catch(function () { return { fail: 0 }; });
    return Promise.race([real, slow]).then(function (x) { clearTimeout(timer); return x; }).then(function (x) {
      if (my !== S.seq) return;
      if (x.d) {
        S.byId = {};
        (Array.isArray(x.d.items) ? x.d.items : []).forEach(function (it) { if (it && it.institution_id) S.byId[it.institution_id] = it; });
        S.canEdit = !!x.d.can_edit; S.today = typeof x.d.today === 'string' ? x.d.today : ''; S.status = 'ok'; S.code = 0;
      } else {
        S.status = (x.fail === 401 || x.fail === 403) ? 'denied' : 'error'; S.code = x.fail; S.byId = {}; S.canEdit = false; S.today = '';
      }
      notify();
    });
  };
  nr.ensure = function () { sync(); return (S.status === 'idle' && nr.canLoad()) ? nr.load() : Promise.resolve(); };   // 실패 뒤 자동 재시도는 하지 않는다

  // ── 이력·저장 ────────────────────────────────────────────────────────
  nr.fetchHistory = function (id) {
    return getFetch()('/institutions/' + encodeURIComponent(id) + '/notice-rounds').then(function (r) {
      if (!r.ok) return { status: (r.status === 401 || r.status === 403) ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d || {} }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  };
  nr.save = function (id, body, confirmed, screen) {
    return getFetch()('/institutions/' + encodeURIComponent(id) + '/notice-rounds/judgments', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Screen-Id': screen || nr.SCREEN, 'X-Button-Id': confirmed ? 'save_confirmed' : 'save' },
      body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, body: j }; }); });
  };

  // ── 순수 도우미 ──────────────────────────────────────────────────────
  function iGa(w) { const s = String(w == null ? '' : w), c = s ? s.charCodeAt(s.length - 1) : 0; return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0 ? '이' : '가'; }
  function at(s) { return String(s || '').replace('T', ' ').slice(0, 16); }
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function ymd(s) {                              // 'YYYY-MM-DD' → UTC ms | null (2026-02-30 같은 날짜는 null)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  }
  function ymdPlus(s, n) {
    const t = ymd(s);
    if (t === null) return '';
    const d = new Date(t + n * 86400000), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  nr.ymdPlus = ymdPlus;

  // 공고 자료(자동 판정) 한 줄과 서버로 보낼 스냅샷의 auto_kind·auto_days. 담당자 판정과 말이 섞이지 않게 '공고 자료'로만 쓴다(규격 P1-1).
  // '미확인' 류 문구는 logic.NOTICE_WORDS 한 곳을 따른다.
  nr.autoOf = function (it) {
    const dd = function (n) { return n === 0 ? 'D-day' : 'D-' + n; };
    const md = function (s) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[1] + '-' + m[2] : ''; };
    const W = logic.NOTICE_WORDS;
    if (!it || it.unknown || !it.date) return { kind: 'before', days: null, text: '공고 전 · 입찰 예정일 미상' };
    if (it.overdue) return { kind: 'overdue', days: it.days, text: it.noticeExpired ? W.expiredNote(it.days) : '예정일 경과 D+' + it.days };
    if (it.notice) {
      if (it.phase === 'receiving') return { kind: 'receiving', days: it.since, text: '접수 중 · 마감 ' + dd(it.deadlineDays) };
      if (it.phase === 'awaiting') return { kind: 'deadline_passed', days: it.since, text: '마감 지남 (' + md(it.receiveTo) + ')' };
      return { kind: 'deadline_unknown', days: it.since, text: '공고 있음 · ' + W.unknownChip };
    }
    return { kind: 'before', days: -it.days, text: '공고 전 · 입찰 예정 ' + dd(it.days) };
  };
  nr.snapshot = function (it) {
    const a = nr.autoOf(it), b = it && it.basis;
    return { due_date: (it && it.date) || null, due_basis: (b === 'notice' || b === 'cycle' || b === 'expiry') ? b : null,
      due_confirmed: !!(it && it.confidence === '확정'), auto_kind: a.kind, auto_days: a.days === 0 ? 0 : a.days };
  };
  nr.scopeText = function (it) { return !it || !it.date ? '이번 회차' : (it.notice ? '이번 회차 · 공고 ' : '이번 회차 · 입찰 예정 ') + it.date; };
  nr.scopeHtml = function (it) { return !it || !it.date ? '이번 회차' : (it.notice ? '이번 회차 · 공고 ' : '이번 회차 · 입찰 예정 ') + '<span class="d">' + esc(it.date) + '</span>'; };

  // 이력 응답에서 '지금 회차'를 고른다. 열려 있고 기관 자료가 안 넘어간(stale 아님) 회차의 최신 기록.
  // 열린 회차가 없으면 방금 NO_BID로 닫은 회차를 읽기용으로 보인다(closed:true) — 저장은 새 회차(null, 0)로 간다.
  // 입력을 막는 '닫힘'은 서버 current 항목으로만 정한다: 상태 NO_BID이고 round_closed true(기관 자료가 넘어가면 서버가 항목을 뺀다 → 새 회차 입력).
  nr.isClosed = function (item) { return !!(item && item.status_cd === 'NO_BID' && item.round_closed === true); };
  nr.CLOSED_LINE = '이번 회차는 \'입찰 없음\'으로 닫혔습니다. 기관 정보에서 다음 입찰 예정일이 바뀌면 새 회차를 적을 수 있습니다.';
  nr.emp = function () { return emp(); };
  nr.currentOf = function (hist) {
    const rounds = (hist && Array.isArray(hist.rounds)) ? hist.rounds : [];
    const latestOf = function (r) { let l = null; (r.logs || []).forEach(function (x) { if (!l || x.rev_no > l.rev_no) l = x; }); return l; };
    // 서버 current와 같게 '가장 큰 회차'만 본다(오래된 열린 회차·예전 NO_BID와 섞지 않는다).
    let top = null;
    rounds.forEach(function (r) { if (r && (!top || r.round_seq > top.round_seq)) top = r; });
    const open = top && top.open && !top.stale ? top : null;
    const ol = open ? latestOf(open) : null;
    if (ol) return { roundSeq: open.round_seq, baseRev: ol.rev_no, latest: ol, closed: false };
    const nb = top && !top.open && top.close_reason_cd === 'NO_BID' ? top : null;
    const nl = nb ? latestOf(nb) : null;
    return { roundSeq: null, baseRev: 0, latest: nl && nl.status_cd === 'NO_BID' ? nl : null, closed: !!(nl && nl.status_cd === 'NO_BID') };
  };

  // ── 초안·검증·본문 ───────────────────────────────────────────────────
  nr.blankDraft = function (cur) { const L = cur && !cur.closed ? cur.latest : null; return L ? { status: L.status_cd || '', next: L.next_check_date || '', opinion: L.opinion || '' } : { status: '', next: '', opinion: '' }; };
  nr.sameDraft = function (a, b) {
    const hide = (logic.recStatus(a.status) || {}).next === 'hide';
    return a.status === b.status && (hide || String(a.next || '') === String(b.next || '')) && String(a.opinion || '').trim() === String(b.opinion || '').trim();
  };
  nr.needs = function (status) { const d = logic.recStatus(status); return { next: d ? d.next : 'opt', opinion: d ? d.opinion : 'opt' }; };
  nr.FIELD_ORDER = ['status', 'next', 'opinion'];
  const OP_REQ = { CLOSED: '공고 종료로 적을 때는 의견이 필요합니다. 무엇을 보고 끝났다고 판단했는지 적으세요.',
    NO_BID: '입찰 없음(연장·지정)으로 적을 때는 의견이 필요합니다. 왜 입찰이 없는지 적으세요.',
    DELAYED: '지연·재공고 대기로 적을 때는 의견이 필요합니다. 왜 늦어지는지 적으세요.' };
  // → { status?, next?, opinion? } 필드별 첫 오류. 서버 검사(NoticeRoundRules)와 같은 기준 — 서버 문구가 정본이고 이건 미리 알려 주는 것.
  nr.validate = function (d, todayStr) {
    const e = {}, def = logic.recStatus(d.status), n = nr.needs(d.status);
    if (!def) e.status = '판정을 하나 고르세요.';
    const op = String(d.opinion == null ? '' : d.opinion).trim();
    if (def && n.opinion === 'req' && !op) e.opinion = OP_REQ[d.status] || '의견을 적으세요.';
    else if (Array.from(op).length > nr.OPINION_MAX) e.opinion = '의견은 ' + nr.OPINION_MAX + '자까지 적을 수 있습니다(지금 ' + Array.from(op).length + '자).';
    if (def && n.next !== 'hide') {
      if (!d.next) { if (n.next === 'req') e.next = '지연·재공고 대기는 다음 확인일이 필요합니다. 다시 확인할 날을 고르세요.'; }
      else if (todayStr) {
        const a = ymd(todayStr), b = ymd(d.next), days = a === null || b === null ? null : Math.round((b - a) / 86400000);
        if (days === null || days < 1) e.next = '다음 확인일은 내일 이후 날짜로 고르세요.';
        else if (days > nr.NEXT_MAX_DAYS) e.next = '다음 확인일은 1년 안의 날짜로 고르세요.';
      }
    }
    return e;
  };
  nr.body = function (d, cur, it) {
    const hide = (logic.recStatus(d.status) || {}).next === 'hide';
    return { round_seq: cur && cur.roundSeq != null ? cur.roundSeq : null, base_rev_no: cur ? cur.baseRev : 0, status_cd: d.status,
      opinion: String(d.opinion || '').trim(), next_check_date: hide ? null : (d.next || null), snapshot: nr.snapshot(it) };
  };

  // 저장 응답 → { kind:'saved'|'nochange'|'field'|'alert'|'stale'|'confirm', msg, field, prep, reload, recheck, closed }
  // closed = 저장 응답의 round_closed(NO_BID 저장이 회차를 닫음). 화면은 이때 목록(nr.load)과 이력을 다시 받는다.
  const FIELD_OF = { status_cd: 'status', opinion: 'opinion', next_check_date: 'next' };
  nr.outcome = function (x) {
    const s = x ? x.status : 0, b = x && x.body;
    const d = b && b.detail && typeof b.detail === 'object' && !Array.isArray(b.detail) ? b.detail : null;
    if (s === 201 && b) return { kind: 'saved', msg: '기록을 저장했습니다. ' + (b.handler_name || '') + ' · ' + at(b.handled_at), closed: b.round_closed === true };
    if (s === 200 && b && b.saved === false) return { kind: 'nochange', msg: '바뀐 내용이 없어 저장하지 않았습니다.', closed: b.round_closed === true };
    if (s === 400) {
      const f = FIELD_OF[d && d.field], m = (d && d.message) || '저장하지 못했습니다. 입력을 확인하세요.';
      return f ? { kind: 'field', field: f, msg: m } : { kind: 'alert', msg: m };
    }
    if (s === 401) return { kind: 'alert', msg: '로그인이 끝났습니다. 다시 로그인한 뒤 저장하세요. 적은 내용은 이 화면을 떠나기 전까지 남아 있습니다.', auth: true };
    if (s === 403) return { kind: 'alert', msg: '공고 상태 기록은 영업팀만 저장할 수 있습니다.', recheck: true, auth: true };
    if (s === 409 && d) {
      if (d.code === 'NO_BID_CLOSED') return { kind: 'alert', msg: nr.CLOSED_LINE, reload: true };   // 서버가 닫힌 회차의 새 저장을 거부
      if (d.code === 'ACTIVE_PREP_CONFIRM_REQUIRED') return { kind: 'confirm', prep: d.prep_state_cd || '' };
      if (d.code === 'STALE' || d.code === 'ROUND_CHANGED') {
        const l = d.latest;
        const m = d.code === 'STALE' && l && l.handler_name
          ? l.handler_name + iGa(l.handler_name) + ' 먼저 기록했습니다(' + at(l.handled_at) + ', ' + (nr.LABEL[l.status_cd] || '') + '). 위 최신 기록을 확인하고 다시 저장하세요.'
          : (d.message || '다른 사람이 먼저 기록했습니다. 최신 기록을 확인하고 다시 저장하세요.');
        return { kind: 'stale', msg: m, reload: true };
      }
    }
    return { kind: 'alert', msg: '저장하지 못했습니다. 서버가 응답하지 않습니다. 잠시 뒤 [기록 저장]을 다시 누르세요.' };
  };

  // ── HTML(순수) ───────────────────────────────────────────────────────
  function warnIcon() { const i = root.render && root.render.ICONS && root.render.ICONS.warn; return i ? '<span aria-hidden="true">' + i + '</span>' : ''; }
  function req(kind) { return kind === 'req' ? '<span class="req">(필수)</span>' : '<span class="req">(선택)</span>'; }
  function errP(P, key, text) { return '<p class="db-rec-err" id="' + P + 'db-rec-' + key + '-err">' + (text ? warnIcon() + esc(text) : '') + '</p>'; }
  function inv(text) { return text ? ' aria-invalid="true"' : ''; }

  function historyHtml(hist, open) {
    const rounds = (hist && Array.isArray(hist.rounds)) ? hist.rounds : [], rows = [];
    rounds.forEach(function (r) {
      const logs = (r.logs || []).slice().sort(function (a, b) { return b.rev_no - a.rev_no; }), live = !!(r.open && !r.stale);
      logs.forEach(function (l, i) { rows.push({ l: l, prev: logs[i + 1] || null, past: !live }); });
    });
    if (!rows.length) return '';
    const li = rows.map(function (x) {
      const l = x.l, p = x.prev, bits = [];
      if (l.opinion && (!p || p.opinion !== l.opinion)) bits.push('<span class="db-rec-op">의견: ' + esc(l.opinion) + '</span>');
      if ((l.next_check_date || '') !== (l.prev_next_check_date || '')) bits.push('다음 확인일 ' + esc(l.prev_next_check_date || '없음') + ' → ' + esc(l.next_check_date || '없음'));
      return '<li><span class="t">' + esc(at(l.handled_at)) + '</span> ' + esc(l.handler_name || '') + (x.past ? ' <span class="db-rec-prev">이전 회차</span>' : '') + '<br>' +
        esc(l.prev_status_cd ? (nr.LABEL[l.prev_status_cd] || l.prev_status_cd) : '기록 없음') + ' → <span class="to">' + esc(nr.LABEL[l.status_cd] || l.status_cd || '') + '</span>' +
        (bits.length ? '<br>' + bits.join(' · ') : '') + '</li>';
    }).join('');
    return '<details class="db-rec-hist"' + (open ? ' open' : '') + '><summary>기록 이력 ' + rows.length + '건 보기</summary><ol>' + li +
      (hist && hist.truncated ? '<li class="db-rec-more">오래된 기록은 보이지 않을 수 있습니다(최근 200건까지).</li>' : '') + '</ol></details>';
  }

  function formHtml(it, v, cur) {
    const P = v.idp || '';   // 같은 화면에 기록 절이 둘일 때(현황판 + 팝업) id가 겹치지 않게 앞글자를 붙인다. 기본 ''
    const base = nr.blankDraft(cur), d = v.draft || base, busy = !!v.busy, errs = v.errs || {};
    const dirty = !!v.draft && !nr.sameDraft(v.draft, base), n = nr.needs(d.status), def = logic.recStatus(d.status);
    const tomorrow = ymdPlus(v.today, 1), maxDay = ymdPlus(v.today, nr.NEXT_MAX_DAYS);
    const radios = logic.REC_STATUSES.map(function (s) {
      return '<label><input type="radio" name="' + P + 'rec-state" value="' + s.code + '"' + (d.status === s.code ? ' checked' : '') + (busy ? ' disabled' : '') + '><span>' + esc(s.label) + '</span></label>';
    }).join('');
    const ro = busy ? ' readonly' : '';
    let h = '<div class="db-rec-form" id="' + P + 'db-rec-form" aria-busy="' + (busy ? 'true' : 'false') + '">' +
      '<span class="l full" id="' + P + 'db-rec-state-l">담당자 판정' + req('req') + '</span>' +
      '<div class="full"><div class="db-rec-seg" role="radiogroup" aria-labelledby="' + P + 'db-rec-state-l" aria-required="true"' + inv(errs.status) + ' aria-describedby="' + P + 'db-rec-state-help ' + P + 'db-rec-state-err">' + radios + '</div>' +
      '<p class="db-rec-help" id="' + P + 'db-rec-state-help" aria-live="polite">' + esc(def ? def.help : '') + '</p>' + errP(P, 'state', errs.status) + '</div>';
    if (n.next !== 'hide') {
      h += '<label class="l" for="' + P + 'db-rec-next">다음 확인일' + req(n.next) + '</label><div><input type="date" id="' + P + 'db-rec-next" value="' + esc(d.next || '') + '"' +
        (tomorrow ? ' min="' + esc(tomorrow) + '"' : '') + (maxDay ? ' max="' + esc(maxDay) + '"' : '') + (n.next === 'req' ? ' aria-required="true"' : '') +
        inv(errs.next) + ' aria-describedby="' + P + 'db-rec-next-err"' + ro + '>' + errP(P, 'next', errs.next) + '</div>';
    }
    h += '<label class="l" for="' + P + 'db-rec-op">담당자 의견' + req(n.opinion) + '</label><div><textarea id="' + P + 'db-rec-op" rows="3" placeholder="무엇을 보고 판단했는지 적으세요. 예: 10-20 재공고 게시판 확인"' +
      (n.opinion === 'req' ? ' aria-required="true"' : '') + inv(errs.opinion) + ' aria-describedby="' + P + 'db-rec-op-err"' + ro + '>' + esc(d.opinion || '') + '</textarea>' + errP(P, 'op', errs.opinion) + '</div>';
    h += '<p class="db-rec-who full">' + (v.who ? '기록자 ' + esc(v.who) + '(로그인 사용자)' : '기록자는 로그인 사용자입니다') + ' · 저장하면 지금 시각과 함께 이력에 남습니다.</p>';
    if (v.err) h += '<p class="db-rec-alert full" id="' + P + 'db-rec-alert" role="alert" tabindex="-1">' + esc(v.err) + '</p>';
    if (v.cf) {
      h += '<div class="db-confirm full" role="group" aria-labelledby="' + P + 'db-rec-cf-t"><span id="' + P + 'db-rec-cf-t">' +
        (v.cf.stage ? '진행 중인 제안(' + esc(v.cf.stage) + ' 단계)이 있습니다. ' : '진행 중인 제안이 있습니다. ') + esc(def ? def.label : '') + ' 상태로 기록할까요?</span>' +
        '<div class="db-act-row"><button type="button" class="db-next" id="' + P + 'db-rec-cf-yes">기록하기</button><button type="button" id="' + P + 'db-rec-cf-no">취소</button></div></div>';
    } else {
      h += '<div class="db-rec-btns full"><button type="button" class="db-next" id="' + P + 'db-rec-save"' + (busy ? ' disabled' : '') + '>' + (busy ? '저장 중…' : '기록 저장') + '</button>' +
        '<button type="button" id="' + P + 'db-rec-revert"' + (dirty ? '' : ' hidden') + '>되돌리기</button>' +
        '<span class="db-rec-dirty" id="' + P + 'db-rec-dirty"' + (dirty ? '' : ' hidden') + '>저장하지 않은 내용이 있습니다.</span></div>';
    }
    return h + '</div>';
  }

  // v = { state:'offline'|'loading'|'error'|'denied'|'ok', code, hist, cur, canEdit, draft, errs, err, busy, cf:{stage}|null, who, today, rv, histOpen }
  nr.sectionHtml = function (it, v) {
    v = v || {};
    const P = v.idp || '';
    const open = v.nested
      ? '<div class="db-rec" id="' + P + 'db-rec"><div class="db-sub-h"><h4 id="' + P + 'db-rec-h">공고 상태 기록</h4>' + (it ? '<small>' + nr.scopeHtml(it) + '</small>' : '') + '</div>'
      : '<div class="db-sec db-rec" id="' + P + 'db-rec"><h3>공고 상태 기록' + (it ? '<small>' + nr.scopeHtml(it) + '</small>' : '') + '</h3>';
    const st = v.state || 'offline';
    if (st === 'offline') return open + '<p class="db-empty">서버에 연결하면 공고 상태 기록을 보고 적을 수 있습니다.</p></div>';
    if (st === 'loading') return open + '<p class="db-empty" aria-busy="true">불러오는 중입니다…</p></div>';
    if (st === 'denied') return open + '<p class="db-empty">' + (v.code === 401 ? '로그인이 필요합니다. 다시 로그인하세요.' : '공고 상태 기록을 볼 권한이 없습니다. 로그인 사번과 권한을 확인하세요.') + '</p></div>';
    if (st === 'error') return open + '<p class="db-empty">공고 상태 기록을 불러오지 못했습니다. <button type="button" id="' + P + 'db-rec-retry">다시 시도</button></p></div>';
    const cur = v.cur || { roundSeq: null, baseRev: 0, latest: null, closed: false }, a = nr.autoOf(it);
    const closedUi = nr.isClosed(v.rv && v.rv.item);                       // 서버 current가 닫힘으로 낸 경우만 입력을 막는다
    const L = closedUi || !cur.closed ? cur.latest : null;                 // 자료가 넘어간 옛 NO_BID 회차는 이력에만 둔다
    const pending = !!(it && it.overdue && v.rv && v.rv.view === 'pending');
    const rec = L
      ? esc(nr.LABEL[L.status_cd] || L.status_cd || '') + (L.next_check_date ? ' · 다음 확인 ' + mono(L.next_check_date) : '') +
        (closedUi ? ' <span class="db-why">· 이번 회차는 닫혔습니다</span>' : '') + (pending ? ' <span class="db-why">· 미처리로 셉니다</span>' : '')
      : '<span class="db-why">아직 기록이 없습니다.' + (it && it.overdue ? ' 이 회차는 미처리로 셉니다.' : '') + '</span>';
    let h = open + '<dl class="db-dl"><dt>공고 자료</dt><dd>' + esc(a.text) + '</dd><dt>담당자 기록</dt><dd>' + rec + '</dd>' +
      (L ? '<dt>마지막 기록</dt><dd>' + esc(L.handler_name || '') + ' · ' + mono(at(L.handled_at)) + '</dd>' : '') + '</dl>';
    if (!v.canEdit && (v.listState === 'error' || v.listState === 'denied')) {   // 목록 요청이 실패한 것을 '영업팀이 기록합니다'로 오해하지 않게(qa N-3, 문구 P2-3)
      h += '<p class="db-empty">' + (v.listState === 'error' ? '공고 상태 목록을 불러오지 못해 기록 칸을 열지 않았습니다. 화면을 새로 고치세요.'
        : (v.listCode === 401 ? '로그인이 필요합니다. 다시 로그인하면 기록 칸이 열립니다.' : '기록 권한을 확인하지 못했습니다. 로그인 사번과 권한을 확인하세요.')) + '</p>';
    }
    else if (!v.canEdit) h += '<p class="db-empty">공고 상태는 영업팀이 기록합니다. 다른 팀은 기록을 볼 수 있습니다.</p>';
    else if (closedUi) h += '<p class="db-rec-who" id="' + P + 'db-rec-closed">' + esc(nr.CLOSED_LINE) + '</p>';
    else h += formHtml(it, v, cur);
    return h + historyHtml(v.hist, v.histOpen) + '</div>';
  };

  if (isNode) module.exports = nr; else root.noticerec = nr;
})(typeof self !== 'undefined' ? self : this);
