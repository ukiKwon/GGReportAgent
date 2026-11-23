// 협약 성과 관리(NEXT 104, 2026-11-20): 칩 분류·요약 문장·막대 칸 폭·거르기·정렬·KST 날짜·truncated·빈/오류 상태·이스케이프·연결(app·index.html)·소스 규칙.
// 서버(fetch)·DOM 부분(mount 이하)은 node에서 돌리지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const nav = require('../js/nav.js');
const results = require('../js/results.js');

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'results.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

const C = { regionName: function (c) { return { seoul: '서울', gg: '경기', busan: '부산' }[c] || c; }, canOpen: function (id) { return id !== 'nolink'; } };
function item(over) {
  return Object.assign({ institution_id: 'nowon', institution_name: '노원구청', region_code: 'seoul', target_no: 1, tag_cd: 'RETAIN', tag_name: '재유치', owner_name: null,
    prep: { kind: 'ACTIVE', state_cd: 'SUBMITTED', state_name: '제출 완료' }, result_cd: 'SUCCESS', win_kind: 'RETAIN', win_kind_basis: 'PRIOR_CONTRACT',
    win_rank_cd: 'FIRST', win_rank_name: '1금고',
    banks: [{ rank_cd: 'FIRST', rank_name: '1금고', bank_cd: 'KB', bank_name: '국민은행', is_kb: true, term_from: '2027-01-01', term_to: '2030-12-31' }],
    evidence: { contract_no: 1, src_kind_cd: 'NOTICE', src_kind_name: '선정 공고', checked_date: '2026-10-02' }, bid_basis: null, no_bid: null }, over || {});
}
const RETAIN = item({});
const NEW_TAG = item({ institution_id: 'a2', institution_name: '가시', region_code: 'gg', win_kind: 'NEW', win_kind_basis: 'TARGET_TAG', tag_name: '신규' });
const FAIL = item({ institution_id: 'a3', institution_name: '나구', region_code: 'busan', result_cd: 'FAIL', win_kind: null, win_kind_basis: null,
  banks: [{ rank_cd: 'FIRST', rank_name: '1금고', bank_cd: 'BS', bank_name: '부산은행', is_kb: false, term_from: '2027-03-01', term_to: null }] });
const WAIT = item({ institution_id: 'a4', institution_name: '대기', result_cd: 'PENDING', win_kind: null, win_kind_basis: null, banks: [], evidence: null });
const NONE = item({ institution_id: 'a5', institution_name: '없음', result_cd: 'UNREGISTERED', win_kind: null, win_kind_basis: null, banks: [], evidence: null,
  bid_basis: { basis_cd: 'NOTICE_NO_BID', basis_date: '2026-08-11' } });
const SUM = { target_n: 24, success_n: 5, success_retain_n: 3, success_new_n: 2, success_first_n: 4, success_second_n: 1, fail_n: 3, pending_n: 10, unregistered_n: 6,
  removed_n: 2, success_rate: 62.5, rate_numerator: 5, rate_denominator: 8 };
function data(over) { return Object.assign({ year: 2026, today: '2026-11-20', truncated: false, rule: { judged_by: '금고 약정 기록(039)', start_window: 'x' }, summary: SUM,
  items: [FAIL, NONE, WAIT, NEW_TAG, RETAIN], removed_items: [] }, over || {}); }

test('classify: 5분류, 모르는 값은 null', function () {
  assert.strictEqual(results.classify(RETAIN), 'KEPT');
  assert.strictEqual(results.classify(NEW_TAG), 'WON');
  assert.strictEqual(results.classify(item({ win_kind: null })), 'WON');
  assert.strictEqual(results.classify(FAIL), 'FAIL');
  assert.strictEqual(results.classify(WAIT), 'WAIT');
  assert.strictEqual(results.classify(NONE), 'NONE');
  assert.strictEqual(results.classify(item({ result_cd: 'X' })), null);
  assert.deepStrictEqual(results.countByCode([RETAIN, NEW_TAG, FAIL, WAIT, NONE, item({ result_cd: 'X' })]), { KEPT: 1, WON: 1, FAIL: 1, WAIT: 1, NONE: 1 });
});

test('요약 문장: 달성률·공식·그 밖 협약·읽어 주는 문장', function () {
  assert.strictEqual(results.rateText(62.5), '62.5%');
  assert.strictEqual(results.rateText(100), '100.0%');
  assert.strictEqual(results.rateText(null), '');
  assert.strictEqual(results.formula(SUM), '재유치·신규 5 ÷ (재유치·신규 5 + 타은행 유치 3)');
  assert.strictEqual(results.otherSuccess(SUM), 0);
  assert.strictEqual(results.otherSuccess(Object.assign({}, SUM, { success_n: 7 })), 2);
  assert.strictEqual(results.liveText(data()), '2026년 목표 기관 24곳, 달성률 62.5%');
  assert.strictEqual(results.liveText(data({ summary: Object.assign({}, SUM, { success_rate: null }) })), '2026년 목표 기관 24곳, 달성률 아직 없음');
  assert.ok(/일부만/.test(results.liveText(data({ truncated: true, summary: null }))));
});

