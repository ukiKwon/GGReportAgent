const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 아주 작은 가짜 document — el()/textNodes 가 쓰는 createElement·createTextNode 만
function mkNode(tag) {
  return { tagName: String(tag).toUpperCase(), className: '', textContent: '', children: [],
           appendChild: function (c) { this.children.push(c); return c; }, setAttribute: function () {} };
}
globalThis.document = { createElement: mkNode, createTextNode: function (t) { return { nodeType: 3, textContent: t }; }, getElementById: function () { return null; } };
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
    'NOT_TODO', 'SCOPE_TARGET_INVALID', 'GRANT_UNTIL_INVALID', 'SCOPE_CAP', 'SCOPE_TARGET_NOT_ELIGIBLE', 'NOPE'];
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

test('SCOPE_TARGET_NOT_ELIGIBLE: 공개 대상 아님 문구, 추가 칸에 놓는다', function () {
  const e = mn.errorText(400, { code: 'SCOPE_TARGET_NOT_ELIGIBLE' });
  assert.ok(e.text.indexOf('영업부서와 임원급') > 0);
  assert.strictEqual(e.field, 'scope');
});

test('eventText: 새 이력 코드 문구, 모르는 코드는 코드명을 내지 않고 기타 기록', function () {
  assert.strictEqual(mn.eventText('RULES_ACK'), '운용 수칙 확인');
  assert.strictEqual(mn.eventText('SCOPE_CANDIDATES'), '공개 후보 목록 열람');
  assert.strictEqual(mn.eventText('UPLOAD'), '올림');
  assert.strictEqual(mn.eventText('SOMETHING_NEW'), '기타 기록');
  assert.strictEqual(mn.eventText('constructor'), '기타 기록');
  assert.strictEqual(mn.eventText(undefined), '기타 기록');
});

