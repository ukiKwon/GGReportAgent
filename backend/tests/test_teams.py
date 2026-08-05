"""역할 어휘 (계획 I Task 1).

사람의 **소속**(프로필 값)과 `tasks.team`, 그리고 쪽지 수신자 이름이 서로 다른
체계다. 그 변환을 화면마다 따로 풀면(`'영업' + '팀'` 같은 규칙 복제) 한쪽만 고쳤을
때 조용히 갈라진다 — 그래서 이 모듈 한 곳에 모으고 여기서 고정한다.
"""

import pytest

from backend import teams as tm


# ── 소속 → tasks.team ──────────────────────────────────────────────────

def test_팀원과_팀장은_같은_팀을_가리킨다():
    """'영업팀장'은 '영업팀'의 결재자다 — 둘 다 tasks.team='영업'을 본다."""
    assert tm.team_of("영업팀") == "영업"
    assert tm.team_of("영업팀장") == "영업"
    assert tm.team_of("전산팀장") == "전산"
    assert tm.team_of("예산팀") == "예산"


def test_접미사가_없는_역할은_그대로다():
    assert tm.team_of("디자이너") == "디자이너"
    assert tm.team_of("본부장") == "본부장"


def test_모르는_값도_죽지_않는다():
    assert tm.team_of("") == ""
    assert tm.team_of(None) == ""
    assert tm.team_of("낯선역할") == "낯선역할"


def test_팀장_접미사가_팀_접미사보다_먼저_떨어진다():
    """'영업팀장'에서 '팀'만 떼면 '영업장'이 된다 — 순서가 규칙의 전부다."""
    assert tm.team_of("영업팀장") == "영업"


# ── 결재자 찾기 ────────────────────────────────────────────────────────

def test_팀의_결재자는_그_팀의_팀장이다():
    assert tm.lead_of("영업") == "영업팀장"
    assert tm.lead_of("전산") == "전산팀장"


def test_디자이너의_결재자는_본부장이다():
    """디자이너에겐 팀장이 없다 — 최종 결재자가 직접 본다(사용자 확정)."""
    assert tm.lead_of("디자이너") == tm.FINAL_APPROVER == "본부장"


def test_is_lead():
    assert tm.is_lead("영업팀장") and tm.is_lead("본부장")
    assert not tm.is_lead("영업팀")
    assert not tm.is_lead("디자이너")
    assert not tm.is_lead(None)


def test_역할_목록에_중복이_없다():
    assert len(tm.ROLES) == len(set(tm.ROLES))
    for role in ("영업팀", "영업팀장", "디자이너", "본부장", "전산팀"):
        assert role in tm.ROLES


# ── 인사권자 → 본부장 개명 (옛 데이터 호환) ─────────────────────────────

def test_옛_이름으로_온_알림도_본부장이_받는다():
    """개명 전에 쌓인 notifications 행은 '인사권자' 앞으로 와 있다. 과거 기록이라
    고쳐 쓰지 않고, 조회 쪽에서 같은 것으로 본다."""
    assert tm.LEGACY_FINAL_APPROVER == "인사권자"
    assert set(tm.recipient_aliases("본부장")) == {"본부장", "인사권자"}


def test_다른_역할은_별칭이_없다():
    assert tm.recipient_aliases("영업팀") == ["영업팀"]


# ── 기존 동작 (계획 H에서 만든 것) ──────────────────────────────────────

def test_에이전트_전용_단계는_사람_팀이_아니다():
    assert not tm.is_authoring_team("RFI분석")
    assert tm.is_authoring_team("영업")


def test_is_working():
    assert tm.is_working("대기") and tm.is_working("작성중")
    assert not tm.is_working("1차완료") and not tm.is_working("2차완료")


def test_inbox_name은_아는_팀에_팀_접미사를_붙인다():
    assert tm.inbox_name("영업", ["영업팀", "디자이너"]) == "영업팀"
    # 그 팀 앞으로 온 알림이 아직 없어도 마찬가지다 — 이력 유무로 소속이 흔들리면
    # 계정 전환기가 사람마다 다른 답을 준다(계획 I).
    assert tm.inbox_name("예산", ["영업팀"]) == "예산팀"


# ── 팀 이름 통일 (NEXT.md 이월 해소) ────────────────────────────────────

