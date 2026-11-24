// 기관장 카드(NEXT 77 1단계): 임기 남은 기간 경계·큰 숫자 선택·카드 렌더·상태별 안내·이스케이프·출처 링크·요청(화면 ID·라이선스)·편집 모달 마크업.
// 서버(fetch)는 가짜로 바꾼다. DOM 부분(모달 열기·닫기)은 노드에서 돌리지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const hc = require('../js/headcard.js');
hc.DEBOUNCE_MS = 0;   // 기관 선택 뒤 대기(400ms)는 해당 시험에서만 켠다

const TODAY = new Date(2026, 10, 12);   // 2026-11-12 로컬 자정

// ── 도우미 ─────────────────────────────────────────────────────────
const realFetch = global.fetch;
function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (let i = 0; i < 12; i += 1) await tick(); }
// routes(url, init) → { status, json, blob? } | { fail:true }. 호출 기록을 돌려준다.
function fakeFetch(routes) {
  const calls = [];
  global.fetch = function (url, init) {
    calls.push({ url: url, init: init || {} });
    const r = routes(url, init || {});
    if (r.fail) return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve({
      ok: r.status < 400, status: r.status,
      json: function () { return r.json === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(r.json); },
      headers: { get: function (k) { return r.headers && r.headers[k] != null ? r.headers[k] : null; } },
      blob: function () { return Promise.resolve(r.blob || new Blob(['jpegbytes'], { type: 'image/jpeg' })); },
    });
  };
  return calls;
}
function cleanup() { global.fetch = realFetch; hc.reset(); }

const SRC = { kind: 'HOMEPAGE', title: '가람시 누리집', url: 'https://example.go.kr/mayor', published: null, checked_on: '2026-11-03' };
function field(id, value, src) { return { item_id: id, value: value, source: src || SRC, created_by: '1001', created_verified: false }; }
function detail(over) {
  const head = Object.assign({
    head_id: 7, name: '서지운', position: '가람시장', acting: false,
    first_take_office: '2022-07-01', term_start: '2026-07-01', term_end: '2030-06-30',
    fields: { NAME: field(1, '서지운'), POSITION: field(2, '가람시장'), FIRST_TAKE_OFFICE: field(3, '2022-07-01'),
      TERM_START: field(4, '2026-07-01'), TERM_END: field(5, '2030-06-30', { kind: 'NEC', title: '당선인 정보', url: null, checked_on: '2026-11-02' }) },
    education: [{ item_id: 10, head_id: 7, field_cd: 'EDU', value: '가상대학교 행정학 석사', from: '1999', to: '2001', source: SRC, created_by: '1001' }],
    career: [
      { item_id: 11, head_id: 7, field_cd: 'CAREER', value: '가람시의회 의원', from: '2018', to: '2022-06', source: SRC, created_by: '1001' },
      { item_id: 12, head_id: 7, field_cd: 'CAREER', value: '가상도청 예산담당관', from: '2010', to: '2017', source: SRC, created_by: '1001' },
    ],
    photo: null, source_count: 8, last_checked_on: '2026-11-03',
  }, (over && over.head) || {});
  // over의 head 말고 다른 칸(viewer_role·candidates 등)은 head를 함께 줘도 그대로 적용한다
  const rest = Object.assign({}, over || {}); delete rest.head;
  return Object.assign({ institution_id: '11010', viewer_role: '영업팀', viewer_verified: false, head: head, candidates: [], candidate_heads: [] }, rest, { head: over && over.head === null ? null : head });
}
function view(over, extra) { return Object.assign({ status: 'ok', data: detail(over), photo: { id: 0, url: '', state: '' } }, extra || {}); }
function env(extra) {
  return Object.assign({ serverMode: true, hasEmp: true, role: '영업팀', emp: '2002', today: TODAY, bid: null, repaint: function () {} }, extra || {});
}

// ── 임기 남은 기간 ─────────────────────────────────────────────────
test('termInfo: 년·개월 계산과 경계(한 달 미만은 D-n, 오늘·지남)', function () {
  const t = function (d) { return hc.termInfo(d, TODAY); };
  assert.strictEqual(t('2030-06-30').text, '임기 3년 7개월');
  assert.strictEqual(t('2030-06-30').big, '3년 7개월');
  assert.strictEqual(t('2030-06-30').s, '남음');
  assert.strictEqual(t('2027-11-12').big, '1년');                 // 정확히 12개월 — 0인 개월은 생략
  assert.strictEqual(t('2027-11-11').big, '11개월');              // 하루 모자라면 11개월
  assert.strictEqual(t('2026-12-12').big, '1개월');               // 정확히 1개월
  assert.strictEqual(t('2028-03-05').big, '1년 3개월');
  assert.strictEqual(t('2026-12-11').kind, 'days');               // 1개월 미만은 D-n
  assert.strictEqual(t('2026-12-11').big, 'D-29');
  assert.strictEqual(t('2026-11-13').big, 'D-1');
  assert.strictEqual(t('2026-11-12').big, 'D-day');
  assert.strictEqual(t('2026-11-12').s, '오늘 만료');
  assert.strictEqual(t('2026-11-11').kind, 'over');
  assert.strictEqual(t('2026-11-11').text, '임기 만료 1일 지남');
});

test('termInfo: 날짜가 없거나 틀리면 null(지어내지 않는다)', function () {
  assert.strictEqual(hc.termInfo('', TODAY), null);
  assert.strictEqual(hc.termInfo(null, TODAY), null);
  assert.strictEqual(hc.termInfo('2026-13-40', TODAY), null);
  assert.strictEqual(hc.termInfo('2030/06/30', TODAY), null);
  assert.strictEqual(hc.termInfo('2030-06-30', null), null);
});

test('bigInfo: 임기 만료일이 확정돼 있으면 임기(출처 포함), 모르면 입찰 D-day, 둘 다 없으면 null', function () {
  const h = detail().head;
  const a = hc.bigInfo(h, { days: 41, date: '2026-12-23', label: '확정' }, TODAY);
  assert.strictEqual(a.type, 'term');
  assert.strictEqual(a.text, '임기 3년 7개월');
  assert.strictEqual(a.src.kind, 'NEC');                          // 만료일 출처
  const noTerm = Object.assign({}, h, { term_end: null });
  const b = hc.bigInfo(noTerm, { days: 41, date: '2026-12-23', label: '확정' }, TODAY);
  assert.strictEqual(b.type, 'bid');
  assert.strictEqual(b.big, 'D-41');
  assert.strictEqual(hc.bigInfo(noTerm, { days: 0, date: '2026-11-12', label: '추정' }, TODAY).big, 'D-day');
  assert.strictEqual(hc.bigInfo(noTerm, { days: -24, date: '2026-10-19', label: '추정' }, TODAY).big, 'D+24');
  assert.strictEqual(hc.bigInfo(noTerm, null, TODAY), null);
  assert.strictEqual(hc.bigInfo(noTerm, { days: NaN, date: 'x' }, TODAY), null);
});

// ── 카드 렌더 ──────────────────────────────────────────────────────
test('cardHtml: 확정 항목·출처·큰 숫자·학력 경력(최근 순)·열람 기록 안내', function () {
  const h = hc.cardHtml(view(), { today: TODAY });
  assert.ok(h.indexOf('<h4 id="hc-name">서지운</h4>') >= 0);
  assert.ok(h.indexOf('가람시장') >= 0);
  assert.ok(h.indexOf('aria-label="임기 3년 7개월 남음"') >= 0 && h.indexOf('<b aria-hidden="true">3년 7개월</b>') >= 0);
  assert.ok(h.indexOf('당선인 정보') >= 0 && h.indexOf('중앙선거관리위원회') >= 0);          // 임기 만료일의 출처
  ['2022-07-01', '2026-07-01', '2030-06-30'].forEach(function (d) { assert.ok(h.indexOf('<span class="v">' + d + '</span>') >= 0, d); });
  assert.ok(h.indexOf('가상대학교 행정학 석사') >= 0 && h.indexOf('1999~2001') >= 0);
  assert.ok(h.indexOf('가람시의회 의원') < h.indexOf('가상도청 예산담당관'));              // 끝 연월이 늦은 것이 위
  assert.ok(h.indexOf('출처를 단 항목 <span class="v">8</span>건') >= 0 && h.indexOf('2026-11-03') >= 0);
  assert.ok(h.indexOf('열람·내려받기 기록이 남습니다') >= 0);
  assert.ok(h.indexOf('data-hc="edit"') >= 0 && h.indexOf('data-hc="refresh"') >= 0);
  assert.ok(h.indexOf('확정 대기 후보') < 0 && h.indexOf('hc-cand') < 0);                 // 후보가 없으면 배지 없음
  assert.ok(!/\d\s*점|등급|별점/.test(h));                                               // 점수·등급 없음
});

test('cardHtml: 후보 수 배지(후보 항목 + 후보 기관장)', function () {
  const v = view({ candidates: [{ item_id: 20, field_cd: 'POSITION', value: '대행', source: SRC, created_by: '1', can_confirm: true, can_reject: true }],
    candidate_heads: [{ head_id: 9, name: '김후보', position: '시장', created_by: '1', item_count: 2, can_confirm: true, can_reject: true }] });
  assert.ok(hc.cardHtml(v, { today: TODAY }).indexOf('확정 대기 후보 2건 보기') >= 0);
});

test('cardHtml: 임기를 모르면 입찰 D-day를 큰 숫자로, 둘 다 모르면 미확인 칩', function () {
  const v = view({ head: { term_end: null, fields: { NAME: field(1, '서지운') } } });
  const withBid = hc.cardHtml(v, { today: TODAY, bid: { days: 41, date: '2026-12-23', label: '확정' } });
  assert.ok(withBid.indexOf('<b aria-hidden="true">D-41</b>') >= 0 && withBid.indexOf('입찰 공고 예정') >= 0);
  assert.ok(withBid.indexOf('2026-12-23') >= 0 && withBid.indexOf('임기 만료일은 아직 확인되지 않았습니다') >= 0);
  const over = hc.cardHtml(v, { today: TODAY, bid: { days: -24, date: '2026-10-19', label: '추정' } });
  assert.ok(over.indexOf('D+24') >= 0 && over.indexOf('공고 예정일 지남') >= 0);
  const none = hc.cardHtml(v, { today: TODAY, bid: null });
  assert.ok(none.indexOf('임기 만료일과 입찰 예정일을 모릅니다') >= 0 && none.indexOf('pop-unk') >= 0);
});

test('cardHtml: 임기 만료·지남은 숫자 대신 만료로 말한다', function () {
  const v = view({ head: { term_end: '2026-11-01', fields: { TERM_END: field(5, '2026-11-01') } } });
  const h = hc.cardHtml(v, { today: TODAY });
  assert.ok(h.indexOf('<b aria-hidden="true">만료</b>') >= 0 && h.indexOf('11일 지남') >= 0);
});

test('cardHtml: 사진 — 없음(실루엣)·불러오는 중·있음(공공누리 이름표)·실패', function () {
  const none = hc.cardHtml(view(), { today: TODAY });
  assert.ok(none.indexOf('class="hc-sil"') >= 0 && none.indexOf('사진 없음') >= 0 && none.indexOf('<img') < 0);
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: { kind: 'HOMEPAGE', title: '시청 보도자료', url: null, checked_on: '2026-11-03' }, checked_on: '2026-11-03', uploaded_by: '1001' };
  const loading = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: '', state: 'loading' } }), { today: TODAY });
  assert.ok(loading.indexOf('사진 불러오는 중…') >= 0 && loading.indexOf('<img') < 0);
  const ok = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: 'blob:abc', state: 'ok' } }), { today: TODAY });
  assert.ok(ok.indexOf('<img src="blob:abc" alt="기관장 사진"') >= 0);
  assert.ok(ok.indexOf('공공누리 제1유형') >= 0 && ok.indexOf('(출처표시)') < 0 && ok.indexOf('시청 보도자료') >= 0);
  const err = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: '', state: 'err' } }), { today: TODAY });
  assert.ok(err.indexOf('사진을 불러오지 못했습니다') >= 0);
  // 다른 사진 번호의 낡은 Blob 주소는 쓰지 않는다
  const stale = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 99, url: 'blob:old', state: 'ok' } }), { today: TODAY });
  assert.ok(stale.indexOf('blob:old') < 0);
});

test('cardHtml: 권한대행 배지, 이름·직위·학력 값이 없으면 미확인 칩', function () {
  const h = hc.cardHtml(view({ head: { acting: true } }), { today: TODAY });
  assert.ok(h.indexOf('hc-badge">권한대행') >= 0);
  const bare = hc.cardHtml(view({ head: { name: null, position: null, education: [], career: [], first_take_office: null, term_start: null, fields: {} } }), { today: TODAY });
  assert.ok(bare.indexOf('이름 미확인') >= 0 && bare.indexOf('직위 미확인') >= 0 && bare.indexOf('학력 미확인') >= 0 && bare.indexOf('경력 미확인') >= 0);
});

test('cardHtml: 경력이 4건을 넘으면 나머지는 접어 둔다', function () {
  const career = [1, 2, 3, 4, 5, 6].map(function (i) { return { item_id: 30 + i, head_id: 7, field_cd: 'CAREER', value: '경력' + i, from: String(2000 + i), to: String(2001 + i), source: SRC, created_by: '1' }; });
  const h = hc.cardHtml(view({ head: { career: career } }), { today: TODAY });
  assert.ok(h.indexOf('<summary>나머지 2건 보기</summary>') >= 0);
});

test('이스케이프: 이름·직위·출처·경력의 <script>가 그대로 나가지 않는다', function () {
  const evil = '<script>alert(1)</script>';
  const bad = { kind: 'OTHER', title: evil, url: 'https://x.kr/a"onmouseover="y', checked_on: '2026-11-03' };
  const v = view({ head: { name: evil, position: evil, fields: { TERM_END: field(5, '2030-06-30', bad) },
    career: [{ item_id: 1, head_id: 7, field_cd: 'CAREER', value: evil, from: '2000', to: '2001', source: bad, created_by: '1' }],
    photo: { photo_id: 1, license_cd: evil, source: bad, uploaded_by: evil } } }, { photo: { id: 1, url: 'blob:x" onerror="z', state: 'ok' } });
  const m = { pending: null };
  const html = hc.cardHtml(v, { today: TODAY }) + hc.modalHtml(v, m, { today: TODAY, emp: '1' }) + hc.sectionHtml({ status: 'error', text: evil, code: 500 }, {});
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.ok(html.indexOf('&lt;script&gt;') >= 0);
  assert.ok(!/href="[^"]*"onmouseover/.test(html));
  assert.strictEqual(html.indexOf('onerror="z'), -1);                                  // 따옴표가 &quot;로 바뀌어 속성이 갈라지지 않는다
  assert.ok(html.indexOf('blob:x&quot; onerror=&quot;z') >= 0);
  assert.strictEqual(html.indexOf('" onerror="'), -1);
});

test('출처 주소: logic.safeHttpUrl을 통과한 http(s)만 링크, 나머지는 글자만', function () {
  const link = hc.srcHtml({ kind: 'PRESS', title: '기사', url: 'https://news.example/a?b=1&c=2', checked_on: '2026-11-03' });
  assert.ok(link.indexOf('<a href="https://news.example/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">기사</a>') >= 0);
  ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.kr/x', '//evil.kr/x', 'https://a b.kr'].forEach(function (u) {
    const h = hc.srcHtml({ kind: 'PRESS', title: '기사', url: u, checked_on: '2026-11-03' });
    assert.ok(h.indexOf('<a ') < 0, u);
    assert.ok(h.indexOf('기사') >= 0);
  });
  assert.ok(hc.srcHtml(null).indexOf('출처 없음') >= 0);
  assert.ok(hc.srcHtml({ kind: 'NEC', title: '', url: 'https://nec.go.kr/x', checked_on: '2026-11-03' }).indexOf('>https://nec.go.kr/x</a>') >= 0);
});

