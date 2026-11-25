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
      NOTICE_CHECK: { notice_status_name: '공고 확인' },
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

// ── 구간·단계 정본 ──
test('PHASES·STEPS: 구간 3개, 24단계(담당자 지정 + 현업 23단계), id 유일, 구간은 이어진 덩어리', function () {
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
  assert.deepStrictEqual(pt.phaseIdxs('bid').map(function (i) { return pt.STEPS[i].label; }), ['담당자 지정', '입찰공고확인', '기관 정보 분석', '수익성분석']);
  assert.deepStrictEqual(pt.phaseIdxs('agree').map(function (i) { return pt.STEPS[i].label; }), ['우선협상', '협약서(법률)', '협약체결품의', 'ATM', 'KB카드', '전산구축', 'VIP 지정', '금리승인', '협약식']);
  assert.strictEqual(pt.STEPS[pt.STEPS.length - 1].label, '협약식', '엑셀 칸 순서 그대로 협약식이 마지막');
  assert.strictEqual(pt.phaseIdxs('prep').length, 11);
});

test('STEPS ↔ 서버 PrepBoardColumns: 칸 코드 27개가 빠짐없이 한 번씩, 이름도 같다', function () {
  const java = fs.readFileSync(JAVA, 'utf8');
  const cols = [];
  const re = /new Col\("([A-Z0-9_]+)",\s*"([^"]+)",\s*(null|"[A-Z_]+"),/g;
  let m;
  while ((m = re.exec(java))) cols.push({ cd: m[1], label: m[2], group: m[3] === 'null' ? '' : m[3].replace(/"/g, '') });
  assert.strictEqual(cols.length, 27);
  const mine = {};
  pt.STEPS.forEach(function (s) {
    if (s.subs) s.subs.forEach(function (x) { mine[x.cd] = { label: x.label, group: s.cd }; });
    else if (s.cd) mine[s.cd] = { label: s.label, group: '' };
  });
  assert.strictEqual(Object.keys(mine).length, 27);
  cols.forEach(function (c) {
    assert.ok(mine[c.cd], c.cd + ' 단계에 있음');
    assert.strictEqual(mine[c.cd].label, c.label, c.cd + ' 이름');
    assert.strictEqual(mine[c.cd].group, c.group, c.cd + ' 묶음');
  });
});

test('STEPS.tasks: 준비 과제 T1~T6가 단계에 한 번씩 걸린다', function () {
  const all = [];
  pt.STEPS.forEach(function (s) { s.tasks.forEach(function (t) { all.push(t + '@' + s.id); }); });
  assert.deepStrictEqual(all.sort(), ['T1@INST_ANALYSIS', 'T2@INST_ANALYSIS', 'T3@PROFIT', 'T4@SUBMIT_DOCS', 'T5@BOARD_DOC', 'T6@BOARD_SCRIPT']);
});

test('colLabel: 칸 이름, 묶음 칸은 \'묶음 › 칸\'', function () {
  assert.strictEqual(pt.colLabel('FIN_COMMITTEE'), '가결위(재무)');
  assert.strictEqual(pt.colLabel('CONTRACT_AUDIT'), '협약체결품의 › 감사·감시');
  assert.strictEqual(pt.colLabel('BOARD_AUDIT'), '이사회 › 감사·감시');
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
  assert.strictEqual(st('BOARD_SCRIPT').text, '', '준비중 과제뿐이면 상태 없음');
  assert.deepStrictEqual(st('FIN_COMMITTEE'), { glyph: 'prog', text: '진행', cnt: '', closed: false });
  assert.deepStrictEqual(st('BIZ_COMMITTEE'), { glyph: '', text: '시작 전', cnt: '', closed: false });
  assert.deepStrictEqual(st('BOARD'), { glyph: 'prog', text: '완료 1/3', cnt: '완료 1/3', closed: false });
  assert.strictEqual(st('NOTICE_CHECK').text, '공고 확인');
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
    [['bid', 1, 1, 3, false], ['prep', 2, 0, 11, true], ['agree', 3, 0, 9, false]]);   // bid: 4단계 중 입찰공고확인 제외 3, 끝난 것 = 담당자 지정
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('agree', v, row(), MARKS)].id, 'PRIORITY_NEGO');
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('bid', v, row(), MARKS)].id, 'INST_ANALYSIS');
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('prep', v, row(), MARKS)].id, 'FIN_COMMITTEE');
  const r = row({ cells: { PRIORITY_NEGO: { mark_cd: 'DONE' } } });
  assert.strictEqual(pt.STEPS[pt.phaseEntryIdx('agree', v, r, MARKS)].id, 'AGREE_LEGAL');
  const h = pt.phasesHtml(pm);
  assert.ok(/role="group" aria-label="진행 구간"/.test(h));
  assert.strictEqual((h.match(/data-act="ts-phase"/g) || []).length, 3);
  assert.ok(/data-ph="prep" aria-pressed="true"/.test(h) && /data-ph="agree" aria-pressed="false"/.test(h));
});

test('stepsModel·stepsHtml: 지금 구간의 단계만, 번호는 전체 순번, 탭 정지는 지금 단계 하나', function () {
  const v = view('IN_PROGRESS');
  const m = pt.stepsModel(v, row(), MARKS, idxOf('AGREE_LEGAL'));
  assert.deepStrictEqual(m.map(function (x) { return x.label; }), ['우선협상', '협약서(법률)', '협약체결품의', 'ATM', 'KB카드', '전산구축', 'VIP 지정', '금리승인', '협약식']);
  assert.deepStrictEqual(m.map(function (x) { return x.no; }), [16, 17, 18, 19, 20, 21, 22, 23, 24]);
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
  assert.strictEqual(pt.liveText(view('IN_PROGRESS'), row(), MARKS, idxOf('FIN_COMMITTEE')), '청주시, 제안 준비 5단계 가결위(재무), 진행');
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
  assert.ok(/제안 준비 · 5 \/ 24/.test(h));
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
  assert.ok(d.indexOf(pt.T.startDone) >= 0 && /<dt>담당<\/dt><dd>김영업<\/dd>/.test(d));
  assert.ok(!/open-request-open/.test(d));
});

test('bodyHtml 과제 단계: 그 단계에 걸린 과제만, 체크 단추는 prep.js 동작 이름 그대로', function () {
  const h = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('INST_ANALYSIS')));
  assert.strictEqual((h.match(/<li class="pp-task/g) || []).length, 2);
  assert.ok(/data-act="uncheck" data-task="T1"/.test(h) && /data-act="check" data-task="T2"/.test(h));
  assert.ok(!/data-task="T3"/.test(h));
  const p = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('PROFIT'), { attach: [] }));
  assert.ok(/data-task="T3"/.test(p) && /data-act="upload"/.test(p), '수익성 분석표 파일 칸');
  const b = pt.bodyHtml(model(view('IN_PROGRESS'), idxOf('BOARD_DOC')));
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
  const a = PREP_SRC.indexOf('function onMark(cd, mark) {');
  const b = PREP_SRC.indexOf('// o.popup: 건을 연 경우에만 true(');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(/S\.markBusy\[cd\]\) return;/.test(f));
  assert.ok(/if \(cur\.mark === mark\) return;/.test(f));
  assert.ok(/req\('PUT', base\(id\) \+ '\/board-checks\/' \+ encodeURIComponent\(cd\), \{ mark_cd: mark, base_rev: cur\.revNo \}, ui\('prep_dashboard', 'dash_check'\)\)/.test(f));
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
