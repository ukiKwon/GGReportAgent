'use strict';
// 입찰 현황판 11-19 P3 판정(design-reviewer aed5a6eb 4절 A~F): 목표 밖 줄 입찰 종료·caption·단계 줄 '포함'·팝업 inert·팝업 canAdd·CSS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 17);
function p(n) { return logic.localDateStr(new Date(2026, 10, 17 + n)); }
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }
function mkCtx(extra) {
  const recs = { IA: rec('IA', '가', { confirmed: true, contractEnd: p(-3), receiveTo: p(12) }), ID: rec('ID', '라', { contractEnd: p(-140) }) };
  return Object.assign({ byInst: recs, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: true, delayDays: 30, years: [2026, 2027, 2028], actOf: function () { return 'confirm'; } }, extra || {});
}
const WIN = kbb.laneWindow(TODAY, 2026);
const NOBID = { byId: { ID: { handled_at: '2026-11-17', status_cd: 'NO_BID' } } };   // 가평형: 목표 밖 준비 + 올해 입찰 없음
function outRow(ctx) { return kbb.outRows([{ institutionId: 'ID', name: '라' }], {}, ctx)[0]; }
function cap(h) { return /<caption class="sr-only">([^<]*)<\/caption>/.exec(h)[1]; }

test('A. 목표 밖 준비 줄도 서버 근거(공고 현황·시작 전 약정)로 입찰 종료 — 마감까지 칸·일정 칸', function () {
  const r = outRow(mkCtx({ snap: NOBID }));
  assert.deepStrictEqual(r.closed, { cd: 'NOTICE_NO_BID', date: '2026-11-17' });
  assert.strictEqual(r.late, false); assert.strictEqual(r.hold, false); assert.strictEqual(r.note, null);
  const why = '근거: 입찰 공고 현황 2026-11-17 입찰 없음';
  [true, false].forEach(function (canEdit) {
    const h = kbb.goalRowHtml(r, { win: WIN, canEdit: canEdit });
    assert.ok(h.indexOf('<td title="' + why + '"><b class="hb-dd tx end">입찰 종료</b><span class="sr-only">' + why + '</span></td>') > 0);
    assert.ok(h.indexOf('<td class="ln"><div class="hb-lane" aria-hidden="true"><span class="unk">올해 입찰 끝남</span></div><span class="sr-only">올해 입찰이 끝난 기관</span></td>') > 0);
    assert.ok(h.indexOf('hb-acts') < 0 && h.indexOf('data-act="towatch"') < 0 && h.indexOf('data-act="tonext"') < 0);   // 옮길 목표가 없다
    assert.ok(h.indexOf('D+') < 0 && h.indexOf('추정 지남') < 0 && h.indexOf('class="late"') < 0 && h.indexOf('hb-late') < 0);
  });
  assert.ok(kbb.goalRowHtml(r, { win: WIN, canEdit: true }).indexOf('data-act="add"') > 0);   // 구분 칸의 [목표에 넣기]는 그대로
  // 정렬·거르기: 목표 밖 묶음 안에서 맨 아래, 상태 '입찰 종료'에 걸린다
  const ctx = mkCtx({ snap: NOBID }), two = kbb.outRows([{ institutionId: 'ID', name: '라' }, { institutionId: 'IA', name: '가' }], {}, ctx);
  assert.deepStrictEqual(kbb.filterRows(two, { status: 'closed' }).map(function (x) { return x.id; }), ['ID']);
  assert.strictEqual(kbb.sortBy(two, 'due', 'asc').slice(-1)[0].id, 'ID');
});

