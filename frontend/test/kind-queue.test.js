// 다가오는 기관별 공고현황·선정 결과 대기 소묶음·상세 ①②절(2026-11-23). 규격 design-reviewer 2026-11-23_1730_a8ad2d6b.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const bc = require('../js/bankcontract.js');
const nr = require('../js/noticerec.js');

const ROOT = path.join(__dirname, '..');
const TODAY = new Date('2026-11-11T00:00:00');
function plus(d) { return logic.localDateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + d)); }
// 추정 날짜(확정 아님)라 공고 진행 중에 들지 않는다
const est = (name, days, extra) => Object.assign({ name: name, region: '11', type: '지자체', contractEnd: plus(days), confirmed: false }, extra || {});
const nrec = (name, since, extra) => Object.assign({ name: name, region: '11', type: '지자체', contractEnd: plus(-since), confirmed: true }, extra || {});
const rowOf = (q, k) => q.rows.filter(r => r.kind === k)[0];

test('kindQueueModel: 구간 경계 0~30/31~91/92~182, 183일 넘는 곳·날짜 미상은 넣지 않고 교육청은 공공기관 줄', () => {
  const list = [0, 30, 31, 91, 92, 182, 183, 365].map(d => est('지' + d, d));
  list.push(est('교육청A', 10, { type: '교육청', region: '26' }), est('법원A', 50, { type: '법원' }), { name: '미상구청', region: '11', type: '지자체' });
  const q = dash.kindQueueModel(dash.model(list, TODAY), { today: TODAY, snap: null });
  assert.deepStrictEqual(dash.KQ_KINDS, ['지자체', '공공기관', '법원', '대학', '병원']);
  assert.deepStrictEqual(q.rows.map(r => r.kind), dash.KQ_KINDS);                       // 줄 5개 고정 순서
  const g = rowOf(q, '지자체');
  assert.deepStrictEqual([g.m1, g.m3, g.m6, g.x, g.n], [2, 2, 2, 0, 6]);
  assert.deepStrictEqual([rowOf(q, '공공기관').m1, rowOf(q, '공공기관').n], [1, 1]);   // 교육청 포함
  assert.deepStrictEqual([rowOf(q, '법원').m3, rowOf(q, '대학').n, rowOf(q, '병원').n], [1, 0, 0]);
  assert.strictEqual(q.max, 6);
  assert.strictEqual(dash.kqSeg(182), 'm6'); assert.strictEqual(dash.kqSeg(183), ''); assert.strictEqual(dash.kqSeg(-1), '');
});

test('kindQueueModel: 공고 확인 어려움 = 경과 중 공고 상태 기록이 처리됨이 아닌 것(미처리·지연), 공고 난 기관은 막대에 없고 noticeN만', () => {
  const list = [est('경과1', -3), est('경과2', -4, { institutionId: 'I2' }), est('경과3', -5, { institutionId: 'I3' }),
    nrec('공고중', 10, { receiveTo: plus(5) })];
  const m = dash.model(list, TODAY);
  const snap = { today: '2026-11-11', byId: { I2: { institution_id: 'I2', status_cd: 'DELAYED', next_check_date: '2026-12-01' }, I3: { institution_id: 'I3', status_cd: 'CLOSED' } } };
  const q = dash.kindQueueModel(m, { today: TODAY, snap: snap });
  assert.strictEqual(rowOf(q, '지자체').x, 2);            // 경과1(기록 없음)·경과2(지연) — 경과3(공고 종료)은 처리됨
  assert.strictEqual(rowOf(q, '지자체').n, 2);            // 공고중은 막대에 넣지 않는다
  assert.strictEqual(q.noticeN, 1);
  assert.strictEqual(dash.kindQueueModel(m, { today: TODAY, snap: null }).rows[0].x, 3);   // 기록을 모르면 전부 미처리
});

