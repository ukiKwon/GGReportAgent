'use strict';
// 기관 정보 요약 양식 작성 창(js/instsummary.js, NEXT 100 S2) — 순수 함수·요청 머리글·소스 규칙.
// 규격: handoff/agents/design-reviewer/2026-11-23_1257_a78d8d68.md 6-0~6-12.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const isn = require('../js/instsummary.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'instsummary.js'), 'utf8');
const strip = function (s) { return s.replace(/\/\/.*$/gm, ''); };   // 줄 주석 제외

function key(k, kind, label, o) { return Object.assign({ key: k, kind: kind, label: label, required: false, max_len: 0, max_items: 0, fix_screen: null }, o || {}); }
const KEYS = [
  key('inst_name', 'FACT', '기관명', { required: true, fix_screen: 'inst_edit' }),
  key('inst_type', 'FACT', '기관 형태', { fix_screen: 'inst_edit' }),
  key('head_name', 'FACT', '기관장', { required: true, fix_screen: 'head_card' }),
  key('current_bank', 'FACT', '현 거래 은행', { fix_screen: 'bank_contract' }),
  key('bid_kind', 'TEXT', '공고명(입찰 종류)', { required: true, max_len: 40 }),
  key('budget', 'TEXT', '예산', { max_len: 60 }),
  key('staff', 'TEXT', '임직원 수', { max_len: 40 }),
  key('supervisor', 'TEXT', '주무기관', { max_len: 60 }),
  key('address', 'TEXT', '소재지', { max_len: 100 }),
  key('org_note', 'TEXT', '조직현황', { max_len: 300 }),
  key('overview', 'LIST', '추진 배경(현황)', { required: true, max_len: 300, max_items: 10 }),
  key('mmda_basis', 'LIST', 'MMDA 예상 평잔 산정 기준', { max_len: 300, max_items: 10 }),
  key('competition', 'LIST', '경쟁은행 동향 및 중점 제안 사항', { max_len: 300, max_items: 10 }),
  key('biz', 'TABLE', '기관 주요 사업', { max_items: 40 }),
  key('fund', 'TABLE', '예산 운영 방식', { max_items: 10 }),
  key('years', 'TABLE', '연도별 예상 평잔·자금수익'),
];
const EFFECT = key('effect', 'LIST', '우리 회사 기대효과', { max_len: 300, max_items: 10 });
function tplOf(withEffect) { return { tpl_ver: 1, keys: withEffect ? KEYS.concat([EFFECT]) : KEYS }; }

function contentOf() {
  return {
    v: 1, form: 'INST_SUMMARY', tpl_ver: 1,
    fields: {
      inst_name: { val: '노원구청', src: { title: '기관 기본 정보', checked_on: '2026-11-20', url: null } },
      inst_type: { val: '구청', src: {} }, head_name: { val: '홍길동', src: {} }, current_bank: { val: null, src: null },
      bid_kind: { val: '주거래은행 선정', note: null }, budget: { val: '2조 1,000억원', note: '2026 예산서 3쪽' },
      staff: { val: null, note: null }, supervisor: { val: null, note: null }, address: { val: null, note: null }, org_note: { val: null, note: null },
    },
    lists: { overview: ['1988년 설립'], mmda_basis: [], competition: [] },
    tables: {
      biz: { src: { title: '기관 사업계획', checked_on: '2026-10-30' }, dropped: 0, rows: [{ group: '(A) 복지', sub: '노인 돌봄', lines: ['- 돌봄 대상 확대'] }] },
      fund: { rows: [{ kind: '예산', lines: [{ lv: 0, text: '본예산 기준' }, { lv: 1, text: '추경 제외' }] }] },
      years: { unit: '억원', from: 2028, to: 2033, end: 2032, mmda: { '2028': '100' }, income: { '2028': '3.5' }, notes: ['추정치'] },
    },
  };
}
function viewOf(o) {
  return Object.assign({
    bid_case_id: 'B1', form_cd: 'INST_SUMMARY', state_cd: 'IN_PROGRESS', tpl: tplOf(false), cur_ver: 3, kind_cd: 'DRAFT',
    saved_by_name: '김영업', saved_at: '2026-11-23T14:02:00+09:00', content: contentOf(), confirmed: null,
    stale_keys: [], sources_missing: [], seed_notices: [], confirmed_changed_keys: [],
    viewer: { can_edit: true, can_confirm: true, can_unconfirm: false, can_download: true, lock_reason: null },
  }, o || {});
}

