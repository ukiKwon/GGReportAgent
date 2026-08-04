"""데모 환경은 운영 자료와 파일이 갈려 있어야 한다 — 그게 분리의 전부다."""

import backend.demo as demo
from backend.demo_paths import DEMO_ARTIFACTS, DEMO_DB_PATH, DEMO_OUTPUT_ROOT


def test_demo_paths_never_collide_with_production():
    """운영 경로와 한 글자라도 겹치면 분리가 무의미해진다."""
    assert DEMO_DB_PATH != "data/registry.db"
    assert DEMO_OUTPUT_ROOT != "data/report_new"
    assert len(set(DEMO_ARTIFACTS)) == len(DEMO_ARTIFACTS)
    for rel in DEMO_ARTIFACTS:
        assert rel.startswith("data/")          # gitignore 대상 안에 있어야 커밋되지 않는다


def test_demo_seed_defaults_to_demo_db_not_registry():
    """`--db` 없이 demo_seed를 돌려도 운영 DB로 가면 안 된다."""
    import backend.demo_seed as demo_seed

    assert demo_seed.DEMO_DB_PATH == DEMO_DB_PATH
    assert demo_seed.DEMO_OUTPUT_ROOT == DEMO_OUTPUT_ROOT


def test_build_app_and_reset_use_demo_paths_only(tmp_path, monkeypatch):
    """앱이 데모 경로로 뜨고, reset이 그 경로만 지우는지 실제로 확인한다."""
    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    (tmp_path / "dashboard").mkdir()
    (tmp_path / "corpus" / "institutions" / "dobong").mkdir(parents=True)
    # 운영 자료가 옆에 있어도 건드리지 않는다는 것을 보이기 위한 미끼
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "registry.db").write_bytes(b"production")

    app, name_ko = demo.build_app("dobong", 9)
    assert name_ko == "도봉구"
    assert app.state.db_path == str(tmp_path / DEMO_DB_PATH)
    assert app.state.output_root == str(tmp_path / DEMO_OUTPUT_ROOT)
    assert (tmp_path / DEMO_DB_PATH).is_file()
    assert (tmp_path / DEMO_OUTPUT_ROOT / "도봉구" / "rfp_scoring.json").is_file()

    removed = demo.reset()
    assert DEMO_DB_PATH in removed and DEMO_OUTPUT_ROOT in removed
    assert not (tmp_path / DEMO_DB_PATH).exists()
    # 운영 파일은 그대로다
    assert (tmp_path / "data" / "registry.db").read_bytes() == b"production"


def test_reset_is_safe_when_nothing_exists(tmp_path, monkeypatch):
    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    assert demo.reset() == []


# ── 검색 인덱스 분리 (계획 F) ────────────────────────────────────────────
# 데모에서 완료 처리를 하면 서버가 아카이브를 자동 색인한다. 인덱스를 공유하면
# 데모 산출물이 **운영 검색 결과에 섞인다** — 파일 삭제 한 번으로 지워져야 한다는
# 분리 원칙이 검색에도 적용돼야 한다.


def test_데모_인덱스는_운영_인덱스와_다른_파일이다():
    from backend.demo_paths import DEMO_INDEX_DB_PATH, SOURCE_INDEX_DB_PATH

    assert DEMO_INDEX_DB_PATH != SOURCE_INDEX_DB_PATH
    assert DEMO_INDEX_DB_PATH in DEMO_ARTIFACTS      # --reset이 함께 지운다


def test_앱이_데모_인덱스를_본다(tmp_path, monkeypatch):
    from backend.demo_paths import DEMO_INDEX_DB_PATH

    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    (tmp_path / "dashboard").mkdir()
    (tmp_path / "corpus" / "institutions" / "dobong").mkdir(parents=True)

    app, _ = demo.build_app("dobong", 9)

    assert app.state.index_db_path == str(tmp_path / DEMO_INDEX_DB_PATH)


def test_운영_인덱스를_복사해_데모_인덱스를_만든다(tmp_path, monkeypatch):
    """새로 빌드하면 1시간이다 — 내용이 같으므로 복사가 정확하고 즉시 끝난다."""
    from backend.demo_paths import DEMO_INDEX_DB_PATH, SOURCE_INDEX_DB_PATH

    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    (tmp_path / "data").mkdir()
    (tmp_path / SOURCE_INDEX_DB_PATH).write_bytes(b"index-v1")

    assert demo.build_demo_index() == str(tmp_path / DEMO_INDEX_DB_PATH)
    assert (tmp_path / DEMO_INDEX_DB_PATH).read_bytes() == b"index-v1"


def test_운영_인덱스가_새로우면_다시_복사한다(tmp_path, monkeypatch):
    """데모가 옛 코퍼스를 보고 있으면 화면 확인이 어긋난다."""
    import os
    import time
    from backend.demo_paths import DEMO_INDEX_DB_PATH, SOURCE_INDEX_DB_PATH

    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    (tmp_path / "data").mkdir()
    (tmp_path / SOURCE_INDEX_DB_PATH).write_bytes(b"index-v1")
    demo.build_demo_index()

    time.sleep(0.01)
    (tmp_path / SOURCE_INDEX_DB_PATH).write_bytes(b"index-v2")
    os.utime(tmp_path / SOURCE_INDEX_DB_PATH, None)
    demo.build_demo_index()

    assert (tmp_path / DEMO_INDEX_DB_PATH).read_bytes() == b"index-v2"


def test_운영_인덱스가_없으면_None이고_죽지_않는다(tmp_path, monkeypatch):
    """인덱스가 아직 없는 새 설치 — 데모는 떠야 하고 지식 탭이 빌드 안내를 띄운다."""
    monkeypatch.setattr(demo, "REPO_ROOT", tmp_path)
    assert demo.build_demo_index() is None
