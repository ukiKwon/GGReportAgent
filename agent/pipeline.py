from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.verification import verification_node


def run_pipeline(
    institution_name: str,
    giganlist_dir: str = "giganlist",
    archive_dir: str = "report_archive",
    report_new_dir: str = "report_new",
    max_revisions: int = 3,
) -> dict:
    state = {
        "institution_name": institution_name,
        "giganlist_dir": giganlist_dir,
        "archive_dir": archive_dir,
        "report_new_dir": report_new_dir,
    }

    state.update(rfp_analysis_node(state))
    state.update(institution_match_node(state))

    attempt = 0
    while True:
        state.update(content_writer_node(state))
        state.update(verification_node(state))
        attempt += 1

        all_covered = all(c["covered"] for c in state["coverage_report"])
        if all_covered or attempt > max_revisions:
            break

    state.update(pptx_builder_node(state))
    return state
