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
const NOBID = { byId: { ID: { handled_at: '2026-11-17', status_cd: 'NO_BID' } } };   // 가평형: 목표 밖 준비 + 올해 입찰 없음
function outRow(ctx) { return kbb.outRows([{ institutionId: 'ID', name: '라' }], {}, ctx)[0]; }
function cap(h) { return /<caption class="sr-only">([^<]*)<\/caption>/.exec(h)[1]; }

test('A. 목표 밖 준비 줄도 서버 근거(공고 현황·시작 전 약정)로 입찰 종료 — 마감까지 칸·동작 칸', function () {
  const r = outRow(mkCtx({ snap: NOBID }));
  assert.deepStrictEqual(r.closed, { cd: 'NOTICE_NO_BID', date: '2026-11-17' });
  assert.strictEqual(r.late, false); assert.strictEqual(r.hold, false); assert.strictEqual(r.note, null);
  const why = '근거: 입찰 공고 현황 2026-11-17 입찰 없음';
  [true, false].forEach(function (canEdit) {
    const h = kbb.goalRowHtml(r, { canEdit: canEdit });
    assert.ok(h.indexOf('<td title="' + why + '"><b class="hb-dd tx end">입찰 종료</b><span class="sr-only">' + why + '</span></td>') > 0);
    assert.ok(h.indexOf('class="act"') < 0 && h.indexOf('hb-lane') < 0 && h.indexOf('올해 입찰 끝남') < 0);   // 동작 칸 없음(사용자 11-26) — 사실은 마감까지 칸 title·sr
    assert.ok(h.indexOf('hb-wacts') < 0 && h.indexOf('data-act="towatch"') < 0 && h.indexOf('data-act="tonext"') < 0);   // 옮길 목표가 없다
    assert.ok(h.indexOf('D+') < 0 && h.indexOf('추정 지남') < 0 && h.indexOf('class="late"') < 0 && h.indexOf('hb-late') < 0);
  });
  assert.ok(kbb.goalRowHtml(r, { canEdit: true }).indexOf('data-act="add"') > 0);   // 구분 칸의 [목표에 넣기]는 그대로
  // 정렬·거르기: 목표 밖 묶음 안에서 맨 아래, 상태 '입찰 종료'에 걸린다
  const ctx = mkCtx({ snap: NOBID }), two = kbb.outRows([{ institutionId: 'ID', name: '라' }, { institutionId: 'IA', name: '가' }], {}, ctx);
  assert.deepStrictEqual(kbb.filterRows(two, { status: 'closed' }).map(function (x) { return x.id; }), ['ID']);
  assert.strictEqual(kbb.sortBy(two, 'due', 'asc').slice(-1)[0].id, 'ID');
});