test('bandHtml: 4칸, 달성률 null 이면 — 와 안내, 공식은 결과가 있을 때만, 뺀 곳은 단추', function () {
  const h = results.bandHtml(data());
  assert.strictEqual(h.split('class="hb-k"').length, 5);
  assert.ok(h.indexOf('62.5%') > 0 && h.indexOf('재유치·신규 <b>5</b> ÷ (재유치·신규 <b>5</b> + 타은행 유치 <b>3</b>)') > 0);
  assert.ok(h.indexOf('협약 내역') > 0 && h.indexOf('성공') < 0 && h.indexOf('실패') < 0, '화면에 성공·실패 말이 남지 않는다');
  assert.ok(h.indexOf('data-act="rm"') > 0 && h.indexOf('(목표에 안 셈)') > 0);
  assert.ok(h.indexOf('1금고 <b>4</b> 2금고 <b>1</b>') > 0 && h.indexOf('공동·그 밖') < 0);
  assert.ok(h.indexOf('재유치 <b>3</b> 신규 <b>2</b>') > 0 && h.indexOf('달성률에 넣지 않습니다') > 0 && h.indexOf('결과 대기 <b>10</b> 확인 필요 <b>6</b>') > 0);
  const n = results.bandHtml(data({ summary: Object.assign({}, SUM, { success_rate: null, rate_denominator: 0, success_n: 0, fail_n: 0, rate_numerator: 0, removed_n: 0 }) }));
  assert.ok(n.indexOf('결과가 난 곳이 아직 없습니다') > 0 && n.indexOf('결과가 나면 계산합니다') > 0 && n.indexOf('÷') < 0 && n.indexOf('data-act="rm"') < 0);
  assert.ok(results.bandHtml(data({ summary: Object.assign({}, SUM, { success_n: 7 }) })).indexOf('공동·그 밖 <b>2</b>') > 0);
});

test('truncated: 띠 4칸 모두 —, 경고 줄, 막대·뺀 곳 없음, 표 caption 은 표시된 N곳 기준', function () {
  const d = data({ truncated: true, summary: null, removed_items: null });
  const h = results.bandHtml(d);
  assert.ok(h.indexOf('pl-warn') > 0 && h.indexOf('2,000곳을 넘어') > 0 && h.indexOf('개발부서에 알려 주세요') > 0);
  assert.strictEqual(h.split('>—</span>').length, 5);
  assert.strictEqual(results.removedHtml(results.defaultView(), d, C), '');
  assert.strictEqual(results.tableCaption(2000, 12, true), '표시된 2,000곳 중 12곳');
  assert.strictEqual(results.tableCaption(24, 3, false), '24곳 중 3곳 표시');
  assert.ok(results.tableHtml(results.defaultView(), d, C).indexOf('표시된 5곳 중 5곳') > 0);
});

test('barModel: 폭은 건수에 비례, 최소 6px, 28px 미만은 범례, 꺾쇠 길이=재유치·신규·타은행 유치 칸', function () {
  const m = results.barModel(SUM, 998);   // 5칸 → 칸 사이 8 → 사용 가능 990
  assert.deepStrictEqual(m.cells.map(function (c) { return c.code; }), ['KEPT', 'WON', 'FAIL', 'WAIT', 'NONE']);
  const total = m.cells.reduce(function (a, c) { return a + c.w; }, 0);
  assert.ok(Math.abs(total - 990) < 1);
  assert.ok(Math.abs(m.cells[0].w - 990 * 3 / 24) < 0.2);
  assert.ok(m.cells.every(function (c) { return c.inside; }));
  assert.ok(Math.abs(m.span - (m.cells[0].w + m.cells[1].w + m.cells[2].w + 4)) < 0.2);
  assert.strictEqual(m.den, 8);
  const t = results.barModel({ success_retain_n: 1, success_new_n: 0, fail_n: 0, pending_n: 500, unregistered_n: 0, rate_denominator: 1 }, 400);
  assert.strictEqual(t.cells[0].w, 6);
  assert.ok(!t.cells[0].inside && t.cells[1].inside);
  assert.ok(Math.abs(t.cells[0].w + t.cells[1].w + 2 - 400) < 0.2);
  const z = results.barModel({ success_retain_n: 0, success_new_n: 0, fail_n: 0, pending_n: 3, unregistered_n: 0, rate_denominator: 0 }, 400);
  assert.strictEqual(z.span, 0);
  assert.strictEqual(results.barModel({}, 400).cells.length, 0);
  assert.strictEqual(results.barHtml({}, 400), '');
});

test('barHtml: role=img 설명, 꺾쇠 문구, 좁은 칸 숫자는 범례로, 데이터가 적으면 막대 없음', function () {
  const h = results.barHtml(SUM, 998);
  assert.ok(h.indexOf('role="img"') > 0 && h.indexOf('목표 24곳: 재유치 3, 신규 2, 타은행 유치 3, 결과 대기 10, 확인 필요 6. 달성률은 재유치·신규와 타은행 유치 8곳으로 계산') > 0);
  assert.ok(h.indexOf('달성률 계산 8곳') > 0 && h.indexOf('rs-legend') < 0);
  const narrow = results.barHtml({ target_n: 501, success_retain_n: 1, success_new_n: 0, fail_n: 0, pending_n: 500, unregistered_n: 0, rate_denominator: 1 }, 400);
  assert.ok(narrow.indexOf('rs-legend') > 0 && narrow.indexOf('재유치 <span class="v">1</span>') > 0);
  const none = results.barHtml({ target_n: 10, pending_n: 7, unregistered_n: 3, rate_denominator: 0 }, 400);
  assert.strictEqual(none, '', '결과가 하나도 없으면(목표만) 막대 없음 — 사용자 11-23');
  // 3) 데이터가 적으면 막대를 그리지 않는다: 목표 5곳 미만, 또는 분류가 한 가지뿐
  assert.strictEqual(results.BAR_MIN_N, 5);
  assert.strictEqual(results.barHtml({ target_n: 4, success_retain_n: 2, pending_n: 2, rate_denominator: 2 }, 400), '', '목표 4곳');
  assert.strictEqual(results.barHtml({ target_n: 30, pending_n: 30, rate_denominator: 0 }, 400), '', '분류 한 가지');
  assert.strictEqual(results.barHtml({ target_n: 2, pending_n: 2, rate_denominator: 0 }, 400), '', '숫자 2 하나뿐인 막대');
  assert.ok(results.barHtml({ target_n: 5, success_retain_n: 3, pending_n: 2, rate_denominator: 3 }, 400).indexOf('rs-bar') > 0, '목표 5곳·분류 2가지는 그린다');
});

