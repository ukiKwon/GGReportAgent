"""증분 상태 — 이미 본 공고(출처+호스트+공고번호)와 실행 기록. JSON, 원자적 저장."""

from __future__ import annotations

import json
import os
from pathlib import Path

STATE_VERSION = 1
MAX_RUNS = 50


class StateError(Exception):
    pass


class _Index:
    def __init__(self, state: "State", slug: str) -> None:
        self._state, self._slug = state, slug

    def is_seen(self, key: str) -> bool:
        return self._state.is_seen(self._slug, key)


class State:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.data: dict = {"version": STATE_VERSION, "sources": {}}
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise StateError(f"상태 파일을 읽을 수 없습니다: {self.path.name}") from exc
            if data.get("version") != STATE_VERSION or not isinstance(data.get("sources"), dict):
                raise StateError(f"지원하지 않는 상태 형식: version={data.get('version')!r}")
            self.data = data

    def _src(self, slug: str) -> dict:
        return self.data["sources"].setdefault(slug, {"seen": {}, "runs": []})

    def index(self, slug: str) -> _Index:
        return _Index(self, slug)

    def is_seen(self, slug: str, key: str) -> bool:
        return key in self._src(slug)["seen"]

    def mark_seen(self, slug: str, key: str, **info) -> None:
        self._src(slug)["seen"][key] = info

    def set_batch(self, slug: str, key: str, batch_id: str) -> None:
        self._src(slug)["seen"][key]["batch_id"] = batch_id

    def with_raw(self, slug: str, include_packed: bool) -> list[tuple[str, dict]]:
        return sorted((k, v) for k, v in self._src(slug)["seen"].items()
                      if v.get("raw") and (include_packed or not v.get("batch_id")))

    def add_run(self, slug: str, run: dict) -> None:
        runs = self._src(slug)["runs"]
        runs.append(run)
        del runs[:-MAX_RUNS]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_file():                 # 직전 상태 1개를 .bak로 남긴다(손상 시 복구용)
            try:
                os.replace(self.path, self.path.with_suffix(".bak"))
            except OSError:
                pass
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)
