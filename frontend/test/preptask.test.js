'use strict';
// 영업 추진 준비 › 제안 준비 현황 › 기관 상세 '구간·단계 한 화면'(NEXT 113 2단계) — preptask.js 순수 함수·서버 칸 정의 대조·prep.js/prepboard.js 배선 정적 검사.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pt = require('../js/preptask.js');
const pb = require('../js/prepboard.js');
const prep = require('../js/prep.js');

const ROOT = path.join(__dirname, '..');
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
const SRC = src('js/preptask.js');
const PREP_SRC = src('js/prep.js');
const PB_SRC = src('js/prepboard.js');
const APP_SRC = src('js/app.js');
const HTML = src('index.html');
const JAVA = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'service', 'PrepBoardColumns.java');

const MARKS = [{ mark_cd: 'DONE', name: '완료' }, { mark_cd: 'IN_PROGRESS', name: '진행' }, { mark_cd: 'NA', name: '대상 아님' }, { mark_cd: 'NONE', name: '시작 전' }];
function row(o) {
  return Object.assign({ bid_case_id: 'B1', institution_name: '청주시', state_cd: 'IN_PROGRESS', state_name: '사전준비 중', ended: false,
    assignee_names: ['김영업'], can_view: true, can_check: true, is_mine: true,
    cells: {
      NOTICE_CHECK: { notice_status_name: '공고 확인', mark_cd: 'DONE', rev_no: 1, by_name: '김영업', confirmed_on: '2026-11-24' },   // 담당이 확인을 적은 상태(11-25)
      INST_ANALYSIS: { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '시스템' },
      FIN_COMMITTEE: { mark_cd: 'IN_PROGRESS', marked_on: '2026-11-21', by_name: '김영업', rev_no: 3 },
      BOARD_SECRETARIAT: { mark_cd: 'DONE', marked_on: '2026-11-22', by_name: '김영업' },
      BOARD_AUDIT: { mark_cd: 'NA' },
    } }, o || {});
}
const TASKS = [
  { task_cd: 'T1', name: '기관 정보 요약', kind_cd: 'REQUIRED', judge_cd: 'MANUAL', state: 'DONE', done_by: { emp_no: '1', name: '김영업' }, done_at: '2026-11-10T15:20:00+09:00', can_check: false, can_uncheck: true },
  { task_cd: 'T2', name: '기관장 프로필', kind_cd: 'REQUIRED', judge_cd: 'MANUAL', state: 'TODO', can_check: true, can_uncheck: false },
  { task_cd: 'T3', name: '수익성 분석표 확정본', kind_cd: 'REQUIRED', judge_cd: 'FACT', state: 'TODO', can_check: false },
  { task_cd: 'T4', name: 'RFP 붙임서류', kind_cd: 'CONDITIONAL', judge_cd: 'FACT', state: 'NOT_APPLICABLE' },
  { task_cd: 'T5', name: '이사회 자료', kind_cd: 'REQUIRED', judge_cd: 'FACT', state: 'LOCKED', locked_by: 'T3' },
  { task_cd: 'T6', name: '이사회 발표 대본', kind_cd: 'OPTIONAL', judge_cd: 'MANUAL', state: 'PREPARING' },
];
function view(cd, over) {
  return Object.assign({
    bid_case_id: 'B1', institution_id: 'I1', institution_name: '청주시', state_cd: cd, state_name: '', progress: { done: 1, total: 3 },
    confirmed_by: { emp_no: '1', name: '김영업' }, confirmed_at: '2026-11-10T14:02:00+09:00', emp_verified: 1,
    board_result: null, assignees: [{ emp_no: '1', name: '김영업' }], tasks: cd === 'CONFIRMED' || cd === 'OPEN_PENDING' ? [] : TASKS,
    open_request: null, plan_request: null,
    viewer: { is_assignee: true, is_head: false, can_unconfirm: false, can_request_open: false, can_withdraw_open: false,
              can_request_plan_approval: false, can_start_writing: false, can_cancel: false, can_upload: true },
  }, over || {});
}
function model(v, idx, extra) {
  return Object.assign({ view: v, history: [], attach: null, role: '영업팀', meEmp: '1', row: row(), marks: MARKS, rowState: 'none', idx: idx, markBusy: {} }, extra || {});
}
function idxOf(id) { return pt.STEPS.map(function (s) { return s.id; }).indexOf(id); }
// 제목 아래 '완료 조건' 줄(F7)을 뺀 본문 — 같은 클래스(ts-okline is-note)를 쓰는 다른 줄을 검사할 때 쓴다
function noCond(h) {
  return h.replace(/<p class="ts-okline is-note" role="note">(?:<svg[^>]*>.*?<\/svg>)?<span><b>(?:완료 조건|완료로 표시됨|대상 아님으로 표시됨)<\/b>.*?<\/span><\/p>/, '');
}

// ── 구간·단계 정본 ──
test('PHASES·STEPS: 구간 3개, 24단계(담당자 지정 + 현업 단계 — 이사회 자료·발표 대본은 이사회 준비 한 단계), id 유일, 구간은 이어진 덩어리', function () {
  assert.deepStrictEqual(pt.PHASES.map(function (p) { return p.label; }), ['입찰 자료확인', '제안 준비', '협약 이행 준비']);
  assert.strictEqual(pt.STEPS.length, 24);
  assert.strictEqual(pt.STEPS[0].id, 'START');
  assert.strictEqual(pt.STEPS[0].label, '담당자 지정');
  assert.strictEqual(new Set(pt.STEPS.map(function (s) { return s.id; })).size, 24, 'id 유일');
  const keys = pt.PHASES.map(function (p) { return p.key; });
  let last = 0;
  pt.STEPS.forEach(function (s) {
    const k = keys.indexOf(s.ph);
    assert.ok(k >= last, s.label + ' 구간이 앞으로 돌아가지 않는다');
    last = k;
  });
  assert.deepStrictEqual(pt.phaseIdxs('bid').map(function (i) { return pt.STEPS[i].label; }), ['담당자 지정', '입찰공고확인', '기관 정보 분석', '수익성분석', '가결위(재무)', '출심위(사업부)', '이사회 준비', '이사회 개최 및 결과']);
  assert.deepStrictEqual(pt.phaseIdxs('agree').map(function (i) { return pt.STEPS[i].label; }), ['결과발표', '우선협상', '협약서(법률)', '협약체결품의', 'ATM', 'KB카드', '전산구축', 'VIP 지정', '금리승인', '협약식']);
  assert.strictEqual(pt.STEPS[pt.STEPS.length - 1].label, '협약식', '엑셀 칸 순서 그대로 협약식이 마지막');
  assert.strictEqual(pt.phaseIdxs('prep').length, 6);
  assert.deepStrictEqual(pt.phaseIdxs('prep').map(function (i) { return pt.STEPS[i].label; }), ['제안서', '발표자료', '제출서류', '제안서제출품의', '제안서 제출', 'PT']);
});

test('STEPS ↔ 서버 PrepBoardColumns: 칸 코드 28개가 빠짐없이 한 번씩, 이름도 같다', function () {
  const java = fs.readFileSync(JAVA, 'utf8');
  const cols = [];
  const re = /new Col\("([A-Z0-9_]+)",\s*"([^"]+)",\s*(null|"[A-Z_]+"),/g;
  let m;
  while ((m = re.exec(java))) cols.push({ cd: m[1], label: m[2], group: m[3] === 'null' ? '' : m[3].replace(/"/g, '') });
  assert.strictEqual(cols.length, 28);
  const mine = {};
  pt.STEPS.forEach(function (s) {
    if (s.subs) s.subs.forEach(function (x) { mine[x.cd] = { label: x.label, group: s.cd }; });
    else if (s.cd) mine[s.cd] = { label: s.label, group: '' };
  });
  assert.strictEqual(Object.keys(mine).length, 28);
  // 순서도 서버와 같다: 제안서 제출은 재산상이익 바로 뒤·PT 앞
  const order = pt.STEPS.reduce(function (a, s) { return a.concat(s.subs ? s.subs.map(function (x) { return x.cd; }) : s.cd ? [s.cd] : []); }, []);
  assert.ok(order.indexOf('PROPOSAL_SUBMIT') === order.indexOf('SUBMIT_PROPERTY') + 1 && order[order.indexOf('PROPOSAL_SUBMIT') + 1] === 'PT');
  const srv = cols.map(function (c) { return c.cd; });
  assert.ok(srv.indexOf('PROPOSAL_SUBMIT') === srv.indexOf('SUBMIT_PROPERTY') + 1 && srv[srv.indexOf('PROPOSAL_SUBMIT') + 1] === 'PT', '서버 순서도 같다');
  cols.forEach(function (c) {
    assert.ok(mine[c.cd], c.cd + ' 단계에 있음');
    assert.strictEqual(mine[c.cd].label, c.label, c.cd + ' 이름');
    assert.strictEqual(mine[c.cd].group, c.group, c.cd + ' 묶음');
  });
});

test('S3a 제안서 제출 단계(PROPOSAL_SUBMIT): 제안 준비 구간의 수동 체크 단계, 제안서제출품의 뒤·PT 앞', function () {
  const i = idxOf('PROPOSAL_SUBMIT');
  assert.ok(i > idxOf('SUBMIT_APPR') && i + 1 === idxOf('PT'));
  assert.deepStrictEqual([pt.STEPS[i].kind, pt.STEPS[i].ph, pt.STEPS[i].label, pt.STEPS[i].cd], ['manual', 'prep', '제안서 제출', 'PROPOSAL_SUBMIT']);
  assert.strictEqual(pt.colLabel('PROPOSAL_SUBMIT'), '제안서 제출');
  const v = view('IN_PROGRESS');
  assert.strictEqual(pt.condText(pt.STEPS[i], v), pt.T.cond.manual, '다른 수동 단계와 같은 완료 조건');
  assert.strictEqual(pt.stepState(pt.STEPS[i], v, row({ cells: { PROPOSAL_SUBMIT: { mark_cd: 'DONE' } } }), MARKS).closed, true);
  assert.strictEqual(pt.stepState(pt.STEPS[i], v, row(), MARKS).closed, false);
  const body = pt.bodyHtml(model(v, i));
  assert.deepStrictEqual((body.match(/data-mk="([A-Z_]+)"/g) || []).map(function (s) { return s.slice(9, -1); }), ['DONE', 'IN_PROGRESS', 'NA', 'NONE'], '기존 4개 값');
});

test('S3a 결과발표(RESULT): 선정·탈락을 고른다(DONE·IN_PROGRESS를 보내지 않는다), 옛 완료·진행은 다시 고르기', function () {
  const RM = MARKS.concat([{ mark_cd: 'WON', symbol: null, name: '선정' }, { mark_cd: 'LOST', symbol: null, name: '탈락' }]);
  const s = pt.STEPS[idxOf('RESULT')];
  const v = view('IN_PROGRESS');
  const body = pt.bodyHtml(model(v, idxOf('RESULT'), { marks: RM }));
  assert.deepStrictEqual((body.match(/data-act="mark" data-col="RESULT" data-mk="([A-Z_]+)"/g) || []).map(function (x) { return x.split('data-mk="')[1].slice(0, -1); }), ['WON', 'LOST', 'NA', 'NONE']);
  assert.ok(body.indexOf('data-mk="DONE"') < 0 && body.indexOf('data-mk="IN_PROGRESS"') < 0);
  assert.ok(body.indexOf('<span>선정</span>') > 0 && body.indexOf('<span>탈락</span>') > 0);
  // marks에 WON이 없는 옛 서버여도 이름은 기본값
  assert.ok(pt.bodyHtml(model(v, idxOf('RESULT'), { marks: MARKS })).indexOf('<span>선정</span>') > 0);
  // 다른 칸에는 WON·LOST가 없다
  assert.ok(pt.bodyHtml(model(v, idxOf('PT'), { marks: RM })).indexOf('data-mk="WON"') < 0);
  const st = function (mk) { return pt.stepState(s, v, row({ cells: { RESULT: { mark_cd: mk } } }), RM); };
  assert.deepStrictEqual([st('WON').closed, st('WON').text], [true, '선정']);
  assert.deepStrictEqual([st('LOST').closed, st('LOST').text], [true, '탈락']);
  assert.strictEqual(st('NA').closed, true);
  assert.strictEqual(st('NONE').closed, false);
  assert.strictEqual(st('DONE').closed, false, '옛 완료는 끝난 것이 아니다');
  assert.ok(st('DONE').text.indexOf('추가 확인 필요') > 0 && st('IN_PROGRESS').text.indexOf('추가 확인 필요') > 0);
  // 끝난 건(CANCELLED·row.ended)은 '추가 확인 필요' 문구 없이 옛 값 이름만
  const stEnded = function (vv, rr) { return pt.stepState(s, vv, rr, RM); };
  const rrow = function (extra) { return row(Object.assign({ cells: { RESULT: { mark_cd: 'DONE' } } }, extra)); };
  assert.ok(stEnded(Object.assign({}, v, { state_cd: 'CANCELLED' }), rrow()).text.indexOf('추가 확인') < 0);
  assert.ok(stEnded(v, rrow({ ended: true })).text.indexOf('추가 확인') < 0);
  assert.strictEqual(stEnded(Object.assign({}, v, { state_cd: 'CANCELLED' }), rrow()).closed, false, '완료 판정은 그대로');
  assert.strictEqual(pt.cellState(row({ cells: { RESULT: { mark_cd: 'WON' } } }), 'RESULT', RM).mark, 'WON');
  // 체크할 수 없는 사람에게는 상태 글자만
  const ro = pt.bodyHtml(model(v, idxOf('RESULT'), { marks: RM, row: row({ can_check: false, cells: { RESULT: { mark_cd: 'LOST' } } }) }));
  assert.ok(ro.indexOf('data-mk=') < 0 && ro.indexOf('탈락') > 0);
});

test('STEPS.tasks: 준비 과제 T1~T6가 단계에 한 번씩 걸린다', function () {
  const all = [];
  pt.STEPS.forEach(function (s) { s.tasks.forEach(function (t) { all.push(t + '@' + s.id); }); });
  assert.deepStrictEqual(all.sort(), ['T1@INST_ANALYSIS', 'T2@INST_ANALYSIS', 'T3@PROFIT', 'T4@SUBMIT_DOCS', 'T5@BOARD_DOC', 'T6@BOARD_DOC']);
});

test('colLabel: 칸 이름, 묶음 칸은 \'묶음 › 칸\'', function () {
  assert.strictEqual(pt.colLabel('FIN_COMMITTEE'), '가결위(재무)');
  assert.strictEqual(pt.colLabel('CONTRACT_AUDIT'), '협약체결품의 › 감사·감시');
  assert.strictEqual(pt.colLabel('BOARD_AUDIT'), '이사회 개최 및 결과 › 감사·감시');
  assert.strictEqual(pt.colLabel('NOPE'), 'NOPE');
});

// ── 단계 상태 ──
test('stepState: 담당자 지정은 건 상태를 따른다', function () {
  const s = pt.STEPS[0];
  assert.deepStrictEqual(pt.stepState(s, view('CONFIRMED'), row(), MARKS), { glyph: '', text: '할 일', cnt: '', closed: false });
  assert.deepStrictEqual(pt.stepState(s, view('OPEN_PENDING'), row(), MARKS), { glyph: 'prog', text: '승인 대기', cnt: '', closed: false });
  assert.strictEqual(pt.stepState(s, view('IN_PROGRESS'), row(), MARKS).closed, true);
  assert.strictEqual(pt.stepState(s, view('WRITING'), row(), MARKS).glyph, 'done');
  assert.strictEqual(pt.stepState(s, view('CANCELLED'), row(), MARKS).closed, false);
});

test('stepState: 과제 단계는 과제 상태, 손 칸은 표의 값, 묶음은 개수', function () {
  const v = view('IN_PROGRESS');
  const st = function (id) { return pt.stepState(pt.STEPS[idxOf(id)], v, row(), MARKS); };
  assert.deepStrictEqual(st('INST_ANALYSIS'), { glyph: 'prog', text: '할 일', cnt: '완료 1/2', closed: false });   // T1 완료·T2 할 일
  assert.strictEqual(st('PROFIT').closed, false);
  assert.strictEqual(st('BOARD_DOC').closed, false, '이사회 자료 과제(T5)가 안 끝났으면 이사회 준비는 열린 단계');
  // 선택 과제(발표 대본)는 이사회 준비의 끝남을 막지 않는다
  const t5done = TASKS.map(function (t) { return t.task_cd === 'T5' ? Object.assign({}, t, { state: 'DONE' }) : t.task_cd === 'T6' ? Object.assign({}, t, { state: 'TODO' }) : t; });
  assert.strictEqual(pt.stepState(pt.STEPS[idxOf('BOARD_DOC')], view('IN_PROGRESS', { tasks: t5done }), row(), MARKS).closed, true);
  assert.deepStrictEqual(st('FIN_COMMITTEE'), { glyph: 'prog', text: '진행', cnt: '', closed: false });
  assert.deepStrictEqual(st('BIZ_COMMITTEE'), { glyph: '', text: '시작 전', cnt: '', closed: false });
  assert.deepStrictEqual(st('BOARD'), { glyph: 'prog', text: '완료 1/3', cnt: '완료 1/3', closed: false });
  assert.strictEqual(st('NOTICE_CHECK').text, '공고 확인, 확인 완료');
  // 묶음이 전부 완료·대상 아님이면 닫힘
  const r2 = row({ cells: { BOARD_SECRETARIAT: { mark_cd: 'DONE' }, BOARD_AUDIT: { mark_cd: 'NA' }, BOARD_COMPLIANCE: { mark_cd: 'DONE' } } });
  assert.strictEqual(pt.stepState(pt.STEPS[idxOf('BOARD')], v, r2, MARKS).closed, true);
  // 과제가 아직 없으면(담당자 지정 전) 자동 칸은 표의 값
  assert.strictEqual(pt.stepState(pt.STEPS[idxOf('INST_ANALYSIS')], view('CONFIRMED'), row(), MARKS).glyph, 'done');
  // 제안서: 작성 중이면 진행 표시
  assert.strictEqual(pt.stepState(pt.STEPS[idxOf('PROPOSAL')], view('WRITING'), row(), MARKS).text, '작성 중');
});

test('defaultIdx: 처음 만나는 안 끝난 단계(입찰공고확인은 건너뜀), 취소 건은 첫 단계', function () {
  assert.strictEqual(pt.defaultIdx(view('CONFIRMED'), row(), MARKS), 0);
  assert.strictEqual(pt.STEPS[pt.defaultIdx(view('IN_PROGRESS'), row(), MARKS)].id, 'INST_ANALYSIS');
  const allDone = TASKS.map(function (t) { return Object.assign({}, t, { state: 'DONE' }); });
  assert.strictEqual(pt.STEPS[pt.defaultIdx(view('IN_PROGRESS', { tasks: allDone }), row(), MARKS)].id, 'FIN_COMMITTEE');
  assert.strictEqual(pt.defaultIdx(view('CANCELLED'), row(), MARKS), 0);
  assert.strictEqual(pt.defaultIdx(view('IN_PROGRESS'), null, MARKS) >= 0, true, '표의 줄이 없어도 죽지 않는다');
});

test('phaseModel·phaseEntryIdx: 구간 숫자와 구간 단추가 데려갈 단계', function () {
  const v = view('IN_PROGRESS');
  const pm = pt.phaseModel(v, row(), MARKS, idxOf('FIN_COMMITTEE'));
  assert.deepStrictEqual(pm.map(function (p) { return [p.key, p.no, p.done, p.total, p.current]; }),
    [['bid', 1, 2, 8, true], ['prep', 2, 0, 6, false], ['agree', 3, 0, 10, false]]);   // bid 8단계, 끝난 것 = 담당자 지정·입찰공고확인
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('agree', v, row(), MARKS)].id, 'RESULT');
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('bid', v, row(), MARKS)].id, 'INST_ANALYSIS');
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('prep', v, row(), MARKS)].id, 'PROPOSAL');
  const r = row({ cells: { RESULT: { mark_cd: 'WON' } } });
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('agree', v, r, MARKS)].id, 'PRIORITY_NEGO');
  const old = row({ cells: { RESULT: { mark_cd: 'DONE' } } });
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('agree', v, old, MARKS)].id, 'RESULT', '옛 완료 값은 끝난 것으로 치지 않는다(다시 고르기)');
  const h = pt.phasesHtml(pm);
  assert.ok(/role="group" aria-label="진행 구간"/.test(h));
  assert.strictEqual((h.match(/data-act="ts-phase"/g) || []).length, 3);
  assert.ok(/data-ph="bid" aria-pressed="true"/.test(h) && /data-ph="prep" aria-pressed="false"/.test(h));
});

