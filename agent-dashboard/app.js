'use strict';
/* 에이전트 운동장 — 2D canvas. 에이전트=선수, 메인=코치.
   상태 입력: state.json 폴링(serve.py 경유) 또는 화면 버튼(데모). */

const W = 1280, H = 800, CX = 640, CY = 330, L = 180, RC = 165, R_OUT = 214, R_CHEER = 232;
const BENCH_Y = 700;

const AGENTS = [
  { id: 'designer', name: '디자이너', color: '#e84393', hair: '#3b2a20' },
  { id: 'qa',       name: 'QA',       color: '#00b894', hair: '#222' },
  { id: 'frontend', name: '프론트',   color: '#0984e3', hair: '#5d4037' },
  { id: 'backend',  name: '백엔드',   color: '#6c5ce7', hair: '#111' },
  { id: 'security', name: '보안',     color: '#d63031', hair: '#3e2723' },
  { id: 'planner',  name: '기획',     color: '#f9a825', hair: '#4e342e' },
  { id: 'pm',       name: 'PM',       color: '#e17055', hair: '#212121' },
];

const cv = document.getElementById('c');
const c = cv.getContext('2d');
let simTime = 0, speedMul = 1, soundOn = false, live = false;
let coachTask = '';

/* ---------- 트랙 경로 ---------- */
function pathLen(R) { return 4 * L + 2 * Math.PI * R; }
function pathPos(t, R) {
  t = ((t % 1) + 1) % 1;
  let s = t * pathLen(R);
  const S = 2 * L, arc = Math.PI * R;
  if (s < S) return { x: CX - L + s, y: CY + R, hx: 1, hy: 0 };
  s -= S;
  if (s < arc) {
    const th = Math.PI / 2 - s / R;
    return { x: CX + L + R * Math.cos(th), y: CY + R * Math.sin(th), hx: Math.sin(th), hy: -Math.cos(th) };
  }
  s -= arc;
  if (s < S) return { x: CX + L - s, y: CY - R, hx: -1, hy: 0 };
  s -= S;
  const th = -Math.PI / 2 - s / R;
  return { x: CX - L + R * Math.cos(th), y: CY + R * Math.sin(th), hx: Math.sin(th), hy: -Math.cos(th) };
}

