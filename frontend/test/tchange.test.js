'use strict';
// NEXT 105(design-reviewer 2026-11-23_0919_ad69b2cf): 목표 기관 변경 결재·일괄 요청·자동 이월·협약 개시일 — 순수 함수 + 현황판·결재함 연결(소스 단언).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const tc = require('../js/tchange.js');
const kbb = require('../js/kbboard.js');
const ap = require('../js/approvals.js');

function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const TODAY = new Date(2026, 10, 23);
function mk(o) {
  return Object.assign({ id: 'I1', name: '종로구청', regionName: '서울', kind: 'GOAL', targetNo: 1, revNo: 1, targetYear: 2026, tagCd: 'NEW', tagName: '신규유치 도전', memo: '', ownerEmpNo: '', ownerName: '', movable: 0, out: false, pend: false }, o || {});
}
function mkCtx(extra) {
  return Object.assign({ byInst: {}, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: false, delayDays: 30, years: [2026, 2027, 2028], actOf: function () { return ''; } }, extra || {});
}
function tgt(id, tag, extra) {
  return Object.assign({ institution_id: id, institution_name: '이름' + id, region_code: '11', target_no: 1, rev_no: 2, target_year: 2026, tag_cd: tag, tag_name: kbb.TAG[tag], memo: '', can_cancel: true, kind_cd: 'GOAL',
    bank: { kb_now: 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_to: '2026-12-31' }] } }, extra || {});
}
const TAGS = [{ code: 'RETAIN', name: '재유치 도전' }, { code: 'NEW', name: '신규유치 도전' }];
const REASONS = [{ code: 'X', name: '입찰 불참 결정' }, { code: 'ETC', name: '기타' }];
const OPT = { years: [2026, 2027, 2028], tags: TAGS, reasons: REASONS };
function snapA() { return tc.entryOfRow(mk({ id: 'A', name: '종로구청', targetNo: 1, revNo: 2, tagCd: 'RETAIN', tagName: '재유치 도전', ownerEmpNo: 'E1', ownerName: '김영업' })); }

test('동작 이름: 긴 이름(창·카드)·짧은 이름(결재 중 칩), 모르는 코드는 빈 글자', function () {
  assert.strictEqual(tc.opLong('ADD'), '목표에 넣기');
  assert.strictEqual(tc.opLong('EDIT'), '목표 고치기');
  assert.strictEqual(tc.opLong('CANCEL'), '목표에서 빼기');
  assert.strictEqual(tc.opLong('TO_WATCH'), '관심으로 옮기기');
  assert.strictEqual(tc.opLong('TO_GOAL'), '목표로 옮기기');
  assert.deepStrictEqual(['ADD', 'EDIT', 'CANCEL', 'TO_WATCH', 'TO_GOAL'].map(tc.opShort), ['넣기', '고치기', '빼기', '관심으로', '목표로']);
  assert.strictEqual(tc.opLong('constructor'), '');
  assert.strictEqual(tc.opShort(''), '');
});

test('모드·결재자 안내·단추 글자: 서버 goal_change_mode만 따르고 역할을 모르면 둘 다 말한다', function () {
  assert.strictEqual(tc.modeOf({ can_edit: true, goal_change_mode: 'APPROVAL' }), 'APPROVAL');
  assert.strictEqual(tc.modeOf({ can_edit: true, goal_change_mode: 'DIRECT' }), 'DIRECT');
  assert.strictEqual(tc.modeOf({ can_edit: false, goal_change_mode: 'DIRECT' }), null);   // 보기 전용
  assert.strictEqual(tc.modeOf({ can_edit: true }), null);                                // 옛 서버(키 없음)
  assert.strictEqual(tc.modeOf({ can_edit: true, goal_change_mode: 'X' }), null);
  assert.strictEqual(tc.modeOf(null), null);
  assert.strictEqual(tc.approverText('영업팀', 'APPROVAL'), '영업팀장이 결재합니다.');
  assert.strictEqual(tc.approverText('영업팀장', 'APPROVAL'), '영업부장이 결재합니다.');
  assert.strictEqual(tc.approverText('', 'APPROVAL'), '영업팀장(영업팀장이 올리면 영업부장)이 결재합니다.');
  assert.strictEqual(tc.approverText('영업부장', 'DIRECT'), '');
  assert.strictEqual(tc.dlgTitle('APPROVAL', 3), '목표 기관 변경 결재 요청 — 3곳');
  assert.strictEqual(tc.dlgTitle('DIRECT', 3), '목표 기관 변경 — 3곳');
  assert.strictEqual(tc.dlgHint('APPROVAL', '영업팀'), '영업팀장이 결재합니다. 결재가 끝날 때까지 이 기관들은 구분도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).');
  assert.strictEqual(tc.dlgHint('DIRECT', '영업부장'), '영업부장은 결재 없이 바로 반영합니다. 반영한 사람·시각은 기록에 남습니다.');
  assert.strictEqual(tc.dlgHint('DIRECT', '영업팀'), '결재 없이 바로 반영합니다. 반영한 사람·시각은 기록에 남습니다.');   // 스위치를 끄면 팀원도 바로 쓴다
  assert.strictEqual(tc.barBtnText('APPROVAL', 'GOAL'), '빼기·옮기기 결재 요청…');   // 건수는 쓰지 않는다(왼쪽 문장이 말한다)
  assert.strictEqual(tc.barBtnText('APPROVAL', 'WATCH'), '목표로 옮기기 결재 요청…');
  assert.strictEqual(tc.barBtnText('APPROVAL', 'MIX'), '결재 요청 쓰기…');
  assert.strictEqual(tc.barBtnText('DIRECT', 'GOAL'), '빼기·옮기기 바로 반영…');
  assert.strictEqual(tc.barBtnText('DIRECT', 'MIX'), '바로 반영 쓰기…');
  assert.strictEqual(tc.addGoText('APPROVAL'), '결재 요청 쓰기');
  assert.strictEqual(tc.addGoText('DIRECT'), '목표에 넣기');
});

test('고르기: 20곳 한도·같은 기관 두 번(다른 연도 목표)은 체크하지 않고 문장, 풀기·비우기', function () {
  const s = tc.newSel(), e = function (id, no) { return { id: id, targetNo: no, name: id, kind: 'GOAL' }; };
  assert.deepStrictEqual(tc.pick(s, e('A', 1)), { ok: true });
  assert.deepStrictEqual(tc.pick(s, e('A', 1)), { ok: true });
  assert.strictEqual(tc.selCount(s), 1);
  assert.deepStrictEqual(tc.pick(s, e('A', 2)), { ok: false, msg: '한 요청에 같은 기관은 한 번만 넣을 수 있습니다.' });
  for (let i = 0; i < 19; i += 1) assert.strictEqual(tc.pick(s, e('X' + i, 1)).ok, true);
  assert.strictEqual(tc.selCount(s), 20);
  assert.deepStrictEqual(tc.pick(s, e('Z', 1)), { ok: false, msg: '한 번에 20곳까지 고를 수 있습니다.' });
  assert.strictEqual(tc.unpickRow(s, 'X0', 9), false);   // 기록 번호가 다르면 풀지 않는다
  assert.strictEqual(tc.unpickRow(s, 'X0', 1), true);
  assert.strictEqual(tc.unpick(s, 'A'), true);
  assert.strictEqual(tc.unpick(s, 'nope'), false);
  assert.strictEqual(tc.selCount(s), 18);
  assert.deepStrictEqual(tc.pickedMap(tc.newSel()), {});
  const t = tc.newSel(); tc.pick(t, e('B', 4));
  assert.deepStrictEqual(tc.pickedMap(t), { B: 4 });
  assert.strictEqual(tc.isPicked(t, { id: 'B', targetNo: 4 }), true);
  assert.strictEqual(tc.isPicked(t, { id: 'B', targetNo: 5 }), false);
  tc.clearSel(t);
  assert.strictEqual(tc.selCount(t), 0);
});

test('줄 → 고른 항목 스냅샷, 고를 수 있는 줄(목표 밖·결재 중·옮길 시기 아닌 관심 줄은 아님)', function () {
  const e = tc.entryOfRow(mk({ id: 'I1', targetNo: 3, revNo: 2, tagCd: 'RETAIN', tagName: '재유치 도전', memo: 'm', ownerEmpNo: 'E1', ownerName: '김영업' }));
  assert.deepStrictEqual(e, { id: 'I1', name: '종로구청', regionName: '서울', kind: 'GOAL', targetNo: 3, revNo: 2, year: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', aimCd: '', aimName: '', memo: 'm', ownerEmpNo: 'E1', ownerName: '김영업', moveYear: 0, closed: false });
  assert.strictEqual(tc.entryOfRow(mk({ closed: { basis_cd: 'NOTICE_CLOSED' } })).closed, true);   // 다음 회차 목표로 옵션 판정용
  assert.strictEqual(tc.pickable(mk()), true);
  assert.strictEqual(tc.pickable(mk({ out: true })), false);
  assert.strictEqual(tc.pickable(mk({ pend: true })), false);
  assert.strictEqual(tc.pickable(mk({ kind: 'WATCH', movable: 0 })), false);
  assert.strictEqual(tc.pickable(mk({ kind: 'WATCH', movable: 2027 })), true);
});

test('reconcile: 잠겼거나 사라진 줄은 빼고 남은 줄은 새 기록 번호로 제자리 갱신, 다른 연도 목표는 그대로', function () {
  const s = tc.newSel();
  tc.pick(s, tc.entryOfRow(mk({ id: 'A' })));
  tc.pick(s, tc.entryOfRow(mk({ id: 'B', targetNo: 2 })));
  tc.pick(s, tc.entryOfRow(mk({ id: 'C', targetNo: 3 })));
  tc.pick(s, tc.entryOfRow(mk({ id: 'D', targetYear: 2027 })));
  tc.pick(s, tc.entryOfRow(mk({ id: 'W', kind: 'WATCH', targetYear: null, movable: 2027, targetNo: 7 })));
  const keep = s.by.A;
  const rows = [mk({ id: 'A', revNo: 5 }), mk({ id: 'B', targetNo: 2, pend: true })];   // C는 응답에 없다
  const wrows = [mk({ id: 'W', kind: 'WATCH', targetYear: null, movable: 2027, targetNo: 7, revNo: 3 })];
  assert.strictEqual(tc.reconcile(s, rows, wrows, 2026), 2);   // B(잠김)·C(사라짐)
  assert.deepStrictEqual(s.ids, ['A', 'D', 'W']);
  assert.strictEqual(s.by.A, keep); assert.strictEqual(keep.revNo, 5);   // 같은 객체를 고친다(창이 같은 스냅샷을 본다)
  assert.strictEqual(s.by.W.revNo, 3);
  assert.strictEqual(s.by.D.year, 2027);
});

test('409 뒤 다른 연도 줄: 서버 최신 기록(detail.latest)이면 그 값으로 snap 갱신, 없거나 안 맞으면 false(목록을 따로 읽는다), 그 연도 목록으로도 갱신', function () {
  const s = tc.newSel();
  tc.pick(s, tc.entryOfRow(mk({ id: 'D', targetNo: 1, revNo: 3, targetYear: 2026 })));   // 보는 연도는 2027, 고른 줄은 2026
  const snap = s.by.D;
  const items = [{ uid: 1, name: '종로구청' }];
  const e = tc.errorOf({ status: 409, body: { detail: { code: 'STALE', message: 'x', item_no: 1, latest: { target_no: 1, rev_no: 4, kind_cd: 'GOAL', target_year: 2026 } } } }, items);
  assert.strictEqual(e.refresh, true); assert.deepStrictEqual(e.latest, { target_no: 1, rev_no: 4, kind_cd: 'GOAL', target_year: 2026 });
  assert.strictEqual(tc.applyLatest(snap, e.latest), true);
  assert.strictEqual(snap.revNo, 4); assert.strictEqual(s.by.D.revNo, 4);   // 같은 객체 — 창이 새 번호로 다시 보낸다
  assert.strictEqual(tc.errorOf({ status: 409, body: { detail: { code: 'STALE', item_no: 1, latest: null } } }, items).latest, null);
  assert.strictEqual(tc.errorOf({ status: 500, body: null }, items).latest, null);
  assert.strictEqual(tc.applyLatest(snap, null), false);
  assert.strictEqual(tc.applyLatest(snap, { target_no: 9, rev_no: 7 }), false); assert.strictEqual(snap.revNo, 4);   // 다른 목표 줄이면 건드리지 않는다
  assert.strictEqual(tc.applyLatest(snap, { target_no: 1, rev_no: 7, kind_cd: 'WATCH' }), false); assert.strictEqual(snap.revNo, 4);
  const one = tc.oneSel(snap);   // 폴백: 그 연도 목록을 읽어 reconcile
  assert.strictEqual(tc.reconcile(one, [mk({ id: 'D', targetNo: 1, revNo: 6, targetYear: 2026 })], [], 2026), 0);
  assert.strictEqual(snap.revNo, 6);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('refreshAfterConflict(e, d).then(') > 0 && k.indexOf('tc.applyLatest(sn, e.latest)') > 0 && k.indexOf("fetchJson('/bid-targets?year=' + encodeURIComponent(sn.year))") > 0);
});

test('고른 줄 비우기는 응답이 ok이고 모드가 없다고 확정됐을 때만, 한꺼번에 동작은 동작이 빈 항목에만', function () {
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('if (ok && !mode && tc.selCount(gs.sel)) tc.clearSel(gs.sel);') > 0);
  assert.ok(k.indexOf('if (!tc.isFixed(x) && !x.op) { tc.setOp(x, op); x.touched = true; }') > 0);
  const A = tc.newItem(1, snapA()); tc.setOp(A, 'CANCEL');
  const B = tc.newItem(2, tc.entryOfRow(mk({ id: 'B', targetNo: 2 })));
  const C = tc.newItem(3, tc.entryOfRow(mk({ id: 'C', targetNo: 3 })));
  // 창 동작과 같은 규칙: 이미 정한 항목(A)은 그대로, 빈 항목(B·C)만 채운다
  [A, B, C].forEach(function (x) { if (!tc.isFixed(x) && !x.op) tc.setOp(x, 'TO_WATCH'); });
  assert.deepStrictEqual([A.op, B.op, C.op], ['CANCEL', 'TO_WATCH', 'TO_WATCH']);
  const D = tc.newItem(4, tc.entryOfRow(mk({ id: 'D', targetNo: 4 })));   // 동작이 빈 항목
  const someFree = tc.dialogHtml({ mode: 'DIRECT', role: '', reason: '', items: [A, D] }, OPT);
  assert.ok(someFree.indexOf('tc-allop') > 0);   // 빈 항목이 남아 있으면 칸이 있다
  tc.setOp(B, 'EDIT');
  assert.ok(tc.dialogHtml({ mode: 'DIRECT', role: '', reason: '', items: [A, B] }, OPT).indexOf('tc-allop') < 0);   // 모두 정했으면 칸이 없다
});

