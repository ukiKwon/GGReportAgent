// NEXT 72(030 뒤 화면 대응): 기관 편집 창의 보내는 본문 규칙·초기값·매핑·출처 링크·개원 확인 필요.
// 근거: handoff/agents/design-reviewer/2026-11-15_1928_a7fbd71e.md §6, 서버 InstitutionEditRules.java(문구는 서버와 같은 글자).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ie = require('../js/instedit.js');
const sd = require('../js/serverdata.js');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');

const ROOT = path.join(__dirname, '..');
const TODAY = new Date('2026-11-15T00:00:00');
const read = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

// ── 입찰 예정일 묶음: 보내는 규칙(규격 6-A 1~4) ─────────────────────
const EST = { date: '2026-12-31', confirmed: false, srcUrl: '', srcNo: '' };
const CONF = { date: '2026-12-31', confirmed: true, srcUrl: 'https://www.g2b.go.kr/x', srcNo: 'R26BK01234567' };
function f(o) { return Object.assign({ date: '2026-12-31', confirmed: false, url: '', no: '' }, o); }

test('날짜를 안 건드리면 contract_end 키가 없다(앞뒤 공백만 달라도 같은 값) — 확정 여부는 늘 보낸다', function () {
  const c = ie.scheduleCheck(EST, f({}));
  assert.strictEqual('contract_end' in c.body, false);
  assert.deepStrictEqual(c.body, { contract_end_confirmed: false });
  assert.strictEqual(c.changed, false);                       // 바뀐 것 없음 → 저장 버튼 disabled
  const sp = ie.scheduleCheck(EST, f({ date: ' 2026-12-31 ' }));
  assert.strictEqual('contract_end' in sp.body, false);
  assert.strictEqual(sp.dateChanged, false);
});

test('날짜를 바꾸면 그 값만 보낸다 — 추정이면 출처 키가 없다(입력해 둔 출처도 보내지 않는다)', function () {
  const c = ie.scheduleCheck(EST, f({ date: '2027-01-15', url: 'https://a.example/b', no: 'X1' }));
  assert.deepStrictEqual(c.body, { contract_end: '2027-01-15', contract_end_confirmed: false });
  assert.strictEqual(c.showSrc, false);
  assert.deepStrictEqual(c.errors, []);
  assert.strictEqual(c.changed, true);
});

test('날짜를 지우면 null, 날짜가 없으면 확정이 될 수 없다', function () {
  const c = ie.scheduleCheck(CONF, f({ date: '', confirmed: true }));
  assert.strictEqual(c.body.contract_end, null);
  assert.strictEqual(c.body.contract_end_confirmed, false);
  assert.strictEqual(c.confirmed, false);
});

test('추정 → 확정: 출처가 없으면 서버와 같은 글자로 막고, 링크나 번호 하나면 통과한다', function () {
  const none = ie.scheduleCheck(EST, f({ confirmed: true }));
  assert.strictEqual(none.required, true);
  assert.strictEqual(none.errors[0].msg, '확정하려면 출처(공고 링크 또는 번호)가 필요합니다.');
  assert.deepStrictEqual(none.errors[0].ids, ['ie-cu', 'ie-cn']);
  const ok = ie.scheduleCheck(EST, f({ confirmed: true, no: 'R26BK01234567' }));
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.body, { contract_end_confirmed: true, contract_end_src_no: 'R26BK01234567' });   // 날짜는 그대로라 키 없음
  const both = ie.scheduleCheck(EST, f({ confirmed: true, url: 'https://www.g2b.go.kr/a', no: 'R1' }));
  assert.deepStrictEqual(both.body, { contract_end_confirmed: true, contract_end_src_url: 'https://www.g2b.go.kr/a', contract_end_src_no: 'R1' });
});

test('원래 확정+출처 있음: 날짜 그대로면 출처 선택(비우면 현재 출처 유지), 날짜를 바꾸면 새 출처 필수', function () {
  const keep = ie.scheduleCheck(CONF, f({ confirmed: true }));
  assert.strictEqual(keep.required, false);
  assert.deepStrictEqual(keep.errors, []);
  assert.strictEqual(keep.changed, false);
  const moved = ie.scheduleCheck(CONF, f({ date: '2027-02-01', confirmed: true }));
  assert.strictEqual(moved.required, true);
  assert.strictEqual(moved.errors[0].msg, '확정하려면 출처(공고 링크 또는 번호)가 필요합니다.');
  assert.strictEqual(ie.scheduleCheck(CONF, f({ date: '2027-02-01', confirmed: true, no: 'R2' })).errors.length, 0);
});

test('원래 확정인데 출처가 없는 옛 행(9곳): 그대로 두면 변경 없음, 저장하려면 출처가 필수', function () {
  const old = { date: '2026-12-31', confirmed: true, srcUrl: '', srcNo: '' };
  assert.strictEqual(ie.scheduleCheck(old, f({ confirmed: true })).changed, false);
  const c = ie.scheduleCheck(old, f({ confirmed: true, url: 'https://a.example/n' }));
  assert.strictEqual(c.required, true);
  assert.deepStrictEqual(c.errors, []);
});

