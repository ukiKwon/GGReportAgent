// 금고 약정(NEXT 89): 상세 절 갈래·escape·표지, 변경 창 검사·본문, 요청·응답 해석, 배선.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const bc = require('../js/bankcontract.js');
const dash = require('../js/dashboard.js');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L = o => Object.assign({ contract_no: 1, rev_no: 1, origin_cd: 'MANUAL', rank_cd: 'FIRST', bank_cd: 'B02', bank_name: '신한은행', bank_name_etc: null,
  term_from: '2023-01-01', term_to: '2026-12-31', term_state: 'CURRENT', src_kind: 'LINK', src_url: 'https://www.gangnam.go.kr/a', src_no: null,
  checked_date: '2026-11-10', checked_dept: null, note: '', account_cd: null, account_name: null, account_etc: null, overlap_confirmed: false,
  overlap_with: [], editor_name: '이영업', emp_verified: true, saved_at: '2026-11-16T10:00:00' }, o || {});
const CODES = { banks: [{ code: 'B02', name: '신한은행' }, { code: 'ETC', name: '기타' }], ranks: [{ code: 'FIRST', name: '1금고' }, { code: 'SECOND', name: '2금고' }],
  src_kinds: [{ code: 'LINK', name: '공고·문서 링크' }, { code: 'DOC_NO', name: '문서·공고 번호' }, { code: 'PRESS', name: '언론 보도' }, { code: 'STAFF', name: '담당자 확인' }],
  cancel_reasons: [{ code: 'WRONG', name: '잘못 입력' }, { code: 'ETC', name: '기타' }], accounts: [] };
const V = (lines, extra) => ({ st: 'ok', code: 0, histOpen: false, histSt: 'idle', hist: null,
  data: Object.assign({ lines: lines, history_count: lines.length, can_edit: true, today: '2026-11-17', codes: CODES }, extra || {}) });
const LEG = { legacyDl: '<dl class="db-dl"><dt>금고 은행</dt><dd><span class="pop-unk">미확인</span></dd></dl>', legacyNote: '<p class="db-empty">LEGACY</p>' };

test('plan: CURRENT 직접 > 수집값 > PAST 직접(만료) > 미확인', () => {
  assert.strictEqual(bc.plan([L()], true).mode, 'direct');
  const past = L({ term_state: 'PAST', term_to: '2022-12-31' });
  const withCol = bc.plan([past], true);
  assert.deepStrictEqual([withCol.mode, withCol.rows.length], ['legacy', 1]);
  const only = bc.plan([past], false);
  assert.deepStrictEqual([only.mode, only.noCur, only.rows.length], ['direct', true, 1]);
  assert.deepStrictEqual([bc.plan([], false).mode, bc.plan([], false).rows.length], ['legacy', 0]);
});

test('sectionHtml: 직접 입력 줄 — 칩·약정·출처·확인일·입력자, 기존 갈래는 대체', () => {
  const h = bc.sectionHtml(V([L()]), LEG);
  assert.ok(h.includes('id="db-bank"') && h.includes('<dt>1금고</dt>') && h.includes('신한은행') && h.includes('wf-badge pp-neutral">직접 입력'));
  assert.ok(h.includes('약정 <span class="v">2023-01-01 ~ 2026-12-31</span>') && h.includes('gangnam.go.kr') && h.includes('확인일 <span class="v">2026-11-10</span>'));
  assert.ok(h.includes('입력 이영업 · <span class="v">11-16</span>') && !h.includes('LEGACY'));
  assert.ok(h.includes('id="bk-edit">금고 약정 고치기'));
});

