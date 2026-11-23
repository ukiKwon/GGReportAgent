const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const prep = require('../js/prep.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'prep.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 서버 nobid_notice(PrepNobidService.view) 한 건 — backend 11-19 a7668ed9 3-7절의 키 그대로
function notice(over) {
  return Object.assign({ applicable: true, mode: 'popup', institution_id: 'I1', round_seq: 3, rev_no: 2, status_cd: 'NO_BID',
    handled_at: '2026-12-01T10:00:00+09:00', handler_name: '홍길동', emp_verified: true, can_view_notice: true,
    acked: false, can_ack: true, tidy_action: 'CANCEL' }, over || {});
}
function view(state, nb, over) {
  return Object.assign({ bid_case_id: 'B1', institution_id: 'I1', institution_name: '노원구청', state_cd: state, state_name: '',
    progress: { done: 0, total: 0 }, confirmed_by: null, assignees: [], tasks: [], open_request: null, plan_request: null, board_result: null,
    viewer: { is_assignee: true, can_request_plan_approval: true, can_start_writing: true },
    nobid_notice: nb === undefined ? notice() : nb }, over || {});
}
function caseOf(v, extra) { return prep.caseHtml(Object.assign({ view: v, history: [], attach: null, role: '영업팀', meEmp: '1' }, extra || {})); }
function plain(h) { return String(h).replace(/<[^>]*>/g, '').replace(/&#39;/g, "'"); }

test('nobidOf·nobidPopup: applicable일 때만 대상, 팝업은 mode=popup이고 can_ack일 때만(fact_only·none은 사실 줄만)', () => {
  assert.strictEqual(prep.nobidOf(view('IN_PROGRESS')).round_seq, 3);
  assert.strictEqual(prep.nobidOf(view('IN_PROGRESS', null)), null);                       // 서버가 읽기 실패 → 아무것도 안 그린다
  assert.strictEqual(prep.nobidOf({ state_cd: 'IN_PROGRESS' }), null);                      // 키 자체가 없는 옛 응답
  assert.strictEqual(prep.nobidOf(view('IN_PROGRESS', notice({ applicable: false, mode: 'none' }))), null);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS')), true);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS', notice({ mode: 'fact_only', can_ack: false }))), false);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS', notice({ can_ack: false }))), false);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS', notice({ applicable: false, mode: 'none' }))), false);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS', null)), false);
});

test('날짜·기록자 꼬리: 한국 날짜, 기록자만 없으면 날짜만, 날짜가 없으면 괄호 통째로 뺀다', () => {
  assert.strictEqual(prep.nobidDate({ handled_at: '2026-12-01T10:00:00+09:00' }), '2026-12-01');
  assert.strictEqual(prep.nobidDate({ handled_at: '2026-11-30T16:00:00Z' }), '2026-12-01');   // KST로 넘어간 날
  assert.strictEqual(prep.nobidDate({ handled_at: null }), '');
  assert.strictEqual(prep.nobidDate({ handled_at: '엉터리' }), '');
  assert.strictEqual(prep.nobidTailText(notice(), true), '(2026-12-01 수정됨, 기록자 홍길동)');
  assert.strictEqual(prep.nobidTailText(notice({ handler_name: null }), true), '(2026-12-01 수정됨)');
  assert.strictEqual(prep.nobidTailText(notice(), false), '(2026-12-01 수정됨)');
  assert.strictEqual(prep.nobidTailText(notice({ handled_at: null }), true), '');          // 이름이 있어도 날짜가 없으면 뺀다
  assert.strictEqual(prep.nobidWarnText(view('WRITABLE')),
    '주의: 이 기관의 이번 회차 입찰 공고 상태는 \'입찰 없음(연장·지정)\'입니다(2026-12-01 수정됨).');
  assert.strictEqual(prep.nobidWarnText(view('WRITABLE', notice({ handled_at: null, handler_name: null }))),
    '주의: 이 기관의 이번 회차 입찰 공고 상태는 \'입찰 없음(연장·지정)\'입니다.');
  assert.strictEqual(prep.nobidWarnText(view('WRITABLE', null)), '');
});