test('확정 → 추정: 근거만 바뀐다(날짜 키 없음, 출처 키 없음)', function () {
  const c = ie.scheduleCheck(CONF, f({ confirmed: false }));
  assert.deepStrictEqual(c.body, { contract_end_confirmed: false });
  assert.strictEqual(c.changed, true);
});

test('날짜·링크·번호 사전 검사 문구는 서버와 같은 글자', function () {
  assert.strictEqual(ie.scheduleCheck(EST, f({ date: '2026-5-1' })).errors[0].msg, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  assert.strictEqual(ie.scheduleCheck(EST, f({ date: '2026-02-30' })).errors[0].msg, '존재하지 않는 날짜입니다.');
  assert.strictEqual(ie.scheduleCheck(EST, f({ date: '1999-01-01' })).errors[0].msg, '날짜 범위(2000~2100)를 벗어났습니다.');
  ['ftp://a.example/x', 'javascript:alert(1)', 'https://u:p@a.example/x', 'www.g2b.go.kr', 'https://a b'].forEach(function (u) {
    const c = ie.scheduleCheck(EST, f({ confirmed: true, url: u, no: 'R1' }));
    assert.strictEqual(c.errors[0].msg, '출처 링크는 http 또는 https 주소(500자 이내)여야 합니다.', u);
  });
  assert.strictEqual(ie.scheduleCheck(EST, f({ confirmed: true, url: 'https://a.example/' + 'x'.repeat(500) })).errors[0].msg,
    '출처 링크는 http 또는 https 주소(500자 이내)여야 합니다.');
  assert.strictEqual(ie.scheduleCheck(EST, f({ confirmed: true, no: '<b>' })).errors[0].msg, '공고 번호 형식이 올바르지 않습니다(50자 이내, 문자·숫자·공백·-_./()).');
  assert.strictEqual(ie.scheduleCheck(EST, f({ confirmed: true, no: '제2026-203호' })).errors.length, 0);
});

test('저장 뒤 기준값: 같은 날짜의 확정만 옛 출처를 잇는다(서버 규칙과 같음)', function () {
  assert.deepStrictEqual(ie.afterSchedule(CONF, f({ confirmed: true })), { date: '2026-12-31', confirmed: true, srcUrl: CONF.srcUrl, srcNo: CONF.srcNo });
  assert.deepStrictEqual(ie.afterSchedule(CONF, f({ date: '2027-02-01', confirmed: true, no: 'R2' })),
    { date: '2027-02-01', confirmed: true, srcUrl: '', srcNo: 'R2' });
  assert.deepStrictEqual(ie.afterSchedule(CONF, f({ confirmed: false })), { date: '2026-12-31', confirmed: false, srcUrl: '', srcNo: '' });
});

// ── 운영 상태 묶음(규격 6-B) ───────────────────────────────────────
const OPR = { status: 'OPERATING', openDate: '', srcUrl: '', srcNo: '' };
const PLN = { status: 'PLANNED', openDate: '2026-01', srcUrl: '', srcNo: 'N1' };
function g(o) { return Object.assign({ status: 'OPERATING', openDate: '', url: '', no: '' }, o); }

test('운영 상태: 안 건드리면 본문이 비고 저장 버튼은 disabled', function () {
  const c = ie.statusCheck(PLN, g({ status: 'PLANNED', openDate: '2026-01' }));
  assert.deepStrictEqual(c.body, {});
  assert.strictEqual(c.changed, false);
});

test('개원 예정으로 바꾸면 개원 예정일과 출처가 둘 다 필수(서버 문구 그대로)', function () {
  const c = ie.statusCheck(OPR, g({ status: 'PLANNED' }));
  const msgs = c.errors.map(function (e) { return e.msg; });
  assert.ok(msgs.indexOf('개원 예정에는 개원 예정일(연, 연-월 또는 연-월-일)이 필요합니다.') >= 0);
  assert.ok(msgs.indexOf('운영 상태를 바꾸려면 출처(링크 또는 번호)가 필요합니다.') >= 0);
  const ok = ie.statusCheck(OPR, g({ status: 'PLANNED', openDate: '2028-03', no: '공고1' }));
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.body, { op_status: 'PLANNED', open_date: '2028-03', op_src_no: '공고1' });
});

test('개원 예정 → 운영: 상태만 바꿔도 출처 필수, 개원일은 그대로면 키 없음', function () {
  const need = ie.statusCheck(PLN, g({ status: 'OPERATING', openDate: '2026-01' }));
  assert.strictEqual(need.errors[0].msg, '운영 상태를 바꾸려면 출처(링크 또는 번호)가 필요합니다.');
  const ok = ie.statusCheck(PLN, g({ status: 'OPERATING', openDate: '2026-01', url: 'https://www.scourt.go.kr/n/1' }));
  assert.deepStrictEqual(ok.body, { op_status: 'OPERATING', op_src_url: 'https://www.scourt.go.kr/n/1' });
});