test('sectionHtml: srcHtml 선택 인자 — 없으면 출력 그대로, 있으면 note·state 뒤 foot 앞 1회', () => {
  const base = bc.sectionHtml(V([L()]), LEG);
  assert.strictEqual(bc.sectionHtml(V([L()]), Object.assign({ srcHtml: '' }, LEG)), base);
  assert.ok(base.indexOf('bk-src') < 0);
  [V([L()]), V([]), { st: 'error', code: 500 }, { st: 'loading' }].forEach(v => {
    const h = bc.sectionHtml(v, Object.assign({ srcHtml: '<span class="hb-src">S</span>' }, LEG));
    assert.strictEqual((h.match(/bk-src/g) || []).length, 1);
    const i = h.indexOf('<p class="db-empty bk-src"><span class="hb-src">S</span></p>');
    assert.ok(i > h.indexOf('</dl>'));
    if (h.indexOf('class="bk-foot"') >= 0) assert.ok(i < h.indexOf('class="bk-foot"'));
    assert.ok(h.endsWith('</div>'));
  });
});

test('sectionHtml: 약정 시작이 없으면 약정 끝만, FUTURE는 n년부터, UNKNOWN은 미확인', () => {
  assert.ok(bc.sectionHtml(V([L({ term_from: null })]), LEG).includes('약정 끝 <span class="v">2026-12-31</span>'));
  assert.ok(bc.sectionHtml(V([L(), L({ contract_no: 2, term_state: 'FUTURE', term_from: '2027-01-01', term_to: '2030-12-31' })]), LEG).includes('<dt>2027년부터</dt>'));
  assert.ok(bc.sectionHtml(V([L({ term_state: 'UNKNOWN' })]), LEG).includes('약정 기간 <span class="pop-unk">미확인</span>'));
});

test('sectionHtml: 수집 기록과 같음/다름(색만으로 전달하지 않고 글자 포함)', () => {
  const same = bc.sectionHtml(V([L()]), Object.assign({ collected: true, col: { name: '신한은행' } }, LEG));
  assert.ok(same.includes('수집 기록과 같음') && !same.includes('수집 기록과 다름'));
  const diff = bc.sectionHtml(V([L()]), Object.assign({ collected: true, hasKb: true, col: { name: 'KB국민은행', slot: '1', date: '2025-03-01' } }, LEG));
  assert.ok(diff.includes('<dt>수집 기록</dt>') && diff.includes('wf-badge pp-cancel">수집') && diff.includes('db-chk">수집 기록과 다름') && diff.includes('출처 기준일'));
  assert.strictEqual(bc.bankKey('KB국민은행'), bc.bankKey('국민은행'));
});

test('sectionHtml: 직접 입력이 국민은행이고 수집값이 없으면 현황판 미포함 안내, 수집값(c.kb)이 있으면 생략', () => {
  const kb = L({ bank_name: 'KB국민은행' });
  assert.ok(bc.sectionHtml(V([kb]), Object.assign({ collected: false, hasKb: false }, LEG)).includes('협약 중인 기관'));
  assert.ok(!bc.sectionHtml(V([kb]), Object.assign({ collected: true, hasKb: true, col: { name: 'KB국민은행' } }, LEG)).includes('협약 중인 기관'));
});