/* ---------- 도형 도우미 ---------- */
function rrect(x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function stadium(R) { rrect(CX - L - R, CY - R, 2 * (L + R), 2 * R, R); }
function limb(x1, y1, x2, y2, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function poly(pts, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
}
function disc(x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function head(x, y, o, hat) {
  disc(x, y, 7, o.skin || '#f1c9a5');
  c.fillStyle = o.hair || '#222';
  c.beginPath(); c.arc(x, y - 1, 7.4, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  disc(x + 3, y + 0.5, 1.1, '#222');
  if (hat) {
    c.fillStyle = hat; c.beginPath(); c.arc(x, y - 2, 7.6, Math.PI, 0); c.fill();
    c.fillRect(x, y - 3, 11, 2.5);
  }
}

/* ---------- 사람 그리기 (옆모습, +x가 바라보는 쪽) ---------- */
function drawPerson(o) {
  c.save();
  c.translate(o.x, o.y);
  const s = o.s || 1;
  c.scale((o.face || 1) * s, s);
  const ph = o.ph || 0, col = o.color || '#888', pants = '#2d3436';
  switch (o.pose) {
    case 'stand': case 'walk': case 'run': case 'coach': {
      const run = o.pose === 'run';
      const sw = (o.pose === 'stand' || o.pose === 'coach') ? 0 : Math.sin(ph);
      const a = sw * (run ? 0.9 : 0.55), lean = run ? 4 : 0;
      for (const sg of [1, -1]) {
        const ang = a * sg, back = sg * sw < 0;
        poly([[0, -20], [Math.sin(ang) * 9, -10], [Math.sin(ang) * 14 - (back && run ? 7 : 0), back && run ? -6 : 0]], 5, pants);
      }
      limb(0, -20, lean, -37, 9, col);
      for (const sg of [1, -1]) {
        const ang = -a * sg;
        if (o.pose === 'coach' && sg === 1) {
          const w = Math.sin(ph * 2) * 4;
          poly([[lean, -35], [9, -42 + w], [8, -54 + w]], 4, o.skin || '#f1c9a5');
        } else {
          poly([[lean, -35], [lean + Math.sin(ang) * 8, -28], [lean + Math.sin(ang) * 11 + (run ? 6 : 0), run ? -31 : -21]], 4, o.skin || '#f1c9a5');
        }
      }
      head(lean + 1, -45, o, o.hat);
      if (o.pose === 'coach') { // 호루라기
        disc(5, -33, 2, '#ddd');
      }
      break;
    }
    case 'drink': {
      poly([[0, -20], [-3, -10], [-3, 0]], 5, pants);
      poly([[0, -20], [4, -10], [4, 0]], 5, pants);
      limb(0, -20, 0, -37, 9, col);
      poly([[0, -35], [-4, -28], [2, -22]], 4, o.skin);
      const w = Math.sin(ph) * 1.5;
      poly([[0, -35], [8, -33], [6, -44 + w]], 4, o.skin);
      c.save(); c.translate(6, -49 + w); c.rotate(-0.9);
      c.fillStyle = '#74b9ff'; c.fillRect(-3, -8, 6, 14);
      c.fillStyle = '#fff'; c.fillRect(-2, -11, 4, 3);
      c.restore();
      head(1, -46, o);
      break;
    }
    case 'sit': {
      poly([[0, -14], [15, -14], [15, 0]], 5, pants);
      limb(0, -14, 0, -31, 9, col);
      poly([[0, -29], [6, -21], [12, -18]], 4, o.skin);
      head(1, -39, o);
      break;
    }
    case 'lie': {
      c.translate(-22, -8 - (o.dy || 0)); c.rotate(Math.PI / 2);
      poly([[0, -20], [-1, -10], [-1, 0]], 5, pants);
      poly([[0, -20], [3, -10], [3, 0]], 5, pants);
      limb(0, -20, 0, -37, 9, col);
      poly([[0, -35], [-4, -27], [-2, -21]], 4, o.skin);
      head(0, -45, o);
      break;
    }
    case 'crawl': {
      limb(-14, -14, 8, -17, 9, col);
      for (const sg of [1, -1]) {
        const k = Math.sin(ph * sg);
        poly([[8, -17], [10 + k * 5, -8], [12 + k * 7, -1]], 4, o.skin);
        poly([[-14, -14], [-18 - k * 5, -6], [-26 - k * 5, -2]], 5, pants);
      }
      head(17, -20 + Math.sin(ph * 2) * 1.5, o);
      break;
    }
    case 'wheel': case 'slump': {
      const sl = o.pose === 'slump';
      // 바퀴
      c.strokeStyle = '#222'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(-1, -12, 11, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 4; k++) {
        const th = ph * 0.7 + k * Math.PI / 2;
        limb(-1, -12, -1 + Math.cos(th) * 10, -12 + Math.sin(th) * 10, 1, '#666');
      }
      c.beginPath(); c.arc(17, -3, 3.2, 0, Math.PI * 2); c.stroke();
      limb(-10, -19, 12, -19, 3, '#444');
      limb(-10, -19, -13, -39, 3, '#444');
      poly([[0, -21], [13, -21], [15, -6]], 5, pants);
      const lx = sl ? 6 : 0;
      limb(0, -21, lx, -37, 9, col);
      poly([[lx, -35], [lx - 2, -26], [-1, -17 + Math.sin(ph) * 3]], 4, o.skin);
      head(lx + (sl ? 4 : 1), sl ? -42 : -45, o);
      break;
    }
  }
  c.restore();
}

/* ---------- 말풍선 ---------- */
function drawBubble(x, y, text) {
  c.save();
  c.font = 'bold 14px "Malgun Gothic", sans-serif';
  const w = c.measureText(text).width + 16;
  c.fillStyle = '#fff'; c.strokeStyle = '#333'; c.lineWidth = 1.5;
  rrect(x - w / 2, y - 24, w, 22, 8); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - 4, y - 2); c.lineTo(x, y + 5); c.lineTo(x + 4, y - 2); c.closePath();
  c.fillStyle = '#fff'; c.fill();
  c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y - 13);
  c.restore();
}
function say(o, text, dur) { o.bubble = { text, until: simTime + (dur || 1.6) }; }

/* ---------- 선수 ---------- */
const runners = AGENTS.map((a, i) => ({
  ...a, idx: i, laneR: RC + (i - 3) * 8, speed: 0.92 + (i % 4) * 0.06,
  x: 70 + i * 46, y: BENCH_Y, face: 1, ph: 0,
  state: 'rest', settled: true, active: false, task: '',
  lapF: 0, lastLap: 0, t: 0, R: RC, readyAt: 0, until: 0, returnAt: 0,
  nextSweat: 0, nextPant: 1 + i * 0.4, bubble: null, downPlaced: false, skin: '#f1c9a5',
}));
const lapInt = r => Math.floor(r.lapF + 1e-9);
const benchSpot = r => ({ x: 70 + r.idx * 46, y: BENCH_Y });
const floorSpot = r => ({ x: 800 + r.idx * 45, y: 752 });
const drinkSpot = r => ({ x: 566 + r.idx * 28, y: 686 });
const startPt = r => ({ x: 470 + r.idx * 10, y: CY + r.laneR });

function walk(r, tx, ty, sp, dt) {
  const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy);
  if (d <= sp * dt + 0.5) { r.x = tx; r.y = ty; return true; }
  r.x += dx / d * sp * dt; r.y += dy / d * sp * dt;
  if (Math.abs(dx) > 0.1) r.face = dx > 0 ? 1 : -1;
  r.ph += dt * sp * 0.09;
  return false;
}

function setActive(r, on) {
  if (r.active === on) return;
  r.active = on;
  if (on) say(coach, '기동! 뛰어!', 2);
  else say(coach, '들어와!', 2);
  refreshChips();
}

function updateRunner(r, dt) {
  const li = lapInt(r);
  switch (r.state) {
    case 'rest': {
      const sp = li >= 15 ? floorSpot(r) : benchSpot(r);
      r.settled = walk(r, sp.x, sp.y, 120, dt);
      if (r.settled) r.face = 1;
      if (r.active && simTime >= r.readyAt) { r.state = 'toStart'; r.settled = false; }
      break;
    }
    case 'toStart': {
      if (!r.active) { r.state = 'rest'; r.readyAt = simTime + 1; break; }
      const sp = startPt(r);
      if (walk(r, sp.x, sp.y, 130, dt)) {
        r.state = 'run'; r.R = r.laneR; r.t = (sp.x - (CX - L)) / pathLen(r.R); r.face = 1;
      }
      break;
    }
    case 'run': {
      const mode = li < 10 ? 'run' : li < 15 ? 'crawl' : 'wheel';
      const lapTime = mode === 'run' ? 6.5 : mode === 'crawl' ? 12 : 9;
      const sp = r.speed / lapTime;
      r.t += sp * dt; r.lapF += sp * dt;
      const wheelOut = li >= 15 && r.lapF < 15.8;
      const tgt = wheelOut ? R_OUT : r.laneR;
      r.R += (tgt - r.R) * Math.min(1, dt * 2.5);
      const p = pathPos(r.t, r.R);
      r.x = p.x; r.y = p.y;
      if (p.hx > 0.05) r.face = 1; else if (p.hx < -0.05) r.face = -1;
      r.ph += dt * (mode === 'run' ? 11 : mode === 'crawl' ? 5 : 6);
      const nl = lapInt(r);
      if (nl !== r.lastLap) { onLap(r, nl); r.lastLap = nl; }
      if (r.lapF >= 25) { r.state = 'down'; r.downPlaced = false; r.downT = r.t; break; }
      if (!r.active) {
        const tt = ((r.t % 1) + 1) % 1;
        if (tt * pathLen(r.R) < 2 * L && r.x >= 600 && r.x <= 780 && r.R < 205) r.state = 'toRest';
      }
      break;
    }
    case 'toRest': {
      const sp = drinkSpot(r);
      if (walk(r, sp.x, sp.y, 130, dt)) { r.state = 'drink'; r.until = simTime + 2.6; r.face = 1; say(r, '꿀꺽꿀꺽', 2); }
      break;
    }
    case 'drink': {
      r.ph += dt * 6;
      if (simTime >= r.until) { r.state = 'rest'; r.readyAt = simTime + 1.5; }
      break;
    }
    case 'down': {
      if (!r.downPlaced) {
        const p = pathPos(r.downT, R_OUT);
        if (walk(r, p.x, p.y, 90, dt)) { r.downPlaced = true; amb.queue.push(r); say(r, '으윽…', 3); }
      }
      break;
    }
    case 'carried': case 'inAmb': break;
    case 'away': {
      if (simTime >= r.returnAt) {
        r.state = 'rest'; r.lapF = 0; r.lastLap = 0; r.R = r.laneR;
        const b = benchSpot(r); r.x = b.x; r.y = b.y; r.readyAt = simTime + 2;
        say(r, '복귀했습니다', 2);
      }
      break;
    }
  }
  // 땀·헉헉 (5바퀴 이상)
  if (li >= 5 && (r.state === 'run' || r.state === 'toRest' || r.state === 'down')) {
    if (simTime >= r.nextSweat) {
      r.nextSweat = simTime + 0.13;
      const hy = r.y - (li >= 10 && li < 15 && r.state === 'run' ? 24 : 48);
      sweat.push({ x: r.x + r.face * 3, y: hy, vx: -r.face * (10 + Math.random() * 30), vy: -30 - Math.random() * 30, life: 0.7 });
    }
    if (simTime >= r.nextPant) {
      r.nextPant = simTime + 2.6 + Math.random();
      say(r, '헉헉', 1.2); pantSound();
    }
  }
  if (r.bubble && simTime > r.bubble.until) r.bubble = null;
}

function onLap(r, li) {
  if (li === 10) say(r, '더는 못 뛰겠어… 기자!', 2);
  if (li === 15) say(r, '휠체어 부탁해요!', 2);
  if (li === 25) say(r, '윽…', 2);
}

/* ---------- 땀 입자 ---------- */
const sweat = [];
function updateSweat(dt) {
  for (let i = sweat.length - 1; i >= 0; i--) {
    const p = sweat[i];
    p.life -= dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) sweat.splice(i, 1);
  }
}

