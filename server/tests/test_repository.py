from pathlib import Path

from server.db import init_db
from server.models import InstitutionImportRow
from server.repository import (
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


def test_upsert_partial_reimport_preserves_existing_fields(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    first_id = upsert_institution(
        conn,
        InstitutionImportRow(
            name_ko="테스트구청",
            type="지자체",
            region_code="11",
            term=4,
            last_bid="2022-12-30",
        ),
    )

    # Simulates re-importing a CSV export missing some columns (parse_csv drops
    # empty cells, so Pydantic defaults those fields to None). None must NOT
    # overwrite the existing DB values.
    second_id = upsert_institution(
        conn, InstitutionImportRow(name_ko="테스트구청", contract_end="2027-01-01")
    )

    assert second_id == first_id
    fetched = get_institution(conn, first_id)
    assert fetched.type == "지자체"
    assert fetched.region_code == "11"
    assert fetched.term == 4
    assert fetched.last_bid == "2022-12-30"
    assert fetched.contract_end == "2027-01-01"
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
    assert dobong.giganlist_dir == "corpus/institutions/dobong"
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


def test_upsert_matches_seeded_giganlist_institution_by_name(tmp_path):
    """Integration test for spec §③: a CSV row whose 기관명 matches an
    already-seeded giganlist institution's name_ko must update that same
    institution by its slug id, not create a `new-` duplicate, and must
    preserve the giganlist-seeded fields (giganlist_dir, stage)."""
    conn = init_db(str(tmp_path / "registry.db"))
    giganlist_root = tmp_path / "giganlist"
    (giganlist_root / "dobong").mkdir(parents=True)

    seed_giganlist_districts(conn, giganlist_root)
    seeded = get_institution(conn, "dobong")

    imported_id = upsert_institution(
        conn, InstitutionImportRow(name_ko=seeded.name_ko, type="지자체", term=4)
    )

    assert imported_id == "dobong"
    updated = get_institution(conn, "dobong")
    assert updated.giganlist_dir == "corpus/institutions/dobong"
    assert updated.stage == 1
    assert updated.type == "지자체"
    assert updated.term == 4
    conn.close()


def test_seed_sets_region_and_type_so_the_map_can_place_them(tmp_path):
    """지도가 구 폴리곤에 붙이려면 region('11')과 type('지자체')이 있어야 한다.

    없으면 institutionsByRegion에서 걸러져 지도에 안 뜨고, 랭킹 카드에는
    기관구분이 'undefined'로 찍힌다(실제로 그렇게 보였다).
    """
    from server.db import init_db
    from server.repository import seed_giganlist_districts

    conn = init_db(str(tmp_path / "r.db"))
    root = tmp_path / "institutions"
    (root / "dobong").mkdir(parents=True)
    seed_giganlist_districts(conn, root)

    row = conn.execute(
        "SELECT region_code, type, name_ko FROM institutions WHERE institution_id='dobong'"
    ).fetchone()
    conn.close()
    assert (row["region_code"], row["type"], row["name_ko"]) == ("11", "지자체", "도봉구")


def test_seed_backfills_existing_rows_missing_region_or_type(tmp_path):
    """이미 시딩된 DB(그 컬럼이 비어 있음)도 채워 준다 — 재시드는 기존 행을 건너뛰기 때문."""
    from server.db import init_db
    from server.repository import seed_giganlist_districts

    conn = init_db(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',5)")
    conn.commit()
    root = tmp_path / "institutions"
    (root / "dobong").mkdir(parents=True)

    seed_giganlist_districts(conn, root)

    row = conn.execute(
        "SELECT region_code, type, stage FROM institutions WHERE institution_id='dobong'").fetchone()
    conn.close()
    assert (row["region_code"], row["type"]) == ("11", "지자체")
    assert row["stage"] == 5          # 진행 상태는 건드리지 않는다


def test_seed_does_not_overwrite_values_a_user_already_set(tmp_path):
    from server.db import init_db
    from server.repository import seed_giganlist_districts

    conn = init_db(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, region_code, type, stage)"
                 " VALUES ('dobong','도봉구','41','공공기관',1)")
    conn.commit()
    root = tmp_path / "institutions"
    (root / "dobong").mkdir(parents=True)

    seed_giganlist_districts(conn, root)

    row = conn.execute(
        "SELECT region_code, type FROM institutions WHERE institution_id='dobong'").fetchone()
    conn.close()
    assert (row["region_code"], row["type"]) == ("41", "공공기관")