test('A. 근거 두 종류만: 시작 전 약정은 종료, 지난해 판정·snap 없음은 종료 아님, 보고 있는 연도가 올해가 아니면 종료 아님', function () {
  const sum = { ID: { lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2027-01-01', term_to: '2030-12-31' }] } };
  const c = outRow(mkCtx({ sumById: sum }));
  assert.deepStrictEqual(c.closed, { cd: 'CONTRACT_DECIDED', date: '2027-01-01' });
  assert.ok(kbb.goalRowHtml(c, { win: WIN, canEdit: true }).indexOf('근거: 금고 약정 2027-01-01 시작 약정이 이미 정해져 있음') > 0);
  assert.strictEqual(outRow(mkCtx({ snap: { byId: { ID: { handled_at: '2025-11-17', status_cd: 'NO_BID' } } } })).closed, null);   // 지난해 판정
  assert.strictEqual(outRow(mkCtx({ snap: { byId: { ID: { handled_at: '2026-11-17', status_cd: 'OPEN' } } } })).closed, null);
  const none = outRow(mkCtx());                                                                                              // snap·약정 없음 = 예전과 같다
  assert.strictEqual(none.closed, null);
  assert.ok(kbb.goalRowHtml(none, { win: WIN, canEdit: true }).indexOf('올해 입찰 끝남') < 0);
  assert.strictEqual(outRow(mkCtx({ snap: NOBID, year: 2027 })).closed, null);                                              // 2027 목표를 보는 중: 올해 근거는 붙이지 않는다
  assert.deepStrictEqual(outRow(mkCtx({ snap: NOBID, year: 2026 })).closed, { cd: 'NOTICE_NO_BID', date: '2026-11-17' });
  const k = src('js/kbboard.js');
  assert.ok(/function goalCtx\(\)[\s\S]*?snap: root\.noticerec && root\.noticerec\.snap \? root\.noticerec\.snap\(\) : null,[\s\S]*?year: gs\.data/.test(k));   // goalCtx가 snap·보고 있는 연도를 넘긴다
});

test('B. 표 caption: 목표 수와 그 밖의 준비 수를 나눠 말하고 \'…곳 중 …곳 보임\'', function () {
  const ctx = mkCtx(), g = kbb.goalRows([{ institution_id: 'IA', tag_cd: 'RETAIN', kind_cd: 'GOAL' }], ctx), o = kbb.outRows([{ institutionId: 'ID', name: '라' }], {}, ctx);
  const base = { st: 'ok', year: 2026, win: WIN, tab: 'goal', canEdit: true, sort: { key: 'due', dir: 'asc' } };
  const t = function (x) { return cap(kbb.goalTableHtml(Object.assign({}, base, x))); };
  assert.strictEqual(t({ rows: g.concat(g), out: [], total: 3 }), '2026 목표 기관 3곳 중 2곳 보임, 마감까지 오름차순');                                              // 목표 밖 없음
  assert.strictEqual(t({ rows: g, out: o, total: 2, nGoal: 1, nOut: 1 }), '2026 목표 기관 1곳과 그 밖의 제안서 준비 중인 기관 1곳, 2곳 중 2곳 보임, 마감까지 오름차순');
  assert.strictEqual(t({ rows: g, out: [], total: 4, nGoal: 3, nOut: 1 }), '2026 목표 기관 3곳과 그 밖의 제안서 준비 중인 기관 1곳, 4곳 중 1곳 보임, 마감까지 오름차순');   // 거른 뒤에도 거르기 전 수
  assert.strictEqual(t({ rows: g, out: o, sort: null }), '2026 목표 기관 1곳과 그 밖의 제안서 준비 중인 기관 1곳, 마감 가까운 순');
  assert.strictEqual(t({ rows: g, out: [], sort: null }), '2026 목표 기관 1곳, 마감 가까운 순');
  assert.strictEqual(t({ tab: 'watch', rows: g, out: [], total: 1, nGoal: 1, nOut: 1, sort: { key: 'next', dir: 'asc' } }), '관심 기관 1곳 중 1곳 보임, 다음 협약 종료 오름차순');   // 관심 탭은 목표 밖 말 없음
  assert.ok(kbb.cntHtml(2, 2).indexOf('<b>2</b> / <b>2</b>곳') > 0);                                                       // 보이는 건수는 그대로
});

test('C. 단계 줄: 목표 밖 줄이 있으면 \'… 포함\' 문장·그룹·버튼 aria-label, 없거나 자료를 못 받으면 예전 모양', function () {
  const c = [0, 0, 2, 0, 1], oc = [0, 0, 1, 0, 0];
  const h = kbb.stagesHtml(c, { ok: true, active: -1, nOut: 1, outCounts: oc });
  assert.ok(h.indexOf('role="group" aria-label="제안 진행 단계, 그 밖의 제안서 준비 중인 기관 1곳 포함"') > 0);
  assert.ok(h.indexOf('</button><span class="why">그 밖의 제안서 준비 중인 기관 1곳 포함</span></div>') > 0);
  assert.ok(h.indexOf('aria-label="사전준비 2곳(그 밖의 준비 기관 1곳) — 표를 이 단계로 거르기"') > 0);
  assert.ok(kbb.stagesHtml(c, { ok: true, active: 2, nOut: 1, outCounts: oc }).indexOf('aria-label="사전준비 2곳(그 밖의 준비 기관 1곳) — 거르기 끄기"') > 0);
  assert.ok(h.indexOf('곳 — 표를 이 단계로 거르기') > 0 && (h.match(/\(그 밖의 준비 기관/g) || []).length === 1);   // 목표 밖이 없는 단계는 예전 문장
  const plain = kbb.stagesHtml(c, { ok: true, active: -1, nOut: 0, outCounts: [0, 0, 0, 0, 0] });
  assert.ok(plain.indexOf('aria-label="제안 진행 단계"') > 0 && plain.indexOf('class="why"') < 0 && plain.indexOf('(그 밖의') < 0);
  const off = kbb.stagesHtml([0, 0, 0, 0, 0], { ok: false, why: '이유', nOut: 3, outCounts: oc });
  assert.ok(off.indexOf('포함') < 0 && off.indexOf('<span class="why">이유</span>') > 0);
});

test('용어: \'그 밖의 제안서 준비 중인 기관\'으로 통일(묶음 머리·오류 문장·종류 거르기)', function () {
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("['out', '그 밖의 준비 기관만']") > 0 && k.indexOf('목표 밖 준비만') < 0);
  assert.ok(k.indexOf('준비 지연과 그 밖의 제안서 준비 중인 기관은 받은 뒤에 보입니다.') > 0 && k.indexOf('목표 밖에서 제안을 준비 중인 기관 <b>') < 0 && k.indexOf('>목표 밖에서 제안을 준비 중인 기관</th>') < 0);
  assert.ok(kbb.toolbarHtml({ tab: 'goal', nGoal: 1, nWatch: 0, f: {}, shown: 1, total: 1 }).indexOf('<option value="out">그 밖의 준비 기관만</option>') > 0);
  assert.ok(kbb.prepErrHtml(500).indexOf('준비 지연과 그 밖의 제안서 준비 중인 기관은') > 0);
});

function node(name, kids) {
  const n = { name: name, parentNode: null, children: kids || [], attrs: {},
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; } };
  n.children.forEach(function (c) { c.parentNode = n; });
  return n;
}
test('D. 팝업 inert: overlay→body 조상 경로의 형제마다 걸고(이미 inert는 건너뜀), 건 것만 푼다', function () {
  const ov = node('ov'), root = node('hbroot'), nav = node('nav'), header = node('header'), login = node('login');
  login.attrs.inert = '';                                                                   // 다른 화면이 이미 건 것
  const main = node('main', [root, ov]), shell = node('shell', [nav, main]), body = node('body', [header, shell, login]);
  const done = kbb.inertBehind(ov, body);
  assert.deepStrictEqual(done.map(function (x) { return x.name; }), ['hbroot', 'nav', 'header']);
  [root, nav, header].forEach(function (x) { assert.ok(x.hasAttribute('inert'), x.name); });
  assert.ok(!ov.hasAttribute('inert') && !main.hasAttribute('inert') && !shell.hasAttribute('inert') && !body.hasAttribute('inert'));   // 팝업 자신과 조상은 안 잠근다
  kbb.inertRelease(done);
  assert.ok(!root.hasAttribute('inert') && !nav.hasAttribute('inert') && !header.hasAttribute('inert'));
  assert.ok(login.hasAttribute('inert'));                                                   // 남이 건 것은 그대로
  assert.deepStrictEqual(kbb.inertBehind(null, body), []); kbb.inertRelease(null);
  // 뒤늦게 뜬 다른 모달(경과 요약 팝업 등)은 안 잠근다: class modal-overlay·role=dialog·aria-modal=true
  const ov2 = node('ov'), late1 = node('ovpop'), late2 = node('dlg'), late3 = node('am'), plain = node('plain');
  late1.className = 'modal-overlay open'; late2.attrs.role = 'dialog'; late3.attrs['aria-modal'] = 'true';
  [late1, late2, late3].forEach(function (x) { x.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }; });
  plain.getAttribute = late1.getAttribute;
  const body2 = node('body2', [plain, late1, late2, late3, ov2]);
  const done2 = kbb.inertBehind(ov2, body2);
  assert.deepStrictEqual(done2.map(function (x) { return x.name; }), ['plain']);
  assert.ok(!late1.hasAttribute('inert') && !late2.hasAttribute('inert') && !late3.hasAttribute('inert'));
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("$('hb-root'); if (rt) rt.setAttribute('inert'") < 0 && k.indexOf("rt.removeAttribute('inert')") < 0);
});

