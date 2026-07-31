"""오케스트레이터 그래프 실행 API — run(백그라운드 시작)/checkpoint(결재 재개)/status(폴링)."""

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from agent.pipeline import artifacts_exist
from backend.archive import archive_institution
from backend.db import get_connection
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["workflow"])


class CheckpointIn(BaseModel):
    approved: bool
    comment: str | None = None
    by: str | None = None  # F10: 있으면 X-User-Id보다 우선해 결재자 이름으로 기록


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
    # F5: rfp_path가 없어도 사람이 rfp-locate로 반입한 산출물(rfp_scoring.json·
    # rfp_text.txt)이 이미 output_root에 있으면 실행을 막지 않는다 — rfi_agent가
    # artifacts_exist를 다시 확인해 rfp_extract_node를 건너뛴다(agent/orchestrator/subagents.py).
    if not inst.rfp_path and not artifacts_exist(request.app.state.output_root, inst.name_ko):
        raise HTTPException(status_code=400, detail="공고문(rfp_path) 미반입 — 배치 반입이 먼저다")
    run_input = {
        "institution_id": inst.institution_id,
        "institution_name": inst.name_ko,
        "giganlist_dir": "corpus/institutions",
        "report_new_dir": request.app.state.output_root,
        "rfp_path": inst.rfp_path,  # 반입 안 됐으면 None 유지 — rfi_agent가 산출물 존재로 판단
        "stage": inst.stage,
        "sections": [],
        # F6: institution_match_node의 기본값("report_archive")과 동일하게 명시 배선.
        # 아카이브 완료 산출물(report_archive)의 실제 승격 경로 통일은 후속 과제.
        "archive_dir": "report_archive",
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
        _svc(request).resume(institution_id, body.approved, body.by or x_user_id, body.comment)
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
        "failed": svc.has_failed(institution_id),
        "tasks": tasks,
        "notifications_unread": unread,
    }


@router.post("/{institution_id}/complete")
def post_complete(institution_id: str, request: Request, x_user_id: str = Header(...)):
    conn = get_connection(request.app.state.db_path)
    try:
        inst = get_institution(conn, institution_id)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        if inst.stage != 9:
            raise HTTPException(status_code=409, detail="stage 9(제출 대기)에서만 완료할 수 있다")
        # I-2: 기관은 1:N bid_case를 가질 수 있다(OrchestratorService._latest_bid_case와
        # 동일 원칙) — complete는 최신 bid_case 1건에만 스코프한다. 과거 bid_case(예:
        # 유찰 후 재입찰)의 상태·tasks를 덮어쓰거나 아카이브에 섞으면 안 된다.
        latest = conn.execute(
            "SELECT bid_case_id FROM bid_cases WHERE institution_id = ?"
            " ORDER BY rowid DESC LIMIT 1",
            (institution_id,),
        ).fetchone()
        bid_case_id = latest["bid_case_id"] if latest else None
        dest = archive_institution(
            conn, inst, request.app.state.output_root, request.app.state.archive_root,
            bid_case_id=bid_case_id,
        )
        if bid_case_id is not None:
            conn.execute(
                "UPDATE bid_cases SET participation_status = '제출완료' WHERE bid_case_id = ?",
                (bid_case_id,),
            )
        conn.commit()
        return {"archive_dir": dest, "completed_by": x_user_id}
    finally:
        conn.close()
