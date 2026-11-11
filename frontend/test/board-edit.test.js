const test = require('node:test');
const assert = require('node:assert');
const board = require('../js/board.js');

function res(ok, status, body) {
  return { ok: ok, status: status,
    json: function () { return body === undefined ? Promise.reject(new Error('x')) : Promise.resolve(body); },
    blob: function () { return Promise.resolve({ size: 1 }); } };
}
// 서버 응답 모양(평평한 양식): form_id·name·version·editable·tables[]
function form() {
  return { form_id: 7, name: '우리 양식', version: 3, editable: true, tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '재산상 이익제공', columns: 4,
      rows: [[{ key: 'r0c0', text: '구분', header: true }, { key: 'r0c1', text: '금액(백만원)', header: true }],
             [{ key: 'r1c0', text: '대한민국 기관' }, { key: 'r1c1', text: '1,234.5', mapped: true }]],
      notes: ['단위: 백만원'] },
    { id: 'B', ref: 'B', mapping: 'B', title: 'B표', columns: 0,
      rows: [[{ key: 'r0c0', text: '제목칸' }]], notes: [] }] };
}
const CAT = { ref: 'C-2', mapping: 'C-2', title: 'C 표', columns: 7, row_count: 5, notes: [] };

// ── 편집 상태 모델 ──
test('editFromForm: 매핑 칸은 cells에서 빠지고 잠긴 칸 수·변경 0건', function () {
  const st = board.editFromForm(form());
  assert.strictEqual(st.tables.length, 2);
  assert.deepStrictEqual(st.tables[0].cells, { r0c0: '구분', r0c1: '금액(백만원)', r1c0: '대한민국 기관' });
  assert.strictEqual(st.tables[0].locked, 1);
  assert.strictEqual(st.tables[0].ref, 'A');
  assert.strictEqual(st.version, 3);
  assert.strictEqual(board.changeCount(st), 0);
});
test('editFromForm: ref가 없으면 id를 쓴다', function () {
  const f = form(); delete f.tables[0].ref;
  assert.strictEqual(board.editFromForm(f).tables[0].ref, 'A');
});
test('이름·제목·칸 수정은 건수에 반영되고, 되돌리면 0으로 돌아온다', function () {
  let st = board.editFromForm(form());
  st = board.editSetName(st, '새 이름');
  assert.strictEqual(board.changeCount(st), 1);
  st = board.editSetTitle(st, 0, '새 제목');
  assert.strictEqual(board.changeCount(st), 2);
  st = board.editSetCell(st, 0, 'r1c0', '바뀐 기관');
  assert.strictEqual(board.changeCount(st), 2);          // 같은 표는 1건
  assert.deepStrictEqual(board.badgesFor(st, 0), ['변경됨']);
  st = board.editSetName(st, '우리 양식');
  st = board.editSetTitle(st, 0, '재산상 이익제공');
  st = board.editSetCell(st, 0, 'r1c0', '대한민국 기관');
  assert.strictEqual(board.changeCount(st), 0);
});
test('editSetCell: 모르는 키·매핑 칸 키는 바꾸지 않는다', function () {
  const st = board.editFromForm(form());
  assert.strictEqual(board.editSetCell(st, 0, 'r1c1', '999'), st);
  assert.strictEqual(board.editSetCell(st, 0, 'zzz', 'x'), st);
  assert.strictEqual(board.editSetCell(st, 9, 'r0c0', 'x'), st);
});
test('editMove: 위/아래 이동, 순서 바뀜 뱃지, 되돌리면 0건, 범위 밖은 그대로', function () {
  let st = board.editFromForm(form());
  assert.strictEqual(board.editMove(st, 0, -1), st);
  assert.strictEqual(board.editMove(st, 1, 1), st);
  st = board.editMove(st, 0, 1);
  assert.deepStrictEqual(st.tables.map(function (t) { return t.ref; }), ['B', 'A']);
  assert.strictEqual(board.changeCount(st), 1);
  assert.deepStrictEqual(board.badgesFor(st, 0), ['순서 바뀜']);
  assert.deepStrictEqual(board.badgesFor(st, 1), ['순서 바뀜']);
  st = board.editMove(st, 1, -1);
  assert.strictEqual(board.changeCount(st), 0);
});
test('editRemove: 삭제는 1건, 마지막 1개는 삭제 불가, 남은 표는 순서 바뀜이 아니다', function () {
  let st = board.editFromForm(form());
  st = board.editRemove(st, 0);
  assert.strictEqual(st.tables.length, 1);
  assert.strictEqual(board.changeCount(st), 1);
  assert.deepStrictEqual(board.badgesFor(st, 0), []);
  assert.strictEqual(board.editRemove(st, 0), st);
});
test('editAdd: 맨 아래 추가·추가됨 뱃지·중복 금지·뺐던 표는 다시 추가 가능', function () {
  let st = board.editFromForm(form());
  st = board.editAdd(st, CAT);
  assert.strictEqual(st.tables.length, 3);
  assert.strictEqual(st.tables[2].ref, 'C-2');
  assert.strictEqual(st.tables[2].title, 'C 표');
  assert.strictEqual(st.tables[2].locked, 0);
  assert.deepStrictEqual(board.badgesFor(st, 2), ['추가됨']);
  assert.strictEqual(board.changeCount(st), 1);
  assert.strictEqual(board.editAdd(st, CAT), st);
  assert.strictEqual(board.editAdd(st, { ref: 'A' }), st);
  assert.strictEqual(board.editAdd(st, null), st);
  // 추가한 표를 위로 올려도 기존 표에 '순서 바뀜'은 붙지 않는다
  st = board.editMove(st, 2, -1);
  assert.deepStrictEqual(board.badgesFor(st, 0), []);
  assert.deepStrictEqual(board.badgesFor(st, 2), []);
  // 기존 표를 빼고 같은 표를 다시 고르면 허용(삭제 1 + 추가 1)
  let s2 = board.editRemove(board.editFromForm(form()), 1);
  s2 = board.editAdd(s2, { ref: 'B', title: 'B표' });
  assert.strictEqual(board.changeCount(s2), 2);
});
test('putBody: base_version·이름(trim)·표 순서·notes·cells(매핑 칸 제외), 새 표는 카탈로그 notes/빈 cells', function () {
  let st = board.editFromForm(form());
  st = board.editSetName(st, '  이름  ');
  st = board.editMove(st, 0, 1);
  st = board.editAdd(st, CAT);
  const b = board.putBody(st);
  assert.strictEqual(b.base_version, 3);
  assert.strictEqual(b.name, '이름');
  assert.deepStrictEqual(b.tables.map(function (t) { return t.ref; }), ['B', 'A', 'C-2']);
  assert.deepStrictEqual(b.tables[1].notes, ['단위: 백만원']);
  assert.strictEqual(b.tables[1].cells.r1c1, undefined);
  assert.deepStrictEqual(b.tables[2], { ref: 'C-2', title: 'C 표', notes: [], cells: {} });
});
test('putBody: 원본 상태와 notes 배열을 공유하지 않는다', function () {
  const st = board.editFromForm(form());
  const b = board.putBody(st);
  b.tables[0].notes.push('x'); b.tables[0].cells.r0c0 = 'y';
  assert.deepStrictEqual(st.tables[0].notes, ['단위: 백만원']);
  assert.strictEqual(st.tables[0].cells.r0c0, '구분');
});
test('putBody: 주석이 있는 카탈로그 표(C-4 류)를 추가해도 notes를 그대로 보낸다', function () {
  const C4 = { ref: 'C-4', mapping: 'C-4', title: 'Ⅳ', columns: 3, row_count: 4, notes: ['※ 주석'] };
  const st = board.editAdd(board.editFromForm(form()), C4);
  assert.deepStrictEqual(board.putBody(st).tables[2].notes, ['※ 주석']);
});

// ── 문구·검증 ──
test('removeConfirmText: 엑셀 값 칸이 있으면 N개 문구, 없으면 빠진다', function () {
  const st = board.editFromForm(form());
  assert.ok(board.removeConfirmText(st.tables[0]).includes('엑셀 값이 들어가는 칸 1개가 함께 빠집니다'));
  assert.ok(!board.removeConfirmText(st.tables[1]).includes('엑셀'));
});
test('saveConfirmText: 2문장, 결재 중인 건 상신 버전 유지 안내', function () {
  const t = board.saveConfirmText();
  assert.strictEqual((t.match(/\./g) || []).length, 2);
  assert.ok(t.includes('결재 중인 건') && t.includes('상신'));
});
test('dirtyText', function () {
  assert.strictEqual(board.dirtyText(0), '변경 없음');
  assert.strictEqual(board.dirtyText(3), '● 저장 안 한 변경 3건');
});
test('validateEdit: 빈 이름·긴 이름·긴 제목·제어문자·긴 칸 오류, 정상은 null, 줄바꿈 칸은 서버처럼 거부', function () {
  const base = board.editFromForm(form());
  assert.strictEqual(board.validateEdit(base), null);
  assert.ok(board.validateEdit(board.editSetName(base, '  ')));
  assert.ok(board.validateEdit(board.editSetName(base, 'a'.repeat(61))));
  assert.ok(board.validateEdit(board.editSetTitle(base, 0, '')));
  assert.ok(board.validateEdit(board.editSetTitle(base, 0, 'a'.repeat(101))));
  assert.ok(board.validateEdit(board.editSetTitle(base, 0, 'a\u0001b')));
  assert.ok(board.validateEdit(board.editSetCell(base, 0, 'r0c0', 'a'.repeat(101))));
  assert.ok(board.validateEdit(board.editSetCell(base, 0, 'r0c1', '두 줄\n입니다')));
  assert.ok(board.validateEdit(board.editSetCell(base, 0, 'r1c0', 'a' + String.fromCharCode(0x2028) + 'b')));
  assert.strictEqual(board.validateEdit(board.editSetCell(base, 0, 'r1c0', '가나 다')), null);
});