test('상태 그대로 개원 예정일만 고치면 그 키만 보낸다(출처 없이 가능), 출처를 모두 비운 키는 보내지 않는다', function () {
  const c = ie.statusCheck(PLN, g({ status: 'PLANNED', openDate: '2029' }));
  assert.deepStrictEqual(c.errors, []);
  assert.deepStrictEqual(c.body, { open_date: '2029' });
  assert.strictEqual('op_src_url' in c.body || 'op_src_no' in c.body, false);
});

test('개원 예정일 형식·범위 문구는 서버와 같은 글자', function () {
  assert.strictEqual(ie.statusCheck(PLN, g({ status: 'PLANNED', openDate: '28' })).errors[0].msg, '개원 예정일은 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.');
  assert.strictEqual(ie.statusCheck(PLN, g({ status: 'PLANNED', openDate: '2028-13' })).errors[0].msg, '존재하지 않는 날짜입니다.');
  assert.strictEqual(ie.statusCheck(PLN, g({ status: 'PLANNED', openDate: '1990' })).errors[0].msg, '개원 예정일 범위(2000~2100)를 벗어났습니다.');
  assert.deepStrictEqual(ie.afterStatus(PLN, g({ status: 'OPERATING', openDate: '2026-01', no: 'N9' })), { status: 'OPERATING', openDate: '2026-01', srcUrl: '', srcNo: 'N9' });
  assert.deepStrictEqual(ie.afterStatus(PLN, g({ status: 'PLANNED', openDate: '2029' })), { status: 'PLANNED', openDate: '2029', srcUrl: '', srcNo: 'N1' });
});

// ── 기본 정보 묶음 ─────────────────────────────────────────────────
test('기본 정보: 바뀐 서버 칸만 보내고(비우면 null) 로컬 칸은 따로 둔다', function () {
  const base = { name: '가', type: '지자체', region: '11', subRegion: '', term: '4', lastBid: '2022-01-01', contractExpiry: '', lng: '127', lat: '', sources: 'a, b' };
  const vals = { type: '법원', region: '11', subRegion: '', term: '', lastBid: '2022-01-01', contractExpiry: '', lng: '128', lat: '', sources: 'a, b, c' };
  assert.deepStrictEqual(ie.basicPatch(base, vals), { type: '법원', term: null });
  assert.deepStrictEqual(ie.basicLocal(base, vals), { type: '법원', term: '', lng: 128, sources: ['a', 'b', 'c'] });   // 경도는 숫자(지도는 typeof number만 마커로 그림)
  assert.deepStrictEqual(ie.basicPatch(base, Object.assign({}, base, { term: '6' })), { term: 6 });
  assert.deepStrictEqual(ie.basicPatch(base, base), {});
});

test('기본 정보: 경도·위도는 숫자로 저장한다(문자열이면 지도 마커가 사라짐), 숫자가 아니면 묶음 오류', function () {
  assert.strictEqual(ie.basicLocal({ lng: '127' }, { lng: '127.1' }).lng, 127.1);
  assert.strictEqual(ie.basicLocal({ lat: '' }, { lat: '-37.5' }).lat, -37.5);
  assert.strictEqual(ie.basicLocal({ lng: '127' }, { lng: '' }).lng, '');              // 비우면 지움(0이 되지 않는다)
  const e = ie.basicErrors({ lng: '127', lat: '' }, { lng: '127,5', lat: '37.5' });
  assert.deepStrictEqual(e, [{ msg: '경도는 숫자로 적습니다.', ids: [], fields: ['lng'] }]);
  assert.deepStrictEqual(ie.basicErrors({ lng: '127' }, { lng: '127' }), []);          // 안 건드린 칸은 검사하지 않는다
});

test('기본 정보: 입찰주기가 숫자가 아니면 본문에 넣지 않고 오류(null로 서버 값이 지워지지 않는다)', function () {
  const base = { term: '4' };
  const body = ie.basicPatch(base, { term: '4년' });
  assert.strictEqual('term' in body, false);
  assert.deepStrictEqual(ie.basicErrors(base, { term: '4년' }), [{ msg: '입찰주기는 숫자(년)로 적습니다.', ids: [], fields: ['term'] }]);
  assert.deepStrictEqual(ie.basicPatch(base, { term: '' }), { term: null });           // 비움은 의도한 지움
  assert.deepStrictEqual(ie.basicErrors(base, { term: '' }), []);
  assert.deepStrictEqual(ie.basicPatch(base, { term: '6' }), { term: 6 });
});

