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
