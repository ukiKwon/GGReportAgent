"""PDF 텍스트 추출 CLI — 구현은 리포의 agent/rfp_text.py에 있다.

파이프라인의 rfp_extract_node와 **같은 함수**를 부른다. 사본을 두면 이상 판정
임계값이 갈라져, 사람이 이 스킬로 처리했을 때와 파이프라인이 자동으로 처리했을
때의 판단이 달라진다.
"""

import argparse
import json
import sys
from pathlib import Path

# 이 스크립트는 스킬 폴더에서 직접 실행되므로 리포 루트가 sys.path에 없다.
# scripts → rfp-locate → skills → .claude → 리포 루트
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from agent.rfp_text import extract_pdf_text, is_text_abnormal  # noqa: E402,F401


def main():
    parser = argparse.ArgumentParser(description="Extract text from a PDF via pypdf")
    parser.add_argument("pdf_path")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    result = extract_pdf_text(args.pdf_path)
    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
    else:
        # stdout.buffer bypasses the platform's default text encoding (cp949 on Windows),
        # which would raise UnicodeEncodeError on Korean text in the extracted PDF content.
        sys.stdout.buffer.write(output.encode("utf-8"))


if __name__ == "__main__":
    main()
