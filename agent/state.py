from typing import TypedDict


class ProposalState(TypedDict, total=False):
    rfp_path: str                   # corpus/rfp/ 아래 공고문 PDF (반입이 채운다)
    rfp_text: str
    rfp_title: str                  # 공고문 제목 원문
    total_score: int                # 배점표 총점
    scoring_table: list[dict]       # [{category, item, score, description}, ...]
    requirements: list[dict]        # [{item, category, weight, risk_flag}, ...]
    institution_name: str
    institution_type: str           # "시"/"구"/"군"/"공공기관"
    matched_district: str | None    # corpus/institutions/ folder name if a full match exists
    institution_spec_dir: str       # path to the spec/ dir to read (existing or newly built)
    archive_pptx_path: str | None   # report_archive/ path if a prior PPTX exists
    sections: list[dict]            # [{scoring_item, title, content, sources}, ...]
    pptx_path: str
    coverage_report: list[dict]     # [{scoring_item, covered: bool, gap_note}, ...]
    revision_count: int
