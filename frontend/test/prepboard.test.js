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

// ── 열 머리 글자·표 정렬 규격(design 11-24 6-1~6-3) ──
test('headLabel: esc 먼저, 괄호 앞에만 <wbr> — 머리 출력에 반영', function () {
  assert.strictEqual(pb.headLabel('가결위(재무)'), '가결위<wbr>(재무)');
  assert.strictEqual(pb.headLabel('A<b>(x)'), 'A&lt;b&gt;<wbr>(x)');
  assert.strictEqual(pb.headLabel('사무국'), '사무국');
  const head = pb.headHtml(COLUMNS, GROUPS);
  assert.ok(head.indexOf('rowspan="2" scope="col">가결위<wbr>(재무)') > 0);
  assert.ok(head.indexOf('출심위<wbr>(사업부)') > 0);
});

test('CSS: 칸 열 68px, 머리 세로 가운데, 칸 안 2줄 grid', function () {
  assert.ok(/col\.c-mk \{ width:68px; \}/.test(HTML));
  assert.ok(!/col\.c-mk \{ width:60px; \}/.test(HTML));
  assert.ok(/thead th\[rowspan="2"\] \{[^}]*vertical-align:middle;/.test(HTML));
  assert.ok(!/thead th\[rowspan="2"\] \{[^}]*vertical-align:bottom;/.test(HTML));
  assert.ok(/thead th\.pb-corner \{[^}]*vertical-align:middle;/.test(HTML));
  assert.ok(/\.pb-in, \.pb-mk \{[^}]*grid-template-rows:14px 14px;[^}]*height:43px;/.test(HTML));
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
test('filterRows: 이름 검색만 — 범위(is_mine)로 다시 거르지 않고 서버 순서(입찰 예정일 순)를 그대로 둔다', function () {
  const rows = [
    row({ bid_case_id: 'a', institution_name: '청주시', is_mine: true }),
    row({ bid_case_id: 'b', institution_name: '진주시', is_mine: false }),
    row({ bid_case_id: 'c', institution_name: '서울시', is_mine: false }),
    row({ bid_case_id: 'd', institution_name: '청주시청', is_mine: false }),
  ];
  const ids = function (f) { return pb.filterRows(rows, f).map(function (r) { return r.bid_case_id; }).join(''); };
  assert.strictEqual(ids({}), 'abcd');
  assert.strictEqual(ids({ q: '  청주 ' }), 'ad');
  assert.strictEqual(ids({ q: '시' }), 'abcd');
  assert.strictEqual(ids({ q: '진주' }), 'b');
  assert.strictEqual(ids({ q: '없는곳' }), '');
  assert.strictEqual(ids(null), 'abcd');
  assert.strictEqual(ids({ who: '@mine' }), 'abcd', '옛 담당자 거르기는 없다');
  assert.deepStrictEqual(pb.filterRows(null, {}), []);
  assert.strictEqual(pb.whoOptions, undefined); assert.strictEqual(pb.WHO_MINE, undefined);
});

// ── 조회 범위(내 작업·팀 작업·부서 작업, 사용자 11-24) ──
test('scopeLabel·scopeValid: 3가지뿐, 모르면 내 작업', function () {
  assert.deepStrictEqual(pb.SCOPES, ['mine', 'team', 'dept']);
  assert.deepStrictEqual(['mine', 'team', 'dept'].map(pb.scopeLabel), ['내 작업', '팀 작업', '부서 작업']);
  assert.strictEqual(pb.scopeLabel(''), '내 작업');
  assert.strictEqual(pb.scopeValid('team'), true);
  ['', 'all', 'MINE', null, undefined].forEach(function (s) { assert.strictEqual(pb.scopeValid(s), false); });
});

test('boardUrl: 첫 요청은 scope 없이, 범위를 알면 scope를, 끝난 건 포함은 &로', function () {
  assert.strictEqual(pb.boardUrl('', false), '/prep-board');
  assert.strictEqual(pb.boardUrl(undefined, false), '/prep-board');
  assert.strictEqual(pb.boardUrl('team', false), '/prep-board?scope=team');
  assert.strictEqual(pb.boardUrl('dept', true), '/prep-board?scope=dept&include_ended=true');
  assert.strictEqual(pb.boardUrl('', true), '/prep-board?include_ended=true');
  assert.strictEqual(pb.boardUrl('all', false), '/prep-board', '모르는 값은 싣지 않는다');
});

test('scopeNoteText·liveText: 팀·부서일 때만 안내, team_resolved:false는 앞에 결재선 안내', function () {
  assert.strictEqual(pb.scopeNoteText('mine', true), '');
  assert.strictEqual(pb.scopeNoteText('', true), '');
  assert.strictEqual(pb.scopeNoteText('team', true), pb.T.scopeNote);
  assert.strictEqual(pb.scopeNoteText('dept', true), pb.T.scopeNote);
  assert.strictEqual(pb.scopeNoteText('dept', false), pb.T.scopeNote, '부서는 team_resolved와 무관');
  const t = pb.scopeNoteText('team', false);
  assert.ok(t.indexOf('상위 결재자(소속 팀장)가 지정되지 않아 팀 작업에 내가 담당한 기관만 나옵니다. 시스템 관리자에게 상위 결재자 지정을 요청하세요.') === 0 && t.indexOf(pb.T.scopeNote) > 0);
  assert.ok(pb.T.scopeNote.indexOf('개설 승인(팀장 결재)이 끝난 기관만') > 0);
  assert.strictEqual(pb.liveText('team', 12), '팀 작업, 기관 12곳');
  assert.strictEqual(pb.liveText('mine', 0), '내 작업, 기관 0곳');
});

test('countHtml·emptyModel·readOnlyAll', function () {
  assert.strictEqual(pb.countHtml(pb.countModel(12, 12)), '기관 <b>12</b>곳');
  assert.strictEqual(pb.countHtml(pb.countModel(3, 12)), '기관 <b>3</b>곳 중 <b>12</b>곳');
  const acts = function (m) { return m.actions.map(function (a) { return a.act + ':' + a.label; }).join('|'); };
  // 빈 결과 6-4: 범위별 문구·단추
  const m0 = pb.emptyModel(0, 0, { scope: 'mine' });
  assert.strictEqual(m0.text, pb.T.emptyMine);
  assert.strictEqual(acts(m0), 'map:입찰 현황판 열기|scope-team:팀 작업 보기');
  assert.deepStrictEqual(pb.emptyModel(0, 0, {}), m0, '범위를 모르면 내 작업');
  const mt = pb.emptyModel(0, 0, { scope: 'team' });
  assert.strictEqual(mt.text, '팀에 개설 승인이 끝난 기관이 없습니다. 개설 전 기관은 내 작업에서 봅니다.');
  assert.strictEqual(acts(mt), 'scope-mine:내 작업 보기');
  const ms = pb.emptyModel(0, 0, { scope: 'team', teamResolved: false });
  assert.strictEqual(ms.text, '내가 담당한 기관 중 개설 승인이 끝난 곳이 없습니다. 개설 전 기관은 내 작업에서 봅니다.');
  assert.strictEqual(acts(ms), 'scope-mine:내 작업 보기');
  assert.strictEqual(pb.emptyModel(0, 0, { scope: 'team', teamResolved: true }).text, pb.T.emptyTeam, '결재선이 있으면 팀 문구');
  assert.strictEqual(pb.emptyModel(0, 0, { scope: 'dept', teamResolved: false }).text, pb.T.emptyDept, '부서는 team_resolved와 무관');
  const md = pb.emptyModel(0, 0, { scope: 'dept' });
  assert.strictEqual(md.text, '부서에 개설 승인이 끝난 기관이 없습니다. 개설 전 기관은 내 작업에서 봅니다.');
  assert.strictEqual(acts(md), 'scope-mine:내 작업 보기');
  assert.strictEqual(pb.emptyModel(5, 2, { scope: 'team' }), null);
  assert.strictEqual(pb.emptyModel(5, 0, { scope: 'team' }), null, '검색어가 없으면 표를 그린다');
  // 범위 안 검색 0건: 받침에 맞춰 과/와, 단추는 검색어만 지움
  const q1 = pb.emptyModel(5, 0, { q: ' 청주 ', scope: 'team' });
  assert.deepStrictEqual(q1, { kind: 'query', text: '팀 작업에서 \'청주\'와 맞는 기관이 없습니다.', actions: [{ act: 'clearq', label: '검색 지우기' }] });
  assert.strictEqual(pb.emptyModel(5, 0, { q: '진주', scope: 'dept' }).text, '부서 작업에서 \'진주\'와 맞는 기관이 없습니다.');
  assert.strictEqual(pb.emptyModel(5, 0, { q: '북구', scope: 'mine' }).text, '내 작업에서 \'북구\'와 맞는 기관이 없습니다.');
  assert.strictEqual(pb.emptyModel(5, 0, { q: '강남', scope: 'mine' }).text, '내 작업에서 \'강남\'과 맞는 기관이 없습니다.');
  assert.ok(pb.T.emptyMine.indexOf('[제안 사전준비]') > 0 && pb.T.emptyMine.indexOf('[제안 확정]') < 0 && /나타납니다\.$/.test(pb.T.emptyMine) && pb.T.openMap === '입찰 현황판 열기' && pb.T.emptyMine.indexOf('입찰 현황판에서') > 0 && pb.T.emptyMine.indexOf('지역별 공고현황') < 0);
  assert.strictEqual(pb.T.all, '전체', 'headModel이 쓰는 T.all은 남긴다');
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

// ── 개설 승인 전 줄(NEXT 102) ──
test('preOpen: CONFIRMED·OPEN_PENDING만 참, 끝난 줄·다른 상태·빈 값은 거짓', function () {
  assert.strictEqual(pb.preOpen(row({ state_cd: 'CONFIRMED', can_check: false })), true);
  assert.strictEqual(pb.preOpen(row({ state_cd: 'OPEN_PENDING', can_check: false })), true);
  assert.strictEqual(pb.preOpen(row({ state_cd: 'CONFIRMED', ended: true })), false);
  assert.strictEqual(pb.preOpen(row({ state_cd: 'IN_PROGRESS' })), false);
  assert.strictEqual(pb.preOpen(row({ state_cd: undefined })), false);
  assert.strictEqual(pb.preOpen(null), false);
});

test('개설 전 손 칸: cellModel.pre·aria 꼬리·info 꼬리·is-pre — AUTO·NOTICE·다른 줄에는 없다', function () {
  const pre = row({ state_cd: 'OPEN_PENDING', can_check: false, is_mine: false, assignee_names: [] });
  assert.strictEqual(pb.cellModel(infoOf('PT'), pre, { mark_cd: 'NONE' }, '').pre, true);
  assert.strictEqual(pb.cellModel(infoOf('PT'), pre, { mark_cd: 'NONE' }, '').button, false);
  assert.strictEqual(pb.cellModel(infoOf('INST_ANALYSIS'), pre, {}, '').pre, false);
  assert.strictEqual(pb.cellModel(infoOf('NOTICE_CHECK'), pre, {}, '').pre, false);
  assert.strictEqual(pb.cellModel(infoOf('PT'), row({ can_check: false }), {}, '').pre, false);
  assert.strictEqual(pb.cellAria(pre, infoOf('PT'), { mark_cd: 'NONE' }, MARKS, ''), '청주시 PT: 시작 전, 개설 승인 뒤 담당 영업이 체크');
  assert.strictEqual(pb.cellAria(pre, infoOf('PT'), { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '김영업' }, MARKS, ''),
    '청주시 PT: 완료, 2026-11-20 김영업 체크, 개설 승인 뒤 담당 영업이 체크');
  assert.ok(pb.cellAria(pre, infoOf('PROFIT'), { mark_cd: 'DONE' }, MARKS, '').indexOf('개설 승인 뒤') < 0, 'AUTO 칸 꼬리 없음');
  assert.ok(pb.cellAria(pre, infoOf('NOTICE_CHECK'), {}, MARKS, '').indexOf('개설 승인 뒤') < 0, 'NOTICE 칸 꼬리 없음');
  assert.ok(pb.cellAria(row({ can_check: false }), infoOf('PT'), { mark_cd: 'NONE' }, MARKS, '').indexOf('개설 승인 뒤') < 0, '다른 담당 줄은 그대로(P3 미적용)');
  assert.strictEqual(pb.infoParts(pre, infoOf('PT'), { mark_cd: 'NONE' }, MARKS).tail, '— 아직 체크하지 않았습니다. 개설 승인 뒤 정해지는 담당 영업이 체크합니다.');
  assert.strictEqual(pb.infoParts(pre, infoOf('PT'), { mark_cd: 'DONE', marked_on: '2026-11-20', by_name: '김영업' }, MARKS).tail, pb.T.infoPre);
  assert.strictEqual(pb.infoParts(pre, infoOf('PROFIT'), { mark_cd: 'DONE' }, MARKS).tail, '— ' + pb.T.infoAuto, 'AUTO 꼬리 그대로');
  const h = pb.cellHtml({ info: infoOf('PT'), row: pre, cell: { mark_cd: 'NONE' }, marks: MARKS, today: '', r: 0, c: 14 });
  assert.ok(/class="[^"]*\bis-pre\b/.test(h) && h.indexOf('aria-readonly="true"') > 0 && h.indexOf('<button') < 0);
  const hAuto = pb.cellHtml({ info: infoOf('PROFIT'), row: pre, cell: {}, marks: MARKS, today: '', r: 0, c: 3 });
  assert.ok(hAuto.indexOf('is-pre') < 0);
  const hOther = pb.cellHtml({ info: infoOf('PT'), row: row({ can_check: false }), cell: {}, marks: MARKS, today: '', r: 0, c: 14 });
  assert.ok(hOther.indexOf('is-pre') < 0);
});

test('rowHtml 칩: 개설 전 → \'개설 전\'(내 담당 칩 대신), 끝난 줄이 우선', function () {
  const a = pb.rowHtml({ row: row({ state_cd: 'CONFIRMED', can_check: false, is_mine: true }), infos: infos, marks: MARKS, today: '', r: 0 });
  assert.ok(a.indexOf('>개설 전</span>') > 0 && a.indexOf('>내 담당</span>') < 0);
  const b = pb.rowHtml({ row: row({ state_cd: 'CONFIRMED', ended: true, state_name: '확정 취소', is_mine: false }), infos: infos, marks: MARKS, today: '', r: 0 });
  assert.ok(b.indexOf('>확정 취소</span>') > 0 && b.indexOf('개설 전') < 0);
  assert.strictEqual((a.match(/class="[^"]*\bis-pre\b/g) || []).length, 23, '손 칸 23개에만 빗금');
});

// ── NEXT 125 S3a: 28칸(제안서 제출)·결과발표 선정·탈락(WON·LOST)·columns[].marks·result_recheck ──
const COLUMNS28 = COLUMNS.slice(0, 13).concat([col('PROPOSAL_SUBMIT', '제안서 제출')]).concat(COLUMNS.slice(13)).map(function (c) {
  return Object.assign({}, c, { marks: c.col_cd === 'RESULT' ? ['WON', 'LOST', 'NA', 'NONE'] : ['DONE', 'IN_PROGRESS', 'NA', 'NONE'] });
});
const RES_MARKS = [{ mark_cd: 'WON', symbol: null, name: '선정' }, { mark_cd: 'LOST', symbol: null, name: '탈락' },
                   { mark_cd: 'NA', symbol: '-', name: '대상 아님' }, { mark_cd: 'NONE', symbol: '', name: '시작 전' }];
const infos28 = pb.colInfos(COLUMNS28, GROUPS);
function info28(cd) { return infos28.filter(function (i) { return i.cd === cd; })[0]; }
function menuOrder(h) { return (h.match(/data-mk="([A-Z_]+)"/g) || []).map(function (s) { return s.replace(/data-mk="|"/g, ''); }); }

test('S3a 값 이름: WON=선정·LOST=탈락, 글자는 symbol이 null이면 이름, 있으면 symbol, 그 밖 값은 글자 없음', function () {
  assert.strictEqual(pb.markName(MARKS, 'WON'), '선정');
  assert.strictEqual(pb.markName(MARKS, 'LOST'), '탈락');
  const merged = pb.mergeResultMarks(MARKS, RES_MARKS);
  assert.deepStrictEqual(merged.map(function (m) { return m.mark_cd; }), ['DONE', 'IN_PROGRESS', 'NA', 'NONE', 'WON', 'LOST'], 'NA·NONE은 겹치지 않는다');
  assert.strictEqual(pb.mergeResultMarks(MARKS, undefined), MARKS, 'result_marks가 없으면(옛 서버) 그대로');
  assert.strictEqual(pb.markText(merged, 'WON'), '선정');
  assert.strictEqual(pb.markText(merged, 'LOST'), '탈락');
  assert.strictEqual(pb.markText(merged.concat([{ mark_cd: 'WON', symbol: 'O' }]).slice(0, 5), 'WON'), '선정');
  assert.strictEqual(pb.markText([{ mark_cd: 'WON', symbol: 'O', name: '선정' }], 'WON'), 'O');
  assert.strictEqual(pb.markText(merged, 'DONE'), '');
});

test('S3a 28칸: colInfos가 columns[].marks를 싣고, 표의 칸 수·colgroup·aria-colcount가 칸 수를 따른다', function () {
  assert.strictEqual(COLUMNS28.length, 28);
  assert.deepStrictEqual(info28('RESULT').marks, ['WON', 'LOST', 'NA', 'NONE']);
  assert.deepStrictEqual(info28('PT').marks, ['DONE', 'IN_PROGRESS', 'NA', 'NONE']);
  assert.deepStrictEqual(infoOf('RESULT').marks, [], '옛 서버(marks 없음)는 빈 목록');
  assert.deepStrictEqual(pb.colInfos([Object.assign(col('X', 'x'), { marks: ['WON', 'EVIL', 5] })], {})[0].marks, ['WON'], '모르는 값은 버린다');
  const rows = [row({ bid_case_id: 'B1' }), row({ bid_case_id: 'B2', ended: true })];
  const h = pb.tableHtml({ columns: COLUMNS28, groups: GROUPS, marks: pb.mergeResultMarks(MARKS, RES_MARKS), rows: rows, today: '2026-11-23', pending: {}, failed: {} });
  assert.strictEqual((h.match(/<td /g) || []).length, 2 * 28);
  assert.strictEqual((h.match(/<col /g) || []).length, 29);
  assert.ok(h.indexOf('aria-colcount="29"') > 0 && h.indexOf('aria-rowcount="4"') > 0);
  assert.ok(h.indexOf('data-col="PROPOSAL_SUBMIT"') > 0 && h.indexOf('>제안서 제출</th>') > 0, '새 칸은 머리와 몸통에 있다');
  assert.ok(/<th [^>]*rowspan="2"[^>]*>제안서 제출<\/th>/.test(h), '묶음 없는 칸은 rowspan 2');
});

test('S3a 체크 메뉴: RESULT는 columns[].marks(선정·탈락·대상 아님·시작 전), 다른 칸은 기존 4개, marks가 없는 옛 서버는 기존 4개', function () {
  const merged = pb.mergeResultMarks(MARKS, RES_MARKS);
  const r = row();
  const res = pb.menuHtml(r, info28('RESULT'), { mark_cd: 'NONE' }, merged);
  assert.deepStrictEqual(menuOrder(res), ['WON', 'LOST', 'NA', 'NONE']);
  assert.ok(res.indexOf('<span>선정</span>') > 0 && res.indexOf('<span>탈락</span>') > 0 && res.indexOf('시작 전(빈칸)') > 0);
  assert.deepStrictEqual(menuOrder(pb.menuHtml(r, info28('PT'), { mark_cd: 'NONE' }, merged)), ['DONE', 'IN_PROGRESS', 'NA', 'NONE']);
  assert.deepStrictEqual(menuOrder(pb.menuHtml(r, infoOf('RESULT'), { mark_cd: 'NONE' }, MARKS)), ['DONE', 'IN_PROGRESS', 'NA', 'NONE'], '옛 서버 RESULT');
  assert.deepStrictEqual(menuOrder(pb.menuHtml(r, infoOf('RESULT'), { mark_cd: 'NONE' }, merged)), ['DONE', 'IN_PROGRESS', 'NA', 'NONE'], 'info.marks가 없으면 WON·LOST는 쓰지 않는다');
  assert.deepStrictEqual(menuOrder(pb.menuHtml(r, infoOf('RESULT'), { mark_cd: 'NONE' }, undefined)), ['DONE', 'IN_PROGRESS', 'NA', 'NONE']);
  assert.ok(pb.menuHtml(r, info28('RESULT'), { mark_cd: 'WON' }, merged).indexOf('aria-checked="true" tabindex="-1" data-mk="WON"') > 0, '현재 값 표시');
});

test('S3a 결과발표 칸: 선정·탈락은 글리프 대신 이름 글자(색만으로 구분하지 않음)', function () {
  const merged = pb.mergeResultMarks(MARKS, RES_MARKS);
  const won = pb.cellHtml({ info: info28('RESULT'), row: row(), cell: { mark_cd: 'WON', marked_on: '2026-11-22', by_name: '김영업' }, marks: merged, today: '2026-11-23', r: 0, c: 15 });
  assert.ok(/<span class="pb-tx pb-won">선정<\/span>/.test(won) && won.indexOf('<svg') < 0 && won.indexOf('11-22') > 0);
  assert.ok(won.indexOf('aria-label="청주시 결과발표: 선정, 2026-11-22 김영업 체크"') > 0);
  const lost = pb.cellHtml({ info: info28('RESULT'), row: row({ can_check: false }), cell: { mark_cd: 'LOST' }, marks: merged, today: '', r: 0, c: 15 });
  assert.ok(/<span class="pb-tx pb-lost">탈락<\/span>/.test(lost) && lost.indexOf('aria-readonly="true"') > 0);
  assert.strictEqual(pb.cellModel(info28('RESULT'), row(), { mark_cd: 'WON' }, '').mark, 'WON', '모르는 값이 아니다');
  assert.strictEqual(pb.cellModel(info28('RESULT'), row(), { mark_cd: 'WON' }, '').tint, '');
  const evil = pb.cellHtml({ info: info28('RESULT'), row: row(), cell: { mark_cd: 'WON' }, marks: [{ mark_cd: 'WON', symbol: '<img src=x onerror=1>', name: '선정' }], today: '', r: 0, c: 1 });
  assert.ok(evil.indexOf('<img') < 0 && evil.indexOf('&lt;img') > 0);
  assert.strictEqual(pb.infoParts(row(), info28('RESULT'), { mark_cd: 'LOST', marked_on: '2026-11-22' }, merged).parts[1].v, '탈락');
});

test('S3a result_recheck: 옛 완료·진행이 남은 결과발표 칸에만 \'다시 고르기\'(글자·title·aria·info), 다른 칸·다른 값·recheck=false는 없다', function () {
  const merged = pb.mergeResultMarks(MARKS, RES_MARKS);
  const rc = row({ result_recheck: true });
  const m = pb.cellModel(info28('RESULT'), rc, { mark_cd: 'DONE', marked_on: '2026-11-10' }, '2026-11-23');
  assert.strictEqual(m.recheck, true);
  assert.strictEqual(m.tint, '', '완료처럼 색칠하지 않는다');
  assert.strictEqual(m.glyph, 'prog');
  const h = pb.cellHtml({ info: info28('RESULT'), row: rc, cell: { mark_cd: 'IN_PROGRESS', marked_on: '2026-11-10', by_name: '김영업' }, marks: merged, today: '2026-11-23', r: 0, c: 15 });
  assert.ok(h.indexOf('<span class="pb-rc">재선택</span>') > 0);
  assert.ok(h.indexOf('title="선정·탈락을 다시 골라야 함"') > 0);
  assert.ok(h.indexOf('data-mk=') < 0 || h.indexOf('data-mk="IN_PROGRESS"') < 0, '칸 색(data-mk) 없음');
  assert.ok(/aria-label="청주시 결과발표: 진행, [^"]*선정·탈락을 다시 골라야 함"/.test(h));
  const ro = pb.cellHtml({ info: info28('RESULT'), row: row({ result_recheck: true, can_check: false }), cell: { mark_cd: 'DONE' }, marks: merged, today: '', r: 0, c: 15 });
  assert.ok(ro.indexOf('>재선택<') > 0 && ro.indexOf('title="선정·탈락을 다시 골라야 함"') > 0 && ro.indexOf('<button') < 0, '읽기 전용 칸에도 알림');
  assert.ok(pb.infoParts(rc, info28('RESULT'), { mark_cd: 'DONE' }, merged).parts.some(function (p) { return p.l === '안내' && p.v === '선정·탈락을 다시 골라야 함'; }));
  // 없어야 하는 경우
  assert.strictEqual(pb.cellModel(info28('RESULT'), row({ result_recheck: false }), { mark_cd: 'DONE' }, '').recheck, false);
  assert.strictEqual(pb.cellModel(info28('RESULT'), row(), { mark_cd: 'DONE' }, '').recheck, false, '키가 없는 옛 서버');
  assert.strictEqual(pb.cellModel(info28('RESULT'), rc, { mark_cd: 'WON' }, '').recheck, false, '이미 다시 골랐으면 없다');
  assert.strictEqual(pb.cellModel(info28('RESULT'), rc, { mark_cd: 'NONE' }, '').recheck, false);
  assert.strictEqual(pb.cellModel(info28('PT'), rc, { mark_cd: 'DONE' }, '').recheck, false, '다른 칸은 해당 없음');
  assert.ok(pb.cellHtml({ info: info28('PT'), row: rc, cell: { mark_cd: 'DONE' }, marks: merged, today: '', r: 0, c: 1 }).indexOf('재선택') < 0);
  assert.ok(pb.cellAria(row(), info28('RESULT'), { mark_cd: 'DONE' }, merged, '').indexOf('다시 골라야') < 0);
});

test('readOnlyAll·preOnly·roText: 개설 전·끝난 줄은 세지 않는다', function () {
  const pre = function (o) { return row(Object.assign({ state_cd: 'OPEN_PENDING', can_check: false }, o || {})); };
  const open = function (o) { return row(Object.assign({ can_check: false }, o || {})); };
  const end = function (o) { return row(Object.assign({ ended: true, can_check: false }, o || {})); };
  assert.strictEqual(pb.readOnlyAll([pre(), pre()]), false);
  assert.strictEqual(pb.preOnly([pre(), pre()]), true);
  assert.strictEqual(pb.roText([pre(), pre()]), pb.T.readOnlyPre);
  assert.strictEqual(pb.readOnlyAll([pre(), open()]), true);        // 개설 뒤 줄이 있는데 내가 체크할 줄이 없다
  assert.strictEqual(pb.preOnly([pre(), open()]), false);
  assert.strictEqual(pb.roText([pre(), open()]), pb.T.readOnly);
  assert.strictEqual(pb.readOnlyAll([pre(), open({ can_check: true })]), false);
  assert.strictEqual(pb.roText([pre(), open({ can_check: true })]), '');
  assert.strictEqual(pb.preOnly([pre(), end()]), true);             // 끝난 줄은 건너뛴다
  assert.strictEqual(pb.readOnlyAll([end(), end()]), false);        // 끝난 줄만 있으면 안내 없음(의미 변경)
  assert.strictEqual(pb.preOnly([end()]), false);
  assert.strictEqual(pb.roText([end()]), '');
  assert.strictEqual(pb.readOnlyAll([]), false); assert.strictEqual(pb.preOnly([]), false); assert.strictEqual(pb.roText(null), '');
});

test('legendHtml(hasPre): 개설 전 줄이 있을 때만 빗금 견본 + 문구, 인자 없으면 기존과 같다', function () {
  const on = pb.legendHtml(true);
  assert.ok(on.indexOf('<i class="sw-pre"></i>개설 승인 전 — 담당이 정해지면 체크합니다') > 0);
  assert.strictEqual(pb.legendHtml(false), pb.legendHtml());
  assert.ok(pb.legendHtml().indexOf('sw-pre') < 0);
  assert.strictEqual((on.match(/<svg /g) || []).length, 3);
});

test('index.html·소스: .pb-t td.is-pre·.sw-pre 규칙(새 hex 없음), #pb-ro·범례를 JS가 매번 채운다', function () {
  assert.ok(HTML.indexOf('.pb-t td.is-pre {') > 0 && HTML.indexOf('.pb-legend .sw-pre {') > 0);
  // is-pre 규칙은 값 칸 색(data-mk) 규칙보다 뒤에 있어야 빗금(image)이 shorthand에 지워지지 않는다
  assert.ok(HTML.indexOf('.pb-t td.is-pre {') > HTML.indexOf('.pb-t td[data-mk="IN_PROGRESS"] {'));
  assert.ok(SRC.indexOf('pb.roText(B.data.rows)') > 0 && SRC.indexOf('pb.legendHtml(!!(B.data') > 0);
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
  assert.ok(SRC.indexOf("hooks.req('GET', pb.boardUrl(B.scope, B.ended), undefined, ui(button))") > 0);
  assert.ok(!/B\.who|el\('pb-who'\)|WHO_MINE|whoOptions/.test(SRC), '담당자 거르기 없음(이름 칸의 .pb-who 글자 줄은 별개)');
  assert.strictEqual((SRC.match(/\.is_mine/g) || []).length, 1, 'is_mine은 \'내 담당\' 칩에만 쓴다(범위 거르기에 쓰지 않는다)');
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
  assert.ok(PREP_SRC.indexOf("bk.textContent = '← 제안 준비 현황으로'") > 0 && PREP_SRC.indexOf("bk.setAttribute('data-act', 'back')") > 0);
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
  ['pp-board', 'pb-title', 'pb-scope', 'pb-scope-note', 'pb-q', 'pb-ended', 'pb-count', 'pb-at', 'pb-refresh', 'pb-legend', 'pb-ro', 'pb-err', 'pb-scroll', 'pb-info', 'pb-live'].forEach(function (id) {
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

test('조회 범위 세그먼트 마크업: 그룹 이름·단추 3개·aria-pressed·안내 줄, 담당자 select 없음, #pb-q는 그 뒤', function () {
  const i = HTML.indexOf('<div class="pb-scope"');
  assert.ok(i > 0, '세그먼트 있음');
  const g = HTML.slice(i, HTML.indexOf('</div>', i));
  assert.ok(g.indexOf('id="pb-scope"') > 0 && g.indexOf('role="group"') > 0 && g.indexOf('aria-label="조회 범위"') > 0 && g.indexOf('aria-describedby="pb-scope-note"') > 0);
  assert.deepStrictEqual(g.match(/<button type="button" class="pb-sc" data-scope="(mine|team|dept)" aria-pressed="(true|false)">[^<]+<\/button>/g), [
    '<button type="button" class="pb-sc" data-scope="mine" aria-pressed="true">내 작업</button>',
    '<button type="button" class="pb-sc" data-scope="team" aria-pressed="false">팀 작업</button>',
    '<button type="button" class="pb-sc" data-scope="dept" aria-pressed="false">부서 작업</button>']);
  assert.ok(HTML.indexOf('id="pb-q"') > HTML.indexOf('id="pb-scope"'), '검색은 범위 뒤');
  assert.ok(HTML.indexOf('id="pb-who"') < 0 && HTML.indexOf('담당자 <select') < 0);
  assert.ok(/<p id="pb-scope-note" class="pb-legend" hidden>[^<]*개설 승인\(팀장 결재\)이 끝난 기관만[^<]*<\/p>/.test(HTML));
  assert.ok(HTML.indexOf('id="pb-scope-note"') < HTML.indexOf('id="pb-legend"'), '안내 줄은 범례 앞');
  assert.ok(/\.pb-sc\[aria-pressed="true"\] \{[^}]*font-weight:700;/.test(HTML) && /\.pb-sc:focus-visible \{/.test(HTML) && /\.pb-scope \{ display:inline-flex; \}/.test(HTML));
  // JS 문구와 마크업이 같은 말
  assert.ok(HTML.indexOf(pb.T.scopeNote) > 0);
  ['scopeMine', 'scopeTeam', 'scopeDept'].forEach(function (k) { assert.ok(g.indexOf('>' + pb.T[k] + '<') > 0, k); });
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

// ── 조회 범위 동작(DOM 모의) ──
function recHooks() {
  const h = { calls: [], pend: [], roleLabel: '영업', openCase: function () {}, openMap: function () {} };
  h.req = function (method, url) { h.calls.push(url); return new Promise(function (res, rej) { h.pend.push({ res: res, rej: rej }); }); };
  return h;
}
function btnOf(attrs) {   // 칸이 아닌 일반 단추(범위 칩·빈 표 단추)
  const b = { classList: { contains: function () { return false; } }, id: attrs.id || '',
    getAttribute: function (k) { return has(attrs, k) ? attrs[k] : null; }, closest: function (s) { return s === 'button' ? b : null; } };
  return b;
}
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function scopeData(scope, names, extra) {
  return Object.assign({ columns: COLUMNS, groups: GROUPS, marks: MARKS, today: '2026-11-24', scope: scope, scope_default: 'mine', team_resolved: true,
    rows: names.map(function (n, i) { return row({ bid_case_id: 'B' + i, institution_name: n, is_mine: i === 0 }); }) }, extra || {});
}
// 범위 묶음·안내 줄·알림 칸을 흉내 낸다(기본 ENV에는 없다)
function withScopeEls(fn) {
  return withDom(async function () {
    const pressed = {};
    const chips = ['mine', 'team', 'dept'].map(function (s) {
      pressed[s] = 'true';
      return { getAttribute: function (k) { return k === 'data-scope' ? s : null; }, setAttribute: function (k, v) { if (k === 'aria-pressed') pressed[s] = v; } };
    });
    const els = { 'pb-scope': { querySelectorAll: function () { return chips; } }, 'pb-scope-note': { hidden: true, textContent: '' }, 'pb-live': { textContent: '' }, 'pb-err': { textContent: '' } };
    const orig = ENV.doc.getElementById;
    ENV.doc.getElementById = function (id) { return has(els, id) ? els[id] : orig(id); };
    try { await fn({ pressed: pressed, note: els['pb-scope-note'], live: els['pb-live'], err: els['pb-err'] }); }
    finally { ENV.doc.getElementById = orig; }
  });
}

test('범위 요청: 첫 요청은 scope 없이, 칩을 바꾸면 scope가 붙고 새로 고침·끝난 건 포함에도 유지, 계정 전환 뒤에는 다시 scope 없이', withDom(async function () {
  const h = recHooks();
  pb.show(h, {});
  assert.deepStrictEqual(h.calls, ['/prep-board']);
  h.pend[0].res(scopeData('team', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ 'data-scope': 'mine' }) });
  assert.strictEqual(h.calls[1], '/prep-board?scope=mine');
  h.pend[1].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ id: 'pb-refresh' }) });
  assert.strictEqual(h.calls[2], '/prep-board?scope=mine');
  h.pend[2].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.change({ target: { id: 'pb-ended', checked: true } });
  assert.strictEqual(h.calls[3], '/prep-board?scope=mine&include_ended=true');
  h.pend[3].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ 'data-scope': 'mine' }) });   // 이미 눌린 범위를 또 눌러도 다시 부르지 않는다
  assert.strictEqual(h.calls.length, 4);
  ENV.L.click({ target: btnOf({ 'data-scope': 'bad' }) });    // 모르는 값은 무시
  assert.strictEqual(h.calls.length, 4);
  pb.reset();
  const h2 = recHooks();
  pb.show(h2, {});
  assert.deepStrictEqual(h2.calls, ['/prep-board'], '계정 전환 뒤 범위는 새 응답으로 정해진다');
}));