// ── 상태별 안내 ────────────────────────────────────────────────────
test('sectionHtml: 상태마다 말이 다르다(없음·꺼짐·권한·서버 밖 기관·오프라인·오류)', function () {
  const s = function (st, extra) { return hc.sectionHtml(Object.assign({ status: st }, extra || {}), {}); };
  assert.ok(s('loading').indexOf('불러오는 중') >= 0 && s('loading').indexOf('aria-busy="true"') >= 0);
  const none = s('none');
  assert.ok(none.indexOf('아직 등록되지 않았습니다') >= 0 && none.indexOf('data-hc="add-head"') >= 0 && none.indexOf('기관장 추가') >= 0);
  assert.ok(s('off').indexOf('사용 안 함') >= 0);
  assert.ok(s('denied').indexOf('이 정보를 볼 권한이 없습니다') >= 0 && s('denied').indexOf('사용자 등록 상태 확인 필요') >= 0);   // 원인을 단정하지 않는다
  assert.ok(s('role').indexOf('영업팀·영업팀장·영업부장만') >= 0);
  ['denied', 'notfound', 'login', 'error'].forEach(function (k) { assert.ok(s(k, { text: 'x', code: 500 }).indexOf('data-hc="refresh"') >= 0, k); });   // 다시 불러오기
  ['off', 'role', 'noid', 'offline'].forEach(function (k) { assert.ok(s(k).indexOf('data-hc="refresh"') < 0, k); });
  assert.ok(s('none').indexOf('data-hc="refresh"') >= 0, 'none');   // 그 사이 다른 사람이 등록했을 수 있어 다시 읽기(design 11-13)
  assert.ok(s('login').indexOf('다시 로그인') >= 0);
  assert.ok(s('notfound').indexOf('서버에 등록된 기관만 기관장 정보를 관리합니다') >= 0);
  assert.ok(s('noid').indexOf('서버에 등록된 기관만 기관장 정보를 관리합니다') >= 0 && s('noid').indexOf('data-hc="add-head"') < 0);
  assert.ok(s('offline').indexOf('서버에 연결되면') >= 0);
  const er = s('error', { text: '서버 문구', code: 500 });
  assert.ok(er.indexOf('role="alert"') >= 0 && er.indexOf('서버 문구 (500)') >= 0 && er.indexOf('data-hc="refresh"') >= 0);
  assert.ok(s('error', { text: '', code: 0 }).indexOf('서버에 연결하지 못했습니다') >= 0);
  assert.ok(s('ok', { data: detail() }).indexOf('hc-card') >= 0);
  assert.ok(s('ok', { data: detail() }).indexOf('<h3>기관장</h3>') >= 0);
});

test('gate: 서버·사번·기관 id·역할을 통과하지 못하면 서버를 부르지 않는다', async function () {
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    const rec = { institutionId: '11010' };
    assert.strictEqual(hc.gate(rec, env({ serverMode: false })), 'offline');
    assert.strictEqual(hc.gate(rec, env({ hasEmp: false })), 'offline');
    assert.strictEqual(hc.gate({}, env()), 'noid');
    assert.strictEqual(hc.gate(null, env()), 'noid');
    assert.strictEqual(hc.gate(rec, env({ role: '디자이너' })), 'role');
    assert.strictEqual(hc.gate(rec, env({ role: '' })), 'role');
    assert.strictEqual(hc.gate(rec, env()), '');
    ['영업팀', '영업팀장', '영업부장'].forEach(function (r) { assert.strictEqual(hc.gate(rec, env({ role: r })), ''); });
    // institutionId 없는 레코드(비지자체) → 안내만, 요청 없음
    const html = hc.paneSection({ name: '한빛공단' }, env());
    assert.ok(html.indexOf('서버에 등록된 기관만 기관장 정보를 관리합니다') >= 0);
    assert.ok(hc.paneSection(rec, env({ role: '디자이너' })).indexOf('영업팀·영업팀장·영업부장만') >= 0);
    await settle();
    assert.strictEqual(calls.length, 0);
  } finally { cleanup(); }
});

// ── 서버 응답별 상태(가짜 fetch) ───────────────────────────────────
test('ensure: 정상 응답 → 카드, 요청에 화면 이름·버튼 ID(open_card)', async function () {
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  let repaints = 0;
  try {
    const html0 = hc.paneSection({ institutionId: '11010' }, env({ repaint: function () { repaints += 1; } }));
    assert.ok(html0.indexOf('불러오는 중') >= 0);
    await settle();
    assert.strictEqual(hc.view().status, 'ok');
    assert.ok(repaints >= 1);
    assert.strictEqual(calls[0].url, '/institutions/11010/head');
    assert.strictEqual(calls[0].init.method, 'GET');
    assert.strictEqual(calls[0].init.headers['X-Screen-Id'], 'head_card');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'open_card');
    const html1 = hc.paneSection({ institutionId: '11010' }, env());
    assert.ok(html1.indexOf('hc-card') >= 0 && html1.indexOf('서지운') >= 0);
    assert.strictEqual(calls.length, 1);                 // 같은 기관을 보는 동안 다시 읽지 않는다(열람 기록이 쌓이지 않게)
    hc.paneSection({ institutionId: '11011' }, env());   // 기관이 바뀌면 새로 읽는다
    await settle();
    assert.strictEqual(calls.filter(function (c) { return /head$/.test(c.url); }).length, 2);
    assert.strictEqual(hc.view().instId, '11011');
  } finally { cleanup(); }
});

test('ensure: 기관 id는 주소에 인코딩해서 싣는다', async function () {
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    await hc.ensure('a b/c', function () {});
    assert.strictEqual(calls[0].url, '/institutions/a%20b%2Fc/head');
  } finally { cleanup(); }
});

test('ensure: head:null → 정보 없음 + [기관장 추가]', async function () {
  fakeFetch(function () { return { status: 200, json: { institution_id: '11010', viewer_role: '영업팀', head: null, candidates: [], candidate_heads: [] } }; });
  try {
    await hc.ensure('11010', function () {});
    assert.strictEqual(hc.view().status, 'none');
    const h = hc.sectionHtml(hc.view(), env());
    assert.ok(h.indexOf('data-hc="add-head"') >= 0 && h.indexOf('hc-card') < 0);
  } finally { cleanup(); }
});

test('ensure: 오류 응답을 상태로 나눈다(404 FEATURE_OFF=사용 안 함, 404=서버에 없는 기관, 403, 401, 500, 연결 실패)', async function () {
  const cases = [
    [{ status: 404, json: { detail: { code: 'FEATURE_OFF', message: '이 기능은 꺼져 있습니다.' } } }, 'off', '사용 안 함'],
    [{ status: 404, json: { detail: 'not found' } }, 'notfound', '서버에 등록된 기관만'],
    [{ status: 403, json: { detail: '이 기능을 쓸 권한이 없습니다.' } }, 'denied', '이 정보를 볼 권한이 없습니다'],
    [{ status: 401, json: { detail: '사번이 필요합니다.' } }, 'login', '다시 로그인'],
    [{ status: 500, json: { detail: '서버 오류가 발생했습니다.' } }, 'error', '서버 오류가 발생했습니다.'],
    [{ status: 502 }, 'error', '불러오지 못했습니다'],
    [{ fail: true }, 'error', '서버에 연결하지 못했습니다'],
  ];
  try {
    for (let i = 0; i < cases.length; i += 1) {
      const c = cases[i];
      fakeFetch(function () { return c[0]; });
      hc.reset();
      await hc.ensure('11010', function () {});
      assert.strictEqual(hc.view().status, c[1], c[1]);
      assert.ok(hc.sectionHtml(hc.view(), env()).indexOf(c[2]) >= 0, c[1] + ' → ' + c[2]);
    }
  } finally { cleanup(); }
});

test('사진: 카드가 사진 번호로 본문을 받아(photo_view) Blob 주소로 보여 준다', async function () {
  const photo = { photo_id: 3, license_cd: 'INST_PERMIT', source: { kind: 'HOMEPAGE', title: '시청 누리집', url: null, checked_on: '2026-11-03' }, checked_on: '2026-11-03', uploaded_by: '1001' };
  const calls = fakeFetch(function (url) {
    if (/content$/.test(url)) return { status: 200 };
    return { status: 200, json: detail({ head: { photo: photo } }) };
  });
  try {
    await hc.ensure('11010', function () {});
    await settle();
    const pc = calls.filter(function (c) { return /\/head\/photos\/3\/content$/.test(c.url); })[0];
    assert.ok(pc);
    assert.strictEqual(pc.init.headers['X-Screen-Id'], 'head_card');
    assert.strictEqual(pc.init.headers['X-Button-Id'], 'photo_view');
    assert.ok(/^blob:/.test(hc.view().photo.url));
    const h = hc.sectionHtml(hc.view(), env());
    assert.ok(h.indexOf('<img src="blob:') >= 0 && h.indexOf('기관 직접 허락') >= 0);
  } finally { cleanup(); }
});

test('사진: 본문 요청이 실패하면 실루엣과 안내(카드는 그대로)', async function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: { kind: 'HOMEPAGE', title: 't', url: null, checked_on: '2026-11-03' }, checked_on: '2026-11-03', uploaded_by: '1001' };
  fakeFetch(function (url) {
    if (/content$/.test(url)) return { status: 500, json: { detail: '사진을 읽지 못했습니다.' } };
    return { status: 200, json: detail({ head: { photo: photo } }) };
  });
  try {
    await hc.ensure('11010', function () {});
    await settle();
    assert.strictEqual(hc.view().photo.state, 'err');
    const h = hc.sectionHtml(hc.view(), env());
    assert.ok(h.indexOf('사진을 불러오지 못했습니다') >= 0 && h.indexOf('hc-sil') >= 0 && h.indexOf('hc-card') >= 0);
  } finally { cleanup(); }
});

// ── 요청 본문·업로드 ───────────────────────────────────────────────
test('업로드 요청: 멀티파트에 파일·대상 기관장·이용 조건(license_cd)·출처·확인일, 화면 ID·버튼 ID는 헤더', async function () {
  const calls = fakeFetch(function () { return { status: 201, json: { photo_id: 4, head_id: 7, replaced_photo_id: null } }; });
  try {
    const file = new Blob(['abc'], { type: 'image/jpeg' });
    const res = await hc.uploadPhoto('11010', 7, { license_cd: 'KOGL1', src_kind: 'HOMEPAGE', src_title: ' 가람시 보도자료 ', src_url: ' https://a.kr/p ', checked_on: '2026-11-12' }, file);
    assert.strictEqual(res.photo_id, 4);
    const c = calls[0];
    assert.strictEqual(c.url, '/institutions/11010/head/photos');
    assert.strictEqual(c.init.method, 'POST');
    assert.strictEqual(c.init.headers['X-Screen-Id'], 'head_card');
    assert.strictEqual(c.init.headers['X-Button-Id'], 'photo_upload');
    assert.strictEqual(c.init.headers['Content-Type'], undefined);          // 멀티파트 경계는 브라우저가 정한다
    const fd = c.init.body;
    assert.ok(fd instanceof FormData);
    assert.strictEqual(fd.get('license_cd'), 'KOGL1');
    assert.strictEqual(fd.get('head_id'), '7');
    assert.strictEqual(fd.get('src_kind'), 'HOMEPAGE');
    assert.strictEqual(fd.get('src_title'), '가람시 보도자료');
    assert.strictEqual(fd.get('src_url'), 'https://a.kr/p');
    assert.strictEqual(fd.get('checked_on'), '2026-11-12');
    assert.ok(fd.get('file'));
    // 출처 주소가 비면 보내지 않는다
    const fd2 = hc.buildPhotoForm(7, { license_cd: 'KOGL1', src_kind: 'HOMEPAGE', src_title: 't', src_url: '  ', checked_on: '2026-11-12' }, file);
    assert.strictEqual(fd2.has('src_url'), false);
  } finally { cleanup(); }
});

test('photoCheck: 이용 조건 선택 필수·5MB·확장자를 올리기 전에 안내', function () {
  const ok = { name: 'a.JPG', size: 1000 };
  const v = { license_cd: 'KOGL1' };
  assert.strictEqual(hc.photoCheck(v, ok), '');
  assert.ok(hc.photoCheck(v, null).indexOf('사진 파일') >= 0);
  assert.ok(hc.photoCheck({ license_cd: '' }, ok).indexOf('이용 조건') >= 0);
  assert.ok(hc.photoCheck(v, { name: 'a.jpg', size: hc.PHOTO_MAX_BYTES + 1 }).indexOf('5MB') >= 0);
  assert.strictEqual(hc.photoCheck(v, { name: 'a.jpg', size: hc.PHOTO_MAX_BYTES }), '');
  assert.ok(hc.photoCheck(v, { name: 'a.gif', size: 10 }).indexOf('JPG 또는 PNG') >= 0);
  assert.strictEqual(hc.photoCheck(v, { name: 'a.png', size: 10 }), '');
  assert.deepStrictEqual(hc.LICENSES.map(function (l) { return l.cd; }), ['KOGL1', 'INST_PERMIT']);   // 서버가 받는 이용 조건만
});

test('칸 후보 본문: 종류별 값 키(value·date·flag·from·to)와 출처 묶음', function () {
  const v = { value: ' 가람시의회 의원 ', from: '2018', to: '', src_kind: 'NEC', src_title: '선관위', src_url: '', checked_on: '2026-11-12' };
  assert.deepStrictEqual(hc.buildItemBody('7', 'CAREER', v), { head_id: 7, field_cd: 'CAREER', source: { kind: 'NEC', title: '선관위', checked_on: '2026-11-12' }, value: '가람시의회 의원', from: '2018' });
  assert.deepStrictEqual(hc.buildItemBody(7, 'TERM_END', { date: '2030-06-30', src_kind: 'NEC', src_title: 't', checked_on: '2026-11-12' }).date, '2030-06-30');
  assert.strictEqual(hc.buildItemBody(7, 'ACTING', { flag: '1', src_kind: 'NEC', src_title: 't', checked_on: '2026-11-12' }).flag, 1);
  assert.strictEqual(hc.buildItemBody(7, 'ACTING', { flag: '0', src_kind: 'NEC', src_title: 't', checked_on: '2026-11-12' }).flag, 0);
  const n = hc.buildItemBody(7, 'NAME', { value: '서지운', src_kind: 'NEC', src_title: 't', src_url: 'https://a.kr', checked_on: '2026-11-12' });
  assert.strictEqual(n.value, '서지운'); assert.strictEqual(n.source.url, 'https://a.kr'); assert.strictEqual(n.from, undefined);
  assert.strictEqual(hc.FIELDS.length, 9);
  assert.deepStrictEqual(hc.FIELDS.map(function (f) { return f.cd; }), ['NAME', 'POSITION', 'ACTING', 'FIRST_TAKE_OFFICE', 'TERM_START', 'TERM_END', 'EDU', 'CAREER', 'BIRTH_DATE']);
  assert.strictEqual(hc.fieldOf('BIRTH_DATE').kind, 'birth');
  assert.deepStrictEqual(hc.buildItemBody(7, 'BIRTH_DATE', { date: ' 1965-03-02 ', src_kind: 'NEC', src_title: 't', checked_on: '2026-11-12' }),
    { head_id: 7, field_cd: 'BIRTH_DATE', source: { kind: 'NEC', title: 't', checked_on: '2026-11-12' }, date: '1965-03-02' });   // value가 아니라 date
});

test('기관장 등록 본문: 선택 칸은 비면 보내지 않고, 권한대행은 불리언', function () {
  const src = { src_kind: 'HOMEPAGE', src_title: '누리집', checked_on: '2026-11-12' };
  const a = hc.buildHeadBody(Object.assign({ name: '서지운', position: '가람시장', acting: '', first_take_office: '', term_start: '', term_end: '' }, src));
  assert.deepStrictEqual(Object.keys(a).sort(), ['name', 'position', 'source']);
  const b = hc.buildHeadBody(Object.assign({ name: '서지운', position: '가람시장', acting: '1', first_take_office: '2022-07-01', term_start: '2026-07-01', term_end: '2030-06-30' }, src));
  assert.strictEqual(b.acting, true); assert.strictEqual(b.term_end, '2030-06-30'); assert.strictEqual(b.first_take_office, '2022-07-01');
  assert.strictEqual(hc.buildHeadBody(Object.assign({ name: 'a', position: 'b', acting: '0' }, src)).acting, false);
});

test('쓰기 요청: 항목 후보·기관장 등록은 JSON 본문 + 화면·버튼 ID', async function () {
  const calls = fakeFetch(function () { return { status: 202, json: { item_id: 1, head_id: 7, state: 'CANDIDATE', conflict: true } }; });
  try {
    const src = { src_kind: 'HOMEPAGE', src_title: '누리집', checked_on: '2026-11-12' };
    await hc.addItem('11010', 7, 'POSITION', Object.assign({ value: '직무대행' }, src));
    await hc.addHead('11010', Object.assign({ name: '김후보', position: '시장' }, src));
    assert.strictEqual(calls[0].url, '/institutions/11010/head/items');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'item_add');
    assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json');
    assert.strictEqual(JSON.parse(calls[0].init.body).field_cd, 'POSITION');
    assert.strictEqual(calls[1].url, '/institutions/11010/heads');
    assert.strictEqual(calls[1].init.headers['X-Button-Id'], 'head_add');
    assert.strictEqual(calls[1].init.headers['X-Screen-Id'], 'head_card');
  } finally { cleanup(); }
});

