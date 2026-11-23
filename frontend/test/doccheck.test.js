const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const dc = require('../js/doccheck.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DG = fs.readFileSync(path.join(__dirname, '..', 'js', 'designer.js'), 'utf8');
function f(o) { return Object.assign({ name: 'a.pptx', state: 'DONE', reason: null, hit_count: 0, unconfirmed_count: 0, acked_count: 0 }, o); }

test('배지: 위에서부터 먼저 맞는 것 하나(규격 5-1)', function () {
  assert.deepStrictEqual([dc.badgeFor(f({}), { checking: true }).text], ['점검 중…']);
  assert.strictEqual(dc.badgeFor(null, {}), null);
  const open = dc.badgeFor(f({ hit_count: 3, unconfirmed_count: 3 }));
  assert.strictEqual(open.text, '확인 필요 3건'); assert.strictEqual(open.cls, 'open'); assert.strictEqual(open.extra, null);
  const openP = dc.badgeFor(f({ state: 'PARTIAL', reason: 'HIT_CAP', hit_count: 2, unconfirmed_count: 2 }));
  assert.strictEqual(openP.extra.text, '일부만 점검');
  assert.strictEqual(dc.badgeFor(f({ hit_count: 2, acked_count: 2 })).text, '확인함 2건');
  assert.strictEqual(dc.badgeFor(f({})).text, '찾은 이름 없음');
});

test('배지: 일부만 점검·점검 못 함 + 사유·[다시 점검]', function () {
  const p = dc.badgeFor(f({ state: 'PARTIAL', reason: 'TOO_MANY_PAGES' }));
  assert.strictEqual(p.text, '일부만 점검'); assert.strictEqual(p.why, '앞 500쪽만 점검했습니다.'); assert.strictEqual(p.retry, false);
  const pu = dc.badgeFor(f({ state: 'PARTIAL', reason: 'XYZ' }));
  assert.strictEqual(pu.why, null);   // PARTIAL의 모르는 코드는 문구를 지어내지 않는다
  const nc = dc.badgeFor(f({ state: 'NOT_CHECKED', reason: 'TIMEOUT' }));
  assert.strictEqual(nc.text, '점검 못 함'); assert.strictEqual(nc.why, '20초 안에 끝나지 않아 멈췄습니다.'); assert.strictEqual(nc.retry, true);
  assert.strictEqual(dc.badgeFor(f({ state: 'NOT_CHECKED', reason: 'IMAGE_ONLY' })).retry, false);
  const er = dc.badgeFor(f({ state: 'ERROR', reason: 'INTERNAL' }));
  assert.strictEqual(er.text, '점검 못 함'); assert.strictEqual(er.retry, true);
});

test('사유 문구: 17개 코드 + 모르는 코드(코드는 보이지 않음)', function () {
  const codes = ['BUSY', 'TIMEOUT', 'STALE', 'INTERNAL', 'FORMAT_UNSUPPORTED', 'IMAGE_ONLY', 'ARCHIVE', 'FORMAT_MISMATCH', 'ACTIVE_CONTENT',
    'ATTACHMENT', 'ENCRYPTED', 'BROKEN', 'TOO_LARGE', 'NO_TEXT', 'TEXT_CAP', 'TOO_MANY_PAGES', 'HIT_CAP'];
  codes.forEach(function (c) { assert.strictEqual(dc.reasonInfo(c).known, true, c); });
  const retry = codes.filter(function (c) { return dc.reasonInfo(c).retry; });
  assert.deepStrictEqual(retry, ['BUSY', 'TIMEOUT', 'STALE', 'INTERNAL']);
  assert.strictEqual(dc.reasonInfo('FORMAT_UNSUPPORTED').text, '옛 파워포인트(ppt)는 읽지 못합니다. pptx나 pdf로 저장해 올리면 점검합니다.');
  assert.strictEqual(dc.reasonInfo('HIT_CAP').text, '찾은 곳이 너무 많아 2,000곳까지만 기록했습니다.');
  ['ZZ_NEW', 'constructor', '__proto__', '', null, undefined].forEach(function (c) {
    const r = dc.reasonInfo(c);
    assert.deepStrictEqual([r.text, r.retry, r.known], ['점검하지 못했습니다.', true, false]);
  });
});

test('위치 표기', function () {
  assert.strictEqual(dc.locText('SLIDE', 4), '슬라이드 4');
  assert.strictEqual(dc.locText('NOTE', 4), '슬라이드 4 노트');
  assert.strictEqual(dc.locText('PAGE', 12), '12쪽');
  assert.strictEqual(dc.locText('MASTER', 0), '마스터·레이아웃');
  assert.strictEqual(dc.locText('META', 0), '문서 정보(제목·작성자)');
  assert.strictEqual(dc.locText('OTHER', 0), '차트·도표·메모');
  assert.deepStrictEqual(dc.locParts('PAGE', 12), ['', 12, '쪽']);
  assert.strictEqual(dc.instText(null), '(기관 목록에서 빠진 기관)');
  assert.strictEqual(dc.instText('서울 서초구'), '서울 서초구');
});

test('요약 칩: 0인 항목 뺌, 모두 0이면 찾은 이름 없음(파일 n개), 파일 없으면 빈 배열', function () {
  assert.deepStrictEqual(dc.summaryChips({ file_count: 3, unconfirmed_count: 3, not_checked_count: 1, partial_count: 1 }),
    [{ text: '확인 필요 3건', open: true }, { text: '점검 못 함 1개', open: false }, { text: '일부만 점검 1개', open: false }]);
  assert.deepStrictEqual(dc.summaryChips({ file_count: 2, unconfirmed_count: 0, not_checked_count: 0, partial_count: 0 }),
    [{ text: '찾은 이름 없음(파일 2개)', open: false }]);
  assert.deepStrictEqual(dc.summaryChips({ file_count: 0 }), []);
  assert.deepStrictEqual(dc.summaryChips(null), []);
});

test('요약 칩: 모두 0이어도 확인해 둔 건이 있으면 확인함 n건(팀 결정 11-23)', function () {
  const base = { file_count: 2, unconfirmed_count: 0, not_checked_count: 0, partial_count: 0 };
  assert.deepStrictEqual(dc.summaryChips(Object.assign({ files: [f({ hit_count: 2, acked_count: 2 }), f({ name: 'b.pdf', hit_count: 1, acked_count: 1 })] }, base)),
    [{ text: '확인함 3건', open: false }]);
  assert.deepStrictEqual(dc.summaryChips(Object.assign({ acked_count: 4 }, base)), [{ text: '확인함 4건', open: false }]);
  assert.deepStrictEqual(dc.summaryChips(Object.assign({ files: [f({}), f({ name: 'b.pdf' })] }, base)),
    [{ text: '찾은 이름 없음(파일 2개)', open: false }]);
  // 다른 칩이 있으면 확인함은 덧붙이지 않는다
  assert.deepStrictEqual(dc.summaryChips({ file_count: 2, unconfirmed_count: 1, not_checked_count: 0, partial_count: 0, files: [f({ acked_count: 5 })] }),
    [{ text: '확인 필요 1건', open: true }]);
});

test('펼침 칸: 이름이 없을 때 한 줄(사유 정본)·[다시 점검] 숨김, 파일 줄에는 사유 없음(NEXT 106 P2-1·P3-1·P3-2)', function () {
  assert.strictEqual(dc.emptyLine({ state: 'DONE' }), '찾은 이름 없음');
  assert.strictEqual(dc.emptyLine({ state: 'NOT_CHECKED', reason: 'TIMEOUT' }), '20초 안에 끝나지 않아 멈췄습니다.');
  assert.strictEqual(dc.emptyLine({ state: 'ERROR', reason: 'INTERNAL' }), '점검 중 오류가 났습니다.');
  assert.strictEqual(dc.emptyLine({ state: 'PARTIAL', reason: 'TOO_MANY_PAGES' }), '앞 500쪽만 점검했습니다.');
  assert.strictEqual(dc.emptyLine({ state: 'NOT_CHECKED', reason: 'XYZ' }), '점검하지 못했습니다.');
  assert.strictEqual(dc.emptyLine(null), null);
  assert.strictEqual(dc.canRecheck({ state: 'NOT_CHECKED', reason: 'IMAGE_ONLY' }), false);
  assert.strictEqual(dc.canRecheck({ state: 'ERROR', reason: 'BROKEN' }), false);
  assert.strictEqual(dc.canRecheck({ state: 'NOT_CHECKED', reason: 'TIMEOUT' }), true);
  assert.strictEqual(dc.canRecheck({ state: 'PARTIAL', reason: 'HIT_CAP' }), true);   // 점검은 됐으니 숨기지 않는다
  assert.strictEqual(dc.canRecheck({ state: 'DONE' }), true);
  assert.strictEqual(dc.canRecheck(null), true);
  // 파일 줄(renderFiles)은 b.why를 그리지 않고, 펼침 칸(panelEl)이 emptyLine·canRecheck를 쓴다
  assert.ok(!/mk\('span', 'dc-why', b\.why\)/.test(DG));
  assert.ok(/doccheck\.emptyLine\(d\)/.test(DG) && /doccheck\.canRecheck\(d\)/.test(DG));
  assert.ok(!/fidBtn\('점검 결과 '/.test(DG));
  assert.ok(/'\\u0000toggle'/.test(DG));   // [돌아가서 확인]에서 체크칸이 없으면 토글로(P3-4)
});

test('상세 안내 줄·잠김·표시 가능', function () {
  assert.deepStrictEqual(dc.notes({ state: 'DONE', order_approx: true, has_images: true, has_embedded: true }),
    ['슬라이드 번호가 실제 순서와 다를 수 있습니다.', '그림 속 글자는 보지 않았습니다.', '끼워 넣은 개체(엑셀 표 등)는 보지 않았습니다.']);
  assert.deepStrictEqual(dc.notes({ state: 'DONE' }), []);
  assert.strictEqual(dc.notes({ state: 'PARTIAL', reason: 'TEXT_CAP' })[0], '글자가 너무 많아 앞부분만 점검했습니다.');
  assert.strictEqual(dc.isLocked({ team: '디자이너', status: '1차완료' }), true);
  assert.strictEqual(dc.isLocked({ team: '디자이너', status: '2차완료' }), true);
  assert.strictEqual(dc.isLocked({ team: '디자이너', status: '대기' }), false);
  assert.strictEqual(dc.isLocked({ team: '디자이너', status: '작성중' }), false);
  assert.strictEqual(dc.isLocked({ team: '영업', status: '1차완료' }), false);   // 세 팀 작업은 화면 잠금 없음(서버는 ack 담당만 검사)
  assert.strictEqual(dc.isLocked(null), false);
  assert.strictEqual(dc.canAck({ state: 'DONE', sha256: 'a'.repeat(64) }), true);
  assert.strictEqual(dc.canAck({ state: 'PARTIAL', sha256: 'a'.repeat(64) }), true);
  assert.strictEqual(dc.canAck({ state: 'NOT_CHECKED', sha256: null }), false);
  assert.strictEqual(dc.canAck({ state: 'DONE', sha256: null }), false);
});

test('ack 본문 키·헤더·hitKey (DocCheckAckIn SNAKE_CASE, DocCheckUiIds)', function () {
  const h = { inst_id: 'seoul-seocho', inst_name: '서울 서초구', loc_kind: 'SLIDE', loc_no: 4, count: 2, acked: false };
  assert.deepStrictEqual(dc.ackItem(h), { inst_id: 'seoul-seocho', loc_kind: 'SLIDE', loc_no: 4 });
  assert.strictEqual(dc.hitKey(h), 'seoul-seocho|SLIDE|4');
  assert.strictEqual(dc.ackLabel(h), '서울 서초구 슬라이드 4 의도한 언급');
  assert.strictEqual(dc.ackLive(h, true), '서울 서초구 슬라이드 4 — 의도한 언급으로 표시했습니다.');
  assert.strictEqual(dc.ackLive(h, false), '서울 서초구 슬라이드 4 — 표시를 풀었습니다.');
  assert.deepStrictEqual(dc.headers({ team: '디자이너' }, 'doc_check_ack'), { 'X-Screen-Id': 'design_work', 'X-Button-Id': 'doc_check_ack' });
  assert.deepStrictEqual(dc.headers({ team: '영업' }, 'submit'), { 'X-Screen-Id': 'task_work', 'X-Button-Id': 'submit' });
  assert.strictEqual(dc.timeText('2026-11-20T17:35:12'), '2026-11-20 17:35');
  assert.strictEqual(dc.ackedAtText('2026-11-20T17:40:00'), '11-20 17:40');
});

test('오류: detail 객체에서 code를 읽고, 규격 5-1 표대로 문구를 고른다(P1-1)', function () {
  assert.strictEqual(dc.errorCode({ detail: { code: 'TASK_LOCKED', message: 'x' } }), 'TASK_LOCKED');
  assert.strictEqual(dc.errorCode({ detail: '평문' }), null);
  assert.strictEqual(dc.errorCode(null), null);
  assert.strictEqual(dc.errorDetailText({ detail: '평문' }), '평문');
  assert.strictEqual(dc.errorDetailText({ detail: { code: 'A' } }), '');
  const E = dc.errorFor;
  assert.deepStrictEqual(E(409, 'DOC_CHECK_STALE', 'ack'), { text: '그사이 파일이 바뀌어 점검 결과를 새로 불러왔습니다. 다시 표시해 주세요.', reload: 'both' });
  assert.strictEqual(E(409, 'TASK_LOCKED', 'upload').text, '제출한 작업이라 파일과 표시를 바꿀 수 없습니다.');
  assert.strictEqual(E(503, 'DOC_CHECK_BUSY', 'recheck').text, '지금 다른 파일을 점검하고 있습니다. 1분쯤 뒤 다시 눌러 주세요.');
  assert.strictEqual(E(503, 'DOC_CHECK_BUSY', 'upload').text, '파일을 점검하지 못해 올리지 않았습니다. 잠시 뒤 다시 올려 주세요.');
  assert.strictEqual(E(400, 'ACTIVE_CONTENT', 'upload').text, '매크로·스크립트가 들어 있는 파일은 올릴 수 없습니다. 매크로를 뺀 pptx로 저장해 다시 올려 주세요.');
  assert.strictEqual(E(401, null, 'ack').text, '로그인 정보(사번)가 없어 처리하지 못했습니다. 다시 로그인해 주세요.');
  assert.strictEqual(E(403, null, 'ack').text, '이 작업의 담당자만 표시할 수 있습니다.');
  assert.deepStrictEqual(E(404, null, 'load'), { text: '파일이 없습니다. 목록을 새로 불러왔습니다.', reload: 'files' });
  assert.strictEqual(E(0, null, 'ack').text, '서버에 연결하지 못해 바꾸지 못했습니다.');
  assert.strictEqual(E(0, null, 'submit').text, '서버 연결 실패 — 제출되지 않았습니다.');
  assert.strictEqual(E(415, null, 'upload', '허용하지 않는 형식입니다.').text, '허용하지 않는 형식입니다.');   // 기존 평문 사유 유지
  assert.strictEqual(E(500, null, 'upload').text, '업로드 실패 (500)');
  assert.strictEqual(E(500, null, 'submit').text, '제출 실패 (500)');
  assert.strictEqual(E(500, null, 'delete').text, '삭제 실패 (500)');
  assert.ok(E(403, null, 'recheck').text.indexOf('(403)') > 0);   // 담당자 문구는 표시 전용
  assert.doesNotMatch(JSON.stringify(dc.COPY), /\[object Object\]|다시 수정/);
});

test('올리기 404는 작업이 없다는 문구, 그 밖의 404는 파일이 없다는 문구(P3-3)', function () {
  assert.deepStrictEqual(dc.errorFor(404, null, 'upload'), { text: '작업을 찾지 못했습니다. 목록을 새로 불러와 주세요.', reload: null });
  assert.deepStrictEqual(dc.errorFor(404, null, 'delete'), { text: '파일이 없습니다. 목록을 새로 불러왔습니다.', reload: 'files' });
  assert.strictEqual(dc.errorFor(404, null, 'ack').reload, 'files');
});

test('체크칸 상태: 요청 중이면 요청한 상태, 다른 줄·요청 없음은 서버 상태(P2-2)', function () {
  const h = { inst_id: 7, loc_kind: 'SLIDE', loc_no: 3, acked: false };
  const key = dc.hitKey(h);
  assert.strictEqual(dc.shownAcked(h, { key: key, want: true }), true);
  assert.strictEqual(dc.shownAcked(Object.assign({}, h, { acked: true }), { key: key, want: false }), false);
  assert.strictEqual(dc.shownAcked(h, { key: '9|SLIDE|3', want: true }), false);
  assert.strictEqual(dc.shownAcked(h, undefined), false);
  assert.strictEqual(dc.shownAcked(Object.assign({}, h, { acked: true }), null), true);
});

test('오류 줄 알림: 새 문구나 바뀐 문구만 읽힌다(P3-4)', function () {
  assert.strictEqual(dc.errAnnounce(undefined, '실패'), true);
  assert.strictEqual(dc.errAnnounce('실패', '실패'), false);
  assert.strictEqual(dc.errAnnounce('실패', '다른 실패'), true);
  assert.strictEqual(dc.errAnnounce('실패', ''), false);
});

test('404 뒤 파일이 목록에 없으면 펼침 칸이 사라진 것(P2-1)', function () {
  assert.strictEqual(dc.fileGone([{ name: 'a.pptx' }], 'b.pptx'), true);
  assert.strictEqual(dc.fileGone([{ name: 'a.pptx' }], 'a.pptx'), false);
  assert.strictEqual(dc.fileGone(null, 'a.pptx'), true);
});

test('designer.js: 409 오류 문구 유지·제출 중 닫기 막기·포커스 되돌림 배선 문자열', function () {
  assert.match(DG, /dcLoadDetail\(name, false, true\)/);
  assert.match(DG, /smSubmitting/);
  assert.match(DG, /stopImmediatePropagation/);
  assert.match(DG, /if \(open\) tg\.setAttribute\('aria-controls'/);
});

test('올리기 결과 한 줄', function () {
  const b = dc.badgeFor(f({ hit_count: 3, unconfirmed_count: 3 }));
  assert.strictEqual(dc.uploadResultText('제안.pptx', false, b), '제안.pptx을 올렸습니다. 확인 필요 3건');
  assert.strictEqual(dc.uploadResultText('제안.pptx', true, dc.badgeFor(f({}))), '제안.pptx을 올렸습니다. (같은 이름 파일을 바꿈) 찾은 이름 없음');
  assert.strictEqual(dc.uploadResultText('a.png', false, null), 'a.png을 올렸습니다.');
});

test('올리기 결과: 조사 도우미(dlg.withObj)가 있으면 받침에 맞춘다(팀 결정 11-23)', function () {
  const dlg = require('../js/dlg.js');
  assert.strictEqual(typeof dlg.withObj, 'function');
  assert.strictEqual(dc.uploadResultText('제안서', false, null, dlg.withObj), '제안서를 올렸습니다.');
  assert.strictEqual(dc.uploadResultText('제안안', false, null, dlg.withObj), '제안안을 올렸습니다.');
  assert.strictEqual(dc.uploadResultText('제안서', true, dc.badgeFor(f({})), dlg.withObj), '제안서를 올렸습니다. (같은 이름 파일을 바꿈) 찾은 이름 없음');
});

test('제출 확인창: 변형 A(일반)·변형 B(미확인), 요약 실패는 A', function () {
  const A = dc.submitModel(null, '영업팀장');
  assert.deepStrictEqual([A.variant, A.title, A.go, A.back, A.button], ['A', '결재 요청', '제출', '취소', 'submit']);
  assert.strictEqual(A.text, '제출하면 영업팀장에게 결재 요청이 갑니다.');
  assert.strictEqual(dc.submitModel({ submit_confirm_needed: false, unconfirmed_count: 0 }, '영업팀장').variant, 'A');   // 점검 못 함만 있으면 A
  const files = [];
  for (let i = 1; i <= 7; i++) files.push({ name: 'f' + i + '.pptx', unconfirmed_count: i });
  files.push({ name: 'ok.pdf', unconfirmed_count: 0 });
  const B = dc.submitModel({ submit_confirm_needed: true, unconfirmed_count: 28, not_checked_count: 2, partial_count: 1, files: files }, '영업팀장');
  assert.deepStrictEqual([B.variant, B.title, B.go, B.back, B.button],
    ['B', '다른 기관 이름 28건 미확인', '미확인 28건 무시하고 제출', '돌아가서 확인', 'doc_check_submit_anyway']);
  assert.deepStrictEqual(B.p1, { pre: '제안서 파일에 이 기관이 아닌 다른 기관의 정식 이름이 ', strong: '28건', post: " 남아 있고, 아직 '의도한 언급'으로 표시하지 않았습니다." });
  assert.strictEqual(B.files.length, 5); assert.strictEqual(B.more, 2); assert.strictEqual(B.firstName, 'f1.pptx');
  assert.strictEqual(B.p3, '점검 못 한 파일 2개, 일부만 점검한 파일 1개도 있습니다.');
  assert.strictEqual(B.p4, '그대로 제출하면 확인하지 않은 건수와 제출한 사람·시각이 기록에 남습니다. 제출하면 영업팀장에게 결재 요청이 갑니다.');
  const B2 = dc.submitModel({ submit_confirm_needed: true, unconfirmed_count: 1, not_checked_count: 0, partial_count: 0, files: [{ name: 'a', unconfirmed_count: 1 }] }, '');
  assert.strictEqual(B2.p3, null); assert.strictEqual(B2.more, 0);
  assert.match(B2.p4, /결재자에게/);
});

test('designer.js: 점검 렌더·모달은 사용자 글을 textContent로만(innerHTML 없음), [object Object] 경로 없음', function () {
  // 점검 렌더뿐 아니라 올리기·삭제·점검 배선·제출창까지(qa 11-23 P3) — '작업물 파일 + 제안서 점검' 머리말부터 파일 끝까지
  const s = DG.indexOf('// ── 작업물 파일 + 제안서 점검'); assert.ok(s > 0);
  const block = DG.slice(s);
  assert.doesNotMatch(block, /innerHTML|insertAdjacentHTML/);
  assert.match(block, /textContent/);
  assert.doesNotMatch(DG, /new Error\(body\.detail/);
  assert.doesNotMatch(DG, /confirm\('제출하면/);
  assert.doesNotMatch(DG, /alert\('제출/);
  assert.match(DG, /doccheck\.headers\(task, st\.model\.button\)/);
  assert.match(DG, /with_context=true/);
});

test('index.html: 점검 자리(#tab-designer)·제출 확인창(body 직계 .dlg)·CSS·script 순서', function () {
  const t = HTML.indexOf('<section id="tab-designer"'); const te = HTML.indexOf('</section>', t);
  const tab = HTML.slice(t, te);
  assert.match(tab, /<h4 class="dc-h">내 작업물 <span id="dc-sum" class="dc-sum"><\/span><\/h4>/);
  assert.match(tab, /올린 pptx·pdf에 이 기관이 아닌 다른 기관의 정식 이름이 있는지 찾습니다\. 찾지 못했다고 다른 기관 이름이 없다는 뜻은 아닙니다\./);
  assert.match(tab, /<details class="dc-lim"><summary>점검이 못 찾는 것<\/summary>/);
  assert.strictEqual((tab.match(/<li>/g) || []).length, 5);
  assert.match(tab, /id="dc-up" class="dc-up" hidden/);
  assert.match(tab, /role="progressbar" aria-label="파일 올리는 중"/);
  assert.match(tab, /파일을 올리고 다른 기관 이름을 찾는 중입니다\. 큰 파일은 20초쯤 걸릴 수 있습니다\./);
  assert.match(tab, /<div id="dc-live" class="sr-only" role="status" aria-live="polite"><\/div>/);
  const m = HTML.indexOf('<div id="dc-submit-modal"'); assert.ok(m > 0);
  const modal = HTML.slice(m, HTML.indexOf('<!-- 순수 로직 -->', m));
  assert.match(modal, /class="dlg dlg--wide" role="alertdialog" aria-modal="true" aria-labelledby="dc-sm-t" aria-describedby="dc-sm-d"/);
  assert.match(modal, /<h2 class="dlg-t" id="dc-sm-t" tabindex="-1"><\/h2>/);
  assert.match(modal, /<button type="button" id="dc-sm-go"><\/button>\s*<span class="dlg-sep" aria-hidden="true"><\/span>\s*<button type="button" id="dc-sm-back" class="dlg-go"><\/button>/);
  assert.match(modal, /<p class="dlg-err" id="dc-sm-err" role="alert"><\/p>/);
  assert.doesNotMatch(modal, /dlg-foot|modal-box/);
  const before = HTML.slice(0, m);
  assert.strictEqual((before.match(/<section\b/g) || []).length, (before.match(/<\/section>/g) || []).length, '모달은 section 밖');
  assert.match(HTML, /\.dc-up\[hidden\] \{ display:none; \}/);
  assert.match(HTML, /\.dc-chip\.open \{ color:var\(--orange\)/);
  assert.doesNotMatch(HTML, /\.dg-at \{ margin-left:auto; \}/);
  const at = function (n) { return HTML.indexOf('<script src="js/' + n + '.js"></script>'); };
  assert.ok(at('doccheck') > 0 && at('doccheck') < at('designer'));
});
