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
  // 구획 머리: 큰 숫자 줄 + 종류별 내역(design 11-17 6-B) — '협약 예정'은 2027년부터 묶음 이름과 같다
  assert.strictEqual(kbb.figHtml(c, 2), '<span><b>4</b>곳</span><span>종료 1년 안 <b>2</b>곳</span>');
  assert.strictEqual(kbb.figHtml(c), '<span><b>4</b>곳</span>');
  assert.strictEqual(kbb.breakdownHtml(c), '1금고 <b>1</b> · 2금고 <b>1</b> · 공탁금 <b>1</b> · 주거래 <b>1</b> · 협약 예정 <b>1</b>');
  assert.strictEqual(kbb.breakdownHtml(kbb.summary(kbb.ours(list.slice(0, 2), V), V)), '1금고 <b>1</b> · 2금고 <b>1</b>');
  const VL = [{ key: '43|청주', name: '청주', slot: 2, leaves: '2027', next: '2027~2030은 다른 은행' }];
  const cj = { name: '청주', region: '43', type: '지자체' };
  assert.strictEqual(kbb.leavesText(cj, VL), '2027년부터 다른 은행');
  assert.strictEqual(kbb.leavesText(list[0], V), '');
  assert.strictEqual(kbb.leavesText(null, VL), '');
});

