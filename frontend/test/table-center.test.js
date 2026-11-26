'use strict';
// 데이터 표 머리·칸 가로·세로 가운데 정렬 (사용자 11-26, design-reviewer 11-26 표 정렬 전수 조사 0d 공통부)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

function rule(sel) {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, sel + ' 규칙이 있어야 한다');
  return css.slice(i, css.indexOf('}', i));
}

test('.ad-table 머리·칸: 가로 가운데 + 세로 가운데', function () {
  const r = rule('.ad-table th, .ad-table td');
  assert.ok(/text-align:\s*center/.test(r));
  assert.ok(/vertical-align:\s*middle/.test(r));
  assert.ok(!/text-align:\s*left/.test(r));
});

test('.ap-changes 첫 열 왼쪽 규칙이 없다', function () {
  assert.ok(!/\.ap-changes th:first-child/.test(css));
});

test('동작 칸·격자 행 머리는 가운데', function () {
  assert.ok(/\.ad-ops \{[^}]*text-align:\s*center/.test(css));
  assert.ok(/\.ad-grid tbody th \{[^}]*text-align:\s*center/.test(css));
});

test('여러 줄 사유 칸(tm-t-reason)만 왼쪽·위 예외', function () {
  const r = rule('.ad-table td.tm-t-reason');
  assert.ok(/text-align:\s*left/.test(r));
  assert.ok(/vertical-align:\s*top/.test(r));
});

test('결재 카드 목표 변경 메모(.ad-table.ap-tc .tc-memo)는 왼쪽·위', function () {
  const r = rule('.ad-table.ap-tc .tc-memo');
  assert.ok(/text-align:\s*left/.test(r));
  assert.ok(/vertical-align:\s*top/.test(r));
});

// ── 사용자 11-26: 머리값은 무조건 가운데, 금액 칸은 오른쪽, 그 밖은 가운데·세로 가운데 ──
const CENTER_RULES = [
  '.pt-tt thead th', '.pt-tt td, .pt-tt tbody th', '.pt-tt tr.emp td',
  '.mn-spk-tbl th, .mn-spk-tbl td', '.rs-tt th, .rs-tt td', '.wf-cov th, .wf-cov td',
  '.dc-hits th', '.dc-hits td', '.dc-hits .c-cnt',
  '.pl-tbl th', '.pl-tbl td', '.pl-tbl th.pl-bud', '.pl-dlg-tbl th', '.pl-dlg-tbl td',
  '.ib-table td.ib-num', '.ib-table th.ib-num',
  '.pb-t tbody th', '.pb-t thead th.pb-corner', '.ts-doc th', '.ts-score .ts-doc thead th',
  '.isf-tbl th', '.isf-years thead th', '.isf-years th:first-child, .isf-years td:first-child', '.isf-hist th, .isf-hist td',
  '.more-table th', '.more-table td'
];

test('대상 표 머리·칸은 가운데(text-align:center)', function () {
  CENTER_RULES.forEach(function (sel) {
    assert.ok(/text-align:\s*center/.test(rule(sel)), sel + ' 은 center 여야 한다');
  });
});

test('표 머리·칸 세로 가운데(rs-tt 머리는 아래 맞춤 아님)', function () {
  ['.pt-tt thead th', '.pt-tt td, .pt-tt tbody th', '.rs-tt thead th', '.rs-tt th, .rs-tt td', '.wf-cov th, .wf-cov td',
    '.dc-hits th', '.dc-hits td', '.pl-tbl th', '.pl-tbl td', '.pl-dlg-tbl th', '.pl-dlg-tbl td', '.ts-doc th',
    '.isf-tbl th', '.isf-hist th, .isf-hist td', '.more-table th', '.more-table td', '.cr-table td', '.ib-table td'
  ].forEach(function (sel) {
    assert.ok(/vertical-align:\s*middle/.test(rule(sel)), sel + ' 은 세로 가운데여야 한다');
  });
  assert.ok(!/vertical-align:\s*bottom/.test(rule('.rs-tt thead th')));
});

test('금액 칸은 오른쪽: 사업 예산(.pl-bud 칸)·요약 연평잔(.ts-doc .m)·연도 표 칸', function () {
  assert.ok(/text-align:\s*right/.test(rule('.pl-tbl th.pl-bud, .pl-tbl td.pl-bud')));
  assert.ok(/text-align:\s*center/.test(rule('.pl-tbl th.pl-bud')), '예산 머리는 가운데');
  assert.ok(css.indexOf('.pl-tbl th.pl-bud {') > css.indexOf('.pl-tbl th.pl-bud, .pl-tbl td.pl-bud {'), '머리 center 규칙이 칸 right 규칙보다 뒤여야 이긴다');
  assert.ok(/text-align:\s*right/.test(rule('.ts-doc .m')));
  assert.ok(/text-align:\s*right/.test(rule('.isf-years th, .isf-years td')));
});

test('예외: 사업명·분야 줄·문맥 줄·요청 문장·요약 값·입력 칸은 왼쪽', function () {
  assert.ok(/text-align:\s*left/.test(rule('.pl-tbl td.pl-nm')) && /vertical-align:\s*top/.test(rule('.pl-tbl td.pl-nm')));
  assert.ok(/text-align:\s*left/.test(rule('.pl-tbl .pl-fld th')));
  assert.ok(/text-align:\s*left/.test(rule('.dc-ctx td, .dc-hits .dc-ctx td')));
  assert.ok(/text-align:\s*left/.test(rule('.cr-table tr.cr-ask td')));
  assert.ok(/text-align:\s*left/.test(rule('.isf-tbl td')));
  assert.ok(/text-align:\s*left/.test(rule('.ts-doc th, .ts-doc td')), '요약 값 칸은 left(머리 th만 center)');
});

test('칸 안 flex·버튼은 가운데를 따른다', function () {
  assert.ok(/justify-content:\s*center/.test(rule('.pt-tt .pt-cell')));
  assert.ok(/text-align:\s*inherit/.test(rule('.mn-open')));
  assert.ok(/text-align:\s*inherit/.test(rule('.pb-nm')));
});
