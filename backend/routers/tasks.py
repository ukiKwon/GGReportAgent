import json
import os
import sqlite3

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse, StreamingResponse

from agent.llm import current_model
from backend import task_files
from backend.agent_adapter import failure_notice, stream_chat_reply
from backend.db import get_connection
from backend.models import (
    Task,
    TaskActorIn,
    TaskApprovalIn,
    TaskDetail,
    TaskDraftIn,
    TaskMessageIn,
)
from backend.notification_repository import create_notification
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
from backend.teams import (
    APPROVED_STATUS,
    AUTHORING_TEAMS,
    DESIGNER_TEAM,
    SUBMITTED_STATUS,
    inbox_name,
    is_authoring_team,
    known_recipients,
    lead_of,
)
from backend.upload_check import check_upload, write_coverage_map

router = APIRouter(prefix="/tasks", tags=["tasks"])

def _conn(request: Request):
    return get_connection(request.app.state.db_path)


def _context(conn: sqlite3.Connection, task_id: str) -> sqlite3.Row:
    """task → 그 작업이 속한 기관·공고. 파일 경로와 알림 링크가 둘 다 필요로 한다."""
    row = conn.execute(
        """SELECT t.task_id, t.team, t.status, t.assignee, t.bid_case_id,
                  b.institution_id, i.name_ko, i.stage
           FROM tasks t
           JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
           JOIN institutions i ON i.institution_id = b.institution_id
           WHERE t.task_id = ?""",
        (task_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")
    return row


def _actor(by: str | None, x_user_id: str) -> str:
    """이 요청을 실제로 한 사람. 본문의 `by`가 헤더를 이긴다.

    `X-User-Id`는 ASCII만 실을 수 있어서(A1 F10) 한글 이름은 본문으로 온다. 이걸
    안 보면 담당자 이름이 한글인 작업은 API로 아무것도 못 한다 — 데모의 '최 디자이너'가
    자기 작업에 파일 하나 못 올리고 403을 받는다. `post_checkpoint`와 같은 관행이다.
    """
    return (by or "").strip() or x_user_id


def _require_owner(row: sqlite3.Row, user_id: str) -> None:
    """업로드와 같은 선점 관행 — 미배정이면 먼저 손댄 사람이 맡고, 남의 것이면 403."""
    if row["assignee"] is not None and row["assignee"] != user_id:
        raise HTTPException(status_code=403, detail="only the assignee can modify this task")


def _require_teams_done(conn: sqlite3.Connection, task: Task) -> None:
    """디자이너 제출은 3팀이 자기 일을 끝낸 뒤라야 한다 (사용자 확정).

    디자이너 작업물은 팀 산출물을 **받아서** 만든 것이다. 팀이 아직 쓰고 있는 중이면
    그 위에서 만든 결과물을 결재에 올리는 것은 앞뒤가 맞지 않는다. 판단이 아니라
    선후 규칙이라 화면이 아니라 여기서 막는다(계획 E의 `POST /run` 가드와 같은 논리 —
    화면만 막으면 API로 그대로 뚫린다).

    **디자이너에게만 건다.** 3팀에 걸면 서로를 기다리다 아무도 제출하지 못한다.

    기준은 **`2차완료`(팀장 결재까지 끝남)** 이다. 계획 H에서는 그래프가 팀 Task를
    `1차완료`까지만 올리고 결재할 화면이 없어서 '작업 중이 아닐 것'으로 약하게 잡았는데,
    계획 I가 팀장 결재함을 만들면서 **비로소 이 기준이 성립한다**(사용자 확정 —
    "작업 중이 끝나고 승인완료까지 받은 상태여야 제출 가능한 게 맞다").
    """
    if task.team != DESIGNER_TEAM:
        return
    pending = [
        r["team"] for r in conn.execute(
            "SELECT team, status FROM tasks WHERE bid_case_id = ? AND team <> ? ORDER BY rowid",
            (task.bid_case_id, task.team),
        ).fetchall()
        if is_authoring_team(r["team"]) and r["status"] != APPROVED_STATUS
    ]
    if pending:
        raise HTTPException(
            status_code=409,
            detail=(f"아직 승인되지 않은 팀이 있습니다: {', '.join(pending)} — "
                    "각 팀장 결재가 끝난 뒤에 제출할 수 있습니다"),
        )


def _submit_recipients(team: str) -> list[str]:
    """제출을 결재할 사람. 팀 작업은 그 팀 팀장, 디자이너 작업은 본부장이다.

    예전에는 무엇이든 '영업팀' 고정이었다 — 결재 라인이 없던 시절의 자국이다.
    """
    return [lead_of(team)]


def _read_json(path: str):
    """산출물 JSON — 없으면 None. 없다고 500을 내지 않는다(아직 안 만들어졌을 뿐이다)."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


@router.get("")
def list_tasks(
    request: Request,
    team: str = Query(..., min_length=1),
    status: list[str] | None = Query(default=None),
) -> list[dict]:
    """역할별 작업 목록 — **기관 횡단**이다(계획 H Task 2).

    기존 조회는 전부 기관 단위인데, 디자이너의 작업은 여러 기관에 걸쳐 있다.
    `team`은 필수다 — 없이 열면 남의 작업까지 보이는 전체 조회가 된다
    (`GET /notifications`의 `recipient` 필수와 같은 이유).

    `draft_content`는 싣지 않는다(무겁다). 상세(`GET /tasks/{id}`)에서만 준다.
    """
    sql = """SELECT t.task_id, t.team, t.status, t.progress_pct, t.assignee, t.approver,
                    t.bid_case_id, b.institution_id, i.name_ko, i.stage,
                    b.confirmed_date, b.expected_date, b.schedule_confidence
             FROM tasks t
             JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
             JOIN institutions i ON i.institution_id = b.institution_id
             WHERE t.team = ?"""
    params: list = [team]
    if status:
        sql += f" AND t.status IN ({','.join('?' * len(status))})"
        params.extend(status)

    conn = _conn(request)
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    output_root = request.app.state.output_root
    out = []
    for r in rows:
        # 확정일이 예상일을 이긴다 — 계획 D의 serverdata.applyBidCases와 같은 규칙이다.
        # 화면이 이 선택을 복제하면 두 곳이 어긋나므로 서버가 골라서 준다.
        bid_date = r["confirmed_date"] or r["expected_date"]
        out.append({
            "task_id": r["task_id"], "team": r["team"], "status": r["status"],
            "progress_pct": r["progress_pct"], "assignee": r["assignee"],
            "approver": r["approver"], "bid_case_id": r["bid_case_id"],
            "institution_id": r["institution_id"], "institution_name": r["name_ko"],
            "stage": r["stage"], "bid_date": bid_date,
            "schedule_confidence": r["schedule_confidence"],
            "file_count": task_files.count(output_root, r["name_ko"], r["task_id"]),
        })
    return out


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


@router.get("/{task_id}/handoff")
def get_handoff(task_id: str, request: Request) -> dict:
    """이관 패키지 — 이 작업이 속한 공고의 산출물 일체 (계획 H Task 3, 스펙 §② 14).

    **팀 산출물을 상태로 거르지 않는다.** 그래프 흐름에서 팀 Task는 `draft_team`이
    `1차완료`까지만 올리고, 5단계 기획승인은 기관 단위 checkpoint라 팀 Task를
    `2차완료`로 만들지 않는다(사람이 `POST /tasks/{id}/approve`를 눌러야 탄다).
    '승인난 것만' 거르면 화면이 텅 비고, 무엇보다 **감추면 디자이너가 다 받은 줄 안다**.
    전부 주고 각자의 실제 상태를 함께 실어 화면이 태그로 구분하게 한다.

    **다만 에이전트 전용 단계(RFI분석·취합·검증)는 뺀다** — 그쪽도 tasks 행을 갖지만
    사람 작성물이 없어 항상 빈 카드가 되고, 문의할 상대도 아니다. 그 단계의 산출물은
    아래 `scoring`·`coverage`·`pptx_path`로 따로 실린다.

    산출물 본문은 여기서 주지 않는다 — `GET /documents?path=`가 이미 그 일을 한다.
    """
    conn = _conn(request)
    try:
        ctx = _context(conn, task_id)
        rows = conn.execute(
            """SELECT task_id, team, status, assignee, approver, draft_content FROM tasks
               WHERE bid_case_id = ? AND team <> ? ORDER BY rowid""",
            (ctx["bid_case_id"], ctx["team"]),
        ).fetchall()
        recipients = known_recipients(conn)
        inst = get_institution(conn, ctx["institution_id"])
    finally:
        conn.close()

    out_dir = os.path.join(request.app.state.output_root, ctx["name_ko"])
    output_root = request.app.state.output_root
    teams = [{
        "team": r["team"], "task_id": r["task_id"], "status": r["status"],
        "assignee": r["assignee"], "approver": r["approver"],
        "draft_content": r["draft_content"],
        # 팀명→쪽지 수신자 변환은 서버가 한다(backend/teams.py) — 화면이 '영업'+'팀'
        # 규칙을 복제하면 계정 전환기와 답이 갈라진다.
        "contact": inbox_name(r["team"], recipients),
        # 디자이너는 "각 팀이 작업한 내용을 **받아서**" 작업한다 — 텍스트 작성물만
        # 보여주고 파일을 빼면 정작 받아야 할 실물이 화면에 없다. task_id를 함께
        # 주므로 화면이 GET /tasks/{task_id}/files/{name}으로 바로 내려받는다.
        "files": task_files.listing(output_root, ctx["name_ko"], r["task_id"]),
        # 디자이너 제출을 막는 근거 — **결재까지 끝나야** 넘어갈 수 있다(계획 I).
        "working": r["status"] != APPROVED_STATUS,
    } for r in rows if is_authoring_team(r["team"])]
    return {
        "institution_id": ctx["institution_id"],
        "institution_name": ctx["name_ko"],
        "stage": ctx["stage"],
        "pptx_path": inst.pptx_path if inst else None,
        "teams": teams,
        # 아직 자기 일을 끝내지 않은 팀. 디자이너 제출을 막는 근거이자, 화면이
        # "왜 제출할 수 없는지"를 설명하는 문구의 재료다.
        "waiting_on": [x["team"] for x in teams if x["working"]],
        "scoring": _read_json(os.path.join(out_dir, "rfp_scoring.json")),
        "coverage": _read_json(os.path.join(out_dir, "coverage_map.json")),
    }


# ── 작업물 파일 (계획 H Task 4) ────────────────────────────────────────
# 경로 위생·확장자·용량은 전부 backend/task_files.py가 본다. 여기서는 권한과
# HTTP 상태 코드만 다룬다.

@router.post("/{task_id}/files", status_code=201)
async def post_task_file(
    task_id: str, request: Request, file: UploadFile = File(...),
    by: str | None = Form(default=None), x_user_id: str = Header(...),
) -> dict:
    # multipart 요청이라 by도 Form 필드로 온다(본문이 JSON이 아니다).
    actor = _actor(by, x_user_id)
    conn = _conn(request)
    try:
        ctx = _context(conn, task_id)
        _require_owner(ctx, actor)
        claim_assignee_if_unset(conn, task_id, actor)
    finally:
        conn.close()

    data = await file.read()
    try:
        return task_files.save(request.app.state.output_root, ctx["name_ko"], task_id,
                               file.filename or "", data)
    except task_files.FileRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{task_id}/files")
def get_task_files(task_id: str, request: Request) -> list[dict]:
    conn = _conn(request)
    try:
        ctx = _context(conn, task_id)
    finally:
        conn.close()
    return task_files.listing(request.app.state.output_root, ctx["name_ko"], task_id)


@router.get("/{task_id}/files/{name}")
def download_task_file(task_id: str, name: str, request: Request) -> FileResponse:
    conn = _conn(request)
    try:
        ctx = _context(conn, task_id)
    finally:
        conn.close()
    try:
        path = task_files.resolve(request.app.state.output_root, ctx["name_ko"], task_id, name)
    except (task_files.FileRejected, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"파일이 없습니다: {name}")
    return FileResponse(path, filename=os.path.basename(path))


@router.delete("/{task_id}/files/{name}", status_code=204)
def delete_task_file(
    task_id: str, name: str, request: Request,
    by: str | None = Query(default=None), x_user_id: str = Header(...),
) -> Response:
    # DELETE는 본문을 싣지 않는 관행이라 by를 쿼리로 받는다.
    conn = _conn(request)
    try:
        ctx = _context(conn, task_id)
        _require_owner(ctx, _actor(by, x_user_id))
    finally:
        conn.close()
    try:
        removed = task_files.remove(request.app.state.output_root, ctx["name_ko"], task_id, name)
    except (task_files.FileRejected, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not removed:
        raise HTTPException(status_code=404, detail=f"파일이 없습니다: {name}")
    return Response(status_code=204)


@router.patch("/{task_id}/draft", response_model=Task)
def patch_task_draft(
    task_id: str, body: TaskDraftIn, request: Request, x_user_id: str = Header(...)
) -> Task:
    """임시저장 — 메모만 갱신하고 **기록을 남기지 않는다** (계획 H Task 5).

    `POST /tasks/{id}/upload`를 재사용하지 않는 이유: 그쪽은 호출마다 '업로드
    즉시검사 —…' agent 메시지를 남긴다. 임시저장을 누를 때마다 로그가 쌓이면
    작업 로그가 못 읽을 것이 된다. 임시저장은 기록할 사건이 아니다.
    """
    conn = _conn(request)
    try:
        actor = _actor(body.by, x_user_id)
        ctx = _context(conn, task_id)
        _require_owner(ctx, actor)
        claim_assignee_if_unset(conn, task_id, actor)
        update_draft_content(conn, task_id, body.content)
        return get_task(conn, task_id)
    finally:
        conn.close()


@router.post("/{task_id}/submit", response_model=Task)
def post_task_submit(
    task_id: str, request: Request, body: TaskActorIn | None = None,
    x_user_id: str = Header(...),
) -> Task:
    actor = _actor(body.by if body else None, x_user_id)
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.assignee != actor:
            raise HTTPException(status_code=403, detail="only the assignee can submit")
        if task.status not in ("대기", "작성중"):
            raise HTTPException(status_code=409, detail="task not in a submittable state")
        _require_teams_done(conn, task)
        submit_task(conn, task_id)
        # 제출은 지금까지 상태만 바꾸고 아무에게도 알리지 않았다 — 제출해도 아무 일이
        # 일어나지 않는다는 뜻이었다. **결재 라인대로** 알린다(계획 I):
        # 팀 작업 → 그 팀의 팀장, 디자이너 작업 → 본부장.
        ctx = _context(conn, task_id)
        for recipient in _submit_recipients(ctx["team"]):
            create_notification(
                conn, recipient, "결재요청",
                f"{ctx['name_ko']} {ctx['team']} 작업물 제출 — 결재를 부탁드립니다.",
                institution_id=ctx["institution_id"], task_id=task_id, stage=ctx["stage"],
            )
        # 디자이너 작업물은 **각 팀으로도 전달된다**(사용자 확정) — 팀은 자기
        # 작업함의 이관 패키지에서 그 결과물을 열어볼 수 있다.
        if ctx["team"] == DESIGNER_TEAM:
            for team in AUTHORING_TEAMS:
                create_notification(
                    conn, inbox_name(team, known_recipients(conn)), "쪽지",
                    f"{ctx['name_ko']} 디자이너 작업물이 제출됐습니다 — 작업함에서 확인하세요.",
                    institution_id=ctx["institution_id"], task_id=task_id, stage=ctx["stage"],
                )
        return get_task(conn, task_id)
    finally:
        conn.close()


@router.post("/{task_id}/approve", response_model=Task)
def post_task_approve(
    task_id: str, body: TaskApprovalIn, request: Request, x_user_id: str = Header(...)
) -> Task:
    actor = _actor(body.by, x_user_id)
    conn = _conn(request)
    try:
        task = get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.approver is not None and task.approver != actor:
            raise HTTPException(status_code=403, detail="only the approver can approve")
        if task.status != SUBMITTED_STATUS:
            raise HTTPException(status_code=409, detail="task not submitted yet")
        claim_approver_if_unset(conn, task_id, actor)
        approve_task(conn, task_id, body.approved)
        # 반려는 지금까지 status만 '작성중'으로 되돌리고 **아무도 몰랐다** — 제출이
        # 아무에게도 알리지 않던 것과 같은 구멍이다. 담당이 없는(미배정) 작업은
        # 보낼 상대가 없으므로 조용히 넘어간다(반려 자체는 유효하다).
        if not body.approved and task.assignee:
            ctx = _context(conn, task_id)
            reason = (body.comment or "").strip() or "(사유 없음)"
            create_notification(
                conn, task.assignee, "쪽지",
                f"{ctx['name_ko']} {ctx['team']} 작업물이 반려되었습니다 — {reason}",
                institution_id=ctx["institution_id"], task_id=task_id,
                stage=ctx["stage"], sender=actor,
            )
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
        # 즉시검사도 커버리지 판정에 LLM을 쓴다 — 그 기록에 모델명을 남겨 워크플로
        # 로그의 🧠 표시가 일관되게 한다. 생략된 검사(배점표·배정 항목 없음)는
        # PII 스캔만 돌아 LLM이 개입하지 않으므로 모델명을 붙이지 않는다.
        add_message(conn, task_id, "agent", summary, author="검증 agent",
                    model=current_model() if result["llm_used"] else None)
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
        completed = False
        failure = None
        try:
            for chunk in stream_chat_reply(
                task.team, giganlist_dir, history, body.content, index_db_path=index_db_path
            ):
                reply_parts.append(chunk)
                yield chunk
            completed = True
        except Exception as exc:  # noqa: BLE001 - chat.py와 같은 이유(사유를 보여준다)
            failure = failure_notice(exc)
            yield ("\n\n" if reply_parts else "") + failure
        finally:
            # M-2(대화창과 같은 이유): 끊겨도 받은 만큼은 남긴다. 다만 draft_content는
            # 완결된 답변일 때만 갱신한다 — 반쪽 초안이 작성물로 굳으면 안 된다.
            full_reply = "".join(reply_parts)
            if full_reply and not completed:
                full_reply += "\n\n" + (failure or "…(응답이 중단되었습니다)")
            if full_reply:
                write_conn = get_connection(db_path)
                try:
                    # 모델명은 LLM이 실제로 뭔가 뱉었을 때만 남긴다 — 한 글자도 못 받고
                    # 실패한 경우 본문은 실패 안내문이지 그 모델의 산출물이 아니다
                    # (실패 사유 문구가 이미 모델명을 담고 있다).
                    add_message(write_conn, task_id, "agent", full_reply,
                                model=current_model() if reply_parts else None)
                    if completed:
                        update_draft_content(write_conn, task_id, full_reply)
                finally:
                    write_conn.close()

    # SSE가 아니다 — 위 chat.py와 같은 이유(POST라 EventSource 불가, 프레이밍 없음).
    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
