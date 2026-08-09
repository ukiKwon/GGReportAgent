import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile

from backend.bidcase_repository import activate_pending_bid_cases
from backend.corpus_validator import validate_corpus
from backend.csv_import import parse_csv
from backend.db import get_connection
from backend.models import CorpusPathIn, Institution, InstitutionImportRow, InstitutionUpdateIn
from backend.repository import (
    create_institution,
    get_institution,
    list_institutions,
    update_institution,
    upsert_institution,
)
from backend.upload_check import load_coverage_map

router = APIRouter(prefix="/institutions", tags=["institutions"])

REPO_ROOT = Path(__file__).resolve().parents[2]


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


def _safe_corpus_path(raw: str) -> Path:
    """리포 루트 기준 상대경로만 허용한다. 위반 시 400."""
    candidate = Path(raw)
    if candidate.is_absolute():
        raise HTTPException(status_code=400, detail="상대경로만 허용됩니다")
    resolved = (REPO_ROOT / candidate).resolve()
    if not resolved.is_relative_to(REPO_ROOT):
        raise HTTPException(status_code=400, detail="리포지토리 밖 경로는 허용되지 않습니다")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail="디렉터리가 아닙니다")
    return resolved


def _issues(items) -> list[dict]:
    return [{"rule": i.rule, "file": i.file, "message": i.message} for i in items]


@router.get("", response_model=list[Institution])
def get_institutions(request: Request) -> list[Institution]:
    conn = _conn(request)
    try:
        return list_institutions(conn)
    finally:
        conn.close()


@router.post("", response_model=Institution, status_code=201)
def post_institution(body: InstitutionImportRow, request: Request) -> Institution:
    """기관 1건을 손으로 추가한다(화면의 '기관 추가').

    id는 CSV 반입과 같은 규칙(`new-`+임의 8자리)으로 서버가 발급한다 — 이름을 그대로
    id로 쓰면 한글·공백·개명 문제를 전부 떠안게 된다.

    같은 이름이 이미 있으면 **409**다. 반입(`POST /import`)이 upsert인 것과 일부러
    다르다: 표를 다시 올리는 것은 정상이지만, 사람이 같은 이름을 다시 누르는 것은
    거의 언제나 실수다.
    """
    name = body.name_ko.strip()
    if not name:
        raise HTTPException(status_code=400, detail="기관명이 비어 있습니다")
    conn = _conn(request)
    try:
        institution_id = create_institution(conn, body.model_copy(update={"name_ko": name}))
        if institution_id is None:
            raise HTTPException(status_code=409, detail=f"이미 있는 기관명입니다 ({name})")
        return get_institution(conn, institution_id)
    finally:
        conn.close()


@router.get("/{institution_id}", response_model=Institution)
def get_institution_detail(institution_id: str, request: Request) -> Institution:
    conn = _conn(request)
    try:
        institution = get_institution(conn, institution_id)
    finally:
        conn.close()
    if institution is None:
        raise HTTPException(status_code=404, detail="institution not found")
    return institution


@router.put("/{institution_id}", response_model=Institution)
def put_institution(institution_id: str, body: InstitutionUpdateIn, request: Request) -> Institution:
    """부분 갱신: 화면 편집을 서버에 반영한다.

    미전송 필드는 기존 값을 보존한다.
    stage 같은 워크플로 필드는 변경할 수 없다."""
    conn = _conn(request)
    try:
        inst = update_institution(conn, institution_id, body)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        return inst
    finally:
        conn.close()


