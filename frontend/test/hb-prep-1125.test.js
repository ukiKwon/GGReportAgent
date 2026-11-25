'use strict';
// 입찰 현황판 [제안 사전준비]·구분 메뉴 줄이기·고른 기관 띠(사용자 11-25 A~E, design-reviewer 2026-11-25_0952_a9a91eed).
// DOM 없이: prepState(상태 표 8행)는 소스에서 떼어 가짜 값으로 실행하고, 나머지 배선은 소스 단언으로 본다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tc = require('../js/tchange.js');
const dash = require('../js/dashboard.js');

function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); }
const K = src('js/kbboard.js');

// kbboard.js의 prepState를 떼어 실행한다(IIFE 안 함수라 소스에서 잘라 쓴다)
function makePrepState(env) {
  const a = K.indexOf('  function prepState() {'), b = K.indexOf('  function paintPrep() {');
  assert.ok(a > 0 && b > a);
  const body = K.slice(a, b);
  const sel = env.sel;
  const U = { actCtx: function () { return { role: env.role === undefined ? '영업팀' : env.role }; }, serverMode: function () { return env.server !== false; }, hasEmp: function () { return true; }, gateOpts: function () { return {}; }, todayDate: function () { return new Date(); } };
  const D = { CONFIRM_WHY: dash.CONFIRM_WHY, isViewOnly: function () { return !!env.viewOnly; }, proposeEarly: function () { return !!env.early; } };
  const fn = new Function('tc', 'U', 'P', 'dash', 'gs', 'canEditNow', 'BYID', 'actOf', 'goalMode', 'prepOfId', 'prepFailMsg', body + '\nreturn prepState;');
  return fn(tc, U, function () { return { CONFIRM_ROLES: ['영업팀', '영업팀장'] }; }, D, { sel: sel, st: env.st === undefined ? 'ok' : env.st }, function () { return env.canEdit !== false; }, env.byId || { G1: { institutionId: 'G1' } }, function () { return env.act || 'confirm'; },
    function () { return env.mode === undefined ? 'DIRECT' : env.mode; },
    function () { return env.prep; },
    function (id, fb) { return dash.prepNoViewMsg(env.prep, fb); })();
}
function sel1(o) { const s = tc.newSel(); tc.pick(s, Object.assign({ id: 'G1', name: '노원구청', regionName: '서울', kind: 'GOAL', targetNo: 1, year: new Date().getFullYear() }, o || {})); return s; }

test('B 상태 표: 숨김 조건(역할·보기 전용·서버 미연결·편집 권한 없음)', function () {
  assert.deepStrictEqual(makePrepState({ sel: sel1(), role: '영업부장' }), { hidden: true });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), role: '전산팀' }), { hidden: true });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), viewOnly: true }), { hidden: true });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), server: false }), { hidden: true });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), canEdit: false }), { hidden: true });
});

test('B 상태 표: 0곳·2곳 이상·관심·wait·종료 계열은 꺼짐 + 이유 문장(기관 이름 없이 누를 수 없는 경우만 이름 포함)', function () {
  const r0 = makePrepState({ sel: tc.newSel() });
  assert.deepStrictEqual(r0, { why: '표에서 기관 하나를 고르면 켜집니다.' });
  const s2 = sel1(); tc.pick(s2, { id: 'G2', name: '수원시', regionName: '경기', kind: 'GOAL', targetNo: 2 });
  assert.deepStrictEqual(makePrepState({ sel: s2 }), { why: '기관을 하나만 고르세요. 지금 2곳을 골랐습니다.' });
  assert.deepStrictEqual(makePrepState({ sel: sel1({ kind: 'WATCH' }) }), { why: '관심 기관은 목표 기관이 된 뒤에 시작합니다.' });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), act: 'wait' }), { why: '제안 진행 상황을 확인하는 중입니다.' });
  ['closed', 'past', 'nobid', 'delayed'].forEach(function (a) {
    assert.deepStrictEqual(makePrepState({ sel: sel1(), act: a }), { why: dash.CONFIRM_WHY[a] }, a);   // 상세 팝업과 같은 문장
  });
  assert.deepStrictEqual(makePrepState({ sel: sel1(), byId: {} }), { why: '서울 노원구청은 공고 정보를 찾지 못해 시작할 수 없습니다.' });
});

