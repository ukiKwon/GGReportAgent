// 입찰 현황판(NEXT 77 1단계) 순수 부분: 구간 경계·경과/미상·중복 제거·필터·약정 확인 수·진행 건수·버튼 행렬·이스케이프·CSS 규칙.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');

const TODAY = new Date('2026-11-11T00:00:00');   // 로컬 자정

function plus(days) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days);
  return logic.localDateStr(d);
}
function rec(name, region, days, extra) {
  return Object.assign({ name: name, region: region, type: '지자체', contractEnd: days === null ? null : plus(days), confirmed: true }, extra || {});
}

// ── 구간 경계 ──────────────────────────────────────────────────────
test('1년 경계: 0 포함·365 포함·366은 1년 뒤(later)', function () {
  const days = [0, 30, 31, 90, 91, 180, 181, 182, 183, 365, 366];
  // 추정(confirmed:false)으로 둔다 — 확정 공고가 오늘 난 곳(0일)은 '진행 중'이라 예정에 들지 않는다(2026-11-12).
  const list = days.map(function (d) { return rec('기관' + d, '11', d, { confirmed: false }); });
  const m = dash.model(list, TODAY);
  assert.strictEqual(m.upcoming.length, 10);
  assert.strictEqual(m.beyondN, 1);
  assert.strictEqual(m.later.length, 1);
  assert.strictEqual(m.later[0].days, 366);
  assert.strictEqual(m.upcoming[0].days, 0);                 // D-day는 1년 안
  assert.deepStrictEqual(m.upcoming.map(function (u) { return u.days; }), [0, 30, 31, 90, 91, 180, 181, 182, 183, 365]);
});

test('빨강/주황 경계: 182일은 urgent, 183일은 soon, 막대 칸에서 6개월 안·밖으로 갈린다', function () {
  const m = dash.model([rec('가', '11', 182), rec('나', '11', 183)], TODAY);
  assert.strictEqual(m.upcoming[0].band, 'urgent');
  assert.strictEqual(m.upcoming[1].band, 'soon');
  const h = dash.timelineHtml(m, TODAY, '6');
  assert.ok(h.indexOf('class="seg u') >= 0 && h.indexOf('class="seg s') >= 0);
});

// ── 기간 버튼(NEXT 77 재설계) ──────────────────────────────────────
test('WINDOWS 매핑·기본 6·잘못된 키는 6', function () {
  assert.deepStrictEqual([dash.WINDOWS['3'], dash.WINDOWS['6'], dash.WINDOWS['12'], dash.WINDOWS.all], [91, 182, 365, Infinity]);
  assert.strictEqual(dash.DEFAULT_WINDOW, '6');
  assert.strictEqual(dash.windowKey('12'), '12');
  ['', 'x', undefined, null, '7', 6].forEach(function (k) { assert.strictEqual(dash.windowKey(k), '6'); });
});

test('windowItems 경계: 6개월은 182 포함·183 제외·0 포함, 전체는 1년 뒤도 포함', function () {
  const list = [0, 91, 92, 182, 183, 365, 366, 900].map(function (d) { return rec('기관' + d, '11', d, { confirmed: false }); });
  const m = dash.model(list, TODAY);
  const days = function (k) { return dash.windowItems(m, k).map(function (u) { return u.days; }); };
  assert.deepStrictEqual(days('6'), [0, 91, 92, 182]);
  assert.deepStrictEqual(days('3'), [0, 91]);
  assert.deepStrictEqual(days('12'), [0, 91, 92, 182, 183, 365]);
  assert.deepStrictEqual(days('all'), [0, 91, 92, 182, 183, 365, 366, 900]);
  assert.deepStrictEqual(days('zzz'), [0, 91, 92, 182]);       // 잘못된 키 = 6개월
});

test('moreHint: 6 → 183~365 수·다음 12, 12 → 1년 뒤 수·다음 all, all·0곳 → null', function () {
  const m = dash.model([5, 100, 183, 200, 365, 366, 400, 500].map(function (d) { return rec('기관' + d, '11', d); }), TODAY);
  const h6 = dash.moreHint(m, '6');
  assert.strictEqual(h6.n, 3); assert.strictEqual(h6.next, '12');                    // 183·200·365
  assert.ok(h6.text.indexOf('6개월 뒤 1년 안에 3곳이 더 있습니다.') === 0 && h6.button === '1년으로 넓히기');
  const h12 = dash.moreHint(m, '12');
  assert.strictEqual(h12.n, 3); assert.strictEqual(h12.next, 'all');
  assert.ok(h12.text.indexOf('1년 뒤에 3곳이 더 있습니다.') === 0 && h12.button === '전체 보기');
  assert.strictEqual(dash.moreHint(m, 'all'), null);
  assert.strictEqual(dash.moreHint(dash.model([rec('가', '11', 10)], TODAY), '6'), null);
  assert.ok(dash.moreHintHtml(h6).indexOf('id="db-widen"') >= 0 && dash.moreHintHtml(h6).indexOf('data-win="12"') >= 0);
  assert.strictEqual(dash.moreHintHtml(null), '');
});

test('moreHint: 지역 조건을 함께 건다', function () {
  const m = dash.model([rec('가', '11', 200), rec('나', '26', 210)], TODAY);
  assert.strictEqual(dash.moreHint(m, '6').n, 2);
  assert.strictEqual(dash.moreHint(m, '6', { region: '26' }).n, 1);
});

