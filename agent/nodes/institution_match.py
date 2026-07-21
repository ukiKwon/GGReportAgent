from agent.llm import get_llm
from agent.tools.spec_loader import find_archive_pptx, list_known_institutions


TYPE_PROMPT = """다음 텍스트에 등장하는 발주 기관의 유형을 판단하세요.
"시", "구", "군", "공공기관" 중 하나로만 답하세요.

텍스트:
{rfp_text}
"""


def institution_match_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    rfp_text = state.get("rfp_text", "")
    giganlist_dir = state["giganlist_dir"]
    archive_dir = state.get("archive_dir", "report_archive")

    llm = get_llm()
    response = llm.invoke(TYPE_PROMPT.format(rfp_text=rfp_text))
    institution_type = response.content.strip()

    known = list_known_institutions(giganlist_dir)
    matched_district = institution_name if institution_name in known else None
    institution_spec_dir = (
        f"{giganlist_dir}/{matched_district}/spec" if matched_district else None
    )

    archive_pptx_path = find_archive_pptx(archive_dir, institution_name)

    return {
        "institution_type": institution_type,
        "matched_district": matched_district,
        "institution_spec_dir": institution_spec_dir,
        "archive_pptx_path": archive_pptx_path,
    }
