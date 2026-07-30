import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.agent_adapter import stream_consult_reply
from backend.chat_repository import add_chat_message, list_chat_messages
from backend.db import get_connection
from backend.models import ChatMessage
from backend.repository import get_institution

router = APIRouter(prefix="/institutions", tags=["chat"])


class ChatIn(BaseModel):
    content: str


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
    add_chat_message(conn, institution_id, "user", body.content)
    conn.close()

    # 반입된 공고 원문이 있으면 근거에 포함 (stage 3 산출물)
    rfp_text_path = os.path.join(request.app.state.output_root, inst.name_ko, "rfp_text.txt")
    index_db_path = request.app.state.index_db_path

    def event_stream():
        reply_parts = []
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
        write_conn = get_connection(db_path)
        try:
            add_chat_message(write_conn, institution_id, "agent", "".join(reply_parts))
        finally:
            write_conn.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
