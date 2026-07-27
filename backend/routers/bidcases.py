from fastapi import APIRouter, HTTPException, Request

from backend.bidcase_repository import (
    ParticipationDecisionError,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_task_summaries,
    submit_participation_decision,
)
from backend.db import get_connection
from backend.models import BidCaseDetail, ParticipationDecisionIn

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
