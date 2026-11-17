"""배치 폴더가 collector/SCHEMA.md v1을 지키는지 검사한다.

**중립 계약 모듈이다** — 망 밖(collector)과 망 안(server)이 같은 검증기를 쓴다.
따로 만들면 SCHEMA v2 때 두 곳을 고쳐야 하는 "두 개의 진실"이 생기고, server가
collector를 import하면 폐쇄망 배포에 DMZ FastAPI 앱이 딸려온다. 그래서 어느 쪽도
아닌 자리에 둔다.

그 대가로 이 모듈은 **표준 라이브러리만** 쓰고 server·agent·collector 어느 것도
import하지 않는다. 순수 형식 파서라 네트워크 경로를 만들지 않는다 — 양쪽이 같은
JSON 라이브러리를 쓰는 것과 같은 성격이다.

실패는 예외가 아니라 메시지 목록으로 돌려준다.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

SUPPORTED_SCHEMA_VERSIONS = (1,)
SCHEMA_MINOR_MAX = 1   # checks[] 가 생긴 minor (SCHEMA.md ④-2)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BATCH_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{4}_[a-z0-9-]+$")
CONFIDENCE_VALUES = ("확정", "예상")
REQUIRED_RECORD_FIELDS = ("notice_id", "title", "institution", "evidence")


def validate_batch(batch_dir: Path | str) -> list[str]:
    """오류 메시지 목록을 돌려준다. 빈 목록이면 통과."""
    batch_dir = Path(batch_dir)
    errors: list[str] = []

    if not batch_dir.is_dir():
        return [f"배치 디렉터리가 아닙니다: {batch_dir}"]

    manifest_path = batch_dir / "manifest.json"
    if not manifest_path.is_file():
        return ["manifest.json이 없습니다"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return [f"manifest.json을 읽을 수 없습니다: {exc}"]

    version = manifest.get("schema_version")
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        # 상위 버전은 조용히 부분 처리하지 않는다 (SCHEMA.md §⑨)
        return [f"지원하지 않는 schema_version입니다: {version!r}"]

    # checks 가 있는데 minor 를 모르면 조용히 버리지 않고 배치를 거부한다(security 1차 (e)).
    if manifest.get("checks") is not None:
        minor = manifest.get("schema_minor")
        if isinstance(minor, bool) or not isinstance(minor, int) or not 1 <= minor <= SCHEMA_MINOR_MAX:
            return [f"UNSUPPORTED_MINOR: schema_minor가 없거나 지원 범위(1~{SCHEMA_MINOR_MAX})를 벗어났습니다"]

    batch_id = manifest.get("batch_id")
    if not isinstance(batch_id, str) or not BATCH_ID_RE.match(batch_id or ""):
        errors.append(f"batch_id 형식이 잘못됐습니다: {batch_id!r}")
    elif batch_id != batch_dir.name:
        errors.append(f"batch_id({batch_id})와 폴더명({batch_dir.name})이 다릅니다")

    if not manifest.get("collected_at"):
        errors.append("collected_at이 없습니다")

    source = manifest.get("source") or {}
    if not source.get("slug"):
        errors.append("source.slug이 없습니다")

    if not (batch_dir / "institutions.csv").is_file():
        errors.append("institutions.csv가 없습니다")

    records = manifest.get("records")
    if not isinstance(records, list):
        return errors + ["records가 배열이 아닙니다"]

    seen: set[str] = set()
    for index, record in enumerate(records):
        errors.extend(_validate_record(record, index, batch_dir, seen))
    errors.extend(_validate_checks(manifest, batch_dir))
    return errors


def _validate_record(record, index: int, batch_dir: Path, seen: set[str]) -> list[str]:
    where = f"records[{index}]"
    if not isinstance(record, dict):
        return [f"{where}: 객체가 아닙니다"]

    errors: list[str] = []
    for name in REQUIRED_RECORD_FIELDS:
        if not record.get(name):
            errors.append(f"{where}.{name}이(가) 없습니다")

    notice_id = record.get("notice_id")
    if isinstance(notice_id, str):
        if notice_id in seen:
            errors.append(f"{where}: notice_id가 중복입니다 ({notice_id})")
        seen.add(notice_id)

    institution = record.get("institution") or {}
    if isinstance(institution, dict) and not institution.get("name_ko"):
        errors.append(f"{where}.institution.name_ko가 없습니다")

    schedule = record.get("schedule") or {}
    if isinstance(schedule, dict):
        for key in ("posted_at", "deadline_at", "contract_end", "last_bid"):
            value = schedule.get(key)
            if value is not None and not DATE_RE.match(str(value)):
                errors.append(f"{where}.schedule.{key}: YYYY-MM-DD가 아닙니다 ({value!r})")
        confidence = schedule.get("confidence")
        if confidence is not None and confidence not in CONFIDENCE_VALUES:
            errors.append(f"{where}.schedule.confidence: 허용값이 아닙니다 ({confidence!r})")

    for attachment in record.get("attachments") or []:
        errors.extend(_validate_attachment(attachment, where, batch_dir))
    errors.extend(_validate_notice_candidate(record, where))
    return errors


# NEXT 80 — notice(공고 사실)·candidate(기관 일정 '후보')는 선택 칸이다(schema_version 1 유지).
# 있으면 형식을 지켜야 하고, 후보의 모든 값은 근거 문장(basis)을 가져야 한다.
NOTICE_KINDS = ("계획", "재공고", "결과", "지정", "기타")
CANDIDATE_DATE_KEYS = ("contract_start", "contract_end", "last_bid", "notice_at", "deadline_at")


def _validate_notice_candidate(record: dict, where: str) -> list[str]:
    errors: list[str] = []
    notice = record.get("notice")
    if notice is not None:
        if not isinstance(notice, dict):
            errors.append(f"{where}.notice: 객체가 아닙니다")
        elif notice.get("kind") is not None and notice["kind"] not in NOTICE_KINDS:
            errors.append(f"{where}.notice.kind: 허용값이 아닙니다 ({notice['kind']!r})")
    cand = record.get("candidate")
    if cand is None:
        return errors
    if not isinstance(cand, dict):
        return errors + [f"{where}.candidate: 객체가 아닙니다"]
    if cand.get("status") != "후보":
        errors.append(f"{where}.candidate.status: '후보'여야 합니다 ({cand.get('status')!r})")
    fields = cand.get("fields")
    basis = cand.get("basis")
    if not isinstance(fields, dict) or not isinstance(basis, list):
        return errors + [f"{where}.candidate: fields(객체)·basis(배열)가 필요합니다"]
    for key in CANDIDATE_DATE_KEYS:
        if key in fields and not DATE_RE.match(str(fields[key])):
            errors.append(f"{where}.candidate.fields.{key}: YYYY-MM-DD가 아닙니다 ({fields[key]!r})")
    if "term" in fields and not (isinstance(fields["term"], int) and fields["term"] > 0):
        errors.append(f"{where}.candidate.fields.term: 양의 정수여야 합니다")
    based = {b.get("field") for b in basis if isinstance(b, dict) and isinstance(b.get("text"), str)}
    for key in fields:
        if key not in based:
            errors.append(f"{where}.candidate.fields.{key}: basis(근거)가 없습니다")
    return errors


def _validate_attachment(attachment, where: str, batch_dir: Path) -> list[str]:
    if not isinstance(attachment, str):
        return [f"{where}.attachments: 문자열 경로여야 합니다"]
    if attachment.startswith("/") or re.match(r"^[A-Za-z]:", attachment):
        return [f"{where}.attachments: 절대경로는 허용되지 않습니다"]
    if ".." in Path(attachment).parts:
        return [f"{where}.attachments: 상위 경로 참조는 허용되지 않습니다"]
    if not attachment.startswith("files/"):
        return [f"{where}.attachments: files/ 아래여야 합니다"]
    if not (batch_dir / attachment).is_file():
        return [f"{where}.attachments: 파일이 없습니다"]
    return []


# ── checks[] — SCHEMA.md ④-2 (v1.1, 선택 칸). 형식만 본다. 개인정보·파일 내용 검사는 망 안 서버의 몫이다. ──
# ⚠️ 이 블록은 BatchSchema.java 의 validateChecks 와 한 쌍이다. 한쪽만 고치지 않는다.
# ⚠️ 오류 문구에는 **받은 값을 싣지 않는다**(위치·필드 이름만) — 422 응답이 2차 유출 경로가 되지 않게.
MAX_CHECKS = 2000
MAX_CHECK_ATTACHMENTS = 5
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_BATCH_BYTES = 200 * 1024 * 1024
MAX_REPORTED_COUNT = 100000
MAX_CHECK_PATH_LEN = 86          # "files/" 6자 + 이름 80자
CHECK_STATUSES = ("found", "not_found", "error")
CHECK_KINDS = ("notice", "press")
CONFIDENCE_LEVELS = ("high", "mid", "low")
REPORTED_SCOPES = ("body", "meta", "annot", "form", "bookmark", "filename")
CHECK_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,40}")
SOURCE_SLUG_RE = re.compile(r"[a-z0-9-]{1,30}")
CODE_RE = re.compile(r"[a-z_]{1,30}")
REGION_RE = re.compile(r"[0-9]{2,5}")
DATE_STRICT_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
DATETIME_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?[+-][0-9]{2}:[0-9]{2}")
URL_RE = re.compile(r"https?://[\x21-\x7E]{1,490}")
SHA256_RE = re.compile(r"[0-9a-f]{64}")
CHECK_PATH_RE = re.compile(r"files/(?!\.)[A-Za-z0-9._-]+\.(?:pdf|hwp|hwpx)")
RESERVED_NAME_RE = re.compile(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", re.IGNORECASE)
TOOL_RE = re.compile(r"[A-Za-z0-9._ -]{1,40}")
_BAD_CATEGORIES = ("Cc", "Cf", "Zl", "Zp", "Cs")


def _text_ok(value, max_len: int) -> bool:
    if not isinstance(value, str) or not value.strip() or len(value) > max_len:
        return False
    return not any(unicodedata.category(c) in _BAD_CATEGORIES for c in value)


def _opt_text(value, max_len: int) -> bool:
    return value is None or _text_ok(value, max_len)


def _opt_match(pattern, value) -> bool:
    return value is None or (isinstance(value, str) and pattern.fullmatch(value) is not None)


def _is_int(value, lo: int, hi: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and lo <= value <= hi


def _validate_checks(manifest: dict, batch_dir: Path) -> list[str]:
    checks = manifest.get("checks")
    if checks is None:
        return []
    if not isinstance(checks, list):
        return ["checks가 배열이 아닙니다"]
    if len(checks) > MAX_CHECKS:
        return [f"checks 건수가 상한({MAX_CHECKS})을 넘습니다"]
    errors: list[str] = []
    ids: set[str] = set()
    paths: set[str] = set()
    total = [0]
    for index, check in enumerate(checks):
        errors.extend(_validate_check(check, index, batch_dir, ids, paths, total))
    if total[0] > MAX_BATCH_BYTES:
        errors.append("checks 첨부 합계가 상한(200 MiB)을 넘습니다")
    return errors


def _validate_check(check, index: int, batch_dir: Path, ids: set, paths: set, total: list) -> list[str]:
    where = f"checks[{index}]"
    if not isinstance(check, dict):
        return [f"{where}: 객체가 아닙니다"]
    errors: list[str] = []

    check_id = check.get("check_id")
    if not isinstance(check_id, str) or not CHECK_ID_RE.fullmatch(check_id):
        errors.append(f"{where}.check_id: 형식이 잘못됐습니다")
    elif check_id.lower() in ids:       # Windows 는 대소문자를 구분하지 않아 저장 이름이 겹친다
        errors.append(f"{where}.check_id: 중복입니다")
    else:
        ids.add(check_id.lower())

    inst = check.get("institution")
    if not isinstance(inst, dict):
        errors.append(f"{where}.institution: 객체가 아닙니다")
    else:
        if not _text_ok(inst.get("name_ko"), 100):
            errors.append(f"{where}.institution.name_ko: 형식이 잘못됐습니다")
        if not _opt_text(inst.get("type"), 30):
            errors.append(f"{where}.institution.type: 형식이 잘못됐습니다")
        for key in ("region_code", "sub_region_code"):
            if not _opt_match(REGION_RE, inst.get(key)):
                errors.append(f"{where}.institution.{key}: 형식이 잘못됐습니다")

    status = check.get("status")
    if status not in CHECK_STATUSES:
        errors.append(f"{where}.status: 허용값이 아닙니다")
    ca = check.get("checked_at")
    if not (isinstance(ca, str) and DATETIME_RE.fullmatch(ca)):
        errors.append(f"{where}.checked_at: 형식이 잘못됐습니다")
    kind = check.get("source_kind")
    if kind not in CHECK_KINDS:
        errors.append(f"{where}.source_kind: 허용값이 아닙니다")
    slug = check.get("source_slug")
    if not (isinstance(slug, str) and SOURCE_SLUG_RE.fullmatch(slug)):
        errors.append(f"{where}.source_slug: 형식이 잘못됐습니다")

    code = check.get("error_code")
    if status == "error":
        if not (isinstance(code, str) and CODE_RE.fullmatch(code)):
            errors.append(f"{where}.error_code: 형식이 잘못됐습니다")
    elif not _opt_match(CODE_RE, code):
        errors.append(f"{where}.error_code: 형식이 잘못됐습니다")

    if status == "found":
        errors.extend(_validate_found(check, where, kind))

    attachments = check.get("attachments")
    if attachments is not None:
        if not isinstance(attachments, list) or len(attachments) > MAX_CHECK_ATTACHMENTS:
            errors.append(f"{where}.attachments: 배열이 아니거나 건수 상한({MAX_CHECK_ATTACHMENTS})을 넘습니다")
        else:
            for j, att in enumerate(attachments):
                errors.extend(_validate_check_attachment(att, f"{where}.attachments[{j}]", batch_dir, paths, total))
    return errors


def _validate_found(check: dict, where: str, kind) -> list[str]:
    errors: list[str] = []
    match = check.get("match")
    if not isinstance(match, dict):
        errors.append(f"{where}.match: 객체가 아닙니다")
    else:
        if match.get("confidence") not in CONFIDENCE_LEVELS:
            errors.append(f"{where}.match.confidence: 허용값이 아닙니다")
        basis = match.get("basis")
        if not (isinstance(basis, list) and 1 <= len(basis) <= 6
                and all(isinstance(b, str) and CODE_RE.fullmatch(b) for b in basis)):
            errors.append(f"{where}.match.basis: 형식이 잘못됐습니다")
    if kind == "notice":
        n = check.get("notice")
        if not isinstance(n, dict):
            errors.append(f"{where}.notice: 객체가 아닙니다")
        else:
            if not _text_ok(n.get("title"), 300):
                errors.append(f"{where}.notice.title: 형식이 잘못됐습니다")
            if not _opt_text(n.get("number"), 60):
                errors.append(f"{where}.notice.number: 형식이 잘못됐습니다")
            for key in ("posted_at", "deadline_at"):
                if not _opt_match(DATE_STRICT_RE, n.get(key)):
                    errors.append(f"{where}.notice.{key}: YYYY-MM-DD가 아닙니다")
            if not _opt_match(URL_RE, n.get("url")):
                errors.append(f"{where}.notice.url: 형식이 잘못됐습니다")
    elif kind == "press":
        p = check.get("press")
        if not isinstance(p, dict):
            errors.append(f"{where}.press: 객체가 아닙니다")
        else:
            if not _text_ok(p.get("title"), 200):
                errors.append(f"{where}.press.title: 형식이 잘못됐습니다")
            if not _opt_text(p.get("publisher"), 60):
                errors.append(f"{where}.press.publisher: 형식이 잘못됐습니다")
            if not _opt_match(DATE_STRICT_RE, p.get("published_at")):
                errors.append(f"{where}.press.published_at: YYYY-MM-DD가 아닙니다")
            if not _opt_match(URL_RE, p.get("url")):
                errors.append(f"{where}.press.url: 형식이 잘못됐습니다")
    return errors


def _validate_check_attachment(att, w: str, batch_dir: Path, paths: set, total: list) -> list[str]:
    if not isinstance(att, dict):
        return [f"{w}: 객체가 아닙니다"]
    errors: list[str] = []
    path = att.get("path")
    path_ok = (isinstance(path, str) and len(path) <= MAX_CHECK_PATH_LEN
               and CHECK_PATH_RE.fullmatch(path) is not None
               and RESERVED_NAME_RE.fullmatch(path[6:].split(".", 1)[0]) is None)
    if not path_ok:
        errors.append(f"{w}.path: 허용되지 않는 경로 형식입니다")     # 받은 값은 싣지 않는다
    elif path.lower() in paths:
        errors.append(f"{w}.path: 중복입니다")
    else:
        paths.add(path.lower())
        target = batch_dir / path
        if target.is_symlink() or not target.is_file():
            errors.append(f"{w}.path: 파일이 없습니다")
    if not (isinstance(att.get("sha256"), str) and SHA256_RE.fullmatch(att["sha256"])):
        errors.append(f"{w}.sha256: 형식이 잘못됐습니다")
    size = att.get("size")
    if _is_int(size, 1, MAX_FILE_BYTES):
        total[0] += size
    else:
        errors.append(f"{w}.size: 1바이트~20 MiB 정수여야 합니다")
    for key in ("reported_tool", "reported_version"):
        if not _opt_match(TOOL_RE, att.get(key)):
            errors.append(f"{w}.{key}: 형식이 잘못됐습니다")
    for key in ("reported_phones_removed", "reported_landlines_masked", "reported_emails_masked"):
        v = att.get(key)
        if v is not None and not _is_int(v, 0, MAX_REPORTED_COUNT):
            errors.append(f"{w}.{key}: 0 이상 정수여야 합니다")
    scope = att.get("reported_scope")
    if scope is not None and not (isinstance(scope, list) and len(scope) <= len(REPORTED_SCOPES)
                                  and all(s in REPORTED_SCOPES for s in scope)):
        errors.append(f"{w}.reported_scope: 허용값이 아닙니다")
    return errors
