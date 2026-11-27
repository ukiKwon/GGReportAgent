'use strict';
// 발표 대본 'AI 초안'(NEXT 129, design-reviewer 11-27 0028_a50813cc) — preptask.js 순수 함수·마크업, prep.js 배선·index.html CSS 정적 검사.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pt = require('../js/preptask.js');

const ROOT = path.join(__dirname, '..');
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
const PREP_SRC = src('js/prep.js');
const HTML = src('index.html');
const T = pt.T;
const F = function (key) { return pt.SCRIPT_FIELDS.filter(function (f) { return f.key === key; })[0]; };

test('AI 초안 창 마크업: 꺼짐은 지금과 같고, 켜짐은 묶음 단추·고정 줄·칸 2곳에만', function () {
  assert.deepStrictEqual(pt.AI_FIELDS.map(function (f) { return f.key; }), ['intro', 'effect']);
  const off = pt.scriptDialogHtml({ name: 'A', vals: {} });
  assert.ok(off.indexOf('bs-ai') < 0, '인자 없으면 AI 마크업이 전혀 없다');
  const on = pt.scriptDialogHtml({ name: 'A', vals: {}, ai: { on: true, slots: true } });
  ['bs-ai-go', 'bs-ai-h', 'bs-ai-basis', 'bs-ai-line', 'bs-ai-sr'].forEach(function (id) { assert.ok(on.indexOf('id="' + id + '"') > 0, id); });
  assert.ok(/<p class="dlg-hint" id="bs-ai-line"><\/p><p class="sr-only" id="bs-ai-sr" role="status"><\/p><\/div>/.test(on), '#bs-err 다음, 안내 줄 묶음 안');
  assert.ok(on.indexOf('<legend>기관별 서술</legend><div class="bs-ai" id="bs-ai">') > 0, '묶음 머리 바로 아래');
  assert.ok(on.indexOf('id="bs-ai"') < on.indexOf('id="bs-intro"'), '칸들 앞');
  assert.strictEqual((on.match(/id="bs-ai"/g) || []).length, 1);
  assert.ok(/<button type="button" id="bs-ai-go" aria-describedby="bs-ai-h">AI 초안 만들기<\/button>/.test(on) && /id="bs-ai-basis" hidden>/.test(on));
  assert.strictEqual((on.match(/class="bs-ai-slot"/g) || []).length, 2);
  assert.ok(on.indexOf('id="bs-intro-ai-s"') > 0 && on.indexOf('id="bs-effect-ai-s"') > 0 && on.indexOf('bs-status-ai-s') < 0 && on.indexOf('bs-profit-ai-s') < 0, '대상 2칸만');
  assert.ok(/<button type="button" id="bs-go" class="dlg-go">Word 만들기<\/button>/.test(on) && on.indexOf('id="bs-cancel"') > 0, '기존 단추 그대로');
  const marksOnly = pt.scriptDialogHtml({ name: 'A', vals: {}, ai: { on: false, slots: true } });
  assert.ok(marksOnly.indexOf('id="bs-ai-go"') < 0 && marksOnly.indexOf('id="bs-ai-line"') < 0 && marksOnly.indexOf('id="bs-intro-ai-s"') > 0, '꺼졌어도 넣은 칸 표시 자리는 남는다');
});

test('AI 초안 단추 판정: 담당 영업·영업부장 + 4상태', function () {
  ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING'].forEach(function (s) {
    assert.strictEqual(pt.aiGate({ state_cd: s, viewer: { is_assignee: true } }), true, s);
    assert.strictEqual(pt.aiGate({ state_cd: s, viewer: { is_head: true } }), true, s + ' 영업부장');
    assert.strictEqual(pt.aiGate({ state_cd: s, viewer: { is_assignee: false, is_head: false } }), false, s + ' 열람만');
  });
  ['CONFIRMED', 'OPEN_PENDING', 'CANCELLED', '', undefined].forEach(function (s) { assert.strictEqual(pt.aiGate({ state_cd: s, viewer: { is_assignee: true } }), false, String(s)); });
  assert.strictEqual(pt.aiGate({ state_cd: 'WRITING' }), false);
  assert.strictEqual(pt.aiGate(null), false);
  assert.strictEqual(pt.aiGate({ state_cd: 'WRITING', viewer: { is_assignee: 'true' } }), false, '진짜 true만');
});