test('오류 문구: 서버 문구(금지 표현 등)는 그대로, 없으면 상태별 안내', async function () {
  assert.strictEqual(hc.errText(400, { code: 'FORBIDDEN_CONTENT', message: '정당·범죄 관련 표현은 저장할 수 없습니다.' }), '정당·범죄 관련 표현은 저장할 수 없습니다.');
  assert.strictEqual(hc.errText(409, { code: 'STATE_CHANGED', message: '그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.' }), '그 사이 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.');
  assert.strictEqual(hc.errText(400, '문자열 문구'), '문자열 문구');
  assert.ok(hc.errText(0, undefined).indexOf('서버에 연결하지 못했습니다') >= 0);
  assert.ok(hc.errText(401, undefined).indexOf('다시 로그인') >= 0);
  assert.ok(hc.errText(403, undefined).indexOf('권한') >= 0);
  assert.ok(hc.errText(404, 'not found').indexOf('대상을 찾지 못했습니다') >= 0);
  assert.ok(hc.errText(413, undefined).indexOf('5MB') >= 0);
  assert.strictEqual(hc.errText(500, undefined), '처리하지 못했습니다 (500)');
  // 요청이 실패하면 status·detail이 달린 Error로 올라온다
  fakeFetch(function () { return { status: 422, json: { detail: { code: 'LICENSE_NOT_ALLOWED', message: '허용되지 않는 이용 조건입니다.' } } }; });
  try {
    await hc.uploadPhoto('11010', 7, { license_cd: 'KOGL2', src_kind: 'HOMEPAGE', src_title: 't', checked_on: '2026-11-12' }, new Blob(['a']));
    assert.fail('올라가면 안 된다');
  } catch (e) {
    assert.strictEqual(e.status, 422);
    assert.strictEqual(hc.errText(e.status, e.detail), '허용되지 않는 이용 조건입니다.');
  } finally { cleanup(); }
  // 모달에서 보일 때는 이스케이프된다
  const html = hc.modalHtml(view(), { msg: { text: '<script>x</script>', err: true } }, { today: TODAY, emp: '1' });
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.ok(html.indexOf('role="alert"') >= 0 && html.indexOf('&lt;script&gt;x') >= 0);
});

// ── 편집 모달 마크업 ───────────────────────────────────────────────
function cand(id, extra) {
  return Object.assign({ item_id: id, head_id: 7, field_cd: 'POSITION', value: '직무대행', source: SRC, created_by: '1001', conflict: true,
    can_confirm: true, can_reject: true, block_code: null, reject_block_code: null }, extra || {});
}

test('모달: 항목 종류 8종·출처 종류 7종·이용 조건(필수, 선택지 2개)·파일 형식 안내', function () {
  const h = hc.modalHtml(view(), {}, { today: TODAY, emp: '2002' });
  ['이름', '직위', '권한대행 여부', '첫 취임일', '현 임기 시작일', '임기 만료일', '학력', '경력'].forEach(function (l) { assert.ok(h.indexOf('>' + l + '</option>') >= 0, l); });
  ['기관 누리집', '중앙선거관리위원회', '알리오', '클린아이', '관보·고시', '언론 보도', '기타 공개 자료'].forEach(function (l) { assert.ok(h.indexOf('>' + l + '</option>') >= 0, l); });
  assert.ok(h.indexOf('name="license_cd" required') >= 0 && h.indexOf('value="KOGL1"') >= 0 && h.indexOf('value="INST_PERMIT"') >= 0);
  assert.ok(h.indexOf('KOGL2') < 0);                                                    // 서버가 받지 않는 이용 조건은 고르게 하지 않는다
  assert.ok(h.indexOf('JPG 또는 PNG, 5MB 이하') >= 0 && h.indexOf('name="file"') >= 0);
  assert.ok(h.indexOf('role="dialog" aria-modal="true" aria-labelledby="hc-m-title"') >= 0);
  assert.ok(h.indexOf('정당 직책·범죄 경력은 저장되지 않습니다') >= 0);
  assert.ok(h.indexOf('max="2026-11-12" value="2026-11-12"') >= 0);                    // 확인한 날은 오늘 이하
});

test('모달: 기관장이 없으면 입력 틀은 기관장 등록, 있으면 항목 후보·사진·교체 후보', function () {
  const none = hc.modalHtml(view({ head: null }, { status: 'none' }), {}, { today: TODAY, emp: '2002' });
  assert.ok(none.indexOf('data-form="add-head"') >= 0 && none.indexOf('data-form="add-item"') < 0 && none.indexOf('data-form="photo"') < 0);
  assert.ok(none.indexOf('id="hf-name"') >= 0 && none.indexOf('>추가</button>') >= 0);
  const has = hc.modalHtml(view(), {}, { today: TODAY, emp: '2002' });
  assert.ok(has.indexOf('data-form="add-item"') >= 0 && has.indexOf('data-form="photo"') >= 0 && has.indexOf('data-form="add-head"') >= 0);
  assert.strictEqual((has.match(/id="hf-name"/g) || []).length, 1);                       // id 중복 없음
});

test('모달: 항목 종류에 따라 값 칸 모양이 바뀐다', function () {
  assert.ok(hc.valueRowHtml('NAME').indexOf('type="text" name="value" maxlength="30"') >= 0);
  assert.ok(hc.valueRowHtml('POSITION').indexOf('maxlength="40"') >= 0);
  assert.ok(hc.valueRowHtml('ACTING').indexOf('<select name="flag">') >= 0);
  assert.ok(hc.valueRowHtml('TERM_END').indexOf('type="date" name="date"') >= 0);
  const career = hc.valueRowHtml('CAREER');
  assert.ok(career.indexOf('name="from"') >= 0 && career.indexOf('name="to"') >= 0 && career.indexOf('maxlength="60"') >= 0);
});

test('모달: 기각은 바로 되지 않고 모달 안 2단계(사유 입력 + 확인 버튼), confirm()은 쓰지 않는다', function () {
  const v = view({ candidates: [cand(9)] });
  const before = hc.modalHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.ok(before.indexOf('data-m="ask-reject-item" data-id="9"') >= 0);
  assert.ok(before.indexOf('id="hc-reason"') < 0 && before.indexOf('data-m="do"') < 0);       // 1단계: 요청만, 확인 상자 없음
  assert.ok(before.indexOf('data-m="confirm-item" data-id="9"') >= 0);                        // 확정은 한 번에
  const pend = { act: 'reject-item', id: '9', self: false, reason: true, go: '기각하기', text: '이 후보를 기각합니다.' };
  const after = hc.modalHtml(v, { pending: pend }, { today: TODAY, emp: '2002' });
  assert.ok(after.indexOf('id="hc-reason"') >= 0 && after.indexOf('maxlength="200"') >= 0);
  assert.ok(after.indexOf('data-m="do" class="hc-danger">기각하기') >= 0 && after.indexOf('data-m="cancel"') >= 0);
  assert.ok(after.indexOf('role="group" aria-labelledby="hc-pb-t"') >= 0);
  // 다른 행의 확인 상자는 열리지 않는다
  const other = hc.modalHtml(view({ candidates: [cand(9), cand(10)] }), { pending: pend }, { today: TODAY, emp: '2002' });
  assert.strictEqual((other.match(/id="hc-reason"/g) || []).length, 1);
  const src = fs.readFileSync(path.join(ROOT, 'js/headcard.js'), 'utf8');
  assert.ok(!/\bconfirm\(/.test(src.replace(/ask-confirm-head|confirm-item|confirm-head|'confirm'/g, '')));
});

test('모달: 무효 처리(확정값·사진)도 2단계, 본인 후보는 [회수]', function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '2002' };
  const v = view({ viewer_role: '영업팀장', head: { photo: photo }, candidates: [cand(9, { created_by: '2002' })] });
  const ctx = { today: TODAY, emp: '2002' };
  const h = hc.modalHtml(v, {}, ctx);
  assert.ok(h.indexOf('data-m="ask-void-item"') >= 0 && h.indexOf('data-m="ask-void-photo" data-id="3"') >= 0);
  assert.ok(h.indexOf('data-self="1"') >= 0 && h.indexOf('>회수</button>') >= 0);
  const pv = hc.modalHtml(v, { pending: { act: 'void-photo', id: '3', reason: true, go: '무효 처리하기', text: 't' } }, ctx);
  assert.ok(pv.indexOf('id="hc-reason"') >= 0 && pv.indexOf('data-m="do" class="hc-danger">무효 처리하기') >= 0);
});

test('모달: 무효 처리 버튼은 넣은 사람 또는 팀장·부장에게만(canVoid)', function () {
  assert.strictEqual(hc.canVoid('1001', '영업팀', '1001'), true);
  assert.strictEqual(hc.canVoid('1001', '영업팀', '2002'), false);
  assert.strictEqual(hc.canVoid('1001', '영업팀장', '2002'), true);
  assert.strictEqual(hc.canVoid('1001', '영업부장', '2002'), true);
  assert.strictEqual(hc.canVoid('', '영업팀', ''), false);
  const member = hc.modalHtml(view(), {}, { today: TODAY, emp: '2002' });
  assert.strictEqual((member.match(/data-m="ask-void-item"/g) || []).length, 0);           // 남이 넣은 값은 못 무효
  const lead = hc.modalHtml(view({ viewer_role: '영업팀장' }), {}, { today: TODAY, emp: '2002' });
  assert.ok((lead.match(/data-m="ask-void-item"/g) || []).length >= 8);                    // 확정값 5칸 + 학력 1 + 경력 2
});

test('모달: 서버가 막은 확정·기각은 눌리지 않고 이유를 말한다', function () {
  const v = view({ candidates: [cand(9, { can_confirm: false, block_code: 'LEAD_ONLY', can_reject: false, reject_block_code: 'OWN_VALUE_GUARD' })] });
  const h = hc.modalHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.ok(/data-m="confirm-item" data-id="9"[^>]*disabled/.test(h));
  assert.ok(/data-m="ask-reject-item" data-id="9"[^>]*disabled/.test(h));
  assert.ok(h.indexOf('충돌하는 값은 영업팀장 또는 영업부장만 처리할 수 있습니다.') >= 0);
  assert.ok(h.indexOf('본인이 입력·확정한 값과 충돌하는 후보는 직접 기각할 수 없습니다.') >= 0);
  assert.ok(h.indexOf('확정값과 다름') >= 0);
});

test('모달: 후보 기관장 확정은 현 기관장이 바뀐다는 확인 단계를 거친다', function () {
  const v = view({ candidate_heads: [{ head_id: 9, name: '김후보', position: '시장', created_by: '1001', item_count: 2, can_confirm: true, can_reject: true }] });
  const h = hc.modalHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.ok(h.indexOf('data-m="ask-confirm-head" data-id="9"') >= 0 && h.indexOf('data-m="ask-reject-head" data-id="9"') >= 0);
  assert.ok(h.indexOf('현 기관장 서지운과 충돌') >= 0);
  const p = hc.modalHtml(v, { pending: { act: 'confirm-head', id: '9', reason: false, go: '기관장으로 확정하기', text: '확정하면 현재 기관장(서지운)이 이전 기관장으로 바뀝니다.' } }, { today: TODAY, emp: '2002' });
  assert.ok(p.indexOf('이전 기관장으로 바뀝니다') >= 0 && p.indexOf('id="hc-reason"') < 0 && p.indexOf('data-m="do"') >= 0);
});

test('모달: 무효 처리한 사진의 복원 버튼은 없다(서버가 직전 사진을 자동 복원, VOIDED는 복원 불가 409)', function () {
  const lead = hc.modalHtml(view({ viewer_role: '영업부장' }), { voidedPhoto: 5 }, { today: TODAY, emp: '2002' });
  assert.ok(lead.indexOf('restore-photo') < 0 && lead.indexOf('사진 복원') < 0);
  const src = fs.readFileSync(path.join(ROOT, 'js/headcard.js'), 'utf8');
  assert.ok(src.indexOf('M.voidedPhoto') < 0 && src.indexOf("'restore'") < 0);
});

test('모달: 후보 기관장 행에 서버가 준 항목(임기일·학력·경력)과 출처 요약, 이스케이프 유지', function () {
  const evil = '<img src=x onerror=1>';
  const items = [
    { item_id: 31, field_cd: 'TERM_END', value: '2030-06-30', source: { kind: 'NEC', title: '당선인 정보', url: 'https://nec.go.kr/x', checked_on: '2026-11-02' }, created_by: '1001' },
    { item_id: 32, field_cd: 'CAREER', value: evil, from: '2018', to: '2022', source: { kind: 'OTHER', title: 't', url: 'javascript:alert(1)', checked_on: '2026-11-02' }, created_by: '1001' },
  ];
  const v = view({ candidate_heads: [{ head_id: 9, name: '김후보', position: '시장', created_by: '1001', item_count: 2, items: items, can_confirm: true, can_reject: true }] });
  const h = hc.modalHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.ok(h.indexOf('임기 만료일') >= 0 && h.indexOf('2030-06-30') >= 0 && h.indexOf('당선인 정보') >= 0 && h.indexOf('href="https://nec.go.kr/x"') >= 0);
  assert.ok(h.indexOf('2018~2022') >= 0 && h.indexOf('<img src=x') < 0 && h.indexOf('&lt;img src=x') >= 0);
  assert.ok(h.indexOf('javascript:') < 0 || h.indexOf('href="javascript:') < 0);
  const many = hc.modalHtml(view({ candidate_heads: [{ head_id: 9, name: 'a', position: 'b', created_by: '1', item_count: 8, items: [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return Object.assign({}, items[0], { item_id: i }); }), can_confirm: true, can_reject: true }] }), {}, { today: TODAY, emp: '2002' });
  assert.ok(many.indexOf('외 2건') >= 0);
  assert.ok(hc.modalHtml(view({ candidate_heads: [{ head_id: 9, name: 'a', position: 'b', created_by: '1', item_count: 0, can_confirm: true, can_reject: true }] }), {}, { today: TODAY, emp: '2002' }).indexOf('항목 0건') >= 0);   // items 없어도 깨지지 않는다
});

test('모달: 행 id·설명 연결 속성은 이스케이프된다', function () {
  const bad = '9" onfocus="x';
  const v = view({ candidates: [cand(bad, { can_confirm: false, block_code: 'LEAD_ONLY' })],
    candidate_heads: [{ head_id: bad, name: 'a', position: 'b', created_by: '1', item_count: 0, can_confirm: false, block_code: 'SELF_RESOLVE', can_reject: true }] });
  const h = hc.modalHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.strictEqual(h.indexOf('" onfocus="'), -1);
  assert.ok(h.indexOf('id="hc-wc-9&quot; onfocus=&quot;x"') >= 0 && h.indexOf('id="hc-hc-9&quot; onfocus=&quot;x"') >= 0);
});

// ── 계약: 서버 허용 목록·대시보드·스타일 ──────────────────────────
test('화면 이름·버튼 ID는 서버 HeadUiIds 허용 목록 안의 값이다', function () {
  const p = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'HeadUiIds.java');
  if (!fs.existsSync(p)) return;   // 서버 소스가 없는 체크아웃에서는 건너뛴다
  const java = fs.readFileSync(p, 'utf8');
  const screens = /SCREENS = [\s\S]*?asList\(([\s\S]*?)\)\)\);/.exec(java)[1].match(/"[a-z_]+"/g).map(function (s) { return s.slice(1, -1); });
  const buttons = /BUTTONS = [\s\S]*?asList\(([\s\S]*?)\)\)\);/.exec(java)[1].match(/"[a-z_]+"/g).map(function (s) { return s.slice(1, -1); });
  assert.ok(screens.indexOf(hc.SCREEN) >= 0, hc.SCREEN);
  assert.ok(screens.indexOf('map_popover') >= 0, 'map_popover');   // 지도 상세 팝업의 기관장 조회 화면 이름(dashboard.js)
  Object.keys(hc.BTN).forEach(function (k) { assert.ok(buttons.indexOf(hc.BTN[k]) >= 0, hc.BTN[k]); });
});

test('대시보드 상세: headHtml이 있으면 그것을, 없으면 예전 자리표시를 쓴다', function () {
  const rec = { name: '가람시', region: '11', type: '지자체', contractEnd: logic.localDateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + 40)), confirmed: true, institutionId: '11010' };
  const it = dash.model([rec], TODAY).upcoming[0];
  const h = dash.paneHtml(it, { act: 'none', today: TODAY, headHtml: hc.sectionHtml({ status: 'noid' }, {}) });
  assert.ok(h.indexOf('hc-sec') >= 0 && h.indexOf('서버에 등록된 기관만 기관장 정보를 관리합니다') >= 0);
  assert.ok(h.indexOf('기관장 프로필은 수집 예정입니다.') < 0);
  assert.ok(dash.paneHtml(it, { act: 'none', today: TODAY }).indexOf('기관장 프로필은 수집 예정입니다.') >= 0);
});

test('배선: 대시보드가 headcard에 상세 절·클릭·정리를 맡긴다, 스크립트는 dashboard.js 앞', function () {
  const d = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8');
  assert.ok(d.indexOf('root.headcard.paneSection(it.rec, headEnv(it))') >= 0);
  assert.ok(d.indexOf("t.closest('[data-hc]')") >= 0 && d.indexOf('root.headcard.onPaneClick(') >= 0);
  assert.ok(d.indexOf('root.headcard.reset()') >= 0);
  assert.ok(/headHtml: headSection\(it\)/.test(d));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('<script src="js/headcard.js"></script>');
  assert.ok(a > html.indexOf('<script src="js/errtext.js"></script>'));
  assert.ok(a > html.indexOf('<script src="js/logic.js"></script>'));
  assert.ok(a < html.indexOf('<script src="js/dashboard.js"></script>'));
});