test('질문 문장: 작성 중이면 제안서 문장, 작성 전 단계는 제안 준비 문장(버튼 이름은 둘 다 [계속 작성])', () => {
  assert.strictEqual(prep.nobidAsk('WRITING'), '제안서를 계속 작성하시겠습니까?');
  ['CONFIRMED', 'OPEN_PENDING', 'IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE'].forEach(st => {
    assert.strictEqual(prep.nobidAsk(st), '이 기관의 제안 준비를 계속하시겠습니까?', st);
    assert.ok(prep.nobidPopupHtml(view(st), { canNotice: true }).indexOf('id="pp-nb-continue" data-act="nobid-continue">계속 작성</button>') > 0, st);
  });
});

test('nobidTidy: 서버 tidy_action → 모달 종류. 막힌 3가지는 버튼 없이 문장', () => {
  assert.strictEqual(prep.nobidTidy(view('CONFIRMED', notice({ tidy_action: 'UNCONFIRM' }))).kind, 'unconfirm');
  assert.strictEqual(prep.nobidTidy(view('WRITING', notice({ tidy_action: 'CANCEL' }))).kind, 'abort');
  const op = prep.nobidTidy(view('OPEN_PENDING', notice({ tidy_action: 'OPEN_PENDING' })));
  assert.strictEqual(op.kind, '');
  assert.ok(op.line.indexOf('개설 신청이 승인을 기다리는 중이라 지금은 제안 확정을 취소할 수 없습니다.') === 0);
  const pl = prep.nobidTidy(view('APPROVAL_PENDING', notice({ tidy_action: 'PLAN_PENDING' })));
  assert.strictEqual(pl.kind, '');
  assert.ok(pl.line.indexOf('사전준비 승인 요청 중에는 제안을 중단할 수 없습니다.') === 0);
  const no = prep.nobidTidy(view('IN_PROGRESS', notice({ tidy_action: 'NONE' })));
  assert.strictEqual(no.kind, '');
  assert.strictEqual(no.line, '이 건의 확정 취소·중단은 영업부서 팀장이 합니다. 입찰 없음이 맞으면 영업부서 팀장에게 알려 주세요.');
  assert.ok(prep.nobidTidy(view('CONFIRMED', notice({ tidy_action: 'NONE' }))).line.indexOf('확정한 사람이나 영업부서 팀장이 합니다.') > 0);
});

test('nobidPopupHtml: 알림 대화상자 규격(role·aria·tabindex), 버튼 셋 순서, 빨강·강조 없음, 비활성 버튼 없음', () => {
  const h = prep.nobidPopupHtml(view('CONFIRMED', notice({ tidy_action: 'UNCONFIRM' })), { canNotice: true });
  assert.ok(/id="pp-nb" role="alertdialog" aria-modal="true" aria-labelledby="pp-nb-t" aria-describedby="pp-nb-fact pp-nb-ask" tabindex="-1"/.test(h));
  assert.ok(/id="pp-nb-err" class="ap-err" role="alert"/.test(h));
  const a = h.indexOf('id="pp-nb-notice"'), b = h.indexOf('id="pp-nb-tidy"'), c = h.indexOf('id="pp-nb-continue"');
  assert.ok(a > 0 && b > a && c > b);
  assert.ok(h.indexOf('data-act="nobid-notice"') > 0 && h.indexOf('data-act="nobid-tidy"') > 0 && h.indexOf('data-act="nobid-continue"') > 0);
  assert.ok(h.indexOf('>제안 확정 취소…</button>') > 0 && h.indexOf('정리') < 0);
  assert.ok(h.indexOf('pp-danger') < 0 && h.indexOf('pp-next-btn') < 0 && !/disabled/.test(h));
  const t = plain(h);
  assert.ok(t.indexOf('입찰 없음으로 기록된 기관 — 노원구청') >= 0);
  assert.ok(t.indexOf('이 기관의 이번 회차 입찰 공고 상태는 \'입찰 없음(연장·지정)\'입니다(2026-12-01 수정됨, 기록자 홍길동).') >= 0);
  assert.ok(h.indexOf('<span class="pp-mono">2026-12-01</span>') > 0);
  assert.ok(t.indexOf('제안 확정 취소: 입찰 없음이 맞으면 제안 확정을 취소합니다. 사유를 적는 창이 열립니다.') >= 0);
  assert.ok(t.indexOf('계속 작성: 다음 회차를 준비하는 중이면 누르세요. 누른 기록이 남고, 공고 기록이 바뀌기 전까지 다시 묻지 않습니다.') >= 0);
  assert.ok(plain(prep.nobidPopupHtml(view('IN_PROGRESS'), { canNotice: true })).indexOf('중단하면 되돌릴 수 없습니다.') > 0);
});

