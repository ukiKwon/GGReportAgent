// 공고 진행 중 표현(2026-11-12): 판정(noticeState·noticeSummary)·지도 점수/색/라벨/툴팁/aria/범례/티커·
// 지자체 외 168곳 합침·종류 5종 필터·현황판 띠/칩/자동 선택/링크.
// 규격: handoff/agents/design-reviewer/2026-11-12_1522_a614097e.md, 시안 docs/design/2026-11-12_진행중공고_시안.html
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const store = require('../js/store.js');
const render = require('../js/render.js');
const dash = require('../js/dashboard.js');
const nonmuni = require('../data/institutions_nonmuni.js');

const TODAY = new Date('2026-11-12T00:00:00');   // 로컬 자정
function plus(days) { return logic.localDateStr(new Date(2026, 10, 12 + days)); }
function md(days) { return plus(days).slice(5).replace('-', '.'); }
// 확정 공고: 공고 후 since일. extra로 receiveTo 등을 준다.
function nrec(name, since, extra) {
  return Object.assign({ name: name, region: '11', type: '지자체', contractEnd: plus(-since), confirmed: true }, extra || {});
}
function withDoc(doc, fn) {
  const prev = global.document;
  global.document = doc;
  try { return fn(); } finally { if (prev === undefined) delete global.document; else global.document = prev; }
}

// ── 판정 ────────────────────────────────────────────────────────────
test('noticeState 경계: 공고 후 0·120일은 진행 중, 121일·공고일이 미래·미확정·공고일 없음은 null', () => {
  assert.strictEqual(logic.NOTICE_ACTIVE_DAYS, 120);
  assert.strictEqual(logic.noticeState(nrec('a', 0), TODAY).since, 0);
  assert.strictEqual(logic.noticeState(nrec('a', 120), TODAY).since, 120);
  assert.strictEqual(logic.noticeState(nrec('a', 121), TODAY), null);
  assert.strictEqual(logic.noticeState(nrec('a', -1), TODAY), null);                 // 공고일이 내일 → 기존대로 예정
  assert.strictEqual(logic.noticeState(nrec('a', 10, { confirmed: false }), TODAY), null);
  assert.strictEqual(logic.noticeState({ name: 'a', confirmed: true }, TODAY), null);
  assert.strictEqual(logic.noticeState(null, TODAY), null);
});

test('noticeState 단계: receiveTo 당일·이후는 마감 전, 지남은 마감 지남, 없거나 틀리면 마감일 미확인', () => {
  const at = function (to) { return logic.noticeState(nrec('a', 10, to === undefined ? {} : { receiveTo: to }), TODAY); };
  assert.strictEqual(at(plus(0)).phase, 'receiving');
  assert.strictEqual(at(plus(0)).deadlineDays, 0);
  assert.strictEqual(at(plus(4)).phase, 'receiving');
  assert.strictEqual(at(plus(4)).deadlineDays, 4);
  assert.strictEqual(at(plus(-1)).phase, 'awaiting');
  assert.strictEqual(at(plus(-1)).deadlineDays, -1);
  assert.strictEqual(at().phase, 'unknown');
  assert.strictEqual(at().deadlineDays, null);
  assert.strictEqual(at('2026-13-45').phase, 'unknown');
  const full = logic.noticeState(nrec('a', 10, { receiveFrom: plus(2), receiveTo: plus(5) }), TODAY);
  assert.strictEqual(full.receiveFrom, plus(2)); assert.strictEqual(full.receiveTo, plus(5));
});

test('effectiveBid는 그대로 — 진행 중 판정이 날짜 규칙을 바꾸지 않는다', () => {
  const r = nrec('a', 10);
  assert.deepStrictEqual(logic.effectiveBid(r), { date: r.contractEnd, confidence: '확정', basis: 'notice' });
});

test('noticeSummary: 마감 전(마감 가까운 순) → 마감일 미확인 → 마감 지남, 뒤의 둘은 공고 후 일수 순, 기관 단위 중복 제거', () => {
  const list = [
    nrec('지남50', 50, { receiveTo: plus(-3) }), nrec('미확인30', 30), nrec('마감9', 5, { receiveTo: plus(9) }),
    nrec('지남10', 10, { receiveTo: plus(-1) }), nrec('미확인20', 20), nrec('마감3', 8, { receiveTo: plus(3) }),
    nrec('마감3', 8, { receiveTo: plus(3) }),   // 같은 기관 반복
    nrec('경과', 200), nrec('예정', -20),
  ];
  const s = logic.noticeSummary(list, TODAY);
  assert.deepStrictEqual(s.items.map(i => i.name), ['마감3', '마감9', '미확인20', '미확인30', '지남10', '지남50']);
  assert.deepStrictEqual([s.receiving, s.unknown, s.awaiting], [2, 2, 2]);
  assert.strictEqual(s.items[0].deadlineDays, 3);
  assert.strictEqual(s.items[0].date, plus(-8));
});

