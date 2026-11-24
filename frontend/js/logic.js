(function (root) {
  'use strict';
  const logic = {};

  // HTML 엔티티 이스케이프(공유). render.js/app.js의 모든 텍스트 싱크가 이걸 사용.
  logic.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  };

  // 레코드의 전체 표시 필드(순서 고정) — 편집 모달/팝오버가 공유.
  // 이 중 서버 registry에 대응 필드가 없는 것들은 store.LOCAL_ONLY_FIELDS 참고
  // (서버 모드에서 편집 overlay가 덮어도 되는 필드 = 그것뿐이다).
  logic.ALL_FIELDS = ['name','type','region','subRegion','term','lastBid','contractEnd','confirmed','contractExpiry','lng','lat','sources','updatedAt'];

  // 서버 모드에서 **저장 경로가 아예 없는** 필드. 편집창에서 잠가 무음 실패를 막는다.
  // 기관명(name)이 그렇다: PUT 페이로드에도 InstitutionUpdateIn에도 없고,
  // store.LOCAL_ONLY_FIELDS에도 없어서 고쳐도 서버·화면 어디에도 남지 않았다.
  // 서버에 name_ko 갱신을 넣는 것도 간단하지 않다 — 기관명은 serverdata.mergeUnion의
  // 병합 키라, 서버에서 바꾸면 번들 행과의 매칭이 끊겨 같은 기관이 두 줄로 갈라진다.
  logic.SERVER_UNSAVABLE_FIELDS = ['name'];

  logic.FIELD_LABELS = { name:'기관명', type:'기관구분', region:'지역코드', subRegion:'구시군코드',
    term:'입찰주기', lastBid:'지난 금고 선정일', contractEnd:'입찰예상일', confirmed:'확정여부',
    contractExpiry:'약정 만료일', lng:'경도', lat:'위도', sources:'출처', updatedAt:'수정일' };

  // 지자체 기관명 → 행정구역 폴리곤명 정규화. '마포구청'→'마포구', '서울시청(예시)'→'서울시'.
  // subRegion 코드가 비어 있는 레코드를 구/시군 면에 붙이는 폴백 매칭에 쓴다.
  logic.normalizeMuniName = function (s) {
    return String(s == null ? '' : s).replace(/\([^)]*\)\s*$/, '').trim().replace(/청$/, '');
  };

  // 계정 전환기(데모 전용) 표기. 역할만 있는 항목은 사람이 아님을 드러낸다 —
  // 시스템 알림이 역할 앞으로 오기 때문에 역할도 하나의 "계정"이 된다.
  logic.accountLabel = function (a) {
    if (!a) return '';
    if (!a.name) return '(역할만) ' + (a.team || '');
    return a.team ? a.name + ' (' + a.team + ')' : a.name;
  };

  // select의 value 하나에 이름·소속을 실어 왕복시킨다. 구분자는 사람이 입력할 수 없는
  // 제어문자(U+241F)라 이름이나 팀명과 충돌하지 않는다.
  const ACCOUNT_SEP = '␟';
  logic.accountValue = function (a) {
    return ((a && a.name) || '') + ACCOUNT_SEP + ((a && a.team) || '');
  };
  logic.parseAccountValue = function (v) {
    const parts = String(v == null ? '' : v).split(ACCOUNT_SEP);
    return { name: parts[0] || '', team: parts[1] || '' };
  };

  logic.URGENCY = { RED:'red', ORANGE:'orange', YELLOW:'yellow', BLUE:'blue', GRAY:'gray' };

  // 지도 라벨 겹침 해소(순수 계산). boxes: [{x,y,w,h}] — y는 라벨 중심.
  // 겹치는 쌍을 세로로 밀어내고, 각 박스에 적용할 y 이동량 배열을 돌려준다.
  // DOM을 모르는 순수 함수라 렌더 없이 검증할 수 있다.
  logic.separateLabelsY = function (boxes, gap, passes) {
    const g = gap == null ? 2 : gap;
    const n = (passes == null ? 3 : passes);
    const dy = boxes.map(function () { return 0; });
    for (let pass = 0; pass < n; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          // 가로가 안 겹치면 세로가 겹쳐도 글자끼리는 안 부딪힌다
          const overlapX = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
          if (overlapX <= 0) continue;
          const ay = a.y + dy[i], by = b.y + dy[j];
          const overlapY = Math.min(ay + a.h / 2, by + b.h / 2) - Math.max(ay - a.h / 2, by - b.h / 2);
          if (overlapY <= 0) continue;
          const push = overlapY / 2 + g;
          // 위에 있는 쪽을 더 위로, 아래쪽을 더 아래로
          if (ay <= by) { dy[i] -= push; dy[j] += push; }
          else { dy[i] += push; dy[j] -= push; }
        }
      }
    }
    return dy;
  };

  logic.daysUntil = function (contractEnd, today) {
    if (!contractEnd) return Infinity;
    const end = new Date(contractEnd + 'T00:00:00');
    if (isNaN(end.getTime())) return Infinity;
    return Math.floor((end - today) / 86400000);
  };

  logic.computeUrgency = function (contractEnd, today) {
    const d = logic.daysUntil(contractEnd, today);
    if (d === Infinity) return logic.URGENCY.GRAY;
    if (d <= 182) return logic.URGENCY.RED;   // 6개월(≈182일) 이내, 과거 포함
    if (d <= 365) return logic.URGENCY.ORANGE;
    if (d <= 730) return logic.URGENCY.YELLOW;
    return logic.URGENCY.BLUE;
  };

  logic.addYears = function (dateStr, years) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (isNaN(d.getTime())) return null;
    d.setUTCFullYear(d.getUTCFullYear() + Number(years));
    return d.toISOString().slice(0, 10);
  };

  // 월 가감(말일 보정 — 08-31에서 6개월 빼면 02-28/29). 'YYYY-MM-DD'만 받는다.
  logic.addMonths = function (dateStr, months) {
    if (!dateStr || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(dateStr))) return null;
    const p = String(dateStr).split('-');
    const y = Number(p[0]), m = Number(p[1]) - 1 + Number(months), day = Number(p[2]);
    if (isNaN(m)) return null;
    const first = new Date(Date.UTC(y, m, 1));
    if (isNaN(first.getTime())) return null;
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(day, last));
    return first.toISOString().slice(0, 10);
  };

  // 약정 만료일 기준 다음 공고 추정(NEXT 14, planner 2026-11-11): 만료 6개월 전.
  // 12-31 만료 회차의 실제 계획 공고는 07-16~08-25(중앙값 08-12)라 늦게 알리지 않는 쪽으로 둔다.
  // 'YYYY'만 있으면 그해 12-31로 본다.
  logic.EXPIRY_LEAD_MONTHS = 6;
  logic.expiryEstimate = function (expiry) {
    if (!expiry) return null;
    const s = /^\d{4}$/.test(String(expiry)) ? expiry + '-12-31' : String(expiry);
    return logic.addMonths(s, -logic.EXPIRY_LEAD_MONTHS);
  };

  // 유효 입찰예상일 + confidence 유도(저장하지 않음).
  // contractEnd(실제 뜬 공고)가 있으면 그것. 없으면 lastBid+term과 약정 만료 기준 추정 중 **이른 쪽**
  // (늦게 알리는 것보다 일찍 확인하게 하는 편이 낫다). basis: 'notice'|'cycle'|'expiry'.
  logic.effectiveBid = function (rec) {
    if (rec.contractEnd) return { date: rec.contractEnd, confidence: rec.confirmed ? '확정' : '추측', basis: 'notice' };
    const cyc = (rec.lastBid && rec.term) ? logic.addYears(rec.lastBid, rec.term) : null;
    let exp = logic.expiryEstimate(rec.contractExpiry);
    // 낡은 약정: 마지막 회차(lastBid)가 그 약정 만료 추정일 이후면 이미 새 회차가 끝난 것 — 무시한다
    // (서버 last_bid나 편집으로 lastBid가 새 회차로 바뀐 경우, qa b497934 지적).
    if (exp && rec.lastBid && exp <= rec.lastBid) exp = null;
    if (cyc && (!exp || cyc <= exp)) return { date: cyc, confidence: '추측', basis: 'cycle' };
    if (exp) return { date: exp, confidence: '추측', basis: 'expiry' };
    return { date: null, confidence: '미상' };
  };

  logic.urgencyOf = function (rec, today) {
    return logic.computeUrgency(logic.effectiveBid(rec).date, today);
  };

  // D-day 표기. 지난 날짜를 'D-' + 음수로 이으면 'D--3' 같은 글자가 나온다 —
  // 전국 데이터가 들어오면서 **이미 공고가 뜬 진행 중인 건**이 생겨 실제로 드러났다.
  // 관례대로 지난 것은 D+n, 당일은 D-day로 쓴다.
  logic.formatDDay = function (rec, today) {
    const d = logic.daysUntil(logic.effectiveBid(rec).date, today);
    if (d === Infinity) return '미상';
    if (d === 0) return 'D-day';
    return d > 0 ? 'D-' + d : 'D+' + (-d);
  };

  logic.formatBidDate = function (rec) {
    const e = logic.effectiveBid(rec);
    return e.date ? (e.date + '(' + e.confidence + ')') : '미상';
  };

  // 같은 기관이 일반구 폴리곤 수만큼 반복 등록될 수 있다(ⓐ안 — 수원 4·성남 3 등이
  // 전부 같은 시 값을 든다). 임박 TOP5 티커처럼 **기관 단위**로 보여야 하는 곳에서
  // 그대로 쓰면 한 시가 여러 자리를 차지해 다른 기관이 밀려난다. 입력 순서를
  // 보존하고 첫 등장만 남기므로 sortByUrgency 뒤에 쓰면 임박순이 유지된다.
  // 키가 name만이 아니라 region+name인 이유: 동명 기관이 실제로 있다
  // (경기 광주시청처럼 — 지역이 다르면 다른 기관이므로 둘 다 남아야 한다).
  logic.dedupeByInstitution = function (list) {
    const seen = new Set();
    return list.filter(function (r) {
      const key = (r.region || '') + '|' + (r.name || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // ── 공고 예정일 경과(NEXT 30 추가 요건, 1단계 — 화면만) ─────────────────────────
  // 로컬 날짜 'YYYY-MM-DD'. toISOString()은 UTC라 한국 시각 00~09시에 하루 전 날짜가 나온다
  // (티커 '기준' 표기가 하루 늦던 버그). 연·월·일을 로컬 값으로 직접 조립한다.
  logic.localDateStr = function (d) {
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  // 화면 글자는 '추정', 내부 값은 '추측' 유지(테스트·비교 코드가 이 값에 결합돼 있다).
  logic.confidenceLabel = function (c) { return c === '추측' ? '추정' : c; };
  // formatBidDate의 화면용. 내부 값을 그대로 노출하지 않는다.
  logic.formatBidDateLabel = function (rec) {
    const e = logic.effectiveBid(rec);
    if (!e.date) return '미상';
    const tag = e.basis === 'expiry' ? '추정·약정 만료 기준' : logic.confidenceLabel(e.confidence);
    return e.date + '(' + tag + ')';
  };

  // 데이터 정정(NEXT 30-1) 전 임시 — 공고일이 contractEnd 칸에 들어 있어 날짜 의미가
  // 확인될 때까지 '공고일' 이름표와 보조 문구(logic.checkDateNote)를 붙이는 기관(region|name, dedupeByInstitution과 같은 키). 데이터 검수 11-23: 7곳 날짜는 모두 금고 지정 공고일.
  // 정정이 끝나 contractEnd 의미가 바로잡히면 이 상수와 표식을 함께 지운다.
  // data/ 파일은 건드리지 않는다.
  logic.OVERDUE_CHECK_KEYS = [
    // 2026-11-11: 회차 종료가 확인된 8곳(인천·강남·동대문·종로·구로·춘천·청주·포항)은 lastBid로 옮겨 뺐다(NEXT 30-1).
    '11|관악구청', '41|광명시청', '42|삼척시청', '42|양양군청', '45|정읍시청',
    '47|영천시청', '47|청송군청'];
  logic.instKey = function (r) { return (r.region || '') + '|' + (r.name || ''); };
  // 개원 예정 법원은 아직 금고 입찰 대상이 아니라 지도·현황판 목록에서 뺀다.
  logic.isOpeningCourt = function (r) { return !!r && r.type === '법원' && r.opStatus === '개원 예정'; };
  // base(서버 병합 목록) 위에 extras(지자체 외 번들)를 얹는다. 같은 instKey면 extras 칸을 바탕으로
  // base가 가진 칸이 덮는다(서버 값 우선, 서버에 없는 칸은 번들 값 보존). 없으면 extras 행을 뒤에 붙인다.
  // 029(기관 415행) 뒤 서버 최소행이 번들의 은행·약정 만료·확정·개원 예정 표식을 가리던 문제(2026-11-15).
  logic.overlayExtras = function (base, extras) {
    const byKey = {};
    (extras || []).forEach(function (x) { byKey[logic.instKey(x)] = x; });
    const have = {};
    const out = (base || []).map(function (r) {
      const k = logic.instKey(r);
      have[k] = true;
      return byKey[k] ? Object.assign({}, byKey[k], r) : r;
    });
    (extras || []).forEach(function (x) { if (!have[logic.instKey(x)]) out.push(x); });
    return out;
  };
  logic.isDateUnderReview = function (rec) {
    return logic.OVERDUE_CHECK_KEYS.indexOf(logic.instKey(rec)) >= 0;
  };
  // 공고일 이름표 7곳의 보조 문구용 약정 만료일. 레코드 칸(contractExpiry) 먼저, 없으면 행안부 현황(LOFIN_2026.rows[키])의 끝 날짜 중 가장 늦은 것. 없으면 ''.
  function dateOnly(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : ''; }
  logic.expiryDateOf = function (rec, lofin) {
    if (!rec) return '';
    const own = dateOnly(rec.contractExpiry);
    if (own) return own;
    const L = lofin !== undefined ? lofin : root.LOFIN_2026, k = logic.instKey(rec);
    const rows = L && L.rows && Object.prototype.hasOwnProperty.call(L.rows, k) ? L.rows[k] : null;
    let best = '';
    (Array.isArray(rows) ? rows : []).forEach(function (x) { const e = dateOnly(x && x.end); if (e > best) best = e; });
    return best;
  };
  // 7곳 날짜 아래 회색 한 줄 — 무슨 날짜인지 이름을 붙여 보인다(사용자 11-23 '무슨 날짜인지 명확히'). 데이터 검수 11-23: contractEnd 칸 값은 금고 지정 공고일.
  // 결과 확인 안내는 행의 기존 문구('결과가 났는지 확인하세요')가 하므로 여기서는 되풀이하지 않는다.
  logic.checkDateNote = function (rec, lofin) {
    const n = dateOnly(rec && rec.contractEnd), e = logic.expiryDateOf(rec, lofin);
    const parts = [];
    if (n) parts.push('공고일 ' + n);
    if (e) parts.push('약정 만료 ' + e);
    return parts.length ? parts.join(' · ') : '공고일 기준 날짜입니다';
  };

  // ── 공고 진행 중(2026-11-12, design-reviewer 1522 규격) ──────────────────────────
  // 확정 공고(confirmed + contractEnd = 공고일)가 오늘 이전 0~120일이면 '진행 중'이다. 공고일이 오늘 이후면
  // 기존대로 6개월 안 '예정'이다. 날짜 규칙(effectiveBid·contractExpiry)은 건드리지 않고 진행 중 여부만 따로 판정한다.
  // 접수 마감일(receiveTo)이 있으면 마감 전(receiving)·마감 지남(awaiting)으로 가르고, 없으면 마감일 미확인(unknown).
  logic.NOTICE_ACTIVE_DAYS = 120;
  // 접수 마감일을 모르는(unknown) 공고는 공고 후 30일 이내만 '접수 중일 수 있다'고 본다(지도 +2·띠 카드). 31~120일은 마감이
  // 지났을 가능성이 커 awaiting처럼 지도 색에서 빼고 띠 카드에도 넣지 않는다(목록 '결과 확인' 쪽, qa 11-12 M3).
  logic.NOTICE_UNKNOWN_OPEN_DAYS = 30;
  // http(s) 주소만 통과시키는 공용 검사: 앞뒤 공백을 자르고 공백 없는 http/https 주소면 그 값, 아니면 null.
  logic.safeHttpUrl = function (s) {
    const t = String(s == null ? '' : s).trim();
    return /^https?:\/\/\S+$/i.test(t) ? t : null;
  };
  function validYmd(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
  }
  // → null | { phase:'receiving'|'awaiting'|'unknown', since:공고 후 일수, receiveFrom, receiveTo, deadlineDays,
  //            late: 마감일 미확인이고 공고 후 30일 초과, check: awaiting 또는 late — '결과 확인' 묶음 }
  logic.noticeState = function (rec, today) {
    if (!rec || !rec.confirmed || !rec.contractEnd) return null;
    const since = 0 - logic.daysUntil(rec.contractEnd, today);   // 0 - x: -0이 되지 않게
    if (!(since >= 0 && since <= logic.NOTICE_ACTIVE_DAYS)) return null;
    const to = validYmd(rec.receiveTo) ? rec.receiveTo : null;
    const from = validYmd(rec.receiveFrom) ? rec.receiveFrom : null;
    const dl = to ? logic.daysUntil(to, today) : null;
    const phase = to === null ? 'unknown' : (dl >= 0 ? 'receiving' : 'awaiting');
    const late = phase === 'unknown' && since > logic.NOTICE_UNKNOWN_OPEN_DAYS;
    return { phase: phase, since: since, receiveFrom: from, receiveTo: to, deadlineDays: dl,
      late: late, check: phase === 'awaiting' || late };
  };
  // 진행 중 목록: 마감 전(마감 가까운 순) → 마감일 미확인(30일 이내) → 결과 확인(마감 지남·마감일 미확인 30일 초과), 뒤의 둘은 공고 후 일수 순.
  // 기관 단위 중복 제거. unknown = 30일 이내 미확인만, awaiting = 마감 지남, late = 30일 초과 미확인, check = awaiting + late.
  function noticeRank(it) { return it.phase === 'receiving' ? 0 : (it.check ? 2 : 1); }
  logic.noticeSummary = function (list, today) {
    const deduped = logic.dedupeByInstitution(list || []);
    const items = [];
    deduped.forEach(function (r) {
      const ns = logic.noticeState(r, today);
      if (!ns) return;
      items.push({ rec: r, name: r.name || '', region: r.region || '', date: r.contractEnd, phase: ns.phase, since: ns.since,
        receiveFrom: ns.receiveFrom, receiveTo: ns.receiveTo, deadlineDays: ns.deadlineDays, late: ns.late, check: ns.check });
    });
    items.sort(function (a, b) {
      return noticeRank(a) - noticeRank(b)
        || (a.phase === 'receiving' ? a.deadlineDays - b.deadlineDays : 0)
        || a.since - b.since
        || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    });
    const n = function (f) { return items.filter(f).length; };
    return { items: items, receiving: n(function (it) { return it.phase === 'receiving'; }),
      unknown: n(function (it) { return it.phase === 'unknown' && !it.late; }),
      awaiting: n(function (it) { return it.phase === 'awaiting'; }),
      late: n(function (it) { return it.late; }), check: n(function (it) { return it.check; }), total: deduped.length };
  };

  // 지도 팝오버·순위표용 공고 진행 한눈 표현(dashboard.js의 칩·noticeNote와 같은 용어). 진행 중이 아니면 null.
  // badge: 접수 마감 전 '마감 D-n' / 마감일 미확인(30일 이내) '공고 진행 중' / 마감 지남·미확인 30일 초과 '선정 결과 대기'.
  // cls: 팝오버 배지 색 계열(.dg-day) — 접수 마감 전만 urgent, 나머지는 unknown(무채색).
  // detail = '2026-10-29 · 접수 11.16~11.19', line = '공고 ' + detail.
  // 현황판 칩·둘째 줄 문구의 정본(2026-11-15 통합 — dashboard.noticeChipHtml·noticeNote가 이것을 HTML로 감싼다).
  // n = noticeState 결과 또는 현황판 모델 항목(phase·since·receiveFrom·receiveTo·deadlineDays·late·startDays).
  // chip = {kind:'open'|'wait', lead, value, tail, text}, note = [[글, 날짜인가]...], noteText = 이어 붙인 글.
  // 마감일을 모르는 공고의 안내 문구는 할 일을 말하는 이 상수 한 곳에서만 쓴다(2026-11-16 planner a84966ac 후보 A). 칩·건수·note·aria·경과 문구가 모두 가져다 쓴다.
  logic.NOTICE_WORDS = {
    unknownNote: '접수 기간은 공고 원문에서 확인하세요',   // 마감일 기록 없음, 공고 후 30일 이내
    unknownChip: '접수 기간 원문 확인',                  // 같은 상황의 칩·건수 이름
    resultNote: '결과 공고를 확인하세요',                // 30일 초과·120일 초과
    expiredNote: function (days) { return '공고 후 ' + days + '일 · ' + logic.NOTICE_WORDS.resultNote; }
  };
  logic.noticeText = function (n) {
    const md = function (s, sep) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[1] + sep + m[2] : ''; };
    const dd = function (k) { return k === 0 ? 'D-day' : 'D-' + k; };
    let chip, note;
    if (n.phase === 'receiving') {
      chip = { kind: 'open', lead: '마감 ', value: dd(n.deadlineDays), tail: '' };
      note = n.receiveFrom && n.receiveTo
        ? [['접수 ', false], [md(n.receiveFrom, '.') + '~' + md(n.receiveTo, '.'), true]]
        : [['마감 ', false], [md(n.receiveTo, '.'), true]];
      if (n.startDays > 0) note.push([' · 접수 시작 ' + dd(n.startDays), false]);
    } else {
      chip = { kind: 'wait', lead: '공고 후 ', value: String(n.since), tail: '일' };
      // 마감일 미확인: 공고 후 30일 이내(NOTICE_UNKNOWN_OPEN_DAYS)면 접수 중일 수 있어 원문 확인을, 31일부터는 결과 확인을 안내한다.
      if (n.phase === 'awaiting') note = [['마감 지남(', false], [md(n.receiveTo, '-'), true], [') · 결과가 났는지 확인하세요', false]];
      else note = [[n.late ? logic.NOTICE_WORDS.resultNote : logic.NOTICE_WORDS.unknownNote, false]];
    }
    chip.text = chip.lead + chip.value + chip.tail;
    return { chip: chip, note: note, noteText: note.map(function (s) { return s[0]; }).join('') };
  };
  logic.noticeBrief = function (rec, today) {
    const ns = logic.noticeState(rec, today);
    if (!ns) return null;
    const startDays = ns.receiveFrom ? logic.daysUntil(ns.receiveFrom, today) : null;
    const t = logic.noticeText(Object.assign({}, ns, { startDays: startDays }));
    const md = function (s) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[1] + '.' + m[2] : ''; };
    let badge, cls;
    if (ns.phase === 'receiving') { badge = t.chip.text; cls = 'urgent'; }
    else if (ns.check) { badge = '선정 결과 대기'; cls = 'unknown'; }
    else { badge = '공고 진행 중'; cls = 'unknown'; }
    let span;
    if (ns.receiveFrom && ns.receiveTo) span = '접수 ' + md(ns.receiveFrom) + '~' + md(ns.receiveTo);
    else if (ns.receiveTo) span = '마감 ' + md(ns.receiveTo);
    else span = logic.NOTICE_WORDS.unknownChip;
    const detail = rec.contractEnd + ' · ' + span;
    return { badge: badge, cls: cls, detail: detail, line: '공고 ' + detail, phase: ns.phase, state: ns,
      chip: t.chip, note: t.note, noteText: t.noteText };
  };

  // 경과 판정: 오늘 > 공고 예정일(유예 없음, 확정·추정 동일). 날짜 미상은 판정하지 않고
  // 건수만 센다. 기관 단위로 중복을 먼저 제거한다(수원 4구 등이 건수를 부풀리지 않게).
  // 진행 중 공고(noticeState)는 check 판정보다 먼저 걸러 경과에 넣지 않는다 — noticeSummary가 맡는다.
  // 반환 items는 최근에 지난 순(days 오름차순). days = 예정일이 지난 일수(양수).
  logic.overdueSummary = function (list, today) {
    const deduped = logic.dedupeByInstitution(list || []);
    const items = [];
    let unknown = 0, notice = 0;
    deduped.forEach(function (r) {
      if (logic.noticeState(r, today)) { notice += 1; return; }
      const e = logic.effectiveBid(r);
      const d = e.date ? logic.daysUntil(e.date, today) : Infinity;
      if (d === Infinity) { unknown += 1; return; }
      if (d >= 0) return;               // 오늘이 예정일이거나 아직 남음 — 경과 아님
      const check = logic.isDateUnderReview(r);
      // noticeExpired: 확정 공고(confirmed + contractEnd = 공고일)가 공고 후 120일을 넘긴 것 — 공고는 났고 결과만 모른다.
      // 'check'(공고일 이름표 7곳)여도 확정 공고면 true. 추정 날짜 경과는 false(공고 여부부터 확인).
      items.push({ rec: r, name: r.name || '', region: r.region || '', date: e.date, days: -d,
        kind: check ? 'check' : (e.confidence === '확정' ? 'fixed' : 'est'), check: check,
        noticeExpired: e.confidence === '확정' && e.basis === 'notice' && -d > logic.NOTICE_ACTIVE_DAYS });
    });
    items.sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)); });
    return { items: items, unknown: unknown, total: deduped.length, notice: notice };
  };

  // 패널 묶음: 관심 지역(watched 코드 목록)에 속한 건은 '관심 지역'에만 넣고 시·도 묶음에서는
  // 뺀다(두 번 세지 않음). 시·도는 건수 많은 순, 같으면 코드 순.
  logic.groupOverdue = function (items, watched, nameOf) {
    const w = watched || [];
    const watch = [], rest = {};
    items.forEach(function (it) {
      if (w.indexOf(it.region) >= 0) watch.push(it);
      else (rest[it.region] = rest[it.region] || []).push(it);
    });
    const bySido = Object.keys(rest).map(function (code) {
      return { code: code, name: nameOf ? nameOf(code) : code, items: rest[code] };
    }).sort(function (a, b) {
      return (b.items.length - a.items.length) || (a.code < b.code ? -1 : (a.code > b.code ? 1 : 0));
    });
    return { watch: watch, bySido: bySido };
  };

  // ── 공고 상태 기록(NEXT 30 2단계, 2026-11-16) — 상태 목록과 '미처리' 판정은 이 한 곳이다 ───────────────
  // 서버(/notice-rounds/current)는 회차별 최신 판정만 주고 경과·미처리 계산은 화면이 한다. snap = { byId:{[institution_id]:항목}, today:'YYYY-MM-DD' } | null.
  // snap이 null(서버 미연결·불러오는 중·실패)이면 모든 경과 건을 미처리로 센다.
  // 상태를 더하려면 이 표 한 줄만 고친다(라디오·검증·이력·보기 분류가 모두 이 표를 읽는다). next/opinion: 'req'(필수)|'opt'(선택)|'hide'(칸 없음).
  logic.REC_STATUSES = [
    { code: 'IN_PROGRESS', label: '공고 진행 중', view: 'done', next: 'opt', opinion: 'opt', help: '공고가 났고 접수나 심사가 진행 중입니다.' },
    { code: 'CLOSED', label: '공고 종료', view: 'done', next: 'hide', opinion: 'req', help: '이번 회차 공고 절차가 끝났습니다. 입찰 예정일은 그대로 둡니다. 낙찰·유찰은 \'입찰 결과 등록\'에서 적습니다.' },
    { code: 'NO_BID', label: '입찰 없음(연장·지정)', view: 'done', next: 'hide', opinion: 'req', help: '입찰 없이 약정을 연장하거나 다시 지정했습니다. 저장하면 이번 회차를 닫습니다.' },
    { code: 'DELAYED', label: '지연·재공고 대기', view: 'delayed', next: 'req', opinion: 'req', help: '예정일이 지났는데 공고가 아직 없거나, 유찰 뒤 재공고를 기다립니다.' }];
  logic.recStatus = function (code) { return logic.REC_STATUSES.filter(function (s) { return s.code === code; })[0] || null; };
  logic.REC_STATUS_LABEL = {};
  logic.REC_STATUSES.forEach(function (s) { logic.REC_STATUS_LABEL[s.code] = s.label; });
  // → { view:'pending'|'delayed'|'done', item, checkPassed }. rec.institutionId로 기록을 찾는다(없으면 기록 없음).
  // NO_BID로 닫힌 마지막 회차도 서버가 items에 round_closed:true로 내리므로(기관 자료가 넘어가기 전까지) 그대로 '처리됨'이 된다.
  logic.recordView = function (rec, snap, todayStr) {
    const id = (rec && (rec.institutionId || rec.institution_id)) || '';
    const item = snap && snap.byId && id && Object.prototype.hasOwnProperty.call(snap.byId, id) ? snap.byId[id] : null;
    if (!item) return { view: 'pending', item: null, checkPassed: false };
    const def = logic.recStatus(item.status_cd);
    if (!def) return { view: 'pending', item: item, checkPassed: false };   // 모르는 코드는 기록으로 치지 않는다
    if (def.view === 'delayed') {
      const today = (snap && snap.today) || todayStr || '', nc = item.next_check_date || '';
      const passed = !nc || !today || nc <= today;                        // 확인일을 모르면 미처리로 센다(놓치지 않는 쪽)
      return { view: passed ? 'pending' : 'delayed', item: item, checkPassed: passed };
    }
    return { view: 'done', item: item, checkPassed: false };
  };
  logic.isUnhandled = function (rec, snap, todayStr) { return logic.recordView(rec, snap, todayStr).view === 'pending'; };
  // 경과 항목({rec,...}[])을 세 보기로 가른다(순서 유지). 배지·팝업·지도 패널·경과 탭이 같이 쓴다.
  logic.splitOverdue = function (items, snap, todayStr) {
    const out = { pending: [], delayed: [], done: [] };
    (items || []).forEach(function (it) { out[logic.recordView(it.rec, snap, todayStr).view].push(it); });
    return out;
  };
  // 행 앞머리 글: [[글, 날짜인가]...] | null. 다음 확인일 전이면 '다음 확인 11-30', 지났으면 '다음 확인일 지남(11-14)'.
  logic.recordBrief = function (rv) {
    if (!rv || !rv.item) return null;
    const def = logic.recStatus(rv.item.status_cd);
    if (!def) return null;
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(rv.item.next_check_date || '')), d = m ? m[1] + '-' + m[2] : '';
    const head = '기록: ' + def.label;
    if (def.view !== 'delayed') return [[head, false]];
    if (rv.checkPassed) return d ? [[head + ' · 다음 확인일 지남(', false], [d, true], [')', false]] : [[head + ' · 다음 확인일 지남', false]];
    return d ? [[head + ' · 다음 확인 ', false], [d, true]] : [[head, false]];
  };
  logic.recordBriefText = function (rv) { const p = logic.recordBrief(rv); return p ? p.map(function (s) { return s[0]; }).join('') : ''; };

  // 팝업의 시·도별 건수(관심 지역 구분 없이 전체). 건수 많은 순, 같으면 코드 순.
  logic.countBySido = function (items, nameOf) {
    const m = {};
    items.forEach(function (it) { m[it.region] = (m[it.region] || 0) + 1; });
    return Object.keys(m).map(function (code) {
      return { code: code, name: nameOf ? nameOf(code) : code, n: m[code] };
    }).sort(function (a, b) { return (b.n - a.n) || (a.code < b.code ? -1 : (a.code > b.code ? 1 : 0)); });
  };

  // 팝업 상위 N건: 관심 지역 먼저 → 최근에 지난 순 → 공고일 이름표 7곳(check)은 맨 뒤.
  logic.pickTopOverdue = function (items, watched, n) {
    const w = watched || [];
    return items.slice().sort(function (a, b) {
      return (a.check ? 1 : 0) - (b.check ? 1 : 0)
        || (w.indexOf(a.region) >= 0 ? 0 : 1) - (w.indexOf(b.region) >= 0 ? 0 : 1)
        || a.days - b.days
        || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    }).slice(0, n == null ? 5 : n);
  };

  // 로그인 직후 팝업: 영업 계열 + 미처리 1건 이상 + 오늘 그만 보기 안 눌렀을 때만.
  logic.shouldShowOverduePopup = function (o) {
    return !!(o && o.sales && o.count > 0 && !o.skipped);
  };

  logic.REQUIRED_FIELDS = ['name','type','region'];

  logic.validateRecord = function (rec) {
    const missing = [];
    logic.REQUIRED_FIELDS.forEach(function (f) {
      if (rec[f] === undefined || rec[f] === null || rec[f] === '') missing.push(f);
    });
    return { valid: missing.length === 0, missing: missing };
  };

  logic.recordGlyph = function (rec) {
    if (!logic.validateRecord(rec).valid) return '!';
    if (!logic.effectiveBid(rec).date) return '⚠️';
    return '';
  };

  logic.markerShape = function (type) {
    // 모양은 종류(kind) 기준(NEXT 82): 종류 이름이나 옛 유형 이름 모두 받는다(kindOf가 접는다 — 종류 이름은 그대로 통과).
    // 종류를 모르는 유형은 가로 막대 — ◆는 법원 하나뿐이다.
    const map = { '병원':'circle', '교육청':'square', '공공기관':'triangle', '지자체':'polygon',
      '대학':'pentagon', '법원':'diamond' };
    return map[logic.kindOf(type)] || 'bar';
  };

  // 지도 색 섞기·'기관 분류선택' 필터가 보는 기관 종류 6종(정본, NEXT 78·82). 데이터의 옛 이름은 종류로 접는다.
  // 옛 필터 이름(공공기관·공기업·대학병원·대학교, FILTERABLE_TYPES)은 2026-11-12에 없앴다 — 필터는 이제 종류 6종이다.
  logic.TYPE_KINDS = ['지자체','교육청','공공기관','대학','법원','병원'];
  // 지방공기업은 공공기관으로 접는다(팀 결정 2026-11-12). 교육청은 따로(사용자 결정 2026-11-15, NEXT 82).
  // 재단법인은 '기타'로 빼지 않고 공공기관 유지(같은 결정).
  logic.KIND_OF_TYPE = { '지자체':'지자체', '공공기관':'공공기관', '공기업':'공공기관',
    '교육청':'교육청', '지방공기업':'공공기관',
    '대학':'대학', '대학교':'대학', '법원':'법원', '병원':'병원', '대학병원':'병원' };
  logic.kindOf = function (type) { return logic.KIND_OF_TYPE[type] || null; };

  // ── 지도 지역 색 섞기(NEXT 78, C안 '바닥 섞기 + ▲개수') ──────────────────────────
  // 규격: handoff/agents/design-reviewer/2026-11-11_1616_a821ad3f.md §3.
  // 기관 점수: 6개월 안 +2, 6~12개월 +1, 1~2년 −1, 2년 넘음 −2. 날짜 미상과 예정일이 지난(경과) 기관은
  // 계산에서 뺀다(null) — 경과는 '공고 예정일 경과' 목록에서 따로 다룬다(사용자 2026-11-12).
  // 진행 중 공고(noticeState)는 경과가 아니다(isOverdue=false). 점수는 마감 전·마감일 미확인이 +2(진행 중은 가장 급함,
  // 마감일을 모르는 곳은 공고 후 30일 이내만 +2), 마감 지난·마감일 미확인 30일 초과(결과 확인) 곳은 색에서 뺀다(null — 빨강은 진짜 급한 것만).
  logic.isOverdue = function (rec, today) {
    if (logic.noticeState(rec, today)) return false;
    const d = logic.daysUntil(logic.effectiveBid(rec).date, today);
    return d !== Infinity && d < 0;
  };
  logic.instScore = function (rec, today) {
    const ns = logic.noticeState(rec, today);
    if (ns) return ns.check ? null : 2;
    const d = logic.daysUntil(logic.effectiveBid(rec).date, today);
    if (d === Infinity || d < 0) return null;
    if (d <= 182) return 2;
    if (d <= 365) return 1;
    if (d <= 730) return -1;
    return -2;
  };

  // 평균 m → 5단: r3 진빨강 · r2 빨강 · p 보라 · b2 파랑 · b3 진파랑.
  logic.mixBandOf = function (m) {
    if (m >= 1.5) return 'r3';
    if (m >= 0.5) return 'r2';
    if (m > -0.5) return 'p';
    if (m > -1.5) return 'b2';
    return 'b3';
  };

  // 가장 임박한 기관 = 날짜가 있는 기관 중 남은 일수가 가장 작은 것(경과는 가장 앞). 같은 날이면
  // 확정이 먼저, 그래도 같으면 입력 순서. ▲를 정한 기관과 면 클릭으로 잡히는 기관이 같아야 한다.
  // 접수 마감 전인 진행 중 공고(receiving)가 있으면 마감이 가장 가까운 그곳이 맨 앞이다.
  logic.mostImminent = function (list, today) {
    let rbest = null, rd = Infinity;
    (list || []).forEach(function (r) {
      const ns = logic.noticeState(r, today);
      if (ns && ns.phase === 'receiving' && ns.deadlineDays < rd) { rbest = r; rd = ns.deadlineDays; }
    });
    if (rbest) return rbest;
    let best = null, bestD = Infinity, bestFixed = false;
    (list || []).forEach(function (r) {
      const e = logic.effectiveBid(r);
      const d = logic.daysUntil(e.date, today);
      if (d === Infinity) return;
      const fixed = e.confidence === '확정';
      if (best === null || d < bestD || (d === bestD && fixed && !bestFixed)) {
        best = r; bestD = d; bestFixed = fixed;
      }
    });
    return best;
  };

  // 지역(또는 면) 하나의 섞기 결과. list는 호출자가 켠 종류·기관 단위 중복 제거를 마친 목록.
  // band: 'none'(기관 0곳) | 'gray'(경과 아닌 날짜 있는 기관 0곳) | r3·r2·p·b2·b3.
  // 색은 평균 점수만으로 정한다(사용자 2026-11-12 — '최소 보라' 바닥 규칙 뺌). 경과 기관은 overdue로만 센다.
  // urgent = 6개월 안 기관 수(▲n), urgentAllEst = 그 기관이 전부 추정이면 true(속 빈 △).
  // 공고 진행 중(noticeState): notice = 진행 중 전체, noticeOpen = 마감 전+마감일 미확인 30일 이내(점수 +2), receiving = 마감 전,
  // awaiting = 마감 지남, late = 마감일 미확인 30일 초과(둘 다 결과 확인, 색에서 뺌), notices = 이름·상태 목록(툴팁용). 진행 중은 urgent(▲)에 세지 않는다(B안).
  logic.regionMix = function (list, today) {
    const items = list || [];
    const info = { total: items.length, dated: 0, unknown: 0, mean: null, band: 'none',
      overdue: 0, within6: 0, to12: 0, to24: 0, over24: 0, urgent: 0, urgentAllEst: false, imminent: null,
      notice: 0, noticeOpen: 0, receiving: 0, awaiting: 0, late: 0, notices: [] };
    let sum = 0, allEst = true;
    items.forEach(function (r) {
      const ns = logic.noticeState(r, today);
      if (ns) {
        info.notice += 1;
        if (ns.check) { if (ns.late) info.late += 1; else info.awaiting += 1; return; }
        info.noticeOpen += 1;
        if (ns.phase === 'receiving') info.receiving += 1;
        info.dated += 1; sum += 2;
        return;
      }
      if (logic.isOverdue(r, today)) { info.overdue += 1; return; }
      const s = logic.instScore(r, today);
      if (s === null) { info.unknown += 1; return; }
      info.dated += 1; sum += s;
      if (s === 2) {
        info.within6 += 1;
        if (logic.effectiveBid(r).confidence === '확정') allEst = false;
      } else if (s === 1) info.to12 += 1;
      else if (s === -1) info.to24 += 1;
      else info.over24 += 1;
    });
    info.urgent = info.within6;
    info.urgentAllEst = info.urgent > 0 && allEst;
    if (info.dated === 0) info.band = items.length ? 'gray' : 'none';
    else {
      info.mean = sum / info.dated;
      info.band = logic.mixBandOf(info.mean);
    }
    // '가장 임박'은 공고 전 예정 기관 중에서 고른다 — 진행 중 공고는 notices가 따로 말한다.
    info.imminent = logic.mostImminent(items.filter(function (r) {
      return !logic.isOverdue(r, today) && !logic.noticeState(r, today);
    }), today);
    if (info.notice) info.notices = logic.noticeSummary(items, today).items;
    return info;
  };

  // 라벨 뒤에 붙는 ▲n. 6개월 안 기관이 없으면 ''. 모두 추정이면 속 빈 △.
  logic.urgentMark = function (info) {
    if (!info || !(info.urgent > 0)) return '';
    return (info.urgentAllEst ? '△' : '▲') + info.urgent;
  };

  // ── 시군구 드릴인 '지시선 카드'(사용자 11-24 — 도형 기호 대신 글, design-reviewer 2026-11-24_1544) ──
  // 카드 치수(px): 폭 W, 지도 양옆 여백 열 폭 G(카드 120 + 바깥 8 + 지시선 20), 카드 사이 GAP, 줄 높이 ROW,
  // 위·아래 안쪽 여백 PADV, 지시선 꺾임 ELBOW(카드 가장자리에서), 열 위쪽(왼쪽은 breadcrumb 아래 48), 아래 여백 BOT,
  // 넘침 안내 3줄(12px, 줄 높이 15) 높이 NOTE_H.
  logic.SUBCARD = { W: 120, G: 148, EDGE: 8, GAP: 4, ROW: 15, PADV: 4, ELBOW: 12, TOP_L: 48, TOP_R: 12, BOT: 12, NOTE_H: 45 };

  // 카드를 다는 면: 공고 중·경과·6개월 안·6개월~1년 중 하나라도 있는 면(그 밖만 있으면 색과 툴팁만).
  logic.subCardEligible = function (info) {
    return !!info && (info.notice + info.overdue + info.within6 + info.to12) > 0;
  };
  // 카드 분류 줄(순서 고정, 0곳은 숨김). 그 밖 = 1~2년 + 2년 넘음 + 날짜 미상(muted). 6개월 안이 모두 추정이면 '6개월 안(추정)'.
  logic.subCardLines = function (info) {
    if (!info) return [];
    const rows = [
      { key: 'notice', label: '공고 중', n: info.notice || 0, strong: true },
      { key: 'overdue', label: '경과', n: info.overdue || 0 },
      { key: 'within6', label: info.urgentAllEst ? '6개월 안(추정)' : '6개월 안', n: info.within6 || 0 },
      { key: 'to12', label: '6개월~1년', n: info.to12 || 0 },
      { key: 'rest', label: '그 밖', n: (info.to24 || 0) + (info.over24 || 0) + (info.unknown || 0), muted: true },
    ];
    return rows.filter(function (r) { return r.n > 0; });
  };
  logic.subCardHeight = function (nLines) {
    const S = logic.SUBCARD;
    return S.PADV + S.ROW + S.ROW * nLines + S.PADV;     // 이름 한 줄 + 분류 줄 수
  };
  // 카드 배치(DOM 없음). items = [{code, ax, ay(지시선 앵커, 화면 좌표), lines(분류 줄 수), pri:[notice,overdue,within6,to12]}].
  // 1) ax < w/2 → 왼쪽 열, 아니면 오른쪽 열  2) 한쪽이 넘치고 반대쪽에 자리가 있으면 가운데선에 가까운 면부터 옮김
  // 3) 그래도 넘치면 우선순위(공고 중→경과→6개월 안→6개월~1년, 큰 쪽이 남음)가 낮은 카드부터 뺌 — 뺐으면 열 맨 아래에 안내 자리
  // 4) 열 안에서 ay 순으로 놓고 앞→뒤, 뒤→앞 두 번 밀어 겹침을 없앰.
  // 반환: { items:[{code,side,x,y,w,h,ax,ay,pts}], dropped:[code], notes:{left,right} } — notes.* = {x,y,count} | null.
  logic.layoutSubCards = function (items, w, h) {
    const S = logic.SUBCARD, mid = w / 2;
    const cols = {
      left:  { side: 'left',  x: S.EDGE,           top: S.TOP_L, bottom: h - S.BOT, list: [], dropped: [] },
      right: { side: 'right', x: w - S.EDGE - S.W, top: S.TOP_R, bottom: h - S.BOT, list: [], dropped: [] },
    };
    (items || []).forEach(function (it) {
      if (!it || typeof it.ax !== 'number' || typeof it.ay !== 'number' || !isFinite(it.ax) || !isFinite(it.ay) || !(it.lines >= 1)) return;
      const c = { code: it.code, ax: it.ax, ay: it.ay, pri: it.pri || [0, 0, 0, 0], h: logic.subCardHeight(it.lines), y: 0 };
      (c.ax < mid ? cols.left : cols.right).list.push(c);
    });
    function span(list) { let s = 0; list.forEach(function (c) { s += c.h; }); return s + S.GAP * Math.max(0, list.length - 1); }
    function cap(col) { return col.bottom - col.top; }
    function shift(from, to) {
      while (from.list.length && span(from.list) > cap(from)) {
        let pick = null;
        from.list.forEach(function (c) { if (!pick || Math.abs(c.ax - mid) < Math.abs(pick.ax - mid)) pick = c; });
        if (span(to.list.concat([pick])) > cap(to)) return;      // 반대쪽도 못 받으면 멈춘다(아래에서 우선순위로 뺌)
        from.list.splice(from.list.indexOf(pick), 1); to.list.push(pick);
      }
    }
    shift(cols.left, cols.right); shift(cols.right, cols.left);
    function worse(a, b) {                                       // a를 b보다 먼저 뺀다
      for (let i = 0; i < 4; i++) if (a.pri[i] !== b.pri[i]) return a.pri[i] < b.pri[i];
      if (a.ay !== b.ay) return a.ay > b.ay;
      return String(a.code) > String(b.code);
    }
    function limitOf(col) { return col.bottom - (col.dropped.length ? S.GAP + S.NOTE_H : 0); }
    function dropFit(col) {
      while (col.list.length && span(col.list) > limitOf(col) - col.top) {
        let low = null;
        col.list.forEach(function (c) { if (!low || worse(c, low)) low = c; });
        col.list.splice(col.list.indexOf(low), 1); col.dropped.push(low);
      }
    }
    function place(col) {
      const list = col.list.slice().sort(function (a, b) { return a.ay - b.ay || (String(a.code) < String(b.code) ? -1 : 1); });
      const limit = limitOf(col);
      list.forEach(function (c) { c.y = Math.max(col.top, Math.min(limit - c.h, c.ay - c.h / 2)); });
      for (let i = 1; i < list.length; i++) list[i].y = Math.max(list[i].y, list[i - 1].y + list[i - 1].h + S.GAP);
      for (let i = list.length - 1; i >= 0; i--) {
        const lim = (i === list.length - 1 ? limit : list[i + 1].y - S.GAP) - list[i].h;
        if (list[i].y > lim) list[i].y = lim;
      }
      list.forEach(function (c) { c.y = Math.round(c.y); });
      return list;
    }
    const out = { items: [], dropped: [], notes: { left: null, right: null } };
    ['left', 'right'].forEach(function (side) {
      const col = cols[side];
      dropFit(col);
      place(col).forEach(function (c) {
        const edge = side === 'left' ? col.x + S.W : col.x;
        const elbow = side === 'left' ? edge + S.ELBOW : edge - S.ELBOW;
        const cy = c.y + c.h / 2;
        out.items.push({ code: c.code, side: side, x: col.x, y: c.y, w: S.W, h: c.h, ax: c.ax, ay: c.ay,
          pts: [[c.ax, c.ay], [elbow, cy], [edge, cy]] });
      });
      col.dropped.forEach(function (c) { out.dropped.push(c.code); });
      if (col.dropped.length) out.notes[side] = { x: col.x, y: col.bottom - S.NOTE_H, count: col.dropped.length };
    });
    return out;
  };

  // 마커로 그릴 기관: 지자체(면)는 뺀다. 나머지는 종류(kindOf) 6종 중 켠 것만, 종류를 모르는 유형(가로 막대)은 항상 표시.
  logic.visibleMarkers = function (list, enabledKinds) {
    return list.filter(function (r) {
      const kind = logic.kindOf(r.type);
      if (kind === '지자체') return false;
      if (kind === null) return true;
      return enabledKinds.has(kind);
    });
  };

  logic.sortByUrgency = function (list, today) {
    return list.slice().sort(function (a, b) {
      return logic.daysUntil(logic.effectiveBid(a).date, today)
           - logic.daysUntil(logic.effectiveBid(b).date, today);
    });
  };

  logic.sortByInterest = function (list, today, isInterested) {
    const on = [], off = [];
    list.forEach(function (r) { (isInterested(r) ? on : off).push(r); });
    return logic.sortByUrgency(on, today).concat(logic.sortByUrgency(off, today));
  };

  logic.CSV_HEADERS = ['기관명','기관구분','지역코드','구시군코드','입찰주기','지난입찰일','입찰예상일','확정여부','약정만료일','경도','위도','출처','수정일'];
  logic._HEADER_KEY = { '기관명':'name','기관구분':'type','지역코드':'region','구시군코드':'subRegion',
    '입찰주기':'term','지난입찰일':'lastBid','입찰예상일':'contractEnd','확정여부':'confirmed','약정만료일':'contractExpiry',
    '경도':'lng','위도':'lat','출처':'sources','수정일':'updatedAt' };

  // RFC4180 유사: 따옴표/쉼표/개행 처리
  logic._splitCsvLine = function (line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur); return out;
  };

  logic.parseCsv = function (text) {
    const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    const headers = logic._splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      const cells = logic._splitCsvLine(line);
      const rec = {};
      headers.forEach(function (h, i) {
        const key = logic._HEADER_KEY[h]; if (!key) return;
        const v = (cells[i] || '').trim();
        if (key === 'term') rec.term = v ? Number(v) : undefined;
        else if (key === 'lng' || key === 'lat') rec[key] = v ? Number(v) : null;
        else if (key === 'confirmed') rec.confirmed = /^(y|yes|true|1)$/i.test(v);
        else if (key === 'sources') rec.sources = v ? v.split(';').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else rec[key] = v;
      });
      return rec;
    });
  };

  logic.buildCsvTemplate = function () {
    // 칸 수 = CSV_HEADERS(13). 순서: …확정여부, 약정만료일, 경도, 위도, 출처, 수정일
    const example = ['마포구청(예시)','지자체','11','11140','2','2022-12-05','','', '2026-12-31', '', '', '공고URL', '2026-07-25'];
    return '﻿' + logic.CSV_HEADERS.join(',') + '\n' + example.join(',') + '\n';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
