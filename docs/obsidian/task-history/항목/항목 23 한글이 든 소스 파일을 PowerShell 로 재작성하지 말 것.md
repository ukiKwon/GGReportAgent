---
tags: [item, open]
원본: NEXT.md
번호: 23
---

> 원본: `handoff/NEXT.md` (파생본)

### 23. ⚠️ 한글이 든 소스 파일을 PowerShell 로 재작성하지 말 것 (2026-08-28)

- **출처**: `[[2026-08-28|2026-08-28_summary.md]]` `## Session 15:30`. [[항목 22 Python assemble_deliverable 이 전산팀 초안을 빠뜨|항목 22]] 작업 중 실제로 겪음.
- **무엇인가**: `(Get-Content x -Raw).Replace(...) | Set-Content x -Encoding utf8` 로
  `server/assembler.py` 를 고쳤더니 **파일 전체의 한글이 깨졌다**(`痍⑦빀`, `?쒖븞??`).
  테스트가 엉뚱한 `OSError: [Errno 22] Invalid argument` 로 실패해, 잠깐 코드 결함으로
  오해할 뻔했다.
- **어떻게 해야 하나**: 파일 수정은 **Edit 도구**로 한다. 굳이 셸로 해야 하면 먼저
  백업하고(그날은 `$CLAUDE_JOB_DIR/tmp` 에 떠 둬서 바로 복구했다) 결과를 눈으로 확인한다.
- **왜 남기나**: 이 리포는 주석·문서·테스트 이름까지 전부 한글이라 **모든 소스 파일이
  이 위험에 걸린다.** 증상이 인코딩 오류가 아니라 무관해 보이는 런타임 오류로 나타난다.

