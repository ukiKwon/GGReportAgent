"""하드웨어와 설치 목록을 보고 모델을 고른다 — `LLM_MODEL=auto`일 때만 쓰인다.

**왜 하드웨어만으로는 부족한가**: RAM이 8GB여도 Ollama가 그 모델을 안 받아놨으면 못
쓴다(실제로 기본값 `gpt-oss-120b`가 어디에도 설치돼 있지 않아 404로 죽는 일이 있었다).
그래서 `설치된 목록 ∩ 하드웨어가 감당하는 티어` 중 가장 큰 것을 고른다.

**왜 vCPU도 보는가**: CPU 추론 속도는 코어 수에 거의 비례한다. RAM 8GB·2 vCPU인
m7i-flex.large는 8b를 *올릴 수는* 있지만 답변 1건에 수 분이 걸려 시연이 불가능하다.
"올라가는가"(RAM)와 "쓸 만한가"(vCPU)는 다른 벽이라 둘 다 본다.

새 의존성을 쓰지 않는다(폐쇄망 반입 비용) — 표준 라이브러리만.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

# (모델명, 최소 RAM GB, 최소 vCPU) — 큰 것부터. 사용자 확정 3종 고정.
MODEL_TIERS: tuple[tuple[str, float, int], ...] = (
    ("llama3.1:8b", 7.0, 4),
    ("llama3.2:3b", 3.5, 2),
    ("llama3.2:1b", 1.8, 1),
)


def pick_model(installed, ram_gb: float, cpu_count: int) -> str | None:
    """설치돼 있고 하드웨어가 감당하는 가장 큰 모델. 없으면 None."""
    # Ollama는 태그를 붙여 돌려주기도 한다(`llama3.2:3b` vs `llama3.2:3b-instruct-q4`).
    # 정확 일치를 우선하고, 없으면 접두사 일치까지 허용한다.
    names = list(installed or [])
    for model, min_ram, min_cpu in MODEL_TIERS:
        if ram_gb < min_ram or cpu_count < min_cpu:
            continue
        if model in names:
            return model
        for n in names:
            if n.startswith(model):
                return model
    return None


def detect_resources() -> tuple[float, int]:
    """(RAM GB, vCPU). 측정에 실패하면 RAM은 0.0으로 — 그러면 아무 티어도 안 걸린다."""
    cpu = os.cpu_count() or 1
    ram_bytes = 0
    try:
        if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names:
            ram_bytes = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        else:                                   # Windows
            import ctypes

            class _Mem(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            m = _Mem(); m.dwLength = ctypes.sizeof(_Mem)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            ram_bytes = int(m.ullTotalPhys)
    except Exception:
        ram_bytes = 0
    return (round(ram_bytes / (1024 ** 3), 1) if ram_bytes else 0.0, cpu)


def installed_models(base_url: str, timeout: float = 2.0) -> list[str]:
    """Ollama `/api/tags`의 모델명 목록. 못 닿으면 빈 목록(호출부가 폴백을 정한다).

    `base_url`은 OpenAI-호환 경로(`…/v1`)로 들어오므로 그 꼬리를 떼고 native API를 부른다.
    """
    root = (base_url or "").rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    try:
        with urllib.request.urlopen(f"{root}/api/tags", timeout=timeout) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return []
    models = data.get("models") if isinstance(data, dict) else None
    if not isinstance(models, list):
        return []
    return [m.get("name") for m in models if isinstance(m, dict) and m.get("name")]
