// 공고 상태 기록(NEXT 30 2단계, 2026-11-16): logic.recordView·REC_STATUSES와 noticerec.js(검증·본문·응답 해석·HTML·목록 상태).
// NO_BID(입찰 없음, 연장·지정) = 저장하면 그 회차를 닫는다. 서버 계약(커밋 23394b1): /notice-rounds/current 항목에 round_closed·close_reason_cd.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const nr = require('../js/noticerec.js');
const dash = require('../js/dashboard.js');
const ov = require('../js/overdue.js');
const store = require('../js/store.js');

const ROOT = path.join(__dirname, '..');
const snapOf = (items, today) => ({ byId: items.reduce((m, x) => { m[x.institution_id] = x; return m; }, {}), today: today || '2026-11-16' });
const R = id => ({ institutionId: id });

// ── logic: 상태 표·판정 ───────────────────────────────────────────────
test('REC_STATUSES: 네 상태와 NO_BID 규칙(처리됨·확인일 칸 없음·의견 필수·저장하면 회차를 닫는다는 설명)', () => {
  assert.deepStrictEqual(logic.REC_STATUSES.map(s => s.code), ['IN_PROGRESS', 'CLOSED', 'NO_BID', 'DELAYED']);
  const nb = logic.recStatus('NO_BID');
  assert.strictEqual(nb.label, '입찰 없음(연장·지정)');
  assert.strictEqual(nb.view, 'done'); assert.strictEqual(nb.next, 'hide'); assert.strictEqual(nb.opinion, 'req');
  assert.ok(nb.help.includes('저장하면 이번 회차를 닫습니다.'));
  assert.strictEqual(logic.recStatus('X'), null);
});

test('recordView: 없음·모르는 코드는 미처리, 진행·종료·입찰 없음은 처리됨, 지연은 확인일 기준', () => {
  assert.strictEqual(logic.recordView(R('a'), null).view, 'pending');
  assert.strictEqual(logic.recordView(R('a'), snapOf([])).item, null);
  ['IN_PROGRESS', 'CLOSED', 'NO_BID'].forEach(c => assert.strictEqual(logic.recordView(R('a'), snapOf([{ institution_id: 'a', status_cd: c }])).view, 'done', c));
  assert.strictEqual(logic.recordView(R('a'), snapOf([{ institution_id: 'a', status_cd: 'X' }])).view, 'pending');
  const d = nc => logic.recordView(R('a'), snapOf([{ institution_id: 'a', status_cd: 'DELAYED', next_check_date: nc }]));
  assert.deepStrictEqual([d('2026-11-16').view, d('2026-11-16').checkPassed], ['pending', true]);
  assert.strictEqual(d('2026-11-14').view, 'pending');
  assert.strictEqual(d('2026-11-17').view, 'delayed');
  assert.strictEqual(d('').view, 'pending');
  // snap.today가 인자 todayStr보다 우선한다
  assert.strictEqual(logic.recordView(R('a'), snapOf([{ institution_id: 'a', status_cd: 'DELAYED', next_check_date: '2026-11-20' }], '2026-11-16'), '2026-12-31').view, 'delayed');
});

test('recordView: NO_BID로 닫힌 마지막 회차(round_closed true)도 처리됨으로 센다', () => {
  const rv = logic.recordView(R('a'), snapOf([{ institution_id: 'a', status_cd: 'NO_BID', round_closed: true, close_reason_cd: 'NO_BID' }]));
  assert.strictEqual(rv.view, 'done');
  assert.strictEqual(logic.recordBriefText(rv), '기록: 입찰 없음(연장·지정)');
});

test('splitOverdue·recordBriefText', () => {
  const items = ['n', 'f', 'b', 'p'].map(k => ({ rec: R(k), key: k }));
  const snap = snapOf([{ institution_id: 'f', status_cd: 'DELAYED', next_check_date: '2026-11-30' }, { institution_id: 'b', status_cd: 'NO_BID' },
    { institution_id: 'p', status_cd: 'DELAYED', next_check_date: '2026-11-14' }]);
  const sp = logic.splitOverdue(items, snap);
  assert.deepStrictEqual([sp.pending.map(x => x.key), sp.delayed.map(x => x.key), sp.done.map(x => x.key)], [['n', 'p'], ['f'], ['b']]);
  assert.strictEqual(logic.recordBriefText(logic.recordView(R('f'), snap)), '기록: 지연·재공고 대기 · 다음 확인 11-30');
  assert.strictEqual(logic.recordBriefText(logic.recordView(R('p'), snap)), '기록: 지연·재공고 대기 · 다음 확인일 지남(11-14)');
});