// ── 편집 화면 HTML ──
test('editHtml: 제목·이름 값은 이스케이프된다(속성 탈출 불가)', function () {
  const X = '"><img src=x onerror=alert(1)>';
  let st = board.editFromForm(form());
  st = board.editSetTitle(board.editSetName(st, X), 0, X);
  st = board.editSetCell(st, 0, 'r1c0', X);
  const h = board.editHtml(st, {}, null);
  assert.ok(!h.includes('<img'));
  assert.ok(h.includes('&lt;img'));
});
test('editHtml: 매핑 칸은 입력 없이 틸 칸(잠김 표시·tabindex·aria-readonly 없음), 일반 칸은 한 줄 입력, 안내 문구 한 번', function () {
  const h = board.editHtml(board.editFromForm(form()), {}, null);
  assert.ok(!h.includes('bd-lock') && !h.includes('잠김'));
  assert.ok(!h.includes('aria-readonly') && !h.includes('tabindex="0"'));
  assert.ok(/<td class="bd-a-right bd-num bd-mapped" data-pos="1:1" title="작성할 때 엑셀 값이 들어가는 칸">1,234\.5<\/td>/.test(h));
  assert.ok(h.includes('<input type="text" class="bd-cell-in" data-key="r1c0"'));
  assert.ok(!h.includes('data-key="r1c1"'));
  assert.ok(!/<textarea/.test(h));
  assert.ok(h.includes('표 안의 숫자는 예시입니다. 실제 값은 이사회 자료 목록에서 자료를 열고 엑셀을 올리면 채워집니다.'));
  assert.ok(h.includes('여기서는 표 제목, 행·열 이름, 행과 열의 구성을 고칠 수 있습니다.') && h.includes('틸 배경과 왼쪽 막대가 있는 칸은 작성할 때 엑셀 값이 들어가는 자리입니다.'));
  assert.strictEqual(h.split('id="bd-edit-guide"').length - 1, 1);   // 화면에 한 번만
  assert.ok(h.indexOf('id="bd-edit-guide"') > h.indexOf('id="bd-editbar"') && h.indexOf('id="bd-edit-guide"') < h.indexOf('id="bd-name"'));
  assert.ok(!h.includes('개발자만 연결을 바꿀 수 있습니다'));
  assert.ok(h.includes('양식 편집 중 · v3 기준'));
  assert.ok(h.includes('<li>단위: 백만원</li>'));           // 주석은 읽기 전용 글자
  assert.ok(!/<input[^>]*bd-note/.test(h));
});
test('editHtml: 위/아래/삭제 비활성 경계, 마지막 1개는 삭제 불가', function () {
  let st = board.editFromForm(form());
  let h = board.editHtml(st, {}, null);
  assert.ok(/data-act="up" data-i="0" disabled/.test(h));
  assert.ok(!/data-act="up" data-i="1" disabled/.test(h));
  assert.ok(/data-act="down" data-i="1" disabled/.test(h));
  assert.ok(!/data-act="del"[^>]*disabled/.test(h));
  h = board.editHtml(board.editRemove(st, 0), {}, null);
  assert.ok(/data-act="del" data-i="0" disabled/.test(h));
});
test('editHtml: 저장 버튼은 변경 없으면 비활성, 변경되면 활성, 저장 중에는 비활성+fieldset 잠금', function () {
  let st = board.editFromForm(form());
  assert.ok(/id="bd-save" data-act="save" disabled/.test(board.editHtml(st, {}, null)));
  st = board.editSetTitle(st, 0, '다른 제목');
  let h = board.editHtml(st, {}, null);
  assert.ok(/id="bd-save" data-act="save">새 버전으로 저장/.test(h));
  assert.ok(h.includes('● 저장 안 한 변경 1건') && h.includes('<span class="bd-badge">변경됨</span>'));
  h = board.editHtml(st, { saving: true }, null);
  assert.ok(/id="bd-save" data-act="save" disabled>저장하는 중…/.test(h));
  assert.ok(h.includes('<fieldset class="bd-fs" disabled>'));
});
test('편집 줄: [새 버전으로 저장]·[편집 끝내기]가 있고 상태가 맨 아래 버튼과 같다, id 중복 없음', function () {
  let st = board.editFromForm(form());
  const bar0 = board.editBarHtml(st, {});
  assert.ok(/id="bd-save-top" data-act="save" disabled>새 버전으로 저장<\/button>/.test(bar0), '변경 0건이면 저장 비활성');
  assert.ok(/id="bd-cancel-top" data-act="cancel">편집 끝내기<\/button>/.test(bar0));
  st = board.editSetTitle(st, 0, '다른 제목');
  assert.ok(/id="bd-save-top" data-act="save">새 버전으로 저장/.test(board.editBarHtml(st, {})));
  const sv = board.editBarHtml(st, { saving: true });
  assert.ok(/id="bd-save-top"[^>]*\sdisabled/.test(sv) && /id="bd-cancel-top"[^>]*\sdisabled/.test(sv), '저장 중 둘 다 비활성');
  assert.ok(!board.editBarHtml(st, { conflict: true }).includes('bd-save-top'), '충돌 시 맨 아래처럼 두지 않는다');
  const all = board.editHtml(st, {}, null);
  const ids = (all.match(/ id="[^"]+"/g) || []);
  assert.strictEqual(ids.length, new Set(ids).size, 'id 중복 없음');
});
test('confirmBack: 편집 줄에서 연 확인은 편집 줄 버튼으로, 아래에서 연 확인은 아래 버튼으로', function () {
  const st = board.editFromForm(form());
  assert.strictEqual(board.confirmBack(st, { act: 'save', from: 'top' }), '#bd-save-top');
  assert.strictEqual(board.confirmBack(st, { act: 'cancel', from: 'top' }), '#bd-cancel-top');
  assert.strictEqual(board.confirmBack(st, { act: 'save', from: '' }), '#bd-save');
  assert.strictEqual(board.confirmBack(st, { act: 'cancel' }), '#bd-cancel');
});
test('board.js 배선: 편집 줄 버튼은 같은 onSave·onCancel 을 부르고 출처(from)를 넘기며 refreshStatus 가 동기화한다', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes("onSave(b.id === 'bd-save-top' ? 'top' : '')"));
  assert.ok(src.includes("onCancel(b.id === 'bd-cancel-top' ? 'top' : '')"));
  const s = src.indexOf('function refreshStatus(');
  assert.ok(src.slice(s, src.indexOf('\n  }\n', s)).includes("el('bd-save-top')"));
});
test('editFootHtml: 오류는 role=alert로 이스케이프, 409는 최신 내용 보기만', function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, 'x');
  let h = board.editFootHtml(st, { error: '<b>실패</b>' });
  assert.ok(h.includes('role="alert"') && h.includes('&lt;b&gt;') && !h.includes('<b>'));
  assert.ok(h.includes('id="bd-save"'));                  // 실패해도 저장 버튼 유지(입력 유지)
  h = board.editFootHtml(st, { conflict: true, error: '다른 사람이 먼저 저장했습니다.' });
  assert.ok(h.includes('최신 내용 보기') && !h.includes('id="bd-save"') && !h.includes('id="bd-add"'));
  assert.ok(h.includes('role="alert"'));
});
test('editFootHtml: 확인 대기면 인라인 확인 줄, 없으면 없다', function () {
  const st = board.editFromForm(form());
  const h = board.editFootHtml(st, { confirm: { act: 'cancel', ref: '', text: '저장하지 않은 변경 1건이 사라집니다.' } });
  assert.ok(h.includes('class="bd-confirm"') && h.includes('data-act="ok-confirm"') && h.includes('data-act="no-confirm"'));
  assert.ok(!board.editFootHtml(st, {}).includes('bd-confirm'));
});
test('catalogPanelHtml: 이미 있는 표는 선택 불가로 표시, 로딩·오류 상태', function () {
  const st = board.editFromForm(form());
  const h = board.catalogPanelHtml(st, { status: 'ready', items: [
    { ref: 'A', mapping: 'A', title: '재산상 이익제공' }, CAT] });
  assert.ok(/data-ref="A" disabled>재산상 이익제공 · 이미 있음/.test(h));
  assert.ok(/data-ref="C-2">C 표<\/button>/.test(h));
  assert.ok(h.includes('맨 아래에 붙습니다'));
  assert.ok(board.catalogPanelHtml(st, { status: 'loading' }).includes('불러오는 중'));
  assert.ok(board.catalogPanelHtml(st, { status: 'error', error: '<i>' }).includes('role="alert"'));
});
test('editHtml: 새로 추가한 표는 안내 문구를 보인다', function () {
  const st = board.editAdd(board.editFromForm(form()), CAT);
  const h = board.editHtml(st, {}, null);
  assert.ok(h.includes('저장하면 표 내용이 채워집니다'));
  assert.ok(h.includes('<span class="bd-badge">추가됨</span>'));
});
test('actionsHtml: 편집 가능=양식 편집 버튼, 불가+복제 가능=복제 버튼, 편집 모드=워드 비활성·편집 버튼 없음', function () {
  let h = board.actionsHtml({ mode: 'view', hasDoc: true, editable: true });
  assert.ok(h.includes('id="bd-edit"') && !h.includes('id="bd-docx" data-act="docx" disabled'));
  h = board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: false });
  assert.ok(!h.includes('bd-edit') && !h.includes('bd-copy'));
  h = board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: true });
  assert.ok(h.includes('id="bd-copy"') && h.includes('양식 복제하여 편집'));
  h = board.actionsHtml({ mode: 'view', hasDoc: true, canCopy: true, copy: { name: '"><x', error: '', busy: false } });
  assert.ok(h.includes('id="bd-copyname"') && !h.includes('"><x'));
  h = board.actionsHtml({ mode: 'edit', hasDoc: true, editable: true });
  assert.ok(/id="bd-docx" data-act="docx" disabled/.test(h) && !h.includes('bd-edit'));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: false }).includes('bd-edit'));
});
test('canCopy: 편집 가능한 양식이면 false, 목록 can_edit이 true일 때만 복제 가능', function () {
  assert.strictEqual(board.canCopy({ editable: true }, true), false);
  assert.strictEqual(board.canCopy({ editable: false }, false), false);
  assert.strictEqual(board.canCopy({ editable: false }, true), true);
  assert.strictEqual(board.canCopy(null, true), false);
});
test('formOptionsHtml: 숫자 id도 선택값과 맞고 이름은 이스케이프, 기본 양식 표시', function () {
  const o = board.formOptionsHtml([
    { form_id: 'default_doc', name: '기본 양식', is_default: true },
    { form_id: 7, name: '<b>우리</b>', current_version: 3 }], '7');
  assert.ok(o.includes('value="7" selected'));
  assert.ok(o.includes('&lt;b&gt;우리') && !o.includes('<b>'));
  assert.ok(o.includes('>기본 양식</option>') && !o.includes('(기본)') && o.includes('· v3'));
  assert.ok(!board.formOptionsHtml([{ form_id: 7, name: 'a' }], '').includes('selected'));
});
test('docHtml: 버전을 주면 v표시, 안 주면 기존 출력과 같다', function () {
  const doc = { name: 'n', tables: [{ title: 'T', rows: [] }] };
  assert.ok(board.docHtml(doc, 3).includes('<span class="bd-ver">v3</span>'));
  assert.ok(!board.docHtml(doc).includes('bd-ver'));
});

