// 로그인 화면 히어로(js/login-hero.js)의 순수 함수와 마크업·연결 소스 단언.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hero = require('../js/login-hero.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const D = function (y, m, d) { return new Date(y, m - 1, d, 13, 30); };   // 시각이 있어도 날짜만 본다

const NOTICE = {
  id: 'n', kind: 'notice', topic: '접수', say: '11월 16일,\n접수가 열립니다', sayOpen: '지금\n접수 중입니다',
  org: '마포구', title: '금고지정 계획 공고', noticeNo: '제2026-1729호',
  noticeFrom: '2026-10-29', noticeTo: '2026-11-18', receiveFrom: '2026-11-16', receiveTo: '2026-11-19', contractEnd: '2026-12-31'
};
const FLOW = { id: 'f', kind: 'flow', topic: '흐름', say: '문구', steps: [{ title: '가', desc: '나' }] };

test('dday: 오늘부터 접수 시작까지 남은 일수(시각 무시), 지나면 음수', function () {
  assert.strictEqual(hero.dday(D(2026, 11, 11), '2026-11-16'), 5);
  assert.strictEqual(hero.dday(new Date(2026, 10, 11, 23, 59), '2026-11-16'), 5);
  assert.strictEqual(hero.dday(D(2026, 11, 16), '2026-11-16'), 0);
  assert.strictEqual(hero.dday(D(2026, 11, 20), '2026-11-19'), -1);
  assert.strictEqual(hero.dday(D(2026, 12, 30), '2027-01-02'), 3);   // 해가 바뀌어도
  assert.ok(Number.isNaN(hero.dday(D(2026, 11, 11), '2026-13-01')));
  assert.ok(Number.isNaN(hero.dday(D(2026, 11, 11), '2026-02-30')));
  assert.ok(Number.isNaN(hero.dday(D(2026, 11, 11), '11/16')));
});

test('ddayLabel: D-n / D-DAY / D+n', function () {
  assert.strictEqual(hero.ddayLabel(5), 'D-5');
  assert.strictEqual(hero.ddayLabel(0), 'D-DAY');
  assert.strictEqual(hero.ddayLabel(-2), 'D+2');
  assert.strictEqual(hero.ddayLabel(NaN), '');
});

test('날짜 글자: 기간·단일·점 표기', function () {
  assert.strictEqual(hero.rangeText('2026-10-29', '2026-11-18'), '2026. 10. 29.–11. 18.');
  assert.strictEqual(hero.rangeText('2026-12-20', '2027-01-05'), '2026. 12. 20.–2027. 1. 5.');
  assert.strictEqual(hero.fullDate('2026-12-31'), '2026. 12. 31.');
  assert.strictEqual(hero.korDate(D(2026, 11, 11)), '11월 11일');
  assert.strictEqual(hero.dotDate(D(2026, 3, 5)), '03.05');
});

test('timelinePct: 공고~접수마감 줄의 위치, 범위 밖은 0·100으로 자른다', function () {
  assert.strictEqual(hero.timelinePct('2026-11-11', '2026-10-29', '2026-11-19'), 61.9);
  assert.strictEqual(hero.timelinePct('2026-11-16', '2026-10-29', '2026-11-19'), 85.7);
  assert.strictEqual(hero.timelinePct('2026-10-01', '2026-10-29', '2026-11-19'), 0);
  assert.strictEqual(hero.timelinePct('2027-01-01', '2026-10-29', '2026-11-19'), 100);
});

test('withinSixMonths: 오늘부터 183일 안(과거 제외)', function () {
  assert.strictEqual(hero.withinSixMonths(D(2026, 11, 11), '2026-12-31'), true);
  assert.strictEqual(hero.withinSixMonths(D(2026, 11, 11), '2028-12-31'), false);
  assert.strictEqual(hero.withinSixMonths(D(2026, 11, 11), '2026-11-01'), false);
});