test('candLabel·scopeCands·scopeNote: 후보 줄 글자, 서버 상한, 잘림', function () {
  assert.strictEqual(mn.candLabel({ name: '김영업', position_title: '부장', granted: false }), '김영업 부장');
  assert.strictEqual(mn.candLabel({ name: '김영업', position_title: '부장', granted: true, grant_until: '2026-12-31', expired: false }), '김영업 부장 (공개 중 ~2026-12-31)');
  assert.strictEqual(mn.candLabel({ name: '김영업', position_title: '부장', granted: true, grant_until: '2026-01-01', expired: true }), '김영업 부장 (기한 지남 2026-01-01)');
  assert.strictEqual(mn.scopeCands(null), null);
  assert.strictEqual(mn.scopeCands({ items: 'x' }), null);
  const a = mn.scopeCands({ items: [{ emp_no: '1' }, 5], truncated: true, scope_max: 50 });
  assert.strictEqual(a.items.length, 1); assert.strictEqual(a.truncated, true); assert.strictEqual(a.max, 50);
  assert.strictEqual(mn.scopeCands({ items: [] }).max, 30, '값이 없으면 기존 상수');
  assert.strictEqual(mn.scopeNote(49, 50), '');
  assert.ok(mn.scopeNote(50, 50).indexOf('50명') >= 0);
  assert.strictEqual(mn.scopeNote(30), mn.TEXT.SCOPE_FULL);
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

const RULES = { affiliations: ['기관', '은행', '외부'], side_role: '측', max_ordinal: 9, max_chars: 20,
  roles: ['측', '기관장', '구청장', '영업부장', '부장', '사회자', '위원'] };

test('labelCheck: 서버 SpeakerLabels.normalize 와 같은 판정(고르기만, 자유 글 없음)', function () {
  assert.deepStrictEqual(mn.labelCheck('', RULES), { ok: true, value: '' });
  assert.deepStrictEqual(mn.labelCheck('   ', RULES), { ok: true, value: '' });
  assert.deepStrictEqual(mn.labelCheck('구청장', RULES), { ok: true, value: '구청장' });
  assert.deepStrictEqual(mn.labelCheck('기관  구청장 2', RULES), { ok: true, value: '기관 구청장 2' }, '공백 정리');
  assert.deepStrictEqual(mn.labelCheck('은행 측', RULES), { ok: true, value: '은행 측' });
  assert.strictEqual(mn.labelCheck('측', RULES).ok, false, "'측'은 소속이 있어야 한다");
  assert.strictEqual(mn.labelCheck('김철수', RULES).ok, false, '목록에 없는 말');
  assert.strictEqual(mn.labelCheck('참석자 5', RULES).ok, false);
  assert.strictEqual(mn.labelCheck('[이름]', RULES).ok, false);
  assert.strictEqual(mn.labelCheck('구청장 0', RULES).ok, false, '번호는 1~9');
  assert.strictEqual(mn.labelCheck('구청장 10', RULES).ok, false);
  assert.strictEqual(mn.labelCheck('구청장 1 2', RULES).ok, false);
  assert.strictEqual(mn.labelCheck('기관', RULES).ok, false, '소속만으로는 안 된다');
  assert.strictEqual(mn.labelCheck('구청장', null).ok, false, '규칙이 없으면 받지 않는다');
  assert.strictEqual(mn.labelCheck('기관 구청장 1', { affiliations: ['기관'], roles: ['구청장'], max_chars: 5 }).ok, false, '글자 수 상한');
});

test('labelCompose·labelParse·dupLabels·spkNo·spkView·firstOf', function () {
  assert.strictEqual(mn.labelCompose('', '', '3'), '');
  assert.strictEqual(mn.labelCompose('기관', '', ''), '');
  assert.strictEqual(mn.labelCompose('은행', '측', ''), '은행 측');
  assert.strictEqual(mn.labelCompose('', '부장', '2'), '부장 2');
  assert.deepStrictEqual(mn.labelParse('기관 구청장 2', RULES), { aff: '기관', role: '구청장', ord: '2' });
  assert.deepStrictEqual(mn.labelParse('사회자', RULES), { aff: '', role: '사회자', ord: '' });
  assert.deepStrictEqual(mn.labelParse('엉터리', RULES), { aff: '', role: '', ord: '' });
  assert.deepStrictEqual(mn.dupLabels({ 1: '구청장', 3: '은행 측', 6: '은행 측', 7: '' }), [{ label: '은행 측', nos: [3, 6] }]);
  assert.strictEqual(mn.spkNo({ speaker_no: 4 }), 4);
  assert.strictEqual(mn.spkNo({ speaker: '참석자 12' }), 12);
  assert.strictEqual(mn.spkNo({ speaker: '홍길동' }), 0);
  assert.deepStrictEqual(mn.spkView(3, '구청장'), { main: '구청장', sub: '참석자 3' });
  assert.deepStrictEqual(mn.spkView(3, ''), { main: '참석자 3', sub: '' });
  const items = [{ seq_no: 1, speaker_no: 2, time: '00:01', noise: true }, { seq_no: 2, speaker_no: 2, time: '00:09' }, { seq_no: 3, speaker_no: 5, time: '00:12' }];
  assert.deepStrictEqual(mn.firstOf(items, 2), { seq: 2, time: '00:09' }, '잡음이 아닌 발언 먼저');
  assert.strictEqual(mn.firstOf(items, 9), null);
});

test('lostMasks: 가림 토큰이 줄었는지(종류별)', function () {
  assert.strictEqual(mn.lostMasks('[이름] 말', '김 말'), 1);
  assert.strictEqual(mn.lostMasks('[이름] 말 [가림]', '[이름] 말 [가림] 더'), 0);
  assert.strictEqual(mn.lostMasks('[이름] 말', '[이름] [이름] 말 [가림]'), 0, '늘어나는 것은 괜찮다');
  assert.strictEqual(mn.lostMasks('[이름] [가림]', '[이름] [이름]'), 1, '종류가 다르면 대신할 수 없다');
  assert.strictEqual(mn.lostMasks('[가림: 개인정보 의심 줄]', '[가림]'), 1);
  assert.strictEqual(mn.lostMasks('가림 없음', ''), 0);
  assert.ok(mn.maskLostText(2).indexOf('2곳') > 0);
});

test('고친 내용: editsPayload·fixCount·fixSummary', function () {
  assert.strictEqual(mn.editsPayload(undefined), null);
  assert.strictEqual(mn.editsPayload({ labels: {}, utt: {} }), null);
  assert.strictEqual(mn.editsPayload({ labels: { 1: '' }, utt: { 5: { orig: 'a', text: 'a', shown: 'a' } } }), null, '빈 이름표·같은 글은 고친 것이 아니다');
  const fix = { labels: { 3: '구청장', 1: '' }, utt: { 12: { orig: 'a', text: 'b', shown: 'b' }, 4: { orig: 'x', text: 'y', shown: 'y' }, 9: { orig: 'k', text: 'k', shown: 'k' } } };
  assert.deepStrictEqual(mn.editsPayload(fix), { speaker_labels: { 3: '구청장' }, utter_edits: [{ seq_no: 4, text: 'y' }, { seq_no: 12, text: 'b' }] });
  assert.deepStrictEqual(mn.fixCount(fix), { spk: 1, utt: 2 });
  assert.strictEqual(mn.fixSummary({ spk: 1, utt: 2 }), '고친 내용: 발화자 1명 · 발언 2건');
  assert.strictEqual(mn.fixSummary({ spk: 0, utt: 2 }), '고친 내용: 발언 2건');
  assert.strictEqual(mn.fixSummary({ spk: 0, utt: 0 }), '');
});

test('mergeFix: 이름표는 번호가 있으면 유지, 발언은 줄이 있으면 유지하고 화면 글을 응답 글로(공백만 다른 수정은 고친 것이 아니다)', function () {
  const fix = { labels: { 1: '구청장', 8: '부장' }, utt: { 2: { orig: 'a', text: 'b 홍길동', shown: 'b 홍길동' }, 3: { orig: 'c', text: 'c ', shown: 'c ' }, 99: { orig: 'z', text: 'zz', shown: 'zz' } } };
  const pv = { speakers: [{ speaker_no: 1 }, { speaker_no: 2 }], transcript: [{ seq_no: 2, text: 'b [이름]' }, { seq_no: 3, text: 'c' }] };
  const m = mn.mergeFix(fix, pv);
  assert.deepStrictEqual(m.fix.labels, { 1: '구청장' });
  assert.deepStrictEqual(m.fix.utt, { 2: { orig: 'a', text: 'b 홍길동', shown: 'b [이름]', base: 'b [이름]' } }, '보낼 글은 그대로, 보이는 글은 가린 결과, 검사 기준은 응답 글');
  assert.strictEqual(m.droppedSpk, 1);
  assert.strictEqual(m.droppedUtt, 1);
});

test('mergeFix(sent): 요청 뒤에 바꾼 줄은 화면 글을 덮지 않는다(P2-2)', function () {
  const fix = { labels: {}, utt: {
    2: { orig: 'a', text: 'b 홍길동', shown: 'b 홍길동' },   // 요청에 실은 그대로
    3: { orig: 'c', text: 'c2', shown: 'c2' },               // 요청 뒤에 처음 고침
    4: { orig: 'x', text: 'x2', shown: 'x2' } } };           // 요청에 x1 로 실었는데 그 뒤 x2 로 다시 고침
  const pv = { speakers: [], transcript: [{ seq_no: 2, text: 'b [이름]' }, { seq_no: 3, text: 'c' }, { seq_no: 4, text: 'x1' }] };
  const m = mn.mergeFix(fix, pv, { sent: { 2: 'b 홍길동', 4: 'x1' } });
  assert.deepStrictEqual(m.fix.utt[2], { orig: 'a', text: 'b 홍길동', shown: 'b [이름]', base: 'b [이름]' });
  assert.deepStrictEqual(m.fix.utt[3], { orig: 'c', text: 'c2', shown: 'c2' });
  assert.deepStrictEqual(m.fix.utt[4], { orig: 'x', text: 'x2', shown: 'x2' });
  assert.strictEqual(m.droppedUtt, 0);
});

test('mergeFix·editBase: 다시 미리보기에 성공하면 가림 검사 기준(base)이 새 응답 글로 바뀐다 · orig 는 그대로(P2-A)', function () {
  const fix = { labels: {}, utt: {
    2: { orig: '[이름] 안녕', text: '[이름] 안녕 하세요', shown: '[이름] 안녕 하세요' },
    3: { orig: 'c [이름]', text: 'c2 [이름]', shown: 'c2 [이름]', base: 'c [이름]' } } };
  const pv = { speakers: [], transcript: [{ seq_no: 2, text: '[이름] 안녕 하세요 [이름]' }, { seq_no: 3, text: 'c' }] };
  const m = mn.mergeFix(fix, pv, { sent: { 2: '[이름] 안녕 하세요' } });
  assert.strictEqual(m.fix.utt[2].orig, '[이름] 안녕', 'orig 는 고친 줄 판정·되돌리기 기준이라 그대로');
  assert.strictEqual(m.fix.utt[2].base, '[이름] 안녕 하세요 [이름]');
  assert.strictEqual(mn.fixed(m.fix.utt[2]), true, '고친 발언이 사라지지 않는다');
  assert.strictEqual(mn.lostMasks(mn.editBase(fix.utt[2]), '안녕 하세요'), 1, '옛 기준(orig)');
  assert.strictEqual(mn.lostMasks(mn.editBase(m.fix.utt[2]), '[이름] 안녕 하세요'), 1, '새 응답 글 기준: [이름] 2곳 중 1곳이 빠졌다');
  assert.strictEqual(m.fix.utt[3].base, 'c [이름]', '요청 뒤에 고친 줄은 base 도 그대로');
  assert.strictEqual(mn.editBase(null, '새 글'), '새 글', '고친 적 없는 줄은 응답 글');
  assert.strictEqual(mn.editBase({ orig: 'o', text: 'o2' }), 'o', 'base 가 없으면 orig');
});

test('dropEdited·fileSig: 원문 파일이 바뀌면 고친 발언을 모두 버리고 이름표는 둔다(P2-1)', function () {
  const mk = function (t) { return { date: '2026-11-01', title: 't', src: { transcript: 'paste', timeline: 'file', summary: 'file' }, files: {}, paste: { transcript: t }, terms: '', release: {} }; };
  const fix = { labels: { 1: '구청장' }, utt: { 2: { orig: 'a', text: 'b', shown: 'b' }, 3: { orig: 'c', text: 'c', shown: 'c' }, 4: { orig: 'd', text: 'd ', shown: 'd ' } } };
  const dr = mn.dropEdited(fix);
  assert.strictEqual(dr.dropped, 1, '같은 글·공백만 다른 줄은 세지 않는다');
  assert.deepStrictEqual(dr.fix, { labels: { 1: '구청장' }, utt: {} });
  assert.deepStrictEqual(fix.utt[2], { orig: 'a', text: 'b', shown: 'b' }, '원본은 건드리지 않는다');
  assert.strictEqual(mn.fixDroppedText(2), '원문이 바뀌어 고친 발언 2건을 지웠습니다.');
  assert.notStrictEqual(mn.fileSig(mk('가')), mn.fileSig(mk('나')));
  const a = mk('가'), b = mk('가'); b.title = '다른 제목'; b.terms = '홍길동'; b.fix = { labels: { 1: 'x' }, utt: {} };
  assert.strictEqual(mn.fileSig(a), mn.fileSig(b), '제목·가릴 단어·고친 내용은 파일 표식에 넣지 않는다');
  assert.notStrictEqual(mn.signature(a), mn.signature(b));
});

test('fileSig: 원문 칸만 본다 — 구간·요약 칸이 바뀌어도 같다(P3-C)', function () {
  const mk = function () { return { date: '2026-11-01', title: 't', src: { transcript: 'paste', timeline: 'paste', summary: 'paste' }, files: {}, paste: { transcript: '가', timeline: 'x', summary: 'y' }, terms: '', release: {} }; };
  const a = mk(), b = mk(); b.paste.summary = '다른 요약'; b.paste.timeline = '다른 구간';
  assert.strictEqual(mn.fileSig(a), mn.fileSig(b));
  assert.notStrictEqual(mn.signature(a), mn.signature(b), '저장 표식(signature)은 요약 칸도 본다');
  const c = mk(); c.src.transcript = 'file'; c.files.transcript = { name: 'a.txt', size: 1, lastModified: 1 };
  assert.notStrictEqual(mn.fileSig(a), mn.fileSig(c));
});

test('mn.fixed: 서버처럼 앞뒤 공백을 뗀 뒤 비교한다(P3-2)', function () {
  assert.strictEqual(mn.fixed({ orig: 'a', text: ' a\n' }), false);
  assert.strictEqual(mn.fixed({ orig: 'a', text: 'b' }), true);
  assert.strictEqual(mn.editsPayload({ labels: {}, utt: { 1: { orig: 'a', text: 'a  ', shown: 'a  ' } } }), null);
});

test('isEditFail·errorText: 이름표·고친 발언 오류 문구', function () {
  ['LABEL_INVALID', 'LABEL_SPEAKER_UNKNOWN', 'EDIT_SEQ_UNKNOWN', 'LIMIT_EDIT_LEN', 'EDITS_INVALID', 'EDIT_MASK_REMOVED'].forEach(function (c) {
    assert.strictEqual(mn.isEditFail({ code: c }), true, c);
    const e = mn.errorText(c === 'EDITS_INVALID' ? 400 : 422, { code: c, slot: 'edit', target_no: 3, kinds: { name: 1 } }, { action: 'upload' });
    assert.ok(e.text && e.text.length > 8 && !new RegExp(c).test(e.text), c);
  });
  assert.strictEqual(mn.isEditFail({ code: 'LIMIT_LINE', slot: 'edit' }), true);
  assert.strictEqual(mn.isEditFail({ code: 'LIMIT_LINE', slot: 'transcript' }), false);
  assert.strictEqual(mn.isEditFail({ code: 'MASK_REQUIRED' }), false);
  // P2-3: 고친 발언의 보이지 않는 문자 — 미리보기를 지우지 않고 그 발언 줄 문구로
  assert.strictEqual(mn.isEditFail({ code: 'CONTROL_CHAR', slot: 'edit', target_no: 3 }), true);
  assert.strictEqual(mn.isEditFail({ code: 'CONTROL_CHAR', slot: 'transcript' }), false);
  assert.strictEqual(mn.isEditFail({ code: 'LIMIT_EDIT_LEN', slot: 'edit' }), true);
  const cc = mn.errorText(422, { code: 'CONTROL_CHAR', slot: 'edit', target_no: 3 }, { action: 'upload' });
  assert.strictEqual(cc.field, 'edit');
  assert.strictEqual(cc.text, '고친 발언 3에 쓸 수 없는 보이지 않는 문자가 있습니다. 그 글자를 지우고 다시 반영하세요.');
  assert.ok(mn.errorText(422, { code: 'CONTROL_CHAR', slot: 'transcript', line: 4 }, { action: 'upload' }).text.indexOf('메모장') > 0, '파일 쪽 문구는 그대로');
  // 저장 뒤 제목 수정: 가린 자리 지움
  const tt = mn.errorText(422, { code: 'EDIT_MASK_REMOVED', slot: 'title', kinds: { name: 1 } }, { action: 'meta' });
  assert.strictEqual(tt.field, 'title');
  assert.strictEqual(tt.text, '제목의 가린 자리를 지울 수 없습니다. [이름] 자리는 그대로 두고 고치세요.');
  assert.strictEqual(mn.errorText(422, { code: 'LABEL_INVALID', kinds: { form: 1 } }).text, mn.TEXT.LBL_FORM);
  assert.strictEqual(mn.errorText(422, { code: 'LABEL_INVALID', kinds: { name: 1 } }).text, mn.TEXT.LBL_NAME);
  assert.strictEqual(mn.errorText(422, { code: 'LABEL_INVALID', kinds: { form: 1 } }).field, 'label');
  assert.ok(mn.errorText(422, { code: 'EDIT_MASK_REMOVED', slot: 'edit', kinds: { name: 2, pii: 1 } }).text.indexOf('3곳') > 0);
  assert.strictEqual(mn.errorText(422, { code: 'LIMIT_EDIT_LEN', slot: 'edit' }).text, '1~20,000자(발언)로 적으세요.');
  assert.ok(mn.errorText(409, { code: 'REV_CHANGED' }, { action: 'label' }).text.indexOf('[새로 불러오기]') >= 0);
});

test('histTitle: 이력의 발화자 이름표 바꿈', function () {
  assert.strictEqual(mn.histTitle('SPEAKER', 3, 'EDIT'), '발화자 이름표 바꿈 (참석자 3)');
  assert.strictEqual(mn.histTitle('UTTER', 3, 'EDIT'), null);
  assert.strictEqual(mn.histTitle('X', 0, 'SPEAKER_LABEL'), '발화자 이름표 바꿈');
});

test('화면 id: 탭 안 읽기·쓰기는 모두 board_write(감사 화면 id 하나) · 올리기만 board_minutes_upload · 버튼 minutes_label', function () {
  assert.strictEqual(mn.UI.VIEW, 'board_write');
  assert.strictEqual(mn.UI.TAB, 'board_write');
  assert.strictEqual(mn.labelScreen(true), 'board_write');
  assert.strictEqual(mn.labelScreen(false), 'board_write', '탭 안/밖 구분 없이 같은 값');
  assert.strictEqual(mn.UI.UPLOAD, 'board_minutes_upload');
  assert.strictEqual(mn.BTN.LABEL, 'minutes_label');
});

test('signature: 고친 내용이 바뀌면 달라진다(stale) — 고친 것이 없던 때와는 같은 표식', function () {
  const mk = function () { return { date: '2026-11-01', title: 't', src: { transcript: 'paste', timeline: 'file', summary: 'file' }, files: {}, paste: { transcript: '가' }, terms: '', release: {} }; };
  const base = mn.signature(mk());
  const a = mk(); a.fix = { labels: {}, utt: {} };
  assert.strictEqual(mn.signature(a), base, '빈 고치기는 표식에 영향 없음');
  const b = mk(); b.fix = { labels: { 1: '구청장' }, utt: {} };
  assert.notStrictEqual(mn.signature(b), base);
  const c = mk(); c.fix = { labels: { 1: '구청장' }, utt: { 2: { orig: 'a', text: 'b', shown: 'b' } } };
  assert.notStrictEqual(mn.signature(c), mn.signature(b));
  const d = mk(); d.fix = { labels: { 1: '구청장' }, utt: { 2: { orig: 'a', text: 'b', shown: '[이름]' } } };
  assert.strictEqual(mn.signature(d), mn.signature(c), '화면 글(shown)은 표식에 넣지 않는다');
});

test('buildForm: edits 파트는 미리보기·저장 둘 다, 비었으면 파트 없음, edits_digest 는 저장 때만', async function () {
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') return;
  const u = { date: '2026-11-17', title: '제목', src: { transcript: 'paste', timeline: 'file', summary: 'file' }, files: {}, paste: { transcript: '참석자 1 00:00\n안녕' },
              terms: '', release: {}, cands: {}, fix: { labels: {}, utt: {} }, editsDigest: null };
  assert.strictEqual(mn.buildForm(u, [], '').get('edits'), null, '비었으면 파트 없음');
  u.fix = { labels: { 1: '구청장' }, utt: { 4: { orig: 'a', text: 'b', shown: 'b' } } };
  u.editsDigest = 'e'.repeat(64);
  const pv = mn.buildForm(u, [], '');
  assert.deepStrictEqual(JSON.parse(await pv.get('edits').text()), { speaker_labels: { 1: '구청장' }, utter_edits: [{ seq_no: 4, text: 'b' }] });
  assert.strictEqual(pv.get('edits').type, 'application/json');
  assert.strictEqual(JSON.parse(await pv.get('options').text()).edits_digest, undefined, '미리보기에는 edits_digest 없음');
  const sv = mn.buildForm(u, [], 'a'.repeat(64));
  assert.ok(sv.get('edits'));
  assert.strictEqual(JSON.parse(await sv.get('options').text()).edits_digest, 'e'.repeat(64));
  u.fix = { labels: {}, utt: {} };
  assert.strictEqual(JSON.parse(await mn.buildForm(u, [], 'a'.repeat(64)).get('options').text()).edits_digest, undefined, '고친 것이 없으면 확인값도 없다');
});

test('소스 검사: 미리보기 고치기 경로는 서버를 부르지 않고, 쓰기 헤더·문구 위치', function () {
  const cut = function (a, b) { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); assert.ok(i > 0 && j > i, a); return SRC.slice(i, j); };
  ['function pvEdit', 'function pvApply', 'function pvRevert', 'function revertAll', 'function afterFix'].forEach(function (f) {
    const body = cut(f, '\n    function ');
    assert.ok(body.indexOf('call(') < 0, f + ' 는 서버를 부르지 않는다');
  });
  assert.ok(cut('local.apply(text)', 'const ok = guard()').indexOf('call(') < 0, '[반영]은 로컬만');
  assert.ok(SRC.indexOf('mn.labelScreen(true), mn.BTN.LABEL') > 0, '이름표 저장은 labelScreen·minutes_label');
  assert.ok(cut('function goSeg', 'function jumpUtter').indexOf("ctx.mode === 'preview'") > 0, '미리보기 [원문 보기]는 pvJump');
  assert.ok(SRC.indexOf('datalist') < 0, '자유 입력 추천 목록 없음');
});

// ── 컨트롤러 흐름: 패널을 걸지 않아 그리지 않고 상태만 본다(ctl.testApi). 가짜 doFetch 로 응답 시점을 쥔다. ──
async function settle() { for (let i = 0; i < 8; i++) await new Promise(function (r) { setImmediate(r); }); }
function resp(status, body) { return { ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } }; }
function mkCtl(route, msgs) {
  return mn.createController({ doFetch: function (url, init) { return Promise.resolve(route(url, init)); }, epoch: function () { return 0; },
    me: function () { return { emp: '1', name: 'n', role: '영업팀장' }; }, msg: function (t) { if (msgs) msgs.push(t); } });
}
function pvBody(extra) {
  return Object.assign({ stats: { utter_cnt: 2, speaker_cnt: 2 }, preview_digest: 'd'.repeat(64), speakers: [{ speaker_no: 1 }, { speaker_no: 2 }],
    transcript: [{ seq_no: 1, speaker_no: 1, text: '안녕' }, { seq_no: 2, speaker_no: 2, text: '둘째' }], name_candidates: [] }, extra || {});
}
async function openUp(c) {
  await c.probe(1); c.testApi.openUpload();
  const u = c.state().up;
  u.date = mn.today(); u.title = '제목'; u.src.transcript = 'paste'; u.paste.transcript = '참석자 1 00:00\n안녕';
  return u;
}
const canForm = typeof FormData !== 'undefined' && typeof Blob !== 'undefined';
const listBody = { items: [], can_upload: true };

