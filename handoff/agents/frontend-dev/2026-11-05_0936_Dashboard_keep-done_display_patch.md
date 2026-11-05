# Dashboard keep-done display patch — frontend-dev (sonnet)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 09:36 KST, agentId a517af5336b627670). 에이전트 출력이므로 사용자 결정이 아니다.

---

# 에이전트 대시보드: 완료(done) 인스턴스 30초 유지 패치안

모든 파일은 읽기만 했고 아무것도 고치지 않았습니다. 화면과 훅은 실제로 실행하지 않았습니다. 아래 diff는 코드를 읽고 쓴 것이라 `node --test agent-dashboard/test/*.test.js`로 돌려 확인해야 합니다. 이 분석 문서는 호출자가 `handoff/agents/frontend-dev/`에 저장해 주세요.

## 핵심 설계
- **done 저장 위치**: 끝난 인스턴스는 `instances`에 남기지 않고 별도 맵 `agents.<id>.done`에 `{task, since, doneAt}`로 옮깁니다.
  - 이렇게 하면 active 계산(`statefile.js` 21~22행)과 `app.js` 인스턴스 필터가 코드 변경 없이 그대로 안전합니다.
  - 기존 테스트 `server.test.js` 201행, 258행(stop 뒤 `instances` 0개, `active=false`)도 그대로 통과합니다.
- **② active·사용 중 판단 제외 근거**:
  - `closing.js` 67행(`busyReason`)은 `a.active`만 읽고 `instances`나 `done`은 읽지 않습니다. 70행의 `coach.at` 판정도 영향이 없습니다.
  - `a.active`는 `statefile.js` 22행에서 `instances`만으로 계산합니다. `done`은 이 계산에 들어가지 않으므로 done은 사용 중 판단에 포함되지 않습니다.
  - 15분 TTL(20행)은 `instances`만 대상이라 그대로 동작합니다.
- **③ 30초 만료는 렌더링 시점에 숨기는 쪽을 권장합니다. statefile 정리는 청소용으로만 겹쳐 넣습니다.**
  - `app.js`의 `applyFeed`는 `prevFeed`의 JSON 문자열이 같으면 건너뜁니다(1071행). 훅이 안 불리면 `state.json`이 안 바뀌어서, statefile 정리만으로는 30초 뒤에 지워지지 않습니다.
  - 그래서 만료를 판단하는 쪽은 화면입니다. 이미 1초마다 도는 `refreshChips`(1037행)가 `Date.now()`로 거릅니다.
  - statefile의 `normalize` 정리는 파일이 부풀지 않게 하는 용도입니다.

## 패치

### 1. `agent-dashboard/hook.js`
```
old: const isPending = k => k.startsWith('pending:');
new: const isPending = k => k.startsWith('pending:');
const finish = (s, id, ins, k) => { // 끝난 인스턴스는 지우지 않고 done으로 옮긴다(active 계산은 instances만 본다)
  const v = ins[k] || {}; delete ins[k];
  const a = s.agents[id]; (a.done || (a.done = {}))[k] = { task: v.task || '', since: v.since || 0, doneAt: Date.now() };
};
```

```
old:
        if (p.agent_id && ins[p.agent_id]) delete ins[p.agent_id];
        else { const k = oldest(ins, () => true); if (k) delete ins[k]; }
new:
        if (p.agent_id && ins[p.agent_id]) finish(s, id, ins, p.agent_id);
        else { const k = oldest(ins, () => true); if (k) finish(s, id, ins, k); }
```

### 2. `agent-dashboard/statefile.js`
```
old: const TTL = 15 * 60 * 1000; // stop 이벤트가 유실된 인스턴스는 15분 뒤 정리
new: const TTL = 15 * 60 * 1000; // stop 이벤트가 유실된 인스턴스는 15분 뒤 정리
const DONE_TTL = 30 * 1000;      // 끝난 인스턴스(done)는 30초만 남긴다(화면 숨김은 app.js DONE_MS와 같은 값)
```
```
old:
    if (!a || typeof a !== 'object' || !a.instances) continue;
new:
    if (!a || typeof a !== 'object') continue;
    if (a.done && typeof a.done === 'object') { // 정리용. 화면 숨김은 app.js가 따로 한다
      for (const k of Object.keys(a.done)) if (!(now - (a.done[k] && a.done[k].doneAt || 0) <= DONE_TTL)) delete a.done[k];
      if (!Object.keys(a.done).length) delete a.done;
    } else if (a.done) delete a.done;
    if (!a.instances) continue;
```

