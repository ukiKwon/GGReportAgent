'use strict';
// 공통 팝업 틀(.dlg) — 순수 함수 + index.html/knowledge.js 연결 소스 단언(사용자 11-20 시안 4판).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const dlg = require('../js/dlg.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const KN = fs.readFileSync(path.join(__dirname, '..', 'js', 'knowledge.js'), 'utf8');

test('zFor: 열린 순서대로 30부터 쌓이고 시스템 알림(39) 아래에 머문다', function () {
  assert.strictEqual(dlg.zFor(0), 30);
  assert.strictEqual(dlg.zFor(1), 31);
  assert.strictEqual(dlg.zFor(-3), 30);
  assert.strictEqual(dlg.zFor('2'), 32);
  assert.strictEqual(dlg.zFor(99), 38);
});

test('mergeDescribedBy: 기존 연결을 덮어쓰지 않고 합친다', function () {
  assert.strictEqual(dlg.mergeDescribedBy('a b', 'c'), 'a b c');
  assert.strictEqual(dlg.mergeDescribedBy('a  c', 'c'), 'a c');
  assert.strictEqual(dlg.mergeDescribedBy(null, 'x'), 'x');
  assert.strictEqual(dlg.mergeDescribedBy('', ''), '');
});

test('removeDescribedBy: 그 토큰만 빼고, 비면 null', function () {
  assert.strictEqual(dlg.removeDescribedBy('a b c', 'b'), 'a c');
  assert.strictEqual(dlg.removeDescribedBy('x', 'x'), null);
  assert.strictEqual(dlg.removeDescribedBy(null, 'x'), null);
});

test('확인 상자 기본 문장은 시안 4판 그대로', function () {
  assert.strictEqual(dlg.DIRTY_TEXT, '닫으면 입력한 내용이 사라집니다.');
});

test('index.html: dlg.js는 다른 화면 스크립트보다 먼저 읽힌다', function () {
  const d = HTML.indexOf('<script src="js/dlg.js"></script>');
  ['knowledge', 'plans', 'app'].forEach(function (m) {
    const k = HTML.indexOf('<script src="js/' + m + '.js"></script>');
    assert.ok(d > 0 && k > d, m);
  });
});