test('doPreview 경쟁: 요청 뒤에 바꾼 이름표·발언은 응답 뒤에도 stale 로 남고 화면 글을 덮지 않는다(P2-2)', async function () {
  if (!canForm) return;
  let release; const gate = new Promise(function (r) { release = r; });
  const c = mkCtl(function (url) { return /\/preview$/.test(url) ? gate.then(function () { return resp(200, pvBody()); }) : resp(200, listBody); });
  const u = await openUp(c);
  c.testApi.doPreview();
  assert.strictEqual(u.busy, 'preview');
  u.fix.labels[2] = '구청장';                                                    // 응답 전에 이름표를 바꾼다
  u.fix.utt[2] = { orig: '둘째', text: '둘째 고침', shown: '둘째 고침' };      // 응답 전에 발언을 고친다
  release(); await settle();
  assert.strictEqual(u.busy, '');
  assert.ok(u.pv, '미리보기는 받았다');
  assert.notStrictEqual(u.pvSig, mn.signature(u), '요청 뒤에 바꿨으므로 stale — 저장은 켜지지 않는다');
  assert.strictEqual(u.fix.utt[2].shown, '둘째 고침', '요청 뒤에 고친 줄의 화면 글은 응답 글로 덮이지 않는다');
  assert.strictEqual(u.fix.labels[2], '구청장');
});

