'use strict';
// 영업 추진 준비 › 협약준비 업무(NEXT 113 1단계) — preptask.js 순수 함수·nav 대조·서버 칸 정의 대조·배선 정적 검사.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pt = require('../js/preptask.js');
const pb = require('../js/prepboard.js');
const nav = require('../js/nav.js');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'preptask.js'), 'utf8');
const PB_SRC = fs.readFileSync(path.join(ROOT, 'js', 'prepboard.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');   // app.js는 CRLF — 줄 끝을 맞춰 자른다
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const JAVA = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'service', 'PrepBoardColumns.java');

function row(o) {
  return Object.assign({ bid_case_id: 'B1', institution_name: '청주시', state_cd: 'IN_PROGRESS', state_name: '사전준비 중', ended: false,
    assignee_names: ['김영업'], can_view: true, can_check: true, is_mine: true,
    cells: {
      NOTICE_CHECK: { notice_status_name: '공고 확인' },
      INST_ANALYSIS: { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '시스템' },
      FIN_COMMITTEE: { mark_cd: 'IN_PROGRESS', marked_on: '2026-11-21', by_name: '김영업' },
      BOARD_SECRETARIAT: { mark_cd: 'DONE', marked_on: '2026-11-22', by_name: '김영업' },
      BOARD_AUDIT: { mark_cd: 'NA' },
    } }, o || {});
}
const MARKS = [{ mark_cd: 'DONE', name: '완료' }, { mark_cd: 'IN_PROGRESS', name: '진행' }, { mark_cd: 'NA', name: '대상 아님' }, { mark_cd: 'NONE', name: '시작 전' }];

// ── 단계 정본 ──
test('STEPS: 23단계, 규격 6-3 순서·이름 그대로', function () {
  assert.deepStrictEqual(pt.STEPS.map(function (s) { return s.label; }), [
    '입찰공고확인', '기관 정보 분석', '수익성분석', '가결위(재무)', '출심위(사업부)', '이사회 자료 작성', '이사회 발표 대본', '이사회',
    '제안서', '발표자료', '제출서류', '제안서제출품의', 'PT', '결과발표', '우선협상', '협약서(법률)', '협약체결품의',
    'ATM', 'KB카드', '전산구축', 'VIP 지정', '금리승인', '협약식']);
  assert.strictEqual(new Set(pt.STEPS.map(function (s) { return s.id; })).size, 23, 'id 유일');
});

