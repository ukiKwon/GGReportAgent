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
    pptx_path: str | None = None
    # `scoring_table`은 뺐다(2026-08-06, NEXT.md 항목 4). 아무도 채우지 않아 늘
    # None이었고, 배점표는 `rfp_scoring.json` + `GET /institutions/{id}/coverage-map`
    # 으로 이미 서빙된다 — DB에도 두면 둘 중 어느 게 진실인지 문제가 새로 생긴다.


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
    final_approver: str | None = None


class BidCaseDetail(BidCase):
    tasks: list[TaskSummary] = []


class ParticipationDecisionOut(BidCaseDetail):
    # 참여확정 직후 3·4단계 자동 시작이 실제로 걸렸는지. False면 이유가 쪽지로 가 있다.
    run_started: bool = False


class Task(BaseModel):
    task_id: str
    bid_case_id: str
    team: str
    status: str = "대기"
    progress_pct: int = 0
    draft_content: str = ""
    assignee: str | None = None
    approver: str | None = None
    final_approver: str | None = None


class Message(BaseModel):
    message_id: str
    task_id: str
    role: str
    content: str
    created_at: str
    # 아래 셋은 나중에 붙은 컬럼이라 과거 행에는 없다(NULL). list_messages가
    # SELECT *를 Message(**row)로 넘기므로 여기에 없으면 즉시 깨진다.
    author: str | None = None
    stage: int | None = None
    # 이 기록을 남길 때 실제로 쓴 LLM 모델. LLM을 쓰지 않은 기록(게이트 통과 알림 등)은
    # None으로 남는다(Task 5) — 화면에서 "이 단계는 모델을 썼다"가 의미를 갖게 하기 위함.
    model: str | None = None


class TaskDetail(Task):
    messages: list[Message] = []


class TaskMessageIn(BaseModel):
    content: str


class TaskActorIn(BaseModel):
    """누가 하는지. **한글 이름은 헤더에 못 싣는다**(`X-User-Id`는 ASCII만 — A1 F10).

    그래서 브라우저는 헤더에 기술 식별자를 넣고 사람 이름은 본문으로 보낸다.
    `CheckpointIn.by`(`backend/routers/workflow.py`)와 같은 관행이다. 이게 없으면
    담당자 이름이 한글인 작업은 API로 아무것도 할 수 없다(항상 403).
    """
    by: str | None = None


class TaskDraftIn(TaskActorIn):
    content: str


class TaskApprovalIn(TaskActorIn):
    """결재. `by`(TaskActorIn)는 결재자 실명 — 헤더에 한글을 못 싣기 때문이다."""
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