test('링크 사전 검사는 서버(java.net.URI·서식 문자·host 필수)와 같이 거부한다', function () {
  const BAD = ['https://a.go.kr/x|y', 'https://a.go.kr/%zz', 'https://a.go.kr/%2', 'https://my_host.go.kr/', 'https://a.go.kr/​x', 'https://a.go.kr/‮x',
    'https://a.go.kr/x\ty', 'https://', 'https:///x', 'https://a.go.kr/a#b#c', 'https://a.go.kr/[x]', 'https://한글.go.kr/', 'http://a.go.kr:abc/'];
  BAD.forEach(function (u) { assert.strictEqual(ie.urlMsg(u), '출처 링크는 http 또는 https 주소(500자 이내)여야 합니다.', JSON.stringify(u)); });
  ['https://www.g2b.go.kr/x?a=1&b=2#f', 'http://a.go.kr:8080/p%20q', 'https://a-b.go.kr', 'https://1.2.3.4/x', 'HTTPS://A.GO.KR/', 'https://a.go.kr/한글'].forEach(function (u) {
    assert.strictEqual(ie.urlMsg(u), '', u);
  });
});

test('출처 필수 힌트는 이유별(날짜를 바꿈 → 원래 추정 → 출처 기록 없음), 선택이면 reason이 비어 있다', function () {
  const oldNoSrc = { date: '2026-12-31', confirmed: true, srcUrl: '', srcNo: '' };
  assert.strictEqual(ie.scheduleCheck(CONF, f({ date: '2027-02-01', confirmed: true })).reason, 'moved');
  assert.strictEqual(ie.scheduleCheck(EST, f({ confirmed: true })).reason, 'est');
  assert.strictEqual(ie.scheduleCheck(oldNoSrc, f({ confirmed: true, url: 'https://a.example/n' })).reason, 'nosrc');
  assert.strictEqual(ie.scheduleCheck(CONF, f({ confirmed: true })).reason, '');
  assert.strictEqual(ie.SRC_HINT.moved, '날짜를 바꾸면 현재 출처는 이어지지 않습니다. 공고 링크와 공고 번호 중 하나는 꼭 적습니다.');
  assert.strictEqual(ie.SRC_HINT.est, '공고로 확정하려면 공고 링크와 공고 번호 중 하나는 꼭 적습니다.');
  assert.strictEqual(ie.SRC_HINT.nosrc, '현재 출처가 기록되지 않았습니다. 공고 링크와 공고 번호 중 하나는 꼭 적습니다.');
});

test('오류·안내가 칸과 연결된다(aria-describedby: 날짜→묶음 오류, 개원일→묶음 오류, [공고로 확정]→힌트)', function () {
  const init = ie.initial({ name: '가', type: '법원', contractEnd: '2026-12-31' });
  const sch = ie.schedHtml(init, { local: true });
  assert.ok(/id="ie-ce"[^>]*aria-describedby="ie-sched-err"/.test(sch));
  assert.ok(/value="true" aria-describedby="ie-cf-h"/.test(sch));
  assert.ok(/id="ie-od"[^>]*aria-describedby="ie-status-err"/.test(ie.statusHtml({ type: '법원' }, init)));
});

// ── 초기값: 공고로 덮인 날짜가 아니라 서버 기관 행의 원래 값 ───────────
const SERVER_ROW = {
  institution_id: 'x', name_ko: '가법원', region_code: '11', type: '법원', contract_end: '2026-12-31', last_bid: null, term: 4, stage: 1,
  org_code: '123', g2b_code: 'G1', op_status: 'PLANNED', open_date: '2026-01', open_check_needed: true,
  contract_end_confirmed: true, contract_end_src_url: 'https://www.g2b.go.kr/a', contract_end_src_no: 'R1', op_src_url: null, op_src_no: 'N1',
};

test('mapServerRow: 030 칸을 화면 이름으로 옮긴다(PLANNED → 개원 예정, 확정 false도 값, 빈 출처는 키 없음)', function () {
  const rec = sd.mapServerRow(SERVER_ROW);
  assert.strictEqual(rec.opStatus, '개원 예정');
  assert.strictEqual(rec.openDate, '2026-01');
  assert.strictEqual(rec.confirmed, true);
  assert.strictEqual(rec.orgCode, '123');
  assert.strictEqual(rec.g2bCode, 'G1');
  assert.strictEqual(rec.openCheckNeeded, true);
  assert.strictEqual(rec.contractEndSrcUrl, 'https://www.g2b.go.kr/a');
  assert.strictEqual(rec.opSrcNo, 'N1');
  assert.strictEqual('opSrcUrl' in rec, false);
  assert.ok(logic.isOpeningCourt(rec));                       // 합치기 코드(isOpeningCourt)가 이 글자로 판정한다
  assert.strictEqual(sd.mapServerRow(Object.assign({}, SERVER_ROW, { op_status: 'OPERATING' })).opStatus, '운영');
  assert.strictEqual(sd.mapServerRow(Object.assign({}, SERVER_ROW, { contract_end_confirmed: false })).confirmed, false);
});

