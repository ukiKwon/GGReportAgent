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