// ── 서버 호출 ──
test('URL 조립', function () {
  assert.strictEqual(board.formUrl(7), '/board-forms/7');
  assert.strictEqual(board.formUrl(7, 2), '/board-forms/7?version=2');
  assert.strictEqual(board.formDocxUrl(7), '/board-forms/7/docx');
  assert.strictEqual(board.copyUrl(), '/board-forms/copy');
  assert.strictEqual(board.catalogUrl(), '/board-forms/catalog');
  assert.strictEqual(board.docUrl(board.BASE_ID), '/board-docs/default_doc');
});
test('copyBody: 기본은 source, 서버 양식은 source_form_id, 이름은 trim', function () {
  assert.deepStrictEqual(board.copyBody('default_doc', ' 이름 '), { name: '이름', source: 'default_doc' });
  assert.deepStrictEqual(board.copyBody(7, 'x'), { name: 'x', source_form_id: 7 });
});
test('loadForms/loadCatalog: items·can_edit을 꺼내고 형식·HTTP·네트워크 오류는 ok:false', async function () {
  let r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [{ form_id: 7 }], can_edit: true })); });
  assert.deepStrictEqual(r, { ok: true, items: [{ form_id: 7 }], canEdit: true, canWrite: false });   // can_write 없는 구형 응답은 false
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [], can_edit: false, can_write: true })); });
  assert.deepStrictEqual([r.canEdit, r.canWrite], [false, true]);
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, {})); });
  assert.strictEqual(r.ok, false);
  r = await board.loadForms(function () { return Promise.resolve(res(false, 403, { detail: '권한이 없습니다' })); });
  assert.deepStrictEqual([r.ok, r.error], [false, '권한이 없습니다']);
  r = await board.loadForms(function () { return Promise.reject(new Error('down')); });
  assert.strictEqual(r.ok, false);
  r = await board.loadCatalog(function () { return Promise.resolve(res(true, 200, { items: [CAT] })); });
  assert.deepStrictEqual(r, { ok: true, items: [CAT] });
  r = await board.loadCatalog(function () { return Promise.resolve(res(true, 200, { tables: [CAT] })); });
  assert.strictEqual(r.ok, false);
});
test('loadForm: 서버 양식은 form 전체를, 없거나 tables가 빈 응답이면 오류', async function () {
  let url;
  let r = await board.loadForm(function (u) { url = u; return Promise.resolve(res(true, 200, form())); }, 7, 2);
  assert.strictEqual(url, '/board-forms/7?version=2');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.form.version, 3);
  r = await board.loadForm(function () { return Promise.resolve(res(true, 200, { form_id: 7 })); }, 7);
  assert.strictEqual(r.ok, false);
  r = await board.loadForm(function () { return Promise.resolve(res(false, 404, { detail: '없는 양식입니다' })); }, 7);
  assert.deepStrictEqual([r.ok, r.error], [false, '없는 양식입니다']);
});
test('loadView: 기본 양식은 /board-docs/default_doc를 form 모양으로, 서버 양식은 loadForm 경로', async function () {
  let url;
  const BASE = { id: 'default_doc', name: '기본', tables: [{ id: 'A', mapping: 'A', title: 't', rows: [] }] };
  let r = await board.loadView(function (u) { url = u; return Promise.resolve(res(true, 200, BASE)); }, 'default_doc');
  assert.strictEqual(url, '/board-docs/default_doc');
  assert.deepStrictEqual([r.ok, r.form.form_id, r.form.editable, r.form.tables.length], [true, 'default_doc', false, 1]);
  r = await board.loadView(function (u) { url = u; return Promise.resolve(res(true, 200, form())); }, 7, 2);
  assert.strictEqual(url, '/board-forms/7?version=2');
  assert.strictEqual(r.form.version, 3);
});
test('copyForm: 기본 양식은 source, 서버 양식은 source_form_id를 보내고 form_id를 돌려준다', async function () {
  let call;
  let r = await board.copyForm(function (u, i) { call = [u, i]; return Promise.resolve(res(true, 200, { form_id: 12 })); }, 'default_doc', '  내 양식  ');
  assert.strictEqual(call[0], '/board-forms/copy');
  assert.strictEqual(call[1].method, 'POST');
  assert.deepStrictEqual(JSON.parse(call[1].body), { name: '내 양식', source: 'default_doc' });
  assert.deepStrictEqual(r, { ok: true, formId: 12 });
  await board.copyForm(function (u, i) { call = [u, i]; return Promise.resolve(res(true, 200, { form_id: 13 })); }, 7, 'x');
  assert.deepStrictEqual(JSON.parse(call[1].body), { name: 'x', source_form_id: 7 });
  r = await board.copyForm(function () { return Promise.resolve(res(true, 200, {})); }, 'default_doc', 'x');
  assert.strictEqual(r.ok, false);
  r = await board.copyForm(function () { return Promise.resolve(res(false, 400, { detail: '이름이 겹칩니다' })); }, 'default_doc', 'x');
  assert.strictEqual(r.error, '이름이 겹칩니다');
});
test('copyForm: 숫자가 아닌 원본 id는 요청하지 않는다', async function () {
  let called = false;
  const r = await board.copyForm(function () { called = true; return Promise.resolve(res(true, 200, {})); }, 'abc', 'x');
  assert.deepStrictEqual([r.ok, called], [false, false]);
});
test('saveForm: PUT 본문=putBody, 성공은 새 version(객체·숫자 모두)', async function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, '새 제목');
  let call;
  let r = await board.saveForm(function (u, i) { call = [u, i]; return Promise.resolve(res(true, 200, { version: 4 })); }, st);
  assert.strictEqual(call[0], '/board-forms/7');
  assert.strictEqual(call[1].method, 'PUT');
  assert.strictEqual(call[1].headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(call[1].body), JSON.parse(JSON.stringify(board.putBody(st))));
  assert.deepStrictEqual(r, { ok: true, version: 4, changed: true });
  r = await board.saveForm(function () { return Promise.resolve(res(true, 200, 5)); }, st);
  assert.deepStrictEqual(r, { ok: true, version: 5, changed: true });
  r = await board.saveForm(function () { return Promise.resolve(res(true, 200, {})); }, st);
  assert.deepStrictEqual(r, { ok: true, version: null, changed: true });
});
test('saveForm: 409는 conflict:true+서버 문구, 400/403/500/비JSON/네트워크는 conflict 아님', async function () {
  const st = board.editFromForm(form());
  let r = await board.saveForm(function () { return Promise.resolve(res(false, 409, { detail: '다른 사람이 먼저 저장했습니다.' })); }, st);
  assert.deepStrictEqual([r.ok, r.conflict, r.error], [false, true, '다른 사람이 먼저 저장했습니다.']);
  r = await board.saveForm(function () { return Promise.resolve(res(false, 403, { detail: '양식을 편집할 권한이 없습니다.' })); }, st);
  assert.deepStrictEqual([r.conflict, r.error], [false, '양식을 편집할 권한이 없습니다.']);
  r = await board.saveForm(function () { return Promise.resolve(res(false, 500, undefined)); }, st);
  assert.ok(r.error.includes('500') && r.conflict === false);
  r = await board.saveForm(function () { return Promise.reject(new Error('down')); }, st);
  assert.deepStrictEqual([r.ok, r.conflict], [false, false]);
  assert.ok(r.error.includes('서버에 연결하지 못했습니다'));
});
test('fetchFormDocx: /board-forms/<id>/docx, 실패는 서버 문구', async function () {
  let url;
  let r = await board.fetchFormDocx(function (u) { url = u; return Promise.resolve(res(true, 200, undefined)); }, 7);
  assert.strictEqual(url, '/board-forms/7/docx');
  assert.strictEqual(r.ok, true);
  r = await board.fetchFormDocx(function () { return Promise.resolve(res(false, 404, { detail: '없는 양식입니다' })); }, 7);
  assert.deepStrictEqual(r, { ok: false, error: '없는 양식입니다' });
});
test('fetchAnyDocx: 기본은 /board-docs/default_doc/docx, 서버 양식은 /board-forms/<id>/docx', async function () {
  let url;
  await board.fetchAnyDocx(function (u) { url = u; return Promise.resolve(res(true, 200, undefined)); }, 'default_doc');
  assert.strictEqual(url, '/board-docs/default_doc/docx');
  await board.fetchAnyDocx(function (u) { url = u; return Promise.resolve(res(true, 200, undefined)); }, 7);
  assert.strictEqual(url, '/board-forms/7/docx');
});
test('board.js: 브라우저 확인창을 쓰지 않는다(인라인 확인 규칙)', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src));
});

