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
      blob: function () { return Promise.resolve(new Blob(['jpegbytes'], { type: 'image/jpeg' })); },
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
  assert.ok(h.indexOf('출처 <span class="v">8</span>건') >= 0 && h.indexOf('2026-11-03') >= 0);
  assert.ok(h.indexOf('열람 기록이 남습니다') >= 0);
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
  assert.ok(loading.indexOf('사진을 불러오는 중') >= 0 && loading.indexOf('<img') < 0);
  const ok = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: 'blob:abc', state: 'ok' } }), { today: TODAY });
  assert.ok(ok.indexOf('<img src="blob:abc" alt="기관장 사진"') >= 0);
  assert.ok(ok.indexOf('공공누리 제1유형(출처표시)') >= 0 && ok.indexOf('시청 보도자료') >= 0);
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
  assert.strictEqual(hc.FIELDS.length, 8);
  assert.deepStrictEqual(hc.FIELDS.map(function (f) { return f.cd; }), ['NAME', 'POSITION', 'ACTING', 'FIRST_TAKE_OFFICE', 'TERM_START', 'TERM_END', 'EDU', 'CAREER']);
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
  assert.ok(screens.indexOf(hc.POP_SCREEN) >= 0, hc.POP_SCREEN);
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

test('사진 불러오는 중에는 실루엣 aria-label이 사진 불러오는 중', function () {
  const photo = { photo_id: 3, license_cd: 'KOGL1', source: SRC, checked_on: '2026-11-03', uploaded_by: '1001' };
  const loading = hc.cardHtml(view({ head: { photo: photo } }, { photo: { id: 3, url: '', state: 'loading' } }), { today: TODAY });
  assert.ok(loading.indexOf('aria-label="사진 불러오는 중"') >= 0 && loading.indexOf('aria-label="사진 없음"') < 0);
  assert.ok(hc.cardHtml(view(), { today: TODAY }).indexOf('aria-label="사진 없음"') >= 0);
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
  const map = { '#hc-m-status': 'status', '#hc-m-lists': 'lists', '#hc-m-forms': 'forms', '.hc-modal': 'modal', '#hc-m-title': 'title', '#hc-reason': 'reason', '[data-m=do]': 'do', '#hf-name': 'hfname' };
  const modalEl = { handlers: {}, parentNode: null,
    addEventListener: function (t, f) { this.handlers[t] = f; },
    querySelector: function (sel) { return map[sel] ? el(map[sel]) : null; },
    querySelectorAll: function () { return []; }, contains: function () { return true; } };
  const body = { appendChild: function (e) { e.parentNode = body; }, removeChild: function (e) { e.parentNode = null; }, contains: function () { return true; } };
  global.document = { activeElement: null, body: body, getElementById: function () { return el('opener'); },
    createElement: function () { return { firstChild: null, set innerHTML(h) { this.firstChild = modalEl; } }; } };
  return {
    el: el, modalEl: modalEl,
    click: function (dataM, id) {
      const b = { getAttribute: function (k) { return ({ 'data-m': dataM, 'data-id': id, 'data-self': '0' })[k] || null; } };
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
test('cardHtml: 날짜 3칸의 출처는 같으면 각주 한 줄, 다르면 표식을 나눈다', function () {
  const seg = function (html) { return html.slice(html.indexOf('<dl class="hc-facts">'), html.indexOf('<dl class="hc-items">')); };
  const same = seg(hc.cardHtml(view({ head: { fields: { NAME: field(1, '서지운'), FIRST_TAKE_OFFICE: field(3, '2022-07-01'), TERM_START: field(4, '2026-07-01'), TERM_END: field(5, '2030-06-30') } } }), { today: TODAY }));
  assert.strictEqual((same.match(/class="hc-fn"/g) || []).length, 1);
  assert.strictEqual((same.match(/class="hc-fnref"/g) || []).length, 3);
  assert.strictEqual((same.match(/aria-describedby="hc-fn-1"/g) || []).length, 3);
  assert.strictEqual((same.match(/가람시 누리집/g) || []).length, 1);
  assert.ok(same.indexOf('<p class="hc-fn" id="hc-fn-1">') >= 0 && same.indexOf('출처: ') >= 0);
  const diff = seg(hc.cardHtml(view(), { today: TODAY }));
  assert.strictEqual((diff.match(/class="hc-fn"/g) || []).length, 2);
  assert.ok(/임기 만료<\/dt><dd aria-describedby="hc-fn-2">/.test(diff));
  assert.ok(/첫 취임일<\/dt><dd aria-describedby="hc-fn-1">/.test(diff) && /현 임기 시작<\/dt><dd aria-describedby="hc-fn-1">/.test(diff));
  assert.ok(diff.indexOf('id="hc-fn-2"') >= 0 && diff.indexOf('<span class="v">2030-06-30</span>') >= 0);
});
test('cardHtml: 값이 없는 칸은 표식 없이 미확인, 각주 값은 이스케이프', function () {
  const none = hc.cardHtml(view({ head: { first_take_office: null, term_start: null, term_end: null, fields: {} } }), { today: TODAY });
  assert.ok(none.indexOf('hc-fnref') < 0 && none.indexOf('hc-fns') < 0);
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

// ── 지도 팝오버 [기관장 보기] (사용자 11-13: 버튼을 눌렀을 때만 읽는다) ──
function fakePop() {
  const dd = { innerHTML: '<span class="pop-unk">현황판에서 확인</span>' };
  const out = { innerHTML: '' };
  const attrs = {};
  const btn = { textContent: '기관장 보기', setAttribute: function (k, v) { attrs[k] = v; }, removeAttribute: function (k) { delete attrs[k]; } };
  const pop = { style: { display: 'block' }, handlers: {}, stopped: 0, dd: dd, out: out, btn: btn, attrs: attrs,
    addEventListener: function (t, f) { this.handlers[t] = f; },
    querySelector: function (sel) {
      if (sel === '#pop-head') return dd;
      if (sel === '#pop-head-out') return dd.innerHTML.indexOf('id="pop-head-out"') >= 0 ? out : null;
      if (sel === '[data-pop-head]') return dd.innerHTML.indexOf('data-pop-head') >= 0 ? btn : null;
      return null;
    },
    click: function () { const self = this; self.handlers.click({ target: { closest: function () { return btn; } }, stopPropagation: function () { self.stopped += 1; } }); } };
  return pop;
}
const POP_REC = { name: '가람시', institutionId: '11010', type: '지자체' };
const POP_ENV = { serverMode: true, hasEmp: true, role: '영업팀', today: TODAY };

test('팝오버 [기관장 보기]: 서버 모드·로그인·영업 계열·서버 기관일 때만 버튼, 아니면 기존 칩 그대로, 클릭 전 fetch 0회', function () {
  const calls = fakeFetch(function () { return { status: 200, json: {} }; });
  try {
    ['영업팀', '영업팀장', '영업부장'].forEach(function (role) {
      const p = fakePop(); hc.decoratePopover(p, POP_REC, Object.assign({}, POP_ENV, { role: role }));
      assert.ok(p.dd.innerHTML.indexOf('data-pop-head="view"') >= 0 && p.dd.innerHTML.indexOf('type="button"') >= 0, role);
      assert.ok(p.dd.innerHTML.indexOf('aria-live="polite"') >= 0);
    });
    [Object.assign({}, POP_ENV, { serverMode: false }), Object.assign({}, POP_ENV, { hasEmp: false }), Object.assign({}, POP_ENV, { role: '기획팀' })].forEach(function (e) {
      const p = fakePop(); hc.decoratePopover(p, POP_REC, e);
      assert.strictEqual(p.dd.innerHTML, '<span class="pop-unk">현황판에서 확인</span>');
    });
    const p2 = fakePop(); hc.decoratePopover(p2, { name: '내장기관' }, POP_ENV);
    assert.strictEqual(p2.dd.innerHTML, '<span class="pop-unk">현황판에서 확인</span>');
    assert.strictEqual(calls.length, 0);
  } finally { cleanup(); }
});

test('팝오버 [기관장 보기]: 클릭하면 1회 읽고 화면 map_popover·버튼 head_view, 이름·직위·임기·출처 요약, 다시 누르면 재조회', async function () {
  const calls = fakeFetch(function () {
    return { status: 200, json: { head: { name: '서지운', position: '가람시장', term_end: '2030-06-30', acting: false,
      fields: { TERM_END: { item_id: 5, value: '2030-06-30', source: { kind: 'NEC', title: '당선인 정보', url: null, checked_on: '2026-11-02' } } } } } };
  });
  try {
    const p = fakePop(); hc.decoratePopover(p, POP_REC, POP_ENV);
    p.click();
    assert.strictEqual(p.attrs['aria-disabled'], 'true');
    assert.ok(p.out.innerHTML.indexOf('불러오는 중') >= 0);
    p.click();
    await settle();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/institutions/11010/head');
    assert.strictEqual(calls[0].init.method, 'GET');
    assert.strictEqual(calls[0].init.headers['X-Screen-Id'], 'map_popover');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'head_view');
    assert.ok(p.out.innerHTML.indexOf('서지운') >= 0 && p.out.innerHTML.indexOf('가람시장') >= 0);
    assert.ok(p.out.innerHTML.indexOf('2030-06-30') >= 0);
    assert.ok(p.out.innerHTML.indexOf('당선인 정보') >= 0 && p.out.innerHTML.indexOf('현황판에서 자세히') >= 0);
    assert.strictEqual(p.btn.textContent, '다시 불러오기');
    assert.strictEqual(p.attrs['aria-disabled'], undefined);
    assert.strictEqual(p.stopped, 2);
    p.click(); await settle();
    assert.strictEqual(calls.length, 2);
    assert.ok(!calls.some(function (c) { return /photos/.test(c.url); }));
  } finally { cleanup(); }
});

test('팝오버 [기관장 보기]: 빈 머리·404 FEATURE_OFF·404·403·401·연결 실패 표시, 값은 이스케이프', async function () {
  const cases = [
    [{ status: 200, json: { head: null, candidates: [], candidate_heads: [] } }, '등록된 기관장이 없습니다'],
    [{ status: 200, json: { head: null, head_empty: true } }, '등록된 기관장이 없습니다'],
    [{ status: 404, json: { detail: { code: 'FEATURE_OFF', message: '꺼짐' } } }, '기능이 꺼져 있습니다'],
    [{ status: 404, json: { detail: 'not found' } }, '이 기관을 찾지 못했습니다'],
    [{ status: 403, json: { detail: '권한 없음' } }, '볼 권한이 없습니다'],
    [{ status: 401, json: { detail: '사번' } }, '다시 로그인'],
    [{ fail: true }, '서버에 연결하지 못했습니다'],
  ];
  try {
    for (const c of cases) {
      fakeFetch(function () { return c[0]; });
      const p = fakePop(); hc.decoratePopover(p, POP_REC, POP_ENV);
      p.click(); await settle();
      assert.ok(p.out.innerHTML.indexOf(c[1]) >= 0, c[1] + ' / ' + p.out.innerHTML);
    }
    fakeFetch(function () { return { status: 200, json: { head: { name: '<img src=x onerror=1>', position: '"장"', term_end: '2030-06-30', fields: {} } } }; });
    const p = fakePop(); hc.decoratePopover(p, POP_REC, POP_ENV);
    p.click(); await settle();
    assert.strictEqual(p.out.innerHTML.indexOf('<img'), -1);
    assert.ok(p.out.innerHTML.indexOf('&lt;img') >= 0);
  } finally { cleanup(); }
});

test('팝오버 [기관장 보기]: 닫히거나 다른 기관으로 바뀐 뒤 늦게 온 응답은 버린다', async function () {
  fakeFetch(function () { return { status: 200, json: { head: { name: '서지운', term_end: '2030-06-30', fields: {} } } }; });
  try {
    const p = fakePop(); hc.decoratePopover(p, POP_REC, POP_ENV);
    p.click(); p.style.display = 'none'; await settle();
    assert.strictEqual(p.out.innerHTML.indexOf('서지운'), -1);
    const q = fakePop(); hc.decoratePopover(q, POP_REC, POP_ENV);
    q.click(); hc.decoratePopover(q, { name: '다른시', institutionId: '11020' }, POP_ENV); await settle();
    assert.strictEqual(q.out.innerHTML.indexOf('서지운'), -1);
  } finally { cleanup(); }
});

test('배선: render.js가 팝오버 마크업에 pop-head를 두고 showPopover가 headcard.decoratePopover를 부른다', function () {
  const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'render.js'), 'utf8');
  assert.ok(rsrc.indexOf('<dd id="pop-head">') >= 0);
  assert.ok(/root\.headcard\.decoratePopover\(pop, rec\)/.test(rsrc));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="js/headcard.js"') >= 0 && html.indexOf('src="js/headcard.js"') < html.indexOf('src="js/render.js"'));
});
