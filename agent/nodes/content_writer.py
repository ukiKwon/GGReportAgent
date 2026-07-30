import os

from pydantic import BaseModel

from agent.llm import structured_llm


class SectionResult(BaseModel):
    title: str
    content: str
    sources: list[str]


SECTION_PROMPT = """다음 배점표 항목에 대한 제안서 섹션을 작성하세요.

배점 항목: {category} - {item} ({score}점)
설명: {description}

기관 spec 자료:
{spec_content}

{gap_context}

institution-corpus-format Skill의 포맷 규칙을 따르세요: 번호 섹션, "근거자료: spec/NN" 형태의
출처 인용을 본문에 포함하고, sources 필드에도 인용한 파일명을 나열하세요.
"""


def _load_spec_content(institution_spec_dir: str | None) -> str:
    if not institution_spec_dir or not os.path.isdir(institution_spec_dir):
        return "(spec 자료 없음 — 신규 기관, 조사 결과 미제공)"
    parts = []
    for fname in sorted(os.listdir(institution_spec_dir)):
        if fname.endswith(".txt"):
            with open(os.path.join(institution_spec_dir, fname), encoding="utf-8") as f:
                parts.append(f"[{fname}]\n{f.read()}")
    return "\n\n".join(parts)


# 역할별 근거 코퍼스 — 상위 E2E 스펙 §⑤의 표를 그대로 코드화.
# 영업은 spec/ 전체 + bank_ideas_draft.txt, 전산·예산은 plan/ 파일 하나씩.
ROLE_PLAN_FILES = {
    "전산": "plan/02_IT디지털기획_사업제안.txt",
    "예산": "plan/03_금전적지원_사업제안.txt",
}

ROLE_LINE = "당신은 {role}팀 담당자로서 아래 항목의 세부기획을 작성합니다.\n\n"


def _load_role_corpus(institution_spec_dir: str | None, role: str) -> str:
    """역할별 코퍼스 로드. 경로 기준점은 institution_spec_dir(= {기관}/spec)의 부모."""
    if role == "영업":
        parts = [_load_spec_content(institution_spec_dir)]
        if institution_spec_dir and os.path.isdir(institution_spec_dir):
            draft = os.path.join(os.path.dirname(institution_spec_dir), "bank_ideas_draft.txt")
            if os.path.isfile(draft):
                with open(draft, encoding="utf-8") as f:
                    parts.append(f"[bank_ideas_draft.txt]\n{f.read()}")
        return "\n\n".join(parts)

    if not institution_spec_dir or not os.path.isdir(institution_spec_dir):
        return "(spec 자료 없음 — 신규 기관, 조사 결과 미제공)"
    rel = ROLE_PLAN_FILES[role]
    plan_path = os.path.join(os.path.dirname(institution_spec_dir), *rel.split("/"))
    if not os.path.isfile(plan_path):
        return f"({os.path.basename(rel)} 없음 — 해당 분야 기존 제안 미보유)"
    with open(plan_path, encoding="utf-8") as f:
        return f"[{os.path.basename(rel)}]\n{f.read()}"


def content_writer_node(state: dict, role: str | None = None) -> dict:
    scoring_table = state["scoring_table"]

    if role is not None:
        assigned = {
            a["scoring_item"] for a in state.get("role_assignments", []) if a["role"] == role
        }
        scoring_table = [e for e in scoring_table if e["item"] in assigned]
        if not scoring_table:
            return {"sections": []}
        spec_content = _load_role_corpus(state.get("institution_spec_dir"), role)
    else:
        spec_content = _load_spec_content(state.get("institution_spec_dir"))

    coverage_report = state.get("coverage_report", [])
    gap_by_item = {c["scoring_item"]: c["gap_note"] for c in coverage_report if not c["covered"]}

    llm = structured_llm(SectionResult)
    role_line = ROLE_LINE.format(role=role) if role else ""
    sections = []
    for entry in scoring_table:
        gap_context = ""
        if entry["item"] in gap_by_item:
            gap_context = f"이전 시도에서 누락된 점: {gap_by_item[entry['item']]}"

        result: SectionResult = llm.invoke(
            role_line
            + SECTION_PROMPT.format(
                category=entry["category"],
                item=entry["item"],
                score=entry["score"],
                description=entry.get("description") or "(설명 없음)",
                spec_content=spec_content,
                gap_context=gap_context,
            )
        )
        sections.append({
            "scoring_item": entry["item"],
            "title": result.title,
            "content": result.content,
            "sources": result.sources,
        })

    if role is not None:
        return {"sections": sections}
    return {
        "sections": sections,
        "revision_count": state.get("revision_count", 0) + (1 if coverage_report else 0),
    }