// ── qa-verifier 조건부 통과 지적 반영 ──
// 특수 코드포인트는 원시 문자·이스케이프 텍스트로 쓰지 않고 fromCharCode로만 만든다.
const CH = String.fromCharCode;

test('validateEdit: 새로 추가한 표의 빈 제목은 오류, 원래 제목이 빈 기존 표도 서버처럼 오류', function () {
  let st = board.editAdd(board.editFromForm(form()), CAT);
  st = board.editSetTitle(st, 2, '   ');
  assert.strictEqual(board.validateEdit(st), '3번째 표의 제목을 입력해 주세요.');
  const f = form(); f.tables[1].title = '';
  assert.strictEqual(board.validateEdit(board.editFromForm(f)), '2번째 표의 제목을 입력해 주세요.');
});
test('validateEdit: 제어문자 경계 — 거부 대상과 허용 대상', function () {
  const base = board.editFromForm(form());
  [0x09, 0x7f, 0x85, 0x2028, 0x2029, 0xfffe, 0xffff].forEach(function (cp) {
    const bad = 'a' + CH(cp) + 'b';
    assert.strictEqual(board.validateEdit(board.editSetCell(base, 0, 'r1c0', bad)), '1번째 표의 칸에 쓸 수 없는 문자가 있습니다.', 'cell ' + cp.toString(16));
    assert.strictEqual(board.validateEdit(board.editSetName(base, bad)), '양식 이름에 쓸 수 없는 문자가 있습니다.', 'name ' + cp.toString(16));
  });
  [CH(0xa0), String.fromCodePoint(0x1f600)].forEach(function (ok) {
    assert.strictEqual(board.validateEdit(board.editSetCell(base, 0, 'r1c0', 'a' + ok + 'b')), null);
    assert.strictEqual(board.validateEdit(board.editSetName(base, 'a' + ok + 'b')), null);
  });
});
test('saveForm: 서버가 changed:false를 주면 그대로 돌려주고, savedText는 3가지 문구', async function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, '새 제목');
  const r = await board.saveForm(function () { return Promise.resolve(res(true, 200, { version: 3, changed: false })); }, st);
  assert.deepStrictEqual(r, { ok: true, version: 3, changed: false });
  assert.strictEqual(board.savedText(r), '바뀐 내용이 없어 버전을 올리지 않았습니다.');
  assert.strictEqual(board.savedText({ ok: true, version: 4, changed: true }), '새 버전 v4로 저장했습니다. 앞으로 새로 만드는 건부터 적용됩니다.');
  assert.strictEqual(board.savedText({ ok: true, version: null, changed: true }), '새 버전으로 저장했습니다. 앞으로 새로 만드는 건부터 적용됩니다.');
});
test('confirmPlan: 저장은 변경이 있을 때만, 0건이면 안내만, 취소·삭제는 그대로, 확인 없으면 none', function () {
  const base = board.editFromForm(form());
  const changed = board.editSetTitle(base, 0, '다른 제목');
  assert.deepStrictEqual(board.confirmPlan(changed, { act: 'save' }), { run: 'save' });
  assert.deepStrictEqual(board.confirmPlan(base, { act: 'save' }), { run: 'none', msg: board.NOTHING_TO_SAVE });
  assert.deepStrictEqual(board.confirmPlan(base, { act: 'cancel' }), { run: 'cancel' });
  assert.deepStrictEqual(board.confirmPlan(changed, { act: 'del', ref: 'A' }), { run: 'del' });
  assert.deepStrictEqual(board.confirmPlan(changed, null), { run: 'none' });
});
test('confirmText: 취소 확인 문구는 지금 건수를 따른다(1건→2건), 0건이면 건수 없는 문구', function () {
  const c = { act: 'cancel', ref: '', text: '옛 문구' };
  const base = board.editFromForm(form());
  const one = board.editSetTitle(base, 0, '다른 제목');
  const two = board.editSetName(one, '다른 이름');
  assert.ok(board.confirmText(one, c).includes('1건'));
  assert.ok(board.confirmText(two, c).includes('2건'));
  const h = board.editFootHtml(two, { confirm: c });
  assert.ok(h.includes('2건이 사라집니다') && !h.includes('옛 문구'));
  const zero = board.confirmText(base, c);
  assert.strictEqual(zero, '저장하지 않은 변경이 없습니다. 편집을 끝낼까요?');
  assert.ok(!zero.includes('0건'));
  assert.strictEqual(board.confirmText(base, { act: 'del', ref: 'A', text: '빼기 문구' }), '빼기 문구');
  assert.strictEqual(board.confirmText(base, { act: 'save' }), board.saveConfirmText());
});
test('confirmBack: 삭제는 ref로 지금 위치의 삭제 버튼, 없으면 표 추가, 저장·취소는 각 버튼', function () {
  const base = board.editFromForm(form());
  assert.strictEqual(board.confirmBack(base, { act: 'del', ref: 'B' }), '[data-act="del"][data-i="1"]');
  const moved = board.editMove(base, 1, -1);
  assert.strictEqual(board.confirmBack(moved, { act: 'del', ref: 'B' }), '[data-act="del"][data-i="0"]');
  assert.strictEqual(board.confirmBack(base, { act: 'del', ref: 'Z' }), '#bd-add');
  assert.strictEqual(board.confirmBack(base, { act: 'save' }), '#bd-save');
  assert.strictEqual(board.confirmBack(base, { act: 'cancel' }), '#bd-cancel');
});
test('confirmHtml: role=group + aria-labelledby, role=alert 없음, 문구 이스케이프', function () {
  const h = board.confirmHtml({ text: '<b>x</b>' });
  assert.ok(h.includes('role="group"') && h.includes('aria-labelledby="bd-confirm-text"') && h.includes('id="bd-confirm-text"'));
  assert.ok(!h.includes('role="alert"'));
  assert.ok(h.includes('&lt;b&gt;') && !h.includes('<b>'));
});
test('formsFromList: 목록 실패(DB 014 미적용 500)면 기본 양식만·편집 불가, 성공이면 기본+서버 양식', async function () {
  let r = await board.loadForms(function () { return Promise.resolve(res(false, 500, { detail: '서버 오류' })); });
  let f = board.formsFromList(r);
  assert.deepStrictEqual(f.forms, [{ form_id: 'default_doc', name: '기본 양식', is_default: true }]);
  assert.strictEqual(f.canEdit, false);
  assert.strictEqual(f.error, '서버 오류');
  const h = board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: board.canCopy({ editable: false }, f.canEdit) });
  assert.ok(!h.includes('bd-copy') && !h.includes('bd-edit'));
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [{ form_id: 7, name: '우리' }], can_edit: true })); });
  f = board.formsFromList(r);
  assert.strictEqual(f.forms.length, 2);
  assert.deepStrictEqual([f.canEdit, f.error], [true, '']);
  assert.strictEqual(f.canWrite, false);   // can_edit만 켜진 응답: 작성 버튼 권한은 없다
});
test('formsFromList: can_write만 켜지면 작성 가능·수정 불가, can_edit만 켜지면 작성 불가 — 작성 버튼은 can_write 기준', async function () {
  let r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [], can_edit: false, can_write: true })); });
  let f = board.formsFromList(r);
  assert.deepStrictEqual([f.canWrite, f.canEdit], [true, false]);
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: true, canWrite: f.canWrite }).includes('bd-write'));
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [], can_edit: true })); });
  f = board.formsFromList(r);
  assert.deepStrictEqual([f.canWrite, f.canEdit], [false, true]);
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: true, canWrite: f.canWrite }).includes('bd-write'));
  f = board.formsFromList({ ok: false, error: 'x' });
  assert.strictEqual(f.canWrite, false);
});
test('whoKey: 같은 계정은 같은 키, 모드·아이디·사번이 다르면 다른 키, 세션 없으면 빈 문자열', function () {
  const a = { mode: 'account', id: 'kim', emp: '1234567' };
  assert.strictEqual(board.whoKey(a), board.whoKey({ mode: 'account', id: 'kim', emp: '1234567' }));
  assert.notStrictEqual(board.whoKey(a), board.whoKey({ mode: 'account', id: 'lee', emp: '1234567' }));
  assert.notStrictEqual(board.whoKey(a), board.whoKey({ mode: 'account', id: 'kim', emp: '7654321' }));
  assert.notStrictEqual(board.whoKey(a), board.whoKey({ mode: 'guest', id: 'kim', emp: '1234567' }));
  assert.strictEqual(board.whoKey(null), '');
});
// ── qa-verifier 2차 지적 반영(N1·N3·N4) ──
test('profilePlan: 한 번도 그린 적 없으면 none, 로그아웃·안 보임이면 clear, 보이는 중 로그인이면 redraw', function () {
  assert.strictEqual(board.profilePlan(false, 'account|kim|1234567', true), 'none');
  assert.strictEqual(board.profilePlan(false, '', true), 'none');
  assert.strictEqual(board.profilePlan(true, '', true), 'clear');                       // 로그아웃
  assert.strictEqual(board.profilePlan(true, 'account|kim|1234567', false), 'clear');   // 다른 화면을 보는 중
  assert.strictEqual(board.profilePlan(true, 'account|kim|1234567', true), 'redraw');   // 로그아웃 뒤 다시 로그인(N1)
});
test('actionsHtml: 워드 생성 중(docxBusy)이면 다시 그려져도 워드 버튼이 꺼져 있다', function () {
  const busy = board.actionsHtml({ mode: 'view', hasDoc: true, docxBusy: true, editable: true });
  assert.ok(/id="bd-docx" data-act="docx" disabled/.test(busy));
  const idle = board.actionsHtml({ mode: 'view', hasDoc: true, docxBusy: false, editable: true });
  assert.ok(!/id="bd-docx" data-act="docx" disabled/.test(idle));
});
// ── 2026-11-02 사용자 확정 반영(N5·기본 양식 이름·제목 공백) ──
test('docxOutcome: 요청 뒤 계정 epoch가 바뀌면 성공·실패 모두 drop, 같으면 save/error', function () {
  assert.strictEqual(board.docxOutcome(1, 2, { ok: true, blob: {} }), 'drop');
  assert.strictEqual(board.docxOutcome(1, 2, { ok: false, error: 'x' }), 'drop');
  assert.strictEqual(board.docxOutcome(3, 3, { ok: true, blob: {} }), 'save');
  assert.strictEqual(board.docxOutcome(3, 3, { ok: false, error: 'x' }), 'error');
  assert.strictEqual(board.docxOutcome(3, 3, null), 'error');
});
test('formOptionsHtml: 기본 양식은 접미사 없이 이름만, 서버 양식은 · vN', function () {
  const o = board.formOptionsHtml([
    { form_id: 'default_doc', name: '기본 양식', is_default: true, current_version: 9 },
    { form_id: 7, name: '우리 양식', current_version: 2 }], '');
  assert.ok(o.includes('<option value="default_doc">기본 양식</option>'));
  assert.ok(!o.includes('(기본)') && !o.includes('· v9'));
  assert.ok(o.includes('<option value="7">우리 양식 · v2</option>'));
});
test('제목·칸 모두 앞뒤 공백만 바꾸면 0건(서버 clean·putBody가 trim), 실질 변경은 1건', function () {
  let st = board.editFromForm(form());
  st = board.editSetTitle(st, 0, '  재산상 이익제공 ');
  assert.strictEqual(board.changeCount(st), 0);
  assert.deepStrictEqual(board.badgesFor(st, 0), []);
  // 칸 끝 공백만 → 0건·뱃지 없음·putBody는 trim
  st = board.editSetCell(board.editFromForm(form()), 0, 'r1c0', '대한민국 기관 ');
  assert.strictEqual(board.changeCount(st), 0);
  assert.deepStrictEqual(board.badgesFor(st, 0), []);
  assert.strictEqual(board.putBody(st).tables[0].cells.r1c0, '대한민국 기관');
  // 칸 앞 공백만 → 0건
  st = board.editSetCell(board.editFromForm(form()), 0, 'r1c0', ' 대한민국 기관');
  assert.strictEqual(board.changeCount(st), 0);
  // 실질 변경 + 공백 → 1건·putBody는 trim
  st = board.editSetCell(board.editFromForm(form()), 0, 'r1c0', '서울 ');
  assert.strictEqual(board.changeCount(st), 1);
  assert.deepStrictEqual(board.badgesFor(st, 0), ['변경됨']);
  assert.strictEqual(board.putBody(st).tables[0].cells.r1c0, '서울');
});
test('validateEdit: 원래 제목이 공백뿐인 기존 표를 비워 두면 서버처럼 오류', function () {
  const f = form(); f.tables[1].title = '   ';
  const st = board.editSetTitle(board.editFromForm(f), 1, '');
  assert.strictEqual(board.validateEdit(st), '2번째 표의 제목을 입력해 주세요.');
});
test('포커스 대상: 오류 문구와 편집 줄은 tabindex=-1로 포커스를 받을 수 있다', function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, 'x');
  assert.ok(/id="bd-editerr"[^>]*tabindex="-1"/.test(board.editFootHtml(st, { error: '실패' })));
  assert.ok(/id="bd-editbar" tabindex="-1"/.test(board.editHtml(st, { saving: true }, null)));
});
// ── 2026-11-02 design-reviewer 규격 반영(확인 줄 문구·포커스·위치, 저장 중 문구) ──
test('confirmButtons: 동작별 동사 문구, 저장만 틸 테두리(primary), 모르는 동작은 확인/취소', function () {
  assert.deepStrictEqual(board.confirmButtons({ act: 'save' }), { ok: '저장', no: '돌아가기', primary: true });
  assert.deepStrictEqual(board.confirmButtons({ act: 'cancel' }), { ok: '변경 버리고 끝내기', no: '계속 편집', primary: false });
  assert.deepStrictEqual(board.confirmButtons({ act: 'del' }), { ok: '표 빼기', no: '그대로 두기', primary: false });
  assert.deepStrictEqual(board.confirmButtons(null), { ok: '확인', no: '취소', primary: false });
});
test('confirmFocus: 저장·삭제는 실행 버튼, 편집 끝내기는 안전 버튼(계속 편집)', function () {
  assert.strictEqual(board.confirmFocus({ act: 'save' }), '#bd-ok-confirm');
  assert.strictEqual(board.confirmFocus({ act: 'del', ref: 'A' }), '#bd-ok-confirm');
  assert.strictEqual(board.confirmFocus({ act: 'cancel' }), '#bd-no-confirm');
});
test('confirmHtml: 버튼 문구가 동작을 따르고, 저장 실행 버튼에만 bd-primary', function () {
  const s = board.confirmHtml({ act: 'save', text: 'x' });
  assert.ok(/id="bd-ok-confirm" data-act="ok-confirm" class="bd-primary">저장<\/button>/.test(s));
  assert.ok(/id="bd-no-confirm" data-act="no-confirm">돌아가기<\/button>/.test(s));
  const c = board.confirmHtml({ act: 'cancel', text: 'x' });
  assert.ok(c.includes('>변경 버리고 끝내기</button>') && c.includes('>계속 편집</button>') && !c.includes('bd-primary'));
  const d = board.confirmHtml({ act: 'del', text: 'x' });
  assert.ok(d.includes('>표 빼기</button>') && d.includes('>그대로 두기</button>') && !d.includes('bd-primary'));
});
test('saveConfirmText: 두 줄(줄바꿈으로 나뉜다)', function () {
  assert.strictEqual(board.saveConfirmText(), '새 버전으로 저장합니다.\n결재 중인 건은 상신할 때의 버전이 그대로 유지됩니다.');
});
test('editHtml: 삭제 확인은 해당 카드의 머리 줄 바로 아래, 발 위에는 없다 / 저장·끝내기 확인은 발 위', function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, '다른 제목');
  const del = { act: 'del', ref: 'B', text: board.removeConfirmText(st.tables[1]) };
  const h = board.editHtml(st, { confirm: del }, null);
  assert.strictEqual(h.split('class="bd-confirm"').length - 1, 1);
  const card1 = h.slice(h.indexOf('<section class="bd-card bd-card-edit" data-i="1"'));
  const sec = card1.slice(0, card1.indexOf('</section>'));
  assert.ok(sec.includes('class="bd-confirm"'));
  assert.ok(sec.indexOf('class="bd-confirm"') > sec.indexOf('이 표 칸 건너뛰기'));   // 머리 줄 뒤
  assert.ok(sec.indexOf('class="bd-confirm"') < sec.indexOf('bd-table-wrap'));      // 표 앞
  assert.ok(!board.editFootHtml(st, { confirm: del }).includes('bd-confirm'));
  // 저장 확인은 발(.bd-foot) 위, 카드 안에는 없다
  const sv = board.editHtml(st, { confirm: { act: 'save' } }, null);
  assert.ok(sv.indexOf('class="bd-confirm"') > sv.indexOf('</fieldset>'));
  assert.ok(sv.indexOf('class="bd-confirm"') < sv.indexOf('class="bd-foot"'));
  // 가리키는 표가 없으면(이미 빠짐) 발 위에 대신 그린다
  assert.ok(board.editFootHtml(st, { confirm: { act: 'del', ref: 'Z', text: 'x' } }).includes('bd-confirm'));
});
test('editBarHtml: 저장 중이면 건수 자리에 저장하는 중…, 아니면 건수', function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, '다른 제목');
  assert.ok(/id="bd-dirty"[^>]*>저장하는 중…<\/span>/.test(board.editBarHtml(st, { saving: true })));
  assert.ok(/id="bd-dirty"[^>]*>● 저장 안 한 변경 1건<\/span>/.test(board.editBarHtml(st, {})));
  assert.ok(/id="bd-dirty"[^>]*>● 저장 안 한 변경 1건<\/span>/.test(board.editBarHtml(st)));
  assert.ok(/id="bd-dirty"[^>]*>저장하는 중…<\/span>/.test(board.editHtml(st, { saving: true }, null)));
});
test('shouldClearError: 검증 오류는 원인이 풀리면 입력으로 지우고, 확인 줄을 열 때는 지운다 / 409·저장 중·서버 문구(입력)는 남긴다', function () {
  const bad = board.editSetTitle(board.editSetCell(board.editFromForm(form()), 0, 'r1c0', '다른 칸'), 0, '');
  const msg = board.validateEdit(bad);
  assert.strictEqual(msg, '1번째 표의 제목을 입력해 주세요.');
  const fixed = board.editSetTitle(bad, 0, '다시 채운 제목');
  assert.strictEqual(board.validateEdit(fixed), null);
  const local = { error: msg, errorKind: 'local', conflict: false, saving: false };
  // 입력: 아직 비어 있으면 남기고, 채우면 지운다
  assert.strictEqual(board.shouldClearError(local, bad, 'input'), false);
  assert.strictEqual(board.shouldClearError(local, fixed, 'input'), true);
  // 확인 줄을 열 때(저장·끝내기)는 지운다
  assert.strictEqual(board.shouldClearError(local, fixed, 'confirm'), true);
  // 서버 저장 실패 문구는 입력만으로는 지우지 않지만, 다시 저장·끝내기 확인을 열 때는 지운다
  const server = { error: '저장하지 못했습니다.', errorKind: 'server', conflict: false, saving: false };
  assert.strictEqual(board.shouldClearError(server, fixed, 'input'), false);
  assert.strictEqual(board.shouldClearError(server, fixed, 'confirm'), true);
  // 409 충돌은 어느 경우에도 지우지 않는다
  const conflict = { error: '다른 사람이 먼저 저장했습니다.', errorKind: 'server', conflict: true, saving: false };
  assert.strictEqual(board.shouldClearError(conflict, fixed, 'input'), false);
  assert.strictEqual(board.shouldClearError(conflict, fixed, 'confirm'), false);
  // 저장 중·오류 없음·모르는 cause·상태 없음
  assert.strictEqual(board.shouldClearError({ error: msg, errorKind: 'local', saving: true }, fixed, 'input'), false);
  assert.strictEqual(board.shouldClearError({ error: '', errorKind: 'local' }, fixed, 'confirm'), false);
  assert.strictEqual(board.shouldClearError(local, fixed, 'other'), false);
  assert.strictEqual(board.shouldClearError(local, null, 'input'), false);
  assert.strictEqual(board.shouldClearError(null, fixed, 'confirm'), false);
});
test('board.js 배선: onSave·onCancel 확인과 refreshStatus 입력 경로가 shouldClearError를 거치고, 입력 경로는 오류 줄만 뗀다', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8').replace(/\r\n/g, '\n');   // Windows autocrlf 체크아웃에서도 통과
  function body(name) {
    const s = src.indexOf('function ' + name + '(');
    assert.ok(s >= 0, name + ' 없음');
    const e = src.indexOf('\n  }\n', s);
    return src.slice(s, e);
  }
  assert.ok(body('onSave').includes("shouldClearError(editUi, edit, 'confirm')"));
  assert.ok(body('onCancel').includes("shouldClearError(editUi, edit, 'confirm')"));
  const rs = body('refreshStatus');
  assert.ok(rs.includes("shouldClearError(editUi, edit, 'input')"));
  assert.ok(rs.includes("el('bd-editerr')") && rs.includes('removeChild'));
  assert.ok(!rs.includes('renderEdit('), 'refreshStatus는 전체를 다시 그리지 않는다(포커스 유지)');
});
// ── 2026-11-02 design-reviewer 대조 결과 반영(c7c996b 후속 7건) ──
test('actionsHtml: 편집·복제 모두 못 하면 권한 안내 한 줄, 편집·복제 가능하거나 양식이 없으면 없다', function () {
  const HINT = '<span class="bd-hint">양식은 편집 권한이 있는 사람만 고칠 수 있습니다.</span>';
  assert.ok(board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: false, perm: 'no' }).includes(HINT));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: true, editable: true }).includes('bd-hint'));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: true }).includes('bd-hint'));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: false }).includes('bd-hint'));
  assert.ok(!board.actionsHtml({ mode: 'edit', hasDoc: true, editable: false, canCopy: false }).includes('bd-hint'));
});
test('editCardHtml: 표 빼기 버튼은 글자 빼기·aria-label 표 빼기, 1개일 때는 title 대신 머리 줄 아래 안내', function () {
  const st = board.editFromForm(form());
  let h = board.editHtml(st, {}, null);
  assert.ok(/data-act="del" data-i="0" aria-label="표 빼기">빼기<\/button>/.test(h));
  assert.ok(!h.includes('aria-label="표 삭제"') && !h.includes('>삭제</button>'));
  assert.ok(!h.includes('뺄 수 없습니다'));
  h = board.editHtml(board.editRemove(st, 0), {}, null);
  assert.ok(/data-act="del" data-i="0" disabled aria-label="표 빼기">빼기<\/button>/.test(h));
  assert.ok(!/data-act="del"[^>]*title=/.test(h));
  const head = h.indexOf('이 표 칸 건너뛰기');
  const hint = h.indexOf('<p class="bd-hint">표가 하나뿐이면 뺄 수 없습니다.</p>');
  assert.ok(hint > head && hint < h.indexOf('bd-table-wrap'));
});
test('cellLabel: 표 제목 · 행 머리 · 열 머리, 구하지 못한 부분은 생략', function () {
  const t = { title: '수익성 분석', rows: [
    [{ key: 'h0', text: '구분', header: true }, { key: 'h1', text: '2025년', header: true }, { key: 'h2', text: '2026년', header: true }],
    [{ key: 'a0', text: '예금', header: true }, { key: 'a1', text: '10' }, { key: 'a2', text: '20' }],
    [{ key: 'b0', text: '대출' }, { key: 'b1', text: '30' }, { key: 'b2', text: '40' }]] };
  assert.strictEqual(board.cellLabel(t, 1, 2), '수익성 분석 · 예금 · 2026년');
  assert.strictEqual(board.cellLabel(t, 2, 1), '수익성 분석 · 대출 · 2025년');   // header 없는 행은 첫 칸
  assert.strictEqual(board.cellLabel(t, 2, 0), '수익성 분석 · 구분');            // 행 머리가 자기 자신이면 생략
  assert.strictEqual(board.cellLabel(t, 0, 1), '수익성 분석');                   // 머리글 행 칸은 행·열 머리 생략
  // 편집 중 값(cells)을 따른다
  assert.strictEqual(board.cellLabel(Object.assign({}, t, { cells: { a0: '적금' } }), 1, 1), '수익성 분석 · 적금 · 2025년');
  // 제목이 비면 생략, 모두 비면 '칸 수정'
  assert.strictEqual(board.cellLabel(Object.assign({}, t, { title: ' ' }), 1, 2), '예금 · 2026년');
  assert.strictEqual(board.cellLabel({ title: '', rows: [[{ text: 'x' }]] }, 0, 0), '칸 수정');
  assert.strictEqual(board.cellLabel(null, 0, 0), '칸 수정');
});
test('cellLabel: 병합(colspan·rowspan)을 펼쳐 같은 열 순번의 머리를 찾는다', function () {
  const t = { title: '표', rows: [
    [{ text: '구분', header: true, rowspan: 2 }, { text: '금액', header: true, colspan: 2 }],
    [{ text: '2025년', header: true }, { text: '2026년', header: true }],
    [{ text: '예금', header: true, rowspan: 2 }, { key: 'x1', text: '1' }, { key: 'x2', text: '2' }],
    [{ key: 'y1', text: '3' }, { key: 'y2', text: '4' }]] };
  assert.strictEqual(board.cellLabel(t, 2, 2), '표 · 예금 · 금액');   // 첫 행의 병합 칸이 그 열을 덮는다
  assert.strictEqual(board.cellLabel(t, 3, 1), '표 · 예금 · 금액');   // 위에서 내려온 행 머리 병합
  // 머리글 행이 없으면 columns 배열(문자열)의 같은 순번
  const c = { title: '표', columns: ['항목', '값'], rows: [[{ key: 'k0', text: '가' }, { key: 'k1', text: '1' }]] };
  assert.strictEqual(board.cellLabel(c, 0, 1), '표 · 가 · 값');
  // columns가 숫자(서버의 열 수)면 열 머리는 생략
  assert.strictEqual(board.cellLabel({ title: '표', columns: 4, rows: c.rows }, 0, 1), '표 · 가');
});
test('cellLabel: 다단 구분(C-5 모양)은 바깥→안쪽 경로를 모두 잇고 같은 글자는 한 번만', function () {
  const t = { title: '표', rows: [
    [{ text: '구분', header: true, colspan: 3 }, { text: '사업초기', header: true }, { text: '안정기', header: true }],
    [{ key: 'g1', text: '비용', header: true, rowspan: 2 }, { key: 'g2', text: '영업점', header: true, rowspan: 2 }, { key: 'g3', text: '자동화기기 운영(j)', header: true },
     { key: 'v1', text: '1' }, { key: 'v2', text: '2' }],
    [{ key: 'h3', text: '인건비', header: true }, { key: 'w1', text: '3' }, { key: 'w2', text: '4' }],
    [{ key: 'g4', text: '소계', header: true, colspan: 2 }, { key: 'g5', text: '합계', header: true }, { key: 'x1', text: '5' }, { key: 'x2', text: '6' }]] };
  assert.strictEqual(board.cellLabel(t, 1, 3), '표 · 비용 › 영업점 › 자동화기기 운영(j) · 사업초기');
  assert.strictEqual(board.cellLabel(t, 1, 4), '표 · 비용 › 영업점 › 자동화기기 운영(j) · 안정기');
  assert.strictEqual(board.cellLabel(t, 2, 1), '표 · 비용 › 영업점 › 인건비 · 사업초기');   // 위에서 내려온 병합 칸 포함
  assert.notStrictEqual(board.cellLabel(t, 1, 3), board.cellLabel(t, 2, 1));
  assert.strictEqual(board.cellLabel(t, 3, 2), '표 · 소계 › 합계 · 사업초기');              // 두 열을 덮는 병합 칸도 한 번만
  const d = { title: '표', rows: [[{ text: 'X', header: true }, { text: 'Y', header: true }, { text: 'Z', header: true }],
    [{ key: 'a', text: '합계', header: true }, { key: 'b', text: '합계', header: true }, { key: 'c', text: '1' }]] };
  assert.strictEqual(board.cellLabel(d, 1, 2), '표 · 합계 · Z');                                 // 같은 글자는 한 번만
  // 구분 칸 입력: 바깥 구분부터 자기 글자까지, 칸마다 유일
  assert.strictEqual(board.cellLabel(t, 1, 2), '표 · 비용 › 영업점 › 자동화기기 운영(j) 구분 이름');
  assert.strictEqual(board.cellLabel(t, 2, 0), '표 · 비용 › 영업점 › 인건비 구분 이름');
  assert.strictEqual(board.cellLabel(t, 1, 0), '표 · 비용 구분 이름');
  const all = board.cellLabels(t), vals = Object.keys(all).map(function (k) { return all[k]; });
  assert.strictEqual(new Set(vals).size, vals.length, '모든 칸 이름이 서로 다르다');
});
test('editHtml: 값 칸 입력의 aria-label은 cellLabel, 이스케이프된다', function () {
  const h = board.editHtml(board.editFromForm(form()), {}, null);
  assert.ok(h.includes('data-key="r1c0" maxlength="100" value="대한민국 기관" aria-label="재산상 이익제공 · 구분"'));
  assert.ok(!h.includes('aria-label="칸 수정"'));
  const f = form(); f.tables[0].title = '"><b>';
  const x = board.editHtml(board.editFromForm(f), {}, null);
  assert.ok(x.includes('aria-label="&quot;&gt;&lt;b&gt; · 구분"') && !x.includes('<b>'));
  // label 인자 없이 부르면 예전처럼 '칸 수정'
  assert.ok(board.editCellHtml({ key: 'k', text: 'a' }, { k: 'a' }).includes('aria-label="칸 수정"'));
});
test('validateEditAt: 문구는 validateEdit와 같고 위치(name·title:i·cell:i:key)를 함께 준다', function () {
  const base = board.editFromForm(form());
  assert.strictEqual(board.validateEditAt(base), null);
  assert.deepStrictEqual(board.validateEditAt(board.editSetName(base, ' ')), { msg: '양식 이름을 입력해 주세요.', target: 'name' });
  assert.deepStrictEqual(board.validateEditAt(board.editSetTitle(base, 1, '')), { msg: '2번째 표의 제목을 입력해 주세요.', target: 'title:1' });
  assert.deepStrictEqual(board.validateEditAt(board.editSetCell(base, 0, 'r1c0', 'a'.repeat(101))),
    { msg: '1번째 표에 100자를 넘는 칸이 있습니다.', target: 'cell:0:r1c0' });
  const bad = board.editSetCell(base, 0, 'r0c1', 'a' + CH(1));
  assert.strictEqual(board.validateEditAt(bad).msg, board.validateEdit(bad));
  assert.strictEqual(board.validateEditAt(bad).target, 'cell:0:r0c1');
});
test('errTargetParts: 위치 문자열을 나누고, 모르는 형식은 null', function () {
  assert.deepStrictEqual(board.errTargetParts('name'), { kind: 'name', i: -1, key: '' });
  assert.deepStrictEqual(board.errTargetParts('title:2'), { kind: 'title', i: 2, key: '' });
  assert.deepStrictEqual(board.errTargetParts('cell:0:r1:c"0'), { kind: 'cell', i: 0, key: 'r1:c"0' });
  assert.strictEqual(board.errTargetParts('cell:0'), null);
  assert.strictEqual(board.errTargetParts('title:x'), null);
  assert.strictEqual(board.errTargetParts(''), null);
});
test('editFootHtml: 검증 오류 문구 끝에 고치러 가기(위치 이스케이프), 서버 오류·409에는 없다', function () {
  const st = board.editSetTitle(board.editFromForm(form()), 0, '');
  let h = board.editFootHtml(st, { error: '1번째 표의 제목을 입력해 주세요.', errorKind: 'local', errorTarget: 'title:0' });
  assert.ok(/id="bd-editerr"[^>]*>1번째 표의 제목을 입력해 주세요\. <button type="button" class="link-btn" data-act="goerr" data-target="title:0">고치러 가기<\/button><\/p>/.test(h));
  h = board.editFootHtml(st, { error: 'x', errorKind: 'local', errorTarget: 'cell:0:"><i>' });
  assert.ok(h.includes('data-target="cell:0:&quot;&gt;&lt;i&gt;"') && !h.includes('<i>'));
  assert.ok(!board.editFootHtml(st, { error: '저장하지 못했습니다.', errorKind: 'server', errorTarget: '' }).includes('goerr'));
  assert.ok(!board.editFootHtml(st, { error: '먼저 저장', conflict: true, errorTarget: 'title:0' }).includes('goerr'));
});
test('목록 형식 오류는 다음 행동을 안내하는 문구(양식 목록·표 목록 공통)', async function () {
  const MSG = '목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 계속되면 담당자에게 알려 주세요.';
  let r = await board.loadForms(function () { return Promise.resolve(res(true, 200, {})); });
  assert.deepStrictEqual(r, { ok: false, error: MSG });
  r = await board.loadCatalog(function () { return Promise.resolve(res(true, 200, { tables: [] })); });
  assert.deepStrictEqual(r, { ok: false, error: MSG });
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8');
  assert.ok(!src.includes('목록 형식이 맞지 않습니다'));
});
test('board.js 배선: 저장 중 문구는 #bd-msg에 쓰지 않는다, 검증은 위치까지 받아 둔다, goerr를 처리한다', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8');
  assert.ok(!src.includes("say('저장하는 중…')"));
  function body(name) {
    const s = src.indexOf('function ' + name + '(');
    assert.ok(s >= 0, name + ' 없음');
    return src.slice(s, src.indexOf('\n  }\n', s));
  }
  assert.ok(body('onSave').includes('validateEditAt(edit)'));
  assert.ok(body('doSave').includes('validateEditAt(edit)'));
  assert.ok(body('onBodyClick').includes("act === 'goerr'"));
  assert.ok(!body('goToError').includes("'[data-key=\"'"), 'data-key 값을 선택자에 넣지 않는다');
});
// ── 2026-11-02 qa P3-a·b·d, design 제안 반영 ──
test('clearOnRestructure: 검증 오류(local)만 지운다 / 서버 오류·409·저장 중·오류 없음은 그대로', function () {
  assert.strictEqual(board.clearOnRestructure({ error: '1번째 표의 제목을 입력해 주세요.', errorKind: 'local', errorTarget: 'title:0' }), true);
  assert.strictEqual(board.clearOnRestructure({ error: '저장하지 못했습니다.', errorKind: 'server' }), false);
  assert.strictEqual(board.clearOnRestructure({ error: '다른 사람이 먼저 저장했습니다.', errorKind: 'server', conflict: true }), false);
  assert.strictEqual(board.clearOnRestructure({ error: 'x', errorKind: 'local', conflict: true }), false);
  assert.strictEqual(board.clearOnRestructure({ error: 'x', errorKind: 'local', saving: true }), false);
  assert.strictEqual(board.clearOnRestructure({ error: '', errorKind: 'local' }), false);
  assert.strictEqual(board.clearOnRestructure(null), false);
  // 지운 상태로 다시 그리면 오류 줄(#bd-editerr)이 없다
  const st = board.editMove(board.editSetTitle(board.editFromForm(form()), 0, ''), 0, 1);
  assert.ok(!board.editFootHtml(st, { error: '', errorKind: '', errorTarget: '' }).includes('bd-editerr'));
});
test('board.js 배선: 위로·아래로·빼기 확정·표 추가 뒤 clearOnRestructure를 거쳐 다시 그린다', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8').replace(/\r\n/g, '\n');   // Windows autocrlf 체크아웃에서도 통과
  function body(name) {
    const s = src.indexOf('function ' + name + '(');
    assert.ok(s >= 0, name + ' 없음');
    return src.slice(s, src.indexOf('\n  }\n', s));
  }
  assert.ok(body('clearOnRestructure').includes('board.clearOnRestructure(editUi)'));
  const click = body('onBodyClick');
  const mv = click.indexOf('board.editMove(');
  assert.ok(mv >= 0 && click.indexOf('clearOnRestructure()', mv) > mv && click.indexOf('clearOnRestructure()', mv) < click.indexOf('renderEdit(', mv));
  const add = click.indexOf('board.editAdd(');
  assert.ok(add >= 0 && click.indexOf('clearOnRestructure()', add) > add && click.indexOf('clearOnRestructure()', add) < click.indexOf('renderEdit(', add));
  const rc = body('runConfirm');
  const rm = rc.indexOf('board.editRemove(');
  assert.ok(rm >= 0 && rc.indexOf('clearOnRestructure()', rm) > rm && rc.indexOf('clearOnRestructure()', rm) < rc.indexOf('renderEdit(', rm));
  // 빼기 버튼(확인 줄 열기)만으로는 지우지 않는다
  const del = click.slice(click.indexOf("act === 'del'"), click.indexOf("act === 'ok-confirm'"));
  assert.ok(!del.includes('clearOnRestructure'));
});
test('permState: 응답 전·목록 실패는 unknown, 성공이면 can_edit에 따라 yes/no', async function () {
  assert.strictEqual(board.permState(null), 'unknown');
  assert.strictEqual(board.permState({ ok: false, error: 'x' }), 'unknown');
  assert.strictEqual(board.permState({ ok: true, items: [], canEdit: true }), 'yes');
  assert.strictEqual(board.permState({ ok: true, items: [], canEdit: false }), 'no');
  let r = await board.loadForms(function () { return Promise.resolve(res(false, 500, { detail: '서버 오류' })); });
  assert.strictEqual(board.formsFromList(r).perm, 'unknown');
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [], can_edit: false })); });
  assert.strictEqual(board.formsFromList(r).perm, 'no');
  r = await board.loadForms(function () { return Promise.resolve(res(true, 200, { items: [], can_edit: true })); });
  assert.strictEqual(board.formsFromList(r).perm, 'yes');
});
test('actionsHtml: 권한을 모르거나(응답 전) 알 수 없으면(목록 실패) 권한 안내를 띄우지 않는다', function () {
  const ctx = { mode: 'view', hasDoc: true, editable: false, canCopy: false };
  assert.ok(!board.actionsHtml(Object.assign({}, ctx, { perm: 'unknown' })).includes('bd-hint'));
  assert.ok(!board.actionsHtml(ctx).includes('bd-hint'));
  assert.ok(board.actionsHtml(Object.assign({}, ctx, { perm: 'no' })).includes('bd-hint'));
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board.js'), 'utf8');
  assert.ok(src.includes("perm = 'unknown'; current = null;"), '계정이 바뀌면 권한을 알 수 없음으로 되돌린다');
  assert.ok(src.includes('perm = r.perm;') && src.includes('perm: perm,'));
});
test('board.js·이 테스트 파일에 원시 특수 코드포인트(U+2028/2029/FFFE/FFFF)가 없다', function () {
  const fs = require('node:fs');
  const path = require('node:path');
  [path.join(__dirname, '..', 'js', 'board.js'), __filename].forEach(function (p) {
    const src = fs.readFileSync(p, 'utf8');
    [0x2028, 0x2029, 0xfffe, 0xffff].forEach(function (cp) {
      assert.ok(!src.includes(CH(cp)), path.basename(p) + ' has raw ' + cp.toString(16));
    });
  });
});