// ── 점수·섞기 ───────────────────────────────────────────────────────
test('instScore·isOverdue: 마감 전·마감일 미확인은 +2, 마감 지남은 색에서 빼고(null), 진행 중은 경과가 아니다', () => {
  const rcv = nrec('r', 10, { receiveTo: plus(4) }), unk = nrec('u', 10), awa = nrec('w', 10, { receiveTo: plus(-1) });
  assert.strictEqual(logic.instScore(rcv, TODAY), 2);
  assert.strictEqual(logic.instScore(unk, TODAY), 2);
  assert.strictEqual(logic.instScore(awa, TODAY), null);
  [rcv, unk, awa].forEach(r => assert.strictEqual(logic.isOverdue(r, TODAY), false));
  assert.strictEqual(logic.isOverdue(nrec('old', 130), TODAY), true);   // 120일을 넘으면 기존대로 경과
});

test('regionMix: notice·noticeOpen·receiving 수, 점수 +2, ▲(urgent)는 6개월 안 예정만', () => {
  const list = [
    nrec('A', 10, { receiveTo: plus(4) }), nrec('B', 20), nrec('C', 50, { receiveTo: plus(-10) }),
    { name: 'D', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false },
  ];
  const m = logic.regionMix(list, TODAY);
  assert.strictEqual(m.notice, 3); assert.strictEqual(m.noticeOpen, 2);
  assert.strictEqual(m.receiving, 1); assert.strictEqual(m.awaiting, 1);
  assert.strictEqual(m.urgent, 1); assert.strictEqual(m.within6, 1);        // 진행 중은 ▲에 세지 않는다
  assert.strictEqual(m.dated, 3); assert.strictEqual(m.mean, 2); assert.strictEqual(m.band, 'r3');
  assert.strictEqual(m.overdue, 0);
  assert.strictEqual(m.imminent.name, 'D');                                  // 가장 임박은 공고 전 예정 기관
  assert.deepStrictEqual(m.notices.map(n => n.name), ['A', 'B', 'C']);
  assert.strictEqual(logic.urgentMark(m), '△1');
  // 마감 지난 곳만 있으면 색에서 빠져 회색, 개수는 notice로 센다
  const only = logic.regionMix([nrec('C', 50, { receiveTo: plus(-10) })], TODAY);
  assert.strictEqual(only.band, 'gray'); assert.strictEqual(only.notice, 1); assert.strictEqual(only.noticeOpen, 0);
});

test('mostImminent: 마감 전 공고가 맨 앞(마감 가까운 곳), 없으면 기존 규칙', () => {
  const soon = { name: '예정', region: '11', type: '지자체', contractEnd: plus(5), confirmed: false };
  const r9 = nrec('마감9', 5, { receiveTo: plus(9) }), r3 = nrec('마감3', 8, { receiveTo: plus(3) });
  assert.strictEqual(logic.mostImminent([soon, r9, r3], TODAY).name, '마감3');
  assert.strictEqual(logic.mostImminent([soon, nrec('미확인', 5)], TODAY).name, '미확인');   // 미확인은 기존대로 날짜가 가장 이른 쪽
  assert.strictEqual(logic.mostImminent([soon], TODAY).name, '예정');
});

test('overdueSummary: 진행 중은 경과 목록에서 빠지고(check 판정보다 먼저), 별도로 센다', () => {
  const list = [
    nrec('진행', 10, { receiveTo: plus(4) }),
    nrec('관악구청', 10),                                       // '날짜 의미 확인 중' 키지만 진행 중이 먼저다
    nrec('경과확정', 200),
    { name: '추정경과', region: '11', type: '지자체', contractEnd: plus(-5), confirmed: false },
  ];
  const s = logic.overdueSummary(list, TODAY);
  assert.deepStrictEqual(s.items.map(i => i.name).sort(), ['경과확정', '추정경과']);
  assert.strictEqual(s.notice, 2);
  assert.ok(s.items.every(i => i.kind !== 'check'));
});