test('F. 팝업 canAdd: 목표·관심 칩, 권한 없음, 다음 협약, 2년 밖, 다음도 국민은행, 올해 입찰 종료이면 숨긴다', function () {
  const r = rec('I1', '가'), it = { key: '11|가', name: '가', region: '11', endDate: '2026-12-31', rec: r };
  const o = { mark: '', can: true, isNext: false, verified: [], closedIds: {}, years: [2026, 2027, 2028] };
  assert.strictEqual(kbb.popCanAdd(it, o), true);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { mark: '관심' })), false);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { can: false })), false);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { isNext: true })), false);
  assert.strictEqual(kbb.popCanAdd(Object.assign({}, it, { endDate: '2031-01-01' }), o), false);
  const stay = [{ key: '11|가', name: '가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  assert.strictEqual(kbb.staysText(r, stay), '다음도 국민은행');
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { verified: stay })), false);   // 광진형: 칩이 이유를 말한다
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { closedIds: { I1: true } })), false);   // 올해 입찰 종료
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { closedIds: { I9: true } })), true);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('canAdd: kbb.popCanAdd(it, {') > 0 && k.indexOf('? closedIdsNow() : {}') > 0 && k.indexOf('kbb.inProgress(it.rec, st.preps, st.overview) ? null : closedNow') > 0);
  assert.ok(/Object\.keys\(gs\.sum \|\| \{\}\)\.forEach\(function \(id\) \{ ids\[id\] = true; \}\)/.test(k));   // closedIdsNow: 시작 전 약정(gs.sum)도 포함
});