test('cellLabels·cardLabel: 표 제목·행 머리를 고치면 읽기 이름이 따라간다(F2)', function () {
  const t = { title: '', rows: [
    [{ key: 'h0', text: '구분', header: true }, { key: 'h2', text: '2026년', header: true }],
    [{ key: 'a0', text: '예금', header: true }, { key: 'a2', text: '20' }]] };
  assert.strictEqual(board.cellLabels(t).a2, '예금 · 2026년');
  const x = Object.assign({}, t, { title: 'X' });
  assert.strictEqual(board.cellLabels(x).a2, 'X · 예금 · 2026년');
  assert.deepStrictEqual(board.cellLabels(null), {});
  assert.strictEqual(board.cardLabel({ title: '', mapping: 'A' }), 'A 편집');
  assert.strictEqual(board.cardLabel({ title: 'X', mapping: 'A' }), 'X 편집');
  assert.strictEqual(board.cardLabel({}), '표 편집');
});
test('untilApplied: 밀리면(false) 최대 횟수까지 다시 요청, 적용되면 멈춘다(N2)', async function () {
  let n = 0;
  assert.strictEqual(await board.untilApplied(function () { n++; return Promise.resolve(n >= 2); }), true);
  assert.strictEqual(n, 2);
  n = 0;
  assert.strictEqual(await board.untilApplied(function () { n++; return Promise.resolve(false); }, 3), false);
  assert.strictEqual(n, 3);
});
test('copyOpenPlan: 적용됨·같은 화면·선택 상자가 복제본일 때만 연다(N2)', function () {
  assert.strictEqual(board.copyOpenPlan(true, '7', '7', true), 'open');
  assert.strictEqual(board.copyOpenPlan(false, '7', '7', true), 'say');
  assert.strictEqual(board.copyOpenPlan(true, '3', '7', true), 'say');
  assert.strictEqual(board.copyOpenPlan(true, '7', '7', false), 'say');
  assert.strictEqual(board.copyOpenPlan(true, '', '7', true), 'say');
});
