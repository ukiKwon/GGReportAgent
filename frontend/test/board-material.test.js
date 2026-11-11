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
  assert.ok(h.includes('data-act="submit-open"') && h.includes('>안건 제출</button>') && !/제출 회수|재작성 요구|의결 결과/.test(h), 'DRAFT 에서는 can_submit 버튼만(다른 can_* 는 상태가 안 맞아 그리지 않는다)');
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
  assert.strictEqual(mat.eventText({ event_cd: 'SUBMIT' }), '제출했습니다(결재 요청)');
  assert.strictEqual(mat.eventText({ event_cd: 'WITHDRAW' }), '제출을 회수했습니다(작성 중으로)');
  assert.strictEqual(mat.eventText({ event_cd: 'REJECT', reason: null }), '제출이 반려되었습니다(작성 중으로)');
  assert.strictEqual(mat.eventText({ event_cd: 'CONFIRM' }), '승인되어 확정되었습니다');
  assert.strictEqual(mat.eventText({ event_cd: 'REWORK', from_status: 'SUBMITTED', reason: '수치 재확인' }), '재작성 요구: 수치 재확인');
  assert.strictEqual(mat.eventText({ event_cd: 'REWORK', from_status: 'CONFIRMED', from_result_name: '가결', reason: '기준 변경' }), '재작성 요구(확정 해제, 의결 결과 가결 지움): 기준 변경');
  assert.strictEqual(mat.eventText({ event_cd: 'REWORK', from_status: 'CONFIRMED' }), '재작성 요구(확정 해제)');
  assert.strictEqual(mat.eventText({ event_cd: 'RESULT', from_result_name: '의결 예정', to_result_name: '가결', meeting_date: '2026-12-03' }), '의결 결과: 의결 예정 → 가결 · 개최일 2026-12-03');
  assert.strictEqual(mat.eventText({ event_cd: 'RESULT', to_result_name: '의결 예정' }), '의결 결과: 없음 → 의결 예정');
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

test('board-material.js: 확인창·브라우저 저장소·원시 특수 코드포인트 없음, 020b 상수는 켜짐', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-material.js'), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src));
  assert.ok(!/localStorage|sessionStorage/.test(src));
  [0x2028, 0x2029, 0xfffe, 0xffff].forEach(function (cp) { assert.ok(!src.includes(String.fromCharCode(cp)), cp.toString(16)); });
  assert.strictEqual(mat.PHASE_020B, true);
  assert.ok(!/innerHTML\s*\+=/.test(src));
});

// ── 020b: 제출·회수·의결 결과·재작성 요구·결재자 검토 ──
test('screenFor: 담당자(is_assignee)는 board_write, 그 밖은 board_review', function () {
  assert.strictEqual(mat.screenFor(true), 'board_write');
  assert.strictEqual(mat.screenFor(false), 'board_review');
  assert.strictEqual(mat.screenFor(undefined), 'board_review');
});

test('headActsHtml: 상태·viewer 플래그대로 버튼, 수정이 남으면 제출은 틸 아님, PREP 는 disabled', function () {
  const v = function (o) { return Object.assign({ is_assignee: true, can_write: true, can_submit: true, can_withdraw: false, can_set_result: false, can_rework: false }, o || {}); };
  const draft = mat.headActsHtml({ status_cd: 'DRAFT', viewer: v() }, { dirty: 0 });
  assert.ok(draft.includes('bd-wb-main') && draft.includes('>안건 제출</button>'));
  assert.ok(!mat.headActsHtml({ status_cd: 'DRAFT', viewer: v() }, { dirty: 2 }).includes('bd-wb-main'));
  const prep = mat.headActsHtml({ status_cd: 'PREP', viewer: v({ can_submit: false }) }, {});
  assert.ok(/id="bd-m-submit"[^>]* disabled/.test(prep) && prep.includes('버전을 한 번 저장해야 제출할 수 있습니다.'));
  assert.ok(mat.headActsHtml({ status_cd: 'SUBMITTED', viewer: v({ can_write: false, can_submit: false, can_withdraw: true }) }, {}).includes('>제출 회수</button>'));
  assert.ok(mat.headActsHtml({ status_cd: 'SUBMITTED', viewer: v({ can_withdraw: true }) }, { busy: 'withdraw' }).includes('회수하는 중…'));
  const conf = mat.headActsHtml({ status_cd: 'CONFIRMED', result_cd: 'PASSED', viewer: v({ can_set_result: true, can_rework: true }) }, {});
  assert.ok(conf.includes('의결 결과 바꾸기') && conf.includes('재작성 요구'));
  assert.ok(mat.headActsHtml({ status_cd: 'CONFIRMED', result_cd: null, viewer: v({ can_set_result: true }) }, {}).includes('의결 결과 입력'));
  assert.strictEqual(mat.headActsHtml({ status_cd: 'DRAFT', viewer: { can_submit: false } }, {}), '');
});

