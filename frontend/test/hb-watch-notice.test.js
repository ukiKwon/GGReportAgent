'use strict';
// 입찰 현황판 관심 표 공고 상태 — design-reviewer 11-25 ac023c03 6-1~6-5
// (관심 줄 '공고·다음 협약 종료' 칸·정렬·상태 거르기·탭 칩·표 바닥 줄·[공고 예정일 경과 보기])
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const kbb = require('../js/kbboard.js');

const ROOT = path.join(__dirname, '..');
const TODAY = new Date(2026, 10, 17);   // 2026-11-17
const src = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };
const REC = { institutionId: 'W1', name: '행', region: '11' };
const snapOf = function (byId) { return { byId: byId || {}, today: '2026-11-17' }; };
const R = function (o) {
  return Object.assign({ id: 'W1', key: 'k', fkey: 'id:W1', name: '행', regionName: '서울', kind: 'WATCH', tagCd: 'NEW', tagName: '신규유치 도전', memo: '',
    nextDate: '', next: { src: '' }, movable: 0, canCancel: false, rec: REC, bank: { name: '', unknown: true }, due: { kind: 'unk' } }, o || {});
};
const stateOf = function (o, snap) { return kbb.watchState(R(o), snap === undefined ? snapOf() : snap, TODAY); };
const cellOf = function (o, snap) { const r = R(o); r.wst = kbb.watchState(r, snap === undefined ? snapOf() : snap, TODAY); return kbb.watchDueCell(r); };
const FIX = { kind: 'fixed', days: 12, from: '2026-11-10', to: '2026-11-29' };
const OVER = { kind: 'over', days: 40, est: true, date: '2026-10-08' };
const ND = { nextDate: '2027-12-31', next: { src: 'contract' } };

test('watchState: 순위 0~7 — 공고 중·마감 미상·마감 지남·확인 필요·공고 지연·기록 종료·다음 협약 종료·일정 모름', function () {
  assert.deepStrictEqual([stateOf({ due: FIX }).rank, stateOf({ due: { kind: 'open', from: '2026-11-10' } }).rank,
    stateOf({ due: { kind: 'closed', from: '2026-11-01', to: '2026-11-10' } }).rank], [0, 1, 2]);
  assert.strictEqual(stateOf({ due: FIX }).days, 12);
  assert.deepStrictEqual([stateOf({ due: OVER }).rank, stateOf({ due: OVER }).kind], [3, 'check']);   // 예정일 지남 + 기록 없음 = 확인 필요
  // 지연 기록: 다음 확인일 전이면 4, 확인일이 지났으면 recordView가 미처리로 되돌려 3
  assert.strictEqual(stateOf({ due: OVER }, snapOf({ W1: { status_cd: 'DELAYED', next_check_date: '2026-12-01' } })).rank, 4);
  assert.strictEqual(stateOf({ due: OVER }, snapOf({ W1: { status_cd: 'DELAYED', next_check_date: '2026-11-10' } })).rank, 3);
  // 공고 진행 중으로 기록된 경과 줄은 공고 중(마감 미상)
  const ip = stateOf({ due: OVER }, snapOf({ W1: { status_cd: 'IN_PROGRESS' } }));
  assert.deepStrictEqual([ip.rank, ip.kind], [1, 'open']);
  // 올해 처리한 CLOSED·NO_BID는 공고 중보다 먼저 — 지난해 기록은 올해 판정이 아니다
  const end = stateOf({ due: FIX }, snapOf({ W1: { status_cd: 'NO_BID', handled_at: '2026-10-05T09:00:00', round_closed: true } }));
  assert.deepStrictEqual([end.rank, end.kind, end.cd, end.date], [6, 'end', 'NOTICE_NO_BID', '2026-10-05']);
  assert.strictEqual(stateOf({ due: FIX }, snapOf({ W1: { status_cd: 'CLOSED', handled_at: '2025-10-05T09:00:00', round_closed: true } })).rank, 0);
  // 공고·경과 상태가 없으면 다음 협약 종료(5) / 일정 모름(7)
  assert.deepStrictEqual([stateOf(Object.assign({ due: { kind: 'est', days: 90, date: '2027-02-01' } }, ND)).rank, stateOf({}).rank], [5, 7]);
  // 공고 자료를 못 받았으면(snap null) 판정하지 않는다
  assert.deepStrictEqual(stateOf(Object.assign({ due: FIX }, ND), null), { rank: 5, kind: 'next', judged: false });
  assert.deepStrictEqual(stateOf({ due: FIX }, null), { rank: 7, kind: 'unk', judged: false });
});