test('E. CSS: 일정 칸 글자 뒤 바탕은 줄 바탕 변수(hover·late 대응), 새 색·opacity 없음', function () {
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-tt tbody td\.ln \{ --rowbg:var\(--panel\); \}/.test(css));
  assert.ok(/\.hb-tt tbody tr:hover > td\.ln \{ --rowbg:color-mix\(in srgb, var\(--accent-color\) 6%, var\(--panel\)\); \}/.test(css));
  assert.ok(/\.hb-tt tr\.late > td\.ln \{ --rowbg:color-mix\(in srgb, var\(--red\) 8%, var\(--panel\)\); \}/.test(css));
  assert.ok(css.indexOf('tr:hover > td.ln') < css.indexOf('tr.late > td.ln'));
  assert.ok(/\.hb-lane \.off, \.hb-lane \.unk \{ background:var\(--rowbg, var\(--panel\)\); padding:0 4px; box-sizing:border-box; \}/.test(css));
  assert.ok(/\.hb-lane \.off \{ right:2px; max-width:calc\(100% - 4px\);/.test(css));
  assert.ok(!/opacity:\s*(0|\.)/.test(css) && (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length === 0);
  assert.ok(/\.db-soon-tag \{[^}]*font-size:12px;[^}]*border-radius:var\(--r\)/.test(css));   // DESIGN.md 최소 12px·반경 var(--r)(0f qa 이관 11-19)
});