test('doPreview: 입력이 그대로면 응답 뒤 표식이 같다(stale 아님) · 요청 시점 표식을 쓴다', async function () {
  if (!canForm) return;
  const c = mkCtl(function (url) { return /\/preview$/.test(url) ? resp(200, pvBody()) : resp(200, listBody); });
  const u = await openUp(c);
  const before = mn.signature(u);
  c.testApi.doPreview(); await settle();
  assert.strictEqual(u.pvSig, before);
  assert.strictEqual(u.pvSig, mn.signature(u));
});

test('doPreview: 원문이 바뀐 뒤 다시 미리보기는 고친 발언을 보내지 않고 버린 건수를 알린다(P2-1)', async function () {
  if (!canForm) return;
  const sent = [], msgs = [];
  const c = mkCtl(function (url, init) { if (/\/preview$/.test(url)) { sent.push(init.body); return resp(200, pvBody()); } return resp(200, listBody); }, msgs);
  const u = await openUp(c);
  const edits = async function (i) { return JSON.parse(await sent[i].get('edits').text()); };
  c.testApi.doPreview(); await settle();
  u.fix.labels[1] = '구청장'; u.fix.utt[1] = { orig: '안녕', text: '안녕하세요', shown: '안녕하세요' };
  c.testApi.doPreview(); await settle();                                          // 같은 파일 — 고친 발언 유지
  assert.strictEqual((await edits(1)).utter_edits.length, 1);
  assert.strictEqual(u.fixNote, '');
  u.paste.transcript = '참석자 1 00:00\n다른 회의 내용';                             // 원문을 다른 것으로
  c.testApi.doPreview(); await settle();
  const e2 = await edits(2);
  assert.deepStrictEqual(e2, { speaker_labels: { 1: '구청장' }, utter_edits: [] }, '이름표만 보낸다');
  assert.deepStrictEqual(u.fix.utt, {});
  assert.strictEqual(u.fix.labels[1], '구청장', '이름표는 새 응답에 그 번호가 있어 유지');
  assert.strictEqual(u.fixNote, '원문이 바뀌어 고친 발언 1건을 지웠습니다.');
  assert.ok(msgs.indexOf(u.fixNote) >= 0, '상태 줄에도 알린다');
  assert.strictEqual(u.pvSig, mn.signature(u));
});