test('AI 초안 응답 해석: 도착·전부 빔·요청 실패, 칸별 사유 코드 → 문구', function () {
  const ok = { state: 'OK', reason: null, fields: { intro: '가나', effect: '' }, empty_reasons: { effect: 'NUMBER_NOT_IN_BASIS' }, basis: { board: 'CURRENT', summary: 'CONFIRMED', notice: 'NONE', draft: true } };
  assert.strictEqual(pt.aiOutcome(ok), 'ok');
  assert.deepStrictEqual(pt.aiBoxes(ok), { intro: { text: '가나', pre: true }, effect: { text: '', why: T.aiWhy.NUMBER_NOT_IN_BASIS } });
  assert.strictEqual(pt.aiBoxes({ fields: { intro: '가', effect: '나' }, basis: { draft: false } }).intro.pre, false);
  assert.strictEqual(pt.aiOutcome({ state: 'EMPTY', reason: 'ALL_BLANKED', fields: { intro: '', effect: '' }, empty_reasons: { intro: 'PII', effect: 'EMPTY_OUTPUT' } }), 'blank');
  assert.strictEqual(pt.aiOutcome({ state: 'EMPTY', reason: 'NO_BASIS', fields: { intro: '', effect: '' }, empty_reasons: { intro: 'NO_BASIS', effect: 'NO_BASIS' } }), 'blank');
  ['BUSY', 'COOLDOWN', 'TIMEOUT', 'UNREACHABLE', 'MODEL_MISSING', 'LLM_ERROR', 'BAD_OUTPUT', 'BASIS_CHANGED'].forEach(function (r) {
    assert.strictEqual(pt.aiOutcome({ state: 'EMPTY', reason: r, fields: { intro: '', effect: '' } }), 'fail', r);
  });
  assert.strictEqual(pt.aiOutcome(null), 'fail');
  assert.strictEqual(pt.aiOutcome({}), 'fail');
  assert.strictEqual(pt.aiReasonText('NO_BASIS'), '근거로 쓸 자료가 없어 비웠습니다. 요약서나 이사회 자료를 채운 뒤 다시 만들거나 직접 적으세요.');
  assert.strictEqual(pt.aiReasonText('NUMBER_NOT_IN_BASIS'), '자료에 없는 숫자가 나와 비웠습니다. 직접 적으세요.');
  assert.strictEqual(pt.aiReasonText('PII'), '개인정보로 보이는 글이 섞여 비웠습니다. 직접 적으세요.');
  assert.strictEqual(pt.aiReasonText('EMPTY_OUTPUT'), 'AI가 빈 답을 돌려주었습니다. 직접 적으세요.');
  assert.strictEqual(pt.aiReasonText('XYZ'), T.aiWhyDefault);
  ['NUMBER_NOT_IN_BASIS', 'PII', 'EMPTY_OUTPUT'].forEach(function (c) { assert.ok(pt.aiReasonText(c).indexOf('다시 누르세요') < 0, c + '에는 다시 누르라고 쓰지 않는다'); });
});