// ── 월별 막대(D1) ──────────────────────────────────────────────────
test('monthBuckets: 13칸, 12월→1월 연도 넘김, 칸 합 = 1년 안 수, 4종 쌓기', function () {
  const T = new Date(2026, 10, 11);                           // 2026-11-11
  const at = function (name, date, conf, extra) { return Object.assign({ name: name, region: '11', type: '지자체', contractEnd: date, confirmed: conf }, extra || {}); };
  const list = [
    at('가', '2026-11-29', true), at('나', '2026-12-31', false), at('다', '2027-01-05', false),
    at('라', '2027-05-20', true), at('마', '2027-05-21', false), at('바', '2027-11-10', false),
  ];
  const m = dash.model(list, T);
  const mb = dash.monthBuckets(m, T);
  assert.strictEqual(mb.cols.length, 13);
  assert.deepStrictEqual([mb.cols[0].y, mb.cols[0].mo, mb.cols[1].mo, mb.cols[2].y, mb.cols[2].mo], [2026, 11, 12, 2027, 1]);
  assert.deepStrictEqual([mb.cols[12].y, mb.cols[12].mo], [2027, 11]);
  assert.strictEqual(mb.total, m.upcoming.length);
  assert.strictEqual(mb.cols.reduce(function (a, c) { return a + c.n; }, 0), 6);
  assert.deepStrictEqual([mb.cols[0].uf, mb.cols[0].ue], [1, 0]);   // 11월 29일 확정, 6개월 안
  assert.deepStrictEqual([mb.cols[1].uf, mb.cols[1].ue], [0, 1]);   // 12월 추정
  assert.deepStrictEqual([mb.cols[6].sf, mb.cols[6].se], [1, 1]);   // 2027-05: 183일 밖 → s, 확정 1·추정 1
  assert.strictEqual(mb.max, 2);
});

test('막대 높이 분모는 최소 4: 1곳짜리 달이 꽉 찬 막대가 아니다', function () {
  const m = dash.model([rec('가', '11', 20)], TODAY);
  const mb = dash.monthBuckets(m, TODAY);
  assert.strictEqual(mb.denom, 4);
  assert.strictEqual(dash.barPx(1, mb.denom), Math.round(110 / 4));
  assert.ok(dash.barPx(1, mb.denom) < dash.BAR_MAX_PX);
  assert.strictEqual(dash.barPx(0, 4), 0);
  assert.strictEqual(dash.barPx(1, 100), 10);                  // 최소 10px
  const big = dash.model([1, 2, 3, 4, 5, 6].map(function (n) { return rec('기관' + n, '11', 10 + n); }), TODAY);
  assert.strictEqual(dash.monthBuckets(big, TODAY).denom, 6);
});

test('시간표 aria-label: 0이 아닌 달 전부·확정/추정 합계, 기관명은 들어가지 않고 HTML은 이스케이프', function () {
  const T = new Date(2026, 10, 11);
  const evil = '<script>alert(1)</script>';
  const m = dash.model([
    { name: evil, region: '11', type: '지자체', contractEnd: '2026-11-29', confirmed: true },
    { name: 'b', region: '11', type: '지자체', contractEnd: '2027-05-20', confirmed: false },
    { name: 'c', region: '11', type: '지자체', contractEnd: '2027-05-21', confirmed: false }], T);
  const label = dash.chartLabel(dash.monthBuckets(m, T));
  assert.ok(label.indexOf('앞으로 1년 월별 입찰 예정 3곳') === 0);
  assert.ok(label.indexOf('2026년 11월 1곳') >= 0 && label.indexOf('2027년 5월 2곳') >= 0);
  assert.ok(label.indexOf('확정 1곳, 추정 2곳') >= 0);
  assert.strictEqual(label.indexOf(evil), -1);
  const html = dash.timelineHtml(m, T, '6');
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.ok(html.indexOf('id="db-tile-ov"') >= 0 && html.indexOf('id="db-tile-later"') >= 0 && html.indexOf('id="db-tomap"') >= 0);
  assert.ok(html.indexOf('월별 입찰 예정') >= 0 && html.indexOf('경과 <b>0</b>곳') >= 0 && html.indexOf('기준일 <b>2026-11-11</b>') >= 0);
  assert.ok(html.indexOf('role="img"') >= 0 && html.indexOf('aria-hidden="true"') >= 0);
});

test('시간표: 약정 만료 기준 추정은 범례에서 문구로 구분한다(basis=expiry)', function () {
  const T = new Date(2026, 10, 11);
  const m = dash.model([{ name: '가', region: '11', type: '지자체', contractExpiry: '2027-06-30' }], T);
  if (m.upcoming.length) {                                   // logic.effectiveBid가 expiry를 반영한 뒤에만 의미가 있다
    assert.strictEqual(m.upcoming[0].basis, 'expiry');
    assert.strictEqual(m.expiryN, 1);
    assert.ok(dash.timelineHtml(m, T, '6').indexOf('약정 만료 기준') >= 0);
    assert.ok(dash.paneHtml(m.upcoming[0], { act: 'none', today: T }).indexOf('약정 만료일의 6개월 전으로 추정') >= 0);
  }
  assert.ok(dash.timelineHtml(m, T, '6').indexOf('약정 만료 6개월 전') >= 0);
});