// ── 종류 5종·지자체 외 합침 ─────────────────────────────────────────
test('KIND_OF_TYPE: 교육청·지방공기업은 공공기관으로 접는다', () => {
  assert.strictEqual(logic.kindOf('교육청'), '공공기관');
  assert.strictEqual(logic.kindOf('지방공기업'), '공공기관');
  nonmuni.forEach(r => assert.ok(logic.kindOf(r.type), r.name + ': 종류를 모른다 ' + r.type));
});

test('지자체 외 기관 합침: 개원 예정 법원은 빼고, 지도·현황판이 같은 목록을 쓴다', () => {
  const open = nonmuni.filter(r => !(r.type === '법원' && r.opStatus === '개원 예정'));
  const planned = nonmuni.length - open.length;
  assert.ok(planned > 0, '개원 예정 법원이 데이터에 있어야 이 시험이 의미가 있다');
  global.window = { institutionsNonMuni: nonmuni };
  store.setServerData([{ name: '마포구청', region: '11', type: '지자체' }]);
  try {
    assert.strictEqual(render.nonMuniInstitutions().length, open.length);
    assert.ok(open.length >= 150, '합친 수 ' + open.length);   // 지자체 외 기관 168곳 중 개원 예정 법원을 뺀 수
    const all = render.allInstitutions();
    assert.strictEqual(all.length, open.length + 1);
    assert.ok(all.every(r => !(r.type === '법원' && r.opStatus === '개원 예정')));
    assert.ok(all.some(r => r.type === '교육청') && all.some(r => r.type === '지방공기업' || r.type === '공공기관'));
    // 같은 region|name이 base에 있으면 base가 이긴다(서버 병합 대비)
    const dup = nonmuni[0];
    store.setServerData([Object.assign({}, dup, { name: dup.name, tag: 'base' })]);
    const merged = render.allInstitutions();
    assert.strictEqual(merged.length, open.length);
    assert.strictEqual(merged.filter(r => logic.instKey(r) === logic.instKey(dup))[0].tag, 'base');
    // baseInstitutions는 합치지 않는다(기관 추가가 이 목록을 저장하므로)
    assert.strictEqual(render.baseInstitutions().length, 1);
    // 현황판이 쓰는 dataList는 render.allInstitutions다
    assert.ok(/render\.allInstitutions\(\)/.test(fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8')));
  } finally {
    store.clearServerData();
    delete global.window;
  }
});

test('필터 5종: 기본 전부 켬, 종류(kindOf)로 판정, 지자체는 항상 포함·종류 모르는 유형은 항상 표시', () => {
  assert.deepStrictEqual(Array.from(render.state.enabledTypes).sort(), logic.TYPE_KINDS.slice().sort());
  const prev = render.state.enabledTypes;
  try {
    render.state.enabledTypes = new Set(['지자체']);
    assert.strictEqual(render._rankTypeVisible({ type: '지자체' }), true);
    assert.strictEqual(render._rankTypeVisible({ type: '교육청' }), false);
    assert.strictEqual(render._rankTypeVisible({ type: '법원' }), false);
    assert.strictEqual(render._rankTypeVisible({ type: '연구소' }), true);
    render.state.enabledTypes = new Set(['지자체', '공공기관']);
    ['교육청', '지방공기업', '공기업', '공공기관'].forEach(t => assert.strictEqual(render._rankTypeVisible({ type: t }), true, t));
    assert.strictEqual(render._rankTypeVisible({ type: '대학교' }), false);
    // 섞기는 켠 종류만: 공공기관을 끄면 그 기관의 진행 중 공고가 빠진다
    const list = [{ name: '구청', region: '11', type: '지자체' }, nrec('교육청A', 10, { type: '교육청', receiveTo: plus(4) })];
    render.state.today = TODAY;
    assert.strictEqual(render.mixInfo(list.filter(render._rankTypeVisible)).notice, 1);
    render.state.enabledTypes = new Set(['지자체']);
    assert.strictEqual(render.mixInfo(list.filter(render._rankTypeVisible)).notice, 0);
  } finally { render.state.enabledTypes = prev; }
});

test('index.html 필터 체크박스는 정본 5종, 옛 이름(공기업·대학병원·대학교)은 없다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const types = (html.match(/<input type="checkbox" data-type="[^"]+" checked>/g) || []).map(s => /data-type="([^"]+)"/.exec(s)[1]);
  assert.deepStrictEqual(types, logic.TYPE_KINDS);
  assert.ok(!/data-type="(공기업|대학병원|대학교)"/.test(html));
});

// ── 지도: 라벨·툴팁·aria·범례·티커 ──────────────────────────────────
test('라벨 둘째 줄 \'공고 n\'과 첫 줄 dy', () => {
  assert.strictEqual(render.noticeSubText({ notice: 5 }), '공고 5');
  assert.strictEqual(render.noticeSubText({ notice: 0 }), '');
  assert.strictEqual(render.noticeSubText(undefined), '');
  assert.strictEqual(render.labelDy(true, false), '0.35em');
  assert.strictEqual(render.labelDy(true, true), '0em');
  assert.strictEqual(render.labelDy(false, false), '0em');
  const src = fs.readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(src.indexOf("attr('class', 'sub notice')") >= 0 && src.indexOf("attr('dy', '1.15em').text(noticeTxt)") >= 0);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/\.label \.sub\.notice \{[^}]*font-weight:700/.test(html));
});