// ── noticerec: 검증·본문 ──────────────────────────────────────────────
test('validate: 판정·의견·다음 확인일 규칙', () => {
  const T = '2026-11-16';
  assert.strictEqual(nr.validate({ status: '', next: '', opinion: '' }, T).status, '판정을 하나 고르세요.');
  assert.ok(nr.validate({ status: 'DELAYED', next: '', opinion: '가' }, T).next);
  assert.ok(nr.validate({ status: 'DELAYED', next: T, opinion: '가' }, T).next.includes('내일 이후'));
  assert.ok(nr.validate({ status: 'DELAYED', next: '2026-02-30', opinion: '가' }, T).next.includes('내일 이후'));
  assert.ok(nr.validate({ status: 'DELAYED', next: nr.ymdPlus(T, 367), opinion: '가' }, T).next.includes('1년 안'));
  assert.deepStrictEqual(nr.validate({ status: 'DELAYED', next: nr.ymdPlus(T, 5), opinion: '가' }, T), {});
  assert.ok(nr.validate({ status: 'CLOSED', next: '', opinion: ' ' }, T).opinion.includes('공고 종료'));
  // 서버 NoticeRoundRules의 문구와 한 글자도 다르지 않다(서버가 정본)
  assert.strictEqual(nr.validate({ status: 'NO_BID', opinion: '' }).opinion, '입찰 없음(연장·지정)으로 적을 때는 의견이 필요합니다. 왜 입찰이 없는지 적으세요.');
  assert.strictEqual(nr.validate({ status: 'NO_BID', next: '', opinion: '' }, T).opinion, '입찰 없음(연장·지정)으로 적을 때는 의견이 필요합니다. 왜 입찰이 없는지 적으세요.');
  assert.strictEqual(nr.validate({ status: 'CLOSED', opinion: '' }).opinion, '공고 종료로 적을 때는 의견이 필요합니다. 무엇을 보고 끝났다고 판단했는지 적으세요.');
  assert.strictEqual(nr.validate({ status: 'DELAYED', next: nr.ymdPlus(T, 5), opinion: '' }, T).opinion, '지연·재공고 대기로 적을 때는 의견이 필요합니다. 왜 늦어지는지 적으세요.');
  assert.ok(nr.validate({ status: 'DELAYED', next: nr.ymdPlus(T, 5), opinion: '' }, T).opinion);
  assert.deepStrictEqual(nr.validate({ status: 'IN_PROGRESS', next: '', opinion: '' }, T), {});
  assert.strictEqual(nr.validate({ status: 'IN_PROGRESS', next: '', opinion: 'x'.repeat(501) }, T).opinion, '의견은 500자까지 적을 수 있습니다(지금 501자).');
  assert.deepStrictEqual(nr.validate({ status: 'NO_BID', next: '이상한값', opinion: '연장' }, T), {});   // 칸이 숨겨져 있어 검사하지 않는다
});

test('body: 확인일 칸이 없는 상태는 next null, 회차 값, 스냅샷 키', () => {
  const it = { date: '2026-11-01', basis: 'cycle', confidence: '확정', overdue: true, days: 15 };
  const b = nr.body({ status: 'NO_BID', next: '2026-12-01', opinion: ' 연장 ' }, { roundSeq: null, baseRev: 0 }, it);
  assert.strictEqual(b.next_check_date, null);
  assert.strictEqual(b.opinion, '연장');
  assert.strictEqual(b.round_seq, null); assert.strictEqual(b.base_rev_no, 0);
  assert.deepStrictEqual(Object.keys(b.snapshot).sort(), ['auto_days', 'auto_kind', 'due_basis', 'due_confirmed', 'due_date']);
  const b2 = nr.body({ status: 'DELAYED', next: '2026-12-01', opinion: 'a' }, { roundSeq: 1, baseRev: 2 }, it);
  assert.deepStrictEqual([b2.round_seq, b2.base_rev_no, b2.next_check_date], [1, 2, '2026-12-01']);
});

test('autoOf: 상태별 kind·days와 새 안내 문구', () => {
  assert.deepStrictEqual([nr.autoOf({ overdue: true, date: 'x', days: 16 }).kind, nr.autoOf({ overdue: true, date: 'x', days: 16 }).days], ['overdue', 16]);
  assert.strictEqual(nr.autoOf({ overdue: true, date: 'x', days: 150, noticeExpired: true }).text, '공고 후 150일 · 결과 공고를 확인하세요');
  assert.strictEqual(nr.autoOf({ notice: true, date: 'x', phase: 'receiving', deadlineDays: 3, since: 2 }).kind, 'receiving');
  assert.strictEqual(nr.autoOf({ notice: true, date: 'x', phase: 'awaiting', receiveTo: '2026-11-01', since: 20 }).kind, 'deadline_passed');
  const u = nr.autoOf({ notice: true, date: 'x', phase: 'unknown', since: 9 });
  assert.strictEqual(u.kind, 'deadline_unknown'); assert.strictEqual(u.text, '공고 있음 · 접수 기간 원문 확인');
  assert.strictEqual(nr.autoOf({ date: 'x', days: 40 }).kind, 'before');
});

test('currentOf: 열린 회차의 최신, stale, NO_BID로 닫힌 회차는 읽기용', () => {
  const lg = (rev, st) => ({ rev_no: rev, status_cd: st });
  const open = nr.currentOf({ rounds: [{ round_seq: 3, open: true, logs: [lg(1, 'DELAYED'), lg(2, 'CLOSED')] }] });
  assert.deepStrictEqual([open.roundSeq, open.baseRev, open.closed], [3, 2, false]);
  const stale = nr.currentOf({ rounds: [{ round_seq: 3, open: true, stale: true, logs: [lg(1, 'DELAYED')] }] });
  assert.deepStrictEqual([stale.roundSeq, stale.baseRev, stale.latest], [null, 0, null]);
  const nb = nr.currentOf({ rounds: [{ round_seq: 4, open: false, close_reason_cd: 'NO_BID', logs: [lg(1, 'NO_BID')] }] });
  assert.deepStrictEqual([nb.closed, nb.roundSeq, nb.baseRev, nb.latest.status_cd], [true, null, 0, 'NO_BID']);
  assert.deepStrictEqual(nr.blankDraft(nb), { status: '', next: '', opinion: '' });   // 닫힌 회차는 초안에 옮기지 않는다
});

