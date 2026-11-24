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

test('index.html·plans.js: 3행 .pl-st·행 패딩 10px·사업계획 절 h3 간격·문서 제목 h4 CSS, mount 가 받는 중 자리표시를 다시 그린다', function () {
  const a = HTML.indexOf('/* 기관 사업계획 시작'), b = HTML.indexOf('/* 기관 사업계획 끝 */');
  const css = HTML.slice(a, b);
  assert.ok(css.indexOf('#plans-root .db-row { padding:10px 20px; }') >= 0);
  assert.ok(/\.pl-st \{[^}]*display:flex[^}]*min-height:20px/.test(css));
  assert.ok(css.indexOf('#plans-root .db-row .pl-st { grid-column') < 0 && css.indexOf('#plans-root .db-row .meta .pl-st { display:contents; }') >= 0, '2줄 행: 상태 칩은 meta 안(design 11-20 P3-5)');
  assert.ok(css.indexOf('.pl-sum h3 { margin:0 0 8px; }') >= 0 && css.indexOf('.pl-imp { margin:8px 0 0; }') >= 0);
  assert.ok(css.indexOf('.pl-doc-h h4 {') >= 0 && css.indexOf('.pl-doc-h h3') < 0);
  assert.ok(/ensureStatus\(true\);\s*\n\s*if \(ST\.state === 'loading'\) renderList\(\);/.test(SRC));
  assert.ok(SRC.indexOf('statusBadgesHtml') < 0, '상태 칩은 stateChipsHtml 한 곳');
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
  assert.ok(ok.indexOf('wf-badge pp-cancel">기간 지남</span> <span class="wf-badge cr-st gap">') < 0);   // 모든 문서가 끝나야 머리 배지에 기간 지남
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

test('stateChipsHtml: 상황표 — 자료 없음/요청됨/수집 중/수집 실패·제외, 자료 있음 + new·기간 지남·오래됨·다시 요청, 칩은 최대 4개', function () {
  const chips = function (h) { return (h.match(/class="wf-badge/g) || []).length; };
  const R = function (c) { return { status_cd: c }; };
  const UNK = '<span class="pop-unk">자료 없음</span>';
  assert.strictEqual(plans.stateChipsHtml(null), UNK);
  assert.strictEqual(plans.stateChipsHtml(null, R('REQUESTED')), '<span class="wf-badge cr-st gap" data-st="REQUESTED">사업계획 요청됨</span>');
  assert.strictEqual(plans.stateChipsHtml(null, R('RUNNING')), '<span class="wf-badge cr-st pp-neutral" data-st="RUNNING">사업계획 수집 중</span>');
  assert.strictEqual(plans.stateChipsHtml(null, R('APPLIED')), UNK);   // 닫힌 상태는 열린 요청이 아니다
  assert.strictEqual(plans.stateChipsHtml(null, null, R('FAILED')), UNK + ' <span class="wf-badge cr-st none" data-st="FAILED">수집 실패</span>');
  assert.strictEqual(plans.stateChipsHtml(null, null, R('EXCLUDED')), UNK + ' <span class="wf-badge pp-cancel" data-st="EXCLUDED">수집 제외</span>');
  assert.strictEqual(plans.stateChipsHtml(null, null, R('CANCELED')), UNK);   // 실패·제외만
  assert.strictEqual(plans.stateChipsHtml(null, R('REQUESTED'), R('FAILED')).indexOf('FAILED'), -1);   // 열린 요청이 있으면 닫힌 상태는 숨는다
  const one = plans.stateChipsHtml({ item_count: 2, period_ended: false, stale: false });
  assert.strictEqual(one, '<span class="wf-badge pp-neutral">사업계획 <span class="v">2</span>건</span>');   // 숫자는 mono(.v)
  const all = plans.stateChipsHtml({ item_count: 2, period_ended: true, stale: true });
  assert.ok(idx(all, '사업계획 ') < idx(all, '기간 지남') && idx(all, '기간 지남') < idx(all, '오래됨'));
  assert.ok(all.indexOf('wf-badge pp-cancel">기간 지남') >= 0 && all.indexOf('wf-badge cr-st gap">오래됨') >= 0);   // 오래됨도 cr-st(P2-2, 대비 6.15:1)
  assert.strictEqual(chips(all), 3);
  const AP = { institution_id: 'a', closed_at: '2026-11-19T01:00:00+09:00' };
  const nw = plans.stateChipsHtml({ item_count: 2, stale: true }, null, null, AP);
  assert.ok(nw.indexOf('<span class="wf-badge cr-st ok" data-st="NEW" title="수집 요청으로 2026-11-19에 들어온 자료입니다(7일간 표시).">') >= 0);
  assert.ok(nw.indexOf('<span aria-hidden="true">new</span><span class="sr-only">새로 들어온 자료</span>') >= 0);
  assert.ok(idx(nw, '사업계획 ') < idx(nw, 'data-st="NEW"') && nw.indexOf('오래됨') < 0);   // new 가 있으면 오래됨은 뺀다
  assert.ok(plans.stateChipsHtml({ item_count: 2 }, null, null, true).indexOf('title="수집 요청으로 들어온 자료입니다(7일간 표시)."') >= 0);
  assert.strictEqual(plans.stateChipsHtml(null, null, null, AP), UNK);   // 자료가 없으면 new 도 없다
  const re = plans.stateChipsHtml({ item_count: 2, stale: true }, R('REQUESTED'));
  assert.ok(re.indexOf('data-st="REQUESTED">요청됨</span>') >= 0 && re.indexOf('오래됨') < 0 && re.indexOf('사업계획 요청됨') < 0);   // 다시 요청 중이면 짧은 글자, 오래됨 뺌
  assert.ok(plans.stateChipsHtml({ item_count: 2 }, R('RUNNING')).indexOf('wf-badge cr-st pp-neutral" data-st="RUNNING">수집 중</span>') >= 0);
  assert.ok(plans.stateChipsHtml({ item_count: 2 }, null, R('FAILED')).indexOf('data-st="FAILED">수집 실패</span>') >= 0);   // 요청 줄이 칩을 뺐으므로 첫 줄이 알린다
  assert.strictEqual(chips(plans.stateChipsHtml({ item_count: 2, period_ended: true, stale: true }, null, R('FAILED'))), 4);
  assert.strictEqual(chips(plans.stateChipsHtml({ item_count: 2, period_ended: true, stale: true }, R('REQUESTED'), null, AP)), 4);
});

// ── 상세: '사업계획' 절 ──
test("detailHtml: '사업계획' 절은 자료 유무와 관계없이 있고(첫 줄 칩 → 설명·반입일 → 요청 줄), 제목 옆 칩은 없고, 문서 제목은 h4", function () {
  const REQ = { institution_id: 'jongno', status_cd: 'REQUESTED', requester_count: 2, requested_by_me: false, first_requested_at: '2026-11-17T01:00:00+09:00' };
  const can = { item: null, can: true, busy: '' };
  const h = plans.detailHtml(view([doc()]), { name: '종로구', sub: '지자체 · 서울', req: can });
  assert.ok(h.indexOf('<h2 id="pl-name" tabindex="-1">종로구</h2></div><p class="db-sub">지자체 · 서울</p>') >= 0);   // 제목 옆 칩 없음
  assert.ok(h.indexOf('<section class="db-sec pl-sum" aria-labelledby="pl-sum-h"><h3 id="pl-sum-h">사업계획</h3><p class="pl-st">') >= 0);
  assert.ok(idx(h, 'class="db-sub"') < idx(h, 'class="db-sec pl-sum"') && idx(h, 'class="pl-st"') < idx(h, 'pl-imp') &&
    idx(h, 'pl-imp') < idx(h, 'class="pl-req"') && idx(h, 'class="pl-req"') < idx(h, 'class="pl-kwrow"'));   // 칩 → 반입일 → 요청 줄(절의 마지막) → 찾기
  assert.strictEqual((h.match(/<h3/g) || []).length, 1);
  assert.ok(h.indexOf('<h4 id="pl-d7">') >= 0 && h.indexOf('<h3 id="pl-d') < 0);   // 문서 제목은 한 단계 내림
  const e = plans.detailHtml(view([], { import: null }), { name: '종로구', req: can });
  assert.ok(e.indexOf('<p class="pl-st"><span class="pop-unk">자료 없음</span></p>') >= 0);
  assert.ok(idx(e, 'class="pl-st"') < idx(e, 'class="db-empty"') && idx(e, 'class="db-empty"') < idx(e, 'class="pl-req"') && idx(e, 'class="pl-req"') < idx(e, '</section>'));
  assert.ok(plans.detailHtml(view([], { import: null }), { name: '종로구' }).indexOf('class="db-sec pl-sum"') >= 0);   // 요청 현황이 없어도 절은 있다
  const q = plans.detailHtml(view([doc({ stale: true })]), { name: '종로구', req: { item: REQ, can: true, busy: '', applied: null } });
  assert.ok(idx(q, 'data-st="REQUESTED">요청됨</span>') >= 0 && idx(q, 'data-st="REQUESTED"') < idx(q, 'class="pl-req"') && q.indexOf('오래됨') < 0);
  assert.strictEqual(q.slice(q.indexOf('class="pl-req"'), q.indexOf('class="pl-kwrow"')).indexOf('wf-badge'), -1);   // 요청 줄에는 칩이 없다(첫 줄에 있다)
  const des = plans.detailHtml(view([doc()]), { name: '종로구', req: { item: null, can: false, busy: '', applied: { closed_at: '2026-11-19T01:00:00+09:00' } } });
  assert.ok(des.indexOf('data-st="NEW"') >= 0 && des.indexOf('pl-req') < 0);   // 디자이너: 칩만, 요청 줄 없음
  assert.ok(plans.detailHtml({ status: 'noid' }, { name: '번들구' }).indexOf('<h3 id="pl-sum-h">사업계획</h3><p class="pl-st"><span class="pop-unk">자료 없음</span></p><p class="db-empty">') >= 0);
});

test('stateChipsHtml: new 가 있으면 그 뒤 재요청의 실패·제외 칩은 내지 않는다, renderList 는 수집 현황을 받는 동안 빈 자리·실패 칩은 요청 가능한 사람만', function () {
  const AP = { closed_at: '2026-11-19T01:00:00+09:00' };
  const h = plans.stateChipsHtml({ item_count: 2 }, null, { status_cd: 'EXCLUDED' }, AP);
  assert.ok(h.indexOf('data-st="NEW"') >= 0 && h.indexOf('EXCLUDED') < 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'plans.js'), 'utf8');
  assert.ok(src.indexOf("const csWait = ok && CS.state === 'loading';") >= 0 && src.indexOf("loaded: ok && !csWait, pending: ST.state === 'loading' || csWait") >= 0);
  assert.ok(src.indexOf('closed: cc.can ? (cc.closed || null) : null') >= 0);
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

test('절 숨김: 메뉴에서 기관 사업계획 화면을 열 수 없는 사용자(예산팀 등)에게는 요약 절 자체가 없다 (11-17)', function () {
  plans.resetStatus();
  plans.applyStatus({ items: [{ institution_id: 'jongno', item_count: 12, stale: true, oldest_checked_on: '2025-01-05' }] });
  const r = { name: '종로구', institutionId: 'jongno' };
  try {
    plans.menuCheck = function () { return false; };
    assert.strictEqual(plans.paneSection(r, {}), '');                                  // 현황이 있어도 숨김
    assert.strictEqual(plans.paneSection({ name: '번들구' }, {}), '');                  // id 없는 기관도 숨김
    assert.strictEqual(plans.sectionInner('jongno', 'db-name'), '');                   // refreshSlots 경로(슬롯 갱신)도 다시 그리지 않는다
    assert.strictEqual(plans.sectionInner('', 'db-name'), '');
    plans.menuCheck = function () { return true; };
    const yes = plans.paneSection(r, {});
    assert.ok(yes.indexOf('<h3>사업계획</h3>') >= 0 && yes.indexOf('data-pl-open="jongno"') >= 0 && yes.indexOf('<span class="v">12</span>건') >= 0);
    plans.menuCheck = null;
    assert.strictEqual(plans.menuVisible(), true);   // node(사이드바 없음)에서는 열 수 있다고 본다
  } finally {
    plans.menuCheck = null;
    plans.resetStatus();
  }
});

test('소스 규칙: 바닥·내려받기 안내는 요청 가능 여부(CS.can)로 갈리고, 수집 현황이 오면 바닥을 다시 그린다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'plans.js'), 'utf8');
  assert.ok(src.indexOf('S.dlBusy, CS.can, bat);') >= 0, 'renderFoot 이 CS.can 과 일괄 요청 조각을 넘긴다');
  const oc = src.slice(src.indexOf('function onCollect()'), src.indexOf('function postEmpty('));
  assert.ok(oc.indexOf('renderFoot();') >= 0 && oc.indexOf("aid === 'pl-dl'") >= 0, 'onCollect 가 바닥을 다시 그리고 CSV 버튼 포커스를 되돌린다');
  assert.ok(src.indexOf("(CS.can ? ' 수집이 필요하면 기관을 골라 [수집 요청]을 누르세요.' : '')") >= 0, '내려받기 안내의 [수집 요청] 문장은 요청 가능할 때만');
});

test('footHtml: 요청 불가 사용자는 2줄이 확인용입니다.만(수집 요청 안내 없음)', function () {
  const h = plans.footHtml(30, 30, false, false);
  assert.ok(h.indexOf('<br>확인용입니다.') >= 0);
  assert.ok(h.indexOf('수집 요청') < 0 && h.indexOf('개발부서') < 0);
  assert.ok(plans.footHtml(30, 30, false).indexOf('수집 요청') < 0);   // can 생략 = 불가
  assert.ok(plans.footHtml(28, 30, false, false).indexOf('서버에 등록되지 않은 <span class="v">2</span>곳') >= 0);   // 셋째 줄 유지
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

test('소스: paneSection 은 메뉴를 못 여는 사용자에게 현황 요청 전에 빈 문자열을 돌려준다 (11-17)', function () {
  assert.ok(/plans\.paneSection = function[\s\S]*?if \(!plans\.menuVisible\(\)\) return '';[\s\S]*?ensureStatus\(false\)/.test(SRC), 'menuVisible 판정이 ensureStatus 보다 앞');
  assert.ok(/plans\.sectionInner = function \(id, nameId\) \{\s*\n[^\n]*\n\s*if \(!plans\.menuVisible\(\)\) return '';/.test(SRC), 'refreshSlots 경로도 sectionInner 에서 막는다');
});

test('onNavPainted: 사이드바를 다시 그린 뒤 절 노출을 다시 판정한다(node 에서는 아무 일 없음), app.paintNav 가 부른다 (11-17 qa P2)', function () {
  assert.strictEqual(typeof plans.onNavPainted, 'function');
  assert.doesNotThrow(function () { plans.onNavPainted(); });
  const APP = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.ok(/app\.paintNav = function[\s\S]*?drawTabs\(\);\s*\n\s*if \(root\.plans && root\.plans\.onNavPainted\) root\.plans\.onNavPainted\(\);/.test(APP));
  assert.ok(/revealKey: ''/.test(SRC), 'freshState 기본값');
  assert.ok(/t\.name === 'pl-stat'\) S\.revealKey = '';/.test(SRC) && /S\.pin = null; S\.revealKey = '';/.test(SRC), '목록 조건을 바꾸면 늦은 스크롤 예약을 버린다');
});

test('소스: 현황판·지도에서 기관을 골라 들어오면(pendingId) 목록을 그린 뒤 선택 행을 스크롤 영역 안으로 맞춘다 (11-17)', function () {
  assert.ok(/function revealRow\(key\)[\s\S]*?scrollIntoView\(\{ block: 'nearest' \}\)/.test(SRC));
  assert.ok(/function select\(key, focusLb\)[\s\S]*?revealRow\(key\);/.test(SRC), 'select 가 헬퍼를 재사용');
  assert.ok(/const hadPending = !!S\.pendingId;[^\n]*\n\s*applyPending\(\);[\s\S]*?renderList\(\);[\s\S]*?if \(hadPending && S\.selRow\) \{ revealRow\(S\.selRow\.key\); S\.revealKey = S\.selRow\.key; \}/.test(SRC), 'mount: applyPending 전에 기억 → renderList 뒤에 스크롤');
  assert.ok(/function onStatus\(\)[\s\S]*?renderList\(\);[\s\S]*?if \(S\.revealKey\) \{ revealRow\(S\.revealKey\); S\.revealKey = ''; \}/.test(SRC), '현황 도착 뒤 한 번 더 맞춘다');
  assert.ok(/S\.selRow = row;[^\n]*S\.revealKey = '';/.test(SRC), '사용자가 고르면 예약을 지운다');
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

// 11-16 사용자 지적: 예산 칸 원문 표기가 nowrap이라 예산 열 전체가 388px로 넓어져 사업명과 금액이 멀어졌다(실측 1280폭 사업명 92px).
// 고정 배치 + 원문 표기만 줄바꿈 계약을 지킨다(선택자 블록 안 속성만 본다).
function cssBlock(sel) {
  const i = HTML.indexOf(sel + ' {');
  assert.ok(i >= 0, sel + ' 규칙이 있어야 한다');
  return HTML.slice(i, HTML.indexOf('}', i));
}
test('사업표: 고정 배치·폭 상한, 예산 열 고정 폭, 원문 표기는 칸 안에서 줄바꿈', () => {
  const tbl = cssBlock('.pl-tbl');
  assert.match(tbl, /table-layout:fixed/);
  assert.match(tbl, /max-width:\d+px/);
  assert.match(cssBlock('.pl-tbl th.pl-bud, .pl-tbl td.pl-bud'), /width:\d+px/);
  const why = cssBlock('.pl-bud .db-why');
  assert.match(why, /white-space:normal/);
  assert.match(why, /overflow-wrap:anywhere/);
});

// 11-16 사용자: 예산 칸에 원문 표기가 보이는 행은 사업명 아래 비고에서 같은 '예산 원문: …' 조각을 뺀다.
test('noteWithoutSrcBudget: 예산 칸에 보인 조각만 빼고 나머지 비고는 남긴다', () => {
  assert.strictEqual(plans.noteWithoutSrcBudget('예산 원문: 268+32 / 기타'), '기타');
  assert.strictEqual(plans.noteWithoutSrcBudget('앞말\n예산 원문: 12+3\n뒷말'), '앞말\n뒷말');
  assert.strictEqual(plans.noteWithoutSrcBudget('예산 원문: 12+3'), '');
  assert.strictEqual(plans.noteWithoutSrcBudget('다른 비고'), '다른 비고');
});
test('itemRowHtml: 원문 표기 행은 비고에 예산 원문을 다시 보이지 않고, 금액 행은 비고 그대로', () => {
  const u = plans.itemRowHtml({ item_no: '4', name: '인지건강', budget: { state_cd: 'UNVERIFIED' }, note: '예산 원문: 268+32 / 기타' }, 'MIL_KRW');
  assert.strictEqual(u.split('268+32').length - 1, 2);   // 예산 칸 보이는 글 1 + 낭독용 1, 비고에는 없음
  assert.ok(u.indexOf('<span class="pl-content">기타</span>') >= 0);
  const a = plans.itemRowHtml({ item_no: '5-1', name: '공공일자리', budget: { state_cd: 'AMOUNT', amount: 23570, unit_cd: 'MIL_KRW' }, note: '예산 원문: 계 23,570 (연도별)' }, 'MIL_KRW');
  assert.ok(a.indexOf('예산 원문: 계 23,570 (연도별)') >= 0);
});

// ── 결과 확인 기관 분리(2026-11-16 사용자 지적: 마감일 미확인 기관이 3·6개월 목록에 보임) ──
function checkModel() {
  const list = [
    rec('접수구', '11', -5, { institutionId: 'rc', confirmed: true, receiveFrom: plus(-5), receiveTo: plus(10) }),   // 접수 중
    rec('마감구', '11', -40, { institutionId: 'aw', confirmed: true, receiveTo: plus(-10) }),                         // 마감 지남 → 결과 확인
    rec('미상31', '11', -31, { institutionId: 'u31', confirmed: true }),                                              // 마감일 기록 없음 31일 → 결과 확인
    rec('미상30', '11', -30, { institutionId: 'u30', confirmed: true }),                                              // 30일 → 유지
    rec('가구', '11', 10, { institutionId: 'ga' }),
  ];
  return dash.model(list, TODAY);
}
function byName(arr, n) { return arr.filter(function (it) { return it.name === n; })[0]; }

test('dash.isNoticeCheck: 결과 확인 판정 정본을 내보낸다', function () {
  const m = checkModel();
  assert.strictEqual(typeof dash.isNoticeCheck, 'function');
  assert.strictEqual(dash.isNoticeCheck(byName(m.notice, '마감구')), true);
  assert.strictEqual(dash.isNoticeCheck(byName(m.notice, '미상31')), true);
  assert.strictEqual(dash.isNoticeCheck(byName(m.notice, '미상30')), false);
  assert.strictEqual(dash.isNoticeCheck(byName(m.notice, '접수구')), false);
});

test('수집 현황 키 객체: __proto__ 도 자기 키로 담고, constructor·toString 같은 ID 는 현황이 없으면 null', function () {
  const d = { can_request: true, items: [{ institution_id: '__proto__', status_cd: 'REQUESTED' }],
    last_closed: [{ institution_id: '__proto__', status_cd: 'FAILED' }], recent_applied: [{ institution_id: '__proto__' }] };
  [plans.collectMap(d), plans.closedMap(d), plans.appliedMap(d)].forEach(function (m) {
    assert.ok(Object.prototype.hasOwnProperty.call(m, '__proto__'));
    assert.strictEqual(Object.getPrototypeOf(m), Object.prototype, '프로토타입이 바뀌지 않는다');
  });
  try {
    plans.applyCollect({ can_request: true, items: [], last_closed: [], recent_applied: [] });
    ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'].forEach(function (id) {
      const c = plans.collectOf(id);
      assert.deepStrictEqual([c.req, c.closed, c.applied], [null, null, null], id);
    });
    plans.applyCollect(d);
    const c = plans.collectOf('__proto__');
    assert.strictEqual(c.req.status_cd, 'REQUESTED');
    assert.strictEqual(c.closed.status_cd, 'FAILED');
    assert.ok(c.applied);
    assert.strictEqual(plans.collectOf('constructor').req, null);
  } finally { plans.resetCollect(); }
});

test('소스: 수집 현황 키 객체는 CS.map·CS.closed 를 직접 읽지 않고 ownGet·ownPut 을 거친다', function () {
  assert.ok(!/CS\.(map|closed|applied)\[[^\]]+\]\s*\|\|/.test(SRC), '|| null 조회가 남아 있지 않다');
  assert.ok(!/CS\.map\[id\]\s*=/.test(SRC));
});

test('소스: renderFoot 이 pl-dl 포커스를 되돌린다(onStatus·내려받기 끝 모두), 내려받는 중은 S.dlFocus 로 끝난 뒤 돌려준다', function () {
  const foot = SRC.slice(SRC.indexOf('function renderFoot()'), SRC.indexOf('const OFFLINE_MSG'));
  assert.ok(/a\.id === 'pl-dl'/.test(foot) && /S\.dlFocus/.test(foot) && /\$\('pl-dl'\)/.test(foot) && /b\.focus\(/.test(foot));
  assert.ok(/!b\.disabled/.test(foot), 'disabled 단추에는 focus 를 시도하지 않는다');
  const dm = SRC.slice(SRC.indexOf('function downloadMissing()'), SRC.indexOf('// ── 수집 요청(기관 사업계획 상세'));
  assert.ok(/S\.dlFocus = !!\(fa && fa\.id === 'pl-dl'\)/.test(dm) && /renderFoot\(\); S\.dlFocus = false;/.test(dm));
  const os = SRC.slice(SRC.indexOf('function onStatus()'), SRC.indexOf('function setFlash('));
  assert.ok(os.indexOf('renderFoot();') >= 0, 'onStatus 는 renderFoot 만 부르면 복원된다');
});

// ── NEXT 103: 모든 기관 목록 · 목표·관심 정렬 · 바닥 일괄 수집 요청(규격 보정) ─────────────
const INST = [
  { name: '다구', region: '11', type: '지자체', institutionId: 'da' },
  { name: '가구', region: '11', type: '지자체', institutionId: 'ga' },
  { name: '나구', region: '26', type: '지자체', institutionId: 'na' },
  { name: '라구', region: '26', type: '지자체' },
  { name: '마구', region: '26', type: '지자체', institutionId: 'ma' },
  { name: '가구', region: '11', type: '지자체', institutionId: 'ga' },   // 중복 — 한 곳으로
];
function tmap() {
  return plans.mergeTargets([
    { year: 2026, data: { items: [{ institution_id: 'na', target_year: 2026 }], watch_items: [{ institution_id: 'da' }] } },
    { year: 2027, data: { items: [{ institution_id: 'na', target_year: 2027 }, { institution_id: 'ga', target_year: 2027 }], watch_items: [{ institution_id: 'da' }] } },
  ]);
}
const SMAP = plans.statusMap({ items: [{ institution_id: 'na', item_count: 2, stale: true }, { institution_id: 'ma', item_count: 1, stale: true }, { institution_id: 'zz', item_count: 9 }] });
function names(rows) { return rows.map(function (r) { return r.name; }); }

test('mergeTargets·targetOf: 두 해 목표는 연도를 합치고, 관심은 두 응답을 기관 ID로 합치며, 목표이면서 관심이면 목표, 관심 기능 없는 서버는 hasWatch=false', function () {
  const tm = tmap();
  assert.strictEqual(tm.hasWatch, true);
  assert.deepStrictEqual(plans.targetOf(tm, 'na'), { kind: 'GOAL', years: [2026, 2027] });
  assert.deepStrictEqual(plans.targetOf(tm, 'ga'), { kind: 'GOAL', years: [2027] });
  assert.deepStrictEqual(plans.targetOf(tm, 'da'), { kind: 'WATCH', years: [] });
  assert.strictEqual(plans.targetOf(tm, 'zz'), null);
  assert.strictEqual(plans.targetOf(null, 'na'), null);
  const both = plans.mergeTargets([{ year: 2026, data: { items: [{ institution_id: 'x1' }], watch_items: [{ institution_id: 'x1' }] } }]);
  assert.strictEqual(plans.targetOf(both, 'x1').kind, 'GOAL');
  assert.deepStrictEqual(plans.targetOf(both, 'x1').years, [2026]);   // target_year 없으면 응답의 year
  const old = plans.mergeTargets([{ year: 2026, data: { items: [{ institution_id: 'x1' }] } }, { year: 2027, data: null }]);
  assert.strictEqual(old.hasWatch, false);
  const evil = plans.mergeTargets([{ year: 2026, data: { items: [{ institution_id: '__proto__' }], watch_items: [] } }]);
  assert.strictEqual(plans.targetOf(evil, '__proto__').kind, 'GOAL');
  assert.strictEqual(plans.targetOf(evil, 'constructor'), null);
});

test('baseRows·orderRows·filterRows: 모든 기관(중복 한 곳), 기본은 자료 있는 곳 먼저 → 이름순, 켬은 올해 목표 → 다음 해 목표 → 관심 → 그 밖, 검색·지역 필터', function () {
  const rows = plans.baseRows(INST, tmap(), SMAP);
  assert.strictEqual(rows.length, 5);
  assert.strictEqual(rows.filter(function (r) { return r.id === 'na'; })[0].st.item_count, 2);
  assert.strictEqual(rows.filter(function (r) { return r.name === '라구'; })[0].st, null);
  assert.ok(plans.baseRows(INST, null, null).every(function (r) { return r.st === null && r.kind === ''; }));   // 아직 모름
  assert.deepStrictEqual(names(plans.orderRows(rows, false, 2026)), ['나구', '마구', '가구', '다구', '라구']);
  assert.deepStrictEqual(names(plans.orderRows(rows, true, 2026)), ['나구', '가구', '다구', '마구', '라구']);   // 2026 목표, 2027 목표, 관심, 그 밖(자료 있는 곳 먼저)
  assert.strictEqual(plans.goalRank({ kind: 'GOAL', years: [2027] }, 2026), 1);
  assert.strictEqual(plans.goalRank({ kind: 'GOAL', years: [2026, 2027] }, 2026), 0);
  assert.strictEqual(plans.goalRank({ kind: 'WATCH', years: [] }, 2026), 2);
  assert.strictEqual(plans.goalRank({ kind: '', years: [] }, 2026), 3);
  const ord = plans.orderRows(rows, false, 2026);
  assert.deepStrictEqual(names(plans.filterRows(ord, { region: '26' })), ['나구', '마구', '라구']);
  assert.deepStrictEqual(names(plans.filterRows(ord, { q: ' 다 ' })), ['다구']);
  assert.strictEqual(plans.filterRows(ord, {}).length, 5);
  assert.deepStrictEqual(plans.filterByStatus(ord, 'has').map(function (r) { return r.id; }), ['na', 'ma']);
  assert.deepStrictEqual(plans.missingIds(ord), ['ga', 'da']);   // 화면 순서, id 없는 라구 제외
});

test('batchPlan: 켬은 목표·관심만, 끔은 보이는 목록 전체, 열린 요청·EXCLUDED·id 없음 제외(FAILED는 포함), 최신 자료 제외, 앞 50곳, 사유별 수·뺀 곳 수', function () {
  const rows = plans.orderRows(plans.baseRows(INST, tmap(), SMAP), true, 2026);   // 나구(목표·오래됨) 가구 다구 마구(오래됨) 라구
  const top = plans.batchPlan(rows, true, null, null);
  assert.deepStrictEqual(top.ids, ['na', 'ga', 'da']);
  assert.deepStrictEqual(top.counts, { none: 2, stale: 1, ended: 0 });
  assert.strictEqual(top.total, 3);
  const all = plans.batchPlan(rows, false, null, null);
  assert.deepStrictEqual(all.ids, ['na', 'ga', 'da', 'ma']);
  assert.deepStrictEqual(all.skipped, { open: 0, excl: 0, noid: 1 });   // 라구: 서버에 등록되지 않음
  const open = plans.batchPlan(rows, false, function (id) { return id === 'ga' ? { status_cd: 'REQUESTED' } : null; }, null);
  assert.strictEqual(open.ids.indexOf('ga'), -1);
  assert.strictEqual(open.skipped.open, 1);
  const excl = plans.batchPlan(rows, false, null, function (id) { return id === 'da' ? { status_cd: 'EXCLUDED' } : (id === 'ga' ? { status_cd: 'FAILED' } : null); });
  assert.strictEqual(excl.ids.indexOf('da'), -1);
  assert.ok(excl.ids.indexOf('ga') >= 0);
  assert.strictEqual(excl.skipped.excl, 1);
  const ended = plans.batchPlan([{ id: 'e1', name: 'e', st: { period_ended: true }, kind: '', years: [] }, { id: 'f1', name: 'f', st: { item_count: 3 }, kind: '', years: [] },
    { id: 'bad id!', name: 'b', st: null, kind: '', years: [] }], false, null, null);
  assert.deepStrictEqual(ended.ids, ['e1']);
  assert.strictEqual(ended.counts.ended, 1);
  const many = [];
  for (let i = 0; i < 60; i += 1) many.push({ id: 'i' + i, name: 'n' + i, st: null, kind: 'GOAL', years: [2026] });
  const big = plans.batchPlan(many, true, null, null);
  assert.strictEqual(big.ids.length, 50);
  assert.strictEqual(big.total, 60);
  assert.strictEqual(big.ids[0], 'i0');
});

test('batHtml: 켬은 [목표·관심 n곳 수집 요청]+사유별 수, 끔은 [n곳 수집 요청], 50 초과는 [앞 50곳]+확인 필요 N곳 중 목록 순서로, 0곳은 #pl-bat-none', function () {
  const rows = plans.baseRows(INST, tmap(), SMAP);
  const p = plans.batchPlan(plans.orderRows(rows, true, 2026), true, null, null);
  const on = plans.batHtml(p, { top: true, hasWatch: true });
  assert.ok(on.indexOf('<button type="button" id="pl-bat">목표·관심 <span class="v">3</span>곳 수집 요청</button>') === 0);
  assert.ok(on.indexOf('<span class="db-why">자료 없음 <span class="v">2</span> · 오래됨 <span class="v">1</span></span>') >= 0);
  assert.ok(plans.batHtml(p, { top: true, hasWatch: false }).indexOf('>목표 <span class="v">3</span>곳 수집 요청') >= 0);
  const off = plans.batHtml(plans.batchPlan(plans.orderRows(rows, false, 2026), false, null, null), { top: false });
  assert.ok(off.indexOf('id="pl-bat"><span class="v">4</span>곳 수집 요청</button>') >= 0 && off.indexOf('db-why') < 0);
  assert.ok(plans.batHtml(p, { top: true, busy: true }).indexOf('id="pl-bat" disabled') >= 0);
  const many = [];
  for (let i = 0; i < 60; i += 1) many.push({ id: 'i' + i, name: 'n' + i, st: null, kind: '', years: [] });
  const big = plans.batHtml(plans.batchPlan(many, false, null, null), { top: false });
  assert.ok(big.indexOf('>앞 <span class="v">50</span>곳 수집 요청</button>') >= 0 && big.indexOf('확인 필요 <span class="v">60</span>곳 중 목록 순서로') >= 0);
  const none = plans.batHtml(plans.batchPlan([], false, null, null), {});
  assert.strictEqual(none, '<span id="pl-bat-none" tabindex="-1">수집 요청할 기관이 없습니다.</span>');
});

test('footHtml: 요청 가능하면 둘째 줄이 일괄 요청 조각, 불가면 확인용입니다., CSV 대상 0곳이어도 일괄 줄은 단독, 차이 줄 유지', function () {
  const bat = '<button type="button" id="pl-bat">3곳</button>';
  const can = plans.footHtml(30, 30, false, true, bat);
  assert.ok(can.indexOf('목록에 담을 기관 <span class="v">30</span>곳 · <button type="button" class="db-link" id="pl-dl">자료 없는 기관 내려받기(CSV)</button><br>' + bat) >= 0);
  assert.ok(can.indexOf('확인용입니다.') < 0 && can.indexOf('서버에 등록되지 않은') < 0);
  assert.ok(plans.footHtml(30, 30, false, false, bat).indexOf('<br>확인용입니다.') >= 0 && plans.footHtml(30, 30, false, false, bat).indexOf('pl-bat') < 0);
  assert.ok(plans.footHtml(30, 30, false, true).indexOf('확인용입니다.') < 0);   // bat 없으면 둘째 줄 없음
  assert.strictEqual(plans.footHtml(0, 0, false, true, bat), bat);
  assert.strictEqual(plans.footHtml(0, 0, false, false, bat), '');
  assert.ok(plans.footHtml(28, 30, true, true, bat).indexOf('id="pl-dl" disabled') >= 0);
  assert.ok(plans.footHtml(28, 30, false, true, bat).indexOf('서버에 등록되지 않은 <span class="v">2</span>곳은 목록에 넣을 수 없습니다.') >= 0);
});

test('batchDialogHtml: alertdialog·aria-modal·제목(tabindex=-1) 연결, [기관|구분|이유] 표, 기관명 이스케이프, 뺀 곳 줄(0이면 생략), 50 초과 경고, 발 버튼', function () {
  const rows = plans.baseRows([{ name: '<img onerror=1>', region: '11', type: '지자체', institutionId: 'e1' }, { name: '나구', region: '26', type: '지자체', institutionId: 'na' }],
    plans.mergeTargets([{ year: 2026, data: { items: [{ institution_id: 'na' }] } }]), plans.statusMap({ items: [{ institution_id: 'na', item_count: 1, stale: true }] }));
  const p = plans.batchPlan(rows, false, null, null);
  const h = plans.batchDialogHtml(p);
  assert.ok(h.indexOf('<div id="pl-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="pl-dlg-t" aria-describedby="pl-dlg-p">') === 0);
  assert.ok(h.indexOf('pl-dlg-back') < 0 && h.indexOf('tabindex="-1">사업계획 2곳') > 0);
  assert.ok(h.indexOf('<h2 class="dlg-t" id="pl-dlg-t" tabindex="-1">사업계획 2곳 수집 요청</h2>') >= 0);
  assert.ok(h.indexOf('<th scope="col">기관</th><th scope="col">구분</th><th scope="col">이유</th>') >= 0);
  assert.ok(h.indexOf('<td><span class="v">2026</span> 목표</td>') >= 0 && h.indexOf('<td>그 밖의 기관</td>') >= 0);
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('&lt;img') >= 0);
  assert.ok(h.indexOf('pop-unk">자료 없음') >= 0 && h.indexOf('cr-st gap">오래됨') >= 0);
  assert.ok(h.indexOf('<button type="button" id="pl-dlg-cancel">취소</button><button type="button" id="pl-dlg-ok" class="dlg-go">2곳 요청</button>') >= 0, '[취소][n곳 요청] 순서');
  assert.ok(h.indexOf('pl-dlg-skip') < 0 && h.indexOf('pl-warn') < 0 && h.indexOf('id="pl-dlg-err" role="alert"') >= 0);
  assert.ok(h.indexOf('<p class="dlg-err" id="pl-dlg-err" role="alert"></p></div>') > h.indexOf('<div class="dlg-note">') && h.indexOf('<div class="dlg-note">') > h.indexOf('</header>') && h.indexOf('class="dlg-note"') < h.indexOf('class="dlg-body"'), '오류 줄은 머리 아래 .dlg-note');
  assert.ok(h.indexOf('id="pl-dlg-p"') > 0 && h.indexOf('id="pl-dlg-d"') > 0);
  const sk = plans.batchDialogHtml(Object.assign({}, p, { skipped: { open: 2, excl: 1, noid: 4 } }));
  assert.ok(sk.indexOf('뺀 곳: 이미 요청 중 <span class="v">2</span>곳 · 수집 제외 <span class="v">1</span>곳 · 서버에 등록되지 않은 <span class="v">4</span>곳') >= 0);
  assert.ok(plans.batchDialogHtml(Object.assign({}, p, { total: 60 })).indexOf('class="pl-warn"') >= 0);
});

test('batchResult·batchErrorText: 전부 신규 / 섞임 / 못 한 곳(3곳 이하 기관명·그 밖 사유별 수) / note_sent===false 만 알림 문구 / 전부 실패는 fail', function () {
  const all = plans.batchResult({ requested_count: 12, joined_count: 0, already_count: 0, not_found_count: 0, error_count: 0, note_sent: true });
  assert.deepStrictEqual(all, { fail: false, text: '12곳 수집을 요청했습니다. 개발부서가 처리하면 쪽지로 알려 드립니다.' });
  const mix = plans.batchResult({ requested_count: 9, joined_count: 2, already_count: 1, not_found_count: 0, error_count: 0, note_sent: true });
  assert.strictEqual(mix.text, '12곳 요청을 보냈습니다: 새 요청 9곳 · 다른 사람 요청에 함께 올림 2곳 · 이미 내가 요청한 곳 1곳.');
  const part = plans.batchResult({ requested_count: 9, joined_count: 0, already_count: 1, not_found_count: 1, error_count: 1, note_sent: true,
    results: [{ institution_id: 'a1', result_cd: 'not_found' }, { institution_id: 'b1', result_cd: 'error', code: 'CONCURRENT' }] }, function (id) { return id === 'a1' ? '가구' : '나구'; });
  assert.ok(part.text.indexOf(' 못 한 곳 2곳(가구: 서버에서 찾지 못함 · 나구: 동시에 처리됨). 못 한 곳은 목록에 그대로 남으니 잠시 뒤 다시 누르세요.') > 0);
  const many = plans.batchResult({ requested_count: 1, not_found_count: 2, error_count: 2, note_sent: true,
    results: [{ result_cd: 'not_found' }, { result_cd: 'not_found' }, { result_cd: 'error', code: 'CONCURRENT' }, { result_cd: 'error', code: 'SERVER_ERROR' }] });
  assert.ok(many.text.indexOf('못 한 곳 4곳(서버에서 찾지 못함 2 · 동시에 처리됨 1 · 처리 오류 1)') > 0);
  assert.strictEqual(plans.batchResult({ requested_count: 1, note_sent: true }).text.indexOf('알림이 가지 않았습니다'), -1);
  assert.strictEqual(plans.batchResult({ requested_count: 1 }).text.indexOf('알림이 가지 않았습니다'), -1);   // note_sent 가 false 일 때만
  assert.ok(plans.batchResult({ requested_count: 1, note_sent: false }).text.indexOf('개발부서 알림이 가지 않았습니다(요청은 접수됨). 개발부서에 따로 알려 주세요.') > 0);
  assert.strictEqual(plans.batchResult({ requested_count: 0, joined_count: 0, already_count: 0, not_found_count: 5, error_count: 7, note_sent: false }).fail, true);
  assert.strictEqual(plans.batchResult({ not_found_count: 5, error_count: 7 }).text, '12곳 모두 요청하지 못했습니다. 잠시 뒤 다시 누르세요.');
  assert.ok(plans.batchErrorText(400, 'BAD_IDS').indexOf('요청 목록이 올바르지 않아 보내지 못했습니다. 화면을 다시 연 뒤 다시 누르세요.') === 0);
  assert.ok(plans.batchErrorText(403, '').indexOf('영업부서·개발부서만') >= 0 && plans.batchErrorText(0, '').indexOf('연결 실패') >= 0);
});

test('rowHtml(2줄): 이름+실선 .pl-tag(연도 앞), .meta 안에 지역·종류+.pl-st, 두 해 목표는 이른 연도+title, 관심은 점선 아님, pin, 받는 중 자리, 버튼 없음, 이스케이프', function () {
  const rows = plans.baseRows(INST, tmap(), SMAP);
  const by = function (id) { return rows.filter(function (r) { return r.id === id; })[0]; };
  const na = plans.rowHtml(by('na'), { id: 'pl-o-1', selected: true, loaded: true });
  assert.ok(na.indexOf('aria-selected="true"') >= 0 && na.indexOf('role="option"') >= 0 && na.indexOf('<span class="nm">나구</span>') >= 0);
  assert.ok(na.indexOf('<span class="pl-tag" data-kind="GOAL" title="목표 연도 2026·2027(가장 이른 해를 표시)">2026 목표</span>') >= 0);
  assert.ok(na.indexOf('<span class="meta"><span class="pl-reg">26') >= 0 && na.split('<span class="pl-st">').length === 2);
  assert.ok(na.indexOf('사업계획 <span class="v">2</span>건') >= 0 && na.indexOf('오래됨') >= 0);
  assert.ok(na.indexOf('<button') < 0 && na.endsWith('</span></span></li>'));
  assert.ok(na.indexOf('data-pin') < 0 && na.indexOf('직접 연 기관') < 0);
  const ga = plans.rowHtml(by('ga'), { loaded: true });
  assert.ok(ga.indexOf('>2027 목표</span>') >= 0 && ga.indexOf('title=') < 0 && ga.indexOf('pop-unk">자료 없음') >= 0);
  const da = plans.rowHtml(by('da'), { loaded: true });
  assert.ok(da.indexOf('<span class="pl-tag" data-kind="WATCH">나의 관심</span>') >= 0 && da.indexOf('pop-unk pl-') < 0 && da.indexOf('data-kind="GOAL"') < 0);   // 관심 칩은 점선이 아니다
  assert.ok(plans.rowHtml(rows.filter(function (r) { return r.name === '라구'; })[0], { loaded: true }).indexOf('pl-tag') < 0);
  assert.ok(plans.rowHtml(by('na'), { loaded: false }).indexOf('사업계획') < 0);   // 아직 모르는 동안 '자료 없음'으로 보이지 않게
  assert.ok(plans.rowHtml(by('na'), { loaded: false, pending: true }).indexOf('<span class="pl-wait" aria-hidden="true"></span>') >= 0);
  const pin = plans.rowHtml(by('ga'), { loaded: true, pinned: true });
  assert.ok(pin.indexOf(' data-pin="1"') > 0 && pin.indexOf(' · 직접 연 기관') > 0);
  assert.ok(plans.rowHtml(by('ga'), { loaded: true, req: { status_cd: 'REQUESTED' } }).indexOf('data-st="REQUESTED">사업계획 요청됨</span>') >= 0);
  const evil = plans.rowHtml(plans.baseRows([{ name: '<img onerror=1>', region: '11', type: '지자체', institutionId: 'x1' }], null, null)[0], {});
  assert.ok(evil.indexOf('<img') < 0 && evil.indexOf('&lt;img') >= 0);
});

test('groupHeadHtml: 위 묶음 머리(목표 n · 관심 n), 0곳 안내 두 가지, 그 밖의 기관, 관심 없는 서버는 괄호 없음, li role=presentation', function () {
  const top = plans.groupHeadHtml('top', { id: 'pl-gh-top', goal: 8, watch: 4, total: 12, marks: 12, hasWatch: true });
  assert.ok(top.indexOf('<li role="presentation" class="pl-gh" id="pl-gh-top"><b>목표·관심</b> <span class="v">12</span>곳 (목표 <span class="v">8</span> · 관심 <span class="v">4</span>)</li>') === 0);
  assert.ok(plans.groupHeadHtml('top', { id: 'x', goal: 8, watch: 0, total: 8, marks: 8, hasWatch: false }).indexOf('<b>목표</b> <span class="v">8</span>곳</li>') >= 0);
  assert.ok(plans.groupHeadHtml('top', { id: 'x', total: 0, marks: 0, hasWatch: true }).indexOf('목표·관심 기관이 없습니다. 입찰 현황판에서 목표·관심 기관으로 넣을 수 있습니다.') >= 0);
  assert.ok(plans.groupHeadHtml('top', { id: 'x', total: 0, marks: 5, hasWatch: true }).indexOf('조건에 맞는 목표·관심 기관이 없습니다.') >= 0);
  assert.ok(plans.groupHeadHtml('rest', { id: 'pl-gh-rest', total: 300 }).indexOf('<b>그 밖의 기관</b> <span class="v">300</span>곳') >= 0);
});

test('groupLabelHtml·sortBtnHtml·statHtml: 요약줄 다섯 경우, 정렬 토글 글자 고정·aria-pressed·aria-disabled·체크 SVG, 상태 묶음 3종', function () {
  const base = { ready: true, loading: false, stat: 'all', total: 312, shown: 312, has: 9, top: false, marks: 12, hasWatch: true };
  assert.strictEqual(plans.groupLabelHtml(base), '기관 <b>312</b>곳 · 자료 있음 <b>9</b>곳 · 자료 있는 곳 먼저');
  assert.strictEqual(plans.groupLabelHtml(Object.assign({}, base, { top: true })), '기관 <b>312</b>곳 · 목표·관심 <b>12</b>곳을 위로');
  assert.ok(plans.groupLabelHtml(Object.assign({}, base, { top: true, hasWatch: false })).indexOf('목표 <b>12</b>곳을 위로') >= 0);
  assert.strictEqual(plans.groupLabelHtml(Object.assign({}, base, { stat: 'none', shown: 303 })), '자료 없음 <b>303</b>곳 (전체 <b>312</b>곳)');
  assert.strictEqual(plans.groupLabelHtml(Object.assign({}, base, { stat: 'has', shown: 9 })), '자료 있음 <b>9</b>곳 (전체 <b>312</b>곳)');
  assert.strictEqual(plans.groupLabelHtml(Object.assign({}, base, { ready: false, loading: true })), '기관 <b>312</b>곳 · 사업계획 현황을 받는 중');
  assert.strictEqual(plans.groupLabelHtml(Object.assign({}, base, { ready: false })), '기관 <b>312</b>곳');
  const on = plans.sortBtnHtml({ on: true, ok: true, hasWatch: true });
  assert.ok(on.indexOf('id="pl-sort" class="pl-sort" aria-pressed="true"') >= 0 && on.indexOf('<svg') > 0 && on.indexOf('<span>목표·관심 먼저</span>') >= 0 && on.indexOf('aria-disabled') < 0);
  const off = plans.sortBtnHtml({ on: false, ok: true, hasWatch: true });
  assert.ok(off.indexOf('aria-pressed="false"') >= 0 && off.indexOf('<span>목표·관심 먼저</span>') >= 0);   // 눌림과 무관하게 글자 고정
  const dis = plans.sortBtnHtml({ on: true, ok: false, why: '받지 못함', hasWatch: false });
  assert.ok(dis.indexOf('aria-pressed="false"') >= 0 && dis.indexOf('aria-disabled="true"') >= 0 && dis.indexOf('title="받지 못함"') >= 0 && dis.indexOf('<span>목표 먼저</span>') >= 0);
  const s = plans.statHtml('all');
  assert.strictEqual((s.match(/type="radio"/g) || []).length, 3);
  assert.ok(s.indexOf('name="pl-stat" value="all" checked><span>모두</span>') >= 0);
});

test('docHtml: 오래됨 안내의 개월 수는 서버 stale_months, 못 받으면 12', function () {
  const stale = doc({ stale: true, checked_on: '2024-03-02' });
  assert.ok(plans.docHtml(stale, '', 6).indexOf('뒤로 6개월 넘게 다시 확인하지 않았습니다.') >= 0);
  assert.ok(plans.docHtml(stale, '').indexOf('뒤로 12개월 넘게') >= 0);
  assert.ok(plans.docHtml(stale, '', 0).indexOf('뒤로 12개월 넘게') >= 0);
  assert.ok(plans.detailHtml(view([stale]), { name: '종로구', staleMonths: 18 }).indexOf('뒤로 18개월 넘게') >= 0);
  assert.ok(SRC.indexOf('12개월') < 0, '개월 수 하드코딩 없음');
  assert.ok(SRC.indexOf('stale_months') > 0);
});

test('소스(103): 입찰 임박 장치 제거, 소개 문구, 목표·관심 두 해 조회, 바닥 일괄 요청·pin·포커스 복귀, 확인 창 접근성(alertdialog·inert·Esc·Tab·제목 포커스), 검색 디바운스', function () {
  ['입찰 임박', 'pl-win', 'windowItems', 'M.notice', 'isNoticeCheck', 'checkNoteHtml', 'noticeMenu', 'winHtml', 'D-day', 'pl-batch', 'pl-top'].forEach(function (s) {
    assert.ok(SRC.indexOf(s) < 0, s + ' 는 plans.js 에 없어야 한다');
  });
  assert.ok(SRC.indexOf('pop-unk pl-') < 0 && SRC.indexOf('class="pl-tag"') > 0, '관심 칩은 실선 .pl-tag');
  assert.ok(SRC.indexOf('목표로 하는 기관과 관심 있는 기관부터, 기관 홈페이지에서 공개된 사업계획을 봅니다') > 0);
  assert.ok(SRC.indexOf("fetchJson('/bid-targets?year=' + y)") > 0 && SRC.indexOf("fetchJson('/bid-targets?year=' + (y + 1))") > 0);
  assert.ok(SRC.indexOf("postJson('/plan-collect/batch', { institution_ids: d.plan.ids })") > 0);
  assert.ok(/function renderFoot\(\)[\s\S]*?plans\.batHtml\(plans\.batchPlan\(vr\.rows, topOn\(\), reqOfId, closedOfId\)/.test(SRC), '일괄 요청은 바닥 renderFoot 에서');
  assert.ok(SRC.indexOf("['pl-bat', 'pl-bat-none', 'pl-lb', 'pl-q']") > 0, '닫으면 #pl-bat → #pl-bat-none → 목록 → 검색칸 순으로 포커스');
  assert.ok(SRC.indexOf('role="alertdialog" aria-modal="true"') > 0);
  assert.ok(/root\.dlg\.open\(ov, \{ onClose:/.test(SRC) && SRC.indexOf('root.dlg.close(d.overlay)') > 0 && SRC.indexOf('root.dlg.requestClose(d.overlay)') > 0, '열기·닫기는 공통 dlg 로');
  ['setAttribute(\'inert\'', 'removeAttribute(\'inert\')', 'function dlgKey', 'dlgKey(e)', 'pl-dlg-back', 'closeBatchDialog', "e.key === 'Escape'", "e.key !== 'Tab'"].forEach(function (s) {
    assert.ok(SRC.indexOf(s) < 0, s + ' 는 plans.js 에 없어야 한다(자체 inert·키 처리 삭제)');
  });
  assert.ok(/document\.body\.appendChild\(ov\);[^\n]*\r?\n\s*root\.dlg\.open\(ov/.test(SRC), '덮개는 body 직계로 붙인 뒤 연다');
  assert.ok(/plans\.unmount = function \(\) \{[\s\S]*?d\.detach = true[\s\S]*?root\.dlg\.close\(d\.overlay\)/.test(SRC), 'unmount 때 열린 창을 닫는다');
  assert.ok(/function openBatchDialog\(\)[\s\S]*?S\.batchBusy/.test(SRC) && /function submitBatch\(\)[\s\S]*?state\.batchBusy = true/.test(SRC), '보내는 중엔 다시 열 수 없다');
  assert.ok(/if \(d\.gone\) \{ S\.err = msg; setFlash\(''\); renderBanner\(\); \}/.test(SRC), '보내는 중 창을 닫아도 결과를 띠로 알린다');
  assert.ok(SRC.indexOf('const msg = plans.batchErrorText(r.status, r.code, r.timeout)') > 0 && SRC.indexOf('err.textContent = d.err') > 0, '오류 문구는 고정 문구를 textContent 로');
  assert.ok(SRC.indexOf('S.err = rr.text') > 0 && SRC.indexOf('setFlash(rr.text)') > 0, '전부 실패는 #pl-err, 그 밖은 #pl-flash');
  assert.ok(SRC.indexOf('setTimeout(function () { qTimer = 0;') > 0 && SRC.indexOf('}, 120)') > 0, '검색 입력 디바운스');
  assert.ok(SRC.indexOf('S.selRow = row; S.pin = row.key;') > 0 && SRC.indexOf('Object.assign({}, hit, { pinned: true })') > 0, 'pin 은 맨 위에 붙는다');
  const rl = SRC.slice(SRC.indexOf('function renderList()'), SRC.indexOf('renderSort();', SRC.indexOf('function renderList()')));
  assert.ok(rl.indexOf('role="listbox" id="pl-lb"') > 0 && rl.indexOf('<ul role="group" aria-labelledby="pl-gh-top">') > 0 && rl.indexOf('<ul role="group" aria-labelledby="pl-gh-rest">') > 0 && rl.indexOf("'<div role=\"listbox\" id=\"pl-lb\" tabindex=\"0\" aria-labelledby=\"pl-g\">' + inner") > 0, 'listbox 가 위·그 밖 묶음(group, 머리로 이름)을 감싼다');
  assert.ok(rl.indexOf('<ul role="group" aria-labelledby="pl-g">') < 0 && rl.indexOf('<ul class="pl-flat" role="presentation">') > 0, '정렬을 끄면 이름 없는 group 을 만들지 않는다(P3-5)');
  assert.ok(/ensureTargets\(true\);/.test(SRC) && /plans\.resetTargets\(\)/.test(SRC), '계정이 바뀌면 목표 캐시도 버린다');
});

test('index.html(103 보정): 정렬 토글·묶음 머리·실선 태그·바닥 일괄·확인 창 CSS, pin 규칙 유지, 확인 창 표 높이 240px, 점선 칩 없음', function () {
  const a = HTML.indexOf('/* 기관 사업계획 시작'), b = HTML.indexOf('/* 기관 사업계획 끝 */');
  const css = HTML.slice(a, b);
  assert.ok(css.indexOf('.pl-sort[aria-pressed="true"]') >= 0 && css.indexOf('.pl-sort[aria-disabled="true"]') >= 0 && css.indexOf('.pl-sort:focus-visible') >= 0);
  assert.ok(css.indexOf('color-mix(in srgb, var(--accent-color) 16%, var(--panel))') >= 0);
  assert.ok(/\.pl-tag \{[^}]*border:1px solid var\(--line-strong\)/.test(css) && !/\.pl-tag \{[^}]*dashed/.test(css));
  assert.ok(/\.pl-gh \{[^}]*position:sticky/.test(css) && css.indexOf('#plans-root .db-row .meta .pl-st { display:contents; }') >= 0);
  assert.ok(css.indexOf('#plans-root .dlg') < 0 && css.indexOf('.pl-dlg-back') < 0, '확인 창 덮어쓰기 삭제 — 공통 .dlg·.modal-overlay 를 쓴다');
  assert.ok(css.indexOf('#pl-dlg .v { font-family:var(--mono); }') >= 0 && css.indexOf('#plans-root .pl-flat {') >= 0 && css.indexOf('#pl-foot #pl-bat[aria-disabled="true"]') >= 0);
  assert.ok(/\.pl-dlg-scroll \{[^}]*max-height:240px/.test(css));
  assert.ok(css.indexOf('data-pin="1"') < 0 && css.indexOf('#plans-root .pl-pinned + ul > .db-row:first-child { border-top:1px dashed var(--line-strong); }') >= 0, '직접 연 기관 경계는 묶음(ul) 기준(design P2-2)');
  assert.ok(css.indexOf('#plans-root [role=group] > .db-row { scroll-margin-top:30px; }') >= 0 && css.indexOf('#plans-root .pl-gh + .db-row { border-top:0; }') >= 0, 'sticky 머리가 행을 가리지 않게(P2-1)');
  assert.ok(css.indexOf('#pl-foot #pl-bat-none:focus { outline:none; }') < 0 && css.indexOf('#pl-foot #pl-bat-none:focus-visible { outline:2px solid var(--accent-color)') >= 0, 'P3-3');
  assert.ok(css.indexOf('pl-batch') < 0 && css.indexOf('.pl-top') < 0 && css.indexOf('.pl-chk') < 0);
});

test('batHtml(wait): 목표·관심 목록을 받는 중엔 aria-disabled + 이유 줄, busy 는 disabled, 0곳은 그대로', function () {
  const rows = [{ id: 'i1', name: 'n1', st: null, kind: '', years: [] }];
  const p = plans.batchPlan(rows, false, null, null);
  const w = plans.batHtml(p, { top: false, wait: true });
  assert.ok(w.indexOf('<button type="button" id="pl-bat" aria-disabled="true" aria-describedby="pl-bat-why"><span class="v">1</span>곳 수집 요청</button>') === 0);
  assert.ok(w.indexOf('<span class="db-why" id="pl-bat-why">목표·관심 기관 목록을 받는 중입니다.</span>') > 0 && w.indexOf(' disabled') < 0);
  assert.ok(plans.batHtml(p, { top: false, wait: false }).indexOf('aria-disabled') < 0);
  assert.ok(plans.batHtml(p, { busy: true, wait: true }).indexOf('id="pl-bat" disabled aria-disabled="true"') >= 0);
  assert.strictEqual(plans.batHtml(plans.batchPlan([], false, null, null), { wait: true }), '<span id="pl-bat-none" tabindex="-1">수집 요청할 기관이 없습니다.</span>');
});

test('batchErrorText(timeout): 시간 초과 문구는 상태 번호와 무관, 그 밖은 기존 문구', function () {
  const t = '응답이 늦어 결과를 확인하지 못했습니다. 요청은 접수됐을 수 있으니 창을 닫고 바닥 숫자가 줄었는지 확인하세요.';
  assert.strictEqual(plans.TIMEOUT_TEXT, t);
  assert.strictEqual(plans.batchErrorText(0, '', true), t);
  assert.strictEqual(plans.batchErrorText(500, 'X', true), t);
  assert.ok(plans.batchErrorText(0, '', false).indexOf('연결 실패') >= 0);
  assert.ok(plans.batchErrorText(400, 'BAD_IDS').indexOf('요청 목록이 올바르지 않아') === 0);
});

test('postJson: 시간 제한 안에 응답이 없으면 {timeout:true}, 본문 읽는 중 지연도 같음, 제때 오면 그대로', async function () {
  const savedFetch = global.fetch, savedMs = plans.POST_TIMEOUT_MS;
  try {
    plans.POST_TIMEOUT_MS = 20;
    global.fetch = function (u, o) { return new Promise(function (res, rej) { o.signal.addEventListener('abort', function () { rej(new Error('abort')); }); }); };
    assert.deepStrictEqual(await plans.postJson('/x', {}), { ok: false, status: 0, timeout: true });
    global.fetch = function (u, o) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return new Promise(function (res, rej) { o.signal.addEventListener('abort', function () { rej(new Error('abort')); }); }); } });
    };
    assert.deepStrictEqual(await plans.postJson('/x', {}), { ok: false, status: 0, timeout: true });
    global.fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ requested_count: 1 }); } }); };
    const ok = await plans.postJson('/x', {});
    assert.strictEqual(ok.ok, true); assert.strictEqual(ok.timeout, undefined); assert.deepStrictEqual(ok.data, { requested_count: 1 });
    global.fetch = function () { return Promise.reject(new Error('net')); };
    assert.deepStrictEqual(await plans.postJson('/x', {}), { ok: false, status: 0 });
  } finally { global.fetch = savedFetch; plans.POST_TIMEOUT_MS = savedMs; }
});