test('saveLabels 부분 실패: 저장된 번호는 반영하고 어디서 멈췄는지 알린다(P2-4)', async function () {
  const puts = [];
  const spk = function (n) { return { speaker_no: n, label: null, utter_cnt: 1 }; };
  const c = mkCtl(function (url, init) {
    if (init.method === 'PUT') {
      puts.push(url);
      return /speakers\/1$/.test(url) ? resp(200, { rev_no: 2, label: '구청장', changed: true }) : resp(409, { detail: { code: 'REV_CHANGED' } });
    }
    if (/^\/board-minutes\/5$/.test(url)) return resp(200, { viewer: { can_edit: true }, rev_no: 1, speakers: [spk(1), spk(2), spk(3)] });
    return resp(200, { items: [{ minutes_id: 5 }], can_upload: false });
  });
  await c.probe(1); c.testApi.openDetail(5); await settle();
  const cur = c.state().cur;
  assert.strictEqual(cur.status, 'ready');
  cur.tr.items = [{ seq_no: 1, speaker_no: 1 }, { seq_no: 2, speaker_no: 2 }];
  cur.lbl = { draft: { 1: '구청장', 2: '부장', 3: '과장' }, rowErrs: {}, err: '', rev: false, busy: false };
  c.testApi.saveLabels(cur);
  assert.strictEqual(cur.lbl.busy, true, '저장 중');
  await settle();
  assert.deepStrictEqual(puts, ['/board-minutes/5/speakers/1', '/board-minutes/5/speakers/2'], '실패한 번호에서 멈춘다');
  assert.strictEqual(cur.data.speakers[0].label, '구청장', '저장된 번호는 화면 자료에 반영');
  assert.strictEqual(cur.tr.items[0].speaker_label, '구청장', '원문 목록에도 반영');
  assert.strictEqual(cur.tr.items[1].speaker_label, undefined);
  assert.strictEqual(cur.data.rev_no, 2);
  assert.strictEqual(cur.lbl.busy, false);
  assert.strictEqual(cur.lbl.rev, true);
  assert.ok(cur.lbl.err.indexOf('참석자 1는 저장했습니다. 참석자 2부터는 저장하지 못했습니다: ') === 0, cur.lbl.err);
  assert.deepStrictEqual(Object.keys(cur.lbl.draft), ['2', '3'], '저장된 번호의 초안만 지운다');
});

