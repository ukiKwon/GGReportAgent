import json
import os


def rfp_analysis_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    report_new_dir = state.get("report_new_dir", "report_new")
    institution_dir = os.path.join(report_new_dir, institution_name)

    scoring_path = os.path.join(institution_dir, "rfp_scoring.json")
    text_path = os.path.join(institution_dir, "rfp_text.txt")

    with open(scoring_path, encoding="utf-8") as f:
        scoring_data = json.load(f)
    with open(text_path, encoding="utf-8") as f:
        rfp_text = f.read()

    return {
        "institution_name": scoring_data["institution"],
        "scoring_table": scoring_data["criteria"],
        "rfp_text": rfp_text,
    }
