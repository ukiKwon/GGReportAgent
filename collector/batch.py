"""배치 생성기 — collector/SCHEMA.md v1을 실행 가능한 형태로 강제하는 유일한 지점.

manifest.json이 권위이고 institutions.csv는 그로부터 파생된다(SCHEMA.md §③).
쓰기가 끝나면 자기검사하고, 실패하면 배치를 남기지 않는다 — 반쯤 만들어진 배치가
inbox로 흘러가지 않게 한다(설계 §⑦-5).
"""

from __future__ import annotations

import csv
import datetime
import io
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from collector.schema import validate_batch
from collector.sources.base import CollectedNotice, Source

SCHEMA_VERSION = 1
DEFAULT_OUT_ROOT = "data/collector"
COLLECTOR_VERSION = "0.1.0"

CSV_HEADERS = [
    "기관명", "기관구분", "지역코드", "구시군코드", "입찰주기", "지난입찰일",
    "입찰예상일", "확정여부", "경도", "위도", "출처", "수정일",
]
UNSAFE_FILENAME = re.compile(r"[/\\\x00]")


class BatchError(Exception):
    pass


@dataclass(frozen=True)
class BatchResult:
    batch_id: str
    path: Path
    record_count: int


def write_batch(
    source: Source,
    notices: list[CollectedNotice],
    out_root: Path | str = DEFAULT_OUT_ROOT,
    now: datetime.datetime | None = None,
) -> BatchResult:
    now = now or datetime.datetime.now().astimezone()
    batch_id = f"{now:%Y-%m-%d_%H%M}_{source.slug}"
    batch_dir = Path(out_root) / batch_id
    if batch_dir.exists():
        raise BatchError(f"같은 batch_id가 이미 있습니다: {batch_id}")

    (batch_dir / "files").mkdir(parents=True)
    try:
        records = [_write_record(notice, batch_dir) for notice in notices]
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "batch_id": batch_id,
            "collected_at": now.isoformat(timespec="seconds"),
            "source": {
                "slug": source.slug,
                "name_ko": source.name_ko,
                "base_url": source.base_url,
                "collector_version": COLLECTOR_VERSION,
            },
            "records": records,
        }
        # manifest는 UTF-8, BOM 없음 (SCHEMA.md §④)
        (batch_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        # CSV는 UTF-8 with BOM (SCHEMA.md §③)
        (batch_dir / "institutions.csv").write_text(
            build_csv(records, collected_at=manifest["collected_at"]),
            encoding="utf-8-sig",
            newline="",
        )

        errors = validate_batch(batch_dir)
        if errors:
            raise BatchError("배치 자기검사 실패: " + "; ".join(errors))
    except Exception:
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise

    return BatchResult(batch_id=batch_id, path=batch_dir, record_count=len(records))


def _write_record(notice: CollectedNotice, batch_dir: Path) -> dict:
    attachments = []
    for attachment in notice.attachments:
        if UNSAFE_FILENAME.search(attachment.filename) or ".." in Path(attachment.filename).parts:
            raise BatchError(f"첨부 파일명이 안전하지 않습니다: {attachment.filename!r}")
        stored = f"{notice.notice_id}_{attachment.filename}"
        (batch_dir / "files" / stored).write_bytes(attachment.data)
        attachments.append(f"files/{stored}")

    schedule = {
        "posted_at": notice.posted_at,
        "deadline_at": notice.deadline_at,
        "contract_end": notice.contract_end,
        "last_bid": notice.last_bid,
        "term": notice.term,
        "confidence": "확정" if notice.confirmed else "예상",
    }
    return {
        "notice_id": notice.notice_id,
        "title": notice.title,
        "institution": _drop_empty(
            {
                "name_ko": notice.institution_name_ko,
                "type": notice.institution_type,
                "region_code": notice.region_code,
                "sub_region_code": notice.sub_region_code,
            }
        ),
        "schedule": _drop_empty(schedule),
        "attachments": attachments,
        "evidence": {"url": notice.evidence_url},
    }


def _drop_empty(mapping: dict) -> dict:
    """모르는 값은 키를 생략한다 — 빈 문자열은 쓰지 않는다 (SCHEMA.md §④)."""
    return {k: v for k, v in mapping.items() if v is not None}


def build_csv(records: list[dict], collected_at: str) -> str:
    """manifest 레코드 → 12열 CSV. 기관당 1행으로 합친다 (SCHEMA.md §③)."""
    merged: dict[str, dict] = {}
    for record in records:
        institution = record.get("institution", {})
        name = institution.get("name_ko", "")
        schedule = record.get("schedule", {})
        candidate = {
            "institution": institution,
            "schedule": schedule,
            "urls": [record.get("evidence", {}).get("url", "")],
        }
        if name not in merged:
            merged[name] = candidate
            continue

        current = merged[name]
        current["urls"].extend(candidate["urls"])
        if _wins(candidate["schedule"], current["schedule"]):
            current["institution"] = institution
            current["schedule"] = schedule

    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_HEADERS)
    for name, entry in merged.items():
        institution, schedule = entry["institution"], entry["schedule"]
        writer.writerow(
            [
                name,
                institution.get("type", ""),
                institution.get("region_code", ""),
                institution.get("sub_region_code", ""),
                schedule.get("term", ""),
                schedule.get("last_bid", ""),
                schedule.get("contract_end", ""),
                "y" if schedule.get("confidence") == "확정" else "",
                "",  # 경도 — 수집기는 좌표를 만들지 않는다
                "",  # 위도
                ";".join(u for u in entry["urls"] if u),
                collected_at[:10],
            ]
        )
    return buffer.getvalue()


def _wins(candidate: dict, current: dict) -> bool:
    """확정이 예상을 이기고, 동률이면 posted_at이 최신인 쪽이 이긴다."""
    cand_confirmed = candidate.get("confidence") == "확정"
    curr_confirmed = current.get("confidence") == "확정"
    if cand_confirmed != curr_confirmed:
        return cand_confirmed
    return (candidate.get("posted_at") or "") > (current.get("posted_at") or "")
