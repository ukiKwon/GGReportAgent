# 계획 A1 — 오케스트레이터 그래프 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LangGraph supervisor 그래프로 오케스트레이터(상위 agent)를 구축한다 — RFI 분석 → 3팀 초안 병렬 → 결재 3지점(🛑 기획·이관·최종) interrupt → 패키징 → 검증(PII 포함)을 자율 진행하고, 모든 왕복을 tasks/messages/notifications에 기록하며, `run/checkpoint/status` API로 웹에서 구동한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md` §④⑤⑥. agent 층(`agent/orchestrator/`)은 backend를 모른다 — 기록은 **Recorder 포트**(Protocol)로 추상화하고 backend가 DB 구현체를 주입한다(기존 agent/backend 분리 관행 유지, `backend/agent_adapter.py` 선례). 기존 노드(`rfp_extract`·`rfp_analysis`·`institution_match`·`role_router`·`content_writer`·`pptx_builder`·`verification`)는 subagent의 실행 도구로 전부 재사용.

**계획 A의 분할:** 본 계획(A1)은 그래프 코어 + 결재 API까지. **A2**(후속 계획: 대화창 consult·notifications 라우터·업로드 즉시검사·완료 아카이브)는 A1 완료 후 별도 작성 — A1 단독으로도 "run → 자율 진행 → 결재 3회 → 완료"가 동작하는 소프트웨어다.

**Tech Stack:** Python 3.14, LangGraph(`StateGraph`·`Send`·`interrupt`·`Command`) + `langgraph-checkpoint-sqlite`(`SqliteSaver`), FastAPI, pytest(`unittest.mock`).

## Global Constraints

- **LLM 접근은 `agent/llm.py`의 `get_llm`/`structured_llm`만** (스펙 §④, 상위 스펙 §⑥). 테스트는 전부 LLM 목.
- **agent는 backend를 import하지 않는다** — 기록은 Recorder 포트로만.
- **subagent끼리 직접 통신 금지** — 전체 그림(배점표·stage)은 orchestrator만 안다(스펙 §④).
- 결재(🛑)는 **5(기획)·7(이관)·8(최종) 세 지점뿐**, 되물음은 비차단 권유(스펙 §⑤).
- 신규 의존성은 `langgraph`·`langgraph-checkpoint-sqlite` 2개뿐(스펙 §④).
- `data/graph_checkpoints.db`는 gitignored(기존 `data/*.db` 패턴 확인 후 필요 시 .gitignore 추가).
- 주석·프롬프트·커밋 메시지는 한국어, 파일은 UTF-8.
- 전체 테스트 `py -3 -m pytest agent backend collector -q` 기준선(284 passed) 유지 + 신규 전부 통과. dashboard `node --test dashboard/test/*.test.js` 36/36 유지(이 계획은 JS를 건드리지 않는다).

---

### Task 1: 의존성 + `notifications` 테이블·리포지토리

**Files:**
- Modify: `requirements.txt`
- Modify: `backend/db.py` (SCHEMA에 테이블 1개 추가)
- Create: `backend/notification_repository.py`
- Modify: `backend/models.py` (모델 1개 추가)
- Test: `backend/tests/test_notification_repository.py`

**Interfaces:**
- Consumes: `backend/db.py`의 `init_db(db_path)`(기존).
- Produces: `create_notification(conn, recipient, kind, content, institution_id=None, task_id=None, link=None, commit=True) -> Notification`, `list_notifications(conn, recipient, unread_only=False) -> list[Notification]`, `mark_read(conn, notification_id) -> bool`. `Notification` pydantic 모델(id·recipient·kind·content·institution_id·task_id·link·created_at·read_at). Task 2의 DbRecorder와 A2의 라우터가 쓴다.

- [ ] **Step 1: requirements.txt에 두 줄 추가 후 설치**

```
langgraph
langgraph-checkpoint-sqlite
```

Run: `py -3 -m pip install -r requirements.txt -q`  → 오류 없이 종료 확인.

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_notification_repository.py`:

```python
from backend.db import init_db
from backend.notification_repository import create_notification, list_notifications, mark_read


def _conn(tmp_path):
    return init_db(str(tmp_path / "registry.db"))


def test_create_and_list_by_recipient(tmp_path):
    conn = _conn(tmp_path)
    create_notification(conn, "전산담당", "쪽지", "노원구청 IT 분석 확인 요망", institution_id="nowon")
    create_notification(conn, "예산담당", "쪽지", "예산 분석 확인 요망", institution_id="nowon")

    mine = list_notifications(conn, "전산담당")
    assert len(mine) == 1
    assert mine[0].kind == "쪽지"
    assert mine[0].institution_id == "nowon"
    assert mine[0].read_at is None
    assert mine[0].created_at  # ISO 문자열이 채워진다


def test_mark_read_and_unread_filter(tmp_path):
    conn = _conn(tmp_path)
    n = create_notification(conn, "영업팀", "되물음", "불리 조건 발견 — 재고 권유", institution_id="nowon")
    assert mark_read(conn, n.notification_id) is True
    assert list_notifications(conn, "영업팀", unread_only=True) == []
    assert list_notifications(conn, "영업팀")[0].read_at is not None


def test_mark_read_unknown_id_returns_false(tmp_path):
    conn = _conn(tmp_path)
    assert mark_read(conn, "no-such") is False
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_notification_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.notification_repository'`

- [ ] **Step 4: Implement**

`backend/db.py`의 `SCHEMA` 문자열 끝(messages 테이블 뒤)에 추가:

```sql
CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    recipient       TEXT NOT NULL,
    kind            TEXT NOT NULL,          -- 쪽지/되물음/결재요청/이관
    institution_id  TEXT,
    task_id         TEXT,
    content         TEXT NOT NULL,
    link            TEXT,
    created_at      TEXT NOT NULL,
    read_at         TEXT
);
```

`backend/models.py`에 추가:

```python
class Notification(BaseModel):
    notification_id: str
    recipient: str
    kind: str
    institution_id: str | None = None
    task_id: str | None = None
    content: str
    link: str | None = None
    created_at: str
    read_at: str | None = None
```

`backend/notification_repository.py`:

