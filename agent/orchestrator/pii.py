"""개인정보(PII) 검출 — 스펙 §② 체크리스트 15.

결정적 정규식만 쓴다(LLM 아님). 검출값은 마스킹해 보고 — 검사 결과 자체가
개인정보 2차 유출 경로가 되면 안 된다. 코퍼스 마스킹 전례: 서초·마포 spec.
"""

import re

_MOBILE = re.compile(r"(01[016789])[-\s]?(\d{3,4})[-\s]?(\d{4})")
_RRN = re.compile(r"(\d{6})[-\s]?([1-4]\d{6})")
_EMAIL = re.compile(r"([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")


def scan_pii(text: str) -> list[dict]:
    found: list[dict] = []

    # RRN 스팬 수집 — MOBILE 겹침 검사용
    rrn_spans = set()
    for m in _RRN.finditer(text):
        rrn_spans.add(m.span())
        found.append({"kind": "주민등록번호", "value": f"{m.group(1)}-*******"})

    # MOBILE 매치: RRN과 겹치는 구간 제외
    for m in _MOBILE.finditer(text):
        # 이 매치의 스팬이 RRN 스팬과 겹치는지 확인
        mobile_span = m.span()
        overlaps_rrn = False
        for rrn_span in rrn_spans:
            # 두 스팬이 겹치면: start1 < end2 and start2 < end1
            if mobile_span[0] < rrn_span[1] and rrn_span[0] < mobile_span[1]:
                overlaps_rrn = True
                break

        if not overlaps_rrn:
            # 접두사 m.group(1)을 써서 010/011/016/017/018/019 보존
            found.append({"kind": "휴대폰", "value": f"{m.group(1)}-****-{m.group(3)}"})

    # EMAIL
    for m in _EMAIL.finditer(text):
        found.append({"kind": "이메일", "value": f"{m.group(1)}***@{m.group(3)}"})

    return found