test('headMainOn: 틸은 한 번에 하나 — 수정이 남았거나 제출 확인 줄이 열렸으면 머리 [안건 제출]은 틸 아님', function () {
  const v = { is_assignee: true, can_write: true, can_submit: true };
  assert.strictEqual(mat.headMainOn('', 0), true);
  assert.strictEqual(mat.headMainOn('', 1), false);
  assert.strictEqual(mat.headMainOn('submit', 0), false);
  assert.strictEqual(mat.headMainOn('result', 0), true);
  assert.ok(!mat.headActsHtml({ status_cd: 'DRAFT', viewer: v }, { open: 'submit', dirty: 0 }).includes('bd-wb-main'));
  assert.ok(mat.submitRowHtml({ n: 6, dirty: 0 }).includes('id="bd-m-subok" class="bd-wb-main"'));
});

test('resultRowHtml·reworkModalHtml: 오류가 없으면 aria-invalid·오류 문구가 없다(고치면 지우는 화면과 같은 모양)', function () {
  const rr = mat.resultRowHtml({}, { result: 'PASSED', date: '2026-12-03' });
  assert.ok(!rr.includes('aria-invalid') && !rr.includes('bd-m-ferr'));
  const m = mat.reworkModalHtml({ status_cd: 'SUBMITTED' }, { reason: '다시' });
  assert.ok(!m.includes('aria-invalid') && !m.includes('bd-m-rw-err'));
  assert.ok(mat.reworkModalHtml({ status_cd: 'SUBMITTED' }, { reason: '다시', error: '오류' }).includes('aria-describedby="bd-m-rw-err"'));
});

test('returnHtml·lockHtml·submitRowHtml: 반환 배너(사유 null 문구, esc), 잠금 줄 문구, 제출 확인 줄', function () {
  const r = mat.returnHtml({ status_cd: 'DRAFT', viewer: { is_assignee: true }, last_return: { event_cd: 'REJECT', reason: X, actor_name: X, logged_at: '2026-11-11T00:58:00+00:00' } });
  assert.ok(r.includes('제출이 반려되었습니다.') && !r.includes('<img') && r.includes('&lt;img') && r.includes('고친 뒤 [버전 저장]을 하고 다시 제출해 주세요.'));
  assert.ok(mat.returnHtml({ status_cd: 'DRAFT', viewer: {}, last_return: { event_cd: 'REWORK', reason: null } }).includes('사유는 개인정보로 보이는 내용이 있어 표시하지 않습니다.'));
  assert.strictEqual(mat.returnHtml({ status_cd: 'SUBMITTED', last_return: { event_cd: 'REJECT' } }), '');
  assert.ok(mat.lockHtml({ status_cd: 'SUBMITTED', current_snap: 6, viewer: { is_assignee: true, can_write: false } }).includes('버전 6을 제출해 결재 중입니다.'));
  assert.ok(mat.lockHtml({ status_cd: 'CONFIRMED', confirmed_snap: 6, viewer: { is_assignee: false, can_write: false } }).includes('[재작성 요구]로 작성 중으로 돌려보냅니다.'));
  assert.strictEqual(mat.lockHtml({ status_cd: 'DRAFT', viewer: { can_write: true } }), '');
  const s = mat.submitRowHtml({ n: 6, dirty: 0, unchecked: 2 });
  assert.ok(s.includes('버전 6 안건 제출') && s.includes('확인 안 한 표 2개(제출은 막지 않습니다)'));
  assert.ok(mat.submitRowHtml({ n: 6, dirty: 3 }).includes('저장하지 않은 수정 3칸은 제출되지 않습니다.') && !mat.submitRowHtml({ n: 6, dirty: 3 }).includes('data-act="sub-ok"'));
  assert.ok(mat.submitRowHtml({ n: 6, busy: true }).includes('제출하는 중…'));
});

