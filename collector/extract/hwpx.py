"""hwpx(zip+XML) 본문 텍스트. XML 파서를 쓰지 않는다(외부 엔티티·폭탄 회피) — 정규식으로 <hp:t>만.

zip 폭탄 방어(security 7d2ac90): 구간 수·전체 풀린 크기를 **실제로 읽은 바이트**로 제한하고,
깨진·암호화된 zip의 모든 오류를 ExtractError로 바꿔 한 파일이 포장 전체를 멈추지 않게 한다.
"""

import html
import io
import re
import zipfile
import zlib

MAX_SECTIONS = 50
MAX_SECTION_BYTES = 30 * 1024 * 1024
MAX_TOTAL_BYTES = 60 * 1024 * 1024
_SEC = re.compile(r"^Contents/section(\d+)\.xml$")
_T = re.compile(r"<hp:t\b[^>]*>(.*?)</hp:t>", re.S)
_TAG = re.compile(r"<[^>]+>")


class ExtractError(Exception):
    pass


def _read_capped(zf: zipfile.ZipFile, info: zipfile.ZipInfo, budget: int) -> bytes:
    limit = min(MAX_SECTION_BYTES, budget)
    with zf.open(info) as fh:
        data = fh.read(limit + 1)
    if len(data) > limit:
        raise ExtractError("hwpx 구간이 너무 큽니다")
    return data


def hwpx_text(data: bytes) -> str:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
        secs = sorted((int(m.group(1)), i) for i in zf.infolist() if (m := _SEC.match(i.filename)))
        if not secs:
            raise ExtractError("Contents/section*.xml이 없습니다")
        if len(secs) > MAX_SECTIONS:
            raise ExtractError("hwpx 구간이 너무 많습니다")
        lines: list[str] = []
        budget = MAX_TOTAL_BYTES
        for _, info in secs:
            raw = _read_capped(zf, info, budget)
            budget -= len(raw)
            xml = raw.decode("utf-8", errors="replace")
            for para in xml.split("</hp:p>"):
                text = "".join(html.unescape(_TAG.sub("", t)) for t in _T.findall(para)).strip()
                if text:
                    lines.append(text)
        return "\n".join(lines)
    except ExtractError:
        raise
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, NotImplementedError,
            zlib.error, EOFError, OSError, ValueError) as exc:
        raise ExtractError(f"hwpx를 읽을 수 없습니다({type(exc).__name__})") from exc