test('goalRow: 관심 줄에만 wst가 붙는다(snap 없음 → judged false, 있음 → true, 올해 기록 종료 → 6), 목표 줄은 없음', function () {
  const ctx = function (snap) {
    return { byInst: { IE: { institutionId: 'IE', name: '마', region: '11', type: '지자체', confirmed: false } }, sumById: {}, today: TODAY, verified: [], lofin: null,
      entries: {}, prepOk: false, delayDays: 30, years: [2026, 2027, 2028], snap: snap };
  };
  const tw = { institution_id: 'IE', institution_name: '마', kind_cd: 'WATCH', target_no: 1, rev_no: 1, tag_cd: 'NEW', next_term_to: '2028-12-31', can_cancel: true };
  assert.deepStrictEqual(kbb.goalRow(tw, ctx(null)).wst, { rank: 5, kind: 'next', judged: false });
  const j = kbb.goalRow(tw, ctx(snapOf())).wst;
  assert.deepStrictEqual([j.rank, j.judged], [5, true]);
  const e = kbb.goalRow(tw, ctx(snapOf({ IE: { status_cd: 'CLOSED', handled_at: '2026-09-30', round_closed: true } }))).wst;
  assert.deepStrictEqual([e.rank, e.cd], [6, 'NOTICE_CLOSED']);
  assert.strictEqual(kbb.goalRow(Object.assign({}, tw, { kind_cd: 'GOAL', target_year: 2026 }), ctx(snapOf())).wst, undefined);
});

