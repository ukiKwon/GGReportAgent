const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 아주 작은 가짜 document — el()/textNodes 가 쓰는 createElement·createTextNode 만
function mkNode(tag) {
  return { tagName: String(tag).toUpperCase(), className: '', textContent: '', children: [],
           appendChild: function (c) { this.children.push(c); return c; }, setAttribute: function () {} };
}
globalThis.document = { createElement: mkNode, createTextNode: function (t) { return { nodeType: 3, textContent: t }; } };
const mn = require('../js/board-minutes.js');
const mat = require('../js/board-material.js');

const SRC = fs.readFileSync(path.join(__dirname, '../js/board-minutes.js'), 'utf8');

function fake(status, body, seen) {
  return function (url, init) {
    if (seen) seen.push({ url: url, init: init });
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
  };
}

test('tabShown: 200 이면서 목록이 있거나 올릴 수 있을 때만', function () {
  assert.strictEqual(mn.tabShown(200, { items: [{}], can_upload: false }), true);
  assert.strictEqual(mn.tabShown(200, { items: [], can_upload: true }), true);
  assert.strictEqual(mn.tabShown(200, { items: [], can_upload: false }), false);
  assert.strictEqual(mn.tabShown(404, { items: [{}], can_upload: true }), false);
  assert.strictEqual(mn.tabShown(200, null), false);
});

test('textNodes: [이름]·[가림]·[가림: 개인정보 의심 줄] 은 칩, 나머지(<b> 포함)는 글자 그대로', function () {
  const p = mn.el('p');
  mn.textNodes(p, 'a [이름] b [가림] c [가림: 개인정보 의심 줄] <b>x</b>');
  const chips = p.children.filter(function (c) { return c.className === 'mn-mask'; }).map(function (c) { return c.textContent; });
  assert.deepStrictEqual(chips, ['[이름]', '[가림]', '[가림: 개인정보 의심 줄]']);
  assert.ok(p.children.every(function (c) { return c.tagName !== 'B'; }));
  assert.strictEqual(p.children[p.children.length - 1].textContent, ' <b>x</b>');
  const q = mn.el('p'); mn.textNodes(q, null); assert.strictEqual(q.children.length, 0);
});

test('uttId: 숫자만 앵커 id 로', function () {
  assert.strictEqual(mn.uttId(12), 'mn-u-12');
  assert.strictEqual(mn.uttId('1"x'), '');
  assert.strictEqual(mn.uttId(''), '');
});

test('clock·dur·range', function () {
  assert.strictEqual(mn.clock(3725), '1:02:05');
  assert.strictEqual(mn.clock(200), '03:20');
  assert.strictEqual(mn.dur(1920), '32분');
  assert.strictEqual(mn.dur(30), '1분 미만');
  assert.strictEqual(mn.dur(3900), '1시간 5분');
  assert.strictEqual(mn.range({ start_sec: 0, end_sec: 200 }), '00:00–03:20');
});

test('날짜: validDate·addDays·kst', function () {
  assert.ok(mn.validDate('2026-11-20') && !mn.validDate('2026-02-30') && !mn.validDate('x'));
  assert.strictEqual(mn.addDays('2026-11-20', 30), '2026-12-20');
  assert.strictEqual(mn.kst('2026-11-10T16:00:00+00:00'), '11-11 01:00');
});