test('각주(design 11-17 6-A): 출처 한 줄 + [세는 기준] 펼침, 본문은 모두 켬 문장 그대로, 법원·공공기관을 끄면 그 부분을 빼고 끝에 아직 세지 않는다는 말', function () {
  const on = kbb.footHtml(undefined, 7);
  const SRC = '<span class="hb-src">지자체 출처: <a href="https://www.lofin365.go.kr/portal/LF8310000.do?curPage=1&amp;ntcaClsDvCd=FSL409" target="_blank" rel="noopener noreferrer">' +
    '행안부 금고지정 현황(2026.1.1. 기준)<span class="sr-only">, 새 탭</span></a> <span class="db-why">(인터넷 PC에서 열림)</span></span>';
  assert.strictEqual(on, '지자체는 1·2금고, 법원은 공탁금 보관은행, 공공기관은 주거래은행 칸으로 셉니다. ' +
    '협약 예정(2027년부터)은 지정 결과 공고·기사로 확인한 곳입니다. 은행 칸이 빈 법원·공공기관 <b>7</b>곳은 세지 않았습니다. ' +
    '협약 종료일: 지자체는 행안부 금고지정 현황의 약정 끝날, 법원·공공기관은 기관 자료의 약정 만료일이며 없으면 \'종료일 미상\'입니다.');
  assert.ok(on.indexOf('우리') < 0 && on.indexOf('hb-src') < 0);                  // 출처 줄은 본문 밖
  assert.ok(on.indexOf('직접 입력') < 0);                                          // 현황판은 직접 입력 약정을 아직 받지 않는다(qa P1-1·design P2-2)
  const box = kbb.footBoxHtml(undefined, 7);
  assert.strictEqual(box, SRC + '<details><summary>세는 기준</summary><p>' + on + '</p></details>');
  const off = kbb.footHtml({ muni: true, next: false, court: false, public: false }, 7);
  assert.strictEqual(off, '지자체는 1·2금고만 셉니다. 법원·공공기관은 아직 세지 않습니다. 협약 종료일: 지자체는 행안부 금고지정 현황의 약정 끝날입니다.');
  // 지자체를 세지 않으면 지자체 문장과 출처 줄이 둘 다 없다
  const nm = kbb.footHtml({ muni: false, next: false, court: true, public: true }, 7);
  assert.ok(nm.indexOf('금고지정') < 0 && nm.indexOf('지자체') < 0 && nm.indexOf('협약 종료일: 법원·공공기관은 기관 자료의 약정 만료일이며 없으면 \'종료일 미상\'입니다.') >= 0 && nm.indexOf('직접 입력') < 0);
  assert.ok(kbb.footBoxHtml({ muni: false, next: false, court: true, public: true }, 7).indexOf('hb-src') < 0);
  // 주소가 비면 링크와 안내 없이 글자만
  const keep = kbb.LOFIN_FSL409_URL; kbb.LOFIN_FSL409_URL = '';
  const bare = kbb.footBoxHtml({ muni: true, next: false, court: false, public: false }, 0);
  kbb.LOFIN_FSL409_URL = keep;
  assert.ok(bare.indexOf('<span class="hb-src">지자체 출처: 행안부 금고지정 현황(2026.1.1. 기준)</span><details>') === 0 && bare.indexOf('<a ') < 0 && bare.indexOf('인터넷 PC') < 0);
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
// 협약 종료일(사용자 11-17): 지자체는 행안부 LOFIN 줄 end, 법원·공공기관은 contractExpiry. TODAY = 2026-11-16.
const LF = { asof: '2026-01-01', rows: {
  '11|공고': [{ bank: '국민은행', rank: 'RANK1', slot: 1, accts: ['일반회계'], start: '2023-01-01', end: '2026-12-31' }],
  '11|경과': [{ bank: '국민은행', rank: 'RANK1', slot: 1, accts: ['일반회계'], start: '2022-01-01', end: '2026-11-10' }],
  '11|임박': [{ bank: '농협은행', rank: 'RANK1', slot: 1, accts: ['일반회계'], end: '2027-12-31' }, { bank: '국민은행', rank: 'RANK2', slot: 2, accts: ['기금'], end: '2027-06-30' }],
  '11|먼': [{ bank: '국민은행', rank: 'SINGLE', slot: 1, accts: ['일반회계'], end: '2029-12-31' }],
  '11|새곳': [{ bank: '국민은행', rank: 'RANK1', slot: 1, accts: ['일반회계'], end: '2030-12-31' }] } };
test('contractEnd·normDate: 지자체 = 직접 입력 > 행안부 국민은행 줄(없으면 일반회계 줄), 법원·공공기관 = contractExpiry, 못 읽으면 미상', function () {
  assert.strictEqual(kbb.normDate('2026'), '2026-12-31');
  assert.strictEqual(kbb.normDate('2028-02'), '2028-02-29');
  assert.strictEqual(kbb.normDate('2026-12-31'), '2026-12-31');
  ['', null, undefined, '2026-13-01', '2026-02-30', 'abc', '2026-1-1'].forEach(function (x) { assert.strictEqual(kbb.normDate(x), '', String(x)); });
  const o = { lofin: LF, today: TODAY };
  assert.deepStrictEqual(kbb.contractEnd(rec('공고', 5), o), { date: '2026-12-31', src: 'lofin' });
  assert.deepStrictEqual(kbb.contractEnd(rec('임박', 5), o), { date: '2027-06-30', src: 'lofin' });   // 국민은행 줄이 우선(농협 줄 아님)
  assert.deepStrictEqual(kbb.contractEnd(rec('공고', 5), { lofin: LF, today: TODAY, direct: { '11|공고': '2031-12-31' } }), { date: '2031-12-31', src: 'direct' });
  assert.deepStrictEqual(kbb.contractEnd(rec('공고', 5), { lofin: LF, today: TODAY, direct: { '11|공고': '엉터리' } }), { date: '2026-12-31', src: 'lofin' });   // 못 읽는 직접 입력은 건너뛴다
  assert.deepStrictEqual(kbb.contractEnd(rec('없음', 5), o), { date: '', src: '' });                    // 행안부 줄 없음
  assert.deepStrictEqual(kbb.contractEnd(rec('공고', 5), { today: TODAY }), { date: '', src: '' });       // lofin 자료 없음
  const noKb = { rows: { '11|일반': [{ bank: '농협은행', accts: ['기금'], end: '2028-12-31' }, { bank: '신한은행', accts: ['일반회계'], end: '2027-12-31' }] } };
  assert.deepStrictEqual(kbb.contractEnd(rec('일반', 5), { lofin: noKb, today: TODAY }), { date: '2027-12-31', src: 'lofin' });   // 국민은행 줄이 없으면 일반회계 줄
  const court = { name: '법원', region: '11', type: '법원', bank: '국민은행', contractExpiry: '2028-12-31' };
  assert.deepStrictEqual(kbb.contractEnd(court, o), { date: '2028-12-31', src: 'expiry' });
  assert.deepStrictEqual(kbb.contractEnd(Object.assign({}, court, { contractExpiry: '2027' }), o), { date: '2027-12-31', src: 'expiry' });
  assert.deepStrictEqual(kbb.contractEnd(Object.assign({}, court, { contractExpiry: '' }), o), { date: '', src: '' });
  assert.deepStrictEqual(kbb.contractEnd(null, o), { date: '', src: '' });
});

test('groups(협약 종료일 순): 종료 1년 안(지난 곳 먼저 → 가까운 순) · 종료 1년 뒤 · 종료일 미상 · 협약 예정(2027년부터)', function () {
  const court = { name: '법원', region: '11', type: '법원', bank: '국민은행' };            // contractExpiry 없음 → 미상
  const pub = { name: '공기관', region: '11', type: '공공기관', bank: '국민은행', contractExpiry: '2030-12-31' };   // 1년 뒤
  const ours = kbb.ours(oursList().concat([rec('새곳', 20), court, pub]), V, undefined, NX);
  const g = kbb.groups(ours, TODAY, V, NX, { lofin: LF });
  const nm = function (a) { return a.map(function (i) { return i.name; }); };
  // 경과(2026-11-10 종료) → 공고(2026-12-31, D-45) → 임박(2027-06-30, D-226). 1년 경계는 365일 이하
  assert.deepStrictEqual(nm(g.soon), ['경과', '공고', '임박']);
  assert.deepStrictEqual(g.soon.map(function (i) { return i.endDays; }), [-6, 45, 226]);
  assert.strictEqual(g.pastN, 1);
  assert.deepStrictEqual(nm(g.later), ['먼', '공기관']);                                       // D 가까운 순(2029 → 2030)
  assert.deepStrictEqual(nm(g.unk), ['미상', '법원']);                                          // 미상(종료일 없는 지자체) → 이름순
  assert.deepStrictEqual(nm(g.next), ['새곳']);                                                  // 협약 예정은 앞 세 묶음에 들지 않는다(행안부 종료일이 있어도)
  assert.strictEqual(g.soon[0].endDate, '2026-11-10');
  assert.strictEqual(g.soon.length + g.later.length + g.unk.length + g.next.length, ours.length);   // 어느 묶음에도 빠지거나 겹치는 기관이 없다
  assert.strictEqual(kbb.groups(kbb.ours(oursList(), V), TODAY, V, undefined, { lofin: LF }).next.length, 0);
  // 365일 경계: 2027-11-16 종료 = D-365(안), 2027-11-17 = D-366(뒤)
  const LB = { rows: { '11|공고': [{ bank: '국민은행', accts: ['일반회계'], end: '2027-11-16' }], '11|먼': [{ bank: '국민은행', accts: ['일반회계'], end: '2027-11-17' }] } };
  const gb = kbb.groups(kbb.ours([rec('공고', 5), rec('먼', 5)], V), TODAY, V, undefined, { lofin: LB });
  assert.deepStrictEqual([nm(gb.soon), nm(gb.later)], [['공고'], ['먼']]);
  // 같은 날 종료면 이름순
  const LS = { rows: { '11|공고': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }], '11|경과': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }] } };
  assert.deepStrictEqual(nm(kbb.groups(kbb.ours([rec('공고', 5), rec('경과', 5)], V), TODAY, V, undefined, { lofin: LS }).soon), ['경과', '공고']);
  assert.strictEqual(kbb.soonLabel(8, 0), '종료 1년 안 <b>8</b>곳');
  assert.strictEqual(kbb.soonLabel(9, 1), '종료 1년 안 <b>9</b>곳 · 종료일 지난 곳 <b>1</b> 포함');
  assert.strictEqual(kbb.laterLabel(8), '종료 1년 뒤 <b>8</b>곳');
  assert.strictEqual(kbb.unkLabel(11), '종료일 미상 <b>11</b>곳');
  assert.strictEqual(kbb.nextLabel(6), '협약 예정(2027년부터) <b>6</b>곳');
  assert.strictEqual(kbb.OURS_EMPTY, '협약 중인 기관이 없습니다.');
});

