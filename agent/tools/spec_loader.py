import os


def list_known_institutions(giganlist_dir: str) -> list[str]:
    if not os.path.isdir(giganlist_dir):
        return []
    return sorted(
        name for name in os.listdir(giganlist_dir)
        if os.path.isdir(os.path.join(giganlist_dir, name))
    )


def load_institution_files(giganlist_dir: str, institution_folder: str) -> dict:
    base = os.path.join(giganlist_dir, institution_folder)
    spec_dir = os.path.join(base, "spec")
    plan_dir = os.path.join(base, "plan")

    def _read_all(d):
        if not os.path.isdir(d):
            return {}
        return {
            fname: open(os.path.join(d, fname), encoding="utf-8").read()
            for fname in sorted(os.listdir(d))
            if fname.endswith(".txt")
        }

    bank_ideas_path = os.path.join(base, "bank_ideas_draft.txt")
    bank_ideas = None
    if os.path.isfile(bank_ideas_path):
        bank_ideas = open(bank_ideas_path, encoding="utf-8").read()

    return {
        "spec_files": _read_all(spec_dir),
        "plan_files": _read_all(plan_dir),
        "bank_ideas": bank_ideas,
    }


def find_archive_pptx(archive_dir: str, institution_name: str) -> str | None:
    """그 기관의 **가장 최근** 아카이브 제안서. 없으면 None.

    M-1: 예전에는 `archive_dir` 바로 아래만 훑고 **파일 이름**에 기관명이 들어
    있기를 기대했다. 그런데 실제 배치는 `server/archive.py`가
    `{뿌리}/{기관명}/{날짜}/제안서.pptx`로 두 단계 더 들어가 만든다 — 기관명은
    **폴더 이름**이고 파일은 그냥 `제안서.pptx`다. 즉 이 함수는 아카이브가
    쌓여 있어도 **한 번도 찾지 못했다**(예외도 없이 조용히 "이전 제안서 없음").

    그래서 ⓐ재귀로 훑고 ⓑ기관명을 **경로 전체**에서 찾는다.

    정렬은 `reverse=True`로 **최근 것이 먼저** 오게 한다. 날짜 폴더가
    `YYYY-MM-DD`라 사전순 = 시간순이고, 예전 코드처럼 오름차순으로 첫 번째를
    고르면 **가장 오래된 회차**를 재활용하게 된다.
    """
    if not os.path.isdir(archive_dir):
        return None
    root_abs = os.path.abspath(archive_dir)
    for dirpath, dirnames, filenames in os.walk(archive_dir):
        dirnames.sort(reverse=True)
        for fname in sorted(filenames, reverse=True):
            if not fname.lower().endswith(".pptx"):
                continue
            full = os.path.join(dirpath, fname)
            # 기관명은 파일명에 있을 수도(옛 평면 배치), 폴더명에 있을 수도 있다.
            rel = os.path.relpath(os.path.abspath(full), root_abs)
            if institution_name in rel:
                return full
    return None
