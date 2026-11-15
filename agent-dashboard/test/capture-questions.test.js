const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const cq = require('../../.claude/hooks/capture-questions.js');
const NOW = new Date(2026, 10, 15, 9, 30);

const user = t => JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: t } });
const asst = (...blocks) => JSON.stringify({ type: 'assistant', isSidechain: false, message: { content: blocks } });
const text = t => ({ type: 'text', text: t });
const LEDGER = '{"questions":[\r\n' +
  '{"id":"Q-2026-11-15-02","summary":"기존 질문","askedAt":"2026-11-15","next":[],"options":"","recommend":"","status":"open","answer":"","answeredAt":"","appliedRef":""}\r\n]}\r\n';

test('🙋 블록: 다중 항목 + 하위 선택지 + 권장 추출', () => {
  const t = text('본문입니다.\n\n---\n🙋 **물어볼게:**\n- NEXT 12 승인 방식을 고를까\n  - ⓐ바로 적용 (권장)\n  - ⓑ보류\n- 두 번째 질문 ⓐ예 ⓑ아니오\n\n\n뒤의 문장은 무시');
  const qs = cq.extractQuestions([user('질문해'), asst(t)]);
  assert.strictEqual(qs.length, 2);
  const p = cq.parseQuestion(qs[0]);
  assert.strictEqual(p.summary, 'NEXT 12 승인 방식을 고를까');
  assert.strictEqual(p.options, 'ⓐ바로 적용 ⓑ보류');
  assert.strictEqual(p.recommend, '바로 적용');
  assert.strictEqual(cq.parseQuestion(qs[1]).summary, '두 번째 질문');
});

test('한 줄 질문(목록 없이 문장 1건)', () => {
  const qs = cq.extractQuestions([user('x'), asst(text('결과.\n---\n🙋 **물어볼게:**\n이 값을 지울까요?\n'))]);
  assert.deepStrictEqual(qs, ['이 값을 지울까요?']);
});

test('parseQuestion: 굵게 제거·300자 상한·권장 없음', () => {
  const p = cq.parseQuestion('**굵은** 질문 ' + 'ㄱ'.repeat(400));
  assert.ok(!p.summary.includes('**'));
  assert.strictEqual(p.summary.length, 300);
  assert.strictEqual(p.recommend, '기록된 권장안 없음');
});

test('parseQuestion: 비밀값·이메일·전화·긴 토큰은 가리고 선택지도 300자 상한', () => {
  const p = cq.parseQuestion('password=abc123 쓸까요 a.b@c.com 010-1234-5678 ⓐ token: ' + 'x'.repeat(40) + ' ⓑ' + 'ㄴ'.repeat(400));
  assert.ok(!/abc123|a\.b@c\.com|1234-5678|xxxx/.test(p.summary + p.options), p.summary + ' | ' + p.options);
  assert.ok(p.summary.includes('[가림]'));
  assert.ok(p.options.length <= 300);
});

test('AskUserQuestion: 질문·선택지·(Recommended)', () => {
  const tu = { type: 'tool_use', name: 'AskUserQuestion', input: { questions: [
    { question: '어느 쪽으로 갈까?', options: [{ label: '가안 (Recommended)' }, { label: '나안' }] }] } };
  const qs = cq.extractQuestions([user('x'), asst(tu)]);
  const p = cq.parseQuestion(qs[0]);
  assert.strictEqual(p.summary, '어느 쪽으로 갈까?');
  assert.strictEqual(p.options, 'ⓐ가안 ⓑ나안');
  assert.strictEqual(p.recommend, '가안');
});

test('굵게 시작·이모지 변형 허용, 콜론 없는 본문 문장은 무시', () => {
  const qs = cq.extractQuestions([user('x'), asst(text('**🙋 물어볼게:**\n- 굵게 질문\n\n\n🙋️ **물어볼게:**\n- 변형 질문\n\n\n🙋 물어볼게 블록을 쓰면 수집된다\n- 잡히면 안 됨'))]);
  assert.deepStrictEqual(qs, ['굵게 질문', '변형 질문']);
});

test('LF 장부는 LF 그대로 추가', () => {
  const r = cq.addToLedger(LEDGER.replace(/\r\n/g, '\n'), ['엘에프 질문'], NOW);
  assert.ok(!r.text.includes('\r'));
  assert.strictEqual(JSON.parse(r.text).questions.length, 2);
});