test('항목·검사: 누르면 칸마다 알린다(동작·연도·고친 내용 없음·빼는 사유·기타 사유·사유 200자)', function () {
  const A = tc.newItem(1, snapA());
  const W = tc.newItem(2, tc.entryOfRow(mk({ id: 'W', kind: 'WATCH', targetYear: null, movable: 2027, targetNo: 4 })));
  const N = tc.addItem(3, { id: 'N', name: '성동구청', regionName: '서울', year: 2027, tag: 'NEW', tagName: '신규유치 도전', memo: ' 메모 ' });
  assert.strictEqual(A.op, ''); assert.strictEqual(tc.isFixed(A), false);
  assert.strictEqual(W.op, 'TO_GOAL'); assert.strictEqual(W.year, 2027); assert.strictEqual(tc.isFixed(W), true);
  assert.strictEqual(N.op, 'ADD'); assert.strictEqual(N.memo, '메모'); assert.strictEqual(tc.isFixed(N), true);
  tc.setOp(W, 'CANCEL'); assert.strictEqual(W.op, 'TO_GOAL');   // 동작이 정해진 항목은 그대로
  const v0 = tc.validate([A, W, N], { mode: 'APPROVAL', reason: '' });
  assert.strictEqual(v0.ok, false); assert.strictEqual(v0.reason, '사유를 적으세요.');
  assert.deepStrictEqual(v0.items, [{ uid: 1, f: 'op', msg: '동작을 고르세요.' }]);
  tc.setOp(A, 'EDIT');
  assert.strictEqual(A.year, 2026); assert.strictEqual(A.tag, 'RETAIN');
  assert.deepStrictEqual(tc.validate([A], { mode: 'DIRECT' }).items, [{ uid: 1, f: 'edit', msg: '고친 내용이 없습니다. 칸을 바꾸거나 이 기관을 이번 수정에서 빼세요.' }]);
  A.tag = 'NEW';
  assert.strictEqual(tc.validate([A], { mode: 'DIRECT' }).ok, true);
  tc.setOp(A, 'CANCEL');
  assert.deepStrictEqual(tc.validate([A], { mode: 'DIRECT' }).items, [{ uid: 1, f: 'cancelCd', msg: '빼는 사유를 고르세요.' }]);
  A.cancelCd = 'ETC'; A.cancelEtc = '  ';
  assert.deepStrictEqual(tc.validate([A], { mode: 'DIRECT' }).items, [{ uid: 1, f: 'cancelEtc', msg: '기타 사유를 적으세요.' }]);
  A.cancelEtc = new Array(52).join('가');
  assert.deepStrictEqual(tc.validate([A], { mode: 'DIRECT' }).items, [{ uid: 1, f: 'cancelEtc', msg: '기타 사유는 50자 이내로 적으세요.' }]);
  A.cancelCd = 'X'; A.cancelEtc = '';
  assert.strictEqual(tc.validate([A], { mode: 'DIRECT' }).ok, true);
  W.year = 0;
  assert.deepStrictEqual(tc.validate([W], { mode: 'DIRECT' }).items, [{ uid: 2, f: 'year', msg: '목표 연도를 고르세요.' }]);
  assert.strictEqual(tc.validate([A], { mode: 'APPROVAL', reason: new Array(202).join('가') }).reason, '사유는 200자 이내로 적으세요.');
  assert.strictEqual(tc.validate([N], { mode: 'DIRECT' }).ok, true);   // 영업부장 바로 반영은 사유가 없다
  assert.strictEqual(tc.validate([], { mode: 'DIRECT' }).top, '바꿀 기관을 하나 이상 골라 주세요.');
});

test('요청 본문: 동작마다 서버가 받는 칸만, 영업부장 바로 반영은 reason 없음', function () {
  const A = tc.newItem(1, snapA());
  tc.setOp(A, 'EDIT', { year: 2027, tag: 'NEW' }); A.memo = ' 새 메모 ';
  const B = tc.newItem(2, tc.entryOfRow(mk({ id: 'B', targetNo: 2, revNo: 3 })));
  tc.setOp(B, 'CANCEL'); B.cancelCd = 'ETC'; B.cancelEtc = ' 사유 ';
  const C = tc.newItem(3, tc.entryOfRow(mk({ id: 'C', targetNo: 4, revNo: 1 })));
  tc.setOp(C, 'TO_WATCH');
  const D = tc.newItem(4, tc.entryOfRow(mk({ id: 'D', kind: 'WATCH', targetYear: null, movable: 2027, targetNo: 5, revNo: 6 })));
  D.year = 2028;
  const E = tc.newItem(6, tc.entryOfRow(mk({ id: 'E', targetNo: 8, revNo: 1 })));
  tc.setOp(E, 'CANCEL'); E.cancelCd = 'X'; E.cancelEtc = '남은 글';
  const N = tc.addItem(5, { id: 'N', name: 'n', regionName: 'r', year: 2027, tag: 'NEW', tagName: '신규유치 도전', memo: '' });
  assert.deepStrictEqual(tc.buildBody([A, B, C, D, E, N], { mode: 'APPROVAL', reason: ' 사유 ' }), { reason: '사유', items: [
    { institution_id: 'A', op_cd: 'EDIT', target_no: 1, base_rev_no: 2, target_year: 2027, tag_cd: 'NEW', owner_emp_no: 'E1' },   // EDIT는 memo 키를 보내지 않는다(서버 keepUnsent: 키 없음 = 지금 값 유지, qa 11-25 P2-1)
    { institution_id: 'B', op_cd: 'CANCEL', target_no: 2, base_rev_no: 3, cancel_reason_cd: 'ETC', cancel_reason_etc: '사유' },
    { institution_id: 'C', op_cd: 'TO_WATCH', target_no: 4, base_rev_no: 1 },
    { institution_id: 'D', op_cd: 'TO_GOAL', target_no: 5, base_rev_no: 6, target_year: 2028 },
    { institution_id: 'E', op_cd: 'CANCEL', target_no: 8, base_rev_no: 1, cancel_reason_cd: 'X', cancel_reason_etc: null },   // 기타가 아니면 남은 기타 글은 보내지 않는다
    { institution_id: 'N', op_cd: 'ADD', target_year: 2027, tag_cd: 'NEW', memo: null }] });
  const direct = tc.buildBody([C], { mode: 'DIRECT', reason: '무시' });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(direct, 'reason'), false);
  assert.strictEqual(direct.items.length, 1);
});

test('오류 문장 표(5-2): 항목 오류는 항목 상자 문장 + 위 한 줄, 409 CHANGE_PENDING·STALE은 다시 읽기, 연결 실패·권한·개인정보', function () {
  const items = [{ uid: 1, name: '종로구청' }, { uid: 2, name: '수원시' }];
  const err = function (status, detail) { return tc.errorOf({ status: status, body: detail === undefined ? null : { detail: detail } }, items); };
  const a = err(409, { code: 'CHANGE_PENDING', message: 'x', item_no: 2 });
  assert.strictEqual(a.kind, 'item'); assert.strictEqual(a.top, '2번째 수원시를 확인하세요.'); assert.strictEqual(a.refresh, true);
  assert.deepStrictEqual(a.item, { uid: 2, f: 'op', msg: '방금 다른 결재 요청에 들어가 잠겼습니다. 이 기관을 이번 수정에서 빼고 다시 올려 주세요.' });
  const b = err(409, { code: 'STALE', message: '다른 사람이 먼저 고쳤습니다.', item_no: 1 });
  assert.strictEqual(b.top, '1번째 종로구청을 확인하세요.'); assert.strictEqual(b.refresh, true);
  assert.strictEqual(b.item.msg, '다른 사람이 먼저 고쳤습니다. 최신 기록으로 다시 읽었으니 이전·이후를 확인하고 다시 올려 주세요.');
  const c = err(409, { code: 'ALREADY_CANCELLED', item_no: 1 });
  assert.strictEqual(c.item.msg, '이미 목표에서 빠진 기관입니다. 이번 수정에서 빼 주세요.'); assert.strictEqual(c.refresh, false);
  assert.strictEqual(err(409, { code: 'DUP_TARGET', message: '이미 목표 기관으로 설정되어 있습니다.', item_no: 1 }).item.msg, '이미 목표 기관으로 설정되어 있습니다.');
  assert.strictEqual(err(400, { code: 'BAD_VALUE', message: '동작을 목록에서 골라 주세요.', item_no: 1 }).item.msg, '동작을 목록에서 골라 주세요.');
  assert.strictEqual(err(404, { code: 'NOT_FOUND', message: 'x', item_no: 1 }).item.msg, '기관을 찾지 못했습니다.');   // 영문 서버 문구는 내보이지 않는다
  const p = err(422, { code: 'PII_DETECTED', message: '개인정보로 보이는 내용이 있습니다.', item_no: 1 });
  assert.strictEqual(p.item.f, 'text'); assert.strictEqual(p.item.msg, '개인정보로 보이는 내용이 있습니다.');
  const r = err(422, { code: 'PII_DETECTED', message: '사유에 개인정보로 보이는 내용이 있습니다.' });
  assert.strictEqual(r.kind, 'field'); assert.strictEqual(r.msg, '사유에 개인정보로 보이는 내용이 있습니다.'); assert.strictEqual(r.top, '');
  assert.strictEqual(err(400, '한 번에 20곳까지 올릴 수 있습니다. 나눠서 요청해 주세요.').top, '한 번에 20곳까지 올릴 수 있습니다. 나눠서 요청해 주세요.');
  assert.strictEqual(err(403, '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.').top, '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.');
  assert.strictEqual(err(403, 'Forbidden').top, '목표 기관 변경은 영업부서만 올릴 수 있습니다.');
  assert.strictEqual(tc.errorOf({ status: 0, body: null }, items).top, '서버에 연결되지 않아 올리지 못했습니다. 연결을 확인하고 다시 누르세요.');
  assert.strictEqual(tc.errorOf(null, items).top, '서버에 연결되지 않아 올리지 못했습니다. 연결을 확인하고 다시 누르세요.');
  assert.strictEqual(err(401).top, '로그인이 필요합니다. 다시 로그인하세요.');
  assert.strictEqual(err(500).top, '올리지 못했습니다(오류 500). 다시 시도하세요.');
  // 관심은 사람별(NEXT 117): 남의 관심 403 NOT_WATCH_OWNER·내 관심 중복 409 ALREADY_WATCH
  const o1 = err(403, { code: 'NOT_WATCH_OWNER', message: '다른 사람의 관심 기관은 바꿀 수 없습니다.', item_no: 2 });
  assert.strictEqual(o1.kind, 'item'); assert.strictEqual(o1.top, '2번째 수원시를 확인하세요.'); assert.strictEqual(o1.refresh, true);
  assert.strictEqual(o1.item.msg, '다른 사람의 관심 기관은 바꿀 수 없습니다. 내 관심 기관만 올릴 수 있으니 이번 수정에서 빼 주세요.');
  const o2 = err(403, { code: 'NOT_WATCH_OWNER', message: '다른 사람의 관심 기관은 바꿀 수 없습니다.' });   // 항목 번호 없음 → '영업부서만' 문장이 아니다
  assert.strictEqual(o2.kind, 'top'); assert.strictEqual(o2.refresh, true); assert.ok(o2.top.indexOf('다른 사람의 관심 기관은 바꿀 수 없습니다.') === 0 && o2.top.indexOf('영업부서') < 0);
  const o3 = err(409, { code: 'ALREADY_WATCH', message: '이미 관심 기관입니다.', item_no: 1 });
  assert.strictEqual(o3.item.msg, '이미 내 관심 기관에 들어 있습니다. 이번 수정에서 빼 주세요.'); assert.strictEqual(o3.refresh, false);
});