test('소스(103 qa 반영): mount 는 applyPending 뒤에 칸을 채우고, 다시 받기는 정렬 토글로 포커스, 목록을 받는 중엔 일괄 버튼 무시', function () {
  const m = SRC.slice(SRC.indexOf('plans.mount = function'), SRC.indexOf('plans.unmount = function'));
  assert.ok(m.indexOf('applyPending();') > 0 && m.indexOf('applyPending();') < m.indexOf('fillControls();'), 'P3-2');
  assert.strictEqual(m.split('fillControls();').length, 2, 'mount 에서 칸 채우기는 한 번');
  assert.ok(/case 'pl-retry-tg':[^\n]*renderSort\(\);[^\n]*\$\('pl-sort'\)[^\n]*focus/.test(SRC), 'P3-3');
  assert.ok(/case 'pl-bat':\s*\r?\n\s*if \(btn\.getAttribute\('aria-disabled'\) === 'true'\) break;/.test(SRC), 'P3-4 눌러도 무시');
  assert.ok(/busy: !!\(S\.dlg \|\| S\.batchBusy\), wait: tgWait\(\)/.test(SRC) && /function tgWait\(\) \{ return TG\.state === 'idle' \|\| TG\.state === 'loading'; \}/.test(SRC));
  assert.ok(/function openBatchDialog\(\)[\s\S]*?tgWait\(\)/.test(SRC), '받는 중엔 창도 열지 않는다');
});

