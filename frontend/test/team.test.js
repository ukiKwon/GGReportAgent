const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const tm = require('../js/team.js');
const nav = require('../js/nav.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const TODAY = new Date('2026-11-10T00:00:00');
function rec(name, id, date, extra) {
  return Object.assign({ name: name, region: '41', bidCaseId: id, contractEnd: date, confirmed: false, participationStatus: '검토중' }, extra || {});
}
const T = tm.T;

// ── 열람 자격·게이트 ──
test('canView / gateOf: 서버 없음 → 로그인 → 권한 순, 디자이너·관리자(전산팀)는 403 화면', function () {
  ['영업팀', '영업팀장', '영업부장', ' 영업팀 '].forEach(function (r) { assert.ok(tm.canView(r), r); });
  ['디자이너', '전산팀', '예산팀장', '', null].forEach(function (r) { assert.ok(!tm.canView(r), String(r)); });
  assert.strictEqual(tm.gateOf({ serverMode: false, emp: '1', role: '영업팀' }).kind, 'file');
  assert.strictEqual(tm.gateOf({ serverMode: true, emp: '', role: '영업팀' }).kind, 'login');
  const g = tm.gateOf({ serverMode: true, emp: '1234567', role: '디자이너' });
  assert.strictEqual(g.kind, 'forbidden');
  assert.strictEqual(g.text, '이 화면은 영업팀·영업팀장·영업부장이 쓰는 화면입니다. 지금 계정(디자이너)으로는 볼 수 없습니다.');
  assert.ok(tm.gateOf({ serverMode: true, emp: '1234567', role: '예산팀' }).text.indexOf('(재무팀)') > 0);   // 화면 표기는 재무팀
  assert.strictEqual(tm.gateOf({ serverMode: true, emp: '1234567', role: '영업팀장' }), null);
});

// ── 목록 ──
test('ddayClass: 182일 이하(지난 것 포함) 빨강, 365일 이하 주황, 그 밖 later, 미상 unknown', function () {
  [-30, 0, 182].forEach(function (d) { assert.strictEqual(tm.ddayClass(d), 'urgent', String(d)); });
  [183, 365].forEach(function (d) { assert.strictEqual(tm.ddayClass(d), 'soon', String(d)); });
  assert.strictEqual(tm.ddayClass(366), 'later');
  [null, undefined, Infinity, NaN].forEach(function (d) { assert.strictEqual(tm.ddayClass(d), 'unknown', String(d)); });
});

test('bidDate: 확정은 (확정), 그 밖은 (예상) — "추정"이 아니다, 날짜 없으면 미상', function () {
  assert.strictEqual(tm.bidDate({ contractEnd: '2027-03-31', confirmed: true }).text, '2027-03-31(확정)');
  assert.strictEqual(tm.bidDate({ contractEnd: '2027-03-31', confirmed: false }).text, '2027-03-31(예상)');
  assert.strictEqual(tm.bidDate({ lastBid: '2024-06-30', term: 3 }).conf, '예상');
  assert.deepStrictEqual(tm.bidDate({}), { date: null, conf: null, text: '미상' });
});

test('listRows: bidCaseId 없는 기관 제외·중복 제거·임박 순·미상 맨 아래·내 담당·D-day', function () {
  const rows = tm.listRows([
    rec('나시', 'b3', null),
    rec('가시', 'b1', '2026-11-20'),
    rec('다시', 'b2', '2026-11-05', { confirmed: true }),
    { name: '공고없음', region: '41' },
    rec('가시중복', 'b1', '2026-11-20'),
    rec('라시', 'b4', '2026-11-10', { participationStatus: '', region: '11' }),
  ], TODAY, ['b1'], { '41': '경기', '11': '서울' });
  assert.deepStrictEqual(rows.map(function (r) { return r.id; }), ['b2', 'b4', 'b1', 'b3']);
  assert.strictEqual(rows[0].dday, 'D+5');
  assert.strictEqual(rows[0].ddayClass, 'urgent');
  assert.strictEqual(rows[0].conf, '확정');
  assert.strictEqual(rows[1].dday, 'D-day');
  assert.strictEqual(rows[1].region, '서울');
  assert.strictEqual(rows[1].status, '검토중');       // 비면 워크플로와 같은 기본값
  assert.strictEqual(rows[2].dday, 'D-10');
  assert.strictEqual(rows[2].mine, true);
  assert.strictEqual(rows[2].conf, '예상');
  assert.strictEqual(rows[3].dday, '미상');
  assert.strictEqual(rows[3].ddayClass, 'unknown');
  assert.strictEqual(rows[3].days, null);
  assert.strictEqual(rows[0].mine, false);
});

test('listRows: 같은 날짜는 이름 순, 입력을 바꾸지 않는다', function () {
  const input = [rec('다', 'c', '2026-12-01'), rec('가', 'a', '2026-12-01'), rec('나', 'b', '2026-12-01')];
  const copy = JSON.stringify(input);
  assert.deepStrictEqual(tm.listRows(input, TODAY, [], {}).map(function (r) { return r.name; }), ['가', '나', '다']);
  assert.strictEqual(JSON.stringify(input), copy);
  assert.deepStrictEqual(tm.listRows(null, TODAY, null, null), []);
});

test('filterRows / emptyText / countText', function () {
  const rows = tm.listRows([rec('수원시', 'b1', '2026-12-01'), rec('창원시', 'b2', '2026-12-02')], TODAY, ['b2'], {});
  assert.strictEqual(tm.filterRows(rows, 'all', '').length, 2);
  assert.deepStrictEqual(tm.filterRows(rows, 'mine', '').map(function (r) { return r.id; }), ['b2']);
  assert.deepStrictEqual(tm.filterRows(rows, 'all', ' 수원 ').map(function (r) { return r.id; }), ['b1']);
  assert.strictEqual(tm.filterRows(rows, 'mine', '수원').length, 0);
  assert.strictEqual(tm.emptyText('all', ''), '입찰 공고가 등록된 기관이 없습니다. 공고가 등록되면 여기에 나타납니다.');
  assert.strictEqual(tm.emptyText('mine', ''), '내가 담당인 입찰 건이 없습니다.');
  assert.strictEqual(tm.emptyText('all', '부산'), '\'부산\'와 맞는 기관이 없습니다.');
  assert.strictEqual(tm.emptyText('mine', '부산'), '\'부산\'와 맞는 기관이 없습니다.');
  assert.strictEqual(tm.countText(12), '12건');
});

// ── 역할별 표시 (규격 §6-7) ──
test('viewerState: 역할별 표 — 영업팀장/담당자/비담당자/영업부장', function () {
  const un = function (v) { return { assigned: false, viewer: v }; };
  const as = function (v, pending) { return { assigned: true, pending_change: pending ? { req_id: 1 } : null, viewer: v }; };
  // 배정 전
  assert.strictEqual(tm.viewerState(un({ can_assign: true }), '영업팀장').phase, 'assign');
  assert.strictEqual(tm.viewerState(un({ can_assign: false }), '영업팀').phase, 'empty');
  assert.strictEqual(tm.viewerState(un({ can_assign: false }), '영업부장').phase, 'empty');
  assert.strictEqual(tm.viewerState(null, '영업팀').phase, 'empty');
  // 배정 후, 진행 중 없음
  let s = tm.viewerState(as({ is_assignee: true, can_request_change: true }), '영업팀');
  assert.deepStrictEqual([s.phase, s.button, s.pending, s.note], ['list', 'enabled', false, '']);
  s = tm.viewerState(as({ is_assignee: false, can_request_change: true }), '영업팀장');
  assert.strictEqual(s.button, 'enabled');
  s = tm.viewerState(as({ is_assignee: false, can_request_change: false }), '영업팀');
  assert.deepStrictEqual([s.button, s.note], ['none', T.noQualify]);
  s = tm.viewerState(as({ is_assignee: false, can_request_change: false }), '영업부장');
  assert.deepStrictEqual([s.button, s.note], ['none', T.noQualify]);
  // 진행 중: 담당자·팀장은 비활성+사유, 그 밖은 자격 안내 — 배지는 모두에게
  s = tm.viewerState(as({ is_assignee: true, can_request_change: false }, true), '영업팀');
  assert.deepStrictEqual([s.button, s.note, s.pending], ['disabled', '결재 중인 변경 신청이 끝난 뒤 다시 신청할 수 있습니다.', true]);
  s = tm.viewerState(as({ is_assignee: false, can_request_change: false }, true), '영업팀장');
  assert.strictEqual(s.button, 'disabled');
  s = tm.viewerState(as({ is_assignee: false, can_request_change: false }, true), '영업팀');
  assert.deepStrictEqual([s.button, s.pending], ['none', true]);
  s = tm.viewerState(as({ is_assignee: false, can_request_change: false }, true), '영업부장');
  assert.deepStrictEqual([s.button, s.pending, s.note], ['none', true, T.noQualify]);
});

// ── 변경 미리보기·체크 목록 ──
test('changePreview: 정상·아무것도 안 고름·0명·10명 초과', function () {
  const three = [{}, {}, {}];
  let p = tm.changePreview(three, ['a'], ['b']);
  assert.deepStrictEqual([p.state, p.k, p.canSubmit, p.text], ['ok', 3, true, '변경 후 3명 (현재 3 · 추가 1 · 해제 1)']);
  p = tm.changePreview(three, [], []);
  assert.deepStrictEqual([p.state, p.canSubmit, p.text], ['empty', false, '추가하거나 해제할 담당자를 한 명 이상 고르세요.']);
  p = tm.changePreview([{}], ['a'], []);
  assert.deepStrictEqual([p.state, p.k, p.canSubmit, p.text], ['none-left', 0, false, '담당자는 최소 1명이어야 합니다. 해제할 사람을 줄이거나 추가할 사람을 고르세요.']);
  p = tm.changePreview([{}], ['a'], ['b']);
  assert.deepStrictEqual([p.state, p.k], ['ok', 1]);
  p = tm.changePreview(new Array(10).fill({}), [], ['x']);
  assert.deepStrictEqual([p.state, p.k, p.canSubmit, p.text], ['too-many', 11, false, '담당자는 10명을 넘을 수 없습니다. 추가할 사람을 줄이세요.']);
  p = tm.changePreview(new Array(10).fill({}), ['a'], ['x']);
  assert.strictEqual(p.state, 'ok');
  assert.strictEqual(tm.changePreview(null, null, null).state, 'empty');
});

test('previewHtml: ok일 때 숫자는 mono, 글자는 text와 같다', function () {
  const p = tm.changePreview([{}, {}, {}], ['a'], ['b']);
  const html = tm.previewHtml(p);
  assert.ok(html.indexOf('class="tm-mono"') > 0);
  assert.strictEqual(html.replace(/<[^>]+>/g, ''), p.text);
  assert.strictEqual(tm.previewHtml(tm.changePreview([], [], [])), '추가하거나 해제할 담당자를 한 명 이상 고르세요.');
});

test('togglePick: 추가·해제·상한(10)에서 추가 거부, 입력 불변', function () {
  const a = ['x'];
  assert.deepStrictEqual(tm.togglePick(a, 'y', 10), ['x', 'y']);
  assert.deepStrictEqual(tm.togglePick(['x', 'y'], 'x', 10), ['y']);
  const full = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  assert.deepStrictEqual(tm.togglePick(full, '11', 10), full);
  assert.deepStrictEqual(tm.togglePick(full, '3', 10).length, 9);   // 상한에서도 빼기는 된다
  assert.deepStrictEqual(a, ['x']);
  assert.deepStrictEqual(tm.togglePick(full, '11', 0).length, 11);  // max 0 = 상한 없음(모달 쪽)
});

test('assignState: 0명 비활성+사유, 10명 도달', function () {
  assert.deepStrictEqual(tm.assignState(0), { text: '0 / 10명 선택', full: false, disabled: true, why: '한 명 이상 고르세요.' });
  assert.deepStrictEqual(tm.assignState(3), { text: '3 / 10명 선택', full: false, disabled: false, why: '' });
  assert.strictEqual(tm.assignState(10).full, true);
});

test('filterCands: 이름 검색(대소문자 무시)·제외', function () {
  const c = [{ emp_no: '1', name: '홍길동' }, { emp_no: '2', name: 'Kim' }, { emp_no: '3', name: '박영희' }];
  assert.deepStrictEqual(tm.filterCands(c, ' kim ', []).map(function (x) { return x.emp_no; }), ['2']);
  assert.deepStrictEqual(tm.filterCands(c, '', ['1']).map(function (x) { return x.emp_no; }), ['2', '3']);
  assert.strictEqual(tm.filterCands(null, 'x', null).length, 0);
});

// ── 오류 해석 ──
test('errorInfo: 코드 → 문구 표, 상태, message, 기본 문구', function () {
  const co = function (code) { return { code: code, message: '서버 문구' }; };
  const dup = tm.errorInfo(409, co('ASSIGNED_ALREADY'));
  assert.strictEqual(dup.after, 'reload');
  assert.strictEqual(dup.text.indexOf('다른 사람이 먼저 담당자를 배정했습니다.'), 0);
  assert.strictEqual(tm.errorInfo(409, co('CHANGE_PENDING')).after, 'closeReload');
  assert.strictEqual(tm.errorInfo(409, co('NOT_ASSIGNED')).after, 'closeReload');
  assert.strictEqual(tm.errorInfo(400, co('NO_ASSIGNEE_LEFT')).after, 'keep');
  assert.strictEqual(tm.errorInfo(400, co('TOO_MANY_ASSIGNEES')).after, 'keep');
  assert.strictEqual(tm.errorInfo(400, co('APPROVER_NOT_RESOLVED')).text.indexOf('결재자를 정할 수 없어 신청하지 못했습니다.'), 0);
  assert.deepStrictEqual(tm.errorInfo(422, '무관한 문자열'), { text: T.pii, after: 'reason', code: '' });
  assert.strictEqual(tm.errorInfo(404, 'bid case not found').text, '이 입찰 건을 찾을 수 없습니다. 목록을 새로 고쳐 주세요.');
  assert.strictEqual(tm.errorInfo(403, '담당자 변경은 현재 담당자 또는 영업팀장만 신청할 수 있습니다.').text,
    '담당자 변경은 현재 담당자 또는 영업팀장만 신청할 수 있습니다.');
  assert.strictEqual(tm.errorInfo(403, '담당자 변경은 현재 담당자 또는 영업팀장만 신청할 수 있습니다.').after, 'reload');
  assert.strictEqual(tm.errorInfo(403, undefined).text, T.noWrite);
  assert.strictEqual(tm.errorInfo(400, '추가하거나 해제할 담당자를 하나 이상 지정하세요.').text, '추가하거나 해제할 담당자를 하나 이상 지정하세요.');   // 코드 없는 400 = 서버 문자열
  assert.strictEqual(tm.errorInfo(400, '추가하거나 해제할 담당자를 하나 이상 지정하세요.').after, 'keep');
  assert.strictEqual(tm.errorInfo(0, undefined).text, '서버에 연결하지 못해 처리되지 않았습니다. 잠시 뒤 다시 시도하세요.');
  assert.strictEqual(tm.errorInfo(undefined, null).after, 'keep');
  assert.strictEqual(tm.errorInfo(401, null).text, '로그인이 필요합니다. 사번으로 로그인해 주세요.');
  assert.strictEqual(tm.errorInfo(500, undefined).text, '처리하지 못했습니다 (500)');
  assert.strictEqual(tm.errorInfo(409, { code: 'GROUP_VER_CHANGED', message: '담당자 구성이 바뀌었습니다.' }).text, '담당자 구성이 바뀌었습니다.');
  // 어떤 입력에서도 [object Object]가 나오지 않는다
  [{ code: 'X' }, { a: 1 }, [], 5, {}].forEach(function (d) {
    [400, 403, 409, 500].forEach(function (st) { assert.ok(tm.errorInfo(st, d).text.indexOf('[object') < 0, st + JSON.stringify(d)); });
  });
});

test('errorTarget: 모달 오류는 모달에, 최초 배정 keep은 확인 줄 아래, 나머지는 상세 위', function () {
  assert.strictEqual(tm.errorTarget({ after: 'keep' }, 'change', true), 'modal');
  assert.strictEqual(tm.errorTarget({ after: 'reason' }, 'change', true), 'modal');
  assert.strictEqual(tm.errorTarget({ after: 'reload' }, 'change', true), 'modal');
  assert.strictEqual(tm.errorTarget({ after: 'closeReload' }, 'change', true), 'pane');
  assert.strictEqual(tm.errorTarget({ after: 'keep' }, 'change', false), 'pane');
  assert.strictEqual(tm.errorTarget({ after: 'keep' }, 'assign', false), 'assign');
  assert.strictEqual(tm.errorTarget({ after: 'reload' }, 'assign', false), 'pane');
});

// ── 이력·담당자·진행 중 안내 ──
test('historyRows: 최근 순(같은 시각은 나중 기록이 위), 한국시간, 자기신고, 결재 반영, 사유 없음 -', function () {
  const rows = tm.historyRows([
    { action_name: '최초 배정', target_name: '홍길동', req_id: null, reason: '팀장 자기 포함 배정', actor_name: '이영희', emp_verified: false, logged_at: '2026-11-10T05:02:00Z' },
    { action_name: '최초 배정', target_name: '김철수', req_id: null, reason: null, actor_name: '이영희', emp_verified: true, logged_at: '2026-11-10T05:02:00Z' },
    { action_name: '담당자 추가', target_name: '박영희', req_id: 7, reason: '  ', actor_name: '최부장', emp_verified: true, logged_at: '2026-11-11T01:00:00Z' },
  ]);
  assert.deepStrictEqual(rows.map(function (r) { return r.content; }),
    ['담당자 추가 — 박영희', '최초 배정 — 김철수', '최초 배정 — 홍길동']);
  assert.strictEqual(rows[0].when, '2026-11-11 10:00');
  assert.strictEqual(rows[2].when, '2026-11-10 14:02');
  assert.deepStrictEqual([rows[0].reflected, rows[1].reflected], [true, false]);
  assert.deepStrictEqual([rows[0].selfReport, rows[1].selfReport, rows[2].selfReport], [false, false, true]);
  assert.deepStrictEqual([rows[0].reason, rows[1].reason, rows[2].reason], ['-', '-', '팀장 자기 포함 배정']);
  assert.deepStrictEqual(tm.historyRows(null), []);
  // emp_verified 필드가 없으면 확인된 것으로 치지 않는다(true일 때만 표시 없음)
  assert.strictEqual(tm.historyRows([{ action_name: 'a', target_name: 'b', logged_at: '2026-11-10T00:00:00Z' }])[0].selfReport, true);
});

test('assigneeRows: (나) 표시와 배정일은 한국 날짜', function () {
  const rows = tm.assigneeRows([
    { emp_no: '1234567', name: '홍길동', position_title: '과장', assigned_at: '2026-11-10T15:30:00Z' },
    { emp_no: '7654321', name: '김철수', position_title: '대리', assigned_at: '2026-11-10T01:00:00Z' },
  ], '1234567');
  assert.deepStrictEqual(rows.map(function (r) { return r.isMe; }), [true, false]);
  assert.strictEqual(rows[0].date, '2026-11-11');
  assert.strictEqual(rows[1].date, '2026-11-10');
  assert.strictEqual(tm.assigneeRows([{ emp_no: '1', name: 'a' }], '')[0].isMe, false);
});

test('pendingInfo: 인원 수 + 이름(서버 제공 또는 현재 담당자와 대조해 모두 찾을 때만)', function () {
  assert.strictEqual(tm.pendingInfo(null, []), null);
  const cur = [{ emp_no: 'E1', name: '홍길동' }, { emp_no: 'E2', name: '김철수' }];
  let p = tm.pendingInfo({ add_emp_nos: ['E3'], remove_emp_nos: ['E1', 'E2'] }, cur);
  assert.strictEqual(p.text, '담당자 변경 신청이 결재 중입니다 — 추가 1명 · 해제 2명. 결재가 끝나면 이 목록에 반영됩니다.');
  assert.deepStrictEqual(p.lines, ['해제: 홍길동, 김철수']);          // 추가 대상 이름은 서버가 줄 때만
  p = tm.pendingInfo({ add_emp_nos: [], remove_emp_nos: ['E9'] }, cur);   // 못 찾으면 줄을 내지 않는다
  assert.deepStrictEqual(p.lines, []);
  p = tm.pendingInfo({ add_emp_nos: ['E3'], remove_emp_nos: ['E1'], add_people: [{ emp_no: 'E3', name: '박영희' }],
    remove_people: [{ emp_no: 'E1', name: '홍길동' }], requested_by_name: '이영희' }, cur);
  assert.deepStrictEqual(p.lines, ['해제: 홍길동', '추가: 박영희', '신청: 이영희']);
});

// ── HTML: 이스케이프·접근성 ──
const X = '<img src=x onerror=alert(1)>';
test('HTML 조각은 서버·사용자 글자를 esc 한다', function () {
  const rows = tm.listRows([rec(X, 'b1', '2026-12-01', { participationStatus: X })], TODAY, [], { '41': X });
  const list = tm.itemsHtml(rows, 'b1');
  assert.ok(list.indexOf('<img') < 0 && list.indexOf('&lt;img') > 0);
  assert.ok(list.indexOf('aria-current="true"') > 0);
  assert.ok(tm.caseHeadHtml(rows[0]).indexOf('<img') < 0);
  assert.ok(tm.assigneesTableHtml(tm.assigneeRows([{ emp_no: '1', name: X, position_title: X, assigned_at: '' }], '')).indexOf('<img') < 0);
  const hist = tm.historyHtml(tm.historyRows([{ action_name: X, target_name: X, actor_name: X, reason: X, emp_verified: false, logged_at: '2026-11-10T00:00:00Z' }]));
  assert.ok(hist.indexOf('<img') < 0);
  assert.ok(hist.indexOf('title="로그인 신원을 확인하지 않은 기록입니다"') > 0);
  assert.ok(hist.indexOf('title="로그인 신원을 확인하지 않은 기록입니다"') > 0);
  assert.ok(hist.indexOf('검증됨') < 0);
  const picks = tm.picksHtml([{ emp_no: '1"><b>', name: X, position_title: X, role: '영업팀' }], [], {});
  assert.ok(picks.indexOf('<img') < 0 && picks.indexOf('<b>') < 0);
  assert.ok(tm.modalHtml({ name: X, assignees: [], cands: [], meEmp: '' }).indexOf('<img') < 0);
  const body = tm.caseBodyHtml({ view: { assigned: true, assignees: [], viewer: {}, pending_change: { add_emp_nos: [], remove_emp_nos: [], requested_by_name: X } },
    history: [], cands: [], role: '영업팀', meEmp: '' });
  assert.ok(body.indexOf('<img') < 0);
});

test('historyHtml: emp_verified=true면 칩 없음, 비면 안내 문구', function () {
  const h = tm.historyHtml(tm.historyRows([{ action_name: '최초 배정', target_name: '홍', actor_name: '이', emp_verified: true, logged_at: '2026-11-10T00:00:00Z' }]));
  assert.ok(h.indexOf('자기신고') < 0);
  assert.ok(h.indexOf('시각') > 0 && h.indexOf('내용') > 0 && h.indexOf('처리자') > 0 && h.indexOf('사유') > 0);
  assert.ok(tm.historyHtml([]).indexOf('아직 배정 기록이 없습니다.') > 0);
});

test('caseBodyHtml: 영업팀장 배정 전 = 체크 목록 폼(0명이면 버튼 비활성+사유 연결)', function () {
  const html = tm.caseBodyHtml({ view: { assigned: false, assignees: [], viewer: { can_assign: true } }, history: [],
    cands: [{ emp_no: '1', name: '홍길동', position_title: '과장', role: '영업팀장' }], role: '영업팀장', meEmp: '1', assign: { sel: [], q: '' } });
  assert.ok(html.indexOf('<fieldset class="tm-fs" id="tm-assign"><legend>담당자 선택 (1~10명)</legend>') >= 0);
  assert.ok(/id="tm-assign-go"[^>]*aria-describedby="tm-assign-why"[^>]* disabled/.test(html));
  assert.ok(html.indexOf('0 / 10명 선택') > 0 && html.indexOf('aria-live="polite"') > 0);
  assert.ok(html.indexOf('0명</span>') > 0);
  assert.ok(html.indexOf('(나)') > 0);                                   // 후보 중 본인
  const noCand = tm.caseBodyHtml({ view: { assigned: false, assignees: [], viewer: { can_assign: true } }, history: [], cands: [], role: '영업팀장', meEmp: '1', assign: { sel: [] } });
  assert.ok(noCand.indexOf('배정할 수 있는 영업팀 사용자가 없습니다. 시스템 관리자에게 사용자 등록을 요청하세요.') > 0);
});

test('caseBodyHtml: 배정 전 비팀장 = 안내문, 진행 중 = 배지·안내 상자·비활성 버튼+사유', function () {
  const empty = tm.caseBodyHtml({ view: { assigned: false, assignees: [], viewer: {} }, history: [], cands: [], role: '영업팀', meEmp: '' });
  assert.ok(empty.indexOf('아직 담당자가 배정되지 않았습니다. 영업팀장이 배정하면 여기에 표시됩니다.') > 0);
  assert.ok(empty.indexOf('tm-assign') < 0);
  const view = { assigned: true, assignees: [{ emp_no: '1', name: '홍길동', position_title: '과장', assigned_at: '2026-11-10T00:00:00Z' }],
    pending_change: { req_id: 3, add_emp_nos: ['2'], remove_emp_nos: ['1'] }, viewer: { is_assignee: true, can_request_change: false } };
  const html = tm.caseBodyHtml({ view: view, history: [], cands: [], role: '영업팀', meEmp: '1' });
  assert.ok(html.indexOf('<span class="tm-pend">변경 결재 중</span>') > 0);
  assert.ok(html.indexOf('class="tm-pendbox"') > 0);
  assert.ok(html.indexOf('추가 1명 · 해제 1명') > 0 && html.indexOf('해제: 홍길동') > 0);
  assert.ok(/id="tm-change-btn" disabled aria-describedby="tm-change-why"/.test(html));
  assert.ok(html.indexOf('결재 중인 변경 신청이 끝난 뒤 다시 신청할 수 있습니다.') > 0);
  assert.ok(html.indexOf('(나)') > 0);
  assert.ok(html.indexOf('class="tm-tbl-wrap"') > 0);
  // 영업부장: 읽기 전용(버튼 없음 + 자격 안내)
  const head = tm.caseBodyHtml({ view: Object.assign({}, view, { pending_change: null, viewer: { is_assignee: false, can_request_change: false } }),
    history: [], cands: [], role: '영업부장', meEmp: '9' });
  assert.ok(head.indexOf('tm-change-btn') < 0 && head.indexOf('담당자 변경은 현재 담당자 또는 영업팀장이 신청합니다.') > 0);
  assert.ok(head.indexOf('tm-pend') < 0);
});

test('picksHtml: 10명 도달 시 선택 안 된 행은 disabled + 상한 안내 연결', function () {
  const cands = []; const sel = [];
  for (let i = 0; i < 11; i += 1) { cands.push({ emp_no: String(1000000 + i), name: 'n' + i }); if (i < 10) sel.push(String(1000000 + i)); }
  const html = tm.picksHtml(cands, sel, { max: 10, describedBy: 'tm-max-note' });
  assert.strictEqual((html.match(/ disabled aria-describedby="tm-max-note"/g) || []).length, 1);
  assert.strictEqual((html.match(/ checked/g) || []).length, 10);
  assert.ok(html.indexOf('<label class="tm-pick') === 0);
});

test('modalHtml: dialog 역할·aria·사유 입력 속성·문구', function () {
  const html = tm.modalHtml({ name: '수원시', assignees: [{ emp_no: '1', name: '홍길동', position_title: '과장' }],
    cands: [{ emp_no: '1', name: '홍길동', position_title: '과장', role: '영업팀' }, { emp_no: '2', name: '박영희', position_title: '사원', role: '영업팀' }],
    meEmp: '1', approvalsHint: true });
  assert.ok(html.indexOf('role="dialog" aria-modal="true" aria-labelledby="tm-m-title"') > 0);
  assert.ok(html.indexOf('담당자 변경 신청 — 수원시') > 0);
  assert.ok(html.indexOf('maxlength="200"') > 0 && html.indexOf('aria-required="true"') > 0);
  assert.ok(html.indexOf('aria-describedby="tm-rhint tm-rcount"') > 0);
  assert.ok(html.indexOf('변경 사유 (필수)') > 0 && html.indexOf('0/200') > 0);
  assert.ok(html.indexOf('해제할 담당자') > 0 && html.indexOf('추가할 담당자') > 0);
  // 추가 목록에서 현재 담당자는 뺀다
  const add = html.slice(html.indexOf('id="tm-add-picks"'));
  assert.ok(add.indexOf('박영희') > 0 && add.indexOf('홍길동') < 0);
  assert.ok(html.indexOf('결재자는 신청 내용에 따라 시스템이 정합니다. 신청 뒤 [결재함 › 내가 올린 요청]에서 결재 진행을 볼 수 있습니다.') > 0);
  const noHint = tm.modalHtml({ name: 'a', assignees: [], cands: [], meEmp: '', approvalsHint: false });
  assert.ok(noHint.indexOf('내가 올린 요청') < 0 && noHint.indexOf('결재자는 신청 내용에 따라 시스템이 정합니다.') > 0);
  assert.ok(html.indexOf('disabled aria-describedby="tm-preview">변경 신청 올리기') > 0);
});

// ── 연결: nav·app·index.html ──
test('nav와 같은 고정 id·역할 목록을 쓴다', function () {
  assert.strictEqual(tm.SOON_ID, nav.TEAM_ID);
  assert.deepStrictEqual(tm.VIEW_ROLES, nav.TEAM_ROLES);
  const all = nav.CATEGORIES.reduce(function (a, c) { return a.concat(c.items); }, []);
  const it = all.filter(function (i) { return i.label === '제안팀 구성·배정'; })[0];
  assert.strictEqual(it.id, tm.SOON_ID);
  assert.strictEqual(it.tag, '');
});

test('소스 규칙: confirm() 없음, 외부 주소 없음, 새 hex 없음, "검증됨" 없음', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'team.js'), 'utf8');
  assert.ok(!/\bconfirm\(/.test(src));
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src));
  assert.ok(src.indexOf('검증됨') < 0);
  assert.ok(!/innerHTML\s*=\s*[^;]*\be\.(message|detail)/.test(src));   // 서버 오류 문구를 innerHTML로 넣지 않는다
});