test('mapServerRow: 옛 서버 응답(030 칸 없음)에는 새 키·_inst를 만들지 않는다', function () {
  const rec = sd.mapServerRow({ institution_id: 'o', name_ko: '옛', region_code: '11', type: '지자체', contract_end: '2026-01-01', term: 4, stage: 1 });
  assert.strictEqual('_inst' in rec, false);
  assert.strictEqual('confirmed' in rec, false);
  assert.strictEqual('opStatus' in rec, false);
});

test('서버 값이 번들 confirmed·opStatus를 이긴다(합치기), 서버 칸이 없으면 번들 값이 남는다', function () {
  const bundle = [{ name: '가법원', region: '11', type: '법원', confirmed: true, opStatus: '개원 예정' }];
  const out = sd.mergeUnion(bundle, [Object.assign({}, SERVER_ROW, { op_status: 'OPERATING', contract_end_confirmed: false })]);
  assert.strictEqual(out[0].confirmed, false);
  assert.strictEqual(out[0].opStatus, '운영');
  assert.strictEqual(out[0].name, '가법원');
  const old = sd.mergeUnion(bundle, [{ institution_id: 'x', name_ko: '가법원', region_code: '11', type: '법원' }]);
  assert.strictEqual(old[0].confirmed, true);
  assert.strictEqual(old[0].opStatus, '개원 예정');
});

test('초기값: 공고(bid_cases)가 날짜를 덮어도 모달 초기값은 서버 기관 행의 원래 날짜·확정·출처다', function () {
  const rec = sd.applyBidCases([sd.mapServerRow(SERVER_ROW)], [
    { institution_id: 'x', bid_case_id: 'b1', confirmed_date: '2026-09-30', expected_date: null, participation_status: '', participation_decision: [] }])[0];
  assert.strictEqual(rec.contractEnd, '2026-09-30');          // 지도·현황판이 보는 값은 공고 날짜
  const init = ie.initial(rec);
  assert.deepStrictEqual(init.sched, { date: '2026-12-31', confirmed: true, srcUrl: 'https://www.g2b.go.kr/a', srcNo: 'R1' });
  assert.deepStrictEqual(init.bid, { date: '2026-09-30', confirmed: true });
  assert.deepStrictEqual(init.status, { status: 'PLANNED', openDate: '2026-01', srcUrl: '', srcNo: 'N1' });
  assert.strictEqual(init.openCheck, true);
  // 날짜를 안 건드리고 저장하면 공고 날짜가 기관 기본값으로 새 나가지 않는다
  const c = ie.scheduleCheck(init.sched, { date: '2026-12-31', confirmed: true, url: '', no: '' });
  assert.strictEqual('contract_end' in c.body, false);
});

test('초기값: 공고 없는 예상일도 _bid로 표시되고, 서버 칸이 없는 행(번들)은 rec 칸으로 대신한다', function () {
  const rec = sd.applyBidCases([sd.mapServerRow(SERVER_ROW)], [
    { institution_id: 'x', bid_case_id: 'b2', confirmed_date: null, expected_date: '2027-03-03', participation_status: '', participation_decision: [] }])[0];
  assert.deepStrictEqual(rec._bid, { date: '2027-03-03', confirmed: false });
  assert.strictEqual(rec.confirmed, false);                   // 화면 확정 표시는 공고 기준
  assert.strictEqual(ie.initial(rec).sched.confirmed, true);  // 모달은 기관 행 값
  assert.deepStrictEqual(ie.initial({ contractEnd: '2026-05-05', confirmed: true }).sched, { date: '2026-05-05', confirmed: true, srcUrl: '', srcNo: '' });
});

// ── 출처 링크 안전 처리(6-D) ───────────────────────────────────────
test('srcInner: http(s)만 링크, esc, 새 창+noopener noreferrer, 호스트(www 뗌), 인터넷 PC 안내', function () {
  const h = ie.srcInner('https://www.g2b.go.kr/x?a=1&b=2', 'R1');
  assert.ok(h.indexOf('href="https://www.g2b.go.kr/x?a=1&amp;b=2"') >= 0);
  assert.ok(h.indexOf('target="_blank" rel="noopener noreferrer"') >= 0);
  assert.ok(h.indexOf('>g2b.go.kr</a>') >= 0);
  assert.ok(h.indexOf('(인터넷 PC에서 열림)') >= 0);
  assert.ok(h.indexOf('공고 번호 <span class="v">R1</span>') >= 0);
  assert.strictEqual(ie.hostOf('https://www.example.co.kr/p'), 'example.co.kr');
});

test('srcInner: javascript: 같은 주소는 링크 없이 글자로만, 번호·주소의 태그는 이스케이프', function () {
  const bad = ie.srcInner('javascript:alert(1)', '<img src=x onerror=1>');
  assert.strictEqual(bad.indexOf('<a '), -1);
  assert.strictEqual(bad.indexOf('<img'), -1);
  assert.ok(bad.indexOf('&lt;img') >= 0);
  assert.strictEqual(ie.srcInner('', ''), '');
});