test('결과 문장: 결재 요청(잠김 안내)·바로 반영, 응답의 mode를 따른다', function () {
  assert.deepStrictEqual(tc.resultOf({ mode: 'APPROVAL', request: { req_id: 5 } }, 3), { mode: 'APPROVAL', n: 3, text: '결재 요청을 올렸습니다 — 목표 기관 3곳. 결재가 끝날 때까지 이 기관들은 잠깁니다.' });
  assert.deepStrictEqual(tc.resultOf({ mode: 'DIRECT', applied: 2, items: [] }, 3), { mode: 'DIRECT', n: 2, text: '목표 기관 2곳을 바로 반영했습니다.' });
  assert.strictEqual(tc.resultOf({ mode: 'DIRECT' }, 4).n, 4);
});

test('자동 이월 알림(5-5): 받은 숫자로만, 셋 다 0이면 알리지 않고, more면 합친다', function () {
  assert.strictEqual(tc.carryText({ carried: 0, revoked: 0, skipped: 0 }).text, '');
  const c = tc.carryText({ carried: 2, revoked: 0, skipped: 0 });
  assert.strictEqual(c.text, '지난 목표 중 달성하지 못한 기관 2곳을 자동으로 넘겼습니다. 다른 은행이 약정한 곳은 다음 해 관심 기관으로 넘겼습니다.');
  assert.strictEqual(c.hasCarried, true); assert.strictEqual(c.changed, true);
  const all = tc.carryText({ carried: 1, revoked: 3, skipped: 4 });
  assert.strictEqual(all.text, '지난 목표 중 달성하지 못한 기관 1곳을 자동으로 넘겼습니다. 다른 은행이 약정한 곳은 다음 해 관심 기관으로 넘겼습니다. 판정이 바뀐 3곳은 자동으로 넘긴 기록을 거뒀습니다(기록은 남습니다). 4곳은 결재 중이거나 처리하지 못해 다음에 다시 넘깁니다.');
  const sk = tc.carryText({ carried: 0, revoked: 0, skipped: 2 });
  assert.strictEqual(sk.text, '2곳은 결재 중이거나 처리하지 못해 다음에 다시 넘깁니다.'); assert.strictEqual(sk.hasCarried, false); assert.strictEqual(sk.changed, false);
  assert.deepStrictEqual(tc.carryMerge({ carried: 1, revoked: 2, skipped: 3, more: true }, { carried: 4, revoked: 0, skipped: 1, more: false }), { carried: 5, revoked: 2, skipped: 4, more: false });
  assert.deepStrictEqual(tc.carryMerge(null, { carried: 1 }), { carried: 1, revoked: 0, skipped: 0, more: false });
  assert.ok(tc.actHtml('carried').indexOf('id="hb-see-carried">넘어온 기관만 보기</button>') > 0);
  assert.ok(tc.actHtml('inbox').indexOf('id="hb-see-inbox">결재함에서 보기</button>') > 0);
  assert.strictEqual(tc.actHtml(''), '');
});

test('달성 판정일·이월 문장·구분 칸 title: 추정 표시, 관심 줄은 원천 연도를 지어내지 않는다', function () {
  assert.strictEqual(tc.judgeText({ judgeFrom: '2027-01-01', judgeAssumed: true }), '달성 판정일 2027-01-01(추정)');
  assert.strictEqual(tc.judgeText({ judgeFrom: '2027-03-01', judgeAssumed: false }), '달성 판정일 2027-03-01');
  assert.strictEqual(tc.judgeText({ judgeFrom: '' }), '');
  assert.strictEqual(tc.carriedTitle({ carried: true, kind: 'GOAL', targetYear: 2027, carryBasis: 'UNREGISTERED' }), '2026 목표에서 자동으로 넘어옴. 작년 결과: 협약 개시일이 지났는데 금고 약정 기록이 없음');
  assert.strictEqual(tc.carriedTitle({ carried: true, kind: 'GOAL', targetYear: 2027, carryBasis: 'PENDING' }), '2026 목표에서 자동으로 넘어옴');
  assert.strictEqual(tc.carriedTitle({ carried: true, kind: 'WATCH' }), '다른 은행이 약정해 지난 목표에서 관심 기관으로 자동으로 옮김');
  assert.strictEqual(tc.carriedTitle({ carried: true, kind: 'WATCH', carryFromYear: 2026 }), '다른 은행이 약정해 2026 목표에서 관심 기관으로 자동으로 옮김');
  assert.strictEqual(tc.carriedTitle({ carried: false, kind: 'GOAL' }), '');
  const tips = tc.rowTips({ carried: true, kind: 'GOAL', targetYear: 2027, tagCd: 'NEW', prevYear: 2024, carryBasis: 'UNREGISTERED', judgeFrom: '2028-01-01', judgeAssumed: true });
  assert.deepStrictEqual(tips, ['2026 목표에서 자동으로 넘어옴. 작년 결과: 협약 개시일이 지났는데 금고 약정 기록이 없음', '되찾기 후보: 예전 국민은행 금고(마지막 2024년)', '달성 판정일 2028-01-01(추정)']);
  assert.deepStrictEqual(tc.rowTips({ carried: false, judgeFrom: '2027-01-01', judgeAssumed: true }), ['달성 판정일 2027-01-01(추정)']);
  assert.deepStrictEqual(tc.rowTips({}), []);
  assert.deepStrictEqual(tc.rowTips({ carried: true, kind: 'GOAL', targetYear: 2027, tagCd: 'REGAIN', prevYear: 2022 }), ['2026 목표에서 자동으로 넘어옴']);   // 되찾기 도전은 후보 문장이 붙지 않는다(11-23)
  assert.strictEqual(tc.rowClass({ late: true, id: 'A', targetNo: 1, pend: true }, { picked: { A: 1 } }), ' class="late picked locked"');
  assert.strictEqual(tc.rowClass({ id: 'A', targetNo: 2 }, { picked: { A: 1 } }), '');   // 다른 기록 번호는 고른 줄이 아니다
  assert.strictEqual(tc.rowClass({ id: 'A', targetNo: 1 }, null), '');
  assert.strictEqual(tc.kst('2026-11-20T05:06:07Z'), '2026-11-20 14:06');
  assert.strictEqual(tc.kst(''), '');
});

test('협약 개시일: 저장·지움 알림(조사 로/으로), 결과 분류, 다이얼로그 마크업', function () {
  assert.strictEqual(tc.termFlash('종로구청', 2026, '2027-03-01', '01-01'), '종로구청 2026 목표의 협약 개시일을 2027-03-01로 저장했습니다. 달성 판정일도 이 날로 바뀝니다.');
  assert.ok(tc.termFlash('종로구청', 2026, '2027-03-10', '01-01').indexOf('2027-03-10으로 저장') > 0);
  assert.ok(tc.termFlash('종로구청', 2026, '2027-03-03', '01-01').indexOf('2027-03-03으로 저장') > 0);
  assert.strictEqual(tc.termFlash('종로구청', 2026, '', '01-01'), '종로구청 2026 목표의 협약 개시일 기록을 지웠습니다. 달성 판정일은 2027-01-01(추정)입니다.');
  assert.ok(tc.termFlash('종로구청', 2026, '', '03-15').indexOf('달성 판정일은 2027-03-15(추정)') > 0);
  assert.ok(tc.termFlash('종로구청', 2026, '', undefined).indexOf('2027-01-01(추정)') > 0);
  assert.deepStrictEqual(tc.termOutcome({ status: 201, body: { saved: true } }), { kind: 'saved' });
  assert.deepStrictEqual(tc.termOutcome({ status: 200, body: { saved: false } }), { kind: 'nochange', msg: '바뀐 내용이 없어 저장하지 않았습니다.' });
  assert.deepStrictEqual(tc.termOutcome({ status: 409, body: { detail: { code: 'STALE', message: '다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.' } } }), { kind: 'stale', msg: '다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.' });
  assert.strictEqual(tc.termOutcome({ status: 409, body: { detail: { code: 'STALE' } } }).msg, '다른 사람이 먼저 고쳤습니다. 최신 기록을 확인하고 다시 저장하세요.');
  assert.deepStrictEqual(tc.termOutcome({ status: 400, body: { detail: '협약 개시일은 목표 연도나 그다음 해 날짜여야 합니다.' } }), { kind: 'field', msg: '협약 개시일은 목표 연도나 그다음 해 날짜여야 합니다.' });
  assert.strictEqual(tc.termOutcome({ status: 0, body: null }).msg, '서버에 연결되지 않아 저장하지 못했습니다. 연결을 확인하고 다시 누르세요.');
  assert.strictEqual(tc.termOutcome({ status: 500, body: null }).msg, '저장하지 못했습니다(오류 500). 다시 시도하세요.');
  const r = { regionName: '서울', name: '종로구청<b>', targetYear: 2026, judgeFrom: '2027-01-01', judgeAssumed: true, termStart: '2027-03-01' };
  const h = tc.termDialogHtml(r);
  assert.ok(h.indexOf('id="tt-dlg"') > 0 && h.indexOf('RFP 협약 개시일 — 서울 종로구청&lt;b&gt;') > 0 && h.indexOf('<b>') < 0);
  assert.ok(h.indexOf('min="2026-01-01" max="2027-12-31" value="2027-03-01"') > 0);
  assert.ok(h.indexOf('(추정 — 개시일 기록이 없어 목표 연도 다음 해 1월 1일로 봅니다)') > 0);
  assert.ok(h.indexOf('id="tt-cancel">취소</button><button type="button" id="tt-go" class="dlg-go">저장</button>') > 0);
});

test('결재 진행 중 창: 요청 동작·요청한 사람·올린 시각(한국시간), 개시일 단추는 목표 줄만', function () {
  const r = { regionName: '서울', name: '광진구청', pendInfo: { reqId: 9, op: 'CANCEL', by: '김영업', at: '2026-11-20T05:06:07Z' } };
  const h = tc.pendingDialogHtml(r, { canTerm: true });
  assert.ok(h.indexOf('결재 진행 중 — 서울 광진구청</h2>') > 0);
  assert.ok(h.indexOf('<dt>요청 동작</dt><dd>목표에서 빼기</dd><dt>요청한 사람</dt><dd>김영업</dd><dt>올린 시각</dt><dd class="mono">2026-11-20 14:06</dd>') > 0);
  assert.ok(h.indexOf('id="pd-inbox">결재함에서 보기</button><span class="dlg-sep" aria-hidden="true"></span><button type="button" id="pd-close">닫기</button>') > 0);
  assert.ok(h.indexOf('id="pd-term">협약 개시일 적기…</button>') > 0);
  assert.ok(tc.pendingDialogHtml(r, { canTerm: false }).indexOf('pd-term') < 0);
});

test('결재 중 칩·고르기 칸: 쓰기 자격자는 버튼(요청 정보), 그 밖은 글자, 목표 밖·옮길 시기 아닌 관심 줄은 빈 칸', function () {
  const r = { id: 'I1', fkey: '11|종로', name: '종로구청', regionName: '서울', tagName: '재유치 도전', tagCd: 'RETAIN', pend: true, pendInfo: { reqId: 9, op: 'CANCEL', by: '김영업', at: '2026-11-20T05:06:07Z' } };
  const w = tc.pendCellHtml(r, { canEdit: true });
  assert.ok(w.indexOf('<td title="구분: 재유치 도전 · 결재 중: 목표에서 빼기 요청 · 김영업 2026-11-20 14:06">') === 0);
  assert.ok(w.indexOf('<button type="button" class="hb-pend" data-act="pend" data-inst="I1" data-key="11|종로" aria-haspopup="dialog" aria-label="결재 중: 목표에서 빼기 요청, 요청자 김영업, 2026-11-20 14:06. 자세히 보기">') > 0);
  assert.ok(w.indexOf('결재 중 · 빼기</button><span class="sr-only">. 구분 재유치 도전</span></td>') > 0);
  const ro = tc.pendCellHtml(r, { canEdit: false });
  assert.ok(ro.indexOf('<td title="결재가 진행 중인 기관입니다"><span class="hb-pend">') === 0 && ro.indexOf('결재 중</span>') > 0 && ro.indexOf('<button') < 0);
  assert.ok(tc.pendCellHtml(Object.assign({}, r, { pendInfo: null }), { canEdit: true }).indexOf('<button') < 0);   // 상세가 없으면 글자 칩
  assert.ok(tc.pendCellHtml(Object.assign({}, r, { tagName: '<img src=x>' }), { canEdit: true }).indexOf('<img') < 0);
  const ck = tc.ckCellHtml(mk({ id: 'I1' }), { picked: {} });
  assert.strictEqual(ck, '<td class="ck"><label><input type="checkbox" data-pick="I1" aria-label="서울 종로구청 고르기"></label></td>');
  assert.ok(tc.ckCellHtml(mk({ id: 'I1' }), { picked: { I1: 1 } }).indexOf('고르기" checked>') > 0);
  assert.strictEqual(tc.ckCellHtml(mk({ out: true }), {}), '<td class="ck"></td>');
  assert.strictEqual(tc.ckCellHtml(mk({ kind: 'WATCH', movable: 0 }), {}), '<td class="ck"></td>');
  const lk = tc.ckCellHtml(mk({ pend: true }), {});
  assert.ok(lk.indexOf('class="lk"') > 0 && lk.indexOf('<input') < 0);
  assert.ok(tc.ckHeadHtml().indexOf('id="hb-pickall" aria-label="보이는 목표 기관 모두 고르기"') > 0);
  assert.ok(tc.ckHeadHtml(true).indexOf('id="hb-pickall" aria-label="보이는 관심 기관 모두 고르기"') > 0);   // 관심 탭 머리(qa P3-5)
  assert.ok(src('js/kbboard.js').indexOf("(sel ? tc.ckHeadHtml(true) : '') + thHtml('기관', 'nm', v)") > 0);
  assert.ok(tc.selbarHtml().indexOf('<div class="hb-selbar" id="hb-selbar" role="region" aria-label="고른 기관" hidden>') === 0);
  assert.strictEqual(tc.selStatusHtml(3, ''), '<span class="sr-only">3곳 고름</span><span aria-hidden="true">고른 기관 <b>3</b>곳</span>');
  assert.ok(tc.selStatusHtml(20, '한 번에 20곳까지 고를 수 있습니다.').indexOf('<span class="sr-only">한 번에 20곳까지 고를 수 있습니다.</span>') === 0);
});