test('기간 창: 6개월은 오늘 선에서 시작해 가운데 어딘가에서 끝나고, 전체는 끝까지', function () {
  const T = new Date(2026, 10, 11);
  const s6 = dash.windowSpan(T, '6'), sAll = dash.windowSpan(T, 'all');
  assert.ok(s6.from >= 0 && s6.from < 100 / 13 && s6.to > s6.from && s6.to < 100);
  assert.strictEqual(sAll.to, 100);
  assert.ok(dash.windowSpan(T, '12').to > s6.to);
  assert.ok(dash.timelineHtml(dash.model([], T), T, 'all').indexOf('db-tile later on') >= 0);
});

// ── 제안 진행 단계(D2) ─────────────────────────────────────────────
test('stageCounts: CANCELLED 제외·기관 중복 제거(앞선 단계)·승인 대기는 1·3번 단계', function () {
  const preps = [
    { institution_id: 'A', state_cd: 'CONFIRMED' }, { institution_id: 'A', state_cd: 'WRITABLE' },
    { institution_id: 'B', state_cd: 'OPEN_PENDING' }, { institution_id: 'C', state_cd: 'IN_PROGRESS' },
    { institution_id: 'D', state_cd: 'APPROVAL_PENDING' }, { institution_id: 'E', state_cd: 'WRITING' },
    { institution_id: 'F', state_cd: 'CANCELLED' }, { institution_id: 'G', state_cd: 'CONFIRMED' }];
  const overview = { items: [{ institution_id: 'H', state: 'RUNNING', done: false }, { institution_id: 'E', state: 'RUNNING', done: false },
    { institution_id: 'I', state: 'NONE', done: false }, { institution_id: 'J', state: 'RUNNING', done: true }] };
  const r = dash.stageCounts(preps, overview);
  assert.deepStrictEqual(r.stages.map(function (s) { return s.n; }), [1, 1, 1, 1, 3]);   // 확정 G · 개설대기 B · 사전 C · 기획대기 D · 작성 A·E+H
  assert.strictEqual(r.total, 7);
  assert.deepStrictEqual(r.stages.map(function (s) { return s.gate; }), [false, true, false, true, false]);
  assert.strictEqual(r.onlyWriting, false);
  assert.strictEqual(r.total, dash.progressCount(preps, overview).total);               // 기존 합계와 같다
});

test('stageCounts: /preps 없는 역할은 제안서 작성만, 둘 다 없으면 null', function () {
  const ov = [{ id: 'C', state: 'RUNNING', done: false }, { id: 'F', state: 'RUNNING', done: false }];
  const r = dash.stageCounts(null, ov);
  assert.strictEqual(r.onlyWriting, true); assert.strictEqual(r.stages[4].n, 2); assert.strictEqual(r.total, 2);
  assert.strictEqual(dash.stageCounts(null, null), null);
  const html = dash.stageCardHtml({ state: 'ok', stages: r });
  assert.ok(html.indexOf('단계별 건수는 영업팀·영업팀장·영업부장에게 보입니다.') >= 0);
  assert.strictEqual(html.indexOf('개설 승인 대기'), -1);
});

test('stageCardHtml: dl 구조·막대 aria-hidden·승인 대기만 주황 g·상태 문구', function () {
  const r = dash.stageCounts([{ institution_id: 'A', state_cd: 'OPEN_PENDING' }, { institution_id: 'B', state_cd: 'CONFIRMED' }], []);
  const html = dash.stageCardHtml({ state: 'ok', stages: r });
  assert.ok(html.indexOf('<dl class="stg">') >= 0 && html.indexOf('<dt>개설 승인 대기</dt>') >= 0 && html.indexOf('합계 <b>2</b>건') >= 0);
  assert.ok(html.indexOf('class="bw" aria-hidden="true"') >= 0);
  assert.strictEqual((html.match(/class="b g"/g) || []).length, 1);                 // 개설 승인 대기 1건만 주황(기획승인 대기는 0이라 꼬리)
  assert.ok(html.indexOf('class="b z"') >= 0);
  assert.ok(html.indexOf('같은 기관은 한 번만 셉니다.') >= 0);
  assert.ok(dash.stageCardHtml({ state: 'offline' }).indexOf('서버에 연결하면 보입니다.') >= 0);
  assert.ok(dash.stageCardHtml({ state: 'loading' }).indexOf('불러오는 중입니다') >= 0);
  assert.ok(dash.stageCardHtml({ state: 'denied', code: 403 }).indexOf('권한이 없습니다(403)') >= 0);
  assert.ok(dash.stageCardHtml({ state: 'error' }).indexOf('id="db-retry"') >= 0);
});

