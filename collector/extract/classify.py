"""공고 종류 판정 — 제목만 보는 결정적 규칙(위에서 아래로 첫 일치). 못 가르면 '기타'.

'지정 공고'는 지정 결과 공고다(예: 「서울특별시 강남구 금고지정 공고」 2026-10-23). 규칙은
data-auditor가 실제 제목으로 검수한다(NEXT 80).
"""

import re

# 항상 제외: 금고 지정과 무관한 금리·협력사업비·송달·출연금 공고
EXCLUDE = ("금리", "협력사업비", "공시송달", "출연금", "요금고지")
# 지정·선정·주거래 문맥이 있으면 제외를 건너뛴다('정부출연연구기관 주거래은행 선정'·'금고지정 결과 및 운영현황')
EXCLUDE_SOFT = ("이율", "운용현황", "운영현황")
KEEP_CONTEXT = ("금고지정", "금고선정", "주거래")
CANDIDATE_KINDS = ("계획", "재공고", "결과", "지정")
ROLE = {"계획": "진행중", "재공고": "진행중", "결과": "회차종료", "지정": "회차종료"}


def classify(title: str) -> str:
    t = re.sub(r"\s+", "", title)
    if "금고" not in t and "주거래" not in t and "지정금융기관" not in t:
        return "무관"
    if any(w in t for w in EXCLUDE):
        return "제외"
    if any(w in t for w in EXCLUDE_SOFT) and not any(w in t for w in KEEP_CONTEXT):
        return "제외"
    if "취소" in t:
        return "기타"           # 계획 취소 공고(마포 2026-10-29 사례) — 정정·취소는 '기타' 칸으로 본다
    if "재공고" in t:
        return "재공고"
    if "계획" in t or "신청" in t or "제안" in t:
        return "계획"
    if "결과" in t:
        return "결과"
    if "지정공고" in t or "결정공고" in t or t.endswith("금고지정"):
        return "지정"
    return "기타"


def is_candidate_kind(kind: str) -> bool:
    return kind in CANDIDATE_KINDS


def is_watch_kind(kind: str) -> bool:
    """원문을 받아 둘 가치가 있는 종류(후보 종류 + 정정·취소 같은 '기타')."""
    return kind in CANDIDATE_KINDS or kind == "기타"