const TIP_LIST = [
  nrec('송파문화재단', 10, { receiveTo: plus(4) }), nrec('마포구청', 12, { receiveFrom: plus(4), receiveTo: plus(7) }),
  nrec('성북구청', 20), nrec('정읍시청', 50, { receiveTo: plus(-10) }),
  { name: '하동군청', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false },
];

test('tipHtml 첫 블록: 공고 진행 중 n곳 — 마감 전 a · 결과 확인 b, 마감 전 최대 2곳, 결과 확인 1곳 + 외 n곳', () => {
  const info = logic.regionMix(TIP_LIST, TODAY);
  const h = render.tipHtml('서울', info, TODAY);
  assert.ok(h.includes('공고 진행 중 4곳'), h);
  assert.ok(h.includes('마감 전 2 · 결과 확인 2'), h);
  assert.ok(h.includes('송파문화재단 <span class="rt-d">마감 D-4</span>'), h);
  assert.ok(h.includes('마포구청 <span class="rt-d">접수 ' + md(4) + '~' + md(7) + '</span>'), h);
  assert.ok(h.indexOf('송파문화재단') < h.indexOf('마포구청'), '마감 가까운 순');
  assert.ok(h.includes('성북구청 <span class="rt-m">공고 ' + md(-20) + ' · 공고 후 20일 · 마감일 미확인</span> 외 1곳'), h);
  assert.ok(h.indexOf('공고 진행 중 4곳') < h.indexOf('가장 임박'), '첫 블록이 먼저');
  assert.ok(h.includes('가장 임박 하동군청'), h);
  assert.ok(h.includes('기관 5곳 중 마감 지난 공고 1곳은 색에 넣지 않음'), h);
  // 마감 전이 셋 이상이면 외 n곳, 결과 확인이 마감 지남이면 '공고 후 n일'
  const three = logic.regionMix([nrec('a', 5, { receiveTo: plus(1) }), nrec('b', 5, { receiveTo: plus(2) }), nrec('c', 5, { receiveTo: plus(3) }),
    nrec('d', 33, { receiveTo: plus(-2) })], TODAY);
  const h3 = render.tipHtml('x', three, TODAY);
  assert.ok(h3.includes('마감 전 외 1곳') && h3.includes('d <span class="rt-m">공고 후 33일</span>') && !h3.includes('외 0곳'), h3);
});

test('tipHtml: 공고만 있는 지역은 \'날짜가 있는 기관이 없습니다\'를 붙이지 않고, 이름은 이스케이프', () => {
  const info = logic.regionMix([nrec('<b>x</b>', 5, { receiveTo: plus(4) })], TODAY);
  const h = render.tipHtml('서울', info, TODAY);
  assert.ok(!h.includes('날짜가 있는 기관이 없습니다'));
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>x</b>'));
});

test('mixAriaLabel: 공고 진행 중 n곳(마감 전 m곳), 6개월 안 n곳, 기관 n곳', () => {
  const info = logic.regionMix(TIP_LIST, TODAY);
  assert.strictEqual(render.mixAriaLabel('서울', info),
    '서울, ' + render.MIX_NAME[info.band] + ', 공고 진행 중 4곳(마감 전 2곳), 6개월 안 1곳(모두 추정), 기관 5곳');
  const zero = logic.regionMix([nrec('a', 5, { receiveTo: plus(4) })], TODAY);
  assert.ok(render.mixAriaLabel('서울', zero).includes('공고 진행 중 1곳(마감 전 1곳), 6개월 안 0곳, 기관 1곳'));
  // 공고가 없으면 기존 문장 그대로
  const none = logic.regionMix([{ name: 'z', type: '지자체', contractEnd: plus(30), confirmed: true }], TODAY);
  assert.ok(!render.mixAriaLabel('서울', none).includes('공고 진행 중'));
});

