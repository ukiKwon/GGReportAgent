import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from render_pages import render_pdf_pages

SAMPLE_RFP = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
    "RFP", "수원시 금고 지정 계획 공고문.pdf",
)


def test_render_pdf_pages_writes_one_png_per_page(tmp_path):
    out_dir = str(tmp_path)
    paths = render_pdf_pages(SAMPLE_RFP, out_dir)
    assert len(paths) == 6
    for p in paths:
        assert os.path.isfile(p)
        assert p.endswith(".png")
        assert os.path.getsize(p) > 0


def test_render_pdf_pages_are_in_page_order(tmp_path):
    out_dir = str(tmp_path)
    paths = render_pdf_pages(SAMPLE_RFP, out_dir)
    names = [os.path.basename(p) for p in paths]
    assert names == [f"page_{i}.png" for i in range(6)]


def test_cli_renders_and_prints_paths(tmp_path):
    script = os.path.join(os.path.dirname(__file__), "render_pages.py")
    out_dir = str(tmp_path)
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP, out_dir],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    printed = [line for line in result.stdout.strip().splitlines() if line]
    assert len(printed) == 6
    assert all(os.path.isfile(p) for p in printed)