test('A. 근거 두 종류만: 시작 전 약정은 종료, 지난해 판정·snap 없음은 종료 아님, 보고 있는 연도가 올해가 아니면 종료 아님', function () {
  const sum = { ID: { lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2027-01-01', term_to: '2030-12-31' }] } };
  const c = outRow(mkCtx({ sumById: sum }));
  assert.deepStrictEqual(c.closed, { cd: 'CONTRACT_DECIDED', date: '2027-01-01' });
  assert.ok(kbb.goalRowHtml(c, { canEdit: true }).indexOf('근거: 금고 약정 2027-01-01 시작 약정이 이미 정해져 있음') > 0);
  assert.strictEqual(outRow(mkCtx({ snap: { byId: { ID: { handled_at: '2025-11-17', status_cd: 'NO_BID' } } } })).closed, null);   // 지난해 판정
  assert.strictEqual(outRow(mkCtx({ snap: { byId: { ID: { handled_at: '2026-11-17', status_cd: 'OPEN' } } } })).closed, null);
  const none = outRow(mkCtx());                                                                                              // snap·약정 없음 = 예전과 같다
  assert.strictEqual(none.closed, null);
  assert.ok(kbb.goalRowHtml(none, { canEdit: true }).indexOf('올해 입찰 끝남') < 0);
  assert.strictEqual(outRow(mkCtx({ snap: NOBID, year: 2027 })).closed, null);                                              // 2027 목표를 보는 중: 올해 근거는 붙이지 않는다
  assert.deepStrictEqual(outRow(mkCtx({ snap: NOBID, year: 2026 })).closed, { cd: 'NOTICE_NO_BID', date: '2026-11-17' });
  const k = src('js/kbboard.js');
  assert.ok(/function goalCtx\(\)[\s\S]*?snap: root\.noticerec && root\.noticerec\.snap \? root\.noticerec\.snap\(\) : null,[\s\S]*?year: gs\.data/.test(k));   // goalCtx가 snap·보고 있는 연도를 넘긴다
});

test('B. 표 caption: 목표 수와 그 밖의 준비 수를 나눠 말하고 \'…곳 중 …곳 보임\'', function () {
  const ctx = mkCtx(), g = kbb.goalRows([{ institution_id: 'IA', tag_cd: 'RETAIN', kind_cd: 'GOAL' }], ctx), o = kbb.outRows([{ institutionId: 'ID', name: '라' }], {}, ctx);
  const base = { st: 'ok', year: 2026, tab: 'goal', canEdit: true, sort: { key: 'due', dir: 'asc' } };
  const t = function (x) { return cap(kbb.goalTableHtml(Object.assign({}, base, x))); };
  assert.strictEqual(t({ rows: g.concat(g), out: [], total: 3 }), '2026 목표 기관 3곳 중 2곳 보임, 마감까지 오름차순');                                              // 목표 밖 없음
  assert.strictEqual(t({ rows: g, out: o, total: 2, nGoal: 1, nOut: 1 }), '2026 목표 기관 1곳과 그 밖의 제안서 준비 중인 기관 1곳, 2곳 중 2곳 보임, 마감까지 오름차순');
  assert.strictEqual(t({ rows: g, out: [], total: 4, nGoal: 3, nOut: 1 }), '2026 목표 기관 3곳과 그 밖의 제안서 준비 중인 기관 1곳, 4곳 중 1곳 보임, 마감까지 오름차순');   // 거른 뒤에도 거르기 전 수
  assert.strictEqual(t({ rows: g, out: o, sort: null }), '2026 목표 기관 1곳과 그 밖의 제안서 준비 중인 기관 1곳, 마감 가까운 순');
  assert.strictEqual(t({ rows: g, out: [], sort: null }), '2026 목표 기관 1곳, 마감 가까운 순');
  assert.strictEqual(t({ tab: 'watch', rows: g, out: [], total: 1, nGoal: 1, nOut: 1, sort: { key: 'next', dir: 'asc' } }), '내 관심 기관 1곳 중 1곳 보임, 공고·다음 협약 종료 오름차순');   // 관심 탭은 목표 밖 말 없음
  assert.ok(kbb.cntHtml(2, 2).indexOf('<b>2</b> / <b>2</b>곳') > 0);                                                       // 보이는 건수는 그대로
});

test('C. 단계 줄: 목표 밖 줄이 있으면 \'… 포함\' 문장·그룹·버튼 aria-label, 없거나 자료를 못 받으면 예전 모양', function () {
  const c = [0, 2, 0, 0, 1], oc = [0, 1, 0, 0, 0];
  const h = kbb.stagesHtml(c, { ok: true, active: -1, nOut: 1, outCounts: oc });
  assert.ok(h.indexOf('role="group" aria-label="제안 진행 단계, 그 밖의 제안서 준비 중인 기관 1곳 포함"') > 0);
  assert.ok(h.indexOf('</button><div class="ft"><div class="notes"><span class="note">그 밖의 제안서 준비 중인 기관 1곳 포함</span></div></div></div>') > 0);
  assert.ok(h.indexOf('aria-label="제안 준비 2곳(그 밖의 준비 기관 1곳) — 표를 이 단계로 거르기"') > 0);
  assert.ok(kbb.stagesHtml(c, { ok: true, active: 1, nOut: 1, outCounts: oc }).indexOf('aria-label="제안 준비 2곳(그 밖의 준비 기관 1곳) — 거르기 끄기"') > 0);
  assert.ok(h.indexOf('곳 — 표를 이 단계로 거르기') > 0 && (h.match(/\(그 밖의 준비 기관/g) || []).length === 1);   // 목표 밖이 없는 단계는 예전 문장
  const plain = kbb.stagesHtml(c, { ok: true, active: -1, nOut: 0, outCounts: [0, 0, 0, 0, 0] });
  assert.ok(plain.indexOf('aria-label="제안 진행 단계"') > 0 && plain.indexOf('class="ft"') < 0 && plain.indexOf('(그 밖의') < 0);
  const off = kbb.stagesHtml([0, 0, 0, 0, 0], { ok: false, why: '이유', nOut: 3, outCounts: oc });
  assert.ok(off.indexOf('포함') < 0 && off.indexOf('<span class="note">이유</span>') > 0);
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

test('F. 팝업 canAdd: 목표·관심 칩, 권한 없음, 다음 협약, 2년 밖, 국민은행 확정, 올해 입찰 종료이면 숨긴다', function () {
  const r = rec('I1', '가'), it = { key: '11|가', name: '가', region: '11', endDate: '2026-12-31', rec: r };
  const o = { mark: '', can: true, isNext: false, verified: [], closedIds: {}, years: [2026, 2027, 2028] };
  assert.strictEqual(kbb.popCanAdd(it, o), true);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { mark: '관심' })), false);   // 옛 호출: 칩이 있으면 숨김
  // P2-1: 팀 목표와 내 관심은 따로 움직인다 — [목표에 넣기]는 팀 목표에 이미 있을 때만 숨고, 내 관심 칩만 붙은 줄에는 보인다
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { mark: '내 관심', inGoal: false, inWatch: true })), true);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { mark: '2026 목표', inGoal: true })), false);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { can: false })), false);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { isNext: true })), false);
  assert.strictEqual(kbb.popCanAdd(Object.assign({}, it, { endDate: '2031-01-01' }), o), false);
  const stay = [{ key: '11|가', name: '가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  assert.strictEqual(kbb.staysText(r, stay), '국민은행 확정');
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { verified: stay })), false);   // 광진형: 칩이 이유를 말한다
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { closedIds: { I1: true } })), false);   // 올해 입찰 종료
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { closedIds: { I9: true } })), true);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('canAdd: kbb.popCanAdd(it, {') > 0 && k.indexOf('? closedIdsNow() : {}') > 0 && k.indexOf('kbb.inProgress(it.rec, st.preps, st.overview) ? null : closedNow') > 0);
  assert.ok(/Object\.keys\(gs\.sum \|\| \{\}\)\.forEach\(function \(id\) \{ ids\[id\] = true; \}\)/.test(k));   // closedIdsNow: 시작 전 약정(gs.sum)도 포함
});