// ── 약정 주기 막대(D4) ─────────────────────────────────────────────
test('termBar: lastBid 없으면 null, 비율 0~100, 추정이면 점선, 경과는 꽉 참', function () {
  const T = new Date(2026, 10, 11);
  const mk = function (extra) { return dash.model([rec('가', '11', 20, extra)], T).upcoming[0]; };
  assert.strictEqual(dash.termBar(mk(), T), null);                              // lastBid 없음
  assert.strictEqual(dash.termBar(mk({ lastBid: '2024-01-01' }), null), null);  // 오늘 없음
  const t = dash.termBar(mk({ lastBid: '2022-11-11', confirmed: false }), T);
  assert.ok(t.pct > 95 && t.pct < 100 && t.est === true && t.over === false);
  const conf = dash.termBar(mk({ lastBid: '2022-11-11', confirmed: true }), T);
  assert.strictEqual(conf.est, false);
  const future = dash.termBar(mk({ lastBid: '2030-01-01' }), T);                // 최근 절차일이 미래 → 0으로 자른다
  assert.strictEqual(future.pct, 0);
  const over = dash.model([rec('경과', '11', -5, { lastBid: '2022-01-01', confirmed: false })], T).overdue[0];   // 확정이면 −5일은 '진행 중'
  const o = dash.termBar(over, T);
  assert.strictEqual(o.pct, 100); assert.strictEqual(o.over, true);
  const html = dash.termBarHtml(over, T);
  assert.ok(html.indexOf('term-stamp') < 0 && html.indexOf('role="img"') >= 0 && html.indexOf('D+5') >= 0);   // 도장은 머리의 D+n 하나만(막대 쪽 중복 제거)
  assert.ok(html.indexOf('class="db-term over"') >= 0);
  assert.ok(dash.termBarHtml(mk({ lastBid: '2022-11-11', confirmed: false }), T).indexOf('class="end est') >= 0);
  assert.strictEqual(dash.termBarHtml(mk(), T), '');
  assert.ok(dash.paneHtml(mk({ lastBid: '2022-11-11' }), { act: 'none', today: T }).indexOf('<h3>약정 주기</h3><div class="db-term') >= 0);
});

// ── 국민은행 와플(D3) ──────────────────────────────────────────────
test('와플: 칸 수 = 조사한 기관 수, 채운 칸 = 확인 수', function () {
  const h = dash.waffleHtml({ confirmed: 6, unconfirmed: 237, total: 243 });
  assert.strictEqual((h.match(/<i[ >]/g) || []).length, 243);
  assert.strictEqual((h.match(/<i class="k">/g) || []).length, 6);
  assert.ok(h.indexOf('role="img"') >= 0 && h.indexOf('243곳 중') >= 0 && h.indexOf('확인한 곳 6곳') >= 0);
  const card = dash.kbCardHtml({ confirmed: 6, unconfirmed: 237, total: 243 });
  assert.ok(card.indexOf('국민은행 금고 약정') >= 0 && card.indexOf('확인 <b>6</b>곳 / 조사 <b>243</b>곳') >= 0);
  assert.ok(card.indexOf('미확인은 \'아님\'이 아니라 \'아직 모름\'입니다.') >= 0);
});

test('기간 버튼 마크업: 네이티브 라디오 4개·선택 1개·숨은 legend', function () {
  const h = dash.periodHtml('12');
  assert.strictEqual((h.match(/type="radio" name="db-per"/g) || []).length, 4);
  assert.ok(h.indexOf('value="12" checked') >= 0 && (h.match(/checked/g) || []).length === 1);
  ['3개월', '6개월', '1년', '전체'].forEach(function (t) { assert.ok(h.indexOf('<span>' + t + '</span>') >= 0); });
  assert.ok(h.indexOf('<legend class="sr-only">입찰 예정일 기간</legend>') === 0);
  assert.ok(dash.periodHtml('bad').indexOf('value="6" checked') >= 0);
  assert.ok(dash.groupLabel('6', 1).indexOf('6개월 안 <b>1</b>곳 · 가까운 순') === 0);
  assert.ok(dash.groupLabel('all', 9).indexOf('전체: 앞으로 입찰 <b>9</b>곳(날짜를 아는 곳)') === 0);
});

// ── 경과·미상·중복 제거 ────────────────────────────────────────────
test('경과·미상 집계와 기관 단위 중복 제거(수원 4구가 1곳)', function () {
  const list = [
    rec('수원시청', '41', 40), rec('수원시청', '41', 40), rec('수원시청', '41', 40), rec('수원시청', '41', 40),
    rec('경과시청', '11', -5, { confirmed: false }), rec('경과군청', '11', -1, { confirmed: false }),   // 확정이면 '진행 중'이라 경과가 아니다
    { name: '미상구청', region: '11', type: '지자체' },
  ];
  const m = dash.model(list, TODAY);
  assert.strictEqual(m.upcoming.length, 1);
  assert.strictEqual(m.overdue.length, 2);
  assert.strictEqual(m.overdue[0].days, 1);                  // 최근에 지난 순
  assert.strictEqual(m.overdue[0].overdue, true);
  assert.strictEqual(m.unknownN, 1);
  assert.strictEqual(m.total, 4);
});

test('확정·확인 중·자료 수정 집계', function () {
  const list = [
    rec('가', '11', 50, { updatedAt: '2026-11-01T10:00:00' }),
    rec('나', '11', 60, { confirmed: false, updatedAt: '2026-11-09' }),
    rec('관악구청', '11', 70),                                // 날짜 의미 확인 중 7곳 중 하나
  ];
  const m = dash.model(list, TODAY);
  assert.strictEqual(m.confirmedN, 2);
  assert.strictEqual(m.underReviewN, 1);
  assert.strictEqual(m.maxUpdated, '2026-11-09');
  const chk = m.upcoming.filter(function (u) { return u.name === '관악구청'; })[0];
  assert.strictEqual(chk.check, true);
  assert.ok(dash.rowHtml(chk, { id: 'x' }).indexOf('날짜 의미 확인 중') >= 0);
});

