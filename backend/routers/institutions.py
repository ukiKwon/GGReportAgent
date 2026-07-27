from fastapi import APIRouter, HTTPException, Request, UploadFile

from backend.csv_import import parse_csv
from backend.db import get_connection
from backend.models import Institution
from backend.repository import get_institution, list_institutions, upsert_institution

router = APIRouter(prefix="/institutions", tags=["institutions"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("", response_model=list[Institution])
def get_institutions(request: Request) -> list[Institution]:
    conn = _conn(request)
    try:
        return list_institutions(conn)
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


@router.post("/import")
async def import_institutions(file: UploadFile, request: Request) -> dict:
    raw = await file.read()
    rows = parse_csv(raw)
    conn = _conn(request)
    try:
        ids = [upsert_institution(conn, row) for row in rows]
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