test('confirmSrcHtml: 기관 행 확정만 출처를 단다 — 출처 없는 확정은 출처 미기록, 공고 날짜·추정·서버 칸 없음은 안 단다', function () {
  const none = ie.confirmSrcHtml({ _inst: { confirmed: true, srcUrl: null, srcNo: null } });
  assert.ok(none.indexOf('<span class="pop-unk">출처 미기록</span>') >= 0);
  assert.ok(ie.confirmSrcHtml({ _inst: { confirmed: true, srcUrl: 'https://www.g2b.go.kr/a', srcNo: 'R1' } }).indexOf('>g2b.go.kr</a>') >= 0);
  assert.strictEqual(ie.confirmSrcHtml({ _inst: { confirmed: true, srcUrl: 'https://a.example/' }, _bid: { date: '2026-09-30', confirmed: true } }), '');
  assert.strictEqual(ie.confirmSrcHtml({ _inst: { confirmed: false } }), '');
  assert.strictEqual(ie.confirmSrcHtml({ confirmed: true }), '');
});

test('현황판 상세: 확정 날짜 옆에 출처가 보이고, 개원 예정 기관에만 운영 상태 줄이 있다', function () {
  const rec = { name: '나시청', type: '지자체', region: '11', contractEnd: '2026-12-31', confirmed: true, lastBid: '2022-12-01', term: 4,
    institutionId: 'y', _inst: { contractEnd: '2026-12-31', confirmed: true, srcUrl: 'https://www.g2b.go.kr/a', srcNo: 'R1' } };
  const pane = dash.paneHtml(dash.itemForRec(rec, TODAY), { act: 'none', today: TODAY });
  assert.ok(pane.indexOf('>g2b.go.kr</a>') >= 0 && pane.indexOf('공고 번호 <span class="v">R1</span>') >= 0);
  assert.strictEqual(pane.indexOf('<dt>운영 상태</dt>'), -1);
  const viaBid = Object.assign({}, rec, { _bid: { date: '2026-12-31', confirmed: true } });
  assert.strictEqual(dash.paneHtml(dash.itemForRec(viaBid, TODAY), { act: 'none', today: TODAY }).indexOf('>g2b.go.kr</a>'), -1);
  const plan = { name: '가법원', type: '법원', region: '11', opStatus: '개원 예정', openDate: '2028-03', institutionId: 'z', _inst: { confirmed: false }, opSrcNo: 'N1' };
  assert.ok(ie.opLineHtml(plan).indexOf('개원 예정 · 개원 예정일 <span class="v">2028-03</span>') === 0);
  assert.strictEqual(ie.opLineHtml({ opStatus: '운영' }), '');
});

// ── 개원 확인 필요(6-E) ───────────────────────────────────────────
test('openCheckList: 개원 예정이고 open_check_needed인 기관만, 개원 예정일 빠른 순 → 이름', function () {
  const list = [
    { name: '다', opStatus: '개원 예정', openCheckNeeded: true, openDate: '2026-05' },
    { name: '가', opStatus: '개원 예정', openCheckNeeded: true, openDate: '2026-05' },
    { name: '나', opStatus: '개원 예정', openCheckNeeded: true, openDate: '2026-01-10' },
    { name: '라', opStatus: '개원 예정', openCheckNeeded: false, openDate: '2030' },
    { name: '마', opStatus: '운영', openCheckNeeded: true, openDate: '2026-01' }];
  assert.deepStrictEqual(ie.openCheckList(list).map(function (r) { return r.name; }), ['나', '가', '다']);
  assert.deepStrictEqual(ie.openCheckList(null), []);
});

test('운영 상태 묶음 펼침: 법원·개원 예정·개원 확인 필요만, 나머지는 접힘', function () {
  assert.ok(ie.expandStatus({ type: '법원' }) && ie.expandStatus({ opStatus: '개원 예정' }) && ie.expandStatus({ openCheckNeeded: true }));
  assert.ok(!ie.expandStatus({ type: '지자체', opStatus: '운영' }));
  const html = ie.statusHtml({ type: '지자체' }, ie.initial({ type: '지자체' }));
  assert.ok(html.indexOf('<details class="ie-det" id="ie-st-det">') === 0 && html.indexOf('운영 상태: 운영 — 바꿀 때만 펼치세요') > 0);
  assert.strictEqual(ie.statusHtml({ type: '법원' }, ie.initial({ type: '법원' })).indexOf('<details'), -1);
});