// ── 여러 줄 붙여넣기 ──
test('stripBullet: 글머리(ㅇ·○·•··, 뒤에 공백 있는 하이픈)만 지우고 글자 하이픈은 지킨다', function () {
  assert.strictEqual(isn.stripBullet('ㅇ 돌봄'), '돌봄');
  assert.strictEqual(isn.stripBullet('  • 한 줄'), '한 줄');
  assert.strictEqual(isn.stripBullet('- 급식'), '급식');
  assert.strictEqual(isn.stripBullet('ㅇ - 둘'), '둘');
  assert.strictEqual(isn.stripBullet('-3% 감소'), '-3% 감소');
  assert.strictEqual(isn.stripBullet('일반 글'), '일반 글');
});
test('splitPaste: 줄 나눔·앞머리·빈 줄 정리, 한도 밖은 개수만 센다', function () {
  const r = isn.splitPaste('ㅇ 가\r\n\r\n- 나\n·다\n라', 3);
  assert.deepStrictEqual(r, { lines: ['가', '나', '다'], dropped: 1 });
  assert.strictEqual(isn.splitPaste('a\nb', 10).lines.length, 2);
  assert.deepStrictEqual(isn.splitPaste('a\nb\nc', 0), { lines: [], dropped: 3 });
  assert.deepStrictEqual(isn.splitPaste('   \n\n', 5), { lines: [], dropped: 0 });
  assert.deepStrictEqual(isn.splitPaste('가\t나', 5).lines, ['가 나']);
});
test('pasteInto: 지금 줄이 비면 그 줄부터, 차 있으면 아래에, 한도를 넘으면 자른다', function () {
  const a1 = ['a', ''];
  assert.deepStrictEqual(isn.pasteInto(a1, 1, 'x\ny', 5), { last: 2, dropped: 0, added: 2 });
  assert.deepStrictEqual(a1, ['a', 'x', 'y']);
  const a2 = ['a', 'b'];
  assert.strictEqual(isn.pasteInto(a2, 0, 'x\ny', 5).last, 2);
  assert.deepStrictEqual(a2, ['a', 'x', 'y', 'b']);
  const a3 = ['a'];
  const r = isn.pasteInto(a3, 0, 'x\ny\nz', 3);
  assert.strictEqual(r.added, 2); assert.strictEqual(r.dropped, 1);
  assert.deepStrictEqual(a3, ['a', 'x', 'y']);
  const full = ['a', 'b', 'c'];
  assert.strictEqual(isn.pasteInto(full, 2, 'x\ny', 3).added, 0);
  assert.deepStrictEqual(full, ['a', 'b', 'c']);
});

// ── 숫자 칸 ──
test('cleanAmount·amountBad: 쉼표·공백을 지우고 정규식(-?13자리(.3자리))으로 본다', function () {
  assert.strictEqual(isn.cleanAmount(' 12,345.6 '), '12345.6');
  assert.strictEqual(isn.cleanAmount('1，000'), '1000');
  assert.strictEqual(isn.amountBad('12,345'), false);
  assert.strictEqual(isn.amountBad(''), false);
  assert.strictEqual(isn.amountBad('-3.5'), false);
  assert.strictEqual(isn.amountBad('3.1234'), true);
  assert.strictEqual(isn.amountBad('12억'), true);
  assert.strictEqual(isn.amountBad('12345678901234'), true);
});

// ── 연도 표 ──
test('yearCols: 범위·열 수 검사 + 연도 목록', function () {
  assert.deepStrictEqual(isn.yearCols({ from: '2028', to: '2030' }).years, [2028, 2029, 2030]);
  assert.strictEqual(isn.yearCols({ from: '2033', to: '2028' }).ok, false);
  assert.strictEqual(isn.yearCols({ from: '2028', to: '2038' }).ok, false);   // 11열
  assert.strictEqual(isn.yearCols({ from: '2028', to: '2037' }).ok, true);    // 10열
  assert.strictEqual(isn.yearCols({ from: '1999', to: '2030' }).id, 'from');
  assert.strictEqual(isn.yearCols({ from: '2028', to: '' }).id, 'to');
  assert.strictEqual(isn.yearCols(null).ok, false);
});
test('clipYears·outText: 범위 밖 연도의 값은 빼고 개수를 센다', function () {
  const y = { from: '2028', to: '2029', mmda: { '2027': '1', '2028': '2', '2030': '' }, income: { '2027': '5', '2029': '3' } };
  const c = isn.clipYears(y);
  assert.deepStrictEqual(c.values, { mmda: { '2028': '2' }, income: { '2029': '3' } });
  assert.deepStrictEqual(c.removed, { '2027': 2 });
  assert.strictEqual(isn.outText(c.removed), '2027년 값 2개는 범위 밖이라 저장하지 않습니다.');
  assert.strictEqual(isn.outText({}), '');
  assert.deepStrictEqual(isn.clipYears({ from: '2030', to: '2028', mmda: { '2029': '1' } }).removed, {});   // 범위가 잘못이면 세지 않는다
});

