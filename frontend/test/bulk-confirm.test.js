'use strict';
// NEXT 114: 띠 [수정하기]·[삭제하기] 확인 상자, 기관 상세 팝업 [관심 기관으로…], 메모 입구 제거. 화면 실동작(포커스·inert·Esc)은 qa 실측.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const tc = require('../js/tchange.js');
const ROOT = path.join(__dirname, '..');
const rd = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };
const K = rd('js/kbboard.js'), D = rd('js/dashboard.js'), CSS = rd('index.html');
const E = function (id, o) { return Object.assign({ id: id, name: id + '구청', regionName: '서울', kind: 'GOAL', targetNo: 1, revNo: 2, year: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', memo: '', ownerEmpNo: '', moveYear: 0 }, o || {}); };
function sel(list) { const s = tc.newSel(); list.forEach(function (e) { tc.pick(s, e); }); return s; }

test('띠: [수정하기] 다음 [삭제하기]가 오른쪽 끝, 둘 다 꺼짐(aria-disabled)으로 시작, hidden 아님', function () {
  const b = tc.selbarHtml();
  assert.ok(b.indexOf('id="hb-seledit"') < b.indexOf('id="hb-seldel"') && b.indexOf('id="hb-seldel"') < b.indexOf('</div>', b.indexOf('id="hb-seldel"')));
  assert.ok(b.indexOf('hidden>수정하기') < 0 && (b.match(/aria-disabled="true"/g) || []).length === 2);
  assert.strictEqual(tc.autoPickNote(2), '구분 바뀜 2곳 — [수정하기]로 저장');
});

test('editState: 대기 줄만 보내고 나머지는 제외, 대기 없으면 이유, 권한 없으면 꺼짐', function () {
  const A = E('A'), B = E('B'), W = E('W', { kind: 'WATCH', targetNo: 5 }), s = sel([A, B, W]), d = {};
  let r = tc.editState(s, d, { canBulk: true });
  assert.deepStrictEqual([r.on, r.why, r.send.length, r.skip.length], [false, tc.EDIT_NONE, 0, 3]);
  tc.setDraft(d, A, 'NEW', '신규유치 도전');
  r = tc.editState(s, d, { canBulk: true });
  assert.deepStrictEqual([r.on, r.send.map(function (x) { return x.id; }), r.skip.map(function (x) { return x.id; })], [true, ['A'], ['B', 'W']]);   // 관심이 섞여도 켜진다
  assert.strictEqual(tc.editState(s, d, { canBulk: false }).on, false);
  d.A.no = 9;   // 목표 번호가 달라진 낡은 대기는 무시
  assert.strictEqual(tc.editState(s, d, { canBulk: true }).on, false);
  assert.strictEqual(tc.editState(tc.newSel(), {}, { canBulk: true }).why, '고른 기관이 없습니다.');
});

test('deleteState: 관심 줄은 제외, 관심만이면 이유, 사유 목록 없음·모드 없음', function () {
  const s = sel([E('A'), E('W', { kind: 'WATCH', targetNo: 5 })]);
  const r = tc.deleteState(s, { hasMode: true, nReasons: 3 });
  assert.deepStrictEqual([r.on, r.send.length, r.skip.length], [true, 1, 1]);
  assert.strictEqual(tc.deleteState(sel([E('W', { kind: 'WATCH' })]), { hasMode: true, nReasons: 3 }).why, tc.DEL_WATCH);
  assert.strictEqual(tc.deleteState(s, { hasMode: true, nReasons: 0 }).why, tc.DEL_NOREASON);
  assert.strictEqual(tc.deleteState(s, { hasMode: false, nReasons: 3 }).on, false);
});

test('질문·줄 문장', function () {
  assert.strictEqual(tc.editQuestion(2, 2), '선택한 2곳에 대하여 수정하시겠습니까?');
  assert.strictEqual(tc.editQuestion(2, 3), '선택한 3곳 중 바뀐 2곳을 수정하시겠습니까?');
  assert.strictEqual(tc.deleteQuestion({ n: 2, total: 2, mode: 'APPROVAL', role: '영업팀', thisYear: true }), '선택한 2곳을 올해 목표에서 빼도록 팀장 결재를 요청하시겠습니까?');
  assert.strictEqual(tc.deleteQuestion({ n: 2, total: 2, mode: 'APPROVAL', role: '영업팀장', thisYear: false }), '선택한 2곳을 목표에서 빼도록 부장 결재를 요청하시겠습니까?');
  assert.strictEqual(tc.deleteQuestion({ n: 1, total: 2, mode: 'DIRECT', role: '영업부장', thisYear: true }), '선택한 2곳 중 1곳을 올해 목표에서 바로 빼시겠습니까?');
  assert.strictEqual(tc.toWatchQuestion({ name: '노원구청', mode: 'APPROVAL', role: '영업팀', thisYear: true }), '노원구청을 올해 목표에서 빼고 내 관심 기관으로 옮기도록 팀장 결재를 요청하시겠습니까?');
  assert.strictEqual(tc.toWatchQuestion({ name: '노원구청', mode: 'DIRECT', role: '영업부장', thisYear: false }), '노원구청을 목표에서 빼고 내 관심 기관으로 바로 옮기시겠습니까?');
  const d = {}; tc.setDraft(d, E('A'), 'NEW', '신규유치 도전');
  assert.strictEqual(tc.editLine(E('A'), d), '재유치 도전 → 신규유치 도전');
  assert.strictEqual(tc.deleteLine(E('A'), d), '2026 목표에서 뺌 · 바뀐 구분은 버림');
  assert.strictEqual(tc.deleteLine(E('B'), d), '2026 목표에서 뺌');
});

test('bulkDialogHtml: 수정은 사유 칸 없음, 삭제는 사유 칸 하나·결재 단추, 바로 빼기만 빨강, 이스케이프', function () {
  const rows = [{ name: '<b>노원</b>', regionName: '서울', text: '재유치 도전 → 신규유치 도전' }, { name: '강남구청', regionName: '서울', text: tc.EDIT_SKIP, skip: true }];
  const h = tc.bulkDialogHtml({ kind: 'edit', mode: 'DIRECT', role: '영업부장', rows: rows, n: 1, total: 2 });
  assert.ok(h.indexOf('id="tc-bd"') > 0 && h.indexOf('data-kind="edit"') > 0 && h.indexOf('선택한 2곳 중 바뀐 1곳을 수정하시겠습니까?') > 0);
  assert.ok(h.indexOf('&lt;b&gt;노원&lt;/b&gt;') > 0 && h.indexOf('<b>노원') < 0);
  assert.ok(h.indexOf('바뀐 내용 없음 — 제외') > 0 && h.indexOf('tc-bd-rs') < 0 && h.indexOf('class="dlg-go">수정</button>') > 0);
  const hd = tc.bulkDialogHtml({ kind: 'delete', mode: 'APPROVAL', role: '영업팀', rows: rows, n: 1, total: 1, thisYear: true, reasons: [{ code: 'A', name: '예산 없음' }, { code: 'ETC', name: '기타' }] });
  assert.ok(hd.indexOf('팀장 결재를 요청하시겠습니까?') > 0 && hd.indexOf('class="dlg-go">결재 요청</button>') > 0);
  assert.strictEqual((hd.match(/<select/g) || []).length, 1);
  assert.ok(hd.indexOf('<option value="ETC">기타</option>') > 0 && hd.indexOf('id="tc-bd-etcrow" hidden') > 0);
  assert.ok(tc.bulkDialogHtml({ kind: 'delete', mode: 'DIRECT', role: '영업부장', rows: [], n: 0, total: 0, reasons: [] }).indexOf('class="dlg-danger">빼기</button>') > 0);
});

test('towatch 상자: 기관 하나·결재면 사유 칸(textarea)·바로 반영이면 [옮기기]·목록 없음, 구분·메모 사실 줄', function () {
  const m = { kind: 'towatch', mode: 'APPROVAL', role: '영업팀', name: '노원구청', regionName: '서울', tagName: '재유치 도전', thisYear: true };
  const h = tc.bulkDialogHtml(m);
  assert.ok(h.indexOf('id="tc-bd"') > 0 && h.indexOf('data-kind="towatch"') > 0 && h.indexOf('<h2 class="dlg-t" id="tc-bd-t" tabindex="-1">내 관심 기관으로 옮기기 — 서울 노원구청</h2>') > 0);
  assert.ok(h.indexOf('노원구청을 올해 목표에서 빼고 내 관심 기관으로 옮기도록 팀장 결재를 요청하시겠습니까?') > 0);
  assert.ok(h.indexOf('구분(재유치 도전)과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 팀 이력에 남습니다.') > 0);
  assert.ok(h.indexOf('<textarea id="tc-reason"') > 0 && h.indexOf('class="dlg-go">결재 요청</button>') > 0 && h.indexOf('tc-bd-items') < 0);
  assert.ok(h.indexOf('영업팀장이 결재합니다. 결재가 끝나면 옮겨지고, 그때까지 이 기관은 구분도 고칠 수 없습니다') > 0);
  const hd = tc.bulkDialogHtml(Object.assign({}, m, { mode: 'DIRECT', role: '영업부장' }));
  assert.ok(hd.indexOf('tc-reason') < 0 && hd.indexOf('class="dlg-go">옮기기</button>') > 0 && hd.indexOf('바로 옮기시겠습니까?') > 0);
  assert.ok(tc.bulkDialogHtml(Object.assign({}, m, { name: '<i>x</i>' })).indexOf('<i>x') < 0);
});

test('toWatchState: 보일 조건 순서(모드·읽기 전용·관심 기능·줄·지난해·결재 중)', function () {
  const c = { mode: 'APPROVAL', year: 2026 }, row = { id: 'A', kind: 'GOAL', targetYear: 2026, tagName: '재유치 도전', pend: false };
  assert.deepStrictEqual(tc.toWatchState(row, c), { show: true, pend: false });
  assert.strictEqual(tc.toWatchState(row, { mode: null, year: 2026 }).show, false);
  assert.strictEqual(tc.toWatchState(row, Object.assign({}, c, { readOnly: true })).show, false);
  assert.strictEqual(tc.toWatchState(row, Object.assign({}, c, { noWatch: true })).show, false);
  assert.strictEqual(tc.toWatchState(null, c).show, false);
  assert.strictEqual(tc.toWatchState(Object.assign({}, row, { out: true }), c).show, false);
  assert.strictEqual(tc.toWatchState(Object.assign({}, row, { kind: 'WATCH' }), c).show, false);
  assert.strictEqual(tc.toWatchState(Object.assign({}, row, { targetYear: 2025 }), c).show, false);
  const p = tc.toWatchState(Object.assign({}, row, { pend: true, pendInfo: { op: 'TO_WATCH', by: '김영업', at: '2026-11-25T05:02:00Z' } }), c);
  assert.deepStrictEqual([p.show, p.pend], [true, true]);
});

test('toWatchHeadHtml: 보조 단추(설명·역할별 결재 문장·disabled) / 결재 중이면 글자 칩', function () {
  const b = tc.toWatchHeadHtml({ show: true, pend: false }, { mode: 'APPROVAL', role: '영업팀' });
  assert.ok(b.indexOf('<button type="button" id="dm-towatch" class="dm-sub" data-hx="towatch" aria-haspopup="dialog" aria-describedby="dm-towatch-d" title="목표에서 빼고 내 관심 기관으로 옮깁니다. 영업팀장 결재가 필요합니다.">관심 기관으로…</button><span id="dm-towatch-d" class="sr-only">') === 0);
  assert.ok(tc.toWatchHeadHtml({ show: true, pend: false }, { mode: 'APPROVAL', role: '영업팀장' }).indexOf('영업부장 결재가 필요합니다.') > 0);
  assert.ok(tc.toWatchHeadHtml({ show: true, pend: false }, { mode: 'APPROVAL', role: '' }).indexOf('팀장 결재가 필요합니다.') > 0);
  assert.ok(tc.toWatchHeadHtml({ show: true, pend: false }, { mode: 'DIRECT', role: '영업부장' }).indexOf('바로 옮깁니다.') > 0);
  assert.ok(tc.toWatchHeadHtml({ show: true, pend: false }, { mode: 'APPROVAL', disabled: true }).indexOf('" disabled>관심 기관으로…') > 0);
  assert.strictEqual(tc.toWatchHeadHtml({ show: false }, {}), '');
  const c = tc.toWatchHeadHtml({ show: true, pend: true, tagName: '재유치 도전', info: { op: 'TO_WATCH', by: '김영업', at: '2026-11-25T05:02:00Z' } }, {});
  assert.ok(c.indexOf('<span class="hb-pend dm-pend" title="구분: 재유치 도전 · 결재 중: 관심으로 옮기기 요청 · 김영업 2026-11-25 14:02">') === 0 && c.indexOf('</svg>결재 중 · 관심으로</span>') > 0 && c.indexOf('<button') < 0);
  assert.ok(c.indexOf('관심으로 옮기기 결재가 진행 중입니다. 요청자 김영업, 2026-11-25 14:02.') > 0);
  assert.ok(tc.toWatchHeadHtml({ show: true, pend: true, info: { op: 'CANCEL' } }, {}).indexOf('결재 중 · 빼기') > 0);   // 다른 결재가 걸려 있으면 그 이름
});

test('toWatchError: 일괄 창 문장을 쓰지 않는다', function () {
  const it = { uid: 1, name: '노원구청' };
  const x = function (s, code) { return { status: s, body: { detail: { code: code, item_no: 1 } } }; };
  assert.strictEqual(tc.toWatchError(x(409, 'ALREADY_WATCH'), [it]).msg.indexOf('이번 수정'), -1);
  assert.strictEqual(tc.toWatchError(x(409, 'CHANGE_PENDING'), [it]).refresh, true);
  assert.strictEqual(tc.toWatchError(x(409, 'STALE'), [it]).refresh, true);
  assert.strictEqual(tc.toWatchError(x(409, 'ALREADY_WATCH'), [it]).refresh, false);
  assert.strictEqual(tc.toWatchError({ status: 422, body: { detail: { message: '개인정보로 보이는 내용이 있습니다.' } } }, [it]).field, true);
});

test('resultOf(delete)·deleteReason', function () {
  assert.strictEqual(tc.deleteReason([{ code: 'A', name: '예산 없음' }], 'A', ''), '목표에서 빼기 — 예산 없음');
  assert.strictEqual(tc.deleteReason([{ code: 'ETC', name: '기타' }], 'ETC', ' 내부 사정 '), '목표에서 빼기 — 기타: 내부 사정');
  assert.ok(tc.resultOf({ mode: 'DIRECT', applied: 2 }, 2, 'delete').text.indexOf('목표에서 뺐습니다') > 0);
  assert.ok(tc.resultOf({ mode: 'APPROVAL' }, 2, 'delete').text.indexOf('결재 요청을 올렸습니다') === 0);
  assert.ok(tc.resultOf({ mode: 'APPROVAL' }, 1, 'towatch').text.indexOf('결재 요청을 올렸습니다') === 0);
});

test('메모 보존: 일괄 저장 본문은 memo 키를 보내지 않고(서버 keepUnsent: 키 없음 = 유지), TO_WATCH·CANCEL도 tag·memo를 보내지 않는다', function () {
  const A = E('A', { memo: '기존 메모', ownerEmpNo: 'E1' }), d = {};
  tc.setDraft(d, A, 'NEW', '신규유치 도전');
  const it = tc.newItem(1, A); tc.setOp(it, 'EDIT', { tag: tc.draftOf(d, A).tagCd });
  assert.deepStrictEqual(tc.buildBody([it], { mode: 'DIRECT' }).items[0], { institution_id: 'A', op_cd: 'EDIT', target_no: 1, base_rev_no: 2, target_year: 2026, tag_cd: 'NEW', owner_emp_no: 'E1' });
  const nx = tc.newItem(1, A); tc.setOp(nx, 'NEXT');   // 다음 회차도 EDIT 본문 — memo 키 없음
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tc.buildBody([nx], { mode: 'DIRECT' }).items[0], 'memo'), false);
  assert.ok(K.indexOf('memo: r.memo || null') < 0);   // 관심 칩(valueBody)·tonext 본문에 memo 기본값 없음(valueBody 값 시험은 tchange.test.js)
  const w = tc.newItem(1, A); tc.setOp(w, 'TO_WATCH');
  assert.deepStrictEqual(tc.buildBody([w], { mode: 'APPROVAL', reason: 'r' }).items[0], { institution_id: 'A', op_cd: 'TO_WATCH', target_no: 1, base_rev_no: 2 });
  const c = tc.newItem(2, A); tc.setOp(c, 'CANCEL'); c.cancelCd = 'X';
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tc.buildBody([c], { mode: 'DIRECT' }).items[0], 'memo'), false);
});

