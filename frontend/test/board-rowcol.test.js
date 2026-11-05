const test = require('node:test');
const assert = require('node:assert');
const board = require('../js/board.js');

// 이사회 양식 편집 — 행·열 삽입/삭제·병합·보호·상한·되돌리기·PUT 본문·연결 칸 확인(PR-4).
function res(ok, status, body) {
  return { ok: ok, status: status,
    json: function () { return body === undefined ? Promise.reject(new Error('x')) : Promise.resolve(body); },
    blob: function () { return Promise.resolve({ size: 1 }); } };
}
// 칸 모양 도우미: 머리(th) / 이름 칸(td) / 값 칸(input) / 엑셀 연결 칸(mapped)
function H(key, text, extra) { return Object.assign({ key: key, text: text, header: true }, extra); }
function L(key, text, extra) { return Object.assign({ key: key, text: text }, extra); }
function V(key, text) { return { key: key, text: text, input: true }; }
function M(key, text) { return { key: key, text: text, mapped: true, input: true }; }

// 표 A: 기관명이 세로 4칸 병합(행 1~4). 5행 × 3열.
function tableA() {
  return { id: 'A', ref: 'A', mapping: 'A', title: '표 A', columns: 3, notes: [],
    row_ids: [11, 12, 13, 14, 15], col_ids: [21, 22, 23],
    rows: [
      [H('h0', '기관명'), H('h1', '구분'), H('h2', '금액')],
      [L('a0', '은행', { rowspan: 4 }), L('b1', '예비비'), M('m1', '10')],
      [L('b2', '세금'), V('v2', '20')],
      [L('b3', '이자'), M('m3', '30')],
      [L('b4', '수수료'), V('v4', '40')]] };
}
// 표 B: '구분' 머리가 2열(colspan 2)로 쪼개진 모양. 3행 × 3열.
function tableB() {
  return { id: 'B', ref: 'B', mapping: 'B', title: '표 B', columns: 3, notes: ['주석'],
    row_ids: [31, 32, 33], col_ids: [41, 42, 43],
    rows: [
      [H('g', '구분', { colspan: 2 }), H('y', '금액')],
      [L('l1', '비용'), L('l2', '인건비'), M('mm', '5')],
      [L('l3', '비용'), L('l4', '운영'), V('vv', '6')]] };
}
// 이름 열이 1개뿐인 표
function tableT() {
  return { id: 'T', ref: 'T', mapping: 'T', title: '표 T', columns: 2, notes: [],
    row_ids: [51, 52], col_ids: [61, 62],
    rows: [[H('t0', '구분'), H('t1', '금액')], [L('t2', 'x'), M('t3', '1')]] };
}
// 열이 1개뿐인 표
function tableW() {
  return { id: 'W', ref: 'W', mapping: 'W', title: '표 W', columns: 1, notes: [],
    row_ids: [71, 72], col_ids: [81],
    rows: [[H('w0', '이름')], [L('w1', 'a')]] };
}
function formOf(tables, limits) {
  const f = { form_id: 7, name: '우리 양식', version: 3, editable: true, tables: tables };
  if (limits) f.limits = limits;
  return f;
}
function stAB(limits) { return board.editFromForm(formOf([tableA(), tableB()], limits)); }
function stOne(t) { return board.editFromForm(formOf([t])); }
function rowKeys(t, r) { return t.rows[r].map(function (c) { return c.key; }); }

// ── 편집 상태 ──
test('editFromForm: row_ids·col_ids가 격자와 맞으면 행·열 편집을 켜고, 없거나 길이가 다르면 끈다', function () {
  const st = stAB();
  assert.strictEqual(st.tables[0].structOk, true);
  assert.deepStrictEqual(st.tables[0].rowIds, [11, 12, 13, 14, 15]);
  assert.deepStrictEqual(st.tables[0].colIds, [21, 22, 23]);
  assert.strictEqual(board.changeCount(st), 0);
  const a = tableA(); delete a.row_ids;
  assert.strictEqual(board.editFromForm(formOf([a])).tables[0].structOk, false);
  const b = tableA(); b.col_ids = [21, 22];
  assert.strictEqual(board.editFromForm(formOf([b])).tables[0].structOk, false);
  // 켜지지 않은 표는 손잡이도 없고 메뉴 규칙도 모두 꺼져 있다
  const off = board.editFromForm(formOf([a]));
  assert.ok(!board.editHtml(off, {}, null).includes('bd-handle'));
  assert.strictEqual(board.rcRules(off, 0, 'row', 1).before.ok, false);
  assert.strictEqual(board.rcRules(off, 0, 'row', 1).del.ok, false);
});

// ── 행 삽입 + 병합 ──
test('행 삽입: 세로 병합 안쪽이면 rowspan+1, 새 행엔 병합 칸이 없고 값 칸은 공란 input', function () {
  const st = stAB();
  const r = board.rcInsertRow(st, 0, 2, 'above');   // 기관명(1~4행) 안쪽
  assert.strictEqual(r.ok, true);
  const t = r.st.tables[0];
  assert.strictEqual(t.rows.length, 6);
  assert.strictEqual(t.rows[1][0].rowspan, 5);
  assert.deepStrictEqual(t.rowIds, [11, 12, null, 13, 14, 15]);
  assert.strictEqual(t.rows[2].length, 2);   // 0열은 병합 칸이 덮는다
  const nameCell = t.rows[2][0], valueCell = t.rows[2][1];
  assert.deepStrictEqual([nameCell.fresh, nameCell.input, nameCell.header, nameCell.text], [true, false, false, '']);
  assert.deepStrictEqual([valueCell.fresh, valueCell.input, valueCell.mapped, valueCell.text], [true, true, false, '']);
  assert.strictEqual(r.key, nameCell.key);
  assert.strictEqual(t.cells[nameCell.key], '');
  assert.strictEqual(t.cells[valueCell.key], '');
  // 불변: 원래 상태는 그대로
  assert.strictEqual(st.tables[0].rows[1][0].rowspan, 4);
  assert.strictEqual(st.tables[0].rows.length, 5);
});
test('행 삽입: 병합 경계면 병합은 그대로, 새 행의 첫 칸이 새 이름 칸', function () {
  const st = stAB();
  let r = board.rcInsertRow(st, 0, 1, 'above');   // 머리 행과 병합 시작 행 사이
  let t = r.st.tables[0];
  assert.strictEqual(t.rows[2][0].rowspan, 4);    // 기존 병합 칸(한 칸 내려감) 그대로
  assert.strictEqual(t.rows[2][0].key, 'a0');
  assert.strictEqual(t.rows[1].length, 3);
  assert.strictEqual(t.rows[1][0].fresh, true);
  r = board.rcInsertRow(st, 0, 4, 'below');       // 병합이 끝나는 행 아래(표 맨 끝)
  t = r.st.tables[0];
  assert.strictEqual(t.rows[1][0].rowspan, 4);
  assert.strictEqual(t.rows.length, 6);
  assert.strictEqual(t.rows[5].length, 3);
  assert.deepStrictEqual(t.rowIds, [11, 12, 13, 14, 15, null]);
});
test('행 삽입: 머리 행 아래는 첫 본문 행을 따라 이름 칸·값 칸을 만든다', function () {
  const r = board.rcInsertRow(stAB(), 0, 0, 'below');
  const row = r.st.tables[0].rows[1];
  assert.deepStrictEqual(row.map(function (c) { return [c.input, c.header]; }), [[false, false], [false, false], [true, false]]);
});