test('일괄 요청 창 마크업: 제목·단추·안내·사유 칸·항목(동작 칸/고정 동작)·DIRECT는 사유 칸 없음, 이름은 이스케이프', function () {
  const A = tc.newItem(1, snapA()); tc.setOp(A, 'CANCEL');
  const W = tc.newItem(2, tc.entryOfRow(mk({ id: 'W', name: '수원시', kind: 'WATCH', targetYear: null, movable: 2027, targetNo: 4, tagName: '신규유치 도전' })));
  const N = tc.addItem(3, { id: 'N', name: '성동구청', regionName: '서울', year: 2027, tag: 'NEW', tagName: '신규유치 도전', memo: '' });
  const h = tc.dialogHtml({ mode: 'APPROVAL', role: '영업팀', reason: '', items: [A, W, N] }, OPT);
  assert.ok(h.indexOf('<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="approval"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="tc-t">') === 0);
  assert.ok(h.indexOf('<h2 class="dlg-t" id="tc-t" tabindex="-1">목표 기관 변경 결재 요청 — 3곳</h2>') > 0);
  assert.ok(h.indexOf('id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">결재 요청</button>') > 0);
  assert.ok(h.indexOf('영업팀장이 결재합니다. 결재가 끝날 때까지') > 0);
  assert.ok(h.indexOf('<textarea id="tc-reason" rows="3" maxlength="200" aria-describedby="tc-rh tc-rc tc-re"></textarea>') > 0 && h.indexOf('id="tc-rc" class="mono">0/200') > 0);
  assert.ok(h.indexOf('<select id="tc-i1-op" data-uid="1" data-f="op"><option value="">빼기·옮기기 고르기</option><option value="CANCEL" selected>목표에서 빼기</option><option value="TO_WATCH">관심으로 옮기기</option></select>') > 0);   // 목표 고치기는 목록에 없다(NEXT 114)
  assert.ok(h.indexOf('목표 고치기') < 0 && h.indexOf('value="NEXT"') < 0);   // 입찰 종료 줄이 아니면 '다음 회차 목표로'도 없다
  assert.ok(h.indexOf('<span class="fix">목표로 옮기기</span>') > 0 && h.indexOf('<span class="fix">목표에 넣기</span>') > 0);   // 관심 줄·넣기는 동작 고정
  assert.ok(h.indexOf('tc-i2-op') < 0 && h.indexOf('tc-i3-op') < 0);
  assert.ok(h.indexOf('id="tc-i1-e"') > 0 && h.indexOf('id="tc-i2-e"') > 0 && h.indexOf('id="tc-i3-e"') > 0);
  assert.ok(h.indexOf('class="tc-x" data-uid="1" aria-label="종로구청 이번 수정에서 빼기">이번 수정에서 빼기</button>') > 0);
  assert.ok(h.indexOf('목록에서 제외') < 0);
  assert.ok(h.indexOf('tc-allop') < 0);   // 동작을 고를 수 있는 줄이 하나뿐이면 '모두' 칸은 없다
  const B = tc.newItem(7, tc.entryOfRow(mk({ id: 'B', targetNo: 2 })));
  assert.ok(tc.dialogHtml({ mode: 'APPROVAL', role: '영업팀', reason: '', items: [A, B] }, OPT).indexOf('<select id="tc-allop"><option value="">동작 한꺼번에 정하기</option>') > 0);
  const d = tc.dialogHtml({ mode: 'DIRECT', role: '영업부장', reason: '', items: [A] }, OPT);
  assert.ok(d.indexOf('목표 기관 변경 — 1곳</h2>') > 0 && d.indexOf('id="tc-go" class="dlg-go">바로 반영</button>') > 0 && d.indexOf('tc-reason') < 0);
  assert.ok(d.indexOf('영업부장은 결재 없이 바로 반영합니다. 반영한 사람·시각은 기록에 남습니다.') > 0);
  const X = tc.newItem(1, tc.entryOfRow(mk({ id: 'X', name: '<img src=x onerror=1>', regionName: '서울' })));
  assert.ok(tc.dialogHtml({ mode: 'DIRECT', role: '', reason: '', items: [X] }, OPT).indexOf('<img') < 0);
});

test('되찾기: 고치기 칸의 구분 목록에서 REGAIN이 골라져 있다', function () {
  const E = tc.newItem(1, tc.entryOfRow(mk({ id: 'A', targetNo: 1, revNo: 2, tagCd: 'REGAIN', tagName: '되찾기 도전' }))); tc.setOp(E, 'EDIT');
  const tags3 = [{ code: 'RETAIN', name: '재유치 도전' }, { code: 'REGAIN', name: '되찾기 도전' }, { code: 'NEW', name: '신규유치 도전' }];
  const h = tc.afterBlockHtml(E, { years: [2026, 2027, 2028], tags: tags3, reasons: REASONS });
  assert.ok(h.indexOf('<option value="REGAIN" selected>되찾기 도전</option>') > 0);
});

test('항목의 이전/이후: 동작별 칸(EDIT 연도·구분·메모, CANCEL 사유·기타, TO_GOAL 연도, TO_WATCH 문장, ADD 고정) + 이전 줄', function () {
  const E = tc.newItem(1, snapA()); tc.setOp(E, 'EDIT');
  const h = tc.afterBlockHtml(E, OPT);
  assert.ok(h.indexOf('<dl class="tc-ba"><dt>이전</dt><dd><span class="mono">2026</span> 목표 · 재유치 도전 · 주 담당 김영업 · 메모 없음</dd><dt>이후</dt><dd>') === 0);
  assert.ok(h.indexOf('<select id="tc-i1-y" data-uid="1" data-f="year"><option value="2026" selected>2026년</option><option value="2027">2027년</option>') > 0);
  assert.ok(h.indexOf('<option value="RETAIN" selected>재유치 도전</option><option value="NEW">신규유치 도전</option>') > 0);
  assert.ok(h.indexOf('<input id="tc-i1-m" data-uid="1" data-f="memo" maxlength="100" size="20" value="">') > 0);
  const C = tc.newItem(2, tc.entryOfRow(mk({ id: 'C', targetNo: 2 }))); tc.setOp(C, 'CANCEL');
  const ch = tc.afterBlockHtml(C, OPT);
  assert.ok(ch.indexOf('목표에서 빠짐<label for="tc-i2-rs">빼는 사유</label><select id="tc-i2-rs" data-uid="2" data-f="cancelCd"><option value="" selected>고르세요</option><option value="X">입찰 불참 결정</option>') > 0);
  assert.ok(ch.indexOf('tc-i2-etc') < 0);
  C.cancelCd = 'ETC';
  assert.ok(tc.afterBlockHtml(C, OPT).indexOf('<input id="tc-i2-etc" data-uid="2" data-f="cancelEtc" maxlength="50" value="">') > 0);
  assert.ok(tc.afterBlockHtml(C, { years: [], tags: [], reasons: [] }).indexOf('빼는 사유 목록을 받지 못했습니다') > 0);
  const W = tc.newItem(3, tc.entryOfRow(mk({ id: 'W', kind: 'WATCH', targetYear: null, movable: 0, targetNo: 4, tagName: '신규유치 도전' })));
  const wh = tc.afterBlockHtml(W, OPT);
  assert.ok(wh.indexOf('<dd>관심 기관 · 신규유치 도전</dd>') > 0 && wh.indexOf('<option value="" selected>고르세요</option>') > 0);   // 옮길 연도를 모르면 고르세요
  const P = tc.newItem(4, tc.entryOfRow(mk({ id: 'P', targetNo: 5 }))); tc.setOp(P, 'TO_WATCH');
  assert.ok(tc.afterBlockHtml(P, OPT).indexOf('<dd>관심 기관(연도 없음)</dd>') > 0);
  const N = tc.addItem(5, { id: 'N', name: 'n', regionName: 'r', year: 2027, tag: 'NEW', tagName: '신규유치 도전', memo: '메모' });
  const nh = tc.afterBlockHtml(N, OPT);
  assert.ok(nh.indexOf('<dd>목표·관심 아님</dd>') > 0 && nh.indexOf('<span class="mono">2027</span> 목표 · 신규유치 도전<span class="tc-memo">메모: 메모</span>') > 0);
  assert.ok(tc.afterBlockHtml(tc.newItem(6, snapA()), OPT).indexOf('빼기나 옮기기를 고르면 이어서 정합니다.') > 0);
});

test('결재함 카드 표(6-6): 이전/이후·강조·메모 줄·주의 줄·이스케이프', function () {
  const before = { kind_cd: 'GOAL', target_year: 2026, tag_name: '재유치 도전', memo: '', owner_name: '김영업' };
  const items = [
    { item_no: 1, institution_name: '종로구청', op_cd: 'CANCEL', before: before, to_year: null, cancel_reason_name: '입찰 불참 결정', warn_cd: null },
    { item_no: 2, institution_name: '수원시', op_cd: 'EDIT', before: before, to_year: 2027, tag_name: '재유치 도전', owner_name: '김영업', memo: '', warn_cd: null },
    { item_no: 3, institution_name: '성동구청', op_cd: 'ADD', before: null, to_year: 2026, tag_name: '신규유치 도전', owner_name: '박영업', memo: null, warn_cd: 'INST_BID_CLOSED' },
    { item_no: 4, institution_name: '광진구청', op_cd: 'TO_WATCH', before: before },
    { item_no: 5, institution_name: '동작구청', op_cd: 'TO_GOAL', before: { kind_cd: 'WATCH', target_year: null, tag_name: '신규유치 도전', memo: '', owner_name: null }, to_year: 2027 }];
  const h = tc.cardItemsHtml(items);
  assert.ok(h.indexOf('<table class="ad-table ap-tc"><caption class="sr-only">바꿀 목표 기관 5곳</caption><colgroup><col class="tc-c1"><col class="tc-c2"><col class="tc-c3"><col class="tc-c3"></colgroup>') === 0);
  assert.ok(h.indexOf('<th scope="col">기관</th><th scope="col">동작</th><th scope="col">이전</th><th scope="col">이후</th>') > 0);
  assert.ok(h.indexOf('<th scope="row">종로구청</th><td>목표에서 빼기</td><td><span class="mono">2026</span> 목표 · 재유치 도전 · 주 담당 김영업</td><td>목표에서 빠짐 · 사유 입찰 불참 결정</td>') > 0);
  assert.ok(h.indexOf('<th scope="row">수원시</th><td>다음 회차 목표로</td><td><span class="mono">2026</span> 목표 · 재유치 도전 · 주 담당 김영업</td><td><b class="mono">2027</b> 목표 · 재유치 도전 · 주 담당 김영업</td>') > 0);   // 연도만 +1이면 '다음 회차 목표로', 바뀐 값만 굵게
  const tagToo = tc.cardItemsHtml([{ institution_name: 'b', op_cd: 'EDIT', before: before, to_year: 2027, tag_name: '신규유치 도전', owner_name: '김영업', memo: '' }]);
  assert.ok(tagToo.indexOf('<td>목표 고치기</td>') > 0);   // 구분도 같이 바뀐 옛 요청은 그대로 '목표 고치기'
  assert.ok(h.indexOf('<td>목표에 넣기</td><td><span aria-hidden="true">—</span><span class="sr-only">없음, 새로 넣기</span></td><td><span class="mono">2026</span> 목표 · 신규유치 도전 · 주 담당 박영업<span class="warn">주의: 올해 입찰이 끝난 것으로 기록된 기관</span></td>') > 0);
  assert.ok(h.indexOf('<td>관심으로 옮기기</td>') > 0 && h.indexOf('<td>관심 기관(연도 없음)</td>') > 0);
  assert.ok(h.indexOf('<td>목표로 옮기기</td><td>관심 기관 · 신규유치 도전</td><td><span class="mono">2027</span> 목표</td>') > 0);
  const memo = tc.cardItemsHtml([{ institution_name: 'a', op_cd: 'EDIT', before: before, to_year: 2026, tag_name: '재유치 도전', owner_name: '김영업', memo: '새 메모' }]);
  assert.ok(memo.indexOf('<span class="tc-memo">메모: 새 메모</span>') > 0);
  const cleared = tc.cardItemsHtml([{ institution_name: 'a', op_cd: 'EDIT', before: Object.assign({}, before, { memo: '예전' }), to_year: 2026, tag_name: '재유치 도전', owner_name: '김영업', memo: '' }]);
  assert.ok(cleared.indexOf('메모: 없음') > 0);
  assert.ok(tc.cardItemsHtml([{ institution_name: '<b>x</b>', op_cd: 'CANCEL', before: before, cancel_reason_name: '<i>' }]).indexOf('<b>x') < 0);
  assert.strictEqual(tc.cardItemsHtml([]), ''); assert.strictEqual(tc.cardItemsHtml(null), '');
});