test('noticeView: 접수 전 · 접수 중 · 끝남', function () {
  const b = hero.noticeView(NOTICE, D(2026, 11, 11));
  assert.strictEqual(b.state, 'before');
  assert.strictEqual(b.big, 'D-5');
  assert.strictEqual(b.cap, '접수 시작까지, 11월 11일 기준');
  assert.deepStrictEqual(b.sayLines, ['11월 16일,', '접수가 열립니다']);
  assert.strictEqual(b.startPct, 85.7);
  assert.strictEqual(b.todayPct, 61.9);
  assert.strictEqual(b.showToday, true);
  assert.strictEqual(b.chip, true);

  const o = hero.noticeView(NOTICE, D(2026, 11, 16));   // 접수 첫날은 '접수 중'
  assert.strictEqual(o.state, 'open');
  assert.strictEqual(o.big, 'D-3');
  assert.strictEqual(o.cap, '접수 마감까지, 11월 16일 기준');
  assert.deepStrictEqual(o.sayLines, ['지금', '접수 중입니다']);
  assert.strictEqual(o.showToday, false);
  assert.strictEqual(hero.noticeView(NOTICE, D(2026, 11, 19)).big, 'D-DAY');
  assert.strictEqual(hero.noticeView(NOTICE, D(2026, 11, 20)).state, 'closed');

  // 접수 시작 하루 전: '오늘' 글자가 '접수 시작'과 겹치므로 뺀다
  assert.strictEqual(hero.noticeView(NOTICE, D(2026, 11, 15)).showToday, false);
  // sayOpen이 없으면 say를 그대로 쓴다
  const s2 = Object.assign({}, NOTICE); delete s2.sayOpen;
  assert.deepStrictEqual(hero.noticeView(s2, D(2026, 11, 17)).sayLines, ['11월 16일,', '접수가 열립니다']);
});

test('problems/isValid: 필수 칸·kind·날짜 형식', function () {
  assert.deepStrictEqual(hero.problems(NOTICE), []);
  assert.deepStrictEqual(hero.problems(FLOW), []);
  assert.ok(hero.problems(Object.assign({}, FLOW, { kind: 'video' })).indexOf('kind') >= 0);
  assert.ok(hero.problems(Object.assign({}, FLOW, { say: '  ' })).indexOf('say') >= 0);
  assert.ok(hero.problems(Object.assign({}, FLOW, { steps: [] })).indexOf('steps') >= 0);
  assert.ok(hero.problems(Object.assign({}, NOTICE, { receiveTo: '2026-11-31' })).indexOf('receiveTo') >= 0);
  assert.ok(hero.problems(Object.assign({}, NOTICE, { receiveFrom: '2026-11-20' })).indexOf('날짜 순서') >= 0);
  assert.ok(hero.problems({ id: 'd', kind: 'districts', topic: 't', say: 's', mode: 'x', items: [] }).length >= 2);
  assert.ok(hero.problems({ id: 'h', kind: 'heatmap', topic: 't', say: 's', hot: [{ code: '1114' }], hotText: 'a', farText: 'b' }).indexOf('hot[0]') >= 0);
  assert.ok(hero.problems(null).length > 0);
  assert.strictEqual(hero.isValid(FLOW), true);
});

test('activeSlides: 틀린 장·지난 장·중복 id·접수 끝난 장은 조용히 빠진다', function () {
  const bad = { id: 'x', kind: 'nope', topic: 't', say: 's' };
  const empty = Object.assign({}, FLOW, { id: 'e', say: '' });
  const dup = Object.assign({}, FLOW);
  const old = Object.assign({}, FLOW, { id: 'old', showUntil: '2026-11-10' });
  const edge = Object.assign({}, FLOW, { id: 'edge', showUntil: '2026-11-11' });
  const ids = hero.activeSlides([NOTICE, bad, empty, FLOW, dup, old, edge], D(2026, 11, 11)).map(function (s) { return s.id; });
  assert.deepStrictEqual(ids, ['n', 'f', 'edge']);   // showUntil 당일까지는 보인다
  // 접수가 끝나면 notice를 뺀다
  assert.deepStrictEqual(hero.activeSlides([NOTICE, FLOW], D(2026, 11, 20)).map(function (s) { return s.id; }), ['f']);
  // 남은 게 없거나 배열이 아니면 빈 배열(히어로를 숨긴다)
  assert.deepStrictEqual(hero.activeSlides([bad, empty], D(2026, 11, 11)), []);
  assert.deepStrictEqual(hero.activeSlides(undefined, D(2026, 11, 11)), []);
});