test('현황판 목록: 개원 확인 필요 토글은 n>0일 때만, 기본 접힘(aria-expanded·aria-controls), 행에 D-day 없음', function () {
  assert.strictEqual(dash.openCheckHtml([], false), '');
  const recs = [{ name: '가법원', region: '11', openDate: '2026-01', opStatus: '개원 예정', openCheckNeeded: true }];
  const shut = dash.openCheckHtml(recs, false);
  assert.ok(shut.indexOf('id="db-chk"') >= 0 && shut.indexOf('aria-expanded="false"') >= 0 && shut.indexOf('aria-controls="db-chklist"') >= 0);
  assert.ok(shut.indexOf('개원 확인 필요 <b>1</b>곳') >= 0 && shut.indexOf('펼치기') >= 0 && shut.indexOf('id="db-chklist"') === -1);
  assert.strictEqual(shut.indexOf('role="listbox"'), -1);
  const open = dash.openCheckHtml(recs, true);
  assert.ok(open.indexOf('aria-expanded="true"') >= 0 && open.indexOf('role="listbox" id="db-chklist"') >= 0 && open.indexOf('aria-label="개원 확인 필요 기관"') >= 0);
  assert.ok(open.indexOf('<span class="db-chk">개원 확인 필요</span>') >= 0 && open.indexOf('개원 예정일 <span class="d">2026-01</span> 지남') >= 0);
  assert.strictEqual(/dg-day|ov-stamp/.test(open), false);
});

test('현황판 상세(개원 확인 필요): 머리에 표시, 운영 상태 줄, [기관 정보 변경]만 — [제안 확정]·입찰 예정일 줄 없음', function () {
  const rec = { name: '가법원', type: '법원', region: '11', opStatus: '개원 예정', openDate: '2026-01', openCheckNeeded: true, institutionId: 'x',
    _inst: { confirmed: false, contractEnd: null, srcUrl: null, srcNo: null }, opSrcNo: 'N1' };
  const h = dash.paneHtml(dash.itemForRec(rec, TODAY), { act: 'opencheck', today: TODAY });
  assert.ok(h.indexOf('<span class="db-chk">개원 확인 필요</span>') >= 0);
  assert.ok(h.indexOf('<dt>운영 상태</dt>') >= 0 && h.indexOf('번호 <span class="v">N1</span>') >= 0);
  assert.ok(h.indexOf('id="db-edit"') >= 0 && h.indexOf('개원했는지 확인하고 출처와 함께 운영 상태를 바꾸세요.') >= 0);
  assert.strictEqual(h.indexOf('id="db-cf"'), -1);
  assert.strictEqual(h.indexOf('<dt>입찰 예정일</dt>'), -1);
});

test('개원 확인 필요 기관의 상세에는 약정 주기 막대가 없다(지난 금고 선정일·주기가 있어도)', function () {
  const rec = { name: '가법원', type: '법원', region: '11', opStatus: '개원 예정', openDate: '2026-01', openCheckNeeded: true, institutionId: 'x',
    lastBid: '2022-12-01', term: 4, contractEnd: '2026-12-01', _inst: { confirmed: false } };
  assert.strictEqual(dash.paneHtml(dash.itemForRec(rec, TODAY), { act: 'opencheck', today: TODAY }).indexOf('db-term'), -1);
  const op = Object.assign({}, rec, { opStatus: '운영', openCheckNeeded: false });
  assert.ok(dash.paneHtml(dash.itemForRec(op, TODAY), { act: 'none', today: TODAY }).indexOf('db-term') >= 0);   // 대조: 막대는 일반 기관에는 그대로
});

test('개원 예정 법원 목록 제외: 서버가 운영이면 번들이 개원 예정이어도 목록에 남고, 서버가 개원 예정이면 번들이 운영이어도 빠진다', function () {
  const bundle = [{ name: '가법원', region: '11', type: '법원', opStatus: '개원 예정' }, { name: '나법원', region: '11', type: '법원', opStatus: '운영' }];
  const srv = [{ name: '가법원', region: '11', type: '법원', opStatus: '운영' }, { name: '나법원', region: '11', type: '법원', opStatus: '개원 예정' }];
  const shown = logic.overlayExtras(srv, bundle).filter(function (r) { return !logic.isOpeningCourt(r); }).map(function (r) { return r.name; });
  assert.deepStrictEqual(shown, ['가법원']);
});

test('출처 없는 번들 확정은 서버 확정 값을 따른다(031 시드 B2 — 공고 진행 표시에서 빠지는 것이 의도된 결과인지는 기획 확인 대기)', function () {
  const bundle = [{ name: '가시청', region: '11', type: '지자체', confirmed: true, contractEnd: '2026-10-16' }];   // 오늘(11-15) 30일 전 확정 공고
  assert.ok(logic.noticeState(bundle[0], TODAY));                                  // 번들 값만이면 공고 진행
  const out = sd.mergeUnion(bundle, [{ institution_id: 'y', name_ko: '가시청', region_code: '11', type: '지자체', contract_end: '2026-10-16', contract_end_confirmed: false }]);
  assert.strictEqual(out[0].confirmed, false);
  assert.strictEqual(logic.noticeState(out[0], TODAY), null);
});

