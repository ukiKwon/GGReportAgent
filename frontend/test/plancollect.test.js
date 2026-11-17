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
  assert.ok(mine.indexOf('data-st="REQUESTED">요청됨</span>') >= 0 && mine.indexOf('나 포함 <span class="v">3</span>명') >= 0);
  assert.ok(mine.indexOf('첫 요청 <span class="v">2026-11-17</span>') >= 0);
  assert.ok(mine.indexOf('id="pl-req-cancel">내 요청 취소') >= 0 && mine.indexOf('pl-req-go') < 0);
  const other = plans.reqLineHtml(req({ requested_by_me: false, requester_count: 2 }), { can: true });
  assert.ok(other.indexOf('<span class="v">2</span>명 요청') >= 0 && other.indexOf('id="pl-req-go"') >= 0 && other.indexOf('pl-req-cancel') < 0);
  const run = plans.reqLineHtml(req({ status_cd: 'RUNNING', run_at: '2026-11-18T10:00:00+09:00' }), { can: true });
  assert.ok(run.indexOf('수집 중(반입 대기)') >= 0 && run.indexOf('내보냄 <span class="v">2026-11-18</span>') >= 0);
  assert.ok(run.indexOf('<button') < 0, '수집 중 + 나 포함: 취소도 요청도 없다');
  const runOther = plans.reqLineHtml(req({ status_cd: 'RUNNING', requested_by_me: false, run_at: '2026-11-18T10:00:00+09:00' }), { can: true });
  assert.ok(runOther.indexOf('id="pl-req-go"') >= 0);
  const designer = plans.reqLineHtml(req({ requested_by_me: false }), { can: false });
  assert.ok(designer.indexOf('data-st="REQUESTED"') >= 0 && designer.indexOf('<button') < 0);
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
  assert.ok(idx(h, 'id="pl-name"') < idx(h, 'class="pl-req"') && idx(h, 'class="pl-req"') < idx(h, 'class="db-why pl-imp"'));
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
  const TODAY = new Date(2026, 10, 16);
  const m = dash.model([{ name: '가구', region: '11', type: '지자체', contractEnd: logic.localDateStr(new Date(2026, 10, 26)), confirmed: false, institutionId: 'ga' }], TODAY);
  const r = plans.listRows(m, '6', {}, null)[0];
  const a = plans.rowHtml(r, { loaded: false, req: req({ institution_id: 'ga' }) });
  assert.ok(a.indexOf('data-st="REQUESTED">요청됨</span>') >= 0 && a.indexOf('<button') < 0);
  assert.ok(plans.rowHtml(r, { req: req({ status_cd: 'RUNNING' }) }).indexOf('data-st="RUNNING"') >= 0);
  assert.ok(plans.rowHtml(r, { req: req({ status_cd: 'APPLIED' }) }).indexOf('cr-st') < 0);
  assert.ok(plans.rowHtml(r, { req: null }).indexOf('cr-st') < 0);
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
    assert.ok(queued.indexOf('pop-unk">자료 없음') >= 0 && queued.indexOf('data-st="REQUESTED"') >= 0);
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

// ── 소스·연결 규칙 ───────────────────────────────────────────────────
test('소스 규칙: confirm() 없음, 외부 주소 없음, 새 hex 없음, 서버 원문(message·detail)을 화면에 넣지 않음', function () {
  [PC_SRC, PLANS_SRC].forEach(function (src) {
    assert.ok(!/\bconfirm\(/.test(src));
    assert.ok(!/https?:\/\//.test(src));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src));
    assert.ok(!/innerHTML\s*=\s*[^;]*\b(?:e|r)\.(message|detail|data\.message)/.test(src));
  });
  assert.ok(!/\.message\b/.test(PC_SRC), '서버 message 는 읽지 않는다');
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
  assert.ok(f.indexOf('data-st="FAILED">실패</span>') >= 0 && f.indexOf('<span class="v">2026-11-10</span> · 사유: 공고 페이지 없음') >= 0);
  assert.ok(f.indexOf('id="pl-req-go">수집 요청</button>') >= 0 && f.indexOf('개발부서가 수집하고') < 0 && f.indexOf('새 계획이 나왔으면') < 0);
  const ex = plans.reqLineHtml(null, { can: true, closed: Object.assign({}, CLOSED, { status_cd: 'EXCLUDED', close_reason: '<b>x</b>' }) });
  assert.ok(ex.indexOf('data-st="EXCLUDED">제외됨</span>') >= 0 && ex.indexOf('사유: &lt;b&gt;x&lt;/b&gt;') >= 0 && ex.indexOf('<b>x') < 0);
  const nr = plans.reqLineHtml(null, { can: true, closed: Object.assign({}, CLOSED, { close_reason: null }) });
  assert.ok(nr.indexOf('사유') < 0 && nr.indexOf('2026-11-10') >= 0);
  const des = plans.reqLineHtml(null, { can: false, closed: Object.assign({}, CLOSED, { close_reason: null }) });
  assert.strictEqual(des, '');   // 디자이너: 열린 요청이 없으면 줄 없음(규격 6-2)
  const withOpen = plans.reqLineHtml(req(), { can: true, closed: CLOSED });
  assert.ok(withOpen.indexOf('data-st="REQUESTED"') >= 0 && withOpen.indexOf('data-st="FAILED"') < 0);
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
    assert.ok(h.indexOf('data-st="FAILED"') >= 0 && h.indexOf('사유: 공고 페이지 없음') >= 0 && idx(h, 'class="pl-req"') < idx(h, 'class="db-why pl-imp"'));
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