test('결재함: 카드 모델 필드·결재선 밖 영업부장은 [반려]만·내가 올린 요청은 잠금 안내·409 문장·소스 배선', function () {
  const REQ = { req_id: 11, req_type: 'TARGET_CHANGE', type_label: '목표 기관 변경', title: '목표 기관 변경 — 종로구청 외 1곳', status: 'PENDING', requester_name: '김영업', requester_position: '대리',
    created_at: '2026-11-20T05:06:07Z', payload: { reason: '사유' }, steps: [{ approver_name: '이팀장', status: 'PENDING' }], can_decide: false, can_cancel: false, can_head_reject: true,
    target_items: [{ item_no: 1, institution_name: '종로구청', op_cd: 'TO_WATCH', before: { kind_cd: 'GOAL', target_year: 2026, tag_name: '재유치 도전', memo: '', owner_name: null } }] };
  const row = ap.requestRows([REQ], [])[0];
  assert.strictEqual(row.isTarget, true); assert.strictEqual(row.pending, true); assert.strictEqual(row.canHeadReject, true); assert.strictEqual(row.targetItems.length, 1);
  const inbox = ap.requestCardHtml(row, 'inbox');
  assert.ok(inbox.indexOf('data-tc="1"') > 0 && inbox.indexOf('class="ad-table ap-tc"') > 0);
  assert.ok(inbox.indexOf('<input class="ap-comment" data-id="11" placeholder="반려 사유(필수)" aria-label="반려 사유(필수)"><button class="ap-req-no" data-id="11">반려</button><span class="dg-who">결재선 밖이어서 반려만 할 수 있습니다.</span>') > 0);
  assert.ok(inbox.indexOf('ap-req-ok') < 0 && inbox.indexOf('ap-req-cancel') < 0 && inbox.indexOf('결재가 끝날 때까지') < 0);
  const line = ap.requestCardHtml(ap.requestRows([Object.assign({}, REQ, { can_decide: true, can_head_reject: false })], [])[0], 'inbox');
  assert.ok(line.indexOf('ap-req-ok') > 0 && line.indexOf('결재선 밖') < 0);   // 결재선이면 승인·반려 둘 다
  const mine = ap.requestCardHtml(ap.requestRows([Object.assign({}, REQ, { can_cancel: true, can_head_reject: false })], [])[0], 'mine');
  assert.ok(mine.indexOf('ap-req-cancel') > 0 && mine.indexOf('결재가 끝날 때까지 이 기관들의 목표·관심은 고칠 수 없습니다.') > 0);
  const other = ap.requestCardHtml(ap.requestRows([{ req_id: 3, req_type: 'PERM_REQUEST', status: 'PENDING', title: 't', payload: {}, steps: [], can_decide: true }], [])[0], 'inbox');
  assert.ok(other.indexOf('data-tc') < 0 && other.indexOf('ap-tc') < 0);
  assert.strictEqual(ap.actErrText({ code: 'ITEM_CHANGED', message: '결재를 올린 뒤 이 기관의 목표 기록이 바뀌었습니다. 반려하고 다시 요청해 주세요.', item_no: 2, institution_name: '수원시' }, 'x'),
    '2번째 기관(수원시): 결재를 올린 뒤 이 기관의 목표 기록이 바뀌었습니다. 반려하고 다시 요청해 주세요.');
  assert.strictEqual(ap.actErrText({ code: 'REQUESTER_INACTIVE', message: '요청자가 더 이상 영업부서 사용자가 아니어서 반영할 수 없습니다. 반려해 주세요.' }, 'x'), '요청자가 더 이상 영업부서 사용자가 아니어서 반영할 수 없습니다. 반려해 주세요.');
  assert.strictEqual(ap.actErrText('이미 처리된 요청입니다.', 'x'), '이미 처리된 요청입니다.');
  assert.strictEqual(ap.actErrText(undefined, '처리하지 못했습니다 (500)'), '처리하지 못했습니다 (500)');
  const a = src('js/approvals.js');
  assert.ok(a.indexOf("const tc = (typeof require !== 'undefined') ? require('./tchange.js') : root.tchange;") > 0);
  assert.ok(/e\.status === 409 && card\.getAttribute\('data-tc'\)\) \{ const c = card\.querySelector\('\.ap-comment'\)/.test(a));
});

test('현황판 줄 모델·표 마크업: 잠금·이월·판정일·고르기 열은 옵션이 있을 때만(없으면 예전 모양)', function () {
  const ctx = mkCtx(), win = kbb.laneWindow(TODAY, 2026);
  const pendT = tgt('IF', 'NEW', { owner_name: '김영업', change_pending: true, change_pending_info: { req_id: 9, op_cd: 'CANCEL', requested_by_name: '김영업', created_at: '2026-11-20T05:06:07Z' } });
  const r = kbb.goalRow(pendT, ctx);
  assert.strictEqual(r.pend, true); assert.deepStrictEqual(r.pendInfo, { reqId: 9, op: 'CANCEL', by: '김영업', at: '2026-11-20T05:06:07Z' }); assert.strictEqual(r.ownerName, '김영업');
  const c = kbb.goalRow(tgt('IB', 'NEW', { carried: true, carry_basis_cd: 'UNREGISTERED', judge_from: '2027-01-01', judge_from_assumed: true, term_start: null, term_rev_no: 0 }), ctx);
  assert.strictEqual(c.carried, true); assert.strictEqual(c.carryBasis, 'UNREGISTERED'); assert.strictEqual(c.judgeFrom, '2027-01-01'); assert.strictEqual(c.judgeAssumed, true); assert.strictEqual(c.termStart, ''); assert.strictEqual(c.termRevNo, 0);
  const o = kbb.goalRow({ institution_id: 'IZ', institution_name: '목표 밖', change_pending: true, carried: true }, ctx, true);
  assert.strictEqual(o.pend, false); assert.strictEqual(o.carried, false);   // 목표 밖 줄은 해당 없음
  const plain = kbb.goalRow(tgt('IF', 'NEW'), ctx);
  assert.strictEqual(plain.pend, false); assert.strictEqual(plain.carried, false); assert.strictEqual(plain.judgeFrom, '');
  const base = kbb.goalRowHtml(plain, { win: win, canEdit: true });
  assert.ok(base.indexOf('<tr><th scope="row">') === 0 && base.indexOf('class="ck"') < 0 && base.indexOf('이월') < 0 && base.indexOf('hb-pend') < 0);   // 옵션 없음 = 예전 모양
  const picked = kbb.goalRowHtml(plain, { win: win, canEdit: true, selCol: true, picked: { IF: 1 } });
  assert.ok(picked.indexOf('<tr class="picked"><td class="ck"><label><input type="checkbox" data-pick="IF" aria-label="') === 0 && picked.indexOf(' 이름IF 고르기" checked></label></td><th scope="row">') > 0);
  const lock = kbb.goalRowHtml(r, { win: win, canEdit: true, selCol: true, picked: {} });
  assert.ok(lock.indexOf('<tr class="locked"><td class="ck"><svg class="lk"') === 0 && lock.indexOf('class="hb-pend" data-act="pend" data-inst="IF" data-key="id:IF"') > 0);
  assert.ok(lock.indexOf('data-act="tag"') < 0 && lock.indexOf('hb-acts') < 0);   // 구분 메뉴·동작 단추는 그리지 않는다
  const ro = kbb.goalRowHtml(r, { win: win, canEdit: false, selCol: true });
  assert.ok(ro.indexOf('<span class="hb-pend">') > 0 && ro.indexOf('<button type="button" class="hb-pend"') < 0);
  const car = kbb.goalRowHtml(c, { win: win, canEdit: true });
  assert.ok(car.indexOf('</button><span class="hb-q">이월</span>') > 0 && car.indexOf('hb-prev') < 0 && car.indexOf('예전 국민은행 금고, 마지막 2022년') < 0);   // 예전 KB는 글자 대신 title·sr
  assert.strictEqual(car.split('예전 국민은행 금고(마지막 2022년)').length - 1, 2);   // title 한 번 + sr 한 번(sr 문장이 두 번 읽히지 않는다, qa P3-2)
  const notCar = kbb.goalRowHtml(kbb.goalRow(tgt('IN', 'NEW'), ctx), { win: win, canEdit: true });
  assert.ok(notCar.indexOf('예전 국민은행 금고, 마지막 2022년') > 0 && notCar.indexOf('hb-prev') > 0);   // 이월이 아닌 줄은 그대로
  assert.ok(car.indexOf('2025 목표에서 자동으로 넘어옴. 작년 결과: 협약 개시일이 지났는데 금고 약정 기록이 없음 · 되찾기 후보: 예전 국민은행 금고(마지막 2022년) · 달성 판정일 2027-01-01(추정)') > 0);
  const closedPend = kbb.goalRow(tgt('IE', 'NEW', { change_pending: true, bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30', round_seq: 1 } }), ctx);
  assert.ok(kbb.goalRowHtml(closedPend, { win: win, canEdit: true }).indexOf('data-act="towatch"') < 0);   // 입찰 종료 줄 동작 단추도 잠기면 없음
  const w = kbb.goalRow({ institution_id: 'W1', institution_name: '행', kind_cd: 'WATCH', target_no: 3, rev_no: 1, target_year: null, tag_cd: 'NEW', tag_name: '신규유치 도전', memo: '', next_term_to: '2028-12-31', can_cancel: true }, ctx);
  assert.strictEqual(w.movable, 2028);
  const wh = kbb.watchRowHtml(w, { canEdit: true, selCol: true, picked: { W1: 3 } });
  assert.ok(wh.indexOf('<tr class="picked"><td class="ck"><label><input type="checkbox" data-pick="W1"') === 0 && wh.indexOf('data-act="togoal"') > 0);
  const wl = kbb.watchRowHtml(Object.assign({}, w, { pend: true }), { canEdit: true, selCol: true });
  assert.ok(wl.indexOf('<tr class="locked">') === 0 && wl.indexOf('data-act="togoal"') < 0);
  assert.ok(kbb.watchRowHtml(Object.assign({}, w, { movable: 0 }), { canEdit: true, selCol: true }).indexOf('<td class="ck"></td>') > 0);
  assert.ok(kbb.watchRowHtml(w, { canEdit: true }).indexOf('<tr><th scope="row">') === 0);
  const tb = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: win, rows: [plain], out: [], canEdit: true, selCol: true, picked: {}, sort: { key: 'due', dir: 'asc' }, total: 1 });
  assert.ok(tb.indexOf('<table class="hb-tt sel">') === 0 && tb.indexOf('<colgroup><col class="c-ck"><col class="c-nm">') > 0 && tb.indexOf('<thead><tr><th scope="col" class="ck">') > 0);
  const em = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: win, rows: [], out: [], canEdit: true, selCol: true, groups: [], total: 0 });
  assert.ok(em.indexOf('colspan="9"') > 0);
  const wt = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'watch', win: win, rows: [w], out: [], canEdit: true, selCol: true, picked: {}, sort: { key: 'next', dir: 'asc' }, total: 1 });
  assert.ok(wt.indexOf('<colgroup><col class="c-ck"><col class="c-wnm">') > 0 && wt.indexOf('<th scope="col" class="ck">') > 0);
  const no = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: win, rows: [plain], out: [], canEdit: true, sort: { key: 'due', dir: 'asc' }, total: 1 });
  assert.ok(no.indexOf('<table class="hb-tt">') === 0 && no.indexOf('c-ck') < 0 && no.indexOf('hb-pickall') < 0);
});

test('현황판: 상태 거르기 9개(결재 중·자동 이월)·관심 자동 이월, 구분 메뉴 협약 개시일·판정일 줄', function () {
  assert.strictEqual(kbb.STATUS.goal.length, 9);
  assert.deepStrictEqual(kbb.STATUS.goal.slice(-2), [['pending', '결재 중'], ['carried', '자동 이월']]);
  assert.deepStrictEqual(kbb.STATUS.watch.slice(-1), [['carried', '자동 이월']]);
  const ctx = mkCtx(), rows = kbb.goalRows([tgt('IA', 'NEW'), tgt('IB', 'NEW', { carried: true }), tgt('IC', 'NEW', { change_pending: true })], ctx);
  assert.deepStrictEqual(kbb.filterRows(rows, { status: 'pending' }).map(function (x) { return x.id; }), ['IC']);
  assert.deepStrictEqual(kbb.filterRows(rows, { status: 'carried' }).map(function (x) { return x.id; }), ['IB']);
  const r = rows[0], tags = [{ code: 'RETAIN', name: '재유치 도전' }, { code: 'NEW', name: '신규유치 도전' }];
  // 사용자 11-25: 구분 메뉴는 구분만 — 달성 판정일·협약 개시일 항목은 메뉴에서 빠지고(개시일은 [수정하기…] 창 줄 안 [협약 개시일 적기…]), 이름은 '구분 고르기'
  const m = kbb.menuHtml(r, { tags: tags, def: { tag: 'RETAIN', why: 'kb' }, canCancel: true, canMove: true, canTerm: true, judgeText: '달성 판정일 2027-01-01(추정)' });
  assert.ok(m.indexOf('<div class="hb-menu" role="menu" aria-label="구분 고르기" aria-describedby="hb-menu-sug">') === 0);
  assert.ok(m.indexOf('달성 판정일') < 0 && m.indexOf('data-cmd="term"') < 0 && m.indexOf('협약 개시일 적기') < 0);
  assert.ok(m.indexOf('자동 제안') > 0 && m.indexOf('role="menuitem"') < 0);
  assert.ok(kbb.menuHtml(r, { tags: tags, def: {}, canCancel: true }).indexOf('aria-label="구분 고르기"') > 0);
});