test('groups 실제 자료: 종료 1년 안은 2026-12-31 종료 곳(8곳 이상), 협약 예정은 KB_NEXT 6곳, 미상은 약정 만료일 없는 법원·공공기관뿐', function () {
  const vm = require('vm');
  const load = function (rel, name) {
    const sb = { window: {} };
    vm.createContext(sb);
    vm.runInContext(src(rel), sb);
    return JSON.parse(JSON.stringify(sb.window[name]));
  };
  require('../data/kb-verified.js');
  const KN = globalThis.KB_NEXT, KV = globalThis.KB_VERIFIED, LO = require('../data/lofin-2026.js');
  const list = load('data/institutions.js', 'institutions').concat(require('../data/institutions_nonmuni.js'));
  const ours = kbb.ours(list, KV, undefined, KN);
  const g = kbb.groups(ours, TODAY, KV, KN, { lofin: LO });
  assert.strictEqual(g.soon.length + g.later.length + g.unk.length + g.next.length, ours.length);
  assert.strictEqual(g.next.length, KN.length);
  const dec = g.soon.filter(function (i) { return i.endDate === '2026-12-31'; });
  assert.ok(dec.length >= 8 && dec.every(function (i) { return i.endDays === 45; }), '2026-12-31 종료 ' + dec.length);
  ['광진구청', '동대문구청', '도봉구청', '노원구청', '동작구청', '하남시청', '청주시청'].forEach(function (n) {
    assert.ok(g.soon.some(function (i) { return i.name === n; }), n);
  });
  assert.ok(g.soon.every(function (i) { return i.endDays <= 365; }) && g.later.every(function (i) { return i.endDays > 365; }));
  assert.ok(g.soon.every(function (it, i, a) { return !i || a[i - 1].endDays <= it.endDays; }));          // 정렬
  assert.ok(g.unk.every(function (i) { return !i.rec.contractExpiry || !kbb.normDate(i.rec.contractExpiry); }));
  assert.ok(g.unk.every(function (i) { return dash.kindOfRec(i.rec) !== '지자체' || !kbb.contractEnd(i.rec, { lofin: LO, today: TODAY }).date; }));
});

test('지도 ▲ 합 = 공고 현황 6개월 수(같은 계산 유지) — 금고 기관 묶음도 같은 항목을 쓴다', function () {
  const list = [rec('a', 0), rec('b', 30), rec('c', 182), rec('d', 183), rec('e', 400), rec('f', -3), rec('g', null), rec('h', -10, { confirmed: true })];
  const deduped = logic.dedupeByInstitution(list);
  const map = logic.regionMix(deduped, TODAY).urgent;
  const m = dash.model(list, TODAY);
  assert.strictEqual(dash.windowItems(m, '6').length, map);
  assert.strictEqual(m.upcoming.filter(function (u) { return u.days <= dash.URGENT_DAYS; }).length, map);
});

function grp(list, verified, nextList) { return kbb.groups(kbb.ours(list, verified, undefined, nextList), TODAY, verified, nextList, { lofin: LF }); }