test('nobidPopupHtml: 공고 현황 메뉴가 없으면 [공고 상태 보기]를 빼고 그 줄을 문장으로 바꾼다. 쓸 수 없는 정리도 버튼 대신 문장', () => {
  const h = prep.nobidPopupHtml(view('IN_PROGRESS', notice({ tidy_action: 'NONE', can_view_notice: false, handled_at: null, handler_name: null })), { canNotice: false });
  assert.strictEqual(h.indexOf('pp-nb-notice'), -1);
  assert.strictEqual(h.indexOf('pp-nb-tidy'), -1);
  assert.ok(h.indexOf('id="pp-nb-continue"') > 0);                                        // [계속 작성]은 늘 있다
  const t = plain(h);
  assert.ok(t.indexOf('공고 기록이 틀렸다면 입찰 공고 현황 기록 담당에게 알려 주세요.') >= 0);
  assert.ok(t.indexOf('공고 상태 보기:') < 0);
  assert.ok(t.indexOf('입니다.') > 0 && t.indexOf('수정됨') < 0);                         // 날짜가 없으면 괄호 없음
  const w = plain(prep.nobidPopupHtml(view('WRITING', notice({ tidy_action: 'CANCEL' })), { canNotice: true }));
  assert.ok(w.indexOf('제안서를 계속 작성하시겠습니까?') > 0);
});

test('입찰 없음 알림 마크업은 기관명·기록자 이름을 이스케이프한다', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const v = view('CONFIRMED', notice({ handler_name: evil, tidy_action: 'UNCONFIRM' }), { institution_name: evil });
  [prep.nobidPopupHtml(v, { canNotice: true }), caseOf(v, { canNotice: true })].forEach(h => {
    assert.ok(h.indexOf('<img') < 0);
    assert.ok(h.indexOf('&lt;img') > 0);
  });
});

test('caseHtml: 입찰 없음 사실 줄은 단계 막대 뒤·다음 한 걸음 앞, 날짜 괄호(기록자 없이), 링크는 canNotice일 때만', () => {
  const v = view('IN_PROGRESS', notice({ mode: 'fact_only', can_ack: false }));
  const h = caseOf(v, { canNotice: true });
  const s = h.indexOf('aria-label="진행 단계"'), b = h.indexOf('class="pp-banner is-nobid" role="note"'), n = h.indexOf('class="pp-next"');
  assert.ok(s > 0 && b > s && n > b);
  assert.ok(plain(h).indexOf('이 기관은 이번 회차 입찰 공고가 \'입찰 없음(연장·지정)\'으로 기록되어 있습니다(2026-12-01 수정됨).') >= 0);
  assert.ok(h.indexOf('class="link-btn" data-act="nobid-notice"') > 0);
  assert.strictEqual(caseOf(v, { canNotice: false }).indexOf('data-act="nobid-notice"'), -1);
  assert.strictEqual(caseOf(v).indexOf('data-act="nobid-notice"'), -1);
  assert.ok(caseOf(view('IN_PROGRESS')).indexOf('is-nobid') > 0);                          // 팝업 모드여도 사실 줄은 남는다([계속 작성] 뒤에도)
  assert.ok(plain(caseOf(view('IN_PROGRESS', notice({ handled_at: null, handler_name: null })))).indexOf('기록되어 있습니다.') > 0);
  assert.strictEqual(caseOf(view('IN_PROGRESS', null)).indexOf('is-nobid'), -1);
  assert.strictEqual(caseOf(view('IN_PROGRESS', notice({ applicable: false, mode: 'none' }))).indexOf('is-nobid'), -1);
});