/* ---------- 구급차 ---------- */
const amb = { phase: 'idle', x: 1420, y: 735, ang: Math.PI, queue: [], patient: null, g: { x: 1170, y: 735 }, t0: 0, route: [], ri: 0, tl: 0 };
const AMB_T0 = (740 - (CX - L)) / pathLen(RC);

function moveTo(o, tx, ty, sp, dt) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d <= sp * dt + 0.5) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * sp * dt; o.y += dy / d * sp * dt;
  o.dir = Math.atan2(dy, dx);
  return false;
}
function drive(tx, ty, sp, dt) {
  const ok = moveTo(amb, tx, ty, sp, dt);
  if (amb.dir !== undefined) amb.ang = amb.dir;
  return ok;
}
function updateAmb(dt) {
  const a = amb;
  switch (a.phase) {
    case 'idle':
      if (a.queue.length) {
        a.patient = a.queue.shift(); a.phase = 'arrive'; a.x = 1420; a.y = 735; a.ang = Math.PI;
        toast('🚑 구급차 출동 — ' + a.patient.name + ' (25바퀴)');
      }
      break;
    case 'arrive':
      if (drive(1200, 735, 240, dt)) { a.phase = 'unload'; a.t0 = simTime; a.g = { x: 1165, y: 735 }; }
      break;
    case 'unload':
      if (simTime - a.t0 > 0.8) a.phase = 'go';
      break;
    case 'go': {
      const p = a.patient;
      if (moveTo(a.g, p.x, p.y + 14, 130, dt)) { a.phase = 'pick'; a.t0 = simTime; p.state = 'carried'; }
      break;
    }
    case 'pick':
      if (simTime - a.t0 > 1.2) a.phase = 'back';
      break;
    case 'back':
      if (moveTo(a.g, 1165, 735, 130, dt)) { a.phase = 'load'; a.t0 = simTime; }
      break;
    case 'load':
      if (simTime - a.t0 > 0.9) {
        a.patient.state = 'inAmb'; a.phase = 'route';
        a.route = [{ x: 1100, y: 650 }, { x: 940, y: 575 }, { x: 740, y: 497 }]; a.ri = 0;
      }
      break;
    case 'route': {
      const w = a.route[a.ri];
      if (drive(w.x, w.y, 260, dt) && ++a.ri >= a.route.length) { a.phase = 'lap'; a.tl = AMB_T0; }
      break;
    }
    case 'lap': {
      a.tl += dt / 4.5;
      const p = pathPos(a.tl, RC);
      a.x = p.x; a.y = p.y; a.ang = Math.atan2(p.hy, p.hx);
      if (a.tl >= AMB_T0 + 1) { a.phase = 'leave'; a.route = [{ x: 900, y: 610 }, { x: 1100, y: 700 }, { x: 1440, y: 735 }]; a.ri = 0; }
      break;
    }
    case 'leave': {
      const w = a.route[a.ri];
      if (drive(w.x, w.y, 260, dt) && ++a.ri >= a.route.length) {
        a.phase = 'idle'; a.patient.state = 'away'; a.patient.returnAt = simTime + 4;
        toast('🏥 ' + a.patient.name + ' 병원 이송 완료 — 곧 복귀');
      }
      break;
    }
  }
  if (a.patient && a.patient.state === 'carried') { a.patient.x = a.g.x; a.patient.y = a.g.y; }
}

