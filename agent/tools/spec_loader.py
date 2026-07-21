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
    if not os.path.isdir(archive_dir):
        return None
    for fname in sorted(os.listdir(archive_dir)):
        if fname.endswith(".pptx") and institution_name in fname:
            return os.path.join(archive_dir, fname)
    return None