test('keyTarget: ←/→ 순환, Home/End, 그 밖의 키는 null', function () {
  assert.strictEqual(hero.keyTarget('ArrowRight', 2, 5), 3);
  assert.strictEqual(hero.keyTarget('ArrowRight', 4, 5), 0);
  assert.strictEqual(hero.keyTarget('ArrowLeft', 0, 5), 4);
  assert.strictEqual(hero.keyTarget('ArrowLeft', 3, 5), 2);
  assert.strictEqual(hero.keyTarget('Home', 3, 5), 0);
  assert.strictEqual(hero.keyTarget('End', 1, 5), 4);
  assert.strictEqual(hero.keyTarget('Tab', 1, 5), null);
  assert.strictEqual(hero.keyTarget('Enter', 1, 5), null);
  assert.strictEqual(hero.keyTarget('ArrowRight', 0, 0), null);
  assert.strictEqual(hero.wrap(-1, 5), 4);
  assert.strictEqual(hero.wrap(5, 5), 0);
});

test('canRun: 재생 중이고 마우스·포커스·가려진 탭·좁은 폭이 아닐 때만 자동으로 넘긴다', function () {
  const ok = { wantPlay: true, hover: false, focus: false, hiddenTab: false, narrow: false };
  assert.strictEqual(hero.canRun(ok), true);
  ['hover', 'focus', 'hiddenTab', 'narrow'].forEach(function (k) {
    const s = Object.assign({}, ok); s[k] = true;
    assert.strictEqual(hero.canRun(s), false, k);
  });
  assert.strictEqual(hero.canRun(Object.assign({}, ok, { wantPlay: false })), false);   // 멈춤·reduced-motion
  assert.strictEqual(hero.DUR, 6000);
});

