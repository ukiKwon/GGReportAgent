"""계약 검증 — 수집기가 낸 CSV를 **망 안의 진짜 파서 두 개**가 읽을 수 있는가.

collector/SCHEMA.md §③·§⑦의 손검증을 자동화한 것이다. 이 테스트가 깨지면
스키마 문서와 구현(또는 망 안 파서)이 갈라진 것이다.

여기서 server를 import하는 것은 **계약 검증 목적**이라 허용된다.
collector 런타임 코드의 server/agent import 금지는 test_boundary.py가 강제한다.
"""

import datetime
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from collector.batch import write_batch
from collector.sources.fixture import FixtureSource

NOW = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)


@pytest.fixture
def csv_path(tmp_path):
    batch = write_batch(FixtureSource(), FixtureSource().fetch(), tmp_path, now=NOW).path
    return batch / "institutions.csv"


def test_backend_parser_reads_its_six_fields(csv_path):
    from server.csv_import import parse_csv

    rows = parse_csv(csv_path.read_bytes())
    by_name = {row.name_ko: row for row in rows}
    assert set(by_name) == {"마포구청", "종로구청"}

    mapo = by_name["마포구청"]
    assert mapo.type == "지자체"
    assert mapo.region_code == "11"
    assert mapo.term == 4
    assert mapo.last_bid == "2022-12-30"
    assert mapo.contract_end == "2026-09-30"


def test_backend_upsert_accepts_the_rows(csv_path, tmp_path):
    from server.csv_import import parse_csv
    from server.db import init_db
    from server.repository import list_institutions, upsert_institution

    conn = init_db(str(tmp_path / "contract.db"))
    try:
        for row in parse_csv(csv_path.read_bytes()):
            upsert_institution(conn, row)
        names = {i.name_ko for i in list_institutions(conn)}
    finally:
        conn.close()
    assert {"마포구청", "종로구청"} <= names


@pytest.mark.skipif(shutil.which("node") is None, reason="node 없음")
def test_dashboard_parser_reads_all_twelve_columns(csv_path, tmp_path):
    script = tmp_path / "parse.js"
    script.write_text(
        "const fs=require('fs');\n"
        "const logic=require(process.argv[2]);\n"
        "process.stdout.write(JSON.stringify("
        "logic.parseCsv(fs.readFileSync(process.argv[3],'utf8'))));\n",
        encoding="utf-8",
    )
    # require는 스크립트 위치 기준으로 해석되므로 절대경로를 넘긴다.
    logic_js = Path(__file__).resolve().parents[2] / "frontend" / "js" / "logic.js"
    result = subprocess.run(
        ["node", str(script), str(logic_js), str(csv_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    records = {r["name"]: r for r in json.loads(result.stdout)}

    mapo = records["마포구청"]
    assert mapo["subRegion"] == "11140"      # server가 안 읽는 열
    assert mapo["confirmed"] is True          # 확정여부 → boolean
    assert mapo["term"] == 4
    assert mapo["contractEnd"] == "2026-09-30"
    assert mapo["sources"] == ["https://example.invalid/notices/20260729-00123"]
    assert mapo["updatedAt"] == "2026-07-29"
    assert mapo["lng"] is None and mapo["lat"] is None

    assert records["종로구청"]["confirmed"] is False