// ── 행 삭제 + 병합 ──
test('행 삭제: 병합이 시작하는 행을 지우면 내용이 다음 행으로 옮겨 rowspan-1, 연결 칸 수를 알린다', function () {
  const st = stAB();
  assert.strictEqual(board.rcRules(st, 0, 'row', 1).del.lost, 1);   // m1
  const r = board.rcDeleteRow(st, 0, 1);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lost, 1);
  const t = r.st.tables[0];
  assert.strictEqual(t.rows.length, 4);
  assert.deepStrictEqual(rowKeys(t, 1), ['a0', 'b2', 'v2']);
  assert.strictEqual(t.rows[1][0].rowspan, 3);
  assert.deepStrictEqual(t.rowIds, [11, 13, 14, 15]);
  assert.ok(!('b1' in t.cells) && 'b2' in t.cells);
  assert.strictEqual(st.tables[0].rows.length, 5);   // 불변
});
test('행 삭제: 병합 칸이 걸친 행을 지우면 rowspan-1, 병합 한 칸짜리가 되면 속성이 없어진다', function () {
  let r = board.rcDeleteRow(stAB(), 0, 2);
  let t = r.st.tables[0];
  assert.strictEqual(t.rows[1][0].rowspan, 3);
  assert.strictEqual(r.lost, 0);
  assert.ok(!('b2' in t.cells) && !('v2' in t.cells));
  // 세 번 지워 한 행만 남기면 rowspan 속성 자체가 없다
  let st = stAB();
  st = board.rcDeleteRow(st, 0, 4).st;
  st = board.rcDeleteRow(st, 0, 3).st;
  st = board.rcDeleteRow(st, 0, 2).st;
  t = st.tables[0];
  assert.deepStrictEqual(rowKeys(t, 1), ['a0', 'b1', 'm1']);
  assert.ok(!('rowspan' in t.rows[1][0]));
});

// ── 열 삽입·삭제 ──
test('열 삽입: 표 B 구분(colspan 2) 사이에 넣으면 colspan 3, 아래 행에는 새 이름 칸', function () {
  const st = stAB();
  const r = board.rcInsertCol(st, 1, 0, 'right');
  assert.strictEqual(r.ok, true);
  const t = r.st.tables[1];
  assert.strictEqual(t.rows[0][0].colspan, 3);
  assert.strictEqual(t.rows[0].length, 2);   // 머리 행엔 새 칸이 없다(병합이 덮는다)
  assert.deepStrictEqual(t.colIds, [41, null, 42, 43]);
  assert.deepStrictEqual(t.rows[1].map(function (c) { return c.fresh === true; }), [false, true, false, false]);
  assert.strictEqual(t.rows[1][1].input, false);   // 이름 열의 새 칸 = 이름 칸
  assert.strictEqual(r.key, t.rows[1][1].key);
  assert.strictEqual(board.gridWidth(t.rows), 4);
  assert.strictEqual(r.st.tables[1].rows === st.tables[1].rows, false);   // 불변
  // 왼쪽 삽입도 같은 자리
  const l = board.rcInsertCol(st, 1, 1, 'left');
  assert.strictEqual(l.st.tables[1].rows[0][0].colspan, 3);
  // 병합 경계(구분과 금액 사이)에 넣으면 병합은 그대로
  const e = board.rcInsertCol(st, 1, 1, 'right');
  assert.ok(!('colspan' in e.st.tables[1].rows[0][0]) || e.st.tables[1].rows[0][0].colspan === 2);
  assert.strictEqual(e.st.tables[1].rows[0][0].colspan, 2);
  assert.strictEqual(e.st.tables[1].rows[0].length, 3);   // 머리 행에도 새 머리 칸
});
test('열 삽입: 값 열 오른쪽은 머리 칸(빈 th)과 빈 값 칸, 새 머리 칸이 포커스 대상', function () {
  const r = board.rcInsertCol(stAB(), 0, 2, 'right');
  const t = r.st.tables[0];
  assert.strictEqual(board.gridWidth(t.rows), 4);
  assert.deepStrictEqual(t.colIds, [21, 22, 23, null]);
  assert.deepStrictEqual([t.rows[0][3].header, t.rows[0][3].input, t.rows[0][3].fresh], [true, false, true]);
  assert.deepStrictEqual([t.rows[1][3].header, t.rows[1][3].input], [false, true]);
  assert.strictEqual(r.key, t.rows[0][3].key);
});
test('열 삭제: 걸친 병합은 colspan-1, 그 열의 칸은 사라지고 연결 칸 수를 센다', function () {
  const st = stAB();
  const r0 = board.rcDeleteCol(st, 1, 0);   // 표 B 구분의 앞 열
  const t = r0.st.tables[1];
  assert.ok(!('colspan' in t.rows[0][0]));
  assert.deepStrictEqual(rowKeys(t, 1), ['l2', 'mm']);
  assert.deepStrictEqual(t.colIds, [42, 43]);
  assert.strictEqual(r0.lost, 0);
  assert.ok(!('l1' in t.cells));
  // 표 A 금액 열: 연결 칸 2개(m1·m3)가 함께 사라진다
  assert.strictEqual(board.rcRules(st, 0, 'col', 2).del.lost, 2);
  const r2 = board.rcDeleteCol(st, 0, 2);
  assert.strictEqual(r2.lost, 2);
  assert.deepStrictEqual(rowKeys(r2.st.tables[0], 1), ['a0', 'b1']);
  // 병합 칸이 시작하는 열(기관명)을 지우면 병합 칸 자체가 사라진다(세로 병합 칸은 1열짜리)
  const r1 = board.rcDeleteCol(st, 0, 0);
  assert.deepStrictEqual(rowKeys(r1.st.tables[0], 1), ['b1', 'm1']);
});

