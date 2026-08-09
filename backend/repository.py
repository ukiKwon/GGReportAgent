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
    # 예전 DB에는 `scoring_table` 컬럼이 남아 있다(2026-08-06에 뺐지만 SQLite라
    # 기존 파일에서 지우지 않았다 — 아래 backend/db.py 주석 참고). `SELECT *`가
    # 그 값을 실어 오는데, pydantic이 모델에 없는 키를 무시하므로 그냥 넘어간다.
    return Institution(**dict(row))


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

    return _insert_institution(conn, row, commit=commit)


def _insert_institution(
    conn: sqlite3.Connection, row: InstitutionImportRow, commit: bool = True
) -> str:
    """새 행 하나를 넣고 발급한 id를 돌려준다. 중복 검사는 호출부의 몫이다."""
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


def create_institution(
    conn: sqlite3.Connection, row: InstitutionImportRow, commit: bool = True
) -> str | None:
    """기관 1건을 **새로** 만든다. 이름이 이미 있으면 아무것도 하지 않고 None.

    `upsert_institution`(CSV 반입)과 갈라지는 지점은 중복 처리 하나다 — 반입은 같은 표를
    다시 올리는 것이 정상이라 갱신하지만, 손으로 누르는 '기관 추가'에서 같은 이름은
    거의 언제나 오타나 중복 등록이라 만들지 않고 호출부가 409로 알린다.
    """
    if find_id_by_name(conn, row.name_ko) is not None:
        return None
    return _insert_institution(conn, row, commit=commit)


def update_institution(
    conn: sqlite3.Connection, institution_id: str, upd: InstitutionUpdateIn
) -> Institution | None:
    """부분 갱신: **본문에 실제로 담겨 온 필드만** 갱신한다.

    없는 기관이면 None을 반환한다.
    stage 같은 워크플로 필드는 모델에 없어서 자동 무시된다.

    B 이월 해소 — 예전에는 `COALESCE(?, 기존값)`이라 **NULL과 "미전송"을 같은 것으로
    취급**했다. 그래서 `term`(숫자)은 한 번 넣으면 **비울 방법이 아예 없었고**,
    문자열은 `""`를 보내면 비워지는 비대칭이 있었다. `model_fields_set`(pydantic의
    `exclude_unset`)으로 둘을 구분하면 `{"term": null}` = 지움, `{}` = 보존이 된다.
    """
    if get_institution(conn, institution_id) is None:
        return None
    values = upd.model_dump(exclude_unset=True)
    # 빈 문자열은 **지움**으로 본다. 이 필드들에 진짜 빈 문자열은 의미가 없고,
    # 화면에서 입력칸을 비운 것이 곧 지우려는 뜻이다(위의 비대칭을 여기서 없앤다).
    for key in ("region_code", "type", "contract_end", "last_bid"):
        if values.get(key) == "":
            values[key] = None
    # 컬럼명을 SQL에 직접 넣으므로 모델이 정의한 필드인지 확인한다 —
    # 지금은 pydantic이 걸러주지만, 검사를 여기 붙여 두면 모델이 바뀌어도 안전하다.
    unknown = set(values) - set(InstitutionUpdateIn.model_fields)
    if unknown:
        raise ValueError(f"알 수 없는 필드: {sorted(unknown)}")
    if not values:
        return get_institution(conn, institution_id)   # 보낸 것이 없으면 그대로 둔다
    assignments = ", ".join(f"{key} = ?" for key in values)
    conn.execute(
        f"UPDATE institutions SET {assignments} WHERE institution_id = ?",
        (*values.values(), institution_id),
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