test('applyBidCases 다시 적용: 공고가 없어지면 낡은 _bid를 지운다(날짜 없는 공고도 _bid를 남기지 않는다)', function () {
  const base = [sd.mapServerRow(SERVER_ROW)];
  const once = sd.applyBidCases(base, [{ institution_id: 'x', bid_case_id: 'b1', confirmed_date: '2026-09-30', expected_date: null, participation_status: '', participation_decision: [] }]);
  assert.deepStrictEqual(once[0]._bid, { date: '2026-09-30', confirmed: true });
  const twice = sd.applyBidCases(once, []);
  assert.strictEqual('_bid' in twice[0], false);
  assert.ok('_bid' in once[0]);                                                    // 원본 목록은 바꾸지 않는다
  const noDate = sd.applyBidCases(once, [{ institution_id: 'x', bid_case_id: 'b1', confirmed_date: null, expected_date: null, participation_status: '', participation_decision: [] }]);
  assert.strictEqual('_bid' in noDate[0], false);
});

test('내보내기: _로 시작하는 내부 키(_inst·_bid)는 데이터 파일에 넣지 않는다', function () {
  const exporter = require('../js/export.js');
  const text = exporter.serializeInstitutions([{ name: '가', _inst: { confirmed: true }, _bid: { date: '2026-09-30' }, contractEnd: '2026-12-31' }]);
  assert.strictEqual(text.indexOf('_inst'), -1);
  assert.strictEqual(text.indexOf('_bid'), -1);
  assert.ok(text.indexOf('"contractEnd": "2026-12-31"') > 0 && text.indexOf('window.institutions = [') === 0);
});

test('배선: 개원 확인 필요 목록도 종류 필터를 따른다', function () {
  assert.ok(/dash\.kindOfRec\(r\) === st\.type/.test(read('js/dashboard.js')));   // 개원 확인 필요 목록도 종류 필터를 따른다
});

// ── 오류 글·헤더 ───────────────────────────────────────────────────
test('errText: 서버 문구를 그대로, 문구가 없으면 상태별 안내(alert 대신 묶음 안에 보인다)', function () {
  assert.strictEqual(ie.errText(400, { code: 'BAD_REQUEST', message: '확정하려면 출처(공고 링크 또는 번호)가 필요합니다.' }), '확정하려면 출처(공고 링크 또는 번호)가 필요합니다.');
  assert.strictEqual(ie.errText(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.'), '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  assert.strictEqual(ie.errText(0, null), '서버에 연결하지 못해 저장하지 않았습니다. 서버가 켜져 있는지 확인하세요.');
  assert.strictEqual(ie.errText(403, null), '이 기능을 쓸 권한이 없습니다.');
  assert.ok(ie.errText(500, null).indexOf('(500)') > 0);
});

test('헤더: PUT은 institution_edit + 묶음별 버튼 ID(서버 허용 목록과 같은 이름)', function () {
  assert.deepStrictEqual(ie.headers(ie.BTN.sched), { 'Content-Type': 'application/json', 'X-Screen-Id': 'institution_edit', 'X-Button-Id': 'save_schedule' });
  assert.deepStrictEqual([ie.BTN.basic, ie.BTN.sched, ie.BTN.status, ie.BTN.open], ['save_basic', 'save_schedule', 'save_open_status', 'open_edit']);
  const java = fs.readFileSync(path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'InstUiIds.java'), 'utf8');
  [ie.SCREEN, ie.BTN.basic, ie.BTN.sched, ie.BTN.status, ie.BTN.open].forEach(function (id) { assert.ok(java.indexOf('"' + id + '"') > 0, id); });
});

// ── 배선(소스 단언) ────────────────────────────────────────────────
test('배선: 모달 접근성 마크업·script 순서·공용 닫기 제외·alert 없음·내부 이름 문구 교체', function () {
  const html = read('index.html');
  const m = html.slice(html.indexOf('<div id="edit-modal"'), html.indexOf('<div id="theme-modal"'));
  assert.ok(/role="dialog" aria-modal="true" aria-labelledby="ie-t"/.test(m) && m.indexOf('id="ie-t"') > 0);
  assert.ok(m.indexOf('id="edit-save"') < 0 && m.indexOf('sources는') < 0);
  const at = function (s) { return html.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('instedit.js') > at('errtext.js') && at('instedit.js') > at('logic.js') && at('instedit.js') < at('dashboard.js') && at('instedit.js') < at('render.js'));
  assert.ok(/ov\.id !== 'edit-modal'/.test(read('js/app.js')));
  const src = read('js/instedit.js');
  assert.ok(!/\balert\(/.test(src) && !/\bconfirm\(/.test(src));
  assert.ok(/role="alert"/.test(src) && /role="status"/.test(src));
  assert.ok(/aria-describedby/.test(src) && /aria-invalid/.test(src));
  assert.ok(/\.ie-err \{[^}]*color-mix\(in srgb, var\(--red\) 72%, #fff\)/.test(html));
});

test('store: LOCAL_ONLY_FIELDS에서 확정 여부가 빠졌다(서버 칸)', function () {
  const store = require('../js/store.js');
  assert.deepStrictEqual(store.LOCAL_ONLY_FIELDS, ['subRegion', 'contractExpiry', 'lng', 'lat', 'sources', 'updatedAt']);
});
