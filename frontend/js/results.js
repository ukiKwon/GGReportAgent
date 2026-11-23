(function (root) {
  'use strict';
  // 협약 성과 관리(NEXT 104, 2026-11-20). 서버: TargetResultController — GET /bid-targets/results?year= (조회 전용, 쓰기 요청 없음).
  // 규격: handoff/agents/design-reviewer/2026-11-20_1212_a501b274.md. 판정은 서버가 한다 — 화면은 서버 값을 모아 보여 줄 뿐 새 판정·추정을 만들지 않는다.
  // 순수 부분(classify·barModel·filterItems·sortItems·kstDate·*Html)은 node 테스트 대상, DOM 부분(mount 이하)은 브라우저 전용.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const esc = logic.esc;
  const results = {};
  function D() { return isNode ? require('./dashboard.js') : root.dashboard; }

  // nav.js 의 RESULTS_ID 와 같아야 한다(테스트가 대조).
  results.SOON_ID = 'soon:협약 성과 관리';
  const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
  const CODES = ['KEPT', 'WON', 'FAIL', 'WAIT', 'NONE'];   // 결과 5분류 = 정렬·막대·거르기 순서(재유치·신규 먼저)
  const LABEL = { KEPT: '재유치', WON: '신규', FAIL: '타은행 유치', WAIT: '결과 대기', NONE: '확인 필요' };
  const CLS = { KEPT: 'kept', WON: 'won', FAIL: 'fail', WAIT: 'wait', NONE: 'none' };
  const REMOVED_KIND = { CANCEL: '목표 취소', MOVE_TO_WATCH: '관심 기관으로 내림', YEAR_CHANGED: '다른 해로 옮김(이월)' };
  results.CODES = CODES;
  results.LABEL = LABEL;
  results.SHOW_BAR = false;   // 구성 막대·막대 자리 안내를 그리지 않는다(사용자 11-23 '의미가 크지 않으니 일단 안 보이게, 코드는 지우지 말 것') — true 로 바꾸면 다시 보인다
  results.BAR_MIN_N = 5;   // 목표 기관이 이보다 적거나 분류가 한 가지뿐이면 구성 막대를 그리지 않는다(숫자는 요약 띠에 있음)
  results.BRACE_NARROW = 96;   // 꺾쇠 선이 이보다 짧으면 이름표를 왼쪽에 붙인다(이름표 폭 약 87px + 여유, 규격 6-C)
  results.DENIED_MSG = '협약 성과 모아 보기는 영업부서와 개발부서만 볼 수 있습니다.';
  results.LIMIT_MSG = '집계할 약정 기록이 너무 많습니다. 개발부서에 알려 주세요.';
  results.YEAR_MSG = '목표 연도를 확인해 주세요.';
  const RULE = '금고 약정 기록으로 판정합니다. 약정 시작 월로 목표 연도를 정합니다(1월에 시작한 약정은 전년도 목표로 셉니다).';
  const NOTE1 = '약정 시작이 연도만 적힌 기록은 월을 알 수 없어 결과에 넣지 않았습니다.';
  const NOTE2 = '재유치·신규는 직전 금고 은행으로 정하고, 직전 기록이 없으면 목표 구분을 따릅니다(\'목표 구분 기준\' 표시).';
  const TRUNC_MSG = '목표 기관이 2,000곳을 넘어 앞의 2,000곳만 보입니다. 달성률·건수·연중에 뺀 곳은 일부만 셀 수 있어 보이지 않습니다. 개발부서에 알려 주세요.';
  const YEAR_BACK = 3, YEAR_AHEAD = 1;

  // ── 순수: 값 도우미 ────────────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function nb(text) { return esc(text).replace(/\d+/g, '<b>$&</b>'); }   // 숫자만 mono 굵기 없이 .s b 글꼴로(text 는 우리가 만든 문장)
  function ymd(s) { return /^\d{4}-\d{2}-\d{2}/.test(str(s)) ? str(s).slice(0, 10) : ''; }
  function fmtInt(n) { return String(num(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function cmpText(a, b) { return str(a).localeCompare(str(b), 'ko'); }

  // 서버 시각(UTC ISO, '…SSSSSS+00:00') → 한국 날짜 YYYY-MM-DD. 앞 10자를 자르지 않는다(오전 9시 전 기록이 전날로 보임).
  // 영역 표시가 없는 값도 서버가 UTC로 저장한 것으로 읽고, 3자리를 넘는 소수 초는 잘라 엔진 차이를 없앤다. 해석 못 하면 앞 10자.
  results.kstDate = function (iso) {
    let s = str(iso).trim();
    if (!s) return '';
    s = s.replace(/(\.\d{3})\d+/, '$1');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
    const t = Date.parse(s);
    if (isNaN(t)) return ymd(s);
    return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
  };
  // 응답 today 의 연도 기준 (올해−3)~(올해+1). 클라이언트 시계를 쓰지 않는다.
  results.yearOptions = function (today) {
    const y = parseInt(str(today).slice(0, 4), 10);
    if (!(y > 0)) return [];
    const out = [];
    for (let i = y - YEAR_BACK; i <= y + YEAR_AHEAD; i++) out.push(i);
    return out;
  };
  // 결과 5분류. 모르는 result_cd 는 null(어느 칸에도 세지 않는다).
  results.classify = function (it) {
    const c = it && it.result_cd;
    if (c === 'SUCCESS') return it.win_kind === 'RETAIN' ? 'KEPT' : 'WON';
    if (c === 'FAIL') return 'FAIL';
    if (c === 'PENDING') return 'WAIT';
    if (c === 'UNREGISTERED') return 'NONE';
    return null;
  };
  results.countByCode = function (items) {
    const n = { KEPT: 0, WON: 0, FAIL: 0, WAIT: 0, NONE: 0 };
    (items || []).forEach(function (it) { const c = results.classify(it); if (c) n[c] += 1; });
    return n;
  };
  results.tagNames = function (items) {
    const seen = {}, out = [];
    (items || []).forEach(function (it) { const t = str(it.tag_name); if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out.sort(cmpText);
  };
  // 약정 시작 열 = banks 중 가장 이른 term_from 의 앞 7자(YYYY-MM). 없으면 ''.
  results.startMonth = function (it) {
    let min = '';
    ((it && it.banks) || []).forEach(function (b) {
      const f = str(b.term_from).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(f) && (!min || f < min)) min = f;
    });
    return min;
  };
  results.defaultView = function () { return { res: 'all', tag: '', sortKey: 'res', sortDir: 'asc', rmOpen: false }; };

  // ── 순수: 거르기·정렬 ──────────────────────────────────────────────
  results.filterItems = function (items, f) {
    const res = f && f.res && f.res !== 'all' ? f.res : '', tag = f && f.tag ? f.tag : '';
    return (items || []).filter(function (it) {
      if (res && results.classify(it) !== res) return false;
      if (tag && str(it.tag_name) !== tag) return false;
      return true;
    });
  };
  // key: 'res'(기본, 결과 순 — 같은 결과 안은 지역·기관 가나다순) · 'inst' · 'from'(빈 값은 방향과 무관하게 끝).
  results.sortItems = function (items, key, dir, regionName) {
    const rn = regionName || function (c) { return str(c); };
    const sign = dir === 'desc' ? -1 : 1;
    const base = function (a, b) {
      return cmpText(rn(a.region_code), rn(b.region_code)) || cmpText(a.institution_name, b.institution_name) || (num(a.target_no) - num(b.target_no));
    };
    return (items || []).slice().sort(function (a, b) {
      if (key === 'res') {
        const x = CODES.indexOf(results.classify(a)), y = CODES.indexOf(results.classify(b));
        const d = (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
        return d ? d * sign : base(a, b);
      }
      if (key === 'from') {
        const x = results.startMonth(a), y = results.startMonth(b);
        if (!x !== !y) return x ? -1 : 1;
        const d = cmpText(x, y);
        return d ? d * sign : base(a, b);
      }
      return base(a, b) * sign;
    });
  };

  // ── 순수: 요약 문장·막대 ───────────────────────────────────────────
  results.rateText = function (r) { return typeof r === 'number' && isFinite(r) ? r.toFixed(1) + '%' : ''; };
  results.formula = function (s) { return '재유치·신규 ' + num(s.rate_numerator) + ' ÷ (재유치·신규 ' + num(s.success_n) + ' + 타은행 유치 ' + num(s.fail_n) + ')'; };
  results.otherSuccess = function (s) { return Math.max(0, num(s.success_n) - num(s.success_first_n) - num(s.success_second_n)); };
  // 결과가 난 곳이 하나도 없고(달성률 분모 0) 목표는 있다 — 띠·막대 자리가 '아직 없음' 상태로 바뀌는 조건(규격 6-A·6-B).
  results.noResult = function (s) { return !!s && !(num(s.rate_denominator) > 0) && num(s.target_n) > 0; };
  // 화면을 연 뒤 polite 로 읽어 주는 문장.
  results.liveText = function (data) {
    const s = data && data.summary;
    if (data && data.truncated) return '목표 기관이 많아 일부만 표시됩니다';
    if (!data || !s) return '집계 없음';
    if (!num(s.target_n)) return data.year + '년 목표 기관이 없습니다';
    const r = results.rateText(s.success_rate);
    return data.year + '년 목표 기관 ' + num(s.target_n) + '곳, 달성률 ' + (r || '아직 없음');
  };
  // 구성 막대: 칸 폭은 건수에 비례하고 최소 6px, 칸 사이 2px. 28px 미만 칸은 숫자를 범례로 옮긴다(inside=false).
  // span = 재유치·신규·타은행 유치 칸(앞쪽 연속)의 총 폭 — 꺾쇠 선 길이. 달성률 분모가 0이면 span=0.
  results.barModel = function (s, W) {
    const GAP = 2, MIN = 6, INNER = 28;
    const counts = { KEPT: num(s.success_retain_n), WON: num(s.success_new_n), FAIL: num(s.fail_n), WAIT: num(s.pending_n), NONE: num(s.unregistered_n) };
    const cells = CODES.filter(function (c) { return counts[c] > 0; }).map(function (c) { return { code: c, n: counts[c], w: 0, inside: false }; });
    const out = { cells: cells, counts: counts, span: 0, den: num(s.rate_denominator) };
    const k = cells.length;
    if (!k) return out;
    let left = Math.max(num(W) - GAP * (k - 1), MIN * k);
    let free = cells.slice();
    while (free.length) {
      const tot = free.reduce(function (a, c) { return a + c.n; }, 0);
      const small = free.filter(function (c) { return left * c.n / tot < MIN; });
      if (!small.length) { free.forEach(function (c) { c.w = left * c.n / tot; }); break; }
      small.forEach(function (c) { c.w = MIN; left -= MIN; });
      free = free.filter(function (c) { return c.w === 0; });
    }
    cells.forEach(function (c) { c.w = Math.round(c.w * 10) / 10; c.inside = c.w >= INNER; });
    const lead = cells.filter(function (c) { return c.code === 'KEPT' || c.code === 'WON' || c.code === 'FAIL'; });
    out.span = out.den > 0 && lead.length ? Math.round((lead.reduce(function (a, c) { return a + c.w; }, 0) + GAP * (lead.length - 1)) * 10) / 10 : 0;
    return out;
  };

  // ── 순수: 칩·셀 ────────────────────────────────────────────────────
  const GPH_OK = '<svg class="rs-gph" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 5l2.5 2.5L8 2"/></svg>';
  const GPH_NO = '<svg class="rs-gph" viewBox="0 0 9 9" aria-hidden="true"><path d="M1.5 1.5l6 6M7.5 1.5l-6 6"/></svg>';
  // 칩은 언제나 글자를 둔다(글리프는 aria-hidden). 색만으로 구분하지 않는다.
  results.chipHtml = function (code) {
    if (!code) return '<span class="mut">분류 불가</span>';   // 서버가 새 코드를 보낼 때만 — '결과 없음' 점선과 헷갈리지 않게 칩 없이 글자만
    const g = code === 'KEPT' || code === 'WON' ? GPH_OK : (code === 'FAIL' ? GPH_NO : '');
    return '<span class="rs-chip ' + CLS[code] + '">' + g + esc(LABEL[code]) + '</span>';
  };
  function dated(pre, date, post) { return { html: esc(pre) + (date ? mono(date) : '') + esc(post), text: pre + date + post }; }
  // 확인 필요(NONE)의 보조 문구(규격 5절). 코드(CONTRACT_DECIDED 등)는 화면에 내지 않는다.
  results.noneNote = function (it) {
    const b = it && it.bid_basis;
    if (!b) return dated('약정 기록 없음', '', '');
    const d = ymd(b.basis_date);
    if (b.basis_cd === 'NOTICE_NO_BID') return d ? dated('입찰 없음 ', d, '') : dated('입찰 없음', '', '');
    if (b.basis_cd === 'NOTICE_CLOSED') return d ? dated('공고 마감 ', d, ', 약정 기록 없음') : dated('공고 마감, 약정 기록 없음', '', '');
    if (b.basis_cd === 'CONTRACT_DECIDED') {
      const m = str(b.basis_date).slice(0, 7);
      return /^\d{4}-\d{2}$/.test(m) ? dated('약정 ', m, ' 시작, 다른 해 목표로 셈') : dated('약정 시작, 다른 해 목표로 셈', '', '');
    }
    return dated('약정 기록 없음', '', '');
  };
  // 근거 열: 재유치·신규·타은행 유치 = "{종류} {확인일}", 대기 = '입찰 결과 전', 확인 필요 = noneNote. {html, text}
  results.evidenceCell = function (it) {
    const code = results.classify(it);
    if (code === 'WAIT') return dated('입찰 결과 전', '', '');
    if (code === 'NONE') return results.noneNote(it);
    const e = it && it.evidence;
    if (!e) return { html: '', text: '' };
    const kind = str(e.src_kind_name || e.src_kind_cd).trim(), d = ymd(e.checked_date);
    return dated(kind + (kind && d ? ' ' : ''), d, '');
  };
  // 확정 금고 은행 열: "1금고 국민은행" 묶음을 순위 순서대로(가운데점 없음), 국민은행은 굵게.
  results.banksCell = function (it) {
    const bs = (it && it.banks) || [];
    if (!bs.length) return { html: '<span class="mut">—</span>', text: '' };
    return {
      html: bs.map(function (b) { return '<span class="rs-bk' + (b.is_kb ? ' kb' : '') + '"><span class="rk">' + esc(str(b.rank_name)) + '</span> ' + esc(str(b.bank_name)) + '</span>'; }).join(''),
      text: bs.map(function (b) { return str(b.rank_name) + ' ' + str(b.bank_name); }).join(', '),
    };
  };
  results.prepCell = function (it) {
    const p = it && it.prep;
    if (!p) return { text: '—', mut: true };
    if (p.kind === 'CANCELLED') return { text: '제안 중단', mut: false };
    if (p.kind === 'ACTIVE') return { text: str(p.state_name) || '—', mut: !p.state_name };
    return { text: '제안 없음', mut: true };
  };
  // 기관 이름: 기관 자료가 있으면 현황판과 같은 상세 팝업 단추, 없으면 span. c = { regionName, canOpen }
  results.nameHtml = function (it, c) {
    const id = str(it.institution_id);
    const inner = '<span class="rg">' + esc(c.regionName(it.region_code)) + '</span>' + esc(str(it.institution_name));
    if (ID_RE.test(id) && c.canOpen(id)) return '<button type="button" class="hb-nm" data-inst="' + esc(id) + '" aria-haspopup="dialog">' + inner + '</button>';
    return '<span class="hb-nm">' + inner + '</span>';
  };
  function dash() { return '<span class="mut">—</span>'; }
  results.rowHtml = function (it, c) {
    const code = results.classify(it);
    const ev = results.evidenceCell(it), bk = results.banksCell(it), pv = results.prepCell(it);
    const from = results.startMonth(it), tag = str(it.tag_name);
    const basis = (code === 'KEPT' || code === 'WON') && it.win_kind_basis === 'TARGET_TAG';
    const nmTitle = c.regionName(it.region_code) + ' ' + str(it.institution_name);
    return '<tr><th scope="row" title="' + esc(nmTitle) + '">' + results.nameHtml(it, c) + '</th>' +
      '<td title="' + esc(tag) + '">' + (tag ? esc(tag) : dash()) + '</td>' +
      '<td title="' + esc((code ? LABEL[code] : '') + (basis ? ' 목표 구분 기준' : '')) + '">' + results.chipHtml(code) + (basis ? '<span class="rs-basis">목표 구분 기준</span>' : '') + '</td>' +
      '<td class="c-bank-cell" title="' + esc(bk.text) + '">' + bk.html + '</td>' +
      '<td>' + (from ? mono(from) : dash()) + '</td>' +
      '<td title="' + esc(ev.text) + '">' + ev.html + '</td>' +
      '<td' + (pv.mut ? ' class="mut"' : '') + ' title="' + esc(pv.text) + '">' + esc(pv.text) + '</td></tr>';
  };

  // ── 순수: 구획 마크업 ──────────────────────────────────────────────
  function kCell(label, valueHtml, mut, subs) {
    return '<div class="hb-k"><span class="l">' + esc(label) + '</span><span class="v' + (mut ? ' mut' : '') + '">' + valueHtml + '</span>' +
      subs.map(function (x) { return '<span class="s">' + x + '</span>'; }).join('') + '</div>';
  }
  const UNIT = '<span>곳</span>';
  results.warnHtml = function () { return '<p class="pl-warn" role="note">' + esc(TRUNC_MSG) + '</p>'; };
  // 요약 띠 4칸. truncated 면 서버가 summary 를 안 보내므로 4칸 모두 '—'(일부만 센 숫자를 내지 않는다).
  results.bandHtml = function (data) {
    const s = data && !data.truncated ? data.summary : null;
    let cells;
    if (!s) {
      cells = [['달성률'], ['목표 기관'], ['협약 내역'], ['결과 미확정']].map(function (l) { return kCell(l[0], '—', true, []); });
    } else {
      const rate = results.rateText(s.success_rate);
      const extra = results.otherSuccess(s);
      const rm = num(s.removed_n);
      const zero = results.noResult(s);   // 결과 0건(목표만 있음): 0÷0 공식·굵은 0곳을 내지 않는다
      cells = [
        zero ? kCell('달성률', '—', true, [esc('결과가 난 곳이 아직 없습니다'), esc('결과가 나면 계산합니다')])
          : kCell('달성률', rate ? esc(rate) : '—', !rate, (rate ? [] : [esc('결과가 난 곳이 아직 없습니다')]).concat([nb(results.formula(s))])),
        kCell('목표 기관', num(s.target_n) + UNIT, false, [
          nb('재유치·신규 ' + num(s.success_n) + ' 타은행 유치 ' + num(s.fail_n)),
          rm > 0 ? '<button type="button" class="rs-link" data-act="rm">연중에 뺀 곳 <b>' + rm + '</b></button> (목표에 안 셈)' : nb('연중에 뺀 곳 0') + ' (목표에 안 셈)']),
        zero ? kCell('협약 내역', num(s.success_n) + UNIT, true, [esc('결과가 나면 셉니다')])
          : kCell('협약 내역', num(s.success_n) + UNIT, false, [
          nb('재유치 ' + num(s.success_retain_n) + ' 신규 ' + num(s.success_new_n)),
          '1금고 <b>' + num(s.success_first_n) + '</b> 2금고 <b>' + num(s.success_second_n) + '</b>' + (extra > 0 ? ' 공동·그 밖 <b>' + extra + '</b>' : '')]),   // 순위 글자의 1·2는 굵게 하지 않는다(nb 를 쓰면 '1금고' 의 1도 감싼다)
        kCell('결과 미확정', (num(s.pending_n) + num(s.unregistered_n)) + UNIT, false, [
          nb('결과 대기 ' + num(s.pending_n) + ' 확인 필요 ' + num(s.unregistered_n)), esc('달성률에 넣지 않습니다')]),
      ];
    }
    return (data && data.truncated ? results.warnHtml() : '') + '<div class="rs-band">' + cells.join('') + '</div>';
  };
  // 결과 0건이라 막대를 안 그릴 때 그 자리의 안내 한 줄(규격 6-B). 목표 BAR_MIN_N 곳 미만·결과가 있는 경우는 ''.
  results.barNoteHtml = function (s) {
    if (!s || !results.noResult(s) || num(s.target_n) < results.BAR_MIN_N) return '';
    const w = num(s.pending_n), u = num(s.unregistered_n);
    if (!(w + u > 0)) return '';
    const now = u === 0 ? w + '곳 모두 결과 대기입니다' : (w === 0 ? u + '곳 모두 확인 필요입니다' : '결과 대기 ' + w + '곳, 확인 필요 ' + u + '곳입니다');
    return '<p class="db-why rs-bar-note">' + esc('입찰 결과가 나면 여기에 구성 막대가 그려집니다. 지금은 ' + now + '.') + '</p>';
  };
  // 목표 기관 구성 막대 + 달성률 계산 구간 꺾쇠. 칸이 없거나 데이터가 적으면(목표 BAR_MIN_N 곳 미만·분류 한 가지) ''.
  results.barHtml = function (s, W) {
    const m = results.barModel(s, W);
    if (!m.cells.length || num(s.target_n) < results.BAR_MIN_N || m.cells.length < 2 || !(m.den > 0)) return '';   // 결과(재유치·신규·타은행 유치)가 하나도 없으면(목표만) 막대를 그리지 않는다 — 오류처럼 보임(사용자 11-23)
    const parts = CODES.map(function (c) { return LABEL[c] + ' ' + m.counts[c]; }).join(', ');
    const label = '목표 ' + num(s.target_n) + '곳: ' + parts + '. ' + (m.den > 0 ? '달성률은 재유치·신규와 타은행 유치 ' + m.den + '곳으로 계산' : '결과가 난 곳이 없어 달성률은 아직 없음');
    const brace = m.span > 0 ? '<div class="rs-brace' + (m.span < results.BRACE_NARROW ? ' l' : '') + '" style="width:' + m.span + 'px"><span>달성률 계산 ' + m.den + '곳</span></div>' : '';
    const cells = m.cells.map(function (c) {
      return '<span class="rs-cell" style="width:' + c.w + 'px"><b class="n">' + (c.inside ? c.n : '') + '</b><i class="rs-seg ' + CLS[c.code] + '"></i></span>';
    }).join('');
    const narrow = m.cells.filter(function (c) { return !c.inside; });
    const legend = narrow.length ? '<ul class="rs-legend">' + narrow.map(function (c) {
      return '<li><i class="rs-seg ' + CLS[c.code] + '"></i>' + esc(LABEL[c.code]) + ' ' + mono(c.n) + '</li>'; }).join('') + '</ul>' : '';
    return '<div class="rs-bar-wrap">' + brace + '<div class="rs-bar" role="img" aria-label="' + esc(label) + '">' + cells + '</div>' + legend + '</div>';
  };
  results.filtersHtml = function (v, data) {
    const items = (data && data.items) || [];
    if (!items.length) return '';
    const cnt = results.countByCode(items);
    const opt = function (name, value, text, on) {
      return '<label><input type="radio" name="' + name + '" value="' + esc(value) + '"' + (on ? ' checked' : '') + '><span>' + esc(text) + '</span></label>';
    };
    let r = opt('rs-res', 'all', '전체 ' + items.length, !v.res || v.res === 'all');
    CODES.forEach(function (c) { r += opt('rs-res', c, LABEL[c] + ' ' + cnt[c], v.res === c); });
    let h = '<div class="rs-frow"><span class="rs-fl" aria-hidden="true">결과</span><fieldset class="db-per"><legend class="sr-only">결과로 거르기</legend>' + r + '</fieldset></div>';
    const tags = results.tagNames(items);
    if (tags.length) {
      let t = opt('rs-tag', '', '전체', !v.tag);
      tags.forEach(function (n) { t += opt('rs-tag', n, n + ' ' + items.filter(function (it) { return str(it.tag_name) === n; }).length, v.tag === n); });
      h += '<div class="rs-frow"><span class="rs-fl" aria-hidden="true">목표 구분</span><fieldset class="db-per"><legend class="sr-only">목표 구분으로 거르기</legend>' + t + '</fieldset></div>';
    }
    return '<div class="rs-filters">' + h + '</div>';
  };
  results.emptyHtml = function (year) {
    return '<div class="db-state"><p>' + esc(year) + '년 목표 기관이 없습니다. 목표 기관은 입찰 현황판에서 정합니다.</p><button type="button" class="rs-btn" data-act="dash">입찰 현황판 열기</button></div>';
  };
  results.loadingHtml = function () { return '<p class="db-state">협약 성과를 불러오는 중입니다…</p>'; };
  // 오류 → { html, alert, hideYear }. 403·401 은 일반 안내(alert 아님, 연도 선택 숨김), 그 밖은 alert + [다시 시도].
  // 서버 글(detail)은 문자열일 때만 esc 해 쓰고, 없거나 길면 고정 문구.
  results.errorView = function (r) {
    const code = r && r.code ? Number(r.code) : 0;
    const det = r && typeof r.detail === 'string' && r.detail.length > 0 && r.detail.length <= 200 ? r.detail : '';
    if (code === 403) return { html: '<p class="db-state">' + esc(det || results.DENIED_MSG) + '</p>', alert: false, hideYear: true };
    if (code === 401) return { html: '<p class="db-state">로그인한 뒤 다시 열어 주세요.</p>', alert: false, hideYear: true };
    let msg;
    if (code === 400) msg = det || results.YEAR_MSG;
    else if (code === 409) msg = det || results.LIMIT_MSG;
    else msg = '협약 성과를 불러오지 못했습니다(' + (code ? '오류 ' + code : '서버에 연결되지 않음') + ').';
    return { html: '<div class="db-state" role="alert"><p>' + esc(msg) + '</p><button type="button" class="rs-btn" data-act="retry">다시 시도</button></div>', alert: true, hideYear: false };
  };

  const SORT_ICON = {
    asc: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 5L4 2.5 6.5 5"/></svg>',
    desc: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3L4 5.5 6.5 3"/></svg>',
    none: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3L4 1 6.5 3M1.5 5L4 7 6.5 5"/></svg>' };
  function thHtml(label, key, v) {
    if (!key) return '<th scope="col">' + esc(label) + '</th>';
    const on = v.sortKey === key, dir = v.sortDir === 'desc' ? 'desc' : 'asc';
    return '<th scope="col"' + (on ? ' aria-sort="' + (dir === 'desc' ? 'descending' : 'ascending') + '"' : '') + '><button type="button" class="hb-sort" data-sort="' + key + '">' + esc(label) + SORT_ICON[on ? dir : 'none'] + '</button></th>';
  }
  results.tableCaption = function (total, shown, truncated) {
    return truncated ? '표시된 ' + fmtInt(total) + '곳 중 ' + shown + '곳' : total + '곳 중 ' + shown + '곳 표시';
  };
  // 기관별 표(+ 표 아래 고정 주석 2줄). 목표 기관이 하나도 없으면(truncated 아님) 빈 상태 문구.
  results.tableHtml = function (v, data, c) {
    const all = (data && data.items) || [];
    if (!all.length && !(data && data.truncated)) return results.emptyHtml(data ? data.year : '');
    const shown = results.sortItems(results.filterItems(all, { res: v.res, tag: v.tag }), v.sortKey, v.sortDir, c.regionName);
    const head = '<thead><tr>' + thHtml('기관', 'inst', v) + thHtml('구분', '', v) + thHtml('결과', 'res', v) + thHtml('확정 금고 은행', '', v) +
      thHtml('약정 시작', 'from', v) + thHtml('근거', '', v) + thHtml('제안 진행', '', v) + '</tr></thead>';
    const rows = shown.length ? shown.map(function (it) { return results.rowHtml(it, c); }).join('')
      : '<tr class="emp"><td colspan="7"><div class="db-state">이 조건에 맞는 기관이 없습니다. <button type="button" class="rs-btn" data-act="clear">거르기 풀기</button></div></td></tr>';
    return '<div class="rs-tp"><table class="rs-tt"><caption>' + esc(results.tableCaption(all.length, shown.length, !!data.truncated)) + '</caption>' +
      '<colgroup><col class="c-nm"><col class="c-tag"><col class="c-res"><col class="c-bank"><col class="c-from"><col class="c-evd"><col class="c-prep"></colgroup>' +
      head + '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="rs-notes"><p class="db-why">' + esc(NOTE1) + '</p><p class="db-why">' + esc(NOTE2) + '</p></div>';
  };
  // 연중에 뺀 곳: 접힌 구획(0건이면 글줄만). truncated·null 이면 ''. 뺀 날은 KST, 최신순.
  results.removedHtml = function (v, data, c) {
    const list = data && !data.truncated && Array.isArray(data.removed_items) ? data.removed_items : null;
    if (!list) return '';
    if (!list.length) return '<p class="db-why rs-rm0">연중에 뺀 곳 없음</p>';
    const open = !!v.rmOpen;
    const sorted = list.slice().sort(function (a, b) { return cmpText(b.removed_at, a.removed_at); });
    const rows = sorted.map(function (it) {
      const tag = str(it.tag_name), why = str(it.reason_name), kind = REMOVED_KIND[it.removed_kind] || '—', d = results.kstDate(it.removed_at);
      return '<tr><th scope="row" title="' + esc(c.regionName(it.region_code) + ' ' + str(it.institution_name)) + '">' + results.nameHtml(it, c) + '</th>' +
        '<td>' + (tag ? esc(tag) : dash()) + '</td><td>' + esc(kind) + '</td>' +
        '<td title="' + esc(why) + '">' + (why ? esc(why) : dash()) + '</td><td>' + (d ? mono(d) : dash()) + '</td></tr>';
    }).join('');
    return '<section class="rs-rm" aria-label="연중에 뺀 곳"><div class="rs-rm-h"><h3><button type="button" class="rs-tog" id="rs-tog" aria-expanded="' + open + '" aria-controls="rs-rm-body">' +
      '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.5L5.5 4 2.5 6.5"/></svg>연중에 뺀 곳 ' + list.length + '곳</button></h3>' +
      '<span class="db-why">목표 기관 수와 달성률에 넣지 않았습니다.</span></div>' +
      '<div class="rs-rm-b" id="rs-rm-body"' + (open ? '' : ' hidden') + '><p class="db-why">잘못 넣음·중복으로 취소한 기록은 입력 정정이라 보이지 않습니다.</p>' +
      '<div class="rs-tp"><table class="rs-tt rs-rt"><colgroup><col class="c-nm"><col class="c-tag"><col class="c-kind"><col class="c-why"><col class="c-at"></colgroup>' +
      '<thead><tr><th scope="col">기관</th><th scope="col">목표 구분</th><th scope="col">뺀 방식</th><th scope="col">사유</th><th scope="col">뺀 날</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></section>';
  };
  // 띠·표를 모두 비우고 빈 상태만 보일지(목표 기관도 뺀 곳도 없을 때).
  results.isEmpty = function (data) {
    return !!data && !data.truncated && !(data.items || []).length && !(data.removed_items || []).length;
  };

  // ── DOM: 화면 ──────────────────────────────────────────────────────
  let S = null, host = null, ac = null, seq = 0, REC = null;
  function freshState(who) { return Object.assign(results.defaultView(), { who: who || '', year: 0, today: '', view: 'idle', data: null, err: null, optKey: '' }); }
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function serverOk() { try { return !!(root.store && root.store.isServerMode()) && !!((root.store.loadSession() || {}).emp); } catch (e) { return false; } }
  function whoNow() { try { return String((root.store.loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  function dataList() {
    try {
      if (root.render && root.render.allInstitutions) return root.render.allInstitutions();
      return root.store.loadData() || root.institutions || [];
    } catch (e) { return root.institutions || []; }
  }
  function recIndex() {
    if (REC) return REC;
    REC = {};
    dataList().forEach(function (r) { if (r && r.institutionId) REC[String(r.institutionId)] = r; });
    return REC;
  }
  function ctx() {
    const d = D();
    return { regionName: function (c) { return d && d.regionName ? d.regionName(c) : str(c); }, canOpen: function (id) { return !!recIndex()[id]; } };
  }
  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.resolve({ status: 'error', code: 0 });
    return fetch(url).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (b) { return b; }, function () { return null; }).then(function (b) {
          return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status, detail: b && typeof b.detail === 'string' ? b.detail : '' };
        });
      }
      return r.json().then(function (d) { return { status: 'ok', data: d }; }, function () { return { status: 'error', code: r.status }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }

  const SKELETON =
    '<div class="db-head rs-head"><h2 id="rs-title" tabindex="-1">협약 성과 관리</h2><span id="rs-meta" class="db-why"></span>' +
    '<label class="rs-yr" id="rs-yr-wrap" hidden>목표 연도 <select id="rs-year"></select></label></div>' +
    '<p class="db-why rs-rule">' + esc(RULE) + '</p>' +
    '<div id="rs-live" class="sr-only" role="status" aria-live="polite"></div>' +
    '<div id="rs-body" aria-busy="false"><div id="rs-band"></div><div id="rs-bar"></div><div id="rs-fil"></div><div id="rs-tbl"></div><div id="rs-rm"></div></div>';

  function setHtml(id, html) { const el = $(id); if (el) el.innerHTML = html; }
  // 측정 대상은 늘 보이는 #rs-body(없으면 #rs-band). 비어 있는 #rs-bar 는 display:none 이라 clientWidth 가 0 이다.
  function barWidth() { const el = $('rs-body') || $('rs-band'); return Math.max(0, (el && el.clientWidth ? el.clientWidth : 990) - 34); }   // 상자 안 패딩 16×2 + 테두리 1×2
  function renderBar() {
    const d = S && S.data;
    const ok = results.SHOW_BAR && d && !d.truncated && d.summary && !results.isEmpty(d);
    setHtml('rs-bar', ok ? (results.barHtml(d.summary, barWidth()) || results.barNoteHtml(d.summary)) : '');
  }
  function renderTable() { if (S && S.data) setHtml('rs-tbl', results.tableHtml(S, S.data, ctx())); }
  function renderRm() { if (S && S.data) setHtml('rs-rm', results.removedHtml(S, S.data, ctx())); }
  function renderTop() {
    const d = S.data, empty = results.isEmpty(d);
    setHtml('rs-band', empty ? '' : results.bandHtml(d));
    renderBar();
    setHtml('rs-fil', empty ? '' : results.filtersHtml(S, d));
  }
  function paint() {
    if (!host) return;
    const body = $('rs-body');
    body.setAttribute('aria-busy', S.view === 'loading' ? 'true' : 'false');
    body.classList.toggle('rs-busy', S.view === 'loading' && !!S.data);   // 연도만 바꿀 때는 이전 표를 흐리게 두고 새로 받는다
    if (S.view === 'loading') {
      if (!S.data) { setHtml('rs-band', results.loadingHtml()); setHtml('rs-bar', ''); setHtml('rs-fil', ''); setHtml('rs-tbl', ''); setHtml('rs-rm', ''); }
      return;
    }
    if (S.view === 'ok' && S.data) { renderTop(); renderTable(); renderRm(); return; }
    setHtml('rs-band', (S.err || results.errorView({ code: 0 })).html);
    setHtml('rs-bar', ''); setHtml('rs-fil', ''); setHtml('rs-tbl', ''); setHtml('rs-rm', '');
  }
  function fillYear() {
    const wrap = $('rs-yr-wrap'), sel = $('rs-year'), meta = $('rs-meta');
    if (!wrap || !sel || !meta) return;
    const ys = results.yearOptions(S.today);
    wrap.hidden = !ys.length || S.view === 'denied';
    const key = ys.join(',');
    if (S.optKey !== key) { sel.innerHTML = ys.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join(''); S.optKey = key; }
    if (S.year) sel.value = String(S.year);
    const cur = ys.length ? ys[0] + YEAR_BACK : 0;
    meta.textContent = S.today && S.year && cur && S.year !== cur ? S.today + ' 기준' : '';   // 올해가 아닌 해를 볼 때만
  }
  function load() {
    if (!host) return;
    const my = ++seq;
    S.view = 'loading';
    paint();
    if (!serverOk()) { done(my, { status: 'error', code: 0 }); return; }
    fetchJson('/bid-targets/results' + (S.year ? '?year=' + encodeURIComponent(S.year) : '')).then(function (r) { done(my, r); });
  }
  function done(my, r) {
    if (my !== seq || !host) return;
    const live = $('rs-live');
    if (r.status === 'ok' && r.data && typeof r.data === 'object' && Array.isArray(r.data.items)) {
      S.data = r.data; S.view = 'ok'; S.err = null;
      S.year = num(r.data.year) || S.year; S.today = str(r.data.today);
      if (S.tag && results.tagNames(r.data.items).indexOf(S.tag) < 0) S.tag = '';   // 다른 해로 바꾸면 없는 구분은 푼다
      if (live) live.textContent = results.liveText(r.data);
    } else {
      S.data = null; S.view = r.status === 'denied' ? 'denied' : 'error';
      S.err = results.errorView(r);
      if (S.err.hideYear) S.view = 'denied';
    }
    fillYear();
    paint();
  }

  function openRm(focus) {
    const tog = $('rs-tog'), b = $('rs-rm-body');
    if (!tog || !b) return;
    if (focus) S.rmOpen = true;
    tog.setAttribute('aria-expanded', S.rmOpen ? 'true' : 'false');
    b.hidden = !S.rmOpen;
    if (focus) { if (tog.scrollIntoView) tog.scrollIntoView({ block: 'nearest' }); tog.focus(); }
  }
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t || !host || !host.contains(t)) return;
    const act = t.getAttribute('data-act');
    if (act === 'retry') { load(); return; }
    if (act === 'dash') { const A = root.app, N = root.nav; if (A && A.openNavItem && N && N.DASH_ID) A.openNavItem(N.DASH_ID); return; }
    if (act === 'clear') {
      S.res = 'all'; S.tag = ''; renderTop(); renderTable();
      const r = host.querySelector('input[name="rs-res"]:checked'); if (r && r.focus) r.focus();
      return;
    }
    if (act === 'rm') { openRm(true); return; }
    if (t.classList.contains('rs-tog')) { S.rmOpen = !S.rmOpen; openRm(false); return; }
    if (t.classList.contains('hb-sort')) {
      const k = t.getAttribute('data-sort');
      if (k !== 'res' && k !== 'inst' && k !== 'from') return;
      if (S.sortKey === k) S.sortDir = S.sortDir === 'desc' ? 'asc' : 'desc'; else { S.sortKey = k; S.sortDir = 'asc'; }
      renderTable();
      const b = host.querySelector('button.hb-sort[data-sort="' + k + '"]'); if (b && b.focus) b.focus();
      return;
    }
    if (t.classList.contains('hb-nm')) {
      const rec = recIndex()[t.getAttribute('data-inst') || ''], d = D();
      if (rec && d && d.openDetail) d.openDetail(rec, { opener: t, noConfirm: true });   // 협약 성과 화면에서는 [제안 확정]을 두지 않는다(사용자 11-23, dashboard.js noConfirm 은 fa)   // 보기 전용 역할은 dashboard 가 알아서 읽기만 보인다
    }
  }
  function onChange(e) {
    const t = e.target;
    if (!t || !S) return;
    if (t.id === 'rs-year') { const y = Number(t.value); if (y > 0) { S.year = y; load(); } return; }
    if (t.name === 'rs-res') S.res = CODES.indexOf(t.value) >= 0 ? t.value : 'all';
    else if (t.name === 'rs-tag') S.tag = t.value || '';
    else return;
    renderTable();
    const live = $('rs-live');
    if (live && S.data) live.textContent = results.tableCaption((S.data.items || []).length, results.filterItems(S.data.items, { res: S.res, tag: S.tag }).length, !!S.data.truncated).replace(/^표시된 /, '');
  }

  // 화면이 열릴 때마다 app.showSoon 이 부른다. 고른 거르기·정렬은 같은 사용자면 이어 가고 데이터는 다시 받는다.
  results.mount = function (el) {
    if (typeof document === 'undefined') return;
    const target = el || document.getElementById('results-root');
    if (!target) return;
    if (host) results.unmount();
    host = target;
    const who = whoNow();
    if (!S || S.who !== who) S = freshState(who);
    S.data = null; S.err = null; S.view = 'idle'; S.optKey = ''; REC = null;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('change', onChange, opt);
    if (typeof window !== 'undefined') window.addEventListener('resize', function () { if (host && S && S.view === 'ok') renderBar(); }, opt);
    fillYear();
    const h = $('rs-title'); if (h && h.focus) h.focus();
    load();
  };
  results.unmount = function () {
    seq += 1;
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null;
  };
  // 계정이 바뀌면 앞 사용자의 응답·거르기를 버린다(app.onProfileChanged).
  results.onProfileChange = function () {
    if (typeof document === 'undefined') return;
    S = null;
    const was = host;
    results.unmount();
    if (was && was.style.display !== 'none') results.mount(was);
  };

  if (isNode) module.exports = results;
  else root.results = results;
})(typeof window !== 'undefined' ? window : globalThis);
