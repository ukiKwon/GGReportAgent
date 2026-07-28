from pydantic import BaseModel


class Institution(BaseModel):
    institution_id: str
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
    stage: int = 1
    giganlist_dir: str | None = None
    rfp_path: str | None = None
    scoring_table: list[dict] | None = None
    pptx_path: str | None = None


class InstitutionImportRow(BaseModel):
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    term: int | None = None
    last_bid: str | None = None
    contract_end: str | None = None


class ParticipationDecisionIn(BaseModel):
    tier: int
    role: str
    by: str
    choice: str
    comment: str | None = None


class ParticipationDecisionEntry(BaseModel):
    tier: int
    role: str
    by: str
    at: str
    choice: str
    comment: str | None = None


class BidCase(BaseModel):
    bid_case_id: str
    institution_id: str
    schedule_confidence: str = "예상"
    expected_date: str | None = None
    confirmed_date: str | None = None
    last_synced_at: str | None = None
    participation_status: str = "검토중"
    participation_decision: list[ParticipationDecisionEntry] = []
    finalized_by: str | None = None
    finalized_at: str | None = None


class TaskSummary(BaseModel):
    task_id: str
    team: str
    status: str
    progress_pct: int
    assignee: str | None = None
    approver: str | None = None


class BidCaseDetail(BidCase):
    tasks: list[TaskSummary] = []


class Task(BaseModel):
    task_id: str
    bid_case_id: str
    team: str
    status: str = "대기"
    progress_pct: int = 0
    draft_content: str = ""
    assignee: str | None = None
    approver: str | None = None


class Message(BaseModel):
    message_id: str
    task_id: str
    role: str
    content: str
    created_at: str


class TaskDetail(Task):
    messages: list[Message] = []


class TaskMessageIn(BaseModel):
    content: str


class TaskApprovalIn(BaseModel):
    approved: bool
    comment: str | None = None


class BidCaseFinalizeIn(BaseModel):
    approved: bool
    comment: str | None = None