test('AI 초안 요청 전체 실패: 상태·사유 → 고정 줄 문장(칸마다 반복하지 않는다)', function () {
  assert.strictEqual(pt.aiFailText(401, ''), T.scriptErr401);
  assert.strictEqual(pt.aiFailText(403, ''), T.aiErr403);
  assert.strictEqual(pt.aiFailText(404, ''), T.aiErr404);
  assert.strictEqual(pt.aiFailText(409, ''), T.aiErr409);
  assert.strictEqual(pt.aiFailText(503, ''), T.aiErrConnect);
  assert.strictEqual(pt.aiFailText(500, ''), T.aiErr500);
  assert.strictEqual(pt.aiFailText(200, 'BUSY'), T.aiErrBusy);
  assert.strictEqual(pt.aiFailText(200, 'COOLDOWN'), T.aiErrCooldown);
  assert.strictEqual(pt.aiFailText(200, 'TIMEOUT'), T.aiErrTimeout);
  assert.strictEqual(pt.aiFailText(0, 'TIMEOUT'), T.aiErrTimeout);
  assert.strictEqual(pt.aiFailText(0, 'UNREACHABLE'), T.aiErrConnect);
  assert.strictEqual(pt.aiFailText(200, 'MODEL_MISSING'), T.aiErrConnect);
  assert.strictEqual(pt.aiFailText(200, 'LLM_ERROR'), T.aiErr500);
  assert.strictEqual(pt.aiFailText(200, 'BAD_OUTPUT'), T.aiErr500);
  assert.strictEqual(pt.aiFailText(200, 'BASIS_CHANGED'), 'AI 초안을 만들지 못했습니다. 그 사이 이사회 자료의 확정 상태가 바뀌었습니다. 창을 닫았다가 다시 열어 만드세요.');
  assert.ok(T.aiErrBusy.indexOf('다른 요청') > 0 && T.aiErrBusy.indexOf('다른 사람') < 0, '범위를 모르므로 다른 요청');
  [T.aiErrBusy, T.aiErrCooldown, T.aiErrTimeout, T.aiErrConnect, T.aiErr403, T.aiErr404, T.aiErr409, T.aiErr500, T.aiErrBasis].forEach(function (m) {
    assert.strictEqual(m.indexOf('AI 초안을 만들지 못했습니다.'), 0, m);
    assert.ok(!/LLM|Ollama|BUSY|COOLDOWN|HTTP/.test(m), '내부 용어 없음');
  });
});

test('AI 초안 고정 줄: 경과 시간·상태별 문장·단추·이스케이프', function () {
  assert.deepStrictEqual([0, 45, 60, 120, 130, 312].map(pt.aiElapsed), ['0초', '45초', '1분', '2분', '2분 10초', '5분 12초']);
  const busy = pt.aiLine({ kind: 'busy', sec: 130 });
  assert.strictEqual(pt.aiLinePlain(busy), 'AI 초안을 만드는 중입니다(2분 10초 지남). 8분 안에 끝나지 않으면 멈춥니다. 다른 칸은 계속 적으세요.');
  assert.strictEqual(busy.btn, 'stop'); assert.strictEqual(busy.err, false);
  const h = pt.aiLineHtml(busy);
  assert.ok(h.indexOf('<span class="m" id="bs-ai-time">2분 10초</span>') > 0 && h.indexOf('<button type="button" data-ai-act="stop">그만두기</button>') > 0);
  assert.strictEqual(pt.aiLinePlain(pt.aiLine({ kind: 'long', sec: 500 })), '8분이 지났습니다. 곧 끝나지 않으면 멈춥니다.');
  assert.strictEqual(pt.aiLine({ kind: 'long' }).btn, 'stop');
  assert.strictEqual(pt.aiLinePlain(pt.aiLine({ kind: 'arrived', sec: 312, blanks: [] })), 'AI 초안 2칸이 왔습니다(5분 12초). 칸 아래 초안을 읽고 [칸에 넣기]를 눌러야 대본에 들어갑니다.');
  assert.strictEqual(pt.aiLinePlain(pt.aiLine({ kind: 'arrived', sec: 312, blanks: ['기대효과'] })), 'AI 초안이 1칸만 왔습니다(5분 12초). 기대효과는 비어 왔습니다. 칸 아래 이유를 보세요.');
  assert.ok(pt.aiLinePlain(pt.aiLine({ kind: 'arrived', sec: 1, blanks: ['보고 전 사전 설명'] })).indexOf('보고 전 사전 설명은 비어 왔습니다') > 0, '받침 있는 칸 이름은 은');
  assert.strictEqual(pt.aiLine({ kind: 'arrived', sec: 1, blanks: [] }).btn, 'show');
  assert.strictEqual(pt.aiLinePlain(pt.aiLine({ kind: 'allblank' })), '두 칸 모두 비어 왔습니다. 칸 아래 이유를 보세요.');
  assert.strictEqual(pt.aiLinePlain(pt.aiLine({ kind: 'stopped' })), 'AI 초안 만들기를 그만두었습니다. 적은 내용은 그대로입니다.');
  const fail = pt.aiLine({ kind: 'fail', msg: '<b>x' });
  assert.strictEqual(fail.err, true);
  assert.ok(pt.aiLineHtml(fail).indexOf('&lt;b&gt;x') > 0 && pt.aiLineHtml(fail).indexOf('<button') < 0);
  assert.strictEqual(pt.aiLine({ kind: 'nope' }), null);
  assert.strictEqual(pt.aiLineHtml(null), '');
  assert.strictEqual(pt.aiLinePlain(null), '');
});

