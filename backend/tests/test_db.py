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