test('확인 줄: 사전준비 승인 요청·제안서 작성 시작 확인 줄 맨 앞에만 \'주의:\' 줄(알림 대상일 때만, 매번)', () => {
  const plan = caseOf(view('IN_PROGRESS'), { confirm: { kind: 'plan' } });
  const w = plan.indexOf('class="pp-cwarn"'), q = plan.indexOf('영업부장에게 사전준비 승인을 요청합니다.');
  assert.ok(w > 0 && q > w);
  assert.ok(plan.indexOf('<div class="pp-confirm" role="group" aria-label="사전준비 승인 요청 확인"><div class="pp-cwarn">') > 0);
  assert.ok(plain(plan).indexOf('주의: 이 기관의 이번 회차 입찰 공고 상태는 \'입찰 없음(연장·지정)\'입니다(2026-12-01 수정됨).') >= 0);
  const st = caseOf(view('WRITABLE', notice({ mode: 'fact_only' })), { confirm: { kind: 'start' } });
  assert.ok(st.indexOf('class="pp-cwarn"') > 0 && st.indexOf('data-act="start-ok"') > 0);
  assert.strictEqual(caseOf(view('IN_PROGRESS'), { confirm: null }).indexOf('class="pp-cwarn"'), -1);           // 확인 줄이 안 열렸으면 없다
  assert.strictEqual(caseOf(view('IN_PROGRESS', null), { confirm: { kind: 'plan' } }).indexOf('pp-cwarn'), -1);   // 대상 아님
  assert.strictEqual(prep.confirmHtml('x', 'a', 'b', 'ok', 'no', '', '라벨').indexOf('pp-cwarn'), -1);           // 기존 호출은 그대로
});

test('개설 신청 창: 첫 안내 위에 주의 줄(info.nobidWarn이 있을 때만)', () => {
  const m = { kind: 'open', candState: 'ok', sel: [], q: '', cands: [], reason: '' };
  const on = prep.modalBodyHtml(m, { meEmp: '1', nobidWarn: prep.nobidWarnText(view('CONFIRMED')) });
  assert.ok(on.indexOf('<div class="pp-cwarn"') === 0 && on.indexOf('담당자로 일할 사람을') > on.indexOf('pp-cwarn'));
  assert.strictEqual(prep.modalBodyHtml(m, { meEmp: '1' }).indexOf('pp-cwarn'), -1);
});

test('소스 배선: [계속 작성]은 건 기준 POST·화면 이름 prep_detail/nobid_continue·본문 round_seq·rev_no', () => {
  assert.ok(SRC.indexOf("base(id) + '/nobid-ack'") > 0);
  assert.ok(SRC.indexOf("ui('prep_detail', 'nobid_continue')") > 0);
  assert.ok(/\{ round_seq: nb\.round, rev_no: nb\.rev \}/.test(SRC));
  assert.ok(SRC.indexOf("code === 'NOTICE_CHANGED'") > 0 && SRC.indexOf("code === 'NOT_APPLICABLE'") > 0);
});