@router.post("/import")
async def import_institutions(file: UploadFile, request: Request) -> dict:
    raw = await file.read()
    try:
        rows = parse_csv(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    conn = _conn(request)
    try:
        try:
            ids = [upsert_institution(conn, row, commit=False) for row in rows]
        except Exception:
            conn.rollback()
            raise
        conn.commit()
    finally:
        conn.close()
    return {"imported": len(ids), "institution_ids": ids}


@router.get("/{institution_id}/artifacts")
def get_institution_artifacts(institution_id: str, request: Request) -> dict:
    conn = _conn(request)
    try:
        institution = get_institution(conn, institution_id)
    finally:
        conn.close()
    if institution is None:
        raise HTTPException(status_code=404, detail="institution not found")
    return {
        "giganlist_dir": institution.giganlist_dir,
        "rfp_path": institution.rfp_path,
        "pptx_path": institution.pptx_path,
    }


@router.get("/{institution_id}/coverage-map")
def get_coverage_map(institution_id: str, request: Request) -> dict:
    """배점표 항목 ↔ 팀 작성물 커버리지 병합 — 배점표 매핑 뷰(계획 C1)의 데이터원."""
    conn = _conn(request)
    try:
        institution = get_institution(conn, institution_id)
    finally:
        conn.close()
    if institution is None:
        raise HTTPException(status_code=404, detail="institution not found")

    out_dir = Path(request.app.state.output_root) / institution.name_ko
    scoring_path = out_dir / "rfp_scoring.json"
    if not scoring_path.is_file():
        # 아직 3단계(배점표 추출) 전 — 빈 상태가 정상이다. **키는 다 채워 보낸다** —
        # 화면이 "있을 때/없을 때"로 분기하지 않게 모양을 하나로 유지한다.
        return {"criteria": [], "total_score": 0, "teams": [], "pii_total": 0}
    scoring = json.loads(scoring_path.read_text(encoding="utf-8"))

    coverage = load_coverage_map(str(out_dir / "coverage_map.json"))
    items = coverage["items"]

    criteria = []
    for c in scoring.get("criteria", []):
        cov = items.get(c["item"], {})
        criteria.append({
            "category": c.get("category"),
            "item": c["item"],
            "score": c.get("score"),
            "team": cov.get("team"),
            "covered": bool(cov.get("covered", False)),
            "gap_note": cov.get("gap_note"),
        })
    # PII는 **항목이 아니라 팀 단위 사실**이다(업로드 본문 1회 스캔 결과). 예전에는
    # 항목마다 같은 값을 복제해 내려줘서 화면이 팀당 max를 집는 휴리스틱으로 방어해야
    # 했다 — 이제 있는 그대로 팀별로 준다. 배점표에서 사라진 팀의 값은 싣지 않는다
    # (stale 키가 화면에 유령 팀으로 뜨는 것을 막는다).
    live_teams = {c["team"] for c in criteria if c["team"]}
    teams = [
        {"team": team, "pii_count": int((row or {}).get("pii_count") or 0)}
        for team, row in sorted(coverage["teams"].items())
        if team in live_teams
    ]
    return {
        "criteria": criteria,
        "total_score": scoring.get("total_score", 0),
        "teams": teams,
        "pii_total": sum(t["pii_count"] for t in teams),
    }


@router.post("/{institution_id}/corpus/validate")
def post_corpus_validate(
    institution_id: str, body: CorpusPathIn, request: Request
) -> dict:
    conn = _conn(request)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")
    finally:
        conn.close()

    report = validate_corpus(_safe_corpus_path(body.path))
    return {
        "ok": report.ok,
        "errors": _issues(report.errors),
        "warnings": _issues(report.warnings),
    }


@router.post("/{institution_id}/corpus")
def post_corpus_register(
    institution_id: str, body: CorpusPathIn, request: Request
) -> dict:
    conn = _conn(request)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")

        resolved = _safe_corpus_path(body.path)
        report = validate_corpus(resolved)
        if not report.ok:
            raise HTTPException(status_code=422, detail={"errors": _issues(report.errors)})

        relative = resolved.relative_to(REPO_ROOT).as_posix()
        conn.execute(
            "UPDATE institutions SET giganlist_dir = ? WHERE institution_id = ?",
            (relative, institution_id),
        )
        activated = activate_pending_bid_cases(conn, institution_id, commit=False)
        conn.commit()
    finally:
        conn.close()

    return {
        "giganlist_dir": relative,
        "activated_bid_cases": activated,
        "warnings": _issues(report.warnings),
    }
