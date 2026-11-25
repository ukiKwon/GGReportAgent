// 기관 상세 팝업 묶음(design 11-19 저녁 6-1~6-3, 시험 기준 6-7의 1·2·7·8·9). DOM 실동작(inert·포커스·스크롤)은 qa 실측.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const TODAY = new Date('2026-11-19T00:00:00');
function plus(d) { return logic.localDateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + d)); }
function rec(n) { return { name: n, region: '11', type: '지자체', contractEnd: plus(40), confirmed: true }; }

test('1·2 popupHtml: #dm-edit 없음, 순서 [이전?] → h2 → 주 동작 → .dm-sep → ×, 주 동작이 없으면 .dm-sep도 없다', function () {
  const it = dash.itemForRec(rec('가람시청'), TODAY);
  const a = dash.popupHtml(it, { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name', board: true });   // 확정 단추는 현황판 팝업(board)만(11-25)
  assert.ok(a.bar.indexOf('id="dm-edit"') < 0 && a.bar.indexOf('id="dm-back"') < 0 && a.bar.indexOf('<div class="dm-bar">') === 0);
  assert.ok(a.bar.indexOf('id="dm-name"') < a.bar.indexOf('id="db-cf"') && a.bar.indexOf('id="db-cf"') < a.bar.indexOf('class="dm-sep"') && a.bar.indexOf('class="dm-sep"') < a.bar.indexOf('id="dm-close"'));
  assert.ok(a.body.indexOf('<div class="db-sec-h"><h3>기관 정보</h3><button type="button" id="dm-info-edit" class="db-sec-act">기관 정보 수정</button></div>') > 0);
  const none = dash.popupHtml(it, { act: 'none', role: '영업팀', today: TODAY, nameId: 'dm-name' });
  assert.ok(none.bar.indexOf('dm-sep') < 0 && none.bar.indexOf('id="dm-close"') > 0);
  const ro = dash.popupHtml(it, { act: 'none', role: '디자이너', readOnly: true, today: TODAY, nameId: 'dm-name' });
  assert.ok(ro.bar.indexOf('dm-sep') < 0 && ro.body.indexOf('dm-info-edit') < 0 && ro.bar.indexOf('aria-label="닫기"') > 0);   // 보기 전용: [이전]·×만
});

test('2 popupHtml: [이전]은 제목 앞, 스택이면 × aria가 돌아갈 곳을 말한다, 약정 편집 중에는 주 동작·구분선을 숨긴다', function () {
  const it = dash.itemForRec(rec('가람시청'), TODAY);
  const back = { aria: '이전: 협약 중인 기관 목록', close: '닫기 — 협약 중인 기관 목록으로 돌아갑니다' };
  const b = dash.popupHtml(it, { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name', back: back });
  assert.ok(b.bar.indexOf('<div class="dm-bar has-back"><button type="button" id="dm-back" class="dm-back" aria-label="이전: 협약 중인 기관 목록">') === 0);
  assert.ok(b.bar.indexOf('id="dm-back"') < b.bar.indexOf('id="dm-name"'));
  assert.ok(b.bar.indexOf('id="dm-close" class="dm-cls" aria-label="닫기 — 협약 중인 기관 목록으로 돌아갑니다" title="닫기 — 협약 중인 기관 목록으로 돌아갑니다 (Esc)">닫기</button>') > 0);
  const e = dash.popupHtml(it, { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name', back: { aria: '이전: 기관 상세', close: '닫기 — 기관 상세로 돌아갑니다' }, editing: true });
  assert.ok(e.bar.indexOf('db-cf') < 0 && e.bar.indexOf('dm-sep') < 0 && e.bar.indexOf('id="dm-back"') > 0);
});

test('5 leaveBoxHtml: 문구·버튼·포커스 대상 id, 닫는 중이면 [버리고 닫기]', function () {
  const h = dash.leaveBoxHtml(false);
  assert.ok(h.indexOf('저장하지 않은 약정이 있습니다.') > 0 && h.indexOf('id="dm-leave-drop">버리고 돌아가기') > 0 && h.indexOf('id="dm-leave-keep">계속 입력') > 0);
  assert.ok(dash.leaveBoxHtml(true).indexOf('>버리고 닫기<') > 0);
});

// ── 가짜 DOM(map-detail.test.js와 같은 방식) ──
function fakeEl() {
  const e = { listeners: {}, attrs: {}, stubs: {}, parentNode: null, className: '', id: '', innerHTML: '', textContent: '', hidden: false, scrollTop: 0,
    addEventListener: function (t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); },
    querySelector: function (s) { return e.stubs[s] || (e.stubs[s] = fakeEl()); }, querySelectorAll: function () { return []; },
    contains: function (x) { return x === e; }, setAttribute: function (k, v) { e.attrs[k] = String(v); }, getAttribute: function (k) { return k in e.attrs ? e.attrs[k] : null; },
    hasAttribute: function (k) { return k in e.attrs; }, removeAttribute: function (k) { delete e.attrs[k]; }, closest: function () { return null; },
    focus: function () { global.document.activeElement = e; },
    fire: function (t, ev) { (e.listeners[t] || []).forEach(function (f) { f(Object.assign({ preventDefault: function () {}, stopPropagation: function () {} }, ev)); }); } };
  return e;
}
function withDocument(fn) {
  const prev = global.document;
  const body = { items: [], appendChild: function (x) { this.items.push(x); x.parentNode = this; }, removeChild: function (x) { this.items = this.items.filter(function (i) { return i !== x; }); x.parentNode = null; }, contains: function (x) { return !!(x && x.__inBody); } };
  global.document = { body: body, activeElement: null, createElement: function () { return fakeEl(); }, querySelector: function () { return null; }, getElementById: function () { return null; } };
  try { fn(body); } finally { dash.closeDetail(false); global.document = prev; }
}
function clickBtn(ov, id) { const btn = fakeEl(); btn.id = id; const inner = fakeEl(); inner.closest = function (s) { return s === 'button' ? btn : null; }; ov.fire('click', { target: inner }); }

test('8 opts.back: [이전]·×·Esc는 상세를 닫고 go()를 한 번 부른다(포커스는 go가 맡음), 막 클릭은 전체 닫기 + opener 복귀', function () {
  withDocument(function (body) {
    const opener = fakeEl(); opener.__inBody = true;
    let n = 0;
    const open = function () { dash.openDetail(rec('가람시청'), { opener: opener, back: { label: '협약 중인 기관 목록', go: function () { n += 1; } } }); return body.items[body.items.length - 1]; };
    let ov = open(); clickBtn(ov, 'dm-back');
    assert.strictEqual(dash.isDetailOpen(), false); assert.strictEqual(n, 1); assert.notStrictEqual(global.document.activeElement, opener);
    ov = open(); clickBtn(ov, 'dm-close'); assert.strictEqual(dash.isDetailOpen(), false); assert.strictEqual(n, 2);
    ov = open(); ov.fire('keydown', { key: 'Escape' }); assert.strictEqual(dash.isDetailOpen(), false); assert.strictEqual(n, 3);
    ov = open(); ov.fire('mousedown', { target: ov }); ov.fire('click', { target: ov });
    assert.strictEqual(dash.isDetailOpen(), false); assert.strictEqual(n, 3); assert.strictEqual(global.document.activeElement, opener);
  });
});

test('9 back이 없으면 ×·Esc는 지금처럼 닫고 opener로 포커스(회귀)', function () {
  withDocument(function (body) {
    const opener = fakeEl(); opener.__inBody = true;
    dash.openDetail(rec('가람시청'), { opener: opener }); clickBtn(body.items[0], 'dm-close');
    assert.strictEqual(dash.isDetailOpen(), false); assert.strictEqual(global.document.activeElement, opener);
  });
});

test('3·4·6 배선(소스): bk-edit는 편집 창을 열지 않고 약정 단계로, 단계 중 bank 입력 묶음은 노드째 보존, 정보 수정 창은 noBank·onClose·inert', function () {
  const s = read('js/dashboard.js');
  assert.ok(/case 'bk-edit': dmBankEnter\(m\); break;/.test(s));
  assert.ok(!/closeDetail\(false\); if \(root\.app && root\.app\.openEdit\)/.test(s));            // 상세를 닫고 편집 창을 여는 옛 경로 없음
  assert.ok(/focus: 'bank' \}\);/.test(s) === true);                                                // 현황판 안쪽 칸(1668)의 bk-edit는 이번 범위 밖 — 그대로
  assert.ok(s.indexOf('replaceChild(bk, foot)') > 0 && s.indexOf("sec.classList.add('is-editing')") > 0 && s.indexOf('id="bk-done"') > 0);
  assert.ok(/openEdit\(m\.rec, \{ from: m\.screen, opener: btn, noBank: true, onClose:/.test(s) && s.indexOf("m.el.setAttribute('inert', '')") > 0 && s.indexOf("m.el.removeAttribute('inert')") > 0);
  assert.ok(s.indexOf("t.closest('#ie-bank') && m.bankEdit.ctl.click(e)") > 0 && s.indexOf("ov.addEventListener('input', bkIn)") > 0);
  assert.ok(s.indexOf('if (m.leaveAsk) {') > 0 && s.indexOf('dmBack(m);') > 0);                        // Esc: 확정 상자 → 이탈 확인 상자 → dmBack(약정 단계 → 목록 → 닫기)
});

test('7 CSS: #edit-modal z-index가 .modal-overlay(30)보다 크다, #hb-ours는 dm-box와 같은 자리·크기', function () {
  const h = read('index.html');
  assert.ok(Number(/#edit-modal \{ z-index:(\d+); \}/.exec(h)[1]) > Number(/\.modal-overlay \{[^}]*z-index:(\d+)/.exec(h)[1]));
  assert.ok(/#hb-ours \{ width:min\(720px, calc\(100vw - 32px\)\); margin:32px auto; max-height:calc\(100vh - 64px\);/.test(h));
  assert.ok(/\.modal-box\.dm-box \{ width:min\(720px, calc\(100vw - 32px\)\); max-height:calc\(100vh - 64px\); margin:32px auto;/.test(h));
  assert.ok(/\.dm-btns \.dm-sep \{[^}]*width:1px; height:20px/.test(h) && /\.dm-btns \.db-next \{ height:32px;/.test(h) && /\.dm-btns \.dm-cls \{ height:32px; padding:0 14px; \}/.test(h) && !/\.dm-x\b/.test(h));
  assert.ok(/\.db-sec \.db-sec-h h3 \{[^}]*margin:0/.test(h));                                      // .db-sec h3(뒤에 나옴)의 margin을 이긴다
});

test('5b leaveBoxHtml 문구 인자: 기본은 약정, what을 주면 그 이름', function () {
  assert.ok(dash.leaveBoxHtml(true, '공고 상태 기록').indexOf('저장하지 않은 공고 상태 기록이 있습니다.') > 0);
  assert.ok(dash.leaveBoxHtml(false, '약정과 공고 상태 기록').indexOf('저장하지 않은 약정과 공고 상태 기록이 있습니다.') > 0);
  assert.ok(dash.leaveBoxHtml(true).indexOf('저장하지 않은 약정이 있습니다.') > 0);
});

test('10 배선(소스): 팝업은 recViewHtml(dmRc(m))를 쓰고 #dm-rec-go·recordBriefHtml 호출이 없다, 저장은 rc를 받는 한 함수, Esc 순서', function () {
  const s = read('js/dashboard.js');
  assert.ok(/recordHtml: ie\.isOpenCheck\(m\.rec\) \? '' : recViewHtml\(dmRc\(m\)\)/.test(s));
  assert.ok(!/dm-rec-go|dmRecState/.test(s.replace(/dash\.recordBriefHtml = [\s\S]*?\r?\n  };\r?\n/, '')) && !/dash\.recordBriefHtml\(m\./.test(s));
  assert.ok(/function recSave\(rc, confirmed\)/.test(s) && /function recDone\(rc, r, id, o\)/.test(s) && !/function recSave\(confirmed\)/.test(s));
  assert.ok(/viewOnly: function \(\) \{ return !!m\.readOnly; \}/.test(s) && /canEdit: n\.canEdit\(\) && !rc\.viewOnly\(\)/.test(s));
  assert.ok(/if \(m\.comp\) \{ m\.compLater = true; return; \}\s*\/\/[^\n]*\n\s*dmRecSync\(m\);/.test(s));
  assert.ok(s.indexOf('if (m.rc && m.rc.busy) return;') < s.indexOf('recCfNo(dmRc(m)); return; }') && s.indexOf('recCfNo(dmRc(m)); return; }') < s.indexOf('if (m.confirm) { m.confirm = false;'));
  assert.ok(/REC_POPUP_SCREEN \? m\.screen : undefined/.test(s));
});

test('10 팝업을 열면 기록 절이 dm- id로 그려지고 [입찰 공고 현황에서 기록] 버튼은 없다', function () {
  withDocument(function (body) {
    dash.openDetail(rec('가람시청'), {});
    const html = body.items[0].querySelector('#dm-pane').innerHTML;
    assert.ok(html.indexOf('id="dm-db-rec"') > 0 && html.indexOf('서버에 연결하면 공고 상태 기록') > 0 && html.indexOf('dm-rec-go') < 0 && html.indexOf('id="db-rec"') < 0);
  });
});

async function withDocumentAsync(fn) {
  const prev = global.document;
  const body = { items: [], appendChild: function (x) { this.items.push(x); x.parentNode = this; }, removeChild: function (x) { this.items = this.items.filter(function (i) { return i !== x; }); x.parentNode = null; }, contains: function () { return false; } };
  global.document = { body: body, activeElement: null, createElement: function () { return fakeEl(); }, querySelector: function () { return null; }, getElementById: function () { return null; } };
  try { await fn(body); } finally { dash.closeDetail(false); global.document = prev; }
}
const tick = function () { return new Promise(function (res) { setTimeout(res, 5); }); };
const jres = function (b, s) { return Promise.resolve({ ok: !s || s < 400, status: s || 200, json: function () { return Promise.resolve(b); } }); };
async function popupSave(post, ver) {   // 팝업을 열어 [기록 저장]을 누르고 상태를 돌려준다
  const nr = require('../js/noticerec.js'), calls = [], st = dash.recState();
  nr.env = { store: { isServerMode: function () { return true; }, loadSession: function () { return { emp: '7100' + ver }; } },
    fetch: function (url, opt) { calls.push({ url: url, opt: opt });
      if (opt && opt.method === 'POST') return post;
      if (/notice-rounds\/current/.test(url)) return jres({ today: '2026-11-25', can_edit: true, items: [] });
      return jres({ rounds: [] }); } };
  await nr.load(); dash.recGuard();
  const r = Object.assign(rec('가람시청'), { institutionId: 'I-1' });
  st.drafts['I-1'] = { status: 'CLOSED', next: '', opinion: '홈페이지 확인' };
  const out = {};
  await withDocumentAsync(async function (body) {
    dash.openDetail(r, {}); await tick();
    const ov = body.items[0], m = dash.popupState();
    clickBtn(ov, 'dm-db-rec-save'); await tick(); await tick();
    out.calls = calls; out.flash = ov.querySelector('#dm-flash').textContent; out.err = ov.querySelector('#dm-err'); out.rc = m.rc; out.draft = st.drafts['I-1'];
  });
  nr.env = {}; delete st.drafts['I-1'];
  return out;
}

test('10 팝업 저장: POST judgments(화면 bid_notice 유지)·초안 삭제·#dm-flash 한 줄', async function () {
  const o = await popupSave(jres({ handler_name: '김영업', handled_at: '2026-11-25T01:25:00' }, 201), '001');
  const p = o.calls.filter(function (c) { return c.opt && c.opt.method === 'POST'; });
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].url, '/institutions/I-1/notice-rounds/judgments');
  assert.strictEqual(p[0].opt.headers['X-Screen-Id'], 'bid_notice');
  assert.ok(o.flash.indexOf('기록을 저장했습니다. 김영업') === 0); assert.strictEqual(o.draft, undefined); assert.strictEqual(o.rc.busy, false);
});

test('10 팝업 저장 실패 위치: 409는 절 안(rc.err), 403은 위쪽 #dm-err(rc.err 비움), 400 필드는 rc.errs', async function () {
  const stale = await popupSave(jres({ detail: { code: 'STALE', latest: { handler_name: '이영업', handled_at: '2026-11-25T01:00', status_cd: 'CLOSED' } } }, 409), '002');
  assert.ok(stale.rc.err.indexOf('이영업이 먼저 기록했습니다') === 0); assert.strictEqual(stale.err.textContent, '');
  const denied = await popupSave(jres(null, 403), '003');
  assert.strictEqual(denied.rc.err, ''); assert.ok(denied.err.textContent.indexOf('영업팀만 저장') >= 0); assert.strictEqual(denied.err.hidden, false);
  const bad = await popupSave(jres({ detail: { field: 'opinion', message: '개인정보' } }, 400), '004');
  assert.strictEqual(bad.rc.errs.opinion, '개인정보');
});

async function leaveSetup(fn) {   // 초안이 있는 팝업을 열어 fn(ov, m, st)을 돌린다
  const nr = require('../js/noticerec.js'), st = dash.recState();
  nr.env = { store: { isServerMode: function () { return true; }, loadSession: function () { return { emp: '7100901' }; } },
    fetch: function (url) { if (/notice-rounds\/current/.test(url)) return jres({ today: '2026-11-25', can_edit: true, items: [] }); return jres({ rounds: [] }); } };
  await nr.load(); dash.recGuard();
  const r = Object.assign(rec('가람시청'), { institutionId: 'I-1' });
  st.drafts['I-1'] = { status: 'CLOSED', next: '', opinion: '홈페이지 확인' };
  try {
    await withDocumentAsync(async function (body) { dash.openDetail(r, {}); await tick(); await fn(body.items[0], dash.popupState(), st); });
  } finally { nr.env = {}; delete st.drafts['I-1']; }
}

test('11 이탈 상자: 초안이 있으면 exit·공고 상태 기록 문구, 초안이 사라지면(되돌리기) 상자가 저절로 닫히고 약정 문구가 없다', async function () {
  await leaveSetup(async function (ov, m) {
    clickBtn(ov, 'dm-close');
    assert.strictEqual(m.leaveAsk, 'exit');   // [닫기]는 dmBack 경로 — 'close'는 막(바깥) 클릭 dmCloseAll 경로
    assert.ok(ov.querySelector('#dm-act-note').innerHTML.indexOf('저장하지 않은 공고 상태 기록이 있습니다.') > 0);
    clickBtn(ov, 'dm-db-rec-revert');   // 초안 삭제 + 다시 그리기
    assert.strictEqual(m.leaveAsk, false);
    assert.ok(ov.querySelector('#dm-act-note').innerHTML.indexOf('저장하지 않은 약정') < 0);
  });
});

test('11 이탈 상자: 저장 중(rc.busy)에는 [버리고 닫기]가 아무것도 하지 않는다', async function () {
  await leaveSetup(async function (ov, m, st) {
    clickBtn(ov, 'dm-close'); assert.strictEqual(m.leaveAsk, 'exit');
    m.rc.busy = true;
    clickBtn(ov, 'dm-leave-drop');
    assert.strictEqual(dash.isDetailOpen(), true); assert.ok(st.drafts['I-1']); assert.strictEqual(m.leaveAsk, 'exit');
    m.rc.busy = false;
  });
});

test('8 kbboard openOurs: 협약 목록에서 연 상세에만 back, closePop 전에 스크롤을 저장하고 go에서 openPop → 스크롤·같은 data-key 줄 포커스', function () {
  const k = read('js/kbboard.js');
  assert.ok(/const sc = \$\('hb-oscroll'\), top = sc \? sc\.scrollTop : 0;/.test(k) && k.indexOf("label: '협약 중인 기관 목록'") > 0 && /, back: back/.test(k));
  assert.ok(k.indexOf('openPop();') > 0 && k.indexOf("x.getAttribute('data-key') === key") > 0);
  assert.ok(k.indexOf("fallback: fromPop ? '#hb-ours-btn' : '#' + colId") > 0);                   // 막 클릭 → opener(#hb-ours-btn)
});
