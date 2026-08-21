"""완료 후 지식 인덱스 자동 갱신 (계획 F Task 5, 스펙 §② 17).

핵심은 두 가지다 — ⓐ 아카이브물이 **실제로 검색되는가**, ⓑ 재색인이 실패해도
**완료 처리는 되돌아가지 않는가**.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from agent.retrieval import build_index, search
from agent.retrieval import embedder
from server.main import create_app
from server.reindex_service import institution_name_map, reindex_archive


@pytest.fixture(autouse=True)
def fake_embed(monkeypatch):
    """실호출은 청크당 1초대라 테스트에 넣을 수 없다."""

    def _post(url, payload, timeout):
        return {"embeddings": [[float(len(t)), 1.0] for t in payload["input"]]}

    monkeypatch.setattr(embedder, "_http_post", _post)


@pytest.fixture
def env(tmp_path):
    """레지스트리·코퍼스 인덱스·산출물·아카이브를 전부 tmp_path로 격리한다."""
    corpus = tmp_path / "corpus"
    (corpus / "institutions" / "dobong" / "spec").mkdir(parents=True)
    (corpus / "institutions" / "dobong" / "spec" / "01_사업.txt").write_text(
        "청년 창업 지원", encoding="utf-8"
    )
    index_db = tmp_path / "corpus_index.db"
    build_index(corpus, index_db, embed=True)

    app = create_app(
        str(tmp_path / "registry.db"),
        output_root=str(tmp_path / "report_new"),
        index_db_path=str(index_db),
        graph_db_path=str(tmp_path / "graph.db"),
        archive_root=str(tmp_path / "report_archive"),
    )
    client = TestClient(app)
    conn = sqlite3.connect(tmp_path / "registry.db")
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong', '도봉구', 9)"
    )
    conn.commit()
    conn.close()

    # 완료 시 아카이브될 산출물
    out = tmp_path / "report_new" / "도봉구"
    out.mkdir(parents=True)
    (out / "rfp_text.txt").write_text(
        "제안서 평가 배점 총괄표\n\n금고 운영 실적 20점", encoding="utf-8"
    )
    return {
        "client": client,
        "tmp": tmp_path,
        "index_db": index_db,
        "archive_root": tmp_path / "report_archive",
        "db_path": str(tmp_path / "registry.db"),
    }


def test_완료하면_아카이브_산출물이_검색된다(env):
    """§② 17 실증 — 이 계획의 목적지."""
    # 하이브리드 인덱스에서는 "결과 0건"을 기대할 수 없다 — 벡터 경로는 뜻이
    # 조금이라도 가까우면 무엇이든 돌려준다. 확인해야 할 것은 **아카이브물이
    # 아직 색인에 없다**는 사실이다.
    before = search("금고 운영 실적", db_path=env["index_db"])
    assert not any("report_archive" in c.path for c in before)

    response = env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})
    assert response.status_code == 200

    after = search("금고 운영 실적", db_path=env["index_db"])
    assert after
    assert any("report_archive" in c.path for c in after)
    assert all(c.doctype == "archive" for c in after if "report_archive" in c.path)


def test_아카이브_청크에_기관_슬러그가_붙는다(env):
    """폴더명은 한글 '도봉구'인데 institution_id는 슬러그여야 필터가 맞는다."""
    env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})

    results = search("금고 운영 실적", institution_id="dobong", db_path=env["index_db"])
    assert results


def test_대화_원문은_색인하지_않는다(env):
    """tasks_dump.json이 들어가면 산출물 검색이 잡담에 묻힌다."""
    env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})

    conn = sqlite3.connect(env["index_db"])
    paths = [r[0] for r in conn.execute("SELECT DISTINCT path FROM chunks")]
    conn.close()
    assert not any("tasks_dump" in p for p in paths)
    assert not any("manifest" in p for p in paths)


def test_코퍼스_인덱스가_날아가지_않는다(env):
    """완료 때는 아카이브만 훑는다 — corpus를 '삭제됨'으로 오판하면 인덱스가 사라진다."""
    env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})

    assert search("청년 창업 지원", db_path=env["index_db"])


def test_재색인이_실패해도_완료는_200이다(env, monkeypatch):
    """부수 작업의 실패가 결재를 되돌리면 안 된다(계획 D 원칙)."""
    import server.reindex_service as service

    monkeypatch.setattr(
        service, "reindex", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("디스크 꽉 참"))
    )

    response = env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})

    assert response.status_code == 200
    assert response.json()["completed_by"] == "kim"


def test_재색인_실패는_쪽지로_알린다(env, monkeypatch):
    """조용히 안 되는 상태로 방치하지 않는다."""
    import server.reindex_service as service

    monkeypatch.setattr(
        service, "reindex", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("디스크 꽉 참"))
    )

    env["client"].post("/institutions/dobong/complete", headers={"X-User-Id": "kim"})

    rows = env["client"].get("/notifications", params={"recipient": "kim"}).json()
    assert any("지식 인덱스" in r["content"] for r in rows)
    assert any("디스크 꽉 참" in r["content"] for r in rows)


def test_수신자가_없으면_쪽지를_만들지_않는다(env, monkeypatch):
    import server.reindex_service as service

    monkeypatch.setattr(
        service, "reindex", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("실패"))
    )

    assert reindex_archive(
        env["db_path"], str(env["index_db"]), str(env["archive_root"]), notify_recipient=None
    ) is None


def test_기관명_매핑을_레지스트리에서_만든다(env):
    conn = sqlite3.connect(env["db_path"])
    conn.row_factory = sqlite3.Row
    try:
        assert institution_name_map(conn)["도봉구"] == "dobong"
    finally:
        conn.close()
