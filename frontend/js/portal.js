(function (root) {
  'use strict';
  // 로그인 뒤 시작화면(포털) — NEXT 97 3단계, 사용자 확정 11-19. 규격: handoff/agents/history/2026-11-19_97-3_첫화면_포털_규격.md.
  // 구성(위→아래): 제목 줄 → 띠 4칸(이번 달 접수 마감·국민은행 금고 협약 종료 1년 안·내 결재·다른 은행 금고 협약 종료 1년 안, 누르면 표를 거름)
  //   → 왼쪽 '기관별 입찰 일정' 표(기관 유형 탭) + 오른쪽 340px 패널 둘(날짜별 일정 30일 / 결재·확인 대기).
  // 새 판정은 만들지 않는다: 마감·예정은 dash.model, 협약 종료일은 kbboard.contractEnd(039 직접 입력 > 행안부 lofin > 기관 자료 contractExpiry),
  //   경과는 logic.splitOverdue, 상세는 dash.openDetail. kbboard.js는 읽기만 한다(normDate·contractEnd·closedBasis).
  // 규칙을 바꿀 곳: 숫자·기간 = P.CFG, 국민은행/다른 은행 가름 = P.groupOf, 다음 금고 은행 태그 = P.decided, 문구 = P.T·P.STAGE·P.TAG_TEXT.
  // 서버 글·기관 이름은 전부 esc(). 확인 대화상자(confirm) 쓰지 않음. 화면 글에 1인칭을 쓰지 않는다(낙찰 은행 이름과 헷갈림).
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = isNode ? require('./dashboard.js') : root.dashboard;
  const esc = logic.esc;
  const P = {};
  function KB() { return isNode ? require('./kbboard.js') : root.kbboard; }
  function NRM() { return isNode ? require('./noticerec.js') : root.noticerec; }

  P.SCREEN = 'bid_notice';   // 상세 팝업 [제안 확정]의 감사 화면 이름 — 서버 허용 목록(bid_board·bid_notice·map_popover)에 규격의 home_portal이 아직 없어 가장 가까운 값을 쓴다(백엔드가 허용하면 이 한 줄만 교체)
  P.CFG = {
    SCHEDULE_DAYS: 30,            // 오른쪽 일정 패널 기간
    KPI_HOT_DAYS: 7,              // 띠 ①의 남은 날 강조 경계
    ROW_HOT_DAYS: 30,             // 표 '남은 날' 강조 경계
    END_DAYS: 365,                // '협약 종료 1년 안'
    ROW_MAX: 200,                 // 표에 그리는 최대 줄(넘으면 안내 한 줄)
    OTHER_INCLUDE_NONMUNI: true   // 다른 은행 칸에 법원·공공기관(기관 자료의 은행 칸)도 셀지 — 기획 확인 필요
  };
  P.APPROVALS_ROLES = ['영업팀장', '영업부장'];   // /approvals(작업물·최종결재)는 이 역할만 부른다(서버가 그 밖에는 빈 목록)
  P.MODES = ['all', 'month', 'kb', 'other'];   // 띠 칸이 거르는 한 가지(규격: 한 번에 하나, 라디오처럼)
  P.MODE_LABEL = function (m, month) {
    return m === 'month' ? month + '월 접수 마감' : (m === 'kb' ? '국민은행 금고 협약 종료 1년 안' : (m === 'other' ? '다른 은행 금고 협약 종료 1년 안' : '전체'));
  };
  P.STAGE = { notice: ['공고 중', 'on'], plan: ['공고 예정', ''], est: ['추정 공고', 'est'], kb: ['협약 종료', 'end'], other: ['협약 종료', 'end'] };   // [글, .pt-chip 수식]
  P.TAG_TEXT = { kept: '재유치 확정', next: '차기 확정', won: '신규 확정', ended: '입찰 끝남' };
  P.T = {
    kpiDeadline: function (m) { return m + '월 접수 마감'; },
    kpiKb: '국민은행 금고 협약 종료 1년 안', kpiAppr: '내 결재', kpiOther: '다른 은행 금고 협약 종료 1년 안',
    otherTitle: '데려올 기회: 다른 은행이 금고인 기관 중 1년 안에 협약이 끝나는 곳',
    sub: {
      busy: '불러오는 중', failed: '불러오지 못함', offline: '로그인과 서버 연결이 필요합니다',
      dlOnly: '공고로 확정된 마감만', dlEst: function (n) { return '확정 공고만, 추정 ' + n + '곳 별도'; },
      dlNear: function (d) { return '가장 가까운 D-' + d; }, dlNone: function (m) { return m + '월에 확정된 접수 마감 없음'; },
      kbNone: '1년 안에 끝나는 국민은행 협약 없음', kbFirst: function (d) { return '가장 빠른 종료 ' + d; },
      otherNone: '1년 안에 끝나는 다른 은행 협약 없음', otherTop: function (b, n) { return b + ' ' + n + '곳 가장 많음'; },
      noBank: '등록된 금고 약정 없음', deniedInst: '기관 정보 열람 권한 없음', deniedAppr: '결재함 권한 없음', deniedAssign: '배정 목록 권한 없음',
      apprDecide: '처리할 결재', apprMine: '올려서 대기 중', apprDecideNone: '처리할 결재 없음', apprMineNone: '대기 중인 상신 없음',
      partial: ' · 일부는 받지 못함' },
    errSrc: { bank: '금고 약정을', approvals: '결재 목록을', assign: '배정 목록을', notice: '공고 경과 판정 기록을' },
    errMsg: function (s) { return s + ' 불러오지 못했습니다. 서버 연결을 확인한 뒤 다시 불러오세요.'; },
    retry: '다시 불러오기', unfilter: '거르기 풀기',
    emptyAll: '1년 안에 다가오는 입찰이 없습니다.',
    emptyAllNote: '공고 예정일이나 협약 종료일이 확인된 기관만 이 표에 나옵니다. 전체 기관은 [전국 지도]에서 봅니다.',
    emptyOrg: '이 유형에는 해당하는 기관이 없습니다.',
    emptyMode: function (m, month) { return m === 'month' ? month + '월에 접수 마감인 기관이 없습니다.' : (m === 'kb' ? '1년 안에 협약이 끝나는 국민은행 금고 기관이 없습니다.' : '1년 안에 협약이 끝나는 다른 은행 금고 기관이 없습니다.'); },
    capNote: function (n) { return '앞의 ' + n + '곳만 보입니다. 위 탭이나 거르기로 줄여 보세요.'; },
    listFoot: '국민은행 목표 기관은 입찰 현황판에서 관리합니다.', listFootBtn: '입찰 현황판 열기',
    schedEmpty: function (d) { return d + '일 안에 공고나 접수 마감 일정이 없습니다.'; }, schedFootBtn: '입찰 공고 현황 열기',
    waitAllEmpty: '기다리는 결재나 확인할 일이 없습니다.', none: '없음',
    grp: { appr: '처리할 결재', mine: '올려서 대기 중', judge: '공고 경과 판정', assign: '나에게 배정된 일' },
    noApprovals: '결재함을 열 수 없습니다. 왼쪽 메뉴의 [결재함]에서 여세요.',
    noNotice: '입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.',
    noDash: '입찰 현황판을 열 수 없습니다. 왼쪽 메뉴에서 여세요.', noTasks: '작업함을 열 수 없습니다. 왼쪽 메뉴의 [작업함]에서 여세요.',
    noRec: '기관 정보를 찾지 못했습니다. 시작화면을 다시 열어 주세요.'
  };
  P.URLS = { bank: '/bank-contracts/summary', perms: '/approval-requests/my-perms', inbox: '/approval-requests?box=inbox',
    mine: '/approval-requests?box=mine', assign: '/me/assignments', appr: '/approvals' };
  P.sourcesFor = function (role) {
    const a = ['bank', 'perms', 'inbox', 'mine', 'assign'];
    if (P.APPROVALS_ROLES.indexOf(role) >= 0) a.push('appr');
    return a;
  };

  // ── 순수: 공통 ─────────────────────────────────────────────────────
  function isKb(b) { return /국민/.test(String(b == null ? '' : b)); }
  function nameCmp(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); }
  function dText(n) { return n === 0 ? 'D-day' : (n > 0 ? 'D-' + n : 'D+' + (-n)); }
  function itemsOf(d) { return Array.isArray(d) ? d : ((d && d.items) || []); }
  function bankText(names) { return names.length ? names.slice(0, 2).join('·') + (names.length > 2 ? ' 외 ' + (names.length - 2) : '') : ''; }

  // 팀 확정(사용자 11-19): 공동 금고는 국민은행이 어느 한쪽이라도 맡으면 'kb', 아니면 'other'. 두 칸에 중복으로 세지 않는다.
  // banks = 지금 금고 은행 이름들, kbKnown = 수집 자료(KB_VERIFIED 등)가 이미 국민은행이라 한 기관. 은행을 모르면 ''.
  P.groupOf = function (banks, kbKnown) {
    if (kbKnown || (banks || []).some(isKb)) return 'kb';
    return (banks || []).length ? 'other' : '';
  };

  // 금고 줄. 039 요약(lines_now + lines_next) > 행안부(lofin) > 기관 자료 은행 칸. 시작 전 약정(start 가 오늘 뒤)은 호출 쪽이 나눈다.
  // 서버 /bank-contracts/summary의 lines_now는 지금 유효한 줄(CURRENT)만 준다(qa 11-19 P1) — 시작 전 줄은 lines_next로 받기로 하고(백엔드 이관, NEXT 97), 그전까지 039 기관의 재유치·차기 태그는 붙지 않는다.
  P.linesOf = function (rec, sum, lofin, today) {
    const K = KB();
    const arr = function (k) { return sum && Array.isArray(sum[k]) ? sum[k] : []; };
    const l039 = arr('lines_now').concat(arr('lines_next')).filter(function (l) { return l && l.bank_name; });
    if (l039.length) return l039.map(function (l) { return { bank: String(l.bank_name), end: K.normDate(l.term_to), start: K.normDate(l.term_from), src: 'direct' }; });
    const lo = dash.lofinLines(rec, lofin, today);
    if (lo.length) return lo.map(function (l) { return { bank: l.bank, end: K.normDate(l.end), start: K.normDate(l.start), src: 'lofin' }; });
    const b = String(rec.bank || '').trim();
    if (b) return [{ bank: b, end: dash.kindOfRec(rec) === '지자체' ? '' : K.normDate(rec.contractExpiry), start: '', src: 'expiry' }];
    return [];
  };

  // 다음 금고 은행 태그(사용자 11-19: 숫자에서 빼지 않고 태그만 붙여 후순위).
  //  kept 재유치 확정 = 지금 국민은행 + 시작 전 약정도 국민은행 / next 차기 확정 = 시작 전 약정이 다른 은행
  //  won 신규 확정 = 지금 다른 은행인데 다음은 국민은행(시작 전 약정 또는 KB_NEXT) / ended 입찰 끝남 = 공고 종료·입찰 없음(다음 은행은 모른다)
  P.decided = function (group, kind, fut, basis) {
    if (fut.length) {
      const k = fut.filter(function (l) { return isKb(l.bank); })[0];
      return k ? { tag: group === 'kb' ? 'kept' : 'won', next: k.bank } : { tag: 'next', next: fut[0].bank };
    }
    if (kind === 'next') return { tag: 'won', next: '국민은행' };
    if (basis && basis.cd !== 'CONTRACT_DECIDED') return { tag: 'ended', next: '' };
    return { tag: '', next: '' };
  };

  // 전 기관을 국민은행(kb)·다른 은행(other)으로 가르고 협약 종료일까지 일수를 낸다.
  // o = { today:Date, verified, next(KB_NEXT), lofin, sumById:{id→039 항목}, snap(noticerec.snap) }.
  // → { kb:[], other:[](종료 0~1년 안, 종료 가까운 순), past:[](종료일 지남 — 숫자에서 빼고 '공고 경과 판정' 대기로), noEndN, noBankN, byKey }
  P.bankBuckets = function (list, o) {
    o = o || {};
    const K = KB(), today = o.today, ts = logic.localDateStr(today), sumById = o.sumById || {};
    const out = { kb: [], other: [], past: [], noEndN: 0, noBankN: 0, byKey: {} };
    logic.dedupeByInstitution(list || []).forEach(function (rec) {
      const key = logic.instKey(rec), id = rec.institutionId ? String(rec.institutionId) : '';
      const kind = dash.oursKind(rec, o.verified, o.next);   // 'muni'|'court'|'public'|'next'(2027년부터)|''
      const sum = id && Object.prototype.hasOwnProperty.call(sumById, id) ? sumById[id] : null;
      const lines = P.linesOf(rec, sum, o.lofin, today);
      const cur = lines.filter(function (l) { return !l.start || l.start <= ts; });
      const fut = lines.filter(function (l) { return l.start && l.start > ts; });
      const banks = [];
      cur.forEach(function (l) { if (banks.indexOf(l.bank) < 0) banks.push(l.bank); });
      const group = kind === 'next' ? 'other' : P.groupOf(banks, !!kind);
      if (!group) { out.noBankN += 1; return; }
      if (group === 'other' && !P.CFG.OTHER_INCLUDE_NONMUNI && dash.kindOfRec(rec) !== '지자체') return;
      let end = '', src = '';
      if (group === 'kb') {
        // 현재 줄의 039 국민은행 종료일만 직접 값으로 넘긴다(시작 전 약정의 종료일이 섞이지 않게). 나머지 우선순위는 contractEnd 그대로.
        const direct = {}, kd = cur.filter(function (l) { return l.src === 'direct' && isKb(l.bank) && l.end; }).map(function (l) { return l.end; }).sort()[0];
        if (kd) direct[key] = kd;
        const ce = K.contractEnd(rec, { lofin: o.lofin, direct: direct, today: today });
        end = ce.date; src = ce.src;
      } else {
        const ends = cur.filter(function (l) { return !isKb(l.bank) && l.end; }).map(function (l) { return l.end; }).sort();
        end = ends.filter(function (e) { return e >= ts; })[0] || ends[ends.length - 1] || '';
        src = cur[0] ? cur[0].src : '';
      }
      const nx = P.decided(group, kind, fut, K.closedBasis(id, o.snap, today, sum));
      const endDays = end ? logic.daysUntil(end, today) : null;
      const it = { key: key, id: id, rec: rec, name: rec.name || '', region: rec.region || '', org: dash.kindOfRec(rec), group: group,
        bank: bankText(banks), end: end, endDays: endDays, src: src, tag: nx.tag, nextBank: nx.next };
      out.byKey[key] = it;
      if (endDays === null || endDays === Infinity) { out.noEndN += 1; return; }
      if (endDays < 0) { out.past.push(it); return; }
      if (endDays <= P.CFG.END_DAYS) out[group].push(it);
    });
    const byEnd = function (a, b) { return (a.endDays - b.endDays) || nameCmp(a, b); };
    out.kb.sort(byEnd); out.other.sort(byEnd); out.past.sort(byEnd);
    return out;
  };
  P.decidedNote = function (items) {
    const c = { kept: 0, next: 0, won: 0, ended: 0 };
    (items || []).forEach(function (it) { if (Object.prototype.hasOwnProperty.call(c, it.tag)) c[it.tag] += 1; });
    const parts = ['kept', 'next', 'won', 'ended'].filter(function (k) { return c[k] > 0; }).map(function (k) { return P.TAG_TEXT[k] + ' ' + c[k] + '곳'; });
    return parts.length ? parts.join(' · ') + ' 포함' : '';
  };

  // ① {M}월 접수 마감 — 공고로 확정된 마감일(phase receiving)이 이번 달에 드는 곳. 추정은 센 값에 넣지 않고 '이번 달 공고 예정이 추정인 곳'을 따로 센다.
  P.deadlineKpi = function (model, today) {
    const ym = logic.localDateStr(today).slice(0, 7);
    let n = 0, n7 = 0, estN = 0, nearest = null;
    ((model && model.notice) || []).forEach(function (it) {
      if (it.phase === 'receiving' && String(it.receiveTo || '').slice(0, 7) === ym) {
        n += 1;
        if (it.deadlineDays <= P.CFG.KPI_HOT_DAYS) { n7 += 1; nearest = nearest === null ? it.deadlineDays : Math.min(nearest, it.deadlineDays); }
      }
    });
    ((model && model.upcoming) || []).forEach(function (it) {
      if (it.confidence !== '확정' && String(it.date || '').slice(0, 7) === ym) estN += 1;
    });
    return { month: today.getMonth() + 1, n: n, n7: n7, nearest: nearest, estN: estN };
  };

  // ③ 내 결재 — 결재자는 처리할 건수(/approvals 작업물·최종결재 + 받은 결재 중 can_decide), 결재 권한이 없으면 내가 올려 대기(PENDING) 건수.
  // src = { perms, inbox, mine, appr } 각 { status, data }. 결재자 판정은 my-perms(rank_can_approve·can_approve), 못 받으면 처리할 건이 보이는지로.
  function agg(sts) {
    const ok = sts.filter(function (x) { return x === 'ok'; }).length;
    const busy = sts.some(function (x) { return x === 'loading' || x === 'idle'; });
    if (ok === sts.length) return { status: 'ok', partial: false };
    if (!ok) return { status: busy ? 'loading' : (sts.every(function (x) { return x === 'denied'; }) ? 'denied' : (sts.some(function (x) { return x === 'offline'; }) ? 'offline' : 'error')), partial: false };
    return { status: 'ok', partial: true };
  }
  P.approvalKpi = function (src, role) {
    const s = src || {};
    const st = function (k) { return (s[k] && s[k].status) || 'idle'; };
    const data = function (k) { return st(k) === 'ok' ? itemsOf(s[k].data) : []; };
    const needAppr = P.APPROVALS_ROLES.indexOf(role) >= 0;
    if (st('perms') === 'loading' || st('perms') === 'idle') return { mode: 'decide', n: 0, status: 'loading', partial: false };
    const decN = data('inbox').filter(function (x) { return x && x.can_decide === true; }).length;
    const apprN = needAppr ? data('appr').length : 0;
    const perms = st('perms') === 'ok' ? (s.perms.data || {}) : null;
    const approver = perms ? (perms.rank_can_approve === true || perms.can_approve === true) : (decN > 0 || apprN > 0);
    const names = approver ? (needAppr ? ['inbox', 'appr'] : ['inbox']) : ['mine'];
    const n = approver ? decN + apprN : data('mine').filter(function (x) { return x && x.status === 'PENDING'; }).length;
    const a = agg(names.map(st));
    return { mode: approver ? 'decide' : 'mine', n: n, status: a.status, partial: a.partial };
  };

  // 공고 경과 판정 대기 줄(대기 패널 ②묶음): 경과 기관 중 미처리 + 협약 종료일이 지난 기관. 같은 기관은 한 번만. days = 지난 일수(D+n).
  P.judgeItems = function (model, buckets, snap, today) {
    const seen = {}, out = [];
    logic.splitOverdue((model && model.overdue) || [], snap, logic.localDateStr(today)).pending.forEach(function (it) {
      if (!seen[it.key]) { seen[it.key] = true; out.push({ key: it.key, rec: it.rec, name: it.name, days: it.days }); }
    });
    ((buckets && buckets.past) || []).forEach(function (it) {
      if (!seen[it.key]) { seen[it.key] = true; out.push({ key: it.key, rec: it.rec, name: it.name, days: -it.endDays }); }
    });
    return out.sort(function (a, b) { return (a.days - b.days) || nameCmp(a, b); });
  };
  P.judgeCount = function (model, buckets, snap, today) { return P.judgeItems(model, buckets, snap, today).length; };
  // 대기 패널 ①묶음의 줄: 결재자는 처리할 건(받은 결재 can_decide + 작업물), 아니면 내가 올려 대기(PENDING). 최대 50줄.
  P.apprItems = function (src, role, mode) {
    const s = src || {}, d = function (k) { return s[k] && s[k].status === 'ok' ? itemsOf(s[k].data) : []; };
    const one = function (x) { return { title: String(x.title || x.type_label || '결재 요청'), meta: String(x.type_label || '') }; };
    if (mode === 'mine') return d('mine').filter(function (x) { return x && x.status === 'PENDING'; }).map(one).slice(0, 50);
    const a = d('inbox').filter(function (x) { return x && x.can_decide === true; }).map(one);
    const t = P.APPROVALS_ROLES.indexOf(role) >= 0 ? d('appr').map(function (x) { return { title: [x.institution_name, x.gate || x.team].filter(Boolean).join(' · ') || '결재 요청', meta: '결재' }; }) : [];
    return a.concat(t).slice(0, 50);
  };

  P.sumMap = function (src) {
    const m = {};
    if (src && src.status === 'ok' && src.data) itemsOf(src.data).forEach(function (x) { if (x && x.institution_id) m[String(x.institution_id)] = x; });
    return m;
  };

  // ── 순수: 표·일정 줄 ───────────────────────────────────────────────
  // 한 기관 한 줄. 우선순위 공고 중 > 공고 예정(확정·추정) > 협약 종료(국민은행·다른 은행 1년 안). 날짜는 줄마다 하나.
  // 정렬: 태그(차기·재유치 확정 등)가 붙은 줄은 뒤 → 날짜(추정은 그 달 1일) → 같은 날이면 확정 먼저 → 이름.
  P.tableRows = function (model, buckets, today) {
    const seen = {}, rows = [], by = (buckets && buckets.byKey) || {}, ym = logic.localDateStr(today).slice(0, 7);
    function base(it, kind, date, days, est) {
      const b = by[it.key], inSet = !!b && typeof b.endDays === 'number' && b.endDays >= 0 && b.endDays <= P.CFG.END_DAYS;
      return { key: it.key, rec: it.rec, name: it.name, region: it.region, org: dash.kindOfRec(it.rec), kind: kind, date: date, days: days, est: est,
        sortDate: date ? (est ? date.slice(0, 7) + '-01' : date) : '9999-12-31',
        inMonth: kind === 'notice' && !!date && date.slice(0, 7) === ym,
        group: inSet ? b.group : '', bank: b ? b.bank : '', end: b && b.end ? b.end : '', endDays: b ? b.endDays : null,
        tag: b ? b.tag : '', nextBank: b ? b.nextBank : '' };
    }
    ((model && model.notice) || []).forEach(function (it) {
      if (it.phase === 'awaiting' || it.late) return;   // 마감 지남·결과 확인 중인 곳은 경과 판정 쪽
      const known = it.phase === 'receiving' && it.receiveTo;
      rows.push(base(it, 'notice', known ? it.receiveTo : '', known ? it.deadlineDays : null, false));
      seen[it.key] = true;
    });
    ((model && model.upcoming) || []).forEach(function (it) {
      if (seen[it.key]) return;
      const est = it.confidence !== '확정';
      rows.push(base(it, est ? 'est' : 'plan', it.date, it.days, est));
      seen[it.key] = true;
    });
    ['kb', 'other'].forEach(function (g) {
      ((buckets && buckets[g]) || []).forEach(function (b) {
        if (seen[b.key]) return;
        const r = base({ key: b.key, rec: b.rec, name: b.name, region: b.region }, g, b.end, b.endDays, false);
        rows.push(r); seen[b.key] = true;
      });
    });
    return P.sortRows(rows);
  };
  P.sortRows = function (rows, dateKey) {
    const k = dateKey || 'sortDate';
    return rows.slice().sort(function (a, b) {
      return ((a.tag ? 1 : 0) - (b.tag ? 1 : 0)) || (a[k] < b[k] ? -1 : (a[k] > b[k] ? 1 : 0)) || ((a.est ? 1 : 0) - (b.est ? 1 : 0)) || nameCmp(a, b);
    });
  };
  // 오른쪽 일정 패널: 앞으로 SCHEDULE_DAYS일 안의 접수 마감·공고 예정(추정은 표지). 실제 날짜 순(추정도 자기 날짜), 태그 붙은 줄은 뒤.
  P.scheduleRows = function (rows) {
    return P.sortRows(rows.filter(function (r) {
      return (r.kind === 'notice' || r.kind === 'plan' || r.kind === 'est') && typeof r.days === 'number' && r.days >= 0 && r.days <= P.CFG.SCHEDULE_DAYS;
    }), 'date');
  };

  function inMode(r, m) {
    return m === 'all' || (m === 'month' && r.inMonth) || (m === 'kb' && r.group === 'kb') || (m === 'other' && r.group === 'other');
  }
  // f = { mode: 'all'|'month'|'kb'|'other', org: 'all'|기관 유형 }. 띠 거르기(한 번에 하나)와 유형 탭을 함께 쓴다.
  P.filterRows = function (rows, f) {
    f = f || {};
    return rows.filter(function (r) { return inMode(r, f.mode || 'all') && (!f.org || f.org === 'all' || r.org === f.org); });
  };
  // 탭 건수는 지금 띠 거르기를 반영한다(버튼 건수는 거르기 줄에서 쓰지 않는다).
  P.counts = function (rows, f) {
    f = f || {};
    const mode = f.mode || 'all', out = { org: { all: 0 } };
    rows.forEach(function (r) { if (!inMode(r, mode)) return; out.org.all += 1; if (r.org) out.org[r.org] = (out.org[r.org] || 0) + 1; });
    return out;
  };
  // 규격 접근성 문구: 거르기를 켜면 '{이름} N곳으로 걸렀습니다', 풀면 '거르기를 풀었습니다. N곳', 유형 탭은 '{유형} N곳을 보여 줍니다.'
  P.liveText = function (f, n, month, total) {
    if (f.kind === 'org') return (f.org === 'all' ? '전체 유형' : f.org) + ' ' + n + '곳을 보여 줍니다.';
    return f.mode === 'all' ? '거르기를 풀었습니다. ' + total + '곳' : P.MODE_LABEL(f.mode, month) + ' ' + n + '곳으로 걸렀습니다';
  };

  // ── 순수: 띠 ───────────────────────────────────────────────────────
  // 숫자·날짜는 보조 줄에서 mono 강조(<b>). 문구는 모두 상수·은행 이름이라 분할 뒤 각각 esc.
  function emph(s) {
    return String(s).split(/(\d{4}-\d{2}-\d{2}|D-\d+|\d+)/).map(function (t, i) { return i % 2 ? '<b>' + esc(t) + '</b>' : esc(t); }).join('');
  }
  // a = { today, model, buckets, bankSt, appr(approvalKpi 결과), mode }
  // → [{ id, label, kind:'n'|'dash'|'busy', n, unit, hot, sub, title, pressed }]. 0곳 = 확인했고 없음, — = 확인 못 함(규격).
  P.bandModel = function (a) {
    const T = P.T, SB = T.sub, d = P.deadlineKpi(a.model, a.today), b = a.buckets, m = d.month, bankSt = a.bankSt || 'offline';
    const dash0 = function (id, label, sub) { return { id: id, label: label, kind: 'dash', n: 0, unit: '', hot: false, sub: sub, title: sub, pressed: null }; };
    const busy0 = function (id, label) { return { id: id, label: label, kind: 'busy', n: 0, unit: '', hot: false, sub: SB.busy, title: SB.busy, pressed: null }; };
    const num = function (id, label, n, unit, sub, title, pressed, hot) { return { id: id, label: label, kind: 'n', n: n, unit: unit, hot: !!hot, sub: sub, title: title || sub, pressed: pressed }; };
    // ① 이번 달 확정 접수 마감(전 기관, dash.model — 현황판과 같은 계산)
    let dl;
    if (d.n === 0) dl = SB.dlNone(m);
    else {
      const base = d.estN ? SB.dlEst(d.estN) : SB.dlOnly;
      dl = d.n7 > 0 ? SB.dlNear(d.nearest) + ' · ' + base : base;
    }
    const k1 = num('deadline', T.kpiDeadline(m), d.n, '곳', dl, dl, a.mode === 'month', d.n7 > 0);
    // ②④ 금고 약정 묶음 — 자료를 못 받았거나 하나도 없으면 —
    const noInfo = Object.keys(b.byKey).length === 0;
    function gate(id, label) {
      if (bankSt === 'loading' || bankSt === 'idle') return busy0(id, label);
      if (bankSt === 'error') return dash0(id, label, SB.failed);
      if (bankSt === 'denied') return dash0(id, label, SB.deniedInst);
      if (noInfo) return dash0(id, label, SB.noBank);
      return null;
    }
    const decided = function (items) { const x = P.decidedNote(items); return x ? ' · ' + x : ''; };
    let k2 = gate('kb', T.kpiKb);
    if (!k2) {
      const s2 = b.kb.length ? SB.kbFirst(b.kb[0].end) : SB.kbNone;
      k2 = num('kb', T.kpiKb, b.kb.length, '곳', s2, s2 + decided(b.kb), a.mode === 'kb', false);
    }
    let k4 = gate('other', T.kpiOther);
    if (!k4) {
      const cnt = {}, order = [];
      b.other.forEach(function (it) { const nm = String(it.bank || '').split('·')[0]; if (!nm) return; if (!cnt[nm]) { cnt[nm] = 0; order.push(nm); } cnt[nm] += 1; });
      order.sort(function (x, y) { return (cnt[y] - cnt[x]) || (x < y ? -1 : (x > y ? 1 : 0)); });
      const s4 = !b.other.length ? SB.otherNone : (order.length ? SB.otherTop(order[0], cnt[order[0]]) : SB.kbFirst(b.other[0].end));
      k4 = num('other', T.kpiOther, b.other.length, '곳', s4, T.otherTitle + decided(b.other), a.mode === 'other', false);
    }
    // ③ 내 결재
    const ap = a.appr || { status: 'loading' };
    let k3;
    if (ap.status === 'loading') k3 = busy0('appr', T.kpiAppr);
    else if (ap.status !== 'ok') k3 = dash0('appr', T.kpiAppr, ap.status === 'denied' ? SB.deniedAppr : (ap.status === 'offline' ? SB.offline : SB.failed));
    else {
      const s3 = ap.n === 0 ? (ap.mode === 'mine' ? SB.apprMineNone : SB.apprDecideNone) : (ap.mode === 'mine' ? SB.apprMine : SB.apprDecide);
      k3 = num('appr', T.kpiAppr, ap.n, '건', s3 + (ap.partial ? SB.partial : ''), null, null, false);
    }
    return [k1, k2, k3, k4];
  };
  P.bandHtml = function (specs) {
    return '<h3 id="pt-band-h" class="sr-only">요약, 칸을 누르면 아래 표를 거릅니다</h3>' + specs.map(function (k, i) {
      const pr = typeof k.pressed === 'boolean' ? ' aria-pressed="' + k.pressed + '" aria-controls="pt-list"' : '';
      const busy = k.kind === 'busy' ? ' aria-busy="true"' : '';
      const v = k.kind === 'n' ? '<span class="v' + (k.hot ? ' hot' : '') + '">' + k.n + '<span>' + esc(k.unit) + '</span></span>'
        : (k.kind === 'busy' ? '<span class="v mut">…</span>' : '<span class="v">—</span>');
      return '<button type="button" class="pt-k" id="pt-k' + (i + 1) + '" data-pt-k="' + esc(k.id) + '"' + pr + busy + ' title="' + esc(k.title) + '">' +
        '<span class="l">' + esc(k.label) + '</span>' + v + '<span class="s">' + emph(k.sub) + '</span></button>';
    }).join('');
  };

  // ── 순수: 표·탭·패널 HTML ──────────────────────────────────────────
  function chip(kind) { const c = P.STAGE[kind]; return '<span class="pt-chip' + (c[1] ? ' ' + c[1] : '') + '">' + esc(c[0]) + '</span>'; }
  function tagChip(r) {
    if (!r.tag) return '';
    const ok = r.tag === 'kept' || r.tag === 'won' ? CHK : '';   // 체크 글리프는 '확정'(재유치·신규)에만 — 삼각(임박)·시계(경과)와 뜻이 겹치지 않음
    return '<span class="pt-chip tag ' + esc(r.tag) + '"' + (r.nextBank ? ' title="' + esc('다음 금고 은행: ' + r.nextBank) + '"' : '') + '>' + ok + esc(P.TAG_TEXT[r.tag]) +
      (r.nextBank ? '<span class="sr-only">, 다음 금고 은행 ' + esc(r.nextBank) + '</span>' : '') + '</span>';
  }
  const CHK = '<svg class="gph" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 5.3l2.4 2.4L8.6 2.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const GPH = '<svg class="gph" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M5 1l4.5 8h-9z" fill="currentColor"/></svg>';
  function stamp(days) {   // 지난 날짜 = 잉크 도장(.ov-stamp)
    return '<span class="ov-stamp"><span aria-hidden="true">D+' + days + '</span><span class="sr-only">' + days + '일 지남</span></span>';
  }
  P.rowHtml = function (r) {
    const hot = typeof r.days === 'number' && r.days >= 0 && r.days <= P.CFG.ROW_HOT_DAYS;
    let when;
    if (r.est) when = '<span class="mut">추정</span>';
    else if (typeof r.days !== 'number') when = '—';
    else if (r.days < 0) when = stamp(-r.days);
    else when = '<span class="pt-dd' + (hot ? ' hot' : '') + '">' + esc(dText(r.days)) + (hot ? GPH : '') + '</span>';
    const date = r.date ? esc(r.est ? r.date.slice(0, 7) : r.date) : '<span class="mut">마감일 미확인</span>';
    const bankFull = (r.bank || '미등록') + (r.end ? ' · 종료 ' + r.end + (r.endDays < 0 ? '(지남)' : '') : '');
    const bank = r.bank ? '<td class="pt-bank' + (isKb(r.bank) ? ' k' : ' mut') + '" title="' + esc(bankFull) + '">' + esc(r.bank) + '</td>' : '<td class="pt-bank mut" title="미등록">미등록</td>';
    return '<tr class="pt-r"><th scope="row"><span class="pt-cell"><button type="button" class="pt-nm" data-pt-open="' + esc(r.key) + '"><span class="rg">' + esc(dash.regionName(r.region)) + '</span>' + esc(r.name) + '</button>' + tagChip(r) + '</span></th>' +
      '<td>' + chip(r.kind) + '</td><td class="dt' + (r.est ? ' est' : '') + '">' + date + '</td><td>' + when + '</td>' + bank + '</tr>';
  };
  // o = { caption, mode, org, month, total }
  P.tableHtml = function (rows, o) {
    o = o || {};
    const shown = rows.slice(0, P.CFG.ROW_MAX), T = P.T;
    let h = '<table class="pt-tt"><caption class="sr-only">' + esc(o.caption || '') + '</caption>' +
      '<colgroup><col class="c-nm"><col class="c-stg"><col class="c-dt"><col class="c-dd"><col class="c-bank"></colgroup>' +
      '<thead><tr><th scope="col">기관</th><th scope="col">단계</th><th scope="col">날짜</th><th scope="col">남은 날</th><th scope="col">현 금고 은행</th></tr></thead><tbody>';
    if (shown.length) h += shown.map(P.rowHtml).join('');
    else {
      const filtered = o.mode && o.mode !== 'all';
      const head = filtered ? T.emptyMode(o.mode, o.month) : (o.org && o.org !== 'all' && o.total ? T.emptyOrg : T.emptyAll);
      h += '<tr class="emp"><td colspan="5"><p class="hb-eh">' + esc(head) + '</p>' + (!filtered && !(o.org && o.org !== 'all' && o.total) ? '<p class="db-state">' + esc(T.emptyAllNote) + '</p>' : '') +
        (filtered ? '<button type="button" data-pt-unfilter="1">' + esc(T.unfilter) + '</button>' : '') + '</td></tr>';
    }
    h += '</tbody></table>';
    if (rows.length > P.CFG.ROW_MAX) h += '<p class="db-state">' + esc(T.capNote(P.CFG.ROW_MAX)) + '</p>';
    return h;
  };
  P.tabsHtml = function (types, counts, org) {
    const list = [{ id: 'all', n: counts.org.all }].concat(types.map(function (t) { return { id: t, n: counts.org[t] || 0 }; }));
    return list.map(function (t, i) {
      const on = t.id === org;
      return '<button type="button" role="tab" class="pt-tab" id="pt-tab-' + i + '" data-pt-t="' + esc(t.id) + '" aria-selected="' + on + '" aria-controls="pt-sc" tabindex="' + (on ? 0 : -1) + '">' +
        esc(t.id === 'all' ? '전체' : t.id) + ' <b>' + t.n + '</b></button>';
    }).join('');
  };
  P.tabIndex = function (types, org) { return org === 'all' ? 0 : Math.max(0, types.indexOf(org) + 1); };
  // 띠 칸을 눌렀을 때만 보이는 거르기 줄(규격 .pt-filter)
  P.filterHtml = function (mode, n, month) {
    return '거르기: <b>' + esc(P.MODE_LABEL(mode, month)) + ' ' + n + '곳</b><button type="button" data-pt-unfilter="1">' + esc(P.T.unfilter) + '</button>';
  };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  // 날짜 머리 = 장부 모양(왼쪽 날짜, 오른쪽 끝 D-n). days = 그 날짜까지 남은 날(오늘 0).
  function dayHead(date, today, days) {
    const d = new Date(date + 'T00:00:00'), md = date.slice(5) + ' (' + WD[d.getDay()] + ')';
    return '<div class="pt-day"><span>' + (date === logic.localDateStr(today) ? '오늘 ' : '') + esc(md) + '</span><span class="dd">' + esc(dText(days)) + '</span></div>';
  }
  P.schedHtml = function (rows, today) {
    if (!rows.length) return '<p class="pt-none">' + esc(P.T.schedEmpty(P.CFG.SCHEDULE_DAYS)) + '</p>';
    let last = '', h = '';
    rows.forEach(function (r) {
      if (r.date !== last) { h += dayHead(r.date, today, r.days); last = r.date; }
      h += '<button type="button" class="pt-row" data-pt-open="' + esc(r.key) + '">' + (r.kind === 'notice' ? '<span class="pt-chip on">접수 마감</span>' : chip(r.kind)) + '<span class="t">' + esc(r.name) + '</span>' + tagChip(r) + '</button>';
    });
    return h;
  };
  // m = { appr:{mode,n,status,partial,items}, judge:{status,items}, assign:{status,items} }
  function grp(title, n, st, body, failNote, deniedNote) {
    const inner = st === 'ok' ? (body || '<p class="pt-none">' + esc(P.T.none) + '</p>')
      : '<p class="pt-none">' + esc(st === 'loading' ? P.T.sub.busy : (st === 'denied' ? (deniedNote || P.T.sub.deniedInst) : failNote)) + '</p>';
    return '<details class="pt-grp" open><summary>' + esc(title) + '<span class="n">' + (st === 'ok' ? n : '—') + '</span></summary>' + inner + '</details>';
  }
  P.waitTotal = function (m) {
    return ['appr', 'judge', 'assign'].reduce(function (s, k) { return s + (m[k] && m[k].status === 'ok' ? (k === 'appr' ? m[k].n : m[k].items.length) : 0); }, 0);
  };
  P.waitHtml = function (m) {
    const T = P.T, ap = m.appr || { status: 'loading', items: [] }, jd = m.judge || { status: 'loading', items: [] }, asg = m.assign || { status: 'loading', items: [] };
    const apGo = ap.mode === 'mine' ? 'appr-mine' : 'appr-inbox';
    const apRows = (ap.items || []).map(function (x) { return '<button type="button" class="pt-row" data-pt-go="' + apGo + '"><span class="t">' + esc(x.title) + '</span><span class="m">' + esc(x.meta) + '</span></button>'; }).join('');
    const jdRows = jd.items.map(function (x) { return '<button type="button" class="pt-row" data-pt-open="' + esc(x.key) + '"><span class="t">' + esc(x.name) + '</span>' + stamp(x.days) + '</button>'; }).join('');
    const asRows = asg.items.map(function (x) { return '<button type="button" class="pt-row" data-pt-go="assign"><span class="t">' + esc(x.title) + '</span></button>'; }).join('');
    const empty = ap.status === 'ok' && jd.status === 'ok' && asg.status === 'ok' && !ap.n && !jd.items.length && !asg.items.length;
    return (empty ? '<p class="pt-none">' + esc(T.waitAllEmpty) + '</p>' : '') +
      grp(ap.mode === 'mine' ? T.grp.mine : T.grp.appr, ap.n, ap.status, apRows, T.sub.failed, T.sub.deniedAppr) +
      grp(T.grp.judge, jd.items.length, jd.status, jdRows, T.sub.failed, T.sub.deniedInst) +
      grp(T.grp.assign, asg.items.length, asg.status, asRows, T.sub.failed, T.sub.deniedAssign);
  };
  // failed = 실패한 출처 묶음 이름들('bank'|'approvals'|'assign'|'notice')
  P.errHtml = function (failed) {
    return failed.map(function (n) {
      return '<p class="db-state" role="alert">' + esc(P.T.errMsg(P.T.errSrc[n] || n)) + ' <button type="button" data-pt-retry="' + esc(n) + '">' + esc(P.T.retry) + '</button></p>';
    }).join('');
  };
  P.asofText = function (d) {
    const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return logic.localDateStr(d) + ' (' + WD[d.getDay()] + ') ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  P.skeletonHtml = function () {
    return '<div class="pt-top"><h2 id="pt-title">시작화면</h2><span class="meta">기준 <b id="pt-asof"></b></span></div>' +
      '<section class="pt-band" id="pt-band" aria-labelledby="pt-band-h"></section>' +
      '<div id="pt-err"></div><p id="pt-live" class="sr-only" aria-live="polite"></p><p id="pt-flash" class="pt-none" role="status"></p>' +
      '<div class="pt-body"><section class="pt-pane pt-list" id="pt-list" aria-labelledby="pt-list-h">' +
      '<div class="pt-ph"><span class="pt-span" aria-hidden="true">1년</span><h3 id="pt-list-h">기관별 입찰 일정</h3><span class="n" id="pt-ln"></span><span class="r">기관마다 가장 가까운 일 하나, 1년 안, 임박순</span></div>' +
      '<div class="pt-tabs" id="pt-tabs" role="tablist" aria-label="기관 유형"></div><div class="pt-filter" id="pt-filter" hidden></div>' +
      '<div class="pt-sc" id="pt-sc" role="tabpanel" tabindex="0"></div><div class="pt-tf" id="pt-ltf"></div></section>' +
      '<div class="pt-side"><section class="pt-pane cal" aria-labelledby="pt-cal-h"><div class="pt-ph"><span class="pt-span" aria-hidden="true">' + P.CFG.SCHEDULE_DAYS + '일</span><h3 id="pt-cal-h">날짜별 일정</h3><span class="n" id="pt-cn"></span><span class="r">앞으로 ' + P.CFG.SCHEDULE_DAYS + '일, 접수 마감·공고 예정</span></div>' +
      '<div class="pt-sc" id="pt-sched" tabindex="0"></div><div class="pt-tf" id="pt-ctf"></div></section>' +
      '<section class="pt-pane wait" aria-labelledby="pt-wait-h"><div class="pt-ph"><h3 id="pt-wait-h">결재·확인 대기</h3><span class="n" id="pt-wn"></span></div>' +
      '<div class="pt-sc" id="pt-wait" tabindex="0"></div></section></div></div>';
  };

  // ── 서버 요청 ──────────────────────────────────────────────────────
  P.env = { fetch: null };   // 시험이 가짜 fetch를 꽂는다
  function getFetch() { return P.env.fetch || (typeof fetch === 'function' ? fetch : null); }
  function fetchJson(url) {
    const f = getFetch();
    if (!f) return Promise.resolve({ status: 'offline' });
    return f(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  P.fetchJson = fetchJson;

  // ── DOM(app.js가 #pt-root를 넘겨 부른다) ─────────────────────────────
  let host = null, ac = null, offNr = null;
  const S = { seq: 0, src: {}, mode: 'all', org: 'all', v: null, recs: {}, errSig: '' };
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function role() { try { return (root.store.loadProfile().team || '').trim(); } catch (e) { return ''; } }
  function serverOn() { try { return !!(dash.util.serverMode() && dash.util.hasEmp()); } catch (e) { return false; } }
  function canOpen(id) { const A = root.app; return !!(A && A.findNavItem && id && A.findNavItem(id)); }
  // 보기 전용 역할(nav.isViewOnly — 전산팀·전산팀장)이면 상세 팝업의 저장 버튼을 모두 숨긴다. 판정은 nav 한 곳, 여기서는 읽기만 한다.
  function viewOnly() { try { const N = root.nav, A = root.app; return !!(N && N.isViewOnly && A && A.navContext && N.isViewOnly(A.navContext())); } catch (e) { return false; } }

  function recompute() {
    const U = dash.util, today = U.todayDate(), list = U.dataList();
    const model = dash.model(list, today), nrm = NRM();
    const snap = nrm && nrm.snap ? nrm.snap() : null, nrSt = nrm && nrm.state ? nrm.state() : 'offline';
    const buckets = P.bankBuckets(list, { today: today, verified: root.KB_VERIFIED, next: root.KB_NEXT, lofin: root.LOFIN_2026, sumById: P.sumMap(S.src.bank), snap: snap });
    const rows = P.tableRows(model, buckets, today);
    S.recs = {};
    rows.forEach(function (r) { S.recs[r.key] = r.rec; });
    const asg = S.src.assign || { status: 'offline' };
    const appr = P.approvalKpi(S.src, role()), jItems = P.judgeItems(model, buckets, snap, today);
    jItems.forEach(function (x) { S.recs[x.key] = x.rec; });
    appr.items = P.apprItems(S.src, role(), appr.mode);
    S.v = { today: today, model: model, buckets: buckets, rows: rows, snap: snap, nrSt: nrSt, types: dash.typeOptions(list), appr: appr,
      judge: { status: (nrSt === 'ok' || nrSt === 'offline') ? 'ok' : (nrSt === 'idle' || nrSt === 'loading' ? 'loading' : nrSt), items: jItems },
      assign: { status: asg.status, items: asg.status === 'ok' ? itemsOf(asg.data).map(function (x) { return { title: String(x.institution_name || x.title || (x.bid_case_id ? '입찰 건 #' + x.bid_case_id : '입찰 건')) + (x.assigned_at ? ' · 배정 ' + String(x.assigned_at).slice(0, 10) : '') }; }) : [] } };
  }
  function keep(id, html) {
    const el = $(id);
    if (!el) return;
    const a = document.activeElement, own = !!(a && a.getAttribute && el.contains(a));
    const attr = own ? ['data-pt-k', 'data-pt-t', 'data-pt-go', 'data-pt-unfilter', 'data-pt-open'].filter(function (k) { return a.getAttribute(k) !== null; })[0] || '' : '';
    const val = attr ? a.getAttribute(attr) : '', top = el.scrollTop;
    el.innerHTML = html;
    el.scrollTop = top;
    if (attr) {
      const t = Array.prototype.filter.call(el.querySelectorAll('[' + attr + ']'), function (x) { return x.getAttribute(attr) === val; })[0];
      if (t && t.focus) t.focus();
    }
  }
  function failedSources() {
    const out = [];
    if (S.src.bank && S.src.bank.status === 'error') out.push('bank');
    if (['appr', 'inbox', 'mine'].some(function (n) { return S.src[n] && S.src[n].status === 'error'; })) out.push('approvals');
    if (S.src.assign && S.src.assign.status === 'error') out.push('assign');
    if (S.v && S.v.nrSt === 'error') out.push('notice');
    return out;
  }
  function paintAll() {
    if (!host || !S.v) return;
    const v = S.v, month = v.today.getMonth() + 1, N = root.nav;
    if (S.org !== 'all' && v.types.indexOf(S.org) < 0) S.org = 'all';
    const f = { mode: S.mode, org: S.org }, counts = P.counts(v.rows, f), shown = P.filterRows(v.rows, f);
    const asof = $('pt-asof'); if (asof) asof.textContent = P.asofText(new Date());
    const bankSt = (S.src.bank && S.src.bank.status) || 'offline';
    keep('pt-band', P.bandHtml(P.bandModel({ today: v.today, model: v.model, buckets: v.buckets, bankSt: bankSt, appr: v.appr, mode: S.mode })));
    const fails = failedSources(), sig = fails.join(',');
    if (sig !== S.errSig) { S.errSig = sig; const e = $('pt-err'); if (e) e.innerHTML = P.errHtml(fails); }
    keep('pt-tabs', P.tabsHtml(v.types, counts, S.org));
    const fl = $('pt-filter');
    if (fl) { fl.hidden = S.mode === 'all'; if (S.mode !== 'all') keep('pt-filter', P.filterHtml(S.mode, shown.length, month)); else fl.innerHTML = ''; }
    const ln = $('pt-ln'); if (ln) ln.textContent = shown.length + '곳';
    const sc = $('pt-sc'); if (sc) sc.setAttribute('aria-labelledby', 'pt-tab-' + P.tabIndex(v.types, S.org));
    keep('pt-sc', P.tableHtml(shown, { caption: '기관별 입찰 일정, 임박순, ' + v.rows.length + '곳 중 ' + shown.length + '곳 보임', mode: S.mode, org: S.org, month: month, total: v.rows.length }));
    const linkBtn = function (go, label, id) { return canOpen(id) ? '<button type="button" class="link-btn" data-pt-go="' + go + '">' + esc(label) + '</button>' : ''; };
    const sched = P.scheduleRows(v.rows);
    const cn = $('pt-cn'); if (cn) cn.textContent = sched.length + '건';
    keep('pt-sched', P.schedHtml(sched, v.today));
    const ltf = $('pt-ltf'); if (ltf) ltf.innerHTML = '<span>' + esc(P.T.listFoot) + '</span>' + linkBtn('dash', P.T.listFootBtn, N && N.DASH_ID);
    const ctf = $('pt-ctf'); if (ctf) ctf.innerHTML = linkBtn('notice-open', P.T.schedFootBtn, N && N.NOTICE_ID);
    const wm = { appr: v.appr, judge: v.judge, assign: v.assign };
    const wn = $('pt-wn'); if (wn) wn.textContent = String(P.waitTotal(wm));
    keep('pt-wait', P.waitHtml(wm));
  }
  function announce(f) {
    const live = $('pt-live');
    if (!live || !S.v) return;
    const shown = P.filterRows(S.v.rows, { mode: S.mode, org: S.org }).length;
    live.textContent = P.liveText(Object.assign({ mode: S.mode, org: S.org }, f || {}), shown, S.v.today.getMonth() + 1, S.v.rows.length);
  }
  function flash(msg) { const f = $('pt-flash'); if (f) f.textContent = msg || ''; }
  function setFilter(mode, org) {
    if (mode !== undefined) S.mode = P.MODES.indexOf(mode) >= 0 ? mode : 'all';
    if (org !== undefined) S.org = org || 'all';
    flash('');
    paintAll(); announce(org !== undefined && mode === undefined ? { kind: 'org' } : null);
    const b = $('pt-sc'); if (b) b.scrollTop = 0;
  }

  function startLoad() {
    const on = serverOn(), names = P.sourcesFor(role());
    names.forEach(function (n) { S.src[n] = { status: on ? 'loading' : 'offline' }; });
    if (on) names.forEach(loadSource);
  }
  function loadSource(n) {
    const my = S.seq;
    S.src[n] = { status: 'loading' };
    fetchJson(P.URLS[n]).then(function (x) {
      if (my !== S.seq || !host) return;
      S.src[n] = x; recompute(); paintAll();
    });
  }

  function openRec(btn) {
    const key = btn.getAttribute('data-pt-open'), rec = S.recs[key];
    if (!rec) { flash(P.T.noRec); return; }
    const again = function () {
      return Array.prototype.filter.call(host ? host.querySelectorAll('[data-pt-open]') : [], function (x) { return x.getAttribute('data-pt-open') === key; })[0] || null;
    };
    dash.openDetail(rec, { opener: btn, screen: P.SCREEN, fallback: '#pt-root', refocus: again, readOnly: viewOnly() });
  }
  function openMenu(id, msg, before) {
    const A = root.app;
    if (!(A && canOpen(id))) { flash(msg); return false; }
    if (before) before();
    if (!A.openNavItem(id)) { flash(msg); return false; }
    return true;
  }
  function go(kind) {
    const N = root.nav, T = P.T;
    if (kind === 'appr-inbox' || kind === 'appr-mine') {
      openMenu('approvals', T.noApprovals, function () { if (root.approvals && root.approvals.openTab) root.approvals.openTab(kind === 'appr-mine' ? 'mine' : 'inbox'); });
    } else if (kind === 'assign') openMenu('tasks', T.noTasks);
    else if (kind === 'dash') openMenu(N && N.DASH_ID, T.noDash);
    else if (kind === 'notice-open') openMenu(N && N.NOTICE_ID, T.noNotice);
  }
  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const open = t.closest('[data-pt-open]');
    if (open && host.contains(open)) { openRec(open); return; }
    const k = t.closest('[data-pt-k]');
    if (k && host.contains(k)) {
      const id = k.getAttribute('data-pt-k');
      if (id === 'appr') { go(S.v && S.v.appr.mode === 'mine' ? 'appr-mine' : 'appr-inbox'); return; }
      if (!k.hasAttribute('aria-pressed')) return;   // '—'·'…' 칸(약정 실패·권한 없음·불러오는 중)은 거르기 단추가 아님(qa 11-19 P2-1)
      const m = id === 'deadline' ? 'month' : id;
      setFilter(S.mode === m ? 'all' : m);   // 한 번에 하나, 눌린 칸을 다시 누르면 푼다
      return;
    }
    if (t.closest('[data-pt-unfilter]') && host.contains(t.closest('[data-pt-unfilter]'))) {
      const was = S.mode;
      setFilter('all');
      // 거르기 줄이 숨겨지므로 포커스는 직전에 거르던 띠 칸으로 보낸다
      const back = $({ month: 'pt-k1', kb: 'pt-k2', other: 'pt-k4' }[was] || 'pt-k1');
      if (back && back.focus) back.focus();
      return;
    }
    const tab = t.closest('[data-pt-t]');
    if (tab && host.contains(tab)) { setFilter(undefined, tab.getAttribute('data-pt-t')); return; }
    const g = t.closest('[data-pt-go]');
    if (g && host.contains(g)) { go(g.getAttribute('data-pt-go')); return; }
    const rt = t.closest('[data-pt-retry]');
    if (rt && host.contains(rt)) {
      const n = rt.getAttribute('data-pt-retry');
      if (n === 'notice') { const nrm = NRM(); if (nrm && nrm.load) nrm.load(); return; }
      (n === 'approvals' ? ['appr', 'inbox', 'mine', 'perms'] : [n]).filter(function (x) { return P.sourcesFor(role()).indexOf(x) >= 0; }).forEach(loadSource);
      recompute(); paintAll();
    }
  }
  function onKey(e) {
    const tb = e.target && e.target.closest ? e.target.closest('[role=tab]') : null;
    if (!tb || !host.contains(tb) || !S.v) return;
    const order = ['all'].concat(S.v.types), i = order.indexOf(tb.getAttribute('data-pt-t'));
    let nx = null;
    if (e.key === 'ArrowRight') nx = order[(i + 1) % order.length];
    else if (e.key === 'ArrowLeft') nx = order[(i + order.length - 1) % order.length];
    else if (e.key === 'Home') nx = order[0];
    else if (e.key === 'End') nx = order[order.length - 1];
    if (nx === null) return;
    e.preventDefault();
    setFilter(undefined, nx);
    const nt = $('pt-tab-' + P.tabIndex(S.v.types, nx)); if (nt && nt.focus) nt.focus();
  }

  P.mount = function (el) {
    if (!el) return;
    if (host) P.unmount();
    host = el; S.seq += 1; S.mode = 'all'; S.org = 'all'; S.errSig = '';
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = P.skeletonHtml();
    host.addEventListener('click', onClick, opt);
    host.addEventListener('keydown', onKey, opt);
    const nrm = NRM();
    if (nrm && nrm.onChange) offNr = nrm.onChange(function () { if (host) { recompute(); paintAll(); } });
    if (nrm && nrm.load) nrm.load();   // 공고 상태 기록(경과 판정 대기 계산) — 열 때마다 최신
    startLoad(); recompute(); paintAll();   // 첫 mount 때는 낭독하지 않는다(qa P3: '거르기를 풀었습니다. 0곳')
  };
  P.unmount = function () {
    S.seq += 1;
    if (offNr) { offNr(); offNr = null; }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; S.v = null; S.recs = {};
  };
  P.isMounted = function () { return !!host; };
  // 기관 편집 저장 뒤 목록이 바뀌면(열려 있을 때만) 다시 센다.
  P.refresh = function () { if (host) { recompute(); paintAll(); } };
  // 계정이 바뀌면 앞 사용자의 결재·배정·약정 응답을 버리고 다시 받는다.
  // 기관 목록(서버 모드)이 열린 뒤에 도착했을 때(app.loadServerData) — 거르기는 두고 출처만 다시 불러온다. 열려 있지 않으면 할 일 없음.
  P.onDataReady = function () {
    if (!host) return;
    S.seq += 1; startLoad(); recompute(); paintAll();
  };
  P.onProfileChange = function () {
    S.seq += 1; S.src = {}; S.mode = 'all'; S.org = 'all'; S.errSig = '';
    if (host) { startLoad(); recompute(); paintAll(); }
  };

  if (isNode) module.exports = P;
  else root.portal = P;
})(typeof self !== 'undefined' ? self : this);
