# Registry & Institutions API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SQLite-backed institution registry and the FastAPI endpoints that let the DMZ CSV export be imported and the registry queried — sub-project 0 of `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md` (§③④).

**Architecture:** A new `backend/` package with a plain `sqlite3` schema (`db.py`), pure CRUD functions (`repository.py`), Pydantic models (`models.py`), a CSV parser reusing the dashboard's existing Korean-header template (`csv_import.py`), a one-time seed script that registers the 23 existing `giganlist/` district folders under their canonical `institution_id` (`seed.py`), and a FastAPI app (`main.py` + `routers/institutions.py`) exposing 4 endpoints.

**Tech Stack:** Python 3.14, FastAPI, Pydantic, `sqlite3` (stdlib), pytest, `fastapi.testclient.TestClient` (needs `httpx` + `python-multipart`).

## Global Constraints

- Registry storage is **one SQLite file**, path from `REGISTRY_DB_PATH` env var (default `registry.db`). No ORM — raw `sqlite3` per spec §③ simplicity.
- `institution_id` for the 23 already-existing `giganlist/{slug}/` districts **must equal the folder slug** (spec §③). New institutions with no giganlist folder get a generated id (`new-<8 hex chars>`), never a guessed romanization.
- CSV import reuses the **existing dashboard CSV template headers** (기관명, 기관구분, 지역코드, 입찰주기, 지난입찰일, 입찰예상일, plus 확정여부/경도/위도/출처/수정일). Only columns that map to a registry field (기관명→name_ko, 기관구분→type, 지역코드→region_code, 입찰주기→term, 지난입찰일→last_bid, 입찰예상일→contract_end) are stored; the rest are dashboard-only fields and are ignored here by design, not a bug.
- Row matching on import is by **exact `name_ko` string match**; no matching endpoint exists → new row.
- **Out of scope for this plan**: `/institutions/{id}/advance`, `/institutions/{id}/status`, `/institutions/{id}/checkpoint` (spec §④) — those require wiring to the `agent/` pipeline and belong to sub-project 2 (폐쇄망 백엔드 코어). Do not implement them here.
- `python` on this machine only resolves via the Windows Store alias stub; use `py -3` for every command in this plan.
- Run all commands from the repo root `C:\claude_workspace\GGReportAgent`.

---

### Task 1: Project scaffolding + SQLite schema

**Files:**
- Create: `requirements.txt`
- Create: `backend/__init__.py` (empty)
- Create: `backend/db.py`
- Create: `backend/tests/__init__.py` (empty)
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `backend.db.init_db(db_path: str) -> sqlite3.Connection` (creates the `institutions` table if missing, returns an open connection with `row_factory = sqlite3.Row`), `backend.db.get_connection(db_path: str) -> sqlite3.Connection` (opens without creating schema).

- [ ] **Step 1: Create `requirements.txt`**

```
fastapi
uvicorn[standard]
pydantic
pytest
httpx
python-multipart
```

- [ ] **Step 2: Install dependencies**

Run: `py -3 -m pip install -r requirements.txt`
Expected: all 6 packages install without errors.

- [ ] **Step 3: Create empty package markers**

Create `backend/__init__.py` and `backend/tests/__init__.py`, both empty files.

- [ ] **Step 4: Write the failing test**

`backend/tests/test_db.py`:

```python
from backend.db import init_db


def test_init_db_creates_institutions_table(tmp_path):
    db_path = str(tmp_path / "registry.db")
    conn = init_db(db_path)
    cursor = conn.execute("PRAGMA table_info(institutions)")
    columns = {row["name"] for row in cursor.fetchall()}
    assert columns == {
        "institution_id", "name_ko", "region_code", "type",
        "contract_end", "last_bid", "term", "stage",
        "giganlist_dir", "rfp_path", "scoring_table", "pptx_path",
    }
    conn.close()
```

- [ ] **Step 5: Run test to verify it fails**

Run: `py -3 -m pytest backend/tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.db'`

- [ ] **Step 6: Implement `backend/db.py`**

```python
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS institutions (
    institution_id TEXT PRIMARY KEY,
    name_ko        TEXT NOT NULL,
    region_code    TEXT,
    type           TEXT,
    contract_end   TEXT,
    last_bid       TEXT,
    term           INTEGER,
    stage          INTEGER NOT NULL DEFAULT 1,
    giganlist_dir  TEXT,
    rfp_path       TEXT,
    scoring_table  TEXT,
    pptx_path      TEXT
);
"""


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> sqlite3.Connection:
    conn = get_connection(db_path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn
```

