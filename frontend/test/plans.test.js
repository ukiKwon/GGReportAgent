// 기관 사업계획 1단계(2026-11-16): 예산 4상태·출처 줄·사업 행 배지·문서 카드·목록 행·현황판 상세 훅·연결(nav·app·index.html)·소스 규칙.
// 서버(fetch)·DOM 부분(mount 이하)은 node에서 돌리지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const nav = require('../js/nav.js');
const dash = require('../js/dashboard.js');
const plans = require('../js/plans.js');

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'plans.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

const TODAY = new Date(2026, 10, 16);   // 2026-11-16 로컬 자정
function plus(days) { return logic.localDateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days)); }
function rec(name, region, days, extra) {
  return Object.assign({ name: name, region: region, type: '지자체', contractEnd: days === null ? null : plus(days), confirmed: false }, extra || {});
}
function item(over) {
  return Object.assign({ item_id: 1, row_no: 1, field_no: '1', field_name: '경제', item_no: '1', parent_no: null, name: '청년 창업 지원', content: null,
    budget: { state_cd: 'AMOUNT', amount: '1200', unit_cd: 'MIL_KRW', years: null }, calculated: null,
    page: '42', check_cd: 'CONFIRMED', progress_cd: null, exec_rate: null, note: null }, over || {});
}
function doc(over) {
  return Object.assign({ doc_id: 7, title: '민선8기 공약 실천계획', src_kind_cd: 'PLEDGE', src_kind_name: '공약이행', period_from: 2022, period_to: 2026,
    period_ended: false, src_url: 'https://example.go.kr/plan', url_missing: false, checked_on: '2026-11-10', stale: false, page_range: null, note: null,
    check_counts: { confirmed: 18, partial: 3, unconfirmed: 2, not_checked: 1 }, budget_unit_cd: 'MIL_KRW', items: [item()] }, over || {});
}
function view(docs, over) {
  return { status: 'ok', data: Object.assign({ institution_id: 'jongno', name_ko: '종로구', today: '2026-11-16',
    import: { import_id: 3, origin_cd: 'IMPORT', imported_at: '2026-11-16T01:02:03+00:00', file_date: '2026-11-10' }, docs: docs }, over || {}) };
}
function idx(h, s) { return h.indexOf(s); }

// ── 연결 ───────────────────────────────────────────────────────────
test('plans.SOON_ID는 nav의 기관 사업계획 항목 id(고정 또는 자동)와 같다', function () {
  const all = nav.CATEGORIES.reduce(function (a, c) { return a.concat(c.items); }, []);
  const it = all.filter(function (i) { return i.label === '기관 사업계획'; })[0];
  assert.ok(it);
  assert.strictEqual(it.sub, '기관');
  assert.strictEqual(it.id || 'soon:' + it.label, plans.SOON_ID);
});

test('app.js: showSoon이 plans id에서 soon-plain을 숨기고 plans.mount를 부른다, 계정 변경 때 onProfileChange', function () {
  assert.ok(APP_SRC.indexOf('itemId === root.plans.SOON_ID') > 0);
  assert.ok(APP_SRC.indexOf("document.getElementById('plans-root')") > 0);
  assert.ok(/isBoard \|\| isTeam \|\| isPrep \|\| dashReady \|\| isPlans/.test(APP_SRC));
  assert.ok(APP_SRC.indexOf('root.plans.mount(plansEl)') > 0);
  assert.ok(APP_SRC.indexOf('root.plans.onProfileChange()') > 0);
});

test('index.html: #plans-root 한 개, script 순서(dashboard.js 뒤·app.js 앞), CSS 규칙(새 hex·11px 미만·채운 주버튼·범례 영역 금지)', function () {
  assert.ok(/<div id="plans-root" style="display:none;"><\/div>/.test(HTML));
  assert.strictEqual(HTML.split('id="plans-root"').length, 2);
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('plans.js') > at('dashboard.js') && at('plans.js') < at('app.js') && at('plans.js') < at('render.js'));
  const a = HTML.indexOf('/* 기관 사업계획 시작'), b = HTML.indexOf('/* 기관 사업계획 끝 */');
  assert.ok(a > 0 && b > a);
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '새 hex 금지(토큰만)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 11, m); });
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  assert.ok(css.indexOf('.legend') < 0 && css.indexOf('#map-stage') < 0, '지도 범례 영역을 건드리지 않는다');
  assert.ok(/@media \(max-width:880px\)[\s\S]*\.pl-work \{ grid-template-columns:1fr/.test(css));
});