// ── 보호 규칙 ──
test('보호: 머리 행은 삭제·위 삽입 불가(아래 삽입은 가능), 이유 문구', function () {
  const st = stAB();
  const rule = board.rcRules(st, 0, 'row', 0);
  assert.deepStrictEqual([rule.del.ok, rule.del.why], [false, '머리 행은 삭제할 수 없습니다.']);
  assert.deepStrictEqual([rule.before.ok, rule.before.why], [false, '머리 행 위에는 행을 넣을 수 없습니다.']);
  assert.strictEqual(rule.after.ok, true);
  const r = board.rcDeleteRow(st, 0, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.st, st);   // 같은 상태
  assert.strictEqual(board.rcInsertRow(st, 0, 0, 'above').st, st);
});
test('보호: 본문 행이 1개면 행 삭제 불가, 열이 1개면 열 삭제 불가, 이름 열이 1개뿐이면 그 열 삭제 불가', function () {
  const t = stOne(tableT());
  assert.strictEqual(board.rcRules(t, 0, 'row', 1).del.why, '행이 하나뿐이면 삭제할 수 없습니다.');
  assert.strictEqual(board.rcRules(t, 0, 'col', 0).del.why, '행 이름 열이 하나뿐이면 삭제할 수 없습니다.');
  assert.deepStrictEqual([board.rcRules(t, 0, 'col', 1).del.ok, board.rcRules(t, 0, 'col', 1).del.lost], [true, 1]);   // 값 열은 지울 수 있다
  const w = stOne(tableW());
  assert.strictEqual(board.rcRules(w, 0, 'col', 0).del.why, '열이 하나뿐이면 삭제할 수 없습니다.');
  const r = board.rcDeleteCol(w, 0, 0);
  assert.deepStrictEqual([r.ok, r.st === w], [false, true]);
  // 이름 열이 둘이면(표 B) 하나는 지울 수 있다
  assert.strictEqual(board.rcRules(stAB(), 1, 'col', 0).del.ok, true);
});

// ── 상한 ──
test('상한: 기본 한도 40행·12열·칸 300·양식 800, 서버 limits가 있으면 그 값을 쓴다', function () {
  assert.deepStrictEqual(board.limitsOf(stAB()), { max_rows: 40, max_cols: 12, max_cell_chars: 100, max_form_cells: 800, max_table_cells: 300 });
  assert.strictEqual(board.limitsOf(stAB({ max_rows: 5 })).max_rows, 5);
  assert.strictEqual(board.limitsOf(stAB({ max_rows: 5 })).max_cols, 12);
});
test('상한: 행·열 수 한도에 닿으면 삽입 항목만 꺼지고 이유가 나온다(삭제는 그대로)', function () {
  const st = stAB({ max_rows: 5, max_cols: 3 });
  const row = board.rcRules(st, 0, 'row', 2);
  assert.deepStrictEqual([row.before.ok, row.before.why], [false, '표 하나에 행은 최대 5개까지 넣을 수 있습니다.']);
  assert.strictEqual(row.after.ok, false);
  assert.strictEqual(row.del.ok, true);
  assert.strictEqual(board.rcRules(st, 1, 'row', 1).before.ok, true);   // 표 B는 3행
  const col = board.rcRules(st, 0, 'col', 1);
  assert.deepStrictEqual([col.before.ok, col.before.why], [false, '표 하나에 열은 최대 3개까지 넣을 수 있습니다.']);
  assert.strictEqual(col.del.ok, true);
  assert.strictEqual(board.rcInsertRow(st, 0, 2, 'above').ok, false);
});
test('상한: 칸 수 한도(표·양식)는 넣을 칸 수로 가른다 — 병합 안쪽 삽입(2칸)은 되고 경계(3칸)는 안 된다', function () {
  const tbl = stAB({ max_table_cells: 14 });   // 표 A는 12칸
  assert.strictEqual(board.rcRules(tbl, 0, 'row', 2).before.ok, true);
  const r = board.rcRules(tbl, 0, 'row', 1).before;
  assert.deepStrictEqual([r.ok, r.why], [false, '표 하나에 칸은 최대 14개까지 넣을 수 있습니다.']);
  const frm = stAB({ max_form_cells: 22 });    // 표 A 12 + 표 B 8 = 20칸
  assert.strictEqual(board.rcRules(frm, 0, 'row', 2).before.ok, true);
  const f = board.rcRules(frm, 0, 'row', 1).before;
  assert.deepStrictEqual([f.ok, f.why], [false, '양식 전체에 칸은 최대 22개까지 넣을 수 있습니다.']);
});
test('상한: 메뉴 HTML은 꺼진 항목을 disabled가 아니라 aria-disabled와 이유 한 줄로 그린다', function () {
  const st = stAB({ max_rows: 5 });
  const h = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'row', idx: 2 } });
  assert.ok(/data-op="ins-before" aria-disabled="true"><span>위에 행 삽입<\/span><span class="bd-rc-why">표 하나에 행은 최대 5개까지 넣을 수 있습니다\.<\/span>/.test(h));
  assert.ok(/data-op="del"><span>행 삭제<\/span><\/button>/.test(h));
  assert.ok(!/class="bd-rc-item"[^>]*\sdisabled/.test(h));
});