test('editState: 권한을 대기 여부보다 먼저 본다(qa P3-2)', function () {
  const r = tc.editState(sel([E('A')]), {}, { canBulk: false });
  assert.deepStrictEqual([r.on, r.why], [false, tc.EDIT_NOPERM]);   // 대기 없음이어도 '구분을 고르면 켜집니다'가 아니라 권한 문장
  assert.strictEqual(tc.editState(tc.newSel(), {}, { canBulk: false }).why, '고른 기관이 없습니다.');
});

test('towatchPick: 거르기·탭과 무관한 목표 자료 전체에서 그 기관의 목표 줄을 고른다(qa P2-2)', function () {
  const goal = E('A', { targetYear: 2026 }), all = [E('B'), goal, E('A', { out: true }), E('A', { kind: 'WATCH' })];
  assert.strictEqual(tc.towatchPick(all, 'A'), goal);
  assert.strictEqual(tc.towatchPick(all, 'Z'), null);
  assert.strictEqual(tc.towatchPick(all, ''), null);
  assert.strictEqual(tc.towatchPick(null, 'A'), null);
  assert.strictEqual(tc.towatchPick([E('A', { kind: 'WATCH' })], 'A'), null);   // 관심 줄만 있으면 없음
  assert.strictEqual(tc.toWatchState(tc.towatchPick(all, 'A'), { mode: 'DIRECT', year: 2026 }).show, true);
  assert.ok(K.indexOf('function towatchRow(id) { return tc.towatchPick(gs.goalAll, id); }') > 0 && K.indexOf('gs.goalAll = rows;') > 0);
});