test('app.js: showSoon이 제안팀 id에서 soon-plain을 숨기고 tm.mount를 부른다, 계정 변경 때 tm.onProfileChange', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.ok(src.indexOf('itemId === root.tm.SOON_ID') > 0);
  assert.ok(src.indexOf('root.tm.mount()') > 0);
  assert.ok(src.indexOf("document.getElementById('tm-root').style.display") > 0);
  assert.ok(src.indexOf('root.tm.onProfileChange()') > 0);
});

test('index.html: #tm-root 마크업·script 순서·CSS 규칙(새 hex·11px 미만·채운 주버튼 금지)', function () {
  ['tm-root', 'tm-gate', 'tm-wrap', 'tm-list', 'tm-tabs', 'tm-count', 'tm-q', 'tm-items', 'tm-pane', 'tm-flash', 'tm-perr', 'tm-case', 'tm-modal'].forEach(function (id) {
    assert.ok(HTML.indexOf('id="' + id + '"') > 0, id);
  });
  assert.ok(/<div id="tm-root" style="display:none;">/.test(HTML));
  assert.ok(/id="tm-flash" class="ad-flash" role="status"/.test(HTML) && /id="tm-perr" class="ap-err" role="alert"/.test(HTML));
  assert.ok(/<section id="tm-case" aria-labelledby="tm-case-title" aria-busy="false">/.test(HTML));
  assert.ok(/role="tablist"/.test(HTML.slice(HTML.indexOf('id="tm-tabs"') - 40, HTML.indexOf('id="tm-tabs"') + 80)));
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('errtext.js') > 0 && at('errtext.js') < at('approvals.js'));
  assert.ok(at('team.js') > at('board.js') && at('team.js') > at('errtext.js') && at('team.js') < at('app.js'));
  const a = HTML.indexOf('/* 제안팀 구성·배정 시작'), b = HTML.indexOf('/* 제안팀 구성·배정 끝 */');
  assert.ok(a > 0 && b > a);
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '새 hex 금지(토큰만)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 11, m); });
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  assert.ok(/#tm-list\s*\{\s*width:270px/.test(css));
  assert.ok(/@media \(max-width:880px\)[\s\S]*#tm-wrap \{ flex-direction:column/.test(css));
  assert.ok(/\.tm-pend \{[^}]*var\(--orange\)/.test(css) && css.indexOf('#e0b44c') < 0);
  assert.ok(/\.modal-box\.tm-modal-box \{ max-width:560px/.test(css));
});

// ── qa 후속(2026-11-10): P2-1, P3-1~P3-6 ──
function between(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, from + ' .. ' + to);
  return src.slice(a, b);
}
const TEAM_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'team.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('P2-1: 공용 wireModalDismiss는 #tm-modal을 제외하고, team.js가 Esc·배경 클릭을 requestClose로 처리한다', function () {
  const dismiss = between(APP_SRC, 'app.wireModalDismiss = function', 'const LEGACY_FLAG');
  assert.ok(/ov\.id !== 'tm-modal'/.test(dismiss));
  assert.strictEqual((dismiss.match(/querySelectorAll\('\.modal-overlay'\)/g) || []).length, 1);
  assert.ok(/Array\.prototype\.filter\.call\(document\.querySelectorAll\('\.modal-overlay'\)/.test(dismiss));
  assert.ok(/if \(e\.target === ov\) ov\.style\.display = 'none'/.test(dismiss));
  assert.ok(/overlays\.forEach\(function \(ov\) \{ ov\.style\.display = 'none'; \}\)/.test(dismiss));

  const wireSrc = between(TEAM_SRC, 'function wire()', 'tm.mount = function');
  assert.ok(/e\.target === md && downOnBg\) requestClose\(\)/.test(wireSrc));
  assert.ok(/e\.key !== 'Escape' \|\| !S\.modal/.test(wireSrc) && /requestClose\(\)/.test(wireSrc));
  assert.ok(!/style\.display\s*=\s*'none'/.test(wireSrc));
  const keySrc = between(TEAM_SRC, 'function onModalKey', 'function wire()');
  assert.ok(!/Escape/.test(keySrc));
});

