from fastapi import APIRouter, Header, HTTPException, Request

from agent.pipeline import artifacts_exist
from server.assembler import assemble_deliverable
from server.bidcase_repository import (
    ParticipationDecisionError,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_latest_bid_cases,
    list_task_summaries,
    record_finalization,
    submit_participation_decision,
)
from server.db import get_connection
from server.models import (
    BidCaseDetail,
    BidCaseFinalizeIn,
    ParticipationDecisionIn,
    ParticipationDecisionOut,
)
from server.notification_repository import create_notification
from server.repository import get_institution
from server.task_repository import approve_task

router = APIRouter(prefix="/bidcases", tags=["bidcases"])


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.post("")
def post_bid_case(body: dict, request: Request) -> dict:
    conn = _conn(request)
    try:
        bid_case = create_bid_case(conn, body["institution_id"])
        return bid_case.model_dump()
    finally:
        conn.close()


@router.get("/latest")
def get_latest_bid_cases(request: Request) -> list[dict]:
    """기관별 최신 공고. **`/{bid_case_id}`보다 먼저 선언해야 한다** —
    뒤에 두면 'latest'가 bid_case_id로 잡혀 404가 난다."""
    conn = _conn(request)
    try:
        return [b.model_dump() for b in list_latest_bid_cases(conn)]
    finally:
        conn.close()


@router.get("/{bid_case_id}", response_model=BidCaseDetail)
def get_bid_case_detail(bid_case_id: str, request: Request) -> BidCaseDetail:
    conn = _conn(request)
    try:
        bid_case = get_bid_case(conn, bid_case_id)
        if bid_case is None:
            raise HTTPException(status_code=404, detail="bid case not found")
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)


@router.get("")
def get_bid_cases(team: str, assignee: str, request: Request) -> list[dict]:
    conn = _conn(request)
    try:
        bid_cases = list_bid_cases_for_assignee(conn, team, assignee)
    finally:
        conn.close()
    return [b.model_dump() for b in bid_cases]


def _start_analysis_or_notify(conn, request: Request, institution_id: str) -> bool:
    """참여확정 직후 3·4단계를 자동으로 시작한다(스펙 §② 6번).

    **실패해도 결재를 되돌리지 않는다** — 대신 왜 못 시작했는지 쪽지로 남긴다.
    조용히 실패하면 아무도 분석이 안 돌고 있다는 걸 모른 채 기다리게 된다.
    """
    inst = get_institution(conn, institution_id)
    reason = None
    if inst is None:
        reason = "기관을 찾을 수 없습니다"
    elif not inst.rfp_path and not artifacts_exist(request.app.state.output_root, inst.name_ko):
        reason = "공고문(rfp_path)이 아직 반입되지 않았습니다"
    else:
        svc = request.app.state.orchestrator
        try:
            svc.start(institution_id, svc.build_run_input(inst, request.app.state.output_root,
                                                request.app.state.archive_root))
            return True
        except RuntimeError:
            reason = "이미 실행 중입니다"
        except Exception as exc:                      # 실행 실패가 결재를 깨뜨리면 안 된다
            reason = f"실행 오류: {exc}"

    create_notification(
        conn, "영업팀", "쪽지",
        f"참여확정됐지만 입찰 분석을 시작하지 못했습니다 — {reason}."
        " 워크플로 탭에서 [▶ 실행]으로 직접 시작하세요.",
        institution_id=institution_id,
    )
    return False


@router.post("/{bid_case_id}/participation-decisions", response_model=ParticipationDecisionOut)
def post_participation_decision(
    bid_case_id: str, body: ParticipationDecisionIn, request: Request
) -> ParticipationDecisionOut:
    conn = _conn(request)
    try:
        try:
            bid_case = submit_participation_decision(conn, bid_case_id, body)
        except ParticipationDecisionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        run_started = False
        if bid_case.participation_status == "참여확정":
            run_started = _start_analysis_or_notify(conn, request, bid_case.institution_id)
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return ParticipationDecisionOut(**bid_case.model_dump(), tasks=tasks, run_started=run_started)


@router.post("/{bid_case_id}/finalize", response_model=BidCaseDetail)
def post_bid_case_finalize(
    bid_case_id: str, body: BidCaseFinalizeIn, request: Request, x_user_id: str = Header(...)
) -> BidCaseDetail:
    conn = _conn(request)
    try:
        bid_case = get_bid_case(conn, bid_case_id)
        if bid_case is None:
            raise HTTPException(status_code=404, detail="bid case not found")
        tasks = list_task_summaries(conn, bid_case_id)
        if len(tasks) != 3 or any(t.status != "2차완료" for t in tasks):
            raise HTTPException(status_code=409, detail="not all tasks are 2차완료")

        if body.approved:
            institution = get_institution(conn, bid_case.institution_id)
            conn.execute(
                "UPDATE institutions SET stage = 7 WHERE institution_id = ?",
                (institution.institution_id,),
            )
            conn.commit()
            assemble_deliverable(conn, bid_case_id, output_root=request.app.state.output_root)
        else:
            for task in tasks:
                approve_task(conn, task.task_id, approved=False)

        record_finalization(conn, bid_case_id, x_user_id)

        bid_case = get_bid_case(conn, bid_case_id)
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)