test('index.html: 로그인 id 7개가 #login-view 안에 있고, 접근성 구조·연결이 규격대로다', function () {
  const start = html.indexOf('<div id="login-view"');
  const end = html.indexOf('<header>', start);
  assert.ok(start > 0 && end > start);
  const block = html.slice(start, end);
  ['login-view', 'login-id', 'login-pw', 'login-role', 'login-msg', 'login-go', 'login-guest'].forEach(function (id) {
    assert.ok(html.indexOf('id="' + id + '"') > 0, id);
  });
  ['login-id', 'login-pw', 'login-role', 'login-msg', 'login-go', 'login-guest'].forEach(function (id) {
    assert.ok(block.indexOf('id="' + id + '"') > 0, id + '는 #login-view 안에');
  });
  assert.ok(!/id="login-view"[^>]*role="dialog"/.test(html), 'role=dialog 제거');
  assert.ok(/id="login-msg"[^>]*role="status"[^>]*aria-live="polite"/.test(block));
  assert.ok(/id="login-id"[^>]*aria-describedby="login-msg"/.test(block));
  assert.ok(/id="login-pw"[^>]*autocomplete="current-password"/.test(block));
  assert.ok(!/<form[\s>]/.test(block), '<form> 없음(Enter 처리는 app.js 한 곳)');
  assert.ok(/id="lg-hero"[^>]*aria-roledescription="슬라이드 묶음"/.test(block));
  assert.ok(/id="login-view" role="region" aria-label="로그인 화면"/.test(block));
  // 조작 줄은 DOM에서 슬라이드 앞, 화면에서는 아래(CSS grid-row), 평소 흐리고 hover/focus-within에서 또렷
  assert.ok(block.indexOf('class="lg-ctl"') < block.indexOf('id="lg-slides"'));
  assert.ok(/\.lg-slides \{ grid-row:1; \}/.test(html) && /\.lg-ctl \{ grid-row:2;[^}]*opacity:\.55/.test(html));
  assert.ok(/\.lg-hero:hover \.lg-ctl, \.lg-hero:focus-within \.lg-ctl \{ opacity:1; \}/.test(html));
  // 호버·눌림에서 테두리색 유지·이동 없음, 꺼진 점 #626d81
  assert.ok(/\.lg-ghost:hover \{[^}]*border-color:#626d81/.test(html) && /\.lg-cbtn:hover \{[^}]*border-color:#626d81/.test(html));
  assert.ok(/\.lg-ghost:active, #login-view \.lg-cbtn:active, #login-view \.lg-dot:active \{ transform:none/.test(html));
  assert.ok(/\.lg-dot::before \{[^}]*background:#626d81/.test(html));
  assert.ok(/animation-delay:var\(--lg-delay/.test(html), '재생 재개 때 진행 막대를 남은 시간에 맞춘다');
  ['lg-play', 'lg-prev', 'lg-next', 'lg-dots', 'lg-slides', 'lg-n', 'lg-total', 'lg-topic'].forEach(function (id) {
    assert.ok(block.indexOf('id="' + id + '"') > 0, id);
  });
  assert.ok(html.indexOf('login-bg') < 0, '옛 배경 그림 참조 제거');
  assert.ok(/\.sr-only \{/.test(html), '.sr-only 규칙 존재');
  assert.ok(/\.login-card h1 \{/.test(html));
  // 스크립트 순서: 데이터 → 히어로 → app.js
  const iData = html.lastIndexOf('<script src="data/login-slides.js">'), iHero = html.lastIndexOf('<script src="js/login-hero.js">'), iApp = html.lastIndexOf('<script src="js/app.js">');
  assert.ok(iData > 0 && iHero > iData && iApp > iHero);
  assert.ok(html.indexOf('geo/seoul.js') > 0, '서울 경계 파일이 이미 로드된다');
});

test('app.js: #login-view를 숨기는 모든 경로에서 destroy, 보이는 경로에서 mount', function () {
  const hideAt = [];
  appSrc.replace(/classList\.add\('hidden'\)/g, function (m, i) { hideAt.push(i); return m; });
  assert.ok(hideAt.length >= 2, '숨기는 곳 2곳(로그인 성공·세션 복원)');
  hideAt.forEach(function (i) {
    assert.ok(appSrc.slice(i, i + 260).indexOf('loginHero.destroy()') > 0, '숨긴 직후 destroy: ' + i);
  });
  assert.ok(/classList\.remove\('hidden'\);\s*\n\s*app\.setBehindInert\(true\);\s*\n\s*if \(root\.loginHero\) root\.loginHero\.mount\(\)/.test(appSrc), 'showLogin에서 mount');
  assert.ok(/app\.setBehindInert\(true\);\s*\n\s*if \(root\.loginHero\) root\.loginHero\.mount\(\)/.test(appSrc), '세션 없을 때 첫 mount + 뒤 화면 inert');
  assert.ok(appSrc.indexOf("setAttribute('aria-invalid', 'true')") > 0);
  // 뒤 화면 inert: 보일 때 켜고 숨길 때 끈다
  assert.ok(/app\.showLogin = [\s\S]{0,300}app\.setBehindInert\(true\)/.test(appSrc));
  assert.ok(/classList\.add\('hidden'\);\s*\n\s*app\.setBehindInert\(false\)/.test(appSrc));
  assert.ok(/'inert'/.test(appSrc));
  // 로그인 요청 대기 중 중복 실행 막기
  assert.ok(/let loginBusy = false/.test(appSrc) && /if \(loginBusy\) return;/.test(appSrc));
  assert.ok(/'login-guest'\)\.addEventListener\('click', function \(\) \{\s*\n\s*if \(loginBusy\) return;/.test(appSrc));
  assert.ok(/loginBusy = false; byId\('login-go'\)\.disabled = false/.test(appSrc));
});

// ── 새 종류·검증 보강·자리표시 ─────────────────────────────────────────────
const logicMod = require('../js/logic.js');
const REC = function (name, o) { return Object.assign({ name: name, region: '11', type: '지자체', lastBid: '2026-01-01', term: 1, confirmed: true }, o); };

test('fill: {receiveFrom}·{receiveTo}는 슬라이드 날짜, {count}는 vars, 모르는 자리표시는 그대로', function () {
  assert.strictEqual(hero.fill('{receiveFrom},\n열립니다', NOTICE), '11월 16일,\n열립니다');
  assert.strictEqual(hero.fill('{receiveTo}까지', NOTICE), '11월 19일까지');
  assert.strictEqual(hero.fill('{count}곳', NOTICE, { count: 7 }), '7곳');
  assert.strictEqual(hero.fill('{nothing}', NOTICE), '{nothing}');
  const s = Object.assign({}, NOTICE, { say: '{receiveFrom},\n열립니다', sayOpen: '{receiveTo}까지\n접수 중' });
  assert.deepStrictEqual(hero.noticeView(s, D(2026, 11, 11)).sayLines, ['11월 16일,', '열립니다']);
  assert.deepStrictEqual(hero.noticeView(s, D(2026, 11, 17)).sayLines, ['11월 19일까지', '접수 중']);
});

test('noticeView: 공고 전이면 오늘 표시 없음, 접수 중이면 점은 남기고 글자만 숨김 정보', function () {
  const v = hero.noticeView(NOTICE, D(2026, 10, 20));
  assert.strictEqual(v.state, 'before');
  assert.strictEqual(v.beforeNotice, true);
  assert.strictEqual(v.showToday, false);
  assert.strictEqual(hero.noticeView(NOTICE, D(2026, 11, 17)).beforeNotice, false);
});

test('problems 보강: id 형식·hot 중복·noticeFrom≤noticeTo·길이·개수 상한', function () {
  assert.ok(hero.problems(Object.assign({}, FLOW, { id: 'Bad Id' })).indexOf('id') >= 0);
  assert.ok(hero.problems(Object.assign({}, FLOW, { id: 'ok-id-2' })).length === 0);
  assert.ok(hero.problems(Object.assign({}, FLOW, { say: 'ㄱ'.repeat(61) })).indexOf('say') >= 0);
  assert.ok(hero.problems(Object.assign({}, FLOW, { topic: 'ㄱ'.repeat(21) })).indexOf('topic') >= 0);
  assert.ok(hero.problems(Object.assign({}, NOTICE, { noticeTo: '2026-10-01' })).indexOf('날짜 순서') >= 0);
  const hotDup = { id: 'h', kind: 'heatmap', topic: 't', say: 's', hot: [{ code: '11140' }, { code: '11140' }], hotText: 'a', farText: 'b' };
  assert.ok(hero.problems(hotDup).indexOf('hot[1]') >= 0);
  const many = []; for (let i = 0; i < 7; i += 1) many.push({ code: '1114' + i, name: 'n', what: 'w' });
  assert.ok(hero.problems({ id: 'd', kind: 'districts', mode: 'new', topic: 't', say: 's', items: many }).indexOf('items') >= 0);
  const steps = []; for (let i = 0; i < 7; i += 1) steps.push({ title: 'a', desc: 'b' });
  assert.ok(hero.problems(Object.assign({}, FLOW, { steps: steps })).indexOf('steps') >= 0);
});

const CARD = { name: 'A', kindLabel: '공기업', bank: '국민은행 우선협상', term: '4년', src: '출처' };
const CARDS = { id: 'c', kind: 'cards', topic: '카드', say: '문구', items: [CARD, CARD, CARD] };
const TL = { id: 't', kind: 'timeline', topic: '일정', say: '{count}곳' };

test('cards 검증: 3~6장, 필수 칸, pending은 불리언', function () {
  assert.deepStrictEqual(hero.problems(CARDS), []);
  assert.ok(hero.problems(Object.assign({}, CARDS, { items: [CARD, CARD] })).indexOf('items') >= 0);
  assert.ok(hero.problems(Object.assign({}, CARDS, { items: [CARD, CARD, CARD, CARD, CARD, CARD, CARD] })).indexOf('items') >= 0);
  assert.ok(hero.problems(Object.assign({}, CARDS, { items: [CARD, CARD, Object.assign({}, CARD, { bank: '' })] })).indexOf('items[2]') >= 0);
  assert.ok(hero.problems(Object.assign({}, CARDS, { items: [CARD, CARD, Object.assign({}, CARD, { pending: 'yes' })] })).indexOf('items[2]') >= 0);
  assert.deepStrictEqual(hero.problems(Object.assign({}, CARDS, { items: [CARD, CARD, Object.assign({}, CARD, { pending: true })] })), []);
});

test('timeline 검증: 공통 칸만 있으면 정상', function () {
  assert.deepStrictEqual(hero.problems(TL), []);
  assert.ok(hero.problems(Object.assign({}, TL, { say: '' })).indexOf('say') >= 0);
});

test('bidItems: 6개월 안(0~182일) 날짜순, 개원 예정·날짜 없음·지난 건 제외, 최대 8개, total은 자르기 전 수', function () {
  const today = D(2026, 11, 11);
  const recs = [
    REC('가', { contractEnd: '2026-11-20' }),                    // D-9, 확정
    REC('나', { contractEnd: '2027-05-10', confirmed: false }),   // D-180, 추정
    REC('다', { contractEnd: '2027-05-13' }),                    // D-183 → 밖
    REC('라', { contractEnd: '2026-11-01' }),                    // 지남 → 밖
    REC('마', { lastBid: undefined, term: undefined }),          // 날짜 없음
    REC('바', { type: '법원', opStatus: '개원 예정', contractEnd: '2026-12-01' }),
    REC('사', { type: '공기업', contractEnd: '2026-11-11' })      // D-day
  ];
  const r = hero.bidItems(recs, today, logicMod);
  assert.deepStrictEqual(r.items.map(function (x) { return x.name; }), ['사', '가', '나']);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.items[0].label, 'D-DAY');
  assert.strictEqual(r.items[0].kind, '공공기관');   // 종류 배지는 logic.kindOf로 접은 이름
  assert.strictEqual(r.items[1].label, 'D-9');
  assert.strictEqual(r.items[1].est, false);
  assert.strictEqual(r.items[2].est, true);
  // 같은 기관(지역|이름) 중복은 한 번만, 9곳 이상이면 8곳까지만
  const many = []; for (let i = 0; i < 12; i += 1) many.push(REC('기관' + (i < 10 ? '0' : '') + i, { contractEnd: '2026-11-' + (12 + i) }));
  const r2 = hero.bidItems(many.concat([many[0]]), today, logicMod);
  assert.strictEqual(r2.items.length, 8);
  assert.strictEqual(r2.total, 12);
  assert.strictEqual(hero.bidItems([], today, logicMod).total, 0);
  assert.strictEqual(hero.bidItems(recs, today, null).total, 0);
});

test('activeSlides: timeline은 6개월 안 입찰이 0곳이거나 ctx가 없으면 빠진다', function () {
  const today = D(2026, 11, 11);
  const ctx = { records: [REC('가', { contractEnd: '2026-11-20' })], logic: logicMod };
  const ids = function (l, c) { return hero.activeSlides(l, today, c).map(function (s) { return s.id; }); };
  assert.deepStrictEqual(ids([TL, FLOW], ctx), ['t', 'f']);
  assert.deepStrictEqual(ids([TL, FLOW], { records: [], logic: logicMod }), ['f']);
  assert.deepStrictEqual(ids([TL, FLOW]), ['f']);
  assert.deepStrictEqual(ids([TL, FLOW], { records: [REC('가', { contractEnd: '2028-01-01' })], logic: logicMod }), ['f']);
});