test('errorText: 6-5 표의 코드 전부 — 문구가 있고 코드명·헤더명이 새지 않는다', function () {
  const codes = ['UI_ID_REQUIRED', 'TOO_MANY_PARTS', 'OPTIONS_INVALID', 'BAD_REQUEST', 'FILE_TOO_LARGE', 'BODY_TOO_LARGE', 'TRANSCRIPT_REQUIRED',
    'MEETING_DATE_INVALID', 'TITLE_REQUIRED', 'EMPTY_FILE', 'NOT_TXT', 'BINARY_SIGNATURE', 'NUL_BYTE', 'ENCODING_UTF16', 'ENCODING_UNKNOWN', 'CONTROL_CHAR',
    'LIMIT_LINES', 'LIMIT_LINE', 'LIMIT_UTTERANCES', 'LIMIT_SEGMENTS', 'LIMIT_ITEMS', 'LIMIT_ITEM_LEN', 'LIMIT_SPEAKER', 'PARSE_TIMEOUT',
    'TRANSCRIPT_NO_UTTERANCE', 'TIMELINE_FORMAT', 'TIMELINE_RANGE', 'TIMELINE_LOOKS_TRANSCRIPT', 'SUMMARY_LOOKS_TIMELINE', 'SUMMARY_NO_ITEMS',
    'TERMS_INVALID', 'RELEASE_INVALID', 'PREVIEW_CHANGED', 'ALREADY_UPLOADED', 'MINUTES_CAP', 'REV_CHANGED', 'MASK_REQUIRED', 'LIMIT_EDIT_LEN',
    'NOT_TODO', 'SCOPE_TARGET_INVALID', 'GRANT_UNTIL_INVALID', 'SCOPE_CAP', 'NOPE'];
  codes.forEach(function (c) {
    const e = mn.errorText(c === 'FILE_TOO_LARGE' || c === 'BODY_TOO_LARGE' ? 413 : c.indexOf('MINUTES_CAP') === 0 || c === 'PREVIEW_CHANGED' || c === 'REV_CHANGED' || c === 'ALREADY_UPLOADED' ? 409 : 422,
      { code: c, slot: 'transcript', line: 7, message: '서버 문구', kinds: { name: 2, pii: 1 } }, { action: 'upload' });
    assert.ok(e.text && e.text.length > 4, c);
    assert.ok(!/X-Screen-Id|X-Button-Id/.test(e.text) && !new RegExp(c).test(e.text), c + ' 문구에 내부 이름이 새면 안 된다');
    assert.ok(typeof e.field === 'string' && e.field, c);
  });
  assert.strictEqual(mn.errorText(400, { code: 'UI_ID_REQUIRED', message: '화면·버튼 식별자(X-Screen-Id, X-Button-Id)' }).text.indexOf('X-'), -1);
  assert.strictEqual(mn.errorText(422, { code: 'NOT_TXT', slot: 'timeline' }, { action: 'upload' }).field, 'timeline');
  assert.ok(mn.errorText(422, { code: 'CONTROL_CHAR', slot: 'summary', line: 3 }).text.indexOf('맞춤 요약 3번째 줄에') === 0);
  assert.ok(mn.errorText(422, { code: 'MASK_REQUIRED', kinds: { name: 2, pii: 1 } }).text.indexOf('이름 2곳·개인정보 1곳') === 0);
  assert.strictEqual(mn.errorText(413, { code: 'FILE_TOO_LARGE', slot: 'summary', message: '파일 하나당 2MB 이하' }).text, '파일 하나당 2MB 이하');
  assert.strictEqual(mn.errorText(422, { code: 'LIMIT_EDIT_LEN' }, { kind: 'item' }).text, '1~1,000자(항목)로 적으세요.');
  assert.strictEqual(mn.errorText(404, '찾을 수 없습니다.', { action: 'upload' }).field, 'box');
  assert.ok(mn.errorText(404, null).text.indexOf('삭제됐거나') > 0);
  assert.ok(mn.errorText(403, null, { action: 'upload' }).text.indexOf('담당자만') > 0);
  assert.ok(mn.errorText(403, { code: 'VERIFIED_REQUIRED' }).text.indexOf('사내 인증') === 0);
  assert.strictEqual(mn.errorText(0, null).text, mn.errorText(503, null).text);
  assert.strictEqual(mn.errorText(409, { code: 'PREVIEW_CHANGED' }).field, 'save');
});

test('warningText·maskedText', function () {
  assert.ok(mn.warningText('SEG_OVERLAP', 2).indexOf('2개') > 0);
  assert.strictEqual(mn.warningText('???', 1), null);
  assert.strictEqual(mn.maskedText({ name: 12, title: 2, pii: 3, term: 1, line: 0, released: 0 }), '가린 곳: 이름 12곳 · 성+직함 2곳 · 개인정보 3곳 · 지정한 단어 1곳');
  assert.ok(mn.maskedText({}).indexOf('가린 곳이 없습니다.') === 0);
});