// ── noticerec: 저장 응답 ──────────────────────────────────────────────
test('outcome: 응답별 종류, 저장 응답의 round_closed는 closed로 전달된다', () => {
  const o201 = nr.outcome({ status: 201, body: { handler_name: '김영업', handled_at: '2026-11-16T10:00:00', round_closed: true } });
  assert.strictEqual(o201.kind, 'saved'); assert.strictEqual(o201.closed, true);
  assert.strictEqual(nr.outcome({ status: 201, body: { handler_name: '김영업', handled_at: '2026-11-16T10:00:00' } }).closed, false);
  assert.strictEqual(nr.outcome({ status: 200, body: { saved: false } }).kind, 'nochange');
  const f = nr.outcome({ status: 400, body: { detail: { field: 'opinion', message: '개인정보' } } });
  assert.deepStrictEqual([f.kind, f.field, f.msg], ['field', 'opinion', '개인정보']);
  assert.strictEqual(nr.outcome({ status: 400, body: { detail: { message: 'm' } } }).kind, 'alert');
  assert.strictEqual(nr.outcome({ status: 403, body: null }).recheck, true);
  const st = nr.outcome({ status: 409, body: { detail: { code: 'STALE', latest: { handler_name: '김영업', handled_at: '2026-11-16T09:00', status_cd: 'CLOSED' } } } });
  assert.ok(st.kind === 'stale' && st.reload && st.msg.includes('김영업이 먼저 기록했습니다') && st.msg.includes('공고 종료'));
  assert.strictEqual(nr.outcome({ status: 409, body: { detail: { code: 'ROUND_CHANGED', message: '회차가 바뀌었습니다' } } }).msg, '회차가 바뀌었습니다');
  const c = nr.outcome({ status: 409, body: { detail: { code: 'ACTIVE_PREP_CONFIRM_REQUIRED', prep_state_cd: 'PREPARING' } } });
  assert.deepStrictEqual([c.kind, c.prep], ['confirm', 'PREPARING']);
  assert.strictEqual(nr.outcome({ status: 500, body: null }).kind, 'alert');
});

// ── noticerec: HTML ───────────────────────────────────────────────────
test('sectionHtml: 연결 상태별, 읽기 전용, 입력 칸, NO_BID·DELAYED 선택, 오류, 확인 블록', () => {
  const it = { date: '2026-11-01', overdue: true, days: 15, notice: false };
  assert.ok(nr.sectionHtml(it).includes('서버에 연결하면 공고 상태 기록을 보고 적을 수 있습니다.'));
  assert.ok(nr.sectionHtml(it, { state: 'loading' }).includes('aria-busy="true"'));
  assert.ok(nr.sectionHtml(it, { state: 'error' }).includes('id="db-rec-retry"'));
  assert.ok(nr.sectionHtml(it, { state: 'denied', code: 403 }).includes('권한이 없습니다'));
  const ro = nr.sectionHtml(it, { state: 'ok', canEdit: false, rv: { view: 'pending' } });
  assert.ok(ro.includes('공고 상태는 영업팀이 기록합니다.') && !ro.includes('id="db-rec-save"') && ro.includes('이 회차는 미처리로 셉니다.'));
  const ed = nr.sectionHtml(it, { state: 'ok', canEdit: true, who: '홍길동', today: '2026-11-16' });
  assert.strictEqual((ed.match(/name="rec-state"/g) || []).length, 4);
  assert.ok(ed.includes('입찰 없음(연장·지정)') && ed.includes('id="db-rec-save"') && ed.includes('기록자 홍길동(로그인 사용자)'));
  const nb = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', draft: { status: 'NO_BID', next: '', opinion: '' } });
  assert.ok(!nb.includes('id="db-rec-next"') && nb.includes('담당자 의견<span class="req">(필수)</span>') && nb.includes('저장하면 이번 회차를 닫습니다.'));
  const dl = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', draft: { status: 'DELAYED', next: '', opinion: '' } });
  assert.ok(dl.includes('다음 확인일<span class="req">(필수)</span>') && dl.includes('min="2026-11-17"'));
  const er = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', draft: { status: 'CLOSED', next: '', opinion: '' }, errs: { opinion: '의견을 적으세요.' } });
  assert.ok(er.includes('aria-invalid="true"') && er.includes('의견을 적으세요.'));
  const cf = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', draft: { status: 'CLOSED', next: '', opinion: 'a' }, cf: { stage: '사전준비' } });
  assert.ok(cf.includes('id="db-rec-cf-yes"') && cf.includes('진행 중인 제안(사전준비 단계)이 있습니다.'));
  // N-3: 목록(current) 요청이 실패·거부면 '영업팀이 기록합니다'가 아니라 불러오지 못했다고 말한다
  [['error', 0, '공고 상태 목록을 불러오지 못해 기록 칸을 열지 않았습니다. 화면을 새로 고치세요.'],
    ['denied', 401, '로그인이 필요합니다. 다시 로그인하면 기록 칸이 열립니다.'],
    ['denied', 403, '기록 권한을 확인하지 못했습니다. 로그인 사번과 권한을 확인하세요.']].forEach(function (c) {
    const f = nr.sectionHtml(it, { state: 'ok', canEdit: false, listState: c[0], listCode: c[1], rv: { view: 'pending' } });
    assert.ok(f.includes(c[2]) && !f.includes('영업팀이 기록합니다') && !f.includes('id="db-rec-save"'), c[0] + c[1]);
  });
  assert.ok(nr.sectionHtml(it, { state: 'ok', canEdit: false, listState: 'ok', rv: { view: 'pending' } }).includes('공고 상태는 영업팀이 기록합니다.'));
});

