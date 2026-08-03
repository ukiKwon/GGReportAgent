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
