'use strict';
/* 에이전트 대시보드 — 2D canvas. 에이전트=선수, 메인=코치.
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
const stat = { laps: 0, since: null, dirty: false }; // 세션 누적 바퀴수 (since=null이면 서버 값을 아직 못 받은 상태)

/* 화면에 보이는 배율(K)에 따라 글자를 키운다: 표시 크기가 minCss(CSS px) 아래로 내려가지 않게, 단 cap 배율까지만 */
let K = 1;
const fz = (px, minCss, cap) => Math.min(px * (cap || 1.5), Math.max(px, minCss / K));
if (window.ResizeObserver) new ResizeObserver(() => {
  const r = cv.getBoundingClientRect();
  K = Math.min(r.width / W, r.height / H) || 1;
}).observe(cv);

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
function drawBubble(x, y, text, down) { // down=true면 y 아래쪽에 말풍선을 놓고 꼬리는 위로
  c.save();
  const fs = fz(14, 12, 1.4), k = fs / 14;
  c.font = 'bold ' + fs + 'px "Malgun Gothic", sans-serif';
  const w = c.measureText(text).width + 16 * k, h = 22 * k;
  const by = down ? y + 2 : y - 2 - h;
  c.fillStyle = '#fff'; c.strokeStyle = '#333'; c.lineWidth = 1.5;
  rrect(x - w / 2, by, w, h, 8); c.fill(); c.stroke();
  const base = down ? by : by + h, tip = down ? by - 7 : by + h + 7;
  c.beginPath(); c.moveTo(x - 4, base); c.lineTo(x, tip); c.lineTo(x + 4, base); c.closePath();
  c.fillStyle = '#fff'; c.fill();
  c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, by + h / 2);
  c.restore();
}
function drawBubbleSide(x, y, text) { // 왼쪽 가장자리 x, 세로 중심 y, 꼬리는 왼쪽
  c.save();
  const fs = fz(14, 12, 1.4), k = fs / 14;
  c.font = 'bold ' + fs + 'px "Malgun Gothic", sans-serif';
  const w = c.measureText(text).width + 16 * k, h = 22 * k;
  c.fillStyle = '#fff'; c.strokeStyle = '#333'; c.lineWidth = 1.5;
  rrect(x, y - h / 2, w, h, 8); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x + 1, y - 4); c.lineTo(x - 7, y); c.lineTo(x + 1, y + 4); c.closePath();
  c.fillStyle = '#fff'; c.fill();
  c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x + w / 2, y);
  c.restore();
}
function say(o, text, dur) { o.bubble = { text, until: simTime + (dur || 1.6) }; }

/* ---------- 선수 ---------- */
/* 같은 역할이 동시에 여러 개(병렬·여러 세션) 돌 수 있어, 인스턴스마다 선수를 둔다.
   slot 0~6: 역할별 기본 선수, slot 7~13: 같은 역할의 추가 인스턴스(최대 7명, 그 이상은 표에만 집계) */
