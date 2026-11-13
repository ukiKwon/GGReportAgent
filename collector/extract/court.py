"""법원 공탁금 보관은행 공고(소스 scourt) 전용 추출: 원문 1건 → 법원별 후보 여러 건.

규칙(사용자 결정 11-13): last_bid=정기(계획) 공고일, term=원문에 적힌 연수만(날짜 차이로 계산하지 않음),
contract_end=원문 만료(지정 끝났으면 새 기간 끝), '6개월 전' 추정은 하지 않는다(화면 몫). 확정은 사람 몫(항상 '후보'·예상).
공고 첨부는 법원 여러 곳이 공유하므로 배치에 싣지 않는다(원문 보관소에만).
"""

from __future__ import annotations

import re
from pathlib import Path

from collector.extract.build import _html_text, attachment_path
from collector.extract.classify import ROLE, classify_court
from collector.extract.hwp5 import hwp5_text
from collector.extract.hwpx import ExtractError, hwpx_text
from collector.extract.terms import _D, find_period, iso
from collector.privacy import mask_contacts, vaccine_policy
from collector.sources.base import CollectedNotice

MAX_COURTS = 40
# 법원명: 지방법원(+지원·시법원·군법원). 앞이 한글이면 시작하지 않는다(문장 속 글자가 이름에 붙는 것 방지).
COURT = r"(?<![가-힣])[가-힣]{2,6}지방법원(?:\s+[가-힣]{2,5}(?:지원|시법원|군법원))*"
COURT_RE = re.compile(COURT)
MARKER_RE = re.compile(r"[【\[]\s*공개경쟁\s*대상\s*법원\s*[】\]]")
# 목록 끝: 다음 번호 제목('2. 지정기간')·'가. ' 제목·【. 단 법원명이 이어지는 번호 항목('1. 광주지방법원')은 끝이 아니다.
BOUNDARY_RE = re.compile(r"\s(?:\d{1,2}|[가-힣])\s*[.)]\s+(?![가-힣]{2,6}지방법원)|【")
_SEP = r"\s*[~∼～–\-]\s*"
ROW_RE = re.compile("(" + COURT + r")\s*" + _D + _SEP + _D)                       # 별지 표 한 줄: 법원 + 기간
TERM_PERIOD_RE = re.compile(r"(?<!\d)(\d{1,2})\s*년\s*\(\s*" + _D + _SEP + _D + r"\s*\)")   # 5년(2026. 1. 1. ~ 2030. 12. 31.)
NEWBANK_RE = re.compile(r"(?:새로운|신규|새)\s*(?:지정\s*)?은행[^0-9]{0,40}" + _D)          # 새 은행이면 … 2026. 4. 4.
NUMBER_RE = re.compile(r"제\s*(\d{4})\s*[-–]\s*(\d+)\s*호")


class CourtUnreadable(Exception):
    """대상 법원을 읽지 못함(첨부 없음·본문 깨짐·형식 다름). 실패가 아니라 '읽기 불가' 기록 — 원문은 보관, 후보는 없음."""


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


def _dedupe(items):
    return list(dict.fromkeys(items))


def marker_courts(text: str) -> list[str]:
    m = MARKER_RE.search(text)
    if not m:
        return []
    rest = _norm(text[m.end():])
    cut = BOUNDARY_RE.search(rest)
    block = (rest[: cut.start()] if cut else rest)[:800]
    return _dedupe(_norm(c) for c in COURT_RE.findall(block))


def appendix_rows(text: str) -> dict[str, tuple[str, str, str]]:
    """별지 표: 법원 → (시작, 끝, 근거문장). 표 칸이 문단으로 나와도 '법원 다음 기간' 순서만 본다."""
    rows: dict[str, tuple[str, str, str]] = {}
    for m in ROW_RE.finditer(_norm(text)):
        court = _norm(m.group(1))
        start, end = iso(*m.group(2, 3, 4)), iso(*m.group(5, 6, 7))
        if court in rows or not (start and end) or end < start:
            continue
        rows[court] = (start, end, m.group(0)[:120])
    return rows


