const test = require('node:test');
const assert = require('node:assert');
const notify = require('../js/notify.js');

const LIST = [
  { notification_id: 'n1', recipient: '영업팀', sender: null, kind: '결재요청',
    content: '기획승인 대기', created_at: '09:30', read_at: null, stage: 5, institution_id: 'dobong' },
  { notification_id: 'n2', recipient: '김 차장', sender: '정 대리', kind: '쪽지',
    content: '자료 확인 부탁드립니다', created_at: '10:00', read_at: '10:05', stage: null, institution_id: null },
  { notification_id: 'n3', recipient: '영업팀', sender: null, kind: '되물음',
    content: '불리 조건 발견', created_at: '08:00', read_at: null, stage: 3, institution_id: 'dobong' },
];

test('rows: 시스템이 보낸 것은 보낸이가 "시스템"', function () {
  const rows = notify.rows(LIST);
  assert.deepStrictEqual(rows.map(function (r) { return r.from; }), ['시스템', '정 대리', '시스템']);
  assert.deepStrictEqual(rows.map(function (r) { return r.read; }), [false, true, false]);
  assert.strictEqual(rows[0].stage, 5);
  assert.strictEqual(rows[0].id, 'n1');
});

test('rows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(notify.rows(null), []);
});

test('formatTime: UTC ISO를 KST 분 단위로, 해석 불가는 원문', function () {
  assert.strictEqual(notify.formatTime('2026-10-30T04:27:55.253000+00:00'), '2026-10-30 13:27');
  assert.strictEqual(notify.formatTime('2026-10-30T20:00:00+00:00'), '2026-10-31 05:00');
  assert.strictEqual(notify.formatTime('09:30'), '09:30');
  assert.strictEqual(notify.formatTime(null), '');
});

test('unreadCount: 안 읽은 것만 센다', function () {
  assert.strictEqual(notify.unreadCount(LIST), 2);
  assert.strictEqual(notify.unreadCount([]), 0);
  assert.strictEqual(notify.unreadCount(null), 0);
});

test('kindClass: 알림 종류를 CSS 클래스로 (모르는 값은 기본으로)', function () {
  assert.strictEqual(notify.kindClass('결재요청'), 'approval');
  assert.strictEqual(notify.kindClass('되물음'), 'risk');
  assert.strictEqual(notify.kindClass('이관'), 'handoff');
  assert.strictEqual(notify.kindClass('쪽지'), 'note');
  assert.strictEqual(notify.kindClass('처음보는것'), 'note');
});

// ── 개인/단체 분리 · 결재 쪽지 이동 ───────────────────────────────────────

const ME = { name: '김영업', emp: '3918264' };
const MIXED = [
  { notification_id: 'p1', recipient: '3918264', sender: '박대리', kind: '결재알림', link: 'approvals:inbox',
    content: '[결재 요청] 박대리님이 …', created_at: '10:40', read_at: null, stage: 1 },
  { notification_id: 'p2', recipient: '김영업', sender: '정 대리', kind: '쪽지',
    content: '자료 부탁', created_at: '10:00', read_at: '10:05' },
  { notification_id: 'p3', recipient: '3918264', sender: '이영업', kind: '결재결과', link: 'approvals:mine',
    content: '[결재 결과] 승인', created_at: '11:00', read_at: null },
  { notification_id: 'g1', recipient: '영업팀', sender: null, kind: '되물음',
    content: '불리 조건', created_at: '08:00', read_at: null, stage: 3 },
];

test('scopeOf: 내 이름·사번 앞이면 개인, 소속 같은 역할 앞이면 단체', function () {
  assert.strictEqual(notify.scopeOf(MIXED[0], ME), 'personal');   // 사번
  assert.strictEqual(notify.scopeOf(MIXED[1], ME), 'personal');   // 이름
  assert.strictEqual(notify.scopeOf(MIXED[3], ME), 'group');
  assert.strictEqual(notify.scopeOf({ recipient: '3918264' }, {}), 'group');   // 나를 모르면 개인으로 단정하지 않는다
  assert.strictEqual(notify.scopeOf(null, ME), 'group');
});

