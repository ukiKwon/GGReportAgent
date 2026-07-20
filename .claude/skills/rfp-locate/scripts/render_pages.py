import argparse
import os

import fitz  # PyMuPDF


def render_pdf_pages(pdf_path: str, out_dir: str, dpi: int = 200) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    written = []
    with fitz.open(pdf_path) as doc:
        for i, page in enumerate(doc):
            pixmap = page.get_pixmap(dpi=dpi)
            out_path = os.path.join(out_dir, f"page_{i}.png")
            pixmap.save(out_path)
            written.append(out_path)
    return written


def main():
    parser = argparse.ArgumentParser(description="Render PDF pages to PNG via PyMuPDF")
    parser.add_argument("pdf_path")
    parser.add_argument("out_dir")
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    paths = render_pdf_pages(args.pdf_path, args.out_dir, dpi=args.dpi)
    for p in paths:
        print(p)


if __name__ == "__main__":
    main()
