// 사업계획 수집 요청(11-17): 상태 칩·상세 요청 줄·목록 칩·요약 절·처리 화면 행/확인 줄/선택 수/문구 표·nav 노출·소스 규칙.
// 서버(fetch)·DOM 부분(mount 이하)은 node 에서 돌리지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const nav = require('../js/nav.js');
const dash = require('../js/dashboard.js');
const plans = require('../js/plans.js');
const pc = require('../js/plancollect.js');

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rd = function (f) { return fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'); };
const PC_SRC = rd('plancollect.js'), PLANS_SRC = rd('plans.js'), ADMIN_SRC = rd('admin.js'), APP_SRC = rd('app.js'), OVERDUE_SRC = rd('overdue.js');

const ALL_ON = { map: true, regions: true, workflow: true, approvals: true, tasks: true, chat: true, knowledge: true, admin: true };
const K1 = '11111111-1111-4111-8111-111111111111', K2 = '22222222-2222-4222-8222-222222222222', K3 = '33333333-3333-4333-8333-333333333333';
function req(over) {
  return Object.assign({ institution_id: 'jongno', status_cd: 'REQUESTED', requester_count: 3, requested_by_me: true,
    first_requested_at: '2026-11-17T01:00:00+09:00', run_at: null }, over || {});
}
function adm(over) {
  return Object.assign({ req_key: K1, institution_id: 'dobong', name_ko: '서울 도봉구청', status_cd: 'REQUESTED', requester_count: 3,
    requester_names: ['김가나', '이다라', '박마바'], first_requested_at: '2026-11-17T01:00:00+09:00', first_requested_on: '2026-11-17',
    prev_domains: ['dobong.go.kr'], run_domains: [], last_import_at: '2026-09-02T01:00:00+09:00', run_mode: null, run_at: null,
    run_by_name: null, run_result_cd: null, closed_at: null, close_reason: null }, over || {});
}
function screen(over) {
  return Object.assign({ view: 'open', items: [adm()], agent: false, load: 'ok', code: 0, sel: [], ask: null, runAsk: false, busy: '', today: '2026-11-22' }, over || {});
}
function idx(h, s) { return h.indexOf(s); }

// ── 상태 칩(6-1) ─────────────────────────────────────────────────────
test('reqBadgeHtml: 상태 6종은 글자·클래스·data-st, 모르는 코드는 pp-cancel 에 원문(이스케이프)', function () {
  assert.strictEqual(plans.reqBadgeHtml('REQUESTED'), '<span class="wf-badge cr-st gap" data-st="REQUESTED">요청됨</span>');
  assert.strictEqual(plans.reqBadgeHtml('RUNNING'), '<span class="wf-badge cr-st pp-neutral" data-st="RUNNING">수집 중(반입 대기)</span>');
  assert.strictEqual(plans.reqBadgeHtml('APPLIED'), '<span class="wf-badge cr-st ok" data-st="APPLIED">반영됨</span>');
  assert.strictEqual(plans.reqBadgeHtml('FAILED'), '<span class="wf-badge cr-st none" data-st="FAILED">실패</span>');
  assert.strictEqual(plans.reqBadgeHtml('CANCELED'), '<span class="wf-badge cr-st pp-cancel" data-st="CANCELED">취소됨</span>');
  assert.strictEqual(plans.reqBadgeHtml('EXCLUDED'), '<span class="wf-badge cr-st pp-cancel" data-st="EXCLUDED">제외됨</span>');
  const x = plans.reqBadgeHtml('<b>x');
  assert.ok(x.indexOf('<b>') < 0 && x.indexOf('&lt;b&gt;x') >= 0 && x.indexOf('pp-cancel') >= 0);
  assert.ok(plans.reqBadgeHtml('constructor').indexOf('pp-cancel" data-st="constructor">constructor') >= 0);   // 객체 기본 속성 이름도 원문 처리
});

// ── 상세 요청 줄(6-2) ────────────────────────────────────────────────
test('reqLineHtml: 요청 없음 → 요청 가능 여부·자료 유무별 안내, 디자이너는 줄 없음', function () {
  const a = plans.reqLineHtml(null, { can: true, hasData: false });
  assert.ok(a.indexOf('role="group" aria-label="수집 요청"') >= 0 && a.indexOf('<button type="button" id="pl-req-go">수집 요청</button>') >= 0);
  assert.ok(a.indexOf('개발부서가 수집하고, 자료가 들어오면 쪽지로 알려 드립니다.') >= 0);
  assert.ok(plans.reqLineHtml(null, { can: true, hasData: true }).indexOf('새 계획이 나왔으면 다시 요청하세요.') >= 0);
  assert.strictEqual(plans.reqLineHtml(null, { can: false }), '');
});

test('reqLineHtml: 요청됨(나 포함/나 없음)·수집 중·디자이너 — 칩·사람 수·날짜·버튼', function () {
  const mine = plans.reqLineHtml(req(), { can: true });
  assert.ok(mine.indexOf('wf-badge') < 0 && mine.indexOf('나 포함 <span class="v">3</span>명') >= 0);   // 칩은 첫 줄(stateChipsHtml)에만
  assert.ok(mine.indexOf('첫 요청 <span class="v">2026-11-17</span>') >= 0);
  assert.ok(mine.indexOf('id="pl-req-cancel">내 요청 취소') >= 0 && mine.indexOf('pl-req-go') < 0);
  const other = plans.reqLineHtml(req({ requested_by_me: false, requester_count: 2 }), { can: true });
  assert.ok(other.indexOf('<span class="v">2</span>명 요청') >= 0 && other.indexOf('id="pl-req-go"') >= 0 && other.indexOf('pl-req-cancel') < 0);
  const run = plans.reqLineHtml(req({ status_cd: 'RUNNING', run_at: '2026-11-18T10:00:00+09:00' }), { can: true });
  assert.ok(run.indexOf('wf-badge') < 0 && run.indexOf('내보냄 <span class="v">2026-11-18</span> · 반입 대기') >= 0);
  assert.ok(run.indexOf('<button') < 0, '수집 중 + 나 포함: 취소도 요청도 없다');
  const runOther = plans.reqLineHtml(req({ status_cd: 'RUNNING', requested_by_me: false, run_at: '2026-11-18T10:00:00+09:00' }), { can: true });
  assert.ok(runOther.indexOf('id="pl-req-go"') >= 0);
  const designer = plans.reqLineHtml(req({ requested_by_me: false }), { can: false });
  assert.ok(designer.indexOf('<span class="v">3</span>명 요청') >= 0 && designer.indexOf('wf-badge') < 0 && designer.indexOf('<button') < 0);
});

test('reqLineHtml: 처리 중 버튼은 disabled + 진행 글자', function () {
  assert.ok(plans.reqLineHtml(null, { can: true, busy: 'go' }).indexOf('id="pl-req-go" disabled>요청 중…</button>') >= 0);
  assert.ok(plans.reqLineHtml(req(), { can: true, busy: 'cancel' }).indexOf('id="pl-req-cancel" disabled>취소하는 중…</button>') >= 0);
});

function docOk() {
  return { status: 'ok', data: { institution_id: 'jongno', name_ko: '종로구', today: '2026-11-17',
    import: { import_id: 3, origin_cd: 'IMPORT', imported_at: '2026-11-16T01:02:03+00:00' },
    docs: [{ doc_id: 7, title: '계획', src_kind_cd: 'PLEDGE', period_from: 2022, period_to: 2026, period_ended: false, url_missing: true, checked_on: '2026-11-10', stale: false, items: [] }] } };
}
test('detailHtml: 요청 줄은 head 바로 뒤·반입일 앞, 요청 현황이 없으면 그리지 않고, 오류·미등록 상태에서도 그리지 않는다', function () {
  const o = { name: '종로구', sub: '지자체 · 서울', req: { item: null, can: true, busy: '' } };
  const h = plans.detailHtml(docOk(), o);
  assert.ok(idx(h, 'id="pl-name"') < idx(h, 'class="db-sec pl-sum"') && idx(h, 'class="pl-st"') < idx(h, 'class="db-why pl-imp"') && idx(h, 'class="db-why pl-imp"') < idx(h, 'class="pl-req"'));   // 요청 줄은 절의 마지막
  assert.ok(idx(h, 'class="db-sub"') < idx(h, 'class="pl-req"'));
  assert.ok(plans.detailHtml(docOk(), { name: '종로구' }).indexOf('pl-req') < 0);
  ['loading', 'noid', 'offline', 'denied', 'notfound', 'error'].forEach(function (s) {
    assert.ok(plans.detailHtml({ status: s }, o).indexOf('pl-req') < 0, s);
  });
});
test('detailHtml 자료 없음: 요청 가능하면 짧은 문구 + 요청 줄, 디자이너는 안내 문구', function () {
  const empty = { status: 'ok', data: { institution_id: 'x', name_ko: 'X', import: null, docs: [] } };
  const can = plans.detailHtml(empty, { req: { item: null, can: true, busy: '' } });
  assert.ok(can.indexOf('이 기관의 사업계획은 아직 수집되지 않았습니다.</p>') >= 0 && can.indexOf('id="pl-req-go"') >= 0);
  assert.ok(can.indexOf('시스템 관리자가 올리면') < 0);
  const des = plans.detailHtml(empty, { req: { item: null, can: false, busy: '' } });
  assert.ok(des.indexOf('영업부서가 수집을 요청하면 개발부서가 모아 올립니다.') >= 0 && des.indexOf('pl-req') < 0);
});

// ── 목록 줄 칩 ───────────────────────────────────────────────────────
test('rowHtml: 열린 요청(요청됨·수집 중)만 칩 하나, 닫힌 상태·없음은 칩 없음, 버튼 없음', function () {
  const r = plans.baseRows([{ name: '가구', region: '11', type: '지자체', institutionId: 'ga' }], null, null)[0];
  const a = plans.rowHtml(r, { loaded: true, req: req({ institution_id: 'ga' }) });
  assert.ok(a.indexOf('data-st="REQUESTED">사업계획 요청됨</span>') >= 0 && a.indexOf('pop-unk') < 0 && a.indexOf('<button') < 0);   // 자료 없음 + 요청됨 = 칩 하나
  assert.ok(plans.rowHtml(r, { loaded: false, req: req({ institution_id: 'ga' }) }).indexOf('cr-st') < 0);   // 자료 현황을 못 받았으면 3행 칩 없음
  assert.ok(plans.rowHtml(r, { loaded: true, req: req({ status_cd: 'RUNNING' }) }).indexOf('data-st="RUNNING">사업계획 수집 중</span>') >= 0);
  assert.ok(plans.rowHtml(r, { loaded: true, req: req({ status_cd: 'APPLIED' }) }).indexOf('cr-st') < 0);
  assert.ok(plans.rowHtml(r, { loaded: true, req: null }).indexOf('cr-st') < 0);
  assert.ok(plans.rowHtml(r, {}).indexOf('cr-st') < 0);
});

// ── 요약 절 ──────────────────────────────────────────────────────────
test('sectionInner: 자료 없음 + 열린 요청/요청 가능/디자이너, 거짓 문구 삭제, 현황을 못 받았으면 표시 없음', function () {
  plans.resetStatus();
  try {
    plans.applyStatus({ items: [{ institution_id: 'jongno', item_count: 12, stale: false }] });
    plans.applyCollect({ can_request: true, items: [req({ institution_id: 'jongno' }), req({ institution_id: 'seongbuk', requester_count: 2, requested_by_me: false })] });
    const has = plans.sectionInner('jongno', 'db-name');
    assert.ok(has.indexOf('data-st="REQUESTED"') >= 0 && has.indexOf('<span class="v">3</span>명 요청') >= 0);
    assert.ok(has.indexOf('사업계획 <span class="v">12</span>건 보기') >= 0);
    const queued = plans.sectionInner('seongbuk', 'db-name');
    assert.ok(queued.indexOf('data-st="REQUESTED">사업계획 요청됨</span>') >= 0 && queued.indexOf('pop-unk') < 0);   // 자료 없음 + 요청됨 = 칩 하나
    assert.ok(queued.indexOf('data-pl-open="seongbuk"') >= 0 && queued.indexOf('기관 사업계획에서 보기') >= 0);
    assert.ok(queued.indexOf('입찰이 가까운 기관부터') < 0 && queued.indexOf('db-empty') < 0);
    const none = plans.sectionInner('nobody', 'db-name');
    assert.ok(none.indexOf('data-pl-open="nobody"') >= 0 && none.indexOf('기관 사업계획에서 수집 요청') >= 0);
    plans.applyCollect({ can_request: false, items: [] });
    const des = plans.sectionInner('nobody', 'db-name');
    assert.ok(des.indexOf('data-pl-open') < 0 && des.indexOf('pop-unk">자료 없음') >= 0 && des.indexOf('db-empty') < 0);
    plans.resetCollect();
    assert.strictEqual(plans.collectState(), 'idle');
    assert.ok(plans.sectionInner('nobody', 'db-name').indexOf('data-pl-open') < 0);
    assert.ok(plans.sectionInner('seongbuk', 'db-name').indexOf('cr-st') < 0);
  } finally { plans.resetStatus(); }
  assert.strictEqual(plans.collectState(), 'idle', 'resetStatus 가 수집 요청 현황도 비운다(계정 전환)');
});

test('appliedMap·new 칩: recent_applied 는 기관별로 나르고, 키가 없거나 배열이 아닌 옛 응답은 빈 값, 요청 현황이 없으면 new 도 없다', function () {
  assert.deepStrictEqual(plans.appliedMap({}), {});
  assert.deepStrictEqual(plans.appliedMap(null), {});
  assert.deepStrictEqual(plans.appliedMap({ recent_applied: 'x' }), {});
  assert.deepStrictEqual(plans.appliedMap({ recent_applied: { institution_id: 'a' } }), {});   // 배열이 아니면 무시
  const APPLIED = { institution_id: 'jongno', closed_at: '2026-11-19T01:00:00+09:00' };
  assert.deepStrictEqual(Object.keys(plans.appliedMap({ recent_applied: [APPLIED, null, {}, { closed_at: 'x' }] })), ['jongno']);
  plans.resetStatus();
  try {
    plans.applyStatus({ items: [{ institution_id: 'jongno', item_count: 12, stale: true }] });
    plans.applyCollect({ can_request: true, items: [] });   // recent_applied 키 없음(옛 서버)
    const old = plans.sectionInner('jongno', 'db-name');
    assert.ok(old.indexOf('data-st="NEW"') < 0 && old.indexOf('오래됨') >= 0);
    plans.applyCollect({ can_request: true, items: [], recent_applied: [APPLIED] });
    const neu = plans.sectionInner('jongno', 'db-name');
    assert.ok(neu.indexOf('wf-badge cr-st ok" data-st="NEW"') >= 0 && neu.indexOf('2026-11-19에 들어온 자료입니다(7일간 표시).') >= 0 && neu.indexOf('오래됨') < 0);
    assert.strictEqual(plans.sectionInner('constructor', 'db-name').indexOf('data-st="NEW"'), -1);   // 객체 기본 속성 이름은 기관이 아니다
    plans.setCollectState('forbidden', 403);
    assert.strictEqual(plans.sectionInner('jongno', 'db-name').indexOf('data-st="NEW"'), -1);   // 요청 현황이 없으면 new 도 없다
  } finally { plans.resetStatus(); }
});

test('reqErrorText·reqFlash: 서버 원문 없이 상태·코드 표로만', function () {
  assert.ok(plans.reqErrorText('go', 0).indexOf('연결 실패') >= 0);
  assert.ok(plans.reqErrorText('go', 401).indexOf('로그인') >= 0);
  assert.ok(plans.reqErrorText('go', 403).indexOf('영업부서·개발부서만') >= 0);
  assert.ok(plans.reqErrorText('cancel', 404).indexOf('취소할 요청이 없습니다') >= 0 && plans.reqErrorText('go', 404).indexOf('기관을 찾지 못했습니다') >= 0);
  assert.ok(plans.reqErrorText('go', 409).indexOf('다른 사람이 방금') >= 0);
  assert.ok(plans.reqErrorText('go', 500).indexOf('(500)') >= 0);
  assert.strictEqual(plans.reqFlash('go', { created: true, status_cd: 'REQUESTED', requester_count: 1 }), '수집을 요청했습니다. 개발부서가 처리하면 쪽지로 알려 드립니다.');
  assert.ok(plans.reqFlash('go', { created: false, outcome: 'JOINED', requester_count: 3 }).indexOf('요청자로 함께 올렸습니다(나 포함 3명)') >= 0);
  assert.ok(plans.reqFlash('go', { created: false, outcome: 'DUPLICATE', requester_count: 3 }).indexOf('이미 요청한 기관입니다(나 포함 3명)') >= 0);
  assert.ok(plans.reqFlash('cancel', { status_cd: 'REQUESTED', requester_count: 2 }).indexOf('다른 요청자 2명의 요청은 그대로입니다') >= 0);
  assert.ok(plans.reqFlash('cancel', { status_cd: 'CANCELED', requester_count: 0 }).indexOf('\'취소됨\'이 됐습니다') >= 0);
});

// ── 처리 화면(순수) ──────────────────────────────────────────────────
test('rowHtml 요청됨: 선택 칸(이름 있는 체크)·칩·요청자·경과일·도메인·마지막 반입·[제외] 8칸', function () {
  const h = pc.rowHtml(adm(), { checked: true, today: '2026-11-22', sub: '기초자치단체 · 서울' });
  assert.ok(h.indexOf('data-req="' + K1 + '" data-st="REQUESTED"') >= 0);
  assert.ok(h.indexOf('name="cr-sel" value="' + K1 + '" aria-label="서울 도봉구청 선택" checked') >= 0);
  assert.ok(h.indexOf('<span class="cr-nm">서울 도봉구청</span><span class="cr-sub">기초자치단체 · 서울</span>') >= 0);
  assert.ok(h.indexOf('data-st="REQUESTED">요청됨</span>') >= 0);
  assert.ok(h.indexOf('<span class="v">3</span>명<span class="cr-sub">김가나, 이다라, 박마바</span>') >= 0);
  assert.ok(h.indexOf('<span class="v">2026-11-17</span><span class="cr-sub">요청 뒤 <span class="v">5</span>일</span>') >= 0);
  assert.ok(h.indexOf('<span class="v" title="dobong.go.kr">dobong.go.kr</span>') >= 0 && h.indexOf('<span class="v">2026-09-02</span>') >= 0);
  assert.ok(h.indexOf('data-cr="ask-exclude" data-key="' + K1 + '" aria-label="서울 도봉구청 제외">제외</button>') >= 0);
  assert.strictEqual((h.match(/<td/g) || []).length, 8);
});
test('rowHtml 수집 중·닫힌 행: 수집 중은 [실패로 표시]·내보낸 뒤 경과, 닫힌 행은 체크·버튼 없이 닫힌 날짜·사유', function () {
  const run = pc.rowHtml(adm({ status_cd: 'RUNNING', run_at: '2026-11-20T09:00:00+09:00', run_by_name: '최개발', run_mode: 'MANUAL' }), { today: '2026-11-22' });
  assert.ok(run.indexOf('name="cr-sel"') >= 0 && run.indexOf('data-cr="ask-fail"') >= 0 && run.indexOf('ask-exclude') < 0);
  assert.ok(run.indexOf('내보낸 뒤 <span class="v">2</span>일') >= 0 && run.indexOf('최개발 · 목록으로 표시') >= 0);
  const failed = pc.rowHtml(adm({ status_cd: 'FAILED', closed_at: '2026-11-20T09:00:00+09:00', close_reason: '연결 안 됨' }), { today: '2026-11-22' });
  assert.ok(failed.indexOf('name="cr-sel"') < 0 && failed.indexOf('<button') < 0);
  assert.ok(failed.indexOf('실패 <span class="v">2026-11-20</span>') >= 0 && failed.indexOf('사유: 연결 안 됨') >= 0);
  const requeued = pc.rowHtml(adm({ run_result_cd: 'AGENT_UNREACHABLE' }), {});
  assert.ok(requeued.indexOf('직전 실행: 연결 안 됨 또는 응답 없음') >= 0);
  assert.ok(pc.rowHtml(adm({ prev_domains: [] }), {}).indexOf('<span class="ad-note">없음</span>') >= 0);
  const evil = pc.rowHtml(adm({ name_ko: '<img onerror=1>', requester_names: ['<b>x'], status_cd: 'EXCLUDED', close_reason: '<script>' }), {});
  assert.ok(evil.indexOf('<img') < 0 && evil.indexOf('<b>x') < 0 && evil.indexOf('<script>') < 0 && evil.indexOf('&lt;img') >= 0);
});
test('domainCell·daysSince·todayKst', function () {
  const c = pc.domainCell(['a.go.kr', 'b.go.kr', 'c.go.kr']);
  assert.ok(c.indexOf('title="a.go.kr, b.go.kr, c.go.kr">a.go.kr</span>') >= 0 && c.indexOf('외 <span class="v">2</span>') >= 0);
  assert.strictEqual(pc.daysSince('2026-11-17T01:00:00+09:00', '2026-11-22'), 5);
  assert.strictEqual(pc.daysSince('2026-11-17T01:00:00+09:00', '2026-11-17'), 0);
  assert.strictEqual(pc.daysSince('2026-11-30T01:00:00+09:00', '2026-11-22'), 0);   // 미래는 0
  assert.strictEqual(pc.daysSince('', '2026-11-22'), null);
  assert.strictEqual(pc.todayKst(Date.UTC(2026, 10, 16, 16, 0, 0)), '2026-11-17');   // 오후 UTC 는 다음 날(KST)
});
test('askRowHtml: 제외/실패 확인 줄 — 요청자 수 문구, 사유 칸(100자·필수 안내), 잠김·오류 표시, 이스케이프', function () {
  const ex = pc.askRowHtml(adm(), { kind: 'exclude', key: K1, reason: '', invalid: false }, {});
  assert.ok(ex.indexOf('class="cr-ask"') >= 0 && ex.indexOf('colspan="8"') >= 0);
  assert.ok(ex.indexOf('서울 도봉구청 요청을 제외합니다. 요청자 <span class="v">3</span>명에게 사유가 보입니다.') >= 0);
  assert.ok(ex.indexOf('id="cr-reason" maxlength="100"') >= 0 && ex.indexOf('사유는 요청한 사람에게 보입니다. 개인정보를 적지 마세요.') >= 0);
  assert.ok(ex.indexOf('class="pp-danger" data-cr="do">제외하기') >= 0 && ex.indexOf('data-cr="cancel">취소') >= 0);
  const fail = pc.askRowHtml(adm({ status_cd: 'RUNNING' }), { kind: 'fail', key: K1, reason: '<b>', invalid: true }, { busy: true });
  assert.ok(fail.indexOf('실패로 표시합니다. 요청자 <span class="v">3</span>명에게 쪽지와 사유가 갑니다.') >= 0);
  assert.ok(fail.indexOf('aria-invalid="true"') >= 0 && fail.indexOf('value="&lt;b&gt;"') >= 0 && fail.indexOf('disabled>처리 중…') >= 0);
});
test('selection·btnState: 내려받기 n = 요청됨+수집 중 선택, 표시·실행 n = 요청됨만, 닫힌 행·없는 키는 세지 않고 0이면 잠김, 실행 단추는 설정이 있을 때만', function () {
  const items = [adm({ req_key: K1 }), adm({ req_key: K2, status_cd: 'RUNNING' }), adm({ req_key: K3, status_cd: 'FAILED' })];
  const s = pc.selection(items, [K1, K2, K3, 'zz']);
  assert.deepStrictEqual(s.all, [K1, K2]);
  assert.deepStrictEqual(s.req, [K1]);
  const b = pc.btnState({ items: items, sel: [K1, K2], agent: false, busy: '' });
  assert.ok(b.csv.html.indexOf('선택한 <span class="v">2</span>곳 목록 내려받기(CSV)') >= 0 && !b.csv.disabled);
  assert.ok(b.mark.html.indexOf('선택한 <span class="v">1</span>곳 수집 중으로 표시') >= 0 && !b.mark.disabled);
  assert.strictEqual(b.run, undefined);
  assert.ok(pc.btnState({ items: items, sel: [], agent: true, busy: '' }).run.disabled);
  assert.ok(pc.btnState({ items: items, sel: [K2], agent: false, busy: '' }).mark.disabled);   // 수집 중만 골랐으면 '수집 중으로 표시'는 잠김
  assert.ok(pc.btnState({ items: items, sel: [K1], agent: false, busy: 'csv' }).csv.disabled);
  assert.deepStrictEqual(pc.requestedKeys(items), [K1]);
});
test('screenHtml: 불러오는 중·오류(403은 권한 문구, 그 밖은 다시 불러오기)·빈 상태·표·실행 단추/확인 상자', function () {
  assert.ok(pc.screenHtml(screen({ load: 'loading' })).indexOf('aria-busy="true"') >= 0);
  assert.ok(pc.screenHtml(screen({ load: 'error', code: 403 })).indexOf('시스템 관리 권한이 있는 개발부서만 씁니다(403)') >= 0);
  const err = pc.screenHtml(screen({ load: 'error', code: 500 }));
  assert.ok(err.indexOf('불러오지 못했습니다(500)') >= 0 && err.indexOf('data-cr="reload">다시 불러오기') >= 0);
  assert.ok(pc.screenHtml(screen({ load: 'offline' })).indexOf('서버에 연결되면') >= 0);
  assert.ok(pc.screenHtml(screen({ items: [] })).indexOf('처리할 수집 요청이 없습니다. 영업부서가 기관 사업계획 화면에서 [수집 요청]을 누르면 여기에 모입니다.') >= 0);
  assert.ok(pc.screenHtml(screen({ items: [], view: 'closed' })).indexOf('끝난 요청이 아직 없습니다.') >= 0);
  const h = pc.screenHtml(screen());
  assert.ok(h.indexOf('name="cr-view" value="open" checked') >= 0 && h.indexOf('id="cr-csv"') >= 0 && h.indexOf('id="cr-run"') < 0);
  assert.ok(h.indexOf('<caption class="sr-only">사업계획 수집 요청 목록(기관 단위)</caption>') >= 0 && h.indexOf('id="cr-all"') >= 0);
  assert.strictEqual((h.match(/<th scope="col"/g) || []).length, 8);
  assert.ok(h.indexOf('요청됨 <b>1</b>곳 · 수집 중 <b>0</b>곳') >= 0);
  const withAgent = pc.screenHtml(screen({ agent: true, sel: [K1], runAsk: true }));
  assert.ok(withAgent.indexOf('id="cr-run"') >= 0 && withAgent.indexOf('id="cr-run-ask"') >= 0);
  assert.ok(withAgent.indexOf('선택한 <span class="v">1</span>곳의 기관 ID·기관 이름·이전 출처 도메인을 망 밖 수집 서버로 보냅니다. 요청자 이름·사번은 보내지 않습니다.') >= 0);
  assert.ok(pc.screenHtml(screen({ runAsk: true })).indexOf('cr-run-ask') < 0, '설정이 없으면 확인 상자도 없다');
  const asked = pc.screenHtml(screen({ ask: { kind: 'exclude', key: K1, reason: '', invalid: false } }));
  assert.ok(idx(asked, 'data-req="' + K1 + '" data-st=') < idx(asked, 'class="cr-ask"'));
});
test('문구 표: errorText 상태·코드, resultText, 결과 문구(표시·실행·제외·내려받기), 서버 원문 없음', function () {
  assert.ok(pc.errorText(0, '').indexOf('연결 실패') >= 0 && pc.errorText(401, '').indexOf('로그인') >= 0);
  assert.ok(pc.errorText(403, '').indexOf('(403)') >= 0 && pc.errorText(400, '').indexOf('개인정보') >= 0);
  assert.ok(pc.errorText(409, '').indexOf('목록을 다시 불러왔습니다') >= 0 && pc.errorText(409, 'BUSY').indexOf('다른 실행이 진행 중') >= 0);
  assert.ok(pc.errorText(503, 'BLOCKED_NO_URL').indexOf('설정되지 않아') >= 0 && pc.errorText(503, 'BLOCKED_BAD_CONFIG').indexOf('올바르지 않아') >= 0);
  assert.ok(pc.errorText(503, '').indexOf('(503)') >= 0 && pc.errorText(500, '').indexOf('(500)') >= 0);
  assert.strictEqual(pc.resultText('AGENT_UNREACHABLE'), '수집 서버에 연결하지 못했습니다(연결 안 됨 또는 응답 없음)');
  assert.strictEqual(pc.resultText('zzz'), '처리하지 못했습니다');
  assert.strictEqual(pc.resultText('toString'), '처리하지 못했습니다');
  assert.strictEqual(pc.reasonCheck('  '), '사유를 적으세요.');
  assert.ok(pc.reasonCheck(new Array(102).join('가')).indexOf('100자') >= 0);
  assert.strictEqual(pc.reasonCheck('수집 불가'), '');
  assert.strictEqual(pc.markFlash(2, [{ result_cd: 'OK' }, { result_cd: 'OK' }]), '2곳을 \'수집 중\'으로 표시했습니다. 자료가 들어오면 자동으로 \'반영됨\'이 되고 요청자에게 쪽지가 갑니다.');
  assert.ok(pc.markFlash(2, [{ result_cd: 'OK' }, { result_cd: 'NOT_REQUESTED' }]).indexOf('1곳은 건너뛰었습니다 — 이미 다른 사람이 처리함. 목록을 다시 불러왔습니다.') >= 0);
  assert.ok(pc.runFlash(3, [{ result_cd: 'SENT' }, { result_cd: 'AGENT_UNREACHABLE' }, { result_cd: 'AGENT_UNREACHABLE' }]).indexOf('3곳 중 1곳을 보냈습니다(수집 중). 2곳은 보내지 못했습니다 — 수집 서버 연결 안 됨 또는 응답 없음. 목록을 다시 불러왔습니다.') >= 0);
  assert.ok(pc.closeFlash('exclude', '도봉구청', 3).indexOf('요청을 제외했습니다. 요청자 3명에게 쪽지로 알렸습니다.') >= 0);
  assert.ok(pc.closeFlash('fail', '도봉구청', 3).indexOf('수집을 실패로 표시했습니다.') >= 0);
  assert.ok(pc.csvFlash(2, 1).indexOf('2곳 목록을 내려받았습니다. 수집 PC로 옮긴 뒤 [선택한 1곳 수집 중으로 표시]를 누르세요.') >= 0);
  assert.strictEqual(pc.csvFlash(2, 0), '2곳 목록을 내려받았습니다.');
  assert.strictEqual(pc.countHtml([adm(), adm({ status_cd: 'FAILED' })], 'all'), '요청됨 <b>1</b>곳 · 수집 중 <b>0</b>곳 · 실패 <b>1</b>곳');
  assert.strictEqual(pc.filenameFrom('attachment; filename="plan_collect_20261117.csv"'), 'plan_collect_20261117.csv');
  assert.strictEqual(pc.filenameFrom('attachment; filename="../x.exe"'), 'plan_collect.csv');
});

// ── nav·배지 ─────────────────────────────────────────────────────────
test('nav: 사업계획 수집 요청은 admin 키 하나로 노출(admin 이 꺼지면 시스템 관리 전체가 사라진다)', function () {
  assert.strictEqual(nav.COLLECT_ID, 'admin:collect');
  assert.strictEqual(pc.NAV_ID, nav.COLLECT_ID);
  const built = nav.build(ALL_ON, { role: '전산팀', master: true });
  assert.strictEqual(nav.categoryOf(built, 'admin:collect'), 'sys');
  assert.strictEqual(built.filter(function (c) { return c.id === 'sys'; })[0].items.filter(function (i) { return i.id === 'admin:collect'; })[0].label, '사업계획 수집 요청');
  assert.strictEqual(nav.categoryOf(nav.build(Object.assign({}, ALL_ON, { admin: false }), { role: '영업팀' }), 'admin:collect'), null);
});
test('배지: 문장은 수집 요청 대기 기관 n곳, DOM 이 없으면 아무 일 없음', function () {
  assert.strictEqual(pc.badgeSr(3), '수집 요청 대기 기관 3곳');
  assert.doesNotThrow(function () { pc.paintNavBadge(); pc.setBadge(2); pc.onNavDrawn(); });
  return pc.refreshBadge(true);   // node 에서는 서버 호출 없이 끝난다
});
test('배지: 창으로 돌아오면(focus) refreshBadge(false) 1회, 리스너는 한 번만 단다, 배지에 aria-live 없음', function () {
  const calls = [], handlers = [];
  const win = { addEventListener: function (t, f) { handlers.push([t, f]); } };
  assert.strictEqual(pc.bindBadgeFocus(win), true);
  assert.strictEqual(pc.bindBadgeFocus(win), false);   // 중복 등록 방지
  assert.deepStrictEqual(handlers.map(function (h) { return h[0]; }), ['focus']);
  const orig = pc.refreshBadge;
  pc.refreshBadge = function (force) { calls.push(force); return Promise.resolve(); };
  try { handlers[0][1](); } finally { pc.refreshBadge = orig; }
  assert.deepStrictEqual(calls, [false]);   // 60초 제한이 걸리는 force=false 로만
  assert.ok(PC_SRC.indexOf('aria-live') < 0);
});

// ── 소스·연결 규칙 ───────────────────────────────────────────────────
test('소스 규칙: confirm() 없음, 외부 주소 없음, 새 hex 없음, 서버 원문(message·detail)을 화면에 넣지 않음', function () {
  [PC_SRC, PLANS_SRC].forEach(function (src) {
    assert.ok(!/\bconfirm\(/.test(src));
    assert.ok(!/https?:\/\//.test(src));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src));
    assert.ok(!/innerHTML\s*=\s*[^;]*\b(?:e|r)\.(message|detail|data\.message)/.test(src));
  });
  assert.strictEqual((PC_SRC.match(/\.message\b/g) || []).length, 1, '서버 message 는 INVALID 고정 문구를 읽는 msgOf 한 곳에서만 읽는다(11-23 security 확인)');
});
test('연결: admin.js view collect → plancollect.mount, app.js onNavDrawn·낭독 문장 일반화, overdue.js 가 수집 요청 배지를 지우지 않음', function () {
  assert.ok(ADMIN_SRC.indexOf("collect: '사업계획 수집 요청'") > 0 && ADMIN_SRC.indexOf('root.plancollect.mount({ head: el(\'ad-head\')') > 0);
  assert.ok(ADMIN_SRC.indexOf("view !== 'collect' && root.plancollect") > 0);
  assert.ok(APP_SRC.indexOf('root.plancollect.onNavDrawn()') > 0 && APP_SRC.indexOf('c.nextElementSibling') > 0);
  assert.ok(APP_SRC.indexOf("const t = n > 0 ? ', 공고 예정일 경과 미처리 '") < 0, '낭독 문장이 경과 배지 문구로 고정돼 있지 않다');
  assert.ok(OVERDUE_SRC.indexOf('root.nav.COLLECT_ID') > 0);
  assert.ok(PLANS_SRC.indexOf('입찰이 가까운 기관부터 모읍니다') < 0 && PLANS_SRC.indexOf('수집 담당에게 전달하세요') < 0);
});
test('index.html: plancollect.js 는 plans.js 뒤·admin.js 앞, CSS 블록(새 hex 금지·11px 미만 금지·채운 주버튼 금지·pl-* 블록 밖)', function () {
  const at = function (s) { return HTML.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('plancollect.js') > at('plans.js') && at('plancollect.js') < at('admin.js'));
  assert.strictEqual(HTML.split('js/plancollect.js').length, 2);
  const a = HTML.indexOf('/* 사업계획 수집 요청 시작'), b = HTML.indexOf('/* 사업계획 수집 요청 끝 */');
  assert.ok(a > 0 && b > a && a > HTML.indexOf('/* 기관 사업계획 끝 */'));
  const css = HTML.slice(a, b);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#ffffff/g, '')), '새 hex 금지(흰색 섞기 #ffffff 만 허용)');
  (css.match(/font-size:\s*(\d+)px/g) || []).forEach(function (m) { assert.ok(Number(m.match(/(\d+)/)[1]) >= 11, m); });
  assert.ok(!/background:\s*var\(--accent-color\)\s*[;}]/.test(css), '채운 주버튼 금지');
  ['.wf-badge.cr-st.gap', '.wf-badge.cr-st.ok', '.wf-badge.cr-st.none', '.pl-req {', '.cr-table', '.cr-ck label', '.cr-ask'].forEach(function (s) { assert.ok(css.indexOf(s) >= 0, s); });
});

// ── 서버 검토 반영: last_closed · detail.code · 403 · TOO_SOON ─────────
const CLOSED = { institution_id: 'jongno', status_cd: 'FAILED', closed_at: '2026-11-10T01:00:00+09:00', close_reason: '공고 페이지 없음' };
test('reqLineHtml: 최근 실패·제외 — 칩 + 날짜 · 사유 + [수집 요청], 사유는 이스케이프, 열린 요청이 있으면 무시', function () {
  const f = plans.reqLineHtml(null, { can: true, closed: CLOSED });
  assert.ok(f.indexOf('wf-badge') < 0 && f.indexOf('<span class="v">2026-11-10</span> · 사유: 공고 페이지 없음') >= 0);   // 칩은 첫 줄(수집 실패)로 옮겼다
  assert.ok(f.indexOf('id="pl-req-go">수집 요청</button>') >= 0 && f.indexOf('개발부서가 수집하고') < 0 && f.indexOf('새 계획이 나왔으면') < 0);
  const ex = plans.reqLineHtml(null, { can: true, closed: Object.assign({}, CLOSED, { status_cd: 'EXCLUDED', close_reason: '<b>x</b>' }) });
  assert.ok(ex.indexOf('wf-badge') < 0 && ex.indexOf('사유: &lt;b&gt;x&lt;/b&gt;') >= 0 && ex.indexOf('<b>x') < 0);
  const nr = plans.reqLineHtml(null, { can: true, closed: Object.assign({}, CLOSED, { close_reason: null }) });
  assert.ok(nr.indexOf('사유') < 0 && nr.indexOf('2026-11-10') >= 0);
  const des = plans.reqLineHtml(null, { can: false, closed: Object.assign({}, CLOSED, { close_reason: null }) });
  assert.strictEqual(des, '');   // 디자이너: 열린 요청이 없으면 줄 없음(규격 6-2)
  const withOpen = plans.reqLineHtml(req(), { can: true, closed: CLOSED });
  assert.ok(withOpen.indexOf('나 포함 <span class="v">3</span>명') >= 0 && withOpen.indexOf('사유') < 0);   // 열린 요청이 있으면 닫힘 사유는 숨는다
  assert.ok(plans.reqLineHtml(null, { can: true, closed: { status_cd: 'APPLIED', closed_at: CLOSED.closed_at } }).indexOf('data-st="APPLIED"') < 0);   // 실패·제외만
  assert.strictEqual(plans.reqLineHtml(null, { can: false, closed: null }), '');
});
test('closedMap·detailHtml: last_closed 는 기관별로 나르고 상세 줄에 나온다, 요청 결과는 옛 닫힘을 지운다', function () {
  plans.resetStatus();
  try {
    plans.applyCollect({ can_request: true, items: [], last_closed: [CLOSED, { institution_id: 'x', status_cd: 'APPLIED' }, null] });
    assert.deepStrictEqual(Object.keys(plans.closedMap({ last_closed: [CLOSED, { institution_id: 'x', status_cd: 'CANCELED' }] })), ['jongno']);
    assert.deepStrictEqual(plans.closedMap({}), {});
    const h = plans.detailHtml(docOk(), { name: '종로구', req: { item: null, closed: CLOSED, can: true, busy: '' } });
    assert.ok(h.indexOf('data-st="FAILED">수집 실패</span>') >= 0 && h.indexOf('사유: 공고 페이지 없음') >= 0 && idx(h, 'class="db-why pl-imp"') < idx(h, 'class="pl-req"'));
  } finally { plans.resetStatus(); }
});
test('reqErrorText: detail.code 를 먼저 보고, 코드가 없으면 상태 문구, 서버 message 는 쓰지 않는다', function () {
  assert.ok(plans.reqErrorText('cancel', 409, 'ALREADY_RUNNING').indexOf('이미 시작되어 취소할 수 없습니다') >= 0);
  assert.ok(plans.reqErrorText('go', 409, 'CONCURRENT').indexOf('동시에 처리되었습니다') >= 0);
  assert.ok(plans.reqErrorText('cancel', 404, 'NO_REQUEST').indexOf('취소할 요청이 없습니다') >= 0);
  assert.ok(plans.reqErrorText('go', 404, 'NOT_FOUND').indexOf('기관을 찾지 못했습니다') >= 0);
  assert.ok(plans.reqErrorText('go', 409, 'STATE_CHANGED').indexOf('다른 사람이 방금') >= 0);   // 모르는 코드 → 상태 문구
  assert.ok(plans.reqErrorText('go', 409).indexOf('다른 사람이 방금') >= 0 && plans.reqErrorText('go', 500, 'X').indexOf('(500)') >= 0);
});
test('errorText·resultText: REASON_* 코드·TOO_SOON, 코드 없는 400 은 기존 문구', function () {
  assert.strictEqual(pc.errorText(400, 'REASON_REQUIRED'), '사유를 적으세요.');
  assert.ok(pc.errorText(400, 'REASON_TOO_LONG').indexOf('100자 이내') >= 0);
  assert.ok(pc.errorText(400, 'REASON_FORMAT').indexOf('쓸 수 없는 글자') >= 0);
  assert.ok(pc.errorText(400, 'REASON_PII').indexOf('개인정보(전화번호·주민번호·이메일 등)') >= 0);
  assert.ok(pc.errorText(400, 'BAD_KEYS').indexOf('(400)') >= 0 && pc.errorText(400, '').indexOf('개인정보') >= 0);
  assert.strictEqual(pc.resultText('TOO_SOON'), '같은 기관을 10분 안에 다시 실행할 수 없습니다. 잠시 뒤 다시 누르세요.');
  assert.ok(pc.runFlash(2, [{ result_cd: 'SENT' }, { result_cd: 'TOO_SOON' }]).indexOf('1곳은 보내지 못했습니다 — 10분 안에 다시 실행할 수 없음. 목록을 다시 불러왔습니다.') >= 0);
});
test('재무부서 403: 수집 요청 현황은 forbidden 으로 굳히고 다시 묻지 않는다(소스 구조)', function () {
  assert.ok(/CS\.state === 'forbidden'\) return Promise\.resolve\(CS\)/.test(PLANS_SRC));
  assert.ok(/r\.status === 'denied' && r\.code === 403\) CS = Object\.assign\(freshCollect\(\), \{ state: 'forbidden'/.test(PLANS_SRC));
  assert.ok(/plans\.reqErrorText\(kind, r\.status, r\.code\)/.test(PLANS_SRC));
  plans.resetStatus();
  plans.setCollectState('forbidden', 403);
  assert.strictEqual(plans.collectState(), 'forbidden');
  assert.strictEqual(plans.detailHtml(docOk(), { name: '종로구' }).indexOf('pl-req'), -1);   // req 없음 → 줄 없음
  assert.strictEqual(plans.sectionInner('nobody', 'db-name').indexOf('cr-st'), -1);
  plans.resetStatus();
  assert.strictEqual(plans.collectState(), 'idle');
});

// ── 11-17 qa·design 반영 ───────────────────────────────────────────
test('결과 문구 표 둘: resultText 는 문장형 그대로, resultShort 는 명사구(마침표 없음), 이어 붙인 문구에 마침표가 겹치지 않는다', function () {
  ['NOT_FOUND', 'NOT_REQUESTED', 'NOT_OPEN', 'NOT_RUNNING', 'CONFLICT', 'TOO_SOON', 'AGENT_UNREACHABLE', 'AGENT_REJECTED', 'BAD_RESPONSE', 'BLOCKED_NO_URL', 'BLOCKED_BAD_CONFIG'].forEach(function (c) {
    const t = pc.resultShort(c);
    assert.ok(t && !/[.。]$/.test(t) && t.indexOf('..') < 0, c);
  });
  assert.strictEqual(pc.resultShort('zzz'), '처리하지 못함');
  assert.strictEqual(pc.resultShort('toString'), '처리하지 못함');
  assert.strictEqual(pc.resultText('TOO_SOON'), '같은 기관을 10분 안에 다시 실행할 수 없습니다. 잠시 뒤 다시 누르세요.');
  const f = pc.runFlash(2, [{ result_cd: 'SENT' }, { result_cd: 'TOO_SOON' }]);
  assert.ok(f.indexOf('..') < 0 && f.indexOf('할 수 없음. 목록을 다시 불러왔습니다.') >= 0);
  const m = pc.markFlash(2, [{ result_cd: 'NOT_REQUESTED' }, { result_cd: 'CONFLICT' }]);
  assert.ok(m.indexOf('2곳은 건너뛰었습니다 — 이미 다른 사람이 처리함, 다른 사람이 방금 처리함. 목록을') >= 0 && m.indexOf('..') < 0);
});
test('errorText 맥락 keys: 400 은 사유 안내 없이 선택 확인 문구, 다른 상태·맥락 없음은 그대로', function () {
  assert.strictEqual(pc.errorText(400, 'BAD_KEYS', 'keys'), '선택한 요청을 확인하세요(400).');
  assert.ok(pc.errorText(400, '', 'keys').indexOf('사유') < 0 && pc.errorText(400, '', 'keys').indexOf('개인정보') < 0);
  assert.ok(pc.errorText(400, '').indexOf('개인정보') >= 0 && pc.errorText(400, 'REASON_PII').indexOf('개인정보(전화번호') >= 0);
  assert.ok(pc.errorText(500, '', 'keys').indexOf('(500)') >= 0 && pc.errorText(409, 'BUSY', 'keys').indexOf('다른 실행이 진행 중') >= 0);
});
test('btnState·toolbarHtml 상한: 50곳 넘으면 내려받기·표시·실행 잠금, 10곳 넘으면 실행만 잠금, 안내 한 줄(없으면 hidden)', function () {
  const many = [];
  for (let i = 0; i < 51; i += 1) many.push(adm({ req_key: 'k' + i }));
  const keys = many.map(function (x) { return x.req_key; });
  const b51 = pc.btnState({ items: many, sel: keys, agent: true, busy: '' });
  assert.ok(b51.csv.disabled && b51.mark.disabled && b51.run.disabled && b51.hint.indexOf('50곳') >= 0);
  const b11 = pc.btnState({ items: many, sel: keys.slice(0, 11), agent: true, busy: '' });
  assert.ok(!b11.csv.disabled && !b11.mark.disabled && b11.run.disabled && b11.hint.indexOf('10곳') >= 0);
  const b10 = pc.btnState({ items: many, sel: keys.slice(0, 10), agent: true, busy: '' });
  assert.ok(!b10.run.disabled && b10.hint === '');
  assert.strictEqual(pc.btnState({ items: many, sel: keys.slice(0, 11), agent: false, busy: '' }).hint, '');   // 설정이 없으면 실행 안내도 없다
  const none = pc.toolbarHtml({ view: 'open', items: [adm()], sel: [], agent: false, busy: '' });
  assert.ok(none.indexOf('class="ad-toolbar cr-toolbar"') >= 0 && none.indexOf('id="cr-limit" hidden>') >= 0);
  const over = pc.toolbarHtml({ view: 'open', items: many, sel: keys, agent: true, busy: '' });
  assert.ok(over.indexOf('id="cr-limit">') >= 0 && over.indexOf('한 번에 50곳까지 처리할 수 있습니다') >= 0);
});
test('자료 없음 본문: 요청 현황이 아직 없으면(req null) 짧은 문구, 디자이너(req.can=false)만 긴 문구', function () {
  const empty = { status: 'ok', data: { institution_id: 'x', name_ko: 'X', import: null, docs: [] } };
  const pre = plans.detailHtml(empty, { req: null });
  assert.ok(pre.indexOf('이 기관의 사업계획은 아직 수집되지 않았습니다.</p>') >= 0 && pre.indexOf('모아 올립니다') < 0);
  assert.ok(plans.detailHtml(empty, { req: { item: null, can: false, busy: '' } }).indexOf('모아 올립니다') >= 0);
});
test('수집 중 행 보조 줄: 목록으로 표시 / 수집 서버로 보냄', function () {
  const man = pc.rowHtml(adm({ status_cd: 'RUNNING', run_by_name: '최개발', run_mode: 'MANUAL' }), {});
  const agt = pc.rowHtml(adm({ status_cd: 'RUNNING', run_by_name: '최개발', run_mode: 'AGENT' }), {});
  assert.ok(man.indexOf('최개발 · 목록으로 표시') >= 0 && man.indexOf('수동 표시') < 0 && agt.indexOf('최개발 · 수집 서버로 보냄') >= 0);
});
test('소스 구조(DOM 시험 대체): 처리 중 Esc·행 버튼 무시, closeAsk 선택자 이어 붙이기 없음, 확인 상자 닫기, 툴바 CSS 한정, 상세·목록 포커스 보존, 주석', function () {
  assert.ok(/e\.key === 'Escape' && S\.busy\) return/.test(PC_SRC));
  assert.ok(/S\.busy && \(act === 'ask-exclude' \|\| act === 'ask-fail'/.test(PC_SRC));
  assert.ok(PC_SRC.indexOf('[data-key="\' + a.key') < 0 && /function focusAskBtn\(a\)[\s\S]*?getAttribute\('data-key'\) === a\.key/.test(PC_SRC));
  assert.ok(/function closeRunAsk\(\)[\s\S]*?S\.runAsk = false[\s\S]*?box\.remove\(\)/.test(PC_SRC));
  assert.ok(/closeRunAsk\(\); syncSel\(\);[\s\S]*?closeRunAsk\(\); syncSel\(\);/.test(PC_SRC), '체크·전체 체크가 상자를 닫는다');
  assert.ok(/closeRunAsk\(\); st\.busy = 'mark'/.test(PC_SRC) && /closeRunAsk\(\); st\.busy = 'csv'/.test(PC_SRC));
  assert.ok(PC_SRC.indexOf("pc.errorText(r.status, r.code, 'keys')") > 0 && PC_SRC.indexOf("pc.errorText(e && e.status ? e.status : 0, '', 'keys')") > 0);
  assert.ok(HTML.indexOf('.cr-toolbar > button { min-height:26px; }') > 0 && HTML.indexOf('.ad-toolbar > button') < 0);
  assert.ok(/function renderList\(\)[\s\S]*?keepFocus[\s\S]*?scrollTop = keepTop[\s\S]*?preventScroll/.test(PLANS_SRC));
  assert.ok(/function onCollect\(\)[\s\S]*?revealRow\(S\.selRow\.key\)[\s\S]*?\$\('pl-name'\)[\s\S]*?preventScroll/.test(PLANS_SRC));
  assert.ok(rd('nav.js').indexOf('시스템 관리 5항목') > 0 && rd('nav.js').indexOf('시스템 관리 4항목') < 0);
});

test('배지: 401(세션 만료)은 중단하지 않고 다시 부르며, 403 만 중단하고, 사번이 바뀌면 403 중단이 풀린다', async function () {
  const key = require.resolve('../js/plancollect.js');
  const emp = { v: 'E1' };
  const calls = [];
  let code = 401;
  const btn = { querySelector: function () { return null; }, querySelectorAll: function () { return []; }, insertAdjacentHTML: function () {} };
  const save = { self: global.self, document: global.document, fetch: global.fetch };
  global.self = { store: { isServerMode: function () { return true; }, loadSession: function () { return { emp: emp.v }; } } };
  global.document = { querySelector: function () { return btn; } };
  global.fetch = function (url) { calls.push(url); return Promise.resolve({ ok: false, status: code, json: function () { return Promise.resolve({}); } }); };
  delete require.cache[key];
  const p = require('../js/plancollect.js');
  delete require.cache[key];
  try {
    await p.refreshBadge(true);
    assert.strictEqual(calls.length, 1);
    await p.refreshBadge(false);
    assert.strictEqual(calls.length, 1, '401 뒤에도 60초 제한은 걸린다');
    await p.refreshBadge(true);
    assert.strictEqual(calls.length, 2, '401 로 중단하지 않는다 — 같은 사번 재로그인 뒤 force 가 다시 나간다');
    code = 403;
    await p.refreshBadge(true);
    assert.strictEqual(calls.length, 3);
    await p.refreshBadge(true);
    assert.strictEqual(calls.length, 3, '403 은 이 계정으로 더 부르지 않는다');
    emp.v = 'E2';
    await p.refreshBadge(true);
    assert.strictEqual(calls.length, 4, '사번이 바뀌면 다시 부른다');
  } finally {
    ['self', 'document', 'fetch'].forEach(function (k) { if (save[k] === undefined) delete global[k]; else global[k] = save[k]; });
  }
});

test('소스: 401 은 badgeStop 을 켜지 않고 403 만 켠다', function () {
  assert.ok(/r\.status === 403\) \{ badgeStop = true;/.test(PC_SRC));
  assert.ok(!/r\.status === 401 \|\| r\.status === 403\) \{ badgeStop/.test(PC_SRC));
});

// ── NEXT 56: 반입 대기 파일 절 + 목록 내려받기(CSV) 팀장 제한 (design-reviewer 2026-11-23_0914_a4dba517 5·6절) ──
function ibItem(over) {
  return Object.assign({ file_name: 'dobong_20261119_plan.csv', institution_id: 'dobong', name_ko: '서울 도봉구청', file_date: '2026-11-19',
    status_cd: 'READY', doc_count: 2, item_count: 130, warning_count: 4 }, over || {});
}
function ibState(over) { return Object.assign(pc.ibFresh(), { scanned: true }, over || {}); }

test('반입 대기 파일 상태 칩: 12종 글자·클래스, READY 만 체크, 보조 줄, 모르는 코드는 pp-cancel 에 원문(이스케이프)', function () {
  const T = { READY: ['반입 가능', 'wf-badge cr-st gap'], IMPORTED: ['이미 반입됨', 'wf-badge pp-cancel'], OLDER: ['더 새 자료 있음', 'wf-badge pp-cancel'],
    INVALID: ['내용 오류', 'wf-badge cr-st none'], NO_INSTITUTION: ['등록되지 않은 기관', 'wf-badge cr-st none'], BAD_NAME: ['이름 형식 오류', 'wf-badge cr-st none'],
    BAD_DATE: ['날짜 오류', 'wf-badge cr-st none'], TOO_LARGE: ['파일이 너무 큼', 'wf-badge cr-st none'], UNSAFE: ['읽지 않음', 'wf-badge cr-st none'],
    UNREADABLE: ['읽지 못함', 'wf-badge cr-st none'], GONE: ['폴더에 없음', 'wf-badge pp-cancel'], NOT_CHECKED: ['확인 못 함', 'pop-unk'] };
  Object.keys(T).forEach(function (c) {
    const h = pc.ibRowHtml(ibItem({ status_cd: c }), {});
    assert.ok(h.indexOf('<span class="' + T[c][1] + '" data-ib-st="' + c + '">' + T[c][0] + '</span>') >= 0, c);
    assert.strictEqual(h.indexOf('name="ib-sel"') >= 0, c === 'READY', c + ': 체크는 READY 만');
  });
  const ready = pc.ibRowHtml(ibItem(), { checked: true });
  assert.ok(ready.indexOf('name="ib-sel" value="dobong_20261119_plan.csv" aria-label="서울 도봉구청 2026-11-19 파일 선택" checked') >= 0);
  assert.ok(ready.indexOf('<span class="cr-nm">서울 도봉구청</span><span class="cr-sub v">dobong_20261119_plan.csv</span>') >= 0);
  assert.ok(ready.indexOf('<td><span class="v">2026-11-19</span></td>') >= 0 && ready.indexOf('<td class="ib-num">2 · 130</td>') >= 0 && ready.indexOf('<td class="ib-num">4</td>') >= 0);
  assert.ok(pc.ibRowHtml(ibItem({ warning_count: 0 }), {}).indexOf('<td class="ib-num"><span class="ad-note">없음</span></td>') >= 0);
  const imp = pc.ibRowHtml(ibItem({ status_cd: 'IMPORTED', doc_count: undefined, item_count: undefined, warning_count: undefined }), {});
  assert.ok(imp.indexOf('<span class="cr-sub">같은 내용의 파일이 이미 들어가 있습니다</span>') >= 0 && imp.indexOf('<td class="ib-num">—</td>') >= 0 && imp.indexOf('<td>—</td>') < 0);
  assert.ok(pc.ibRowHtml(ibItem({ status_cd: 'NOT_CHECKED' }), {}).indexOf('[폴더 확인]을 다시 누르세요') >= 0);
  const noid = pc.ibRowHtml({ file_name: 'zz_plan.csv', institution_id: null, name_ko: null, file_date: null, status_cd: 'BAD_NAME' }, {});
  assert.ok(noid.indexOf('(알 수 없음)') >= 0 && noid.indexOf('이름은 기관ID_YYYYMMDD_plan.csv 형식이어야 합니다') >= 0);
  const x = pc.ibRowHtml(ibItem({ status_cd: '<b>x' }), {});
  assert.ok(x.indexOf('<b>x') < 0 && x.indexOf('&lt;b&gt;x') >= 0 && x.indexOf('pp-cancel') >= 0);
  assert.ok(pc.ibRowHtml(ibItem({ status_cd: 'constructor' }), {}).indexOf('pp-cancel" data-ib-st="constructor">constructor') >= 0);
  assert.ok(pc.ibRowHtml(ibItem({ file_date: '20261119' }), {}).indexOf('<span class="v">2026-11-19</span>') >= 0);
});

test('INVALID 문구: row n → n행, header → 머리 줄, 80자 자르기, title 에 전체, esc', function () {
  const inv = pc.ibRowHtml(ibItem({ status_cd: 'INVALID', message: 'row 3: 날짜 형식이 올바르지 않습니다' }), {});
  assert.ok(inv.indexOf('<span class="cr-sub" title="3행: 날짜 형식이 올바르지 않습니다">3행: 날짜 형식이 올바르지 않습니다</span>') >= 0);
  assert.strictEqual(pc.invalidFull('header: 필수 열이 없습니다(a).'), '머리 줄: 필수 열이 없습니다(a).');
  assert.strictEqual(pc.invalidFull('이름 형식이 올바르지 않습니다'), '이름 형식이 올바르지 않습니다');   // row·header 가 아니면 그대로
  const long = 'row 12: ' + new Array(101).join('가');
  assert.strictEqual(pc.invalidText(long), pc.invalidFull(long).slice(0, 80) + '…');
  assert.strictEqual(pc.invalidText(long).length, 81);
  assert.ok(pc.ibRowHtml(ibItem({ status_cd: 'INVALID', message: long }), {}).indexOf('title="' + pc.invalidFull(long) + '"') >= 0);
  const evil = pc.ibRowHtml(ibItem({ status_cd: 'INVALID', message: 'row 1: <script>' }), {});
  assert.ok(evil.indexOf('<script>') < 0 && evil.indexOf('1행: &lt;script&gt;') >= 0);
  assert.strictEqual(pc.invalidText(null), '');
  assert.ok(pc.ibRowHtml(ibItem({ status_cd: 'INVALID' }), {}).indexOf('title=') < 0, 'message 가 없으면 빈 보조 줄을 그리지 않는다');
});

test('반입 결과 칩·문구: result_cd → 칩, 체크 사라짐, 결과 요약(모두 성공/섞임/모두 실패), 확인 결과 문구', function () {
  const T = { IMPORTED: ['반입함', 'wf-badge cr-st ok'], ALREADY: ['이미 반입됨', 'wf-badge pp-cancel'], OLDER: ['더 새 자료 있음', 'wf-badge pp-cancel'],
    INVALID: ['내용 오류', 'wf-badge cr-st none'], NOT_FOUND: ['등록되지 않은 기관', 'wf-badge cr-st none'], TOO_LARGE: ['파일이 너무 큼', 'wf-badge cr-st none'],
    UNSAFE: ['읽지 않음', 'wf-badge cr-st none'], UNREADABLE: ['읽지 못함', 'wf-badge cr-st none'], GONE: ['폴더에 없음', 'wf-badge pp-cancel'],
    CONFLICT: ['다른 반입과 겹침', 'wf-badge cr-st none'], ERROR: ['처리하지 못함', 'wf-badge cr-st none'] };
  Object.keys(T).forEach(function (c) {
    const h = pc.ibRowHtml(ibItem(), { result: { file_name: 'dobong_20261119_plan.csv', result_cd: c } });
    assert.ok(h.indexOf('<span class="' + T[c][1] + '" data-ib-st="' + c + '">' + T[c][0] + '</span>') >= 0, c);
    assert.ok(h.indexOf('name="ib-sel"') < 0 && h.indexOf('반입 가능') < 0, c + ': 결과가 나오면 체크·원래 칩이 없다');
  });
  assert.ok(pc.ibRowHtml(ibItem(), { result: { result_cd: 'CONFLICT' } }).indexOf('잠시 뒤 다시 확인하세요') >= 0);
  assert.ok(pc.ibRowHtml(ibItem(), { result: { result_cd: 'INVALID', message: 'row 2: 값이 비었습니다' } }).indexOf('2행: 값이 비었습니다') >= 0);
  const I = { result_cd: 'IMPORTED' }, A = { result_cd: 'ALREADY' };
  assert.deepStrictEqual(pc.importFlash(3, [I, I, I]), { fail: false, text: '파일 3개를 반입했습니다. 수집 요청 목록을 다시 불러왔습니다.' });
  assert.deepStrictEqual(pc.importFlash(3, [I, A, { result_cd: 'INVALID' }]), { fail: false, text: '3개 중 1개를 반입했습니다. 이미 반입됨 1개 · 반입 못 함 1개 — 표의 결과를 확인하세요.' });
  assert.strictEqual(pc.importFlash(2, [I, { result_cd: 'ERROR' }]).text, '2개 중 1개를 반입했습니다. 반입 못 함 1개 — 표의 결과를 확인하세요.');
  assert.deepStrictEqual(pc.importFlash(2, [A, { result_cd: 'OLDER' }]), { fail: true, text: '반입하지 못했습니다 — 표의 결과를 확인하세요.' });
  assert.deepStrictEqual(pc.importFlash(2, [A, A]), { fail: false, text: '고른 파일은 모두 이미 반입되어 있습니다.' }, 'ALREADY 만이면 실패(빨강)가 아니라 정보');
  assert.deepStrictEqual(pc.importFlash(1, [A]), { fail: false, text: '고른 파일은 모두 이미 반입되어 있습니다.' });
  assert.strictEqual(pc.importFlash(3, [A, A, { result_cd: 'INVALID' }]).fail, true, '오류가 하나라도 섞이면 그대로 실패');
  assert.strictEqual(pc.importFlash(2, [I, A]).fail, false);
  assert.strictEqual(pc.importFlash(0, []).fail, true, '결과가 비면 기존대로');
  assert.strictEqual(pc.scanFlash(7, 3), '파일 7개를 확인했습니다 — 반입 가능 3개.');
  assert.strictEqual(pc.scanFlash(7, 0), '파일 7개를 확인했습니다 — 반입할 파일이 없습니다.');
  assert.strictEqual(pc.scanFlash(0, 0), '');
  assert.strictEqual(pc.ignoredText(2), '이름 형식이 맞지 않는 파일 2개는 건너뛰었습니다(이름: 기관ID_YYYYMMDD_plan.csv).');
  assert.ok(!/\d/.test(pc.TRUNC_TEXT) && pc.TRUNC_TEXT.indexOf('최근 날짜부터 일부만 확인했습니다') >= 0, 'truncated 문구에는 숫자가 없다');
  const c = pc.ibCounts(ibState({ items: [ibItem(), ibItem({ file_name: 'b_20261119_plan.csv' }), ibItem({ file_name: 'c_20261119_plan.csv', status_cd: 'IMPORTED' }), ibItem({ file_name: 'd_20261119_plan.csv', status_cd: 'OLDER' })],
    results: { 'b_20261119_plan.csv': I } }));
  assert.deepStrictEqual(c, { ready: 1, done: 2, bad: 1 });
  assert.strictEqual(pc.ibCountHtml(ibState({ items: [ibItem()] })), '반입 가능 <b>1</b> · 반입됨 <b>0</b> · 반입 못 함 <b>0</b>');
});

test('반입 선택·상한: READY 만 체크, 선택 수가 단추 글자에, 51개면 잠김+안내, 전체 선택 상태, 서버 max_import 우선', function () {
  const items = [ibItem(), ibItem({ file_name: 'b_20261119_plan.csv', status_cd: 'IMPORTED' }), ibItem({ file_name: 'c_20261118_plan.csv' })];
  const ib = ibState({ items: items, sel: ['dobong_20261119_plan.csv', 'b_20261119_plan.csv', 'zz'] });
  assert.deepStrictEqual(pc.ibReady(ib), ['dobong_20261119_plan.csv', 'c_20261118_plan.csv']);
  assert.deepStrictEqual(pc.ibPicked(ib).map(function (r) { return r.file_name; }), ['dobong_20261119_plan.csv'], 'READY 가 아니거나 없는 이름은 세지 않는다');
  const b = pc.ibBtnState(ib);
  assert.ok(b.go.html === '선택한 <span class="v">1</span>개 반입' && !b.go.disabled && b.scan.html === '폴더 다시 확인');
  assert.strictEqual(pc.ibBtnState(ibState({ items: items })).go.disabled, true, '0개면 잠김');
  const many = [];
  for (let i = 0; i < 51; i += 1) many.push(ibItem({ file_name: 'a' + i + '_20261119_plan.csv' }));
  const names = many.map(function (x) { return x.file_name; });
  const over = pc.ibBtnState(ibState({ items: many, sel: names }));
  assert.ok(over.go.disabled && over.hint === '한 번에 50개까지 반입할 수 있습니다. 선택을 줄이세요.');
  const ok50 = pc.ibBtnState(ibState({ items: many, sel: names.slice(0, 50) }));
  assert.ok(!ok50.go.disabled && ok50.hint === '');
  assert.strictEqual(pc.ibAllOn(ibState({ items: many, sel: names.slice(0, 50) })), true, '준비된 것이 50개를 넘으면 앞 50개를 고른 상태가 전체 선택');
  assert.strictEqual(pc.ibAllOn(ibState({ items: many, sel: names.slice(0, 5) })), false);
  assert.strictEqual(pc.ibAllOn(ibState({ items: [ibItem({ status_cd: 'IMPORTED' })], sel: [] })), false);
  assert.strictEqual(pc.ibCapText(60, 50), '반입 가능 60개 중 앞 50개를 골랐습니다(한 번에 50개까지).');
  assert.strictEqual(pc.ibBtnState(ibState({ items: many, sel: names.slice(0, 31), maxImport: 30 })).go.disabled, true, '서버 max_import 가 우선');
  assert.strictEqual(pc.ibBtnState(ibState({ items: many, sel: names.slice(0, 1), capNote: '메모' })).hint, '메모');
  const t = pc.ibTableHtml(ib);
  assert.strictEqual((t.match(/name="ib-sel"/g) || []).length, 2);
  assert.ok(t.indexOf('id="ib-all" aria-label="반입 가능 파일 모두 선택"') >= 0 && t.indexOf('id="ib-table" tabindex="-1"') >= 0);
  assert.ok(t.indexOf('class="ib-scroll" id="ib-scroll" tabindex="0" role="region" aria-label="반입 대기 파일 목록"') >= 0 && t.indexOf('aria-busy') < 0);
  assert.strictEqual((t.match(/<th scope="col"/g) || []).length, 6);
  const none = pc.ibTableHtml(ibState({ items: [ibItem({ status_cd: 'IMPORTED' })] }));
  assert.ok(none.indexOf('id="ib-all"') < 0 && none.indexOf('<span class="sr-only">선택</span>') >= 0);
  assert.ok(pc.ibTableHtml(ibState({ items: items, busy: 'scan' })).indexOf('aria-busy') < 0, 'aria-busy 는 표가 아니라 절(#ib-sec)에');
  const withRes = pc.ibTableHtml(ibState({ items: items, results: { 'dobong_20261119_plan.csv': { result_cd: 'IMPORTED' } } }));
  assert.strictEqual((withRes.match(/name="ib-sel"/g) || []).length, 1, '반입한 행은 체크가 사라진다');
  assert.ok(/ready\.slice\(0, max\)/.test(PC_SRC) && /pc\.ibCapText\(ready\.length, max\)/.test(PC_SRC), '전체 선택은 앞 max 개만(소스 구조)');
});

test('반입 절 그리기: 접힘(안내+[폴더 확인])·확인 중·빈 폴더·건너뜀·truncated·BAD_CONFIG 알림, 요청 목록 위에 놓인다', function () {
  const c = pc.ibHtml(pc.ibFresh());
  assert.ok(c.indexOf('<section class="ib-sec" id="ib-sec" aria-labelledby="ib-t"><h3 id="ib-t">반입 대기 파일</h3>') >= 0);
  assert.ok(c.indexOf('id="ib-scan" data-cr="ib-scan">폴더 확인</button>') >= 0 && c.indexOf('id="ib-go"') < 0 && c.indexOf('id="ib-table"') < 0);
  assert.ok(c.indexOf('id="ib-hint">반입 폴더에 들어온 사업계획 파일을 확인합니다.</span>') >= 0);
  const busy = pc.ibHtml(Object.assign(pc.ibFresh(), { busy: 'scan' }));
  assert.ok(busy.indexOf('id="ib-scan" data-cr="ib-scan" disabled>확인하는 중…</button>') >= 0 && busy.indexOf('파일이 많으면 20초까지 걸립니다.') >= 0);
  assert.ok(busy.indexOf('<section class="ib-sec" id="ib-sec" aria-labelledby="ib-t" aria-busy="true"><h3') >= 0, '첫 확인 중에는 표가 없으니 aria-busy 는 절에');
  assert.ok(c.indexOf('aria-busy') < 0 && pc.ibHtml(ibState({ items: [ibItem()] })).indexOf('aria-busy') < 0, '확인 중이 아니면 없다');
  assert.ok(pc.ibHtml(ibState({ items: [ibItem()], busy: 'scan' })).indexOf('<section class="ib-sec" id="ib-sec" aria-labelledby="ib-t" aria-busy="true">') >= 0);
  const empty = pc.ibHtml(ibState());
  assert.ok(empty.indexOf('반입 폴더에 사업계획 파일이 없습니다. 수집한 파일(기관ID_YYYYMMDD_plan.csv)이 폴더에 들어오면 여기에 보입니다.') >= 0 && empty.indexOf('id="ib-table"') < 0);
  assert.ok(empty.indexOf('id="ib-go" data-cr="ib-ask" disabled>선택한 <span class="v">0</span>개 반입</button>') >= 0 && empty.indexOf('id="ib-count"') >= 0);
  const notes = pc.ibHtml(ibState({ items: [ibItem()], ignored: 2, truncated: true }));
  assert.ok(notes.indexOf('이름 형식이 맞지 않는 파일 2개는 건너뛰었습니다') >= 0 && notes.indexOf('파일이 많아 최근 날짜부터 일부만 확인했습니다. 반입한 뒤 [폴더 확인]을 다시 누르세요.') >= 0);
  assert.ok(pc.ibHtml(ibState({ items: [ibItem()] })).indexOf('이름 형식이 맞지 않는') < 0 && pc.ibHtml(ibState({ items: [ibItem()] })).indexOf('일부만 확인') < 0);
  const bad = pc.ibHtml(Object.assign(pc.ibFresh(), { err: pc.inboxErrorText(503, 'PLAN_INBOX_BAD_CONFIG', 'scan') }));
  assert.ok(bad.indexOf('role="alert"') >= 0 && bad.indexOf('반입 폴더를 열 수 없습니다(503). 서버의 반입 폴더 설정과 폴더 권한을 확인하세요.') >= 0);
  const on = pc.screenHtml(screen({ inboxOn: true, ib: pc.ibFresh() }));
  assert.ok(on.indexOf('id="ib-sec"') >= 0 && on.indexOf('<h3 class="cr-h">기관별 수집 요청</h3>') >= 0);
  assert.ok(idx(on, 'id="ib-sec"') < idx(on, '<h3 class="cr-h">') && idx(on, '<h3 class="cr-h">') < idx(on, 'class="ad-toolbar cr-toolbar"'));
  const off = pc.screenHtml(screen({ inboxOn: false, ib: pc.ibFresh() }));
  assert.ok(off.indexOf('ib-sec') < 0 && off.indexOf('cr-h') < 0 && off.indexOf('기관별 수집 요청') < 0, '503 OFF·inbox_enabled=false 면 절을 그리지 않는다(안내도 없음)');
  assert.ok(pc.screenHtml(screen()).indexOf('ib-sec') < 0, 'inbox_enabled 가 없는 옛 응답에도 절이 없다');
});

test('반입 오류 문구: BUSY·OFF·BAD_CONFIG·BAD_FILES·반입 중 멈춤, 서버 원문 없음', function () {
  assert.strictEqual(pc.inboxErrorText(409, 'BUSY', 'scan'), '다른 폴더 확인이나 반입이 진행 중입니다. 잠시 뒤 다시 누르세요.');
  assert.strictEqual(pc.inboxErrorText(409, 'BUSY', 'import'), '다른 폴더 확인이나 반입이 진행 중입니다. 잠시 뒤 다시 누르세요.');
  assert.ok(pc.inboxErrorText(409, 'BUSY', 'scan').indexOf('다른 사람') < 0, '"다른 사람"이라고 쓰지 않는다');
  assert.strictEqual(pc.inboxErrorText(503, 'PLAN_INBOX_OFF', 'scan'), '반입 폴더가 설정되지 않아 폴더 확인을 닫았습니다.');
  assert.strictEqual(pc.inboxErrorText(503, 'PLAN_INBOX_BAD_CONFIG', 'import'), '반입 폴더를 열 수 없습니다(503). 서버의 반입 폴더 설정과 폴더 권한을 확인하세요.');
  assert.strictEqual(pc.inboxErrorText(400, 'BAD_FILES', 'import'), '고른 파일을 확인하세요(400). [폴더 확인]을 다시 누른 뒤 고르세요.');
  const stop = '반입 중 멈췄습니다. 앞에서 반입한 파일은 들어갔을 수 있습니다. [폴더 확인]으로 다시 확인하세요.';
  assert.strictEqual(pc.inboxErrorText(500, '', 'import'), stop);
  assert.strictEqual(pc.inboxErrorText(0, '', 'import'), stop);
  assert.ok(pc.inboxErrorText(0, '', 'scan').indexOf('연결 실패') >= 0 && pc.inboxErrorText(500, '', 'scan').indexOf('(500)') >= 0);
  assert.ok(pc.inboxErrorText(403, '', 'scan').indexOf('(403)') >= 0 && pc.inboxErrorText(401, '', 'scan').indexOf('로그인') >= 0);
  assert.ok(pc.inboxErrorText(503, '', 'import').indexOf('(503)') >= 0 && pc.inboxErrorText(503, '', 'import').indexOf('멈췄습니다') < 0);
  assert.ok(/function ibScanFail[\s\S]*?PLAN_INBOX_OFF[\s\S]*?inboxOn = false/.test(PC_SRC) && /PLAN_INBOX_BAD_CONFIG[\s\S]*?ib\.err = msg/.test(PC_SRC));
  assert.ok(/inboxOn = rs\.some\(function \(r\) \{ return !!\(r\.data && r\.data\.inbox_enabled === true\)/.test(PC_SRC));
});

test('목록 내려받기(CSV): can_export=false 면 비활성(aria-disabled) + 이유 글자, pp-next-btn 없음, 허용·옛 응답은 기존 모양', function () {
  const lock = pc.toolbarHtml({ view: 'open', items: [adm()], sel: [K1], agent: false, busy: '', canExport: false });
  assert.ok(lock.indexOf('<button type="button" id="cr-csv" data-cr="csv" aria-disabled="true" aria-describedby="cr-csv-why">선택한 <span class="v">1</span>곳 목록 내려받기(CSV)</button>') >= 0);
  assert.ok(lock.indexOf('<span class="db-why" id="cr-csv-why">목록 내려받기는 개발부서 팀장만 할 수 있습니다.</span>') >= 0);
  assert.ok(lock.indexOf('pp-next-btn') < 0 && lock.indexOf('id="cr-csv" data-cr="csv" disabled') < 0, 'disabled 가 아니라 aria-disabled(Tab 으로 가서 이유가 읽힌다)');
  assert.ok(lock.indexOf('id="cr-mark"') >= 0, '수집 중으로 표시는 그대로');
  assert.ok(idx(lock, 'id="cr-csv"') < idx(lock, 'id="cr-mark"') && idx(lock, 'id="cr-mark"') < idx(lock, 'id="cr-csv-why"'), '이유 글자는 [수집 중으로 표시] 뒤(좁은 폭에서 줄이 바뀌는 쪽이 글자)');
  assert.ok(lock.indexOf('aria-describedby="cr-csv-why"') >= 0, 'describedby 는 그대로');
  assert.ok(idx(lock, 'id="cr-csv-why"') < idx(lock, 'id="cr-limit"'), '안내·개수 띠보다는 앞');
  assert.strictEqual(PC_SRC.slice(PC_SRC.indexOf('pc.toolbarHtml'), PC_SRC.indexOf('pc.runAskHtml')).indexOf('pc.CSV_LEAD_ONLY = '), -1);
  const b = pc.btnState({ items: [adm()], sel: [K1], agent: false, busy: '', canExport: false });
  assert.ok(b.csv.locked === true && b.csv.disabled === false);
  const ok = pc.toolbarHtml({ view: 'open', items: [adm()], sel: [K1], agent: false, busy: '', canExport: true });
  assert.ok(ok.indexOf('id="cr-csv" class="pp-next-btn" data-cr="csv">') >= 0 && ok.indexOf('aria-disabled') < 0 && ok.indexOf('cr-csv-why') < 0);
  const old = pc.toolbarHtml({ view: 'open', items: [adm()], sel: [K1], agent: false, busy: '' });   // can_export 키가 없는 옛 응답 → 막지 않는다
  assert.ok(old.indexOf('class="pp-next-btn" data-cr="csv"') >= 0 && old.indexOf('aria-disabled') < 0);
  assert.strictEqual(pc.btnState({ items: [adm()], sel: [], agent: false, busy: '', canExport: true }).csv.disabled, true, '허용이어도 선택이 없으면 disabled');
  assert.ok(/canExport = !rs\.some\(function \(r\) \{ return !!\(r\.data && r\.data\.can_export === false\)/.test(PC_SRC));
  assert.ok(PC_SRC.indexOf("b.getAttribute('aria-disabled') === 'true'") > 0, '클릭은 무시');
  assert.ok(PC_SRC.indexOf('S.canExport === false) return') > 0, 'doCsv 도 서버를 부르지 않는다');
});

test('LEAD_ONLY: 403 detail.code 를 일반 403(개발부서만 씁니다)보다 먼저 판정, 응답을 받으면 단추를 잠근 모양으로 다시 그린다', function () {
  const lead = '목록 내려받기는 개발부서 팀장만 할 수 있습니다. 팀장에게 요청하세요.';
  assert.strictEqual(pc.errorText(403, 'LEAD_ONLY'), lead);
  assert.strictEqual(pc.errorText(403, 'LEAD_ONLY', 'keys'), lead);
  assert.ok(pc.errorText(403, '').indexOf('시스템 관리 권한이 있는 개발부서만 씁니다(403)') >= 0, '코드가 없는 403 은 기존 문구');
  assert.ok(pc.errorText(403, 'OTHER').indexOf('(403)') >= 0);
  assert.ok(PC_SRC.indexOf("s === 403 && c === 'LEAD_ONLY'") < PC_SRC.indexOf("if (s === 403) return '이 화면은"), 'LEAD_ONLY 분기가 먼저');
  assert.ok(/e\.code = errCode\(j\)/.test(PC_SRC) && /e\.code === 'LEAD_ONLY'[\s\S]*?st\.canExport = false; paint\(\); focusSel\('#cr-csv'\)/.test(PC_SRC));
});

test('반입 확인 창: 공통 dlg 의 alertdialog, [취소][n개 반입] 오른쪽 아래, 둘째 문장, 경고 줄은 경고 있는 파일이 있을 때만, esc', function () {
  const h = pc.ibDialogHtml([ibItem(), ibItem({ file_name: 'x_20261118_plan.csv', name_ko: '<b>x</b>', warning_count: 0 })]);
  assert.ok(h.indexOf('<div id="ib-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="ib-dlg-t" aria-describedby="ib-dlg-p">') >= 0);
  assert.ok(h.indexOf('<h2 class="dlg-t" id="ib-dlg-t" tabindex="-1">사업계획 파일 <span class="v">2</span>개 반입</h2>') >= 0);
  assert.ok(h.indexOf('고른 파일을 기관 사업계획에 반입합니다. 이 기관들의 열린 수집 요청은 \'반영됨\'이 되고 요청자에게 쪽지가 갑니다.') >= 0);
  assert.ok(h.indexOf('<footer class="dlg-foot"><button type="button" id="ib-dlg-cancel">취소</button><button type="button" id="ib-dlg-ok" class="dlg-go">2개 반입</button></footer>') >= 0);
  assert.ok(h.indexOf('id="ib-dlg-busy" hidden>창을 닫아도 반입은 계속되고 결과는 화면 위 띠에 나옵니다.') >= 0 && h.indexOf('id="ib-dlg-err" role="alert"') >= 0);
  assert.ok(h.indexOf('<th scope="col">기관</th><th scope="col">파일 날짜</th><th scope="col">사업</th><th scope="col">경고</th>') >= 0 && h.indexOf('class="pl-dlg-scroll" tabindex="0" role="region" aria-label="반입할 파일"') >= 0);
  assert.ok(h.indexOf('<b>x') < 0 && h.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0);
  assert.ok(h.indexOf('경고가 있는 파일 <span class="v">1</span>개도 함께 반입됩니다.') >= 0);
  assert.ok(pc.ibDialogHtml([ibItem({ warning_count: 0 })]).indexOf('경고가 있는 파일') < 0);
  const zero = pc.ibDialogHtml([ibItem({ warning_count: 0 })]);
  assert.ok(zero.indexOf('<td>없음</td></tr>') >= 0 && zero.indexOf('<td class="v">0</td></tr>') < 0, '경고 0 은 파일 표와 같이 없음');
  assert.ok(h.indexOf('<td class="v">130</td><td class="v">4</td></tr>') >= 0 && h.indexOf('<td class="v">0</td>') < 0, '경고가 있으면 숫자');
  assert.ok(/root\.dlg\.open\(ov, \{ onClose[\s\S]*?restoreFallback/.test(PC_SRC) && PC_SRC.indexOf("'/plan-collect/inbox/import', { file_names:") > 0 && PC_SRC.indexOf("'/plan-collect/inbox')") > 0);
  assert.ok(/function onIbDlgClick[\s\S]*?ib-dlg-cancel[\s\S]*?requestClose/.test(PC_SRC), '보내는 중에도 닫는다(plans.batchDialog 선례)');
});

test('반입 창 닫힘·잠금 보완(qa P3-1·P3-5·P3-6): 복귀 대상은 잠긴 단추를 피함, BAD_FILES 뒤 [n개 반입] 잠금, 응답 뒤 커서 복구, detach 제거', function () {
  const go = { disabled: true }, scan = { disabled: true }, tbl = { tbl: 1 };
  assert.strictEqual(pc.ibRestoreTarget(go, scan, tbl), tbl, '반입 중: 두 단추가 잠겼으면 파일 표로');
  assert.strictEqual(pc.ibRestoreTarget({ disabled: false }, scan, tbl).disabled, false, '[n개 반입]이 열려 있으면 그곳');
  assert.strictEqual(pc.ibRestoreTarget(go, { disabled: false, id: 's' }, tbl).id, 's', '[폴더 확인]이 열려 있으면 그곳');
  assert.strictEqual(pc.ibRestoreTarget(null, { disabled: false, id: 's' }, tbl).id, 's', '[n개 반입]이 없는 절(확인 전)');
  assert.strictEqual(pc.ibRestoreTarget(null, null, null), null);
  assert.strictEqual(pc.ibOkLocked({ busy: false, locked: false }), false);
  assert.strictEqual(pc.ibOkLocked({ busy: true, locked: false }), true);
  assert.strictEqual(pc.ibOkLocked({ busy: false, locked: true }), true, '400 BAD_FILES 뒤 다시 잠근다');
  assert.strictEqual(pc.ibOkLocked(null), false);
  const imp = PC_SRC.slice(PC_SRC.indexOf('function ibImport'), PC_SRC.indexOf('function onClick'));
  assert.ok(/d\.busy \|\| d\.gone \|\| d\.locked \|\| ib\.busy/.test(imp), '잠긴 창은 Enter·재클릭으로도 다시 보내지 않는다');
  assert.ok(/r\.status === 400 && r\.code === 'BAD_FILES'\) d\.locked = true; paintIbDlg\(d\)/.test(imp), '창이 열려 있을 때만 잠그고 그린다');
  assert.ok(/load\(function \(\) \{ if \(d\.gone && !focusLost\(\)\) return; if \(!focusSel\('#ib-table'\)\) focusSel\('#ib-scan'\); \}\)/.test(imp), '창을 닫았어도 응답 뒤 커서를 잃었으면 파일 표(없으면 #ib-scan)로');
  assert.ok(imp.indexOf('load(d.gone ? undefined') < 0);
  assert.ok(/setDisabled\(ok, pc\.ibOkLocked\(d\)\)/.test(PC_SRC));
  assert.ok(/restoreFallback: function \(\) \{ return pc\.ibRestoreTarget\(qs\('#ib-go'\), qs\('#ib-scan'\), qs\('#ib-table'\)\); \}/.test(PC_SRC));
  assert.ok(PC_SRC.indexOf('detach') < 0, 'd.detach 는 쓰는 곳이 없어 지웠다');
  assert.ok(/function ibSync[\s\S]*?qs\('#ib-sec'\)[\s\S]*?aria-busy/.test(PC_SRC) && PC_SRC.indexOf("qs('#ib-scroll')") < 0, 'ibSync 는 aria-busy 를 절에 맞춘다');
});

test('admin 수집 요청 머리 안내: 팀원도 맞는 설명형 문장(design P2-1)', function () {
  const want = "영업부서가 요청한 기관을 기관 단위로 묶어 보여 줍니다. 개발부서 팀장이 목록을 내려받아 수집하고, 보낸 기관은 '수집 중'으로 표시합니다. 수집한 파일을 반입하면 그 기관의 요청은 '반영됨'이 됩니다.";
  assert.ok(ADMIN_SRC.indexOf('collect: "' + want + '"') > 0);
  assert.ok(ADMIN_SRC.indexOf("'수집 중'으로 표시하세요") < 0, '팀원에게 할 수 없는 일을 시키는 명령형이 남지 않았다');
});

test('index.html 반입 CSS: 수집 요청 블록 안, 토큰만, .ad-toolbar > button 금지 규칙 유지, 팀원 CSV 흐림', function () {
  const a = HTML.indexOf('/* 사업계획 수집 요청 시작'), b = HTML.indexOf('/* 사업계획 수집 요청 끝 */');
  const css = HTML.slice(a, b);
  ['.ib-sec {', '.ib-scroll {', '.ib-scroll:focus-visible', '.ib-toolbar > button { min-height:26px; }', '.ib-table td.ib-num', '.ib-table td.ib-inst', '#cr-csv[aria-disabled="true"]', '#ib-dlg .v'].forEach(function (s) { assert.ok(css.indexOf(s) >= 0, s); });
  assert.ok(css.indexOf('.ad-toolbar > button') < 0);
  assert.ok(css.indexOf('.ib-table th.ib-num') >= 0, '숫자 열 머리도 오른쪽 정렬');
  assert.ok(css.indexOf('#cr-csv[aria-disabled="true"]:focus-visible { opacity:1; }') >= 0, '흐린 CSV 단추도 포커스 링은 5.7:1');
  assert.ok(/#pl-foot #pl-bat\[aria-disabled="true"\]:focus-visible \{ opacity:1; \}/.test(HTML), '#pl-bat 도 같은 처리(기관 사업계획 블록)');
  assert.ok(HTML.indexOf('#pl-foot #pl-bat[aria-disabled="true"]:focus-visible') > HTML.indexOf('#pl-foot #pl-bat[aria-disabled="true"] {'), '꺼진 규칙 뒤에 놓여 덮어쓴다');
});