test('두 턴 전 질문 무시(직전 턴은 기록 지연 대비로 함께 본다)·tool_result 사용자 줄은 턴 경계가 아니다', () => {
  const lines = [user('0'), asst(text('🙋 **물어볼게:**\n- 옛 질문')), user('1'), asst(text('답했어요')), user('2'),
    asst(text('조사 중'), { type: 'tool_use', name: 'Read', input: {} }),
    JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    asst(text('🙋 **물어볼게:**\n- 새 질문'))];
  assert.deepStrictEqual(cq.extractQuestions(lines), ['새 질문']);
});

test('sidechain 줄 무시', () => {
  const side = JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [text('🙋 **물어볼게:**\n- 서브 질문')] } });
  assert.deepStrictEqual(cq.extractQuestions([user('x'), side]), []);
});

test('코드블록·Bash 입력·인라인 안의 물어볼게 문자열 무시', () => {
  const lines = [user('x'), asst(
    text('예시:\n```\n🙋 **물어볼게:**\n- 코드 속 질문\n```\n그리고 `🙋 **물어볼게:**` 라고 쓴다'),
    { type: 'tool_use', name: 'Bash', input: { command: "echo '🙋 **물어볼게:**\n- 명령 속 질문'" } })];
  assert.deepStrictEqual(cq.extractQuestions(lines), []);
});

test('addToLedger: CRLF 유지·한 줄 형식·source auto·NEXT 번호·NN 증가·중복 무시', () => {
  const r = cq.addToLedger(LEDGER, ['NEXT 12·70 관련 질문 ⓐ예 ⓑ아니오', '다른 질문', '기존  질문!'], NOW);
  assert.strictEqual(r.added.length, 2);
  assert.strictEqual(r.added[0].id, 'Q-2026-11-15-03');
  assert.strictEqual(r.added[1].id, 'Q-2026-11-15-04');
  assert.deepStrictEqual(r.added[0].next, [12]);
  assert.strictEqual(r.added[0].source, 'auto');
  assert.strictEqual(r.added[0].status, 'open');
  assert.ok(r.text.includes('\r\n') && !/(^|[^\r])\n/.test(r.text));
  const d = JSON.parse(r.text);
  assert.strictEqual(d.questions.length, 3);
  assert.strictEqual(r.text.split('\r\n').length, LEDGER.split('\r\n').length + 2);
  assert.ok(r.text.endsWith(']}\r\n'));
});

test('addToLedger: 다른 날짜 id는 01부터, 같은 질문 재실행은 추가 없음', () => {
  const r = cq.addToLedger(LEDGER, ['새 질문'], new Date(2026, 10, 16));
  assert.strictEqual(r.added[0].id, 'Q-2026-11-16-01');
  assert.strictEqual(cq.addToLedger(r.text, ['새 질문'], new Date(2026, 10, 16)), null);
});

test('addToLedger: 깨진 장부·questions 없음·256KB 초과는 쓰지 않음', () => {
  assert.strictEqual(cq.addToLedger('{"questions":[', ['q'], NOW), null);
  assert.strictEqual(cq.addToLedger('{"x":1}', ['q'], NOW), null);
  assert.strictEqual(cq.addToLedger(LEDGER + ' '.repeat(260 * 1024), ['q'], NOW), null);
});

test('run: 파일 전체 흐름 — 추가되고, 깨진 장부는 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cq-'));
  fs.mkdirSync(path.join(dir, 'handoff'));
  const led = path.join(dir, 'handoff', 'questions.json'), tr = path.join(dir, 't.jsonl');
  fs.writeFileSync(led, LEDGER);
  fs.writeFileSync(tr, [user('x'), asst(text('🙋 **물어볼게:**\n- 통합 질문 ⓐ예 (권장) ⓑ아니오'))].join('\n') + '\n');
  assert.strictEqual(cq.run({ transcript_path: tr }, { root: dir, now: NOW }), 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(led, 'utf8')).questions[1].recommend, '예');
  assert.strictEqual(cq.run({ transcript_path: tr }, { root: dir, now: NOW }), 0); // 중복
  const broken = '{"questions":[\r\n{oops';
  fs.writeFileSync(led, broken);
  assert.strictEqual(cq.run({ transcript_path: tr }, { root: dir, now: NOW }), 0);
  assert.strictEqual(fs.readFileSync(led, 'utf8'), broken);
  fs.rmSync(path.join(dir, 'handoff', 'questions.json'));
  assert.strictEqual(cq.run({ transcript_path: tr }, { root: dir, now: NOW }), 0); // 장부 없음: 만들지 않음
  assert.ok(!fs.existsSync(led));
  fs.rmSync(dir, { recursive: true, force: true });
});