- [ ] **Step 7: Run test to verify it passes**

Run: `py -3 -m pytest backend/tests/test_db.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add requirements.txt backend/__init__.py backend/db.py backend/tests/__init__.py backend/tests/test_db.py
git commit -m "feat(backend): add registry SQLite schema"
```

---

### Task 2: Pydantic models + repository CRUD

**Files:**
- Create: `backend/models.py`
- Create: `backend/repository.py`
- Test: `backend/tests/test_repository.py`

**Interfaces:**
- Consumes: `backend.db.get_connection`, `backend.db.init_db` (Task 1)
- Produces: `backend.models.Institution`, `backend.models.InstitutionImportRow` (Pydantic models); `backend.repository.list_institutions(conn) -> list[Institution]`, `backend.repository.get_institution(conn, institution_id: str) -> Institution | None`, `backend.repository.upsert_institution(conn, row: InstitutionImportRow) -> str` (returns the `institution_id` written), `backend.repository.seed_giganlist_districts(conn, giganlist_root: Path) -> list[str]` (returns newly-seeded slugs).

- [ ] **Step 1: Write `backend/models.py`**

```python
from pydantic import BaseModel


class Institution(BaseModel):
    institution_id: str
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
    stage: int = 1
    giganlist_dir: str | None = None
    rfp_path: str | None = None
    scoring_table: list[dict] | None = None
    pptx_path: str | None = None


class InstitutionImportRow(BaseModel):
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    term: int | None = None
    last_bid: str | None = None
    contract_end: str | None = None
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_repository.py`:

```python
from pathlib import Path

from backend.db import init_db
from backend.models import InstitutionImportRow
from backend.repository import (
    get_institution,
    list_institutions,
    seed_giganlist_districts,
    upsert_institution,
)


def test_upsert_creates_new_institution(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    row = InstitutionImportRow(name_ko="테스트구청", type="지자체", region_code="11", term=4)

    institution_id = upsert_institution(conn, row)

    assert institution_id.startswith("new-")
    fetched = get_institution(conn, institution_id)
    assert fetched.name_ko == "테스트구청"
    assert fetched.stage == 1
    conn.close()


def test_upsert_matches_existing_by_name(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    first_id = upsert_institution(conn, InstitutionImportRow(name_ko="테스트구청", term=4))

    second_id = upsert_institution(
        conn, InstitutionImportRow(name_ko="테스트구청", term=4, contract_end="2027-01-01")
    )

    assert second_id == first_id
    assert get_institution(conn, first_id).contract_end == "2027-01-01"
    conn.close()


def test_list_institutions_returns_all(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    upsert_institution(conn, InstitutionImportRow(name_ko="가구청"))
    upsert_institution(conn, InstitutionImportRow(name_ko="나구청"))

    result = list_institutions(conn)

    assert {i.name_ko for i in result} == {"가구청", "나구청"}
    conn.close()


def test_seed_giganlist_districts_registers_known_folders(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    giganlist_root = tmp_path / "giganlist"
    (giganlist_root / "dobong").mkdir(parents=True)
    (giganlist_root / "nowon").mkdir(parents=True)
    (giganlist_root / "unknown-slug").mkdir(parents=True)

    seeded = seed_giganlist_districts(conn, giganlist_root)

    assert set(seeded) == {"dobong", "nowon"}
    dobong = get_institution(conn, "dobong")
    assert dobong.name_ko == "도봉구"
    assert dobong.giganlist_dir == "giganlist/dobong"
    assert get_institution(conn, "unknown-slug") is None
    conn.close()


def test_seed_giganlist_districts_is_idempotent(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    giganlist_root = tmp_path / "giganlist"
    (giganlist_root / "dobong").mkdir(parents=True)

    seed_giganlist_districts(conn, giganlist_root)
    second_run = seed_giganlist_districts(conn, giganlist_root)

    assert second_run == []
    conn.close()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_repository.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.repository'`

- [ ] **Step 4: Implement `backend/repository.py`**

