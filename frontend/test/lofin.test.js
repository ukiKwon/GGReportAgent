// 행안부 금고지정 현황(frontend/data/lofin-2026.js)을 지자체 상세 '현재 금고 은행'에 잇는 규칙.
// 우선순위: 직접 입력(현재) > KB_VERIFIED·KB_NEXT 수집 > 행안부 값 > 만료된 직접 입력. 약정 기록 표에는 자동 행이 없고 화면 '수집' 줄로만 보인다.
const test = require('node:test');
const assert = require('node:assert');
const bc = require('../js/bankcontract.js');
const dash = require('../js/dashboard.js');

const TODAY = new Date('2026-11-11T00:00:00');
const row = (bank, rank, o) => Object.assign({ bank: bank, rank: rank, slot: rank === 'RANK2' ? 2 : 1, accts: ['일반회계', '기타특별', '기금'], raw: [], start: '2023-01-01', end: '2026-12-31' }, o || {});
const LF = { asof: '2026-01-01', src: '행안부 금고지정 현황(2026.1.1. 기준)', rows: {
  '11|종로구청': [row('우리은행', 'SINGLE')],
  '26|부산광역시': [row('국민은행', 'RANK2', { accts: ['기타특별', '공기업특별'], start: '2025-01-01', end: '2028-12-31' }), row('부산은행', 'RANK1', { accts: ['일반회계', '기금'], start: '2025-01-01', end: '2028-12-31' })],
  '11|중구청': [row('우리은행', 'SINGLE', { end: '2026-06-30' })],
  '46|전남광주통합특별시': [row('광주은행', 'RANK1', { unit: '광주 본청' }), row('농협은행', 'RANK2', { unit: '광주 본청' }), row('농협은행', 'RANK1', { unit: '전남 본청' }), row('광주은행', 'RANK2', { unit: '전남 본청' })],
  '28|서해구청': [row('하나은행', 'SINGLE', { unit: '옛 인천 서구', approx: true })],
  '11|서울중앙지방법원': [row('우리은행', 'SINGLE')] } };

const item = (name, region, type) => dash.model([{ name: name, region: region, type: type || '지자체', contractEnd: '2027-01-10', confirmed: true, lastBid: '2024-09-24', term: 4 }], TODAY).upcoming[0];
const pane = (it, c) => dash.paneHtml(it, Object.assign({ act: 'none', today: TODAY, lofin: LF }, c || {}));
const bankSec = h => h.slice(h.indexOf('<h3>기관 정보</h3>'), h.indexOf('<h3>기관장</h3>'));

const CODES = { banks: [], ranks: [{ code: 'FIRST', name: '1금고' }, { code: 'SECOND', name: '2금고' }, { code: 'SINGLE', name: '단수 금고' }], src_kinds: [{ code: 'LINK', name: '공고·문서 링크' }], cancel_reasons: [], accounts: [] };
const D = o => Object.assign({ contract_no: 1, rev_no: 1, origin_cd: 'MANUAL', rank_cd: 'SINGLE', bank_cd: 'B01', bank_name: '우리은행', bank_name_etc: null,
  term_from: '2023-01-01', term_to: '2026-12-31', term_state: 'CURRENT', src_kind: 'LINK', src_url: 'https://www.gangnam.go.kr/a', src_no: null,
  checked_date: '2026-11-10', checked_dept: null, note: '', account_cd: null, account_name: null, account_etc: null, overlap_confirmed: false,
  overlap_with: [], editor_name: '이영업', emp_verified: true, saved_at: '2026-11-16T10:00:00' }, o || {});
const V = lines => ({ st: 'ok', code: 0, histOpen: false, histSt: 'idle', hist: null, data: { lines: lines, history_count: lines.length, can_edit: true, today: '2026-11-17', codes: CODES } });

test('bankKey: 행안부 표기 정규화(iM뱅크·IBK·BNK·KB)', () => {
  ['아이엠뱅크', 'IM뱅크', 'iM뱅크', 'iM뱅크(구 대구은행)', '대구은행'].forEach(n => assert.strictEqual(bc.bankKey(n), bc.bankKey('아이엠뱅크'), n));
  assert.strictEqual(bc.bankKey('IBK기업은행'), bc.bankKey('기업은행'));
  assert.strictEqual(bc.bankKey('BNK부산은행'), bc.bankKey('부산은행'));
  assert.strictEqual(bc.bankKey('BNK경남은행'), bc.bankKey('경남은행'));
  assert.strictEqual(bc.bankKey('KB국민은행'), bc.bankKey('국민은행'));
  assert.notStrictEqual(bc.bankKey('부산은행'), bc.bankKey('경남은행'));
});