test('watchDueCell: 순위별 보이는 값·sr-only 문장·title, 협약 종료는 공고 중 줄에서 함께, "공고 없음" 말은 어디에도 없다', function () {
  const all = [];
  const c0 = cellOf(Object.assign({ due: FIX }, ND)); all.push(c0);
  assert.ok(c0.html.indexOf('<span aria-hidden="true"><b class="hb-dd tx">공고 중</b><span class="hb-q hot">마감 D-12</span><span class="hb-q">· 2027-12</span></span>') === 0);
  assert.ok(c0.html.indexOf('<span class="sr-only">공고 중, 접수 마감 2026-11-29(12일 남음). 다음 협약 종료 2027-12(약정)</span>') > 0);
  assert.strictEqual(c0.attr, ' title="공고 2026-11-10 · 접수 마감 2026-11-29 · 다음 협약 종료 2027-12 약정"');
  const far = cellOf({ due: { kind: 'fixed', days: 45, from: '', to: '2027-01-01' } }); all.push(far);   // 30일 밖은 hot 없음, 협약 종료 없음
  assert.ok(far.html.indexOf('<span class="hb-q">마감 D-45</span>') > 0 && far.html.indexOf('hot') < 0 && far.html.indexOf('· 20') < 0);
  const op = cellOf(Object.assign({ due: { kind: 'open', from: '2026-11-10' } }, ND)); all.push(op);
  assert.ok(op.html.indexOf('<b class="hb-dd tx">공고 중</b><span class="hb-q">마감 미상</span><span class="hb-q">· 2027-12</span>') > 0 && op.html.indexOf('접수 마감일 미확인') > 0);
  const cl = cellOf({ due: { kind: 'closed', from: '2026-11-01', to: '2026-11-10' } }); all.push(cl);
  assert.ok(cl.html.indexOf('<b class="hb-dd tx">마감 지남</b><span class="hb-q">결과 대기</span>') > 0 && cl.html.indexOf('공고 접수 마감 지남, 선정 결과 대기') > 0);
  // 확인 필요: 값은 D+n 하나, 협약 종료는 눈에 안 보이고 sr·title에만
  const ck = cellOf(Object.assign({ due: OVER }, ND)); all.push(ck);
  assert.ok(ck.html.indexOf('<b class="hb-dd est">D+40</b><span class="hb-q chk">확인 필요</span>') > 0 && ck.html.indexOf('· 2027') < 0);
  assert.ok(ck.html.indexOf('추정 공고 예정 2026-10에서 40일이 지났지만 공고가 났는지 아직 기록되지 않음. 다음 협약 종료 2027-12(약정)') > 0);
  assert.ok(ck.attr.indexOf('예정일이 지났지만 공고가 났는지 아직 아무도 기록하지 않았습니다. 입찰 공고 현황 [공고 예정일 경과]에서 확인해 기록합니다.') > 0);
  assert.ok(cellOf({ due: Object.assign({}, OVER, { est: false }) }).html.indexOf('공고 예정일 2026-10-08에서 40일이 지났지만') > 0);
  const dl = cellOf({ due: OVER }, snapOf({ W1: { status_cd: 'DELAYED', next_check_date: '2026-12-01' } })); all.push(dl);
  assert.ok(dl.html.indexOf('<b class="hb-dd est">D+40</b><span class="hb-q">공고 지연</span>') > 0 && dl.html.indexOf('공고 예정일이 40일 지났고 공고 지연으로 기록됨') > 0 && dl.attr.indexOf('다음 확인일 2026-12-01') > 0);
  const en = cellOf({ due: FIX }, snapOf({ W1: { status_cd: 'NO_BID', handled_at: '2026-10-05', round_closed: true } })); all.push(en);
  assert.ok(en.html.indexOf('<b class="hb-dd tx end">입찰 없음</b>') > 0 && en.html.indexOf('입찰 공고 현황에 입찰 없음으로 기록됨') > 0 && en.attr.indexOf('입찰 공고 현황 2026-10-05 입찰 없음') > 0);
  assert.ok(cellOf({ due: FIX }, snapOf({ W1: { status_cd: 'CLOSED', handled_at: '2026-10-05', round_closed: true } })).html.indexOf('<b class="hb-dd tx end">공고 끝남</b>') > 0);
  // 5 = 지금 모양 + 공고 자료를 받은 경우만 sr 문장, 자료 없으면 지금 모양 그대로, 7 = 지금 모양
  const n5 = cellOf(ND); all.push(n5);
  assert.ok(n5.html.indexOf('<b class="hb-nx">2027-12</b><span class="hb-q">약정</span>') === 0 && n5.html.indexOf('입찰 공고 현황에 이 기관의 공고는 아직 없음') > 0);
  const n5x = cellOf(ND, null); all.push(n5x);
  assert.ok(n5x.html === '<b class="hb-nx">2027-12</b><span class="hb-q">약정</span>' && n5x.attr === '');
  const n7 = cellOf({}); all.push(n7);
  assert.ok(n7.html.indexOf('>일정 모름</span>') > 0 && n7.html.indexOf('아직 없음') < 0);
  all.forEach(function (c) { assert.ok(!/공고 없음|미공고|안 떴음/.test(c.html + c.attr)); });
  // 서버·기관 자료 글은 이스케이프(title·본문)
  const x = cellOf({ due: { kind: 'fixed', days: 3, from: '', to: '2026-11-2"><i>' } });
  assert.ok(x.html.indexOf('<i>') < 0 && x.attr.indexOf('<i>') < 0 && x.html.indexOf('2026-11-2"') < 0);
  // 줄 전체: 칸 수(td 5)는 그대로, 칸에 title
  const r = R(Object.assign({ due: FIX }, ND)); r.wst = kbb.watchState(r, snapOf(), TODAY);
  const h = kbb.watchRowHtml(r, { canEdit: false });
  assert.ok(h.indexOf('<td title="공고 2026-11-10') > 0 && (h.match(/<td/g) || []).length === 5);
});