test('범위 칩: 응답 scope가 눌림·안내 줄을 정하고, 칩을 누르면 바로 눌리고 로딩, 서버가 준 줄은 is_mine과 무관하게 모두 보인다', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('team', ['청주시', '진주시'], { team_resolved: false }));
  await flush();
  assert.deepStrictEqual([e.pressed.mine, e.pressed.team, e.pressed.dept], ['false', 'true', 'false']);
  assert.strictEqual(e.note.hidden, false);
  assert.ok(e.note.textContent.indexOf('상위 결재자(소속 팀장)가 지정되지 않아 팀 작업에 내가 담당한 기관만 나옵니다.') === 0);
  assert.ok(ENV.box.innerHTML.indexOf('청주시') >= 0 && ENV.box.innerHTML.indexOf('진주시') >= 0, 'is_mine=false 줄도 그대로');
  ENV.L.click({ target: btnOf({ 'data-scope': 'mine' }) });
  assert.deepStrictEqual([e.pressed.mine, e.pressed.team, e.pressed.dept], ['true', 'false', 'false'], '누르자마자 눌린 모양');
  assert.strictEqual(e.note.hidden, true, '내 작업은 안내 줄 없음');
  assert.ok(ENV.box.innerHTML.indexOf(pb.T.loading) >= 0, '표 자리에 불러오는 중');
  h.pend[1].res(scopeData('mine', ['청주시']));
  await flush();
  assert.strictEqual(e.live.textContent, '내 작업, 기관 1곳');
  ENV.L.click({ target: btnOf({ 'data-scope': 'dept' }) });
  h.pend[2].res(scopeData('dept', ['청주시', '진주시', '서울시']));
  await flush();
  assert.strictEqual(e.live.textContent, '부서 작업, 기관 3곳');
  assert.strictEqual(e.note.hidden, false);
  assert.strictEqual(e.note.textContent, pb.T.scopeNote, '부서는 결재선 안내 없이 범위 안내만');
}));

