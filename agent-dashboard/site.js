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
  const LAPS_PER_FLOOR = 5;
  const ZONES = [[0, '지상', '#8ecae6'], [20, '구름', '#5fa8d3'], [60, '성층권', '#1b3a6b'], [120, '우주', '#05070f']]; // 하루 실제 누적을 보고 조정(planner)
  const BLD = { x: 1110, w: 140, baseY: 588, floorH: 18, maxMain: 16 }; // 16층이면 크레인 지브·운전석 이름표가 고도 창(y≤205) 아래에 보인다
  const CR = { mastX: 1088, jib: 160, counter: 56, phiYard: Math.PI, phiBld: 0, phiRest: 0.35, tYard: 93, tBld: 92, hookRest: 20 };
  const YARD = { x: 940, y: 556, w: 110 };
  const LIFT = { x: 1066, base: 584 }, LIFT_RATE = 0.2, LIFT_IN = 0.2, LIFT_OUT = 0.85; // 리프트 레일(크레인 마스트 왼쪽)·구간 비율
  let cageY = LIFT.base;
  const ALT = { x: 1040, y: 12, w: 228, h: 190, ruler: 22, title: 18 };
  const ROLE_T = { security: [.01, .05], auditor: [.21, .25], backend: [.29, .33], pm: [.36, .40], frontend: [.43, .47], designer: [.53, .57], planner: [.62, .66], qa: [.82, .86] };
  const STEEL = '#a8432b', WALL = '#d5d0c4', GLASS = '#7fb3d5', GLASS_HI = '#d6eaf8', SLAB = '#8f959a', YEL = '#f2b705';

  let bonus = 0, zoneSeen = -1, zoneSince = null;
  const crane = { phi: CR.phiRest, trolley: 70, hook: CR.hookRest, phase: 'rest', t: 0, beam: false, placed: 0 };
  const sparks = [];
  const sky = { planeX: -40, planeNext: 2, ufoX: -60, ufoNext: 6, cloudOff: 0 };
  const prop = { wb: 0, paint: 0, cones: 0 };

  const floors = () => Math.floor((stat.laps + bonus) / LAPS_PER_FLOOR) + 1;
  const zoneIdx = f => { let i = 0; for (let k = 0; k < ZONES.length; k++) if (f >= ZONES[k][0]) i = k; return i; };
  const mainTopY = () => BLD.baseY - Math.min(floors(), BLD.maxMain - (floors() > BLD.maxMain ? 1 : 0)) * BLD.floorH; // 잘리면 맨 윗줄은 지그재그 단면이라 보이는 꼭대기는 한 층 아래
  const jibY = () => Math.max(60, mainTopY() - 3 * BLD.floorH - 22);
  const tOf = r => ((r.t % 1) + 1) % 1;
  const inZone = r => { const z = ROLE_T[r.role]; if (!z || r.state !== 'run') return false; const t = tOf(r); return t >= z[0] && t <= z[1]; };
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
    // 백엔드: 일하는 동안 크레인 운전석(1번)·건물 꼭대기(2번째부터)로 1초에 걸쳐 오르내린다
    for (const r of runners) {
      if (r.role !== 'backend') continue;
      const want = r.active && r.state === 'run' && fatOf(r.lapF, r.freshAt) < 10;
      const k0 = r.ovK || 0;
      r.ovK = Math.max(0, Math.min(1, k0 + (want ? dt : -dt) * LIFT_RATE)); // 리프트로 오르내림(약 5초)
      if (want && k0 < LIFT_IN && r.ovK >= LIFT_IN) say(r, '리프트 탑승!', 1.5);
      if (!want && k0 > LIFT_IN && r.ovK <= LIFT_IN) say(r, '1층 도착', 1.2);
      if (r.extra && r.ovK >= 1 && Math.random() < dt * 9) { // 용접 불꽃
        const p = topSpot(r);
        for (let k = 0; k < 3; k++) sparks.push({ x: p.x + p.face * 10, y: p.y - 18, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, life: 0.5 });
      }
    }
    for (const r of runners) { // 역할 구역에서의 작업 흔적
      if (!inZone(r)) continue;
      if (r.role === 'planner') prop.wb = (prop.wb + dt * 0.5) % 6;
      if (r.role === 'frontend') prop.paint = Math.min(1, prop.paint + dt * 0.15);
      if (r.role === 'security') prop.cones = Math.min(1, prop.cones + dt);
    }
    if (prop.paint >= 1) prop.paint = 0;
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
      case 'lower': if (go('hook', k.beam ? bldDrop : yardDrop, 150)) { if (k.beam) { k.beam = false; k.placed++; k.phase = 'place'; k.t = simTime; } else { k.beam = true; k.phase = 'lift'; } } break;
      case 'lift': if (go('hook', CR.hookRest, 150)) k.phase = 'swingBld'; break;
      case 'swingBld': { const a = go('phi', CR.phiBld, Math.PI / 3), b = go('trolley', CR.tBld, 40), h = go('hook', CR.hookRest, 150); if (a && b && h) k.phase = 'lower'; break; }
      case 'place': if (simTime - k.t > 1.2 && go('hook', CR.hookRest, 150)) k.phase = on ? 'swingYard' : 'rest'; break;
    }
  }

  /* ---------- 백엔드 위치 덮어쓰기 ---------- */
  function cabSpot() { return { x: CR.mastX - 2, y: jibY() + 21, s: 0.42, face: -1, pose: 'stand' }; }
  function topSpot(r) {
    const sway = Math.sin(simTime * 0.4 + r.slot) * 0.5 + 0.5;
    return { x: BLD.x + 22 + sway * (BLD.w - 44), y: mainTopY(), s: 0.75, face: Math.cos(simTime * 0.4 + r.slot) > 0 ? 1 : -1, pose: 'stand' };
  }
  function place(r) {
    if (r.role !== 'backend' || !r.ovK) return null;
    const tgt = r.extra ? topSpot(r) : cabSpot(), k = r.ovK;
    if (k >= 1) return tgt;
    // 건설용 리프트: ① 리프트 앞까지 걸어감 → ② 케이지 타고 수직 상승 → ③ 운전석·꼭대기로 걸어 들어감(내려올 땐 반대)
    if (k < LIFT_IN) { const q = ease(k / LIFT_IN); return { x: lerp(r.x, LIFT.x, q), y: lerp(r.y, LIFT.base, q), s: 1, face: LIFT.x >= r.x ? 1 : -1, pose: 'walk' }; }
    if (k < LIFT_OUT) { const q = ease((k - LIFT_IN) / (LIFT_OUT - LIFT_IN)); return { x: LIFT.x, y: lerp(LIFT.base, tgt.y, q), s: lerp(1, tgt.s, q), face: 1, pose: 'stand', riding: true }; }
    const q = ease((k - LIFT_OUT) / (1 - LIFT_OUT));
    return { x: lerp(LIFT.x, tgt.x, q), y: tgt.y, s: tgt.s, face: tgt.x >= LIFT.x ? 1 : -1, pose: 'walk' };
  }

  /* ---------- 손에 든 도구 ---------- */
  function drawTool(r, pose, x, y, face, s, ov) {
    if (!['run', 'walk', 'stand'].includes(pose)) return;
    c.save(); c.translate(x, y); c.scale(face * s, s);
    const hx = 12, hy = pose === 'run' ? -31 : -22, z = inZone(r);
    switch (r.role) {
      case 'designer': c.fillStyle = '#1e5aa8'; c.fillRect(hx - 2, hy - 10, 4, 14); if (z) { c.fillStyle = '#90caf9'; c.fillRect(hx, hy - 14, 14, 10); } break; // 청사진 통 → 펼침
      case 'planner': c.fillStyle = '#f5f5f5'; c.fillRect(hx - 3, hy - 9, 9, 12); c.fillStyle = '#f9a825'; c.fillRect(hx - 1, hy - 6, 5, 1.5); c.fillRect(hx - 1, hy - 3, 3, 1.5); break; // 공정표
      case 'frontend': limb(hx, hy, hx + 6, hy - 12, 2, '#8d6e63'); c.fillStyle = z ? '#ffb74d' : '#eceff1'; c.fillRect(hx + 2, hy - 17, 9, 5); break; // 페인트 롤러
      case 'backend': if (!ov) { limb(hx, hy, hx + 8, hy - 6, 2.5, '#90a4ae'); } break; // 렌치
      case 'qa': c.fillStyle = '#795548'; c.fillRect(hx - 3, hy - 9, 9, 12); c.fillStyle = '#fff'; c.fillRect(hx - 2, hy - 7, 7, 9); if (z) { poly([[hx - 1, hy - 3], [hx + 1, hy - 1], [hx + 5, hy - 6]], 1.5, '#00b894'); } break; // 클립보드 ✔
      case 'security': { const w = Math.sin(simTime * 8) * (z ? 0.6 : 0.2); c.save(); c.translate(hx, hy); c.rotate(-0.6 + w); c.fillStyle = '#ff1744'; c.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(simTime * 6)); c.fillRect(-1.5, -16, 3, 16); c.restore(); break; } // 경광봉
      case 'pm': c.fillStyle = '#263238'; c.fillRect(hx - 2, hy - 10, 5, 10); limb(hx + 2, hy - 10, hx + 2, hy - 15, 1, '#263238'); break; // 무전기
      case 'auditor': c.fillStyle = '#37474f'; c.fillRect(hx - 2, hy - 6, 8, 5); if (z) { c.strokeStyle = 'rgba(255,23,68,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx + 6, hy - 4); c.lineTo(hx + 30, hy + 10); c.stroke(); } break; // 스캐너
    }
    c.restore();
    if (z && r.role === 'pm') { // 크레인 쪽으로 무전 전파
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { const rr = 6 + ((simTime * 20 + k * 6) % 18); c.beginPath(); c.arc(x + 4, y - 50, rr, -0.9, 0.2); c.stroke(); }
    }
    if (z && r.role === 'auditor') drawBubble(x, y - 76, '빔 ' + (12 + crane.placed % 30) + '개');
  }

  /* 흙길·안쪽 기초·바깥 소품 — 정적 그림이라 처음 한 번 오프스크린에 그려 두고 매 프레임 붙인다 */
  let groundCv = null;
  function drawGround() {
    if (!groundCv) {
      groundCv = document.createElement('canvas'); groundCv.width = W; groundCv.height = H;
      const g = groundCv.getContext('2d'), prev = c; c = g;
      try { paintGround(); } finally { c = prev; }
    }
    c.drawImage(groundCv, 0, 0);
  }
  function ruts(pts, alpha0, fade) { // 쌍선 바퀴 자국
    for (const off of [-4, 4]) {
      for (let k = 1; k < pts.length; k++) {
        const a = fade ? alpha0 * (1 - k / pts.length) : alpha0;
        c.strokeStyle = 'rgba(92,66,40,' + a.toFixed(3) + ')'; c.lineWidth = 1.5; c.lineCap = 'round';
        const [x1, y1, nx1, ny1] = pts[k - 1], [x2, y2, nx2, ny2] = pts[k];
        c.beginPath(); c.moveTo(x1 + nx1 * off, y1 + ny1 * off); c.lineTo(x2 + nx2 * off, y2 + ny2 * off); c.stroke();
      }
    }
  }
  function branch(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / d, ny = (x2 - x1) / d, pts = [];
    for (let k = 0; k <= 6; k++) pts.push([lerp(x1, x2, k / 6), lerp(y1, y2, k / 6), nx, ny]);
    ruts(pts, 0.35, true);
  }
  function paintGround() {
    // 1) 끊긴 바퀴 자국 두 줄
    [[158, 0], [182, 2.1]].forEach(([R0, ph]) => {
      for (let i = 0; i < 90; i++) {
        if ((i * 7 + ph * 10) % 11 < 4) continue;
        const pts = [];
        for (let k = 0; k < 4; k++) {
          const t = i / 90 + k * 0.008 / 3, R = R0 + Math.sin(t * 37 + ph) * 5, p = pathPos(t, R);
          pts.push([p.x, p.y, -p.hy, p.hx]);
        }
        ruts(pts, 0.35, false);
      }
    });
    // 2) 지선(야적장·크레인·출입구)
    branch(962, 512, 992, 550); branch(1016, 400, 1066, 575); branch(690, 531, 690, 538); branch(720, 531, 720, 538);
    // 3) 복공판 16장(몰아서)
    [[.03, 160], [.045, 176], [.06, 168], [.21, 186], [.23, 150], [.24, 172], [.40, 164], [.415, 182], [.55, 154], [.57, 170], [.585, 190], [.71, 160], [.74, 178], [.86, 166], [.875, 184], [.95, 152]].forEach(([t, R], i) => {
      const p = pathPos(t, R);
      c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.hy, p.hx) + ((i % 5) - 2) * 0.09);
      c.fillStyle = '#80868b'; c.fillRect(-14, -8, 28, 16);
      c.strokeStyle = '#5b6166'; c.lineWidth = 1; c.strokeRect(-14, -8, 28, 16);
      c.strokeStyle = '#6b7176'; c.beginPath(); c.moveTo(-14, -8 + 16 / 3); c.lineTo(14, -8 + 16 / 3); c.moveTo(-14, -8 + 32 / 3); c.lineTo(14, -8 + 32 / 3); c.stroke();
      c.restore();
    });
    // 4) 안쪽 좌우 비대칭: 왼쪽 타설 끝난 슬래브, 오른쪽 배근 중인 철근망
    c.fillStyle = '#a3a59f'; c.fillRect(340, 285, 46, 90); c.strokeStyle = '#8d6e63'; c.lineWidth = 2; c.strokeRect(340, 285, 46, 90);
    c.strokeStyle = '#6d4c41'; c.lineWidth = 1;
    for (let x = 898; x <= 940; x += 8) { c.beginPath(); c.moveTo(x, 300); c.lineTo(x, 372); c.stroke(); }
    for (let y = 300; y <= 372; y += 8) { c.beginPath(); c.moveTo(898, y); c.lineTo(940, y); c.stroke(); }
    c.strokeStyle = '#8d6e63'; c.lineWidth = 2; c.strokeRect(898, 300, 42, 72);
    // 5) 바깥 소품: 모래 더미·벽돌 팔레트·굴착기·철근 다발
    c.fillStyle = '#d9b47a'; c.beginPath(); c.moveTo(40, 262); c.lineTo(80, 226); c.lineTo(120, 262); c.closePath(); c.fill();
    c.fillStyle = '#c49a5e'; c.beginPath(); c.moveTo(80, 226); c.lineTo(120, 262); c.lineTo(86, 262); c.closePath(); c.fill();
    c.fillStyle = '#b5543c'; c.fillRect(52, 430, 44, 22); c.strokeStyle = '#8a3f2c'; c.lineWidth = 1;
    for (const y of [437, 444]) { c.beginPath(); c.moveTo(52, y); c.lineTo(96, y); c.stroke(); }
    for (let x = 63; x < 96; x += 11) { c.beginPath(); c.moveTo(x, 430); c.lineTo(x, 452); c.stroke(); }
    c.fillStyle = '#8d6e63'; c.fillRect(52, 452, 44, 4);
    c.fillStyle = '#37474f'; rrect(140, 578, 96, 14, 7); c.fill();
    c.fillStyle = '#607d8b'; for (let x = 148; x < 236; x += 14) disc(x, 585, 3, '#607d8b');
    c.fillStyle = YEL; c.fillRect(156, 548, 56, 30); c.fillStyle = GLASS; c.fillRect(190, 552, 16, 12);
    limb(212, 556, 256, 530, 6, YEL); limb(256, 530, 286, 586, 4, YEL);
    c.fillStyle = '#37474f'; c.fillRect(280, 582, 12, 10);
    for (const y of [100, 104, 108]) limb(250, y, 330, y, 2, STEEL);
  }
  /* ---------- 배경 ---------- */
  function drawBg() {
    const g = c.createLinearGradient(0, 0, 0, 36); g.addColorStop(0, '#8ecae6'); g.addColorStop(1, '#cfe8f3');
    c.fillStyle = g; c.fillRect(0, 0, W, 36);
    c.fillStyle = '#9fb3c2'; for (let x = 230, i = 0; x < 1030; x += 46, i++) { const h = 8 + (i * 7) % 13; c.fillRect(x, 36 - h, 34, h); }
    c.fillStyle = '#b08a5a'; c.fillRect(0, 36, W, 564);
    c.fillStyle = '#9c774a'; for (let i = 0; i < 260; i++) { const x = (i * 197) % W, y = 60 + (i * 89) % 530; c.fillRect(x, y, 3, 2); }
    // 가설 울타리
    c.fillStyle = '#e8eef2'; c.fillRect(218, 36, 1062 - 218, 16);
    c.fillStyle = '#1e5aa8'; c.fillRect(218, 46, 1062 - 218, 3);
    drawGround(); // 운반로: 닫힌 띠·차선 없이 흙길(바퀴 자국·복공판·지선) — 트랙처럼 보이지 않게(사용자 11-16, design 11-16)
    // 휴게 패드
    c.fillStyle = '#cfd2cc'; c.fillRect(0, 600, W, 200); c.fillStyle = '#a9ada6'; c.fillRect(0, 600, W, 4);
    // 출입구 기둥·차단봉
    for (const x of [596, 784]) { c.fillStyle = '#546e7a'; c.fillRect(x - 3, 540, 6, 60); }
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#1f1f1f' : YEL; c.fillRect(596 + i * 31, 540, 31, 5); }
    // 휴게 컨테이너
    c.fillStyle = '#2e7d6b'; c.fillRect(40, 628, 420, 58);
    c.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 48; x < 460; x += 14) c.fillRect(x, 630, 3, 54);
    c.fillStyle = '#cfe8f3'; c.fillRect(380, 640, 50, 22);
    // 그늘막(누워 쉬는 곳)
    c.fillStyle = '#546e7a'; c.fillRect(792, 700, 4, 34); c.fillRect(1164, 700, 4, 34);
    c.fillStyle = '#e85d2a'; c.fillRect(790, 694, 380, 8);
    c.fillStyle = '#f5f5f5'; for (let x = 790; x < 1170; x += 40) c.fillRect(x, 694, 20, 8);
    label('휴게 컨테이너', 12, 620); label('벤치', 40, 776); label('🧊 정수기', 560, 776); label('⛱️ 그늘 휴게', 800, 782);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = fz(12, 11, 1.3) + 'px "Malgun Gothic", sans-serif'; c.fillText('현장 출입구 ▲', 600, 596);
  }
  function drawYard() {
    for (let i = 0; i < 4; i++) drawBeam(YARD.x + (i % 2) * 6, YARD.y + 20 - i * 8, YARD.w - 10);
    label('자재 야적장', YARD.x, YARD.y + 44, '#3e2f1c');
  }
  function drawBeam(x, y, w) {
    c.fillStyle = STEEL; c.fillRect(x, y, w, 7);
    c.fillStyle = '#7f2f1d'; c.fillRect(x, y + 2.5, w, 2);
  }
  function drawProps() {
    // 보안: 출입 통제 라바콘
    for (let i = 0; i < 4; i++) { const x = 475 + i * 26, y = 576; c.fillStyle = '#ff6d00'; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.lineTo(x, y - 18); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - 3, y - 10, 6, 3); c.fillStyle = '#333'; c.fillRect(x - 8, y, 16, 2); }
    if (prop.cones > 0) { c.strokeStyle = 'rgba(255,23,68,' + (0.4 + 0.4 * Math.sin(simTime * 6)) + ')'; c.lineWidth = 2; c.beginPath(); c.moveTo(475, 566); c.lineTo(553, 566); c.stroke(); }
    // 기획: 공정표 화이트보드 + 측량 삼각대
    c.fillStyle = '#fafafa'; c.fillRect(530, 52, 80, 40); c.strokeStyle = '#546e7a'; c.lineWidth = 2; c.strokeRect(530, 52, 80, 40);
    const bars = Math.floor(prop.wb);
    for (let i = 0; i < 5; i++) { c.fillStyle = i < bars ? ['#f9a825', '#0984e3', '#6c5ce7', '#00b894', '#e84393'][i] : '#e0e0e0'; c.fillRect(536 + i * 8, 58 + i * 6, 24, 4); }
    limb(625, 70, 618, 92, 1.5, '#5d4037'); limb(625, 70, 632, 92, 1.5, '#5d4037'); limb(625, 70, 625, 92, 1.5, '#5d4037'); c.fillStyle = YEL; c.fillRect(620, 64, 10, 6);
    // 디자이너: 도면 테이블(레이저 수평선)
    c.fillStyle = '#8d6e63'; c.fillRect(715, 72, 60, 6); c.fillRect(719, 78, 4, 14); c.fillRect(767, 78, 4, 14);
    c.fillStyle = '#90caf9'; c.fillRect(719, 66, 52, 7); c.strokeStyle = '#1e5aa8'; c.lineWidth = 0.8; c.strokeRect(719, 66, 52, 7);
    if (runners.some(r => r.role === 'designer' && inZone(r))) { c.strokeStyle = 'rgba(255,23,68,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(700, 60); c.lineTo(900, 60); c.stroke(); }
    // 프론트: 비계 + 칠해지는 벽
    c.fillStyle = '#d5d0c4'; c.fillRect(920, 52, 60, 40);
    c.fillStyle = '#ffb74d'; c.fillRect(920, 52, 60 * prop.paint, 40);
    c.strokeStyle = '#78909c'; c.lineWidth = 2; for (const x of [918, 950, 982]) { c.beginPath(); c.moveTo(x, 50); c.lineTo(x, 92); c.stroke(); } for (const y of [62, 78]) { c.beginPath(); c.moveTo(916, y); c.lineTo(984, y); c.stroke(); }
    // QA: 검사대(시편 + 체크)
    c.fillStyle = '#b8bcc0'; c.fillRect(140, 330, 74, 20); c.fillStyle = '#90a4ae'; c.fillRect(146, 320, 18, 10); c.fillRect(170, 316, 18, 14); c.fillRect(194, 322, 14, 8);
    label('품질 검사대', 140, 366, '#3e2f1c');
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
  function drawSignalers() { // 치어리더 대체: 깃발 신호수
    const on = waveOn();
    for (const ch of cheers) {
      const p = pathPos((ch.i + 0.5) / CHEER_N, R_CHEER);
      if (p.y > CY + 200 && p.x > 440 && p.x < 760) continue; // 출입구
      if (p.y < 110 && p.x > 500 && p.x < 1000) continue;     // 윗쪽 소품 구간
      if (p.x > 930 && p.y > 480) continue;                    // 야적장
      if (![5, 12, 19, 26].includes(ch.i)) continue;        // 신호수는 몇 명만 — 타원으로 늘어서면 관중석(트랙)처럼 보인다(사용자 11-16)
      const i = ch.i, x = p.x, jump = on ? Math.abs(Math.sin(simTime * 6 - i * 0.55)) * 4 : 0, y = p.y - jump;
      limb(x - 2, y - 12, x - 2, y, 3, '#2d3436'); limb(x + 2, y - 12, x + 2, y, 3, '#2d3436');
      limb(x, y - 12, x, y - 26, 8, '#c6ff00'); c.fillStyle = '#f5f5f5'; c.fillRect(x - 4, y - 21, 8, 1.5);
      const a = on ? Math.sin(simTime * 6 - i * 0.55) : Math.sin(simTime * 2 + i) * 0.3;
      const hx = x + 6 + Math.sin(a) * 4, hy = y - 30 - Math.cos(a) * 6;
      limb(x + 3, y - 24, hx, hy, 3, '#f1c9a5');
      limb(hx, hy, hx, hy - 12, 1.5, '#5d4037');
      c.fillStyle = i % 4 ? '#ff1744' : '#00c853'; c.fillRect(hx, hy - 12, 9 + Math.sin(simTime * 8 + i) * 2, 6);
      disc(x, y - 31, 5, '#f1c9a5'); c.fillStyle = '#ffc400'; c.beginPath(); c.arc(x, y - 33, 5.6, Math.PI, 0); c.fill();
      if (ch.bubble) drawBubble(x, y - 44, ch.bubble.text);
    }
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
    drawInfield();
    drawBench();
    drawOffice(); drawScoreboard();
    drawSignalers();
    drawCoach('#f5f5f5', true); // 현장소장은 흰 안전모(한국 현장 관례)
    drawCrane();
    drawLift();
    drawMedics();
    const janBack = jan.job === 'splash' && jan.stage === 3;
    if (janBack) drawJanitor();
    [...runners].sort((a, b) => a.y - b.y).forEach(drawRunner);
    drawLiftFront();
    drawTable();
    if (!janBack) drawJanitor();
    drawSplashFx();
    drawAmb();
    drawSweat();
    drawSparks();
    drawAltitude();
  }

  return { txt, render, update, place, drawTool, addBonus: n => { bonus += n; }, floors };
})();