/* ---------- 코치 ---------- */
const coach = { x: 110, y: 148, ph: 0, bubble: null, next: 3 };
function updateCoach(dt) {
  coach.ph += dt * 3;
  if (coach.bubble && simTime > coach.bubble.until) coach.bubble = null;
  if (simTime >= coach.next) {
    coach.next = simTime + 4 + Math.random() * 3;
    if (runners.some(r => r.active)) {
      const l = ['뛰어!', '더 빨리!', '페이스 유지!', '좋아, 계속!'];
      say(coach, l[Math.floor(Math.random() * l.length)], 2);
    } else if (!coach.bubble) {
      say(coach, ['쉬어~', '물 마셔!', '다음 작업 대기!'][Math.floor(Math.random() * 3)], 2);
    }
  }
}

/* ---------- 치어리더 ---------- */
const CHEER_N = 28;
const cheers = Array.from({ length: CHEER_N }, (_, i) => ({ i, bubble: null }));
let nextShout = 0;
function waveOn() { return runners.some(r => lapInt(r) >= 15 && ['run', 'toRest', 'down'].includes(r.state)); }
function updateCheer() {
  for (const ch of cheers) if (ch.bubble && simTime > ch.bubble.until) ch.bubble = null;
  if (waveOn() && simTime >= nextShout) {
    nextShout = simTime + 2.4;
    for (let k = 0; k < 3; k++) say(cheers[Math.floor(Math.random() * CHEER_N)], '화이팅!', 1.6);
  }
}
function drawCheer(ch) {
  const p = pathPos((ch.i + 0.5) / CHEER_N, R_CHEER);
  if (p.y > CY + 200 && p.x > 440 && p.x < 760) return; // 출입구
  const on = waveOn();
  const i = ch.i;
  const wv = on ? 0.5 + 0.5 * Math.sin(simTime * 6 - i * 0.55) : 0.45 + 0.15 * Math.sin(simTime * 3 + i);
  const jump = on ? Math.abs(Math.sin(simTime * 6 - i * 0.55)) * 7 : Math.abs(Math.sin(simTime * 3 + i)) * 2;
  const x = p.x, y = p.y - jump;
  const shirt = i % 2 ? '#ff7675' : '#74b9ff', pom = i % 2 ? '#ffeaa7' : '#fd79a8';
  limb(x - 3, y - 14, x - 3, y, 3.5, '#f1c9a5');
  limb(x + 3, y - 14, x + 3, y, 3.5, '#f1c9a5');
  c.fillStyle = shirt; c.beginPath(); c.moveTo(x - 10, y - 14); c.lineTo(x + 10, y - 14); c.lineTo(x + 4, y - 26); c.lineTo(x - 4, y - 26); c.closePath(); c.fill();
  limb(x, y - 25, x, y - 33, 8, shirt);
  for (const sg of [-1, 1]) {
    const phi = Math.PI * (0.35 + 0.6 * (sg < 0 ? wv : 1 - wv * 0.8));
    const hx = x + sg * 5 + sg * Math.sin(phi) * 14, hy = y - 31 + Math.cos(phi) * 14;
    limb(x + sg * 4, y - 31, hx, hy, 3.5, '#f1c9a5');
    disc(hx, hy, 5, pom);
  }
  disc(x, y - 39, 6, '#f1c9a5');
  c.fillStyle = '#6d4c41'; c.beginPath(); c.arc(x, y - 40, 6.4, Math.PI, 0); c.fill();
  disc(x + 7, y - 38, 3.2, '#6d4c41');
  if (ch.bubble) drawBubble(x, y - 50, ch.bubble.text);
}