```python
import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import Notification


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_notification(
    conn: sqlite3.Connection,
    recipient: str,
    kind: str,
    content: str,
    institution_id: str | None = None,
    task_id: str | None = None,
    link: str | None = None,
    commit: bool = True,
) -> Notification:
    notification_id = f"ntf-{secrets.token_hex(4)}"
    created_at = _now()
    conn.execute(
        """INSERT INTO notifications
           (notification_id, recipient, kind, institution_id, task_id, content, link, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (notification_id, recipient, kind, institution_id, task_id, content, link, created_at),
    )
    if commit:
        conn.commit()
    return Notification(
        notification_id=notification_id, recipient=recipient, kind=kind,
        institution_id=institution_id, task_id=task_id, content=content,
        link=link, created_at=created_at,
    )


def list_notifications(
    conn: sqlite3.Connection, recipient: str, unread_only: bool = False
) -> list[Notification]:
    sql = "SELECT * FROM notifications WHERE recipient = ?"
    if unread_only:
        sql += " AND read_at IS NULL"
    sql += " ORDER BY created_at DESC"
    return [Notification(**dict(r)) for r in conn.execute(sql, (recipient,)).fetchall()]


def mark_read(conn: sqlite3.Connection, notification_id: str) -> bool:
    cur = conn.execute(
        "UPDATE notifications SET read_at = ? WHERE notification_id = ? AND read_at IS NULL",
        (_now(), notification_id),
    )
    conn.commit()
    return cur.rowcount > 0
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_notification_repository.py -v` → 3 passed.
Run: `py -3 -m pytest backend -q` → 기존 backend 테스트 전부 통과(기존 DB 스키마 테스트가 테이블 목록을 고정 검증한다면 notifications를 추가 반영).

- [ ] **Step 6: Commit**

```bash
git add requirements.txt backend/db.py backend/models.py backend/notification_repository.py backend/tests/test_notification_repository.py
git commit -m "feat(backend): notifications 테이블·리포지토리 + langgraph 의존성 (A1 Task 1)"
```

---

### Task 2: Recorder 포트(agent) + DbRecorder 구현(backend)

**Files:**
- Create: `agent/orchestrator/__init__.py` (빈 파일)
- Create: `agent/orchestrator/ports.py`
- Create: `backend/orchestrator_recorder.py`
- Test: `backend/tests/test_orchestrator_recorder.py`

**Interfaces:**
- Consumes: Task 1의 `create_notification`; 기존 `backend/task_repository.py`의 `add_message`; 기존 `tasks` 테이블(`UNIQUE(bid_case_id, team)`).
- Produces:
  - `agent/orchestrator/ports.py`: `Recorder` Protocol — `set_stage(stage: int)`, `task_update(team: str, status: str, progress_pct: int)`, `message(team: str, role: str, content: str)`, `notify(recipient: str, kind: str, content: str)`. `NullRecorder`(전부 no-op) 포함 — 그래프 단위테스트용.
  - `backend/orchestrator_recorder.py`: `DbRecorder(db_path, institution_id, bid_case_id)` — Recorder 구현. 팀별 task 행이 없으면 만들고(`task_id = f"tsk-{bid_case_id}-{team}"` 형식은 기존 `bidcase_repository.create_tasks_for_bid_case`의 방식을 먼저 읽고 그대로 따를 것), messages/notifications에 기록, `institutions.stage` 갱신.

- [ ] **Step 1: `agent/orchestrator/ports.py` 작성** (테스트는 DbRecorder 쪽에서)

```python
"""오케스트레이터의 기록 포트 — agent 층은 backend를 모른다(분리 관행).

그래프 노드는 이 포트로만 바깥에 말한다. backend가 DB 구현체(DbRecorder)를 주입하고,
그래프 단위테스트는 NullRecorder를 쓴다.
"""

from typing import Protocol


class Recorder(Protocol):
    def set_stage(self, stage: int) -> None: ...
    def task_update(self, team: str, status: str, progress_pct: int) -> None: ...
    def message(self, team: str, role: str, content: str) -> None: ...
    def notify(self, recipient: str, kind: str, content: str) -> None: ...


class NullRecorder:
    def set_stage(self, stage: int) -> None: pass
    def task_update(self, team: str, status: str, progress_pct: int) -> None: pass
    def message(self, team: str, role: str, content: str) -> None: pass
    def notify(self, recipient: str, kind: str, content: str) -> None: pass
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_orchestrator_recorder.py`:

```python
from backend.db import init_db
from backend.notification_repository import list_notifications
from backend.orchestrator_recorder import DbRecorder


def _setup(tmp_path):
    db_path = str(tmp_path / "registry.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon', '노원구', 2)"
    )
    conn.execute(
        "INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1', 'nowon')"
    )
    conn.commit()
    return db_path, conn


def test_set_stage_updates_institution(tmp_path):
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").set_stage(4)
    row = conn.execute("SELECT stage FROM institutions WHERE institution_id='nowon'").fetchone()
    assert row["stage"] == 4


def test_task_update_creates_then_updates_team_task(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.task_update("영업", "작성중", 30)
    rec.task_update("영업", "1차완료", 100)
    rows = conn.execute("SELECT * FROM tasks WHERE bid_case_id='bc-1' AND team='영업'").fetchall()
    assert len(rows) == 1
    assert rows[0]["status"] == "1차완료"
    assert rows[0]["progress_pct"] == 100


def test_message_appends_to_team_task_thread(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.message("영업", "orchestrator", "협력사업 항목 초안 작성 지시")
    task = conn.execute("SELECT task_id FROM tasks WHERE team='영업'").fetchone()
    msgs = conn.execute("SELECT * FROM messages WHERE task_id=?", (task["task_id"],)).fetchall()
    assert len(msgs) == 1
    assert msgs[0]["role"] == "orchestrator"


def test_notify_writes_notification(tmp_path):
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").notify("영업팀", "되물음", "불리 조건 발견")
    notes = list_notifications(conn, "영업팀")
    assert len(notes) == 1
    assert notes[0].kind == "되물음"
    assert notes[0].institution_id == "nowon"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_orchestrator_recorder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.orchestrator_recorder'`

- [ ] **Step 4: Implement `backend/orchestrator_recorder.py`**

먼저 `backend/bidcase_repository.py:221`의 `create_tasks_for_bid_case`를 읽고 task_id 생성 방식을 확인해 동일하게 맞춘다. 구현:

