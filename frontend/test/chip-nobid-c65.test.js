const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
const kbb = require('../js/kbboard.js');
const prep = require('../js/prep.js');
const TODAY = new Date('2026-11-19T00:00:00');
const R = { name: '가', region: '11', type: '지자체', institutionId: 'I1' };
const V = [{ key: '11|가', name: '가', slot: 1 }];                                   // 지금 국민은행
const NX = [{ key: '11|가', name: '가', from: '2027', term: '2027~2030', quote: '국민은행 선정' }];   // 2027년부터 국민은행(지금은 다른 은행)
const L = function (bank, kind, from) { return { bank_name: bank, src_kind: kind, term_from: from || '2027-01-01' }; };
const chip = function (verified, next, lines) { return kbb.nextChip(R, verified, next, lines ? { lines_next: lines } : null, TODAY); };

test('C1 칩 판정표(design 6-4): 확인 줄 3종 + 기사 3종, 처음 맞는 하나만', function () {
  let c = chip(V, [], [L('국민은행', 'DOC_NO')]);
  assert.deepStrictEqual([c.cls, c.text, c.chk, !!c.src], ['hb-bank', '국민은행 재약정', true, false]);          // 확인 + 지금 국민
  c = chip([], NX, [L('국민은행', 'LINK')]);
  assert.deepStrictEqual([c.cls, c.text, c.chk, !!c.src], ['hb-new', '국민은행 신규약정', true, false]);          // 확인 + 지금 다른 은행
  c = chip(V, [], [L('부산은행', 'DOC_NO')]);
  assert.deepStrictEqual([c.cls, c.text, !!c.src, c.sr], ['hb-leaves', '부산은행 약정 예정', false, ' (2027-01-01부터)']);
  const stay = [{ key: '11|가', name: '가', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }];
  c = chip(stay, [], null);
  assert.deepStrictEqual([c.cls, c.text, !!c.src, !!c.chk], ['hb-news', '국민은행 재약정 예정', true, false]);   // 기사만
  c = chip([], NX, null);
  assert.deepStrictEqual([c.cls, c.text, !!c.src], ['hb-news', '국민은행 신규약정 예정', true]);
  c = chip([{ key: '11|가', name: '가', slot: 2, leaves: '2027', next: '국민은행 빠짐' }], [], null);
  assert.deepStrictEqual([c.cls, c.text, !!c.src, c.sr], ['hb-leaves', '다른 은행 약정 예정', true, ' (2027년부터)']);
  assert.strictEqual(chip([], [], null), null);                                                                    // 근거 없음 → 칩 없음
});

test('C1 우선순위: 확인 줄이 기사 줄보다 먼저, 1·2금고가 다르면 국민은행 줄을 먼저, PRESS만 있으면 (기사)', function () {
  assert.strictEqual(chip(V, [], [L('국민은행', 'PRESS'), L('부산은행', 'DOC_NO')]).text, '부산은행 약정 예정');   // PRESS는 확인 줄이 아니다
  assert.strictEqual(chip(V, [], [L('부산은행', 'DOC_NO'), L('KB국민은행', 'LINK')]).text, '국민은행 재약정');        // 국민은행 줄 우선
  const p = chip(V, [], [L('국민은행', 'PRESS')]);
  assert.deepStrictEqual([p.cls, p.text, !!p.src], ['hb-news', '국민은행 재약정 예정', true]);
  assert.strictEqual(chip(V, [], [L('국민은행', '')]).cls, 'hb-bank');                                             // src_kind가 아직 없으면 확인으로 본다(서버 보강 전 — 이관 메모 1)
  assert.strictEqual(chip(V, [], [{ bank_name: '국민은행', term_from: '2026-01-01', src_kind: 'DOC_NO' }]), null);   // 이미 시작한 줄은 시작 전 줄이 아니다
});

test('C1 마크업: 기사 칩에는 hb-bank·hb-new·체크 svg가 없고 (기사) 글자가 있다, 이스케이프, 확인 칩은 체크 svg', function () {
  const news = kbb.nextChipHtml({ cls: 'hb-news', text: '국민은행 재약정 예정', src: true });
  assert.strictEqual(news, '<span class="hb-slot hb-news">국민은행 재약정 예정<span class="src">(기사)</span></span>');
  assert.ok(news.indexOf('hb-bank') < 0 && !/hb-new(?!s)/.test(news) && news.indexOf('<svg') < 0);
  const ok = kbb.nextChipHtml(chip(V, [], [L('국민은행', 'DOC_NO')]));
  assert.ok(ok.indexOf('class="hb-slot hb-bank" data-bank="kb"><svg') >= 0 && ok.indexOf('국민은행 재약정<span class="sr-only"> (다음 약정, 선정 공고·협약으로 확인)</span></span>') > 0);
  const nw = kbb.nextChipHtml(chip([], NX, [L('국민은행', 'DOC_NO')]));
  assert.ok(nw.indexOf('class="hb-slot hb-new"><svg') >= 0 && nw.indexOf('국민은행 신규약정') > 0 && nw.indexOf('data-bank') < 0);
  assert.ok(kbb.nextChipHtml({ cls: 'hb-leaves', text: '<img onerror=1> 약정 예정' }).indexOf('<img') < 0);
  // 목록 줄(rowHtml)은 039 요약(o.sum)을 받아 같은 칩을 쓴다
  const it = { key: '11|가', name: '가', region: '11', endDays: 40, days: 40, date: '2027-02-01', label: '', confidence: '추정', overdue: false, rec: R };
  const h = kbb.rowHtml(it, { verified: V, nextList: [], sum: { lines_next: [L('국민은행', 'DOC_NO')] }, today: TODAY });
  assert.ok(h.indexOf('국민은행 재약정<span class="sr-only">') > 0 && h.indexOf('hb-news') < 0);
});

