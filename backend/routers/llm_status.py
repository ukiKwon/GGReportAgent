"""LLM 상태 조회 — 대화 탭 모델 배지용 (계획 §⑥ 후속, Task 3).

`agent.llm.model_info()`를 그대로 얹고 `reachable`만 더한다. `model_info()`는
`LLM_MODEL=auto`일 때만 설치 목록을 함께 채운다(불필요한 Ollama 왕복을 줄이려는
최적화 — `agent/llm.py` 참고). 그래서 `installed`가 비어 있어도(명시 모델 지정)
`reachable`은 판정할 수 있어야 한다 — 그때는 `installed_models()`를 직접 한 번
더 불러 목록 유무로 판정한다.
"""

from fastapi import APIRouter

from agent.llm import model_info
from agent.model_select import installed_models

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/status")
def get_status() -> dict:
    info = model_info()
    # auto라 model_info()가 이미 채웠으면 재사용, 아니면 여기서 한 번 더 확인한다.
    installed = info["installed"] or installed_models(info["base_url"])
    return {**info, "reachable": bool(installed)}