test('소스 규칙: confirm() 없음, 외부 주소 없음, 새 hex 없음, 서버 오류 문구를 innerHTML로 넣지 않음', function () {
  assert.ok(!/\bconfirm\(/.test(SRC));
  assert.ok(!/https?:\/\//.test(SRC));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC));
  assert.ok(!/innerHTML\s*=\s*[^;]*\be\.(message|detail)/.test(SRC));
  assert.ok(SRC.indexOf('safeHttpUrl') > 0);
});

// ── 값 도우미 ───────────────────────────────────────────────────────
test('fmtAmount: 쉼표·소수 정리, 숫자 꼴이 아니면 null(0으로 바꾸지 않는다)', function () {
  assert.strictEqual(plans.fmtAmount('1200'), '1,200');
  assert.strictEqual(plans.fmtAmount('1500.50'), '1,500.5');
  assert.strictEqual(plans.fmtAmount('1234567.000'), '1,234,567');
  assert.strictEqual(plans.fmtAmount('0.5'), '0.5');
  ['', null, undefined, 'abc', '-1', '1,200', '1.2.3'].forEach(function (v) { assert.strictEqual(plans.fmtAmount(v), null, String(v)); });
});

test('kstYmd: UTC 시각을 한국 날짜로(오후 UTC는 다음 날), 해석 실패는 앞 10자', function () {
  assert.strictEqual(plans.kstYmd('2026-11-16T01:02:03+00:00'), '2026-11-16');
  assert.strictEqual(plans.kstYmd('2026-11-16T16:00:00+00:00'), '2026-11-17');
  assert.strictEqual(plans.kstYmd('2026-11-16T10:00:00+09:00'), '2026-11-16');
  assert.strictEqual(plans.kstYmd(''), '');
});

test('filenameFrom: attachment 파일 이름, 이상하면 기본 이름', function () {
  assert.strictEqual(plans.filenameFrom('attachment; filename="plan_missing_20261116.csv"'), 'plan_missing_20261116.csv');
  assert.strictEqual(plans.filenameFrom('attachment; filename="../x.exe"'), 'plan_missing.csv');
  assert.strictEqual(plans.filenameFrom(''), 'plan_missing.csv');
  assert.strictEqual(plans.filenameFrom(null), 'plan_missing.csv');
});

// ── 예산 4상태(보충 C) ──────────────────────────────────────────────
test('budgetCell 금액: 열 머리 단위와 같으면 칸에서 단위를 빼고, 다르거나 머리 단위가 없으면 단위를 붙인다. 낭독 글자에는 단위가 항상 있다', function () {
  const a = plans.budgetCell(item(), 'MIL_KRW');
  assert.ok(a.html.indexOf('<span class="v">1,200</span>') >= 0);
  assert.ok(a.html.indexOf('백만원') < 0);
  assert.strictEqual(a.sr, '1,200 백만원');
  assert.ok(plans.budgetCell(item(), '').html.indexOf('백만원') >= 0);
  assert.ok(plans.budgetCell(item({ budget: { state_cd: 'AMOUNT', amount: '30', unit_cd: 'HUNDRED_MIL_KRW' } }), 'MIL_KRW').html.indexOf('억원') >= 0);
});

test('budgetCell 계산값: 서버 AMOUNT 계산값이면 값+계산값 표시와 낭독, 계산값이 확인안됨이면 상위 자신의 상태를 보인다', function () {
  const calc = { is_calculated: true, state_cd: 'AMOUNT', amount: '3400', unit_cd: 'MIL_KRW', child_count: 2 };
  const c = plans.budgetCell(item({ budget: { state_cd: 'NOT_IN_SOURCE', amount: null, unit_cd: null }, calculated: calc }), 'MIL_KRW');
  assert.ok(c.html.indexOf('3,400') >= 0 && c.html.indexOf('계산값') >= 0);
  assert.strictEqual(c.sr, '하위사업 합계 계산값 3,400 백만원');
  const bad = { is_calculated: true, state_cd: 'UNVERIFIED', amount: null, unit_cd: null, child_count: 2 };
  const u = plans.budgetCell(item({ budget: { state_cd: 'NOT_IN_SOURCE', amount: null, unit_cd: null }, calculated: bad }), 'MIL_KRW');
  assert.ok(u.html.indexOf('예산 미기재') >= 0 && u.html.indexOf('원문에 없음') < 0 && u.html.indexOf('계산값') < 0);
});

test('budgetCell 확인안됨: 칩 없이 비고의 예산 원문 글자(원문 표기), 40자 넘으면 자르고 title에 전체, 원문 조각이 없으면 예산 미기재', function () {
  const mk = function (note) { return plans.budgetCell(item({ budget: { state_cd: 'UNVERIFIED', amount: null, unit_cd: null }, note: note }), 'MIL_KRW'); };
  const a = mk('예산 원문: 268+32 / 기타');
  assert.strictEqual(a.html, '<span class="db-why">268+32 (원문 표기)</span>');
  assert.strictEqual(a.sr, '원문 표기 268+32');
  assert.ok(a.html.indexOf('pop-unk') < 0 && a.html.indexOf('확인안됨') < 0);
  assert.strictEqual(mk('앞말\n예산 원문: 12+3\n뒷말').sr, '원문 표기 12+3');   // 줄바꿈 앞까지
  const long = '별도 합계 649,112백만원(10~12번과 중복 가능, 합산 금지) — 장 투자계획표 안에 따로 적힌 합계';
  const l = mk('예산 원문: ' + long);
  assert.ok(l.html.indexOf(esc40(long) + '…') >= 0 && l.html.indexOf('title="' + long + '"') >= 0);
  assert.strictEqual(l.sr, '원문 표기 ' + long);
  const exact = '가'.repeat(40);
  assert.ok(mk('예산 원문: ' + exact).html.indexOf('title=') < 0 && mk('예산 원문: ' + exact).html.indexOf('…') < 0);   // 40자는 그대로
  [null, '', '다른 비고', '예산 원문:'].forEach(function (n) {
    const r = mk(n);
    assert.strictEqual(r.html, '<span class="db-why">예산 미기재</span>');
    assert.strictEqual(r.sr, '예산 미기재');
  });
  assert.ok(mk('예산 원문: <b>1</b>').html.indexOf('<b>') < 0);   // 이스케이프
  // 계산값이 확인안됨이면 상위 자신의 상태: 비고가 없으면 예산 미기재
  const bad = { is_calculated: true, state_cd: 'UNVERIFIED', amount: null, unit_cd: null, child_count: 2 };
  assert.strictEqual(plans.budgetCell(item({ budget: { state_cd: 'UNVERIFIED', amount: null, unit_cd: null }, calculated: bad }), 'MIL_KRW').sr, '예산 미기재');
});
function esc40(s) { return logic.esc(s.slice(0, 40)); }

test('budgetCell 나머지 상태: 예산 미기재·해당없음은 칩 없는 글자, 금액이 비어도 0을 만들지 않는다', function () {
  const mk = function (s) { return plans.budgetCell(item({ budget: { state_cd: s, amount: null, unit_cd: null } }), 'MIL_KRW'); };
  assert.ok(mk('UNVERIFIED').html.indexOf('pop-unk') < 0);
  const nis = mk('NOT_IN_SOURCE');
  assert.ok(/<span class="db-why">예산 미기재<\/span>/.test(nis.html) && nis.html.indexOf('pop-unk') < 0 && nis.html.indexOf('원문에 없음') < 0);
  assert.strictEqual(nis.sr, '예산 미기재');
  const na = mk('NOT_APPLICABLE');
  assert.ok(na.html.indexOf('해당없음') >= 0 && na.html.indexOf('pop-unk') < 0);
  assert.strictEqual(plans.budgetCell(item({ budget: { state_cd: 'AMOUNT', amount: null, unit_cd: 'MIL_KRW' } }), 'MIL_KRW').sr, '예산 미기재');   // 금액이 깨졌고 원문 조각도 없다
  assert.strictEqual(plans.budgetCell(item({ budget: { state_cd: 'AMOUNT', amount: '5', unit_cd: null } }), '').sr, '예산 미기재');
  ['UNVERIFIED', 'NOT_IN_SOURCE', 'NOT_APPLICABLE'].forEach(function (s) { assert.ok(!/>0</.test(mk(s).html), s); });
});

// ── 출처·쪽(보충 A) ─────────────────────────────────────────────────
test('srcLineHtml: URL 있으면 종류·링크 제목·확인일 순서 + rel/target + 인터넷 PC 안내, 없으면 글자 + 원문 문서 중립 배지', function () {
  const h = plans.srcLineHtml(doc());
  assert.ok(idx(h, '공약이행') < idx(h, '<a ') && idx(h, '<a ') < idx(h, '확인 '));
  assert.ok(h.indexOf('href="https://example.go.kr/plan" target="_blank" rel="noopener noreferrer"') >= 0);
  assert.ok(h.indexOf('(인터넷 PC에서 열림)') >= 0);
  assert.ok(h.indexOf('출처 URL 없음') < 0 && h.indexOf('원문 문서') < 0);
  const n = plans.srcLineHtml(doc({ src_url: null, url_missing: true }));
  assert.ok(n.indexOf('<a ') < 0 && n.indexOf('민선8기 공약 실천계획') >= 0);
  assert.ok(/<span class="wf-badge pp-neutral"[^>]*>원문 문서<\/span>/.test(n) && n.indexOf('pop-unk') < 0 && n.indexOf('출처 URL 없음') < 0);
  assert.ok(idx(n, '확인 ') < idx(n, '원문 문서'));
});

test('srcLineHtml·docHtml: url_missing이 참이면 src_url이 있어도 링크를 내지 않고 안내와 같은 기준을 쓴다', function () {
  const d = doc({ url_missing: true });   // src_url 은 안전한 https 주소로 남아 있다
  const h = plans.srcLineHtml(d);
  assert.ok(h.indexOf('<a ') < 0 && h.indexOf('href=') < 0 && h.indexOf('인터넷 PC에서 열림') < 0);
  assert.ok(/<span class="wf-badge pp-neutral"[^>]*>원문 문서<\/span>/.test(h) && h.indexOf('출처 URL 없음') < 0);
  const c = plans.docHtml(d, '');
  assert.ok(c.indexOf('<a ') < 0 && c.indexOf('원문 쪽수로 대조하세요.') < 0 && c.indexOf('원문 문서') >= 0 && c.indexOf('출처 URL 없음') < 0);
  const ok = plans.docHtml(doc(), '');   // url_missing 거짓 + 주소 있음 = 링크
  assert.ok(ok.indexOf('<a href="https://example.go.kr/plan"') >= 0 && ok.indexOf('원문 쪽수로 대조하세요.') < 0);
});

test('srcLineHtml: javascript: 같은 주소는 링크로 쓰지 않고 이스케이프한다', function () {
  const h = plans.srcLineHtml(doc({ src_url: 'javascript:alert(1)', title: '<b>x</b>' }));
  assert.ok(h.indexOf('href=') < 0 && h.indexOf('<b>') < 0 && h.indexOf('&lt;b&gt;') >= 0);
  assert.ok(h.indexOf('원문 문서') >= 0 && h.indexOf('출처 URL 없음') < 0);
});

test('쪽수는 화면에 없다: 쪽 칸·미확인 칩·원문 N쪽 이름·문서 쪽·표 머리 쪽 모두 나오지 않는다(사용자 결정 11-16)', function () {
  [item(), item({ page: null })].forEach(function (it) {
    const h = plans.itemRowHtml(it, 'MIL_KRW');
    assert.ok(h.indexOf('pl-pg') < 0 && h.indexOf('미확인') < 0 && h.indexOf('원문 ') < 0 && h.indexOf('쪽') < 0);
    assert.strictEqual((h.match(/<td /g) || []).length, 3);   // 번호·사업명·예산
  });
  const t = plans.itemsTableHtml([item()], 'MIL_KRW', '', '제목');
  assert.ok(t.indexOf('pl-pg') < 0 && t.indexOf('>쪽<') < 0 && t.indexOf('colspan="3"') >= 0 && t.indexOf('colspan="4"') < 0);
  assert.strictEqual((t.match(/<th scope="col"/g) || []).length, 3);
  const d = plans.docHtml(doc({ page_range: '3-40' }), '');
  assert.ok(d.indexOf('문서 쪽') < 0 && d.indexOf('3-40') < 0 && d.indexOf('pl-pg') < 0);
});

// ── 사업 행(보충 B·D) ───────────────────────────────────────────────
test('itemRowHtml: 폐기는 실선 외곽 칩 + muted 행, 홈페이지 확인 상태(check_cd)는 어떤 값이어도 화면에 없다, 하위사업은 들여쓰기 표시', function () {
  const d = plans.itemRowHtml(item({ progress_cd: 'DROPPED' }), 'MIL_KRW');
  assert.ok(d.indexOf('class="pl-row pl-dim"') >= 0 && d.indexOf('wf-badge pp-cancel">폐기</span>') >= 0);
  ['UNCONFIRMED', 'PARTIAL', 'NOT_CHECKED', 'CONFIRMED', 'WHATEVER'].forEach(function (cd) {
    const r = plans.itemRowHtml(item({ check_cd: cd }), '');
    assert.ok(r.indexOf('확인안됨') < 0 && r.indexOf('부분확인') < 0 && r.indexOf('미조사') < 0 && r.indexOf('확인됨') < 0, cd);
    assert.ok(r.indexOf('pop-unk') < 0 && r.indexOf('wf-badge') < 0 && r.indexOf('pl-dim') < 0, cd);
  });
  const c = plans.itemRowHtml(item(), 'MIL_KRW');
  assert.ok(c.indexOf('확인됨') < 0 && c.indexOf('opacity') < 0 && c.indexOf('line-through') < 0);
  assert.ok(plans.itemRowHtml(item({ parent_no: '1', item_no: '1-1' }), '').indexOf('pl-child') >= 0);
});

test('itemRowHtml: 이름·내용·비고는 이스케이프하고, 내용은 줄바꿈 보존 클래스(pl-content)로 둔다', function () {
  const h = plans.itemRowHtml(item({ name: '<img src=x onerror=1>', content: '줄1\n<script>x</script>', note: '"q"' }), '');
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('<script') < 0);
  assert.ok(h.indexOf('&lt;img') >= 0 && h.indexOf('&lt;script&gt;') >= 0 && h.indexOf('&quot;q&quot;') >= 0);
  assert.ok(h.indexOf('class="pl-content"') >= 0);
});

test('orderItems·groupByField·filterItems: 하위가 상위 바로 아래, 분야별 묶음, 키워드는 상위·하위를 함께 남긴다', function () {
  const items = [
    item({ item_id: 1, item_no: '1', name: '청년 창업', field_no: '1', field_name: '경제' }),
    item({ item_id: 2, item_no: '2', name: '도서관', field_no: '2', field_name: '문화' }),
    item({ item_id: 3, item_no: '1-1', parent_no: '1', name: '공간 조성', field_no: '1', field_name: '경제' }),
    item({ item_id: 4, item_no: '3', name: '디지털 전환', content: '소상공인 지원', field_no: '1', field_name: '경제' }),
  ];
  assert.deepStrictEqual(plans.orderItems(items).map(function (i) { return i.item_no; }), ['1', '1-1', '2', '3']);
  assert.deepStrictEqual(plans.groupByField(plans.orderItems(items)).map(function (g) { return g.no + ':' + g.items.length; }), ['1:3', '2:1']);
  assert.deepStrictEqual(plans.filterItems(items, '공간').map(function (i) { return i.item_no; }), ['1', '1-1']);   // 하위가 맞으면 상위도
  assert.deepStrictEqual(plans.filterItems(items, '창업').map(function (i) { return i.item_no; }), ['1', '1-1']);   // 상위가 맞으면 하위도
  assert.deepStrictEqual(plans.filterItems(items, '소상공인').map(function (i) { return i.item_no; }), ['3']);      // 내용도 찾는다
  assert.strictEqual(plans.filterItems(items, '  '), items);
  assert.deepStrictEqual(plans.filterItems(items, '없는말'), []);
  assert.deepStrictEqual(plans.orderItems(null), []);
});

test('itemsTableHtml: 머리 단위는 단위가 하나일 때만, 분야 머리줄, 결과 없음 안내', function () {
  const h = plans.itemsTableHtml([item()], 'MIL_KRW', '', '제목');
  assert.ok(h.indexOf('예산(백만원)</th>') >= 0 && h.indexOf('scope="rowgroup"') >= 0 && h.indexOf('1 경제') >= 0);
  assert.ok(plans.itemsTableHtml([item()], null, '', '제목').indexOf('예산</th>') >= 0);
  assert.ok(plans.itemsTableHtml([item()], 'MIL_KRW', '없는말', '제목').indexOf('조건에 맞는 사업이 없습니다') >= 0);
  assert.ok(plans.itemsTableHtml([], 'MIL_KRW', '', '제목').indexOf('사업이 없습니다') >= 0);
});

// ── 문서 카드 ───────────────────────────────────────────────────────
test('docHtml: 종류 칩·안내 줄(기간 지남·오래됨)과 비고 이스케이프, 확인 상태 줄·확인안됨 안내는 없다(check_counts가 와도)', function () {
  const h = plans.docHtml(doc(), '');
  assert.ok(h.indexOf('wf-badge pp-neutral">공약이행</span>') >= 0);
  assert.ok(h.indexOf('확인 상태') < 0 && h.indexOf('부분확인') < 0 && h.indexOf('미조사') < 0 && h.indexOf('원문에서 아직 대조하지 못한') < 0);
  assert.strictEqual(plans.checkCountsHtml, undefined);
  assert.ok(h.indexOf('원문 쪽수로 대조하세요.') < 0);          // URL 있음
  assert.ok(h.indexOf('기간 지남') < 0 && h.indexOf('12개월') < 0);
  const n = plans.docHtml(doc({ src_url: null, url_missing: true, check_counts: { confirmed: 5, partial: 0, unconfirmed: 0, not_checked: 0 },
    period_ended: true, period_to: 2022, stale: true, checked_on: '2024-03-02', note: '<i>메모</i>\n둘째 줄' }), '');
  assert.ok(n.indexOf('원문 쪽수로 대조하세요.') < 0 && n.indexOf('원문 문서') >= 0 && n.indexOf('출처 URL 없음') < 0);
  assert.ok(n.indexOf('wf-badge pp-cancel">기간 지남</span>') >= 0 && n.indexOf('2022년에 끝난 계획입니다. 누리집에 새 계획이 있는지 확인하세요.') >= 0);
  assert.ok(n.indexOf('확인 <span class="v">2024-03-02</span> 뒤로 12개월 넘게 다시 확인하지 않았습니다.') >= 0);
  assert.ok(n.indexOf('<i>') < 0 && n.indexOf('&lt;i&gt;') >= 0 && n.indexOf('class="pl-note"') >= 0);
});

// ── 상세 ────────────────────────────────────────────────────────────
test('detailHtml: 상태별 안내, 자료 없음 빈 상태, 정상 상세(이름 이스케이프·반입일 KST·키워드 칸·배지)', function () {
  const o = { name: '종로구', sub: '지자체 · 서울', kw: '' };
  assert.ok(plans.detailHtml({ status: 'loading' }, o).indexOf('불러오는 중') >= 0);
  assert.ok(plans.detailHtml({ status: 'noid' }, o).indexOf('아직 서버에 등록되지 않아 조회할 수 없습니다') >= 0);
  assert.ok(plans.detailHtml({ status: 'noid' }, o).indexOf('내장') < 0);
  assert.ok(plans.detailHtml({ status: 'denied', code: 403 }, o).indexOf('권한이 없습니다(403)') >= 0);
  assert.ok(plans.detailHtml({ status: 'notfound' }, o).indexOf('찾지 못했습니다') >= 0);
  assert.ok(plans.detailHtml({ status: 'error', code: 500 }, o).indexOf('id="pl-retry-detail"') >= 0);
  const empty = plans.detailHtml(view([], { import: null }), o);
  assert.ok(empty.indexOf('pop-unk">자료 없음</span>') >= 0 && empty.indexOf('아직 수집되지 않았습니다') >= 0 && empty.indexOf('id="pl-kw"') < 0);
  const ok = plans.detailHtml(view([doc(), doc({ doc_id: 8, period_ended: true, stale: true })]), { name: '<b>종로</b>', sub: '', kw: '청"년' });
  assert.ok(ok.indexOf('<b>종로</b>') < 0 && ok.indexOf('&lt;b&gt;종로') >= 0);
  assert.ok(ok.indexOf('id="pl-name" tabindex="-1"') >= 0 && ok.indexOf('id="pl-kw"') >= 0 && ok.indexOf('value="청&quot;년"') >= 0);
  assert.ok(ok.indexOf('수집 파일 반입') >= 0 && ok.indexOf('2026-11-16') >= 0);
  const seed = plans.detailHtml(view([doc()], { import: { imported_at: '2026-11-16T01:02:03+00:00', origin_cd: 'SEED_TXT' } }), o);
  assert.ok(seed.indexOf('서울 25구 원문에서 옮김') >= 0 && seed.indexOf('시드') < 0);
  assert.ok(ok.indexOf('사업계획 <span class="v">2</span>건') >= 0 && ok.indexOf('오래됨') >= 0);   // 문서 중 하나라도 오래되면 오래됨
  assert.ok(ok.indexOf('wf-badge pp-cancel">기간 지남</span> <span class="wf-badge gap">') < 0);   // 모든 문서가 끝나야 머리 배지에 기간 지남
});

// ── 목록 ────────────────────────────────────────────────────────────
function sampleModel() {
  const list = [
    rec('가구', '11', 10, { institutionId: 'ga' }),
    rec('나구', '11', 100, { institutionId: 'na' }),
    rec('다구', '11', 200, { institutionId: 'da' }),
    rec('라구', '11', 20, {}),
    rec('공고구', '11', -5, { institutionId: 'gong', confirmed: true, receiveFrom: plus(-5), receiveTo: plus(10) }),
  ];
  return dash.model(list, TODAY);
}

test('listRows: 공고 진행 중 먼저, 기간 창 안만(6개월), institutionId로 서버 현황을 붙이고 id 없는 행은 현황 없음', function () {
  const m = sampleModel();
  const map = plans.statusMap({ items: [{ institution_id: 'ga', item_count: 2 }, { institution_id: 'zz', item_count: 9 }] });
  const rows = plans.listRows(m, '6', {}, map);
  assert.deepStrictEqual(rows.map(function (r) { return r.it.name; }), ['공고구', '가구', '라구', '나구']);
  assert.deepStrictEqual(rows.map(function (r) { return r.id; }), ['gong', 'ga', '', 'na']);
  assert.strictEqual(rows[1].st.item_count, 2);
  assert.strictEqual(rows[0].st, null);
  assert.strictEqual(rows[2].st, null);
  assert.deepStrictEqual(plans.listRows(m, '12', {}, map).map(function (r) { return r.it.name; }), ['공고구', '가구', '라구', '나구', '다구']);
  assert.deepStrictEqual(plans.listRows(m, '6', { q: '가' }, map).map(function (r) { return r.it.name; }), ['가구']);
  assert.ok(plans.listRows(m, '6', {}, null).every(function (r) { return r.st === null; }));   // 아직 모름
});

test('filterByStatus·missingIds: 자료 있음/없음, 형식 밖·id 없음·중복 제외, 화면 순서, 1,000개 상한', function () {
  const m = sampleModel();
  const rows = plans.listRows(m, '6', {}, plans.statusMap({ items: [{ institution_id: 'ga', item_count: 2 }] }));
  assert.deepStrictEqual(plans.filterByStatus(rows, 'has').map(function (r) { return r.id; }), ['ga']);
  assert.deepStrictEqual(plans.filterByStatus(rows, 'none').map(function (r) { return r.id; }), ['gong', '', 'na']);
  assert.strictEqual(plans.filterByStatus(rows, 'all'), rows);
  assert.deepStrictEqual(plans.missingIds(rows), ['gong', 'na']);
  const many = [];
  for (let i = 0; i < 1200; i += 1) many.push({ id: 'i' + i, st: null });
  many.push({ id: 'bad id!', st: null }, { id: 'i0', st: null });
  const ids = plans.missingIds(many);
  assert.strictEqual(ids.length, 1000);
  assert.strictEqual(ids[0], 'i0');
  assert.strictEqual(ids.indexOf('bad id!'), -1);
});

test('statusBadgesHtml: 자료 없음 하나 / 사업계획 N건 → 기간 지남 → 오래됨 순서(최대 3개)', function () {
  assert.strictEqual(plans.statusBadgesHtml(null), '<span class="pop-unk">자료 없음</span>');
  const one = plans.statusBadgesHtml({ item_count: 2, period_ended: false, stale: false });
  assert.ok(one.indexOf('pp-neutral">사업계획 <span class="v">2</span>건</span>') >= 0 && one.indexOf('기간 지남') < 0 && one.indexOf('오래됨') < 0);   // 숫자는 mono(.v)
  const all = plans.statusBadgesHtml({ item_count: 2, period_ended: true, stale: true });
  assert.ok(idx(all, '사업계획 ') < idx(all, '기간 지남') && idx(all, '기간 지남') < idx(all, '오래됨'));
  assert.ok(all.indexOf('wf-badge pp-cancel">기간 지남') >= 0 && all.indexOf('wf-badge gap">오래됨') >= 0);
  assert.strictEqual((all.match(/class="wf-badge/g) || []).length, 3);
});

test('rowHtml: 날짜·상태 배지(현황을 받은 뒤에만), 공고 진행 중 칩, 이스케이프', function () {
  const m = sampleModel();
  const map = plans.statusMap({ items: [{ institution_id: 'ga', item_count: 2, period_ended: true, stale: true }] });
  const rows = plans.listRows(m, '6', {}, map);
  const ga = plans.rowHtml(rows[1], { id: 'pl-o-1', selected: true, loaded: true });
  assert.ok(ga.indexOf('aria-selected="true"') >= 0 && ga.indexOf('role="option"') >= 0 && ga.indexOf('D-10') >= 0 && ga.indexOf(rows[1].it.date) >= 0);
  assert.ok(idx(ga, '사업계획 ') < idx(ga, '기간 지남') && idx(ga, '기간 지남') < idx(ga, '오래됨'));
  assert.ok(plans.rowHtml(rows[2], { loaded: true }).indexOf('pop-unk">자료 없음') >= 0);
  assert.ok(ga.indexOf('<span class="v">2</span>건') >= 0);
  assert.ok(plans.rowHtml(rows[1], { loaded: false }).indexOf('사업계획') < 0);   // 아직 모르는 동안 '자료 없음'으로 보이지 않게
  assert.ok(plans.rowHtml(rows[0], { loaded: true }).indexOf('db-chip') >= 0);    // 공고 진행 중 칩
  const evil = dash.model([rec('<img onerror=1>', '11', 10, { institutionId: 'x1' })], TODAY);
  const eh = plans.rowHtml(plans.listRows(evil, '6', {}, null)[0], {});
  assert.ok(eh.indexOf('<img') < 0 && eh.indexOf('&lt;img') >= 0);
});

test('winHtml·statHtml: 기본 6개월, 상태 3종, 라디오 이름이 현황판(db-per)과 겹치지 않는다', function () {
  const w = plans.winHtml('6');
  assert.ok(w.indexOf('name="pl-win" value="6" checked') >= 0 && w.indexOf('name="db-per"') < 0);
  assert.strictEqual((w.match(/type="radio"/g) || []).length, 4);
  const s = plans.statHtml('all');
  assert.ok(s.indexOf('name="pl-stat" value="all" checked><span>모두</span>') >= 0 && s.indexOf('자료 있음') >= 0 && s.indexOf('자료 없음') >= 0);
  assert.ok(s.indexOf('전체') < 0 && plans.winHtml('6').indexOf('전체') >= 0);   // 두 묶음에 '전체'가 겹치지 않는다
  assert.strictEqual((s.match(/type="radio"/g) || []).length, 3);
  assert.ok(plans.groupLabelHtml('6', 4, 3).indexOf('자료 없음 <b>3</b>곳') >= 0);
  assert.ok(plans.groupLabelHtml('all', 4, null).indexOf('자료 없음') < 0);
});

// ── 현황판·지도 상세의 '사업계획' 절(훅) ─────────────────────────────
test('sectionInner/paneSection: 현황 상태별 표시 — 불러오는 중, 자료 있음(링크), 자료 없음(링크 없음), 권한·연결 문제는 절 숨김, id 없음·형식 밖', function () {
  plans.resetStatus();
  const r = { name: '종로구', region: '11', institutionId: 'jongno' };
  assert.ok(plans.paneSection(r, {}).indexOf('불러오는 중') >= 0);           // idle (node에서는 요청하지 않는다)
  plans.applyStatus({ today: '2026-11-16', items: [{ institution_id: 'jongno', item_count: 12, period_ended: false, stale: true, oldest_checked_on: '2025-01-05' }] });
  const has = plans.paneSection(r, { nameId: 'dm-name' });
  assert.ok(has.indexOf('class="db-sec pl-slot" data-pl-id="jongno" data-pl-name="dm-name"') >= 0);
  assert.ok(has.indexOf('<button type="button" class="link-btn" data-pl-open="jongno" aria-describedby="dm-name">사업계획 <span class="v">12</span>건 보기</button>') >= 0);
  assert.ok(has.indexOf('오래됨') >= 0 && has.indexOf('2025-01-05') >= 0);
  const none = plans.paneSection({ name: '성북구', region: '11', institutionId: 'seongbuk' }, {});
  assert.ok(none.indexOf('자료 없음') >= 0 && none.indexOf('data-pl-open') < 0);
  const noid = plans.paneSection({ name: '번들구' }, {});
  assert.ok(noid.indexOf('서버에 등록된 기관만') >= 0 && noid.indexOf('data-pl-open') < 0);
  const evil = plans.paneSection({ name: 'x', institutionId: 'a"><b>' }, {});
  assert.ok(evil.indexOf('<b>') < 0 && evil.indexOf('data-pl-open') < 0 && evil.indexOf('data-pl-id=""') >= 0);
  plans.setStatusState('denied', 403);
  assert.strictEqual(plans.paneSection(r, {}), '');
  plans.setStatusState('offline');
  assert.strictEqual(plans.paneSection(r, {}), '');
  plans.resetStatus();
});

test('절의 버튼: 메뉴에서 기관 사업계획 화면을 열 수 없는 사용자에게는 버튼 없이 요약만 보인다', function () {
  plans.resetStatus();
  plans.applyStatus({ items: [{ institution_id: 'jongno', item_count: 12, stale: true, oldest_checked_on: '2025-01-05' }] });
  const r = { name: '종로구', institutionId: 'jongno' };
  try {
    plans.menuCheck = function () { return false; };
    const no = plans.paneSection(r, {});
    assert.ok(no.indexOf('data-pl-open') < 0 && no.indexOf('pl-open') < 0 && no.indexOf('pl-msg') < 0);
    assert.ok(no.indexOf('<span class="v">12</span>건') >= 0 && no.indexOf('오래됨') >= 0 && no.indexOf('2025-01-05') >= 0);   // 요약은 그대로
    plans.menuCheck = function () { return true; };
    assert.ok(plans.paneSection(r, {}).indexOf('data-pl-open="jongno"') >= 0);
    plans.menuCheck = null;
    assert.strictEqual(plans.menuVisible(), true);   // node(사이드바 없음)에서는 열 수 있다고 본다
  } finally {
    plans.menuCheck = null;
    plans.resetStatus();
  }
});

test('footHtml: 목록에 담을 수 있는 수 + CSV 버튼, 머리 숫자와 다를 때만 차이 줄, 숫자는 mono', function () {
  const same = plans.footHtml(30, 30, false);
  assert.ok(same.indexOf('목록에 담을 수 있는 기관 <span class="v">30</span>곳 · <button type="button" class="db-link" id="pl-dl">목록 내려받기(CSV)</button>') >= 0);
  assert.ok(same.indexOf('서버에 등록되지 않은') < 0);
  const diff = plans.footHtml(28, 30, false);
  assert.ok(diff.indexOf('서버에 등록되지 않은 <span class="v">2</span>곳은 목록에 넣을 수 없습니다.') >= 0);
  assert.ok(plans.footHtml(28, 30, true).indexOf('id="pl-dl" disabled') >= 0);
  assert.strictEqual(plans.footHtml(0, 0, false), '');
  const only = plans.footHtml(0, 3, false);   // 담을 수 있는 곳이 없어도 이유는 알린다
  assert.ok(only.indexOf('pl-dl') < 0 && only.indexOf('<span class="v">3</span>곳은 목록에 넣을 수 없습니다.') >= 0);
});

test('소스: listbox aria-activedescendant 동기화, 고정 live 영역, 오프라인 안내는 pl-flash, 시드 용어 없음', function () {
  assert.ok(/function syncActive\(\)[\s\S]*?aria-activedescendant[\s\S]*?removeAttribute\('aria-activedescendant'\)/.test(SRC));
  assert.ok(/function markSelected\(\)[\s\S]*?\n    syncActive\(\);/.test(SRC), 'markSelected 가 끝에서 syncActive 를 부른다');
  assert.ok(/sc\.setAttribute\('aria-busy'[^\n]*\n\s*syncActive\(\);/.test(SRC), 'renderList 가 그린 뒤 syncActive 를 부른다');
  assert.ok(SRC.indexOf('id="pl-g" aria-live="polite"></div><div id="pl-body">') > 0);
  assert.strictEqual(SRC.split('id="pl-g"').length, 2, 'pl-g 는 SKELETON 한 곳에서만 만든다');
  assert.ok(SRC.indexOf("f.textContent = OFFLINE_MSG") > 0 && SRC.indexOf('role="alert"') > 0);
  assert.ok(SRC.indexOf('시드') < 0);
  assert.ok(/statusInflight/.test(SRC) && SRC.indexOf('의도한 부작용') > 0);
});

test('paneHtml: 훅이 있으면 기관장 절 뒤·tail 앞에 사업계획 절, 훅이 없으면 지금과 같다', function () {
  const m = dash.model([rec('종로구', '11', 30, { institutionId: 'jongno' })], TODAY);
  const it = m.upcoming[0];
  const base = dash.paneHtml(it, { act: 'none', headHtml: '<div class="db-sec">HEAD</div>', tailHtml: '<div>TAIL</div>', today: TODAY });
  assert.ok(base.indexOf('pl-slot') < 0);
  plans.applyStatus({ items: [{ institution_id: 'jongno', item_count: 3 }] });
  dash.plansHook = plans.paneSection;
  try {
    const h = dash.paneHtml(it, { act: 'none', headHtml: '<div class="db-sec">HEAD</div>', tailHtml: '<div>TAIL</div>', today: TODAY });
    assert.ok(idx(h, 'HEAD') < idx(h, 'pl-slot') && idx(h, 'pl-slot') < idx(h, 'TAIL'));
    assert.ok(h.indexOf('건 보기') >= 0 && h.indexOf('data-pl-open="jongno"') >= 0);
    assert.ok(dash.paneHtml(it, { act: 'none', plansHtml: '<div>CUSTOM</div>', today: TODAY }).indexOf('CUSTOM') >= 0);   // c.plansHtml이 우선
  } finally {
    dash.plansHook = null;
    plans.resetStatus();
  }
});