async function openScope(route, viewer) {
  const c = mkCtl(function (url, init) {
    if (/^\/board-minutes\/5$/.test(url)) return resp(200, { viewer: viewer, rev_no: 1, speakers: [] });
    return route(url, init);
  });
  await c.probe(1); c.testApi.openDetail(5); await settle();
  const cur = c.state().cur;
  cur.scopeOpen = true;
  cur.scope = { status: 'loading', rows: [], cands: [], candsTruncated: false, max: mn.SCOPE_MAX, candsFail: false, err: '', until: '', emp: '' };
  return { c: c, cur: cur };
}

test('loadScope: 후보는 /board-minutes/{id}/scope/candidates 로 받고 화면·버튼 헤더를 싣고 서버 상한을 쓴다', async function () {
  const seen = [];
  const o = await openScope(function (url, init) {
    seen.push({ url: url, init: init });
    if (/\/scope\/candidates$/.test(url)) return resp(200, { items: [{ emp_no: '7', name: '김영업', position_title: '부장', granted: false }], truncated: true, scope_max: 40 });
    if (/\/scope$/.test(url)) return resp(200, []);
    return resp(200, { items: [{ minutes_id: 5 }], can_upload: false });
  }, { can_scope: true, can_scope_edit: true });
  await o.c.testApi.loadScope(o.cur); await settle();
  const cand = seen.filter(function (x) { return /\/scope\/candidates$/.test(x.url); });
  assert.strictEqual(cand.length, 1);
  assert.strictEqual(cand[0].url, '/board-minutes/5/scope/candidates');
  assert.strictEqual(cand[0].init.headers['X-Screen-Id'], mn.UI.VIEW);
  assert.strictEqual(cand[0].init.headers['X-Button-Id'], 'minutes_scope_open');
  assert.ok(!seen.some(function (x) { return /assignment-candidates/.test(x.url); }), '예전 후보 경로는 부르지 않는다');
  assert.strictEqual(o.cur.scope.cands.length, 1);
  assert.strictEqual(o.cur.scope.candsTruncated, true);
  assert.strictEqual(o.cur.scope.max, 40);
  assert.strictEqual(o.cur.scope.status, 'ready');
});