// ── 되돌리기 ──
test('되돌리기: 삽입·삭제 왕복이 원래 구성과 같고, 글자 입력은 되돌리지 않는다', function () {
  const st = stAB();
  const t0 = st.tables[0];
  // 삽입
  const ins = board.rcInsertRow(st, 0, 2, 'above');
  let stack = board.rcPush([], t0, { kind: 'row-ins-before', label: "'세금' 위에 행 삽입", name: '세금' });
  const typed = board.editSetCell(ins.st, 0, ins.key, '신규');
  const u = board.rcUndo(typed, stack);
  assert.deepStrictEqual(u.st.tables[0].rows, t0.rows);
  assert.deepStrictEqual(u.st.tables[0].rowIds, t0.rowIds);
  assert.deepStrictEqual(u.st.tables[0].cells, t0.cells);   // 새 칸의 글자 키는 사라진다
  assert.strictEqual(board.changeCount(u.st), 0);
  assert.strictEqual(u.stack.length, 0);
  assert.strictEqual(u.entry.label, "'세금' 위에 행 삽입");
  // 삭제 후 글자 입력 → 되돌리면 구성은 복원, 입력한 글자는 유지
  const del = board.rcDeleteRow(st, 0, 1);
  stack = board.rcPush([], t0, { kind: 'row-del', label: "'예비비' 행 삭제", name: '예비비' });
  const edited = board.editSetCell(del.st, 0, 'b2', '세금 수정');
  const back = board.rcUndo(edited, stack);
  assert.deepStrictEqual(back.st.tables[0].rows, t0.rows);
  assert.strictEqual(back.st.tables[0].cells.b1, '예비비');        // 지워진 칸의 글자가 돌아온다
  assert.strictEqual(back.st.tables[0].cells.b2, '세금 수정');     // 되돌리기 뒤에도 입력한 글자
  assert.strictEqual(back.st.tables[0].locked, 2);
});
test('되돌리기: 여러 단계(후입선출), 비면 null, 이미 빠진 표의 항목은 건너뛴다, 50단계까지만 쌓는다', function () {
  let st = stAB();
  let stack = [];
  const a = board.rcInsertRow(st, 0, 2, 'above');
  stack = board.rcPush(stack, st.tables[0], { label: '첫째' });
  st = a.st;
  const b = board.rcInsertCol(st, 0, 2, 'right');
  stack = board.rcPush(stack, st.tables[0], { label: '둘째' });
  st = b.st;
  assert.strictEqual(board.gridWidth(st.tables[0].rows), 4);
  let u = board.rcUndo(st, stack);
  assert.strictEqual(u.entry.label, '둘째');
  assert.strictEqual(board.gridWidth(u.st.tables[0].rows), 3);
  assert.strictEqual(u.st.tables[0].rows.length, 6);
  u = board.rcUndo(u.st, u.stack);
  assert.strictEqual(u.entry.label, '첫째');
  assert.strictEqual(u.st.tables[0].rows.length, 5);
  assert.strictEqual(board.rcUndo(u.st, u.stack), null);
  assert.strictEqual(board.rcUndo(st, []), null);
  // 표 B 조작 뒤 표 B를 뺀 상태 → 그 항목은 건너뛰고 더 아래 항목을 되돌린다
  const s0 = stAB();
  const sk = board.rcPush(board.rcPush([], s0.tables[0], { label: '표 A 조작' }), s0.tables[1], { label: '표 B 조작' });
  const removed = board.editRemove(s0, 1);
  const skipped = board.rcUndo(removed, sk);
  assert.strictEqual(skipped.entry.label, '표 A 조작');
  let many = [];
  for (let i = 0; i < 55; i++) many = board.rcPush(many, s0.tables[0], { label: 'n' + i });
  assert.strictEqual(many.length, 50);
  assert.strictEqual(many[49].label, 'n54');
});
test('되돌리기 단추: 스택이 있을 때만 켜지고 aria-label에 마지막 동작이 든다', function () {
  const st = stAB();
  assert.ok(/id="bd-undo" class="bd-undo" data-act="rc-undo" disabled aria-label="되돌리기">되돌리기<\/button>/.test(board.editBarHtml(st, {})));
  const stack = board.rcPush([], st.tables[0], { label: "'세금' 위에 행 삽입" });
  const h = board.editBarHtml(st, { undo: stack });
  assert.ok(/id="bd-undo" class="bd-undo" data-act="rc-undo" aria-label="되돌리기: &#39;세금&#39; 위에 행 삽입">되돌리기<\/button>/.test(h));
  assert.ok(/id="bd-undo"[^>]*\sdisabled/.test(board.editBarHtml(st, { undo: stack, saving: true })));
  assert.ok(h.includes('id="bd-rowcol-msg" class="bd-rowcol-msg" aria-live="polite"></span>'));
});

// ── 변경 건수·배지·검증 ──
test('변경 건수는 표마다 1건, 행·열만 바뀌면 배지 행·열 바뀜, 넣었다 지우면 0건', function () {
  let st = stAB();
  st = board.rcInsertRow(st, 0, 2, 'above').st;
  st = board.rcInsertCol(st, 0, 2, 'right').st;
  assert.strictEqual(board.changeCount(st), 1);
  assert.deepStrictEqual(board.badgesFor(st, 0), ['행·열 바뀜']);
  assert.deepStrictEqual(board.badgesFor(st, 1), []);
  st = board.editSetTitle(st, 0, '새 제목');
  assert.strictEqual(board.changeCount(st), 1);
  assert.deepStrictEqual(board.badgesFor(st, 0), ['변경됨', '행·열 바뀜']);
  st = board.editSetCell(st, 1, 'l1', '바뀜');
  assert.strictEqual(board.changeCount(st), 2);
  // 맨 아래에 행을 넣고 그 행을 지우면 처음과 같다
  const base = stAB();
  const added = board.rcInsertRow(base, 0, 4, 'below');
  assert.strictEqual(board.changeCount(added.st), 1);
  const gone = board.rcDeleteRow(added.st, 0, 5);
  assert.strictEqual(gone.ok, true);
  assert.strictEqual(board.changeCount(gone.st), 0);
  assert.deepStrictEqual(board.badgesFor(gone.st, 0), []);
});
test('validateEditAt: 이름이 빈 새 행·열은 오류와 고치러 가기 대상(그 칸)을 준다', function () {
  const base = stAB();
  const r = board.rcInsertRow(base, 0, 2, 'above');
  let bad = board.validateEditAt(r.st);
  assert.deepStrictEqual(bad, { msg: '1번째 표에 이름이 빈 행이 있습니다.', target: 'cell:0:' + r.key });
  assert.deepStrictEqual(board.errTargetParts(bad.target), { kind: 'cell', i: 0, key: r.key });
  assert.strictEqual(board.validateEditAt(board.editSetCell(r.st, 0, r.key, '신규')), null);
  assert.strictEqual(board.validateEdit(board.editSetCell(r.st, 0, r.key, '  ')), '1번째 표에 이름이 빈 행이 있습니다.');
  // 열: 머리 칸이 비면 오류(두 번째 표)
  const c = board.rcInsertCol(base, 0, 2, 'right');
  bad = board.validateEditAt(c.st);
  assert.deepStrictEqual(bad, { msg: '1번째 표에 이름이 빈 열이 있습니다.', target: 'cell:0:' + c.key });
  assert.strictEqual(board.validateEditAt(board.editSetCell(c.st, 0, c.key, '비고')), null);
  // 병합 머리 안쪽에 넣은 열은 머리가 이미 이름을 가지므로 오류가 아니다
  assert.strictEqual(board.validateEditAt(board.rcInsertCol(base, 1, 0, 'right').st), null);
  // 두 번째 표의 빈 행 → 순번 문구
  const b = board.rcInsertRow(base, 1, 1, 'below');
  assert.strictEqual(board.validateEditAt(b.st).msg, '2번째 표에 이름이 빈 행이 있습니다.');
  // 기존 행은 이름이 비어 있어도 오류가 아니다(새로 넣은 것만 본다)
  assert.strictEqual(board.validateEditAt(board.editSetCell(base, 0, 'b1', '')), null);
});

