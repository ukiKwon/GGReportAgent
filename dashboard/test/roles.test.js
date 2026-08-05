const test = require('node:test');
const assert = require('node:assert');
const roles = require('../js/roles.js');

// 소속·직책 어휘 — backend/tests/test_teams.py와 **같은 답**이어야 한다.
// 두 벌로 두는 이유는 화면이 서버 없이도(file://) 프로필을 다뤄야 하기 때문이고,
// 그래서 여기서 답을 고정한다.

test('소속은 3그룹뿐이다', function () {
  // 예전에는 프로필 소속 목록에 `전산팀장`이 섞여 있었다 — 사용자가 잘못된 표기라고 짚었다.
  assert.deepStrictEqual(roles.AFFILIATIONS, ['영업팀', '전산팀', '예산팀']);
});

test('부장과 디자이너는 영업팀에만 있다', function () {
  // 없는 자리(전산부장)를 고를 수 있게 두면 그 사람의 결재가 갈 곳을 잃는다.
  assert.deepStrictEqual(roles.positionsFor('영업팀'), ['팀원', '디자이너', '팀장', '부장']);
  assert.deepStrictEqual(roles.positionsFor('전산팀'), ['팀원', '팀장']);
});

test('compose/split: 두 칸 ↔ 역할 문자열 하나', function () {
  const pairs = [
    ['영업팀', '팀원', '영업팀'],
    ['영업팀', '팀장', '영업팀장'],
    ['영업팀', '부장', '영업부장'],
    ['영업팀', '디자이너', '디자이너'],
    ['전산팀', '팀원', '전산팀'],
    ['예산팀', '팀장', '예산팀장'],
  ];
  pairs.forEach(function (p) {
    assert.strictEqual(roles.compose(p[0], p[1]), p[2]);
    assert.deepStrictEqual(roles.split(p[2]), { affiliation: p[0], position: p[1] });
  });
});

test('split: 모르는 역할은 쪼개지 않는다', function () {
  // 옛 프로필(`본부장`)에 임의로 소속을 끼워 넣으면 신원이 조용히 바뀐다 —
  // 화면은 null을 받으면 저장된 값을 그대로 보여준다.
  assert.strictEqual(roles.split('본부장'), null);
  assert.strictEqual(roles.split('전산부장'), null);
  assert.strictEqual(roles.split(''), null);
});

test('teamOf: 접미사를 떼는 순서가 규칙의 전부', function () {
  assert.strictEqual(roles.teamOf('영업팀'), '영업');
  assert.strictEqual(roles.teamOf('영업팀장'), '영업');   // '팀'을 먼저 떼면 '영업장'
  assert.strictEqual(roles.teamOf('영업부장'), '영업');
  assert.strictEqual(roles.teamOf('디자이너'), '디자이너');
  assert.strictEqual(roles.teamOf(null), '');
});

test('approverOf: 디자이너 결재도 영업팀장이 받는다', function () {
  assert.strictEqual(roles.approverOf('전산팀'), '전산팀장');
  assert.strictEqual(roles.approverOf('디자이너'), '영업팀장');
  assert.strictEqual(roles.approverOf('낯선소속'), null);   // 지어내지 않는다
});

test('ALL: 권한관리 표의 행 — 본부장은 더 이상 없다', function () {
  assert.deepStrictEqual(roles.ALL, ['영업팀', '전산팀', '예산팀',
    '영업팀장', '전산팀장', '예산팀장', '디자이너', '영업부장']);
});