test('정렬: 순위 0~7(공고 중 → … → 일정 모름), 같은 순위는 규격 6-1 규칙, 내림차순에서도 일정 모름은 맨 아래', function () {
  const row = function (id, rank, extra) { return Object.assign({ id: id, name: id, kind: 'WATCH', nextDate: '', wst: Object.assign({ rank: rank, judged: true }, extra || {}) }, {}); };
  const rows = [row('a', 0, { days: 12 }), row('b', 0, { days: 5 }), row('c', 1), row('d', 3, { days: 10 }), row('e', 3, { days: 40 }), row('f', 4, { days: 3 }),
    Object.assign(row('g', 5), { nextDate: '2028-01-01' }), Object.assign(row('h', 5), { nextDate: '2027-01-01' }), row('i', 6), row('j', 7)];
  const ids = function (k, d) { return kbb.sortBy(rows, k, d).map(function (r) { return r.id; }).join(''); };
  assert.strictEqual(ids('next', 'asc'), 'bacedfhgij');    // 0: D 작은 순, 3·4: 오래 지난 순, 5: 협약 종료 빠른 순
  assert.strictEqual(ids('next', 'desc'), 'ighfdecabj');   // 순위 큰 쪽부터, 같은 순위는 방향만 뒤집음, 일정 모름(j)은 맨 아래
  assert.strictEqual(kbb.SORT_LABEL.next, '공고·다음 협약 종료');
});

test('상태 거르기: 공고 중·확인 필요 추가, 일정 모름의 새 뜻(칸에 일정 모름이 보이는 줄)', function () {
  assert.deepStrictEqual(kbb.STATUS.watch.map(function (x) { return x[0]; }), ['', 'notice', 'check', 'movable', 'unk', 'carried']);
  assert.deepStrictEqual([kbb.STATUS.watch[1][1], kbb.STATUS.watch[2][1]], ['공고 중', '확인 필요']);
  const mk = function (id, rank, nd) { return { id: id, name: id, kind: 'WATCH', nextDate: nd || '', wst: { rank: rank, judged: true } }; };
  const rows = [mk('a', 0), mk('b', 1), mk('c', 2), mk('d', 3), mk('e', 4), mk('f', 5, '2028-01-01'), mk('g', 6), mk('h', 7)];
  const f = function (s) { return kbb.filterRows(rows, { status: s }).map(function (r) { return r.id; }).join(''); };
  assert.strictEqual(f('notice'), 'ab');     // 마감 지남(2)은 공고 중이 아니다 — 목표 표와 같은 판정
  assert.strictEqual(f('check'), 'd');
  assert.strictEqual(f('unk'), 'h');         // 경과·기록 종료인 줄은 칸에 일정 모름이 보이지 않는다
  // wst 없는 줄(옛 모양)은 예전 뜻: 일정 날짜 없음
  assert.strictEqual(kbb.filterRows([{ id: 'x', name: 'x', kind: 'WATCH', nextDate: '' }], { status: 'unk' }).length, 1);
  assert.strictEqual(kbb.filterRows([{ id: 'x', name: 'x', kind: 'WATCH', nextDate: '' }], { status: 'check' }).length, 0);
});

