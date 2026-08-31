import os

from agent import llm
from agent.llm import get_llm
from agent.retrieval import IndexNotBuiltError, search
from server.teams import AUTHORING_TEAMS

DEFAULT_INDEX_DB_PATH = "data/corpus_index.db"
REGISTERED_CORPUS_PREFIX = "corpus/institutions/"

# I-1: _load_team_corpus의 "자료 없음" sentinel 반환값 — _load_consult_corpus는
# 이 두 문자열과 정확 비교해야 한다. 부분문자열 검사("자료 없음" in corpus)는
# 실코퍼스 본문에 "자료 없음"이라는 문구가 든 기관(예: 강동·강남·성북 실측
# spec 파일의 "일부 자료 없음 상태" 같은 표현)에서 근거 전체를 오폐기한다.
NO_CORPUS_NEW = "(자료 없음 — 신규 기관, 조사 결과 미제공)"
NO_CORPUS_TEAM = "(자료 없음 — 해당 팀 코퍼스 파일 없음)"

# ⚠️ 팀 이름을 문자열로 적지 말 것 — `server/teams.AUTHORING_TEAMS`가 유일한 출처다.
# 풀어서 받으면 그 튜플이 바뀌는 순간 여기가 **기동 시점에** 깨진다(조용히 어긋나지 않는다).
# 예전에는 아래가 `"IT"`(옛 이름)로 박혀 있어서, 개명된 `전산` 팀이 어느 분기에도 안 걸려
# **예산팀 문서(`03_`)를 근거로 받고 있었다.** 오류도 경고도 없이 근거만 바뀐다
# (2026-08-28 전수조사에서 발견 — `server/assembler.py`와 같은 부류다).
SALES_TEAM, IT_TEAM, BUDGET_TEAM = AUTHORING_TEAMS

# 팀 → 검색 필터. 기존 _load_team_corpus의 폴더/접두사 규칙과 1:1 대응(스펙 §⑥).
IT_PLAN_PREFIX = "02_"          # plan/02_IT디지털기획_사업제안
BUDGET_PLAN_PREFIX = "03_"      # plan/03_금전적지원_사업제안
TEAM_SEARCH_FILTERS = {
    SALES_TEAM: {"doctypes": ("spec", "bank_ideas")},
    IT_TEAM: {"doctypes": ("plan",), "filename_prefix": IT_PLAN_PREFIX},
}
DEFAULT_TEAM_FILTER = {"doctypes": ("plan",), "filename_prefix": BUDGET_PLAN_PREFIX}

CHAT_PROMPT = """당신은 {team}팀의 제안서 작성을 돕는 "기관 인텔리전스 에이전트"입니다.
아래 근거 자료를 참고해 사용자 요청에 맞춰 제안서 초안 문장을 다듬어 답하세요. 자유롭게
지어내지 말고, 근거 자료에 있는 내용만 사용하세요.

근거 자료:
{corpus}

이전 대화:
{history}

사용자 요청:
{user_message}
"""

CONSULT_PROMPT = """당신은 "기관인텔리"의 참여검토 분석가입니다. 아래 근거 자료만 사용해
이 기관 입찰 참여 여부에 대한 분석을 답하세요. 반드시 **영업 / 전산 / 예산** 세 관점을
각각 짚고, 마지막에 강점·리스크를 요약하세요. 근거 자료에 없는 내용은 지어내지 말고,
모르면 모른다고 하세요. 인용은 [파일명] 형태로 표시하세요.

기관: {institution_name}

근거 자료:
{corpus}

이전 대화:
{history}

질문:
{user_message}
"""


def _search_team_corpus(
    giganlist_dir: str | None, team: str, user_message: str, index_db_path: str
) -> str | None:
    """FTS 인덱스에서 팀 필터로 검색해 근거 청크를 조립한다.

    등록된 코퍼스(corpus/institutions/ 접두사)가 아니거나, 인덱스가 없거나,
    결과가 0건이면 None — 호출부가 legacy 통째-읽기로 폴백한다.
    """
    if not giganlist_dir or not giganlist_dir.startswith(REGISTERED_CORPUS_PREFIX):
        return None
    institution_id = giganlist_dir[len(REGISTERED_CORPUS_PREFIX):].strip("/").split("/")[0]
    if not institution_id:
        return None

    filters = TEAM_SEARCH_FILTERS.get(team, DEFAULT_TEAM_FILTER)
    try:
        chunks = search(
            user_message,
            institution_id=institution_id,
            db_path=index_db_path,
            **filters,
        )
    except IndexNotBuiltError:
        return None
    if not chunks:
        return None
    return "\n\n".join(f"[{c.path}#{c.chunk_no}]\n{c.text}" for c in chunks)


