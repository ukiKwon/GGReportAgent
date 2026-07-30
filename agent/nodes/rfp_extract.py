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

from pydantic import BaseModel

from agent.llm import structured_llm
from agent.rfp_text import extract_pdf_text


class RfpExtractError(Exception):
    """사람이 개입해야 한다. 추측으로 진행하지 않는다."""


class ScoringCriterion(BaseModel):
    category: str
    item: str
    score: int
    description: str | None = None


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

기관명: {institution_name}

공고문 원문:
{rfp_text}
"""


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

    # 추출이 끝난 뒤에만 쓴다 — 실패했을 때 반쯤 만들어진 산출물을 남기지 않는다.
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "rfp_text.txt"), "w", encoding="utf-8") as f:
        f.write(extracted["full_text"])
    with open(os.path.join(out_dir, "rfp_scoring.json"), "w", encoding="utf-8") as f:
        json.dump(scoring_data, f, ensure_ascii=False, indent=2)

    return {
        "rfp_text": extracted["full_text"],
        "scoring_table": scoring_data["criteria"],
        "rfp_title": scoring_data["rfp_title"],
        "total_score": scoring_data["total_score"],
    }