// ── PUT 본문 ──
test('putBody: 구조가 안 바뀐 표는 cells 맵만, 바뀐 표만 cols+rows(임시 열 id n1·n2, 새 행 id null)', function () {
  let st = stAB();
  const ins = board.rcInsertRow(st, 0, 2, 'above');
  st = board.editSetCell(ins.st, 0, ins.key, '신규');
  st = board.rcInsertCol(st, 0, 2, 'right').st;   // 열 id [21,22,23,null]
  st = board.rcInsertCol(st, 0, 0, 'left').st;    // 열 id [null,21,22,23,null]
  const b = board.putBody(st);
  assert.strictEqual(b.base_version, 3);
  const A = b.tables[0], B = b.tables[1];
  assert.ok(!('cells' in A));
  assert.deepStrictEqual(A.cols.map(function (c) { return c.id; }), ['n1', 21, 22, 23, 'n2']);
  assert.deepStrictEqual(A.rows.map(function (r) { return r.id; }), [11, 12, null, 13, 14, 15]);
  assert.ok(!('rows' in B) && !('cols' in B));
  assert.deepStrictEqual(B.cells, { g: '구분', y: '금액', l1: '비용', l2: '인건비', l3: '비용', l4: '운영', vv: '6' });
  assert.deepStrictEqual(B.notes, ['주석']);
  assert.strictEqual(b.confirm_unmapped, undefined);
  // 새 행: 열 순서대로 앵커 칸만(병합 칸이 덮은 열은 보내지 않는다)
  const newRow = A.rows[2].cells;
  assert.deepStrictEqual(newRow.map(function (c) { return c.col; }), ['n1', 22, 23, 'n2']);
  assert.deepStrictEqual(newRow[1], { col: 22, text: '신규', colspan: 1, rowspan: 1, header: false, input: false });
  assert.deepStrictEqual(newRow[2], { col: 23, text: '', colspan: 1, rowspan: 1, header: false, input: true });
});
test('putBody: 병합으로 가려진 칸은 보내지 않고, 엑셀 연결 칸 글자는 빈 문자열, 병합 폭·머리 여부를 보낸다', function () {
  const st = board.rcInsertRow(stAB(), 0, 2, 'above').st;
  const rows = board.putBody(st).tables[0].rows;
  // 0열을 덮는 기관명(a0)은 행 1에만 있다 — 행 2~5는 병합 아래라 22열부터
  assert.deepStrictEqual(rows[1].cells.map(function (c) { return c.col; }), [21, 22, 23]);
  assert.deepStrictEqual(rows[3].cells.map(function (c) { return c.col; }), [22, 23]);
  assert.deepStrictEqual(rows[1].cells[0], { col: 21, text: '은행', colspan: 1, rowspan: 5, header: false, input: false });
  assert.strictEqual(rows[1].cells[2].text, '');          // m1: 연결 칸
  assert.strictEqual(rows[1].cells[2].input, true);
  assert.deepStrictEqual(rows[0].cells[0], { col: 21, text: '기관명', colspan: 1, rowspan: 1, header: true, input: false });
  // 표 B: 구분 colspan 2 사이에 열을 넣으면 colspan 3과 새 열 id n1
  const b = board.putBody(board.rcInsertCol(stAB(), 1, 0, 'right').st).tables[1];
  assert.deepStrictEqual(b.cols.map(function (c) { return c.id; }), [41, 'n1', 42, 43]);
  assert.deepStrictEqual(b.rows[0].cells[0], { col: 41, text: '구분', colspan: 3, rowspan: 1, header: true, input: false });
  assert.deepStrictEqual(b.rows[0].cells.length, 2);
  assert.deepStrictEqual(b.rows[1].cells.map(function (c) { return c.col; }), [41, 'n1', 42, 43]);
  assert.strictEqual(b.rows[1].cells[3].text, '');         // mm: 연결 칸
  // 원본 상태를 바꾸지 않는다
  b.rows[1].cells[0].text = 'x';
  assert.strictEqual(st.tables[0].cells.a0, '은행');
});
test('putBody: 칸 글자는 trim, 임시 열 id는 서버 열 id와 겹치지 않는다', function () {
  const t = tableB(); t.col_ids = ['n1', 'n2', 'n3'];
  let st = stOne(t);
  st = board.rcInsertCol(st, 0, 0, 'right').st;
  st = board.editSetCell(st, 0, 'l2', '  인건비  ');
  const b = board.putBody(st).tables[0];
  assert.deepStrictEqual(b.cols.map(function (c) { return c.id; }), ['n1', 'n4', 'n2', 'n3']);
  assert.strictEqual(b.rows[1].cells[2].text, '인건비');
});
test('putBody: confirm_unmapped는 opts로만 붙는다', function () {
  const st = board.rcDeleteRow(stAB(), 0, 1).st;
  assert.strictEqual('confirm_unmapped' in board.putBody(st), false);
  assert.strictEqual(board.putBody(st, { confirmUnmapped: true }).confirm_unmapped, true);
  assert.strictEqual('confirm_unmapped' in board.putBody(st, {}), false);
});