def test_작성_팀은_전산이지_IT가_아니다():
    """참여확정은 TEAMS로, 5단계 draft_team은 ROLES로 Task를 만든다. 이름이 다르면
    tasks의 UNIQUE(bid_case_id, team)이 못 막아 한 공고에 둘 다 생긴다."""
    from agent.nodes.role_router import ROLES as GRAPH_ROLES
    assert list(tm.AUTHORING_TEAMS) == list(GRAPH_ROLES)
    assert "IT" not in tm.AUTHORING_TEAMS


def test_bidcase_repository도_같은_목록을_쓴다():
    from backend.bidcase_repository import TEAMS
    assert list(TEAMS) == list(tm.AUTHORING_TEAMS)


# ── 기존 DB의 IT 행 정리 (데이터 마이그레이션) ──────────────────────────

def test_init_db가_옛_IT_task를_전산으로_옮긴다(tmp_path):
    """이름이 두 벌이던 시절에 만들어진 행이 남아 있으면 한 공고에 IT·전산이
    나란히 보인다. 컬럼 추가가 아니라 **값** 마이그레이션이라 MIGRATIONS로는 못 한다."""
    from backend.db import get_connection, init_db
    db = str(tmp_path / "r.db")
    conn = init_db(db)
    conn.execute("INSERT INTO institutions (institution_id, name_ko) VALUES ('nowon','노원구')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('t1','bc','IT')")
    conn.commit(); conn.close()

    init_db(db).close()                       # 다시 열면 정리된다

    conn = get_connection(db)
    assert conn.execute("SELECT team FROM tasks WHERE task_id='t1'").fetchone()["team"] == "전산"
    conn.close()


def test_전산_task가_이미_있으면_IT_행을_지운다(tmp_path):
    """UNIQUE(bid_case_id, team) 때문에 그대로 UPDATE하면 깨진다. 이미 제 이름의
    행이 있으면 옛 행은 버린다 — 그래프가 만든 '전산' 쪽이 실제 작업물을 갖고 있다."""
    from backend.db import get_connection, init_db
    db = str(tmp_path / "r.db")
    conn = init_db(db)
    conn.execute("INSERT INTO institutions (institution_id, name_ko) VALUES ('nowon','노원구')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, draft_content)"
                 " VALUES ('t-it','bc','IT','')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, draft_content)"
                 " VALUES ('t-real','bc','전산','실제 작성물')")
    conn.commit(); conn.close()

    init_db(db).close()

    conn = get_connection(db)
    rows = conn.execute("SELECT task_id, team FROM tasks WHERE bid_case_id='bc'").fetchall()
    assert [(r["task_id"], r["team"]) for r in rows] == [("t-real", "전산")]
    conn.close()


def test_마이그레이션은_여러_번_돌려도_안전하다(tmp_path):
    from backend.db import init_db
    db = str(tmp_path / "r.db")
    for _ in range(3):
        init_db(db).close()


# ── inbox_name: 팀장 역할이 생기면서 드러난 결함 (계획 I) ────────────────
# `startswith`로 아무거나 고르면 '전산' → '전산팀장'이 걸린다. 실제로 데모에서
# 권 차장(전산 팀원)이 계정 전환기에 '전산팀장'으로 나왔다.

def test_팀_이름을_팀장보다_먼저_고른다():
    recipients = ["전산팀", "전산팀장"]
    assert tm.inbox_name("전산", recipients) == "전산팀"


def test_팀장만_있어도_팀원을_팀장으로_만들지_않는다():
    """그 팀 앞으로 온 알림이 아직 없을 뿐인데 소속이 팀장으로 바뀌면 안 된다."""
    assert tm.inbox_name("전산", ["전산팀장", "영업팀"]) == "전산팀"


def test_정확히_일치하면_그대로():
    assert tm.inbox_name("디자이너", ["디자이너", "디자이너보조"]) == "디자이너"


def test_아는_팀이_아니면_기존_추론을_쓴다():
    """에이전트 단계(검증 등)나 낯선 값은 후보 중 가장 짧은 것으로."""
    assert tm.inbox_name("검증", ["검증반", "검증반장"]) == "검증반"
    assert tm.inbox_name("검증", []) == "검증"
