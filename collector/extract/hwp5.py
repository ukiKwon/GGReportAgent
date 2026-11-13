"""구형 HWP(HWP 5.x, OLE 복합 문서) 본문 글 추출 — 사용자 승인(2026-11-12)으로 olefile(BSD) 사용.

대법원 '공탁금 보관은행 지정계획 공고' 첨부처럼 hwpx가 아닌 옛 형식 문서에서 대상 법원 목록을 읽기 위함.
글만 뽑는다(표 칸의 글도 문단으로 나옴). 암호·배포용 문서는 읽지 않는다. 읽을 수 없으면 ExtractError.
"""

from __future__ import annotations

import io
import struct
import zlib

from collector.extract.hwpx import ExtractError

MAX_FILE_BYTES = 30 * 1024 * 1024
MAX_SECTIONS = 50
MAX_SECTION_BYTES = 30 * 1024 * 1024      # 풀린 뒤 크기 상한(zip 폭탄과 같은 방어)
MAX_TEXT_CHARS = 2_000_000                # 뽑은 글 전체 상한(security 11-12 — 메모리 보호)
HWPTAG_PARA_TEXT = 67                     # HWPTAG_BEGIN(16) + 51
_CHAR_CTRL = {0, 10, 13} | set(range(24, 32))      # 1 WCHAR 짜리 제어 문자
_SPAN_CTRL = set(range(1, 32)) - _CHAR_CTRL         # 8 WCHAR(16바이트)를 차지하는 인라인·확장 제어


def _inflate(data: bytes) -> bytes:
    d = zlib.decompressobj(-15)
    out = d.decompress(data, MAX_SECTION_BYTES + 1)
    if len(out) > MAX_SECTION_BYTES or d.unconsumed_tail:
        raise ExtractError("HWP 구간이 너무 큽니다")
    return out


def _para_text(raw: bytes) -> str:
    """제어 문자 사이 글 덩어리를 한 번에 decode(글자마다 객체를 만들지 않음 — security 11-12)."""
    parts, i, start, n = [], 0, 0, len(raw) - 1
    while i < n:
        c = raw[i] | (raw[i + 1] << 8)
        if c < 32:
            if i > start:
                parts.append(raw[start:i].decode("utf-16-le", errors="replace"))
            if c in (10, 13):
                parts.append("\n")
            elif c == 9:
                parts.append("\t")
            i += 16 if c in _SPAN_CTRL else 2
            start = i
            continue
        i += 2
    if start < min(i, len(raw)):
        parts.append(raw[start:min(i, len(raw) - len(raw) % 2)].decode("utf-16-le", errors="replace"))
    return "".join(parts)


def _records(buf: bytes):
    i, n = 0, len(buf)
    while i + 4 <= n:
        h = int.from_bytes(buf[i:i + 4], "little")
        tag, size = h & 0x3FF, (h >> 20) & 0xFFF
        i += 4
        if size == 0xFFF:
            if i + 4 > n:
                break
            size = int.from_bytes(buf[i:i + 4], "little")
            i += 4
        if i + size > n:
            raise ExtractError("HWP 레코드 길이가 맞지 않습니다")
        yield tag, buf[i:i + size]
        i += size


def hwp5_text(data: bytes) -> str:
    """구형 HWP 바이트 → 본문 글(문단마다 줄바꿈)."""
    try:
        import olefile
    except ImportError as exc:          # 승인된 의존성 — 없으면 명확히
        raise ExtractError("olefile이 설치되어 있지 않습니다(pip install olefile)") from exc
    if len(data) > MAX_FILE_BYTES:
        raise ExtractError("HWP 파일이 너무 큽니다")
    if not data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise ExtractError("구형 HWP(OLE) 파일이 아닙니다")
    try:
        ole = olefile.OleFileIO(io.BytesIO(data))
        try:
            header = ole.openstream("FileHeader").read()
            if not header.startswith(b"HWP Document File"):
                raise ExtractError("HWP 문서 머리가 아닙니다")
            flags = int.from_bytes(header[36:40], "little")
            compressed, encrypted, distribute = bool(flags & 1), bool(flags & 2), bool(flags & 4)
            if encrypted or distribute:
                raise ExtractError("암호·배포용 HWP는 읽지 않습니다")
            sections = sorted((e for e in ole.listdir() if len(e) == 2 and e[0] == "BodyText"
                               and e[1].startswith("Section")), key=lambda e: int(e[1][7:] or 0))
            if not sections or len(sections) > MAX_SECTIONS:
                raise ExtractError("HWP 본문 구간 수가 이상합니다")
            out, total = [], 0
            for sec in sections:
                if ole.get_size(sec) > MAX_FILE_BYTES:   # 선언 크기를 먼저 본다(메모리 증폭 방어, security 11-13)
                    raise ExtractError("HWP 구간 선언 크기가 너무 큽니다")
                raw = ole.openstream(sec).read(MAX_FILE_BYTES + 1)
                buf = _inflate(raw) if compressed else raw
                for tag, payload in _records(buf):
                    if tag == HWPTAG_PARA_TEXT:
                        text = _para_text(payload).strip("\n")
                        total += len(text)
                        if total > MAX_TEXT_CHARS:
                            raise ExtractError("HWP 글이 너무 깁니다")
                        out.append(text)
            return "\n".join(t for t in out if t.strip())
        finally:
            ole.close()
    except ExtractError:
        raise
    except (OSError, ValueError, zlib.error, IndexError, KeyError, TypeError, AttributeError,
            RecursionError, MemoryError, struct.error, ArithmeticError) as exc:   # olefile 내부 예외도 감싼다(security 11-12)
        raise ExtractError(f"HWP를 읽을 수 없습니다({type(exc).__name__})") from exc
    except Exception as exc:                 # 외부 파일 해석 — 그 밖의 예외도 공고 하나로 막는다(security 11-13)
        raise ExtractError(f"HWP를 읽을 수 없습니다({type(exc).__name__})") from exc