test('1년 안 0곳: 시간표는 0을 숨기지 않고 경과·1년 뒤·날짜 미상 칸을 함께 보인다', function () {
  const m = dash.model([rec('경과시청', '11', -3, { confirmed: false }), rec('먼시청', '11', 500), { name: '미상구청', region: '11', type: '지자체' }], TODAY);
  assert.strictEqual(m.upcoming.length, 0);
  const h = dash.timelineHtml(m, TODAY, '6');
  assert.ok(h.indexOf('1년 안 <b>0</b>곳') >= 0 && h.indexOf('<span class="n">1곳</span><span class="t">공고 예정일 경과') >= 0);
  assert.ok(h.indexOf('<span class="n">1곳</span><span class="t">1년 뒤') >= 0 && h.indexOf('<span class="n">1곳</span><span class="t">날짜 미상') >= 0);
  assert.ok(dash.railHtml({ confirmed: 0, unconfirmed: 3, total: 3 }, { state: 'offline' }).indexOf('서버에 연결하면 보입니다.') >= 0);
  const foot = dash.footHtml(m);
  assert.ok(foot.indexOf('날짜를 확인하지 못한 <b>1</b>곳은 목록에 없습니다.') >= 0 && foot.indexOf('1년 뒤') < 0);
  assert.strictEqual(dash.footHtml(dash.model([rec('가', '11', 5)], TODAY)), '');
  assert.strictEqual(dash.windowItems(m, '6').length, 0);
  assert.strictEqual(dash.windowItems(m, 'all').length, 1);   // 전체에는 1년 뒤 기관이 들어온다
  assert.strictEqual(dash.moreHint(m, '12').n, 1);            // 비어 있어도 다음 구간 안내가 나온다
});

// ── 필터 ───────────────────────────────────────────────────────────
test('종류 필터는 종류가 2개 이상일 때만', function () {
  assert.strictEqual(dash.showTypeFilter([rec('가', '11', 5), rec('나', '26', 6)]), false);
  assert.strictEqual(dash.showTypeFilter([rec('가', '11', 5), rec('나', '26', 6, { type: '공공기관' })]), true);
  assert.strictEqual(dash.showTypeFilter([]), false);
});

test('regionOptions: 데이터에 있는 시·도만, 중복 없이 가나다순', function () {
  const names = { '11': '서울', '26': '부산', '41': '경기' };
  const opts = dash.regionOptions([rec('가', '41', 1), rec('나', '11', 1), rec('다', '11', 1), rec('라', '26', 1)], function (c) { return names[c]; });
  assert.deepStrictEqual(opts.map(function (o) { return o.name; }), ['경기', '부산', '서울']);
  assert.strictEqual(opts.length, 3);
});

test('filterItems: 기관명 검색·지역·종류', function () {
  const m = dash.model([rec('가람시청', '41', 10), rec('나래군청', '42', 20), rec('다솔구청', '41', 30, { type: '공공기관' })], TODAY);
  assert.strictEqual(dash.filterItems(m.upcoming, { q: '나래' }).length, 1);
  assert.strictEqual(dash.filterItems(m.upcoming, { region: '41' }).length, 2);
  assert.strictEqual(dash.filterItems(m.upcoming, { region: '41', type: '공공기관' }).length, 1);
  assert.strictEqual(dash.filterItems(m.upcoming, { q: '없는이름' }).length, 0);
});

// ── 국민은행 약정 확인 수 ──────────────────────────────────────────
test('kbCount: 검증 키 목록이 없으면 확인 0 / 미확인 N', function () {
  const list = [rec('가', '11', 5), rec('나', '26', 6)];
  assert.deepStrictEqual(dash.kbCount(list, undefined), { confirmed: 0, unconfirmed: 2, total: 2 });
  assert.deepStrictEqual(dash.kbCount(list, []), { confirmed: 0, unconfirmed: 2, total: 2 });
});

test('kbCount: region|name 키로 세고 같은 기관 중복·목록에 없는 키는 세지 않는다', function () {
  const list = [rec('가', '11', 5), rec('가', '11', 5), rec('나', '26', 6), rec('다', '41', 7)];
  const k = dash.kbCount(list, [{ key: '11|가', name: '가', slot: null }, '26|나', { key: '99|없음' }]);
  assert.deepStrictEqual(k, { confirmed: 2, unconfirmed: 1, total: 3 });
});

test('KB_VERIFIED(frontend/data/kb-verified.js)의 키가 실제 레코드 region|name과 맞물린다', function (t) {
  const file = path.join(ROOT, 'data/kb-verified.js');
  if (!fs.existsSync(file)) { t.skip('kb-verified.js 아직 없음'); return; }
  const load = function (rel, name) {
    const sb = { window: {} };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb);
    return JSON.parse(JSON.stringify(sb.window[name]));   // 다른 realm 값을 이 realm으로 옮긴다
  };
  const verified = load('data/kb-verified.js', 'KB_VERIFIED');
  const institutions = load('data/institutions.js', 'institutions');
  assert.ok(Array.isArray(verified) && verified.length > 0);
  const keys = {};
  institutions.forEach(function (r) { keys[logic.instKey(r)] = true; });
  verified.forEach(function (v) {
    assert.ok(keys[v.key], '레코드에 없는 키: ' + v.key);
    assert.strictEqual(v.key, '' + v.key.split('|')[0] + '|' + v.name);
    assert.ok(v.quote && v.src_date);
  });
  const kb = dash.kbCount(institutions, verified);
  assert.strictEqual(kb.confirmed, verified.length);
});