test('범례: ▲ 줄 문구 변경 + \'공고 n\' 칩 줄', () => {
  const el = { innerHTML: '' };
  withDoc({ getElementById: id => (id === 'legend' ? el : null) }, () => render.drawLegend());
  assert.ok(el.innerHTML.includes('6개월 안 공고 예정 기관 수 (속 빈 △는 추정)'));
  assert.ok(el.innerHTML.includes('<i class="lg-nchip" aria-hidden="true">공고 2</i>공고가 나서 진행 중인 기관 수 (공고일부터 120일)'));
  assert.ok(!el.innerHTML.includes('6개월 안 기관 수 (속 빈'));
});

test('티커: TOP5는 그대로, 캡션 뒤에 \'공고 중 n\' 칩(공고가 없으면 칩 없음)', () => {
  const el = { innerHTML: '', querySelectorAll: () => [] };
  const prevToday = render.state.today;
  render.state.today = TODAY;
  try {
    withDoc({ getElementById: id => (id === 'ticker' ? el : null) }, () => {
      store.setServerData([nrec('공고A', 10, { receiveTo: plus(4) }), nrec('공고B', 20),
        { name: '예정시청', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false }]);
      render.drawTicker();
      assert.ok(el.innerHTML.indexOf('<span class="tk-cap">임박 TOP5</span><span class="tk-n"') === 0, el.innerHTML);
      assert.ok(el.innerHTML.includes('>공고 중 2</span>'));
      assert.ok(el.innerHTML.includes('예정시청'));
      store.setServerData([{ name: '예정시청', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false }]);
      render.drawTicker();
      assert.ok(!el.innerHTML.includes('tk-n'));
    });
  } finally { store.clearServerData(); render.state.today = prevToday; }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/#ticker \.tk-n \{[^}]*border:1px solid var\(--fg\)/.test(html) && !/#ticker \.tk-n \{[^}]*background/.test(html));
  assert.ok(render._rollTicker.toString().indexOf(':not(.tk-n)') >= 0);
});

// ── 현황판 ──────────────────────────────────────────────────────────
test('dash.model: 진행 중은 notice(마감 전→미확인→결과 확인), 예정·경과에는 들지 않고 경과 수는 진행 중을 뺀다', () => {
  const list = [
    nrec('마감3', 8, { receiveTo: plus(3) }), nrec('미확인', 20), nrec('지남', 50, { receiveTo: plus(-5) }),
    nrec('오늘공고', 0, { receiveTo: plus(6) }),                   // 공고일이 오늘 — 예정에도 이중으로 들지 않는다
    nrec('경과', 200), { name: '예정', region: '11', type: '지자체', contractEnd: plus(40), confirmed: false },
  ];
  const m = dash.model(list, TODAY);
  assert.deepStrictEqual(m.notice.map(n => n.name), ['마감3', '오늘공고', '미확인', '지남']);
  assert.deepStrictEqual(m.upcoming.map(u => u.name), ['예정']);
  assert.deepStrictEqual(m.overdue.map(o => o.name), ['경과']);
  assert.deepStrictEqual(m.noticeN, { receiving: 2, unknown: 1, awaiting: 1 });
  assert.strictEqual(m.notice[0].startDays, null);
  assert.ok(dash.timelineHtml(m, TODAY, '6').includes('<span class="n">1곳</span><span class="t">공고 예정일 경과'));   // D+ 타일도 진행 중이 빠진 수
  assert.ok(dash.timelineHtml(m, TODAY, '6').includes('경과 <b>1</b>곳'));
});

