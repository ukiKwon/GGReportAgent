'use strict';
// 입찰 현황판 하단 띠 단추 셋·목표 표 동작 칸 없음·다음 회차 목표로 입구 제거·표 정렬 (사용자 11-26). 화면 실동작(포커스·inert)은 qa 실측.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const tc = require('../js/tchange.js');
const kbb = require('../js/kbboard.js');
const ROOT = path.join(__dirname, '..');
const rd = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };
const K = rd('js/kbboard.js'), HTML = rd('index.html');
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const E = function (id, o) { return Object.assign({ id: id, name: id + '구청', regionName: '서울', kind: 'GOAL', targetNo: 1, revNo: 2, year: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', memo: '', ownerEmpNo: '', moveYear: 0 }, o || {}); };
function sel(list) { const s = tc.newSel(); list.forEach(function (e) { tc.pick(s, e); }); return s; }
function rule(s) { const i = CSS.indexOf(s + ' {'); assert.ok(i >= 0, s + ' 규칙이 있어야 한다'); return CSS.slice(i, CSS.indexOf('}', i)); }

test('목표 표: 동작 칸·줄 끝 단추·다음 회차 입구 없음(열 6개 + 고르기 열), 관심 표 동작 칸은 그대로', function () {
  const base = { st: 'ok', year: 2026, tab: 'goal', rows: [], out: [], canEdit: true, cands: [] };
  const g = kbb.goalTableHtml(base);
  assert.ok(g.indexOf('c-act') < 0 && g.indexOf('<span class="sr-only">동작</span>') < 0 && g.indexOf('colspan="6"') > 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { selCol: true })).indexOf('colspan="7"') > 0);
  const w = kbb.goalTableHtml(Object.assign({}, base, { tab: 'watch' }));
  assert.ok(w.indexOf('<col class="c-act">') > 0 && w.indexOf('<span class="sr-only">동작</span>') > 0);
  assert.ok(K.indexOf('tonext') < 0 && K.indexOf('closedActsHtml') < 0 && K.indexOf('다음 회차 목표로…') < 0);
  assert.ok(CSS.indexOf('td.act') < 0 && CSS.indexOf('.hb-tt:not(.wt) col.c-act') < 0);
});

test('띠: 단추 셋 순서·꺼짐으로 시작, 관심 기관으로 단추 모양 CSS', function () {
  const b = tc.selbarHtml();
  assert.ok(b.indexOf('>수정하기</button>') < b.indexOf('>관심 기관으로</button>') && b.indexOf('>관심 기관으로</button>') < b.indexOf('>목표 기관에서 제외</button>'));
  assert.ok((b.match(/aria-disabled="true"/g) || []).length === 3 && b.indexOf('id="hb-seltow-why" class="sr-only"') > 0);
  assert.ok(CSS.indexOf('.hb-selbar #hb-seltow {') > 0 && CSS.indexOf('.hb-selbar #hb-seltow[aria-disabled="true"] {') > 0);
  assert.ok(K.indexOf("[['hb-seledit', editNow()], ['hb-seltow', towNow()], ['hb-seldel', delNow()]]") > 0);
});

test('toWatchBulkState: 관심·지난해·결재 중 줄은 제외, 모드 없음·관심 기능 없음·옮길 줄 없음은 이유와 함께 꺼짐', function () {
  const s = sel([E('A'), E('B', { year: 2025 }), E('W', { kind: 'WATCH', targetNo: 5 }), E('P', { pend: true })]);
  const c = { hasMode: true, noWatch: false, year: 2026 };
  const r = tc.toWatchBulkState(s, c);
  assert.deepStrictEqual([r.on, r.send.map(function (x) { return x.id; }), r.skip.map(function (x) { return x.id; })], [true, ['A'], ['B', 'W', 'P']]);
  assert.strictEqual(tc.toWatchBulkState(s, Object.assign({}, c, { hasMode: false })).on, false);
  assert.strictEqual(tc.toWatchBulkState(s, Object.assign({}, c, { noWatch: true })).why, tc.TOWATCH_NOWATCH);
  assert.strictEqual(tc.toWatchBulkState(sel([E('W', { kind: 'WATCH' })]), c).why, tc.TOWATCH_NONE);
  assert.strictEqual(tc.toWatchBulkState(tc.newSel(), c).why, '고른 기관이 없습니다.');
  const d = tc.deleteState(s, { hasMode: true, nReasons: 3, noWatch: false, year: 2026 });   // 제외 창 둘째 갈래 판정이 같이 온다
  assert.deepStrictEqual([d.on, d.send.length, d.watch.on, d.watch.send.length], [true, 3, true, 1]);
});

test('[관심 기관으로] 확인 창: 질문·보조 문장·단추(결재/바로), 제외되는 줄 수 한 줄, 이스케이프', function () {
  const h = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'APPROVAL', role: '영업팀', n: 2, total: 2 });
  assert.ok(h.indexOf('data-kind="towatchn"') > 0 && h.indexOf('<h2 class="dlg-t" id="tc-bd-t" tabindex="-1">관심 기관으로 옮기기 — 2곳</h2>') > 0);
  assert.ok(h.indexOf('<p id="tc-bd-q">선택한 2곳을 관심 기관으로 옮기시겠습니까?</p>') > 0 && h.indexOf('<p class="tc-sub">팀장 결재 요청으로 올라가고, 승인되면 옮겨집니다.</p>') > 0);
  assert.ok(h.indexOf('class="dlg-go">옮기기 요청</button>') > 0 && h.indexOf('tc-reason') < 0 && h.indexOf('tc-bd-items') < 0 && h.indexOf('tc-skipnote') < 0);
  assert.ok(tc.bulkDialogHtml({ kind: 'towatchn', mode: 'APPROVAL', role: '영업팀장', n: 1, total: 1 }).indexOf('부장 결재 요청으로 올라가고, 승인되면 옮겨집니다.') > 0);
  const hs = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'APPROVAL', role: '영업팀', n: 2, total: 4 });
  assert.ok(hs.indexOf('선택한 4곳 중 2곳을 관심 기관으로 옮기시겠습니까?') > 0 && hs.indexOf('<p class="tc-skipnote">관심 기관·지난해 목표 2곳은 옮기지 않습니다.</p>') > 0);
  const hd = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'DIRECT', role: '영업부장', n: 1, total: 1 });
  assert.ok(hd.indexOf('바로 옮기시겠습니까?') > 0 && hd.indexOf('class="dlg-go">옮기기</button>') > 0 && hd.indexOf('결재 없이 바로 옮겨집니다.') > 0);
});

