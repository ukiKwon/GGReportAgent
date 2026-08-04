import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.agent_adapter import failure_notice, stream_consult_reply
from backend.chat_repository import add_chat_message, list_chat_messages
from backend.db import get_connection
from backend.models import ChatMessage
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["chat"])


class ChatIn(BaseModel):
    content: str
    # X-User-Id 헤더는 ASCII만 허용되므로 한글 이름은 body로 받는다(A1 F10과 같은 이유).
    author: str | None = None


@router.get("/{institution_id}/chat", response_model=list[ChatMessage])
def get_chat(institution_id: str, request: Request) -> list[ChatMessage]:
    conn = get_connection(request.app.state.db_path)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")
        return list_chat_messages(conn, institution_id)
    finally:
        conn.close()


@router.post("/{institution_id}/chat")
def post_chat(institution_id: str, body: ChatIn, request: Request) -> StreamingResponse:
    db_path = request.app.state.db_path
    conn = get_connection(db_path)
    inst = get_institution(conn, institution_id)
    if inst is None:
        conn.close()
        raise HTTPException(status_code=404, detail="institution not found")
    history = [
        {"role": m.role, "content": m.content} for m in list_chat_messages(conn, institution_id)
    ]
    add_chat_message(conn, institution_id, "user", body.content, author=body.author)
    conn.close()

    # 반입된 공고 원문이 있으면 근거에 포함 (stage 3 산출물)
    rfp_text_path = os.path.join(request.app.state.output_root, inst.name_ko, "rfp_text.txt")
    index_db_path = request.app.state.index_db_path

    def event_stream():
        reply_parts = []
        completed = False
        failure = None
        try:
            for chunk in stream_consult_reply(
                institution_name=inst.name_ko,
                giganlist_dir=inst.giganlist_dir,
                rfp_text_path=rfp_text_path if os.path.isfile(rfp_text_path) else None,
                history=history,
                user_message=body.content,
                index_db_path=index_db_path,
            ):
                reply_parts.append(chunk)
                yield chunk
            completed = True
        except Exception as exc:  # noqa: BLE001 - 사용자에게 사유를 보여주는 것이 목적
            # 첫 바이트를 이미 보냈을 수 있어 HTTP 상태를 바꿀 수 없다. 200 본문에
            # 사유를 실어 보낸다 — 빈 말풍선만 남기면 사용자는 원인을 알 길이 없다.
            # (클라이언트 끊김은 GeneratorExit라 여기 안 걸리고 finally로 간다.)
            failure = failure_notice(exc)
            yield ("\n\n" if reply_parts else "") + failure
        finally:
            # M-2: 클라이언트가 끊어도 받은 만큼은 남긴다 — 안 그러면 질문만 있고 답이
            # 통째로 사라진 "반쪽 이력"이 된다. 끊긴 답변임을 읽는 사람이 알게 표시한다.
            reply = "".join(reply_parts)
            if reply and not completed:
                reply += "\n\n" + (failure or "…(응답이 중단되었습니다)")
            # 받은 답이 하나도 없으면 저장하지 않는다. 오류 문구가 'agent' 발언으로
            # 이력에 남으면 **다음 질문 때 그것이 대화 맥락으로 모델에 다시 들어간다.**
            if reply:
                write_conn = get_connection(db_path)
                try:
                    add_chat_message(write_conn, institution_id, "agent", reply)
                finally:
                    write_conn.close()

    # SSE가 아니다 — EventSource는 GET만 되는데 이 엔드포인트는 POST라 애초에 쓸 수 없고,
    # 본문도 `data:` 프레이밍이 없는 평문이다. 프런트는 fetch 스트림으로 읽는다(M-3).
    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
