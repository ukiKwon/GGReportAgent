const test = require('node:test');
const assert = require('node:assert');
const notify = require('../js/notify.js');

const LIST = [
  { notification_id: 'n1', recipient: '영업팀', sender: null, kind: '결재요청',
    content: '기획승인 대기', created_at: '09:30', read_at: null, stage: 5, institution_id: 'dobong' },
  { notification_id: 'n2', recipient: '김 차장', sender: '정 대리', kind: '쪽지',
    content: '자료 확인 부탁드립니다', created_at: '10:00', read_at: '10:05', stage: null, institution_id: null },
  { notification_id: 'n3', recipient: '영업팀', sender: null, kind: '되물음',
    content: '불리 조건 발견', created_at: '08:00', read_at: null, stage: 3, institution_id: 'dobong' },
];

test('rows: 시스템이 보낸 것은 보낸이가 "시스템"', function () {
  const rows = notify.rows(LIST);
  assert.deepStrictEqual(rows.map(function (r) { return r.from; }), ['시스템', '정 대리', '시스템']);
  assert.deepStrictEqual(rows.map(function (r) { return r.read; }), [false, true, false]);
  assert.strictEqual(rows[0].stage, 5);
  assert.strictEqual(rows[0].id, 'n1');
});

test('rows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(notify.rows(null), []);
});

test('unreadCount: 안 읽은 것만 센다', function () {
  assert.strictEqual(notify.unreadCount(LIST), 2);
  assert.strictEqual(notify.unreadCount([]), 0);
  assert.strictEqual(notify.unreadCount(null), 0);
});

test('kindClass: 알림 종류를 CSS 클래스로 (모르는 값은 기본으로)', function () {
  assert.strictEqual(notify.kindClass('결재요청'), 'approval');
  assert.strictEqual(notify.kindClass('되물음'), 'risk');
  assert.strictEqual(notify.kindClass('이관'), 'handoff');
  assert.strictEqual(notify.kindClass('쪽지'), 'note');
  assert.strictEqual(notify.kindClass('처음보는것'), 'note');
});