test('현황판: 403 APPROVAL_REQUIRED는 목록을 다시 읽게 stale + 고정 문장, 409 CHANGE_PENDING은 서버 문장 + stale', function () {
  const a = kbb.outcome({ status: 403, body: { detail: { code: 'APPROVAL_REQUIRED', message: '목표 기관 정보를 바꾸려면 결재가 필요합니다. 체크한 뒤 [결재 요청]으로 올려 주세요.' } } }, 'edit');
  assert.deepStrictEqual(a, { kind: 'stale', code: 'APPROVAL_REQUIRED', msg: tc.APPROVAL_NOW_MSG });
  assert.ok(tc.APPROVAL_NOW_MSG.indexOf('[삭제하기]') > 0 && tc.APPROVAL_NOW_MSG.indexOf('[관심 기관으로…]') > 0 && tc.APPROVAL_NOW_MSG.indexOf('빼기·옮기기 결재 요청') < 0);
  const p = kbb.outcome({ status: 409, body: { detail: { code: 'CHANGE_PENDING', message: '이 기관은 목표 변경 결재가 진행 중입니다. 결재가 끝난 뒤 다시 시도해 주세요.' } } }, 'edit');
  assert.strictEqual(p.kind, 'stale'); assert.ok(p.msg.indexOf('이 기관은 목표 변경 결재가 진행 중입니다.') === 0);
  assert.strictEqual(kbb.outcome({ status: 403, body: { detail: '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.' } }, 'add').kind, 'denied');   // 기존 403은 그대로
});

test('요청: /bid-targets/changes·/bid-targets/carry·/institutions/{id}/bid-terms 주소와 머리글(X-Button-Id), kbb.BTN은 그대로', async function () {
  const calls = [], keep = kbb.env.fetch;
  try {
    kbb.env.fetch = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ status: 200, json: function () { return Promise.resolve({}); } }); };
    await kbb.submitChanges({ reason: 'r', items: [{ institution_id: 'I1', op_cd: 'TO_WATCH', target_no: 1, base_rev_no: 2 }] });
    await kbb.carryTargets();
    await kbb.saveTerm('I 1', { target_year: 2026, term_start: '2027-03-01', base_rev_no: 0 });
    assert.strictEqual(calls[0].url, '/bid-targets/changes');
    assert.deepStrictEqual(calls[0].init.headers, { 'Content-Type': 'application/json', 'X-Screen-Id': 'bid_board', 'X-Button-Id': 'submit_target_change' });
    assert.deepStrictEqual(JSON.parse(calls[0].init.body), { reason: 'r', items: [{ institution_id: 'I1', op_cd: 'TO_WATCH', target_no: 1, base_rev_no: 2 }] });
    assert.strictEqual(calls[1].url, '/bid-targets/carry'); assert.strictEqual(calls[1].init.headers['X-Button-Id'], 'carry_targets');
    assert.strictEqual(calls[2].url, '/institutions/I%201/bid-terms'); assert.strictEqual(calls[2].init.headers['X-Button-Id'], 'set_term_start');
    assert.deepStrictEqual(JSON.parse(calls[2].init.body), { target_year: 2026, term_start: '2027-03-01', base_rev_no: 0 });
  } finally { kbb.env.fetch = keep; }
  assert.strictEqual(Object.keys(kbb.BTN).length, 8);
  const j = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'TargetUiIds.java');
  if (fs.existsSync(j)) { const t = fs.readFileSync(j, 'utf8'); Object.keys(tc.BTN).forEach(function (n) { assert.ok(t.indexOf('"' + tc.BTN[n] + '"') > 0, tc.BTN[n]); }); }
});

test('현황판 소스 배선: 한 줄 동작은 결재 모드에서 일괄 창으로, 추가 창은 [결재 요청 쓰기], 새 창은 dlg, 서버 글은 textContent·esc', function () {
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("const tc = isNode ? require('./tchange.js') : root.tchange;") > 0);
  assert.ok(k.indexOf("changeTag(r, code, btn);   // 목표 줄은 저장 전 대기(띠 [수정하기…]로 저장), 관심 줄은 바로 저장한다") > 0 && k.indexOf("op: 'EDIT', tag: code") < 0);   // 구분 고르기는 결재 창으로 가지 않는다(NEXT 114)
  // 구분 메뉴에서 빠진 빼기·옮기기·메모·개시일 분기는 없고(11-25), 관심 줄 빼기는 줄 안 단추(data-act="unwatch") → openCancel, 옮기기는 줄 단추·[수정하기…] 결재 칸
  assert.ok(!/(^|[^.\w])cmd === '(cancel|towatch|memo|term)'/.test(k));   // 메뉴 클릭 분기 없음(m.cmd는 이동 창 상태라 별개)
  assert.ok(k.indexOf("else if (act === 'unwatch') { const r = rowOfBtn(btn, false); if (r && r.kind === 'WATCH') openCancel(r, btn); }") > 0);
  assert.ok(k.indexOf("if (r && isApproval()) openChange(moveChange(r, act, btn)); else if (r) openMove(act, r, btn);") > 0);
  assert.ok(k.indexOf("if (!watch && isApproval()) { addToChange(d, eff); return; }") > 0);
  assert.ok(k.indexOf("go.textContent = tc.addGoText('APPROVAL')") > 0 && k.indexOf("go.textContent = m.busy ? '저장 중…' : (watch ? '내 관심에 넣기' : '목표에 넣기')") > 0);   // 기존 줄은 그대로
  assert.ok(/role="tabpanel"><\/div>' \+ tc\.selbarHtml\(\) \+ '<div class="hb-tf" id="hb-tf"><\/div><\/div>'/.test(k));
  assert.ok(k.indexOf("if (t.id === 'hb-pickall' || (t.getAttribute && t.getAttribute('data-pick') !== null)) { onPick(t); return; }") > 0);
  assert.ok(k.indexOf("if (btn.classList.contains('hb-pend')) {") > 0 && k.indexOf("hb-selgo") < 0);   // 띠 결재 주 단추는 없앴다(사용자 11-25)
  assert.ok(k.indexOf("if (r.pend) return tc.pendCellHtml(r, { canEdit: o.canEdit });") > 0);
  assert.ok(k.indexOf("if (a && msg && act && act !== 'watch') a.innerHTML = tc.actHtml(act);") > 0 && k.indexOf("msg && act === 'watch' ? kbb.seeWatchHtml() : ''") > 0);
  assert.ok(/root\.dlg\.open\(ov, \{\s*isDirty:/.test(k) && k.indexOf('document.body.appendChild(ov);   // 덮개는 body 직계') > 0);   // 새 창은 공통 dlg
  assert.ok(k.indexOf('maybeCarry();') > 0 && k.indexOf('tc.carryText(sum)') > 0 && k.indexOf("kbb.carryTargets()") > 0);   // 자동 이월은 현황판에서만
  assert.ok(!/(^|[^.\w])confirm\(/.test(k) && k.indexOf('alert(') < 0 && k.indexOf('aria-live') < 0);   // 브라우저 confirm()은 안 쓴다 — 공통 root.dlg.confirm(제안 사전준비 확인 상자)은 허용
  assert.ok(/kbb\.unmount = function \(\) \{[\s\S]*?closeChangeDlgs\(\);/.test(k) && /kbb\.onProfileChange = function \(\) \{[\s\S]*?closeChangeDlgs\(\);/.test(k));
  const other = ['js/dashboard.js', 'js/plans.js', 'js/results.js'].map(src).join('\n');
  assert.ok(other.indexOf('/bid-targets/carry') < 0);   // carry POST는 입찰 현황판만
});

test('index.html: tchange.js는 logic·errtext 뒤 approvals·kbboard 앞, 새 CSS는 현황판 구간 안에서 hex·새 변수·그림자 없이 토큰만', function () {
  const html = src('index.html');
  const at = function (n) { return html.indexOf('<script src="js/' + n + '.js"></script>'); };
  assert.ok(at('tchange') > at('logic') && at('tchange') > at('errtext') && at('tchange') < at('approvals') && at('tchange') < at('kbboard'));
  const a = html.indexOf('/* NEXT 105(design-reviewer 2026-11-23_0919_ad69b2cf 6-7)'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */'), s0 = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작');
  assert.ok(s0 > 0 && a > s0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-tt col\.c-ck \{ width:32px; \}/.test(css) && /\.hb-selbar\[hidden\] \{ display:none; \}/.test(css) && /#tc-dlg \.dlg-ferr:empty, #tt-dlg \.dlg-ferr:empty \{ display:none; \}/.test(css));
  assert.ok(!/(^|\})\s*\.dlg-ferr:empty/.test(css));   // 다른 .dlg 창에 번지지 않게 105 창 범위로만(qa P3-3)
  assert.ok(/\.hb-pend \{[^}]*color-mix\(in srgb, var\(--blue\) 72%, var\(--fg\)\)[^}]*border:1px solid var\(--blue\)[^}]*color-mix\(in srgb, var\(--blue\) 18%, transparent\)/.test(css));
  assert.ok(/button\.hb-pend:hover \{[^}]*background:color-mix/.test(css));   // 공통 button:hover에 지지 않는다
  assert.ok(/\.ap-tc col\.tc-c1 \{ width:22%; \}/.test(css));
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepStrictEqual(css.match(/(^|[\s;{])--[\w-]+\s*:/g) || [], []);
  // 고른 기관 띠(.hb-selbar) 하나만 위쪽 그림자·등장 움직임 예외(사용자 11-24, design-reviewer 11-24 1819 4번) — 그 두 규칙을 빼고 나머지에는 그림자·투명도 움직임이 없다
  const plain = css.replace(/\.hb-selbar \{[^}]*\}/, '').replace(/@keyframes hbSelIn \{ from \{[^}]*\} to \{[^}]*\} \}/, '');
  assert.ok(css.indexOf('.hb-selbar {') >= 0 && plain.indexOf('.hb-selbar {') < 0 && plain.indexOf('hbSelIn {') < 0);
  assert.ok(plain.indexOf('box-shadow') < 0 && !/opacity:\s*(0|\.)/.test(plain) && !/border-left:\s*3px/.test(plain));
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 12, m); });
  // NEXT 114: 띠 보조 단추·글자 모양 [선택 지우기]·메모 창 CSS(새 색·그림자·투명도 없음은 위 단언이 함께 본다)
  assert.ok(/\.hb-selbar \.lnk \{[^}]*border:0[^}]*background:transparent[^}]*color:var\(--muted\)/.test(css) && /\.hb-selbar \.lnk:hover[^{]*\{[^}]*text-decoration:underline/.test(css));
  assert.ok(/\.hb-selbar button\[hidden\] \{ display:none; \}/.test(css) && /\.hb-selbar #hb-seledit \{[^}]*border:1px solid var\(--line-strong\)/.test(css) && /#mm-dlg \.dlg-ferr:empty \{ display:none; \}/.test(css));
});