// ── 연결 칸 확인(UNMAP_CONFIRM_REQUIRED) ──
test('saveForm: 첫 요청엔 confirm_unmapped가 없고, 400 UNMAP_CONFIRM_REQUIRED는 unmap 정보로 돌려준다', async function () {
  const st = board.rcDeleteRow(stAB(), 0, 1).st;
  const bodies = [];
  const f = function (u, i) {
    bodies.push(JSON.parse(i.body));
    if (bodies.length === 1) {
      return Promise.resolve(res(false, 400, { detail: { code: 'UNMAP_CONFIRM_REQUIRED', message: '연결 칸이 빠집니다.', count: 2, dropped: [{ ref: 'A', key: 'm1' }] } }));
    }
    return Promise.resolve(res(true, 200, { version: 4, dropped_mapped: 2 }));
  };
  const r1 = await board.saveForm(f, st);
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.conflict, false);
  assert.deepStrictEqual(r1.unmap, { count: 2, dropped: [{ ref: 'A', key: 'm1' }], message: '연결 칸이 빠집니다.' });
  assert.strictEqual('confirm_unmapped' in bodies[0], false);
  const r2 = await board.saveForm(f, st, { confirmUnmapped: true });
  assert.deepStrictEqual(r2, { ok: true, version: 4, changed: true, droppedMapped: 2 });
  assert.strictEqual(bodies[1].confirm_unmapped, true);
  assert.ok(board.savedText(r2).endsWith(' 엑셀 값이 들어가는 칸 2개가 빠졌습니다.'));
  assert.ok(!board.savedText({ ok: true, version: 4, changed: true }).includes('빠졌습니다'));
  // 다른 400(문자열 detail)은 일반 오류, 객체여도 코드가 다르면 일반 오류
  const g = await board.saveForm(function () { return Promise.resolve(res(false, 400, { detail: '이름이 겹칩니다' })); }, st);
  assert.deepStrictEqual([g.ok, g.error, g.unmap], [false, '이름이 겹칩니다', undefined]);
  const h = await board.saveForm(function () { return Promise.resolve(res(false, 400, { detail: { code: 'X', message: 'm' } })); }, st);
  assert.strictEqual(h.unmap, undefined);
});
test('연결 칸 확인 줄: 건수 문구, 버튼 [저장][돌아가기], 첫 포커스는 [돌아가기], 닫으면 저장 버튼으로', function () {
  const st = board.rcDeleteRow(stAB(), 0, 1).st;
  const c = { act: 'unmap', ref: '', text: board.unmapConfirmText(2) };
  assert.ok(c.text.includes('2개') && c.text.includes('문서에 들어가지 않습니다'));
  assert.deepStrictEqual(board.confirmButtons(c), { ok: '저장', no: '돌아가기', primary: false });
  assert.strictEqual(board.confirmFocus(c), '#bd-no-confirm');
  assert.strictEqual(board.confirmBack(st, c), '#bd-save');
  assert.deepStrictEqual(board.confirmPlan(st, c), { run: 'save-unmap' });
  assert.deepStrictEqual(board.confirmPlan(stAB(), c), { run: 'none', msg: board.NOTHING_TO_SAVE });
  assert.ok(board.editFootHtml(st, { confirm: c }).includes('class="bd-confirm"'));
  assert.strictEqual(board.confirmText(st, c), c.text);
});
test('loadCatalog: 서버 limits가 있으면 돌려주고, 없으면 키를 만들지 않는다', async function () {
  const lim = { max_rows: 40, max_cols: 12, max_cell_chars: 100, max_form_cells: 800 };
  const r = await board.loadCatalog(function () { return Promise.resolve(res(true, 200, { items: [], limits: lim })); });
  assert.deepStrictEqual(r, { ok: true, items: [], limits: lim });
  const n = await board.loadCatalog(function () { return Promise.resolve(res(true, 200, { items: [] })); });
  assert.deepStrictEqual(n, { ok: true, items: [] });
});