test('parseTerms·validateUpload: 사전 검사', function () {
  assert.deepStrictEqual(mn.parseTerms('가나\n\n 다라 \n가나').list, ['가나', '다라']);
  assert.strictEqual(mn.parseTerms('가').bad, true);
  assert.strictEqual(mn.parseTerms(new Array(102).join('가나다\n').replace(/가나다/g, function () { return 'x' + Math.random(); })).bad, true);
  const slots = { transcript: { provided: true, mode: 'file', name: 'a.txt', size: 100 }, timeline: { provided: false }, summary: { provided: false } };
  const ok = mn.validateUpload({ date: '2026-11-17', title: '3분기', termsText: '', slots: slots }, '2026-11-20');
  assert.strictEqual(ok.ok, true);
  const bad = mn.validateUpload({ date: '2026-12-01', title: ' ', termsText: 'x',
    slots: { transcript: { provided: true, mode: 'file', name: 'a.docx', size: 5 }, timeline: { provided: true, mode: 'file', name: 'b.txt', size: 0 },
             summary: { provided: true, mode: 'paste', name: 'summary.txt', size: 3 * 1024 * 1024 } } }, '2026-11-20');
  assert.deepStrictEqual(Object.keys(bad.errs).sort(), ['meeting_date', 'summary', 'terms', 'timeline', 'title', 'transcript']);
  assert.strictEqual(mn.validateUpload({ date: '2026-11-17', title: 't', termsText: '', slots: { transcript: { provided: false } } }, '2026-11-20').errs.transcript.indexOf('원문 파일을'), 0);
});

test('buildForm: 파일명은 고정 이름, options 는 JSON Blob(저장일 때만 digest·rules_ack)', async function () {
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') return;
  const u = { date: '2026-11-17', title: ' 제목 ', src: { transcript: 'paste', timeline: 'file', summary: 'file' }, files: {}, paste: { transcript: '참석자 1 00:00\n안녕' },
              terms: '', release: { 지원: true, 한솔: false }, cands: {} };
  const pv = mn.buildForm(u, ['abc'], '');
  assert.strictEqual(pv.get('transcript').name, 'transcript.txt');
  assert.strictEqual(pv.get('timeline'), null);
  const o1 = JSON.parse(await pv.get('options').text());
  assert.deepStrictEqual(o1, { meeting_date: '2026-11-17', title: '제목', terms: ['abc'], release: ['지원'] });
  const sv = JSON.parse(await mn.buildForm(u, [], 'a'.repeat(64)).get('options').text());
  assert.strictEqual(sv.rules_ack, true);
  assert.strictEqual(sv.preview_digest.length, 64);
  const s1 = mn.signature(u); u.paste.transcript += 'x';
  assert.notStrictEqual(mn.signature(u), s1);
});

test('tabsHtml: 4번째 인자가 없으면 기존 결과, 있으면 회의록 탭(건수)', function () {
  const base = mat.tabsHtml('write', 0, false);
  assert.ok(base.indexOf('bd-tab-minutes') < 0);
  assert.strictEqual(mat.tabsHtml('write', 0, false, { show: false, count: 3 }), base);
  const t = mat.tabsHtml('write', 0, false, { show: true, count: 2 });
  assert.ok(t.indexOf('id="bd-tab-minutes"') > 0 && t.indexOf('>회의록 2</button>') > 0 && t.indexOf('aria-controls="bd-m-hist"') > 0);
  assert.ok(mat.tabsHtml('write', 0, false, { show: true, count: 0 }).indexOf('>회의록</button>') > 0);
});

test('tabKey: ids 를 넘기면 회의록 포함, 없으면 기존 3개', function () {
  assert.strictEqual(mat.tabKey('hist', 'ArrowRight'), 'write');
  const ids = ['write', 'ver', 'hist', 'minutes'];
  assert.strictEqual(mat.tabKey('hist', 'ArrowRight', ids), 'minutes');
  assert.strictEqual(mat.tabKey('minutes', 'ArrowRight', ids), 'write');
  assert.strictEqual(mat.tabKey('write', 'ArrowLeft', ids), 'minutes');
  assert.strictEqual(mat.tabKey('ver', 'End', ids), 'minutes');
});