test('[목표 기관에서 제외] 창: 라디오 둘(제외 기본·관심으로 옮기기), 사유 칸은 한 곳, 공통 문장, 둘째 갈래가 꺼지면 disabled + 이유', function () {
  const base = { kind: 'delete', mode: 'APPROVAL', role: '영업팀', n: 2, total: 3, won: true, wn: 2, reasons: [{ code: 'A', name: '예산 없음' }, { code: 'ETC', name: '기타' }] };
  const h = tc.bulkDialogHtml(base);
  assert.ok(h.indexOf('<h2 class="dlg-t" id="tc-bd-t" tabindex="-1">목표 기관에서 제외 — 2곳</h2>') > 0);
  assert.strictEqual((h.match(/<input type="radio" name="tc-bd-do"/g) || []).length, 2);
  assert.ok(h.indexOf('value="cancel" checked>') > 0 && h.indexOf('value="towatch">') > 0);
  assert.ok(h.indexOf('<b>목표 기관에서 제외</b><small>목표에서 뺍니다. 관심 기관에도 남지 않습니다.</small>') > 0 && h.indexOf('올해 목표에서 뺍니다') < 0);   // '올해' 고정 없음(design S2, qa P3-3)
  assert.ok(h.indexOf('<label for="tc-bd-rs">제외 사유') > 0 && h.indexOf('빼는 사유') < 0);
  assert.ok(h.indexOf('<b>관심 기관으로 옮기기</b><small>목표에서 빼고 내 관심 기관으로 계속 지켜봅니다.</small>') > 0);
  assert.ok(h.indexOf('<p id="tc-bd-q">어느 쪽이든 팀장 결재 요청으로 올라갑니다.</p>') > 0 && h.indexOf('class="dlg-go">결재 요청</button>') > 0);
  assert.strictEqual((h.match(/<select/g) || []).length, 1);
  assert.ok(h.indexOf('id="tc-bd-rsbox"') > 0 && h.indexOf('id="tc-bd-etcrow" hidden') > 0 && h.indexOf('tc-bd-items') < 0);
  assert.ok(h.indexOf('<small>관심 기관 1곳은 제외하지 않습니다.</small>') > 0 && h.indexOf('<small>관심 기관·지난해 목표 1곳은 옮기지 않습니다.</small>') > 0);
  const off = tc.bulkDialogHtml(Object.assign({}, base, { won: false, wn: 0, wwhy: '결재를 올릴 수 없습니다.' }));
  assert.ok(off.indexOf('value="towatch" disabled>') > 0 && off.indexOf('<label class="tc-opt off">') > 0 && off.indexOf('<small>결재를 올릴 수 없습니다.</small>') > 0);
  const dd = tc.bulkDialogHtml(Object.assign({}, base, { mode: 'DIRECT', role: '영업부장' }));
  assert.ok(dd.indexOf('어느 쪽이든 결재 없이 바로 반영됩니다.') > 0 && dd.indexOf('class="dlg-danger">제외</button>') > 0);
});