// ── 본문 조립 ──
test('modelFromView → buildBody: 사실 칸·biz.src·dropped 는 보내지 않고, 칸 지도의 TEXT·LIST 만 보낸다', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  const b = isn.buildBody(m, v.tpl, 3);
  assert.strictEqual(b.base_ver, 3);
  assert.deepStrictEqual(Object.keys(b.fields).sort(), ['address', 'bid_kind', 'budget', 'org_note', 'staff', 'supervisor']);
  assert.deepStrictEqual(b.fields.budget, { val: '2조 1,000억원', note: '2026 예산서 3쪽' });
  assert.deepStrictEqual(b.fields.staff, { val: null, note: null });
  assert.deepStrictEqual(Object.keys(b.lists).sort(), ['competition', 'mmda_basis', 'overview']);
  assert.deepStrictEqual(b.lists.overview, ['1988년 설립']);
  assert.deepStrictEqual(Object.keys(b.tables).sort(), ['biz', 'fund', 'years']);
  assert.deepStrictEqual(Object.keys(b.tables.biz), ['rows']);
  assert.deepStrictEqual(b.tables.biz.rows, [{ group: '(A) 복지', sub: '노인 돌봄', lines: ['- 돌봄 대상 확대'] }]);
  assert.strictEqual(b.fields.inst_name, undefined);
  assert.strictEqual(b.fields.head_name, undefined);
  assert.deepStrictEqual(b.tables.years, { unit: '억원', from: 2028, to: 2033, end: 2032, mmda: { '2028': '100' }, income: { '2028': '3.5' }, notes: ['추정치'] });
});
test('buildBody: tpl 에 effect 가 있을 때만 그 목록을 보낸다(안 A)', function () {
  const without = isn.buildBody(isn.modelFromView(viewOf()), tplOf(false), 1);
  assert.strictEqual(without.lists.effect, undefined);
  const v = viewOf({ tpl: tplOf(true) });
  v.content.lists.effect = ['연 3억원 수익 예상(2026 예산서 3쪽)'];
  const b = isn.buildBody(isn.modelFromView(v), v.tpl, 1);
  assert.deepStrictEqual(b.lists.effect, ['연 3억원 수익 예상(2026 예산서 3쪽)']);
  const m = isn.modelFromView(viewOf({ tpl: tplOf(true) }));   // 서버가 effect 를 아직 안 주면 빈 줄 하나
  assert.deepStrictEqual(m.lists.effect, ['']);
  assert.deepStrictEqual(isn.buildBody(m, tplOf(true), 1).lists.effect, []);
});
test('buildBody: 통째로 빈 줄은 빼고, 글자는 앞뒤 공백을 지우고, 금액은 쉼표를 지운다', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  m.texts.budget.val = '  3억  ';
  m.lists.overview = [' 가 ', '', '  '];
  m.biz = [{ group: '', sub: '', lines: ['', ' '] }, { group: ' B ', sub: ' ', lines: ['x', ''] }];
  m.fund = [{ kind: '', lines: [{ lv: 1, text: ' ' }] }, { kind: '구분', lines: [{ lv: 1, text: ' 내용 ' }, { lv: 0, text: '' }] }];
  m.years.mmda = { '2028': '1,234', '2033': ' 5 ', '2034': '9' };
  m.years.end = '2040';
  const b = isn.buildBody(m, v.tpl, 2);
  assert.strictEqual(b.fields.budget.val, '3억');
  assert.deepStrictEqual(b.lists.overview, ['가']);
  assert.deepStrictEqual(b.tables.biz.rows, [{ group: 'B', sub: null, lines: ['x'] }]);
  assert.deepStrictEqual(b.tables.fund.rows, [{ kind: '구분', lines: [{ lv: 1, text: '내용' }] }]);
  assert.deepStrictEqual(b.tables.years.mmda, { '2028': '1234', '2033': '5' });   // 2034 는 범위 밖
  assert.strictEqual(b.tables.years.end, null);                                    // 종료 연도가 범위 밖이면 null
  m.years = null;
  assert.strictEqual(isn.buildBody(m, v.tpl, 2).tables.years, null);
});
test('isDirty: 같은 내용이면 거짓, 칸을 고치면 참, 빈 줄만 늘리면 거짓', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  const base = isn.bodyKey(m, v.tpl);
  assert.strictEqual(isn.isDirty(m, base, v.tpl), false);
  m.lists.overview.push('');
  assert.strictEqual(isn.isDirty(m, base, v.tpl), false);
  m.texts.bid_kind.val = '다른 공고';
  assert.strictEqual(isn.isDirty(m, base, v.tpl), true);
  m.texts.bid_kind.val = '주거래은행 선정';
  assert.strictEqual(isn.isDirty(m, base, v.tpl), false);
  m.years.mmda['2029'] = '7';
  assert.strictEqual(isn.isDirty(m, base, v.tpl), true);
  assert.strictEqual(isn.isDirty(null, base, v.tpl), false);
});