test('CSS 블록: 새 hex 없음·12px 미만 글자 없음·움직임 없음', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 기관장 카드 시작'), b = html.indexOf('/* 기관장 카드 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g), null);
  (css.match(/font(?:-size)?:\s*[^;}]*?(\d+(?:\.\d+)?)px/g) || []).forEach(function (m) {
    assert.ok(Number(/(\d+(?:\.\d+)?)px/.exec(m)[1]) >= 12 || /\d+px\/|28px/.test(m), '12px 미만: ' + m);
  });
  assert.ok(/\.hc-big b \{[^}]*font:700 28px/.test(css));
  assert.ok(/\.modal-box\.hc-modal \{/.test(css));
  assert.ok(!/animation|transition/.test(css));                                   // 움직임 없음(감소 설정과 충돌할 일이 없다)
});

// ── 검토 지적 반영(2026-11-12) ─────────────────────────────────────
test('배선: app.js가 로그아웃(세션 지우기 전)과 프로필 변경에서 headcard.onProfileChange를 부른다', function () {
  const a = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const call = 'root.headcard.onProfileChange()';
  assert.ok(a.indexOf(call) >= 0);
  assert.ok(a.indexOf(call) < a.indexOf('app.onProfileChanged = function') + 400 && a.indexOf(call) > a.indexOf('app.onProfileChanged = function'));
  const lo = a.indexOf('app.logout = function');
  const lg = a.indexOf(call, lo);
  assert.ok(lg > lo && lg < a.indexOf('root.store.clearSession()', lo));   // clearSession 직전에
});

test('공고 진행 중 기관: 접수 중이면 마감 D-n(출처: 공고), 그 밖은 공고 진행 중 칩, 임기를 알면 임기가 먼저', function () {
  const noTerm = view({ head: { term_end: null, fields: { NAME: field(1, '서지운') } } });
  const b = hc.bigInfo(noTerm.data.head, { notice: true, receiving: true, days: 5, date: '2026-11-17' }, TODAY);
  assert.strictEqual(b.type, 'notice'); assert.strictEqual(b.big, 'D-5'); assert.strictEqual(b.text, '마감 D-5');
  assert.strictEqual(hc.bigInfo(noTerm.data.head, { notice: true, receiving: true, days: 0, date: '2026-11-12' }, TODAY).big, 'D-day');
  const recv = hc.cardHtml(noTerm, { today: TODAY, bid: { notice: true, receiving: true, days: 5, date: '2026-11-17' } });
  assert.ok(recv.indexOf('<b aria-hidden="true">D-5</b>') >= 0 && recv.indexOf('aria-label="마감 D-5"') >= 0 && recv.indexOf('출처: 공고') >= 0 && recv.indexOf('2026-11-17') >= 0);
  assert.ok(recv.indexOf('모릅니다') < 0);
  [{ notice: true, receiving: false, days: null, date: '' }, { notice: true, receiving: true, days: -3, date: '2026-11-09' }].forEach(function (bid) {
    const chipHtml = hc.cardHtml(noTerm, { today: TODAY, bid: bid });
    assert.ok(chipHtml.indexOf('공고 진행 중') >= 0 && chipHtml.indexOf('모릅니다') < 0 && chipHtml.indexOf('출처: 공고') >= 0);
  });
  const known = hc.bigInfo(detail().head, { notice: true, receiving: true, days: 5, date: '2026-11-17' }, TODAY);
  assert.strictEqual(known.type, 'term');
});

test('사진 불러오는 중에도 실루엣은 장식(aria-hidden) — 캡션이 한 번만 읽힌다(design 11-20 P3-C)', function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '1001' };
  const loading = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: '', state: 'loading' } }), { today: TODAY });
  assert.ok(loading.indexOf('aria-label="사진 불러오는 중"') < 0 && /class="hc-sil"[^>]*aria-hidden="true"/.test(loading) && loading.indexOf('사진 불러오는 중…') >= 0);
  // 사진 없음: 실루엣은 장식(aria-hidden), 캡션 '사진 없음'이 한 번만 읽힌다(design 11-15 P3-1)
  const noPhoto = hc.cardHtml(view(), { today: TODAY });
  assert.ok(noPhoto.indexOf('aria-label="사진 없음"') < 0 && /class="hc-sil"[^>]*aria-hidden="true"/.test(noPhoto));
  assert.ok(/<p class="hc-cap">사진 없음<\/p>/.test(noPhoto));
});

test('ensure: 사번이 달라지면 같은 기관이어도 다시 읽고, onProfileChange는 상태를 비운다', async function () {
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    const rec = { institutionId: '11010' };
    hc.paneSection(rec, env({ emp: '2002' }));
    await settle();
    hc.paneSection(rec, env({ emp: '2002' }));
    assert.strictEqual(calls.length, 1);
    hc.paneSection(rec, env({ emp: '3003' }));          // 사용자 전환
    await settle();
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(hc.view().emp, '3003');
    hc.onProfileChange();
    assert.strictEqual(hc.view().status, 'idle');
    assert.strictEqual(hc.view().instId, '');
    assert.strictEqual(hc.view().data, null);
  } finally { cleanup(); }
});

test('ensure: 기관을 짧은 간격으로 3번 고르면 요청은 1번(400ms 대기, 앞 선택은 취소)', async function (t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  hc.DEBOUNCE_MS = 400;
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    hc.paneSection({ institutionId: '11010' }, env());
    t.mock.timers.tick(100);
    hc.paneSection({ institutionId: '11020' }, env());
    t.mock.timers.tick(100);
    hc.paneSection({ institutionId: '11030' }, env());
    hc.paneSection({ institutionId: '11030' }, env());   // 같은 기관을 다시 그려도 대기가 다시 시작되지 않는다
    t.mock.timers.tick(399);
    await settle();
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(hc.view().status, 'loading');
    t.mock.timers.tick(1);
    await settle();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/institutions/11030/head');
    assert.strictEqual(hc.view().status, 'ok');
  } finally { hc.DEBOUNCE_MS = 0; cleanup(); }
});

test('사진: 받는 중에 다시 읽어도 본문 요청은 한 번(중복 요청 없음)', async function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '1001' };
  const calls = fakeFetch(function (url) {
    if (/content$/.test(url)) return { status: 200 };
    return { status: 200, json: detail({ head: { photo: photo } }) };
  });
  try {
    await hc.ensure('11010', function () {}, '2002');
    hc.refresh(true, 'refresh'); hc.refresh(true, 'refresh');
    await settle();
    assert.strictEqual(calls.filter(function (c) { return /content$/.test(c.url); }).length, 1);
    assert.ok(/^blob:/.test(hc.view().photo.url));
  } finally { cleanup(); }
});

// 가짜 DOM — openModal·act·doPending·closeModal 흐름을 노드에서 돌린다.
function fakeDom() {
  const stubs = {};
  function el(name) {
    if (!stubs[name]) {
      const cls = new Set(), attrs = {};
      stubs[name] = { innerHTML: '', value: '', focused: 0, cls: cls,
        classList: { add: function (c) { cls.add(c); }, remove: function (c) { cls.delete(c); } },
        focus: function () { this.focused += 1; }, setAttribute: function (k, v) { attrs[k] = v; }, removeAttribute: function (k) { delete attrs[k]; },
        getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; } };
    }
    return stubs[name];
  }
  const map = { '#hc-m-status': 'status', '#hc-m-lists': 'lists', '#hc-m-forms': 'forms', '.hc-modal': 'modal', '#hc-m-title': 'title', '#hc-reason': 'reason', '[data-m=do]': 'do', '#hf-name': 'hfname', '#hc-valrow': 'valrow', '#hc-birth': 'birth' };
  const modalEl = { handlers: {}, parentNode: null,
    addEventListener: function (t, f) { this.handlers[t] = f; },
    querySelector: function (sel) { return map[sel] ? el(map[sel]) : null; },
    querySelectorAll: function () { return []; }, contains: function () { return true; } };
  const body = { appendChild: function (e) { e.parentNode = body; }, removeChild: function (e) { e.parentNode = null; }, contains: function () { return true; } };
  global.document = { activeElement: null, body: body, getElementById: function () { return el('opener'); },
    createElement: function () { return { firstChild: null, set innerHTML(h) { this.firstChild = modalEl; } }; } };
  return {
    el: el, modalEl: modalEl,
    click: function (dataM, id, f) {
      const b = { getAttribute: function (k) { return ({ 'data-m': dataM, 'data-id': id, 'data-self': '0', 'data-f': f })[k] || null; } };
      modalEl.handlers.click({ target: { closest: function () { return b; } } });
    },
    off: function () { delete global.document; },
  };
}

test('모달 흐름(가짜 DOM): 사진 무효 → 확인 → 사유 → 요청 → 안내(restored_photo_id) → 자동 재조회는 같은 버튼 ID → 닫기', async function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '2002' };
  const photo2 = Object.assign({}, photo, { photo_id: 2 });
  let voided = false;
  const calls = fakeFetch(function (url, init) {
    if (init.method === 'POST' && /\/void$/.test(url)) { voided = true; return { status: 200, json: { photo_id: 3, restored_photo_id: 2 } }; }
    if (/content$/.test(url)) return { status: 200 };
    return { status: 200, json: detail({ viewer_role: '영업팀장', head: { photo: voided ? photo2 : photo } }) };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    assert.strictEqual(hc.isModalOpen(), true);
    dom.click('ask-void-photo', '3');
    assert.ok(dom.el('lists').innerHTML.indexOf('id="hc-reason"') >= 0);              // 확인 단계(사유 입력)
    assert.strictEqual(calls.filter(function (c) { return c.init.method === 'POST'; }).length, 0);   // 아직 요청 없음
    dom.el('reason').value = '다른 기관장 사진';
    dom.click('do', '3');
    await settle();
    const post = calls.filter(function (c) { return c.init.method === 'POST'; })[0];
    assert.strictEqual(post.url, '/institutions/11010/head/photos/3/void');
    assert.strictEqual(post.init.headers['X-Button-Id'], 'photo_void');
    assert.strictEqual(JSON.parse(post.init.body).reason, '다른 기관장 사진');
    const after = calls.slice(calls.indexOf(post) + 1).filter(function (c) { return /\/head$/.test(c.url); })[0];
    assert.strictEqual(after.init.headers['X-Button-Id'], 'photo_void');                // 자동 재조회 = 방금 한 쓰기의 버튼 ID(허용 목록 값)
    assert.ok(dom.el('status').innerHTML.indexOf('바로 앞 사진으로 되돌렸습니다') >= 0);
    assert.ok(!dom.el('modal').cls.has('hc-busy'));
    assert.strictEqual(hc.view().data.head.photo.photo_id, 2);
    dom.click('close');
    assert.strictEqual(hc.isModalOpen(), false);
    assert.strictEqual(dom.modalEl.parentNode, null);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

test('모달 흐름(가짜 DOM): 무효 뒤 앞 사진이 없으면(restored_photo_id 없음) 실루엣 안내', async function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '2002' };
  let voided = false;
  fakeFetch(function (url, init) {
    if (init.method === 'POST' && /\/void$/.test(url)) { voided = true; return { status: 200, json: { photo_id: 3, restored_photo_id: null } }; }
    if (/content$/.test(url)) return { status: 200 };
    return { status: 200, json: detail({ head: { photo: voided ? null : photo } }) };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    dom.click('ask-void-photo', '3');
    dom.el('reason').value = '잘못 올림';
    dom.click('do', '3');
    await settle();
    assert.ok(dom.el('status').innerHTML.indexOf('사진이 없어졌습니다(실루엣 표시)') >= 0);
    assert.strictEqual(hc.view().data.head.photo, null);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

test('모달 흐름(가짜 DOM): 저장 뒤 재조회가 실패해도 모달은 열려 있고 [다시 불러오기]', async function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '2002' };
  let failHead = false, restored = null;
  fakeFetch(function (url, init) {
    if (init.method === 'POST' && /\/void$/.test(url)) { failHead = true; return { status: 200, json: { photo_id: 3, restored_photo_id: restored } }; }
    if (/content$/.test(url)) return { status: 200 };
    if (failHead) return { fail: true };
    return { status: 200, json: detail({ head: { photo: photo } }) };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    dom.click('ask-void-photo', '3');
    dom.el('reason').value = '잘못 올림';
    dom.click('do', '3');
    await settle();
    assert.strictEqual(hc.isModalOpen(), true);                                          // 닫지 않는다
    assert.strictEqual(hc.view().status, 'ok');                                          // 카드도 그대로
    const s = dom.el('status').innerHTML;
    assert.ok(s.indexOf('저장은 됐지만 새로 읽지 못했습니다') >= 0 && s.indexOf('data-m="reload"') >= 0 && s.indexOf('다시 불러오기') >= 0);
    failHead = false;
    dom.click('reload');
    await settle();
    assert.ok(dom.el('status').innerHTML.indexOf('새로 읽었습니다') >= 0 && dom.el('status').innerHTML.indexOf('data-m="reload"') < 0);
    assert.strictEqual(hc.isModalOpen(), true);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

// ── 확정된 기관장이 없는 경우(11-13 사용자 답 가: 이름까지 무효 처리 → 기관장 없음) ──
const EMPTY_HEAD = { name: null, position: null, acting: false, first_take_office: null, term_start: null, term_end: null,
  fields: {}, education: [], career: [], photo: null, source_count: 0, last_checked_on: null };
test('isEmptyHead: head:null·확정 값이 모두 무효 처리된 머리는 비었다, 보이는 값이 남으면 아니다', function () {
  assert.strictEqual(hc.isEmptyHead(null), true);
  assert.strictEqual(hc.isEmptyHead({}), true);
  assert.strictEqual(hc.isEmptyHead({ head: null }), true);
  assert.strictEqual(hc.isEmptyHead(detail({ head: EMPTY_HEAD })), true);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { name: '  ' }) })), true);
  assert.strictEqual(hc.isEmptyHead(detail()), false);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { name: '서지운' }) })), false);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { fields: { POSITION: field(2, '가람시장') } }) })), false);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { career: [{ item_id: 11, field_cd: 'CAREER', value: 'x', source: SRC }] }) })), false);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { photo: { photo_id: 3 } }) })), false);
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { fields: { ACTING: field(6, 'false') } }) })), true);   // 권한대행 '아니오'만 남음 — 카드에 안 보이므로 빈 머리
  assert.strictEqual(hc.isEmptyHead(detail({ head: Object.assign({}, EMPTY_HEAD, { fields: { ACTING: field(6, 'false'), POSITION: field(2, '가람시장') } }) })), false);
});
test('candCount: 후보 항목 + 후보 기관장, 없으면 0', function () {
  assert.strictEqual(hc.candCount(null), 0);
  assert.strictEqual(hc.candCount({ candidates: [1, 2], candidate_heads: [3] }), 3);
  assert.strictEqual(hc.candCount({}), 0);
});
test('ensure: 이름까지 무효 처리돼 빈 머리만 남으면 none + [기관장 추가], 후보가 있으면 수와 [편집]', async function () {
  const cand = { item_id: 20, field_cd: 'NAME', value: '박후보', source: SRC, created_by: '1', can_confirm: true, can_reject: true };
  const ch = { head_id: 9, name: '김후보', position: '시장', created_by: '1', item_count: 2, can_confirm: true, can_reject: true };
  fakeFetch(function () { return { status: 200, json: detail({ head: EMPTY_HEAD, candidates: [cand], candidate_heads: [ch] }) }; });
  try {
    await hc.ensure('11010', function () {});
    assert.strictEqual(hc.view().status, 'none');
    const h = hc.sectionHtml(hc.view(), env());
    assert.ok(h.indexOf('hc-card') < 0 && h.indexOf('이름 미확인') < 0);
    assert.ok(h.indexOf('data-hc="add-head"') >= 0 && h.indexOf('기관장 정보가 모두 무효 처리되어 지금 확정된 기관장이 없습니다') >= 0);
    assert.ok(h.indexOf('확정 대기 후보 2건 보기') >= 0 && h.indexOf('data-hc="edit"') >= 0);
    hc.reset();
    fakeFetch(function () { return { status: 200, json: detail({ head: EMPTY_HEAD }) }; });
    await hc.ensure('11010', function () {});
    const h0 = hc.sectionHtml(hc.view(), env());
    assert.ok(h0.indexOf('data-hc="add-head"') >= 0 && h0.indexOf('data-hc="edit"') < 0 && h0.indexOf('확정 대기 후보') < 0);
  } finally { cleanup(); }
});
test('모달: 빈 머리(none)도 기관장 등록 양식 + 안내문 연결 + 후보 목록은 그대로', function () {
  const cand = { item_id: 20, field_cd: 'NAME', value: '박후보', source: SRC, created_by: '1', can_confirm: true, can_reject: true };
  const h = hc.modalHtml(view({ head: EMPTY_HEAD, candidates: [cand] }, { status: 'none' }), {}, { today: TODAY, emp: '2002' });
  assert.ok(h.indexOf('data-form="add-head"') >= 0 && h.indexOf('data-form="add-item"') < 0 && h.indexOf('data-form="photo"') < 0);
  assert.ok(h.indexOf('id="hf-name"') >= 0 && h.indexOf('aria-describedby="hc-s4-hint"') >= 0 && h.indexOf('id="hc-s4-hint"') >= 0);
  assert.ok(h.indexOf('기관장 정보가 모두 무효 처리되어 지금 확정된 기관장이 없습니다') >= 0);
  assert.ok(h.indexOf('바로 확정됩니다') >= 0);   // 서버가 빈 머리도 현 기관장 없음으로 보고 바로 확정한다
  assert.strictEqual(hc.isEmptyHead({ head: EMPTY_HEAD, head_empty: false }), false);   // 서버 판정이 정본
  assert.strictEqual(hc.isEmptyHead({ head: { name: '서지운' }, head_empty: true }), true);
  assert.ok(h.indexOf('id="hc-s2"') < 0 && h.indexOf('확정 대기 후보 <span class="v">1</span>건') >= 0);
  assert.ok(h.indexOf('data-m="confirm-item"') >= 0);
  const nul = hc.modalHtml(view({ head: null }, { status: 'none' }), {}, { today: TODAY, emp: '2002' });
  assert.ok(nul.indexOf('바로 확정됩니다') >= 0);
});
test('cardHtml: 출처는 카드 전체 각주 목록 하나 — 번호는 띠·날짜·학력·경력·사진 순, 같은 출처는 한 줄', function () {
  const photoSrc = { kind: 'PRESS', title: '시정일보 사진', url: null, checked_on: '2026-11-04' };
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: photoSrc, uploaded_by: '1001' };
  const h = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: 'blob:a', state: 'ok' } }), { today: TODAY });
  const notes = h.slice(h.indexOf('<div class="hc-notes"'), h.indexOf('<div class="hc-foot">'));
  const fn = function (n) { return notes.slice(notes.indexOf('id="hc-fn-' + n + '"'), notes.indexOf('id="hc-fn-' + (n + 1) + '"') >= 0 ? notes.indexOf('id="hc-fn-' + (n + 1) + '"') : undefined); };
  assert.ok(h.indexOf('<div class="hc-notes"') > h.indexOf('<dl class="hc-items">') && h.indexOf('<div class="hc-notes"') < h.indexOf('<div class="hc-foot">'));   // 학력·경력 아래, 꼬리 위
  assert.strictEqual((notes.match(/class="hc-fn"/g) || []).length, 3);
  assert.ok(fn(1).indexOf('당선인 정보') >= 0 && fn(2).indexOf('가람시 누리집') >= 0 && fn(3).indexOf('시정일보 사진') >= 0);   // 1 띠·임기 만료, 2 날짜·학력·경력, 3 사진
  assert.ok(notes.indexOf('<p class="hc-notes-t" id="hc-notes-t">출처</p>') >= 0 && notes.indexOf('출처: ') < 0);
  assert.strictEqual((h.match(/가람시 누리집/g) || []).length, 1);                 // 학력·경력 항목마다 되풀이되지 않는다
  assert.ok(/임기 만료<\/dt><dd aria-describedby="hc-fn-1">/.test(h) && /첫 취임일<\/dt><dd aria-describedby="hc-fn-2">/.test(h) && /현 임기 시작<\/dt><dd aria-describedby="hc-fn-2">/.test(h));
  const items = h.slice(h.indexOf('<dl class="hc-items">'), h.indexOf('<div class="hc-notes"'));
  assert.ok(items.indexOf('hc-src') < 0 && items.indexOf('<a ') < 0 && (items.match(/class="hc-fnref"/g) || []).length === 3);   // 학력 1 + 경력 2, 표식만
  assert.ok(items.indexOf('<span class="hc-val">가람시의회 의원</span><sup class="hc-fnref" aria-hidden="true">2</sup><span class="sr-only">(출처 2)</span>') >= 0);
  assert.ok(h.indexOf('공공누리 제1유형<sup class="hc-fnref" aria-hidden="true">3</sup>') >= 0);   // 사진 캡션: 이용 조건 + 표식
  const same = hc.cardHtml(view({ head: { fields: { NAME: field(1, '서지운'), FIRST_TAKE_OFFICE: field(3, '2022-07-01'), TERM_START: field(4, '2026-07-01'), TERM_END: field(5, '2030-06-30') } } }), { today: TODAY });
  assert.strictEqual((same.match(/class="hc-fn"/g) || []).length, 1);              // 모두 같은 출처면 각주 한 줄
  assert.strictEqual((same.match(/class="hc-fnref"/g) || []).length, 1 + 3 + 1 + 2);   // 띠 1 + 날짜 3 + 학력 1 + 경력 2
});
test('cardHtml: 값이 없는 칸은 표식 없이 미확인, 각주 값은 이스케이프', function () {
  const none = hc.cardHtml(view({ head: { first_take_office: null, term_start: null, term_end: null, fields: {}, education: [], career: [] } }), { today: TODAY });
  assert.ok(none.indexOf('class="hc-fnref"') < 0 && none.indexOf('hc-fns') < 0 && none.indexOf('class="hc-notes"') < 0);
  const evil = hc.cardHtml(view({ head: { fields: { FIRST_TAKE_OFFICE: field(3, '2022-07-01', { kind: 'OTHER', title: '<img src=x onerror=y>', url: null, checked_on: '2026-11-03' }) } } }), { today: TODAY });
  assert.strictEqual(evil.indexOf('<img src=x'), -1);
  assert.ok(evil.indexOf('&lt;img src=x') >= 0);
});

test('canVoidOf: 서버 can_void가 있으면 그 값(남이 확정한 내 값은 false), 없으면 입력자 기준 대비 판정', function () {
  assert.strictEqual(hc.canVoidOf({ can_void: false }, '1001', '영업팀', '1001'), false);
  assert.strictEqual(hc.canVoidOf({ can_void: true }, '1001', '영업팀', '2002'), true);
  assert.strictEqual(hc.canVoidOf({}, '1001', '영업팀', '1001'), true);
  const h = hc.modalHtml(view({ head: { fields: { NAME: Object.assign(field(1, '서지운'), { created_by: '2002', can_void: false }) } } }), {}, { today: TODAY, emp: '2002' });
  assert.ok(h.indexOf('data-m="ask-void-item" data-id="1"') < 0);
});

test('모달: none이면 제목 \'기관장 추가\', 후보가 0건이면 후보 절을 숨기고 후보가 있으면 보인다. ok면 \'기관장 정보 편집\'', function () {
  const ctx = { today: TODAY, emp: '2002' };
  const nul = hc.modalHtml(view({ head: null }, { status: 'none' }), {}, ctx);
  assert.ok(nul.indexOf('<h3 id="hc-m-title" tabindex="-1">기관장 추가</h3>') >= 0);
  assert.ok(nul.indexOf('id="hc-s1"') < 0 && nul.indexOf('후보가 없습니다') < 0);
  assert.ok(nul.indexOf('<h4 id="hc-s4">기관장 추가</h4>') >= 0 && nul.indexOf('>추가</button>') >= 0);
  const cand = { item_id: 20, field_cd: 'NAME', value: '박후보', source: SRC, created_by: '1', can_confirm: true, can_reject: true };
  const withCand = hc.modalHtml(view({ head: EMPTY_HEAD, candidates: [cand] }, { status: 'none' }), {}, ctx);
  assert.ok(withCand.indexOf('기관장 추가</h3>') >= 0 && withCand.indexOf('id="hc-s1"') >= 0);
  const ok = hc.modalHtml(view(), {}, ctx);
  assert.ok(ok.indexOf('>기관장 정보 편집</h3>') >= 0 && ok.indexOf('id="hc-s1"') >= 0);
  assert.strictEqual(hc.modalTitle({ data: { head: null } }), '기관장 추가');
  assert.strictEqual(hc.modalTitle(view()), '기관장 정보 편집');
});

test('모달 흐름(가짜 DOM): ok에서 마지막 확정값을 무효 처리해 기관장이 없어지면 모달은 열린 채 제목·양식이 none으로, 이름 칸에 포커스', async function () {
  let voided = false;
  fakeFetch(function (url, init) {
    if (init && init.method === 'POST' && /\/void$/.test(url)) { voided = true; return { status: 200, json: { item_id: 1, head_empty: true } }; }
    if (voided) return { status: 200, json: Object.assign(detail({ head: EMPTY_HEAD }), { head_empty: true }) };
    return { status: 200, json: detail({ viewer_role: '영업팀장' }) };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    assert.strictEqual(hc.view().status, 'ok');
    dom.click('ask-void-item', '1');
    dom.el('reason').value = '잘못 입력';
    dom.click('do', '1');
    await settle();
    assert.strictEqual(hc.view().status, 'none');
    assert.strictEqual(hc.isModalOpen(), true);
    assert.ok(dom.el('forms').innerHTML.indexOf('data-form="add-head"') >= 0 && dom.el('forms').innerHTML.indexOf('data-form="add-item"') < 0);
    assert.strictEqual(dom.el('title').textContent, '기관장 추가');
    assert.strictEqual(dom.el('lists').innerHTML.indexOf('id="hc-s1"'), -1);
    assert.ok(dom.el('hfname').focused >= 1);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

test('모달 흐름(가짜 DOM): none에서 후보 기관장을 확정해 기관장이 생기면 제목·양식이 ok로, 포커스는 안내로', async function () {
  const ch = { head_id: 9, name: '김후보', position: '시장', created_by: '1', item_count: 2, can_confirm: true, can_reject: true };
  let confirmed = false;
  fakeFetch(function (url, init) {
    if (init && init.method === 'POST' && /\/heads\/9\/confirm$/.test(url)) { confirmed = true; return { status: 200, json: { head_id: 9 } }; }
    if (confirmed) return { status: 200, json: detail() };
    return { status: 200, json: Object.assign(detail({ head: EMPTY_HEAD, candidate_heads: [ch] }), { head_empty: true }) };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    assert.strictEqual(hc.view().status, 'none');
    dom.click('ask-confirm-head', '9');
    dom.click('do', '9');
    await settle();
    assert.strictEqual(hc.view().status, 'ok');
    assert.strictEqual(hc.isModalOpen(), true);
    assert.ok(dom.el('forms').innerHTML.indexOf('data-form="add-item"') >= 0);
    assert.strictEqual(dom.el('title').textContent, '기관장 정보 편집');
    assert.strictEqual(dom.el('hfname').focused, 0);
    assert.ok(dom.el('status').focused >= 1);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

// ── 지도 상세 팝업 경로: 기관장 카드 조회의 감사 화면 이름 = map_popover ──
test('ensure(…, screen): 지도 상세 팝업은 X-Screen-Id map_popover·X-Button-Id open_card로 읽고, screen이 없으면 head_card', async function () {
  const calls = fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    await hc.ensure('11010', function () {}, '2002', 'map_popover');
    assert.strictEqual(calls[0].init.headers['X-Screen-Id'], 'map_popover');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'open_card');
    hc.reset();
    const n = calls.length;
    await hc.ensure('11010', function () {}, '2002');
    assert.strictEqual(calls[n].init.headers['X-Screen-Id'], 'head_card');
  } finally { cleanup(); }
});

// ── 워드 내려받기(NEXT 100 S1, 규격 6-6) ──────────────────────────
const DOCX_CD = "attachment; filename=\"head_info.docx\"; filename*=UTF-8''" + encodeURIComponent('기관장정보_가람시_20261119.docx');
function docxRoutes(docx) {
  return function (url) {
    if (url.indexOf('/head/docx') >= 0) return docx;
    return { status: 200, json: detail() };
  };
}
async function okCard(screen) {
  hc.paneSection({ institutionId: '11010' }, env(screen ? { screen: screen } : {}));
  await settle();
  assert.strictEqual(hc.view().status, 'ok');
}
function withFakeDoc(fn) {
  const saved = [];
  global.document = {
    createElement: function () { const a = { style: {}, click: function () { saved.push({ href: a.href, download: a.download }); } }; return a; },
    body: { appendChild: function () {}, removeChild: function () {} },
  };
  return Promise.resolve().then(function () { return fn(saved); }).finally(function () { delete global.document; });
}

test('워드: ok 카드에만 [워드 내려받기] 버튼 하나(펼침·번호 칸·취소 없음), 새로 고침·편집보다 앞', function () {
  const h = hc.cardHtml(view(), { today: TODAY });
  assert.ok(/data-hc="docx">워드 내려받기</.test(h) && h.indexOf('data-hc="docx"') < h.indexOf('data-hc="refresh"'));
  ['aria-expanded', 'aria-controls', 'class="hc-ref"', 'data-hc-ref', 'type="number"', '참고자료 번호', 'docx-open', 'docx-go', 'docx-cancel'].forEach(function (s) { assert.ok(h.indexOf(s) < 0, s); });
  ['none', 'denied', 'role', 'notfound', 'noid', 'off', 'login', 'error'].forEach(function (st) {
    const s = hc.sectionHtml({ status: st, data: st === 'none' ? { head: null } : undefined }, {});
    assert.ok(s.indexOf('data-hc="docx"') < 0, st);
  });
});

test('워드: 받는 중이면 버튼만 aria-disabled + "만드는 중…"(포커스 유지), 줄은 만들지 않는다', function () {
  const b = hc.cardHtml(view({}, { dl: { busy: true, err: '', ok: '' } }), {});
  assert.ok(/<button type="button" data-hc="docx" aria-disabled="true">만드는 중…<\/button>/.test(b));
  assert.ok(b.indexOf('class="hc-ref"') < 0);
});

test('워드: 완료는 role=status(.hc-ok), 오류는 role=alert(.hc-err), 이스케이프, 전체 폭 .hc-ref 줄', function () {
  const ok = hc.cardHtml(view({}, { dl: { busy: false, err: '', ok: '완료 <b>' } }), {});
  assert.ok(/<div class="hc-ref" id="hc-ref"><p class="hc-ok" role="status">완료 &lt;b&gt;<\/p><\/div>/.test(ok));
  const er = hc.cardHtml(view({}, { dl: { busy: false, err: '실패', ok: '' } }), {});
  assert.ok(/<p class="hc-err" role="alert">실패<\/p>/.test(er) && er.indexOf('hc-ok') < 0);
});

test('docxOkText: X-Head-Photo가 failed일 때만 사진 안내를 덧붙인다', function () {
  const T = hc.TEXT;
  assert.strictEqual(hc.docxOkLead('summary'), '워드 파일(요약본)을 내려받았습니다.');   // 사용자 11-24 받은 종류를 문구에
  assert.strictEqual(hc.docxOkText('failed'), hc.docxOkLead('summary') + ' 사진은 불러오지 못해 넣지 않았습니다.');
  ['included', 'none', '', null, undefined].forEach(function (v) { assert.strictEqual(hc.docxOkText(v), hc.docxOkLead('summary'), String(v)); });
});

test('docxOkText: X-Head-Trimmed-Career·Edu가 1 이상일 때만 뺀 줄 수를 덧붙인다(사용자 11-23 1장)', function () {
  const T = hc.TEXT;
  assert.strictEqual(hc.docxOkText('included', '5', '0'), hc.docxOkLead('summary') + ' 1장에 맞추려고 파일에서 경력 5줄을 오래된 것부터 뺐습니다(카드 기록은 그대로).');
  assert.strictEqual(hc.docxOkText('none', '3', '2'), hc.docxOkLead('summary') + ' 1장에 맞추려고 파일에서 경력 3줄·학력 2줄을 오래된 것부터 뺐습니다(카드 기록은 그대로).');
  assert.strictEqual(hc.docxOkText('failed', '1', null), hc.docxOkLead('summary') + ' 사진은 불러오지 못해 넣지 않았습니다. 1장에 맞추려고 파일에서 경력 1줄을 오래된 것부터 뺐습니다(카드 기록은 그대로).');
  [['0', '0'], [null, null], ['', ''], ['x', '-1']].forEach(function (p) { assert.strictEqual(hc.docxOkText('included', p[0], p[1]), hc.docxOkLead('summary'), String(p)); });
});

test('워드: 누르면 바로 GET /head/docx?mode=summary(기본 요약본) + X-Screen-Id head_card·X-Button-Id head_docx, 파일 이름 규칙 유지', async function () {
  const calls = fakeFetch(docxRoutes({ status: 200, blob: new Blob(['docx']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    await withFakeDoc(async function (saved) {
      await hc.onPaneClick('docx', function () { return env(); });
      const c = calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; });
      assert.strictEqual(c.length, 1);
      assert.strictEqual(c[0].url, '/institutions/11010/head/docx?mode=summary');
      assert.strictEqual(c[0].init.method, 'GET');
      assert.deepStrictEqual(c[0].init.headers, { 'X-Screen-Id': 'head_card', 'X-Button-Id': 'head_docx' });
      assert.strictEqual(saved.length, 1);
      assert.strictEqual(saved[0].download, '기관장정보_가람시_20261119.docx');
    });
    const dl = hc.view().dl;
    assert.ok(!dl.busy && !dl.err && dl.ok === hc.docxOkLead('summary'));
    assert.ok(hc.cardHtml(hc.view(), { today: TODAY }).indexOf('role="status">워드 파일(요약본)을 내려받았습니다.') >= 0);
  } finally { cleanup(); }
});

test('워드: X-Head-Photo=failed면 완료 문구 끝에 사진 안내, included·none·없음은 덧붙이지 않는다', async function () {
  const tail = ' 사진은 불러오지 못해 넣지 않았습니다.';
  const cases = [['failed', true], ['included', false], ['none', false], [null, false]];
  for (const c of cases) {
    const headers = { 'Content-Disposition': DOCX_CD };
    if (c[0] != null) headers['X-Head-Photo'] = c[0];
    fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: headers }));
    try {
      await okCard();
      await withFakeDoc(async function () { await hc.onPaneClick('docx', function () { return env(); }); });
      const ok = hc.view().dl.ok;
      assert.strictEqual(ok.slice(-tail.length) === tail, c[1], String(c[0]));
      assert.ok(ok.indexOf(hc.docxOkLead('summary')) === 0);
    } finally { cleanup(); }
  }
});

test('워드: 지도 상세 팝업에서 누르면 X-Screen-Id가 map_popover', async function () {
  const calls = fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard('map_popover');
    await withFakeDoc(async function () { await hc.onPaneClick('docx', function () { return env(); }); });
    const c = calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; })[0];
    assert.deepStrictEqual([c.init.headers['X-Screen-Id'], c.init.headers['X-Button-Id']], ['map_popover', 'head_docx']);
  } finally { cleanup(); }
});

test('워드: 서버 오류별 문구 — 409·403·401·500·연결 실패·404·UI_ID_REQUIRED, BAD_VALUE는 일반 문구', async function () {
  const T = hc.TEXT;
  const cases = [
    [{ status: 409, json: { detail: { code: 'HEAD_EMPTY', message: 'x' } } }, T.docxEmpty],
    [{ status: 400, json: { detail: { code: 'BAD_VALUE', message: 'x' } } }, '처리하지 못했습니다 (400)'],
    [{ status: 400, json: { detail: { code: 'UI_ID_REQUIRED', message: 'x' } } }, T.docxUi],
    [{ status: 403, json: { detail: '권한 없음' } }, T.denied],
    [{ status: 401, json: { detail: 'x' } }, T.login],
    [{ status: 500, json: { detail: 'boom' } }, T.docxServer],
    [{ fail: true }, T.network],
    [{ status: 404, json: { detail: { code: 'FEATURE_OFF', message: 'x' } } }, T.off],
    [{ status: 404, json: { detail: 'not found' } }, T.notfound],
  ];
  for (const c of cases) {
    const calls = fakeFetch(docxRoutes(c[0]));
    try {
      await okCard();
      await hc.onPaneClick('docx', function () { return env(); });
      const dl = hc.view().dl;
      assert.strictEqual(dl.err, c[1], JSON.stringify(c[0]));
      assert.ok(!dl.busy && !dl.ok);
      assert.ok(hc.cardHtml(hc.view(), { today: TODAY }).indexOf('role="alert">') >= 0);
      if (c[0].status === 409) { await settle(); assert.ok(calls.filter(function (x) { return /head$/.test(x.url); }).length >= 2); }
    } finally { cleanup(); }
  }
});

test('워드: 받는 중 또 눌러도 요청은 한 번, 다음 내려받기를 시작하면 앞 안내를 지운다', async function () {
  const calls = fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    await withFakeDoc(async function () {
      const a = hc.onPaneClick('docx', function () { return env(); });
      assert.strictEqual(hc.view().dl.busy, true);
      assert.ok(/data-hc="docx" aria-disabled="true">만드는 중…/.test(hc.cardHtml(hc.view(), { today: TODAY })));
      const b = hc.onPaneClick('docx', function () { return env(); });
      await Promise.all([a, b]);
      assert.strictEqual(calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; }).length, 1);
      hc.view().dl.err = '오류';
      const p = hc.onPaneClick('docx', function () { return env(); });
      assert.ok(hc.view().dl.busy && hc.view().dl.err === '' && hc.view().dl.ok === '');
      await p;
    });
    assert.strictEqual(calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; }).length, 2);
  } finally { cleanup(); }
});

test('워드: 받는 중 refHtml은 화면 낭독 전용 줄(sr-only, role=status)이고 .hc-ref 줄은 없다', function () {
  const h = hc.refHtml({ busy: true, err: '', ok: '' });
  assert.ok(/<p class="sr-only" role="status" id="hc-ref">워드 파일\(요약본\)을 만드는 중입니다\.<\/p>/.test(h));   // mode 없으면 요약본
  assert.ok(hc.refHtml({ busy: true, err: '', ok: '', mode: 'dated' }).indexOf('워드 파일(날짜정보 포함)을 만드는 중입니다.') >= 0);
  assert.ok(h.indexOf('class="hc-ref"') < 0);
  assert.strictEqual(hc.refHtml(null), '');
});

function focusDoc(opts) {
  const state = { activeElement: null, btn: null, saved: 0 };
  const body = { tag: 'body' };
  function mk() { const b = { focus: function () { state.activeElement = b; } }; return b; }
  state.btn = mk();
  state.activeElement = opts.startOnBtn ? state.btn : body;
  state.rerender = function () { const had = state.activeElement === state.btn; state.btn = mk(); if (had) state.activeElement = body; };   // 다시 그리면 포커스는 body로
  global.document = {
    get activeElement() { return state.activeElement; },
    querySelector: function (sel) { return sel.indexOf('#hc-sec') === 0 && sel.indexOf('data-hc="docx"') > 0 ? state.btn : null; },
    createElement: function () { const a = { style: {}, click: function () { if (opts.clickThrows) throw new Error('blocked'); state.saved += 1; } }; return a; },
    body: { appendChild: function () {}, removeChild: function () {} },
  };
  return state;
}

test('워드: 키보드로 눌러 받는 동안·끝난 뒤에도 포커스가 [워드 내려받기]에 남는다', async function () {
  fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    const st = focusDoc({ startOnBtn: true });
    try {
      const p = hc.onPaneClick('docx', function () { return env({ repaint: st.rerender }); });
      assert.strictEqual(st.activeElement, st.btn);   // 받는 중에도 단추
      await p;
      assert.strictEqual(st.activeElement, st.btn);   // 끝난 뒤에도
    } finally { delete global.document; }
  } finally { cleanup(); }
});

test('워드: 받는 사이 포커스를 다른 곳으로 옮겼으면 끝나도 끌어오지 않는다', async function () {
  fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    const st = focusDoc({ startOnBtn: true });
    try {
      const p = hc.onPaneClick('docx', function () { return env({ repaint: st.rerender }); });
      const other = { tag: 'other' }; st.activeElement = other;
      await p;
      assert.strictEqual(st.activeElement, other);
    } finally { delete global.document; }
  } finally { cleanup(); }
});

test('워드: 마우스로 눌러 포커스가 단추에 없던 경우(body)는 끝나도 단추로 끌어오지 않는다(qa a910bf7a P3-2)', async function () {
  fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    const st = focusDoc({ startOnBtn: false });
    try {
      const start = st.activeElement;
      await hc.onPaneClick('docx', function () { return env({ repaint: st.rerender }); });
      assert.strictEqual(st.activeElement, start);
    } finally { delete global.document; }
  } finally { cleanup(); }
});

test('워드: 저장 단계 예외는 연결 실패가 아니라 저장 실패 문구, 상태는 busy 해제', async function () {
  fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    focusDoc({ startOnBtn: false, clickThrows: true });
    try {
      await hc.onPaneClick('docx', function () { return env(); });
      const dl = hc.view().dl;
      assert.strictEqual(dl.err, hc.TEXT.docxSaveFailed);
      assert.notStrictEqual(dl.err, hc.TEXT.network);
      assert.ok(!dl.busy && !dl.ok);
    } finally { delete global.document; }
  } finally { cleanup(); }
});

test('워드: 선택 상자 — 기본 요약본 selected, 고르면 날짜정보 포함 selected, reset에도 유지, 모르는 값은 요약본(사용자 11-24)', function () {
  try {
    hc.setDlMode('summary');
    const h = hc.cardHtml(view(), { today: TODAY });
    assert.ok(h.indexOf('<select data-hc="docx-opt" aria-label="워드에 넣을 내용">') >= 0);
    assert.ok(h.indexOf('<option value="summary" selected>요약본</option><option value="dated">날짜정보 포함</option>') >= 0);
    hc.onPaneChange('docx-opt', 'dated');
    assert.strictEqual(hc.getDlMode(), 'dated');
    assert.ok(hc.cardHtml(view(), { today: TODAY }).indexOf('<option value="summary">요약본</option><option value="dated" selected>날짜정보 포함</option>') >= 0);
    hc.reset();
    assert.strictEqual(hc.getDlMode(), 'dated');
    hc.onPaneChange('docx-opt', 'weird');
    assert.strictEqual(hc.getDlMode(), 'summary');
  } finally { hc.setDlMode('summary'); }
});

test('워드: 선택 상자는 단추 앞(.hc-dl 한 덩어리), 받는 중에도 disabled 아님, id 없음', function () {
  const h = hc.cardHtml(view({}, { dl: { busy: true, err: '', ok: '', mode: 'summary' } }), { today: TODAY });
  assert.ok(h.indexOf('data-hc="docx-opt"') < h.indexOf('data-hc="docx"') && h.indexOf('data-hc="docx"') < h.indexOf('data-hc="refresh"'));
  assert.ok(/<span class="hc-dl"><select data-hc="docx-opt"[^>]*>[\s\S]*<\/select><button type="button" data-hc="docx" aria-disabled="true">만드는 중…<\/button><\/span>/.test(h));
  assert.ok(!/<select[^>]*disabled/.test(h) && !/<select[^>]*id=/.test(h));
});

test('워드: URL에 mode — 날짜정보 포함 고르면 ?mode=dated, 헤더는 그대로', async function () {
  const calls = fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    assert.strictEqual(hc.docxUrl('11010', 'x'), '/institutions/11010/head/docx?mode=summary');
    await okCard();
    await withFakeDoc(async function () {
      hc.onPaneChange('docx-opt', 'dated');
      await hc.onPaneClick('docx', function () { return env(); });
    });
    const c = calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; });
    assert.strictEqual(c[0].url, '/institutions/11010/head/docx?mode=dated');
    assert.deepStrictEqual(c[0].init.headers, { 'X-Screen-Id': 'head_card', 'X-Button-Id': 'head_docx' });
    assert.strictEqual(hc.view().dl.ok, '워드 파일(날짜정보 포함)을 내려받았습니다.');
  } finally { hc.setDlMode('summary'); cleanup(); }
});

test('워드: 받는 중 선택을 바꿔도 이번 요청·완료 문구는 시작할 때 값, 다음부터 새 값', async function () {
  const calls = fakeFetch(docxRoutes({ status: 200, blob: new Blob(['d']), headers: { 'Content-Disposition': DOCX_CD } }));
  try {
    await okCard();
    await withFakeDoc(async function () {
      const a = hc.onPaneClick('docx', function () { return env(); });
      assert.strictEqual(hc.view().dl.mode, 'summary');
      hc.onPaneChange('docx-opt', 'dated');
      await a;
      assert.strictEqual(hc.view().dl.ok, '워드 파일(요약본)을 내려받았습니다.');
      await hc.onPaneClick('docx', function () { return env(); });
      assert.strictEqual(hc.view().dl.ok, '워드 파일(날짜정보 포함)을 내려받았습니다.');
    });
    const c = calls.filter(function (x) { return x.url.indexOf('/docx') >= 0; });
    assert.deepStrictEqual(c.map(function (x) { return x.url; }), ['/institutions/11010/head/docx?mode=summary', '/institutions/11010/head/docx?mode=dated']);
  } finally { hc.setDlMode('summary'); cleanup(); }
});

test('saveBlob: 저장 중 예외가 나도 임시 요소를 치우고 예외는 그대로 던진다', function () {
  let removed = 0;
  global.document = { createElement: function () { return { style: {}, click: function () { throw new Error('x'); } }; }, body: { appendChild: function () {}, removeChild: function () { removed += 1; } } };
  try { assert.throws(function () { hc.saveBlob(new Blob(['d']), 'a.docx'); }, /x/); assert.strictEqual(removed, 1); }
  finally { delete global.document; }
});

test('워드: 기관을 바꾸거나 [새로 고침]하면 안내가 지워지고, 기관장 없음(none)에는 단추가 없다', async function () {
  fakeFetch(function () { return { status: 200, json: detail() }; });
  try {
    await okCard();
    hc.view().dl = { busy: false, err: '', ok: '완료' };
    await hc.refresh(false, 'refresh');
    assert.strictEqual(hc.view().dl, null);
    hc.view().dl = { busy: false, err: '', ok: '완료' };
    hc.paneSection({ institutionId: '11011' }, env());
    assert.strictEqual(hc.view().dl, null);
  } finally { cleanup(); }
  fakeFetch(function () { return { status: 200, json: { institution_id: '11010', head: null, candidates: [], candidate_heads: [] } }; });
  try {
    hc.paneSection({ institutionId: '11010' }, env());
    await settle();
    assert.strictEqual(hc.view().status, 'none');
    hc.onPaneClick('docx', function () { return env(); });
    assert.strictEqual(hc.view().dl, null);
    assert.ok(hc.sectionHtml(hc.view(), env()).indexOf('data-hc="docx"') < 0);
  } finally { cleanup(); }
});

test('docxFileName: filename*를 풀어 쓰고, 경로 문자는 _로, 못 읽으면 기본 이름', function () {
  assert.strictEqual(hc.docxFileName(DOCX_CD), '기관장정보_가람시_20261119.docx');
  assert.strictEqual(hc.docxFileName("attachment; filename*=UTF-8''..%2F..%2Fx.docx"), '.._.._x.docx');
  assert.strictEqual(hc.docxFileName('attachment; filename="head_info.docx"'), '기관장정보.docx');
  assert.strictEqual(hc.docxFileName(null), '기관장정보.docx');
  assert.strictEqual(hc.docxFileName("attachment; filename*=UTF-8''%E0%A4%A"), '기관장정보.docx');   // 깨진 인코딩
});

test('워드: CSS는 기관장 카드 블록 안(.hc-ref 줄·min-width), 번호 칸 규칙은 없고 배선은 data-hc 위임, 지운 것들이 소스에 없다', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 기관장 카드 시작'), b = html.indexOf('/* 기관장 카드 끝 */');
  const css = html.slice(a, b);
  assert.ok(/\.hc-ref \{[^}]*border-top:1px solid var\(--line\)/.test(css));
  assert.ok(/\.hc-foot \[data-hc="docx"\] \{[^}]*min-width:7\.5em/.test(css));
  ['.hc-ref input', '.hc-reflab', '.hc-reftitle', '.hc-refbtns', '.hc-ref button'].forEach(function (x) { assert.ok(css.indexOf(x) < 0, x); });
  const src = fs.readFileSync(path.join(ROOT, 'js/headcard.js'), 'utf8');
  assert.ok(src.indexOf("what === 'docx')") >= 0);
  ['docx-open', 'docx-go', 'docx-cancel', 'data-hc-ref', 'REF_STORE', 'sessionStorage', 'parseRef', 'refTitle', 'refBad', 'ref_no'].forEach(function (x) { assert.ok(src.indexOf(x) < 0, x); });
  assert.ok(src.indexOf('window.open') < 0 && src.indexOf('confirm(') < 0);
});

