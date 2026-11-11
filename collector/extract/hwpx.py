"""hwpx(zip+XML) 본문 텍스트. XML 파서를 쓰지 않는다(외부 엔티티·폭탄 회피) — 정규식으로 <hp:t>만."""

import html
import io
import re
import zipfile

MAX_UNCOMPRESSED = 30 * 1024 * 1024
_SEC = re.compile(r"^Contents/section(\d+)\.xml$")
_T = re.compile(r"<hp:t\b[^>]*>(.*?)</hp:t>", re.S)
_TAG = re.compile(r"<[^>]+>")


class ExtractError(Exception):
    pass


def hwpx_text(data: bytes) -> str:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ExtractError("hwpx(zip)가 아닙니다") from exc
    secs = sorted((int(m.group(1)), i) for i in zf.infolist() if (m := _SEC.match(i.filename)))
    if not secs:
        raise ExtractError("Contents/section*.xml이 없습니다")
    lines: list[str] = []
    for _, info in secs:
        if info.file_size > MAX_UNCOMPRESSED:
            raise ExtractError("hwpx 구간이 너무 큽니다")
        xml = zf.read(info).decode("utf-8", errors="replace")
        for para in xml.split("</hp:p>"):
            text = "".join(html.unescape(_TAG.sub("", t)) for t in _T.findall(para)).strip()
            if text:
                lines.append(text)
    return "\n".join(lines)