/* ---------- 소리 ---------- */
let ac = null;
function pantSound() {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const n = Math.floor(ac.sampleRate * 0.2), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    for (const k of [0, 0.27]) {
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000 + Math.random() * 400; f.Q.value = 0.8;
      const g = ac.createGain(), t0 = ac.currentTime + k;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t0);
    }
  } catch (e) { /* 소리 실패는 무시 */ }
}

/* ---------- 배경 그리기 ---------- */
function drawField() {
  c.fillStyle = '#3a8f3f'; c.fillRect(0, 0, W, H);
  // 잔디 줄무늬
  c.fillStyle = 'rgba(255,255,255,.035)';
  for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 40, H);
  // 트랙
  stadium(200); c.fillStyle = '#b5532f'; c.fill();
  stadium(130); c.fillStyle = '#2f7d34'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2;
  for (const R of [130, 200]) { stadium(R); c.stroke(); }
  c.setLineDash([10, 10]); c.lineWidth = 1.2;
  for (const R of [148, 165, 182]) { stadium(R); c.stroke(); }
  c.setLineDash([]);
  // 출발선
  c.fillStyle = '#fff'; c.fillRect(CX - L + 8, CY + 130, 4, 70);
  // 휴식 공간 바닥
  c.fillStyle = '#cfd8dc'; c.fillRect(0, 600, W, 200);
  c.fillStyle = '#b0bec5'; c.fillRect(0, 600, W, 4);
  c.fillStyle = '#546e7a'; c.font = 'bold 15px "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('휴식 공간', 12, 624);
  c.fillText('🪑 벤치', 40, 776);
  c.fillText('💧 생수대', 560, 776);
  c.fillText('🛏️ 누워 쉬는 곳', 800, 782);
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '12px "Malgun Gothic", sans-serif';
  c.fillText('출입구 ▲', 592, 596);
}

