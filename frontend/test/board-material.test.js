const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const mat = require('../js/board-material.js');

const X = '<img src=x onerror=alert(1)>';
function item(o) {
  return Object.assign({ material_id: 7, bid_case_id: 'BC1', institution_name: '노원구', year: 2026, status_cd: 'PREP', status_name: '준비 중',
    current_snap: 0, last_saved_by: null, last_saved_at: null, created_at: '2026-11-10T08:24:29.342000+00:00',
    assignees: [{ emp_no: '2674805', name: '박영업' }, { emp_no: '3918264', name: '김영업' }] }, o || {});
}
function fake(status, body, seen) {
  return function (url, init) {
    if (seen) seen.push({ url: url, init: init });
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
  };
}
const NET = function () { return Promise.reject(new Error('x')); };

test('kst: UTC → 한국 시각, 마이크로초 허용, 읽을 수 없으면 빈 문자열', function () {
  assert.strictEqual(mat.kst('2026-11-10T08:24:29.342000+00:00'), '11-10 17:24');
  assert.strictEqual(mat.kst('2026-11-10T16:00:00+00:00'), '11-11 01:00');
  assert.strictEqual(mat.kst(''), '');
  assert.strictEqual(mat.kst('x'), '');
  assert.strictEqual(mat.kst(null), '');
});

test('listUrl: 비어 있거나 모양이 틀린 조건은 보내지 않는다', function () {
  assert.strictEqual(mat.listUrl({ q: ' 노원 ', status: 'DRAFT', year: '2026', assignee: '김' }),
    '/board-materials?q=' + encodeURIComponent('노원') + '&status=DRAFT&year=2026&assignee=' + encodeURIComponent('김'));
  assert.strictEqual(mat.listUrl({ status: 'SUBMITTED', year: '20', q: '  ' }), '/board-materials');
  assert.strictEqual(mat.listUrl(), '/board-materials');
  assert.strictEqual(mat.isId('12'), true);
  assert.strictEqual(mat.isId('1/../x'), false);
  assert.strictEqual(mat.isId(''), false);
});

test('statusName·badgeHtml: 준비 중은 회색, 그 밖은 잉크, 이름이 없으면 코드로 보충, 값은 esc', function () {
  assert.ok(mat.badgeHtml(item()).includes('<span class="bd-badge">준비 중</span>'));
  assert.ok(mat.badgeHtml(item({ status_cd: 'DRAFT', status_name: '작성 중' })).includes('bd-badge is-ink'));
  assert.strictEqual(mat.statusName({ status_cd: 'DRAFT' }), '작성 중');
  assert.ok(mat.badgeHtml({ status_cd: 'DRAFT', status_name: X }).includes('&lt;img'));
  assert.ok(!mat.badgeHtml({ status_cd: 'DRAFT', status_name: X }).includes('<img'));
});

test('listTableHtml: 기관명·담당자·값은 esc, 행 버튼 aria-label, 내 이름만 <b>, 저장 전·버전 칸', function () {
  const h = mat.listTableHtml([
    item({ institution_name: X, assignees: [{ emp_no: '1', name: X }, { emp_no: '2', name: '남' }] }),
    item({ material_id: 8, status_cd: 'DRAFT', status_name: '작성 중', current_snap: 3, last_saved_by: '3918264', last_saved_at: '2026-11-07T01:12:00+00:00' })], '1');
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(h.includes('<b>&lt;img') && !h.includes('<b>남'));
  assert.ok(h.includes('data-id="7"') && h.includes('data-id="8"'));
  assert.ok(/aria-label="[^"]*&lt;img[^"]*2026년 이사회 자료 열기, 준비 중"/.test(h));
  assert.ok(h.includes('<caption class="bd-sr">이사회 자료 2건</caption>') && h.includes('scope="col"'));
  assert.ok(h.includes('<span class="dg-hint">저장 전</span>') && h.includes('<td class="mono">—</td>'));
  assert.ok(h.includes('김영업 <span class="mono">11-07 10:12</span>') && h.includes('<td class="mono">v3</td>'));
});

