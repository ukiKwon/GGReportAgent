# -*- coding: utf-8 -*-
"""이관문의서(마크다운) → 발송 첨부용 PDF.

    py -3 docs/tools/md2pdf.py docs/이관문의서_WebLogic_확인사항.md

출력은 입력과 같은 자리에 `.pdf` 로 떨어진다. 표준 라이브러리만 쓴다
(폐쇄망 반입 목록을 늘리지 않으려는 것 — pandoc·weasyprint 불필요).

**마크다운이 정본이다.** 문의서를 고치거나 회신을 받아 답변 칸을 채우면
이 스크립트를 다시 돌려 PDF를 새로 뽑는다.

문의서 한 종류만 상대하는 좁은 변환기다 — 제목(#/##/###) · 구분선 · 불릿(들여쓰기
중첩) · **굵게** · `인라인코드` 만 다룬다. 표·코드펜스·이미지는 처리하지 않는다
(문의서에 없다). 다른 문서에 쓰려면 그때 넓힌다.
"""
import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
@page { size: A4; margin: 18mm 16mm 16mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif;
  font-size: 10.5pt; line-height: 1.65; color: #1a1a1a; margin: 0;
}
h1 {
  font-size: 16pt; line-height: 1.4; margin: 0 0 14px;
  padding-bottom: 10px; border-bottom: 2.5px solid #1a1a1a;
}
h2 {
  font-size: 11.5pt; margin: 26px 0 10px; padding: 6px 10px;
  background: #eef1f5; border-left: 4px solid #43506b; color: #26304a;
  page-break-after: avoid;
}
h3 {
  font-size: 11.5pt; margin: 20px 0 8px; color: #12305e;
  page-break-after: avoid;
}
hr { border: 0; border-top: 1px solid #c9cdd4; margin: 20px 0; }
ul { margin: 6px 0; padding-left: 20px; }
li { margin: 3px 0; }
li ul { margin: 2px 0; }
code {
  font-family: Consolas, "D2Coding", monospace; font-size: 9.3pt;
  background: #f2f3f5; padding: 1px 4px; border-radius: 3px;
}
strong { font-weight: 700; }
.answer { list-style: none; margin: 8px 0 4px -20px; }
.answer .label { font-weight: 700; font-size: 10pt; color: #12305e; }
.answer .box {
  margin-top: 4px; min-height: 74px;
  border: 1px solid #9aa2b1; border-radius: 4px; background: #fcfcfd;
}
h3, .answer { page-break-inside: avoid; }
"""


def inline(text):
    out = html.escape(text)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    return out


def convert(md):
    body, stack, item = [], [], None   # stack: 열려 있는 <ul>들의 들여쓰기 레벨

    def flush_item():
        nonlocal item
        if item is None:
            return
        _, text = item
        # "답변:" 은 회신자가 채우는 자리다. PDF에서는 뒤가 비어 있으면 적을
        # 자리가 보이지 않으므로 빈 상자로 바꾼다.
        if re.fullmatch(r"\*\*답변\*\*\s*:\s*", text):
            body.append(
                '<li class="answer"><div class="label">답변</div>'
                '<div class="box"></div></li>'
            )
        else:
            body.append(f"<li>{inline(text)}</li>")
        item = None

    def close_to(level):
        while stack and stack[-1] > level:
            flush_item()
            body.append("</ul>")
            stack.pop()

    def close_all():
        flush_item()
        while stack:
            body.append("</ul>")
            stack.pop()

    for raw in md.splitlines():
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            flush_item()
            continue

        m = re.match(r"^(#{1,3}) (.+)$", stripped)
        if m:
            close_all()
            lvl = len(m.group(1))
            body.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue

        if stripped == "---":
            close_all()
            body.append("<hr>")
            continue

        m = re.match(r"^(\s*)- (.*)$", line)
        if m:
            level = len(m.group(1)) // 2
            flush_item()
            close_to(level)
            if not stack or stack[-1] < level:
                body.append("<ul>")
                stack.append(level)
            item = (level, m.group(2))
            continue

        # 들여쓴 이어지는 줄 — 앞 항목에 이어 붙인다(마크다운 소프트랩).
        if item is not None:
            item = (item[0], item[1] + " " + stripped)
        else:
            close_all()
            body.append(f"<p>{inline(stripped)}</p>")

    close_all()
    return "\n".join(body)


def find_chrome():
    for path in CHROME_CANDIDATES:
        if Path(path).exists():
            return path
    for name in ("chrome", "msedge", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit(
        "크롬/엣지를 찾지 못했다. CHROME_CANDIDATES 에 경로를 추가하거나 PATH 에 넣을 것."
    )


def main():
    if len(sys.argv) < 2:
        raise SystemExit(f"사용법: py -3 {Path(sys.argv[0]).as_posix()} <문서.md> [출력.pdf]")

    src = Path(sys.argv[1]).resolve()
    dst = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else src.with_suffix(".pdf")

    md = src.read_text(encoding="utf-8")
    title = md.splitlines()[0].lstrip("# ").strip()
    page = (
        '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
        f"<body>\n{convert(md)}\n</body></html>"
    )

    with tempfile.TemporaryDirectory() as tmp:
        # 파일명·프로필 디렉터리를 ASCII 임시 경로에 둔다. 한글 경로의 file:// URL 과
        # 기존 프로필 재사용은 둘 다 헤드리스 인쇄를 조용히 실패시킨 적이 있다
        # (2026-08-28 실측: 전용 --user-data-dir 를 주기 전까지 PDF 가 생성되지 않았다).
        tmpdir = Path(tmp)
        src_html = tmpdir / "page.html"
        out_pdf = tmpdir / "out.pdf"
        src_html.write_text(page, encoding="utf-8")

        proc = subprocess.run(
            [
                find_chrome(),
                "--headless=new",
                "--disable-gpu",
                f"--user-data-dir={tmpdir / 'profile'}",
                "--no-pdf-header-footer",
                f"--print-to-pdf={out_pdf}",
                src_html.as_uri(),
            ],
            capture_output=True,
            text=True,
        )
        if not out_pdf.exists():
            sys.stderr.write(proc.stderr)
            raise SystemExit("PDF 생성 실패 — 위 크롬 출력을 볼 것.")

        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out_pdf, dst)

    print(f"{dst}  ({dst.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
