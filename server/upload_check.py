"""업로드 즉시검사 — 검증가의 단건 실행 (스펙 §④ 검증가: 6단계 업로드마다 즉시).

배정은 role_router_node 규칙 라우팅으로 재현한다(그래프 state를 벗어난 API 경로라
role_assignments가 없다). coverage는 팀 배정 항목만, PII는 업로드 본문 전체.
"""

import json
import os

from agent.nodes.role_router import role_router_node
from agent.nodes.verification import verification_node
from agent.orchestrator.pii import scan_pii


def check_upload(scoring_path: str, team: str, content: str) -> dict:
    """`llm_used`: 이번 검사에서 LLM을 실제로 불렀는지. 호출부가 기록에 모델명을
    남길지 정하는 근거다 — 생략된 검사(배점표 없음·배정 항목 없음)는 PII 스캔만
    돌아서 LLM이 한 번도 개입하지 않는다."""
    pii = scan_pii(content)
    if not os.path.isfile(scoring_path):
        return {"coverage": [], "pii": pii, "llm_used": False,
                "skipped": "배점표 미추출(rfp_scoring.json 없음) — coverage 검사 생략"}

    with open(scoring_path, encoding="utf-8") as f:
        criteria = json.load(f).get("criteria", [])
    assignments = role_router_node({"scoring_table": criteria})["role_assignments"]
    assigned = {a["scoring_item"] for a in assignments if a["role"] == team}
    team_table = [c for c in criteria if c["item"] in assigned]
    if not team_table:
        return {"coverage": [], "pii": pii, "llm_used": False,
                "skipped": f"{team}팀 배정 항목 없음 — coverage 검사 생략"}

    sections = [
        {"scoring_item": c["item"], "title": f"{team}팀 작성물", "content": content, "sources": []}
        for c in team_table
    ]
    report = verification_node({"scoring_table": team_table, "sections": sections})
    return {"coverage": report["coverage_report"], "pii": pii, "skipped": None,
            "llm_used": report["llm_used"]}


COVERAGE_MAP_VERSION = 2


def load_coverage_map(path: str) -> dict:
    """`coverage_map.json`을 **항상 v2 모양**으로 돌려준다: `{version, items, teams}`.

    v1은 항목명을 그대로 최상위 키로 쓰고 `pii_count`를 항목마다 복제해 넣었다.
    PII는 업로드 본문 **1회 스캔 결과(= 팀 단위 사실)** 라 항목별로 분해할 수 없는데도
    그렇게 저장한 탓에 ⓐ화면이 항목 수만큼 부풀려 세거나(3건·12항목 → 36건) ⓑ배점표를
    다시 뽑아 어떤 항목이 그 팀 배정에서 빠지면 옛 값이 stale로 남아 같은 팀 항목끼리
    값이 갈렸다. v2는 팀당 한 번만 적어 두 문제를 함께 없앤다.

    옛 파일을 고쳐 쓰지 않고 **읽을 때 올려서** 본다 — 이미 만들어진 산출물이
    (아카이브에 복사된 것 포함) 그대로 열려야 하기 때문이다.
    """
    if not os.path.isfile(path):
        return {"version": COVERAGE_MAP_VERSION, "items": {}, "teams": {}}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("version") == COVERAGE_MAP_VERSION:
        return {"version": COVERAGE_MAP_VERSION,
                "items": data.get("items") or {}, "teams": data.get("teams") or {}}

    items: dict = {}
    teams: dict = {}
    for item, row in data.items():
        if not isinstance(row, dict):
            continue
        team = row.get("team")
        items[item] = {"team": team, "covered": bool(row.get("covered")),
                       "gap_note": row.get("gap_note")}
        # v1의 복제값 중 **가장 큰 것**을 그 팀의 값으로 본다. 같은 팀 항목끼리 값이
        # 갈린 파일(위 ⓑ)에서 과소집계로 떨어지지 않게 하는 쪽을 고른다.
        if team:
            teams[team] = {"pii_count": max((teams.get(team) or {}).get("pii_count", 0),
                                            int(row.get("pii_count") or 0))}
    return {"version": COVERAGE_MAP_VERSION, "items": items, "teams": teams}


def write_coverage_map(out_dir: str, team: str, coverage: list[dict], pii_count: int) -> None:
    """항목별 커버리지를 병합 저장한다(v2).

    `pii_count`는 항목이 아니라 **그 팀의 값**이므로 `teams`에 한 번만 적는다.
    항목마다 복제하던 예전 구조가 화면의 `max` 휴리스틱과 stale 키 문제를 낳았다
    (자세한 배경은 `load_coverage_map` 참고).
    """
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "coverage_map.json")
    data = load_coverage_map(path)          # 옛 파일이면 여기서 v2로 올라온다
    for c in coverage:
        data["items"][c["scoring_item"]] = {
            "team": team, "covered": c["covered"], "gap_note": c["gap_note"],
        }
    data["teams"][team] = {"pii_count": pii_count}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