// ── 진행 건수 ──────────────────────────────────────────────────────
test('progressCount: institution_id로 한 번만, 취소·완료·실행 없음 제외', function () {
  const preps = [
    { institution_id: 'A', state_cd: 'CONFIRMED' }, { institution_id: 'A', state_cd: 'WRITABLE' },
    { institution_id: 'B', state_cd: 'CANCELLED' },
  ];
  const overview = { items: [
    { institution_id: 'A', state: 'RUNNING', done: false },     // 이미 사전준비에서 셌다
    { institution_id: 'C', state: 'RUNNING', done: false },
    { institution_id: 'C', state: 'PENDING_APPROVAL', done: false },
    { institution_id: 'D', state: 'NONE', done: false },
    { institution_id: 'E', state: 'RUNNING', done: true },
  ] };
  assert.deepStrictEqual(dash.progressCount(preps, overview), { prep: 1, writing: 1, total: 2 });
});

test('progressCount: /preps를 못 받는 역할은 제안서 작성 건수만, 둘 다 없으면 null', function () {
  const overview = [{ id: 'C', state: 'RUNNING', done: false }, { id: 'F', state: 'RUNNING', done: false }];
  assert.deepStrictEqual(dash.progressCount(null, overview), { prep: null, writing: 2, total: 2 });
  assert.deepStrictEqual(dash.progressCount(null, null), { prep: null, writing: null, total: null });
  const h = dash.railHtml({ confirmed: 0, unconfirmed: 0, total: 0 }, { state: 'ok', count: dash.progressCount(null, overview), stages: dash.stageCounts(null, overview) });
  assert.ok(h.indexOf('합계 <b>2</b>건') >= 0 && h.indexOf('제안서 작성') >= 0);
  const d = dash.railHtml({ confirmed: 0, unconfirmed: 0, total: 0 }, { state: 'denied', code: 403 });
  assert.ok(d.indexOf('권한이 없습니다(403)') >= 0);
});

// ── 버튼 행렬(prep.popoverAction 재사용) ───────────────────────────
// popoverAction 대역: 70번 규격표(서버 모드 + 기관 id + 활성 건 + 역할)를 그대로 흉내 낸다.
const stubPrep = {
  popoverAction: function (r, ctx, actives) {
    if (!ctx.serverMode || !r.institutionId) return null;
    const has = actives.some(function (p) { return p.institution_id === r.institutionId; });
    const sales = ['영업팀', '영업팀장', '영업부장'].indexOf(ctx.role) >= 0;
    if (has && sales) return { kind: 'open' };
    if (!has && (ctx.role === '영업팀' || ctx.role === '영업팀장')) return { kind: 'confirm' };
    return null;
  },
};

test('actionKind 행렬: 역할 × 활성 건 × 서버 모드 × prep 유무', function () {
  const r = { institutionId: 'I1' };
  const act = [{ institution_id: 'I1', state_cd: 'CONFIRMED' }];
  const srv = function (role) { return { serverMode: true, role: role }; };
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], stubPrep), 'confirm');
  assert.strictEqual(dash.actionKind(r, srv('영업팀장'), [], stubPrep), 'confirm');
  assert.strictEqual(dash.actionKind(r, srv('영업부장'), [], stubPrep), 'none');
  assert.strictEqual(dash.actionKind(r, srv('디자이너'), [], stubPrep), 'none');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), act, stubPrep), 'open');
  assert.strictEqual(dash.actionKind(r, srv('영업부장'), act, stubPrep), 'open');
  assert.strictEqual(dash.actionKind(r, srv('디자이너'), act, stubPrep), 'none');
  assert.strictEqual(dash.actionKind({}, srv('영업팀'), [], stubPrep), 'none');                 // 기관 id 없음
  assert.strictEqual(dash.actionKind(r, { serverMode: false, role: '영업팀' }, [], stubPrep), 'unavailable');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], undefined), 'unavailable');          // root.prep 없음
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], {}), 'unavailable');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], { popoverAction: function () { return 'confirm'; } }), 'confirm');   // 문자열 반환도 받는다
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], { popoverAction: function () { throw new Error('x'); } }), 'unavailable');
});

test('actHtml: 서버 없음은 버튼 없이 안내, 권한 밖은 한 줄 안내, 확인 줄은 조사 함수', function () {
  const it = dash.model([rec('부산광역시', '26', 40)], TODAY).upcoming[0];
  const un = dash.actHtml(it, { act: 'unavailable' });
  assert.ok(un.indexOf('서버에 연결되면 [제안 확정]을 쓸 수 있습니다.') >= 0);
  assert.ok(un.indexOf('id="db-cf"') < 0 && un.indexOf('id="db-do"') < 0);
  assert.ok(dash.actHtml(it, { act: 'confirm' }).indexOf('id="db-cf"') >= 0);
  assert.ok(dash.actHtml(it, { act: 'open' }).indexOf('id="db-open"') >= 0);
  const none = dash.actHtml(it, { act: 'none', role: '영업부장' });
  assert.ok(none.indexOf('제안 확정은 영업팀·영업팀장이 합니다.') >= 0 && none.indexOf('id="db-cf"') < 0);
  const cf = dash.actHtml(it, { act: 'confirm', confirm: true });
  assert.ok(cf.indexOf('부산광역시를 제안 대상으로 확정합니다.') >= 0);
  assert.ok(cf.indexOf('id="db-do"') >= 0 && cf.indexOf('id="db-cancel"') >= 0);
});

test('josaEul: 받침 유무', function () {
  assert.strictEqual(dash.josaEul('부산광역시'), '를');
  assert.strictEqual(dash.josaEul('노원구청'), '을');
  assert.strictEqual(dash.josaEul('서울특별시'), '를');
  assert.strictEqual(dash.josaEul(''), '를');
});