test('design 11-20 커밋 전 대조: 보내는 중에도 [취소]로 닫고, 안내 줄은 보내는 중에만, pin 묶음 class, 요약줄·묶음 머리 같은 기준', function () {
  const h = plans.batchDialogHtml(plans.batchPlan([{ id: 'i1', name: 'n1', st: null, kind: '', years: [] }], false, null, null));
  assert.ok(h.indexOf('<p class="dlg-hint" id="pl-dlg-busy" hidden>창을 닫아도 요청은 계속 보내지고 결과는 화면 위 띠에 나옵니다.</p>') > 0 && h.indexOf('id="pl-dlg-busy"') < h.indexOf('id="pl-dlg-err"'));
  assert.ok(SRC.indexOf("if (b.id === 'pl-dlg-cancel') root.dlg.requestClose(d.overlay);") > 0, '보내는 중에도 [취소]는 requestClose(Esc·바깥 클릭과 같은 동작)');
  assert.ok(SRC.indexOf('cancel.disabled = d.busy') < 0 && SRC.indexOf('hint.hidden = !d.busy') > 0);
  assert.ok(SRC.indexOf('<ul class="pl-pinned" role="group" aria-label="직접 연 기관">') > 0);
  assert.ok(SRC.indexOf('marks: markRows.length') > 0 && SRC.indexOf('total: markRows.length') > 0, '요약줄·묶음 머리가 같은 수를 센다(P3-2)');
});