test('probe: 헤더·404 숨김·빈 목록·오류 역할별·같은 자료는 한 번만', async function () {
  const seen = [];
  const mk = function (status, body, role) {
    return mn.createController({ doFetch: fake(status, body, seen), epoch: function () { return 0; }, me: function () { return { emp: '1', name: 'n', role: role || '영업팀' }; }, msg: function () {} });
  };
  let c = mk(200, { items: [{ minutes_id: 1 }, { minutes_id: 2 }], can_upload: false });
  let r = await c.probe(7);
  assert.deepStrictEqual([r.show, r.count, r.error], [true, 2, false]);
  assert.strictEqual(seen[0].url, '/board-materials/7/minutes');
  assert.strictEqual(seen[0].init.headers['X-Screen-Id'], 'board_write');
  assert.strictEqual(seen[0].init.headers['X-Button-Id'], 'minutes_tab');
  await c.probe(7);
  assert.strictEqual(seen.length, 1, '같은 자료는 다시 묻지 않는다');
  await c.probe(8);
  assert.strictEqual(seen.length, 2);
  assert.strictEqual((await mk(200, { items: [], can_upload: true }).probe(1)).show, true);
  assert.strictEqual((await mk(200, { items: [], can_upload: false }).probe(1)).show, false);
  assert.strictEqual((await mk(404, { detail: '찾을 수 없습니다.' }).probe(1)).show, false);
  r = await mk(500, null, '영업팀장').probe(1);
  assert.deepStrictEqual([r.show, r.error], [true, true]);
  assert.strictEqual((await mk(500, null, '영업팀').probe(1)).show, false);
  assert.strictEqual((await mk(500, null, '영업팀').probe(1, { isAssignee: true })).show, true);
  r = await mk(200, { items: [{}] }).probe(1); assert.strictEqual(r.show, true);
  const stopped = mk(200, { items: [{}] }); const pr = stopped.probe(1); stopped.stop();
  assert.strictEqual((await pr).stale, true);
});

test('RELEASE_INVALID: 문구·놓을 곳(preview)·고른 해제어를 푼다', function () {
  const e = mn.errorText(400, { code: 'RELEASE_INVALID' }, { action: 'upload' });
  assert.strictEqual(e.field, 'preview');
  assert.strictEqual(e.text, '가리지 않기로 고른 말을 풀었습니다. 다시 미리보기 하세요.');
  assert.deepStrictEqual(mn.failEffects({ code: 'RELEASE_INVALID' }), { clearRelease: true, resetSig: true });
  assert.deepStrictEqual(mn.failEffects({ code: 'PREVIEW_CHANGED' }), { clearRelease: false, resetSig: true });
  assert.deepStrictEqual(mn.failEffects('문자열'), { clearRelease: false, resetSig: false });
  assert.deepStrictEqual(mn.failEffects(null), { clearRelease: false, resetSig: false });
});

test('pruneRelease: 후보에 없거나 꺼진 해제어는 보내지 않는다', function () {
  assert.deepStrictEqual(mn.pruneRelease({ 김철수: true, 이영희: true, 박민수: false }, { 김철수: 2, 박민수: 1 }), { 김철수: true });
  assert.deepStrictEqual(mn.pruneRelease({ 김철수: true }, {}), {});
  assert.deepStrictEqual(mn.pruneRelease(null, null), {});
});

test('stale: 입력·해제 선택이 바뀌면 미리보기 표식이 달라진다(저장이 꺼진다)', function () {
  const mk = function () { return { date: '2026-11-01', title: 't', src: { transcript: 'paste', timeline: 'file', summary: 'file' }, files: {}, paste: { transcript: '가' }, terms: '', release: {} }; };
  const a = mk(), sig = mn.signature(a);
  assert.strictEqual(mn.signature(mk()), sig);
  const b = mk(); b.release = { 김철수: true }; assert.notStrictEqual(mn.signature(b), sig);
  const c = mk(); c.paste.transcript = '가나'; assert.notStrictEqual(mn.signature(c), sig);
  const d = mk(); d.terms = '홍길동'; assert.notStrictEqual(mn.signature(d), sig);
  const f = mk(); f.release = { 김철수: false }; assert.strictEqual(mn.signature(f), sig, '꺼진 선택은 표식에 넣지 않는다');
});