test('bulkError: 잠김·이미 빠짐은 다시 읽고(refresh) 기관 이름으로 말한다(qa P2-3·P3-3)', function () {
  const items = [{ uid: 1, name: '노원구청' }, { uid: 2, name: '강남구청' }];
  const x = function (s, code, n) { return { status: s, body: { detail: { code: code, item_no: n } } }; };
  const c = tc.bulkError(x(409, 'ALREADY_CANCELLED', 1), items, 'delete');
  assert.strictEqual(c.refresh, true);
  assert.ok(c.msg.indexOf('노원구청은 이미 목표에서 빠진 기관입니다.') === 0 && c.msg.indexOf('번째') < 0 && c.msg.indexOf('이번 수정') < 0);
  const p = tc.bulkError(x(409, 'CHANGE_PENDING', 2), items, 'delete');
  assert.strictEqual(p.refresh, true);
  assert.ok(p.msg.indexOf('강남구청은 방금 결재 요청에 들어가 잠겨 빼지 못했습니다.') === 0 && p.msg.indexOf('이번 수정') < 0);
  assert.ok(tc.bulkError(x(409, 'CHANGE_PENDING', 2), items, 'edit').msg.indexOf('저장하지 못했습니다') > 0);
  const o = tc.bulkError(x(400, '', 1), items, 'edit');
  assert.ok(o.msg.indexOf('노원구청을 확인하세요.') === 0 && o.msg.indexOf('번째') < 0 && o.refresh === false);
  assert.strictEqual(tc.bulkError(x(409, 'STALE', 1), items, 'edit').refresh, true);
  assert.strictEqual(tc.bulkError({ status: 0, body: null }, items, 'edit').refresh, false);
});