// ── 카드 디자인 진단 6-1~6-6(design 11-19) ──────────────────────────
test('cardHtml: 띠는 만료일 기준 + 각주 표식만(출처 원문·링크 없음), 공고·입찰 띠는 각주 체계 밖', function () {
  const h = hc.cardHtml(view(), { today: TODAY });
  const band = h.slice(h.indexOf('<div class="hc-band">'), h.indexOf('<div class="hc-body">'));
  assert.ok(band.indexOf('만료일 <span class="v">2030-06-30</span> 기준<sup class="hc-fnref" aria-hidden="true">1</sup><span class="sr-only">(출처 1)</span>') >= 0);
  assert.ok(band.indexOf('hc-src') < 0 && band.indexOf('<a ') < 0 && band.indexOf('당선인 정보') < 0);
  const noTerm = hc.cardHtml(view({ head: { term_end: null, fields: { NAME: field(1, '서지운') } } }), { today: TODAY, bid: { days: 41, date: '2026-12-23', label: '확정' } });
  assert.ok(noTerm.slice(noTerm.indexOf('<div class="hc-band">'), noTerm.indexOf('<div class="hc-body">')).indexOf('hc-fnref') < 0);
});

test('cardHtml: 이름·직위·권한대행 배지는 한 줄 묶음(hc-who-hd), 이름이 먼저', function () {
  const h = hc.cardHtml(view({ head: { acting: true } }), { today: TODAY });
  assert.ok(/<div class="hc-who-hd"><h4 id="hc-name">서지운<\/h4><span class="hc-pos">가람시장<\/span><span class="hc-badge">권한대행<\/span><\/div>/.test(h));
});

