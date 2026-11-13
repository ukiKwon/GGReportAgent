"""기관장 공개 정보(collector/heads/heads.json) → 로컬 서버 기관장 API 등록(9f, 사용자 11-13: 로컬은 일단 모두 채운다).

사용: python -m collector.heads.load_heads [--base http://localhost:8080] [--dry-run] [--only id1,id2]
- 기관이 DB에 없으면 건너뛴다(기관 이관 029 뒤 다시 돌리면 이어서 들어간다). 이미 현 기관장이 있으면 건너뛴다(사람 값 보호).
- 사진: photo.url(https)을 data/collector/head-photo-src/ 에 내려받아(git 제외) photo.license 로 올린다.
  서버는 PHOTO_LICENSE 코드 중 ENABLED=1 인 것만 받는다 — 공공누리 표시가 없는 사진은 로컬 전용 코드(LOCAL_ONLY,
  kgi-ggreport-web/tools/db/local-only/)를 적용한 DB에서만 들어간다. 내부망 반입 대상이 아니다.
- 등록 사번은 시험 계정(영업팀원 3918264). 자기신고 사번이라 서버는 '검증 안 됨'으로 기록한다.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).with_name("heads.json")
PHOTO_DIR = ROOT / "data" / "collector" / "head-photo-src"
EMP = "3918264"
MAX_PHOTO = 5 * 1024 * 1024


def _req(base, method, path, body=None, button="refresh", files=None):
    headers = {"X-Emp-No": EMP, "X-Screen-Id": "head_card", "X-Button-Id": button}
    data = None
    if files is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in body.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8"))
        name, blob = files
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                     f"Content-Type: application/octet-stream\r\n\r\n".encode("utf-8") + blob + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        data = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except ValueError:
            return e.code, {}


def _photo(rec) -> tuple[str, bytes] | None:
    p = rec.get("photo") or {}
    url = p.get("url") or ""
    if urlsplit(url).scheme != "https":
        return None
    name = f"{rec['institution_id']}{Path(urlsplit(url).path).suffix.lower() or '.jpg'}"
    path = PHOTO_DIR / name
    if not path.is_file():
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 GGReport-collector"})
        with urllib.request.urlopen(r, timeout=30) as resp:
            blob = resp.read(MAX_PHOTO + 1)
        if len(blob) > MAX_PHOTO:
            raise ValueError("사진이 너무 큽니다")
        path.write_bytes(blob)
    return name, path.read_bytes()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only")
    a = ap.parse_args(argv)
    heads = json.loads(DATA.read_text(encoding="utf-8"))["heads"]
    if a.only:
        keep = set(a.only.split(","))
        heads = [h for h in heads if h["institution_id"] in keep]
    st, insts = _req(a.base, "GET", "/institutions")
    ids = {r["institution_id"] for r in insts} if st == 200 else set()
    count = {"added": 0, "exists": 0, "no_inst": 0, "photo": 0, "photo_fail": 0, "item_fail": 0}
    for h in heads:
        inst = h["institution_id"]
        if inst not in ids:
            count["no_inst"] += 1
            continue
        st, d = _req(a.base, "GET", f"/institutions/{inst}/head", button="open_card")
        if d.get("head") and not d.get("head_empty"):
            count["exists"] += 1
            hid = d["head"]["head_id"]
            has_photo = bool(d["head"].get("photo"))
            if not a.dry_run and d["head"].get("name") == h["name"]:          # 같은 사람이고 서버 칸이 비었으면 학력·경력만 채운다
                src = h.get("items_source") or h["source"]
                for fc, key, vals in (("EDU", "education", h.get("edu", [])), ("CAREER", "career", h.get("career", []))):
                    if d["head"].get(key):
                        continue
                    for v in vals:
                        s2, r2 = _req(a.base, "POST", f"/institutions/{inst}/head/items",
                                      {"head_id": hid, "field_cd": fc, "value": v, "source": src}, "item_add")
                        if s2 >= 300:
                            count["item_fail"] += 1
                            print("  칸 실패", inst, fc, s2, r2.get("code"))
        else:
            if a.dry_run:
                print("등록 예정", inst, h["name"]); continue
            body = {k: h[k] for k in ("name", "position", "acting", "first_take_office", "term_start", "term_end", "source") if k in h}
            st, r = _req(a.base, "POST", f"/institutions/{inst}/heads", body, "head_add")
            hid, has_photo = r.get("head_id"), False
            if not hid:
                print("실패", inst, st, r.get("detail") or r.get("code")); continue
            count["added"] += 1
            src = h.get("items_source") or h["source"]
            for fc, vals in (("EDU", h.get("edu", [])), ("CAREER", h.get("career", []))):
                for v in vals:
                    s2, r2 = _req(a.base, "POST", f"/institutions/{inst}/head/items",
                                  {"head_id": hid, "field_cd": fc, "value": v, "source": src}, "item_add")
                    if s2 >= 300:
                        count["item_fail"] += 1
                        print("  칸 실패", inst, fc, s2, r2.get("code"))
        p = h.get("photo") or {}
        if hid and p.get("url") and not has_photo and not a.dry_run:
            try:
                f = _photo(h)
                form = {"head_id": hid, "license_cd": p.get("license", "LOCAL_ONLY"), "src_kind": p.get("src_kind", "HOMEPAGE"),
                        "src_title": p.get("src_title", "기관 공식 누리집 기관장 소개"), "src_url": p["url"], "checked_on": p.get("checked_on", "2026-11-13")}
                s3, r3 = _req(a.base, "POST", f"/institutions/{inst}/head/photos", form, "photo_upload", files=f)
                if s3 < 300:
                    count["photo"] += 1
                else:
                    count["photo_fail"] += 1
                    print("  사진 실패", inst, s3, r3.get("code"))
            except (OSError, ValueError, urllib.error.URLError) as exc:
                count["photo_fail"] += 1
                print("  사진 받기 실패", inst, str(exc)[:80])
    print(json.dumps(count, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
