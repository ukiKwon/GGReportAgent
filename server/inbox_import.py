"""반입된 배치를 망 안 상태에 반영한다 — collector/SCHEMA.md §⑥의 2·4·5·6단계.

라우터가 아니라 여기에 로직을 둔다. 순수 함수라 HTTP 없이 단위 테스트할 수 있고,
corpus_validator.py ↔ routers/institutions.py와 같은 역할 분리다.

망 경계: 이 모듈은 **자기 파일시스템의 inbox만 읽는다.** 망 밖을 향한 요청도,
역방향 콜백도 만들지 않는다(SCHEMA.md §⑩-5).
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path

from server.bidcase_repository import upsert_bid_case_from_notice
from server.csv_import import parse_csv
from server.repository import find_id_by_name, upsert_institution
from contract.batch_schema import BATCH_ID_RE, validate_batch


class InboxBatchError(Exception):
    """반입 실패. status가 그대로 HTTP 상태 코드가 된다."""

    def __init__(self, status: int, detail) -> None:
        super().__init__(detail if isinstance(detail, str) else str(detail))
        self.status = status
        self.detail = detail


def resolve_batch_dir(batch_id: str, inbox_root: Path | str) -> Path:
    """batch_id 형식을 먼저 보고, 그 다음 실재를 본다.

    경로 문자열을 차단 목록으로 거르지 않고 **형식(허용 목록)** 으로 검사한다.
    BATCH_ID_RE는 / \\ .. : 를 애초에 허용하지 않으므로 경로 이탈이 구조적으로
    불가능하다 — 차단 목록보다 안전하다.
    """
    if not BATCH_ID_RE.match(batch_id or ""):
        raise InboxBatchError(400, f"batch_id 형식이 잘못됐습니다: {batch_id!r}")
    batch_dir = Path(inbox_root) / batch_id
    if not batch_dir.is_dir():
        raise InboxBatchError(404, f"inbox에 배치가 없습니다: {batch_id}")
    return batch_dir


def validate_inbox_batch(batch_id: str, inbox_root: Path | str) -> list[str]:
    """검사만 한다 — DB도 파일도 건드리지 않는다."""
    return validate_batch(resolve_batch_dir(batch_id, inbox_root))


def import_batch(
    conn: sqlite3.Connection,
    batch_id: str,
    *,
    inbox_root: Path | str,
    rfp_root: Path | str,
    batches_root: Path | str,
) -> dict:
    batch_dir = resolve_batch_dir(batch_id, inbox_root)

    errors = validate_batch(batch_dir)
    if errors:
        raise InboxBatchError(422, {"errors": errors})

    manifest = json.loads((batch_dir / "manifest.json").read_text(encoding="utf-8"))
    source_slug = manifest["source"]["slug"]
    records = manifest["records"]

    institution_ids, bid_cases = _apply_to_db(conn, batch_dir, source_slug, records)

    # ── 여기부터 파일 이동: 롤백이 없다 ──────────────────────────────────
    # DB를 먼저 커밋하고 파일을 나중에 옮긴다. 순서를 뒤집으면 DB 단계에서 실패했을 때
    # 배치는 이미 inbox에서 사라진 뒤라 되돌릴 수도 재시도할 수도 없다. 이 순서면
    # 파일 단계가 실패해도 배치가 inbox에 남아 사람이 고친 뒤 다시 부를 수 있고,
    # DB 단계는 upsert라 재실행이 안전하다.
    rfp_files = _move_attachments(conn, batch_dir, records, source_slug, rfp_root)
    archived_to = _archive_batch(batch_dir, batches_root, batch_id)

    return {
        "batch_id": batch_id,
        "imported_institutions": len(institution_ids),
        "institution_ids": institution_ids,
        "bid_cases": bid_cases,
        "rfp_files": rfp_files,
        "archived_to": archived_to,
    }


def _apply_to_db(
    conn: sqlite3.Connection, batch_dir: Path, source_slug: str, records: list[dict]
) -> tuple[list[str], dict]:
    """기관 upsert + 공고별 bid_case upsert를 한 트랜잭션으로 처리한다."""
    try:
        rows = parse_csv((batch_dir / "institutions.csv").read_bytes())
        institution_ids = [upsert_institution(conn, row, commit=False) for row in rows]

        bid_cases: dict[str, list[str]] = {"created": [], "updated": []}
        for index, record in enumerate(records):
            name_ko = (record.get("institution") or {}).get("name_ko")
            institution_id = find_id_by_name(conn, name_ko)
            if institution_id is None:
                # SCHEMA §④가 records[].institution.name_ko를 CSV '기관명'과 동일
                # 값으로 못박으므로, 못 찾는 것은 배치가 계약을 어긴 것이다. 조용히
                # 건너뛰면 일정 없는 유령 공고가 남는다.
                raise InboxBatchError(
                    422,
                    {"errors": [f"records[{index}]: CSV에 없는 기관명입니다 ({name_ko!r})"]},
                )
            bid_case_id, created = upsert_bid_case_from_notice(
                conn, institution_id, source_slug, record, commit=False
            )
            bid_cases["created" if created else "updated"].append(bid_case_id)
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return institution_ids, bid_cases


def _move_attachments(
    conn: sqlite3.Connection,
    batch_dir: Path,
    records: list[dict],
    source_slug: str,
    rfp_root: Path | str,
) -> list[dict]:
    """첨부를 corpus/rfp/로 옮기고, 공고당 첫 번째만 institutions.rfp_path에 남긴다.

    rfp_path는 단일 컬럼이고 SCHEMA §⑤도 "공고문 PDF"를 단수로 전제하므로, 나머지
    첨부는 파일만 옮긴다. 배치 안 파일명이 이미 {notice_id}_{원본파일명}이라
    (collector/batch.py) 이름을 새로 조립할 필요가 없다.
    """
    rfp_root = Path(rfp_root)
    moved: list[dict] = []
    for record in records:
        attachments = record.get("attachments") or []
        if not attachments:
            continue
        rfp_root.mkdir(parents=True, exist_ok=True)

        stored_paths = []
        for attachment in attachments:
            destination = rfp_root / Path(attachment).name
            # 같은 공고의 재수집이므로 나중 배치가 이긴다 — 덮어쓴다.
            destination.unlink(missing_ok=True)
            shutil.move(str(batch_dir / attachment), str(destination))
            stored_paths.append(destination)

        institution_id = find_id_by_name(
            conn, (record.get("institution") or {}).get("name_ko")
        )
        rfp_path = _repo_relative(stored_paths[0])
        conn.execute(
            "UPDATE institutions SET rfp_path = ? WHERE institution_id = ?",
            (rfp_path, institution_id),
        )
        moved.append({"institution_id": institution_id, "rfp_path": rfp_path})
    conn.commit()
    return moved


def _archive_batch(batch_dir: Path, batches_root: Path | str, batch_id: str) -> str:
    """처리된 배치를 inbox 밖으로 치운다 — 그래야 inbox가 "미처리만"이 된다.

    지우지 않는 이유는 evidence.url과 수집 시각이 반입 근거라 감사에 필요하기 때문이다.
    """
    batches_root = Path(batches_root)
    batches_root.mkdir(parents=True, exist_ok=True)
    destination = batches_root / batch_id
    if destination.exists():
        shutil.rmtree(destination)
    shutil.move(str(batch_dir), str(destination))
    return _repo_relative(destination)


def _repo_relative(path: Path) -> str:
    """리포 안이면 상대경로로, 밖(테스트의 tmp_path 등)이면 그대로 돌려준다."""
    repo_root = Path(__file__).resolve().parents[1]
    resolved = path.resolve()
    if resolved.is_relative_to(repo_root):
        return resolved.relative_to(repo_root).as_posix()
    return resolved.as_posix()