test('B 상태 표: 목표 + confirm(공고 전 포함)은 켜짐(확인 상자), open은 켜짐(바로 이동)', function () {
  const c = makePrepState({ sel: sel1() });
  assert.strictEqual(c.on, true); assert.strictEqual(c.open, undefined); assert.strictEqual(c.early, false);
  assert.strictEqual(c.nm, '서울 노원구청');
  assert.strictEqual(c.why, '서울 노원구청을 확정하고 제안 준비 현황으로 갑니다.');
  assert.strictEqual(makePrepState({ sel: sel1(), early: true }).early, true);   // 공고 전 목표 기관은 본문 3(평문)만 더한다
  const o = makePrepState({ sel: sel1(), act: 'open' });
  assert.deepStrictEqual([o.on, o.open, o.why], [true, true, '노원구청은 사전준비 중입니다. 누르면 그 화면으로 갑니다.']);
});

test('열람 규칙: can_view false인 사전준비 건은 이동하지 않고 담당자 안내(패치 A·B)', function () {
  const MSG = ' 담당으로 사전준비가 진행 중이라 상세를 볼 수 없습니다. 영업팀장·영업부장에게 문의하세요.';
  // B: open 분기 — false면 꺼짐 + 이유, true/undefined면 기존 동작
  const f = makePrepState({ sel: sel1(), act: 'open', prep: { can_view: false, assignee_names: ['김담당', '이담당'] } });
  assert.deepStrictEqual(f, { on: false, why: '김담당, 이담당' + MSG });
  assert.strictEqual(makePrepState({ sel: sel1(), act: 'open', prep: { can_view: false } }).why, '다른 담당자' + MSG);
  assert.strictEqual(makePrepState({ sel: sel1(), act: 'open', prep: { can_view: true } }).on, true);
  assert.strictEqual(makePrepState({ sel: sel1(), act: 'open', prep: {} }).on, true);
  // 문구 도우미: false가 아니면 fallback 그대로
  assert.strictEqual(dash.prepNoViewMsg({ can_view: false, assignee_names: ['박'] }, 'x'), '박' + MSG);
  assert.strictEqual(dash.prepNoViewMsg({}, 'x'), 'x');
  assert.strictEqual(dash.prepNoViewMsg(undefined, 'x'), 'x');
  // A: goPrep — false면 openNavItem을 부르지 않고 false
  const D = src('js/dashboard.js'), a = D.indexOf('  function goPrep(prep) {'), b = D.indexOf('  dash.goPrep = goPrep;');
  assert.ok(a > 0 && b > a);
  let opened = 0;
  const root = { prep: { SOON_ID: 'soon', openCase: function () { opened++; } }, app: { openNavItem: function () { opened++; } } };
  const goPrepFn = new Function('root', D.slice(a, D.indexOf('\n  }\n', a) + 4) + '\nreturn goPrep;')(root);
  assert.strictEqual(goPrepFn({ can_view: false, bid_case_id: 1 }), false);
  assert.strictEqual(opened, 0);   // 이동도 케이스 열기도 하지 않는다
  assert.strictEqual(goPrepFn({ can_view: true, bid_case_id: 1 }), true);
  assert.strictEqual(opened, 2);
  assert.strictEqual(goPrepFn({ bid_case_id: 1 }), true);   // can_view 없음 = 기존 동작
  // 호출부 문구 배선(소스)
  assert.ok(src('js/kbboard.js').indexOf('prepFailMsg(s.e.id,') > 0 && src('js/kbboard.js').indexOf('prepFailMsg(e.id,') > 0);
  assert.ok((D.match(/prepNoViewMsg\(p,/g) || []).length >= 2);
});

test('B 배선: 툴바 마크업·위치·페인트·꺼짐 클릭·확인 상자·409·성공 이동', function () {
  // 마크업: #hb-ours-btn 다음 · #hb-add 앞, aria-disabled(꺼져도 Tab), sr-only 이유 문장, 처음엔 hidden
  assert.ok(K.indexOf('id="hb-ours-btn" aria-haspopup="dialog" aria-disabled="true">협약 중인 기관</button>\' +') > 0);
  const ours = K.indexOf('id="hb-ours-btn"'), prep = K.indexOf('<button type="button" id="hb-prep" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-prep-why" title="표에서 기관 하나를 고르면 켜집니다." hidden>제안 사전준비</button><span id="hb-prep-why" class="sr-only">표에서 기관 하나를 고르면 켜집니다.</span>'), add = K.indexOf('<button type="button" id="hb-add" hidden>');
  assert.ok(ours > 0 && prep > ours && add > prep);
  // paintSel이 early return 앞에서 칠한다(띠가 숨은 0곳에서도 이유가 갱신된다)
  assert.ok(/function paintSel\(\) \{\n    const mode = goalMode\(\), n = tc\.selCount\(gs\.sel\), bar = \$\('hb-selbar'\), all = \$\('hb-pickall'\);\n    paintPrep\(\);\n/.test(K));
  assert.ok(K.indexOf("b.setAttribute('aria-disabled', !s.on || gs.prepBusy ? 'true' : 'false');") > 0 && K.indexOf("if (s.open) b.removeAttribute('aria-haspopup'); else b.setAttribute('aria-haspopup', 'dialog');") > 0);
  assert.ok(K.indexOf("b.title = s.why;") > 0 && K.indexOf("wy.textContent !== s.why") > 0);
  // 꺼짐을 누르면 아무것도 실행하지 않고 이유만 상태 줄에
  assert.ok(K.indexOf("if (!s.on) { flash(s.why); return; }") > 0 && K.indexOf("case 'hb-prep': prepClick(btn); break;") > 0);
  // 확인 상자: 제목 '제안 사전준비 — {지역} {기관명}', 실행 [확정하고 이동], 취소가 첫 포커스(focusGo 없음)
  assert.ok(K.indexOf("title: '제안 사전준비 — ' + s.nm, text: lines.join('\\n'), go: dash.PREP_CONFIRM_GO, cancel: '취소'") > 0 && K.indexOf('focusGo') < 0);
  assert.ok(K.indexOf('dash.PREP_BODY2') > 0 && K.indexOf('if (s.early) lines.push(dash.PREP_BODY3);') > 0);
  assert.ok(K.indexOf('취소할 수 있습니다') < 0);   // 본문 4(취소 문장)는 서버 규칙 확인 전까지 넣지 않는다
  // 확정은 기존 POST /preps(dash.postConfirm, 화면 이름 bid_board) → 성공이면 goPrep, 409 PREP_ALREADY_ACTIVE면 오류 없이 그 건으로
  assert.ok(K.indexOf("dash.postConfirm(e.id, 'bid_board')") > 0 && K.indexOf('if (dash.goPrep(x.body)) return;') > 0);
  assert.ok(/if \(f\.again\) \{[^}]*loadProgress\(\)\.then\(function \(\) \{ if \(host && !openPrepOf\(e\.id\)\)/.test(K));
  assert.ok(K.indexOf("say(String(f.msg || '').indexOf(e.name) >= 0 ? f.msg : e.name + ' 제안 사전준비: ' + f.msg, true);") > 0);   // P3-2 기관 이름 접두(이미 있으면 생략)
  assert.ok(K.indexOf("'확정하는 중…'") > 0);   // 보내는 중에는 단추 글자가 바뀌고 aria-disabled
  assert.ok(K.indexOf('kbb.findOpener') > 0 && K.indexOf("classList.contains('hb-confirm')") < 0);   // 줄 [제안 확정] 클릭 분기는 없다
  // 서버 쪽 이름 규약: 이 화면은 서버 변경 없이 현재 POST /preps를 쓴다
  assert.ok(K.indexOf('/preps/') < 0 || K.indexOf("fetch('/preps") < 0);
  const D = src('js/dashboard.js');
  assert.ok(D.indexOf('dash.goPrep = goPrep;') > 0);
});

test('B CSS: 테두리 버튼(채운 예외 아님), 높이 32, 꺼짐은 muted(현황판 블록 opacity 금지)', function () {
  const html = src('index.html');
  assert.ok(html.indexOf('#hb-prep { height:32px; padding:0 14px; font-size:12px; }') > 0);
  assert.ok(html.indexOf('#hb-prep[aria-disabled="true"] { color:var(--muted); border-color:var(--line); cursor:default; }') > 0);
  assert.ok(html.indexOf('.hb-top #hb-prep[hidden] { display:none; }') > 0);
  const blk = html.slice(html.indexOf('#hb-prep {'), html.indexOf('.hb-top #hb-prep[hidden]')).replace(/\/\*[\s\S]*?\*\//g, '');   // 주석은 뺀다
  assert.ok(blk.indexOf('background:var(--accent-color)') < 0 && !/opacity/.test(blk));
});

test('C [관심에서 빼기…] 단추와 구분 메뉴 호출부: 메뉴에는 tags·def만 넘기고 관심 줄은 줄 안 단추로', function () {
  assert.ok(K.indexOf("kbb.menuHtml(r, { tags: canValueEdit(r) ? tagList() : [], def: kbb.fitTag(kbb.defaultTag(r.rec, gs.sum[r.id], tagOpts()), tagList()) });") > 0);
  assert.ok(K.indexOf("if (o.canEdit && !r.pend && r.canCancel) act += '<button type=\"button\" class=\"hb-tag\" data-act=\"unwatch\"") > 0);
  const css = src('index.html');
  assert.ok(css.indexOf('.hb-tag[data-act="unwatch"] { margin-left:6px; }') < 0);   // P2-2: 여백 규칙은 묶음 gap으로 대체
  assert.ok(css.indexOf('.hb-wacts { display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; }') > 0);
  const w = kbbMod.watchRowHtml(wrow({ movable: 2027, canCancel: true, nextDate: '2027-06-30', next: { src: 'contract' } }), { canEdit: true });   // 순서 [목표로 옮기기…] → [메모 고치기…] → [관심에서 빼기…], 한 묶음
  assert.ok(w.indexOf('<div class="hb-wacts">') > 0 && w.indexOf('>목표로 옮기기…</button>') > 0);
  assert.ok(w.indexOf('data-act="togoal"') < w.indexOf('data-act="memo"') && w.indexOf('data-act="memo"') < w.indexOf('data-act="unwatch"'));
  assert.ok(w.indexOf('</div></td></tr>') > w.indexOf('data-act="unwatch"'));
});

test('C [수정하기…] 두 칸 창 배선: 같은 uid로 두 묶음, 칸 전환은 본문·안내·글자만, 제외는 두 묶음에서, 제목 하나', function () {
  assert.ok(K.indexOf("const sets = { edit: [], approval: [] };") > 0 && K.indexOf('sets.edit.push(it); sets.approval.push(ia);') > 0);
  assert.ok(K.indexOf("const kind0 = edit ? (av.edit.on ? 'edit' : 'approval') : 'approval';") > 0);   // 기본은 켜진 첫 칸
  assert.ok(K.indexOf("if (t.name === 'tc-mode') { chSwitchMode(d, t.value); return; }") > 0);
  assert.ok(K.indexOf("d.kind = kind; d.items = d.sets[kind]; d.mode = kind === 'edit' ? 'DIRECT' : d.apprMode;") > 0);   // 보내는 것은 보이는 쪽뿐, 반대쪽 항목은 모델에 남아 입력값이 남는다
  assert.ok(K.indexOf("(d.sets ? d.sets.edit.concat(d.sets.approval) : d.items).some(function (x) { return x.touched; })") > 0);   // 바꿔 오가며 고친 값도 '고친 것'으로 본다
  assert.ok(K.indexOf("if (d.sets[k] === d.items) return;") > 0);
  assert.ok(K.indexOf("tc.editTitle(d.items.length) : tc.dlgTitle(d.mode, d.items.length)") > 0);
  // 협약 개시일: 일괄 저장은 다음 단계 — 줄 안 [협약 개시일 적기…]가 개시일 창을 연다(구분 메뉴에서 옮겨 온 입구)
  assert.ok(K.indexOf("else if (b.classList.contains('tc-termgo')) chTermGo(d, b);") > 0 && K.indexOf('openTerm(r, $(\'hb-seledit\') || $(\'hb-goals\'));') > 0);
  assert.ok(src('index.html').indexOf('.tc-mode label:has(input:checked) { background:color-mix(in srgb, var(--accent-color) 16%, var(--panel)); z-index:1; }') > 0);
});

test('D 구분 저장 성공 뒤에만 목표 줄 자동 체크 + 일반색 알림, 한도는 CAP_MSG', function () {
  const a = K.indexOf('function changeTag(r, code, btn) {'), b = K.indexOf('// ── 목표 줄 구분·메모를 결재 없이 바로 고칠 수 있는가');
  assert.ok(a > 0 && b > a);
  const f = K.slice(a, b);
  const savedAt = f.indexOf("if (o.kind === 'saved') {"), pickAt = f.indexOf('const was = tc.isPicked(gs.sel, r), pk = tc.pick(gs.sel, tc.entryOfRow(r));'), loadAt = f.indexOf('loadGoals();', pickAt), elseAt = f.indexOf("} else if (o.kind === 'nochange')");
  assert.ok(savedAt > 0 && pickAt > savedAt && loadAt > pickAt && elseAt > loadAt);   // 저장 성공 분기 안, loadGoals 앞
  assert.strictEqual((f.match(/tc\.pick\(/g) || []).length, 1);                        // 실패·nochange·stale 분기에는 고르기가 없다
  assert.ok(f.indexOf("if (tc.pickable(r) && r.kind !== 'WATCH') {") > 0);              // 관심 줄·결재 중 줄은 체크하지 않는다
  assert.ok(f.indexOf("gs.selMsg = pk.ok ? '' : pk.msg;") > 0 && f.indexOf('gs.selNote = pk.ok && !was ? tc.autoPickNote(r.name) : \'\';') > 0);   // 한도면 CAP_MSG(경고), 이미 골랐으면 알림 없음
  // 동작: tc.pick + autoPickNote
  const s = tc.newSel(), e = { id: 'A', name: '노원구청', targetNo: 1, kind: 'GOAL' };
  assert.deepStrictEqual(tc.pick(s, e), { ok: true });
  assert.strictEqual(tc.selCount(s), 1);
  const full = tc.newSel();
  for (let i = 0; i < tc.MAX_ITEMS; i += 1) tc.pick(full, { id: 'X' + i, targetNo: 1, kind: 'GOAL' });
  assert.deepStrictEqual(tc.pick(full, e), { ok: false, msg: tc.CAP_MSG });          // 20곳이 차면 체크하지 않고 CAP_MSG
  assert.strictEqual(tc.selCount(full), tc.MAX_ITEMS);
  // 알림은 다음 고르기 조작에서 지운다
  assert.ok(K.indexOf("gs.selNote = '';   // 구분 저장 뒤 자동으로 골라 둔 알림은 다음 고르기 조작에서 지운다") > 0 && K.indexOf("tc.clearSel(gs.sel); gs.selMsg = ''; gs.selNote = '';") > 0);
  assert.ok(src('index.html').indexOf('.hb-selbar .note { color:var(--muted); font-weight:400; }') > 0);
});

test('E [수정하기…]는 띠 오른쪽 끝 유지(.sp 다음 마지막 단추)', function () {
  const b = tc.selbarHtml();
  assert.ok(b.indexOf('<span class="sp"></span><button type="button" id="hb-seledit" aria-haspopup="dialog" hidden>수정하기…</button></div>') > 0);
  assert.strictEqual(tc.MAX_ITEMS, 20);
});

// ── qa 11-25 P2·P3 수정 ─────────────────────────────────────────────
const kbbMod = require('../js/kbboard.js');
const wrow = function (o) { return Object.assign({ id: 'W1', key: 'k', fkey: 'id:W1', name: '행', regionName: '서울', kind: 'WATCH', tagCd: 'NEW', tagName: '신규유치 도전', memo: '', nextDate: '', next: {}, movable: 0, canCancel: false, rec: null, bank: { name: '', unknown: true } }, o || {}); };

test('P2-1 관심 줄 [메모 고치기…]: 고칠 수 있는 계정·결재 중 아님일 때만, 클릭은 openMemo', function () {
  const h = kbbMod.watchRowHtml(wrow(), { canEdit: true });
  assert.ok(h.indexOf('class="hb-tag" data-act="memo" data-inst="W1" data-key="id:W1" aria-haspopup="dialog" aria-label="행 메모 고치기">메모 고치기…</button>') > 0);
  assert.ok(kbbMod.watchRowHtml(wrow(), { canEdit: false }).indexOf('data-act="memo"') < 0);
  assert.ok(kbbMod.watchRowHtml(wrow({ pend: true }), { canEdit: true }).indexOf('data-act="memo"') < 0);
  assert.ok(kbbMod.watchRowHtml(wrow(), { canEdit: true, canTag: function () { return false; } }).indexOf('data-act="memo"') < 0);   // canValueEdit 거짓이면 없음
  assert.ok(K.indexOf("else if (act === 'memo') { const r = rowOfBtn(btn, false); if (r && r.kind === 'WATCH') openMemo(r, btn); }") > 0);
  assert.ok(K.indexOf('canTag: canValueEdit });') > 0);
});

test('P2-2 협약 개시일 입구: 결재 요청 칸 줄에도 [협약 개시일 적기…], 줄을 못 찾으면 창 오류 줄', function () {
  const it = { uid: 1, id: 'A', name: '종로구청', regionName: '서울', op: 'CANCEL', snap: { kind: 'GOAL', year: 2025, tagCd: 'RETAIN' } };
  const h = tc.afterBlockHtml(it, { terms: { A: '달성 판정일 2027-01-01(추정)' }, reasons: [] });
  assert.ok(h.indexOf('class="tc-termgo" data-uid="1" data-inst="A" aria-haspopup="dialog" aria-label="종로구청 협약 개시일 적기">협약 개시일 적기…</button><span class="tc-memo">달성 판정일 2027-01-01(추정)</span>') > 0);
  assert.ok(tc.afterBlockHtml(it, { terms: {}, reasons: [] }).indexOf('tc-termgo') < 0);
  assert.ok(tc.afterBlockHtml(it, { reasons: [] }).indexOf('tc-termgo') < 0);
  assert.ok(tc.afterBlockHtml(Object.assign({}, it, { op: 'ADD', add: { tagName: 'x' }, year: 2026 }), { terms: { A: '' } }).indexOf('tc-termgo') < 0);
  assert.ok(tc.itemHtml(it, 1, { terms: { A: '' }, reasons: [] }).indexOf('tc-termgo') > 0);   // 결재 요청 칸 줄
  const a = K.indexOf('function chTermGo(d, b) {'), f = K.slice(a, K.indexOf('function chOnChange'));
  assert.ok(f.indexOf("chq(d, 'tc-err')") > 0 && f.indexOf("te.textContent = '이 기관은 지금 표에 없어 협약 개시일 창을 열 수 없습니다. 연도·탭을 바꿔 그 줄을 보이게 한 뒤 다시 여세요.'") > 0);
  assert.ok(f.indexOf('if (!r) {') > 0 && f.indexOf('if (!r) {') < f.indexOf('d.done = true;'));   // 못 찾으면 창을 닫지 않는다
  // P2-1: 고친 값(구분·메모 touched, 사유 글)이 있으면 닫지 않고 #tc-err 안내, 포커스는 보내기 단추
  assert.ok(f.indexOf('if (dirty) {') > 0 && f.indexOf('if (dirty) {') < f.indexOf('d.done = true;'));
  assert.ok(f.indexOf("x.touched") > 0 && f.indexOf('d.reason') > 0);
  assert.ok(f.indexOf("'고친 내용을 먼저 [' + (d.kind === 'approval' ? '결재 요청' : '수정하기') + ']로 보낸 뒤 협약 개시일을 적으세요. 지금 창을 닫으면 고친 내용이 사라집니다.'") > 0);
  assert.ok(f.indexOf("chq(d, 'tc-go')") > 0 && f.indexOf('go.focus()') > 0);
});

test('P2-3 구분을 고칠 수 없는 줄은 읽기 전용 칩(빈 메뉴 없음)', function () {
  const no = kbbMod.watchRowHtml(wrow(), { canEdit: true, canTag: function () { return false; } });
  assert.ok(no.indexOf('data-act="tag"') < 0 && no.indexOf('<span class="hb-tag ro"><span class="sr-only">구분: </span>신규유치 도전</span>') > 0);
  const yes = kbbMod.watchRowHtml(wrow(), { canEdit: true, canTag: function () { return true; } });
  assert.ok(yes.indexOf('data-act="tag"') > 0);
  assert.ok(kbbMod.watchRowHtml(wrow(), { canEdit: true }).indexOf('data-act="tag"') > 0);   // canTag 없으면 canEdit만 본다
});

test('P2-4 도착한 기관이 이 연도 목표에 없으면 상태 줄 안내(이름 있으면 조사 붙임)', function () {
  const a = K.indexOf('function applyReveal() {'), f = K.slice(a, K.indexOf('kbb.revealGoal'));
  assert.ok(f.indexOf("flash((nm ? nm + tc.eun(nm) : '이 기관은') + ' ' + goalYear() + '년 목표 기관이 아닙니다. [목표 기관 추가]로 넣고 결재가 끝나면 [제안 사전준비]를 할 수 있습니다.');") > 0);
  assert.ok(f.indexOf("if (r.pend) flash('목표 기관 결재가 진행 중입니다. 결재가 끝나면 [제안 사전준비]를 할 수 있습니다.');") > f.indexOf('if (!r) {'));   // 9절: 결재 중인 줄
  assert.strictEqual('노원구청' + tc.eun('노원구청') + ' 2026년 목표 기관이 아닙니다.', '노원구청은 2026년 목표 기관이 아닙니다.');
  assert.strictEqual('수원시' + tc.eun('수원시'), '수원시는');
});

test('P3-1 옛 서버(goal_change_mode 없음)는 #hb-prep 숨김', function () {
  assert.deepStrictEqual(makePrepState({ sel: sel1(), mode: null }), { hidden: true });
  assert.strictEqual(makePrepState({ sel: sel1(), mode: 'APPROVAL' }).on, true);
  assert.strictEqual(makePrepState({ sel: tc.newSel(), mode: null, st: 'loading' }).hidden, undefined);   // 로딩 중에는 모드를 모르므로 숨기지 않는다
});

test('P3-2 꺼짐 이유: 다른 해 목표·목록 못 받음은 \'올해 목표 기관만\'', function () {
  const why = { why: '올해 목표 기관만 제안 사전준비를 할 수 있습니다.' };
  assert.deepStrictEqual(makePrepState({ sel: sel1({ year: new Date().getFullYear() - 1 }) }), why);
  assert.deepStrictEqual(makePrepState({ sel: sel1(), st: 'error' }), why);
  assert.strictEqual(makePrepState({ sel: sel1() }).on, true);   // 올해 목표는 그대로 켜진다
});

test('A 입찰 현황판 열기: dash.openBoard·kbb.revealGoal 배선(0곳일 때만 고르기, 15초 안에만)', function () {
  const D = src('js/dashboard.js');
  assert.ok(D.indexOf('N.DASH_ID') > 0 && D.indexOf('A.openNavItem(N.DASH_ID)') > 0);
  assert.ok(K.indexOf('if (Date.now() - rv.t > 15000) return;') > 0 && K.indexOf('applyReveal();\n  }') > 0);
  assert.ok(K.indexOf("if (!rv || !host || gs.st !== 'ok') return;") > 0);   // 목록을 받기 전이면 기다린다
  assert.ok(K.indexOf('if (tc.selCount(gs.sel) === 0 && tc.pickable(r)) {') > 0);
  assert.ok(typeof require('../js/kbboard.js').revealGoal === 'function');
});
