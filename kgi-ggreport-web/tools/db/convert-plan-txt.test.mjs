// 변환기 순수 함수 단위 시험 — node --test kgi-ggreport-web/tools/db/convert-plan-txt.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, csvCell, defuse, dobongBudget, dobongTokBudget, gwangjinBudget, gwangjinChildBudget, nowonBudget, parseChapter, parseChecks, parseYears, stripMarker, buildRows } from './convert-plan-txt.mjs';

test('머리행은 서버 계약 25열', () => {
  assert.equal(HEADERS.length, 25);
  assert.equal(HEADERS[0], '기관ID');
  assert.equal(HEADERS[24], '비고');
});

test('연차: 하이픈 해는 빼고, 화살표·범위는 버린다', () => {
  assert.deepEqual(parseYears('2022:39, 2023:229, 2024:150, 장기:-'), { years: '2022:39;2023:229;2024:150', ok: true });
  assert.equal(parseYears('2022:3,636→2026:5,645, 장기:6,153').years, '');
  assert.equal(parseYears('2022:263~2026:265').ok, false);
});

test('도봉 예산: 계 718 + 연차, 단위는 장 머리에서', () => {
  const b = dobongBudget('계 718 (2022:39, 2023:229, 2024:150, 2025:150, 2026:150, 장기:-)', '백만원');
  assert.equal(b.state, 'AMOUNT');
  assert.equal(b.amount, '718');
  assert.equal(b.unit, '백만원');
  assert.equal(b.note, '');
  assert.equal(dobongTokBudget('-', '백만원').state, 'NOT_IN_SOURCE');
  assert.equal(dobongTokBudget('268+32', '백만원').state, 'UNVERIFIED');
  assert.equal(dobongTokBudget('51,893', '').state, 'UNVERIFIED');   // 단위 없으면 추측하지 않는다
});

test('노원 예산: 소요예산 우선, 합계는 원문 합계만, 범위·복수는 확인안됨', () => {
  assert.equal(nowonBudget('x - 소요예산 13백만원 / 기간').amount, '13');
  assert.equal(nowonBudget('소요예산 78+140+77=295백만원').amount, '295');
  assert.equal(nowonBudget('소요예산 459백만원+30백만원').state, 'UNVERIFIED');
  assert.equal(nowonBudget('소요비용: 단지별 1억원~4억원').state, 'UNVERIFIED');
  assert.equal(nowonBudget('총사업비: 12,026백만원').state, 'UNVERIFIED');   // 총사업비는 금액으로 적지 않는다(아래 별도 시험)
  assert.equal(nowonBudget('위치 ... (예산 미기재)').state, 'NOT_IN_SOURCE');
  assert.equal(nowonBudget('아무 금액도 없음').state, 'NOT_IN_SOURCE');
});

test('광진 예산: 미표기는 원문에 없음, 발행 규모는 확인안됨', () => {
  assert.equal(gwangjinBudget('미표기').state, 'NOT_IN_SOURCE');
  assert.equal(gwangjinBudget(null).state, 'NOT_IN_SOURCE');
  assert.equal(gwangjinBudget('발행규모 연 100억원').state, 'UNVERIFIED');
});

test('목록 기호 제거와 수식 문자 전각 처리', () => {
  assert.equal(stripMarker('- 위치: 어디'), '위치: 어디');
  assert.equal(stripMarker('· 내용'), '내용');
  assert.equal(stripMarker('-5도 이하'), '-5도 이하');   // 기호 뒤에 공백이 없으면 본문
  const log = [];
  assert.equal(defuse('=SUM(1)', log, 'w', '내용'), '＝SUM(1)');
  assert.equal(log.length, 1);
});

test('CSV 칸 따옴표', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('줄\n바꿈'), '"줄\n바꿈"');
  assert.equal(csvCell('plain'), 'plain');
});

test('도봉 한 줄형: 두 줄에 걸친 제목·단일 공백·보조 문구', () => {
  const txt = [
    '2장. 안전행복도시 (3개 사업, 총 투자계획 1백만원)',
    '목차: 2-1~2-3, p.115~231',
    '[세부사업 목록 및 예산(백만원, 계 2022~2026)]',
    '',
    '2-1  동북권 시민안전체험관 조성           51,893',
    '2-2 저출생 대응사업 추진 (저출생 극복을 위한 사업) 59,838',
    '2-3  기초 사업 (예시)',
    '     (이어진 줄)       5,000 (+ 별도 4,060)',
    '[2장 총계]',
  ].join('\n');
  const ch = parseChapter(txt, 2, 'dobong');
  assert.equal(ch.pageRange, '115~231');
  assert.equal(ch.unit, '백만원');
  const errs = [];
  const rows = buildRows(ch, 'dobong', 't', errs);
  assert.deepEqual(errs, []);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].budget.amount, '51,893');
  assert.equal(rows[1].name, '저출생 대응사업 추진 (저출생 극복을 위한 사업)');
  assert.equal(rows[2].budget.amount, '5,000');
});