function drawBench() {
  c.fillStyle = '#8d6e63'; c.fillRect(50, 686, 340, 8);
  c.fillStyle = '#5d4037'; for (const x of [58, 220, 376]) c.fillRect(x, 694, 6, 10);
}
function drawTable() {
  // 선수 뒤에 서 있도록 선수 다음에 그린다
  c.fillStyle = '#a1887f'; c.fillRect(540, 686, 220, 12);
  c.fillStyle = '#6d4c41'; c.fillRect(550, 698, 8, 34); c.fillRect(742, 698, 8, 34);
  for (let i = 0; i < 7; i++) {
    const x = 560 + i * 28;
    if (runners[i].state === 'drink') continue;
    c.fillStyle = '#74b9ff'; c.fillRect(x, 672, 7, 14);
    c.fillStyle = '#fff'; c.fillRect(x + 1, 669, 5, 3);
  }
}

function drawCoachBox() {
  // 코치석
  c.fillStyle = '#6d4c41'; c.fillRect(14, 156, 196, 12);
  c.fillStyle = '#8d6e63'; c.fillRect(14, 168, 196, 6);
  c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(6, 78); c.lineTo(110, 52); c.lineTo(218, 78); c.closePath(); c.fill();
  c.fillStyle = '#5d4037'; c.fillRect(20, 78, 5, 78); c.fillRect(199, 78, 5, 78);
  c.fillStyle = '#fff'; c.font = 'bold 12px "Malgun Gothic", sans-serif'; c.textAlign = 'center';
  c.fillText('감독 · 코치석', 110, 74);
  // 전광판
  c.fillStyle = '#111'; rrect(14, 186, 196, 66, 6); c.fill();
  c.strokeStyle = '#444'; c.lineWidth = 2; c.stroke();
  const n = runners.filter(r => r.active).length;
  c.fillStyle = '#ffb300'; c.font = 'bold 13px monospace'; c.textAlign = 'left';
  c.fillText('작업 중 ' + n + ' / ' + runners.length, 24, 206);
  c.save();
  c.beginPath(); c.rect(20, 214, 184, 32); c.clip();
  const txt = coachTask ? '메인: ' + coachTask : '메인: 대기 중';
  const tw = c.measureText(txt).width, avail = 180;
  const off = tw > avail ? -((simTime * 30) % (tw + 40)) : 0;
  c.fillStyle = '#ffb300'; c.fillText(txt, 24 + off, 236);
  if (tw > avail) c.fillText(txt, 24 + off + tw + 40, 236);
  c.restore();
}

function stateLabel(r) {
  const li = lapInt(r);
  switch (r.state) {
    case 'run': return li < 10 ? '달리는 중' : li < 15 ? '기어가는 중' : '휠체어 질주';
    case 'toStart': return '입장 중';
    case 'toRest': case 'drink': return '물 마시는 중';
    case 'down': case 'carried': case 'inAmb': return '이송 중';
    case 'away': return '병원';
    default: return r.active ? '출발 준비' : (li >= 15 ? '쓰러져 휴식' : '벤치 대기');
  }
}
function drawInfield() {
  c.fillStyle = 'rgba(0,0,0,.45)'; rrect(350, 214, 580, 240, 10); c.fill();
  c.textBaseline = 'middle';
  c.fillStyle = '#fff'; c.font = 'bold 17px "Malgun Gothic", sans-serif'; c.textAlign = 'left';
  c.fillText('🏁 에이전트 현황', 368, 232);
  c.textAlign = 'right'; c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3';
  c.fillText('뛰는 중 ' + runners.filter(r => r.state === 'run').length + '명', 912, 232);
  runners.forEach((r, i) => {
    const y = 262 + i * 27;
    const run = r.state === 'run';
    if (r.active) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(358, y - 12, 564, 25); }
    disc(374, y, 6, r.color);
    c.textAlign = 'left'; c.font = 'bold 15px "Malgun Gothic", sans-serif';
    c.fillStyle = run ? '#fff' : '#cfd8dc'; c.fillText(r.name, 388, y);
    c.font = '13px "Malgun Gothic", sans-serif'; c.fillStyle = run ? '#ffeaa7' : '#b2bec3';
    c.fillText(stateLabel(r), 470, y);
    c.textAlign = 'right'; c.font = 'bold 16px "Malgun Gothic", sans-serif'; c.fillStyle = '#fff';
    c.fillText(lapInt(r) + '바퀴', 628, y);
    c.textAlign = 'left'; c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3';
    let tk = r.task || '';
    while (tk.length > 1 && c.measureText(tk).width > 270) tk = tk.slice(0, -2) + '…';
    c.fillText(tk, 644, y);
  });
}