test('sectionHtml: 약정 문자열은 모두 escape하고 안전하지 않은 링크는 글자로만', () => {
  const x = '<img src=x onerror=alert(1)>';
  const h = bc.sectionHtml(V([L({ bank_name: x, note: x, editor_name: x, checked_dept: x, src_kind: 'STAFF', src_url: 'javascript:alert(1)', account_name: x, src_no: x })], { history_count: 1 }), LEG);
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(!/href="javascript/i.test(h));
});

test('syncRev: STALE 뒤 새 목록의 최신 rev로 맞추면 재저장 본문 base_rev_no가 새 rev', () => {
  const meta = { no: 7, rev: 1, title: 't' };
  bc.syncRev(meta, [L({ contract_no: 3, rev_no: 9 }), L({ contract_no: 7, rev_no: 4 })]);
  assert.strictEqual(meta.rev, 4);
  const c = bc.check(Object.assign({}, bc.BLANK, { bank: 'B02', rank: 'FIRST', to: '2026-12-31', kind: 'LINK', url: 'https://a.go.kr/x', date: '2026-11-10' }), { today: '2026-11-17', contractNo: meta.no, baseRev: meta.rev });
  assert.strictEqual(c.body.base_rev_no, 4);
  bc.syncRev(meta, []);   // 줄이 사라졌으면 그대로
  assert.strictEqual(meta.rev, 4);
});

test('겹침 확인 저장 본문은 confirm_overlap:true, 목록 버튼 aria-label과 이력 summary id', () => {
  const c = bc.check(Object.assign({}, bc.BLANK, { bank: 'B02', rank: 'FIRST', to: '2026-12-31', kind: 'LINK', url: 'https://a.go.kr/x', date: '2026-11-10' }), { today: '2026-11-17', confirmOverlap: true });
  assert.strictEqual(c.body.confirm_overlap, true);
  assert.ok(bc.sectionHtml(Object.assign(V([L()], { history_count: 2 })), LEG).includes('<summary id="bk-hist-sum">'));
});

test('수집 기록과 같음은 은행·순위 둘 다 같을 때만, 저장 실패 포커스 대상, 이미 지워진 약정 안내', () => {
  const kb = L({ bank_name: 'KB국민은행', rank_cd: 'FIRST' });
  const diff = bc.sectionHtml(V([kb]), Object.assign({ collected: true, hasKb: true, col: { name: 'KB국민은행', slot: '2' } }, LEG));
  assert.ok(diff.includes('수집 기록과 다름') && !diff.includes('수집 기록과 같음'));
  const same = bc.sectionHtml(V([kb]), Object.assign({ collected: true, hasKb: true, col: { name: 'KB국민은행', slot: '1' } }, LEG));
  assert.ok(same.includes('수집 기록과 같음') && !same.includes('수집 기록과 다름'));
  assert.strictEqual(bc.failFocus(false), 'ie-bk-save');
  assert.strictEqual(bc.failFocus(true), 'ie-bank-err');
  const o = bc.outcome({ status: 409, body: { detail: { code: 'ALREADY_CANCELLED', message: 'x' } } }, 'cancel');
  assert.deepStrictEqual([o.kind, o.msg], ['stale', '이미 지워진 약정입니다. 목록을 새로 불러왔습니다.']);
});

test('sectionHtml: 겹침 줄은 약정 줄 바로 아래, 2027년부터 줄 앞에 순위', () => {
  const h = bc.sectionHtml(V([L({ overlap_with: [2] })]), LEG);
  assert.ok(h.indexOf('겹치는 금고 순위 약정과 기간이 겹칩니다') > h.indexOf('약정 <span class="v">') && h.indexOf('겹치는 금고 순위 약정과 기간이 겹칩니다') < h.indexOf('출처 '));
  assert.ok(bc.overlapHtml([L()], LEG.ranks || []).includes('겹치는 금고 순위에 기간이 겹치는 약정이 있습니다.'));
  const f = bc.sectionHtml(V([L(), L({ contract_no: 2, term_state: 'FUTURE', term_from: '2027-01-01', term_to: '2030-12-31', rank_cd: 'SECOND' })]), LEG);
  assert.ok(f.includes('2금고 · 신한은행'));
});

test('입력자 표기: 처음 입력자 기준, 최신 수정자가 다르면 마지막 고침 덧붙임, first 없으면 수정자', () => {
  const F = { first_editor_name: '김처음', first_saved_at: '2026-11-10T09:00:00', editor_name: '김처음', saved_at: '2026-11-16T10:00:00' };
  const same = bc.sectionHtml(V([L(F)]), LEG);
  assert.ok(same.includes('입력 김처음 · <span class="v">11-10</span>') && !same.includes('마지막 고침'));
  const diff = bc.sectionHtml(V([L(Object.assign({}, F, { editor_name: '이<b>고침' }))]), LEG);
  assert.ok(diff.includes('입력 김처음 · <span class="v">11-10</span> · 마지막 고침 이&lt;b&gt;고침 (<span class="v">11-16</span>)'));
  assert.ok(!diff.includes('이<b>'));
  const old = bc.sectionHtml(V([L()]), LEG);
  assert.ok(old.includes('입력 이영업 · <span class="v">11-16</span>') && !old.includes('마지막 고침'));
  const ov = bc.overlapHtml([L(Object.assign({}, F, { editor_name: '이<b>고침' }))], LEG.ranks || []);
  assert.ok(ov.includes('입력 김처음 · <span class="v">11-10</span> · 마지막 고침 이&lt;b&gt;고침') && !ov.includes('이<b>') && !ov.includes('(입력 '));
  assert.ok(bc.sectionHtml(V([L(Object.assign({}, F, { emp_verified: false }))]), LEG).includes('</span> · 로그인 연동 전'));
});

test('sectionHtml: emp_verified=false면 로그인 연동 전 표지, true면 없음', () => {
  assert.ok(bc.sectionHtml(V([L({ emp_verified: false })]), LEG).includes(' · 로그인 연동 전'));
  assert.ok(!bc.sectionHtml(V([L({ emp_verified: true })]), LEG).includes('로그인 연동 전'));
});

test('sectionHtml: 만료만 있으면 만료 칩+안내, 수집값이 있으면 기존 갈래 아래에 만료 줄', () => {
  const past = L({ term_state: 'PAST', term_to: '2022-12-31' });
  const a = bc.sectionHtml(V([past]), LEG);
  assert.ok(a.includes('wf-badge pp-cancel">만료') && a.includes('지금 약정은 기록이 없습니다'));
  const b = bc.sectionHtml(V([past]), Object.assign({ collected: true }, LEG));
  assert.ok(b.includes('LEGACY') && b.includes('wf-badge pp-cancel">만료'));
});

test('sectionHtml: 바닥 — 입력/고치기/권한 없음/이력/불러오는 중/실패', () => {
  assert.ok(bc.sectionHtml(V([]), LEG).includes('금고 약정 입력'));
  assert.ok(bc.sectionHtml(V([L()], { can_edit: false }), LEG).includes('금고 약정은 영업팀이 입력합니다.'));
  assert.ok(!bc.sectionHtml(V([L()], { can_edit: false }), LEG).includes('id="bk-edit"'));
  const h = bc.sectionHtml(Object.assign(V([L()], { history_count: 3 }), { histOpen: true, histSt: 'ok', hist: { truncated: true, items: [L({ action_cd: 'CANCEL', cancel_reason_name: '잘못 입력' })] } }), LEG);
  assert.ok(h.includes('수정 이력 3건 보기') && h.includes('<details class="db-src bk-hist" open>') && h.includes('지움') && h.includes('최근 기록만 보입니다.'));
  assert.ok(bc.sectionHtml({ st: 'loading' }, LEG).includes('불러오는 중') && bc.sectionHtml({ st: 'loading' }, LEG).includes('LEGACY'));
  assert.ok(bc.sectionHtml({ st: 'error', code: 500 }, LEG).includes('id="bk-retry"'));
});

test('paneHtml: c.bank가 없으면 기존 금고 절 그대로, 있으면 id=db-bank 절로 대체', () => {
  const it = dash.itemForRec({ name: '가', region: 'seoul', type: '지자체' }, new Date(2026, 10, 17));
  const a = dash.paneHtml(it, {});
  assert.ok(a.includes('<div class="db-sec"><h3>현재 금고 은행</h3><dl class="db-dl">') && !a.includes('id="db-bank"'));
  const b = dash.paneHtml(it, { bank: V([L()]) });
  assert.ok(b.includes('id="db-bank"') && b.includes('직접 입력'));
});

test('check: 빠진 필수 칸 이름·종류별 본문(숨긴 칸은 보내지 않음)', () => {
  const c0 = bc.check(Object.assign({}, bc.BLANK, { bank: 'B02', rank: 'FIRST', kind: 'LINK', url: 'https://a.go.kr/x', date: '2026-11-10' }), { today: '2026-11-17' });
  assert.deepStrictEqual(c0.need, ['약정 끝']);
  const c = bc.check(Object.assign({}, bc.BLANK, { bank: 'B02', rank: 'FIRST', to: '2026-12-31', kind: 'LINK', url: 'https://a.go.kr/x', no: '숨김값', dept: '숨김부서', etc: '숨김', date: '2026-11-10' }), { today: '2026-11-17' });
  assert.ok(c.ok);
  assert.deepStrictEqual(c.body, { rank_cd: 'FIRST', bank_cd: 'B02', term_to: '2026-12-31', src_kind: 'LINK', checked_date: '2026-11-10', term_from: null, note: null, src_url: 'https://a.go.kr/x', account_cd: null });
  const s = bc.check(Object.assign({}, bc.BLANK, { bank: 'ETC', etc: '새은행', rank: 'JOINT', to: '2027', kind: 'STAFF', dept: '재무과 자금팀', date: '2026-11-10', ac: 'ETC', acetc: '특별회계' }), { today: '2026-11-17', contractNo: 4, baseRev: 2, confirmOverlap: true });
  assert.deepStrictEqual([s.body.bank_name_etc, s.body.checked_dept, s.body.src_url, s.body.contract_no, s.body.base_rev_no, s.body.confirm_overlap, s.body.account_etc], ['새은행', '재무과 자금팀', undefined, 4, 2, true, '특별회계']);
});

test('check: 형식·순서·미래 확인일 오류', () => {
  const f = o => bc.check(Object.assign({}, bc.BLANK, { bank: 'B02', rank: 'FIRST', kind: 'DOC_NO', no: '제2023-154호', date: '2026-11-10', to: '2026-12-31' }, o), { today: '2026-11-17' });
  assert.strictEqual(f({ to: '2026-13' }).errors[0].msg, bc.MSG.termNone);
  assert.strictEqual(f({ to: '1980' }).errors[0].msg, bc.MSG.termRange);
  assert.strictEqual(f({ from: '2027-01', to: '2026-12' }).errors[0].msg, bc.MSG.termOrder);
  assert.strictEqual(f({ date: '2026-11-18' }).errors[0].msg, bc.MSG.future);
  assert.ok(f({ from: '2026-12', to: '2026-12-31' }).ok);
});

test('formHtml: 순위 목록은 서버가 준 것만, 1금고가 없으면 안내, 회계 칸은 accounts가 있을 때만', () => {
  const a = bc.formHtml(Object.assign({}, CODES, { ranks: [{ code: 'JOINT', name: '공동 지정' }] }), bc.BLANK, {});
  assert.ok(a.includes('1금고·2금고는 지자체·교육청만 고를 수 있습니다.') && !a.includes('id="ie-bk-ac"'));
  const b = bc.formHtml(Object.assign({}, CODES, { accounts: [{ code: 'GEN', name: '일반회계' }] }), bc.BLANK, {});
  assert.ok(b.includes('id="ie-bk-ac"') && b.includes('maxlength="30"') && b.includes('maxlength="100"') && b.includes('YYYY-MM-DD'));
  assert.ok(!bc.formHtml(CODES, Object.assign({}, bc.BLANK, { kind: 'LINK' }), {}).includes('id="ie-bk-url-l" hidden'));
});

test('outcome: 201·200·409(DUP_RANK·STALE)·422·403·네트워크', () => {
  assert.strictEqual(bc.outcome({ status: 201, body: {} }).kind, 'saved');
  assert.strictEqual(bc.outcome({ status: 200, body: {} }).kind, 'nochange');
  const dup = bc.outcome({ status: 409, body: { detail: { code: 'DUP_RANK', message: 'm', overlaps: [{ contract_no: 3 }] } } });
  assert.deepStrictEqual([dup.kind, dup.overlaps.length], ['overlap', 1]);
  const st = bc.outcome({ status: 409, body: { detail: { code: 'STALE', message: '다른 사람이 먼저 고쳤습니다.' } } }, 'save');
  assert.ok(st.kind === 'stale' && st.msg.endsWith('최신 기록을 불러왔습니다. 확인한 뒤 다시 저장하세요.'));
  assert.strictEqual(bc.outcome({ status: 422, body: { detail: { code: 'PII_BLOCKED', message: '개인정보로 보이는 값이 있어 저장하지 않았습니다.' } } }).msg, '개인정보로 보이는 값이 있어 저장하지 않았습니다.');
  assert.strictEqual(bc.outcome({ status: 403, body: { detail: { message: '이 약정 줄은 입력한 본인이나 영업팀장·영업부장만 취소할 수 있습니다.' } } }, 'cancel').msg, '이 약정 줄은 입력한 본인이나 영업팀장·영업부장만 취소할 수 있습니다.');
  assert.ok(bc.outcome({ status: 0, body: null }).msg.length > 0);
});

test('요청: view는 서버 모드·로그인일 때만 받고, 저장·취소는 화면/버튼 머리글을 싣는다', async () => {
  bc.reset();
  const calls = [];
  const ok = d => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) });
  bc.env.store = { isServerMode: () => false, loadSession: () => ({ emp: 'e1' }) };
  bc.env.fetch = () => ok({});
  assert.strictEqual(bc.view('i1'), null);
  bc.env.store = { isServerMode: () => true, loadSession: () => ({ emp: 'e1' }) };
  bc.env.fetch = (u, o) => { calls.push({ u: u, o: o }); return ok({ lines: [], history_count: 0, can_edit: true, codes: {} }); };
  assert.strictEqual(bc.view('i1').st, 'loading');
  await new Promise(r => setImmediate(r));
  assert.strictEqual(bc.view('i1').st, 'ok');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].u, '/institutions/i1/bank-contracts');
  await bc.save('i1', { rank_cd: 'FIRST' });
  await bc.cancel('i1', 5, { base_rev_no: 1, cancel_reason_cd: 'WRONG' });
  assert.deepStrictEqual([calls[1].u, calls[1].o.method, calls[1].o.headers['X-Screen-Id'], calls[1].o.headers['X-Button-Id']], ['/institutions/i1/bank-contracts', 'POST', 'institution_edit', 'save_bank_contract']);
  assert.deepStrictEqual([calls[2].u, calls[2].o.headers['X-Button-Id'], JSON.parse(calls[2].o.body).cancel_reason_cd], ['/institutions/i1/bank-contracts/5/cancel', 'cancel_bank_contract', 'WRONG']);
  bc.env.store = null; bc.env.fetch = null; bc.reset();
});

