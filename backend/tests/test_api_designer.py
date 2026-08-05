"""디자이너 전용 뷰의 백엔드 (계획 H Task 2·3·4·5) — 스펙 §② 14.

7단계 `packager`가 이관 패키지를 만들고 알림을 보내지만, 디자이너가 **무엇을 받았는지
열어보고 작업물을 올릴** 창구가 없었다. 여기서 그 창구 4개를 검증한다:
목록(기관 횡단) · 이관 패키지 열람 · 작업물 파일 · 임시저장/제출.
"""

import json
import os

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage, pptx_path)"
                 " VALUES ('nowon','노원구',7,'data/report_new/노원구/노원구_제안서.pptx')")
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage)"
                 " VALUES ('dobong','도봉구',7)")
    # 노원은 입찰 확정일이 가깝고, 도봉은 예상일만 있고 멀다 → 우선순위 정렬 재료.
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, confirmed_date,"
                 " schedule_confidence) VALUES ('bc-1','nowon','2026-08-20','확정')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, expected_date)"
                 " VALUES ('bc-2','dobong','2027-03-01')")
    for tid, bc, team, status, pct, who, draft in [
        ("t-design-1", "bc-1", "디자이너", "대기", 0, None, ""),
        ("t-design-2", "bc-2", "디자이너", "작성중", 30, "최 디자이너", "표지 시안 검토 중"),
        # 상태를 일부러 셋 다 다르게 둔다 — 승인완료 / 제출됨(결재 전) / 작성중.
        ("t-sales", "bc-1", "영업", "2차완료", 100, "김 차장", "영업팀 승인 작성물"),
        ("t-it", "bc-1", "전산", "1차완료", 100, "권 차장", "전산팀 제출본"),
        ("t-budget", "bc-1", "예산", "작성중", 40, "정 대리", "예산팀 작성 중"),
    ]:
        conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct,"
                     " assignee, draft_content) VALUES (?,?,?,?,?,?,?)",
                     (tid, bc, team, status, pct, who, draft))
    # 팀명→쪽지 수신자 변환의 재료(영업 → 영업팀)
    for nid, recipient in [("n1", "영업팀"), ("n2", "전산팀"), ("n3", "디자이너")]:
        conn.execute("INSERT INTO notifications (notification_id, recipient, kind, content,"
                     " created_at) VALUES (?,?,'이관','x','2026-08-05T00:00:00')",
                     (nid, recipient))
    conn.commit(); conn.close()
    return app


def _client(tmp_path):
    return TestClient(_app(tmp_path))


# ── Task 2: GET /tasks — 기관 횡단 목록 ────────────────────────────────

def test_역할로_여러_기관의_작업을_한_번에_본다(tmp_path):
    rows = _client(tmp_path).get("/tasks", params={"team": "디자이너"}).json()
    assert {r["task_id"] for r in rows} == {"t-design-1", "t-design-2"}
    assert {r["institution_name"] for r in rows} == {"노원구", "도봉구"}


def test_우선순위_근거로_입찰일을_함께_준다(tmp_path):
    """화면이 D-day를 계산할 재료다. **확정일이 예상일을 이긴다**(계획 D와 같은 규칙) —
    이 선택을 화면에 복제하면 두 곳이 어긋나므로 서버가 골라서 준다."""
    rows = _client(tmp_path).get("/tasks", params={"team": "디자이너"}).json()
    by_id = {r["task_id"]: r for r in rows}
    assert by_id["t-design-1"]["bid_date"] == "2026-08-20"
    assert by_id["t-design-1"]["schedule_confidence"] == "확정"
    assert by_id["t-design-2"]["bid_date"] == "2027-03-01"


def test_team_없이는_열리지_않는다(tmp_path):
    """없이 열면 남의 작업까지 보이는 전체 조회가 된다(쪽지함의 recipient 필수와 같은 이유)."""
    assert _client(tmp_path).get("/tasks").status_code == 422


def test_상태로_거를_수_있다(tmp_path):
    rows = _client(tmp_path).get(
        "/tasks", params=[("team", "디자이너"), ("status", "작성중")]).json()
    assert [r["task_id"] for r in rows] == ["t-design-2"]


def test_목록에는_본문을_싣지_않는다(tmp_path):
    """draft_content는 무겁다 — 상세에서만 준다."""
    rows = _client(tmp_path).get("/tasks", params={"team": "디자이너"}).json()
    assert "draft_content" not in rows[0]


def test_없는_역할은_빈_목록이다(tmp_path):
    assert _client(tmp_path).get("/tasks", params={"team": "없는팀"}).json() == []


