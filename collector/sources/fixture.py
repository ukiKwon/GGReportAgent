"""로컬 JSON 픽스처 소스 — 실사이트 어댑터는 범위 밖(설계 §⑨)이라 v1의 기본값.

수집 파이프라인 전체(배치 생성 → 브리지 → 반입)를 네트워크 없이 돌려보기 위한 것이다.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from collector.sources.base import (
    AttachmentRef,
    CollectedNotice,
    SourceError,
    register,
)

DEFAULT_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample_notices.json"


class FixtureSource:
    slug = "fixture"
    name_ko = "로컬 픽스처"
    base_url = "file://fixture"

    def __init__(self, path: Path | str = DEFAULT_FIXTURE) -> None:
        self.path = Path(path)

    def fetch(self) -> list[CollectedNotice]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise SourceError(f"픽스처 파일이 없습니다: {self.path}") from exc
        except json.JSONDecodeError as exc:
            raise SourceError(f"픽스처 JSON 파싱 실패: {exc}") from exc

        if not isinstance(raw, list):
            raise SourceError("픽스처 최상위는 레코드 배열이어야 합니다")
        return [_to_notice(item) for item in raw]


def _to_notice(item: dict) -> CollectedNotice:
    attachments = tuple(
        AttachmentRef(
            filename=a["filename"],
            data=base64.b64decode(a["data_base64"]) if "data_base64" in a
            else a.get("text", "").encode("utf-8"),
        )
        for a in item.get("attachments", [])
    )
    known = {
        "notice_id", "title", "institution_name_ko", "evidence_url", "posted_at",
        "deadline_at", "contract_end", "last_bid", "term", "confirmed",
        "institution_type", "region_code", "sub_region_code",
    }
    fields = {k: v for k, v in item.items() if k in known}
    return CollectedNotice(attachments=attachments, **fields)


register(FixtureSource())
