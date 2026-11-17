(function (root) {
  'use strict';
  // 입찰 현황판(2026-11-16 역할 재정의, 사용자 확정; 11-17 세 주제로 재구성) — 국민은행 상태 화면.
  // 구성(3열): 협약 중인 기관(협약 종료일 순, 와플 머리) | 입찰 공고가 뜬 대상(협약 중인 기관의 공고 + 제안 확정·준비 중 기관, 머리에 전국 공고 링크) | 제안 진행 단계(단계 막대 머리 + 기관별 목록).
  // 규격: handoff/agents/design-reviewer/2026-11-17_1322_ab488e4e.md 6-A·6-B(이전 11-16 6-A~6-D는 대체됨). 접두어 hb-. 화면 글에 1인칭 '우리'를 쓰지 않는다(낙찰 은행 '우리은행'과 헷갈림). 회차 소식 줄의 출처 문장 속 은행 이름은 그대로 둔다.
  // 협약 종료일 원천(실제 동작): 지자체 = 행안부 금고지정 현황(LOFIN_2026)의 국민은행 줄 end(없으면 일반회계 줄) / 법원·공공기관 = 레코드 contractExpiry, 없으면 '종료일 미상'.
  // 직접 입력 금고 약정(contractEnd의 o.direct)은 아직 현황판이 받아 오지 않는다(endOpts가 direct:null) — 받아 오면 그때 각주에 그 절을 되살린다(design 11-17 P2-2).
  // 새 판정은 만들지 않고 dashboard.js의 함수(model·kbEntry·isOurs·stageCounts·itemForRec …)를 조합한다.
  // 순수 부분은 node 테스트 대상이고, DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다.
  // 순수 함수는 검증 자료(verified)와 2027년부터 자료(nextList)를 인자로 받는다(전역 root.KB_NEXT에 기대지 않는다). DOM 부분만 전역을 읽는다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = isNode ? require('./dashboard.js') : root.dashboard;
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
    // 협약 종료일 문장(design 11-17 P2-2): 현황판이 실제로 쓰는 원천만 말한다 — 직접 입력 금고 약정은 아직 받지 않는다.
    const muniEnd = '지자체는 행안부 금고지정 현황의 약정 끝날', pubEnd = '법원·공공기관은 기관 자료의 약정 만료일이며 없으면 \'종료일 미상\'';
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

  // ── 순수: 입찰 공고가 뜬 대상(2번 구획, 사용자 11-17) ───────────────────
  // allNotice = 전국 공고 진행 중 항목(dash.model.notice — 마감 전 → 마감일 미확인 → 결과 확인 순서 그대로).
  // 협약 중인 기관(keep) = 지금 맡은 곳(keepKeys: instKey 집합, 협약 예정은 뺀다)의 공고. 신규 유치(win) = 협약 기관이 아니면서 제안 확정·준비 중인 기관(prepIds: institutionId 집합)의 공고.
  // 그 밖의 공고는 이 구획에 없고 [입찰 공고 현황에서 보기] 링크 하나로 넘긴다. winState = 제안 진행 자료 상태('ok'|'offline'|'loading'|'denied'|'error') — 'ok'가 아니면 신규 유치는 알 수 없다.
  kbb.noticeModel = function (allNotice, keepKeys, prepIds, winState) {
    const all = allNotice || [], keep = [], win = [], ok = !winState || winState === 'ok';
    all.forEach(function (it) {
      if (keepKeys && keepKeys[it.key]) keep.push(it);
      else if (ok && prepIds && it.rec && it.rec.institutionId && prepIds[String(it.rec.institutionId)]) win.push(it);
    });
    return { n: all.length, keep: keep, win: win, total: keep.length + win.length, recvN: keep.concat(win).filter(function (it) { return it.phase === 'receiving'; }).length,
      winState: ok ? 'ok' : winState };
  };
  kbb.noticeFigHtml = function (nm) {
    return '<span><b>' + nm.total + '</b>곳</span><span>접수 마감 전 <b>' + nm.recvN + '</b>곳</span>';
  };
  kbb.noticeBrkHtml = function (nm) {
    return '협약 중인 기관 <b>' + nm.keep.length + '</b> · 신규 유치 <b>' + (nm.winState === 'ok' ? nm.win.length : '-') + '</b>';
  };
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
  // 2번 구획 줄: [행 버튼 | 동작 칸]을 형제로 둔다(버튼 안에 버튼을 넣지 않는다). o = { verified, nextList, act, badge }
  kbb.noticeRowHtml = function (it, o) {
    o = o || {};
    const slot = kbb.slotText(it.rec, o.verified, o.nextList), nt = dash.recTagHtml(dash.recView(it));
    return '<li class="hb-li"><button type="button" class="hb-row" data-key="' + esc(it.key) + '" aria-haspopup="dialog">' +
      '<span class="nm">' + esc(it.name) + (slot ? '<span class="hb-slot">' + esc(slot) + '</span>' : '') + '</span>' +
      '<span class="meta">' + esc(dash.regionName(it.region)) + ' · ' + dash.noticeNote(it) + '</span>' + (nt ? '<span class="meta">' + nt + '</span>' : '') + '</button>' +
      '<div class="hb-act">' + dash.noticeChipHtml(it) + kbb.actHtml(o.act, { name: it.name, key: it.key, badge: o.badge }) + '</div></li>';
  };
  kbb.NOTICE_MSG = {
    both: '지금 공고가 난 협약 중인 기관이나 제안 중인 기관이 없습니다. 그 밖의 공고는 위 [입찰 공고 현황에서 보기]에서 봅니다.',
    keepNone: '공고가 난 협약 중인 기관이 없습니다.',
    winNone: '공고가 난 제안 진행 기관이 없습니다.',
    offline: '서버에 연결하면 제안 중인 기관의 공고도 보입니다.',
    loading: '불러오는 중입니다…',
    denied: '제안 중인 기관의 공고는 영업팀·영업팀장·영업부장에게 보입니다.',
    error: '제안 중인 기관을 불러오지 못했습니다. 제안 진행 단계 구획의 [다시 시도]를 누르세요.' };
  // rowOf(it) = 줄 마크업(DOM이 동작 판정을 넣어 만든다).
  kbb.noticeBodyHtml = function (nm, rowOf) {
    const M = kbb.NOTICE_MSG, up = nm.winState === 'ok';
    if (up && !nm.keep.length && !nm.win.length) return '<p class="db-state">' + esc(M.both) + '</p>';
    const ul = function (items, id) { return '<ul aria-labelledby="' + id + '">' + items.map(rowOf).join('') + '</ul>'; };
    let h = '<div class="db-grp" id="hb-g-keep">협약 중인 기관 <b>' + nm.keep.length + '</b>곳</div>' + (nm.keep.length ? ul(nm.keep, 'hb-g-keep') : '<p class="hb-none">' + esc(M.keepNone) + '</p>');
    h += '<div class="db-grp" id="hb-g-win">신규 유치 · 제안 확정·준비 중' + (up ? ' <b>' + nm.win.length + '</b>곳' : '') + '</div>';
    if (!up) return h + '<p class="hb-none">' + esc(M[nm.winState] || M.error) + '</p>';
    return h + (nm.win.length ? ul(nm.win, 'hb-g-win') : '<p class="hb-none">' + esc(M.winNone) + '</p>');
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
  kbb.prepRowHtml = function (r) {
    const dis = !r.canView;
    const label = r.name + ', ' + r.badge.text + ', ' + (r.bidText ? r.bidText + ', ' : '') + (dis ? '열람 권한이 없습니다' : '사전준비 화면 열기');
    const parts = dis ? ['열람 권한이 없는 건입니다'] : [esc(r.assigneeText),   // 서버 원문이라 이스케이프(pips·숫자 마크업은 그대로)
      r.total ? P().pipsHtml(r.done, r.total) + ' <span class="d">' + r.done + '/' + r.total + '</span>' : '', r.bidText].filter(Boolean);
    return '<li><button type="button" class="hb-row hb-prep" data-bid="' + esc(r.id) + '" data-inst="' + esc(r.institutionId) + '"' +
      (dis ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(label) + '"><span class="nm">' + esc(r.name) + '</span>' +
      '<span class="wf-badge ' + esc(r.badge.cls) + '">' + esc(r.badge.text) + '</span><span class="meta">' + parts.join(' · ') + '</span></button></li>';
  };
  // p = { state:'offline'|'loading'|'ok'|'denied'|'error', code }
  kbb.prepBodyHtml = function (p, rows) {
    if (p.state === 'offline') return '<p class="db-state">서버에 연결하면 보입니다.</p>';
    if (p.state === 'loading') return '<p class="db-state" aria-busy="true">불러오는 중입니다…</p>';
    if (p.state === 'denied') return '<p class="db-state">' + (p.code === 401 ? '로그인이 필요합니다. 다시 로그인하세요.' : '기관별 제안 진행은 영업팀·영업팀장·영업부장에게 보입니다.') + '</p>';
    if (p.state === 'error') return '<p class="db-state">기관별 제안 진행을 불러오지 못했습니다. <button type="button" id="hb-retry">다시 시도</button></p>';
    if (!rows.length) return '<p class="db-state">아직 제안 확정한 기관이 없습니다. 공고가 난 기관에서 [제안 확정]을 누르면 여기에 나옵니다.<br><button type="button" id="hb-open-notice">입찰 공고 현황 열기</button></p>';
    return '<div class="db-grp" id="hb-g-p">기관별 <b>' + rows.length + '</b>건 · 입찰 가까운 순</div><ul aria-labelledby="hb-g-p">' + rows.map(kbb.prepRowHtml).join('') + '</ul>';
  };

  // ── DOM ───────────────────────────────────────────────────────────
  const st = { preps: null, overview: null, prepSt: 'offline', ovSt: 'offline', prepCode: 0, ovCode: 0, err: '' };
  let host = null, ac = null, LIST = [], ALL = null, OURS = [], G = null, NM = null, seq = 0, offNr = null;
  const U = dash.util;
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function KB() { return root.KB_VERIFIED; }
  function NX() { return root.KB_NEXT; }
  function endOpts() { return { lofin: root.LOFIN_2026, direct: null }; }   // 직접 입력 금고 약정은 기관별 서버 응답이라 현황판이 받아 오지 않는다 — 받아 오면 direct에 { 'region|name': 'YYYY-MM-DD' }
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
    const box = $('hb-ours');
    if (box) box.setAttribute('aria-busy', 'false');
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
  // 2번 구획: 입찰 공고가 뜬 대상
  function renderNotice() {
    const sc = $('hb-nscroll');
    if (!sc || !ALL) return;
    const keepKey = keepFocus(sc);
    const keepKeys = {};
    OURS.forEach(function (r) { if (dash.oursKind(r, KB(), NX()) !== 'next') keepKeys[logic.instKey(r)] = true; });
    const ps = panelState();
    const ids = {};
    if (ps.state === 'ok') kbb.prepEntries(st.preps, st.overview).forEach(function (e) { ids[e.id] = true; });
    NM = kbb.noticeModel(ALL.notice, keepKeys, ids, ps.state);
    sc.innerHTML = kbb.noticeBodyHtml(NM, function (it) {
      return kbb.noticeRowHtml(it, { verified: KB(), nextList: NX(), act: actOf(it.rec), badge: badgeOf(it.rec) });
    });
    restoreFocus(sc, keepKey);
    const fig = $('hb-nfig'); if (fig) fig.innerHTML = kbb.noticeFigHtml(NM);
    const brk = $('hb-nbrk'); if (brk) brk.innerHTML = kbb.noticeBrkHtml(NM);
    const lk = $('hb-nlink'); if (lk) lk.innerHTML = kbb.noticeLinkHtml(NM);
    const box = $('hb-notice');
    if (box) box.setAttribute('aria-busy', ps.state === 'loading' ? 'true' : 'false');
  }

  // 3번 구획: 제안 진행 단계 — 머리 막대(dash.stageParts) + 기관별 목록
  function renderStage() {
    const r = dash.stageParts(progressState());
    const head = $('hb-ph'), body = $('hb-pstage');
    if (head) head.innerHTML = '<h2 id="db-t2">제안 진행 단계</h2>' + r.total;
    if (body) body.innerHTML = r.body;
  }
  function renderPreps() {
    const body = $('hb-pscroll');
    if (!body) return;
    const keepKey = keepFocus(body);
    const ps = panelState();
    const rows = ps.state === 'ok' ? kbb.prepRows(st.preps, st.overview, LIST, U.todayDate()) : [];
    body.innerHTML = kbb.prepBodyHtml(ps, rows);
    restoreFocus(body, keepKey);
    const b = $('hb-to-prep');
    if (b) b.hidden = ps.state !== 'ok';
    const pf = $('hb-pfoot');
    if (pf) pf.hidden = ps.state !== 'ok';   // 버튼이 숨으면 빈 테두리 줄도 없앤다
    const box = $('hb-preps');
    if (box) box.setAttribute('aria-busy', ps.state === 'loading' ? 'true' : 'false');
  }

  function renderAll() {
    const asof = $('hb-asof');
    if (asof) asof.textContent = logic.localDateStr(U.todayDate());
    renderBanner(); renderOurs(); renderNotice(); renderStage(); renderPreps();
  }

  function refreshData() {
    LIST = U.dataList();
    ALL = dash.model(LIST, U.todayDate());
    OURS = kbb.ours(LIST, KB(), undefined, NX());
    renderAll();
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  function loadProgress() {
    if (!U.serverMode() || !U.hasEmp()) { st.prepSt = st.ovSt = 'offline'; st.preps = st.overview = null; renderPreps(); renderStage(); renderOurs(); renderNotice(); return Promise.resolve(); }
    const my = ++seq;
    st.prepSt = st.ovSt = 'loading';
    renderPreps(); renderStage(); renderNotice();
    return Promise.all([fetchJson('/preps'), fetchJson('/workflow/overview')]).then(function (res) {
      if (my !== seq || !host) return;
      const p = res[0], o = res[1];
      st.prepSt = p.status; st.prepCode = p.code || 0; st.preps = p.status === 'ok' ? (Array.isArray(p.data) ? p.data : (p.data && p.data.items) || []) : null;
      st.ovSt = o.status; st.ovCode = o.code || 0; st.overview = o.status === 'ok' ? o.data : null;
      renderPreps(); renderStage(); renderOurs(); renderNotice();
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
  function goPrep(bid) {
    const Pp = root.prep, A = root.app;
    if (!Pp || !A || !A.openNavItem || !Pp.SOON_ID) return false;
    const ok = A.openNavItem(Pp.SOON_ID);
    if (ok && bid && Pp.openCase) Pp.openCase(bid);
    return ok;
  }
  // 행·[제안 확정] 버튼 모두 상세 팝업을 연다(목록에서 바로 저장하지 않는다). focus = 'confirm'이면 팝업의 [제안 확정]으로 포커스를 옮긴다.
  function openOurs(btn, focus) {
    const key = btn.getAttribute('data-key');
    const pool = (G ? G.soon.concat(G.later, G.unk, G.next) : []).concat(NM ? NM.keep.concat(NM.win) : []);
    const it = pool.filter(function (x) { return x.key === key; })[0];
    if (!it) return;
    // 닫은 뒤 포커스(qa 11-17 P2-1): 열마다 맞는 fallback, opener가 사라졌으면 같은 열에서 같은 data-key(+data-act) 요소를 다시 찾는다.
    const colEl = btn.closest ? btn.closest('.hb-col') : null, colId = colEl && colEl.id ? colEl.id : 'hb-ours', act = btn.getAttribute('data-act') || '';
    dash.openDetail(it.rec, { opener: btn, screen: 'bid_board', fallback: '#' + colId, focus: focus || '',
      refocus: function () { return kbb.findOpener($(colId), key, act); } });
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const btn = t.closest('button');
    if (!btn || !host.contains(btn)) return;
    if (btn.classList.contains('hb-prep')) {
      if (btn.getAttribute('aria-disabled') === 'true') { flash('열람 권한이 없는 건입니다.'); return; }
      flash('');
      if (!goPrep(btn.getAttribute('data-bid'))) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.');
      return;
    }
    if (btn.classList.contains('hb-confirm')) { openOurs(btn, 'confirm'); return; }
    if (btn.classList.contains('hb-row')) { openOurs(btn); return; }
    switch (btn.id) {
      case 'hb-to-notice': case 'hb-open-notice': openNotice(''); break;
      case 'hb-to-prep': if (!goPrep('')) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.'); break;
      case 'hb-retry': case 'db-retry': loadProgress(); break;   // db-retry = 단계 카드(dash.stageCardHtml)의 다시 시도
      case 'hb-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  // 세 구획 3열(design 11-17 6-B): 각 열 머리(.hb-sum)가 요약 카드, 아래가 목록. 기간 버튼·알림 줄·요약 카드 줄은 없다.
  const WAIT = '<p class="db-state" aria-busy="true">불러오는 중입니다…</p>';
  const SKELETON =
    '<section id="hb-root" aria-label="입찰 현황판">' +
    '<div class="hb-top"><h2>입찰 현황판</h2><span class="sub">협약 중인 기관 · 입찰 공고 · 제안 진행</span><span class="meta">기준일 <b id="hb-asof"></b></span></div>' +
    '<div id="hb-flash" class="db-flash" role="status"></div><div id="hb-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="hb-cols">' +
    '<section class="pnl hb-col" id="hb-ours" tabindex="-1" aria-labelledby="hb-ot" aria-busy="true"><div class="hb-sum"><div class="db-h"><h2 id="hb-ot">협약 중인 기관</h2></div>' +
    '<p class="hb-fig" id="hb-ofig"></p><p class="hb-brk" id="hb-osum"></p><div class="hb-waf" id="hb-waf"></div></div>' +
    '<div class="db-scroll" id="hb-oscroll">' + WAIT + '</div><div class="hb-foot" id="hb-ofoot"></div></section>' +
    '<section class="pnl hb-col" id="hb-notice" aria-labelledby="hb-nt" aria-busy="true"><div class="hb-sum"><div class="db-h"><h2 id="hb-nt">입찰 공고가 뜬 대상</h2></div>' +
    '<p class="hb-fig" id="hb-nfig"></p><p class="hb-brk" id="hb-nbrk"></p><div class="hb-nlink" id="hb-nlink"></div></div>' +
    '<div class="db-scroll" id="hb-nscroll">' + WAIT + '</div></section>' +
    '<section class="pnl hb-col" id="hb-preps" aria-labelledby="db-t2" aria-busy="true"><div class="hb-sum"><div class="db-h" id="hb-ph"><h2 id="db-t2">제안 진행 단계</h2></div>' +
    '<div id="hb-pstage"></div></div>' +
    '<div class="db-scroll" id="hb-pscroll">' + WAIT + '</div>' +
    '<div class="hb-foot" id="hb-pfoot" hidden><button type="button" id="hb-to-prep" hidden>사전준비 화면 열기</button></div></section>' +
    '</div></section>';

  kbb.mount = function (el) {
    if (!el) return;
    if (host) kbb.unmount();
    host = el;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    st.err = '';
    refreshData();
    loadProgress();
    const nrm = root.noticerec;   // 현황판이 기록 변화에 맞춰 다시 그려지게 구독한다
    if (nrm && nrm.onChange) offNr = nrm.onChange(function () { if (host && ALL) { renderOurs(); renderNotice(); } });
    if (nrm && nrm.ensure) nrm.ensure();
  };
  kbb.refresh = function () { if (host && ALL) refreshData(); };       // 기관 편집 저장 뒤 서버 목록이 바뀌면
  kbb.reload = function () { if (host) loadProgress(); };              // 상세 팝업에서 [제안 확정] 뒤
  kbb.onProfileChange = function () {                                  // 계정이 바뀌면 앞 사용자의 준비 중 제안을 버린다
    seq += 1;
    st.preps = st.overview = null; st.prepSt = st.ovSt = 'offline';
    if (host && ALL) { renderAll(); loadProgress(); }
  };
  kbb.unmount = function () {
    seq += 1;
    if (offNr) { offNr(); offNr = null; }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; ALL = null; G = null; NM = null;
  };

  if (isNode) module.exports = kbb;
  else root.kbboard = kbb;
})(typeof self !== 'undefined' ? self : this);