```python
import json
import secrets
import sqlite3
from pathlib import Path

from backend.models import Institution, InstitutionImportRow

GIGANLIST_DISTRICT_NAMES = {
    "dobong": "도봉구",
    "dongdaemun": "동대문구",
    "dongjak": "동작구",
    "eunpyeong": "은평구",
    "gangbuk": "강북구",
    "gangnam": "강남구",
    "gangseo": "강서구",
    "geumcheon": "금천구",
    "guro": "구로구",
    "gwanak": "관악구",
    "gwangjin": "광진구",
    "jongno": "종로구",
    "jung": "중구",
    "jungnang": "중랑구",
    "mapo": "마포구",
    "nowon": "노원구",
    "seocho": "서초구",
    "seodaemun": "서대문구",
    "seongbuk": "성북구",
    "seongdong": "성동구",
    "yangcheon": "양천구",
    "yeongdeungpo": "영등포구",
    "yongsan": "용산구",
}


def _row_to_institution(row: sqlite3.Row) -> Institution:
    data = dict(row)
    if data["scoring_table"]:
        data["scoring_table"] = json.loads(data["scoring_table"])
    return Institution(**data)


def list_institutions(conn: sqlite3.Connection) -> list[Institution]:
    cursor = conn.execute("SELECT * FROM institutions ORDER BY institution_id")
    return [_row_to_institution(row) for row in cursor.fetchall()]


def get_institution(conn: sqlite3.Connection, institution_id: str) -> Institution | None:
    cursor = conn.execute(
        "SELECT * FROM institutions WHERE institution_id = ?", (institution_id,)
    )
    row = cursor.fetchone()
    return _row_to_institution(row) if row else None


def _find_id_by_name(conn: sqlite3.Connection, name_ko: str) -> str | None:
    cursor = conn.execute(
        "SELECT institution_id FROM institutions WHERE name_ko = ?", (name_ko,)
    )
    row = cursor.fetchone()
    return row["institution_id"] if row else None


def upsert_institution(conn: sqlite3.Connection, row: InstitutionImportRow) -> str:
    existing_id = _find_id_by_name(conn, row.name_ko)
    if existing_id:
        conn.execute(
            """UPDATE institutions
               SET region_code = ?, type = ?, term = ?, last_bid = ?, contract_end = ?
               WHERE institution_id = ?""",
            (row.region_code, row.type, row.term, row.last_bid, row.contract_end, existing_id),
        )
        conn.commit()
        return existing_id

    new_id = f"new-{secrets.token_hex(4)}"
    conn.execute(
        """INSERT INTO institutions
           (institution_id, name_ko, region_code, type, term, last_bid, contract_end, stage)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
        (new_id, row.name_ko, row.region_code, row.type, row.term, row.last_bid, row.contract_end),
    )
    conn.commit()
    return new_id


def seed_giganlist_districts(conn: sqlite3.Connection, giganlist_root: Path) -> list[str]:
    seeded = []
    for folder in sorted(p.name for p in giganlist_root.iterdir() if p.is_dir()):
        if folder not in GIGANLIST_DISTRICT_NAMES:
            continue
        if get_institution(conn, folder):
            continue
        conn.execute(
            """INSERT INTO institutions (institution_id, name_ko, giganlist_dir, stage)
               VALUES (?, ?, ?, 1)""",
            (folder, GIGANLIST_DISTRICT_NAMES[folder], f"giganlist/{folder}"),
        )
        seeded.append(folder)
    conn.commit()
    return seeded
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_repository.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/repository.py backend/tests/test_repository.py
git commit -m "feat(backend): add institution models + repository CRUD"
```

---

### Task 3: CSV import parser

**Files:**
- Create: `backend/csv_import.py`
- Test: `backend/tests/test_csv_import.py`

**Interfaces:**
- Consumes: `backend.models.InstitutionImportRow` (Task 2)
- Produces: `backend.csv_import.parse_csv(raw: bytes) -> list[InstitutionImportRow]`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_csv_import.py`:

```python
from backend.csv_import import parse_csv


def test_parse_csv_maps_korean_headers_and_ignores_dashboard_only_columns():
    csv_text = (
        "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일,확정여부,경도,위도,출처,수정일\n"
        "테스트구청,지자체,11,4,2022-12-30,,,,,,\n"
    )
    raw = csv_text.encode("utf-8-sig")

    rows = parse_csv(raw)

    assert len(rows) == 1
    assert rows[0].name_ko == "테스트구청"
    assert rows[0].type == "지자체"
    assert rows[0].region_code == "11"
    assert rows[0].term == 4
    assert rows[0].last_bid == "2022-12-30"
    assert rows[0].contract_end is None