// ── 상세·이스케이프 ────────────────────────────────────────────────
test('paneHtml: 금고 순번(slot)은 있을 때만 표시, 값이 없으면 미확인 칩', function () {
  const it = dash.model([rec('부산광역시', '26', 40, { lastBid: '2024-09-24', term: 4 })], TODAY).upcoming[0];
  const withSlot = dash.paneHtml(it, { act: 'none', kb: { key: '26|부산광역시', slot: 2, quote: '현 금고 문장', src_date: '2024-09-24' } });
  assert.ok(withSlot.indexOf('KB국민은행 · 2금고') >= 0 && withSlot.indexOf('현 금고 문장') >= 0);
  const noSlot = dash.paneHtml(it, { act: 'none', kb: { key: '26|부산광역시', slot: null, quote: 'q', src_date: '2022-10-23' } });
  assert.ok(noSlot.indexOf('KB국민은행</dd>') >= 0 && noSlot.indexOf('금고 ·') < 0);
  const plain = dash.paneHtml(it, { act: 'none', kb: null });
  assert.ok(plain.indexOf('pop-unk') >= 0 && plain.indexOf('약정 기록을 모으면') >= 0);
  assert.ok(plain.indexOf('기관장 프로필은 수집 예정입니다.') >= 0);
  const bare = dash.paneHtml(dash.model([{ name: '빈구청', region: '11', type: '지자체', contractEnd: plus(9), confirmed: true }], TODAY).upcoming[0], { act: 'none' });
  assert.ok(bare.indexOf('pop-unk') >= 0);                                     // 최근 절차일·약정 주기 없음 → 칩(빈칸·'-' 금지)
});

test('이스케이프: 기관명·출처·검증 문장의 <script>가 그대로 나가지 않는다', function () {
  const evil = '<script>alert(1)</script>';
  const m = dash.model([rec(evil, '11', 20, { sources: [evil, 'https://example.invalid/a"onmouseover="x'] }), rec(evil + '2', '11', -3, { confirmed: false })], TODAY);
  const html = [
    dash.rowHtml(m.upcoming[0], { id: evil, selected: true, prepActive: true }),
    dash.rowHtml(m.overdue[0], { id: 'p' }),
    dash.paneHtml(m.upcoming[0], { act: 'confirm', confirm: true, kb: { slot: '<b>', quote: evil, src_date: evil } }),
    dash.paneHtml(m.overdue[0], { act: 'open' }),
    dash.railHtml({ confirmed: 0, unconfirmed: 1, total: 1 }, { state: 'denied', code: evil }),
    dash.timelineHtml(m, TODAY, evil),
    dash.stageCardHtml({ state: 'ok', stages: dash.stageCounts([{ institution_id: evil, state_cd: 'CONFIRMED' }], null) }),
  ].join('');
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.strictEqual(html.indexOf('<b>"'), -1);
  assert.ok(html.indexOf('&lt;script&gt;') >= 0);
  assert.ok(!/href="[^"]*"onmouseover/.test(html));
});

test('경과 행: D+ 도장과 확인 안내, 선택·진행 배지는 1년 안 행만', function () {
  const m = dash.model([rec('경과시청', '11', -150)], TODAY);   // 확정 공고 후 150일 — 120일을 넘어 경과다
  const h = dash.rowHtml(m.overdue[0], { id: 'db-p-0', selected: false, prepActive: true });
  assert.ok(h.indexOf('ov-stamp">D+150') >= 0 && h.indexOf('공고 진행 중 · 결과 확인이 필요합니다') >= 0);   // 확정 공고가 지남
  const est = dash.model([rec('추정시청', '11', -7, { confirmed: false })], TODAY);
  assert.ok(dash.rowHtml(est.overdue[0], {}).indexOf('공고가 났는지 확인이 필요합니다') >= 0);       // 추정 날짜가 지남
  assert.ok(h.indexOf('role="option"') >= 0 && h.indexOf('data-key="11|경과시청"') >= 0);
  assert.strictEqual(h.indexOf('사전준비 중'), -1);
});

// ── 날짜 근거(basis) 표기·선택 정리·포커스(qa·design 지적 반영) ───
test('약정 만료 기준 추정은 목록 행·메타·상세 어디서나 같은 말, 공고 기준 미확정은 공고 문구', function () {
  const T = new Date(2026, 10, 11);
  const m = dash.model([
    { name: '만료구청', region: '11', type: '지자체', contractExpiry: '2027-06-30' },
    { name: '공고구청', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false },
    { name: '주기구청', region: '11', type: '지자체', lastBid: '2024-12-01', term: 3 },
    { name: '확정구청', region: '11', type: '지자체', contractEnd: plus(40), confirmed: true }], T);
  const by = function (n) { return m.upcoming.filter(function (u) { return u.name === n; })[0]; };
  const exp = by('만료구청');
  if (exp && exp.basis === 'expiry') {                         // logic.effectiveBid가 contractExpiry를 반영한 뒤에만
    assert.ok(exp.label.indexOf('추정·약정 만료 기준') >= 0);
    assert.ok(dash.rowHtml(exp, { id: 'x' }).indexOf('(추정·약정 만료 기준)') >= 0);
    assert.ok(dash.paneHtml(exp, { act: 'none' }).indexOf('<dd><span class="v">' + exp.date + '</span> (추정·약정 만료 기준)') >= 0);
  }
  const notice = by('공고구청');
  assert.strictEqual(notice.basis, 'notice');
  const pane = dash.paneHtml(notice, { act: 'none' });
  assert.ok(pane.indexOf('공고된 날짜이나 의미 확인 중입니다') >= 0 && pane.indexOf('최근 절차일에 약정 주기를 더한') < 0);
  assert.ok(dash.paneHtml(by('확정구청'), { act: 'none' }).indexOf('공고로 확인한 날입니다') >= 0);
  const cyc = by('주기구청');
  if (cyc) assert.ok(dash.paneHtml(cyc, { act: 'none' }).indexOf('최근 절차일에 약정 주기를 더한') >= 0);
  const leg = dash.timelineHtml(m, T, '6');
  assert.ok(leg.indexOf('추정(최근 절차일+약정 주기 / 약정 만료 6개월 전 / 공고 날짜 의미 확인 중)') >= 0);
  assert.ok(m.expiryN === 0 || leg.indexOf('1년 안 약정 만료 기준 <b class="v">' + m.expiryN + '</b>곳') >= 0);
});