test('서버 응답 없음: 행안부 값만 있는 지자체는 미확인 대신 은행·단수 금고·수집·기준일', () => {
  const s = bankSec(pane(item('종로구청', '11')));
  // 줄 모양(design 6-1): dt = 순위 이름, dd = 은행 + 수집 칩, 다음 줄 약정, 다음 줄 맡는 회계. 줄마다 출처 꼬리는 없다(아래 '직접 확인:' 링크가 출처).
  assert.ok(s.includes('<dt>단수 금고</dt><dd><span class="bk-ln">우리은행 <span class="wf-badge pp-cancel">수집</span></span>') && s.indexOf('· 행안부 금고지정 현황') < 0);
  assert.ok(s.includes('맡는 회계 일반회계 · 기타특별 · 기금') && s.includes('<dt>약정 기간</dt><dd><span class="v">2023-01-01 ~ 2026-12-31</span> (4년)</dd>'));
  assert.ok(s.indexOf('맡는 회계') < s.indexOf('<dt>약정 기간</dt>'));   // 은행 줄(맡는 회계) → 약정 기간 한 줄 순서
  assert.ok(s.indexOf('pop-unk') < 0 && s.indexOf('만료') < 0);
  assert.ok(s.includes('행안부 현황으로 채운 값입니다.') && s.indexOf('직접 입력하면') < 0);   // 서버 응답 없음(편집 불가) — 첫 문장만
});

test('약정 기간 한쪽이 비면 한 줄이 ~ 끝 만료 / 시작 ~ 미확인으로 보인다', () => {
  const mk = o => bankSec(pane(item('종로구청', '11'), { lofin: { asof: '2026-01-01', rows: { '11|종로구청': [row('우리은행', 'SINGLE', o)] } } }));
  assert.ok(mk({ start: '' }).includes('~ <span class="v">2026-12-31</span> 만료 (4년)'));
  assert.ok(mk({ end: '' }).includes('<span class="v">2023-01-01</span> ~ <span class="pop-unk">미확인</span> (4년)'));
  assert.ok(mk({ start: '', end: '' }).includes('<dt>약정 기간</dt><dd><span class="pop-unk">미확인</span> (4년)</dd>'));
});

test('줄이 모두 만료되면 안내가 바뀐다(편집 가능/불가), 일부만 만료면 그대로', () => {
  const ed = bankSec(pane(item('중구청', '11'), { bank: V([]) }));
  assert.ok(ed.includes('행안부 현황의 약정 기간이 지났습니다. 지금 약정을 확인해 직접 입력하세요.') && ed.indexOf('채운 값입니다') < 0);
  const ro = V([]); ro.data.can_edit = false;
  assert.ok(bankSec(pane(item('중구청', '11'), { bank: ro })).includes('행안부 현황의 약정 기간이 지났습니다. 지금 약정은 기록이 없습니다.'));
  assert.ok(bankSec(pane(item('중구청', '11'))).includes('행안부 현황의 약정 기간이 지났습니다. 지금 약정은 기록이 없습니다.'));
  const ok = bankSec(pane(item('종로구청', '11'), { bank: V([]) }));
  assert.ok(ok.includes('행안부 현황으로 채운 값입니다. 약정을 직접 입력하면 그 값이 먼저 보입니다.') && ok.indexOf('기간이 지났습니다') < 0);
});

test('자료에 없는 지자체는 기존 미확인 그대로, 비지자체는 자료에 있어도 변화 없음', () => {
  assert.ok(bankSec(pane(item('없는구청', '11'))).includes('pop-unk'));
  const court = item('서울중앙지방법원', '11', '법원');
  assert.strictEqual(pane(court), pane(court, { lofin: undefined }));
  assert.strictEqual(pane(court), pane(court, { lofin: null }));
  assert.ok(bankSec(pane(court)).indexOf('행안부 금고지정 현황 2026') < 0);
  assert.deepStrictEqual(dash.lofinLines(court.rec, LF, TODAY), []);
});