test('라디오 두 갈래가 각각 CANCEL / TO_WATCH 본문으로 나간다(결재 사유 포함), 배선', function () {
  const A = E('A', { memo: '기존 메모' });
  const c = tc.newItem(1, A); tc.setOp(c, 'CANCEL'); c.cancelCd = 'A';
  const rc = tc.deleteReason([{ code: 'A', name: '예산 없음' }], 'A', '');
  assert.strictEqual(tc.validate([c], { mode: 'APPROVAL', reason: rc }).ok, true);
  assert.deepStrictEqual(tc.buildBody([c], { mode: 'APPROVAL', reason: rc }), { reason: '목표 기관에서 제외 — 예산 없음', items: [{ institution_id: 'A', op_cd: 'CANCEL', target_no: 1, base_rev_no: 2, cancel_reason_cd: 'A', cancel_reason_etc: null }] });
  const t = tc.newItem(1, A); tc.setOp(t, 'TO_WATCH');
  assert.strictEqual(tc.validate([t], { mode: 'APPROVAL', reason: tc.TOWATCH_REASON }).ok, true);
  assert.deepStrictEqual(tc.buildBody([t], { mode: 'APPROVAL', reason: tc.TOWATCH_REASON }), { reason: tc.TOWATCH_REASON, items: [{ institution_id: 'A', op_cd: 'TO_WATCH', target_no: 1, base_rev_no: 2 }] });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tc.buildBody([t], { mode: 'DIRECT' }), 'reason'), false);   // 영업부장 바로 반영은 사유 없음
  const a = K.indexOf('function submitBulk(d) {'), b = K.indexOf('function finishBulk(');
  const sub = K.slice(a, b);
  assert.ok(sub.indexOf("tc.setOp(it, 'CANCEL')") > 0 && sub.indexOf("tc.setOp(it, 'TO_WATCH')") > 0 && sub.indexOf('reason = tc.TOWATCH_REASON;') > 0);
  assert.ok(sub.indexOf('finishBulk(d, x.body, send, op)') > 0 && sub.indexOf('ts = tw && d.bulk === \'delete\' ? s.watch : s') > 0);
  assert.ok(K.indexOf('function bulkChoice(d) {') > 0 && K.indexOf('input[name="tc-bd-do"]:checked') > 0 && K.indexOf("ev.target.name === 'tc-bd-do'") > 0);
  assert.ok(K.indexOf('function towNow() { return tc.toWatchBulkState(gs.sel,') > 0);
});