test('stepsModel·stepsHtml: 지금 구간의 단계만, 번호는 전체 순번, 탭 정지는 지금 단계 하나', function () {
  const v = view('IN_PROGRESS');
  const m = pt.stepsModel(v, row(), MARKS, idxOf('AGREE_LEGAL'));
  assert.deepStrictEqual(m.map(function (x) { return x.label; }), ['결과발표', '우선협상', '협약서(법률)', '협약체결품의', 'ATM', 'KB카드', '전산구축', 'VIP 지정', '금리승인', '협약식']);
  assert.deepStrictEqual(m.map(function (x) { return x.no; }), [15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  const h = pt.stepsHtml(m);
  assert.strictEqual((h.match(/tabindex="0"/g) || []).length, 1);
  assert.strictEqual((h.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(/data-i="16" tabindex="0" aria-current="step"/.test(h));
  const first = pt.stepsHtml(pt.stepsModel(v, row(), MARKS, 0));
  assert.ok(/class="ts-step is-ro" data-i="1"/.test(first), '입찰공고확인은 읽기만');
});

test('stepKey: 같은 구간 안에서만 움직인다', function () {
  const a = pt.phaseIdxs('agree');
  assert.strictEqual(pt.stepKey(a[0], 'ArrowUp'), a[0]);
  assert.strictEqual(pt.stepKey(a[0], 'ArrowDown'), a[1]);
  assert.strictEqual(pt.stepKey(a[1], 'End'), a[a.length - 1]);
  assert.strictEqual(pt.stepKey(a[a.length - 1], 'ArrowDown'), a[a.length - 1]);
  assert.strictEqual(pt.stepKey(a[2], 'Home'), a[0]);
  assert.strictEqual(pt.stepKey(a[0], 'Enter'), null);
});

test('liveText: 기관, 구간 n단계 이름, 상태', function () {
  assert.strictEqual(pt.liveText(view('IN_PROGRESS'), row(), MARKS, idxOf('FIN_COMMITTEE')), '청주시, 입찰 자료확인 5단계 가결위(재무), 진행');
});

// ── 체크 권한 ──
test('markGate: 줄 없음·끝난 건·개설 전·담당 아님은 보기만', function () {
  assert.deepStrictEqual(pt.markGate(view('IN_PROGRESS'), row(), 'none'), { can: true, why: '' });
  assert.strictEqual(pt.markGate(view('IN_PROGRESS'), null, 'none').why, pt.T.noRow);
  assert.strictEqual(pt.markGate(view('IN_PROGRESS'), null, 'loading').why, pt.T.rowLoading);
  assert.strictEqual(pt.markGate(view('CONFIRMED'), row(), 'none').why, pb.T.infoPre);
  assert.strictEqual(pt.markGate(view('OPEN_PENDING'), row(), 'none').can, false);
  assert.strictEqual(pt.markGate(view('IN_PROGRESS'), row({ can_check: false }), 'none').why, pb.T.infoNotMine);
  assert.strictEqual(pt.markGate(view('IN_PROGRESS'), row({ ended: true }), 'none').why, pt.T.ended);
  assert.strictEqual(pt.markGate(view('CANCELLED'), row(), 'none').can, false);
});

// ── 본문 ──
test('bodyHtml 손 칸: 상태 단추 4개(눌린 값 하나)·마지막 체크·이전/다음', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('FIN_COMMITTEE')));
  assert.ok(/입찰 자료확인 · 5 \/ 24/.test(h));
  assert.ok(/<h3 class="ts-step-title" id="ts-step-title" tabindex="-1">가결위\(재무\)<\/h3>/.test(h));
  assert.strictEqual((h.match(/data-act="mark" data-col="FIN_COMMITTEE"/g) || []).length, 4);
  assert.strictEqual((h.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(/data-mk="IN_PROGRESS" aria-pressed="true"/.test(h));
  assert.ok(/마지막 체크 2026-11-21 김영업/.test(h));
  assert.ok(/data-act="ts-prev">이전: 수익성분석</.test(h) && /data-act="ts-next">다음: 출심위\(사업부\)</.test(h));
});

test('bodyHtml 손 칸: 체크할 수 없으면 단추 없이 값과 이유만, 저장 중이면 단추가 잠긴다', function () {
  const ro = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('FIN_COMMITTEE'), { row: row({ can_check: false }) }));
  assert.ok(!/data-act="mark"/.test(ro));
  assert.ok(ro.indexOf(pb.T.infoNotMine) >= 0 && /class="ts-cell"/.test(ro));
  const busy = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('FIN_COMMITTEE'), { markBusy: { FIN_COMMITTEE: true } }));
  assert.strictEqual((busy.match(/aria-disabled="true"/g) || []).length, 4);
  assert.ok(busy.indexOf(pt.T.saving) >= 0);
  const none = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('PT'), { row: null }));
  assert.ok(none.indexOf(pt.T.noRow) >= 0 && !/data-act="mark"/.test(none));
});

test('bodyHtml 묶음: 하위 칸마다 한 줄씩 상태 단추', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('CONTRACT_APPR')));
  assert.strictEqual((h.match(/<li data-col="CONTRACT_/g) || []).length, 4);
  assert.strictEqual((h.match(/data-act="mark"/g) || []).length, 16);
  assert.ok(/aria-label="협약체결품의 › 영업점안내 상태"/.test(h));
  assert.ok(/협약 이행 준비 · 18 \/ 24/.test(h));
});

test('bodyHtml 담당자 지정: 확정 단계면 [개설 신청], 승인 대기면 대기 안내, 뒤에는 담당 이름', function () {
  const c = pt.bodyHtml(model(view('CONFIRMED', { viewer: { can_request_open: true } }), 0));
  assert.ok(/data-act="open-request-open"/.test(c) && c.indexOf(pt.T.startHint) >= 0);
  assert.ok(/data-act="ts-prev" disabled>이전 단계 없음</.test(c));
  const p = pt.bodyHtml(model(view('OPEN_PENDING', { open_request: { req_id: 7, status: 'PENDING' }, viewer: { can_withdraw_open: true } }), 0));
  assert.ok(p.indexOf(prep.T.openPending) >= 0 && /data-act="withdraw" data-req="7"/.test(p));
  const d = pt.bodyHtml(model(view('IN_PROGRESS'), 0));
  assert.ok(d.indexOf(pt.T.startDone) >= 0 && />담당 1명<\/h4><ul class="ts-people"><li><b>김영업<\/b>/.test(d));
  assert.ok(!/open-request-open/.test(d));
  // 결재 없는 시작(can_start_prep): [담당자 지정], 옛 [개설 신청] 단추는 없다
  const s = pt.bodyHtml(model(view('CONFIRMED', { viewer: { can_start_prep: true, can_request_open: false } }), 0));
  assert.ok(/data-act="prep-start-open"/.test(s) && !/open-request-open/.test(s) && s.indexOf(pt.T.startHint) >= 0);
  // 스위치 켬({can_start_prep:false, can_request_open:true}): 옛 [개설 신청]과 옛 과제 자리 문구
  const sw = pt.bodyHtml(model(view('CONFIRMED', { viewer: { can_start_prep: false, can_request_open: true } }), 0));
  assert.ok(/data-act="open-request-open"/.test(sw) && !/prep-start-open/.test(sw));
});

test('bodyHtml 과제 단계: 그 단계에 걸린 과제만, 체크 단추는 prep.js 동작 이름 그대로', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS')));
  assert.strictEqual((h.match(/<li class="pp-task/g) || []).length, 2);
  assert.ok(/data-act="uncheck" data-task="T1"/.test(h) && /data-act="check" data-task="T2"/.test(h));
  assert.ok(!/data-task="T3"/.test(h));
  const p = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('PROFIT'), { attach: [] }));
  assert.ok(/data-task="T3"/.test(p) && /data-act="upload"/.test(p), '수익성 분석표 파일 칸');
  const b = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD_DOC'), { board: { state: 'none' } }));
  assert.ok(/data-task="T5"/.test(b) && /data-act="to-board-doc"/.test(b));
  const ro = pt.bodyHtml(model(view('IN_PROGRESS', { viewer: { is_assignee: false } }), idxOf('INST_ANALYSIS')));
  assert.ok(ro.indexOf(prep.T.readonly) >= 0);
  const pre = pt.bodyHtml(model(view('CONFIRMED'), idxOf('PROFIT')));
  assert.ok(pre.indexOf(prep.T.tasksLater) >= 0 && !/pp-task/.test(pre));
});

test('bodyHtml 제출서류: 손 칸과 RFP 붙임서류 과제가 함께 보인다', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('SUBMIT_DOCS')));
  assert.ok(/data-act="mark" data-col="SUBMIT_DOCS"/.test(h) && /data-task="T4"/.test(h));
});

test('bodyHtml 제안서: 준비 중 건이면 승인 요청·작성 시작 줄, 담당자 지정 전이면 안내만', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS', { viewer: { is_assignee: true, can_request_plan_approval: true } }), idxOf('PROPOSAL')));
  assert.ok(/data-act="plan-ask"/.test(h) && /data-act="start-ask"/.test(h));
  const w = pt.bodyHtml(model(view('WRITING'), idxOf('PROPOSAL')));
  assert.ok(/data-act="to-workflow"/.test(w));
  const c = pt.bodyHtml(model(view('CONFIRMED'), idxOf('PROPOSAL')));
  assert.ok(c.indexOf(pt.T.proposalLater) >= 0 && !/plan-ask/.test(c));
  const last = pt.bodyHtml(model(view('IN_PROGRESS'), pt.STEPS.length - 1));
  assert.ok(/data-act="ts-next" disabled>마지막 단계</.test(last));
});

test('caseHtml: 머리(제목·확정 취소)·알림 줄·구간 줄·단계 목록·본문이 한 화면에, 옛 5칸 단계 막대는 없다', function () {
  const h = pt.caseHtml(model(view('CONFIRMED', { viewer: { can_unconfirm: true, can_request_open: true } }), 0));
  assert.ok(/<h2 id="pp-case-title" class="tm-title" tabindex="-1">청주시<\/h2>/.test(h));
  assert.ok(/data-act="unconfirm-open"/.test(h));
  assert.ok(h.indexOf(prep.nextLine(view('CONFIRMED'))) >= 0);
  assert.ok(/class="ts-phases"/.test(h) && /<nav class="ts-steps" id="ts-steps" aria-label="입찰 자료확인 단계">/.test(h));
  assert.ok(/<section class="ts-body" id="ts-body" aria-labelledby="ts-step-title">/.test(h));
  assert.ok(/<div id="ts-live" class="sr-only" role="status"><\/div>/.test(h));
  assert.ok(!/wf-stepper/.test(h), '옛 단계 막대 없음');
  assert.strictEqual((h.match(/id="pp-case-title"/g) || []).length, 1);
  const x = pt.caseHtml(model(view('IN_PROGRESS', { institution_name: '<b>x</b>' }), 99));
  assert.ok(x.indexOf('<b>x</b>') < 0 && /담당자 지정/.test(x), '이름은 이스케이프, 범위 밖 번호는 첫 단계');
});

