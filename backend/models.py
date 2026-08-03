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


class InstitutionUpdateIn(BaseModel):
    region_code: str | None = None
    type: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None


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
    research_status: str = "대기"
    finalized_by: str | None = None
    finalized_at: str | None = None
    # 반입 출처 (collector/SCHEMA.md §④). (source_slug, notice_id)가 공고 유일키다.
    source_slug: str | None = None
    notice_id: str | None = None
    title: str | None = None
    notice_url: str | None = None


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
    # 아래 둘은 나중에 붙은 컬럼이라 과거 행에는 없다(NULL). list_messages가
    # SELECT *를 Message(**row)로 넘기므로 여기에 없으면 즉시 깨진다.
    author: str | None = None
    stage: int | None = None


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


class CorpusPathIn(BaseModel):
    path: str


class Notification(BaseModel):
    notification_id: str
    recipient: str
    kind: str
    institution_id: str | None = None
    task_id: str | None = None
    content: str
    link: str | None = None
    created_at: str
    read_at: str | None = None
    # 아래 둘은 나중에 붙은 컬럼 — 과거 행은 NULL. list_notifications가 SELECT *를
    # Notification(**row)로 넘기므로 여기에 없으면 컬럼 추가 즉시 깨진다.
    stage: int | None = None
    sender: str | None = None   # 사람이 보낸 쪽지만. 시스템 알림은 None


class ChatMessage(BaseModel):
    chat_message_id: str
    institution_id: str
    role: str
    content: str
    created_at: str
    author: str | None = None   # 나중에 붙은 컬럼 — 에이전트 답변과 과거 행은 NULL