// ── NEXT 114(design-reviewer 2026-11-24_2327_a59fddd3 6절): 결재 줄이기 — 구분·메모는 바로 저장, 옮기기·빼기만 결재 ─────────────
test('NEXT 114 띠: 고른 목표 기관 n곳·선택 지우기·[수정하기…]·결재자 안내·주 단추, 섞임·화면 밖 문구', function () {
  const b = tc.selbarHtml();
  assert.ok(b.indexOf('<span class="sp"></span><button type="button" id="hb-seledit" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-seledit-why">수정하기</button><span id="hb-seledit-why" class="sr-only"></span><button type="button" id="hb-seldel" aria-haspopup="dialog" aria-disabled="true" aria-describedby="hb-seldel-why">삭제하기</button><span id="hb-seldel-why" class="sr-only"></span></div>') > 0);
  assert.ok(b.indexOf('hb-selwho') < 0 && b.indexOf('hb-selgo') < 0);   // 결재자 안내·결재 주 단추 없음(사용자 11-25)
  assert.ok(b.indexOf('고르기 해제') < 0);
  assert.strictEqual(tc.selStatusHtml(5, '', { goal: 5, watch: 0 }, 0), '<span class="sr-only">목표 기관 5곳 고름</span><span aria-hidden="true">고른 목표 기관 <b>5</b>곳</span>');
  assert.strictEqual(tc.selStatusHtml(2, '', { goal: 0, watch: 2 }, 0), '<span class="sr-only">관심 기관 2곳 고름</span><span aria-hidden="true">고른 관심 기관 <b>2</b>곳</span>');
  assert.strictEqual(tc.selStatusHtml(5, '', { goal: 3, watch: 2 }, 0), '<span class="sr-only">기관 5곳 고름(목표 3·관심 2)</span><span aria-hidden="true">고른 기관 <b>5</b>곳(목표 3·관심 2)</span>');
  const off = tc.selStatusHtml(5, '', { goal: 5, watch: 0 }, 2);
  assert.ok(off.indexOf('<span class="sr-only">목표 기관 5곳 고름, 이 화면 밖 2곳 포함</span>') === 0 && off.indexOf('고른 목표 기관 <b>5</b>곳 · 이 화면 밖 2곳') > 0);
  const s = tc.newSel();
  tc.pick(s, { id: 'A', targetNo: 1, kind: 'GOAL' });
  assert.deepStrictEqual(tc.kindCounts(s), { goal: 1, watch: 0 }); assert.strictEqual(tc.mixOf(s), 'GOAL');
  tc.pick(s, { id: 'W', targetNo: 2, kind: 'WATCH' });
  assert.strictEqual(tc.mixOf(s), 'MIX');
  tc.unpick(s, 'A');
  assert.strictEqual(tc.mixOf(s), 'WATCH');
  const k = src('js/kbboard.js');
  // 띠 [수정하기…] 보임 조건(11-25): 두 칸(바로 반영·결재 요청) 중 하나라도 켜짐 — 관심이 섞여도 결재 칸이 켜져 있으면 보인다
  assert.ok(k.indexOf('paintBulk();   // [수정하기]·[삭제하기] 켜짐·꺼진 이유') > 0 && k.indexOf('ed.hidden = !(av.edit.on') < 0 && k.indexOf('function modeAvail() { return tc.modeAvail(gs.sel, { canBulk: canBulkEdit(), hasMode: !!goalMode(), year: U.todayDate().getFullYear() }); }') > 0);
  assert.ok(k.indexOf("case 'hb-seledit': bulkClick('edit', btn); break;") > 0 && k.indexOf("case 'hb-seldel': bulkClick('delete', btn); break;") > 0);
  // tc.modeAvail: 켜짐·꺼짐과 이유 문장
  const ms = tc.newSel();
  assert.deepStrictEqual(tc.modeAvail(ms, { canBulk: true, hasMode: true, year: 2026 }), { edit: { on: false, why: '고른 기관이 없습니다.' }, approval: { on: false, why: '고른 기관이 없습니다.' } });
  tc.pick(ms, { id: 'A', targetNo: 1, kind: 'GOAL', year: 2026 });
  assert.deepStrictEqual(tc.modeAvail(ms, { canBulk: true, hasMode: true, year: 2026 }), { edit: { on: true, why: '' }, approval: { on: true, why: '' } });
  assert.strictEqual(tc.modeAvail(ms, { canBulk: false, hasMode: true, year: 2026 }).edit.on, false);   // 서버가 바로 반영을 안 주면 결재 칸만
  assert.strictEqual(tc.modeAvail(ms, { canBulk: false, hasMode: true, year: 2026 }).approval.on, true);
  tc.pick(ms, { id: 'W', targetNo: 2, kind: 'WATCH', year: 0, moveYear: 2027 });
  const mx = tc.modeAvail(ms, { canBulk: true, hasMode: true, year: 2026 });
  assert.deepStrictEqual([mx.edit.on, mx.edit.why, mx.approval.on], [false, '관심 기관이 섞여 있어 고칠 수 없습니다.', true]);
  tc.unpick(ms, 'W'); tc.pick(ms, { id: 'P', targetNo: 3, kind: 'GOAL', year: 2025 });
  assert.deepStrictEqual([tc.modeAvail(ms, { canBulk: true, hasMode: true, year: 2026 }).edit.on, tc.modeAvail(ms, { canBulk: true, hasMode: true, year: 2026 }).edit.why], [false, '지난해 목표가 있어 고칠 수 없습니다.']);   // 지난해 목표는 바로 반영 칸만 꺼진다
  assert.strictEqual(tc.modeAvail(ms, { canBulk: true, hasMode: false, year: 2026 }).approval.on, false);
  // D. 구분 바뀜 대기 알림(저장 전): 일반색 .note, 한도 경고(.lim)가 있으면 그쪽이 이긴다
  assert.strictEqual(tc.autoPickNote(1), '구분 바뀜 1곳 — [수정하기]로 저장');
  assert.strictEqual(tc.autoPickNote(2), '구분 바뀜 2곳 — [수정하기]로 저장');
  assert.strictEqual(tc.selStatusHtml(2, '', { goal: 2, watch: 0 }, 0, tc.autoPickNote(2)),
    '<span class="sr-only">구분 바뀜 2곳 — [수정하기]로 저장. 목표 기관 2곳 고름</span><span aria-hidden="true">고른 목표 기관 <b>2</b>곳</span><span class="note" aria-hidden="true">구분 바뀜 2곳 — [수정하기]로 저장</span>');
  assert.ok(tc.selStatusHtml(20, tc.CAP_MSG, { goal: 20, watch: 0 }, 0, '알림').indexOf('class="note"') < 0);
  assert.ok(tc.selStatusHtml(1, '', { goal: 1, watch: 0 }, 0, '').indexOf('class="note"') < 0);   // 알림이 없으면 예전 마크업 그대로
  assert.ok(k.indexOf('tc.barBtnText(') < 0 && k.indexOf('hb-selwho') < 0);   // 띠가 더는 쓰지 않는다(함수는 남김)
});

test('구분 칩 메뉴(11-25): 구분 라디오만 — 메모·협약 개시일·결재 필요·옮기기·빼기 항목이 하나도 없다(어떤 옵션을 줘도), 입구는 [수정하기…] 창 두 칸', function () {
  const r = { tagCd: 'RETAIN', closed: { cd: 'NOTICE_CLOSED' } };
  const o = { tags: TAGS, def: {}, canCancel: true, canMove: true, canTerm: true, canMemo: true, approval: true };
  const m = kbb.menuHtml(r, o);
  assert.ok(m.indexOf('aria-label="구분 고르기"') > 0 && m.indexOf('aria-label="목표 기관 동작"') < 0 && m.indexOf('내 관심 기관 동작') < 0);
  assert.strictEqual((m.match(/role="menuitem"/g) || []).length, 0);
  assert.strictEqual((m.match(/role="menuitemradio"/g) || []).length, 2);
  ['data-cmd', '결재 필요', '메모 고치기', '협약 개시일', '내 관심으로', '목표에서 빼기', 'role="separator"', '다음 회차'].forEach(function (s) { assert.ok(m.indexOf(s) < 0, s); });
  assert.ok(m.indexOf('aria-describedby') < 0);   // 자동 제안 머리가 없으면 describedby도 없다
  assert.ok(kbb.menuHtml(r, Object.assign({}, o, { def: { tag: 'RETAIN', why: 'kb' } })).indexOf('role="menu" aria-label="구분 고르기" aria-describedby="hb-menu-sug"><div class="mh" id="hb-menu-sug">자동 제안: 재유치 도전') > 0);
  const k = src('js/kbboard.js');
  const mo = k.indexOf('function openMenu(btn) {'), me = k.indexOf('function changeTag(r, code, btn) {');
  assert.ok(mo > 0 && me > mo && k.slice(mo, me).indexOf('openMemo') < 0);   // 구분 메뉴 안에는 메모 입구 없음. 관심 줄 [메모 고치기…](data-act="memo")는 줄 안 단추라 허용(qa P2-1)
  assert.strictEqual((k.match(/openMemo\(r, btn\)/g) || []).length, 0);   // 메모 입구는 화면에서 없앴다(사용자 11-25, NEXT 114) — 함수만 남음
  assert.ok(k.indexOf("kbb.menuHtml(r, { tags: canValueEdit(r) ? tagList() : [], def: kbb.fitTag(kbb.defaultTag(r.rec, gs.sum[r.id], tagOpts()), tagList()) });") > 0);   // 메뉴에는 tags·def만 넘긴다
});

test('NEXT 114 바로 저장 본문(보안 필수): 구분만 바꿔도 메모·연도·주 담당은 지금 값 전체, 메모만 바꿔도 구분이 그대로, 관심은 연도 없음', function () {
  const g = { targetNo: 3, revNo: 5, targetYear: 2026, tagCd: 'RETAIN', memo: '설명회 참석', ownerEmpNo: 'E1', kind: 'GOAL' };
  assert.deepStrictEqual(kbb.valueBody(g, { tag_cd: 'NEW' }), { target_no: 3, base_rev_no: 5, target_year: 2026, tag_cd: 'NEW', owner_emp_no: 'E1' });   // memo 키 없음 = 서버가 지금 메모를 유지(qa 11-25 P2-1)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(kbb.valueBody(g, { tag_cd: 'NEW' }), 'memo'), false);
  assert.deepStrictEqual(kbb.valueBody(g, { memo: null }), { target_no: 3, base_rev_no: 5, target_year: 2026, tag_cd: 'RETAIN', owner_emp_no: 'E1', memo: null });   // 메모를 바꿀 때만 over로 담는다
  assert.deepStrictEqual(kbb.valueBody(Object.assign({}, g, { memo: '', ownerEmpNo: '' }), { tag_cd: 'NEW' }), { target_no: 3, base_rev_no: 5, target_year: 2026, tag_cd: 'NEW', owner_emp_no: null });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(kbb.valueBody(Object.assign({}, g, { kind: 'WATCH' }), {}), 'target_year'), false);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("kbb.valueBody(r, { tag_cd: code })") > 0 && k.indexOf("kbb.valueBody(d.r, { memo: v || null })") > 0);   // 한 줄 저장은 두 곳 모두 이 본문 하나를 쓴다
  // 일괄 [수정하기]: 항목마다 연도·구분·메모·주 담당을 전부 담는다(연도는 지금 값 그대로)
  const A = tc.newItem(1, snapA()); tc.setOp(A, 'EDIT'); A.tag = 'NEW';
  const body = tc.buildBody([A], { mode: 'DIRECT' });
  assert.deepStrictEqual(body, { items: [{ institution_id: 'A', op_cd: 'EDIT', target_no: 1, base_rev_no: 2, target_year: 2026, tag_cd: 'NEW', owner_emp_no: 'E1' }] });
  const B = tc.newItem(2, tc.entryOfRow(mk({ id: 'B', targetNo: 2, revNo: 3, memo: '기존 메모', ownerEmpNo: 'E2' }))); tc.setOp(B, 'EDIT'); B.tag = 'RETAIN';
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tc.buildBody([B], { mode: 'DIRECT' }).items[0], 'memo'), false);   // 기존 메모가 있어도 memo 키는 보내지 않는다(서버가 유지)
  assert.strictEqual(tc.buildBody([B], { mode: 'DIRECT' }).items[0].owner_emp_no, 'E2');
});