// ── 사전 검사 ──
test('precheck(저장): 형식 오류만 잡고 필수 비움은 허용한다(초안 저장)', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  m.texts.bid_kind.val = '';
  m.lists.overview = [''];
  assert.deepStrictEqual(isn.precheck(m, v.tpl, {}), []);
  m.texts.bid_kind.val = '가'.repeat(41);
  m.texts.budget.note = '나'.repeat(101);
  const ids = isn.precheck(m, v.tpl, {}).map(function (p) { return p.id; });
  assert.deepStrictEqual(ids, ['isf-f-bid_kind', 'isf-n-budget']);
  assert.strictEqual(isn.precheck(m, v.tpl, {})[0].msg, '공고명(입찰 종류)은 40자 이하 한 줄로 적으세요.');
});
test('precheck(확정): 필수 글 칸·목록·원본 칸이 비면 칸마다 문구가 나온다', function () {
  const v = viewOf();
  v.content.fields.head_name.val = null;
  const m = isn.modelFromView(v);
  m.texts.bid_kind.val = ' ';
  m.lists.overview = ['', ' '];
  const p = isn.precheck(m, v.tpl, { confirm: true, view: v });
  const by = {}; p.forEach(function (x) { by[x.id] = x.msg; });
  assert.strictEqual(by['isf-f-bid_kind'], '공고명(입찰 종류)을 적으세요.');
  assert.strictEqual(by['isf-l-overview-0'], '추진 배경(현황)을 적으세요.');
  assert.strictEqual(by['isf-f-head_name'], '원본에 기관장이 없습니다. 기관장 정보에서 넣으세요.');
  assert.strictEqual(p.length, 3);
});
test('precheck: effect 는 필수가 아니다(안 A)', function () {
  const v = viewOf({ tpl: tplOf(true) });
  const m = isn.modelFromView(v);
  assert.deepStrictEqual(isn.precheck(m, v.tpl, { confirm: true, view: v }), []);
  m.lists.effect = ['가'.repeat(301)];
  assert.strictEqual(isn.precheck(m, v.tpl, {})[0].id, 'isf-l-effect-0');
});
test('precheck: 사업·운영 방식·연도 표 칸 안내는 그 줄의 칸 id 로 나온다', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  m.biz = [{ group: '', sub: 'x', lines: [''] }, { group: 'A', sub: '', lines: ['', '나'.repeat(201)] }];
  m.fund = [{ kind: '', lines: [{ lv: 0, text: '내용' }] }];
  m.years.mmda = { '2028': '12억', '2029': '1,000' };
  m.years.income = { '2030': '3.1234' };
  const p = isn.precheck(m, v.tpl, {});
  const by = {}; p.forEach(function (x) { by[x.id] = x.msg; });
  assert.strictEqual(by['isf-b-0-g'], '대분류를 적으세요.');
  assert.strictEqual(by['isf-b-1-l-1'], '내용은 줄당 200자 이하로 적으세요.');
  assert.strictEqual(by['isf-u-0-k'], '구분을 적으세요.');
  assert.strictEqual(by['isf-y-mmda-2028'], '숫자로 적으세요(소수 3자리까지, 쉼표 가능).');
  assert.strictEqual(by['isf-y-mmda-2029'], undefined);                 // 쉼표는 허용
  assert.strictEqual(by['isf-y-income-2030'], '숫자로 적으세요(소수 3자리까지, 쉼표 가능).');
  m.years.from = '2034'; m.years.to = '2030';
  assert.strictEqual(isn.precheck(m, v.tpl, {}).filter(function (x) { return x.id === 'isf-y-from'; }).length, 1);
  m.years.unit = '';
  assert.ok(isn.precheck(m, v.tpl, {}).some(function (x) { return x.id === 'isf-y-unit'; }));
});
test('precheck: 범위 밖 연도의 틀린 값은 어차피 빠지므로 오류로 보지 않는다', function () {
  const v = viewOf();
  const m = isn.modelFromView(v);
  m.years.mmda['2040'] = 'abc';
  assert.deepStrictEqual(isn.precheck(m, v.tpl, {}), []);
});