const BASE_SLOTS = AGENTS.length, MAX_SLOTS = BASE_SLOTS * 2;
const laneOf = sl => sl < BASE_SLOTS ? RC + (sl - 3) * 8 : RC + (sl - BASE_SLOTS - 3) * 8 + 4;
const row2 = r => r.slot >= BASE_SLOTS;
const benchSpot = r => row2(r) ? { x: 82 + (r.slot - BASE_SLOTS) * 46, y: 752 } : { x: 70 + r.slot * 46, y: BENCH_Y };
const floorSpot = r => row2(r) ? { x: 822 + (r.slot - BASE_SLOTS) * 45, y: 722 } : { x: 800 + r.slot * 45, y: 752 };
const drinkSpot = r => ({ x: 566 + (r.slot % BASE_SLOTS) * 28 + (row2(r) ? 14 : 0), y: 686 });
const startPt = r => ({ x: 470 + (r.slot % BASE_SLOTS) * 10 + (row2(r) ? 5 : 0), y: CY + r.laneR });
function makeRunner(a, slot, inst) {
  const o = {
    ...a, role: a.id, id: inst > 1 ? a.id + '_' + inst : a.id, name: inst > 1 ? a.name + '#' + inst : a.name,
    inst, extra: inst > 1, slot, laneR: laneOf(slot), speed: 0.92 + (slot % 4) * 0.06,
    face: 1, ph: 0, state: 'rest', settled: true, active: false, task: '',
    lapF: 0, lastLap: 0, t: 0, R: RC, readyAt: 0, until: 0, returnAt: 0,
    nextSweat: 0, nextPant: 1 + (slot % 7) * 0.4, bubble: null, downPlaced: false, skin: '#f1c9a5',
  };
  const sp = benchSpot(o); o.x = sp.x; o.y = sp.y;
  return o;
}
const runners = AGENTS.map((a, i) => makeRunner(a, i, 1));
const lapInt = r => Math.floor(r.lapF + 1e-9);
function spawnExtra(role, inst) {
  const used = new Set(runners.map(r => r.slot));
  for (let sl = BASE_SLOTS; sl < MAX_SLOTS; sl++) {
    if (used.has(sl)) continue;
    const r = makeRunner(AGENTS.find(a => a.id === role), sl, inst);
    runners.push(r); buildChips(); return r;
  }
  return null; // 자리가 없으면 표시만 생략(표에는 집계)
}

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
        r.state = 'run'; r.v = 0; r.R = r.laneR; r.t = (sp.x - (CX - L)) / pathLen(r.R); r.face = 1;
      }
      break;
    }
    case 'run': {
      const mode = li < 10 ? 'run' : li < 15 ? 'crawl' : 'wheel';
      // 속도는 px/s 기준(바깥 차선이라고 빨라지지 않게)이고, 단계가 바뀌어도 서서히 변한다
      const want = r.speed * (mode === 'run' ? 170 : mode === 'crawl' ? 90 : 120);
      r.v = (r.v || want) + (want - (r.v || want)) * Math.min(1, dt * 2);
      const sp = r.v / pathLen(r.R);
      r.t += sp * dt; r.lapF += sp * dt;
      r.R += (r.laneR - r.R) * Math.min(1, dt * 2.5);
      const p = pathPos(r.t, r.R);
      r.x = p.x; r.y = p.y;
      if (p.hx > 0.05) r.face = 1; else if (p.hx < -0.05) r.face = -1;
      r.ph += dt * (mode === 'run' ? 8 : mode === 'crawl' ? 4 : 5);
      const nl = lapInt(r);
      if (nl !== r.lastLap) {
        if (nl > r.lastLap && stat.laps < Number.MAX_SAFE_INTEGER) { stat.laps++; stat.dirty = true; } // 자연 완주만 센다(+5·초기화·복귀는 lastLap을 직접 맞추므로 여기 오지 않음)
        onLap(r, nl); r.lastLap = nl;
      }
      if (r.lapF >= 25) r.needAmb = true;
      const tt = ((r.t % 1) + 1) % 1;
      const inExit = tt * pathLen(r.R) < 2 * L && r.x >= 600 && r.x <= 780; // 아래 휴식 공간으로 빠지는 출구
      if (inExit) {
        if (r.needAmb) { r.state = 'down'; r.downPlaced = false; break; }
        if (li >= 15 && !r.wheeled) { r.wheeled = true; r.wheelStage = 0; r.state = 'wheelOut'; break; }
        if (!r.active) r.state = 'toRest';
      }
      break;
    }
    case 'wheelOut': { // 트랙 아래 휴식 공간으로 나가 휠체어를 타고 다시 입장
      if (!r.wheelStage) {
        if (walk(r, 690, 652, 110, dt)) { r.wheelStage = 1; r.until = simTime + 1.6; say(r, '휠체어 탑승!', 1.6); }
      } else if (simTime >= r.until) { r.wheelStage = 0; r.state = 'toStart'; }
      break;
    }
    case 'toRest': {
      const sp = drinkSpot(r);
      if (walk(r, sp.x, sp.y, 130, dt)) { r.state = 'drink'; r.until = simTime + 2.6; r.face = 1; say(r, '꿀꺽꿀꺽', 2); bottles[r.slot % 7] = Math.max(0, bottles[r.slot % 7] - 0.4); }
      break;
    }
    case 'drink': {
      r.ph += dt * 6;
      if (simTime >= r.until) { r.state = 'rest'; r.readyAt = simTime + 1.5; }
      break;
    }
    case 'down': {
      if (!r.downPlaced) {
        if (walk(r, 860 + (r.slot % 4) * 28, 672 + (row2(r) ? 22 : 0), 100, dt)) { r.downPlaced = true; amb.queue.push(r); say(r, '으윽…', 3); }
      }
      break;
    }
    case 'carried': case 'inAmb': break;
    case 'away': {
      if (simTime >= r.returnAt) {
        r.state = 'rest'; r.lapF = 0; r.lastLap = 0; r.R = r.laneR; r.wheeled = false; r.needAmb = false;
        const b = benchSpot(r); r.x = b.x; r.y = b.y; r.readyAt = simTime + 2;
        say(r, '복귀했습니다', 2);
      }
      break;
    }
  }
  // 땀·헉헉 (5바퀴 이상)
  if (li >= 5 && (r.state === 'run' || r.state === 'toRest' || r.state === 'down' || r.state === 'wheelOut')) {
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
  if (li === 10) say(r, '더는 못 뛰겠어… 기어갈게요!', 2);
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
// 구급차는 아래 휴식 공간에 정차한다. 의료원이 내려 들것에 환자를 싣고 트랙을 한 바퀴 달린 뒤 돌아와 싣고 떠난다.
const amb = { phase: 'idle', x: 1420, y: 735, ang: Math.PI, queue: [], patient: null, g: { x: 1165, y: 735, ang: 0, face: 1, tl: 0 }, t0: 0 };
const AMB_T0 = (700 - (CX - L)) / pathLen(RC);
const AMB_DOOR = { x: 1165, y: 735 };

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
function moveG(tx, ty, sp, dt) {
  const g = amb.g, ok = moveTo(g, tx, ty, sp, dt);
  if (g.dir !== undefined) { g.ang = g.dir; if (Math.abs(Math.cos(g.dir)) > 0.15) g.face = Math.cos(g.dir) > 0 ? 1 : -1; }
  return ok;
}
function updateAmb(dt) {
  const a = amb, g = a.g;
  switch (a.phase) {
    case 'idle':
      if (a.queue.length) {
        a.patient = a.queue.shift(); a.phase = 'arrive'; a.x = 1420; a.y = 735; a.ang = Math.PI;
        toast('🚑 구급차 출동 — ' + a.patient.name + ' (25바퀴)');
      }
      break;
    case 'arrive':
      if (drive(1200, 735, 240, dt)) { a.phase = 'unload'; a.t0 = simTime; g.x = AMB_DOOR.x; g.y = AMB_DOOR.y; g.ang = Math.PI; g.face = -1; }
      break;
    case 'unload':
      if (simTime - a.t0 > 0.8) a.phase = 'go';
      break;
    case 'go': {
      const p = a.patient;
      if (moveG(p.x, p.y + 14, 150, dt)) { a.phase = 'pick'; a.t0 = simTime; p.state = 'carried'; }
      break;
    }
    case 'pick':
      if (simTime - a.t0 > 1.2) a.phase = 'toTrack';
      break;
    case 'toTrack': {
      const e = pathPos(AMB_T0, RC);
      if (moveG(e.x, e.y, 170, dt)) { a.phase = 'lap'; g.tl = AMB_T0; }
      break;
    }
    case 'lap': { // 의료원 둘이 환자를 실은 들것을 들고 트랙을 한 바퀴 달린다
      g.tl += 200 / pathLen(RC) * dt;
      const p = pathPos(g.tl, RC);
      g.x = p.x; g.y = p.y; g.ang = Math.atan2(p.hy, p.hx);
      if (p.hx > 0.05) g.face = 1; else if (p.hx < -0.05) g.face = -1;
      if (g.tl >= AMB_T0 + 1) a.phase = 'back';
      break;
    }
    case 'back':
      if (moveG(AMB_DOOR.x, AMB_DOOR.y, 170, dt)) { a.phase = 'load'; a.t0 = simTime; g.ang = 0; }
      break;
    case 'load':
      if (simTime - a.t0 > 0.9) { a.patient.state = 'inAmb'; a.phase = 'leave'; }
      break;
    case 'leave':
      if (drive(1440, 735, 240, dt)) {
        a.phase = 'idle'; a.patient.state = 'away'; a.patient.returnAt = simTime + 4;
        toast('🏥 ' + a.patient.name + ' 병원 이송 완료 — 곧 복귀');
      }
      break;
  }
  if (a.patient && a.patient.state === 'carried') { a.patient.x = g.x; a.patient.y = g.y; }
}

/* ---------- 청소부 ---------- */
// 'cleaner' 에이전트가 일하는 동안 나타나 생수 채우기 → 벤치 닦기 → 트랙 닦기를 반복하고, 일이 끝나면 퇴근한다.
const CLEANER = { id: 'cleaner', name: '청소부', color: '#26c6da' };
const jan = { active: false, task: '', present: false, x: -30, y: 770, face: 1, ph: 0, job: 'enter', stage: 0, k: 0, t: 0, bubble: null, trail: [] };
const bottles = Array(7).fill(1); // 생수 잔량(0~1) — 선수가 마시면 줄고 청소부가 채운다
const JOBS = ['water', 'bench', 'track'];
const JOB_LABEL = { enter: '출근 중', water: '생수 채우는 중', bench: '벤치 닦는 중', track: '트랙 닦는 중', leave: '퇴근 중' };
function janNext() {
  const i = JOBS.indexOf(jan.job);
  jan.job = JOBS[(i + 1) % JOBS.length]; jan.stage = 0; jan.k = 0;
  say(jan, { water: '생수 채울게요', bench: '벤치 닦자~', track: '트랙 닦자~' }[jan.job], 1.8);
}
function updateJanitor(dt) {
  const j = jan;
  j.ph += dt * 6;
  if (j.bubble && simTime > j.bubble.until) j.bubble = null;
  for (let i = j.trail.length - 1; i >= 0; i--) { j.trail[i].life -= dt / 7; if (j.trail[i].life <= 0) j.trail.splice(i, 1); }
  if (!j.present) {
    if (j.active) { j.present = true; j.x = -30; j.y = 770; j.job = 'enter'; j.stage = 0; say(j, '청소 시작!', 2); }
    return;
  }
  if (!j.active && j.job !== 'leave') { j.job = 'leave'; j.stage = 0; say(j, '수고하세요~', 2); }
  switch (j.job) {
    case 'enter':
      if (walk(j, 300, 770, 120, dt)) { j.job = 'track'; janNext(); } // 다음 순서인 생수 채우기부터
      break;
    case 'water': { // 생수대 앞에서 병을 하나씩 채운다
      const bx = 566 + j.k * 28 + 3;
      if (j.stage === 0) { if (walk(j, bx, 712, 100, dt)) { j.stage = 1; j.t = simTime; } }
      else if (j.stage === 1) {
        j.face = 1; bottles[j.k] = Math.min(1, bottles[j.k] + dt * 1.2);
        if (simTime - j.t > 0.7 && bottles[j.k] >= 1) { if (++j.k >= 7) janNext(); else j.stage = 0; }
      }
      break;
    }
    case 'bench': // 벤치 앞을 오른쪽으로 갔다 왼쪽으로 돌아오며 닦는다
      if (j.stage === 0) { if (walk(j, 60, 716, 110, dt)) j.stage = 1; }
      else if (j.stage === 1) { j.face = 1; j.x += 45 * dt; if (j.x >= 380) j.stage = 2; }
      else if (j.stage === 2) { j.face = -1; j.x -= 45 * dt; if (j.x <= 60) janNext(); }
      break;
    case 'track': // 출입구로 올라가 트랙을 한 바퀴 걸레질한다
      if (j.stage === 0) { if (walk(j, 470, 500, 120, dt)) { j.stage = 1; j.t = (470 - (CX - L)) / pathLen(150); j.t0 = j.t; j.lastTrail = j.t; } }
      else if (j.stage === 1) {
        j.t += 85 / pathLen(150) * dt;
        const p = pathPos(j.t, 150); j.x = p.x; j.y = p.y;
        if (p.hx > 0.05) j.face = 1; else if (p.hx < -0.05) j.face = -1;
        if (Math.abs(j.t - j.lastTrail) > 9 / pathLen(150)) { j.lastTrail = j.t; j.trail.push({ x: p.x, y: p.y, life: 1 }); }
        if (j.t >= j.t0 + 1) j.stage = 2;
      } else if (walk(j, 470, 716, 120, dt)) janNext();
      break;
    case 'leave':
      if (walk(j, -40, 770, 130, dt)) { j.present = false; j.trail.length = 0; }
      break;
  }
}
function drawJanitor() {
  const j = jan;
  if (!j.present) return;
  const working = (j.job === 'water' && j.stage === 1) || (j.job === 'bench' && j.stage >= 1) || (j.job === 'track' && j.stage === 1);
  drawPerson({ x: j.x, y: j.y, face: j.face, pose: working ? 'stand' : 'walk', ph: j.ph, color: '#1e88e5', hair: '#4e342e', skin: '#f1c9a5', hat: '#f9a825' });
  c.save(); c.translate(j.x, j.y); c.scale(j.face, 1);
  if (j.job === 'track' && j.stage === 1) { // 대걸레
    const w = Math.sin(j.ph) * 4;
    limb(8, -26, 26 + w, -2, 3, '#8d6e63');
    c.fillStyle = '#78909c'; c.fillRect(20 + w, -4, 16, 6);
  } else if (j.job === 'bench' && j.stage >= 1) { // 걸레로 닦기 + 반짝임
    const w = Math.sin(j.ph * 1.5) * 7;
    c.fillStyle = '#fff'; c.fillRect(10 + w, -26, 11, 6);
    c.fillStyle = '#fffde7'; c.fillRect(24 + w, -34 - (j.ph % 2) * 3, 3, 3); c.fillRect(2 + w, -36, 2, 2);
  } else if (j.job === 'water' && j.stage === 1) { // 물병 기울여 붓기
    c.save(); c.translate(8, -52); c.rotate(0.9);
    c.fillStyle = '#4fc3f7'; c.fillRect(-5, -8, 10, 16); c.fillStyle = '#e1f5fe'; c.fillRect(-2, -11, 4, 4);
    c.restore();
    limb(14, -46, 14, -40, 2, '#81d4fa');
  } else { // 양동이
    c.fillStyle = '#90a4ae'; c.beginPath(); c.moveTo(7, -14); c.lineTo(17, -14); c.lineTo(15, -4); c.lineTo(9, -4); c.closePath(); c.fill();
    c.strokeStyle = '#607d8b'; c.lineWidth = 1.5; c.beginPath(); c.arc(12, -14, 4, Math.PI, 0); c.stroke();
  }
  c.restore();
  const top = j.y - 62, fs = fz(11, 11, 1.4);
  c.save(); c.font = 'bold ' + fs + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const w2 = c.measureText(CLEANER.name).width + 8;
  c.fillStyle = CLEANER.color; rrect(j.x - w2 / 2, top - fs, w2, fs + 3, 4); c.fill();
  c.fillStyle = '#fff'; c.fillText(CLEANER.name, j.x, top); c.restore();
  if (j.bubble) drawBubble(j.x, top - fs - 3, j.bubble.text);
}
function drawTrail() { // 닦인 자리(젖은 광택) — 서서히 마른다
  for (const p of jan.trail) {
    c.fillStyle = 'rgba(255,255,255,' + (0.28 * p.life).toFixed(3) + ')';
    c.beginPath(); c.ellipse(p.x, p.y, 11, 7, 0, 0, Math.PI * 2); c.fill();
  }
}
function drawCleanerRow(cmp, fnt) {
  const y = 262 + AGENTS.length * 22;
  if (jan.active) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(398, y - 10, 484, 21); }
  disc(412, y, 6, CLEANER.color);
  c.textAlign = 'left'; c.font = fnt(true, 15, 14, 1.5);
  c.fillStyle = jan.present ? '#fff' : '#cfd8dc'; c.fillText(CLEANER.name, 426, y);
  c.font = fnt(false, 13, 11, 1.6); c.fillStyle = jan.present ? '#ffeaa7' : '#b2bec3';
  c.fillText(jan.present ? JOB_LABEL[jan.job] : '대기', cmp ? 566 : 498, y);
  if (!cmp && jan.task) { c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3'; c.fillText(jan.task, 660, y); }
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
function waveOn() { return runners.some(r => lapInt(r) >= 15 && ['run', 'toRest', 'down', 'wheelOut'].includes(r.state)); }
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
  c.fillStyle = '#546e7a'; c.font = 'bold ' + fz(15, 12, 1.3) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('휴식 공간', 12, 620);
  c.fillText('벤치', 40, 776);
  c.fillText('💧 생수대', 560, 776);
  c.fillText('🛏️ 누워 쉬는 곳', 800, 782);
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = fz(12, 11, 1.3) + 'px "Malgun Gothic", sans-serif';
  c.fillText('출입구 ▲', 592, 596);
}

function drawBench() {
  if (runners.some(row2)) { c.fillStyle = '#8d6e63'; c.fillRect(50, 738, 340, 8); c.fillStyle = '#5d4037'; for (const x of [58, 220, 376]) c.fillRect(x, 746, 6, 10); }
  c.fillStyle = '#8d6e63'; c.fillRect(50, 686, 340, 8);
  c.fillStyle = '#5d4037'; for (const x of [58, 220, 376]) c.fillRect(x, 694, 6, 10);
}
function drawTable() {
  // 선수 뒤에 서 있도록 선수 다음에 그린다
  c.fillStyle = '#a1887f'; c.fillRect(540, 686, 220, 12);
  c.fillStyle = '#6d4c41'; c.fillRect(550, 698, 8, 34); c.fillRect(742, 698, 8, 34);
  for (let i = 0; i < 7; i++) {
    const x = 560 + i * 28;
    if (runners[i] && runners[i].state === 'drink') continue;
    c.fillStyle = 'rgba(227,242,253,.9)'; c.fillRect(x, 672, 7, 14);
    const lv = Math.max(0, Math.min(1, bottles[i]));
    c.fillStyle = '#74b9ff'; c.fillRect(x, 672 + 14 * (1 - lv), 7, 14 * lv);
    c.strokeStyle = '#90a4ae'; c.lineWidth = 0.8; c.strokeRect(x, 672, 7, 14);
    c.fillStyle = '#fff'; c.fillRect(x + 1, 669, 5, 3);
  }
}

function drawCoachBox() {
  // 코치석
  c.fillStyle = '#6d4c41'; c.fillRect(14, 156, 196, 12);
  c.fillStyle = '#8d6e63'; c.fillRect(14, 168, 196, 6);
  c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(6, 46); c.lineTo(110, 22); c.lineTo(218, 46); c.closePath(); c.fill();
  c.fillStyle = '#5d4037'; c.fillRect(20, 58, 5, 98); c.fillRect(199, 58, 5, 98);
  c.fillStyle = '#4e342e'; c.fillRect(14, 46, 196, 12); // 간판 보
  c.fillStyle = '#fff'; c.font = 'bold ' + fz(12, 11, 1.2) + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('감독 · 코치석', 110, 52);
  // 전광판
  c.fillStyle = '#111'; rrect(14, 186, 196, 84, 6); c.fill();
  c.strokeStyle = '#444'; c.lineWidth = 2; c.stroke();
  const n = runners.filter(r => r.active).length;
  c.fillStyle = '#ffb300'; c.font = 'bold 13px monospace'; c.textAlign = 'left';
  c.fillText('작업 중 ' + n + ' / ' + runners.length, 24, 204);
  c.fillText('누적 ' + fmtLaps(stat.laps) + '바퀴', 24, 224); // 고정 위치(스크롤 아님)
  c.save();
  c.beginPath(); c.rect(20, 234, 184, 30); c.clip();
  const txt = coachTask ? '메인: ' + coachTask : '메인: 대기 중';
  const tw = c.measureText(txt).width, avail = 180;
  const off = tw > avail ? -((simTime * 30) % (tw + 40)) : 0;
  c.fillStyle = '#ffb300'; c.fillText(txt, 24 + off, 250);
  if (tw > avail) c.fillText(txt, 24 + off + tw + 40, 250);
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
  const cmp = K < 0.8; // 좁은 창: 글자를 키우고 task 열은 접는다(task는 위쪽 #now 줄에 있음)
  const fnt = (bold, px, min, cap) => (bold ? 'bold ' : '') + (cmp ? fz(px, min, cap) : px) + 'px "Malgun Gothic", sans-serif';
  c.fillStyle = 'rgba(0,0,0,.45)'; rrect(392, 218, 496, 226, 10); c.fill();
  c.textBaseline = 'middle';
  c.fillStyle = '#fff'; c.font = fnt(true, 17, 14, 1.4); c.textAlign = 'left';
  c.fillText('🏁 에이전트 현황', 408, 236);
  c.textAlign = 'right'; c.font = fnt(false, 12, 11, 1.5); c.fillStyle = '#b2bec3';
  c.fillText('뛰는 중 ' + runners.filter(r => r.state === 'run').length + '명', 872, 236);
  AGENTS.forEach((a, i) => {
    const y = 262 + i * 22;
    const rs = runners.filter(r => r.role === a.id), act = rs.filter(r => r.active);
    const lead = rs.find(r => r.state === 'run') || act[0] || rs[0];
    const run = lead.state === 'run';
    if (act.length) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(398, y - 10, 484, 21); }
    disc(412, y, 6, a.color);
    c.textAlign = 'left'; c.font = fnt(true, 15, 14, 1.5);
    c.fillStyle = run ? '#fff' : '#cfd8dc'; c.fillText(a.name + (act.length > 1 ? ' ×' + act.length : ''), 426, y);
    c.font = fnt(false, 13, 11, 1.6); c.fillStyle = run ? '#ffeaa7' : '#b2bec3';
    c.fillText(stateLabel(lead), cmp ? 566 : 498, y);
    c.textAlign = 'right'; c.font = fnt(true, 16, 14, 1.4); c.fillStyle = '#fff';
    c.fillText(Math.max(...rs.map(lapInt)) + '바퀴', cmp ? 872 : 650, y);
    if (cmp) return;
    c.textAlign = 'left'; c.font = '12px "Malgun Gothic", sans-serif'; c.fillStyle = '#b2bec3';
    let tk = rs.map(r => r.task).filter(Boolean).join(' / ');
    while (tk.length > 1 && c.measureText(tk).width > 205) tk = tk.slice(0, -2) + '…';
    c.fillText(tk, 660, y);
  });
  drawCleanerRow(cmp, fnt);
}

