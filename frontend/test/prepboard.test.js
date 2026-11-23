const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pb = require('../js/prepboard.js');
const prep = require('../js/prep.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'prepboard.js'), 'utf8');
const PREP_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'prep.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 엑셀과 같은 27칸(BOARD 자동 칸·SUBMIT_APPR 부모 칸 없음 — main 결정 11-23)
function col(cd, label, group, kind) { return { col_cd: cd, label: label, group: group || null, kind: kind || 'MANUAL', editable: (kind || 'MANUAL') === 'MANUAL' }; }
const COLUMNS = [
  col('NOTICE_CHECK', '입찰공고확인', null, 'NOTICE'), col('INST_ANALYSIS', '기관 정보 분석', null, 'AUTO'), col('PROFIT', '수익성분석', null, 'AUTO'),
  col('FIN_COMMITTEE', '가결위(재무)'), col('BIZ_COMMITTEE', '출심위(사업부)'),
  col('BOARD_SECRETARIAT', '사무국', 'BOARD'), col('BOARD_AUDIT', '감사·감시', 'BOARD'), col('BOARD_COMPLIANCE', '준법', 'BOARD'),
  col('PROPOSAL', '제안서', null, 'AUTO'), col('PRESENT_DOC', '발표자료'), col('SUBMIT_DOCS', '제출서류'),
  col('SUBMIT_MONITOR', '감시', 'SUBMIT_APPR'), col('SUBMIT_PROPERTY', '재산상이익', 'SUBMIT_APPR'),
  col('PT', 'PT'), col('RESULT', '결과발표'), col('PRIORITY_NEGO', '우선협상'), col('AGREE_LEGAL', '협약서(법률)'),
  col('CONTRACT_AUDIT', '감사·감시', 'CONTRACT_APPR'), col('CONTRACT_STRATEGY', '전략', 'CONTRACT_APPR'),
  col('CONTRACT_PROPERTY', '재산상이익', 'CONTRACT_APPR'), col('CONTRACT_BRANCH', '영업점안내', 'CONTRACT_APPR'),
  col('ATM', 'ATM'), col('KB_CARD', 'KB카드'), col('IT_BUILD', '전산구축'), col('VIP', 'VIP 지정'), col('RATE_APPROVAL', '금리승인'), col('CEREMONY', '협약식'),
];
const GROUPS = { BOARD: '이사회', SUBMIT_APPR: '제안서제출품의', CONTRACT_APPR: '협약체결품의' };
const MARKS = [{ mark_cd: 'DONE', symbol: 'V', name: '완료' }, { mark_cd: 'IN_PROGRESS', symbol: '△', name: '진행' },
               { mark_cd: 'NA', symbol: '-', name: '대상 아님' }, { mark_cd: 'NONE', symbol: '', name: '시작 전' }];
const infos = pb.colInfos(COLUMNS, GROUPS);
function infoOf(cd) { return infos.filter(function (i) { return i.cd === cd; })[0]; }

function row(o) {
  return Object.assign({ bid_case_id: 'B1', institution_id: 'I1', institution_name: '청주시', state_cd: 'IN_PROGRESS', state_name: '사전준비 중', ended: false,
    assignee_names: ['김영업'], current_banks: [], can_view: true, can_check: true, is_mine: true, cells: {} }, o || {});
}

// ── 열 머리 2단 ──
test('headModel: 27칸 → 머리 1행 21칸(묶음 3개 colspan 3·2·4) + 2행 하위 9칸, 묶음 없는 칸은 rowspan', function () {
  assert.strictEqual(COLUMNS.length, 27);
  const h = pb.headModel(COLUMNS, GROUPS);
  assert.strictEqual(h.top.length, 21);
  assert.strictEqual(h.sub.length, 9);
  const groups = h.top.filter(function (t) { return t.type === 'group'; });
  assert.deepStrictEqual(groups.map(function (g) { return [g.label, g.span]; }), [['이사회', 3], ['제안서제출품의', 2], ['협약체결품의', 4]]);
  assert.deepStrictEqual(h.sub.map(function (s) { return s.label; }), ['사무국', '감사·감시', '준법', '감시', '재산상이익', '감사·감시', '전략', '재산상이익', '영업점안내']);
  assert.deepStrictEqual(h.sub.filter(function (s) { return s.gs; }).map(function (s) { return s.cd; }), ['BOARD_SECRETARIAT', 'SUBMIT_MONITOR', 'CONTRACT_AUDIT']);
  const singles = h.top.filter(function (t) { return t.type === 'single'; });
  assert.strictEqual(singles.length, 18);
  assert.strictEqual(singles[0].label, '입찰공고확인');
  assert.deepStrictEqual(singles.filter(function (t) { return t.auto; }).map(function (t) { return t.cd; }), ['INST_ANALYSIS', 'PROFIT', 'PROPOSAL']);
  // 열 순서는 서버 columns[] 순서 그대로
  assert.deepStrictEqual(infos.map(function (i) { return i.cd; }), COLUMNS.map(function (c) { return c.col_cd; }));
});

test('headModel: 하위 칸 이름이 묶음 이름과 같으면 2행 라벨 \'전체\'(서버가 묶음 대표 칸을 줄 때)', function () {
  const cols = [col('BOARD', '이사회', 'BOARD', 'AUTO'), col('BOARD_SECRETARIAT', '사무국', 'BOARD')];
  const h = pb.headModel(cols, GROUPS);
  assert.deepStrictEqual(h.sub.map(function (s) { return s.label; }), ['전체', '사무국']);
  const i = pb.colInfos(cols, GROUPS);
  assert.strictEqual(i[0].fullLabel, '이사회');
  assert.strictEqual(i[1].fullLabel, '이사회 › 사무국');
  assert.deepStrictEqual(pb.headModel(null, null), { top: [], sub: [] });
});

test('colInfos: 묶음 이름이 없는 groups 키는 키 이름을 쓰고, 손 칸만 editable', function () {
  const i = pb.colInfos([col('X', '칸', 'ZZ')], {});
  assert.strictEqual(i[0].fullLabel, 'ZZ › 칸');
  assert.strictEqual(infoOf('NOTICE_CHECK').editable, false);
  assert.strictEqual(infoOf('INST_ANALYSIS').editable, false);
  assert.strictEqual(infoOf('PT').editable, true);
  assert.strictEqual(infoOf('BOARD_SECRETARIAT').gs, true);
  assert.strictEqual(infoOf('BOARD_AUDIT').gs, false);
});

// ── 날짜 ──
test('dateText: 올해는 MM-DD, 다른 해는 YYYY, 읽을 수 없으면 빈 글자', function () {
  assert.strictEqual(pb.dateText('2026-11-20', '2026-11-23'), '11-20');
  assert.strictEqual(pb.dateText('2025-12-30', '2026-11-23'), '2025');
  assert.strictEqual(pb.dateText('2027-01-02T00:00:00', '2026-11-23'), '2027');
  ['', null, undefined, 'abc', '2026/11/20'].forEach(function (v) { assert.strictEqual(pb.dateText(v, '2026-11-23'), ''); });
  assert.strictEqual(pb.fullDate('2026-11-20T10:00'), '2026-11-20');
  assert.strictEqual(pb.fullDate('x'), '');
  assert.strictEqual(pb.hm(new Date(2026, 10, 23, 9, 5)), '09:05');
});

// ── 칸 모양 ──
test('cellModel: kind·mark별 모양(공고·자동·손 칸, 틴트, 누를 수 있는가)', function () {
  const r = row();
  const notice = pb.cellModel(infoOf('NOTICE_CHECK'), r, { source: 'NOTICE', mark_cd: null, notice_status_name: ' 공고 진행 중 ' }, '2026-11-23');
  assert.strictEqual(notice.mark, ''); assert.strictEqual(notice.noticeText, '공고 진행 중'); assert.strictEqual(notice.button, false); assert.strictEqual(notice.tint, '');
  const auto = pb.cellModel(infoOf('INST_ANALYSIS'), r, { source: 'AUTO', mark_cd: 'DONE', marked_on: '2026-11-18' }, '2026-11-23');
  assert.strictEqual(auto.glyph, 'done'); assert.strictEqual(auto.date, '11-18'); assert.strictEqual(auto.button, false); assert.strictEqual(auto.tint, 'DONE');
  const done = pb.cellModel(infoOf('BOARD_SECRETARIAT'), r, { mark_cd: 'DONE', marked_on: '2026-11-22', rev_no: 3 }, '2026-11-23');
  assert.strictEqual(done.button, true); assert.strictEqual(done.revNo, 3); assert.strictEqual(done.tint, 'DONE'); assert.strictEqual(done.date, '11-22');
  const prog = pb.cellModel(infoOf('PT'), r, { mark_cd: 'IN_PROGRESS', marked_on: '2026-11-22' }, '2026-11-23');
  assert.strictEqual(prog.glyph, 'prog'); assert.strictEqual(prog.tint, 'IN_PROGRESS');
  const na = pb.cellModel(infoOf('PT'), r, { mark_cd: 'NA', marked_on: '2026-11-22' }, '2026-11-23');
  assert.strictEqual(na.glyph, 'na'); assert.strictEqual(na.tint, ''); assert.strictEqual(na.date, '11-22');
  const none = pb.cellModel(infoOf('PT'), r, { mark_cd: 'NONE', marked_on: '2026-11-22' }, '2026-11-23');
  assert.strictEqual(none.glyph, ''); assert.strictEqual(none.date, ''); assert.strictEqual(none.button, true);
  // 모르는 값·빈 값은 시작 전
  assert.strictEqual(pb.cellModel(infoOf('PT'), r, { mark_cd: 'WEIRD' }, '').mark, 'NONE');
  assert.strictEqual(pb.cellModel(infoOf('PT'), r, null, '').mark, 'NONE');
});

test('cellModel: 담당이 아닌 행·끝난 행은 누를 수 없고, 끝난 행은 칸 색도 없다', function () {
  const notMine = row({ can_check: false });
  assert.strictEqual(pb.cellModel(infoOf('PT'), notMine, { mark_cd: 'DONE' }, '').button, false);
  assert.strictEqual(pb.cellModel(infoOf('PT'), notMine, { mark_cd: 'DONE' }, '').tint, 'DONE');
  const ended = row({ ended: true, can_check: true });
  const m = pb.cellModel(infoOf('PT'), ended, { mark_cd: 'DONE' }, '');
  assert.strictEqual(m.button, false); assert.strictEqual(m.tint, '');
  assert.strictEqual(pb.cellModel(infoOf('INST_ANALYSIS'), ended, { mark_cd: 'DONE' }, '').tint, '');
});

test('cellAria: 색·글리프가 아니라 말로 전한다', function () {
  const r = row();
  assert.strictEqual(pb.cellAria(r, infoOf('BOARD_SECRETARIAT'), { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '김영업' }, MARKS, ''), '청주시 이사회 › 사무국: 완료, 2026-11-20 김영업 체크');
  assert.strictEqual(pb.cellAria(r, infoOf('PT'), { mark_cd: 'NONE' }, MARKS, ''), '청주시 PT: 시작 전');
  assert.strictEqual(pb.cellAria(r, infoOf('INST_ANALYSIS'), { mark_cd: 'DONE', marked_on: '2026-11-18' }, MARKS, ''), '청주시 기관 정보 분석: 완료, 2026-11-18, 자동, 시스템이 채움');
  assert.strictEqual(pb.cellAria(r, infoOf('NOTICE_CHECK'), { notice_status_name: '공고 진행 중' }, MARKS, ''), '청주시 입찰공고확인: 공고 진행 중, 공고 판정에서 가져옴');
  assert.ok(pb.cellAria(r, infoOf('NOTICE_CHECK'), {}, MARKS, '').indexOf('공고 상태 없음') > 0);
  assert.ok(pb.cellAria(r, infoOf('PT'), { mark_cd: 'DONE' }, MARKS, '').indexOf('V') < 0);
});

test('cellHtml: 손 칸 버튼·자동 칸 읽기 전용·글리프는 SVG(V·△ 글자 없음), 서버 값은 이스케이프', function () {
  const evil = '<img src=x onerror=alert(1)>';
  const r = row({ institution_name: evil, cells: {} });
  const btn = pb.cellHtml({ info: infoOf('PT'), row: r, cell: { mark_cd: 'DONE', marked_on: '2026-11-22', by_name: evil }, marks: MARKS, today: '2026-11-23', r: 0, c: 14 });
  assert.ok(btn.indexOf('<button type="button" class="pb-mk" tabindex="-1" aria-haspopup="menu" aria-expanded="false"') > 0);
  assert.ok(btn.indexOf('<svg class="pb-g done"') > 0 && btn.indexOf('<span class="pb-d">11-22</span>') > 0);
  assert.ok(btn.indexOf('data-mk="DONE"') > 0 && btn.indexOf('data-col="PT"') > 0 && btn.indexOf('data-r="0" data-c="14"') > 0);
  assert.ok(btn.indexOf('<img') < 0 && btn.indexOf('&lt;img') > 0);
  const auto = pb.cellHtml({ info: infoOf('PROFIT'), row: r, cell: { mark_cd: 'IN_PROGRESS' }, marks: MARKS, today: '', r: 0, c: 3 });
  assert.ok(auto.indexOf('<button') < 0 && auto.indexOf('aria-readonly="true"') > 0 && auto.indexOf('class="is-auto"') > 0 && auto.indexOf('pb-g prog') > 0);
  const notice = pb.cellHtml({ info: infoOf('NOTICE_CHECK'), row: r, cell: { notice_status_name: evil }, marks: MARKS, today: '', r: 0, c: 1 });
  assert.ok(notice.indexOf('wf-badge pp-neutral pb-notice') > 0 && notice.indexOf('<img') < 0 && notice.indexOf('is-notice') > 0);
  const saving = pb.cellHtml({ info: infoOf('PT'), row: row(), cell: { mark_cd: 'DONE' }, marks: MARKS, today: '', r: 0, c: 1, saving: true });
  assert.ok(saving.indexOf('is-saving') > 0 && saving.indexOf('aria-busy="true"') > 0);
  const failed = pb.cellHtml({ info: infoOf('PT'), row: row(), cell: { mark_cd: 'NONE' }, marks: MARKS, today: '', r: 0, c: 1, failed: true });
  assert.ok(failed.indexOf('is-failed') > 0);
  [btn, auto, saving].forEach(function (h) { assert.ok(!/>\s*[V△]\s*</.test(h)); });
});

test('glyphSvg: 체크·세모·가로줄 획 글리프, 시작 전은 빈 글자', function () {
  assert.ok(pb.glyphSvg('done').indexOf('M2.5 6.4 5 8.9 9.6 3.2') > 0);
  assert.ok(pb.glyphSvg('prog').indexOf('M6 2.3 10.2 9.6H1.8Z') > 0);
  assert.ok(pb.glyphSvg('na').indexOf('M3 6h6') > 0);
  assert.strictEqual(pb.glyphSvg(''), '');
  assert.strictEqual(pb.glyphKind('DONE') + pb.glyphKind('IN_PROGRESS') + pb.glyphKind('NA') + pb.glyphKind('NONE'), 'doneprogna');
});

// ── 표 전체 ──
test('tableHtml: 머리 2줄·행마다 이름 칸 + 27칸·aria 수·끝난 행·이름 링크 여부', function () {
  const rows = [
    row({ bid_case_id: 'B1', cells: { PT: { mark_cd: 'DONE', marked_on: '2026-11-22', rev_no: 1, by_name: '김영업' } } }),
    row({ bid_case_id: 'B2', institution_name: '진주시', ended: true, state_name: '확정 취소', can_view: false, can_check: false, is_mine: false }),
  ];
  const h = pb.tableHtml({ columns: COLUMNS, groups: GROUPS, marks: MARKS, rows: rows, today: '2026-11-23', pending: {}, failed: {} });
  const head = h.slice(h.indexOf('<thead>'), h.indexOf('</thead>'));
  assert.strictEqual((head.match(/<tr>/g) || []).length, 2);
  assert.strictEqual((head.match(/<th /g) || []).length, 1 + 21 + 9);
  assert.ok(head.indexOf('colspan="3" scope="colgroup">이사회') > 0 && head.indexOf('rowspan="2" scope="col">입찰공고확인') > 0);
  assert.ok(head.indexOf('<span class="pb-auto">자동</span>') > 0);
  assert.strictEqual((h.match(/<td /g) || []).length, 2 * 27);
  assert.strictEqual((h.match(/<th scope="row"/g) || []).length, 2);
  assert.ok(h.indexOf('aria-rowcount="4"') > 0 && h.indexOf('aria-colcount="28"') > 0 && h.indexOf('role="grid"') > 0 && h.indexOf('aria-labelledby="pb-title"') > 0);
  assert.strictEqual((h.match(/<col /g) || []).length, 28);
  assert.ok(h.indexOf('<col class="c-notice">') > 0);
  assert.ok(h.indexOf('<tr data-bid="B2" class="is-ended">') > 0);
  assert.ok(h.indexOf('<button type="button" class="pb-nm" data-pb="open" tabindex="-1">청주시</button>') > 0);
  assert.ok(h.indexOf('<span class="pb-nm-t">진주시</span>') > 0, '상세를 볼 수 없으면 링크가 아니라 글자');
  assert.ok(h.indexOf('>내 담당</span>') > 0 && h.indexOf('>확정 취소</span>') > 0);
  assert.ok(h.indexOf('담당 김영업') > 0);
  // 끝난 행 B2에는 눌러 체크하는 버튼이 없다 — 버튼은 B1의 손 칸(27 - 공고 1 - 자동 3 = 23)뿐
  assert.strictEqual((h.match(/class="pb-mk"/g) || []).length, 23);
});

test('rowHtml: 담당이 없으면 \'담당 미정\', 상태 이름이 비면 끝난 행 칩은 \'확정 취소\'', function () {
  const a = pb.rowHtml({ row: row({ assignee_names: [], cells: {} }), infos: infos, marks: MARKS, today: '', r: 0 });
  assert.ok(a.indexOf('담당 미정') > 0);
  const b = pb.rowHtml({ row: row({ ended: true, state_name: '', is_mine: false }), infos: infos, marks: MARKS, today: '', r: 0 });
  assert.ok(b.indexOf('>확정 취소</span>') > 0);
});

// ── 거르기 ──
test('filterRows: 이름 검색·담당자·내 담당 — 서버 순서(입찰 예정일 순)를 그대로 둔다', function () {
  const rows = [
    row({ bid_case_id: 'a', institution_name: '청주시', assignee_names: ['김영업'], is_mine: true }),
    row({ bid_case_id: 'b', institution_name: '진주시', assignee_names: ['이영업', '김영업'], is_mine: false }),
    row({ bid_case_id: 'c', institution_name: '서울시', assignee_names: [], is_mine: false }),
    row({ bid_case_id: 'd', institution_name: '청주시청', assignee_names: ['이영업'], is_mine: false }),
  ];
  const ids = function (f) { return pb.filterRows(rows, f).map(function (r) { return r.bid_case_id; }).join(''); };
  assert.strictEqual(ids({}), 'abcd');
  assert.strictEqual(ids({ q: '  청주 ' }), 'ad');
  assert.strictEqual(ids({ q: '시' }), 'abcd');
  assert.strictEqual(ids({ who: pb.WHO_MINE }), 'a');
  assert.strictEqual(ids({ who: '김영업' }), 'ab');
  assert.strictEqual(ids({ who: '이영업', q: '진주' }), 'b');
  assert.strictEqual(ids({ who: '없는사람' }), '');
  assert.strictEqual(ids(null), 'abcd');
  assert.deepStrictEqual(pb.filterRows(null, {}), []);
});

test('whoOptions: 전체 · 내 담당 · 이름 가나다순(중복 제거)', function () {
  const rows = [row({ assignee_names: ['이영업', '김영업'] }), row({ assignee_names: ['김영업', '박영업'] }), row({ assignee_names: [] })];
  assert.deepStrictEqual(pb.whoOptions(rows).map(function (o) { return o.label; }), ['전체', '내 담당', '김영업', '박영업', '이영업']);
  assert.deepStrictEqual(pb.whoOptions(rows).slice(0, 2).map(function (o) { return o.value; }), ['', pb.WHO_MINE]);
  assert.deepStrictEqual(pb.whoOptions([]).map(function (o) { return o.label; }), ['전체', '내 담당']);
});

test('countHtml·emptyModel·readOnlyAll', function () {
  assert.strictEqual(pb.countHtml(pb.countModel(12, 12)), '기관 <b>12</b>곳');
  assert.strictEqual(pb.countHtml(pb.countModel(3, 12)), '기관 <b>3</b>곳 중 <b>12</b>곳');
  assert.deepStrictEqual(pb.emptyModel(0, 0, {}), { kind: 'none', text: pb.T.empty, action: 'map' });
  assert.strictEqual(pb.emptyModel(5, 2, {}), null);
  assert.deepStrictEqual(pb.emptyModel(5, 0, { q: ' 가나 ' }), { kind: 'query', text: '\'가나\'와 맞는 기관이 없습니다.', action: 'clear' });
  assert.strictEqual(pb.emptyModel(5, 0, { who: '김영업' }).text, '김영업 담당 기관이 없습니다.');
  assert.strictEqual(pb.emptyModel(5, 0, { who: pb.WHO_MINE }).text, '내 담당 기관이 없습니다.');
  assert.ok(pb.T.empty.indexOf('[제안 확정]') > 0 && pb.T.openMap === '지역별 공고현황 열기');
  assert.strictEqual(pb.readOnlyAll([row({ can_check: false }), row({ can_check: false })]), true);
  assert.strictEqual(pb.readOnlyAll([row({ can_check: false }), row({ can_check: true })]), false);
  assert.strictEqual(pb.readOnlyAll([]), false);
});

// ── 오류·성공 문구 ──
test('saveError: 409 원인별(STALE_CHECK·STATE_CHANGED·NOT_MANUAL)·403·400·연결 실패·401·404', function () {
  const c = { inst: '청주시', col: 'PT' };
  assert.strictEqual(pb.saveError(409, 'STALE_CHECK', c), '청주시 › PT: 다른 사람이 먼저 바꿨습니다. [새로 고침]으로 지금 값을 본 뒤 다시 고르세요.');
  assert.strictEqual(pb.saveError(409, 'STATE_CHANGED', c), '청주시의 진행 상태가 바뀌어 지금은 체크할 수 없습니다. [새로 고침]으로 확인하세요.');
  assert.strictEqual(pb.saveError(409, 'NOT_MANUAL', { inst: '청주시', col: '기관 정보 분석' }), '기관 정보 분석은 시스템이 채우는 칸이라 직접 바꿀 수 없습니다.');
  assert.strictEqual(pb.saveError(409, 'NOT_MANUAL', { inst: '청주시', col: '준비' }), '준비는 시스템이 채우는 칸이라 직접 바꿀 수 없습니다.');
  assert.strictEqual(pb.saveError(409, 'WHATEVER', c), pb.T.err400);
  assert.strictEqual(pb.saveError(403, '', c), '청주시의 담당 영업만 체크할 수 있습니다. 담당이 바뀌었다면 [새로 고침]을 누르세요.');
  assert.strictEqual(pb.saveError(400, 'BAD_MARK', c), '저장하지 못했습니다. 화면을 새로 고친 뒤 다시 고르세요.');
  assert.strictEqual(pb.saveError(0, '', c), '연결이 끊겨 저장하지 못했습니다. 연결을 확인하고 다시 고르세요.');
  assert.strictEqual(pb.saveError(undefined, '', c), pb.T.errNet);
  assert.strictEqual(pb.saveError(500, '', c), pb.T.errNet);
  assert.strictEqual(pb.saveError(503, '', c), pb.T.errNet);
  assert.strictEqual(pb.saveError(401, '', c), prep.T.login);
  assert.ok(pb.saveError(404, '', c).indexOf('[새로 고침]') > 0);
  assert.strictEqual(pb.saveError(422, '', c), pb.T.err400);
  // 쓰지 않는 말
  ['STALE', 'rev', '체크 저장 오류', '확인 중'].forEach(function (w) {
    [409, 403, 400, 500].forEach(function (s) { assert.ok(pb.saveError(s, 'STALE_CHECK', c).indexOf(w) < 0, w); });
  });
});

test('saveOk: 조사(을/를, 로/으로)를 받침에 맞춘다', function () {
  assert.strictEqual(pb.saveOk('이사회 › 사무국', '완료'), '이사회 › 사무국을 완료로 저장했습니다.');
  assert.strictEqual(pb.saveOk('PT', '진행'), 'PT을 진행으로 저장했습니다.');   // 한글이 아닌 끝 글자는 첫째 값(을) — prep.josa 규칙
  assert.strictEqual(pb.saveOk('결과발표', '대상 아님'), '결과발표를 대상 아님으로 저장했습니다.');
  assert.strictEqual(pb.saveOk('우선협상', '시작 전'), '우선협상을 시작 전으로 저장했습니다.');
  assert.strictEqual(pb.ro('완료'), '로'); assert.strictEqual(pb.ro('서울'), '로'); assert.strictEqual(pb.ro('진행'), '으로'); assert.strictEqual(pb.ro(''), '로');
});

test('forbidden: 권한 없음 문구(디자이너 등)', function () {
  assert.strictEqual(pb.T.forbidden('디자이너'), '이 화면은 영업부서만 볼 수 있습니다. 지금 계정(디자이너)으로는 볼 수 없습니다.');
  assert.ok(pb.T.forbidden('').indexOf('소속 없음') > 0);
});

// ── 키보드 ──
test('nextPos: 화살표·Home·End·Ctrl+Home/End는 표 안에 머문다', function () {
  const p = { r: 1, c: 2 };
  assert.deepStrictEqual(pb.nextPos(p, 'ArrowLeft', false, 3, 27), { r: 1, c: 1 });
  assert.deepStrictEqual(pb.nextPos(p, 'ArrowRight', false, 3, 27), { r: 1, c: 3 });
  assert.deepStrictEqual(pb.nextPos(p, 'ArrowUp', false, 3, 27), { r: 0, c: 2 });
  assert.deepStrictEqual(pb.nextPos(p, 'ArrowDown', false, 3, 27), { r: 2, c: 2 });
  assert.deepStrictEqual(pb.nextPos({ r: 2, c: 2 }, 'ArrowDown', false, 3, 27), { r: 2, c: 2 });
  assert.deepStrictEqual(pb.nextPos({ r: 0, c: 0 }, 'ArrowLeft', false, 3, 27), { r: 0, c: 0 });
  assert.deepStrictEqual(pb.nextPos({ r: 0, c: 27 }, 'ArrowRight', false, 3, 27), { r: 0, c: 27 });
  assert.deepStrictEqual(pb.nextPos(p, 'Home', false, 3, 27), { r: 1, c: 0 });
  assert.deepStrictEqual(pb.nextPos(p, 'End', false, 3, 27), { r: 1, c: 27 });
  assert.deepStrictEqual(pb.nextPos(p, 'Home', true, 3, 27), { r: 0, c: 0 });
  assert.deepStrictEqual(pb.nextPos(p, 'End', true, 3, 27), { r: 2, c: 27 });
  assert.strictEqual(pb.nextPos(p, 'a', false, 3, 27), null);
  assert.strictEqual(pb.nextPos(p, 'Enter', false, 3, 27), null);
  assert.deepStrictEqual(pb.nextPos({ r: 0, c: 0 }, 'ArrowDown', false, 0, 27), { r: 0, c: 0 });
});

test('markByKey: 1~4 → 완료·진행·대상 아님·시작 전', function () {
  assert.deepStrictEqual(['1', '2', '3', '4'].map(function (k) { return pb.markByKey(k); }), ['DONE', 'IN_PROGRESS', 'NA', 'NONE']);
  assert.strictEqual(pb.markByKey('5'), ''); assert.strictEqual(pb.markByKey('0'), ''); assert.strictEqual(pb.markByKey('Enter'), '');
  assert.strictEqual(pb.markByKey('2', ['NONE', 'DONE']), 'DONE');
});

// ── 정보 줄·메뉴 ──
test('infoParts: 이름 칸·손 칸·빈 칸·자동·공고·바꿀 수 없는 행', function () {
  const flat = function (p) { return p.parts.map(function (x) { return (x.l ? x.l + '=' : '') + x.v; }).join('|'); };
  const r = row({ bid_expected_date: '2027-03-10', current_banks: [{ bank_name: '국민은행' }, { bank_name: '' }, { bank_name: '신한은행' }] });
  const name = pb.infoParts(r, null, null, MARKS);
  assert.strictEqual(flat(name), '청주시|상태=사전준비 중|입찰 예정일(추정)=2027-03-10|현재 금고=국민은행, 신한은행');
  assert.strictEqual(name.tail, '');
  assert.strictEqual(pb.infoParts(row({ can_view: false }), null, null, MARKS).tail, pb.T.infoNoView);
  const done = pb.infoParts(r, infoOf('BOARD_SECRETARIAT'), { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '김영업' }, MARKS);
  assert.strictEqual(flat(done), '칸=이사회 › 사무국|표시=완료|체크한 날=2026-11-20|체크한 사람=김영업');
  assert.strictEqual(done.tail, '');
  assert.strictEqual(pb.infoParts(row({ can_check: false }), infoOf('PT'), { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '김영업' }, MARKS).tail, '체크는 이 기관의 담당 영업만 합니다.');
  const none = pb.infoParts(r, infoOf('PT'), { mark_cd: 'NONE' }, MARKS);
  assert.strictEqual(flat(none), '칸=PT|표시=시작 전');
  assert.strictEqual(none.tail, '— 아직 체크하지 않았습니다.');
  const auto = pb.infoParts(r, infoOf('INST_ANALYSIS'), { mark_cd: 'DONE', marked_on: '2026-11-18' }, MARKS);
  assert.strictEqual(flat(auto), '칸=기관 정보 분석|표시=완료|기록한 날=2026-11-18');
  assert.strictEqual(auto.tail, '— 사전준비 과제에서 시스템이 채웁니다.');
  assert.strictEqual(pb.infoParts(r, infoOf('PROPOSAL'), { mark_cd: 'IN_PROGRESS' }, MARKS).tail, '— 디자이너 작업 결과로 시스템이 채웁니다.');
  const nt = pb.infoParts(r, infoOf('NOTICE_CHECK'), { notice_status_name: '공고 진행 중' }, MARKS);
  assert.strictEqual(flat(nt), '칸=입찰공고확인|공고 상태=공고 진행 중');
  assert.strictEqual(nt.tail, '— 공고 판정에서 가져옵니다.');
});

test('infoHtml: 서버 값은 이스케이프', function () {
  const html = pb.infoHtml({ parts: [{ l: '체크한 사람', v: '<b onclick=x>' }, { l: '체크한 날', v: '2026-11-20', mono: true }], tail: '<i>' });
  assert.ok(html.indexOf('<b onclick') < 0 && html.indexOf('&lt;b onclick=x&gt;') > 0 && html.indexOf('<b class="m">2026-11-20</b>') > 0 && html.indexOf('&lt;i&gt;') > 0);
});

test('menuHtml: 4가지 값(키 1~4)·현재 값 aria-checked·마지막 체크 줄', function () {
  const r = row();
  const h = pb.menuHtml(r, infoOf('BOARD_SECRETARIAT'), { mark_cd: 'IN_PROGRESS', marked_on: '2026-11-20', by_name: '김영업' }, MARKS);
  assert.ok(h.indexOf('<b>이사회 › 사무국 — 청주시</b>마지막 체크 2026-11-20 김영업') > 0);
  assert.strictEqual((h.match(/role="menuitemradio"/g) || []).length, 4);
  assert.deepStrictEqual((h.match(/data-mk="[A-Z_]+"/g) || []), ['data-mk="DONE"', 'data-mk="IN_PROGRESS"', 'data-mk="NA"', 'data-mk="NONE"']);
  assert.ok(/aria-checked="true"[^>]*data-mk="IN_PROGRESS"/.test(h) && (h.match(/aria-checked="true"/g) || []).length === 1);
  assert.ok(h.indexOf('<span class="kk">1</span>') > 0 && h.indexOf('<span class="kk">4</span>') > 0);
  assert.ok(h.indexOf('시작 전(빈칸)') > 0);
  assert.ok(pb.menuHtml(r, infoOf('PT'), { mark_cd: 'NONE' }, MARKS).indexOf('아직 체크하지 않았습니다.') > 0);
  const evil = pb.menuHtml(row({ institution_name: '<u>' }), infoOf('PT'), {}, MARKS);
  assert.ok(evil.indexOf('<u>') < 0);
});

test('legendHtml: 완료·진행·대상 아님·시작 전 + 자동·날짜 안내(글자 아이콘 없음)', function () {
  const l = pb.legendHtml();
  ['완료', '진행', '대상 아님', '시작 전', '머리에 \'자동\'이 붙은 칸은 시스템이 채웁니다', '체크한 날은 저장한 날로 자동 기록됩니다'].forEach(function (s) { assert.ok(l.indexOf(s) > 0, s); });
  assert.strictEqual((l.match(/<svg /g) || []).length, 3);
});

// ── 정적 검사 ──
test('소스 규칙: 저장소·자동 새로고침·confirm·외부 주소·새 hex 없음, 화면·버튼 이름과 API 주소', function () {
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC), '저장소를 쓰지 않는다');
  assert.ok(!/setInterval|setTimeout|requestAnimationFrame/.test(SRC), '자동 새로고침 없음(main 결정 6)');
  assert.ok(!/\bconfirm\(/.test(SRC) && !/https?:\/\//.test(SRC));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC), '새 hex 금지');
  assert.ok(SRC.indexOf('검증됨') < 0);
  assert.ok(!/innerHTML\s*=\s*[^;]*\be\.(message|detail)/.test(SRC));
  assert.ok(SRC.indexOf("pb.SCREEN = 'prep_dashboard'") > 0);
  assert.ok(SRC.indexOf("ui('dash_check')") > 0 && SRC.indexOf('function ui(button) { return { screen: pb.SCREEN, button: button }; }') > 0);
  assert.ok(/load\(x\.reload \? 'refresh' : 'open'/.test(SRC) && /load\('refresh'\)/.test(SRC));
  assert.ok(SRC.indexOf("'/prep-board' + (B.ended ? '?include_ended=true' : '')") > 0);
  assert.ok(SRC.indexOf("'/prep/board-checks/'") > 0 && /'PUT', '\/bidcases\//.test(SRC));
  assert.ok(/mark_cd: mark, base_rev: base/.test(SRC), '본문은 mark_cd·base_rev만(날짜·사람은 서버가 정한다)');
  assert.ok(!/done_date/.test(SRC));
});

test('소스 규칙: 서버 값을 넣는 마크업은 모두 esc를 거친다(원시 보간 없음)', function () {
  // innerHTML·outerHTML 대입 줄: 허용된 조립 함수(pb.*Html·stateBox·옵션)만
  SRC.split('\n').forEach(function (line, i) {
    if (!/\.(innerHTML|outerHTML)\s*=/.test(line)) return;
    assert.ok(/pb\.(tableHtml|cellHtml|menuHtml|infoHtml|countHtml|legendHtml)|stateBox\(|esc\(o\.(value|label)\)|= ''/.test(line), 'L' + (i + 1) + ': ' + line.trim());
  });
  assert.ok(!/\$\{/.test(SRC), '템플릿 문자열 보간 없음');
});

test('prep.js 연결: 표가 있을 때만 전환(boardOn), 상세 열기는 prep_dashboard, 뒤로 가기·계정 변경 정리', function () {
  assert.ok(PREP_SRC.indexOf("function boardOn() { return !!(root.prepboard && root.prepboard.show && el('pp-board')); }") > 0);
  assert.ok(PREP_SRC.indexOf("req('GET', base(id), undefined, ui(S.fromBoard ? 'prep_dashboard' : 'prep_detail', 'open'))") > 0);
  assert.ok(PREP_SRC.indexOf("case 'back': if (boardOn()) backToBoard(); return;") > 0);
  assert.ok(PREP_SRC.indexOf("root.prepboard.show(boardHooks(), { reload: true, focusBid: bid })") > 0);
  assert.ok(PREP_SRC.indexOf("if (boardOn() && S.view === 'board') { root.prepboard.show(boardHooks()); return; }") > 0);
  assert.strictEqual((PREP_SRC.match(/root\.prepboard\.reset\(\)/g) || []).length, 2, '계정이 바뀌는 두 곳에서 표를 비운다');
  assert.ok(PREP_SRC.indexOf("bk.textContent = '← 대시보드로'") > 0 && PREP_SRC.indexOf("bk.setAttribute('data-act', 'back')") > 0);
  // 옛 목록 화면의 id와 배선은 그대로(표가 없을 때의 화면)
  ['pp-list', 'pp-tabs', 'pp-q', 'pp-items', 'pp-count'].forEach(function (id) { assert.ok(PREP_SRC.indexOf("'" + id + "'") > 0, id); });
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(PREP_SRC));
});

test('prep.openCase·상세 요청 화면 이름: 표에서 연 상세만 prep_dashboard', function () {
  assert.strictEqual(typeof prep.openCase, 'function');
  assert.ok(PREP_SRC.indexOf("S.view = 'case'; S.fromBoard = true;") > 0);   // 표에서 연 상세
  assert.ok(/S\.fromBoard = false;\s*S\.pendingCase = true;/.test(PREP_SRC));   // 지도·현황판이 연 상세는 prep_detail
});

// ── index.html (main이 마크업·script·CSS를 넣은 뒤부터 켜진다) ──
test('index.html: 표 마크업·script 순서·CSS 규칙(들어간 경우에만)', function () {
  if (HTML.indexOf('id="pp-board"') < 0 && HTML.indexOf('js/prepboard.js') < 0) return;
  ['pp-board', 'pb-title', 'pb-q', 'pb-who', 'pb-ended', 'pb-count', 'pb-at', 'pb-refresh', 'pb-legend', 'pb-ro', 'pb-err', 'pb-scroll', 'pb-info', 'pb-live'].forEach(function (id) {
    assert.ok(HTML.indexOf('id="' + id + '"') > 0, id);
  });
  ['pp-root', 'pp-gate', 'pp-wrap', 'pp-list', 'pp-pane', 'pp-case', 'pp-modal'].forEach(function (id) { assert.ok(HTML.indexOf('id="' + id + '"') > 0, id); });
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('prepboard.js') > at('prep.js') && at('prepboard.js') < at('app.js'), 'prepboard.js는 prep.js 뒤, app.js 앞');
  assert.ok(/role="alert"/.test(HTML.slice(HTML.indexOf('id="pb-err"') - 60, HTML.indexOf('id="pb-err"') + 60)));
  assert.ok(/role="status"/.test(HTML.slice(HTML.indexOf('id="pb-live"') - 60, HTML.indexOf('id="pb-live"') + 60)));
  const a = HTML.indexOf('#pp-board {'), b = HTML.indexOf('.pb-back {');
  assert.ok(a > 0 && b > a, 'pb CSS 블록');
  const css = HTML.slice(a, b + 200);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '새 hex 금지(토큰만)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 12, m); });
  assert.ok(!/box-shadow:\s*0\s/.test(css), '번지는 그림자 금지');
});

// ── DOM 모의: 계정 전환(reset) 회귀 (qa 11-23 P2-1·P3-1) ──
const ENV = (function () {
  const L = {};
  const sec = { addEventListener: function (t, f) { L[t] = f; }, setAttribute: function () {} };
  const box = { innerHTML: '', scrollLeft: 0, scrollTop: 0, querySelectorAll: function () { return []; } };
  const menu = { style: {}, innerHTML: '', listeners: {}, setAttribute: function () {}, contains: function () { return false; },
    querySelectorAll: function () { return []; }, addEventListener: function (t, f) { this.listeners[t] = f; } };
  const doc = { getElementById: function (id) { return id === 'pp-board' ? sec : id === 'pb-scroll' ? box : null; },
    createElement: function () { return menu; }, body: { appendChild: function () {}, contains: function () { return true; } },
    addEventListener: function () {} };
  return { L: L, box: box, menu: menu, doc: doc };
})();
function withDom(fn) {
  return async function () {
    globalThis.document = ENV.doc;
    globalThis.window = { innerHeight: 800, innerWidth: 1200 };
    try { pb.reset(); ENV.box.innerHTML = ''; ENV.menu.style.display = 'none'; await fn(); }
    finally { delete globalThis.document; delete globalThis.window; }
  };
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }
function boardData(name) {
  return { columns: COLUMNS, groups: GROUPS, marks: MARKS, today: '2026-11-23', rows: [row({ institution_name: name })] };
}
function deferredHooks() {
  const pend = [];
  return { pend: pend, roleLabel: '영업', openCase: function () {}, openMap: function () {},
    req: function () { return new Promise(function (res) { pend.push(res); }); } };
}

test('T8 reset: 요청 A 진행 중 계정 전환 → 요청 B가 먼저 오고 A가 늦게 와도 화면은 B 응답', withDom(async function () {
  const hA = deferredHooks(), hB = deferredHooks();
  pb.show(hA, {});
  pb.reset();
  pb.show(hB, {});
  hB.pend[0](boardData('충주시'));
  await flush();
  hA.pend[0](boardData('청주시'));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('충주시') >= 0, 'B 응답이 보인다');
  assert.ok(ENV.box.innerHTML.indexOf('청주시') < 0, '옛 계정 응답은 버린다');
}));

test('T9 reset: 칸 메뉴가 열린 채 계정 전환 → 메뉴는 숨겨진다', withDom(async function () {
  const h = deferredHooks();
  pb.show(h, {});
  h.pend[0](boardData('청주시'));
  await flush();
  const tr = { getAttribute: function (k) { return k === 'data-bid' ? 'B1' : null; } };
  const td = { parentNode: tr, getAttribute: function (k) { return k === 'data-col' ? 'PT' : null; } };
  const btn = { classList: { contains: function (c) { return c === 'pb-mk'; } }, getAttribute: function () { return null; },
    setAttribute: function () {}, contains: function () { return false; }, focus: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, bottom: 10 }; },
    closest: function (s) { return s === 'td' ? td : s === 'button' ? btn : null; } };
  ENV.L.click({ target: btn });
  assert.strictEqual(ENV.menu.style.display, '', '메뉴가 열렸다');
  pb.reset();
  assert.strictEqual(ENV.menu.style.display, 'none', 'reset 뒤 메뉴가 숨겨진다');
}));

