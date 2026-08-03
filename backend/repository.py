import json
import secrets
import sqlite3
from pathlib import Path

from backend.models import Institution, InstitutionImportRow, InstitutionUpdateIn

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
    "songpa": "송파구",
    "gangdong": "강동구",
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


def find_id_by_name(conn: sqlite3.Connection, name_ko: str) -> str | None:
    cursor = conn.execute(
        "SELECT institution_id FROM institutions WHERE name_ko = ?", (name_ko,)
    )
    row = cursor.fetchone()
    return row["institution_id"] if row else None


def upsert_institution(
    conn: sqlite3.Connection, row: InstitutionImportRow, commit: bool = True
) -> str:
    existing_id = find_id_by_name(conn, row.name_ko)
    if existing_id:
        conn.execute(
            """UPDATE institutions
               SET region_code = COALESCE(?, region_code),
                   type = COALESCE(?, type),
                   term = COALESCE(?, term),
                   last_bid = COALESCE(?, last_bid),
                   contract_end = COALESCE(?, contract_end)
               WHERE institution_id = ?""",
            (row.region_code, row.type, row.term, row.last_bid, row.contract_end, existing_id),
        )
        if commit:
            conn.commit()
        return existing_id

    new_id = f"new-{secrets.token_hex(4)}"
    conn.execute(
        """INSERT INTO institutions
           (institution_id, name_ko, region_code, type, term, last_bid, contract_end, stage)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
        (new_id, row.name_ko, row.region_code, row.type, row.term, row.last_bid, row.contract_end),
    )
    if commit:
        conn.commit()
    return new_id


def update_institution(
    conn: sqlite3.Connection, institution_id: str, upd: InstitutionUpdateIn
) -> Institution | None:
    """부분 갱신: COALESCE 패턴으로 미전송 필드는 보존한다.

    없는 기관이면 None을 반환한다.
    stage 같은 워크플로 필드는 모델에 없어서 자동 무시된다."""
    if get_institution(conn, institution_id) is None:
        return None
    conn.execute(
        """UPDATE institutions
           SET region_code = COALESCE(?, region_code),
               type = COALESCE(?, type),
               contract_end = COALESCE(?, contract_end),
               last_bid = COALESCE(?, last_bid),
               term = COALESCE(?, term)
           WHERE institution_id = ?""",
        (upd.region_code, upd.type, upd.contract_end, upd.last_bid, upd.term, institution_id),
    )
    conn.commit()
    return get_institution(conn, institution_id)


# 25개 모두 서울 자치구다 — 지도가 구 폴리곤에 붙이려면 이 둘이 있어야 한다.
# region이 없으면 institutionsByRegion에서 걸러져 지도에 아예 안 뜨고,
# type이 없으면 랭킹 카드 기관구분이 'undefined'로 찍힌다(실제로 그렇게 보였다).
SEOUL_REGION_CODE = "11"
DISTRICT_TYPE = "지자체"


def seed_giganlist_districts(conn: sqlite3.Connection, giganlist_root: Path) -> list[str]:
    seeded = []
    for folder in sorted(p.name for p in giganlist_root.iterdir() if p.is_dir()):
        if folder not in GIGANLIST_DISTRICT_NAMES:
            continue
        if get_institution(conn, folder):
            # 이미 있는 행은 건너뛰되, **비어 있는 지역·구분만** 채운다. 재시드가 기존 행을
            # 건너뛰기 때문에, 이 백필이 없으면 먼저 만들어진 DB는 영영 지도에 안 뜬다.
            # 사람이 넣은 값은 덮지 않는다(COALESCE).
            conn.execute(
                """UPDATE institutions
                      SET region_code = COALESCE(region_code, ?),
                          type        = COALESCE(type, ?)
                    WHERE institution_id = ?""",
                (SEOUL_REGION_CODE, DISTRICT_TYPE, folder),
            )
            continue
        conn.execute(
            """INSERT INTO institutions
                   (institution_id, name_ko, giganlist_dir, stage, region_code, type)
               VALUES (?, ?, ?, 1, ?, ?)""",
            (folder, GIGANLIST_DISTRICT_NAMES[folder], f"corpus/institutions/{folder}",
             SEOUL_REGION_CODE, DISTRICT_TYPE),
        )
        seeded.append(folder)
    conn.commit()
    return seeded