test('소스 배선: 팝업은 건을 열 때만(쓰기 뒤 재조회는 팝업 없음), 화면이 보일 때만, Esc는 팝업 먼저·기록 없이 닫기', () => {
  assert.ok(/invalidateCache\(\);\s*loadDetail\(id\);\s*reloadList\(\);/.test(SRC));               // doAct: 옵션 없음 = 팝업 없음
  assert.ok(/markSelected\(\);\s*S\.nbSeen = '';\s*loadDetail\(id, \{ popup: true \}\);/.test(SRC));   // selectCase
  assert.ok(/loadDetail\(S\.selected, \{ popup: true \}\); else paintCase\(\);/.test(SRC));     // refresh
  assert.ok(/if \(popup\) maybeNobid\(\);/.test(SRC));
  const mb = SRC.slice(SRC.indexOf('function maybeNobid'), SRC.indexOf('function openNobid'));
  assert.ok(mb.indexOf("'pp-root'") > 0 && mb.indexOf("'tab-soon'") > 0 && mb.indexOf('S.nbSeen') > 0);   // 숨은 화면에서 열어 앱을 잠그지 않는다
  const esc = SRC.slice(SRC.indexOf("e.key !== 'Escape'"));
  assert.ok(esc.indexOf('if (S.nb)') > 0 && esc.indexOf('if (S.nb)') < esc.indexOf('if (!S.modal) return;'));
  assert.ok(/inertBehind\(md, document\.body\)/.test(SRC) && /inertRelease\(nbInert\)/.test(SRC));
  assert.ok(/S\.nbSeen = '';/.test(SRC));
});

test('대상 아님(키 없음·null·applicable:false·문자열 \'true\')이면 caseHtml·modalBodyHtml이 알림 없는 화면과 문자열로 완전히 같다', () => {
  const plainView = view('IN_PROGRESS', null);
  delete plainView.nobid_notice;                                                            // 키 자체가 없는 옛 응답이 기준
  const variants = [null, { applicable: false, mode: 'none' }, { applicable: 'true', mode: 'popup', can_ack: true }];
  const forms = [{ confirm: null }, { confirm: { kind: 'plan' } }, { confirm: { kind: 'start' } }];
  forms.forEach(f => {
    const base = caseOf(plainView, f);
    assert.strictEqual(base.indexOf('pp-cwarn'), -1);
    assert.strictEqual(base.indexOf('is-nobid'), -1);
    variants.forEach(nb => {
      const v = view('IN_PROGRESS', nb);
      assert.strictEqual(caseOf(v, f), base, JSON.stringify(nb) + ' ' + JSON.stringify(f));
      assert.strictEqual(caseOf(v, Object.assign({ canNotice: true }, f)), caseOf(plainView, Object.assign({ canNotice: true }, f)));
    });
  });
  const m = { kind: 'open', candState: 'ok', sel: [], q: '', cands: [], reason: '' };
  const w0 = prep.modalBodyHtml(m, { meEmp: '1' });
  assert.strictEqual(w0.indexOf('pp-cwarn'), -1);
  variants.concat([undefined]).forEach(nb => {
    const v = nb === undefined ? plainView : view('IN_PROGRESS', nb);
    assert.strictEqual(prep.nobidWarnText(v), '');
    assert.strictEqual(prep.modalBodyHtml(m, { meEmp: '1', nobidWarn: prep.nobidWarnText(v) }), w0);
  });
  assert.strictEqual(prep.modalBodyHtml(m, { meEmp: '1', nobidWarn: '' }), w0);
});

test('nobidOf: applicable가 문자열 \'true\'면 대상 아님(=== true만)', () => {
  assert.strictEqual(prep.nobidOf(view('IN_PROGRESS', notice({ applicable: 'true' }))), null);
  assert.strictEqual(prep.nobidPopup(view('IN_PROGRESS', notice({ applicable: 'true' }))), false);
});

