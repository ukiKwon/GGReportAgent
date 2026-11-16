// 누적 바퀴수 표기. 10,000 미만은 천 단위 콤마 전체 숫자, 이상은 천/백만/십억 단위에 소수 1자리(.0 생략).
// 반올림 경계에서 "1000천"이 되면 윗 단위로 승격한다(999,950 -> 1백만).
function fmtLaps(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n > Number.MAX_SAFE_INTEGER) n = Number.MAX_SAFE_INTEGER;
  if (n < 10000) return n.toLocaleString('en-US');
  const U = [[1e3, '천'], [1e6, '백만'], [1e9, '십억']];
  let i = n >= 1e9 ? 2 : n >= 1e6 ? 1 : 0;
  let t = Math.round(n / (U[i][0] / 10)); // 소수 1자리 단위(tenths)를 정수로 계산 — 부동소수 오차 회피
  while (t >= 10000 && i < 2) { i++; t = Math.round(n / (U[i][0] / 10)); }
  const whole = Math.floor(t / 10), frac = t % 10;
  return whole.toLocaleString('en-US') + (frac ? '.' + frac : '') + U[i][1];
}

// ---- 사용자에게 물은 질문 패널용 순수 함수 (DOM 무관 — test/questions.test.js) ----
const Q_DAY = 864e5;
function qDayNum(s) { // 'YYYY-MM-DD' -> 일 번호(UTC 자정 기준, DST 영향 없음). 형식이 틀리면 NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? '' : s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / Q_DAY : NaN;
}
function qClassify(q) { const s = q && q.status; return s === 'done' || s === 'answered' || s === 'hold' ? s : 'open'; }
function qIsPending(q) { const c = qClassify(q); return c === 'open' || c === 'hold'; }
function qElapsedDays(askedAt, now) { // 물은 날부터 오늘까지 달력 일수. 날짜 오류 null, 미래는 0
  const a = qDayNum(askedAt); if (!Number.isFinite(a)) return null;
  const d = now || new Date();
  return Math.max(0, Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / Q_DAY - a);
}
function qDaysLabel(n) { return n == null ? '' : n === 0 ? '오늘' : n + '일째'; }
function qOverdue(n) { return n != null && n > 7; }
function qMd(s) { const m = /^\d{4}-(\d{2}-\d{2})/.exec(String(s == null ? '' : s)); return m ? m[1] : ''; }
function qSplit(list) { // -> { active:[해소 전 전부, 최근에 물은 순(사용자 2026-11-15)], done:[최근 해소 먼저], pendingCount }
  const L = Array.isArray(list) ? list.filter(q => q && typeof q === 'object') : [];
  const day = q => { const n = qDayNum(q.askedAt); return Number.isFinite(n) ? n : -Infinity; };
  const idc = (x, y) => String(x.id).localeCompare(String(y.id), 'en', { numeric: true });
  const active = L.filter(q => qClassify(q) !== 'done').sort((x, y) => day(y) - day(x) || idc(y, x)); // 같은 날은 번호 큰(나중) 것이 위
  const dk = q => { const n = qDayNum(q.answeredAt || q.askedAt); return Number.isFinite(n) ? n : -Infinity; };
  const done = L.filter(q => qClassify(q) === 'done').sort((x, y) => dk(y) - dk(x) || idc(x, y));
  return { active, done, pendingCount: L.filter(qIsPending).length };
}
function qGroups(list) { // 탭 묶음 -> { pending:[open·hold 최근에 물은 순], answered:[최근 답한 순], done:[최근 해소 순], counts } (사용자 2026-11-15 미응답/응답 탭)
  const L = Array.isArray(list) ? list.filter(q => q && typeof q === 'object') : [];
  const dn = s => { const n = qDayNum(s); return Number.isFinite(n) ? n : -Infinity; };
  const idc = (x, y) => String(y.id).localeCompare(String(x.id), 'en', { numeric: true }); // 같은 날은 번호 큰(나중) 것이 위
  const by = key => (x, y) => dn(key(y)) - dn(key(x)) || idc(x, y);
  const pending = L.filter(qIsPending).sort(by(q => q.askedAt));
  const answered = L.filter(q => qClassify(q) === 'answered').sort(by(q => q.answeredAt || q.askedAt));
  const done = L.filter(q => qClassify(q) === 'done').sort(by(q => q.answeredAt || q.askedAt));
  return { pending, answered, done, counts: { pending: pending.length, answered: answered.length, done: done.length } };
}
function qClock(d) { // Date -> 'HH:MM:SS'(잘못된 값은 '')
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  const z = n => String(n).padStart(2, '0');
  return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
}
// ---- 대시보드 연출 순수 함수 (DOM·전역 무관 — test/anim.test.js). app.js가 이 이름들로 위임한다(NEXT 43) ----
const lapIntOf = lapF => Math.floor(lapF + 1e-9);
const fatOf = (lapF, freshAt) => lapIntOf(lapF) - (freshAt || 0); // 피로 = 누적 바퀴 - 기준점
const isSplashOk = r => !!r && r.state === 'rest' && r.lieAt != null && !r.active;
function pickSplashCands(list, simTime, wait) { // 누운 지 wait초 지난 대상, 오래 누운 순(같으면 slot 순)
  return list.filter(r => isSplashOk(r) && simTime - r.lieAt >= wait).sort((a, b) => a.lieAt - b.lieAt || a.slot - b.slot);
}
const lastPourAfter = (prev, hit, now) => hit ? now : prev; // 실제로 깨운 붓기 끝만 갱신
// 공사판 행성: 누적 → 전체 층 T = floor(누적/perFloor)+1, 행성 번호 = floor((T-1)/perPlanet)(0=지구), 그 행성의 층 = (T-1)%perPlanet+1(사용자 11-16)
function planetOf(laps, perFloor, perPlanet) { const T = Math.floor(Math.max(0, Number(laps) || 0) / perFloor) + 1; return { planet: Math.floor((T - 1) / perPlanet), floor: (T - 1) % perPlanet + 1, total: T }; }
const nextSplashAt = (prev, poured, lastPour, cooldown) => poured ? lastPour + cooldown : prev; // 깨운 적 없으면 쿨다운 없음
if (typeof module !== 'undefined' && module.exports) module.exports = { fmtLaps, qClassify, qIsPending, qElapsedDays, qDaysLabel, qOverdue, qMd, qSplit, qGroups, qClock, lapIntOf, fatOf, isSplashOk, pickSplashCands, lastPourAfter, nextSplashAt, planetOf };