test('split·defaultTab: 두 탭으로 나누고, 안 읽은 쪽지가 있는 탭을 먼저 연다', function () {
  const parts = notify.split(MIXED, ME);
  assert.deepStrictEqual(parts.personal.map(function (n) { return n.notification_id; }), ['p1', 'p2', 'p3']);
  assert.deepStrictEqual(parts.group.map(function (n) { return n.notification_id; }), ['g1']);
  assert.strictEqual(notify.defaultTab(parts), 'personal');
  assert.strictEqual(notify.defaultTab({ personal: [MIXED[1]], group: [MIXED[3]] }), 'group');   // 개인은 다 읽음
  assert.strictEqual(notify.defaultTab({ personal: [], group: [] }), 'personal');
  assert.strictEqual(notify.defaultTab(null), 'personal');
  assert.deepStrictEqual(notify.TABS.map(function (t) { return t.key; }), ['personal', 'group']);
});

test('destination: 결재 알림은 받은 결재로, 결과는 내가 올린 요청으로, 옛 결재요청도 결재함으로', function () {
  assert.deepStrictEqual(notify.destination(MIXED[0]), { tab: 'approvals', sub: 'inbox', label: '결재함 › 받은 결재' });
  assert.strictEqual(notify.destination(MIXED[2]).sub, 'mine');
  assert.strictEqual(notify.destination({ kind: '결재요청' }).sub, 'inbox');
  assert.strictEqual(notify.destination(MIXED[1]), null);          // 보통 쪽지는 이동할 곳이 없다
  assert.strictEqual(notify.destination({ link: 'x:y' }), null);
  assert.strictEqual(notify.destination(null), null);
  assert.strictEqual(notify.rows([MIXED[0]])[0].dest.sub, 'inbox');
});

test('kindClass: 결재 알림·결과 종류도 색을 가진다', function () {
  assert.strictEqual(notify.kindClass('결재알림'), 'approval');
  assert.strictEqual(notify.kindClass('결재결과'), 'handoff');
});

test('autoReadsOnClick: 개인 쪽지만 누르면 읽힌다(단체 읽음은 소속 전체가 공유)', function () {
  assert.strictEqual(notify.autoReadsOnClick('personal'), true);
  assert.strictEqual(notify.autoReadsOnClick('group'), false);
});

test('renderList: 상태는 글자·점·띠로, 누르는 것은 버튼으로 — 안 읽음/읽음/이동/단체 구분', function () {
  const box = { innerHTML: '' };
  notify.renderList(box, [MIXED[0], MIXED[1], MIXED[2]], 'personal');
  const html = box.innerHTML;
  assert.ok(html.indexOf('새 쪽지') > 0);                         // 안 읽음 표시
  assert.ok(html.indexOf('<span class="nt-state">읽음</span>') > 0);   // 읽음은 글자
  assert.ok(html.indexOf('결재함 › 받은 결재 열기 →') > 0);      // 조사 없이 "…열기 →"
  assert.ok(html.indexOf('결재함 › 내가 올린 요청 열기 →') > 0);
  assert.ok(html.indexOf('nt-go') > 0);                           // 결재 쪽지는 이동 버튼
  assert.ok(html.indexOf('nt-row unread autoread') > 0);          // 개인 안 읽음은 눌러서 읽힘
  // 이동할 곳이 없는 안 읽음 쪽지에만 "읽음으로 표시" 버튼이 있다.
  const plain = { innerHTML: '' };
  notify.renderList(plain, [{ notification_id: 'x', recipient: '영업팀', kind: '쪽지', content: 'c', created_at: 't', read_at: null }], 'group');
  assert.ok(plain.innerHTML.indexOf('읽음으로 표시') > 0);
  assert.ok(plain.innerHTML.indexOf('autoread') < 0);             // 단체는 자동 읽음 없음
  assert.ok(plain.innerHTML.indexOf('소속 전체') > 0);             // 공유 읽음 안내
  assert.ok(html.split('읽음으로 표시').length === 1);            // 결재 쪽지에는 버튼이 없다(이동으로 읽음 처리)
});

test('renderList: 비어 있으면 탭에 맞는 문구, 내용은 이스케이프', function () {
  const a = { innerHTML: '' };
  notify.renderList(a, [], 'group');
  assert.ok(a.innerHTML.indexOf('단체 쪽지가 없습니다') > 0);
  const b = { innerHTML: '' };
  notify.renderList(b, [], 'personal');
  assert.ok(b.innerHTML.indexOf('개인 쪽지가 없습니다') > 0);
  const c = { innerHTML: '' };
  notify.renderList(c, [{ notification_id: 'x', recipient: 'a', kind: '쪽지', content: '<img onerror=1>', created_at: 't' }], 'personal');
  assert.ok(c.innerHTML.indexOf('<img') < 0);
});
