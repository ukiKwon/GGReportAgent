// 공고 진행 중 문구 정본 통합(2026-11-15, NEXT 78): logic.noticeText를 현황판 칩·둘째 줄과 지도 팝오버 배지가 함께 쓴다.
// + 11-13 design-reviewer P2 3건(요약 카드 버튼 24px·지도 상세 제목 링·기관장 사진 안내 1줄) 고정.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');

const ROOT = path.join(__dirname, '..');
const strip = h => String(h).replace(/<[^>]+>/g, '');

const items = [
  { phase: 'receiving', deadlineDays: 4, receiveFrom: '2026-11-16', receiveTo: '2026-11-19', startDays: 2, since: 3 },
  { phase: 'receiving', deadlineDays: 0, receiveTo: '2026-11-15', since: 5 },
  { phase: 'unknown', since: 20, late: false },
  { phase: 'unknown', since: 50, late: true },
  { phase: 'awaiting', since: 25, receiveTo: '2026-11-01' },
];
const want = [
  ['마감 D-4', '접수 11.16~11.19 · 접수 시작 D-2'],
  ['마감 D-day', '마감 11.15'],
  ['공고 후 20일', '접수 기간은 공고 원문에서 확인하세요'],
  ['공고 후 50일', '결과 공고를 확인하세요'],
  ['공고 후 25일', '마감 지남(11-01) · 결과가 났는지 확인하세요'],
];

test('noticeText: 칩·둘째 줄 문구가 상태별로 정해진 대로', () => {
  items.forEach((it, i) => {
    const t = logic.noticeText(it);
    assert.strictEqual(t.chip.text, want[i][0]);
    assert.strictEqual(t.noteText, want[i][1]);
  });
});

test('현황판 칩·둘째 줄은 noticeText를 감싸기만 한다(글이 같고 날짜만 span.d)', () => {
  items.forEach((it, i) => {
    assert.strictEqual(strip(dash.noticeChipHtml(it)), want[i][0]);
    assert.strictEqual(strip(dash.noticeNote(it)), want[i][1]);
  });
  assert.strictEqual(dash.noticeNote(items[4]), '마감 지남(<span class="d">11-01</span>) · 결과가 났는지 확인하세요');
  assert.strictEqual(dash.noticeChipHtml(items[2]), '<span class="db-chip wait">공고 후 <span class="v">20</span>일</span>');
  const src = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(!/접수 기간은 공고 원문/.test(src), '문구를 dashboard.js에 다시 쓰지 않는다');
  assert.ok(/logic\.noticeText\(it\)/.test(src));
});

test('NOTICE_WORDS: 할 일 문구는 logic 상수 한 곳, 화면 파일에는 옛 문구가 없다(2026-11-16 planner a84966ac 후보 A)', () => {
  const W = logic.NOTICE_WORDS;
  assert.strictEqual(W.unknownNote, '접수 기간은 공고 원문에서 확인하세요');
  assert.strictEqual(W.unknownChip, '접수 기간 원문 확인');
  assert.strictEqual(W.resultNote, '결과 공고를 확인하세요');
  assert.strictEqual(W.expiredNote(121), '공고 후 121일 · 결과 공고를 확인하세요');
  ['logic.js', 'render.js', 'dashboard.js', 'overdue.js', 'noticerec.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    assert.ok(!/마감일 미확인 · |마감일 미확인 '|마감일 미확인<|마감일 미확인\s*<b>|'마감일 미확인'/.test(src), f + '에 옛 화면 문구가 남아 있다');
    assert.ok(!/결과 미확인 —/.test(src), f + '에 옛 120일 문구가 남아 있다');
  });
  // 칩 건수(띠·지도 툴팁)·상세 접수 칸·aria가 같은 말을 쓴다
  const it = items[2];
  assert.ok(logic.noticeBrief({ confirmed: true, contractEnd: '2026-11-01' }, new Date('2026-11-12T00:00:00')).detail.includes(W.unknownChip));
  assert.ok(it.phase === 'unknown');
});

test('noticeBrief: 배지·둘째 줄이 noticeText와 같은 정본에서 나온다', () => {
  const today = new Date('2026-11-12T00:00:00');
  const rec = { confirmed: true, contractEnd: '2026-11-09', receiveFrom: '2026-11-14', receiveTo: '2026-11-19' };
  const b = logic.noticeBrief(rec, today);
  assert.ok(b);
  assert.strictEqual(b.badge, b.chip.text);
  assert.strictEqual(b.cls, 'urgent');
  assert.strictEqual(b.noteText, '접수 11.14~11.19 · 접수 시작 D-2');
});

test('11-13 design P2: 지도 상세 제목 링 없음(현황판 링 유지)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('.dm-box .db-head h2:focus, .dm-box .db-head h2:focus-visible { outline:none; }'));
  assert.ok(/\.db-head h2:focus-visible \{ outline:2px solid/.test(html));
});

test('11-13 design P2: 기관장 카드 사진 안내는 한 줄, 이용 조건은 편집 팝업에만', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/headcard.js'), 'utf8');
  assert.ok(/cap = '사진 없음';/.test(src));
  assert.ok(!/사진 없음\. 공공누리/.test(src));
  assert.ok(/공공누리 제1유형/.test(src), '이용 조건 안내는 편집 팝업에 남아 있어야 한다');
});
