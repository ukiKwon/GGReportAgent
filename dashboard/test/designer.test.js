const test = require('node:test');
const assert = require('node:assert');
const dg = require('../js/designer.js');

// 기준일을 고정한다 — '오늘'에 기대면 내일 깨지는 테스트가 된다.
// **Z를 붙이지 않는다**: logic.daysUntil이 'YYYY-MM-DD'를 로컬 자정으로 파싱하므로
// (logic.js:84), 기준일도 로컬이어야 실제 호출부(new Date())와 같은 계산이 된다.
// UTC로 주면 KST에서 9시간이 어긋나 D-DAY가 D+1로 나온다.
const TODAY = new Date('2026-08-05T00:00:00');

function task(over) {
  return Object.assign({
    task_id: 't1', team: '디자이너', status: '대기', progress_pct: 0,
    assignee: null, institution_id: 'nowon', institution_name: '노원구',
    bid_date: '2026-09-30', schedule_confidence: '확정', file_count: 0,
  }, over || {});
}

// ── 우선순위 (기능 ⑦) ──────────────────────────────────────────────────
// 새 컬럼을 두지 않고 **입찰일까지 남은 일수**로 매긴다(사용자 확정). 근거가 이미
// 데이터에 있고, 사람이 따로 관리하지 않아도 항상 맞다.

test('priority: 입찰일까지 남은 일수로 등급을 매긴다', function () {
  assert.strictEqual(dg.priority(task({ bid_date: '2026-08-08' }), TODAY).level, 'urgent');
  assert.strictEqual(dg.priority(task({ bid_date: '2026-08-25' }), TODAY).level, 'soon');
  assert.strictEqual(dg.priority(task({ bid_date: '2026-10-01' }), TODAY).level, 'normal');
  assert.strictEqual(dg.priority(task({ bid_date: '2027-06-01' }), TODAY).level, 'later');
});

test('priority: 경계값 — 7일과 30일은 그 등급에 포함된다', function () {
  assert.strictEqual(dg.priority(task({ bid_date: '2026-08-12' }), TODAY).level, 'urgent'); // D-7
  assert.strictEqual(dg.priority(task({ bid_date: '2026-08-13' }), TODAY).level, 'soon');   // D-8
  assert.strictEqual(dg.priority(task({ bid_date: '2026-09-04' }), TODAY).level, 'soon');   // D-30
  assert.strictEqual(dg.priority(task({ bid_date: '2026-09-05' }), TODAY).level, 'normal'); // D-31
});

test('priority: 오늘과 지난 날짜', function () {
  assert.strictEqual(dg.priority(task({ bid_date: '2026-08-05' }), TODAY).label, 'D-DAY');
  const past = dg.priority(task({ bid_date: '2026-08-01' }), TODAY);
  assert.strictEqual(past.label, 'D+4');
  assert.strictEqual(past.level, 'urgent');     // 지난 것은 가장 급하다
});

test('priority: 날짜가 없으면 미상이고 등급도 unknown', function () {
  const p = dg.priority(task({ bid_date: null }), TODAY);
  assert.strictEqual(p.level, 'unknown');
  assert.strictEqual(p.label, '미상');
  assert.strictEqual(p.days, null);
});

test('priority: 예상일이면 추측임을 알린다', function () {
  const guess = dg.priority(task({ bid_date: '2026-09-30', schedule_confidence: '예상' }), TODAY);
  assert.ok(guess.tentative);
  assert.ok(!dg.priority(task(), TODAY).tentative);
});

test('sortByPriority: 급한 것부터, 날짜 미상은 맨 뒤', function () {
  const rows = dg.sortByPriority([
    task({ task_id: 'far', bid_date: '2027-01-01' }),
    task({ task_id: 'none', bid_date: null }),
    task({ task_id: 'near', bid_date: '2026-08-07' }),
  ], TODAY);
  assert.deepStrictEqual(rows.map(function (r) { return r.task_id; }), ['near', 'far', 'none']);
});

test('sortByPriority: 원본 배열을 건드리지 않는다', function () {
  const input = [task({ task_id: 'b', bid_date: '2027-01-01' }), task({ task_id: 'a', bid_date: '2026-08-07' })];
  dg.sortByPriority(input, TODAY);
  assert.strictEqual(input[0].task_id, 'b');
});

// ── 목록 구분 (기능 ⑥·⑧) ──────────────────────────────────────────────

test('buckets: 요청받음 / 작업 중 / 제출됨으로 나뉜다', function () {
  const b = dg.buckets([
    task({ task_id: 'a', status: '대기' }),
    task({ task_id: 'b', status: '작성중' }),
    task({ task_id: 'c', status: '1차완료' }),
    task({ task_id: 'd', status: '2차완료' }),
  ]);
  assert.deepStrictEqual(b.requested.map(function (t) { return t.task_id; }), ['a']);
  assert.deepStrictEqual(b.working.map(function (t) { return t.task_id; }), ['b']);
  assert.deepStrictEqual(b.done.map(function (t) { return t.task_id; }), ['c', 'd']);
});

