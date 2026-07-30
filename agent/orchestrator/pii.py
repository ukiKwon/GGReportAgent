"""개인정보(PII) 검출 — 스펙 §② 체크리스트 15.

결정적 정규식만 쓴다(LLM 아님). 검출값은 마스킹해 보고 — 검사 결과 자체가
개인정보 2차 유출 경로가 되면 안 된다. 코퍼스 마스킹 전례: 서초·마포 spec.
"""

import re

_MOBILE = re.compile(r"01[016789][-\s]?(\d{3,4})[-\s]?(\d{4})")
_RRN = re.compile(r"(\d{6})[-\s]?([1-4]\d{6})")
_EMAIL = re.compile(r"([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")


def scan_pii(text: str) -> list[dict]:
    found: list[dict] = []
    for m in _MOBILE.finditer(text):
        found.append({"kind": "휴대폰", "value": f"010-****-{m.group(2)}"})
    for m in _RRN.finditer(text):
        found.append({"kind": "주민등록번호", "value": f"{m.group(1)}-*******"})
    for m in _EMAIL.finditer(text):
        found.append({"kind": "이메일", "value": f"{m.group(1)}***@{m.group(3)}"})
    return found