```python
"""Recorder의 DB 구현 — 그래프의 지시/보고를 registry에 남긴다.

스레드에서 호출되므로 커넥션을 들고 있지 않고 호출마다 열고 닫는다(SQLite 파일 DB).
"""

import secrets
import sqlite3

from backend.db import get_connection
from backend.notification_repository import create_notification
from backend.task_repository import add_message


class DbRecorder:
    def __init__(self, db_path: str, institution_id: str, bid_case_id: str) -> None:
        self.db_path = db_path
        self.institution_id = institution_id
        self.bid_case_id = bid_case_id

    def _conn(self) -> sqlite3.Connection:
        return get_connection(self.db_path)

    def _ensure_task(self, conn: sqlite3.Connection, team: str) -> str:
        row = conn.execute(
            "SELECT task_id FROM tasks WHERE bid_case_id = ? AND team = ?",
            (self.bid_case_id, team),
        ).fetchone()
        if row:
            return row["task_id"]
        task_id = f"tsk-{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO tasks (task_id, bid_case_id, team) VALUES (?, ?, ?)",
            (task_id, self.bid_case_id, team),
        )
        conn.commit()
        return task_id

    def set_stage(self, stage: int) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "UPDATE institutions SET stage = ? WHERE institution_id = ?",
                (stage, self.institution_id),
            )
            conn.commit()
        finally:
            conn.close()

    def task_update(self, team: str, status: str, progress_pct: int) -> None:
        conn = self._conn()
        try:
            task_id = self._ensure_task(conn, team)
            conn.execute(
                "UPDATE tasks SET status = ?, progress_pct = ? WHERE task_id = ?",
                (status, progress_pct, task_id),
            )
            conn.commit()
        finally:
            conn.close()

    def message(self, team: str, role: str, content: str) -> None:
        conn = self._conn()
        try:
            task_id = self._ensure_task(conn, team)
            add_message(conn, task_id, role, content)
        finally:
            conn.close()

    def notify(self, recipient: str, kind: str, content: str) -> None:
        conn = self._conn()
        try:
            create_notification(
                conn, recipient, kind, content, institution_id=self.institution_id
            )
        finally:
            conn.close()
```