test('kindQueueModel: ids를 주면 그 기관만, 확정/추정 합계, 막대 폭은 가장 긴 줄 기준 88%', () => {
  const list = [est('목표', 0, { institutionId: 'G1' }), est('관심', 40, { institutionId: 'W1' }), est('다른', 100, { institutionId: 'Z' }),
    { name: '확정', region: '11', type: '지자체', contractEnd: plus(20), confirmed: true, institutionId: 'C1' }];
  const m = dash.model(list, TODAY);
  const all = dash.kindQueueModel(m, { today: TODAY, snap: null });
  assert.strictEqual(rowOf(all, '지자체').n, 4);
  assert.deepStrictEqual([all.conf, all.est], [1, 3]);
  const mine = dash.kindQueueModel(m, { today: TODAY, snap: null, ids: { G1: true, W1: true } });
  assert.deepStrictEqual([rowOf(mine, '지자체').n, mine.est], [2, 2]);
  // 목표·관심 보기면 공고 중 수도 그 기관만 센다
  const m2 = dash.model([nrec('공고G', 10, { receiveTo: plus(5), institutionId: 'G1' }), nrec('공고Z', 10, { receiveTo: plus(5), institutionId: 'Z' })], TODAY);
  assert.strictEqual(dash.kindQueueModel(m2, { today: TODAY, snap: null }).noticeN, 2);
  assert.strictEqual(dash.kindQueueModel(m2, { today: TODAY, snap: null, ids: { G1: true } }).noticeN, 1);
  assert.strictEqual(dash.kindQueueModel(m2, { today: TODAY, snap: null, ids: { Q: true } }).noticeN, 0);
  assert.strictEqual(dash.kqWidth(21, 21), 88);
  assert.strictEqual(dash.kqWidth(1, 21), 4.2);
  assert.strictEqual(dash.kqWidth(0, 0), 0);
});

