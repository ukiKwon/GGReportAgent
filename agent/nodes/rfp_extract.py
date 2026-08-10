"""3단계 "RFI 공시" — 공고문 PDF에서 본문과 배점표를 뽑는다.

상위 스펙의 `rfp_locate_node`를 재정의한 노드다. "찾아온다"는 절반은 배치 반입
(collector/SCHEMA.md §⑥, backend/inbox_import.py)이 가져갔다 — 첨부 PDF가
corpus/rfp/에 놓이고 institutions.rfp_path에 기록된다. 그래서 여기 남은 일은
**이미 손에 있는 PDF를 rfp_analysis_node가 읽을 수 있는 두 파일로 만드는 것**이다.

산출물은 `.claude/skills/rfp-locate`가 사람 손으로 만들던 것과 같은 형태다
(`rfp_text.txt` + `rfp_scoring.json`). 즉 이 노드는 그 스킬의 자동화 경로이고,
스킬 쪽은 이 노드가 못 하는 경우(이상 PDF)를 위해 그대로 남는다.
"""

from __future__ import annotations

import json
import os
import sys

from pydantic import BaseModel

from agent.llm import structured_llm
from agent.rfp_text import extract_pdf_text


class RfpExtractError(Exception):
    """사람이 개입해야 한다. 추측으로 진행하지 않는다."""


class ScoringCriterion(BaseModel):
    # level: 배점표가 계→대분류→세부 계층일 때 그 행이 어느 층인지.
    # 1=계(총계 행) · 2=대분류 · 3=세부항목 · None=단층(계층 없는 표, 기존 파일).
    # 선택적이어야 한다 — 기존 rfp_scoring.json·rfp-locate 스킬(사람 경로)의
    # 산출물이 그대로 유효해야 하기 때문(스펙 2026-08-10-scoring-schema-hierarchy §②).
    category: str
    item: str
    score: int
    description: str | None = None
    level: int | None = None


class ScoringTableResult(BaseModel):
    rfp_title: str
    total_score: int
    criteria: list[ScoringCriterion]


SCORING_PROMPT = """다음은 금고 지정 공고문에서 추출한 원문 텍스트입니다.
여기서 **배점표(평가 항목과 배점)** 를 구조화해 주세요.

원문에 없는 항목이나 배점을 절대 만들어내지 마세요. 추출된 텍스트는 표의 컬럼
경계가 무너져 있으므로, 항목명과 배점을 원문에서 확인할 수 있는 것만 옮기세요.
배점표가 없는 공고문이면 criteria를 빈 목록으로 두세요 — 빈 목록은 실패가 아니라
정당한 결과입니다.

- category: 큰 평가 분류 (예: "금융기관의 대내외적 신용도 및 재무구조의 안정성")
- item: 그 분류 아래의 세부 항목
- score: 배점(정수)
- description: 배점 산식이나 단서가 원문에 있으면 그대로, 없으면 null
- level: 배점표가 계층(계 → 대분류 → 세부항목)으로 돼 있으면 각 행이 어느 층인지
  1(계/총계 행), 2(대분류), 3(세부항목)으로 표시하세요. 표에 계층이 없으면
  level을 넣지 마세요(null). 같은 배점을 여러 층에 중복해 만들지 말고,
  **표에 실제로 있는 행만** 그 행의 층으로 옮기세요.

기관명: {institution_name}

공고문 원문:
{rfp_text}
"""


def scoring_consistency(scoring: dict) -> str | None:
    """배점 합계가 총점과 맞는지 **레벨 그룹별로** 본다. 어긋나면 사유, 맞으면 None.

    **LLM 성능에 기대지 않는 방어다.** 2026-08-04 실측에서 `llama3.1:8b`는 합계 96,
    `qwen3:14b`는 **108**(총점 100을 넘겼다)을 냈다. 둘 다 분류는 맞췄고 숫자만
    지어냈는데, 이 규칙이면 둘 다 걸린다. 모델을 키운다고 없어지는 문제가 아니라는
    것이 같은 실측에서 확인됐다.

    **레벨별 합산인 이유** — 2026-08-10 실측에서 `qwen3.5:9b`가 표를 **정확히** 읽어
    계(100)+대분류(합 100)+세부(합 100)를 평면 목록에 담았더니 전체 합 300으로 이
    규칙에 걸렸다(정확한 추출이 오탐당한 첫 사례). 그래서 레벨 그룹(level 없는 행은
    '단층' 한 그룹) 중 **어느 하나라도 총점과 일치하면 통과**한다. 기존 평면 파일은
    그룹이 하나뿐이라 예전과 완전히 같게 동작한다.
    스펙: docs/superpowers/specs/2026-08-10-scoring-schema-hierarchy-design.md §③.

    **오탐을 내지 않는다** — 배점표가 없는 공고문(criteria 빈 목록)은 정당한 결과이고,
    총점을 못 뽑은 경우(0 이하)도 이 규칙이 할 말이 없다. 경고가 한 번이라도 틀리면
    그 다음부터 아무도 읽지 않는다.
    """
    if not scoring:
        return None
    criteria = scoring.get("criteria") or []
    total = scoring.get("total_score") or 0
    if not criteria or total <= 0:
        return None

    by_level: dict[object, int] = {}
    for c in criteria:
        lv = c.get("level")
        by_level[lv] = by_level.get(lv, 0) + int(c.get("score") or 0)
    if any(got == total for got in by_level.values()):
        return None

    if len(by_level) == 1:
        # 평면 표(그룹 하나) — 기존 메시지 포맷 그대로(부호로 어긋난 방향을 보여준다).
        got = next(iter(by_level.values()))
        return (f"배점 합계가 총점과 다릅니다: 항목 {len(criteria)}건 합 {got}점 ≠ 총점 {total}점"
                f" ({got - total:+d}) — 공고문 표를 직접 대조해야 합니다")

    def _label(lv: object) -> str:
        names = {1: "계", 2: "대분류", 3: "세부"}
        return names.get(lv, "단층") if lv is not None else "단층"

    sums = " · ".join(f"{_label(lv)} 합 {got}점" for lv, got in sorted(
        by_level.items(), key=lambda kv: (kv[0] is None, kv[0] if kv[0] is not None else 0)))
    return (f"배점 합계가 총점과 다릅니다: 항목 {len(criteria)}건, 어느 레벨도 총점과 맞지 않음"
            f" ({sums} ≠ 총점 {total}점) — 공고문 표를 직접 대조해야 합니다")