test('sortItems: 최근 저장(없으면 생성) 순', function () {
  const a = item({ material_id: 1, last_saved_at: '2026-11-07T01:12:00+00:00' });
  const b = item({ material_id: 2 });
  assert.deepStrictEqual(mat.sortItems([a, b]).map(function (i) { return i.material_id; }), [2, 1]);
  assert.deepStrictEqual(mat.sortItems(null), []);
});

test('resultHtml: 상태별 문구와 버튼', function () {
  const base = { status: 'ready', items: [], truncated: false };
  assert.ok(mat.resultHtml({ status: 'loading', items: [] }, {}).includes('불러오는 중'));
  const err = mat.resultHtml({ status: 'error', items: [] }, {});
  assert.ok(err.includes('role="alert"') && err.includes('data-act="reload"') && err.includes('다시 불러오기'));
  assert.ok(mat.resultHtml(base, { isHead: true }).includes('아직 만들어진 이사회 자료가 없습니다.'));
  const mine = mat.resultHtml(base, { mine: 2 });
  assert.ok(mine.includes('담당 입찰 건 2건으로 새 자료를 만들 수 있습니다.') && mine.includes('data-act="new"'));
  const none = mat.resultHtml(base, { mine: 0, canTeam: false });
  assert.ok(none.includes('지금 배정된 입찰 건이 없습니다.') && !none.includes('data-act="team"'));
  assert.ok(mat.resultHtml(base, { mine: 0, canTeam: true }).includes('data-act="team">제안팀 구성·배정 열기'));
  assert.ok(mat.resultHtml(base, { mine: null }).includes('불러오는 중'));
  const f = mat.resultHtml(base, { filtered: true, mine: 2 });
  assert.ok(f.includes('조건에 맞는 이사회 자료가 없습니다.') && f.includes('data-act="clear"'));
  assert.ok(mat.resultHtml({ status: 'ready', items: [item()], truncated: true }, {}).includes('최근 300건만 보여 줍니다. 조건을 좁혀 주세요.'));
  assert.strictEqual(mat.countText({ status: 'ready', items: [1, 2] }), '2건');
  assert.strictEqual(mat.countText({ status: 'loading', items: [] }), '');
});

test('listHeadHtml·searchHtml: 역할별 안내와 버튼, 연도 목록, 입력값 esc', function () {
  const a = mat.listHeadHtml({ isHead: false, showForms: true, canCreate: true, newOpen: false });
  assert.ok(a.includes('담당 입찰 건의 이사회 자료를 만들고 버전으로 저장합니다') && a.includes('양식 보기·편집') && a.includes('id="bd-l-newbtn"'));
  const h = mat.listHeadHtml({ isHead: true, showForms: false, canCreate: false });
  assert.ok(h.includes('모든 이사회 자료를 읽기 전용으로 봅니다') && !h.includes('양식 보기·편집') && !h.includes('새 이사회 자료'));
  const s = mat.searchHtml({ q: X, status: 'DRAFT', year: '2026', assignee: '' }, 2026);
  assert.ok(!s.includes('<img') && s.includes('&lt;img'));
  assert.ok(s.includes('<option value="PREP">준비 중') && s.includes('<option value="DRAFT" selected>작성 중'));
  assert.deepStrictEqual(mat.yearOptions(2026, -2, 1), [2024, 2025, 2026, 2027]);
  ['2024', '2025', '2026', '2027'].forEach(function (y) { assert.ok(s.includes('value="' + y + '"'), y); });
  assert.ok(!s.includes('value="2028"'));
});