test('결과·오류 문장(옮기기): 바로 옮김 문장, 이미 관심 기관, 잠김', function () {
  assert.ok(tc.resultOf({ mode: 'DIRECT', applied: 2 }, 2, 'towatch').text.indexOf('목표 기관 2곳을 내 관심 기관으로 옮겼습니다.') === 0);
  assert.ok(tc.resultOf({ mode: 'APPROVAL' }, 2, 'towatch').text.indexOf('결재 요청을 올렸습니다') === 0);
  const items = [{ uid: 1, name: '노원구청' }, { uid: 2, name: '강남구청' }];
  const x = function (s, code, n) { return { status: s, body: { detail: { code: code, item_no: n } } }; };
  const w = tc.bulkError(x(409, 'ALREADY_WATCH', 1), items, 'towatch');
  assert.ok(w.msg.indexOf('노원구청은 이미 내 관심 기관에 들어 있어 옮기지 못했습니다.') === 0 && w.msg.indexOf('이번 수정') < 0 && w.refresh === false);
  const p = tc.bulkError(x(409, 'CHANGE_PENDING', 2), items, 'towatch');
  assert.ok(p.msg.indexOf('강남구청은 방금 결재 요청에 들어가 잠겨 옮기지 못했습니다.') === 0 && p.refresh === true);
});

test('표 정렬(DESIGN 표 정렬, 사용자 11-26): .hb-tt 머리·칸 가운데·세로 가운데, 묶음 제목·빈 상태·관심 메모만 왼쪽, 칸 안 flex는 가운데', function () {
  const th = rule('.hb-tt thead th'), td = rule('.hb-tt td, .hb-tt tbody th');
  assert.ok(/text-align:\s*center/.test(th) && /vertical-align:\s*middle/.test(th) && !/vertical-align:\s*bottom/.test(th) && !/text-align:\s*left/.test(th));
  assert.ok(/text-align:\s*center/.test(td) && /vertical-align:\s*middle/.test(td) && !/text-align:\s*left/.test(td));
  assert.ok(/text-align:\s*left/.test(rule('.hb-tt tr.grp th')));
  assert.ok(/text-align:\s*left/.test(rule('.hb-tt tr.emp td')));
  assert.ok(/text-align:\s*left/.test(rule('.hb-tt.wt tbody td:nth-last-child(2)')));
  assert.ok(/justify-content:\s*center/.test(rule('.hb-tt .hb-stg')) && /justify-content:\s*center/.test(rule('.hb-tt .hb-wacts')));
  assert.ok(/min-width:814px/.test(rule('.hb-tt')) && /min-width:1028px/.test(rule('.hb-tt.wt')));   // 쓰기 모드는 늘 고르기 열(32)이 붙는다(qa P3-4)
  assert.ok(/text-align:\s*left/.test(rule('.hb-tt tbody th[scope=row]')));   // 행 머리 기관 이름 칸만 왼쪽(사용자 11-26 승인), 머리값은 위 규칙대로 가운데
  assert.ok(/padding:\s*0 6px/.test(rule('.hb-tt td.aim')));   // 금고 방식 칩 좌우 같게(design S5)
  const own = CSS.split('\n').filter(function (l) { return l.indexOf('#tc-bd .tc-opt') >= 0 || l.indexOf('#hb-seltow') >= 0; }).join('\n');
  assert.ok(own.indexOf('box-shadow') < 0 && own.indexOf('opacity') < 0);   // 새 그림자·opacity 없음
});

test('일괄 창 동작 목록에 다음 회차 목표로 없음(사용자 11-26), 추가 창·추천의 다음 회차는 남음, 옛 카드 이름은 남음', function () {
  const C = tc.newItem(1, E('C', { closed: true }));
  const h = tc.itemHtml(C, 1, { years: [2026, 2027], tags: [], reasons: [] });
  assert.ok(h.indexOf('value="NEXT"') < 0 && h.indexOf('<option value="TO_WATCH">관심으로 옮기기</option>') > 0);
  assert.strictEqual(tc.opLong('NEXT'), '다음 회차 목표로');   // 결재함 지난 카드 읽기용(cardOpName)
  assert.ok(K.indexOf('다음 회차 준비 추천') > 0 && K.indexOf('다음 회차 준비 — 올해 결과가 정해진 곳') > 0);   // 추천받기 '다음 회차 준비' 묶음 유지
  assert.ok(K.indexOf('hb-w-year') > 0);   // [목표 기관 추가] 창의 다음 회차 연도로 넣기 유지
});

