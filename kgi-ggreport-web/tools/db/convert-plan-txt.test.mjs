// 변환기 순수 함수 단위 시험 — node --test kgi-ggreport-web/tools/db/convert-plan-txt.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADERS, csvCell, defuse, dobongBudget, dobongTokBudget, gwangjinBudget, gwangjinChildBudget, nowonBudget, parseChapter, parseChecks, parseYears, stripMarker, buildRows,
  buildDistrict, parseDongjakFile, jungBudget, labeledBudget, multiYearPeriod } from './convert-plan-txt.mjs';

// ── 11-16 공식 계획서 3구(동대문·동작·중구)와 노원 전체 기간 소요예산 ──
test('노원: 콜론 붙은 여러 해 기간 + 소요예산은 총사업비 규칙, 연·한 해·콜론 없는 표기는 금액', () => {
  const a = nowonBudget('12. 탄소중립체험관 조성\n- 내용: 공간개선 / 기간: 2025.3~2026.5 / 소요예산: 1,641백만원');
  assert.equal(a.state, 'UNVERIFIED');
  assert.equal(a.amount, '');
  assert.equal(a.note, '예산 구분: 총사업비(전체 기간 사업비) / 예산 원문: 소요예산 1,641백만원');
  const b = nowonBudget('6. 도로\n- 사업기간: 2021.10~2027.12 / 소요예산: 53,436백만원(보상비44,222, 공사비및이전비등9,214)');
  assert.equal(b.state, 'UNVERIFIED');
  assert.equal(nowonBudget('- 지정기관: 재단 / 지정기간: 2024.4.1~2027.12.31\n- 소요예산: 연 224백만원').amount, '224');
  assert.equal(nowonBudget('기간: 2025.1~2026.12 / 소요예산: 연 100백만원').amount, '100');
  assert.equal(nowonBudget('사업기간: 2026.4~11 / 소요예산: 11백만원').amount, '11');
  assert.equal(nowonBudget('기간: 2026.1~2026.12 / 소요예산: 5백만원').amount, '5');
  assert.equal(nowonBudget('기간 2023.6~2027.1 / 소요예산 4,000백만원').amount, '4,000');   // 콜론 없는 표기는 이번 범위 밖
  assert.equal(multiYearPeriod('지정기간: 2024.4~2027.12'), false);
});

test('예산 줄 함수: labeledBudget·jungBudget', () => {
  assert.equal(labeledBudget('120백만원').amount, '120');
  assert.equal(labeledBudget('연 224백만원').note, '예산 원문: 연 224백만원');
  assert.equal(labeledBudget('5억원 내외').state, 'UNVERIFIED');
  assert.equal(labeledBudget('-').state, 'NOT_IN_SOURCE');
  assert.equal(jungBudget('계 960 (2022:160, 2023:800)', '백만원').note, '');
  assert.equal(jungBudget('계 960 (2022:160, 2023:800)', '백만원').amount, '960');
  assert.equal(jungBudget('계 약 540 (2022:80)', '백만원').state, 'UNVERIFIED');
  assert.equal(jungBudget('표 미확인(기부채납 방식)', '백만원').state, 'UNVERIFIED');
  assert.equal(jungBudget('해당없음(서울시 소관)', '백만원').state, 'NOT_IN_SOURCE');
});

test('동작: 한 파일의 분야별로 번호가 새로 시작한다', () => {
  const txt = [
    '분야별 주요사업 - 복지 / 도시',
    '=================================================',
    '[힘이되는 복지] 모든 구민의 삶의 품격을 높이겠습니다 (20~21쪽)',
    '=================================================',
    '2026년 중점사업(2개):',
    '1. 보훈대상자 예우 강화 - 보훈예우수당 증액 / 위문금 신설',
    '2. 통합보훈회관 조성 - 위치: 상도동',
    '=================================================',
    '[고품격 도시] 도시 인프라를 완성하겠습니다 (22~23쪽)',
    '=================================================',
    '2026년 중점사업(1개, 대형 개발사업 프로젝트군):',
    '1. 동작구형 개발 선도사업 (2개소 추진)',
    '   - 남성역 북측',
    '[요약]',
  ].join('\n');
  const chs = parseDongjakFile(txt, 7);
  assert.equal(chs.length, 2);
  assert.equal(chs[0].fieldNo, '7');
  assert.equal(chs[0].declared, 2);
  assert.equal(chs[1].fieldName, '고품격 도시');
  const rows = buildRows(chs[0], 'dongjak', 't', []);
  assert.equal(rows[0].name, '보훈대상자 예우 강화');
  assert.equal(rows[0].content, '보훈예우수당 증액\n위문금 신설');
  assert.equal(rows[1].budget.state, 'NOT_IN_SOURCE');
});

test('실제 원문: 동대문·동작·중구 행 수가 인덱스와 일치하고 오류가 없다', () => {
  const spec = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'corpus', 'institutions');
  for (const [id, n, docs] of [['dongdaemun', 122, 5], ['dongjak', 95, 13], ['jung', 125, 5]]) {
    const r = buildDistrict(spec, id);
    assert.deepEqual(r.errors, [], id);
    assert.equal(r.rows.length, n, id);
    assert.equal(r.docCount, docs, id);
    assert.equal(r.idxTotal, n, id);
    assert.equal(r.mismatch, false, id);
  }
});

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