def test_파일_개수를_함께_준다(tmp_path):
    client = _client(tmp_path)
    # 담당자가 한글 이름이라 by로 신원을 넘긴다(X-User-Id는 ASCII만).
    r = client.post("/tasks/t-design-2/files", files={"file": ("시안.pdf", b"x")},
                    data={"by": "최 디자이너"}, headers={"X-User-Id": "web-user"})
    assert r.status_code == 201
    rows = client.get("/tasks", params={"team": "디자이너"}).json()
    assert {r["task_id"]: r["file_count"] for r in rows} == {"t-design-1": 0, "t-design-2": 1}


# ── Task 3: GET /tasks/{id}/handoff — 이관 패키지 ──────────────────────

def test_이관_패키지에_팀별_산출물이_들어온다(tmp_path):
    body = _client(tmp_path).get("/tasks/t-design-1/handoff").json()
    assert body["institution_name"] == "노원구"
    assert body["pptx_path"].endswith("노원구_제안서.pptx")
    assert [t["team"] for t in body["teams"]] == ["영업", "전산", "예산"]


def test_승인_안_난_팀도_감추지_않는다(tmp_path):
    """'최종 승인난 것만' 거르면 화면이 빈다 — 그래프 흐름에서 팀 Task는 1차완료까지만
    올라간다(5단계 기획승인은 기관 단위 checkpoint라 팀 Task를 2차완료로 만들지 않는다).
    게다가 감추면 디자이너가 다 받은 줄 안다. 상태를 달아 전부 보여준다."""
    teams = {t["team"]: t for t in _client(tmp_path).get("/tasks/t-design-1/handoff").json()["teams"]}
    assert teams["영업"]["status"] == "2차완료"
    assert teams["전산"]["status"] == "1차완료"
    assert teams["예산"]["status"] == "작성중"
    assert teams["예산"]["draft_content"] == "예산팀 작성 중"


def test_디자이너_자신의_작업은_패키지에_안_들어간다(tmp_path):
    teams = [t["team"] for t in _client(tmp_path).get("/tasks/t-design-1/handoff").json()["teams"]]
    assert "디자이너" not in teams


def test_문의할_쪽지_수신자를_서버가_알려준다(tmp_path):
    """'영업' 팀의 쪽지는 '영업팀' 앞으로 간다 — 이 규칙을 화면이 복제하면 갈라진다."""
    teams = {t["team"]: t for t in _client(tmp_path).get("/tasks/t-design-1/handoff").json()["teams"]}
    assert teams["영업"]["contact"] == "영업팀"
    assert teams["전산"]["contact"] == "전산팀"
    # 알림 이력이 없어도 '예산팀'이다 — 문의가 엉뚱한 곳으로 가면 안 된다(계획 I).
    assert teams["예산"]["contact"] == "예산팀"


def test_배점표와_커버리지는_있으면_싣고_없으면_null이다(tmp_path):
    app = _app(tmp_path)
    out = tmp_path / "out" / "노원구"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text(
        json.dumps({"total_score": 100, "criteria": [{"item": "a", "score": 100}]},
                   ensure_ascii=False), encoding="utf-8")
    client = TestClient(app)

    body = client.get("/tasks/t-design-1/handoff").json()
    assert body["scoring"]["total_score"] == 100
    assert body["coverage"] is None            # 파일이 없다고 500이 나면 안 된다


def test_없는_task는_404다(tmp_path):
    assert _client(tmp_path).get("/tasks/nope/handoff").status_code == 404


# ── Task 4: 작업물 파일 ────────────────────────────────────────────────

def test_올리고_목록에서_보고_내려받고_지운다(tmp_path):
    client = _client(tmp_path)
    hdr = {"X-User-Id": "designer"}

    r = client.post("/tasks/t-design-1/files", files={"file": ("제안서.pptx", b"deck")},
                    headers=hdr)
    assert r.status_code == 201 and r.json()["replaced"] is False

    rows = client.get("/tasks/t-design-1/files").json()
    assert [f["name"] for f in rows] == ["제안서.pptx"]

    assert client.get("/tasks/t-design-1/files/제안서.pptx").content == b"deck"
    assert client.delete("/tasks/t-design-1/files/제안서.pptx", headers=hdr).status_code == 204
    assert client.get("/tasks/t-design-1/files").json() == []


def test_실행파일은_거부한다(tmp_path):
    r = _client(tmp_path).post("/tasks/t-design-1/files", files={"file": ("악성.exe", b"x")},
                               headers={"X-User-Id": "designer"})
    assert r.status_code == 400 and ".exe" in r.json()["detail"]