test('rowHtml(11-17 최종형): 이름 칩 → 종료 D-n(크게) → 둘째 줄 다음 입찰 공고(확정/추정) → 회차 소식, 이스케이프·청주 배지', function () {
  const V2 = [{ key: '11|<b>가', name: '<b>가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  const LF2 = { rows: { '11|<b>가': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }] } };
  const it = kbb.groups(kbb.ours([rec('<b>가', 30)], V2), TODAY, V2, undefined, { lofin: LF2 }).soon[0];
  const h = kbb.rowHtml(it, { verified: V2, prepActive: true });
  assert.ok(h.indexOf('<button type="button" class="hb-row"') >= 0 && h.indexOf('aria-haspopup="dialog"') >= 0);
  assert.ok(h.indexOf('<b>가') < 0 && h.indexOf('&lt;b&gt;가') >= 0);
  assert.ok(h.indexOf('<span class="hb-slot">1금고</span>') >= 0 && h.indexOf('사전준비 중') >= 0 && h.indexOf('hb-leaves') < 0);
  // 종료 D-45: 183일 이하라 urgent, '협약'은 화면 읽기용
  assert.ok(h.indexOf('<span class="hb-end urgent"><span class="l"><span class="sr-only">협약 </span>종료</span><b>D-45</b></span>') >= 0);
  // 둘째 줄: 지역 · 다음 입찰 공고(예정일 = effectiveBid, 추정). 옛 'D-30' 입찰 칩(dg-day)은 없다
  assert.ok(/<span class="meta">[^<]*· 다음 입찰 공고 <span class="d">\d{4}-\d{2}-\d{2}<\/span> 추정/.test(h) && h.indexOf('dg-day') < 0);
  assert.ok(h.indexOf('회차 소식: 2026 회차 국민은행 수성(기사 2026-11-04)') >= 0 && h.indexOf('확정</span>') < 0);
  assert.ok(h.indexOf('<span class="hb-slot hb-stay">다음도 국민은행</span>') >= 0);            // 회차 소식이 수성 → 칩
  assert.ok(h.indexOf('hb-leaves') < 0);
  assert.ok(h.indexOf('<span class="hb-end') < h.indexOf('<span class="meta">'));              // 줄 순서: 이름 → 종료 → 메타
  kbb.SHOW_NEWS = false;
  try { assert.ok(kbb.rowHtml(it, { verified: V2 }).indexOf('회차 소식') < 0); } finally { kbb.SHOW_NEWS = true; }
  // 청주: 현재 금고 칩 옆에 '다음은 다른 은행'(읽기용 '(2027년부터)') — '다음도 국민은행' 칩은 안 붙는다
  const VL = [{ key: '43|청주시청', name: '청주시청', slot: 2, leaves: '2027', next: '2027~2030은 1금고 농협·2금고 신한 — 국민은행 빠짐' }];
  const cj = grp([rec('청주시청', 40, { region: '43' })], VL).unk[0];
  const hc = kbb.rowHtml(cj, { verified: VL });
  assert.ok(hc.indexOf('<span class="hb-slot">2금고(일부 회계)</span><span class="hb-slot hb-leaves">다음은 다른 은행<span class="sr-only">(2027년부터)</span></span>') >= 0);
  assert.ok(hc.indexOf('회차 소식: 2027~2030은 1금고 농협') >= 0 && hc.indexOf('hb-stay') < 0);
  // 협약 예정(2027년부터) 줄: 칩 '2027년부터', 종료 D-n 없음, 둘째 줄 '지역 · 종류', 소식 줄은 자료의 quote
  const nit = grp([rec('새곳', 30)], [], NX).next[0];
  const hn = kbb.rowHtml(nit, { verified: [], nextList: NX });
  assert.ok(hn.indexOf('<span class="hb-slot">2027년부터</span>') >= 0 && hn.indexOf('hb-leaves') < 0 && hn.indexOf('hb-end') < 0);
  assert.ok(/<span class="meta">[^<]*· 지자체<\/span>/.test(hn) && hn.indexOf('다음 입찰 공고') < 0);
  assert.ok(hn.indexOf('회차 소식: 국민은행 선정(타행에서 이동), 약정 2027~2030') >= 0);
});

test('staysText: 회차 소식에 수성·재선정·유지가 있고 다른 은행으로 가지 않는 곳만 \'다음도 국민은행\'', function () {
  const mk = function (extra) { return [Object.assign({ key: '11|가', name: '가', slot: 1 }, extra)]; };
  const r = rec('가', 5);
  assert.strictEqual(kbb.staysText(r, mk({ next: '2026 회차 국민은행 수성(기사 2026-11-04)' })), '다음도 국민은행');
  assert.strictEqual(kbb.staysText(r, mk({ next: 'KB국민 재선정 · 약정 2027-01-01~2030-12-31(2026-10-21 체결)' })), '다음도 국민은행');
  assert.strictEqual(kbb.staysText(r, mk({ next: '부금고 국민은행 유지 · 약정 2027-01-01~2030-12-31' })), '다음도 국민은행');
  assert.strictEqual(kbb.staysText(r, mk({ next: '2026 회차 결과 공고 2026-11-05(선정 은행 미확인)' })), '');
  assert.strictEqual(kbb.staysText(r, mk({})), '');
  assert.strictEqual(kbb.staysText(r, mk({ leaves: '2027', next: '국민은행 수성 아님' })), '');          // 떠나는 곳은 짝 칩만
  assert.strictEqual(kbb.staysText(null, mk({ next: '수성' })), '');
  // qa 11-17 P3-3: 국민 언급이 있어야 하고, 실패·미정·미확인이면 아니다
  assert.strictEqual(kbb.staysText(r, mk({ next: '일반회계 부산은행 유지' })), '');
  assert.strictEqual(kbb.staysText(r, mk({ next: '국민은행 수성 실패' })), '');
  assert.strictEqual(kbb.staysText(r, mk({ next: 'KB 재선정 여부 미정' })), '');
  assert.strictEqual(kbb.staysText(r, mk({ next: 'KB 재선정(2026-10-21 체결)' })), '다음도 국민은행');
});

test('inProgress·findOpener(qa 11-17): 진행 목록 전체로 판정, 닫은 뒤 같은 열의 같은 data-key(+data-act) 요소', function () {
  // /preps 에 없어도 overview 의 미완료·실행 중 기관이면 진행 중(신규 유치 줄이 [제안 확정]으로 보이지 않게)
  const ov = [{ institution_id: 7, state: 'WRITING', done: false }, { institution_id: 8, state: 'NONE' }];
  assert.strictEqual(kbb.inProgress({ institutionId: 7 }, [], ov), true);
  assert.strictEqual(kbb.inProgress({ institutionId: 8 }, [], ov), false);
  assert.strictEqual(kbb.inProgress({ institutionId: 7 }, null, null), false);
  assert.strictEqual(kbb.inProgress({}, [], ov), false);
  const mkB = function (key, act) { return { getAttribute: function (n) { return n === 'data-key' ? key : (n === 'data-act' ? act : null); } }; };
  const row = mkB('11|가', ''), cf = mkB('11|가', 'confirm'), other = mkB('11|나', '');
  const sc = { querySelectorAll: function () { return [row, cf, other]; } };
  assert.strictEqual(kbb.findOpener(sc, '11|가', 'confirm'), cf);
  assert.strictEqual(kbb.findOpener(sc, '11|가', ''), row);
  const gone = { querySelectorAll: function () { return [row, other]; } };       // [제안 확정]이 배지로 바뀌어 사라졌으면 같은 key의 행 버튼
  assert.strictEqual(kbb.findOpener(gone, '11|가', 'confirm'), row);
  assert.strictEqual(kbb.findOpener(gone, '11|없음', ''), null);
  assert.strictEqual(kbb.findOpener(null, '11|가', ''), null);
});

test('endHtml: 종료 D-n 색(183일 이하 urgent · 365일 이하 soon · 그 뒤 색 없음), 종료일 지남(D+n 도장), 종료일 미상', function () {
  const e = function (n) { return kbb.endHtml({ endDays: n }); };
  assert.strictEqual(e(45), '<span class="hb-end urgent"><span class="l"><span class="sr-only">협약 </span>종료</span><b>D-45</b></span>');
  assert.ok(e(183).indexOf('hb-end urgent') >= 0 && e(184).indexOf('hb-end soon') >= 0);
  assert.ok(e(365).indexOf('hb-end soon') >= 0 && e(366).indexOf('<span class="hb-end">') === 0);
  assert.ok(e(0).indexOf('<b>D-day</b>') >= 0 && e(0).indexOf('hb-end urgent') >= 0);
  assert.strictEqual(e(-3), '<span class="hb-end over"><span class="l">종료일 지남</span><span class="ov-stamp">D+3</span></span>');
  assert.strictEqual(kbb.endHtml({ endDays: null }), '<span class="hb-end unk">종료일 미상</span>');
  assert.strictEqual(kbb.endHtml({}), '<span class="hb-end unk">종료일 미상</span>');
  // 종료일이 지난 줄은 둘째 줄 끝에 새 협약 기간 확인 필요
  const it = grp([rec('경과', -5)], V).soon[0];
  assert.ok(kbb.rowHtml(it, { verified: V }).indexOf('class="hb-end over"') >= 0 && kbb.rowHtml(it, { verified: V }).indexOf(' · 새 협약 기간 확인 필요') >= 0);
  assert.ok(kbb.rowHtml(grp([rec('먼', 250)], V).later[0], { verified: V }).indexOf('새 협약 기간') < 0);
});

test('metaHtml(rowHtml 둘째 줄): 공고 진행 중 · 마감 D-n / 예정일 n일 지남 · 공고 확인 필요 / 예정일 미상', function () {
  const LA = { rows: { '11|공고': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }], '11|경과': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }],
    '11|미상': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }] } };
  const g = kbb.groups(kbb.ours([rec('공고', -3, { confirmed: true, receiveTo: plus(7) }), rec('경과', -5), rec('미상', null)], V), TODAY, V, undefined, { lofin: LA });
  const html = function (n) { return kbb.rowHtml(g.soon.filter(function (i) { return i.name === n; })[0], { verified: V }); };
  assert.ok(html('공고').indexOf('입찰 공고 진행 중 · 마감 <span class="d">D-7</span>') >= 0);
  assert.ok(html('경과').indexOf('다음 입찰 공고 예정일 5일 지남 · 공고 확인 필요') >= 0);
  assert.ok(html('미상').indexOf('다음 입찰 공고 예정일 미상') >= 0);
});