def notice_period(text: str):
    """공고 전체 지정기간 (연수|None, 시작, 끝, 근거문장) 또는 None. 연수는 원문에 '5년(' 꼴로 적힌 것만."""
    nt = _norm(text)
    m = TERM_PERIOD_RE.search(nt)
    if m:
        term, start, end = int(m.group(1)), iso(*m.group(2, 3, 4)), iso(*m.group(5, 6, 7))
        if start and end and end >= start and 1 <= term <= 30:
            return term, start, end, m.group(0)[:120]
    found = find_period(nt)
    return (None, *found) if found else None


def new_bank_start(text: str):
    m = NEWBANK_RE.search(_norm(text))
    if not m:
        return None
    day = iso(*m.group(1, 2, 3))
    return (day, m.group(0)[:120]) if day else None


def parse_court_text(text: str) -> dict | None:
    courts, rows = marker_courts(text), appendix_rows(text)
    if not courts and not rows:
        return None
    return {"courts": _dedupe(courts + list(rows)), "rows": rows,
            "period": notice_period(text), "new_bank": new_bank_start(text)}


def _texts(raw_dir: Path, meta: dict) -> tuple[list[tuple[str, str]], list[str]]:
    texts: list[tuple[str, str]] = []
    notes: list[str] = []
    for a in meta.get("attachments", []):
        name, blob = a["name"], attachment_path(raw_dir, a["stored"]).read_bytes()
        try:
            if name.lower().endswith(".hwp"):
                texts.append((f"hwp:{name}", hwp5_text(blob)))
            elif name.lower().endswith(".hwpx"):
                texts.append((f"hwpx:{name}", hwpx_text(blob)))
            else:
                notes.append(f"{name}: 글을 읽지 않는 형식")
        except ExtractError as exc:
            notes.append(f"{name}: {exc}")
    for err in meta.get("attachment_errors", []):
        notes.append(f"첨부 받기 실패 {err.get('name')}: {err.get('error')}".strip())
    texts.append(("상세 본문", _html_text((raw_dir / "detail.html").read_bytes(), meta.get("encoding", "utf-8"))))
    return texts, notes


def _candidate(kind: str, posted_at: str | None, origin: str, term, start, end, sentence) -> dict | None:
    fields: dict = {}
    basis: list[dict] = []
    if start and end:
        fields.update(contract_start=start, contract_end=end)
        basis += [{"field": "contract_start", "text": sentence, "from": origin},
                  {"field": "contract_end", "text": sentence, "from": origin}]
        if term:
            fields["term"] = term                                    # 원문 명시 연수 — derived 아님
            basis.append({"field": "term", "text": sentence, "from": origin})
    if posted_at:
        key = "last_bid" if kind == "계획" else "notice_at"          # 계획=정기 공고일, 지정 결과 게시일은 notice_at
        fields[key] = posted_at
        basis.append({"field": key, "text": f"공고 게시일 {posted_at}", "from": "목록 게시일"})
    if not fields:
        return None
    return {"status": "후보", "kind": kind, "role": ROLE[kind], "fields": fields, "basis": basis}