test('prep.caseHtml(옛 한 장 화면)은 조각으로 나눈 뒤에도 같은 내용을 낸다', function () {
  const m = { view: view('IN_PROGRESS'), history: [], attach: null, role: '영업팀', meEmp: '1' };
  const h = prep.caseHtml(m);
  assert.ok(h.indexOf(prep.caseHeadHtml(m)) === 0);
  assert.ok(/wf-stepper/.test(h) && (h.match(/<li class="pp-task/g) || []).length === 6);
  assert.ok(h.indexOf(prep.taskItemHtml(prep.taskModel(TASKS[1], prep.tasksByCd(TASKS), m.view.viewer, 1), m)) > 0);
});

// ── 배선(정적) ──
test('배선: 표의 기관 이름 → prep.enterCase에 그 줄·값 이름표·조회 범위를 넘긴다', function () {
  assert.ok(/B\.hooks\.openCase\(str\(row\.bid_case_id\), str\(row\.institution_name\), \{ row: row, marks: B\.data \? B\.data\.marks : \[\], scope: B\.scope \}\);/.test(PB_SRC));
  assert.ok(/function enterCase\(bid, name, bd\) \{/.test(PREP_SRC));
  assert.ok(!/openFromBoard|is-steps/.test(PB_SRC + PREP_SRC + SRC), '옛 단계 틀 경로는 없다');
});

test('배선: paintCase는 preptask.caseHtml을 쓰고 없으면 옛 화면, 건을 새로 열면 단계 선택을 처음으로', function () {
  assert.ok(/if \(pt && pt\.caseHtml\) \{[\s\S]*?box\.innerHTML = pt\.caseHtml\(model\);[\s\S]*?\} else \{\s*box\.innerHTML = prep\.caseHtml\(model\);/.test(PREP_SRC));
  assert.ok(/if \(S\.stepIdx < 0\) S\.stepIdx = pt\.defaultIdx\(d\.view, model\.row, model\.marks\);/.test(PREP_SRC));
  ['function enterCase(bid, name, bd) {', 'function selectCase(id) {', 'prep.openCase = function (bid, flash) {', 'function toBoardState() {'].forEach(function (head) {
    const a = PREP_SRC.indexOf(head);
    assert.ok(a > 0, head);
    assert.ok(/resetSteps\(/.test(PREP_SRC.slice(a, a + 900)), head + ' → resetSteps');
  });
});

test('배선: 단계·구간·이전/다음·칸 체크 동작 이름이 화면과 처리 양쪽에 있다', function () {
  ['ts-phase', 'ts-prev', 'ts-next', 'mark', 'to-board-doc'].forEach(function (act) {
    assert.ok(SRC.indexOf('data-act="' + act + '"') >= 0, act + ' 화면');
    assert.ok(PREP_SRC.indexOf("case '" + act + "':") >= 0, act + ' 처리');
  });
  assert.ok(/if \(t\.classList\.contains\('ts-step'\)\) \{ selectStep\(/.test(PREP_SRC));
  assert.ok(/r\.addEventListener\('keydown', onStepKey\);/.test(PREP_SRC));
});

test('배선: 칸 체크는 표와 같은 주소·화면 이름표, 같은 값·저장 중이면 요청하지 않는다', function () {
  const a = PREP_SRC.indexOf('function onMark(cd, mark, via) {');
  const b = PREP_SRC.indexOf('// o.popup: 건을 연 경우에만 true(');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(/S\.markBusy\[cd\]\) return;/.test(f));
  assert.ok(/if \(cur\.mark === mark\) return;/.test(f));
  assert.ok(/req\('PUT', base\(id\) \+ '\/board-checks\/' \+ encodeURIComponent\(cd\), \{ mark_cd: mark, base_rev: cur\.revNo \}, via \|\| ui\('prep_detail', 'dash_check'\)\)/.test(f));
  assert.ok(/row\.cells\[cd\] = prev;/.test(f), '실패하면 되돌린다');
  assert.ok(PB_SRC.indexOf("'/prep/board-checks/'") > 0, '표의 주소와 같다');
});

test('배선: preptask.js는 순수 함수만(문서·요청을 만지지 않는다), 스크립트 순서는 prep → prepboard → preptask', function () {
  assert.ok(!/document\.|fetch\(|addEventListener/.test(SRC));
  const a = HTML.indexOf('js/prep.js'), b = HTML.indexOf('js/prepboard.js'), c = HTML.indexOf('js/preptask.js');
  assert.ok(a > 0 && b > a && c > b);
  assert.ok(!/preptask\.mount|preptask\.onProfileChange/.test(APP_SRC), 'app.js는 preptask를 직접 부르지 않는다');
});

test('CSS: 구간 줄·상태 단추 규칙이 있고, 없앤 경로 2 규칙은 남지 않았다', function () {
  ['.ts-phases', '.ts-phase[aria-pressed="true"]', '.ts-marks', '.ts-mk[aria-pressed="true"]', '.ts-detail', '.ts-steps', '.ts-body', '.ts-pager'].forEach(function (sel) {
    assert.ok(HTML.indexOf(sel) > 0, sel);
  });
  ['#ts-root', '.ts-listv', '#ts-detail-pp', '#ts-detail-t', '.ts-t ', '.ts-ph '].forEach(function (sel) {
    assert.ok(HTML.indexOf(sel) < 0, sel + ' 없음');
  });
});

test('제안서 단계: 입찰 자료확인 구간에 안 끝난 단계가 있으면 알리기만 한다(막지 않음)', function () {
  const v = view('IN_PROGRESS', { viewer: { is_assignee: true, can_request_plan_approval: true } });
  assert.deepStrictEqual(pt.openBefore(v, row(), MARKS), ['기관 정보 분석', '수익성분석', '가결위(재무)', '출심위(사업부)', '이사회 준비', '이사회 개최 및 결과']);   // 발표 대본(선택·준비중)은 이사회 준비를 막지 않는다
  const h = pt.bodyHtml(model(v, idxOf('PROPOSAL')));
  assert.ok(h.indexOf('입찰 자료확인 구간에 아직 안 끝난 단계가 있습니다: 기관 정보 분석, 수익성분석') >= 0);
  assert.ok(/data-act="plan-ask"/.test(h) && !/data-act="plan-ask"[^>]*disabled/.test(h), '단추는 그대로 켜져 있다');
  assert.deepStrictEqual(pt.openBefore(v, null, MARKS), [], '표의 줄이 없으면 알리지 않는다');
  assert.ok(pt.bodyHtml(model(v, idxOf('PROPOSAL'), { row: null })).indexOf('아직 안 끝난 단계') < 0);
  const done = TASKS.map(function (t) { return Object.assign({}, t, { state: 'DONE' }); });
  const cells = { NOTICE_CHECK: { mark_cd: 'DONE', rev_no: 1 } };
  ['FIN_COMMITTEE', 'BIZ_COMMITTEE', 'BOARD_SECRETARIAT', 'BOARD_AUDIT', 'BOARD_COMPLIANCE'].forEach(function (c) { cells[c] = { mark_cd: c === 'BOARD_AUDIT' ? 'NA' : 'DONE' }; });
  assert.deepStrictEqual(pt.openBefore(view('IN_PROGRESS', { tasks: done }), row({ cells: cells }), MARKS), []);
  assert.ok(pt.bodyHtml(model(view('CANCELLED'), idxOf('PROPOSAL'))).indexOf('아직 안 끝난 단계') < 0);
});

// ── 11-25 추가: [다음] 확인 팝업·입찰공고확인 본문·담당자 지정 ──
test('[다음]: 채운 강조 단추, 확인 팝업 문구는 다음 단계 이름을 담는다', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('FIN_COMMITTEE')));
  assert.ok(/<button type="button" class="ts-go" data-act="ts-next">다음: 출심위\(사업부\)</.test(h));
  const a = pt.nextAskHtml(idxOf('FIN_COMMITTEE'));
  assert.ok(/role="dialog" aria-modal="true"/.test(a));
  // 사실대로: 넘어가는 것만으로는 지금 단계가 완료로 표시되지 않는다(F7). '저장'했다고 말하지 않는다.
  assert.ok(a.indexOf('&#39;출심위(사업부)&#39; 단계로 넘어갑니다. 넘어가는 것만으로는 지금 단계가 완료로 표시되지 않습니다.') > 0 && a.indexOf('저장') < 0);
  assert.ok(/id="pp-nx-no">닫기</.test(a) && /id="pp-nx-ok" class="ts-go">넘어가기</.test(a));
  // 지금 단계가 이미 닫혔으면 첫 문장만
  const closedRow = row({ cells: { FIN_COMMITTEE: { mark_cd: 'DONE' } } });
  const closed = pt.nextAskHtml(idxOf('FIN_COMMITTEE'), { view: view('IN_PROGRESS'), row: closedRow, marks: MARKS });
  assert.ok(closed.indexOf('단계로 넘어갑니다.</p>') > 0 && closed.indexOf('완료로 표시되지 않습니다') < 0);
  const openRow = pt.nextAskHtml(idxOf('FIN_COMMITTEE'), { view: view('IN_PROGRESS'), row: row(), marks: MARKS });
  assert.ok(openRow.indexOf('완료로 표시되지 않습니다') > 0, '진행 중이면 닫히지 않은 것으로 본다');
  // 2단계에서 확인이 기록될 때만 다른 문안·단추
  const n2 = pt.nextAskHtml(1, { noticeDue: true });
  assert.ok(n2.indexOf('&#39;기관 정보 분석&#39; 단계로 넘어가면서 입찰공고확인을 &#39;확인 완료&#39;로 기록합니다. 누가·언제 확인했는지 남습니다.') > 0);
  assert.ok(/id="pp-nx-no">닫기</.test(n2) && /id="pp-nx-ok" class="ts-go">확인하고 넘어가기</.test(n2));
  const n2plain = pt.nextAskHtml(1, { noticeDue: false });
  assert.ok(n2plain.indexOf('입찰공고확인을') < 0 && />넘어가기</.test(n2plain), '기록 조건이 아니면(빠진 항목·담당 아님) 일반 문안');
  assert.strictEqual(pt.nextAskHtml(pt.STEPS.length - 1), '', '마지막 단계는 팝업 없음');
  assert.ok(/case 'ts-next': openNextAsk\(\); return;/.test(PREP_SRC) && /case 'pp-nx-ok': closeNextAsk\(true\); break;/.test(PREP_SRC));
  assert.ok(/if \(S\.nextAsk\) \{ e\.preventDefault\(\); closeNextAsk\(false\); return; \}/.test(PREP_SRC), 'Esc로 닫힌다');
});

test('noticeGaps·noticeOk: 누락·미확인 항목과 단계 완료 판정', function () {
  assert.deepStrictEqual(pt.noticeGaps(null), ['입찰 공고 자료 없음']);
  assert.deepStrictEqual(pt.noticeGaps({ notice: true, receiveTo: '2026-12-01' }, { hasLink: true }), []);
  assert.deepStrictEqual(pt.noticeGaps({ notice: true }, { hasLink: false }), ['접수 마감일 미확인', '공고 링크 없음']);
  assert.deepStrictEqual(pt.noticeGaps({ unknown: true }, {}), ['입찰 예정일 미상']);
  assert.deepStrictEqual(pt.noticeGaps({ check: true }, { unhandled: true }), ['공고일 확인 필요', '예정일이 지났는데 공고 상태 기록이 없음']);
  const s = pt.STEPS[1], v = view('IN_PROGRESS');
  const ok = row();   // 확인을 적은 줄
  const todo = row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인', notice_ok: true } } });   // 누락은 없지만 아직 확인 전
  const gap = row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인', notice_ok: false } } });
  assert.deepStrictEqual(pt.stepState(s, v, ok, MARKS), { glyph: 'done', text: '공고 확인, 확인 완료', cnt: '', closed: true });
  assert.strictEqual(pt.stepState(s, v, gap, MARKS).closed, false);
  assert.strictEqual(pt.stepState(s, v, gap, MARKS).text, '공고 확인, 확인 필요');
  assert.deepStrictEqual(pt.stepState(s, v, todo, MARKS), { glyph: '', text: '공고 확인, 확인 전', cnt: '', closed: false });
  // 표의 줄이 있으면 구간 숫자에 들어가고, 확인 전이면 '지금 할 단계'가 된다
  assert.strictEqual(pt.phaseModel(v, ok, MARKS, 0)[0].total, 8);
  assert.strictEqual(pt.phaseModel(v, null, MARKS, 0)[0].total, 7, '줄을 못 받았으면 세지 않는다');
  assert.strictEqual(pt.STEPS[pt.defaultIdx(v, todo, MARKS)].id, 'NOTICE_CHECK');
  // [다음]에서 확인을 적을 때: 누락 없음 + 담당 + 아직 확인 전
  assert.strictEqual(pt.noticeConfirmDue(1, v, todo, 'none', { state: 'ok', gaps: [] }), true);
  assert.strictEqual(pt.noticeConfirmDue(1, v, todo, 'none', { state: 'ok', gaps: ['공고 링크 없음'] }), false);
  assert.strictEqual(pt.noticeConfirmDue(1, v, ok, 'none', { state: 'ok', gaps: [] }), false, '이미 확인함');
  assert.strictEqual(pt.noticeConfirmDue(1, v, row({ can_check: false, cells: todo.cells }), 'none', { state: 'ok', gaps: [] }), false, '담당이 아님');
  assert.strictEqual(pt.noticeConfirmDue(1, v, todo, 'none', { state: 'none', gaps: [] }), false);
  assert.strictEqual(pt.noticeConfirmDue(2, v, todo, 'none', { state: 'ok', gaps: [] }), false, '다른 단계');
  assert.strictEqual(pt.STEPS[pt.defaultIdx(v, gap, MARKS)].id, 'NOTICE_CHECK');
  assert.strictEqual(pt.STEPS[pt.defaultIdx(v, ok, MARKS)].id, 'INST_ANALYSIS');
});

test('bodyHtml 입찰공고확인: 기관정보 내용(읽기 전용)·누락 목록·고칠 화면 세 곳 안내', function () {
  const todoRow = row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인' } } });   // 아직 확인 전
  const g = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { row: todoRow, notice: { state: 'ok', html: '<div class="db-sec">공고 진행</div>', gaps: ['공고 링크 없음'] } }));
  assert.ok(g.indexOf('확인이 필요한 항목 1건') > 0 && g.indexOf('<li>공고 링크 없음</li>') > 0 && g.indexOf(pt.T.noticeGapsNo) > 0);
  assert.ok(g.indexOf('<div class="ts-notice"><div class="db-sec">공고 진행</div></div>') > 0);
  assert.strictEqual((g.match(/data-act="go-nav"/g) || []).length, 2);
  assert.ok(/data-nav="board">입찰 현황판</.test(g) && /data-nav="notice">입찰 공고 현황</.test(g) && !/data-nav="map"/.test(g) && g.indexOf('지역별 공고현황') < 0);
  assert.ok(!/data-act="mark"/.test(g), '이 단계에서는 고치지 않는다');
  const ok = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { row: todoRow, notice: { state: 'ok', html: '', gaps: [] } }));
  assert.ok(ok.indexOf('공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것이 없습니다.</span>') > 0 && noCond(ok).indexOf('[다음]을 누르면') < 0 && ok.indexOf('확인이 필요한 항목') < 0, '[다음]·기록 설명은 완료 조건 줄로 옮겼다');
  assert.ok(noCond(ok).indexOf('class="ts-okline"') > 0 && noCond(ok).indexOf('is-note') < 0 && ok.indexOf('누락되거나 미확인인') < 0, 'G=0·B=0이면 초록 줄(체크 글리프)');
  assert.ok(ok.indexOf('<dt>공고 상태</dt>') < 0 && g.indexOf('<dt>공고 상태</dt>') < 0, '2단계 본문에 머리 줄 공고 상태가 없다');
  const viewer = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { row: row({ can_check: false, cells: todoRow.cells }), notice: { state: 'ok', html: '', gaps: [] } }));
  assert.ok(viewer.indexOf(pt.T.noticeOkView) > 0, '담당이 아니면 기록은 담당이 남긴다고 알린다');
  // 확인을 적은 뒤: 누가·언제 + [확인 취소](담당만)
  const done = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { notice: { state: 'ok', html: '', gaps: [] } }));
  assert.ok(done.indexOf('확인 완료') > 0 && done.indexOf('김영업 2026-11-24') > 0 && done.indexOf(pt.T.noticeOk) < 0);
  assert.ok(/data-act="mark" data-col="NOTICE_CHECK" data-mk="NONE">확인 취소</.test(done));
  assert.ok(!/확인 취소/.test(pt.bodyHtml(model(view('IN_PROGRESS'), 1, { row: row({ can_check: false }), notice: { state: 'ok', html: '', gaps: [] } }))));
  assert.ok(/c\.pt\.noticeConfirmDue\(S\.stepIdx, c\.v, c\.row, [^)]*\)\) onMark\('NOTICE_CHECK', 'DONE', ui\('prep_detail', 'notice_confirm'\)\);/.test(PREP_SRC), '[다음] 확인에서 기록한다');
  const none = pt.bodyHtml(model(view('IN_PROGRESS'), 1));
  assert.ok(none.indexOf(pt.T.noticeNoRec) > 0);
  assert.ok(/function noticeInfo\(v, row\) \{/.test(PREP_SRC) && PREP_SRC.indexOf("button>/g, '').replace(") > 0, '실은 내용에서 단추를 걷는다');
});