def test_같은_이름을_다시_올리면_알린다(tmp_path):
    client = _client(tmp_path)
    hdr = {"X-User-Id": "designer"}
    client.post("/tasks/t-design-1/files", files={"file": ("시안.pdf", b"v1")}, headers=hdr)
    r = client.post("/tasks/t-design-1/files", files={"file": ("시안.pdf", b"v22")}, headers=hdr)
    assert r.json()["replaced"] is True and r.json()["size"] == 3


def test_첫_업로드가_담당을_선점한다(tmp_path):
    """POST /tasks/{id}/upload와 같은 관행 — 미배정 task는 먼저 손댄 사람이 맡는다."""
    client = _client(tmp_path)
    client.post("/tasks/t-design-1/files", files={"file": ("a.pdf", b"x")},
                headers={"X-User-Id": "designer-a"})
    assert client.get("/tasks/t-design-1").json()["assignee"] == "designer-a"

    r = client.post("/tasks/t-design-1/files", files={"file": ("b.pdf", b"x")},
                    headers={"X-User-Id": "designer-b"})
    assert r.status_code == 403


def test_없는_파일_내려받기는_404다(tmp_path):
    assert _client(tmp_path).get("/tasks/t-design-1/files/없음.pdf").status_code == 404


def test_파일_경로로_탈출할_수_없다(tmp_path):
    """이름은 저장 때와 같은 규칙으로 다시 씻긴다."""
    r = _client(tmp_path).get("/tasks/t-design-1/files/..%2F..%2Fr.db")
    assert r.status_code in (400, 404)
    assert (tmp_path / "r.db").exists()          # 어떤 경우에도 밖의 파일이 나가지 않는다


# ── Task 5: 임시저장과 제출 ────────────────────────────────────────────

def test_임시저장은_기록을_남기지_않는다(tmp_path):
    """임시저장은 기록할 사건이 아니다 — 누를 때마다 로그가 쌓이면 아무도 안 읽는다.
    (POST /tasks/{id}/upload를 재사용하지 않는 이유가 이것이다.)"""
    client = _client(tmp_path)
    r = client.patch("/tasks/t-design-1/draft", json={"content": "표지 3안 검토"},
                     headers={"X-User-Id": "designer"})
    assert r.status_code == 200

    detail = client.get("/tasks/t-design-1").json()
    assert detail["draft_content"] == "표지 3안 검토"
    assert detail["messages"] == []


def test_임시저장도_담당을_선점한다(tmp_path):
    client = _client(tmp_path)
    client.patch("/tasks/t-design-1/draft", json={"content": "x"},
                 headers={"X-User-Id": "designer-a"})
    r = client.patch("/tasks/t-design-1/draft", json={"content": "y"},
                     headers={"X-User-Id": "designer-b"})
    assert r.status_code == 403


def test_디자이너_제출은_영업팀장에게_올라간다(tmp_path):
    """디자이너는 **영업팀 소속**이라 1차 결재가 영업팀장에게 간다(사용자 확정).
    예전에는 무엇이든 '영업팀' 고정이었고, 그다음엔 '본부장'이었다."""
    client = _client(tmp_path)
    client.post("/tasks/t-design-2/submit", json={"by": "최 디자이너"},
                headers={"X-User-Id": "web-user"})

    notes = client.get("/notifications", params={"recipient": "영업팀장"}).json()
    approvals = [n for n in notes if n["kind"] == "결재요청"]
    assert len(approvals) == 1
    assert approvals[0]["task_id"] == "t-design-2"
    assert approvals[0]["institution_id"] == "dobong"
    assert "디자이너" in approvals[0]["content"]


def test_영업팀장_승인이_곧_영업부장_상신이다(tmp_path):
    """사용자 확정 — "영업팀장이 영업부장에게 그 결과물을 결재올리는 걸로 종료".
    별도의 상신 버튼을 두면 승인해 놓고 안 올린 상태가 생긴다."""
    client = _client(tmp_path)
    client.post("/tasks/t-design-2/submit", json={"by": "최 디자이너"},
                headers={"X-User-Id": "web-user"})
    r = client.post("/tasks/t-design-2/approve", json={"approved": True, "by": "이 팀장"},
                    headers={"X-User-Id": "web-user"})
    assert r.status_code == 200 and r.json()["status"] == "2차완료"

    notes = client.get("/notifications", params={"recipient": "영업부장"}).json()
    assert [n["task_id"] for n in notes if n["kind"] == "결재요청"] == ["t-design-2"]