def _load_team_corpus(giganlist_dir: str | None, team: str) -> str:
    if not giganlist_dir or not os.path.isdir(giganlist_dir):
        return NO_CORPUS_NEW

    parts = []
    if team == SALES_TEAM:
        spec_dir = os.path.join(giganlist_dir, "spec")
        if os.path.isdir(spec_dir):
            for fname in sorted(os.listdir(spec_dir)):
                if fname.endswith(".txt"):
                    with open(os.path.join(spec_dir, fname), encoding="utf-8") as f:
                        parts.append(f"[spec/{fname}]\n{f.read()}")
        bank_ideas_path = os.path.join(giganlist_dir, "bank_ideas_draft.txt")
        if os.path.isfile(bank_ideas_path):
            with open(bank_ideas_path, encoding="utf-8") as f:
                parts.append(f"[bank_ideas_draft.txt]\n{f.read()}")
    else:
        prefix = IT_PLAN_PREFIX if team == IT_TEAM else BUDGET_PLAN_PREFIX
        plan_dir = os.path.join(giganlist_dir, "plan")
        if os.path.isdir(plan_dir):
            for fname in sorted(os.listdir(plan_dir)):
                if fname.startswith(prefix) and fname.endswith(".txt"):
                    with open(os.path.join(plan_dir, fname), encoding="utf-8") as f:
                        parts.append(f"[plan/{fname}]\n{f.read()}")

    return "\n\n".join(parts) if parts else NO_CORPUS_TEAM


def stream_chat_reply(
    team: str,
    giganlist_dir: str | None,
    history: list[dict],
    user_message: str,
    index_db_path: str = DEFAULT_INDEX_DB_PATH,
):
    corpus = _search_team_corpus(giganlist_dir, team, user_message, index_db_path)
    if corpus is None:
        corpus = _load_team_corpus(giganlist_dir, team)
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history) or "(없음)"
    prompt = CHAT_PROMPT.format(
        team=team, corpus=corpus, history=history_text, user_message=user_message
    )
    llm = get_llm()
    for chunk in llm.stream(prompt):
        if chunk.content:
            yield chunk.content


def _load_consult_corpus(
    giganlist_dir: str | None, rfp_text_path: str | None, user_message: str, index_db_path: str
) -> str:
    """기관 입찰 참여검토를 위해 기관 코퍼스와 공고 원문을 병합한다.

    검색 우선(영업 필터가 spec+bank_ideas로 가장 넓다) → 통째 읽기 폴백.
    """
    parts = []
    # 기관 코퍼스: 검색 우선(영업 필터가 spec+bank_ideas로 가장 넓다) → 통째 읽기 폴백
    searched = _search_team_corpus(giganlist_dir, "영업", user_message, index_db_path)
    corpus = searched if searched is not None else _load_team_corpus(giganlist_dir, "영업")
    if corpus and corpus not in (NO_CORPUS_NEW, NO_CORPUS_TEAM):
        parts.append(corpus)
    if rfp_text_path and os.path.isfile(rfp_text_path):
        with open(rfp_text_path, encoding="utf-8") as f:
            parts.append(f"[rfp_text.txt]\n{f.read()}")
    return "\n\n".join(parts) if parts else "(자료 없음 — 반입된 공고·조사 자료가 아직 없음)"


def stream_consult_reply(
    institution_name: str,
    giganlist_dir: str | None,
    rfp_text_path: str | None,
    history: list[dict],
    user_message: str,
    index_db_path: str = DEFAULT_INDEX_DB_PATH,
):
    """기관 입찰 참여 여부를 영업/전산/예산 3관점에서 분석해 스트리밍한다."""
    corpus = _load_consult_corpus(giganlist_dir, rfp_text_path, user_message, index_db_path)
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history) or "(없음)"
    prompt = CONSULT_PROMPT.format(
        institution_name=institution_name, corpus=corpus,
        history=history_text, user_message=user_message,
    )
    llm = get_llm()
    for chunk in llm.stream(prompt):
        if chunk.content:
            yield chunk.content


def failure_notice(exc: Exception) -> str:
    """LLM 호출 실패를 **사용자가 읽을 한 문단**으로 만든다.

    스트리밍 응답은 첫 바이트를 보낸 뒤라 HTTP 상태를 바꿀 수 없다. 그래서 예외를
    그냥 삼키면 화면에는 **아무 설명 없는 빈 말풍선**만 남고, 사용자는 "고장인지 답이
    없는 건지" 알 수 없다. 이 리포에서 계속 지켜온 원칙 그대로 — 조용히 실패하지 않는다.

    실측 사례(2026-08-04): 기본값 `gpt-oss-120b`가 이 PC에 없어 404가 났는데,
    화면에는 빈 답만 나오고 이력에도 아무것도 안 남았다.
    """
    detail = str(exc).strip()
    model = llm.current_model()
    if "not found" in detail.lower() or getattr(exc, "status_code", None) == 404:
        return (
            f"[답변 실패] 모델 '{model}'을(를) 엔드포인트에서 찾을 수 없습니다"
            f" ({llm.current_base_url()}).\n"
            f"환경변수 LLM_MODEL로 사용 가능한 모델을 지정하거나, 그 모델을 엔드포인트에"
            " 올려 주세요. 설치된 모델은 `ollama list`로 볼 수 있습니다."
        )
    if isinstance(exc, (ConnectionError, TimeoutError)) or "connect" in detail.lower():
        return (
            f"[답변 실패] LLM 엔드포인트에 닿지 못했습니다 ({llm.current_base_url()}).\n"
            "서버가 떠 있는지, LLM_BASE_URL이 맞는지 확인해 주세요."
        )
    # 알 수 없는 실패도 유형과 앞부분은 보여준다 — 통째로 감추면 아무도 못 고친다.
    return f"[답변 실패] {type(exc).__name__}: {detail[:300]}"
