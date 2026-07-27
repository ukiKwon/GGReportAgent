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
