'use strict';
// alert()/confirm() 교체(11-23): 다섯 화면 파일에 브라우저 기본 팝업이 없고, 확인은 dlg.confirm·안내는 dlg.line 줄을 쓴다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = function (p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); };
const HTML = rd('index.html');
const strip = function (s) { return s.replace(/\/\/.*$/gm, ''); };   // 줄 주석 제외
const BAN = /(?<![\w$.])(alert|confirm)\(|window\.(alert|confirm)\(/;   // dlg.confirm( 같은 메서드 호출은 허용

['app', 'approvals', 'chat', 'designer', 'workflow'].forEach(function (f) {
  test(f + '.js: 브라우저 기본 alert()/confirm() 없음(공통 팝업 규칙, 11-23)', function () {
    assert.doesNotMatch(strip(rd('js/' + f + '.js')), BAN);
  });
});

test('확인 3곳은 dlg.confirm, 오류·성공은 dlg.line 줄', function () {
  assert.match(rd('js/approvals.js'), /root\.dlg\.confirm\(\{[\s\S]*?go: '그대로 반려', cancel: '사유 적기', danger: true/);
  assert.match(rd('js/designer.js'), /root\.dlg\.confirm\(\{\s*title: '첨부 삭제'[\s\S]*?go: '삭제'/);
  assert.match(rd('js/workflow.js'), /root\.dlg\.confirm\(\{\s*title: tier \+ '차 결재 제출'[\s\S]*?go: '제출'/);
  ['app', 'approvals', 'chat', 'workflow', 'designer'].forEach(function (f) {
    assert.match(rd('js/' + f + '.js'), /dlg\.line\(/, f);
  });
});

test('상태 줄 마크업: 5개 id, CSS는 새 변수 없이 .st-line 계열', function () {
  ['data-msg', 'dg-msg', 'ap-msg', 'wf-msg', 'ch-msg'].forEach(function (id) {
    assert.match(HTML, new RegExp('<p id="' + id + '" class="st-line[^"]*" role="status"></p>'), id);
  });
  assert.match(HTML, /\.st-line\.st-err \{ color:var\(--red\); \}/);
  assert.match(HTML, /#dlg-confirm-m \{[^}]*white-space:pre-line/);
});

// approvals.js의 다른 요청 함수(결재 요청 목록 등)는 이번 범위 밖이라 뺀다 — 결재 처리 경로는 위 dlg.line 단언이 지킨다.
test('화면 문구에 상태 코드를 싣지 않는다', function () {
  ['app', 'chat', 'workflow'].forEach(function (f) {
    assert.doesNotMatch(strip(rd('js/' + f + '.js')), /'[^']*\(' \+ (r|res)\.status \+ '\)'/, f);
  });
});