test('PREVIEW_CHANGED: 저장 자리(save)에 놓고 표식을 비운다', function () {
  assert.strictEqual(mn.errorText(409, { code: 'PREVIEW_CHANGED' }, { action: 'upload' }).field, 'save');
  assert.strictEqual(mn.failEffects({ code: 'PREVIEW_CHANGED' }).resetSig, true);
});

test('canDraw: 패널이 없거나 다른 탭이 덮었으면 그리지 않는다', function () {
  const panel = {}, other = {};
  assert.strictEqual(mn.canDraw(null, null), false);
  assert.strictEqual(mn.canDraw(panel, null), true, '처음 그리기');
  assert.strictEqual(mn.canDraw(panel, { parentNode: panel }), true);
  assert.strictEqual(mn.canDraw(panel, { parentNode: null }), false, '패널을 다른 탭이 비웠다');
  assert.strictEqual(mn.canDraw(panel, { parentNode: other }), false);
});

test('공개범위 30명: 안내만 둔다(막지 않는다)', function () {
  assert.strictEqual(mn.scopeNote(29), '');
  assert.strictEqual(mn.scopeNote(30), mn.TEXT.SCOPE_FULL);
  assert.ok(mn.TEXT.SCOPE_FULL.indexOf('기한 변경') > 0);
  assert.strictEqual(mn.errorText(409, { code: 'SCOPE_CAP' }).field, 'scope');
  assert.ok(!/disabled = true/.test(SRC.slice(SRC.indexOf('function drawScope'), SRC.indexOf('function addScope'))) || SRC.slice(SRC.indexOf('function drawScope'), SRC.indexOf('function addScope')).indexOf('full) n.disabled') < 0);
});

test('REV_CHANGED: 삭제·기타 경로는 [새로 불러오기]를 말하지 않는다', function () {
  assert.ok(mn.errorText(409, { code: 'REV_CHANGED' }, { action: 'edit' }).text.indexOf('[새로 불러오기]') >= 0);
  const del = mn.errorText(409, { code: 'REV_CHANGED' }, { action: 'delete' });
  assert.strictEqual(del.text.indexOf('새로 불러오기'), -1);
  assert.strictEqual(del.field, 'box');
});

test('목록 404(hidden) 문구는 빈 목록 문구와 다르다', function () {
  assert.strictEqual(mn.TEXT.HIDDEN, '회의록 기능을 쓸 수 없습니다.');
  assert.notStrictEqual(mn.TEXT.HIDDEN, mn.TEXT.EMPTY_LIST);
  assert.ok(SRC.indexOf("L.status === 'hidden'") > 0);
});

test('정적 검사: HTML 문자열 주입·브라우저 저장소 없음, 화면·버튼 id 는 서버 허용 목록 안', function () {
  assert.ok(SRC.indexOf('innerHTML') < 0, 'innerHTML');
  assert.ok(SRC.indexOf('insertAdjacentHTML') < 0 && SRC.indexOf('outerHTML') < 0 && SRC.indexOf('document.write') < 0);
  assert.ok(!/localStorage|sessionStorage/.test(SRC), '미리보기·파일은 브라우저 저장소에 두지 않는다');
  assert.ok(SRC.indexOf('confirm(') < 0);
  const java = path.join(__dirname, '../../kgi-ggreport-web/src/main/java/com/kbstar/kgi/ggreport/web/support/MinutesUiIds.java');
  if (!fs.existsSync(java)) return;
  const j = fs.readFileSync(java, 'utf8');
  const grab = function (name) { const m = new RegExp(name + '[\\s\\S]*?\\)\\)\\);').exec(j); return (m ? m[0] : '').match(/"[a-z_]+"/g).map(function (s) { return s.slice(1, -1); }); };
  const screens = grab('SCREENS'), buttons = grab('BUTTONS');
  Object.keys(mn.UI).forEach(function (k) { assert.ok(screens.indexOf(mn.UI[k]) >= 0, 'screen ' + mn.UI[k]); });
  Object.keys(mn.BTN).forEach(function (k) { assert.ok(buttons.indexOf(mn.BTN[k]) >= 0, 'button ' + mn.BTN[k]); });
});