test('머리글 이름은 서버 InstUiIds와 같다', () => {
  const java = fs.readFileSync(path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'InstUiIds.java'), 'utf8');
  [bc.SCREEN, bc.BTN.save, bc.BTN.cancel].forEach(id => assert.ok(java.indexOf('"' + id + '"') > 0, id));
});

test('배선: script 순서·alert/confirm 없음·새 CSS 토큰만', () => {
  const html = read('index.html');
  const at = s => html.indexOf('<script src="js/' + s + '"></script>');
  assert.ok(at('bankcontract.js') > at('instedit.js') && at('bankcontract.js') > at('errtext.js') && at('bankcontract.js') < at('dashboard.js'));
  const src = read('js/bankcontract.js');
  assert.ok(!/\balert\(/.test(src) && !/\bconfirm\(/.test(src));
  assert.ok(/role="alert"/.test(src) && /role="status"/.test(src) && /aria-invalid/.test(src) && /aria-required/.test(src));
  const css = html.slice(html.indexOf('/* 금고 약정(NEXT 89)'), html.indexOf('/* 기관 편집 창 끝 */'));
  assert.ok(css.length > 100 && !/#[0-9a-fA-F]{3,6}\b/.test(css));
  assert.ok(/S\.bankCtl/.test(read('js/instedit.js')) && /bankView\(/.test(read('js/dashboard.js')));
});