test('AI 초안 상자·사유 상자·넣은 칸 표시 마크업', function () {
  const f = F('intro');
  const d = pt.aiSlotHtml(f, { box: { text: '가<b>\n나', pre: true }, append: false });
  assert.ok(d.indexOf('<section class="bs-draft" id="bs-intro-ai" aria-labelledby="bs-intro-ai-h">') >= 0);
  assert.ok(d.indexOf('<h3 id="bs-intro-ai-h" tabindex="-1">AI 초안<span class="sr-only">, 보고 전 사전 설명</span></h3>') > 0);
  assert.ok(d.indexOf('<span class="bs-tag">사실 확인 필요</span><span class="bs-tag bs-tag-pre">확정 전 자료 기준</span>') > 0);
  assert.ok(d.indexOf('<p class="bs-draft-txt">가&lt;b&gt;\n나</p>') > 0, '본문은 이스케이프, 줄바꿈은 CSS가 처리');
  assert.ok(d.indexOf('<p class="tm-note bs-draft-err" id="bs-intro-ai-e" role="status"></p>') > 0);
  assert.ok(d.indexOf('data-ai-act="put" data-key="intro" aria-label="보고 전 사전 설명 칸에 AI 초안 넣기" aria-describedby="bs-intro-ai-e">칸에 넣기</button>') > 0);
  assert.ok(d.indexOf('data-ai-act="drop" data-key="intro" aria-label="보고 전 사전 설명 AI 초안 버리기">버리기</button>') > 0);
  assert.ok(d.indexOf('<span class="tm-count">6자</span>') > 0);
  assert.ok(d.indexOf('data-ai-act="undo"') < 0 && d.indexOf('bs-ai-mark') < 0);
  const noPre = pt.aiSlotHtml(f, { box: { text: '가', pre: false }, append: true });
  assert.ok(noPre.indexOf('bs-tag-pre') < 0 && noPre.indexOf('>사실 확인 필요<') > 0, '확정 전 칩은 basis.draft일 때만');
  assert.ok(noPre.indexOf('>뒤에 붙이기</button>') > 0 && noPre.indexOf('aria-label="보고 전 사전 설명 칸 뒤에 AI 초안 붙이기"') > 0, '글이 있는 칸은 뒤에 붙이기');
  const e = pt.aiSlotHtml(F('effect'), { box: { text: '', why: T.aiWhy.PII } });
  assert.ok(e.indexOf('class="bs-draft bs-draft--empty" id="bs-effect-ai"') > 0 && e.indexOf(T.aiWhy.PII) > 0);
  assert.ok(e.indexOf('data-ai-act="dismiss" data-key="effect" aria-label="기대효과 AI 초안 알림 닫기">알림 닫기</button>') > 0);
  assert.ok(e.indexOf('bs-tag') < 0 && e.indexOf('data-ai-act="put"') < 0 && e.indexOf('tm-count') < 0, '사유 상자엔 칩·넣기·글자 수 없음');
  const m1 = pt.aiSlotHtml(f, { mark: { after: 'x', undo: '' } });
  assert.ok(m1.indexOf('<p class="tm-note bs-ai-mark" id="bs-intro-aim">AI 초안을 넣은 칸입니다. 초안이므로 발표자가 사실을 확인하고 고쳐 씁니다.') === 0);
  assert.ok(m1.indexOf('data-ai-act="undo" data-key="intro" aria-label="보고 전 사전 설명 칸 되돌리기">되돌리기</button>') > 0, '빈 칸이었어도(undo "") 되돌리기가 있다');
  const m2 = pt.aiSlotHtml(f, { mark: { after: 'x', undo: null } });
  assert.ok(m2.indexOf('bs-ai-mark') > 0 && m2.indexOf('data-ai-act="undo"') < 0, '고치면 되돌리기만 사라지고 표시 줄은 남는다');
  assert.strictEqual(pt.aiSlotHtml(f, {}), '');
  assert.strictEqual(pt.aiSlotHtml(f, null), '');
});

