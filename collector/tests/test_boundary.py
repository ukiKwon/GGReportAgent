"""망 경계를 코드로 강제한다 — collector 런타임은 망 안 코드를 import하지 않는다.

재구성 스펙 §④: "collector는 backend/·agent/와 코드를 공유하지 않고 파일 스키마로만
통신한다." 문서로만 두면 언젠가 편의를 위해 깨진다.
"""

import re
from pathlib import Path

COLLECTOR = Path(__file__).resolve().parents[1]
FORBIDDEN = re.compile(r"^\s*(?:from|import)\s+(backend|agent)\b", re.M)


def _runtime_modules():
    return [
        path
        for path in COLLECTOR.rglob("*.py")
        if "tests" not in path.relative_to(COLLECTOR).parts
    ]


def test_runtime_modules_exist():
    assert _runtime_modules(), "런타임 모듈을 하나도 못 찾았다 — 경로 규칙을 확인할 것"


def test_no_runtime_module_imports_backend_or_agent():
    offenders = [
        str(path.relative_to(COLLECTOR))
        for path in _runtime_modules()
        if FORBIDDEN.search(path.read_text(encoding="utf-8"))
    ]
    assert offenders == [], f"망 경계 위반 — 망 안 코드를 import한다: {offenders}"
