from fastapi import APIRouter, Header, HTTPException, Request

from backend.db import get_connection
from backend.models import Task, TaskApprovalIn, TaskDetail
from backend.task_repository import (
    approve_task,
    claim_approver_if_unset,
    get_task,
    list_messages,
    submit_task,
)

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
