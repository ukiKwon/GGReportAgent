"""원문 보관 — _raw/<source>/<host>/<공고번호>/{detail.html, meta.json, attachments/NN_<이름>}.

받은 바이트를 그대로 둔다. 추출 규칙을 고치면 이 원문만 다시 읽어 새 배치를 만든다(네트워크 없음).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

_UNSAFE = re.compile(r'[\x00-\x1f/\\:*?"<>|]')


def safe_name(name: str, limit: int = 100) -> str:
    base = _UNSAFE.sub("_", name.replace("\\", "/").split("/")[-1]).strip(". ")
    if not base:
        return "file"
    stem, dot, ext = base.rpartition(".")
    if dot and len(base) > limit:
        base = stem[: max(1, limit - len(ext) - 1)] + "." + ext
    return base[:limit]


class RawStore:
    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)

    def dir_for(self, source: str, host: str, number: str) -> Path:
        path = (self.root / safe_name(source) / safe_name(host) / safe_name(number)).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("원문 경로가 루트 밖입니다")
        return path

    def rel(self, path: Path) -> str:
        return path.resolve().relative_to(self.root.resolve()).as_posix()

    def write(self, source: str, host: str, number: str, detail: bytes,
              files: list[tuple[str, bytes]], meta: dict) -> Path:
        final = self.dir_for(source, host, number)
        tmp = final.parent / f".tmp-{final.name}"
        shutil.rmtree(tmp, ignore_errors=True)
        (tmp / "attachments").mkdir(parents=True)
        (tmp / "detail.html").write_bytes(detail)
        stored = []
        for i, (name, blob) in enumerate(files, 1):
            fname = f"{i:02d}_{safe_name(name)}"
            (tmp / "attachments" / fname).write_bytes(blob)
            stored.append({"name": name, "stored": f"attachments/{fname}",
                           "size": len(blob), "sha256": hashlib.sha256(blob).hexdigest()})
        meta = dict(meta, attachments=stored, detail_sha256=hashlib.sha256(detail).hexdigest())
        (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if final.exists():
            shutil.rmtree(final)
        tmp.rename(final)
        return final