test('filterItems: 결과·목표 구분 AND, sortItems: 기본 결과 순(재유치·신규 먼저)·같은 결과는 지역·이름 가나다', function () {
  const all = data().items;
  assert.strictEqual(results.filterItems(all, { res: 'all', tag: '' }).length, 5);
  assert.deepStrictEqual(results.filterItems(all, { res: 'WON', tag: '' }).map(function (i) { return i.institution_id; }), ['a2']);
  assert.strictEqual(results.filterItems(all, { res: 'KEPT', tag: '신규' }).length, 0);
  assert.strictEqual(results.filterItems(all, { res: 'all', tag: '재유치' }).length, 4);
  const s = results.sortItems(all, 'res', 'asc', C.regionName).map(function (i) { return results.classify(i); });
  assert.deepStrictEqual(s, ['KEPT', 'WON', 'FAIL', 'WAIT', 'NONE']);
  const same = results.sortItems([item({ institution_id: 'x1', institution_name: '다', region_code: 'seoul' }), item({ institution_id: 'x2', institution_name: '가', region_code: 'seoul' }),
    item({ institution_id: 'x3', institution_name: '가', region_code: 'gg' })], 'res', 'asc', C.regionName).map(function (i) { return i.institution_id; });
  assert.deepStrictEqual(same, ['x3', 'x2', 'x1']);   // 경기 < 서울
  assert.deepStrictEqual(results.sortItems(all, 'res', 'desc', C.regionName).map(function (i) { return results.classify(i); }), ['NONE', 'WAIT', 'FAIL', 'WON', 'KEPT']);
  assert.deepStrictEqual(results.sortItems(all, 'inst', 'asc', C.regionName).map(function (i) { return i.region_code; })[0], 'gg');
});

test('sortItems from: 약정 시작 빈 값은 방향과 무관하게 끝', function () {
  const a = item({ institution_id: 'p1', banks: [{ term_from: '2027-03-01' }] }), b = item({ institution_id: 'p2', banks: [{ term_from: '2027-01-01' }, { term_from: '2027-05-01' }] }), c = item({ institution_id: 'p3', banks: [] });
  assert.deepStrictEqual(results.sortItems([c, a, b], 'from', 'asc', C.regionName).map(function (i) { return i.institution_id; }), ['p2', 'p1', 'p3']);
  assert.deepStrictEqual(results.sortItems([c, a, b], 'from', 'desc', C.regionName).map(function (i) { return i.institution_id; }), ['p1', 'p2', 'p3']);
  assert.strictEqual(results.startMonth(b), '2027-01');
  assert.strictEqual(results.startMonth(c), '');
});

test('kstDate: UTC 15시 이후는 다음 날(앞 10자 자르기 금지), 영역표시 없는 값·마이크로초·빈 값', function () {
  assert.strictEqual(results.kstDate('2026-11-19T15:30:00.123456+00:00'), '2026-11-20');
  assert.strictEqual(results.kstDate('2026-11-20T03:00:00.000000+00:00'), '2026-11-20');
  assert.strictEqual(results.kstDate('2026-11-19T14:59:59+00:00'), '2026-11-19');
  assert.strictEqual(results.kstDate('2026-11-19T15:00:00'), '2026-11-20');
  assert.strictEqual(results.kstDate('2026-12-31T15:00:00.000000+00:00'), '2027-01-01');
  assert.strictEqual(results.kstDate(''), '');
  assert.strictEqual(results.kstDate(null), '');
  assert.strictEqual(results.kstDate('2026-11-19 해석불가'), '2026-11-19');
});

test('yearOptions: 응답 today 연도 기준 올해-3~올해+1, 잘못된 값은 빈 배열', function () {
  assert.deepStrictEqual(results.yearOptions('2026-11-20'), [2023, 2024, 2025, 2026, 2027]);
  assert.deepStrictEqual(results.yearOptions(''), []);
  assert.deepStrictEqual(results.yearOptions('abc'), []);
});

test('chipHtml: 글자는 언제나, 글리프는 aria-hidden, 모양 클래스 5가지', function () {
  results.CODES.forEach(function (c) {
    const h = results.chipHtml(c);
    assert.ok(h.indexOf(results.LABEL[c]) > 0 && h.indexOf('rs-chip ' + { KEPT: 'kept', WON: 'won', FAIL: 'fail', WAIT: 'wait', NONE: 'none' }[c]) > 0);
    if (h.indexOf('<svg') >= 0) assert.ok(h.indexOf('aria-hidden="true"') > 0);
  });
  assert.ok(results.chipHtml('WAIT').indexOf('<svg') < 0 && results.chipHtml('NONE').indexOf('<svg') < 0);
  assert.ok(results.chipHtml(null).indexOf('분류 불가') > 0);
});

