const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
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

// ---- 답 자동 기록 폐기 확인(NEXT 84 ②) — 훅은 질문 추가만, answer·status는 손대지 않는다 ----
const item = (n, summary, status, answer) => JSON.stringify({ id: 'Q-2026-11-15-0' + n, summary, askedAt: '2026-11-15', next: [], options: '', recommend: '', status, answer: answer || '', answeredAt: status === 'open' ? '' : '2026-11-14', appliedRef: '' });
const ODD = '{"id":"Q-2026-11-15-04",  "summary":"완료된 질문" , "status":"done","answer":"x"}';
const L4 = '{"questions":[\r\n' + [item(1, '질문 하나', 'open'), item(2, '질문 둘', 'open'), item(3, '이미 답한 질문', 'answered', '원래 답'), ODD].join(',\r\n') + '\r\n]}\r\n';
const ASKED = asst(text('🙋 **물어볼게:**\n- 질문 하나\n- 질문 둘\n- 이미 답한 질문\n- 완료된 질문'));

function setup(ledger, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-'));
  fs.mkdirSync(path.join(dir, 'handoff'));
  const led = path.join(dir, 'handoff', 'questions.json'), tr = path.join(dir, 't.jsonl');
  fs.writeFileSync(led, ledger); fs.writeFileSync(tr, lines.join('\n') + '\n');
  return { dir, led, tr, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}


test('답 자동 기록 없음: 사용자 글·주입 메시지가 뒤따라도 기존 질문의 answer·status·다른 줄이 바이트 그대로', () => {
  const replies = ['둘 다 ⓐ로 해줘', '네', '/clear', 'password=abc123', '<agent-message from="a1">[Subagent hand-back] 보고</agent-message>',
    '<task-notification><task-id>x</task-id></task-notification>', '[SYSTEM NOTIFICATION - NOT USER INPUT] done'];
  for (const r of replies) {
    const s = setup(L4, [user('x'), ASKED, user(r), asst(text('진행합니다'))]);
    assert.strictEqual(cq.run({ transcript_path: s.tr }, { root: s.dir, now: NOW }), 0, r); // 4건 모두 이미 장부에 있음 → 추가 0
    assert.strictEqual(fs.readFileSync(s.led, 'utf8'), L4, r);
    const q = JSON.parse(fs.readFileSync(s.led, 'utf8')).questions;
    assert.deepStrictEqual(q.slice(0, 2).map(x => [x.status, x.answer]), [['open', ''], ['open', '']]);
    assert.deepStrictEqual([q[2].status, q[2].answer], ['answered', '원래 답']);
    s.done();
  }
});

test('답 자동 기록 없음: answer 모드 코드·내보내기가 없고, CLI에 answer 인자를 줘도 장부의 답이 바뀌지 않는다', () => {
  for (const k of ['runAnswer', 'answerLedger', 'extractTarget']) assert.strictEqual(cq[k], undefined, k);
  const s = setup(L4, [user('x'), ASKED, user('ⓐ로 해줘')]);
  const hook = path.join(__dirname, '..', '..', '.claude', 'hooks', 'capture-questions.js');
  const r = spawnSync(process.execPath, [hook, 'answer'], { input: JSON.stringify({ transcript_path: s.tr, cwd: s.dir, prompt: 'ⓐ로 해줘' }),
    env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: s.dir }), encoding: 'utf8' });
  assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, '');
  assert.strictEqual(fs.readFileSync(s.led, 'utf8'), L4);
  s.done();
});

test('Stop 수집: AskUserQuestion은 tool_result 답이 있어도 항상 open·answer 빈 값으로만 추가', () => {
  const tu = (id, q) => ({ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions: [{ question: q, options: [{ label: '가안' }, { label: '나안' }] }] } });
  const res = (id, content, err) => JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: err }] } });
  const s = setup(LEDGER, [user('x'),
    asst(tu('t1', '어느 쪽?')), res('t1', 'User has answered your questions: "어느 쪽?"="나안". You can now continue.'),
    asst(tu('t2', '거절될 질문?')), res('t2', 'The user doesn\'t want to proceed', true),
    asst(tu('t3', '답 없는 질문?'))]);
  assert.strictEqual(cq.run({ transcript_path: s.tr }, { root: s.dir, now: NOW }), 3);
  const q = JSON.parse(fs.readFileSync(s.led, 'utf8')).questions;
  for (const i of [1, 2, 3]) {
    assert.strictEqual(q[i].status, 'open'); assert.strictEqual(q[i].answer, '');
    assert.strictEqual(q[i].answeredAt, ''); assert.ok(!('answerSource' in q[i]));
  }
  s.done();
});