test('buckets: 빈 입력도 세 칸을 준다', function () {
  assert.deepStrictEqual(dg.buckets(null), { requested: [], working: [], done: [] });
});

test('buckets: 모르는 상태는 버리지 않고 요청받음으로 둔다', function () {
  // 조용히 사라지면 디자이너가 일감을 통째로 놓친다.
  assert.strictEqual(dg.buckets([task({ status: '뭔가새로운상태' })]).requested.length, 1);
});

// ── 처리상태 태그 (기능 ⑨) ────────────────────────────────────────────

test('statusTag: 상태마다 색과 문구가 붙는다', function () {
  assert.strictEqual(dg.statusTag('대기').text, '요청받음');
  assert.strictEqual(dg.statusTag('작성중').text, '작업 중');
  assert.strictEqual(dg.statusTag('1차완료').text, '제출됨');
  assert.strictEqual(dg.statusTag('2차완료').text, '승인완료');
});

test('statusTag: 모르는 상태도 원문을 보여준다', function () {
  const t = dg.statusTag('뭔가');
  assert.strictEqual(t.text, '뭔가');       // 빈칸으로 두면 무슨 상태인지 영영 모른다
  assert.ok(t.cls);
});

test('statusTag: 빈 값도 안전하다', function () {
  assert.ok(dg.statusTag(null).text);
});

// ── 이관 패키지 (기능 ①·②) ───────────────────────────────────────────

const HANDOFF = {
  institution_id: 'nowon', institution_name: '노원구', stage: 7,
  pptx_path: 'data/report_new/노원구/노원구_제안서.pptx',
  teams: [
    { team: '영업', task_id: 't-sales', status: '2차완료', assignee: '김 차장',
      approver: '박 수석', draft_content: '영업팀 승인 작성물', contact: '영업팀',
      working: false, files: [] },
    { team: '예산', task_id: 't-budget', status: '작성중', assignee: '정 대리',
      approver: null, draft_content: '', contact: '예산팀', working: true, files: [] },
  ],
  waiting_on: ['예산'],
  scoring: null, coverage: null,
};

test('handoffRows: 팀별 산출물에 상태 태그와 문의 수신자가 붙는다', function () {
  const rows = dg.handoffRows(HANDOFF);
  assert.strictEqual(rows[0].team, '영업');
  assert.strictEqual(rows[0].tag.text, '승인완료');
  assert.strictEqual(rows[0].contact, '영업팀');
  assert.strictEqual(rows[0].author, '김 차장');
});

test('handoffRows: 승인 안 난 팀도 감추지 않는다', function () {
  // 감추면 디자이너가 다 받은 줄 안다 — 서버도 같은 이유로 거르지 않는다.
  const rows = dg.handoffRows(HANDOFF);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].tag.text, '작업 중');
  assert.strictEqual(rows[1].ready, false);
});

test('handoffRows: 본문이 비면 열 것이 없다고 표시한다', function () {
  assert.strictEqual(dg.handoffRows(HANDOFF)[1].hasContent, false);
  assert.strictEqual(dg.handoffRows(HANDOFF)[0].hasContent, true);
});

test('handoffRows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(dg.handoffRows(null), []);
  assert.deepStrictEqual(dg.handoffRows({}), []);
});

test('packageReady: 전부 승인나야 준비 완료다', function () {
  assert.strictEqual(dg.packageReady(HANDOFF), false);
  const all = { teams: HANDOFF.teams.map(function (t) {
    return Object.assign({}, t, { status: '2차완료' });
  }) };
  assert.strictEqual(dg.packageReady(all), true);
});

test('packageReady: 팀이 하나도 없으면 준비됐다고 하지 않는다', function () {
  assert.strictEqual(dg.packageReady({ teams: [] }), false);
});

// ── 파일 표시 ──────────────────────────────────────────────────────────

test('fileRows: 크기를 사람이 읽을 단위로 바꾼다', function () {
  const rows = dg.fileRows([
    { name: 'a.pdf', size: 512, uploaded_at: '2026-08-05T01:00:00+00:00' },
    { name: 'b.pptx', size: 2 * 1024 * 1024, uploaded_at: '2026-08-05T02:00:00+00:00' },
  ]);
  assert.strictEqual(rows[0].sizeText, '512 B');
  assert.strictEqual(rows[1].sizeText, '2.0 MB');
});

test('fileRows: 빈 목록도 안전하다', function () {
  assert.deepStrictEqual(dg.fileRows(null), []);
});

test('canSubmit: 올린 것이 하나도 없으면 제출할 수 없다', function () {
  assert.strictEqual(dg.canSubmit({ status: '작성중' }, []), false);
  assert.strictEqual(dg.canSubmit({ status: '작성중' }, [{ name: 'a.pdf' }]), true);
});