const NBHIST = (seq, extra) => ({ rounds: [Object.assign({ round_seq: seq, open: false, close_reason_cd: 'NO_BID', logs: [{ rev_no: 1, status_cd: 'NO_BID', handler_name: '김영업', handled_at: '2026-11-16T09:00' }] }, extra || {})] });

test('sectionHtml: current에 NO_BID·round_closed가 있으면 안내 한 줄만(입력 칸 없음), 요약에 닫힘 표시', () => {
  const it = { date: '2026-11-01', overdue: true, days: 15 };
  const item = { institution_id: 'a', status_cd: 'NO_BID', round_closed: true };
  const h = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', cur: nr.currentOf(NBHIST(4)), rv: { view: 'done', item: item } });
  assert.ok(h.includes('입찰 없음(연장·지정)') && h.includes('이번 회차는 닫혔습니다') && !h.includes('미처리로 셉니다'));
  assert.ok(h.includes('id="db-rec-closed"') && (h.includes('이번 회차는 &#39;입찰 없음&#39;으로 닫혔습니다') || h.includes("이번 회차는 '입찰 없음'으로 닫혔습니다. 기관 정보에서 다음 입찰 예정일이 바뀌면 새 회차를 적을 수 있습니다.")));
  assert.ok(!h.includes('id="db-rec-save"') && !h.includes('name="rec-state"'));
});

test('sectionHtml: 서버가 current에서 뺀(자료가 넘어간) 옛 NO_BID 회차는 닫힘이 아니라 새 회차 입력 칸, 옛 회차는 요약에 안 나온다', () => {
  const it = { date: '2027-03-01', overdue: true, days: 3 };
  const hist = { rounds: [{ round_seq: 5, open: true, stale: true, logs: [{ rev_no: 1, status_cd: 'DELAYED' }] }, NBHIST(4).rounds[0]] };
  const cur = nr.currentOf(hist);
  assert.deepStrictEqual([cur.roundSeq, cur.baseRev], [null, 0]);
  const h = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16', cur: cur, rv: { view: 'pending', item: null } });
  assert.ok(h.includes('id="db-rec-save"') && !h.includes('db-rec-closed') && !h.includes('이번 회차는 닫혔습니다'));
});

test('currentOf: 가장 큰 회차만 본다(오래된 열린 회차·예전 NO_BID와 섞지 않는다)', () => {
  const lg = [{ rev_no: 2, status_cd: 'CLOSED' }];
  const a = nr.currentOf({ rounds: [{ round_seq: 3, open: true, logs: lg }, { round_seq: 5, open: false, close_reason_cd: 'NO_BID', logs: [{ rev_no: 1, status_cd: 'NO_BID' }] }] });
  assert.deepStrictEqual([a.closed, a.roundSeq], [true, null]);
  const b = nr.currentOf({ rounds: [{ round_seq: 3, open: false, close_reason_cd: 'NO_BID', logs: [{ rev_no: 1, status_cd: 'NO_BID' }] }, { round_seq: 6, open: true, logs: lg }] });
  assert.deepStrictEqual([b.closed, b.roundSeq, b.baseRev], [false, 6, 2]);
});

test('outcome: 409 NO_BID_CLOSED는 같은 안내 문구와 다시 불러오기', () => {
  const o = nr.outcome({ status: 409, body: { detail: { code: 'NO_BID_CLOSED' } } });
  assert.deepStrictEqual([o.kind, o.reload, o.msg], ['alert', true, nr.CLOSED_LINE]);
  assert.ok(nr.CLOSED_LINE.startsWith('이번 회차는 \'입찰 없음\'으로 닫혔습니다.'));
});

test('sectionHtml: 판정 줄은 전체 폭(full), 권한 없음 문구에 숫자 없음, 제목 날짜는 span.d, 공고 자료 \'미상\'', () => {
  const it = { date: '2026-11-01', overdue: true, days: 15 };
  const ed = nr.sectionHtml(it, { state: 'ok', canEdit: true, today: '2026-11-16' });
  assert.ok(ed.includes('class="l full" id="db-rec-state-l"') && ed.includes('<div class="full"><div class="db-rec-seg"'));
  assert.ok(ed.includes('<span class="d">2026-11-01</span>'));
  assert.ok(!/\(403\)|\(401\)/.test(nr.sectionHtml(it, { state: 'denied', code: 403 })));
  assert.ok(nr.autoOf({ unknown: true }).text.includes('미상'));
});

test('isClosed: NO_BID이고 round_closed true일 때만', () => {
  assert.strictEqual(nr.isClosed({ status_cd: 'NO_BID', round_closed: true }), true);
  assert.strictEqual(nr.isClosed({ status_cd: 'NO_BID', round_closed: false }), false);
  assert.strictEqual(nr.isClosed({ status_cd: 'CLOSED', round_closed: true }), false);
  assert.strictEqual(nr.isClosed(null), false);
});

test('dash.recordBriefHtml: 기록 권한이 없으면 버튼 이름이 \'보기\'', () => {
  const it = { key: 'k', name: 'k', rec: R('k') };
  assert.ok(dash.recordBriefHtml(it, { state: 'ok', snap: snapOf([]), canGo: true, canEdit: true }).includes('입찰 공고 현황에서 기록'));
  assert.ok(dash.recordBriefHtml(it, { state: 'ok', snap: snapOf([]), canGo: true, canEdit: false }).includes('입찰 공고 현황에서 보기'));
});