test('범위 칩: 불러오기 실패는 칩 상태를 유지하고 [다시 시도]가 같은 범위로 다시 부른다', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ 'data-scope': 'team' }) });
  h.pend[1].rej({ status: 500 });
  await flush();
  assert.strictEqual(e.pressed.team, 'true');
  assert.ok(ENV.box.innerHTML.indexOf(pb.T.loadErr) >= 0 && ENV.box.innerHTML.indexOf('data-pb="retry"') > 0);
  assert.strictEqual(e.live.textContent, '', '실패는 개수 알림을 하지 않는다');
  ENV.L.click({ target: btnOf({ 'data-pb': 'retry' }) });
  assert.strictEqual(h.calls[2], '/prep-board?scope=team');
}));

test('빈 결과: 범위별 문구·단추가 그려지고, 단추로 범위를 바꾸며, 검색 0건은 검색어만 지운다', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', []));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf(pb.T.emptyMine.slice(0, 12)) >= 0);
  assert.ok(ENV.box.innerHTML.indexOf('data-pb="map"') > 0 && ENV.box.innerHTML.indexOf('data-pb="scope-team"') > 0 && ENV.box.innerHTML.indexOf('팀 작업 보기') > 0);
  ENV.L.click({ target: btnOf({ 'data-pb': 'scope-team' }) });
  assert.strictEqual(h.calls[1], '/prep-board?scope=team');
  assert.strictEqual(e.pressed.team, 'true');
  h.pend[1].res(scopeData('team', []));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('팀에 개설 승인이 끝난 기관이 없습니다.') >= 0 && ENV.box.innerHTML.indexOf('data-pb="scope-mine"') > 0 && ENV.box.innerHTML.indexOf('data-pb="map"') < 0);
  ENV.L.click({ target: btnOf({ 'data-pb': 'scope-mine' }) });
  h.pend[2].res(scopeData('mine', ['청주시']));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('청주시') >= 0);
  ENV.L.input({ target: { id: 'pb-q', value: '강남' } });
  assert.ok(ENV.box.innerHTML.indexOf('내 작업에서') >= 0 && ENV.box.innerHTML.indexOf('과 맞는 기관이 없습니다.') > 0, '받침 있는 검색어는 과');
  assert.ok(ENV.box.innerHTML.indexOf('data-pb="clearq"') > 0 && ENV.box.innerHTML.indexOf('검색 지우기') > 0);
  ENV.L.click({ target: btnOf({ 'data-pb': 'clearq' }) });
  assert.ok(ENV.box.innerHTML.indexOf('청주시') >= 0, '검색어를 지우면 표가 돌아온다');
  assert.strictEqual(e.pressed.mine, 'true', '범위는 그대로');
  assert.strictEqual(h.calls.length, 3, '검색 지우기는 다시 부르지 않는다');
}));