test('탭 칩·표 바닥 줄: 공고 중 n 칩(자료 없음·0곳이면 없음), 바닥 한 줄과 [공고 예정일 경과 보기](n≥1), 자료 없음 문장', function () {
  const mk = function (rank) { return { id: 'x' + rank, name: 'x', kind: 'WATCH', nextDate: '', wst: { rank: rank, judged: true } }; };
  const w = kbb.watchSummary([mk(0), mk(1), mk(3), mk(3), mk(7)], true);
  assert.deepStrictEqual(w, { judged: true, total: 5, notice: 2, check: 2 });
  assert.deepStrictEqual(kbb.watchSummary([mk(0)], false), { judged: false, total: 1, notice: 0, check: 0 });   // 판정 안 한 줄(wst.rank 5·7)은 세지 않는다
  assert.strictEqual(kbb.watchChipHtml(w), '<span class="sr-only">곳, 그중</span><span class="hb-tflag"><span>공고 중</span> <b>2</b><span class="sr-only">곳</span></span>');
  assert.strictEqual(kbb.watchChipHtml(null) + kbb.watchChipHtml({ judged: false, notice: 3 }) + kbb.watchChipHtml({ judged: true, notice: 0 }), '');
  const base = { tab: 'goal', nGoal: 3, nWatch: 12, f: {}, shown: 3, total: 3, canEdit: true };
  assert.ok(kbb.toolbarHtml(Object.assign({ wsum: w }, base)).indexOf('>내 관심 기관 <b>12</b><span class="sr-only">곳, 그중</span><span class="hb-tflag"><span>공고 중</span> <b>2</b><span class="sr-only">곳</span></span></button>') > 0);
  assert.ok(kbb.toolbarHtml(base).indexOf('>내 관심 기관 <b>12</b></button>') > 0);
  const ft = kbb.watchFootHtml({ judged: true, total: 5, check: 3 });
  assert.ok(ft.indexOf('<p class="hb-wfoot">') === 0 && ft.indexOf("'공고 중'은 입찰 공고 현황에 공고가 들어온 기관만 셉니다.") > 0 && ft.indexOf('(<b>3</b>곳)') > 0 && ft.indexOf('<button type="button" id="hb-to-over">공고 예정일 경과 보기</button>') > 0);
  assert.ok(kbb.watchFootHtml({ judged: true, total: 5, check: 0 }).indexOf('hb-to-over') < 0);
  const nd = kbb.watchFootHtml({ judged: false, total: 5, check: 0 });
  assert.ok(nd.indexOf('공고 자료를 받지 못해 공고 상태를 판정하지 않았습니다.') > 0 && nd.indexOf('hb-to-over') < 0 && nd.indexOf('(<b>') < 0);
  assert.strictEqual(kbb.watchFootHtml({ judged: true, total: 0, check: 0 }), '');   // 관심 기관이 0곳이면 바닥 줄 없음
});

test('연결: [공고 예정일 경과 보기]는 dashboard.js를 고치지 않고 showPast로 연다, 관심 탭에서만 바닥 줄', function () {
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("case 'hb-to-over': openOverdue(); break;") > 0);
  assert.ok(/function openOverdue\(\) \{[\s\S]*?goNotice\(''\)[\s\S]*?showPast[\s\S]*?flash\('입찰 공고 현황을 열 수 없습니다\./.test(k));
  assert.ok(src('js/dashboard.js').indexOf('dash.showPast = function () { if (host) showPast(); };') > 0);
  assert.ok(k.indexOf('watch && ok && !noWatch ? kbb.watchFootHtml(wsum) : kbb.goalFootHtml(ALL.notice.length)') > 0);
  assert.ok(k.indexOf('wsum: wsum });') > 0 && k.indexOf("v.wsum && v.wsum.judged ? v.wsum.notice : -1") > 0);   // 칩 수가 바뀌면 도구 줄을 다시 그린다
});

test('CSS: 8% 틴트 칩·.hb-q.hot·.hb-q.chk·.hb-wfoot, hex·box-shadow·새 :root 변수 없음', function () {
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-q\.hot \{ color:color-mix\(in srgb, var\(--red\) 72%, var\(--fg\)\); \}/.test(css) && /\.hb-q\.chk \{ color:var\(--fg\); font-weight:700; \}/.test(css));
  const chip = css.match(/\.hb-tb \.ap-tabs \.hb-tflag \{[^}]*\}/);
  assert.ok(chip && /height:18px/.test(chip[0]) && /var\(--red\) 8%, var\(--panel\)/.test(chip[0]) && /var\(--red\) 72%, var\(--fg\)/.test(chip[0]) && chip[0].indexOf('18%') < 0 && chip[0].indexOf('#') < 0);
  assert.ok(/\.hb-tb \.ap-tabs \.hb-tflag b \{[^}]*font:700 11px var\(--mono\)/.test(css) && /\.hb-wfoot \{[^}]*flex:1 1 auto/.test(css) && /\.hb-tf \.hb-wfoot button \{ margin-left:8px; \}/.test(css));
});
