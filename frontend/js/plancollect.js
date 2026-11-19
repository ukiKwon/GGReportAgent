(function (root) {
  'use strict';
  // 사업계획 수집 요청 처리 화면(시스템 관리 view 'collect' = 개발부서) + 사이드바 대기 배지.
  // 서버: PlanCollectController — GET /plan-collect/requests?scope=open|closed, GET /plan-collect/admin/status,
  //   POST /plan-collect/export.csv · mark-running · run · exclude · fail (본문 JSON {req_keys:[…], reason}).
  // 규격: handoff/agents/design-reviewer/2026-11-17_1509_af34bf60.md 6-1·6-4. 서버 원문 문구는 화면에 내지 않는다 — 상태 코드·결과 코드 → 아래 문구 표로만 고른다.
  // 순수 부분(…Html·…Text·selection 등)은 node 시험 대상, DOM 부분(mount 이하)은 브라우저 전용. 모듈 이름은 admin.js 의 collect()(격자 수집)와 겹치지 않게 plancollect.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const esc = logic.esc;
  const pc = {};
  function PL() { return isNode ? require('./plans.js') : root.plans; }
  function str(v) { return v == null ? '' : String(v); }
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  pc.NAV_ID = 'admin:collect';
  pc.MAX_KEYS = 50;      // 서버 PlanCollectService.MAX_KEYS
  pc.MAX_RUN = 10;       // 서버 MAX_RUN_KEYS
  pc.REASON_MAX = 100;   // 서버 REASON_MAX(규격의 200자가 아니라 서버 상한)
  pc.VIEWS = [['open', '처리 대기'], ['closed', '끝난 요청'], ['all', '모두']];
  pc.isOpen = function (st) { return st === 'REQUESTED' || st === 'RUNNING'; };

  const CLOSED_LABEL = { APPLIED: '반영', FAILED: '실패', EXCLUDED: '제외', CANCELED: '취소' };
  const MODE_LABEL = { MANUAL: '목록으로 표시', AGENT: '수집 서버로 보냄' };
  const RUN_RESULT = { AGENT_UNREACHABLE: '연결 안 됨 또는 응답 없음', AGENT_REJECTED: '수집 서버가 요청을 받지 않음', BAD_RESPONSE: '수집 서버 응답을 읽지 못함' };
  // 처리 결과 코드(서버 results[].result_cd) → 문구
  const RESULT = {
    OK: '처리했습니다', SENT: '수집 서버로 보냈습니다',
    NOT_FOUND: '요청을 찾지 못했습니다',
    NOT_REQUESTED: '이미 다른 사람이 처리해 요청됨 상태가 아닙니다',
    NOT_OPEN: '이미 끝난 요청입니다',
    NOT_RUNNING: '수집 중 상태가 아닙니다',
    CONFLICT: '다른 사람이 방금 처리했습니다',
    TOO_SOON: '같은 기관을 10분 안에 다시 실행할 수 없습니다. 잠시 뒤 다시 누르세요.',
    AGENT_UNREACHABLE: '수집 서버에 연결하지 못했습니다(연결 안 됨 또는 응답 없음)',
    AGENT_REJECTED: '수집 서버가 요청을 받지 않았습니다',
    BAD_RESPONSE: '수집 서버 응답을 읽지 못했습니다',
    BLOCKED_NO_URL: '수집 서버 연결 주소가 설정되지 않았습니다',
    BLOCKED_BAD_CONFIG: '수집 서버 연결 설정이 올바르지 않습니다',
  };
  pc.resultText = function (code) { const c = str(code); return own(RESULT, c) ? RESULT[c] : '처리하지 못했습니다'; };
  // 결과 문구를 쉼표로 이어 붙이는 자리(표시·실행 결과)용 명사구 — 마침표 없음. 한 건 처리(제외·실패)는 문장형 resultText 를 쓴다.
  const RESULT_SHORT = {
    NOT_FOUND: '요청을 찾지 못함', NOT_REQUESTED: '이미 다른 사람이 처리함', NOT_OPEN: '이미 끝난 요청', NOT_RUNNING: '수집 중 상태가 아님',
    CONFLICT: '다른 사람이 방금 처리함', TOO_SOON: '10분 안에 다시 실행할 수 없음',
    AGENT_UNREACHABLE: '수집 서버 연결 안 됨 또는 응답 없음', AGENT_REJECTED: '수집 서버가 받지 않음', BAD_RESPONSE: '수집 서버 응답을 읽지 못함',
    BLOCKED_NO_URL: '수집 서버 주소 설정 없음', BLOCKED_BAD_CONFIG: '수집 서버 설정 오류',
  };
  pc.resultShort = function (code) { const c = str(code); return own(RESULT_SHORT, c) ? RESULT_SHORT[c] : '처리하지 못함'; };
  pc.okCount = function (results) { return arr(results).filter(function (r) { return r && (r.result_cd === 'OK' || r.result_cd === 'SENT'); }).length; };
  pc.failReasons = function (results) {   // 성공이 아닌 결과 → 문구(중복 제거, 처음 나온 순)
    const out = [];
    arr(results).forEach(function (r) {
      const c = r && r.result_cd;
      if (c === 'OK' || c === 'SENT') return;
      const t = pc.resultShort(c);
      if (out.indexOf(t) < 0) out.push(t);
    });
    return out;
  };

  // HTTP 오류 → 문구. code = 서버 detail.code(있을 때만: BUSY·BLOCKED_NO_URL·BLOCKED_BAD_CONFIG). 서버 message 는 쓰지 않는다.
  pc.errorText = function (status, code, ctx) {   // ctx 'keys' = 선택한 요청만 보내는 동작(내려받기·수집 중 표시·실행) — 사유 칸이 없다
    const s = Number(status) || 0, c = str(code);
    if (s === 0) return '요청을 보내지 못했습니다(연결 실패). 잠시 뒤 다시 누르세요.';
    if (s === 401) return '로그인이 필요합니다. 사번으로 다시 로그인해 주세요.';
    if (s === 403) return '이 화면은 시스템 관리 권한이 있는 개발부서만 씁니다(403). 로그인 사번과 권한을 확인하세요.';
    if (s === 400 && ctx === 'keys') return '선택한 요청을 확인하세요(400).';
    if (s === 400 && c === 'REASON_REQUIRED') return '사유를 적으세요.';
    if (s === 400 && c === 'REASON_TOO_LONG') return '사유는 ' + pc.REASON_MAX + '자 이내로 적으세요.';
    if (s === 400 && c === 'REASON_FORMAT') return '사유에 쓸 수 없는 글자가 있습니다. 지우고 다시 누르세요.';
    if (s === 400 && c === 'REASON_PII') return '사유에 개인정보(전화번호·주민번호·이메일 등)가 들어 있습니다. 지우고 다시 누르세요.';
    if (s === 400) return '선택한 요청이나 사유를 확인하세요(400). 사유에 개인정보가 들어 있으면 지우고 다시 누르세요.';
    if (s === 409 && c === 'BUSY') return '다른 실행이 진행 중입니다. 잠시 뒤 다시 누르세요.';
    if (s === 409) return '다른 사람이 방금 이 요청을 처리했습니다. 목록을 다시 불러왔습니다.';
    if (s === 503 && c === 'BLOCKED_NO_URL') return '수집 서버 연결 주소가 설정되지 않아 실행할 수 없습니다. 목록을 내려받아 진행하세요.';
    if (s === 503 && c === 'BLOCKED_BAD_CONFIG') return '수집 서버 연결 설정이 올바르지 않아 실행을 막았습니다. 설정을 확인하세요.';
    if (s === 503) return '지금은 이 기능을 쓸 수 없습니다(503). 잠시 뒤 다시 누르세요.';
    return '요청을 처리하지 못했습니다(' + s + '). 잠시 뒤 다시 누르세요.';
  };
  pc.reasonCheck = function (reason) {
    const t = str(reason).trim();
    if (!t) return '사유를 적으세요.';
    if (t.length > pc.REASON_MAX) return '사유는 ' + pc.REASON_MAX + '자 이내로 적으세요.';
    return '';
  };
  pc.limitText = function (max) { return '한 번에 ' + max + '곳까지 처리할 수 있습니다. 선택을 줄이세요.'; };
  pc.csvFlash = function (all, req) {
    return all + '곳 목록을 내려받았습니다.' + (req > 0 ? ' 수집 PC로 옮긴 뒤 [선택한 ' + req + '곳 수집 중으로 표시]를 누르세요.' : '');
  };
  pc.markFlash = function (total, results) {
    const ok = pc.okCount(results), bad = total - ok;
    if (bad <= 0) return total + '곳을 \'수집 중\'으로 표시했습니다. 자료가 들어오면 자동으로 \'반영됨\'이 되고 요청자에게 쪽지가 갑니다.';
    return (ok ? ok + '곳을 \'수집 중\'으로 표시했습니다. ' : '') + bad + '곳은 건너뛰었습니다 — ' + pc.failReasons(results).join(', ') + '. 목록을 다시 불러왔습니다.';
  };
  pc.runFlash = function (total, results) {
    const ok = pc.okCount(results), bad = total - ok;
    if (bad <= 0) return total + '곳을 수집 서버로 보냈습니다(수집 중). 자료가 들어오면 자동으로 \'반영됨\'이 되고 요청자에게 쪽지가 갑니다.';
    return total + '곳 중 ' + ok + '곳을 보냈습니다(수집 중). ' + bad + '곳은 보내지 못했습니다 — ' + pc.failReasons(results).join(', ') + '. 목록을 다시 불러왔습니다.';
  };
  pc.closeFlash = function (kind, name, n) {
    return name + (kind === 'exclude' ? ' 요청을 제외했습니다.' : ' 수집을 실패로 표시했습니다.') + ' 요청자 ' + n + '명에게 쪽지로 알렸습니다.';
  };
  pc.badgeSr = function (n) { return '수집 요청 대기 기관 ' + n + '곳'; };

  // ── 날짜 ──
  function ymdMs(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
  pc.todayKst = function (nowMs) { return new Date((nowMs == null ? Date.now() : nowMs) + 9 * 3600 * 1000).toISOString().slice(0, 10); };
  // 서버 시각(ISO) → today(한국 날짜 'YYYY-MM-DD')까지 지난 일수. 해석 못 하면 null, 미래면 0. 색은 칠하지 않는다(규격 P3-1).
  pc.daysSince = function (iso, today) {
    const a = ymdMs(PL().kstYmd(iso)), b = ymdMs(today);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 86400000));
  };

  // ── 선택·단추 ──
  pc.requestedKeys = function (items) { return arr(items).filter(function (it) { return it.status_cd === 'REQUESTED'; }).map(function (it) { return it.req_key; }); };
  // all = 선택한 열린 요청(목록 내려받기), req = 그중 요청됨(수집 중 표시·수집 실행). 이미 닫힌 행·없는 키는 세지 않는다.
  pc.selection = function (items, sel) {
    const want = arr(sel), all = [], req = [];
    arr(items).forEach(function (it) {
      if (want.indexOf(it.req_key) < 0) return;
      if (it.status_cd === 'REQUESTED') { all.push(it.req_key); req.push(it.req_key); }
      else if (it.status_cd === 'RUNNING') all.push(it.req_key);
    });
    return { all: all, req: req };
  };
  pc.btnState = function (st) {
    const s = pc.selection(st.items, st.sel), busy = str(st.busy);
    const out = {
      csv: { html: busy === 'csv' ? '내려받는 중…' : '선택한 ' + mono(s.all.length) + '곳 목록 내려받기(CSV)', disabled: !s.all.length || s.all.length > pc.MAX_KEYS || !!busy },
      mark: { html: busy === 'mark' ? '표시하는 중…' : '선택한 ' + mono(s.req.length) + '곳 수집 중으로 표시', disabled: !s.req.length || s.req.length > pc.MAX_KEYS || !!busy },
    };
    if (st.agent) out.run = { html: busy === 'run' ? '실행 중…' : '선택한 ' + mono(s.req.length) + '곳 수집 실행', disabled: !s.req.length || s.req.length > pc.MAX_RUN || !!busy };
    out.hint = s.all.length > pc.MAX_KEYS ? pc.limitText(pc.MAX_KEYS)
      : (st.agent && s.req.length > pc.MAX_RUN ? '수집 실행은 한 번에 ' + pc.MAX_RUN + '곳까지 보낼 수 있습니다. 선택을 줄이세요.' : '');
    return out;
  };
  pc.countHtml = function (items, view) {
    const c = { REQUESTED: 0, RUNNING: 0, FAILED: 0 };
    arr(items).forEach(function (it) { if (own(c, it.status_cd)) c[it.status_cd] += 1; });
    if (view === 'closed') return '끝난 요청 <b>' + arr(items).length + '</b>건(최근 순' + (arr(items).length >= 200 ? ', 200건까지' : '') + ')';
    const p = ['요청됨 <b>' + c.REQUESTED + '</b>곳', '수집 중 <b>' + c.RUNNING + '</b>곳'];
    if (c.FAILED) p.push('실패 <b>' + c.FAILED + '</b>곳');
    return p.join(' · ');
  };
  pc.viewHtml = function (view) {
    return '<legend class="sr-only">요청 상태</legend>' + pc.VIEWS.map(function (p) {
      return '<label><input type="radio" name="cr-view" value="' + p[0] + '"' + (p[0] === view ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
    }).join('');
  };
  pc.toolbarHtml = function (st) {
    const b = pc.btnState(st);
    function btn(k, extra) {
      return '<button type="button" id="cr-' + k + '"' + extra + (b[k].disabled ? ' disabled' : '') + '>' + b[k].html + '</button>';
    }
    return '<div class="ad-toolbar cr-toolbar"><fieldset class="db-per" id="cr-view">' + pc.viewHtml(st.view) + '</fieldset>' +
      btn('csv', ' class="pp-next-btn" data-cr="csv"') + btn('mark', ' data-cr="mark"') +
      (b.run ? btn('run', ' data-cr="run-ask"') : '') +   // 설정이 있을 때만 DOM 에 그린다(숨김·안내 없음, 규격 P2-2)
      '<span class="ad-note" id="cr-limit"' + (b.hint ? '' : ' hidden') + '>' + esc(b.hint || '') + '</span>' +
      '<span class="ad-count" id="cr-count">' + pc.countHtml(st.items, st.view) + '</span></div>';
  };
  pc.runAskHtml = function (n) {
    return '<div class="hc-confirmbox" id="cr-run-ask" role="group" aria-labelledby="cr-run-ask-t"><p id="cr-run-ask-t">선택한 ' + mono(n) +
      '곳의 기관 ID·기관 이름·이전 출처 도메인을 망 밖 수집 서버로 보냅니다. 요청자 이름·사번은 보내지 않습니다. 보낸 뒤에는 취소할 수 없습니다.</p>' +
      '<div class="hc-actions"><button type="button" data-cr="run-do">수집 실행</button><button type="button" data-cr="run-cancel">취소</button></div></div>';
  };

  // ── 표 ──
  pc.domainCell = function (list) {
    const l = arr(list).map(str).filter(Boolean);
    if (!l.length) return '<span class="ad-note">없음</span>';
    return '<span class="v" title="' + esc(l.join(', ')) + '">' + esc(l[0]) + '</span>' + (l.length > 1 ? '<span class="db-why"> 외 ' + mono(l.length - 1) + '</span>' : '');
  };
  function dateCell(it, today) {
    const first = str(it.first_requested_on) || PL().kstYmd(it.first_requested_at);
    let sub = '';
    if (it.status_cd === 'REQUESTED') { const d = pc.daysSince(it.first_requested_at, today); if (d !== null) sub = '요청 뒤 ' + mono(d) + '일'; }
    else if (it.status_cd === 'RUNNING') { const d = pc.daysSince(it.run_at, today); if (d !== null) sub = '내보낸 뒤 ' + mono(d) + '일'; }
    else if (own(CLOSED_LABEL, str(it.status_cd)) && it.closed_at) sub = CLOSED_LABEL[it.status_cd] + ' ' + mono(PL().kstYmd(it.closed_at));
    return '<td>' + (first ? mono(first) : '') + (sub ? '<span class="cr-sub">' + sub + '</span>' : '') + '</td>';
  }
  // it = GET /plan-collect/requests 의 한 건, o = { checked, today, sub }
  pc.rowHtml = function (it, o) {
    o = o || {};
    const key = str(it.req_key), id = str(it.institution_id), name = str(it.name_ko) || id;
    const open = pc.isOpen(it.status_cd);
    const ck = open
      ? '<td class="cr-ck"><label><input type="checkbox" name="cr-sel" value="' + esc(key) + '" aria-label="' + esc(name + ' 선택') + '"' + (o.checked ? ' checked' : '') + '></label></td>'
      : '<td class="cr-ck"></td>';
    const inst = '<td class="cr-inst"><span class="cr-nm">' + esc(name) + '</span>' + (o.sub ? '<span class="cr-sub">' + esc(o.sub) + '</span>' : '') + '</td>';
    const subs = [];
    if ((it.status_cd === 'FAILED' || it.status_cd === 'EXCLUDED') && str(it.close_reason).trim()) subs.push('사유: ' + esc(it.close_reason));
    if (it.status_cd === 'REQUESTED' && own(RUN_RESULT, str(it.run_result_cd))) subs.push('직전 실행: ' + esc(RUN_RESULT[it.run_result_cd]));
    if (it.status_cd === 'RUNNING') {
      const t = [str(it.run_by_name), own(MODE_LABEL, str(it.run_mode)) ? MODE_LABEL[it.run_mode] : ''].filter(Boolean).map(esc).join(' · ');
      if (t) subs.push(t);
    }
    const status = '<td>' + PL().reqBadgeHtml(it.status_cd) + subs.map(function (s) { return '<span class="cr-sub">' + s + '</span>'; }).join('') + '</td>';
    const names = arr(it.requester_names).map(str);
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ' 외 ' + (names.length - 4) + '명' : '');
    const who = '<td class="cr-who">' + mono(Number(it.requester_count) || 0) + '명' + (shown ? '<span class="cr-sub">' + esc(shown) + '</span>' : '') + '</td>';
    const last = str(it.last_import_at) ? PL().kstYmd(it.last_import_at) : '';
    const ops = it.status_cd === 'REQUESTED'
      ? '<button type="button" data-cr="ask-exclude" data-key="' + esc(key) + '" aria-label="' + esc(name + ' 제외') + '">제외</button>'
      : it.status_cd === 'RUNNING'
        ? '<button type="button" data-cr="ask-fail" data-key="' + esc(key) + '" aria-label="' + esc(name + ' 실패로 표시') + '">실패로 표시</button>' : '';
    return '<tr data-req="' + esc(key) + '" data-st="' + esc(it.status_cd) + '">' + ck + inst + status + who + dateCell(it, o.today) +
      '<td class="cr-dom">' + pc.domainCell(it.prev_domains) + '</td><td>' + (last ? mono(last) : '<span class="ad-note">없음</span>') + '</td><td class="ad-ops">' + ops + '</td></tr>';
  };
  // ask = { kind:'exclude'|'fail', key, reason, invalid }, o = { busy }
  pc.askRowHtml = function (it, ask, o) {
    const ex = ask.kind === 'exclude', name = str(it.name_ko) || str(it.institution_id), n = Number(it.requester_count) || 0;
    const msg = ex ? esc(name) + ' 요청을 제외합니다. 요청자 ' + mono(n) + '명에게 사유가 보입니다.'
      : esc(name) + ' 수집을 실패로 표시합니다. 요청자 ' + mono(n) + '명에게 쪽지와 사유가 갑니다.';
    const busy = !!(o && o.busy);
    return '<tr class="cr-ask" data-req="' + esc(it.req_key) + '"><td colspan="8"><div class="hc-confirmbox" role="group" aria-labelledby="cr-ask-t">' +
      '<p id="cr-ask-t">' + msg + '</p>' +
      '<label class="hc-lab">사유(필수, ' + pc.REASON_MAX + '자 이내)<input type="text" id="cr-reason" maxlength="' + pc.REASON_MAX + '" autocomplete="off" value="' + esc(ask.reason) + '"' +
      (ask.invalid ? ' aria-invalid="true"' : '') + ' aria-describedby="cr-ask-hint"></label>' +
      '<p class="hc-hint" id="cr-ask-hint">사유는 요청한 사람에게 보입니다. 개인정보를 적지 마세요.</p>' +
      '<div class="hc-actions"><button type="button" class="pp-danger" data-cr="do"' + (busy ? ' disabled' : '') + '>' +
      (busy ? '처리 중…' : (ex ? '제외하기' : '실패로 표시하기')) + '</button><button type="button" data-cr="cancel"' + (busy ? ' disabled' : '') + '>취소</button></div></div></td></tr>';
  };
  pc.emptyHtml = function (view) {
    return '<p class="ad-empty">' + (view === 'closed' ? '끝난 요청이 아직 없습니다.' : view === 'all' ? '수집 요청이 아직 없습니다.'
      : '처리할 수집 요청이 없습니다. 영업부서가 기관 사업계획 화면에서 [수집 요청]을 누르면 여기에 모입니다.') + '</p>';
  };
  pc.tableHtml = function (st) {
    const items = arr(st.items), sel = arr(st.sel), rk = pc.requestedKeys(items);
    const allOn = rk.length > 0 && rk.every(function (k) { return sel.indexOf(k) >= 0; });
    const head = '<thead><tr><th scope="col" class="cr-ck">' +
      (rk.length ? '<label><input type="checkbox" id="cr-all" aria-label="요청됨 기관 모두 선택"' + (allOn ? ' checked' : '') + '></label>' : '<span class="sr-only">선택</span>') + '</th>' +
      '<th scope="col">기관</th><th scope="col">상태</th><th scope="col">요청자</th><th scope="col">요청일 · 경과</th><th scope="col">이전 출처</th><th scope="col">마지막 반입</th>' +
      '<th scope="col"><span class="sr-only">작업</span></th></tr></thead>';
    const rows = items.map(function (it) {
      return pc.rowHtml(it, { checked: sel.indexOf(it.req_key) >= 0, today: st.today, sub: typeof st.subOf === 'function' ? st.subOf(it.institution_id) : '' }) +
        (st.ask && st.ask.key === it.req_key ? pc.askRowHtml(it, st.ask, { busy: st.busy === 'close' }) : '');
    }).join('');
    return '<table class="ad-table cr-table" id="cr-table" tabindex="-1"><caption class="sr-only">사업계획 수집 요청 목록(기관 단위)</caption>' + head + '<tbody>' + rows + '</tbody></table>';
  };
  // st = { view, items, agent, load:'idle'|'loading'|'ok'|'error'|'offline', code, sel, ask, runAsk, busy, today, subOf }
  pc.screenHtml = function (st) {
    if (st.load === 'offline') return '<p class="ad-empty">서버에 연결되면 수집 요청을 볼 수 있습니다.</p>';
    if (st.load === 'idle' || st.load === 'loading') return '<p class="ad-empty" aria-busy="true">수집 요청을 불러오는 중입니다…</p>';
    if (st.load === 'error') {
      if (st.code === 401 || st.code === 403) return '<p class="ad-empty">' + esc(pc.errorText(st.code, '')) + '</p>';
      return '<p class="ad-empty">수집 요청을 불러오지 못했습니다(' + esc(st.code || '연결 실패') + '). <button type="button" data-cr="reload">다시 불러오기</button></p>';
    }
    return pc.toolbarHtml(st) + (st.runAsk && st.agent ? pc.runAskHtml(pc.selection(st.items, st.sel).req.length) : '') +
      (arr(st.items).length ? pc.tableHtml(st) : pc.emptyHtml(st.view));
  };

  // ── DOM: 화면 ──────────────────────────────────────────────────────
  let H = null, S = null, loadSeq = 0;
  function serverOk() { try { return !!(root.store && root.store.isServerMode()) && !!((root.store.loadSession() || {}).emp); } catch (e) { return false; } }
  function whoNow() { try { return String((root.store.loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  function errCode(j) { return j && j.detail && typeof j.detail === 'object' ? str(j.detail.code) : ''; }
  function call(method, url, body) {
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, status: 0, code: '' });
    const init = { method: method };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, data: j, code: r.ok ? '' : errCode(j) }; });
    }).catch(function () { return { ok: false, status: 0, code: '' }; });
  }
  function subOf(id) {   // 기관 종류·지역은 서버 응답에 없어 화면의 기관 목록에서 찾는다(없으면 줄을 뺀다)
    try {
      const list = root.render && root.render.allInstitutions ? root.render.allInstitutions() : (root.institutions || []);
      const rec = list.filter(function (r) { return String(r.institutionId || '') === id; })[0];
      if (!rec || !root.dashboard) return '';
      return [root.dashboard.kindOfRec(rec), root.dashboard.regionName(rec.region)].filter(Boolean).join(' · ');
    } catch (e) { return ''; }
  }
  function say(t, bad) { if (H && H.say) H.say(t, bad); }
  function focusSel(sel) { const el = H && H.body.querySelector(sel); if (el && el.focus) { el.focus(); return true; } return false; }
  function paintHint() {
    if (!S || !S.agent || !H.head) return;
    const hint = H.head.querySelector('.dg-hint');
    if (hint && hint.textContent.indexOf('수집 서버 연결됨') < 0) hint.textContent += ' · 수집 서버 연결됨(시험용)';
  }
  function paint() {
    if (!H || !S) return;
    S.subOf = subOf;
    H.body.innerHTML = pc.screenHtml(S);
    paintHint();
  }
  function syncSel() {   // 체크·진행 중 표시처럼 화면을 다시 그리지 않고 단추 글자·잠김만 맞춘다(포커스를 잃지 않게)
    if (!H || !S) return;
    const b = pc.btnState(S);
    ['csv', 'mark', 'run'].forEach(function (k) {
      const el = H.body.querySelector('#cr-' + k);
      if (el && b[k]) { el.innerHTML = b[k].html; el.disabled = b[k].disabled; }
    });
    const lim = H.body.querySelector('#cr-limit');
    if (lim) { lim.textContent = b.hint || ''; lim.hidden = !b.hint; }
    const all = H.body.querySelector('#cr-all');
    if (all) { const rk = pc.requestedKeys(S.items); all.checked = rk.length > 0 && rk.every(function (k) { return S.sel.indexOf(k) >= 0; }); }
  }
  function closeRunAsk() {   // 선택이 바뀌었거나 다른 동작을 시작해 확인 상자의 개수가 낡았을 때 닫는다. 포커스가 상자 안에 있었으면 [수집 실행]으로
    if (!S || !S.runAsk) return;
    S.runAsk = false;
    const box = H && H.body.querySelector('#cr-run-ask');
    const inside = !!(box && document.activeElement && box.contains(document.activeElement));
    if (box) box.remove();
    if (inside) focusSel('#cr-run');
  }
  function load(after) {
    if (!S) return Promise.resolve();
    const my = ++loadSeq, st = S;
    if (st.load !== 'ok') { st.load = 'loading'; paint(); }
    const scopes = st.view === 'all' ? ['open', 'closed'] : [st.view];
    return Promise.all(scopes.map(function (sc) { return call('GET', '/plan-collect/requests?scope=' + sc); })).then(function (rs) {
      if (my !== loadSeq || st !== S) return;
      const bad = rs.filter(function (r) { return !r.ok; })[0];
      if (bad) { st.load = 'error'; st.code = bad.status; st.items = []; }
      else {
        st.load = 'ok'; st.code = 0;
        st.items = rs.reduce(function (a, r) { return a.concat(arr(r.data && r.data.items)); }, []);
        st.agent = rs.some(function (r) { return !!(r.data && r.data.agent_enabled); });
        st.today = pc.todayKst();
        const keys = st.items.map(function (it) { return it.req_key; });
        st.sel = st.sel.filter(function (k) { return keys.indexOf(k) >= 0; });
        if (scopes.indexOf('open') >= 0) pc.setBadge(pc.requestedKeys(st.items).length);
      }
      paint();
      if (st.refocus === 'view') { st.refocus = ''; focusSel('input[name="cr-view"]:checked'); }
      if (after) after();
    });
  }
  function rowIndex(key) {
    const rows = Array.prototype.slice.call(H.body.querySelectorAll('tbody tr[data-req]:not(.cr-ask)'));
    for (let i = 0; i < rows.length; i += 1) { if (rows[i].getAttribute('data-req') === key) return i; }
    return 0;
  }
  function focusRowAt(i) {   // 처리한 행 자리로: 같은 자리의 행(위로 밀려 올라온 다음 행)의 첫 버튼 → 없으면 표 제목
    const rows = Array.prototype.slice.call(H.body.querySelectorAll('tbody tr[data-req]:not(.cr-ask)'));
    for (let j = Math.min(i, rows.length); j < rows.length; j += 1) {
      const b = rows[j].querySelector('button[data-cr^="ask-"]');
      if (b) { b.focus(); return; }
    }
    if (!focusSel('#cr-table')) focusSel('#cr-view input');
  }

  function openAsk(kind, key) {
    S.ask = { kind: kind, key: key, reason: '', invalid: false };
    S.runAsk = false;
    paint();
    focusSel('#cr-reason');
  }
  function focusAskBtn(a) {   // 선택자에 req_key 를 이어 붙이지 않고 data-key 를 값으로 비교한다
    const bs = H.body.querySelectorAll('button[data-cr="ask-' + a.kind + '"]');
    for (let i = 0; i < bs.length; i += 1) { if (bs[i].getAttribute('data-key') === a.key) { bs[i].focus(); return true; } }
    return false;
  }
  function closeAsk() {
    const a = S.ask;
    S.ask = null;
    paint();
    if (a && !focusAskBtn(a)) focusSel('#cr-table');   // 연 버튼으로 포커스를 돌려준다
  }
  function doClose() {
    const a = S && S.ask;
    if (!a || S.busy) return;
    const inp = H.body.querySelector('#cr-reason');
    if (inp) a.reason = inp.value;
    const bad = pc.reasonCheck(a.reason);
    if (bad) { a.invalid = true; paint(); say(bad, true); focusSel('#cr-reason'); return; }
    const it = S.items.filter(function (x) { return x.req_key === a.key; })[0] || {};
    const st = S, idx = rowIndex(a.key), ex = a.kind === 'exclude';
    a.invalid = false; st.busy = 'close'; paint(); say('');
    call('POST', ex ? '/plan-collect/exclude' : '/plan-collect/fail', { req_keys: [a.key], reason: a.reason.trim() }).then(function (r) {
      if (st !== S) return;
      st.busy = '';
      const res = r.ok ? arr(r.data && r.data.results)[0] || {} : null;
      if (res && res.result_cd === 'OK') {
        say(pc.closeFlash(a.kind, str(it.name_ko) || str(it.institution_id), Number(it.requester_count) || 0));
        st.ask = null;
        load(function () { focusRowAt(idx); });
        pc.refreshBadge(true);
        return;
      }
      if (r.ok) { say(pc.resultText(res && res.result_cd) + ' 목록을 다시 불러왔습니다.', true); st.ask = null; load(function () { focusRowAt(idx); }); pc.refreshBadge(true); return; }
      say(pc.errorText(r.status, r.code), true);
      if (r.status === 400) { a.invalid = true; paint(); focusSel('#cr-reason'); }
      else { st.ask = null; load(); }
    });
  }
  function doMark() {
    const s = pc.selection(S.items, S.sel);
    if (!s.req.length || S.busy) return;
    if (s.req.length > pc.MAX_KEYS) { say(pc.limitText(pc.MAX_KEYS), true); return; }
    const st = S;
    closeRunAsk(); st.busy = 'mark'; syncSel(); say('');
    call('POST', '/plan-collect/mark-running', { req_keys: s.req }).then(function (r) {
      if (st !== S) return;
      st.busy = '';
      if (!r.ok) { say(pc.errorText(r.status, r.code, 'keys'), true); syncSel(); if (r.status === 409) load(); return; }
      say(pc.markFlash(s.req.length, r.data && r.data.results));
      st.sel = [];
      load(function () { focusSel('#cr-table'); });
      pc.refreshBadge(true);
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  pc.filenameFrom = function (cd) {
    const m = /filename="?([A-Za-z0-9_.-]{1,80})"?/.exec(str(cd));
    return m && /\.csv$/i.test(m[1]) ? m[1] : 'plan_collect.csv';
  };
  function doCsv() {
    const s = pc.selection(S.items, S.sel);
    if (!s.all.length || S.busy) return;
    if (s.all.length > pc.MAX_KEYS) { say(pc.limitText(pc.MAX_KEYS), true); return; }
    const st = S;
    closeRunAsk(); st.busy = 'csv'; syncSel(); say('');
    fetch('/plan-collect/export.csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ req_keys: s.all }) })
      .then(function (r) {
        if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; }
        return r.blob().then(function (b) { return { blob: b, name: pc.filenameFrom(r.headers && r.headers.get ? r.headers.get('Content-Disposition') : '') }; });
      })
      .then(function (x) {
        download(x.blob, x.name);
        say(pc.csvFlash(s.all.length, s.req.length));   // 상태는 자동으로 바꾸지 않는다 — 파일이 실제로 넘어갔는지 시스템은 모른다. 선택은 그대로 둔다
      })
      .catch(function (e) { say(pc.errorText(e && e.status ? e.status : 0, '', 'keys'), true); })
      .then(function () { if (st !== S) return; st.busy = ''; syncSel(); });
  }
  function doRun() {
    const s = pc.selection(S.items, S.sel);
    if (!s.req.length || S.busy || !S.agent) return;
    if (s.req.length > pc.MAX_RUN) { say(pc.limitText(pc.MAX_RUN), true); return; }
    const st = S;
    st.runAsk = false; st.busy = 'run'; paint(); say('');
    call('POST', '/plan-collect/run', { req_keys: s.req }).then(function (r) {
      if (st !== S) return;
      st.busy = '';
      if (!r.ok) { say(pc.errorText(r.status, r.code, 'keys'), true); load(); return; }
      say(pc.runFlash(s.req.length, r.data && r.data.results));
      st.sel = [];
      load(function () { focusSel('#cr-table'); });
      pc.refreshBadge(true);
    });
  }

  function onClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('button[data-cr]') : null;
    if (!b || !S || b.disabled) return;
    const act = b.getAttribute('data-cr'), key = b.getAttribute('data-key');
    if (S.busy && (act === 'ask-exclude' || act === 'ask-fail' || act === 'run-ask')) return;   // 처리 중에는 새 확인 줄·상자를 열지 않는다
    switch (act) {
      case 'ask-exclude': openAsk('exclude', key); break;
      case 'ask-fail': openAsk('fail', key); break;
      case 'cancel': closeAsk(); break;
      case 'do': doClose(); break;
      case 'csv': doCsv(); break;
      case 'mark': doMark(); break;
      case 'run-ask': S.runAsk = true; S.ask = null; paint(); focusSel('button[data-cr="run-cancel"]'); break;
      case 'run-cancel': S.runAsk = false; paint(); focusSel('#cr-run'); break;
      case 'run-do': doRun(); break;
      case 'reload': load(); break;
      default: break;
    }
  }
  function onChange(e) {
    const t = e.target;
    if (!t || !S) return;
    if (t.name === 'cr-view') {
      S.view = pc.VIEWS.some(function (p) { return p[0] === t.value; }) ? t.value : 'open';
      S.sel = []; S.ask = null; S.runAsk = false; S.refocus = 'view';
      load();
    } else if (t.id === 'cr-all') {
      const rk = pc.requestedKeys(S.items);
      S.sel = t.checked ? S.sel.concat(rk.filter(function (k) { return S.sel.indexOf(k) < 0; })) : S.sel.filter(function (k) { return rk.indexOf(k) < 0; });
      Array.prototype.forEach.call(H.body.querySelectorAll('input[name="cr-sel"]'), function (box) { if (rk.indexOf(box.value) >= 0) box.checked = t.checked; });
      closeRunAsk(); syncSel();
    } else if (t.name === 'cr-sel') {
      const i = S.sel.indexOf(t.value);
      if (t.checked && i < 0) S.sel.push(t.value);
      if (!t.checked && i >= 0) S.sel.splice(i, 1);
      closeRunAsk(); syncSel();
    }
  }
  function onKey(e) {
    if (!S) return;
    if (e.key === 'Escape' && S.busy) return;   // 처리 중 응답이 오면 st.ask 를 지우므로 그사이 확인 줄을 닫고 새로 열지 못하게
    if (e.key === 'Escape' && S.ask) { e.preventDefault(); closeAsk(); }
    else if (e.key === 'Escape' && S.runAsk) { e.preventDefault(); S.runAsk = false; paint(); focusSel('#cr-run'); }
    else if (e.key === 'Enter' && e.target && e.target.id === 'cr-reason') { e.preventDefault(); doClose(); }
  }
  let lastView = 'open';
  // admin.js 가 'collect' 보기를 열 때마다 부른다. h = { head, body, say }
  pc.mount = function (h) {
    if (typeof document === 'undefined' || !h || !h.body) return;
    pc.unmount();
    H = h;
    S = { view: lastView, items: [], agent: false, load: 'idle', code: 0, sel: [], ask: null, runAsk: false, busy: '', today: pc.todayKst(), refocus: '' };
    H.body.onclick = onClick; H.body.onchange = onChange; H.body.onkeydown = onKey;
    if (!serverOk()) { S.load = 'offline'; paint(); return; }
    load();
  };
  pc.unmount = function () {
    if (H && H.body) { H.body.onclick = null; H.body.onchange = null; H.body.onkeydown = null; }
    if (S) lastView = S.view;
    loadSeq += 1;   // 늦게 도착한 응답을 버린다
    H = null; S = null;
  };

  // ── 사이드바 배지(요청됨 기관 수, 규격 6-4). overdue.paintNavBadge 방식: 0이면 그리지 않음, 숫자 aria-hidden, 문장은 .sr-only ──
  let badgeN = 0, badgeAt = 0, badgeWho = '', badgeStop = false;
  function navBtn() { return typeof document === 'undefined' ? null : document.querySelector('#side-nav .nav-item[data-nav="' + pc.NAV_ID + '"]'); }
  function resetBadgeIfWhoChanged() {
    const w = whoNow();
    if (w !== badgeWho) { badgeWho = w; badgeN = 0; badgeAt = 0; badgeStop = false; }
  }
  pc.paintNavBadge = function () {
    const btn = navBtn();
    if (!btn) return;
    const cur = btn.querySelector('.pc-nav');
    if ((cur && cur.textContent === String(badgeN) && badgeN > 0) || (!cur && badgeN <= 0)) return;   // 같으면 DOM 을 건드리지 않는다
    Array.prototype.forEach.call(btn.querySelectorAll('.pc-nav, .pc-nav-sr'), function (x) { x.remove(); });
    const label = btn.querySelector('.nav-label');
    if (badgeN > 0) {
      const text = pc.badgeSr(badgeN);
      btn.insertAdjacentHTML('beforeend', '<span class="nav-count pc-nav" aria-hidden="true">' + badgeN + '</span><span class="sr-only pc-nav-sr">, ' + esc(text) + '</span>');
      btn.title = text;
    } else if (label) {
      btn.title = label.textContent;
    }
  };
  pc.setBadge = function (n) { badgeN = Math.max(0, Number(n) || 0); badgeAt = Date.now(); pc.paintNavBadge(); };
  // 메뉴 항목이 보이는 사람(= 시스템 관리 권한)만 부른다. 1분에 한 번만(force 가 아니면). 403 이면 이 계정으로는 더 부르지 않는다(접근 이력에 거부가 쌓이지 않게).
  pc.refreshBadge = function (force) {
    if (typeof document === 'undefined' || !navBtn() || !serverOk()) return Promise.resolve();
    resetBadgeIfWhoChanged();
    if (badgeStop) return Promise.resolve();
    if (!force && Date.now() - badgeAt < 60000) return Promise.resolve();
    badgeAt = Date.now();
    return call('GET', '/plan-collect/admin/status').then(function (r) {
      if (r.ok) pc.setBadge(r.data && r.data.requested_count);
      else if (r.status === 401 || r.status === 403) { badgeStop = true; pc.setBadge(0); }
    });
  };
  // 창으로 돌아올 때(focus) 한 번 더 확인한다. refreshBadge 가 메뉴 없음(로그아웃 포함)·서버 미연결·403 중단·60초 제한을 이미 지킨다.
  // onNavDrawn 이 메뉴를 그릴 때마다 불리므로 플래그로 한 번만 단다. 배지에는 실시간 읽기 속성을 넣지 않는다(바뀔 때마다 읽히는 소음 방지).
  let focusBound = false;
  pc.bindBadgeFocus = function (target) {
    const w = target || (typeof window !== 'undefined' ? window : null);
    if (focusBound || !w || typeof w.addEventListener !== 'function') return false;
    w.addEventListener('focus', function () { pc.refreshBadge(false); });
    focusBound = true;
    return true;
  };
  pc.onNavDrawn = function () {   // app.drawNav 끝에서
    if (!navBtn()) return;
    resetBadgeIfWhoChanged();
    pc.paintNavBadge();
    pc.refreshBadge(false);
    pc.bindBadgeFocus();
  };

  if (isNode) module.exports = pc;
  else root.plancollect = pc;
})(typeof self !== 'undefined' ? self : this);
