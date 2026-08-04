const test = require('node:test');
const assert = require('node:assert');
const kn = require('../js/knowledge.js');

const HITS = [
  { path: 'corpus/institutions/dobong/spec/02.txt', chunk_no: 3,
    text: '청년 창업 지원\n사업 예산 3억원\n\n대상: 만 39세 이하', score: -1.2,
    institution_id: 'dobong', doctype: 'spec', filename: '02_사업목록.txt' },
];

test('rows: 줄바꿈을 공백으로 정리한 스니펫', function () {
  const rows = kn.rows(HITS);
  assert.strictEqual(rows[0].filename, '02_사업목록.txt');
  assert.strictEqual(rows[0].institutionId, 'dobong');
  assert.strictEqual(rows[0].chunkNo, 3);
  assert.strictEqual(rows[0].snippet, '청년 창업 지원 사업 예산 3억원 대상: 만 39세 이하');
});

test('rows: 긴 본문은 200자로 자르고 말줄임을 붙인다', function () {
  const rows = kn.rows([{ text: '가'.repeat(300), filename: 'x', doctype: 'spec' }]);
  assert.strictEqual(rows[0].snippet.length, 201);
  assert.ok(rows[0].snippet.endsWith('…'));
});

test('rows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(kn.rows(null), []);
});

test('highlight: 이스케이프된 문자열의 질의어만 <mark>로 감싼다', function () {
  assert.strictEqual(kn.highlight('청년 창업 지원', '창업'), '청년 <mark>창업</mark> 지원');
  assert.strictEqual(kn.highlight('창업 창업', '창업'), '<mark>창업</mark> <mark>창업</mark>');
});

test('highlight: 질의어가 없거나 짧으면 원문 그대로', function () {
  assert.strictEqual(kn.highlight('청년 창업', ''), '청년 창업');
  assert.strictEqual(kn.highlight('청년 창업', null), '청년 창업');
});

test('highlight: 정규식 메타문자가 든 질의어도 리터럴로 다룬다', function () {
  assert.strictEqual(kn.highlight('a.c abc', 'a.c'), '<mark>a.c</mark> abc');
});

test('highlight: 이미 이스케이프된 엔티티를 깨뜨리지 않는다', function () {
  // 입력은 esc를 거친 문자열이라는 계약 — 순서를 뒤집으면 XSS가 된다.
  assert.strictEqual(kn.highlight('&lt;b&gt;', 'b'), '&lt;<mark>b</mark>&gt;');
});

test('highlight: 엔티티 안쪽 글자는 강조하지 않는다 (깨뜨리면 XSS로 이어진다)', function () {
  // '&lt;'의 lt가 강조되면 &<mark>lt</mark>; 가 되어 엔티티가 무너진다.
  assert.strictEqual(kn.highlight('&lt;태그&gt; lt', 'lt'), '&lt;태그&gt; <mark>lt</mark>');
});

// ── 하이브리드 검색 (계획 F) ────────────────────────────────────────────

test('rows: score_kind를 실어 나른다 (없으면 bm25로 본다)', function () {
  assert.strictEqual(kn.rows(HITS)[0].scoreKind, 'bm25');
  assert.strictEqual(kn.rows([{ text: 'x', score_kind: 'rrf' }])[0].scoreKind, 'rrf');
});

test('modeBadge: rrf면 의미 검색 포함', function () {
  const badge = kn.modeBadge([{ score_kind: 'rrf' }]);
  assert.strictEqual(badge.text, '의미 검색 포함');
  assert.ok(badge.cls.includes('on'));
});

test('modeBadge: bm25면 FTS 단독임을 알린다 (조용히 나빠지면 안 된다)', function () {
  const badge = kn.modeBadge([{ score_kind: 'bm25' }]);
  assert.strictEqual(badge.text, 'FTS 단독');
  assert.ok(badge.cls.includes('off'));
});

