(function (root) {
  'use strict';
  // 입찰 현황판(2026-11-16 역할 재정의, 사용자 확정; 11-17 '올해 목표 기관' 중심으로 재설계) — 국민은행 상태 화면.
  // 구성(위→아래): 제목 줄(연도 선택·[목표 기관 추가]) → 요약 띠(목표 n곳·접수 마감 30일 안·준비 지연·목표 기관의 현 금고 은행) → 목표 표(한 줄 = 한 기관: 구분·마감까지·현 금고 은행·준비 단계·설명회·12개월 일정,
  //   아래에 '그 밖의 제안서 준비 중인 기관' 묶음) → '협약 중인 기관' 팝업(제목 줄의 #hb-ours-btn으로 열린다, 상자 #hb-ours, 협약 종료일 순·와플 머리).
  // 규격: handoff/agents/design-reviewer/2026-11-17_1513_acfdd5da.md 6-A~6-E(6-F 설명회 입력은 2단계 — 설명회 열은 '—'). 접두어 hb-. 화면 글에 1인칭 '우리'를 쓰지 않는다(낙찰 은행 '우리은행'과 헷갈림). 회차 소식 줄의 출처 문장 속 은행 이름은 그대로 둔다.
  // 서버: GET /bid-targets?year=·POST /institutions/{id}/bid-targets(·/{no}/cancel·/{no}/move)·GET /bank-contracts/summary. 쓰기 머리글 X-Screen-Id 'bid_board'·X-Button-Id(add_bid_target·add_watch_target·edit_bid_target·change_target_tag·goal_next_year·cancel_bid_target·move_to_goal·move_to_watch), X-Emp-No는 app.js의 fetch 덮개가 붙인다.
  // 11-17 후속(design-reviewer a3ab5c5a 6-1~6-12): 제안 진행 5단계 줄(요약 띠 안)·표 도구 줄(탭 목표/관심·검색·구분·상태·종류)·열 머리 정렬·입찰 종료 줄·관심 기관 표·빈 후보 4묶음·협약 중인 기관 팝업(#hb-ours-btn)·옮기기 확인 창.
  // 협약 종료일 원천(실제 동작): 지자체 = 직접 입력 금고 약정(/bank-contracts/summary의 국민은행 줄 term_to) > 행안부 금고지정 현황(LOFIN_2026)의 국민은행 줄 end(없으면 일반회계 줄) / 법원·공공기관 = 레코드 contractExpiry, 없으면 '종료일 미상'.
  // 새 판정은 만들지 않고 dashboard.js의 함수(model·kbEntry·isOurs·stageCounts·itemForRec …)를 조합한다.
  // 순수 부분은 node 테스트 대상이고, DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다.
  // 순수 함수는 검증 자료(verified)와 2027년부터 자료(nextList)를 인자로 받는다(전역 root.KB_NEXT에 기대지 않는다). DOM 부분만 전역을 읽는다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = isNode ? require('./dashboard.js') : root.dashboard;
  const errtext = isNode ? require('./errtext.js') : root.errtext;
  const tc = isNode ? require('./tchange.js') : root.tchange;   // NEXT 105 — 목표 기관 변경(결재·일괄 요청·이월·협약 개시일)의 순수 부분
  const esc = logic.esc;
  const kbb = {};
  function P() { return isNode ? require('./prep.js') : root.prep; }

  // ── 순수: 국민은행이 맡은 기관 목록 ─────────────────────────────────
  kbb.ours = function (list, verified, scope, nextList) {
    return logic.dedupeByInstitution(list || []).filter(function (r) { return dash.isOurs(r, verified, scope, nextList); });
  };
  // 칩 글자(data-auditor 11-16): 지자체 1금고·2금고(일부 회계), 2027년부터, 법원 공탁금, 공공기관 주거래.
  kbb.slotText = function (rec, verified, nextList) {
    const k = dash.oursKind(rec, verified, nextList);
    if (k === 'muni') { const e = dash.kbEntry(rec, verified); return e && e.slot === 2 ? '2금고(일부 회계)' : (e && e.slot === 1 ? '1금고' : '금고'); }
    if (k === 'next') { const e = dash.kbEntry(rec, nextList); return (e && e.from ? e.from : '2027') + '년부터'; }
    return k === 'court' ? '공탁금' : (k === 'public' ? '주거래' : '');
  };
  // 지금 맡고 있지만 곧 다른 은행으로 바뀌는 기관(KB_VERIFIED의 leaves) — 칩 옆 배지 글자. 없으면 ''.
  kbb.leavesText = function (rec, verified) {
    const e = rec ? dash.kbEntry(rec, verified) : null;
    return e && e.leaves ? e.leaves + '년부터 다른 은행' : '';
  };
  // total = 지금 맡은 곳(지자체 1·2금고 + 켜진 법원·공공기관), next = 2027년부터 맡는 곳(따로 센다).
  kbb.summary = function (ours, verified, nextList) {
    const c = { total: 0, s1: 0, s2: 0, court: 0, pub: 0, next: 0 };
    ours.forEach(function (r) {
      const k = dash.oursKind(r, verified, nextList);
      if (k === 'next') { c.next += 1; return; }
      c.total += 1;
      if (k === 'muni') { const e = dash.kbEntry(r, verified); if (e && e.slot === 1) c.s1 += 1; else if (e && e.slot === 2) c.s2 += 1; }
      else if (k === 'court') c.court += 1;
      else if (k === 'public') c.pub += 1;
    });
    return c;
  };
  // 구획 머리의 큰 숫자 줄: '27곳 · 종료 1년 안 8곳'. soonN = 종료 1년 안 묶음 수(없으면 그 칸을 뺀다).
  kbb.figHtml = function (c, soonN) {
    return '<span><b>' + c.total + '</b>곳</span>' + (typeof soonN === 'number' ? '<span>종료 1년 안 <b>' + soonN + '</b>곳</span>' : '');
  };
  // 종류별 내역: '1금고 5 · 2금고 11 · 공탁금 7 · 주거래 4 · 협약 예정 6'(칩 글자와 같게).
  kbb.breakdownHtml = function (c) {
    const p = [];
    if (c.s1 || c.s2) p.push('1금고 <b>' + c.s1 + '</b>', '2금고 <b>' + c.s2 + '</b>');
    if (c.court) p.push('공탁금 <b>' + c.court + '</b>');
    if (c.pub) p.push('주거래 <b>' + c.pub + '</b>');
    if (c.next) p.push('협약 예정 <b>' + c.next + '</b>');
    return p.join(' · ');
  };
  // 금고 은행 칸이 비어 있는 법원·공공기관 수(법원·공공기관을 켰을 때 각주에서 말한다).
  kbb.bankUnknownN = function (list) {
    return logic.dedupeByInstitution(list || []).filter(function (r) {
      const k = logic.kindOf(r.type);
      return (k === '법원' || k === '공공기관') && !String(r.bank || '').trim();
    }).length;
  };
  // 지자체 출처 링크(지방재정365 금고지정 현황 목록 — 해마다 최신판이 위에 올라온다). 인터넷 PC에서만 열린다. 규격: design-reviewer 11-17 6-1.
  kbb.LOFIN_FSL409_URL = 'https://www.lofin365.go.kr/portal/LF8310000.do?curPage=1&ntcaClsDvCd=FSL409';
  kbb.SRC_NAME = '행안부 금고지정 현황(2026.1.1. 기준)';
  kbb.srcHtml = function (label) {
    const u = logic.safeHttpUrl(kbb.LOFIN_FSL409_URL);
    return '<span class="hb-src">' + esc(label == null ? '지자체 출처: ' : label) + (u
      ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(kbb.SRC_NAME) + '<span class="sr-only">, 새 탭</span></a> <span class="db-why">(인터넷 PC에서 열림)</span>'
      : esc(kbb.SRC_NAME)) + '</span>';
  };
  // 세는 기준 본문(출처 링크 줄은 footBoxHtml이 따로 앞에 둔다). 규격 11-17 6-A: 각주는 출처 한 줄 + [세는 기준] 펼침.
  kbb.footHtml = function (scope, k) {
    const s = scope || dash.OURS_SCOPE;
    const base = '지자체는 1·2금고';
    const more = [s.court ? '법원은 공탁금 보관은행' : '', s.public ? '공공기관은 주거래은행' : ''].filter(Boolean);
    let h;
    if (s.muni === false) h = more.length ? more.join(', ') + ' 칸으로 셉니다.' : '';   // 지자체를 세지 않으면 지자체 문장이 없다
    else h = more.length ? base + ', ' + more.join(', ') + ' 칸으로 셉니다.' : base + '만 셉니다.';
    if (s.next) h += ' 협약 예정(2027년부터)은 지정 결과 공고·기사로 확인한 곳입니다.';
    h += more.length ? ' 은행 칸이 빈 법원·공공기관 <b>' + Number(k || 0) + '</b>곳은 세지 않았습니다.' : ' 법원·공공기관은 아직 세지 않습니다.';
    // 협약 종료일 문장(design 11-17 P2-2): 현황판이 실제로 쓰는 원천만 말한다 — 직접 입력 금고 약정은 /bank-contracts/summary로 받아 온다(11-17).
    const muniEnd = '지자체는 직접 입력한 금고 약정이 있으면 그 값, 없으면 행안부 금고지정 현황의 약정 끝날', pubEnd = '법원·공공기관은 기관 자료의 약정 만료일이며 없으면 \'종료일 미상\'';
    if (s.muni !== false) h += ' 협약 종료일: ' + muniEnd + (more.length ? ', ' + pubEnd : '') + '입니다.';
    else if (more.length) h += ' 협약 종료일: ' + pubEnd + '입니다.';
    return h;
  };
  kbb.footBoxHtml = function (scope, k) {
    const s = scope || dash.OURS_SCOPE;
    return (s.muni !== false ? kbb.srcHtml() : '') + '<details><summary>세는 기준</summary><p>' + kbb.footHtml(scope, k) + '</p></details>';
  };
  // '회차 소식' 줄 — kb-verified의 next 문장을 그대로 쓴다('확정' 같은 말을 덧붙이지 않는다). 2027년부터 자료(from 있음)는 quote가 그 문장이다.
  // data-auditor 결과에 따라 SHOW_NEWS=false로 끈다.
  kbb.SHOW_NEWS = true;
  kbb.newsLine = function (entry) {
    const t = entry ? (entry.next || (entry.from ? entry.quote : '')) : '';
    return kbb.SHOW_NEWS && t ? '회차 소식: ' + t : '';
  };

  function byName(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); }
  // ── 협약 종료일(design 11-17 6-A) ───────────────────────────────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // 'YYYY'(그 해 12-31)·'YYYY-MM'(그 달 말일)·'YYYY-MM-DD' → 'YYYY-MM-DD'. 읽을 수 없거나 없는 날짜면 ''.
  kbb.normDate = function (s) {
    const t = String(s == null ? '' : s).trim();
    let m = /^(\d{4})$/.exec(t);
    if (m) return m[1] + '-12-31';
    m = /^(\d{4})-(\d{2})$/.exec(t);
    if (m) { const mo = Number(m[2]); return mo >= 1 && mo <= 12 ? m[1] + '-' + m[2] + '-' + pad2(new Date(Date.UTC(Number(m[1]), mo, 0)).getUTCDate()) : ''; }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : '';
    }
    return '';
  };
  // 이번 협약 기간의 마지막 날. o = { lofin: LOFIN_2026, direct: { 'region|name': 'YYYY-MM-DD' }(직접 입력 금고 약정, 현황판이 서버 응답을 받아 올 때만), today }.
  // 지자체 = 직접 입력 > 행안부 국민은행 줄 end(없으면 일반회계 줄) / 법원·공공기관 = 레코드 contractExpiry. 못 정하면 { date:'' }.
  kbb.contractEnd = function (rec, o) {
    o = o || {};
    const none = { date: '', src: '' };
    if (!rec) return none;
    if (dash.kindOfRec(rec) === '지자체') {
      const k = logic.instKey(rec);
      const dir = o.direct && Object.prototype.hasOwnProperty.call(o.direct, k) ? kbb.normDate(o.direct[k]) : '';
      if (dir) return { date: dir, src: 'direct' };
      const lines = dash.lofinLines(rec, o.lofin, o.today).filter(function (l) { return kbb.normDate(l.end); });
      const pick = lines.filter(function (l) { return /국민/.test(l.bank); })[0] ||
        lines.filter(function (l) { return l.accts.indexOf('일반회계') >= 0; })[0];
      return pick ? { date: kbb.normDate(pick.end), src: 'lofin' } : none;
    }
    const ex = kbb.normDate(rec.contractExpiry);
    return ex ? { date: ex, src: 'expiry' } : none;
  };
  // 종료 D-n 색 경계: 183일 이하 빨강(urgent), 365일 이하 주황(soon), 그 뒤 색 없음(design 11-17 6-A).
  kbb.END_URGENT = 183;
  kbb.END_SOON = 365;
  // 협약 중인 기관 묶음(협약 종료일 순). verified = KB_VERIFIED, nextList = KB_NEXT, o = contractEnd의 o.
  //  soon = 종료 1년 안(종료일 지난 곳이 먼저·오래 지난 순 → D 가까운 순, 같으면 이름) / later = 종료 1년 뒤(D 가까운 순) /
  //  unk = 종료일 미상(이름순) / next = 협약 예정(2027년부터, 이름순) — 지금 은행이 아니라 앞 세 묶음에 넣지 않는다.
  // 각 항목은 dash.itemForRec(다음 입찰 공고 예정일 — logic.effectiveBid) + endDate·endDays·endSrc.
  kbb.groups = function (ours, today, verified, nextList, o) {
    const o2 = Object.assign({}, o || {}, { today: today });
    const g = { soon: [], later: [], unk: [], next: [], pastN: 0 };
    ours.forEach(function (r) {
      const it = dash.itemForRec(r, today);
      if (dash.oursKind(r, verified, nextList) === 'next') { g.next.push(it); return; }
      const ce = kbb.contractEnd(r, o2);
      it.endDate = ce.date; it.endSrc = ce.src;
      it.endDays = ce.date ? logic.daysUntil(ce.date, today) : null;
      if (it.endDays === null) g.unk.push(it);
      else if (it.endDays <= kbb.END_SOON) { g.soon.push(it); if (it.endDays < 0) g.pastN += 1; }
      else g.later.push(it);
    });
    const byEnd = function (a, b) { return (a.endDays - b.endDays) || byName(a, b); };
    g.soon.sort(byEnd); g.later.sort(byEnd); g.unk.sort(byName); g.next.sort(byName);
    return g;
  };
  kbb.soonLabel = function (n, pastN) { return '종료 1년 안 <b>' + n + '</b>곳' + (pastN ? ' · 종료일 지난 곳 <b>' + pastN + '</b> 포함' : ''); };
  kbb.laterLabel = function (n) { return '종료 1년 뒤 <b>' + n + '</b>곳'; };
  kbb.unkLabel = function (n) { return '종료일 미상 <b>' + n + '</b>곳'; };
  kbb.nextLabel = function (n) { return '협약 예정(2027년부터) <b>' + n + '</b>곳'; };
  kbb.OURS_EMPTY = '협약 중인 기관이 없습니다.';

  function dText(n) { return n === 0 ? 'D-day' : 'D-' + n; }
  // 줄 오른쪽 위의 종료 D-n. 협약 예정(next) 줄은 호출 쪽에서 부르지 않는다.
  kbb.endHtml = function (it) {
    const n = it.endDays;
    if (n === null || n === undefined) return '<span class="hb-end unk">종료일 미상</span>';
    if (n < 0) return '<span class="hb-end over"><span class="l">종료일 지남</span><span class="ov-stamp">D+' + (-n) + '</span></span>';
    const cls = n <= kbb.END_URGENT ? ' urgent' : (n <= kbb.END_SOON ? ' soon' : '');
    return '<span class="hb-end' + cls + '"><span class="l"><span class="sr-only">협약 </span>종료</span><b>' + dText(n) + '</b></span>';
  };
  // 둘째 줄: 지역 · 다음 입찰 공고(예정일, 확정/추정) 상태. 협약 예정 줄은 '지역 · 종류'만.
  function metaHtml(it, isNext) {
    const reg = esc(dash.regionName(it.region));
    if (isNext) return reg + ' · ' + esc(dash.kindOfRec(it.rec));
    const base = reg + ' · ';
    if (it.notice) {
      const nt = dash.recTagHtml(dash.recView(it));
      const when = it.phase === 'receiving' && typeof it.deadlineDays === 'number' ? ' · 마감 <span class="d">' + dText(it.deadlineDays) + '</span>' : ' · 공고 후 ' + it.since + '일';
      return base + '입찰 공고 진행 중' + when + (nt ? ' · ' + nt : '');
    }
    if (it.overdue) {
      const rt = dash.recTagHtml(dash.recView(it));
      return base + '다음 입찰 공고 예정일 ' + it.days + '일 지남 · ' + (rt || (it.noticeExpired ? esc(dash.overdueNote(it)) : '공고 확인 필요'));
    }
    if (it.unknown) return base + '다음 입찰 공고 예정일 미상';
    return base + '다음 입찰 공고 <span class="d">' + esc(it.date) + '</span> ' + esc(it.label);
  }
  // 이번 협약 뒤에도 국민은행이 맡는 것으로 읽히는 곳(칩 '국민은행 확정', 사용자 11-19): 회차 소식(KB_VERIFIED.next)에 수성·재선정·유지가 있고 '다른 은행으로 간다'(leaves)가 아닐 때. '다음은 다른 은행'과 짝(D-n 색은 그대로).
  // 문장이 국민(국민은행·KB국민·KB)을 말하고 수성·재선정·유지가 있을 때만 — '부산은행 유지'나 '수성 실패·미정·미확인'은 아니다(qa 11-17 P3-3).
  kbb.staysText = function (rec, verified) {
    const e = rec ? dash.kbEntry(rec, verified) : null;
    const t = String(e && e.next || '');
    return e && !e.leaves && kbb.staysSure(t) ? '국민은행 확정' : '';
  };
  // 사용자 11-19: '유지' 기사도 확정으로 보되 문맥이 진짜 확정일 때만. '·'로 나눈 같은 구절에 국민(KB)과 수성·재선정·유지가 함께 있고,
  // 그 구절에 추측·조건 말(할지·기대·전망…)이 없을 때. '예정'은 수성·재선정·유지 바로 뒤에 붙을 때만 막는다('약정 체결 예정'·'시작 예정'은 확정 일정). data-auditor 11-19 검수.
  // qa 11-19 재작성: 괄호(출처) 제거 → ' · '·쉼표·—·/·;로 구절 나눔('1·2금고'는 안 나눔) → 은행 낱말(KBS·KB증권·국민일보·국민연금 제외)·확정 말·부정어·추측 말·예정 검사.
  const STAY_SPLIT = /\s·\s|[,，—/;；]/;
  const STAY_BANK = /KB국민|국민은행|(^|[^A-Za-z])KB(?![A-Za-z])|(^|[^가-힣])국민(?![가-힣]*(일보|연금|카드|의힘))/;
  const STAY_NEG = /실패|미정|미확인|불발|무산|탈락|빠짐|못(\s|해|했)|않/;
  const STAY_HEDGE = /할지|될지|여부|기대|전망|관측|가능성|유력|가닥|점쳐|주목|우선협상|지키면|한다면|된다면|보인다|예상된다|예상돼|검토 중|추진 중/;
  kbb.staysSure = function (text) {
    const t = String(text || '').replace(/\([^)]*\)/g, '');
    return t.split(STAY_SPLIT).some(function (p) {
      const bank = STAY_BANK.test(p.replace(/KB(증권|손해|생명|캐피탈|카드)/g, ''));
      return bank && /수성|재선정|유지/.test(p) && !STAY_NEG.test(p) && !STAY_HEDGE.test(p)
        && !/(발표|심의|결정|선정|결과)[^·,]{0,10}예정/.test(p) && !/(수성|재선정|유지)\S{0,6}\s*예정/.test(p);
    });
  };
  // 4-2: '국민은행 확정' 줄에도 [관심에 넣기](목표에 넣기는 popCanAdd가 계속 숨긴다). 관심에는 연도가 없어 moveYear·올해 입찰 종료는 걸지 않는다. noWatch = 옛 서버(관심 응답 없음)는 openAdd가 목표 창으로 열리므로 숨긴다.
  kbb.popCanWatch = function (it, o) {
    o = o || {};
    return !o.mark && !!o.can && !o.noWatch && !!String(it && it.rec && it.rec.institutionId || '') && !!kbb.staysText(it && it.rec, o.verified);
  };
  kbb.popCanAdd = function (it, o) {
    o = o || {};
    const id = String(it && it.rec && it.rec.institutionId || '');
    return !o.mark && !!o.can && !o.isNext && !kbb.staysText(it && it.rec, o.verified) && !(o.closedIds && o.closedIds[id]) && !!kbb.moveYear(it && it.endDate, o.years);
  };
  const BANK_CHK = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6.4 4.8 9 10 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';   // 고정 마크업(데이터 아님), 칩 글자색 따라감
  // 다음 약정 칩 판정 한 곳(design 11-19 6-4, 사용자 답: 선정 공고·협약이 확인된 것만 '재약정/신규약정', 기사만이면 '(기사)').
  // sum = 039 요약(lines_next·lines_now). 줄의 src_kind가 'PRESS'면 기사, 없거나 다른 값이면 확인으로 본다(서버가 src_kind를 주기 전까지는 확인 쪽으로 기운다 — 이관 메모 1).
  // 반환 { cls, text, chk, src, sr } | null. 은행 이름만 쓴다(순위·기간 안 붙임), 시작일은 sr-only로만.
  kbb.nextChip = function (rec, verified, nextList, sum, today) {
    if (!rec) return null;
    const nowKb = dash.oursKind(rec, verified, nextList) !== 'next';   // KB_NEXT(2027년부터 국민은행)는 지금은 다른 은행이 맡는다
    const lines = kbb.nextLines(sum, today);
    const isKb = function (l) { return /국민|kb/i.test(String(l.bank_name || '')); };
    const pick = function (arr) { return arr.filter(isKb)[0] || arr[0] || null; };   // 1·2금고가 다르면 국민은행 줄을 먼저(portal.decided와 같은 규칙)
    const startSr = function (l) { return l && l.term_from ? ' (' + String(l.term_from) + '부터)' : ''; };
    const name = function (l) { return String(l.bank_name || '').trim() || '다른 은행'; };
    let l = pick(lines.filter(function (x) { return String(x.src_kind || '') !== 'PRESS'; }));
    if (l) {   // 확인(선정 공고·협약)
      if (isKb(l)) return nowKb ? { cls: 'hb-bank', text: '국민은행 재약정', chk: true, sr: ' (다음 약정, 선정 공고·협약으로 확인)' }
        : { cls: 'hb-new', text: '국민은행 신규약정', chk: true, sr: ' (다음 약정, 선정 공고·협약으로 확인)' };
      return { cls: 'hb-leaves', text: name(l) + ' 약정 예정', sr: startSr(l) };
    }
    l = pick(lines.filter(function (x) { return String(x.src_kind || '') === 'PRESS'; }));
    if (l) return isKb(l) ? { cls: 'hb-news', text: nowKb ? '국민은행 재약정 예정' : '국민은행 신규약정 예정', src: true } : { cls: 'hb-leaves', text: name(l) + ' 약정 예정', src: true, sr: startSr(l) };
    // 시작 전 줄이 없을 때: 수집 자료(기사). 판정 순서 = 재약정 예정 → 신규약정 예정 → 다른 은행 약정 예정
    const e = dash.kbEntry(rec, verified);
    if (kbb.staysText(rec, verified)) return { cls: 'hb-news', text: '국민은행 재약정 예정', src: true };
    if (!nowKb) return { cls: 'hb-news', text: '국민은행 신규약정 예정', src: true };
    if (e && e.leaves) return { cls: 'hb-leaves', text: '다른 은행 약정 예정', src: true, sr: ' (' + e.leaves + '년부터)' };
    return null;
  };
  kbb.nextChipHtml = function (c) {
    if (!c) return '';
    return '<span class="hb-slot ' + c.cls + '"' + (c.cls === 'hb-bank' ? ' data-bank="kb"' : '') + '>' + (c.chk ? BANK_CHK : '') + esc(c.text) +
      (c.src ? '<span class="src">(기사)</span>' : '') + (c.sr ? '<span class="sr-only">' + esc(c.sr) + '</span>' : '') + '</span>';
  };
  // 협약 중인 기관 행 — <ul> 안의 <button>. 누르면 상세 팝업이 열린다(선택형 listbox가 아니다).
  // o = { verified, nextList, sum, today, prepActive }
  kbb.rowHtml = function (it, o) {
    o = o || {};
    const slot = kbb.slotText(it.rec, o.verified, o.nextList), chip = kbb.nextChip(it.rec, o.verified, o.nextList, o.sum, o.today);
    const isNext = dash.oursKind(it.rec, o.verified, o.nextList) === 'next';
    const news = kbb.newsLine(dash.kbEntry(it.rec, o.verified) || dash.kbEntry(it.rec, o.nextList));
    const over = it.endDays !== undefined && it.endDays !== null && it.endDays < 0;
    // 팝업 줄(규격 6-10): o.mark = '2026 목표'·'관심' 칩(이미 걸린 줄), o.canAdd = [목표에 넣기](종료가 선택 가능 연도 안이고 아직 목표·관심이 아니며 국민은행 확정·올해 입찰 종료가 아닌 줄, 영업부서만 — kbb.popCanAdd). 둘 다 없으면 예전 모양.
    const rid = String(it.rec && it.rec.institutionId || '');
    const add = o.canAdd && rid ? '<button type="button" class="hb-tag add" data-act="oadd" data-inst="' + esc(rid) + '" data-key="' + esc(it.key) + '" aria-label="' + esc(it.name) + ' 목표에 넣기">목표에 넣기</button>'
      : (o.canWatch && rid ? '<button type="button" class="hb-tag add" data-act="owatch" data-inst="' + esc(rid) + '" data-key="' + esc(it.key) + '" aria-label="' + esc(it.name) + ' 관심에 넣기">관심에 넣기</button>' : '');   // 둘 중 하나만(국민은행 확정 줄은 관심만)
    return '<li' + (add ? ' class="hb-rl"' : '') + '><button type="button" class="hb-row" data-key="' + esc(it.key) + (it.overdue && dash.recView(it).view === 'done' ? '" data-rec="done' : '') + '" aria-haspopup="dialog">' +
      '<span class="nm">' + esc(it.name) + (slot ? '<span class="hb-slot">' + esc(slot) + '</span>' : '') + (o.mark ? '<span class="hb-slot hb-mark">' + esc(o.mark) + '</span>' : '') +
      kbb.nextChipHtml(chip) + '</span>' +
      (isNext ? '' : kbb.endHtml(it)) +
      '<span class="meta">' + metaHtml(it, isNext) + (over ? ' · 새 협약 기간 확인 필요' : '') + (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</span>' +
      (news ? '<span class="news" title="' + esc(news) + '">' + esc(news) + '</span>' : '') + '</button>' + add + '</li>';
  };

  // ── 순수: 표 바닥 링크·동작 칸 ───────────────────────────────────────────
  // 표 바닥의 [입찰 공고 현황에서 보기] 링크. nm = { n: 전국 공고 진행 중 곳 수 }.
  kbb.noticeLinkHtml = function (nm) {
    return '<span>전국 공고 진행 중 <b>' + nm.n + '</b>곳</span><button type="button" id="hb-to-notice">입찰 공고 현황에서 보기</button>';
  };
  // 동작 칸(dash.actionKind 판정). o = { name, key, badge:{cls,text} }. 신규 유치 줄은 정의상 늘 'open'.
  const ACT_WHY = { closed: '공고 끝남', past: '접수 기간 지남', nobid: '입찰 없음', delayed: '공고 지연' };
  kbb.actHtml = function (act, o) {
    o = o || {};
    if (act === 'open') { const b = o.badge || { cls: 'pp-neutral', text: '사전준비 중' }; return '<span class="wf-badge ' + esc(b.cls) + '">' + esc(b.text) + '</span>'; }
    if (act === 'confirm') {
      return '<button type="button" class="hb-confirm" data-key="' + esc(o.key) + '" data-act="confirm" aria-haspopup="dialog" aria-label="' + esc((o.name || '') + ' 제안 확정') + '">제안 확정</button>';
    }
    if (act === 'wait') return '<span class="why">확인 중…</span>';
    if (ACT_WHY[act]) return '<span class="why" title="' + esc(dash.CONFIRM_WHY[act] || '') + '">' + ACT_WHY[act] + '</span>';
    return '';   // unavailable·none·later는 비운다
  };

  // ── 순수: 준비 중인 제안 ──────────────────────────────────────────
  // 같은 기관은 한 번만, 더 나아간 단계 쪽. overview에만 있는 미완료·실행 중 기관은 '제안서 작성'으로 더한다.
  // dash.stageCounts와 같은 집합이어야 한다(P2-1: 목록 합계 = 제안 진행 단계 합계) — 규칙을 바꾸면 두 곳을 같이 바꾼다.
  function idOf(x) { return String(x && (x.institution_id || x.institutionId || x.id) || ''); }
  kbb.prepEntries = function (preps, overview) {
    const best = {}, out = [];
    if (Array.isArray(preps)) {
      dash.activePreps(preps).forEach(function (p) {
        const id = idOf(p); if (!id) return;
        const s = dash.stageOf(p.state_cd || p.stateCd);
        if (!best[id] || s > best[id].stage) best[id] = { id: id, stage: s, row: p, ov: null };
      });
      Object.keys(best).forEach(function (id) { out.push(best[id]); });
    }
    const items = Array.isArray(overview) ? overview : (overview && overview.items);
    if (Array.isArray(items)) {
      const seen = {};
      items.forEach(function (it) {
        const id = idOf(it);
        if (id && !it.done && (it.state || 'NONE') !== 'NONE' && !best[id] && !seen[id]) { seen[id] = true; out.push({ id: id, stage: 4, row: null, ov: it }); }
      });
    }
    return out;
  };
  // 이 기관이 제안 진행 중인가(제안 진행 단계 합계와 같은 집합: /preps 진행 건 + overview 미완료·실행 중).
  kbb.inProgress = function (rec, preps, overview) {
    const id = String(rec && rec.institutionId || '');
    return !!id && kbb.prepEntries(preps, overview).some(function (e) { return e.id === id; });
  };
  // 포커스를 되돌릴 요소 찾기: scope 안 버튼 중 data-key(+data-act)가 같은 것. 같은 act가 없으면(예: [제안 확정]이 단계 배지로 바뀜) 같은 key의 행 버튼.
  kbb.findOpener = function (scope, key, act) {
    if (!scope || !scope.querySelectorAll || !key) return null;
    const els = scope.querySelectorAll('button');
    let row = null;
    for (let i = 0; i < els.length; i += 1) {
      const b = els[i];
      if ((b.getAttribute('data-key') || '') !== key) continue;
      if ((b.getAttribute('data-act') || '') === (act || '')) return b;
      if (!b.getAttribute('data-act') && !row) row = b;
    }
    return row;
  };
  // 행 모델. 정렬 = 입찰 가까운 순(공고 진행 중이 맨 앞, 경과, 예정, 날짜 없음은 맨 뒤) → 같으면 prep.STATE_ORDER 순 → 이름.
  kbb.prepRows = function (preps, overview, list, today) {
    const Pp = P(), byInst = {};
    logic.dedupeByInstitution(list || []).forEach(function (r) { if (r.institutionId) byInst[String(r.institutionId)] = r; });
    const rows = kbb.prepEntries(preps, overview).map(function (e) {
      const rec = byInst[e.id] || null;
      const m = e.row ? Pp.listRowModel(e.row)
        : { id: '', institutionId: e.id, name: String(e.ov.institution_name || e.ov.institutionName || e.ov.name || ''), stateCd: 'WRITING',
            badge: Pp.stateBadge('WRITING', ''), done: 0, total: 0, assigneeText: '', canView: true };
      if (!m.name && rec) m.name = rec.name || '';
      let sort = Infinity, bidText = '';
      if (rec) {
        const it = dash.itemForRec(rec, today);
        if (it.notice) { sort = -1e9; bidText = it.phase === 'receiving' && typeof it.deadlineDays === 'number' ? '접수 마감 ' + dText(it.deadlineDays) : '공고 진행 중'; }   // 마감일을 알면 D-n(design 11-17 6-B)
        else if (it.overdue) { sort = -it.days; bidText = '입찰 예정일 ' + it.days + '일 지남'; }
        else if (!it.unknown) { sort = it.days; bidText = '입찰 예정 ' + dText(it.days); }
      }
      return Object.assign({}, m, { stageIdx: Pp.STATE_ORDER.indexOf(m.stateCd), sort: sort, bidText: bidText });
    });
    rows.sort(function (a, b) { return (a.sort - b.sort) || (a.stageIdx - b.stageIdx) || a.name.localeCompare(b.name, 'ko'); });
    return rows;
  };

  // ── 순수: 올해 목표 기관(design-reviewer 11-17 acfdd5da 6-A~6-E, 사용자 11-17) ──────────────────────
  kbb.SCREEN = 'bid_board';
  kbb.BTN = { add: 'add_bid_target', tag: 'change_target_tag', cancel: 'cancel_bid_target', addWatch: 'add_watch_target', edit: 'edit_bid_target', nextYear: 'goal_next_year', moveGoal: 'move_to_goal', moveWatch: 'move_to_watch' };
  kbb.KIND = { GOAL: 'GOAL', WATCH: 'WATCH' };
  kbb.TAG = { RETAIN: '재유치 도전', REGAIN: '되찾기 도전', NEW: '신규유치 도전' };
  kbb.DEADLINE_SOON = 30;       // '접수 마감 30일 안' 타일
  kbb.DELAY_DEFAULT = 30;       // 응답 delay_days가 없을 때 '준비 지연' 기준
  kbb.MEMO_MAX = 100;
  kbb.ETC_MAX = 50;
  const RANK_TEXT = { FIRST: '1금고', SECOND: '2금고', SINGLE: '단수', JOINT: '공동' };
  function jongOf(w) { const s = String(w == null ? '' : w), c = s ? s.charCodeAt(s.length - 1) : 0; return (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : -1; }
  function josaEun(w) { return jongOf(w) > 0 ? '은' : '는'; }
  function josaRo(w) { const j = jongOf(w); return j > 0 && j !== 8 ? '으로' : '로'; }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  function isoOf(d) { return d instanceof Date ? logic.localDateStr(d) : String(d == null ? '' : d).slice(0, 10); }
  function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && kbb.normDate(s) === s; }
  function dayNo(s) { return Math.floor(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 864e5); }
  function dayIso(n) { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  // 창 시작 달부터 센 '달 단위 위치'(0 = 첫 달 1일 0시, 12 = 끝). 12칸 눈금(CSS 12등분)과 맞추려고 일수가 아니라 달 안의 비율로 센다.
  function monthPos(s, win, endOfDay) {
    const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return (y * 12 + m - 1 - win.m0) + (d - 1 + (endOfDay ? 1 : 0)) / dim;
  }

  // 12개월 레인의 창. 시작 = max(이번 달 1일, 목표 연도 1월 1일), 끝 = 시작 + 12개월. nowPct = 오늘의 위치(%)(창 밖이면 null).
  kbb.laneWindow = function (today, goalYear) {
    const t = isoOf(today), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7)), gy = Number(goalYear) || ty;
    let sy = ty, sm = tm;
    if (gy > ty) { sy = gy; sm = 1; }
    const m0 = sy * 12 + sm - 1, months = [];
    for (let i = 0; i < 12; i += 1) { const x = m0 + i; months.push({ y: Math.floor(x / 12), m: x % 12 + 1 }); }
    const last = months[11];
    const win = { m0: m0, start: sy + '-' + pad2(sm) + '-01', months: months, label: sy + '.' + pad2(sm) + ' ~ ' + last.y + '.' + pad2(last.m), nowPct: null };
    if (isDay(t)) { const p = monthPos(t, win, false); if (p >= 0 && p < 12) win.nowPct = round3(p * 100 / 12); }
    return win;
  };
  // 공고 기간 막대의 자리(창 안 %). 확정 = 공고일(from)~접수 마감(to), 공고일이 없으면 마감 앞 7일, 마감일이 없으면 공고일 하루.
  // 추정(est) = 그 달 한 칸(8.333%). 창 밖이면 { off:'before'|'after' }. 날짜가 없으면 null.
  kbb.laneGeom = function (fromISO, toISO, est, win) {
    let f = String(fromISO || '').slice(0, 10), t = String(toISO || '').slice(0, 10);
    const hf = isDay(f), ht = isDay(t);
    if (!hf && !ht) return null;
    if (est) {
      const p = Math.floor(monthPos(hf ? f : t, win, false));
      if (p < 0) return { left: null, width: null, off: 'before' };
      if (p >= 12) return { left: null, width: null, off: 'after' };
      return { left: round3(p * 100 / 12), width: round3(100 / 12), off: null };
    }
    if (!ht) t = f;
    if (!hf) f = dayIso(dayNo(t) - 7);
    if (dayNo(f) > dayNo(t)) { const x = f; f = t; t = x; }
    let a = monthPos(f, win, false), b = monthPos(t, win, true);
    if (b <= 0) return { left: null, width: null, off: 'before' };
    if (a >= 12) return { left: null, width: null, off: 'after' };
    a = Math.max(0, a); b = Math.min(12, b);
    return { left: round3(a * 100 / 12), width: round3((b - a) * 100 / 12), off: null };
  };

  // 구분(태그) 기본값(팀 결정 11-17): 039 요약의 kb_now(KB → 재유치 도전, OTHER → 신규유치 도전) → NO_RECORD·요약 없음이면 행안부 금고지정(국민은행 줄)·KB_VERIFIED(재유치 도전)
  //  → 그 밖의 은행이 금고인 것이 확인되면(행안부·레코드 은행 칸 — 대화창 선택 줄의 은행과 같은 bankInfo) 신규유치 도전 → 은행을 모르면 기본값 없음(qa 11-17 P2-2).
  // sum = { kb_now, last_kb_year, lines_now }, o = { lofin, verified, today }. → { tag:'RETAIN'|'NEW'|'', why:'kb'|'other'|'lofin'|'verified'|'', bank?:'우리은행'(why 'other'이고 은행 이름을 알 때) }
  // Q1(11-23): 지금 금고에 국민은행이 없고(kb_now≠KB) 약정 이력의 마지막 국민 해가 올해보다 앞서면 그 해. 아니면 0. goalRow·defaultTag가 같은 기준을 쓴다.
  kbb.formerKbYear = function (sum, year) { const y = sum && sum.kb_now !== 'KB' ? Number(sum.last_kb_year) : 0; return y > 0 && y < Number(year) ? y : 0; };
  // 서버 코드표에 REGAIN이 아직 없으면(059 미적용) 기본값을 신규유치로 되돌린다 — 없는 코드가 대화창·메뉴에 기본으로 서지 않게.
  kbb.fitTag = function (def, tags) { return def && def.tag === 'REGAIN' && !(tags || []).some(function (t) { return t.code === 'REGAIN'; }) ? Object.assign({ tag: 'NEW', why: 'other' }, def.bank ? { bank: def.bank } : {}) : def; };
  kbb.defaultTag = function (rec, sum, o) {
    o = o || {};
    const s = sum && sum.kb_now;
    const other = function () {
      const out = { tag: 'NEW', why: 'other' }, b = kbb.bankInfo(sum, rec, o);
      if (!b.unknown && !b.kb && b.name) out.bank = b.name;
      return out;
    };
    if (s === 'KB') return { tag: 'RETAIN', why: 'kb' };
    if (s === 'OTHER') {
      const d = other(), last = kbb.formerKbYear(sum, o.today ? Number(isoOf(o.today).slice(0, 4)) : new Date().getFullYear());
      return last ? Object.assign(d, { tag: 'REGAIN', why: 'regain', last: last }) : d;
    }
    if (rec) {
      if (dash.lofinLines(rec, o.lofin, o.today).some(function (l) { return /국민/.test(l.bank); })) return { tag: 'RETAIN', why: 'lofin' };
      if (dash.kbEntry(rec, o.verified)) return { tag: 'RETAIN', why: 'verified' };
      const b = kbb.bankInfo(sum, rec, o);
      if (!b.unknown && !b.kb && b.name) return other();
    }
    return { tag: '', why: '' };
  };
  function josaI(w) { return jongOf(w) > 0 ? '이' : '가'; }
  // 지금 금고인 은행 이름이 든 구절('우리은행이'). 이름을 모르면 '다른 은행이'.
  function whoIs(def) { return def && def.why === 'other' ? (def.bank ? def.bank + josaI(def.bank) : '다른 은행이') : '국민은행이'; }
  // 대화창 구분 칸 아래 근거 한 줄(규격 6-E ①). 은행을 아는데 구분이 비었을 때는 없다 — 은행 미상일 때만 '자료가 없어 직접 고릅니다'.
  kbb.tagNote = function (def, name) {
    if (!def || !def.tag) return '현 금고 은행 자료가 없어 직접 고릅니다.';
    const nm = String(name || ''), tag = kbb.TAG[def.tag] || '';
    if (def.tag === 'REGAIN') return nm + josaEun(nm) + ' 예전(' + def.last + '년까지) 국민은행 금고였고 지금은 ' + (def.bank || '다른 은행') + ' 금고라 \'' + tag + '\'' + dash.josaEul(tag) + ' 골랐습니다. 바꿀 수 있습니다.';
    return nm + josaEun(nm) + ' 지금 ' + whoIs(def) + ' 금고라 \'' + tag + '\'' + dash.josaEul(tag) + ' 골랐습니다. 바꿀 수 있습니다.';
  };
  // 메뉴 맨 위 설명 줄에 쓰는 근거(규격 6-E ②)
  kbb.tagWhy = function (def) { return def && def.why === 'regain' ? '예전 국민은행 금고(' + def.last + '년까지)' + (def.bank ? ' · 지금 ' + def.bank : '') : (def && def.why === 'other' ? '지금 ' + whoIs(def) + ' 금고' : (def && def.tag ? '지금 국민은행 협약 중' : '')); };

  // 마감까지 모델. it = dash.itemForRec 결과(없으면 미상).
  //  fixed = 공고로 확정된 접수 마감일(D-n), closed = 접수 마감 지남(결과 확인 대기), open = 공고는 났으나 마감일 미확인,
  //  over = 예정일 지남(확정이면 est:false), plan = 확정된 공고 예정일(마감일은 아직), est = 추정 공고일, unk = 날짜 없음.
  kbb.dueOf = function (it) {
    if (!it) return { kind: 'unk' };
    if (it.notice) {
      const from = it.receiveFrom || it.date || '';
      if (it.phase === 'receiving' && typeof it.deadlineDays === 'number') return { kind: 'fixed', days: it.deadlineDays, from: from, to: it.receiveTo || '' };
      if (it.phase === 'awaiting') return { kind: 'closed', days: null, from: from, to: it.receiveTo || '' };
      return { kind: 'open', days: null, from: from, to: '' };
    }
    if (it.overdue) return { kind: 'over', days: it.days, est: it.confidence !== '확정', date: it.date || '' };
    if (it.unknown || !it.date) return { kind: 'unk' };
    return it.confidence === '확정' ? { kind: 'plan', days: it.days, date: it.date } : { kind: 'est', days: it.days, date: it.date };
  };
  // 정렬: 확정 마감일(D 오름차순) → 공고 났으나 마감 미확인·마감 지남 → 추정·예정일(부호 있는 D 오름차순) → 미상. 같으면 이름.
  function dueRank(d) { return d.kind === 'fixed' ? 0 : ((d.kind === 'open' || d.kind === 'closed') ? 1 : (d.kind === 'unk' ? 3 : 2)); }
  function dueSigned(d) { return d.kind === 'over' ? -(d.days || 0) : (typeof d.days === 'number' ? d.days : 0); }
  // 올해 입찰이 끝난 줄(r.closed)은 미상 다음, 맨 아래(규격 6-5: 올해 손쓸 일이 끝난 줄이다).
  function rankOf(r) { return r.closed ? 4 : dueRank(r.due); }
  function dueBottom(r) { return !!r.closed || !!(r.due && r.due.kind === 'unk'); }
  kbb.sortGoals = function (rows) {
    return (rows || []).slice().sort(function (a, b) {
      return (rankOf(a) - rankOf(b)) || (dueSigned(a.due) - dueSigned(b.due)) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    });
  };
  // 열 머리 정렬(규격 6-5). key = nm(기관)·tag(구분)·due(마감까지)·bank(현 금고 은행)·stage(준비 단계)·next(다음 협약 종료, 관심 탭), dir = 'asc'|'desc'.
  // 같은 값이면 이름 가나다 순(방향과 무관). 값을 모르는 줄(은행 확인 안 됨·단계 없음·일정 모름)은 방향과 상관없이 맨 아래. 묶음(목표 / 목표 밖 준비)은 호출 쪽이 따로 넘긴다.
  kbb.SORTABLE = { goal: ['nm', 'tag', 'due', 'bank', 'stage'], watch: ['nm', 'tag', 'next', 'bank'] };
  kbb.SORT_LABEL = { nm: '기관', tag: '구분', due: '마감까지', bank: '현 금고 은행', stage: '준비 단계', next: '다음 협약 종료' };
  kbb.sortBy = function (rows, key, dir) {
    const sign = dir === 'desc' ? -1 : 1;
    const byName = function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); };
    const val = {
      nm: function (r) { return r.name; },
      tag: function (r) { return r.tagCd === 'RETAIN' ? 0 : (r.tagCd === 'REGAIN' ? 1 : (r.tagCd === 'NEW' ? 2 : null)); },
      bank: function (r) { return r.bank && !r.bank.unknown ? r.bank.name : null; },
      stage: function (r) { return r.stage >= 0 ? r.stage : null; },
      next: function (r) { return r.nextDate || null; } };
    return (rows || []).slice().sort(function (a, b) {
      if (key === 'due') {
        // 마감 미상·입찰 종료 줄은 방향과 상관없이 맨 아래(다른 열과 같은 원칙, qa 11-17 P3-1). 둘 사이는 미상 → 입찰 종료.
        const ba = dueBottom(a), bb = dueBottom(b);
        if (ba !== bb) return ba ? 1 : -1;
        if (ba) return (rankOf(a) - rankOf(b)) || byName(a, b);
        return (sign * ((rankOf(a) - rankOf(b)) || (dueSigned(a.due) - dueSigned(b.due)))) || byName(a, b);
      }
      const f = val[key];
      if (!f) return byName(a, b);
      const x = f(a), y = f(b);
      if (x === null && y === null) return byName(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -sign : (x > y ? sign : 0)) || byName(a, b);
    });
  };
  // 표 거르기(규격 6-4). f = { q 기관명·지역, tag 'RETAIN'|'NEW', status, kind 'goal'|'out'(목표 탭만), stage 0~4(-1이면 끔) }.
  kbb.STATUS = {
    goal: [['', '상태 전체'], ['notice', '공고 중'], ['soon', '마감 ' + kbb.DEADLINE_SOON + '일 안'], ['late', '준비 지연'], ['hold', '판정 보류'], ['closed', '입찰 종료'], ['unk', '일정 모름'], ['pending', '결재 중'], ['carried', '자동 이월']],
    watch: [['', '상태 전체'], ['movable', '목표로 옮길 수 있음'], ['unk', '일정 모름'], ['carried', '자동 이월']] };
  kbb.STATUS_ONLY = { goal: ['notice', 'soon', 'late', 'hold', 'closed', 'unk', 'pending', 'carried'], watch: ['movable', 'unk', 'carried'] };
  function statusOk(r, s) {
    switch (s) {
      case 'notice': return !r.closed && (r.due.kind === 'fixed' || r.due.kind === 'open');
      case 'soon': return !r.closed && r.due.kind === 'fixed' && r.due.days <= kbb.DEADLINE_SOON;
      case 'late': return r.late === true;
      case 'hold': return r.hold === true;
      case 'closed': return !!r.closed;
      case 'pending': return r.pend === true;
      case 'carried': return r.carried === true;
      case 'movable': return r.movable > 0;
      case 'unk': return r.kind === 'WATCH' ? !r.nextDate : (!r.closed && r.due.kind === 'unk');
      default: return true;
    }
  }
  kbb.filterRows = function (rows, f) {
    f = f || {};
    const q = String(f.q == null ? '' : f.q).trim().toLowerCase();
    return (rows || []).filter(function (r) {
      if (q && String(r.name).toLowerCase().indexOf(q) < 0 && String(r.regionName).toLowerCase().indexOf(q) < 0) return false;
      if (f.tag && r.tagCd !== f.tag) return false;
      if (f.kind === 'goal' && r.out) return false;
      if (f.kind === 'out' && !r.out) return false;
      if (typeof f.stage === 'number' && f.stage >= 0 && r.stage !== f.stage) return false;
      return !f.status || statusOk(r, f.status);
    });
  };
  kbb.filterOn = function (f) { f = f || {}; return !!(String(f.q || '').trim() || f.tag || f.status || f.kind || (typeof f.stage === 'number' && f.stage >= 0)); };
  // 제안 진행 단계별 줄 수(규격 6-3): 표 줄 모델(목표 줄 + 목표 밖 준비 줄)의 r.stage로 센다 — 버튼의 수 = 그 단계로 거르면 표에 남는 줄 수.
  kbb.stageCounts = function (rows) {
    const c = [0, 0, 0, 0, 0];
    (rows || []).forEach(function (r) { if (r.stage >= 0 && r.stage < 5) c[r.stage] += 1; });
    return c;
  };
  // 협약 종료(다음 입찰 자리) — 관심 기관 줄(규격 6-7). 출처 순서(planner 3-1): next_term_to(039 약정) → 행안부 금고지정 끝(끝나지 않은 줄) → 기관 자료 다음 입찰 예정일(오늘 이후만) → 모름.
  kbb.NEXT_SRC = { contract: '약정', lofin: '행안부', inst: '기관 자료' };
  kbb.nextEnd = function (rec, termTo, o) {
    o = o || {};
    const d0 = kbb.normDate(termTo), today = isoOf(o.today);
    if (d0) return { date: d0, src: 'contract' };
    if (rec) {
      const pick = dash.lofinLines(rec, o.lofin, o.today).filter(function (l) { return !l.expired && kbb.normDate(l.end); })[0];
      if (pick) return { date: kbb.normDate(pick.end), src: 'lofin' };
      const it = dash.itemForRec(rec, o.today), bd = it && !it.unknown && !it.notice ? kbb.normDate(it.date) : '';
      if (bd && bd >= today) return { date: bd, src: 'inst' };
    }
    return { date: '', src: '' };
  };
  // [목표로 옮기기]를 보일 연도: 다음 협약 종료 연도가 선택 가능 연도(올해~+2) 안이면 그 연도, 아니면 0(팀 결정 11-17).
  kbb.moveYear = function (date, years) {
    const y = Number(String(date || '').slice(0, 4));
    return y && (years || []).some(function (x) { return Number(x) === y; }) ? y : 0;
  };
  // 서버가 준 올해 입찰 종료 근거(bid_closed·409 basis) → { cd, date } | null. 모르는 코드는 버린다(화면이 근거를 지어내지 않는다).
  const BASIS_CD = { NOTICE_CLOSED: 1, NOTICE_NO_BID: 1, CONTRACT_DECIDED: 1 };
  kbb.closedOf = function (b) {
    if (!b || typeof b !== 'object' || !Object.prototype.hasOwnProperty.call(BASIS_CD, b.basis_cd)) return null;
    const s = String(b.basis_date == null ? '' : b.basis_date).slice(0, 10);
    return { cd: b.basis_cd, date: isDay(s) ? s : '' };
  };
  // 근거 문구는 고정 문장만(서버 글을 화면에 내보이지 않는다 — 코드·날짜만 쓴다).
  kbb.basisText = function (b) {
    if (!b) return '';
    const dt = b.date ? b.date + ' ' : '';
    if (b.cd === 'NOTICE_NO_BID') return '입찰 공고 현황 ' + dt + '입찰 없음';
    if (b.cd === 'CONTRACT_DECIDED') return '금고 약정 ' + dt + '시작 약정이 이미 정해져 있음';
    return '입찰 공고 현황 ' + dt + '공고 종료';
  };
  // 검색 단계 미리 주의(서버 409와 같은 규칙, backend-dev a265a2ad 3-11): /notice-rounds/current(noticerec.snap) 항목이 올해 판정이고 CLOSED·NO_BID(또는 round_closed)이면 공고 종료·입찰 없음,
  // 039 요약에 시작 전 약정(term_from이 오늘 뒤)이 있으면 약정 확정. 없으면 null. snap = { byId }.
  // 시작 전 약정 줄: sum.lines_next(서버가 곧 추가할 시작 전 줄 배열, 없으면 무시) + 기존 sum.lines_now의 미래 시작 줄(호환). 시작일 빠른 순(날짜 없는 줄은 뒤).
  kbb.nextLines = function (sum, today) {
    const t = isoOf(today), out = [];
    if (sum && Array.isArray(sum.lines_next)) sum.lines_next.forEach(function (l) { const f = l && kbb.normDate(l.term_from); if (l && (!f || f > t)) out.push(l); });
    if (sum && Array.isArray(sum.lines_now)) sum.lines_now.forEach(function (l) { const f = l && kbb.normDate(l.term_from); if (f && f > t) out.push(l); });
    const key = function (l) { return kbb.normDate(l.term_from) || '9999-99-99'; };
    return out.sort(function (a, b) { return key(a) < key(b) ? -1 : (key(a) > key(b) ? 1 : 0); });
  };
  kbb.closedBasis = function (id, snap, today, sum) {
    const t = isoOf(today), ty = t.slice(0, 4), it = snap && snap.byId ? snap.byId[id] : null;
    if (it && String(it.handled_at || '').slice(0, 4) === ty && (it.status_cd === 'CLOSED' || it.status_cd === 'NO_BID' || it.round_closed === true)) {
      const s = String(it.handled_at).slice(0, 10);
      return { cd: it.status_cd === 'NO_BID' || it.close_reason_cd === 'NO_BID' ? 'NOTICE_NO_BID' : 'NOTICE_CLOSED', date: isDay(s) ? s : '' };
    }
    const fut = kbb.nextLines(sum, today).filter(function (l) { return kbb.normDate(l.term_from); })[0];
    return fut ? { cd: 'CONTRACT_DECIDED', date: kbb.normDate(fut.term_from) } : null;
  };
  // 화면만 아는 근거(서버가 막지 않는다 — 주의만): 행안부 금고지정에 이미 시작 전 약정이 따로 있거나, 기관 자료의 다음 입찰 예정이 올해 뒤로 넘어간 경우. → { year, src } | null
  kbb.SCREEN_SRC = { lofin: '행안부 금고지정', inst: '기관 자료' };
  kbb.screenNote = function (rec, o) {
    o = o || {};
    if (!rec) return null;
    const t = isoOf(o.today), ty = Number(t.slice(0, 4));
    const fut = dash.lofinLines(rec, o.lofin, o.today).filter(function (l) { const s = kbb.normDate(l.start); return s && s > t && kbb.normDate(l.end); })[0];
    if (fut) return { year: Number(kbb.normDate(fut.end).slice(0, 4)), src: 'lofin' };
    const it = dash.itemForRec(rec, o.today), bd = it && !it.unknown && !it.notice ? kbb.normDate(it.date) : '';
    if (bd && Number(bd.slice(0, 4)) > ty) return { year: Number(bd.slice(0, 4)), src: 'inst' };
    return null;
  };
  kbb.screenNoteText = function (n) { return n ? '다음 입찰 예정이 이미 다음 회차(' + n.year + ')로 넘어갔습니다(근거: ' + kbb.SCREEN_SRC[n.src] + '). 올해 목표로 넣기 전에 확인하세요.' : ''; };
  kbb.screenRowTitle = function (n) { const l = n ? kbb.SCREEN_SRC[n.src] : ''; return n ? l + josaRo(l) + '는 다음 회차(' + n.year + ')로 넘어갔습니다 — 입찰 공고 현황에서 확인하세요' : ''; };
  kbb.dueHtml = function (d) {
    const n = d.days;
    switch (d.kind) {
      case 'fixed': return '<b class="hb-dd' + (n <= kbb.DEADLINE_SOON ? ' hot' : '') + '">' + dText(n) + '</b><span class="hb-q">마감</span>';
      case 'closed': return '<b class="hb-dd tx">마감 지남</b>';
      case 'open': return '<b class="hb-dd tx">공고 중</b><span class="hb-q">마감 미상</span>';
      case 'over': return '<b class="hb-dd est">D+' + n + '</b><span class="hb-q">' + (d.est ? '추정 지남' : '지남') + '</span>';
      case 'plan': return '<b class="hb-dd">' + dText(n) + '</b><span class="hb-q">공고일</span>';
      case 'est': return '<b class="hb-dd est">' + dText(n) + '</b><span class="hb-q">추정</span>';
      default: return '<b class="hb-dd est tx">미상</b>';
    }
  };
  // 12개월 레인 칸(그림은 aria-hidden, 같은 칸에 읽기용 문장). win = kbb.laneWindow 결과.
  kbb.laneCellHtml = function (d, win) {
    let g = null, cls = 'w', sr = '입찰 예정일 자료 없음', est = false;
    const day = function (s) { return esc(String(s || '').slice(0, 10)); }, mon = function (s) { return esc(String(s || '').slice(0, 7)); };
    switch (d.kind) {
      case 'fixed': g = kbb.laneGeom(d.from, d.to, false, win); if (d.days <= kbb.DEADLINE_SOON) cls += ' hot';
        sr = (d.from ? '공고 ' + day(d.from) + '부터 ' : '') + '접수 마감 ' + day(d.to) + '까지'; break;
      case 'closed': g = kbb.laneGeom(d.from, d.to, false, win); sr = '접수 마감 ' + day(d.to) + ' 지남'; break;
      case 'open': g = kbb.laneGeom(d.from, '', false, win); cls += ' op'; sr = '공고 ' + day(d.from) + ', 접수 마감일 미확인'; break;   // op = 오른쪽 끝을 점선으로 열고 접수 마감 눈금을 그리지 않는다(마감일 모름)
      case 'plan': g = kbb.laneGeom(d.date, d.date, false, win); cls += ' pl'; sr = '공고 예정 ' + day(d.date); break;                 // pl = 공고 예정일 하루 — 접수 마감 눈금 없음
      case 'est': g = kbb.laneGeom(d.date, d.date, true, win); est = true; cls += ' est'; sr = '추정 공고 ' + mon(d.date); break;
      case 'over': est = d.est; g = kbb.laneGeom(d.date, d.date, d.est, win); if (d.est) cls += ' est'; sr = (d.est ? '추정 ' : '') + '공고 예정 ' + (d.est ? mon(d.date) : day(d.date)) + ' 지남'; break;
      default: break;
    }
    let inner = win.nowPct !== null && win.nowPct !== undefined ? '<span class="cur"></span><span class="now" style="left:' + win.nowPct + '%"></span>' : '';
    if (!g) inner += '<span class="unk">입찰 예정일 자료 없음</span>';
    else if (g.off === 'after') {
      const dt = d.date || d.from || d.to;
      inner += '<span class="off">' + mon(dt) + (est ? ' 추정' : '') + ' · 목표 연도 밖 →</span>'; sr = (est ? '추정 공고 ' : '공고 ') + mon(dt) + ', 12개월 밖';
    } else if (g.off === 'before') {
      inner += '<span class="unk before">' + (est ? '← 추정일 지남' : '← 일정 지남') + '</span>';
    } else inner += '<span class="' + cls + '" style="left:' + g.left + '%;width:' + g.width + '%"></span>';
    return '<div class="hb-lane" aria-hidden="true">' + inner + '</div><span class="sr-only">' + sr + '</span>';
  };

  // 현 금고 은행. sum = 039 요약({kb_now,last_kb_year,lines_now:[{rank_cd,bank_name,term_to}]}). 줄이 없으면 행안부 금고지정 → 레코드 bank 칸 → 확인 안 됨.
  kbb.bankInfo = function (sum, rec, o) {
    o = o || {};
    const lines = sum && Array.isArray(sum.lines_now) ? sum.lines_now : [];
    if (lines.length) {
      const p = lines.filter(function (l) { return l && (l.rank_cd === 'FIRST' || l.rank_cd === 'SINGLE'); })[0] || lines[0];
      return { name: String(p.bank_name || ''), rank: RANK_TEXT[p.rank_cd] || '', more: lines.length - 1, kb: /국민/.test(p.bank_name || ''), end: kbb.normDate(p.term_to), unknown: false };
    }
    const lo = dash.lofinLines(rec, o.lofin, o.today).filter(function (l) { return !l.expired; });
    if (lo.length) return { name: lo[0].bank, rank: RANK_TEXT[lo[0].cmp] || '', more: 0, kb: /국민/.test(lo[0].bank), end: kbb.normDate(lo[0].end), unknown: false };
    if (rec && String(rec.bank || '').trim()) return { name: String(rec.bank), rank: '', more: 0, kb: /국민/.test(rec.bank), end: '', unknown: false };
    return { name: '', rank: '', more: 0, kb: false, end: '', unknown: true };
  };
  kbb.bankCellHtml = function (b) {
    if (b.unknown) return '<td class="hb-bank mut">확인 안 됨</td>';
    return '<td class="hb-bank">' + esc(b.name) + (b.rank ? '<span class="r">' + esc(b.rank) + '</span>' : '') + (b.more ? '<span class="r">외 ' + b.more + '</span>' : '') + '</td>';
  };
  // /bank-contracts/summary의 직접 입력 금고 약정 → kbboard의 endOpts().direct({ 'region|name': 'YYYY-MM-DD' }). 국민은행 줄의 term_to만 쓴다.
  kbb.directEnds = function (sumById, byInst) {
    const out = {};
    Object.keys(sumById || {}).forEach(function (id) {
      const rec = byInst && byInst[id], s = sumById[id];
      if (!rec || !s || !Array.isArray(s.lines_now)) return;
      const kb = s.lines_now.filter(function (l) { return l && /국민/.test(l.bank_name || '') && kbb.normDate(l.term_to); })[0];
      if (kb) out[logic.instKey(rec)] = kbb.normDate(kb.term_to);
    });
    return out;
  };

  // 목표(또는 목표 밖 제안 준비) 한 줄의 모델. t = /bid-targets 항목 모양 { institution_id, institution_name, region_code, target_no, rev_no, target_year, tag_cd, tag_name, memo, … }.
  // ctx = { byInst:{id→rec}, sumById, today:Date, verified, lofin, entries:{id→prepEntry}, prepOk, delayDays, actOf(rec)→act, snap(noticerec.snap — 목표 밖 줄의 올해 입찰 종료 근거), year(보고 있는 목표 연도 — 올해가 아니면 목표 밖 줄의 closed는 null, 없으면 거르지 않음) }
  kbb.goalRow = function (t, ctx, out) {
    const id = String(t.institution_id || t.institutionId || '');
    const rec = (ctx.byInst && ctx.byInst[id]) || null;
    const it = rec ? dash.itemForRec(rec, ctx.today) : null;
    const sum = t.bank && typeof t.bank === 'object' ? t.bank : ((ctx.sumById && ctx.sumById[id]) || null);
    const due = kbb.dueOf(it), e = ctx.entries && ctx.entries[id], stage = e ? e.stage : -1, key = rec ? logic.instKey(rec) : '';
    const ty = ctx.today instanceof Date ? ctx.today.getFullYear() : new Date().getFullYear();   // '예전' = 올해보다 앞선 해
    const lastKb = kbb.formerKbYear(sum, ty);
    const r = { id: id, key: key, fkey: key || ('id:' + id), rec: rec, it: it, out: !!out, name: (rec && rec.name) || String(t.institution_name || ''),
      regionName: dash.regionName((rec && rec.region) || t.region_code || ''),
      targetNo: t.target_no, revNo: t.rev_no, targetYear: t.target_year, tagCd: t.tag_cd || '', tagName: t.tag_name || kbb.TAG[t.tag_cd] || '',
      memo: String(t.memo || ''), ownerEmpNo: t.owner_emp_no || '', editorName: String(t.editor_name || ''), firstEditor: String(t.first_editor_name || ''),
      savedAt: String(t.saved_at || ''), empVerified: t.emp_verified === true, canCancel: !!t.can_cancel,
      due: due, bank: kbb.bankInfo(sum, rec, { lofin: ctx.lofin, today: ctx.today }),
      prevYear: lastKb,   // 올해 이후(미래 약정 포함)는 칩이 붙지 않는다. NaN도 0(formerKbYear)
      stage: stage, stageLabel: stage >= 0 ? ((dash.STAGES[stage] || {}).label || '') : '',
      act: stage >= 0 ? 'open' : (rec && ctx.actOf ? ctx.actOf(rec) : ''), late: null, hold: null,
      kind: t.kind_cd === 'WATCH' ? 'WATCH' : 'GOAL', closed: out ? (!(Number(ctx.year) > 0) || Number(ctx.year) === ty ? kbb.closedBasis(id, ctx.snap, ctx.today, sum) : null) : kbb.closedOf(t.bid_closed), next: null, nextDate: '', movable: 0, note: null };
    // NEXT 105: 결재 중 잠금·자동 이월·달성 판정일·협약 개시일(서버 GET /bid-targets 항목 키). 목표 밖 줄(out)은 해당 없음. 상세(change_pending_info)는 쓰기 자격자에게만 온다.
    const pi = !out && t.change_pending_info && typeof t.change_pending_info === 'object' ? t.change_pending_info : null;
    r.ownerName = String(t.owner_name || ''); r.pend = !out && t.change_pending === true;
    r.pendInfo = r.pend && pi ? { reqId: pi.req_id, op: String(pi.op_cd || ''), by: String(pi.requested_by_name || ''), at: String(pi.created_at || '') } : null;
    r.carried = !out && t.carried === true; r.carryBasis = String(t.carry_basis_cd || ''); r.carryFromYear = 0;   // 응답이 원천 연도를 주지 않는다(백엔드 이관)
    r.judgeFrom = kbb.normDate(t.judge_from); r.judgeAssumed = t.judge_from_assumed === true; r.termStart = kbb.normDate(t.term_start); r.termRevNo = Number(t.term_rev_no) || 0;
    if (r.kind === 'WATCH') {   // 관심 기관: 연도 없음. 다음 협약 종료(출처 순서는 nextEnd)와 [목표로 옮기기] 조건
      r.targetYear = null;
      r.next = kbb.nextEnd(rec, t.next_term_to, { lofin: ctx.lofin, today: ctx.today });
      r.nextDate = r.next.date;
      r.movable = kbb.moveYear(r.nextDate, ctx.years);
    } else if (!out && !r.closed && due.kind === 'over') r.note = kbb.screenNote(rec, { lofin: ctx.lofin, today: ctx.today });   // 화면만 아는 근거 — 줄 title에만
    if (ctx.prepOk) {
      // 지연 = 확정 마감이 기준일 안인데 제안서 작성 전. 추정일만 있으면 판정 보류(규격 6-A).
      const dl = ctx.delayDays || kbb.DELAY_DEFAULT, writing = stage === 4;
      if (due.kind === 'fixed') { r.late = due.days <= dl && !writing; r.hold = false; }
      else {
        r.late = false;
        r.hold = !writing && (due.kind === 'over' || due.kind === 'open' || ((due.kind === 'est' || due.kind === 'plan') && due.days <= dl));
      }
      if (r.closed || r.kind === 'WATCH') { r.late = false; r.hold = false; }   // 올해 입찰이 끝난 줄·관심 기관은 지연도 보류도 아니다(규격 6-6)
    }
    return r;
  };
  kbb.goalRows = function (targets, ctx) { return (targets || []).map(function (t) { return kbb.goalRow(t, ctx, false); }); };
  // 목표 밖에서 제안을 준비 중인 기관: prepRows 결과 중 목표에 없는 기관. taken = { institutionId: true }.
  kbb.outRows = function (prepRows, taken, ctx) {
    return (prepRows || []).filter(function (p) { return p.institutionId && !(taken && taken[String(p.institutionId)]); }).map(function (p) {
      return kbb.goalRow({ institution_id: p.institutionId, institution_name: p.name }, ctx, true);
    });
  };
  // 빈 상태 후보: 협약 1년 안 종료이면서 '국민은행 확정'·협약 예정이 아닌 곳, 이미 목표인 곳 제외(기획 이관 기본값 — 팀 결정 11-17).
  kbb.emptyCandidates = function (g, taken, verified) {
    const out = [];
    ((g && g.soon) || []).forEach(function (it) {
      const id = String(it.rec && it.rec.institutionId || '');
      if (!id || (taken && taken[id])) return;
      if (kbb.staysText(it.rec, verified)) return;
      out.push({ id: id, key: it.key, rec: it.rec, name: it.name, region: it.region, endDate: it.endDate || '' });
    });
    return out;
  };

  // 요약 띠 모델
  kbb.bankBars = function (rows) {
    const cnt = {}, order = [];
    let unk = 0;
    (rows || []).forEach(function (r) {
      if (r.bank.unknown) { unk += 1; return; }
      if (!Object.prototype.hasOwnProperty.call(cnt, r.bank.name)) { cnt[r.bank.name] = 0; order.push(r.bank.name); }
      cnt[r.bank.name] += 1;
    });
    let list = order.map(function (k) { return { label: k, n: cnt[k], kb: /국민/.test(k) }; });
    list.sort(function (a, b) { return (Number(b.kb) - Number(a.kb)) || (b.n - a.n) || (a.label < b.label ? -1 : (a.label > b.label ? 1 : 0)); });
    if (list.length > 3) { const rest = list.slice(3).reduce(function (s, x) { return s + x.n; }, 0); list = list.slice(0, 3); list.push({ label: '그 밖', n: rest, kb: false }); }
    if (unk) list.push({ label: '확인 안 됨', n: unk, kb: false, unknown: true });
    return list;
  };
  // prepOk가 아니면(제안 진행 자료를 못 받음) 지연·보류는 null — 판정하지 않는다.
  kbb.bandModel = function (rows, o) {
    o = o || {};
    const b = { n: rows.length, retain: 0, regain: 0, fresh: 0, soon: 0, delay: null, hold: null, delayDays: o.delayDays || kbb.DELAY_DEFAULT, bars: [] };
    rows.forEach(function (r) {
      if (r.tagCd === 'RETAIN') b.retain += 1; else if (r.tagCd === 'REGAIN') b.regain += 1; else if (r.tagCd === 'NEW') b.fresh += 1;
      if (!r.closed && r.due.kind === 'fixed' && r.due.days <= kbb.DEADLINE_SOON) b.soon += 1;
    });
    if (o.prepOk) { b.delay = rows.filter(function (r) { return r.late === true; }).length; b.hold = rows.filter(function (r) { return r.hold === true; }).length; }
    b.bars = kbb.bankBars(rows);
    return b;
  };
  // 준비 지연 칸 보조 줄: 제안 진행 자료를 못 받았을 때 이유를 가른다(qa 11-17 P2-1 — 오류와 권한 없음을 같은 말로 하지 않는다).
  kbb.BAND_MSG = {
    none: '목표 기관을 넣으면 셉니다',
    banks0: '목표 기관을 넣으면 은행별로 셉니다',
    noPrep: '제안 진행 자료가 없어 판정하지 않습니다',
    denied: '이 계정은 제안 진행을 볼 수 없어 판정하지 않습니다',
    login: '로그인이 필요해 판정하지 않습니다',
    error: '제안 진행 자료를 불러오지 못해 판정하지 않습니다' };
  // 제안 진행 자료를 못 받은 이유 한 줄(띠 '준비 지연' 칸과 '제안 진행' 줄이 같은 말을 쓴다).
  kbb.prepWhy = function (prep, code) {
    const M = kbb.BAND_MSG;
    if (prep === 'denied') return Number(code) === 401 ? M.login : M.denied;
    return prep === 'error' ? M.error : M.noPrep;
  };
  // v = { year, loaded(목표 기관을 받았는가), prep('denied'|'error'|그 밖(없음·받는 중·서버 없음)), prepCode }. 받기 전에는 값 자리에 '—'.
  kbb.bandHtml = function (b, v) {
    const dash2 = '—', y = esc(v.year), ld = !!v.loaded;
    const big = function (n, hot) { return '<span class="v' + (hot && n > 0 ? ' hot' : '') + '">' + n + '<span>곳</span></span>'; };
    const k1 = '<div class="hb-k"><span class="l">' + y + ' 목표 기관</span>' + (ld ? big(b.n, false) : '<span class="v">' + dash2 + '</span>') +
      '<span class="s">' + (ld ? '<span class="nw">재유치 <b>' + b.retain + '</b></span> · <span class="nw">되찾기 <b>' + b.regain + '</b></span> · <span class="nw">신규 <b>' + b.fresh + '</b></span>' : '&nbsp;') + '</span></div>';
    const k2 = '<div class="hb-k"><span class="l">접수 마감 ' + kbb.DEADLINE_SOON + '일 안</span>' + (ld ? big(b.soon, true) : '<span class="v">' + dash2 + '</span>') +
      '<span class="s">공고로 확정된 마감일만 셉니다</span></div>';
    const M = kbb.BAND_MSG, none = ld && b.n === 0;
    let v3;
    if (!ld || none || b.delay === null) v3 = '<span class="v">' + dash2 + '</span>';
    else v3 = b.delay > 0 ? big(b.delay, true) : '<span class="v">없음</span>';
    const why3 = kbb.prepWhy(v.prep, v.prepCode);
    const s3 = !ld ? '&nbsp;' : (none ? M.none : (b.delay === null ? why3
      : '마감 ' + b.delayDays + '일 안인데 제안서 작성 전' + (b.hold ? '<br>판정 보류 <b>' + b.hold + '</b>곳 — 마감일이 확정되지 않은 곳' : '')));
    const k3 = '<div class="hb-k"><span class="l">준비 지연</span>' + v3 + '<span class="s">' + s3 + '</span></div>';
    let k4 = '<div class="hb-k"><span class="l">목표 기관의 현 금고 은행</span>';
    if (!ld || !b.bars.length) k4 += '<span class="v">' + dash2 + '</span>' + (ld ? '<span class="s">' + M.banks0 + '</span>' : '');
    else {
      const max = b.bars.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
      // 4줄 이상이면 2단 격자(띠가 커져 아래 구획이 화면 밖으로 밀리지 않게 — design 11-17 P2-2). 빈 막대 칸은 읽지 않고, 숫자 뒤에 '곳'을 읽기용으로 붙인다.
      k4 += '<dl class="hb-bk' + (b.bars.length > 3 ? ' two' : '') + '">' + b.bars.map(function (x) {
        return '<dt>' + esc(String(x.label).replace(/은행$/, '')) + '</dt><dd class="tr" aria-hidden="true"><span class="bar' + (x.kb ? ' k' : '') + '" style="width:' + Math.round(x.n / max * 100) + '%"></span></dd><dd class="ct"><b>' + x.n + '</b><span class="sr-only">곳</span></dd>';
      }).join('') + '</dl>';
    }
    return k1 + k2 + k3 + k4 + '</div>';
  };
  // 요약 띠 둘째 줄 '제안 진행'(규격 6-3). counts = kbb.stageCounts(표 줄 모델), o = { ok(제안 진행 자료를 받았는가), active(눌린 단계 0~4, 없으면 -1), why(받지 못한 이유 글), nOut(목표 밖 줄 수), outCounts(그 줄들의 단계별 수) }.
  // 0곳 단계는 disabled, 받지 못했으면 다섯 칸 모두 disabled·수 자리 '—'. 막대 폭 --p는 0~1 숫자만(마크업에서 숫자로 만든다).
  kbb.stagesHtml = function (counts, o) {
    o = o || {};
    const c = counts || [0, 0, 0, 0, 0], max = Math.max.apply(null, c.concat([0]));
    const nOut = o.ok ? Math.max(0, Number(o.nOut) || 0) : 0, oc = o.outCounts || [];   // 목표 밖 줄 수(자료를 못 받았으면 0 — 오류 문장만 둔다)
    const btns = dash.STAGES.map(function (s, i) {
      const n = Number(c[i]) || 0, on = o.ok && o.active === i, nm = esc(s.label), no = nOut > 0 ? Number(oc[i]) || 0 : 0;
      const head = '<span class="no">' + (i + 1) + '</span><span class="nm">' + nm + '</span>';
      if (!o.ok) return '<button type="button" class="hb-sb" data-stage="' + i + '" disabled>' + head + '<span class="ct">—</span></button>';
      const p = max > 0 ? Math.round(n / max * 100) / 100 : 0;
      return '<button type="button" class="hb-sb" data-stage="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (n === 0 ? ' disabled' : '') + ' style="--p:' + p + '"' +
        ' aria-label="' + nm + ' ' + n + '곳' + (no > 0 ? '(그 밖의 준비 기관 ' + no + '곳)' : '') + ' — ' + (on ? '거르기 끄기' : '표를 이 단계로 거르기') + '">' + head + '<span class="ct">' + n + '</span></button>';
    }).join('');
    const inc = nOut > 0 ? '그 밖의 제안서 준비 중인 기관 ' + nOut + '곳 포함' : '';
    return '<div class="hb-stgs" role="group" aria-label="제안 진행 단계' + (inc ? ', ' + inc : '') + '"><span class="l">제안 진행</span>' + btns +
      (inc ? '<span class="why">' + inc + '</span>' : (o.ok || !o.why ? '' : '<span class="why">' + esc(o.why) + '</span>')) + '</div>';
  };

  // 표 행(규격 6-C). r = goalRow 결과, o = { win, canEdit }
  const CHEV = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3l2.5 2.5L6.5 3"/></svg>';
  function tagCellHtml(r, o) {
    if (r.out) {
      return '<td>' + (o.canEdit ? '<button type="button" class="hb-tag add" data-act="add" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-label="' + esc(r.name) + ' 목표에 넣기">목표에 넣기</button>'
        : '<span class="hb-tag ro">목표 아님</span>') + '</td>';
    }
    if (r.pend) return tc.pendCellHtml(r, { canEdit: o.canEdit });   // 결재 중: 구분 칩·메뉴 대신 잠금 칩(NEXT 105 6-2)
    const nm = esc(r.tagName || r.tagCd);
    // 넣은 사람·고친 사람·메모는 서버 글 — 전부 이스케이프. 사번 확인 안 된 기록은 '확인됨'처럼 보이지 않게 '사번 자기신고'를 밝힌다.
    const tip = [r.memo ? '메모: ' + r.memo : '', r.firstEditor ? '넣은 사람 ' + r.firstEditor : '',
      r.editorName ? '마지막 고침 ' + r.editorName + (r.empVerified ? '' : '(사번 자기신고)') + (r.savedAt ? ' ' + r.savedAt.slice(0, 16).replace('T', ' ') : '') : ''].concat(tc.rowTips(r)).filter(Boolean).join(' · ');
    const prev = r.tagCd === 'NEW' && r.prevYear ? (r.carried ? '' : '<span class="hb-q hb-prev" title="되찾기 후보 — 예전에 국민은행 금고였던 기관(마지막 ' + r.prevYear + '년)">되찾기</span>') + (r.carried ? '' : '<span class="sr-only"> 되찾기 후보, 예전 국민은행 금고, 마지막 ' + r.prevYear + '년</span>') : '';   // 이월 줄은 rowTips 문장이 같은 말을 읽어 준다(두 번 읽지 않게)
    const chip = o.canEdit
      ? '<button type="button" class="hb-tag" data-act="tag" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="menu" aria-expanded="false"><span class="sr-only">구분: </span>' + nm + CHEV + '</button>'
      : '<span class="hb-tag ro"><span class="sr-only">구분: </span>' + nm + '</span>';
    return '<td' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + chip + (r.carried ? '<span class="hb-q">이월</span>' : '') + prev + (tip ? '<span class="sr-only">. ' + esc(tip) + '</span>' : '') + '</td>';
  }
  function stageCellHtml(r) {
    const late = r.late ? '<span class="hb-late">지연</span>' : '';
    if (r.stage >= 0) {
      const n = r.stage + 1;
      return '<td><span class="hb-stg"><span class="lb" title="' + esc(r.stageLabel) + '">' + esc(r.stageLabel) + '</span><span class="hb-pg" aria-hidden="true"><i style="width:' + (n * 20) + '%"></i></span><span class="n">' + n + '/5</span>' + late + '</span></td>';
    }
    let inner = r.act === 'later' ? '<span class="mut">공고 전</span>' : kbb.actHtml(r.act, { name: r.name, key: r.key });
    if (!inner) inner = '<span class="mut" aria-hidden="true">—</span><span class="sr-only">제안 진행 정보 없음</span>';
    return '<td><span class="hb-stg">' + inner + late + '</span></td>';
  }
  kbb.goalRowHtml = function (r, o) {
    const rg = '<span class="rg">' + esc(r.regionName) + '</span>';
    const nm = r.rec
      ? '<button type="button" class="hb-nm" data-key="' + esc(r.key) + '" data-inst="' + esc(r.id) + '" aria-haspopup="dialog">' + rg + esc(r.name) + '</button>'
      : '<span class="hb-nm">' + rg + esc(r.name) + '</span>';
    // 마감까지 칸: 올해 입찰이 끝난 줄(서버 근거)은 '입찰 종료' muted 글자 + 근거(title·sr). 화면만 아는 근거는 판정을 바꾸지 않고 title만 더한다(규격 6-6).
    let due = kbb.dueHtml(r.due), dueAttr = '';
    if (r.closed) {
      const why = '근거: ' + kbb.basisText(r.closed);
      due = '<b class="hb-dd tx end">입찰 종료</b><span class="sr-only">' + esc(why) + '</span>'; dueAttr = ' title="' + esc(why) + '"';
    } else if (r.note) { const tt = kbb.screenRowTitle(r.note); dueAttr = ' title="' + esc(tt) + '"'; due += '<span class="sr-only">' + esc(tt) + '</span>'; }
    const lane = r.closed ? (r.out ? closedOutLaneHtml() : closedActsHtml(r, o)) : kbb.laneCellHtml(r.due, o.win);
    // 동작 단추(.hb-acts)를 그리는 줄에는 has-acts — 단추가 비어 있는 설명회 칸까지 넘쳐 나가게(CSS가 이 클래스로 칸 잘림을 푼다, 실사용 버그 11-23)
    let trCls = tc.rowClass(r, o);
    if (lane.indexOf('hb-acts') >= 0) trCls = trCls ? trCls.replace(/"$/, ' has-acts"') : ' class="has-acts"';
    return '<tr' + trCls + '>' + (o.selCol ? tc.ckCellHtml(r, o) : '') + '<th scope="row">' + nm + '</th>' + tagCellHtml(r, o) + '<td' + dueAttr + '>' + due + '</td>' + kbb.bankCellHtml(r.bank) + stageCellHtml(r) +
      '<td class="mut"><span aria-hidden="true">—</span><span class="sr-only">설명회 기록 없음</span></td><td class="ln">' + lane + '</td></tr>';
  };
  // 목표 밖 준비 줄이 올해 입찰 종료이면 12개월 칸: 옮길 목표가 없으니 버튼 없이 사실만(그림 + 같은 뜻의 sr-only 문장, design 11-19 A).
  function closedOutLaneHtml() {
    return '<div class="hb-lane" aria-hidden="true"><span class="unk">올해 입찰 끝남</span></div><span class="sr-only">올해 입찰이 끝난 기관</span>';
  }
  // 입찰 종료 줄의 12개월 칸: 그림 대신 동작 버튼 둘(aria-hidden 그림 밖). 1279px 이하에서 이 칸이 숨으면 같은 동작을 구분 메뉴가 준다. 보기 전용은 버튼 없음.
  function closedActsHtml(r, o) {
    if (!o.canEdit || r.pend) return '<span class="sr-only">올해 입찰이 끝난 기관</span>';   // 결재 중인 줄은 동작 단추를 그리지 않는다
    const a = function (act, label, aria) {
      return '<button type="button" class="hb-tag" data-act="' + act + '" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="dialog" aria-label="' + esc(r.name) + ' ' + aria + '">' + label + '</button>';
    };
    return '<div class="hb-acts">' + (o.noWatch ? '' : a('towatch', '관심 기관으로…', '관심 기관으로 옮기기')) + a('tonext', '다음 회차 목표로…', '다음 회차 목표로 옮기기') + '</div>';
  }
  // 관심 기관 한 줄(규격 6-7): 기관 · 구분 · 다음 협약 종료(+출처) · 현 금고 은행 · 메모 · 동작. r = goalRow(kind WATCH), o = { canEdit }
  kbb.watchRowHtml = function (r, o) {
    const rg = '<span class="rg">' + esc(r.regionName) + '</span>';
    const nm = r.rec
      ? '<button type="button" class="hb-nm" data-key="' + esc(r.key) + '" data-inst="' + esc(r.id) + '" aria-haspopup="dialog">' + rg + esc(r.name) + '</button>'
      : '<span class="hb-nm">' + rg + esc(r.name) + '</span>';
    const UNK = '다음 일정 모름 — 기관 정보에 새 협약 기간을 넣어 주세요';
    const nx = r.nextDate
      ? '<b class="hb-nx">' + esc(r.nextDate.slice(0, 7)) + '</b><span class="hb-q">' + esc(kbb.NEXT_SRC[r.next.src] || '') + '</span>' + (r.movable ? '<span class="hb-q">2년 안</span>' : '')
      : '<span class="mut" title="' + esc(UNK) + '">일정 모름</span><span class="sr-only">' + esc(UNK) + '</span>';
    const memo = r.memo ? '<td class="mut" title="' + esc(r.memo) + '">' + esc(r.memo) + '</td>' : '<td class="mut"><span aria-hidden="true">—</span><span class="sr-only">메모 없음</span></td>';
    let act = '';
    if (r.movable) {
      if (o.canEdit && !r.pend) act = '<button type="button" class="hb-tag" data-act="togoal" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="dialog" aria-label="' + esc(r.name) + ' 목표로 옮기기">목표로 옮기기</button>';
    } else act = '<span class="sr-only">목표로 옮길 시기 아님</span>';
    return '<tr' + tc.rowClass(r, o) + '>' + (o.selCol ? tc.ckCellHtml(r, o) : '') + '<th scope="row">' + nm + '</th>' + tagCellHtml(r, o) + '<td>' + nx + '</td>' + kbb.bankCellHtml(r.bank) + memo + '<td>' + act + '</td></tr>';
  };

  kbb.GOAL_MSG = {
    loading: '목표 기관을 불러오는 중입니다…',
    offline: '목표 기관은 서버에 저장됩니다. 서버에 연결되면 보입니다.',
    denied: '목표 기관을 볼 권한이 없는 계정입니다. 관리자에게 권한을 요청하세요.',
    login: '로그인이 필요합니다. 다시 로그인하세요.',
    ro: '협약이 1년 안에 끝나는 기관은 아래 \'협약 중인 기관\'에서 봅니다.',   // 제목 줄이 '영업부서가 넣고 뺍니다'를 이미 말하므로 여기서는 다음 행동(design 11-17 P3-2)
    roTop: '보기 전용 — 목표 기관은 영업부서가 넣고 뺍니다.',
    noCand: '협약이 1년 안에 끝나는 기관이 없습니다. [목표 기관 추가]에서 기관을 찾아 넣으세요.' };
  kbb.goalErrHtml = function (code) {
    return '목표 기관을 불러오지 못했습니다(' + (code ? '오류 ' + Number(code) : '서버에 연결되지 않음') + '). <button type="button" id="hb-gretry">다시 시도</button>';
  };
  kbb.emptyHtml = function (v) {
    const y = esc(v.year);
    let h = '<h3 class="hb-eh">' + y + ' 목표 기관이 아직 없습니다</h3>';
    if (!v.canEdit) return h + '<p>' + esc(kbb.GOAL_MSG.ro) + '</p>';
    const groups = v.groups || kbb.candsToGroups(v.cands);
    if (!groups.length) return h + '<p>' + esc(kbb.GOAL_MSG.noCand) + '</p>';
    // 묶음 라디오 + 고른 묶음의 한 목록(design 11-24 A안). 비는 묶음은 뺀다. v.recTab = 고른 묶음 key(없거나 사라졌으면 첫 묶음), v.recAll = 펼침.
    const picked = groups.filter(function (g) { return g.key === v.recTab; })[0], cur = picked || groups[0];
    const recAll = picked || !v.recTab ? !!v.recAll : false;   // 고른 묶음이 사라져 첫 묶음으로 대체됐으면 펼침도 무시(qa 11-24 P3-2). 고른 적 없으면(기본 첫 묶음) 그대로
    const sub = kbb.REC_SUB[cur.key] || {};
    const lead = groups.length > 1 ? esc(sub.long || '') : esc(cur.label) + ' <b>' + cur.items.length + '</b>곳 · ' + esc(sub.short || '');
    const tabs = groups.length > 1
      ? '<fieldset class="db-per hb-rec-tabs"><legend class="sr-only">추천 묶음</legend>' + groups.map(function (g) {
        return '<label><input type="radio" name="hb-rec" id="hb-rec-' + esc(g.key) + '" value="' + esc(g.key) + '"' + (g === cur ? ' checked' : '') + ' aria-controls="hb-rec-list"><span>' + esc(g.label) + ' <b>' + g.items.length + '</b></span></label>';
      }).join('') + '</fieldset>'
      : '';
    const shown = recAll ? cur.items : cur.items.slice(0, kbb.CAND_MAX), rest = cur.items.length - shown.length;
    h += '<p>입찰이 가까운 기관부터 추천합니다. [목표에 넣기]를 누르면 기관을 채운 추가 창이 열립니다.</p><div class="hb-erec">' + tabs +
      '<p class="hb-rec-sub" id="hb-rec-sub">' + lead + '</p>' +
      '<ul class="hb-cand3" id="hb-rec-list" aria-labelledby="hb-rec-sub">' + shown.map(function (x) {
        return '<li><span class="hb-rec-w">' + esc(x.when || '') + '</span>' +
          '<button type="button" class="hb-nm" data-key="' + esc(x.key) + '" data-inst="' + esc(x.id) + '" aria-haspopup="dialog"><span class="rg">' + esc(dash.regionName(x.region)) + '</span>' + esc(x.name) + '</button>' +
          '<button type="button" class="hb-tag add" data-act="cand" data-inst="' + esc(x.id) + '" data-key="' + esc(x.key) + '" aria-label="' + esc(x.name) + ' 목표에 넣기">목표에 넣기</button></li>';
      }).join('') + '</ul>' +
      '<div class="hb-rec-foot">' + (rest > 0 ? '<button type="button" id="hb-rec-more" data-group="' + esc(cur.key) + '">' + rest + '곳 더 보기</button>' : '') +
      '<span>찾는 기관이 없으면 위 [목표 기관 추가]에서 찾습니다.</span></div></div>';
    return h;
  };
  // 묶음 아래 설명 줄. long = 묶음이 여럿일 때(정렬 사실 포함 — candGroups가 실제로 그 순서로 정렬한다), short = 묶음이 하나뿐일 때.
  kbb.REC_SUB = {
    notice: { long: '지금 공고가 나 있는 기관 · 접수 마감이 가까운 순', short: '지금 공고가 나 있는 기관' },
    plan: { long: '1년 안에 공고 날짜가 정해진 기관 · 날짜 순', short: '1년 안에 공고 날짜가 정해진 기관' },
    est: { long: '공고 시기를 짐작한 기관(확정 아님) · 시기 순', short: '공고 시기를 짐작한 기관(확정 아님)' },
    end: { long: '협약이 1년 안에 끝나는 기관 · 종료일 순', short: '협약이 1년 안에 끝나는 기관' } };
  // 빈 상태 후보 묶음(규격 6-8). m = dash.model 결과, taken = { institutionId: true }(목표·관심), g = kbb.groups 결과.
  // 공고 중 → 확정 공고 예정(1년 안) → 추정 공고 예정(1년 안, 지난 추정은 model이 뺀다) → 협약 1년 안 종료.
  kbb.CAND_MAX = 5;   // 처음 보이는 줄 수(design 11-24 A안, 한 줄 목록이라 묶음당 3줄에서 늘림)
  kbb.candGroups = function (m, taken, g, verified) {
    const idOk = function (it) { const id = String(it.rec && it.rec.institutionId || ''); return !!id && !(taken && taken[id]); };
    const mk = function (it, when) { return { id: String(it.rec.institutionId), key: it.key, rec: it.rec, name: it.name, region: it.region, when: when }; };
    const byName = function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); };
    // 공고 중: dash.model의 원래 순서(마감 전 → 마감일 미확인 → …)가 기준. 마감까지 일수가 둘 다 숫자일 때만 비교하고 아니면 원래 순서를 유지한다.
    const g1 = ((m && m.notice) || []).filter(function (it) { return idOk(it) && it.phase !== 'awaiting'; }).map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) {
      const x = a.it.deadlineDays, y = b.it.deadlineDays;
      return (typeof x === 'number' && typeof y === 'number' && x !== y) ? x - y : a.i - b.i;
    }).map(function (w) { return w.it; }).map(function (it) { return mk(it, it.phase === 'receiving' && typeof it.deadlineDays === 'number' ? '접수 마감 ' + dText(it.deadlineDays) : '공고 중'); });
    const up = ((m && m.upcoming) || []).filter(idOk);
    const byDate = function (a, b) { return (a.days - b.days || 0) || byName(a, b); };   // 날짜 순(남은 일수), 같으면 이름 순
    const g2 = up.filter(function (it) { return it.confidence === '확정'; }).sort(byDate).map(function (it) { return mk(it, '공고 예정 ' + String(it.date).slice(0, 10)); });
    const g3 = up.filter(function (it) { return it.confidence !== '확정'; }).sort(byDate).map(function (it) { return mk(it, '추정 ' + String(it.date).slice(0, 7)); });
    const g4 = kbb.emptyCandidates(g, taken, verified).sort(function (a, b) {
      const x = a.endDate || '9999', y = b.endDate || '9999';   // 종료일 순(없으면 맨 뒤), 같으면 이름 순
      return x < y ? -1 : (x > y ? 1 : byName(a, b));
    }).map(function (x) { return { id: x.id, key: x.key, rec: x.rec, name: x.name, region: x.region, when: x.endDate ? '협약 종료 ' + x.endDate : '' }; });
    return [{ key: 'notice', label: '공고 중', items: g1 }, { key: 'plan', label: '확정 공고 예정', items: g2 }, { key: 'est', label: '추정 공고 예정', items: g3 }, { key: 'end', label: '협약 종료 1년 안', items: g4 }]
      .filter(function (x) { return x.items.length; });
  };
  // 예전 호출(cands 한 줄 목록)을 묶음 하나로.
  kbb.candsToGroups = function (c) {
    c = c || [];
    return c.length ? [{ key: 'end', label: '협약 종료 1년 안', items: c.map(function (x) { return { id: x.id, key: x.key, rec: x.rec, name: x.name, region: x.region, when: x.endDate ? '협약 종료 ' + x.endDate : '' }; }) }] : [];
  };
  // 제안 진행 자료(/preps·/workflow/overview)를 못 받았을 때 '그 밖의 제안서 준비 중인 기관' 묶음 자리에 놓는 안내 + [다시 시도](qa 11-17 P2-1). code 0 = 서버에 연결되지 않음.
  kbb.prepErrHtml = function (code) {
    return '제안 진행 자료를 불러오지 못했습니다(' + (code ? '오류 ' + Number(code) : '서버에 연결되지 않음') + '). 준비 지연과 그 밖의 제안서 준비 중인 기관은 받은 뒤에 보입니다. <button type="button" id="hb-pretry">다시 시도</button>';
  };
  // 표 전체(머리 + 몸통). v = { st:'loading'|'offline'|'denied'|'error'|'ok', code, year, win, rows, out, canEdit, cands, prep('error'이면 제안 진행 자료 오류 안내), prepCode }
  // 열 폭은 CSS 클래스(.c-nm 기관 150 · .c-tag 구분 166 · .c-due 마감까지 120 · .c-bank 현 금고 은행 124 · .c-stg 준비 단계 148 · .c-brf 설명회 56, 레인은 나머지) — 1279px 이하에서 기관 열이 남는 폭을 받는다.
  // 열 머리(규격 6-5): v.sort = { key, dir }가 있으면 정렬하는 열은 <th> 안 버튼(.hb-sort)이 되고, 정렬된 열에만 aria-sort. v.sort가 없으면 글자만(예전 모양).
  const SORT_ICON = {
    asc: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 5L4 2.5 6.5 5"/></svg>',
    desc: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3L4 5.5 6.5 3"/></svg>',
    none: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3L4 1 6.5 3M1.5 5L4 7 6.5 5"/></svg>' };
  function thHtml(label, key, v) {
    if (!v.sort || !key) return '<th scope="col">' + label + '</th>';
    const on = v.sort.key === key, dir = v.sort.dir === 'desc' ? 'desc' : 'asc';
    return '<th scope="col"' + (on ? ' aria-sort="' + (dir === 'desc' ? 'descending' : 'ascending') + '"' : '') + '><button type="button" class="hb-sort" data-sort="' + key + '">' + label + SORT_ICON[on ? dir : 'none'] + '</button></th>';
  }
  kbb.goalTableHtml = function (v) {
    const win = v.win, watch = v.tab === 'watch', sel = !!v.selCol, ncol = (watch ? 6 : 7) + (sel ? 1 : 0);
    const cols = watch
      ? '<colgroup>' + (sel ? '<col class="c-ck">' : '') + '<col class="c-wnm"><col class="c-tag"><col class="c-next"><col class="c-bank"><col class="c-memo"><col class="c-act"></colgroup>'
      : '<colgroup>' + (sel ? '<col class="c-ck">' : '') + '<col class="c-nm"><col class="c-tag"><col class="c-due"><col class="c-bank"><col class="c-stg"><col class="c-brf"><col class="ln"></colgroup>';
    const head = watch
      ? '<thead><tr>' + (sel ? tc.ckHeadHtml(true) : '') + thHtml('기관', 'nm', v) + thHtml('구분', 'tag', v) + thHtml('다음 협약 종료', 'next', v) + thHtml('현 금고 은행', 'bank', v) + '<th scope="col">메모</th><th scope="col"><span class="sr-only">동작</span></th></tr></thead>'
      : '<thead><tr>' + (sel ? tc.ckHeadHtml() : '') + thHtml('기관', 'nm', v) + thHtml('구분', 'tag', v) + thHtml('마감까지', 'due', v) + thHtml('현 금고 은행', 'bank', v) + thHtml('준비 단계', 'stage', v) + '<th scope="col">설명회</th>' +
        '<th scope="col" class="ln"><span class="sr-only">12개월 일정 </span><span class="yr">' + esc(win.label) + '</span><span class="mh" aria-hidden="true">' +
        win.months.map(function (m) { return '<span>' + m.m + '</span>'; }).join('') + '</span></th></tr></thead>';
    const msg = function (inner, busy) { return '<tbody><tr class="emp"><td colspan="' + ncol + '"' + (busy ? ' aria-busy="true"' : '') + '>' + inner + '</td></tr></tbody>'; };
    const M = kbb.GOAL_MSG;
    let body;
    if (v.st === 'loading') body = msg('<p class="db-state">' + esc(M.loading) + '</p>', true);
    else if (v.st === 'offline') body = msg('<p class="db-state">' + esc(M.offline) + '</p>');
    else if (v.st === 'denied') body = msg('<p class="db-state">' + esc(v.code === 401 ? M.login : M.denied) + '</p>');
    else if (v.st === 'error') body = msg('<p class="db-state">' + kbb.goalErrHtml(v.code) + '</p>');
    else {
      const o = { win: win, canEdit: !!v.canEdit, noWatch: !!v.noWatch, selCol: sel, picked: v.picked || null };
      const outN = v.out ? v.out.length : 0, none = !v.rows.length && !outN;
      if (watch) {
        body = v.rows.length ? '<tbody>' + v.rows.map(function (r) { return kbb.watchRowHtml(r, o); }).join('') + '</tbody>'
          : msg(v.filtered ? kbb.filteredNoneHtml() : kbb.watchEmptyHtml(v));
      } else {
        // 거른 결과가 0이면(전체는 있음) 빈 상태 안내 대신 '조건에 맞는 기관이 없습니다.' + [필터 지우기]. 목표가 하나도 없을 때만 빈 후보.
        body = v.rows.length ? '<tbody>' + v.rows.map(function (r) { return kbb.goalRowHtml(r, o); }).join('') + '</tbody>' : (v.filtered && none ? msg(kbb.filteredNoneHtml()) : (v.filtered ? '' : msg(kbb.emptyHtml(v))));
        if (outN) {
          body += '<tbody><tr class="grp"><th scope="rowgroup" colspan="' + ncol + '">그 밖의 제안서 준비 중인 기관 <b>' + outN + '</b>곳</th></tr>' + v.out.map(function (r) { return kbb.goalRowHtml(r, o); }).join('') + '</tbody>';
        } else if (v.prep === 'error') {
          body += '<tbody><tr class="grp"><th scope="rowgroup" colspan="' + ncol + '">그 밖의 제안서 준비 중인 기관</th></tr><tr class="emp"><td colspan="' + ncol + '"><p class="db-state">' + kbb.prepErrHtml(v.prepCode) + '</p></td></tr></tbody>';
        }
      }
    }
    let cap = esc(v.year) + ' 목표 기관';
    if (v.st === 'ok') {
      // 목표 수와 그 밖의 준비 수를 나눠 말한다(design 11-19 B). nGoal·nOut은 거르기 전 값, 없으면 넘겨받은 줄 수.
      const nGoal = typeof v.nGoal === 'number' ? v.nGoal : v.rows.length, nOut = watch ? 0 : (typeof v.nOut === 'number' ? v.nOut : (v.out ? v.out.length : 0));
      const kinds = nOut > 0 ? nGoal + '곳과 그 밖의 제안서 준비 중인 기관 ' + nOut + '곳' : '';
      if (!v.sort) cap += ' ' + (kinds || v.rows.length + '곳') + ', 마감 가까운 순';
      else {
        const shown = v.rows.length + (v.out ? v.out.length : 0), total = typeof v.total === 'number' ? v.total : shown;
        cap = (watch ? '관심 기관 ' : esc(v.year) + ' 목표 기관 ') + (kinds ? kinds + ', ' : '') + total + '곳 중 ' + shown + '곳 보임, ' + kbb.SORT_LABEL[v.sort.key] + ' ' + (v.sort.dir === 'desc' ? '내림차순' : '오름차순');
      }
    }
    return '<table class="hb-tt' + (sel ? ' sel' : '') + '"><caption class="sr-only">' + cap + '</caption>' + cols + head + body + '</table>';
  };
  kbb.filteredNoneHtml = function () { return '<p class="db-state">조건에 맞는 기관이 없습니다. <button type="button" id="hb-fclear2">필터 지우기</button></p>'; };
  // 관심 탭이 비었을 때(규격 5절). 편집 가능 계정에는 [관심 기관 추가].
  kbb.watchEmptyHtml = function (v) {
    return '<h3 class="hb-eh">관심 기관이 없습니다</h3><p>이번에는 놓쳤지만 다음 입찰 때 가져올 기관을 넣어 두면, 다음 협약 종료가 2년 안으로 들어올 때 [목표로 옮기기]가 뜹니다.</p>' +
      (v.canEdit ? '<p><button type="button" class="hb-tag add" id="hb-watch-add2" data-act="addwatch">관심 기관 추가</button></p>' : '');
  };
  kbb.goalFootHtml = function (nAll) {
    return '<span class="lg"><i class="sw n"></i>공고~접수 마감</span><span class="lg"><i class="sw e"></i>추정 공고 달</span><span class="lg"><i class="sw t"></i>오늘</span>' + kbb.noticeLinkHtml({ n: nAll });
  };
  // 접힌 협약 구획의 요약 줄(규격 5절). goalN = 그중 목표 수(목표 기관을 못 받았으면 null → 그 칸을 뺀다).
  kbb.oursHeadHtml = function (total, soonN, goalN) {
    return ' <b>' + total + '</b>곳 · 협약 종료 1년 안 <b>' + soonN + '</b>곳' + (typeof goalN === 'number' ? ' · 그중 목표 <b>' + goalN + '</b>곳' : '');
  };

  // 구분 메뉴(규격 6-E ②). r = goalRow, o = { tags:[{code,name}], def:{tag,why}, canCancel }
  const CK = '<svg class="ck" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.5l2 2L8 3"/></svg>';
  kbb.menuHtml = function (r, o) {
    const def = o.def || {};
    let h = '<div class="hb-menu" role="menu" aria-label="' + (o.canTerm ? '목표 기관 동작' : '구분 바꾸기') + '">';
    if (def.tag) h += '<div class="mh">자동 제안: ' + esc(kbb.TAG[def.tag] || '') + ' — ' + esc(kbb.tagWhy(def)) + '</div>';
    if (o.judgeText) h += '<div class="mh">' + esc(o.judgeText) + '</div>';
    (o.tags || []).forEach(function (t) {
      h += '<button type="button" role="menuitemradio" aria-checked="' + (t.code === r.tagCd ? 'true' : 'false') + '" data-tag="' + esc(t.code) + '" tabindex="-1"><span>' + esc(t.name) + '</span>' + CK + '</button>';
    });
    // 옮기기(규격 6-6): 목표 줄은 늘 [관심 기관으로…], 입찰 종료 줄은 [다음 회차 목표로…]도 — 12개월 칸이 숨는 폭에서도 같은 동작을 준다.
    if (o.canMove) {
      h += '<div class="ms" role="separator"></div><button type="button" role="menuitem" data-cmd="towatch" tabindex="-1">관심 기관으로…</button>';
      if (r.closed) h += '<button type="button" role="menuitem" data-cmd="tonext" tabindex="-1">다음 회차 목표로…</button>';
    }
    if (o.canCancel) h += '<div class="ms" role="separator"></div><button type="button" role="menuitem" data-cmd="cancel" tabindex="-1">' + esc(o.cancelText || '목표에서 빼기…') + '</button>';
    if (o.canTerm) h += '<div class="ms" role="separator"></div><button type="button" role="menuitem" data-cmd="term" tabindex="-1">협약 개시일 적기…</button>';
    return h + '</div>';
  };

  // 표 도구 줄(규격 6-4). v = { tab:'goal'|'watch', nGoal, nWatch, f:{q,tag,status,kind,stage}, stageName, shown, total, canEdit }
  // 건수: 화면 낭독은 '5곳 중 3곳 보임'(읽는 글), 눈에 보이는 '3 / 5곳'은 aria-hidden. 바깥 #hb-cnt는 렌더가 바뀌어도 같은 노드로 둔다(paintToolbar) — role=status 알림이 끊기지 않게.
  kbb.cntHtml = function (shown, total) {
    return '<span class="sr-only">' + Number(total) + '곳 중 ' + Number(shown) + '곳 보임</span><span aria-hidden="true"><b>' + Number(shown) + '</b> / <b>' + Number(total) + '</b>곳</span>';
  };
  kbb.toolbarHtml = function (v) {
    const f = v.f || {}, watch = v.tab === 'watch';
    const sel = function (id, label, opts, val) {
      return '<select id="' + id + '" aria-label="' + esc(label) + '"' + (val ? ' class="on"' : '') + '>' + opts.map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (x[0] === (val || '') ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
      }).join('') + '</select>';
    };
    const tab = function (k, name, n) {
      const on = v.tab === k;
      return '<button type="button" role="tab" id="hb-tab-' + k + '" data-tab="' + k + '" class="' + (on ? 'on' : '') + '" aria-selected="' + (on ? 'true' : 'false') + '" aria-controls="hb-ts" tabindex="' + (on ? '0' : '-1') + '">' + name + ' <b>' + Number(n) + '</b></button>';
    };
    const q = String(f.q || '');
    // v.noWatch = 옛 서버(관심 기관 응답 없음): 관심 탭·[관심 기관 추가]를 숨긴다(qa 11-17 P3-2)
    return '<div class="ap-tabs" role="tablist" aria-label="목록 종류">' + tab('goal', '목표', v.nGoal) + (v.noWatch ? '' : tab('watch', '관심', v.nWatch)) + '</div>' +
      '<input type="search" id="hb-q" placeholder="기관명·지역" aria-label="기관명이나 지역으로 찾기" maxlength="40" autocomplete="off"' + (q ? ' class="on"' : '') + ' value="' + esc(q) + '">' +
      sel('hb-f-tag', '구분 거르기', [['', '구분 전체'], ['RETAIN', kbb.TAG.RETAIN], ['REGAIN', kbb.TAG.REGAIN], ['NEW', kbb.TAG.NEW]], f.tag) +
      sel('hb-f-status', '상태 거르기', kbb.STATUS[watch ? 'watch' : 'goal'], f.status) +
      (watch ? '' : sel('hb-f-kind', '종류 거르기', [['', '종류 전체'], ['goal', '목표만'], ['out', '그 밖의 준비 기관만']], f.kind)) +
      (!watch && typeof f.stage === 'number' && f.stage >= 0 ? '<button type="button" class="hb-tag" id="hb-sclr" aria-label="단계 거르기 끄기: ' + esc(v.stageName || '') + '">단계: ' + esc(v.stageName || '') + ' ×</button>' : '') +
      '<span class="cnt" id="hb-cnt" role="status">' + kbb.cntHtml(v.shown, v.total) + '</span>' +
      (watch && v.canEdit && !v.noWatch ? '<button type="button" id="hb-watch-add" data-act="addwatch">관심 기관 추가</button>' : '') +
      '<button type="button" id="hb-fclear"' + (kbb.filterOn(f) ? '' : ' hidden') + '>필터 지우기</button>';
  };

  // ── 순수: 대화창(목표 기관 추가·목표에서 빼기) ──────────────────────────
  // 한 줄 설명 '서울 광진구청 · 국민은행 단수 · 협약 종료 2026-12-31'. noName = 이름을 뺀다('서울 · 국민은행 단수 · …' — 검색 결과 목록은 첫 줄이 이름이라 둘째 줄에 반복하지 않는다, design 11-17 P3-3).
  kbb.instSub = function (rec, sum, o, noName) {
    const b = kbb.bankInfo(sum, rec, o);
    const end = b.end || (b.kb ? kbb.contractEnd(rec, { lofin: o && o.lofin, direct: o && o.direct, today: o && o.today }).date : '');
    return dash.regionName(rec.region) + (noName ? '' : ' ' + (rec.name || '')) + ' · ' + (b.unknown ? '현 금고 은행 확인 안 됨' : b.name + (b.rank ? ' ' + b.rank : '')) + (end ? ' · 협약 종료 ' + end : '');
  };
  // 기관 검색: 2자부터, 최대 limit(8)곳. 이름이 검색어로 시작하는 곳이 먼저. taken = { institutionId: true }(이미 이 연도 목표).
  kbb.searchInst = function (list, q, o) {
    o = o || {};
    const s = String(q == null ? '' : q).trim().toLowerCase();
    if (s.length < 2) return [];
    const hits = logic.dedupeByInstitution(list || []).filter(function (r) { return r.institutionId && String(r.name || '').toLowerCase().indexOf(s) >= 0; });
    hits.sort(function (a, b) {
      const pa = String(a.name).toLowerCase().indexOf(s) === 0 ? 0 : 1, pb = String(b.name).toLowerCase().indexOf(s) === 0 ? 0 : 1;
      return (pa - pb) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    });
    return hits.slice(0, o.limit || 8).map(function (r) {
      const id = String(r.institutionId);
      // taken 값은 true 또는 { kind:'GOAL'|'WATCH', year } — 이미 걸린 기관(규격 6-9). closedIds = 올해 입찰 종료로 알려진 기관 { id: true }.
      const tk = o.taken && o.taken[id];
      return { id: id, key: logic.instKey(r), rec: r, name: r.name || '', taken: !!tk, takenKind: tk && tk.kind === 'WATCH' ? 'WATCH' : 'GOAL', takenYear: tk && Number(tk.year) || 0,
        closed: !!(o.closedIds && o.closedIds[id]), sub: kbb.instSub(r, o.sumById && o.sumById[id], o, true) };
    });
  };
  kbb.resultsHtml = function (results, active, year) {
    return (results || []).map(function (x, i) {
      const mark = x.taken ? (x.takenKind === 'WATCH' ? ' · 이미 관심 기관' : ' · 이미 ' + esc(x.takenYear || year) + ' 목표') : (x.closed ? ' · 올해 입찰 종료' : '');
      return '<li role="option" id="hb-a-o' + i + '" data-i="' + i + '" aria-selected="' + (i === active ? 'true' : 'false') + '"' + (x.taken ? ' aria-disabled="true"' : '') + '>' +
        '<span class="nm">' + esc(x.name) + '</span><span class="sub">' + esc(x.sub) + mark + '</span></li>';
    }).join('');
  };
  // 중복 알림(사용자 결정 11-17): 목표·관심 어느 쪽에 이미 있는지와 다음 행동 한 문장. which = 'GOAL'|'WATCH'.
  kbb.dupText = function (which, year) {
    return which === 'WATCH' ? '이미 관심 기관으로 설정되어 있습니다.' : '이미 목표 기관으로 설정되어 있습니다' + (Number(year) ? '(' + Number(year) + ' 목표)' : '') + '.';
  };
  kbb.dupHint = function (which) {
    return which === 'WATCH' ? '목표로 넣으려면 관심 탭에서 [목표로 옮기기]를 누르세요.' : '관심으로 옮기려면 목표 표의 구분 메뉴에서 [관심 기관으로…]를 누르세요.';
  };
  kbb.dupLinkHtml = function (which) {
    return which === 'WATCH' ? '<button type="button" class="hb-tag" id="hb-a-see" data-see="watch">관심 탭에서 보기</button>' : '<button type="button" class="hb-tag" id="hb-a-see" data-see="goal">목표 표에서 보기</button>';
  };
  // 목표→관심으로 옮긴 뒤 결과 알림 옆 버튼(11-19 4-4). 고정 마크업, 서버 글 없음.
  kbb.seeWatchHtml = function () { return '<button type="button" class="hb-tag" id="hb-see-watch" data-see="watch">관심 탭에서 보기</button>'; };
  // 입찰 종료 주의 상자(규격 6-9). w = { mode:'block'(서버 근거, 막음)|'progress'(제안 진행 중이라 막지 않음)|'screen'(화면만 아는 근거, 주의만), basis, note, years:[다음 회차 연도], boxYear, icon(신뢰하는 고정 마크업) }
  kbb.warnHtml = function (w) {
    if (!w) return '';
    const title = w.mode === 'screen' ? '다음 입찰 예정을 확인하세요' : (w.mode === 'progress' ? '올해 입찰이 끝난 것으로 기록되어 있습니다' : '올해 입찰이 끝난 기관입니다');
    const body = w.mode === 'screen' ? kbb.screenNoteText(w.note)
      : '근거: ' + kbb.basisText(w.basis) + '. ' + (w.mode === 'progress' ? '이 기관은 제안을 진행 중이라 올해 목표로 넣을 수 있습니다.' : '올해 목표로는 넣을 수 없습니다.');
    let acts = '';
    if (w.mode === 'block') {
      const ys = (w.years || []).map(Number).filter(Boolean), by = ys.indexOf(Number(w.boxYear)) >= 0 ? Number(w.boxYear) : ys[0];
      acts = '<div class="acts">' + (w.noWatch ? '' : '<button type="button" class="hb-tag" id="hb-w-watch">관심 기관으로 넣기</button>') + (ys.length
        ? '<select id="hb-w-year" aria-label="다음 회차 목표 연도">' + ys.map(function (y) { return '<option value="' + y + '"' + (y === by ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="hb-tag" id="hb-w-next">' + by + ' 목표로 넣기</button>' : '') + '</div>';
    }
    return '<div class="hb-warn' + (w.mode === 'screen' ? ' soft' : '') + '" role="group" aria-labelledby="hb-w-t"><div class="t" id="hb-w-t">' + (w.icon || '') + esc(title) + '</div><p>' + esc(body) + '</p>' + acts +
      '<p class="go">정보가 틀리면 \'입찰 공고 현황\'에서 고쳐 주세요. <button type="button" class="hb-tag" id="hb-w-notice">입찰 공고 현황 열기</button></p></div>';
  };
  // ── 순수: [목표 기관 추가] '추천받기' 1단계(design-reviewer 11-19 4~6절, 메인 확정). 서버 요청 없이 화면 자료만으로 계산한다. ──
  // 풀 = 공고 중(awaiting은 입찰 종료 근거가 있을 때만) + 확정 공고 예정(추정 제외). ① 국민은행이 금고인(재유치)·금고였던(되찾기) 기관 + '다음 회차 준비' → ② 같은 종류·금고 구성 → ③ 접수 마감 D-n.
  // 한 기관은 처음 맞는 단계에 한 번만. 제외: 이미 목표·관심·올해 입찰 종료. 점수 없음, 새 판정 없음(defaultTag·bankInfo·dText 재사용).
  kbb.REC_MAX = 5;
  kbb.REC_STAGES = [{ key: 'KB', no: 1, label: '국민은행이 금고인·금고였던 기관' }, { key: 'SIM', no: 2, label: '비슷한 기관' }, { key: 'DUE', no: 3, label: '접수 마감이 가까운 기관' }];
  kbb.REC_MSG = {
    head: '공고 중이거나 1년 안에 공고가 확정된 기관 중 ',
    next: '다음 회차 준비 — 올해 결과가 정해진 곳',
    simSub: '국민은행이 금고인 기관과 종류·금고 구성이 같은 곳',
    emptyKbSkip: '예전 국민은행 금고 기록이 아직 반입되지 않아 이 단계를 건너뜁니다.',
    emptyKbNone: '국민은행이 금고인·금고였던 기관 중 공고 중이거나 공고가 확정된 곳이 없습니다.',
    kbFormerMissing: '예전 국민은행 금고 기록이 아직 반입되지 않아 \'되찾기\' 기관은 빠졌습니다.',
    emptySim: '종류·금고 구성이 같은 기관 중 공고 중이거나 공고가 확정된 곳이 없습니다.',
    emptyDue: '접수 마감이 정해진 공고가 없습니다.',
    allEmpty: '추천할 기관이 없습니다. 위 칸에 기관 이름을 2자 이상 적어 찾으세요.',
    noClosedData: '입찰 공고 현황을 받지 못해 올해 입찰이 끝난 기관을 가리지 못했습니다. 고른 뒤 주의 상자를 확인하세요.',
    source: '추천 근거: 입찰 공고 현황 · 금고 약정 · 행안부 금고지정 현황' };
  const VAULT_TEXT = { SINGLE: '단수 금고', MULTI: '1·2금고' };
  // 금고 성격만 본다(단수 / 1·2금고). 현재 줄(039 요약 → 없으면 만료 안 된 행안부 줄)에서 못 정하면 ''(비교 불가).
  function vaultShape(rec, sum, o) {
    const t = isoOf(o.today);
    let ranks;
    if (sum && Array.isArray(sum.lines_now) && sum.lines_now.length) {
      ranks = sum.lines_now.filter(function (l) { const f = l && kbb.normDate(l.term_from); return l && (!f || f <= t); }).map(function (l) { return l.rank_cd; });
    } else ranks = dash.lofinLines(rec, o.lofin, o.today).filter(function (l) { return !l.expired; }).map(function (l) { return l.cmp; });
    if (ranks.indexOf('FIRST') >= 0 || ranks.indexOf('SECOND') >= 0) return 'MULTI';
    return ranks.indexOf('SINGLE') >= 0 ? 'SINGLE' : '';
  }
  // m = dash.model 결과({ notice, upcoming }), o = { taken:{id:{kind}|true}, closed:{id: closedBasis}, closedUnknown, sumById, lofin, verified, direct, today, list, years:[고를 수 있는 연도], noWatch }
  // → { n, allEmpty, excl:{goal,watch,closed,other}, closedUnknown, byId, stages:[{ key, no, label, items, next, n, empty:'MSG키'|'', formerMissing }] }
  kbb.recommend = function (m, o) {
    o = o || {};
    const sumById = o.sumById || {}, taken = o.taken || {}, closed = o.closed || {}, years = (o.years || []).map(Number);
    const t = isoOf(o.today), y0 = Number(t.slice(0, 4));
    const tagO = { lofin: o.lofin, verified: o.verified, today: o.today, direct: o.direct };
    const byName = function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); };
    const cmp = function (a, b) { return (a.tier - b.tier) || (a.no - b.no) || byName(a, b); };
    const formerOf = function (sum) { return sum && sum.kb_now !== 'KB' && Number(sum.last_kb_year) > 0 && Number(sum.last_kb_year) < y0 ? Number(sum.last_kb_year) : 0; };   // 미래 국민 약정 줄이 만든 last_kb_year(오늘 연도 이후)는 '예전'이 아니다
    // 다음 약정이 국민은행이 아닌 근거(P1-1): ⓐ시작 전 줄 중 첫 줄의 은행 ⓑKB_VERIFIED의 leaves. 국민은행이 이어 맡거나 근거가 없으면 null.
    const nextOther = function (sum, rec0) {
      const nl = kbb.nextLines(sum, o.today);
      if (nl.length) return /국민/.test(nl[0].bank_name || '') ? null : { bank: String(nl[0].bank_name || '') || '다른 은행', start: kbb.normDate(nl[0].term_from) || '' };
      const e = dash.kbEntry(rec0, o.verified);
      return e && e.leaves ? { bank: '다른 은행', start: '' } : null;
    };
    // 기준: 국민은행이 금고인 기관의 (종류·금고 성격) 조합
    const refs = {};
    let kbN = 0;
    logic.dedupeByInstitution(o.list || []).forEach(function (r) {
      if (!r.institutionId) return;
      const sum = sumById[String(r.institutionId)] || null;
      if (kbb.defaultTag(r, sum, tagO).tag !== 'RETAIN') return;
      kbN += 1;
      const k = dash.kindOfRec(r), sh = vaultShape(r, sum, tagO);
      if (k && sh) refs[k + '|' + sh] = true;
    });
    const noFormer = !Object.keys(sumById).some(function (id) { return formerOf(sumById[id]) > 0; });
    // 풀(기관마다 한 번)
    const pool = [], seen = {};
    const add = function (it, p) {
      const id = String(it.rec && it.rec.institutionId || '');
      if (!id || seen[id]) return;
      if (p.needClosed && !closed[id]) return;
      seen[id] = true;
      pool.push(Object.assign({ it: it, id: id }, p));
    };
    ((m && m.notice) || []).forEach(function (it) {
      const dl = it.phase === 'receiving' && typeof it.deadlineDays === 'number' ? it.deadlineDays : null, to = String(it.receiveTo || '').slice(0, 10);
      add(it, { needClosed: it.phase === 'awaiting', tier: dl !== null ? 0 : 1, no: dl !== null ? dl : 0, dl: dl, year: y0,
        when: dl !== null ? '접수 마감 ' + dText(dl) : '공고 중', dueLong: dl !== null ? '접수 마감 ' + dText(dl) + (isDay(to) ? ' (' + to + ')' : '') : '' });
    });
    ((m && m.upcoming) || []).forEach(function (it) {
      if (it.confidence !== '확정') return;
      add(it, { needClosed: false, tier: 2, no: typeof it.days === 'number' ? it.days : 1e9, dl: null, year: Number(String(it.date).slice(0, 4)) || y0, when: '공고 예정 ' + String(it.date).slice(0, 10), dueLong: '' });
    });
    const ex = { goal: 0, watch: 0, closed: 0, other: 0 };
    const kb = [], nx = [], sim = [], due = [], byId = {};
    const pickYear = function (pref) { return years.indexOf(pref) >= 0 ? { kind: 'GOAL', year: pref } : (o.noWatch ? null : { kind: 'WATCH', year: 0 }); };
    pool.forEach(function (p) {
      const it = p.it, id = p.id, rec0 = it.rec, sum = sumById[id] || null, tk = taken[id];
      if (tk && tk.kind === 'WATCH') { ex.watch += 1; return; }
      // 이미 목표: 줄의 추천 연도와 같은 해 목표일 때만 뺀다(P2-3). 연도를 모르는 항목은 모두 뺀다.
      const dropGoal = function (sel) {
        if (!tk) return false;
        if (sel && sel.kind === 'GOAL' && Number(tk.year) > 0 && Number(tk.year) !== sel.year) return false;
        ex.goal += 1; return true;
      };
      const base = { id: id, key: it.key, name: it.name, region: it.region, tier: p.tier, no: p.no };
      if (closed[id]) {   // 올해 입찰 종료 — 국민은행과 관련된 기관 중 다음 약정이 국민은행이 아닌 곳만 '다음 회차 준비'(기본 내년), 나머지는 제외
        const e = dash.kbEntry(rec0, o.verified), nb = nextOther(sum, rec0);
        const rel = (sum && (sum.kb_now === 'KB' || Number(sum.last_kb_year) > 0)) || !!(e && e.leaves);
        if (nb && rel) {
          const sel = pickYear(y0 + 1);
          if (dropGoal(sel)) return;
          if (!sel) { ex.other += 1; return; }
          nx.push(Object.assign(base, sel, { chip: '되찾기', cls: 'next', lastKb: formerOf(sum), bank: nb.bank, start: nb.start,
            why: '올해 결과가 정해짐(' + (nb.start ? '금고 약정 ' + nb.start + ' 시작, ' + nb.bank : (nb.bank === '다른 은행' ? '다른 은행으로 정해짐' : nb.bank + ' 선정')) + ') · 다음 회차를 미리 준비' }));
        } else if (!dropGoal(null)) ex.closed += 1;
        return;
      }
      const def = kbb.defaultTag(rec0, sum, tagO), last = formerOf(sum), kind = dash.kindOfRec(rec0), sh = vaultShape(rec0, sum, tagO);
      if (dropGoal(pickYear(p.year))) return;
      let st = '', extra = {};
      if (def.tag === 'RETAIN') {
        const b = kbb.bankInfo(sum, rec0, tagO);
        st = 'KB'; extra = { chip: '재유치', cls: 'retain', why: '지금 국민은행' + (b.kb && b.rank ? ' ' + (b.rank === '단수' ? '단수 금고' : b.rank) : '') + ' · ' + p.when };
      } else if (last) {
        const bank = def.bank || '다른 은행';
        st = 'KB'; extra = { chip: '되찾기', cls: 'regain', lastKb: last, bank: bank, why: last + '년까지 국민은행 금고, 지금 ' + bank + ' · ' + p.when };
      } else if (kind && sh && refs[kind + '|' + sh]) {
        st = 'SIM'; extra = { chip: '', cls: 'sim', why: kind + ' · ' + VAULT_TEXT[sh] + ' — 국민은행이 금고인 ' + kind + (jongOf(kind) > 0 ? '과' : '와') + ' 같은 구성 · ' + p.when };
      } else if (p.dl !== null) {
        st = 'DUE'; extra = { chip: '', cls: 'due', why: p.dueLong };
      } else return;
      const sel = pickYear(p.year);
      if (!sel) { ex.other += 1; return; }
      (st === 'KB' ? kb : (st === 'SIM' ? sim : due)).push(Object.assign(base, sel, extra));
    });
    kb.sort(cmp); nx.sort(byName); sim.sort(cmp); due.sort(cmp);
    const stageOf = function (s, items, next) {
      const n = items.length + next.length;
      let empty = '';
      if (!n) empty = s.key === 'KB' ? (noFormer && kbN === 0 ? 'emptyKbSkip' : 'emptyKbNone') : (s.key === 'SIM' ? 'emptySim' : 'emptyDue');
      return { key: s.key, no: s.no, label: s.label, items: items, next: next, n: n, empty: empty, formerMissing: s.key === 'KB' && noFormer && empty !== 'emptyKbSkip' };
    };
    const S = kbb.REC_STAGES, stages = [stageOf(S[0], kb, nx), stageOf(S[1], sim, []), stageOf(S[2], due, [])];
    stages.forEach(function (s) { s.items.concat(s.next).forEach(function (x) { byId[x.id] = x; }); });
    const n = stages[0].n + stages[1].n + stages[2].n;
    return { n: n, allEmpty: n === 0, excl: ex, closedUnknown: !!o.closedUnknown, byId: byId, stages: stages };
  };
  kbb.recBtnText = function (it) { return it.kind === 'WATCH' ? '관심으로 고르기' : it.year + ' 목표로 고르기'; };
  // 고른 뒤 #hb-a-note에 이을 근거 문장(규격 P1-2). 재유치·되찾기·다음 회차만 — 칩은 추천 이유이고 저장되는 구분이 아니다.
  kbb.recNote = function (it) {
    if (!it) return '';
    if (it.cls === 'retain') return '재유치 추천 — 지금 국민은행 금고입니다.';
    if (it.cls === 'regain') return '되찾기 추천 — 예전(' + it.lastKb + '년까지) 국민은행 금고였고 지금은 ' + it.bank + '입니다.';
    if (it.cls === 'next') return '다음 회차 준비 추천 — 올해 입찰 결과가 정해졌습니다(' + it.bank + (it.start ? ', 금고 약정 ' + it.start + ' 시작' : '') + ').';
    return '';
  };
  // 패널 안쪽 마크업. v = { more: { KB:true, … } }(단계별 '나머지 보기'를 눌렀는가). 이유 안 날짜·D-n·연도는 고정폭 span.d.
  kbb.recHtml = function (r, v) {
    v = v || {};
    const M = kbb.REC_MSG, more = v.more || {}, X = kbb.REC_MAX, x = r.excl || {};
    const dm = function (s) { return esc(s).replace(/\d{4}-\d{2}-\d{2}|D-day|D-\d+|\d{4}(?=년)/g, '<span class="d">$&</span>'); };
    let i = 0;
    const row = function (it, sk) {
      const rg = dash.regionName(it.region), bt = kbb.recBtnText(it), wid = 'hb-r' + (i++) + 'w';
      return '<li><span class="nm"><span class="rg">' + esc(rg) + '</span>' + esc(it.name) + (it.chip ? '<span class="hb-rk">' + esc(it.chip) + '</span>' : '') + '</span>' +
        '<span class="why" id="' + wid + '">' + (it.chip ? '<span class="sr-only">' + esc(it.chip) + '. </span>' : '') + dm(it.why) + '</span>' +
        '<button type="button" class="hb-tag" data-rec="' + esc(it.id) + '" data-stage="' + sk + '" aria-label="' + esc(rg + ' ' + it.name + ' ' + bt) + '" aria-describedby="' + wid + '">' + esc(bt) + '</button></li>';
    };
    const ul = function (items, sk) { return items.length ? '<ul>' + items.map(function (it) { return row(it, sk); }).join('') + '</ul>' : ''; };
    let h = '<p id="hb-a-rech" class="tm-note" role="status">' + (r.allEmpty ? esc(M.allEmpty) : esc(M.head) + '<b>' + r.n + '</b>곳을 추천합니다.') + '</p>';
    const parts = [];
    if (x.goal) parts.push('목표 ' + x.goal + '곳');
    if (x.watch) parts.push('관심 ' + x.watch + '곳');
    if (x.closed) parts.push('올해 입찰이 끝난 ' + x.closed + '곳');
    if (parts.length) h += '<p class="tm-note">이미 ' + esc(parts.join(' · ')) + '은 뺐습니다.</p>';
    if (x.other) h += '<p class="tm-note">관심으로만 고를 수 있는 ' + x.other + '곳은 이 화면에서 관심 기능을 쓸 수 없어 뺐습니다.</p>';
    if (r.closedUnknown) h += '<p class="tm-note">' + esc(M.noClosedData) + '</p>';
    if (!r.allEmpty) r.stages.forEach(function (s) {
      const open = !!more[s.key], mv = open ? s.items : s.items.slice(0, X), nv = open ? s.next : s.next.slice(0, X);
      const rest = (s.items.length - mv.length) + (s.next.length - nv.length);
      h += '<h4><span class="no">' + s.no + '</span>' + esc(s.label) + ' <b>' + s.n + '</b>곳</h4>';
      if (s.key === 'SIM' && s.n) h += '<p class="tm-note">' + esc(M.simSub) + '</p>';
      h += ul(mv, s.key);
      if (nv.length) h += '<h5>' + esc(M.next) + ' <b>' + s.next.length + '</b>곳</h5>' + ul(nv, s.key);
      if (rest > 0) h += '<button type="button" class="hb-tag more" data-more="' + s.key + '" aria-label="' + esc(s.label) + ' 나머지 ' + rest + '곳 보기">나머지 ' + rest + '곳 보기</button>';
      if (s.empty) h += '<p class="tm-note">' + esc(M[s.empty]) + '</p>';
      if (s.formerMissing) h += '<p class="tm-note">' + esc(M.kbFormerMissing) + '</p>';
    });
    return h + '<p class="tm-note">' + esc(M.source) + '</p>';
  };
  kbb.addState = function (m) {
    const watch = m.kind === 'WATCH';
    if (!m.inst) return { canGo: false, why: '기관을 고르세요.' };
    if (!m.tag) return { canGo: false, why: '구분을 고르세요.' };
    if (!watch && !m.year) return { canGo: false, why: '목표 연도를 고르세요.' };
    if (String(m.memo || '').length > kbb.MEMO_MAX) return { canGo: false, why: '메모는 ' + kbb.MEMO_MAX + '자 이내로 적으세요.' };
    if (m.closedBlock) return { canGo: false, why: '올해 입찰이 끝나 올해 목표로는 넣을 수 없습니다.' };
    if (m.busy) return { canGo: false, why: '' };
    return { canGo: true, why: '' };
  };
  kbb.cancelState = function (m) {
    if (!m.reason) return { canGo: false, why: '사유를 고르세요.' };
    if (m.reason === 'ETC') {
      const t = String(m.etc || '').trim();
      if (!t) return { canGo: false, why: '기타 사유를 적으세요.' };
      if (t.length > kbb.ETC_MAX) return { canGo: false, why: '기타 사유는 ' + kbb.ETC_MAX + '자 이내로 적으세요.' };
    }
    if (m.busy) return { canGo: false, why: '' };
    return { canGo: true, why: '' };
  };
  kbb.addDialogHtml = function (m, o) {
    o = o || {};
    const yrs = (o.years || []).map(function (y) { return '<option value="' + esc(y) + '"' + (String(y) === String(m.year) ? ' selected' : '') + '>' + esc(y) + '년</option>'; }).join('');
    const tags = (o.tags || []).map(function (t) {
      return '<label class="hb-rd"><input type="radio" name="hb-a-tag" value="' + esc(t.code) + '"' + (t.code === m.tag ? ' checked' : '') + '> ' + esc(t.name) + '</label>';
    }).join('');
    const watch = m.kind === 'WATCH';
    const kinds = o.noWatch ? '' : '<fieldset class="tm-fs"><legend>넣을 곳 (필수)</legend><div class="hb-opts"><label class="hb-rd"><input type="radio" name="hb-a-kind" value="GOAL"' + (watch ? '' : ' checked') + '> 목표</label>' +
      '<label class="hb-rd"><input type="radio" name="hb-a-kind" value="WATCH"' + (watch ? ' checked' : '') + '> 관심 기관(연도 없음)</label></div></fieldset>';
    return '<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">' + (watch ? '관심 기관 추가' : '목표 기관 추가') + '</h3><div class="modal-scroll tm-m-body">' + kinds +
      '<div class="tm-reason-row"><label for="hb-a-q">기관 (필수)</label>' + (o.rec ? '<button type="button" class="hb-tag" id="hb-a-recbtn" aria-expanded="false" aria-controls="hb-a-rec">추천받기</button>' : '') + '</div>' +
      '<input type="text" id="hb-a-q" role="combobox" aria-expanded="false" aria-controls="hb-a-list" aria-autocomplete="list" aria-describedby="hb-a-pick" autocomplete="off" maxlength="40" placeholder="기관 이름을 2자 이상 적으세요" value="' + esc(m.q || '') + '">' +
      '<ul id="hb-a-list" class="hb-res" role="listbox" aria-label="기관 검색 결과"></ul><p id="hb-a-pick" class="tm-note" role="status">' + esc(m.pickText || '') + '</p>' +
      (o.rec ? '<div id="hb-a-rec" class="hb-rec" role="group" aria-labelledby="hb-a-rech" hidden></div>' : '') +
      '<div id="hb-a-box"></div>' +
      '<div id="hb-a-yrow"' + (watch ? ' hidden' : '') + '><div class="tm-reason-row"><label for="hb-a-year">목표 연도 (필수)</label></div><select id="hb-a-year">' + yrs + '</select></div>' +
      '<fieldset class="tm-fs"><legend>구분 (필수)</legend><div class="hb-opts">' + tags + '</div><p id="hb-a-note" class="tm-note">' + esc(m.note || '') + '</p></fieldset>' +
      '<div class="tm-reason-row"><label for="hb-a-memo">메모 (선택)</label><span id="hb-a-cnt" class="tm-count">0/' + kbb.MEMO_MAX + '</span></div>' +
      '<input type="text" id="hb-a-memo" maxlength="' + kbb.MEMO_MAX + '" aria-describedby="hb-a-mh hb-a-cnt" value=""><p id="hb-a-mh" class="tm-note">개인정보를 적지 마세요.</p>' +
      '<div id="hb-a-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions"><span id="hb-a-why" class="tm-why"></span><button type="button" id="hb-a-cancel">취소</button>' +
      '<button type="button" id="hb-a-go" class="pp-next-btn" disabled aria-describedby="hb-a-why">' + (watch ? '관심 기관에 넣기' : '목표에 넣기') + '</button></div></div>';
  };
  // 옮기기 확인 창(규격 6-11, 3종 같은 틀). kind = 'towatch'|'tonext'|'togoal', r = goalRow, o = { years:[선택할 연도], year(기본값) }
  kbb.MOVE_TITLE = { towatch: '관심 기관으로 옮기기', tonext: '다음 회차 목표로 옮기기', togoal: '목표로 옮기기' };
  kbb.moveGoText = function (kind, year) { return kind === 'tonext' ? (Number(year) ? Number(year) + ' ' : '') + '목표로 옮기기' : kbb.MOVE_TITLE[kind]; };
  kbb.moveState = function (kind, m) {
    if (kind !== 'towatch' && !Number(m.year)) return { canGo: false, why: '목표 연도를 고르세요.' };
    return m.busy ? { canGo: false, why: '' } : { canGo: true, why: '' };
  };
  kbb.moveDialogHtml = function (kind, r, o) {
    o = o || {};
    const sel = kind === 'towatch' ? '' : '<div class="tm-reason-row"><label for="hb-m-year">목표 연도 (필수)</label></div><select id="hb-m-year"><option value=""' + (o.year ? '' : ' selected') + '>고르세요</option>' +
      (o.years || []).map(function (y) { return '<option value="' + esc(y) + '"' + (String(y) === String(o.year) ? ' selected' : '') + '>' + esc(y) + '년</option>'; }).join('') + '</select>';
    const note = kind === 'towatch'
      ? '올해 목표에서 빠지고 관심 기관에 들어갑니다. 구분(' + esc(r.tagName || '구분') + ')과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 남습니다.'
      : (kind === 'tonext' ? '올해 입찰이 끝난 기관을 다음 회차 목표로 옮깁니다. 구분과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 남습니다.'
        : '관심 기관을 목표로 옮깁니다. 구분과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 남습니다.');
    return '<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">' + kbb.MOVE_TITLE[kind] + ' — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h3><div class="modal-scroll tm-m-body">' +
      '<p class="tm-note">' + note + '</p>' + sel + '<div id="hb-m-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions"><span id="hb-m-why" class="tm-why"></span><button type="button" id="hb-m-cancel">취소</button>' +
      '<button type="button" id="hb-m-go" class="pp-next-btn" aria-describedby="hb-m-why">' + esc(kbb.moveGoText(kind, o.year)) + '</button></div></div>';
  };
  // 사유 목록은 서버 코드표(GET /bid-targets의 codes.cancel_reasons)만 쓴다 — 코드를 화면이 지어내지 않는다. 기타의 코드는 'ETC'.
  kbb.cancelDialogHtml = function (r, o) {
    o = o || {};
    const rs = (o.reasons || []).map(function (x) {
      return '<label class="hb-rd"><input type="radio" name="hb-c-rs" value="' + esc(x.code) + '"> ' + esc(x.name) + '</label>';
    }).join('');
    return '<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">' + (r.kind === 'WATCH' ? '관심에서 빼기' : '목표에서 빼기') + ' — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h3><div class="modal-scroll tm-m-body">' +
      '<p class="tm-note">뺀 기록(누가·언제·사유)은 남고, ' + (r.kind === 'WATCH' ? '다시' : '같은 해에 다시') + ' 넣을 수 있습니다.</p>' +
      '<fieldset class="tm-fs"><legend>사유 (필수)</legend><div class="hb-opts v">' + rs + '</div>' +
      '<div class="hb-etc" id="hb-c-etcrow" hidden><div class="tm-reason-row"><label for="hb-c-etc">기타 사유 (필수)</label><span id="hb-c-cnt" class="tm-count">0/' + kbb.ETC_MAX + '</span></div>' +
      '<input type="text" id="hb-c-etc" maxlength="' + kbb.ETC_MAX + '" aria-describedby="hb-c-mh hb-c-cnt" value=""><p id="hb-c-mh" class="tm-note">사유에는 개인정보를 적지 마세요.</p></div></fieldset>' +
      '<div id="hb-c-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions"><span id="hb-c-why" class="tm-why"></span><button type="button" id="hb-c-cancel">취소</button>' +
      '<button type="button" id="hb-c-go" class="pp-danger" disabled aria-describedby="hb-c-why">' + (r.kind === 'WATCH' ? '관심에서 빼기' : '목표에서 빼기') + '</button></div></div>';
  };

  // ── 서버 요청(쓰기 머리글은 기존 bankcontract.js와 같은 규칙) ──────────────────
  kbb.env = { fetch: null };   // 시험이 가짜 fetch를 꽂는다
  function getFetch() { return kbb.env.fetch || (typeof fetch === 'function' ? fetch : null); }
  kbb.headers = function (button) { return { 'Content-Type': 'application/json', 'X-Screen-Id': kbb.SCREEN, 'X-Button-Id': button }; };
  function post(url, button, body) {
    const f = getFetch();
    if (!f) return Promise.resolve({ status: 0, body: null });
    return f(url, { method: 'POST', headers: kbb.headers(button), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, body: j }; }); },
        function () { return { status: 0, body: null }; });
  }
  kbb.saveTarget = function (id, body, button) { return post('/institutions/' + encodeURIComponent(id) + '/bid-targets', button || kbb.BTN.add, body); };
  kbb.cancelTarget = function (id, no, body) { return post('/institutions/' + encodeURIComponent(id) + '/bid-targets/' + encodeURIComponent(no) + '/cancel', kbb.BTN.cancel, body); };
  // 옮기기: 목표 ↔ 관심(버튼 move_to_goal·move_to_watch). body = { base_rev_no, to_kind_cd:'GOAL'|'WATCH', target_year? }
  kbb.moveTarget = function (id, no, body, button) { return post('/institutions/' + encodeURIComponent(id) + '/bid-targets/' + encodeURIComponent(no) + '/move', button, body); };
  // NEXT 105: 일괄 변경·자동 이월(입찰 현황판에서만 부른다)·협약 개시일. 버튼 이름은 tchange.BTN(서버 TargetUiIds) — kbb.BTN은 8개 그대로(시험이 고정).
  kbb.submitChanges = function (body) { return post('/bid-targets/changes', tc.BTN.change, body); };
  kbb.carryTargets = function () { return post('/bid-targets/carry', tc.BTN.carry, {}); };
  kbb.saveTerm = function (id, body) { return post('/institutions/' + encodeURIComponent(id) + '/bid-terms', tc.BTN.term, body); };
  // 저장·빼기 응답 해석. 서버 문구(detail.message)를 그대로 쓰고, 409 DUP_TARGET·STALE·LIMIT·ALREADY_CANCELLED와 400·422는 문구만 다르게 나눈다.
  // 서버 문구는 한글이 든 것만 쓴다 — 영문 오류 문구('institution not found' 등)는 화면에 내보이지 않고 한국어 고정 문구로 바꾼다(qa 11-17 P3-12).
  function korMsg(m) { return /[가-힣]/.test(String(m || '')) ? String(m) : ''; }
  kbb.outcome = function (x, op, c) {
    c = c || {};
    const s = x ? x.status : 0, d = x && x.body ? x.body.detail : null, p = errtext.parse(d), msg = korMsg(p.message);
    if (s === 201) {   // 진행 중 제안이 있는 올해 입찰 종료 기관은 막지 않고 warning을 붙여 준다(INST_BID_CLOSED)
      const w = x.body && x.body.warning;
      return w && typeof w === 'object' && w.code === 'INST_BID_CLOSED' ? { kind: 'saved', warning: { code: 'INST_BID_CLOSED', basis: kbb.closedOf(w.basis) } } : { kind: 'saved' };
    }
    if (s === 200) return { kind: 'nochange', msg: '바뀐 내용이 없습니다.' };
    const dd = d && typeof d === 'object' ? d : {}, lat = dd.latest && typeof dd.latest === 'object' ? dd.latest : null;
    if (s === 409 && p.code === 'DUP_TARGET') return { kind: 'dup', code: p.code, msg: '넣지 못했습니다 — 이미 ' + (c.year || '') + ' 목표에 있는 기관입니다.' };
    if (s === 409 && p.code === 'LIMIT') return { kind: 'limit', code: p.code, msg: msg || '이 기관의 목표 기록이 더 늘릴 수 없는 한도에 닿았습니다.' };
    // 목표·관심 어느 쪽에 이미 있음(고정 문장 + 상대 기록 요약의 번호·연도만 쓴다 — 서버 글을 그대로 내보이지 않는다)
    if (s === 409 && p.code === 'ALREADY_GOAL') {
      const yr = lat && Number(lat.target_year) || 0;
      // 옮기기 중에 받은 ALREADY_GOAL = 다른 해 목표가 남아 있다 — 방금 누른 [관심 기관으로…]를 다시 권하지 않고 다음 행동(그 목표를 먼저 빼기)을 말한다(qa 11-17 P2-1).
      if (op === 'move') return { kind: 'already', code: p.code, which: 'GOAL', year: yr, msg: '이 기관은 ' + (yr ? yr + ' ' : '다른 해 ') + '목표에도 들어 있어 관심 기관으로 옮길 수 없습니다. 그 목표를 먼저 빼 주세요.' };
      return { kind: 'already', code: p.code, which: 'GOAL', year: yr, msg: kbb.dupText('GOAL', yr) + ' ' + kbb.dupHint('GOAL') };
    }
    if (s === 409 && p.code === 'ALREADY_WATCH') {
      return { kind: 'already', code: p.code, which: 'WATCH', year: 0, msg: kbb.dupText('WATCH') + ' ' + kbb.dupHint('WATCH'), latest: lat ? { targetNo: lat.target_no, revNo: lat.rev_no } : null };
    }
    if (s === 409 && p.code === 'INST_BID_CLOSED') {
      const b = kbb.closedOf(dd.basis), ny = Array.isArray(dd.next_years) ? dd.next_years.map(Number).filter(function (y) { return y > 0; }) : [];
      return { kind: 'closed', code: p.code, basis: b, nextYears: ny, msg: '올해 입찰이 끝난 기관입니다.' + (b ? ' 근거: ' + kbb.basisText(b) + '.' : '') + ' 올해 목표로는 넣을 수 없습니다.' };
    }
    if (s === 409) return { kind: 'stale', code: p.code, msg: (msg ? msg + ' ' : '') + '목록을 다시 불러왔습니다.' };
    if (s === 400 || s === 422) return { kind: 'field', code: p.code, msg: msg || '입력한 내용을 확인하세요.' };
    if (s === 403 && p.code === 'APPROVAL_REQUIRED') return { kind: 'stale', code: p.code, msg: tc.APPROVAL_NOW_MSG };   // 결재 모드로 바뀐 서버 — 목록을 다시 읽어 모드를 바꾼다(NEXT 105 5-3)
    if (s === 401 || s === 403) return { kind: 'denied', msg: msg || (s === 401 ? '로그인이 필요합니다. 다시 로그인하세요.' : '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.') };
    if (s === 404) return { kind: 'error', msg: msg || '기관을 찾지 못했습니다.' };
    if (s === 0) return { kind: 'error', msg: '서버에 연결되지 않아 저장하지 못했습니다. 다시 시도하세요.' };
    return { kind: 'error', msg: msg || '저장하지 못했습니다(오류 ' + s + '). 다시 시도하세요.' };
  };
  kbb.flashAdded = function (name, year) { return name + dash.josaEul(name) + ' ' + year + ' 목표 기관에 넣었습니다.'; };
  kbb.flashTag = function (name, tagName) { return name + dash.josaEul(name) + ' \'' + tagName + '\'' + josaRo(tagName) + ' 바꿨습니다.'; };
  kbb.flashCancelled = function (name, year) { return name + dash.josaEul(name) + ' ' + year + ' 목표에서 뺐습니다.'; };
  kbb.flashWatchAdded = function (name) { return name + dash.josaEul(name) + ' 관심 기관에 넣었습니다.'; };
  kbb.flashWatchCancelled = function (name) { return name + dash.josaEul(name) + ' 관심에서 뺐습니다.'; };
  kbb.flashMoved = function (name, to, year) { return name + dash.josaEul(name) + (to === 'WATCH' ? ' 관심 기관으로 옮겼습니다.' : ' ' + year + ' 목표로 옮겼습니다.'); };
  kbb.warnFlash = function (w) { return w ? ' 올해 입찰이 끝난 것으로 기록되어 있습니다' + (w.basis ? '(근거: ' + kbb.basisText(w.basis) + ')' : '') + '. 진행 중인 제안이 있어 넣었습니다.' : ''; };

  // ── DOM ───────────────────────────────────────────────────────────
  const st = { preps: null, overview: null, prepSt: 'offline', ovSt: 'offline', prepCode: 0, ovCode: 0, err: '' };
  // 올해 목표 기관 상태: st = 'offline'|'loading'|'ok'|'denied'|'error', data = GET /bid-targets 응답, sum = { institutionId: 039 요약 항목 }, direct = endOpts().direct
  // tab = 'goal'|'watch', f = 화면 거르기(저장하지 않는다), sort = 탭마다 { key, dir }, wrows = 관심 줄(보이는 것), tbSig = 도구 줄을 다시 그려야 하는지 가르는 서명
  const gs = { year: 0, st: 'offline', code: 0, data: null, seq: 0, sumSt: 'idle', sum: {}, direct: {}, rows: [], wrows: [], busy: false, focusNext: null, retryFocus: '', optSig: '',
    tab: 'goal', f: { q: '', tag: '', status: '', kind: '', stage: -1 }, sort: { goal: { key: 'due', dir: 'asc' }, watch: { key: 'next', dir: 'asc' } }, tbSig: '', just: null, seeInst: '', recTab: '', recAll: false };   // recTab·recAll = 빈 상태 추천의 고른 묶음·펼침(화면 상태로만)
  let host = null, ac = null, LIST = [], ALL = null, OURS = [], G = null, BYID = {}, seq = 0, offNr = null, menu = null, dlg = null, pop = null, popInert = [], qTimer = null;
  gs.sel = tc.newSel(); gs.selMsg = ''; gs.carryTried = false; gs.carryTok = 0; gs.justIds = null;   // NEXT 105: 고른 줄·알림·자동 이월 한 번만·일괄 반영 강조
  let chd = null, trm = null, pnd = null;   // 일괄 요청 창·협약 개시일 창·결재 진행 중 창(공통 .dlg, dlg.js)
  let prepDenied403 = false;   // /preps·/workflow/overview가 둘 다 403으로 확정된 계정 — 화면을 열 때마다 다시 부르지 않는다(계정이 바뀌면 onProfileChange가 푼다, design 11-17 7절)
  const U = dash.util;
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function canEditNow() { return gs.st === 'ok' && !!gs.data && !!gs.data.can_edit; }   // 서버가 준 can_edit 하나로만 판정(버튼이 없어도 함수가 한 번 더 막는다 — qa 11-17)
  function KB() { return root.KB_VERIFIED; }
  function NX() { return root.KB_NEXT; }
  function endOpts() { return { lofin: root.LOFIN_2026, direct: gs.direct }; }   // direct = 직접 입력 금고 약정(/bank-contracts/summary의 국민은행 줄 term_to), 'region|name' → 'YYYY-MM-DD'
  // 다시 그리기 전 이 목록 안의 포커스(행·동작 버튼)를 기억했다가 같은 버튼으로 되돌린다(상세 팝업을 닫고 집계를 다시 받을 때 body로 떨어지지 않게). 세 목록 공통.
  // 복원 규칙(순수): a = { id, key, act, bid, sort }(포커스 요소의 속성). data-key·data-act·data-bid·data-sort가 하나라도 있으면 그것으로 짝을 찾고,
  // 없고 id가 있으면 id로 되돌리고(검색칸·탭·select), 둘 다 없으면 null — 아무 데도 옮기지 않는다(예전에는 속성이 없는 요소를 '첫 버튼'으로 옮겼다, qa 11-17 P1-1).
  kbb.focusPlan = function (a) {
    a = a || {};
    if (a.key || a.act || a.bid || a.sort || a.stage) {
      const p = { key: a.key || '', act: a.act || '', bid: a.bid || '', sort: a.sort || '' };
      if (a.stage) p.stage = String(a.stage);   // 제안 진행 단계 버튼(data-stage)은 다시 그린 뒤 같은 단계 버튼으로 돌아온다(qa 11-17 N-2)
      return p;
    }
    if (a.id) return { id: String(a.id) };
    return null;
  };
  function keepFocus(sc) {
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (!sc || !ae || !ae.getAttribute || !sc.contains(ae)) return null;
    return kbb.focusPlan({ id: ae.id || '', key: ae.getAttribute('data-key') || '', act: ae.getAttribute('data-act') || '', bid: ae.getAttribute('data-bid') || '', sort: ae.getAttribute('data-sort') || '', stage: ae.getAttribute('data-stage') || '' });
  }
  function restoreFocus(sc, keepKey) {
    if (!keepKey || !sc) return;
    // 다시 그린 뒤에도 포커스가 이 목록 안에 멀쩡히 있으면(paintToolbar가 id로 이미 되돌렸거나 요소를 다시 만들지 않았다) 덮어쓰지 않는다.
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae && ae !== document.body && ae !== sc && sc.contains(ae)) return;
    if (keepKey.id) {
      const el = sc.querySelector('#' + keepKey.id);
      if (el && el.focus) el.focus();
      return;
    }
    const els = sc.querySelectorAll('button');
    for (let i = 0; i < els.length; i += 1) {
      const b = els[i];
      if ((b.getAttribute('data-key') || '') === keepKey.key && (b.getAttribute('data-act') || '') === keepKey.act && (b.getAttribute('data-bid') || '') === keepKey.bid && (b.getAttribute('data-sort') || '') === (keepKey.sort || '') && (b.getAttribute('data-stage') || '') === (keepKey.stage || '')) { b.focus(); break; }
    }
  }
  function activeIdSet() {
    const set = {};
    dash.activePreps(st.preps).forEach(function (p) { const id = idOf(p); if (id) set[id] = true; });
    return set;
  }

  // /preps·overview 결과를 화면 상태로: 단계 카드는 둘 중 하나만 받아도 그리고, 준비 중 목록은 /preps가 와야 그린다.
  function progressState() {
    if (!U.serverMode() || !U.hasEmp()) return { state: 'offline' };
    if (st.prepSt === 'loading' || st.ovSt === 'loading') return { state: 'loading' };
    const okP = st.prepSt === 'ok', okO = st.ovSt === 'ok';
    if (okP || okO) return { state: 'ok', stages: dash.stageCounts(okP ? st.preps : null, okO ? st.overview : null) };
    const code = st.ovCode || st.prepCode;
    if (code === 401 || code === 403) return { state: 'denied', code: code };
    return { state: 'error' };
  }
  function panelState() {
    const base = progressState();
    if (base.state !== 'ok' || st.prepSt === 'ok') return base;
    return { state: (st.prepCode === 401 || st.prepCode === 403) ? 'denied' : 'error', code: st.prepCode };
  }

  function renderBanner() {
    const el = $('hb-err');
    if (!el) return;
    let t = st.err;
    if (!t && !U.serverMode()) {
      t = (root.location && root.location.protocol === 'file:')
        ? '서버에 연결되지 않은 파일 모드입니다. 내장 자료만 보여 주며 진행 건수와 [제안 확정]은 쓸 수 없습니다.'
        : '서버의 기관 정보를 불러오지 못해 내장 자료만 보여 줍니다. 제안 진행 표시와 [제안 확정]은 쓸 수 없습니다. <button type="button" id="hb-reload">다시 불러오기</button>';
    }
    el.innerHTML = t && st.err ? esc(st.err) : t;
    el.setAttribute('role', st.err || (root.location && root.location.protocol !== 'file:') ? 'alert' : 'status');
    el.style.display = el.innerHTML ? '' : 'none';
  }

  // 1번 구획: 협약 중인 기관 — 머리(큰 숫자·종류별 내역·와플) + 협약 종료일 순 목록 + 각주
  function selYears() {
    const y0 = U.todayDate().getFullYear();
    return gs.data && Array.isArray(gs.data.selectable_years) && gs.data.selectable_years.length ? gs.data.selectable_years.map(Number) : [y0, y0 + 1, y0 + 2];
  }
  // 협약 중인 기관은 모달 팝업(규격 6-10)에서 보인다. 자료(G)는 팝업이 닫혀 있어도 늘 계산한다 — 빈 후보·상세 팝업이 쓴다.
  function renderOurs() {
    G = kbb.groups(OURS, U.todayDate(), KB(), NX(), endOpts());
    const btn = $('hb-ours-btn');
    if (btn) { btn.innerHTML = '협약 중인 기관 <b>' + kbb.summary(OURS, KB(), NX()).total + '</b>곳'; btn.removeAttribute('aria-disabled'); }   // 자료를 받으면 해제(받기 전에는 눌러도 열리지 않는다 — design 11-17 P3-3)
    const sc = $('hb-oscroll');
    if (!sc) return;
    const keepKey = keepFocus(sc);
    const act = activeIdSet();
    // 이미 걸린 줄은 칩, 종료가 선택 가능 연도 안이고 아직 목표·관심이 아니며 국민은행 확정·올해 입찰 종료가 아닌 줄만 [목표에 넣기](영업부서만)
    const goalIds = {}, watchIds = {};
    if (gs.st === 'ok' && gs.data) {
      (gs.data.items || []).forEach(function (t) { goalIds[String(t.institution_id)] = true; });
      (gs.data.watch_items || []).forEach(function (t) { watchIds[String(t.institution_id)] = true; });
    }
    const vy = gs.data && Number(gs.data.year) > 0 ? Number(gs.data.year) : 0;   // 종료 숨김은 보고 있는 목표 연도가 올해일 때만(서버 bid_closed와 같은 규칙, qa 11-19 P3-2)
    const yrs = selYears(), can = canEditNow(), closedNow = !vy || vy === U.todayDate().getFullYear() ? closedIdsNow() : {};
    const ul = function (items, lab) {
      return '<ul aria-labelledby="' + lab + '">' + items.map(function (it) {
        const id = String(it.rec.institutionId || ''), isNext = dash.oursKind(it.rec, KB(), NX()) === 'next';
        const mark = goalIds[id] ? (gs.data.year + ' 목표') : (watchIds[id] ? '관심' : '');
        return kbb.rowHtml(it, { verified: KB(), nextList: NX(), sum: (gs.sum || {})[id] || null, today: U.todayDate(), prepActive: !!(it.rec.institutionId && act[id]), mark: mark,
          canAdd: kbb.popCanAdd(it, { mark: mark, can: can, isNext: isNext, verified: KB(), closedIds: kbb.inProgress(it.rec, st.preps, st.overview) ? null : closedNow, years: yrs }),   // 제안 진행 중이면 숨기지 않는다(추가 창 computeWarn 'progress'와 같게)
          canWatch: kbb.popCanWatch(it, { mark: mark, can: can, verified: KB(), noWatch: noWatchNow() }) });
      }).join('') + '</ul>';
    };
    let h = '';
    if (G.soon.length) h += '<div class="db-grp" id="hb-g1">' + kbb.soonLabel(G.soon.length, G.pastN) + '</div>' + ul(G.soon, 'hb-g1');
    if (G.later.length) h += '<div class="db-grp" id="hb-g2">' + kbb.laterLabel(G.later.length) + '</div>' + ul(G.later, 'hb-g2');
    if (G.unk.length) h += '<div class="db-grp" id="hb-g3">' + kbb.unkLabel(G.unk.length) + '</div>' + ul(G.unk, 'hb-g3');
    if (G.next.length) h += '<div class="db-grp" id="hb-g4">' + kbb.nextLabel(G.next.length) + '</div>' + ul(G.next, 'hb-g4');
    sc.innerHTML = h || '<p class="db-state">' + esc(kbb.OURS_EMPTY) + '</p>';
    restoreFocus(sc, keepKey);
    const c = kbb.summary(OURS, KB(), NX());
    const fig = $('hb-ofig');
    if (fig) fig.innerHTML = kbb.figHtml(c, G.soon.length);
    const sum = $('hb-osum');
    if (sum) sum.innerHTML = kbb.breakdownHtml(c);
    renderWaffle();
    const foot = $('hb-ofoot');
    if (foot) foot.innerHTML = kbb.footBoxHtml(dash.OURS_SCOPE, kbb.bankUnknownN(LIST));
    renderOursHead();
    const box = $('hb-ours');
    if (box) box.setAttribute('aria-busy', 'false');
  }
  // 접힌 구획의 요약 줄: '협약 중인 기관 27곳 · 협약 종료 1년 안 8곳 · 그중 목표 4곳'
  function targetIds() {
    const set = {};
    if (gs.st === 'ok' && gs.data && Array.isArray(gs.data.items)) gs.data.items.forEach(function (t) { set[String(t.institution_id)] = true; });
    return set;
  }
  function renderOursHead() {
    const el = $('hb-osm');
    if (!el || !G) return;
    const ids = targetIds();
    const goalN = gs.st === 'ok' ? G.soon.filter(function (it) { return ids[String(it.rec && it.rec.institutionId || '')]; }).length : null;
    el.innerHTML = kbb.oursHeadHtml(kbb.summary(OURS, KB(), NX()).total, G.soon.length, goalN);
  }

  // 1번 구획 머리의 와플(지자체 243곳 중 국민은행 협약 16곳). 자료가 비면 0곳 와플로 '모두 다른 은행'이라 말하지 않고 안내 한 줄만.
  function renderWaffle() {
    const el = $('hb-waf');
    if (!el) return;
    if (!(Array.isArray(KB()) && KB().length)) { el.innerHTML = '<p class="db-state">국민은행 금고 자료를 불러오지 못했습니다. 화면을 새로 고치세요.</p>'; return; }
    const kb = dash.kbCount(LIST, KB());
    el.innerHTML = '<span class="cap">국민은행 금고 협약 · 지자체 기준</span>' + dash.waffleHtml(kb) +
      '<p class="lg"><span><i class="k"></i>국민은행 <b>' + kb.confirmed + '</b></span><span><i></i>다른 은행 <b>' + kb.unconfirmed + '</b></span></p>';
  }

  // 한 줄의 [제안 확정] 판정: 상세 팝업과 같은 규칙(actionKind). 제안 진행 자료를 받는 중이면 'wait'.
  function actOf(rec) {
    if (kbb.inProgress(rec, st.preps, st.overview)) return 'open';   // 진행 기록이 있으면(/preps 또는 overview) [제안 확정] 대신 단계 배지(qa 11-17 P3-4)
    let act = dash.actionKind(rec, U.actCtx(), dash.activePreps(st.preps), root.prep, U.gateOpts());
    if (st.prepSt === 'loading' && act !== 'unavailable') act = 'wait';
    return act;
  }
  function badgeOf(rec) {
    const id = String(rec && rec.institutionId || ''), Pp = P();
    const e = kbb.prepEntries(st.preps, st.overview).filter(function (x) { return x.id === id; })[0];
    return e && e.row && Pp && Pp.listRowModel ? Pp.listRowModel(e.row).badge : { cls: 'pp-neutral', text: '사전준비 중' };
  }
  // ── 목표 표 ────────────────────────────────────────────────────────
  function goalYear() { return gs.year || U.todayDate().getFullYear(); }
  function yearList() {
    const y0 = U.todayDate().getFullYear();
    const ys = gs.data && Array.isArray(gs.data.selectable_years) && gs.data.selectable_years.length ? gs.data.selectable_years.slice() : [y0, y0 + 1];
    if (ys.indexOf(goalYear()) < 0) ys.unshift(goalYear());
    return ys;
  }
  function tagList() {
    const t = gs.data && gs.data.codes && Array.isArray(gs.data.codes.tags) ? gs.data.codes.tags : [];
    return t.length ? t : [{ code: 'RETAIN', name: kbb.TAG.RETAIN }, { code: 'NEW', name: kbb.TAG.NEW }];
  }
  function tagOpts() { return { lofin: root.LOFIN_2026, verified: KB(), today: U.todayDate(), direct: gs.direct, sumById: gs.sum }; }
  function goalCtx() {
    const ps = panelState(), entries = {};
    if (ps.state === 'ok') kbb.prepEntries(st.preps, st.overview).forEach(function (e) { entries[e.id] = e; });
    return { byInst: BYID, sumById: gs.sum, today: U.todayDate(), verified: KB(), lofin: root.LOFIN_2026, entries: entries, prepOk: ps.state === 'ok',
      snap: root.noticerec && root.noticerec.snap ? root.noticerec.snap() : null,
      delayDays: gs.data && Number(gs.data.delay_days) > 0 ? Number(gs.data.delay_days) : kbb.DELAY_DEFAULT, actOf: actOf, years: selYears(), year: gs.data && Number(gs.data.year) > 0 ? Number(gs.data.year) : 0 };
  }
  // 옛 서버(관심 기관 기능 044 없음): 목록을 받았는데 watch_items가 배열이 아니다 — 관심 탭·[관심 기관으로…]·관심 추가를 숨긴다(qa 11-17 P3-2)
  function noWatchNow() { return gs.st === 'ok' && !!gs.data && !Array.isArray(gs.data.watch_items); }
  // 목표·관심 어느 쪽이든 이미 걸린 기관(빈 후보에서 뺀다)
  function takenIds() {
    const set = targetIds();
    if (gs.st === 'ok' && gs.data && Array.isArray(gs.data.watch_items)) gs.data.watch_items.forEach(function (t) { set[String(t.institution_id)] = true; });
    return set;
  }
  function renderTop() {
    const ok = gs.st === 'ok' && !!gs.data, can = ok && !!gs.data.can_edit;
    const add = $('hb-add'); if (add) add.hidden = !can;
    const ro = $('hb-ro'); if (ro) ro.hidden = !(ok && !can);
    const sel = $('hb-year');
    if (sel) {
      const ys = yearList(), sig = ys.join(',') + '|' + goalYear();
      if (sig !== gs.optSig) { sel.innerHTML = ys.map(function (y) { return '<option value="' + esc(y) + '">' + esc(y) + ' 목표</option>'; }).join(''); sel.value = String(goalYear()); gs.optSig = sig; }
      sel.disabled = gs.st === 'offline';
    }
  }
  // 방금 넣거나 옮긴 줄(·관심 탭)을 잠깐 강조한다(.hb-just). 받는 중이면 기다린다. 4초 뒤 클래스를 뗀다(동작 줄이기에서는 정지 틴트가 이때 사라진다).
  function applyJust() {
    const j = gs.just;
    if (!j || gs.st === 'loading') return;
    gs.just = null;
    let el = null;
    if (j.tab) el = $('hb-tab-' + j.tab);
    else if (j.inst) {
      const sc = $('hb-goals'), bs = sc ? sc.querySelectorAll('button.hb-nm') : [];
      for (let i = 0; i < bs.length; i += 1) { if (bs[i].getAttribute('data-inst') === j.inst) { el = bs[i].closest ? bs[i].closest('tr') : null; break; } }
    }
    if (!el || !el.classList) return;
    el.classList.add('hb-just');
    setTimeout(function () { el.classList.remove('hb-just'); }, 4000);
  }
  // 결과 알림의 [관심 탭에서 보기]: 버튼만 떼고(문장은 두어 같은 말을 다시 읽지 않게) 그 줄로 간다. 관심 탭으로 넘어가고 줄에 포커스·강조.
  function seeWatch() {
    const a = $('hb-flash-act'); if (a) a.innerHTML = '';
    showRow('watch', gs.seeInst || '', 0);
  }
  // 줄 누른 뒤 포커스를 옮길 곳(추가한 기관의 이름·뺀 뒤 다음 줄 이름, 없으면 [목표 기관 추가])
  function applyFocusNext() {
    const f = gs.focusNext;
    if (!f || gs.st === 'loading') return;
    gs.focusNext = null;
    if (f.note) {   // 목표→관심으로 옮긴 뒤: 그 줄은 이 표에 없다 — 결과 알림의 [관심 탭에서 보기]로(없으면 [목표 기관 추가]). design 11-19 4-4
      const nb = $('hb-see-watch'), ad = $('hb-add'), tg = nb || (ad && !ad.hidden ? ad : null);
      if (tg && tg.focus) tg.focus();
      return;
    }
    let el = null;
    const sc = $('hb-goals');
    if (f.inst && sc) {
      const bs = sc.querySelectorAll('button.hb-nm');
      for (let i = 0; i < bs.length; i += 1) { if (bs[i].getAttribute('data-inst') === f.inst) { el = bs[i]; break; } }
    }
    // 방금 넣거나 옮긴 줄이 거르기(검색·구분·상태·종류·단계)에 가려졌으면 거르기를 풀고 한 번 더 그려 그 줄로 간다(qa 11-17 P2-2).
    if (!el && f.reveal && f.inst && gs.st === 'ok' && kbb.filterOn(gs.f)) {
      gs.f = { q: '', tag: '', status: '', kind: '', stage: -1 };
      clearQInput();
      gs.focusNext = { inst: f.inst };
      cancelQ();
      renderGoals();
      return;
    }
    if (!el) { const a = $('hb-add'); if (a && !a.hidden) el = a; }
    if (el && el.focus) el.focus();
  }
  // [다시 시도]를 누른 뒤 다시 그리면 눌렀던 버튼이 사라져 포커스가 body로 떨어진다 — 받기가 끝나면 같은 버튼(또 실패)이나 표 영역(성공)으로 돌려놓는다(qa 11-17 P3-7).
  function applyRetryFocus() {
    const id = gs.retryFocus;
    if (!id) return;
    if (id === 'hb-gretry' ? gs.st === 'loading' : (st.prepSt === 'loading' || st.ovSt === 'loading')) return;
    gs.retryFocus = '';
    const el = $(id) || $('hb-goals');
    if (el && el.focus) el.focus();
  }
  // 표 도구 줄: 구조(탭·선택값·단계 칩·건수)가 같으면 건수·[필터 지우기]·검색칸 표시만 고친다 — 한글 입력 중 검색칸을 다시 만들면 입력(조합)이 끊긴다.
  function paintToolbar(v) {
    const tb = $('hb-tb');
    if (!tb) return;
    const f = v.f, sig = [v.tab, v.nGoal, v.nWatch, f.tag, f.status, f.kind, f.stage, v.canEdit, v.loaded, v.noWatch].join('|');
    const setCnt = function (c) { const h = kbb.cntHtml(v.shown, v.total); if (c && c.hbH !== h) { c.innerHTML = h; c.hbH = h; } };   // 같으면 다시 쓰지 않는다(같은 말을 또 읽지 않게)
    if (sig === gs.tbSig && tb.firstChild) {
      setCnt($('hb-cnt'));
      const x = $('hb-fclear'); if (x) x.hidden = !kbb.filterOn(f);
      const q = $('hb-q'); if (q) q.classList.toggle('on', !!String(f.q || '').trim());
      return;
    }
    gs.tbSig = sig;
    const ae = typeof document !== 'undefined' ? document.activeElement : null, keep = ae && tb.contains(ae) ? ae.id : '';
    // #hb-cnt(role=status)는 도구 줄을 다시 만들어도 같은 노드를 떼었다 되꽂는다 — 새 노드면 스크린 리더가 바뀐 건수를 알리지 못한다(design 11-17 P2-1).
    let cnt = $('hb-cnt');
    if (cnt && cnt.parentNode) cnt.parentNode.removeChild(cnt);
    if (cnt) gs.cntEl = cnt; else cnt = gs.cntEl;
    tb.innerHTML = v.loaded ? kbb.toolbarHtml(v) : '';
    const fresh = $('hb-cnt');
    if (fresh && cnt && fresh.parentNode) fresh.parentNode.replaceChild(cnt, fresh);
    setCnt($('hb-cnt'));
    if (keep) { const el = $(keep); if (el && el.focus) el.focus(); }
  }
  function renderGoals() {
    const ts = $('hb-ts');
    if (!ts || !ALL) return;
    const sc = $('hb-goals'), keepKey = keepFocus(sc);
    const win = kbb.laneWindow(U.todayDate(), goalYear());
    const ok = gs.st === 'ok' && !!gs.data, ctx = goalCtx(), ps = panelState(), prepCode = ps.code || st.prepCode || st.ovCode || 0;
    // 전체 줄 모델(거르기 전): 목표 줄·목표 밖 준비 줄·관심 줄. 띠·단계 수는 전체 모델로 세고, 표는 거른 뒤 정렬한다.
    let rows = [], out = [], wrows = [], groups = [];
    if (ok) {
      rows = kbb.goalRows(gs.data.items, ctx);
      wrows = kbb.goalRows(gs.data.watch_items, ctx);
      const ids = takenIds();
      if (ctx.prepOk) out = kbb.outRows(kbb.prepRows(st.preps, st.overview, LIST, U.todayDate()), ids, ctx);
      groups = kbb.candGroups(ALL, ids, G, KB());
    }
    const noWatch = noWatchNow();
    if (noWatch && gs.tab === 'watch') gs.tab = 'goal';   // 옛 서버에는 관심 탭이 없다
    const mode = ok ? tc.modeOf(gs.data) : null;   // NEXT 105: DIRECT·APPROVAL이면 고르기 열 + 바닥 띠. 옛 서버·보기 전용은 null
    if (ok) tc.reconcile(gs.sel, rows, wrows, Number(gs.data.year));   // 잠겼거나 사라진 줄은 고른 것에서 빼고 남은 줄의 기록 번호는 제자리 갱신
    if (ok && !mode && tc.selCount(gs.sel)) tc.clearSel(gs.sel);   // 응답이 ok이고 모드가 없다고 확정됐을 때만 비운다 — 로딩·오류 중에는 고른 줄을 지킨다(STALE 뒤 새 기록 번호로 갱신)
    const watch = gs.tab === 'watch', canEdit = ok && !!gs.data.can_edit;
    const total = watch ? wrows.length : rows.length + out.length, f = gs.f, sorted = gs.sort[watch ? 'watch' : 'goal'];
    const fx = watch ? Object.assign({}, f, { stage: -1, kind: '' }) : f;   // 단계·종류는 목표 탭에만 있다
    const dRows = kbb.sortBy(kbb.filterRows(watch ? wrows : rows, fx), sorted.key, sorted.dir);
    const dOut = watch ? [] : kbb.sortBy(kbb.filterRows(out, f), sorted.key, sorted.dir);
    gs.rows = dRows.concat(dOut); gs.wrows = watch ? dRows : [];
    const counts = kbb.stageCounts(rows.concat(out));
    ts.setAttribute('role', 'tabpanel');
    if (ok) ts.setAttribute('aria-labelledby', 'hb-tab-' + gs.tab); else ts.removeAttribute('aria-labelledby');   // 도구 줄(탭)이 있을 때만 — 없는 id를 가리키지 않는다(qa 11-17 P3-4)
    ts.innerHTML = kbb.goalTableHtml({ st: gs.st, code: gs.code, year: goalYear(), win: win, tab: gs.tab, rows: dRows, out: dOut, canEdit: canEdit, groups: groups, recTab: gs.recTab, recAll: gs.recAll, prep: ps.state, prepCode: prepCode,
      sort: sorted, total: total, filtered: total > 0 && kbb.filterOn(fx), noWatch: noWatch, nGoal: rows.length, nOut: out.length, selCol: !!mode, picked: tc.pickedMap(gs.sel) });
    paintToolbar({ tab: gs.tab, nGoal: rows.length, nWatch: wrows.length, f: f, stageName: f.stage >= 0 ? (dash.STAGES[f.stage] || {}).label : '', shown: dRows.length + dOut.length, total: total, canEdit: canEdit, loaded: ok, noWatch: noWatch });
    const band = $('hb-band');
    if (band) {
      band.innerHTML = kbb.bandHtml(kbb.bandModel(rows, { prepOk: ctx.prepOk, delayDays: ctx.delayDays }), { year: goalYear(), loaded: ok, prep: ps.state, prepCode: prepCode }) +
        kbb.stagesHtml(counts, { ok: ok && ctx.prepOk, active: f.stage, why: ok ? kbb.prepWhy(ps.state, prepCode) : '', nOut: out.length, outCounts: kbb.stageCounts(out) });
      band.setAttribute('aria-busy', gs.st === 'loading' ? 'true' : 'false');
      band.setAttribute('aria-label', goalYear() + ' 목표 요약');
    }
    const ft = $('hb-tf'); if (ft && ALL) ft.innerHTML = kbb.goalFootHtml(ALL.notice.length);
    const box = $('hb-goals'); if (box) box.setAttribute('aria-busy', gs.st === 'loading' ? 'true' : 'false');
    paintSel();   // 머리 체크박스 상태·바닥 띠(restoreFocus·applyFocusNext 앞 — 시험이 이 둘의 연속을 지킨다)
    renderTop();
    renderOursHead();
    restoreFocus(sc, keepKey);
    applyFocusNext();
    applyJust();
    applyRetryFocus();
  }

  function renderAll() {
    const asof = $('hb-asof');
    if (asof) asof.textContent = logic.localDateStr(U.todayDate());
    renderBanner(); renderOurs(); renderGoals();
  }

  function refreshData() {
    LIST = U.dataList();
    ALL = dash.model(LIST, U.todayDate());
    OURS = kbb.ours(LIST, KB(), undefined, NX());
    BYID = {};
    logic.dedupeByInstitution(LIST).forEach(function (r) { if (r.institutionId) BYID[String(r.institutionId)] = r; });
    gs.direct = kbb.directEnds(gs.sum, BYID);
    renderAll();
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  function loadProgress() {
    if (!U.serverMode() || !U.hasEmp()) { st.prepSt = st.ovSt = 'offline'; st.preps = st.overview = null; renderOurs(); renderGoals(); return Promise.resolve(); }
    if (prepDenied403) {   // 이 계정은 제안 진행을 볼 수 없다고 이미 확정 — 다시 부르지 않는다(콘솔 403이 화면을 열 때마다 쌓이던 것)
      st.prepSt = st.ovSt = 'denied'; st.prepCode = st.ovCode = 403; st.preps = st.overview = null;
      renderOurs(); renderGoals();
      return Promise.resolve();
    }
    const my = ++seq;
    st.prepSt = st.ovSt = 'loading';
    renderGoals();
    return Promise.all([fetchJson('/preps'), fetchJson('/workflow/overview')]).then(function (res) {
      if (my !== seq || !host) return;
      const p = res[0], o = res[1];
      st.prepSt = p.status; st.prepCode = p.code || 0; st.preps = p.status === 'ok' ? (Array.isArray(p.data) ? p.data : (p.data && p.data.items) || []) : null;
      st.ovSt = o.status; st.ovCode = o.code || 0; st.overview = o.status === 'ok' ? o.data : null;
      if (p.status === 'denied' && o.status === 'denied' && p.code === 403 && o.code === 403) prepDenied403 = true;
      renderOurs(); renderGoals();
    });
  }
  // 올해 목표 기관(GET /bid-targets?year=)과 전 기관 금고 약정 요약(GET /bank-contracts/summary, 처음 한 번). 요약을 못 받아도 표는 그린다(현 금고 은행은 행안부 자료·'확인 안 됨').
  function loadGoals() {
    if (!U.serverMode() || !U.hasEmp()) { gs.st = 'offline'; gs.data = null; renderGoals(); return Promise.resolve(); }
    const my = ++gs.seq, needSum = gs.sumSt !== 'ok';
    gs.st = 'loading';
    if (needSum) gs.sumSt = 'loading';
    renderGoals();
    return Promise.all([fetchJson('/bid-targets?year=' + encodeURIComponent(goalYear())), needSum ? fetchJson('/bank-contracts/summary') : Promise.resolve(null)]).then(function (res) {
      if (my !== gs.seq || !host) return;
      const t = res[0], s = res[1];
      if (s) {
        if (s.status === 'ok') {
          gs.sum = {};
          ((s.data && s.data.items) || []).forEach(function (x) { if (x && x.institution_id) gs.sum[String(x.institution_id)] = x; });
          gs.sumSt = 'ok';
          gs.direct = kbb.directEnds(gs.sum, BYID);
        } else gs.sumSt = 'error';
      }
      gs.st = t.status; gs.code = t.code || 0; gs.data = t.status === 'ok' && t.data ? t.data : null;
      if (t.status === 'ok' && !gs.data) gs.st = 'error';
      if (gs.data && dash.setGoals) dash.setGoals(gs.data);   // 올해 목표 기관 집합 공유(사용자 11-19 Q2) — 올해가 아닌 연도 응답은 setGoals가 무시한다
      renderGoals(); renderOurs();   // 협약 종료일이 직접 입력 값으로 바뀌었을 수 있어 1번 목록도 다시 그린다
      applyJustMany();                              // NEXT 105: 일괄 반영한 줄 강조
      if (dlg && dlg.kind === 'add') paintAdd();    // 모드가 바뀌었으면 추가 창의 단추 글자도(APPROVAL_REQUIRED 뒤)
      maybeCarry();                                 // carry_due > 0이면 자동 이월 한 번(이 화면에서만)
    });
  }

  // act === 'watch'이면 알림 옆에 [관심 탭에서 보기]. 문장은 textContent, 버튼은 고정 마크업. 알림 띠(#hb-note)는 문장이 있을 때만 보인다(숨겼다 켜는 것은 예전 .db-flash:empty와 같은 패턴).
  function flash(msg, act) {
    const n = $('hb-note'); if (n) n.hidden = !msg;   // 띠를 먼저 보이게 한 뒤 글을 넣는다(role=status가 보이는 상태에서 바뀐 글을 읽도록, qa 11-19 P3-3)
    const f = $('hb-flash'); if (f) f.textContent = msg || '';
    const a = $('hb-flash-act'); if (a) a.innerHTML = msg && act === 'watch' ? kbb.seeWatchHtml() : '';
    if (a && msg && act && act !== 'watch') a.innerHTML = tc.actHtml(act);   // NEXT 105: 결재함에서 보기·넘어온 기관만 보기(고정 마크업)
    if (n && msg && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
  }

  function goNotice(key) {
    const A = root.app, N = root.nav;
    if (!A || !A.openNavItem || !N) return false;
    const ok = A.openNavItem(N.NOTICE_ID);
    if (ok && key && dash.selectKey) dash.selectKey(key);
    return ok;
  }
  // 입찰 공고 현황으로 간다. 못 열면(둘러보기·파일 모드·탭이 가득 참 등) 안내를 띄운다.
  function openNotice(key) {
    if (goNotice(key)) { flash(''); return true; }
    flash('입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.');
    return false;
  }
  // 행·[제안 확정] 버튼 모두 상세 팝업을 연다(목록에서 바로 저장하지 않는다). focus = 'confirm'이면 팝업의 [제안 확정]으로 포커스를 옮긴다.
  function openOurs(btn, focus) {
    const key = btn.getAttribute('data-key');
    const pool = (G ? G.soon.concat(G.later, G.unk, G.next) : []).concat(gs.rows.concat(gs.wrows).map(function (r) { return r.it; }).filter(Boolean));
    let it = pool.filter(function (x) { return x.key === key; })[0];
    if (!it) { const rc = btn.getAttribute('data-inst') ? BYID[btn.getAttribute('data-inst')] : null; if (rc) it = dash.itemForRec(rc, U.todayDate()); }   // 빈 후보·관심 줄(기관 자료가 없으면 열지 않는다)
    if (!it) return;
    // 닫은 뒤 포커스(qa 11-17 P2-1): 구획(목표 표·협약 중인 기관 팝업)마다 맞는 fallback, opener가 사라졌으면 같은 구획에서 같은 data-key(+data-act) 요소를 다시 찾는다.
    // 협약 중인 기관 팝업의 줄을 누르면 팝업을 닫고(모달을 겹쳐 쌓지 않는다) 상세를 연다 — 상세를 닫으면 [협약 중인 기관] 버튼으로 돌아온다(규격 6-10).
    const colEl = btn.closest ? btn.closest('#hb-ours, #hb-goals') : null, colId = colEl && colEl.id ? colEl.id : 'hb-ours', act = btn.getAttribute('data-act') || '';
    const fromPop = colId === 'hb-ours';
    // 한 단계 뒤로(design 11-19 6-1): 협약 목록에서 연 상세의 [이전]·×·Esc는 목록을 다시 열고 보던 스크롤과 눌렀던 줄을 되살린다.
    // 막(바깥) 클릭은 전체 닫기라 opener([협약 중인 기관] 버튼)로 돌아간다. 목록 안의 [목표에 넣기]·[관심에 넣기](oadd·owatch)는 다음 묶음.
    let back = null;
    if (fromPop) {
      const sc = $('hb-oscroll'), top = sc ? sc.scrollTop : 0;
      back = { label: '협약 중인 기관 목록', go: function () {
        openPop();
        const sc2 = $('hb-oscroll'); if (sc2) sc2.scrollTop = top;
        const rows = pop ? Array.prototype.slice.call(pop.querySelectorAll('.hb-row')) : [];
        const row = rows.filter(function (x) { return x.getAttribute('data-key') === key; })[0];
        const tg = row || $('hb-ours-close'); if (tg && tg.focus) tg.focus();
      } };
      closePop(false);
    }
    dash.openDetail(it.rec, { opener: fromPop ? ($('hb-ours-btn') || btn) : btn, screen: 'bid_board', fallback: fromPop ? '#hb-ours-btn' : '#' + colId, focus: focus || '', back: back,
      refocus: function () { return fromPop ? null : kbb.findOpener($(colId), key, act); } });
  }

  // ── 구분 메뉴(규격 6-E ②) ──────────────────────────────────────────
  function rowOfBtn(btn, out) {
    const id = btn.getAttribute('data-inst') || '';
    return gs.rows.concat(gs.wrows).filter(function (r) { return r.id === id && !!r.out === !!out; })[0] || null;
  }
  function say(msg, isErr, act) {
    st.err = isErr ? msg : '';
    renderBanner();
    flash(isErr ? '' : msg, act);
  }
  function closeMenu(refocus) {
    if (!menu) return;
    const m = menu;
    menu = null;
    document.removeEventListener('mousedown', m.onDoc, true);
    window.removeEventListener('resize', m.onAway);
    document.removeEventListener('scroll', m.onAway, true);
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    m.btn.setAttribute('aria-expanded', 'false');
    if (refocus && document.body.contains(m.btn)) m.btn.focus();
  }
  function openMenu(btn) {
    const r = rowOfBtn(btn, false);
    if (!r || gs.busy || !canEditNow()) return;
    closeMenu(false);
    const wrap = document.createElement('div');
    wrap.innerHTML = kbb.menuHtml(r, { tags: tagList(), def: kbb.fitTag(kbb.defaultTag(r.rec, gs.sum[r.id], tagOpts()), tagList()), canCancel: r.canCancel,
      canMove: r.kind !== 'WATCH' && !noWatchNow(), cancelText: r.kind === 'WATCH' ? '관심에서 빼기…' : '',
      canTerm: r.kind !== 'WATCH' && !!r.judgeFrom && !r.pend, judgeText: tc.judgeText(r) });   // judge_from이 있는 서버만 협약 개시일 항목
    const el = wrap.firstChild;
    document.body.appendChild(el);
    const b = btn.getBoundingClientRect(), mw = el.offsetWidth, mh = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(b.left, window.innerWidth - mw - 8)) + 'px';
    el.style.top = (b.bottom + 4 + mh > window.innerHeight - 8 ? Math.max(8, b.top - mh - 4) : b.bottom + 4) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    const m = { el: el, btn: btn, r: r };
    m.onDoc = function (ev) { if (!el.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) closeMenu(false); };
    m.onAway = function (ev) { if (ev && ev.target && el.contains(ev.target)) return; closeMenu(false); };
    document.addEventListener('mousedown', m.onDoc, true);
    window.addEventListener('resize', m.onAway);
    document.addEventListener('scroll', m.onAway, true);
    el.addEventListener('keydown', function (ev) {
      const items = Array.prototype.slice.call(el.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
      else if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
      else if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
      else if (ev.key === 'Tab') closeMenu(true);   // 칩으로 되돌린 뒤 Tab이 칩에서 다음으로 넘어간다(포커스가 body로 떨어지지 않게 — qa 11-17 P3-5)
    });
    el.addEventListener('click', function (ev) {
      const it = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!it) return;
      const cmd = it.getAttribute('data-cmd');
      if (cmd === 'cancel') { closeMenu(false); if (isApproval() && r.kind !== 'WATCH') openChange({ rows: [r], op: 'CANCEL', opener: btn }); else openCancel(r, btn); return; }
      if (cmd === 'term') { closeMenu(false); openTerm(r, btn); return; }
      if (cmd === 'towatch' || cmd === 'tonext') { closeMenu(false); if (isApproval()) openChange(moveChange(r, cmd, btn)); else openMove(cmd, r, btn); return; }
      const code = it.getAttribute('data-tag');
      if (!code) return;
      if (code === r.tagCd) { closeMenu(true); return; }
      closeMenu(true);
      if (isApproval() && r.kind !== 'WATCH') openChange({ rows: [r], op: 'EDIT', tag: code, opener: btn }); else changeTag(r, code, btn);   // 목표 구분 고치기는 결재 대상, 관심은 바로
    });
    menu = m;
    const first = el.querySelector('button[aria-checked="true"]') || el.querySelector('button');
    if (first) first.focus();
  }
  // 구분을 고르면 바로 저장한다(되돌리기 쉬움, 감사 버튼 이름 change_target_tag). 저장 중에는 칩에 aria-busy.
  function changeTag(r, code, btn) {
    if (gs.busy || !canEditNow()) return;
    gs.busy = true;
    btn.setAttribute('aria-busy', 'true');
    const body = { target_no: r.targetNo, base_rev_no: r.revNo, target_year: r.targetYear, tag_cd: code, memo: r.memo || null, owner_emp_no: r.ownerEmpNo || null };
    if (r.kind === 'WATCH') delete body.target_year;   // 관심 기관은 연도가 없다(보내면 400)
    kbb.saveTarget(r.id, body, kbb.BTN.tag).then(function (x) {
      gs.busy = false;
      if (btn.removeAttribute) btn.removeAttribute('aria-busy');
      if (!host) return;
      const o = kbb.outcome(x, 'edit', { year: r.targetYear });
      if (o.kind === 'saved') {
        const t = tagList().filter(function (z) { return z.code === code; })[0];
        say(kbb.flashTag(r.name, t ? t.name : (kbb.TAG[code] || code)), false);
        loadGoals();
      } else if (o.kind === 'nochange') say(o.msg, false);
      else {
        say(o.msg, true);
        if (o.kind === 'stale' || o.kind === 'dup') loadGoals();
      }
    });
  }

  // ── 대화창 공통 ──────────────────────────────────────────────────
  function dq(id) { return dlg ? dlg.el.querySelector('#' + id) : null; }
  function closeDlg(focusEl) {
    if (!dlg) return;
    const d = dlg;
    dlg = null;
    if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
    if (focusEl === 'none') return;
    let o = focusEl || d.opener;
    if (!(o && o.focus && document.body.contains(o))) { const a = $('hb-add'); o = a && !a.hidden ? a : null; }
    if (o && o.focus) o.focus();
  }
  function showDlg(html, kind, opener) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'hb-dlg-ov';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    dlg = { el: ov, opener: opener || document.activeElement, kind: kind, m: null };
    ov.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        const mm = dlg && dlg.m;
        if (mm && mm.busy) { ev.preventDefault(); return; }   // 저장 중에는 닫지 않는다 — 닫으면 응답이 버려져 서버에는 저장됐는데 표·알림이 안 바뀐다(qa 11-17 P3-8)
        if (ev.target && ev.target.id === 'hb-a-q' && mm && mm.results && mm.results.length) return;   // 결과 목록이 열려 있으면 Esc는 목록만 닫는다(아래 combobox 처리기)
        ev.preventDefault(); closeDlg(); return;
      }
      if (ev.key !== 'Tab') return;
      const fs = Array.prototype.slice.call(ov.querySelectorAll('button, input, select, textarea')).filter(function (x) { return !x.disabled && !x.hidden && x.offsetParent !== null; });
      if (!fs.length) return;
      const first = fs[0], last = fs[fs.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    return dlg;
  }
  function setDlgErr(id, msg) { const e = dq(id); if (e) e.textContent = msg || ''; }

  // ── [목표 기관 추가] 대화창(규격 6-E ①·④) ─────────────────────────────────
  // 이미 걸린 기관 { id: { kind, year } } — 관심은 연도와 상관없이, 목표는 불러온 연도 기준(관심을 넣을 때는 불러온 목표 아무거나). 규격 6-9.
  function takenFor(year, kind) {
    const set = {};
    if (gs.st !== 'ok' || !gs.data) return set;
    (gs.data.watch_items || []).forEach(function (t) { set[String(t.institution_id)] = { kind: 'WATCH', year: 0 }; });
    (gs.data.items || []).forEach(function (t) { if (kind === 'WATCH' || Number(gs.data.year) === Number(year)) set[String(t.institution_id)] = { kind: 'GOAL', year: Number(gs.data.year) }; });
    return set;
  }
  // 올해 입찰 종료로 알려진 기관(서버 근거: 공고 현황 판정·시작 전 약정) — 검색 결과 표시용
  function closedMapNow() {   // { 기관 id: closedBasis 결과 } — 추천받기가 '결과가 국민은행인가'를 가리는 데도 쓴다
    const snap = root.noticerec && root.noticerec.snap ? root.noticerec.snap() : null, map = {};
    const ids = {};
    if (snap && snap.byId) Object.keys(snap.byId).forEach(function (id) { ids[id] = true; });
    Object.keys(gs.sum || {}).forEach(function (id) { ids[id] = true; });   // 시작 전 약정(CONTRACT_DECIDED)은 snap 없이 039 요약만으로도 종료
    Object.keys(ids).forEach(function (id) { const b = kbb.closedBasis(id, snap, U.todayDate(), gs.sum[id]); if (b) map[id] = b; });
    return map;
  }
  function closedIdsNow() {
    const map = closedMapNow(), set = {};
    Object.keys(map).forEach(function (id) { set[id] = true; });
    return set;
  }
  // 추천받기 입력(화면에 이미 있는 자료만). years = 이 창의 목표 연도 칸에 있는 연도.
  function recInput(years) {
    const snap = root.noticerec && root.noticerec.snap ? root.noticerec.snap() : null;
    return { taken: takenFor(0, 'WATCH'), closed: closedMapNow(), closedUnknown: !snap, sumById: gs.sum, lofin: root.LOFIN_2026, verified: KB(), direct: gs.direct,
      today: U.todayDate(), list: LIST, years: years, noWatch: noWatchNow() };
  }
  // 고른 기관의 주의 상자(규격 6-9): 올해 목표로 넣으려 할 때만. 서버 근거(막음, 제안 진행 중이면 막지 않음) → 화면만 아는 근거(주의만).
  function computeWarn(m) {
    m.warn = null; m.closedBlock = false;
    if (!m.inst || m.kind === 'WATCH' || Number(m.year) !== U.todayDate().getFullYear()) return;
    const snap = root.noticerec && root.noticerec.snap ? root.noticerec.snap() : null, y0 = U.todayDate().getFullYear();
    const b = kbb.closedBasis(m.inst.id, snap, U.todayDate(), gs.sum[m.inst.id]);
    const years = selYears().filter(function (y) { return y > y0; });
    if (b) {
      const prog = kbb.inProgress(m.inst.rec, st.preps, st.overview);
      m.warn = { mode: prog ? 'progress' : 'block', basis: b, years: years };
      m.closedBlock = !prog;
      return;
    }
    const n = kbb.screenNote(m.inst.rec, { lofin: root.LOFIN_2026, today: U.todayDate() });
    if (n) m.warn = { mode: 'screen', note: n };
  }
  function pickInst(m, rec, tagPre) {
    const id = String(rec.institutionId);
    m.inst = { id: id, name: rec.name || '', rec: rec, key: logic.instKey(rec) };
    m.dup = null;
    m.q = m.inst.name;
    const def = kbb.fitTag(kbb.defaultTag(rec, gs.sum[id], tagOpts()), tagList());
    m.tag = tagPre || def.tag;
    m.tagTouched = false;
    m.note = kbb.tagNote(def, m.inst.name);
    m.pickText = '선택한 기관: ' + kbb.instSub(rec, gs.sum[id], tagOpts());
    m.results = [];
    m.active = -1;
  }
  function paintAdd() {
    const d = dlg;
    if (!d || d.kind !== 'add') return;
    const m = d.m, s = kbb.addState(m), watch = m.kind === 'WATCH';
    const ttl = dq('hb-d-t'); if (ttl) ttl.textContent = watch ? '관심 기관 추가' : '목표 기관 추가';
    const yr = dq('hb-a-yrow'); if (yr) yr.hidden = watch;
    Array.prototype.forEach.call(d.el.querySelectorAll('input[name="hb-a-kind"]'), function (i) { i.checked = i.value === (watch ? 'WATCH' : 'GOAL'); });
    // 주의·중복 상자: 같은 마크업이면 다시 쓰지 않는다(상자 안 연도 칸의 포커스가 풀리지 않게). 서버가 아는 글만 고정 문장으로.
    const bx = dq('hb-a-box');
    if (bx) {
      const icon = root.render && root.render.ICONS && root.render.ICONS.warn ? root.render.ICONS.warn : '';
      const bh = m.dup ? kbb.dupLinkHtml(m.dup.which) : kbb.warnHtml(m.warn ? Object.assign({}, m.warn, { boxYear: m.boxYear, icon: icon, noWatch: noWatchNow() }) : null);
      if (d.boxHtml !== bh) { d.boxHtml = bh; bx.innerHTML = bh; }
    }
    const q = dq('hb-a-q'), list = dq('hb-a-list');
    if (q && q.value !== m.q) q.value = m.q;
    if (q) { q.setAttribute('aria-expanded', m.results.length ? 'true' : 'false'); if (m.active >= 0) q.setAttribute('aria-activedescendant', 'hb-a-o' + m.active); else q.removeAttribute('aria-activedescendant'); }
    if (list) list.innerHTML = kbb.resultsHtml(m.results, m.active, m.year);
    const pk = dq('hb-a-pick'); if (pk) pk.textContent = m.pickText || '';
    const ys = dq('hb-a-year'); if (ys && !watch && m.year && ys.value !== String(m.year)) ys.value = String(m.year);   // 추천 줄이 연도를 바꿔도 칸이 따라간다
    const rp = dq('hb-a-rec'), rb = dq('hb-a-recbtn');
    if (rp && rb && m.rec) {   // 추천받기 패널: 같은 마크업이면 다시 쓰지 않는다(포커스 유지). 접힐 때는 비운다
      const on = !!m.rec.open && !!m.rec.data;
      rb.setAttribute('aria-expanded', on ? 'true' : 'false');
      rp.hidden = !on;
      const rh = on ? kbb.recHtml(m.rec.data, m.rec) : '';
      if (d.recHtml !== rh) { d.recHtml = rh; rp.innerHTML = rh; }
    }
    const nt = dq('hb-a-note'); if (nt) nt.textContent = m.note || '';
    Array.prototype.forEach.call(d.el.querySelectorAll('input[name="hb-a-tag"]'), function (i) { i.checked = i.value === m.tag; });
    const cnt = dq('hb-a-cnt'); if (cnt) cnt.textContent = String(m.memo || '').length + '/' + kbb.MEMO_MAX;
    const go = dq('hb-a-go'); if (go) { go.disabled = !s.canGo; go.textContent = m.busy ? '저장 중…' : (watch ? '관심 기관에 넣기' : '목표에 넣기'); }
    if (go && !m.busy && !watch && isApproval()) go.textContent = tc.addGoText('APPROVAL');   // [결재 요청 쓰기](NEXT 105 6-3)
    const cb = dq('hb-a-cancel'); if (cb) cb.disabled = !!m.busy;   // 저장 중에는 [취소]도 막는다(qa 11-17 P3-8)
    const why = dq('hb-a-why'); if (why) why.textContent = s.why;
  }
  // 저장 중 [목표에 넣기]가 disabled가 되면 포커스가 body로 떨어져 Esc 처리기도 못 받는다 — 대화창 상자로 옮겨 두고, 실패하면 원래 버튼으로 되돌린다.
  function holdDlgFocus(d, goId) {
    const box = d.el.querySelector('.hb-dlg');
    if (box) { if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1'); box.focus(); }
    d.goId = goId;
  }
  function releaseDlgFocus(d) { const g = d.goId ? d.el.querySelector('#' + d.goId) : null; if (g && !g.disabled && g.focus) g.focus(); }
  function searchAdd(m) {
    const closedNow = m.kind !== 'WATCH' && Number(m.year) === U.todayDate().getFullYear();
    m.results = kbb.searchInst(LIST, m.q, { limit: 8, taken: takenFor(m.year, m.kind), sumById: gs.sum, lofin: root.LOFIN_2026, direct: gs.direct, today: U.todayDate(), closedIds: closedNow ? closedIdsNow() : null });
    m.active = -1;
    for (let i = 0; i < m.results.length; i += 1) { if (!m.results[i].taken) { m.active = i; break; } }
  }
  function openAdd(pre) {
    if (dlg || !ALL || !canEditNow()) return;   // canEditNow = 목록을 받았고 서버가 can_edit을 준 계정만(qa 11-17 심층 방어)
    closeMenu(false);
    const years = yearList();
    const m = { q: '', inst: null, year: years.indexOf(goalYear()) >= 0 ? goalYear() : years[0], tag: '', tagTouched: false, memo: '', results: [], active: -1, busy: false, note: '', pickText: '',
      kind: pre && pre.kind === 'WATCH' && !noWatchNow() ? 'WATCH' : 'GOAL', warn: null, closedBlock: false, dup: null, boxYear: 0, rec: { open: false, data: null, more: {} } };
    if (pre && pre.id && BYID[pre.id]) { pickInst(m, BYID[pre.id], pre.tag || ''); computeWarn(m); }
    const d = showDlg(kbb.addDialogHtml(m, { years: years, tags: tagList(), noWatch: noWatchNow(), rec: true }), 'add', (pre && pre.opener) || document.activeElement);
    d.m = m;
    paintAdd();
    const ov = d.el;
    // 이미 걸린 기관을 고르려 하면(클릭·Enter) 어디에 걸려 있는지와 다음 행동을 알리고 고르지 않는다(규격 6-9).
    const pickResult = function (x) {
      if (!x) return;
      if (x.taken) { m.inst = null; m.warn = null; m.closedBlock = false; m.dup = { which: x.takenKind, year: x.takenYear, id: x.id }; m.pickText = kbb.dupText(x.takenKind, x.takenYear) + ' ' + kbb.dupHint(x.takenKind); paintAdd(); return; }
      pickInst(m, x.rec, ''); computeWarn(m); paintAdd();
      const nx = dq('hb-a-year'); if (nx && !m.dup && m.kind !== 'WATCH') nx.focus(); else { const g = dq('hb-a-go'); if (g && !g.disabled) g.focus(); }
    };
    // 추천 줄 [2026 목표로 고르기]/[관심으로 고르기] — 아래 칸(넣을 곳·연도·기관·구분)만 채운다. 저장은 창 아래 [목표에 넣기] 하나(규격 P1-1). 저장 중에는 무시.
    const pickRec = function (id) {
      const it = m.rec && m.rec.data && m.rec.data.byId[id], rc = BYID[id];
      if (m.busy || !it || !rc) return;
      m.kind = it.kind === 'WATCH' ? 'WATCH' : 'GOAL';
      if (m.kind === 'GOAL') m.year = it.year;
      pickInst(m, rc, '');
      const rn = m.tag === 'REGAIN' ? '' : kbb.recNote(it); if (rn) m.note = (m.note ? m.note + ' ' : '') + rn;   // 추천 이유 칩은 구분이 아니다 — 근거 줄에 잇는다(규격 P1-2)
      computeWarn(m);
      m.rec.open = false;
      setDlgErr('hb-a-err', '');
      paintAdd();
      // 포커스(P3-1): 연도 칸 → 활성 [목표에 넣기] → 구분 칸 → 기관 칸 순으로 첫 존재·활성 요소
      const yr = dq('hb-a-year'), g = dq('hb-a-go'), tg = d.el.querySelector('input[name="hb-a-tag"]'), qq = dq('hb-a-q');
      const f = [m.kind !== 'WATCH' ? yr : null, g && !g.disabled ? g : null, tg && !tg.disabled ? tg : null, qq].filter(function (x) { return x && !x.disabled; })[0];
      if (f) f.focus();
    };
    ov.addEventListener('input', function (ev) {
      const t = ev.target;
      if (t.id === 'hb-a-q') {
        m.q = t.value;
        if (m.inst && t.value !== m.inst.name) { m.inst = null; m.pickText = ''; if (!m.tagTouched) { m.tag = ''; m.note = ''; } }
        m.dup = null; m.warn = null; m.closedBlock = false;
        searchAdd(m);
        setDlgErr('hb-a-err', '');
      } else if (t.id === 'hb-a-memo') m.memo = t.value;
      paintAdd();
    });
    ov.addEventListener('change', function (ev) {
      const t = ev.target;
      if (t.id === 'hb-a-year') { m.year = Number(t.value); m.dup = null; if (!m.inst) searchAdd(m); else computeWarn(m); }
      else if (t.name === 'hb-a-kind') { m.kind = t.value === 'WATCH' ? 'WATCH' : 'GOAL'; m.dup = null; if (!m.inst) searchAdd(m); else computeWarn(m); }
      else if (t.name === 'hb-a-tag') { m.tag = t.value; m.tagTouched = true; }
      else if (t.id === 'hb-w-year') { m.boxYear = Number(t.value); paintAdd(); const e = dq('hb-w-year'); if (e) e.focus(); return; }
      paintAdd();
    });
    ov.addEventListener('keydown', function (ev) {
      if (ev.target.id !== 'hb-a-q' || !m.results.length) return;
      const n = m.results.length;
      const step = function (dir) { m.active = ((m.active < 0 ? (dir > 0 ? -1 : 0) : m.active) + dir + n) % n; };   // 이미 걸린 줄도 오간다(Enter로 알림을 본다)
      if (ev.key === 'ArrowDown') { ev.preventDefault(); step(1); paintAdd(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); step(-1); paintAdd(); }
      else if (ev.key === 'Enter' && m.active >= 0) { ev.preventDefault(); pickResult(m.results[m.active]); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); m.results = []; m.active = -1; paintAdd(); }
    });
    ov.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const li = t.closest('li[role="option"]');
      if (li) { pickResult(m.results[Number(li.getAttribute('data-i'))]); return; }
      const b = t.closest('button');
      if (!b) return;
      if (b.id === 'hb-a-cancel') { if (!m.busy) closeDlg(); }
      else if (b.id === 'hb-a-go') submitAdd(d);
      else if (b.id === 'hb-w-watch') submitAdd(d, { kind: 'WATCH' });
      else if (b.id === 'hb-w-next') { const sy = dq('hb-w-year'); submitAdd(d, { kind: 'GOAL', year: Number(sy && sy.value) || 0 }); }
      else if (b.id === 'hb-w-notice') { const key = m.inst ? m.inst.key : ''; closeDlg('none'); openNotice(key); }
      else if (b.id === 'hb-a-recbtn') { if (!m.rec.data) m.rec.data = kbb.recommend(ALL, recInput(years)); m.rec.open = !m.rec.open; paintAdd(); }   // 포커스는 버튼에 그대로(펼침 표준)
      else if (b.hasAttribute('data-rec')) pickRec(b.getAttribute('data-rec'));
      else if (b.hasAttribute('data-more')) {   // 단계의 나머지를 편다 — 포커스는 새로 드러난 첫 줄 버튼으로
        const sk = b.getAttribute('data-more'), sel = '#hb-a-rec button[data-rec][data-stage="' + sk + '"]';
        const prev = Array.prototype.map.call(d.el.querySelectorAll(sel), function (x) { return x.getAttribute('data-rec'); });
        m.rec.more[sk] = true; paintAdd();
        const f = Array.prototype.filter.call(d.el.querySelectorAll(sel), function (x) { return prev.indexOf(x.getAttribute('data-rec')) < 0; })[0];
        if (f) f.focus();
      }
      else if (b.id === 'hb-a-see') { const id = m.dup ? m.dup.id : '', which = m.dup ? m.dup.which : 'GOAL', yr = m.dup ? Number(m.dup.year) || 0 : 0; closeDlg('none'); showRow(which === 'WATCH' ? 'watch' : 'goal', id, yr); }
    });
    const q0 = dq(m.inst ? 'hb-a-go' : 'hb-a-q');
    if (q0 && q0.focus) q0.focus();
  }
  // ov = 주의 상자의 버튼이 정한 값({ kind:'WATCH' } 또는 { kind:'GOAL', year }) — 상자 안 두 버튼이 실제 저장 버튼이다(한 번에 저장, 규격 6-9).
  function submitAdd(d, ov) {
    const m = d.m, eff = Object.assign({}, m, ov || {});
    const y0 = U.todayDate().getFullYear();
    eff.closedBlock = m.closedBlock && eff.kind !== 'WATCH' && Number(eff.year) === y0;
    if (dlg !== d || !kbb.addState(eff).canGo) return;
    const watch = eff.kind === 'WATCH';
    if (!watch && isApproval()) { addToChange(d, eff); return; }   // 결재 모드: 저장하지 않고 일괄 요청 창으로(관심 넣기는 바로)
    m.busy = true;
    paintAdd();
    holdDlgFocus(d, 'hb-a-go');
    setDlgErr('hb-a-err', '');
    const memo = String(m.memo || '').trim() || null;
    const body = watch ? { kind_cd: 'WATCH', tag_cd: m.tag, memo: memo } : { target_year: eff.year, tag_cd: m.tag, memo: memo };
    kbb.saveTarget(m.inst.id, body, watch ? kbb.BTN.addWatch : kbb.BTN.add).then(function (x) {
      if (dlg !== d || !host) return;
      m.busy = false;
      const o = kbb.outcome(x, 'add', { year: eff.year });
      if (o.kind === 'saved' || o.kind === 'nochange') {
        m.rec.data = null;   // 저장 뒤에는 추천을 다시 계산한다(P3-2)
        closeDlg('none');
        gs.focusNext = { inst: m.inst.id, reveal: true };   // 새 줄이 거르기에 가려지면 거르기를 풀고 그 줄로(applyFocusNext)
        gs.just = { inst: m.inst.id };
        if (watch) { gs.tab = 'watch'; gs.f.status = ''; gs.f.q = ''; gs.f.tag = ''; }
        else { gs.tab = 'goal'; if (eff.year !== goalYear()) gs.year = eff.year; }   // 다른 해에 넣었으면 그 해 표로 옮겨 새 줄을 보인다
        say((watch ? kbb.flashWatchAdded(m.inst.name) : kbb.flashAdded(m.inst.name, eff.year)) + (o.warning ? kbb.warnFlash(o.warning) : ''), false);
        loadGoals();
        return;
      }
      if (o.kind === 'closed') {   // 서버가 올해 입찰 종료 근거를 알려 줌 — 검색 단계에서 몰랐던 경우도 같은 상자로
        m.warn = { mode: 'block', basis: o.basis, years: o.nextYears.length ? o.nextYears : selYears().filter(function (y) { return y > y0; }) };
        m.closedBlock = true;
      }
      if (o.kind === 'already') { m.rec.data = null; m.dup = { which: o.which, year: o.year, id: m.inst.id }; m.inst = null; m.warn = null; m.closedBlock = false; m.pickText = o.msg; setDlgErr('hb-a-err', ''); paintAdd(); loadGoals(); return; }
      setDlgErr('hb-a-err', o.msg);
      paintAdd();
      releaseDlgFocus(d);
      if (o.kind === 'dup' || o.kind === 'stale') loadGoals();
    });
  }
  // 이미 걸린 기관의 줄로 간다(거르기를 풀고 그 탭을 보여 포커스를 옮긴다)
  // year = 그 줄이 있는 목표 연도(서버 409의 latest.target_year). 다른 해면 그 해 표로 옮겨 다시 받는다 — 받은 뒤 applyFocusNext가 줄로 간다(qa 11-17 P3-3).
  function showRow(tab, id, year) {
    cancelQ();
    gs.tab = tab; gs.f = { q: '', tag: '', status: '', kind: '', stage: -1 }; clearQInput(); gs.focusNext = { inst: id };
    gs.just = id ? { inst: id } : null;   // 이미 걸린 줄·[관심 탭에서 보기]로 간 줄도 잠깐 강조(11-19 4-4)
    if (tab === 'goal' && Number(year) > 0 && Number(year) !== goalYear()) { gs.year = Number(year); gs.optSig = ''; loadGoals(); return; }
    renderGoals();
  }

  // ── 옮기기 확인 창(규격 6-11) ─────────────────────────────────────────
  function paintMove() {
    const d = dlg;
    if (!d || d.kind !== 'move') return;
    const m = d.m, s = kbb.moveState(m.cmd, m);
    const go = dq('hb-m-go'); if (go) { go.disabled = !s.canGo; go.textContent = m.busy ? '저장 중…' : kbb.moveGoText(m.cmd, m.year); }
    const cb = dq('hb-m-cancel'); if (cb) cb.disabled = !!m.busy;
    const why = dq('hb-m-why'); if (why) why.textContent = s.why;
  }
  // cmd = 'towatch'(목표→관심) | 'tonext'(입찰 종료 목표→다음 회차 목표: 연도 고치기) | 'togoal'(관심→목표)
  function openMove(cmd, r, opener) {
    if (dlg || !canEditNow() || gs.busy) return;
    const y0 = U.todayDate().getFullYear();
    const years = cmd === 'tonext' ? selYears().filter(function (y) { return y > y0; }) : selYears();
    const def = cmd === 'togoal' ? (r.movable || 0) : (cmd === 'tonext' && years.length === 1 ? years[0] : 0);
    const m = { cmd: cmd, r: r, year: def, busy: false };
    const d = showDlg(kbb.moveDialogHtml(cmd, r, { years: years, year: def }), 'move', opener);
    d.m = m;
    paintMove();
    const ov = d.el;
    ov.addEventListener('change', function (ev) { if (ev.target.id === 'hb-m-year') { m.year = Number(ev.target.value) || 0; paintMove(); } });
    ov.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      if (b.id === 'hb-m-cancel') { if (!m.busy) closeDlg(); }
      else if (b.id === 'hb-m-go') submitMove(d);
    });
    const first = ov.querySelector('#hb-m-year') || ov.querySelector('#hb-m-go');
    if (first && first.focus) first.focus();
  }
  function submitMove(d) {
    const m = d.m, r = m.r;
    if (dlg !== d || !kbb.moveState(m.cmd, m).canGo) return;
    m.busy = true;
    paintMove();
    holdDlgFocus(d, 'hb-m-go');
    setDlgErr('hb-m-err', '');
    let req;
    if (m.cmd === 'tonext') {   // 같은 목표 기록의 연도를 다음 회차로 고친다(버튼 goal_next_year)
      req = kbb.saveTarget(r.id, { target_no: r.targetNo, base_rev_no: r.revNo, target_year: m.year, tag_cd: r.tagCd, memo: r.memo || null, owner_emp_no: r.ownerEmpNo || null }, kbb.BTN.nextYear);
    } else if (m.cmd === 'togoal') req = kbb.moveTarget(r.id, r.targetNo, { base_rev_no: r.revNo, to_kind_cd: 'GOAL', target_year: m.year }, kbb.BTN.moveGoal);
    else req = kbb.moveTarget(r.id, r.targetNo, { base_rev_no: r.revNo, to_kind_cd: 'WATCH' }, kbb.BTN.moveWatch);
    req.then(function (x) {
      if (dlg !== d || !host) return;
      m.busy = false;
      const o = kbb.outcome(x, 'move', { year: m.year });
      if (o.kind === 'saved' || o.kind === 'nochange') {
        closeDlg('none');
        const toWatch = m.cmd === 'towatch';
        gs.focusNext = { inst: r.id, reveal: true };
        if (toWatch && !noWatchNow()) { gs.focusNext = { note: true }; gs.just = { tab: 'watch' }; gs.seeInst = r.id; }   // 목표→관심: 탭은 그대로(정리 흐름 유지), 포커스는 알림의 [관심 탭에서 보기], 관심 탭 이름을 한 번 강조(design 11-19 4-4)
        else gs.just = { inst: r.id };                                                                                  // 관심→목표·입찰 종료 목표의 연도 옮기기: 그 줄 강조
        if (!toWatch) { gs.tab = 'goal'; if (m.year !== goalYear()) gs.year = m.year; }
        say(kbb.flashMoved(r.name, toWatch ? 'WATCH' : 'GOAL', m.year) + (o.warning ? kbb.warnFlash(o.warning) : ''), false, toWatch && !noWatchNow() ? 'watch' : '');
        loadGoals();
        return;
      }
      setDlgErr('hb-m-err', o.msg);
      paintMove();
      releaseDlgFocus(d);
      if (o.kind === 'stale' || o.kind === 'dup' || o.kind === 'already') loadGoals();
    });
  }

  // ── [목표에서 빼기] 대화창(규격 6-E ③) ─────────────────────────────────
  function paintCancel() {
    const d = dlg;
    if (!d || d.kind !== 'cancel') return;
    const m = d.m, s = kbb.cancelState(m);
    const row = dq('hb-c-etcrow'); if (row) row.hidden = m.reason !== 'ETC';
    const cnt = dq('hb-c-cnt'); if (cnt) cnt.textContent = String(m.etc || '').length + '/' + kbb.ETC_MAX;
    const go = dq('hb-c-go'); if (go) { go.disabled = !s.canGo; go.textContent = m.busy ? '저장 중…' : (m.r && m.r.kind === 'WATCH' ? '관심에서 빼기' : '목표에서 빼기'); }
    const cb = dq('hb-c-cancel'); if (cb) cb.disabled = !!m.busy;   // 저장 중에는 [취소]도 막는다(qa 11-17 P3-8)
    const why = dq('hb-c-why'); if (why) why.textContent = s.why;
  }
  function openCancel(r, opener) {
    const reasons = gs.data && gs.data.codes && Array.isArray(gs.data.codes.cancel_reasons) ? gs.data.codes.cancel_reasons : [];
    if (dlg || !reasons.length) { if (!dlg) say('빼는 사유 목록을 받지 못했습니다. 목록을 다시 불러온 뒤 시도하세요.', true); return; }
    const m = { r: r, reason: '', etc: '', busy: false };
    const d = showDlg(kbb.cancelDialogHtml(r, { reasons: reasons }), 'cancel', opener);
    d.m = m;
    paintCancel();
    const ov = d.el;
    ov.addEventListener('change', function (ev) {
      if (ev.target.name === 'hb-c-rs') { m.reason = ev.target.value; paintCancel(); if (m.reason === 'ETC') { const e = dq('hb-c-etc'); if (e) e.focus(); } }
    });
    ov.addEventListener('input', function (ev) { if (ev.target.id === 'hb-c-etc') { m.etc = ev.target.value; paintCancel(); } });
    ov.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      if (b.id === 'hb-c-cancel') { if (!m.busy) closeDlg(); }
      else if (b.id === 'hb-c-go') submitCancel(d);
    });
    const first = ov.querySelector('input[name="hb-c-rs"]');
    if (first) first.focus();
  }
  function submitCancel(d) {
    const m = d.m, r = m.r;
    if (dlg !== d || !kbb.cancelState(m).canGo) return;
    m.busy = true;
    paintCancel();
    holdDlgFocus(d, 'hb-c-go');
    setDlgErr('hb-c-err', '');
    const body = { base_rev_no: r.revNo, cancel_reason_cd: m.reason, cancel_reason_etc: m.reason === 'ETC' ? String(m.etc).trim() : null };
    kbb.cancelTarget(r.id, r.targetNo, body).then(function (x) {
      if (dlg !== d || !host) return;
      m.busy = false;
      const o = kbb.outcome(x, 'cancel', { year: r.targetYear });
      if (o.kind === 'saved') {
        const watch = r.kind === 'WATCH', list = watch ? gs.wrows : gs.rows.filter(function (z) { return !z.out; }), i = list.indexOf(r), nx = i >= 0 ? list[i + 1] || null : null;
        closeDlg('none');
        gs.focusNext = { inst: nx ? nx.id : '' };   // 다음 줄 이름(없으면 [목표 기관 추가])
        say(watch ? kbb.flashWatchCancelled(r.name) : kbb.flashCancelled(r.name, r.targetYear), false);
        loadGoals();
        return;
      }
      setDlgErr('hb-c-err', o.msg);
      paintCancel();
      releaseDlgFocus(d);
      if (o.kind === 'stale') loadGoals();
    });
  }

  // 모달 뒤 가리기(design 11-19 D): node(overlay)에서 stop(body)까지 조상 경로를 올라가며 경로에 있지 않은 형제마다 inert를 건다 — body 아래 통째로 걸면 팝업까지 잠긴다.
  // 이미 inert인 요소(다른 화면이 건 것)는 건너뛰고, 건 것만 돌려준다. 풀 때는 그 목록만 푼다.
  // 다른 모달 덮개(class에 modal-overlay, role="dialog", aria-modal="true" — 뒤늦게 뜬 경과 요약 팝업 등)도 건너뛴다(qa 11-19 P2-1).
  function isModalEl(s) {
    const cn = s && (typeof s.className === 'string' ? s.className : (s.classList && s.classList.contains && s.classList.contains('modal-overlay') ? 'modal-overlay' : ''));
    const ga = function (k) { return s && s.getAttribute ? s.getAttribute(k) : null; };
    return /(^|\s)modal-overlay(\s|$)/.test(cn || '') || ga('role') === 'dialog' || ga('aria-modal') === 'true';
  }
  kbb.inertBehind = function (node, stop) {
    const done = [];
    while (node && node !== stop && node.parentNode) {
      const par = node.parentNode;
      Array.prototype.slice.call(par.children || []).forEach(function (s) {
        if (s === node || (s.hasAttribute && s.hasAttribute('inert')) || isModalEl(s)) return;
        s.setAttribute('inert', ''); done.push(s);
      });
      node = par;
    }
    return done;
  };
  kbb.inertRelease = function (list) { (list || []).forEach(function (s) { if (s && s.removeAttribute) s.removeAttribute('inert'); }); };
  // ── 협약 중인 기관 팝업(규격 6-10) ──────────────────────────────────────
  // 예전 접힌 구획(details)의 내용(큰 숫자·와플·종료일 순 목록·각주)을 그대로 모달에 옮겼다. 열린 동안 팝업 밖(왼쪽 메뉴·상단 머리·탭 줄·#hb-root)은 inert, Esc·[닫기]로 닫고 여는 버튼으로 포커스가 돌아온다.
  function closePop(refocus) {
    if (!pop) return;
    const p = pop;
    pop = null;
    if (p.parentNode) p.parentNode.removeChild(p);
    kbb.inertRelease(popInert); popInert = [];   // 이 팝업이 건 것만 푼다(로그인 화면 등 다른 곳이 건 inert는 그대로)
    if (refocus) { const b = $('hb-ours-btn'); if (b && b.focus) b.focus(); }
  }
  function openPop() {
    if (pop || dlg || !host || !ALL) return;
    closeMenu(false);
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'hb-ours-ov';
    ov.innerHTML = '<div class="modal-box hb-op" id="hb-ours" role="dialog" aria-modal="true" aria-labelledby="hb-ot" aria-describedby="hb-osm" tabindex="-1">' +
      '<div class="hb-oh"><h3 id="hb-ot">협약 중인 기관</h3><span id="hb-osm"></span><button type="button" id="hb-ours-close">닫기</button></div>' +
      '<div class="hb-ob"><div class="hb-sum"><p class="hb-fig" id="hb-ofig"></p><p class="hb-brk" id="hb-osum"></p><div class="hb-waf" id="hb-waf"></div></div>' +
      '<div class="db-scroll" id="hb-oscroll">' + WAIT + '</div><div class="hb-foot" id="hb-ofoot"></div></div></div>';
    host.appendChild(ov);
    pop = ov;
    popInert = kbb.inertBehind(ov, document.body);   // #hb-root도 overlay의 형제라 이 경로에 든다
    ov.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePop(true); return; }
      if (ev.key !== 'Tab') return;
      const fs = Array.prototype.slice.call(ov.querySelectorAll('button, a[href], summary')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!fs.length) return;
      const first = fs[0], last = fs[fs.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    ov.addEventListener('mousedown', function (ev) { if (ev.target === ov) closePop(true); });
    renderOurs();
    const cl = $('hb-ours-close'); if (cl && cl.focus) cl.focus();
  }

  // ── NEXT 105: 목표 기관 변경 — 고르기·일괄 요청·결재 중 창·협약 개시일·자동 이월 ───────────────────
  // 규격: design-reviewer 2026-11-23_0919_ad69b2cf 5·6절. 모드는 서버 goal_change_mode 하나만 따른다(DIRECT·APPROVAL·null) — 결재·이월 스위치는 서버 설정이라 화면은 이 값과 carry_due만 본다.
  // 새 창 셋(일괄 요청·결재 진행 중·협약 개시일)은 공통 .dlg(dlg.js)로 연다. 기존 추가·옮기기·빼기 창(modal-box)은 이번 범위 밖이다. 순수 부분은 tchange.js.
  function goalMode() { return gs.st === 'ok' && gs.data ? tc.modeOf(gs.data) : null; }
  function isApproval() { return goalMode() === 'APPROVAL'; }
  function roleNow() { try { return String((root.store.loadProfile() || {}).team || '').trim(); } catch (e) { return ''; } }
  function dlgFallback() { return $('hb-pickall') || $('hb-goals'); }
  function moveChange(r, cmd, opener) {   // 한 줄 동작 → 일괄 요청 창을 그 줄 하나가 미리 채워진 채로(규격 6-3)
    if (cmd === 'tonext') return { rows: [r], op: 'EDIT', year: Number(r.targetYear) + 1, opener: opener };
    if (cmd === 'togoal') return { rows: [r], op: 'TO_GOAL', year: r.movable || 0, opener: opener };
    return { rows: [r], op: 'TO_WATCH', opener: opener };
  }
  // ── 고르기(체크박스): 눌러도 표를 다시 그리지 않는다(포커스·스크롤 유지) — 줄 클래스·띠만 고친다
  function pickRows() { return (gs.rows || []).filter(function (r) { return tc.pickable(r); }); }
  function syncPickDom() {
    const sc = $('hb-ts');
    if (!sc) return;
    Array.prototype.forEach.call(sc.querySelectorAll('input[data-pick]'), function (i) {
      const r = (gs.rows || []).filter(function (x) { return x.id === i.getAttribute('data-pick') && !x.out; })[0], on = !!r && tc.isPicked(gs.sel, r);
      i.checked = on;
      const tr = i.closest ? i.closest('tr') : null;
      if (tr && tr.classList) tr.classList.toggle('picked', on);
    });
  }
  function paintSel() {
    const mode = goalMode(), n = tc.selCount(gs.sel), bar = $('hb-selbar'), all = $('hb-pickall');
    if (all) {   // 머리 체크박스는 지금 보이는 줄만 다룬다
      const vis = pickRows(), k = vis.filter(function (r) { return tc.isPicked(gs.sel, r); }).length;
      all.checked = vis.length > 0 && k === vis.length; all.indeterminate = k > 0 && k < vis.length; all.disabled = vis.length === 0;
    }
    if (!bar) return;
    const stEl = $('hb-seln');
    if (!mode || n === 0) { bar.hidden = true; if (stEl) { stEl.innerHTML = ''; stEl.hbH = ''; } return; }
    bar.hidden = false;   // 먼저 보이게 한 뒤 글을 넣는다(role=status가 보이는 상태에서 바뀐 글을 읽도록, 규격 5-6)
    const h = tc.selStatusHtml(n, gs.selMsg);
    if (stEl && stEl.hbH !== h) { stEl.innerHTML = h; stEl.hbH = h; }
    const who = $('hb-selwho'); if (who) who.textContent = tc.approverText(roleNow(), mode);
    const go = $('hb-selgo'); if (go) go.textContent = tc.barBtnText(mode, n);
  }
  function onPick(t) {
    if (!canEditNow()) { t.checked = false; return; }
    if (t.id === 'hb-pickall') {
      gs.selMsg = '';
      pickRows().forEach(function (r) {
        if (t.checked) { const res = tc.pick(gs.sel, tc.entryOfRow(r)); if (!res.ok) gs.selMsg = res.msg; }
        else tc.unpickRow(gs.sel, r.id, r.targetNo);
      });
      syncPickDom(); paintSel();
      return;
    }
    const id = t.getAttribute('data-pick'), r = (gs.rows || []).filter(function (x) { return x.id === id && !x.out; })[0];
    if (!r) { t.checked = false; return; }
    if (t.checked) { const res = tc.pick(gs.sel, tc.entryOfRow(r)); if (res.ok) gs.selMsg = ''; else { t.checked = false; gs.selMsg = res.msg; } }   // 20곳 한도·같은 기관 두 번은 체크하지 않고 띠에 알린다(5-6)
    else { tc.unpickRow(gs.sel, id, r.targetNo); gs.selMsg = ''; }
    syncPickDom(); paintSel();
  }
  function clearSelection() {
    tc.clearSel(gs.sel); gs.selMsg = '';
    syncPickDom(); paintSel();
    const f = $('hb-pickall') || $('hb-goals'); if (f && f.focus) f.focus();   // 띠가 사라지므로 눌렀던 단추 대신 표로
  }
  // ── 일괄 요청 창(.dlg--wide): 고른 줄 + 미리 채운 줄 + 넣기(ADD)를 한 창에서 동작·사유와 함께
  function cancelReasons() { return gs.data && gs.data.codes && Array.isArray(gs.data.codes.cancel_reasons) ? gs.data.codes.cancel_reasons : []; }
  function chCtx() { return { years: selYears(), tags: tagList(), reasons: cancelReasons() }; }
  function chq(d, id) { return d.overlay.querySelector('#' + id); }
  function chItem(d, uid) { return d.items.filter(function (x) { return String(x.uid) === String(uid); })[0] || null; }
  function chLi(d, uid) { return d.overlay.querySelector('li.tc-item[data-uid="' + uid + '"]'); }
  const CH_CTL = { op: ['op'], year: ['y'], edit: ['y'], memo: ['m'], cancelCd: ['rs'], cancelEtc: ['etc'], text: ['m', 'etc'] };
  function chClearItem(d, it) {
    const li = chLi(d, it.uid), fe = chq(d, 'tc-i' + it.uid + '-e'), top = chq(d, 'tc-err');
    if (li) li.classList.remove('bad');
    if (fe) fe.textContent = '';
    if (top) top.textContent = '';
    ['op', 'y', 't', 'm', 'rs', 'etc'].forEach(function (k) {
      const c = chq(d, 'tc-i' + it.uid + '-' + k);
      if (!c || c.getAttribute('aria-invalid') !== 'true') return;
      c.removeAttribute('aria-invalid');
      const left = root.dlg.removeDescribedBy(c.getAttribute('aria-describedby'), 'tc-i' + it.uid + '-e');
      if (left) c.setAttribute('aria-describedby', left); else c.removeAttribute('aria-describedby');
    });
  }
  function chMarkItem(d, uid, f, msg) {   // 항목 상자에 빨간 테두리(.bad)와 한 줄 문장, 칸에는 aria-invalid·describedby. 커서를 옮길 칸을 돌려준다
    const li = chLi(d, uid), fe = chq(d, 'tc-i' + uid + '-e');
    if (!li) return null;
    li.classList.add('bad');
    if (fe) fe.textContent = msg;
    const ks = CH_CTL[f] || ['op'];
    let c = null;
    for (let i = 0; i < ks.length && !c; i += 1) c = chq(d, 'tc-i' + uid + '-' + ks[i]);
    if (!c) c = chq(d, 'tc-i' + uid + '-op') || li.querySelector('.tc-x');
    if (c && c.id) { c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', root.dlg.mergeDescribedBy(c.getAttribute('aria-describedby'), 'tc-i' + uid + '-e')); }
    return c;
  }
  function chClearErrors(d) {
    const te = chq(d, 'tc-err'); if (te) te.textContent = '';
    const re = chq(d, 'tc-re'); if (re) re.textContent = '';
    const rt = chq(d, 'tc-reason'); if (rt) rt.removeAttribute('aria-invalid');
    d.items.forEach(function (it) { chClearItem(d, it); });
  }
  function chShowErrors(d, v) {   // 누르기 전에는 막지 않고 누르면 칸마다(5-2). 맨 위 빠진 칸으로 커서
    let first = null;
    if (v.top) { const te = chq(d, 'tc-err'); if (te) te.textContent = v.top; }
    if (v.reason) { const t = chq(d, 'tc-reason'), p = chq(d, 'tc-re'); if (p) p.textContent = v.reason; if (t) { t.setAttribute('aria-invalid', 'true'); first = t; } }
    v.items.forEach(function (x) { const c = chMarkItem(d, x.uid, x.f, x.msg); if (!first && c) first = c; });
    if (first && first.focus) first.focus();
  }
  function chShowError(d, e) {   // 서버 오류: 위쪽 .dlg-err에는 "{n}번째 {기관}을 확인하세요."만, 항목 문장은 그 항목 상자에(같은 문장을 두 곳에 쓰지 않는다)
    const te = chq(d, 'tc-err'); if (te) te.textContent = e.top || '';
    let f = null;
    if (e.item) f = chMarkItem(d, e.item.uid, e.item.f, e.item.msg);
    else if (e.kind === 'field') { const t = chq(d, 'tc-reason'), p = chq(d, 'tc-re'); if (p) p.textContent = e.msg; if (t) { t.setAttribute('aria-invalid', 'true'); f = t; } }
    f = f || chq(d, 'tc-go');
    if (f && f.focus) f.focus();
  }
  function chPaintBusy(d) {
    const go = chq(d, 'tc-go'), body = d.overlay.querySelector('.dlg-body'), box = d.overlay.querySelector('.dlg');
    if (go) { root.dlg.setDisabled(go, d.busy); go.textContent = d.busy ? '올리는 중…' : tc.GO_TEXT[d.mode]; }   // 중복 제출을 막으려는 것(필수 칸 알림 때문이 아니다)
    if (body) body.inert = !!d.busy;
    if (box) box.setAttribute('aria-busy', d.busy ? 'true' : 'false');
    if (d.busy) { const t = chq(d, 'tc-t'); if (t && t.focus) t.focus(); }
  }
  function chPaintItem(d, it, focusKey) {   // 동작을 바꾸면 그 항목의 이전/이후 줄만 다시 그린다(동작 칸은 그대로 — 포커스 유지)
    const li = chLi(d, it.uid), old = li ? li.querySelector('.tc-ba') : null;
    if (!li || !old) return;
    const w = document.createElement('div');
    w.innerHTML = tc.afterBlockHtml(it, chCtx());
    li.replaceChild(w.firstChild, old);
    if (focusKey) { const e = chq(d, 'tc-i' + it.uid + '-' + focusKey); if (e && e.focus) e.focus(); }
  }
  function chRepaint(d) {
    const ol = chq(d, 'tc-items'), t = chq(d, 'tc-t');
    if (ol) ol.innerHTML = d.items.map(function (it, i) { return tc.itemHtml(it, i + 1, chCtx()); }).join('');
    if (t) t.textContent = tc.dlgTitle(d.mode, d.items.length);
  }
  function chFocusItem(d, it) {
    const li = it ? chLi(d, it.uid) : null, f = li ? (li.querySelector('select, input') || li.querySelector('.tc-x')) : chq(d, 'tc-go');
    if (f && f.focus) f.focus();
  }
  function chRemove(d, uid) {   // [목록에서 제외] — 이 요청에서 빼고 고른 것도 푼다(규격 5-1: '빼기'는 목표에서 빼기와 헷갈린다)
    const it = chItem(d, uid);
    if (!it || d.busy) return;
    const i = d.items.indexOf(it);
    d.items.splice(i, 1);
    if (!it.add) tc.unpick(gs.sel, it.id);
    syncPickDom(); paintSel();
    if (!d.items.length) { d.done = true; root.dlg.close(d.overlay); return; }
    chRepaint(d);
    chFocusItem(d, d.items[i] || d.items[i - 1]);
  }
  function chOnChange(d, t) {
    if (d.busy || !t) return;
    if (t.id === 'tc-allop') {   // 고른 목표 줄 모두에 같은 동작
      const op = t.value; t.value = '';
      if (!op) return;
      d.items.forEach(function (x) { if (!tc.isFixed(x) && !x.op) { tc.setOp(x, op); x.touched = true; } });   // 아직 동작이 비어 있는 항목에만(이미 정한 항목은 그대로)
      chRepaint(d);
      return;
    }
    const it = chItem(d, t.getAttribute && t.getAttribute('data-uid'));
    if (!it) return;
    const f = t.getAttribute('data-f');
    it.touched = true;
    chClearItem(d, it);
    if (f === 'op') { tc.setOp(it, t.value); chPaintItem(d, it, ''); }
    else if (f === 'year') it.year = Number(t.value) || 0;
    else if (f === 'tag') it.tag = t.value;
    else if (f === 'cancelCd') { it.cancelCd = t.value; if (it.cancelCd !== tc.ETC_CD) it.cancelEtc = ''; chPaintItem(d, it, 'rs'); }
  }
  function chOnInput(d, t) {
    if (d.busy || !t) return;
    if (t.id === 'tc-reason') {
      d.reason = t.value;
      const c = chq(d, 'tc-rc'); if (c) c.textContent = t.value.length + '/' + tc.REASON_MAX;
      const re = chq(d, 'tc-re'); if (re) re.textContent = '';
      t.removeAttribute('aria-invalid');
      return;
    }
    const it = chItem(d, t.getAttribute && t.getAttribute('data-uid'));
    if (!it) return;
    const f = t.getAttribute('data-f');
    it.touched = true;
    chClearItem(d, it);
    if (f === 'memo') it.memo = t.value; else if (f === 'cancelEtc') it.cancelEtc = t.value;
  }
  function chClosed(d) {   // dlg.close가 부른다 — [취소]·Esc·바깥 클릭·성공·화면 닫힘 모두 여기로
    d.gone = true;
    if (d.overlay.parentNode) d.overlay.parentNode.removeChild(d.overlay);
    if (chd === d) chd = null;
    if (!d.done) d.added.forEach(function (id) { tc.unpick(gs.sel, id); });   // [취소]: 미리 채운 항목만 버리고 이미 고른 줄은 그대로(6-3)
    if (host) { syncPickDom(); paintSel(); }
  }
  // o = { rows:[줄 모델](한 줄 동작이 미리 채움), op, year, tag, add:{id,name,regionName,year,tag,tagName,memo}(추가 창에서 넘어옴), opener }
  function openChange(o) {
    o = o || {};
    if (chd || trm || pnd || dlg || !root.dlg || !canEditNow()) return;
    const mode = goalMode();
    if (!mode) return;
    closeMenu(false);
    const added = [], pre = {};
    let fail = '';
    (o.rows || []).forEach(function (r) {
      if (fail) return;
      const had = tc.hasSel(gs.sel, r.id), res = tc.pick(gs.sel, tc.entryOfRow(r));
      if (!res.ok) { fail = res.msg; return; }
      if (!had) added.push(r.id);
      pre[r.id] = { op: o.op, year: o.year || 0, tag: o.tag || '' };
    });
    if (!fail && o.add) { if (tc.hasSel(gs.sel, o.add.id)) fail = tc.DUP_MSG; else if (tc.selCount(gs.sel) >= tc.MAX_ITEMS) fail = tc.CAP_MSG; }
    if (fail) { added.forEach(function (id) { tc.unpick(gs.sel, id); }); say(fail, true); syncPickDom(); paintSel(); return; }
    let uid = 0;
    const items = gs.sel.ids.map(function (id) {
      const it = tc.newItem(++uid, gs.sel.by[id]), p = pre[id];   // 항목의 이전 줄은 고른 줄의 스냅샷(같은 객체 — 목록을 다시 받으면 제자리 갱신)
      if (p && !tc.isFixed(it)) tc.setOp(it, p.op, p);
      return it;
    });
    if (o.add) items.push(tc.addItem(++uid, o.add));
    const w = document.createElement('div');
    w.innerHTML = tc.dialogHtml({ mode: mode, items: items, reason: '', role: roleNow() }, chCtx());
    const ov = w.firstChild, d = { overlay: ov, mode: mode, items: items, reason: '', busy: false, gone: false, done: false, added: added };
    chd = d;
    ov.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b || d.gone) return;
      if (b.id === 'tc-cancel') root.dlg.requestClose(ov);   // 올리는 중에도 닫는다 — 결과는 띠로
      else if (b.id === 'tc-go') submitChange(d);
      else if (b.classList.contains('tc-x')) chRemove(d, b.getAttribute('data-uid'));
    });
    ov.addEventListener('change', function (ev) { chOnChange(d, ev.target); });
    ov.addEventListener('input', function (ev) { chOnInput(d, ev.target); });
    document.body.appendChild(ov);   // 덮개는 body 직계여야 dlg가 나머지 화면을 inert로 막는다
    if (o.opener && o.opener.focus && document.body.contains(o.opener)) o.opener.focus();   // 닫으면 이 단추로 돌아온다(dlg가 연 순간의 포커스를 기억)
    root.dlg.open(ov, {
      isDirty: function () { return !!String(d.reason).trim() || d.items.some(function (x) { return x.touched; }); },
      onClose: function () { chClosed(d); }, restoreFallback: dlgFallback });
    syncPickDom(); paintSel();
  }
  // 409 뒤: 보는 연도 목록은 loadGoals가 새로 읽는다. 다른 연도에서 고른 줄은 그 응답으로 못 고치므로 서버가 준 최신 기록(detail.latest)으로,
  // 그것도 없으면 그 연도 목록을 따로 읽어 갱신한다(안 그러면 base_rev_no가 낡아 같은 오류가 되풀이된다).
  function refreshAfterConflict(e, d) {
    const it = e.item ? d.items.filter(function (x) { return x.uid === e.item.uid; })[0] : null, sn = it ? it.snap : null;
    const other = !!sn && sn.kind !== 'WATCH' && Number(sn.year) !== Number(goalYear());
    const applied = other && tc.applyLatest(sn, e.latest);
    const extra = other && !applied ? fetchJson('/bid-targets?year=' + encodeURIComponent(sn.year)).then(function (t) {
      if (t.status !== 'ok' || !t.data || !host) return;
      tc.reconcile(tc.oneSel(sn), kbb.goalRows(t.data.items, goalCtx()), [], Number(sn.year));   // 임시 묶음에서 고쳐도 snap은 같은 객체라 창이 새 기록 번호를 본다
    }) : Promise.resolve();
    return Promise.all([loadGoals(), extra]);
  }
  function submitChange(d) {
    if (chd !== d || d.busy || d.gone) return;
    chClearErrors(d);
    const v = tc.validate(d.items, { mode: d.mode, reason: d.reason });
    if (!v.ok) { chShowErrors(d, v); return; }
    d.busy = true; chPaintBusy(d);
    kbb.submitChanges(tc.buildBody(d.items, { mode: d.mode, reason: d.reason })).then(function (x) {
      d.busy = false;
      if (!host) return;
      if (!d.gone) chPaintBusy(d);
      if (x && (x.status === 200 || x.status === 201) && x.body) { finishChange(d, x.body); return; }
      const e = tc.errorOf(x, d.items);
      const show = function () { if (d.gone) say(e.item ? e.top + ' ' + e.item.msg : (e.msg || e.top), true); else chShowError(d, e); };   // 닫은 뒤 늦게 온 실패는 띠로
      if (e.refresh) refreshAfterConflict(e, d).then(function () { if (!d.gone) chRepaint(d); show(); });   // STALE·CHANGE_PENDING: 다시 읽고 이전 줄·기록 번호를 새로(고른 동작·칸 값은 그대로)
      else show();
    });
  }
  function finishChange(d, body) {
    const res = tc.resultOf(body, d.items.length), ids = d.items.map(function (x) { return x.id; });
    d.done = true;
    tc.clearSel(gs.sel); gs.selMsg = '';
    if (!d.gone) root.dlg.close(d.overlay, { restore: false });
    say(res.text, false, res.mode === 'APPROVAL' ? 'inbox' : '');
    if (res.mode === 'DIRECT') gs.justIds = ids;
    loadGoals();
    const t = $('hb-pickall') || $('hb-goals'); if (t && t.focus) t.focus();
  }
  // 추가 창 → 일괄 요청 창(APPROVAL): 추가 창을 닫고 같은 자리에서 바뀐다. 닫으면 추가 창을 연 단추로 돌아온다.
  function addToChange(d, eff) {
    const m = d.m, a = { id: m.inst.id, name: m.inst.name, regionName: dash.regionName((m.inst.rec && m.inst.rec.region) || ''), year: eff.year, tag: m.tag,
      tagName: (tagList().filter(function (z) { return z.code === m.tag; })[0] || {}).name || kbb.TAG[m.tag] || m.tag, memo: String(m.memo || '').trim() };
    if (tc.hasSel(gs.sel, a.id)) { setDlgErr('hb-a-err', tc.DUP_MSG); return; }
    if (tc.selCount(gs.sel) >= tc.MAX_ITEMS) { setDlgErr('hb-a-err', tc.CAP_MSG); return; }
    const opener = d.opener;
    closeDlg('none');
    openChange({ add: a, opener: opener });
  }
  // ── 결재 진행 중 창(보는 창) — 현황판은 내가 요청자인지 모른다(사번 없음): 취소·반려는 결재함으로 보낸다
  function openPending(r, opener) {
    if (pnd || chd || trm || dlg || !root.dlg || !r || !r.pend) return;
    closeMenu(false);
    const w = document.createElement('div');
    w.innerHTML = tc.pendingDialogHtml(r, { canTerm: r.kind !== 'WATCH' && !!r.judgeFrom });
    const ov = w.firstChild, d = { overlay: ov, gone: false };
    pnd = d;
    ov.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b || d.gone) return;
      if (b.id === 'pd-close') root.dlg.requestClose(ov);
      else if (b.id === 'pd-inbox') { root.dlg.close(ov, { restore: false }); seeInbox(''); }
      else if (b.id === 'pd-term') { root.dlg.close(ov, { restore: false }); openTerm(r, opener); }   // 서버는 잠긴 기관의 개시일 저장도 막지 않는다
    });
    document.body.appendChild(ov);
    root.dlg.open(ov, { onClose: function () { d.gone = true; if (ov.parentNode) ov.parentNode.removeChild(ov); if (pnd === d) pnd = null; }, restoreFallback: dlgFallback });
  }
  // ── RFP 협약 개시일 창(쓰는 창, 결재 없음)
  function ttq(d, id) { return d.overlay.querySelector('#' + id); }
  function ttText(d, id, msg) { const e = ttq(d, id); if (e) e.textContent = msg || ''; }
  function ttPaint(d) {
    const go = ttq(d, 'tt-go');
    if (go) { root.dlg.setDisabled(go, d.busy); go.textContent = d.busy ? '저장 중…' : '저장'; }
  }
  function refillTerm(d) {   // 409 STALE: 최신 값을 다시 읽어 칸을 채운다
    if (d.gone || trm !== d) return;
    const r2 = (gs.rows || []).filter(function (x) { return x.id === d.r.id && x.targetNo === d.r.targetNo && !x.out; })[0];
    if (!r2) return;
    d.r = r2; d.base = r2.termRevNo; d.init = r2.termStart || '';
    const inp = ttq(d, 'tt-d'); if (inp) inp.value = d.init;
    const now = ttq(d, 'tt-now'); if (now) now.innerHTML = tc.termNowHtml(r2);
  }
  function openTerm(r, opener) {
    if (trm || chd || pnd || dlg || !root.dlg || !canEditNow() || !r || r.kind === 'WATCH' || !r.judgeFrom) return;
    closeMenu(false);
    const w = document.createElement('div');
    w.innerHTML = tc.termDialogHtml(r);
    const ov = w.firstChild, d = { overlay: ov, r: r, base: r.termRevNo, init: r.termStart || '', busy: false, gone: false };
    trm = d;
    ov.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b || d.gone) return;
      if (b.id === 'tt-cancel') root.dlg.requestClose(ov);
      else if (b.id === 'tt-go') submitTerm(d);
    });
    document.body.appendChild(ov);
    if (opener && opener.focus && document.body.contains(opener)) opener.focus();
    root.dlg.open(ov, {
      isDirty: function () { const i = ttq(d, 'tt-d'); return !!i && i.value !== d.init; },
      onClose: function () { d.gone = true; if (ov.parentNode) ov.parentNode.removeChild(ov); if (trm === d) trm = null; }, restoreFallback: dlgFallback });
  }
  function submitTerm(d) {
    if (trm !== d || d.busy || d.gone) return;
    const inp = ttq(d, 'tt-d'), v = inp ? String(inp.value || '').trim() : '';
    d.busy = true; ttPaint(d);
    ttText(d, 'tt-err', ''); ttText(d, 'tt-info', ''); ttText(d, 'tt-e', '');
    if (inp) inp.removeAttribute('aria-invalid');
    kbb.saveTerm(d.r.id, { target_year: d.r.targetYear, term_start: v, base_rev_no: d.base }).then(function (x) {
      d.busy = false;
      if (!host) return;
      if (!d.gone) ttPaint(d);
      const o = tc.termOutcome(x);
      if (o.kind === 'saved') {
        if (!d.gone) root.dlg.close(d.overlay, { restore: false });
        say(tc.termFlash(d.r.name, d.r.targetYear, v, gs.data && gs.data.carry_default_start), false);
        gs.focusNext = { inst: d.r.id }; gs.just = { inst: d.r.id };
        loadGoals();
        return;
      }
      if (d.gone) { say(o.msg, true); return; }
      if (o.kind === 'nochange') { ttText(d, 'tt-info', o.msg); if (inp && inp.focus) inp.focus(); return; }
      if (o.kind === 'field') { ttText(d, 'tt-e', o.msg); if (inp) { inp.setAttribute('aria-invalid', 'true'); if (inp.focus) inp.focus(); } return; }
      ttText(d, 'tt-err', o.msg);
      if (o.kind === 'stale') loadGoals().then(function () { refillTerm(d); });
      if (inp && inp.focus) inp.focus();
    });
  }
  function closeChangeDlgs() {   // 계정이 바뀌거나 화면을 떠날 때(확인 없이)
    [chd, trm, pnd].forEach(function (d) { if (d && !d.gone && d.overlay && root.dlg) { d.done = true; root.dlg.close(d.overlay, { restore: false }); } });
    chd = trm = pnd = null;
  }
  // ── 알림 옆 단추(결재함에서 보기·넘어온 기관만 보기)와 자동 이월
  function seeInbox(tab) {   // 결재함 탭(위쪽 #tab-btn-approvals)을 누른다. 못 열면 안내
    const btn = typeof document !== 'undefined' ? document.getElementById('tab-btn-approvals') : null;
    const hidden = !btn || btn.hidden || (typeof getComputedStyle === 'function' && getComputedStyle(btn).display === 'none');
    if (hidden) { say('결재함을 열 수 없습니다. 위쪽 [결재함] 단추에서 여세요.', true); return; }
    if (tab && root.approvals && root.approvals.openTab) root.approvals.openTab(tab);
    btn.click();
  }
  function seeCarried() {   // 상태 거르기 '자동 이월'을 켠다(목표에 넘어온 줄이 있으면 목표 탭, 없고 관심에만 있으면 관심 탭)
    const a = $('hb-flash-act'); if (a) a.innerHTML = '';
    const d = gs.data || {}, goalHas = (d.items || []).some(function (x) { return x && x.carried === true; }), watchHas = (d.watch_items || []).some(function (x) { return x && x.carried === true; });
    cancelQ();
    gs.tab = goalHas || !watchHas ? 'goal' : 'watch';
    gs.f = { q: '', tag: '', status: 'carried', kind: '', stage: -1 };
    clearQInput();
    renderGoals();
    const s = $('hb-f-status'); if (s && s.focus) s.focus();
  }
  // 자동 이월: GET의 carry_due가 0보다 크면 한 번만(이 화면에서만 — 기관 목록·대시보드는 부르지 않는다). more면 한 번 더, 두 번의 숫자를 합쳐 한 번만 알린다.
  // 실패·409 CARRY_DISABLED는 아무것도 띄우지 않는다(다음에 들어올 때 다시, 5-5).
  function carryRun(acc, tok) {
    return kbb.carryTargets().then(function (x) {
      if (tok !== gs.carryTok || !host) return null;
      if (!x || x.status !== 200 || !x.body) return acc;
      const sum = tc.carryMerge(acc, x.body);
      return x.body.more === true && !acc ? carryRun(sum, tok) : sum;
    });
  }
  function maybeCarry() {
    const d = gs.data;
    if (gs.carryTried || !d || gs.st !== 'ok' || !(Number(d.carry_due) > 0) || !canEditNow()) return;
    gs.carryTried = true;
    const tok = gs.carryTok;
    carryRun(null, tok).then(function (sum) {
      if (tok !== gs.carryTok || !host || !sum) return;
      const n = tc.carryText(sum);
      if (n.text) say(n.text, false, n.hasCarried ? 'carried' : '');
      if (n.changed) loadGoals();
    });
  }
  function applyJustMany() {   // 일괄 반영한 줄들을 잠깐 강조(.hb-just) — 한 줄 강조(applyJust)와 같은 클래스
    const ids = gs.justIds;
    if (!ids || !ids.length || gs.st === 'loading') return;
    gs.justIds = null;
    const sc = $('hb-goals'), bs = sc ? sc.querySelectorAll('button.hb-nm') : [];
    Array.prototype.forEach.call(bs, function (b) {
      if (ids.indexOf(b.getAttribute('data-inst')) < 0) return;
      const tr = b.closest ? b.closest('tr') : null;
      if (tr && tr.classList) { tr.classList.add('hb-just'); setTimeout(function () { tr.classList.remove('hb-just'); }, 4000); }
    });
  }
  // ── 표 도구 줄·정렬·단계 거르기 ─────────────────────────────────────────
  function setTab(tab, focusTab) {
    if (tab !== 'goal' && tab !== 'watch') return;
    if (gs.tab !== tab) { gs.tab = tab; gs.f.status = ''; gs.f.kind = ''; gs.f.stage = -1; }   // 탭을 바꾸면 검색어·구분은 유지, 상태·종류(옵션이 다르다)는 처음으로
    renderGoals();
    if (focusTab) { const b = $('hb-tab-' + tab); if (b && b.focus) b.focus(); }
  }
  function sortBtn(key) {
    const s = gs.sort[gs.tab];
    gs.sort[gs.tab] = s.key === key ? { key: key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: key, dir: 'asc' };
    renderGoals();
    const th = $('hb-ts') && $('hb-ts').querySelector('button.hb-sort[data-sort="' + key + '"]'); if (th && th.focus) th.focus();
  }
  // 단계 버튼: 목표 탭으로 옮기고 그 단계만 남긴다(버튼의 수 = 표에 남는 줄 수 — 그래서 다른 거르기는 풀고 시작한다). 같은 버튼을 다시 누르면 꺼진다.
  function stageBtn(i) {
    cancelQ();
    // 누른 순간에는 버튼의 수 = 표의 줄 수가 되도록 다른 거르기를 푼다. 그 뒤 검색·구분을 더하면 표는 그 교집합이 되고 건수(#hb-cnt)가 그 결과를 말한다(qa 11-17 P3-6, 의도된 동작).
    if (gs.tab === 'goal' && gs.f.stage === i) gs.f.stage = -1;
    else { gs.tab = 'goal'; gs.f = { q: '', tag: '', status: '', kind: '', stage: i }; }
    renderGoals();
    const b = host && host.querySelector('button.hb-sb[data-stage="' + i + '"]'); if (b && b.focus) b.focus();
  }
  // 검색칸의 글자도 비운다 — gs.f.q만 비우면 칸에는 옛 글자가 남아 거르기가 풀린 것처럼 보이지 않는다(qa 11-17 N-1)
  function clearQInput() { const q = $('hb-q'); if (q) q.value = ''; }
  // [필터 지우기]는 지우고 나면 숨는다 — 포커스가 body로 떨어지지 않게 검색칸으로(qa 11-17 N-2)
  function clearFilters() { cancelQ(); gs.f = { q: '', tag: '', status: '', kind: '', stage: -1 }; renderGoals(); clearQInput(); const q = $('hb-q'); if (q && q.focus) q.focus(); }
  // 검색 디바운스. 타이머 콜백은 그 시점의 입력칸 현재 값을 읽는다(옛 값을 되살리지 않게, qa 11-17 P3-5). 한글 조합 중(compositionstart~end)에는 다시 그리지 않고 끝난 뒤 한 번만 그린다.
  let composing = false;
  function cancelQ() { if (qTimer) { clearTimeout(qTimer); qTimer = null; } }
  function schedQ() {
    cancelQ();
    qTimer = setTimeout(function () {
      qTimer = null;
      if (!host || composing) return;
      const t = $('hb-q'); if (!t) return;
      gs.f.q = t.value; renderGoals();
    }, 150);   // 건수는 한 번만 바뀐다
  }
  function onInput(e) {
    const t = e.target;
    if (!t || t.id !== 'hb-q') return;
    if (e.isComposing || composing) return;   // 조합 중에는 미룬다 — compositionend가 다시 부른다
    schedQ();
  }
  function onCompStart(e) { if (e.target && e.target.id === 'hb-q') { composing = true; cancelQ(); } }
  function onCompEnd(e) { if (e.target && e.target.id === 'hb-q') { composing = false; schedQ(); } }
  function onKeydown(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'hb-q' && e.key === 'Escape' && t.value) { e.preventDefault(); cancelQ(); t.value = ''; gs.f.q = ''; renderGoals(); return; }
    if (t.getAttribute && t.getAttribute('role') === 'tab' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTab(gs.tab === 'goal' ? 'watch' : 'goal', true); }
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const btn = t.closest('button');
    if (!btn || !host.contains(btn)) return;
    if (btn.classList.contains('hb-pend')) { const pr = rowOfBtn(btn, false); if (pr) openPending(pr, btn); return; }   // 결재 중 칩
    if (btn.classList.contains('hb-tag')) {
      const act = btn.getAttribute('data-act'), inst = btn.getAttribute('data-inst') || '';
      if (act === 'tag') { if (menu && menu.btn === btn) closeMenu(true); else openMenu(btn); }
      else if (act === 'add' || act === 'cand') openAdd({ id: inst, tag: '' });
      else if (act === 'oadd') { closePop(false); openAdd({ id: inst, tag: 'RETAIN', kind: 'GOAL', opener: $('hb-ours-btn') }); }   // 협약 중인 기관 팝업의 줄: 목표·재유치 도전으로 채운 추가 창
      else if (act === 'owatch') { closePop(false); openAdd({ id: inst, kind: 'WATCH', opener: $('hb-ours-btn') }); }   // 국민은행 확정 줄: 관심으로 채운 추가 창(결과는 기존 관심 추가 흐름 — 관심 탭·알림)
      else if (act === 'addwatch') openAdd({ id: '', kind: 'WATCH' });
      else if (act === 'towatch' || act === 'tonext' || act === 'togoal') { const r = rowOfBtn(btn, false); if (r && isApproval()) openChange(moveChange(r, act, btn)); else if (r) openMove(act, r, btn); }
      else if (btn.id === 'hb-see-watch') seeWatch();
      else if (btn.id === 'hb-sclr') { gs.f.stage = -1; renderGoals(); }
      else if (btn.id === 'hb-see-carried') seeCarried();
      else if (btn.id === 'hb-see-inbox') seeInbox('mine');
      return;
    }
    if (btn.classList.contains('hb-nm') || btn.classList.contains('hb-row')) { openOurs(btn); return; }
    if (btn.classList.contains('hb-confirm')) { openOurs(btn, 'confirm'); return; }
    if (btn.classList.contains('hb-sort')) { sortBtn(btn.getAttribute('data-sort') || ''); return; }
    if (btn.classList.contains('hb-sb')) { stageBtn(Number(btn.getAttribute('data-stage'))); return; }
    if (btn.getAttribute('role') === 'tab') { setTab(btn.getAttribute('data-tab')); return; }
    switch (btn.id) {
      case 'hb-add': openAdd(null); break;
      case 'hb-selclr': clearSelection(); break;
      case 'hb-selgo': openChange({ opener: btn }); break;
      case 'hb-ours-btn': openPop(); break;
      case 'hb-ours-close': closePop(true); break;
      case 'hb-watch-add': case 'hb-watch-add2': openAdd({ id: '', kind: 'WATCH' }); break;
      case 'hb-sclr': gs.f.stage = -1; renderGoals(); break;
      case 'hb-fclear': case 'hb-fclear2': clearFilters(); break;
      case 'hb-gretry': gs.retryFocus = 'hb-gretry'; loadGoals(); break;      // 다시 그린 뒤 포커스를 되돌린다(applyRetryFocus)
      case 'hb-rec-more': {   // 고른 묶음 전체 펼침 — 단추가 사라지므로 포커스는 새로 나타난 첫 줄(6번째)의 이름 단추로
        gs.recTab = btn.getAttribute('data-group') || gs.recTab; gs.recAll = true; renderGoals();   // 지금 보이는 묶음으로 고정(사라져 대체된 묶음이면 그 묶음이 새로 고른 것이 된다)
        const nms = $('hb-ts') ? $('hb-ts').querySelectorAll('#hb-rec-list .hb-nm') : [], nx = nms[kbb.CAND_MAX] || nms[nms.length - 1];
        if (nx && nx.focus) nx.focus();
        break;
      }
      case 'hb-pretry': gs.retryFocus = 'hb-pretry'; loadProgress(); break;   // 제안 진행 자료 오류 안내의 [다시 시도]
      case 'hb-to-notice': openNotice(''); break;
      case 'hb-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  // 위→아래(design 11-19 4-4): 제목 줄 → 오류(#hb-err) → 요약 띠 → 결과 알림(#hb-note) → 목표 표(#hb-goals). 협약 구획은 팝업. 표·띠 안쪽은 renderGoals가 채운다.
  const WAIT = '<p class="db-state" aria-busy="true">불러오는 중입니다…</p>';
  const SKELETON =
    '<section id="hb-root" aria-label="입찰 현황판">' +
    '<div class="hb-top"><h2>입찰 현황판</h2><select id="hb-year" aria-label="목표 연도"></select>' +
    '<span class="ro" id="hb-ro" hidden>' + esc(kbb.GOAL_MSG.roTop) + '</span>' +
    '<span class="meta">기준일 <b id="hb-asof"></b></span><button type="button" id="hb-ours-btn" aria-haspopup="dialog" aria-disabled="true">협약 중인 기관</button><button type="button" id="hb-add" hidden>목표 기관 추가</button></div>' +
    '<div id="hb-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="hb-band" id="hb-band" role="group" aria-label="목표 요약" aria-busy="true"></div>' +
    '<div class="hb-note" id="hb-note" hidden><svg class="hb-note-ck" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6.4 4.8 9 10 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><div id="hb-flash" class="db-flash" role="status"></div><span id="hb-flash-act"></span></div>' +
    '<div class="hb-tp" id="hb-goals" tabindex="-1" aria-busy="true"><div class="hb-tb" id="hb-tb"></div><div class="hb-ts" id="hb-ts" role="tabpanel"></div>' + tc.selbarHtml() + '<div class="hb-tf" id="hb-tf"></div></div>' +
    '</section>';

  function onChange(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'hb-pickall' || (t.getAttribute && t.getAttribute('data-pick') !== null)) { onPick(t); return; }
    if (t.name === 'hb-rec') {   // 빈 상태 추천 묶음 고르기: 다시 5줄로 접고, 포커스는 고른 라디오에 남긴다
      gs.recTab = t.value; gs.recAll = false; renderGoals();
      const rc = $('hb-ts') ? $('hb-ts').querySelector('input[name="hb-rec"]:checked') : null; if (rc && rc.focus) rc.focus();
      return;
    }
    if (t.id === 'hb-year') { const y = Number(t.value); if (y) { gs.year = y; gs.optSig = ''; gs.recTab = ''; gs.recAll = false; loadGoals(); } return; }
    if (t.id === 'hb-f-tag') { gs.f.tag = t.value; renderGoals(); const e1 = $('hb-f-tag'); if (e1) e1.focus(); }
    else if (t.id === 'hb-f-status') { gs.f.status = t.value; renderGoals(); const e2 = $('hb-f-status'); if (e2) e2.focus(); }
    else if (t.id === 'hb-f-kind') { gs.f.kind = t.value; renderGoals(); const e3 = $('hb-f-kind'); if (e3) e3.focus(); }
  }

  kbb.mount = function (el) {
    if (!el) return;
    if (host) kbb.unmount();
    host = el;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('change', onChange, opt);
    host.addEventListener('input', onInput, opt);
    host.addEventListener('compositionstart', onCompStart, opt);
    host.addEventListener('compositionend', onCompEnd, opt);
    composing = false; gs.cntEl = null;
    gs.sel = tc.newSel(); gs.selMsg = ''; gs.carryTried = false;   // NEXT 105: 마운트마다 새로(자동 이월은 한 번만)
    host.addEventListener('keydown', onKeydown, opt);
    st.err = '';
    gs.st = (!U.serverMode() || !U.hasEmp()) ? 'offline' : 'loading';
    gs.recTab = ''; gs.recAll = false;
    gs.tab = 'goal'; gs.f = { q: '', tag: '', status: '', kind: '', stage: -1 }; gs.tbSig = '';   // 거르기는 화면 상태로만(저장하지 않는다)
    refreshData();   // 서버가 없어도 [협약 중인 기관] 버튼은 내장 자료로 열린다
    loadProgress();
    loadGoals();
    const nrm = root.noticerec;   // 현황판이 기록 변화에 맞춰 다시 그려지게 구독한다
    if (nrm && nrm.onChange) offNr = nrm.onChange(function () { if (host && ALL) { renderOurs(); renderGoals(); } });
    if (nrm && nrm.ensure) nrm.ensure();
  };
  kbb.refresh = function () { if (host && ALL) refreshData(); };       // 기관 편집 저장 뒤 서버 목록이 바뀌면
  kbb.reload = function () { if (host) loadProgress(); };              // 상세 팝업에서 [제안 확정] 뒤
  kbb.onProfileChange = function () {                                  // 계정이 바뀌면 앞 사용자의 준비 중 제안·목표 기관을 버린다
    seq += 1; gs.seq += 1;
    st.preps = st.overview = null; st.prepSt = st.ovSt = 'offline';
    gs.st = 'offline'; gs.data = null; gs.sumSt = 'idle'; gs.sum = {}; gs.direct = {}; gs.rows = []; gs.wrows = []; gs.focusNext = null; gs.retryFocus = '';
    gs.just = null; gs.seeInst = ''; gs.recTab = ''; gs.recAll = false;   // 앞 계정의 강조·[관심 탭에서 보기] 대상을 버린다(qa 11-19 P3-2)
    if (dash.clearGoals) dash.clearGoals();
    closeChangeDlgs(); gs.sel = tc.newSel(); gs.selMsg = ''; gs.carryTried = false; gs.carryTok += 1; gs.justIds = null;   // 앞 계정의 고른 줄·창·진행 중인 이월을 버린다
    prepDenied403 = false;   // 다른 계정은 제안 진행을 볼 수 있을 수 있다 — 403 기억을 푼다
    closeMenu(false); closeDlg('none'); closePop(false);
    if (host && ALL) { renderAll(); loadProgress(); loadGoals(); if (root.noticerec && root.noticerec.ensure) root.noticerec.ensure(); }   // 공고 현황 기록도 새 계정으로 다시(mount와 같은 방식, qa 11-19 P3-3)
  };
  kbb.unmount = function () {
    seq += 1; gs.seq += 1;
    closeMenu(false); closeDlg('none'); closePop(false);
    if (qTimer) { clearTimeout(qTimer); qTimer = null; }
    closeChangeDlgs(); gs.sel = tc.newSel(); gs.carryTried = false; gs.carryTok += 1;
    if (offNr) { offNr(); offNr = null; }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; ALL = null; G = null; gs.rows = []; gs.wrows = []; gs.data = null; gs.st = 'offline'; gs.retryFocus = '';
    gs.just = null; gs.focusNext = null; gs.seeInst = '';   // qa 11-19 P3-2
  };

  if (isNode) module.exports = kbb;
  else root.kbboard = kbb;
})(typeof self !== 'undefined' ? self : this);