test('kindQueueHtml: h2 문구, 줄 5개 고정(0곳은 6개월 내 예정 없음), 숫자는 칸 안, aria-label, 월별 막대 흔적 없음, 전환은 canScope일 때만', () => {
  const m = dash.model([est('가', 10), est('경과', -3)], TODAY);
  const q = dash.kindQueueModel(m, { today: TODAY, snap: null });
  const h = dash.kindQueueHtml(q, { updated: '2026-11-13' });
  assert.ok(h.includes('<h2 id="db-kq-h">다가오는 기관별 공고현황</h2>') && h.includes('지금 공고 중 <b>0</b>곳') && !h.includes('(위 띠)') && h.includes('자료 수정 <b>2026-11-13</b>'));
  assert.strictEqual((h.match(/class="db-kq-row"/g) || []).length, 5);
  dash.KQ_KINDS.reduce((prev, k) => { const i = h.indexOf('<span class="db-kq-k">' + k + '</span>'); assert.ok(i > prev, k); return i; }, -1);
  assert.strictEqual((h.match(/6개월 내 예정 없음/g) || []).length, 4);                 // 지자체 외 4줄
  assert.ok(h.includes('class="kq-s m1" style="width:'));
  assert.ok(h.includes('<span class="kq-s x" style="width:') && h.includes('<em>1</em>'));
  assert.ok(h.includes('aria-label="지자체: 1개월 내 1곳, 공고 확인 어려움 1곳"') && h.includes('aria-label="공공기관, 교육청 포함: 6개월 내 공고 예정 없음"'));
  assert.ok(h.includes('입찰 예정일은 공고가 나기 전까지 추정입니다.') && h.includes('id="db-kq-find" aria-controls="db-q">그 외 기간 찾기'));
  assert.ok(!h.includes('db-kq-scope') && !/db-tile|id="db-chart"|월별 입찰 예정|db-tomap"/.test(h));
  const s = dash.kindQueueHtml(q, { canScope: true, scope: 'mine' });
  assert.ok(s.includes('id="db-kq-scope"') && s.includes('name="db-kq-sc" value="mine" checked') && s.includes('<span>목표·관심 기관</span>') && s.includes('<span>전체 기관</span>'));
  assert.ok(!dash.kindQueueHtml(q, { updated: '<img src=x>' }).includes('<img'));
});

test('setGoals는 watch_items를 별도 집합으로 담고 isGoalRec 의미는 그대로(목표만), scopeIds는 합집합·못 받으면 null', () => {
  const Y = TODAY.getFullYear();
  dash.clearGoals();
  assert.strictEqual(dash.scopeIds(), null);
  assert.strictEqual(dash.setGoals({ year: Y, items: [{ institution_id: 'G1' }], watch_items: [{ institution_id: 'W1' }] }, TODAY), true);
  assert.deepStrictEqual(Object.keys(dash.scopeIds()).sort(), ['G1', 'W1']);
  const goals = dash.util.gateOpts().goals;
  assert.strictEqual(dash.isGoalRec({ institutionId: 'G1' }, goals, TODAY), true);
  assert.strictEqual(dash.isGoalRec({ institutionId: 'W1' }, goals, TODAY), false);   // 관심은 [제안 확정] 규칙 밖
  dash.setGoals({ year: Y, items: [] }, TODAY);                                         // watch_items가 없는 옛 응답
  assert.strictEqual(dash.scopeIds(), null);                                            // 합집합이 빈 객체면 null(전환 숨김)
  dash.clearGoals();
  assert.strictEqual(dash.scopeIds(), null);
});

test('띠·소묶음 문구: 선정 결과 대기로 통일, 소묶음 제목, 버튼 aria-controls, 칩 badge', () => {
  const m = dash.model([nrec('송파', 8, { receiveTo: plus(4) }), nrec('지남', 50, { receiveTo: plus(-5) })], TODAY);
  const h = dash.noticeBandHtml(m, '');
  assert.ok(h.includes('접수 마감 전 <b>1</b>곳 · 선정 결과 대기 <b>1</b>곳') && h.includes('<button type="button" class="end" id="db-nb-wait" aria-controls="db-nwlb">선정 결과 대기 <b>1</b>곳 보기</button>'));
  assert.ok(h.includes('<p class="db-nb-aside">선정 결과 대기 <b>1</b>곳 — 결과 공고가 났는지 확인하세요.</p>') && !h.includes('결과 확인'));
  const open = dash.model([nrec('a', 5, { receiveTo: plus(1) }), nrec('b', 5, { receiveTo: plus(2) }), nrec('u', 20)], TODAY).notice.filter(n => !dash.isNoticeCheck(n));
  assert.strictEqual(dash.noticeGroupLabel(open), '접수 마감 전 <b>2</b>곳 · 접수 기간 원문 확인 <b>1</b>곳 · 마감 가까운 순');
  assert.strictEqual(dash.waitGroupLabel(3), '선정 결과 대기 <b>3</b>곳 · 결과 공고가 났는지 확인하세요');
  assert.strictEqual(logic.noticeBrief(nrec('지남', 50, { receiveTo: plus(-5) }), TODAY).badge, '선정 결과 대기');
});

test('소스: 목록 소묶음·옵션 id 접두·showWait·키보드 대상', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/dashboard.js'), 'utf8').replace(/\r\n/g, '\n');   // 체크아웃 줄 끝(CRLF)과 무관하게
  assert.ok(s.includes('id="db-g0w"') && s.includes('id="db-nwlb" tabindex="0" aria-labelledby="db-g0w"') && s.includes("optionsFor(ntWait, 'db-w-')") && s.includes("optionsFor(ntOpen, 'db-n-')"));
  assert.ok(/case 'db-nb-wait': showWait\(\); break;/.test(s));
  const sw = (s.match(/function showWait\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  assert.ok(sw.includes("setTab('up', false)") && sw.includes('scrollTop') && sw.includes('preventScroll') && sw.includes('is-target') && sw.includes('1600'));
  assert.ok(!sw.includes("block: 'start'"));   // 페이지 전체를 끌어 올리지 않는다(목록 칸만 스크롤)
  assert.ok(/case 'db-clear': case 'db-clear-w':/.test(s) && /case 'db-kq-find':[^\n]*\$\('db-q'\)/.test(s));
  assert.ok(!/db-tile|timelineHtml|monthBuckets|windowSpan|chartLabel|barPx/.test(s));
  assert.ok(/e\.target\.name === 'db-kq-sc'/.test(s) && /clearTimeout\(tgTimer\)/.test(s));
});

test('termLine: 시작~끝 (n년), 한쪽·주기·다 모름, 줄마다 다르면 한 줄 없음, 우선순위, escape', () => {
  const same = dash.termLine([{ from: '2023-01-01', to: '2026-12-31' }, { from: '2023-01-01', to: '2026-12-31' }], 4, '2030-01-01');
  assert.deepStrictEqual([same.same, same.html], [true, '<span class="v">2023-01-01 ~ 2026-12-31</span> (4년)']);   // 줄 값이 expiry보다 먼저
  assert.deepStrictEqual(dash.termLine([{ from: '2023-01-01', to: '2026-12-31' }, { from: '2025-01-01', to: '2028-12-31' }], 4, ''), { same: false, html: '' });
  assert.strictEqual(dash.termLine([{ from: '', to: '2026-12-31' }], 4).html, '~ <span class="v">2026-12-31</span> 만료 (4년)');
  assert.strictEqual(dash.termLine([{ from: '2023-01-01', to: '' }], 4).html, '<span class="v">2023-01-01</span> ~ <span class="pop-unk">미확인</span> (4년)');
  assert.strictEqual(dash.termLine([{ from: '2023-01-01', to: '2026-12-31' }]).html, '<span class="v">2023-01-01 ~ 2026-12-31</span>');   // 주기를 모르면 날짜만
  assert.strictEqual(dash.termLine([], null, '2026-06-30').html, '~ <span class="v">2026-06-30</span> 만료');
  assert.strictEqual(dash.termLine([{ from: '', to: '' }], 4, '2026-06-30').html, '~ <span class="v">2026-06-30</span> 만료 (4년)');
  assert.strictEqual(dash.termLine([], null, '').html, '<span class="pop-unk">미확인</span>');
  assert.ok(dash.termLine([], 4, '<img src=x>').html.indexOf('<img') < 0);
});

test('paneHtml 새 순서: ①입찰 예정(기록 h4 포함) → ②기관 정보 → 기관장 → 사업계획 → tail, 약정 주기·현 약정 만료 줄 없음', () => {
  const up = dash.model([est('가', 40, { lastBid: '2022-12-01', term: 4 })], TODAY).upcoming[0];
  const REC = '<div class="db-rec" id="db-rec"><div class="db-sub-h"><h4 id="db-rec-h">공고 상태 기록</h4></div></div>';
  const h = dash.paneHtml(up, { act: 'none', today: TODAY, recordHtml: REC, headHtml: '<div class="db-sec">HEAD</div>', plansHtml: '<div class="db-sec">PLANS</div>', tailHtml: '<i id="T"></i>' });
  const at = s => h.indexOf(s);
  assert.ok(at('<h3>입찰 예정</h3><div class="db-term') > 0 && at('<h3>입찰 예정</h3>') < at('<h4 id="db-rec-h">공고 상태 기록</h4>') && at('<h4 id="db-rec-h">') < at('<h3>기관 정보</h3>'));
  assert.ok(at('<h3>기관 정보</h3>') < at('HEAD') && at('HEAD') < at('PLANS') && at('PLANS') < at('id="T"'));
  assert.ok(h.includes('<dt>입찰 예정일</dt>') && h.includes('<dt>약정 기간</dt><dd><span class="pop-unk">미확인</span> (4년)</dd>'));
  assert.ok(at('<dt>약정 기간</dt>') < at('<dt>지난 금고 선정일</dt>'));
  assert.ok(!h.includes('<h3>약정 주기</h3>') && !h.includes('<dt>약정 주기</dt>') && !h.includes('<dt>현 약정 만료</dt>') && !h.includes('<h3>현재 금고 은행</h3>'));
  // 공고 난 기관: 공고 진행 안에 기록 h4, 막대 끝 라벨은 약정 만료 유지, 약정 만료는 '약정 기간' 한 줄이 맡는다
  const ntc = dash.model([nrec('마포', 14, { receiveTo: plus(7), contractExpiry: '2026-12-31' })], TODAY).notice[0];
  const n = dash.paneHtml(ntc, { act: 'none', today: TODAY, recordHtml: REC });
  assert.ok(n.indexOf('<h3>공고 진행</h3>') < n.indexOf('<h4 id="db-rec-h">') && n.indexOf('<h4 id="db-rec-h">') < n.indexOf('<h3>기관 정보</h3>'));
  assert.ok(n.includes('약정 만료 12.31') && n.includes('<dt>약정 기간</dt><dd>~ <span class="v">2026-12-31</span> 만료</dd>') && !n.includes('<dt>현 약정 만료</dt>'));
  assert.ok(!n.includes('class="db-term') && !n.includes('<dt>입찰 예정일</dt>'));
  // 금고 지정 공고일(check)·날짜 미상
  const chk = dash.model([est('관악구청', 70)], TODAY).upcoming[0];
  assert.ok(dash.paneHtml(chk, { act: 'none', today: TODAY }).includes('<dt>금고 지정 공고일</dt>'));
  assert.ok(dash.paneHtml(dash.itemForRec({ name: '미상구청', region: '11', type: '지자체' }, TODAY), { act: 'none', today: TODAY }).includes('<h3>입찰 예정</h3><dl class="db-dl"><dt>입찰 예정일</dt><dd><span class="pop-unk">미확인</span></dd></dl>'));
  // 출처 details는 기관 정보 절 안
  const src = dash.paneHtml(dash.model([est('나', 40, { sources: ['출처 한 줄'] })], TODAY).upcoming[0], { act: 'none', today: TODAY });
  assert.ok(src.indexOf('<h3>기관 정보</h3>') < src.indexOf('<summary>출처 1건 보기</summary>') && src.indexOf('<summary>출처 1건 보기</summary>') < src.indexOf('<h3>기관장</h3>'));
});

test('기관 정보에 은행 줄 + 약정 기간 한 줄: 같으면 둘째 줄 약정 없음, 다르면 줄마다 둘째 줄·한 줄 없음, 편집 단추는 머리', () => {
  const CODES = { banks: [], ranks: [{ code: 'FIRST', name: '1금고' }, { code: 'SECOND', name: '2금고' }], src_kinds: [{ code: 'LINK', name: '공고·문서 링크' }], cancel_reasons: [], accounts: [] };
  const L = o => Object.assign({ contract_no: 1, rev_no: 1, origin_cd: 'MANUAL', rank_cd: 'FIRST', bank_cd: 'B02', bank_name: '신한은행', term_from: '2023-01-01', term_to: '2026-12-31', term_state: 'CURRENT',
    src_kind: 'LINK', src_url: 'https://www.gangnam.go.kr/a', checked_date: '2026-11-10', overlap_with: [], editor_name: '이영업', emp_verified: true, saved_at: '2026-11-16T10:00:00' }, o || {});
  const V = lines => ({ st: 'ok', code: 0, histOpen: false, histSt: 'idle', hist: null, data: { lines: lines, history_count: lines.length, can_edit: true, today: '2026-11-17', codes: CODES } });
  const up = dash.model([est('강남구청', 40, { lastBid: '2022-12-01', term: 4, sources: ['출처 한 줄'] })], TODAY).upcoming[0];
  const one = dash.paneHtml(up, { act: 'none', today: TODAY, bank: V([L()]), muniSrcHtml: '<span class="hb-src">직접 확인: X</span>' });
  assert.ok(one.includes('id="db-bank"') && one.includes('<h3>기관 정보</h3>') && !one.includes('약정 <span class="v">2023-01-01 ~ 2026-12-31</span>'));
  assert.ok(one.includes('<dt>약정 기간</dt><dd><span class="v">2023-01-01 ~ 2026-12-31</span> (4년)</dd>'));
  assert.ok(one.indexOf('<dt>1금고</dt>') < one.indexOf('<dt>약정 기간</dt>') && one.indexOf('<dt>약정 기간</dt>') < one.indexOf('<dt>지난 금고 선정일</dt>'));
  assert.ok(one.indexOf('class="db-sec-act" id="bk-edit">금고 약정 고치기') > 0 && one.slice(one.indexOf('class="bk-foot"')).indexOf('id="bk-edit"') < 0);
  assert.ok(one.indexOf('class="bk-foot"') < one.indexOf('<summary>출처 1건 보기</summary>'));   // 출처 details는 foot 맨 앞
  assert.ok(one.indexOf('<dl class="db-dl">') < one.indexOf('bk-src') && one.indexOf('bk-src') < one.indexOf('class="bk-foot"'));   // dl → 출처 줄 → … → foot
  const ed = dash.paneHtml(up, { act: 'none', today: TODAY, bank: V([L()]), editing: true });
  assert.ok(!ed.includes('id="bk-edit"') && ed.includes('class="bk-foot"'));   // 편집 중에는 머리 단추 없음, 입력 묶음 자리(.bk-foot)는 그대로
  const nb = V([]); nb.st = 'denied';
  assert.ok(dash.paneHtml(up, { act: 'none', today: TODAY, bank: nb }).includes('<summary>출처 1건 보기</summary>'));   // foot이 없어도 출처는 단독으로 보인다
  const fb = dash.paneHtml(up, { act: 'none', today: TODAY, muniSrcHtml: '<span class="hb-src">직접 확인: X</span>' });
  assert.ok(fb.includes('<div class="db-sec" id="db-bank">') && fb.indexOf('bk-src') < fb.indexOf('<summary>출처 1건 보기</summary>'));   // 서버 없는 폴백 경로도 id·순서 같음
  const two = dash.paneHtml(up, { act: 'none', today: TODAY, bank: V([L(), L({ contract_no: 2, rank_cd: 'SECOND', bank_name: '국민은행', term_from: '2025-01-01', term_to: '2028-12-31' })]) });
  assert.ok(!two.includes('<dt>약정 기간</dt>') && two.includes('약정 <span class="v">2023-01-01 ~ 2026-12-31</span>') && two.includes('약정 <span class="v">2025-01-01 ~ 2028-12-31</span>'));
  const no = V([L()]); no.data.can_edit = false;
  assert.ok(!dash.paneHtml(up, { act: 'none', today: TODAY, bank: no }).includes('id="bk-edit"') && dash.paneHtml(up, { act: 'none', today: TODAY, bank: no }).includes('금고 약정은 영업팀이 입력합니다.'));
  const pop = dash.popupHtml(up, { act: 'none', today: TODAY, nameId: 'dm-name', bank: V([L()]) });
  assert.ok(pop.body.indexOf('<div class="db-sec-h"><h3>기관 정보</h3><button type="button" id="dm-info-edit" class="db-sec-act">기관 정보 수정</button><button type="button" class="db-sec-act" id="bk-edit">금고 약정 고치기</button></div>') > 0);
});

test('bc.sectionHtml: merged 없으면 지금 그대로(제목 현재 금고 은행·바닥 단추), noticerec nested는 h4 소구획', () => {
  const V = { st: 'ok', code: 0, histOpen: false, histSt: 'idle', hist: null, data: { lines: [], history_count: 0, can_edit: true, today: '2026-11-17', codes: { banks: [], ranks: [], src_kinds: [], cancel_reasons: [], accounts: [] } } };
  const h = bc.sectionHtml(V, {});
  assert.ok(h.includes('<h3>현재 금고 은행</h3>') && h.includes('<div class="bk-foot"><button type="button" id="bk-edit">금고 약정 입력</button></div>'));
  const it = { date: '2026-11-01', overdue: true, days: 1 };
  const nested = nr.sectionHtml(it, { state: 'offline', nested: true });
  assert.ok(nested.startsWith('<div class="db-rec" id="db-rec"><div class="db-sub-h"><h4 id="db-rec-h">공고 상태 기록</h4><small>이번 회차') && nested.indexOf('<h3>') < 0 && nested.indexOf('db-sec db-rec') < 0);
  assert.ok(nr.sectionHtml(it, { state: 'offline' }).startsWith('<div class="db-sec db-rec" id="db-rec"><h3>공고 상태 기록'));
  const brief = dash.recordBriefHtml(it, { state: 'offline', nested: true });
  assert.ok(brief.startsWith('<div class="db-rec"><div class="db-sub-h"><h4>공고 상태 기록</h4>') && dash.recordBriefHtml(it, { state: 'offline' }).startsWith('<div class="db-sec db-rec"><h3>'));
});

test('CSS: 새 .db-kq·.kq-s·.db-sub-h·.db-grp-sub는 현황판 블록 안, 월별 막대 선택자는 없다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 입찰 현황판 시작'), b = html.indexOf('/* 입찰 현황판 끝 */');
  const css = html.slice(a, b);
  ['.db-kq {', '.db-kq-row {', '.kq-s.x {', '.kq-s.x:not(:first-child)', '.db-sub-h {', '.db-grp-sub {', '.db-grp.is-target {'].forEach(s => assert.ok(css.indexOf(s) >= 0, s));
  assert.ok(!/\.db-tile|\.db-chart|\.db-axis|\.db-leg\b|\.seg\b|\.db-tl\b|\.db-col\b/.test(css));
  assert.ok(/\.db-kq-row \{[^}]*grid-template-columns:72px minmax\(0, 1fr\) 48px/.test(css) && /\.kq-s\.x:not\(:first-child\) \{ margin-left:6px/.test(css));
});
