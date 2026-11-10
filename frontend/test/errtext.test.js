const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const errtext = require('../js/errtext.js');
const ap = require('../js/approvals.js');

test('parse: 객체 {code,message} · 문자열 · 모르는 모양', function () {
  assert.deepStrictEqual(errtext.parse({ code: 'CHANGE_PENDING', message: ' 진행 중입니다 ' }),
    { code: 'CHANGE_PENDING', message: '진행 중입니다' });
  assert.deepStrictEqual(errtext.parse('사유를 입력하세요.'), { code: '', message: '사유를 입력하세요.' });
  assert.deepStrictEqual(errtext.parse({ message: 5, code: 7 }), { code: '', message: '' });
  [null, undefined, 42, [], [{ msg: 'x' }]].forEach(function (d) {
    assert.deepStrictEqual(errtext.parse(d), { code: '', message: '' });
  });
});

test('message: 항상 문자열 — 객체를 글자로 만들지 않는다([object Object] 금지)', function () {
  assert.strictEqual(errtext.message({ code: 'X', message: '문구' }, '기본'), '문구');
  assert.strictEqual(errtext.message('문자열', '기본'), '문자열');
  assert.strictEqual(errtext.message({ code: 'X' }, '기본 (409)'), '기본 (409)');
  assert.strictEqual(errtext.message(undefined, '기본'), '기본');
  assert.strictEqual(errtext.message(null), '');
  assert.ok(errtext.message({ a: 1 }, '기본').indexOf('[object') < 0);
});

test('approvals.errText: 결재함 오류가 객체 detail이어도 글이 나온다', function () {
  assert.strictEqual(ap.errText({ code: 'GROUP_VER_CHANGED', message: '담당자 구성이 바뀌었습니다.' }, '처리하지 못했습니다 (409)'),
    '담당자 구성이 바뀌었습니다.');
  assert.strictEqual(ap.errText(undefined, '처리하지 못했습니다 (500)'), '처리하지 못했습니다 (500)');
});

test('approvals.js 소스: detail을 그대로 Error에 넣는 줄이 없다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'approvals.js'), 'utf8');
  assert.ok(!/new Error\(\s*(?:b|j)\.detail/.test(src));
  assert.ok((src.match(/errtext\.message\(/g) || []).length >= 3);
});