test('P3-1: closeReload로 모달을 닫으면 다시 그린 뒤 포커스를 돌려받는다', function () {
  const src = between(TEAM_SRC, 'function handleWriteError', 'function onClick');
  assert.ok(/closeReload' && S\.modal\) \{ closeModal\(false\); S\.refocus = true; \}/.test(src));
  const load = between(TEAM_SRC, 'function loadDetail', 'function afterDetail');
  assert.strictEqual((load.match(/afterDetail\(\)/g) || []).length, 2);
});

test('P3-2: 계정이 바뀌면 #tm-q 입력값을 비운다(mount·onProfileChange 둘 다)', function () {
  assert.ok(/function clearQueryBox\(\) \{ const q = el\('tm-q'\); if \(q\) q\.value = ''; \}/.test(TEAM_SRC));
  const mount = between(TEAM_SRC, 'tm.mount = function', 'tm.onProfileChange');
  assert.ok(/S = freshState\(\); S\.who = who; clearQueryBox\(\);/.test(mount));
  const change = between(TEAM_SRC, 'tm.onProfileChange = function', 'tm.unmount');
  assert.ok(/clearQueryBox\(\);/.test(change));
});

test('P3-3: 빈 상태 문구는 긴 검색어에서도 줄바꿈된다(overflow-wrap:anywhere)', function () {
  const m = /([^{}]*#tm-items \.wf-empty[^{}]*)\{([^}]*)\}/.exec(HTML);
  assert.ok(m, '#tm-items .wf-empty 규칙');
  assert.ok(/overflow-wrap\s*:\s*anywhere/.test(m[2]));
  ['#tm-case .wf-empty', '#tm-gate .wf-empty', '#tm-modal .wf-empty'].forEach(function (s) { assert.ok(m[1].indexOf(s) >= 0, s); });
});

test('P3-4: 목록 0건이면 오른쪽 안내는 등록 안내, 아니면 위치 중립 문구', function () {
  assert.strictEqual(tm.pickHintText(0), '입찰 건이 등록되면 여기서 담당자를 정합니다.');
  const h = tm.pickHintText(3);
  assert.ok(h.indexOf('목록에서 입찰 건을 고르세요') === 0);
  assert.ok(h.indexOf('왼쪽') < 0 && tm.pickHintText(0).indexOf('왼쪽') < 0);
  assert.ok(TEAM_SRC.indexOf('왼쪽') < 0);
  assert.ok(/tm\.pickHintText\(S\.rows\.length\)/.test(between(TEAM_SRC, 'function paintCase', 'function clearNotices')));
});

test('P3-5: 자기신고 칩은 aria-label 없이 보이는 글자 그대로, 설명은 title로만', function () {
  const h = tm.historyHtml(tm.historyRows([{ action_name: '최초 배정', target_name: '홍', actor_name: '이', emp_verified: false, logged_at: '2026-11-10T00:00:00Z' }]));
  const chip = /<span[^>]*tm-selfrep[^>]*>자기신고<\/span>/.exec(h);
  assert.ok(chip, '칩 렌더');
  assert.ok(chip[0].indexOf('aria-label') < 0);
  assert.ok(/title="[^"]+"/.test(chip[0]));
});

test('P3-6: 배정 확인 줄이 열리면 첫 포커스는 취소', function () {
  const src = between(TEAM_SRC, 'function onAssignGo', 'function onAssignCancel');
  assert.ok(/el\('tm-assign-cancel'\)/.test(src) && /\.focus\(\)/.test(src));
  assert.ok(src.indexOf('tm-assign-ok') < 0);
  const html = tm.assignConfirmHtml(2);
  assert.ok(html.indexOf('id="tm-assign-cancel"') > 0 && html.indexOf('id="tm-assign-ok"') > html.indexOf('id="tm-assign-cancel"'));
});