test('AI 초안 붙이기: 빈 줄 하나를 두고 뒤에, 한도(12줄·줄당 300자·합계 1,000자) 넘으면 넣지 않음', function () {
  assert.deepStrictEqual(pt.aiMerge('', '가나'), { value: '가나', append: false, err: '' });
  assert.deepStrictEqual(pt.aiMerge('   \n', ' 가나 '), { value: '가나', append: false, err: '' }, '공백뿐인 칸은 빈 칸');
  assert.deepStrictEqual(pt.aiMerge('가', '나'), { value: '가\n\n나', append: true, err: '' });
  assert.deepStrictEqual(pt.aiMerge('가\r\n', '나'), { value: '가\n\n나', append: true, err: '' }, 'CRLF·뒤쪽 공백');
  const tot = pt.aiMerge(new Array(721).join('가'), new Array(385).join('나'));
  assert.strictEqual(tot.err, '붙이면 1,000자를 넘습니다(칸 720자 + 초안 384자). 칸의 글을 줄인 뒤 다시 누르세요.');
  assert.strictEqual(pt.aiMerge(new Array(1001).join('가'), '나').err.indexOf('붙이면 1,000자를 넘습니다(칸 1000자'), 0);
  const eleven = new Array(12).join('가\n').replace(/\n$/, '');   // 11줄
  assert.strictEqual(pt.aiMerge(eleven, '가\n나').err, '붙이면 12줄을 넘습니다. 칸의 줄을 줄인 뒤 다시 누르세요.');
  assert.strictEqual(pt.aiMerge(new Array(10).join('가\n').replace(/\n$/, ''), '가\n나').err, '', '9줄 + 빈 줄 + 2줄 = 12줄은 통과');
  assert.strictEqual(pt.aiMerge('', new Array(302).join('가')).err, '한 줄은 300자까지입니다(1번째 줄이 301자).');
  assert.strictEqual(pt.aiMerge('가', new Array(302).join('나')).err, '한 줄은 300자까지입니다(3번째 줄이 301자).');
  assert.strictEqual(pt.aiMerge('', new Array(1002).join('가')).err, T.scriptErrTotal, '빈 칸에 넣을 때는 기존 한도 문구');
});