/* ---------- 선수·구급 그리기 ---------- */
function poseOf(r) {
  const li = lapInt(r);
  switch (r.state) {
    case 'run': return li < 10 ? 'run' : li < 15 ? 'crawl' : 'wheel';
    case 'toStart': case 'toRest': return 'walk';
    case 'drink': return 'drink';
    case 'down': return 'slump';
    case 'carried': return 'lie';
    case 'rest': return r.settled ? (li >= 15 ? 'lie' : 'sit') : 'walk';
  }
  return 'stand';
}
function drawRunner(r) {
  if (r.state === 'inAmb' || r.state === 'away') return;
  const pose = poseOf(r);
  drawPerson({ x: r.x, y: r.y, face: r.face, pose, ph: r.ph, color: r.color, hair: r.hair, skin: r.skin, dy: r.state === 'carried' ? 12 : 0 });
  const top = pose === 'crawl' ? r.y - 36 : pose === 'lie' ? r.y - 30 : r.y - 62;
  c.save();
  c.font = 'bold 11px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const w = c.measureText(r.name).width + 8;
  c.fillStyle = r.color; rrect(r.x - w / 2, top - 11, w, 14, 4); c.fill();
  c.fillStyle = '#fff'; c.fillText(r.name, r.x, top);
  c.restore();
  if (r.bubble) drawBubble(r.x, top - 14, r.bubble.text);
}
function drawMedics() {
  const a = amb;
  if (!['unload', 'go', 'pick', 'back', 'load'].includes(a.phase)) return;
  const g = a.g, mv = a.phase === 'go' || a.phase === 'back';
  const dirFace = a.phase === 'back' ? 1 : (a.patient && a.patient.x < g.x ? -1 : 1);
  // 들것
  c.fillStyle = '#eceff1'; c.fillRect(g.x - 28, g.y - 14, 56, 5);
  c.fillStyle = '#90a4ae'; c.fillRect(g.x - 28, g.y - 9, 56, 2);
  if (a.phase !== 'go' && a.phase !== 'unload' || false) { /* 환자는 drawRunner에서 그림 */ }
  for (const sg of [-1, 1]) {
    drawPerson({ x: g.x + sg * 34, y: g.y, face: sg > 0 ? -1 : 1, pose: mv ? 'walk' : 'stand', ph: simTime * 8, color: '#fff', hair: '#222', skin: '#f1c9a5', hat: '#27ae60' });
    c.fillStyle = '#e74c3c'; c.fillRect(g.x + sg * 34 - 2, g.y - 32, 4, 10); c.fillRect(g.x + sg * 34 - 5, g.y - 29, 10, 4);
  }
}
function drawAmb() {
  const a = amb;
  if (a.phase === 'idle') return;
  c.save();
  c.translate(a.x, a.y); c.rotate(a.ang);
  c.fillStyle = '#222'; for (const [wx, wy] of [[-20, -16], [20, -16], [-20, 16], [20, 16]]) c.fillRect(wx - 6, wy - 3, 12, 6);
  c.fillStyle = '#fff'; rrect(-34, -15, 68, 30, 5); c.fill();
  c.strokeStyle = '#999'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#9ad0f5'; c.fillRect(18, -12, 12, 24);
  c.fillStyle = '#e53935'; c.fillRect(-20, -3, 22, 6); c.fillRect(-12, -11, 6, 22);
  const blink = Math.floor(simTime * 6) % 2;
  c.fillStyle = blink ? '#ff1744' : '#2979ff'; c.fillRect(8, -13, 6, 8);
  c.fillStyle = blink ? '#2979ff' : '#ff1744'; c.fillRect(8, 5, 6, 8);
  c.restore();
}