test('index.html: .dlg 기본 폭 560, 예외는 --wide 720·--full 뿐', function () {
  assert.match(HTML, /\.dlg \{[^}]*width:min\(560px/);
  assert.match(HTML, /\.dlg--wide \{ width:min\(720px/);
  assert.match(HTML, /\.dlg--full \{/);
  // 공통 규칙(줄 첫머리의 .dlg--*)만 본다 — 화면 범위 규칙(#plans-root .dlg--s 등)은 그 화면 이행 때 정리.
  assert.doesNotMatch(HTML, /\n\s*\.dlg--(s|m|l) \{/);
});

test('원문 보기(#doc-modal): .dlg 틀 · 동작 없는 보는 창이라 [닫기]는 오른쪽 아래', function () {
  const s = HTML.indexOf('<div id="doc-modal"');
  const rest = HTML.slice(s);
  const block = rest.slice(0, rest.search(/<\/div>\r?\n<\/div>/));   // CRLF 체크아웃에서도(qa 11-20)
  assert.match(block, /id="doc-body" tabindex="0" role="region" aria-label="원문 본문"/);
  assert.match(block, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="doc-title"/);
  assert.match(block, /<h2 class="dlg-t" id="doc-title" tabindex="-1">/);
  assert.match(block, /<footer class="dlg-foot"><button type="button" id="doc-close"[^>]*>닫기<\/button><\/footer>/);
  assert.doesNotMatch(block, /modal-box|style="max-width:840px/);
});

test('knowledge.js: 원문 창은 dlg.open/requestClose로 열고 닫는다(Esc·바깥 클릭은 dlg가 맡음)', function () {
  assert.match(KN, /root\.dlg\.open\(modal\)/);
  assert.match(KN, /root\.dlg\.requestClose\(modal\)/);
  assert.match(KN, /el\('doc-title'\)\.title = /);
  assert.match(KN, /class="kn-hit"[^>]*tabindex="0" role="button"/);   // 결과 행을 키보드로 연다(qa P2-3)
  assert.match(KN, /if \(seq !== docSeq\) return;/);                   // 늦은 응답 버림(qa P3-5)
});

test('app.js: 옛 덮개 처리는 dlg 창을 건드리지 않고, 화면 초기화는 dlg.closeAll로 정리한다', function () {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(APP, /if \(e\.target === ov && !dlgOwns\(ov\)\) ov\.style\.display = 'none';/);
  assert.match(APP, /root\.dlg\.closeAll\(\);/);
});

// ── 2단계(11-20): 지도 색상·전체 입찰건·기관 추가·쪽지함 ──
const NOTIFY = fs.readFileSync(path.join(__dirname, '..', 'js', 'notify.js'), 'utf8');
const RENDER = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const APPSRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function blockOf(id, endMark) { const s = HTML.indexOf('<div id="' + id + '"'); assert.ok(s > 0, id); return HTML.slice(s, HTML.indexOf(endMark, s)); }
function fnOf(src, start, end) { const s = src.indexOf(start); assert.ok(s > 0, start); return src.slice(s, src.indexOf(end, s)); }

test('지도 색상(#theme-modal): .dlg 쓰는 창 — 제목 줄 [되돌리기]|[취소][저장], 아래 단추 줄·× 없음', function () {
  const b = blockOf('theme-modal', '<div id="add-modal"');
  assert.match(b, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="theme-title"/);
  assert.match(b, /<h2 class="dlg-t" id="theme-title" tabindex="-1">지도 색상 설정<\/h2>/);
  assert.match(b, /<div class="dlg-acts">\s*<button type="button" id="theme-reset"[\s\S]*<span class="dlg-sep" aria-hidden="true"><\/span>\s*<button type="button" id="theme-cancel"[^>]*>취소<\/button>\s*<button type="button" id="theme-save" class="dlg-go">저장<\/button>/);
  assert.doesNotMatch(b, /modal-box|dlg-foot|×/);
  const js = fnOf(APPSRC, 'app.wireTheme = function', '// 기관 편집 창(NEXT 72)');
  assert.match(js, /root\.dlg\.open\(modal, \{/);
  assert.match(js, /isDirty: function \(\) \{ return JSON\.stringify\(collect\(\)\) !== base; \}/);
  assert.match(js, /#theme-cancel'\)\.onclick = function \(\) \{ root\.dlg\.requestClose\(modal\); \}/);
  assert.match(js, /root\.dlg\.close\(modal\); repaint\(\)/);
  // 되돌리기는 칸만 기본 색으로 채우고 반영은 [저장](design 11-20) — 바로 저장(resetTheme)하지 않는다
  assert.match(js, /#theme-reset'\)\.onclick = function \(\) \{\s*fill\(Object\.assign\(\{\}, root\.render\.DEFAULT_THEME\)\);/);
  assert.match(b, />기본 색으로 되돌리기<\/button>/);
  assert.doesNotMatch(js, /style\.display/);
});

test('전체 입찰건(#more-modal): body 직계 · --wide 보는 창 · [닫기]는 오른쪽 아래', function () {
  const b = blockOf('more-modal', '<div id="notify-modal"');
  assert.match(b, /class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="more-title"/);
  assert.match(b, /<footer class="dlg-foot"><button type="button" id="more-close"[^>]*>닫기<\/button><\/footer>/);
  assert.doesNotMatch(b, /modal-box|max-width:720/);
  const before = HTML.slice(0, HTML.indexOf('<div id="more-modal"'));
  assert.strictEqual((before.match(/<section\b/g) || []).length, (before.match(/<\/section>/g) || []).length, 'more-modal은 section 밖');
  const js = fnOf(RENDER, 'render.openMoreModal = function', 'render.renderMoreTable = function');
  assert.match(js, /root\.dlg\.open\(modal, \{ focus: search \}\)/);
  assert.match(js, /root\.dlg\.requestClose\(modal\)/);
  assert.doesNotMatch(js, /style\.display/);
  // 빈 표(NEXT 128 2차): 머리줄 6칸 + 빈 행 1줄 + 표 아래 안내(#more-empty)
  const tbl = fnOf(RENDER, 'render.renderMoreTable = function', 'if (typeof module');
  assert.ok(tbl.indexOf('tblEmpty.rowHtml(6)') >= 0 && tbl.indexOf("'more-empty'") >= 0);
  assert.match(HTML, /<p class="tb-empty-note" id="more-empty" aria-live="polite" hidden><\/p>/);
  assert.ok(tbl.indexOf("none.textContent = rows.length ? ''") >= 0);   // 숨길 때 글도 비워 낭독기가 변화를 잡게
  // 빈 행도 데이터 행과 같은 높이: 칸 안쪽 여백은 CSS 한 곳, 데이터 칸에 인라인 padding 없음
  assert.match(HTML, /\.more-table td \{ padding:6px;/);
  assert.doesNotMatch(tbl, /<td style="padding:6px;">/);
});

test('기관 추가(#add-modal): 필수 칸 * 표시·alert 없음·409는 칸 경고·실패는 .dlg-err', function () {
  const b = blockOf('add-modal', '<!-- 로그인 직후');
  assert.match(b, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="add-title"/);
  assert.match(b, /<div class="dlg-acts">\s*<button type="button" id="add-cancel"[^>]*>취소<\/button>\s*<button type="button" id="add-save" class="dlg-go">저장<\/button>/);
  assert.match(b, /<p class="dlg-err" id="add-err" role="alert"><\/p>/);
  assert.match(b, /<div class="dlg-body" id="add-fields">/);
  assert.doesNotMatch(b, /modal-box|dlg-foot|×/);
  const js = fnOf(APPSRC, 'app.openAdd = function', 'app.wireData = function');
  assert.match(js, /class="dlg-req" aria-hidden="true">\*<\/span>/);
  assert.match(js, /required aria-required="true"/);
  assert.match(js, /root\.dlg\.invalid\(fieldOf\(k\), root\.dlg\.withObj\(root\.logic\.FIELD_LABELS\[k\]\) \+ ' 적으세요\.'/);
  assert.match(js, /root\.dlg\.setDisabled\(save, false\)/);
  assert.doesNotMatch(b, /표시는 꼭 입력해야 하는 칸입니다/);   // 위쪽 안내 줄 없음(시안 4판)
  assert.match(js, /root\.dlg\.invalid\(fieldOf\('name'\), '이미 등록된 기관명입니다/);
  assert.match(js, /setErr\('서버에 연결하지 못했습니다/);
  assert.match(js, /isDirty: function \(\)/);
  assert.doesNotMatch(js, /alert\(/);
  assert.doesNotMatch(js, /style\.display/);
});

test('쪽지함(#notify-modal): 제목 줄 [닫기]·칸 경고·.dlg-err/상태 줄, alert·display 비교 없음', function () {
  const b = blockOf('notify-modal', '<!-- 원문 보기');
  assert.match(b, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="nt-title"/);
  assert.match(b, /<div class="dlg-acts"><button type="button" id="nt-close"[^>]*>닫기<\/button><\/div>/);
  assert.match(b, /id="nt-err" role="alert"/);
  assert.match(b, /id="nt-status" role="status"/);
  assert.match(b, /<div class="dlg-body" id="nt-list">/);
  assert.match(b, /<label for="nt-to">받는 사람<span class="dlg-req" aria-hidden="true">\*<\/span><\/label>/);
  assert.match(b, /id="nt-text" placeholder="보낼 내용" required aria-required="true"/);
  assert.doesNotMatch(b, /modal-box|×/);
  assert.doesNotMatch(NOTIFY, /alert\(/);
  assert.doesNotMatch(NOTIFY, /style\.display/);
  assert.match(NOTIFY, /root\.dlg\.isOpen\(overlay\(\)\)/);
  assert.match(NOTIFY, /root\.dlg\.open\(overlay\(\), \{ isDirty: isDraft, dirtyText: '닫으면 쓰던 쪽지가 사라집니다\.', onClose: resetDraft \}\)/);
  assert.match(NOTIFY, /root\.dlg\.requestClose\(overlay\(\)\)/);
  assert.match(NOTIFY, /root\.dlg\.invalid\(toEl, '받는 사람을 적으세요\.'/);
  assert.match(NOTIFY, /root\.dlg\.invalid\(textEl, '내용을 적으세요\.'/);
  assert.match(NOTIFY, /const why = blocker\(row\.dest\);/);
  assert.match(NOTIFY, /if \(ok === false\) return;/);   // 읽음 처리 실패면 이동하지 않는다(qa P3-1)
});

test('withObj: 받침 있으면 을, 없으면 를', function () {
  assert.strictEqual(dlg.withObj('기관명'), '기관명을');
  assert.strictEqual(dlg.withObj('기관구분'), '기관구분을');
  assert.strictEqual(dlg.withObj('지역코드'), '지역코드를');
  assert.strictEqual(dlg.withObj('받는 사람'), '받는 사람을');
});

// ── 동작 시험: 아주 작은 가짜 DOM(jsdom 없음) — qa 11-20 4절 ──
const fakedom = require('./_fakedom_dlg.js');
fakedom.register(test, assert, function () {
  delete require.cache[require.resolve('../js/dlg.js')];
  return require('../js/dlg.js');
});