test('근거 열·결과 없음 보조 문구(규격 5절), 코드 문자열은 화면에 내지 않는다', function () {
  assert.strictEqual(results.evidenceCell(RETAIN).text, '선정 공고 2026-10-02');
  assert.ok(results.evidenceCell(RETAIN).html.indexOf('<span class="v">2026-10-02</span>') > 0);
  assert.strictEqual(results.evidenceCell(WAIT).text, '입찰 결과 전');
  assert.strictEqual(results.evidenceCell(item({ result_cd: 'UNREGISTERED', evidence: null })).text, '약정 기록 없음');
  assert.strictEqual(results.evidenceCell(NONE).text, '입찰 없음 2026-08-11');
  assert.strictEqual(results.noneNote({ bid_basis: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-10-01' } }).text, '공고 마감 2026-10-01, 약정 기록 없음');
  assert.strictEqual(results.noneNote({ bid_basis: { basis_cd: 'CONTRACT_DECIDED', basis_date: '2027-01-01' } }).text, '약정 2027-01 시작, 다른 해 목표로 셈');
  assert.strictEqual(results.noneNote({ bid_basis: { basis_cd: 'WHAT' } }).text, '약정 기록 없음');
  assert.ok(results.noneNote({ bid_basis: { basis_cd: 'CONTRACT_DECIDED', basis_date: '2027-01-01' } }).html.indexOf('CONTRACT_DECIDED') < 0);
  assert.strictEqual(results.evidenceCell(item({ evidence: null })).text, '');
});

test('prepCell·banksCell: 제안 중단·제안 없음(muted), 은행은 순위 묶음·국민은행 굵게', function () {
  assert.deepStrictEqual(results.prepCell(item({ prep: { kind: 'NONE' } })), { text: '제안 없음', mut: true });
  assert.deepStrictEqual(results.prepCell(item({ prep: { kind: 'CANCELLED', state_name: '중단됨' } })), { text: '제안 중단', mut: false });
  assert.strictEqual(results.prepCell(RETAIN).text, '제출 완료');
  const b = results.banksCell(RETAIN);
  assert.ok(b.html.indexOf('rs-bk kb') > 0 && b.html.indexOf('1금고') > 0 && b.html.indexOf('국민은행') > 0 && b.html.indexOf('·') < 0);
  assert.ok(results.banksCell(WAIT).html.indexOf('—') > 0);
});

test('rowHtml: 목표 구분 기준 문구는 TARGET_TAG 성공에만, 이름은 이스케이프, canOpen 없으면 span', function () {
  const w = results.rowHtml(NEW_TAG, C);
  assert.ok(w.indexOf('<span class="rs-basis">목표 구분 기준</span>') > 0);
  assert.ok(results.rowHtml(RETAIN, C).indexOf('rs-basis') < 0 && results.rowHtml(FAIL, C).indexOf('rs-basis') < 0);
  const x = results.rowHtml(item({ institution_name: '<img src=x onerror=alert(1)>', institution_id: 'nolink', tag_name: '"><b>', prep: { kind: 'ACTIVE', state_name: '<i>' } }), C);
  assert.ok(x.indexOf('<img') < 0 && x.indexOf('&lt;img') > 0 && x.indexOf('<b>') < 0 && x.indexOf('<i>') < 0);
  assert.ok(x.indexOf('<span class="hb-nm">') > 0 && x.indexOf('<button') < 0);
  const y = results.rowHtml(RETAIN, C);
  assert.ok(y.indexOf('<button type="button" class="hb-nm" data-inst="nowon" aria-haspopup="dialog">') > 0 && y.indexOf('<th scope="row"') > 0);
  assert.ok(results.nameHtml(item({ institution_id: 'bad id"' }), { regionName: C.regionName, canOpen: function () { return true; } }).indexOf('<button') < 0);
});

test('tableHtml: 헤더 aria-sort·정렬 단추 3개·caption, 거른 결과 0건이면 안내와 [거르기 풀기], 목표 기관 0이면 빈 상태', function () {
  const v = results.defaultView();
  const h = results.tableHtml(v, data(), C);
  assert.ok(h.indexOf('<caption>5곳 중 5곳 표시</caption>') > 0);
  assert.strictEqual(h.split('class="hb-sort"').length, 4);
  assert.ok(h.indexOf('<th scope="col" aria-sort="ascending"><button type="button" class="hb-sort" data-sort="res">') > 0);
  assert.ok(h.indexOf('약정 시작 월을 알 수 없어') < 0 && h.indexOf('연도만 적힌 기록은 월을 알 수 없어 결과에 넣지 않았습니다.') > 0);
  assert.ok(h.indexOf('직전 기록이 없으면 목표 구분을 따릅니다') > 0);
  const e = results.tableHtml(Object.assign(results.defaultView(), { res: 'KEPT', tag: '신규' }), data(), C);
  assert.ok(e.indexOf('이 조건에 맞는 기관이 없습니다.') > 0 && e.indexOf('data-act="clear"') > 0 && e.indexOf('<caption>5곳 중 0곳 표시</caption>') > 0);
  const d2 = results.tableHtml(Object.assign(results.defaultView(), { sortKey: 'inst', sortDir: 'desc' }), data(), C);
  assert.ok(d2.indexOf('aria-sort="descending"><button type="button" class="hb-sort" data-sort="inst">') > 0);
  const empty = results.tableHtml(v, data({ items: [], summary: Object.assign({}, SUM, { target_n: 0 }) }), C);
  assert.ok(empty.indexOf('2026년 목표 기관이 없습니다. 목표 기관은 입찰 현황판에서 정합니다.') > 0 && empty.indexOf('data-act="dash"') > 0 && empty.indexOf('<table') < 0);
  assert.strictEqual(results.isEmpty(data({ items: [], removed_items: [] })), true);
  assert.strictEqual(results.isEmpty(data({ items: [], removed_items: [{}] })), false);
  assert.strictEqual(results.isEmpty(data({ items: [], truncated: true, removed_items: null })), false);
});

test('filtersHtml: 결과 6개(건수 포함)·목표 구분(응답의 tag_name), fieldset+숨은 legend, 선택 반영', function () {
  const h = results.filtersHtml(Object.assign(results.defaultView(), { res: 'FAIL', tag: '신규' }), data());
  assert.ok(h.indexOf('<legend class="sr-only">결과로 거르기</legend>') > 0 && h.indexOf('<legend class="sr-only">목표 구분으로 거르기</legend>') > 0);
  assert.ok(h.indexOf('<span>전체 5</span>') > 0 && h.indexOf('<span>재유치 1</span>') > 0 && h.indexOf('<span>타은행 유치 1</span>') > 0 && h.indexOf('<span>확인 필요 1</span>') > 0);
  assert.ok(h.indexOf('value="FAIL" checked') > 0 && h.indexOf('value="신규" checked') > 0 && h.indexOf('<span>신규 1</span>') > 0 && h.indexOf('<span>재유치 4</span>') > 0);
  assert.strictEqual(h.split('name="rs-res"').length, 7);
  assert.strictEqual(results.filtersHtml(results.defaultView(), data({ items: [] })), '');
  assert.ok(results.filtersHtml(results.defaultView(), data({ items: [item({ tag_name: null })] })).indexOf('name="rs-tag"') < 0);
});

test('회귀(2): 목표 1곳 이상이면 거르기 줄이 항상 있고 CSS 가 단추로 보이게 한다(페이지 바탕 위 알약)', function () {
  [[RETAIN], [FAIL], [WAIT, NONE], [NEW_TAG, RETAIN, FAIL, WAIT, NONE]].forEach(function (items) {
    const h = results.filtersHtml(results.defaultView(), data({ items: items }));
    assert.strictEqual(h.split('name="rs-res"').length, 7, '결과 라디오 6개(전체+5분류, 건수 0도 보임)');
    assert.ok(h.indexOf('value="all" checked') > 0, 'all checked');
    assert.ok(h.indexOf('<legend class="sr-only">결과로 거르기</legend>') > 0, 'legend');
  });
  assert.ok(results.filtersHtml(results.defaultView(), data({ items: [item({ tag_name: null })] })).indexOf('rs-filters') > 0, 'rs-filters');
  const a = HTML.indexOf('/* 협약 성과 관리 시작'), b = HTML.indexOf('/* 협약 성과 관리 끝 */');
  const css = HTML.slice(a, b);
  assert.ok(/\.rs-frow \.db-per \{[^}]*background:var\(--panel\)[^}]*\}/.test(css) && /\.rs-frow \.db-per \{[^}]*border-color:var\(--line-strong\)/.test(css), '거르기 알약은 패널 바탕+진한 선');
  assert.ok(/\.rs-frow \.db-per span \{[^}]*color:var\(--fg\)/.test(css), '선택 안 된 글자도 --fg');
  assert.ok(SRC.indexOf("setHtml('rs-fil', empty ? '' : results.filtersHtml(S, d))") > 0, '거르기 줄은 비어 있는 화면에서만 숨긴다');
});

test('removedHtml: 0건이면 글줄만, 뺀 방식 문구·사유 —·KST 날짜·최신순·접힘 상태', function () {
  const v = results.defaultView();
  assert.ok(results.removedHtml(v, data(), C).indexOf('연중에 뺀 곳 없음') > 0);
  assert.ok(results.removedHtml(v, data(), C).indexOf('<button') < 0);
  const rm = [
    { institution_id: 'r1', institution_name: '오래', region_code: 'seoul', tag_name: '재유치', removed_kind: 'CANCEL', reason_name: '기관 사정', removed_at: '2026-05-01T01:00:00.000000+00:00' },
    { institution_id: 'r2', institution_name: '최근', region_code: 'gg', tag_name: null, removed_kind: 'YEAR_CHANGED', reason_name: null, removed_at: '2026-11-19T16:00:00.000000+00:00' },
    { institution_id: 'r3', institution_name: '관심', region_code: 'gg', tag_name: '신규', removed_kind: 'MOVE_TO_WATCH', reason_name: null, removed_at: '2026-08-01T00:00:00.000000+00:00' }];
  const h = results.removedHtml(v, data({ removed_items: rm }), C);
  assert.ok(h.indexOf('aria-expanded="false"') > 0 && h.indexOf('aria-controls="rs-rm-body"') > 0 && /id="rs-rm-body" hidden/.test(h));
  assert.ok(h.indexOf('다른 해로 옮김(이월)') > 0 && h.indexOf('관심 기관으로 내림') > 0 && h.indexOf('목표 취소') > 0);
  assert.ok(h.indexOf('<span class="v">2026-11-20</span>') > 0, 'UTC 16시 = KST 다음 날');
  assert.ok(h.indexOf('최근') < h.indexOf('관심') && h.indexOf('관심') < h.indexOf('오래'), '뺀 날 최신순');
  assert.ok(h.indexOf('목표 기관 수와 달성률에 넣지 않았습니다.') > 0 && h.indexOf('입력 정정이라 보이지 않습니다') > 0);
  assert.ok(results.removedHtml(Object.assign(results.defaultView(), { rmOpen: true }), data({ removed_items: rm }), C).indexOf('aria-expanded="true"') > 0);
  assert.ok(!/id="rs-rm-body" hidden/.test(results.removedHtml(Object.assign(results.defaultView(), { rmOpen: true }), data({ removed_items: rm }), C)));
});

test('errorView: 403·401 은 일반 안내+연도 숨김, 400·409 는 alert+다시 시도, 연결 실패 문구, 서버 글은 이스케이프', function () {
  const a = results.errorView({ code: 403, detail: '' });
  assert.ok(a.hideYear && !a.alert && a.html.indexOf(results.DENIED_MSG) > 0 && a.html.indexOf('role="alert"') < 0 && a.html.indexOf('다시 시도') < 0);
  assert.ok(results.errorView({ code: 401 }).hideYear);
  const b = results.errorView({ code: 409 });
  assert.ok(b.alert && b.html.indexOf('role="alert"') > 0 && b.html.indexOf(results.LIMIT_MSG) > 0 && b.html.indexOf('data-act="retry"') > 0);
  assert.ok(results.errorView({ code: 400 }).html.indexOf(results.YEAR_MSG) > 0);
  assert.ok(results.errorView({ code: 500 }).html.indexOf('협약 성과를 불러오지 못했습니다(오류 500).') > 0);
  assert.ok(results.errorView({ code: 0 }).html.indexOf('(서버에 연결되지 않음)') > 0);
  assert.ok(results.errorView({ code: 400, detail: '<script>x</script>' }).html.indexOf('<script>') < 0);
  assert.ok(results.errorView({ code: 400, detail: 'x'.repeat(300) }).html.indexOf('x'.repeat(300)) < 0);
  assert.ok(results.loadingHtml().indexOf('협약 성과를 불러오는 중입니다…') > 0);
});

test('소스 규칙: confirm()·외부 주소·새 hex 없음, rule 문자열·담당자 이름을 그리지 않음, GET 만, 서버 글을 innerHTML 로 직접 넣지 않음', function () {
  assert.ok(!/\bconfirm\(/.test(SRC) && !/\balert\(/.test(SRC));
  assert.ok(!/https?:\/\//.test(SRC));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC));
  assert.ok(SRC.indexOf('judged_by') < 0 && SRC.indexOf('start_window') < 0 && SRC.indexOf('owner_name') < 0 && SRC.indexOf('(039)') < 0);
  assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/i.test(SRC) && !/X-Button-Id|X-Screen-Id/.test(SRC), '쓰기 없음');
  assert.ok(!/innerHTML\s*=\s*[^;]*\.(message|detail)/.test(SRC));
  assert.ok(SRC.indexOf("fetchJson('/bid-targets/results'") > 0);
});

test('app.js: results 분기(soon-plain 숨김·표시·mount·onProfileChange), plans 줄 보존', function () {
  assert.ok(APP_SRC.indexOf('itemId === root.results.SOON_ID') > 0);
  assert.ok(APP_SRC.indexOf("document.getElementById('results-root')") > 0 && APP_SRC.indexOf('root.results.mount(resultsEl)') > 0);
  assert.ok(APP_SRC.indexOf('root.results.onProfileChange()') > 0);
  assert.ok(/isBoard \|\| isTeam \|\| isPrep \|\| dashReady \|\| isPlans/.test(APP_SRC));
});

test('index.html: #results-root 한 개, results.js 는 plancollect.js 뒤·admin.js·app.js 앞, CSS 블록(수집 요청 블록 뒤·새 hex 금지·12px 미만 금지·채운 주버튼 금지)', function () {
  assert.ok(/<div id="results-root" style="display:none;"><\/div>/.test(HTML));
  assert.strictEqual(HTML.split('id="results-root"').length, 2);
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.strictEqual(HTML.split('js/results.js').length, 2);
  assert.ok(at('results.js') > at('plancollect.js') && at('results.js') < at('admin.js') && at('results.js') < at('app.js') && at('results.js') < at('render.js'));
  const a = HTML.indexOf('/* 협약 성과 관리 시작'), b = HTML.indexOf('/* 협약 성과 관리 끝 */');
  assert.ok(a > 0 && b > a && a > HTML.indexOf('/* 사업계획 수집 요청 끝 */') && a > HTML.indexOf('/* 기관 사업계획 끝 */'));
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '새 hex 금지(토큰만)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 12, m); });
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  assert.ok(!/box-shadow/.test(css) && css.indexOf('.legend') < 0 && css.indexOf('#map-stage') < 0);
  ['.rs-chip.kept', '.rs-chip.won', '.rs-chip.fail', '.rs-chip.none', '.rs-seg.none', '.rs-band', '.rs-tt', 'forced-colors:active'].forEach(function (s) { assert.ok(css.indexOf(s) >= 0, s); });
  assert.ok(/\.rs-chip\.none \{[^}]*dashed/.test(css) && /\.rs-seg\.none \{[^}]*dashed/.test(css), '결과 없음은 점선');
  assert.ok(/\.rs-chip\.kept \{[^}]*var\(--bk-kb\)/.test(css), '재유치는 KB Yellow 채움(DESIGN.md 예외는 main 이 추가)');
});

test('nav.js 연결(0d 적용 뒤): RESULTS_ID = results.SOON_ID, 협약·관계 관리 아래 map 키·영업팀·전산팀, 디자이너 relate', { skip: !nav.RESULTS_ID }, function () {
  assert.strictEqual(nav.RESULTS_ID, results.SOON_ID);
  const rel = nav.CATEGORIES.filter(function (c) { return c.id === 'relate'; })[0];
  const it = rel.items.filter(function (i) { return i.label === '협약 성과 관리'; })[0];
  assert.ok(it && (it.id || 'soon:' + it.label) === results.SOON_ID);
  assert.ok(nav.ROLE_CATS['디자이너'] === undefined || nav.ROLE_CATS['디자이너'].indexOf('relate') >= 0 || Object.keys(nav.ROLE_CATS).some(function (k) { return nav.ROLE_CATS[k].indexOf('relate') >= 0; }));
});

test('qa 반영: null 값은 null 글자로 찍히지 않는다(기관 이름·은행·순위)', function () {
  const h = results.rowHtml(item({ institution_name: null }), C);
  assert.ok(h.indexOf('null') < 0, h);
  const b = results.banksCell(item({ banks: [{ rank_name: null, bank_name: null, is_kb: false }] }));
  assert.ok(b.html.indexOf('null') < 0 && b.text.indexOf('null') < 0, b.html);
});

test('qa 반영: resetScreens 에 results, liveText 집계 없음, 알 수 없는 코드는 칩 없이 글자만, 은행 칸 두 줄 클래스', function () {
  assert.ok(/\['portal', 'kbboard', 'dashboard', 'plans', 'results'\]\.forEach/.test(APP_SRC), '로그인 때 숨은 협약 성과 화면도 내린다');
  assert.strictEqual(results.liveText({ year: 2026, truncated: false, summary: null, items: [] }), '집계 없음');
  assert.strictEqual(results.liveText({ year: 2026, truncated: true, summary: null, items: [] }), '목표 기관이 많아 일부만 표시됩니다');
  assert.strictEqual(results.chipHtml(null), '<span class="mut">분류 불가</span>');
  assert.ok(results.rowHtml(RETAIN, C).indexOf('<td class="c-bank-cell"') > 0);
});

test('design 반영: 부서 이름은 개발부서, 표 머리 sticky, 은행 칸 두 줄, 링크 색 관례, 뺀 곳 h3 에는 단추만', function () {
  assert.ok(results.DENIED_MSG.indexOf('개발부서') > 0 && results.LIMIT_MSG.indexOf('개발부서') > 0);
  assert.ok(SRC.indexOf('전산 계열') < 0 && SRC.indexOf('담당자에게') < 0);
  assert.ok(/\.rs-tt thead th \{ position:sticky; top:0; z-index:1;/.test(HTML));
  assert.ok(HTML.indexOf('.rs-tt td.c-bank-cell { white-space:normal;') > 0);
  assert.ok(/\.rs-link \{[^}]*color:var\(--fg\);[^}]*text-decoration-color:var\(--accent-color\)/.test(HTML));
  assert.strictEqual(HTML.split('.rs-link:focus-visible').length, 2, 'focus 규칙 한 번만');
  const rm = results.removedHtml({ rmOpen: false }, { truncated: false, removed_items: [{ institution_id: 'r1', institution_name: '뺀곳', region_code: 'seoul', removed_kind: 'CANCEL', removed_at: '2026-11-18T00:00:00.000000+00:00' }] }, C);
  const h3 = rm.slice(rm.indexOf('<h3>'), rm.indexOf('</h3>'));
  assert.ok(h3.indexOf('rs-tog') > 0 && h3.indexOf('db-why') < 0, '설명 글은 h3 밖');
});

test('협약 성과 화면에서 연 기관 상세는 [제안 확정]을 막는다(NEXT 104, 사용자 11-23, dashboard noConfirm fa 71c98c77)', function () {
  const DASH_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard.js'), 'utf8');
  assert.ok(/openDetail\(rec, \{ opener: t, noConfirm: true \}\)/.test(SRC), '기관 이름 클릭이 noConfirm 옵션을 넘긴다');
  assert.ok(/noConfirm: !!\(opts && opts\.noConfirm\)/.test(DASH_SRC), 'openDetail 이 옵션을 받는다');
});

test('결과 0건(목표만): 띠는 — 와 결과가 나면 계산합니다, 협약 내역은 회색 0곳, 공식 줄 없음', function () {
  const Z = Object.assign({}, SUM, { target_n: 12, success_n: 0, success_retain_n: 0, success_new_n: 0, success_first_n: 0, success_second_n: 0, fail_n: 0,
    pending_n: 12, unregistered_n: 0, removed_n: 0, success_rate: null, rate_numerator: 0, rate_denominator: 0 });
  assert.strictEqual(results.noResult(Z), true);
  assert.strictEqual(results.noResult(SUM), false);
  assert.strictEqual(results.noResult(Object.assign({}, Z, { target_n: 0 })), false, '목표 0곳이면 이 상태가 아니다');
  const h = results.bandHtml(data({ summary: Z }));
  assert.strictEqual(h.split('class="hb-k"').length, 5);
  assert.ok(h.indexOf('결과가 난 곳이 아직 없습니다') > 0 && h.indexOf('결과가 나면 계산합니다') > 0 && h.indexOf('÷') < 0, '0÷0 공식 줄 없음');
  assert.ok(h.indexOf('결과가 나면 셉니다') > 0, '협약 내역 한 줄');
  assert.ok(h.indexOf('1금고') < 0 && h.indexOf('공동·그 밖') < 0);
  const one = results.bandHtml(data({ summary: Object.assign({}, Z, { success_n: 1, success_retain_n: 1, rate_numerator: 1, rate_denominator: 1, success_rate: 100, pending_n: 11 }) }));
  assert.ok(one.indexOf('÷') > 0 && one.indexOf('결과가 나면') < 0);
});

test('leadHtml: 결과 난 곳 n · 남은 곳 m (목표 기관 N) — 띠 위 한 줄, 합이 목표와 같다', function () {
  assert.deepStrictEqual(results.leadCounts(SUM), { done: 8, left: 16, total: 24 });   // 5+3 / 10+6 / 24
  assert.strictEqual(results.leadCounts(SUM).done + results.leadCounts(SUM).left, SUM.target_n);
  const h = results.leadHtml(SUM);
  assert.ok(h.indexOf('class="rs-lead"') >= 0 && h.indexOf('결과 난 곳 <b>8</b>곳') > 0 && h.indexOf('남은 곳 <b>16</b>곳') > 0 && h.indexOf('(목표 기관 <b>24</b>곳)') > 0);
  const Z = Object.assign({}, SUM, { target_n: 12, success_n: 0, fail_n: 0, pending_n: 12, unregistered_n: 0, rate_denominator: 0, success_rate: null });
  assert.ok(results.leadHtml(Z).indexOf('결과 난 곳 <b>0</b>곳') > 0 && results.leadHtml(Z).indexOf('남은 곳 <b>12</b>곳') > 0, '0건도 숫자를 낸다');
  assert.strictEqual(results.leadHtml(Object.assign({}, SUM, { target_n: 0 })), '', '목표 0곳이면 없음');
  assert.strictEqual(results.leadHtml(null), '');
  assert.ok(results.bandHtml(data()).indexOf('class="rs-lead"') < results.bandHtml(data()).indexOf('class="rs-band"'), '줄이 띠 앞');
  assert.strictEqual(results.bandHtml(data({ truncated: true, summary: null })).indexOf('rs-lead'), -1, 'truncated 면 줄 없음');
  assert.ok(/\.rs-lead\s*\{/.test(HTML) && /\.rs-lead b\s*\{/.test(HTML));
});

test('barNoteHtml: 결과 0건이면 막대 자리에 안내 한 줄, 목표<5·결과 있음은 없음', function () {
  const Z = { target_n: 12, pending_n: 12, unregistered_n: 0, rate_denominator: 0 };
  const a = results.barNoteHtml(Z);
  assert.ok(a.indexOf('class="db-why rs-bar-note"') > 0 && a.indexOf('role=') < 0);
  assert.ok(a.indexOf('입찰 결과가 나면 여기에 구성 막대가 그려집니다. 지금은 12곳 모두 결과 대기입니다.') > 0);
  assert.ok(results.barNoteHtml({ target_n: 12, pending_n: 9, unregistered_n: 3, rate_denominator: 0 }).indexOf('지금은 결과 대기 9곳, 확인 필요 3곳입니다.') > 0);
  assert.ok(results.barNoteHtml({ target_n: 12, pending_n: 0, unregistered_n: 12, rate_denominator: 0 }).indexOf('12곳 모두 확인 필요입니다.') > 0);
  assert.strictEqual(results.barNoteHtml({ target_n: 4, pending_n: 4, unregistered_n: 0, rate_denominator: 0 }), '', '목표 5곳 미만');
  assert.strictEqual(results.barNoteHtml(SUM), '', '결과가 있으면 없음');
  assert.strictEqual(results.barNoteHtml({ target_n: 30, success_retain_n: 30, rate_denominator: 30 }), '');
  assert.strictEqual(results.barNoteHtml(null), '');
  assert.strictEqual(results.barNoteHtml({ target_n: 12, pending_n: 0, unregistered_n: 0, rate_denominator: 0 }), '');
  assert.strictEqual(results.barHtml(Z, 400), '');
});

test('꺾쇠: span<96 이면 .rs-brace.l(이름표 왼쪽 정렬), 이상이면 가운데 + CSS', function () {
  assert.strictEqual(results.BRACE_NARROW, 96);
  const s = { target_n: 501, success_retain_n: 1, success_new_n: 0, fail_n: 0, pending_n: 500, unregistered_n: 0, rate_denominator: 1 };
  const m = results.barModel(s, 400);
  assert.ok(m.span > 0 && m.span < 96);
  assert.ok(/class="rs-brace l" style="width:/.test(results.barHtml(s, 400)));
  const wide = results.barHtml(SUM, 998);
  assert.ok(/class="rs-brace" style="width:/.test(wide) && wide.indexOf('rs-brace l') < 0);
  assert.ok(/\.rs-brace\.l span\s*\{[^}]*left:\s*0[^}]*transform:\s*none/.test(HTML));
  assert.ok(/\.rs-bar-note\s*\{[^}]*font-size:\s*12px[^}]*color:\s*var\(--muted\)/.test(HTML));
  assert.ok(/\.rs-band \.hb-k \.s\s*\{[^}]*word-break:\s*keep-all/.test(HTML));
});

test('barWidth: 늘 보이는 #rs-body(대체 #rs-band)로 잰다, 막대가 없으면 안내 줄', function () {
  const line = (SRC.match(/function barWidth\(\)[^\n]*/) || [''])[0];
  assert.ok(line.indexOf("$('rs-body')") > 0 && line.indexOf("$('rs-band')") > 0);
  assert.ok(line.indexOf("$('rs-bar')") < 0);
  assert.ok(SRC.indexOf("results.barHtml(d.summary, barWidth()) || results.barNoteHtml(d.summary)") > 0);
});

test('구성 막대는 SHOW_BAR=false 로 꺼 둔다(사용자 11-23, 코드는 유지)', function () {
  assert.strictEqual(results.SHOW_BAR, false);
  assert.ok(/const ok = results\.SHOW_BAR && d/.test(SRC), 'renderBar 가 SHOW_BAR 로 막대·안내를 끈다');
  assert.ok(typeof results.barHtml === 'function' && typeof results.barNoteHtml === 'function', '막대 코드는 지우지 않는다');
});