test('P3 배선·마크업: 줄 이름 title, 지난해 입찰 종료 줄은 [관심 기관으로…] 없음, 바로 반영 오류는 상자에, 성공 뒤 포커스', function () {
  assert.ok(tc.bulkItemsHtml([{ name: '긴 이름 <b>', regionName: '서울', text: 't' }]).indexOf('<span class="nm" title="서울 긴 이름 &lt;b&gt;">') > 0);
  assert.ok(K.indexOf("(o.noWatch || tc.isPastYear(r.targetYear, o.y0) ? '' : a('towatch'") > 0 && K.indexOf('y0: U.todayDate().getFullYear() })') > 0);
  assert.ok(K.indexOf("else if (e.field && chq(d, 'tc-reason')) toWatchFieldErr(d, e.msg);") > 0);
  const f = K.slice(K.indexOf('function finishToWatch('), K.indexOf('// ── 결재 진행 중 창(보는 창)'));
  assert.ok(f.indexOf("document.getElementById('dm-name')") > 0 && f.indexOf("$('hb-goals')") > 0 && f.indexOf("$('hb-goals')") < f.indexOf('loadGoals()'));
  assert.ok(K.indexOf("const e = tc.bulkError(x, items, del ? 'delete' : 'edit'), msg = e.msg;") > 0);
});

