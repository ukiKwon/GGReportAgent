"""오케스트레이터 그래프 실행 API — run(백그라운드 시작)/checkpoint(결재 재개)/status(폴링)."""

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from backend.db import get_connection
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["workflow"])


class CheckpointIn(BaseModel):
    approved: bool
    comment: str | None = None


def _svc(request: Request):
    return request.app.state.orchestrator


@router.post("/{institution_id}/run", status_code=202)
def post_run(institution_id: str, request: Request):
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
    finally:
        conn.close()
    if inst is None:
        raise HTTPException(status_code=404, detail="institution not found")
    if not inst.rfp_path:
        raise HTTPException(status_code=400, detail="공고문(rfp_path) 미반입 — 배치 반입이 먼저다")
    run_input = {
        "institution_id": inst.institution_id,
        "institution_name": inst.name_ko,
        "giganlist_dir": "corpus/institutions",
        "report_new_dir": request.app.state.output_root,
        "rfp_path": inst.rfp_path,
        "stage": inst.stage,
        "sections": [],
    }
    try:
        _svc(request).start(institution_id, run_input)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="already running")
    return {"status": "started"}


@router.post("/{institution_id}/checkpoint", status_code=202)
def post_checkpoint(
    institution_id: str, body: CheckpointIn, request: Request, x_user_id: str = Header(...)
):
    try:
        _svc(request).resume(institution_id, body.approved, x_user_id, body.comment)
    except LookupError:
        raise HTTPException(status_code=409, detail="no pending gate")
    except RuntimeError:
        raise HTTPException(status_code=409, detail="graph still running")
    return {"status": "resumed"}


@router.get("/{institution_id}/status")
def get_status(institution_id: str, request: Request):
    svc = _svc(request)
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        tasks = [dict(r) for r in conn.execute(
            """SELECT t.team, t.status, t.progress_pct, t.assignee FROM tasks t
               JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
               WHERE b.institution_id = ?""", (institution_id,)).fetchall()]
        unread = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE institution_id=? AND read_at IS NULL",
            (institution_id,),
        ).fetchone()["n"]
    finally:
        conn.close()
    running = svc.is_running(institution_id)
    return {
        "stage": inst.stage,
        "running": running,
        "pending_gate": None if running else svc.pending_gate(institution_id),
        "tasks": tasks,
        "notifications_unread": unread,
    }