test('casesFor: 내 담당 ∩ 앱 입찰 건, 이름순, 지역 이름 매핑', function () {
  const recs = [{ bidCaseId: 'BC2', name: '도봉구', region: 'seoul-dobong' }, { bidCaseId: 'BC1', name: '노원구', region: 'x' }, { bidCaseId: 'BC3', name: '광진구' }];
  assert.deepStrictEqual(mat.casesFor(recs, ['BC1', 'BC2'], { x: '노원 지역' }),
    [{ id: 'BC1', name: '노원구', region: '노원 지역' }, { id: 'BC2', name: '도봉구', region: 'seoul-dobong' }]);
  assert.deepStrictEqual(mat.casesFor(null, ['BC1']), []);
  // 프로토타입 이름이 입찰 건 번호여도 '내 담당'으로 보이지 않는다
  assert.deepStrictEqual(mat.casesFor([{ bidCaseId: 'constructor', name: 'x' }, { bidCaseId: 'toString', name: 'y' }], ['BC1']), []);
  assert.strictEqual(mat.casesFor([{ bidCaseId: 'BC1', name: 'a' }, { bidCaseId: 'BC1', name: 'b' }], ['BC1']).length, 1);
});

test('resultHtml: 담당 조회 실패는 배정 없음이 아니라 불러오기 실패로 안내', function () {
  const base = { status: 'ready', items: [], truncated: false };
  const h = mat.resultHtml(base, { mine: null, mineError: true });
  assert.ok(h.includes('담당 정보를 불러오지 못했습니다. 다시 시도해 주세요.') && h.includes('role="alert"') && h.includes('data-act="reload-mine"'));
  assert.ok(!h.includes('지금 배정된 입찰 건이 없습니다'));
  assert.ok(mat.resultHtml(base, { mine: 0 }).includes('지금 배정된 입찰 건이 없습니다.'), '정말 0건이면 기존 안내');
  assert.ok(!mat.resultHtml(base, { isHead: true, mineError: true }).includes('담당 정보'), '영업부장은 담당 조회를 하지 않는다');
});

test('readOnlyHtml: 정렬 값이 프로토타입 이름이어도 클래스에 싣지 않는다', function () {
  const form = { tables: [{ ref: 'A', rows: [[{ key: 'k', mapped: true, align: 'constructor' }]] }] };
  const h = mat.readOnlyHtml(form, [{ ref: 'A', cells: { k: '5' } }]);
  assert.ok(!h.includes('bd-a-constructor') && h.includes('bd-a-right'));
});