// ── 범위 전환 경합(qa 11-24 P3-1·시험 공백) ──
function markBtnOf(bid, cd) {   // 칸 단추(T9와 같은 모의)
  const tr = { getAttribute: function (k) { return k === 'data-bid' ? bid : null; } };
  const td = { parentNode: tr, getAttribute: function (k) { return k === 'data-col' ? cd : null; } };
  const btn = { classList: { contains: function (c) { return c === 'pb-mk'; } }, getAttribute: function () { return null; },
    setAttribute: function () {}, contains: function () { return false; }, focus: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, bottom: 10 }; },
    closest: function (s) { return s === 'td' ? td : s === 'button' ? btn : null; } };
  return btn;
}

test('범위 경합(a): 범위를 A→B로 연달아 눌러 B 응답이 먼저 오고 A가 늦게 와도 B 기준을 유지', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ 'data-scope': 'dept' }) });   // A
  ENV.L.click({ target: btnOf({ 'data-scope': 'team' }) });   // B
  assert.deepStrictEqual(h.calls.slice(1), ['/prep-board?scope=dept', '/prep-board?scope=team']);
  h.pend[2].res(scopeData('team', ['충주시']));
  await flush();
  h.pend[1].res(scopeData('dept', ['진주시']));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('충주시') >= 0 && ENV.box.innerHTML.indexOf('진주시') < 0, 'B 응답이 남는다');
  assert.deepStrictEqual([e.pressed.mine, e.pressed.team, e.pressed.dept], ['false', 'true', 'false']);
  assert.strictEqual(e.live.textContent, '팀 작업, 기관 1곳');
}));