// ── 입찰 공고가 뜬 대상(2번 구획) ────────────────────────────────────
function noticeFix() {
  // 가·나·다 = 공고 진행 중. 가 = 협약 중인 기관, 나 = 제안 확정한 다른 은행 기관(신규 유치), 다 = 협약도 제안도 아님, 라 = 협약 예정(2027년부터) + 제안 확정
  const mk = function (x, i, extra) { return rec(x, -(10 + i), Object.assign({ confirmed: true, receiveTo: plus(3 + i), institutionId: 'I' + x }, extra || {})); };
  const list = [mk('가', 0), mk('나', 1), mk('다', 2), mk('라', 3, { receiveTo: null })];
  const notice = dash.model(list, TODAY).notice;
  return { list: list, notice: notice };
}
test('noticeModel: 협약 중인 기관의 공고 + 제안 확정·준비 중 기관의 공고(신규 유치), 그 밖은 링크로 / 협약 예정 기관도 제안 중이면 신규 유치', function () {
  const f = noticeFix();
  assert.strictEqual(f.notice.length, 4);
  const nm = kbb.noticeModel(f.notice, { '11|가': true }, { In: true, 'I나': true, 'I라': true }, 'ok');
  assert.deepStrictEqual(nm.keep.map(function (i) { return i.name; }), ['가']);
  assert.deepStrictEqual(nm.win.map(function (i) { return i.name; }), ['나', '라']);               // 가는 협약 쪽에만(한 번), 다는 어디에도 없다
  assert.strictEqual(nm.total, 3); assert.strictEqual(nm.n, 4); assert.strictEqual(nm.winState, 'ok');
  assert.strictEqual(nm.recvN, 2);                                                                  // 가·나는 마감일을 알고 접수 중, 라는 마감일 미확인
  assert.strictEqual(kbb.noticeFigHtml(nm), '<span><b>3</b>곳</span><span>접수 마감 전 <b>2</b>곳</span>');
  assert.strictEqual(kbb.noticeBrkHtml(nm), '협약 중인 기관 <b>1</b> · 신규 유치 <b>2</b>');
  assert.strictEqual(kbb.noticeLinkHtml(nm), '<span>전국 공고 진행 중 <b>4</b>곳</span><button type="button" id="hb-to-notice">입찰 공고 현황에서 보기</button>');
  // 서버 없음·권한 밖·받는 중·오류: 신규 유치는 알 수 없다(협약 쪽은 내장 자료로 계속)
  const off = kbb.noticeModel(f.notice, { '11|가': true }, { 'I나': true }, 'offline');
  assert.deepStrictEqual([off.keep.length, off.win.length, off.winState], [1, 0, 'offline']);
  assert.strictEqual(kbb.noticeBrkHtml(off), '협약 중인 기관 <b>1</b> · 신규 유치 <b>-</b>');
  assert.strictEqual(kbb.noticeModel([], {}, {}, 'ok').total, 0);
  assert.strictEqual(kbb.noticeModel(null, null, null).n, 0);
});

test('noticeBodyHtml: 두 묶음 제목(\'수성\' 없음)·빈 상태 문구·서버 없음 문구·ul aria-labelledby', function () {
  const f = noticeFix();
  const row = function (it) { return '<li>' + it.name + '</li>'; };
  const two = kbb.noticeBodyHtml(kbb.noticeModel(f.notice, { '11|가': true }, { 'I나': true }, 'ok'), row);
  assert.ok(two.indexOf('<div class="db-grp" id="hb-g-keep">협약 중인 기관 <b>1</b>곳</div><ul aria-labelledby="hb-g-keep"><li>가</li></ul>') >= 0);
  assert.ok(two.indexOf('<div class="db-grp" id="hb-g-win">신규 유치 · 제안 확정·준비 중 <b>1</b>곳</div><ul aria-labelledby="hb-g-win"><li>나</li></ul>') >= 0);
  assert.ok(two.indexOf('수성') < 0);
  // 둘 다 비면 한 문장(오늘 데이터의 상태)
  const none = kbb.noticeBodyHtml(kbb.noticeModel(f.notice, {}, {}, 'ok'), row);
  assert.strictEqual(none, '<p class="db-state">지금 공고가 난 협약 중인 기관이나 제안 중인 기관이 없습니다. 그 밖의 공고는 위 [입찰 공고 현황에서 보기]에서 봅니다.</p>');
  // 한쪽만 비면 그 묶음 제목은 0곳 + 한 줄
  const keepOnly = kbb.noticeBodyHtml(kbb.noticeModel(f.notice, { '11|가': true }, {}, 'ok'), row);
  assert.ok(keepOnly.indexOf('신규 유치 · 제안 확정·준비 중 <b>0</b>곳</div><p class="hb-none">공고가 난 제안 진행 기관이 없습니다.</p>') >= 0);
  const winOnly = kbb.noticeBodyHtml(kbb.noticeModel(f.notice, {}, { 'I나': true }, 'ok'), row);
  assert.ok(winOnly.indexOf('협약 중인 기관 <b>0</b>곳</div><p class="hb-none">공고가 난 협약 중인 기관이 없습니다.</p>') >= 0 && winOnly.indexOf('<li>나</li>') >= 0);
  // 서버 없음·권한 밖: 신규 유치 자리에 안내, 협약 쪽은 그대로
  const off = kbb.noticeBodyHtml(kbb.noticeModel(f.notice, { '11|가': true }, {}, 'offline'), row);
  assert.ok(off.indexOf('<li>가</li>') >= 0 && off.indexOf('서버에 연결하면 제안 중인 기관의 공고도 보입니다.') >= 0 && off.indexOf('hb-g-win">신규 유치 · 제안 확정·준비 중</div>') >= 0);
  assert.ok(kbb.noticeBodyHtml(kbb.noticeModel(f.notice, {}, {}, 'denied'), row).indexOf('영업팀·영업팀장·영업부장에게 보입니다.') >= 0);
  assert.ok(kbb.noticeBodyHtml(kbb.noticeModel(f.notice, {}, {}, 'loading'), row).indexOf('불러오는 중입니다') >= 0);
  [two, none, off].forEach(function (h) { assert.ok(h.indexOf('우리') < 0); });
});

