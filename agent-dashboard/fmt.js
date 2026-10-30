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
if (typeof module !== 'undefined' && module.exports) module.exports = { fmtLaps };
