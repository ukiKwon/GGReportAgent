"""eminwon 목록·상세 HTML 파싱(순수 함수). 실측 3유형에 맞춘다(collector/tests/fixtures/eminwon/):

- 강남형: 번호 칸은 글자, 공고번호·제목 칸이 각각 onclick="searchDetail('65649')" 링크
- 순창형: 모든 칸(번호·공고번호·제목·부서·날짜·조회수)이 같은 searchDetail 링크
- 제물포형: href에 not_ancmt_mgt_no=35120, 제목은 <p> 안 링크
칸 위치에 기대지 않고 칸 내용으로 판별한다: 공고번호(제YYYY-N호)·날짜(YYYY-MM-DD)·제목(그 밖에서 가장 긴 글).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

from collector.extract.terms import iso

ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S | re.I)
CELL_RE = re.compile(r"<td\b[^>]*>(.*?)</td>", re.S | re.I)
ID_RE = re.compile(r"searchDetail\(\s*['\"]?(\d+)['\"]?\s*\)|not_ancmt_mgt_no=(\d+)")
NUMBER_RE = re.compile(r"제\s*(\d{4})\s*[-–]\s*(\d+)\s*호")
DATE_RE = re.compile(r"(?<!\d)(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?!\d)")
DOWNLOAD_RE = re.compile(r"goDownLoad\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)")
_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class ListRow:
    mgt_no: str
    title: str
    number: str | None
    department: str | None
    posted_at: str | None


@dataclass(frozen=True)
class AttachmentLink:
    user_file_nm: str
    sys_file_nm: str
    file_path: str


def clean(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", fragment))).strip()


def decode_body(data: bytes, header_charset: str | None = None) -> tuple[str, str]:
    """'공고'가 디코딩되는 첫 인코딩을 쓴다(헤더 → utf-8 → euc-kr → cp949). 못 찾으면 utf-8 대체문자."""
    for enc in ([header_charset] if header_charset else []) + ["utf-8", "euc-kr", "cp949"]:
        try:
            text = data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
        if "공고" in text:
            return text, enc
    return data.decode("utf-8", errors="replace"), "utf-8-replace"


def parse_list(text: str) -> list[ListRow]:
    rows: list[ListRow] = []
    for row in ROW_RE.findall(text):
        m = ID_RE.search(row)
        if not m:
            continue                                   # 머리 행·빈 행
        cells = [clean(c) for c in CELL_RE.findall(row)]
        cells = [c for c in cells if c]
        number = date = None
        rest: list[str] = []
        for c in cells:
            n = NUMBER_RE.search(c)
            if n and not number and len(c) < 40:
                number = f"제{n.group(1)}-{n.group(2)}호"
                continue
            d = DATE_RE.fullmatch(c) or (DATE_RE.match(c) if len(c) <= 30 else None)
            if d and not date:
                date = iso(*d.groups())
                continue
            if c.isdigit():
                continue                               # 번호·조회수
            rest.append(c)
        if not rest:
            continue
        title = max(rest, key=len)
        dept = next((c for c in rest if c is not title and len(c) <= 20), None)
        rows.append(ListRow(mgt_no=m.group(1) or m.group(2), title=title, number=number,
                            department=dept, posted_at=date))
    return rows


def parse_attachments(text: str) -> list[AttachmentLink]:
    return [AttachmentLink(*m.groups()) for m in DOWNLOAD_RE.finditer(text)]