test('nobidDate: 마이크로초 표기도 한국 날짜로(자정 경계 15:00 UTC)', () => {
  assert.strictEqual(prep.nobidDate({ handled_at: '2026-11-30T15:30:00.123456+00:00' }), '2026-12-01');
  assert.strictEqual(prep.nobidDate({ handled_at: '2026-11-30T14:59:59.999999+00:00' }), '2026-11-30');
});

test('팝업 제목: 기관명이 비면 목록 행 이름, 그것도 없으면 \' — 기관명\' 부분을 뺀다', () => {
  const t = h => plain(h.slice(h.indexOf('<h3 id="pp-nb-t">'), h.indexOf('</h3>')));
  assert.strictEqual(t(prep.nobidPopupHtml(view('IN_PROGRESS', undefined, { institution_name: '' }), { name: '도봉구청' })), '입찰 없음으로 기록된 기관 — 도봉구청');
  assert.strictEqual(t(prep.nobidPopupHtml(view('IN_PROGRESS', undefined, { institution_name: '  ' }), { name: '  ' })), '입찰 없음으로 기록된 기관');
  assert.strictEqual(t(prep.nobidPopupHtml(view('IN_PROGRESS', undefined, { institution_name: null }), {})), '입찰 없음으로 기록된 기관');
  assert.strictEqual(t(prep.nobidPopupHtml(view('IN_PROGRESS'), { name: '도봉구청' })), '입찰 없음으로 기록된 기관 — 노원구청');
});

test('소스 배선: 팝업이 열린 뒤 화면이 숨겨지면 MutationObserver로 거둔다(open에서 관찰, close에서 disconnect), 409는 닫고 제목 포커스', () => {
  const op = SRC.slice(SRC.indexOf('function openNobid'), SRC.indexOf('function closeNobid'));
  assert.ok(op.indexOf('nbWatchHidden()') > 0);
  const w = SRC.slice(SRC.indexOf('function nbWatchHidden'), SRC.indexOf('function nbUnwatch'));
  assert.ok(w.indexOf('new MutationObserver') > 0 && w.indexOf("typeof MutationObserver === 'undefined'") > 0);
  assert.ok(w.indexOf("attributeFilter: ['style']") > 0 && w.indexOf("attributeFilter: ['class']") > 0 && w.indexOf('closeNobid(false)') > 0);
  assert.ok(/\.disconnect\(\)/.test(SRC));
  const cl = SRC.slice(SRC.indexOf('function closeNobid'), SRC.indexOf('function gotoNotice'));
  assert.ok(cl.indexOf('nbUnwatch()') > 0);
  const nc = SRC.slice(SRC.indexOf("code === 'NOTICE_CHANGED'"), SRC.indexOf("code === 'NOTICE_CHANGED'") + 900);
  assert.ok(/closeNobid\(false\);\s*S\.nbSeen = '';[\s\S]*S\.focusTitle = true;[\s\S]*loadDetail\(id, \{ popup: true \}\)/.test(nc));
  assert.ok(SRC.indexOf("prep.errorInfo(st, e && e.detail, curTasks(), 'nobid')") > 0);
});

test('index.html: 입찰 없음 알림 CSS(.pp-banner.is-nobid · .pp-cwarn · .pp-nb-box)는 사전준비 구간 안, 새 색 없음', () => {
  const a = HTML.indexOf('/* 제안서 사전준비 시작'), b = HTML.indexOf('/* 제안서 사전준비 끝 */');
  const css = HTML.slice(a, b);
  assert.ok(/\.pp-banner\.is-nobid \{[^}]*border:1px solid var\(--orange\)/.test(css));
  assert.ok(/\.pp-cwarn \{[^}]*flex:1 0 100%/.test(css));
  assert.ok(/\.modal-box\.pp-nb-box:focus \{ outline:none; \}/.test(css));
  assert.ok(/@media \(max-width:880px\) \{ \.pp-nb-acts \{ flex-wrap:wrap; \} \}/.test(css));
});
