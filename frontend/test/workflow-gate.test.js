const test = require('node:test');
const assert = require('node:assert');

// workflow.js는 root=self를 잡는다. Node에서는 self가 없어 root.store가 비므로
// require 전에 가짜 root를 심는다(파일마다 별도 프로세스라 전역이 다른 테스트로 새지 않는다).
const ROOT = {};
globalThis.self = ROOT;
const store = require('../js/store.js');
const roles = require('../js/roles.js');
ROOT.store = store;
ROOT.roles = roles;
const wf = require('../js/workflow.js');
delete globalThis.self;

// localStorage 메모리 대역 — store.js가 호출 시점에 typeof localStorage를 본다.
const mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; },
};

// 가짜 DOM — id마다 요소를 하나씩 만들어 캐시한다. 마크업(innerHTML)은 문자열로만 검사한다.
const els = {};
function fakeEl(id) {
  return {
    id: id, innerHTML: '', textContent: '', value: '', title: '', disabled: false,
    dataset: {}, style: {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
  };
}
globalThis.document = { getElementById: function (id) { return els[id] || (els[id] = fakeEl(id)); } };

// 가짜 fetch — 현재 STATUS를 돌려준다. 다른 호출은 빈 부가 정보.
let STATUS = null;
globalThis.fetch = function (url) {
  let body = {};
  if (/\/status$/.test(url)) body = STATUS;
  else if (/coverage-map$/.test(url)) body = { criteria: [], total_score: 0 };
  else if (/timeline$/.test(url)) body = { events: [] };
  else if (/^\/consistency/.test(url)) body = { findings: [] };
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
};

function flush() { return new Promise(function (r) { setImmediate(r); }); }

// 로그인 상태를 만들고 기관을 골라 현황을 받아온다.
function arrange(team, emp, status) {
  store.saveSession({ mode: 'account', id: 'x', emp: emp });
  store.saveProfile({ name: '홍길동', team: team });
  STATUS = status;
  wf.mount();
  els['wf-inst'].value = 'i1';
  els['wf-inst'].onchange();
  return flush();
}
const GATED = { stage: 5, running: false, pending_gate: '기획승인', tasks: [] };
const NOT_GATED = { stage: 4, running: false, pending_gate: null, tasks: [] };

test('renderControls: #wf-by 없음, 의견칸 aria-label, 승인·반려는 힌트에 연결', async function () {
  await arrange('영업부장', '1234567', NOT_GATED);
  const html = els['wf-controls'].innerHTML;
  assert.ok(html.indexOf('id="wf-by"') < 0);
  assert.ok(html.indexOf('id="wf-comment"') >= 0);
  assert.ok(html.indexOf('aria-label="결재 의견"') >= 0);
  assert.strictEqual((html.match(/aria-describedby="wf-gate-hint"/g) || []).length, 2);   // 승인·반려
  assert.ok(html.indexOf('id="wf-gate-hint"') >= 0);
  assert.ok(html.indexOf('role="status"') >= 0);
});

test('syncButtons: 대기 게이트 있음 + 영업팀장 → 승인·반려 비활성, 이유가 글자와 title로', async function () {
  await arrange('영업팀장', '1234567', GATED);
  assert.strictEqual(els['wf-approve'].disabled, true);
  assert.strictEqual(els['wf-reject'].disabled, true);
  assert.strictEqual(els['wf-gate-hint'].textContent, '영업부장만 승인할 수 있어요');
  assert.strictEqual(els['wf-approve'].title, '영업부장만 승인할 수 있어요');
  assert.strictEqual(els['wf-reject'].title, '영업부장만 승인할 수 있어요');
});

test('syncButtons: 대기 게이트 있음 + 영업부장 → 활성, 힌트 비움', async function () {
  await arrange('영업부장', '1234567', GATED);
  assert.strictEqual(els['wf-approve'].disabled, false);
  assert.strictEqual(els['wf-reject'].disabled, false);
  assert.strictEqual(els['wf-gate-hint'].textContent, '');
  assert.strictEqual(els['wf-approve'].title, '');
});

test('syncButtons: 대기 게이트 없음 + 영업부장 → 둘 다 비활성, 말할 이유 없으니 힌트 비움', async function () {
  await arrange('영업부장', '1234567', NOT_GATED);
  assert.strictEqual(els['wf-approve'].disabled, true);
  assert.strictEqual(els['wf-reject'].disabled, true);
  assert.strictEqual(els['wf-gate-hint'].textContent, '');
  assert.strictEqual(els['wf-approve'].title, '');
});

test('syncButtons: 대기 게이트 없음 + 영업팀장도 힌트는 비움(승인할 차례일 때만 이유를 말한다)', async function () {
  await arrange('영업팀장', '1234567', NOT_GATED);
  assert.strictEqual(els['wf-gate-hint'].textContent, '');
});

test('gateAccess 경계: team 앞뒤 공백은 trim, 안쪽 공백·6자리·8자리·공백 낀 사번은 비활성', function () {
  const S = { mode: 'account', id: 'x', emp: '1234567' };
  assert.strictEqual(wf.gateAccess({ team: ' 영업부장 ' }, S).allowed, true);
  assert.strictEqual(wf.gateAccess({ team: '영업 부장' }, S).allowed, false);
  ['123456', '12345678', ' 1234567', '123456a', ''].forEach(function (emp) {
    const r = wf.gateAccess({ team: '영업부장' }, { mode: 'account', id: 'x', emp: emp });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, '로그인한 영업부장만 승인할 수 있어요');
  });
});

test('onProfileChange: 영업부장 → 로그아웃으로 바뀌면 활성에서 비활성, 문구가 로그인 안내로 전환', async function () {
  await arrange('영업부장', '1234567', GATED);
  assert.strictEqual(els['wf-approve'].disabled, false);
  // app.logout과 같은 상태: 세션 삭제 + 빈 프로필
  store.clearSession();
  store.saveProfile({ name: '', team: '' });
  wf.onProfileChange();
  assert.strictEqual(els['wf-approve'].disabled, true);
  assert.strictEqual(els['wf-reject'].disabled, true);
  assert.strictEqual(els['wf-gate-hint'].textContent, '로그인한 영업부장만 승인할 수 있어요');
  assert.strictEqual(els['wf-approve'].title, '로그인한 영업부장만 승인할 수 있어요');
});

test('onProfileChange: 영업팀장 → 영업부장으로 바뀌면 활성으로, 문구 사라짐', async function () {
  await arrange('영업팀장', '1234567', GATED);
  assert.strictEqual(els['wf-gate-hint'].textContent, '영업부장만 승인할 수 있어요');
  store.saveProfile({ name: '김부장', team: '영업부장' });
  wf.onProfileChange();
  assert.strictEqual(els['wf-approve'].disabled, false);
  assert.strictEqual(els['wf-gate-hint'].textContent, '');
});