test('cardHtml: 꼬리는 두 줄 고정 — 메타 한 줄 · 왼쪽 후보 보기 · 오른쪽 [워드 내려받기][새로 고침][기관장 편집], 완료·오류 줄은 꼬리 안', function () {
  const foot = function (v) { const h = hc.cardHtml(v, { today: TODAY }); return h.slice(h.indexOf('<div class="hc-foot">')); };
  const f0 = foot(view());
  assert.ok(/<p class="hc-meta">출처를 단 항목 <span class="v">8<\/span>건 · 최근 확인 <span class="v">2026-11-03<\/span> · 열람·내려받기 기록이 남습니다<\/p>/.test(f0));
  assert.ok(f0.indexOf('hc-log') < 0 && f0.indexOf('<span class="hc-foot-l"></span>') >= 0);        // 후보가 없어도 자리는 있다
  assert.ok(f0.indexOf('>워드 내려받기<') < f0.indexOf('>새로 고침<') && f0.indexOf('>새로 고침<') < f0.indexOf('>기관장 편집<'));
  assert.ok(f0.indexOf('>편집<') < 0);
  const cand = view({ candidates: [{ item_id: 20, field_cd: 'POSITION', value: '대행', source: SRC, created_by: '1', can_confirm: true, can_reject: true }] });
  const f1 = foot(cand);
  assert.ok(f1.indexOf('<span class="hc-foot-l"><button type="button" class="hc-cand" data-hc="edit">확정 대기 후보 1건 보기</button></span>') >= 0);
  const done = foot(Object.assign({}, view(), { dl: { busy: false, err: '', ok: '완료' } }));
  assert.ok(done.indexOf('class="hc-ref"') > done.indexOf('class="sp"'));   // 완료·오류 줄은 꼬리 안, 단추 묶음 다음
});