test('modeBadge: 결과가 없으면 배지도 없다', function () {
  assert.strictEqual(kn.modeBadge([]), null);
  assert.strictEqual(kn.modeBadge(null), null);
});

test('renderResults: 결과가 있으면 건수와 모드 배지를 함께 보여준다', function () {
  const el = { innerHTML: '' };
  kn.renderResults(el, [Object.assign({}, HITS[0], { score_kind: 'rrf' })], '창업');
  assert.ok(el.innerHTML.includes('1건'));
  assert.ok(el.innerHTML.includes('의미 검색 포함'));
  assert.ok(el.innerHTML.includes('<mark>창업</mark>'));
});

test('renderResults: 짧은 질의가 0건이면 이유를 알려준다', function () {
  const el = { innerHTML: '' };
  kn.renderResults(el, [], '청년');
  assert.ok(el.innerHTML.includes('3자 미만'));
});

test('renderResults: 긴 질의가 0건이면 군더더기 없이 알린다', function () {
  const el = { innerHTML: '' };
  kn.renderResults(el, [], '존재하지 않는 어휘');
  assert.ok(el.innerHTML.includes('검색 결과가 없습니다'));
  assert.ok(!el.innerHTML.includes('3자 미만'));
});

// ── 원문 열기 (계획 F 후속 G2) ─────────────────────────────────────────

test('locateChunk: 원문에 그대로 있으면 그 구간을 찾는다', function () {
  const full = '1장. 상생경제도시\n\n청년 창업 지원 센터 운영\n\n예산: 634백만원';
  const at = kn.locateChunk(full, '청년 창업 지원 센터 운영');
  assert.strictEqual(full.slice(at.start, at.end), '청년 창업 지원 센터 운영');
});

test('locateChunk: 글자가 딱 안 맞으면 첫 줄로 찾는다', function () {
  // chunker가 문단을 strip해 재조립하므로 청크가 원문과 통째로 일치하지 않을 수 있다.
  const full = '머리말\n\n청년 창업 지원 센터 운영\n   들여쓴 둘째 줄\n\n끝';
  const at = kn.locateChunk(full, '청년 창업 지원 센터 운영\n들여쓴 둘째 줄');
  assert.ok(at.start >= 0);
  assert.strictEqual(full.slice(at.start, at.end), '청년 창업 지원 센터 운영');
});

test('locateChunk: 못 찾으면 -1 (틀린 곳을 짚느니 안 짚는다)', function () {
  assert.deepStrictEqual(kn.locateChunk('가나다', '전혀 다른 내용입니다'), { start: -1, end: -1 });
  assert.deepStrictEqual(kn.locateChunk('가나다', ''), { start: -1, end: -1 });
});

test('documentHtml: 청크 구간을 kn-chunk로 감싸고 앵커를 단다', function () {
  const html = kn.documentHtml('앞부분 청년 창업 뒷부분', '청년 창업', '');
  assert.ok(html.includes('<mark class="kn-chunk" id="kn-anchor">'));
  assert.ok(html.includes('앞부분 '));
  assert.ok(html.includes(' 뒷부분'));
});

test('documentHtml: 검색어도 함께 강조한다', function () {
  const html = kn.documentHtml('앞 청년 창업 뒤', '청년 창업', '창업');
  assert.ok(html.includes('<mark>창업</mark>'));
});

test('documentHtml: 청크를 못 찾아도 원문은 보여준다', function () {
  const html = kn.documentHtml('본문만 있다', '없는 청크 내용입니다', '');
  assert.strictEqual(html, '본문만 있다');
});

test('documentHtml: 원문의 태그를 실행되게 두지 않는다 (이스케이프 먼저)', function () {
  const html = kn.documentHtml('<script>alert(1)</script> 청년', '청년', '');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('documentHtml: 청크가 태그를 품고 있어도 이스케이프된다', function () {
  const html = kn.documentHtml('앞 <b>굵게</b> 뒤', '<b>굵게</b>', '');
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&lt;b&gt;'));
});