// ── 화면(HTML) ──
test('editTableHtml: 행마다 왼쪽 손잡이, 열마다 위 손잡이(펼친 격자 기준), 이름은 행·열 이름', function () {
  const st = stAB();
  const hA = board.editTableHtml(st.tables[0], { ti: 0 });
  assert.strictEqual((hA.match(/data-kind="col"/g) || []).length, 3);
  assert.strictEqual((hA.match(/data-kind="row"/g) || []).length, 5);
  assert.ok(hA.includes('class="bd-colbar"'));
  assert.ok(hA.includes('aria-label="머리 행 편집"'));
  assert.ok(hA.includes('aria-label="&#39;예비비&#39; 행 편집"'));
  assert.ok(hA.includes('aria-label="&#39;금액&#39; 열 편집"'));
  assert.ok(/aria-expanded="false" aria-controls="bd-rcmenu-0"/.test(hA));
  const hB = board.editTableHtml(st.tables[1], { ti: 1 });
  assert.strictEqual((hB.match(/data-kind="col"/g) || []).length, 3);   // 구분 colspan 2 → 손잡이 2개 + 금액
  assert.ok(hB.includes('aria-label="&#39;구분&#39; 1/2번째 열 편집"'));
  assert.ok(hB.includes('aria-label="&#39;구분&#39; 2/2번째 열 편집"'));
  assert.ok(hB.includes('aria-label="&#39;금액&#39; 열 편집"'));
  assert.ok(hB.includes('aria-label="&#39;인건비&#39; 행 편집"'));
  // 손잡이는 SVG 점 3개(문자 ⋯ 금지), 메뉴 role 금지
  assert.ok(hA.includes('<svg class="bd-dots"') && !hA.includes('⋯') && !hA.includes('role="menu"'));
  // 이름이 빈 행은 순번으로
  const t = board.rcInsertRow(st, 0, 2, 'above').st.tables[0];
  assert.strictEqual(board.rcHandleLabel(t, 'row', 2), '3번째 행 편집');
  // ti가 없으면(예전 호출) 손잡이를 그리지 않는다
  assert.ok(!board.editTableHtml(st.tables[0]).includes('bd-handle'));
});
test('editCardHtml: 메뉴가 열리면 손잡이 aria-expanded=true + 카드 안 role=group 패널(3항목), 대상 손잡이 표시', function () {
  const st = stAB();
  const h = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'row', idx: 1 } });
  assert.strictEqual((h.match(/aria-expanded="true"/g) || []).length, 1);
  assert.ok(/data-kind="row" data-idx="1" aria-label="&#39;예비비&#39; 행 편집" aria-expanded="true"/.test(h));
  assert.ok(/<div class="bd-rcmenu" id="bd-rcmenu-0" role="group" aria-label="&#39;예비비&#39; 행 편집">/.test(h));
  assert.deepStrictEqual((h.match(/data-act="rc-item" data-op="[a-z-]+"/g) || []).map(function (s) { return s.split('data-op=')[1]; }),
    ['"ins-before"', '"ins-after"', '"del"']);
  assert.ok(h.includes('<span>위에 행 삽입</span>') && h.includes('<span>아래에 행 삽입</span>') && h.includes('<span>행 삭제</span>'));
  const c = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'col', idx: 1 } });
  assert.ok(c.includes('<span>왼쪽에 열 삽입</span>') && c.includes('<span>오른쪽에 열 삽입</span>') && c.includes('<span>열 삭제</span>'));
  assert.ok(!board.editCardHtml(st, 0, {}).includes('class="bd-rcmenu"'));
  assert.ok(!board.editCardHtml(st, 1, { menu: { ti: 0, kind: 'row', idx: 1 } }).includes('class="bd-rcmenu"'));   // 다른 표 메뉴는 그리지 않는다
  // 머리 행 메뉴: 위 삽입·삭제만 꺼짐
  const hd = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'row', idx: 0 } });
  assert.ok(/data-op="ins-before" aria-disabled="true"><span>위에 행 삽입<\/span><span class="bd-rc-why">머리 행 위에는 행을 넣을 수 없습니다\.<\/span>/.test(hd));
  assert.ok(/data-op="ins-after"><span>아래에 행 삽입<\/span><\/button>/.test(hd));
  assert.ok(/data-op="del" aria-disabled="true"><span>행 삭제<\/span><span class="bd-rc-why">머리 행은 삭제할 수 없습니다\.<\/span>/.test(hd));
});
test('새 행·열: 머리 칸은 빈 입력(placeholder 행 이름/열 이름, 순번 aria-label), 값 칸은 sr-only 빈 칸', function () {
  const st = stAB();
  const r = board.rcInsertRow(st, 0, 2, 'above');
  const h = board.editTableHtml(r.st.tables[0], { ti: 0 });
  assert.ok(h.includes('data-key="' + r.key + '" maxlength="100" value="" aria-label="표 A · 3번째 행 이름" placeholder="행 이름"'));
  assert.ok(h.includes('<span class="bd-sr">빈 칸</span>'));
  const c = board.rcInsertCol(st, 0, 2, 'right');
  const hc = board.editTableHtml(c.st.tables[0], { ti: 0 });
  assert.ok(hc.includes('data-key="' + c.key + '" maxlength="100" value="" aria-label="표 A · 4번째 열 이름" placeholder="열 이름"'));
  // 입력하면 순번 이름이 아니라 보통의 경로 이름이 된다
  const typed = board.editSetCell(r.st, 0, r.key, '신규');
  assert.ok(!board.editTableHtml(typed.tables[0], { ti: 0 }).includes('3번째 행 이름'));
  assert.ok(board.cellLabels(typed.tables[0])[r.key].startsWith('표 A · '));
});
test('editCellHtml: 값 칸(input)은 고치지 않는 글자, 이름 칸·머리 칸은 입력, 연결 칸은 틸 칸(잠김 표시 없음)', function () {
  const vals = { v: '20', n: '이름', hh: '머리' };
  const val = board.editCellHtml({ key: 'v', text: '20', input: true }, vals, 'x');
  assert.strictEqual(val, '<td class="bd-a-right bd-num">20</td>');
  assert.ok(board.editCellHtml({ key: 'n', text: '이름' }, vals, 'x').includes('<input type="text" class="bd-cell-in" data-key="n"'));
  assert.ok(board.editCellHtml({ key: 'hh', text: '머리', header: true }, vals, 'x').startsWith('<th'));
  assert.ok(board.editCellHtml({ key: 'hh', text: '머리', header: true }, vals, 'x').includes('<input'));
  const m = board.editCellHtml({ key: 'm', text: '9', mapped: true, input: true }, vals, 'x');
  assert.ok(m.includes('bd-mapped') && m.includes('title="작성할 때 엑셀 값이 들어가는 칸"') && !m.includes('<input') && !m.includes('잠김'));
  assert.ok(board.editCellHtml({ key: 'e', text: '', input: true, fresh: true }, { e: '' }, 'x').includes('<span class="bd-sr">빈 칸</span>'));
  // 기존의 글자 없는 이름 칸은 예전처럼 입력으로 열지 않는다
  assert.ok(!board.editCellHtml({ key: 'z', text: '' }, { z: '' }, 'x').includes('<input'));
});
test('삭제 확인 줄(연결 칸이 있는 행·열): 카드 안, 문구·버튼·삭제 대기 칸·포커스 복귀', function () {
  const st = stAB();
  const text = board.rcDeleteConfirmText('row', '예비비', 1, 1);
  assert.strictEqual(text, "'예비비' 행을 삭제할까요?\n이 행에는 작성할 때 엑셀에서 값이 채워지는 칸이 1개 있습니다. 삭제하면 작성할 때 이 값들이 문서에 들어가지 않습니다.\n저장하기 전에는 실제 양식이 바뀌지 않습니다.");
  assert.ok(board.rcDeleteConfirmText('col', '', 2, 2).startsWith('3번째 열을 삭제할까요?\n이 열에는'));
  const c = { act: 'delrow', ref: 'A', idx: 1, text: text };
  const h = board.editHtml(st, { confirm: c }, null);
  assert.strictEqual(h.split('class="bd-confirm"').length - 1, 1);
  const sec = h.slice(h.indexOf('<section class="bd-card bd-card-edit" data-i="0"'), h.indexOf('<section class="bd-card bd-card-edit" data-i="1"'));
  assert.ok(sec.includes('class="bd-confirm"') && sec.indexOf('class="bd-confirm"') < sec.indexOf('bd-table-wrap'));
  assert.ok(sec.includes('>행 삭제</button>') && sec.includes('>그대로 두기</button>'));
  assert.strictEqual((sec.match(/bd-pending-del/g) || []).length, 3);   // 1행의 세 칸(병합 칸 포함)
  assert.ok(sec.includes('<td class="bd-a-left bd-pending-del" rowspan="4" data-pos="1:0">'));
  assert.ok(!board.editFootHtml(st, { confirm: c }).includes('bd-confirm'));
  assert.strictEqual(board.confirmFocus(c), '#bd-no-confirm');
  assert.strictEqual(board.confirmFocus({ act: 'delcol' }), '#bd-no-confirm');
  assert.deepStrictEqual(board.confirmButtons({ act: 'delrow' }), { ok: '행 삭제', no: '그대로 두기', primary: false });
  assert.deepStrictEqual(board.confirmButtons({ act: 'delcol' }), { ok: '열 삭제', no: '그대로 두기', primary: false });
  assert.strictEqual(board.confirmBack(st, c), '.bd-handle[data-t="0"][data-kind="row"][data-idx="1"]');
  assert.strictEqual(board.confirmBack(st, { act: 'delcol', ref: 'B', idx: 2 }), '.bd-handle[data-t="1"][data-kind="col"][data-idx="2"]');
  assert.strictEqual(board.confirmBack(st, { act: 'delrow', ref: 'Z', idx: 1 }), '#bd-add');
  assert.deepStrictEqual(board.confirmPlan(st, c), { run: 'delrc' });
  // 열 삭제 대기: 그 열을 덮는 칸 전부
  const col = board.editCardHtml(st, 0, { confirm: { act: 'delcol', ref: 'A', idx: 2, text: 'x' } });
  assert.strictEqual((col.match(/bd-pending-del/g) || []).length, 5);   // 머리·4행의 금액 칸
});
test('알림 문구: 삽입·삭제·되돌림(이름이 없으면 N번째 행/열)', function () {
  assert.strictEqual(board.rcDoneText('row', 'ins-after', 3, '예비비'), "'예비비' 아래에 행을 삽입했습니다. 행 이름을 입력해 주세요.");
  assert.strictEqual(board.rcDoneText('row', 'ins-before', 2, ''), '3번째 행 위에 행을 삽입했습니다. 행 이름을 입력해 주세요.');
  assert.strictEqual(board.rcDoneText('col', 'ins-after', 1, '금액'), "'금액' 오른쪽에 열을 삽입했습니다. 열 이름을 입력해 주세요.");
  assert.strictEqual(board.rcDoneText('col', 'ins-before', 1, '금액'), "'금액' 왼쪽에 열을 삽입했습니다. 열 이름을 입력해 주세요.");
  assert.strictEqual(board.rcDoneText('row', 'del', 1, '예비비'), "'예비비' 행을 삭제했습니다.");
  assert.strictEqual(board.rcDoneText('col', 'del', 1, ''), '2번째 열을 삭제했습니다.');
  assert.strictEqual(board.rcUndoneText(board.rcLabel('row', 'del', 1, '예비비')), "'예비비' 행 삭제를 되돌렸습니다.");
  assert.strictEqual(board.rcUndoneText(board.rcLabel('row', 'ins-after', 3, '예비비')), "'예비비' 아래에 행 삽입을 되돌렸습니다.");
  assert.strictEqual(board.rcLabel('col', 'ins-before', 0, '기관명'), "'기관명' 왼쪽에 열 삽입");
});