// ── qa·design 11-26 반영(2차) ─────────────────────────────────────────────
const ROW = function (o) { return Object.assign({ id: 'A', name: 'A구청', regionName: '서울', kind: 'GOAL', targetNo: 1, revNo: 2, targetYear: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', aimCd: '', aimName: '', memo: '' }, o || {}); };

test('결재 중 줄 skip이 실제 경로(tc.entryOfRow)로 동작한다(qa P3-1)', function () {
  const s = sel([tc.entryOfRow(ROW({ id: 'A' })), tc.entryOfRow(ROW({ id: 'P', pend: true }))]);
  const r = tc.toWatchBulkState(s, { hasMode: true, noWatch: false, year: 2026 });
  assert.deepStrictEqual([r.on, r.send.map(function (x) { return x.id; }), r.skip.map(function (x) { return x.id; })], [true, ['A'], ['P']]);
  assert.strictEqual(tc.toWatchBulkState(sel([tc.entryOfRow(ROW({ id: 'P', pend: true }))]), { hasMode: true, year: 2026 }).why, tc.TOWATCH_NONE);
});

test('상단 안내 중복 없음: 제외 창·[관심 기관으로] 창(design S1), 결재 중 잠금은 금고 방식도(칩 코드로 확인)', function () {
  assert.strictEqual(tc.dropHint('APPROVAL'), '결재가 끝날 때까지 이 기관들은 구분·금고 방식도 고칠 수 없습니다(요청자 취소·영업부장 반려로 풀림).');
  assert.strictEqual(tc.dropHint('DIRECT'), '반영한 사람·시각은 기록에 남습니다.');
  assert.ok(/function aimCellHtml\(r, o\) \{[\s\S]*?const can = !r\.pend &&/.test(K));   // 결재 중 줄은 금고 방식 칩도 읽기 전용 → 안내가 '구분·금고 방식도'
  const base = { kind: 'delete', mode: 'APPROVAL', role: '영업팀', n: 2, total: 2, won: true, wn: 2, reasons: [] };
  const da = tc.bulkDialogHtml(base), dd = tc.bulkDialogHtml(Object.assign({}, base, { mode: 'DIRECT', role: '영업부장' }));
  assert.ok(da.indexOf('<p class="dlg-hint">결재가 끝날 때까지 이 기관들은 구분·금고 방식도') > 0 && da.indexOf('영업팀장이 결재합니다') < 0);   // 결재 주체는 하단 공통 문장만
  assert.ok(dd.indexOf('<p class="dlg-hint">반영한 사람·시각은 기록에 남습니다.</p>') > 0 && dd.indexOf('영업부장은 결재 없이 바로 반영합니다') < 0);
  const count = function (h, t) { return h.split(t).length - 1; };
  const wd = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'DIRECT', role: '영업부장', n: 1, total: 1 }), wa = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'APPROVAL', role: '영업팀', n: 1, total: 1 });
  assert.strictEqual(count(wd, '옮긴 기록(누가·언제)은 팀 이력에 남습니다.'), 1);   // 같은 문장 두 번 없음
  assert.ok(wd.indexOf('<p class="tc-sub">결재 없이 바로 옮겨집니다.</p>') > 0);
  assert.ok(wa.indexOf('결재가 끝날 때까지 이 기관들은 구분·금고 방식도 고칠 수 없습니다') > 0 && count(wa, '옮긴 기록(누가·언제)은 팀 이력에 남습니다.') === 1);   // 승인 모드도 잠금 한 줄
  assert.ok(tc.APPROVAL_NOW_MSG.indexOf('구분·금고 방식은 결재 없이 바로 바뀝니다.') > 0);
});