test('사번이 바뀌면 dashboard 초안·이력을 버린다(A 초안 → B 로그인 → 빈 폼)', () => {
  let emp = '1111111';
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp }) }, fetch: () => okRes({ items: [] }) };
  const st = dash.recState();
  dash.recGuard();                                   // 처음 사번 기록
  st.drafts.a = { status: 'CLOSED', next: '', opinion: 'A의 의견' };
  st.rec.id = 'a';
  assert.strictEqual(dash.recGuard(), false);
  assert.ok(st.drafts.a);
  emp = '2222222';
  assert.strictEqual(dash.recGuard(), true);
  assert.deepStrictEqual(st.drafts, {});
  assert.strictEqual(st.rec.id, '');
  const h = nr.sectionHtml({ date: '2026-11-01', overdue: true, days: 1 }, { state: 'ok', canEdit: true, today: '2026-11-16', draft: st.drafts.a || null });
  assert.ok(!h.includes('A의 의견'));
  nr.env = {};
});

test('load: 응답이 없으면 제한 시간 뒤 error로 끝나 진행한다', async () => {
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp: '4444444' }) }, fetch: () => new Promise(() => {}) };
  const keep = nr.TIMEOUT_MS; nr.TIMEOUT_MS = 20;
  await nr.load();
  assert.strictEqual(nr.state(), 'error');
  nr.TIMEOUT_MS = keep; nr.env = {};
});

test('배지·팝업·경과 탭 미처리 수가 같은 기준(전체 기관·실시간 오늘)', () => {
  const recs = [Object.assign({ name: 'x1', region: '11', type: '지자체', contractEnd: '2026-01-01', confirmed: false }, R('x1')),
    Object.assign({ name: 'x2', region: '11', type: '지자체', contractEnd: '2026-01-02', confirmed: false }, R('x2'))];
  const t = new Date(2026, 10, 17);
  const viaOv = logic.splitOverdue(logic.overdueSummary(recs, t).items, null, '').pending.length;
  const viaDash = logic.splitOverdue(dash.model(recs, t).overdue, null, '').pending.length;
  assert.strictEqual(viaOv, viaDash);
  assert.strictEqual(viaDash, 2);
  const td = ov.today();
  assert.deepStrictEqual([td.getHours(), td.getMinutes()], [0, 0]);
  const src = fs.readFileSync(path.join(ROOT, 'js/overdue.js'), 'utf8');
  assert.ok(!/activeRegions/.test(src.replace(/\/\/.*$/gm, '')), '배지·팝업이 지도 활성 지역으로 거르지 않는다');
});

test('sectionHtml: 사용자·서버 글자는 이스케이프', () => {
  const it = { date: '2026-11-01', overdue: true, days: 15 };
  const hist = { rounds: [{ round_seq: 1, open: true, logs: [{ rev_no: 1, status_cd: 'CLOSED', opinion: '<img onerror=1>', handler_name: '<b>', handled_at: '2026-11-16T09:00' }] }] };
  const h = nr.sectionHtml(it, { state: 'ok', canEdit: false, hist: hist, cur: nr.currentOf(hist) });
  assert.ok(!h.includes('<img onerror') && !h.includes('<b>') && h.includes('&lt;img'));
});

// ── noticerec: 목록 상태(가짜 fetch) ──────────────────────────────────
const okRes = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
test('load: current 응답을 snap·canEdit에 반영하고, NO_BID 닫힌 항목도 처리됨으로 나온다', async () => {
  let emp = '3918264';
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp }) },
    fetch: () => okRes({ today: '2026-11-16', can_edit: true, items: [{ institution_id: 'a', status_cd: 'NO_BID', round_closed: true, close_reason_cd: 'NO_BID' }, { institution_id: 'b', status_cd: 'DELAYED', next_check_date: '2026-12-01' }] }) };
  assert.strictEqual(nr.state(), 'idle');
  let n = 0; const off = nr.onChange(() => { n += 1; });
  await nr.load();
  assert.strictEqual(nr.state(), 'ok'); assert.strictEqual(nr.canEdit(), true); assert.strictEqual(n, 1);
  assert.strictEqual(logic.recordView(R('a'), nr.snap()).view, 'done');
  assert.strictEqual(logic.recordView(R('b'), nr.snap()).view, 'delayed');
  assert.strictEqual(logic.recordView(R('c'), nr.snap()).view, 'pending');
  // 사용자가 바뀌면 앞 사람의 값을 버린다
  emp = '1111111';
  assert.strictEqual(nr.state(), 'idle'); assert.strictEqual(nr.snap(), null);
  off();
  nr.env = { store: { isServerMode: () => false, loadSession: () => ({ emp }) } };
  assert.strictEqual(nr.state(), 'offline');
});

test('load: 401·403은 denied, 실패 뒤 ensure는 자동 재시도하지 않는다', async () => {
  let calls = 0;
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp: '2222222' }) }, fetch: () => { calls += 1; return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }); } };
  await nr.load();
  assert.strictEqual(nr.state(), 'denied'); assert.strictEqual(calls, 1);
  await nr.ensure();
  assert.strictEqual(calls, 1);
  nr.env = {};
});