test('E. CSS: 12개월 칸 CSS(줄 바탕 변수·글자 뒤 바탕)는 없다, 새 색·opacity 없음', function () {
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.indexOf('--rowbg') < 0 && css.indexOf('hb-lane') < 0 && css.indexOf('td.ln') < 0);
  assert.ok(!/opacity:\s*(0|\.)/.test(css) && (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length === 0);
  assert.ok(/\.db-soon-tag \{[^}]*font-size:12px;[^}]*border-radius:var\(--r\)/.test(css));   // DESIGN.md 최소 12px·반경 var(--r)(0f qa 이관 11-19)
});

test('G. 4-1·4-2 국민은행 확정 칩: CI 변수 대비 자동 시험, popCanWatch, [관심에 넣기]는 확정 줄에만 · 목표 버튼과 겹치지 않는다', function () {
  const html = src('index.html');
  const root = /:root \{([^}]*)\}/.exec(html)[1];
  const lum = function (h) { const c = [1, 3, 5].map(function (i) { const v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = function (a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const tok = function (n) { const m = new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})').exec(root); assert.ok(m, n); return m[1]; };
  const banks = []; root.replace(/--bk-([a-z]+):\s*#[0-9a-fA-F]{6}/g, function (_, b) { banks.push(b); return ''; });
  assert.deepStrictEqual(banks, ['kb']);
  banks.forEach(function (b) {
    assert.ok(cr(tok('bk-' + b + '-ink'), tok('bk-' + b)) >= 4.5, b + ' 글자 대 바탕');
    assert.ok(cr(tok('bk-' + b + '-edge'), '#ffffff') >= 3, b + ' 테두리 대 흰 바탕');
  });
  assert.strictEqual(tok('bk-kb').toLowerCase(), '#ffbc00'); assert.strictEqual(tok('bk-kb-edge').toLowerCase(), '#545045');   // 출처 kbfg.com CI 값
  // popCanWatch
  const stay = [{ key: '11|가', name: '가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  const r = rec('I1', '가'), it = { key: '11|가', name: '가', region: '11', endDate: '2026-12-31', rec: r };
  const o = { mark: '', can: true, verified: stay, noWatch: false };
  assert.strictEqual(kbb.popCanWatch(it, o), true);
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { mark: '관심' })), false);
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { mark: '2026 목표' })), false);   // 옛 호출: 칩이 있으면 숨김
  // P2-1: [관심에 넣기]는 내 관심에 이미 있을 때만 숨고, 팀 목표 칩만 붙은 줄에는 보인다
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { mark: '2026 목표', inGoal: true, inWatch: false })), true);
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { mark: '내 관심', inWatch: true })), false);
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { can: false })), false);       // 읽기 전용
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { verified: [] })), false);     // 확정 줄이 아님
  assert.strictEqual(kbb.popCanWatch(it, Object.assign({}, o, { noWatch: true })), false);    // 옛 서버
  assert.strictEqual(kbb.popCanWatch(Object.assign({}, it, { rec: rec('', '가') }), o), false);
  assert.strictEqual(kbb.popCanAdd(it, Object.assign({}, o, { years: [2026, 2027, 2028], closedIds: {} })), false);   // 목표에 넣기는 계속 숨김
  // rowHtml: 확정 줄에는 owatch만, oadd 없음. aria-label에 기관명
  const sit = Object.assign({ endDays: 40, days: 40, date: '2027-02-01', label: '', confidence: '추정', overdue: false }, it);
  const w = kbb.rowHtml(sit, { verified: stay, nextList: [], canWatch: true });
  assert.ok(w.indexOf('<li class="hb-rl">') === 0 && w.indexOf('data-act="owatch" data-inst="I1" data-key="11|가" aria-label="가 관심에 넣기">관심에 넣기</button></li>') > 0 && w.indexOf('data-act="oadd"') < 0);
  assert.ok(kbb.rowHtml(sit, { verified: stay, nextList: [] }).indexOf('owatch') < 0);                      // canWatch 없음(읽기 전용·관심 칩)
  assert.ok(kbb.rowHtml(sit, { verified: stay, nextList: [], canAdd: true, canWatch: true }).indexOf('owatch') < 0);   // 둘 다면 목표 쪽(실제로는 겹치지 않는다)
  const k = src('js/kbboard.js');
  assert.ok(/else if \(act === 'owatch'\) \{ closePop\(false\); openAdd\(\{ id: inst, kind: 'WATCH', opener: \$\('hb-ours-btn'\) \}\); \}/.test(k));
  assert.ok(k.indexOf('canWatch: kbb.popCanWatch(it, {') > 0 && k.indexOf('noWatch: noWatchNow()') > 0);
  // CSS: CI 칩은 이 칩에만, 현황판 블록에 지역 변수·hex 없음(기존 시험이 이미 지킴)
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-slot\.hb-bank \{[^}]*font-weight:700/.test(css) && /\.hb-slot\.hb-bank svg \{ width:12px; height:12px;/.test(css) && /@media \(forced-colors:active\) \{ \.hb-slot\.hb-bank \{ border-color:CanvasText; \} \}/.test(css));
  assert.ok(css.indexOf('var(--bk-kb)') === css.lastIndexOf('var(--bk-kb)'));                              // 배경에 쓰는 곳은 한 군데
});