/* ---------- 선수·구급 그리기 ---------- */
function poseOf(r) {
  const li = lapInt(r);
  switch (r.state) {
    case 'run': return li < 10 ? 'run' : li < 15 ? 'crawl' : 'wheel';
    case 'toStart': return r.wheeled && li >= 15 ? 'wheel' : 'walk';
    case 'toRest': return 'walk';
    case 'wheelOut': return r.wheelStage ? 'wheel' : 'walk';
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
  drawPerson({ x: r.x, y: r.y, face: r.face, pose, ph: r.ph, color: r.color, hair: r.hair, skin: r.skin, dy: r.state === 'carried' ? 6 : 0 });
  const top = pose === 'crawl' ? r.y - 36 : pose === 'lie' ? r.y - 30 : pose === 'sit' ? r.y - 52 : r.y - 62;
  const fs = fz(11, 11, 1.4);
  c.save();
  c.font = 'bold ' + fs + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const w = c.measureText(r.name).width + 8;
  c.fillStyle = r.color; rrect(r.x - w / 2, top - fs, w, fs + 3, 4); c.fill();
  c.fillStyle = '#fff'; c.fillText(r.name, r.x, top);
  c.restore();
  if (r.bubble) {
    // 아래쪽 차선 선수의 말풍선이 현황판(y218~444)을 덮으면 발 아래로 뒤집는다
    const bt = top - fs - 3 - 22 * fz(14, 12, 1.4) / 14 - 2;
    if (r.y > 444 && r.x > 300 && r.x < 980 && bt < 444) drawBubble(r.x, r.y + 6, r.bubble.text, true);
    else drawBubble(r.x, top - fs - 3, r.bubble.text);
  }
}
function drawMedics() {
  const a = amb;
  if (!['unload', 'go', 'pick', 'toTrack', 'lap', 'back', 'load'].includes(a.phase)) return;
  const g = a.g, running = a.phase === 'toTrack' || a.phase === 'lap' || a.phase === 'back';
  const moving = running || a.phase === 'go';
  const ux = Math.cos(g.ang), uy = Math.sin(g.ang);
  // 들것 (이동 방향으로 눕혀 그린다)
  c.save(); c.translate(g.x, g.y - 12); c.rotate(g.ang);
  c.fillStyle = '#eceff1'; c.fillRect(-28, -3, 56, 5);
  c.fillStyle = '#90a4ae'; c.fillRect(-28, 2, 56, 2);
  c.restore();
  for (const sg of [-1, 1]) {
    const mx = g.x + sg * 34 * ux, my = g.y + sg * 34 * uy;
    drawPerson({ x: mx, y: my, face: g.face, pose: running ? 'run' : moving ? 'walk' : 'stand', ph: simTime * (running ? 9 : 6), color: '#fff', hair: '#222', skin: '#f1c9a5', hat: '#27ae60' });
    c.fillStyle = '#e74c3c'; c.fillRect(mx - 2, my - 32, 4, 10); c.fillRect(mx - 5, my - 29, 10, 4);
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
  drawTrail();
  drawInfield();
  drawBench();
  drawCoachBox();
  // 치어리더는 위쪽부터
  [...cheers].sort((a, b) => pathPos((a.i + .5) / CHEER_N, R_CHEER).y - pathPos((b.i + .5) / CHEER_N, R_CHEER).y).forEach(drawCheer);
  drawPerson({ x: coach.x, y: coach.y, face: 1, pose: 'coach', ph: coach.ph, color: '#2d3436', hair: '#222', skin: '#f1c9a5', hat: '#1e272e' });
  c.save(); const cfs = fz(11, 11, 1.4);
  c.font = 'bold ' + cfs + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd166'; rrect(coach.x - 22, coach.y - 66 - (cfs + 3), 44, cfs + 3, 4); c.fill();
  c.fillStyle = '#111'; c.fillText('메인', coach.x, coach.y - 66 - (cfs + 3) / 2); c.restore();
  if (coach.bubble) drawBubbleSide(228, 100, coach.bubble.text);
  drawMedics();
  [...runners].sort((a, b) => a.y - b.y).forEach(drawRunner);
  drawTable();
  drawJanitor();
  drawAmb();
  drawSweat();
}

/* ---------- 루프 ---------- */
function step(dt) {
  simTime += dt;
  runners.forEach(r => updateRunner(r, dt));
  for (let i = runners.length - 1; i >= 0; i--) { // 일을 마치고 쉬고 있는 추가 인스턴스는 화면에서 뺀다
    const r = runners[i];
    if (r.extra && !r.active && r.state === 'rest' && r.settled) { runners.splice(i, 1); buildChips(); }
  }
  updateAmb(dt); updateJanitor(dt); updateCoach(dt); updateCheer(); updateSweat(dt);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now; // 탭 전환·끊김 뒤에도 한 번에 뛰지 않게 상한
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
const chipsBox = document.getElementById('chips'), devBox = document.getElementById('devchips');
function buildChips() {
  chipsBox.innerHTML = ''; devBox.innerHTML = '';
  runners.forEach(r => {
    const d = document.createElement('div'); d.className = 'chip'; d.id = 'chip-' + r.id;
    d.innerHTML = '<span class="dot" style="background:' + r.color + '"></span><b>' + r.name + '</b><span class="st"></span>';
    chipsBox.appendChild(d);
    // 시험 도구: 에이전트별 수동 시작/멈춤, 바퀴 +5
    const t = document.createElement('button'); t.type = 'button'; t.dataset.k = r.id;
    t.onclick = () => setActive(r, !r.active);
    const p = document.createElement('button'); p.type = 'button'; p.textContent = r.name + ' +5바퀴';
    p.onclick = () => { r.lapF += 5; r.lastLap = lapInt(r); };
    devBox.append(t, p);
  });
  const cd = document.createElement('div'); cd.className = 'chip'; cd.id = 'chip-cleaner';
  cd.innerHTML = '<span class="dot" style="background:' + CLEANER.color + '"></span><b>' + CLEANER.name + '</b><span class="st"></span>';
  chipsBox.appendChild(cd);
  const ct = document.createElement('button'); ct.type = 'button'; ct.dataset.k = 'cleaner';
  ct.onclick = () => { jan.active = !jan.active; refreshChips(); };
  devBox.append(ct);
  refreshChips();
}
const nowBar = document.getElementById('now');
function refreshNow() {
  const parts = runners.filter(r => r.active).map(r => '<span class="run">▶</span> <b>' + r.name + '</b>' + (r.task ? ' <span>(' + r.task.replace(/[<>&]/g, '') + ')</span>' : ''));
  if (jan.active) parts.push('<span class="run">▶</span> <b>청소부</b>' + (jan.task ? ' <span>(' + jan.task.replace(/[<>&]/g, '') + ')</span>' : ''));
  nowBar.innerHTML = parts.length ? '지금 작업 중 ' + parts.length + '명: ' + parts.join('  ·  ') : '지금 작업 중인 에이전트: 없음';
}
function refreshChips() {
  refreshNow();
  const cc = document.getElementById('chip-cleaner');
  if (cc) {
    cc.classList.toggle('on', jan.active);
    cc.querySelector('.st').textContent = jan.present ? JOB_LABEL[jan.job] : (jan.active ? '출근 중' : '대기');
    const ct = devBox.querySelector('[data-k=cleaner]'); if (ct) ct.textContent = '청소부' + (jan.active ? ' 멈춤(시험)' : ' 시작(시험)');
  }
  runners.forEach(r => {
    const d = document.getElementById('chip-' + r.id); if (!d) return;
    d.classList.toggle('on', r.active);
    d.querySelector('.st').textContent = (r.active ? '작업 중' : '대기') + ' · ' + lapInt(r) + '바퀴';
    const t = devBox.querySelector('[data-k=' + r.id + ']');
    if (t) t.textContent = r.name + (r.active ? ' 멈춤(시험)' : ' 시작(시험)');
  });
}
setInterval(refreshChips, 1000);
document.getElementById('speed').onchange = e => { speedMul = +e.target.value; };
document.getElementById('sound').onclick = e => {
  soundOn = !soundOn; e.target.textContent = soundOn ? '🔊 소리 끄기' : '🔇 소리 켜기';
  if (soundOn) pantSound();
};
document.getElementById('full').onclick = () => {
  const st = document.querySelector('.stage');
  if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen();
};
document.getElementById('allOn').onclick = () => runners.forEach(r => setActive(r, true));
document.getElementById('allOff').onclick = () => runners.forEach(r => setActive(r, false));
document.getElementById('reset').onclick = () => runners.forEach(r => { r.lapF = 0; r.lastLap = 0; });

/* ---------- state.json 폴링 ---------- */
const prevFeed = {};
const FEED_TTL = 15 * 60 * 1000; // stop 이벤트가 유실돼도 15분 뒤엔 쉬게 한다
function syncRole(role, insts) {
  const rs = runners.filter(r => r.role === role).sort((x, y) => x.inst - y.inst);
  for (let k = rs.length; k < insts.length; k++) { const r = spawnExtra(role, k + 1); if (r) rs.push(r); }
  rs.forEach((r, k) => { const f = insts[k]; r.task = f ? f.task || '' : ''; setActive(r, !!f); });
}
function applyFeed(j) {
  if (j.coach && typeof j.coach.task === 'string') coachTask = j.coach.task;
  const fs2 = j.stats;
  if (fs2 && Number.isFinite(fs2.since)) {
    const fl = Number.isFinite(fs2.laps) && fs2.laps >= 0 ? Math.floor(fs2.laps) : 0;
    if (stat.since !== fs2.since) { stat.since = fs2.since; stat.laps = fl; stat.dirty = false; } // 첫 로드 또는 새 세션: feed 값으로 리셋
    else if (fl > stat.laps) stat.laps = fl; // 다른 탭이 더 앞서 있으면 따라간다(줄어들지 않음)
  }
  const ag = j.agents || {}, now = Date.now();
  AGENTS.forEach(a => {
    const f = ag[a.id]; if (!f) return;
    const key = JSON.stringify(f);
    if (prevFeed[a.id] === key) return;
    prevFeed[a.id] = key;
    let insts;
    if (f.instances) insts = Object.values(f.instances).filter(v => !(v.since && now - v.since > FEED_TTL)).sort((x, y) => (x.since || 0) - (y.since || 0));
    else insts = f.active && !(f.since && now - f.since > FEED_TTL) ? [{ task: f.task }] : [];
    syncRole(a.id, insts);
  });
  const cf = ag.cleaner;
  if (cf && prevFeed.cleaner !== JSON.stringify(cf)) {
    prevFeed.cleaner = JSON.stringify(cf);
    const ci = cf.instances ? Object.values(cf.instances).filter(v => !(v.since && now - v.since > FEED_TTL)).sort((x, y) => (x.since || 0) - (y.since || 0))
      : (cf.active && !(cf.since && now - cf.since > FEED_TTL) ? [{ task: cf.task }] : []);
    jan.active = ci.length > 0; jan.task = ci[0] ? ci[0].task || '' : '';
  }
  refreshNow(); refreshChips();
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
  checkVersion();
  setTimeout(poll, 2000);
}
let seenVersion = null, vTick = 0;
async function checkVersion() {
  if (++vTick % 3) return;
  try {
    const v = await (await fetch('/api/version', { cache: 'no-store' })).text();
    if (seenVersion && v !== seenVersion) location.reload();
    seenVersion = v;
  } catch (e) { /* 서버가 없으면(file://) 생략 */ }
}

setInterval(async () => { // 누적 바퀴수 저장: 변화가 있을 때만, 최대 3초에 한 번
  if (!stat.dirty || !live || stat.since === null) return;
  const lp = stat.laps, sn = stat.since;
  try {
    const res = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stats: { laps: lp, since: sn } }) });
    if (res.ok && stat.laps === lp && stat.since === sn) stat.dirty = false;
  } catch (e) { /* 서버가 없으면 다음 주기에 재시도 */ }
}, 3000);

buildChips();
poll();
requestAnimationFrame(frame);