test('visibleKeys: 기간 안 + 펼친 경과 묶음만(접히면 경과 제외), 조건은 둘 다에 건다', function () {
  const m = dash.model([rec('가', '11', 10), rec('나', '26', 300), rec('다', '11', -4, { confirmed: false }), rec('라', '26', -2, { confirmed: false })], TODAY);
  assert.deepStrictEqual(dash.visibleKeys(m, '6', {}, true).sort(), ['11|가', '11|다', '26|라']);
  assert.deepStrictEqual(dash.visibleKeys(m, '6', {}, false), ['11|가']);          // 접힌 묶음의 선택은 풀려야 한다
  assert.deepStrictEqual(dash.visibleKeys(m, '12', { region: '26' }, true).sort(), ['26|나', '26|라']);
  assert.ok(dash.visibleKeys(m, '3', {}, false).indexOf('26|나') < 0);
});

test('1년 뒤 칸: aria-pressed로 선택 상태를 말한다', function () {
  const m = dash.model([rec('가', '11', 500)], TODAY);
  assert.ok(dash.timelineHtml(m, TODAY, '6').indexOf('id="db-tile-later" data-win="all" aria-pressed="false"') >= 0);
  assert.ok(dash.timelineHtml(m, TODAY, 'all').indexOf('aria-pressed="true"') >= 0);
});

test('dashboard.js 소스: 포커스 복귀·미선택 상세 이름·mount 때 선택 정리', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(/case 'db-widen':[^\n]*#db-per input:checked/.test(src));               // 선택된 기간 라디오로
  assert.ok(/case 'db-tile-later':[^\n]*\$\('db-tile-later'\)/.test(src));          // 다시 그린 칸으로
  assert.ok(/case 'db-retry':[^\n]*rl\.focus\(\)/.test(src) && src.indexOf('id="db-rail" tabindex="-1"') >= 0);
  assert.ok(/case 'db-clear':[^\n]*\$\('db-q'\)/.test(src));
  assert.ok(src.indexOf("setAttribute('aria-label', '기관 상세')") >= 0);
  assert.ok(src.indexOf('dash.visibleKeys(M, st.win') >= 0 && /case 'db-past':[^\n]*pruneSelection\(\)/.test(src));
});

// ── 스타일 규칙 ────────────────────────────────────────────────────
test('CSS 블록: 11px 미만 글자·새 hex 없음, 시작/끝 주석', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 입찰 현황판 시작'), b = html.indexOf('/* 입찰 현황판 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b);
  (css.match(/font(?:-size)?:\s*[^;]*?(\d+(?:\.\d+)?)px/g) || []).forEach(function (m) {
    const n = Number(/(\d+(?:\.\d+)?)px/.exec(m)[1]);
    if (/font-size|font:/.test(m)) assert.ok(n >= 11, '11px 미만: ' + m);
  });
  assert.deepStrictEqual(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g), null);
  assert.ok(/\.db-scroll \{[^}]*overflow-x:hidden/.test(css));                       // 행 hover 이동이 가로 스크롤바를 만들지 않게(P2-2)
  assert.ok(/\.db-work \{[^}]*grid-template-columns:400px minmax\(0, 1fr\) 380px/.test(css));   // 격자 §6-A
  assert.ok(/\.db-pane-body \{[^}]*max-width:820px/.test(css));
  assert.ok(/\.db-row \.nm \{ font-size:14px/.test(css) && /\.db-row \.meta \{[^}]*font-size:12px/.test(css));   // §6-B 글자 한 단 위로
  assert.ok(/@media \(prefers-reduced-motion:reduce\)/.test(css));
  // 11px은 축·창 라벨·배지 같은 좁은 자리만: 글자 선언의 20% 이하
  const sizes = (css.match(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g) || []).map(function (s) { return Number(/(\d+)px/.exec(s)[1]); });
  assert.ok(sizes.filter(function (n) { return n === 11; }).length <= Math.ceil(sizes.length * 0.2), '11px 선언이 많다: ' + sizes.join(','));
  assert.ok(html.indexOf('<script src="js/dashboard.js"></script>') > html.indexOf('<script src="data/kb-verified.js"></script>'));
  assert.ok(html.indexOf('<script src="js/dashboard.js"></script>') < html.indexOf('<script src="js/app.js"></script>'));
});