test('담당자 지정: 끝난 뒤 이 화면에서 [담당자 변경…](여러 명), 결재 없는 시작 창은 누른 사람이 기본 선택', function () {
  const two = view('IN_PROGRESS', { assignees: [{ emp_no: '1', name: '김영업' }, { emp_no: '2', name: '배지아' }] });
  const d = pt.bodyHtml(model(two, 0));
  assert.ok(/data-act="assignee-change">담당자 변경…</.test(d) && !/data-nav="team"/.test(d), '다른 화면으로 보내지 않는다');
  assert.ok(/담당 2명/.test(d) && /<b>김영업<\/b>/.test(d) && /<b>배지아<\/b>/.test(d));
  // 담당자도 영업팀장도 아니면 단추 없이 안내만, 영업팀장은 담당이 아니어도 요청할 수 있다
  const other = view('IN_PROGRESS', { viewer: { is_assignee: false } });
  assert.ok(!/data-act="assignee-change"/.test(pt.bodyHtml(model(other, 0))) && pt.bodyHtml(model(other, 0)).indexOf(pt.T.changeAssigneeView) > 0);
  assert.ok(/data-act="assignee-change"/.test(pt.bodyHtml(model(other, 0, { role: '영업팀장' }))));
  // 차이 계산과 창 상태: 바뀐 사람이 없거나 사유가 없으면 요청할 수 없다
  assert.deepStrictEqual(prep.assigneeDiff(['1', '2'], ['2', '3']), { add: ['3'], remove: ['1'] });
  const ms = function (sel, reason) { return prep.modalState({ kind: 'open', change: true, cur: ['1'], sel: sel, reason: reason, candState: 'ok' }, false); };
  assert.strictEqual(ms(['1'], '사유').canGo, false);
  assert.strictEqual(ms(['1'], '사유').why, prep.T.changeWhySame);
  assert.strictEqual(ms(['1', '2'], '').canGo, false);
  assert.strictEqual(ms(['1', '2'], '인사 이동').canGo, true);
  assert.strictEqual(ms([], '인사 이동').canGo, false);
  assert.strictEqual(prep.modalGoLabel('open', false, true), '담당자 변경');
  assert.ok(prep.modalTitle('open', { name: '청주시', change: true }).indexOf('담당자 변경 — 청주시') === 0);
  assert.ok(prep.modalBodyHtml({ kind: 'open', change: true, cur: ['1'], sel: ['1'], reason: '', candState: 'ok', cands: [] }, {}).indexOf('변경 사유 (필수)') > 0);
  // 결재 없이 바로 반영 + 쪽지함 알림(사용자 11-25 답) — 옛 결재 요청 주소로 보내지 않는다
  assert.ok(/req\('POST', base\(S\.selected\) \+ '\/assignees\/change', \{ add_emp_nos: d\.add, remove_emp_nos: d\.remove, reason: reason \}, ui\('prep_detail', 'assignee_change'\)\)/.test(PREP_SRC));
  assert.ok(PREP_SRC.indexOf("'/approval-requests/assignee-change'") < 0);
  assert.strictEqual(prep.T.okChangeReq({ notified_count: 2 }), '담당자를 바꿨습니다. 쪽지함으로 2명에게 알렸습니다.');
  assert.strictEqual(prep.T.okChangeReq({ notified_count: 0 }), '담당자를 바꿨습니다.');
  assert.ok(pt.T.changeAssigneeNote.indexOf('쪽지함') > 0 && pt.T.changeAssigneeNote.indexOf('승인') < 0);
  assert.ok(/if \(m\.direct && !m\.change && !m\.sel\.length\) \{ const me = myEmp\(\);/.test(PREP_SRC));
  assert.ok(/team: N\.TEAM_ID/.test(PREP_SRC) && /board: N\.DASH_ID/.test(PREP_SRC));
});

// ── 11-25 추가: 3단계 펼침형 ──
const SUM_VIEW = { cur_ver: 2, viewer: { can_edit: true },
  tpl: { keys: [{ key: 'inst_name', label: '기관명', kind: 'FACT' }, { key: 'budget', label: '예산 규모', kind: 'TEXT' }, { key: 'overview', label: '기관 현황', kind: 'LIST' },
                { key: 'biz', label: '기관 주요 사업', kind: 'TABLE' }, { key: 'fund', label: '예산 운영 방식', kind: 'TABLE' }, { key: 'years', label: '연도별 예상', kind: 'TABLE' }] },
  content: { fields: { inst_name: { val: '청주시<b>' }, budget: { val: '3조 2천억', note: '2026 예산서 3쪽' } }, lists: { overview: ['인구 85만', ''] },
    tables: { biz: { rows: [{ group: '복지', sub: '돌봄', lines: ['통합 돌봄 확대'] }] }, fund: { rows: [{ kind: '일반회계', lines: [{ lv: 0, text: '평잔 운용' }, { lv: 1, text: '정기예금' }] }] },
      years: { unit: '억원', from: 2027, to: 2028, end: 2028, mmda: { 2027: '120', 2028: '130' }, income: { 2027: '3.1' }, notes: ['가정: 금리 2.5%'] } } } };

test('summaryHtml: 기관 정보 요약을 읽기용 표로 — 칸 순서 그대로, 값은 이스케이프, 안 쓴 양식은 안내', function () {
  const h = pt.summaryHtml(SUM_VIEW);
  assert.ok(h.indexOf('<th scope="row">기관명</th><td>청주시&lt;b&gt;</td>') > 0);
  assert.ok(h.indexOf('<th scope="row">예산 규모</th><td>3조 2천억 <span class="ts-note">(2026 예산서 3쪽)</span></td>') > 0);
  assert.ok(h.indexOf('<h4 class="ts-doc-h">기관 현황</h4><ul class="ts-doc-l"><li>인구 85만</li></ul>') > 0, '빈 줄은 뺀다');
  assert.ok(h.indexOf('<th scope="row">복지</th><td>돌봄</td><td><ul><li>통합 돌봄 확대</li></ul></td>') > 0);
  assert.ok(h.indexOf('<li>- 정기예금</li>') > 0);
  assert.ok(h.indexOf('<th scope="col">2027</th><th scope="col">2028</th>') > 0 && h.indexOf('<td class="m">130</td>') > 0);
  assert.ok(h.indexOf('<li>가정: 금리 2.5%</li>') > 0);
  assert.ok(h.indexOf('기관명') < h.indexOf('기관 현황') && h.indexOf('기관 현황') < h.indexOf('기관 주요 사업'));
  assert.ok(pt.summaryHtml(Object.assign({}, SUM_VIEW, { cur_ver: 0 })).indexOf(pt.T.sumEmpty) > 0);
  assert.strictEqual(pt.summaryHtml(null), '');
});

test('3단계 펼침형: 안 끝난 과제는 내용이 펼쳐지고 [수정하기], 끝난 과제는 접히고 [다시 보기]', function () {
  const docs = { T1: { state: 'ok', html: '<table class="ts-doc"></table>' }, T2: { state: 'ok', html: '<div class="hc">카드</div>' } };
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS'), { docs: docs, foldOpen: {} }));
  assert.strictEqual((h.match(/<li class="pp-task/g) || []).length, 2);
  // T1 = 완료 → 접힘
  assert.ok(/data-act="doc-toggle" data-task="T1" aria-expanded="false">다시 보기</.test(h));
  assert.ok(h.indexOf('<table class="ts-doc"></table>') < 0, '접힌 과제의 내용은 그리지 않는다');
  // T2 = 할 일 → 펼침 + 수정하기 + 완료로 표시
  assert.ok(/<div class="ts-fold" tabindex="0" role="region" aria-label="기관장 프로필 내용"><div class="hc">카드<\/div><\/div>/.test(h));
  assert.ok(/data-act="doc-edit" data-task="T2"[^>]*>수정하기</.test(h) && /data-act="check" data-task="T2"/.test(h));
  assert.ok(h.indexOf(pt.T.foldCheckHint) > 0 && h.indexOf('작성 화면은 준비 중') < 0);
  assert.ok(/<span class="pp-acts">/.test(h));
  // 다시 펴면 내용과 [접기]
  const o = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS'), { docs: docs, foldOpen: { T1: true } }));
  assert.ok(o.indexOf('<table class="ts-doc"></table>') > 0 && /aria-expanded="true">접기</.test(o));
  // 불러오는 중·실패
  const l = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS'), { docs: { T2: { state: 'loading' } } }));
  assert.ok(l.indexOf(pt.T.docLoading) > 0);
  // 담당이 아니면 [수정하기] 없음
  const ro = pt.bodyHtml(model(view('IN_PROGRESS', { viewer: { is_assignee: false } }), idxOf('INST_ANALYSIS'), { docs: docs }));
  assert.ok(!/data-act="doc-edit"/.test(ro) && ro.indexOf(prep.T.readonly) > 0);
});

test('3단계 배선: 양식 창·기관장 카드 연결, 건을 바꾸면 펼침 상태를 버린다', function () {
  assert.ok(/case 'doc-edit': onDocEdit\(cd, t\); return;/.test(PREP_SRC) && /case 'doc-toggle':/.test(PREP_SRC));
  assert.ok(/root\.instSummary\.open\(\{/.test(PREP_SRC) && /hc\.onPaneClick\(st === 'none' \? 'add-head' : 'edit', hcEnv\);/.test(PREP_SRC));
  assert.ok(/req\('GET', base\(id\) \+ '\/forms\/INST_SUMMARY', undefined, ui\('prep_form', 'form_open'\)\)/.test(PREP_SRC));
  assert.ok(/S\.sum = null; S\.foldOpen = \{\};/.test(PREP_SRC));
  const a = HTML.indexOf('js/dlg.js'), b = HTML.indexOf('js/instsummary.js');
  assert.ok(a > 0 && b > a, 'instsummary.js는 dlg.js 뒤에 실린다');
  ['.ts-fold {', '.ts-doc {', '.isf-state {', '.pp-acts {'].forEach(function (sel) { assert.ok(HTML.indexOf(sel) > 0, sel); });
});

// ── 11-25 추가: 4·7단계 수익성 분석표 → 이사회 자료 ──
test('7단계 이사회 자료: 채워진 표(읽기 전용)·상태·[표별 확인·제출하러 가기], 자료가 없으면 4단계 안내', function () {
  const ok = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD_DOC'), { board: { state: 'ok', id: 12, statusName: '작성 중', snapNo: 3, saved: '김영업 · 11-25 10:40', confirmed: false, html: '<div class="bd-m-ro-tables">표</div>' } }));
  assert.ok(/<dt>자료 상태<\/dt><dd>작성 중<\/dd>/.test(ok) && /<dt>버전<\/dt><dd><span class="m">3<\/span><\/dd>/.test(ok) && ok.indexOf('김영업 · 11-25 10:40') > 0);
  assert.ok(/class="pp-next-btn" data-act="to-board-doc" data-mat="12">표별 확인·제출하러 가기</.test(ok));
  assert.ok(/<div class="ts-fold ts-board" tabindex="0" role="region" aria-label="이사회 자료 내용"><div class="bd-m-ro-tables">표<\/div><\/div>/.test(ok));
  assert.ok(/data-task="T5"/.test(ok), '이사회 자료 과제 줄도 그대로');
  const cf = pt.boardBlockHtml({ state: 'ok', id: 12, statusName: '확정', snapNo: 4, confirmed: true, html: 'x' });
  assert.ok(cf.indexOf(pt.T.boardConfirmed) > 0 && />이사회 자료 열기</.test(cf) && !/pp-next-btn/.test(cf));
  const none = pt.boardBlockHtml({ state: 'none' });
  assert.ok(none.indexOf('4단계에서 수익성 분석표(xlsx)를 올리면') > 0 && /data-act="to-board-doc">이사회 자료 작성 열기</.test(none));
  assert.ok(pt.boardBlockHtml({ state: 'err' }).indexOf(pt.T.boardErr) > 0);
  assert.ok(pt.boardBlockHtml(undefined).indexOf(pt.T.docLoading) > 0);
  const p = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('PROFIT'), { attach: [] }));
  assert.ok(p.indexOf('이사회 자료 초안이 자동으로 만들어집니다') > 0);
});

test('4·7단계 배선: 올린 뒤 자동 초안(자료 만들기 → 엑셀 채우기 → 버전 저장), 제출·확정 자료는 건드리지 않음, 자료 바로 열기', function () {
  const a = PREP_SRC.indexOf('function autoBoardDraft(id, file) {'), b = PREP_SRC.indexOf('// 7단계 본문: 이 건의 이사회 자료');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(f.indexOf('.xlsx$/i.test(') > 0, 'xlsx만');
  assert.ok(f.indexOf("mat.createMaterial(bfetch, { bidCaseId: id, year: new Date().getFullYear() }, AUTO)") > 0);
  assert.ok(f.indexOf("if (str(d.status_cd) !== 'DRAFT' && str(d.status_cd) !== 'PREP') return { kind: 'locked' };") > 0);
  assert.ok(f.indexOf('bw.upload(bfetch,') > 0 && f.indexOf('bw.adoptManual(bw.buildState(') > 0 && f.indexOf('bw.saveBody(ws, baseVals, d.current_snap,') > 0 && f.indexOf('bw.postSnapshot(bfetch, mid, body, AUTO)') > 0);
  assert.ok(f.indexOf("const AUTO = ui('prep_detail', 'profit_upload');") > 0 && f.indexOf('matOfCase(id, AUTO)') > 0 && f.indexOf('mat.loadMaterial(bfetch, mid, AUTO.screen, AUTO.button)') > 0, '자동 초안의 네 호출은 모두 사전준비 상세 이름표');
  const la = PREP_SRC.indexOf('function loadMat(id) {'), lb = PREP_SRC.indexOf('function stepBoard() {');
  assert.ok(la > 0 && lb > la);
  const lm = PREP_SRC.slice(la, lb);
  assert.ok(lm.indexOf("const VIA = ui('prep_detail', 'board_view');") > 0 && lm.indexOf('matOfCase(id, VIA)') > 0
    && lm.indexOf('mat.loadMaterial(bfetch, f.item.material_id, VIA.screen, VIA.button)') > 0, '7단계 이사회 자료 보기는 사전준비 상세 이름표');
  assert.ok(PREP_SRC.indexOf('autoBoardDraft(id, f).then(function (r) {') > 0, '파일 올리기 성공 뒤에 부른다');
  assert.ok(PREP_SRC.indexOf('root.board.openMaterial(Number(mid))') > 0);
  const BOARD_SRC = src('js/board.js'), MAT_SRC = src('js/board-material.js');
  assert.ok(BOARD_SRC.indexOf('board.openMaterial = function (id) {') > 0 && BOARD_SRC.indexOf('root.app.openNavItem(root.nav.BOARD_ID)') > 0);
  assert.ok(MAT_SRC.indexOf('if (env.write && env.write.dirty && env.write.dirty() > 0) return false;') > 0, '저장 안 한 값이 있으면 열지 않는다');
  ['draftSaved', 'draftSame', 'draftLocked', 'draftFail'].forEach(function (k) { assert.ok(pt.T[k], k); });
  assert.strictEqual(pt.T.draftSaved(4), '이사회 자료 초안을 버전 4(으)로 저장했습니다. 7단계에서 표별로 확인하세요.');
});

// ── 11-25 추가(2): 입찰 자료확인 구간 보강 ──
test('2단계 확인 항목: 공고 진행(마감·입찰 없음은 붉은 줄)·공고 원본 파일(없으면 붉은 줄), 체크 모양', function () {
  const files = { known: true, n: 1 };
  const recv = pt.noticeChecks({ phase: 'receiving', receiveTo: '2026-12-10', deadlineDays: 15 }, '', files, { canUpload: true });
  assert.deepStrictEqual(recv.map(function (c) { return [c.label, c.bad]; }), [['공고 진행', false], ['공고 원본 파일', false]]);
  assert.ok(recv[0].text.indexOf('접수 중 · 마감 2026-12-10 (D-15)') === 0 && recv[1].text === '있음 · 1개');
  const past = pt.noticeChecks({ phase: 'awaiting', receiveTo: '2026-11-20', deadlineDays: -5 }, '', { known: true, n: 0 }, { canUpload: true });
  assert.strictEqual(past[0].bad, true);
  assert.ok(past[0].text.indexOf('마감 — 접수 마감이 지났습니다(마감 2026-11-20)') === 0);
  assert.deepStrictEqual([past[1].bad, past[1].text], [true, pt.T.fileNone]);
  assert.strictEqual(pt.noticeChecks(null, 'CLOSED', files)[0].text, pt.T.progRec.CLOSED, '담당자가 적은 공고 상태 기록이 먼저');
  assert.strictEqual(pt.noticeChecks({ phase: 'receiving' }, 'NO_BID', files)[0].bad, true);
  assert.strictEqual(pt.noticeChecks({ phase: 'unknown', late: true, since: 45 }, '', files)[0].bad, true);
  assert.strictEqual(pt.noticeChecks({ phase: 'unknown', late: false, since: 5 }, '', files)[0].bad, false);
  assert.deepStrictEqual([pt.noticeChecks(null, '', files)[0].text, pt.noticeChecks(null, '', files)[0].bad], [pt.T.progNone, false]);
  assert.strictEqual(pt.noticeChecks(null, '', { known: false })[1].text, pt.T.fileUnknown);
  assert.strictEqual(pt.noticeChecks(null, '', { known: true, n: 0 }, { canUpload: false })[1].text, pt.T.fileNoneView);
  const h = pt.noticeChecksHtml(past);
  assert.strictEqual((h.match(/<li class="is-bad">/g) || []).length, 2);
  assert.strictEqual((h.match(/class="ts-ck"/g) || []).length, 2, '줄마다 체크 모양');
  assert.strictEqual(pt.noticeChecksHtml([]), '');
  // 본문: 확인 항목이 누락 목록·기관정보 내용보다 위, 원본 파일 묶음이 있다
  const b = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { notice: { state: 'ok', gaps: [], html: '<div>공고</div>', checks: past }, noticeFiles: '<div class="pp-files" data-kind="NOTICE"></div>',
    row: row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인', notice_ok: true } } }) }));
  const bn = noCond(b);   // 제목 아래 완료 조건 줄을 뺀 본문
  assert.ok(bn.indexOf('class="ts-chk"') > 0 && bn.indexOf('class="ts-chk"') < bn.indexOf('class="ts-okline is-note"') && bn.indexOf('class="ts-okline is-note"') < bn.indexOf('class="ts-notice"'));
  assert.ok(b.indexOf('class="ts-okline is-note"') < b.indexOf('class="ts-chk"'), '완료 조건 줄은 제목 바로 아래, 확인 항목보다 위');
  // B>0·G=0: 초록 대신 중립 줄 — 범위를 밝히고 '누락되거나 미확인인' 단언을 하지 않는다
  assert.ok(b.indexOf('위에 붉게 표시한 2건은 확인만 하면 됩니다.') > 0 && b.indexOf('[다음]을 누르면 &#39;확인 완료&#39;로 기록됩니다') < 0 && b.indexOf('누락되거나 미확인인') < 0 && bn.indexOf('class="ts-okline"') < 0);
  const bView = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { notice: { state: 'ok', gaps: [], html: '', checks: past }, row: row({ can_check: false, cells: { NOTICE_CHECK: { notice_status_name: '공고 확인' } } }) }));
  assert.ok(bView.indexOf(pt.T.noticeNoteView(2)) > 0);
  // G>0: 주황만, 초록·중립 줄은 없다
  const bGap = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { notice: { state: 'ok', gaps: ['공고 링크 없음'], html: '', checks: past }, row: row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인' } } }) }));
  assert.ok(bGap.indexOf('class="ts-gaps"') > 0 && noCond(bGap).indexOf('ts-okline') < 0);
  assert.ok(/\.ts-okline\.is-note \{ color:var\(--fg\)/.test(HTML) && /\.ts-name \{ white-space:normal/.test(HTML));
  assert.ok(b.indexOf('>공고 원본 파일</h4><div class="pp-files" data-kind="NOTICE">') > 0);
  assert.ok(/\.ts-chk li\.is-bad \{ color:var\(--red\)/.test(HTML));
  assert.ok(pt.bodyHtml(model(view('IN_PROGRESS'), 1)).indexOf(pt.T.filesLater) > 0, '첨부 목록을 못 받았으면 안내만');
});

// ── 11-25 밤: 기관 정보 미확인(금고 은행·약정 기간·기관장)은 붉게 알리기만 하고 막지 않는다 ──
test('2단계 확인 항목: 금고 은행·약정 기간·기관장 미확인은 붉은 줄(막지 않음), 값이 있거나 못 불러왔으면 줄 없음', function () {
  const files = { known: true, n: 1 };
  const base = pt.noticeChecks({ phase: 'receiving', receiveTo: '2026-12-10', deadlineDays: 15 }, '', files, { canUpload: true });
  const all = pt.noticeChecks({ phase: 'receiving', receiveTo: '2026-12-10', deadlineDays: 15 }, '', files, { canUpload: true }, { bank: false, term: false, chief: false });
  assert.strictEqual(all.length, base.length + 3);
  assert.deepStrictEqual(all.slice(base.length).map(function (c) { return [c.label, c.text, c.bad]; }),
    [['금고 은행', '미확인', true], ['약정 기간', '미확인', true], ['기관장', '미확인', true]]);
  // 값이 있으면 줄을 더하지 않는다(초록 줄도 없다) / 못 불러왔으면(undefined) 세지 않는다
  assert.strictEqual(pt.noticeChecks(null, '', files, {}, { bank: true, term: true, chief: true }).length, base.length);
  assert.strictEqual(pt.noticeChecks(null, '', files, {}, { bank: undefined, term: undefined, chief: undefined }).length, base.length);
  assert.strictEqual(pt.noticeChecks(null, '', files, {}).length, base.length, 'inst를 안 넘기면 예전과 같다');
  assert.deepStrictEqual(pt.noticeChecks(null, '', files, {}, { bank: false }).slice(base.length).map(function (c) { return c.label; }), ['금고 은행']);
  // 붉은 줄 수 B가 그만큼 늘고 중립 줄 숫자도 늘며, 목록은 sr-only '(확인하세요)'
  const sub = base.filter(function (c) { return c.bad; }).length;
  assert.strictEqual(all.filter(function (c) { return c.bad; }).length, sub + 3);
  assert.ok(pt.noticeChecksHtml(all).split('(확인하세요)').length - 1 >= 3);
  const b = pt.bodyHtml(model(view('IN_PROGRESS'), 1, { notice: { state: 'ok', gaps: [], html: '', checks: all }, row: row({ cells: { NOTICE_CHECK: { notice_status_name: '공고 확인', notice_ok: true } } }) }));
  assert.ok(b.indexOf(pt.T.noticeNote(sub + 3)) > 0 || b.indexOf('위에 붉게 표시한 ' + (sub + 3) + '건') > 0);
  // [다음] 확인 가능 여부는 그대로 — noticeGaps·noticeConfirmDue는 inst를 모른다
  const v = view('IN_PROGRESS');
  const todo = row({ can_check: true, cells: { NOTICE_CHECK: { notice_ok: true } } });
  assert.strictEqual(pt.noticeConfirmDue(1, v, todo, 'none', { state: 'ok', gaps: [] }), true);
  assert.ok(/\bunknown: \(?inst|ni\.inst/.test(PREP_SRC) && PREP_SRC.indexOf('function instFacts(') > 0, 'prep.js가 기관 정보 판정을 넘긴다');
});

test('3단계: 과제 이름은 화면에서 바꿔 보이고, 한 번도 저장하지 않았으면 [작성 시작]', function () {
  assert.strictEqual(prep.T1_NAME, '기관 선정 입찰참여 관련 요약');
  assert.ok(/if \(t && t\.task_cd === 'T1'\) t\.name = prep\.T1_NAME;/.test(PREP_SRC));
  const todo = TASKS.map(function (t) { return t.task_cd === 'T1' ? Object.assign({}, t, { state: 'TODO', can_check: true, name: prep.T1_NAME }) : t; });
  const v = view('IN_PROGRESS', { tasks: todo });
  const empty = pt.bodyHtml(model(v, idxOf('INST_ANALYSIS'), { docs: { T1: { state: 'ok', html: '', empty: true }, T2: { state: 'ok', html: 'x' } } }));
  assert.ok(/data-act="doc-edit" data-task="T1"[^>]*>작성 시작</.test(empty) && /data-act="doc-edit" data-task="T2"[^>]*>수정하기</.test(empty));
  assert.ok(/data-task="T1" aria-describedby="ts-wn-T1"/.test(empty) && empty.indexOf('<p class="ts-note" id="ts-wn-T1">' + pt.T.docWriteNote + '</p>') > 0, '판이 없을 때 T1 단추 아래에 저장 안내');
  assert.ok(empty.indexOf('ts-wn-T2') < 0, '안내는 T1만');
  assert.ok(empty.indexOf('기관 선정 입찰참여 관련 요약') > 0);
  const filled = pt.bodyHtml(model(v, idxOf('INST_ANALYSIS'), { docs: { T1: { state: 'ok', html: 'y', empty: false } } }));
  assert.ok(/data-act="doc-edit" data-task="T1"[^>]*>수정하기</.test(filled) && filled.indexOf('ts-wn-T1') < 0 && filled.indexOf('>작성 시작<') < 0);
  assert.ok(/empty: sm\.state === 'ok' && !\(Number\(sm\.view && sm\.view\.cur_ver\) > 0\)/.test(PREP_SRC));
});

test('4단계 파일 표: 열은 파일명·상태·개인정보 검사·담당자·수정시간, 가운데 정렬, 종류별 목록', function () {
  const rows = [
    { attach_id: 1, task_cd: 'T3', name: '수익성.xlsx', size_bytes: 10, valid: true, confirmed: true, pii_state: 'CHECKED', uploaded_by: { emp_no: '1', name: '김영업' }, uploaded_at: '2026-11-25T09:02:00+09:00' },
    { attach_id: 2, task_cd: 'NOTICE', name: '공고문.pdf', size_bytes: 10, valid: true, pii_state: 'CHECKED', uploaded_by: { emp_no: '1', name: '김영업' }, uploaded_at: '2026-11-25T09:05:00+09:00' },
  ];
  const vw = { is_assignee: true, can_upload: true };
  const t3 = prep.filesHtml({ rows: rows, viewer: vw, meEmp: '1' });
  const heads = (t3.match(/<th scope="col"[^>]*>(?:<span class="sr-only">)?([^<]+)/g) || []).map(function (x) { return x.replace(/^.*>/, ''); });
  assert.deepStrictEqual(heads, ['파일명', '상태', '개인정보 검사', '담당자', '수정시간', '동작']);
  assert.ok(t3.indexOf('수익성.xlsx') > 0 && t3.indexOf('공고문.pdf') < 0, '수익성 분석표 목록에 다른 종류가 섞이지 않는다');
  assert.ok(t3.indexOf('이상 없음') > 0 && /data-act="upload" data-kind="T3"/.test(t3));
  const nt = prep.filesHtml({ rows: rows, viewer: vw, meEmp: '1', task: 'NOTICE', title: '', empty: '없음' });
  assert.ok(nt.indexOf('공고문.pdf') > 0 && nt.indexOf('수익성.xlsx') < 0 && /data-act="upload" data-kind="NOTICE"/.test(nt));
  assert.ok(!/data-act="setconfirm"/.test(nt) && nt.indexOf('>보관<') > 0, '확정본 지정은 수익성 분석표에만');
  assert.ok(prep.filesHtml({ rows: [], viewer: vw, task: 'BOARD_ADD', empty: '추가 자료 없음' }).indexOf('추가 자료 없음') > 0);
  // 올리는 중 표시는 그 종류에만, 단추는 모두 잠근다
  const busy = prep.filesHtml({ rows: [], viewer: vw, task: 'NOTICE', uploading: 'T3' });
  assert.ok(busy.indexOf('aria-disabled="true"') > 0 && busy.indexOf('올리는 중…') < 0);
  assert.ok(/\.pp-files \.ad-table\.pp-ftbl th, \.pp-files \.ad-table\.pp-ftbl td \{ text-align:center; vertical-align:middle; \}/.test(HTML));
  assert.ok(/form\.append\('task_cd', kind\);/.test(PREP_SRC) && /if \(kind !== 'T3'\) return;/.test(PREP_SRC), '자동 초안은 수익성 분석표를 올렸을 때만');
});

test('7단계 이사회 준비: 자료 작성·일정 등록·추가 자료 등록·발표 대본이 한 단계', function () {
  const base = { state: 'ok', id: 12, statusName: '작성 중', snapNo: 4, confirmed: false, html: 'x', resultCd: '', meeting: '', canResult: false, canMeeting: true };
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD_DOC'), { board: base, addFiles: '<div class="pp-files" data-kind="BOARD_ADD"></div>' }));
  const at = ['>이사회 자료 준비</h4>','>이사회 일정 등록</h4>', '>이사회 추가 자료 등록</h4>', '>이사회 발표 대본</h4>'].map(function (x) { return h.indexOf(x); });
  assert.ok(at[0] > 0 && at[0] < at[1] && at[1] < at[2] && at[2] < at[3]);
  assert.ok(/<h3 class="ts-step-title"[^>]*>이사회 준비<\/h3>/.test(h));
  assert.ok(/data-task="T5"/.test(h) && /data-task="T6"/.test(h) && h.indexOf('data-kind="BOARD_ADD"') > 0);
  assert.ok(/<input type="date" id="ts-sched-date" value="">/.test(h) && /data-act="board-sched">일정 등록</.test(h) && h.indexOf(pt.T.schedNone) > 0);
  // 일정이 있으면 [일정 바꾸기], 결과가 난 뒤에는 일정 칸을 닫는다
  const set = pt.boardSchedHtml(Object.assign({}, base, { resultCd: 'SCHEDULED', meeting: '2026-12-03' }));
  assert.ok(/value="2026-12-03"/.test(set) && />일정 바꾸기</.test(set) && set.indexOf('의결 예정') > 0);
  const after = pt.boardSchedHtml(Object.assign({}, base, { resultCd: 'PASSED', meeting: '2026-12-03' }));
  assert.ok(!/board-sched/.test(after) && after.indexOf('개최일은 8단계') > 0);
  // 자료 확정 전에도 일정은 등록한다(사용자 11-25 b안) — 위 base가 확정 전이다. 자료 없음·담당 아님은 안내만
  assert.ok(pt.boardSchedHtml({ state: 'none' }).indexOf(pt.T.schedNoMat) > 0);
  const ro = pt.boardSchedHtml(Object.assign({}, base, { canMeeting: false }));
  assert.ok(!/board-sched/.test(ro) && ro.indexOf(pt.T.schedView) > 0);
  assert.ok(pt.boardSchedHtml(Object.assign({}, base, { resErr: '날짜를 고르세요.' })).indexOf('role="alert">날짜를 고르세요.') > 0);
  // 배선: 일정은 날짜만 적는 주소, 권한은 서버 can_set_meeting
  assert.ok(/mat\.itemUrl\(sm\.d\.material_id\) \+ '\/meeting-date'/.test(PREP_SRC) && /JSON\.stringify\(\{ meeting_date: date \}\)/.test(PREP_SRC));
  assert.ok(/canMeeting: !!\(d\.viewer && d\.viewer\.can_set_meeting === true\)/.test(PREP_SRC));
  // 발표 대본 자리: '샘플 필요!' 상자가 아니라 [대본 Word 만들기…] 구간(NEXT 113 ⑤)
  const sc = h.slice(h.indexOf('>이사회 발표 대본</h4>'));
  assert.ok(sc.indexOf('샘플 필요!') < 0 && sc.indexOf('class="ts-need"') < 0 && SRC.indexOf('needScript') < 0);
  assert.ok(/<button type="button" data-act="script-open">대본 Word 만들기…<\/button>/.test(sc));
});

// ── NEXT 113 ⑤: 7단계 [대본 Word 만들기…] 구간·입력 창·요청 본문 ──
const BOARD_OK = { state: 'ok', id: 12, snapNo: 4, confirmed: true, html: '' };
function scriptBlock(v, board, script) { return pt.scriptBlockHtml(model(v, idxOf('BOARD_DOC'), { board: board, script: script })); }

test('대본 구간: 설명·상태 한 줄(확정·확정 전·없음·불러오지 못함·읽는 중)·단추·결과 줄·T6', function () {
  const v = view('IN_PROGRESS');
  const ok = scriptBlock(v, BOARD_OK);
  assert.ok(ok.indexOf(pt.T.scriptHint) >= 0 && ok.indexOf('숫자는 확정된 이사회 자료(버전 4)에서 가져옵니다.') >= 0);
  assert.ok(/data-act="script-open">대본 Word 만들기…</.test(ok) && /<p class="st-line" id="ts-script-line" role="status"><\/p>/.test(ok));
  assert.ok(ok.indexOf('data-task="T6"') > 0 && ok.indexOf(pt.T.scriptTaskNote) >= 0, '담당이면 T6 안내 한 줄');
  assert.ok(ok.indexOf(pt.T.scriptViewNote) < 0, '담당 영업에게는 숫자 안내가 없다');
  assert.ok(scriptBlock(v, Object.assign({}, BOARD_OK, { confirmed: false })).indexOf('지금 버전(4)의 숫자로 &#39;[확정 전 초안]&#39; 대본이 만들어집니다.') >= 0);
  assert.ok(scriptBlock(v, { state: 'none' }).indexOf(pt.T.scriptBoardNone) >= 0);
  assert.ok(scriptBlock(v, { state: 'err' }).indexOf(pt.T.scriptBoardErr) >= 0);
  assert.ok(scriptBlock(v, { state: 'loading' }).indexOf(pt.T.docLoading) >= 0);
  // 결과 줄: 오류면 role=alert + st-err, 글은 이스케이프
  const er = scriptBlock(v, BOARD_OK, { line: '실패 <b>', err: true });
  assert.ok(/<p class="st-line st-err" id="ts-script-line" role="alert">실패 &lt;b&gt;<\/p>/.test(er));
  assert.ok(/role="status">대본 Word를 내려받았습니다/.test(scriptBlock(v, BOARD_OK, { line: pt.T.scriptDone, err: false })));
});

test('대본 구간: 담당 영업이 아니고 영업부장도 아니면 숫자 안내, 이사회 자료 \'없음\'이라고 잘못 말하지 않는다 / 영업부장은 안내 없음', function () {
  const other = view('IN_PROGRESS', { viewer: { is_assignee: false, is_head: false } });
  const n = scriptBlock(other, { state: 'none' });
  assert.ok(n.indexOf(pt.T.scriptViewNote) >= 0, '숫자 안내');
  assert.ok(n.indexOf(pt.T.scriptBoardNone) < 0 && n.indexOf(pt.T.scriptBoardErr) >= 0, '볼 수 없는 사람의 none은 불러오지 못함 문구로');
  assert.ok(n.indexOf(pt.T.scriptTaskNote) < 0, 'T6 안내는 담당에게만');
  const head = view('IN_PROGRESS', { viewer: { is_assignee: false, is_head: true } });
  const hb = scriptBlock(head, { state: 'none' });
  assert.ok(hb.indexOf(pt.T.scriptViewNote) < 0 && hb.indexOf(pt.T.scriptBoardNone) >= 0);
});

test('대본 구간: 끝난 건·담당자 지정 전 건은 단추를 감추고 안내만', function () {
  ['CANCELLED', 'CONFIRMED', 'OPEN_PENDING'].forEach(function (cd) {
    const b = scriptBlock(view(cd), BOARD_OK);
    assert.ok(b.indexOf('data-act="script-open"') < 0 && b.indexOf(pt.T.scriptLater) >= 0, cd);
  });
});

test('대본 입력 창: 마크업·접근성·칸 id·기본 선택·필수 표시 없음', function () {
  const h = pt.scriptDialogHtml({ name: '청주시<i>', vals: {} });
  assert.ok(/class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="bs-t"/.test(h) && h.indexOf('id="bs-dlg" class="modal-overlay" style="display:none"') >= 0);
  assert.ok(h.indexOf('발표 대본 Word 만들기 — 청주시&lt;i&gt;') > 0, '기관명은 이스케이프');
  assert.ok(h.indexOf('모든 칸은 선택입니다') > 0 && h.indexOf('적은 내용은 저장되지 않습니다') > 0);
  assert.ok(h.indexOf('bs-meeting') < 0 && h.indexOf('COMMITTEE') < 0 && h.indexOf('회의 이름') < 0, '회의 이름은 이사회 고정 — 고르는 칸이 없다(사용자 11-26)');
  assert.ok(/<legend>회의<\/legend>/.test(h) && h.indexOf('id="bs-round"') > 0 && h.indexOf('id="bs-agenda"') > 0, '차수·의안번호는 그대로');
  assert.ok(/<input type="radio" name="bs-amt" value="TOTAL" checked>/.test(h) && !/value="EXCL_IT" checked/.test(h));
  assert.strictEqual((h.match(/dlg-req/g) || []).length, 0, '빨간 * 없음');
  assert.ok(!/<form/.test(h), 'Enter로 제출되지 않는다');
  ['bs-cancel', 'bs-go', 'bs-hint', 'bs-busy', 'bs-err', 'bs-t'].forEach(function (id) { assert.ok(h.indexOf('id="' + id + '"') > 0, id); });
  pt.SCRIPT_FIELDS.forEach(function (f) { assert.ok(h.indexOf(f.kind === 'radio' ? 'name="' + f.id + '"' : 'id="' + f.id + '"') > 0, f.id); });
  assert.ok(/<button type="button" id="bs-go" class="dlg-go">Word 만들기<\/button>/.test(h));
  assert.ok(/<input type="text" id="bs-round" inputmode="numeric"[^>]*maxlength="3"/.test(h) && !/type="number"/.test(h));
  assert.ok(/<textarea id="bs-intro" rows="3" maxlength="1000"/.test(h) && h.indexOf('id="bs-intro-n" class="tm-count">0/1,000') > 0);
  assert.ok(h.indexOf('자동으로 들어가는 값') > 0 && h.indexOf('지어내지 않고 〔… 확인 필요〕') > 0);
  // 간직한 값을 다시 채운다(이스케이프)
  const again = pt.scriptDialogHtml({ name: 'A', vals: { amount_mode: 'TOTAL', agenda_no: '제 1호"x', intro: '가\n나<b>' } });
  assert.ok(/value="TOTAL" checked/.test(again));
  assert.ok(again.indexOf('value="제 1호&quot;x"') > 0 && again.indexOf('가\n나&lt;b&gt;</textarea>') > 0 && again.indexOf('>6/1,000<') > 0);
});

test('대본: 400 key → 칸 id 짝(요청 칸 이름 전부), 칸별 오류 문구', function () {
  const pairs = { round: 'bs-round', agenda_no: 'bs-agenda', speaker_dept: 'bs-sdept', speaker_name: 'bs-sname', speaker_title: 'bs-stitle', term_years: 'bs-term',
    review_when: 'bs-when', accounting: 'bs-acct', intro: 'bs-intro', status_note: 'bs-status', effect: 'bs-effect', profit_note: 'bs-profit', amount_mode: 'bs-amt' };
  Object.keys(pairs).forEach(function (k) { assert.strictEqual(pt.scriptKeyToId(k), pairs[k], k); });
  assert.strictEqual(pt.scriptKeyToId('nope'), '');
  assert.strictEqual(pt.scriptKeyToId('meeting'), '', '회의 이름 칸은 없다(이사회 고정)');
  const e = function (key) { return pt.scriptError(400, { code: 'BAD_VALUE', key: key }); };
  assert.deepStrictEqual(e('round'), { id: 'bs-round', msg: '차수는 1~999 사이 숫자로 적으세요.' });
  assert.strictEqual(e('term_years').msg, '약정기간은 1~30 사이 숫자(년)로 적으세요.');
  assert.strictEqual(e('agenda_no').msg, '의안번호는 30자까지 적을 수 있습니다.');
  assert.strictEqual(e('speaker_dept').msg, '소속은 40자까지 적을 수 있습니다.');
  assert.strictEqual(e('speaker_name').msg, '이름은 30자까지 적을 수 있습니다.');
  assert.strictEqual(e('accounting').msg, '회계처리 방식은 40자까지 적을 수 있습니다.');
  assert.strictEqual(e('review_when').msg, '심의·평가 예상 시기는 40자까지 적을 수 있습니다.');
  assert.deepStrictEqual(e('meeting'), { id: '', msg: pt.T.scriptErr400 }, '칸이 없으니 창 전체 오류');
  assert.strictEqual(e('amount_mode').msg, '승인 금액 기준을 다시 고르세요.');
  assert.ok(e('effect').msg.indexOf('기대효과') === 0 && e('effect').id === 'bs-effect');
  // 칸을 모르는 400·그 밖 상태는 창 전체 오류(칸 id 없음), 내부 용어를 내지 않는다
  [[400, { code: 'BAD_VALUE', key: 'zzz' }, pt.T.scriptErr400], [400, null, pt.T.scriptErr400], [401, null, pt.T.scriptErr401], [403, null, pt.T.scriptErr403],
   [404, null, pt.T.scriptErr404], [413, { code: 'BODY_TOO_LARGE' }, pt.T.scriptErr413], [500, null, pt.T.scriptErr500], [0, null, pt.T.scriptErr500]].forEach(function (c) {
    const r = pt.scriptError(c[0], c[1]);
    assert.deepStrictEqual(r, { id: '', msg: c[2] }, String(c[0]));
    assert.ok(!/LLM|API|BAD_VALUE|key/.test(r.msg));
  });
});

test('대본: 성공 문구(초안 Y/N)와 내려받는 파일 이름(filename*)', function () {
  assert.strictEqual(pt.scriptDoneText(false), '대본 Word를 내려받았습니다. 〔…〕로 남은 자리는 Word에서 채우세요.');
  assert.ok(pt.scriptDoneText(true).indexOf('[확정 전 초안]으로 만들었습니다') === 9 && pt.scriptDoneText(true).indexOf('다시 만들면') > 0);
  assert.strictEqual(pt.scriptFileName('attachment; filename="board_script.docx"; filename*=UTF-8\'\'%EB%B0%9C%ED%91%9C%EB%8C%80%EB%B3%B8_%EC%B2%AD%EC%A3%BC%EC%8B%9C_20261126.docx'), '발표대본_청주시_20261126.docx');
  assert.strictEqual(pt.scriptFileName('attachment; filename="board_script.docx"'), pt.SCRIPT_FILE_DEFAULT);
  assert.strictEqual(pt.scriptFileName('attachment; filename*=UTF-8\'\'..%2F..%2Fx.docx'), '.._.._x.docx', '경로 문자는 바꾼다');
  assert.strictEqual(pt.scriptFileName(null), pt.SCRIPT_FILE_DEFAULT);
});

test('대본: 여러 줄 칸 사전 검사(13줄·301자·합계 1,000자) — 문제 없으면 비어 있음', function () {
  const lines = function (n) { return new Array(n + 1).join('가\n').replace(/\n$/, ''); };
  assert.deepStrictEqual(pt.scriptCheck({}), []);
  assert.deepStrictEqual(pt.scriptCheck({ intro: lines(12), effect: '가\n\n\n' }), [], '12줄·뒤쪽 빈 줄은 줄로 세지 않는다');
  const r13 = pt.scriptCheck({ intro: lines(13) });
  assert.deepStrictEqual(r13, [{ key: 'intro', id: 'bs-intro', msg: '12줄까지 적을 수 있습니다(지금 13줄).' }]);
  const r301 = pt.scriptCheck({ status_note: '가\n' + new Array(302).join('나') });
  assert.deepStrictEqual(r301, [{ key: 'status_note', id: 'bs-status', msg: '한 줄은 300자까지입니다(2번째 줄이 301자).' }]);
  assert.deepStrictEqual(pt.scriptCheck({ effect: new Array(301).join('가') + '\n' + new Array(301).join('가') + '\n' + new Array(301).join('가') + '\n' + new Array(301).join('가') }).map(function (x) { return x.msg; }), [pt.T.scriptErrTotal]);
  assert.strictEqual(pt.scriptCheck({ intro: lines(13), effect: lines(13) }).length, 2, '칸마다 하나씩');
  assert.strictEqual(pt.scriptCheck({ agenda_no: new Array(500).join('가') }).length, 0, '짧은 칸은 maxlength·서버가 본다');
});

test('대본: 요청 본문 — 비운 칸은 키를 뺀다, 라디오는 늘 값이 있다, 숫자 칸은 숫자로', function () {
  assert.deepStrictEqual(pt.scriptBody({}), { amount_mode: 'TOTAL' }, '회의 이름(meeting)은 보내지 않는다 — 서버 기본값 BOARD');
  assert.deepStrictEqual(pt.scriptBody({ round: '  ', agenda_no: '', intro: '   ', speaker_name: '' }), { amount_mode: 'TOTAL' });
  assert.deepStrictEqual(pt.scriptBody({ meeting: 'COMMITTEE', amount_mode: 'TOTAL', round: '12', term_years: '4', agenda_no: ' 제 1호 ', intro: '가\n나', effect: '' }),
    { amount_mode: 'TOTAL', round: 12, term_years: 4, agenda_no: '제 1호', intro: '가\n나' }, '남아 있던 meeting 값이 들어와도 싣지 않는다');
  assert.strictEqual(pt.scriptBody({ round: 'x1' }).round, 'x1', '숫자 모양이 아니면 그대로 보내 서버가 key로 알린다');
  assert.ok(!('speaker_dept' in pt.scriptBody({ speaker_dept: '' })));
});

test('대본 배선: 단추 → 창(dlg.open·body 직계) → POST board-script-docx, 머리글·감사 이름, 값은 화면 메모리에만', function () {
  assert.ok(/case 'script-open': onScriptOpen\(\); return;/.test(PREP_SRC));
  const a = PREP_SRC.indexOf('function dropScript() {'), b = PREP_SRC.indexOf('function onSetConfirmed(attachId) {');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(f.indexOf("document.body.insertAdjacentHTML('beforeend', pt.scriptDialogHtml(") > 0 && f.indexOf('dl.open(ov, {') > 0 && f.indexOf('restoreFallback') > 0);
  assert.ok(f.indexOf("'/board-script-docx'") > 0 && f.indexOf("'X-Screen-Id': 'prep_detail', 'X-Button-Id': 'script_docx'") > 0 && f.indexOf("method: 'POST'") > 0);
  assert.ok(f.indexOf('pt.scriptBody(vals)') > 0 && f.indexOf('pt.scriptCheck(vals)') > 0 && f.indexOf("r.headers.get('X-Script-Draft') === 'Y'") > 0 && f.indexOf('pt.scriptFileName(cd)') > 0);
  assert.ok(f.indexOf('dl.requestClose(ov)') > 0 && f.indexOf('dl.setDisabled(') > 0 && f.indexOf('dl.invalid(') > 0 && f.indexOf('dl.line(') > 0);
  assert.ok(f.indexOf('localStorage') < 0 && f.indexOf('sessionStorage') < 0, '적은 값은 브라우저 저장소에 넣지 않는다');
  assert.ok(f.indexOf('setTimeout(function () {') > 0 && f.indexOf('8000') > 0, '성공 줄은 8초 뒤 접는다(초안은 제외)');
  // 상세를 떠날 때(resetSteps) 값 비움, 구간에 결과 줄 모델을 넘긴다
  assert.ok(/S\.mat = null;[^\n]*\n    dropScript\(\);/.test(PREP_SRC));
  assert.ok(/model\.script = S\.script && S\.script\.bid === S\.selected \? \{ line: S\.script\.line, err: S\.script\.err \} : null;/.test(PREP_SRC));
  // 새 CSS(.bs-*)는 한 덩어리로 .ts-* 묶음 뒤에
  assert.ok(/\.bs-auto \{[^}]*border:1px dashed var\(--line-strong\)/.test(HTML) && /\.bs-lrow label \{ margin:0; flex:1 1 auto; \}/.test(HTML));
  assert.ok(HTML.indexOf('.bs-auto {') > HTML.indexOf('.ts-cell {') && HTML.indexOf('.bs-lrow {') < HTML.indexOf('/* 협약준비 업무 끝 */'));
});

test('8단계 이사회 개최 및 결과: 결과 등록·결과 문서 보관·부서별 확인', function () {
  const base = { state: 'ok', id: 12, confirmed: true, html: '', resultCd: 'SCHEDULED', meeting: '2026-12-03', canResult: true };
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD'), { board: base, resFiles: '<div class="pp-files" data-kind="BOARD_RES"></div>' }));
  assert.ok(/<h3 class="ts-step-title"[^>]*>이사회 개최 및 결과<\/h3>/.test(h));
  const at = ['>이사회 결과 등록</h4>', '>이사회 결과 문서 보관</h4>', '>부서별 확인</h4>'].map(function (x) { return h.indexOf(x); });
  assert.ok(at[0] > 0 && at[0] < at[1] && at[1] < at[2]);
  assert.ok(/<select id="ts-res-cd">/.test(h) && /<option value="SCHEDULED" selected>의결 예정</.test(h) && /<option value="PASSED">가결</.test(h) && /<option value="REJECTED">부결</.test(h));
  assert.ok(/<input type="date" id="ts-res-date" value="2026-12-03">/.test(h) && /data-act="board-result">결과 등록</.test(h));
  assert.strictEqual((h.match(/<li data-col="BOARD_/g) || []).length, 3, '표의 체크 칸 3개는 그대로');
  assert.ok(h.indexOf('data-kind="BOARD_RES"') > 0);
  assert.ok(/<option value="PASSED" selected>/.test(pt.boardResultHtml(Object.assign({}, base, { resultCd: '', meeting: '' }))), '처음에는 가결이 골라져 있다');
  assert.ok(pt.boardResultHtml(Object.assign({}, base, { confirmed: false })).indexOf(pt.T.schedNeedDoc) > 0);
  // 안건 번호 입력: 라벨·maxlength 30·placeholder·미리 채움, 의결 예정이면 비활성
  assert.ok(/<label for="ts-res-agenda">안건 번호<\/label><input type="text" id="ts-res-agenda" maxlength="30" placeholder="제2026-12호"[^>]*value="" disabled>/.test(h), '의결 예정이면 비활성');
  const hp = pt.boardResultHtml(Object.assign({}, base, { resultCd: 'PASSED', agendaNo: '제2026-12호"' }));
  assert.ok(/id="ts-res-agenda"[^>]*value="제2026-12호&quot;"><span/.test(hp) && hp.indexOf('disabled') < 0, '기존 값 미리 채움(이스케이프)');
  assert.ok(/AGENDA_NO_NOT_ALLOWED/.test(PREP_SRC) && /b\.agenda_no = str\(agEl\.value\)\.trim\(\)/.test(PREP_SRC) && /agendaNo: str\(d\.agenda_no\)/.test(PREP_SRC));
  assert.ok(/t\.id === 'ts-res-cd'[^\n]*ag\.disabled = str\(t\.value\) === 'SCHEDULED'/.test(PREP_SRC));
  // 배선: 이사회 자료 화면의 의결 결과와 같은 주소, 일정 등록은 '의결 예정'
  assert.ok(/mat\.itemUrl\(sm\.d\.material_id\) \+ '\/result'/.test(PREP_SRC) && /JSON\.stringify\(resultBody\(result, date, agEl\)\)/.test(PREP_SRC));
  assert.ok(/const result = sched \? 'SCHEDULED' : str\(cdEl && cdEl\.value\);/.test(PREP_SRC));
  assert.ok(/case 'board-sched': onBoardResult\(true\); return;/.test(PREP_SRC) && /case 'board-result': onBoardResult\(false\); return;/.test(PREP_SRC));
  assert.ok(/if \(curStep\.id === 'BOARD_DOC' \|\| curStep\.result\) model\.board = stepBoard\(\);/.test(PREP_SRC));
});

// ── 11-27: 선정 평가표 — cells 가 있으면 병합(rowspan)을 살려 그린다(rows 는 병합 칸이 빠져 당겨짐) ──
test('3단계 선정 평가표: cells 의 rs·cs 를 rowspan·colspan 으로 싣는다', function () {
  const cells = [
    { r: 0, c: 0, rs: 1, cs: 1, text: '구분' }, { r: 0, c: 1, rs: 1, cs: 1, text: '평가\n항목' }, { r: 0, c: 2, rs: 1, cs: 1, text: '내용' },
    { r: 0, c: 3, rs: 1, cs: 1, text: '비고' }, { r: 0, c: 4, rs: 1, cs: 1, text: '배점' },
    { r: 1, c: 0, rs: 6, cs: 1, text: '경영\n건전성\n(12점)' }, { r: 1, c: 1, rs: 4, cs: 1, text: '재무\n지표' },
    { r: 1, c: 2, rs: 1, cs: 1, text: '॰ 최근 3년간 평균 자기자본비율(BIS)' }, { r: 1, c: 3, rs: 1, cs: 1, text: '정량' }, { r: 1, c: 4, rs: 1, cs: 1, text: '2' },
    { r: 2, c: 2, rs: 1, cs: 1, text: '॰ 최근 3년간 평균 고정이하여신 비율(NPL)<i>' }, { r: 2, c: 3, rs: 1, cs: 1, text: '정량' }, { r: 2, c: 4, rs: 1, cs: 1, text: '2' }];
  const data = { found: true, files: 1, attach_id: 7, file: 'a.hwpx', kind: 'TABLE', total: 100, page: 0, row_count: 3, col_count: 5, cells: cells,
    rows: [['구분', '평가\n항목', '내용', '비고', '배점'], ['경영\n건전성\n(12점)', '재무\n지표', '॰ BIS', '정량', '2'], ['॰ 고정이하여신', '정량', '2']] };
  const h = pt.scoringHtml({ state: 'ok', data: data });
  const trs = h.match(/<tr>.*?<\/tr>/g);
  assert.strictEqual(trs.length, 3);
  assert.ok(/^<tr><th scope="col">구분<\/th>/.test(trs[0]) && trs[0].indexOf('평가<br>항목') > 0);
  assert.ok(trs[1].indexOf('rowspan="2"') > 0 && trs[1].indexOf('rowspan="6"') < 0 && trs[1].indexOf('경영<br>건전성<br>(12점)') > 0, 'row_count 3 이라 표 밖으로 나가는 rowspan 은 잘린다');
  // 실제 응답 모양: row_count 가 충분하면 6·4 그대로
  const big = pt.scoringHtml({ state: 'ok', data: Object.assign({}, data, { row_count: 7, col_count: 5 }) });
  const bt = big.match(/<tr>.*?<\/tr>/g);
  assert.strictEqual(bt.length, 7);
  assert.ok(bt[1].indexOf('rowspan="6"') > 0 && bt[1].indexOf('rowspan="4"') > 0);
  assert.strictEqual((bt[2].match(/<td/g) || []).length, 3);
  assert.strictEqual((trs[2].match(/<td/g) || []).length, 3);
  assert.ok(/^<tr><td[^>]*>॰ 최근 3년간 평균 고정이하여신 비율\(NPL\)&lt;i&gt;<\/td>/.test(trs[2]), '2행 첫 칸은 3열 값, 글자는 이스케이프');
  // cells 없는 응답은 기존대로 rows 를 그린다
  const old = pt.scoringHtml({ state: 'ok', data: Object.assign({}, data, { cells: undefined }) });
  assert.ok(old.indexOf('rowspan') < 0 && (old.match(/<tr>/g) || []).length === 3);
});

// ── 11-25 추가(3): 사용자 답 반영 — 선정 평가표(LLM 없이 옮겨 옴)·샘플 필요 표시 ──
test('3단계 선정 평가표: 공고 원본에서 옮겨 온 표를 그대로, 못 찾으면 무엇을 올릴지 안내', function () {
  const data = { found: true, files: 1, attach_id: 7, file: '금고 지정 공고<b>.hwpx', kind: 'TABLE', total: 100, page: 0,
    rows: [['항 목', '세부항목', '배 점'], ['계', '', '100'], ['1. 신용도', '가. 신용평가\n나. 재무구조', '(5) (15)']] };
  const h = pt.scoringHtml({ state: 'ok', data: data });
  assert.ok(h.indexOf('출처: 금고 지정 공고&lt;b&gt;.hwpx') > 0 && h.indexOf('총점 100점') > 0 && h.indexOf(pt.T.scCheck) > 0);
  assert.ok(/<thead><tr><th scope="col">항 목<\/th><th scope="col">세부항목<\/th><th scope="col">배 점<\/th><\/tr><\/thead>/.test(h));
  assert.ok(h.indexOf('<td>가. 신용평가<br>나. 재무구조</td>') > 0, '칸 안의 줄바꿈은 그대로');
  assert.strictEqual((h.match(/<tr>/g) || []).length, 3);
  assert.ok(h.indexOf(pt.T.scLines) < 0);
  const pdf = pt.scoringHtml({ state: 'ok', data: { found: true, file: '안내서.pdf', kind: 'LINES', page: 40, total: null, rows: [['평 가 항 목 배 점'], ['계 100']] } });
  assert.ok(pdf.indexOf('출처: 안내서.pdf · 40쪽') > 0 && pdf.indexOf(pt.T.scLines) > 0 && !/<thead>/.test(pdf) && pdf.indexOf('총점') < 0);
  assert.ok(pt.scoringHtml({ state: 'ok', data: { found: false, reason: 'NO_FILE', files: 0 } }).indexOf('2단계') > 0);
  assert.ok(pt.scoringHtml({ state: 'ok', data: { found: false, reason: 'NOT_FOUND', files: 2 } }).indexOf('올려 둔 파일 2개에서') > 0);
  assert.ok(pt.scoringHtml({ state: 'err' }).indexOf(pt.T.scErr) > 0);
  assert.ok(pt.scoringHtml(undefined).indexOf(pt.T.scLoading) > 0);
  assert.ok(pt.scoringHtml({ state: 'hidden' }).indexOf(pt.T.scHidden) > 0);
  // 본문: 과제 아래에 평가표 묶음. '샘플 필요!' 상자는 뺐다(F3, 사용자 11-26)
  const b = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS'), { docs: {}, scoring: { state: 'ok', data: data } }));
  assert.ok(b.indexOf('샘플 필요') < 0 && b.indexOf('ts-need') < 0 && b.indexOf('Word 양식 샘플') < 0, '3단계에 샘플 필요 상자가 없다');
  assert.ok(!pt.T.needTag && !pt.T.needSummary && SRC.indexOf('function need(') < 0, '문구 키와 그리는 함수도 지웠다');
  assert.ok(b.indexOf(pt.T.foldHint) > 0 && pt.T.foldHint === '아래 내용을 읽고, 비어 있으면 [작성 시작], 고칠 것이 있으면 [수정하기]로 고칩니다.');
  assert.ok(b.indexOf('>선정 평가표 (공고 원본에서 옮겨 옴)</h4>') > b.indexOf('class="pp-tasks'));
  // 배선
  assert.ok(/req\('GET', base\(id\) \+ '\/notice-scoring', undefined, ui\('prep_detail', 'scoring_read'\)\)/.test(PREP_SRC));
  assert.ok(/if \(kind === 'NOTICE'\) S\.sc = null;/.test(PREP_SRC), '공고 원본을 올리면 다시 읽는다');
  assert.ok(HTML.indexOf('.ts-need') < 0, '쓰지 않는 .ts-need CSS도 지웠다');
});

// ── 11-26: 2단계 기관 정보 판정이 직접 입력 약정을 보고, 담당자 변경 409 문구가 상황을 말한다 ──
test('instFacts: 직접 입력 약정만 있어도 금고 은행·약정 기간은 값 있음, 응답 대기 중이면 모름', function () {
  const dash = require('../js/dashboard.js');
  const bc = require('../js/bankcontract.js');
  const D = { kbEntry: function () { return null; }, lofinLines: function () { return []; }, termLine: dash.termLine };
  const rec = { institutionId: 'I1', name: '청주시' };   // 레코드에 bank·term 없음
  const line = { bank_name: 'KB국민은행', term_state: 'CURRENT', term_from: '2024-01-01', term_to: '2028-12-31' };
  const ok = prep.instFacts(rec, D, new Date('2026-11-26'), 'I1', { st: 'ok', data: { lines: [line] } }, bc);
  assert.strictEqual(ok.bank, true);
  assert.strictEqual(ok.term, true);
  const none = prep.instFacts(rec, D, new Date('2026-11-26'), 'I1', { st: 'ok', data: { lines: [] } }, bc);
  assert.strictEqual(none.bank, false);
  const wait = prep.instFacts(rec, D, new Date('2026-11-26'), 'I1', { st: 'loading', data: null }, bc);
  assert.strictEqual(wait.bank, undefined);
  assert.strictEqual(wait.term, undefined);
  const off = prep.instFacts(rec, D, new Date('2026-11-26'), 'I1', null, bc);
  assert.strictEqual(off.bank, false, '서버 모드가 아니면(약정 응답 자체가 없으면) 예전과 같다');
});

// ── 11-27 기관 상세 피드백 묶음 1 (design-reviewer 2026-11-27_0003_a559dee7 F4·F6·F7·F8) ──
function att(id, name, o) {
  return Object.assign({ attach_id: id, task_cd: 'T3', name: name, valid: true, confirmed: false, pii_state: 'CHECKED',
    uploaded_by: { emp_no: '1', name: '김영업' }, uploaded_at: '2026-11-25T09:00:00+09:00', size_bytes: 10 }, o || {});
}
const PROFIT_IDX = idxOf('PROFIT');

test('F4 확정본 지정 확인: 묻는 조건(4단계·담당자·끝난 건 아님·목록을 받음·유효 T3 1개 이상·확정본 없음)', function () {
  const v = view('IN_PROGRESS');
  const one = [att(1, 'a.xlsx')];
  assert.deepStrictEqual(pt.confirmAskFiles(PROFIT_IDX, v, one).map(function (r) { return r.attach_id; }), [1]);
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX - 1, v, one), null, '다른 단계');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, view('IN_PROGRESS', { viewer: { is_assignee: false } }), one), null, '담당자가 아니면 묻지 않는다');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, view('CANCELLED'), one), null, '끝난 건');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, null), null, '첨부 목록이 아직 오지 않았거나 실패');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, undefined), null);
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, []), null, '파일 0개');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, [att(1, 'x', { valid: false })]), null, '삭제한 파일만');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, [att(1, 'x', { task_cd: 'NOTICE' })]), null, '다른 종류 파일은 세지 않는다');
  assert.strictEqual(pt.confirmAskFiles(PROFIT_IDX, v, [att(1, 'a.xlsx', { confirmed: true }), att(2, 'b.xlsx')]), null, '확정본이 이미 있다');
  // 삭제한 파일·다른 종류가 섞여도 유효 T3만 센다, 최근 순(같은 시각이면 나중 번호가 위)
  const mixed = [att(1, 'old.xlsx', { uploaded_at: '2026-11-25T09:00:00+09:00' }), att(2, 'new.xlsx', { uploaded_at: '2026-11-25T10:00:00+09:00' }),
    att(3, 'same.xlsx', { uploaded_at: '2026-11-25T10:00:00+09:00' }), att(4, 'gone.xlsx', { valid: false, uploaded_at: '2026-11-26T10:00:00+09:00' }), att(5, 'n.pdf', { task_cd: 'NOTICE' })];
  assert.deepStrictEqual(pt.confirmAskFiles(PROFIT_IDX, v, mixed).map(function (r) { return r.attach_id; }), [3, 2, 1]);
});