test('mask 보강: _접두·한글 키, URL 쿼리, Bearer, 사설 IP, 유선·국제 전화, 계좌·카드는 가리고 날짜·NEXT 번호는 둔다', () => {
  const p = cq.parseQuestion('access_token=abc 비밀번호: 1q2w 주소 /x?sid=zz&a=1 Bearer abcdef 10.1.2.3 02-123-4567 +82 10-1234-5678 110-123-456789 4111 1111 1111 1111 2026-11-15 NEXT 72 질문');
  const t = p.summary;
  for (const bad of ['abc ', '1q2w', 'zz', 'abcdef', '10.1.2.3', '123-4567', '1234-5678', '456789', '4111']) assert.ok(!t.includes(bad), bad + ' | ' + t);
  assert.ok(t.includes('2026-11-15') && t.includes('NEXT 72'), t);
});

test('Stop 수집: 직전 턴 질문이 이제야 들어가도 그 뒤 사용자 입력을 답으로 쓰지 않고 open(기록 지연·Esc 중단 대비)', () => {
  const s = setup(LEDGER, [user('x'), asst(text('🙋 **물어볼게:**\n- 늦게 잡힌 질문')), user('ⓐ로 해'), asst(text('진행합니다'))]);
  assert.strictEqual(cq.run({ transcript_path: s.tr }, { root: s.dir, now: NOW }), 1);
  const q = JSON.parse(fs.readFileSync(s.led, 'utf8')).questions[1];
  assert.strictEqual(q.status, 'open'); assert.strictEqual(q.answer, ''); assert.strictEqual(q.answeredAt, ''); assert.ok(!('answerSource' in q));
  s.done();
});

test('주입 메시지(에이전트 보고)는 턴 경계가 아니다: 사이에 끼어도 직전 질문 턴이 끊기지 않는다', () => {
  const lines = [user('x'), asst(text('🙋 **물어볼게:**\n- 보고 낀 질문')), user('<agent-message from="a1">보고</agent-message>'), asst(text('받았어요'))];
  assert.deepStrictEqual(cq.extractQuestions(lines), ['보고 낀 질문']);
  const s = setup(LEDGER, lines);
  assert.strictEqual(cq.run({ transcript_path: s.tr }, { root: s.dir, now: NOW }), 1);
  s.done();
});

test('사용자가 붙여 넣은 🙋 블록·에이전트 보고 속 🙋 블록은 수집하지 않고, isMeta 사용자 줄은 턴 경계가 아니다(qa 11-16)', () => {
  assert.deepStrictEqual(cq.extractQuestions([user('🙋 **물어볼게:**\n- 붙여넣은 질문'), asst(text('ok'))]), []);
  assert.deepStrictEqual(cq.extractQuestions([user('x'), user('<agent-message from="a1">🙋 **물어볼게:**\n- 에이전트 질문</agent-message>'), asst(text('ok'))]), []);
  const meta = JSON.stringify({ type: 'user', isSidechain: false, isMeta: true, message: { role: 'user', content: '메타' } });
  assert.deepStrictEqual(cq.extractQuestions([user('x'), asst(text('🙋 **물어볼게:**\n- q1')), meta, asst(text('계속'))]), ['q1']);
});

test('mask: 키워드 뒤에 한국어 조사가 붙어도 값을 가린다(security 11-16 하)', () => {
  const t = cq.parseQuestion('비밀번호는 abc123 이고 암호가 zz9 입니다').summary;
  assert.ok(!/abc123|zz9/.test(t), t);
  const u = cq.parseQuestion('업로더에 암호가 걸린 엑셀이 있나요?').summary;   // 값이 한글이면 문장이다(11-16 오탐)
  assert.strictEqual(u, '업로더에 암호가 걸린 엑셀이 있나요?');
});

// ---- NEXT 88: 경계·유사 중복 (원문은 장부 Q-2026-11-16-21·42·41·24·29·26·30·37 기반) ----
test('경계: 문장 속 ⓐ 참조가 있어도 ⓑ 앞의 마지막 ⓐ에서 자른다 (Q-21)', () => {
  const p = cq.parseQuestion('2단계를 생략하는 범위를 어디까지로 할까요? 나중에 다른 팀 사람(예: 예산팀장)이 관리자 권한을 받으면, ⓐ에서는 그 사람 혼자 자기 팀원에게 결재 권한을 줄 수 있게 돼요. ⓐ 모든 팀: 1단계 결재자가 관리자이면 어느 팀이든 거기서 끝 ⓑ 전산팀만: 전산팀원 → 전산팀장일 때만 한 번으로 끝, 다른 팀은 지금처럼 관리자 확인을 거침 (권장)');
  assert.ok(p.summary.endsWith('줄 수 있게 돼요.'), p.summary);
  assert.ok(p.options.startsWith('ⓐ 모든 팀:'), p.options);
  assert.strictEqual(p.recommend, '전산팀만: 전산팀원 → 전산팀장일 때만 한 번으로 끝, 다른 팀은 지금처럼 관리자 확인을 거침');
});