### 3. `agent-dashboard/app.js`
```
old: const FEED_TTL = 15 * 60 * 1000; // stop 이벤트가 유실돼도 15분 뒤엔 쉬게 한다
new: const FEED_TTL = 15 * 60 * 1000; // stop 이벤트가 유실돼도 15분 뒤엔 쉬게 한다
const DONE_MS = 30 * 1000;           // 끝난 직후 '방금 끝남'으로 보이는 시간(statefile.js DONE_TTL과 같게)
const doneFeed = {};                 // 역할 → [{task, doneAt}] (prevFeed 캐시와 무관하게 매번 갱신)
const recentDone = role => { const n = Date.now(); return (doneFeed[role] || []).filter(d => d && n - (d.doneAt || 0) < DONE_MS); };
```
```
old:
    const f = ag[a.id]; if (!f) return;
    const key = JSON.stringify(f);
new:
    const f = ag[a.id]; if (!f) return;
    doneFeed[a.id] = f.done && typeof f.done === 'object' ? Object.values(f.done) : [];
    const key = JSON.stringify(f);
```
```
old:
  nowBar.innerHTML = parts.length ? '지금 작업 중 ' + parts.length + '명: ' + parts.join('  ·  ') : '지금 작업 중인 에이전트: 없음';
new:
  const dn = AGENTS.flatMap(a => recentDone(a.id).map(d => '<b>' + a.name + '</b>' + (d.task ? ' <span>(' + String(d.task).replace(/[<>&]/g, '') + ')</span>' : '')));
  nowBar.innerHTML = (parts.length ? '지금 작업 중 ' + parts.length + '명: ' + parts.join('  ·  ') : '지금 작업 중인 에이전트: 없음')
    + (dn.length ? '  |  <span class="fin">방금 끝남 ' + dn.length + '건:</span> ' + dn.join('  ·  ') : '');
```
```
old:
    d.classList.toggle('on', r.active);
    d.querySelector('.st').textContent = (r.active ? '작업 중' : '대기') + ' · ' + lapInt(r) + '바퀴';
new:
    const fin = !r.active && !r.extra && recentDone(r.role).length > 0;
    d.classList.toggle('on', r.active);
    d.classList.toggle('fin', fin);
    d.querySelector('.st').textContent = (r.active ? '작업 중' : fin ? '방금 끝남' : '대기') + ' · ' + lapInt(r) + '바퀴';
```
```
old:
    default: return r.active ? '출발 준비' : (li >= 15 ? '쓰러져 휴식' : '벤치 대기');
new:
    default: return r.active ? '출발 준비' : (recentDone(r.role).length ? '방금 끝남' : (li >= 15 ? '쓰러져 휴식' : '벤치 대기'));
```
`stateLabel`은 `run`일 때는 기존 라벨을 그대로 씁니다. 방금 끝나서 아직 트랙에 있으면 '달리는 중'으로 보이다가 벤치로 가면 '방금 끝남'이 됩니다.

### 4. `agent-dashboard/style.css` (`.chip.on .st` 규칙 30행 뒤)
```
.chip.fin { border-color:#ffeaa7; }
.chip.fin .st { color:#ffeaa7; }
#now .fin { color:#ffeaa7; }
```
기존 팔레트(`#ffeaa7`는 `app.js`가 이미 쓰는 색)를 재사용했습니다. `:root` 변수는 건드리지 않았습니다. `index.html`은 바꿀 필요가 없습니다.

## 테스트
- **깨질 기존 테스트**: 없습니다. `instances`는 여전히 비고 `active`는 false가 됩니다. `closing.test.js`는 `active`를 직접 써서 쓰는 방식이라 무관합니다. `server.test.js` 15~16행의 초기 상태에는 `done`이 없어도 됩니다.
- **추가할 테스트** (`server.test.js`, 기존 `hook`, `hookAsync`, `writeState`, `readState` 사용):
  1. start 후 stop을 하면 `instances`가 0개, `active=false`이고 `done['x']`에 `{task, doneAt}`이 있어야 합니다.
  2. `doneAt`을 31초 전으로 파일에 직접 쓴 뒤 `hook('idle','{}')`로 `update`를 일으키면 `done`이 사라져야 합니다.
  3. 같은 역할 인스턴스 2개 중 1개만 stop하면 `active=true`로 유지되고 `done`에 1건이 남아야 합니다.
  4. `agent_id` 없는 stop은 가장 오래된 인스턴스를 done으로 옮기고, 인스턴스가 없으면 아무 일도 하지 않아야 합니다.
  5. `closing.js`를 `--dry --now`로 돌려 `done`만 남은 상태에서 '작업 중인 에이전트'로 판정하지 않는지 확인합니다. 기존 `closing.test.js`의 `writeState` 방식은 `active`를 직접 써서 `done`을 검증하지 못하므로, `done`이 들어간 상태 파일을 새로 써야 합니다.
  6. (선택) `app.js`는 브라우저 전용이라 소스 텍스트 검사만 가능합니다. `DONE_MS`와 `DONE_TTL`의 값이 같은지 정규식으로 맞춰 보는 테스트를 추가하면 한쪽만 바뀌는 사고를 막을 수 있습니다.
- **실행**: `node --test agent-dashboard/test/*.test.js`

## 위험과 확인할 것
- 훅 프로세스와 브라우저는 같은 PC라 `Date.now()`가 같습니다. 시계가 어긋난 환경이면 표시 시간이 달라질 수 있습니다.
- 로컬에서 서버가 이미 떠 있으면 `app.js`가 바뀌어 `/api/version`이 탭을 자동 새로고침합니다. 정상입니다.
- 청소부는 `closing.js`의 `setCleaner`가 `instances.closing`을 직접 지우기 때문에 done 표시 대상이 아닙니다. 청소부도 '방금 끝남'을 보이려면 `setCleaner(false)` 쪽을 따로 고쳐야 하니 별도 결정이 필요합니다. `closing.js`는 이번 패치에서 건드리지 않았습니다.
- 롤백은 `hook.js`의 `finish` 호출을 원래 `delete`로 되돌리면 충분합니다. `done` 키는 30초 뒤 저절로 정리되고 다른 코드는 읽지 않습니다.

## 이관 메모
- 이관할 것은 없습니다. `NEXT.md` 항목 번호는 호출자가 지정하지 않았으므로 참고하지 않았습니다.

## 열린 질문
- 청소부(cleaner)도 끝난 뒤 30초 '방금 끝남'을 보일지 정하면 됩니다. 보인다면 `closing.js`와 `app.js`의 `jan` 처리까지 범위가 넓어집니다.

관련 파일:
- C:\github\GGReportAgent\agent-dashboard\hook.js
- C:\github\GGReportAgent\agent-dashboard\statefile.js
- C:\github\GGReportAgent\agent-dashboard\app.js
- C:\github\GGReportAgent\agent-dashboard\style.css
- C:\github\GGReportAgent\agent-dashboard\test\server.test.js