test('F4 확정본 지정 창(파일 1개): 문구·단추 순서·채운 주버튼·오류 줄, 공통 팝업 대신 뜬다', function () {
  const v = view('IN_PROGRESS');
  const h = pt.nextAskHtml(PROFIT_IDX, { view: v, row: row(), marks: MARKS, attach: [att(7, '수익성<b>.xlsx')] });
  assert.ok(/class="modal-box tm-modal-box ts-ask" role="dialog" aria-modal="true" aria-labelledby="ts-ask-t" aria-describedby="ts-ask-d"/.test(h));
  assert.ok(h.indexOf('<h3 id="ts-ask-t">확정본 지정</h3>') > 0);
  assert.ok(h.indexOf('&#39;수익성&lt;b&gt;.xlsx&#39; 파일을 수익성 분석표 확정본으로 지정하시겠습니까?') > 0, '파일 이름은 이스케이프');
  assert.ok(h.indexOf('확정본을 지정해야 &#39;수익성분석&#39; 단계가 완료로 표시됩니다. 지정하지 않고 넘어가도 나중에 이 단계의 파일 목록에서 지정할 수 있습니다.') > 0);
  assert.ok(/<p id="ts-ask-err" class="ap-err" role="alert"><\/p>/.test(h));
  const no = h.indexOf('id="pp-nx-no">닫기<'), skip = h.indexOf('id="pp-nx-skip">지정하지 않고 넘어가기<'), set = h.indexOf('id="pp-nx-set" class="ts-go" data-attach="7">지정하고 넘어가기<');
  assert.ok(no > 0 && skip > no && set > skip, '[닫기] [지정하지 않고 넘어가기] [지정하고 넘어가기] 순서, 마지막만 채움');
  assert.ok(h.indexOf('id="pp-nx-ok"') < 0 && h.indexOf('type="radio"') < 0, '공통 팝업 단추도 라디오도 없다');
  assert.ok(h.indexOf('개인정보 경고') < 0);
  const warn = pt.nextAskHtml(PROFIT_IDX, { view: v, attach: [att(7, 'a.xlsx', { pii_note: '이메일 2' })] });
  assert.ok(warn.indexOf('<p class="tm-note"><span class="wf-badge gap">개인정보 경고: 이메일 2</span></p>') > 0);
  // 조건이 안 맞으면 공통 팝업(담당자 아님·확정본 있음·파일 없음·목록 없음)
  [{ view: view('IN_PROGRESS', { viewer: { is_assignee: false } }), attach: [att(7, 'a')] }, { view: v, attach: [att(7, 'a', { confirmed: true })] },
   { view: v, attach: [] }, { view: v, attach: null }].forEach(function (o, k) {
    const g = pt.nextAskHtml(PROFIT_IDX, o);
    assert.ok(g.indexOf('id="pp-nx-set"') < 0 && /id="pp-nx-ok" class="ts-go">넘어가기</.test(g), '공통 ' + k);
  });
});