// qa P3-7 — 표에서 상세를 열 때 숨은 왼쪽 목록(GET /preps)을 부르지 않는다. 옛 화면(refresh)은 그대로.
test('enterCase(P3-7): 표에서 연 상세는 /preps 목록을 부르지 않는다, 옛 화면 refresh는 loadList 유지', function () {
  const a = PREP_SRC.indexOf('function enterCase(bid) {');
  const b = PREP_SRC.indexOf('function backToBoard()');
  assert.ok(a > 0 && b > a, 'enterCase 범위');
  const body = PREP_SRC.slice(a, b);
  assert.ok(/if \(!boardOn\(\)\) loadList\(\);/.test(body), '표가 없을 때만 목록을 부른다');
  assert.ok(!/(^|[^!\w.])loadList\(\)/m.test(body.replace(/if \(!boardOn\(\)\) loadList\(\);/, '')), '조건 없이 loadList를 부르지 않는다');
  assert.ok(body.indexOf("S.view = 'case'; S.fromBoard = true;") > 0, '시작 상태 그대로');
  assert.ok(body.indexOf('showView();') < body.indexOf('loadDetail(S.selected, { popup: true })'), '상세는 그대로 연다');
  const r = PREP_SRC.slice(PREP_SRC.indexOf('function refresh() {'), PREP_SRC.indexOf('// ── 쓰기 공통'));
  assert.ok(/paintList\(\);\s*loadList\(\);/.test(r), '옛 화면 refresh의 목록 호출 유지');
});