// ── dashboard·overdue 연결 ────────────────────────────────────────────
test('dash.rowHtml 경과 행: 지연(미래)은 윤곽 도장, 처리됨은 잉크 도장·data-rec, 기록 없음은 그대로', () => {
  const it = (id) => ({ key: id, name: '기관' + id, overdue: true, days: 16, region: '11', date: '2026-10-31', rec: R(id) });
  const snap = snapOf([{ institution_id: 'd', status_cd: 'DELAYED', next_check_date: '2026-12-01' }, { institution_id: 'n', status_cd: 'NO_BID' }]);
  const d = dash.rowHtml(it('d'), { id: 'x', snap: snap });
  assert.ok(d.includes('ov-stamp is-line') && d.includes('data-rec="delayed"') && d.includes('기록: 지연·재공고 대기 · 다음 확인 '));
  const n = dash.rowHtml(it('n'), { id: 'x', snap: snap });
  assert.ok(n.includes('ov-stamp is-plain') && n.includes('data-rec="done"') && n.includes('기록: 입찰 없음(연장·지정)'));
  const p = dash.rowHtml(it('p'), { id: 'x', snap: snap });
  assert.ok(p.includes('<span class="ov-stamp">D+16</span>') && !p.includes('data-rec'));
});

test('dash.ovViewHtml·ovGuide·ovEmpty·recordBriefHtml', () => {
  const v = dash.ovViewHtml('done', { pending: 2, delayed: 1, done: 3 });
  assert.strictEqual((v.match(/name="db-ov"/g) || []).length, 3);
  assert.ok(v.includes('처리됨 <b>3</b>') && v.includes('value="done" checked'));
  assert.ok(dash.ovGuide('pending', { state: 'ok', canEdit: false }).includes('영업팀이 기록합니다.'));
  assert.ok(dash.ovGuide('pending', { state: 'offline' }).includes('서버에 연결하면 기록 상태가 보입니다.'));
  assert.ok(dash.ovGuide('done', { state: 'ok' }).includes('입찰 없음'));
  assert.ok(dash.ovEmpty('done').includes('입찰 없음'));
  const it = { key: 'k', name: 'k', rec: R('k') };
  const b = dash.recordBriefHtml(it, { state: 'ok', snap: snapOf([{ institution_id: 'k', status_cd: 'CLOSED', handler_name: '김영업', handled_at: '2026-11-16T09:00:00' }]), canGo: true });
  assert.ok(b.includes('공고 종료') && b.includes('김영업') && b.includes('id="dm-rec-go"'));
  assert.ok(dash.recordBriefHtml(it, { state: 'offline' }).includes('서버에 연결하면 보입니다.'));
});

test('ov.listHtml·itemHtml: ctx.snap이 있으면 보기별로 나누고 전체 보기에는 상태 글자, 없으면 모두 미처리', () => {
  const mk = (id, d) => Object.assign({ name: id, region: '11', type: '지자체', contractEnd: d, confirmed: false }, R(id));
  const summary = logic.overdueSummary([mk('a', '2026-10-01'), mk('b', '2026-10-02'), mk('c', '2026-10-03')], new Date('2026-11-09T00:00:00'));
  assert.strictEqual(summary.items.length, 3);
  const snap = snapOf([{ institution_id: 'b', status_cd: 'NO_BID' }, { institution_id: 'c', status_cd: 'DELAYED', next_check_date: '2026-12-01' }]);
  const done = ov.listHtml(summary, 'done', { snap: snap });
  assert.ok(done.includes('data-state="done"') && !done.includes('data-state="pending"'));
  const all = ov.listHtml(summary, 'all', { snap: snap });
  assert.ok(all.includes('>미처리<') && all.includes('>지연·재공고 대기<') && all.includes('>처리됨<'));
  const none = ov.listHtml(summary, 'pending', {});
  assert.strictEqual((none.match(/class="ov-item"/g) || []).length, 3);
  const pop = ov.popupParts(summary, [], '2026-11-16', 'map', { snap: snap });
  assert.ok(pop.listHtml.includes('data-state="done"'));
});

// ── nr.save 헤더(가짜 fetch) ──────────────────────────────────────────
test('save: confirmed true면 X-Button-Id save_confirmed, false면 save, 화면 id는 bid_notice, 본문·경로·POST', async () => {
  const calls = [];
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp: '6000001' }) },
    fetch: (url, opt) => { calls.push({ url, opt }); return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ handler_name: '김영업' }) }); } };
  const body = { round_seq: null, base_rev_no: 0, status_cd: 'CLOSED', opinion: '끝', next_check_date: null };
  const r1 = await nr.save('a/b', body, true);
  const r2 = await nr.save('a/b', body, false);
  const r3 = await nr.save('a/b', body);
  nr.env = {};
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0].url, '/institutions/a%2Fb/notice-rounds/judgments');
  assert.strictEqual(calls[0].opt.method, 'POST');
  assert.strictEqual(calls[0].opt.headers['X-Button-Id'], 'save_confirmed');
  assert.strictEqual(calls[1].opt.headers['X-Button-Id'], 'save');
  assert.strictEqual(calls[2].opt.headers['X-Button-Id'], 'save');
  calls.forEach(c => { assert.strictEqual(c.opt.headers['X-Screen-Id'], 'bid_notice'); assert.strictEqual(c.opt.headers['Content-Type'], 'application/json'); assert.deepStrictEqual(JSON.parse(c.opt.body), body); });
  assert.deepStrictEqual([r1.status, r1.body.handler_name], [201, '김영업']);
  assert.strictEqual(r2.status, 201); assert.strictEqual(r3.status, 201);
});