test('F4 확정본 지정 창(파일 여러 개): 라디오 목록, 맨 위(가장 최근)가 기본 선택, 올린 시각·사람·경고', function () {
  const v = view('IN_PROGRESS');
  const h = pt.nextAskHtml(PROFIT_IDX, { view: v, attach: [att(1, 'old.xlsx'), att(2, 'new.xlsx', { uploaded_at: '2026-11-26T10:30:00+09:00', uploaded_by: { emp_no: '2', name: '배지아' }, pii_note: '전화번호 1' })] });
  assert.ok(h.indexOf('올린 수익성 분석표 2개 중 확정본으로 지정할 파일을 고르세요.') > 0);
  assert.ok(h.indexOf('<legend>확정본으로 지정할 파일</legend>') > 0);
  assert.strictEqual((h.match(/type="radio" name="ts-ask-file"/g) || []).length, 2);
  assert.strictEqual((h.match(/ checked>/g) || []).length, 1);
  assert.ok(/value="2" checked> new\.xlsx<\/label>/.test(h) && /value="1"> old\.xlsx<\/label>/.test(h), '최근 파일이 먼저, 기본 선택');
  assert.ok(h.indexOf('배지아') > 0 && h.indexOf('<span class="wf-badge gap">개인정보 경고: 전화번호 1</span>') > 0);
  assert.ok(h.indexOf('<div class="modal-scroll tm-m-body">') > 0 && /id="pp-nx-set" class="ts-go" data-attach="2">/.test(h), '단추도 최근 파일을 가리킨다');
  assert.ok(h.indexOf('id="ts-ask-err"') > 0 && h.indexOf('id="pp-nx-skip"') > 0);
});