// ── 모드·칩·머리 단추·경고 줄 ──
test('headModel: 상태별 머리 단추(규격 6-3 표)', function () {
  const w = isn.headModel(viewOf(), false, {});
  assert.deepStrictEqual([w.mode, w.docx, w.confirm, w.saveCancel, w.closeHead], ['write', 'draft', true, true, false]);
  assert.strictEqual(isn.headModel(viewOf({ cur_ver: 0 }), false, {}).docx, null);   // 판 없고 고친 것 없으면 초안 단추 숨김
  assert.strictEqual(isn.headModel(viewOf({ cur_ver: 0 }), true, {}).docx, 'draft');
  const conf = viewOf({ confirmed: { ver: 3, by_name: '김', at: 'x' }, viewer: { can_edit: false, can_unconfirm: true, lock_reason: 'CONFIRMED' } });
  const c = isn.headModel(conf, false, {});
  assert.deepStrictEqual([c.mode, c.docx, c.unconfirm, c.closeHead, c.closeFoot], ['view', 'confirmed', true, true, false]);
  const locked = viewOf({ viewer: { can_edit: false, can_unconfirm: false, lock_reason: 'STATE' } });
  assert.deepStrictEqual([isn.headModel(locked, false, {}).docx, isn.headModel(locked, false, {}).unconfirm], ['draft', false]);
  const none = isn.headModel(viewOf({ cur_ver: 0, viewer: { can_edit: false, lock_reason: null } }), false, {});
  assert.deepStrictEqual([none.docx, none.closeHead, none.closeFoot], [null, false, true]);
  const loading = isn.headModel(null, false, { loading: true });
  assert.deepStrictEqual([loading.closeHead, loading.confirm, loading.saveCancel], [true, false, false]);
  assert.strictEqual(isn.headModel(viewOf(), false, { broken: true }).confirm, false);
});
test('chipOf: 규격 6-4 칩 표', function () {
  assert.deepStrictEqual(isn.chipOf(viewOf({ cur_ver: 0 })), { cls: 'empty', text: '작성 전', icon: '' });
  assert.strictEqual(isn.chipOf(viewOf()).text, '작성 중');
  assert.deepStrictEqual(isn.chipOf(viewOf({ confirmed: { ver: 3 }, viewer: { can_edit: false, lock_reason: 'CONFIRMED' } })), { cls: 'done', text: '확정됨', icon: 'check' });
  assert.strictEqual(isn.chipOf(viewOf({ state_cd: 'APPROVAL_PENDING', viewer: { can_edit: false, lock_reason: 'STATE' } })).text, '승인 중이라 잠김');
  assert.deepStrictEqual(isn.chipOf(viewOf({ state_cd: 'WRITABLE', viewer: { can_edit: false, lock_reason: 'STATE' } })), { cls: 'fixed', text: '승인 뒤 고정', icon: 'lock' });
  assert.strictEqual(isn.chipOf(viewOf({ viewer: { can_edit: false, lock_reason: null } })).text, '보기만');
});
test('warnLines: 작성 중 낡은 칸·확정 뒤 바뀐 칸·잠김·보기만', function () {
  const stale = isn.warnLines(viewOf({ stale_keys: ['head_name'] }));
  assert.strictEqual(stale.length, 1);
  assert.strictEqual(stale[0].pre, '원본이 바뀐 칸이 1개 있습니다: ');
  assert.deepStrictEqual(stale[0].keys, ['head_name']);
  assert.strictEqual(stale[0].btn, 'refillAll');
  const chg = isn.warnLines(viewOf({ confirmed: { ver: 3 }, confirmed_changed_keys: ['inst_name', 'head_name'], viewer: { can_edit: false, can_unconfirm: true, lock_reason: 'CONFIRMED' } }));
  assert.ok(chg[0].post.indexOf('워드에는 확정 당시 값이 나옵니다.') >= 0 && chg[0].post.indexOf('[확정 취소]') >= 0);
  const noUn = isn.warnLines(viewOf({ confirmed: { ver: 3 }, confirmed_changed_keys: ['inst_name'], viewer: { can_edit: false, can_unconfirm: false, lock_reason: 'CONFIRMED' } }));
  assert.strictEqual(noUn[0].post.indexOf('[확정 취소]'), -1);
  assert.strictEqual(isn.warnLines(viewOf({ state_cd: 'APPROVAL_PENDING', viewer: { can_edit: false, lock_reason: 'STATE' } }))[0].id, 'pending');
  assert.strictEqual(isn.warnLines(viewOf({ state_cd: 'WRITABLE', viewer: { can_edit: false, lock_reason: 'STATE' } }))[0].id, 'fixed');
  assert.strictEqual(isn.warnLines(viewOf({ viewer: { can_edit: false, lock_reason: null } }))[0].id, 'readonly');
  assert.deepStrictEqual(isn.warnLines(viewOf()), []);
});