test('canSubmit: 이미 제출한 것은 다시 낼 수 없다', function () {
  assert.strictEqual(dg.canSubmit({ status: '1차완료' }, [{ name: 'a.pdf' }]), false);
  assert.strictEqual(dg.canSubmit({ status: '2차완료' }, [{ name: 'a.pdf' }]), false);
});

test('canSubmit: 빈 입력도 안전하다', function () {
  assert.strictEqual(dg.canSubmit(null, null), false);
});

// ── 팀이 올린 파일 · 제출 차단 (사용자 피드백 반영) ──────────────────────

const HANDOFF2 = {
  institution_name: '노원구',
  teams: [
    { team: '영업', task_id: 't-sales', status: '1차완료', assignee: '김 차장',
      draft_content: '영업 초안', contact: '영업팀', working: false,
      files: [{ name: '지점현황.pdf', size: 2048, uploaded_at: '2026-08-05T01:00:00+00:00' }] },
    { team: '예산', task_id: 't-budget', status: '작성중', assignee: '정 대리',
      draft_content: '', contact: '예산팀', working: true, files: [] },
  ],
  waiting_on: ['예산'],
};

test('handoffRows: 팀이 올린 파일이 함께 온다', function () {
  const rows = dg.handoffRows(HANDOFF2);
  assert.strictEqual(rows[0].taskId, 't-sales');
  assert.strictEqual(rows[0].files[0].name, '지점현황.pdf');
  assert.strictEqual(rows[0].files[0].sizeText, '2.0 KB');
  assert.deepStrictEqual(rows[1].files, []);
});

test('waitingOn: 아직 작업 중인 팀 이름을 준다', function () {
  assert.deepStrictEqual(dg.waitingOn(HANDOFF2), ['예산']);
  assert.deepStrictEqual(dg.waitingOn(HANDOFF), ['예산']);   // 위 HANDOFF는 예산이 작성중
  assert.deepStrictEqual(dg.waitingOn(null), []);
});

test('canSubmit: 다른 팀이 작업 중이면 제출할 수 없다', function () {
  // 디자이너 작업물은 팀 산출물을 **받아서** 만든 것이다 — 팀이 아직 쓰고 있는데
  // 그 위에서 만든 결과를 결재에 올리면 앞뒤가 안 맞는다(사용자 지적).
  const files = [{ name: 'a.pptx' }];
  assert.strictEqual(dg.canSubmit({ status: '작성중' }, files, HANDOFF2), false);
});

test('canSubmit: 팀이 다 끝나면 제출할 수 있다', function () {
  const done = { teams: HANDOFF2.teams.map(function (t) {
    return Object.assign({}, t, { working: false });
  }), waiting_on: [] };
  assert.strictEqual(dg.canSubmit({ status: '작성중' }, [{ name: 'a.pptx' }], done), true);
});

test('canSubmit: handoff를 모르면 파일 조건만 본다(예전 호출부 호환)', function () {
  assert.strictEqual(dg.canSubmit({ status: '작성중' }, [{ name: 'a.pptx' }]), true);
});

test('submitBlockReason: 못 누르는 이유를 한 문장으로 말한다', function () {
  assert.match(dg.submitBlockReason({ status: '작성중' }, [], HANDOFF2), /작업물/);
  assert.match(dg.submitBlockReason({ status: '작성중' }, [{ name: 'a' }], HANDOFF2), /예산/);
  assert.match(dg.submitBlockReason({ status: '1차완료' }, [{ name: 'a' }], HANDOFF2), /제출/);
  const ok = { teams: [], waiting_on: [] };
  assert.strictEqual(dg.submitBlockReason({ status: '작성중' }, [{ name: 'a' }], ok), '');
});

// ── 소속 → 팀 (계획 I) ─────────────────────────────────────────────────
// 작업함은 디자이너 전용이 아니게 됐다 — 팀원·팀장도 자기 팀 작업을 본다.

test('teamOf: 팀원과 팀장은 같은 팀을 본다', function () {
  assert.strictEqual(dg.teamOf('영업팀'), '영업');
  assert.strictEqual(dg.teamOf('영업팀장'), '영업');
  assert.strictEqual(dg.teamOf('전산팀장'), '전산');
});

test('teamOf: 접미사가 없는 역할은 그대로', function () {
  assert.strictEqual(dg.teamOf('디자이너'), '디자이너');
  assert.strictEqual(dg.teamOf('본부장'), '본부장');
});

test('teamOf: 팀장 접미사가 먼저 떨어진다', function () {
  // '팀'을 먼저 떼면 '영업장'이라는 없는 팀이 된다 — 서버(team_of)와 같은 규칙.
  assert.notStrictEqual(dg.teamOf('영업팀장'), '영업장');
});

test('teamOf: 빈 값도 안전하다', function () {
  assert.strictEqual(dg.teamOf(''), '');
  assert.strictEqual(dg.teamOf(null), '');
});