test('actError·okText: 코드별 문구와 오류 위치(칸/상자)', function () {
  const e = function (status, code, msg) { return { status: status, body: { detail: code ? { code: code, message: msg || '' } : (msg || '') } }; };
  assert.strictEqual(mat.actError('submit', e(409, 'ALREADY_SUBMITTED')).title, '다른 담당자가 이미 제출했습니다.');
  assert.strictEqual(mat.actError('submit', e(409, 'NO_SNAPSHOT')).btns.length, 0);
  assert.strictEqual(mat.actError('submit', e(403)).btns[0][0], 'back');
  assert.strictEqual(mat.actError('submit', { net: true, status: 0 }).btns[0][0], 'refresh');
  assert.strictEqual(mat.actError('submit', e(400, 'UI_ID_REQUIRED')).title, '화면 오류로 처리하지 못했습니다.');
  const d = mat.actError('result', e(400, 'MEETING_DATE_REQUIRED'));
  assert.ok(d.type === 'field' && d.field === 'date' && d.text === '개최일을 입력해 주세요.');
  assert.ok(mat.actError('rework', e(422)).type === 'field' && mat.actError('rework', e(400)).field === 'reason');
  assert.strictEqual(mat.actError('rework', e(409, 'NOT_APPLICABLE')).type, 'box');
  assert.strictEqual(mat.actError('decide', e(409, 'APPROVER_ROLE_MISMATCH')).title, '영업팀장이 관련된 제출이라 영업부장만 승인할 수 있습니다.');
  assert.strictEqual(mat.actError('decide', e(422)).field, 'comment');
  assert.strictEqual(mat.actError('decide', e(404)).btns[0][0], 'inbox');
  assert.strictEqual(mat.okText('submit', { payload: { snap_no: 7 }, steps: [{ approver_name: '이영업' }] }, { seen: 6 }),
    '버전 7을 제출했습니다. 이영업이(가) 결재합니다. 화면에서 본 버전 6 뒤에 저장된 버전입니다. [버전 이력]에서 확인해 주세요.');
  assert.ok(!mat.okText('submit', { payload: { snap_no: 6 }, steps: [] }, { seen: 6 }).includes('뒤에 저장된'));
  assert.strictEqual(mat.okText('result', { result_cd: 'PASSED' }), "의결 결과를 '가결'(으)로 저장했습니다.");
});

test('actCall·loadReview: 화면·버튼 헤더, 본문(제출은 없음)', async function () {
  const seen = [];
  await mat.actCall(fake(201, {}, seen), 'submit', '7');
  assert.strictEqual(seen[0].url, '/board-materials/7/submit');
  assert.deepStrictEqual(seen[0].init.headers, { 'X-Screen-Id': 'board_write', 'X-Button-Id': 'submit' });
  assert.strictEqual(seen[0].init.body, undefined);
  await mat.actCall(fake(200, {}, seen), 'rework', '7', { reason: ' 다시 ' });
  assert.strictEqual(seen[1].init.headers['X-Screen-Id'], 'board_review');
  assert.strictEqual(seen[1].init.headers['X-Button-Id'], 'rework');
  assert.deepStrictEqual(JSON.parse(seen[1].init.body), { reason: '다시' });
  await mat.actCall(fake(200, {}, seen), 'result', '7', { result: 'SCHEDULED', date: '2026-12-03' });
  assert.deepStrictEqual(JSON.parse(seen[2].init.body), { result: 'SCHEDULED', meeting_date: '2026-12-03' });
  const r = await mat.loadReview(fake(200, { material_id: 7, status_cd: 'SUBMITTED' }, seen), '7');
  assert.ok(r.ok);
  assert.strictEqual(seen[3].url, '/board-materials/7/review');
  assert.deepStrictEqual(seen[3].init.headers, { 'X-Screen-Id': 'approvals_inbox', 'X-Button-Id': 'review_open' });
  assert.strictEqual((await mat.actCall(NET, 'withdraw', '7')).net, true);
  assert.strictEqual((await mat.actCall(fake(200, {}), 'submit', 'x1')).status, 404, '번호 모양이 아니면 보내지 않는다');
});

