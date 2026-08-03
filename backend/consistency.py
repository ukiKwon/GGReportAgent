"""정합성 점검 — 9단계 워크플로와 참여 결정이 앞뒤 맞는지 규칙으로 훑는다.

**LLM을 쓰지 않는다.** 여기서 보는 것은 전부 참/거짓이 분명한 선후 규칙이라
(참여확정 → 팀 Task → 5·6단계), 판단이 필요 없다. 판단이 필요한 것(작성물이 배점
요건을 채웠는가 등)은 검증가(`agent/nodes/verification.py`)의 몫이다.

`POST /run`의 가드가 **앞으로** 어긋나는 것을 막는다면, 이 모듈은 **이미 어긋나 있는**
데이터를 찾는다. 가드가 생기기 전에 만들어진 상태가 남아 있기 때문이다.
"""

import sqlite3
from dataclasses import dataclass
from typing import Callable

# 3단계(RFI 공시)부터는 참여 결정이 끝나 있어야 한다 — 1·2단계는 결정 이전이라 정상이다.
ADVANCED_STAGE = 3


@dataclass(frozen=True)
class Rule:
    name: str
    why: str                       # 무엇이 왜 문제인지 — 사람이 고칠 수 있게
    check: Callable[[dict], str | None]   # 문제면 메시지, 아니면 None


def _stage_without_bid_case(row: dict) -> str | None:
    if row["stage"] >= ADVANCED_STAGE and row["participation_status"] is None:
        return (f"{row['name_ko']}: {row['stage']}단계까지 진행됐는데 공고(bid_case)가 없습니다"
                " — 반입이 누락됐거나 단계가 잘못 올라갔습니다")
    return None


def _stage_without_confirmation(row: dict) -> str | None:
    if row["stage"] >= ADVANCED_STAGE and row["participation_status"] == "검토중":
        return (f"{row['name_ko']}: {row['stage']}단계까지 진행됐는데 참여 결정이"
                f" '{row['participation_status']}'입니다 — 참여확정이 팀 Task를 만들고"
                " 그 뒤에 5·6단계가 흐릅니다")
    return None


def _declined_but_advanced(row: dict) -> str | None:
    if row["stage"] >= ADVANCED_STAGE and row["participation_status"] in ("미참여확정", "보류"):
        return (f"{row['name_ko']}: 참여 결정이 '{row['participation_status']}'인데"
                f" {row['stage']}단계까지 진행됐습니다 — 중단됐어야 합니다")
    return None


def _confirmed_without_tasks(row: dict) -> str | None:
    if row["participation_status"] == "참여확정" and row["task_count"] == 0:
        return (f"{row['name_ko']}: 참여확정인데 팀 Task가 하나도 없습니다"
                " — 확정 당시 research_status가 '완료'가 아니어서 Task 생성이 건너뛰어졌을 수 있습니다")
    return None


RULES: tuple[Rule, ...] = (
    Rule("stage_without_bid_case", "단계는 올라갔는데 근거가 될 공고가 없다", _stage_without_bid_case),
    Rule("stage_without_confirmation", "참여 결정 전에 워크플로가 진행됐다", _stage_without_confirmation),
    Rule("declined_but_advanced", "참여하지 않기로 했는데 진행됐다", _declined_but_advanced),
    Rule("confirmed_without_tasks", "참여확정인데 팀 작업이 만들어지지 않았다", _confirmed_without_tasks),
)


def check_all(conn: sqlite3.Connection, institution_id: str | None = None) -> list[dict]:
    """어긋난 것만 돌려준다. 정상이면 빈 목록."""
    sql = """
        SELECT i.institution_id, i.name_ko, i.stage,
               b.bid_case_id, b.participation_status,
               (SELECT COUNT(*) FROM tasks t WHERE t.bid_case_id = b.bid_case_id) AS task_count
        FROM institutions i
        LEFT JOIN bid_cases b
          ON b.rowid = (SELECT MAX(rowid) FROM bid_cases x
                        WHERE x.institution_id = i.institution_id)
    """
    params: tuple = ()
    if institution_id is not None:
        sql += " WHERE i.institution_id = ?"
        params = (institution_id,)
    sql += " ORDER BY i.institution_id"

    findings = []
    for raw in conn.execute(sql, params).fetchall():
        row = dict(raw)
        row["task_count"] = row["task_count"] or 0
        for rule in RULES:
            message = rule.check(row)
            if message:
                findings.append({
                    "institution_id": row["institution_id"],
                    "name_ko": row["name_ko"],
                    "rule": rule.name,
                    "why": rule.why,
                    "message": message,
                })
    return findings
