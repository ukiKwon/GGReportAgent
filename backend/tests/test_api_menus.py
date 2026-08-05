"""역할별 메뉴 권한 (계획 I Task 2).

지금까지 탭 노출은 코드에 박혀 있었다(`app.SERVER_ONLY_IDS`, `applyDesignerUI`).
사용자 확정: **전산팀이 화면에서 관리한다.** 그래서 DB에 두고 API로 연다.
"""

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app
from backend.menus import ADMIN_MENU, DEFAULT_MENUS, MENUS


def _client(tmp_path):
    return TestClient(create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                                 graph_db_path=str(tmp_path / "g.db")))


# ── 기본값 (DB가 비어 있어도 화면이 돌아야 한다) ────────────────────────

def test_빈_DB에서도_기본값을_준다(tmp_path):
    body = _client(tmp_path).get("/menus", params={"role": "영업팀"}).json()
    assert body["role"] == "영업팀"
    assert set(body["menus"]) == {m["key"] for m in MENUS}
    assert body["menus"]["map"] is True


def test_영업부장은_워크플로를_보지_않는다(tmp_path):
    """최종 결재자에게 9단계 현황판은 필요 없다(사용자 확정) — 결재함만 본다."""
    menus = _client(tmp_path).get("/menus", params={"role": "영업부장"}).json()["menus"]
    assert menus["workflow"] is False
    assert menus["approvals"] is True


def test_팀원은_결재함이_없고_팀장은_있다(tmp_path):
    client = _client(tmp_path)
    member = client.get("/menus", params={"role": "전산팀"}).json()["menus"]
    lead = client.get("/menus", params={"role": "전산팀장"}).json()["menus"]
    assert member["approvals"] is False and member["tasks"] is True
    assert lead["approvals"] is True


def test_권한관리는_전산팀만_켜져_있다(tmp_path):
    client = _client(tmp_path)
    for role in ("영업팀", "예산팀", "디자이너", "영업부장", "영업팀장"):
        assert client.get("/menus", params={"role": role}).json()["menus"][ADMIN_MENU] is False
    assert client.get("/menus", params={"role": "전산팀"}).json()["menus"][ADMIN_MENU] is True


def test_모르는_역할은_최소_권한이다(tmp_path):
    """오타나 옛 소속으로 들어온 사람에게 관리 화면을 열어주면 안 된다."""
    menus = _client(tmp_path).get("/menus", params={"role": "낯선소속"}).json()["menus"]
    assert menus[ADMIN_MENU] is False and menus["approvals"] is False
    assert menus["map"] is True          # 지도는 누구나 본다


def test_role_없이_부르면_전체_표를_준다(tmp_path):
    """관리 화면이 쓰는 모양 — 역할×메뉴 격자와 메뉴 정의."""
    body = _client(tmp_path).get("/menus").json()
    assert [m["key"] for m in body["menus"]] == [m["key"] for m in MENUS]
    assert body["roles"]["영업부장"]["workflow"] is False
    assert "label" in body["menus"][0]


# ── 저장 ───────────────────────────────────────────────────────────────

def test_켜고_끄면_그대로_읽힌다(tmp_path):
    client = _client(tmp_path)
    r = client.put("/menus", json={"changes": [
        {"role": "영업부장", "menu": "workflow", "enabled": True},
    ]})
    assert r.status_code == 200
    assert client.get("/menus", params={"role": "영업부장"}).json()["menus"]["workflow"] is True


def test_되돌리면_기본값으로_돌아간다(tmp_path):
    client = _client(tmp_path)
    client.put("/menus", json={"changes": [{"role": "영업부장", "menu": "workflow", "enabled": True}]})
    client.put("/menus", json={"changes": [{"role": "영업부장", "menu": "workflow", "enabled": False}]})
    assert client.get("/menus", params={"role": "영업부장"}).json()["menus"]["workflow"] is False


def test_저장은_바꾼_것만_보낸다(tmp_path):
    """전체를 덮어쓰지 않는다 — 두 사람이 동시에 만져도 서로의 변경을 지우지 않는다."""
    client = _client(tmp_path)
    client.put("/menus", json={"changes": [{"role": "영업부장", "menu": "workflow", "enabled": True}]})
    client.put("/menus", json={"changes": [{"role": "영업팀", "menu": "knowledge", "enabled": False}]})

    roles = client.get("/menus").json()["roles"]
    assert roles["영업부장"]["workflow"] is True
    assert roles["영업팀"]["knowledge"] is False


def test_모르는_메뉴_키는_거부한다(tmp_path):
    r = _client(tmp_path).put("/menus", json={"changes": [
        {"role": "영업팀", "menu": "없는메뉴", "enabled": True}]})
    assert r.status_code == 400 and "없는메뉴" in r.json()["detail"]


def test_모르는_역할은_거부한다(tmp_path):
    r = _client(tmp_path).put("/menus", json={"changes": [
        {"role": "낯선소속", "menu": "map", "enabled": True}]})
    assert r.status_code == 400


# ── 자물쇠: 권한 화면을 잠가버리는 저장은 막는다 ────────────────────────
# 한 번의 실수로 아무도 관리 화면에 못 들어가면 되돌릴 방법이 없다.

def test_권한관리를_전부_끄면_거부한다(tmp_path):
    client = _client(tmp_path)
    r = client.put("/menus", json={"changes": [
        {"role": "전산팀", "menu": ADMIN_MENU, "enabled": False}]})

    assert r.status_code == 400
    assert "권한" in r.json()["detail"] or "잠" in r.json()["detail"]
    # 거부됐으니 원래 값이 그대로여야 한다
    assert client.get("/menus", params={"role": "전산팀"}).json()["menus"][ADMIN_MENU] is True


def test_다른_역할에_먼저_주면_끌_수_있다(tmp_path):
    """자물쇠는 '아무도 못 들어가는 상태'만 막는다 — 담당자를 바꾸는 것은 정상이다."""
    client = _client(tmp_path)
    r = client.put("/menus", json={"changes": [
        {"role": "영업부장", "menu": ADMIN_MENU, "enabled": True},
        {"role": "전산팀", "menu": ADMIN_MENU, "enabled": False},
    ]})
    assert r.status_code == 200
    menus = client.get("/menus").json()["roles"]
    assert menus["영업부장"][ADMIN_MENU] is True and menus["전산팀"][ADMIN_MENU] is False


def test_기본값에도_권한관리_담당이_반드시_있다():
    """DEFAULT_MENUS가 잘못 바뀌면 자물쇠 검사 자체가 무의미해진다."""
    assert any(m.get(ADMIN_MENU) for m in DEFAULT_MENUS.values())


def test_빈_변경은_아무것도_하지_않는다(tmp_path):
    client = _client(tmp_path)
    assert client.put("/menus", json={"changes": []}).status_code == 200
    conn = get_connection(str(tmp_path / "r.db"))
    assert conn.execute("SELECT COUNT(*) n FROM role_menus").fetchone()["n"] == 0
    conn.close()
