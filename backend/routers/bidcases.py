from fastapi import APIRouter, Header, HTTPException, Request

from backend.assembler import assemble_deliverable
from backend.bidcase_repository import (
    ParticipationDecisionError,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_latest_bid_cases,
    list_task_summaries,
    record_finalization,
    submit_participation_decision,
)
from backend.db import get_connection
from backend.models import BidCaseDetail, BidCaseFinalizeIn, ParticipationDecisionIn
from backend.repository import get_institution
from backend.task_repository import approve_task

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


@router.post("/{bid_case_id}/participation-decisions", response_model=BidCaseDetail)
def post_participation_decision(
    bid_case_id: str, body: ParticipationDecisionIn, request: Request
) -> BidCaseDetail:
    conn = _conn(request)
    try:
        try:
            bid_case = submit_participation_decision(conn, bid_case_id, body)
        except ParticipationDecisionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        tasks = list_task_summaries(conn, bid_case_id)
    finally:
        conn.close()
    return BidCaseDetail(**bid_case.model_dump(), tasks=tasks)


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