test('NEXT 114 일괄 창 두 갈래: 수정 창(사유·동작·연도 칸 없음, 수정하기) / 결재 창(다음 회차 목표로는 EDIT+연도 +1, 구분·메모 그대로)', function () {
  const A = tc.newItem(1, snapA()); tc.setOp(A, 'EDIT');
  const B = tc.newItem(2, tc.entryOfRow(mk({ id: 'B', name: '수원시', targetNo: 2, revNo: 3, tagCd: 'NEW', tagName: '신규유치 도전' }))); tc.setOp(B, 'EDIT');
  const h = tc.editDialogHtml({ items: [A, B] }, OPT);
  assert.ok(h.indexOf('<div id="tc-dlg" class="modal-overlay" style="display:none" data-kind="edit">') === 0);
  assert.ok(h.indexOf('<h2 class="dlg-t" id="tc-t" tabindex="-1">고른 기관 수정 — 2곳</h2>') > 0);
  assert.ok(h.indexOf('id="tc-cancel">취소</button><button type="button" id="tc-go" class="dlg-go">수정하기</button>') > 0);
  assert.ok(h.indexOf('<p class="dlg-hint" id="tc-hint">결재 없이 바로 반영합니다. 바꾼 사람·시각은 기록에 남습니다.</p>') > 0);
  assert.ok(h.indexOf('tc-reason') < 0 && h.indexOf('tc-allop') < 0 && h.indexOf('-op"') < 0 && h.indexOf('data-f="year"') < 0);   // 사유·동작·연도 칸 없음
  assert.ok(h.indexOf('<label for="tc-alltag">고른 목표 줄 모두</label><select id="tc-alltag"><option value="">구분 한꺼번에 정하기</option>') > 0);
  assert.ok(h.indexOf('<span class="fix">바로 반영</span>') > 0 && h.indexOf('data-f="tag"') > 0 && h.indexOf('data-f="memo"') > 0);
  assert.ok(tc.editDialogHtml({ items: [A] }, OPT).indexOf('tc-alltag') < 0);   // 한 곳이면 '모두' 칸 없음
  assert.strictEqual(tc.editTitle(3), '고른 기관 수정 — 3곳');
  // 두 칸 세그먼트(11-25): 「구분·메모 고치기(바로 반영)」/「빼기·옮기기(결재 요청)」 — 라디오 name=tc-mode 2개, 켜진 첫 칸이 기본
  assert.strictEqual((h.match(/<input type="radio" name="tc-mode"/g) || []).length, 2);
  assert.ok(h.indexOf('<fieldset class="tc-mode"><legend class="sr-only">무엇을 고칠지 고르세요</legend>') > 0);
  assert.ok(h.indexOf('<input type="radio" name="tc-mode" value="edit" checked><span>구분·메모 고치기</span><small>바로 반영</small>') > 0);
  assert.ok(h.indexOf('<input type="radio" name="tc-mode" value="approval"><span>빼기·옮기기</span><small>결재 요청</small>') > 0);
  assert.ok(h.indexOf('disabled') < 0);
  // 꺼진 칸: disabled + label 안 small이 이유로 바뀌고, 같은 이유가 sr 문장에도 있다
  const avOff = { edit: { on: false, why: '관심 기관이 섞여 있어 고칠 수 없습니다.' }, approval: { on: true, why: '' } };
  const ho = tc.editDialogHtml({ kind: 'approval', items: [tc.newItem(1, snapA())], mode: 'APPROVAL', role: '영업팀', avail: avOff, n: 1 }, OPT);
  assert.ok(ho.indexOf('data-kind="approval"') > 0 && ho.indexOf('<label class="off"><input type="radio" name="tc-mode" value="edit" disabled><span>구분·메모 고치기</span><small>관심 기관이 섞여 있어 고칠 수 없습니다.</small></label>') > 0);
  assert.ok(ho.indexOf('<input type="radio" name="tc-mode" value="approval" checked>') > 0 && ho.indexOf('tc-mode-why2') < 0);   // P3-5: 남의 칸 이유를 읽지 않게 sr 문장·describedby 없음(이유는 label 안 small)
  // 결재 칸 본문 = 지금의 dialogHtml 본문(사유 칸·동작 고르기), 보내기 글자·안내도 그쪽 것
  assert.ok(ho.indexOf('id="tc-reason"') > 0 && ho.indexOf('id="tc-i1-op"') > 0 && ho.indexOf('class="dlg-go">결재 요청</button>') > 0 && ho.indexOf('영업팀장이 결재합니다.') > 0);
  assert.ok(ho.indexOf('<h2 class="dlg-t" id="tc-t" tabindex="-1">고른 기관 수정 — 1곳</h2>') > 0);   // 어느 칸이든 같은 제목
  const hd = tc.editDialogHtml({ kind: 'approval', items: [tc.newItem(1, snapA())], mode: 'DIRECT', role: '영업부장', n: 1 }, OPT);
  assert.ok(hd.indexOf('class="dlg-go">바로 반영</button>') > 0 && hd.indexOf('id="tc-reason"') < 0);   // 영업부장: 사유 없이 바로 반영
  // 칸을 바꿀 때 갈아 끼우는 본문·안내·글자 조각
  assert.ok(tc.modeBodyHtml({ kind: 'edit', items: [A, B] }, OPT).indexOf('id="tc-alltag"') >= 0 && tc.modeBodyHtml({ kind: 'approval', mode: 'APPROVAL', items: [A, B] }, OPT).indexOf('id="tc-reason"') >= 0);
  assert.strictEqual(tc.modeHint({ kind: 'edit' }), tc.EDIT_HINT);
  assert.strictEqual(tc.modeGo({ kind: 'edit' }), '수정하기');
  assert.strictEqual(tc.modeGo({ kind: 'approval', mode: 'APPROVAL' }), '결재 요청');
  // 줄 안 [협약 개시일 적기…](개시일 입구) — o.terms에 든 기관만, 기관 이름은 이스케이프
  const ht = tc.editDialogHtml({ items: [A] }, Object.assign({}, OPT, { terms: { A: '달성 판정일 2027-01-01(추정)' } }));
  assert.ok(ht.indexOf('class="tc-termgo" data-uid="1" data-inst="A" aria-haspopup="dialog" aria-label="종로구청 협약 개시일 적기">협약 개시일 적기…</button><span class="tc-memo">달성 판정일 2027-01-01(추정)</span>') > 0);
  assert.ok(h.indexOf('tc-termgo') < 0);
  // 아무것도 안 바꾼 항목은 기존 문장(연도 검사는 지금 값 그대로라 걸리지 않는다)
  assert.deepStrictEqual(tc.validate([A], { mode: 'DIRECT' }).items, [{ uid: 1, f: 'edit', msg: '고친 내용이 없습니다. 칸을 바꾸거나 이 기관을 이번 수정에서 빼세요.' }]);
  A.memo = '새 메모'; assert.strictEqual(tc.validate([A], { mode: 'DIRECT' }).ok, true);
  // 결과·알림 문장
  assert.deepStrictEqual(tc.resultOf({ mode: 'DIRECT', direct_basis: 'VALUE_EDIT', applied: 2 }, 2, 'edit'), { mode: 'DIRECT', n: 2, text: '목표 기관 2곳의 구분을 수정했습니다. 결재 없이 반영되고 기록에 남습니다.' });
  assert.strictEqual(tc.memoFlash('종로구청', '설명회'), '종로구청 메모를 저장했습니다. 결재 없이 반영되고 기록에 남습니다.');
  assert.strictEqual(tc.memoFlash('종로구청', '  '), '종로구청 메모를 지웠습니다. 기록에 남습니다.');
  assert.strictEqual(tc.pendingLockMsg('종로구청'), '종로구청은 방금 결재 요청에 들어가 잠겼습니다. 결재가 끝나면 다시 바꿀 수 있습니다.');
  assert.strictEqual(tc.pendingLockMsg('수원시'), '수원시는 방금 결재 요청에 들어가 잠겼습니다. 결재가 끝나면 다시 바꿀 수 있습니다.');
  // 결재 창: 다음 회차 목표로 = NEXT(서버 본문은 EDIT + 연도 +1 + 구분·메모·주 담당 그대로)
  const C = tc.newItem(3, tc.entryOfRow(mk({ id: 'C', targetNo: 4, revNo: 2, targetYear: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', memo: 'm', ownerEmpNo: 'E1', closed: { cd: 'NOTICE_CLOSED' } })));
  const ch = tc.itemHtml(C, 1, OPT);
  assert.ok(ch.indexOf('<option value="CANCEL">목표에서 빼기</option><option value="TO_WATCH">관심으로 옮기기</option><option value="NEXT">다음 회차 목표로</option>') > 0);   // 입찰 종료 줄만
  tc.setOp(C, 'NEXT');
  assert.strictEqual(C.year, 2027); assert.strictEqual(C.tag, 'RETAIN'); assert.strictEqual(C.memo, 'm');
  assert.ok(tc.afterBlockHtml(C, OPT).indexOf('<dd><span class="mono">2027</span> 목표 · 구분·메모 그대로</dd>') > 0);
  assert.strictEqual(tc.validate([C], { mode: 'DIRECT' }).ok, true);
  assert.deepStrictEqual(tc.buildBody([C], { mode: 'DIRECT' }).items[0], { institution_id: 'C', op_cd: 'EDIT', target_no: 4, base_rev_no: 2, target_year: 2027, tag_cd: 'RETAIN', owner_emp_no: 'E1' });   // memo 키 없음(서버가 유지)
  assert.strictEqual(tc.opLong('NEXT'), '다음 회차 목표로');
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("return { rows: [r], op: 'NEXT', opener: opener };") > 0);
  assert.ok(k.indexOf("d.kind === 'edit' ? tc.BTN.values : undefined") > 0 && k.indexOf("save_target_values") < 0);   // 버튼 ID는 tchange.js BTN 한 곳
  assert.strictEqual(tc.BTN.values, 'save_target_values');
});

test('NEXT 114 메모 창·요청: 문구·id·글자 수, 일괄 수정은 X-Button-Id save_target_values', async function () {
  const h = tc.memoDialogHtml({ regionName: '서울', name: '종로구청<b>', memo: '안녕' });
  assert.ok(h.indexOf('<div id="mm-dlg" class="modal-overlay" style="display:none">') === 0 && h.indexOf('<h2 class="dlg-t" id="mm-t" tabindex="-1">메모 — 서울 종로구청&lt;b&gt;</h2>') > 0 && h.indexOf('<b>') < 0);
  assert.ok(h.indexOf('id="mm-cancel">취소</button><button type="button" id="mm-go" class="dlg-go">저장</button>') > 0);
  assert.ok(h.indexOf('결재 없이 바로 저장됩니다. 고친 사람·시각은 기록에 남습니다. 개인정보를 적지 마세요.') > 0);
  assert.ok(h.indexOf('<label for="mm-memo">메모</label><input id="mm-memo" maxlength="100" value="안녕" aria-describedby="mm-cnt mm-e">') > 0);
  assert.ok(h.indexOf('<span id="mm-cnt" class="mono">2/100</span>') > 0 && h.indexOf('id="mm-e"') > 0 && h.indexOf('id="mm-err" role="alert"') > 0);
  const calls = [], keep = kbb.env.fetch;
  try {
    kbb.env.fetch = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ status: 200, json: function () { return Promise.resolve({}); } }); };
    await kbb.submitChanges({ items: [] }, tc.BTN.values);
    await kbb.submitChanges({ items: [] });
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'save_target_values');
    assert.strictEqual(calls[1].init.headers['X-Button-Id'], 'submit_target_change');   // 단추를 안 주면 예전 그대로
  } finally { kbb.env.fetch = keep; }
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("function canValueEdit(r) { return r.kind === 'WATCH' || (!isPastGoal(r) && ((!!gs.data && gs.data.value_edit_mode === 'DIRECT') || goalMode() === 'DIRECT')); }") > 0);
  assert.ok(k.indexOf('[chd, trm, pnd, mmd].forEach') > 0);   // 계정이 바뀌면 메모 창도 닫는다
});

test('qa P2-1 지난해 목표는 구분·메모를 고칠 수 없다: 연도 판정·메뉴 항목·저장 막기·403 사실 문구·일괄 [수정하기…] 숨김', function () {
  assert.strictEqual(tc.isPastYear(2025, 2026), true);
  assert.strictEqual(tc.isPastYear(2026, 2026), false);
  assert.strictEqual(tc.isPastYear(null, 2026), false);   // 관심 줄은 연도가 없다
  // 메뉴: 지난해 줄은 호출부가 tags 빈 목록·canMemo false를 준다 → 구분 radio·메모 항목이 없다
  const m = kbb.menuHtml({ tagCd: 'RETAIN' }, { tags: [], def: {}, canCancel: true, canMemo: false });
  assert.ok(m.indexOf('menuitemradio') < 0 && m.indexOf('data-cmd="memo"') < 0);
  // 일괄: 고른 줄에 지난해 목표가 섞이면 센다(관심 줄은 세지 않는다)
  const s = tc.newSel();
  tc.pick(s, { id: 'A', targetNo: 1, kind: 'GOAL', year: 2026 });
  assert.strictEqual(tc.pastCount(s, 2026), 0);
  tc.pick(s, { id: 'B', targetNo: 2, kind: 'GOAL', year: 2025 });
  tc.pick(s, { id: 'W', targetNo: 3, kind: 'WATCH', year: 0 });
  assert.strictEqual(tc.pastCount(s, 2026), 1);
  // 403 APPROVAL_REQUIRED: 지난해 줄이면 결재 안내 대신 사실 문구(모순 제거), 아니면 예전 문구
  const x = { status: 403, body: { detail: { code: 'APPROVAL_REQUIRED', message: '서버 글' } } };
  assert.deepStrictEqual(kbb.outcome(x, 'edit', { year: 2025, past: true }), { kind: 'stale', code: 'APPROVAL_REQUIRED', msg: '지난해 목표는 구분을 고칠 수 없습니다.' });
  assert.strictEqual(kbb.outcome(x, 'edit', { year: 2026, past: false }).msg, tc.APPROVAL_NOW_MSG);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('tags: canValueEdit(r) ? tagList() : []') > 0);
  assert.ok(k.indexOf('if (gs.busy || !canEditNow() || !canValueEdit(r)) return;') > 0);   // changeTag도 같은 판정으로 막는다
  assert.ok(k.indexOf('year: U.todayDate().getFullYear() }); }') > 0 && tc.modeAvail(s, { canBulk: true, hasMode: true, year: 2026 }).edit.on === false);   // [수정하기…]의 바로 반영 칸은 지난해 목표가 섞이면 꺼진다(tc.pastCount를 modeAvail이 센다, 11-25)
  assert.ok(k.indexOf('past: isPastGoal(r)') > 0 && k.indexOf('past: isPastGoal(d.r)') > 0);
});

test('qa P3-1·P3-2 메모 창: 저장 중 포커스는 제목(#mm-t)으로, Enter는 한글 조합 중이면 저장하지 않는다', function () {
  const k = src('js/kbboard.js').replace(/\r\n/g, '\n');
  assert.ok(k.indexOf("if (d.busy) { const t = mmq(d, 'mm-t'); if (t && t.focus) t.focus(); }") > 0);
  assert.ok(k.indexOf("if (ev.isComposing || ev.keyCode === 229) return;   // 한글 조합을 확정하는 Enter는 저장이 아니다") > 0);
  // 동작: 메모 키 처리기만 떼어 실행한다
  const at = k.indexOf("ov.addEventListener('keydown', function (ev) {\n      if (ev.key !== 'Enter'");
  assert.ok(at > 0);
  const end = k.indexOf('\n    });', at), body = k.slice(at + "ov.addEventListener('keydown', ".length, end + '\n    }'.length);
  const run = function (ev) { let n = 0; const fn = new Function('submitMemo', 'd', 'return ' + body)(function () { n += 1; }, {}); ev.preventDefault = function () {}; fn(ev); return n; };
  const tgt = { id: 'mm-memo' };
  assert.strictEqual(run({ key: 'Enter', target: tgt, isComposing: true }), 0);
  assert.strictEqual(run({ key: 'Enter', target: tgt, keyCode: 229 }), 0);
  assert.strictEqual(run({ key: 'Enter', target: tgt }), 1);
  assert.strictEqual(run({ key: 'Enter', target: { id: 'other' } }), 0);
});