test('범위 경합(b): 범위 전환 중 reset 뒤 옛 응답은 무시하고, 새 첫 요청은 scope 없이', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: btnOf({ 'data-scope': 'team' }) });
  pb.reset();
  const h2 = recHooks();
  pb.show(h2, {});
  assert.deepStrictEqual(h2.calls, ['/prep-board']);
  h.pend[1].res(scopeData('team', ['옛계정시']));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('옛계정시') < 0, '옛 응답은 버린다');
  h2.pend[0].res(scopeData('mine', ['새계정시']));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('새계정시') >= 0 && ENV.box.innerHTML.indexOf('옛계정시') < 0);
  assert.strictEqual(e.pressed.mine, 'true');
}));

test('범위 경합(c): 저장 응답 대기 중 [팀 작업]을 눌러 표가 비었을 때 저장 성공이 와도 오류 없이 끝난다', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: markBtnOf('B0', 'PT') });
  assert.ok(ENV.menu.style.display === '', '메뉴가 열렸다');
  ENV.menu.listeners.click({ target: { closest: function () { return { getAttribute: function () { return 'DONE'; } }; } } });
  assert.strictEqual(h.calls[1], '/bidcases/B0/prep/board-checks/PT', 'PUT 대기');
  ENV.L.click({ target: btnOf({ 'data-scope': 'team' }) });
  assert.strictEqual(h.calls[2], '/prep-board?scope=team');
  h.pend[1].res({ saved: true, cell: { mark_cd: 'DONE', rev_no: 1 } });
  await flush();
  assert.strictEqual(e.err.textContent, '', '저장 실패 문구가 뜨지 않는다');
  assert.strictEqual(e.live.textContent, '', '표를 비운 동안은 저장 알림도 하지 않는다');
  h.pend[2].res(scopeData('team', ['청주시']));
  await flush();
  assert.ok(ENV.box.innerHTML.indexOf('청주시') >= 0, '새 목록 응답이 표를 다시 그린다');
  assert.strictEqual(e.err.textContent, '');
}));