def main_criteria(criteria: list[dict]) -> list[dict]:
    """하류(제안 섹션·커버리지 매칭)가 쓸 **대표 레벨** 행만 남긴다.

    계층 목록을 그대로 흘리면 '계' 행에도 제안 섹션이 생기고 같은 배점이 레벨
    수만큼 중복 매칭된다. 규칙(스펙 §④): 계(1) 행 제외 → 대분류(2)가 있으면
    그것만 → 없으면 세부(3)만 → 레벨이 아예 없으면 전부(기존 평면 동작).

    파일(rfp_scoring.json)에는 전체 계층이 그대로 저장된다 — 이 필터는 상태 주입
    지점(rfp_extract_node·rfp_analysis)에서만 쓴다.
    """
    if not criteria:
        return []
    for target in (2, 3):
        picked = [c for c in criteria if c.get("level") == target]
        if picked:
            return picked
    return [c for c in criteria if c.get("level") != 1]


def rfp_extract_node(state: dict) -> dict:
    rfp_path = state.get("rfp_path")
    if not rfp_path:
        raise RfpExtractError("rfp_path가 없습니다 — 공고문 PDF가 아직 반입되지 않았습니다")
    if not os.path.isfile(rfp_path):
        raise RfpExtractError(f"공고문 PDF를 찾을 수 없습니다: {rfp_path}")

    institution_name = state["institution_name"]
    report_new_dir = state.get("report_new_dir", "data/report_new")
    out_dir = os.path.join(report_new_dir, institution_name)

    extracted = extract_pdf_text(rfp_path)
    if extracted["is_abnormal"]:
        # CID 폰트·이미지 PDF는 비전으로 읽어야 하는데 그건 이 노드의 범위 밖이다.
        # 빈 텍스트로 조용히 진행하면 이후 모든 단계가 근거 없는 문서를 만든다.
        raise RfpExtractError(
            f"PDF 텍스트 추출 결과가 비정상입니다 ({extracted['abnormal_reason']}). "
            f"rfp-locate 스킬로 사람이 페이지를 이미지로 렌더링해 처리해야 합니다: {rfp_path}"
        )

    result: ScoringTableResult = structured_llm(ScoringTableResult).invoke(
        SCORING_PROMPT.format(
            institution_name=institution_name, rfp_text=extracted["full_text"]
        )
    )

    scoring_data = {
        "institution": institution_name,
        "rfp_title": result.rfp_title,
        "total_score": result.total_score,
        "criteria": [c.model_dump() for c in result.criteria],
    }
    # 합계가 안 맞으면 **막지는 않는다** — 본문(rfp_text.txt)은 그대로 쓸모가 있고,
    # 5·8단계에 사람 승인이 있다. 대신 조용히 넘어가지 않게 로그와 상태에 남긴다.
    #
    # **파일에는 쓰지 않는다.** rfp_scoring.json은 `.claude/skills/rfp-locate`가
    # 사람 손으로도 만드는 규격이라, 자동 경로만 필드를 늘리면 두 경로의 모양이 갈린다.
    # 어차피 합계는 criteria만 있으면 언제든 다시 계산된다(backend/consistency.py).
    inconsistency = scoring_consistency(scoring_data)
    if inconsistency:
        print(f"[경고] {institution_name} 배점표 — {inconsistency}", file=sys.stderr)

    # 추출이 끝난 뒤에만 쓴다 — 실패했을 때 반쯤 만들어진 산출물을 남기지 않는다.
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "rfp_text.txt"), "w", encoding="utf-8") as f:
        f.write(extracted["full_text"])
    with open(os.path.join(out_dir, "rfp_scoring.json"), "w", encoding="utf-8") as f:
        json.dump(scoring_data, f, ensure_ascii=False, indent=2)

    return {
        "rfp_text": extracted["full_text"],
        # 상태에는 대표 레벨만 — 하류(섹션 생성·커버리지 매칭)가 '계' 행이나
        # 중복 레벨을 항목으로 오인하지 않게 한다. 파일에는 전체 계층이 남는다.
        "scoring_table": main_criteria(scoring_data["criteria"]),
        "rfp_title": scoring_data["rfp_title"],
        "total_score": scoring_data["total_score"],
        "score_check": inconsistency or "ok",
    }