test('popupHtml: extraHtml은 주 동작 뒤·구분선 앞, 주 동작이 없어도 구분선이 생기고, 약정 편집 중에는 숨는다', function () {
  const TODAY = new Date('2026-11-19T00:00:00');
  const it = dash.itemForRec({ name: '가람시청', region: '11', type: '지자체', contractEnd: logic.localDateStr(new Date(2026, 11, 29)), confirmed: true }, TODAY);
  const x = '<button type="button" id="dm-towatch" class="dm-sub" data-hx="towatch">관심 기관으로…</button>';
  const a = dash.popupHtml(it, { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name', board: true, extraHtml: x });
  assert.ok(a.bar.indexOf('id="db-cf"') < a.bar.indexOf('id="dm-towatch"') && a.bar.indexOf('id="dm-towatch"') < a.bar.indexOf('class="dm-sep"') && a.bar.indexOf('class="dm-sep"') < a.bar.indexOf('id="dm-close"'));
  const n = dash.popupHtml(it, { act: 'none', role: '영업팀', today: TODAY, nameId: 'dm-name', extraHtml: x });
  assert.ok(n.bar.indexOf('db-cf') < 0 && n.bar.indexOf('id="dm-towatch"') < n.bar.indexOf('class="dm-sep"') && n.bar.indexOf('class="dm-sep"') < n.bar.indexOf('id="dm-close"'));
  const e = dash.popupHtml(it, { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name', board: true, extraHtml: x, editing: true });
  assert.ok(e.bar.indexOf('dm-towatch') < 0 && e.bar.indexOf('dm-sep') < 0);
  assert.ok(dash.popupHtml(it, { act: 'none', role: '영업팀', today: TODAY, nameId: 'dm-name' }).bar.indexOf('dm-sep') < 0);   // extraHtml 없으면 예전 그대로
});

test('배선(dashboard.js): headExtra 저장·머리 단추 위임·다시 그리기·알림 공개 함수', function () {
  assert.ok(D.indexOf("headExtra: opts && opts.headExtra && typeof opts.headExtra.html === 'function' ? opts.headExtra : null") > 0);
  assert.ok(D.indexOf('extraHtml: dmHeadExtra(m, act),') > 0 && D.indexOf("const extra = c.editing ? '' : String(c.extraHtml || '');") > 0);
  assert.ok(D.indexOf("btn.getAttribute('data-hx') && m.headExtra && typeof m.headExtra.onClick === 'function'") > 0);
  assert.ok(D.indexOf('dash.repaintDetail = function') > 0 && D.indexOf('dash.detailFlash = function') > 0);
  assert.ok(D.indexOf('main + extra + (main || extra ?') > 0);
});

test('배선(kbboard.js): 띠 두 갈래·paintBulk, 성공은 보낸 줄만 비우고 실패는 비우지 않는다, 감사 이름은 tchange 한 곳', function () {
  assert.ok(K.indexOf("case 'hb-seledit': bulkClick('edit', btn); break;") > 0 && K.indexOf("case 'hb-seldel': bulkClick('delete', btn); break;") > 0);
  const p = K.indexOf('function paintSel() {'), pe = K.indexOf('function canBulkEdit()');
  assert.ok(p > 0 && pe > p && K.slice(p, pe).indexOf('paintBulk();') > 0);
  const a = K.indexOf('function submitBulk(d) {'), b = K.indexOf('function finishBulk('), c = K.indexOf('function towatchRow(id)');
  assert.ok(a > 0 && b > a && c > b);
  const sub = K.slice(a, b), fin = K.slice(b, c);
  assert.ok(sub.indexOf('del ? undefined : tc.BTN.values') > 0 && K.indexOf('save_target_values') < 0);
  assert.ok(sub.indexOf('unpick') < 0 && sub.indexOf('clearSel') < 0 && sub.indexOf('dropDraftChips') < 0);   // 실패 경로는 선택·대기를 건드리지 않는다
  assert.ok(fin.indexOf('tc.unpickRow(gs.sel, e.id, e.targetNo)') > 0 && fin.indexOf('dropDraftChips();') > 0 && fin.indexOf('clearSel') < 0);
  assert.ok(K.indexOf("openChange({ opener: btn, kind: 'edit' })") < 0);   // 띠가 두 칸 창을 더는 열지 않는다
  assert.ok(K.indexOf("root.dlg.open(ov, { focus: chq(d, 'tc-bd-cancel')") > 0);   // 첫 커서는 [취소]
});

test('배선(kbboard.js): [관심 기관으로…] — 팝업 headExtra·일정 칸 단추·두 칸 창 대신 새 상자, 결재 모드도 같은 상자', function () {
  assert.ok(K.indexOf('headExtra: headExtra() });') > 0 && K.indexOf('function openToWatch(r, opener, pm) {') > 0);
  assert.ok(K.indexOf("else if (act === 'towatch') { const r = rowOfBtn(btn, false); if (r) openToWatch(r, btn, null); }") > 0);
  assert.ok(K.indexOf("else if (act === 'tonext' || act === 'togoal') {") > 0 && K.indexOf("act === 'towatch' || act === 'tonext'") < 0);
  assert.ok(K.indexOf("a('towatch', '관심 기관으로…', '관심 기관으로 옮기기')") > 0 && K.indexOf("'내 관심으로…'") < 0);
  const o = K.indexOf('function openToWatch('), e = K.indexOf('// ── 결재 진행 중 창(보는 창)');
  const tw = K.slice(o, e);
  assert.ok(tw.indexOf("tc.setOp(it, 'TO_WATCH')") > 0 && tw.indexOf('kbb.submitChanges(tc.buildBody([it]') > 0 && tw.indexOf('tc.toWatchError(x, [it])') > 0);
  assert.ok(tw.indexOf("restoreFallback: function () { return (pm && document.getElementById('dm-name')) || dlgFallback(); }") > 0);
  assert.ok(tw.indexOf('clearSel') < 0 && tw.indexOf('unpick') < 0);   // 고른 줄·대기는 건드리지 않는다
  assert.ok(K.indexOf('openMove(act, r, btn)') > 0);   // tonext·togoal은 예전 길
});

test('메모 입구 제거(사용자 11-25): 단추·클릭 분기·감싸기 CSS 없음, 저장된 값은 읽기 전용 글자로 남음', function () {
  assert.ok(K.indexOf('data-act="memo"') < 0 && K.indexOf("act === 'memo'") < 0 && K.indexOf('hb-memo-go') < 0 && K.indexOf('hb-memocell') < 0);
  assert.ok(CSS.indexOf('.hb-memocell') < 0 && CSS.indexOf('.hb-memo-go') < 0);
});

test('CSS: 띠 단추·꺼짐 모양·확인 상자 질문 줄·팝업 보조 단추, 새 그림자·opacity 없음', function () {
  assert.ok(/\.hb-selbar #hb-seldel \{[^}]*border:1px solid var\(--line-strong\)/.test(CSS));
  assert.ok(/\.hb-selbar #hb-seledit\[aria-disabled="true"\], \.hb-selbar #hb-seldel\[aria-disabled="true"\] \{[^}]*color:var\(--muted\)[^}]*border-color:var\(--line\)/.test(CSS));
  assert.ok(/#tc-bd \.dlg-body > p \{[^}]*line-height:1\.5/.test(CSS) && CSS.indexOf('#tc-bd .dlg-ferr:empty { display:none; }') > 0);
  assert.ok(/\.dm-btns \.dm-sub \{ height:32px; padding:0 12px; font-size:12px; \}/.test(CSS));
  assert.ok(CSS.indexOf('.dm-btns #dm-towatch:not(:first-child), .dm-btns .dm-pend:not(:first-child) { margin-left:8px; }') > 0 && CSS.indexOf('.dm-btns .dm-pend { flex:none; white-space:nowrap; }') > 0);
  const own = CSS.split('\n').filter(function (l) { return l.indexOf('#hb-seldel') >= 0 || l.indexOf('#tc-bd') >= 0 || l.indexOf('.dm-sub') >= 0 || l.indexOf('.dm-pend') >= 0; }).map(function (l) { return l.replace(/\/\*.*?\*\//g, ''); }).join('\n');
  assert.ok(own.indexOf('box-shadow') < 0 && own.indexOf('opacity') < 0);
});