test('목표·관심 칩: 같은 폭(min-width 72px·가운데), 관심 칩 글자는 나의 관심(사용자 11-20)', function () {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/.pl-tag {[^}]*min-width:72px[^}]*text-align:center/.test(css), '두 칩 같은 폭');
  assert.ok(SRC.indexOf("data-kind=\"WATCH\">나의 관심</span>") > 0 && SRC.indexOf("r.kind === 'WATCH' ? '나의 관심'") > 0);
});

// ── NEXT 107: 관련 뉴스(사업계획 판이 없을 때만) — 규격 design-reviewer 2026-11-24 107 ──
function nwsItem(over) {
  return Object.assign({ news_id: 1, field_cd: 'FINANCE', field_name: '재정', title: '금고 지정 심의', press: '한국일보', published_on: '2026-10-01',
    url: 'https://news.example.com/a?x=1&y=2', summary: '첫 줄\n둘째 줄' }, over || {});
}
function nwsData(items, over) {
  return Object.assign({ institution_id: 'jongno', has_news: true, stale: false, stale_months: 12, checked_on: '2026-11-18', window_from: '2025-11-18',
    window_to: '2026-11-18', item_count: items.length, items: items }, over || {});
}
const NWS_EMPTY = { status: 'ok', data: { institution_id: 'jongno', name_ko: '종로구', import: null, docs: [] } };

