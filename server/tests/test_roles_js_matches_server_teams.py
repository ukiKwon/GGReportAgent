"""화면(`frontend/js/roles.js`)과 서버(`server/teams.py`)의 역할 어휘가 갈리지 않게 한다.

**왜 필요한가.** `roles.js`에는 "server/teams.py의 …와 같아야 한다"는 주석이 여러 곳에
달려 있지만, **같은지 확인하는 것은 아무것도 없었다.** 서버에서 팀 이름이 바뀌어도 화면은
조용히 옛 목록을 쓴다 — `approverOf`가 그 팀을 못 알아보면 `null`을 돌려주고
(설계상 "모르면 지어내지 않는다"), **결재 라인이 오류 없이 끊긴다.** 버튼만 안 뜬다.

이 부류의 결함이 2026-08-28에 **파이썬 쪽에서만 두 건** 나왔다(`server/assembler.py`의
`TEAM_ORDER`, `server/agent_adapter.py`의 `TEAM_SEARCH_FILTERS` — 둘 다 옛 이름 `IT`).
둘 다 오류 없이 조용히 틀렸고, 둘 다 **테스트가 구현과 같은 오답을 공유**해 못 잡았다.
화면 쪽은 아직 이름이 맞지만 같은 모양이라 미리 못 박는다(NEXT.md 항목 24).

**런타임 결합을 만들지 않는다.** 서버가 팀 목록을 내려주게 바꾸는 방법도 있지만, 목적은
드리프트를 잡는 것이지 기동 시점 의존을 늘리는 것이 아니다. 그래서 파일을 읽어 대조만 한다.
"""

import re
from pathlib import Path

import pytest

from server import teams

ROLES_JS = Path(__file__).resolve().parents[2] / "frontend" / "js" / "roles.js"


def _js_array(name: str) -> list[str]:
    """`roles.<name> = ['a', 'b'];` 에서 문자열 배열을 뽑는다.

    파서를 만들지 않는다 — 이 파일에서 확인하려는 것은 **리터럴로 적힌 목록**뿐이고,
    파생된 값(`roles.ALL` 등)은 애초에 드리프트하지 않는다.
    """
    source = ROLES_JS.read_text(encoding="utf-8")
    match = re.search(rf"roles\.{name}\s*=\s*\[([^\]]*)\]", source)
    assert match, f"roles.js에서 roles.{name} 배열을 찾지 못했다 — 이름이 바뀌었는지 확인할 것"
    return re.findall(r"'([^']*)'", match.group(1))


def _js_string(name: str) -> str:
    source = ROLES_JS.read_text(encoding="utf-8")
    match = re.search(rf"roles\.{name}\s*=\s*'([^']*)'", source)
    assert match, f"roles.js에서 roles.{name} 을 찾지 못했다"
    return match.group(1)


def test_roles_js_파일이_있다():
    """경로가 바뀌면 아래 대조가 조용히 사라지므로 따로 못 박는다."""
    assert ROLES_JS.is_file(), f"roles.js를 찾지 못했다: {ROLES_JS}"


def test_소속_목록이_서버와_같다():
    """`AFFILIATIONS`가 roles.js에서 **손으로 적는 유일한 팀 목록**이다.

    `approverOf`의 팀 목록(`roles.TEAMS`)은 이 값에서 파생되므로 여기만 지키면 된다.
    """
    assert _js_array("AFFILIATIONS") == list(teams.AFFILIATIONS)


def test_approverOf가_팀_목록을_따로_갖지_않는다():
    """리터럴 배열이 다시 생기면 이 대조가 무의미해진다 — 그 재발을 막는다.

    예전 코드: `if (['영업', '전산', '예산'].indexOf(team) >= 0)`.
    지금은 `roles.TEAMS`(AFFILIATIONS에서 파생)를 쓴다.
    """
    source = ROLES_JS.read_text(encoding="utf-8")
    approver = source[source.index("roles.approverOf"):]
    approver = approver[: approver.index("};")]
    for team in teams.AUTHORING_TEAMS:
        assert f"'{team}'" not in approver, (
            f"approverOf가 팀 이름 '{team}'을 직접 갖고 있다 —"
            " roles.TEAMS(AFFILIATIONS 파생)를 쓸 것"
        )


@pytest.mark.parametrize(
    "js_name, server_value",
    [
        ("DESIGNER", teams.DESIGNER_TEAM),
        ("FINAL_APPROVER", teams.FINAL_APPROVER),
        ("MEMBER", teams.POSITION_MEMBER),
        ("LEAD", teams.POSITION_LEAD),
        ("HEAD", teams.POSITION_HEAD),
    ],
)
def test_역할_어휘_한_단어짜리도_서버와_같다(js_name, server_value):
    """팀 목록만 맞고 접미사가 갈리면 `영업팀장` 대신 `영업리더` 같은 값이 만들어진다 —
    결재자 이름이 어긋나 쪽지가 아무에게도 안 간다."""
    assert _js_string(js_name) == server_value
