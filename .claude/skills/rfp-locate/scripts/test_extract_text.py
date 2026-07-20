import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from extract_text import extract_pdf_text, is_text_abnormal

SAMPLE_RFP = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
    "RFP", "수원시 금고 지정 계획 공고문.pdf",
)


def test_extract_pdf_text_normal_pdf():
    result = extract_pdf_text(SAMPLE_RFP)
    assert result["is_abnormal"] is False
    assert result["abnormal_reason"] is None
    assert len(result["pages"]) == 6
    assert "수원시" in result["full_text"]
    assert "【별표1】" in result["pages"][5] or "별표" in result["pages"][5]
    assert result["avg_chars_per_page"] > 50


def test_is_text_abnormal_short_pages():
    pages = ["a" * 10, "b" * 5, "c" * 8]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is True
    assert "avg" in reason.lower() or "char" in reason.lower()


def test_is_text_abnormal_replacement_chars():
    pages = ["normal text here, plenty of characters to pass length check " * 3,
             "�" * 200 + "more text to pad length past fifty chars per page"]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is True
    assert "replacement" in reason.lower() or "�" in reason


def test_is_text_abnormal_clean_text():
    pages = ["normal readable text " * 10, "more normal readable text here " * 10]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is False
    assert reason is None


def test_cli_prints_json_to_stdout():
    script = os.path.join(os.path.dirname(__file__), "extract_text.py")
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    data = json.loads(result.stdout)
    assert data["is_abnormal"] is False
    assert len(data["pages"]) == 6


def test_cli_writes_to_out_file(tmp_path):
    script = os.path.join(os.path.dirname(__file__), "extract_text.py")
    out_path = tmp_path / "result.json"
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP, "--out", str(out_path)],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert len(data["pages"]) == 6