test('F4 배선: 같은 확정본 지정 요청·창 전용 버튼 이름 next_t3_set, 진행 중 잠금·성공 시 알림 뒤 넘어가기·실패 시 창 유지', function () {
  assert.ok(/case 'pp-nx-set': onNextSet\(\); break;/.test(PREP_SRC) && /case 'pp-nx-skip': closeNextAsk\(true\); break;/.test(PREP_SRC));
  const a = PREP_SRC.indexOf('function onNextSet() {'), b = PREP_SRC.indexOf('function nextAskToSched() {');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(f.indexOf("req('PUT', base(id) + '/tasks/T3/confirmed-file', { attach_id: Number(attachId) }, ui('prep_detail', 'next_t3_set'))") > 0, '기존 확정본 지정 경로 + 창 전용 버튼 이름(파일 목록의 t3_set과 감사에서 구분)');
  assert.ok(PREP_SRC.indexOf("ui('prep_detail', 't3_set')") > 0, '파일 목록의 지정 단추는 t3_set 그대로');
  assert.ok(f.indexOf("setAttribute('aria-disabled', 'true')") > 0 && f.indexOf('pt.T.askSetBusy') > 0 && f.indexOf('if (!S.nextAsk || S.nextBusy || !S.selected) return;') > 0, '진행 중에는 세 단추 모두 막고 글자를 바꾼다');
  assert.ok(f.indexOf("다른 요청을 처리하는 중입니다. 잠시 뒤 다시 눌러 주세요.") > f.indexOf('if (S.busy) {') && f.indexOf("el('ts-ask-err')") > 0, '다른 요청 중이면 창 안에 이유를 쓴다(조용히 무시하지 않는다)');
  assert.ok(f.indexOf('const mine = S.nextSeq = ++reqSeq;') > 0 && (f.match(/if \(S\.nextSeq !== mine\) return;/g) || []).length === 2, '요청 토큰: 성공·실패 응답 모두 늦게 오면 무시');
  assert.ok(/S\.nextSeq = 0;/.test(PREP_SRC), '새 창·화면 재진입 때 토큰을 비운다');
  assert.ok(f.indexOf('setFlash(T.okSetConfirmed(name));') > 0 && f.indexOf('stepBy(1);') > f.indexOf('setFlash(T.okSetConfirmed(name));'), '성공: 알림 → 다음 단계');
  assert.ok(f.indexOf('S.refocus = st.sel; S.live = st.live;') > f.indexOf('stepBy(1);') && f.indexOf('S.refocus = st.sel; S.live = st.live;') < f.indexOf('loadDetail(id);'), '성공: loadDetail 앞에 포커스·알림을 다시 건다(ⓖ)');
  const sb = PREP_SRC.slice(PREP_SRC.indexOf('function stepBy(d) {'), PREP_SRC.indexOf('// 제안 준비 현황 표의 그 줄'));
  assert.ok(sb.indexOf('return { sel: sel, live: live };') > 0 && sb.indexOf("'[data-act=\"' + keep + '\"]'") > 0, 'stepBy가 고른 포커스 대상과 알림 문장을 돌려준다');
  assert.ok(f.indexOf("prep.errorInfo(e && e.status, e && e.detail, curTasks(), 'attach')") > 0 && f.indexOf('pt.T.askSetFail(info.text)') > 0 && f.indexOf("info.after === 'reload'") > 0, '실패: 원인 문장을 창 안에, reload 계열은 닫고 다시 불러온다');
  assert.ok(/if \(!S\.nextAsk \|\| S\.nextBusy\) return;/.test(PREP_SRC), '지정 중에는 Esc·바깥 클릭을 무시한다');
  assert.ok(/S\.nextAsk = false; S\.nextBusy = false;/.test(PREP_SRC), '화면이 다시 열리면 잠금을 푼다');
  assert.strictEqual(prep.T.okSetConfirmed('a.xlsx'), '\'a.xlsx\' 파일을 수익성 분석표 확정본으로 지정했습니다.');
  assert.strictEqual(pt.T.askSetBusy, '지정하는 중…');
  assert.strictEqual(pt.T.askSetFail('원인.'), '확정본으로 지정하지 못했습니다. 원인.');
});

test('F6 이사회 일정 확인: 7단계·자료 있음·담당자(canMeeting)·일정 비어 있음·결과 전일 때만', function () {
  const BOARD = { state: 'ok', canMeeting: true, meeting: '', resultCd: '' };
  const at = idxOf('BOARD_DOC');
  assert.strictEqual(pt.schedAsk(at, BOARD), true);
  assert.strictEqual(pt.schedAsk(at, Object.assign({}, BOARD, { resultCd: 'SCHEDULED' })), true, '의결 예정은 결과가 아니다');
  assert.strictEqual(pt.schedAsk(at, Object.assign({}, BOARD, { meeting: '2026-12-03' })), false, '일정이 있다');
  assert.strictEqual(pt.schedAsk(at, Object.assign({}, BOARD, { canMeeting: false })), false, '담당자가 아니다');
  assert.strictEqual(pt.schedAsk(at, Object.assign({}, BOARD, { resultCd: 'PASSED' })), false);
  assert.strictEqual(pt.schedAsk(at, Object.assign({}, BOARD, { resultCd: 'REJECTED' })), false);
  ['none', 'loading', 'err'].forEach(function (st) { assert.strictEqual(pt.schedAsk(at, { state: st, canMeeting: true }), false, st); });
  assert.strictEqual(pt.schedAsk(at, null), false);
  assert.strictEqual(pt.schedAsk(at - 1, BOARD), false, '다른 단계');
  const h = pt.nextAskHtml(at, { view: view('IN_PROGRESS'), board: BOARD });
  assert.ok(h.indexOf('<h3 id="ts-ask-t">이사회 일정</h3>') > 0 && h.indexOf('>이사회 일정 전인가요?</p>') > 0);
  assert.ok(h.indexOf('날짜가 정해졌으면 [일정 등록하기]를 눌러 먼저 적어 두세요. 일정을 적지 않아도 다음 단계로 넘어갈 수 있습니다.') > 0);
  assert.ok(/<button type="button" id="pp-nx-ok">일정 전이라 넘어가기<\/button><button type="button" id="pp-nx-sched" class="ts-go">일정 등록하기<\/button>/.test(h));
  assert.ok(h.indexOf('id="pp-nx-no"') < 0, '두 단추만');
  const plain = pt.nextAskHtml(at, { view: view('IN_PROGRESS'), board: Object.assign({}, BOARD, { meeting: '2026-12-03' }) });
  assert.ok(plain.indexOf('id="pp-nx-sched"') < 0 && /id="pp-nx-ok" class="ts-go">넘어가기</.test(plain), '일정이 있으면 공통 팝업');
  // 배선: [일정 등록하기] = 창을 닫고 날짜 칸으로(넘어가지 않는다), [일정 전이라 넘어가기] = 넘어가기
  assert.ok(/case 'pp-nx-sched': nextAskToSched\(\); break;/.test(PREP_SRC));
  const f = PREP_SRC.slice(PREP_SRC.indexOf('function nextAskToSched() {'), PREP_SRC.indexOf('function closeNextAsk(go) {'));
  assert.ok(f.indexOf("el('ts-sched-date')") > 0 && f.indexOf('d.focus()') > 0 && f.indexOf('scrollIntoView') > 0 && f.indexOf('stepBy') < 0);
  assert.ok(f.indexOf("querySelector('[data-act=\"ts-next\"]')") > f.indexOf('else {'), '날짜 칸이 없으면 [다음]으로 포커스');
  assert.ok(/board: cs\.id === 'BOARD_DOC' \? stepBoard\(\) : null/.test(PREP_SRC));
});