(`add_message`가 자체 commit하는지 `backend/task_repository.py:25`에서 확인하고, 안 하면 commit 추가.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_orchestrator_recorder.py -v` → 4 passed.

- [ ] **Step 6: Commit**

```bash
git add agent/orchestrator/__init__.py agent/orchestrator/ports.py backend/orchestrator_recorder.py backend/tests/test_orchestrator_recorder.py
git commit -m "feat: Recorder 포트 + DbRecorder — 그래프 기록을 tasks/messages/notifications로 (A1 Task 2)"
```

---

### Task 3: PII 스캐너

**Files:**
- Create: `agent/orchestrator/pii.py`
- Test: `agent/tests/test_pii.py`

**Interfaces:**
- Produces: `scan_pii(text: str) -> list[dict]` — `[{"kind": "휴대폰"|"주민등록번호"|"이메일", "value": <마스킹된 표시값>}, ...]`. 원문 값은 반환하지 않는다(마스킹해서 보고). Task 5의 verifier가 쓴다.

- [ ] **Step 1: Write the failing tests**

`agent/tests/test_pii.py`:

```python
from agent.orchestrator.pii import scan_pii


def test_detects_mobile_phone():
    found = scan_pii("담당자 연락처는 010-1234-5678 입니다.")
    assert found == [{"kind": "휴대폰", "value": "010-****-5678"}]


def test_detects_rrn():
    found = scan_pii("주민번호 901231-1234567 기재")
    assert found[0]["kind"] == "주민등록번호"
    assert "1234567" not in found[0]["value"]  # 뒷자리 노출 금지


def test_detects_email():
    found = scan_pii("문의: kim.damdang@example.com")
    assert found[0]["kind"] == "이메일"
    assert found[0]["value"].startswith("k***@")


def test_clean_text_returns_empty():
    assert scan_pii("연락처 표기는 대표번호 02-120으로 통일한다.") == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest agent/tests/test_pii.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.orchestrator.pii'`

- [ ] **Step 3: Implement `agent/orchestrator/pii.py`**

```python
"""개인정보(PII) 검출 — 스펙 §② 체크리스트 15.

결정적 정규식만 쓴다(LLM 아님). 검출값은 마스킹해 보고 — 검사 결과 자체가
개인정보 2차 유출 경로가 되면 안 된다. 코퍼스 마스킹 전례: 서초·마포 spec.
"""

import re

_MOBILE = re.compile(r"01[016789][-\s]?(\d{3,4})[-\s]?(\d{4})")
_RRN = re.compile(r"(\d{6})[-\s]?([1-4]\d{6})")
_EMAIL = re.compile(r"([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")


def scan_pii(text: str) -> list[dict]:
    found: list[dict] = []
    for m in _MOBILE.finditer(text):
        found.append({"kind": "휴대폰", "value": f"010-****-{m.group(2)}"})
    for m in _RRN.finditer(text):
        found.append({"kind": "주민등록번호", "value": f"{m.group(1)}-*******"})
    for m in _EMAIL.finditer(text):
        found.append({"kind": "이메일", "value": f"{m.group(1)}***@{m.group(3)}"})
    return found
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_pii.py -v` → 4 passed.
(휴대폰 정규식이 주민번호 패턴과 겹쳐 이중 검출되면 — `901231-1234567`이 휴대폰으로도 잡히면 — 휴대폰 매치를 `01`로 시작하는 경우로만 한정한 현 패턴으로 충분한지 테스트로 확인한다.)

- [ ] **Step 5: Commit**

```bash
git add agent/orchestrator/pii.py agent/tests/test_pii.py
git commit -m "feat(agent): PII 스캐너 — 휴대폰·주민번호·이메일 마스킹 검출 (A1 Task 3)"
```

---

### Task 4: OrchestratorState + subagent 노드 래퍼

**Files:**
- Create: `agent/orchestrator/state.py`
- Create: `agent/orchestrator/subagents.py`
- Test: `agent/tests/test_orchestrator_subagents.py`

**Interfaces:**
- Consumes: 기존 노드 전부(`agent/nodes/*`), `agent/pipeline.py`의 `RFP_ARTIFACTS`/`_artifacts_exist` 로직(복제하지 말고 `pipeline`에서 import — 밑줄 함수라면 공개 이름 `artifacts_exist`로 rename하고 pipeline 내 호출부도 갱신), Task 2의 `Recorder`, Task 3의 `scan_pii`.
- Produces (Task 5의 그래프가 배선):
  - `OrchestratorState(TypedDict)` — `institution_id, institution_name, giganlist_dir, report_new_dir, rfp_path, stage, rfp_text, scoring_table, requirements, institution_spec_dir, matched_district, archive_pptx_path, role_assignments, sections: Annotated[list[dict], operator.add], coverage_report, pii_findings, pptx_path, revision_note`
  - `rfi_agent(state, recorder) -> dict` — 3·4단계: (산출물 없고 rfp_path 있으면) rfp_extract → rfp_analysis → institution_match → role_router. risk_flag 있는 요구사항 발견 시 `recorder.notify("영업팀", "되물음", …)`. stage를 4까지 올린다.
  - `draft_team(state, recorder) -> dict` — Send 페이로드(state에 `role` 키 포함)로 호출되는 팬아웃 노드: `content_writer_node(state, role=role)` 실행, task_update/message 기록, `{"sections": [...]}` 반환(reducer 병합).
  - `packager(state, recorder) -> dict` — 7단계: `pptx_builder_node` 실행.
  - `verifier(state, recorder) -> dict` — `verification_node` + 전체 sections 본문 `scan_pii` → `{"coverage_report": [...], "pii_findings": [...]}`.

- [ ] **Step 1: `agent/orchestrator/state.py` 작성**

```python
import operator
from typing import Annotated, TypedDict


class OrchestratorState(TypedDict, total=False):
    institution_id: str
    institution_name: str
    giganlist_dir: str                # corpus/institutions (루트)
    report_new_dir: str
    rfp_path: str | None
    stage: int
    rfp_text: str
    scoring_table: list[dict]
    requirements: list[dict]          # [{item, category, weight, risk_flag}]
    institution_spec_dir: str | None
    matched_district: str | None
    archive_pptx_path: str | None
    role_assignments: list[dict]
    role: str                         # Send 페이로드 전용(draft_team이 읽음)
    sections: Annotated[list[dict], operator.add]   # 팬아웃 병합(reducer)
    coverage_report: list[dict]
    pii_findings: list[dict]
    pptx_path: str
    revision_note: str | None         # 결재 반려 사유 — 재작성 지시에 실린다
```

- [ ] **Step 2: Write the failing tests**

`agent/tests/test_orchestrator_subagents.py`:

```python
from unittest.mock import MagicMock, patch

from agent.orchestrator.ports import NullRecorder
from agent.orchestrator.subagents import draft_team, rfi_agent, verifier

BASE = {
    "institution_id": "nowon",
    "institution_name": "노원구",
    "giganlist_dir": "corpus/institutions",
    "report_new_dir": "data/report_new",
    "rfp_path": None,
    "stage": 3,
}


@patch("agent.orchestrator.subagents.role_router_node")
@patch("agent.orchestrator.subagents.institution_match_node")
@patch("agent.orchestrator.subagents.rfp_analysis_node")
def test_rfi_agent_runs_analysis_chain_and_reports(mock_rfp, mock_match, mock_router):
    mock_rfp.return_value = {
        "scoring_table": [{"item": "a"}],
        "requirements": [{"item": "a", "risk_flag": None}],
        "rfp_text": "본문",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    recorder = MagicMock()

    result = rfi_agent(dict(BASE), recorder)

    assert result["scoring_table"] == [{"item": "a"}]
    assert result["stage"] == 4
    recorder.set_stage.assert_called_with(4)
    # risk_flag 없음 → 되물음 없음
    recorder.notify.assert_not_called()


@patch("agent.orchestrator.subagents.role_router_node")
@patch("agent.orchestrator.subagents.institution_match_node")
@patch("agent.orchestrator.subagents.rfp_analysis_node")
def test_rfi_agent_risk_triggers_advisory_notify(mock_rfp, mock_match, mock_router):
    mock_rfp.return_value = {
        "scoring_table": [{"item": "출연금"}],
        "requirements": [{"item": "출연금", "risk_flag": "출연금 요구 상향"}],
        "rfp_text": "본문",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "출연금", "role": "예산"}]}
    recorder = MagicMock()

    rfi_agent(dict(BASE), recorder)

    recorder.notify.assert_called_once()
    args = recorder.notify.call_args[0]
    assert args[0] == "영업팀" and args[1] == "되물음"
    assert "출연금" in args[2]


@patch("agent.orchestrator.subagents.content_writer_node")
def test_draft_team_writes_role_sections_and_records(mock_writer):
    mock_writer.return_value = {"sections": [{"scoring_item": "a"}]}
    recorder = MagicMock()
    state = dict(BASE, role="영업", role_assignments=[{"scoring_item": "a", "role": "영업"}],
                 scoring_table=[{"item": "a"}])

    result = draft_team(state, recorder)

    assert result == {"sections": [{"scoring_item": "a"}]}
    mock_writer.assert_called_once()
    assert mock_writer.call_args.kwargs["role"] == "영업"
    recorder.task_update.assert_any_call("영업", "작성중", 10)
    recorder.task_update.assert_any_call("영업", "1차완료", 100)


@patch("agent.orchestrator.subagents.verification_node")
def test_verifier_adds_pii_findings(mock_verify):
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[{"item": "a"}],
                 sections=[{"scoring_item": "a", "title": "t", "content": "연락처 010-1234-5678", "sources": []}])

    result = verifier(state, recorder)

    assert result["coverage_report"][0]["covered"] is True
    assert result["pii_findings"] == [{"kind": "휴대폰", "value": "010-****-5678"}]
    recorder.message.assert_called()  # 검사 보고가 기록된다
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `py -3 -m pytest agent/tests/test_orchestrator_subagents.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.orchestrator.subagents'`

- [ ] **Step 4: Implement**

먼저 `agent/pipeline.py`의 `_artifacts_exist`를 `artifacts_exist`로 rename(공개화)하고 pipeline 내 호출부 갱신. `agent/orchestrator/subagents.py`:

```python
"""subagent 노드 래퍼 — 기존 노드 함수를 그래프 노드로 감싼다.

각 함수는 (state, recorder)를 받고 상태 업데이트 dict를 반환한다. recorder로만
바깥에 말한다(Recorder 포트). subagent끼리 직접 통신하지 않는다 — 스펙 §④.
"""

from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.rfp_extract import rfp_extract_node
from agent.nodes.role_router import ROLES, role_router_node
from agent.nodes.verification import verification_node
from agent.orchestrator.pii import scan_pii
from agent.pipeline import artifacts_exist


def rfi_agent(state: dict, recorder) -> dict:
    """3·4단계 — 공고 해부와 요구사항 분석. 불리 조건은 되물음(비차단)으로 알린다."""
    updates: dict = {}
    recorder.task_update("RFI분석", "작성중", 10)
    recorder.set_stage(3)

    if state.get("rfp_path") and not artifacts_exist(
        state["report_new_dir"], state["institution_name"]
    ):
        updates.update(rfp_extract_node({**state, **updates}))

    updates.update(rfp_analysis_node({**state, **updates}))
    updates.update(institution_match_node({**state, **updates}))
    updates.update(role_router_node({**state, **updates}))

    risks = [r for r in updates.get("requirements", []) if r.get("risk_flag")]
    if risks:
        detail = "; ".join(f"{r['item']}: {r['risk_flag']}" for r in risks)
        recorder.notify("영업팀", "되물음", f"불리 조건 발견 — 재고 권유: {detail}")

    updates["stage"] = 4
    recorder.set_stage(4)
    recorder.task_update("RFI분석", "1차완료", 100)
    recorder.message("RFI분석", "agent", f"배점표 {len(updates.get('scoring_table', []))}항목 분석 완료")
    return updates


def draft_team(state: dict, recorder) -> dict:
    """Send 팬아웃 노드 — state['role'] 팀의 초안만 작성한다."""
    role = state["role"]
    recorder.task_update(role, "작성중", 10)
    result = content_writer_node(state, role=role)
    recorder.task_update(role, "1차완료", 100)
    recorder.message(role, "agent", f"{role}팀 초안 {len(result['sections'])}건 작성 완료")
    return {"sections": result["sections"]}


def packager(state: dict, recorder) -> dict:
    """7단계 — 승인 작성물을 디자이너 이관 패키지(PPTX 골격)로."""
    recorder.set_stage(7)
    recorder.task_update("취합", "작성중", 50)
    updates = pptx_builder_node(state)
    recorder.task_update("취합", "1차완료", 100)
    recorder.notify("디자이너", "이관", f"이관 패키지 준비 완료: {updates.get('pptx_path', '')}")
    return updates


def verifier(state: dict, recorder) -> dict:
    """검증가 — 커버리지 + PII. 8단계 전체 검사에 쓰인다(업로드 즉시 검사는 A2)."""
    recorder.set_stage(8)
    updates = verification_node(state)
    pii: list[dict] = []
    for section in state.get("sections", []):
        pii.extend(scan_pii(section.get("content", "")))
    updates["pii_findings"] = pii
    uncovered = [c for c in updates["coverage_report"] if not c["covered"]]
    recorder.message(
        "검증", "agent",
        f"검증 완료 — 미달 {len(uncovered)}건, PII {len(pii)}건",
    )
    return updates
```

`ROLES`는 Task 5의 그래프가 팬아웃에 쓰도록 re-export된 상태로 둔다(import만으로 충분).

- [ ] **Step 5: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_orchestrator_subagents.py agent/tests/test_pipeline.py -v` → 신규 4 + 기존 pipeline 6 전부 passed (rename 반영 확인).

- [ ] **Step 6: Commit**

```bash
git add agent/orchestrator/state.py agent/orchestrator/subagents.py agent/tests/test_orchestrator_subagents.py agent/pipeline.py
git commit -m "feat(agent): OrchestratorState + subagent 래퍼 — 기존 노드를 그래프 도구로 (A1 Task 4)"
```

---

### Task 5: LangGraph 그래프 배선 — supervisor + 결재 3게이트 + 체크포인터

**Files:**
- Create: `agent/orchestrator/graph.py`
- Test: `agent/tests/test_orchestrator_graph.py`

**Interfaces:**
- Consumes: Task 4의 노드들, `langgraph`(`StateGraph, START, END`, `Send`, `interrupt`, `Command`), `langgraph.checkpoint.memory.MemorySaver`(테스트)/`langgraph.checkpoint.sqlite.SqliteSaver`(운영, Task 6이 주입).
- Produces: `build_workflow_graph(recorder, checkpointer)` → 컴파일된 그래프. 노드 이름: `"rfi"`, `"draft"`, `"gate_plan"`, `"gate_handoff"`, `"packager"`, `"verifier"`, `"gate_final"`, `"finish"`. 게이트의 interrupt payload는 `{"gate": "기획승인"|"이관결재"|"최종결재", "stage": int}`, resume 값은 `{"approved": bool, "by": str, "comment": str | None}`. Task 6의 API가 이 계약으로 재개한다.

- [ ] **Step 1: Write the failing tests**

`agent/tests/test_orchestrator_graph.py`:

```python
from unittest.mock import MagicMock, patch

from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from agent.orchestrator.graph import build_workflow_graph
from agent.orchestrator.ports import NullRecorder

BASE_INPUT = {
    "institution_id": "nowon",
    "institution_name": "노원구",
    "giganlist_dir": "corpus/institutions",
    "report_new_dir": "data/report_new",
    "rfp_path": None,
    "stage": 2,
}
CFG = {"configurable": {"thread_id": "nowon"}}


def _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify):
    mock_rfi.side_effect = lambda s, r: {
        "scoring_table": [{"item": "a"}],
        "requirements": [],
        "role_assignments": [{"scoring_item": "a", "role": "영업"}],
        "stage": 4,
    }
    mock_draft.side_effect = lambda s, r: {"sections": [{"scoring_item": "a", "content": "x"}]}
    mock_pack.side_effect = lambda s, r: {"pptx_path": "x.pptx"}
    mock_verify.side_effect = lambda s, r: {
        "coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}],
        "pii_findings": [],
    }


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_full_run_pauses_at_three_gates_then_finishes(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)                       # → 🛑 기획승인
    state = graph.get_state(CFG)
    assert state.next == ("gate_plan",) or state.tasks[0].interrupts  # 기획승인 대기

    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)  # → 🛑 이관결재
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)  # → 🛑 최종결재
    result = graph.invoke(Command(resume={"approved": True, "by": "인사권자", "comment": None}), CFG)

    assert result["stage"] == 9
    assert mock_pack.call_count == 1
    assert mock_verify.call_count == 1
    # 3팀 팬아웃: draft_team이 역할 수(3)만큼 호출
    assert mock_draft.call_count == 3


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_plan_rejection_reruns_drafts_with_note(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)
    graph.invoke(Command(resume={"approved": False, "by": "영업팀", "comment": "민원 근거 보강"}), CFG)

    # 반려 → 초안 3팀 재실행 후 다시 기획승인 대기
    assert mock_draft.call_count == 6
    state = graph.get_state(CFG)
    assert state.values.get("revision_note") == "민원 근거 보강"
    assert state.tasks and state.tasks[0].interrupts  # 다시 게이트에서 대기


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_final_rejection_reruns_packager_and_verifier(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    graph.invoke(Command(resume={"approved": False, "by": "인사권자", "comment": "표지 수정"}), CFG)

    # 최종 반려 → packager·verifier 재실행 후 다시 최종결재 대기
    assert mock_pack.call_count == 2
    assert mock_verify.call_count == 2
    state = graph.get_state(CFG)
    assert state.tasks and state.tasks[0].interrupts
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest agent/tests/test_orchestrator_graph.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.orchestrator.graph'`

- [ ] **Step 3: Implement `agent/orchestrator/graph.py`**

```python
"""오케스트레이터 supervisor 그래프 — 스펙 §④⑤.

경로: rfi(3·4) → draft 3팀 팬아웃(5) → 🛑기획승인 → [6단계 사람 작업은 그래프 밖]
→ 🛑이관결재 → packager(7) → verifier(8) → 🛑최종결재 → finish(9 대기).
반려는 사유(revision_note)와 함께 앞 단계로 되돌린다.
"""

from functools import partial

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, Send, interrupt

from agent.nodes.role_router import ROLES
from agent.orchestrator.state import OrchestratorState
from agent.orchestrator.subagents import draft_team, packager, rfi_agent, verifier


def _fanout(state: OrchestratorState):
    return [Send("draft", {**state, "sections": [], "role": role}) for role in ROLES]


def build_workflow_graph(recorder, checkpointer):
    g = StateGraph(OrchestratorState)

    g.add_node("rfi", partial(_call, rfi_agent, recorder))
    g.add_node("draft", partial(_call, draft_team, recorder))
    g.add_node("gate_plan", partial(_gate_plan, recorder))
    g.add_node("gate_handoff", partial(_gate_handoff, recorder))
    g.add_node("packager", partial(_call, packager, recorder))
    g.add_node("verifier", partial(_call, verifier, recorder))
    g.add_node("gate_final", partial(_gate_final, recorder))
    g.add_node("finish", partial(_finish, recorder))

    g.add_edge(START, "rfi")
    g.add_conditional_edges("rfi", _fanout, ["draft"])
    g.add_edge("draft", "gate_plan")
    # 게이트들은 Command(goto=...)로 스스로 다음을 정한다
    g.add_edge("packager", "verifier")
    g.add_edge("verifier", "gate_final")
    g.add_edge("finish", END)
    return g.compile(checkpointer=checkpointer)


def _call(fn, recorder, state):
    return fn(state, recorder)


def _decision(gate_name: str, stage: int):
    """게이트 공통 — interrupt로 결재를 기다리고 resume 값을 돌려받는다."""
    return interrupt({"gate": gate_name, "stage": stage})


def _gate_plan(recorder, state):
    recorder.set_stage(5)
    decision = _decision("기획승인", 5)
    if decision["approved"]:
        recorder.set_stage(6)
        recorder.message("영업", "human", f"기획 승인 — {decision['by']}")
        return Command(goto="gate_handoff", update={"stage": 6, "revision_note": None})
    recorder.message("영업", "human", f"기획 반려 — {decision.get('comment') or '(사유 없음)'}")
    return Command(
        goto="rfi_refan", update={"revision_note": decision.get("comment"), "sections": []}
    )


def _gate_handoff(recorder, state):
    decision = _decision("이관결재", 6)
    if decision["approved"]:
        recorder.message("취합", "human", f"이관 결재 — {decision['by']}")
        return Command(goto="packager", update={"stage": 7})
    recorder.message("영업", "human", f"이관 반려 — {decision.get('comment') or '(사유 없음)'}")
    return Command(goto="gate_plan", update={"revision_note": decision.get("comment")})


def _gate_final(recorder, state):
    decision = _decision("최종결재", 8)
    if decision["approved"]:
        recorder.message("검증", "human", f"최종 결재 — {decision['by']}")
        return Command(goto="finish")
    recorder.message("검증", "human", f"최종 반려 — {decision.get('comment') or '(사유 없음)'}")
    return Command(goto="packager", update={"revision_note": decision.get("comment")})


def _finish(recorder, state):
    recorder.set_stage(9)
    recorder.notify("영업팀", "쪽지", "최종 결재 완료 — 제출 대기(9단계). 제출 후 완료 마킹하세요.")
    return {"stage": 9}
```

**주의(구현 시 실제 API로 조정할 것):** ① 반려 시 초안 재실행 경로 — `Command(goto="rfi_refan")`처럼 없는 노드로 가면 안 된다. 팬아웃 재트리거는 **`Command(goto="draft", ...)`가 아니라 Send 목록을 goto에 직접 실을 수 있는지**(`Command(goto=[Send(...), ...])`) 설치된 langgraph 버전 문서를 확인해 택일: (a) `goto=[Send("draft", {...role}) for role in ROLES]` 지원 시 그것을 쓰고, (b) 미지원이면 빈 통과 노드 `"refan"`을 추가해 `refan → conditional_edges(_fanout)`으로 우회한다. 테스트가 규정하는 동작(반려 → draft 3회 재실행 → 다시 게이트)만 지키면 된다. ② `interrupt()`는 게이트 노드 재실행 시 처음부터 다시 실행되므로 게이트 노드 안에서는 interrupt 이전에 부수효과(recorder 호출)를 두지 않는 것이 원칙 — `_gate_plan`의 `set_stage(5)`는 중복 호출돼도 무해(멱등)하다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_orchestrator_graph.py -v` → 3 passed.
Run: `py -3 -m pytest agent -q` → agent 전체 통과.

- [ ] **Step 5: Commit**

```bash
git add agent/orchestrator/graph.py agent/tests/test_orchestrator_graph.py
git commit -m "feat(agent): 오케스트레이터 supervisor 그래프 — 팬아웃·결재 3게이트·반려 경로 (A1 Task 5)"
```

---

### Task 6: `run` / `checkpoint` / `status` API + 백그라운드 실행

**Files:**
- Create: `backend/orchestrator_service.py`
- Create: `backend/routers/workflow.py`
- Modify: `backend/main.py` (라우터 등록 + `graph_db_path` state)
- Test: `backend/tests/test_api_workflow.py`

**Interfaces:**
- Consumes: Task 5의 `build_workflow_graph`(게이트 계약: interrupt payload `{"gate", "stage"}`, resume `{"approved", "by", "comment"}`), Task 2의 `DbRecorder`, 기존 `bidcase_repository`(기관의 최신 bid_case 조회 — 함수가 없으면 `SELECT bid_case_id FROM bid_cases WHERE institution_id=? ORDER BY rowid DESC LIMIT 1` 직접).
- Produces:
  - `POST /institutions/{id}/run` → 202 `{"status": "started"}`. 이미 실행 중이면 409, 기관 없으면 404, `rfp_path` 없고 반입 산출물도 없으면 400.
  - `POST /institutions/{id}/checkpoint` body `{"approved": bool, "comment": str|null}` + `X-User-Id` 헤더 → 게이트 대기 중이 아니면 409, 재개는 백그라운드로 202.
  - `GET /institutions/{id}/status` → `{"stage": int, "running": bool, "pending_gate": str|null, "tasks": [...], "notifications_unread": int}`.
  - `backend/orchestrator_service.py`: `OrchestratorService(db_path, graph_db_path)` — `start(institution_id)`, `resume(institution_id, approved, by, comment)`, `status(institution_id)`; 스레드 1개/기관, `threading.Lock`으로 중복 시작 방지.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_api_workflow.py`:

```python
import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(
        str(tmp_path / "registry.db"),
        output_root=str(tmp_path / "report_new"),
        graph_db_path=str(tmp_path / "graph.db"),
    )
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage, rfp_path) VALUES ('nowon','노원구',2,'corpus/rfp/n.pdf')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.commit(); conn.close()
    return app


def _wait_for_gate(client, inst, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/institutions/{inst}/status").json()
        if body["pending_gate"]:
            return body
        time.sleep(0.05)
    raise AssertionError("게이트 대기 상태에 도달하지 못함")


# 그래프의 subagent만 목 — 그래프·게이트·체크포인터는 실물로 돈다
@patch("agent.orchestrator.graph.verifier", lambda s, r: {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}], "pii_findings": []})
@patch("agent.orchestrator.graph.packager", lambda s, r: {"pptx_path": "x.pptx"})
@patch("agent.orchestrator.graph.draft_team", lambda s, r: {"sections": [{"scoring_item": "a", "content": "x"}]})
@patch("agent.orchestrator.graph.rfi_agent", lambda s, r: {"scoring_table": [{"item": "a"}], "requirements": [], "role_assignments": [{"scoring_item": "a", "role": "영업"}], "stage": 4})
def test_run_then_three_approvals_reach_stage9(tmp_path):
    client = TestClient(_app(tmp_path))

    assert client.post("/institutions/nowon/run").status_code == 202
    body = _wait_for_gate(client, "nowon")
    assert body["pending_gate"] == "기획승인"

    for expected_next in ("이관결재", "최종결재"):
        r = client.post("/institutions/nowon/checkpoint",
                        json={"approved": True, "comment": None},
                        headers={"X-User-Id": "영업팀"})
        assert r.status_code == 202
        assert _wait_for_gate(client, "nowon")["pending_gate"] == expected_next

    client.post("/institutions/nowon/checkpoint",
                json={"approved": True, "comment": None}, headers={"X-User-Id": "인사권자"})
    deadline = time.time() + 5
    while time.time() < deadline:
        body = client.get("/institutions/nowon/status").json()
        if body["stage"] == 9 and not body["running"]:
            break
        time.sleep(0.05)
    assert body["stage"] == 9
    assert body["pending_gate"] is None


def test_run_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/institutions/nope/run").status_code == 404


def test_checkpoint_without_pending_gate_409(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.post("/institutions/nowon/checkpoint",
                    json={"approved": True, "comment": None}, headers={"X-User-Id": "u"})
    assert r.status_code == 409


@patch("agent.orchestrator.graph.rfi_agent", lambda s, r: (_ for _ in ()).throw(RuntimeError("LLM down")))
def test_graph_failure_marks_not_running_and_keeps_stage(tmp_path):
    client = TestClient(_app(tmp_path))
    client.post("/institutions/nowon/run")
    deadline = time.time() + 5
    while time.time() < deadline:
        body = client.get("/institutions/nowon/status").json()
        if not body["running"]:
            break
        time.sleep(0.05)
    assert body["running"] is False
    assert body["pending_gate"] is None  # 조용히 게이트인 척 하지 않는다
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_api_workflow.py -v`
Expected: FAIL — `create_app() got an unexpected keyword argument 'graph_db_path'`

- [ ] **Step 3: Implement**

`backend/orchestrator_service.py`:

```python
"""그래프 실행 서비스 — 기관당 스레드 1개, 게이트에서 멈추고 결재로 재개한다."""

import sqlite3
import threading

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from agent.orchestrator.graph import build_workflow_graph
from backend.db import get_connection
from backend.orchestrator_recorder import DbRecorder


class OrchestratorService:
    def __init__(self, db_path: str, graph_db_path: str, output_root: str) -> None:
        self.db_path = db_path
        self.graph_db_path = graph_db_path
        self.output_root = output_root
        self._lock = threading.Lock()
        self._running: dict[str, threading.Thread] = {}
        self._failed: set[str] = set()

    # -- 내부 도우미 ------------------------------------------------------
    def _graph(self, institution_id: str, bid_case_id: str):
        saver_conn = sqlite3.connect(self.graph_db_path, check_same_thread=False)
        recorder = DbRecorder(self.db_path, institution_id, bid_case_id)
        return build_workflow_graph(recorder, SqliteSaver(saver_conn))

    def _latest_bid_case(self, institution_id: str) -> str | None:
        conn = get_connection(self.db_path)
        try:
            row = conn.execute(
                "SELECT bid_case_id FROM bid_cases WHERE institution_id=? ORDER BY rowid DESC LIMIT 1",
                (institution_id,),
            ).fetchone()
            return row["bid_case_id"] if row else None
        finally:
            conn.close()

    def _spawn(self, institution_id: str, target) -> None:
        def runner():
            try:
                target()
            except Exception:
                self._failed.add(institution_id)
            finally:
                self._running.pop(institution_id, None)

        t = threading.Thread(target=runner, daemon=True)
        self._running[institution_id] = t
        t.start()

    # -- 공개 API ---------------------------------------------------------
    def start(self, institution_id: str, run_input: dict) -> None:
        bid_case_id = self._latest_bid_case(institution_id)
        graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
        cfg = {"configurable": {"thread_id": institution_id}}
        with self._lock:
            if institution_id in self._running:
                raise RuntimeError("already running")
            self._failed.discard(institution_id)
            self._spawn(institution_id, lambda: graph.invoke(run_input, cfg))

    def resume(self, institution_id: str, approved: bool, by: str, comment: str | None) -> None:
        bid_case_id = self._latest_bid_case(institution_id)
        graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
        cfg = {"configurable": {"thread_id": institution_id}}
        with self._lock:
            if institution_id in self._running:
                raise RuntimeError("still running")
            if not self.pending_gate(institution_id):
                raise LookupError("no pending gate")
            self._spawn(
                institution_id,
                lambda: graph.invoke(
                    Command(resume={"approved": approved, "by": by, "comment": comment}), cfg
                ),
            )

    def pending_gate(self, institution_id: str) -> str | None:
        bid_case_id = self._latest_bid_case(institution_id)
        graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
        cfg = {"configurable": {"thread_id": institution_id}}
        state = graph.get_state(cfg)
        for task in getattr(state, "tasks", ()) or ():
            for intr in getattr(task, "interrupts", ()) or ():
                return intr.value["gate"]
        return None

    def is_running(self, institution_id: str) -> bool:
        return institution_id in self._running
```

`backend/routers/workflow.py`:

```python
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from backend.db import get_connection
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["workflow"])


class CheckpointIn(BaseModel):
    approved: bool
    comment: str | None = None


def _svc(request: Request):
    return request.app.state.orchestrator


@router.post("/{institution_id}/run", status_code=202)
def post_run(institution_id: str, request: Request):
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
    finally:
        conn.close()
    if inst is None:
        raise HTTPException(status_code=404, detail="institution not found")
    if not inst.rfp_path:
        raise HTTPException(status_code=400, detail="공고문(rfp_path) 미반입 — 배치 반입이 먼저다")
    run_input = {
        "institution_id": inst.institution_id,
        "institution_name": inst.name_ko,
        "giganlist_dir": "corpus/institutions",
        "report_new_dir": request.app.state.output_root,
        "rfp_path": inst.rfp_path,
        "stage": inst.stage,
        "sections": [],
    }
    try:
        _svc(request).start(institution_id, run_input)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="already running")
    return {"status": "started"}


@router.post("/{institution_id}/checkpoint", status_code=202)
def post_checkpoint(
    institution_id: str, body: CheckpointIn, request: Request, x_user_id: str = Header(...)
):
    try:
        _svc(request).resume(institution_id, body.approved, x_user_id, body.comment)
    except LookupError:
        raise HTTPException(status_code=409, detail="no pending gate")
    except RuntimeError:
        raise HTTPException(status_code=409, detail="graph still running")
    return {"status": "resumed"}


@router.get("/{institution_id}/status")
def get_status(institution_id: str, request: Request):
    svc = _svc(request)
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        tasks = [dict(r) for r in conn.execute(
            """SELECT t.team, t.status, t.progress_pct, t.assignee FROM tasks t
               JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
               WHERE b.institution_id = ?""", (institution_id,)).fetchall()]
        unread = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE institution_id=? AND read_at IS NULL",
            (institution_id,),
        ).fetchone()["n"]
    finally:
        conn.close()
    running = svc.is_running(institution_id)
    return {
        "stage": inst.stage,
        "running": running,
        "pending_gate": None if running else svc.pending_gate(institution_id),
        "tasks": tasks,
        "notifications_unread": unread,
    }
```

`backend/main.py` 변경: `create_app`에 `graph_db_path: str = "data/graph_checkpoints.db"` 파라미터 추가 → `app.state.graph_db_path` 저장, `from backend.orchestrator_service import OrchestratorService` 후 `app.state.orchestrator = OrchestratorService(db_path, graph_db_path, output_root)`, `from backend.routers.workflow import router as workflow_router` 등록. `.gitignore`에 `data/graph_checkpoints.db`가 `data/` 무시 규칙으로 이미 커버되는지 확인(안 되면 추가).

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_api_workflow.py -v` → 4 passed.
Run: `py -3 -m pytest agent backend collector -q` → 전체 통과(기준선 284 + 신규).

- [ ] **Step 5: Commit**

```bash
git add backend/orchestrator_service.py backend/routers/workflow.py backend/main.py backend/tests/test_api_workflow.py
git commit -m "feat(backend): run/checkpoint/status API — 그래프 백그라운드 실행·결재 재개 (A1 Task 6)"
```

---

### Task 7: 실행가이드 갱신 + Ollama 실측 1회

**Files:**
- Modify: `docs/실행가이드_backend-agent.md` (오케스트레이터 절 추가)
- Test: 수동 실측(아래 절차) — 결과를 커밋 메시지와 handoff에 기록

**Interfaces:**
- Consumes: Task 6까지의 전부.

- [ ] **Step 1: 실행가이드에 "오케스트레이터 워크플로" 절 추가**

내용에 반드시 포함: ① `pip install -r requirements.txt`(langgraph 신규) ② 서버 기동 후 `POST /institutions/{id}/run` → `GET /status` 폴링 → `POST /checkpoint` 승인 3회 흐름 예시(curl) ③ 게이트 계약(기획승인→이관결재→최종결재, 반려 시 재작성) ④ `data/graph_checkpoints.db` 삭제 = 진행 중 그래프 초기화라는 주의.

- [ ] **Step 2: 로컬 Ollama 실측 (LLM 배선 검증 1회 — 스펙 검증 절차)**

```bash
# Ollama 기동 상태에서 (모델: llama3.1:8b — gpt-oss-120b는 이 PC에서 불가)
$env:LLM_MODEL='llama3.1:8b'; $env:LLM_FALLBACK_MODEL='llama3.1:8b'
py -3 -m uvicorn backend.main:app --port 8000
# 별도 셸: 노원(rfp_path 반입돼 있는 기관 또는 수원 PDF 지정)으로
#   POST /institutions/nowon/run → status 폴링 → 게이트 3회 승인 → stage 9 확인
```

확인 항목: ① 게이트 3회에서 실제로 멈추는가 ② tasks/messages/notifications에 기록이 쌓이는가 ③ 반려 1회 시 재작성이 도는가. (품질은 8B 한계로 평가하지 않는다 — 배선만.)

- [ ] **Step 3: Commit**

```bash
git add docs/실행가이드_backend-agent.md
git commit -m "docs: 오케스트레이터 run/checkpoint/status 사용법 + Ollama 실측 기록 (A1 Task 7)"
```

---

## Self-Review 결과

- **Spec coverage(A1 범위)**: §④ orchestrator 책무 중 ②디스패치·③검사·⑥상신 = Task 4~6, ⑤기록 = Task 2, 되물음(④의 일부) = Task 4의 rfi_agent. §⑤ 결재 3지점 = Task 5 게이트 3개. §⑥ notifications 테이블 = Task 1, run/checkpoint/status = Task 6. **①응대(chat)·업로드 즉시검사·아카이브·notifications 라우터는 의도적으로 A2** — 계획 헤더에 명시.
- **Placeholder scan**: TBD 없음. Task 5의 "실제 API로 조정" 주의는 placeholder가 아니라 버전 의존 분기 2안(a/b)을 모두 제시한 것.
- **Type consistency**: Recorder 4메서드 시그니처(Task 2 정의 ↔ Task 4·5 사용), 게이트 resume 계약 `{"approved","by","comment"}`(Task 5 정의 ↔ Task 6 사용), `create_app(graph_db_path=...)`(Task 6 내 정의·사용) 일치 확인.