test('loadScope: 수정 권한이 없으면 후보를 부르지 않고, 후보 응답이 거절이면 목록은 그대로 두고 직접 입력 안내만 켠다', async function () {
  const seen = [];
  const route = function (url, init) {
    seen.push(url);
    if (/\/scope\/candidates$/.test(url)) return resp(403, { detail: { code: 'FORBIDDEN' } });
    if (/\/scope$/.test(url)) return resp(200, [{ emp_no: '7', name: '김영업', grant_until: '2026-12-31' }]);
    return resp(200, { items: [{ minutes_id: 5 }], can_upload: false });
  };
  const ro = await openScope(route, { can_scope: true, can_scope_edit: false });
  await ro.c.testApi.loadScope(ro.cur); await settle();
  assert.ok(!seen.some(function (u) { return /candidates$/.test(u); }), '읽기 전용은 후보를 부르지 않는다');
  assert.strictEqual(ro.cur.scope.rows.length, 1);
  const rw = await openScope(route, { can_scope: true, can_scope_edit: true });
  await rw.c.testApi.loadScope(rw.cur); await settle();
  assert.strictEqual(rw.cur.scope.candsFail, true);
  assert.strictEqual(rw.cur.scope.status, 'ready');
  assert.strictEqual(rw.cur.scope.rows.length, 1);
  assert.strictEqual(rw.cur.scope.cands.length, 0);
});