test('STEPS ↔ 서버 PrepBoardColumns: 칸 코드·라벨·종류·묶음이 같다(파일이 있을 때)', { skip: !fs.existsSync(JAVA) }, function () {
  const src = fs.readFileSync(JAVA, 'utf8');
  const cols = [];
  const re = /new Col\("([A-Z0-9_]+)", "([^"]+)", (null|"[A-Z_]+"), (NOTICE|AUTO|MANUAL)\)/g;
  let m;
  while ((m = re.exec(src))) cols.push([m[1], m[2], m[3] === 'null' ? null : m[3].replace(/"/g, ''), m[4]]);
  assert.strictEqual(cols.length, 27);
  const mine = [];
  pt.STEPS.forEach(function (s) {
    if (s.kind === 'group') s.subs.forEach(function (x) { mine.push([x.cd, x.label, s.cd, 'MANUAL']); });
    else if (s.cd) mine.push([s.cd, s.label, null, s.kind === 'notice' ? 'NOTICE' : (s.kind === 'auto' || s.kind === 'proposal') ? 'AUTO' : 'MANUAL']);
  });
  assert.deepStrictEqual(mine, cols);
  const groups = {};
  const gre = /g\.put\("([A-Z_]+)", "([^"]+)"\)/g;
  while ((m = gre.exec(src))) groups[m[1]] = m[2];
  pt.STEPS.filter(function (s) { return s.kind === 'group'; }).forEach(function (s) { assert.strictEqual(groups[s.cd], s.label, s.cd); });
  assert.strictEqual(Object.keys(groups).length, 3);
});

test('STEPS ↔ nav: 협약준비 업무 메뉴 21개(이름·순서·id·역할·배지)가 단계 정본과 같다', function () {
  assert.strictEqual(nav.TASK_PREFIX, pt.TASK_PREFIX);
  const plan = nav.CATEGORIES.filter(function (c) { return c.id === 'plan'; })[0];
  const sub = plan.items.filter(function (i) { return i.sub === '협약준비 업무'; });
  assert.deepStrictEqual(sub.map(function (i) { return i.label; }),
    pt.STEPS.filter(function (s) { return s.kind !== 'notice' && s.kind !== 'proposal'; }).map(function (s) { return s.label; }));
  assert.strictEqual(sub.length, 21);
  const tasks = plan.items.filter(function (i) { return i.id && i.id.indexOf(nav.TASK_PREFIX) === 0; });
  assert.strictEqual(tasks.length, 19);
  assert.deepStrictEqual(tasks.map(function (i) { return [i.id.slice(nav.TASK_PREFIX.length), i.label]; }), pt.menuSteps().map(function (s) { return [s.cd, s.label]; }));
  tasks.forEach(function (i) {
    assert.strictEqual(i.tag, '', i.id + ' 배지 없음');
    assert.deepStrictEqual(i.onlyRoles, nav.TEAM_ROLES, i.id);
  });
  assert.strictEqual(sub.filter(function (i) { return nav.badgeOf(Object.assign({ soon: true }, i)) === '준비중'; }).length, 1, '준비중 배지는 이사회 발표 대본 하나');
});

test('nav.build: 영업팀 22개·재무 1개·마스터 2개, 소제목은 영업팀만', function () {
  const ON = { map: true, regions: true, workflow: true, chat: true, knowledge: true, tasks: true, approvals: true, admin: true };
  function plan(ctx) { return nav.build(ON, ctx).filter(function (c) { return c.id === 'plan'; })[0]; }
  assert.strictEqual(plan({ role: '영업팀' }).items.length, 22);
  assert.strictEqual(plan({ role: '영업팀' }).showSubs, true);
  assert.deepStrictEqual(plan({ role: '예산팀' }).items.map(function (i) { return i.id; }), ['soon:이사회 자료']);
  assert.strictEqual(plan({ role: '예산팀' }).showSubs, false);
  assert.deepStrictEqual(plan({ role: '전산팀', master: true }).items.map(function (i) { return i.id; }), ['soon:이사회 자료', 'soon:이사회 발표 대본']);
  function planOf(role) {
    const ctx = { role: role };
    return nav.limitToRole(nav.build(ON, ctx), ctx).filter(function (c) { return c.id === 'plan'; })[0];
  }
  assert.strictEqual(planOf('디자이너'), undefined, '디자이너는 영업 추진 준비 분류째 안 보인다');
  ['영업팀', '영업팀장', '영업부장'].forEach(function (role) {
    assert.strictEqual(planOf(role).items.length, 22, role);
    assert.strictEqual(planOf(role).showSubs, true, role);
  });
  ['예산팀', '예산팀장'].forEach(function (role) {
    assert.deepStrictEqual(planOf(role).items.map(function (i) { return i.id; }), ['soon:이사회 자료'], role);
    assert.strictEqual(planOf(role).showSubs, false, role);
  });
});

test('cdOfId·stepByCd·indexOfCd', function () {
  assert.strictEqual(pt.cdOfId('soon:task:BOARD'), 'BOARD');
  assert.strictEqual(pt.cdOfId('soon:task:NOTICE_CHECK'), '', '메뉴 없는 단계');
  assert.strictEqual(pt.cdOfId('soon:이사회 자료'), '');
  assert.strictEqual(pt.cdOfId('soon:task:NOPE'), '');
  assert.strictEqual(pt.indexOfCd('FIN_COMMITTEE'), 3);
  assert.strictEqual(pt.indexOfCd('CEREMONY'), 22);
  assert.strictEqual(pt.indexOfCd('NOPE'), -1);
});

// ── 단계 목록 모델 ──
test('stepsModel: 현재·읽기만·글리프·sr 글자·묶음 완료 k/n', function () {
  const m = pt.stepsModel(row(), 3, MARKS);
  assert.strictEqual(m.length, 23);
  assert.strictEqual(m[3].current, true);
  assert.strictEqual(m.filter(function (x) { return x.current; }).length, 1);
  assert.strictEqual(m[0].ro, true); assert.strictEqual(m[8].ro, true); assert.strictEqual(m[3].ro, false);
  assert.strictEqual(m[0].sr, '공고 확인');
  assert.strictEqual(m[1].glyph, 'done'); assert.strictEqual(m[1].sr, '완료');
  assert.strictEqual(m[3].glyph, 'prog'); assert.strictEqual(m[3].sr, '진행');
  assert.strictEqual(m[4].glyph, ''); assert.strictEqual(m[4].sr, '시작 전');
  assert.strictEqual(m[5].sr, ''); assert.strictEqual(m[6].sr, '');
  assert.strictEqual(m[7].cnt, '완료 1/3'); assert.strictEqual(m[7].glyph, '');
  assert.strictEqual(m[11].cnt, '완료 0/2'); assert.strictEqual(m[16].cnt, '완료 0/4');
});

test('groupCount: 완료만 센다(대상 아님·진행은 세지 않는다)', function () {
  const g = pt.groupCount(row(), pt.stepByCd('BOARD'));
  assert.deepStrictEqual(g, { done: 1, total: 3 });
});

test('stepKey: ↑↓ Home End만 처리, 끝에서 멈춤', function () {
  assert.strictEqual(pt.stepKey(0, 'ArrowUp', 23), 0);
  assert.strictEqual(pt.stepKey(22, 'ArrowDown', 23), 22);
  assert.strictEqual(pt.stepKey(3, 'ArrowDown', 23), 4);
  assert.strictEqual(pt.stepKey(3, 'ArrowUp', 23), 2);
  assert.strictEqual(pt.stepKey(9, 'Home', 23), 0);
  assert.strictEqual(pt.stepKey(9, 'End', 23), 22);
  assert.strictEqual(pt.stepKey(9, 'Enter', 23), null);
  assert.strictEqual(pt.stepKey(9, ' ', 23), null);
});

test('liveText: {기관}, {n}단계 {이름}, {상태}', function () {
  assert.strictEqual(pt.liveText(row(), 3, MARKS), '청주시, 4단계 가결위(재무), 진행');
  assert.strictEqual(pt.liveText(row(), 7, MARKS), '청주시, 8단계 이사회, 완료 1/3');
  assert.strictEqual(pt.liveText(row(), 5, MARKS), '청주시, 6단계 이사회 자료 작성');
});

// ── 본문 모델 ──
test('bodyModel: 손 체크 단계 — 상태·마지막 체크·안내, 체크 없으면 문구', function () {
  const b = pt.bodyModel(row(), 3, MARKS);
  assert.strictEqual(b.pos, '4 / 23'); assert.strictEqual(b.title, '가결위(재무)');
  assert.deepStrictEqual(b.facts, [{ l: '상태', v: '진행' }, { l: '마지막 체크', v: '2026-11-21', mono: true, extra: '김영업' }]);
  assert.deepStrictEqual(b.notes, ['체크는 제안 준비 현황 표에서 담당 영업이 합니다.']);
  assert.deepStrictEqual(b.actions, []);
  assert.strictEqual(b.prev.label, '이전: 수익성분석'); assert.strictEqual(b.next.label, '다음: 출심위(사업부)');
  const none = pt.bodyModel(row(), 4, MARKS);
  assert.deepStrictEqual(none.facts, [{ l: '상태', v: '시작 전' }, { l: '', v: '아직 체크하지 않았습니다.' }]);
});

test('bodyModel: 개설 전 줄은 담당 영업 안내가 더 붙는다', function () {
  const b = pt.bodyModel(row({ state_cd: 'CONFIRMED' }), 3, MARKS);
  assert.strictEqual(b.notes.length, 2);
  assert.strictEqual(b.notes[1], pb.T.infoPre);
});

test('bodyModel: 읽기만·자동·이사회 자료·발표 대본 단계의 안내와 단추', function () {
  const notice = pt.bodyModel(row(), 0, MARKS);
  assert.deepStrictEqual(notice.facts, [{ l: '공고 상태', v: '공고 확인' }]);
  assert.deepStrictEqual(notice.notes, ['공고 판정에서 가져옵니다.']);
  const auto = pt.bodyModel(row(), 1, MARKS);
  assert.deepStrictEqual(auto.notes, ['사전준비 과제에서 시스템이 채웁니다.']);
  assert.deepStrictEqual(auto.actions.map(function (a) { return a.act; }), ['prep']);
  const prop = pt.bodyModel(row(), 8, MARKS);
  assert.deepStrictEqual(prop.notes, ['디자이너 작업 결과로 시스템이 채웁니다.']);
  assert.deepStrictEqual(prop.actions.map(function (a) { return a.act + ':' + a.label; }), ['workflow:제안서 진행 현황 열기']);
  const board = pt.bodyModel(row(), 5, MARKS);
  assert.deepStrictEqual(board.facts, []);
  assert.deepStrictEqual(board.notes, ['이사회 자료는 이사회 자료 작성 화면에서 만들고 확정합니다.']);
  assert.deepStrictEqual(board.actions.map(function (a) { return a.act + ':' + a.label; }), ['board:이사회 자료 작성 열기']);
  const script = pt.bodyModel(row(), 6, MARKS);
  assert.deepStrictEqual(script.notes, ['사전준비 상세의 \'이사회 발표 대본\' 과제에서 체크합니다.']);
  assert.deepStrictEqual(script.actions.map(function (a) { return a.act; }), ['prep']);
  assert.deepStrictEqual(pt.bodyModel(row(), 10, MARKS).actions.map(function (a) { return a.act; }), ['prep'], '제출서류도 T 연결');
});

test('bodyModel: 묶음 단계는 하위 칸마다 한 줄', function () {
  const b = pt.bodyModel(row(), 7, MARKS);
  assert.strictEqual(b.subs.length, 3);
  assert.deepStrictEqual(b.subs[0], { label: '사무국', glyph: 'done', name: '완료', date: '2026-11-22', by: '김영업' });
  assert.strictEqual(b.subs[1].name, '대상 아님'); assert.strictEqual(b.subs[2].name, '시작 전');
  assert.strictEqual(b.facts.length, 0);
});

test('bodyModel: 첫·끝 단계의 이전/다음은 비활성 + 글자', function () {
  const first = pt.bodyModel(row(), 0, MARKS);
  assert.deepStrictEqual(first.prev, { label: '이전 단계 없음', disabled: true });
  assert.strictEqual(first.next.disabled, false);
  const last = pt.bodyModel(row(), 22, MARKS);
  assert.deepStrictEqual(last.next, { label: '마지막 단계', disabled: true });
  assert.strictEqual(last.pos, '23 / 23');
  assert.strictEqual(last.prev.label, '이전: 금리승인');
});

// ── 마크업 ──
test('stepsHtml: nav·ol·button, aria-current=step 하나, tabindex 0 하나(roving)', function () {
  const h = pt.stepsHtml(pt.stepsModel(row(), 3, MARKS), 5);
  assert.strictEqual((h.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(/data-i="3"[^>]*aria-current="step"/.test(h));
  assert.strictEqual((h.match(/tabindex="0"/g) || []).length, 1);
  assert.ok(/class="ts-step[^"]*" data-i="5" tabindex="0"/.test(h));
  assert.strictEqual((h.match(/<button type="button" class="ts-step/g) || []).length, 23);
  assert.ok(h.indexOf('<span class="sr-only">, 진행</span>') > 0 && h.indexOf('완료 1/3') > 0);
  assert.ok(/class="ts-step is-ro"/.test(h), '읽기만 단계');
});

test('detailHtml: 머리(h2#ts-title tabindex=-1)·nav 이름·사전준비 상세 열기·live·XSS 이스케이프', function () {
  const r = row({ institution_name: '<img src=x onerror=alert(1)>', assignee_names: ['<b>김</b>'] });
  const h = pt.detailHtml({ row: r, idx: 0, rov: 0, marks: MARKS, backLabel: '← 제안 준비 현황으로' });
  assert.ok(/<h2 id="ts-title" tabindex="-1">/.test(h));
  assert.ok(h.indexOf('<nav class="ts-steps" id="ts-steps" aria-label="협약준비 단계">') > 0);
  assert.ok(h.indexOf('data-ts="back">← 제안 준비 현황으로</button>') > 0);
  assert.ok(h.indexOf('data-ts="prep" aria-label="&lt;img src=x onerror=alert(1)&gt; 사전준비 상세 열기 — 개설 신청·준비 과제"') > 0);
  assert.ok(h.indexOf('id="ts-live" class="sr-only" role="status"') > 0);
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('<b>김') < 0);
  assert.ok(h.indexOf('화면 준비 중') > 0 && h.indexOf('이 단계에서 확인할 산출물은 상의해 정한 뒤 이 자리에 보입니다. 지금은 제안 준비 현황 표의 체크 기록만 보입니다.') > 0);
  assert.ok(h.indexOf('data-ts="prev" disabled>이전 단계 없음</button>') > 0);
});

test('listHtml: 단일 칸은 상태·마지막 체크·체크한 사람, 묶음은 하위 칸 머리, 열람 제한 줄은 단추 없음, 이스케이프', function () {
  const rows = [row(), row({ bid_case_id: 'B2', institution_name: '<b>', can_view: false, is_mine: false, cells: {} })];
  const one = pt.listHtml({ step: pt.stepByCd('FIN_COMMITTEE'), rows: rows, marks: MARKS });
  assert.ok(one.indexOf('<th scope="col">마지막 체크</th>') > 0 && one.indexOf('<th scope="col">체크한 사람</th>') > 0);
  assert.strictEqual((one.match(/data-ts="name"/g) || []).length, 1, '열람 제한 줄은 단추 없음');
  assert.ok(one.indexOf('class="pb-nm-t">&lt;b&gt;') > 0);
  assert.ok(one.indexOf('data-bid="B1"') > 0 && one.indexOf('2026-11-21') > 0 && one.indexOf('김영업') > 0);
  assert.ok(one.indexOf('내 담당') > 0);
  assert.ok(one.indexOf('<caption class="sr-only">가결위(재무) 기관 목록</caption>') > 0);
  const grp = pt.listHtml({ step: pt.stepByCd('BOARD'), rows: rows, marks: MARKS });
  assert.ok(grp.indexOf('<th scope="col">사무국</th>') > 0 && grp.indexOf('<th scope="col">준법</th>') > 0);
  assert.ok(grp.indexOf('체크한 사람') < 0);
  assert.ok(grp.indexOf('2026-11-22') > 0);
});

// ── 소스 규칙 ──
test('소스 규칙: 저장소·confirm·외부 주소·hex 없음, 화면 이름 prep_dashboard, 버튼은 open·refresh만, innerHTML은 이스케이프 조립만', function () {
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC));
  assert.ok(!/\bconfirm\(/.test(SRC) && !/https?:\/\//.test(SRC));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC));
  assert.ok(!/\$\{/.test(SRC), '템플릿 문자열 보간 없음');
  assert.ok(SRC.indexOf("'X-Screen-Id': pb.SCREEN") > 0 && pb.SCREEN === 'prep_dashboard');
  assert.ok(SRC.indexOf("'dash_check'") < 0, '체크 저장은 이 화면에서 하지 않는다(읽기 전용)');
  assert.ok(!/method:\s*'(PUT|POST|DELETE|PATCH)'/.test(SRC));
  assert.ok(/load\('open'\)/.test(SRC) && /load\('refresh'\)/.test(SRC));
  SRC.split('\n').forEach(function (line, i) {
    if (!/\.(innerHTML|outerHTML)\s*=/.test(line)) return;
    assert.ok(/pt\.\w+Html\(|skeletonHtml\(|stateBox\(|pb\.countHtml\(|= ''/.test(line), 'L' + (i + 1) + ': ' + line.trim());
  });
  assert.ok(!/innerHTML\s*=\s*[^;]*\be\.(message|detail)/.test(SRC));
});

// ── 배선(정적) ──
test('prepboard.js 연결: 이름 클릭·Enter는 단계 상세 우선, show()가 is-steps를 지우고 leave()는 가려진 동안 스크롤을 덮지 않는다', function () {
  assert.ok(PB_SRC.indexOf('function openRow(row)') > 0 && PB_SRC.indexOf('root.preptask.openFromBoard({ row: row, data: B.data, hooks: hooks') > 0);
  assert.ok(/if \(row && row\.can_view !== false && canOpen\(\)\) \{ e\.preventDefault\(\); openRow\(row\); \}/.test(PB_SRC));
  assert.ok(/if \(row && row\.can_view !== false\) openRow\(row\);/.test(PB_SRC));
  const show = PB_SRC.slice(PB_SRC.indexOf('pb.show = function'), PB_SRC.indexOf('pb.leave = function'));
  assert.ok(show.indexOf("classList.remove('is-steps')") > 0 && show.indexOf("classList.remove('is-steps')") < show.indexOf('B.hooks = hooks'));
  const leave = PB_SRC.slice(PB_SRC.indexOf('pb.leave = function'), PB_SRC.indexOf('pb.reset = function'));
  assert.ok(leave.indexOf("contains('is-steps')") > 0);
  assert.ok(PB_SRC.slice(PB_SRC.indexOf('pb.reset = function')).indexOf("classList.remove('is-steps')") > 0);
});

test('app.js 연결: showSoon isTask 분기(soon-plain 숨김은 별도 줄·mount), 계정 변경 때 onProfileChange, 탭 줄은 그대로', function () {
  assert.ok(APP_SRC.indexOf('String(itemId).indexOf(root.nav.TASK_PREFIX) === 0') > 0);
  assert.ok(APP_SRC.indexOf('root.preptask.mount(tsEl, root.preptask.cdOf(itemId), label)') > 0);
  assert.ok(/if \(isTask\) document\.getElementById\('soon-plain'\)\.style\.display = 'none'/.test(APP_SRC));
  assert.ok(/isBoard \|\| isTeam \|\| isPrep \|\| dashReady \|\| isPlans/.test(APP_SRC), 'plans.test 줄 보존');
  assert.ok(APP_SRC.indexOf('root.preptask.onProfileChange()') > 0);
  assert.ok(APP_SRC.indexOf('root.results.mount(resultsEl)') > 0, 'results 줄 보존');
});

test('index.html: preptask.js는 prepboard.js 뒤·app.js 앞, CSS 블록(새 hex·12px 미만·번지는 그림자·채운 주버튼 금지, 토큰 규칙)', function () {
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.strictEqual(HTML.split('js/preptask.js').length, 2);
  assert.ok(at('preptask.js') > at('prepboard.js') && at('preptask.js') < at('app.js'));
  const a = HTML.indexOf('/* 협약준비 업무 시작'), b = HTML.indexOf('/* 협약준비 업무 끝 */');
  assert.ok(a > 0 && b > a && a > HTML.indexOf('.pb-legend[hidden]'));
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#eef1f5/g, '')), '새 hex 금지(DESIGN 패널 머리 리터럴 #eef1f5만 허용)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 12, m); });
  assert.ok(!/box-shadow:\s*0\s/.test(css), '번지는 그림자 금지');
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  ['#pp-root.is-steps #pp-board { display:none; }', '.ts-detail {', '.ts-step[aria-current="step"]', '.ts-step:focus-visible', '.ts-ph {', '.ts-pager {', '.ts-t th[scope="col"]'].forEach(function (s) { assert.ok(css.indexOf(s) >= 0, s); });
  assert.ok(/\.ts-detail \{[^}]*grid-template-columns:232px minmax\(0,1fr\)/.test(css));
  assert.ok(/\.ts-ph \{[^}]*repeating-linear-gradient\(45deg/.test(css), '준비중 빗금 45도');
  assert.ok(HTML.indexOf('.nav-soon-tag') > 0, '배지 CSS는 그대로(이사회 발표 대본이 쓴다)');
});

// ── 가짜 문서로 보는 동작 ──
function fakeDoc() {
  const doc = { els: {}, focused: null };
  function make(id) {
    const cls = new Set();
    const n = { id: id, style: {}, hidden: false, innerHTML: '', textContent: '', attrs: {}, listeners: {}, kids: [] };
    n.classList = { add: function (c) { cls.add(c); }, remove: function (c) { cls.delete(c); }, contains: function (c) { return cls.has(c); } };
    n.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; };
    n.setAttribute = function (k, v) { n.attrs[k] = String(v); };
    n.removeAttribute = function (k) { delete n.attrs[k]; };
    n.addEventListener = function (t, f) { n.listeners[t] = f; };
    n.focus = function () { doc.focused = n.id; };
    n.scrollIntoView = function () {};
    n.querySelector = function () { return null; };
    n.querySelectorAll = function () { return []; };
    n.appendChild = function (c) { n.kids.push(c); if (c.id) doc.els[c.id] = c; return c; };
    n.insertBefore = n.appendChild;
    return n;
  }
  doc.add = function (id) { const n = make(id); doc.els[id] = n; return n; };
  doc.getElementById = function (id) { return doc.els[id] || null; };
  doc.createElement = function () { return make(''); };
  doc.querySelectorAll = function () { return []; };
  doc.body = make('body');
  return doc;
}
// preptask.js를 vm 안에서 브라우저처럼(self = 전역) 실행한다. 상태 P가 시험마다 새로 만들어진다.
function sandbox(opt) {
  const o = opt || {};
  const sb = { document: fakeDoc(), logic: require('../js/logic.js'), prepboard: pb, fetched: 0, who: { emp: o.emp || 'E1', team: o.team || '영업팀' } };
  sb.store = { loadSession: function () { return { emp: sb.who.emp }; }, loadProfile: function () { return { team: sb.who.team }; } };
  sb.fetch = function () {
    sb.fetched += 1;
    return o.data ? Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(o.data); } }) : new Promise(function () {});
  };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb;
}
function clickOf(attrs, closest) {
  const b = { classList: { contains: function () { return false; } }, getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; } };
  b.closest = function (s) { return s === 'button' ? b : ((closest || {})[s] || null); };
  return { target: b };
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }

test('bodyHtml: 라벨 없는 줄은 dl 밖 p.ts-note로(dt 없는 dd 없음)', function () {
  const h = pt.bodyHtml(row(), 4, MARKS);
  assert.ok(h.indexOf('<dt>상태</dt><dd>시작 전</dd>') > 0);
  assert.ok(h.indexOf('<p class="ts-note">아직 체크하지 않았습니다.</p>') > h.indexOf('</dl>'));
  assert.ok(!/<div><dd>/.test(h));
  assert.ok(h.indexOf('<p class="ts-note">체크는 제안 준비 현황 표에서 담당 영업이 합니다.</p>') > 0);
});

test('openFromBoard(가짜 문서): is-steps를 붙이고 경로 2 틀을 비우고 제목에 포커스, 돌아가기는 ctx.back(bid)를 한 번 부른다', function () {
  const sb = sandbox();
  const d = sb.document;
  const pp = d.add('pp-root'); d.add('pp-modal');
  const ts = d.add('ts-root'); ts.innerHTML = '<p>옛 목록</p>';
  d.add('ts-title');
  const back = [];
  const ok = sb.preptask.openFromBoard({ row: row(), data: { marks: MARKS }, hooks: {}, back: function (id) { back.push(id); } });
  assert.strictEqual(ok, true);
  assert.ok(pp.classList.contains('is-steps'));
  assert.strictEqual(ts.innerHTML, '');
  assert.strictEqual(d.focused, 'ts-title');
  const dt = d.getElementById('ts-detail-pp');
  assert.ok(dt && dt.innerHTML.indexOf('청주시') > 0);
  dt.listeners.click(clickOf({ 'data-ts': 'back' }));
  assert.deepStrictEqual(back, ['B1']);
  assert.strictEqual(dt.innerHTML, '');
});

test('openFromBoard(가짜 문서): 그리다 던지면 is-steps를 지우고 false(표가 가려진 채 남지 않는다)', function () {
  const sb = sandbox();
  const d = sb.document;
  const pp = d.add('pp-root'); d.add('pp-modal');
  const bad = row();
  Object.defineProperty(bad, 'institution_name', { get: function () { throw new Error('boom'); } });
  const ok = sb.preptask.openFromBoard({ row: bad, data: { marks: MARKS }, hooks: {}, back: function () {} });
  assert.strictEqual(ok, false);
  assert.ok(!pp.classList.contains('is-steps'));
  assert.strictEqual(d.getElementById('ts-detail-pp').innerHTML, '');
});

test('경로 2(가짜 문서): mount는 포커스를 옮기지 않고, 이름 클릭은 그 task 단계로 상세, 돌아가기는 같은 기관 이름에 포커스', async function () {
  const sb = sandbox({ data: { marks: MARKS, rows: [row()], scope: 'mine' } });
  const d = sb.document;
  const host = d.add('ts-root');
  d.add('ts-list-title');
  const lv = d.add('ts-list-v'), dt = d.add('ts-detail-t');
  d.add('ts-title');
  const scroll = d.add('ts-scroll'), nm = d.add('nm-b1');
  const tr = { getAttribute: function (k) { return k === 'data-bid' ? 'B1' : null; }, querySelector: function (s) { return s === '.pb-nm' ? nm : null; } };
  scroll.querySelectorAll = function (s) { return s === 'tr[data-bid]' ? [tr] : []; };
  sb.preptask.mount(host, 'FIN_COMMITTEE', '가결위(재무)');
  assert.strictEqual(d.focused, null, '목록 mount는 포커스를 옮기지 않는다');
  await tick();
  assert.ok(scroll.innerHTML.indexOf('data-bid="B1"') > 0);
  host.listeners.click(clickOf({ 'data-ts': 'name' }, { tr: tr }));
  assert.strictEqual(lv.hidden, true);
  assert.strictEqual(dt.hidden, false);
  assert.ok(/data-i="3"[^>]*aria-current="step"/.test(dt.innerHTML), '처음 단계 = 그 task(가결위 = 4번째)');
  assert.strictEqual(d.focused, 'ts-title');
  host.listeners.click(clickOf({ 'data-ts': 'back' }));
  assert.strictEqual(dt.hidden, true);
  assert.strictEqual(dt.innerHTML, '');
  assert.strictEqual(lv.hidden, false);
  assert.strictEqual(d.focused, 'nm-b1');
});

test('onProfileChange(가짜 문서): 같은 사람이면 그대로, 사람이 바뀌어도 soon 탭이 숨어 있으면 다시 받지 않고, 보일 때만 다시 받는다', function () {
  const sb = sandbox();
  const d = sb.document;
  const host = d.add('ts-root');
  const tab = d.add('tab-soon'); tab.classList.add('active');
  sb.preptask.mount(host, 'FIN_COMMITTEE', '가결위(재무)');
  assert.strictEqual(sb.fetched, 1);
  host.innerHTML = 'X';
  sb.preptask.onProfileChange();
  assert.strictEqual(host.innerHTML, 'X', '같은 사람이면 아무것도 하지 않는다');
  assert.strictEqual(sb.fetched, 1);
  sb.who.emp = 'E2';
  tab.classList.remove('active');
  sb.preptask.onProfileChange();
  assert.strictEqual(host.innerHTML, '', '앞 계정의 틀은 비운다');
  assert.strictEqual(sb.fetched, 1, '숨은 화면은 요청하지 않는다');
  sb.preptask.mount(host, 'FIN_COMMITTEE', '가결위(재무)');
  assert.strictEqual(sb.fetched, 2);
  tab.classList.add('active');
  sb.who.emp = 'E3';
  sb.preptask.onProfileChange();
  assert.strictEqual(sb.fetched, 3, '보이는 task 화면은 새 계정으로 다시 받는다');
  assert.ok(host.innerHTML.indexOf('ts-list-v') > 0);
});

test('app.showSoon(가짜 문서): task가 아닌 항목은 #ts-root를 숨기고, task 항목은 보이게 하고 soon-plain을 숨기며 mount를 부른다', function () {
  const start = APP_SRC.indexOf('  app.showSoon = function');
  const end = APP_SRC.indexOf('\n  };\n', start) + 5;
  assert.ok(start > 0 && end > start);
  const body = APP_SRC.slice(start, end);
  function run(itemId, withTs) {
    const d = fakeDoc();
    ['tab-soon', 'soon-title', 'soon-badge', 'soon-note', 'soon-plain', 'bd-root', 'tm-root', 'pp-root'].forEach(function (id) { d.add(id); });
    const ts = withTs ? d.add('ts-root') : null;
    const calls = [];
    const r = { nav: nav, preptask: { cdOf: pt.cdOf, host: function () { return ts; }, mount: function (h, cd, label) { calls.push([cd, label]); } } };
    const app = new Function('root', 'document', 'let navActiveId; const app = { onTabChange: function () {} };\n' + body + '\nreturn app;')(r, d);
    app.showSoon(itemId, '라벨');
    return { d: d, ts: ts, calls: calls };
  }
  const plain = run('soon:이사회 자료', true);
  assert.strictEqual(plain.ts.style.display, 'none', 'task가 아니면 #ts-root를 숨긴다');
  assert.deepStrictEqual(plain.calls, []);
  assert.strictEqual(plain.d.getElementById('soon-plain').style.display, '');
  run('soon:이사회 자료', false);   // #ts-root가 아직 없어도 던지지 않는다
  const task = run(nav.TASK_PREFIX + 'PT', true);
  assert.strictEqual(task.ts.style.display, '');
  assert.strictEqual(task.d.getElementById('soon-plain').style.display, 'none');
  assert.deepStrictEqual(task.calls, [['PT', '라벨']]);
});

test('prepboard 대체 경로: preptask가 없으면 이름 클릭이 hooks.openCase(bid, 이름)로 간다', async function () {
  const d = fakeDoc();
  const sec = d.add('pp-board');
  global.document = d;
  try {
    const calls = [];
    const hooks = {
      req: function () { return Promise.resolve({ columns: [], groups: {}, marks: MARKS, rows: [row()] }); },
      roleLabel: '', openCase: function (b, n) { calls.push([b, n]); }, openMap: function () {},
    };
    assert.strictEqual(pb.show(hooks), true);
    await tick();
    const tr = { getAttribute: function (k) { return k === 'data-bid' ? 'B1' : null; } };
    sec.listeners.click(clickOf({ 'data-pb': 'open' }, { tr: tr }));
    assert.deepStrictEqual(calls, [['B1', '청주시']]);
  } finally { delete global.document; }
});