def test_영업부장_최종결재가_흐름의_끝이다(tmp_path):
    """1차 결재자(영업팀장)가 결재자 칸을 잡고 있어도 부장이 막히면 안 된다 —
    결재자 선점은 단계마다 따로 본다."""
    client = _client(tmp_path)
    client.post("/tasks/t-design-2/submit", json={"by": "최 디자이너"},
                headers={"X-User-Id": "web-user"})
    client.post("/tasks/t-design-2/approve", json={"approved": True, "by": "이 팀장"},
                headers={"X-User-Id": "web-user"})
    r = client.post("/tasks/t-design-2/approve", json={"approved": True, "by": "박 부장"},
                    headers={"X-User-Id": "web-user"})

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "최종완료"
    assert body["approver"] == "이 팀장" and body["final_approver"] == "박 부장"


def test_디자이너_제출물은_각_팀에도_전달된다(tmp_path):
    """사용자 확정 — 팀은 자기 작업함의 이관 패키지에서 그 결과물을 열어본다."""
    client = _client(tmp_path)
    client.post("/tasks/t-design-2/submit", json={"by": "최 디자이너"},
                headers={"X-User-Id": "web-user"})

    for recipient in ("영업팀", "전산팀"):
        notes = client.get("/notifications", params={"recipient": recipient}).json()
        assert any("디자이너 작업물이 제출" in n["content"] for n in notes), recipient


def test_팀_작업_제출은_그_팀_팀장에게_간다(tmp_path):
    client = _client(tmp_path)
    client.post("/tasks/t-budget/submit", json={"by": "정 대리"},
                headers={"X-User-Id": "web-user"})

    notes = client.get("/notifications", params={"recipient": "예산팀장"}).json()
    assert [n["task_id"] for n in notes if n["kind"] == "결재요청"] == ["t-budget"]
    # 영업팀장이 남의 팀 결재 요청을 받지 않는다
    assert client.get("/notifications", params={"recipient": "영업팀장"}).json() == []


def test_제출_알림이_실패해도_제출은_유효하다(tmp_path):
    """알림은 부수효과다 — 그것 때문에 제출이 되돌아가면 안 된다."""
    client = _client(tmp_path)
    r = client.post("/tasks/t-design-2/submit", json={"by": "최 디자이너"},
                    headers={"X-User-Id": "web-user"})
    assert r.status_code == 200 and r.json()["status"] == "1차완료"


# ── 한글 이름 신원 (X-User-Id는 ASCII만 — A1 F10) ──────────────────────
# 이게 없으면 담당자 이름이 한글인 작업은 API로 아무것도 못 한다. 데모의 '최 디자이너'가
# 자기 작업에 파일 하나 못 올리고 403을 받는다.

def test_한글_담당자도_by로_자기_작업을_다룬다(tmp_path):
    client = _client(tmp_path)
    r = client.patch("/tasks/t-design-2/draft", json={"content": "메모", "by": "최 디자이너"},
                     headers={"X-User-Id": "web-user"})
    assert r.status_code == 200


def test_by가_없으면_헤더가_신원이다(tmp_path):
    """기존 호출부(by를 모르는 곳)는 그대로 동작해야 한다."""
    client = _client(tmp_path)
    r = client.patch("/tasks/t-design-1/draft", json={"content": "메모"},
                     headers={"X-User-Id": "designer"})
    assert r.status_code == 200 and r.json()["assignee"] == "designer"


def test_by를_대도_남의_작업은_못_건드린다(tmp_path):
    client = _client(tmp_path)
    r = client.patch("/tasks/t-design-2/draft", json={"content": "x", "by": "남의 사람"},
                     headers={"X-User-Id": "web-user"})
    assert r.status_code == 403