// ── overdue: 배지·팝업 보류(가짜 fetch·가짜 세션) ──────────────────────
test('ov.waiting·ov.count: 서버 연결 중 첫 목록을 받는 동안은 대기, 값은 parts.pending 길이', async () => {
  const keepParts = ov.state.parts, keepSum = ov.state.summary, keepT = nr.TIMEOUT_MS;
  nr.TIMEOUT_MS = 20;
  nr.env = {};
  assert.strictEqual(ov.waiting(), false);                          // 서버 미연결(offline)은 기다리지 않는다
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp: '6000002' }) }, fetch: () => new Promise(() => {}) };
  assert.strictEqual(ov.waiting(), true);                           // idle
  const p = nr.load();
  assert.strictEqual(nr.state(), 'loading');
  assert.strictEqual(ov.waiting(), true);
  ov.state.parts = { pending: [{}, {}, {}], delayed: [{}], done: [] };
  ov.state.summary = { items: [{}, {}, {}, {}, {}] };
  assert.strictEqual(ov.count(), 3);                                // 경과 전체(5)가 아니라 미처리(3)
  // loading 중에는 사이드바 배지가 없고, 받은 뒤에는 미처리 3건 배지가 붙는다
  const btn = { dataset: { nav: require('../js/nav.js').NOTICE_ID }, title: '', html: '', querySelector: sel => sel === '.nav-label' ? { textContent: '입찰 공고 현황' } : null, querySelectorAll: () => [], insertAdjacentHTML(pos, h) { this.html += h; } };
  global.document = { querySelectorAll: () => [btn] };
  try {
    ov.paintNavBadge();
    assert.strictEqual(btn.html, '');
    await p;
    assert.strictEqual(nr.state(), 'error'); assert.strictEqual(ov.waiting(), false);
    ov.paintNavBadge();
    assert.ok(btn.html.includes('nav-count') && btn.html.includes('>3<') && btn.title.includes('미처리 3건'));
  } finally { delete global.document; }
  ov.state.parts = null;
  assert.strictEqual(ov.count(), 5);                                // refresh 전에는 경과 전체
  ov.state.summary = null;
  assert.strictEqual(ov.count(), 0);
  ov.state.parts = keepParts; ov.state.summary = keepSum; nr.TIMEOUT_MS = keepT; nr.env = {};
});

function onLoginHarness(emp, items, session) {
  const keep = { refresh: ov.refresh, count: ov.count, showPopup: ov.showPopup, load: store.loadSession };
  const h = { fetches: 0, popups: 0, session: session || { mode: 'account', id: 'u', emp } };
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp }) },
    fetch: () => { h.fetches += 1; return okRes({ today: '2026-11-17', can_edit: true, items: items || [] }); } };
  store.loadSession = () => h.session;
  ov.refresh = () => {};
  ov.count = () => h.count;
  ov.showPopup = () => { h.popups += 1; return true; };
  h.count = 0;
  h.restore = () => { Object.assign(ov, { refresh: keep.refresh, count: keep.count, showPopup: keep.showPopup }); store.loadSession = keep.load; nr.env = {}; };
  return h;
}

test('onLogin: 기록을 한 번 받은 뒤에 판정하고, 미처리 0이면 팝업이 없고 1 이상이면 뜬다', async () => {
  const h = onLoginHarness('6000003');
  try {
    assert.strictEqual(ov.onLogin({ master: true }, 'u'), false);   // 받는 동안은 팝업 보류
    assert.strictEqual(h.popups, 0);
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(h.fetches, 1);                                // 요청은 한 번
    assert.strictEqual(h.popups, 0);                                 // 미처리 0
    h.count = 2;
    ov.onLogin({ master: true }, 'u-no-skip-' + Date.now());
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(h.popups, 1);
    assert.strictEqual(h.fetches, 2);
  } finally { h.restore(); }
});

test('onLogin: 기다리는 동안 로그아웃하거나 다른 사번이 로그인하면 팝업을 판정하지 않는다', async () => {
  const h = onLoginHarness('6000004');
  try {
    h.count = 3;
    ov.onLogin({ master: true }, 'u-out-' + Date.now());
    h.session = null;                                                // 대기 중 로그아웃
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(h.popups, 0);
    h.session = { mode: 'account', id: 'u', emp: '6000004' };
    ov.onLogin({ master: true }, 'u-swap-' + Date.now());
    h.session = { mode: 'account', id: 'v', emp: '6000005' };        // 대기 중 다른 사번 로그인
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(h.popups, 0);
    h.session = { mode: 'account', id: 'u', emp: '6000004' };        // 같은 사번이면 뜬다
    ov.onLogin({ master: true }, 'u-same-' + Date.now());
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(h.popups, 1);
  } finally { h.restore(); }
});

// ── 소스 단언 ─────────────────────────────────────────────────────────
test('소스 규칙: confirm()·외부 주소·새 hex·1인칭 없음, 서버 글자는 innerHTML에 직접 넣지 않는다', () => {
  ['noticerec.js', 'overdue.js', 'dashboard.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');   // 주석 뺀 코드만
    assert.ok(!/[^.\w]confirm\(/.test(src), f + ' confirm()');
    if (f !== 'dashboard.js') assert.ok(!/https?:\/\//.test(src), f + ' 외부 주소');
  });
  const nsrc = fs.readFileSync(path.join(ROOT, 'js/noticerec.js'), 'utf8');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(nsrc), 'noticerec.js hex');
  assert.ok(!/우리/.test(nsrc), '1인칭');
});

