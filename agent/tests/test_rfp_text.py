"""PDF 텍스트 추출 — 스킬과 파이프라인이 공유하는 결정적 부분."""

import subprocess
import sys
from pathlib import Path

import pytest

from agent.rfp_text import extract_pdf_text, is_text_abnormal

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_RFP = REPO_ROOT / "corpus" / "rfp" / "수원시 금고 지정 계획 공고문.pdf"


def test_clean_text_is_not_abnormal():
    pages = ["정상적으로 읽히는 본문이 충분히 길게 들어 있다. " * 5] * 2
    assert is_text_abnormal(pages) == (False, None)


def test_short_pages_are_abnormal():
    """텍스트 레이어가 없는 이미지 PDF가 여기 걸린다."""
    abnormal, reason = is_text_abnormal(["짧다", "", "역시 짧다"])
    assert abnormal is True
    assert "50" in reason


def test_replacement_chars_are_abnormal():
    """CID 폰트 PDF는 길이는 충분한데 내용이 �로 나온다."""
    abnormal, reason = is_text_abnormal(["�" * 200 + "패딩용 정상 텍스트를 충분히 붙인다"])
    assert abnormal is True
    assert "replacement" in reason


def test_empty_pdf_is_abnormal():
    """페이지가 하나도 없으면 0자이므로 정상일 수 없다 — 0으로 나누지도 않아야 한다."""
    abnormal, reason = is_text_abnormal([])
    assert abnormal is True
    assert reason is not None


@pytest.mark.skipif(not SAMPLE_RFP.is_file(), reason="샘플 공고문 PDF가 없다")
def test_extract_real_rfp_pdf():
    result = extract_pdf_text(str(SAMPLE_RFP))
    assert result["is_abnormal"] is False
    assert result["abnormal_reason"] is None
    assert len(result["pages"]) == 6
    assert "수원시" in result["full_text"]
    assert result["avg_chars_per_page"] > 50


@pytest.mark.skipif(not SAMPLE_RFP.is_file(), reason="샘플 공고문 PDF가 없다")
def test_skill_cli_still_works_standalone():
    """스킬 스크립트는 리포 루트가 sys.path에 없는 상태로 직접 실행된다.

    구현을 agent/로 옮기면서 그 경로가 깨지기 쉬운데, 깨지면 사람이 스킬로
    공고문을 처리하는 길이 막힌다. 그래서 실제로 subprocess로 돌려 본다.
    """
    script = REPO_ROOT / ".claude" / "skills" / "rfp-locate" / "scripts" / "extract_text.py"
    proc = subprocess.run(
        [sys.executable, str(script), str(SAMPLE_RFP)],
        capture_output=True,
        cwd=script.parent,  # 리포 루트가 아닌 자리에서 실행해도 동작해야 한다
    )
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    assert "수원시".encode() in proc.stdout