test('행 칩 세 갈래: 마감 D-n(빨강 테두리) / 공고 후 n일(무채색) / 경과 D+ 도장', () => {
  const m = dash.model([nrec('마감', 8, { receiveTo: plus(4), receiveFrom: plus(2) }), nrec('미확인', 20), nrec('지남', 50, { receiveTo: plus(-5) }),
    nrec('경과', 200)], TODAY);
  const by = n => m.notice.filter(x => x.name === n)[0];
  const r1 = dash.rowHtml(by('마감'), { id: 'a' });
  assert.ok(r1.includes('<span class="db-chip open">마감 D-4</span>') && r1.includes('접수 <span class="d">' + md(2) + '~' + md(4) + '</span> · 접수 시작 D-2'), r1);
  assert.ok(r1.includes('data-phase="receiving"'));
  const r2 = dash.rowHtml(by('미확인'), { id: 'b' });
  assert.ok(r2.includes('<span class="db-chip wait">공고 후 <span class="v">20</span>일</span>') && r2.includes('마감일 미확인 · 결과가 났는지 확인하세요'), r2);
  const r3 = dash.rowHtml(by('지남'), { id: 'c' });
  assert.ok(r3.includes('공고 후 <span class="v">50</span>일') && r3.includes('마감 지남(<span class="d">' + plus(-5).slice(5) + '</span>)'), r3);
  assert.ok(dash.rowHtml(m.overdue[0], { id: 'd' }).includes('ov-stamp">D+200'));
  assert.ok(!r1.includes('ov-stamp') && !r2.includes('ov-stamp'));
});

