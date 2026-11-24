(function (root) {
  'use strict';
  // 영업 추진 준비 › 협약준비 업무(NEXT 113 1단계). 두 진입 경로가 같은 '기관 상세 단계 틀'로 모인다.
  //   경로 1: 제안 준비 현황 표에서 기관 이름 → prepboard.js가 openFromBoard()를 부른다(#pp-root 안 #ts-detail-pp, 처음 단계 = 1단계).
  //   경로 2: 사이드바 task 메뉴 → app.showSoon이 mount()를 부른다(#ts-root, 그 칸 기준 기관 목록 → 이름 → 같은 상세, 처음 단계 = 그 task).
  // 규격: handoff/agents/design-reviewer/2026-11-24_1504_ab6354bd.md 5·6절. 서버 변경 없음 — GET /prep-board 한 번(X-Screen-Id prep_dashboard, X-Button-Id open|refresh).
  // 1단계는 읽기 전용이다 — 체크 저장은 제안 준비 현황 표에서만 한다. 단계 본문은 빈 틀('화면 준비 중').
  // 앞 절반은 순수 함수(node 시험 대상), 뒤 절반은 DOM 배선 — mount/openFromBoard가 불릴 때만 실행된다.
  const pt = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const pb = isNode ? require('./prepboard.js') : root.prepboard;

  function esc(s) { return logic.esc(s == null ? '' : s); }
  function str(v) { return v == null ? '' : String(v); }

  // ── 단계 정본(규격 6-3) ─────────────────────────────────────────
  // cd = 서버 PrepBoardColumns 칸 코드(묶음은 묶음 코드, 칸이 아닌 두 단계는 ''). kind: notice(읽기만)·auto(시스템이 채움)·proposal(읽기만·제안서)·manual(담당 영업 체크)·group(묶음)·board(이사회 자료 작성)·script(발표 대본).
  // menu: 사이드바 task 메뉴가 있는가(19개). link 'prep': 본문에도 [사전준비 상세 열기]를 둔다(T 연결 단계).
  function step(cd, label, kind, o) {
    return Object.assign({ cd: cd, id: cd, label: label, kind: kind, menu: false, link: '', subs: null }, o || {});
  }
  function sub(cd, label) { return { cd: cd, label: label }; }
  pt.TASK_PREFIX = 'soon:task:';
  pt.STEPS = [
    step('NOTICE_CHECK', '입찰공고확인', 'notice'),
    step('INST_ANALYSIS', '기관 정보 분석', 'auto', { menu: true, link: 'prep' }),
    step('PROFIT', '수익성분석', 'auto', { menu: true, link: 'prep' }),
    step('FIN_COMMITTEE', '가결위(재무)', 'manual', { menu: true }),
    step('BIZ_COMMITTEE', '출심위(사업부)', 'manual', { menu: true }),
    step('', '이사회 자료 작성', 'board', { id: 'BOARD_DOC' }),
    step('', '이사회 발표 대본', 'script', { id: 'BOARD_SCRIPT', link: 'prep' }),
    step('BOARD', '이사회', 'group', { menu: true, subs: [sub('BOARD_SECRETARIAT', '사무국'), sub('BOARD_AUDIT', '감사·감시'), sub('BOARD_COMPLIANCE', '준법')] }),
    step('PROPOSAL', '제안서', 'proposal'),
    step('PRESENT_DOC', '발표자료', 'manual', { menu: true }),
    step('SUBMIT_DOCS', '제출서류', 'manual', { menu: true, link: 'prep' }),
    step('SUBMIT_APPR', '제안서제출품의', 'group', { menu: true, subs: [sub('SUBMIT_MONITOR', '감시'), sub('SUBMIT_PROPERTY', '재산상이익')] }),
    step('PT', 'PT', 'manual', { menu: true }),
    step('RESULT', '결과발표', 'manual', { menu: true }),
    step('PRIORITY_NEGO', '우선협상', 'manual', { menu: true }),
    step('AGREE_LEGAL', '협약서(법률)', 'manual', { menu: true }),
    step('CONTRACT_APPR', '협약체결품의', 'group', { menu: true, subs: [sub('CONTRACT_AUDIT', '감사·감시'), sub('CONTRACT_STRATEGY', '전략'), sub('CONTRACT_PROPERTY', '재산상이익'), sub('CONTRACT_BRANCH', '영업점안내')] }),
    step('ATM', 'ATM', 'manual', { menu: true }),
    step('KB_CARD', 'KB카드', 'manual', { menu: true }),
    step('IT_BUILD', '전산구축', 'manual', { menu: true }),
    step('VIP', 'VIP 지정', 'manual', { menu: true }),
    step('RATE_APPROVAL', '금리승인', 'manual', { menu: true }),
    step('CEREMONY', '협약식', 'manual', { menu: true }),
  ];
  pt.menuSteps = function () { return pt.STEPS.filter(function (s) { return s.menu; }); };
  pt.stepByCd = function (cd) { return pt.STEPS.filter(function (s) { return !!s.cd && s.cd === cd; })[0] || null; };
  pt.indexOfCd = function (cd) {
    for (let i = 0; i < pt.STEPS.length; i += 1) { if (pt.STEPS[i].cd && pt.STEPS[i].cd === cd) return i; }
    return -1;
  };
  // 사이드바 항목 id → task 칸 코드. task 메뉴가 아니면 ''.
  pt.cdOfId = function (id) {
    const s = str(id);
    if (s.indexOf(pt.TASK_PREFIX) !== 0) return '';
    const st = pt.stepByCd(s.slice(pt.TASK_PREFIX.length));
    return st && st.menu ? st.cd : '';
  };
  pt.cdOf = pt.cdOfId;   // app.js showSoon이 cdOf 이름으로 부른다(지시서 3-7은 cdOf, 3-4는 cdOfId라 같은 함수에 두 이름을 둔다)

  // ── 문구(규격 5절) ───────────────────────────────────────────────
  const T = {
    hint: '— 기관마다 이 칸의 진행을 봅니다. 기관 이름을 누르면 단계별 상세로 갑니다. 체크는 제안 준비 현황 표에서 합니다.',
    stepsNav: '협약준비 단계',
    openPrep: '사전준비 상세 열기',
    openPrepAria: function (inst) { return inst + ' 사전준비 상세 열기 — 개설 신청·준비 과제'; },
    openBoard: '이사회 자료 작성 열기',
    openWorkflow: '제안서 진행 현황 열기',
    backTask: function (label) { return '← ' + label + ' 기관 목록으로'; },
    prev: function (label) { return '이전: ' + label; },
    next: function (label) { return '다음: ' + label; },
    prevNone: '이전 단계 없음',
    nextNone: '마지막 단계',
    phTitle: '화면 준비 중',
    phBody: '이 단계에서 확인할 산출물은 상의해 정한 뒤 이 자리에 보입니다. 지금은 제안 준비 현황 표의 체크 기록만 보입니다.',
    checkNote: '체크는 제안 준비 현황 표에서 담당 영업이 합니다.',
    boardNote: '이사회 자료는 이사회 자료 작성 화면에서 만들고 확정합니다.',
    scriptNote: '사전준비 상세의 \'이사회 발표 대본\' 과제에서 체크합니다.',
  };
  pt.T = T;
  pt.headHtml = function (label) {
    return '<b id="ts-list-title" tabindex="-1">' + esc(label) + '</b> <span class="dg-hint">' + esc(T.hint) + '</span>';
  };

  // ── 칸 값 읽기 ───────────────────────────────────────────────────
  const MARK_CODES = ['DONE', 'IN_PROGRESS', 'NA', 'NONE'];
  // → { mark, name, glyph, date(YYYY-MM-DD), by, notice }
  pt.cellState = function (row, cd, marks) {
    const c = row && row.cells && row.cells[cd] && typeof row.cells[cd] === 'object' ? row.cells[cd] : {};
    const m = MARK_CODES.indexOf(c.mark_cd) >= 0 ? c.mark_cd : 'NONE';
    return { mark: m, name: pb.markName(marks, m), glyph: pb.glyphKind(m), date: pb.fullDate(c.marked_on), by: str(c.by_name).trim(), notice: str(c.notice_status_name).trim() };
  };
  // 묶음 단계의 완료 개수 — 사실 개수만 센다(묶음 상태를 판정하지 않는다).
  pt.groupCount = function (row, s) {
    const subs = s && s.subs ? s.subs : [];
    return { done: subs.filter(function (x) { return pt.cellState(row, x.cd).mark === 'DONE'; }).length, total: subs.length };
  };

  // ── 단계 목록 ────────────────────────────────────────────────────
  // → [{ i, no, id, label, kind, ro, glyph, sr, cnt, current }]
  pt.stepsModel = function (row, idx, marks) {
    return pt.STEPS.map(function (s, i) {
      const m = { i: i, no: i + 1, id: s.id, label: s.label, kind: s.kind, ro: s.kind === 'notice' || s.kind === 'proposal', glyph: '', sr: '', cnt: '', current: i === idx };
      if (s.kind === 'group') { const g = pt.groupCount(row, s); m.cnt = '완료 ' + g.done + '/' + g.total; }
      else if (s.kind === 'notice') m.sr = pt.cellState(row, s.cd, marks).notice;
      else if (s.cd) { const c = pt.cellState(row, s.cd, marks); m.glyph = c.glyph; m.sr = c.name; }
      return m;
    });
  };
  // 목록은 탭 정지 1개(roving). rov = 탭 정지(0)를 가진 단계 번호.
  pt.stepsHtml = function (model, rov) {
    return '<ol>' + model.map(function (m) {
      return '<li><button type="button" class="ts-step' + (m.ro ? ' is-ro' : '') + '" data-i="' + m.i + '" tabindex="' + (m.i === rov ? '0' : '-1') + '"' + (m.current ? ' aria-current="step"' : '') + '>' +
        '<span class="ts-no">' + m.no + '</span><span class="ts-gl">' + pb.glyphSvg(m.glyph) + '</span><span class="ts-name">' + esc(m.label) + '</span>' +
        '<span class="ts-cnt">' + esc(m.cnt) + '</span>' + (m.sr ? '<span class="sr-only">, ' + esc(m.sr) + '</span>' : '') + '</button></li>';
    }).join('') + '</ol>';
  };
  // ↑↓·Home·End → 포커스를 옮길 번호, 그 밖의 키는 null(Enter·Space는 단추의 click이 선택한다).
  pt.stepKey = function (i, key, n) {
    switch (key) {
      case 'ArrowDown': return Math.min(n - 1, i + 1);
      case 'ArrowUp': return Math.max(0, i - 1);
      case 'Home': return 0;
      case 'End': return n - 1;
      default: return null;
    }
  };
  // 바뀐 단계 알림(sr-only role=status): "{기관}, {n}단계 {이름}, {상태}"
  pt.liveText = function (row, idx, marks) {
    const s = pt.STEPS[idx];
    if (!s) return '';
    const m = pt.stepsModel(row, idx, marks)[idx];
    const state = m.cnt || m.sr || '';
    return str(row && row.institution_name) + ', ' + (idx + 1) + '단계 ' + s.label + (state ? ', ' + state : '');
  };

  // ── 본문 ─────────────────────────────────────────────────────────
  // → { pos, title, kind, facts:[{l,v,mono,extra}], notes:[], subs:[], actions:[{act,label}], prev:{label,disabled}, next:{label,disabled} }
  pt.bodyModel = function (row, idx, marks) {
    const s = pt.STEPS[idx];
    const n = pt.STEPS.length;
    const b = { pos: (idx + 1) + ' / ' + n, title: s.label, kind: s.kind, facts: [], notes: [], subs: [], actions: [],
                prev: idx > 0 ? { label: T.prev(pt.STEPS[idx - 1].label), disabled: false } : { label: T.prevNone, disabled: true },
                next: idx < n - 1 ? { label: T.next(pt.STEPS[idx + 1].label), disabled: false } : { label: T.nextNone, disabled: true } };
    const pre = pb.preOpen(row);
    if (s.kind === 'notice') {
      b.facts.push({ l: '공고 상태', v: pt.cellState(row, s.cd, marks).notice || '없음' });
      b.notes.push(pb.T.infoNotice);
    } else if (s.kind === 'auto' || s.kind === 'proposal') {
      const c = pt.cellState(row, s.cd, marks);
      b.facts.push({ l: '상태', v: c.name });
      if (c.mark !== 'NONE' && c.date) b.facts.push({ l: '기록한 날', v: c.date, mono: true });
      b.notes.push(s.kind === 'proposal' ? pb.T.infoAutoProposal : pb.T.infoAuto);
      if (s.kind === 'proposal') b.actions.push({ act: 'workflow', label: T.openWorkflow });
    } else if (s.kind === 'manual') {
      const c = pt.cellState(row, s.cd, marks);
      b.facts.push({ l: '상태', v: c.name });
      if (c.mark !== 'NONE' && c.date) b.facts.push({ l: '마지막 체크', v: c.date, mono: true, extra: c.by });
      else b.facts.push({ l: '', v: pb.T.infoNoCheck });
      b.notes.push(T.checkNote);
      if (pre) b.notes.push(pb.T.infoPre);
    } else if (s.kind === 'group') {
      b.subs = s.subs.map(function (x) {
        const c = pt.cellState(row, x.cd, marks);
        return { label: x.label, glyph: c.glyph, name: c.name, date: c.date, by: c.by };
      });
      b.notes.push(T.checkNote);
      if (pre) b.notes.push(pb.T.infoPre);
    } else if (s.kind === 'board') {
      b.notes.push(T.boardNote);
      b.actions.push({ act: 'board', label: T.openBoard });
    } else if (s.kind === 'script') {
      b.notes.push(T.scriptNote);
    }
    if (s.link === 'prep' || s.kind === 'auto') b.actions.push({ act: 'prep', label: T.openPrep });
    return b;
  };
  pt.bodyHtml = function (row, idx, marks) {
    const b = pt.bodyModel(row, idx, marks);
    let h = '<div class="ts-pos">' + esc(b.pos) + '</div><h3 class="ts-step-title" id="ts-step-title">' + esc(b.title) + '</h3>';
    const labeled = b.facts.filter(function (f) { return !!f.l; });
    const loose = b.facts.filter(function (f) { return !f.l; }).map(function (f) { return f.v; });   // 라벨 없는 줄은 dl 밖 문단으로 — dt 없는 dd를 만들지 않는다
    if (labeled.length) {
      h += '<dl class="ts-facts">' + labeled.map(function (f) {
        return '<div><dt>' + esc(f.l) + '</dt><dd>' + (f.mono ? '<span class="m">' + esc(f.v) + '</span>' : esc(f.v)) + (f.extra ? ' ' + esc(f.extra) : '') + '</dd></div>';
      }).join('') + '</dl>';
    }
    h += loose.concat(b.notes).map(function (x) { return '<p class="ts-note">' + esc(x) + '</p>'; }).join('');
    if (b.subs.length) {
      h += '<ul class="ts-subs">' + b.subs.map(function (x) {
        return '<li>' + (pb.glyphSvg(x.glyph) || '<span class="pb-g"></span>') + '<span class="ts-sl">' + esc(x.label) + '</span><span>' + esc(x.name) + '</span>' +
          (x.date ? '<span class="m">' + esc(x.date) + '</span>' : '<span></span>') + '<span>' + esc(x.by) + '</span></li>';
      }).join('') + '</ul>';
    }
    if (b.actions.length) {
      h += '<div class="ts-acts">' + b.actions.map(function (a) {
        return '<button type="button" data-ts="' + esc(a.act) + '"' + (a.act === 'prep' ? ' aria-label="' + esc(T.openPrepAria(str(row && row.institution_name))) + '"' : '') + '>' + esc(a.label) + '</button>';
      }).join('') + '</div>';
    }
    h += '<div class="ts-ph"><b>' + esc(T.phTitle) + '</b>' + esc(T.phBody) + '</div>';
    h += '<div class="ts-pager"><button type="button" data-ts="prev"' + (b.prev.disabled ? ' disabled' : '') + '>' + esc(b.prev.label) + '</button>' +
      '<button type="button" data-ts="next"' + (b.next.disabled ? ' disabled' : '') + '>' + esc(b.next.label) + '</button></div>';
    return h;
  };

  function chipHtml(row) {
    const t = row.ended ? (str(row.state_name).trim() || pb.T.chipEnded) : pb.preOpen(row) ? pb.T.chipPre : row.is_mine === true ? pb.T.chipMine : '';
    return t ? '<span class="wf-badge pp-neutral pb-chip">' + esc(t) + '</span>' : '';
  }
  function assignees(row) { return (Array.isArray(row.assignee_names) ? row.assignee_names : []).filter(Boolean); }

  // o: { row, idx, rov, marks, backLabel } — 돌아가기·기관 머리·왼쪽 단계 목록·본문·live 문장
  pt.detailHtml = function (o) {
    const row = o.row;
    const names = assignees(row);
    return '<button type="button" class="pb-back" data-ts="back">' + esc(o.backLabel) + '</button>' +
      '<div class="ts-casehead"><div><h2 id="ts-title" tabindex="-1">' + esc(row.institution_name) + chipHtml(row) + '</h2>' +
      '<div class="ts-who">' + esc(names.length ? '담당 ' + names.join(', ') : pb.T.noAssignee) + '</div></div>' +
      '<button type="button" data-ts="prep" aria-label="' + esc(T.openPrepAria(str(row.institution_name))) + '">' + esc(T.openPrep) + '</button></div>' +
      '<div class="ts-detail"><nav class="ts-steps" id="ts-steps" aria-label="' + esc(T.stepsNav) + '">' + pt.stepsHtml(pt.stepsModel(row, o.idx, o.marks), o.rov) + '</nav>' +
      '<section class="ts-body" id="ts-body" aria-labelledby="ts-step-title">' + pt.bodyHtml(row, o.idx, o.marks) + '</section></div>' +
      '<div id="ts-live" class="sr-only" role="status"></div>';
  };

  // ── 경로 2: task별 기관 목록 ──────────────────────────────────────
  function stateCell(c) {
    return '<span class="ts-cell">' + (pb.glyphSvg(c.glyph) || '<span class="pb-g"></span>') + '<span>' + esc(c.name) + '</span></span>';
  }
  function dateSpan(c, block) {
    return c.mark !== 'NONE' && c.date ? '<' + (block ? 'div' : 'span') + ' class="ts-d">' + esc(c.date) + '</' + (block ? 'div' : 'span') + '>' : '';
  }
  // 단일 칸: 기관 | 담당 | 상태 | 마지막 체크 | 체크한 사람. 묶음 칸: 기관 | 담당 | {하위 칸 이름}…
  pt.listHead = function (s) {
    return '<thead><tr><th scope="col">기관</th><th scope="col">담당</th>' + (s.kind === 'group'
      ? s.subs.map(function (x) { return '<th scope="col">' + esc(x.label) + '</th>'; }).join('')
      : '<th scope="col">상태</th><th scope="col">마지막 체크</th><th scope="col">체크한 사람</th>') + '</tr></thead>';
  };
  pt.listRowHtml = function (row, s, marks) {
    const names = assignees(row);
    const nm = row.can_view === false ? '<span class="pb-nm-t">' + esc(row.institution_name) + '</span>'
      : '<button type="button" class="pb-nm" data-ts="name">' + esc(row.institution_name) + '</button>';
    let h = '<tr data-bid="' + esc(row.bid_case_id) + '"' + (row.ended ? ' class="is-ended"' : '') + '><th scope="row">' + nm + chipHtml(row) + '</th>' +
      '<td>' + esc(names.length ? names.join(', ') : pb.T.noAssignee) + '</td>';
    if (s.kind === 'group') {
      h += s.subs.map(function (x) { const c = pt.cellState(row, x.cd, marks); return '<td>' + stateCell(c) + dateSpan(c, true) + '</td>'; }).join('');
    } else {
      const c = pt.cellState(row, s.cd, marks);
      h += '<td>' + stateCell(c) + '</td><td>' + dateSpan(c, false) + '</td><td>' + esc(c.mark !== 'NONE' ? c.by : '') + '</td>';
    }
    return h + '</tr>';
  };
  // m: { step, rows(거른 뒤), marks }
  pt.listHtml = function (m) {
    return '<table class="ts-t"><caption class="sr-only">' + esc(m.step.label) + ' 기관 목록</caption>' + pt.listHead(m.step) + '<tbody>' +
      m.rows.map(function (r) { return pt.listRowHtml(r, m.step, m.marks); }).join('') + '</tbody></table>';
  };

  // ════════════════════════════════════════════════════════════════
  // 아래는 DOM 배선 — mount/openFromBoard가 불릴 때만 실행된다(노드 시험 대상 아님).
  // ════════════════════════════════════════════════════════════════
  function fresh() {
    return { from: '', host: null, cd: '', label: '', step: null, scope: '', q: '', data: null, state: 'idle', teamResolved: true, at: '', refreshing: false, announce: false,
             seq: 0, mode: 'list', bid: '', row: null, marks: [], idx: 0, rov: 0, ctx: null, who: '' };
  }
  let P = fresh();
  let reqSeq = 0;   // 요청 번호는 P 밖에서 단조 증가 — P가 새로 만들어져도 옛 응답 번호와 겹치지 않는다

  function el(id) { return document.getElementById(id); }
  function roleLabel() {
    try { const t = (root.store.loadProfile().team || '').trim(); return root.roles ? root.roles.roleLabel(t) : t; } catch (e) { return ''; }
  }
  // 계정 비교 키 — prep.js·team.js와 같은 모양(사번|역할). 읽을 수 없으면 ''.
  function whoNow() {
    try { return String((root.store.loadSession() || {}).emp || '') + '|' + String(root.store.loadProfile().team || '').trim(); } catch (e) { return ''; }
  }
  function soonActive() { const t = el('tab-soon'); return !!(t && t.classList && t.classList.contains('active')); }
  function openNav(id) { if (id && root.app && root.app.openNavItem) root.app.openNavItem(id); }
  function stateBox(text, action) { return '<p class="wf-empty">' + esc(text) + '</p>' + action; }
  function actionBtn(a) { return '<button type="button" data-ts="' + esc(a.act) + '">' + esc(a.label) + '</button>'; }
  function setErr(text) { const e = el('ts-err'); if (e) e.textContent = text || ''; }
  function live(text) { const e = el(P.mode === 'steps' ? 'ts-live' : 'ts-live-l'); if (e) e.textContent = text || ''; }

  function request(url, button) {
    return fetch(url, { headers: { 'X-Screen-Id': pb.SCREEN, 'X-Button-Id': button } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function norm(d) {
    const x = d && typeof d === 'object' ? d : {};
    return { marks: Array.isArray(x.marks) ? x.marks : [], rows: Array.isArray(x.rows) ? x.rows : [],
             scope: pb.scopeValid(x.scope) ? x.scope : '', teamResolved: x.team_resolved !== false };
  }
  function visibleRows() { return P.data ? pb.filterRows(P.data.rows, { q: P.q }) : []; }

  function skeletonHtml(label) {
    return '<div id="ts-list-v" class="ts-listv">' +
      '<div class="tm-head">' + pt.headHtml(label) + '</div>' +
      '<div class="pb-bar"><div class="pb-scope" id="ts-scope" role="group" aria-label="조회 범위" aria-describedby="ts-scope-note">' +
        pb.SCOPES.map(function (s) { return '<button type="button" class="pb-sc" data-scope="' + s + '" aria-pressed="false">' + esc(pb.scopeLabel(s)) + '</button>'; }).join('') + '</div>' +
      '<input type="text" id="ts-q" placeholder="기관 이름 검색" aria-label="기관 이름 검색" autocomplete="off">' +
      '<span class="pb-meta"><span id="ts-count"></span><span>불러온 시각 <b id="ts-at"></b></span>' +
      '<button type="button" id="ts-refresh" data-ts="refresh">' + esc(pb.T.refresh) + '</button></span></div>' +
      '<p id="ts-scope-note" class="pb-legend" hidden></p>' +
      '<p id="ts-noview" class="pb-legend" hidden>' + esc(pb.T.infoNoView) + '</p>' +
      '<div id="ts-err" class="ap-err" role="alert"></div>' +
      '<div class="pb-scroll ts-scroll" id="ts-scroll" aria-busy="false"></div>' +
      '<div id="ts-live-l" class="sr-only" role="status"></div></div>' +
      '<div id="ts-detail-t" class="ts-dhost" hidden></div>';
  }

  function paintScope() {
    const g = el('ts-scope');
    const cur = P.scope || 'mine';
    if (g && g.querySelectorAll) {
      Array.prototype.forEach.call(g.querySelectorAll('.pb-sc'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-scope') === cur ? 'true' : 'false'); });
    }
    const n = el('ts-scope-note');
    if (n) { const msg = pb.scopeNoteText(cur, P.teamResolved); n.hidden = !msg; n.textContent = msg; }
  }
  function paintMeta() {
    const total = P.data ? P.data.rows.length : 0;
    const c = el('ts-count'); if (c) c.innerHTML = P.data ? pb.countHtml(pb.countModel(visibleRows().length, total)) : '';
    const a = el('ts-at'); if (a) a.textContent = P.at;
    const b = el('ts-refresh');
    if (b) { b.textContent = P.refreshing ? pb.T.refreshing : pb.T.refresh; if (P.refreshing) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); }
    const nv = el('ts-noview'); if (nv) nv.hidden = !(P.data && P.data.rows.some(function (r) { return r && r.can_view === false; }));
    const box = el('ts-scroll'); if (box) box.setAttribute('aria-busy', P.state === 'loading' ? 'true' : 'false');
  }
  function paintList() {
    const box = el('ts-scroll');
    if (!box) return;
    if (P.state === 'loading') box.innerHTML = stateBox(pb.T.loading, '');
    else if (P.state === 'err') box.innerHTML = stateBox(pb.T.loadErr, '<button type="button" data-ts="retry">' + esc(pb.T.retry) + '</button>');
    else if (P.state === 'login') box.innerHTML = stateBox(root.prep && root.prep.T ? root.prep.T.login : pb.T.loadErr, '');
    else if (P.state === 'forbidden') box.innerHTML = stateBox(pb.T.forbidden(roleLabel()), '');
    else if (P.data) {
      const rows = visibleRows();
      const em = pb.emptyModel(P.data.rows.length, rows.length, { q: P.q, scope: P.scope, teamResolved: P.teamResolved });
      box.innerHTML = em ? stateBox(em.text, em.actions.map(actionBtn).join(' ')) : pt.listHtml({ step: P.step, rows: rows, marks: P.data.marks });
    }
    paintMeta();
  }

  function load(button) {
    const token = P.seq = ++reqSeq;
    if (!P.data) { P.state = 'loading'; paintList(); } else { P.refreshing = true; paintMeta(); }
    request(pb.boardUrl(P.scope, false), button).then(function (d) {
      if (token !== P.seq) return;
      P.data = norm(d);
      if (P.data.scope) P.scope = P.data.scope;   // 첫 응답(scope 없이 요청)이면 역할 기본값이 여기서 정해진다
      P.teamResolved = P.data.teamResolved;
      P.state = 'ok';
      P.refreshing = false;
      P.at = pb.hm(new Date());
      setErr('');
      paintScope();
      paintList();
      if (P.announce) { P.announce = false; live(pb.liveText(P.scope, visibleRows().length)); }
    }).catch(function (e) {
      if (token !== P.seq) return;
      P.refreshing = false;
      P.announce = false;
      const st = e && e.status;
      if (!P.data) { P.state = st === 403 ? 'forbidden' : st === 401 ? 'login' : 'err'; paintList(); }
      else { paintMeta(); setErr(st === 403 ? pb.T.forbidden(roleLabel()) : pb.T.loadErr); }
    });
  }
  function setScope(scope) {
    if (!pb.scopeValid(scope) || scope === P.scope) return;
    P.scope = scope;
    P.data = null;
    P.announce = true;
    setErr('');
    paintScope();
    load('refresh');
  }

  // ── 상세(두 경로 공용) ──
  function curBtn() { const n = el('ts-steps'); return n ? n.querySelector('.ts-step[data-i="' + P.idx + '"]') : null; }
  function scrollCur() { const b = curBtn(); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
  function paintSteps() {
    const n = el('ts-steps');
    if (!n) return;
    Array.prototype.forEach.call(n.querySelectorAll('.ts-step'), function (b) {
      const i = Number(b.getAttribute('data-i'));
      b.setAttribute('tabindex', i === P.rov ? '0' : '-1');
      if (i === P.idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  // keep: 'prev' | 'next' — 누른 단추에 포커스를 남긴다(연달아 누를 수 있게). 끝에서 그 단추가 비활성이 되면 반대 단추로 옮긴다.
  function paintBody(keep) {
    const b = el('ts-body');
    if (!b) return;
    b.innerHTML = pt.bodyHtml(P.row, P.idx, P.marks);
    b.scrollTop = 0;
    if (keep) {
      let t = b.querySelector('[data-ts="' + keep + '"]');
      if (t && t.disabled) t = b.querySelector('[data-ts="' + (keep === 'next' ? 'prev' : 'next') + '"]');
      if (t && t.focus) t.focus();
    }
  }
  function select(i, keep) {
    if (!(i >= 0 && i < pt.STEPS.length)) return;
    P.idx = i;
    P.rov = i;
    paintSteps();
    paintBody(keep);
    scrollCur();
    live(pt.liveText(P.row, P.idx, P.marks));
  }
  function moveFocus(i) {
    P.rov = i;
    paintSteps();
    const n = el('ts-steps');
    const b = n ? n.querySelector('.ts-step[data-i="' + i + '"]') : null;
    if (b) { b.focus(); if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
  }
  function renderDetail(host, backLabel) {
    host.innerHTML = pt.detailHtml({ row: P.row, idx: P.idx, rov: P.rov, marks: P.marks, backLabel: backLabel });
    const h2 = el('ts-title');
    if (h2 && h2.focus) h2.focus();   // 진입 시 포커스는 기관 이름 제목으로(prep.js pp-case-title과 같은 방식)
    scrollCur();
  }

  // 경로 2: 목록의 기관 이름 → 같은 목록 자리에서 상세(처음 단계 = 그 task)
  function openTaskDetail(bid) {
    const row = P.data ? P.data.rows.filter(function (r) { return str(r.bid_case_id) === bid; })[0] : null;
    if (!row || row.can_view === false) return;
    P.row = row; P.bid = bid; P.marks = P.data.marks; P.mode = 'steps';
    P.idx = Math.max(0, pt.indexOfCd(P.cd)); P.rov = P.idx;
    el('ts-list-v').hidden = true;
    const dt = el('ts-detail-t');
    dt.hidden = false;
    renderDetail(dt, T.backTask(P.label));
  }
  function back() {
    if (P.from === 'board') {
      const bid = P.bid, ctx = P.ctx;
      if (P.host) P.host.innerHTML = '';
      if (ctx && ctx.back) ctx.back(bid);   // prepboard.show가 is-steps를 지우고 표를 다시 불러 그 기관 이름으로 포커스를 돌린다
      return;
    }
    const bid2 = P.bid;
    P.mode = 'list';
    const dt = el('ts-detail-t'); dt.hidden = true; dt.innerHTML = '';
    el('ts-list-v').hidden = false;
    let target = null;
    Array.prototype.forEach.call(el('ts-scroll').querySelectorAll('tr[data-bid]'), function (tr) {
      if (tr.getAttribute('data-bid') === bid2) target = tr.querySelector('.pb-nm');
    });
    if (!target) target = el('ts-list-title');
    if (target && target.focus) target.focus();
  }
  function openPrep() {
    const row = P.row;
    if (!row) return;
    if (P.from === 'board') {
      const h = P.ctx && P.ctx.hooks;
      if (h && h.openCase) h.openCase(P.bid, str(row.institution_name));
      // openCase(prep.enterCase)가 먼저 표를 숨기고 상세를 연 뒤에 우리 틀을 걷는다 — leave()가 가려진 표의 스크롤(0)로 덮어쓰지 않게 이 순서를 지킨다.
      const pp = el('pp-root'); if (pp && pp.classList) pp.classList.remove('is-steps');
      if (P.host) P.host.innerHTML = '';
    } else if (root.prep && root.prep.openCase) {
      root.prep.openCase(P.bid, '');
    }
  }

  // ── 이벤트(두 host 공용) ──
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.classList.contains('ts-step')) { select(Number(t.getAttribute('data-i')), ''); return; }
    const sc = t.getAttribute('data-scope');
    if (sc) { setScope(sc); return; }
    const act = t.getAttribute('data-ts') || '';
    if (act === 'name') { const tr = t.closest('tr'); openTaskDetail(tr ? tr.getAttribute('data-bid') : ''); }
    else if (act === 'refresh') { if (!P.refreshing) { setErr(''); load('refresh'); } }
    else if (act === 'retry') { P.state = 'loading'; P.data = null; load('open'); }
    else if (act === 'map') openNav('map');
    else if (act === 'scope-mine') setScope('mine');
    else if (act === 'scope-team') setScope('team');
    else if (act === 'clearq') { P.q = ''; const q = el('ts-q'); if (q) q.value = ''; paintList(); }
    else if (act === 'back') back();
    else if (act === 'prev') select(P.idx - 1, 'prev');
    else if (act === 'next') select(P.idx + 1, 'next');
    else if (act === 'prep') openPrep();
    else if (act === 'board') openNav(root.nav && root.nav.BOARD_ID);
    else if (act === 'workflow') openNav('workflow');
  }
  function onKey(e) {
    const b = e.target && e.target.closest ? e.target.closest('.ts-step') : null;
    if (!b) return;
    const i = pt.stepKey(Number(b.getAttribute('data-i')), e.key, pt.STEPS.length);
    if (i === null) return;
    e.preventDefault();
    moveFocus(i);
  }
  function onInput(e) {
    if (e.target && e.target.id === 'ts-q') { P.q = e.target.value; paintList(); }
  }
  function wireHost(h) {
    if (h.getAttribute && h.getAttribute('data-ts-wired') === '1') return;
    h.addEventListener('click', onClick);
    h.addEventListener('keydown', onKey);
    h.addEventListener('input', onInput);
    h.setAttribute('data-ts-wired', '1');
  }

  // ── 바깥이 쓰는 문 ──
  // 경로 2의 자리(#ts-root). index.html에 마크업이 없으면 #tab-soon 안에 만든다.
  pt.host = function () {
    let h = el('ts-root');
    if (!h) {
      h = document.createElement('div');
      h.id = 'ts-root';
      h.style.display = 'none';
      (el('tab-soon') || document.body).appendChild(h);
    }
    return h;
  };
  // app.showSoon이 task 메뉴를 열 때마다 부른다. 거르기는 처음부터, 데이터는 다시 받는다.
  pt.mount = function (host, cd, label) {
    if (typeof document === 'undefined' || !host) return;
    const pp = el('pp-root'); if (pp && pp.classList) pp.classList.remove('is-steps');
    const d = el('ts-detail-pp'); if (d) d.innerHTML = '';
    P = fresh();
    P.who = whoNow();
    P.from = 'task'; P.host = host; P.cd = cd; P.label = str(label); P.step = pt.stepByCd(cd);
    if (!P.label && P.step) P.label = P.step.label;
    wireHost(host);
    host.innerHTML = skeletonHtml(P.label);
    paintScope();
    if (!P.step) { P.state = 'err'; paintList(); return; }
    load('open');
  };
  // 경로 1: prepboard.js가 기관 이름 클릭·Enter에서 부른다. ctx: { row, data, hooks, back(bid) }. 표는 CSS(#pp-root.is-steps)로 가린다 — prep.js showView가 hidden을 다시 쓰기 때문.
  pt.openFromBoard = function (ctx) {
    if (typeof document === 'undefined' || !ctx || !ctx.row) return false;
    const pp = el('pp-root');
    if (!pp) return false;
    let dt = el('ts-detail-pp');
    if (!dt) {
      dt = document.createElement('div');
      dt.id = 'ts-detail-pp';
      dt.className = 'ts-dhost';
      pp.insertBefore(dt, el('pp-modal') || null);
    }
    const th = el('ts-root'); if (th) th.innerHTML = '';   // 같은 id가 둘이 되지 않게 경로 2의 틀을 비운다
    P = fresh();
    P.who = whoNow();
    P.from = 'board'; P.host = dt; P.row = ctx.row; P.bid = str(ctx.row.bid_case_id); P.marks = ctx.data && Array.isArray(ctx.data.marks) ? ctx.data.marks : [];
    P.ctx = ctx; P.mode = 'steps'; P.idx = 0; P.rov = 0;
    wireHost(dt);
    pp.classList.add('is-steps');
    try {
      renderDetail(dt, pb.T.back);
    } catch (e) {
      // 그리다 실패하면 표를 되살리고 false — prepboard가 예전 경로(사전준비 상세)로 간다
      pp.classList.remove('is-steps');
      dt.innerHTML = '';
      P = fresh();
      return false;
    }
    return true;
  };
  // 계정이 바뀌면 앞 계정의 목록·상세를 버린다(app.onProfileChanged). 경로 2 화면이 열려 있었으면 새로 받는다.
  pt.onProfileChange = function () {
    if (typeof document === 'undefined') return;
    const now = whoNow();
    if (P.who === now) return;   // 같은 사람이면 열린 목록·상세를 그대로 둔다(다른 모듈과 같은 규칙)
    const wasTask = P.from === 'task' && P.host && P.host.style && P.host.style.display !== 'none' && soonActive() ? { host: P.host, cd: P.cd, label: P.label } : null;
    P = fresh();
    P.who = now;
    const d = el('ts-detail-pp'); if (d) d.innerHTML = '';
    const pp = el('pp-root'); if (pp && pp.classList) pp.classList.remove('is-steps');
    const h = el('ts-root'); if (h) h.innerHTML = '';
    if (wasTask) pt.mount(wasTask.host, wasTask.cd, wasTask.label);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = pt;
  else root.preptask = pt;
})(typeof self !== 'undefined' ? self : this);