test('F7 완료 조건 줄: 23단계 모두 제목 바로 아래, 완료 전·완료·대상 아님 세 모양, 끝난 건은 없음', function () {
  const v = view('IN_PROGRESS');
  pt.STEPS.forEach(function (s, i) {
    const h = pt.bodyHtml(model(v, i, { board: { state: 'none' } }));
    assert.ok(h.indexOf('</h3><p class="ts-okline is-note" role="note">') > 0, i + 1 + '단계 ' + s.label + ' — 제목 바로 아래');
    assert.strictEqual(pt.condHtml(s, view('CANCELLED'), row(), MARKS), '', s.label + ' 끝난 건은 줄 없음');
    assert.ok(pt.condText(s, v) !== '', s.label);
  });
  // 완료 전
  const fin = idxOf('FIN_COMMITTEE');
  const todo = pt.bodyHtml(model(v, fin));
  assert.ok(todo.indexOf('<p class="ts-okline is-note" role="note"><span><b>완료 조건</b> 담당 영업이 아래에서 &#39;완료&#39;를 고르면 완료로 표시됩니다(해당 없으면 &#39;대상 아님&#39;). 고르는 즉시 저장되고 제안 준비 현황 표에도 보입니다.</span></p>') > 0);
  assert.ok(todo.indexOf('이 단계를 마쳤으면 상태를 고릅니다') < 0, '옛 manualHint 줄은 없다');
  // 완료: 같은 그림 + '완료로 표시됨'
  const done = pt.condHtml(pt.STEPS[fin], v, row({ cells: { FIN_COMMITTEE: { mark_cd: 'DONE' } } }), MARKS);
  assert.ok(/^<p class="ts-okline is-note" role="note"><svg class="pb-g done"[^>]*aria-hidden="true">.*<\/svg><span><b>완료로 표시됨<\/b> <span class="ts-note">담당 영업이 아래에서/.test(done));
  // 대상 아님으로 닫힘
  const na = pt.condHtml(pt.STEPS[fin], v, row({ cells: { FIN_COMMITTEE: { mark_cd: 'NA' } } }), MARKS);
  assert.ok(/<svg class="pb-g na"/.test(na) && na.indexOf('<b>대상 아님으로 표시됨</b>') > 0 && na.indexOf('담당 영업이 아래에서') > 0);
  // 진행(IN_PROGRESS 칸)은 아직 완료 전 모양
  assert.ok(pt.condHtml(pt.STEPS[fin], v, row(), MARKS).indexOf('<b>완료 조건</b>') > 0);
  // 문안: 단계별
  const T = pt.T.cond;
  const txt = function (id, vw) { return pt.condText(pt.STEPS[idxOf(id)], vw || v); };
  assert.strictEqual(txt('START'), '개설 신청이 승인되어 담당자가 정해지면 완료로 표시됩니다.', '개설 신청 방식');
  assert.strictEqual(txt('START', view('IN_PROGRESS', { viewer: { can_start_prep: true, can_request_open: false } })), '담당자를 지정하면 완료로 표시됩니다.');
  assert.strictEqual(txt('START', view('OPEN_PENDING', { viewer: { can_start_prep: false, can_request_open: false } })), '개설 신청이 승인되어 담당자가 정해지면 완료로 표시됩니다.', '개설 대기 건은 새 흐름 판정이어도 승인 문안');
  assert.strictEqual(txt('START', view('CONFIRMED', { viewer: { can_start_prep: true, can_request_open: false } })), '담당자를 지정하면 완료로 표시됩니다.');
  // 자동 판정(수익성 분석표 T3 완료)·묶음(이사회 3칸 대상 아님)도 '표시됨' 모양
  const profitDone = pt.condHtml(pt.STEPS[idxOf('PROFIT')], view('IN_PROGRESS', { tasks: TASKS.map(function (t) { return t.task_cd === 'T3' ? Object.assign({}, t, { state: 'DONE' }) : t; }) }), row(), MARKS);
  assert.ok(profitDone.indexOf('<b>완료로 표시됨</b>') > 0 && /<svg class="pb-g done"/.test(profitDone), '자동 판정 단계: 완료로 표시됨');
  const boardNa = pt.condHtml(pt.STEPS[idxOf('BOARD')], v, row({ cells: { BOARD_SECRETARIAT: { mark_cd: 'NA' }, BOARD_AUDIT: { mark_cd: 'NA' }, BOARD_COMPLIANCE: { mark_cd: 'NA' } } }), MARKS);
  assert.ok(boardNa.indexOf('<b>대상 아님으로 표시됨</b>') > 0 && /<svg class="pb-g na"/.test(boardNa), '묶음 단계: 3칸 모두 대상 아님 → 대상 아님으로 표시됨');
  assert.strictEqual(pt.condHtml(pt.STEPS[idxOf('BOARD')], v, row({ cells: {} }), MARKS).indexOf('<b>완료 조건</b>') > 0, true, '묶음 단계: 칸이 비면 완료 전');
  assert.strictEqual(txt('NOTICE_CHECK'), '공고 자료에 빠진 것이 없을 때 담당 영업이 [다음]을 누르면 \'확인 완료\'로 표시됩니다. 누가·언제 확인했는지 남습니다.');
  assert.strictEqual(txt('INST_ANALYSIS'), '아래 두 준비 과제에서 모두 [완료로 표시]를 누르면 이 단계도 완료로 표시됩니다.');
  assert.strictEqual(txt('PROFIT'), '수익성 분석표를 올린 뒤 [확정본으로 지정]을 누르면 완료로 표시됩니다. 올리기만 해서는 완료되지 않습니다.');
  assert.strictEqual(txt('BOARD_DOC'), '이사회 자료가 확정되면 완료로 표시됩니다. 일정 등록·추가 자료·발표 대본은 완료 표시와 상관없습니다.');
  assert.strictEqual(txt('BOARD'), '담당 영업이 아래 \'부서별 확인\' 3칸(사무국, 감사·감시, 준법)을 모두 \'완료\'나 \'대상 아님\'으로 고르면 완료로 표시됩니다. 결과 등록과 결과 문서는 기록으로 남길 뿐 완료 표시와 상관없습니다.');
  assert.strictEqual(txt('PROPOSAL'), '디자이너가 제안서 최종본을 완료하면 자동으로 완료로 표시됩니다. 이 화면에서는 체크하지 않습니다.');
  assert.strictEqual(txt('SUBMIT_DOCS'), T.manual + ' 아래 준비 과제는 완료 표시에 영향이 없습니다.');
  assert.strictEqual(txt('SUBMIT_APPR'), '담당 영업이 아래 2칸을 모두 \'완료\'나 \'대상 아님\'으로 고르면 완료로 표시됩니다. 고르는 즉시 저장되고 제안 준비 현황 표에도 보입니다.');
  assert.ok(txt('CONTRACT_APPR').indexOf('아래 4칸을') > 0, '칸 수는 subs 개수');
  assert.strictEqual(txt('RESULT'), '담당 영업이 아래에서 \'선정\'이나 \'탈락\'을 고르면 완료로 표시됩니다(해당 없으면 \'대상 아님\'). 고르는 즉시 저장되고 제안 준비 현황 표에도 보입니다.');
  ['FIN_COMMITTEE', 'BIZ_COMMITTEE', 'PRESENT_DOC', 'PROPOSAL_SUBMIT', 'PT', 'PRIORITY_NEGO', 'AGREE_LEGAL', 'ATM', 'KB_CARD', 'IT_BUILD', 'VIP', 'RATE_APPROVAL', 'CEREMONY'].forEach(function (id) {
    assert.strictEqual(txt(id), T.manual, id);
  });
  // 옛 안내 키·호출은 없다, 함께 다듬은 문구
  assert.ok(pt.T.manualHint === undefined && pt.T.groupHint === undefined && SRC.indexOf('T.manualHint') < 0 && SRC.indexOf('T.groupHint') < 0);
  assert.strictEqual(pt.T.boardHint, '이사회 자료는 이사회 자료 작성 화면에서 만들고 확정합니다.');
  assert.ok(pt.bodyHtml(model(v, idxOf('BOARD_DOC'), { board: { state: 'none' } })).indexOf(pt.T.boardHint) > 0);
  assert.strictEqual(pt.T.noticeNote(2), '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것은 없습니다. 위에 붉게 표시한 2건은 확인만 하면 됩니다.');
  assert.strictEqual(pt.T.noticeNoteView(2), '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것은 없습니다. 위에 붉게 표시한 2건을 확인하세요.');
  // 7단계 구획 제목은 '이사회 자료 준비'(사용자 11-27), 메뉴 화면을 가리키는 안내 문구의 '이사회 자료 작성'은 메뉴 이름 그대로
  assert.strictEqual(pt.T.secDoc, '이사회 자료 준비');
  assert.ok(pt.bodyHtml(model(v, idxOf('BOARD_DOC'), { board: { state: 'none' } })).indexOf('>이사회 자료 준비</h4>') > 0);
});

test('F8 결과 문서 밑 개최일 줄: 결과 뒤 개최일·결과 전 일정(예정)·날짜 없음(등록 전 + 누가 적나)·자료 상태 아니면 줄 없음', function () {
  const base = { state: 'ok', id: 12, confirmed: true, html: '', resultCd: 'PASSED', meeting: '2026-12-03', canResult: true };
  assert.strictEqual(pt.resDateHtml(base), '<dl class="ts-facts"><div><dt>개최일</dt><dd><span class="m">2026-12-03</span></dd></div><div><dt>안건 번호</dt><dd>등록 전</dd></div></dl>');
  assert.strictEqual(pt.resDateHtml(Object.assign({}, base, { agendaNo: '제2026-12호<b>' })),
    '<dl class="ts-facts"><div><dt>개최일</dt><dd><span class="m">2026-12-03</span></dd></div><div><dt>안건 번호</dt><dd><span class="m">제2026-12호&lt;b&gt;</span></dd></div></dl>');
  assert.strictEqual(pt.resDateHtml(Object.assign({}, base, { resultCd: 'SCHEDULED', agendaNo: '제1호' })).indexOf('안건 번호'), -1, '결과 전에는 안건 번호 칸을 그리지 않는다');
  assert.strictEqual(pt.resDateHtml(Object.assign({}, base, { resultCd: 'REJECTED' })).indexOf('<dt>개최일</dt>') > 0, true);
  const sched = pt.resDateHtml(Object.assign({}, base, { resultCd: 'SCHEDULED' }));
  assert.ok(sched.indexOf('<dt>이사회 날짜(예정)</dt><dd><span class="m">2026-12-03</span></dd>') > 0 && sched.indexOf('<dt>개최일</dt>') < 0);
  assert.ok(pt.resDateHtml(Object.assign({}, base, { resultCd: '' })).indexOf('이사회 날짜(예정)') > 0, '결과 전에 일정만 있는 경우');
  const none = pt.resDateHtml(Object.assign({}, base, { resultCd: '', meeting: '' }));
  assert.ok(none.indexOf('<dt>개최일</dt><dd>등록 전</dd>') > 0 && none.indexOf('<p class="ts-note">개최일은 위 &#39;이사회 결과 등록&#39;에서 의결 결과와 함께 적습니다.</p>') > 0);
  const view2 = pt.resDateHtml(Object.assign({}, base, { resultCd: '', meeting: '', canResult: false }));
  assert.ok(view2.indexOf('등록 전') > 0 && view2.indexOf(pt.T.schedView) > 0 && view2.indexOf('개최일은 위') < 0);
  assert.ok(pt.resDateHtml(Object.assign({}, base, { meeting: '<b>' })).indexOf('&lt;b&gt;') > 0 && pt.resDateHtml(Object.assign({}, base, { meeting: '<b>' })).indexOf('<b>') < 0, '날짜 값도 이스케이프');
  ['loading', 'err', 'none'].forEach(function (st) { assert.strictEqual(pt.resDateHtml({ state: st, meeting: '2026-12-03' }), '', st); });
  assert.strictEqual(pt.resDateHtml(undefined), '');
  // 본문: 결과 문서 블록 뒤, 부서별 확인 앞
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD'), { board: base, resFiles: '<div class="pp-files" data-kind="BOARD_RES"></div>' }));
  const files = h.indexOf('data-kind="BOARD_RES"'), date = h.indexOf('<dt>개최일</dt><dd><span class="m">2026-12-03</span></dd>'), marks = h.indexOf('>부서별 확인</h4>');
  assert.ok(files > 0 && date > files && marks > date, '결과 문서 → 개최일 → 부서별 확인');
  assert.ok(h.indexOf('>이사회 결과 문서 보관</h4>') < date);
  assert.ok(h.indexOf('칸마다 상태를 고릅니다') < 0, '8단계 부서별 확인의 옛 안내 줄은 완료 조건 줄로 옮겼다');
  // 안건 번호: 결과(가결·부결) 뒤에만 개최일 옆에 — 값 또는 '등록 전'. 결과 전·날짜 없음에는 칸이 없다.
  assert.ok(h.indexOf('<div><dt>안건 번호</dt><dd>등록 전</dd></div>') > date, '결과 뒤 번호 없음 = 등록 전');
  const hv = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD'), { board: Object.assign({}, base, { agendaNo: '제2026-12호' }), resFiles: '' }));
  assert.ok(hv.indexOf('<div><dt>안건 번호</dt><dd><span class="m">제2026-12호</span></dd></div>') > 0);
  const hs = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD'), { board: Object.assign({}, base, { resultCd: 'SCHEDULED', agendaNo: '제1호', canResult: false }), resFiles: '' }));
  assert.ok(hs.indexOf('<dt>안건 번호</dt>') < 0, '결과 전에는 안건 번호 줄이 없다');
  const hn = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD'), { board: Object.assign({}, base, { resultCd: '', meeting: '', canResult: false }), resFiles: '' }));
  assert.ok(hn.indexOf('안건 번호') < 0, '결과·날짜 없음에는 안건 번호가 없다');
});

test('2단계 본문: 약정 값과 기관장 카드를 paneParts에 넘긴다', function () {
  assert.ok(/instFacts\(rec, D, today, id, bv\)/.test(PREP_SRC));
  assert.ok(/bank: bv && D\.lockBank \? D\.lockBank\(bv\) : bv/.test(PREP_SRC));
  assert.ok(/headHtml: hcm && hcm\.paneSection \? hcm\.paneSection\(rec, hcEnv\(\)\) : undefined/.test(PREP_SRC));
});

test('담당자 변경(where change) 409: 코드별 문구가 단계·결재 상황을 말한다', function () {
  const co = function (c) { return { code: c, message: '서버 문구' }; };
  const E = function (c) { return prep.errorInfo(409, co(c), [], 'change'); };
  assert.ok(E('STATE_CHANGED').text.indexOf('담당자 지정이 끝나') >= 0 && E('STATE_CHANGED').after === 'closeReload');
  assert.ok(E('NOT_ASSIGNED').text.indexOf('담당자 지정이 끝난 뒤') >= 0);
  assert.ok(E('PLAN_PENDING').text.indexOf('담당자를 바꿀 수 없습니다') >= 0 && E('PLAN_PENDING').text.indexOf('중단') < 0);
  assert.ok(E('PREP_CANCELLED').text.indexOf('중단된 건') >= 0);
  assert.ok(E('CHANGE_PENDING').text.indexOf('변경 신청') >= 0);
  assert.ok(E('GROUP_VER_CHANGED').text.indexOf('반려') < 0);
  // 다른 곳(중단·확정 취소)의 같은 코드 문구는 그대로
  assert.strictEqual(prep.errorInfo(409, co('PLAN_PENDING'), [], 'abort').text, prep.ERR_BY_CODE.PLAN_PENDING.text);
  assert.strictEqual(prep.errorInfo(409, co('STATE_CHANGED'), [], 'abort').text, prep.ERR_BY_CODE.STATE_CHANGED.text);
  // 400 NO_ASSIGNEE_LEFT는 서버 문구·사유 칸으로(건드리지 않음)
  assert.strictEqual(prep.errorInfo(400, { code: 'NO_ASSIGNEE_LEFT', message: '최소 1명' }, [], 'change').after, 'reason');
});