test('newPanelHtml: 이미 있음 → [자료 열기], 아니면 [만들기], 값 없으면 비활성, busy, esc', function () {
  const cases = [{ id: 'BC1', name: X, region: '서울' }, { id: 'BC2', name: '도봉구', region: '' }];
  const np = { bc: 'BC1', year: 2026, formId: 'default_doc', busy: false, error: '', exist: 0 };
  const o = { cases: cases, np: np, items: [item()], forms: [{ id: 'default_doc', name: '기본 양식' }, { id: '7', name: X }], nowYear: 2026 };
  const h = mat.newPanelHtml(o);
  assert.ok(h.includes('2026년 이미 있음 · 준비 중') && h.includes('data-act="open-exist" data-id="7">자료 열기') && !h.includes('data-act="create"'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(h.includes('<legend>새 이사회 자료</legend>') && h.includes('만든 뒤에는 양식을 바꿀 수 없습니다.') && h.includes('role="radiogroup"'));
  assert.ok(h.includes('<option value="2026" selected>2026</option>') && h.includes('<option value="2025">'));
  const c2 = mat.newPanelHtml(Object.assign({}, o, { np: Object.assign({}, np, { bc: 'BC2' }) }));
  assert.ok(c2.includes('data-act="create">만들기') && !/data-act="create" disabled/.test(c2) && !c2.includes('open-exist'));
  assert.ok(/data-act="create" disabled/.test(mat.newPanelHtml(Object.assign({}, o, { np: Object.assign({}, np, { bc: '' }) }))));
  const busy = mat.newPanelHtml(Object.assign({}, o, { np: Object.assign({}, np, { bc: 'BC2', busy: true }) }));
  assert.ok(busy.includes('aria-busy="true"') && /data-act="create" disabled>만드는 중…/.test(busy));
  const er = mat.newPanelHtml(Object.assign({}, o, { np: Object.assign({}, np, { bc: 'BC2', error: X }) }));
  assert.ok(er.includes('id="bd-l-newerr" role="alert"') && !er.includes('<img'));
  const ex = mat.newPanelHtml(Object.assign({}, o, { np: Object.assign({}, np, { bc: 'BC2', exist: 9 }) }));
  assert.ok(ex.includes('data-act="open-exist" data-id="9"'));
});

test('createMaterial: 요청 모양·감사 헤더, 201·409·403·400·네트워크', async function () {
  const seen = [];
  let r = await mat.createMaterial(fake(201, { material_id: 9, institution_name: '노원구', year: 2026 }, seen), { bidCaseId: 'BC1', year: 2026, formId: 'default_doc' });
  assert.strictEqual(seen[0].url, '/board-materials');
  assert.strictEqual(seen[0].init.method, 'POST');
  assert.strictEqual(seen[0].init.headers['X-Screen-Id'], 'board_list');
  assert.strictEqual(seen[0].init.headers['X-Button-Id'], 'create');
  assert.strictEqual(seen[0].init.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(seen[0].init.body), { bid_case_id: 'BC1', year: 2026, form_id: 'default_doc' });
  assert.strictEqual(r.ok, true);
  r = await mat.createMaterial(fake(409, { detail: { code: 'ALREADY_EXISTS', material_id: 5 } }), { bidCaseId: 'BC1', year: 2026 });
  assert.deepStrictEqual([r.ok, r.exists, r.materialId], [false, true, 5]);
  r = await mat.createMaterial(fake(403, { detail: { code: 'FORBIDDEN' } }), { bidCaseId: 'BC1', year: 2026 });
  assert.ok(r.error.includes('이 입찰 건의 담당자만 자료를 만들 수 있습니다'));
  // 실제 서버 400·404 의 detail 은 글자 하나다(BoardMaterialService.create)
  r = await mat.createMaterial(fake(400, { detail: '연도는 2000~2100 사이여야 합니다.' }), { bidCaseId: 'BC1', year: 1 });
  assert.strictEqual(r.error, '연도는 2000~2100 사이여야 합니다.');
  r = await mat.createMaterial(fake(400, { detail: '입찰 건을 지정하세요.' }), { bidCaseId: '', year: 2026 });
  assert.strictEqual(r.error, '입찰 건을 지정하세요.');
  r = await mat.createMaterial(fake(400, { detail: '   ' }), { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.error, '이사회 자료를 만들지 못했습니다. 입력을 확인해 주세요.');
  r = await mat.createMaterial(fake(400, { detail: X }), { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.error, X, '문구는 그대로 돌려주고 화면에서 esc 한다');
  assert.ok(!mat.newPanelHtml({ cases: [], np: { bc: 'B', year: 2026, error: r.error }, items: [], forms: [], nowYear: 2026 }).includes('<img'));
  r = await mat.createMaterial(fake(400, { detail: { code: 'UI_ID_REQUIRED', message: 'x' } }), { bidCaseId: 'BC1', year: 2026 });
  assert.ok(r.error.includes('화면 오류로 만들지 못했습니다'));
  r = await mat.createMaterial(fake(404, { detail: '입찰 건의 기관을 찾을 수 없습니다.' }), { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.error, '입찰 건을 찾지 못했습니다. 목록을 새로 고쳐 주세요.');
  assert.ok(!r.error.includes('양식'));
  r = await mat.createMaterial(NET, { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.error, mat.TEXT.NET);
  r = await mat.createMaterial(fake(500, null), { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.error, mat.TEXT.CREATE_FAIL);
  r = await mat.createMaterial(fake(201, { nope: 1 }), { bidCaseId: 'BC1', year: 2026 });
  assert.strictEqual(r.ok, false);
});

test('loadList·loadMaterial·loadSnaps·loadSnap·loadHistory: 감사 헤더(화면·버튼)와 실패 모양', async function () {
  const seen = [];
  let r = await mat.loadList(fake(200, { items: [item()], truncated: true }, seen), { status: 'DRAFT' });
  assert.strictEqual(seen[0].url, '/board-materials?status=DRAFT');
  assert.deepStrictEqual([seen[0].init.headers['X-Screen-Id'], seen[0].init.headers['X-Button-Id']], ['board_list', 'refresh']);
  assert.deepStrictEqual([r.ok, r.items.length, r.truncated], [true, 1, true]);
  assert.strictEqual((await mat.loadList(fake(500, null))).ok, false);
  assert.strictEqual((await mat.loadList(fake(200, { items: 'x' }))).ok, false);
  assert.strictEqual((await mat.loadList(NET)).error, mat.TEXT.NET);

  r = await mat.loadMaterial(fake(200, { material_id: 7, form: { tables: [] } }, seen), '7', 'board_list', 'open');
  assert.strictEqual(seen[1].url, '/board-materials/7');
  assert.deepStrictEqual([seen[1].init.headers['X-Screen-Id'], seen[1].init.headers['X-Button-Id']], ['board_list', 'open']);
  assert.strictEqual(r.ok, true);
  r = await mat.loadMaterial(fake(404, { detail: { code: 'NOT_FOUND' } }), '7', 'board_list', 'open');
  assert.deepStrictEqual([r.ok, r.notFound, r.error], [false, true, mat.TEXT.NOT_FOUND]);
  assert.strictEqual((await mat.loadMaterial(fake(200, {}), '../x', 'board_list', 'open')).notFound, true);   // 번호 모양이 아니면 요청도 안 보낸다
  assert.strictEqual((await mat.loadMaterial(fake(200, { foo: 1 }), '7', 'board_list', 'open')).ok, false);

  r = await mat.loadSnaps(fake(200, { material_id: 7, current_snap: 2, items: [{ snap_no: 2 }] }, seen), '7', mat.screenFor(false));
  assert.strictEqual(seen[2].url, '/board-materials/7/snapshots');
  assert.deepStrictEqual([seen[2].init.headers['X-Screen-Id'], seen[2].init.headers['X-Button-Id']], ['board_review', 'history_open']);
  r = await mat.loadSnap(fake(200, { snap_no: 2, tables: [] }, seen), '7', 2, mat.screenFor(true));
  assert.strictEqual(seen[3].url, '/board-materials/7/snapshots/2');
  assert.deepStrictEqual([seen[3].init.headers['X-Screen-Id'], seen[3].init.headers['X-Button-Id']], ['board_write', 'snapshot_open']);
  r = await mat.loadHistory(fake(200, [{ event_cd: 'CREATE' }], seen), '7', 'board_write');
  assert.strictEqual(seen[4].url, '/board-materials/7/history');
  assert.strictEqual(r.ok, true);
  const a = await mat.loadAssignments(fake(200, [{ bid_case_id: 'BC1' }, { bid_case_id: 'BC2' }]));
  assert.deepStrictEqual(a.ids, ['BC1', 'BC2']);
  assert.deepStrictEqual((await mat.loadAssignments(fake(500, null))).ids, []);
  assert.strictEqual((await mat.loadAssignments(fake(500, null))).ok, false, '실패는 ok:false 로 알린다(배정 없음과 구분)');
  assert.strictEqual(a.ok, true);
});

test('headHtml·tabsHtml·tabKey: 머리 문구, 값 esc, 020b 버튼 없음, roving tabindex', function () {
  const d = { material_id: 7, institution_name: X, year: 2026, status_cd: 'DRAFT', status_name: '작성 중', current_snap: 3,
    snapshot: { snap_no: 3, saved_by_name: '김영업', saved_at: '2026-11-07T01:12:00+00:00' },
    assignees: [{ emp_no: '1', name: X }], form: { name: '기본 양식' },
    viewer: { can_write: true, can_submit: true, can_withdraw: true, can_rework: true, can_set_result: true } };
  const h = mat.headHtml(d);
  assert.ok(h.includes('← 이사회 자료 목록') && h.includes('data-act="back"'));
  assert.ok(h.includes('버전 3 · 김영업 <span class="mono">11-07 10:12</span> 저장') && h.includes('양식 기본 양식'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img') && h.includes('2026년 이사회 자료'));
  assert.ok(!/제출|회수|재작성|의결/.test(h), '020b 버튼은 그리지 않는다');
  const none = mat.headHtml({ institution_name: '노원구', year: 2026, current_snap: 0 });
  assert.ok(none.includes('<span>저장 전</span>') && !none.includes('아직 저장한 버전이 없습니다'), '머리 meta 는 짧게, 문장은 본문에만');
  assert.ok(mat.tabsHtml('write', 0, false).includes('>작성</button>') && !mat.tabsHtml('write', 0, false).includes('>내용</button>'));
  assert.ok(mat.tabsHtml('write', 0, true).includes('>내용</button>') && !mat.tabsHtml('write', 0, true).includes('>작성</button>'), '영업부장 첫 탭은 내용');
  const t = mat.tabsHtml('ver', 3);
  assert.ok(t.includes('role="tablist"') && t.includes('버전 이력 3'));
  assert.ok(/id="bd-tab-ver"[^>]*aria-selected="true"[^>]*aria-controls="bd-m-hist"[^>]*tabindex="0"/.test(t));
  assert.ok(/id="bd-tab-write"[^>]*aria-selected="false"[^>]*aria-controls="bd-body"[^>]*tabindex="-1"/.test(t));
  assert.ok(!mat.tabsHtml('write', 0).includes('버전 이력 0'));
  assert.strictEqual(mat.tabKey('write', 'ArrowRight'), 'ver');
  assert.strictEqual(mat.tabKey('hist', 'ArrowRight'), 'write');
  assert.strictEqual(mat.tabKey('write', 'ArrowLeft'), 'hist');
  assert.strictEqual(mat.tabKey('ver', 'Home'), 'write');
  assert.strictEqual(mat.tabKey('ver', 'End'), 'hist');
  assert.strictEqual(mat.tabKey('ver', 'a'), null);
  assert.strictEqual(mat.savedLabel(d), '김영업 · 11-07 10:12');
  assert.strictEqual(mat.savedLabel({ snapshot: null }), '');
});

test('snapsHtml·snapViewHtml: 최신이 위, 현재 배지, aria-label, 메모·이름 esc', function () {
  const items = [{ snap_no: 1, note: X, saved_by_name: X, saved_at: '2026-11-06T07:40:00+00:00' }, { snap_no: 3, note: '', saved_by_name: '김영업', saved_at: '2026-11-07T01:12:00+00:00' }];
  const h = mat.snapsHtml(items, 3);
  assert.ok(h.indexOf('v3') < h.indexOf('v1'));
  assert.ok(h.includes('bd-badge is-ink bd-m-cur">현재') && h.includes('aria-label="버전 3 보기"'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(h.includes('<caption class="bd-sr">버전 이력 2개</caption>'));
  assert.ok(mat.snapsHtml([], 0).includes('아직 저장한 버전이 없습니다.'));
  const v = mat.snapViewHtml({ n: 3, snap: { note: X, saved_by_name: X, saved_at: '2026-11-07T01:12:00+00:00', form: { tables: [] }, tables: [] } });
  assert.ok(v.includes('버전 3 보기') && v.includes('읽기 전용') && v.includes('data-act="verlist"') && !v.includes('<img'));
});

test('histHtml·eventText: 문구, 자기신고 배지는 emp_verified:false 만, 값 esc', function () {
  assert.strictEqual(mat.eventText({ event_cd: 'CREATE' }), '자료를 만들었습니다(준비 중)');
  assert.strictEqual(mat.eventText({ event_cd: 'HANDOVER', from_name: 'A', to_name: 'B' }), '작성본 인계: A → B');
  assert.strictEqual(mat.eventText({ event_cd: 'REJECT', reason: '다시' }), '반려되었습니다: 다시');
  assert.strictEqual(mat.eventText({ event_cd: 'RESULT', from_result_name: '예정', to_result_name: '의결' }), '의결 결과: 예정 → 의결');
  assert.strictEqual(mat.eventText({ event_cd: 'ZZZ' }), '기록');
  const h = mat.histHtml([
    { event_cd: 'CREATE', actor_name: X, emp_verified: false, logged_at: '2026-11-06T07:40:00+00:00' },
    { event_cd: 'HANDOVER', from_name: 'A', to_name: X, actor_name: '관리자', emp_verified: true, logged_at: '2026-11-07T01:12:00+00:00' }]);
  assert.ok(!h.includes('<img') && h.includes('&lt;img') && h.includes('작성본 인계: A → &lt;img'));
  assert.strictEqual((h.match(/tm-selfrep/g) || []).length, 1);
  assert.ok(h.indexOf('작성본 인계') < h.indexOf('자료를 만들었습니다'), '최신이 위');
  assert.ok(mat.histHtml([]).includes('작업 이력이 없습니다.'));
});

test('readOnlyHtml: 저장한 값만 그림(서식·정렬), 예시 숫자 없음, 값 없는 칸 —, XSS, 값 없음·양식 없음 안내', function () {
  const form = { tables: [{ ref: 'A', mapping: 'A', title: X, unit: '억원', notes: [X], columns: [], rows: [
    [{ key: 'h', text: X, header: true }, { key: 'h2', text: '금액', header: true }],
    [{ key: 'k0', text: '예시행' }, { key: 'k1', text: '999', mapped: true }, { key: 'k2', text: '메모샘플', input: true }, { key: 'k3', text: '5', mapped: true }]] }] };
  const h = mat.readOnlyHtml(form, [{ ref: 'A', cells: { k1: '1234567.5', k2: X } }]);
  assert.ok(h.includes('1,234,567.5') && h.includes('bd-a-right bd-num'));
  assert.ok(!h.includes('999') && !h.includes('메모샘플') && !h.includes('>5<'));
  assert.ok(h.includes('<span class="dg-hint">—</span>'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(h.includes('(단위: 억원)'));
  assert.ok(mat.readOnlyHtml(form, []).includes('아직 저장한 버전이 없습니다.'));
  assert.ok(mat.readOnlyHtml(form, [{ ref: 'A', cells: {} }]).includes('아직 저장한 버전이 없습니다.'));
  assert.ok(mat.readOnlyHtml(null, [{ ref: 'A', cells: { k1: '1' } }]).includes('role="alert"'));
  assert.strictEqual(mat.fmtValue('-1234'), '-1,234');
  assert.strictEqual(mat.fmtValue('12a'), '12a');
  const ro = mat.writeRoHtml({ form: form, snapshot: { tables: [{ ref: 'A', cells: { k1: '1' } }] } }, true);
  assert.ok(ro.includes('영업부장은 이 자료를 읽기 전용으로 봅니다.'));
  assert.ok(!mat.writeRoHtml({ form: form, snapshot: null }, false).includes('영업부장은'));
});

test('board-material.js: 확인창·브라우저 저장소·원시 특수 코드포인트 없음, 020b 상수는 꺼짐', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-material.js'), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src));
  assert.ok(!/localStorage|sessionStorage/.test(src));
  [0x2028, 0x2029, 0xfffe, 0xffff].forEach(function (cp) { assert.ok(!src.includes(String.fromCharCode(cp)), cp.toString(16)); });
  assert.strictEqual(mat.PHASE_020B, false);
  assert.ok(!/innerHTML\s*\+=/.test(src));
});