test('H. 4-4 결과 알림: 띠 아래 순서·상태 영역 밖 버튼·옮긴 뒤 포커스·줄/탭 강조·동작 줄이기', function () {
  const k = src('js/kbboard.js'), html = src('index.html');
  assert.ok(k.indexOf('<div class="hb-note" id="hb-note" hidden>') > 0 && k.indexOf('<div id="hb-flash" class="db-flash" role="status"></div><span id="hb-flash-act"></span></div>') > 0);   // 버튼은 status 바깥 형제
  assert.ok(k.indexOf('<div class="hb-top">') < k.indexOf('id="hb-err"') && k.indexOf('id="hb-err"') < k.indexOf('class="hb-band" id="hb-band"') && k.indexOf('class="hb-band" id="hb-band"') < k.indexOf('id="hb-note"') && k.indexOf('id="hb-note"') < k.indexOf('id="hb-goals"'));   // 제목 → 오류 → 띠 → 알림 → 표(qa P3-4)
  assert.ok(/function flash\(msg, act, kind\) \{\s*const n = \$\('hb-note'\); if \(n\) \{ n\.hidden = !msg;[\s\S]*?textContent = msg \|\| ''/.test(k));   // hidden 먼저, 글은 그 뒤(P3-3)
  assert.ok(/kbb\.unmount = function \(\) \{[\s\S]*?gs\.just = null; gs\.focusNext = null; gs\.seeInst = '';/.test(k));   // P3-2
  assert.ok(/kbb\.onProfileChange = function \(\) \{[\s\S]*?gs\.just = null; gs\.seeInst = '';[\s\S]*?dash\.clearGoals\(\)/.test(k) && /kbb\.onProfileChange = function \(\) \{[\s\S]*?gs\.focusNext = null;/.test(k));
  assert.strictEqual(kbb.seeWatchHtml(), '<button type="button" class="hb-tag" id="hb-see-watch" data-see="watch">내 관심 탭에서 보기</button>');
  assert.ok(/function flash\(msg, act, kind\) \{[\s\S]*?\$\('hb-flash-act'\)[\s\S]*?msg && act === 'watch' \? kbb\.seeWatchHtml\(\) : ''/.test(k));
  assert.ok(!/const toWatch = m\.cmd === 'towatch'/.test(k) && !/toWatch && !noWatchNow\(\)\) \{ gs\.focusNext = \{ note: true \}/.test(k));   // 줄 단추 목표→관심 갈래는 없다(사용자 11-26, qa P3-2) — 이 창은 관심→목표만
  assert.ok(k.indexOf("'towatch': '내 관심으로 옮기기'") < 0 && k.indexOf('moveWatch') < 0);   // 닿지 않던 towatch 갈래·상수 제거(사용자 11-26)
  assert.ok(/gs\.focusNext = \{ inst: r\.id, reveal: true \};\s*gs\.just = \{ inst: r\.id \};/.test(k));   // 관심→목표: 그 줄 강조
  assert.ok(/say\(kbb\.flashMoved\(r\.name, 'GOAL', m\.year\)[^\n]*, false, ''\)/.test(k));
  assert.ok(/if \(f\.note\) \{[^}]*\$\('hb-see-watch'\)[^}]*\$\('hb-add'\)[\s\S]*?return;\s*\}/.test(k));                                  // 포커스: [관심 탭에서 보기], 없으면 [목표 기관 추가]
  assert.ok(/gs\.just = \{ inst: m\.inst\.id \};/.test(k) && /gs\.just = id \? \{ inst: id \} : null;/.test(k) && /gs\.just = \{ inst: r\.id \};/.test(k));
  assert.ok(/restoreFocus\(sc, keepKey\);\s*applyFocusNext\(\);\s*applyJust\(\);/.test(k));
  assert.ok(/function applyJust\(\) \{[\s\S]*?gs\.st === 'loading'\) return;[\s\S]*?classList\.add\('hb-just'\);[\s\S]*?setTimeout\(function \(\) \{ el\.classList\.remove\('hb-just'\); \}, 4000\)/.test(k));
  assert.ok(/else if \(btn\.id === 'hb-see-watch'\) seeWatch\(\);/.test(k) && /function seeWatch\(\) \{[\s\S]*?showRow\('watch', gs\.seeInst \|\| '', 0\);/.test(k));
  assert.ok(!/(^|[^.\w])confirm\(/.test(k) && /textContent = msg \|\| ''/.test(k));                                                          // 서버 글은 textContent
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-note \{[^}]*border:1px solid color-mix\(in srgb, var\(--blue\) 55%, var\(--line\)\)[^}]*background:color-mix\(in srgb, var\(--blue\) 8%, var\(--panel\)\)/.test(css) && /\.hb-note\[hidden\] \{ display:none; \}/.test(css));
  assert.ok(/@keyframes hbJust \{ 0%, 55% \{ background:color-mix\(in srgb, var\(--accent-color\) 14%, var\(--panel\)\); \} \}/.test(css));   // 100% 없음 = 끝은 원래 바탕
  assert.ok(/@media \(prefers-reduced-motion:reduce\) \{ \.hb-note \{ animation:none; \}[\s\S]*?\.hb-just[^{]*\{ animation:none; background:color-mix\(in srgb, var\(--accent-color\) 10%, var\(--panel\)\); \} \}/.test(css));
  assert.ok(!/border-left:\s*3px/.test(css.slice(css.indexOf('.hb-note {'))));                                                          // 왼쪽 굵은 띠 금지(design)
});

test('I. 국민은행 확정 판정(사용자 11-19): 같은 구절에 국민+수성·재선정·유지, 추측·조건 말이 있으면 칩 없음, 일정 예정은 확정', function () {
  assert.strictEqual(kbb.staysSure('2026 회차 국민은행 수성(기사 2026-11-04) · 지정 공고 2026-11-03'), true);
  assert.strictEqual(kbb.staysSure('KB국민 재선정 · 약정 2027-01-01~2030-12-31(2026-10-21 체결)'), true);
  assert.strictEqual(kbb.staysSure('부금고 국민은행 유지 · 약정 2027-01-01~2030-12-31(지정 공고 제2026-936호, 2026-10-30)'), true);
  assert.strictEqual(kbb.staysSure('재선정 · 약정 2027-01-01~2030-12-31(체결 예정)'), false);                   // 국민이 같은 구절에 없다
  assert.strictEqual(kbb.staysSure('국민은행 재선정 · 약정 2027-01-01~2030-12-31(체결 예정)'), true);         // 일정 예정은 확정
  assert.strictEqual(kbb.staysSure('국민은행 유지할지 기대된다'), false);
  assert.strictEqual(kbb.staysSure('국민은행 수성 전망'), false);
  assert.strictEqual(kbb.staysSure('국민은행 유지 예정'), false);
  assert.strictEqual(kbb.staysSure('국민은행 수성 여부 주목'), false);
  assert.strictEqual(kbb.staysSure('동작구까지 지키면 국민은행 수성'), false);
  assert.strictEqual(kbb.staysSure('국민은행 수성 실패'), false);
  assert.strictEqual(kbb.staysSure('2027~2030은 1금고 농협·2금고 신한(기사 2026-09-30) — 국민은행 빠짐'), false);
  assert.strictEqual(kbb.staysSure(''), false);
  // qa 11-19 재작성: 괄호 출처·다른 낱말 오탐·부정어·예정·공백 없는 가운뎃점
  assert.strictEqual(kbb.staysSure('농협 수성(국민일보 2026-11-04)'), false);
  assert.strictEqual(kbb.staysSure('KBS 보도 신한 유지'), false);
  assert.strictEqual(kbb.staysSure('KB증권 유지'), false);
  assert.strictEqual(kbb.staysSure('국민은행 수성 불발'), false);
  assert.strictEqual(kbb.staysSure('국민은행 재선정 탈락'), false);
  assert.strictEqual(kbb.staysSure('국민은행 수성 무산'), false);
  assert.strictEqual(kbb.staysSure('국민은행 재선정 결과 발표 예정'), false);
  assert.strictEqual(kbb.staysSure('국민은행 1·2금고 모두 수성'), true);
  assert.strictEqual(kbb.staysSure('국민은행 재선정, 약정 체결하면서'), true);
  assert.strictEqual(kbb.staysSure('예상대로 국민은행 수성'), true);
  assert.strictEqual(kbb.staysSure('1금고 신한 유지, 국민은행 빠짐'), false);
  // 실제 자료: kb-verified.js의 next 중 확정으로 읽혀야 하는 5건
  const KV = require('../data/kb-verified.js');
  const list = (KV && (KV.KB_VERIFIED || KV.verified || KV)) || [];
  const arr = Array.isArray(list) ? list : (Array.isArray(list.list) ? list.list : []);
  const nexts = arr.map(function (e) { return e && e.next; }).filter(Boolean);
  assert.strictEqual(nexts.filter(function (t) { return kbb.staysSure(t); }).length, 5);
});