test('index.html: noticerec.js는 logic.js 뒤·dashboard.js 앞, CSS 블록에 새 hex·11px 미만·opacity 없음', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('<script src="js/noticerec.js"></script>');
  assert.ok(a > html.indexOf('<script src="js/logic.js"></script>') && a < html.indexOf('<script src="js/dashboard.js"></script>'));
  const s = html.indexOf('/* 공고 상태 기록(noticerec.js) 시작'), e = html.indexOf('/* 공고 상태 기록 끝 */');
  assert.ok(s > 0 && e > s);
  const css = html.slice(s, e);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), '새 hex');
  assert.ok(!/opacity/.test(css.replace(/\.db-rec-seg input \{[^}]*\}/, '')), 'opacity');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(m => assert.ok(+/(\d+)/.exec(m)[1] >= 11, m));
});

function idsOf(h) { const s = new Set(); h.replace(/ id="([^"]+)"/g, (m, i) => { s.add(i); return m; }); return s; }
function refsOf(h) { const r = []; h.replace(/ (?:for|aria-labelledby|aria-describedby)="([^"]+)"/g, (m, v) => { v.split(/\s+/).forEach(x => r.push(x)); return m; }); return r; }
const IT = { date: '2026-11-01', overdue: true, days: 15 };
const FULL = (idp) => [
  nr.sectionHtml(IT, { state: 'ok', canEdit: true, today: '2026-11-16', idp: idp, nested: true, err: '충돌', draft: { status: 'DELAYED', next: '', opinion: '' }, errs: { status: 's', next: 'n', opinion: 'o' } }),
  nr.sectionHtml(IT, { state: 'ok', canEdit: true, today: '2026-11-16', idp: idp, nested: true, draft: { status: 'CLOSED', next: '', opinion: 'a' }, cf: { stage: '사전준비' } })];

test('idp: 접두사가 모든 id·for·aria·라디오 name에 붙고, 참조는 같은 html 안의 id를 가리킨다', () => {
  FULL('dm-').forEach(h => {
    const ids = idsOf(h);
    assert.ok([...ids].every(i => i.startsWith('dm-db-rec')), [...ids].join());
    refsOf(h).forEach(r => assert.ok(ids.has(r), '참조 ' + r));
    assert.ok(!/ id="db-rec|for="db-rec|name="rec-state"/.test(h));
  });
  const h = nr.sectionHtml(IT, { state: 'ok', canEdit: true, today: '2026-11-16', idp: 'dm-', nested: true });
  assert.strictEqual((h.match(/name="dm-rec-state"/g) || []).length, 4);
  assert.ok(h.includes('id="dm-db-rec-save"') && h.includes('<h4 id="dm-db-rec-h">') && h.startsWith('<div class="db-rec" id="dm-db-rec">'));
});

test('idp 기본값 \'\'은 기존 id 그대로(회귀), 두 절의 id는 겹치지 않는다', () => {
  const a = FULL(undefined)[0], b = FULL('dm-')[0];
  ['db-rec', 'db-rec-form', 'db-rec-state-l', 'db-rec-state-help', 'db-rec-state-err', 'db-rec-next', 'db-rec-op', 'db-rec-alert'].forEach(i => assert.ok(idsOf(a).has(i), i));
  assert.deepStrictEqual([...idsOf(a)].filter(i => idsOf(b).has(i)), []);
  assert.strictEqual(FULL('')[0], a);
  assert.ok(FULL('dm-')[1].includes('id="dm-db-rec-cf-yes"') && FULL('dm-')[1].includes('id="dm-db-rec-cf-no"'));
});

test('idp: 보기 전용·목록 오류·닫힘·불러오기 실패 모양도 접두사를 쓴다', () => {
  const ro = nr.sectionHtml(IT, { state: 'ok', canEdit: false, idp: 'dm-', nested: true, rv: { view: 'pending' } });
  assert.ok(ro.includes('<dt>공고 자료</dt>') && ro.includes('이 회차는 미처리로 셉니다.') && ro.includes('공고 상태는 영업팀이 기록합니다.') && !ro.includes('rec-save') && !ro.includes('<textarea'));
  assert.ok(nr.sectionHtml(IT, { state: 'error', idp: 'dm-' }).includes('id="dm-db-rec-retry"'));
});

test('outcome: 401·403은 auth:true(팝업이 위쪽 알림 줄로), 409 STALE·400은 아니다', () => {
  assert.strictEqual(nr.outcome({ status: 401, body: null }).auth, true);
  assert.strictEqual(nr.outcome({ status: 403, body: null }).auth, true);
  assert.ok(!nr.outcome({ status: 409, body: { detail: { code: 'STALE' } } }).auth);
  assert.ok(!nr.outcome({ status: 400, body: { detail: { message: 'm' } } }).auth);
});

test('save: 4번째 인자가 있으면 X-Screen-Id가 그 값, 없으면 bid_notice', async () => {
  const calls = [];
  nr.env = { store: { isServerMode: () => true, loadSession: () => ({ emp: '6000009' }) }, fetch: (u, o) => { calls.push(o); return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) }); } };
  await nr.save('a', {}, false, 'map_popover'); await nr.save('a', {}, false);
  nr.env = {};
  assert.strictEqual(calls[0].headers['X-Screen-Id'], 'map_popover'); assert.strictEqual(calls[1].headers['X-Screen-Id'], 'bid_notice');
});
