from server.models import (
    BidCase,
    BidCaseDetail,
    BidCaseFinalizeIn,
    Message,
    ParticipationDecisionEntry,
    ParticipationDecisionIn,
    Task,
    TaskApprovalIn,
    TaskDetail,
    TaskMessageIn,
    TaskSummary,
)


def test_bid_case_defaults():
    bid_case = BidCase(bid_case_id="bc-1", institution_id="mapo")
    assert bid_case.schedule_confidence == "예상"
    assert bid_case.participation_status == "검토중"
    assert bid_case.participation_decision == []


def test_bid_case_detail_carries_task_summaries():
    detail = BidCaseDetail(
        bid_case_id="bc-1",
        institution_id="mapo",
        tasks=[TaskSummary(task_id="task-1", team="영업", status="대기", progress_pct=0)],
    )
    assert detail.tasks[0].team == "영업"


def test_task_and_task_detail_defaults():
    task = Task(task_id="task-1", bid_case_id="bc-1", team="영업")
    assert task.status == "대기"
    assert task.progress_pct == 0
    detail = TaskDetail(**task.model_dump(), messages=[])
    assert detail.messages == []


def test_message_and_input_models():
    message = Message(
        message_id="msg-1", task_id="task-1", role="user", content="안녕",
        created_at="2026-07-28T00:00:00+00:00",
    )
    assert message.role == "user"
    assert TaskMessageIn(content="hi").content == "hi"
    assert TaskApprovalIn(approved=True).comment is None
    assert BidCaseFinalizeIn(approved=False).approved is False


def test_participation_decision_entry_and_input():
    decision_in = ParticipationDecisionIn(
        tier=1, role="실무자", by="alice", choice="참여"
    )
    assert decision_in.comment is None
    entry = ParticipationDecisionEntry(
        tier=1, role="실무자", by="alice", at="2026-07-28T00:00:00+00:00", choice="참여"
    )
    assert entry.tier == 1