function drawSweat() {
  c.fillStyle = '#8be9ff';
  for (const p of sweat) { c.globalAlpha = Math.max(0, p.life / 0.7); c.beginPath(); c.arc(p.x, p.y, 2.3, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
}

function render() {
  drawField();
  drawInfield();
  drawBench();
  drawCoachBox();
  // 치어리더는 위쪽부터
  [...cheers].sort((a, b) => pathPos((a.i + .5) / CHEER_N, R_CHEER).y - pathPos((b.i + .5) / CHEER_N, R_CHEER).y).forEach(drawCheer);
  drawPerson({ x: coach.x, y: coach.y, face: 1, pose: 'coach', ph: coach.ph, color: '#2d3436', hair: '#222', skin: '#f1c9a5', hat: '#1e272e' });
  c.save(); c.font = 'bold 11px "Malgun Gothic", sans-serif'; c.textAlign = 'center';
  c.fillStyle = '#ffd166'; rrect(coach.x - 22, coach.y - 74, 44, 14, 4); c.fill();
  c.fillStyle = '#111'; c.fillText('메인', coach.x, coach.y - 63); c.restore();
  if (coach.bubble) drawBubble(coach.x + 6, coach.y - 78, coach.bubble.text);
  drawMedics();
  [...runners].sort((a, b) => a.y - b.y).forEach(drawRunner);
  drawTable();
  drawAmb();
  drawSweat();
}

/* ---------- 루프 ---------- */
function step(dt) {
  simTime += dt;
  runners.forEach(r => updateRunner(r, dt));
  updateAmb(dt); updateCoach(dt); updateCheer(); updateSweat(dt);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (let k = 0; k < speedMul; k++) step(dt);
  render();
  requestAnimationFrame(frame);
}

/* ---------- 조작 UI ---------- */
function toast(msg) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
const chipsBox = document.getElementById('chips');
function buildChips() {
  chipsBox.innerHTML = '';
  runners.forEach(r => {
    const d = document.createElement('div'); d.className = 'chip'; d.id = 'chip-' + r.id;
    d.innerHTML = '<span class="dot" style="background:' + r.color + '"></span><b>' + r.name + '</b>';
    const t = document.createElement('button'); t.type = 'button'; t.dataset.k = 'toggle';
    t.onclick = () => setActive(r, !r.active);
    const p = document.createElement('button'); p.type = 'button'; p.textContent = '+5바퀴';
    p.title = '시험용: 바퀴 수를 5 올립니다';
    p.onclick = () => { r.lapF += 5; r.lastLap = lapInt(r); };
    d.append(t, p); chipsBox.appendChild(d);
  });
  refreshChips();
}
function refreshChips() {
  runners.forEach(r => {
    const d = document.getElementById('chip-' + r.id); if (!d) return;
    d.classList.toggle('on', r.active);
    d.querySelector('[data-k=toggle]').textContent = r.active ? '⏹ 정지' : '🏃 기동';
  });
}
document.getElementById('speed').onchange = e => { speedMul = +e.target.value; };
document.getElementById('sound').onclick = e => {
  soundOn = !soundOn; e.target.textContent = soundOn ? '🔊 소리 끄기' : '🔇 소리 켜기';
  if (soundOn) pantSound();
};
document.getElementById('allOn').onclick = () => runners.forEach(r => setActive(r, true));
document.getElementById('allOff').onclick = () => runners.forEach(r => setActive(r, false));
document.getElementById('reset').onclick = () => runners.forEach(r => { r.lapF = 0; r.lastLap = 0; });

/* ---------- state.json 폴링 ---------- */
const prevFeed = {};
function applyFeed(j) {
  if (j.coach && typeof j.coach.task === 'string') coachTask = j.coach.task;
  const ag = j.agents || {};
  runners.forEach(r => {
    const f = ag[r.id]; if (!f) return;
    const key = JSON.stringify(f);
    if (prevFeed[r.id] === key) return;
    prevFeed[r.id] = key;
    if (typeof f.task === 'string') r.task = f.task;
    if (typeof f.active === 'boolean') setActive(r, f.active);
  });
}
async function poll() {
  const el = document.getElementById('conn');
  try {
    const res = await fetch('state.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    applyFeed(await res.json()); live = true;
  } catch (e) { live = false; }
  el.textContent = live ? '● 라이브 (state.json)' : '○ 데모 모드 (서버 없이 버튼으로 조작)';
  el.classList.toggle('live', live);
  setTimeout(poll, 2000);
}

buildChips();
poll();
requestAnimationFrame(frame);
