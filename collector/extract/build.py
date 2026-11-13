"""원문 폴더 → CollectedNotice(공고 사실 + 기관 일정 '후보'). 네트워크 없이 다시 돌린다.

후보 값은 항상 근거 문장(basis)과 함께 낸다 — 근거 없는 칸은 만들지 않는다. 확정은 사람 몫이다.
"""

import html
import json
import re
from pathlib import Path

from collector.extract.classify import ROLE, classify, is_candidate_kind

BID_SOURCES = {"g2b"}   # 목록이 입찰공고만 담는 출처
from collector.extract.hwp5 import hwp5_text
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


def _apply_g2b_award(fields: dict, basis: list, award: dict) -> None:
    """나라장터 낙찰 → 후보 칸(bank·award_at·bank_status). 계약은 공고번호로 찾을 수 없어(11-13 실측) 늘 '계약 미확인'."""
    bank = mask_contacts(str(award.get("bidwinnrNm") or ""))[0][:60]
    adate = str(award.get("fnlSucsfDate") or "")[:10]
    adate = adate if re.fullmatch(r"\d{4}-\d{2}-\d{2}", adate) else None
    src = "나라장터 낙찰정보"
    fields["bank"] = bank
    ordinal = str(award.get("bidNtceOrd") or "")[:3]
    basis.append({"field": "bank", "text": f"낙찰자 {bank}" + (f", 낙찰일 {adate}" if adate else "")
                  + (f" (공고 차수 {ordinal})" if ordinal else ""), "from": src})
    if adate:
        fields["award_at"] = adate
        basis.append({"field": "award_at", "text": f"최종 낙찰일 {adate}", "from": src})
    fields["bank_status"] = "우선협상, 계약 미확인"
    basis.append({"field": "bank_status", "text": "낙찰(우선협상) 확인, 계약 정보 없음", "from": src})


def build_candidate(kind: str, posted_at: str | None, texts: list[tuple[str, str]], award: dict | None = None) -> dict:
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
    if award:
        _apply_g2b_award(fields, basis, award)
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


def attachment_path(raw_dir: Path, stored: str) -> Path:
    """meta.json의 첨부 위치를 원문 폴더 안으로 제한한다(조작된 meta로 밖의 파일을 읽지 않게 — security 11-13)."""
    base = raw_dir.resolve()
    path = (base / stored).resolve()
    if not path.is_relative_to(base):
        raise ValueError("첨부 경로가 원문 폴더 밖입니다")
    return path


def notice_from_raw(raw_dir: Path, rel: str) -> CollectedNotice:
    meta = json.loads((raw_dir / "meta.json").read_text(encoding="utf-8"))
    kind = classify(meta["title"])
    award = None
    texts: list[tuple[str, str]] = []
    atts: list[AttachmentRef] = []
    notes: list[str] = []
    if meta.get("source") in BID_SOURCES:
        kind = _bid_kind(kind, meta["title"], raw_dir)
        res = meta.get("g2b_result") if isinstance(meta.get("g2b_result"), dict) else {}
        won = res.get("award") or {}
        own_ord = str(meta.get("number", "")).rsplit("-", 1)[-1]
        if won.get("bidwinnrNm"):
            same_round = str(won.get("bidNtceOrd") or own_ord) == own_ord
            # 나라장터 차수는 같은 입찰의 정정(변경공고)마다 오른다 — 낙찰은 그 입찰 전체의 결과다. 원 공고(000)만
            # '결과'로 올리고(lastBid=원 공고일), 다른 차수는 메모만(같은 회차가 두 날짜로 나가지 않게, qa P2-1).
            if (same_round or own_ord == "000") and kind in ("계획", "재공고"):
                kind, award = "결과", won                 # 낙찰이 확인된 회차는 끝난 회차(lastBid=공고일)
            else:                                        # 다른 차수의 낙찰·변경/취소 공고 — 승격하지 않고 흔적만(qa P2-1·P2-3)
                why = f"같은 공고 차수 {str(won.get('bidNtceOrd'))[:3]}" if not same_round else f"'{kind}' 공고라 승격 안 함"
                notes.append(f"나라장터 낙찰 {str(won['bidwinnrNm'])[:40]} 확인({why})")
        elif (res.get("opening") or {}).get("progrsDivCdNm"):
            notes.append(f"나라장터 개찰결과: {str(res['opening']['progrsDivCdNm'])[:20]}")
        if meta.get("g2b_result_error"):
            notes.append(f"결과 조회 실패: {str(meta['g2b_result_error'])[:120]}")
    unmaskable = set(meta.get("unmaskable_attachments", []))
    for a in meta.get("attachments", []):
        blob = attachment_path(raw_dir, a["stored"]).read_bytes()
        if a["name"].lower().endswith(".hwp"):
            # 구형 HWP: 파일은 싣지 않고(바이너리 안 연락처를 못 가림) 글만 뽑아 근거 글로 쓴다(11-13).
            # 아래 일괄 mask_contacts를 반드시 거친다. 읽기 실패·olefile 미설치는 notes로만.
            try:
                texts.append((f"hwp:{a['name']}", hwp5_text(blob)))
            except ExtractError as exc:
                notes.append(f"{a['name']}: {exc}")
            notes.append(f"첨부 미포함(연락처 가림 불가, 원문 보관소에만): {a['name']}")
            continue
        if a["name"] in unmaskable or not a["name"].lower().endswith(".hwpx"):
            # 연락처를 가릴 수 없는 첨부(PDF)는 망 안 배치에 싣지 않는다(사용자 결정 11-12).
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
    candidate = build_candidate(kind, meta.get("posted_at"), texts, award) if is_candidate_kind(kind) else None
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
        evidence_note=mask_contacts("; ".join(notes))[0] or None,   # 첨부 파일명·오류 문구도 연락처 가림(security 11-13)
    )


COURT_SOURCES = {"scourt"}


def notices_from_raw(raw_dir: Path, rel: str) -> list[CollectedNotice]:
    """원문 하나 → 레코드 목록. 보통 1건, 법원 공고(1건에 법원 여러 곳)는 법원별로 나눈다."""
    meta = json.loads((raw_dir / "meta.json").read_text(encoding="utf-8"))
    if meta.get("source") in COURT_SOURCES:
        from collector.extract.court import court_notices      # 순환 import 방지(court가 이 모듈의 _html_text를 씀)
        return court_notices(raw_dir, rel, meta)
    return [notice_from_raw(raw_dir, rel)]
