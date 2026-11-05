#!/usr/bin/env node
// SessionStart 훅: handoff/START.md(다음 세션 시작점, 짧음)를 항상 컨텍스트 맨 앞에 넣는다.
// 이유(2026-11-05): NEXT.md 가 커져(100KB+) SessionStart 주입이 파일로 잘려 앞 2KB만 보인다.
// 대화 끝에 남긴 '다음 단계·질문'이 다음 세션에 휘발되지 않게, 짧은 이 파일을 따로 주입한다.
const fs = require('fs'), path = require('path');
try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const text = fs.readFileSync(path.join(root, 'handoff', 'START.md'), 'utf8').trim();
  if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: '다음 세션 시작점 (handoff/START.md — NEXT.md 보다 먼저 읽는다):\n\n' + text } }));
} catch (_) {}
