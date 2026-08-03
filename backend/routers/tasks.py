import os

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.agent_adapter import stream_chat_reply
from backend.db import get_connection
from backend.models import Task, TaskApprovalIn, TaskDetail, TaskMessageIn
from backend.repository import get_institution
from backend.task_repository import (
    add_message,
    approve_task,
    claim_approver_if_unset,
    claim_assignee_if_unset,
    get_task,
    list_messages,
    submit_task,
    update_draft_content,
)
from backend.upload_check import check_upload, write_coverage_map

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task_detail(task_id: str, request: Request) -> TaskDetail:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        messages = list_messages(conn, task_id)
    finally:
        conn.close()
    return TaskDetail(**task.model_dump(), messages=messages)


@router.post("/{task_id}/submit", response_model=Task)
def post_task_submit(task_id: str, request: Request, x_user_id: str = Header(...)) -> Task:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.assignee != x_user_id:
            raise HTTPException(status_code=403, detail="only the assignee can submit")
        if task.status not in ("대기", "작성중"):
            raise HTTPException(status_code=409, detail="task not in a submittable state")
        submit_task(conn, task_id)
        return get_task(conn, task_id)
    finally:
        conn.close()


@router.post("/{task_id}/approve", response_model=Task)
def post_task_approve(
    task_id: str, body: TaskApprovalIn, request: Request, x_user_id: str = Header(...)
) -> Task:
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.approver is not None and task.approver != x_user_id:
            raise HTTPException(status_code=403, detail="only the approver can approve")
        if task.status != "1차완료":
            raise HTTPException(status_code=409, detail="task not submitted yet")
        claim_approver_if_unset(conn, task_id, x_user_id)
        approve_task(conn, task_id, body.approved)
        return get_task(conn, task_id)
    finally:
        conn.close()


class TaskUploadIn(TaskMessageIn):
    pass  # {"content": str} — 동일 형태지만 의미가 달라 별명으로 둔다


@router.post("/{task_id}/upload")
def post_task_upload(
    task_id: str, body: TaskUploadIn, request: Request, x_user_id: str = Header(...)
):
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        # I-3: /messages와 동일한 선점 관행 — assignee가 NULL(오케스트레이터가 만든
        # 미배정 task)이면 첫 업로드가 담당을 선점한다. 이미 다른 사람이 선점했으면 403.
        if task.assignee is not None and task.assignee != x_user_id:
            raise HTTPException(status_code=403, detail="only the assignee can upload")
        claim_assignee_if_unset(conn, task_id, x_user_id)
        update_draft_content(conn, task_id, body.content)

        row = conn.execute(
            "SELECT i.name_ko FROM bid_cases b JOIN institutions i ON i.institution_id = b.institution_id"
            " WHERE b.bid_case_id = ?", (task.bid_case_id,)
        ).fetchone()
        out_dir = os.path.join(request.app.state.output_root, row["name_ko"]) if row else None
        scoring_path = os.path.join(out_dir, "rfp_scoring.json") if out_dir else ""

        result = check_upload(scoring_path, task.team, body.content)
        uncovered = [c for c in result["coverage"] if not c["covered"]]
        summary = (
            f"업로드 즉시검사 — 담당 {len(result['coverage'])}항목 중 미달 {len(uncovered)}건,"
            f" PII {len(result['pii'])}건"
            + (f" ({result['skipped']})" if result["skipped"] else "")
        )
        add_message(conn, task_id, "agent", summary, author="검증 agent")
        if out_dir and result["coverage"]:
            write_coverage_map(out_dir, task.team, result["coverage"], len(result["pii"]))
        return {"coverage": result["coverage"], "pii_count": len(result["pii"]),
                "skipped": result["skipped"]}
    finally:
        conn.close()


@router.post("/{task_id}/messages")
def post_task_message(
    task_id: str, body: TaskMessageIn, request: Request, x_user_id: str = Header(...)
) -> StreamingResponse:
    conn = _conn(request)
    task = get_task(conn, task_id)
    if task is None:
        conn.close()
        raise HTTPException(status_code=404, detail="task not found")
    if task.assignee is not None and task.assignee != x_user_id:
        conn.close()
        raise HTTPException(status_code=403, detail="task already claimed by another assignee")
    if task.status in ("1차완료", "2차완료"):
        conn.close()
        raise HTTPException(status_code=409, detail="task is not open for chat")

    claim_assignee_if_unset(conn, task_id, x_user_id)
    add_message(conn, task_id, "user", body.content, author=x_user_id)
    history = [m.model_dump() for m in list_messages(conn, task_id)]

    bid_case_row = conn.execute(
        "SELECT institution_id FROM bid_cases WHERE bid_case_id = ?", (task.bid_case_id,)
    ).fetchone()
    institution = get_institution(conn, bid_case_row["institution_id"]) if bid_case_row else None
    giganlist_dir = institution.giganlist_dir if institution else None
    db_path = request.app.state.db_path
    index_db_path = request.app.state.index_db_path
    conn.close()

    def event_stream():
        reply_parts = []
        for chunk in stream_chat_reply(
            task.team, giganlist_dir, history, body.content, index_db_path=index_db_path
        ):
            reply_parts.append(chunk)
            yield chunk
        full_reply = "".join(reply_parts)
        write_conn = get_connection(db_path)
        try:
            add_message(write_conn, task_id, "agent", full_reply)
            update_draft_content(write_conn, task_id, full_reply)
        finally:
            write_conn.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