def test_parse_csv_handles_multiple_rows():
    csv_text = "기관명,기관구분\n가구청,지자체\n나구청,공기업\n"
    raw = csv_text.encode("utf-8-sig")

    rows = parse_csv(raw)

    assert [r.name_ko for r in rows] == ["가구청", "나구청"]
    assert [r.type for r in rows] == ["지자체", "공기업"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_csv_import.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.csv_import'`

- [ ] **Step 3: Implement `backend/csv_import.py`**

```python
import csv
import io

from backend.models import InstitutionImportRow

HEADER_MAP = {
    "기관명": "name_ko",
    "기관구분": "type",
    "지역코드": "region_code",
    "입찰주기": "term",
    "지난입찰일": "last_bid",
    "입찰예상일": "contract_end",
}


def parse_csv(raw: bytes) -> list[InstitutionImportRow]:
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for record in reader:
        mapped = {}
        for ko_header, field in HEADER_MAP.items():
            value = (record.get(ko_header) or "").strip()
            if not value:
                continue
            mapped[field] = int(value) if field == "term" else value
        rows.append(InstitutionImportRow(**mapped))
    return rows
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_csv_import.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/csv_import.py backend/tests/test_csv_import.py
git commit -m "feat(backend): parse dashboard CSV template into import rows"
```

---

### Task 4: FastAPI app + institutions router

**Files:**
- Create: `backend/main.py`
- Create: `backend/routers/__init__.py` (empty)
- Create: `backend/routers/institutions.py`
- Test: `backend/tests/test_api_institutions.py`

**Interfaces:**
- Consumes: `backend.db.init_db`, `backend.db.get_connection` (Task 1); `backend.repository.list_institutions`, `get_institution`, `upsert_institution` (Task 2); `backend.csv_import.parse_csv` (Task 3)
- Produces: `backend.main.create_app(db_path: str) -> FastAPI`, `backend.main.app` (module-level instance for `uvicorn backend.main:app`)

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_api_institutions.py`:

```python
from fastapi.testclient import TestClient

from backend.main import create_app


def test_list_institutions_empty(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)

    response = client.get("/institutions")

    assert response.status_code == 200
    assert response.json() == []


def test_import_then_get_detail(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)
    csv_text = (
        "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일\n"
        "테스트구청,지자체,11,4,2022-12-30,\n"
    )
    files = {"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")}

    import_response = client.post("/institutions/import", files=files)

    assert import_response.status_code == 200
    body = import_response.json()
    assert body["imported"] == 1
    institution_id = body["institution_ids"][0]

    detail_response = client.get(f"/institutions/{institution_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["name_ko"] == "테스트구청"


def test_get_institution_404(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)

    response = client.get("/institutions/does-not-exist")

    assert response.status_code == 404


def test_get_artifacts_returns_paths(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)
    files = {
        "file": (
            "import.csv",
            "기관명,기관구분\n테스트구청,지자체\n".encode("utf-8-sig"),
            "text/csv",
        )
    }
    import_response = client.post("/institutions/import", files=files)
    institution_id = import_response.json()["institution_ids"][0]

    response = client.get(f"/institutions/{institution_id}/artifacts")

    assert response.status_code == 200
    assert response.json() == {
        "giganlist_dir": None,
        "rfp_path": None,
        "pptx_path": None,
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest backend/tests/test_api_institutions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.main'`

- [ ] **Step 3: Create empty `backend/routers/__init__.py`**

- [ ] **Step 4: Implement `backend/routers/institutions.py`**

```python
from fastapi import APIRouter, HTTPException, Request, UploadFile

from backend.csv_import import parse_csv
from backend.db import get_connection
from backend.models import Institution
from backend.repository import get_institution, list_institutions, upsert_institution

router = APIRouter(prefix="/institutions", tags=["institutions"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("", response_model=list[Institution])
def get_institutions(request: Request) -> list[Institution]:
    conn = _conn(request)
    try:
        return list_institutions(conn)
    finally:
        conn.close()


@router.get("/{institution_id}", response_model=Institution)
def get_institution_detail(institution_id: str, request: Request) -> Institution:
    conn = _conn(request)
    try:
        institution = get_institution(conn, institution_id)
    finally:
        conn.close()
    if institution is None:
        raise HTTPException(status_code=404, detail="institution not found")
    return institution


@router.post("/import")
async def import_institutions(file: UploadFile, request: Request) -> dict:
    raw = await file.read()
    rows = parse_csv(raw)
    conn = _conn(request)
    try:
        ids = [upsert_institution(conn, row) for row in rows]
    finally:
        conn.close()
    return {"imported": len(ids), "institution_ids": ids}


@router.get("/{institution_id}/artifacts")
def get_institution_artifacts(institution_id: str, request: Request) -> dict:
    conn = _conn(request)
    try:
        institution = get_institution(conn, institution_id)
    finally:
        conn.close()
    if institution is None:
        raise HTTPException(status_code=404, detail="institution not found")
    return {
        "giganlist_dir": institution.giganlist_dir,
        "rfp_path": institution.rfp_path,
        "pptx_path": institution.pptx_path,
    }
```

- [ ] **Step 5: Implement `backend/main.py`**

```python
import os

from fastapi import FastAPI

from backend.db import init_db
from backend.routers.institutions import router as institutions_router


def create_app(db_path: str) -> FastAPI:
    app = FastAPI(title="입찰 워크플로우 레지스트리 API")
    app.state.db_path = db_path
    init_db(db_path)
    app.include_router(institutions_router)
    return app


app = create_app(os.environ.get("REGISTRY_DB_PATH", "registry.db"))
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `py -3 -m pytest backend/tests/test_api_institutions.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/routers/__init__.py backend/routers/institutions.py backend/tests/test_api_institutions.py
git commit -m "feat(backend): expose institutions FastAPI endpoints"
```

---

### Task 5: Seed CLI + full test suite + manual smoke check

**Files:**
- Create: `backend/seed.py`
- Modify: none (integration-only task)

**Interfaces:**
- Consumes: `backend.db.init_db` (Task 1), `backend.repository.seed_giganlist_districts` (Task 2)
- Produces: `backend/seed.py` runnable as `py -3 -m backend.seed`

- [ ] **Step 1: Implement `backend/seed.py`**

```python
from pathlib import Path

from backend.db import init_db
from backend.repository import seed_giganlist_districts

DEFAULT_DB_PATH = "registry.db"


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    giganlist_root = repo_root / "giganlist"
    conn = init_db(DEFAULT_DB_PATH)
    seeded = seed_giganlist_districts(conn, giganlist_root)
    conn.close()
    print(f"seeded {len(seeded)} institutions: {seeded}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the full test suite**

Run: `py -3 -m pytest backend/tests -v`
Expected: PASS (all tests from Tasks 1-4, no regressions)

- [ ] **Step 3: Run the seed script against the real `giganlist/` folder**

Run: `py -3 -m backend.seed`
Expected: prints `seeded 23 institutions: ['dobong', 'dongdaemun', ...]` (all 23 current district folders; `registry.db` created at repo root)

- [ ] **Step 4: Start the API and verify manually**

Run (background): `py -3 -m uvicorn backend.main:app --reload`
Then in a second terminal: `curl http://127.0.0.1:8000/institutions`
Expected: JSON array with 23 entries, each `stage: 1` and `giganlist_dir` set to `giganlist/<slug>`.

- [ ] **Step 5: Add `registry.db` to `.gitignore`**

Append `registry.db` to the repo's `.gitignore` (create the file if it doesn't exist) so the local seeded database isn't committed.

- [ ] **Step 6: Commit**

```bash
git add backend/seed.py .gitignore
git commit -m "feat(backend): add giganlist seed CLI"
```

---

## Self-Review Notes

- **Spec coverage**: §③ schema → Task 1; §③ identity unification/seed → Task 2 + Task 5; §③ DMZ CSV 반입 게이트 → Task 3; §④ registry-facing endpoints (list/detail/import/artifacts) → Task 4. `advance`/`status`/`checkpoint` intentionally excluded (Global Constraints) — deferred to sub-project 2 per spec §⑧.
- **Placeholder scan**: none found — every step has literal file content.
- **Type consistency**: `Institution`/`InstitutionImportRow` field names match across `models.py`, `repository.py`, `csv_import.py`, `routers/institutions.py`, and all test files (`institution_id`, `name_ko`, `region_code`, `type`, `contract_end`, `last_bid`, `term`, `stage`, `giganlist_dir`, `rfp_path`, `scoring_table`, `pptx_path`).