def test_에이전트_전용_단계는_팀_산출물이_아니다(tmp_path):
    """RFI분석·취합·검증도 tasks 행을 갖지만(DbRecorder._ensure_task) 사람 작성물이
    없어 항상 빈 카드가 되고 문의할 상대도 아니다. 그 산출물은 scoring·coverage·
    pptx_path로 따로 실린다."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    for tid, team in [("t-rfi", "RFI분석"), ("t-pack", "취합"), ("t-verify", "검증")]:
        conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, status)"
                     " VALUES (?, 'bc-1', ?, '1차완료')", (tid, team))
    conn.commit(); conn.close()

    teams = [t["team"] for t in TestClient(app).get("/tasks/t-design-1/handoff").json()["teams"]]
    assert teams == ["영업", "전산", "예산"]


# ── 팀이 올린 파일도 이관 패키지에 실린다 (사용자 피드백) ────────────────
# 디자이너는 "각 팀이 작업한 내용을 **받아서**" 작업한다. 텍스트 작성물만 보여주고
# 파일을 숨기면 정작 받아야 할 실물이 화면에 없다.

def test_이관_패키지에_팀이_올린_파일이_보인다(tmp_path):
    client = _client(tmp_path)
    client.post("/tasks/t-it/files", files={"file": ("전산_구성도.pdf", b"diagram")},
                data={"by": "권 차장"}, headers={"X-User-Id": "web-user"})

    teams = {t["team"]: t for t in client.get("/tasks/t-design-1/handoff").json()["teams"]}
    assert [f["name"] for f in teams["전산"]["files"]] == ["전산_구성도.pdf"]
    assert teams["영업"]["files"] == []


def test_팀의_task_id를_함께_줘야_내려받을_수_있다(tmp_path):
    """화면이 GET /tasks/{team_task_id}/files/{name} 주소를 만들 수 있어야 한다."""
    teams = {t["team"]: t for t in _client(tmp_path).get("/tasks/t-design-1/handoff").json()["teams"]}
    assert teams["영업"]["task_id"] == "t-sales"


def test_디자이너가_팀_파일을_내려받는다(tmp_path):
    client = _client(tmp_path)
    client.post("/tasks/t-it/files", files={"file": ("전산_구성도.pdf", b"diagram")},
                data={"by": "권 차장"}, headers={"X-User-Id": "web-user"})
    assert client.get("/tasks/t-it/files/전산_구성도.pdf").content == b"diagram"


# ── 다른 팀이 작업 중이면 디자이너는 제출할 수 없다 (사용자 피드백) ──────
# 디자이너 작업물은 3팀 산출물을 **받아서** 만든 것이다. 팀이 아직 쓰고 있는 중이면
# 그 위에서 만든 결과물을 결재에 올리는 것은 앞뒤가 맞지 않는다. 판단이 아니라
# 선후 규칙이라 화면이 아니라 가드로 막는다(계획 E의 POST /run과 같은 논리).

def test_승인_안_난_팀이_있으면_디자이너_제출이_막힌다(tmp_path):
    """기본 시드가 이 상태다 — 전산은 제출만 됐고(1차완료) 예산은 작성 중이다."""
    client = _client(tmp_path)
    client.patch("/tasks/t-design-1/draft", json={"content": "x"},
                 headers={"X-User-Id": "designer"})
    r = client.post("/tasks/t-design-1/submit", headers={"X-User-Id": "designer"})

    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "전산" in detail and "예산" in detail     # 누구를 기다리는지 이름을 말한다


def test_제출만_해서는_부족하다_팀장_결재까지_받아야_한다(tmp_path):
    """계획 H는 '작업 중이 아닐 것'으로 약하게 잡았다 — 결재할 화면이 없었기 때문이다.
    계획 I가 팀장 결재함을 만들면서 기준을 승인완료로 올렸다(사용자 확정)."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("UPDATE tasks SET status='1차완료' WHERE team IN ('영업','전산','예산')")
    conn.commit(); conn.close()
    client = TestClient(app)
    client.patch("/tasks/t-design-1/draft", json={"content": "x"},
                 headers={"X-User-Id": "designer"})

    assert client.post("/tasks/t-design-1/submit",
                       headers={"X-User-Id": "designer"}).status_code == 409


def test_전부_승인되면_디자이너가_제출할_수_있다(tmp_path):
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("UPDATE tasks SET status='2차완료' WHERE team IN ('영업','전산','예산')")
    conn.commit(); conn.close()
    client = TestClient(app)
    client.patch("/tasks/t-design-1/draft", json={"content": "x"},
                 headers={"X-User-Id": "designer"})

    r = client.post("/tasks/t-design-1/submit", headers={"X-User-Id": "designer"})
    assert r.status_code == 200 and r.json()["status"] == "1차완료"


def test_이_규칙은_디자이너에게만_적용된다(tmp_path):
    """3팀에 걸면 서로를 기다리다 아무도 제출하지 못한다(교착)."""
    client = _client(tmp_path)
    r = client.post("/tasks/t-budget/submit", json={"by": "정 대리"},
                    headers={"X-User-Id": "web-user"})
    assert r.status_code == 200


def test_이관_패키지가_대기중인_팀을_알려준다(tmp_path):
    """화면이 제출 버튼을 왜 못 누르는지 설명할 근거."""
    # 시드: 영업 2차완료 · 전산 1차완료 · 예산 작성중 → 승인난 것은 영업뿐이다.
    body = _client(tmp_path).get("/tasks/t-design-1/handoff").json()
    assert body["waiting_on"] == ["전산", "예산"]