test('newsItemHtml: 제목·요약 esc 뒤 줄바꿈, 링크는 http(s)만 + _blank noopener noreferrer, 막히면 글자 + 링크 없음 칩', function () {
  const h = plans.newsItemHtml(nwsItem());
  assert.ok(h.indexOf('<a href="https://news.example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer" aria-describedby="pl-news-note">금고 지정 심의</a>') >= 0);
  assert.ok(h.indexOf('<span class="wf-badge pp-neutral">재정</span>') >= 0);
  assert.ok(h.indexOf('<p class="db-why pl-news-src">한국일보 · 보도일 <span class="v">2026-10-01</span></p>') >= 0);
  assert.ok(h.indexOf('<p class="pl-news-sum">첫 줄<br>둘째 줄</p>') >= 0);
  const evil = plans.newsItemHtml(nwsItem({ title: '<img src=x onerror=alert(1)>', press: '<b>언론</b>', summary: 'a<b>\r\nc\rd', field_name: '<i>' }));
  assert.ok(evil.indexOf('<img') < 0 && evil.indexOf('<b>') < 0 && evil.indexOf('<i>') < 0);
  assert.ok(evil.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0 && evil.indexOf('a&lt;b&gt;<br>c<br>d') >= 0, 'esc 가 먼저, 그 뒤 줄바꿈만 <br>');
  ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example.com', 'ftp://x.example.com', '', null].forEach(function (u) {
    const x = plans.newsItemHtml(nwsItem({ url: u }));
    assert.ok(x.indexOf('<a ') < 0 && x.indexOf('href=') < 0, String(u) + ': 링크를 내지 않는다');
    assert.ok(x.indexOf('<span>금고 지정 심의</span> <span class="wf-badge pp-cancel">링크 없음</span>') >= 0, String(u));
  });
  assert.ok(plans.newsItemHtml(nwsItem({ url: '  https://ok.example.com/x  ' })).indexOf('href="https://ok.example.com/x"') >= 0, '앞뒤 공백은 safeHttpUrl 이 뗀다');
  assert.ok(plans.newsItemHtml(nwsItem({ url: 'https://a.example.com/"onmouseover="x' })).indexOf('"onmouseover="x') < 0, '따옴표는 속성 밖으로 못 나간다');
  const f1 = plans.newsItemHtml(nwsItem({ field_name: null, field_cd: 'BUDGET' }));
  assert.ok(f1.indexOf('<span class="wf-badge pp-neutral">BUDGET</span>') >= 0);
  assert.ok(plans.newsItemHtml(nwsItem({ field_name: '', field_cd: '' })).indexOf('pp-neutral') < 0, '분야가 없으면 칩을 그리지 않는다');
  const bare = plans.newsItemHtml(nwsItem({ press: '', published_on: null, summary: '' }));
  assert.ok(bare.indexOf('pl-news-src') < 0 && bare.indexOf('pl-news-sum') < 0, '출처·요약이 비면 빈 줄을 그리지 않는다');
  assert.ok(plans.newsItemHtml(nwsItem({ press: '', published_on: '2026-10-01' })).indexOf('pl-news-src">보도일 ') >= 0, '언론사가 없어도 앞에 · 가 붙지 않는다');
  assert.ok(plans.newsItemHtml(null).indexOf('<li class="pl-news-it">') === 0, 'null 도 죽지 않는다');
});