test('경계: "앞서 ⓐ로 허용한…" 문장이 summary에 남고 선택지는 뒤쪽 목록 (Q-42)', () => {
  const p = cq.parseQuestion('앞서 ⓐ로 허용한 본인 메뉴 권한 변경도, 같은 원칙에 맞춰 다른 관리자만 바꾸게 바꿀까요? ⓐ 메뉴 권한은 본인도 바꿈 (지금처럼) ⓑ 메뉴 권한도 본인 것은 다른 관리자만 바꿈 (원칙에 맞음, 권장)');
  assert.strictEqual(p.summary, '앞서 ⓐ로 허용한 본인 메뉴 권한 변경도, 같은 원칙에 맞춰 다른 관리자만 바꾸게 바꿀까요?');
  assert.ok(p.options.startsWith('ⓐ 메뉴 권한은 본인도 바꿈'), p.options);
});

test('경계: summary가 3자 미만이면 자르지 않고, 권장은 그대로 뽑는다', () => {
  const p = cq.parseQuestion('앞서 ⓐ예 (권장) ⓑ아니오');
  assert.strictEqual(p.summary, '앞서 ⓐ예 ⓑ아니오');
  assert.strictEqual(p.options, '');
  assert.strictEqual(p.recommend, '예');
});

test('경계: 앞 문맥 없는 짧은 한 줄(Q-41)도 기존대로 자른다', () => {
  const p = cq.parseQuestion('확인 전까지는 어떻게 둘까? ⓐ 지금처럼 13개를 둔다 . ⓑ 묶는다. ⓒ 뺀다.');
  assert.strictEqual(p.summary, '확인 전까지는 어떻게 둘까?');
  assert.ok(p.options.startsWith('ⓐ 지금처럼'));
});

const L16 = (...rows) => '{"questions":[\n' + rows.map((r, n) => JSON.stringify({ id: 'Q-' + (r[2] || '2026-11-16') + '-0' + (n + 1), summary: r[0], askedAt: r[2] || '2026-11-16', next: [],
  options: r[1] || '', recommend: '', status: r[3] || 'open', answer: '', answeredAt: '', appliedRef: '' })).join(',\n') + '\n]}\n';
const D16 = new Date(2026, 10, 16, 9);
const PW_OPTS = 'ⓐ거의 없다, 분석 안 해도 된다 ⓑ자주 온다, 암호를 풀어 다시 올리라는 안내 문구를 넣는다 ⓒ사내 문서보안(DRM)이 걸린 채 온다·모르겠다, 일단 막고 내부망에서 따로 확인한다';
const CMD = '`cd C:\\github\\GGReportAgent\\kgi-ggreport-web && node tools/db/apply-mysql.mjs --user ggreport`';

test('중복: 같은 명령 코드 스팬이면 문장이 달라도 같은 질문 (Q-24·29·32·49)', () => {
  const led = L16(['로컬 DB에 새 사업계획 표를 만들려면 터미널에서 아래 명령을 한 번 돌려 줘. ' + CMD]);
  assert.strictEqual(cq.addToLedger(led, ['(아직 안 돌렸으면) 앞에서 부탁한 034 DB 적용 명령도 터미널에서 돌려 줘. ' + CMD], D16), null);
  assert.strictEqual(cq.addToLedger(led, ['034 DB 적용 명령을 아직 기다리고 있어. ' + CMD], D16), null);
  const r = cq.addToLedger(led, ['노원 한 줄만 더 돌려 줘. `curl -X POST localhost:8080/institutions/nowon/plans/seed`'], D16);
  assert.strictEqual(r.added.length, 1); // 다른 명령은 별개
});