test('lockHtml: 확정일 때만 확정본 워드 버튼(기본 버튼), 내려받는 중·오류 표시', function () {
  const conf = { status_cd: 'CONFIRMED', confirmed_snap: 6, viewer: { is_assignee: false, can_write: false } };
  const h = mat.lockHtml(conf);
  assert.ok(h.includes('id="bd-m-dl"') && h.includes('data-act="confirmed-docx"') && h.includes('확정본 워드 내려받기') && !h.includes('bd-wb-main'));
  assert.ok(/id="bd-m-dl"[^>]* disabled/.test(mat.lockHtml(conf, { dlBusy: true })) && mat.lockHtml(conf, { dlBusy: true }).includes('내려받는 중…'));
  const e = mat.lockHtml(conf, { dlError: '<img>' });
  assert.ok(e.includes('id="bd-m-dlerr"') && e.includes('role="alert"') && e.includes('&lt;img&gt;'));
  assert.ok(!mat.lockHtml({ status_cd: 'SUBMITTED', viewer: { can_write: false } }).includes('bd-m-dl'));
});

test('docxFileName·docxError: 파일 이름은 filename*, 없으면 기본 이름 / 오류 문구', function () {
  assert.strictEqual(mat.docxFileName("attachment; filename=\"board_confirmed.docx\"; filename*=UTF-8''%EB%85%B8%EC%9B%90-2026-v1.docx"), '노원-2026-v1.docx');
  assert.strictEqual(mat.docxFileName('attachment'), '이사회자료-확정본.docx');
  assert.strictEqual(mat.docxFileName("attachment; filename*=UTF-8''%E0%A4%A"), '이사회자료-확정본.docx');
  assert.ok(!mat.docxFileName("attachment; filename*=UTF-8''..%2F..%2Fa.docx").includes('/'));
  const e = function (status, code) { return { status: status, body: { detail: code ? { code: code } : 'x' } }; };
  assert.strictEqual(mat.docxError(e(404)), '이 이사회 자료를 찾을 수 없습니다. 담당에서 빠졌거나 없는 자료입니다.');
  assert.strictEqual(mat.docxError(e(409, 'NOT_CONFIRMED')), '확정된 자료만 확정본을 내려받을 수 있습니다. 새로 고쳐 상태를 확인해 주세요.');
  assert.strictEqual(mat.docxError(e(400, 'UI_ID_REQUIRED')), '화면 오류로 처리하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.');
  assert.strictEqual(mat.docxError(e(500)), '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  assert.strictEqual(mat.docxError({ net: true, status: 0 }), '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
});

test('downloadConfirmed: GET confirmed-docx, 화면·버튼 헤더, blob·파일 이름 / 오류는 reject 하지 않는다', async function () {
  const seen = [];
  const ok = function (url, init) {
    seen.push({ url: url, init: init });
    return Promise.resolve({ ok: true, status: 200, headers: { get: function () { return "attachment; filename*=UTF-8''a%20b.docx"; } }, blob: function () { return Promise.resolve('BLOB'); } });
  };
  const r = await mat.downloadConfirmed(ok, '7', mat.screenFor(true));
  assert.deepStrictEqual(r, { ok: true, blob: 'BLOB', fileName: 'a b.docx' });
  assert.strictEqual(seen[0].url, '/board-materials/7/confirmed-docx');
  assert.deepStrictEqual(seen[0].init.headers, { 'X-Screen-Id': 'board_write', 'X-Button-Id': 'confirmed_docx' });
  const f = await mat.downloadConfirmed(fake(409, { detail: { code: 'NOT_CONFIRMED' } }), '7', 'board_review');
  assert.ok(!f.ok && f.status === 409 && f.error.includes('확정된 자료만'));
  assert.ok(!(await mat.downloadConfirmed(NET, '7', 'board_review')).ok);
  assert.strictEqual((await mat.downloadConfirmed(ok, 'x1', 'board_review')).status, 404);
});

test('reworkModalHtml·resultRowHtml·reviewHtml: 접근성 속성, 확정 경고, esc, 결재 줄', function () {
  const conf = { institution_name: X, year: 2026, status_cd: 'CONFIRMED', result_cd: 'PASSED', meeting_date: '2026-12-03' };
  const m = mat.reworkModalHtml(conf, { reason: X });
  assert.ok(m.includes('role="dialog"') && m.includes('aria-modal="true"') && m.includes('aria-describedby="bd-m-rw-desc"'));
  assert.ok(m.includes('의결 결과 \'가결\'과 개최일(2026-12-03)이 지워집니다.') &&m.includes('확정 풀고 재작성 요구') && !m.includes('<img'));
  assert.ok(/id="bd-m-rw-ok"[^>]* disabled/.test(mat.reworkModalHtml({ status_cd: 'SUBMITTED' }, { reason: '  ' })));
  const rr = mat.resultRowHtml(conf, { result: 'SCHEDULED', date: '', error: '의결 예정이면 개최일을 입력해 주세요.', errField: 'date' });
  assert.ok(rr.includes('aria-invalid="true"') && rr.includes('(필수)') && rr.includes('role="alert"'));
  ['SCHEDULED', 'PASSED', 'REJECTED'].forEach(function (r) {
    const h = mat.resultRowHtml(conf, { result: r, date: '' });
    assert.ok(h.includes('(필수)') && !h.includes('(선택)'), '개최일은 결과와 관계없이 필수: ' + r);
    assert.ok(/id="bd-m-mdate"[^>]* required aria-required="true"/.test(h), '개최일 input required: ' + r);
  });
  // 결과 배지: 가결·부결·의결 예정 모두 개최일(MM-DD)을 붙인다
  const badge = function (r, n) { return mat.resultBadgeHtml({ status_cd: 'CONFIRMED', result_cd: r, result_name: n, meeting_date: '2026-12-03' }); };
  assert.ok(badge('PASSED').includes('가결 · <span class="mono">12-03</span>'));
  assert.ok(badge('REJECTED').includes('부결 · <span class="mono">12-03</span>'));
  assert.ok(badge('SCHEDULED').includes('의결 예정 · <span class="mono">12-03</span>'));
  assert.ok(!mat.resultBadgeHtml({ status_cd: 'CONFIRMED', result_cd: 'PASSED' }).includes('·'));
  assert.strictEqual(mat.resultBadgeHtml({ status_cd: 'SUBMITTED', result_cd: 'PASSED', meeting_date: '2026-12-03' }), '');
  const d = { material_id: 7, institution_name: X, year: 2026, status_cd: 'SUBMITTED', status_name: '제출(결재 중)', current_snap: 6, assignees: [{ name: X }],
    form: { tables: [] }, snapshot: { snap_no: 6, saved_by_name: X, saved_at: '2026-11-11T01:42:00+00:00', tables: [] } };
  const h = mat.reviewHtml(d, { n: 6, canDecide: true, comment: X });
  assert.ok(h.includes('for="ap-rv-comment"') && h.includes('data-act="rv-approve"') && h.includes('data-act="rv-reject"') && h.includes('승인하면 버전 6이 확정되고'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  const g = mat.reviewHtml(d, { n: 6, canDecide: false });
  assert.ok(!g.includes('rv-approve') && g.includes('이 제출은 지금 결재할 수 없습니다.') && g.includes('결재함으로'));
});

// ── 숫자 칸 표시·해석(020a): 서버 BoardDocSpec.display 와 같은 규칙 ──
function fc(over) { return Object.assign({ key: 'r1_c2', text: '', mapped: true, input: false, unit: '', paren: false, sub_key: null, dec: 2 }, over || {}); }

test('fmtOf: 새 필드가 없는 칸(옛 서버)·가공할 것이 없는 칸·직접 입력 칸은 null', function () {
  assert.strictEqual(mat.fmtOf({ key: 'k', text: '1', mapped: true }), null);
  assert.strictEqual(mat.fmtOf(fc({ dec: null })), null);
  assert.strictEqual(mat.fmtOf({ key: 'r1_c0', input: true, mapped: false, unit: '', paren: false, dec: null }), null);
  assert.strictEqual(mat.fmtOf(fc({ input: true, mapped: false })), null, '직접 입력 칸은 숫자로 읽지 않는다');
  assert.strictEqual(mat.fmtOf(null), null);
  assert.strictEqual(mat.fmtOf(fc({ dec: -1 })), null, '/board-docs 는 dec 없음을 -1 로 보낸다');
  assert.deepStrictEqual(mat.fmtOf(fc({ dec: -1, unit: '년' })), { dec: null, unit: '년', paren: false, subKey: null });
  assert.deepStrictEqual(mat.fmtOf(fc()), { dec: 2, unit: '', paren: false, subKey: null });
  assert.deepStrictEqual(mat.fmtOf(fc({ key: 'r1_c5', paren: true, sub_key: 'r1_c5_p' })), { dec: 2, unit: '', paren: true, subKey: 'r1_c5_p' });
  assert.deepStrictEqual(mat.fmtOf(fc({ unit: '년', dec: null })), { dec: null, unit: '년', paren: false, subKey: null });
});

test('display: dec 2 고정·천 단위 쉼표·음수, 단위는 숫자 뒤, 숫자가 아니면 그대로(단위도 안 붙임)', function () {
  const d2 = fc();
  assert.strictEqual(mat.display(d2, '1234.5'), '1,234.50');
  assert.strictEqual(mat.display(d2, '-0.1'), '-0.10');
  assert.strictEqual(mat.display(d2, '5'), '5.00');
  assert.strictEqual(mat.display(d2, '1,234'), '1,234.00');
  assert.strictEqual(mat.display(d2, '-0'), '0.00', '반올림 뒤 0 은 부호 없음');
  assert.strictEqual(mat.display(d2, ''), '');
  assert.strictEqual(mat.display(d2, '5.00 (1.00)'), '5.00 (1.00)', '옛 초안 모양은 그대로');
  assert.strictEqual(mat.display(d2, '해당없음'), '해당없음');
  assert.strictEqual(mat.display(fc({ unit: '년', dec: null }), '3.4'), '3.4년');
  assert.strictEqual(mat.display(fc({ unit: '%', dec: null }), '0.74'), '0.74%');
  assert.strictEqual(mat.display(fc({ unit: '년', dec: null }), '3.4개월'), '3.4개월', '숫자가 아니면 단위를 붙이지 않는다');
  assert.strictEqual(mat.display({ key: 'k', mapped: true, text: '1' }, '1234.5'), '1234.5', '새 필드가 없는 칸은 가공 없음');
  const p = fc({ key: 'r1_c5', paren: true, sub_key: 'r1_c5_p' });
  assert.strictEqual(mat.display(p, '5', '1'), '5.00 (1.00)');
  assert.strictEqual(mat.display(p, '5', ''), '5.00');
  assert.strictEqual(mat.display(p, '', ''), '');
  assert.strictEqual(mat.display(p, '4.4'), '4.40');
  assert.deepStrictEqual(mat.displayParts(p, '5', '1'), { main: '5.00', sub: '1.00', paren: true });
  assert.deepStrictEqual(mat.displayParts(d2, '5', '1'), { main: '5.00', sub: '', paren: false });
});

test('parseCell: 단위 떼기·△·▲·(n)·쉼표·공백, 괄호 칸은 "앞 (괄호안)" 나눔, 다른 단위는 ok=false', function () {
  const yr = fc({ unit: '년', dec: null }), pc = fc({ unit: '%', dec: null }), d2 = fc(), p = fc({ key: 'r1_c5', paren: true, sub_key: 'r1_c5_p' });
  assert.deepStrictEqual(mat.parseCell(yr, '3.4년'), { main: '3.4', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(yr, ' 3.4 년 '), { main: '3.4', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(pc, '0.74%'), { main: '0.74', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(yr, '3.4'), { main: '3.4', sub: '', ok: true });
  assert.strictEqual(mat.parseCell(yr, '3.4%').ok, false, '다른 단위');
  assert.strictEqual(mat.parseCell(yr, '3.4개월').ok, false);
  assert.strictEqual(mat.parseCell(d2, '3.4년').ok, false, '단위가 없는 칸에 단위가 붙으면 문제');
  assert.deepStrictEqual(mat.parseCell(yr, '3.4%'), { main: '3.4%', sub: '', ok: false }, '실패하면 입력 글자 그대로');
  assert.deepStrictEqual(mat.parseCell(d2, '1,234.5'), { main: '1234.5', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(d2, '△1,234'), { main: '-1234', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(d2, '▲5'), { main: '-5', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(d2, '(1,234)'), { main: '-1234', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(d2, '-7'), { main: '-7', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(d2, '1 234'), { main: '1234', sub: '', ok: true }, 'NBSP');
  assert.deepStrictEqual(mat.parseCell(d2, ''), { main: '', sub: '', ok: true });
  assert.strictEqual(mat.parseCell(d2, '12a').ok, false);
  assert.strictEqual(mat.parseCell(d2, '5 (1)').ok, false, '괄호 칸이 아니면 나누지 않는다');
  assert.deepStrictEqual(mat.parseCell(p, '5.00 (1.00)'), { main: '5.00', sub: '1.00', ok: true });
  assert.deepStrictEqual(mat.parseCell(p, '1,234.5(△2)'), { main: '1234.5', sub: '-2', ok: true });
  assert.deepStrictEqual(mat.parseCell(p, '5'), { main: '5', sub: '', ok: true });
  assert.deepStrictEqual(mat.parseCell(p, '5 ()'), { main: '5', sub: '', ok: true });
  assert.strictEqual(mat.parseCell(p, '5 (x)').ok, false);
  assert.deepStrictEqual(mat.parseCell({ key: 'k', text: '' }, ' 글자 '), { main: '글자', sub: '', ok: true }, '숫자 칸이 아니면 그대로');
});

test('readOnlyHtml: 새 필드가 있는 칸은 양식 표시 규칙(소수 2자리·단위·괄호)으로, 괄호 안만 있어도 보임', function () {
  const form = { tables: [{ ref: 'B', mapping: 'B', title: 't', columns: [], rows: [
    [{ key: 'h', text: '구분', header: true }, { key: 'h2', text: '값', header: true }],
    [fc({ key: 'r1_c1' }), fc({ key: 'r1_c5', paren: true, sub_key: 'r1_c5_p' }), fc({ key: 'r1_c6', unit: '년', dec: null }), fc({ key: 'r1_c7' })]] }] };
  const h = mat.readOnlyHtml(form, [{ ref: 'B', cells: { r1_c1: '1234.5', r1_c5: '5', r1_c5_p: '1', r1_c6: '3.4' } }]);
  assert.ok(h.includes('1,234.50') && h.includes('5.00 (1.00)') && h.includes('3.4년'));
  assert.ok(h.includes('<span class="dg-hint">—</span>'), '값 없는 칸');
  const only = mat.readOnlyHtml(form, [{ ref: 'B', cells: { r1_c5_p: '2' } }]);
  assert.ok(only.includes('(2.00)'));
});