// ── 보안·배선 ──
test('XSS: 이름 칸 글자가 손잡이·메뉴·알림 어디에서도 마크업이 되지 않는다', function () {
  const X = '"><img src=x onerror=alert(1)>';
  let st = board.editSetCell(stAB(), 0, 'b1', X);
  st = board.editSetCell(st, 0, 'h2', X);
  const h = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'row', idx: 1 }, confirm: { act: 'delrow', ref: 'A', idx: 1, text: board.rcDeleteConfirmText('row', X, 1, 1) } });
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  const hc = board.editCardHtml(st, 0, { menu: { ti: 0, kind: 'col', idx: 2 } });
  assert.ok(!hc.includes('<img'));
  assert.ok(!board.editBarHtml(st, { rcMsg: { text: board.rcDoneText('row', 'del', 1, X), undo: true }, undo: board.rcPush([], st.tables[0], { label: board.rcLabel('row', 'del', 1, X) }) }).includes('<img'));
  const m = board.rcMsgInner({ text: '<b>x</b>', undo: true });
  assert.ok(!m.includes('<b>') && m.includes('&lt;b&gt;') && m.includes('data-act="rc-undo"'));
  assert.strictEqual(board.rcMsgInner(null), '');
  assert.strictEqual(board.rcMsgInner({ text: '' }), '');
  // 검증 오류 줄(고치러 가기)도 이스케이프
  const bad = board.rcInsertRow(stAB(), 0, 2, 'above');
  const foot = board.editFootHtml(bad.st, { error: '1번째 표에 이름이 빈 행이 있습니다.', errorKind: 'local', errorTarget: 'cell:0:' + X });
  assert.ok(!foot.includes('<img'));
});
test('board.js 배선: 문구는 textContent·esc로만, 전역 Ctrl+Z 없음, Esc는 메뉴를 닫고 손잡이로 포커스, 첫 요청엔 confirm_unmapped 없음', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8').replace(/\r\n/g, '\n');
  function body(name) {
    const s = src.indexOf('function ' + name + '(');
    assert.ok(s >= 0, name + ' 없음');
    return src.slice(s, src.indexOf('\n  }\n', s));
  }
  assert.ok(!/ctrlKey|metaKey/.test(src), '전역 단축키 없음');
  assert.ok(body('onBodyKey').includes('editUi.menu') && body('onBodyKey').includes('closeMenu(true)'));
  assert.ok(body('rcSay').includes('board.rcMsgInner(editUi.rcMsg)') && !body('rcSay').includes('.innerHTML = text'));
  assert.ok(body('doSave').includes('board.saveForm(doFetch, snap, opts)') && body('doSave').includes('res.unmap'));
  assert.ok(body('runConfirm').includes("doSave({ confirmUnmapped: true })"));
  // 첫 저장 요청 경로(onSave·확인 [저장])는 옵션 없이 doSave()를 부른다
  assert.ok(body('runConfirm').includes('doSave(); return;'));
  assert.ok(body('onBodyClick').includes("act === 'rc-handle'") && body('onBodyClick').includes("act === 'rc-undo'"));
  assert.ok(body('openMenu').includes('board.rcMenuHtml(ed(), ti, editUi.menu)'));
  assert.ok(body('closeMenu').includes('removeChild') && !body('closeMenu').includes('renderEdit('), '메뉴는 다시 그리지 않고 떼어 낸다');
  assert.ok(src.includes("addEventListener('scroll', onBodyScroll, true)") && src.includes("addEventListener('resize', onWinResize)"));
  assert.ok(!src.includes('bd-lock') && !src.includes('aria-readonly'));
  // 저장하면 스택이 비워진다: 저장 성공 → openForm → freshUi(undo: [])
  assert.ok(body('freshUi').includes('undo: []'));
  assert.ok(body('applyRc').includes('board.rcPush(editUi.undo, t,'));
});
test('index.html: 새 CSS는 기존 변수만 쓰고, 잠김 배지 규칙은 없다', function () {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('.bd-lock'));
  const s = html.indexOf('.bd-edit-guide {');
  const e = html.indexOf('.bd-added-note');
  assert.ok(s > 0 && e > s);
  const block = html.slice(s, e);
  const vars = (block.match(/var\(--[a-z0-9-]+\)/g) || []).concat(block.match(/var\(--[a-z0-9-]+/g) || []);
  vars.forEach(function (v) {
    assert.ok(/var\(--(panel2?|line|line-strong|muted|fg|red|accent-color)\)?$/.test(v), '새 CSS 변수 금지: ' + v);
  });
  assert.ok(block.includes('.bd-edit-guide') && block.includes('.bd-handle') && block.includes('.bd-rcmenu') && block.includes('.bd-swatch'));
});
