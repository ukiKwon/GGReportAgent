"""날짜·약정기간 찾기. 달력에 없는 날짜는 버린다. 값을 지어내지 않는다."""

import datetime
import re

_D = r"(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*(?:일|\.)?"
PERIOD_RE = re.compile(r"(?:약정|계약|운영|지정)\s*기간[^0-9]{0,15}" + _D + r"\s*[~∼～–\-]\s*" + _D)
DATE_RE = re.compile(_D)
DEADLINE_ANCHOR = re.compile(r"(?:접수|제출)\s*기간")


def iso(y, m, d) -> str | None:
    try:
        return datetime.date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def find_period(text: str):
    """(시작, 끝, 근거문장) 또는 None."""
    m = PERIOD_RE.search(text)
    if not m:
        return None
    start, end = iso(*m.group(1, 2, 3)), iso(*m.group(4, 5, 6))
    if not (start and end) or end < start:
        return None
    return start, end, m.group(0)[:120]


def find_deadline(text: str):
    m = DEADLINE_ANCHOR.search(text)
    if not m:
        return None
    window = text[m.start(): m.end() + 80]
    dates = [iso(*d.groups()) for d in DATE_RE.finditer(window)]
    dates = [d for d in dates if d]
    return (dates[1], window[:120]) if len(dates) >= 2 else None


def years_between(start: str, end: str) -> int:
    days = (datetime.date.fromisoformat(end) - datetime.date.fromisoformat(start)).days + 1
    return max(1, round(days / 365.25))