test('범위 경합(c2): 저장 실패 응답도 표가 비어 있으면 실패 문구 없이 끝난다', withScopeEls(async function (e) {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('mine', ['청주시']));
  await flush();
  ENV.L.click({ target: markBtnOf('B0', 'PT') });
  ENV.menu.listeners.click({ target: { closest: function () { return { getAttribute: function () { return 'DONE'; } }; } } });
  ENV.L.click({ target: btnOf({ 'data-scope': 'team' }) });
  h.pend[1].rej({ status: 500 });
  await flush();
  assert.strictEqual(e.err.textContent, '');
}));

test('상세 복귀(d): pb.show(h, {reload:true}) → 요청 1회, 이전 범위(scope=dept)를 유지', withScopeEls(async function () {
  const h = recHooks();
  pb.show(h, {});
  h.pend[0].res(scopeData('dept', ['청주시']));
  await flush();
  pb.leave();
  const n = h.calls.length;
  pb.show(h, { reload: true });
  assert.strictEqual(h.calls.length, n + 1, '요청 1회');
  assert.strictEqual(h.calls[n], '/prep-board?scope=dept');
}));

// qa P3-7 — 표에서 상세를 열 때 숨은 왼쪽 목록(GET /preps)을 부르지 않는다. 옛 화면(refresh)은 그대로.
test('enterCase(P3-7): 표에서 연 상세는 /preps 목록을 부르지 않는다, 옛 화면 refresh는 loadList 유지', function () {
  const a = PREP_SRC.indexOf('function enterCase(bid, name, bd) {');
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

// qa P3-a·P3-b — 이름은 표가 넘기고(제목·모달), 표에서 연 상세는 쓰기 뒤에도 /preps를 부르지 않는다.
test('P3-b 동작: 이름 버튼 클릭 → hooks.openCase(bid, 기관 이름, 그 줄·값 이름표·조회 범위)', withDom(async function () {
  const calls = [];
  const h = deferredHooks();
  let extra = null;
  h.openCase = function (bid, name, bd) { calls.push([bid, name]); extra = bd; };
  pb.show(h, {});
  h.pend[0](boardData('청주시'));
  await flush();
  const tr = { getAttribute: function (k) { return k === 'data-bid' ? 'B1' : null; } };
  const btn = { classList: { contains: function () { return false; } }, id: '',
    getAttribute: function (k) { return k === 'data-pb' ? 'open' : null; },
    closest: function (s) { return s === 'button' ? btn : s === 'tr' ? tr : null; } };
  ENV.L.click({ target: btn });
  assert.deepStrictEqual(calls, [['B1', '청주시']]);
  assert.ok(extra && extra.row && extra.row.bid_case_id === 'B1' && Array.isArray(extra.marks) && typeof extra.scope === 'string', '상세가 표를 다시 받지 않게 그 줄을 넘긴다');
}));

test('P3-a 소스: reloadList는 표에서 연 상세(fromBoard)에서 목록을 생략, handleError·doAct는 reloadList, refresh는 loadList 유지', function () {
  assert.ok(/function reloadList\(\) \{ if \(!S\.fromBoard\) loadList\(\); \}/.test(PREP_SRC), 'reloadList 정의');
  const h = PREP_SRC.slice(PREP_SRC.indexOf('function handleError('), PREP_SRC.indexOf('function doAct('));
  const d = PREP_SRC.slice(PREP_SRC.indexOf('function doAct('), PREP_SRC.indexOf('function curTasks()') > PREP_SRC.indexOf('function doAct(') ? PREP_SRC.indexOf('function curTasks()') : PREP_SRC.indexOf('function doAct(') + 900);
  assert.ok(h.length > 0 && /reloadList\(\);/.test(h), 'handleError는 reloadList');
  assert.ok(!/(^|[^!\w.])loadList\(\)/m.test(h), 'handleError에 맨 loadList() 없음');
  const d2 = PREP_SRC.slice(PREP_SRC.indexOf('function doAct('), PREP_SRC.indexOf('function doAct(') + 1100);
  assert.ok(/invalidateCache\(\);\s*loadDetail\(id\);\s*reloadList\(\);/.test(d2), 'doAct는 reloadList');
  assert.ok(d.length > 0);
  const r = PREP_SRC.slice(PREP_SRC.indexOf('function refresh() {'), PREP_SRC.indexOf('// ── 쓰기 공통'));
  assert.ok(/paintList\(\);\s*loadList\(\);/.test(r), 'refresh의 목록 호출 유지');
});

test('P3-b 소스: enterCase(bid, name, bd)가 이름을 보관, caseName()이 제목·모달에 쓰인다', function () {
  assert.ok(/function enterCase\(bid, name, bd\) \{/.test(PREP_SRC), 'enterCase 인자');
  assert.ok(/S\.boardName = typeof name === 'string' \? name : '';/.test(PREP_SRC), '이름 보관');
  assert.ok(/function caseName\(\) \{ const row = rowOf\(S\.selected\); return row \? row\.name : S\.boardName; \}/.test(PREP_SRC), 'caseName 정의');
  const p = PREP_SRC.slice(PREP_SRC.indexOf('function paintCase()'), PREP_SRC.indexOf('box.innerHTML = prep.caseHtml('));
  assert.strictEqual((p.match(/esc\(caseName\(\)\)/g) || []).length, 2, '로딩·오류 제목 2곳');
  assert.ok(p.indexOf("esc(row ? row.name : '')") < 0, '옛 제목 식 없음');
  assert.ok(/name: str\(v\.institution_name\) \|\| caseName\(\)/.test(PREP_SRC), 'modalInfo');
  assert.ok(/name: caseName\(\) \}\)/.test(PREP_SRC), 'maybeNobid');
});

test('P3-b 소스: boardName은 freshState에서 시작하고 toBoardState·openCase에서 비운다', function () {
  assert.ok(/pendingCase: false, boardName: ''/.test(PREP_SRC), 'freshState');
  const t = PREP_SRC.slice(PREP_SRC.indexOf('function toBoardState()'), PREP_SRC.indexOf('function boardHooks()'));
  assert.ok(t.indexOf("S.boardName = '';") > 0, 'toBoardState');
  const o = PREP_SRC.slice(PREP_SRC.indexOf('S.pendingCase = true;'), PREP_SRC.indexOf('S.pendingCase = true;') + 80);
  assert.ok(/S\.pendingCase = true;\s*S\.boardName = '';/.test(o), 'openCase');
});