test('newsSecHtml: 보도일 최신순(같으면 서버 순서·날짜 없음은 맨 끝), 입력 불변, 요약 줄, stale 줄은 stale 일 때만, 맺음 줄 id', function () {
  const items = [nwsItem({ title: '가', published_on: '2026-01-05' }), nwsItem({ title: '나', published_on: '2026-10-01' }),
    nwsItem({ title: '다', published_on: '2026-10-01' }), nwsItem({ title: '라', published_on: null })];
  const s = plans.newsSecHtml(nwsData(items));
  const at = function (t) { return s.indexOf('>' + t + '</a>'); };
  assert.ok(at('나') > 0 && at('나') < at('다') && at('다') < at('가') && at('가') < at('라'));
  assert.deepStrictEqual(items.map(function (x) { return x.title; }), ['가', '나', '다', '라'], '입력 배열을 바꾸지 않는다');
  assert.ok(s.indexOf('<section class="db-sec pl-news" aria-labelledby="pl-news-h"><h3 id="pl-news-h">관련 뉴스</h3>') === 0);
  assert.ok(s.indexOf('<p class="db-why pl-news-meta">확인 <span class="v">2026-11-18</span> · 보도일 <span class="v">2025-11-18</span> ~ <span class="v">2026-11-18</span>(최근 1년) · <span class="v">4</span>건</p>') >= 0);
  assert.ok(s.indexOf('pl-warn') < 0, 'stale 이 아니면 경고 줄 없음');
  assert.ok(s.indexOf('<ul class="pl-news-list">') > 0 && (s.match(/<li class="pl-news-it">/g) || []).length === 4);
  assert.ok(s.indexOf('<p class="db-why" id="pl-news-note">요약은 기사 원문이 아니라 수집할 때 따로 정리한 글입니다. 원문은 제목 링크로 엽니다(인터넷 PC에서 열림).</p></section>') > 0);
  const st = plans.newsSecHtml(nwsData([nwsItem()], { stale: true }), 6);
  assert.ok(st.indexOf('<p class="pl-warn">확인 <span class="v">2026-11-18</span> 뒤로 6개월 넘게 다시 확인하지 않았습니다. 새 기사가 있을 수 있으니 수집을 다시 요청하세요.</p>') >= 0);
  assert.ok(plans.newsSecHtml(nwsData([nwsItem()], { stale: true })).indexOf('뒤로 12개월 넘게') >= 0, 'months 가 없으면 12');
  assert.ok(plans.newsSecHtml(nwsData([nwsItem()], { stale: true }), 0).indexOf('뒤로 12개월 넘게') >= 0);
  assert.ok(plans.newsSecHtml(nwsData([]), 12).indexOf('<span class="v">0</span>건') >= 0, 'items 가 비어도 죽지 않는다');
  assert.ok(plans.newsSecHtml(null).indexOf('pl-news-list') > 0);
});

