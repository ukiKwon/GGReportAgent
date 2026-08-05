"""LLM 상태 조회 — 대화 탭 모델 배지용 (계획 §⑥ 후속, Task 3).

`agent.llm.model_info()`를 그대로 얹는다. `reachable`은 **`?probe=1`일 때만** 붙는다.

왜 기본값이 아닌가: 프런트(`chat.js`의 모델 배지)는 이 필드를 쓰지 않는데,
값을 채우려면 `installed_models()`로 Ollama를 한 번 찔러야 한다. 아무도 안 보는
값을 위해 탭을 열 때마다 왕복이 붙는 셈이었다. 진단이 필요할 때만 켜서 쓴다.

`reachable`을 **거짓으로 채워 넣지 않고 아예 생략**하는 이유: 조회하지 않은 것과
조회해서 못 닿은 것은 다르다. `false`로 두면 엔드포인트가 멀쩡한데도 죽은 것처럼
보인다(이 리포가 §② 17에서 한 번 겪은 종류의 오진이다).
"""

from fastapi import APIRouter

from agent.llm import model_info
from agent.model_select import installed_models

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/status")
def get_status(probe: bool = False) -> dict:
    info = model_info()
    if not probe:
        return info
    # auto면 model_info()가 판정 때 본 목록을 이미 실어 준다 — 재사용하고,
    # 명시 모델 지정(installed가 빈 목록)일 때만 여기서 한 번 확인한다.
    installed = info["installed"] or installed_models(info["base_url"])
    return {**info, "reachable": bool(installed)}