test('actHtml(동작 칸): open·confirm·wait·공고 끝남·접수 기간 지남·입찰 없음·공고 지연, unavailable·none은 비움', function () {
  const o = { name: '하남시청', key: '41|하남시청', badge: { cls: 'pp-ok', text: '확정됨' } };
  assert.strictEqual(kbb.actHtml('open', o), '<span class="wf-badge pp-ok">확정됨</span>');
  assert.ok(kbb.actHtml('open', {}).indexOf('사전준비 중') >= 0);
  const c = kbb.actHtml('confirm', o);
  assert.strictEqual(c, '<button type="button" class="hb-confirm" data-key="41|하남시청" data-act="confirm" aria-haspopup="dialog" aria-label="하남시청 제안 확정">제안 확정</button>');
  assert.strictEqual(kbb.actHtml('wait', o), '<span class="why">확인 중…</span>');
  assert.ok(kbb.actHtml('closed', o).indexOf('>공고 끝남</span>') >= 0 && kbb.actHtml('closed', o).indexOf('title="이번 회차 공고가 끝났습니다."') >= 0);
  assert.ok(kbb.actHtml('past', o).indexOf('>접수 기간 지남</span>') >= 0 && kbb.actHtml('past', o).indexOf('title="접수 기간이 지난 것으로 봅니다.') >= 0);
  assert.ok(kbb.actHtml('nobid', o).indexOf('>입찰 없음</span>') >= 0 && kbb.actHtml('delayed', o).indexOf('>공고 지연</span>') >= 0);
  ['unavailable', 'none', 'later', '', undefined].forEach(function (a) { assert.strictEqual(kbb.actHtml(a, o), '', String(a)); });
  const evil = kbb.actHtml('confirm', { name: '<img src=x onerror=1>', key: '"><b>' });
  assert.ok(evil.indexOf('<img') < 0 && evil.indexOf('"><b>') < 0);
});