test('srcHtml: 확인 날짜는 한 덩어리(hc-ck)', function () {
  assert.ok(hc.srcHtml({ kind: 'NEC', title: 't', url: null, checked_on: '2026-11-03' }).indexOf('<span class="hc-ck">확인 2026-11-03</span>') >= 0);
});

test('사진 캡션: 모르는 이용 조건 코드는 코드 대신 이용 조건 미확인 칩, 아는 코드는 괄호 없는 짧은 이름', function () {
  const mk = function (cd) { return hc.cardHtml(view({ head: { photo: { photo_id: 3, license_cd: cd, source: SRC, uploaded_by: '1' } } }, { photo: { id: 3, url: 'blob:a', state: 'ok' } }), { today: TODAY }); };
  const u = mk('LOCAL_ONLY');
  assert.ok(u.indexOf('<span class="pop-unk">이용 조건 미확인</span>') >= 0 && u.indexOf('LOCAL_ONLY') < 0);
  assert.ok(mk('INST_PERMIT').indexOf('기관 직접 허락') >= 0);
  assert.strictEqual(hc.licenseShort('KOGL1'), '공공누리 제1유형');
  assert.strictEqual(hc.licenseKnown('KOGL1'), true);
  assert.strictEqual(hc.licenseKnown('toString'), false);              // 객체 기본 속성 이름도 아는 코드가 아니다
  assert.strictEqual(hc.licenseLabel('LOCAL_ONLY'), 'LOCAL_ONLY');     // 모달은 예전처럼
});

test('isEmptyHead: 카드에 안 보이는 확정 칸은 상수 목록(EMPTY_IGNORE_FIELDS)으로 뺀다', function () {
  const EMPTY_HEAD = { head_id: 7, name: '', position: '', acting: false, first_take_office: null, term_start: null, term_end: null, fields: {}, education: [], career: [], photo: null };
  const mk = function () { return { institution_id: '11010', head: Object.assign({}, EMPTY_HEAD, { fields: { BIRTH_DATE: field(9, '1970-01-01') } }), candidates: [], candidate_heads: [] }; };
  assert.deepStrictEqual(hc.EMPTY_IGNORE_FIELDS, ['ACTING', 'BIRTH_DATE']);   // 서버 빈 머리 판정(055, NOT IN ('ACTING','BIRTH_DATE'))과 같은 기준
  assert.strictEqual(hc.isEmptyHead(mk()), true);                                // 생년월일만 남은 머리는 빈 머리
  const withName = mk(); withName.head.fields.NAME = field(1, '서지운');
  assert.strictEqual(hc.isEmptyHead(withName), false);
});

test('CSS 블록(디자인 진단 6-1~6-6): 머리 주석 최소 12px, 띠 --panel2, 이름 16px, 꼬리 grid, 줄바꿈 keep-all, 복사 방지', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 기관장 카드 시작'), b = html.indexOf('/* 기관장 카드 끝 */');
  const raw = html.slice(a, b), css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(raw.indexOf('최소 12px') >= 0 && raw.indexOf('최소 11px') < 0);
  assert.ok(/\.hc-band \{[^}]*background:var\(--panel2\)/.test(css) && css.indexOf('accent-color) 9%') < 0);
  assert.ok(/\.hc-who h4 \{[^}]*font-size:16px/.test(css) && /\.hc-who-hd \{[^}]*flex-wrap:wrap/.test(css));
  assert.ok(/\.hc-foot \{[^}]*display:grid/.test(css) && /\.hc-meta \{[^}]*grid-column:1 \/ -1/.test(css) && /\.hc-foot > \.hc-ref \{[^}]*grid-column:1 \/ -1/.test(css));
  assert.ok(/\.hc-notes \{[^}]*border-top/.test(css) && /\.hc-notes-t \{/.test(css) && css.indexOf('.hc-fns') < 0);
  ['.hc-fn', '.hc-src', '.hc-cap', '.hc-bigsrc'].forEach(function (sel) {
    const m = new RegExp('\\' + sel + ' \\{[^}]*\\}').exec(css);
    assert.ok(m && /word-break:keep-all/.test(m[0]) && /overflow-wrap:break-word/.test(m[0]) && m[0].indexOf('anywhere') < 0, sel);
  });
  assert.ok(/\.hc-ck, \.hc-card \.v, \.hc-nb \{[^}]*white-space:nowrap/.test(css) && /\.hc-cap \.pop-unk \{[^}]*white-space:nowrap/.test(css));
  assert.ok(/\.hc-fnref, \.hc-card \.sr-only \{[^}]*user-select:none/.test(css));
  assert.ok(/\.hc-cap \{[^}]*width:117px[^}]*text-align:center/.test(css));
  assert.ok(/\.hc-act button \{[^}]*font-size:12px; padding:5px 12px/.test(css));
});

test('워드: headcard는 document 입력·키 처리기를 달지 않는다(번호 칸이 없어졌고 지도 팝업 Esc는 팝업이 처리)', function () {
  const p = require.resolve('../js/headcard.js');
  const saved = require.cache[p];
  const ls = [];
  global.document = { addEventListener: function (type) { ls.push(type); } };
  try {
    delete require.cache[p];
    require('../js/headcard.js');
    assert.deepStrictEqual(ls, ['change']);   // 워드 종류 선택 상자(docx-opt) change 하나만 — 입력·키 처리기는 없다(사용자 11-24)
  } finally { delete global.document; require.cache[p] = saved; }
});

test('srcHtml: 출처 제목 안 날짜는 끊기지 않게 묶고(hc-nb) 이스케이프는 먼저 — 디자인 대조 11-20', function () {
  const h = hc.srcHtml({ kind: 'OTHER', title: '<b>공직선거법상 2026-07-01부터</b>', url: 'https://example.go.kr/a', checked_on: '2026-11-03' });
  assert.ok(h.indexOf('&lt;b&gt;공직선거법상 <span class="hc-nb">2026-07-01</span>부터&lt;/b&gt;') >= 0 && h.indexOf('<b>') < 0);
  assert.ok(hc.srcHtml({ kind: 'OTHER', title: '', url: 'https://example.go.kr/2026-07-01', checked_on: null }).indexOf('hc-nb') < 0);   // 제목 없이 주소를 보일 때는 감싸지 않는다
});
test('사진 캡션: 불러오는 중·실패는 틀을 장식으로(낭독 한 번), 이용 조건 없이 문구 + 표식', function () {
  const p = { photo_id: 3, license_cd: 'KOGL1', source: SRC, uploaded_by: '1' };
  const ld = hc.cardHtml(view({ head: { photo: p } }, { photo: { id: 3, url: '', state: 'loading' } }), { today: TODAY });
  const er = hc.cardHtml(view({ head: { photo: p } }, { photo: { id: 3, url: '', state: 'err' } }), { today: TODAY });
  [ld, er].forEach(function (h) {
    const ph = h.slice(h.indexOf('<div class="hc-photo">'), h.indexOf('<div class="hc-who">'));
    assert.ok(ph.indexOf('role="img"') < 0 && ph.indexOf('공공누리') < 0 && ph.indexOf('class="hc-fnref"') >= 0);
  });
  assert.ok(ld.indexOf('사진 불러오는 중…<sup') >= 0 && er.indexOf('다시 시도하세요.<sup') >= 0);
});

// ── 기관장 생년월일(design 11-20 a3661836, frontend-dev a293c4f5) ──────────
test('[6-1] ageOn: 생일 전날·당일·다음날, 2/29생 평년·윤년, 형식 오류는 null', function () {
  assert.strictEqual(hc.ageOn('1965-11-13', '2026-11-12'), 60);
  assert.strictEqual(hc.ageOn('1965-11-12', '2026-11-12'), 61);
  assert.strictEqual(hc.ageOn('1965-11-11', '2026-11-12'), 61);
  assert.strictEqual(hc.ageOn('1965-03-02', TODAY), 61);
  assert.strictEqual(hc.ageOn('2000-02-29', '2025-02-28'), 24);
  assert.strictEqual(hc.ageOn('2000-02-29', '2025-03-01'), 25);
  assert.strictEqual(hc.ageOn('2000-02-29', '2024-02-29'), 24);
  ['', null, undefined, '1965-3-2', '19650302', '1965-02-30', '1965-13-01', 'abc'].forEach(function (x) { assert.strictEqual(hc.ageOn(x, '2026-11-12'), null, String(x)); });
  assert.strictEqual(hc.ageOn('1965-03-02', 'x'), null);
  assert.strictEqual(hc.ageOn('2030-01-01', '2026-11-12'), null);
  assert.strictEqual(hc.valueText({ field_cd: 'BIRTH_DATE', value: '1965-03-02' }, TODAY), '1965-03-02 (만 61세)');
  assert.strictEqual(hc.valueText({ field_cd: 'BIRTH_DATE', value: '1965-03-02' }), '1965-03-02');
  assert.strictEqual(hc.valueText({ field_cd: 'ACTING', value: true }), '예(권한대행)');
});

test('[6-2·6-3] birthMax·birthCheck: 서버 minusYears(18)과 같은 상한, 경계값', function () {
  assert.strictEqual(hc.birthMax(new Date(2024, 1, 29)), '2006-02-28');
  assert.strictEqual(hc.birthMax(TODAY), '2008-11-12');
  assert.strictEqual(hc.birthMax('2026-11-12'), '2008-11-12');
  assert.strictEqual(hc.birthMax(null), '');
  assert.strictEqual(hc.birthCheck('2008-11-12', TODAY), '');
  assert.ok(hc.birthCheck('2008-11-13', TODAY).indexOf('1920-01-01부터 2008-11-12까지의 날짜를 고르세요.') >= 0);
  assert.ok(hc.birthCheck('1919-12-31', TODAY).indexOf('1920-01-01부터') >= 0);
  assert.strictEqual(hc.birthCheck('1920-01-01', TODAY), '');
  assert.strictEqual(hc.birthCheck('', TODAY), '생년월일을 고르세요.');
  assert.strictEqual(hc.birthCheck('  ', TODAY), '생년월일을 고르세요.');
  assert.strictEqual(hc.birthCheck('1990-02-30', TODAY), '날짜를 YYYY-MM-DD 형식으로 고르세요.');
  assert.strictEqual(hc.birthCheck('90-01-01', TODAY), '날짜를 YYYY-MM-DD 형식으로 고르세요.');
  assert.strictEqual(hc.birthCheck('1990-1-1', TODAY).indexOf('1990'), -1);
});

test('[6-4] 항목 종류가 생년월일일 때만 #hc-birth·#hc-birth-h가 생긴다(max=오늘-18년, aria 연결)', function () {
  const b = hc.valueRowHtml('BIRTH_DATE', TODAY);
  assert.ok(b.indexOf('id="hc-birth"') >= 0 && b.indexOf('id="hc-birth-h"') >= 0 && b.indexOf('type="date" name="date"') >= 0);
  assert.ok(b.indexOf('min="1920-01-01" max="2008-11-12"') >= 0 && b.indexOf('aria-describedby="hc-birth-h"') >= 0);
  assert.ok(b.indexOf('1920-01-01부터 2008-11-12(만 18세)까지 고를 수 있습니다.') >= 0 && b.indexOf('열람 기록이 남습니다') >= 0);
  assert.ok(b.indexOf('aria-invalid') < 0 && b.indexOf('hc-birth-e') < 0);
  ['NAME', 'ACTING', 'TERM_END', 'CAREER'].forEach(function (cd) { assert.ok(hc.valueRowHtml(cd, TODAY).indexOf('hc-birth') < 0, cd); });
  const m = hc.modalHtml(view(), { field: 'BIRTH_DATE' }, { today: TODAY, emp: '2002' });
  assert.ok(m.indexOf('id="hc-birth"') >= 0 && m.indexOf('<option value="BIRTH_DATE" selected>생년월일</option>') >= 0);
  assert.strictEqual(hc.modalHtml(view(), {}, { today: TODAY, emp: '2002' }).indexOf('id="hc-birth"'), -1);
});

test('[6-5] 오류 상태: aria-invalid, describedby 합치기, 값 유지, clearFieldErr로 원복', function () {
  const e = hc.valueRowHtml('BIRTH_DATE', TODAY, { value: '2010-01-01', err: '<x>범위' });
  assert.ok(e.indexOf('aria-invalid="true"') >= 0 && e.indexOf('aria-describedby="hc-birth-e hc-birth-h"') >= 0);
  assert.ok(e.indexOf('<p class="hc-ferr" id="hc-birth-e" role="alert">&lt;x&gt;범위</p>') >= 0 && e.indexOf('<x>') < 0);
  assert.ok(e.indexOf('value="2010-01-01"') >= 0);
  assert.ok(e.indexOf('class="hc-ferr"') > e.indexOf('class="hc-fhint"'));
  const attrs = { 'aria-invalid': 'true', 'aria-describedby': 'hc-birth-e hc-birth-h' };
  let removed = 0;
  const errP = { parentNode: { removeChild: function () { removed += 1; } } };
  const input = { getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; }, setAttribute: function (k, v) { attrs[k] = v; }, removeAttribute: function (k) { delete attrs[k]; },
    closest: function () { return { querySelector: function (s) { return s === '#hc-birth-e' ? errP : null; } }; } };
  hc.clearFieldErr(input, 'hc-birth');
  assert.strictEqual(attrs['aria-invalid'], undefined);
  assert.strictEqual(attrs['aria-describedby'], 'hc-birth-h');
  assert.strictEqual(removed, 1);
  hc.clearFieldErr(input, 'hc-birth');
  assert.strictEqual(removed, 1);
});

test('[6-5·6-6] 흐름(가짜 DOM): 화면 검사 실패·서버 400 INVALID_DATE는 칸 아래, 상단 상태줄은 비움, 다른 날짜 칸은 상단', async function () {
  let reply = null;
  const calls = fakeFetch(function (url, init) {
    if (init.method === 'POST') return reply;
    return { status: 200, json: detail() };
  });
  const dom = fakeDom();
  const posts = function () { return calls.filter(function (c) { return c.init.method === 'POST'; }); };
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    const submit = function (fcd, date) {
      const els = [{ name: 'field_cd', value: fcd }, { name: 'date', value: date }, { name: 'src_kind', value: 'NEC' }, { name: 'src_title', value: '선관위' }, { name: 'src_url', value: '' }, { name: 'checked_on', value: '2026-11-12' }];
      dom.modalEl.handlers.submit({ target: { getAttribute: function () { return 'add-item'; }, elements: els }, preventDefault: function () {} });
    };
    submit('BIRTH_DATE', '2008-11-13');
    assert.strictEqual(posts().length, 0);
    const row = dom.el('valrow').innerHTML;
    assert.ok(row.indexOf('aria-invalid="true"') >= 0 && row.indexOf('aria-describedby="hc-birth-e hc-birth-h"') >= 0 && row.indexOf('2008-11-12까지의 날짜를 고르세요.') >= 0);
    assert.strictEqual(dom.el('status').innerHTML, '');
    assert.ok(dom.el('birth').focused >= 1);
    submit('BIRTH_DATE', '');
    assert.ok(dom.el('valrow').innerHTML.indexOf('생년월일을 고르세요.') >= 0 && posts().length === 0);
    reply = { status: 400, json: { detail: { code: 'INVALID_DATE', message: '생년월일은 1920-01-01부터 만 18세 이상이 되는 날짜까지만 입력할 수 있습니다.' } } };
    submit('BIRTH_DATE', '1990-01-01');
    await settle();
    assert.strictEqual(posts().length, 1);
    const body = JSON.parse(posts()[0].init.body);
    assert.deepStrictEqual([body.head_id, body.field_cd, body.date, body.value], [7, 'BIRTH_DATE', '1990-01-01', undefined]);
    assert.strictEqual(posts()[0].init.headers['X-Button-Id'], 'item_add');
    assert.ok(dom.el('valrow').innerHTML.indexOf('<p class="hc-ferr" id="hc-birth-e" role="alert">생년월일은 1920-01-01부터') >= 0);
    assert.strictEqual(dom.el('status').innerHTML, '');
    assert.strictEqual(hc.isModalOpen(), true);
    assert.ok(!dom.el('modal').cls.has('hc-busy'));
    reply = { status: 400, json: { detail: { code: 'INVALID_DATE', message: '날짜가 올바르지 않습니다.' } } };
    submit('TERM_END', '2030-01-01');
    await settle();
    assert.ok(dom.el('status').innerHTML.indexOf('날짜가 올바르지 않습니다.') >= 0);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});