test('소스 검사: 이름표 저장 중 잠금·포커스 복구·제목 가림 문구(P2-4·P2-5·P3-1)', function () {
  const cut = function (a, b) { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); assert.ok(i > 0 && j > i, a); return SRC.slice(i, j); };
  const sv = cut('function saveLabels', '\n    // ── 삭제');
  assert.ok(sv.indexOf('setLblBusy(cur, true)') > 0 && sv.indexOf('setLblBusy(cur, false)') > 0);
  assert.ok(cut('function setLblBusy', 'function saveLabels').indexOf('mn-edit-toggle') > 0, '저장 중 [고치기 끄기]도 막는다');
  assert.ok(cut('function toggleLbl', 'function drawLbl').indexOf('focusById(keep)') > 0, '원문을 받아 다시 그린 뒤 포커스를 되돌린다');
  assert.ok(cut('function revertAll', 'function pvItemOf').indexOf("focusById(stale ? 'mn-restale' : 'mn-fix')") > 0);
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

test('요청 중 잠금: fixLocked · 이름표 select·[고치기]는 요청이 나가 있는 동안 꺼진 채 그려진다(P3-B)', function () {
  assert.strictEqual(mn.fixLocked({ busy: 'preview' }), true);
  assert.strictEqual(mn.fixLocked({ busy: 'save' }), true);
  assert.strictEqual(mn.fixLocked({ busy: '' }), false);
  assert.strictEqual(mn.fixLocked(null), false);
  const cut = function (a, b) { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); assert.ok(i > 0 && j > i, a); return SRC.slice(i, j); };
  const tbl = cut('function buildSpkTable', '// ── 미리보기 고치기(저장 전');
  assert.ok(/cfg\.locked[\s\S]{0,120}aff\.disabled = true[\s\S]{0,60}role\.disabled = true[\s\S]{0,60}ord\.disabled = true/.test(tbl), 'select 3개를 잠근다');
  assert.ok(tbl.indexOf('setFrom(cfg.get(no)); refreshRow();') < tbl.indexOf('cfg.locked'), '잠금은 setFrom(sync 가 ord 를 풀 수 있다) 뒤에');
  assert.ok(cut('function buildPvSpk', 'function curLabel').indexOf('locked: mn.fixLocked(u)') > 0);
  const ul = cut('function utterLi', 'function fixText');
  assert.ok(ul.indexOf('mn.fixLocked(ctx.u)') > 0 && /eb\.disabled = lock/.test(ul), '[고치기] 잠금');
});
