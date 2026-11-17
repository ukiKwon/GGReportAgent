(function (root) {
  'use strict';
  // 입찰 현황판(2026-11-16 역할 재정의, 사용자 확정; 11-17 '올해 목표 기관' 중심으로 재설계) — 국민은행 상태 화면.
  // 구성(위→아래): 제목 줄(연도 선택·[목표 기관 추가]) → 요약 띠(목표 n곳·접수 마감 30일 안·준비 지연·목표 기관의 현 금고 은행) → 목표 표(한 줄 = 한 기관: 구분·마감까지·현 금고 은행·준비 단계·설명회·12개월 일정,
  //   아래에 '목표 밖에서 제안을 준비 중인 기관' 묶음) → 접힌 '협약 중인 기관'(details 요소 #hb-ours, 협약 종료일 순·와플 머리).
  // 규격: handoff/agents/design-reviewer/2026-11-17_1513_acfdd5da.md 6-A~6-E(6-F 설명회 입력은 2단계 — 설명회 열은 '—'). 접두어 hb-. 화면 글에 1인칭 '우리'를 쓰지 않는다(낙찰 은행 '우리은행'과 헷갈림). 회차 소식 줄의 출처 문장 속 은행 이름은 그대로 둔다.
  // 서버: GET /bid-targets?year=·POST /institutions/{id}/bid-targets(·/{no}/cancel)·GET /bank-contracts/summary. 쓰기 머리글 X-Screen-Id 'bid_board'·X-Button-Id(add_bid_target·change_target_tag·cancel_bid_target), X-Emp-No는 app.js의 fetch 덮개가 붙인다.
  // 협약 종료일 원천(실제 동작): 지자체 = 직접 입력 금고 약정(/bank-contracts/summary의 국민은행 줄 term_to) > 행안부 금고지정 현황(LOFIN_2026)의 국민은행 줄 end(없으면 일반회계 줄) / 법원·공공기관 = 레코드 contractExpiry, 없으면 '종료일 미상'.
  // 새 판정은 만들지 않고 dashboard.js의 함수(model·kbEntry·isOurs·stageCounts·itemForRec …)를 조합한다.
  // 순수 부분은 node 테스트 대상이고, DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다.
  // 순수 함수는 검증 자료(verified)와 2027년부터 자료(nextList)를 인자로 받는다(전역 root.KB_NEXT에 기대지 않는다). DOM 부분만 전역을 읽는다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = isNode ? require('./dashboard.js') : root.dashboard;
  const errtext = isNode ? require('./errtext.js') : root.errtext;
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
  // 이번 협약 뒤에도 국민은행이 맡는 것으로 읽히는 곳: 회차 소식(KB_VERIFIED.next)에 수성·재선정·유지가 있고 '다른 은행으로 간다'(leaves)가 아닐 때. '다음은 다른 은행'과 짝(D-n 색은 그대로).
  // 문장이 국민(국민은행·KB국민·KB)을 말하고 수성·재선정·유지가 있을 때만 — '부산은행 유지'나 '수성 실패·미정·미확인'은 아니다(qa 11-17 P3-3).
  kbb.staysText = function (rec, verified) {
    const e = rec ? dash.kbEntry(rec, verified) : null;
    const t = String(e && e.next || '');
    return e && !e.leaves && /국민|KB/.test(t) && /수성|재선정|유지/.test(t) && !/실패|미정|미확인/.test(t) ? '다음도 국민은행' : '';
  };
  // 협약 중인 기관 행 — <ul> 안의 <button>. 누르면 상세 팝업이 열린다(선택형 listbox가 아니다).
  // o = { verified, nextList, prepActive }
  kbb.rowHtml = function (it, o) {
    o = o || {};
    const slot = kbb.slotText(it.rec, o.verified, o.nextList), leaves = kbb.leavesText(it.rec, o.verified), stays = kbb.staysText(it.rec, o.verified);
    const isNext = dash.oursKind(it.rec, o.verified, o.nextList) === 'next';
    const news = kbb.newsLine(dash.kbEntry(it.rec, o.verified) || dash.kbEntry(it.rec, o.nextList));
    const over = it.endDays !== undefined && it.endDays !== null && it.endDays < 0;
    return '<li><button type="button" class="hb-row" data-key="' + esc(it.key) + (it.overdue && dash.recView(it).view === 'done' ? '" data-rec="done' : '') + '" aria-haspopup="dialog">' +
      '<span class="nm">' + esc(it.name) + (slot ? '<span class="hb-slot">' + esc(slot) + '</span>' : '') +
      (leaves ? '<span class="hb-slot hb-leaves">다음은 다른 은행<span class="sr-only">(' + esc(leaves.replace(' 다른 은행', '')) + ')</span></span>' : '') +
      (stays ? '<span class="hb-slot hb-stay">' + esc(stays) + '</span>' : '') + '</span>' +
      (isNext ? '' : kbb.endHtml(it)) +
      '<span class="meta">' + metaHtml(it, isNext) + (over ? ' · 새 협약 기간 확인 필요' : '') + (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</span>' +
      (news ? '<span class="news" title="' + esc(news) + '">' + esc(news) + '</span>' : '') + '</button></li>';
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
  kbb.BTN = { add: 'add_bid_target', tag: 'change_target_tag', cancel: 'cancel_bid_target' };
  kbb.TAG = { RETAIN: '재유치 도전', NEW: '신규유치 도전' };
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
  kbb.defaultTag = function (rec, sum, o) {
    o = o || {};
    const s = sum && sum.kb_now;
    const other = function () {
      const out = { tag: 'NEW', why: 'other' }, b = kbb.bankInfo(sum, rec, o);
      if (!b.unknown && !b.kb && b.name) out.bank = b.name;
      return out;
    };
    if (s === 'KB') return { tag: 'RETAIN', why: 'kb' };
    if (s === 'OTHER') return other();
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
    return nm + josaEun(nm) + ' 지금 ' + whoIs(def) + ' 금고라 \'' + tag + '\'' + dash.josaEul(tag) + ' 골랐습니다. 바꿀 수 있습니다.';
  };
  // 메뉴 맨 위 설명 줄에 쓰는 근거(규격 6-E ②)
  kbb.tagWhy = function (def) { return def && def.why === 'other' ? '지금 ' + whoIs(def) + ' 금고' : (def && def.tag ? '지금 국민은행 협약 중' : ''); };

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
  kbb.sortGoals = function (rows) {
    return (rows || []).slice().sort(function (a, b) {
      return (dueRank(a.due) - dueRank(b.due)) || (dueSigned(a.due) - dueSigned(b.due)) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    });
  };
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
  // ctx = { byInst:{id→rec}, sumById, today:Date, verified, lofin, entries:{id→prepEntry}, prepOk, delayDays, actOf(rec)→act }
  kbb.goalRow = function (t, ctx, out) {
    const id = String(t.institution_id || t.institutionId || '');
    const rec = (ctx.byInst && ctx.byInst[id]) || null;
    const it = rec ? dash.itemForRec(rec, ctx.today) : null;
    const sum = t.bank && typeof t.bank === 'object' ? t.bank : ((ctx.sumById && ctx.sumById[id]) || null);
    const due = kbb.dueOf(it), e = ctx.entries && ctx.entries[id], stage = e ? e.stage : -1, key = rec ? logic.instKey(rec) : '';
    const r = { id: id, key: key, fkey: key || ('id:' + id), rec: rec, it: it, out: !!out, name: (rec && rec.name) || String(t.institution_name || ''),
      regionName: dash.regionName((rec && rec.region) || t.region_code || ''),
      targetNo: t.target_no, revNo: t.rev_no, targetYear: t.target_year, tagCd: t.tag_cd || '', tagName: t.tag_name || kbb.TAG[t.tag_cd] || '',
      memo: String(t.memo || ''), ownerEmpNo: t.owner_emp_no || '', editorName: String(t.editor_name || ''), firstEditor: String(t.first_editor_name || ''),
      savedAt: String(t.saved_at || ''), empVerified: t.emp_verified === true, canCancel: !!t.can_cancel,
      due: due, bank: kbb.bankInfo(sum, rec, { lofin: ctx.lofin, today: ctx.today }),
      prevYear: sum && sum.kb_now !== 'KB' && sum.last_kb_year ? Number(sum.last_kb_year) : 0,
      stage: stage, stageLabel: stage >= 0 ? ((dash.STAGES[stage] || {}).label || '') : '',
      act: stage >= 0 ? 'open' : (rec && ctx.actOf ? ctx.actOf(rec) : ''), late: null, hold: null };
    if (ctx.prepOk) {
      // 지연 = 확정 마감이 기준일 안인데 제안서 작성 전. 추정일만 있으면 판정 보류(규격 6-A).
      const dl = ctx.delayDays || kbb.DELAY_DEFAULT, writing = stage === 4;
      if (due.kind === 'fixed') { r.late = due.days <= dl && !writing; r.hold = false; }
      else {
        r.late = false;
        r.hold = !writing && (due.kind === 'over' || due.kind === 'open' || ((due.kind === 'est' || due.kind === 'plan') && due.days <= dl));
      }
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
  // 빈 상태 후보: 협약 1년 안 종료이면서 '다음도 국민은행'·협약 예정이 아닌 곳, 이미 목표인 곳 제외(기획 이관 기본값 — 팀 결정 11-17).
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
    const b = { n: rows.length, retain: 0, fresh: 0, soon: 0, delay: null, hold: null, delayDays: o.delayDays || kbb.DELAY_DEFAULT, bars: [] };
    rows.forEach(function (r) {
      if (r.tagCd === 'RETAIN') b.retain += 1; else if (r.tagCd === 'NEW') b.fresh += 1;
      if (r.due.kind === 'fixed' && r.due.days <= kbb.DEADLINE_SOON) b.soon += 1;
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
  // v = { year, loaded(목표 기관을 받았는가), prep('denied'|'error'|그 밖(없음·받는 중·서버 없음)), prepCode }. 받기 전에는 값 자리에 '—'.
  kbb.bandHtml = function (b, v) {
    const dash2 = '—', y = esc(v.year), ld = !!v.loaded;
    const big = function (n, hot) { return '<span class="v' + (hot && n > 0 ? ' hot' : '') + '">' + n + '<span>곳</span></span>'; };
    const k1 = '<div class="hb-k"><span class="l">' + y + ' 목표 기관</span>' + (ld ? big(b.n, false) : '<span class="v">' + dash2 + '</span>') +
      '<span class="s">' + (ld ? kbb.TAG.RETAIN + ' <b>' + b.retain + '</b> · ' + kbb.TAG.NEW + ' <b>' + b.fresh + '</b>' : '&nbsp;') + '</span></div>';
    const k2 = '<div class="hb-k"><span class="l">접수 마감 ' + kbb.DEADLINE_SOON + '일 안</span>' + (ld ? big(b.soon, true) : '<span class="v">' + dash2 + '</span>') +
      '<span class="s">공고로 확정된 마감일만 셉니다</span></div>';
    const M = kbb.BAND_MSG, none = ld && b.n === 0;
    let v3;
    if (!ld || none || b.delay === null) v3 = '<span class="v">' + dash2 + '</span>';
    else v3 = b.delay > 0 ? big(b.delay, true) : '<span class="v">없음</span>';
    let why3 = M.noPrep;
    if (v.prep === 'denied') why3 = Number(v.prepCode) === 401 ? M.login : M.denied;
    else if (v.prep === 'error') why3 = M.error;
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

  // 표 행(규격 6-C). r = goalRow 결과, o = { win, canEdit }
  const CHEV = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3l2.5 2.5L6.5 3"/></svg>';
  function tagCellHtml(r, o) {
    if (r.out) {
      return '<td>' + (o.canEdit ? '<button type="button" class="hb-tag add" data-act="add" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-label="' + esc(r.name) + ' 목표에 넣기">목표에 넣기</button>'
        : '<span class="hb-tag ro">목표 아님</span>') + '</td>';
    }
    const nm = esc(r.tagName || r.tagCd);
    // 넣은 사람·고친 사람·메모는 서버 글 — 전부 이스케이프. 사번 확인 안 된 기록은 '확인됨'처럼 보이지 않게 '사번 자기신고'를 밝힌다.
    const tip = [r.memo ? '메모: ' + r.memo : '', r.firstEditor ? '넣은 사람 ' + r.firstEditor : '',
      r.editorName ? '마지막 고침 ' + r.editorName + (r.empVerified ? '' : '(사번 자기신고)') + (r.savedAt ? ' ' + r.savedAt.slice(0, 16).replace('T', ' ') : '') : ''].filter(Boolean).join(' · ');
    const prev = r.tagCd === 'NEW' && r.prevYear ? '<span class="hb-q hb-prev" title="예전에 국민은행 금고였던 기관(마지막 ' + r.prevYear + '년)">예전 KB</span><span class="sr-only"> 예전 국민은행 금고, 마지막 ' + r.prevYear + '년</span>' : '';
    const chip = o.canEdit
      ? '<button type="button" class="hb-tag" data-act="tag" data-inst="' + esc(r.id) + '" data-key="' + esc(r.fkey) + '" aria-haspopup="menu" aria-expanded="false"><span class="sr-only">구분: </span>' + nm + CHEV + '</button>'
      : '<span class="hb-tag ro"><span class="sr-only">구분: </span>' + nm + '</span>';
    return '<td' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + chip + prev + (tip ? '<span class="sr-only">. ' + esc(tip) + '</span>' : '') + '</td>';
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
    return '<tr' + (r.late ? ' class="late"' : '') + '><th scope="row">' + nm + '</th>' + tagCellHtml(r, o) + '<td>' + kbb.dueHtml(r.due) + '</td>' + kbb.bankCellHtml(r.bank) + stageCellHtml(r) +
      '<td class="mut"><span aria-hidden="true">—</span><span class="sr-only">설명회 기록 없음</span></td><td class="ln">' + kbb.laneCellHtml(r.due, o.win) + '</td></tr>';
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
    const c = v.cands || [];
    if (!c.length) return h + '<p>' + esc(kbb.GOAL_MSG.noCand) + '</p>';
    h += '<p>국민은행 협약이 1년 안에 끝나고 다음 은행이 정해지지 않은 기관 <b>' + c.length + '</b>곳입니다. ' + kbb.TAG.RETAIN + '으로 넣을 수 있습니다.</p><ul class="hb-cand">' +
      c.slice(0, 8).map(function (x) {
        return '<li><button type="button" class="hb-nm" data-key="' + esc(x.key) + '" data-inst="' + esc(x.id) + '" aria-haspopup="dialog"><span class="rg">' + esc(dash.regionName(x.region)) + '</span>' + esc(x.name) + '</button>' +
          (x.endDate ? '<span class="hb-q">협약 종료 ' + esc(x.endDate) + '</span>' : '') +
          '<button type="button" class="hb-tag add" data-act="cand" data-inst="' + esc(x.id) + '" data-key="' + esc(x.key) + '" aria-label="' + esc(x.name) + ' 목표에 넣기">목표에 넣기</button></li>';
      }).join('') + '</ul>';
    return h + '<p>그 밖의 기관은 위 [목표 기관 추가]에서 찾습니다.</p>';
  };
  // 제안 진행 자료(/preps·/workflow/overview)를 못 받았을 때 목표 밖 묶음 자리에 놓는 안내 + [다시 시도](qa 11-17 P2-1). code 0 = 서버에 연결되지 않음.
  kbb.prepErrHtml = function (code) {
    return '제안 진행 자료를 불러오지 못했습니다(' + (code ? '오류 ' + Number(code) : '서버에 연결되지 않음') + '). 준비 지연과 목표 밖에서 준비 중인 기관은 받은 뒤에 보입니다. <button type="button" id="hb-pretry">다시 시도</button>';
  };
  // 표 전체(머리 + 몸통). v = { st:'loading'|'offline'|'denied'|'error'|'ok', code, year, win, rows, out, canEdit, cands, prep('error'이면 제안 진행 자료 오류 안내), prepCode }
  // 열 폭은 CSS 클래스(.c-nm 기관 150 · .c-tag 구분 166 · .c-due 마감까지 120 · .c-bank 현 금고 은행 124 · .c-stg 준비 단계 148 · .c-brf 설명회 56, 레인은 나머지) — 1279px 이하에서 기관 열이 남는 폭을 받는다.
  kbb.goalTableHtml = function (v) {
    const win = v.win, ncol = 7;
    const cols = '<colgroup><col class="c-nm"><col class="c-tag"><col class="c-due"><col class="c-bank"><col class="c-stg"><col class="c-brf"><col class="ln"></colgroup>';
    const head = '<thead><tr><th scope="col">기관</th><th scope="col">구분</th><th scope="col">마감까지</th><th scope="col">현 금고 은행</th><th scope="col">준비 단계</th><th scope="col">설명회</th>' +
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
      const o = { win: win, canEdit: !!v.canEdit };
      body = v.rows.length ? '<tbody>' + v.rows.map(function (r) { return kbb.goalRowHtml(r, o); }).join('') + '</tbody>' : msg(kbb.emptyHtml(v));
      if (v.out && v.out.length) {
        body += '<tbody><tr class="grp"><th scope="rowgroup" colspan="' + ncol + '">목표 밖에서 제안을 준비 중인 기관 <b>' + v.out.length + '</b>곳</th></tr>' + v.out.map(function (r) { return kbb.goalRowHtml(r, o); }).join('') + '</tbody>';
      } else if (v.prep === 'error') {
        body += '<tbody><tr class="grp"><th scope="rowgroup" colspan="' + ncol + '">목표 밖에서 제안을 준비 중인 기관</th></tr><tr class="emp"><td colspan="' + ncol + '"><p class="db-state">' + kbb.prepErrHtml(v.prepCode) + '</p></td></tr></tbody>';
      }
    }
    const cap = v.st === 'ok' ? esc(v.year) + ' 목표 기관 ' + v.rows.length + '곳, 마감 가까운 순' : esc(v.year) + ' 목표 기관';
    return '<table class="hb-tt"><caption class="sr-only">' + cap + '</caption>' + cols + head + body + '</table>';
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
    let h = '<div class="hb-menu" role="menu" aria-label="구분 바꾸기">';
    if (def.tag) h += '<div class="mh">자동 제안: ' + esc(kbb.TAG[def.tag] || '') + ' — ' + esc(kbb.tagWhy(def)) + '</div>';
    (o.tags || []).forEach(function (t) {
      h += '<button type="button" role="menuitemradio" aria-checked="' + (t.code === r.tagCd ? 'true' : 'false') + '" data-tag="' + esc(t.code) + '" tabindex="-1"><span>' + esc(t.name) + '</span>' + CK + '</button>';
    });
    if (o.canCancel) h += '<div class="ms" role="separator"></div><button type="button" role="menuitem" data-cmd="cancel" tabindex="-1">목표에서 빼기…</button>';
    return h + '</div>';
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
      return { id: id, key: logic.instKey(r), rec: r, name: r.name || '', taken: !!(o.taken && o.taken[id]), sub: kbb.instSub(r, o.sumById && o.sumById[id], o, true) };
    });
  };
  kbb.resultsHtml = function (results, active, year) {
    return (results || []).map(function (x, i) {
      return '<li role="option" id="hb-a-o' + i + '" data-i="' + i + '" aria-selected="' + (i === active ? 'true' : 'false') + '"' + (x.taken ? ' aria-disabled="true"' : '') + '>' +
        '<span class="nm">' + esc(x.name) + '</span><span class="sub">' + esc(x.sub) + (x.taken ? ' · 이미 ' + esc(year) + ' 목표' : '') + '</span></li>';
    }).join('');
  };
  kbb.addState = function (m) {
    if (!m.inst) return { canGo: false, why: '기관을 고르세요.' };
    if (!m.tag) return { canGo: false, why: '구분을 고르세요.' };
    if (!m.year) return { canGo: false, why: '목표 연도를 고르세요.' };
    if (String(m.memo || '').length > kbb.MEMO_MAX) return { canGo: false, why: '메모는 ' + kbb.MEMO_MAX + '자 이내로 적으세요.' };
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
    return '<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">목표 기관 추가</h3><div class="modal-scroll tm-m-body">' +
      '<div class="tm-reason-row"><label for="hb-a-q">기관 (필수)</label></div>' +
      '<input type="text" id="hb-a-q" role="combobox" aria-expanded="false" aria-controls="hb-a-list" aria-autocomplete="list" aria-describedby="hb-a-pick" autocomplete="off" maxlength="40" placeholder="기관 이름을 2자 이상 적으세요" value="' + esc(m.q || '') + '">' +
      '<ul id="hb-a-list" class="hb-res" role="listbox" aria-label="기관 검색 결과"></ul><p id="hb-a-pick" class="tm-note">' + esc(m.pickText || '') + '</p>' +
      '<div class="tm-reason-row"><label for="hb-a-year">목표 연도 (필수)</label></div><select id="hb-a-year">' + yrs + '</select>' +
      '<fieldset class="tm-fs"><legend>구분 (필수)</legend><div class="hb-opts">' + tags + '</div><p id="hb-a-note" class="tm-note">' + esc(m.note || '') + '</p></fieldset>' +
      '<div class="tm-reason-row"><label for="hb-a-memo">메모 (선택)</label><span id="hb-a-cnt" class="tm-count">0/' + kbb.MEMO_MAX + '</span></div>' +
      '<input type="text" id="hb-a-memo" maxlength="' + kbb.MEMO_MAX + '" aria-describedby="hb-a-mh hb-a-cnt" value=""><p id="hb-a-mh" class="tm-note">개인정보를 적지 마세요.</p>' +
      '<div id="hb-a-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions"><span id="hb-a-why" class="tm-why"></span><button type="button" id="hb-a-cancel">취소</button>' +
      '<button type="button" id="hb-a-go" class="pp-next-btn" disabled aria-describedby="hb-a-why">목표에 넣기</button></div></div>';
  };
  // 사유 목록은 서버 코드표(GET /bid-targets의 codes.cancel_reasons)만 쓴다 — 코드를 화면이 지어내지 않는다. 기타의 코드는 'ETC'.
  kbb.cancelDialogHtml = function (r, o) {
    o = o || {};
    const rs = (o.reasons || []).map(function (x) {
      return '<label class="hb-rd"><input type="radio" name="hb-c-rs" value="' + esc(x.code) + '"> ' + esc(x.name) + '</label>';
    }).join('');
    return '<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">목표에서 빼기 — ' + esc(r.regionName) + ' ' + esc(r.name) + '</h3><div class="modal-scroll tm-m-body">' +
      '<p class="tm-note">뺀 기록(누가·언제·사유)은 남고, 같은 해에 다시 넣을 수 있습니다.</p>' +
      '<fieldset class="tm-fs"><legend>사유 (필수)</legend><div class="hb-opts v">' + rs + '</div>' +
      '<div class="hb-etc" id="hb-c-etcrow" hidden><div class="tm-reason-row"><label for="hb-c-etc">기타 사유 (필수)</label><span id="hb-c-cnt" class="tm-count">0/' + kbb.ETC_MAX + '</span></div>' +
      '<input type="text" id="hb-c-etc" maxlength="' + kbb.ETC_MAX + '" aria-describedby="hb-c-mh hb-c-cnt" value=""><p id="hb-c-mh" class="tm-note">사유에는 개인정보를 적지 마세요.</p></div></fieldset>' +
      '<div id="hb-c-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions"><span id="hb-c-why" class="tm-why"></span><button type="button" id="hb-c-cancel">취소</button>' +
      '<button type="button" id="hb-c-go" class="pp-danger" disabled aria-describedby="hb-c-why">목표에서 빼기</button></div></div>';
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
  // 저장·빼기 응답 해석. 서버 문구(detail.message)를 그대로 쓰고, 409 DUP_TARGET·STALE·LIMIT·ALREADY_CANCELLED와 400·422는 문구만 다르게 나눈다.
  // 서버 문구는 한글이 든 것만 쓴다 — 영문 오류 문구('institution not found' 등)는 화면에 내보이지 않고 한국어 고정 문구로 바꾼다(qa 11-17 P3-12).
  function korMsg(m) { return /[가-힣]/.test(String(m || '')) ? String(m) : ''; }
  kbb.outcome = function (x, op, c) {
    c = c || {};
    const s = x ? x.status : 0, d = x && x.body ? x.body.detail : null, p = errtext.parse(d), msg = korMsg(p.message);
    if (s === 201) return { kind: 'saved' };
    if (s === 200) return { kind: 'nochange', msg: '바뀐 내용이 없습니다.' };
    if (s === 409 && p.code === 'DUP_TARGET') return { kind: 'dup', code: p.code, msg: '넣지 못했습니다 — 이미 ' + (c.year || '') + ' 목표에 있는 기관입니다.' };
    if (s === 409 && p.code === 'LIMIT') return { kind: 'limit', code: p.code, msg: msg || '이 기관의 목표 기록이 더 늘릴 수 없는 한도에 닿았습니다.' };
    if (s === 409) return { kind: 'stale', code: p.code, msg: (msg ? msg + ' ' : '') + '목록을 다시 불러왔습니다.' };
    if (s === 400 || s === 422) return { kind: 'field', code: p.code, msg: msg || '입력한 내용을 확인하세요.' };
    if (s === 401 || s === 403) return { kind: 'denied', msg: msg || (s === 401 ? '로그인이 필요합니다. 다시 로그인하세요.' : '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.') };
    if (s === 404) return { kind: 'error', msg: msg || '기관을 찾지 못했습니다.' };
    if (s === 0) return { kind: 'error', msg: '서버에 연결되지 않아 저장하지 못했습니다. 다시 시도하세요.' };
    return { kind: 'error', msg: msg || '저장하지 못했습니다(오류 ' + s + '). 다시 시도하세요.' };
  };
  kbb.flashAdded = function (name, year) { return name + dash.josaEul(name) + ' ' + year + ' 목표 기관에 넣었습니다.'; };
  kbb.flashTag = function (name, tagName) { return name + dash.josaEul(name) + ' \'' + tagName + '\'' + josaRo(tagName) + ' 바꿨습니다.'; };
  kbb.flashCancelled = function (name, year) { return name + dash.josaEul(name) + ' ' + year + ' 목표에서 뺐습니다.'; };

  // ── DOM ───────────────────────────────────────────────────────────
  const st = { preps: null, overview: null, prepSt: 'offline', ovSt: 'offline', prepCode: 0, ovCode: 0, err: '' };
  // 올해 목표 기관 상태: st = 'offline'|'loading'|'ok'|'denied'|'error', data = GET /bid-targets 응답, sum = { institutionId: 039 요약 항목 }, direct = endOpts().direct
  const gs = { year: 0, st: 'offline', code: 0, data: null, seq: 0, sumSt: 'idle', sum: {}, direct: {}, rows: [], busy: false, focusNext: null, retryFocus: '', optSig: '' };
  let host = null, ac = null, LIST = [], ALL = null, OURS = [], G = null, BYID = {}, seq = 0, offNr = null, menu = null, dlg = null;
  let prepDenied403 = false;   // /preps·/workflow/overview가 둘 다 403으로 확정된 계정 — 화면을 열 때마다 다시 부르지 않는다(계정이 바뀌면 onProfileChange가 푼다, design 11-17 7절)
  const U = dash.util;
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function canEditNow() { return gs.st === 'ok' && !!gs.data && !!gs.data.can_edit; }   // 서버가 준 can_edit 하나로만 판정(버튼이 없어도 함수가 한 번 더 막는다 — qa 11-17)
  function KB() { return root.KB_VERIFIED; }
  function NX() { return root.KB_NEXT; }
  function endOpts() { return { lofin: root.LOFIN_2026, direct: gs.direct }; }   // direct = 직접 입력 금고 약정(/bank-contracts/summary의 국민은행 줄 term_to), 'region|name' → 'YYYY-MM-DD'
  // 다시 그리기 전 이 목록 안의 포커스(행·동작 버튼)를 기억했다가 같은 버튼으로 되돌린다(상세 팝업을 닫고 집계를 다시 받을 때 body로 떨어지지 않게). 세 목록 공통.
  function keepFocus(sc) {
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (!sc || !ae || !ae.getAttribute || !sc.contains(ae)) return null;
    return { key: ae.getAttribute('data-key') || '', act: ae.getAttribute('data-act') || '', bid: ae.getAttribute('data-bid') || '' };
  }
  function restoreFocus(sc, keepKey) {
    if (!keepKey || !sc) return;
    const els = sc.querySelectorAll('button');
    for (let i = 0; i < els.length; i += 1) {
      const b = els[i];
      if ((b.getAttribute('data-key') || '') === keepKey.key && (b.getAttribute('data-act') || '') === keepKey.act && (b.getAttribute('data-bid') || '') === keepKey.bid) { b.focus(); break; }
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
  function renderOurs() {
    const sc = $('hb-oscroll');
    if (!sc) return;
    const keepKey = keepFocus(sc);
    G = kbb.groups(OURS, U.todayDate(), KB(), NX(), endOpts());
    const act = activeIdSet();
    const ul = function (items, lab) {
      return '<ul aria-labelledby="' + lab + '">' + items.map(function (it) {
        return kbb.rowHtml(it, { verified: KB(), nextList: NX(), prepActive: !!(it.rec.institutionId && act[String(it.rec.institutionId)]) });
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
      delayDays: gs.data && Number(gs.data.delay_days) > 0 ? Number(gs.data.delay_days) : kbb.DELAY_DEFAULT, actOf: actOf };
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
  // 줄 누른 뒤 포커스를 옮길 곳(추가한 기관의 이름·뺀 뒤 다음 줄 이름, 없으면 [목표 기관 추가])
  function applyFocusNext() {
    const f = gs.focusNext;
    if (!f || gs.st === 'loading') return;
    gs.focusNext = null;
    let el = null;
    const sc = $('hb-goals');
    if (f.inst && sc) {
      const bs = sc.querySelectorAll('button.hb-nm');
      for (let i = 0; i < bs.length; i += 1) { if (bs[i].getAttribute('data-inst') === f.inst) { el = bs[i]; break; } }
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
  function renderGoals() {
    const ts = $('hb-ts');
    if (!ts || !ALL) return;
    const sc = $('hb-goals'), keepKey = keepFocus(sc);
    const win = kbb.laneWindow(U.todayDate(), goalYear());
    const ok = gs.st === 'ok' && !!gs.data, ctx = goalCtx(), ps = panelState(), prepCode = ps.code || st.prepCode || st.ovCode || 0;
    let rows = [], out = [], cands = [];
    if (ok) {
      rows = kbb.sortGoals(kbb.goalRows(gs.data.items, ctx));
      const ids = targetIds();
      if (ctx.prepOk) out = kbb.sortGoals(kbb.outRows(kbb.prepRows(st.preps, st.overview, LIST, U.todayDate()), ids, ctx));
      cands = kbb.emptyCandidates(G, ids, KB());
    }
    gs.rows = rows.concat(out);
    const canEdit = ok && !!gs.data.can_edit;
    ts.innerHTML = kbb.goalTableHtml({ st: gs.st, code: gs.code, year: goalYear(), win: win, rows: rows, out: out, canEdit: canEdit, cands: cands, prep: ps.state, prepCode: prepCode });
    const band = $('hb-band');
    if (band) {
      band.innerHTML = kbb.bandHtml(kbb.bandModel(rows, { prepOk: ctx.prepOk, delayDays: ctx.delayDays }), { year: goalYear(), loaded: ok, prep: ps.state, prepCode: prepCode });
      band.setAttribute('aria-busy', gs.st === 'loading' ? 'true' : 'false');
      band.setAttribute('aria-label', goalYear() + ' 목표 요약');
    }
    const ft = $('hb-tf'); if (ft && ALL) ft.innerHTML = kbb.goalFootHtml(ALL.notice.length);
    const box = $('hb-goals'); if (box) box.setAttribute('aria-busy', gs.st === 'loading' ? 'true' : 'false');
    renderTop();
    renderOursHead();
    restoreFocus(sc, keepKey);
    applyFocusNext();
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
      renderGoals(); renderOurs();   // 협약 종료일이 직접 입력 값으로 바뀌었을 수 있어 1번 목록도 다시 그린다
    });
  }

  function flash(msg) { const f = $('hb-flash'); if (f) f.textContent = msg || ''; }

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
    const pool = (G ? G.soon.concat(G.later, G.unk, G.next) : []).concat(gs.rows.map(function (r) { return r.it; }).filter(Boolean));
    const it = pool.filter(function (x) { return x.key === key; })[0];
    if (!it) return;
    // 닫은 뒤 포커스(qa 11-17 P2-1): 구획(목표 표·협약 중인 기관)마다 맞는 fallback, opener가 사라졌으면 같은 구획에서 같은 data-key(+data-act) 요소를 다시 찾는다.
    const colEl = btn.closest ? btn.closest('#hb-ours, #hb-goals') : null, colId = colEl && colEl.id ? colEl.id : 'hb-ours', act = btn.getAttribute('data-act') || '';
    dash.openDetail(it.rec, { opener: btn, screen: 'bid_board', fallback: '#' + colId, focus: focus || '',
      refocus: function () { return kbb.findOpener($(colId), key, act); } });
  }

  // ── 구분 메뉴(규격 6-E ②) ──────────────────────────────────────────
  function rowOfBtn(btn, out) {
    const id = btn.getAttribute('data-inst') || '';
    return gs.rows.filter(function (r) { return r.id === id && !!r.out === !!out; })[0] || null;
  }
  function say(msg, isErr) {
    st.err = isErr ? msg : '';
    renderBanner();
    flash(isErr ? '' : msg);
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
    wrap.innerHTML = kbb.menuHtml(r, { tags: tagList(), def: kbb.defaultTag(r.rec, gs.sum[r.id], tagOpts()), canCancel: r.canCancel });
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
      if (it.getAttribute('data-cmd') === 'cancel') { closeMenu(false); openCancel(r, btn); return; }
      const code = it.getAttribute('data-tag');
      if (!code) return;
      if (code === r.tagCd) { closeMenu(true); return; }
      closeMenu(true);
      changeTag(r, code, btn);
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
  function takenFor(year) {
    const set = {};
    if (gs.st === 'ok' && gs.data && Number(gs.data.year) === Number(year)) gs.data.items.forEach(function (t) { set[String(t.institution_id)] = true; });
    return set;
  }
  function pickInst(m, rec, tagPre) {
    const id = String(rec.institutionId);
    m.inst = { id: id, name: rec.name || '', rec: rec };
    m.q = m.inst.name;
    const def = kbb.defaultTag(rec, gs.sum[id], tagOpts());
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
    const m = d.m, s = kbb.addState(m);
    const q = dq('hb-a-q'), list = dq('hb-a-list');
    if (q && q.value !== m.q) q.value = m.q;
    if (q) { q.setAttribute('aria-expanded', m.results.length ? 'true' : 'false'); if (m.active >= 0) q.setAttribute('aria-activedescendant', 'hb-a-o' + m.active); else q.removeAttribute('aria-activedescendant'); }
    if (list) list.innerHTML = kbb.resultsHtml(m.results, m.active, m.year);
    const pk = dq('hb-a-pick'); if (pk) pk.textContent = m.pickText || '';
    const nt = dq('hb-a-note'); if (nt) nt.textContent = m.note || '';
    Array.prototype.forEach.call(d.el.querySelectorAll('input[name="hb-a-tag"]'), function (i) { i.checked = i.value === m.tag; });
    const cnt = dq('hb-a-cnt'); if (cnt) cnt.textContent = String(m.memo || '').length + '/' + kbb.MEMO_MAX;
    const go = dq('hb-a-go'); if (go) { go.disabled = !s.canGo; go.textContent = m.busy ? '저장 중…' : '목표에 넣기'; }
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
    m.results = kbb.searchInst(LIST, m.q, { limit: 8, taken: takenFor(m.year), sumById: gs.sum, lofin: root.LOFIN_2026, direct: gs.direct, today: U.todayDate() });
    m.active = -1;
    for (let i = 0; i < m.results.length; i += 1) { if (!m.results[i].taken) { m.active = i; break; } }
  }
  function openAdd(pre) {
    if (dlg || !ALL || !canEditNow()) return;   // canEditNow = 목록을 받았고 서버가 can_edit을 준 계정만(qa 11-17 심층 방어)
    closeMenu(false);
    const years = yearList();
    const m = { q: '', inst: null, year: years.indexOf(goalYear()) >= 0 ? goalYear() : years[0], tag: '', tagTouched: false, memo: '', results: [], active: -1, busy: false, note: '', pickText: '' };
    if (pre && pre.id && BYID[pre.id]) pickInst(m, BYID[pre.id], pre.tag || '');
    const d = showDlg(kbb.addDialogHtml(m, { years: years, tags: tagList() }), 'add', document.activeElement);
    d.m = m;
    paintAdd();
    const ov = d.el;
    ov.addEventListener('input', function (ev) {
      const t = ev.target;
      if (t.id === 'hb-a-q') {
        m.q = t.value;
        if (m.inst && t.value !== m.inst.name) { m.inst = null; m.pickText = ''; if (!m.tagTouched) { m.tag = ''; m.note = ''; } }
        searchAdd(m);
        setDlgErr('hb-a-err', '');
      } else if (t.id === 'hb-a-memo') m.memo = t.value;
      paintAdd();
    });
    ov.addEventListener('change', function (ev) {
      const t = ev.target;
      if (t.id === 'hb-a-year') { m.year = Number(t.value); if (!m.inst) searchAdd(m); }
      else if (t.name === 'hb-a-tag') { m.tag = t.value; m.tagTouched = true; }
      paintAdd();
    });
    ov.addEventListener('keydown', function (ev) {
      if (ev.target.id !== 'hb-a-q' || !m.results.length) return;
      const n = m.results.length;
      const step = function (dir) { let i = m.active; for (let k = 0; k < n; k += 1) { i = (i + dir + n) % n; if (!m.results[i].taken) { m.active = i; return; } } };
      if (ev.key === 'ArrowDown') { ev.preventDefault(); step(1); paintAdd(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); step(-1); paintAdd(); }
      else if (ev.key === 'Enter' && m.active >= 0) { ev.preventDefault(); pickInst(m, m.results[m.active].rec, ''); paintAdd(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); m.results = []; m.active = -1; paintAdd(); }
    });
    ov.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const li = t.closest('li[role="option"]');
      if (li) {
        const x = m.results[Number(li.getAttribute('data-i'))];
        if (x && !x.taken) { pickInst(m, x.rec, ''); paintAdd(); const nx = dq('hb-a-year'); if (nx) nx.focus(); }
        return;
      }
      const b = t.closest('button');
      if (!b) return;
      if (b.id === 'hb-a-cancel') { if (!m.busy) closeDlg(); }
      else if (b.id === 'hb-a-go') submitAdd(d);
    });
    const q0 = dq(m.inst ? 'hb-a-go' : 'hb-a-q');
    if (q0 && q0.focus) q0.focus();
  }
  function submitAdd(d) {
    const m = d.m;
    if (dlg !== d || !kbb.addState(m).canGo) return;
    m.busy = true;
    paintAdd();
    holdDlgFocus(d, 'hb-a-go');
    setDlgErr('hb-a-err', '');
    const body = { target_year: m.year, tag_cd: m.tag, memo: String(m.memo || '').trim() || null };
    kbb.saveTarget(m.inst.id, body, kbb.BTN.add).then(function (x) {
      if (dlg !== d || !host) return;
      m.busy = false;
      const o = kbb.outcome(x, 'add', { year: m.year });
      if (o.kind === 'saved' || o.kind === 'nochange') {
        closeDlg('none');
        gs.focusNext = { inst: m.inst.id };
        if (m.year !== goalYear()) gs.year = m.year;   // 다른 해에 넣었으면 그 해 표로 옮겨 새 줄을 보인다
        say(kbb.flashAdded(m.inst.name, m.year), false);
        loadGoals();
        return;
      }
      setDlgErr('hb-a-err', o.msg);
      paintAdd();
      releaseDlgFocus(d);
      if (o.kind === 'dup' || o.kind === 'stale') loadGoals();
    });
  }

  // ── [목표에서 빼기] 대화창(규격 6-E ③) ─────────────────────────────────
  function paintCancel() {
    const d = dlg;
    if (!d || d.kind !== 'cancel') return;
    const m = d.m, s = kbb.cancelState(m);
    const row = dq('hb-c-etcrow'); if (row) row.hidden = m.reason !== 'ETC';
    const cnt = dq('hb-c-cnt'); if (cnt) cnt.textContent = String(m.etc || '').length + '/' + kbb.ETC_MAX;
    const go = dq('hb-c-go'); if (go) { go.disabled = !s.canGo; go.textContent = m.busy ? '저장 중…' : '목표에서 빼기'; }
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
        const list = gs.rows.filter(function (z) { return !z.out; }), i = list.indexOf(r), nx = i >= 0 ? list[i + 1] || null : null;
        closeDlg('none');
        gs.focusNext = { inst: nx ? nx.id : '' };   // 다음 줄 이름(없으면 [목표 기관 추가])
        say(kbb.flashCancelled(r.name, r.targetYear), false);
        loadGoals();
        return;
      }
      setDlgErr('hb-c-err', o.msg);
      paintCancel();
      releaseDlgFocus(d);
      if (o.kind === 'stale') loadGoals();
    });
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const btn = t.closest('button');
    if (!btn || !host.contains(btn)) return;
    if (btn.classList.contains('hb-tag')) {
      const act = btn.getAttribute('data-act');
      if (act === 'tag') { if (menu && menu.btn === btn) closeMenu(true); else openMenu(btn); }
      else if (act === 'add') openAdd({ id: btn.getAttribute('data-inst') || '', tag: '' });
      else if (act === 'cand') openAdd({ id: btn.getAttribute('data-inst') || '', tag: '' });
      return;
    }
    if (btn.classList.contains('hb-nm') || btn.classList.contains('hb-row')) { openOurs(btn); return; }
    if (btn.classList.contains('hb-confirm')) { openOurs(btn, 'confirm'); return; }
    switch (btn.id) {
      case 'hb-add': openAdd(null); break;
      case 'hb-gretry': gs.retryFocus = 'hb-gretry'; loadGoals(); break;      // 다시 그린 뒤 포커스를 되돌린다(applyRetryFocus)
      case 'hb-pretry': gs.retryFocus = 'hb-pretry'; loadProgress(); break;   // 제안 진행 자료 오류 안내의 [다시 시도]
      case 'hb-to-notice': openNotice(''); break;
      case 'hb-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  // 위→아래(design 11-17 acfdd5da 6-C): 제목 줄 → 알림·오류 → 요약 띠 → 목표 표(#hb-goals) → 접힌 협약 구획(#hb-ours). 표·띠 안쪽은 renderGoals가 채운다.
  const WAIT = '<p class="db-state" aria-busy="true">불러오는 중입니다…</p>';
  const SKELETON =
    '<section id="hb-root" aria-label="입찰 현황판">' +
    '<div class="hb-top"><h2>입찰 현황판</h2><select id="hb-year" aria-label="목표 연도"></select>' +
    '<span class="ro" id="hb-ro" hidden>' + esc(kbb.GOAL_MSG.roTop) + '</span>' +
    '<span class="meta">기준일 <b id="hb-asof"></b></span><button type="button" id="hb-add" hidden>목표 기관 추가</button></div>' +
    '<div id="hb-flash" class="db-flash" role="status"></div><div id="hb-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="hb-band" id="hb-band" role="group" aria-label="목표 요약" aria-busy="true"></div>' +
    '<div class="hb-tp" id="hb-goals" tabindex="-1" aria-busy="true"><div class="hb-ts" id="hb-ts"></div><div class="hb-tf" id="hb-tf"></div></div>' +
    '<details id="hb-ours" tabindex="-1" aria-busy="true"><summary><span class="ot" id="hb-ot">협약 중인 기관</span><span id="hb-osm"></span><span class="op" id="hb-op">펼치기</span></summary>' +
    '<div class="hb-sum"><p class="hb-fig" id="hb-ofig"></p><p class="hb-brk" id="hb-osum"></p><div class="hb-waf" id="hb-waf"></div></div>' +
    '<div class="db-scroll" id="hb-oscroll">' + WAIT + '</div><div class="hb-foot" id="hb-ofoot"></div></details>' +
    '</section>';

  function onChange(e) {
    const t = e.target;
    if (t && t.id === 'hb-year') { const y = Number(t.value); if (y) { gs.year = y; gs.optSig = ''; loadGoals(); } }
  }
  function onToggle(e) {
    if (e.target && e.target.id === 'hb-ours') { const op = $('hb-op'); if (op) op.textContent = e.target.open ? '접기' : '펼치기'; }
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
    host.addEventListener('toggle', onToggle, ac ? { capture: true, signal: ac.signal } : true);
    st.err = '';
    gs.st = (!U.serverMode() || !U.hasEmp()) ? 'offline' : 'loading';
    if (gs.st === 'offline') { const ob = $('hb-ours'); if (ob) { ob.open = true; const op = $('hb-op'); if (op) op.textContent = '접기'; } }   // 서버가 없으면 목표 기관은 못 보이고 협약 구획은 내장 자료라 펼친 채로 둔다
    refreshData();
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
    gs.st = 'offline'; gs.data = null; gs.sumSt = 'idle'; gs.sum = {}; gs.direct = {}; gs.rows = []; gs.focusNext = null; gs.retryFocus = '';
    prepDenied403 = false;   // 다른 계정은 제안 진행을 볼 수 있을 수 있다 — 403 기억을 푼다
    closeMenu(false); closeDlg('none');
    if (host && ALL) { renderAll(); loadProgress(); loadGoals(); }
  };
  kbb.unmount = function () {
    seq += 1; gs.seq += 1;
    closeMenu(false); closeDlg('none');
    if (offNr) { offNr(); offNr = null; }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; ALL = null; G = null; gs.rows = []; gs.data = null; gs.st = 'offline'; gs.retryFocus = '';
  };

  if (isNode) module.exports = kbb;
  else root.kbboard = kbb;
})(typeof self !== 'undefined' ? self : this);
