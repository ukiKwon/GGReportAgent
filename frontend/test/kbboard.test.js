// 입찰 현황판(kbboard.js) 순수 부분: 국민은행이 맡은 기관 판정(1·2금고·2027년부터·법원·공공기관)·묶음·정렬·준비 중 합계·알림 줄 3문구·마크업·CSS·배선. (2026-11-16)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const kbb = require('../js/kbboard.js');
const store = require('../js/store.js');

const TODAY = new Date('2026-11-16T00:00:00');
function plus(days) { return logic.localDateStr(new Date(2026, 10, 16 + days)); }
function rec(name, days, extra) {
  return Object.assign({ name: name, region: '11', type: '지자체', contractEnd: days === null ? null : plus(days), confirmed: false }, extra || {});
}
const V = ['공고', '경과', '임박', '먼', '미상'].map(function (n, i) { return { key: '11|' + n, name: n, slot: i === 0 ? 2 : 1 }; });
const NX = [{ key: '11|새곳', name: '새곳', from: '2027', term: '2027~2030', quote: '국민은행 선정(타행에서 이동), 약정 2027~2030' }];
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

// ── 금고 기관 판정(종류별 스위치 한 곳) ─────────────────────────
test('isOurs: 스위치는 모두 켜짐(muni·next·court·public) — 끄면 그 종류만 빠진다', function () {
  const court = { name: '서울중앙지방법원', region: '11', type: '법원', bank: '국민은행' };
  const pub = { name: '한국항공우주연구원', region: '30', type: '공공기관', bank: '국민은행' };
  const nh = { name: '다른법원', region: '11', type: '법원', bank: '농협은행' };
  assert.deepStrictEqual(dash.OURS_SCOPE, { muni: true, next: true, court: true, public: true });
  assert.strictEqual(dash.isOurs(rec('공고', 5), V), true);
  assert.strictEqual(dash.isOurs(rec('아무', 5), V), false);
  assert.strictEqual(dash.isOurs(court, V), true);
  assert.strictEqual(dash.isOurs(pub, V), true);
  assert.strictEqual(dash.isOurs(court, V, { muni: true, next: true, court: false, public: true }), false);
  assert.strictEqual(dash.isOurs(pub, V, { muni: true, next: true, court: true, public: false }), false);
  assert.strictEqual(dash.isOurs(nh, V), false);                            // 은행 칸이 다르면 법원도 들지 않는다
  assert.strictEqual(dash.isOurs(null, V), false);
  assert.strictEqual(dash.isOurs(rec('공고', 5), undefined), false);        // 검증 목록이 없으면 지자체는 하나도 안 든다
});

test('oursKind·isOurs: 2027년부터(KB_NEXT)는 next로 가르고, 현재 은행 칸(court·public)과 섞이지 않는다', function () {
  assert.strictEqual(dash.oursKind(rec('새곳', 5), V, NX), 'next');
  assert.strictEqual(dash.oursKind(rec('새곳', 5), V), '');                 // 자료를 안 넘기면 판정하지 않는다
  assert.strictEqual(dash.oursKind(rec('공고', 5), V, NX), 'muni');          // 현재 목록이 먼저
  assert.strictEqual(dash.isOurs(rec('새곳', 5), V, undefined, NX), true);
  assert.strictEqual(dash.isOurs(rec('새곳', 5), V, { muni: true, next: false, court: true, public: true }, NX), false);
  const nc = { name: '새법원', region: '11', type: '법원', bank: '국민은행' };
  assert.strictEqual(dash.oursKind(nc, V, [{ key: '11|새법원' }]), 'next');   // 차기 선정만 된 곳이 법원 칸으로 새지 않는다
  assert.strictEqual(dash.isOurs(nc, V, { muni: true, next: false, court: true, public: true }, [{ key: '11|새법원' }]), false);
});

