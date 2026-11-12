"""원문 보관 — _raw/<source>/<host>/<공고번호>/{detail.html, meta.json, attachments/NN_<이름>}.

받은 바이트를 그대로 둔다. 추출 규칙을 고치면 이 원문만 다시 읽어 새 배치를 만든다(네트워크 없음).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
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



def _restore(final: Path, bak: Path) -> None:
    """교체 실패 시 .bak을 제자리로. 복구 자체가 실패하면 .bak을 남겨 다음 실행이 복구한다."""
    try:
        if bak.exists() and not final.exists():
            bak.rename(final)
    except OSError:
        pass


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
        # 기존 원문은 지우지 않고 .bak으로 옮겼다가, 새 폴더가 자리 잡은 뒤에만 지운다(중간에 실패해도 원문이 남는다).
        bak = final.parent / f".bak-{final.name}"
        if bak.exists():                      # 이전 실행이 교체 도중 끊긴 흔적
            if final.exists():
                for wait in (0.0, 0.5, 1.0):  # Windows 백신·색인이 잡은 파일은 잠깐 뒤 지워진다
                    time.sleep(wait)
                    shutil.rmtree(bak, ignore_errors=True)
                    if not bak.exists():
                        break
                else:
                    raise OSError(f"이전 교체 잔여물을 지울 수 없습니다({bak.name}) — 수동 삭제 필요")
            else:
                bak.rename(final)             # 원문 복구 뒤 아래에서 정상 교체
        # Windows: 방금 쓴 파일을 백신·색인이 잠깐 잡으면 rename이 거부된다(WinError 5) — 잠시 뒤 다시 시도.
        for attempt in range(6):
            try:
                if final.exists():
                    final.rename(bak)
                tmp.rename(final)
            except OSError as exc:
                _restore(final, bak)
                if isinstance(exc, PermissionError) and attempt < 5:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise
            shutil.rmtree(bak, ignore_errors=True)
            return final