test('중복: 일부 문장이 빠지고 마스킹 글자만 다른 같은 질문 (Q-26·30·37·38)', () => {
  const q26 = "업로더에 올라오는 공고문·제안서 중에 암호=[가림] 엑셀·파워포인트가 있나요? 서버가 파일 내용을 뽑는 '문서 분석' 단계의 일입니다. 막으면 암호=[가림] 원본만 남고 분석 결과는 '분석 실패(암호=[가림] 표시됩니다.";
  const led = L16([q26, PW_OPTS]);
  const q38 = "업로더에 올라오는 공고문·제안서 중에 암호가 걸린 엑셀·파워포인트가 있나요? 막으면 암호가 걸린 원본만 남고 분석 결과는 '분석 실패'로 남습니다. " + PW_OPTS;
  assert.strictEqual(cq.addToLedger(led, [q38], D16), null);
  const q30 = "업로더에 올라오는 공고문·제안서 중에 암호=[가림] 엑셀·파워포인트가 있나요? 막으면 암호=[가림] 원본만 남고 분석 결과는 '분석 실패(암호=[가림] 남습니다. " + PW_OPTS;
  assert.strictEqual(cq.addToLedger(led, [q30], D16), null);
});

test('중복: 문구가 거의 같아도 선택지가 다르면 별개, 같은 질문이 한 번에 두 번 나와도 1건만', () => {
  const sm = '이번 변경을 도봉 데이터에 먼저 적용할까요? 시드 파일은 그대로 두고 화면만 확인합니다.';
  const sm2 = '이번 변경을 도봉 데이터에 먼저 적용할까요? 시드 파일은 그대로 두고 화면만 확인해요.';
  const led = L16([sm, 'ⓐ적용한다 ⓑ보류한다']);
  assert.strictEqual(cq.addToLedger(led, [sm2 + ' ⓐ적용한다 ⓑ보류한다'], D16), null);
  assert.strictEqual(cq.addToLedger(led, [sm2 + ' ⓐ노원부터 ⓑ광진부터 ⓒ전체 한꺼번에'], D16).added.length, 1);
  assert.strictEqual(cq.addToLedger(led, [sm2 + ' ⓐ노원부터 ⓑ광진부터 ⓒ전체 한꺼번에', sm2 + ' ⓐ노원부터 ⓑ광진부터 ⓒ전체 한꺼번에'], D16).added.length, 1);
});

test('중복: 유사 판정은 같은 날만 — 전날 비슷한 질문은 새로 넣고, 기존 항목은 바뀌지 않는다', () => {
  const sm = '이번 변경을 도봉 데이터에 먼저 적용할까요? 시드 파일은 그대로 두고 화면만 확인합니다.';
  const led = L16([sm, '', '2026-11-15', 'answered']);
  const r = cq.addToLedger(led, ['이번 변경을 도봉 데이터에 먼저 적용할까요? 시드 파일은 그대로 두고 화면만 확인해요.'], D16);
  assert.strictEqual(r.added.length, 1);
  assert.strictEqual(r.added[0].status, 'open'); assert.strictEqual(r.added[0].answer, '');
  assert.strictEqual(JSON.parse(r.text).questions[0].status, 'answered');
});

test('경계: 문장 안에서 ⓑ를 먼저 말해도 선택지 목록에서 자른다 (qa 11-16)', () => {
  const p = cq.parseQuestion('앞서 ⓑ로 정한 기준을 유지할까요? ⓐ 유지 ⓑ 변경');
  assert.strictEqual(p.summary, '앞서 ⓑ로 정한 기준을 유지할까요?');
  assert.strictEqual(p.options, 'ⓐ 유지 ⓑ 변경');
});

test('중복 아님: 기관명·반대 동사·번호만 바꾼 같은 틀 질문은 각각 넣는다 (qa 11-16)', () => {
  const led = L16(['도봉 사업계획 PDF 원본 파일 경로를 알려줘']);
  assert.strictEqual(cq.addToLedger(led, ['노원 사업계획 PDF 원본 파일 경로를 알려줘'], D16).added.length, 1);
  const led2 = L16(['업로드한 암호 문서는 분석을 막을까요?', 'ⓐ예 ⓑ아니오']);
  assert.strictEqual(cq.addToLedger(led2, ['업로드한 암호 문서는 분석을 허용할까요? ⓐ예 ⓑ아니오'], D16).added.length, 1);
  const led3 = L16(['로컬 DB에 034 마이그레이션을 적용해 줄 수 있어?']);
  assert.strictEqual(cq.addToLedger(led3, ['로컬 DB에 035 마이그레이션을 적용해 줄 수 있어?'], D16).added.length, 1);
});

test('중복 아님: 15자 미만 짧은 비슷한 질문은 둘 다 넣는다', () => {
  const led = L16(['시드를 어떻게 넣을까?']);
  assert.strictEqual(cq.addToLedger(led, ['시드를 언제 넣을까?'], D16).added.length, 1);
});
