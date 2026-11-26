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
  // NEXT 는 결재함 옛 카드 이름 짓기(cardOpName)용으로만 남긴다: 서버에는 op EDIT + 연도 +1 로 간 옛 요청을 '다음 회차 목표로'로 읽는다. 새 요청 입구는 없다(사용자 11-26).
  const OP_LONG = { ADD: '목표에 넣기', EDIT: '목표 고치기', CANCEL: '목표에서 빼기', TO_WATCH: '관심으로 옮기기', TO_GOAL: '목표로 옮기기', NEXT: '다음 회차 목표로' };
  const OP_SHORT = { ADD: '넣기', EDIT: '고치기', CANCEL: '빼기', TO_WATCH: '관심으로', TO_GOAL: '목표로', NEXT: '다음 회차' };
  tc.opLong = function (op) { return has(OP_LONG, op) ? OP_LONG[op] : ''; };
  tc.opShort = function (op) { return has(OP_SHORT, op) ? OP_SHORT[op] : ''; };
  tc.GO_TEXT = { APPROVAL: '결재 요청', DIRECT: '바로 반영' };
  tc.APPROVAL_NOW_MSG = '목표에서 빼기·옮기기는 결재가 필요합니다. 줄을 고른 뒤 아래 [목표 기관에서 제외]나 [관심 기관으로]로 올리세요. 구분·금고 방식은 결재 없이 바로 바뀝니다.';
  tc.PAST_EDIT_MSG = '지난해 목표는 구분을 고칠 수 없습니다.';
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
    if (mode === 'APPROVAL') return tc.approverText(role, mode) + ' 결재가 끝날 때까지 이 기관들은 구분·금고 방식도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).';
    return (str(role).trim() === '영업부장' ? '영업부장은 ' : '') + '결재 없이 바로 반영합니다. 반영한 사람·시각은 기록에 남습니다.';
  };
  // 구분·메모 한꺼번에 수정 창(결재 없음, 규격 6-4A)
  tc.EDIT_GO = '수정하기';
  tc.EDIT_HINT = '결재 없이 바로 반영합니다. 바꾼 사람·시각은 기록에 남습니다.';
  tc.editTitle = function (n) { return '고른 기관 수정 — ' + n + '곳'; };
  tc.eun = function (w) { return jong(w) > 0 ? '은' : '는'; };
  tc.memoFlash = function (name, memo) {
    return str(name) + (str(memo).trim() ? ' 메모를 저장했습니다. 결재 없이 반영되고 기록에 남습니다.' : ' 메모를 지웠습니다. 기록에 남습니다.');
  };
  tc.editResultText = function (n, what) { return '목표 기관 ' + Number(n) + '곳의 ' + (str(what) || '구분') + '을 수정했습니다. 결재 없이 반영되고 기록에 남습니다.'; };
  tc.pendingLockMsg = function (name) { return str(name) + tc.eun(name) + ' 방금 결재 요청에 들어가 잠겼습니다. 결재가 끝나면 다시 바꿀 수 있습니다.'; };

  // ── 고른 줄(탭·연도·거르기를 바꿔도 남는다, 기관 하나 = 한 줄) ──────────
  tc.newSel = function () { return { ids: [], by: {} }; };
  tc.selCount = function (s) { return s && s.ids ? s.ids.length : 0; };
  tc.hasSel = function (s, id) { return has(s.by, id); };
  tc.pickable = function (r) { return !!r && !r.out && !r.pend && (r.kind !== 'WATCH' || Number(r.movable) > 0); };   // 관심 줄은 [목표로 옮기기]가 보이는 줄만(규격 6-1)
  tc.entryOfRow = function (r) {   // pend = 결재 중 줄(toWatchBulkState가 skip, 다른 연도에서 고른 줄이 그사이 잠겼을 때 실제로 닿는다 — qa 11-26 P3-1)
    return { id: r.id, name: r.name, regionName: r.regionName, kind: r.kind === 'WATCH' ? 'WATCH' : 'GOAL', targetNo: r.targetNo, revNo: r.revNo, year: Number(r.targetYear) || 0,
      tagCd: r.tagCd, tagName: r.tagName, aimCd: r.aimCd || '', aimName: r.aimName || '', memo: r.memo || '', ownerEmpNo: r.ownerEmpNo || '', ownerName: r.ownerName || '', moveYear: Number(r.movable) || 0, closed: !!r.closed, pend: !!r.pend };
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

  // ── 구분 바뀜 대기(저장 전, 사용자 11-25): d = { 기관 id: { no: 목표 번호, tagCd, tagName } }. 고른 줄에만 둔다(고르기를 풀면 같이 버린다).
  const liveDraft = function (d, s, id) {
    const x = d && has(d, id) ? d[id] : null;
    if (!x || !has(s.by, id) || Number(s.by[id].targetNo) !== x.no) return false;
    const e = s.by[id];
    return x.tagCd !== e.tagCd || (x.aimCd !== undefined && str(x.aimCd) !== str(e.aimCd));
  };
  tc.draftOf = function (d, r) { const x = d && r && has(d, r.id) ? d[r.id] : null; return x && x.no === Number(r.targetNo) ? x : null; };
  // 구분·금고 방식은 한 대기에 함께 담긴다. 한 칸을 원래 값으로 되돌리면 그 칸만 빠지고, 둘 다 원래 값이면 대기를 지운다(false).
  function normDraft(d, r, x) {
    if (x.aimCd !== undefined && str(x.aimCd) === str(r.aimCd)) { delete x.aimCd; delete x.aimName; }
    if (x.tagCd === r.tagCd && x.aimCd === undefined) { delete d[r.id]; return false; }
    d[r.id] = x;
    return true;
  }
  function draftBase(d, r) { return tc.draftOf(d, r) || { no: Number(r.targetNo), tagCd: r.tagCd, tagName: str(r.tagName) }; }
  tc.setDraft = function (d, r, code, name) {
    const x = draftBase(d, r), keep = !code || code === r.tagCd;
    x.tagCd = keep ? r.tagCd : code; x.tagName = keep ? str(r.tagName) : str(name || code);
    return normDraft(d, r, x);
  };
  tc.setAimDraft = function (d, r, code, name) {   // code '' = 금고 방식 비움('-')
    const x = draftBase(d, r);
    x.aimCd = str(code); x.aimName = str(name);
    return normDraft(d, r, x);
  };
  tc.draftAim = function (d, e) { const x = tc.draftOf(d, e); return x && x.aimCd !== undefined ? x.aimCd : undefined; };
  function whatOfList(d, list) {   // 띠·확인 상자 문구에 쓰는 '무엇이 바뀌나'
    let t = false, a = false;
    (list || []).forEach(function (e) {
      const x = tc.draftOf(d, e); if (!x) return;
      if (x.tagCd !== e.tagCd) t = true;
      if (x.aimCd !== undefined && str(x.aimCd) !== str(e.aimCd)) a = true;
    });
    return t && a ? '구분·금고 방식' : (a ? '금고 방식' : '구분');
  }
  tc.draftWhatOf = whatOfList;
  tc.draftWhat = function (d, s) { return whatOfList(d, ((s && s.ids) || []).filter(function (id) { return liveDraft(d, s, id); }).map(function (id) { return s.by[id]; })); };
  tc.draftCount = function (d, s) { return ((s && s.ids) || []).filter(function (id) { return liveDraft(d, s, id); }).length; };
  tc.pruneDrafts = function (d, s) {   // 고르기가 풀렸거나 서버 값과 같아진 대기를 버리고 버린 기관 id 목록을 돌려준다
    const out = [];
    Object.keys(d || {}).forEach(function (id) { if (!liveDraft(d, s, id)) { delete d[id]; out.push(id); } });
    return out;
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
    it.op = op === 'EDIT' || op === 'CANCEL' || op === 'TO_WATCH' ? op : '';
    it.cancelCd = ''; it.cancelEtc = '';
    if (it.op === 'EDIT') { it.year = Number(pre.year) || it.snap.year || 0; it.tag = pre.tag || it.snap.tagCd; it.memo = it.snap.memo; it.aim = pre.aim !== undefined ? str(pre.aim) : str(it.snap.aimCd); }
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
        if (Number(it.year) === Number(s.year) && it.tag === s.tagCd && str(it.aim === undefined ? s.aimCd : it.aim) === str(s.aimCd) && str(it.memo).trim() === str(s.memo).trim()) bad(it, 'edit', '고친 내용이 없습니다. 칸을 바꾸거나 이 기관을 이번 수정에서 빼세요.');
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
    if (it.op === 'ADD') { b.target_year = Number(it.year); if (it.tag) b.tag_cd = it.tag; b.memo = str(it.memo).trim() || null; return b; }   // 구분은 비워 둘 수 있다(사용자 11-25). 금고 방식 키는 ADD에 없다(서버 400)
    b.target_no = it.snap.targetNo; b.base_rev_no = it.snap.revNo;
    if (it.op === 'EDIT') { b.op_cd = 'EDIT'; b.target_year = Number(it.year); b.tag_cd = it.tag; b.owner_emp_no = it.snap.ownerEmpNo || null; if (it.aim !== undefined && str(it.aim) !== str(it.snap.aimCd)) b.aim_rank_cd = str(it.aim); }   // memo 키는 보내지 않는다 — 서버가 '키 없음 = 지금 값 유지'(BidTargetRules.keepUnsent)라 금칙어가 든 옛 메모에 걸리지 않는다(qa 11-25 P2-1)
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
    pending: '방금 다른 결재 요청에 들어가 잠겼습니다. 이 기관을 이번 수정에서 빼고 다시 올려 주세요.',
    stale: '다른 사람이 먼저 고쳤습니다. 최신 기록으로 다시 읽었으니 이전·이후를 확인하고 다시 올려 주세요.',
    cancelled: '이미 목표에서 빠진 기관입니다. 이번 수정에서 빼 주세요.',
    notOwner: '다른 사람의 관심 기관은 바꿀 수 없습니다. 내 관심 기관만 올릴 수 있으니 이번 수정에서 빼 주세요.',   // 403 NOT_WATCH_OWNER(관심은 사람별, NEXT 117)
    alreadyWatch: '이미 내 관심 기관에 들어 있습니다. 이번 수정에서 빼 주세요.' };   // 409 ALREADY_WATCH(목표→관심 결재를 올릴 때)
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
  tc.resultOf = function (body, n, kind, what) {
    const direct = !!body && body.mode === 'DIRECT';
    const cnt = direct && Number(body.applied) > 0 ? Number(body.applied) : Number(n);
    return { mode: direct ? 'DIRECT' : 'APPROVAL', n: cnt,
      text: direct ? (kind === 'edit' ? tc.editResultText(cnt, what) : kind === 'delete' ? '목표 기관 ' + cnt + '곳을 목표에서 뺐습니다. 뺀 기록(누가·언제·사유)은 남습니다.' : kind === 'towatch' ? '목표 기관 ' + cnt + '곳을 내 관심 기관으로 옮겼습니다. 옮긴 기록(누가·언제)은 팀 이력에 남습니다.' : '목표 기관 ' + cnt + '곳을 바로 반영했습니다.') : '결재 요청을 올렸습니다 — 목표 기관 ' + cnt + '곳. 결재가 끝날 때까지 이 기관들은 잠깁니다.' };
  };

  // ── 자동 이월 알림(규격 5-5) — 받은 숫자로만 만든다 ───────────────────────
  tc.carryMerge = function (a, b) {
    const g = function (o, k) { return Number(o && o[k]) || 0; };
    return { carried: g(a, 'carried') + g(b, 'carried'), revoked: g(a, 'revoked') + g(b, 'revoked'), skipped: g(a, 'skipped') + g(b, 'skipped'), more: !!(b && b.more) };
  };
  tc.carryText = function (s) {
    const c = Number(s && s.carried) || 0, r = Number(s && s.revoked) || 0, k = Number(s && s.skipped) || 0, parts = [];
    // 목표를 다음 해 목표로 넘기는 자동 이월은 없어졌다(서버 e01af679) — carried는 다른 은행이 약정해 관심 기관으로 넘어간 기관만 센다
    if (c > 0) parts.push('다른 은행이 약정한 기관 ' + c + '곳을 관심 기관으로 넘겼습니다.');
    if (r > 0) parts.push('판정이 바뀐 ' + r + '곳은 관심 기관으로 자동으로 넘긴 기록을 거뒀습니다(기록은 남습니다).');
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
      if ((r.tagCd === 'NEW' || !r.tagCd) && r.prevYear) out.push('되찾기 후보: 예전 국민은행 금고(마지막 ' + r.prevYear + '년)');
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
    // 왼쪽부터 숫자 문장·선택 지우기 | [수정하기] [관심 기관으로] [목표 기관에서 제외](오른쪽 끝 묶음, 무거운 동작이 맨 오른쪽, 사용자 11-26). 꺼져도 Tab으로 닿고(aria-disabled) 이유는 -why·title·누르면 상태 줄(사용자 11-25 재요청)
    return '<div class="hb-selbar" id="hb-selbar" role="region" aria-label="고른 기관" hidden><span class="n" id="hb-seln" role="status"></span>' +
      '<button type="button" id="hb-selclr" class="lnk">선택 지우기</button><span class="sp"></span>' +
      '<button type="button" id="hb-seledit" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-seledit-why">수정하기</button><span id="hb-seledit-why" class="sr-only"></span>' +
      '<button type="button" id="hb-seltow" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-seltow-why">관심 기관으로</button><span id="hb-seltow-why" class="sr-only"></span>' +
      '<button type="button" id="hb-seldel" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-seldel-why">목표 기관에서 제외</button><span id="hb-seldel-why" class="sr-only"></span>' +
      '</div>';
  };
  // 숫자 문장(role=status). 20곳 한도 같은 짧은 알림은 같은 자리에서 읽힌다.
  // kinds = { goal, watch }(없으면 '고른 기관 n곳'), off = 이 화면 밖에 고른 줄 수(규격 6-1)
  // note = 일반색 알림(경고 아님) — 저장 전 구분 바뀜 건수 — msg(한도 경고 .lim)가 있으면 msg가 이긴다.
  tc.autoPickNote = function (n, what) { return (str(what) || '구분') + ' 바뀜 ' + Number(n) + '곳 — [수정하기]로 저장'; };   // 저장 전 대기 건수(사용자 11-25)
  tc.selStatusHtml = function (n, msg, kinds, off, note) {
    n = Number(n); off = Number(off) || 0;
    const g = kinds ? Number(kinds.goal) || 0 : 0, w = kinds ? Number(kinds.watch) || 0 : 0;
    const lab = g && w || !kinds ? '기관' : (w ? '관심 기관' : '목표 기관');
    const mix = g && w ? '(목표 ' + g + '·관심 ' + w + ')' : '';
    const nt = !msg && note ? str(note) : '';
    const sr = msg ? msg : (nt ? nt + '. ' : '') + (kinds ? lab + ' ' + n + '곳 고름' + mix + (off > 0 ? ', 이 화면 밖 ' + off + '곳 포함' : '') : n + '곳 고름');
    return '<span class="sr-only">' + esc(sr) + '</span><span aria-hidden="true">고른 ' + lab + ' <b>' + n + '</b>곳' + mix + (off > 0 ? ' · 이 화면 밖 ' + off + '곳' : '') + '</span>' +
      (msg ? '<span class="lim" aria-hidden="true">' + esc(msg) + '</span>' : '') + (nt ? '<span class="note" aria-hidden="true">' + esc(nt) + '</span>' : '');
  };
  // 결재 중인 줄의 구분 칸: 쓰기 자격자는 눌러 보는 칩(버튼), 그 밖은 글자 칩(span). 구분 이름은 title·sr로만
  tc.pendCellHtml = function (r, o) {
    const nm = str(r.tagName || r.tagCd) || '정하지 않음', info = r.pendInfo;
    if (!(o && o.canEdit) || !info) return '<td title="결재가 진행 중인 기관입니다"><span class="hb-pend"><svg viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg>결재 중</span><span class="sr-only">. 구분 ' + esc(nm) + '</span></td>';
    const opS = tc.opShort(info.op), opL = tc.opLong(info.op), when = tc.kst(info.at);
    const tip = ['구분: ' + nm, '결재 중' + (opL ? ': ' + opL + ' 요청' : ''), str(info.by) + (when ? ' ' + when : '')].filter(Boolean).join(' · ');
    const aria = '결재 중' + (opL ? ': ' + opL + ' 요청' : '') + (info.by ? ', 요청자 ' + info.by : '') + (when ? ', ' + when : '') + '. 자세히 보기';
    return '<td title="' + esc(tip) + '"><button type="button" class="hb-pend" data-act="pend" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="dialog" aria-label="' + esc(aria) + '">' +
      '<svg viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg>결재 중' + (opS ? ' · ' + esc(opS) : '') + '</button><span class="sr-only">. 구분 ' + esc(nm) + '</span></td>';
  };

  // ── 띠 [수정하기]·[삭제하기] 확인 상자 + 기관 상세 팝업·줄 끝 동작 칸 [관심 기관으로…] 확인 상자(사용자 11-25 재요청, NEXT 114) ──────
  tc.EDIT_SKIP = '바뀐 내용 없음 — 제외';
  tc.DEL_SKIP = '관심 기관 — 제외';
  tc.EDIT_NONE = '바뀐 내용이 없습니다. 표에서 구분이나 금고 방식을 고르면 켜집니다.';
  tc.EDIT_NOPERM = '이 계정은 구분·금고 방식을 바로 고칠 수 없습니다.';
  tc.DEL_WATCH = '고른 줄이 모두 관심 기관입니다. 관심 기관은 각 줄의 [관심에서 빼기…]로 뺍니다.';
  tc.DEL_NOREASON = '제외 사유 목록을 받지 못했습니다. 목록을 다시 불러온 뒤 시도하세요.';
  tc.TOWATCH_GONE = '이 기관은 지금 옮길 수 없는 상태입니다. 목록을 다시 불러왔으니 확인하세요.';
  // [수정하기]: 보낼 줄 = 구분 바뀜 대기가 살아 있는 고른 줄. 나머지(대기 없음·관심)는 skip('제외'로 보임). c = { canBulk }
  tc.editState = function (s, d, c) {
    c = c || {};
    const send = [], skip = [];
    ((s && s.ids) || []).forEach(function (id) { (liveDraft(d, s, id) ? send : skip).push(s.by[id]); });
    const r = { on: false, why: '', send: send, skip: skip };
    if (!send.length && !skip.length) r.why = '고른 기관이 없습니다.';
    else if (!c.canBulk) r.why = tc.EDIT_NOPERM;   // 권한을 대기 여부보다 먼저 본다 — 권한 없는 계정에 '구분을 고르면 켜집니다'라고 하지 않는다(qa P3-2)
    else if (!send.length) r.why = tc.EDIT_NONE;
    else r.on = true;
    return r;
  };
  // [목표 기관에서 제외](옛 [삭제하기]): 보낼 줄 = 고른 목표 줄. 관심 줄은 skip(관심 빼기는 각 줄 [관심에서 빼기…]). c = { hasMode, nReasons, noWatch, year }
  // r.watch = 같은 창 둘째 갈래 '관심 기관으로 옮기기'의 판정(tc.toWatchBulkState) — r.on은 첫째 갈래(CANCEL) 기준 그대로
  tc.deleteState = function (s, c) {
    c = c || {};
    const send = [], skip = [];
    ((s && s.ids) || []).forEach(function (id) { (s.by[id].kind === 'WATCH' ? skip : send).push(s.by[id]); });
    const r = { on: false, why: '', send: send, skip: skip, watch: tc.toWatchBulkState(s, c) };
    if (!send.length && !skip.length) r.why = '고른 기관이 없습니다.';
    else if (!c.hasMode) r.why = '결재를 올릴 수 없습니다.';
    else if (!send.length) r.why = tc.DEL_WATCH;
    else if (!(Number(c.nReasons) > 0)) r.why = tc.DEL_NOREASON;
    else r.on = true;
    return r;
  };
  // 띠 [관심 기관으로](사용자 11-26): 보낼 줄 = 고른 목표 줄 중 올해 이후 목표. 관심 줄·지난해 목표·결재 중 줄은 skip. c = { hasMode, noWatch, year(올해) }
  tc.TOWATCH_NOWATCH = '이 서버는 관심 기관을 지원하지 않아 옮길 수 없습니다.';
  tc.TOWATCH_NONE = '옮길 수 있는 목표 기관이 없습니다. 관심 기관·지난해 목표는 옮기지 않습니다.';
  tc.TOWATCH_GO = '옮기기 요청';
  tc.TOWATCH_REASON = '목표 기관에서 관심 기관으로 옮기기';   // 결재 사유(서버 필수) — 고정 문구라 개인정보 검사에 걸리지 않는다(tc.deleteReason과 같은 방식)
  tc.toWatchBulkState = function (s, c) {
    c = c || {};
    const send = [], skip = [];
    ((s && s.ids) || []).forEach(function (id) { const e = s.by[id]; (e.kind === 'WATCH' || e.pend || tc.isPastYear(e.year, c.year) ? skip : send).push(e); });
    const r = { on: false, why: '', send: send, skip: skip };
    if (!send.length && !skip.length) r.why = '고른 기관이 없습니다.';
    else if (!c.hasMode) r.why = '결재를 올릴 수 없습니다.';
    else if (c.noWatch) r.why = tc.TOWATCH_NOWATCH;
    else if (!send.length) r.why = tc.TOWATCH_NONE;
    else r.on = true;
    return r;
  };
  tc.editLine = function (e, d) {
    const x = tc.draftOf(d, e), none = '정하지 않음', out = [];
    const tagCh = !x || x.tagCd !== e.tagCd, aimCh = !!(x && x.aimCd !== undefined && str(x.aimCd) !== str(e.aimCd));
    if (tagCh) out.push((tagCh && aimCh ? '구분 ' : '') + (str(e.tagName || e.tagCd) || none) + ' → ' + (str(x ? x.tagName : '') || none));
    if (aimCh) out.push('금고 방식 ' + (str(e.aimName || e.aimCd) || none) + ' → ' + (str(x.aimName) || none));
    return out.join(' · ');   // 예: '재유치 도전 → 신규유치 도전' / '금고 방식 정하지 않음 → 1금고' / 둘 다면 '구분 … → … · 금고 방식 … → …'
  };
  tc.deleteLine = function (e, d) { return (Number(e.year) > 0 ? e.year + ' ' : '') + '목표에서 뺌' + (tc.draftOf(d, e) ? ' · 바뀐 ' + whatOfList(d, [e]) + '은 버림' : ''); };
  tc.approverShort = function (role) { const r = str(role).trim(); return r === '영업팀' ? '팀장 결재' : (r === '영업팀장' ? '부장 결재' : '결재'); };
  function pickedText(n, total, mid) { n = Number(n); total = Number(total) || n; return total === n ? '선택한 ' + n + '곳을' : '선택한 ' + total + '곳 중 ' + mid + n + '곳을'; }
  tc.editQuestion = function (n, total) {
    n = Number(n); total = Number(total) || n;
    return total === n ? '선택한 ' + n + '곳에 대하여 수정하시겠습니까?' : pickedText(n, total, '바뀐 ') + ' 수정하시겠습니까?';
  };
  // m = { n, total, mode, role, thisYear }
  tc.deleteQuestion = function (m) {
    const where = (m.thisYear ? '올해 ' : '') + '목표에서';
    return pickedText(m.n, m.total, '') + ' ' + where + (m.mode === 'APPROVAL' ? ' 빼도록 ' + tc.approverShort(m.role) + '를 요청하시겠습니까?' : ' 바로 빼시겠습니까?');
  };
  // m = { name, mode, role, thisYear } — 기관 하나
  tc.toWatchQuestion = function (m) {
    const nm = str(m.name), where = (m.thisYear ? '올해 ' : '') + '목표에서 빼고 내 관심 기관으로';
    return nm + tc.eul(nm) + ' ' + where + (m.mode === 'APPROVAL' ? ' 옮기도록 ' + tc.approverShort(m.role) + '를 요청하시겠습니까?' : ' 바로 옮기시겠습니까?');
  };
  // 띠 [관심 기관으로] 확인 창. m = { n, total, mode, role }. 승인 주체 문장은 역할에 따라(영업팀 → '팀장 결재')
  tc.toWatchNQuestion = function (m) { return pickedText(m.n, m.total, '') + ' 관심 기관으로 ' + (m.mode === 'APPROVAL' ? '옮기시겠습니까?' : '바로 옮기시겠습니까?'); };
  tc.toWatchNSub = function (m) { return m.mode === 'APPROVAL' ? tc.approverShort(m.role) + ' 요청으로 올라가고, 승인되면 옮겨집니다.' : '결재 없이 바로 옮겨집니다.'; };   // 옮긴 기록 문장은 상단 안내(toWatchFact)가 말한다 — 같은 문장을 두 번 쓰지 않는다(design 11-26 S1)
  // [목표 기관에서 제외] 창 상단 안내 — 결재 주체·바로 반영은 하단 공통 문장(tc.dropNote)이 말하므로 여기서는 잠금·기록만(DESIGN 중복 금지).
  // 잠금은 구분 칩뿐 아니라 금고 방식 칩도 건다(kbboard aimCellHtml: 결재 중 줄은 읽기 전용) — 그래서 '구분·금고 방식도'.
  tc.dropHint = function (mode) { return mode === 'APPROVAL' ? '결재가 끝날 때까지 이 기관들은 구분·금고 방식도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).' : '반영한 사람·시각은 기록에 남습니다.'; };
  // [관심 기관으로] 창 상단 안내: 구분·메모 그대로 + 기록 문장, 결재 모드는 잠금 한 줄을 더한다(qa 11-26 P3-3)
  tc.toWatchNHint = function (mode) { return mode === 'APPROVAL' ? tc.toWatchFact('') + ' ' + tc.dropHint('APPROVAL') : tc.toWatchFact(''); };
  // 보낼 기관 이름 한 줄(qa 11-26 P2-1): '대상: 가나구청, 마바군청' 최대 3곳 + ' 외 n곳', 지금 화면(탭·연도·거르기) 밖이 있으면 ' (화면 밖 n곳 포함)'
  tc.targetLine = function (names, off) {
    const a = (names || []).map(str).filter(Boolean), o = Number(off) || 0;
    if (!a.length) return '';
    return '대상: ' + a.slice(0, 3).join(', ') + (a.length > 3 ? ' 외 ' + (a.length - 3) + '곳' : '') + (o > 0 ? ' (화면 밖 ' + o + '곳 포함)' : '');
  };
  // 보낼 줄 가운데 저장 전 구분·금고 방식 대기가 있으면 알리는 한 줄(qa 11-26 P2-2). branch 'cancel'(제외) | 'towatch'(관심으로)
  tc.discardLine = function (n, what, branch) {
    return '저장하지 않은 ' + (str(what) || '구분·금고 방식') + ' 바뀜 ' + Number(n) + '곳은 ' + (branch === 'cancel' ? '버립니다.' : '버리고 지금 저장된 값으로 옮깁니다.');
  };
  // t = { names, off, dn, dwhat } → 이름 줄 + (대기가 있으면) 버림 줄. 보낼 기관이 없으면 ''
  tc.tgtHtml = function (t, branch) {
    if (!t || !t.names || !t.names.length) return '';
    return '<p class="tc-skipnote">' + esc(tc.targetLine(t.names, t.off)) + '</p>' + (Number(t.dn) > 0 ? '<p class="tc-skipnote">' + esc(tc.discardLine(t.dn, t.dwhat, branch)) + '</p>' : '');
  };
  // 고른 항목 list 중 지금 화면 줄(rows) 안에 없는 수(탭·연도·거르기 밖)
  tc.offCount = function (list, rows) {
    return (list || []).filter(function (e) { return !(rows || []).some(function (r) { return r && !r.out && r.id === e.id && Number(r.targetNo) === Number(e.targetNo); }); }).length;
  };
  // list 중 저장 전 대기가 살아 있는 항목 수와 무엇(구분·금고 방식)이 바뀌나
  tc.draftInfo = function (d, s, list) {
    const live = (list || []).filter(function (e) { return liveDraft(d, s, e.id); });
    return { dn: live.length, dwhat: live.length ? whatOfList(d, live) : '' };
  };
  // [목표 기관에서 제외] 창 공통 문장(라디오 아래)
  tc.dropNote = function (m) { return m.mode === 'APPROVAL' ? '어느 쪽이든 ' + tc.approverShort(m.role) + ' 요청으로 올라갑니다.' : '어느 쪽이든 결재 없이 바로 반영됩니다.'; };
  tc.toWatchHint = function (mode, role) {
    return mode === 'APPROVAL' ? tc.approverText(role, mode) + ' 결재가 끝나면 옮겨지고, 그때까지 이 기관은 구분·금고 방식도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).' : tc.dlgHint('DIRECT', role);
  };
  tc.toWatchFact = function (tagName) { return (str(tagName) ? '구분(' + str(tagName) + ')' : '구분') + '과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 팀 이력에 남습니다.'; };
  tc.deleteReason = function (reasons, cd, etc) {   // 결재 사유(서버 필수): 고른 빼는 사유에서 만든다(고정 문구라 개인정보 검사에 걸리지 않는다)
    const r = (reasons || []).filter(function (x) { return x.code === cd; })[0], e = cd === tc.ETC_CD ? str(etc).trim() : '';
    return '목표에서 빼기 — ' + (r ? r.name : str(cd)) + (e ? ': ' + e : '');
  };
  tc.bulkTitle = function (m) {
    if (m.kind === 'towatch') return '내 관심 기관으로 옮기기 — ' + str(m.regionName) + ' ' + str(m.name);
    if (m.kind === 'towatchn') return '관심 기관으로 옮기기 — ' + Number(m.n) + '곳';
    const what = m.kind === 'delete' ? '목표 기관에서 제외' : (m.what === '금고 방식' ? '금고 방식 수정' : (m.what === '구분·금고 방식' ? '구분·금고 방식 수정' : '구분 수정'));   // m.what = draftWhat 결과(팀 결정 11-26)
    return what + ' — ' + Number(m.n) + '곳';
  };
  tc.bulkQuestion = function (m) { return m.kind === 'towatch' ? tc.toWatchQuestion(m) : (m.kind === 'towatchn' ? tc.toWatchNQuestion(m) : (m.kind === 'delete' ? tc.dropNote(m) : tc.editQuestion(m.n, m.total))); };   // delete 창은 라디오 아래 공통 문장이 질문 자리(aria-describedby)
  // rows = [{ name, regionName, text, skip }] — 보낼 줄이 먼저, 제외 줄이 뒤(번호 없이 '—')
  tc.bulkItemsHtml = function (rows) {
    let no = 0;
    return (rows || []).map(function (r) {
      return '<li class="tc-item"><div class="tc-ih"><span class="no" aria-hidden="true">' + (r.skip ? '—' : ++no) + '</span><span class="nm" title="' + esc((str(r.regionName) ? str(r.regionName) + ' ' : '') + str(r.name)) + '"><span class="rg">' + esc(r.regionName) + '</span>' + esc(r.name) + '</span><span class="fix">' + esc(r.text) + '</span></div></li>';
    }).join('');
  };
  // m = { kind:'edit'|'delete'|'towatch', mode, role, rows, n, total, thisYear, reasons:[{code,name}], name·regionName·tagName(towatch) }. 덮개는 body 직계로 붙이고 dlg.open으로 연다.
  tc.bulkDialogHtml = function (m) {
    const kind = m.kind === 'delete' || m.kind === 'towatch' || m.kind === 'towatchn' ? m.kind : 'edit', del = kind === 'delete', tw = kind === 'towatch', twn = kind === 'towatchn', appr = m.mode === 'APPROVAL', rs = m.reasons || [];
    const go = del ? (appr ? tc.GO_TEXT.APPROVAL : '빼기') : (twn ? (appr ? tc.TOWATCH_GO : '옮기기') : (tw ? (appr ? tc.GO_TEXT.APPROVAL : '옮기기') : '수정'));   // 결재면 '결재 요청'('관심 기관으로'는 '옮기기 요청'), 바로 반영이면 동사. delete 창은 첫 라디오(제외) 기준 — 라디오를 바꾸면 kbboard.bulkChoose가 글자를 바꾼다
    const total = Number(m.total) || 0, skipN = Math.max(0, total - (Number(m.n) || 0)), wSkip = Math.max(0, total - (Number(m.wn) || 0));
    const req = '<span class="dlg-req" aria-hidden="true">*</span><span class="sr-only"> (필수)</span>';
    const reasonBox = !del ? '' :
      '<div id="tc-bd-rsbox"><div class="dlg-f"><label for="tc-bd-rs">제외 사유' + req + '</label><select id="tc-bd-rs"><option value="" selected>고르세요</option>' +
      rs.map(function (x) { return '<option value="' + esc(x.code) + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="dlg-f" id="tc-bd-etcrow" hidden><label for="tc-bd-etc">기타 사유' + req + '</label><input id="tc-bd-etc" maxlength="' + tc.ETC_MAX + '" aria-describedby="tc-bd-etch"><p class="tc-sub"><span id="tc-bd-etch">사유에는 개인정보를 적지 마세요.</span></p></div></div>';   // 사유는 첫 라디오(제외)일 때만 — #tc-bd-rsbox를 둘째 라디오에서 숨긴다
    // 라디오 둘(사용자 11-26): 제외(CANCEL) / 관심 기관으로 옮기기(TO_WATCH). 둘째가 켜질 수 없으면 disabled + 이유
    const opts = !del ? '' :
      '<fieldset class="tc-opts"><legend class="sr-only">어떻게 제외할지 고르세요</legend>' +
      '<label class="tc-opt"><input type="radio" name="tc-bd-do" value="cancel" checked><span><b>목표 기관에서 제외</b><small>목표에서 뺍니다. 관심 기관에도 남지 않습니다.</small>' + (skipN ? '<small>관심 기관 ' + skipN + '곳은 제외하지 않습니다.</small>' : '') + '</span></label>' +
      '<label class="tc-opt' + (m.won ? '' : ' off') + '"><input type="radio" name="tc-bd-do" value="towatch"' + (m.won ? '' : ' disabled') + '><span><b>관심 기관으로 옮기기</b><small>목표에서 빼고 내 관심 기관으로 계속 지켜봅니다.</small>' +
      (m.won ? (wSkip ? '<small>관심 기관·지난해 목표 ' + wSkip + '곳은 옮기지 않습니다.</small>' : '') : '<small>' + esc(m.wwhy) + '</small>') + '</span></label></fieldset>';
    const hint = del ? tc.dropHint(m.mode) : (twn ? tc.toWatchNHint(m.mode) : (tw ? tc.toWatchHint(m.mode, m.role) : tc.EDIT_HINT));
    // 보낼 기관 이름 줄(+ 저장 전 대기 버림 줄): 제외 창은 라디오 갈래마다 하나씩(둘째는 hidden, kbboard.bulkChoose가 바꾼다), [관심 기관으로] 창은 하나
    const tgt = function (id, t, branch, hide) { return '<div class="tc-tgt" id="' + id + '"' + (hide ? ' hidden' : '') + '>' + tc.tgtHtml(t, branch) + '</div>'; };
    const body = tw
      ? '<p id="tc-bd-q">' + esc(tc.bulkQuestion(m)) + '</p><p class="tc-sub">' + esc(tc.toWatchFact(m.tagName)) + '</p>' + (appr ? reasonBoxHtml({ mode: 'APPROVAL', reason: '' }) : '')
      : (twn ? '<p id="tc-bd-q">' + esc(tc.bulkQuestion(m)) + '</p><p class="tc-sub">' + esc(tc.toWatchNSub(m)) + '</p>' + (skipN ? '<p class="tc-skipnote">관심 기관·지난해 목표 ' + skipN + '곳은 옮기지 않습니다.</p>' : '') + tgt('tc-bd-tgt-towatch', m.wtgt, 'towatch', false)
        : (del ? opts + tgt('tc-bd-tgt-cancel', m.ctgt, 'cancel', false) + tgt('tc-bd-tgt-towatch', m.wtgt, 'towatch', true) + reasonBox + '<p id="tc-bd-q">' + esc(tc.bulkQuestion(m)) + '</p>'
          : '<p id="tc-bd-q">' + esc(tc.bulkQuestion(m)) + '</p>' + reasonBox + '<ol class="tc-items" id="tc-bd-items">' + tc.bulkItemsHtml(m.rows) + '</ol>'));
    return '<div id="tc-bd" class="modal-overlay" style="display:none" data-kind="' + kind + '"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="tc-bd-t" aria-describedby="tc-bd-q">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tc-bd-t" tabindex="-1">' + esc(tc.bulkTitle(m)) + '</h2><div class="dlg-acts"><button type="button" id="tc-bd-cancel">취소</button>' +
      '<button type="button" id="tc-bd-go" class="' + (del && !appr ? 'dlg-danger' : 'dlg-go') + '">' + esc(go) + '</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">' + esc(hint) + '</p><p class="dlg-err" id="tc-bd-err" role="alert"></p></div>' +
      '<div class="dlg-body">' + body + '</div></div></div>';
  };
  // 목표→관심 서버 오류: 기관 하나짜리 상자라 '이번 수정에서 빼 주세요' 같은 일괄 창 문장을 쓰지 않는다. → { msg, field(사유 칸 아래), refresh(목록을 다시 읽고 상자를 닫는다) }
  tc.toWatchError = function (x, items) {
    const e = tc.errorOf(x, items), s = x ? Number(x.status) || 0 : 0, d = x && x.body ? x.body.detail : null, code = d && typeof d === 'object' && typeof d.code === 'string' ? d.code : '';
    let msg = e.item ? e.item.msg : (e.msg || e.top), refresh = !!e.refresh;
    if (s === 409 && code === 'ALREADY_WATCH') msg = '이미 내 관심 기관에 들어 있어 옮길 수 없습니다. 옮기려면 내 관심 탭에서 먼저 빼고 다시 시도하세요.';
    else if (s === 409 && code === 'CHANGE_PENDING') msg = '방금 다른 결재 요청에 들어가 잠겼습니다. 결재가 끝난 뒤 다시 시도해 주세요.';
    else if (s === 409 && code === 'STALE') msg = '다른 사람이 먼저 고쳤습니다. 최신 기록으로 다시 읽었으니 확인하고 다시 시도하세요.';
    else if (s === 409 && code === 'ALREADY_CANCELLED') { msg = '이미 목표에서 빠진 기관입니다. 목록을 다시 불러왔습니다.'; refresh = true; }
    return { msg: msg, field: e.kind === 'field' || !!(e.item && e.item.f === 'text'), refresh: refresh };
  };
  // 띠 [수정하기]·[삭제하기] 확인 상자 오류(qa 11-25 P2-3·P3-3): '이번 수정에서 빼 주세요'·'n번째'는 이 상자에 맞지 않는다 — 기관 이름으로 말하고, 잠김·이미 빠짐은 목록을 다시 읽는다(refresh).
  // 다시 읽으면 그 줄이 보낼 목록에서 빠지므로 '다시 누르세요'로 끝낸다. → { msg, refresh }
  tc.bulkError = function (x, items, kind) {
    const e = tc.errorOf(x, items), s = x ? Number(x.status) || 0 : 0, d = x && x.body ? x.body.detail : null, code = d && typeof d === 'object' && typeof d.code === 'string' ? d.code : '';
    if (!e.item) return { msg: e.msg || e.top, refresh: !!e.refresh };
    const it = (items || []).filter(function (z) { return z && z.uid === e.item.uid; })[0], nm = it ? str(it.name) : '', verb = kind === 'delete' ? '빼지' : (kind === 'towatch' ? '옮기지' : '저장하지');
    if (s === 409 && code === 'ALREADY_WATCH') return { msg: nm + tc.eun(nm) + ' 이미 내 관심 기관에 들어 있어 옮기지 못했습니다. 선택을 풀고 나머지만 다시 누르세요.', refresh: false };
    if (s === 409 && code === 'CHANGE_PENDING') return { msg: nm + tc.eun(nm) + ' 방금 결재 요청에 들어가 잠겨 ' + verb + ' 못했습니다. 목록을 다시 읽었으니 확인하고 다시 누르세요.', refresh: true };
    if (s === 409 && code === 'ALREADY_CANCELLED') return { msg: nm + tc.eun(nm) + ' 이미 목표에서 빠진 기관입니다. 목록을 다시 읽었으니 확인하고 다시 누르세요.', refresh: true };
    return { msg: nm + tc.eul(nm) + ' 확인하세요. ' + e.item.msg, refresh: !!e.refresh };
  };
  // ── 기관 상세 팝업 머리 [관심 기관으로…](현황판에서 연 팝업만). r = 현황판의 그 기관 목표 줄(없으면 null), c = { mode, readOnly, noWatch, year(올해) }. 위에서부터 처음 맞는 것
  tc.toWatchState = function (r, c) {
    c = c || {};
    if (!c.mode || c.readOnly || c.noWatch) return { show: false };
    if (!r || r.out || r.kind === 'WATCH') return { show: false };
    if (tc.isPastYear(r.targetYear, c.year)) return { show: false };
    if (r.pend) return { show: true, pend: true, info: r.pendInfo || null, tagName: str(r.tagName || r.tagCd) };
    return { show: true, pend: false };
  };
  // 판정에 쓸 줄 고르기(순수): list = 거르기·탭 전의 목표 줄 전체. 그 기관의 목표 줄(관심·목표 밖 제외) 하나, 없으면 null.
  tc.towatchPick = function (list, id) {
    const k = str(id);
    return k ? (list || []).filter(function (r) { return r && r.id === k && !r.out && r.kind !== 'WATCH'; })[0] || null : null;
  };
  tc.toWatchDesc = function (mode, role) {
    if (mode !== 'APPROVAL') return '목표에서 빼고 내 관심 기관으로 바로 옮깁니다.';
    const r = str(role).trim();
    return '목표에서 빼고 내 관심 기관으로 옮깁니다. ' + (r === '영업팀장' ? '영업부장' : (r === '영업팀' ? '영업팀장' : '팀장')) + ' 결재가 필요합니다.';
  };
  // o = { mode, role, disabled(확정 확인 상자가 열린 동안) } → .dm-btns 안에 들어갈 조각. 결재 중이면 단추 대신 글자 칩(팝업 Tab 가두기가 꺼진 단추를 건너뛴다)
  tc.toWatchHeadHtml = function (s, o) {
    o = o || {};
    if (!s || !s.show) return '';
    if (s.pend) {
      const info = s.info || {}, opS = tc.opShort(info.op), opL = tc.opLong(info.op), when = tc.kst(info.at);
      const tip = [s.tagName ? '구분: ' + s.tagName : '', '결재 중' + (opL ? ': ' + opL + ' 요청' : ''), str(info.by) + (when ? ' ' + when : '')].filter(Boolean).join(' · ');
      const sr = (opL ? opL + ' ' : '') + '결재가 진행 중입니다.' + (info.by ? ' 요청자 ' + info.by + (when ? ', ' + when : '') + '.' : '');
      return '<span class="hb-pend dm-pend" title="' + esc(tip) + '"><svg viewBox="0 0 12 12" aria-hidden="true">' + LOCK_IN + '</svg>결재 중' + (opS ? ' · ' + esc(opS) : '') + '</span><span class="sr-only">' + esc(sr) + '</span>';
    }
    const d = tc.toWatchDesc(o.mode, o.role);
    return '<button type="button" id="dm-towatch" class="dm-sub" data-hx="towatch" aria-haspopup="dialog" aria-describedby="dm-towatch-d" title="' + esc(d) + '"' + (o.disabled ? ' disabled' : '') + '>관심 기관으로…</button><span id="dm-towatch-d" class="sr-only">' + esc(d) + '</span>';
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
    const s = it.snap, tag = str(s.tagName || s.tagCd) ? esc(s.tagName || s.tagCd) : '구분 정하지 않음';
    if (s.kind === 'WATCH') return '관심 기관 · ' + tag;
    return '<span class="mono">' + esc(s.year) + '</span> 목표 · ' + tag + (s.ownerName ? ' · 주 담당 ' + esc(s.ownerName) : '') + (it.op === 'EDIT' ? ' · 메모 ' + (s.memo ? esc(s.memo) : '없음') : '');
  };
  tc.afterBlockHtml = function (it, o) {
    o = o || {};
    const id = function (k) { return 'tc-i' + it.uid + '-' + k; }, u = ' data-uid="' + it.uid + '"';
    let dd;
    if (it.op === 'ADD') {
      dd = '<span class="mono">' + esc(it.year) + '</span> 목표 · ' + (it.add.tagName ? esc(it.add.tagName) : '구분 정하지 않음') + (it.memo ? '<span class="tc-memo">메모: ' + esc(it.memo) + '</span>' : '');
    } else if (it.op === 'EDIT') {
      dd = '<label for="' + id('y') + '">목표 연도</label><select id="' + id('y') + '"' + u + ' data-f="year">' + yearOpts(yearsFor(it, o.years), it.year, false) + '</select>' +
        '<label for="' + id('t') + '">구분</label><select id="' + id('t') + '"' + u + ' data-f="tag">' + '<option value=""' + (it.tag ? '' : ' selected') + '>-</option>' + (o.tags || []).map(function (t) {
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
    } else if (it.op === 'TO_WATCH') {
      dd = '관심 기관(연도 없음)';
    } else if (it.op === 'TO_GOAL') {
      dd = '<label for="' + id('y') + '">목표 연도</label><select id="' + id('y') + '"' + u + ' data-f="year">' + yearOpts(yearsFor(it, o.years), it.year, true) + '</select>';
    } else {
      dd = '<span class="tc-memo">빼기나 옮기기를 고르면 이어서 정합니다.</span>';
    }
    // 결재 요청 칸 줄에도 [협약 개시일 적기…] — 지난해 목표처럼 바로 반영 칸이 꺼진 줄도 입구가 있게(qa P2-2). 넣는 줄(ADD)은 제외.
    const judge = it.op !== 'ADD' && o.terms && has(o.terms, it.id) ? o.terms[it.id] : null;
    const tg = judge !== null ? '<button type="button" class="tc-termgo"' + u + ' data-inst="' + esc(it.id) + '" aria-haspopup="dialog" aria-label="' + esc(it.name) + ' 협약 개시일 적기">협약 개시일 적기…</button>' + (judge ? '<span class="tc-memo">' + esc(judge) + '</span>' : '') : '';
    return '<dl class="tc-ba"><dt>이전</dt><dd>' + tc.beforeHtml(it) + '</dd><dt>이후</dt><dd>' + dd + tg + '</dd></dl>';
  };
  tc.itemHtml = function (it, n, o) {
    const hid = 'tc-i' + it.uid + '-h', u = ' data-uid="' + it.uid + '"';
    const opCtl = tc.isFixed(it) ? '<span class="fix">' + esc(tc.opLong(it.op)) + '</span>'
      : '<label class="sr-only" for="tc-i' + it.uid + '-op">' + esc(it.name) + ' 동작</label><select id="tc-i' + it.uid + '-op"' + u + ' data-f="op"><option value=""' + (it.op ? '' : ' selected') + '>빼기·옮기기 고르기</option>' +
        ['CANCEL', 'TO_WATCH'].map(function (op) { return '<option value="' + op + '"' + (it.op === op ? ' selected' : '') + '>' + esc(tc.opLong(op)) + '</option>'; }).join('') + '</select>';   // 목표 고치기(EDIT)는 목록에 없다 — 구분·메모는 결재 없이 따로 고친다(NEXT 114)
    return '<li class="tc-item" role="group" aria-labelledby="' + hid + '"' + u + '><div class="tc-ih"><span class="no">' + Number(n) + '</span><span class="nm" id="' + hid + '"><span class="rg">' + esc(it.regionName) + '</span>' + esc(it.name) + '</span>' + opCtl +
      '<button type="button" class="tc-x"' + u + ' aria-label="' + esc(it.name) + ' 이번 수정에서 빼기">이번 수정에서 빼기</button></div>' + tc.afterBlockHtml(it, o) + '<p class="dlg-ferr" id="tc-i' + it.uid + '-e"></p></li>';
  };
  // m = { mode, items, reason, role }, o = { years, tags, reasons }. 덮개는 body 직계로 붙이고 dlg.open으로 연다.
  function reasonBoxHtml(m) {   // 사유 칸(결재 요청일 때만)
    return m.mode === 'APPROVAL' ? '<div class="dlg-f"><label for="tc-reason">사유<span class="dlg-req" aria-hidden="true">*</span><span class="sr-only"> (필수)</span></label>' +
      '<textarea id="tc-reason" rows="3" maxlength="' + tc.REASON_MAX + '" aria-describedby="tc-rh tc-rc tc-re">' + esc(m.reason || '') + '</textarea>' +
      '<p class="tc-sub"><span id="tc-rh">결재자가 읽습니다. 개인정보를 적지 마세요.</span><span id="tc-rc" class="mono">' + str(m.reason).length + '/' + tc.REASON_MAX + '</span></p><p class="dlg-ferr" id="tc-re"></p></div>' : '';
  }
  function allopHtml(items) {   // 동작 한꺼번에 정하기
    const free = (items || []).filter(function (x) { return !tc.isFixed(x); });
    return free.length >= 2 && free.some(function (x) { return !x.op; }) ? '<div class="tc-all"><label for="tc-allop">고른 목표 줄 모두</label><select id="tc-allop"><option value="">동작 한꺼번에 정하기</option><option value="CANCEL">목표에서 빼기</option><option value="TO_WATCH">관심으로 옮기기</option></select></div>' : '';
  }
  tc.dialogHtml = function (m, o) {
    const approval = m.mode === 'APPROVAL', items = m.items || [];
    const reasonBox = reasonBoxHtml(m), allop = allopHtml(items);
    return '<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="approval"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="tc-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tc-t" tabindex="-1">' + esc(tc.dlgTitle(m.mode, items.length)) + '</h2><div class="dlg-acts"><button type="button" id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">' + esc(tc.GO_TEXT[approval ? 'APPROVAL' : 'DIRECT']) + '</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint">' + esc(tc.dlgHint(m.mode, m.role)) + '</p><p class="dlg-err" id="tc-err" role="alert"></p></div>' +
      '<div class="dlg-body">' + reasonBox + allop + '<ol class="tc-items" id="tc-items">' + items.map(function (it, i) { return tc.itemHtml(it, i + 1, o); }).join('') + '</ol></div></div></div>';
  };
  // 구분·메모 한꺼번에 수정 창(규격 6-4A): 같은 #tc-dlg 뼈대, 사유 칸·동작 칸·연도 칸 없음. 연도는 지금 값 그대로 보낸다.
  function tagOpts(tags, cur) {
    return '<option value=""' + (cur ? '' : ' selected') + '>-</option>' + (tags || []).map(function (t) { return '<option value="' + esc(t.code) + '"' + (t.code === cur ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
  }
  tc.editItemHtml = function (it, n, o) {
    o = o || {};
    const hid = 'tc-i' + it.uid + '-h', u = ' data-uid="' + it.uid + '"', id = function (k) { return 'tc-i' + it.uid + '-' + k; };
    // o.terms = { 기관id: 달성 판정일 글 } — 협약 개시일을 적을 수 있는 줄에만 [협약 개시일 적기…](구분 메뉴에서 옮겨 온 입구, 누르면 개시일 창이 열린다)
    const judge = o.terms && has(o.terms, it.id) ? o.terms[it.id] : null;
    const dd = '<label for="' + id('t') + '">구분</label><select id="' + id('t') + '"' + u + ' data-f="tag">' + tagOpts(o.tags, it.tag) + '</select>' +
      '<label for="' + id('m') + '">메모</label><input id="' + id('m') + '"' + u + ' data-f="memo" maxlength="' + tc.MEMO_MAX + '" size="20" value="' + esc(it.memo) + '">' +
      (judge !== null ? '<button type="button" class="tc-termgo"' + u + ' data-inst="' + esc(it.id) + '" aria-haspopup="dialog" aria-label="' + esc(it.name) + ' 협약 개시일 적기">협약 개시일 적기…</button>' + (judge ? '<span class="tc-memo">' + esc(judge) + '</span>' : '') : '');
    return '<li class="tc-item" role="group" aria-labelledby="' + hid + '"' + u + '><div class="tc-ih"><span class="no">' + Number(n) + '</span><span class="nm" id="' + hid + '"><span class="rg">' + esc(it.regionName) + '</span>' + esc(it.name) + '</span>' +
      '<span class="fix">바로 반영</span><button type="button" class="tc-x"' + u + ' aria-label="' + esc(it.name) + ' 이번 수정에서 빼기">이번 수정에서 빼기</button></div>' +
      '<dl class="tc-ba"><dt>이전</dt><dd>' + tc.beforeHtml(it) + '</dd><dt>이후</dt><dd>' + dd + '</dd></dl><p class="dlg-ferr" id="tc-i' + it.uid + '-e"></p></li>';
  };
  // 두 칸 세그먼트(사용자 11-25): 「구분·메모 고치기(바로 반영)」/「빼기·옮기기(결재 요청)」. 지금 고른 쪽만 보낸다.
  // 두 칸이 켜지는 조건(문장 포함)은 고른 줄로 정한다. s = 고른 줄 묶음({ids,by}), c = { canBulk: 구분·메모를 바로 고칠 수 있는 계정/서버, hasMode: 결재·바로 반영 모드가 있음, year: 올해 }
  tc.modeAvail = function (s, c) {
    c = c || {};
    const n = tc.selCount(s), k = tc.kindCounts(s);
    const e = { on: true, why: '' }, a = { on: true, why: '' };
    if (!n) { e.on = a.on = false; e.why = a.why = '고른 기관이 없습니다.'; return { edit: e, approval: a }; }
    if (k.watch > 0) { e.on = false; e.why = '관심 기관이 섞여 있어 고칠 수 없습니다.'; }
    else if (tc.pastCount(s, c.year) > 0) { e.on = false; e.why = '지난해 목표가 있어 고칠 수 없습니다.'; }
    else if (!c.canBulk) { e.on = false; e.why = '이 계정은 구분·메모를 바로 고칠 수 없습니다.'; }
    const acts = s.ids.some(function (id) { const x = s.by[id]; return x.kind !== 'WATCH' || Number(x.moveYear) > 0; });
    if (!c.hasMode) { a.on = false; a.why = '결재 요청을 올릴 수 없습니다.'; }
    else if (!acts) { a.on = false; a.why = '고른 줄에 빼기·옮기기를 할 수 있는 기관이 없습니다.'; }
    return { edit: e, approval: a };
  };
  function segHtml(kind, av) {
    const one = function (v, label, small, x) {
      return '<label' + (x.on ? '' : ' class="off"') + '><input type="radio" name="tc-mode" value="' + v + '"' + (kind === v ? ' checked' : '') + (x.on ? '' : ' disabled') + '>' +
        '<span>' + esc(label) + '</span><small>' + esc(x.on ? small : x.why) + '</small></label>';
    };
    return '<fieldset class="tc-mode"><legend class="sr-only">무엇을 고칠지 고르세요</legend>' +
      one('edit', '구분·메모 고치기', '바로 반영', av.edit) + one('approval', '빼기·옮기기', '결재 요청', av.approval) + '</fieldset>';
  }
  // 지금 고른 쪽 본문(.dlg-body 안쪽) — 칸을 바꿔 오가면 이 조각만 다시 그린다(입력값은 항목 모델에 남아 있다)
  tc.modeBodyHtml = function (m, o) {
    const items = m.items || [];
    if (m.kind === 'approval') return reasonBoxHtml(m) + allopHtml(items) + '<ol class="tc-items" id="tc-items">' + items.map(function (it, i) { return tc.itemHtml(it, i + 1, o); }).join('') + '</ol>';
    const all = items.length >= 2 ? '<div class="tc-all"><label for="tc-alltag">고른 목표 줄 모두</label><select id="tc-alltag"><option value="">구분 한꺼번에 정하기</option>' + tagOpts(o && o.tags, '') + '</select></div>' : '';
    return all + '<ol class="tc-items" id="tc-items">' + items.map(function (it, i) { return tc.editItemHtml(it, i + 1, o); }).join('') + '</ol>';
  };
  tc.modeHint = function (m) { return m.kind === 'approval' ? tc.dlgHint(m.mode, m.role) : tc.EDIT_HINT; };
  tc.modeGo = function (m) { return m.kind === 'approval' ? tc.GO_TEXT[m.mode === 'APPROVAL' ? 'APPROVAL' : 'DIRECT'] : tc.EDIT_GO; };
  // m = { kind:'edit'|'approval'(기본 edit), items(지금 고른 쪽 항목), mode(결재 쪽 'APPROVAL'|'DIRECT'), role, reason, n(고른 곳 수, 기본 items 수), avail(tc.modeAvail 결과, 기본 둘 다 켜짐) }, o = { tags, years, reasons, terms }
  tc.editDialogHtml = function (m, o) {
    const kind = m.kind === 'approval' ? 'approval' : 'edit', items = m.items || [];
    const av = m.avail || { edit: { on: true, why: '' }, approval: { on: true, why: '' } };
    const mm = { kind: kind, items: items, mode: m.mode || 'DIRECT', role: m.role, reason: m.reason };
    return '<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="' + kind + '"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="tc-t">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="tc-t" tabindex="-1">' + esc(tc.editTitle(m.n != null ? m.n : items.length)) + '</h2><div class="dlg-acts"><button type="button" id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">' + esc(tc.modeGo(mm)) + '</button></div></header>' +
      '<div class="dlg-note">' + segHtml(kind, av) + '<p class="dlg-hint" id="tc-hint">' + esc(tc.modeHint(mm)) + '</p><p class="dlg-err" id="tc-err" role="alert"></p></div>' +
      '<div class="dlg-body">' + tc.modeBodyHtml(mm, o) + '</div></div></div>';
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
    const tg = str(tag) ? esc(tag) : '구분 정하지 않음';   // esc(null)이 'null'이 되지 않게(qa P2-1)
    const t = hl.tag ? '<b>' + tg + '</b>' : tg;
    const w = owner ? ' · 주 담당 ' + (hl.owner ? '<b>' + esc(owner) + '</b>' : esc(owner)) : (hl.owner ? ' · <b>주 담당 없음</b>' : '');
    return y + ' 목표 · ' + t + w;
  }
  function beforeCell(x) {
    const b = x.before;
    if (!b) return '<span aria-hidden="true">—</span><span class="sr-only">없음, 새로 넣기</span>';
    if (b.kind_cd === 'WATCH') return '관심 기관' + (str(b.tag_name) ? ' · ' + esc(b.tag_name) : ' · 구분 정하지 않음');
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
        if (b && str(x.aim_rank_cd) !== str(b.aim_rank_cd)) {   // NEXT 114 ③ — 결재자 눈에 금고 방식 바뀜이 보이게(security 하-1)
          memoLine += '<span class="tc-memo">금고 방식: ' + (str(b.aim_rank_name) ? esc(b.aim_rank_name) : '정하지 않음') + ' → <b>' +
            (str(x.aim_rank_name) ? esc(x.aim_rank_name) : '정하지 않음') + '</b></span>';
        }
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
      str(x.tag_name) === str(b.tag_name) && str(x.owner_name) === str(b.owner_name) && str(x.memo) === str(b.memo) &&
      str(x.aim_rank_cd) === str(b.aim_rank_cd)) return tc.opLong('NEXT');
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
