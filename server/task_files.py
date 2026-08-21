"""디자이너 작업물 파일 보관 — 계획 H Task 4.

**클라이언트가 준 파일명으로 디스크에 쓰는 코드**라, 경로 위생을 순수 함수로 떼어
따로 고정한다(`server/tests/test_task_files.py`). 방어는 세 겹이다:

1. `safe_name` — 경로 성분을 떼고 확장자 허용목록으로 거른다.
2. `task_dir` — 조립한 경로가 `output_root` **안쪽**인지 `commonpath`로 확인한다
   (`server/archive.py`의 M-4 가드, `server/routers/documents.py`의 열람 가드와
   같은 방식). 기관명은 DB에서 오지만 반입 경로가 있으므로 신뢰하지 않는다.
3. `MAX_BYTES` — 폐쇄망이라도 디스크는 유한하다.

저장 위치는 `{output_root}/{기관명}/design/{task_id}/`다. `task_id`로 한 겹 더
내려가는 이유: 한 기관이 여러 bid_case를 가질 수 있어(1:N — OrchestratorService
참고), 기관 밑에 바로 두면 다른 공고의 작업물과 섞인다.
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone

# 디자이너 산출물로 실제로 오갈 것들만. 실행파일이 공유 폴더에 쌓이면 안 된다.
ALLOWED_EXTS = (".pptx", ".ppt", ".pdf", ".png", ".jpg", ".jpeg", ".zip")
MAX_BYTES = 50 * 1024 * 1024
DESIGN_DIRNAME = "design"


class FileRejected(Exception):
    """사람이 읽고 바로 고칠 수 있는 사유를 담는다."""


def safe_name(filename: str) -> str:
    """경로 성분을 떼고 확장자를 검사한 파일명. 문제가 있으면 FileRejected.

    `os.path.basename`만 쓰지 않는 이유: POSIX에서는 역슬래시가 경로 구분자가 아니라
    `"C:\\x\\a.pptx"`가 통째로 파일명이 된다. 두 구분자를 모두 잘라야 플랫폼과
    무관하게 같은 결과가 나온다.
    """
    raw = (filename or "").replace("\\", "/").split("/")[-1].strip()
    if not raw or raw in (".", ".."):
        raise FileRejected("파일명이 비어 있습니다")
    if raw.startswith("."):
        # 숨김파일은 화면 목록에서 눈에 안 띄어 남아 있는 줄도 모르게 된다.
        raise FileRejected(f"'.'으로 시작하는 파일은 올릴 수 없습니다: {raw}")

    ext = os.path.splitext(raw)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise FileRejected(
            f"올릴 수 없는 형식입니다({ext or '확장자 없음'}) — "
            f"가능한 형식: {', '.join(ALLOWED_EXTS)}"
        )
    return raw


def _plain_segment(value: str, label: str) -> str:
    """경로 조각 하나로 쓸 수 있는지 본다 — 구분자도 `..`도 없어야 한다.

    `commonpath` 하나로는 부족하다. `task_id`가 `../..`이면 최종 경로가
    `output_root` **안쪽**에 떨어져(다른 기관 폴더 등) 가드를 통과하면서도 제 자리를
    벗어난다. 조각을 먼저 막고, 조립 결과를 다시 확인하는 두 겹으로 간다.
    """
    text = (value or "").strip()
    if not text or text in (".", ".."):
        raise ValueError(f"{label}이(가) 비어 있거나 올바르지 않습니다: {value!r}")
    if "/" in text or "\\" in text or os.sep in text:
        raise ValueError(f"{label}에 경로 구분자를 쓸 수 없습니다: {value!r}")
    return text


def task_dir(output_root: str, institution_name: str, task_id: str) -> str:
    """작업물 폴더의 절대경로. 제 자리를 벗어나면 ValueError."""
    name = _plain_segment(institution_name, "기관명")
    tid = _plain_segment(task_id, "task_id")
    root_abs = os.path.abspath(output_root)
    target = os.path.abspath(os.path.join(root_abs, name, DESIGN_DIRNAME, tid))
    # 두 번째 그물 — 조각 검사를 빠져나간 무엇이 있어도 뿌리 밖으로는 못 나간다.
    if os.path.commonpath([root_abs, target]) != root_abs:
        raise ValueError(
            f"작업물 경로가 뿌리를 벗어납니다: {institution_name!r} / {task_id!r}"
        )
    return target


def _entry(path: str, name: str) -> dict:
    stat = os.stat(path)
    return {
        "name": name,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }


def save(output_root: str, institution_name: str, task_id: str,
         filename: str, data: bytes) -> dict:
    """저장하고 그 결과를 돌려준다. 같은 이름이면 덮어쓰되 `replaced`로 알린다.

    덮어쓰기를 허용하는 이유: 디자이너가 수정본을 같은 이름으로 다시 올리는 것이
    자연스러운 흐름이다. 다만 **조용히** 덮어쓰지는 않는다.
    """
    if len(data) > MAX_BYTES:
        raise FileRejected(
            f"파일이 너무 큽니다({len(data) / 1024 / 1024:.1f}MB) — "
            f"{MAX_BYTES // 1024 // 1024}MB까지 올릴 수 있습니다"
        )
    name = safe_name(filename)
    directory = task_dir(output_root, institution_name, task_id)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, name)
    replaced = os.path.isfile(path)
    with open(path, "wb") as f:
        f.write(data)
    return {**_entry(path, name), "replaced": replaced}


def listing(output_root: str, institution_name: str, task_id: str) -> list[dict]:
    """올라온 파일 목록(이름순). 폴더가 없으면 빈 목록 — 없는 것은 오류가 아니다."""
    directory = task_dir(output_root, institution_name, task_id)
    if not os.path.isdir(directory):
        return []
    rows = []
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            rows.append(_entry(path, name))
    return rows


def count(output_root: str, institution_name: str, task_id: str) -> int:
    return len(listing(output_root, institution_name, task_id))


def resolve(output_root: str, institution_name: str, task_id: str, name: str) -> str:
    """내려받기용 실제 경로. 이름은 저장 때와 **같은 규칙**으로 다시 씻는다."""
    clean = safe_name(name)
    return os.path.join(task_dir(output_root, institution_name, task_id), clean)


def remove(output_root: str, institution_name: str, task_id: str, name: str) -> bool:
    """지웠으면 True, 원래 없었으면 False."""
    path = resolve(output_root, institution_name, task_id, name)
    if not os.path.isfile(path):
        return False
    os.remove(path)
    return True


def drop_task_dir(output_root: str, institution_name: str, task_id: str) -> None:
    """작업물 폴더 통째로 삭제 — 테스트·데모 정리용."""
    shutil.rmtree(task_dir(output_root, institution_name, task_id), ignore_errors=True)