test('C1 배선·CSS(소스): renderOurs가 039 요약을 rowHtml에 넘긴다, .hb-new는 var(--green)·hex 없음, (기사)는 muted', function () {
  const k = read('js/kbboard.js'), h = read('index.html');
  assert.ok(k.indexOf('sum: (gs.sum || {})[id] || null, today: U.todayDate()') > 0);
  const a = h.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = h.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = h.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-slot\.hb-new \{[^}]*color:var\(--green\)[^}]*border-color:var\(--green\)[^}]*color-mix\(in srgb, var\(--green\) 12%, var\(--panel\)\)/.test(css));
  assert.ok(/\.hb-slot\.hb-new svg \{ width:12px; height:12px;/.test(css) && /\.hb-slot \.src \{[^}]*color:var\(--muted\)/.test(css) && /\.hb-slot\.hb-news \{ color:var\(--fg\); \}/.test(css));
  assert.ok(/@media \(forced-colors:active\) \{ \.hb-slot\.hb-new \{ color:CanvasText; border-color:Highlight; \} \}/.test(css));
});

test('B1 .hb-warn.soft 덮어쓰기 규칙 없음(클래스는 마크업에만 남는다)', function () {
  const h = read('index.html');
  assert.ok(h.indexOf('.hb-warn.soft') < 0 && /\.hb-warn \{[^}]*border:1px solid var\(--orange\)[^}]*color-mix\(in srgb, var\(--orange\) 8%, transparent\)/.test(h));
  assert.ok(kbb.warnHtml({ mode: 'screen', note: { year: 2030, src: 'lofin' } }).indexOf('class="hb-warn soft"') > 0);
});

test('A1 입찰 없음 팝업: tidy_action UNCONFIRM은 [제안 확정 취소…], CANCEL은 [제안 중단…], 줄·단추에 \'정리\'가 남지 않는다, id·data-act는 그대로', function () {
  const mk = function (act, st) { return { bid_case_id: 'B1', institution_id: 'I1', institution_name: '노원구청', state_cd: st,
    nobid_notice: { applicable: true, mode: 'popup', round_seq: 3, rev_no: 2, handled_at: '2026-12-01T10:00:00+09:00', handler_name: '홍', can_view_notice: true, can_ack: true, tidy_action: act } }; };
  const u = prep.nobidPopupHtml(mk('UNCONFIRM', 'CONFIRMED'), { canNotice: true }), c = prep.nobidPopupHtml(mk('CANCEL', 'WRITING'), { canNotice: true });
  assert.ok(u.indexOf('id="pp-nb-tidy" data-act="nobid-tidy">제안 확정 취소…</button>') > 0 && c.indexOf('id="pp-nb-tidy" data-act="nobid-tidy">제안 중단…</button>') > 0);
  [u, c, prep.nobidPopupHtml(mk('OPEN_PENDING', 'OPEN_PENDING'), {}), prep.nobidPopupHtml(mk('PLAN_PENDING', 'APPROVAL_PENDING'), {})].forEach(function (h) { assert.ok(h.indexOf('정리') < 0); });
  assert.ok(c.indexOf('제안 중단: 입찰 없음이 맞으면 이 건을 중단(미참여)합니다.') > 0 && c.indexOf('중단하면 되돌릴 수 없습니다.') > 0);
  assert.ok(/nbBtnUnconfirm/.test(read('js/prep.js')) && read('js/prep.js').indexOf('nbBtnTidy') < 0);
});

test('옛 메뉴 이름 [제안서 사전준비 프로세스]는 화면 안 안내 문구에 남지 않는다', function () {
  ['js/dashboard.js', 'js/prep.js'].forEach(function (f) {
    read(f).split('\n').forEach(function (line) { if (!/^\s*\/\//.test(line)) assert.ok(line.indexOf('[제안서 사전준비 프로세스]') < 0 && line.indexOf('› 제안서 사전준비 프로세스]') < 0, f + ': ' + line.trim().slice(0, 60)); });
  });
  const h = read('index.html');
  assert.ok(h.indexOf('<div class="tm-head"><b>대시보드</b>') > 0 && h.indexOf('<div class="tm-head"><b>제안서 사전준비 프로세스</b>') < 0);
  assert.ok(read('js/dashboard.js').indexOf('[영업 추진 준비 › 대시보드]') > 0);
});