test('noticeRowHtml: li.hb-li 안에 [행 버튼 | 동작 칸]을 형제로(버튼 안에 버튼 없음), 칩·[제안 확정]은 동작 칸', function () {
  const f = noticeFix();
  const it = f.notice[0];
  const h = kbb.noticeRowHtml(it, { verified: [{ key: '11|가', name: '가', slot: 2 }], act: 'confirm' });
  assert.ok(h.indexOf('<li class="hb-li"><button type="button" class="hb-row" data-key="11|가" aria-haspopup="dialog">') === 0);
  const btn = h.slice(h.indexOf('<button'), h.indexOf('</button>') + 9);
  assert.strictEqual((btn.match(/<button/g) || []).length, 1);                                   // 행 버튼 안에 버튼 없음
  assert.ok(btn.indexOf('hb-slot">2금고(일부 회계)</span>') >= 0 && btn.indexOf('hb-confirm') < 0 && btn.indexOf('db-chip') < 0);
  assert.ok(h.indexOf('<div class="hb-act"><span class="db-chip open">마감 D-') >= 0 && h.indexOf('data-act="confirm"') > h.indexOf('hb-act'));
  const wait = kbb.noticeRowHtml(it, { act: 'wait' });
  assert.ok(wait.indexOf('확인 중…') >= 0 && wait.indexOf('hb-confirm') < 0);
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
  // 입찰 공고 현황의 기간 버튼은 그대로(이름·범례를 바꿀 수 있는 인자도 유지) — 현황판만 11-17에 이 버튼을 없앴다
  const p = dash.periodHtml('3', 'x-per', '시험 범례');
  assert.ok(p.indexOf('name="x-per"') >= 0 && p.indexOf('시험 범례') >= 0 && p.indexOf('value="3" checked') >= 0);
  assert.ok(dash.periodHtml('3').indexOf('name="db-per"') >= 0 && dash.periodHtml('3').indexOf('입찰 예정일 기간') >= 0);
  assert.strictEqual(dash.windowItems(dash.model(oursList(), TODAY), '6').length, 1);          // 임박(D-30)만 — 먼(D-250)은 6개월 밖
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
test('store: 현황판 기간 저장(loadHbWindow·saveHbWindow)은 없어졌고, 입찰 공고 현황의 기간 저장(tbd.dashWindow)은 그대로', function () {
  assert.strictEqual(store.loadHbWindow, undefined);
  assert.strictEqual(store.saveHbWindow, undefined);
  const data = {};
  const fake = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
  try {
    assert.strictEqual(store.loadDashWindow(), '6');
    assert.strictEqual(store.saveDashWindow('all'), true);
    assert.strictEqual(store.loadDashWindow(), 'all');
    assert.strictEqual(store.saveDashWindow('7'), false);
    data['tbd.hbWindow'] = JSON.stringify('all');                           // 옛 키가 남아 있어도 읽지 않는다
    assert.strictEqual(store.loadDashWindow(), 'all');
  } finally { if (prev) Object.defineProperty(globalThis, 'localStorage', prev); else delete globalThis.localStorage; }
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('HbWindow') < 0 && k.indexOf('hb-per') < 0 && k.indexOf('periodHtml') < 0);   // 현황판 코드에 기간 버튼이 남지 않았다
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
  assert.deepStrictEqual((css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(function (h) { return h !== '#fff'; }), []);   // 새 hex 없음 — DESIGN 허용값 #fff만 예외(color-mix 흰색)
  assert.ok(!/,\s*white\)/.test(css));                                                                               // 'white' 글자 대신 #fff(design P3-1)
  (css.match(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g) || []).forEach(function (s) { assert.ok(Number(/(\d+)px/.exec(s)[1]) >= 11, s); });
  // 11-17 세 주제 3열(design 6-B): 열 폭 1.15fr 1fr 1fr·간격 16, 열 높이 clamp(440px, 100vh − 168px, 960px), 머리 min-height 212px
  assert.ok(/\.hb-cols \{[^}]*grid-template-columns:minmax\(0, 1\.15fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)[^}]*gap:16px/.test(css));
  assert.ok(/\.hb-col \{[^}]*height:clamp\(440px, calc\(100vh - 168px\), 960px\)/.test(css));
  assert.ok(/\.hb-sum \{[^}]*min-height:212px/.test(css));
  assert.ok(!/\.hb-list\b|\.hb-grid\b|\.hb-cards\b|\.kb-card\b|\.hb-alert\b|\.hb-chip\b/.test(css));          // 옛 두 열·요약 띠·알림 줄 규칙은 지웠다
  assert.ok(/@media \(max-width:1279px\) \{[^@]*\.hb-cols \{ grid-template-columns:minmax\(0, 1fr\) minmax\(0, 1fr\); \}[^@]*#hb-preps \{ grid-column:1 \/ -1;/.test(css));
  assert.ok(/@media \(max-width:880px\) \{[^@]*\.hb-cols \{ grid-template-columns:1fr; \}/.test(css));
  // 줄: 종료 D-n(크게 16px mono), 빨강·주황은 글자색만(채운 배경 없음), 종료일 미상은 muted, 행 이름 13px
  assert.ok(/\.hb-end b \{ font:700 16px\/1\.2 var\(--mono\)/.test(css) && /\.hb-end\.urgent b \{ color:color-mix\(in srgb, var\(--red\) 72%, #fff\)/.test(css) && /\.hb-end\.soon b \{ color:color-mix\(in srgb, var\(--orange\) 72%, #fff\)/.test(css));
  assert.ok(/\.hb-end\.unk \{[^}]*color:var\(--muted\)/.test(css) && /\.hb-row \.nm \{ font-size:13px;/.test(css));
  assert.ok(/\.hb-row \{[^}]*grid-template-columns:minmax\(0, 1fr\) auto/.test(css));
  assert.ok(/\.hb-li \{[^}]*grid-template-columns:minmax\(0, 1fr\) auto/.test(css) && /\.hb-act \.hb-confirm \{[^}]*min-height:28px/.test(css));
  assert.ok(/\.hb-foot details\[open\] \{ flex-basis:100%;/.test(css));
  assert.ok(/\.hb-row\[aria-disabled=true\][^{]*\{[^}]*color:var\(--muted\)/.test(css) && !/opacity/.test(css));   // opacity 대신 muted(DESIGN)
  assert.ok(/\.hb-slot\.hb-leaves \{[^}]*var\(--red\)/.test(css) && /\.hb-slot\.hb-stay \{ color:var\(--fg\); \}/.test(css));
  assert.ok(!/\.hb-slot\.hb-stay \{[^}]*accent-color/.test(css));                                           // 틸은 선택·포커스 전용(design P2-1)
  // design P2-4·P3-3: 1번 각주 CSS 5줄, 3번 foot hidden, 1279px 이하는 3번 구획 머리만 min-height 0
  assert.ok(/#hb-ofoot \{ display:block; word-break:keep-all; padding:8px 16px; line-height:1\.5; \}/.test(css) && /#hb-ofoot \.hb-src \{ display:inline; \}/.test(css) &&
    /#hb-ofoot \.db-why \{ white-space:nowrap; \}/.test(css) && /#hb-ofoot details \{ display:inline-block; margin-left:8px; \}/.test(css) && /#hb-ofoot details\[open\] \{ display:block; margin:6px 0 0; \}/.test(css));
  assert.ok(/\.hb-foot\[hidden\] \{ display:none; \}/.test(css));
  assert.ok(/#hb-preps \.hb-sum \{ min-height:0; \}/.test(css) && !/\n\s*\.hb-sum \{ min-height:0; \}/.test(css));
  assert.ok(html.indexOf('.hb-cards') < 0);                                                                  // 낡은 주석의 .hb-cards 언급 정리
  assert.ok(/\.hb-col:focus:not\(:focus-visible\) \{ outline:none; \}/.test(css) && !/\.hb-col:focus \{/.test(css));   // 키보드 포커스 링은 살린다(design P3-a)
  // 채운 버튼 금지 — 와플 범례 색 견본(.lg i.k)은 버튼이 아니라 칸 색을 알려 주는 표지라 뺀다
  assert.ok(!/background:var\(--(accent-color|red|fg)\)\s*;/.test(css.replace(/\.hb-waf \.lg i\.k \{[^}]*\}/, '')));
  // 마크업 순서: 머리 → 오류 배너 → 세 구획(협약 중인 기관 → 입찰 공고가 뜬 대상 → 제안 진행 단계). 요약 띠·알림 줄·기간 버튼은 없다
  const k0 = src('js/kbboard.js');
  const at2 = function (s) { return k0.indexOf(s); };
  assert.ok(at2('id="hb-err"') < at2('class="hb-cols"') && at2('id="hb-ours"') < at2('id="hb-notice"') && at2('id="hb-notice"') < at2('id="hb-preps"'));
  assert.ok(k0.indexOf('id="hb-cards"') < 0 && k0.indexOf('id="hb-alert"') < 0 && k0.indexOf('<fieldset') < 0 && k0.indexOf('hb-grid') < 0);
  assert.ok(k0.indexOf('<h2 id="hb-ot">협약 중인 기관</h2>') > 0 && k0.indexOf('<h2 id="hb-nt">입찰 공고가 뜬 대상</h2>') > 0 && k0.indexOf('<h2 id="db-t2">제안 진행 단계</h2>') > 0);
  assert.ok(k0.indexOf('<span class="sub">협약 중인 기관 · 입찰 공고 · 제안 진행</span>') > 0);
  assert.ok(/section class="pnl hb-col" id="hb-ours"[^>]*aria-labelledby="hb-ot"/.test(k0) && /section class="pnl hb-col" id="hb-notice"[^>]*aria-labelledby="hb-nt"/.test(k0));
  assert.ok(k0.indexOf('<div class="hb-foot" id="hb-ofoot">') > 0 && k0.indexOf('db-foot') < 0);
  // 옛 이름 '국민은행이 맡은 기관'은 화면 글에서 사라졌다(주석 제외)
  assert.ok(k0.replace(/\/\/[^\n]*/g, '').indexOf('국민은행이 맡은 기관') < 0);
});

test('배선: 감사 화면 이름(bid_board·bid_notice·map_popover)·현황판 팝업 fallback·kbboard 문구에 우리 없음', function () {
  const k = src('js/kbboard.js'), d = src('js/dashboard.js');
  assert.ok(k.indexOf("screen: 'bid_board', fallback: '#' + colId") > 0 && k.indexOf("colId = colEl && colEl.id ? colEl.id : 'hb-ours'") > 0);   // 열마다 fallback(1열 #hb-ours·2열 #hb-notice·3열 #hb-preps)
  assert.ok(/refocus: function \(\) \{ return kbb\.findOpener\(\$\(colId\), key, act\); \}/.test(k) && /m\.refocus\(\)/.test(d) && d.indexOf("refocus: (opts && opts.refocus) || null") > 0);
  assert.ok(/function actOf\(rec\) \{\s*if \(kbb\.inProgress\(rec, st\.preps, st\.overview\)\) return 'open';/.test(k));   // 신규 유치 줄: 진행 기록이 있으면 배지(qa P3-4)
  assert.ok(k.indexOf('같은 기관은 한 번만 셉니다') < 0 && k.indexOf('id="hb-pfoot" hidden') > 0 && /\$\('hb-pfoot'\)[\s\S]*?pf\.hidden = ps\.state !== 'ok'/.test(k));   // 3번 foot 중복 문구 삭제(design P2-3)
  assert.ok(k.indexOf('제안 진행 단계 구획의 [다시 시도]를 누르세요.') > 0 && k.indexOf('오른쪽 제안 진행 단계') < 0);
  assert.ok(/fa\.id !== 'dm-name' && fa\.id !== 'dm-box'\) m\.focus = ''/.test(d));                          // 이미 포커스를 옮긴 사용자를 [제안 확정]으로 끌고 가지 않는다(qa P3-6)
  assert.ok(d.indexOf("dash.postConfirm(id, 'bid_notice')") > 0 && d.indexOf("dash.postConfirm(id, m.screen)") > 0);
  assert.ok(d.indexOf("screen: (opts && opts.screen) || 'map_popover'") > 0);
  assert.strictEqual((k.replace(/\/\/[^\n]*/g, '').match(/'[^'\n]*우리[^'\n]*'/g) || []).length, 0);   // 주석 밖 문자열에 '우리' 없음
  assert.ok(k.indexOf('국민은행 금고 기관') < 0);                                                        // 문구는 '협약 중인 기관'(11-17 사용자 결정)
  const app = src('js/app.js');
  assert.ok(app.indexOf('root.kbboard.mount(dashEl)') > 0 && app.indexOf('root.dashboard.mount(noticeEl)') > 0 && app.indexOf('app.findNavItem = findNavItem') > 0);
  assert.ok(/flushOverdue\(\);\s*\/\/ 현황판이 열린 '뒤에'/.test(app));
  // qa 11-16 후속: 못 열면 안내, 팝업 닫은 뒤·selectKey 뒤 포커스 복원, selectKey는 걸러지면 조건을 지운다
  assert.ok(/function openNotice\(key\)[\s\S]*?flash\('입찰 공고 현황을 열 수 없습니다\./.test(k) && k.indexOf("openNotice('')") > 0 && k.indexOf('goNotice(btn') < 0);
  // 11-17: 포커스 복귀는 세 목록(협약 중인 기관·입찰 공고가 뜬 대상·제안 진행) 모두, [제안 확정] 버튼은 data-act로 같은 버튼에 돌아온다
  assert.ok(/function restoreFocus\(sc, keepKey\)[\s\S]*?data-act[\s\S]*?\.focus\(\)/.test(k));
  ['hb-oscroll', 'hb-nscroll', 'hb-pscroll'].forEach(function (id) {
    assert.ok(new RegExp("\\$\\('" + id + "'\\)[\\s\\S]*?keepFocus\\([\\s\\S]*?restoreFocus\\(").test(k), id);
  });
  assert.ok(k.indexOf('aria-live') < 0);                                                                  // #hb-g1의 aria-live 제거(design P2-2)
  // [제안 확정] 버튼은 상세 팝업을 열어 팝업의 [제안 확정]으로 포커스를 옮긴다(목록에서 바로 저장하지 않는다)
  assert.ok(/classList\.contains\('hb-confirm'\)\) \{ openOurs\(btn, 'confirm'\)/.test(k) && k.indexOf("focus: focus || ''") > 0);
  assert.ok(d.indexOf("focus: (opts && opts.focus) || ''") > 0 && /m\.focus === 'confirm'[\s\S]*?#db-cf[\s\S]*?cf\.focus\(\)/.test(d));
  assert.ok(k.indexOf('postConfirm') < 0 && k.indexOf('fetch(\'/preps/') < 0);                           // 현황판은 확정을 직접 보내지 않는다
  assert.ok(/dash\.selectKey = [\s\S]*?st\.q = ''; st\.region = ''; st\.type = ''; fillFilters\(\);[\s\S]*?select\(key, lb\)/.test(d));
  assert.ok(d.indexOf('UNKNOWN으로 남는다') < 0);                                                                // 낡은 이관 주석 정리
  assert.ok(app.indexOf("document.getElementById('plans-root')") > 0 && app.indexOf('root.plans.mount(plansEl)') > 0);   // plans 줄 보존
});
