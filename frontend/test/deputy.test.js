const test = require('node:test');
const assert = require('node:assert');
const deputy = require('../js/deputy.js');

const ok = { deputy_emp_no: '5640327', start_date: '2026-11-02', end_date: '2026-11-05' };

test('formError: 정상 입력은 통과', function () {
  assert.strictEqual(deputy.formError(ok, '2026-11-01'), '');
});

test('formError: 대결자·날짜·기간 검사', function () {
  assert.ok(deputy.formError({ start_date: ok.start_date, end_date: ok.end_date }, '2026-11-01').indexOf('대결자') >= 0);
  assert.ok(deputy.formError(Object.assign({}, ok, { deputy_emp_no: '12' }), '2026-11-01').indexOf('대결자') >= 0);
  assert.ok(deputy.formError(Object.assign({}, ok, { start_date: '' }), '2026-11-01').indexOf('입력') >= 0);
  assert.ok(deputy.formError(ok, '2026-11-03').indexOf('오늘 이후') >= 0);
  assert.ok(deputy.formError(Object.assign({}, ok, { end_date: '2026-11-01' }), '2026-11-01').indexOf('종료일') >= 0);
  assert.ok(deputy.formError(Object.assign({}, ok, { end_date: '2027-03-01' }), '2026-11-01').indexOf('최대 90일') >= 0);
  assert.strictEqual(deputy.formError(Object.assign({}, ok, { end_date: '2027-01-30' }), '2026-11-01'), '');   // 90일 딱
});

test('candidates: 사용 중이고 나 아닌 사람 — 직급으로 거르지 않는다', function () {
  const list = [{ emp_no: '1', status: 'ACTIVE' }, { emp_no: '2', status: 'LOCKED' }, { emp_no: '3', status: 'ACTIVE' }];
  assert.deepStrictEqual(deputy.candidates(list, '1').map(function (u) { return u.emp_no; }), ['3']);
});

test('periodText', function () {
  assert.strictEqual(deputy.periodText({ start_date: '2026-11-02', end_date: '2026-11-02' }), '2026-11-02');
  assert.strictEqual(deputy.periodText(ok), '2026-11-02 ~ 2026-11-05');
});