test('AI 초안 근거 줄: 쓰지 않은 자료는 빼고, 공고는 코드→문구 표(지금 서버는 USED/NONE)', function () {
  assert.deepStrictEqual(pt.aiBasisLines({ fields: { intro: '가', effect: '나' }, basis: { board: 'CONFIRMED', summary: 'CURRENT', notice: 'NONE' } }),
    ['근거 자료: 기관 정보, 요약서(확정 전), 이사회 자료(확정)', '공고 파일 내용은 이번 초안에 쓰지 않았습니다.']);
  assert.deepStrictEqual(pt.aiBasisLines({ fields: { intro: '가', effect: '' }, basis: { board: 'NONE', summary: 'NONE', notice: 'USED' } }), ['근거 자료: 기관 정보, 공고 파일']);
  assert.deepStrictEqual(pt.aiBasisLines({ fields: { intro: '', effect: '' }, basis: { board: 'NONE', summary: 'NONE', notice: 'NONE' } }), ['공고 파일 내용은 이번 초안에 쓰지 않았습니다.']);
  assert.deepStrictEqual(pt.aiBasisLines({ fields: { intro: '', effect: '' }, basis: { notice: 'SOMETHING_NEW' } }), ['공고 파일 내용은 이번 초안에 쓰지 않았습니다.'], '모르는 코드는 NONE 문구');
  assert.strictEqual(T.aiNoticeText.NONE, '공고 파일 내용은 이번 초안에 쓰지 않았습니다.');
  assert.ok(pt.aiBasisHtml(['<i>']).indexOf('&lt;i&gt;') > 0 && pt.aiBasisHtml([]) === '');
});

test('AI 초안 넣은 칸 추적(ai_fields): 고쳐도 남기고, 비운 칸은 뺀다', function () {
  const marks = { intro: { after: '가' }, effect: { after: '나' } };
  assert.strictEqual(pt.AI_KEEP_AFTER_EDIT, true, '사용자 결정 11-27: 고쳐 써도 남김');
  assert.deepStrictEqual(pt.aiFieldsOf(marks, { intro: '가 고침', effect: '' }), ['intro']);
  assert.deepStrictEqual(pt.aiFieldsOf(marks, { intro: '가 고침', effect: '' }, false), [], '그대로 둔 칸만 보려면');
  assert.deepStrictEqual(pt.aiFieldsOf(marks, { intro: ' 가 ', effect: '나' }, false), ['intro', 'effect']);
  assert.deepStrictEqual(pt.aiFieldsOf({}, { intro: '가' }), []);
  assert.deepStrictEqual(pt.aiFieldsOf(null, null), []);
  assert.deepStrictEqual(pt.aiFieldsOf({ status_note: { after: 'x' } }, { status_note: 'x' }), [], 'AI 대상 칸만');
});

test('AI 초안 닫기 확인 isDirty: 만드는 중 또는 넣지 않은 초안', function () {
  assert.strictEqual(pt.aiDirtyKind(null), '');
  assert.strictEqual(pt.aiDirtyKind({ busy: false, boxes: {} }), '');
  assert.strictEqual(pt.aiDirtyKind({ busy: true, boxes: {} }), 'busy');
  assert.strictEqual(pt.aiDirtyKind({ busy: false, boxes: { intro: { text: '가', pre: false } } }), 'draft');
  assert.strictEqual(pt.aiDirtyKind({ busy: false, boxes: { intro: { text: '', why: 'x' }, effect: { text: '', why: 'y' } } }), '', '사유 상자만 있으면 잃을 초안이 없다');
  assert.strictEqual(pt.aiDirtyKind({ busy: true, boxes: { intro: { text: '가' } } }), 'busy', '만드는 중이 먼저');
  assert.strictEqual(pt.aiHold({ busy: true, boxes: {} }), true);
  assert.strictEqual(pt.aiHold({ busy: false, boxes: {} }), false);
  assert.strictEqual(pt.aiHold(null), false);
  assert.ok(pt.aiDirtyText('busy').indexOf('만드는 중입니다') > 0 && pt.aiDirtyText('draft').indexOf('칸에 넣지 않은 AI 초안') === 0);
});