test('대상 이름 줄: 최대 3곳 + 외 n곳 + 화면 밖 표시, 이름은 이스케이프, 화면 밖 수 계산(qa P2-1)', function () {
  assert.strictEqual(tc.targetLine(['가나구청', '마바군청'], 0), '대상: 가나구청, 마바군청');
  assert.strictEqual(tc.targetLine(['가', '나', '다', '라', '마'], 0), '대상: 가, 나, 다 외 2곳');
  assert.strictEqual(tc.targetLine(['가나구청', '마바군청'], 1), '대상: 가나구청, 마바군청 (화면 밖 1곳 포함)');
  assert.strictEqual(tc.targetLine([], 0), '');
  const A = tc.entryOfRow(ROW({ id: 'A' })), B = tc.entryOfRow(ROW({ id: 'B' })), C = tc.entryOfRow(ROW({ id: 'C' }));
  assert.strictEqual(tc.offCount([A, B, C], [ROW({ id: 'A' }), ROW({ id: 'B', out: true })]), 2);   // B는 목표 밖 줄이라 화면에 없는 것으로 센다
  assert.strictEqual(tc.offCount([A], [ROW({ id: 'A', targetNo: 9 })]), 1);   // 같은 기관이라도 다른 목표 번호는 다른 줄
  const m = { kind: 'delete', mode: 'APPROVAL', role: '영업팀', n: 2, total: 2, won: true, wn: 1, reasons: [], ctgt: { names: ['가나구청', '<i>x</i>'], off: 1, dn: 0, dwhat: '' }, wtgt: { names: ['가나구청'], off: 0, dn: 0, dwhat: '' } };
  const h = tc.bulkDialogHtml(m);
  assert.ok(h.indexOf('<div class="tc-tgt" id="tc-bd-tgt-cancel"><p class="tc-skipnote">대상: 가나구청, &lt;i&gt;x&lt;/i&gt; (화면 밖 1곳 포함)</p></div>') > 0 && h.indexOf('<i>x') < 0);
  assert.ok(h.indexOf('<div class="tc-tgt" id="tc-bd-tgt-towatch" hidden><p class="tc-skipnote">대상: 가나구청</p></div>') > 0);   // 둘째 갈래 줄은 숨김으로 시작
  const w = tc.bulkDialogHtml({ kind: 'towatchn', mode: 'DIRECT', role: '영업부장', n: 2, total: 2, wtgt: { names: ['가', '나'], off: 0, dn: 0, dwhat: '' } });
  assert.ok(w.indexOf('<div class="tc-tgt" id="tc-bd-tgt-towatch"><p class="tc-skipnote">대상: 가, 나</p></div>') > 0);
  assert.ok(/#tc-bd \.tc-tgt p \{[^}]*\}/.test(CSS) && !/#tc-bd \.tc-tgt[^{]*\{[^}]*(box-shadow|opacity|#[0-9a-f]{3,6})/i.test(CSS));   // 새 색·그림자 없음
});

test('저장 전 대기 버림 안내: 대기가 있는 보낼 줄 수·종류, 갈래별 문장(qa P2-2)', function () {
  const A = tc.entryOfRow(ROW({ id: 'A' })), B = tc.entryOfRow(ROW({ id: 'B' })), s = sel([A, B]), d = {};
  assert.deepStrictEqual(tc.draftInfo(d, s, [A, B]), { dn: 0, dwhat: '' });
  tc.setDraft(d, A, 'NEW', '신규유치 도전');
  assert.deepStrictEqual(tc.draftInfo(d, s, [A, B]), { dn: 1, dwhat: '구분' });
  tc.setAimDraft(d, B, 'FIRST', '1금고');
  assert.deepStrictEqual(tc.draftInfo(d, s, [A, B]), { dn: 2, dwhat: '구분·금고 방식' });
  assert.deepStrictEqual(tc.draftInfo(d, s, [B]), { dn: 1, dwhat: '금고 방식' });   // 보낼 줄에 든 것만 센다
  assert.strictEqual(tc.discardLine(2, '구분·금고 방식', 'towatch'), '저장하지 않은 구분·금고 방식 바뀜 2곳은 버리고 지금 저장된 값으로 옮깁니다.');
  assert.strictEqual(tc.discardLine(2, '구분·금고 방식', 'cancel'), '저장하지 않은 구분·금고 방식 바뀜 2곳은 버립니다.');
  const h = tc.bulkDialogHtml({ kind: 'delete', mode: 'DIRECT', role: '영업부장', n: 2, total: 2, won: true, wn: 2, reasons: [],
    ctgt: { names: ['가', '나'], off: 0, dn: 2, dwhat: '구분·금고 방식' }, wtgt: { names: ['가', '나'], off: 0, dn: 2, dwhat: '구분·금고 방식' } });
  assert.ok(h.indexOf('<p class="tc-skipnote">저장하지 않은 구분·금고 방식 바뀜 2곳은 버립니다.</p>') > 0 && h.indexOf('버리고 지금 저장된 값으로 옮깁니다.') > 0);
  assert.ok(tc.bulkDialogHtml({ kind: 'towatchn', mode: 'DIRECT', n: 1, total: 1, wtgt: { names: ['가'], off: 0, dn: 0, dwhat: '' } }).indexOf('저장하지 않은') < 0);   // 대기 없으면 줄 없음
  assert.ok(K.indexOf('const tgtOf = function (list') > 0 && K.indexOf("tc.draftInfo(gs.draft, gs.sel, list)") > 0 && K.indexOf('tc.offCount(list, gs.rows)') > 0);   // 모델이 이 값을 싣는다
});

// bulkChoice·bulkChoose·submitBulk를 가짜 의존물로 실제 실행한다(kbboard.js 소스에서 잘라 내므로 구현이 바뀌면 같이 검증된다).
function bulkHarness(ctx) {
  const a = K.indexOf('function bulkChoice(d) {'), b = K.indexOf('function finishBulk(d, body, sent, op) {');
  assert.ok(a > 0 && b > a);
  const src = 'let chd = null, host = {}; const gs = ctx.gs;\n' +
    'function goalMode() { return ctx.mode; } function chq(d, id) { return d.els[id] || null; } function bulkErr(d, m) { ctx.errs.push(m || \'\'); }\n' +
    'function cancelReasons() { return ctx.reasons; } function bulkNow() { return ctx.now; } function bulkPaint() {} function bulkRepaint() {} function loadGoals() { return Promise.resolve(); } function say() {} function loadProgress() { return Promise.resolve(); } const PREP_CTX = {};\n' +
    'function finishBulk(d, body, sent, op) { ctx.fin = { op: op, sent: sent }; }\n' +
    K.slice(a, b) + '\nreturn { bulkChoose: bulkChoose, submitBulk: submitBulk, setChd: function (d) { chd = d; } };';
  return new Function('ctx', 'tc', 'kbb', 'root', src)(ctx, tc, { submitChanges: function (body, btn) { ctx.sent = { body: body, btn: btn }; return Promise.resolve({ status: 200, body: { mode: ctx.mode } }); } },
    { dlg: { clearInvalid: function (el) { ctx.cleared.push(el); }, invalid: function (el, msg) { ctx.invalid.push(msg); } } });
}
function mkDlg(radio) {
  const els = { 'tc-bd-rsbox': { hidden: false }, 'tc-bd-go': { textContent: '', className: '' }, 'tc-bd-tgt-cancel': { hidden: false }, 'tc-bd-tgt-towatch': { hidden: true }, 'tc-bd-rs': { value: '' }, 'tc-bd-etc': { value: '' } };
  return { els: els, busy: false, gone: false, goText: '', busyText: '', bulk: 'delete', overlay: { querySelector: function () { return { value: radio.v }; } } };
}

test('bulkChoose 실제 동작: 라디오 전환 시 사유 칸 숨김·단추 글자·클래스·대상 줄·경고 지움(qa 4절, P3-5)', function () {
  const radio = { v: 'cancel' }, ctx = { mode: 'APPROVAL', errs: [], cleared: [], invalid: [], gs: {}, reasons: [] }, d = mkDlg(radio), H = bulkHarness(ctx);
  H.bulkChoose(d, 'towatch');
  assert.strictEqual(d.els['tc-bd-rsbox'].hidden, true);
  assert.strictEqual(d.els['tc-bd-go'].textContent, '결재 요청'); assert.strictEqual(d.els['tc-bd-go'].className, 'dlg-go');
  assert.deepStrictEqual([d.els['tc-bd-tgt-cancel'].hidden, d.els['tc-bd-tgt-towatch'].hidden], [true, false]);
  assert.deepStrictEqual(ctx.cleared, [d.els['tc-bd-rs'], d.els['tc-bd-etc']]);   // 숨기는 사유 칸의 경고를 지운다
  assert.strictEqual(d.busyText, '올리는 중…');
  H.bulkChoose(d, 'cancel');
  assert.strictEqual(d.els['tc-bd-rsbox'].hidden, false); assert.strictEqual(d.els['tc-bd-go'].textContent, '결재 요청');
  assert.deepStrictEqual([d.els['tc-bd-tgt-cancel'].hidden, d.els['tc-bd-tgt-towatch'].hidden], [false, true]);
  ctx.mode = 'DIRECT';
  H.bulkChoose(d, 'towatch');
  assert.strictEqual(d.els['tc-bd-go'].textContent, '옮기기'); assert.strictEqual(d.els['tc-bd-go'].className, 'dlg-go'); assert.strictEqual(d.busyText, '옮기는 중…');
  H.bulkChoose(d, 'cancel');
  assert.strictEqual(d.els['tc-bd-go'].textContent, '제외'); assert.strictEqual(d.els['tc-bd-go'].className, 'dlg-danger'); assert.strictEqual(d.busyText, '제외하는 중…');
  assert.ok(K.indexOf("return !!r && bulkChoice(d) !== 'towatch' && !!r.value;") > 0);   // 닫기 확인은 제외 갈래일 때만 사유 값을 본다
});

test('submitBulk: 관심 갈래는 사유 검사를 건너뛰고 TO_WATCH 본문, 제외 갈래는 사유 없으면 막힘', async function () {
  const E1 = tc.entryOfRow(ROW({ id: 'A' }));
  const mkCtx = function (mode) { return { mode: mode, errs: [], cleared: [], invalid: [], gs: {}, reasons: [{ code: 'A', name: '예산 없음' }], fin: null, sent: null,
    now: { on: true, why: '', send: [E1], skip: [], watch: { on: true, why: '', send: [E1], skip: [] } } }; };
  const tick = function () { return new Promise(function (r) { setImmediate(r); }); };
  // 관심 갈래: 사유를 고르지 않아도 나간다
  let ctx = mkCtx('APPROVAL'), radio = { v: 'towatch' }, d = mkDlg(radio), H = bulkHarness(ctx);
  H.setChd(d); H.submitBulk(d); await tick();
  assert.deepStrictEqual(ctx.invalid, []);
  assert.deepStrictEqual(ctx.sent.body, { reason: tc.TOWATCH_REASON, items: [{ institution_id: 'A', op_cd: 'TO_WATCH', target_no: 1, base_rev_no: 2 }] });
  assert.strictEqual(ctx.fin.op, 'towatch');
  // 제외 갈래: 사유가 없으면 칸 아래 경고, 보내지 않음
  ctx = mkCtx('APPROVAL'); radio = { v: 'cancel' }; d = mkDlg(radio); H = bulkHarness(ctx);
  H.setChd(d); H.submitBulk(d); await tick();
  assert.deepStrictEqual(ctx.invalid, ['제외 사유를 고르세요.']); assert.strictEqual(ctx.sent, null);
  // 제외 갈래: 사유를 고르면 CANCEL 본문
  d.els['tc-bd-rs'].value = 'A'; ctx.invalid = []; H.submitBulk(d); await tick();
  assert.strictEqual(ctx.sent.body.items[0].op_cd, 'CANCEL'); assert.strictEqual(ctx.sent.body.reason, '목표 기관에서 제외 — 예산 없음'); assert.strictEqual(ctx.fin.op, 'delete');
});

test('carryText·seeCarried: 이월 폐지(서버 e01af679) 뒤 문구와 탭 선택(qa P2-3)', function () {
  assert.strictEqual(tc.carryText({ carried: 3 }).text, '다른 은행이 약정한 기관 3곳을 관심 기관으로 넘겼습니다.');
  assert.ok(tc.carryText({ revoked: 2 }).text.indexOf('관심 기관으로 자동으로 넘긴 기록을 거뒀습니다') > 0);
  assert.ok(tc.carryText({ carried: 3 }).text.indexOf('달성하지 못한') < 0);
  assert.ok(K.indexOf("gs.tab = watchHas ? 'watch' : 'goal';") > 0 && K.indexOf('goalHas') < 0);   // 넘어온 관심 줄이 있으면 관심 탭
});
