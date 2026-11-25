(function (root) {
  'use strict';
  // 영업 추진 준비 › 제안 준비 현황 › 기관 상세의 '구간·단계' 틀(NEXT 113 2단계, 사용자 11-25).
  // 기관을 누르면 화면은 하나다 — 옛 '사전준비 상세'(담당자 지정·준비 과제·승인)와 '23단계 틀'을 합쳤다.
  //   구간 3개(입찰 자료확인 → 제안 준비 → 협약 이행 준비) 안에 단계가 순서대로 놓이고, 단계 본문에서 그 단계의 일을 바로 한다.
  //   · 담당자 지정·준비 과제·승인·작성 시작 = prep.js의 조각(endHtml·taskItemHtml)을 그 단계 본문에 그대로 싣는다(동작은 prep.js가 처리).
  //   · 손으로 체크하는 칸 = 본문의 상태 단추(data-act="mark") — 제안 준비 현황 표와 같은 주소로 저장한다(prep.js onMark).
  // 이 파일은 순수 함수만 둔다(node 시험 대상). 상태·요청·이벤트는 prep.js가 가진다(paintCase가 caseHtml을 부른다).
  const pt = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const pb = isNode ? require('./prepboard.js') : root.prepboard;
  const prep = isNode ? require('./prep.js') : root.prep;

  function esc(s) { return logic.esc(s == null ? '' : s); }
  function str(v) { return v == null ? '' : String(v); }

  // ── 구간·단계 정본 ───────────────────────────────────────────────
  // 구간 이름은 사용자 11-25 "입찰 자료확인 · 제안 준비 · 협약 이행 준비"(담당자 지정~이사회 / 제안서~PT / 결과발표~협약식 — 제안서를 쓰려면 앞 단계가 모두 끝나야 하고, 결과 발표가 나야 협약 이행을 준비한다). 단계 순서는 엑셀 칸 순서 그대로(협약식이 맨 끝 — 사용자 11-25 확정).
  // 어느 단계가 어느 구간인지는 아래 ph 값으로 바꾼다.
  pt.PHASES = [
    { key: 'bid', label: '입찰 자료확인' },
    { key: 'prep', label: '제안 준비' },
    { key: 'agree', label: '협약 이행 준비' },
  ];
  // cd = 서버 PrepBoardColumns 칸 코드(묶음은 묶음 코드, 칸이 아닌 단계는 ''). tasks = 이 단계 본문에 싣는 사전준비 과제 코드.
  // kind: start(담당자 지정)·notice(읽기만)·auto(과제가 채움)·board(이사회 자료)·script(발표 대본)·proposal(제안서)·manual(담당 영업 체크)·group(묶음 체크)
  function step(cd, label, kind, ph, o) {
    return Object.assign({ cd: cd, id: cd, label: label, kind: kind, ph: ph, tasks: [], subs: null }, o || {});
  }
  function sub(cd, label) { return { cd: cd, label: label }; }
  pt.STEPS = [
    step('', '담당자 지정', 'start', 'bid', { id: 'START' }),
    step('NOTICE_CHECK', '입찰공고확인', 'notice', 'bid'),
    step('INST_ANALYSIS', '기관 정보 분석', 'auto', 'bid', { tasks: ['T1', 'T2'] }),
    step('PROFIT', '수익성분석', 'auto', 'bid', { tasks: ['T3'] }),
    step('FIN_COMMITTEE', '가결위(재무)', 'manual', 'bid'),
    step('BIZ_COMMITTEE', '출심위(사업부)', 'manual', 'bid'),
    step('', '이사회 자료 작성', 'board', 'bid', { id: 'BOARD_DOC', tasks: ['T5'] }),
    step('', '이사회 발표 대본', 'script', 'bid', { id: 'BOARD_SCRIPT', tasks: ['T6'] }),
    step('BOARD', '이사회', 'group', 'bid', { subs: [sub('BOARD_SECRETARIAT', '사무국'), sub('BOARD_AUDIT', '감사·감시'), sub('BOARD_COMPLIANCE', '준법')] }),
    step('PROPOSAL', '제안서', 'proposal', 'prep'),
    step('PRESENT_DOC', '발표자료', 'manual', 'prep'),
    step('SUBMIT_DOCS', '제출서류', 'manual', 'prep', { tasks: ['T4'] }),
    step('SUBMIT_APPR', '제안서제출품의', 'group', 'prep', { subs: [sub('SUBMIT_MONITOR', '감시'), sub('SUBMIT_PROPERTY', '재산상이익')] }),
    step('PT', 'PT', 'manual', 'prep'),
    step('RESULT', '결과발표', 'manual', 'agree'),
    step('PRIORITY_NEGO', '우선협상', 'manual', 'agree'),
    step('AGREE_LEGAL', '협약서(법률)', 'manual', 'agree'),
    step('CONTRACT_APPR', '협약체결품의', 'group', 'agree', { subs: [sub('CONTRACT_AUDIT', '감사·감시'), sub('CONTRACT_STRATEGY', '전략'), sub('CONTRACT_PROPERTY', '재산상이익'), sub('CONTRACT_BRANCH', '영업점안내')] }),
    step('ATM', 'ATM', 'manual', 'agree'),
    step('KB_CARD', 'KB카드', 'manual', 'agree'),
    step('IT_BUILD', '전산구축', 'manual', 'agree'),
    step('VIP', 'VIP 지정', 'manual', 'agree'),
    step('RATE_APPROVAL', '금리승인', 'manual', 'agree'),
    step('CEREMONY', '협약식', 'manual', 'agree'),
  ];
  pt.clampIdx = function (i) {
    const n = Number(i);
    return n >= 0 && n < pt.STEPS.length ? Math.floor(n) : 0;
  };
  pt.phaseOf = function (idx) { return pt.STEPS[pt.clampIdx(idx)].ph; };
  pt.phaseLabel = function (key) {
    const p = pt.PHASES.filter(function (x) { return x.key === key; })[0];
    return p ? p.label : '';
  };
  // 그 구간에 든 단계 번호(전체 순번) 목록
  pt.phaseIdxs = function (key) {
    const out = [];
    pt.STEPS.forEach(function (s, i) { if (s.ph === key) out.push(i); });
    return out;
  };

  // 칸 코드 → 사람이 읽는 이름('묶음 › 칸'). 저장 알림·오류 문구에 쓴다.
  pt.colLabel = function (cd) {
    for (let i = 0; i < pt.STEPS.length; i += 1) {
      const s = pt.STEPS[i];
      if (s.cd && s.cd === cd && !s.subs) return s.label;
      const x = (s.subs || []).filter(function (y) { return y.cd === cd; })[0];
      if (x) return s.label + ' › ' + x.label;
    }
    return str(cd);
  };

  // ── 문구 ─────────────────────────────────────────────────────────
  const T = {
    phasesNav: '진행 구간',
    stepsNav: function (phaseLabel) { return phaseLabel + ' 단계'; },
    prev: function (label) { return '이전: ' + label; },
    next: function (label) { return '다음: ' + label; },
    prevNone: '이전 단계 없음',
    nextNone: '마지막 단계',
    startHint: '이 기관을 맡을 담당자를 정합니다. 담당자가 정해지면 준비 과제와 체크 칸이 열립니다.',
    startDone: '담당자 지정이 끝났습니다.',
    startEnded: '끝난 건이라 담당자를 지정하지 않습니다.',
    manualHint: '이 단계를 마쳤으면 상태를 고릅니다. 고르면 바로 저장되고 제안 준비 현황 표에도 같이 보입니다.',
    groupHint: '칸마다 상태를 고릅니다. 고르면 바로 저장되고 제안 준비 현황 표에도 같이 보입니다.',
    boardHint: '이사회 자료는 이사회 자료 작성 화면에서 만들고 확정합니다. 확정되면 이 단계가 완료됩니다.',
    proposalHint: '필수 준비 과제를 마친 뒤 제안서 작성을 시작합니다. 작성은 [제안서 진행 현황]에서 세 팀이 함께 합니다.',
    proposalLater: '담당자 지정이 끝나면 여기에서 제안서 작성을 시작합니다.',
    openBefore: function (names) { return '입찰 자료확인 구간에 아직 안 끝난 단계가 있습니다: ' + names.join(', ') + '. 작성 시작을 막지는 않으니 확인만 하세요.'; },
    openBoard: '이사회 자료 작성 열기',
    noRow: '제안 준비 현황 표의 체크 기록을 불러오지 못해 보기만 합니다. [← 제안 준비 현황으로] 돌아가 다시 여세요.',
    rowLoading: '체크 기록을 불러오는 중…',
    ended: '끝난 건이라 체크할 수 없습니다.',
    saving: '저장 중…',
    lastCheck: function (date, by) { return '마지막 체크 ' + date + (by ? ' ' + by : ''); },
    taskNone: '이 단계에 걸린 준비 과제가 없습니다.',
    foldHint: '아래 내용을 읽고, 고칠 것이 있으면 [수정하기]로 고친 뒤 과제마다 [완료로 표시]를 누릅니다.',
    foldCheckHint: '내용을 확인했으면 [완료로 표시]를 누르세요.',
    docEdit: '수정하기',
    docShow: '다시 보기',
    docFold: '접기',
    docLoading: '내용을 불러오는 중…',
    docErr: '내용을 불러오지 못했습니다. [수정하기]로 열어 확인하세요.',
    sumEmpty: '아직 작성하지 않았습니다. [수정하기]를 눌러 작성하세요.',
    sumNone: '적은 내용 없음',
    changeAssignee: '담당자 변경…',
    changeAssigneeNote: '담당자 변경은 [제안팀 구성·배정] 화면에서 요청합니다.',
    nextAskTitle: '다음 단계로',
    nextAsk: function (label) { return '현재 상태를 저장하고 다음 단계(' + label + ')로 넘어갑니다.'; },
    nextNo: '닫기',
    nextOk: '확인',
    noticeGuide: '이 화면에서는 고치지 않습니다. 고칠 것이 있으면 아래 화면 중 한 곳에서 고친 뒤 돌아오세요.',
    noticeNav: [['board', '입찰 현황판'], ['map', '지역별 공고현황'], ['notice', '입찰 공고 현황']],
    noticeOk: '누락되거나 미확인인 항목이 없습니다. [다음]으로 넘어가면 됩니다.',
    noticeGapsHead: function (n) { return '확인이 필요한 항목 ' + n + '건'; },
    noticeNoRec: '이 기관의 입찰 공고 자료를 찾지 못했습니다. 입찰 공고 현황에서 기관을 확인하세요.',
    noticeLoading: '입찰 공고 자료를 불러오는 중…',
    stNoticeOk: '확인 완료',
    stNoticeGap: '확인 필요',
    stTodo: '할 일',
    stWait: '승인 대기',
    stDone: '완료',
    stWriting: '작성 중',
  };
  pt.T = T;

  // ── 칸 값 읽기 ───────────────────────────────────────────────────
  const MARK_CODES = ['DONE', 'IN_PROGRESS', 'NA', 'NONE'];
  // → { mark, name, glyph, date(YYYY-MM-DD), by, notice, revNo }
  pt.cellState = function (row, cd, marks) {
    const c = row && row.cells && row.cells[cd] && typeof row.cells[cd] === 'object' ? row.cells[cd] : {};
    const m = MARK_CODES.indexOf(c.mark_cd) >= 0 ? c.mark_cd : 'NONE';
    return { mark: m, name: pb.markName(marks, m), glyph: pb.glyphKind(m), date: pb.fullDate(c.marked_on), by: str(c.by_name).trim(),
             notice: str(c.notice_status_name).trim(), revNo: Number(c.rev_no) || 0 };
  };
  pt.groupCount = function (row, s) {
    const subs = s && s.subs ? s.subs : [];
    const st = subs.map(function (x) { return pt.cellState(row, x.cd).mark; });
    return { done: st.filter(function (k) { return k === 'DONE'; }).length, na: st.filter(function (k) { return k === 'NA'; }).length,
             touched: st.filter(function (k) { return k !== 'NONE'; }).length, total: subs.length };
  };
  function tasksOf(view, s) {
    const by = prep.tasksByCd((view && view.tasks) || []);
    return (s.tasks || []).map(function (cd) { return by[cd]; }).filter(Boolean);
  }
  // 체크할 수 있는가 — 서버 can_check(담당 영업)·끝난 건·개설 전을 그대로 따른다. → { can, why }
  pt.markGate = function (view, row, rowState) {
    if (!row) return { can: false, why: rowState === 'loading' ? T.rowLoading : T.noRow };
    if (row.ended || (view && view.state_cd === 'CANCELLED')) return { can: false, why: T.ended };
    const sc = view && view.state_cd ? str(view.state_cd) : str(row.state_cd);
    if (pb.PRE_OPEN_STATES.indexOf(sc) >= 0) return { can: false, why: pb.T.infoPre };
    if (row.can_check !== true) return { can: false, why: pb.T.infoNotMine };
    return { can: true, why: '' };
  };

  // 입찰공고확인 판정: true(누락 없음)·false(확인 필요)·undefined(아직 모름 — 공고 자료를 못 봄)
  pt.noticeOk = function (row) {
    const c = row && row.cells && row.cells.NOTICE_CHECK;
    return c && typeof c.notice_ok === 'boolean' ? c.notice_ok : undefined;
  };
  // 판정을 모르는 입찰공고확인 단계는 '지금 할 단계'·구간 숫자·안내에서 뺀다(읽기만 하던 때와 같게).
  function skipNotice(s, row) { return s.kind === 'notice' && pt.noticeOk(row) === undefined; }
  // 공고 자료(dashboard.js의 항목 it)에서 누락·미확인 항목 이름을 뽑는다. o: { hasLink, unhandled(예정일이 지났는데 공고 상태 기록이 없음) }
  pt.noticeGaps = function (it, o) {
    const x = o || {};
    if (!it) return ['입찰 공고 자료 없음'];
    const g = [];
    if (it.unknown) g.push('입찰 예정일 미상');
    if (it.check) g.push('공고일 확인 필요');
    if (it.notice && !it.receiveTo) g.push('접수 마감일 미확인');
    if (it.notice && !x.hasLink) g.push('공고 링크 없음');
    if (x.unhandled) g.push('예정일이 지났는데 공고 상태 기록이 없음');
    return g;
  };

  // ── 단계 상태(왼쪽 목록의 글리프·구간 숫자·'지금 할 단계') ────────────
  // → { glyph: 'done'|'prog'|'na'|'', text, cnt, closed(끝났거나 대상 아님) }
  pt.stepState = function (s, view, row, marks) {
    const v = view || {};
    const out = { glyph: '', text: '', cnt: '', closed: false };
    function fromCell(cd) {
      const c = pt.cellState(row, cd, marks);
      out.glyph = c.glyph; out.text = c.name; out.closed = c.mark === 'DONE' || c.mark === 'NA';
      return c;
    }
    if (s.kind === 'start') {
      const sc = str(v.state_cd);
      if (sc === 'CONFIRMED' || sc === '') out.text = T.stTodo;
      else if (sc === 'OPEN_PENDING') { out.glyph = 'prog'; out.text = T.stWait; }
      else if (sc === 'CANCELLED') out.text = '';
      else { out.glyph = 'done'; out.text = T.stDone; out.closed = true; }
    } else if (s.kind === 'notice') {
      // 입찰 공고 자료에 누락·미확인이 없으면 완료(사용자 11-25). 판정(notice_ok)은 prep.js가 공고 자료를 보고 그 줄에 적어 둔다 — 모르면 상태 없음.
      const ok = pt.noticeOk(row);
      const nm = pt.cellState(row, s.cd, marks).notice;
      if (ok === true) { out.glyph = 'done'; out.closed = true; out.text = (nm ? nm + ', ' : '') + T.stNoticeOk; }
      else if (ok === false) out.text = (nm ? nm + ', ' : '') + T.stNoticeGap;
      else out.text = nm;
    } else if (s.kind === 'group') {
      const g = pt.groupCount(row, s);
      out.cnt = '완료 ' + g.done + '/' + g.total;
      out.closed = g.total > 0 && g.done + g.na === g.total;
      out.glyph = out.closed ? (g.done > 0 ? 'done' : 'na') : g.touched > 0 ? 'prog' : '';
      out.text = out.cnt;
    } else if (s.kind === 'manual') {
      fromCell(s.cd);
    } else if (s.kind === 'proposal') {
      const c = fromCell(s.cd);
      if (c.mark === 'NONE' && v.state_cd === 'WRITING') { out.glyph = 'prog'; out.text = T.stWriting; }
    } else {   // auto·board·script — 과제 상태가 먼저, 과제가 아직 없으면(담당자 지정 전) 표의 칸
      const ts = tasksOf(v, s).filter(function (t) { return t.state !== 'PREPARING'; });
      if (ts.length) {
        const done = ts.filter(function (t) { return t.state === 'DONE'; }).length;
        const na = ts.filter(function (t) { return t.state === 'NOT_APPLICABLE'; }).length;
        out.closed = done + na === ts.length;
        out.glyph = out.closed ? (done > 0 ? 'done' : 'na') : done > 0 ? 'prog' : '';
        out.text = out.closed ? (done > 0 ? T.stDone : prep.T.na) : T.stTodo;
        if (ts.length > 1) out.cnt = '완료 ' + done + '/' + ts.length;
      } else if (s.cd) fromCell(s.cd);
    }
    return out;
  };
  // 처음 열 때 보일 단계 = 순서대로 가다 처음 만나는 '안 끝난 단계'(읽기만 하는 입찰공고확인은 건너뛴다). 다 끝났으면 마지막 단계.
  pt.defaultIdx = function (view, row, marks) {
    if (view && view.state_cd === 'CANCELLED') return 0;
    for (let i = 0; i < pt.STEPS.length; i += 1) {
      const s = pt.STEPS[i];
      if (skipNotice(s, row)) continue;
      if (!pt.stepState(s, view, row, marks).closed) return i;
    }
    return pt.STEPS.length - 1;
  };
  // 제안서 작성 전에 끝나 있어야 하는 '입찰 자료확인' 구간의 안 끝난 단계 이름(사용자 11-25: 업무상 그렇게 되므로 시스템은 막지 않고 알리기만 한다).
  // 표의 그 줄을 못 받았으면 손 칸의 값을 모르므로 빈 목록(잘못 알리지 않는다). 읽기만 하는 입찰공고확인과 선택 과제인 이사회 발표 대본은 뺀다.
  pt.openBefore = function (view, row, marks) {
    if (!row) return [];
    return pt.STEPS.filter(function (s) { return s.ph === 'bid' && !skipNotice(s, row) && s.kind !== 'script' && !pt.stepState(s, view, row, marks).closed; })
      .map(function (s) { return s.label; });
  };
  // 구간 단추를 눌렀을 때 갈 단계 = 그 구간의 첫 '안 끝난 단계', 없으면 구간 첫 단계
  pt.phaseEntryIdx = function (key, view, row, marks) {
    const ids = pt.phaseIdxs(key);
    if (!ids.length) return 0;
    for (let k = 0; k < ids.length; k += 1) {
      const s = pt.STEPS[ids[k]];
      if (!skipNotice(s, row) && !pt.stepState(s, view, row, marks).closed) return ids[k];
    }
    return ids[0];
  };

  // ── 구간 줄 ──────────────────────────────────────────────────────
  // → [{ key, label, no, done, total, current }] — 숫자는 '끝난 단계 / 구간 단계'(읽기만 하는 입찰공고확인은 세지 않는다)
  pt.phaseModel = function (view, row, marks, idx) {
    const cur = pt.phaseOf(idx);
    return pt.PHASES.map(function (p, n) {
      const steps = pt.STEPS.filter(function (s) { return s.ph === p.key && !skipNotice(s, row); });
      return { key: p.key, label: p.label, no: n + 1, total: steps.length, current: p.key === cur,
               done: steps.filter(function (s) { return pt.stepState(s, view, row, marks).closed; }).length };
    });
  };
  pt.phasesHtml = function (model) {
    return '<div class="ts-phases" role="group" aria-label="' + esc(T.phasesNav) + '">' + model.map(function (p) {
      return '<button type="button" class="ts-phase" data-act="ts-phase" data-ph="' + esc(p.key) + '" aria-pressed="' + (p.current ? 'true' : 'false') + '">' +
        '<span class="ts-pno">' + p.no + '</span><span class="ts-pname">' + esc(p.label) + '</span>' +
        '<span class="ts-cnt">' + p.done + '/' + p.total + '<span class="sr-only"> 단계 완료</span></span></button>';
    }).join('') + '</div>';
  };

  // ── 단계 목록(지금 구간만) ────────────────────────────────────────
  // → [{ i, no, id, label, ro, glyph, sr, cnt, current }]
  pt.stepsModel = function (view, row, marks, idx) {
    const cur = pt.clampIdx(idx);
    return pt.phaseIdxs(pt.phaseOf(cur)).map(function (i) {
      const s = pt.STEPS[i];
      const st = pt.stepState(s, view, row, marks);
      return { i: i, no: i + 1, id: s.id, label: s.label, ro: s.kind === 'notice', glyph: st.glyph, sr: st.cnt ? '' : st.text, cnt: st.cnt, current: i === cur };
    });
  };
  // 목록은 탭 정지 1개(roving) — 지금 단계가 탭 정지다.
  pt.stepsHtml = function (model) {
    return '<ol>' + model.map(function (m) {
      return '<li><button type="button" class="ts-step' + (m.ro ? ' is-ro' : '') + '" data-i="' + m.i + '" tabindex="' + (m.current ? '0' : '-1') + '"' + (m.current ? ' aria-current="step"' : '') + '>' +
        '<span class="ts-no">' + m.no + '</span><span class="ts-gl">' + pb.glyphSvg(m.glyph) + '</span><span class="ts-name">' + esc(m.label) + '</span>' +
        '<span class="ts-cnt">' + esc(m.cnt) + '</span>' + (m.sr ? '<span class="sr-only">, ' + esc(m.sr) + '</span>' : '') + '</button></li>';
    }).join('') + '</ol>';
  };
  // ↑↓·Home·End → 포커스를 옮길 단계 번호(같은 구간 안). 그 밖의 키는 null.
  pt.stepKey = function (i, key) {
    const ids = pt.phaseIdxs(pt.phaseOf(i));
    const k = ids.indexOf(pt.clampIdx(i));
    switch (key) {
      case 'ArrowDown': return ids[Math.min(ids.length - 1, k + 1)];
      case 'ArrowUp': return ids[Math.max(0, k - 1)];
      case 'Home': return ids[0];
      case 'End': return ids[ids.length - 1];
      default: return null;
    }
  };
  // 바뀐 단계 알림(sr-only role=status): "{기관}, {구간} {n}단계 {이름}, {상태}"
  pt.liveText = function (view, row, marks, idx) {
    const i = pt.clampIdx(idx);
    const s = pt.STEPS[i];
    const st = pt.stepState(s, view, row, marks);
    const name = str(view && view.institution_name) || str(row && row.institution_name);
    return name + ', ' + pt.phaseLabel(s.ph) + ' ' + (i + 1) + '단계 ' + s.label + (st.text ? ', ' + st.text : '');
  };

  // ── 본문 조각 ────────────────────────────────────────────────────
  function note(text) { return text ? '<p class="ts-note">' + esc(text) + '</p>' : ''; }
  function stateSpan(c) {
    return '<span class="ts-cell">' + (pb.glyphSvg(c.glyph) || '<span class="pb-g"></span>') + '<span>' + esc(c.name) + '</span></span>';
  }
  function lastLine(c) {
    return c.mark !== 'NONE' && c.date ? T.lastCheck(c.date, c.by) : pb.T.infoNoCheck;
  }
  // 상태 단추 한 줄. o: { can, busy }
  pt.marksHtml = function (cd, label, c, marks, o) {
    const x = o || {};
    if (!x.can) return stateSpan(c);
    const order = (Array.isArray(marks) && marks.length ? marks.map(function (k) { return k.mark_cd; }) : pb.MARK_ORDER)
      .filter(function (k) { return MARK_CODES.indexOf(k) >= 0; });
    return '<div class="ts-marks" role="group" aria-label="' + esc(label + ' 상태') + '">' + order.map(function (k) {
      return '<button type="button" class="ts-mk" data-act="mark" data-col="' + esc(cd) + '" data-mk="' + k + '" aria-pressed="' + (k === c.mark ? 'true' : 'false') + '"' +
        (x.busy ? ' aria-disabled="true"' : '') + '>' + (pb.glyphSvg(pb.glyphKind(k)) || '<span class="pb-g"></span>') + '<span>' + esc(pb.markName(marks, k)) + '</span></button>';
    }).join('') + (x.busy ? '<span class="ts-saving">' + esc(T.saving) + '</span>' : '') + '</div>';
  };
  function markBlock(m, s, gate) {
    const busy = m.markBusy || {};
    if (s.kind === 'group') {
      return '<ul class="ts-subs">' + s.subs.map(function (x) {
        const c = pt.cellState(m.row, x.cd, m.marks);
        return '<li data-col="' + esc(x.cd) + '"><span class="ts-sl">' + esc(x.label) + '</span>' +
          pt.marksHtml(x.cd, s.label + ' › ' + x.label, c, m.marks, { can: gate.can, busy: !!busy[x.cd] }) +
          '<span class="ts-last">' + esc(lastLine(c)) + '</span></li>';
      }).join('') + '</ul>';
    }
    const c = pt.cellState(m.row, s.cd, m.marks);
    return '<div class="ts-markrow" data-col="' + esc(s.cd) + '">' + pt.marksHtml(s.cd, s.label, c, m.marks, { can: gate.can, busy: !!busy[s.cd] }) +
      '<span class="ts-last">' + esc(lastLine(c)) + '</span></div>';
  }
  function tasksBlock(m, s) {
    const v = m.view || {};
    const all = Array.isArray(v.tasks) ? v.tasks : [];
    const by = prep.tasksByCd(all);
    const mine = (s.tasks || []).filter(function (cd) { return !!by[cd]; });
    if (!all.length) return (s.tasks || []).length && pb.PRE_OPEN_STATES.indexOf(str(v.state_cd)) >= 0
      ? note(prep.isNewStartFlow(v.viewer) ? prep.T.tasksLaterStart : prep.T.tasksLater) : '';
    if (!mine.length) return '';
    const vw = v.viewer || {};
    let h = '';
    if (prep.TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee) h += note(prep.T.readonly);
    return h + '<ol class="pp-tasks" aria-label="준비 과제">' + mine.map(function (cd) {
      return prep.taskItemHtml(prep.taskModel(by[cd], by, vw, all.indexOf(by[cd])), m);
    }).join('') + '</ol>';
  }
  // ── 3단계 기관 정보 분석: 펼침형(사용자 11-25 시안 B) ──────────────────
  // 과제마다 내용을 본문에 펼쳐 보이고(길면 그 안에서 스크롤), [수정하기]로 고친 뒤 [완료로 표시]. 완료한 과제는 한 줄로 접히고 [다시 보기]로 편다.
  // '기관 정보 요약' 양식(서버 GET …/prep/forms/INST_SUMMARY 응답)을 읽기용 표로. 값은 모두 이스케이프한다.
  pt.summaryHtml = function (view) {
    const isn = isNode ? require('./instsummary.js') : root.instSummary;
    if (!isn || !view || !view.tpl) return '';
    if (!(Number(view.cur_ver) > 0)) return note(T.sumEmpty);
    const m = isn.modelFromView(view);
    const f = (view.content && view.content.fields) || {};
    let h = '', rows = [];
    function flush() {
      if (rows.length) h += '<table class="ts-doc"><tbody>' + rows.join('') + '</tbody></table>';
      rows = [];
    }
    function lines(a) { return a.filter(function (x) { return str(x).trim() !== ''; }).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }
    (Array.isArray(view.tpl.keys) ? view.tpl.keys : []).forEach(function (k) {
      if (!k || !k.key) return;
      const label = str(k.label) || str(k.key);
      if (k.key === 'biz') {
        flush();
        const body = m.biz.map(function (r) { return '<tr><th scope="row">' + esc(r.group) + '</th><td>' + esc(r.sub) + '</td><td><ul>' + lines(r.lines) + '</ul></td></tr>'; }).join('');
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (body ? '<table class="ts-doc"><tbody>' + body + '</tbody></table>' : note(T.sumNone));
      } else if (k.key === 'fund') {
        flush();
        const body = m.fund.map(function (r) {
          return '<tr><th scope="row">' + esc(r.kind) + '</th><td><ul>' + lines(r.lines.map(function (x) { return (x.lv === 1 ? '- ' : '') + x.text; })) + '</ul></td></tr>';
        }).join('');
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (body ? '<table class="ts-doc"><tbody>' + body + '</tbody></table>' : note(T.sumNone));
      } else if (k.key === 'years') {
        flush();
        const y = m.years;
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>';
        if (!y) { h += note(T.sumNone); return; }
        const ys = Object.keys(Object.assign({}, y.mmda, y.income)).sort();
        h += ys.length ? '<table class="ts-doc ts-doc-y"><thead><tr><th scope="col">(' + esc(y.unit) + ')</th>' + ys.map(function (yy) { return '<th scope="col">' + esc(yy) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          [['mmda', 'MMDA 연평잔'], ['income', '자금수익']].map(function (r) {
            return '<tr><th scope="row">' + r[1] + '</th>' + ys.map(function (yy) { return '<td class="m">' + esc(y[r[0]][yy] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>' : note(T.sumNone);
        const nt = lines(y.notes);
        if (nt) h += '<ul class="ts-doc-l">' + nt + '</ul>';
      } else if (k.kind === 'LIST') {
        flush();
        const li = lines(m.lists[k.key] || []);
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (li ? '<ul class="ts-doc-l">' + li + '</ul>' : note(T.sumNone));
      } else {   // TEXT·FACT — 이름표와 값 한 줄
        const x = f[k.key] && typeof f[k.key] === 'object' ? f[k.key] : {};
        const val = str(x.val).trim(), nt = str(x.note).trim();
        rows.push('<tr><th scope="row">' + esc(label) + '</th><td>' + (val ? esc(val) : '<span class="ts-note">' + esc(T.sumNone) + '</span>') +
          (nt ? ' <span class="ts-note">(' + esc(nt) + ')</span>' : '') + '</td></tr>');
      }
    });
    flush();
    return h;
  };
  // m.docs = { T1: { state: 'loading'|'ok'|'err', html }, T2: {…} } — prep.js가 채운다. m.foldOpen = { T1: true } — 완료한 과제를 다시 편 상태.
  function foldBlock(m, s) {
    const v = m.view || {};
    const all = Array.isArray(v.tasks) ? v.tasks : [];
    const by = prep.tasksByCd(all);
    const mine = (s.tasks || []).filter(function (cd) { return !!by[cd]; });
    if (!all.length || !mine.length) return tasksBlock(m, s);
    const vw = v.viewer || {};
    const docs = m.docs || {}, fo = m.foldOpen || {};
    let h = prep.TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee ? note(prep.T.readonly) : note(T.foldHint);
    return h + '<ol class="pp-tasks ts-folds" aria-label="준비 과제">' + mine.map(function (cd) {
      const t = prep.taskModel(by[cd], by, vw, all.indexOf(by[cd]));
      const d = docs[cd] || {};
      if (t.act === 'check') t.sub = T.foldCheckHint;   // 옛 문구('작성 화면은 준비 중')를 대신한다
      const live = t.state === 'TODO' || t.state === 'DONE';
      const open = live && (t.state !== 'DONE' || !!fo[cd]);
      let acts = '';
      if (live && vw.is_assignee) acts += '<button type="button" class="pp-act" data-act="doc-edit" data-task="' + esc(cd) + '" aria-label="\'' + esc(t.name) + '\' 수정하기">' + esc(T.docEdit) + '</button>';
      if (t.state === 'DONE') acts += '<button type="button" class="pp-act" data-act="doc-toggle" data-task="' + esc(cd) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + esc(open ? T.docFold : T.docShow) + '</button>';
      const body = !open ? '' : '<div class="ts-fold" tabindex="0" role="region" aria-label="' + esc(t.name + ' 내용') + '">' +
        (d.state === 'ok' ? str(d.html) || note(T.sumNone) : note(d.state === 'err' ? T.docErr : T.docLoading)) + '</div>';
      return prep.taskItemHtml(t, m, { acts: acts, tail: body });
    }).join('') + '</ol>';
  }

  const PROPOSAL_STATES = ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING'];

  // m: prep.caseHtml과 같은 모델 + { row, marks, rowState, idx, markBusy }
  pt.bodyHtml = function (m) {
    const v = m.view || {};
    const idx = pt.clampIdx(m.idx);
    const s = pt.STEPS[idx];
    const n = pt.STEPS.length;
    const gate = pt.markGate(v, m.row, m.rowState);
    const ctx = { confirm: m.confirm, withdrawing: m.withdrawing };
    let h = '<div class="ts-pos">' + esc(pt.phaseLabel(s.ph)) + ' · ' + (idx + 1) + ' / ' + n + '</div>' +
      '<h3 class="ts-step-title" id="ts-step-title" tabindex="-1">' + esc(s.label) + '</h3>';
    if (s.kind === 'start') {
      const sc = str(v.state_cd);
      if (sc === 'CONFIRMED' || sc === 'OPEN_PENDING') h += note(T.startHint) + prep.endHtml(v, ctx);
      else if (sc === 'CANCELLED') h += note(T.startEnded);
      else {
        const names = (Array.isArray(v.assignees) ? v.assignees : []).map(function (a) { return str(a.name); }).filter(Boolean);
        h += note(T.startDone) + '<dl class="ts-facts"><div><dt>담당</dt><dd>' + esc(names.length ? names.join(', ') : prep.T.noAssignees) + '</dd></div></dl>' +
          '<div class="ts-acts"><button type="button" data-act="go-nav" data-nav="team">' + esc(T.changeAssignee) + '</button><span class="ts-note">' + esc(T.changeAssigneeNote) + '</span></div>';
      }
    } else if (s.kind === 'notice') {
      // 기관정보 팝업과 같은 내용을 읽기 전용으로(m.notice = { state: 'ok'|'none'|'loading', html, gaps } — prep.js가 dashboard.js로 만든다)
      const ni = m.notice || {};
      h += '<dl class="ts-facts"><div><dt>공고 상태</dt><dd>' + esc(pt.cellState(m.row, s.cd, m.marks).notice || '없음') + '</dd></div></dl>';
      if (ni.state === 'ok') {
        const gaps = Array.isArray(ni.gaps) ? ni.gaps : [];
        h += gaps.length
          ? '<div class="ts-gaps" role="note"><b>' + esc(T.noticeGapsHead(gaps.length)) + '</b><ul>' + gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>'
          : '<p class="ts-okline" role="note">' + esc(T.noticeOk) + '</p>';
        h += '<div class="ts-notice">' + str(ni.html) + '</div>';   // dashboard.js가 이스케이프해 만든 마크업
      } else {
        h += note(ni.state === 'loading' ? T.noticeLoading : T.noticeNoRec);
      }
      h += note(T.noticeGuide) + '<div class="ts-acts">' + T.noticeNav.map(function (n) {
        return '<button type="button" data-act="go-nav" data-nav="' + n[0] + '">' + esc(n[1]) + '</button>';
      }).join('') + '</div>';
    } else if (s.kind === 'manual' || s.kind === 'group') {
      h += note(s.kind === 'group' ? T.groupHint : T.manualHint) + markBlock(m, s, gate) + note(gate.why) + tasksBlock(m, s);
    } else if (s.kind === 'proposal') {
      const open = v.state_cd === 'CANCELLED' ? [] : pt.openBefore(v, m.row, m.marks);
      h += note(T.proposalHint) + (open.length ? '<p class="pp-next" role="note">' + esc(T.openBefore(open)) + '</p>' : '') + '<dl class="ts-facts"><div><dt>제안서(디자인 최종)</dt><dd>' + stateSpan(pt.cellState(m.row, s.cd, m.marks)) + '</dd></div></dl>' +
        (PROPOSAL_STATES.indexOf(str(v.state_cd)) >= 0 ? prep.endHtml(v, ctx) : (v.state_cd === 'CANCELLED' ? '' : note(T.proposalLater)));
    } else {   // auto·board·script — 준비 과제를 여기에서 처리한다
      if (s.kind === 'board') h += note(T.boardHint);
      const tb = s.id === 'INST_ANALYSIS' ? foldBlock(m, s) : tasksBlock(m, s);
      h += tb || note(T.taskNone);
      if (s.kind === 'board') h += '<div class="ts-acts"><button type="button" data-act="to-board-doc">' + esc(T.openBoard) + '</button></div>';
    }
    const prev = idx > 0 ? { label: T.prev(pt.STEPS[idx - 1].label), off: false } : { label: T.prevNone, off: true };
    const next = idx < n - 1 ? { label: T.next(pt.STEPS[idx + 1].label), off: false } : { label: T.nextNone, off: true };
    return h + '<div class="ts-pager"><button type="button" data-act="ts-prev"' + (prev.off ? ' disabled' : '') + '>' + esc(prev.label) + '</button>' +
      '<button type="button" class="ts-go" data-act="ts-next"' + (next.off ? ' disabled' : '') + '>' + esc(next.label) + '</button></div>';
  };
  // [다음] 확인 팝업(사용자 11-25: 단계마다 공통). 첫 포커스는 [확인].
  pt.nextAskHtml = function (idx) {
    const s = pt.STEPS[pt.clampIdx(idx) + 1];
    if (!s) return '';
    return '<div class="modal-box tm-modal-box ts-ask" role="dialog" aria-modal="true" aria-labelledby="ts-ask-t" aria-describedby="ts-ask-d">' +
      '<h3 id="ts-ask-t">' + esc(T.nextAskTitle) + '</h3><p id="ts-ask-d" class="ts-ask-d">' + esc(T.nextAsk(s.label)) + '</p>' +
      '<div class="tm-m-actions"><button type="button" id="pp-nx-no">' + esc(T.nextNo) + '</button>' +
      '<button type="button" id="pp-nx-ok" class="ts-go">' + esc(T.nextOk) + '</button></div></div>';
  };

  // ── 상세 전체 ────────────────────────────────────────────────────
  // 머리(기관·상태·확정 취소/중단)와 알림 줄은 prep.js 것을 그대로 쓰고, 옛 5칸 단계 막대·과제 목록 자리에 구간·단계 틀이 들어간다.
  pt.caseHtml = function (m) {
    const v = m.view || {};
    const idx = pt.clampIdx(m.idx);
    return prep.caseHeadHtml(m) + prep.caseNoticeHtml(m) +
      pt.phasesHtml(pt.phaseModel(v, m.row, m.marks, idx)) +
      '<div class="ts-detail"><nav class="ts-steps" id="ts-steps" aria-label="' + esc(T.stepsNav(pt.phaseLabel(pt.phaseOf(idx)))) + '">' +
      pt.stepsHtml(pt.stepsModel(v, m.row, m.marks, idx)) + '</nav>' +
      '<section class="ts-body" id="ts-body" aria-labelledby="ts-step-title">' + pt.bodyHtml(m) + '</section></div>' +
      '<div id="ts-live" class="sr-only" role="status"></div>';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = pt;
  else root.preptask = pt;
})(typeof self !== 'undefined' ? self : this);