test('AI 초안 배선(prep.js): 상태 조회 → 창, 요청 헤더·AbortController·9분, 닫기·Word 유지·ai_fields', function () {
  const a = PREP_SRC.indexOf('function dropScript() {'), b = PREP_SRC.indexOf('function onSetConfirmed(attachId) {');
  assert.ok(a > 0 && b > a);
  const f = PREP_SRC.slice(a, b);
  assert.ok(f.indexOf("fetch('/llm/script-draft/status'") > 0 && f.indexOf('pt.aiGate(') > 0 && f.indexOf('openScriptDialog(sc, on)') > 0);
  assert.ok(f.indexOf('j.enabled === true') > 0 && f.indexOf('reachable') < 0 && f.indexOf('model_ready') < 0 && f.indexOf('probe') < 0, '단추는 enabled만 본다');
  assert.ok(f.indexOf("'/board-script-draft'") > 0 && f.indexOf("'X-Screen-Id': 'prep_detail', 'X-Button-Id': 'script_ai_draft'") > 0 && f.indexOf("method: 'POST'") > 0);
  assert.ok(f.indexOf('new AbortController()') > 0 && f.indexOf('pt.AI_FETCH_MS') > 0 && f.indexOf('setInterval(') > 0 && f.indexOf('clearInterval(') > 0 && f.indexOf('ctl.abort()') > 0);
  assert.ok(f.indexOf('isDirty: function () { return pt.aiHold(sc.ai); }') > 0 && f.indexOf('get dirtyText()') > 0 && f.indexOf('aiClose(sc);') > 0);
  assert.ok(f.indexOf('if (ov && !pt.aiHold(sc.ai)) dl.close(ov);') > 0, 'Word 성공 시 창 유지 조건');
  assert.ok(f.indexOf('localStorage') < 0 && f.indexOf('sessionStorage') < 0, '초안·표시를 브라우저 저장소에 넣지 않는다');
  const done = /function aiDone\([\s\S]*?\n  \}\n/.exec(f);
  assert.ok(done, 'aiDone을 찾는다');
  assert.ok(done[0].indexOf('.focus(') < 0, '도착해도 포커스를 옮기지 않는다');
  assert.ok(done[0].indexOf('ai.dead || ai.run !== run') > 0, '닫았거나 그만둔 뒤 늦게 온 응답은 버린다');
  assert.ok(f.indexOf('innerHTML = pt.aiSlotHtml(') > 0 && f.indexOf('.innerHTML = out.res') < 0 && f.indexOf('.innerHTML = box') < 0, '서버 문자열은 조립 함수(esc)로만');
  assert.ok(f.indexOf('ta.value = m.value;') > 0, 'AI 글을 칸에 넣을 때는 textarea.value');
  assert.ok(f.indexOf('JSON.stringify(scriptReqBody(sc, vals))') > 0, 'Word 요청 본문에 ai_fields');
  assert.ok(f.indexOf('pt.scriptBody(vals)') > 0 && f.indexOf('pt.aiFieldsOf(sc.aiMarks, vals)') > 0 && f.indexOf('if (af.length) body.ai_fields = af;') > 0, '넣은 칸이 없으면 키를 보내지 않는다');
  assert.ok(/case 'script-open': onScriptOpen\(\); return;/.test(PREP_SRC));
});

test('AI 초안 CSS: 점선 상자·칩 대비·되돌림 목록·위치', function () {
  assert.ok(/\.bs-draft \{[^}]*border:1px dashed var\(--line-strong\)[^}]*background:var\(--panel2\)/.test(HTML));
  assert.ok(/\.bs-tag-pre \{[^}]*color-mix\(in srgb, var\(--orange\) 10%, var\(--panel\)\)/.test(HTML), '18%면 대비 4.2:1이라 10%');
  assert.ok(/#bs-ai-line \.m \{ font-family:var\(--mono\); \}/.test(HTML) && /#bs-ai-go\[aria-disabled="true"\]/.test(HTML));
  assert.ok(/\.bs-draft h3, \.ad-sub, \.ts-sec-h/.test(HTML), '13px 제목은 본문체로 되돌린다');
  const at = HTML.indexOf('.bs-draft {');
  assert.ok(at > HTML.indexOf('.bs-lrow {') && at < HTML.indexOf('/* 협약준비 업무 끝 */'));
  const blk = HTML.slice(at, HTML.indexOf('/* 협약준비 업무 끝 */'));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(blk) && !/box-shadow|animation|transition|gradient/.test(blk), '새 색·그림자·움직임 없음');
});