// ── 오류 코드 → 문구 ──
test('errInfo: 6-9 표 — 코드·상태별 문구와 화면 동작', function () {
  const tpl = tplOf(false);
  const E = function (status, detail, kind) { return isn.errInfo(status, detail, { tpl: tpl, kind: kind }); };
  assert.strictEqual(E(0, null).text, '서버에 연결하지 못했습니다. 입력한 내용은 그대로 있습니다.');
  assert.strictEqual(E(409, { code: 'VER_CHANGED' }).action, 'verchanged');
  const stale = E(409, { code: 'FORM_STALE', stale_keys: ['head_name', 'current_bank'] });
  assert.strictEqual(stale.text, '원본이 바뀐 칸이 있어 확정하지 못했습니다: 기관장, 현 거래 은행. [모두 다시 불러오기]를 누른 뒤 확정하세요.');
  assert.deepStrictEqual(stale.keys, ['head_name', 'current_bank']);
  assert.deepStrictEqual([E(409, { code: 'FORM_INCOMPLETE', missing_keys: ['bid_kind'] }).action, E(409, { code: 'FORM_INCOMPLETE', missing_keys: ['bid_kind'] }).keys], ['incomplete', ['bid_kind']]);
  assert.ok(E(409, { code: 'FORM_LOCKED', state_cd: 'APPROVAL_PENDING' }).text.indexOf('승인 요청을 회수하세요') > 0);
  assert.ok(E(409, { code: 'FORM_LOCKED', state_cd: 'WRITABLE' }).text.indexOf('고정되었습니다') > 0);
  assert.strictEqual(E(409, { code: 'FORM_LOCKED', state_cd: 'WRITABLE' }).action, 'locked');
  assert.strictEqual(E(409, { code: 'ALREADY_CONFIRMED' }).action, 'reread');
  assert.strictEqual(E(409, { code: 'NOT_CONFIRMED' }, 'unconfirm').text, '이미 확정이 취소되었습니다.');
  assert.strictEqual(E(409, { code: 'NOT_CONFIRMED' }, 'docx').text, '확정된 판이 없어 확정본을 만들 수 없습니다.');
  assert.strictEqual(E(409, { code: 'FORM_EMPTY' }).text, '저장된 판이 없어 워드를 만들 수 없습니다. 먼저 [저장]하세요.');
  assert.strictEqual(E(409, { code: 'FORM_INTEGRITY' }).action, 'integrity');
  assert.strictEqual(E(409, { code: 'NO_PLAN_IMPORT' }).action, 'plan');
  assert.strictEqual(E(409, { code: 'NO_CONTRACT' }).action, 'contract');
  assert.ok(E(409, { code: 'TOO_MANY_VERSIONS' }).text.indexOf('500개') > 0);
  assert.strictEqual(E(400, { code: 'BAD_VALUE', key: 'biz' }).text, '이 표에 형식이 맞지 않는 칸이 있습니다. 빨간 칸을 고치세요.');
  assert.strictEqual(E(400, { code: 'BAD_VALUE', key: 'bid_kind' }).text, '공고명(입찰 종류)은 40자 이하 한 줄로 적으세요.');
  assert.strictEqual(E(400, { code: 'BAD_VALUE', key: 'base_ver' }).text.indexOf('화면을 새로 고친 뒤 다시 하세요') > 0, true);
  assert.strictEqual(E(400, { code: 'FIELD_READONLY' }).text.indexOf('화면과 서버의 양식이 맞지 않아') === 0, true);
  assert.strictEqual(E(400, { code: 'CONTENT_TOO_LARGE' }).text, '양식 내용이 너무 커서 저장하지 못했습니다. 사업 표의 내용 줄을 줄이세요.');
  assert.strictEqual(E(400, { code: 'UI_ID_REQUIRED' }).text, '요청에 화면 정보가 빠져 처리하지 못했습니다. 화면을 새로 고치세요.');
  assert.strictEqual(E(422, { code: 'PII_DETECTED', key: 'org_note' }).text, '조직현황에 주민등록번호·전화번호처럼 보이는 값이 있어 저장하지 않았습니다. 그 부분을 지우고 다시 저장하세요.');
  assert.ok(E(422, { code: 'PII_DETECTED', key: 'reason' }, 'unconfirm').text.indexOf('취소 사유에') === 0);
  assert.strictEqual(E(403, null).action, 'reread');
  assert.strictEqual(E(403, null, 'load').action, 'none');
  assert.ok(E(404, 'prep not found').text.indexOf('이 건의 양식을 볼 수 없습니다') === 0);
  assert.ok(E(500, 'x').text.indexOf('기록을 남기지 못하면 내용을 내보내지 않습니다') > 0);
  assert.strictEqual(E(418, null).text, '처리하지 못했습니다. 잠시 뒤 다시 하세요.');
  // 서버 message 는 문구에 쓰지 않는다
  assert.strictEqual(E(409, { code: 'FORM_EMPTY', message: '서버 원문' }).text.indexOf('서버 원문'), -1);
});