test('ours·slotText·leavesText·summary: 칩 글자는 1금고·2금고(일부 회계)·2027년부터·공탁금·주거래', function () {
  const court = { name: '서울중앙지방법원', region: '11', type: '법원', bank: '국민은행' };
  const pub = { name: '한국항공우주연구원', region: '30', type: '공공기관', bank: '국민은행' };
  const list = [rec('공고', 5), rec('경과', -5), rec('아무', 5), court, pub, rec('새곳', 300)];
  const ours = kbb.ours(list, V, undefined, NX);
  assert.strictEqual(ours.length, 5);
  assert.strictEqual(kbb.ours(list, V, { muni: true, next: false, court: false, public: false }, NX).length, 2);   // 지자체 현재 금고만
  assert.strictEqual(kbb.slotText(list[0], V, NX), '2금고(일부 회계)');
  assert.strictEqual(kbb.slotText(list[1], V, NX), '1금고');
  assert.strictEqual(kbb.slotText(court, V, NX), '공탁금');
  assert.strictEqual(kbb.slotText(pub, V, NX), '주거래');
  assert.strictEqual(kbb.slotText(list[5], V, NX), '2027년부터');
  const c = kbb.summary(ours, V, NX);
  assert.deepStrictEqual(c, { total: 4, s1: 1, s2: 1, court: 1, pub: 1, next: 1 });   // total은 지금 맡은 곳, 2027년부터는 따로
  assert.strictEqual(kbb.summaryHtml(c), '<b>4</b>곳 · 1금고 1 · 2금고 1 · 공탁금 1 · 주거래 1 · 2027년부터 1');   // 칩 글자와 같게(design C2)
  assert.strictEqual(kbb.summaryHtml(kbb.summary(kbb.ours(list.slice(0, 2), V), V)), '<b>2</b>곳 · 1금고 1 · 2금고 1');
  const VL = [{ key: '43|청주', name: '청주', slot: 2, leaves: '2027', next: '2027~2030은 다른 은행' }];
  const cj = { name: '청주', region: '43', type: '지자체' };
  assert.strictEqual(kbb.leavesText(cj, VL), '2027년부터 다른 은행');
  assert.strictEqual(kbb.leavesText(list[0], V), '');
  assert.strictEqual(kbb.leavesText(null, VL), '');
});

test('각주(design C2): 모두 켬 문장 그대로, 법원·공공기관을 끄면 그 부분을 빼고 끝에 아직 세지 않는다는 말', function () {
  const on = kbb.footHtml(undefined, 7);
  const SRC = '<span class="hb-src">지자체 출처: <a href="https://www.lofin365.go.kr/portal/LF8310000.do?curPage=1&amp;ntcaClsDvCd=FSL409" target="_blank" rel="noopener noreferrer">' +
    '행안부 금고지정 현황(2026.1.1. 기준)<span class="sr-only">, 새 탭</span></a> <span class="db-why">(인터넷 PC에서 열림)</span></span>';
  assert.strictEqual(on, '지자체는 1·2금고, 법원은 공탁금 보관은행, 공공기관은 주거래은행 칸으로 셉니다. ' +
    '2027년부터는 지정 결과 공고·기사로 확인한 곳입니다. 은행 칸이 빈 법원·공공기관 <b>7</b>곳은 세지 않았습니다.' + SRC);
  assert.ok(on.indexOf('우리') < 0);
  const off = kbb.footHtml({ muni: true, next: false, court: false, public: false }, 7);
  assert.strictEqual(off, '지자체는 1·2금고만 셉니다. 법원·공공기관은 아직 세지 않습니다.' + SRC);
  // 지자체를 세지 않으면 지자체 문장과 출처 줄이 둘 다 없다
  const nm = kbb.footHtml({ muni: false, next: false, court: true, public: true }, 7);
  assert.ok(nm.indexOf('금고지정') < 0 && nm.indexOf('hb-src') < 0 && nm.indexOf('지자체') < 0);
  // 주소가 비면 링크와 안내 없이 글자만
  const keep = kbb.LOFIN_FSL409_URL; kbb.LOFIN_FSL409_URL = '';
  const bare = kbb.footHtml({ muni: true, next: false, court: false, public: false }, 0);
  kbb.LOFIN_FSL409_URL = keep;
  assert.ok(bare.endsWith('<span class="hb-src">지자체 출처: 행안부 금고지정 현황(2026.1.1. 기준)</span>') && bare.indexOf('<a ') < 0 && bare.indexOf('인터넷 PC') < 0);
  assert.strictEqual(kbb.bankUnknownN([{ name: 'a', region: '11', type: '법원' }, { name: 'b', region: '11', type: '공공기관', bank: '농협은행' },
    { name: 'c', region: '11', type: '지자체' }]), 1);
});

