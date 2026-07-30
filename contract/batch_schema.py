"""배치 폴더가 collector/SCHEMA.md v1을 지키는지 검사한다.

**중립 계약 모듈이다** — 망 밖(collector)과 망 안(backend)이 같은 검증기를 쓴다.
따로 만들면 SCHEMA v2 때 두 곳을 고쳐야 하는 "두 개의 진실"이 생기고, backend가
collector를 import하면 폐쇄망 배포에 DMZ FastAPI 앱이 딸려온다. 그래서 어느 쪽도
아닌 자리에 둔다.

그 대가로 이 모듈은 **표준 라이브러리만** 쓰고 backend·agent·collector 어느 것도
import하지 않는다. 순수 형식 파서라 네트워크 경로를 만들지 않는다 — 양쪽이 같은
JSON 라이브러리를 쓰는 것과 같은 성격이다.

실패는 예외가 아니라 메시지 목록으로 돌려준다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

SUPPORTED_SCHEMA_VERSIONS = (1,)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BATCH_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{4}_[a-z0-9-]+$")
CONFIDENCE_VALUES = ("확정", "예상")
REQUIRED_RECORD_FIELDS = ("notice_id", "title", "institution", "evidence")


def validate_batch(batch_dir: Path | str) -> list[str]:
    """오류 메시지 목록을 돌려준다. 빈 목록이면 통과."""
    batch_dir = Path(batch_dir)
    errors: list[str] = []

    if not batch_dir.is_dir():
        return [f"배치 디렉터리가 아닙니다: {batch_dir}"]

    manifest_path = batch_dir / "manifest.json"
    if not manifest_path.is_file():
        return ["manifest.json이 없습니다"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return [f"manifest.json을 읽을 수 없습니다: {exc}"]

    version = manifest.get("schema_version")
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        # 상위 버전은 조용히 부분 처리하지 않는다 (SCHEMA.md §⑨)
        return [f"지원하지 않는 schema_version입니다: {version!r}"]

    batch_id = manifest.get("batch_id")
    if not isinstance(batch_id, str) or not BATCH_ID_RE.match(batch_id or ""):
        errors.append(f"batch_id 형식이 잘못됐습니다: {batch_id!r}")
    elif batch_id != batch_dir.name:
        errors.append(f"batch_id({batch_id})와 폴더명({batch_dir.name})이 다릅니다")

    if not manifest.get("collected_at"):
        errors.append("collected_at이 없습니다")

    source = manifest.get("source") or {}
    if not source.get("slug"):
        errors.append("source.slug이 없습니다")

    if not (batch_dir / "institutions.csv").is_file():
        errors.append("institutions.csv가 없습니다")

    records = manifest.get("records")
    if not isinstance(records, list):
        return errors + ["records가 배열이 아닙니다"]

    seen: set[str] = set()
    for index, record in enumerate(records):
        errors.extend(_validate_record(record, index, batch_dir, seen))
    return errors


def _validate_record(record, index: int, batch_dir: Path, seen: set[str]) -> list[str]:
    where = f"records[{index}]"
    if not isinstance(record, dict):
        return [f"{where}: 객체가 아닙니다"]

    errors: list[str] = []
    for name in REQUIRED_RECORD_FIELDS:
        if not record.get(name):
            errors.append(f"{where}.{name}이(가) 없습니다")

    notice_id = record.get("notice_id")
    if isinstance(notice_id, str):
        if notice_id in seen:
            errors.append(f"{where}: notice_id가 중복입니다 ({notice_id})")
        seen.add(notice_id)

    institution = record.get("institution") or {}
    if isinstance(institution, dict) and not institution.get("name_ko"):
        errors.append(f"{where}.institution.name_ko가 없습니다")

    schedule = record.get("schedule") or {}
    if isinstance(schedule, dict):
        for key in ("posted_at", "deadline_at", "contract_end", "last_bid"):
            value = schedule.get(key)
            if value is not None and not DATE_RE.match(str(value)):
                errors.append(f"{where}.schedule.{key}: YYYY-MM-DD가 아닙니다 ({value!r})")
        confidence = schedule.get("confidence")
        if confidence is not None and confidence not in CONFIDENCE_VALUES:
            errors.append(f"{where}.schedule.confidence: 허용값이 아닙니다 ({confidence!r})")

    for attachment in record.get("attachments") or []:
        errors.extend(_validate_attachment(attachment, where, batch_dir))
    return errors


def _validate_attachment(attachment, where: str, batch_dir: Path) -> list[str]:
    if not isinstance(attachment, str):
        return [f"{where}.attachments: 문자열 경로여야 합니다"]
    if attachment.startswith("/") or re.match(r"^[A-Za-z]:", attachment):
        return [f"{where}.attachments: 절대경로는 허용되지 않습니다 ({attachment})"]
    if ".." in Path(attachment).parts:
        return [f"{where}.attachments: 상위 경로 참조는 허용되지 않습니다 ({attachment})"]
    if not attachment.startswith("files/"):
        return [f"{where}.attachments: files/ 아래여야 합니다 ({attachment})"]
    if not (batch_dir / attachment).is_file():
        return [f"{where}.attachments: 파일이 없습니다 ({attachment})"]
    return []