test('1·2금고 기관(부산광역시): 1금고 먼저 두 줄, 회계는 작게', () => {
  const s = bankSec(pane(item('부산광역시', '26')));
  const a = s.indexOf('<dt>1금고</dt><dd><span class="bk-ln">부산은행'), b = s.indexOf('<dt>2금고</dt><dd><span class="bk-ln">국민은행');
  assert.ok(a > 0 && b > a);
  assert.ok(s.includes('맡는 회계 기타특별 · 공기업특별'));
  assert.strictEqual((s.match(/wf-badge pp-cancel">수집/g) || []).length, 2);
});

test('만료: end가 오늘보다 앞이면 만료 표시', () => {
  const s = bankSec(pane(item('중구청', '11')));
  assert.ok(s.includes('우리은행 <span class="wf-badge pp-cancel">만료</span> <span class="wf-badge pp-cancel">수집</span>'));
  assert.strictEqual(dash.lofinLines(item('중구청', '11').rec, LF, TODAY)[0].expired, true);
  assert.strictEqual(dash.lofinLines(item('종로구청', '11').rec, LF, TODAY)[0].expired, false);
  // 끝나는 날 당일은 만료가 아니다(어제까지 지났어야 만료)
  const edge = { asof: '2026-01-01', rows: { '11|종로구청': [row('우리은행', 'SINGLE', { end: '2026-11-11' })] } };
  assert.strictEqual(dash.lofinLines(item('종로구청', '11').rec, edge, TODAY)[0].expired, false);
  const edge2 = { asof: '2026-01-01', rows: { '11|종로구청': [row('우리은행', 'SINGLE', { end: '2026-11-10' })] } };
  assert.strictEqual(dash.lofinLines(item('종로구청', '11').rec, edge2, TODAY)[0].expired, true);
});

test('unit·approx: 전남광주 본청 단위 앞머리, 인천 옛 구는 (개편 전 … 기준)', () => {
  const s = bankSec(pane(item('전남광주통합특별시', '46')));
  const i = s.indexOf('<dt>광주 본청 1금고</dt><dd><span class="bk-ln">광주은행'), j = s.indexOf('<dt>광주 본청 2금고</dt><dd><span class="bk-ln">농협은행'),
    k = s.indexOf('<dt>전남 본청 1금고</dt><dd><span class="bk-ln">농협은행'), m = s.indexOf('<dt>전남 본청 2금고</dt><dd><span class="bk-ln">광주은행');
  assert.ok(i > 0 && j > i && k > j && m > k);
  const a = bankSec(pane(item('서해구청', '28')));
  assert.ok(a.includes('<dt>단수 금고</dt><dd><span class="bk-ln">하나은행') && a.includes('(옛 인천 서구 값, 행정구역 개편 전)') && a.indexOf('<dt>옛 인천 서구') < 0);
});

test('직접 입력과 같음: SINGLE 포함, 행안부 줄은 따로 만들지 않는다', () => {
  const h = pane(item('종로구청', '11'), { bank: V([D()]) });
  assert.ok(h.includes('수집 기록과 같음') && h.indexOf('수집 기록과 다름') < 0 && h.indexOf('<dt>수집 기록</dt>') < 0);
  const nm = pane(item('종로구청', '11'), { bank: V([D({ bank_name: 'WOORI 우리은행' })]) });
  assert.ok(nm.includes('수집 기록과 다름'));
  const p = pane(item('부산광역시', '26'), { bank: V([D({ rank_cd: 'FIRST', bank_name: 'BNK부산은행' })]) });
  // 부산은 행안부에 국민은행 2금고도 있다 — 줄 단위 비교라 직접 입력에 없는 그 한 줄만 '다름'(팀 결정 11-17, qa P2-2)
  assert.ok(p.includes('수집 기록과 같음'));
  assert.strictEqual((p.match(/db-chk">수집 기록과 다름/g) || []).length, 1);
  assert.ok(p.includes('<dt>수집 기록</dt><dd><span class="bk-ln">국민은행 · 2금고'));
});

test('SINGLE(단수 금고)과 FIRST(1금고)는 같은 순위 — 서버가 만드는 FIRST로 입력해도 같음', () => {
  const s = bankSec(pane(item('종로구청', '11'), { bank: V([D({ rank_cd: 'FIRST' })]) }));
  assert.ok(s.includes('수집 기록과 같음') && s.indexOf('수집 기록과 다름') < 0 && s.indexOf('<dt>수집 기록</dt>') < 0);
  // 반대 방향: 행안부가 1금고(FIRST)인데 직접 입력이 단수 금고(SINGLE)여도 같음
  const p = bankSec(pane(item('부산광역시', '26'), { bank: V([D({ bank_name: '부산은행' })]) }));
  assert.ok(p.includes('수집 기록과 같음'));
});

test('KB 수집 기관: slot 1은 FIRST·SINGLE 둘 다와 같고, slot 2는 SECOND만', () => {
  const kb = s => ({ key: '11|광진구청', slot: s, quote: 'q', src_date: '2025-03-01' });
  [{ rank_cd: 'SINGLE' }, { rank_cd: 'FIRST' }].forEach(o => {
    const h = bankSec(pane(item('광진구청', '11'), { kb: kb(1), bank: V([D(Object.assign({ bank_name: '국민은행' }, o))]) }));
    assert.ok(h.includes('수집 기록과 같음') && h.indexOf('수집 기록과 다름') < 0, o.rank_cd);
  });
  const d2 = bankSec(pane(item('광진구청', '11'), { kb: kb(1), bank: V([D({ bank_name: '국민은행', rank_cd: 'SECOND' })]) }));
  assert.ok(d2.includes('수집 기록과 다름'));
  const s2 = bankSec(pane(item('광진구청', '11'), { kb: kb(2), bank: V([D({ bank_name: '국민은행', rank_cd: 'SECOND' })]) }));
  assert.ok(s2.includes('수집 기록과 같음') && s2.indexOf('수집 기록과 다름') < 0);
});

test('직접 입력과 다름: 은행이 다르거나 순위가 다르면(SINGLE↔SECOND) 행안부 줄 + 다름 표지', () => {
  [D({ bank_name: '신한은행' }), D({ rank_cd: 'SECOND' })].forEach(d => {
    const s = bankSec(pane(item('종로구청', '11'), { bank: V([d]) }));
    assert.ok(s.includes('<dt>수집 기록</dt>') && s.includes('우리은행 · 단수 금고') && s.includes('db-chk">수집 기록과 다름') && s.includes('행안부 금고지정 현황 2026.1.1. 기준'));
    assert.ok(s.includes('wf-badge pp-neutral">직접 입력'));
  });
});

test('여러 줄 비교는 줄 단위 — 직접 입력 어느 줄과도 같지 않은 행안부 줄만 다름으로 보인다', () => {
  // 부산: 행안부 = 부산은행 1금고 + 국민은행 2금고. 직접 입력 = 부산은행 1금고 + 신한은행 2금고
  const s = bankSec(pane(item('부산광역시', '26'), { bank: V([D({ rank_cd: 'FIRST', bank_name: 'BNK부산은행' }), D({ contract_no: 2, rank_cd: 'SECOND', bank_name: '신한은행', bank_cd: 'B02' })]) }));
  assert.strictEqual((s.match(/<dt>수집 기록<\/dt>/g) || []).length, 1);          // 국민은행 2금고 한 줄만
  assert.ok(s.includes('<dt>수집 기록</dt><dd><span class="bk-ln">국민은행 · 2금고'));
  assert.strictEqual((s.match(/db-chk">수집 기록과 다름/g) || []).length, 1);
  assert.ok(s.includes('수집 기록과 같음'));                                        // 부산은행 1금고 줄은 같음
  assert.ok(s.indexOf('<dt>수집 기록</dt><dd><span class="bk-ln">부산은행') < 0);
});

test('직접 입력이 있으면 만료된 행안부 값은 비교·표시 대상이 아니다', () => {
  const s = bankSec(pane(item('중구청', '11'), { bank: V([D({ bank_name: '신한은행' })]) }));
  assert.ok(s.indexOf('수집 기록과 다름') < 0 && s.indexOf('행안부 금고지정 현황 2026') < 0);
});

test('서버 응답은 있으나 직접 입력이 없으면 행안부 값(legacy 갈래), 만료된 직접 입력은 그 아래', () => {
  const s = bankSec(pane(item('종로구청', '11'), { bank: V([]) }));
  assert.ok(s.includes('<dt>단수 금고</dt><dd><span class="bk-ln">우리은행') && s.includes('행안부 현황으로 채운 값입니다') && s.indexOf('pop-unk') < 0);
  const past = bankSec(pane(item('종로구청', '11'), { bank: V([D({ term_state: 'PAST', term_to: '2022-12-31', bank_name: '신한은행' })]) }));
  assert.ok(past.includes('<dt>단수 금고</dt><dd><span class="bk-ln">우리은행') && past.indexOf('신한은행') > past.indexOf('우리은행'));
  assert.ok(past.includes('wf-badge pp-cancel">만료') && past.indexOf('지금 약정은 기록이 없습니다') < 0);
});

test('KB 수집(c.kb·c.next)이 있으면 행안부 값은 쓰지 않는다', () => {
  const s = bankSec(pane(item('종로구청', '11'), { kb: { key: '11|종로구청', slot: 1, quote: 'q', src_date: '2025-03-01' } }));
  assert.ok(s.includes('KB국민은행') && s.indexOf('우리은행') < 0);
  const n = bankSec(pane(item('종로구청', '11'), { next: { key: '11|종로구청', from: '2027', now: '신한은행', quote: 'q' } }));
  assert.ok(n.includes('신한은행') && n.indexOf('우리은행') < 0);
});

test('행안부 값 문자열은 escape한다', () => {
  const X = '<img src=x onerror=1>';
  const lf = { asof: '2026-01-01', rows: { '11|종로구청': [row(X, 'SINGLE', { accts: [X], unit: X })] } };
  const h = pane(item('종로구청', '11'), { lofin: lf });
  assert.ok(h.indexOf('<img') < 0 && h.includes('&lt;img'));
});