test('srcHtml 머리말 인자(P2-2): 기본 \'지자체 출처: \', 상세는 \'직접 확인: \', 링크·안내는 그대로', function () {
  const def = kbb.srcHtml();
  assert.ok(def.indexOf('<span class="hb-src">지자체 출처: <a ') === 0);
  const det = kbb.srcHtml('직접 확인: ');
  assert.strictEqual(det, def.replace('지자체 출처: ', '직접 확인: '));
  assert.strictEqual(kbb.srcHtml('<b>x</b>').indexOf('<b>'), -1);   // 머리말도 이스케이프
});

test('KB_NEXT 자료: 6곳·2027년부터·출처 있음·현재 목록(KB_VERIFIED)과 겹치지 않음, 청주 leaves 2027', function () {
  require('../data/kb-verified.js');   // window 또는 globalThis에 KB_VERIFIED·KB_NEXT를 붙인다(node는 globalThis)
  const KN = globalThis.KB_NEXT, KV = globalThis.KB_VERIFIED;
  assert.ok(Array.isArray(KN) && Array.isArray(KV));
  assert.strictEqual(KN.length, 6);
  const keys = {};
  KV.forEach(function (v) { keys[v.key] = true; });
  KN.forEach(function (n) {
    assert.ok(n.key && n.name && n.from === '2027' && n.quote && n.src_date && /^https:\/\//.test(n.url), n.key);
    assert.ok(!keys[n.key], '현재 목록과 겹침: ' + n.key);
    assert.ok(!/우리(?!은행)/.test(n.quote), n.key);   // 은행 이름 '우리은행'만 허용 — 낙찰 은행과 구분되는 말
  });
  assert.strictEqual(new Set(KN.map(function (n) { return n.key; })).size, KN.length);
  const cj = KV.filter(function (v) { return v.key === '43|청주시청'; })[0];
  assert.ok(cj && cj.leaves === '2027' && cj.slot === 2);
  assert.strictEqual(kbb.leavesText({ name: '청주시청', region: '43', type: '지자체' }, KV), '2027년부터 다른 은행');
  assert.strictEqual(KV.filter(function (v) { return v.leaves; }).length, 1);
});

// ── 묶음·정렬 ──────────────────────────────────────────────────
function oursList() {
  return [rec('미상', null), rec('먼', 250), rec('임박', 30), rec('경과', -5), rec('공고', -10, { confirmed: true })];
}
test('groups: 묶음1 = 공고 → 경과 → 기간 안 가까운 순, 묶음2 = 기간 밖 → 날짜 미상(맨 뒤), 묶음3 = 2027년부터', function () {
  const ours = kbb.ours(oursList().concat([rec('새곳', 20)]), V, undefined, NX);
  const g = kbb.groups(ours, TODAY, '3', V, NX);
  assert.deepStrictEqual(g.first.map(function (i) { return i.name; }), ['공고', '경과', '임박']);
  assert.deepStrictEqual(g.rest.map(function (i) { return i.name; }), ['먼', '미상']);
  assert.deepStrictEqual(g.next.map(function (i) { return i.name; }), ['새곳']);   // 기간 안이어도 묶음 1에 들지 않는다
  assert.strictEqual(g.rest[1].unknown, true);
  assert.strictEqual(g.unknownN, 1);
  assert.deepStrictEqual(kbb.groups(ours, TODAY, '12', V, NX).first.map(function (i) { return i.name; }), ['공고', '경과', '임박', '먼']);
  const all = kbb.groups(ours, TODAY, 'all', V, NX);
  assert.deepStrictEqual(all.rest.map(function (i) { return i.name; }), ['미상']);
  assert.strictEqual(all.first.length + all.rest.length + all.next.length, ours.length);   // 어느 묶음에도 빠지거나 겹치는 기관이 없다
  assert.strictEqual(kbb.groups(kbb.ours(oursList(), V), TODAY, '3', V).next.length, 0);
  assert.ok(kbb.firstLabel('6', 3).indexOf('6개월 안에 입찰 <b>3</b>곳 · 공고 진행 중·경과 포함') === 0);
  assert.strictEqual(kbb.firstEmpty('all'), '입찰 날짜를 아는 기관이 없습니다.');
  assert.strictEqual(kbb.firstEmpty('3'), '3개월 안에 입찰이 있는 기관이 없습니다.');
  assert.strictEqual(kbb.restLabel(17), '그 밖의 기관 <b>17</b>곳');
  assert.strictEqual(kbb.nextLabel(6), '2027년부터 국민은행이 맡는 기관 <b>6</b>곳');
});

test('지도 ▲ 합 = 공고 현황 6개월 수(같은 계산 유지) — 금고 기관 묶음도 같은 항목을 쓴다', function () {
  const list = [rec('a', 0), rec('b', 30), rec('c', 182), rec('d', 183), rec('e', 400), rec('f', -3), rec('g', null), rec('h', -10, { confirmed: true })];
  const deduped = logic.dedupeByInstitution(list);
  const map = logic.regionMix(deduped, TODAY).urgent;
  const m = dash.model(list, TODAY);
  assert.strictEqual(dash.windowItems(m, '6').length, map);
  assert.strictEqual(m.upcoming.filter(function (u) { return u.days <= dash.URGENT_DAYS; }).length, map);
});

test('rowHtml: 버튼·aria-haspopup·칩·회차 소식(next 그대로, 확정 덧붙이지 않음)·청주 배지·이스케이프', function () {
  const V2 = [{ key: '11|<b>가', name: '<b>가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  const r = rec('<b>가', 30);
  const it = kbb.groups([r], TODAY, '6', V2).first[0];
  const h = kbb.rowHtml(it, { verified: V2, prepActive: true });
  assert.ok(h.indexOf('<button type="button" class="hb-row"') >= 0 && h.indexOf('aria-haspopup="dialog"') >= 0);
  assert.ok(h.indexOf('<b>가') < 0 && h.indexOf('&lt;b&gt;가') >= 0);
  assert.ok(h.indexOf('<span class="hb-slot">1금고</span>') >= 0 && h.indexOf('사전준비 중') >= 0 && h.indexOf('hb-leaves') < 0);
  assert.ok(h.indexOf('회차 소식: 2026 회차 국민은행 수성(기사 2026-11-04)') >= 0 && h.indexOf('확정</span>') < 0);
  kbb.SHOW_NEWS = false;
  try { assert.ok(kbb.rowHtml(it, { verified: V2 }).indexOf('회차 소식') < 0); } finally { kbb.SHOW_NEWS = true; }
  // 청주: 현재 금고 칩 옆에 '2027년부터 다른 은행' 배지
  const VL = [{ key: '43|청주시청', name: '청주시청', slot: 2, leaves: '2027', next: '2027~2030은 1금고 농협·2금고 신한 — 국민은행 빠짐' }];
  const cj = kbb.groups([rec('청주시청', 40, { region: '43' })], TODAY, '6', VL).first[0];
  const hc = kbb.rowHtml(cj, { verified: VL });
  assert.ok(hc.indexOf('<span class="hb-slot">2금고(일부 회계)</span><span class="hb-slot hb-leaves">2027년부터 다른 은행</span>') >= 0);
  assert.ok(hc.indexOf('회차 소식: 2027~2030은 1금고 농협') >= 0);
  // 2027년부터 묶음 행: 칩 '2027년부터', 소식 줄은 자료의 quote
  const nit = kbb.groups([rec('새곳', 30)], TODAY, '6', [], NX).next[0];
  const hn = kbb.rowHtml(nit, { verified: [], nextList: NX });
  assert.ok(hn.indexOf('<span class="hb-slot">2027년부터</span>') >= 0 && hn.indexOf('hb-leaves') < 0);
  assert.ok(hn.indexOf('회차 소식: 국민은행 선정(타행에서 이동), 약정 2027~2030') >= 0);
});

// ── 알림 줄 3문구 ───────────────────────────────────────────────
test('알림 줄: m>0 / m=0·n>0 / n=0 세 문구, 칩 최대 3개 + 외 n곳, 마감 전 칩이 있으면 hot', function () {
  const n = ['가', '나', '다', '라', '마'].map(function (x, i) { return rec(x, -(10 + i), { confirmed: true, receiveTo: plus(3 + i) }); });
  const notice = dash.model(n, TODAY).notice;
  assert.strictEqual(notice.length, 5);
  const a4 = kbb.alertModel(notice, notice.slice(0, 4));
  assert.strictEqual(a4.m, 4); assert.strictEqual(a4.chips.length, 3); assert.strictEqual(a4.more, 1); assert.strictEqual(a4.hot, true);
  const h4 = kbb.alertHtml(a4);
  assert.ok(h4.indexOf('공고가 난 국민은행이 맡은 기관 <b>4</b>곳') >= 0 && h4.indexOf('외 <b>1</b>곳') >= 0);
  assert.strictEqual((h4.match(/class="hb-chip"/g) || []).length, 3);
  assert.ok(h4.indexOf('id="hb-to-notice">입찰 공고 현황에서 보기</button>') >= 0);
  assert.ok(/aria-label="[^"]*마감 D-\d+, 입찰 공고 현황에서 보기"/.test(h4));
  const h0 = kbb.alertHtml(kbb.alertModel(notice, []));
  assert.ok(h0.indexOf('지금 공고 진행 중 <b>5</b>곳 · 그중 국민은행이 맡은 기관은 없습니다.') >= 0 && h0.indexOf('hb-chip') < 0);
  assert.ok(kbb.alertHtml(kbb.alertModel([], [])).indexOf('지금 공고 진행 중인 기관이 없습니다.') >= 0);
  assert.strictEqual(kbb.alertModel(notice, []).hot, false);
  [h4, h0].forEach(function (h) { assert.ok(h.indexOf('우리') < 0); });            // P1-1: 화면 글에 '우리'를 쓰지 않는다
});

// ── 준비 중인 제안: 합계 = 단계 카드 합계(P2-1) ──────────────────────
const PREPS = [
  { institution_id: 'A', institution_name: '가', state_cd: 'CONFIRMED', bid_case_id: 'B1', progress: { done: 1, total: 4 }, assignee_names: ['김영업', '박영업'] },
  { institution_id: 'A', institution_name: '가', state_cd: 'IN_PROGRESS', bid_case_id: 'B2', progress: { done: 2, total: 4 } },
  { institution_id: 'B', state_cd: 'CANCELLED' },
  { institution_id: 'C', state_cd: 'WEIRD', bid_case_id: 'B3', can_view: false },
];
const OVERVIEW = { items: [{ institution_id: 'D', institution_name: '라', state: 'WRITING', done: false }, { institution_id: 'A', state: 'WRITING', done: false },
  { institution_id: 'E', state: 'NONE' }, { institution_id: 'F', state: 'WRITING', done: true }, { institution_id: 'D', state: 'WRITING', done: false }] };

test('prepRows: 목록 건수 = stageCounts 합계 = progressCount 합계(같은 기관은 한 번, 취소·완료·NONE 제외)', function () {
  const rows = kbb.prepRows(PREPS, OVERVIEW, [], TODAY);
  assert.strictEqual(rows.length, 3);                                      // A(더 나간 단계 1건), C, D
  assert.strictEqual(rows.length, dash.stageCounts(PREPS, OVERVIEW).total);
  assert.strictEqual(rows.length, dash.progressCount(PREPS, OVERVIEW).total);
  assert.strictEqual(kbb.prepRows(PREPS, null, [], TODAY).length, dash.stageCounts(PREPS, null).total);
  assert.strictEqual(kbb.prepRows(null, OVERVIEW, [], TODAY).length, dash.stageCounts(null, OVERVIEW).total);
  assert.strictEqual(kbb.prepRows([], { items: [] }, [], TODAY).length, 0);
  assert.strictEqual(rows.filter(function (r) { return r.institutionId === 'A'; })[0].stateCd, 'IN_PROGRESS');
});

test('prepRows 정렬: 입찰 가까운 순, 같으면 단계 순, 날짜 없음은 맨 뒤 / 행 마크업(권한 없음·aria-label)', function () {
  const list = [rec('가', 200, { institutionId: 'A' }), rec('다', 20, { institutionId: 'C' }), rec('라', -4, { institutionId: 'D' })];
  const rows = kbb.prepRows(PREPS, OVERVIEW, list, TODAY);
  assert.deepStrictEqual(rows.map(function (r) { return r.institutionId; }), ['D', 'C', 'A']);   // 경과(-4) → D-20 → D-200
  assert.strictEqual(rows[1].name, '다');                                  // 서버 이름이 비면 기관 자료 이름
  assert.ok(rows[0].bidText.indexOf('입찰 예정일 4일 지남') === 0 && rows[2].bidText === '입찰 예정 D-200');
  const noDate = kbb.prepRows(PREPS, OVERVIEW, [], TODAY);
  assert.strictEqual(noDate[noDate.length - 1].sort, Infinity);
  const h = kbb.prepRowHtml(rows[1]);                                      // C는 can_view=false
  assert.ok(h.indexOf('aria-disabled="true"') >= 0 && h.indexOf('열람 권한이 없는 건입니다') >= 0 && h.indexOf('열람 권한이 없습니다"') >= 0);
  const ok = kbb.prepRowHtml(rows[2]);
  assert.ok(/aria-label="가, [^"]*, 사전준비 화면 열기"/.test(ok) && ok.indexOf('2/4') >= 0 && ok.indexOf('aria-disabled') < 0);
});

test('prepRowHtml: 담당자 서버 원문은 이스케이프, aria-label 끝에 입찰 문구(있을 때만)', function () {
  const base = { id: 'B1', institutionId: 'A', name: '가', badge: { text: '사전준비', cls: 'pp-neutral' }, canView: true, done: 2, total: 4, bidText: '' };
  const h = kbb.prepRowHtml(Object.assign({}, base, { assigneeText: '담당 <b>x</b><img src=x onerror=1>' }));
  assert.ok(h.indexOf('<b>x</b>') < 0 && h.indexOf('<img') < 0 && h.indexOf('담당 &lt;b&gt;x&lt;/b&gt;') >= 0);
  assert.ok(h.indexOf('<span class="d">2/4</span>') >= 0);                                              // 진행 칸·숫자 마크업은 그대로
  assert.ok(h.indexOf('aria-label="가, 사전준비, 사전준비 화면 열기"') >= 0);
  const b = kbb.prepRowHtml(Object.assign({}, base, { assigneeText: '', bidText: '입찰 예정 D-20' }));
  assert.ok(b.indexOf('aria-label="가, 사전준비, 입찰 예정 D-20, 사전준비 화면 열기"') >= 0);
});

test('prepBodyHtml: 상태별 문구(401·403·오류·파일 모드·비었을 때)', function () {
  assert.ok(kbb.prepBodyHtml({ state: 'offline' }, []).indexOf('서버에 연결하면 보입니다.') >= 0);
  assert.ok(kbb.prepBodyHtml({ state: 'denied', code: 403 }, []).indexOf('영업팀·영업팀장·영업부장에게 보입니다.') >= 0);
  assert.ok(kbb.prepBodyHtml({ state: 'denied', code: 401 }, []).indexOf('로그인이 필요합니다. 다시 로그인하세요.') >= 0);
  assert.ok(kbb.prepBodyHtml({ state: 'error' }, []).indexOf('id="hb-retry"') >= 0);
  const empty = kbb.prepBodyHtml({ state: 'ok' }, []);
  assert.ok(empty.indexOf('아직 제안 확정한 기관이 없습니다.') >= 0 && empty.indexOf('id="hb-open-notice">입찰 공고 현황 열기') >= 0);
});

// ── 상세 공용(공고 상태 기록 절·기간 버튼 이름) ──────────────────────
test('paneHtml: recordHtml은 plans 절 뒤·tail 앞에만 들어가고, periodHtml은 이름·범례를 바꾼다', function () {
  const it = dash.itemForRec(rec('가', 30), TODAY);
  const withRec = dash.paneHtml(it, { act: 'none', today: TODAY, plansHtml: '<i id="P"></i>', recordHtml: dash.recordSecHtml(), tailHtml: '<i id="T"></i>' });
  // 기록 칸은 기관 정보 바로 뒤(규격 P1-2)라 plans 절 앞, plans 절은 tail 앞
  assert.ok(withRec.indexOf('<h3>기관 정보</h3>') < withRec.indexOf('공고 상태 기록') && withRec.indexOf('공고 상태 기록') < withRec.indexOf('id="P"') && withRec.indexOf('id="P"') < withRec.indexOf('id="T"'));
  assert.ok(withRec.indexOf('서버에 연결하면 공고 상태 기록을 보고 적을 수 있습니다.') > 0 && withRec.indexOf('준비중') < 0);
  assert.ok(dash.paneHtml(it, { act: 'none', today: TODAY }).indexOf('공고 상태 기록') < 0);
  const p = dash.periodHtml('3', 'hb-per', '국민은행이 맡은 기관 입찰 기간');
  assert.ok(p.indexOf('name="hb-per"') >= 0 && p.indexOf('국민은행이 맡은 기관 입찰 기간') >= 0 && p.indexOf('value="3" checked') >= 0);
});

test('탭: tabsHtml(aria·roving tabindex), visibleKeys 탭별(ov = 경과만, up = 공고+기간 창, true = 옛 호출)', function () {
  const h = dash.tabsHtml('ov', 42, 9);
  assert.ok(h.indexOf('id="db-tab-ov"') >= 0 && h.indexOf('aria-selected="true"') >= 0 && h.indexOf('aria-controls="db-scroll"') >= 0);
  assert.ok(/id="db-tab-up"[^>]*aria-selected="false"[^>]*tabindex="-1"/.test(h) && /id="db-tab-ov"[^>]*tabindex="0"/.test(h));
  const m = dash.model(oursList().concat([rec('다른', 300)]), TODAY);
  const names = function (k) { return k.sort(); };
  assert.deepStrictEqual(names(dash.visibleKeys(m, '6', {}, 'ov')), ['11|경과']);
  assert.deepStrictEqual(names(dash.visibleKeys(m, '6', {}, 'up')), ['11|공고', '11|임박']);
  assert.deepStrictEqual(names(dash.visibleKeys(m, '6', {}, true)), ['11|경과', '11|공고', '11|임박']);
});

// ── store·마크업·배선·CSS ──────────────────────────────────────────
test('store.loadHbWindow/saveHbWindow: 허용 목록만, 공고 현황 기간(tbd.dashWindow)과 따로 저장', function () {
  const data = {};
  const fake = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
  try {
    assert.strictEqual(store.loadHbWindow(), '6');
    assert.strictEqual(store.saveHbWindow('all'), true);
    assert.strictEqual(store.loadHbWindow(), 'all');
    assert.strictEqual(store.loadDashWindow(), '6');                       // 서로 끌려가지 않는다
    assert.strictEqual(data['tbd.hbWindow'], JSON.stringify('all'));
    assert.strictEqual(store.saveHbWindow('7'), false);
  } finally { if (prev) Object.defineProperty(globalThis, 'localStorage', prev); else delete globalThis.localStorage; }
});

test('index.html: #notice-root 한 개, kbboard.js는 dashboard.js 뒤·app.js 앞, CSS 블록(새 hex·11px 미만·채운 버튼 없음)', function () {
  const html = src('index.html');
  assert.ok(/<div id="notice-root" style="display:none;"><\/div>/.test(html));
  assert.strictEqual(html.split('id="notice-root"').length, 2);
  const at = function (s) { return html.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('kbboard.js') > at('dashboard.js') && at('kbboard.js') > at('prep.js') && at('kbboard.js') < at('app.js'));
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g), null);
  (css.match(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g) || []).forEach(function (s) { assert.ok(Number(/(\d+)px/.exec(s)[1]) >= 11, s); });
  assert.ok(/\.hb-list \{[^}]*clamp\(300px, calc\(100vh - 480px\), 640px\)/.test(css));
  // 11-17 요약 띠(와플·단계)는 맨 위: 머리·오류 배너 다음, 알림 줄·두 목록 앞. 목록과 같은 열 비율, 셋째 칸 규칙은 없다
  const k0 = src('js/kbboard.js');
  assert.ok(k0.indexOf('id="hb-err"') < k0.indexOf('id="hb-cards"') && k0.indexOf('id="hb-cards"') < k0.indexOf('id="hb-alert"') && k0.indexOf('id="hb-alert"') < k0.indexOf('class="hb-grid"'));
  assert.ok(/\.hb-cards \{[^}]*grid-template-columns:minmax\(0, 1\.35fr\) minmax\(0, 1fr\)/.test(css) && !/\.hb-cards \{[^}]*grid-column/.test(css) && !/\.hb-cards[^{]*\{[^}]*380px/.test(css));
  assert.ok(/@media \(max-width:1279px\) \{ \.kb-card \.kb-body \{ grid-template-columns:1fr;/.test(css));
  assert.ok(/@media \(max-width:1279px\) \{[^@]*\.kb-card \.db-h \.fig \{ margin-left:0; \}/.test(css));   // 좁은 폭에서 머리 줄 숫자가 둘째 줄 오른쪽 끝에 홀로 붙지 않게
  assert.ok(/\.hb-row\[aria-disabled=true\][^{]*\{[^}]*color:var\(--muted\)/.test(css) && !/opacity/.test(css));   // opacity 대신 muted(DESIGN)
  assert.ok(/\.hb-slot\.hb-leaves \{[^}]*var\(--red\)/.test(css));
  assert.ok(/\.hb-list:focus:not\(:focus-visible\) \{ outline:none; \}/.test(css) && !/\.hb-list:focus \{/.test(css));   // 키보드 포커스 링은 살린다(design P3-a)
  assert.ok(!/background:var\(--(accent-color|red|fg)\)\s*;/.test(css));
});

test('배선: 감사 화면 이름(bid_board·bid_notice·map_popover)·현황판 팝업 fallback·kbboard 문구에 우리 없음', function () {
  const k = src('js/kbboard.js'), d = src('js/dashboard.js');
  assert.ok(k.indexOf("screen: 'bid_board', fallback: '#hb-ours'") > 0);
  assert.ok(d.indexOf("dash.postConfirm(id, 'bid_notice')") > 0 && d.indexOf("dash.postConfirm(id, m.screen)") > 0);
  assert.ok(d.indexOf("screen: (opts && opts.screen) || 'map_popover'") > 0);
  assert.strictEqual((k.replace(/\/\/[^\n]*/g, '').match(/'[^'\n]*우리[^'\n]*'/g) || []).length, 0);   // 주석 밖 문자열에 '우리' 없음
  assert.ok(k.indexOf('국민은행 금고 기관') < 0);                                                        // 문구는 '국민은행이 맡은 기관'
  const app = src('js/app.js');
  assert.ok(app.indexOf('root.kbboard.mount(dashEl)') > 0 && app.indexOf('root.dashboard.mount(noticeEl)') > 0 && app.indexOf('app.findNavItem = findNavItem') > 0);
  assert.ok(/flushOverdue\(\);\s*\/\/ 현황판이 열린 '뒤에'/.test(app));
  // qa 11-16 후속: 못 열면 안내, 팝업 닫은 뒤·selectKey 뒤 포커스 복원, selectKey는 걸러지면 조건을 지운다
  assert.ok(/function openNotice\(key\)[\s\S]*?flash\('입찰 공고 현황을 열 수 없습니다\./.test(k) && k.indexOf("openNotice('')") > 0 && k.indexOf('goNotice(btn') < 0);
  assert.ok(/keepKey[\s\S]*?\.hb-row[\s\S]*?\.focus\(\)/.test(k));
  assert.ok(/dash\.selectKey = [\s\S]*?st\.q = ''; st\.region = ''; st\.type = ''; fillFilters\(\);[\s\S]*?select\(key, lb\)/.test(d));
  assert.ok(d.indexOf('UNKNOWN으로 남는다') < 0);                                                                // 낡은 이관 주석 정리
  assert.ok(app.indexOf("document.getElementById('plans-root')") > 0 && app.indexOf('root.plans.mount(plansEl)') > 0);   // plans 줄 보존
});
