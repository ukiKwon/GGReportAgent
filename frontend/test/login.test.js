const test = require('node:test');
const assert = require('node:assert');
const login = require('../js/login.js');
const roles = require('../js/roles.js');
const store = require('../js/store.js');

test('모든 임시 계정의 역할은 roles.ALL(서버 teams.py와 대조되는 목록) 안에 있다', function () {
  login.ACCOUNTS.forEach(function (a) {
    assert.ok(roles.ALL.indexOf(a.role) >= 0, a.id + ' → ' + a.role);
  });
});

test('계정 ID는 중복이 없다', function () {
  const ids = login.ACCOUNTS.map(function (a) { return a.id; });
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('master는 권한관리가 열리는 전산팀 역할이다', function () {
  // 권한관리 탭은 '전산팀'에만 열린다(server/menus.py ADMIN_MENU) — 전산팀장으로 두면 못 연다.
  const m = login.byId('master');
  assert.strictEqual(m.role, '전산팀');
  assert.strictEqual(m.master, true);
});

test('byId: 대소문자·공백을 무시하고, 모르는 ID는 null', function () {
  assert.strictEqual(login.byId('  Sales.Lead ').role, '영업팀장');
  assert.strictEqual(login.byId('nobody'), null);
  assert.strictEqual(login.byId(''), null);
  assert.strictEqual(login.byId(null), null);
});

test('authenticate: 비밀번호는 보지 않는다(프로토타입)', function () {
  assert.strictEqual(login.authenticate('sales.head', '').role, '영업부장');
  assert.strictEqual(login.authenticate('sales.head', 'anything').role, '영업부장');
  assert.strictEqual(login.authenticate('nobody', 'x'), null);
});

test('디자이너는 영업팀 소속의 디자이너 역할', function () {
  assert.strictEqual(login.byId('designer').role, '디자이너');
});

test('groups: 소속 순서대로 묶고 마스터는 마지막 "관리자" 묶음', function () {
  const g = login.groups();
  assert.deepStrictEqual(g.map(function (x) { return x.title; }), ['영업팀', '전산팀', '예산팀', '관리자']);
  const total = g.reduce(function (n, x) { return n + x.accounts.length; }, 0);
  assert.strictEqual(total, login.ACCOUNTS.length);
});

test('chipText: 세션이 없거나 둘러보기면 "로그인"', function () {
  assert.strictEqual(login.chipText(null, { name: '김영업', team: '영업팀' }), '로그인');
  assert.strictEqual(login.chipText({ mode: 'guest' }, {}), '로그인');
  assert.strictEqual(login.chipText({ mode: 'account' }, { name: '이영업', team: '영업팀장' }), '이영업 · 영업팀장');
});

test('userLabel: 헤더 우측은 "{소속} {이름}" 순서, 빈 값은 건너뛴다', function () {
  assert.strictEqual(login.userLabel({ name: '김영업', team: '영업팀' }), '영업팀 김영업');
  assert.strictEqual(login.userLabel({ name: ' 이영업 ', team: '영업팀장' }), '영업팀장 이영업');
  assert.strictEqual(login.userLabel({ name: '김영업', team: '' }), '김영업');
  assert.strictEqual(login.userLabel({}), '');
  assert.strictEqual(login.userLabel(null), '');
});

test('세션 저장소: 저장 → 읽기 → 삭제', function () {
  // node에는 localStorage가 없다 — store가 없는 환경에서도 죽지 않아야 한다.
  assert.strictEqual(store.loadSession(), null);
  const mem = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  try {
    store.saveSession({ mode: 'account', id: 'sales.lead' });
    assert.deepStrictEqual(store.loadSession(), { mode: 'account', id: 'sales.lead', emp: '' });
    store.saveSession({ mode: 'account', id: 'sales.lead', emp: '5047192' });
    assert.strictEqual(store.loadSession().emp, '5047192');
    store.saveSession({ mode: 'account', id: 'x', emp: '12ab' });
    assert.strictEqual(store.loadSession().emp, '');   // 형식이 틀린 사번은 버린다
    store.saveSession({ mode: 'account', id: 'sales.lead' });
    store.saveSession({ mode: 'guest' });
    assert.deepStrictEqual(store.loadSession(), { mode: 'guest', id: '', emp: '' });
    store.clearSession();
    assert.strictEqual(store.loadSession(), null);
    // 알 수 없는 mode는 세션으로 치지 않는다.
    mem['tbd.session'] = JSON.stringify({ mode: 'hacker' });
    assert.strictEqual(store.loadSession(), null);
  } finally {
    delete global.localStorage;
  }
});

test('임시 계정 9개는 DB 시드(009)의 사번 7자리를 갖고 서로 겹치지 않는다', function () {
  const emps = login.ACCOUNTS.map(function (a) { return a.empNo; });
  emps.forEach(function (e) { assert.ok(/^[0-9]{7}$/.test(e), e); });
  assert.strictEqual(new Set(emps).size, emps.length);
  assert.strictEqual(login.byId('master').empNo, '8203417');
});

test('byId: 사번으로도 찾는다', function () {
  assert.strictEqual(login.byId('5047192').id, 'sales.lead');
  assert.strictEqual(login.byId('0000000'), null);
});

test('empNoFor: 사번 입력은 그대로, 별칭은 계정 사번, 모르면 빈 문자열', function () {
  assert.strictEqual(login.empNoFor(' 3361829 '), '3361829');      // DB에만 있는 사용자도 통과
  assert.strictEqual(login.empNoFor('Sales.Lead'), '5047192');
  assert.strictEqual(login.empNoFor('nobody'), '');
  assert.strictEqual(login.empNoFor(null), '');
});

test('withIdentity: 사번이 있으면 X-Emp-No를 붙이고 입력은 바꾸지 않는다', function () {
  const orig = { 'Content-Type': 'application/json' };
  const out = login.withIdentity(orig, '5047192');
  assert.deepStrictEqual(out, { 'Content-Type': 'application/json', 'X-Emp-No': '5047192' });
  assert.deepStrictEqual(orig, { 'Content-Type': 'application/json' });
  assert.deepStrictEqual(login.withIdentity(undefined, '5047192'), { 'X-Emp-No': '5047192' });
  assert.deepStrictEqual(login.withIdentity([['A', 'b']], '5047192'), { A: 'b', 'X-Emp-No': '5047192' });
  assert.deepStrictEqual(login.withIdentity(new Map([['A', 'b']]), ''), { A: 'b' });        // 사번 없으면 안 붙임
  assert.deepStrictEqual(login.withIdentity({}, "1234567' OR '1"), {});                    // 형식이 틀리면 안 붙임
});
