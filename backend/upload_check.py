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
    pii = scan_pii(content)
    if not os.path.isfile(scoring_path):
        return {"coverage": [], "pii": pii,
                "skipped": "배점표 미추출(rfp_scoring.json 없음) — coverage 검사 생략"}

    with open(scoring_path, encoding="utf-8") as f:
        criteria = json.load(f).get("criteria", [])
    assignments = role_router_node({"scoring_table": criteria})["role_assignments"]
    assigned = {a["scoring_item"] for a in assignments if a["role"] == team}
    team_table = [c for c in criteria if c["item"] in assigned]
    if not team_table:
        return {"coverage": [], "pii": pii,
                "skipped": f"{team}팀 배정 항목 없음 — coverage 검사 생략"}

    sections = [
        {"scoring_item": c["item"], "title": f"{team}팀 작성물", "content": content, "sources": []}
        for c in team_table
    ]
    report = verification_node({"scoring_table": team_table, "sections": sections})
    return {"coverage": report["coverage_report"], "pii": pii, "skipped": None}


def write_coverage_map(out_dir: str, team: str, coverage: list[dict], pii_count: int) -> None:
    """항목별 커버리지를 병합 저장한다.

    ⚠️ `pii_count`는 **항목 단위가 아니라 팀 단위 값**이다 — `check_upload`가 업로드 본문
    전체를 한 번 스캔한 결과라 항목별로 분해할 수 없다. 아래에서 그 팀의 모든 항목에
    같은 값을 복제해 넣으므로, **읽는 쪽은 항목별로 합산하면 안 된다**(팀당 한 번만 세야
    한다 — `dashboard/js/workflow.js`의 `coverageSummary` 참고).
    """
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "coverage_map.json")
    data = {}
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    for c in coverage:
        data[c["scoring_item"]] = {
            "team": team, "covered": c["covered"],
            "gap_note": c["gap_note"], "pii_count": pii_count,
        }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
