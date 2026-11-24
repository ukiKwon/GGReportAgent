(function (root) {
  'use strict';
  // NEXT 105(2026-11-23) — 목표 기관 변경 결재·일괄 요청·자동 이월·협약 개시일 화면의 순수 부분.
  // 규격: handoff/agents/design-reviewer/2026-11-23_0919_ad69b2cf.md 5·6절.
  // 서버: GET /bid-targets(goal_change_mode·change_pending(_info)·carried·carry_basis_cd·judge_from(_assumed)·term_start·term_rev_no·carry_due),
  //   POST /bid-targets/changes · POST /bid-targets/carry · POST /institutions/{id}/bid-terms, 결재 카드 target_items.
  // DOM·fetch는 kbboard.js(입찰 현황판)와 approvals.js(결재함 카드)가 맡는다. 서버·사용자 글은 모두 esc()를 거치거나 textContent로만 쓴다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const tc = {};

  function esc(s) { return (isNode ? require('./logic.js') : root.logic).esc(s); }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v == null ? '' : String(v); }
  function kor(m) { const s = str(m).trim(); return /[가-힣]/.test(s) ? s : ''; }   // 영문 서버 문구는 화면에 내보이지 않는다(kbboard korMsg와 같은 규칙)
  function jong(w) { const s = str(w), c = s ? s.charCodeAt(s.length - 1) : 0; return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : -1; }
  function roDigit(s) { const c = str(s).slice(-1); return c === '0' || c === '3' || c === '6' || c === '7' ? '으로' : '로'; }   // 숫자 끝 '로': 일·이·사·오·팔·구 → 로, 영·삼·육·칠·십 → 으로
  tc.eul = function (w) { return jong(w) > 0 ? '을' : '를'; };

  // ── 이름·문구(규격 5-1) ────────────────────────────────────────────
  tc.MAX_ITEMS = 20; tc.REASON_MAX = 200; tc.MEMO_MAX = 100; tc.ETC_MAX = 50; tc.ETC_CD = 'ETC';
  tc.BTN = { change: 'submit_target_change', carry: 'carry_targets', term: 'set_term_start', values: 'save_target_values' };   // 서버 TargetUiIds(values = 일괄 창 [수정하기], NEXT 114)
  tc.OPS = ['ADD', 'EDIT', 'CANCEL', 'TO_WATCH', 'TO_GOAL'];
  // NEXT 는 화면 안에서만 쓰는 이름: 서버에는 op EDIT + 연도 +1 로 가고(구분·메모 그대로), 결재함 카드·창에서 '다음 회차 목표로'로 보인다(NEXT 114 규격 6-4B).
  const OP_LONG = { ADD: '목표에 넣기', EDIT: '목표 고치기', CANCEL: '목표에서 빼기', TO_WATCH: '관심으로 옮기기', TO_GOAL: '목표로 옮기기', NEXT: '다음 회차 목표로' };
  const OP_SHORT = { ADD: '넣기', EDIT: '고치기', CANCEL: '빼기', TO_WATCH: '관심으로', TO_GOAL: '목표로', NEXT: '다음 회차' };
  tc.opLong = function (op) { return has(OP_LONG, op) ? OP_LONG[op] : ''; };
  tc.opShort = function (op) { return has(OP_SHORT, op) ? OP_SHORT[op] : ''; };
  tc.GO_TEXT = { APPROVAL: '결재 요청', DIRECT: '바로 반영' };
  tc.APPROVAL_NOW_MSG = '목표에서 빼기·옮기기는 결재가 필요합니다. 줄을 고른 뒤 아래 [빼기·옮기기 결재 요청…]으로 올려 주세요. 구분·메모는 결재 없이 바로 바뀝니다.';
  tc.PAST_EDIT_MSG = '지난해 목표는 구분·메모를 고칠 수 없습니다.';
  tc.isPastYear = function (year, y0) { const y = Number(year); return y > 0 && y < Number(y0); };   // 지난해 목표(관심 줄은 연도가 없어 false)
  tc.pastCount = function (s, y0) { let n = 0; ((s && s.ids) || []).forEach(function (id) { const e = s.by[id]; if (e && e.kind !== 'WATCH' && tc.isPastYear(e.year, y0)) n += 1; }); return n; };
  tc.DUP_MSG ='한 요청에 같은 기관은 한 번만 넣을 수 있습니다.';
  tc.CAP_MSG = '한 번에 ' + tc.MAX_ITEMS + '곳까지 고를 수 있습니다.';

  // 서버 goal_change_mode만 따른다(스위치는 서버 설정). 쓰기 자격이 없거나 옛 서버(키 없음)면 null.
  tc.modeOf = function (data) {
    const m = data && data.can_edit === true ? data.goal_change_mode : null;
    return m === 'DIRECT' || m === 'APPROVAL' ? m : null;
  };
  // 역할은 로그인 때 받은 프로필 team 값('영업팀'=팀원·'영업팀장'·'영업부장'). 모르면 둘 다 말한다(규격 5-1).
  tc.approverText = function (role, mode) {
    if (mode !== 'APPROVAL') return '';
    const r = str(role).trim();
    if (r === '영업팀') return '영업팀장이 결재합니다.';
    if (r === '영업팀장') return '영업부장이 결재합니다.';
    return '영업팀장(영업팀장이 올리면 영업부장)이 결재합니다.';
  };
  tc.addGoText = function (mode) { return mode === 'APPROVAL' ? '결재 요청 쓰기' : '목표에 넣기'; };
  // 띠 주 단추: 결재가 필요한 동작의 이름을 단다(숫자는 왼쪽 문장이 말한다). mix = tc.mixOf(sel) 'GOAL'|'WATCH'|'MIX'
  tc.barBtnText = function (mode, mix) {
    const w = mode === 'DIRECT' ? '바로 반영' : '결재 요청';
    if (mix === 'GOAL') return '빼기·옮기기 ' + w + '…';
    if (mix === 'WATCH') return '목표로 옮기기 ' + w + '…';
    return w + ' 쓰기…';
  };
  tc.dlgTitle = function (mode, n) { return mode === 'APPROVAL' ? '목표 기관 변경 결재 요청 — ' + n + '곳' : '목표 기관 변경 — ' + n + '곳'; };
  tc.dlgHint = function (mode, role) {
    if (mode === 'APPROVAL') return tc.approverText(role, mode) + ' 결재가 끝날 때까지 이 기관들은 구분·메모도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).';
    return (str(role).trim() === '영업부장' ? '영업부장은 ' : '') + '결재 없이 바로 반영합니다. 반영한 사람·시각은 기록에 남습니다.';
  };
  // 구분·메모 한꺼번에 수정 창(결재 없음, 규격 6-4A)
  tc.EDIT_GO = '수정하기';
  tc.EDIT_HINT = '결재 없이 바로 반영합니다. 바꾼 사람·시각은 기록에 남습니다.';
  tc.editTitle = function (n) { return '구분·메모 수정 — ' + n + '곳'; };
  tc.eun = function (w) { return jong(w) > 0 ? '은' : '는'; };
  tc.memoFlash = function (name, memo) {
    return str(name) + (str(memo).trim() ? ' 메모를 저장했습니다. 결재 없이 반영되고 기록에 남습니다.' : ' 메모를 지웠습니다. 기록에 남습니다.');
  };
  tc.editResultText = function (n) { return '목표 기관 ' + Number(n) + '곳의 구분·메모를 수정했습니다. 결재 없이 반영되고 기록에 남습니다.'; };
  tc.pendingLockMsg = function (name) { return str(name) + tc.eun(name) + ' 방금 결재 요청에 들어가 잠겼습니다. 결재가 끝나면 다시 바꿀 수 있습니다.'; };

  // ── 고른 줄(탭·연도·거르기를 바꿔도 남는다, 기관 하나 = 한 줄) ──────────
  tc.newSel = function () { return { ids: [], by: {} }; };
  tc.selCount = function (s) { return s && s.ids ? s.ids.length : 0; };
  tc.hasSel = function (s, id) { return has(s.by, id); };
  tc.pickable = function (r) { return !!r && !r.out && !r.pend && (r.kind !== 'WATCH' || Number(r.movable) > 0); };   // 관심 줄은 [목표로 옮기기]가 보이는 줄만(규격 6-1)
  tc.entryOfRow = function (r) {
    return { id: r.id, name: r.name, regionName: r.regionName, kind: r.kind === 'WATCH' ? 'WATCH' : 'GOAL', targetNo: r.targetNo, revNo: r.revNo, year: Number(r.targetYear) || 0,
      tagCd: r.tagCd, tagName: r.tagName, memo: r.memo || '', ownerEmpNo: r.ownerEmpNo || '', ownerName: r.ownerName || '', moveYear: Number(r.movable) || 0, closed: !!r.closed };
  };
  // 고른 줄의 종류별 수와 섞임 판정(띠 문구·단추 이름·[수정하기…] 보임 조건)
  tc.kindCounts = function (s) {
    const k = { goal: 0, watch: 0 };
    ((s && s.ids) || []).forEach(function (id) { if (s.by[id].kind === 'WATCH') k.watch += 1; else k.goal += 1; });
    return k;
  };
  tc.mixOf = function (s) { const k = tc.kindCounts(s); return k.goal && k.watch ? 'MIX' : (k.watch ? 'WATCH' : 'GOAL'); };
  tc.pick = function (s, e) {
    if (has(s.by, e.id)) return s.by[e.id].targetNo === e.targetNo ? { ok: true } : { ok: false, msg: tc.DUP_MSG };
    if (s.ids.length >= tc.MAX_ITEMS) return { ok: false, msg: tc.CAP_MSG };
    s.ids.push(e.id); s.by[e.id] = e;
    return { ok: true };
  };
  tc.unpick = function (s, id) {
    if (!has(s.by, id)) return false;
    delete s.by[id]; s.ids = s.ids.filter(function (x) { return x !== id; });
    return true;
  };
  tc.unpickRow = function (s, id, no) { return has(s.by, id) && s.by[id].targetNo === Number(no) ? tc.unpick(s, id) : false; };
  tc.clearSel = function (s) { s.ids = []; s.by = {}; };
  tc.oneSel = function (e) { const s = tc.newSel(); s.ids.push(e.id); s.by[e.id] = e; return s; };   // 한 항목만 든 임시 묶음(같은 객체라 reconcile이 제자리 갱신)
  // 409의 최신 기록(detail.latest: target_no·rev_no·kind_cd·target_year)으로 고른 줄 스냅샷을 제자리 갱신. 같은 목표 줄·같은 종류일 때만 — 아니면 false(목록을 따로 읽는다).
  tc.applyLatest = function (snap, latest) {
    if (!snap || !latest || typeof latest !== 'object') return false;
    const rev = Number(latest.rev_no), no = Number(latest.target_no);
    if (!(rev > 0) || no !== Number(snap.targetNo)) return false;
    if (latest.kind_cd && latest.kind_cd !== snap.kind) return false;
    snap.revNo = rev;
    if (snap.kind === 'GOAL' && Number(latest.target_year) > 0) snap.year = Number(latest.target_year);
    return true;
  };
  tc.pickedMap = function (s) { const m = {}; s.ids.forEach(function (id) { m[id] = s.by[id].targetNo; }); return m; };
  tc.isPicked = function (s, r) { return has(s.by, r.id) && s.by[r.id].targetNo === Number(r.targetNo); };
  // 목록을 다시 받은 뒤: 잠겼거나 사라진 줄은 빼고, 남은 줄은 새 기록 번호로 제자리 갱신(창이 같은 객체를 본다). 다른 연도 목표는 이 응답으로 확인할 수 없어 그대로 둔다. 뺀 개수를 돌려준다.
  tc.reconcile = function (s, rows, wrows, year) {
    let dropped = 0;
    const find = function (list, e) { return (list || []).filter(function (r) { return r && !r.out && r.id === e.id && r.targetNo === e.targetNo; })[0] || null; };
    s.ids.slice().forEach(function (id) {
      const e = s.by[id];
      const list = e.kind === 'WATCH' ? wrows : (Number(e.year) === Number(year) ? rows : null);
      if (list === null) return;
      const r = find(list, e);
      if (!r || r.pend || r.kind !== e.kind) { tc.unpick(s, id); dropped += 1; return; }
      Object.assign(e, tc.entryOfRow(r));
    });
    return dropped;
  };

  // ── 일괄 요청 창의 항목 ─────────────────────────────────────────────
  tc.isFixed = function (it) { return !!it.add || !!(it.snap && it.snap.kind === 'WATCH'); };   // 동작이 정해진 항목: 넣기(ADD)·관심 줄(TO_GOAL)
  tc.newItem = function (uid, snap) {
    const w = snap.kind === 'WATCH';
    return { uid: uid, id: snap.id, name: snap.name, regionName: snap.regionName, snap: snap, add: null, op: w ? 'TO_GOAL' : '', year: w ? (snap.moveYear || 0) : 0,
      tag: '', memo: '', cancelCd: '', cancelEtc: '', touched: false };
  };
  tc.addItem = function (uid, a) {
    return { uid: uid, id: a.id, name: a.name, regionName: a.regionName, snap: null, add: { tagName: a.tagName || a.tag }, op: 'ADD', year: Number(a.year) || 0,
      tag: a.tag, memo: str(a.memo).trim(), cancelCd: '', cancelEtc: '', touched: false };
  };
  // pre = { year, tag }(한 줄 동작이 미리 채우는 값). 동작이 정해진 항목은 건드리지 않는다.
  tc.setOp = function (it, op, pre) {
    if (tc.isFixed(it)) return it;
    pre = pre || {};
    it.op = op === 'EDIT' || op === 'CANCEL' || op === 'TO_WATCH' || op === 'NEXT' ? op : '';
    it.cancelCd = ''; it.cancelEtc = '';
    if (it.op === 'EDIT') { it.year = Number(pre.year) || it.snap.year || 0; it.tag = pre.tag || it.snap.tagCd; it.memo = it.snap.memo; }
    else if (it.op === 'NEXT') { it.year = (Number(it.snap.year) || 0) + 1; it.tag = it.snap.tagCd; it.memo = it.snap.memo; }   // 구분·메모는 그대로, 연도만 +1
    else { it.year = 0; it.tag = ''; it.memo = ''; }
    return it;
  };
  // 누르기 전에는 막지 않고, 누르면 칸마다 알린다(규격 5-2). 항목마다 첫 오류 하나.
  tc.validate = function (items, o) {
    o = o || {};
    const out = { ok: true, top: '', reason: '', items: [] };
    const bad = function (it, f, msg) { out.items.push({ uid: it.uid, f: f, msg: msg }); out.ok = false; };
    if (!items || !items.length) { out.ok = false; out.top = '바꿀 기관을 하나 이상 골라 주세요.'; return out; }
    if (o.mode === 'APPROVAL') {
      const t = str(o.reason).trim();
      if (!t) { out.reason = '사유를 적으세요.'; out.ok = false; }
      else if (t.length > tc.REASON_MAX) { out.reason = '사유는 ' + tc.REASON_MAX + '자 이내로 적으세요.'; out.ok = false; }
    }
    items.forEach(function (it) {
      if (it.op === 'ADD') return;
      if (!it.op) { bad(it, 'op', '동작을 고르세요.'); return; }
      if (it.op === 'EDIT') {
        const s = it.snap;
        if (!Number(it.year)) { bad(it, 'year', '목표 연도를 고르세요.'); return; }
        if (str(it.memo).trim().length > tc.MEMO_MAX) { bad(it, 'memo', '메모는 ' + tc.MEMO_MAX + '자 이내로 적으세요.'); return; }
        if (Number(it.year) === Number(s.year) && it.tag === s.tagCd && str(it.memo).trim() === str(s.memo).trim()) bad(it, 'edit', '고친 내용이 없습니다. 칸을 바꾸거나 이 기관을 목록에서 제외하세요.');
      } else if (it.op === 'NEXT') {
        if (!Number(it.year)) bad(it, 'year', '목표 연도를 고르세요.');
      } else if (it.op === 'CANCEL') {
        if (!it.cancelCd) { bad(it, 'cancelCd', '빼는 사유를 고르세요.'); return; }
        if (it.cancelCd === tc.ETC_CD) {
          const e = str(it.cancelEtc).trim();
          if (!e) bad(it, 'cancelEtc', '기타 사유를 적으세요.');
          else if (e.length > tc.ETC_MAX) bad(it, 'cancelEtc', '기타 사유는 ' + tc.ETC_MAX + '자 이내로 적으세요.');
        }
      } else if (it.op === 'TO_GOAL') {
        if (!Number(it.year)) bad(it, 'year', '목표 연도를 고르세요.');
      }
    });
    return out;
  };
  // 서버 TargetChangeIn 모양. 동작에 안 맞는 칸은 보내지 않는다(서버 shape()가 400). 영업부장 바로 반영은 사유를 받지 않는다.
  function toItem(it) {
    const b = { institution_id: it.id, op_cd: it.op };
    if (it.op === 'ADD') { b.target_year = Number(it.year); b.tag_cd = it.tag; b.memo = str(it.memo).trim() || null; return b; }
    b.target_no = it.snap.targetNo; b.base_rev_no = it.snap.revNo;
    if (it.op === 'EDIT' || it.op === 'NEXT') { b.op_cd = 'EDIT'; b.target_year = Number(it.year); b.tag_cd = it.tag; b.memo = str(it.memo).trim() || null; b.owner_emp_no = it.snap.ownerEmpNo || null; }   // NEXT = EDIT + 연도 +1(서버는 모른다)
    else if (it.op === 'CANCEL') { b.cancel_reason_cd = it.cancelCd; b.cancel_reason_etc = it.cancelCd === tc.ETC_CD ? str(it.cancelEtc).trim() : null; }
    else if (it.op === 'TO_GOAL') b.target_year = Number(it.year);
    return b;
  }
  tc.buildBody = function (items, o) {
    o = o || {};
    const body = {};
    if (o.mode === 'APPROVAL') body.reason = str(o.reason).trim();
    body.items = (items || []).map(toItem);
    return body;
  };

  // ── 결과·오류 문장(규격 5-2·5-3·6-3) ──────────────────────────────────
  const NET_MSG = '서버에 연결되지 않아 올리지 못했습니다. 연결을 확인하고 다시 누르세요.';
  const ITEM_MSG = {
    pending: '방금 다른 결재 요청에 들어가 잠겼습니다. 이 기관을 목록에서 제외하고 다시 올려 주세요.',
    stale: '다른 사람이 먼저 고쳤습니다. 최신 기록으로 다시 읽었으니 이전·이후를 확인하고 다시 올려 주세요.',
    cancelled: '이미 목표에서 빠진 기관입니다. 목록에서 제외해 주세요.',
    notOwner: '다른 사람의 관심 기관은 바꿀 수 없습니다. 내 관심 기관만 올릴 수 있으니 목록에서 제외해 주세요.',   // 403 NOT_WATCH_OWNER(관심은 사람별, NEXT 117)
    alreadyWatch: '이미 내 관심 기관에 들어 있습니다. 목록에서 제외해 주세요.' };   // 409 ALREADY_WATCH(목표→관심 결재를 올릴 때)
  function fallback(s) { return '올리지 못했습니다(오류 ' + s + '). 다시 시도하세요.'; }
  // x = { status, body } → { kind:'item'|'field'|'top', top, item:{uid,f,msg}|null, msg, refresh }
  tc.errorOf = function (x, items) {
    const s = x ? Number(x.status) || 0 : 0;
    const d = x && x.body ? x.body.detail : null;
    const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    const code = typeof o.code === 'string' ? o.code : '';
    const msg = kor(typeof d === 'string' ? d : o.message);
    const no = Number(o.item_no) > 0 ? Math.floor(Number(o.item_no)) : 0;
    const it = no && items && items[no - 1] ? items[no - 1] : null;
    const e = { kind: 'top', top: '', item: null, msg: '', refresh: false, latest: o.latest && typeof o.latest === 'object' && !Array.isArray(o.latest) ? o.latest : null };
    if (s === 0) { e.top = NET_MSG; return e; }
    if (s === 401) { e.top = '로그인이 필요합니다. 다시 로그인하세요.'; return e; }
    if (it) {
      const name = it.name || str(o.institution_name);
      let f = 'op', m;
      if (s === 409 && code === 'CHANGE_PENDING') { m = ITEM_MSG.pending; e.refresh = true; }
      else if (s === 409 && code === 'STALE') { m = ITEM_MSG.stale; e.refresh = true; }
      else if (s === 409 && code === 'ALREADY_CANCELLED') m = ITEM_MSG.cancelled;
      else if (s === 409 && code === 'ALREADY_WATCH') m = ITEM_MSG.alreadyWatch;
      else if (s === 403 && code === 'NOT_WATCH_OWNER') { m = ITEM_MSG.notOwner; e.refresh = true; }
      else if (s === 422) { f = 'text'; m = msg || '개인정보로 보이는 내용이 있습니다.'; }
      else if (s === 404) m = msg || '기관을 찾지 못했습니다.';
      else if (s === 400) m = msg || '입력한 내용을 확인하세요.';
      else m = msg || fallback(s);
      e.kind = 'item'; e.top = no + '번째 ' + name + tc.eul(name) + ' 확인하세요.'; e.item = { uid: it.uid, f: f, msg: m };
      return e;
    }
    if (s === 422) { e.kind = 'field'; e.msg = msg || '개인정보로 보이는 내용이 있습니다.'; return e; }   // 사유 칸 아래에
    if (s === 403 && code === 'NOT_WATCH_OWNER') { e.top = ITEM_MSG.notOwner; e.refresh = true; return e; }   // 항목 번호가 없는 응답도 '영업부서만' 문장으로 오해되지 않게
    e.top = msg || (s === 400 ? '입력한 내용을 확인하세요.' : (s === 403 ? '목표 기관 변경은 영업부서만 올릴 수 있습니다.' : fallback(s)));
    return e;
  };
  // kind === 'edit'(구분·메모 일괄 수정 창)이고 서버가 바로 반영했으면 수정 알림 문장.
  tc.resultOf = function (body, n, kind) {
    const direct = !!body && body.mode === 'DIRECT';
    const cnt = direct && Number(body.applied) > 0 ? Number(body.applied) : Number(n);
    return { mode: direct ? 'DIRECT' : 'APPROVAL', n: cnt,
      text: direct ? (kind === 'edit' ? tc.editResultText(cnt) : '목표 기관 ' + cnt + '곳을 바로 반영했습니다.') : '결재 요청을 올렸습니다 — 목표 기관 ' + cnt + '곳. 결재가 끝날 때까지 이 기관들은 잠깁니다.' };
  };

  // ── 자동 이월 알림(규격 5-5) — 받은 숫자로만 만든다 ───────────────────────
  tc.carryMerge = function (a, b) {
    const g = function (o, k) { return Number(o && o[k]) || 0; };
    return { carried: g(a, 'carried') + g(b, 'carried'), revoked: g(a, 'revoked') + g(b, 'revoked'), skipped: g(a, 'skipped') + g(b, 'skipped'), more: !!(b && b.more) };
  };
  tc.carryText = function (s) {
    const c = Number(s && s.carried) || 0, r = Number(s && s.revoked) || 0, k = Number(s && s.skipped) || 0, parts = [];
    if (c > 0) parts.push('지난 목표 중 달성하지 못한 기관 ' + c + '곳을 자동으로 넘겼습니다. 다른 은행이 약정한 곳은 다음 해 관심 기관으로 넘겼습니다.');
    if (r > 0) parts.push('판정이 바뀐 ' + r + '곳은 자동으로 넘긴 기록을 거뒀습니다(기록은 남습니다).');
    if (k > 0) parts.push(k + '곳은 결재 중이거나 처리하지 못해 다음에 다시 넘깁니다.');
    return { text: parts.join(' '), hasCarried: c > 0, changed: c + r > 0 };
  };
  tc.actHtml = function (act) {   // 알림 옆 버튼(고정 마크업, 서버 글 없음)
    if (act === 'carried') return '<button type="button" class="hb-tag" id="hb-see-carried">넘어온 기관만 보기</button>';
    if (act === 'inbox') return '<button type="button" class="hb-tag" id="hb-see-inbox">결재함에서 보기</button>';
    return '';
  };

  // ── 줄 표시: 달성 판정일·이월·잠금(규격 6-2) ───────────────────────────
  tc.judgeText = function (r) { return r && r.judgeFrom ? '달성 판정일 ' + r.judgeFrom + (r.judgeAssumed ? '(추정)' : '') : ''; };
  // 관심 줄은 원천 연도를 응답이 주지 않는다(carryFromYear 없으면 '지난') — 없는 값을 지어내지 않는다.
  tc.carriedTitle = function (r) {
    if (!r || !r.carried) return '';
    if (r.kind === 'WATCH') return '다른 은행이 약정해 ' + (Number(r.carryFromYear) || '지난') + ' 목표에서 관심 기관으로 자동으로 옮김';
    const y = Number(r.targetYear) - 1;
    return (y > 0 ? y : '지난') + ' 목표에서 자동으로 넘어옴' + (r.carryBasis === 'UNREGISTERED' ? '. 작년 결과: 협약 개시일이 지났는데 금고 약정 기록이 없음' : '');
  };
  tc.rowTips = function (r) {   // 구분 칸 title·sr 뒤에 덧붙는 문장들. 예전 KB는 이월 줄에서 글자 대신 여기로만(구분 칸 폭 146px)
    const out = [];
    if (r && r.carried) {
      const t = tc.carriedTitle(r); if (t) out.push(t);
      if (r.tagCd === 'NEW' && r.prevYear) out.push('되찾기 후보: 예전 국민은행 금고(마지막 ' + r.prevYear + '년)');
    }
    const j = tc.judgeText(r); if (j) out.push(j);
    return out;
  };
  tc.rowClass = function (r, o) {
    const c = [];
    if (r.late) c.push('late');
    if (o && o.picked && !r.out && has(o.picked, r.id) && Number(o.picked[r.id]) === Number(r.targetNo)) c.push('picked');
    if (r.pend && !r.out) c.push('locked');
    return c.length ? ' class="' + c.join(' ') + '"' : '';
  };
  tc.kst = function (iso) {   // 서버 시각은 UTC ISO — 한국시간 'YYYY-MM-DD HH:mm'(approvals.formatTime과 같다)
    const t = Date.parse(str(iso));
    if (isNaN(t)) return str(iso);
    return new Date(t + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
  };

  const LOCK_IN = '<rect x="2.5" y="5.5" width="7" height="5"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/>';
  tc.ckHeadHtml = function (watch) {
    return '<th scope="col" class="ck"><label><input type="checkbox" id="hb-pickall" aria-label="' + (watch ? '보이는 관심 기관 모두 고르기' : '보이는 목표 기관 모두 고르기') + '"></label></th>';
  };
  tc.ckCellHtml = function (r, o) {
    if (r.out) return '<td class="ck"></td>';
    if (r.pend) return '<td class="ck"><svg class="lk" viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg><span class="sr-only">결재 중이라 고를 수 없음</span></td>';
    if (!tc.pickable(r)) return '<td class="ck"></td>';
    const on = !!(o && o.picked && has(o.picked, r.id) && Number(o.picked[r.id]) === Number(r.targetNo));
    return '<td class="ck"><label><input type="checkbox" data-pick="' + esc(r.id) + '" aria-label="' + esc(r.regionName) + ' ' + esc(r.name) + ' 고르기"' + (on ? ' checked' : '') + '></label></td>';
  };
  tc.selbarHtml = function () {   // 바닥 띠(#hb-ts와 #hb-tf 사이). 1곳 이상 골랐을 때만 보인다
    // 왼쪽부터 숫자 문장·선택 지우기 | 바로 반영 단추 [수정하기…](고른 줄이 전부 목표일 때만) · 결재자 안내 · 결재 주 단추
    return '<div class="hb-selbar" id="hb-selbar" role="region" aria-label="고른 기관" hidden><span class="n" id="hb-seln" role="status"></span>' +
      '<button type="button" id="hb-selclr" class="lnk">선택 지우기</button><span class="sp"></span>' +
      '<button type="button" id="hb-seledit" aria-haspopup="dialog" hidden>수정하기…</button>' +
      '<span class="who" id="hb-selwho"></span><button type="button" id="hb-selgo" class="go" aria-haspopup="dialog"></button></div>';
  };
  // 숫자 문장(role=status). 20곳 한도 같은 짧은 알림은 같은 자리에서 읽힌다.
  // kinds = { goal, watch }(없으면 '고른 기관 n곳'), off = 이 화면 밖에 고른 줄 수(규격 6-1)
  tc.selStatusHtml = function (n, msg, kinds, off) {
    n = Number(n); off = Number(off) || 0;
    const g = kinds ? Number(kinds.goal) || 0 : 0, w = kinds ? Number(kinds.watch) || 0 : 0;
    const lab = g && w || !kinds ? '기관' : (w ? '관심 기관' : '목표 기관');
    const mix = g && w ? '(목표 ' + g + '·관심 ' + w + ')' : '';
    const sr = msg ? msg : (kinds ? lab + ' ' + n + '곳 고름' + mix + (off > 0 ? ', 이 화면 밖 ' + off + '곳 포함' : '') : n + '곳 고름');
    return '<span class="sr-only">' + esc(sr) + '</span><span aria-hidden="true">고른 ' + lab + ' <b>' + n + '</b>곳' + mix + (off > 0 ? ' · 이 화면 밖 ' + off + '곳' : '') + '</span>' +
      (msg ? '<span class="lim" aria-hidden="true">' + esc(msg) + '</span>' : '');
  };
  // 결재 중인 줄의 구분 칸: 쓰기 자격자는 눌러 보는 칩(버튼), 그 밖은 글자 칩(span). 구분 이름은 title·sr로만
  tc.pendCellHtml = function (r, o) {
    const nm = str(r.tagName || r.tagCd), info = r.pendInfo;
    if (!(o && o.canEdit) || !info) return '<td title="결재가 진행 중인 기관입니다"><span class="hb-pend"><svg viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg>결재 중</span><span class="sr-only">. 구분 ' + esc(nm) + '</span></td>';
    const opS = tc.opShort(info.op), opL = tc.opLong(info.op), when = tc.kst(info.at);
    const tip = ['구분: ' + nm, '결재 중' + (opL ? ': ' + opL + ' 요청' : ''), str(info.by) + (when ? ' ' + when : '')].filter(Boolean).join(' · ');
    const aria = '결재 중' + (opL ? ': ' + opL + ' 요청' : '') + (info.by ? ', 요청자 ' + info.by : '') + (when ? ', ' + when : '') + '. 자세히 보기';
    return '<td title="' + esc(tip) + '"><button type="button" class="hb-pend" data-act="pend" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="dialog" aria-label="' + esc(aria) + '">' +
      '<svg viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg>결재 중' + (opS ? ' · ' + esc(opS) : '') + '</button><span class="sr-only">. 구분 ' + esc(nm) + '</span></td>';
  };

  // ── 일괄 요청 창(규격 6-3) ──────────────────────────────────────────
  function yearOpts(years, cur, blank) {
    return (blank ? '<option value=""' + (Number(cur) ? '' : ' selected') + '>고르세요</option>' : '') + years.map(function (y) {
      return '<option value="' + esc(y) + '"' + (Number(y) === Number(cur) ? ' selected' : '') + '>' + esc(y) + '년</option>';
    }).join('');
  }
  function yearsFor(it, years) {   // 현재 연도·고른 연도가 목록 밖이면 더한다
    const s = {};
    (years || []).forEach(function (y) { s[Number(y)] = true; });
    if (it.snap && it.snap.year) s[it.snap.year] = true;
    if (Number(it.year)) s[Number(it.year)] = true;
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }
  tc.beforeHtml = function (it) {
    if (it.add || !it.snap) return '목표·관심 아님';
    const s = it.snap, tag = esc(s.tagName || s.tagCd);
    if (s.kind === 'WATCH') return '관심 기관 · ' + tag;
    return '<span class="mono">' + esc(s.year) + '</span> 목표 · ' + tag + (s.ownerName ? ' · 주 담당 ' + esc(s.ownerName) : '') + (it.op === 'EDIT' ? ' · 메모 ' + (s.memo ? esc(s.memo) : '없음') : '');
  };
  tc.afterBlockHtml = function (it, o) {
    o = o || {};
    const id = function (k) { return 'tc-i' + it.uid + '-' + k; }, u = ' data-uid="' + it.uid + '"';
    let dd;
    if (it.op === 'ADD') {
      dd = '<span class="mono">' + esc(it.year) + '</span> 목표 · ' + esc(it.add.tagName) + (it.memo ? '<span class="tc-memo">메모: ' + esc(it.memo) + '</span>' : '');
    } else if (it.op === 'EDIT') {
      dd = '<label for="' + id('y') + '">목표 연도</label><select id="' + id('y') + '"' + u + ' data-f="year">' + yearOpts(yearsFor(it, o.years), it.year, false) + '</select>' +
        '<label for="' + id('t') + '">구분</label><select id="' + id('t') + '"' + u + ' data-f="tag">' + (o.tags || []).map(function (t) {
          return '<option value="' + esc(t.code) + '"' + (t.code === it.tag ? ' selected' : '') + '>' + esc(t.name) + '</option>';
        }).join('') + '</select>' +
        '<label for="' + id('m') + '">메모</label><input id="' + id('m') + '"' + u + ' data-f="memo" maxlength="' + tc.MEMO_MAX + '" size="20" value="' + esc(it.memo) + '">';
    } else if (it.op === 'CANCEL') {
      const rs = o.reasons || [];
      dd = '목표에서 빠짐' + (rs.length
        ? '<label for="' + id('rs') + '">빼는 사유</label><select id="' + id('rs') + '"' + u + ' data-f="cancelCd"><option value=""' + (it.cancelCd ? '' : ' selected') + '>고르세요</option>' + rs.map(function (x) {
          return '<option value="' + esc(x.code) + '"' + (x.code === it.cancelCd ? ' selected' : '') + '>' + esc(x.name) + '</option>';
        }).join('') + '</select>' + (it.cancelCd === tc.ETC_CD ? '<label for="' + id('etc') + '">기타 사유</label><input id="' + id('etc') + '"' + u + ' data-f="cancelEtc" maxlength="' + tc.ETC_MAX + '" value="' + esc(it.cancelEtc) + '">' : '')
        : '<span class="tc-memo">빼는 사유 목록을 받지 못했습니다. 목록을 다시 불러온 뒤 시도하세요.</span>');
    } else if (it.op === 'NEXT') {
      dd = '<span class="mono">' + esc(it.year) + '</span> 목표 · 구분·메모 그대로';
    } else if (it.op === 'TO_WATCH') {
      dd = '관심 기관(연도 없음)';
    } else if (it.op === 'TO_GOAL') {
      dd = '<label for="' + id('y') + '">목표 연도</label><select id="' + id('y') + '"' + u + ' data-f="year">' + yearOpts(yearsFor(it, o.years), it.year, true) + '</select>';
    } else {
      dd = '<span class="tc-memo">동작을 고르면 이어서 정합니다.</span>';
    }
    return '<dl class="tc-ba"><dt>이전</dt><dd>' + tc.beforeHtml(it) + '</dd><dt>이후</dt><dd>' + dd + '</dd></dl>';
  };
  tc.itemHtml = function (it, n, o) {
    const hid = 'tc-i' + it.uid + '-h', u = ' data-uid="' + it.uid + '"';
    const opCtl = tc.isFixed(it) ? '<span class="fix">' + esc(tc.opLong(it.op)) + '</span>'
      : '<label class="sr-only" for="tc-i' + it.uid + '-op">' + esc(it.name) + ' 동작</label><select id="tc-i' + it.uid + '-op"' + u + ' data-f="op"><option value=""' + (it.op ? '' : ' selected') + '>동작 고르기</option>' +
        (it.snap && it.snap.closed || it.op === 'NEXT' ? ['CANCEL', 'TO_WATCH', 'NEXT'] : ['CANCEL', 'TO_WATCH']).map(function (op) { return '<option value="' + op + '"' + (it.op === op ? ' selected' : '') + '>' + esc(tc.opLong(op)) + '</option>'; }).join('') + '</select>';   // 목표 고치기(EDIT)는 목록에 없다 — 구분·메모는 결재 없이 따로 고친다(NEXT 114)
    return '<li class="tc-item" role="group" aria-labelledby="' + hid + '"' + u + '><div class="tc-ih"><span class="no">' + Number(n) + '</span><span class="nm" id="' + hid + '"><span class="rg">' + esc(it.regionName) + '</span>' + esc(it.name) + '</span>' + opCtl +
      '<button type="button" class="tc-x"' + u + ' aria-label="' + esc(it.name) + ' 목록에서 제외">목록에서 제외</button></div>' + tc.afterBlockHtml(it, o) + '<p class="dlg-ferr" id="tc-i' + it.uid + '-e"></p></li>';
  };
  // m = { mode, items, reason, role }, o = { years, tags, reasons }. 덮개는 body 직계로 붙이고 dlg.open으로 연다.
  tc.dialogHtml = function (m, o) {
    const approval = m.mode === 'APPROVAL', items = m.items || [];
    const reasonBox = approval ? '<div class="dlg-f"><label for="tc-reason">사유<span class="dlg-req" aria-hidden="true">*</span><span class="sr-only"> (필수)</span></label>' +
      '<textarea id="tc-reason" rows="3" maxlength="' + tc.REASON_MAX + '" aria-describedby="tc-rh tc-rc tc-re">' + esc(m.reason || '') + '</textarea>' +
      '<p class="tc-sub"><span id="tc-rh">결재자가 읽습니다. 개인정보를 적지 마세요.</span><span id="tc-rc" class="mono">' + str(m.reason).length + '/' + tc.REASON_MAX + '</span></p><p class="dlg-ferr" id="tc-re"></p></div>' : '';
    const free = items.filter(function (x) { return !tc.isFixed(x); });
    const allop = free.length >= 2 && free.some(function (x) { return !x.op; }) ?'<div class="tc-all"><label for="tc-allop">고른 목표 줄 모두</label><select id="tc-allop"><option value="">동작 한꺼번에 정하기</option><option value="CANCEL">목표에서 빼기</option><option value="TO_WATCH">관심으로 옮기기</option></select></div>' : '';
    return '<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="approval"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="tc-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tc-t" tabindex="-1">' + esc(tc.dlgTitle(m.mode, items.length)) + '</h2><div class="dlg-acts"><button type="button" id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">' + esc(tc.GO_TEXT[approval ? 'APPROVAL' : 'DIRECT']) + '</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">' + esc(tc.dlgHint(m.mode, m.role)) + '</p><p class="dlg-err" id="tc-err" role="alert"></p></div>' +
      '<div class="dlg-body">' + reasonBox + allop + '<ol class="tc-items" id="tc-items">' + items.map(function (it, i) { return tc.itemHtml(it, i + 1, o); }).join('') + '</ol></div></div></div>';
  };
  // 구분·메모 한꺼번에 수정 창(규격 6-4A): 같은 #tc-dlg 뼈대, 사유 칸·동작 칸·연도 칸 없음. 연도는 지금 값 그대로 보낸다.
  function tagOpts(tags, cur) {
    return (tags || []).map(function (t) { return '<option value="' + esc(t.code) + '"' + (t.code === cur ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
  }
  tc.editItemHtml = function (it, n, o) {
    o = o || {};
    const hid = 'tc-i' + it.uid + '-h', u = ' data-uid="' + it.uid + '"', id = function (k) { return 'tc-i' + it.uid + '-' + k; };
    const dd = '<label for="' + id('t') + '">구분</label><select id="' + id('t') + '"' + u + ' data-f="tag">' + tagOpts(o.tags, it.tag) + '</select>' +
      '<label for="' + id('m') + '">메모</label><input id="' + id('m') + '"' + u + ' data-f="memo" maxlength="' + tc.MEMO_MAX + '" size="20" value="' + esc(it.memo) + '">';
    return '<li class="tc-item" role="group" aria-labelledby="' + hid + '"' + u + '><div class="tc-ih"><span class="no">' + Number(n) + '</span><span class="nm" id="' + hid + '"><span class="rg">' + esc(it.regionName) + '</span>' + esc(it.name) + '</span>' +
      '<span class="fix">구분·메모 수정</span><button type="button" class="tc-x"' + u + ' aria-label="' + esc(it.name) + ' 목록에서 제외">목록에서 제외</button></div>' +
      '<dl class="tc-ba"><dt>이전</dt><dd>' + tc.beforeHtml(it) + '</dd><dt>이후</dt><dd>' + dd + '</dd></dl><p class="dlg-ferr" id="tc-i' + it.uid + '-e"></p></li>';
  };
  // m = { items }, o = { tags }
  tc.editDialogHtml = function (m, o) {
    const items = m.items || [];
    const all = items.length >= 2 ? '<div class="tc-all"><label for="tc-alltag">고른 목표 줄 모두</label><select id="tc-alltag"><option value="">구분 한꺼번에 정하기</option>' + tagOpts(o && o.tags, '') + '</select></div>' : '';
    return '<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="edit"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="tc-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tc-t" tabindex="-1">' + esc(tc.editTitle(items.length)) + '</h2><div class="dlg-acts"><button type="button" id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">' + esc(tc.EDIT_GO) + '</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">' + esc(tc.EDIT_HINT) + '</p><p class="dlg-err" id="tc-err" role="alert"></p></div>' +
      '<div class="dlg-body">' + all + '<ol class="tc-items" id="tc-items">' + items.map(function (it, i) { return tc.editItemHtml(it, i + 1, o); }).join('') + '</ol></div></div></div>';
  };
  // 메모 창(규격 6-3): 협약 개시일 창(tt-*)과 같은 뼈대, 결재 없이 바로 저장. r = 줄 모델
  tc.memoDialogHtml = function (r) {
    const memo = str(r.memo);
    return '<div id="mm-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mm-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="mm-t" tabindex="-1">메모 — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h2><div class="dlg-acts"><button type="button" id="mm-cancel">취소</button><button type="button" id="mm-go" class="dlg-go">저장</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">결재 없이 바로 저장됩니다. 고친 사람·시각은 기록에 남습니다. 개인정보를 적지 마세요.</p><p class="dlg-err" id="mm-err" role="alert"></p></div>' +
      '<div class="dlg-body"><div class="dlg-f"><label for="mm-memo">메모</label><input id="mm-memo" maxlength="' + tc.MEMO_MAX + '" value="' + esc(memo) + '" aria-describedby="mm-cnt mm-e">' +
      '<p class="tc-sub"><span id="mm-cnt" class="mono">' + memo.length + '/' + tc.MEMO_MAX + '</span></p><p class="dlg-ferr" id="mm-e"></p></div></div></div></div>';
  };

  // ── 결재 진행 중 창·협약 개시일 창(규격 6-4·6-5) ──────────────────────
  tc.pendingDialogHtml = function (r, o) {
    o = o || {};
    const info = r.pendInfo || {}, op = tc.opLong(info.op) || '확인할 수 없음', when = tc.kst(info.at);
    return '<div id="pd-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="pd-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="pd-t" tabindex="-1">결재 진행 중 — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h2>' +
      '<div class="dlg-acts"><button type="button" id="pd-inbox">결재함에서 보기</button><span class="dlg-sep" aria-hidden="true"></span><button type="button" id="pd-close">닫기</button></div></header>' +
      '<div class="dlg-body"><dl class="tc-pd"><dt>요청 동작</dt><dd>' + esc(op) + '</dd><dt>요청한 사람</dt><dd>' + esc(info.by || '—') + '</dd><dt>올린 시각</dt><dd class="mono">' + esc(when || '—') + '</dd></dl>' +
      '<p class="tm-note">결재가 끝나면(승인·반려·취소) 잠금이 풀립니다. 요청을 거두려면 요청한 사람이 결재함 \'내가 올린 요청\'에서 [취소]를, 영업부장은 받은 결재에서 [반려]를 누릅니다.</p>' +
      (o.canTerm ? '<p class="tc-term"><button type="button" id="pd-term">협약 개시일 적기…</button></p>' : '') + '</div></div></div>';
  };
  tc.termNowHtml = function (r) {
    const md = /^\d{4}-(\d{2})-(\d{2})$/.exec(str(r.judgeFrom));
    const tail = r.judgeAssumed ? ' (추정 — 개시일 기록이 없어 목표 연도 다음 해 ' + (md ? Number(md[1]) + '월 ' + Number(md[2]) + '일' : '기본일') + '로 봅니다)' : '';
    return esc(r.targetYear) + ' 목표의 달성 판정일 <b class="mono">' + esc(r.judgeFrom) + '</b>' + tail;
  };
  tc.termDialogHtml = function (r) {
    const y = Number(r.targetYear) || 0;
    return '<div id="tt-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="tt-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tt-t" tabindex="-1">RFP 협약 개시일 — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h2><div class="dlg-acts"><button type="button" id="tt-cancel">취소</button><button type="button" id="tt-go" class="dlg-go">저장</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">결재 없이 바로 저장됩니다. 영업부서 누구나 고칠 수 있고, 누가 언제 고쳤는지 기록에 남습니다.</p><p class="dlg-hint" id="tt-info" role="status"></p><p class="dlg-err" id="tt-err" role="alert"></p></div>' +
      '<div class="dlg-body"><p class="tt-now" id="tt-now">' + tc.termNowHtml(r) + '</p>' +
      '<div class="dlg-f"><label for="tt-d">협약 개시일</label><input type="date" id="tt-d" class="tt-d" min="' + esc(y + '-01-01') + '" max="' + esc((y + 1) + '-12-31') + '" value="' + esc(r.termStart || '') + '" aria-describedby="tt-h tt-e">' +
      '<p id="tt-h" class="tm-note">RFP(제안요청서)에 적힌 새 금고 협약의 시작일입니다. ' + y + '년이나 ' + (y + 1) + '년 날짜만 적을 수 있습니다. 비우고 저장하면 기록을 지웁니다.</p><p class="dlg-ferr" id="tt-e"></p></div>' +
      '<p class="tm-note">이 날이 지나면 달성 여부를 판정합니다. 국민은행이 약정하면 달성, 다른 은행이 약정하면 다음 해 관심 기관으로, 약정 기록이 없으면 다음 해 목표로 자동으로 넘깁니다.</p></div></div></div>';
  };
  tc.termFlash = function (name, year, date, mmdd) {
    const y = Number(year);
    if (date) return str(name) + ' ' + y + ' 목표의 협약 개시일을 ' + date + roDigit(date) + ' 저장했습니다. 달성 판정일도 이 날로 바뀝니다.';
    return str(name) + ' ' + y + ' 목표의 협약 개시일 기록을 지웠습니다. 달성 판정일은 ' + (y + 1) + '-' + (/^\d{2}-\d{2}$/.test(str(mmdd)) ? mmdd : '01-01') + '(추정)입니다.';
  };
  tc.termOutcome = function (x) {
    const s = x ? Number(x.status) || 0 : 0, d = x && x.body ? x.body.detail : null;
    const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    const code = typeof o.code === 'string' ? o.code : '', msg = kor(typeof d === 'string' ? d : o.message);
    if (s === 201) return { kind: 'saved' };
    if (s === 200) return { kind: 'nochange', msg: '바뀐 내용이 없어 저장하지 않았습니다.' };
    if (s === 0) return { kind: 'error', msg: '서버에 연결되지 않아 저장하지 못했습니다. 연결을 확인하고 다시 누르세요.' };
    if (s === 401) return { kind: 'error', msg: '로그인이 필요합니다. 다시 로그인하세요.' };
    if (s === 409 && code === 'STALE') return { kind: 'stale', msg: msg || '다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.' };
    if (s === 400) return { kind: 'field', msg: msg || '협약 개시일을 확인하세요.' };
    if (s === 403) return { kind: 'error', msg: msg || '영업부서만 협약 개시일을 적을 수 있습니다.' };
    if (s === 404) return { kind: 'error', msg: msg || '기관을 찾지 못했습니다.' };
    return { kind: 'error', msg: msg || '저장하지 못했습니다(오류 ' + s + '). 다시 시도하세요.' };
  };

  // ── 결재함 카드(규격 6-6): 기관·동작·이전·이후 ───────────────────────────
  function goalLine(year, tag, owner, hl) {
    hl = hl || {};
    const y = hl.year ? '<b class="mono">' + esc(year) + '</b>' : '<span class="mono">' + esc(year) + '</span>';
    const t = hl.tag ? '<b>' + esc(tag) + '</b>' : esc(tag);
    const w = owner ? ' · 주 담당 ' + (hl.owner ? '<b>' + esc(owner) + '</b>' : esc(owner)) : (hl.owner ? ' · <b>주 담당 없음</b>' : '');
    return y + ' 목표 · ' + t + w;
  }
  function beforeCell(x) {
    const b = x.before;
    if (!b) return '<span aria-hidden="true">—</span><span class="sr-only">없음, 새로 넣기</span>';
    if (b.kind_cd === 'WATCH') return '관심 기관 · ' + esc(b.tag_name);
    return goalLine(b.target_year, b.tag_name, b.owner_name);
  }
  function afterCell(x) {
    const b = x.before, memo = str(x.memo);
    let h, memoLine = '';
    switch (x.op_cd) {
      case 'ADD': h = goalLine(x.to_year, x.tag_name, x.owner_name); if (memo) memoLine = '<span class="tc-memo">메모: ' + esc(memo) + '</span>'; break;
      case 'EDIT': {
        const hl = b ? { year: Number(x.to_year) !== Number(b.target_year), tag: str(x.tag_name) !== str(b.tag_name), owner: str(x.owner_name) !== str(b.owner_name) } : {};
        h = goalLine(x.to_year, x.tag_name, x.owner_name, hl);
        if (b && memo !== str(b.memo)) memoLine = '<span class="tc-memo">메모: ' + (memo ? esc(memo) : '없음') + '</span>';
        break;
      }
      case 'CANCEL': h = '목표에서 빠짐' + (x.cancel_reason_name ? ' · 사유 ' + esc(x.cancel_reason_name) : ''); break;
      case 'TO_WATCH': h = '관심 기관(연도 없음)'; break;
      case 'TO_GOAL': h = '<span class="mono">' + esc(x.to_year) + '</span> 목표'; break;
      default: h = '';
    }
    return h + memoLine + (x.warn_cd === 'INST_BID_CLOSED' ? '<span class="warn">주의: 올해 입찰이 끝난 것으로 기록된 기관</span>' : '');
  }
  // 서버는 '다음 회차 목표로'를 EDIT + 연도 +1로 저장한다. 구분·주 담당·메모가 그대로이고 연도만 +1이면 그 이름으로 보인다(규격 6-4B).
  function cardOpName(x) {
    const b = x.before;
    if (x.op_cd === 'EDIT' && b && b.kind_cd !== 'WATCH' && Number(x.to_year) === Number(b.target_year) + 1 &&
      str(x.tag_name) === str(b.tag_name) && str(x.owner_name) === str(b.owner_name) && str(x.memo) === str(b.memo)) return tc.opLong('NEXT');
    return tc.opLong(x.op_cd) || x.op_cd;
  }
  tc.cardItemsHtml = function (items) {
    if (!Array.isArray(items) || !items.length) return '';
    return '<table class="ad-table ap-tc"><caption class="sr-only">바꿀 목표 기관 ' + items.length + '곳</caption>' +
      '<colgroup><col class="tc-c1"><col class="tc-c2"><col class="tc-c3"><col class="tc-c3"></colgroup>' +
      '<thead><tr><th scope="col">기관</th><th scope="col">동작</th><th scope="col">이전</th><th scope="col">이후</th></tr></thead><tbody>' +
      items.map(function (x) {
        return '<tr><th scope="row">' + esc(x.institution_name) + '</th><td>' + esc(cardOpName(x)) + '</td><td>' + beforeCell(x) + '</td><td>' + afterCell(x) + '</td></tr>';
      }).join('') + '</tbody></table>';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = tc;
  else root.tchange = tc;
})(typeof self !== 'undefined' ? self : this);