// ── 그 밖의 순수 함수 ──
test('문구 도우미: confirmText·filledText·verChangedText·histRows·kst', function () {
  assert.strictEqual(isn.confirmText(7, false).split('\n')[0], 'v7판을 확정합니다.');
  assert.strictEqual(isn.confirmText(7, true).split('\n')[0], '고친 내용을 저장한 뒤 확정합니다.');
  assert.strictEqual(isn.filledText(viewOf()), '원본에서 기관명, 기관 형태, 기관장, 기관 주요 사업을 채웠습니다. 나머지 칸을 적고 [저장]하세요.');
  const empty = viewOf(); empty.content = contentOf(); Object.keys(empty.content.fields).forEach(function (k) { if (empty.content.fields[k].src !== undefined) empty.content.fields[k].val = null; }); empty.content.tables.biz.rows = [];
  assert.strictEqual(isn.filledText(empty), '원본에서 채울 값이 없었습니다. 칸을 직접 적고 [저장]하세요.');
  assert.strictEqual(isn.verChangedText('박영업', '2026-11-23T05:02:00Z', 6, 7), '박영업님이 11-23 14:02에 이 양식을 먼저 저장했습니다(v6→v7). 화면에서 고친 내용은 아직 그대로 있습니다.');
  assert.ok(isn.verChangedText('', '', 0, 0).indexOf('다른 사람이') === 0);
  const rows = isn.histRows([{ ver_no: 1, kind_cd: 'PREFILL', saved_by_name: '김', saved_at: '2026-11-23T05:00:00Z', confirmed: false }, { ver_no: 2, kind_cd: 'DRAFT', saved_by_name: '박', saved_at: '2026-11-23T06:00:00Z', confirmed: true }]);
  assert.deepStrictEqual(rows[0], ['v2', '저장', '박', '11-23 15:00', '확정본']);
  assert.deepStrictEqual(rows[1], ['v1', '원본 불러옴', '김', '11-23 14:00', '']);
  assert.strictEqual(isn.kst('not a date'), '');
  assert.strictEqual(isn.topic('예산'), '예산은'); assert.strictEqual(isn.topic('소재지'), '소재지는');
  assert.strictEqual(isn.subject('기관장'), '기관장이'); assert.strictEqual(isn.subject('주석'), '주석이');
  assert.strictEqual(isn.topic('공고명(입찰 종류)'), '공고명(입찰 종류)은'); assert.strictEqual(isn.object('추진 배경(현황)'), '추진 배경(현황)을');
});
test('safeUrl: http·https 만 링크로 만든다', function () {
  assert.strictEqual(isn.safeUrl('https://a.go.kr/x'), 'https://a.go.kr/x');
  assert.strictEqual(isn.safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(isn.safeUrl('ftp://a'), '');
  assert.strictEqual(isn.safeUrl('https://a b'), '');
  assert.strictEqual(isn.safeUrl(null), '');
});
test('fileNameOf: filename* 을 풀고, 없으면 filename=, 그것도 없으면 기본 이름', function () {
  const cd = 'attachment; filename="inst_summary.docx"; filename*=UTF-8\'\'%EA%B8%B0%EA%B4%80%EC%A0%95%EB%B3%B4%EC%9A%94%EC%95%BD_%EB%85%B8%EC%9B%90_v3.docx';
  assert.strictEqual(isn.fileNameOf(cd), '기관정보요약_노원_v3.docx');
  assert.strictEqual(isn.fileNameOf('attachment; filename="a.docx"'), 'a.docx');
  assert.strictEqual(isn.fileNameOf(''), 'inst_summary.docx');
  assert.strictEqual(isn.fileNameOf("attachment; filename*=UTF-8''..%2Fx%3A.docx"), '.._x_.docx');
});

// ── 요청 ──
function fakeFetch(seen, res) {
  return function (url, init) {
    seen.push({ url: url, init: init });
    return Promise.resolve(res || { ok: true, status: 200, json: function () { return Promise.resolve({ cur_ver: 1 }); }, headers: { get: function () { return ''; } }, blob: function () { return Promise.resolve('B'); } });
  };
}
test('call: 모든 요청(GET 포함)에 X-Screen-Id: prep_form + X-Button-Id 가 실린다', async function () {
  const seen = [];
  const f = fakeFetch(seen);
  await isn.call('GET', isn.url('B 1', ''), undefined, isn.BTN.open, { fetch: f });
  await isn.call('PUT', isn.url('B1', '/draft'), { base_ver: 1 }, isn.BTN.save, { fetch: f });
  const r = await isn.call('GET', isn.url('B1', '/draft-docx'), undefined, isn.BTN.draftDocx, { fetch: f, blob: true });
  assert.strictEqual(seen[0].url, '/bidcases/B%201/prep/forms/INST_SUMMARY');
  assert.strictEqual(seen[1].url, '/bidcases/B1/prep/forms/INST_SUMMARY/draft');
  seen.forEach(function (x) { assert.strictEqual(x.init.headers['X-Screen-Id'], 'prep_form'); assert.ok(x.init.headers['X-Button-Id']); });
  assert.deepStrictEqual(seen.map(function (x) { return x.init.headers['X-Button-Id']; }), ['form_open', 'form_save', 'form_draft_docx']);
  assert.strictEqual(seen[0].init.headers['Content-Type'], undefined);
  assert.strictEqual(seen[1].init.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(seen[1].init.body), { base_ver: 1 });
  assert.deepStrictEqual(r, { blob: 'B', name: 'inst_summary.docx' });
});
test('call: 실패하면 status·detail 을 단 Error 를 던진다(본문이 JSON 이 아니어도)', async function () {
  const bad = { ok: false, status: 409, json: function () { return Promise.resolve({ detail: { code: 'VER_CHANGED' } }); } };
  await assert.rejects(isn.call('PUT', '/x', {}, 'form_save', { fetch: fakeFetch([], bad) }), function (e) { return e.status === 409 && e.detail.code === 'VER_CHANGED'; });
  const html = { ok: false, status: 500, json: function () { return Promise.reject(new Error('not json')); } };
  await assert.rejects(isn.call('GET', '/x', undefined, 'form_open', { fetch: fakeFetch([], html) }), function (e) { return e.status === 500 && e.detail === undefined; });
});
test('X-Button-Id 10종은 서버 허용 목록(PrepFormUiIds)과 같다', function () {
  assert.strictEqual(isn.SCREEN, 'prep_form');
  const ids = Object.keys(isn.BTN).map(function (k) { return isn.BTN[k]; }).sort();
  assert.deepStrictEqual(ids, ['form_confirm', 'form_docx', 'form_draft_docx', 'form_history', 'form_open', 'form_prefill', 'form_refill', 'form_refresh', 'form_save', 'form_unconfirm']);
  const java = path.join(__dirname, '..', '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'PrepFormUiIds.java');
  if (fs.existsSync(java)) {   // 저장소 전체가 있을 때만 서버 목록과 대조
    const j = fs.readFileSync(java, 'utf8');
    ids.forEach(function (id) { assert.ok(j.indexOf('"' + id + '"') >= 0, id); });
    assert.ok(j.indexOf('"prep_form"') >= 0);
  }
});

// ── 로드·소스 규칙 ──
test('document 가 없는 환경에서 load·open 이 오류를 내지 않는다', function () {
  assert.strictEqual(typeof isn.open, 'function');
  assert.doesNotThrow(function () { isn.open({ bidCaseId: 'B1', instName: '노원구청' }); });
  assert.doesNotThrow(function () { isn.open(); });
});
test('소스 규칙: innerHTML 없음·브라우저 기본 팝업 없음·저장소·외부 요청 없음·서버 message 미사용', function () {
  assert.doesNotMatch(SRC, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(strip(SRC), /(?<![\w$.])(alert|confirm)\(|window\.(alert|confirm)\(/);
  assert.ok(!new RegExp('local' + 'Storage|session' + 'Storage|indexed' + 'DB|document\\.' + 'cookie').test(SRC), '브라우저 저장소를 쓰지 않는다');
  assert.doesNotMatch(SRC, /XMLHttpRequest|navigator\.sendBeacon|window\.open\(|<script|\bimport\s*\(/);
  assert.doesNotMatch(strip(SRC), /\.detail\.message|detail\.message|\.message\b/);   // 서버 message 를 화면에 쓰지 않는다
  assert.match(SRC, /typeof document === 'undefined'/);
  assert.match(SRC, /root\.instSummary = isn/);
});
test('소스 규칙: 요청은 isn.call 하나로, 내려받기는 blob → a[download], 팝업은 dlg 공통 API', function () {
  assert.strictEqual((strip(SRC).match(/\bfetch\(|\bf\(url, init\)/g) || []).length, 1);   // 요청 함수 안의 한 곳뿐
  assert.match(SRC, /URL\.createObjectURL\(blob\)/);
  assert.match(SRC, /a\.download = name/);
  assert.match(SRC, /dlgApi\(\)\.confirm\(\{/);
  assert.match(SRC, /D\.open\(my\.ov,/);
  assert.match(SRC, /dlgApi\(\)\.line\(/);
});
test('소스 규칙: 새 hex 색·11px 미만 글자를 JS 에 직접 두지 않는다', function () {
  assert.doesNotMatch(SRC, /#[0-9a-fA-F]{3,6}\b(?![\w-])/);
  assert.doesNotMatch(SRC, /font-size:\s*(?:[0-9]|10)px/);
});
