import argparse
import json

import pypdf


def is_text_abnormal(pages: list[str]) -> tuple[bool, str | None]:
    total_chars = sum(len(p) for p in pages)
    avg_chars_per_page = total_chars / len(pages) if pages else 0
    if avg_chars_per_page < 50:
        return True, f"avg chars/page {avg_chars_per_page:.1f} is below 50 threshold"

    full_text = "\n".join(pages)
    if full_text:
        replacement_ratio = full_text.count("�") / len(full_text)
        if replacement_ratio > 0.01:
            return True, f"replacement char (�) ratio {replacement_ratio:.1%} exceeds 1%"

    return False, None


def extract_pdf_text(pdf_path: str) -> dict:
    reader = pypdf.PdfReader(pdf_path)
    pages = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(pages)
    avg_chars_per_page = (sum(len(p) for p in pages) / len(pages)) if pages else 0
    is_abnormal, abnormal_reason = is_text_abnormal(pages)

    return {
        "pages": pages,
        "full_text": full_text,
        "avg_chars_per_page": avg_chars_per_page,
        "is_abnormal": is_abnormal,
        "abnormal_reason": abnormal_reason,
    }


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
        import sys
        # stdout.buffer bypasses the platform's default text encoding (cp949 on Windows),
        # which would raise UnicodeEncodeError on Korean text in the extracted PDF content.
        sys.stdout.buffer.write(output.encode("utf-8"))


if __name__ == "__main__":
    main()