def court_notices(raw_dir: Path, rel: str, meta: dict) -> list[CollectedNotice]:
    title = meta["title"]
    kind = classify_court(title)
    if kind not in ("계획", "지정", "기타"):
        raise CourtUnreadable(f"종류 판정 '{kind}' — 후보를 만들지 않음")
    texts, notes = _texts(raw_dir, meta)
    texts = [(o, mask_contacts(t)[0]) for o, t in texts]            # 근거 문장에 연락처 금지
    parsed, origin = None, ""
    for o, t in texts:                                              # 첨부(hwp) 우선, 상세 본문은 폴백
        parsed = parse_court_text(t)
        if parsed:
            origin = o
            break
    if not parsed:
        # 2020 공고처럼 【공개경쟁 대상법원】 표시 없이 제목에 법원명을 쓴 경우(예: 「제주지방법원 및 광주지방법원
        # 순천지원 공탁금 보관은행 지정계획 공고」) — 제목의 법원명 + 첨부 글의 지정기간(11-13 실측).
        title_courts = _dedupe(_norm(c) for c in COURT_RE.findall(title))
        if title_courts:
            body = next((t for o, t in texts if o != "상세 본문"), texts[-1][1] if texts else "")
            parsed = {"courts": title_courts, "rows": {}, "period": notice_period(body), "new_bank": new_bank_start(body)}
            origin = "제목(법원명)·" + next((o for o, _ in texts if o != "상세 본문"), "상세 본문")
    if not parsed or len(parsed["courts"]) > MAX_COURTS:
        why = ("법원 수가 상한(%d)을 넘음" % MAX_COURTS if parsed else
               "대상 법원 표시(【공개경쟁 대상법원】)·별지 표·제목 법원명을 찾지 못함")
        raise CourtUnreadable(mask_contacts(f"대상 법원을 읽지 못함(읽기 불가) — {why}" + ("; " + "; ".join(notes) if notes else ""))[0][:200])
    # 시·군법원은 화면 범위 밖(NEXT 72) — 후보를 만들지 않고 메모만(qa 11-13 P2-1, 팀 결정)
    out_of_scope = [c for c in parsed["courts"] if re.search(r"(시법원|군법원)$", c)]
    if out_of_scope:
        parsed["courts"] = [c for c in parsed["courts"] if c not in out_of_scope]
        notes = notes + [f"범위 밖 시·군법원 {len(out_of_scope)}곳 제외: " + ", ".join(out_of_scope)]
    if not parsed["courts"]:
        raise CourtUnreadable("대상 법원이 모두 범위 밖(시·군법원)")
    number = meta.get("notice_no")
    if not number:
        for _, t in texts:
            m = NUMBER_RE.search(t)
            if m:
                number = f"제{m.group(1)}-{m.group(2)}호"
                break
    number = number or meta["number"]
    note = [f"공고 1건에 법원 {len(parsed['courts'])}곳 — 법원별 후보로 나눔(첨부는 원문 보관소에만)"] + notes
    if parsed["new_bank"]:
        note.append(f"은행이 바뀌면 업무 개시 {parsed['new_bank'][0]}(원문: {parsed['new_bank'][1]})")
    evidence_note = mask_contacts("; ".join(note))[0]
    out: list[CollectedNotice] = []
    for court in parsed["courts"]:
        row = parsed["rows"].get(court)
        if row:                                                     # 별지: 법원별 기간, 연수는 없음
            term, start, end, sentence = None, row[0], row[1], row[2]
        elif parsed["period"]:
            term, start, end, sentence = parsed["period"]
        else:
            term = start = end = sentence = None
        cand = _candidate(kind, meta.get("posted_at"), origin, term, start, end, sentence) if kind != "기타" else None
        out.append(CollectedNotice(
            notice_id=f"{meta['host']}#{meta['number']}#{court}",
            title=mask_contacts(title)[0],
            institution_name_ko=court,
            evidence_url=meta["detail_url"],
            posted_at=meta.get("posted_at"),
            confirmed=False,                                        # 자동 추출값은 항상 '예상'
            institution_type="법원",
            notice_info={"kind": kind, "number": number, "host": meta["host"], "institution_key": None,
                         "mgt_no": meta.get("native_id"), "department": meta.get("department"), "raw_path": rel,
                         "vaccine": meta.get("vaccine") or vaccine_policy(meta["detail_url"]),
                         "contacts_masked": meta.get("contacts_masked")},
            candidate=cand,
            evidence_note=evidence_note or None))
    return out
