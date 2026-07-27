import os

from agent.llm import get_llm

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


def _load_team_corpus(giganlist_dir: str | None, team: str) -> str:
    if not giganlist_dir or not os.path.isdir(giganlist_dir):
        return "(자료 없음 — 신규 기관, 조사 결과 미제공)"

    parts = []
    if team == "영업":
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
        prefix = "02_" if team == "IT" else "03_"
        plan_dir = os.path.join(giganlist_dir, "plan")
        if os.path.isdir(plan_dir):
            for fname in sorted(os.listdir(plan_dir)):
                if fname.startswith(prefix) and fname.endswith(".txt"):
                    with open(os.path.join(plan_dir, fname), encoding="utf-8") as f:
                        parts.append(f"[plan/{fname}]\n{f.read()}")

    return "\n\n".join(parts) if parts else "(자료 없음 — 해당 팀 코퍼스 파일 없음)"


def stream_chat_reply(
    team: str, giganlist_dir: str | None, history: list[dict], user_message: str
):
    corpus = _load_team_corpus(giganlist_dir, team)
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history) or "(없음)"
    prompt = CHAT_PROMPT.format(
        team=team, corpus=corpus, history=history_text, user_message=user_message
    )
    llm = get_llm()
    for chunk in llm.stream(prompt):
        if chunk.content:
            yield chunk.content
