"""오케스트레이터 그래프 실행 API — run(백그라운드 시작)/checkpoint(결재 재개)/status(폴링)."""

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel

from agent.pipeline import artifacts_exist
from backend.archive import archive_institution
from backend.db import get_connection
from backend.reindex_service import reindex_archive
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
        latest = conn.execute(
            "SELECT participation_status FROM bid_cases WHERE institution_id = ?"
            " ORDER BY rowid DESC LIMIT 1",
            (institution_id,),
        ).fetchone()
    finally:
        conn.close()
    if inst is None:
        raise HTTPException(status_code=404, detail="institution not found")
    # 참여확정이 팀 Task를 만들고(create_tasks_for_bid_case) 그 뒤에 5·6단계가 흐른다.
    # 이 순서를 규칙으로 막지 않으면 "9단계까지 갔는데 참여 결정은 검토중"인 상태가
    # 만들어진다(실제로 데모에서 그렇게 됐다). 판단이 아니라 선후 규칙이라 여기서 막는다.
    status = latest["participation_status"] if latest else None
    if status != "참여확정":
        raise HTTPException(
            status_code=400,
            detail=("참여 결정이 끝나지 않았습니다"
                    f"(현재: {status or '공고 없음'}) — 워크플로 탭에서 참여 결정 3차 결재가 먼저입니다"),
        )
    # F5: rfp_path가 없어도 사람이 rfp-locate로 반입한 산출물(rfp_scoring.json·
    # rfp_text.txt)이 이미 output_root에 있으면 실행을 막지 않는다 — rfi_agent가
    # artifacts_exist를 다시 확인해 rfp_extract_node를 건너뛴다(agent/orchestrator/subagents.py).
    if not inst.rfp_path and not artifacts_exist(request.app.state.output_root, inst.name_ko):
        raise HTTPException(status_code=400, detail="공고문(rfp_path) 미반입 — 배치 반입이 먼저다")
    run_input = _svc(request).build_run_input(
        inst, request.app.state.output_root, request.app.state.archive_root)
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
            # task_id는 프런트가 지시·보고 로그(GET /tasks/{id})를 여는 열쇠다(계획 C1).
            """SELECT t.task_id, t.team, t.status, t.progress_pct, t.assignee FROM tasks t
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


@router.get("/{institution_id}/timeline")
def get_timeline(institution_id: str, request: Request):
    """단계별 수행 내용 — 메시지와 알림을 한 줄기로 합쳐 시간순으로 준다(계획 C1-fix).

    범위는 GET /status의 tasks 쿼리와 같다: 해당 기관의 **모든** bid_case.
    stage가 NULL인 과거 행도 그대로 내보낸다 — 화면이 '단계 미상'으로 묶는다.
    """
    conn = get_connection(request.app.state.db_path)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")
        messages = conn.execute(
            """SELECT m.stage, m.created_at, t.team, m.role, m.author, m.content, m.task_id,
                      m.model
               FROM messages m
               JOIN tasks t ON t.task_id = m.task_id
               JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
               WHERE b.institution_id = ?""",
            (institution_id,),
        ).fetchall()
        notifications = conn.execute(
            """SELECT stage, created_at, kind, content, task_id
               FROM notifications WHERE institution_id = ?""",
            (institution_id,),
        ).fetchall()
    finally:
        conn.close()

    # model: 그 기록을 남길 때 실제로 쓴 LLM(팀별 작업 로그와 같은 근거). 화면은 값이
    # 있을 때만 `· 🧠 <model>`을 붙이므로, 사람 발화·알림처럼 LLM을 안 쓴 줄은 그대로다.
    events = [
        {"stage": r["stage"], "at": r["created_at"], "kind": "message", "team": r["team"],
         "role": r["role"], "author": r["author"], "content": r["content"],
         "task_id": r["task_id"], "model": r["model"]}
        for r in messages
    ] + [
        # 알림에는 팀이 없다. kind(결재요청·되물음·이관·쪽지)를 role 자리에 실어
        # 화면이 메시지와 같은 줄 형식으로 그릴 수 있게 한다. 알림은 LLM 산출물이
        # 아니므로 model은 언제나 None이다.
        {"stage": r["stage"], "at": r["created_at"], "kind": "notification", "team": None,
         "role": r["kind"], "author": None, "content": r["content"], "task_id": r["task_id"],
         "model": None}
        for r in notifications
    ]
    events.sort(key=lambda e: e["at"])
    return {"events": events}


@router.post("/{institution_id}/complete")
def post_complete(
    institution_id: str,
    request: Request,
    background: BackgroundTasks,
    x_user_id: str = Header(...),
):
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
        # 스펙 §② 17: 아카이브된 산출물이 지식 탭에서 검색돼야 한다.
        # **백그라운드**로 돌린다 — 임베딩이 청크당 1초대라 응답을 붙잡고 있으면
        # 완료 버튼이 몇 십 초씩 멈춘 것처럼 보인다. 실패해도 완료는 200이고,
        # 사유는 쪽지로 간다(부수 작업이 결재를 되돌리면 안 된다 — 계획 D 원칙).
        background.add_task(
            reindex_archive,
            request.app.state.db_path,
            request.app.state.index_db_path,
            request.app.state.archive_root,
            notify_recipient=x_user_id,
        )
        return {"archive_dir": dest, "completed_by": x_user_id}
    finally:
        conn.close()
