const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const prep = require('../js/prep.js');
const nav = require('../js/nav.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'prep.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const RENDER_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');

const ALL_ON = { map: true, regions: true, workflow: true, chat: true, knowledge: true, tasks: true, approvals: true, admin: true };
function find(v, ctx, id) {
  const hit = [];
  nav.build(v, ctx).forEach(function (c) { c.items.forEach(function (i) { if (i.id === id) hit.push(i); }); });
  return hit[0] || null;
}

// ── 연결: nav·app·index.html ──
test('prep.SOON_ID === nav.PREP_ID, 열람 역할은 nav.TEAM_ROLES와 같다', function () {
  assert.strictEqual(prep.SOON_ID, nav.PREP_ID);
  assert.deepStrictEqual(prep.VIEW_ROLES, nav.TEAM_ROLES);
});

test('nav 노출(사전준비): 영업팀·영업팀장·영업부장 예, 디자이너·마스터·전산팀·예산팀·역할 없음 아니오, 배지 없음', function () {
  ['영업팀', '영업팀장', '영업부장'].forEach(function (role) {
    const it = find(ALL_ON, { role: role }, nav.PREP_ID);
    assert.ok(it, role);
    assert.strictEqual(nav.badgeOf(it), '');
    assert.strictEqual(it.label, '제안서 사전준비 프로세스');
  });
  assert.strictEqual(find(ALL_ON, { role: '디자이너' }, nav.PREP_ID), null);
  assert.strictEqual(find(ALL_ON, { role: '영업팀', master: true }, nav.PREP_ID), null);
  ['전산팀', '전산팀장', '예산팀', '예산팀장', ''].forEach(function (role) {
    assert.strictEqual(find(ALL_ON, { role: role }, nav.PREP_ID), null, role);
  });
});

test('nav 노출(입찰 현황판): 고정 id soon:현황판, 서버 map 키가 켜진 사람 전원에게 보이고 배지 없음, 기관 소분류 맨 앞', function () {
  assert.strictEqual(nav.DASH_ID, 'soon:현황판');
  ['영업팀', '영업팀장', '영업부장', '디자이너', '전산팀', '예산팀', '예산팀장', ''].forEach(function (role) {
    const it = find(ALL_ON, { role: role }, nav.DASH_ID);
    assert.ok(it, role || '(역할 없음)');
    assert.strictEqual(nav.badgeOf(it), '');
    assert.strictEqual(it.label, '입찰 현황판');
    assert.strictEqual(it.sub, '기관');
  });
  assert.ok(find(ALL_ON, { role: '영업팀', master: true }, nav.DASH_ID));
  // map 키가 꺼지면 사라진다(권한은 서버가 정한다)
  assert.strictEqual(find(Object.assign({}, ALL_ON, { map: false }), { role: '영업팀' }, nav.DASH_ID), null);
  // 기관 소분류의 맨 앞(구현 항목 전국 지도보다 앞)
  const scan = nav.build(ALL_ON, { role: '영업팀' }).filter(function (c) { return c.id === 'scan'; })[0].items;
  assert.strictEqual(scan[0].id, nav.DASH_ID);
  assert.strictEqual(scan[0].front, true);
  assert.strictEqual(scan[1].id, 'map');
  // 접근 이력은 기록하지 않는다(서버 메뉴 키 꼴이 아니다)
  assert.strictEqual(nav.screenName(nav.DASH_ID, 'soon:이사회 자료'), null);
});

test('nav.homeItemId(첫 화면): 영업 계열 + 지도만 본 상태 + 현황판이 보일 때만 현황판, 그 밖은 null(지금처럼 지도)', function () {
  function home(role, o) {
    const x = o || {};
    const built = nav.build(x.visible || ALL_ON, { role: role, master: !!x.master });
    return nav.homeItemId(built, x.active === undefined ? 'map' : x.active, x.tabs || [{ id: 'map', label: '전국 지도' }], { role: role, master: !!x.master });
  }
  ['영업팀', '영업팀장', '영업부장'].forEach(function (r) { assert.strictEqual(home(r), nav.DASH_ID, r); });
  assert.strictEqual(home('영업팀', { active: null, tabs: [] }), nav.DASH_ID);
  // 디자이너·마스터·타 팀은 지금처럼 지도
  ['디자이너', '전산팀', '전산팀장', '예산팀', '예산팀장', ''].forEach(function (r) { assert.strictEqual(home(r), null, r); });
  assert.strictEqual(home('영업팀', { master: true }), null);
  // 이미 다른 화면을 열었거나 탭을 연 뒤라면 건드리지 않는다
  assert.strictEqual(home('영업팀', { active: 'workflow' }), null);
  assert.strictEqual(home('영업팀', { tabs: [{ id: 'map' }, { id: 'approvals' }] }), null);
  // 현황판이 안 보이는 구성(map 키 꺼짐)이면 null
  assert.strictEqual(home('영업팀', { visible: Object.assign({}, ALL_ON, { map: false }), active: null, tabs: [] }), null);
  assert.strictEqual(nav.isHomeRole({ role: '영업부장' }), true);
  assert.strictEqual(nav.isHomeRole({ role: '디자이너' }), false);
  assert.strictEqual(nav.isHomeRole({ role: '영업팀', master: true }), false);
});

test('app.js: showSoon이 사전준비·현황판 분기를 처리하고, 첫 화면 기본값·경과 팝업 억제·계정 변경 처리가 있다', function () {
  assert.ok(APP_SRC.indexOf('itemId === root.prep.SOON_ID') > 0);
  assert.ok(APP_SRC.indexOf('root.prep.mount()') > 0);
  assert.ok(APP_SRC.indexOf("document.getElementById('pp-root').style.display") > 0);
  assert.ok(APP_SRC.indexOf('itemId === root.nav.DASH_ID') > 0);
  assert.ok(APP_SRC.indexOf('root.dashboard.mount(dashEl)') > 0);
  assert.ok(APP_SRC.indexOf('입찰 현황판은 준비 중입니다.') > 0);
  assert.ok(APP_SRC.indexOf('root.prep.onProfileChange()') > 0);
  assert.ok(/app\.openNavItem = function \(id\)/.test(APP_SRC));
  // ① 첫 화면: enterApp·세션이 있는 채로 연 첫 그림에서 켜고, paintTabs 끝에서 한 번 적용한다
  assert.ok(/app\.enterApp = function \(session, profile\) \{\s*pendingHome = true;/.test(APP_SRC));
  assert.ok(APP_SRC.indexOf('root.nav.homeItemId(navBuilt, navActiveId, navTabs, navContext())') > 0);
  assert.ok(/applyHome\(\);\s*\};/.test(APP_SRC));
  // ② 첫 화면이 현황판이면(영업 계열 + 본체 있음) 경과 요약 팝업을 부르지 않는다
  // 현황판이 열릴 것으로 보면 팝업을 미루고(overduePending), 실제로 안 열리면 applyHome이 그때 띄운다(flushOverdue)
  assert.ok(/root\.nav\.expectsDashHome\(args\.ctx, !!\(root\.dashboard && root\.dashboard\.mount\)\)/.test(APP_SRC));
  assert.ok(/if \(!deferOverdue && root\.overdue && root\.overdue\.onLogin\)/.test(APP_SRC));
  // 홈 자동 열림은 navHoming 표시를 켜고 연다(사이드바 저장값을 덮어쓰지 않게 — nav.navigatedOpen auto)
  assert.ok(/if \(item\) \{ overduePending = null; navHoming = true; try \{ openNavItem\(item\); \} finally \{ navHoming = false; \} \} else flushOverdue\(\);/.test(APP_SRC));
  assert.ok(/overduePending = deferOverdue \? args : null;\s*app\.onProfileChanged\(\);/.test(APP_SRC));
  // 공용 모달 닫기에서 #pp-modal은 제외(prep.js가 requestClose로 처리)
  assert.ok(/ov\.id !== 'tm-modal' && ov\.id !== 'pp-modal'/.test(APP_SRC));
});

test('index.html: #pp-root 마크업·#dash-root 한 줄·#popover 속성·script 순서·CSS 규칙(새 hex·11px 미만·채운 주버튼 금지)', function () {
  ['pp-root', 'pp-gate', 'pp-wrap', 'pp-list', 'pp-tabs', 'pp-count', 'pp-q', 'pp-items', 'pp-pane', 'pp-flash', 'pp-perr', 'pp-case', 'pp-modal'].forEach(function (id) {
    assert.ok(HTML.indexOf('id="' + id + '"') > 0, id);
  });
  assert.ok(/<div id="pp-root" style="display:none;">/.test(HTML));
  assert.ok(/id="pp-flash" class="ad-flash" role="status"/.test(HTML) && /id="pp-perr" class="ap-err" role="alert"/.test(HTML));
  assert.ok(/<section id="pp-case" aria-labelledby="pp-case-title" aria-busy="false">/.test(HTML));
  assert.ok(/role="tablist"/.test(HTML.slice(HTML.indexOf('id="pp-tabs"') - 40, HTML.indexOf('id="pp-tabs"') + 80)));
  assert.ok(/<div id="dash-root" style="display:none;"><\/div>/.test(HTML));
  assert.strictEqual(HTML.split('id="dash-root"').length, 2);
  assert.ok(/<div id="popover" role="dialog" aria-labelledby="pop-title" style="display:none;"><\/div>/.test(HTML));
  assert.ok(/#popover \{[^}]*background:rgba\(24,30,41,\.92\)/.test(HTML));
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('prep.js') > at('team.js') && at('prep.js') < at('app.js') && at('prep.js') < at('render.js'));
  const a = HTML.indexOf('/* 제안서 사전준비 시작'), b = HTML.indexOf('/* 제안서 사전준비 끝 */');
  assert.ok(a > 0 && b > a);
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '새 hex 금지(토큰만)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 11, m); });
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  assert.ok(/\.pp-danger \{ color:var\(--red\); border-color:var\(--red\); background:var\(--panel2\); \}/.test(css));
  assert.ok(/\.pp-next-btn \{ border-color:var\(--accent-color\); \}/.test(css));
  assert.ok(/#pp-list \{ width:278px/.test(css));
  assert.ok(/@media \(max-width:880px\)[\s\S]*#pp-wrap \{ flex-direction:column/.test(css));
});

test('소스 규칙: confirm() 없음, 외부 주소 없음, 새 hex 없음, "검증됨" 없음, 서버 오류 문구를 innerHTML로 넣지 않음', function () {
  [SRC, RENDER_SRC].forEach(function (s) {
    assert.ok(!/\bconfirm\(/.test(s));
    assert.ok(!/https?:\/\//.test(s));
  });
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC));
  assert.ok(SRC.indexOf('검증됨') < 0);
  assert.ok(!/innerHTML\s*=\s*[^;]*\be\.(message|detail)/.test(SRC));
  assert.ok(/tm-modal'/.test(APP_SRC));   // 기존 team 모달 예외가 그대로 남아 있다
});

// ── 단계 막대 7개 상태 ──
function statuses(cd, extra, history) {
  return prep.stepModel(Object.assign({ state_cd: cd, progress: { done: 2, total: 4 } }, extra || {}), history).map(function (s) { return s.status; });
}
test('stepModel: 7개 상태 표(규격 §6-A)', function () {
  assert.deepStrictEqual(statuses('CONFIRMED'), ['done', 'current', 'todo', 'todo', 'todo']);
  assert.deepStrictEqual(statuses('OPEN_PENDING'), ['done', 'gate', 'todo', 'todo', 'todo']);
  assert.deepStrictEqual(statuses('IN_PROGRESS'), ['done', 'done', 'current', 'todo', 'todo']);
  assert.deepStrictEqual(statuses('APPROVAL_PENDING'), ['done', 'done', 'done', 'gate', 'todo']);
  assert.deepStrictEqual(statuses('WRITABLE'), ['done', 'done', 'done', 'done', 'current']);
  assert.deepStrictEqual(statuses('WRITING'), ['done', 'done', 'done', 'done', 'done']);
  assert.deepStrictEqual(statuses('CANCELLED'), ['done', 'todo', 'todo', 'todo', 'todo']);
  // 취소·중단: 도달한 칸까지 done
  assert.deepStrictEqual(statuses('CANCELLED', {}, [{ event_cd: 'CANCEL', from_state: 'WRITABLE', logged_at: '2026-11-11T10:00:00+09:00' }]),
    ['done', 'done', 'done', 'done', 'todo']);
  const s = prep.stepModel({ state_cd: 'IN_PROGRESS', progress: { done: 2, total: 4 } });
  assert.strictEqual(s[2].count, '2/4');
  assert.strictEqual(s[1].sub, '영업팀장');
  assert.strictEqual(s[3].sub, '영업부장');
  assert.strictEqual(prep.stepModel({ state_cd: 'OPEN_PENDING' })[1].gate, '승인 대기');
  assert.strictEqual(prep.stepModel({ state_cd: 'WRITING' })[4].note, '작성 중');
  assert.strictEqual(prep.stepModel({ state_cd: 'IN_PROGRESS' })[2].sr, '현재 단계');
  assert.ok(/aria-current="step"/.test(prep.stepsHtml(prep.stepModel({ state_cd: 'IN_PROGRESS' }))));
});

// ── 과제 5개 상태 ──
const TASKS = [
  { task_cd: 'T1', name: '기관 정보 요약', kind_cd: 'REQUIRED', judge_cd: 'MANUAL', state: 'DONE', done_by: { emp_no: '1', name: '김영업' }, done_at: '2026-11-10T15:20:00+09:00', can_check: false, can_uncheck: true },
  { task_cd: 'T2', name: '기관장 프로필', kind_cd: 'REQUIRED', judge_cd: 'MANUAL', state: 'TODO', can_check: true, can_uncheck: false },
  { task_cd: 'T3', name: '수익성 분석표 확정본', kind_cd: 'REQUIRED', judge_cd: 'FACT', state: 'TODO', can_check: false },
  { task_cd: 'T4', name: 'RFP 붙임서류', kind_cd: 'CONDITIONAL', judge_cd: 'FACT', state: 'NOT_APPLICABLE' },
  { task_cd: 'T5', name: '이사회 자료', kind_cd: 'REQUIRED', judge_cd: 'FACT', state: 'LOCKED', locked_by: 'T3' },
  { task_cd: 'T6', name: '이사회 발표 대본', kind_cd: 'OPTIONAL', judge_cd: 'MANUAL', state: 'PREPARING' },
];
test('taskModel: DONE·TODO(수동·자동)·LOCKED·NOT_APPLICABLE·PREPARING', function () {
  const by = prep.tasksByCd(TASKS);
  const vw = { is_assignee: true };
  const m = TASKS.map(function (t, i) { return prep.taskModel(t, by, vw, i); });
  // DONE
  assert.strictEqual(m[0].glyph, 'done');
  assert.strictEqual(m[0].sub, '완료 · 김영업 11-10 15:20');
  assert.strictEqual(m[0].act, 'uncheck');
  assert.strictEqual(m[0].counts, true);
  assert.strictEqual(m[0].kindText, '필수');
  // TODO 수동: 완료로 표시
  assert.strictEqual(m[1].glyph, 'todo');
  assert.strictEqual(m[1].act, 'check');
  assert.ok(m[1].sub.indexOf('[완료로 표시]') >= 0 && m[1].sub.indexOf('작성 화면은 준비 중입니다') >= 0);
  // TODO 자동(FACT): 과제별 완료 조건, 서버 done_rule이 오면 그것
  assert.strictEqual(m[2].sub, '수익성 분석표를 올리고 확정본으로 지정하면 완료됩니다.');
  assert.strictEqual(m[2].kindText, '필수 · 자동 완료');
  assert.strictEqual(m[2].act, '');
  assert.strictEqual(prep.taskModel(Object.assign({}, TASKS[2], { done_rule: '서버 문구' }), by, vw, 2).sub, '서버 문구');
  // NOT_APPLICABLE: 진척에서 빠진다
  assert.strictEqual(m[3].glyph, 'na');
  assert.strictEqual(m[3].counts, false);
  assert.strictEqual(m[3].sub, '해당 없음 — RFP가 등록되지 않은 기관입니다.');
  // LOCKED: 선행 과제 이름
  assert.strictEqual(m[4].glyph, 'lock');
  assert.strictEqual(m[4].sub, '\'수익성 분석표 확정본\'이 끝나야 열립니다.');
  assert.strictEqual(m[4].act, '');
  // PREPARING: 글리프 없음, 진척 제외, 준비중 배지
  assert.strictEqual(m[5].preparing, true);
  assert.strictEqual(m[5].counts, false);
  assert.strictEqual(m[5].glyph, '');
  assert.strictEqual(m[5].sub, '');
  assert.strictEqual(m[5].no, 6);
  // 시스템 판정으로 끝난 건(done_by 없음)
  assert.strictEqual(prep.taskModel({ task_cd: 'T3', name: 'x', state: 'DONE', judge_cd: 'FACT', done_by: null }, by, vw, 0).sub, '완료 · 자동 확인');
  // 담당자가 아닌 열람자: 카드마다 '담당자만…'을 반복하지 않는다
  assert.strictEqual(prep.taskModel(TASKS[1], by, { is_assignee: false }, 1).sub.indexOf('담당자만'), -1);
  // 서버의 내부 용어 문구는 업무 언어로
  // 서버가 준 꺼진 이유는 그대로 쓴다(서버가 업무 언어로 정리함)
  assert.strictEqual(prep.taskModel({ task_cd: 'T9', name: 'z', state: 'TODO', judge_cd: 'MANUAL', can_check: false, disabled_reason: '지금 상태에서는 변경할 수 없습니다.' }, by, vw, 0).sub, '지금 상태에서는 변경할 수 없습니다.');
});

test('missingNames·nextLine: 필수·조건부 중 끝나지 않은 것만(준비중·해당 없음 제외)', function () {
  const v = { state_cd: 'IN_PROGRESS', tasks: TASKS };
  assert.deepStrictEqual(prep.missingNames(v), ['기관장 프로필', '수익성 분석표 확정본', '이사회 자료']);
  assert.strictEqual(prep.nextLine(v), '남은 필수 과제: 기관장 프로필, 수익성 분석표 확정본, 이사회 자료');
  assert.ok(prep.nextLine({ state_cd: 'IN_PROGRESS', tasks: [] }).indexOf('사전준비 승인 요청') >= 0);
  assert.ok(prep.nextLine({ state_cd: 'CONFIRMED' }).indexOf('개설 신청') >= 0);
});

// ── 오류 문구 ──
test('errorInfo: 코드별 문구·후속 동작, NOT_READY 이름 치환, BAD_VALUE에서 내부 값 이름 비노출', function () {
  const e = function (status, detail, tasks, where) { return prep.errorInfo(status, detail, tasks, where); };
  assert.ok(e(409, { code: 'PREP_ALREADY_ACTIVE', message: 'x' }).text.indexOf('[사전준비 열기]') > 0);
  assert.strictEqual(e(409, { code: 'PREP_ALREADY_ACTIVE' }).after, 'keep');
  assert.strictEqual(e(409, { code: 'PREP_ABORTED' }).after, 'keep');
  assert.strictEqual(e(409, { code: 'PLAN_PENDING' }).after, 'closeReload');
  assert.strictEqual(e(409, { code: 'STATE_CHANGED' }).after, 'closeReload');
  assert.strictEqual(e(409, { code: 'NOT_MANUAL' }).after, 'reload');
  assert.strictEqual(e(409, { code: 'ATTACH_IN_USE' }).text, '확정본으로 지정한 파일은 무효 처리할 수 없습니다. 먼저 [확정본 해제]를 하세요.');
  // OPEN_PENDING은 어디서 났는지에 따라 문구가 다르다
  assert.ok(e(409, { code: 'OPEN_PENDING' }, [], 'unconfirm').text.indexOf('먼저 회수하세요') > 0);
  assert.ok(e(409, { code: 'OPEN_PENDING' }, [], 'open').text.indexOf('이미 올라가 있습니다') > 0);
  assert.strictEqual(e(409, { code: 'OPEN_PENDING' }, [], 'open').after, 'closeReload');
  // NOT_READY: missing 코드를 지금 과제 이름으로
  const nr = e(409, { code: 'NOT_READY', message: '필수 과제가 모두 끝나지 않았습니다.', missing: ['T2', 'T3'] }, TASKS);
  assert.strictEqual(nr.text, '아직 끝나지 않은 필수 과제가 있습니다: 기관장 프로필, 수익성 분석표 확정본.');
  assert.strictEqual(nr.after, 'reload');
  assert.ok(nr.text.indexOf('T2') < 0);
  // BAD_VALUE: task_cd 같은 내부 값 이름은 보이지 않는다
  const bv = e(400, { code: 'BAD_VALUE', message: 'task_cd 는 T3 또는 T4 여야 합니다.' });
  assert.ok(bv.text.indexOf('task_cd') < 0 && bv.text.indexOf('T3') < 0);
  assert.strictEqual(bv.text, '처리하지 못했습니다. 화면을 새로 고친 뒤 다시 하세요.');
  assert.strictEqual(e(400, { code: 'BAD_VALUE', message: '파일 이름이 너무 깁니다.' }).text, '파일 이름이 너무 깁니다.');
  // 올리기 오류
  const pb = e(422, { code: 'PII_BLOCKED', kinds: ['주민등록번호 2'] });
  assert.ok(pb.text.indexOf('(찾은 것: 주민등록번호 2)') > 0 && pb.after === 'keep');
  assert.strictEqual(e(413, { code: 'FILE_TOO_LARGE', max_mb: 30 }).text, '파일이 30MB를 넘어 올리지 않았습니다. 30MB 이하로 나눠 올리세요.');
  assert.strictEqual(e(422, { code: 'FILE_REJECTED', message: '암호가 걸린 PDF는 올릴 수 없습니다.' }).text, '암호가 걸린 PDF는 올릴 수 없습니다.');
  // 상태별 폴백
  assert.strictEqual(e(0, null).text, prep.T.network);
  assert.strictEqual(e(401, null).after, 'keep');
  assert.strictEqual(e(422, { message: 'x' }).after, 'reason');
  // 404: 상세 조회에만 열람 문구, 쓰기 동작의 404는 일반 문구(+목록 다시 불러오기)
  assert.strictEqual(e(404, null, [], 'view').after, 'none');
  assert.ok(e(404, null, [], 'view').text.indexOf('영업팀장·영업부장은 모든 건') > 0);
  assert.strictEqual(e(404, null, [], 'check').text, prep.T.notFound);
  assert.strictEqual(e(404, null, [], 'check').after, 'reload');
  assert.ok(e(404, null).text.indexOf('볼 수 없습니다') < 0);
  assert.strictEqual(e(403, { message: '이 입찰 건의 담당자만 할 수 있습니다.' }).text, '이 입찰 건의 담당자만 할 수 있습니다.');
  assert.strictEqual(e(403, { message: 'x' }).after, 'reload');
  assert.strictEqual(e(400, { message: '사유는 1~200자여야 합니다.' }).after, 'reason');
});

// ── 파일 동작 행렬 ──
test('attachActions: 올린 본인·남 × 확정본·아님 × 담당자 여부 × 무효', function () {
  const ME = '1000001';
  const mine = { attach_id: 1, valid: true, confirmed: false, uploaded_by: { emp_no: ME, name: '나' } };
  const other = { attach_id: 2, valid: true, confirmed: false, uploaded_by: { emp_no: '2000002', name: '남' } };
  const asg = { is_assignee: true };
  const non = { is_assignee: false, is_head: true };
  assert.deepStrictEqual(prep.attachActions(mine, asg, ME), { download: true, setConfirmed: true, clearConfirmed: false, voidIt: true });
  assert.deepStrictEqual(prep.attachActions(other, asg, ME), { download: true, setConfirmed: true, clearConfirmed: false, voidIt: false });
  // 확정본 행: 해제만, 무효 처리는 그리지 않는다(ATTACH_IN_USE 미리 막음)
  assert.deepStrictEqual(prep.attachActions(Object.assign({}, mine, { confirmed: true }), asg, ME),
    { download: true, setConfirmed: false, clearConfirmed: true, voidIt: false });
  // 담당자가 아닌 열람자(영업부장): 내려받기만
  assert.deepStrictEqual(prep.attachActions(other, non, ME), { download: true, setConfirmed: false, clearConfirmed: false, voidIt: false });
  // 무효 행: 동작 없음
  assert.deepStrictEqual(prep.attachActions(Object.assign({}, mine, { valid: false }), asg, ME),
    { download: false, setConfirmed: false, clearConfirmed: false, voidIt: false });
  assert.strictEqual(prep.attachActions(mine, asg, '').voidIt, false);
  // 영업팀장(담당자 아님): 내려받기 + 남이 올린 파일도 무효 처리 가능, 확정본 지정은 못 함
  assert.deepStrictEqual(prep.attachActions(other, { is_assignee: false }, ME, '영업팀장'),
    { download: true, setConfirmed: false, clearConfirmed: false, voidIt: true });
  assert.strictEqual(prep.attachActions(Object.assign({}, other, { confirmed: true }), { is_assignee: false }, ME, '영업팀장').voidIt, false);
  // 올린 본인이어도 활성 담당자가 아니면 무효 처리 못 함
  assert.strictEqual(prep.attachActions(mine, { is_assignee: false }, ME, '영업팀').voidIt, false);
});

test('지난 개설 신청 요약 한 줄·이력 사유 null 생략', function () {
  const base = { state_cd: 'CONFIRMED', tasks: [], open_request: null, viewer: {} };
  assert.strictEqual(prep.pastOpenLine(Object.assign({ past_open_requests: { count: 2, last_status: 'REJECTED' } }, base)), '지난 개설 신청 2건 · 마지막 반려됨');
  assert.strictEqual(prep.pastOpenLine(Object.assign({ past_open_requests: { count: 1, last_status: 'WITHDRAWN' } }, base)), '지난 개설 신청 1건 · 마지막 회수됨');
  assert.strictEqual(prep.pastOpenLine(Object.assign({ past_open_requests: null }, base)), '');
  // 처리 중(PENDING) 신청이 있으면 그것이 우선이라 요약 줄 없음
  assert.strictEqual(prep.pastOpenLine(Object.assign({}, base, { open_request: { req_id: 1, status: 'PENDING' }, past_open_requests: { count: 1, last_status: 'REJECTED' } })), '');
  // 끝난 신청(REJECTED·CANCELLED·APPROVED)이 보이는 권한자에게도 요약 줄
  ['REJECTED', 'CANCELLED', 'APPROVED'].forEach(function (s) {
    assert.strictEqual(prep.pastOpenLine(Object.assign({}, base, { open_request: { req_id: 1, status: s }, past_open_requests: { count: 1, last_status: 'REJECTED' } })),
      '지난 개설 신청 1건 · 마지막 반려됨', s);
  });
  // CONFIRMED 끝 노드: 끝난 신청의 지명자·의견을 참고로 그리고, PENDING이면 그리지 않는다
  const rej = viewOf('CONFIRMED', { tasks: [], viewer: { can_request_open: true },
    open_request: { req_id: 3, status: 'REJECTED', nominees: [{ name: '김영업', position: '대리' }], comment: '다시' },
    past_open_requests: { count: 1, last_status: 'REJECTED' } });
  const rh = caseOf(rej);
  assert.ok(rh.indexOf('지난 개설 신청 1건 · 마지막 반려됨') > 0 && rh.indexOf('지명: 김영업(대리)') > 0 && rh.indexOf('의견: 다시') > 0);
  assert.strictEqual(caseOf(viewOf('CONFIRMED', { tasks: [], viewer: {}, open_request: { req_id: 3, status: 'PENDING', nominees: [{ name: '김영업' }] } })).indexOf('지명:'), -1);
  assert.ok(caseOf(viewOf('CONFIRMED', { tasks: [], past_open_requests: { count: 2, last_status: 'REJECTED' } })).indexOf('지난 개설 신청 2건 · 마지막 반려됨') > 0);
  const cx = caseOf(viewOf('CANCELLED', { state_name: '확정 취소', tasks: [], viewer: {} }),
    { history: [{ event_cd: 'UNCONFIRM', from_state: 'CONFIRMED', reason: null, logged_at: '2026-11-11T10:00:00+09:00' }] });
  assert.strictEqual(cx.indexOf('사유'), -1);
});

test('QA·디자인 후속: 중단 건 무효 처리 불가, T3 파일만, 확인 줄 라벨, 회수 중 버튼, 확정 확인 순서, 현황판 첫 화면 판정', function () {
  const ME = '1000001';
  const mine = { attach_id: 1, valid: true, confirmed: false, uploaded_by: { emp_no: ME } };
  assert.strictEqual(prep.attachActions(mine, { is_assignee: true }, ME, '영업팀', 'IN_PROGRESS').voidIt, true);
  const ended = prep.attachActions(mine, { is_assignee: true }, ME, '영업팀장', 'CANCELLED');
  assert.deepStrictEqual([ended.download, ended.voidIt], [true, false]);   // 내려받기는 유지
  const h = prep.filesHtml({ rows: [{ attach_id: 1, task_cd: 'T3', name: 'a.xlsx', valid: true }, { attach_id: 2, task_cd: 'T4', name: 'rfp.pdf', valid: true }],
    viewer: {}, meEmp: ME });
  assert.ok(h.indexOf('a.xlsx') > 0 && h.indexOf('rfp.pdf') < 0);
  assert.ok(prep.confirmHtml('x', 'a', 'b', 'ok', 'no', '', '완료 취소 확인').indexOf('aria-label="완료 취소 확인"') > 0);
  assert.ok(caseOf(viewOf('IN_PROGRESS', { viewer: { is_assignee: true, can_request_plan_approval: true } }), { confirm: { kind: 'plan' } }).indexOf('aria-label="사전준비 승인 요청 확인"') > 0);
  assert.ok(caseOf(viewOf('WRITABLE', { viewer: { is_assignee: true, can_start_writing: true } }), { confirm: { kind: 'start' } }).indexOf('aria-label="제안서 작성 시작 확인"') > 0);
  assert.ok(caseOf(viewOf('WRITABLE'), { confirm: { kind: 'uncheck', task: 'T1' } }).indexOf('aria-label="완료 취소 확인"') > 0);
  assert.ok(prep.closeConfirmHtml().indexOf('aria-label="닫기 확인"') > 0);
  assert.strictEqual(prep.T.okWithdraw, '개설 신청을 회수했습니다. 담당자를 다시 지명해 [개설 신청]을 올릴 수 있습니다.');
  const op = { tasks: [], open_request: { req_id: 7, status: 'PENDING' }, viewer: { can_withdraw_open: true } };
  const w0 = prep.caseHtml({ view: viewOf('OPEN_PENDING', op), history: [], role: '영업팀', meEmp: '1' });
  assert.ok(w0.indexOf('신청 회수') > 0 && w0.indexOf('회수하는 중') < 0);
  const w1 = prep.caseHtml({ view: viewOf('OPEN_PENDING', op), history: [], role: '영업팀', meEmp: '1', withdrawing: true });
  assert.ok(w1.indexOf('회수하는 중…') > 0 && /data-act="withdraw"[^>]*aria-disabled="true"/.test(w1));
  // 확정 확인 줄: [취소] 다음 [확정하기](첫 포커스는 확정하기 유지 — 소스에서 go에 focus)
  const pc = prep.popConfirmHtml('노원구청');
  assert.ok(pc.indexOf('data-pp-pop="cancel"') < pc.indexOf('data-pp-pop="go"'));
  assert.ok(/popClick[\s\S]*querySelector\('\[data-pp-pop="go"\]'\); if \(go\) go\.focus\(\)/.test(SRC));
  // 첫 화면 판정(순수): 본체가 있고 영업 계열일 때만 현황판을 기대, 실제 결정은 homeItemId
  assert.strictEqual(nav.expectsDashHome({ role: '영업팀' }, true), true);
  assert.strictEqual(nav.expectsDashHome({ role: '영업팀' }, false), false);
  assert.strictEqual(nav.expectsDashHome({ role: '디자이너' }, true), false);
  assert.strictEqual(nav.expectsDashHome({ role: '영업팀', master: true }, true), false);
  const noMap = nav.build(Object.assign({}, ALL_ON, { map: false }), { role: '영업팀' });
  assert.strictEqual(nav.homeItemId(noMap, 'map', [], { role: '영업팀' }), null);   // map 키가 없으면 열리지 않음 → 경과 팝업을 그때 띄운다
  // 팝오버 Esc·높이
  assert.ok(/modalOpen/.test(RENDER_SRC) && /rank-card\.hi/.test(RENDER_SRC) && /pop\.offsetHeight/.test(RENDER_SRC));
  assert.ok(/#popover \{[^}]*max-height:calc\(100vh - 16px\); overflow:auto; overscroll-behavior:contain/.test(HTML));
});

test('소스: 첨부·지도 확정은 PrepUiIds 허용값을 보낸다', function () {
  ['map_popover', 'attach_upload', 'attach_download', 'attach_void', 't3_set', 't3_clear'].forEach(function (id) {
    assert.ok(SRC.indexOf("'" + id + "'") > 0, id);
  });
  assert.ok(SRC.indexOf("ui('map_popover', 'confirm')") > 0);
  assert.ok(SRC.indexOf('NAME_FIX') < 0);
});

test('filesHtml: 검사 칸·확정본 배지·무효 파일 접기·빈 상태·올리는 중', function () {
  const ME = '1000001';
  const rows = [
    { attach_id: 1, name: '수익성_v3.xlsx', size_bytes: 1500000, valid: true, confirmed: true, pii_state: 'CHECKED', pii_note: '이메일 2', uploaded_by: { emp_no: ME, name: '김영업' }, uploaded_at: '2026-11-11T09:02:00+09:00', emp_verified: false },
    { attach_id: 2, name: '스캔.pdf', size_bytes: 900, valid: true, confirmed: false, pii_state: 'UNCHECKED', uploaded_by: { emp_no: '2', name: '배지아' }, uploaded_at: '2026-11-11T09:10:00+09:00', emp_verified: true },
    { attach_id: 3, name: '옛본.xlsx', valid: false, voided_by: { name: '김영업' }, voided_at: '2026-11-11T08:00:00+09:00' },
  ];
  const h = prep.filesHtml({ rows: rows, viewer: { is_assignee: true, can_upload: true }, meEmp: ME, uploading: false, showVoid: false });
  assert.ok(h.indexOf('개인정보 경고: 이메일 2') > 0);
  assert.ok(h.indexOf('검사 못 함') > 0 && h.indexOf('스캔 PDF') > 0);
  assert.ok(h.indexOf('확정본</span>') > 0);
  assert.ok(h.indexOf('자기신고') > 0);
  assert.ok(h.indexOf('무효 처리한 파일 1개 보기') > 0 && h.indexOf('옛본.xlsx') < 0);
  assert.ok(h.indexOf('data-act="upload"') > 0 && h.indexOf('1.4MB') > 0);
  // 확정본 행에는 [무효 처리]가 없고, 다른 행에는 올린 본인이 아니므로 없다
  assert.strictEqual((h.match(/data-act="void-open"/g) || []).length, 0);
  assert.ok(prep.filesHtml({ rows: rows, viewer: { is_assignee: true }, meEmp: ME, showVoid: true }).indexOf('무효 · 김영업') > 0);
  assert.ok(prep.filesHtml({ rows: [], viewer: {}, meEmp: ME }).indexOf('아직 올린 파일이 없습니다') > 0);
  assert.strictEqual(prep.filesHtml({ rows: [], viewer: { can_upload: false }, meEmp: ME }).indexOf('data-act="upload"'), -1);
  const up = prep.filesHtml({ rows: [], viewer: { can_upload: true }, meEmp: ME, uploading: true });
  assert.ok(up.indexOf('aria-disabled="true"') > 0 && up.indexOf('올리는 중…') > 0 && up.indexOf('role="status"') > 0);
});

test('uploadOkText: 개인정보 경고가 있으면 종류·건수와 안내를 덧붙인다', function () {
  assert.strictEqual(prep.uploadOkText('a.xlsx', { pii: { warnings: [] } }), '\'a.xlsx\'을 올렸습니다.');
  const t = prep.uploadOkText('a.xlsx', { pii: { warnings: ['이메일 2', '전화번호 1'] } });
  assert.ok(t.indexOf('이메일 2건·전화번호 1건이 들어 있습니다.') > 0 && t.indexOf('무효 처리하세요') > 0);
});

// ── 지도 팝오버·현황판 공용 ──
test('popoverAction: 역할 × 활성 건 × 서버 모드 × 계정 × institutionId × 조회 실패', function () {
  const rec = { name: '노원구청', institutionId: 'I1' };
  const base = { serverMode: true, account: true, master: false, role: '영업팀' };
  const act = [{ institution_id: 'I1', state_cd: 'IN_PROGRESS', bid_case_id: 'B1' }];
  const kind = function (r, c, a) { return prep.popoverAction(r, Object.assign({}, base, c), a).kind; };
  // 활성 건 없음: 영업팀·영업팀장만 제안 확정
  assert.strictEqual(kind(rec, {}, []), 'confirm');
  assert.strictEqual(kind(rec, { role: '영업팀장' }, []), 'confirm');
  assert.strictEqual(kind(rec, { role: '영업부장' }, []), 'none');
  ['디자이너', '전산팀', '예산팀', ''].forEach(function (r) { assert.strictEqual(kind(rec, { role: r }, []), 'none', r); });
  // 활성 건 있음: 영업팀·영업팀장·영업부장 모두 사전준비 열기
  ['영업팀', '영업팀장', '영업부장'].forEach(function (r) {
    const x = prep.popoverAction(rec, Object.assign({}, base, { role: r }), act);
    assert.strictEqual(x.kind, 'open', r);
    assert.strictEqual(x.bid, 'B1');
  });
  ['디자이너', '전산팀'].forEach(function (r) { assert.strictEqual(kind(rec, { role: r }, act), 'none', r); });
  // 취소·중단된 건은 활성이 아니다 → 다시 제안 확정
  assert.strictEqual(kind(rec, {}, [{ institution_id: 'I1', state_cd: 'CANCELLED', bid_case_id: 'B0' }]), 'confirm');
  // 다른 기관의 활성 건은 상관없다
  assert.strictEqual(kind(rec, {}, [{ institution_id: 'I9', state_cd: 'IN_PROGRESS', bid_case_id: 'B9' }]), 'confirm');
  // 조회 실패(null): 제안 확정을 보이고 서버가 바로잡는다
  assert.strictEqual(kind(rec, {}, null), 'confirm');
  assert.strictEqual(kind(rec, { role: '영업부장' }, null), 'none');
  // 서버 모드 아님·계정 로그인 아님·마스터·institutionId 없음 → 버튼 없음
  assert.strictEqual(kind(rec, { serverMode: false }, []), 'none');
  assert.strictEqual(kind(rec, { account: false }, []), 'none');
  assert.strictEqual(kind(rec, { master: true }, []), 'none');
  assert.strictEqual(kind({ name: 'x' }, {}, []), 'none');
  assert.strictEqual(kind(null, {}, []), 'none');
  assert.strictEqual(prep.popoverAction(rec, undefined, []).kind, 'none');
});

test('입찰 현황판(dashboard.js)이 기대하는 root.prep 계약: popoverAction·SOON_ID·openCase·ERR_BY_CODE·popConfirmHtml', function () {
  assert.strictEqual(typeof prep.popoverAction, 'function');
  assert.strictEqual(prep.SOON_ID, 'soon:사전준비');
  assert.strictEqual(typeof prep.openCase, 'function');
  assert.ok(prep.ERR_BY_CODE && typeof prep.ERR_BY_CODE === 'object' && prep.ERR_BY_CODE.PREP_ALREADY_ACTIVE.text);
  assert.strictEqual(typeof prep.popConfirmHtml, 'function');
  assert.strictEqual(typeof prep.errorInfo, 'function');
  assert.strictEqual(typeof prep.decoratePopover, 'function');
  // 반환은 { kind: 'none'|'confirm'|'open', bid } — 'open'(열기)·'confirm'(확정) 글자를 그대로 쓴다
  const r = prep.popoverAction({ institutionId: 'I1' }, { serverMode: true, account: true, role: '영업팀' }, []);
  assert.deepStrictEqual(r, { kind: 'confirm', bid: '' });
  assert.strictEqual(prep.popoverAction({ institutionId: 'I1' }, { serverMode: true, account: true, role: '영업부장' }, [{ institution_id: 'I1', state_cd: 'WRITING', bid_case_id: 'B5' }]).kind, 'open');
});

test('popConfirmHtml: 확인 줄 문구와 조사, 기관명 이스케이프', function () {
  const h = prep.popConfirmHtml('노원구청');
  assert.ok(h.indexOf('노원구청을 제안 대상으로 확정합니다.') > 0);
  assert.ok(h.indexOf('[영업 추진 준비 › 제안서 사전준비 프로세스]') > 0);
  assert.ok(h.indexOf('data-pp-pop="go"') > 0 && h.indexOf('data-pp-pop="cancel"') > 0);
  assert.ok(prep.popConfirmHtml('한국도로공사').indexOf('한국도로공사를 제안') > 0);
  assert.strictEqual(prep.popConfirmHtml('<script>x</script>').indexOf('<script>'), -1);
  assert.strictEqual(prep.josa('노원구청', '을', '를'), '을');
  assert.strictEqual(prep.josa('한국도로공사', '을', '를'), '를');
  assert.strictEqual(prep.T.okConfirm('노원구청'), '노원구청을 제안 확정했습니다. 다음은 [개설 신청]입니다.');
});

// ── 목록 ──
test('listRows·filterRows·tabCounts: 단계→가나다 정렬, 진행 중/취소·중단 탭, 담당 문구, can_view', function () {
  const rows = prep.listRows([
    { bid_case_id: 'B3', institution_id: 'I3', institution_name: '마포구청', state_cd: 'IN_PROGRESS', state_name: '사전준비 중', progress: { done: 2, total: 4 }, assignee_names: ['김영업', '배지아', '이영업'] },
    { bid_case_id: 'B1', institution_id: 'I1', institution_name: '노원구청', state_cd: 'CONFIRMED', state_name: '확정됨', progress: { done: 0, total: 0 }, assignee_names: [] },
    { bid_case_id: 'B2', institution_id: 'I2', institution_name: '강남구청', state_cd: 'CONFIRMED', state_name: '확정됨', progress: { done: 0, total: 0 }, assignee_names: [], can_view: false },
    { bid_case_id: 'B4', institution_id: 'I4', institution_name: '종로구청', state_cd: 'CANCELLED', state_name: '확정 취소', progress: { done: 0, total: 0 }, assignee_names: [] },
  ]);
  assert.deepStrictEqual(rows.map(function (r) { return r.name; }), ['강남구청', '노원구청', '마포구청', '종로구청']);
  assert.strictEqual(rows[2].badge.text, '사전준비 중');
  assert.strictEqual(rows[2].assigneeText, '담당 김영업 외 2명');
  assert.strictEqual(rows[1].assigneeText, '담당 미정');
  assert.strictEqual(rows[0].canView, false);
  assert.strictEqual(rows[1].canView, true);
  assert.deepStrictEqual(prep.tabCounts(rows), { active: 3, closed: 1 });
  assert.deepStrictEqual(prep.filterRows(rows, 'active', '').map(function (r) { return r.id; }), ['B2', 'B1', 'B3']);
  assert.deepStrictEqual(prep.filterRows(rows, 'closed', '').map(function (r) { return r.id; }), ['B4']);
  assert.deepStrictEqual(prep.filterRows(rows, 'active', '노원').map(function (r) { return r.id; }), ['B1']);
  assert.strictEqual(prep.emptyText('active', ''), prep.T.emptyActive);
  assert.strictEqual(prep.emptyText('closed', ''), '취소하거나 중단한 건이 없습니다.');
  assert.strictEqual(prep.emptyText('active', '가나'), '\'가나\'와 맞는 기관이 없습니다.');
  const h = prep.itemsHtml(rows, 'B1');
  assert.ok(h.indexOf('aria-current="true"') > 0);
  assert.ok(h.indexOf('pp-noview') > 0 && h.indexOf('aria-disabled="true"') > 0);
  assert.ok(h.indexOf('2/4') > 0);
});

test('stateBadge·boardTag: 상태 배지 모양, 서버 상태명 임시 정리, 부결 꼬리표(T5는 완료로 본다)', function () {
  assert.strictEqual(prep.stateBadge('CONFIRMED', '확정됨').cls, 'pp-neutral');
  assert.strictEqual(prep.stateBadge('OPEN_PENDING', '개설 대기').cls, 'gap');
  assert.strictEqual(prep.stateBadge('APPROVAL_PENDING', '사전준비 승인 중').cls, 'gap');
  assert.strictEqual(prep.stateBadge('WRITABLE', '작성 가능').cls, 'ok');
  assert.strictEqual(prep.stateBadge('WRITING', '작성 중').cls, 'ok');
  assert.strictEqual(prep.stateBadge('CANCELLED', '중단(미참여)').cls, 'pp-cancel');
  assert.strictEqual(prep.stateBadge('CANCELLED', '중단(미참여)').text, '중단(미참여)');
  assert.strictEqual(prep.stateBadge('IN_PROGRESS', '사전준비 중').text, '사전준비 중');   // 서버 이름 그대로(임시 치환 제거)
  assert.strictEqual(prep.stateBadge('IN_PROGRESS', '').text, '사전준비 중');
  assert.deepStrictEqual(prep.boardTag('REJECTED'), { cls: 'none', text: '이사회 부결' });
  assert.deepStrictEqual(prep.boardTag('PASSED'), { cls: 'ok', text: '이사회 가결' });
  assert.strictEqual(prep.boardTag('SCHEDULED').text, '의결 예정');
  assert.strictEqual(prep.boardTag(null), null);
});

// ── 상세 HTML ──
function viewOf(cd, over) {
  return Object.assign({
    bid_case_id: 'B1', institution_id: 'I1', institution_name: '노원구청', state_cd: cd, state_name: '', progress: { done: 1, total: 3 },
    confirmed_by: { emp_no: '1', name: '김영업' }, confirmed_at: '2026-11-10T14:02:00+09:00', emp_verified: 1,
    board_result: null, assignees: [{ emp_no: '1', name: '김영업' }, { emp_no: '2', name: '배지아' }],
    tasks: TASKS, open_request: null, plan_request: null,
    viewer: { is_assignee: true, is_head: false, can_unconfirm: false, can_request_open: false, can_withdraw_open: false,
              can_request_plan_approval: false, can_start_writing: false, can_cancel: false, can_upload: true },
  }, over || {});
}
function caseOf(v, extra) { return prep.caseHtml(Object.assign({ view: v, history: [], attach: null, role: '영업팀', meEmp: '1' }, extra || {})); }

test('caseHtml: 머리·단계 막대·과제 카드·끝 노드가 상태별로 그려진다', function () {
  const h = caseOf(viewOf('IN_PROGRESS', { board_result: 'REJECTED' }));
  assert.ok(h.indexOf('id="pp-case-title"') > 0 && h.indexOf('tabindex="-1"') > 0);
  assert.ok(h.indexOf('이사회 부결') > 0);
  assert.ok(h.indexOf('aria-label="진행 단계"') > 0 && h.indexOf('aria-label="준비 과제"') > 0);
  assert.ok(h.indexOf('확정 김영업 11-10 14:02') > 0 && h.indexOf('담당 김영업, 배지아') > 0);
  assert.ok(h.indexOf('data-act="check" data-task="T2"') > 0);
  assert.ok(h.indexOf('aria-label="\'기관장 프로필\' 완료로 표시"') > 0);
  assert.ok(h.indexOf('준비중</span>') > 0);                       // T6 준비중 배지
  assert.ok(h.indexOf('필수 과제 3개가 남았습니다') > 0);            // 끝 노드의 꺼진 [사전준비 승인 요청] 이유
  assert.ok(h.indexOf('필수 과제를 마치고 영업부장 사전준비 승인을 받으면 켜집니다.') > 0);
  // 확정본이 끝나야 열리는 T5, 사전준비 헤더 [중단…]은 can_cancel일 때만
  assert.strictEqual(h.indexOf('data-act="abort-open"'), -1);
  assert.ok(caseOf(viewOf('IN_PROGRESS', { viewer: { is_assignee: true, can_cancel: true } })).indexOf('data-act="abort-open"') > 0);
  // 담당자가 아니면 읽기 전용 안내가 한 번만
  const ro = caseOf(viewOf('IN_PROGRESS', { viewer: { is_assignee: false, is_head: true },
    tasks: TASKS.map(function (t) { return Object.assign({}, t, { can_check: false, can_uncheck: false }); }) }));
  assert.strictEqual(ro.split('읽기 전용입니다.').length, 2);
  assert.strictEqual(ro.indexOf('data-act="check"'), -1);
});

test('caseHtml: CONFIRMED·OPEN_PENDING·APPROVAL_PENDING·WRITABLE·WRITING·CANCELLED 끝 노드와 머리 동작', function () {
  const c = caseOf(viewOf('CONFIRMED', { tasks: [], viewer: { can_unconfirm: true, can_request_open: true } }));
  assert.ok(c.indexOf('data-act="unconfirm-open"') > 0 && c.indexOf('data-act="open-request-open"') > 0);
  assert.ok(c.indexOf('개설 신청이 승인되면 준비 과제가 열립니다.') > 0);
  assert.ok(caseOf(viewOf('CONFIRMED', { tasks: [], viewer: { can_request_open: false } })).indexOf('개설 신청은 영업팀·영업팀장이 합니다.') > 0);
  // 개설 대기: 신청자는 읽기 전용 + 신청 회수, 지명자·의견은 서버가 주면 보인다
  const op = caseOf(viewOf('OPEN_PENDING', { tasks: [], open_request: { req_id: 7, status: 'PENDING',
    nominees: [{ emp_no: '1', name: '김영업', position: '대리' }, { emp_no: '2', name: '배지아', position: '계장' }], comment: '급합니다' },
    viewer: { can_withdraw_open: true } }));
  assert.ok(op.indexOf('개설 신청이 승인을 기다리고 있습니다.') > 0);
  assert.ok(op.indexOf('지명: 김영업(대리), 배지아(계장)') > 0 && op.indexOf('의견: 급합니다') > 0);
  assert.ok(op.indexOf('data-act="withdraw" data-req="7"') > 0);
  assert.strictEqual(op.indexOf('지명:'), op.lastIndexOf('지명:'));
  // 서버가 지명자를 아직 안 주면 그 줄이 없다(폴백)
  assert.strictEqual(caseOf(viewOf('OPEN_PENDING', { tasks: [], open_request: { req_id: 7 }, viewer: {} })).indexOf('지명:'), -1);
  assert.strictEqual(caseOf(viewOf('OPEN_PENDING', { tasks: [], open_request: { req_id: 7 }, viewer: {} })).indexOf('data-act="withdraw"'), -1);
  // 사전준비 승인 대기: 영업팀장에게만 꺼진 [중단…]과 이유
  const ap = caseOf(viewOf('APPROVAL_PENDING'), { role: '영업팀장' });
  assert.ok(ap.indexOf('사전준비 승인 요청 중에는 중단할 수 없습니다.') > 0 && /disabled[^>]*aria-describedby="pp-why-abort"/.test(ap));
  assert.strictEqual(caseOf(viewOf('APPROVAL_PENDING'), { role: '영업팀' }).indexOf('pp-why-abort'), -1);
  assert.ok(ap.indexOf('회수는 [결재함 › 내가 올린 요청]에서 합니다.') > 0);
  // 작성 가능: [제안서 작성하기] 다음 한 걸음, 확인 줄
  const w = caseOf(viewOf('WRITABLE', { viewer: { is_assignee: true, can_start_writing: true, can_cancel: true } }));
  assert.ok(/data-act="start-ask"/.test(w) && w.indexOf('pp-next-btn') > 0);
  const wc = caseOf(viewOf('WRITABLE', { viewer: { is_assignee: true, can_start_writing: true } }), { confirm: { kind: 'start' } });
  assert.ok(wc.indexOf('되돌릴 수 없습니다.') > 0 && wc.indexOf('data-act="start-ok"') > 0);
  // 작성 중
  const wr = caseOf(viewOf('WRITING'));
  assert.ok(wr.indexOf('제안서 작성 중입니다.') > 0 && wr.indexOf('data-act="to-workflow"') > 0);
  // 취소·중단: 회색 배너(사유 포함), 동작 없음
  const cx = caseOf(viewOf('CANCELLED', { state_name: '중단(미참여)', tasks: [], viewer: {} }),
    { history: [{ event_cd: 'CANCEL', from_state: 'IN_PROGRESS', reason: '입찰 불참', logged_at: '2026-11-11T10:00:00+09:00' }] });
  assert.ok(cx.indexOf('중단(미참여)') > 0 && cx.indexOf('— 사유: 입찰 불참') > 0);
  assert.strictEqual(cx.indexOf('data-act='), -1);
});

test('caseHtml: 사전준비 승인 요청 뒤 [완료 취소]는 확인 줄을 거친다(그 전에는 바로)', function () {
  const v = viewOf('WRITABLE');
  const asked = caseOf(v, { confirm: { kind: 'uncheck', task: 'T1' } });
  assert.ok(asked.indexOf('사전준비 승인 요청 뒤입니다. 완료를 취소하면 사전준비 승인·작성 시작이 막힙니다.') > 0);
  assert.ok(asked.indexOf('data-act="uncheck-ok"') > 0 && asked.indexOf('그대로 두기') > 0 && asked.indexOf('data-first="1"') > 0);
  assert.strictEqual(caseOf(v).indexOf('uncheck-ok'), -1);
  const plan = caseOf(viewOf('IN_PROGRESS', { viewer: { is_assignee: true, can_request_plan_approval: true } }), { confirm: { kind: 'plan' } });
  assert.ok(plan.indexOf('영업부장에게 사전준비 승인을 요청합니다. 요청 중에는 중단할 수 없습니다.') > 0 && plan.indexOf('data-act="plan-ok"') > 0);
});

test('caseHtml: 기관명·파일명·지명자 이름의 <script>는 이스케이프된다', function () {
  const evil = '<script>alert(1)</script>';
  const v = viewOf('IN_PROGRESS', { institution_name: evil, assignees: [{ emp_no: '1', name: evil }],
    confirmed_by: { emp_no: '1', name: evil }, tasks: [Object.assign({}, TASKS[2], { name: evil })] });
  const h = caseOf(v, { attach: [{ attach_id: 1, name: evil, valid: true, confirmed: false, uploaded_by: { emp_no: '1', name: evil }, pii_note: evil }] });
  assert.strictEqual(h.indexOf('<script>'), -1);
  assert.ok(h.indexOf('&lt;script&gt;') > 0);
  assert.strictEqual(prep.itemsHtml(prep.listRows([{ bid_case_id: 'B', institution_name: evil, state_cd: 'CONFIRMED', assignee_names: [evil] }]), '').indexOf('<script>'), -1);
  assert.strictEqual(prep.modalHtml({ kind: 'void', reason: evil, sel: [], candState: 'ok' }, { name: evil, fileName: evil }).indexOf('<script>'), -1);
});

// ── 모달 ──
test('modalState·modalHtml: 개설 신청(1~10명)·확정 취소·중단(빨강 테두리)·무효 처리', function () {
  const open = { kind: 'open', reason: '', sel: [], q: '', candState: 'ok', cands: [{ emp_no: '1', name: '김영업', position_title: '대리', role: '영업팀' }] };
  assert.deepStrictEqual(prep.modalState(open, false), { canGo: false, why: '한 명 이상 고르세요.', count: '0/10명' });
  assert.strictEqual(prep.modalState(Object.assign({}, open, { sel: ['1'] }), false).canGo, true);
  assert.strictEqual(prep.modalState(Object.assign({}, open, { sel: ['1'] }), true).canGo, false);   // 처리 중
  assert.strictEqual(prep.modalState(Object.assign({}, open, { sel: ['1'], candState: 'loading' }), false).canGo, false);
  const oh = prep.modalHtml(open, { name: '노원구청', meEmp: '9' });
  assert.ok(oh.indexOf('개설 신청 — 노원구청') > 0 && oh.indexOf('담당자 지명') > 0 && oh.indexOf('의견 (선택)') > 0);
  assert.ok(oh.indexOf('주민등록번호·카드번호 같은 개인정보를 적지 마세요.') > 0);
  assert.ok(oh.indexOf('role="dialog" aria-modal="true" aria-labelledby="pp-m-title"') > 0);
  assert.ok(oh.indexOf('개설 신청 올리기') > 0 && oh.indexOf('data-emp="1"') > 0);
  const full = prep.modalHtml(Object.assign({}, open, { sel: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] }), {});
  assert.ok(full.indexOf('10/10명') > 0 && full.indexOf('최대 10명까지') > 0);
  // 사유가 필수인 모달
  ['unconfirm', 'abort', 'void'].forEach(function (k) {
    assert.strictEqual(prep.modalState({ kind: k, reason: '  ' }, false).canGo, false, k);
    assert.strictEqual(prep.modalState({ kind: k, reason: '사유' }, false).canGo, true, k);
    assert.strictEqual(prep.modalState({ kind: k, reason: 'x'.repeat(201) }, false).canGo, false, k);
  });
  const ab = prep.modalHtml({ kind: 'abort', reason: '' }, { name: '노원구청', assignees: 3, writing: false });
  assert.ok(ab.indexOf('pp-danger') > 0 && ab.indexOf('중단하기') > 0);
  assert.ok(ab.indexOf('담당자 3명의 배정이 풀리고') > 0 && ab.indexOf('세 팀 작업은 그대로 남습니다') < 0);
  assert.ok(prep.modalHtml({ kind: 'abort', reason: '' }, { assignees: 3, writing: true }).indexOf('세 팀 작업은 그대로 남습니다') > 0);
  const un = prep.modalHtml({ kind: 'unconfirm', reason: '' }, { name: '노원구청' });
  assert.ok(un.indexOf('다시 확정하면 같은 건이 되살아납니다.') > 0 && un.indexOf('pp-danger') < 0 && un.indexOf('확정 취소하기') > 0);
  const vd = prep.modalHtml({ kind: 'void', reason: '' }, { fileName: 'a.xlsx' });
  assert.ok(vd.indexOf('파일 무효 처리 — a.xlsx') > 0 && vd.indexOf('기록은 남습니다.') > 0 && vd.indexOf('무효 처리하기') > 0);
});

test('gateOf: 서버 없음 → 로그인 → 권한 순', function () {
  assert.strictEqual(prep.gateOf({ serverMode: false, emp: '1', role: '영업팀' }).kind, 'file');
  assert.strictEqual(prep.gateOf({ serverMode: true, emp: '', role: '영업팀' }).kind, 'login');
  assert.strictEqual(prep.gateOf({ serverMode: true, emp: '1', role: '디자이너', roleLabel: '디자이너' }).kind, 'forbidden');
  assert.strictEqual(prep.gateOf({ serverMode: true, emp: '1', role: '영업부장' }), null);
});

test('render.js: 팝오버 마크업(규격 §6-B) — 요약·미확인 칩·접힌 원본 정보, 내부 칸(지역코드·경도·위도)은 보이지 않는다', function () {
  const render = require('../js/render.js');
  const rec = { name: '노원구청', type: '지자체', region: '11', subRegion: '11350', lng: 127.05, lat: 37.65, term: 4,
                lastBid: '2023-03-02', contractEnd: '2027-03-02', confirmed: false, sources: ['https://example.test/a', '내부 문서'], updatedAt: '2026-11-01' };
  const h = render.popoverHtml(rec, new Date('2026-11-11T00:00:00'));
  assert.ok(h.indexOf('id="pop-title"') > 0 && h.indexOf('tabindex="-1"') > 0);
  assert.ok(/class="dg-day (urgent|soon|later|unknown)"/.test(h));
  assert.ok(h.indexOf('입찰 예정일') > 0 && h.indexOf('2027-03-02 (추정)') > 0);
  assert.strictEqual((h.match(/<span class="pop-unk">미확인<\/span>/g) || []).length, 2);
  // 기관장 줄은 현황판 안내 자리표시(서버 열람 기록을 지도 훑기로 쌓지 않는다)
  assert.ok(h.indexOf('<dt>기관장</dt><dd><span class="pop-unk">현황판에서 확인</span></dd>') > 0);
  ['현 유치 은행', '임직원 수', '기관장'].forEach(function (l) { assert.ok(h.indexOf(l) > 0, l); });
  assert.ok(h.indexOf('미확인 칸은 기관 정보 이관 뒤 채워집니다.') > 0);
  assert.ok(h.indexOf('id="pop-prep-slot"') > 0 && h.indexOf('id="pop-edit"') > 0);
  assert.ok(h.indexOf('<details class="pop-raw"><summary>원본 정보</summary>') > 0);
  ['지역코드', '구시군코드', '경도', '위도'].forEach(function (l) { assert.strictEqual(h.indexOf(l), -1, l); });
  assert.ok(h.indexOf('href="https://example.test/a"') > 0 && h.indexOf('rel="noopener noreferrer"') > 0);
  // 누락된 숨김 칸은 접힌 원본 정보 안에서 알린다
  assert.ok(render.popoverHtml(Object.assign({}, rec, { region: '' }), new Date('2026-11-11T00:00:00')).indexOf('누락된 칸: 지역코드') > 0);
  // 이스케이프
  assert.strictEqual(render.popoverHtml(Object.assign({}, rec, { name: '<script>x</script>' }), new Date('2026-11-11T00:00:00')).indexOf('<script>'), -1);
  // 키보드: 랭킹 카드는 Tab으로 닿고 Enter·Space로 열며, Esc로 닫는다
  assert.ok(/card\.setAttribute\('tabindex', '0'\)/.test(RENDER_SRC) && /card\.setAttribute\('role', 'button'\)/.test(RENDER_SRC));
  assert.ok(/ev\.key !== 'Enter' && ev\.key !== ' '/.test(RENDER_SRC));
  assert.ok(/ev\.key !== 'Escape'/.test(RENDER_SRC) && /root\.prep\.decoratePopover\(pop, rec\)/.test(RENDER_SRC));
});

test('사전준비 화면 문구에는 \'기획승인\'이 없다(진행 현황 기획승인과 이름을 나눔, 11-13)', function () {
  ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE'].forEach(function (st) {
    assert.ok(!/기획승인/.test(prep.nextLine({ state_cd: st, tasks: [] }) || ''), st);
  });
  assert.ok(!/기획승인/.test(JSON.stringify(prep.T || {})));
});

test('팝오버·순위표: 공고 진행 중 기관은 마감 D-n과 공고 줄로, D+·확정 표기를 쓰지 않는다(NEXT 78, 11-13)', function () {
  const render = require('../js/render.js');
  const logic = require('../js/logic.js');
  const today = new Date('2026-11-13T00:00:00');
  const mapo = { name: '마포구청', type: '지자체', region: '11', subRegion: '11440', lng: 126.9, lat: 37.55, term: 4,
    lastBid: '2022-10-01', contractEnd: '2026-10-29', confirmed: true, receiveFrom: '2026-11-16', receiveTo: '2026-11-19',
    sources: [], updatedAt: '2026-11-13' };
  const h = render.popoverHtml(mapo, today);
  assert.ok(h.indexOf('마감 D-6') > 0);
  assert.strictEqual(h.indexOf('D+'), -1);
  assert.strictEqual(h.indexOf('입찰 예정일'), -1);
  assert.ok(h.indexOf('2026-10-29 · 접수 11.16~11.19') > 0);
  assert.ok(/class="dg-day urgent"/.test(h));
  assert.strictEqual(render.rankLineText(mapo, today), '지자체 · 공고 2026-10-29 · 접수 11.16~11.19');
  const noEnd = Object.assign({}, mapo, { receiveFrom: undefined, receiveTo: undefined });
  assert.ok(render.popoverHtml(noEnd, today).indexOf('공고 진행 중</span>') > 0);
  assert.ok(render.popoverHtml(noEnd, new Date('2026-12-10T00:00:00')).indexOf('결과 확인</span>') > 0);
  assert.ok(render.rankLineText(noEnd, today).indexOf('마감일 미확인') > 0);
  const h2 = render.popoverHtml(mapo, new Date('2026-11-25T00:00:00'));
  assert.ok(h2.indexOf('결과 확인</span>') > 0 && h2.indexOf('D+') === -1);
  const old = Object.assign({}, mapo, { contractEnd: '2026-06-01', receiveFrom: undefined, receiveTo: undefined });
  assert.ok(render.popoverHtml(old, today).indexOf('D+') > 0);
  assert.ok(render.popoverHtml(old, today).indexOf('입찰 예정일') > 0);
  assert.ok(logic.noticeBrief({ name: 'x', confirmed: false, contractEnd: '2026-10-29' }, today) === null);
});