test('[6-7] 출처 이름 안내: id 접두어 it/ph/hf가 한 팝업에서 겹치지 않고 각 input이 자기 안내를 가리킨다', function () {
  const h = hc.modalHtml(view(), {}, { today: TODAY, emp: '2002' });
  ['it', 'ph', 'hf'].forEach(function (p) {
    assert.strictEqual((h.match(new RegExp('id="' + p + '-st-h"', 'g')) || []).length, 1, p);
    assert.strictEqual((h.match(new RegExp('name="src_title"[^>]*aria-describedby="' + p + '-st-h"', 'g')) || []).length, 1, p);
  });
  assert.strictEqual((h.match(/자료 이름만 적습니다\. 생년월일·나이\(예: 1965년생\)는 적지 마세요\./g) || []).length, 3);
  assert.ok(hc.sourceFieldsHtml(TODAY, 'zz').indexOf('id="zz-st-h"') >= 0);
  assert.ok(hc.sourceFieldsHtml(TODAY).indexOf('id="sf-st-h"') >= 0);
  const none = hc.modalHtml(view({ head: null }, { status: 'none' }), {}, { today: TODAY, emp: '2002' });
  assert.ok(none.indexOf('id="hf-st-h"') >= 0 && none.indexOf('id="it-st-h"') < 0);
});

test('[6-8] 후보·확정·후보 기관장 요약 행: 생년월일 라벨, (만 n세), aria-label, 코드명 0건', function () {
  const bc = cand(30, { field_cd: 'BIRTH_DATE', value: '1965-03-02', conflict: true });
  const ch = { head_id: 9, name: '김후보', position: '시장', created_by: '1', item_count: 1, can_confirm: true, can_reject: true,
    items: [{ field_cd: 'BIRTH_DATE', value: '1990-01-01', source: SRC }] };
  const v = view({ candidates: [bc], candidate_heads: [ch], head: { fields: { NAME: field(1, '서지운'), BIRTH_DATE: field(9, '1965-03-02') } } });
  const ctx = { today: TODAY, emp: '2002' };
  const lists = hc.modalListsHtml(v, {}, ctx);
  assert.ok(lists.indexOf('<b>생년월일</b> <span class="v">1965-03-02</span> (만 61세)') >= 0);
  assert.ok(lists.indexOf('aria-label="생년월일 후보 확정"') >= 0);
  assert.ok(lists.indexOf('<b>생년월일</b> <span class="v">1990-01-01</span> (만 36세)') >= 0);
  const full = hc.modalHtml(v, {}, ctx);
  const visible = full.replace(/\s(value|name|data-f|id)="[^"]*"/g, '');
  assert.ok(visible.indexOf('BIRTH_DATE') < 0);
  assert.strictEqual((full.match(/(?:aria-[a-z]+|title)="[^"]*BIRTH_DATE[^"]*"/g) || []).length, 0);
  const noToday = hc.modalListsHtml(v, {}, { emp: '2002' });
  assert.ok(noToday.indexOf('<span class="v">1965-03-02</span>') >= 0 && noToday.indexOf('(만 ') < 0);
});

test('[6-9] cardHtml: 생년월일 날짜·글자는 카드에 나오지 않고 \'만 n세\'만 나온다(사용자 11-20)', function () {
  const h = hc.cardHtml(view({ head: { birth_date: '1965-03-02', fields: { NAME: field(1, '서지운'), BIRTH_DATE: field(9, '1965-03-02') } } }), { today: TODAY });
  assert.ok(h.indexOf('1965-03-02') < 0 && h.indexOf('생년월일') < 0 && h.indexOf('BIRTH_DATE') < 0);
  assert.ok(h.indexOf('<span class="hc-age">만 61세<sup class="hc-fnref" aria-hidden="true">') >= 0);
});

test('[6-13] 나이: birth_date가 없거나 계산 못 하거나 이름·직위가 모두 없으면 표시·각주가 없다', function () {
  const base = hc.cardHtml(view(), { today: TODAY });
  const cnt = function (s) { return (s.match(/class="hc-fn"/g) || []).length; };
  assert.ok(base.indexOf('hc-age') < 0);
  [null, '', '1990-02-30', '2030-01-01'].forEach(function (b) {
    const h = hc.cardHtml(view({ head: { birth_date: b } }), { today: TODAY });
    assert.ok(h.indexOf('hc-age') < 0, String(b));
    assert.strictEqual(cnt(h), cnt(base), String(b));
  });
  assert.ok(hc.cardHtml(view({ head: { birth_date: '1965-03-02' } }), {}).indexOf('hc-age') < 0);
  assert.ok(hc.cardHtml(view({ head: { birth_date: '1965-03-02', name: null, position: null } }), { today: TODAY }).indexOf('hc-age') < 0);
});

test('[6-14] 나이: 2/29생은 평년 2/28에 아직, 3/1에 한 살, 윤년 2/29에 당일', function () {
  const age = function (t) { const m = hc.cardHtml(view({ head: { birth_date: '1996-02-29' } }), { today: t }).match(/hc-age">만 (\d+)세/); return m && m[1]; };
  assert.strictEqual(age('2026-02-28'), '29');
  assert.strictEqual(age('2026-03-01'), '30');
  assert.strictEqual(age('2028-02-29'), '32');
});

test('[6-15] 나이 각주: 번호는 띠 → 나이 → 날짜 3칸 → 학력·경력 → 사진 순', function () {
  const BSRC = { kind: 'OTHER', title: '프로필 자료', url: null, checked_on: '2026-11-05' };
  const photoSrc = { kind: 'PRESS', title: '시정일보 사진', url: null, checked_on: '2026-11-04' };
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: photoSrc, uploaded_by: '1001' };
  const fields = { NAME: field(1, '서지운'), FIRST_TAKE_OFFICE: field(3, '2022-07-01'), TERM_START: field(4, '2026-07-01'),
    TERM_END: field(5, '2030-06-30', { kind: 'NEC', title: '당선인 정보', url: null, checked_on: '2026-11-02' }), BIRTH_DATE: field(9, '1965-03-02', BSRC) };
  const h = hc.cardHtml(view({ head: { birth_date: '1965-03-02', fields: fields, photo: photo } }, { photo: { id: 3, url: 'blob:a', state: 'ok' } }), { today: TODAY });
  const notes = h.slice(h.indexOf('<div class="hc-notes"'), h.indexOf('<div class="hc-foot">'));
  const fn = function (n) { const a = notes.indexOf('id="hc-fn-' + n + '"'), b = notes.indexOf('id="hc-fn-' + (n + 1) + '"'); return notes.slice(a, b >= 0 ? b : undefined); };
  assert.strictEqual((notes.match(/class="hc-fn"/g) || []).length, 4);
  assert.ok(fn(1).indexOf('당선인 정보') >= 0 && fn(2).indexOf('프로필 자료') >= 0 && fn(3).indexOf('가람시 누리집') >= 0 && fn(4).indexOf('시정일보 사진') >= 0);
  assert.ok(h.indexOf('<span class="hc-age">만 61세<sup class="hc-fnref" aria-hidden="true">2</sup><span class="sr-only">(출처 2)</span></span>') >= 0);
  assert.ok(/임기 만료<\/dt><dd aria-describedby="hc-fn-1">/.test(h) && /첫 취임일<\/dt><dd aria-describedby="hc-fn-3">/.test(h));
  assert.strictEqual(notes.indexOf('1965'), -1);
});

test('[6-16] 이름·직위 줄: 이름 → 직위 → 만 n세 → 권한대행 배지', function () {
  const h = hc.cardHtml(view({ head: { acting: true, birth_date: '1965-03-02', fields: { NAME: field(1, '서지운'), BIRTH_DATE: field(9, '1965-03-02') } } }), { today: TODAY });
  const hd = h.slice(h.indexOf('<div class="hc-who-hd">'), h.indexOf('<dl class="hc-facts">'));
  const at = function (s) { return hd.indexOf(s); };
  assert.ok(at('<h4 id="hc-name">') >= 0 && at('<h4 id="hc-name">') < at('class="hc-pos"') && at('class="hc-pos"') < at('class="hc-age"') && at('class="hc-age"') < at('class="hc-badge"'));
});

test('학력·경력 시작 연도 또는 연-월(사용자 11-24): 입력 칸 안내와 화면 검사', function () {
  const career = hc.valueRowHtml('CAREER', TODAY);
  assert.ok(career.indexOf('시작(연도 또는 연-월, 필수)') >= 0 && /name="from"[^>]*required/.test(career) && career.indexOf('placeholder="2018 또는 2018-07"') >= 0);
  assert.ok(career.indexOf('끝(연도 또는 연-월, 비우면 현재)') >= 0);
  assert.ok(career.indexOf('YYYY-MM') < 0);
  ['2018', ' 2018 ', '2018-07', ' 2018-07 ', '1900', '2100', '1900-01', '2100-12'].forEach(function (v) { assert.strictEqual(hc.startMonthOk(v), true, v); });
  ['', null, '2018-7', '2018-13', '2018-00', '1899', '2101', '1899-12', '18', '18-07', '2018-07-01', '2018.07'].forEach(function (v) { assert.strictEqual(hc.startMonthOk(v), false, String(v)); });
});

test('학력·경력 정렬(사용자 11-24): YYYY와 YYYY-MM이 섞여도 최근 것부터, 연도만 끝값은 그 해 말로 본다', function () {
  const mk = function (id, value, from, to) { return { item_id: id, head_id: 7, field_cd: 'CAREER', value: value, from: from, to: to, source: SRC, created_by: '1' }; };
  const html = hc.cardHtml(view({ head: { career: [mk(1, '가경력', '2010', '2017'), mk(2, '나경력', '2018', '2022-06'), mk(3, '다경력', '2018-03', '2022'), mk(4, '라경력', '2023-01', null)] } }), { today: TODAY });
  const at = function (s) { return html.indexOf(s); };
  assert.ok(at('라경력') >= 0 && at('가경력') >= 0, html.slice(0, 200));
  assert.ok(at('라경력') < at('다경력') && at('다경력') < at('나경력') && at('나경력') < at('가경력'));
});

test('[6-10] 이월 안내: 빈 머리의 이전 칸에 맞춰 문구가 바뀌고 head:null이면 없고 값은 싣지 않는다', function () {
  const ctx = { today: TODAY, emp: '2002' };
  const mk = function (fields) { return hc.modalHtml(view({ head: Object.assign({}, EMPTY_HEAD, { fields: fields }) }, { status: 'none' }), {}, ctx); };
  const both = mk({ BIRTH_DATE: field(9, '1965-03-02'), ACTING: field(6, 'false') });
  assert.ok(both.indexOf('<p class="hc-hint" id="hc-s4-carry">이전 기록의 생년월일·권한대행 여부는 새 기관장으로 넘어오지 않습니다. 같은 분이면 권한대행 여부는 아래에서 다시 고르고, 생년월일은 추가한 뒤 [항목 후보 추가]에서 다시 입력하세요.</p>') >= 0);
  assert.ok(both.indexOf('aria-describedby="hc-s4-hint hc-s4-carry"') >= 0);
  const b = mk({ BIRTH_DATE: field(9, '1965-03-02') });
  assert.ok(b.indexOf('이전 기록의 생년월일은 새 기관장으로 넘어오지 않습니다. 같은 분이면 추가한 뒤 [항목 후보 추가]에서 다시 입력하세요.') >= 0);
  const a = mk({ ACTING: field(6, 'false') });
  assert.ok(a.indexOf('이전 기록의 권한대행 여부는 새 기관장으로 넘어오지 않습니다. 같은 분이면 아래에서 다시 고르세요.') >= 0);
  const none = mk({});
  assert.ok(none.indexOf('hc-s4-carry') < 0 && none.indexOf('aria-describedby="hc-s4-hint"') >= 0);
  const nul = hc.modalHtml(view({ head: null }, { status: 'none' }), {}, ctx);
  assert.ok(nul.indexOf('hc-s4-carry') < 0);
  [both, b, a].forEach(function (h) { assert.ok(h.indexOf('1965-03-02') < 0 && h.indexOf('만 61세') < 0); });
  assert.strictEqual(hc.carryNotice(null), '');
});

test('[6-11] 무효 확인 문구: NAME·POSITION만 덮어쓰기 유도, 다른 칸은 기존 문구, 단추에 data-f', function () {
  assert.ok(hc.voidItemText('NAME').indexOf("'이름'을 골라 고친 값을 넣으세요.") >= 0 && hc.voidItemText('NAME').indexOf('생년월일·권한대행 여부는 새로 추가하는 기관장에게 넘어오지 않습니다') >= 0);
  assert.ok(hc.voidItemText('POSITION').indexOf("'직위'를 골라") >= 0);
  assert.strictEqual(hc.voidItemText('CAREER'), '이 확정값을 무효 처리합니다. 카드에서 사라지고 기록만 남습니다.');
  assert.strictEqual(hc.voidItemText(null), hc.voidItemText('TERM_END'));
  const html = hc.modalListsHtml(view({ viewer_role: '영업팀장' }), {}, { today: TODAY, emp: '2002' });
  assert.ok(/data-m="ask-void-item" data-id="1" data-f="NAME"/.test(html) || html.indexOf('ask-void-item') < 0);
});

test('[6-12] 값은 모두 esc: < 가 든 출처 제목·생년월일 값·서버 오류 문구', function () {
  const evil = { kind: 'OTHER', title: '<img src=x onerror=y>', url: null, checked_on: '2026-11-03' };
  const v = view({ candidates: [cand(31, { field_cd: 'BIRTH_DATE', value: '<b>1965', source: evil })] });
  const lists = hc.modalListsHtml(v, {}, { today: TODAY, emp: '2002' });
  assert.ok(lists.indexOf('<img src=x') < 0 && lists.indexOf('&lt;img src=x') >= 0);
  assert.ok(lists.indexOf('<b>1965') < 0 && lists.indexOf('&lt;b&gt;1965') >= 0 && lists.indexOf('(만 ') < 0);
  const e = hc.valueRowHtml('BIRTH_DATE', TODAY, { value: '"><script>', err: '<script>x</script>' });
  assert.ok(e.indexOf('<script>') < 0 && e.indexOf('&lt;script&gt;x') >= 0);
});

test('CSS 블록: 생년월일 칸 클래스(.hc-fld·.hc-fhint·.hc-ferr, aria-invalid 그림자)는 기관장 카드 블록 안, 12px·토큰만', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 기관장 카드 시작'), b = html.indexOf('/* 기관장 카드 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hc-fld \{[^}]*display:flex[^}]*flex-direction:column/.test(css));
  assert.ok(/\.hc-fhint \{[^}]*font-size:12px[^}]*color:var\(--muted\)[^}]*word-break:keep-all/.test(css));
  assert.ok(/\.hc-ferr \{[^}]*font-size:12px[^}]*color:var\(--red\)[^}]*word-break:keep-all/.test(css));
  assert.ok(/\.hc-lab input\[aria-invalid="true"\] \{[^}]*box-shadow:inset 0 0 0 1px var\(--red\)/.test(css));
  assert.strictEqual(html.slice(0, a).indexOf('.hc-ferr'), -1);
});

test('생년월일 제출 중 서버 400 INVALID_DATE라도 문구가 확인한 날 것이면 칸 아래가 아니라 상단(qa 11-20 P2-1)', async function () {
  const calls = fakeFetch(function (url, init) {
    if (init.method === 'POST') return { status: 400, json: { detail: { code: 'INVALID_DATE', message: '확인일은 2000-01-01부터 오늘까지만 입력할 수 있습니다.' } } };
    return { status: 200, json: detail() };
  });
  const dom = fakeDom();
  try {
    await hc.ensure('11010', function () {}, '2002');
    await settle();
    hc.openModal(function () { return env({ emp: '2002' }); });
    const els = [{ name: 'field_cd', value: 'BIRTH_DATE' }, { name: 'date', value: '1990-01-01' }, { name: 'src_kind', value: 'NEC' }, { name: 'src_title', value: '선관위' }, { name: 'src_url', value: '' }, { name: 'checked_on', value: '2099-01-01' }];
    dom.modalEl.handlers.submit({ target: { getAttribute: function () { return 'add-item'; }, elements: els }, preventDefault: function () {} });
    await settle();
    assert.strictEqual(calls.filter(function (c) { return c.init.method === 'POST'; }).length, 1);
    assert.ok(dom.el('status').innerHTML.indexOf('확인일은') >= 0);
    assert.ok(dom.el('valrow').innerHTML.indexOf('hc-birth-e') < 0 && dom.el('valrow').innerHTML.indexOf('aria-invalid') < 0);
  } finally { hc.closeModal(false); dom.off(); cleanup(); }
});
