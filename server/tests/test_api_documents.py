"""원문 열람 API (계획 F 후속 G2).

**경로 탈출 테스트가 이 파일의 핵심이다.** 클라이언트가 준 문자열로 파일을 읽는
엔드포인트라, 가드가 없으면 `../../` 하나로 리포 바깥이 읽힌다.
"""

import json

import pytest
from fastapi.testclient import TestClient

from server.main import create_app


@pytest.fixture
def client(tmp_path):
    corpus = tmp_path / "corpus" / "institutions" / "dobong" / "spec"
    corpus.mkdir(parents=True)
    (corpus / "02_사업목록.txt").write_text(
        "1장. 상생경제도시\n\n청년 창업 지원 센터 운영\n\n예산: 634백만원", encoding="utf-8"
    )
    archive = tmp_path / "report_archive" / "도봉구" / "2026-08-04"
    archive.mkdir(parents=True)
    (archive / "rfp_scoring.json").write_text(
        json.dumps({"total": 100, "criteria": [{"name": "금고 운영 실적", "points": 20}]},
                   ensure_ascii=False), encoding="utf-8")
    # 리포 바깥을 흉내내는 미끼 — 탈출에 성공하면 이 내용이 보인다.
    (tmp_path / "비밀.txt").write_text("API_KEY=절대노출금지", encoding="utf-8")

    app = create_app(
        str(tmp_path / "r.db"),
        output_root=str(tmp_path / "out"),
        index_db_path=str(tmp_path / "idx.db"),
        corpus_root=str(tmp_path / "corpus"),
        graph_db_path=str(tmp_path / "g.db"),
        archive_root=str(tmp_path / "report_archive"),
    )
    return TestClient(app)


def get(client, path):
    return client.get("/documents", params={"path": path})


# ── 정상 경로 ──────────────────────────────────────────────────────────

def test_코퍼스_원문_전체를_돌려준다(client):
    r = get(client, "corpus/institutions/dobong/spec/02_사업목록.txt")

    assert r.status_code == 200
    body = r.json()
    assert body["filename"] == "02_사업목록.txt"
    assert "청년 창업 지원 센터 운영" in body["text"]
    # 스니펫이 아니라 전문이어야 한다 — 검색이 못 보여준 뒷부분까지.
    assert "예산: 634백만원" in body["text"]
    assert body["truncated"] is False


def test_아카이브_산출물도_열린다(client):
    """완료된 제안 근거를 확인하는 경로 — 색인기와 같은 파서를 쓴다."""
    r = get(client, "report_archive/도봉구/2026-08-04/rfp_scoring.json")

    assert r.status_code == 200
    assert "금고 운영 실적" in r.json()["text"]


def test_역슬래시_경로도_받는다(client):
    """Windows에서 만들어진 경로가 섞여 들어와도 열려야 한다."""
    r = get(client, "corpus\\institutions\\dobong\\spec\\02_사업목록.txt")
    assert r.status_code == 200


# ── 경로 탈출 (핵심) ───────────────────────────────────────────────────

@pytest.mark.parametrize("evil", [
    "corpus/../비밀.txt",
    "corpus/institutions/../../비밀.txt",
    "corpus/institutions/dobong/../../../비밀.txt",
    "corpus\\..\\비밀.txt",
    "../비밀.txt",
    "/etc/passwd",
    "C:/Windows/System32/drivers/etc/hosts",
    "비밀.txt",
])
def test_뿌리_밖으로_나가려는_경로는_거부한다(client, evil):
    r = get(client, evil)
    assert r.status_code in (400, 404), f"{evil} 가 통과했다"
    assert "절대노출금지" not in r.text


def test_허용되지_않은_뿌리_이름은_거부한다(client):
    """data/·frontend/ 등 색인 대상이 아닌 곳은 열람 대상도 아니다."""
    assert get(client, "data/registry.db").status_code == 400
    assert get(client, "frontend/index.html").status_code == 400


def test_뿌리만_주면_거부한다(client):
    assert get(client, "corpus").status_code == 400


# ── 그 밖 ──────────────────────────────────────────────────────────────

def test_없는_파일은_404(client):
    assert get(client, "corpus/institutions/dobong/spec/없음.txt").status_code == 404


def test_읽을_수_없는_형식은_415와_이유(client, tmp_path):
    (tmp_path / "corpus" / "공고.pdf").write_bytes(b"%PDF-1.4")
    r = get(client, "corpus/공고.pdf")
    assert r.status_code == 415
    assert "공고.pdf" in r.json()["detail"]


def test_아주_긴_파일은_잘라서_주고_그_사실을_알린다(client, tmp_path):
    from server.routers.documents import MAX_CHARS

    (tmp_path / "corpus" / "긴문서.txt").write_text("가" * (MAX_CHARS + 500), encoding="utf-8")
    body = get(client, "corpus/긴문서.txt").json()

    assert body["truncated"] is True
    assert len(body["text"]) == MAX_CHARS
    assert body["chars"] == MAX_CHARS + 500


def test_빈_path는_422(client):
    assert client.get("/documents", params={"path": ""}).status_code == 422
