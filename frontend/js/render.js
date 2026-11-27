(function (root) {
  'use strict';
  const render = {};
  // designer.js·approvals.js와 같은 방식(브라우저는 전역, node는 require) — 이 파일도
  // node --test로 열 수 있어야 면 클릭 규칙을 테스트로 고정할 수 있다.
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
  const store = (typeof require !== 'undefined') ? require('./store.js') : root.store;
  const tblEmpty = (typeof require !== 'undefined') ? require('./tblempty.js') : root.tblEmpty;

  const esc = logic.esc; // 공유 이스케이프(logic.esc) 위임

  render.state = {
    // 로컬 날짜 기준 자정. toISOString()은 UTC라 한국 시각 00~09시에 하루 전 날짜가 된다.
    today: new Date(logic.localDateStr(new Date()) + 'T00:00:00'),
    // v2(2026-08-09): 전국 확대. korea.js의 17개 시·도 코드 전부를 활성화한다.
    // 비활성 지역은 빗금('준비중')으로 그려지고 클릭·랭킹 집계에서도 빠지므로,
    // 광역 금고 데이터를 넣어도 여기에 코드가 없으면 화면에 아무것도 안 나타난다.
    activeRegions: new Set(['11','26','27','28','30','31','36',
                            '41','42','43','44','45','46','47','48','50']),
    // '기관 분류선택' 필터가 켠 종류(정본 6종 logic.TYPE_KINDS, kindOf로 판정). 기본은 전부 켬.
    enabledTypes: new Set(logic.TYPE_KINDS),
    currentRegion: null,
    rankSort: 'urgency',   // 'urgency' | 'interest'
    rankOpen: new Set(),   // 펼친 시군구 묶음 코드(1년 이상 남은 기관) — 새 지역에 들어오면 drawRegion이 비운다
  };

  // 파스텔 기본 팔레트(2026-08-14 정본 — 다크 크롬+파스텔 지도 월드). 어두운 크롬
  // 위에서 채도는 지도만 갖는다: 진한 원색은 위에 얹히는 물결/깜빡임을 묻히게 해서
  // 낮췄고(1.0 팔레트 계승), 사용자 확정 근거는 handoff/2026-08-14_summary.md
  // (라이트·원색 계열 8종 비교 후 이 조합 선택).
  // 2026-11-11(NEXT 78): 지도 면 색이 5단 섞기로 바뀌었다 — r3 진빨강 · r2 빨강 · p 보라(섞임) ·
  // b2 파랑 · b3 진파랑 · gray 날짜 미상. 값은 design-reviewer 1616 규격 §6(바탕 대비 4.0~9.6:1).
  render.DEFAULT_THEME = {
    r3:'#e8606b', r2:'#f0a6a9', p:'#cf9ad8', b2:'#7397d8', b3:'#4f72b8', gray:'#7c8699',
    // 밝은 업무 포털(KRDS primary-60) — 물결·크롬 강조가 공유(지도 구 외곽선은 더 이상 이 색을 따르지 않는다: 잉크+흰 두 겹). 옛 기본 틸(#57b8ad)은 migrateTheme이 버린다.
    accent:'#0b50d0',
    rippleDuration: 2.2,   // 초. 이전 1.4s에서 한 템포 늦춤
  };

  // 글리프는 문자·이모지 대신 같은 획 어휘(1.2~1.4 스트로크)의 인라인 SVG로 그린다 —
  // 상단 필터의 .fsw와 한 계열. 색은 부모(.heart/.star 등)의 currentColor를 따른다.
  render.ICONS = {
    heartFill: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 10.2C2.4 7.6 1 5.9 1 4.1 1 2.7 2.1 1.7 3.4 1.7 4.4 1.7 5.4 2.3 6 3.3 6.6 2.3 7.6 1.7 8.6 1.7 9.9 1.7 11 2.7 11 4.1 11 5.9 9.6 7.6 6 10.2Z" fill="currentColor"/></svg>',
    heartLine: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 10.2C2.4 7.6 1 5.9 1 4.1 1 2.7 2.1 1.7 3.4 1.7 4.4 1.7 5.4 2.3 6 3.3 6.6 2.3 7.6 1.7 8.6 1.7 9.9 1.7 11 2.7 11 4.1 11 5.9 9.6 7.6 6 10.2Z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    starFill: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 1.2 7.35 4.35 10.8 4.65 8.2 6.9 9 10.3 6 8.45 3 10.3 3.8 6.9 1.2 4.65 4.65 4.35Z" fill="currentColor"/></svg>',
    starLine: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 1.2 7.35 4.35 10.8 4.65 8.2 6.9 9 10.3 6 8.45 3 10.3 3.8 6.9 1.2 4.65 4.65 4.35Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    warn: '<svg class="gph warn" viewBox="0 0 12 12"><path d="M6 1.6 11 10.4H1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="6" y1="4.6" x2="6" y2="7.2" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="8.8" r="0.8" fill="currentColor"/></svg>',
    // 티커 임박(상승) 표기 — 문자 ▲ 대신 같은 획 어휘의 채운 삼각
    up: '<svg class="gph up" viewBox="0 0 12 12"><path d="M6 2.4 10.4 9.6H1.6Z" fill="currentColor"/></svg>',
    // 공고 예정일 경과 도장(시계) — 임박(▲, 빨강)과 모양·색·글자가 모두 다른 무채색 신호.
    overdue: '<svg class="gph" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 3.4V6l1.9 1.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // 날짜 뜻이 불확실한 날짜용 표식(점선 원 + i). 지금 쓰는 곳 없음 — 공고일 7곳은 뜻이 확인돼 이름표로 바꿨다(11-23). 시험이 존재를 검사하므로 남긴다.
    check: '<svg class="gph" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.4"/><line x1="6" y1="5.4" x2="6" y2="8.6" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="3.7" r=".75" fill="currentColor"/></svg>',
  };
  // MAP_COLORS는 지도 위(지역 면·마커)의 5단 색이고 테마로 바꾼다. URGENCY_COLORS는 **크롬**(티커)의
  // 옛 4단+미상 색으로 고정이다(규격 §6 '크롬 그대로', 팀 결정 2026-11-11). 지도 위 마커는 기관 하나의
  // 임박도 band를 BAND_TO_MIX로 5단 색에 대응시켜 MAP_COLORS를 쓴다: red→r3, orange→r2, yellow→b2, blue→b3, gray→gray.
  render.MAP_KEYS = ['r3','r2','p','b2','b3','gray'];
  render.BAND_TO_MIX = { red:'r3', orange:'r2', yellow:'b2', blue:'b3', gray:'gray' };
  render.MAP_COLORS = { r3:'', r2:'', p:'', b2:'', b3:'', gray:'' };
  render.markerColor = function (band) {
    const k = render.BAND_TO_MIX[band] || 'gray';
    return render._safeColor(render.MAP_COLORS[k], render.DEFAULT_THEME[k]);
  };

  // 이전 테마(red/orange/yellow/blue/gray)를 이어받는다. 끝점 대응은 위 BAND_TO_MIX와 같다.
  // 테마 창은 저장할 때 다섯 색을 전부 쓰므로, 옛 기본값 그대로인 값은 사용자가 고른 색이 아니라서
  // 가져오지 않는다(가져오면 새 5단이 옛 파스텔로 덮여 노랑이 파랑 자리에 들어간다).
  render.LEGACY_DEFAULTS = { red:'#f0a6a9', orange:'#f3c795', yellow:'#e9e3a8', blue:'#a9c5ea', gray:'#7c8699' };
  render.URGENCY_COLORS = Object.assign({}, render.LEGACY_DEFAULTS);
  render.LEGACY_ACCENT = '#57b8ad';   // 2026-11-17 이전 기본 포인트색. 테마 창이 저장할 때 같이 저장돼 남아 있다
  render.migrateTheme = function (saved) {
    const src = saved || {};
    const out = Object.assign({}, src);
    // 옛 기본 포인트색 그대로면 사용자가 고른 색이 아니다 — 버려서 새 기본값(DEFAULT_THEME.accent)을 쓴다
    if (typeof out.accent === 'string' && out.accent.toLowerCase() === render.LEGACY_ACCENT) delete out.accent;
    Object.keys(render.LEGACY_DEFAULTS).forEach(function (k) {
      const to = render.BAND_TO_MIX[k];
      if (k === to) return;                       // gray는 키 이름이 같아 그대로 이어진다
      delete out[k];                              // 옛 키는 남기지 않는다
      const v = src[k];
      if (typeof v !== 'string' || src[to] !== undefined) return;   // 새 키가 이미 있으면 새 키가 이긴다
      if (v.toLowerCase() === render.LEGACY_DEFAULTS[k]) return;    // 옛 기본값 그대로 = 고른 색 아님
      out[to] = v;
    });
    return out;
  };

  render.currentTheme = function () {
    return Object.assign({}, render.DEFAULT_THEME, render.migrateTheme(store.loadTheme()));
  };

  render.INACTIVE_FILL = '#c3cad9';   // 준비중 지역 — 진한 라벨이 읽히도록 밝은 중립색

  // 저장된 테마를 팔레트 객체와 CSS 변수에 반영. app.init 1회 + 설정 저장 시마다 호출.
  render.applyTheme = function () {
    const t = render.currentTheme();
    render.MAP_KEYS.forEach(function (k) { render.MAP_COLORS[k] = t[k]; });
    if (typeof document !== 'undefined' && document.documentElement) {
      const s = document.documentElement.style;
      s.setProperty('--accent-color', t.accent);
      s.setProperty('--ripple-duration', t.rippleDuration + 's');
    }
    render.drawLegend();   // 색을 바꾸면 범례도 같이 바뀌어야 한다
    render._watchLegend();
    return t;
  };

  // 범례를 실제 테마 색으로 그린다. 이전엔 🔴🟠🟡 이모지가 하드코딩돼 있어
  // 색을 바꿔도 범례만 옛 색으로 남는 문제가 있었다.
  // 예상 공고현황(2026-11-25, 메인 확정 D1): 색 = 면의 '가장 이른 예상' 기관이 든 구간(전국·드릴인 같은 말). 테마 키·색 값은 그대로, 이름만 바꾼다.
  // 'none'(공고 전 기관 0곳)은 테마 키가 아니라 고정색이다 — 바탕과 거의 같은 옅은 색이라 '비어 있음'으로 물러나 보이고, 경계선이 면을 구분한다.
  render.NONE_FILL = '#eef1f5';
  render.LEGEND_TITLE = '예상 공고 시기 — 지역 색은 가장 이른 예상 기관';
  render.LEGEND_ITEMS = [
    ['r3','3개월 안'], ['r2','3~6개월'], ['p','6개월~1년'], ['b2','1~2년'], ['b3','2년 뒤'],
    ['gray','예상 근거 없음'], ['none','공고 전 기관 없음'],
  ];
  render.MIX_NAME = { r3:'3개월 안', r2:'3~6개월', p:'6개월~1년', b2:'1~2년', b3:'2년 뒤', gray:'예상 근거 없음', none:'공고 전 기관 없음' };
  // 색은 localStorage(테마)에서 오므로 style 속성에 그대로 끼우지 않고 hex만 통과시킨다.
  render._safeColor = function (c, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fallback;
  };
  // 범례가 지도 판 아래 띠로 붙어(11-16) 범례 높이가 바뀌면 지도 그림 높이도 바뀐다 — 첫 렌더 뒤 범례 내용이 늘면
  // 지도 아래쪽이 잘리므로, 높이가 바뀔 때 지금 보이는 지도를 한 번 다시 맞춘다(선택 강조는 유지).
  render._watchLegend = function () {
    if (render._legendRO || typeof ResizeObserver === 'undefined' || typeof document === 'undefined') return;
    const el = document.getElementById('legend'); if (!el) return;
    let lastH = el.offsetHeight, t = null;
    render._legendSyncH = function () { lastH = el.offsetHeight; };   // _legendFor가 범례를 바꾼 직후 호출 — 같은 높이 변화로 지도를 또 그리지 않게
    render._legendRO = new ResizeObserver(function () {
      const h = el.offsetHeight; if (h === lastH) return; lastH = h;
      clearTimeout(t);
      t = setTimeout(render.redrawKeepSel, 80);
    });
    render._legendRO.observe(el);
  };
  // 지금 보이는 지도(전국/드릴인)를 다시 그리고 고른 기관 강조를 되살린다 — 범례 높이 변화·드릴인 중 창 폭 변화(overdue.js)가 쓴다.
  render.redrawKeepSel = function () {
    const sel = render._selectedName, selG = render._selectedGroup;
    if (render.state.currentRegion) render.drawRegion(render.state.currentRegion); else render.drawNational();
    if (sel) { const rec = render.allInstitutions().filter(function (r) { return r.name === sel; })[0]; if (rec) render.selectInstitution(rec); }
    else if (selG) render.selectGroup(selG, { quiet: true, noScroll: true });   // 묶음 선택도 이어서(알림은 다시 읽지 않고, 목록은 튀지 않게 스크롤하지 않는다)
  };
  render.drawLegend = function (mode) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('legend'); if (!el) return;
    // mode: 'drill'(시군구 드릴인) | 'national'. 생략하면 지금 보는 지도(state.currentRegion)를 따른다.
    const drill = mode ? mode === 'drill' : !!render.state.currentRegion;
    // 라벨 글자도 해당 구간색으로 — 범례 스스로 색 의미론을 말한다(마감 리뷰 반영).
    // 밝은 바탕에서는 파스텔 면색 그대로가 작은 글자에 옅어서, 글자용으로만 본문색(--fg)을 절반 섞어 어둡게 한다. 'none'은 너무 옅어 글자는 본문색 그대로.
    const rows = render.LEGEND_ITEMS.map(function (it) {
      const none = it[0] === 'none';
      const c = none ? render.NONE_FILL : render._safeColor(render.MAP_COLORS[it[0]], render.DEFAULT_THEME[it[0]]);
      const warn = it[0] === 'gray' ? ' ' + render.ICONS.warn : '';
      const tc = none ? 'var(--fg)' : 'color-mix(in srgb, ' + c + ' 50%, var(--fg))';
      return '<span class="lg-item" style="color:' + tc + '">' +
        '<i class="lg-sw" style="background:' + c + '"></i>' + logic.esc(it[1]) + warn + '</span>';
    });
    rows.push('<span class="lg-item"><i class="lg-sw lg-hatch" style="background:' +
      render._safeColor(render.INACTIVE_FILL, '#c3cad9') + '"></i>조사 전</span>');
    if (drill) {
      // 드릴인에만 카드 줄이 있다. 전국 범례에는 이 줄이 없다.
      rows.push('<span class="lg-item lg-tri-row"><i class="lg-card" aria-hidden="true"></i>카드: 시군구별 예상 시기 건수 — 3개월 안·3~6개월·6개월~1년·근거 없음(켠 종류 모두)</span>');
    }
    el.innerHTML = '<div class="lg-title">' + logic.esc(render.LEGEND_TITLE) + '</div>' + rows.join('');
  };
  // 지도를 그리기 전에 범례를 먼저 바꾼다(범례 높이가 지도 높이를 정한다). 바꾼 높이는 감시자에게 알려 지도를 또 그리지 않게 한다.
  render._legendFor = function (mode) {
    render.drawLegend(mode);
    if (render._legendSyncH) render._legendSyncH();
  };
  render.applyTheme();

  render.baseInstitutions = function () { return store.loadData() || window.institutions || []; };
  // 지자체 외 기관(교육청·법원·공공기관·지방공기업·대학·병원, data/institutions_nonmuni.js)을 지도·현황판 목록에 합친다.
  // 개원 예정 법원은 아직 금고 입찰 대상이 아니라 뺀다. base에 같은 region|name이 이미 있으면 base 칸이 덮고
  // 번들 칸(은행·약정 만료·확정·opStatus 등)은 보존한다 — 서버(029, 415행)가 지자체 외 최소행을 주기 때문.
  // 개원 예정 필터는 합친 뒤에 건다 — DB에서 온 개원 예정 법원은 opStatus를 번들에서 받아야 걸러진다.
  // baseInstitutions는 그대로 둔다 — 기관 추가(app.openAdd)가 이 목록을 저장하므로 합친 168곳이 저장소에 복제되지 않게.
  render._nonMuniRaw = function () {
    const g = (typeof window !== 'undefined') ? window : root;
    return (g && Array.isArray(g.institutionsNonMuni)) ? g.institutionsNonMuni : [];
  };
  render.nonMuniInstitutions = function () {
    return render._nonMuniRaw().filter(function (r) { return !logic.isOpeningCourt(r); });
  };
  render.allInstitutions = function () {
    const merged = logic.overlayExtras(render.baseInstitutions(), render._nonMuniRaw());
    return store.applyEdits(merged.filter(function (r) { return !logic.isOpeningCourt(r); }));
  };
  render.institutionsByRegion = function (code) {
    return render.allInstitutions().filter(function (r) { return r.region === code; });
  };

  // ── 지역 색 섞기(NEXT 78, C안) ─────────────────────────────────────────────────
  // 켠 종류의 기관을 모두 섞는다. '켠 종류' 판단은 랭킹과 같은 _rankTypeVisible(지자체는 항상 포함 —
  // 끄면 면을 지우지 않고 흐리게만 한다는 기존 규칙). 같은 기관이 일반구 폴리곤마다 반복 등록되므로
  // 기관 단위로 중복을 먼저 뺀다(수원 4구 등이 건수를 부풀리지 않게).
  render.mixInfo = function (list) {
    return logic.regionMix(logic.dedupeByInstitution(list), render.state.today);
  };
  render.regionMixInfo = function (code) {
    return render.mixInfo(render.institutionsByRegion(code).filter(function (r) { return render._rankTypeVisible(r); }));
  };
  // 지도 정보 → 면 색. 공고 전 기관 0곳('none')은 고정색(NONE_FILL), 예상 근거 없음('gray')은 테마 회색.
  render.mixColor = function (info) {
    if (info && info.band === 'none') return render.NONE_FILL;
    const k = (info && render.MAP_COLORS[info.band] !== undefined) ? info.band : 'gray';
    return render._safeColor(render.MAP_COLORS[k], render.DEFAULT_THEME[k]);
  };
  render.regionUrgencyColor = function (code) {
    return render.mixColor(render.regionMixInfo(code));
  };

  // 도넛(경기)·군도(인천)라 면적가중 중심이 엉뚱한 곳에 찍히는 지역만 앵커를 직접 지정.
  // 나머지는 path.centroid를 그대로 쓰고, 남는 겹침은 _separateLabels가 자동으로 민다.
  render.LABEL_ANCHOR = {
    '41': [127.45, 37.35],   // 경기: 서울을 감싸 중심이 서울 위로 올라옴 → 동쪽 두꺼운 쪽
    '28': [126.60, 37.45],   // 인천: 서해 섬들이 중심을 바다로 끌어당김 → 본토 쪽
  };
  render.labelAnchor = function (feature, path, proj) {
    const a = render.LABEL_ANCHOR[feature.properties.code];
    return a ? proj(a) : path.centroid(feature);
  };

  // 라벨을 다 그린 뒤 실제 bbox로 겹침을 찾아 세로로 밀어낸다(계산은 logic.separateLabelsY).
  render._separateLabels = function (labels) {
    const nodes = labels.nodes();
    if (!nodes.length) return;
    const boxes = nodes.map(function (n) {
      const b = n.getBBox();
      return { x: Number(n.getAttribute('data-x')), y: Number(n.getAttribute('data-y')),
               w: b.width, h: b.height };
    });
    const dy = logic.separateLabelsY(boxes, 2, 3);
    nodes.forEach(function (n, i) {
      if (!dy[i]) return;
      n.setAttribute('transform', 'translate(' + boxes[i].x + ',' + (boxes[i].y + dy[i]) + ')');
    });
  };

  // 드릴인 연출: 선택 지역만 남기고 나머지 면·라벨을 흐리게.
  // drawNational이 opacity를 인라인 style로 주므로 클래스로는 못 이긴다 — 같은 인라인을 덮어쓴다.
  render.focusRegion = function (code) {
    const svg = d3.select('#map-svg');
    svg.selectAll('path.region').style('opacity', function (d) {
      return d.properties.code === code ? 1 : 0.15;
    });
    svg.selectAll('text.label').style('opacity', function (d) {
      return d.properties.code === code ? 1 : 0.15;
    });
  };

  render.ZOOM_MS = 750;   // flyZoomTo transition 길이
  render.HOLD_MS = 200;   // 확대가 끝난 뒤 "살짝 멈춤" — 이후 상세 지도로 전환

  render.drawNational = function () {
    var rp = document.getElementById('rank-panel'); if (rp) rp.style.display='none';
    render._legendFor('national');   // 드릴인에서 돌아오면 전국 범례로 되돌린다(폭·높이를 재기 전에)
    render.paintMapHead();           // 켠 종류를 바꿔 다시 그릴 때 머리 줄 안내(공고 전 기관 0곳)도 맞춘다
    const svg = d3.select('#map-svg');
    svg.selectAll('*').remove();
    render._ensureDefs(svg);   // 준비중 지역 빗금(#hatch)용 — 이전엔 지역 뷰에서만 호출됐다
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = window.geoKorea;
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    const g = svg.append('g').attr('class', 'national-layer');
    render.hideRegionTip();
    render._kbDrill = false;   // 전국으로 돌아왔다 — 못 끝난 키보드 드릴인 표식을 버린다
    // 시도별 섞기 결과는 면 색·툴팁·aria가 함께 쓰므로 한 번만 계산한다.
    const mix = {};
    fc.features.forEach(function (d) {
      const code = d.properties.code;
      if (render.state.activeRegions.has(code)) mix[code] = render.regionMixInfo(code);
    });

    const regionPaths = g.selectAll('path.region').data(fc.features).join('path')
      .attr('class', 'region').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('fill', function (d) {
        const code = d.properties.code;
        // 준비중은 밝은 중립색 — 균일한 진한 라벨이 읽히려면 면이 밝아야 한다.
        return mix[code] ? render.mixColor(mix[code]) : render.INACTIVE_FILL;
      })
      // 키보드·스크린리더: 눌러서 들어갈 수 있는 지역(경계가 있음)만 Tab으로 닿고 button(Enter·Space=드릴인).
      // 경계가 없는 지역(세종·제주)은 눌러도 아무 일이 없으므로 tabindex를 주지 않는다(이름은 aria-label로 남는다).
      .attr('tabindex', function (d) { return mix[d.properties.code] && render.hasSubGeo(d.properties.code) ? 0 : null; })
      .attr('role', function (d) {
        return mix[d.properties.code] ? (render.hasSubGeo(d.properties.code) ? 'button' : 'img') : null;
      })
      .attr('aria-label', function (d) {
        const m = mix[d.properties.code];
        return m ? render.mixAriaLabel(d.properties.name, m) : d.properties.name + ', 조사 전';
      })
      .attr('stroke', '#6d7882').attr('stroke-width', 1)
      // 커서·클릭은 activeRegions가 아니라 hasSubGeo로 판단한다(위 주석 참조).
      .style('cursor', function (d){ return render.hasSubGeo(d.properties.code) ? 'pointer' : 'default'; })
      .style('opacity', 1)
      .on('click', function (ev, d) {
        if (!render.hasSubGeo(d.properties.code)) return;
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });
    // 지역 툴팁(마우스 올림·포커스) + Enter 드릴인. 준비중 지역은 툴팁이 없다.
    render.bindRegionTip(regionPaths.filter(function (d) { return !!mix[d.properties.code]; }),
      function (d) { return render.tipHtml(d.properties.name, mix[d.properties.code], render.state.today); },
      function (ev, d) {
        if (!render.hasSubGeo(d.properties.code)) return;
        render._kbDrill = true;   // 새 화면이 그려지면 포커스를 옮긴다(drawRegion 끝)
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });

    // 준비중 지역엔 빗금을 덧씌워 임박도 '미상'(평평한 회색)과 확실히 구분한다.
    g.selectAll('path.region-hatch')
      .data(fc.features.filter(function (d){ return !render.state.activeRegions.has(d.properties.code); }))
      .join('path')
      .attr('class', 'region-hatch').attr('d', path)
      .attr('fill', 'url(#hatch)').style('pointer-events', 'none').style('opacity', 0.35);

    // 선택·포커스 덮개 층 — 면 층과 라벨 층 사이(라벨이 링 위에 놓인다). 링은 render._ringSelect/_ringFocus가 채운다.
    g.append('g').attr('class', 'sel-ring-layer').attr('pointer-events', 'none');

    // 라벨: 지역명 한 줄 + (비활성일 때) 작은 '준비중' 둘째 줄. '공고 n' 둘째 줄은 없다(사용자 11-25).
    // 색은 CSS(.label)가 균일하게 정한다 — 지역마다 색을 달리하면 난잡해진다.
    const labels = g.selectAll('text.label').data(fc.features).join('text')
      .attr('class', 'label')
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none');  // 라벨이 폴리곤 클릭을 가로채지 않도록
    labels.each(function (d) {
      const t = d3.select(this);
      t.selectAll('*').remove();
      const p = render.labelAnchor(d, path, proj);
      t.attr('data-x', p[0]).attr('data-y', p[1])
        .attr('transform', 'translate(' + p[0] + ',' + p[1] + ')');
      const active = render.state.activeRegions.has(d.properties.code);
      t.append('tspan').attr('x', 0).attr('dy', render.labelDy(active)).text(d.properties.name);
      if (!active) t.append('tspan').attr('class', 'sub').attr('x', 0).attr('dy', '1.15em').text('조사 전');
    });
    render._separateLabels(labels);

    render.state.currentRegion = null;
    render._nationalProjection = proj; render._nationalG = g;

    // A1: 전국 지도 자유 팬/줌(스펙 ⑦-A). 휠 확대·축소 + 드래그 팬.
    render._zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', function (e) { g.attr('transform', e.transform); });
    svg.call(render._zoom);
    // drawNational 재호출(init/전국복귀) 시 내부 transform을 identity로 재동기화 —
    // 이전 flyZoomTo 잔존 transform이 새 레이어와 어긋나지 않게 보장(A4).
    svg.call(render._zoom.transform, d3.zoomIdentity);
  };

  // A2: 대상 시도 bounds로 750ms 지오메트릭 줌인("붕 떴다 내려앉는") — 순수 시각 연출.
  // 지역 뷰 전환 타이밍은 호출부(app.enterRegion)가 자체 타이머로 확정하므로,
  // 여기서는 transition 완료 콜백에 의존하지 않는다.
  render.flyZoomTo = function (feature) {
    const svg = d3.select('#map-svg');
    const proj = render._nationalProjection;
    if (!proj || !render._nationalG || !render._zoom) return;
    const path = d3.geoPath(proj);
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    let k = 0.9 / Math.max(dx / w, dy / h);
    if (!isFinite(k) || k < 1) k = 1;
    k = Math.min(k, 8); // scaleExtent 최댓값 이내로 클램프
    const tx = w / 2 - k * cx, ty = h / 2 - k * cy;
    svg.transition().duration(750)
      .call(render._zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  };

  render.REGION_GEO = { '11': function(){ return window.geoSeoul; }, '41': function(){ return window.geoGyeonggi; },
    '26': function(){ return window.geoBusan; }, '28': function(){ return window.geoIncheon; },
    '27': function(){ return window.geoDaegu; }, '30': function(){ return window.geoDaejeon; },
    '31': function(){ return window.geoUlsan; }, '42': function(){ return window.geoGangwon; },
    '43': function(){ return window.geoChungbuk; }, '44': function(){ return window.geoChungnam; },
    '45': function(){ return window.geoJeonbuk; }, '46': function(){ return window.geoJnGwangju; },
    '47': function(){ return window.geoGyeongbuk; }, '48': function(){ return window.geoGyeongnam; } };
  // '29'(광주)는 2026-07-01 전남광주통합특별시 출범으로 '46'에 병합됐다(geo/korea.js도 병합).
  render.REGION_NAME = { '11':'서울', '26':'부산', '27':'대구', '28':'인천',
    '30':'대전', '31':'울산', '36':'세종', '41':'경기', '42':'강원', '43':'충북',
    '44':'충남', '45':'전북', '46':'전남광주', '47':'경북', '48':'경남', '50':'제주' };

  // **면 색칠(activeRegions)과 드릴인 가능 여부는 다른 것이다.** v1에서는 활성 지역이
  // 서울·경기 둘뿐이라 우연히 일치했지만, 전국 확대(v2) 이후로는 17개 시·도가 전부
  // 색은 칠해지되 구/시군 경계 GeoJSON은 여전히 서울·경기에만 있다. 이 둘을 계속
  // 같은 조건으로 묶으면 나머지 15곳이 "눌리는데 오류 배너만 뜨는" 막다른 길이 된다.
  render.hasSubGeo = function (code) { return !!render.REGION_GEO[code]; };

  // 구/시군 면 하나에 해당하는 지자체 레코드들. subRegion 코드가 1순위,
  // 없으면 기관명↔폴리곤명 정규화 매칭('마포구청'→'마포구')으로 보완한다.
  render.municipalityForFeature = function (feature) {
    if (!feature || !feature.properties) return [];
    const muni = render.institutionsByRegion(render.state.currentRegion)
      .filter(function (r) { return r.type === '지자체'; });
    const code = feature.properties.code, name = feature.properties.name;
    const byCode = muni.filter(function (r) { return r.subRegion && r.subRegion === code; });
    if (byCode.length) return byCode;
    return muni.filter(function (r) { return logic.normalizeMuniName(r.name) === name; });
  };

  // 면 하나에 지자체 레코드가 여럿 걸릴 수 있다(같은 이름의 중복 레코드 등).
  // **면의 색을 정하는 레코드와 면을 눌렀을 때 잡히는 레코드는 같아야 한다** —
  // 다르면 색과 다른 기관이 선택돼 지도를 믿을 수 없게 된다. 그래서 두 곳이
  // 각자 정렬하지 않고 이 함수 하나를 공유한다.
  // 면 하나를 섞는 기관들: 지자체(municipalityForFeature) + 켠 다른 종류 중 구시군코드가 이 면인 기관.
  render.recordsForFeature = function (feature) {
    const hit = render.municipalityForFeature(feature);
    const code = feature && feature.properties && feature.properties.code;
    let extra = [];
    if (code && render.state.currentRegion) {
      extra = render.institutionsByRegion(render.state.currentRegion).filter(function (r) {
        return logic.kindOf(r.type) !== '지자체' && r.subRegion === code && render._rankTypeVisible(r);
      });
    }
    return logic.dedupeByInstitution(hit.concat(extra));
  };
  render.featureMixInfo = function (feature) {
    return logic.regionMix(render.recordsForFeature(feature), render.state.today);
  };

  // '가장 이른 예상' 기관 — 면 색·툴팁 첫 블록이 가리키는 기관(logic.earliestExpected). 근거 있는 기관이 없으면 null.
  render.imminentForFeature = function (feature) {
    return render.featureMixInfo(feature).imminent;   // 공고 중·경과 기관은 빼고 고른다
  };

  // **클릭으로 잡히는 기관**은 섞기와 별개다(팀 결정 2026-11-11): 그 구의 지자체가 먼저, 지자체가 없으면 가장 이른 예상 기관.
  // 지도에 없는 기관(공고 중·경과)은 고르지 않는다 — 면이 그 기관 때문에 눌리면 색·목록과 어긋난다. 근거 있는 기관이 없으면 첫 기관(눌러서 고를 수는 있다).
  render.recordForFeature = function (feature) {
    const today = render.state.today;
    const open = function (list) { return list.filter(function (r) { return logic.isPreNotice(r, today); }); };
    const pick = function (list) {
      const e = logic.earliestExpected(list, today, 1)[0];
      return e ? e.rec : list[0];
    };
    const muni = open(logic.dedupeByInstitution(render.municipalityForFeature(feature)));
    if (muni.length) return pick(muni);
    const hit = open(render.recordsForFeature(feature));
    return hit.length ? pick(hit) : null;
  };

  render.subUrgencyColor = function (feature) {
    return render.mixColor(render.featureMixInfo(feature));
  };

  // 라벨 첫 줄 dy: 활성 지역은 한 줄이라 0.35em(세로 가운데), 준비중은 둘째 줄이 붙으므로 0em으로 올려 두 줄 묶음을 가운데에 둔다.
  render.labelDy = function (active) { return active ? '0.35em' : '0em'; };
  // 스크린리더용 이름(색 이름 대신 구간 뜻). 예: "경상남도, 가장 이른 예상 3개월 안 창원시청 2026-12-14 약정주기 계산, 공고 전 기관 23건"
  render.mixAriaLabel = function (name, info) {
    const parts = [name], e = info.earliest && info.earliest[0];
    if (e) parts.push('가장 이른 예상 ' + render.MIX_NAME[info.band] + ' ' + e.rec.name + ' ' + e.date + ' ' + e.basis);
    else parts.push(render.MIX_NAME[info.band] || render.MIX_NAME.none);
    if (info.total > 0) parts.push('공고 전 기관 ' + info.total + '건');
    return parts.join(', ');
  };
  // 시군구 드릴인 면의 이름 — 카드와 같은 분류·순서(logic.subCardLines). 전국 면은 위 mixAriaLabel 그대로.
  // 예: "창원시 의창구, 가장 이른 예상 3개월 안, 3개월 안 1건, 6개월~1년 2건, 공고 전 기관 3건"
  render.mixAriaLabelCard = function (name, info) {
    const e = info.earliest && info.earliest[0];
    const parts = [name, e ? '가장 이른 예상 ' + render.MIX_NAME[info.band] : (render.MIX_NAME[info.band] || render.MIX_NAME.none)];
    logic.subCardLines(info).forEach(function (ln) { parts.push(ln.full + ' ' + ln.n + '건'); });
    if (info.total > 0) parts.push('공고 전 기관 ' + info.total + '건');
    return parts.join(', ');
  };

  // 지역 툴팁 문안(마우스 올림·포커스). 클릭 동작과는 무관하다. mode: 'drill'이면 시군구 드릴인(예상 시기 줄에서 1년 넘게를 합친다).
  // 규격 design-reviewer 2026-11-25 §5-3: 가장 이른 예상 최대 2곳(이름 + 날짜, 아래 줄에 근거 글) → 예상 시기 구간 → 공고 전 기관 수. 0건 줄은 숨긴다.
  render.tipHtml = function (name, info, today, mode) {
    const c = render.mixColor(info);
    let h = '<div class="rt-head"><b>' + esc(name) + '</b><i class="rt-sw" style="background:' + c + '"></i></div>';
    if (!info.listed) return h + '<div class="rt-mu">켠 종류의 기관이 없습니다</div>';
    if (!info.total) return h + '<div class="rt-mu">아직 공고 전인 기관이 없습니다</div>';
    function kv(label, n, cls) {
      return '<div class="rt-kv' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span>' +
        (n === null ? '' : '<span class="rt-n">' + n + '건</span>') + '</div>';
    }
    if (info.earliest.length) {
      h += '<div class="rt-first">' + kv('가장 이른 예상', null, 'rt-t');
      info.earliest.forEach(function (e) {
        h += '<div class="rt-it"><span class="rt-nm">' + esc(e.rec.name) + '</span><span class="rt-d">' + esc(e.date) + '</span></div>' +
          '<div class="rt-b">' + esc(e.basis) + '</div>';
      });
      h += '</div>';
    }
    h += '<div class="rt-sec">' + kv('예상 시기', null, 'rt-t');
    logic.tipBuckets(info, mode).forEach(function (b) { h += kv(b.label, b.n); });
    h += '</div>';
    h += '<div class="rt-sec rt-foot">' + kv('공고 전 기관', info.total) +
      (info.earliest.length ? '' : '<div class="rt-mu">지도 색을 정할 근거가 없어 회색입니다</div>') + '</div>';
    return h;
  };
  render.showRegionTip = function (html, x, y) {
    if (typeof document === 'undefined') return;
    let tip = document.getElementById('region-tip');
    if (!tip) {
      tip = document.createElement('div'); tip.id = 'region-tip'; tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.innerHTML = html; tip.style.display = 'block';
    render.moveRegionTip(x, y);
  };
  render.moveRegionTip = function (x, y) {
    const tip = typeof document !== 'undefined' && document.getElementById('region-tip');
    if (!tip || tip.style.display !== 'block') return;
    tip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - tip.offsetHeight - 8)) + 'px';
  };
  render.hideRegionTip = function () {
    const tip = typeof document !== 'undefined' && document.getElementById('region-tip');
    if (tip) tip.style.display = 'none';
  };
  render.isActivateKey = function (ev) { return !!ev && (ev.key === 'Enter' || ev.key === ' '); };
  // 면의 키 처리: Enter·Space가 클릭과 같은 동작. Space의 페이지 스크롤은 막고, 키를 누르고 있어도(repeat) 한 번만.
  // 동작했으면 true.
  render.regionKey = function (ev, d, enterFn) {
    if (!render.isActivateKey(ev) || !enterFn) return false;
    ev.preventDefault();
    if (ev.repeat) return false;
    render.hideRegionTip();
    enterFn(ev, d);
    return true;
  };
  // 면(path)에 툴팁·키보드 접근을 붙인다. htmlFn(d) → 문안, enterFn(ev, d) → Enter 동작(없으면 키 처리 안 함).
  render.bindRegionTip = function (sel, htmlFn, enterFn) {
    sel.on('mouseenter', function (ev, d) { render.showRegionTip(htmlFn(d), ev.clientX, ev.clientY); })
      .on('mousemove', function (ev) { render.moveRegionTip(ev.clientX, ev.clientY); })
      .on('mouseleave', function () { render.hideRegionTip(); })
      .on('focus', function (ev, d) {
        const r = this.getBoundingClientRect();
        render.showRegionTip(htmlFn(d), r.left + r.width / 2, r.top + r.height / 2);
        render._ringFocus(this);
      })
      .on('blur', function () { render.hideRegionTip(); render._ringBlur(); })
      .on('keydown', function (ev, d) { render.regionKey(ev, d, enterFn); });
  };

  // 지자체 체크박스 OFF → 면 색은 유지하고 흐리게(정보를 지우지 않고 뒤로 물림).
  render.muniDimOpacity = function () {
    return render.state.enabledTypes.has('지자체') ? 1 : 0.25;
  };
  render.applyMuniDimming = function () {
    // 전체 재렌더 대신 투명도만 갱신 — 재렌더하면 선택 중이던 강조가 사라진다.
    d3.select('#map-svg').selectAll('path.subregion').attr('fill-opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('g.sub-glyph').attr('opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('g.sub-card-layer').attr('opacity', render.muniDimOpacity());
  };

  render.drawRegion = function (code) {
    var b = document.getElementById('geo-retry-banner'); if (b) b.remove();
    // 전국에서 새로 들어온 시군구면 목록 펼침 상태를 비운다(currentRegion은 drawNational이 null로 둔다). 필터·창 폭으로 같은 지역을 다시 그릴 때는 유지.
    const fresh = render.state.currentRegion !== code;
    if (fresh) render.state.rankOpen = new Set();
    // 다시 그리면 선택 강조는 이 함수 끝의 clearSelection이 푼다 — 선택 이름도 지금 비워야 drawRankingPanel의 highlightCard가 묶음을 자동으로 펼치지 않는다.
    // 선택을 이어야 하는 호출자(redrawKeepSel·app.js 종류 필터)는 이름을 미리 받아 두었다가 다시 고르고, 그때 selectInstitution→highlightCard가 묶음을 펼친다.
    render._selectedName = null;
    // 랭킹 패널을 먼저 펼쳐 레이아웃을 확정한 뒤 폭을 잰다 — 그렇지 않으면
    // 패널이 나중에 열리며 SVG가 줄어들어 지도가 확대·좌측 쏠림으로 그려진다.
    var rp0 = document.getElementById('rank-panel'); if (rp0) rp0.style.display = 'block';
    if (fresh && rp0) rp0.scrollTop = 0;   // 목록은 맨 위부터
    render._legendFor('drill');   // 범례 높이가 지도 높이를 정하므로 폭·높이를 재기 전에 드릴인용으로 바꾼다
    const svg = d3.select('#map-svg'); svg.selectAll('*').remove();
    // 드릴인에는 줌·팬이 없다 — 전국 지도의 d3.zoom이 남으면 휠·드래그가 지워진 전국 g의 숨은 상태만 바꾼다(design 11-24 이관 1).
    // drawNational이 svg.call(render._zoom)으로 다시 건다.
    svg.on('.zoom', null);
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = (render.REGION_GEO[code] || function(){ return {type:'FeatureCollection',features:[]}; })();
    render.state.currentRegion = code;
    const subMix = {};
    fc.features.forEach(function (d) { subMix[d.properties.code] = render.featureMixInfo(d); });
    // 지시선 카드: 카드를 달 면이 있고 판 폭이 넉넉(여백 열 2개 + 지도 240px)할 때만 좌우 여백 열(G)을 만든다.
    // 좁거나 카드 대상이 없으면 예전처럼 판 전체에 맞춘다.
    const S = logic.SUBCARD;
    const withCards = w >= 2 * S.G + 240 && fc.features.some(function (d) { return logic.subCardEligible(subMix[d.properties.code]); });
    const proj = withCards
      ? d3.geoMercator().fitExtent([[S.G, S.TOP_R], [w - S.G, h - S.BOT]], fc)
      : d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    const g = svg.append('g').attr('class', 'region-layer');
    render.hideRegionTip();
    const subPaths = g.selectAll('path.subregion').data(fc.features).join('path')
      .attr('class', 'subregion').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })  // 선택 강조 대상 조회용
      .attr('fill', function (d){ return render.mixColor(subMix[d.properties.code]); })
      // 기관이 걸린 면만 Tab으로 닿고 Enter로 고른다(클릭과 같은 동작).
      .attr('tabindex', function (d) { return subMix[d.properties.code].total ? 0 : null; })
      .attr('role', function (d) { return subMix[d.properties.code].total ? 'button' : null; })
      .attr('aria-label', function (d) { return render.mixAriaLabelCard(d.properties.name, subMix[d.properties.code]); })
      .attr('fill-opacity', render.muniDimOpacity())
      .attr('stroke', '#6d7882').attr('stroke-width', 1)
      // 지자체는 좌표가 없어 마커가 그려지지 않으므로(_blinkMunicipality 주석 참조)
      // **이 면이 유일한 클릭 대상**인데 여태 핸들러가 없었다 — 눌러도 아무 일이
      // 없었고, 카드→지도 방향만 동작했다.
      .style('cursor', function (d) {
        return render.municipalityForFeature(d).length ? 'pointer' : 'default';
      })
      .on('click', function (ev, d) { render.onSubregionClick(d, ev); });
    render.bindRegionTip(subPaths.filter(function (d) { return subMix[d.properties.code].total > 0; }),
      function (d) { return render.tipHtml(d.properties.name, subMix[d.properties.code], render.state.today, 'drill'); },
      function (ev, d) { render.onSubregionClick(d, ev); });
    // 선택·포커스 덮개 층 — 면 위, 글리프·마커 아래.
    g.append('g').attr('class', 'sel-ring-layer').attr('pointer-events', 'none');
    // 전국·드릴인 모두 ▲n 표시는 없다(전국은 사용자 11-25 제거) —분류별 곳 수는 좌우 여백 열의 지시선 카드(_drawSubCards, 마커 층 뒤)가 글로 말한다(사용자·design 11-24).
    // 날짜 미상 면 글리프 — 마커·랭킹 카드의 recordGlyph('⚠️')와 같은 시각 언어를 면에도 확장.
    // 레코드가 아예 없는 면은 대상이 아니다(표시할 기관 자체가 없으므로 회색만 유지).
    // 이모지 대신 필터 글리프(.fsw)와 같은 획 어휘의 삼각 경고를 직접 그린다(마감 리뷰 반영).
    // ⚠는 섞기 결과와 같은 판정: 기관이 걸렸는데 날짜 있는 기관이 0곳일 때(면이 회색일 때)만.
    const gw = g.selectAll('g.sub-glyph')
      .data(fc.features.filter(function (d) { return subMix[d.properties.code].band === 'gray'; }))
      .join('g').attr('class', 'sub-glyph')
      .attr('transform', function (d) {
        const p = path.centroid(d); return 'translate(' + p[0] + ',' + p[1] + ')';
      })
      .attr('opacity', render.muniDimOpacity())
      .attr('pointer-events', 'none');   // 클릭은 아래 폴리곤이 받아야 한다
    gw.selectAll('*').remove();
    gw.append('path').attr('d', 'M0,-4.5 L4.5,3.5 L-4.5,3.5 Z')
      .attr('fill', 'none').attr('stroke', '#1e2124')
      .attr('stroke-width', 1.3).attr('stroke-linejoin', 'round');
    gw.append('line').attr('x1', 0).attr('y1', -2).attr('x2', 0).attr('y2', 0.6)
      .attr('stroke', '#1e2124').attr('stroke-width', 1.3);
    gw.append('circle').attr('cx', 0).attr('cy', 2.1).attr('r', 0.7).attr('fill', '#1e2124');
    render._regionProjection = proj; render._regionPath = path; render._regionG = g;
    if (render.drawMarkers) render.drawMarkers(code); // Task 9
    if (withCards) render._drawSubCards(svg, fc, path, subMix, w, h);   // 층 순서: 면 → 링 → 마커 → 지시선·점 → 카드
    render.drawRankingPanel(code);
    render.syncWatch(code);   // 서버 모드: 내 관심을 받아 오면 목록을 다시 그린다(NEXT 117)
    render.clearSelection();
    // 키보드(Enter·Space)로 들어왔으면 포커스를 새 화면의 첫 면으로 — 눌렀던 면은 이미 사라졌다.
    if (render._kbDrill) {
      render._kbDrill = false;
      const first = document.querySelector('#map-svg path.subregion[tabindex]');
      if (first && first.focus) first.focus();
    }
  };

  // ── 시군구 지시선 카드 그리기(design-reviewer 2026-11-24_1544). 배치 계산은 logic.layoutSubCards(순수). ──
  // 카드는 aria-hidden·tabindex 없음(같은 내용은 면의 aria-label, Tab은 면이 받는다). 클릭은 면과 같은 onSubregionClick.
  render._drawSubCards = function (svg, fc, path, subMix, w, h) {
    const byCode = {}, items = [];
    fc.features.forEach(function (d) {
      byCode[d.properties.code] = d;
      const info = subMix[d.properties.code];
      if (!logic.subCardEligible(info)) return;
      const p = path.centroid(d);
      items.push({ code: d.properties.code, ax: p[0], ay: p[1], lines: logic.subCardLines(info).length,
        pri: [info.buckets.r3, info.buckets.r2, info.buckets.p, info.buckets.unknown] });
    });
    const lay = logic.layoutSubCards(items, w, h);
    const layer = svg.append('g').attr('class', 'sub-card-layer').attr('opacity', render.muniDimOpacity());
    const leaders = layer.append('g').attr('class', 'sc-leaders');   // 선·점을 먼저 깔고 카드가 그 위에
    const cards = layer.append('g').attr('class', 'sc-cards');
    const NAME_MAX = logic.SUBCARD.W - 9 - 6;
    lay.items.forEach(function (it) {
      const d = byCode[it.code], info = subMix[it.code];
      const pd = 'M' + it.pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L');
      const lg = leaders.append('g').attr('class', 'sub-leader').attr('data-code', it.code);
      lg.append('path').attr('class', 'sl-under').attr('d', pd);    // 흰 3px 아래 + 잉크 1px 위(무채색 두 겹)
      lg.append('path').attr('class', 'sl-over').attr('d', pd);
      if (info.band !== 'gray') lg.append('circle').attr('class', 'sl-dot').attr('cx', it.ax).attr('cy', it.ay).attr('r', 2.5);   // 회색 면은 같은 자리의 ⚠ 글리프를 덮지 않게 점을 뺀다(qa 11-24 P3-3)
      const cg = cards.append('g').attr('class', 'sub-card').attr('data-code', it.code).attr('aria-hidden', 'true')
        .attr('transform', 'translate(' + it.x + ',' + it.y + ')')
        .on('mouseenter', function () { render._cardHover(it.code, true); })
        .on('mouseleave', function () { render._cardHover(it.code, false); })
        .on('click', function (ev) { render.onSubregionClick(d, ev); });
      cg.append('rect').attr('class', 'sc-box').attr('width', it.w).attr('height', it.h).attr('rx', 2);
      cg.append('rect').attr('class', 'sc-band').attr('width', 3).attr('height', it.h).attr('fill', render.mixColor(info));
      const nm = cg.append('text').attr('class', 'sc-name').attr('x', 9).attr('y', 15).text(d.properties.name);
      try {   // 긴 이름(예: 창원시 마산합포구)은 카드 안에 맞춘다
        const n = nm.node();
        if (n && n.getComputedTextLength && n.getComputedTextLength() > NAME_MAX) {
          n.setAttribute('textLength', NAME_MAX); n.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      } catch (e) { /* 측정 못 하면 그대로 */ }
      logic.subCardLines(info).forEach(function (ln, i) {
        const y = 30 + 15 * i, cls = (ln.muted ? ' muted' : '') + (ln.strong ? ' strong' : '');
        cg.append('text').attr('class', 'sc-k' + cls).attr('x', 9).attr('y', y).text(ln.label);
        cg.append('text').attr('class', 'sc-n' + cls).attr('x', 114).attr('y', y).attr('text-anchor', 'end').text(ln.n + '건');
      });
    });
    // 카드 자리가 모자라 뺀 면 수 — 열 맨 아래 안내(면은 올리면 툴팁이 뜬다)
    ['left', 'right'].forEach(function (side) {
      const n = lay.notes[side]; if (!n) return;
      const t = cards.append('text').attr('class', 'sc-note').attr('x', n.x + 2).attr('y', n.y + 11);
      ['카드 밖 면 ' + n.count + '개', '마우스를 올리면', '보입니다'].forEach(function (s, i) {
        t.append('tspan').attr('x', n.x + 2).attr('dy', i ? 15 : 0).text(s);
      });
    });
    // 면 ↔ 카드 서로 강조(마우스·키보드 포커스). 툴팁(bindRegionTip)과 이벤트 이름이 달라(.card) 서로 덮지 않는다.
    const has = {}; lay.items.forEach(function (it) { has[it.code] = true; });
    svg.selectAll('path.subregion').filter(function (d) { return has[d.properties.code]; })
      .on('mouseenter.card', function (ev, d) { render._cardHover(d.properties.code, true); })
      .on('mouseleave.card', function (ev, d) { render._cardHover(d.properties.code, false); })
      .on('focus.card', function (ev, d) {
        let vis = true; try { vis = this.matches(':focus-visible'); } catch (e) { vis = true; }
        if (vis) render._cardHover(d.properties.code, true);
      })
      .on('blur.card', function (ev, d) { render._cardHover(d.properties.code, false); });
  };
  render._cardHover = function (code, on) {
    d3.select('#map-svg').selectAll('g.sub-card, g.sub-leader, path.subregion')
      .filter(function () { return this.getAttribute('data-code') === code; })
      .classed('hl', !!on);
  };
  // 선택된 면(.selected)의 카드에 .selected를 맞춘다 — 선택 = 포인트색 2px. 해제는 clearSelection.
  render._cardSelect = function () {
    if (typeof d3 === 'undefined') return;
    const svg = d3.select('#map-svg'), codes = [];
    svg.selectAll('path.subregion.selected').each(function () { codes.push(this.getAttribute('data-code')); });
    svg.selectAll('g.sub-card').classed('selected', function () { return codes.indexOf(this.getAttribute('data-code')) >= 0; });
  };

  render.loadRegionGeoWithRetry = function (code, done, fail) {
    const getGeo = render.REGION_GEO[code]; const name = render.REGION_NAME[code] || code;
    const overlay = document.getElementById('cloud-overlay');
    function attempt(n) {
      const fc = getGeo && getGeo();
      if (fc && fc.features && fc.features.length) { done(fc); return; }
      const stage = document.getElementById('map-stage');
      const msg = n === 0 ? (name + '지역을 불러오는 중입니다…') : '준비중…';
      let banner = document.getElementById('geo-retry-banner');
      if (!banner) { banner = document.createElement('div'); banner.id = 'geo-retry-banner';
        banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--fg);'; stage.appendChild(banner); }
      banner.textContent = msg;
      if (n < 2) { setTimeout(function(){ attempt(n + 1); }, 600); }
      else {
        banner.innerHTML = logic.esc(name) + '지역 정보를 다시 확인해주세요. <button id="geo-retry-btn">다시 시도</button>';
        document.getElementById('geo-retry-btn').onclick = function () { banner.remove(); render.loadRegionGeoWithRetry(code, done, fail); };
        if (fail) fail();
      }
    }
    attempt(0);
  };

  render._ensureDefs = function (svg) {
    if (svg.select('#hatch').size()) return;
    const p = svg.append('defs').append('pattern').attr('id','hatch')
      .attr('width',4).attr('height',4).attr('patternUnits','userSpaceOnUse')
      .attr('patternTransform','rotate(45)');
    p.append('rect').attr('width',4).attr('height',4).attr('fill','transparent');
    p.append('line').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',4).attr('stroke','#0f1420').attr('stroke-width',2);
  };

  render._shapePath = function (shape, s) { // s=반지름/반폭
    if (shape === 'square') return 'M' + (-s) + ',' + (-s) + ' h' + (2*s) + ' v' + (2*s) + ' h' + (-2*s) + ' Z';
    if (shape === 'triangle') return 'M0,' + (-s) + ' L' + s + ',' + s + ' L' + (-s) + ',' + s + ' Z';
    if (shape === 'diamond') return 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z';
    if (shape === 'pentagon') { // 대학교 — 기존 4종과 겹치지 않는 정오각형
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        pts.push((s * Math.cos(a)).toFixed(2) + ',' + (s * Math.sin(a)).toFixed(2));
      }
      return 'M' + pts.join(' L') + ' Z';
    }
    if (shape === 'bar') return 'M' + (-9) + ',' + (-5) + ' h18 v10 h-18 Z'; // 종류를 모르는 유형 — 가로 막대(◆는 법원뿐)
    return ''; // circle은 <circle>로 별도
  };

  render.drawMarkers = function (code) {
    const svg = d3.select('#map-svg'); render._ensureDefs(svg);
    const proj = render._regionProjection; if (!proj) return;
    const list = render.institutionsByRegion(code);
    // 지도에는 공고 전 기관만 올린다(공고 중·예정일 경과는 입찰 공고 현황이 맡는다 — 2026-11-25 예상 공고현황, 면 색·목록과 같은 판정 logic.isPreNotice).
    const markers = logic.visibleMarkers(list, render.state.enabledTypes)
      .filter(function (r){ return logic.isPreNotice(r, render.state.today); })
      .filter(function (r){ return typeof r.lng === 'number' && !isNaN(r.lng) && typeof r.lat === 'number' && !isNaN(r.lat); });

    let layer = svg.select('g.marker-layer');
    if (!layer.size()) layer = svg.append('g').attr('class','marker-layer');
    layer.selectAll('*').remove();

    // 밀집 클러스터: 동일 좌표 반올림 셀에 8개+면 뱃지
    const cells = {};
    markers.forEach(function (r){ const p = proj([r.lng, r.lat]); const key = Math.round(p[0]/24)+'_'+Math.round(p[1]/24);
      (cells[key] = cells[key] || []).push({ r:r, p:p }); });

    Object.keys(cells).forEach(function (key) {
      const grp = cells[key];
      if (grp.length >= 8) {
        const p = grp[0].p;
        const g = layer.append('g').attr('class','cluster').attr('transform','translate('+p[0]+','+p[1]+')');
        // 두 월드 전 잔재색 재도색(2026-08-14) — 현행 토큰(panel-raised/ink)으로.
        g.append('circle').attr('r',14).attr('fill','#1a2029').attr('stroke','#e2e7ee');
        g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('fill','#e2e7ee').attr('font-size',12).text(grp.length);
        return;
      }
      grp.forEach(function (item) {
        const r = item.r, p = item.p, shape = logic.markerShape(logic.kindOf(r.type));
        const color = render.markerColor(logic.urgencyOf(r, render.state.today));
        const glyph = logic.recordGlyph(r);
        const g = layer.append('g').attr('class','marker').attr('data-name', r.name).attr('transform','translate('+p[0]+','+p[1]+')');
        const hatched = logic.effectiveBid(r).confidence === '추측';
        if (shape === 'circle') {
          g.append('circle').attr('r',8).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('circle').attr('r',8).attr('fill','url(#hatch)');
        } else {
          g.append('path').attr('d', render._shapePath(shape,8)).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('path').attr('d', render._shapePath(shape,8)).attr('fill','url(#hatch)');
        }
        if (glyph === '!') {
          g.append('text').attr('text-anchor','middle').attr('dy','0.35em')
            .attr('fill','#fff').attr('font-weight','bold').attr('font-size',10).text(glyph);
        } else if (glyph) {  // '⚠️'(날짜 미상) — 이모지 대신 획 어휘로 그린 경고 삼각
          g.append('path').attr('d','M0,-3.8 L3.8,3 L-3.8,3 Z')
            .attr('fill','none').attr('stroke','#10151d')
            .attr('stroke-width',1.2).attr('stroke-linejoin','round');
          g.append('line').attr('x1',0).attr('y1',-1.7).attr('x2',0).attr('y2',0.5)
            .attr('stroke','#10151d').attr('stroke-width',1.2);
          g.append('circle').attr('cx',0).attr('cy',1.9).attr('r',0.6).attr('fill','#10151d');
        }
        g.style('cursor','pointer').on('click', function () { if (render.onMarkerClick) render.onMarkerClick(r); });
        if (glyph === '!') console.warn('무결성 문제 레코드:', r.name, logic.validateRecord(r).missing);
      });
    });
  };

  // 화면 머리 줄(#ticker-strip) — 제목·안내 기본 글은 index.html 마크업이고, 여기서는 기준일·안내 문구·이동 단추만 맞춘다.
  // 임박 TOP5·'공고 중 n' 칩·굴림 연출·경과 토글은 없어졌다(2026-11-25 예상 공고현황). 이름과 호출 형태는 그대로 —
  // app.js·workflow.js가 데이터가 바뀔 때마다 이 함수를 부른다(수정 금지 파일이라 호출 자리를 옮기지 않는다).
  render.MAP_LEDE = '아직 공고 전인 기관의 예상 시기입니다. 지난 입찰일·약정 만료일로 계산했고 실제 공고일과 다를 수 있습니다.';
  render.MAP_LEDE_EMPTY = '켠 종류에 아직 공고 전인 기관이 없습니다. 기관 분류선택에서 종류를 켜 보세요.';
  // 입찰 공고 현황 메뉴가 지금 사용자에게 보이는가(영업 계열 밖에는 없다) — 없으면 이동 단추를 숨긴다.
  render.noticeMenuOn = function () {
    const A = root.app, N = root.nav;
    return !!(A && A.findNavItem && N && N.NOTICE_ID && A.findNavItem(N.NOTICE_ID));
  };
  render.openNoticePage = function () {
    const A = root.app, N = root.nav;
    if (A && A.openNavItem && N && N.NOTICE_ID) A.openNavItem(N.NOTICE_ID);   // 기본 탭 '다가오는 입찰'
  };
  // 지도에 오르는 기관 수(켠 종류·활성 지역·공고 전, 기관 단위).
  render.mapPoolCount = function () {
    const list = render.allInstitutions().filter(function (r) {
      return render.state.activeRegions.has(r.region) && render._rankTypeVisible(r) && logic.isPreNotice(r, render.state.today);
    });
    return logic.dedupeByInstitution(list).length;
  };
  render.paintMapHead = function () {
    if (typeof document === 'undefined') return;
    const asof = document.getElementById('map-asof');
    if (asof) asof.textContent = '기준 ' + logic.localDateStr(render.state.today);
    const lede = document.getElementById('map-lede');
    if (lede) lede.textContent = render.mapPoolCount() ? render.MAP_LEDE : render.MAP_LEDE_EMPTY;
    const out = document.getElementById('map-out');
    if (out) out.hidden = !render.noticeMenuOn();
    const btn = document.getElementById('map-to-notice');
    if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', render.openNoticePage); }
  };
  render.drawTicker = function () {
    render.paintMapHead();
    // 경과 건수·사이드바 미처리 배지·로그인 팝업 건수는 같은 데이터에서 나오므로 데이터가 바뀔 때마다 함께 갱신한다(overdue.js).
    if (root.overdue && root.overdue.refresh) root.overdue.refresh();
  };
  // app.js:1216이 부른다 — 굴림 연출이 없어져 할 일이 없다(빈 함수로 남김. app.js 담당 세션이 호출을 지우면 이 줄도 지운다).
  render.startTickerSync = function () {};

  render.highlightMarker = function (name, on) {
    d3.select('#map-svg').selectAll('g.marker').classed('hi', function () {
      return on && this.getAttribute('data-name') === name;
    });
  };
  render.highlightCard = function (name, on) {
    document.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name !== name) return;
      c.classList.toggle('hi', on);
      if (on) render._revealCard(c);   // 1년 이상 남은 접힌 행이면 그 묶음을 먼저 펼친다(티커·검색·면 클릭 공통)
    });
  };
  render._revealCard = function (c) {
    const rest = c.closest ? c.closest('.rk-rest') : null;
    if (!rest || !rest.hidden) return;
    const sec = rest.closest('.rk-grp');
    render._setGroupOpen(sec ? sec.dataset.code : '', true);
  };

  // ── 내 관심 기관(NEXT 117) — 서버 모드는 서버가 정본, 로컬은 localStorage ──────────
  render.env = { fetch: null };   // 시험이 가짜 fetch를 꽂는다
  render.WATCH = { screen: 'map_popover', button: 'toggle_watch_heart' };
  render.watch = { st: 'idle', mine: new Set() };   // st: idle|ready|failed
  render._watchBusy = {};
  function getFetch() { return render.env.fetch || (typeof fetch === 'function' ? fetch : null); }
  function wreq(method, url, button, body) {
    const f = getFetch();
    if (!f) return Promise.resolve({ status: 0, body: null });
    const init = { method: method };
    if (button) init.headers = { 'Content-Type': 'application/json', 'X-Screen-Id': render.WATCH.screen, 'X-Button-Id': button };
    if (body !== undefined) init.body = JSON.stringify(body);
    return f(url, init).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, body: j }; }); },
      function () { return { status: 0, body: null }; });
  }
  render.watchOn = function () { return !!store.isServerMode(); };
  render.hearted = function (r) {
    return render.watchOn() ? render.watch.mine.has(String(r.institutionId)) : store.isInterested(r.name);
  };
  // 목록을 그린 뒤 부른다. 성공하면 지금 그 지역이 열려 있을 때만 목록을 다시 그린다.
  render.syncWatch = function (code) {
    if (!render.watchOn() || !getFetch()) return Promise.resolve(false);
    return wreq('GET', '/my-watch').then(function (res) {
      if (res.status !== 200) { render.watch = { st: 'failed', mine: new Set() }; return false; }
      render.watch = Object.assign({ st: 'ready' }, logic.watchIndex(res.body));
      if (code != null && render.state.currentRegion === code && typeof document !== 'undefined') render.drawRankingPanel(code);
      return true;
    });
  };
  // ♥ 한 번 = 요청 한 번(낙관적 갱신 없음). → Promise<{ok, message}>
  render.toggleWatch = function (r, code) {
    const id = r && r.institutionId != null ? String(r.institutionId) : '';
    if (!id) return Promise.resolve({ ok: false, message: '서버에 등록되지 않은 기관이라 관심에 담을 수 없습니다.' });
    if (render._watchBusy[id]) return Promise.resolve({ ok: true, message: '', skipped: true });
    render._watchBusy[id] = true;
    const on = render.watch.mine.has(id), op = on ? 'delete' : 'put';
    const url = '/institutions/' + encodeURIComponent(id) + '/my-watch';
    return wreq(on ? 'DELETE' : 'PUT', url, render.WATCH.button, on ? undefined : {}).then(function (res) {
      const o = logic.watchOutcome(res.status, res.body, op);
      if (!o.ok) return o;
      return render.syncWatch(code).then(function () { return o; });
    }).then(function (o) { delete render._watchBusy[id]; return o; },
      function () { delete render._watchBusy[id]; return { ok: false, message: logic.watchOutcome(0, null, op).message }; });
  };
  // 실패 알림 한 줄 — 카드 바로 아래, role=status. 이전 알림은 지운다(목록을 다시 그리면 함께 사라진다).
  render._rkNote = function (card, msg) {
    const old = document.querySelector('#rank-list .rk-note'); if (old && old.remove) old.remove();
    const p = document.createElement('p'); p.className = 'rk-note'; p.setAttribute('role', 'status');
    card.parentNode.insertBefore(p, card.nextSibling);
    p.textContent = msg;   // 비어 있는 role=status에 글을 넣어야 읽어 준다
  };

  // 공고 전 기관만 — 지도와 같은 범위(공고 중·경과는 입찰 공고 현황). 빠진 수는 rankOutCount.
  render.rankedList = function (code) {
    const list = render.institutionsByRegion(code)
      .filter(function (r) { return render._rankTypeVisible(r) && logic.isPreNotice(r, render.state.today); });
    const sorted = render.state.rankSort === 'interest'
      ? logic.sortByInterest(list, render.state.today, function (r){ return render.hearted(r); })
      : logic.sortByUrgency(list, render.state.today);
    // 기관 단위 중복제거 — 일반구 복제 레코드(수원 4구 등)가 카드 4장을 차지하지 않게.
    // 티커(drawTicker)와 같은 규칙. 폴리곤 강조는 _blinkMunicipality가 전 폴리곤을 잡는다.
    return logic.dedupeByInstitution(sorted);
  };
  // 목록에서 빠진 기관(공고 중·예정일 경과) 수 — 같은 지역·켠 종류·기관 단위. 목록 끝 안내용.
  render.rankOutCount = function (code) {
    const all = logic.dedupeByInstitution(render.institutionsByRegion(code).filter(function (r) { return render._rankTypeVisible(r); }));
    return all.filter(function (r) { return !logic.isPreNotice(r, render.state.today); }).length;
  };
  // 랭킹·섞기 유형 필터: 지자체는 항상 포함(끄면 면을 흐리게만), 종류를 모르는 유형은 항상 표시, 그 외는 켠 종류(enabledTypes=종류 6종)만.
  render._rankTypeVisible = function (r) {
    const kind = logic.kindOf(r.type);
    if (kind === '지자체' || kind === null) return true;
    return render.state.enabledTypes.has(kind);
  };

  // 목록 둘째 줄 글: '지자체 · 2027-03-02 예상 · 약정주기 계산' / '지자체 · 예상 근거 없음'. 공고 중 기관은 이 목록에 오지 않지만
  // prep.test.js:718이 공고 줄을 못 박고 있어 그 갈래는 남긴다(prep 담당 세션이 정리하면 함께 지운다).
  render.rankLineText = function (r, today) {
    const head = (r.type == null ? '' : r.type) + ' · ';
    const nb = logic.noticeBrief(r, today);
    if (nb) return head + nb.line;
    const e = logic.effectiveBid(r);
    return head + (e.date ? e.date + ' 예상 · ' + logic.basisText(e) : logic.basisText(e));
  };
  render.drawRankingPanel = function (code) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    panel.style.display = 'block';
    // 헤더(정렬 토글) + 목록 컨테이너
    panel.innerHTML =
      '<div class="rank-head"><b>시군구별 기관</b>' +
      '<select id="rank-sort"><option value="urgency">이른 예상순</option><option value="interest">관심 먼저</option></select>' +
      '</div><p id="rank-status" class="sr-only" role="status"></p><div id="rank-list"></div>' +
      '<div style="margin-top:8px;"><button id="rank-more">더 보기 — 전체 입찰건</button></div>';
    document.getElementById('rank-sort').value = render.state.rankSort;
    document.getElementById('rank-sort').addEventListener('change', function (e) {
      render.state.rankSort = e.target.value; render.drawRankingPanel(code);
    });
    document.getElementById('rank-more').addEventListener('click', function () { render.openMoreModal(); });

    const listEl = document.getElementById('rank-list');
    // 행(.rank-card) 하나 — 묶음 안 기본 표시 행과 접힌 행이 같은 마크업·이벤트를 쓴다.
    function buildCard(r) {
      const card = document.createElement('div'); card.className = 'rank-card'; card.dataset.name = r.name;
      const glyph = logic.recordGlyph(r);
      const hearted = render.hearted(r);
      // 글리프: '⚠️'(날짜 미상)는 획 어휘 SVG로, '!'(무결성 문제)는 글자 그대로.
      const missHtml = glyph === '!' ? '<span class="miss">!</span>'
        : (glyph ? '<span class="miss">' + render.ICONS.warn + '</span>' : '');
      card.innerHTML = '<span class="heart" data-name="' + logic.esc(r.name) + '">' +
        (hearted ? render.ICONS.heartFill : render.ICONS.heartLine) + '</span>' +
        '<b>' + logic.esc(r.name) + '</b> ' + missHtml +
        '<br><small>' + logic.esc(render.rankLineText(r, render.state.today)) + '</small>';
      card.querySelector('.heart').addEventListener('click', function (e) {
        e.stopPropagation();
        if (!render.watchOn()) { store.toggleInterest(r.name); render.drawRankingPanel(code); return; }   // 로컬 모드 그대로
        render.toggleWatch(r, code).then(function (o) { if (!o.ok) render._rkNote(card, o.message); });
      });
      card.querySelector('.heart').addEventListener('dblclick', function (e) { e.stopPropagation(); });
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      // 한 번 누르면 지도에 표시(반짝), 두 번 누르면 기관 상세 팝업(사용자 11-16). 한 번 동작은 되풀이해도 결과가 같아
      // 더블클릭에서 click이 먼저 두 번 와도 지연 타이머 없이 충돌하지 않는다. 상세는 dblclick·Enter에서만 열린다.
      card.addEventListener('click', function () { render.showOnMap(r); });
      card.addEventListener('dblclick', function (ev) { ev.preventDefault(); render.showOnMap(r); render.openRecord(r, card, ev.clientX, ev.clientY); });
      card.addEventListener('focus', function () { render.showOnMap(r); });   // Tab으로 훑어도 지도에 표시된다
      card.title = '한 번 누르면 지도에 표시, 두 번 누르거나 Enter를 누르면 기관 상세';
      // 키보드로도 열 수 있다(NEXT 28 최소분): Tab으로 닿고 Enter·Space로 팝오버를 연다. ♥(하트)에서 올라온 키는 건너뛴다.
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', function (ev) {
        if (ev.target !== card || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        const rc = card.getBoundingClientRect();
        render.selectInstitution(r);
        render.openRecord(r, card, rc.left - 292, rc.top, { keyboard: true });
      });
      return card;
    }
    // 시군구 묶음(design-reviewer 2026-11-24_1839 6-B): 면과 같은 소속 규칙(rankGroupDefs) ∩ 지금 정렬의 목록.
    render._groups = logic.rankGroups(render.rankedList(code), render.rankGroupDefs(code), render.state.today);
    render._faceGroup = {};
    render._groups.forEach(function (g) { g.faceCodes.forEach(function (fc) { render._faceGroup[fc] = g.code; }); });
    render._groups.forEach(function (g) { listEl.appendChild(render._rkBuildGroup(g, buildCard)); });
    if (!render._groups.length) {   // 공고 전 기관이 없는 지역 — 빈 화면 대신 다음 걸음을 준다
      const em = document.createElement('div'); em.className = 'rk-empty';
      em.innerHTML = '<p>이 지역에는 아직 공고 전인 기관이 없습니다.</p>' +
        (render.noticeMenuOn() ? '<button type="button" class="link-btn" id="rk-to-notice">입찰 공고 현황</button>' : '');
      listEl.appendChild(em);
      const go = em.querySelector('#rk-to-notice'); if (go) go.addEventListener('click', render.openNoticePage);
    }
    const out = render.rankOutCount(code);
    if (out > 0) {
      const p = document.createElement('p'); p.className = 'rk-out';
      p.textContent = '공고가 났거나 예정일이 지난 ' + out + '곳은 입찰 공고 현황에서 봅니다.';
      listEl.appendChild(p);
    }
    const hd = panel.querySelector('.rank-head');
    if (hd) panel.style.setProperty('--rank-head-h', hd.offsetHeight + 'px');   // 묶음 머리가 .rank-head 바로 아래에 붙게
    // 목록을 새로 그리면 .hi가 사라지므로 현재 선택을 복원한다 —
    // ♥ 토글이 이 함수를 재호출하는데 그때 선택 강조가 엉뚱하게 풀리는 걸 막는다.
    if (render._selectedName) render.highlightCard(render._selectedName, true);
    // ♥·정렬로 다시 그려도 묶음 선택(.on)을 유지한다
    if (render._selectedGroup) { const on = render._rkGroupEl(panel, render._selectedGroup); if (on) { on.classList.add('on'); render._rkPressed(on, true); } }
  };
  // 묶음 머리 단추의 눌림 상태(aria-pressed)를 .on과 같이 맞춘다(design 11-24 P3-6)
  render._rkPressed = function (sec, on) {
    const b = sec && sec.querySelector ? sec.querySelector('.rk-gbtn') : null;
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  // 면(시군구) → 묶음 정의(logic.faceGroups + 소속 키). 소속은 recordsForFeature(카드 수를 낸 함수)와 같다 —
  // 그래서 묶음 머리 수 = 카드 수(일반구 합침은 합집합이라 예외). 지자체 레코드를 공유하는 면(수원 4구)은 한 묶음.
  render.rankGroupDefs = function (code) {
    const fc = (render.REGION_GEO[code] || function () { return null; })();
    if (!fc || !fc.features) return [];
    const faces = [], keysOf = {};
    fc.features.forEach(function (f) {
      const recs = render.recordsForFeature(f), c = f.properties.code;
      keysOf[c] = recs.map(function (r) { return logic.instKey(r); });
      faces.push({ code: c, name: f.properties.name, muni: recs.filter(function (r) { return r.type === '지자체'; })
        .map(function (r) { return { key: logic.instKey(r), name: r.name }; }) });
    });
    const groups = logic.faceGroups(faces);
    groups.forEach(function (g) {
      const seen = {}; g.keys = [];
      g.faceCodes.forEach(function (c) { keysOf[c].forEach(function (k) { if (!seen[k]) { seen[k] = true; g.keys.push(k); } }); });
    });
    return groups;
  };
  // 묶음 한 개: 머리(단추 — 미확인 묶음은 글자) + 기본 표시 행 + 접힌 행(1년 이상) + 펼침 단추. 사용자·API 글은 esc.
  render._rkBuildGroup = function (g, buildCard) {
    const key = g.code || 'none';
    const sec = document.createElement('section');
    sec.className = 'rk-grp'; sec.dataset.code = g.code; sec.setAttribute('aria-labelledby', 'rkg-' + key);
    const sum = g.summary.map(function (s) { return '<span>' + esc(s.label) + ' <b>' + s.n + '</b>건</span>'; }).join('') || '<span>1년 안 예상 없음</span>';
    const inner = '<span class="rk-gn">' + esc(g.name) + '</span><span class="rk-gt">' + g.total + '건</span><span class="rk-gs">' + sum + '</span>';
    sec.innerHTML = '<h3 class="rk-gh">' + (g.code
      ? '<button type="button" class="rk-gbtn" id="rkg-' + esc(key) + '" aria-pressed="false">' + inner + '</button>'
      : '<span class="rk-gstatic" id="rkg-none">' + inner + '</span>') + '</h3>';
    const head = sec.querySelector('.rk-gbtn');
    if (head) head.addEventListener('click', function () { render.selectGroup(g.code, { noScroll: true }); });   // 이미 보고 있으니 스크롤하지 않는다
    g.shown.forEach(function (r) { sec.appendChild(buildCard(r)); });
    if (g.rest.length) {
      const open = render.state.rankOpen.has(g.code);
      const rest = document.createElement('div'); rest.className = 'rk-rest'; rest.id = 'rkr-' + key;
      if (!open) rest.hidden = true;   // hidden 속성 — 스크린리더도 건너뛰고 자리도 차지하지 않는다
      g.rest.forEach(function (r) { rest.appendChild(buildCard(r)); });
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rk-rest-btn';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.setAttribute('aria-controls', rest.id);
      btn.dataset.n = String(g.rest.length); btn.textContent = logic.restLabel(g.rest.length, open);
      btn.addEventListener('click', function () { render._setGroupOpen(g.code, rest.hidden); });
      sec.appendChild(rest); sec.appendChild(btn);
    }
    return sec;
  };
  // 이름을 선택자에 넣지 않는다(focusCard와 같은 이유) — data-code를 훑어 찾는다.
  render._rkGroupEl = function (panel, code) {
    let hit = null;
    panel.querySelectorAll('.rk-grp').forEach(function (s) { if (s.dataset.code === code) hit = s; });
    return hit;
  };
  // 묶음의 접힌 행을 열고 닫는다(상태는 render.state.rankOpen, 목록을 다시 그려도 유지).
  render._setGroupOpen = function (code, open) {
    if (open) render.state.rankOpen.add(code); else render.state.rankOpen.delete(code);
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    const sec = render._rkGroupEl(panel, code); if (!sec) return;
    const rest = sec.querySelector('.rk-rest'), btn = sec.querySelector('.rk-rest-btn');
    if (!rest || !btn) return;
    if (open) rest.removeAttribute('hidden'); else rest.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = logic.restLabel(Number(btn.dataset.n) || rest.children.length, open);
  };
  // 묶음 머리를 .rank-head 바로 아래에 맞춘다 — 패널 scrollTop만 옮긴다(페이지는 안 움직임, focusCard와 같은 방식).
  render._scrollToGroup = function (panel, sec) {
    const head = panel.querySelector('.rank-head'), hh = head ? head.offsetHeight : 0;
    const pr = panel.getBoundingClientRect(), sr = sec.getBoundingClientRect();
    const dy = logic.groupScrollDelta(sr.top - pr.top - hh, panel.clientHeight - hh);
    if (dy) panel.scrollTop += dy;
  };
  render._rankStatus = function (msg) {
    const el = typeof document !== 'undefined' && document.getElementById('rank-status');
    if (el) { el.textContent = ''; el.textContent = msg; }
  };

  // 접힌 '원본 정보'(지도 상세 팝업 tailHtml) — 규격: handoff/agents/design-reviewer/2026-11-11_1421_a3b0ec71.md §6-B. 지역코드·구시군코드·경도·위도는 보이지 않고 [편집] 창에만 있다.
  render.POP_RAW_FIELDS = ['type', 'term', 'lastBid', 'confirmed', 'sources', 'updatedAt'];
  render.POP_HIDDEN_FIELDS = ['name', 'region', 'subRegion', 'lng', 'lat'];
  render.popRawValue = function (rec, f) {
    if (f === 'sources') return Array.isArray(rec.sources) ? rec.sources : [];
    if (f === 'confirmed') return rec.confirmed === true ? '확정' : (rec.confirmed === false ? '미확정' : '');
    if (f === 'term') return rec.term == null || rec.term === '' ? '' : rec.term + '년';
    return rec[f] == null ? '' : String(rec[f]);
  };
  // 접이식 '원본 정보'의 안쪽 줄들(지도 상세 팝업). 지역코드·구시군코드·경도·위도는 보이지 않고 누락만 알린다.
  render.popRawHtml = function (rec) {
    const v = logic.validateRecord(rec);
    let raw = '';
    render.POP_RAW_FIELDS.forEach(function (f) {
      const label = logic.FIELD_LABELS[f] || f;
      const missing = v.missing.indexOf(f) >= 0;
      const val = render.popRawValue(rec, f);
      let body;
      if (f === 'sources') {
        body = val.map(function (s) {
          const t = String(s), u = logic.safeHttpUrl(t);
          return u
            ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + '</a>' : esc(t);
        }).join('<br>');
      } else body = esc(val);
      if (!body) body = missing ? '(누락)' : '';
      raw += '<div' + (missing ? ' class="miss"' : '') + '><span class="pop-rl">' + esc(label) + '</span> ' + body + '</div>';
    });
    const hiddenMissing = render.POP_HIDDEN_FIELDS.filter(function (f) { return v.missing.indexOf(f) >= 0; })
      .map(function (f) { return logic.FIELD_LABELS[f] || f; });
    if (hiddenMissing.length) {
      raw += '<div class="miss">누락된 칸: ' + esc(hiddenMissing.join(', ')) + ' — [편집]에서 채우세요.</div>';
    }
    return raw;
  };
  // 지도에서 기관을 누르면 현황판 상세와 같은 내용의 팝업(dashboard.openDetail)을 연다(사용자 11-13). opener = 닫으면 포커스가 돌아갈 요소.
  render.openRecord = function (rec, opener) {
    const d = root.dashboard;
    if (d && typeof d.openDetail === 'function') d.openDetail(rec, { opener: opener });
  };

  render._selectedName = null;
  render._selectedGroup = null;   // 선택된 시군구 묶음 코드 — 기관 선택(_selectedName)과 둘 중 하나만 설정된다

  // 이전 선택의 흔적을 전부 해제한다. selectInstitution의 유일한 "끄기" 경로이자,
  // 랭킹 카드 흰 테두리가 클릭할수록 누적되던 버그의 근본 수정.
  render.clearSelection = function () {
    document.querySelectorAll('.rank-card.hi').forEach(function (c) { c.classList.remove('hi'); });
    const svg = d3.select('#map-svg');
    svg.selectAll('g.ripple-layer').remove();
    svg.selectAll('path.subregion.selected, path.region.selected').classed('selected', false);
    svg.selectAll('g.sel-ring-layer path.ring-sel').remove();
    svg.selectAll('g.sub-card.selected').classed('selected', false);   // 시군구 카드 선택 표시도 함께 푼다
    document.querySelectorAll('.rank-card .rank-noloc').forEach(function (n) { n.remove(); });
    document.querySelectorAll('.rk-grp.on').forEach(function (s) { s.classList.remove('on'); render._rkPressed(s, false); });   // 묶음 선택(목록)도 함께 푼다
    render._selectedGroup = null;
  };

  // ── 지도 강조 덮개 층(규격 design-reviewer 2026-11-19_1011 6-B) ──
  // 선택·포커스는 원래 면을 raise()하지 않고, g.sel-ring-layer에 같은 d의 fill:none 경로를 그린다. 선택은 under(흰 7)·over(포인트 파랑 3) 두 겹, 포커스는 under(잉크 6)·over(흰 2.5) 두 겹(사용자 11-19 '검정 말고', design 1428_aab03363 4절 안 1, 11-19 저녁 4-3에서 검정 바깥선 edge 삭제).
  // 여러 면(수원 4구)은 under를 전부 그린 뒤 over를 그려야 이웃 면의 over를 under가 덮지 않는다.
  render._ringLayer = function () {
    if (typeof d3 === 'undefined') return null;
    const l = d3.select('#map-svg').select('g.sel-ring-layer');
    return l.empty() ? null : l;
  };
  render._ringPaths = function (layer, kind, paths, passes) {
    (passes || ['under', 'over']).forEach(function (pass) {
      paths.forEach(function (d) { layer.insert('path', kind === 'sel' ? 'path.ring-focus' : null).attr('class', 'ring ring-' + kind + ' ' + pass).attr('d', d); });   // 선택은 기존 포커스 링 아래로 — 키보드 포커스가 항상 맨 위(3겹 선택이 포커스를 덮지 않게)
    });
  };
  render._ringSelect = function (sel) {                    // sel = 선택된 면의 d3 선택
    const layer = render._ringLayer(); if (!layer || !sel || sel.empty()) return;
    const ds = []; sel.each(function () { const d = this.getAttribute('d'); if (d) ds.push(d); });
    render._ringPaths(layer, 'sel', ds, ['under', 'over']);   // 흰 7 → 포인트 파랑 3
  };
  render._ringFocus = function (el) {                      // 키보드 포커스일 때만(마우스 클릭 포커스는 :focus-visible이 아니다)
    render._ringBlur();
    let vis = true;
    try { vis = !!(el && el.matches && el.matches(':focus-visible')); } catch (e) { vis = true; }
    const layer = render._ringLayer(); const d = el && el.getAttribute && el.getAttribute('d');
    if (!vis || !layer || !d) return;
    render._ringPaths(layer, 'focus', [d]);
  };
  render._ringBlur = function () {
    if (typeof d3 === 'undefined') return;
    d3.select('#map-svg').selectAll('g.sel-ring-layer path.ring-focus').remove();
  };

  // 시군구 묶음 선택(면·카드 클릭, 면 Enter, 목록의 묶음 머리 클릭). 선택은 기관 또는 묶음 하나 — 기관 선택은 비운다.
  // 수원 4구처럼 묶음에 면이 여럿이면 전부 선택·링(_blinkMunicipality와 같은 방식). 포커스는 옮기지 않는다(면을 Tab으로 훑던 흐름 유지).
  // opts.noScroll: 머리 클릭처럼 이미 보고 있을 때, opts.quiet: 다시 그린 뒤 복원일 때(알림 생략). 묶음을 못 찾으면 false.
  render.selectGroup = function (groupCode, opts) {
    const o = opts || {};
    const g = groupCode ? (render._groups || []).filter(function (x) { return x.code === groupCode; })[0] : null;
    if (!g) return false;
    render.clearSelection();
    render._selectedName = null;
    render._selectedGroup = g.code;
    if (typeof d3 !== 'undefined' && typeof document !== 'undefined') {
      const sel = d3.select('#map-svg').selectAll('path.subregion')
        .filter(function () { return g.faceCodes.indexOf(this.getAttribute('data-code')) >= 0; })
        .classed('selected', true);
      render._ringSelect(sel);
      render._cardSelect();
    }
    if (typeof document === 'undefined') return true;
    const panel = document.getElementById('rank-panel');
    const sec = panel ? render._rkGroupEl(panel, g.code) : null;
    if (sec) {
      sec.classList.add('on'); render._rkPressed(sec, true);
      if (!g.shown.length && g.rest.length) render._setGroupOpen(g.code, true);   // 보일 행이 없으면 자동으로 펼친다
      if (!o.noScroll) render._scrollToGroup(panel, sec);
    }
    if (!o.quiet) render._rankStatus(logic.groupStatusText(g));
    return true;
  };

  render.selectInstitution = function (rec) {
    render.clearSelection();                       // 항상 먼저 — 이전 강조를 남기지 않는다
    render._selectedName = rec ? rec.name : null;
    if (!rec) return;
    if (rec.type === '지자체') render._blinkMunicipality(rec);
    else if (!render.state.currentRegion) render._blinkRegionFace(rec);   // 전국 지도: 시도 면 반짝(사용자 11-16)
    else if (typeof rec.lng === 'number' && typeof rec.lat === 'number') render._drawRipple(rec.name);
    else if (!render._blinkSubRegion(rec)) render._noteNoLocation(rec);   // 소재 시군구 면을 못 찾으면 카드에 안내
    render.highlightCard(rec.name, true);
  };

  // 지자체가 아닌 기관의 소재 시군구(subRegion) 면 코드 — 이 지도에 그 면이 있을 때만. 없으면 [].
  render.faceCodesForSubRegion = function (rec, fc) {
    if (!rec || !rec.subRegion || !fc || !fc.features) return [];
    return fc.features.filter(function (f) { return f.properties && f.properties.code === rec.subRegion; })
      .map(function (f) { return f.properties.code; });
  };
  render._blinkSubRegion = function (rec) {   // 반짝였으면 true, 이 지도에 면이 없으면 false
    const fc = (render.REGION_GEO[render.state.currentRegion] || function () { return null; })();
    const codes = render.faceCodesForSubRegion(rec, fc);
    if (!codes.length) return false;
    const sel = d3.select('#map-svg').selectAll('path.subregion')
      .filter(function () { return codes.indexOf(this.getAttribute('data-code')) >= 0; })
      .classed('selected', true);
    render._ringSelect(sel);
    render._cardSelect();
    return true;
  };
  // 전국 지도: 비지자체 기관의 시도 면(path.region, data-code = 시도 코드)을 반짝. 면이 없으면 false.
  render._blinkRegionFace = function (rec) {
    if (!rec || !rec.region) return false;
    const sel = d3.select('#map-svg').selectAll('path.region')
      .filter(function () { return this.getAttribute('data-code') === rec.region; });
    if (sel.empty()) return false;
    sel.classed('selected', true);
    render._ringSelect(sel);
    return true;
  };
  // 시도 지도인데 소재 시·군·구 면을 못 찾았다 — 눌린 카드 안에 이유를 적는다. 선택이 풀리면(clearSelection) 같이 사라진다.
  render._noteNoLocation = function (rec) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    panel.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name !== rec.name || c.querySelector('.rank-noloc')) return;
      const n = document.createElement('div');
      n.className = 'rank-noloc'; n.setAttribute('role', 'status');
      n.textContent = '지도 위치(소재 시·군·구) 미확인';
      c.appendChild(n);
    });
  };
  // 카드를 누르거나 포커스가 올 때: 같은 기관이 이미 표시 중이면 다시 그리지 않는다(반짝임이 처음부터 다시 시작되는 깜박임 방지).
  render.showOnMap = function (rec) {
    if (render._selectedName === rec.name && document.querySelector('#map-svg path.subregion.selected, #map-svg path.region.selected, #map-svg g.ripple-layer, .rank-card .rank-noloc')) return;
    render.selectInstitution(rec);
  };

  // 지자체: 좌표(마커)가 없으므로 물결 대신 해당 구 외곽선을 깜빡인다.
  render._blinkMunicipality = function (rec) {
    const fc = (render.REGION_GEO[render.state.currentRegion] || function(){ return null; })();
    if (!fc || !fc.features) return;
    // 일반구로 쪼개진 시(수원 4구 등)는 같은 기관이 폴리곤 여러 개에 걸친다 —
    // 첫 폴리곤만 잡으면 랭킹 카드가 시의 일부 구만 가리키므로 전부 모아 깜빡인다.
    const codes = fc.features.filter(function (f) {
      const hit = render.municipalityForFeature(f);
      return hit.some(function (r) { return r.name === rec.name; });
    }).map(function (f) { return f.properties.code; });
    if (!codes.length) return;
    const sel = d3.select('#map-svg')
      .selectAll('path.subregion')
      .filter(function () { return codes.indexOf(this.getAttribute('data-code')) >= 0; });
    // 외곽선은 raise()하지 않고 덮개 층에 그려 이웃 면이 반쪽을 덮지 않는다.
    sel.classed('selected', true);
    render._ringSelect(sel);
    render._cardSelect();
  };

  render._drawRipple = function (name) {
    const svg = d3.select('#map-svg');
    svg.selectAll('g.ripple-layer').remove();
    if (!name) return;
    // 현재 지역 마커 중 해당 이름의 좌표를 찾는다
    const proj = render._regionProjection; if (!proj) return;
    const rec = render.institutionsByRegion(render.state.currentRegion)
      .filter(function (r){ return r.name === name && typeof r.lng === 'number' && typeof r.lat === 'number'; })[0];
    if (!rec) return;
    const p = proj([rec.lng, rec.lat]);
    const g = svg.append('g').attr('class', 'ripple-layer');
    // 3중 링(위상차)로 잔잔한 물결 — 위상차는 주기에서 파생시켜 속도를 바꿔도 간격이 맞는다.
    const dur = render.currentTheme().rippleDuration;
    [0, 1, 2].forEach(function (i) {
      g.append('circle').attr('class', 'ripple-ring')
        .attr('cx', p[0]).attr('cy', p[1]).attr('r', 6)
        .style('animation-delay', (i * dur / 3) + 's');
    });
  };

  render.onMarkerClick = function (rec) {
    render.openRecord(rec, document.activeElement, window.innerWidth/2, 120);
    render.selectInstitution(rec);
  };

  // 면 클릭 → 오른쪽 랭킹 목록의 그 카드로 포커스(사용자 요청). 마커 클릭과 달리
  // **상세 팝업은 열지 않는다** — 목적이 목록으로 시선을 옮기는 것인데 팝업이
  // 그 카드를 가릴 수 있다(사용자 확정 ⓐ안).
  // 면(시군구)이 속한 목록 묶음 코드(drawRankingPanel이 채운 render._faceGroup). 없으면 ''.
  render.groupCodeForFeature = function (feature) {
    const c = feature && feature.properties && feature.properties.code;
    return (c && render._faceGroup && render._faceGroup[c]) || '';
  };
  // 면·카드 클릭 → 그 시군구 묶음 선택(design-reviewer 2026-11-24_1839 6-B). 면과 카드는 여러 기관 묶음을 뜻하므로
  // 한 기관(지자체 우선)이 아니라 묶음 전체를 목록에서 강조한다. 상세 팝업은 열지 않는다(사용자 확정 ⓐ안).
  render.onSubregionClick = function (feature, ev) {
    // 면 색을 정한 바로 그 레코드가 있는지로 판단한다(recordForFeature 주석 참조).
    const rec = render.recordForFeature(feature);
    // 레코드 없는 회색 면은 고를 것이 없다 — 막지 않고 그대로 흘려보내
    // 아래 document 핸들러가 예전처럼 '빈 곳 클릭'(선택 해제)으로 처리하게 둔다.
    if (!rec) return;
    // 그 document 핸들러는 .rank-card/.marker 밖 클릭을 전부 빈 곳으로 보므로,
    // 여기서 멈추지 않으면 방금 한 선택이 곧바로 풀린다.
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (render.selectGroup(render.groupCodeForFeature(feature))) return;
    // 묶음을 못 찾으면(목록이 아직 안 그려진 경우 등) 예전처럼 기관 하나.
    render.selectInstitution(rec);
    render.focusCard(rec.name);
  };

  // 목록이 길면 강조된 카드가 스크롤 밖에 있어 "아무 일도 안 났다"로 보인다.
  render.focusCard = function (name) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    let card = null;
    // 이름을 선택자에 넣지 않는다 — 기관명에 따옴표가 섞이면 선택자가 깨진다.
    panel.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name === name) card = c;
    });
    // 타입 필터로 카드가 빠져 있을 수 있다. 그때는 면 강조만 남기고 조용히 넘어간다.
    if (!card) return;
    const pr = panel.getBoundingClientRect(), cr = card.getBoundingClientRect();
    // 이미 다 보이면 움직이지 않는다 — 보고 있던 목록이 이유 없이 튀는 게 더 헷갈린다.
    if (cr.top >= pr.top && cr.bottom <= pr.bottom) return;
    // 밖에 있었으면 가운데로. scrollIntoView는 조상 스크롤까지 건드리므로 패널의
    // scrollTop만 직접 옮긴다 — 페이지 전체가 따라 움직이면 안 된다.
    panel.scrollTop += (cr.top - pr.top) - (panel.clientHeight - card.offsetHeight) / 2;
  };

  // 지도 빈 곳·패널 여백 클릭 → 선택 강조 해제. 지도 상세 팝업·그 위의 기관장 편집 창 안의 클릭은 풀지 않는다.
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
    // 묶음 머리·펼침 단추 클릭은 빈 곳이 아니다(펼침 단추를 눌러도 선택이 풀리지 않게).
    const outside = !(ev.target.closest && ev.target.closest('.rank-card, .marker, .dm-ov, .hc-ov, .rk-gbtn, .rk-rest-btn'));
    if (outside && (render._selectedName || render._selectedGroup)) {
      render._selectedName = null; render.clearSelection();
    }
  });

  render.renderFallback = function () {
    const stage = document.getElementById('map-stage'); if (!stage) return;
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    const top = logic.sortByUrgency(all, render.state.today);
    stage.innerHTML = '<div style="padding:16px;"><b>지도 로딩 실패</b> — D3 번들(vendor/d3.v7.min.js)을 확인하세요.' +
      '<br>아래는 지도 없이 제공하는 임박순 랭킹입니다.<ol>' +
      top.map(function (r){
        return '<li>' + esc(r.name) + ' — ' + esc(r.type) + ' · ' +
          esc(logic.formatDDay(r, render.state.today)) + '</li>'; }).join('') +
      '</ol></div>';
  };

  render.WATCHABLE = function () { return Array.from(render.state.activeRegions); };

  // 시도 카드 마크업(순수 문자열 — node 테스트로 구조를 고정한다). 열기·별은 형제 button(단추 안 단추 금지).
  render.regionCardHtml = function (code, o) {
    const nm = render.REGION_NAME[code] || code, on = !!o.on, cnt = o.count | 0;
    const star = '<button type="button" class="star" data-code="' + esc(code) + '" aria-pressed="' + (on ? 'true' : 'false') +
      '" aria-label="' + esc(nm) + ' 관심 지역">' + (on ? render.ICONS.starFill : render.ICONS.starLine) + '</button>';
    const sub = '기관 ' + cnt + '곳 · ' + (o.drillable ? '구/시군 보기' : '구/시군 경계 준비중');
    const body = '<b>' + esc(nm) + '</b><span class="rg-sub">' + sub + '</span>';
    return (o.drillable
      ? '<button type="button" class="rg-open" data-code="' + esc(code) + '" aria-label="' + esc(nm) + ', 기관 ' + cnt + '곳, 구/시군 보기">' + body + '</button>'
      : '<div class="rg-open">' + body + '</div>') + star;
  };

  render.drawRegionGrid = function (focusCode) {
    const grid = document.getElementById('region-grid'); if (!grid) return;
    grid.innerHTML = '';
    render.WATCHABLE().forEach(function (code) {
      const drillable = render.hasSubGeo(code);
      const card = document.createElement('div'); card.className = 'rg-card';
      card.innerHTML = render.regionCardHtml(code, { drillable: drillable, on: store.isWatched(code), count: render.institutionsByRegion(code).length });
      // ★는 관심 토글만. 다시 그리면 포커스를 잃으므로 같은 별로 돌려 놓는다(키보드 사용자).
      card.querySelector('.star').addEventListener('click', function () {
        store.toggleWatch(code); render.drawRegionGrid(code); render.drawPinBar(); render.applyWatchStyles();
      });
      // 열기 단추 클릭(Enter·Space 포함) → 전국 지도 탭으로 전환 후 해당 지역 구/시군 드릴인.
      // 경계 데이터가 없는 지역은 단추가 아예 없다 — 열어봐야 오류 배너만 뜬다.
      const openBtn = card.querySelector('button.rg-open');
      if (openBtn) openBtn.addEventListener('click', function () {
        const mapBtn = document.querySelector('.tab-btn[data-tab="map"]');
        if (mapBtn) mapBtn.click();
        // 지도 탭은 직전 화면(이전 시도 상세 등) 그대로 켜진다 — 확대 연출이 끝나는 ~1초 동안
        // 낡은 지도가 보이다가 갑자기 바뀌는 지연으로 읽혔다. 같은 틱에 전국 지도로 되돌려
        // 브라우저가 낡은 화면을 그리기 전에 "전국 → 확대 → 상세"가 이어지게 한다.
        if (root.app && root.app.backToNational) root.app.backToNational();
        if (root.app && root.app.enterRegion) root.app.enterRegion(code);
      });
      grid.appendChild(card);
    });
    if (focusCode) { const again = grid.querySelector('.star[data-code="' + focusCode + '"]'); if (again) again.focus(); }
  };

  render.drawPinBar = function () {
    const bar = document.getElementById('pin-bar'); if (!bar) return;
    bar.innerHTML = ''; const watch = store.loadWatch();
    if (!watch.length) { bar.innerHTML = '<small style="color:var(--muted)">관심 지역을 별표(<span role="img" aria-label="별">' + render.ICONS.starLine + '</span>)로 지정하면 여기 쌓입니다 (드래그로 순서 변경).</small>'; return; }
    watch.forEach(function (code, idx) {
      const pin = document.createElement('div'); pin.className = 'pin'; pin.draggable = true; pin.dataset.idx = idx;
      pin.innerHTML = render.ICONS.starFill + ' ' + logic.esc(render.REGION_NAME[code] || code);
      pin.addEventListener('dragstart', function (e){ e.dataTransfer.setData('text/plain', idx); });
      pin.addEventListener('dragover', function (e){ e.preventDefault(); });
      pin.addEventListener('drop', function (e) {
        e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        store.reorderWatch(from, idx); render.drawPinBar(); render.applyWatchStyles();
      });
      // 핀 클릭 → 지도 탭 전환. 경계 데이터가 있는 지역만 드릴인 (카드와 동일 규칙).
      pin.style.cursor = 'pointer';
      pin.addEventListener('click', function () {
        const mapBtn = document.querySelector('.tab-btn[data-tab="map"]');
        if (mapBtn) mapBtn.click();
        if (render.hasSubGeo(code) && root.app && root.app.enterRegion) root.app.enterRegion(code);
      });
      bar.appendChild(pin);
    });
  };

  render.applyWatchStyles = function () {
    d3.select('#map-svg').selectAll('path.region').classed('watched', function (d) {
      return store.isWatched(d.properties.code);
    });
  };

  render.REGION_NAME_ALL = function (code) { return render.REGION_NAME[code] || code; };
  render.openMoreModal = function () {
    const modal = document.getElementById('more-modal'); if (!modal) return;
    const search = document.getElementById('more-search');
    search.value = ''; render.renderMoreTable('');
    search.oninput = function () { render.renderMoreTable(search.value); };
    document.getElementById('more-close').onclick = function () { root.dlg.requestClose(modal); };
    root.dlg.open(modal, { focus: search });   // 공통 팝업 틀 2단계 — 보는 창이지만 찾는 일이 먼저라 검색칸에 커서
  };
  render.renderMoreTable = function (query) {
    const tb = document.getElementById('more-tbody'); if (!tb) return;
    const q = (query || '').trim().toLowerCase();
    const all = render.allInstitutions();
    const rows = logic.sortByUrgency(all, render.state.today).filter(function (r) {
      if (!q) return true;
      return [r.name, r.type, render.REGION_NAME_ALL(r.region)].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    const none = document.getElementById('more-empty');
    if (none) { none.textContent = rows.length ? '' : (q ? '조건에 맞는 입찰건이 없습니다. 검색어를 지우세요.' : '등록된 입찰건이 없습니다.'); none.hidden = rows.length > 0; }
    tb.innerHTML = !rows.length ? tblEmpty.rowHtml(6) : rows.map(function (r) {
      return '<tr style="border-top:1px solid var(--line);">' +
        '<td>' + logic.esc(r.name) + '</td>' +
        '<td>' + logic.esc(r.type || '') + '</td>' +
        '<td>' + logic.esc(render.REGION_NAME_ALL(r.region)) + '</td>' +
        '<td>' + logic.esc(logic.formatBidDateLabel(r)) + '</td>' +
        '<td>' + logic.esc(r.term ? r.term + '년' : '') + '</td>' +
        '<td>' + logic.esc(r.updatedAt || '') + '</td></tr>';
    }).join('');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
