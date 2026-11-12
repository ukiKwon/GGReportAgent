"""원문 폴더 → CollectedNotice(공고 사실 + 기관 일정 '후보'). 네트워크 없이 다시 돌린다.

후보 값은 항상 근거 문장(basis)과 함께 낸다 — 근거 없는 칸은 만들지 않는다. 확정은 사람 몫이다.
"""

import html
import json
import re
from pathlib import Path

from collector.extract.classify import ROLE, classify, is_candidate_kind

BID_SOURCES = {"g2b"}   # 목록이 입찰공고만 담는 출처
from collector.extract.hwpx import ExtractError, hwpx_text
from collector.extract.terms import find_deadline, find_period, years_between
from collector.privacy import mask_contacts, vaccine_policy
from collector.sources.base import AttachmentRef, CollectedNotice

_STRIP_BLOCK = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
_TAG = re.compile(r"<[^>]+>")


def _html_text(raw: bytes, encoding: str) -> str:
    enc = "utf-8" if encoding.endswith("-replace") else encoding
    text = raw.decode(enc, errors="replace")
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", _STRIP_BLOCK.sub(" ", text)))).strip()


def build_candidate(kind: str, posted_at: str | None, texts: list[tuple[str, str]]) -> dict:
    fields: dict = {}
    basis: list[dict] = []
    for origin, text in texts:                       # 첨부(hwpx) 우선, 상세 본문은 폴백
        found = find_period(text)
        if found:
            start, end, sentence = found
            fields.update(contract_start=start, contract_end=end, term=years_between(start, end))
            basis += [{"field": "contract_start", "text": sentence, "from": origin},
                      {"field": "contract_end", "text": sentence, "from": origin},
                      {"field": "term", "text": sentence, "from": origin, "derived": True}]
            break
    for origin, text in texts:
        found = find_deadline(text)
        if found:
            fields["deadline_at"] = found[0]
            basis.append({"field": "deadline_at", "text": found[1], "from": origin})
            break
    if posted_at:
        key = "last_bid" if ROLE[kind] == "회차종료" else "notice_at"
        fields[key] = posted_at
        basis.append({"field": key, "text": f"공고 게시일 {posted_at}", "from": "목록 게시일"})
    return {"status": "후보", "kind": kind, "role": ROLE[kind], "fields": fields, "basis": basis}


def _bid_kind(kind: str, title: str, raw_dir: Path) -> str:
    """입찰공고 출처(나라장터): 원문의 공고 종류·재공고 표시가 제목보다 우선한다(data-auditor 11-12 검수).

    변경·취소 공고는 새 회차가 아니므로 '기타', 재공고 표시(reNtceYn=Y)나 제목의 재공고는 '재공고',
    나머지는 진행 중 공고('계획') — '금고 지정' 제목도 결과 공고가 아니다. 처음 보는 공고 종류(연기공고 등)도 '계획'.
    """
    if kind in ("제외", "무관"):
        return kind              # 금리·송달 등은 입찰 출처여도 후보가 아니다(qa 11-12 P3-5)
    try:
        item = json.loads((raw_dir / "detail.html").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        item = {}
    item = item if isinstance(item, dict) else {}
    notice_kind = str(item.get("ntceKindNm") or "")
    if "취소" in notice_kind or "변경" in notice_kind or "취소" in title:
        return "기타"
    if kind == "재공고" or item.get("reNtceYn") == "Y":
        return "재공고"
    return "계획"


def notice_from_raw(raw_dir: Path, rel: str) -> CollectedNotice:
    meta = json.loads((raw_dir / "meta.json").read_text(encoding="utf-8"))
    kind = classify(meta["title"])
    if meta.get("source") in BID_SOURCES:
        kind = _bid_kind(kind, meta["title"], raw_dir)
    texts: list[tuple[str, str]] = []
    atts: list[AttachmentRef] = []
    notes: list[str] = []
    unmaskable = set(meta.get("unmaskable_attachments", []))
    for a in meta.get("attachments", []):
        blob = (raw_dir / a["stored"]).read_bytes()
        if a["name"] in unmaskable or not a["name"].lower().endswith(".hwpx"):
            # 연락처를 가릴 수 없는 첨부(PDF·구형 HWP)는 망 안 배치에 싣지 않는다(사용자 결정 11-12).
            notes.append(f"첨부 미포함(연락처 가림 불가, 원문 보관소에만): {a['name']}")
            continue
        atts.append(AttachmentRef(filename=Path(a["stored"]).name, data=blob))
        if a["name"].lower().endswith(".hwpx"):
            try:
                texts.append((f"hwpx:{a['name']}", hwpx_text(blob)))
            except ExtractError as exc:
                notes.append(f"{a['name']}: {exc}")
    for err in meta.get("attachment_errors", []):
        notes.append(f"첨부 받기 실패 {err.get('name')}: {err.get('error')}")
    texts.append(("상세 본문", _html_text((raw_dir / "detail.html").read_bytes(), meta.get("encoding", "utf-8"))))
    texts = [(origin, mask_contacts(text)[0]) for origin, text in texts]   # 이중 방어: 근거 문장에 연락처 금지
    inst = meta["institution"]
    candidate = build_candidate(kind, meta.get("posted_at"), texts) if is_candidate_kind(kind) else None
    return CollectedNotice(
        notice_id=f"{meta['host']}#{meta['number']}",
        title=mask_contacts(meta["title"])[0],
        institution_name_ko=inst["name_ko"],
        evidence_url=meta["detail_url"],
        posted_at=meta.get("posted_at"),
        confirmed=False,                       # 자동 추출값은 항상 '예상' — 사람이 확인해야 확정
        institution_type=inst.get("type"),
        region_code=inst.get("region_code"),
        attachments=tuple(atts),
        notice_info={"kind": kind, "number": meta["number"], "host": meta["host"],
                     "institution_key": inst.get("key"), "mgt_no": meta.get("native_id"),
                     "department": meta.get("department"), "raw_path": rel,
                     "vaccine": meta.get("vaccine") or vaccine_policy(meta["detail_url"]),
                     "contacts_masked": meta.get("contacts_masked")},
        candidate=candidate,
        evidence_note="; ".join(notes) or None,
    )