test('detailHtml(뉴스): docs 0 + has_news 면 뉴스 배치(칩 2~4개·본문 문장·요청 줄 hasData·뉴스 절), 검색칸 없음', function () {
  const REQ = { institution_id: 'jongno', status_cd: 'REQUESTED', requester_count: 2, requested_by_me: false, first_requested_at: '2026-11-17T01:00:00+09:00' };
  const chips = function (h) { return (h.match(/class="wf-badge/g) || []).length; };
  const nv = { status: 'ok', data: nwsData([nwsItem(), nwsItem({ title: '둘', published_on: '2026-09-01' })]) };
  const h = plans.detailHtml(NWS_EMPTY, { name: '종로구', news: nv, req: { item: null, can: true, busy: '' } });
  assert.ok(h.indexOf('<span class="wf-badge pp-neutral">관련 뉴스 <span class="v">2</span>건</span> <span class="wf-badge pp-cancel">사업계획 못 찾음</span>') >= 0);
  assert.ok(h.indexOf('<p class="db-empty">사업계획 문서를 찾지 못해 관련 뉴스로 대신합니다. 사업계획이 들어오면 뉴스 대신 사업계획을 보여 줍니다.</p>') >= 0);
  assert.ok(idx(h, 'class="db-sec pl-sum"') < idx(h, 'class="pl-req"') && idx(h, 'class="pl-req"') < idx(h, 'class="db-sec pl-news"'), '요청 줄은 사업계획 절 끝, 뉴스 절은 그 아래');
  assert.ok(h.indexOf('새 계획이 나왔으면 다시 요청하세요.') >= 0 && h.indexOf('id="pl-req-go"') >= 0, '요청 줄은 hasData:true 문구');
  assert.ok(h.indexOf('pop-unk') < 0 && h.indexOf('id="pl-kw"') < 0 && h.indexOf('아직 수집되지 않았습니다') < 0);
  assert.strictEqual(chips(h.slice(0, idx(h, 'class="db-sec pl-news"'))), 2);
  const stale = plans.detailHtml(NWS_EMPTY, { news: { status: 'ok', data: nwsData([nwsItem()], { stale: true }) }, req: { item: null, can: true, busy: '' } });
  assert.ok(stale.indexOf('wf-badge cr-st gap">오래됨') >= 0, 'stale 이고 열린 요청이 없으면 오래됨');
  const open = plans.detailHtml(NWS_EMPTY, { news: { status: 'ok', data: nwsData([nwsItem()], { stale: true }) }, req: { item: REQ, can: true, busy: '' } });
  assert.ok(open.indexOf('data-st="REQUESTED">요청됨</span>') >= 0 && open.indexOf('오래됨') < 0, '열린 요청이 있으면 짧은 글자로, 오래됨은 뺀다');
  assert.strictEqual(chips(open.slice(0, idx(open, 'class="db-sec pl-news"'))), 3);
  const nc = plans.detailHtml(NWS_EMPTY, { news: nv, req: { item: REQ, can: true, busy: '', newsClosed: { closed_at: '2026-11-24T01:00:00+09:00' } } });
  assert.ok(nc.indexOf('data-st="NEWS"') < 0 && nc.indexOf('뉴스로 대체') < 0, "상세는 '뉴스로 대체' 칩을 넣지 않는다(본문이 같은 말)");
  const noReq = plans.detailHtml(NWS_EMPTY, { news: nv });
  assert.ok(noReq.indexOf('class="pl-req"') < 0 && noReq.indexOf('db-sec pl-news') > 0, '요청 현황이 없어도 뉴스는 보인다');
});

test('detailHtml(뉴스): 불러오는 중·오류·뉴스 없음·o.news 없음, docs 가 있으면 뉴스를 그리지 않는다', function () {
  const can = { item: null, can: true, busy: '' };
  const ld = plans.detailHtml(NWS_EMPTY, { news: { status: 'loading' }, req: can });
  assert.ok(ld.indexOf('<p class="db-empty" aria-busy="true">관련 뉴스가 있는지 확인하는 중입니다…</p>') >= 0 && ld.indexOf('pop-unk">자료 없음') >= 0 && ld.indexOf('id="pl-req-go"') >= 0);
  assert.ok(ld.indexOf('아직 수집되지 않았습니다') < 0, '확인 중에는 없다고 단정하지 않는다');
  const er = plans.detailHtml(NWS_EMPTY, { news: { status: 'error', code: 500 }, req: can });
  assert.ok(er.indexOf('<p class="db-why">관련 뉴스를 불러오지 못했습니다(500). <button type="button" id="pl-retry-news">다시 불러오기</button></p>') >= 0);
  assert.ok(er.indexOf('아직 수집되지 않았습니다. 사업계획 문서를 찾지 못하면 관련 뉴스(최근 1년)로 대신 보여 줍니다.') >= 0 && er.indexOf('id="pl-req-go"') >= 0);
  assert.ok(plans.detailHtml(NWS_EMPTY, { news: { status: 'error', code: 0 }, req: can }).indexOf('(연결 실패)') >= 0);
  assert.ok(plans.detailHtml(NWS_EMPTY, { news: { status: 'error', code: '<b>' }, req: can }).indexOf('<b>') < 0);
  const none = plans.detailHtml(NWS_EMPTY, { news: { status: 'ok', data: { has_news: false } }, req: can });
  assert.ok(none.indexOf('이 기관의 사업계획은 아직 수집되지 않았습니다. 사업계획 문서를 찾지 못하면 관련 뉴스(최근 1년)로 대신 보여 줍니다.</p>') >= 0);
  assert.ok(none.indexOf('pop-unk">자료 없음') >= 0 && none.indexOf('pl-news') < 0 && none.indexOf('pl-retry-news') < 0);
  const des = plans.detailHtml(NWS_EMPTY, { news: { status: 'ok', data: { has_news: false } }, req: { item: null, can: false, busy: '' } });
  assert.ok(des.indexOf('영업부서가 수집을 요청하면 개발부서가 모아 올립니다.') >= 0 && des.indexOf('관련 뉴스(최근 1년)로 대신 보여 줍니다.') >= 0 && des.indexOf('pl-req') < 0, '요청 못 하는 사용자도 뉴스 안내를 본다');
  const plain = plans.detailHtml(NWS_EMPTY, { req: can });
  assert.ok(plain.indexOf('이 기관의 사업계획은 아직 수집되지 않았습니다.</p>') >= 0 && plain.indexOf('관련 뉴스') < 0, 'o.news 가 없으면 지금 동작 그대로');
  const hid = plans.detailHtml(view([doc()]), { name: '종로구', news: { status: 'ok', data: nwsData([nwsItem()]) } });
  assert.ok(hid.indexOf('pl-news') < 0 && hid.indexOf('관련 뉴스') < 0 && hid.indexOf('id="pl-kw"') >= 0, '문서가 있으면 캐시에 뉴스가 있어도 숨긴다');
});

test('stateChipsHtml(뉴스, 5번째 인자 ex): 뉴스로 대체·새 계획 못 찾음·뉴스 N건, 서버 값이 없으면 지금 모양 그대로, 칩은 최대 4개', function () {
  const chips = function (h) { return (h.match(/class="wf-badge/g) || []).length; };
  const R = function (c) { return { status_cd: c }; };
  const UNK = '<span class="pop-unk">자료 없음</span>';
  const NC = { institution_id: 'a', closed_at: '2026-11-24T01:00:00+09:00', close_reason: 'NEWS' };
  assert.strictEqual(plans.stateChipsHtml(null, null, null, null, {}), UNK);
  assert.strictEqual(plans.stateChipsHtml(null, null, null, null, { news: null, newsClosed: null }), UNK);
  assert.strictEqual(plans.stateChipsHtml(null, null, null, null, { news: { item_count: 0 } }), UNK, '건수 0 은 뉴스 없음');
  assert.strictEqual(plans.stateChipsHtml(null, null, null, null, { news: { item_count: 3 } }), '<span class="wf-badge pp-neutral">뉴스 <span class="v">3</span>건</span>');
  assert.strictEqual(plans.stateChipsHtml(null, null, null, null, { newsClosed: NC }),
    '<span class="wf-badge pp-neutral" data-st="NEWS" title="2026-11-24 수집 결과: 사업계획을 찾지 못해 관련 뉴스로 대체했습니다(7일간 표시).">뉴스로 대체</span>');
  const both = plans.stateChipsHtml(null, R('REQUESTED'), null, null, { news: { item_count: 3 }, newsClosed: NC });
  assert.ok(idx(both, '뉴스 <span') < idx(both, '뉴스로 대체') && idx(both, '뉴스로 대체') < idx(both, 'data-st="REQUESTED">사업계획 요청됨') && both.indexOf('pop-unk') < 0 && chips(both) === 3);
  assert.ok(plans.stateChipsHtml(null, null, R('FAILED'), null, { news: { item_count: 2 } }).indexOf('data-st="FAILED">수집 실패') >= 0, '뉴스만 있고 예전 실패 기록은 그대로');
  assert.ok(plans.stateChipsHtml(null, null, R('FAILED'), null, { newsClosed: NC }).indexOf('FAILED') < 0, '방금 뉴스로 닫혔으면 옛 실패 칩은 내지 않는다');
  const AP = { institution_id: 'a', closed_at: '2026-11-19T01:00:00+09:00' };
  const old = plans.stateChipsHtml({ item_count: 2, stale: true }, null, null, null, { newsClosed: NC });
  assert.ok(old.indexOf('<span class="wf-badge pp-cancel" data-st="NEWS_OLD" title="2026-11-24 수집에서 새 사업계획을 찾지 못했습니다. 지금 보이는 것은 예전 계획입니다(7일간 표시).">새 계획 못 찾음</span>') >= 0);
  assert.ok(old.indexOf('data-st="NEW"') < 0 && old.indexOf('오래됨') >= 0, "'new' 가 아니고 오래됨은 그대로");
  assert.ok(idx(old, '사업계획 ') < idx(old, 'NEWS_OLD') && idx(old, 'NEWS_OLD') < idx(old, '오래됨'));
  const both2 = plans.stateChipsHtml({ item_count: 2 }, null, null, AP, { newsClosed: NC });
  assert.ok(both2.indexOf('data-st="NEW"') >= 0 && both2.indexOf('NEWS_OLD') < 0, '진짜 반영(new)이 있으면 그쪽');
  assert.ok(plans.stateChipsHtml({ item_count: 2 }, null, R('FAILED'), null, { newsClosed: NC }).indexOf('FAILED') < 0);
  assert.strictEqual(chips(plans.stateChipsHtml({ item_count: 2, period_ended: true, stale: true }, null, null, null, { newsClosed: NC })), 4);
  assert.strictEqual(chips(plans.stateChipsHtml({ item_count: 2, period_ended: true, stale: true }, R('REQUESTED'), null, null, { newsClosed: NC })), 4);
  assert.strictEqual(plans.stateChipsHtml({ item_count: 2 }, null, null, null, { news: { item_count: 9 } }), plans.stateChipsHtml({ item_count: 2 }), '사업계획이 있으면 뉴스 칩은 없다');
  const r = plans.baseRows([{ name: '가구', region: '11', type: '지자체', institutionId: 'ga' }], null, null)[0];
  assert.ok(plans.rowHtml(r, { loaded: true, news: { item_count: 4 } }).indexOf('뉴스 <span class="v">4</span>건') >= 0 && plans.rowHtml(r, { loaded: true, news: { item_count: 4 } }).indexOf('pop-unk') < 0);
  assert.ok(plans.rowHtml(r, { loaded: true, newsClosed: NC }).search(/data-st="NEWS"[^>]*>뉴스로 대체/) >= 0);
  assert.ok(plans.rowHtml(r, { loaded: true }).indexOf('pop-unk">자료 없음') >= 0);
});

test('newsMap·newsClosedMap·appliedMap: 서버 값이 없는 옛 응답은 빈 값, 뉴스로 닫힌 행은 new 에서 빠진다, __proto__ 안전', function () {
  assert.deepStrictEqual(plans.newsMap({}), {});
  assert.deepStrictEqual(plans.newsMap(null), {});
  assert.deepStrictEqual(plans.newsMap({ news: 'x' }), {});
  assert.deepStrictEqual(Object.keys(plans.newsMap({ news: [{ institution_id: 'a', item_count: 3 }, { institution_id: 'b', item_count: 0 }, null, { item_count: 2 }] })), ['a']);
  const d = { recent_applied: [{ institution_id: 'a', closed_at: 'x', close_reason: 'NEWS' }, { institution_id: 'b', closed_at: 'y', close_reason: null }, { institution_id: 'c' }, null] };
  assert.deepStrictEqual(Object.keys(plans.appliedMap(d)), ['b', 'c'], "NEWS 행은 'new' 에 넣지 않는다");
  assert.deepStrictEqual(Object.keys(plans.newsClosedMap(d)), ['a']);
  assert.deepStrictEqual(plans.newsClosedMap({}), {});
  assert.deepStrictEqual(plans.newsClosedMap({ recent_applied: 'x' }), {});
  const p = plans.newsClosedMap({ recent_applied: [{ institution_id: '__proto__', close_reason: 'NEWS' }] });
  assert.ok(Object.prototype.hasOwnProperty.call(p, '__proto__') && Object.getPrototypeOf(p) === Object.prototype);
  assert.ok(Object.prototype.hasOwnProperty.call(plans.newsMap({ news: [{ institution_id: '__proto__', item_count: 1 }] }), '__proto__'));
  plans.resetStatus();
  try {
    plans.applyStatus({ items: [{ institution_id: 'sung', item_count: 5, stale: true }], news: [{ institution_id: 'nw', item_count: 3, checked_on: '2026-11-18', stale: false }] });
    plans.applyCollect({ can_request: true, items: [], recent_applied: [{ institution_id: 'nw2', closed_at: '2026-11-24T01:00:00+09:00', close_reason: 'NEWS' }, { institution_id: 'sung', closed_at: '2026-11-24T01:00:00+09:00', close_reason: 'NEWS' }] });
    assert.ok(plans.sectionInner('nw', 'db-name').indexOf('뉴스 <span class="v">3</span>건') >= 0 && plans.sectionInner('nw', 'db-name').indexOf('pop-unk') < 0, '현황판 절: 뉴스만 있는 기관');
    assert.ok(plans.sectionInner('nw2', 'db-name').search(/data-st="NEWS"[^>]*>뉴스로 대체/) >= 0);
    const old = plans.sectionInner('sung', 'db-name');
    assert.ok(old.search(/data-st="NEWS_OLD"[^>]*>새 계획 못 찾음/) >= 0 && old.indexOf('data-st="NEW"') < 0 && old.indexOf('오래됨') >= 0);
    assert.ok(plans.collectOf('sung').newsClosed && plans.collectOf('sung').applied === null);
    assert.deepStrictEqual([plans.collectOf('constructor').newsClosed, plans.collectOf('__proto__').newsClosed], [null, null]);
    plans.applyCollect({ can_request: true, items: [], recent_applied: [{ institution_id: 'sung', closed_at: '2026-11-24T01:00:00+09:00' }] });
    assert.ok(plans.sectionInner('sung', 'db-name').indexOf('data-st="NEW"') >= 0, 'close_reason 가 없으면 지금처럼 new');
  } finally { plans.resetStatus(); }
});

test('소스·CSS(107): 뉴스는 docs 0 일 때만 받고, 링크는 safeHttpUrl 한 곳, 7줄 CSS 는 사업계획 블록 안', function () {
  assert.ok(/fetchJson\('\/institutions\/' \+ encodeURIComponent\(id\) \+ '\/news'\)/.test(SRC));
  assert.ok(/got\.status === 'ok' && !\(got\.data && Array\.isArray\(got\.data\.docs\) && got\.data\.docs\.length\)\) loadNews\(id\)/.test(SRC), 'docs 0 일 때만');
  assert.ok(/r\.status === 'denied' \|\| r\.code === 404 \? \{ status: 'ok', data: \{ has_news: false \} \}/.test(SRC), '401·403·404 는 조용히 뉴스 없음');
  assert.ok(/case 'pl-retry-news': if \(S\.selRow\) \{ loadNews\(S\.selRow\.id, true\)/.test(SRC));
  const nws = SRC.slice(SRC.indexOf('plans.newsItemHtml = '), SRC.indexOf('plans.detailHtml = '));
  assert.strictEqual((nws.match(/logic\.safeHttpUrl\(/g) || []).length, 1);
  assert.ok(nws.indexOf('target="_blank" rel="noopener noreferrer"') > 0 && nws.indexOf('<a href="\' + esc(url)') > 0);
  const a = HTML.indexOf('/* 기관 사업계획 시작'), b = HTML.indexOf('/* 기관 사업계획 끝 */');
  const css = HTML.slice(a, b);
  ['.pl-news-meta {', '.pl-news-list {', '.pl-news-it {', '.pl-news-t {', '.pl-news-src {', '.pl-news-sum {', '#pl-news-note {'].forEach(function (s) { assert.ok(css.indexOf(s) >= 0, s); });
  assert.ok(css.indexOf('/* 관련 뉴스(NEXT 107)') >= 0 && css.indexOf('line-clamp') < 0, '요약은 줄을 자르지 않는다');
});

test('loadNews 다시 그리기 뒤 포커스 복귀(qa 107 P2-1)', function () {
  const fn = SRC.slice(SRC.indexOf('function loadNews('), SRC.indexOf('function markSelected('));
  assert.ok(/activeElement/.test(fn) && /pl-name/.test(fn), '뉴스 도착 뒤 renderPane 이 포커스를 잃지 않게 되돌린다');
});

test('sectionInner: 뉴스만 있는 기관은 요청 못 하는 사람도 여는 링크가 있다(qa 107 P2-2)', function () {
  plans.resetStatus();
  try {
    plans.applyStatus({ items: [], news: [{ institution_id: 'nw', item_count: 3 }] });
    plans.applyCollect({ can_request: false, items: [], recent_applied: [] });
    const h = plans.sectionInner('nw', 'db-name');
    assert.ok(h.indexOf('뉴스 <span class="v">3</span>건') >= 0);
    assert.ok(h.indexOf('data-pl-open="nw"') >= 0 && h.indexOf('기관 사업계획에서 보기') >= 0, '열람 링크');
    assert.ok(plans.sectionInner('zz', 'db-name').indexOf('data-pl-open') < 0, '뉴스도 요청도 없고 요청 못 하면 링크 없음');
  } finally { plans.resetStatus(); }
});