test('노원 총사업비는 금액이 아니라 확인안됨 + 비고(예산 구분·원문)', () => {
  const b = nowonBudget('사업 - 총사업비: 12,026백만원 / 기간');
  assert.equal(b.state, 'UNVERIFIED');
  assert.equal(b.amount, '');
  assert.equal(b.unit, '');
  assert.equal(b.note, '예산 구분: 총사업비(전체 기간 사업비) / 예산 원문: 총사업비 12,026백만원');
  assert.equal(nowonBudget('소요예산 13백만원 총사업비 500백만원').amount, '13');   // 소요예산이 있으면 그대로 금액
});

test('광진 하위 사업: 융자규모가 있으면 확인안됨 + 원문 비고, 없으면 원문에 없음', () => {
  const b = gwangjinChildBudget(['중소기업육성기금 융자지원', '융자규모: 40억원(업체당 3천만원~2억원)', '융자조건: 연 1.5% 고정금리']);
  assert.equal(b.state, 'UNVERIFIED');
  assert.equal(b.note, '예산 원문: 융자규모: 40억원(업체당 3천만원~2억원)');
  assert.equal(gwangjinChildBudget(['소규모 사업', '내용: 지원']).state, 'NOT_IN_SOURCE');
  const txt = [
    '5. 융자지원',
    '   5-1. 기금 융자지원',
    '        - 융자규모: 40억원',
    '   - 예산: 기금 40억원',
  ].join('\n');
  const rows = buildRows(parseChapter('4장 경제\n[세부사업 목록]\n' + txt, 4, 'gwangjin'), 'gwangjin', 't', []);
  assert.equal(rows[1].no, '5-1');
  assert.equal(rows[1].budget.state, 'UNVERIFIED');
  assert.equal(rows[0].budget.state, 'UNVERIFIED');   // 상위 행과 같은 상태
});

test('도봉 한 줄형: 줄바꿈으로 사업명에 붙은 세부 내역 괄호는 내용으로(5-2), 부제 괄호는 사업명에 둔다', () => {
  const txt = [
    '5장. 청렴행정도시 (2개 사업, 총 투자계획 1백만원)',
    '목차: 5-1~5-2, p.1~2',
    '[세부사업 목록 및 예산(백만원, 계 2022~2026)]',
    '',
    '5-1  청렴구정을 위한 구민감사관 등 구민참여 제도 운영',
    '     (구민감사관 37.3 + 고용감찰관 68.6 + 옴부즈만 175)  280.9',
    '5-2  도봉형 스마트데이터 허브센터 구축 (스마트 허브)   5,000',
    '     (+ 스마트 IoT 사업 확산 4,060 별도)',
    '[5장 총계]',
  ].join('\n');
  const errs = [];
  const rows = buildRows(parseChapter(txt, 5, 'dobong'), 'dobong', 't', errs);
  assert.deepEqual(errs, []);
  assert.equal(rows[0].name, '청렴구정을 위한 구민감사관 등 구민참여 제도 운영');
  assert.equal(rows[0].content, '(구민감사관 37.3 + 고용감찰관 68.6 + 옴부즈만 175)');
  assert.equal(rows[0].budget.amount, '280.9');
  assert.equal(rows[1].name, '도봉형 스마트데이터 허브센터 구축 (스마트 허브)');
  assert.equal(rows[1].content, '(+ 스마트 IoT 사업 확산 4,060 별도)');
});

test('확인 결과: 완전 일치 3종만, 단서 붙은 판정은 따로 센다', () => {
  const t = parseChecks('통합돌봄 지원                         확인됨    전용페이지\n광장동 정원                확인됨(유사)  설명\n', 'columns');
  assert.equal(t.map.get('통합돌봄지원'), '확인됨');
  assert.equal(t.qualified.length, 1);
  const n = parseChecks('1. 서울 디지털바이오시티(S-DBC) 조성\n   확인됨 - 근거\n', 'numbered');
  assert.equal(n.map.get('서울디지털바이오시티S-DBC조성'), '확인됨');
});
