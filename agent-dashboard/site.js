'use strict';
/* 공사판 테마 장면 — app.js보다 먼저 읽힌다. 상태기계·경로·판정은 app.js 그대로 쓰고 그림·문구만 바꾼다.
   함수 안에서 쓰는 c·runners·stat·simTime·jan·amb·coach·pathPos 등은 app.js 전역(호출 시점에 존재).
   배치 규격: design-reviewer 11-16, 문구·상수: planner 11-16. */
const SITE = (() => {
  const txt = {
    unit: '공정', go: '작업 개시!', stop: '철수!', wheelIn: '수레 탑승!', drink: '꿀꺽꿀꺽', down: '어지러워…', toBench: '휴게실 갈게요',
    back: '현장 복귀!', pant: '헉헉', wet: '앗 시원해!', lap10: '허리가… 천천히 할게요', lap15: '수레 좀 태워줘요', lap25: '좀 쉬어야겠어…',
    ambGo: n => '🚑 휴식 이송 — ' + n + ' (탈진)', ambDone: n => '🏥 ' + n + ' 충분히 쉬는 중 — 곧 복귀',
    coachBusy: ['안전모 확인!', '서두르지 마!', '공정 지켜!', '좋아, 계속!'], coachIdle: ['쉬어~', '물 마셔!', '다음 공정 대기!'], cheer: '안전 제일!',
    cleaner: '정리반', jobs: { enter: '출근 중', water: '정수기 채우는 중', bench: '휴게실 정리 중', track: '운반로 청소 중', splash: '물 뿌려 깨우는 중', leave: '퇴근 중' },
    janStart: '정리 시작!', janJob: { water: '물 채울게요', bench: '휴게실 치우자~', track: '길 쓸자~' }, janBye: '수고하셨습니다~',
    st: { run: '작업 중', crawl: '허리 짚고 작업', wheel: '수레 타고 작업', toStart: '현장 투입 중', drink: '물 마시는 중', amb: '휴식 이송 중', away: '의무실 휴식', wet: '정신 차리는 중', ready: '작업 준비', done: '방금 끝남', lying: '탈진 휴식', idle: '휴게실 대기' },
    boardTitle: '🏗️ 공정 현황', running: n => '작업 중 ' + n + '명', scoreBusy: '투입 ', mainLbl: '소장: ', reset: '공정 초기화',
    boardBg: 'rgba(0,0,0,.60)',
    aria: '에이전트 작업 현황 공사 현장. 각 에이전트가 작업자로 일하며 공정 수가 작업량을, 건물 층수가 누적 작업량을 나타냅니다',
  };

  /* ---------- 상수 ---------- */
  const LAPS_PER_FLOOR = 3; // 공정 1번 = 업무 동선 한 바퀴(트랙보다 길다)
  const ZONES = [[0, '지상', '#8ecae6'], [20, '구름', '#5fa8d3'], [60, '성층권', '#1b3a6b'], [120, '우주', '#05070f']]; // 하루 실제 누적을 보고 조정(planner)
  const BLD = { x: 1110, w: 140, baseY: 588, floorH: 18, maxMain: 16 }; // 16층이면 크레인 지브·운전석 이름표가 고도 창(y≤205) 아래에 보인다
  const CR = { mastX: 1088, jib: 160, counter: 56, phiYard: Math.PI, phiBld: 0, phiRest: 0.35, tYard: 78, tBld: 92, hookRest: 20 };
  const YARD = { x: 968, y: 556, w: 84 }; // 단면도(x≤960)와 리프트(x≥1053) 사이
  const LIFT = { x: 1066, base: 584 }, LIFT_RATE = 0.2, LIFT_IN = 0.2, LIFT_OUT = 0.85; // 리프트 레일(크레인 마스트 왼쪽)·구간 비율
  let cageY = LIFT.base;
  const ALT = { x: 1040, y: 12, w: 228, h: 190, ruler: 22, title: 18 };
  const STEEL = '#a8432b', WALL = '#d5d0c4', GLASS = '#7fb3d5', GLASS_HI = '#d6eaf8', SLAB = '#8f959a', YEL = '#f2b705';

  let bonus = 0, zoneSeen = -1, zoneSince = null;
  const crane = { phi: CR.phiRest, trolley: 70, hook: CR.hookRest, phase: 'rest', t: 0, beam: false };
  const sparks = [], pops = [], marks = []; // pops: 떠오르는 글자, marks: QA 하자 표시(빨강 → 확인되면 초록 ✔)
  const dlv = { 2: 2, 3: 1 }; // 층별 납품 자재 더미 수
  const sky = { planeX: -40, planeNext: 2, ufoX: -60, ufoNext: 6, cloudOff: 0 };
  const prop = { wb: 0, paint: 0, cones: 0, tile: 0 };

  const floors = () => Math.floor((stat.laps + bonus) / LAPS_PER_FLOOR) + 1;
  const zoneIdx = f => { let i = 0; for (let k = 0; k < ZONES.length; k++) if (f >= ZONES[k][0]) i = k; return i; };
  const mainTopY = () => BLD.baseY - Math.min(floors(), BLD.maxMain - (floors() > BLD.maxMain ? 1 : 0)) * BLD.floorH; // 잘리면 맨 윗줄은 지그재그 단면이라 보이는 꼭대기는 한 층 아래
  const jibY = () => Math.max(60, mainTopY() - 3 * BLD.floorH - 22);
  const ease = k => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  function lerpColor(a, b, k) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return 'rgb(' + x.map((v, i) => Math.round(lerp(v, y[i], k))).join(',') + ')';
  }
  function skyColor(f) {
    for (let k = ZONES.length - 1; k >= 0; k--) {
      if (f >= ZONES[k][0]) {
        const n = ZONES[k + 1]; if (!n) return ZONES[k][2];
        return lerpColor(ZONES[k][2], n[2], (f - ZONES[k][0]) / (n[0] - ZONES[k][0]));
      }
    }
    return ZONES[0][2];
  }
  const backendAct = () => runners.filter(r => r.role === 'backend' && r.active);
  const label = (text, x, y, col) => { c.fillStyle = col || '#4a4f55'; c.font = 'bold ' + fz(13, 12, 1.3) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); };

  /* ---------- 갱신 ---------- */
  function update(dt) {
    // 구간 도달 토스트 — 세션(stats.since)마다 구간별 1회, 첫 로드는 조용히 맞춘다
    if (stat.since !== null) {
      const zi = zoneIdx(floors());
      if (zoneSince !== stat.since) { zoneSince = stat.since; zoneSeen = zi; }
      else if (zi > zoneSeen) {
        zoneSeen = zi;
        toast(({ 1: '☁️ 구름을 뚫었다!', 2: '✈️ 성층권 진입!', 3: '🚀 우주 도착!' }[zi] || '') + ' (' + ZONES[zi][0] + '층)');
      } else if (zi < zoneSeen) zoneSeen = zi;
    }
    updateCrane(dt);
    for (const [k2, y] of [['cab', jibY() + 21], ['top', mainTopY()]]) if (easeY[k2] != null) { const d = y - easeY[k2]; easeY[k2] += Math.sign(d) * Math.min(Math.abs(d), 40 * dt); } // 층이 오르면 건물을 따라 천천히 올라감
    // 백엔드: 일하는 동안 크레인 운전석(1번)·건물 꼭대기(2번째부터)로 1초에 걸쳐 오르내린다
    for (const r of runners) {
      if (r.role !== 'backend') continue;
      if (r.el || working(r)) continue; // 엘리베이터·작업 중에는 리프트 진행을 멈춘다(내리는 순간 리프트 중간으로 '휙' 옮겨지던 문제, 사용자 11-16)
      const want = r.active && r.state === 'run' && fatOf(r.lapF, r.freshAt) < 10;
      const k0 = r.ovK || 0;
      // 리프트 앞까지는 걷는 속도(LIFT_WALK px/s)로 간다 — 시간으로 나누면 먼 곳에서 '휙' 미끄러진다(사용자 11-16)
      if (want && k0 < LIFT_IN) {
        if (!r.lp) r.lp = { x: r.x, y: r.y };
        if (walkPt(r.lp, LIFT.x, LIFT.base, dt)) r.ovK = LIFT_IN; else r.ovK = Math.max(k0, 0.001);
      } else if (!want && k0 <= LIFT_IN && k0 > 0) {
        if (!r.lp) r.lp = { x: LIFT.x, y: LIFT.base };
        if (walkPt(r.lp, r.x, r.y, dt)) { r.ovK = 0; r.lp = null; }
      } else if (k0 > 0) { // 0이면 지상 동선 그대로(여기서 리프트로 되돌리던 버그, 11-16)
        r.ovK = Math.max(want ? LIFT_IN : 0, Math.min(1, k0 + (want ? dt : -dt) * LIFT_RATE)); // 리프트 상승·하강·운전석으로 걸어 들어감
        if (!want && k0 > LIFT_IN && r.ovK <= LIFT_IN) { r.ovK = LIFT_IN * 0.999; r.lp = { x: LIFT.x, y: LIFT.base }; }
        if (want && r.ovK >= LIFT_IN) r.lp = null;
      }
      if (want && k0 < LIFT_IN && r.ovK >= LIFT_IN) say(r, '리프트 탑승!', 1.5);
      if (!want && k0 > LIFT_IN && r.ovK <= LIFT_IN) say(r, '1층 도착', 1.2);
      if (r.extra && r.ovK >= 1 && Math.random() < dt * 9) { // 용접 불꽃
        const p = topSpot(r);
        for (let k = 0; k < 3; k++) sparks.push({ x: p.x + p.face * 10, y: p.y - 18, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, life: 0.5 });
      }
    }
    prop.cones = Math.max(0, prop.cones - dt * 0.5);
    for (const r of runners) { // 일하는 동안 소품이 바뀐다
      if (!working(r)) continue;
      const a = r.work.st.act, e = simTime - r.work.at;
      if (a === 'board') prop.wb = Math.min(5.99, prop.wb + dt * 0.3);
      if (a === 'paint') prop.paint += dt * 0.1;
      if (a === 'tile') prop.tile += dt * 1.2;
      if (a === 'gate') prop.cones = 1;
      if (a === 'column' && Math.floor(e / 0.8) !== r.lastPop) { r.lastPop = Math.floor(e / 0.8); pops.push({ x: 601, y: r.y - 50, t: '｜', col: '#ff5252', life: 0.6 }); }
    }
    if (prop.wb >= 5.99 && !runners.some(r => working(r) && r.work.st.act === 'board')) prop.wb = 0;
    if (prop.paint >= 1) prop.paint = 0;
    if (prop.tile >= 24) prop.tile = 0;
    for (let i = marks.length - 1; i >= 0; i--) if (simTime > marks[i].until) marks.splice(i, 1);
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.y -= 26 * dt; if (p.life <= 0) pops.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.life -= dt; p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) sparks.splice(i, 1); }
    // 하늘 장식
    sky.cloudOff += dt * 8;
    if (simTime > sky.planeNext) { sky.planeX += dt * 70; if (sky.planeX > ALT.w + 40) { sky.planeX = -40; sky.planeNext = simTime + 6 + Math.random() * 5; } }
    if (simTime > sky.ufoNext) { sky.ufoX += dt * 55; if (sky.ufoX > ALT.w + 60) { sky.ufoX = -60; sky.ufoNext = simTime + 9 + Math.random() * 8; } }
  }
  function updateCrane(dt) {
    const k = crane, on = backendAct().length > 0;
    const go = (key, to, rate) => { const d = to - k[key], s = rate * dt; if (Math.abs(d) <= s) { k[key] = to; return true; } k[key] += Math.sign(d) * s; return false; };
    const bldDrop = mainTopY() - 4 - jibY();
    const yardDrop = YARD.y - 10 - jibY();
    if (!on && k.phase !== 'place' && k.phase !== 'lower') { // 백엔드가 없으면 쉬는 자세(들고 있던 빔은 내려놓고)
      if (k.beam) { k.phase = 'swingBld'; } else { go('phi', CR.phiRest, 0.8); go('hook', CR.hookRest, 120); go('trolley', 70, 40); k.phase = 'rest'; return; }
    }
    switch (k.phase) {
      case 'rest': k.phase = 'swingYard'; break;
      case 'swingYard': { const a = go('phi', CR.phiYard, Math.PI / 3), b = go('trolley', CR.tYard, 40), h = go('hook', CR.hookRest, 120); if (a && b && h) k.phase = 'lower'; break; }
      case 'lower': if (go('hook', k.beam ? bldDrop : yardDrop, 150)) { if (k.beam) { k.beam = false; k.phase = 'place'; k.t = simTime; } else { k.beam = true; k.phase = 'lift'; } } break;
      case 'lift': if (go('hook', CR.hookRest, 150)) k.phase = 'swingBld'; break;
      case 'swingBld': { const a = go('phi', CR.phiBld, Math.PI / 3), b = go('trolley', CR.tBld, 40), h = go('hook', CR.hookRest, 150); if (a && b && h) k.phase = 'lower'; break; }
      case 'place': if (simTime - k.t > 1.2 && go('hook', CR.hookRest, 150)) k.phase = on ? 'swingYard' : 'rest'; break;
    }
  }

  /* ---------- 백엔드 위치 덮어쓰기 ---------- */
  const easeY = { cab: null, top: null, t: 0 };
  function smoothY(key, y) { const v = easeY[key]; if (v == null || Math.abs(y - v) > 400) return (easeY[key] = y); return v; } // 실제 값은 update에서 따라감
  function cabSpot() { return { x: CR.mastX - 2, y: smoothY('cab', jibY() + 21), s: 0.42, face: -1, pose: 'stand' }; }
  function topSpot(r) {
    const sway = Math.sin(simTime * 0.4 + r.slot) * 0.5 + 0.5;
    return { x: BLD.x + 22 + sway * (BLD.w - 44), y: smoothY('top', mainTopY()), s: 0.75, face: Math.cos(simTime * 0.4 + r.slot) > 0 ? 1 : -1, pose: 'stand' };
  }
  const LIFT_WALK = 120;
  function walkPt(p, tx, ty, dt) { const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), m = LIFT_WALK * dt; if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1; if (d <= m) { p.x = tx; p.y = ty; return true; } p.x += dx / d * m; p.y += dy / d * m; return false; }
  function place(r) {
    if (r.el) { const li = fatOf(r.lapF, r.freshAt); return { x: r.x, y: r.y, s: 1, face: r.face, pose: li >= 15 ? 'wheel' : li >= 10 ? 'crawl' : r.el.phase === 'ride' ? 'stand' : 'walk' }; } // 수레·기어가기 자세 유지(qa P3-3)
    if (working(r)) { const st = r.work.st; return { x: r.x, y: r.y, s: 1, face: st.fx == null ? r.face : (st.fx >= r.x ? 1 : -1), pose: st.act === 'cctv' ? 'sit' : 'stand', work: true }; }
    if (r.role !== 'backend' || !r.ovK) return null;
    const tgt = r.extra ? topSpot(r) : cabSpot(), k = r.ovK;
    if (k >= 1) return tgt;
    // 건설용 리프트: ① 리프트 앞까지 걸어감 → ② 케이지 타고 수직 상승 → ③ 운전석·꼭대기로 걸어 들어감(내려올 땐 반대)
    if (k < LIFT_IN) { const p = r.lp || { x: r.x, y: r.y }; return { x: p.x, y: p.y, s: 1, face: p.face || 1, pose: 'walk' }; }
    if (k < LIFT_OUT) { const q = ease((k - LIFT_IN) / (LIFT_OUT - LIFT_IN)); return { x: LIFT.x, y: lerp(LIFT.base, tgt.y, q), s: lerp(1, tgt.s, q), face: 1, pose: 'stand', riding: true }; }
    const q = ease((k - LIFT_OUT) / (1 - LIFT_OUT));
    return { x: lerp(LIFT.x, tgt.x, q), y: tgt.y, s: tgt.s, face: tgt.x >= LIFT.x ? 1 : -1, pose: 'walk' };
  }

  /* ---------- 손에 든 도구 ---------- */
  function drawTool(r, pose, x, y, face, s, ov) {
    const z = working(r), e = z ? simTime - r.work.at : 0;
    if (z) { c.save(); c.translate(x, y); c.scale(face * s, s); drawWork(r.work.st.act, e, r.work.st.dur); c.restore(); drawWorkFx(r, x, y, face, e); return; }
    if (!['run', 'walk', 'stand'].includes(pose)) return;
    c.save(); c.translate(x, y); c.scale(face * s, s);
    const hx = 12, hy = -22;
    if (r.carry) { poly([[0, -35], [8, -30], [12, -30]], 4, '#f1c9a5'); c.fillStyle = '#c8a26b'; c.fillRect(6, -40, 16, 13); c.strokeStyle = '#8d6e63'; c.lineWidth = 1; c.strokeRect(6, -40, 16, 13); c.restore(); return; } // 자재 상자 운반
    switch (r.role) {
      case 'designer': c.fillStyle = '#1e5aa8'; c.fillRect(hx - 2, hy - 10, 4, 14); break; // 청사진 통
      case 'planner': c.fillStyle = '#f5f5f5'; c.fillRect(hx - 3, hy - 9, 9, 12); c.fillStyle = '#f9a825'; c.fillRect(hx - 1, hy - 6, 5, 1.5); c.fillRect(hx - 1, hy - 3, 3, 1.5); break; // 공정표
      case 'frontend': limb(hx, hy, hx + 6, hy - 12, 2, '#8d6e63'); c.fillStyle = '#eceff1'; c.fillRect(hx + 2, hy - 17, 9, 5); break; // 롤러
      case 'backend': if (!ov) limb(hx, hy, hx + 8, hy - 6, 2.5, '#90a4ae'); break; // 렌치
      case 'qa': c.strokeStyle = '#37474f'; c.lineWidth = 1.5; c.beginPath(); c.arc(hx + 2, hy - 4, 4, 0, Math.PI * 2); c.stroke(); limb(hx - 1, hy, hx - 4, hy + 5, 1.5, '#37474f'); break; // 돋보기
      case 'security': c.fillStyle = '#ff1744'; c.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(simTime * 6)); c.fillRect(hx - 1, hy - 14, 3, 14); c.globalAlpha = 1; break; // 경광봉
      case 'pm': c.fillStyle = '#263238'; c.fillRect(hx - 2, hy - 10, 5, 10); limb(hx + 2, hy - 10, hx + 2, hy - 15, 1, '#263238'); break; // 무전기
      case 'auditor': c.fillStyle = '#37474f'; c.fillRect(hx - 2, hy - 6, 8, 5); break; // 스캐너
    }
    c.restore();
  }
  function drawWork(act, e, dur) { // 작업 동작(사람 좌표계: +x가 바라보는 쪽)
    const skin = '#f1c9a5', k = Math.min(1, e / dur);
    switch (act) {
      case 'gate': { const a = Math.sin(e * 9) * 1.1; poly([[0, -35], [7, -38], [9, -46]], 4, skin); c.save(); c.translate(9, -46); c.rotate(-0.4 + a); c.fillStyle = '#ff1744'; c.globalAlpha = 0.8; c.fillRect(-2, -20, 4, 20); c.globalAlpha = 0.25; disc(0, -20, 8, '#ff5252'); c.restore(); break; } // 경광봉으로 출입 통제
      case 'flash': { const sw = Math.sin(e * 2.5) * 10; poly([[0, -35], [9, -38], [14, -40]], 4, skin); c.fillStyle = '#37474f'; c.fillRect(13, -43, 8, 5); c.fillStyle = 'rgba(255,241,118,.35)'; c.beginPath(); c.moveTo(21, -41); c.lineTo(70, -66 + sw); c.lineTo(70, -26 + sw); c.closePath(); c.fill(); break; } // 손전등으로 벽 점검
      case 'defect': { poly([[0, -35], [9, -42], [15, -48]], 4, skin); c.strokeStyle = '#37474f'; c.lineWidth = 1.5; c.beginPath(); c.arc(18, -52, 5, 0, Math.PI * 2); c.stroke(); c.fillStyle = 'rgba(178,235,242,.5)'; disc(18, -52, 4, 'rgba(178,235,242,.5)'); break; } // 돋보기로 하자 찾기
      case 'pickup': case 'drop': { const q = act === 'pickup' ? k : 1 - k, by = -6 - 28 * q; poly([[0, -35], [8, -30 + (1 - q) * 14], [12, by + 4]], 4, skin); c.fillStyle = '#c8a26b'; c.fillRect(6, by - 6, 16, 13); c.strokeStyle = '#8d6e63'; c.lineWidth = 1; c.strokeRect(6, by - 6, 16, 13); break; } // 상자 들기·내려놓기
      case 'board': { const w = Math.sin(e * 6) * 4; poly([[0, -35], [8, -44], [16 + w, -54]], 4, skin); limb(16 + w, -54, 20 + w, -58, 2.5, '#1e5aa8'); break; } // 보드에 쓰기
      case 'clip': { poly([[0, -35], [8, -36], [10, -42]], 4, skin); c.fillStyle = '#795548'; c.fillRect(8, -52, 11, 14); c.fillStyle = '#fff'; c.fillRect(9, -50, 9, 11); const t = Math.floor(e * 1.5) % 3; for (let i = 0; i <= t; i++) poly([[10, -47 + i * 3], [12, -45 + i * 3], [16, -49 + i * 3]], 1, '#0984e3'); break; } // 점검표 체크
      case 'draw': { poly([[0, -35], [9, -33], [14, -30]], 4, skin); c.fillStyle = '#90caf9'; c.fillRect(6, -40, 26, 14); c.strokeStyle = '#fff'; c.lineWidth = 0.8; c.strokeRect(9, -37, 9, 8); c.beginPath(); c.moveTo(20, -37); c.lineTo(29, -29); c.stroke(); break; } // 청사진에 그리기
      case 'laser': { poly([[0, -35], [9, -37], [13, -40]], 4, skin); c.fillStyle = '#ff6d00'; c.fillRect(12, -44, 9, 7); break; } // 레이저 측정기
      case 'paint': { const v = Math.sin(e * 4) * 16; poly([[0, -35], [8, -40], [12, -42 + v * 0.4]], 4, skin); limb(12, -42 + v * 0.4, 18, -48 + v, 2, '#8d6e63'); c.fillStyle = '#ffb74d'; c.fillRect(15, -58 + v, 6, 13); break; } // 롤러 칠
      case 'tile': { const v = (e * 1.2) % 1; poly([[0, -35], [8, -40 - v * 6], [16, -44 - v * 10]], 4, skin); c.fillStyle = '#e3f2fd'; c.fillRect(14, -50 - v * 10, 9, 9); c.strokeStyle = '#90a4ae'; c.lineWidth = 1; c.strokeRect(14, -50 - v * 10, 9, 9); break; } // 타일 붙이기
      case 'meet': { poly([[0, -35], [10, -30], [18, -24]], 4, skin); disc(19, -23, 2, skin); break; } // 도면을 가리키며 협의
      case 'column': { poly([[0, -35], [6, -46], [10, -56]], 4, skin); limb(10, -56, 10, -14, 1, '#37474f'); c.fillStyle = '#ffc400'; c.beginPath(); c.moveTo(7, -14); c.lineTo(13, -14); c.lineTo(10, -8); c.closePath(); c.fill(); break; } // 다림추로 기둥 수직 확인
      case 'cctv': { poly([[0, -27], [8, -24], [14, -22]], 4, skin); break; } // 앉아서 모니터 조작
    }
  }
  function drawWorkFx(r, x, y, face, e) {
    const a = r.work.st.act;
    if (a === 'laser') { const yy = y - 41; c.strokeStyle = 'rgba(255,23,68,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + face * 21, yy); c.lineTo(x + face * 150, yy); c.stroke(); disc(x + face * 150, yy, 2.5, '#ff1744'); }
    if (a === 'cctv' && Math.floor(e * 2) % 4 === 0) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; for (let k = 0; k < 2; k++) { const rr = 6 + ((e * 20 + k * 8) % 16); c.beginPath(); c.arc(x - face * 4, y - 46, rr, Math.PI * 0.9, Math.PI * 1.4); c.stroke(); } }
  }
  function drawElevators(front) {
    for (const E of EL) {
      const x = E.x, top = E.hi - 52;
      if (!front) {
        c.fillStyle = 'rgba(55,71,79,.18)'; c.fillRect(x - 15, top, 30, E.lo - top);
        c.strokeStyle = '#78909c'; c.lineWidth = 2; for (const dx of [-15, 15]) { c.beginPath(); c.moveTo(x + dx, top); c.lineTo(x + dx, E.lo + 4); c.stroke(); }
        c.fillStyle = '#455a64'; c.fillRect(x - 17, top - 6, 34, 6);
        limb(x, top, x, E.y - 44, 1, '#37474f'); // 케이블
        c.fillStyle = E.busy ? 'rgba(38,50,56,.55)' : '#b0bec5'; c.fillRect(x - 13, E.y - 44, 26, 44); // 차 안(비어 있으면 닫힌 문)
        if (!E.busy) { c.strokeStyle = '#78909c'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, E.y - 44); c.lineTo(x, E.y); c.stroke(); }
        for (const fy of [E.lo, E.hi]) { disc(x + 22, fy - 34, 3, Math.abs(E.y - fy) < 1 ? '#00e676' : '#546e7a'); } // 층 표시등: 차가 있는 층이 초록
      } else {
        c.strokeStyle = YEL; c.lineWidth = 2; c.strokeRect(x - 13, E.y - 44, 26, 44);
        c.fillStyle = YEL; c.fillRect(x - 15, E.y - 47, 30, 3);
      }
    }
    if (!front) { c.fillStyle = '#546e7a'; c.font = 'bold 11px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; for (const E of EL) c.fillText('EV', E.x, E.hi - 60); }
  }
  function drawPops() { c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 15px "Malgun Gothic", sans-serif'; for (const p of pops) { c.globalAlpha = Math.max(0, p.life / 0.9); c.fillStyle = p.col; c.fillText(p.t, p.x, p.y); } c.globalAlpha = 1; }

  /* ---------- 3층 단면도 경로(트랙 대신, 사용자 11-16) ----------
     1층 출입구 → 오른쪽 계단 → 2층 → 왼쪽 계단 → 3층 끝까지 갔다가 같은 길로 내려온다. 왕복 1번 = 1공정.
     app.js의 pathPos·pathLen·startPt·출구 판정이 공사판에서는 이 함수들을 쓴다. 차선 R(141~201)은 앞뒤 깊이(±9px)로만 쓴다. */
  const F1 = 588, F2 = 448, F3 = 308, ROOF = 168, SEC = { x0: 240, x1: 960 };
  const ROUTE = [[640, F1], [820, F1], [940, F1 - 70], [820, F2], [380, F2], [260, F2 - 70], [380, F3], [900, F3]];
  const SEG = []; let ONE = 0;
  for (let i = 1; i < ROUTE.length; i++) { const [x1, y1] = ROUTE[i - 1], [x2, y2] = ROUTE[i], l = Math.hypot(x2 - x1, y2 - y1); SEG.push({ x1, y1, x2, y2, l, s0: ONE }); ONE += l; }
  const SPEED_K = 0.85; // 공사판은 걷는다
  function routePos(t, R) {
    t = ((t % 1) + 1) % 1;
    let s = t * 2 * ONE, back = false;
    if (s > ONE) { s = 2 * ONE - s; back = true; }
    let g = SEG[SEG.length - 1];
    for (const sg of SEG) if (s <= sg.s0 + sg.l) { g = sg; break; }
    const k = Math.max(0, Math.min(1, (s - g.s0) / g.l)), dx = (g.x2 - g.x1) / g.l, dy = (g.y2 - g.y1) / g.l, d = ((R || 165) - 165) * 0.25;
    return { x: g.x1 + (g.x2 - g.x1) * k, y: g.y1 + (g.y2 - g.y1) * k + d, hx: back ? -dx : dx, hy: back ? -dy : dy };
  }
  /* ---------- 역할별 업무 동선(사용자 11-16) ----------
     역할마다 들를 곳(정류장)이 있고, 1층 출입구에서 출발해 차례로 들러 일한 뒤 출입구로 돌아오면 1공정.
     층을 바꿀 땐 계단(1↔2층 오른쪽, 2↔3층 왼쪽)을 지나고, 그 옆 엘리베이터가 내 층에 비어 있으면 탄다.
     정류장: [x, 층, 동작, 초, 말풍선(현황판에도 표시), 바라볼 x] */
  const FY = { 1: F1, 2: F2, 3: F3 }, ENT = { x: 640, f: 1 };
  const STAIR = { 1: { pts: [[820, F1], [940, F1 - 70], [820, F2]], el: 0 }, 2: { pts: [[380, F2], [260, F2 - 70], [380, F3]], el: 1 } }; // 키 = 아래층
  const JOBS = {
    security: [[664, 1, 'gate', 2.5, '출입 통제', 640], [262, 1, 'flash', 2.5, '외벽 점검', 240], [540, 2, 'flash', 2.2, '실내 점검'], [770, 3, 'flash', 2.2, '창호 점검', 770]],
    qa: [[226, 1, 'defect', 2.8, '외벽 하자 확인', 240], [700, 2, 'defect', 2.8, '도장 하자 확인', 720], [480, 3, 'defect', 2.8, '슬래브 균열 확인', 500], [870, 1, 'defect', 2.5, '계단 하자 확인', 900]],
    auditor: [[330, 1, 'pickup', 2, '자재 수령'], [532, 2, 'drop', 2, '2층 자재 납품'], [330, 1, 'pickup', 2, '자재 수령'], [697, 3, 'drop', 2, '3층 자재 납품']],
    planner: [[465, 2, 'board', 3.5, '공정표 갱신', 465], [660, 3, 'clip', 2.5, '공정 진척 확인'], [560, 1, 'clip', 2, '자재 일정 확인']],
    designer: [[605, 2, 'draw', 3.5, '도면 수정', 605], [740, 3, 'laser', 2.8, '현장 실측 대조', 800]],
    frontend: [[700, 2, 'paint', 3.2, '벽 도장', 700], [600, 3, 'tile', 3.2, '타일 시공', 600]],
    pm: [[886, 3, 'cctv', 5, 'CCTV로 현장 확인', 930], [640, 2, 'meet', 2.6, '도면 협의', 605]],
    backend: [[612, 1, 'column', 2.5, '기둥 수직 확인', 601], [612, 2, 'column', 2.5, '기둥 수직 확인', 601], [612, 3, 'column', 2.5, '기둥 수직 확인', 601]],
  };
  function buildRoute(stops) {
    const pts = [[ENT.x, F1]], marks = [], st = [];
    let cur = { x: ENT.x, f: 1 };
    const legTo = to => {
      while (cur.f !== to.f) {
        const up = to.f > cur.f, S0 = STAIR[up ? cur.f : cur.f - 1], p = up ? S0.pts : S0.pts.slice().reverse();
        pts.push(p[0]); const i0 = pts.length - 1; pts.push(p[1]); pts.push(p[2]);
        st.push({ i0, i1: pts.length - 1, el: S0.el, up });
        cur = { x: p[2][0], f: up ? cur.f + 1 : cur.f - 1 };
      }
      pts.push([to.x, FY[to.f]]); cur = { x: to.x, f: to.f };
    };
    for (const j of stops) { legTo({ x: j[0], f: j[1] }); marks.push({ i: pts.length - 1, x: j[0], f: j[1], act: j[2], dur: j[3], say: j[4], fx: j[5] == null ? null : j[5] }); }
    legTo(ENT);
    const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, S, len: S[S.length - 1], stops: marks.map(m => Object.assign(m, { s: S[m.i] })), stairs: st.map(q => Object.assign(q, { s0: S[q.i0], s1: S[q.i1] })) };
  }
  const RT = {}; for (const k in JOBS) RT[k] = buildRoute(JOBS[k]);
  function rtPos(rt, s, R) {
    s = ((s % rt.len) + rt.len) % rt.len;
    let i = 1; while (i < rt.pts.length - 1 && rt.S[i] < s) i++;
    const [x1, y1] = rt.pts[i - 1], [x2, y2] = rt.pts[i], l = (rt.S[i] - rt.S[i - 1]) || 1, k = Math.max(0, Math.min(1, (s - rt.S[i - 1]) / l));
    return { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k + ((R || 165) - 165) * 0.25, hx: (x2 - x1) / l, hy: (y2 - y1) / l };
  }
  const rtOf = r => RT[r.role] || RT.security;
  const sOf = r => (((r.t % 1) + 1) % 1) * rtOf(r).len;
  const roleLen = r => rtOf(r).len;
  const rolePos = r => rtPos(rtOf(r), sOf(r), r.R);
  const startT = r => (2 + (r.slot % 8) * 2 + (r.slot >= 8 ? 1 : 0)) / rtOf(r).len; // 첫 정류장 창(s≥22)보다 앞에서 출발(qa 11-16 P3-2)
  const startPt = r => rtPos(rtOf(r), startT(r) * rtOf(r).len, r.laneR);
  const entry = R => Object.assign(routePos(0, R), { t: 0 }); // 정리반 청소는 공용 왕복 길
  const inExit = (r, tt) => { const L0 = rtOf(r).len, s = tt * L0; return s < 18 || s > L0 - 18; }; // 1층 출입구 근처
  const working = r => !!r.work && r.state === 'run' && simTime < r.work.until;
  const nowJob = r => working(r) ? r.work.st.say : '';

  /* 엘리베이터: E1(1~2층, 오른쪽 계단 옆), E2(2~3층, 왼쪽 계단 옆). 차는 마지막으로 내린 층에 멈춰 있다.
     계단 앞에 왔을 때 차가 내 층에 비어 있으면 타고, 아니면 계단. 건너뛴 계단 길이만큼 lapF를 더해 공정 수는 계단과 같다. */
  const EL = [{ id: 'E1', x: 790, lo: F1, hi: F2, y: F1, busy: null }, { id: 'E2', x: 400, lo: F2, hi: F3, y: F2, busy: null }];
  const EL_SPEED = 55, EL_WALK = 110;
  function elCheck(r) {
    if (r.el || (r.role === 'backend' && r.ovK > 0)) return;
    const rt = rtOf(r), s = sOf(r);
    for (let k = 0; k < rt.stairs.length; k++) {
      const q = rt.stairs[k];
      if (!(s >= q.s0 - 12 && s <= q.s0 + 2)) continue;
      const key = Math.floor(r.t) + ':' + k; if (r.elKey === key) return; r.elKey = key; // 이번 통과에 한 번만 판단
      const E = EL[q.el], from = q.up ? E.lo : E.hi, to = q.up ? E.hi : E.lo;
      if (E.busy || E.y !== from) return; // 다른 층에 있거나 누가 타고 있으면 계단
      E.busy = r; r.el = { E, phase: 'in', from, to, outS: q.s1, skip: q.s1 - q.s0 };
      say(r, q.up ? '엘리베이터 ▲' : '엘리베이터 ▼', 1.2); return;
    }
  }
  function elStep(r, dt) { // 걸어 들어감 → 이동 → 내려서 계단 끝 지점으로
    const v = r.el, E = v.E, rt = rtOf(r), step = (tx, ty) => { const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), m = EL_WALK * dt; r.ph += dt * 8; if (Math.abs(dx) > 0.5) r.face = dx > 0 ? 1 : -1; if (d <= m) { r.x = tx; r.y = ty; return true; } r.x += dx / d * m; r.y += dy / d * m; return false; };
    if (v.phase === 'in') { if (step(E.x, v.from)) v.phase = 'ride'; }
    else if (v.phase === 'ride') { const d = v.to - E.y, m = EL_SPEED * dt; if (Math.abs(d) <= m) { E.y = v.to; v.phase = 'out'; } else E.y += Math.sign(d) * m; r.x = E.x; r.y = E.y; }
    else {
      const p = rtPos(rt, v.outS, r.laneR);
      if (step(p.x, p.y)) { r.t = Math.floor(r.t) + v.outS / rt.len; r.lapF += v.skip / rt.len; E.busy = null; r.el = null; return false; }
    }
    return true;
  }
  function startWork(r, st) {
    r.work = { st, at: simTime, until: simTime + st.dur }; r.lastPop = -1;
    say(r, st.say, 1.4);
    if (st.act === 'defect') { r.work.mark = { x: st.fx != null ? st.fx : st.x + 20, y: FY[st.f] - 40, ok: false, until: simTime + st.dur + 8 }; marks.push(r.work.mark); } // 작업이 끊겨도 빨간 표시가 남지 않게(until)
  }
  function endWork(r) {
    const st = r.work.st;
    if (st.act === 'pickup') r.carry = true;
    if (st.act === 'drop') { r.carry = false; dlv[st.f] = (dlv[st.f] + 1) % 6; pops.push({ x: st.x, y: FY[st.f] - 50, t: '납품 ✔', col: '#ffeb3b', life: 1.2 }); }
    if (st.act === 'defect' && r.work.mark) { r.work.mark.ok = true; r.work.mark.until = simTime + 5; }
    if (st.act === 'flash') pops.push({ x: st.x, y: FY[st.f] - 70, t: '이상 없음', col: '#b9f6ca', life: 1.2 });
    if (st.act === 'column') pops.push({ x: st.x, y: FY[st.f] - 70, t: '수직 OK', col: '#b9f6ca', life: 1.2 });
    r.work = null;
  }
  function hold(r, dt) {
    if (r.role === 'backend' && r.ovK > 0 && !r.el && !r.work) return false; // 리프트로 크레인·꼭대기에 가는 중이면 동선 작업·엘리베이터를 쓰지 않는다
    if (r.el) { if (r.state !== 'run') { r.el.E.busy = null; r.el = null; } else return elStep(r, dt || 0); }
    if (r.work) { if (working(r)) return true; endWork(r); }
    elCheck(r); if (r.el) return elStep(r, dt || 0);
    if (!r.active || fatOf(r.lapF, r.freshAt) >= 15) return false; // 쉬러 가는 사람·수레 탄 사람은 일하지 않고 지나간다
    const rt = rtOf(r), s = sOf(r);
    for (let k = 0; k < rt.stops.length; k++) {
      const st = rt.stops[k];
      if (s < st.s - 2 || s > st.s + 14) continue;
      const key = Math.floor(r.t) + ':' + k; if (r.workKey === key) continue; r.workKey = key;
      startWork(r, st); return true;
    }
    return false;
  }

  /* 단면도 정적 그림 — 처음 한 번 오프스크린에 그려 두고 매 프레임 붙인다 */
  let secCv = null;
  function drawSection() {
    if (!secCv) { secCv = document.createElement('canvas'); secCv.width = W; secCv.height = H; const prev = c; c = secCv.getContext('2d'); try { paintSection(); } finally { c = prev; } }
    c.drawImage(secCv, 0, 0);
  }
  function stairs(x1, y1, x2, y2, n) { // 계단 한 단(디딤판 n개)과 난간
    const sx = (x2 - x1) / n, sy = (y2 - y1) / n;
    c.fillStyle = '#9ea3a8'; c.beginPath(); c.moveTo(x1, y1);
    for (let i = 0; i < n; i++) { c.lineTo(x1 + sx * i, y1 + sy * (i + 1)); c.lineTo(x1 + sx * (i + 1), y1 + sy * (i + 1)); }
    c.lineTo(x2, y2 + 9); c.lineTo(x1 + sx, y1 + 9); c.closePath(); c.fill();
    c.strokeStyle = '#6d7378'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = YEL; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1 - 26); c.lineTo(x2, y2 - 26); c.stroke();
    for (const [px, py] of [[x1, y1], [x2, y2]]) { c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 26); c.stroke(); }
  }
  function slab(y, g0, g1) { // 슬래브(계단 자리 g0~g1은 뚫림)
    const { x0, x1 } = SEC;
    c.fillStyle = '#8f959a';
    if (g0 == null) c.fillRect(x0 - 6, y, x1 - x0 + 12, 9); else { c.fillRect(x0 - 6, y, g0 - x0 + 6, 9); c.fillRect(g1, y, x1 + 6 - g1, 9); }
    c.fillStyle = '#6d7378'; c.fillRect(x0 - 6, y + 9, x1 - x0 + 12, 1);
  }
  function paintSection() {
    const { x0, x1 } = SEC;
    [[ROOF + 9, F3, '#cfc9bd'], [F3 + 9, F2, '#d7d1c5'], [F2 + 9, F1, '#ded8cc']].forEach(([a, b, col]) => { // 층마다 안벽(거푸집 벽) 색을 조금 다르게
      c.fillStyle = col; c.fillRect(x0, a, x1 - x0, b - a);
      c.fillStyle = 'rgba(0,0,0,.08)'; for (let x = x0 + 22; x < x1; x += 40) for (let y = a + 16; y < b - 6; y += 30) c.fillRect(x, y, 3, 3); // 폼타이 자국
    });
    c.fillStyle = '#a7aca9'; for (const x of [x0, 596, x1 - 10]) c.fillRect(x, ROOF, 10, F1 - ROOF + 9); // 기둥
    slab(ROOF); slab(F3, 256, 384); slab(F2, 816, 944); slab(F1);
    for (let x = x0 + 6; x < x1; x += 28) limb(x, ROOF, x, ROOF - 14, 2, STEEL); // 옥상에 삐죽 나온 철근(공사 중)
    stairs(820, F1, 940, F1 - 70, 6); c.fillStyle = '#9ea3a8'; c.fillRect(940, F1 - 70, 18, 9); stairs(940, F1 - 70, 820, F2, 6);
    stairs(380, F2, 260, F2 - 70, 6); c.fillStyle = '#9ea3a8'; c.fillRect(242, F2 - 70, 18, 9); stairs(260, F2 - 70, 380, F3, 6);
    c.fillStyle = '#6d7378'; c.font = 'bold 15px "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText('3층', 252, ROOF + 30); c.fillText('2층', 252, F3 + 30); c.fillText('1층', 252, F2 + 30);
    // 공간 이름표 — 이 자리에서 무슨 일을 하는지(사용자 11-16)
    [['자재 하역장', 325, F2 + 24], ['철근 가공장', 460, F2 + 24], ['출입 통제소', 664, F2 + 24],
     ['공정 계획실', 465, F3 + 24], ['자재 적치', 532, F3 + 24], ['설계 검토실', 605, F3 + 24], ['마감·도장', 701, F3 + 24],
     ['품질 점검 구역', 480, ROOF + 24], ['타일 시공', 602, ROOF + 24], ['자재 적치', 697, ROOF + 24], ['창호', 770, ROOF + 24], ['상황실 · CCTV', 894, ROOF + 24]].forEach(([t, x, y]) => sign(t, x, y));
    // 1층 왼쪽 자재 적치: 벽돌 팔레트·철근 다발·모래
    for (const bx of [276, 330]) { c.fillStyle = '#b5543c'; c.fillRect(bx, F1 - 24, 44, 20); c.strokeStyle = '#8a3f2c'; c.lineWidth = 1; for (const y of [F1 - 17, F1 - 10]) { c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + 44, y); c.stroke(); } c.fillStyle = '#8d6e63'; c.fillRect(bx, F1 - 4, 44, 4); }
    for (const y of [F1 - 4, F1 - 8, F1 - 12]) limb(400, y, 520, y, 2.5, STEEL);
    c.fillStyle = '#d9b47a'; c.beginPath(); c.moveTo(540, F1); c.lineTo(572, F1 - 28); c.lineTo(604, F1); c.closePath(); c.fill();
  }
  function drawBoard() { // 공정 현황(위쪽 하늘 자리, 두 줄)
    const X = 236, Y = 8, Wd = 794, Hh = 150;
    c.fillStyle = 'rgba(0,0,0,.62)'; rrect(X, Y, Wd, Hh, 10); c.fill();
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = 'bold 16px "Malgun Gothic", sans-serif';
    c.fillText(txt.boardTitle, X + 14, Y + 18);
    c.textAlign = 'right'; c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3';
    c.fillText(txt.running(runners.filter(r => r.state === 'run').length), X + Wd - 12, Y + 18);
    AGENTS.map(a => ({ a })).concat([{ cleaner: true }]).forEach((row, i) => {
      const x0 = X + 10 + (i < 5 ? 0 : 392), y = Y + 44 + (i % 5) * 22;
      let name, color, st, laps = '', task = '', hi = false, bright = false;
      if (row.cleaner) { const on = jan.present && !jan.cameo; name = CLEANER.name; color = CLEANER.color; st = on ? JOB_LABEL[jan.job] : '대기'; task = jan.task || ''; hi = jan.active; bright = on; }
      else {
        const rs = runners.filter(r => r.role === row.a.id), act = rs.filter(r => r.active), lead = rs.find(r => r.state === 'run') || act[0] || rs[0];
        name = row.a.name + (act.length > 1 ? ' ×' + act.length : ''); color = row.a.color; st = nowJob(lead) || stateLabel(lead); // 공사판: 일하는 중이면 하는 일 이름
        laps = Math.max(...rs.map(lapInt)) + txt.unit; task = rs.map(r => r.task).filter(Boolean).join(' / '); hi = act.length > 0; bright = lead.state === 'run';
      }
      if (hi) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x0 - 4, y - 10, 384, 21); }
      disc(x0 + 6, y, 5.5, color);
      c.textAlign = 'left'; c.font = 'bold 14px "Malgun Gothic", sans-serif'; c.fillStyle = bright ? '#fff' : '#cfd8dc'; c.fillText(name, x0 + 18, y);
      c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = bright ? '#ffeaa7' : '#b2bec3'; c.fillText(st, x0 + 100, y);
      if (laps) { c.textAlign = 'right'; c.font = 'bold 14px "Malgun Gothic", sans-serif'; c.fillStyle = '#fff'; c.fillText(laps, x0 + 252, y); }
      if (task) { c.textAlign = 'left'; c.font = '11px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3'; let tk = task; while (tk.length > 1 && c.measureText(tk).width > 118) tk = tk.slice(0, -2) + '…'; c.fillText(tk, x0 + 260, y); }
    });
  }
  /* ---------- 배경 ---------- */
  function drawBg() {
    const g = c.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, '#8ecae6'); g.addColorStop(1, '#cfe8f3');
    c.fillStyle = g; c.fillRect(0, 0, W, 170);
    c.fillStyle = '#b08a5a'; c.fillRect(0, 164, W, 436);
    c.fillStyle = '#9c774a'; for (let i = 0; i < 200; i++) { const x = (i * 197) % W, y = 172 + (i * 89) % 420; c.fillRect(x, y, 3, 2); }
    drawSection(); // 3층 단면도(트랙 대신, 사용자 11-16)
    // 휴게 패드
    c.fillStyle = '#cfd2cc'; c.fillRect(0, 600, W, 200); c.fillStyle = '#a9ada6'; c.fillRect(0, 600, W, 4);
    // 휴게 컨테이너
    c.fillStyle = '#2e7d6b'; c.fillRect(40, 628, 420, 58);
    c.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 48; x < 460; x += 14) c.fillRect(x, 630, 3, 54);
    c.fillStyle = '#cfe8f3'; c.fillRect(380, 640, 50, 22);
    // 그늘막(누워 쉬는 곳)
    c.fillStyle = '#546e7a'; c.fillRect(792, 700, 4, 34); c.fillRect(1164, 700, 4, 34);
    c.fillStyle = '#e85d2a'; c.fillRect(790, 694, 380, 8);
    c.fillStyle = '#f5f5f5'; for (let x = 790; x < 1170; x += 40) c.fillRect(x, 694, 20, 8);
    label('휴게 컨테이너', 12, 620); label('벤치', 40, 776); label('🧊 정수기', 560, 776); label('⛱️ 그늘 휴게', 800, 782);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = fz(12, 11, 1.3) + 'px "Malgun Gothic", sans-serif'; c.fillText('▲ 1층 출입구', 600, 616);
  }
  function drawYard() {
    for (let i = 0; i < 4; i++) drawBeam(YARD.x + (i % 2) * 6, YARD.y + 20 - i * 8, YARD.w - 10);
    label('자재 야적장', YARD.x, YARD.y + 44, '#3e2f1c');
  }
  function drawBeam(x, y, w) {
    c.fillStyle = STEEL; c.fillRect(x, y, w, 7);
    c.fillStyle = '#7f2f1d'; c.fillRect(x, y + 2.5, w, 2);
  }
  function sign(text, x, y) { c.font = 'bold 11px "Malgun Gothic", sans-serif'; const w = c.measureText(text).width + 10; c.fillStyle = '#ffd54f'; c.fillRect(x - w / 2, y - 8, w, 16); c.strokeStyle = '#8d6e63'; c.lineWidth = 1; c.strokeRect(x - w / 2, y - 8, w, 16); c.fillStyle = '#3e2f1c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + 0.5); }
  function boxes(x, y, n) { for (let i = 0; i < n; i++) { const bx = x + (i % 3) * 13, by = y - 12 - Math.floor(i / 3) * 12; c.fillStyle = '#c8a26b'; c.fillRect(bx, by, 12, 11); c.strokeStyle = '#8d6e63'; c.lineWidth = 1; c.strokeRect(bx, by, 12, 11); } c.fillStyle = '#8d6e63'; c.fillRect(x - 2, y - 2, 42, 2); }
  function drawProps() {
    // 1층: 출입 통제소(라바콘·통제선)
    for (const x of [650, 678]) { const y = F1; c.fillStyle = '#ff6d00'; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.lineTo(x, y - 18); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - 3, y - 10, 6, 3); }
    if (prop.cones > 0) { c.strokeStyle = 'rgba(255,23,68,' + (0.3 + 0.5 * prop.cones * Math.abs(Math.sin(simTime * 6))).toFixed(3) + ')'; c.lineWidth = 2; c.beginPath(); c.moveTo(650, F1 - 12); c.lineTo(678, F1 - 12); c.stroke(); }
    // 2층: 공정 계획실 화이트보드(막대가 하나씩 늘어남)
    c.fillStyle = '#fafafa'; c.fillRect(430, F2 - 92, 70, 40); c.strokeStyle = '#546e7a'; c.lineWidth = 2; c.strokeRect(430, F2 - 92, 70, 40);
    const bars = Math.floor(prop.wb);
    for (let i = 0; i < 5; i++) { c.fillStyle = i < bars ? ['#f9a825', '#0984e3', '#6c5ce7', '#00b894', '#e84393'][i] : '#e0e0e0'; c.fillRect(435 + i * 7, F2 - 86 + i * 6, 22, 4); }
    // 2층: 자재 적치(납품하면 쌓임)
    boxes(514, F2, dlv[2]);
    // 2층: 설계 검토 테이블
    c.fillStyle = '#8d6e63'; c.fillRect(575, F2 - 26, 60, 5); c.fillRect(579, F2 - 21, 4, 21); c.fillRect(627, F2 - 21, 4, 21);
    c.fillStyle = '#90caf9'; c.fillRect(579, F2 - 32, 52, 6); c.strokeStyle = '#1e5aa8'; c.lineWidth = 0.8; c.strokeRect(579, F2 - 32, 52, 6);
    // 2층: 마감·도장 벽(칠한 만큼 색이 찬다) + 작은 비계
    c.fillStyle = '#c9c3b6'; c.fillRect(668, F2 - 100, 66, 72); c.fillStyle = '#ffb74d'; c.fillRect(668, F2 - 100, 66 * Math.min(1, prop.paint), 72);
    c.strokeStyle = '#78909c'; c.lineWidth = 2; for (const x of [666, 736]) { c.beginPath(); c.moveTo(x, F2); c.lineTo(x, F2 - 104); c.stroke(); } for (const y of [F2 - 36, F2 - 72]) { c.beginPath(); c.moveTo(664, y); c.lineTo(738, y); c.stroke(); }
    // 3층: 타일 벽(붙인 만큼 늘어남)
    c.fillStyle = '#bdb6a8'; c.fillRect(566, F3 - 96, 72, 60);
    for (let i = 0; i < Math.floor(prop.tile); i++) { const tx = 568 + (i % 6) * 12, ty = F3 - 48 - Math.floor(i / 6) * 12; c.fillStyle = '#e3f2fd'; c.fillRect(tx, ty, 11, 11); c.strokeStyle = '#90a4ae'; c.lineWidth = 0.6; c.strokeRect(tx, ty, 11, 11); }
    // 3층: 자재 적치·창호
    boxes(680, F3, dlv[3]);
    c.fillStyle = '#7fb3d5'; c.fillRect(746, F3 - 100, 48, 40); c.strokeStyle = '#546e7a'; c.lineWidth = 3; c.strokeRect(746, F3 - 100, 48, 40); c.lineWidth = 1.5; c.beginPath(); c.moveTo(770, F3 - 100); c.lineTo(770, F3 - 60); c.stroke();
    // 3층: 상황실(CCTV 모니터 — 층별 작업자가 점으로 실시간 보임)
    c.fillStyle = 'rgba(38,50,56,.12)'; c.fillRect(836, F3 - 120, 116, 120); c.fillStyle = '#90a4ae'; c.fillRect(834, F3 - 120, 3, 120);
    c.fillStyle = '#5d4037'; c.fillRect(898, F3 - 28, 52, 5); c.fillRect(944, F3 - 23, 4, 23);
    [[3, 900, F3 - 70], [2, 926, F3 - 70], [1, 913, F3 - 50]].forEach(([fl, mx, my]) => {
      c.fillStyle = '#263238'; c.fillRect(mx - 1, my - 1, 26, 18); c.fillStyle = '#1b5e20'; c.fillRect(mx, my, 24, 16);
      c.fillStyle = '#c8e6c9'; c.font = 'bold 7px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(fl + 'F', mx + 1, my + 1);
      for (const r of runners) if (r.state !== 'inAmb' && r.state !== 'away' && Math.abs(r.y - FY[fl]) < 30 && r.x > SEC.x0 - 30 && r.x < SEC.x1 + 30) disc(mx + 2 + (r.x - SEC.x0 + 30) / (SEC.x1 - SEC.x0 + 60) * 20, my + 12, 1.4, r.color);
    });
    // QA 하자 표시: 빨간 ! → 확인되면 초록 ✔(5초 뒤 사라짐)
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 11px sans-serif';
    for (const m of marks) { c.globalAlpha = m.ok ? Math.min(1, (m.until - simTime) / 1.5) : 1; disc(m.x, m.y, 7, m.ok ? '#00c853' : '#e53935'); c.fillStyle = '#fff'; c.fillText(m.ok ? '✔' : '!', m.x, m.y + 0.5); if (!m.ok) { c.strokeStyle = '#e53935'; c.lineWidth = 1; c.beginPath(); c.moveTo(m.x - 10, m.y + 10); c.lineTo(m.x - 4, m.y + 16); c.lineTo(m.x - 8, m.y + 22); c.stroke(); } }
    c.globalAlpha = 1;
  }
  function drawBuilding() {
    const f = floors(), n = Math.min(f, BLD.maxMain), cut = f > BLD.maxMain;
    for (let i = 0; i < n; i++) {
      const real = cut ? f - n + i + 1 : i + 1; // 이 칸이 몇 층인지(잘렸으면 아래쪽은 생략)
      const y = BLD.baseY - (i + 1) * BLD.floorH;
      const fromTop = f - real; // 0 = 맨 위(철골), 1~2 = 외벽, 그 아래 유리
      if (cut && i === n - 1) continue; // 잘린 꼭대기는 지그재그로
      if (fromTop === 0) {
        c.strokeStyle = STEEL; c.lineWidth = 3;
        for (let b = 0; b <= 4; b++) { c.beginPath(); c.moveTo(BLD.x + b * BLD.w / 4, y + BLD.floorH); c.lineTo(BLD.x + b * BLD.w / 4, y); c.stroke(); }
        c.beginPath(); c.moveTo(BLD.x, y + 1); c.lineTo(BLD.x + BLD.w, y + 1); c.stroke();
        c.lineWidth = 1; for (let b = 0; b < 4; b++) { c.beginPath(); c.moveTo(BLD.x + b * BLD.w / 4, y + BLD.floorH); c.lineTo(BLD.x + (b + 1) * BLD.w / 4, y); c.stroke(); }
      } else {
        c.fillStyle = fromTop <= 2 ? WALL : GLASS; c.fillRect(BLD.x, y, BLD.w, BLD.floorH);
        if (fromTop > 2) { c.fillStyle = GLASS_HI; for (let b = 0; b < 4; b++) c.fillRect(BLD.x + 6 + b * BLD.w / 4, y + 4, BLD.w / 4 - 14, 3); }
      }
      c.fillStyle = SLAB; c.fillRect(BLD.x - 2, y + BLD.floorH - 3, BLD.w + 4, 3);
    }
    if (cut) { // 화면 위로 넘어감 — 지그재그 단면과 안내
      const y = BLD.baseY - BLD.maxMain * BLD.floorH + BLD.floorH;
      c.fillStyle = GLASS; c.beginPath(); c.moveTo(BLD.x, y);
      for (let k = 0; k <= 8; k++) c.lineTo(BLD.x + k * BLD.w / 8, y - (k % 2 ? 8 : 0));
      c.lineTo(BLD.x + BLD.w, y); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold ' + fz(11, 11, 1.3) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.fillText('↑ 고도 창', BLD.x + BLD.w / 2, y + 12);
    }
    c.fillStyle = '#3e2f1c'; c.font = 'bold ' + fz(12, 11, 1.3) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText(f + '층', BLD.x + BLD.w / 2, BLD.baseY + 10);
  }
  function drawCrane() {
    const k = crane, jy = jibY(), cos = Math.cos(k.phi);
    // 기초·마스트(격자)
    c.fillStyle = '#9e9e9e'; c.fillRect(1070, 584, 36, 8);
    c.fillStyle = YEL; c.fillRect(CR.mastX - 6, jy, 12, 584 - jy);
    c.strokeStyle = '#1f1f1f'; c.lineWidth = 1;
    for (let y = jy; y < 584; y += 12) { c.beginPath(); c.moveTo(CR.mastX - 6, y); c.lineTo(CR.mastX + 6, y + 12); c.moveTo(CR.mastX + 6, y); c.lineTo(CR.mastX - 6, y + 12); c.stroke(); }
    // 꼭대기(에이펙스)·지브·카운터지브 — cos로 원근(회전) 표현
    const tip = CR.mastX + CR.jib * cos, back = CR.mastX - CR.counter * cos;
    c.strokeStyle = YEL; c.lineWidth = 5; c.beginPath(); c.moveTo(back, jy); c.lineTo(tip, jy); c.stroke();
    c.strokeStyle = '#1f1f1f'; c.lineWidth = 1; c.beginPath(); c.moveTo(back, jy); c.lineTo(CR.mastX, jy - 22); c.lineTo(tip, jy); c.stroke();
    c.fillStyle = YEL; c.fillRect(CR.mastX - 3, jy - 22, 6, 22);
    c.fillStyle = '#616161'; c.fillRect(back - 9 * Math.sign(cos || 1), jy - 3, 18 * Math.sign(cos || 1), 14); // 평형추
    // 운전석
    c.fillStyle = '#eceff1'; c.fillRect(CR.mastX - 12, jy + 4, 24, 16); c.fillStyle = 'rgba(127,179,213,.75)'; c.fillRect(CR.mastX - 10, jy + 6, 20, 8);
    // 트롤리·케이블·훅·빔
    const tx = CR.mastX + k.trolley * cos, hy = jy + k.hook;
    c.fillStyle = '#37474f'; c.fillRect(tx - 5, jy + 2, 10, 5);
    c.strokeStyle = '#37474f'; c.lineWidth = 1; c.beginPath(); c.moveTo(tx - 2, jy + 7); c.lineTo(tx - 2, hy); c.moveTo(tx + 2, jy + 7); c.lineTo(tx + 2, hy); c.stroke();
    c.fillStyle = '#ffc400'; c.fillRect(tx - 4, hy, 8, 5);
    if (k.beam) { const bw = 60 * Math.max(0.35, Math.abs(Math.sin(k.phi + Math.PI / 2))); drawBeam(tx - bw / 2, hy + 7, bw); limb(tx, hy + 5, tx - bw / 2 + 2, hy + 7, 1, '#37474f'); limb(tx, hy + 5, tx + bw / 2 - 2, hy + 7, 1, '#37474f'); }
    if (k.phase === 'place' && simTime - k.t < 0.6) { c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(tx, mainTopY() - 2, 4 + (simTime - k.t) * 30, 0, Math.PI * 2); c.fill(); }
  }
  function liftTop() { return jibY() + 21 - 34; }
  let cages = [LIFT.base];
  function updateCage() { // 타고 있는 백엔드마다 케이지 하나(동시에 둘이면 둘), 아무도 안 타면 마지막 자리에 멈춤
    const ys = [];
    for (const r of runners) { if (r.role !== 'backend' || !r.ovK) continue; const p = place(r); if (p && p.riding) ys.push(p.y); }
    if (ys.length) { cages = ys; cageY = ys[0]; } else cages = [cageY];
  }
  function drawLift() {
    updateCage();
    const x = LIFT.x, top = liftTop();
    c.fillStyle = '#9e9e9e'; c.fillRect(x - 13, LIFT.base, 26, 6);
    c.strokeStyle = '#78909c'; c.lineWidth = 2;
    for (const dx of [-11, 11]) { c.beginPath(); c.moveTo(x + dx, LIFT.base); c.lineTo(x + dx, top); c.stroke(); }
    c.lineWidth = 1; for (let y = top; y < LIFT.base; y += 14) { c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x + 11, y + 14); c.stroke(); }
    c.fillStyle = 'rgba(38,50,56,.55)'; for (const cy of cages) c.fillRect(x - 10, cy - 32, 20, 32); // 케이지 뒤판
    c.fillStyle = '#3e2f1c'; c.font = 'bold ' + fz(11, 11, 1.2) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText('리프트', x - 26, LIFT.base - 4);
  }
  function drawLiftFront() {
    const x = LIFT.x;
    for (const cy of cages) {
      c.strokeStyle = YEL; c.lineWidth = 2; c.strokeRect(x - 10, cy - 32, 20, 32);
      c.lineWidth = 1; for (const dx of [-4, 3]) { c.beginPath(); c.moveTo(x + dx, cy - 32); c.lineTo(x + dx, cy); c.stroke(); }
      c.fillStyle = YEL; c.fillRect(x - 12, cy - 35, 24, 3);
    }
  }
  function drawSignalers() { // 치어리더 대체: 깃발 신호수 2명(단면도 왼쪽 바깥)
    const on = waveOn();
    [[5, 150, 450], [19, 150, 596]].forEach(([i, x, y0]) => {
      const ch = cheers[i], jump = on ? Math.abs(Math.sin(simTime * 6 - i * 0.55)) * 4 : 0, y = y0 - jump;
      limb(x - 2, y - 12, x - 2, y, 3, '#2d3436'); limb(x + 2, y - 12, x + 2, y, 3, '#2d3436');
      limb(x, y - 12, x, y - 26, 8, '#c6ff00'); c.fillStyle = '#f5f5f5'; c.fillRect(x - 4, y - 21, 8, 1.5);
      const a = on ? Math.sin(simTime * 6 - i * 0.55) : Math.sin(simTime * 2 + i) * 0.3;
      const hx = x + 6 + Math.sin(a) * 4, hy = y - 30 - Math.cos(a) * 6;
      limb(x + 3, y - 24, hx, hy, 3, '#f1c9a5'); limb(hx, hy, hx, hy - 12, 1.5, '#5d4037');
      c.fillStyle = i % 4 ? '#ff1744' : '#00c853'; c.fillRect(hx, hy - 12, 9 + Math.sin(simTime * 8 + i) * 2, 6);
      disc(x, y - 31, 5, '#f1c9a5'); c.fillStyle = '#ffc400'; c.beginPath(); c.arc(x, y - 33, 5.6, Math.PI, 0); c.fill();
      if (ch.bubble) drawBubble(x, y - 44, ch.bubble.text);
    });
  }
  function drawOffice() { // 현장사무소(코치석 대체)
    c.fillStyle = '#e9ecef'; c.fillRect(14, 40, 196, 116);
    c.fillStyle = '#ced4da'; for (let x = 20; x < 210; x += 12) c.fillRect(x, 60, 2, 94);
    c.fillStyle = '#7fb3d5'; c.fillRect(150, 70, 44, 26); c.strokeStyle = '#495057'; c.lineWidth = 2; c.strokeRect(150, 70, 44, 26);
    c.fillStyle = '#1e5aa8'; c.fillRect(14, 46, 196, 12);
    c.fillStyle = '#fff'; c.font = 'bold ' + fz(12, 11, 1.2) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('현장사무소', 110, 52);
    c.fillStyle = '#495057'; c.fillRect(14, 156, 196, 8);
  }
  function drawSparks() {
    for (const p of sparks) { c.globalAlpha = Math.max(0, p.life / 0.5); disc(p.x, p.y, 1.6, p.life > 0.3 ? '#fff59d' : '#ff9100'); }
    c.globalAlpha = 1;
  }

  /* ---------- 고도 창 ---------- */
  function drawAltitude() {
    const f = floors();
    if (f <= BLD.maxMain) return;
    const A = ALT, zi = zoneIdx(f), ix = A.x + A.ruler, iw = A.w - A.ruler, iy = A.y + A.title, ih = A.h - A.title;
    c.save();
    c.fillStyle = '#1f1f1f'; rrect(A.x - 3, A.y - 3, A.w + 6, A.h + 6, 6); c.fill();
    c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
    const top = skyColor(f), bot = skyColor(Math.max(0, f - 25));
    const g = c.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, top); g.addColorStop(1, bot);
    c.fillStyle = g; c.fillRect(ix, iy, iw, ih);
    const starA = Math.max(0, Math.min(1, (f - 50) / 40));
    if (starA > 0) { c.fillStyle = 'rgba(255,255,255,' + starA + ')'; for (let i = 0; i < 40; i++) { const sx = ix + (i * 53) % iw, sy = iy + (i * 37) % ih; c.fillRect(sx, sy, (i % 5) ? 1 : 1.5, (i % 5) ? 1 : 1.5); } }
    if (f >= ZONES[3][0]) { c.fillStyle = '#1565c0'; c.beginPath(); c.arc(ix + iw / 2, iy + ih + 380, 400, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(129,212,250,.8)'; c.lineWidth = 3; c.stroke(); }
    // 구름(지상~성층권)
    const cloudA = f < 10 ? f / 10 : f < 70 ? 1 : Math.max(0, 1 - (f - 70) / 30);
    if (cloudA > 0) { c.fillStyle = 'rgba(255,255,255,' + (0.85 * cloudA) + ')'; for (let i = 0; i < 4; i++) { const cx = ix + ((i * 70 + sky.cloudOff * (1 + i * 0.3)) % (iw + 60)) - 30, cy = iy + 30 + i * 38; disc(cx, cy, 9, c.fillStyle); disc(cx + 10, cy - 4, 11, c.fillStyle); disc(cx + 22, cy, 8, c.fillStyle); } }
    // 비행기(구름 구간)·열기구/제트기(성층권)·인공위성/UFO(우주)
    const px = ix + sky.planeX, py = iy + 46;
    if (zi === 1 && simTime > sky.planeNext) {
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px - 60, py + 1); c.lineTo(px - 4, py + 1); c.stroke();
      c.fillStyle = '#eceff1'; rrect(px - 14, py - 3, 28, 7, 3); c.fill(); c.fillStyle = '#1e5aa8'; c.fillRect(px - 4, py - 1, 6, 9); c.fillRect(px - 14, py - 8, 4, 6);
      c.fillStyle = '#90caf9'; c.fillRect(px + 6, py - 2, 5, 2);
    }
    if (zi === 2) {
      const bx = ix + iw - 40, by = iy + 50 + Math.sin(simTime) * 6;
      disc(bx, by, 9, '#ff7043'); c.fillStyle = '#ffca28'; c.fillRect(bx - 9, by - 2, 18, 3); limb(bx - 5, by + 7, bx - 3, by + 15, 1, '#5d4037'); limb(bx + 5, by + 7, bx + 3, by + 15, 1, '#5d4037'); c.fillStyle = '#8d6e63'; c.fillRect(bx - 4, by + 15, 8, 5);
      if (simTime > sky.planeNext) { c.fillStyle = '#cfd8dc'; c.beginPath(); c.moveTo(px + 9, py + 20); c.lineTo(px - 9, py + 17); c.lineTo(px - 9, py + 23); c.closePath(); c.fill(); }
    }
    if (zi === 3) {
      for (let k = 0; k < 2; k++) {
        const a = simTime * (0.25 + k * 0.1) + k * 2.5, sx = ix + iw / 2 + Math.cos(a) * (70 - k * 20), sy = iy + 55 + k * 40 + Math.sin(a) * 14;
        c.save(); c.translate(sx, sy); c.rotate(a * 0.5);
        c.fillStyle = '#bdbdbd'; c.fillRect(-4, -4, 8, 8); c.fillStyle = '#1e5aa8'; c.fillRect(-19, -2.5, 14, 5); c.fillRect(5, -2.5, 14, 5);
        c.restore();
      }
      if (simTime > sky.ufoNext) {
        const ux = ix + sky.ufoX, uy = iy + 34 + Math.sin(simTime * 3) * 4;
        c.fillStyle = 'rgba(178,255,89,.25)'; c.beginPath(); c.moveTo(ux - 6, uy + 4); c.lineTo(ux + 6, uy + 4); c.lineTo(ux + 14, uy + 24); c.lineTo(ux - 14, uy + 24); c.closePath(); c.fill();
        c.fillStyle = '#80deea'; c.beginPath(); c.arc(ux, uy - 2, 6, Math.PI, 0); c.fill();
        c.fillStyle = '#90a4ae'; c.beginPath(); c.ellipse(ux, uy + 1, 15, 4, 0, 0, Math.PI * 2); c.fill();
        for (let k = -1; k <= 1; k++) disc(ux + k * 7, uy + 2, 1.3, Math.floor(simTime * 6 + k) % 2 ? '#ffeb3b' : '#ff5252');
      }
    }
    // 건물 꼭대기·크레인(창 안 축소)
    const bx = ix + iw / 2 - 20, bw = 56, fh = 8, topY = iy + 92;
    for (let i = 0; topY + i * fh < iy + ih; i++) {
      const y = topY + i * fh;
      if (i === 0) { c.strokeStyle = STEEL; c.lineWidth = 2; for (let b = 0; b <= 4; b++) { c.beginPath(); c.moveTo(bx + b * bw / 4, y); c.lineTo(bx + b * bw / 4, y + fh); c.stroke(); } c.beginPath(); c.moveTo(bx, y + 1); c.lineTo(bx + bw, y + 1); c.stroke(); }
      else { c.fillStyle = i <= 2 ? WALL : GLASS; c.fillRect(bx, y, bw, fh); c.fillStyle = SLAB; c.fillRect(bx - 1, y + fh - 1.5, bw + 2, 1.5); }
    }
    const mx = bx - 10, jy2 = topY - 26, cs = Math.cos(crane.phi);
    c.fillStyle = YEL; c.fillRect(mx - 3, jy2, 6, iy + ih - jy2);
    c.strokeStyle = YEL; c.lineWidth = 3; c.beginPath(); c.moveTo(mx - 24 * cs, jy2); c.lineTo(mx + 70 * cs, jy2); c.stroke();
    const tx = mx + 40 * cs * (crane.trolley / CR.tBld), hy = jy2 + 6 + Math.min(40, crane.hook * 0.12);
    c.strokeStyle = '#37474f'; c.lineWidth = 1; c.beginPath(); c.moveTo(tx, jy2 + 2); c.lineTo(tx, hy); c.stroke();
    if (crane.beam) drawBeam(tx - 12, hy + 1, 24);
    for (const r of runners) if (r.role === 'backend' && r.extra && r.ovK >= 1) { // 꼭대기 용접공(축소)
      const wx = bx + 10 + (Math.sin(simTime * 0.4 + r.slot) * 0.5 + 0.5) * (bw - 20);
      drawPerson({ x: wx, y: topY, s: 0.4, face: 1, pose: 'stand', color: r.color, hair: r.hair, skin: r.skin, hardhat: '#ffc400' });
      if (Math.floor(simTime * 10) % 2) disc(wx + 5, topY - 8, 1.5, '#fff59d');
    }
    c.restore();
    // 눈금자
    c.fillStyle = '#263238'; c.fillRect(A.x, iy, A.ruler, ih);
    const MAXF = 200, yOf = fl => iy + ih - 4 - (ih - 10) * Math.sqrt(Math.min(fl, MAXF) / MAXF);
    c.font = 'bold 9px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    ZONES.forEach(([fl, nm], k) => { const y = yOf(fl); c.fillStyle = k <= zi ? '#ffd166' : '#78909c'; c.fillRect(A.x + 2, y, A.ruler - 4, 1); c.fillText(nm.slice(0, 2), A.x + A.ruler / 2, y - 6); });
    const my = yOf(f); c.fillStyle = '#ff5252'; c.beginPath(); c.moveTo(A.x + A.ruler, my); c.lineTo(A.x + A.ruler - 7, my - 4); c.lineTo(A.x + A.ruler - 7, my + 4); c.closePath(); c.fill();
    // 제목
    c.fillStyle = '#1f1f1f'; c.fillRect(A.x, A.y, A.w, A.title);
    c.fillStyle = '#ffd166'; c.font = 'bold ' + fz(12, 11, 1.2) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('🏗️ 고도 ' + f + '층 · ' + ZONES[zi][1], A.x + 6, A.y + A.title / 2 + 1);
  }

  /* ---------- 그리기 순서 ---------- */
  function render() {
    drawBg();
    drawTrail();
    drawYard();
    drawBuilding();
    drawProps();
    drawElevators(false);
    drawBench();
    drawOffice(); drawScoreboard();
    drawSignalers();
    drawBoard();
    drawCoach('#f5f5f5', true, true); // 현장소장은 흰 안전모(한국 현장 관례), 말풍선은 아래로(위는 현황판)
    drawCrane();
    drawLift();
    drawMedics();
    const janBack = jan.job === 'splash' && jan.stage === 3;
    if (janBack) drawJanitor();
    [...runners].sort((a, b) => a.y - b.y).forEach(drawRunner);
    drawLiftFront();
    drawElevators(true);
    drawTable();
    if (!janBack) drawJanitor();
    drawSplashFx();
    drawAmb();
    drawSweat();
    drawSparks();
    drawPops();
    drawAltitude();
  }

  return { txt, render, update, place, drawTool, addBonus: n => { bonus += n; }, floors, hold, pathPos: routePos, pathLen: () => 2 * ONE, rolePos, roleLen, startT, startPt, entry, inExit, speedK: SPEED_K };
})();