test('띠: 마감 전 카드 + 마감일 미확인 카드(무채색), 0곳이면 숨김, 1곳이면 안내, 6곳 이상이면 4장 + 더보기', () => {
  assert.strictEqual(dash.noticeBandHtml(dash.model([], TODAY), ''), '');
  const onlyWait = dash.model([nrec('지남', 50, { receiveTo: plus(-5) })], TODAY);
  assert.strictEqual(dash.noticeBandHtml(onlyWait, ''), '');                       // 마감 지난 곳은 목록에만 — 카드 0곳이면 띠를 숨긴다
  const one = dash.model([nrec('송파', 8, { receiveTo: plus(4) }), nrec('지남', 50, { receiveTo: plus(-5) })], TODAY);
  const h1 = dash.noticeBandHtml(one, '11|송파');
  assert.ok(h1.includes('지금 공고가 난 기관') && h1.includes('접수 마감 전 <b>1</b>곳 · 결과 확인 <b>1</b>곳'), h1);
  assert.ok(h1.includes('db-nb-row one') && h1.includes('db-nb-aside') && h1.includes('id="db-nb-wait"'));
  assert.strictEqual((h1.match(/<button type="button" class="db-nb-card/g) || []).length, 1);
  assert.ok(h1.includes('aria-pressed="true"') && h1.includes('data-key="11|송파"'));
  assert.ok(h1.includes('<small>마감</small><b>D-4</b>'));
  // 5곳: 카드 5장, 더보기 없음. 마감일 미확인 카드는 무채색(.wait) + 꼬리 '공고 후 n일'
  const five = dash.model([nrec('a', 5, { receiveTo: plus(1) }), nrec('b', 5, { receiveTo: plus(2) }), nrec('c', 5, { receiveTo: plus(3) }),
    nrec('d', 5, { receiveTo: plus(4) }), nrec('미확인', 30)], TODAY);
  const h5 = dash.noticeBandHtml(five, '');
  assert.strictEqual((h5.match(/class="db-nb-card/g) || []).length, 5);
  assert.ok(!h5.includes('db-nb-more') && !h5.includes('db-nb-row one'));
  assert.ok(/class="db-nb-card wait"[^>]*>.*?<small>공고 후<\/small><b>30일<\/b>/.test(h5), h5);
  assert.ok(h5.includes('접수 마감 전 <b>4</b>곳 · 마감일 미확인 <b>1</b>곳') && !h5.includes('db-nb-wait'));
  assert.ok(h5.indexOf('data-key="11|a"') < h5.indexOf('data-key="11|d"') && h5.indexOf('data-key="11|d"') < h5.indexOf('data-key="11|미확인"'));
  // 7곳: 4장 + '+3곳 더'
  const seven = dash.model([1, 2, 3, 4, 5, 6, 7].map(n => nrec('기관' + n, 5, { receiveTo: plus(n) })), TODAY);
  const h7 = dash.noticeBandHtml(seven, '');
  assert.strictEqual((h7.match(/<button type="button" class="db-nb-card/g) || []).length, 4);
  assert.ok(h7.includes('id="db-nb-more">+3곳 더</button>'));
  // 이름·날짜 이스케이프
  const evil = dash.model([nrec('<img src=x onerror=1>', 5, { receiveTo: plus(1) })], TODAY);
  const he = dash.noticeBandHtml(evil, '');
  assert.ok(!he.includes('<img') && he.includes('&lt;img'));
});

test('자동 선택: 마감 전 가장 가까운 곳 → 기간 창 첫 행 → 없음, 필터를 함께 건다', () => {
  const m = dash.model([nrec('마감9', 5, { receiveTo: plus(9) }), nrec('마감3', 5, { receiveTo: plus(3), region: '26' }),
    { name: '예정', region: '11', type: '지자체', contractEnd: plus(40), confirmed: false }], TODAY);
  assert.strictEqual(dash.autoSelectKey(m, '6'), '26|마감3');
  assert.strictEqual(dash.autoSelectKey(m, '6', { region: '11' }), '11|마감9');
  const noRcv = dash.model([nrec('미확인', 20), { name: '예정', region: '11', type: '지자체', contractEnd: plus(40), confirmed: false }], TODAY);
  assert.strictEqual(dash.autoSelectKey(noRcv, '6'), '11|예정');
  assert.strictEqual(dash.autoSelectKey(dash.model([], TODAY), '6'), '');
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(src.indexOf('if (!st.sel) st.sel = dash.autoSelectKey(') >= 0);
  assert.ok(!/autoSelectKey[^\n]*\.focus\(/.test(src));      // 포커스는 옮기지 않는다
});

test('visibleKeys: 공고 진행 중 묶음은 접히지 않고 조건을 함께 건다', () => {
  const m = dash.model([nrec('가', 5, { receiveTo: plus(3) }), nrec('나', 20, { region: '26' }), { name: '다', region: '11', type: '지자체', contractEnd: plus(10), confirmed: false }], TODAY);
  assert.deepStrictEqual(dash.visibleKeys(m, '6', {}, false).sort(), ['11|가', '11|다', '26|나']);
  assert.deepStrictEqual(dash.visibleKeys(m, '6', { region: '26' }, false), ['26|나']);
});

test('공고 원문 링크: noticeUrl 우선, 없으면 sources의 첫 http 항목, 나라장터 bidPbancNo면 원문, 아니면 게시판', () => {
  const g2b = 'https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01&bidPbancOrd=000';
  const board = 'https://eminwon.mapo.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do';
  assert.deepStrictEqual(dash.noticeLink({ sources: ['기준일=공고일', g2b] }), { url: g2b, name: '공고 원문 열기' });
  assert.deepStrictEqual(dash.noticeLink({ sources: ['글', board, g2b] }), { url: board, name: '공고 게시판 열기' });
  assert.deepStrictEqual(dash.noticeLink({ noticeUrl: g2b, sources: [board] }), { url: g2b, name: '공고 원문 열기' });
  assert.deepStrictEqual(dash.noticeLink({ sources: ['https://news.example.com/a'] }).name, '공고 게시판 열기');
  assert.strictEqual(dash.noticeLink({ sources: ['글만 있음', 'javascript:alert(1)'] }), null);
  assert.strictEqual(dash.noticeLink({ noticeUrl: 'javascript:alert(1)' }), null);
  assert.strictEqual(dash.noticeLink({}), null);
});

test('상세 \'공고 진행\' 절: 맨 위, 공고 막대(접수 칸 없으면 창 생략), 정의 목록, 링크 이름·noreferrer·인터넷 PC 안내', () => {
  const g2b = 'https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01&bidPbancOrd=000';
  const withRecv = dash.model([nrec('마포구청', 14, { receiveFrom: plus(4), receiveTo: plus(7), noticeNo: '제2026-1729호', contractExpiry: '2026-12-31',
    sources: ['기준일=공고일', g2b] })], TODAY).notice[0];
  const h = dash.paneHtml(withRecv, { act: 'none', today: TODAY });
  assert.ok(h.indexOf('<h3>공고 진행</h3>') >= 0 && h.indexOf('<h3>공고 진행</h3>') < h.indexOf('<h3>기관 정보</h3>'));
  assert.ok(h.includes('class="db-ntrk" role="img"') && h.includes('class="win"') && h.includes('접수 ' + md(4) + '~' + md(7)));
  assert.ok(h.includes('<dt>공고 번호</dt><dd><span class="v">제2026-1729호</span></dd>'));
  assert.ok(h.includes('<dt>공고일</dt><dd><span class="v">' + plus(-14) + '</span></dd>'));
  assert.ok(h.includes('<dt>접수</dt>') && h.includes('마감 <span class="v">D-7</span>'));
  assert.ok(h.includes('<dt>현 약정 만료</dt><dd><span class="v">2026-12-31</span></dd>') && h.includes('약정 만료 12.31'));
  assert.ok(h.includes('<a href="' + g2b.replace(/&/g, '&amp;') + '" target="_blank" rel="noopener noreferrer">공고 원문 열기</a> <span class="db-why">(인터넷 PC에서 열림)</span>'), h);
  assert.ok(h.includes('<span class="db-chip open">마감 D-7</span>'));
  assert.ok(!h.includes('class="db-term') && !h.includes('<dt>입찰 예정일</dt>'));
  // 접수 칸이 없으면 접수 창 생략, 마감일 미확인 표시, 공고 번호·링크가 없으면 줄이 없다/안내
  const bare = dash.model([nrec('성북구청', 30)], TODAY).notice[0];
  const hb = dash.paneHtml(bare, { act: 'none', today: TODAY });
  assert.ok(!hb.includes('class="win') && hb.includes('마감일 미확인') && !hb.includes('<dt>공고 번호</dt>') && hb.includes('공고 링크가 아직 없습니다'));
  assert.ok(hb.includes('공고 후 120일'));                       // 약정 만료가 없으면 막대 끝은 공고 후 120일
  // 일반(예정) 행의 출처 링크도 noreferrer
  const up = dash.model([{ name: '가', region: '11', type: '지자체', contractEnd: plus(30), confirmed: false, sources: ['https://example.invalid/a'] }], TODAY).upcoming[0];
  const hu = dash.paneHtml(up, { act: 'none', today: TODAY });
  assert.ok(hu.includes('rel="noopener noreferrer"') && !hu.includes('rel="noopener"'));
  // 이스케이프
  const evil = dash.model([nrec('<script>x</script>', 5, { noticeNo: '<b>1</b>', sources: ['https://example.invalid/a"onmouseover="x'] })], TODAY).notice[0];
  const he = dash.paneHtml(evil, { act: 'none', today: TODAY });
  assert.ok(!he.includes('<script>') && !he.includes('<b>1</b>') && !/href="[^"]*"onmouseover/.test(he));
});

test('종류 표시는 kindOf: 필터 선택지·상세 부제', () => {
  const list = [{ name: 'a', region: '11', type: '교육청' }, { name: 'b', region: '11', type: '지방공기업' }, { name: 'c', region: '11', type: '지자체' },
    { name: 'd', region: '11', type: '법원' }];
  assert.deepStrictEqual(dash.typeOptions(list), ['지자체', '공공기관', '법원']);
  assert.strictEqual(dash.filterItems([{ name: 'a', region: '11', rec: list[0] }, { name: 'c', region: '11', rec: list[2] }], { type: '공공기관' }).length, 1);
  const it = dash.model([nrec('교육청A', 5, { type: '교육청', receiveTo: plus(3) })], TODAY).notice[0];
  assert.ok(dash.paneHtml(it, { act: 'none', today: TODAY }).includes('<p class="db-sub">공공기관 · '));
});

test('현황판 마크업·CSS: 띠 첫 자식, 높이 고정, 순서, 안내문 위쪽 정렬, 새 hex 없음', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(src.indexOf('id="db-notice"') > 0 && src.indexOf('id="db-notice"') < src.indexOf('id="db-flash"') && src.indexOf('id="db-notice"') < src.indexOf('id="db-tl"'));
  assert.ok((src.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 2);
  assert.ok(!/rel="noopener"/.test(src));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 입찰 현황판 시작'), b = html.indexOf('/* 입찰 현황판 끝 */');
  const css = html.slice(a, b);
  assert.ok(/\.db-list, \.db-pane \{ height:clamp\(440px, calc\(100vh - 140px\), 820px\)/.test(css));
  assert.ok(/\.db-blank \{[^}]*align-items:flex-start[^}]*padding:48px 24px 24px/.test(css));
  const m1599 = css.slice(css.indexOf('@media (max-width:1599px)'), css.indexOf('@media (max-width:880px)'));
  assert.ok(/\.db-list, \.db-pane \{ grid-row:1; \}/.test(m1599) && /\.db-rail \{ grid-column:1 \/ -1; grid-row:2;/.test(m1599));
  assert.ok(/\.db-nb-body \.nm \{[^}]*-webkit-line-clamp:2/.test(css));          // 긴 기관명은 2줄 말줄임
  assert.ok(/\.db-chip\.open \{[^}]*var\(--red\)/.test(css) && !/\.db-chip\.wait \{[^}]*var\(--red\)/.test(css));   // 빨강은 마감 전에만
  assert.deepStrictEqual(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g), null);
});
