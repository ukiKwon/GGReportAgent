"""워크플로 탭 화면 확인용 데모 데이터 (계획 C1-fix).

9단계 전 구간의 지시·보고·결재 기록과 배점표 매핑을 한 기관에 넣어, 서버를 띄우면
바로 "다 돌아본 것 같은" 화면이 나오게 한다. **실데이터가 아니다.**

**보통은 이 파일을 직접 부를 일이 없다** — `py -3 -m backend.demo`가 시딩부터 서버
기동까지 한 번에 한다. 데이터만 다시 깔고 싶을 때만 쓴다:

    py -3 -m backend.demo_seed                      # 도봉구에 투입(기본 stage 9)
    py -3 -m backend.demo_seed --institution nowon --stage 6
    py -3 -m backend.demo_seed --clear              # 데모 행·산출물 삭제

기본 대상은 **데모 전용 DB**(`data/demo.db`)다 — 운영 `registry.db`는 건드리지 않는다
(backend/demo_paths.py). 통째로 지우려면 `py -3 -m backend.demo --reset`.

`rfp_text.txt`는 일부러 만들지 않는다 — agent/pipeline.py의 RFP_ARTIFACTS가 둘 다
있어야 참이라, 없으면 POST /run이 400으로 막혀 실수로 LLM 실행이 시작되지 않는다.
"""

import argparse
import json
import os
import shutil

from backend import task_files
from backend.db import get_connection, init_db
from backend.demo_paths import DEMO_DB_PATH, DEMO_OUTPUT_ROOT

DEMO_BID_CASE = "demo-bc"
DEMO_CONFIRMED_DATE = "2026-09-30"          # 확정 공고 — 지도에 빗금 없이 뜬다
DEMO_EXPECTED_INSTITUTION = "nowon"         # 비교용: 예상일만 있는 공고(빗금)
DEMO_EXPECTED_BID_CASE = "demo-bc-expected"
DEMO_EXPECTED_DATE = "2026-05-20"

# 참여 결정 3차 — **워크플로가 굴러갔다면 이건 이미 끝나 있어야 한다.**
# 참여확정(3차)이 팀 Task를 만들고 그 뒤에야 5·6단계가 진행되기 때문에,
# stage 9인 기관이 '검토중'으로 남아 있으면 앞뒤가 맞지 않는다.
# 시각은 2단계(입찰상황 발생) 메시지와 3단계 사이에 오도록 잡았다.
DECISIONS = [
    (1, "영업팀", "김 차장", "참여", "2026-08-01T09:02:10"),
    (2, "전산팀", "권 차장", "참여", "2026-08-01T09:02:40"),
    (3, "예산팀", "정 대리", "참여", "2026-08-01T09:03:20"),
]

# 팀 → (task_id, 상태, 진행률, 담당자). RFI분석·취합·검증은 에이전트 몫이라 담당자가 없다.
TEAMS = [
    ("RFI분석", "demo-t-rfi", "1차완료", 100, None),
    ("영업", "demo-t-sales", "작성중", 40, "김 차장"),
    ("전산", "demo-t-it", "2차완료", 100, "권 차장"),
    ("예산", "demo-t-budget", "작성중", 65, "정 대리"),
    ("취합", "demo-t-pack", "1차완료", 100, None),
    ("검증", "demo-t-verify", "1차완료", 100, "박 수석"),
    # 7단계 이관으로 열린 디자이너 몫(계획 H). 이게 없으면 계정을 디자이너로 바꿔도
    # 작업함이 비어 화면 확인 자체가 안 된다.
    ("디자이너", "demo-t-design", "작성중", 40, "최 디자이너"),
]

# 팀별 작성물 — 디자이너 뷰의 "이관 패키지"가 이걸 보여준다(계획 H). 상태를 일부러
# 섞어 둔다: 전산만 결재까지 끝났고(2차완료) 나머지는 아직이다. **승인 안 난 팀도
# 감추지 않는다**는 동작을 화면에서 바로 확인하기 위해서다.
DRAFTS = {
    "영업": "\n".join([
        "관내 지점 4곳 운영 현황과 협력사업 3건을 정리했습니다.",
        "- 지점: 창동·쌍문·방학·도봉 (ATM 12대)",
        "- 협력: 청년창업 이자지원, 전통시장 상품권, 어르신 금융교육",
        "근거자료: spec/02(1장-4), plan FN-1",
    ]),
    "전산": "\n".join([
        "전산 시스템 안정성(25점) — 무중단 이중화 실적 3건.",
        "- 2024 계정계 무중단 전환 (다운타임 0분)",
        "- 재해복구센터 이중화, RTO 15분",
        "근거자료: spec/03, plan IT-2",
    ]),
    "예산": "\n".join([
        "예금 금리·출연금 산정안입니다. 금리 수치는 본부 회신 대기 중이라 공란입니다.",
        "- 정기예금 금리: (본부 승인 후 기재)",
        "- 협력사업비 출연 규모: 연 3억원 제안",
    ]),
}

# 각 팀이 올린 작업물 — **디자이너가 받아서 작업할 실물**이다. 이게 없으면 이관
# 패키지에 텍스트만 있고 "어디서 받나?"가 화면에 안 보인다(사용자 지적).
# 예산팀은 아직 작업 중이라 일부러 비워 둔다.
TEAM_FILES = {
    "영업": [("지점현황_2026.pdf", "[데모] 관내 지점 4곳 현황표 자리표시자")],
    "전산": [("시스템_구성도.pdf", "[데모] 이중화 구성도 자리표시자"),
             ("무중단전환_실적.pdf", "[데모] 실적 요약 자리표시자")],
}

# 디자이너가 이미 올려둔 작업물 — 목록·내려받기·삭제를 바로 눌러볼 수 있게 심는다.
# 진짜 PPTX가 아니라 자리표시자다(데모는 파일을 열지 않고 목록만 보여준다).
DESIGN_FILES = [
    ("표지_시안_v2.pptx", "[데모] 표지 시안 자리표시자"),
    ("색상팔레트.png", "[데모] 이미지 자리표시자"),
]

# (단계, 팀, role, 작성자, 본문) — 시각은 단계 순서대로 자동 부여한다.
MESSAGES = [
    (1, "RFI분석", "orchestrator", None, "도봉구 금고 계약 만료가 6개월 앞이다. 입찰 현황을 파악하라."),
    (1, "RFI분석", "agent", None, "직전 약정 만료일과 최근 3회 입찰 이력을 수집했다. 재지정 주기 4년."),
    (2, "RFI분석", "agent", None, "입찰 개시 신호 확인 — 구청 재정과 사전 수요조사 공고가 게시됐다."),
    (2, "영업", "human", "김 차장", "지점망 현황부터 정리해두겠습니다. 관내 4개 지점 운영 중입니다."),
    (2, "영업", "human", "정 대리", "참여 결정 3차 결재 완료 — 참여확정. 분석을 시작해도 좋습니다."),
    (3, "RFI분석", "orchestrator", None, "공고문 원문을 받아 배점표를 구조화하라."),
    (3, "RFI분석", "agent", None, "공고문 PDF에서 본문 추출 완료. 평가항목 6건 / 총점 100점 인식."),
    (4, "RFI분석", "agent", None,
     "배점표 분석 완료 — 전산 25점, 지역기여 22점, 편의성 21점 순으로 가중치가 크다."),
    (4, "RFI분석", "orchestrator", None,
     "가중치 상위 3개 항목에 인력을 몰아라. 영업·전산·예산 3팀으로 분화한다."),
    (5, "영업", "orchestrator", None, "영업: 관내 지점 수·협력 사업 제안(28점)을 맡아라."),
    (5, "영업", "agent", None, "영업팀 초안 2건 작성 완료. 협력 사업 제안은 근거 자료 대기 중."),
    (5, "전산", "orchestrator", None, "전산: 전산 시스템 안정성(25점) 단일 항목이지만 최대 배점이다."),
    (5, "전산", "agent", None, "전산팀 초안 1건 작성 완료 — 무중단 이중화 실적 3건을 근거로 붙였다."),
    (5, "예산", "orchestrator", None, "예산: 신용등급·예금 금리(25점)를 맡아라."),
    (5, "예산", "agent", None, "예산팀 초안 2건 작성 완료. 예금 금리는 본부 승인 전이라 수치 공란."),
    (5, "예산", "human", "정 대리", "금리 수치는 본부 회신 오는 대로 채워 넣겠습니다."),
    (6, "영업", "human", "김 차장", "기획 승인 — 김 차장"),
    (6, "전산", "human", "권 차장", "이중화 실적에 작년 무중단 전환 건을 추가했습니다."),
    (6, "예산", "agent", "검증 agent", "업로드 즉시검사 — 담당 2항목 중 미달 1건, PII 1건"),
    (7, "취합", "agent", None, "3팀 초안을 배점표 원순서로 병합해 제안서 패키지를 만들었다."),
    (7, "취합", "human", "권 차장", "이관 결재 — 권 차장"),
    (7, "디자이너", "human", "최 디자이너", "이관 패키지 받았습니다. 표지 시안부터 잡겠습니다."),
    (8, "검증", "agent", None,
     "검증 완료 — 6항목 중 3항목 충족(49점), 미충족 2·미배정 1. 개인정보 의심 1건."),
    (8, "검증", "human", "박 수석", "최종 결재 — 박 수석"),
    (9, "검증", "orchestrator", None, "최종 결재 완료. 제출 대기(9단계) — 제출 후 완료 마킹하라."),
]

# 대화 탭(참여검토 상담) 시연용 — (role, 작성자, 본문).
# 답변 본문의 수치는 전부 `corpus/institutions/dobong/`의 실제 조사 결과에서 가져왔다
# (121개 사업·27% 미확인·창동역 민원·구 예산 7,919억원·복합환승센터 495억원). 그래야
# 화면의 다른 탭(배점표 매핑의 '지역 재투자 실적 22점 미배정')과 이야기가 이어진다.
# **LLM이 생성한 것이 아니라 사람이 쓴 데모 대본이다** — 실제 생성은 [보내기]로 확인한다.
# 대화 로그는 마크다운을 렌더하지 않으므로(chat.js가 평문으로 그린다) `**` 대신
# `[머리말]` 형식으로 쓴다.
CHAT = [
    ("user", "김 차장", "도봉구 금고 입찰, 우리가 참여할 만한가? 팀별 관점으로 정리해줘."),
    ("agent", None,
     "[영업 관점]\n"
     "· 관내 지점 4곳 운영 중 — 배점표 '주민 이용 편의성'(21점)에서 유리한 조건입니다.\n"
     "· 2026년 최다 민원이 창동역 출입구·보행로 신설 요청에 집중돼 있습니다"
     "('구청장에게 바란다' 최신 10건 중 과반). 창동역 복합환승센터(495억원)와 GTX-C 지하화가"
     " 진행 중이지만, 공사 기간의 임시 보행환경 개선은 4개년계획 121개 사업 어디에도 없습니다"
     " — '협력 사업 제안'(7점)에서 차별화할 수 있는 공백입니다.\n\n"
     "[전산 관점]\n"
     "· 배점 최대 항목이 전산 시스템 안정성(25점)입니다. 무중단 이중화 실적 3건으로 대응됩니다.\n"
     "· 구청 121개 사업 중 27%(약 24개)가 홈페이지 검색으로 확인되지 않습니다"
     "(5장 청렴행정도시는 확인율 18%로 최저). 통합 검색 플랫폼 제안이 이 불편을 정확히 겨냥하나,"
     " 기존 계획사업인 '스마트데이터 허브센터'(50억원)와 취지가 겹쳐 중복 조정이 먼저입니다.\n\n"
     "[예산 관점]\n"
     "· 구 예산 7,919억원 규모로 금고 운용 규모는 충분합니다.\n"
     "· 예금 금리(17점)는 본부 승인 전이라 제안서에 수치가 비어 있습니다 — 제출 전 필수 보완입니다.\n\n"
     "[종합]\n"
     "참여를 권합니다. 전산(25)+편의성(21)+협력(7) 53점 구간에서 우위를 만들 수 있습니다.\n\n"
     "[리스크]\n"
     "· 지역 재투자 실적(22점)에 아직 담당팀이 없습니다 — 현재 가장 큰 배점 공백입니다.\n"
     "· 요구 수준이 예년보다 높다는 신호가 있어 조기 대응이 필요합니다."),
    ("user", "김 차장", "지역 재투자 실적 22점은 뭘로 채우지?"),
    ("agent", None,
     "[현황]\n"
     "배점표 6항목 중 유일하게 담당팀이 배정되지 않은 항목입니다(22점, 두 번째로 큰 배점).\n\n"
     "[구청 자료에서 찾은 근거 2건]\n"
     "· 창동역 공사기간 인근 상가 영업피해 완충 지원금(300~500백만원) — 민원 1순위와 직접"
     " 연결되고, 4개년계획에 대응 사업이 없어 중복 위험도 낮습니다.\n"
     "· 청년 창업 지원 — 구 계획에 관련 사업이 이미 편성돼 있어 매칭형으로 붙이기 좋습니다.\n\n"
     "[제안]\n"
     "영업팀에 배정하고 위 두 건을 실행 계획으로 붙이십시오."
     " 근거 원문은 지식 탭에서 'dobong/plan/03_금전적지원'으로 열어볼 수 있습니다."),
]

# (단계, 수신자, kind, 본문)
NOTIFICATIONS = [
    (3, "영업팀", "되물음", "불리 조건 발견 — 재고 권유: 지역 재투자 실적 요구 수준이 예년보다 높다."),
    (5, "영업팀", "결재요청", "기획승인 대기 — 3팀 초안이 준비됐다. 검토 후 승인/반려 바랍니다."),
    (6, "영업팀", "결재요청", "이관결재 대기 — 기획승인 완료, 이관 여부를 결재해주세요."),
    (7, "디자이너", "이관", "이관 패키지 준비 완료: data/report_new/도봉구/제안서.pptx"),
    (8, "인사권자", "결재요청", "최종결재 대기 — 검증이 끝났습니다. 최종 결재를 부탁드립니다."),
    (9, "영업팀", "쪽지", "최종 결재 완료 — 제출 대기(9단계). 제출 후 완료 마킹하세요."),
]

SCORING = {
    "rfp_title": "[데모] 금고 지정 계획 공고",
    "total_score": 100,
    "criteria": [
        {"category": "금융기관 안정성", "item": "신용등급", "score": 8, "description": None},
        {"category": "대출·예금 금리", "item": "예금 금리", "score": 17, "description": None},
        {"category": "주민 이용 편의성", "item": "관내 지점 수", "score": 21, "description": None},
        {"category": "지역사회 기여", "item": "지역 재투자 실적", "score": 22, "description": None},
        {"category": "전산 처리 능력", "item": "전산 시스템 안정성", "score": 25, "description": None},
        {"category": "기타", "item": "협력 사업 제안", "score": 7, "description": None},
    ],
}

# 작성됨 3 · 미충족 2 · 미배정 1(지역 재투자 실적은 아예 없음) — 배지 3색을 다 보여준다.
COVERAGE = {
    "신용등급": {"team": "예산", "covered": True, "gap_note": None, "pii_count": 0},
    "예금 금리": {"team": "예산", "covered": False, "gap_note": "제시 금리 수치가 본문에 없음", "pii_count": 1},
    "관내 지점 수": {"team": "영업", "covered": True, "gap_note": None, "pii_count": 0},
    "전산 시스템 안정성": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 0},
    "협력 사업 제안": {"team": "영업", "covered": False, "gap_note": "근거 자료 미첨부", "pii_count": 0},
}


def _at(index: int) -> str:
    """단계 순서가 그대로 시간 순서가 되도록 분 단위로 벌려 찍는다."""
    return f"2026-08-01T{9 + index // 60:02d}:{index % 60:02d}:00"


def clear(db_path: str, output_root: str, name_ko: str | None) -> None:
    conn = get_connection(db_path)
    try:
        conn.execute("DELETE FROM messages WHERE message_id LIKE 'demo-%'")
        # 데모가 넣은 대화만 지운다 — 사람이 [보내기]로 실제 주고받은 대화(chat-…)는
        # 남긴다. 재시딩이 남의 대화 이력을 지우면 안 된다.
        conn.execute("DELETE FROM chat_messages WHERE chat_message_id LIKE 'demo-%'")
        conn.execute("DELETE FROM notifications WHERE notification_id LIKE 'demo-%'")
        conn.execute("DELETE FROM tasks WHERE task_id LIKE 'demo-%'")
        conn.execute("DELETE FROM bid_cases WHERE bid_case_id LIKE 'demo-%'")
        conn.commit()
    finally:
        conn.close()
    if name_ko:
        for fname in ("rfp_scoring.json", "coverage_map.json"):
            path = os.path.join(output_root, name_ko, fname)
            if os.path.isfile(path):
                os.remove(path)
        # 디자이너 작업물 폴더(계획 H) — 재시딩이 옛 파일을 남기면 개수가 계속 는다.
        for _, task_id, _, _, _ in TEAMS:
            task_files.drop_task_dir(output_root, name_ko, task_id)
        design_root = os.path.join(output_root, name_ko, task_files.DESIGN_DIRNAME)
        if os.path.isdir(design_root) and not os.listdir(design_root):
            shutil.rmtree(design_root)
        out_dir = os.path.join(output_root, name_ko)
        if os.path.isdir(out_dir) and not os.listdir(out_dir):
            shutil.rmtree(out_dir)


def seed(db_path: str, output_root: str, institution_id: str, stage: int,
         teams_done: bool = False) -> str:
    """데모 데이터를 넣고 기관의 한글명을 돌려준다. 두 번 돌려도 같은 결과다(멱등).

    `teams_done=True`면 3팀 작업을 전부 `1차완료`로 둔다 — 기본 시드는 예산팀이
    '작성중'이라 **디자이너 제출이 규칙대로 막혀 있어서**(계획 H, 사용자 확정),
    제출 이후 흐름을 눌러보려면 이 플래그가 필요하다. 화면에 팀 제출 버튼이 없어
    데모에서 달리 풀 방법이 없다.
    """
    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT name_ko FROM institutions WHERE institution_id = ?", (institution_id,)
        ).fetchone()
        if row is None:
            raise SystemExit(
                f"기관 '{institution_id}'이 없습니다 — 먼저 `py -3 -m backend.seed`를 실행하세요."
            )
        name_ko = row["name_ko"]
    finally:
        conn.close()

    clear(db_path, output_root, name_ko)          # 재실행 시 중복 없이 다시 깔린다

    conn = get_connection(db_path)
    try:
        conn.execute(
            "UPDATE institutions SET stage = ? WHERE institution_id = ?", (stage, institution_id)
        )
        # 7단계 패키저 산출물 — 디자이너 뷰가 "무엇을 받았는지" 맨 위에 보여준다.
        conn.execute(
            "UPDATE institutions SET pptx_path = ? WHERE institution_id = ?",
            (os.path.join(output_root, name_ko, f"{name_ko}_제안서.pptx"), institution_id),
        )
        # 확정일이 있는 공고 — 지도가 '확정'으로(빗금 없이) 그린다.
        # 참여 결정은 **이미 3차까지 끝난 상태**로 넣는다. 이 기관은 stage가 9까지 가 있는데
        # 참여확정 없이 그 단계에 도달할 수 없다(참여확정이 팀 Task를 만든다).
        decisions = json.dumps(
            [{"tier": t, "role": r, "by": b, "at": at, "choice": c, "comment": None}
             for t, r, b, c, at in DECISIONS],
            ensure_ascii=False,
        )
        conn.execute(
            "INSERT INTO bid_cases (bid_case_id, institution_id, participation_status,"
            " participation_decision, schedule_confidence, confirmed_date)"
            " VALUES (?, ?, '참여확정', ?, '확정', ?)",
            (DEMO_BID_CASE, institution_id, decisions, DEMO_CONFIRMED_DATE),
        )
        # 비교용으로 다른 기관 하나에 **예상일만** 있는 공고를 둔다 — 지도에서 빗금(추측)과
        # 확정이 나란히 보여야 계획 D의 일정 우선순위가 눈으로 확인된다.
        # 이쪽은 stage 1이라 '검토중'이 맞고, **참여 결정 3차 결재를 실습해 볼 자리**다.
        if conn.execute(
            "SELECT 1 FROM institutions WHERE institution_id = ?", (DEMO_EXPECTED_INSTITUTION,)
        ).fetchone() and DEMO_EXPECTED_INSTITUTION != institution_id:
            conn.execute(
                "INSERT INTO bid_cases (bid_case_id, institution_id, participation_status,"
                " schedule_confidence, expected_date) VALUES (?, ?, '검토중', '예상', ?)",
                (DEMO_EXPECTED_BID_CASE, DEMO_EXPECTED_INSTITUTION, DEMO_EXPECTED_DATE),
            )
        task_by_team = {}
        for team, task_id, status, pct, assignee in TEAMS:
            if teams_done and team in DRAFTS and status in ("대기", "작성중"):
                status, pct = "1차완료", 100
            conn.execute(
                "INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct,"
                " assignee, draft_content) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task_id, DEMO_BID_CASE, team, status, pct, assignee, DRAFTS.get(team, "")),
            )
            task_by_team[team] = task_id
        seeded_tasks = dict(task_by_team)
        for i, (msg_stage, team, role, author, content) in enumerate(MESSAGES):
            conn.execute(
                "INSERT INTO messages (message_id, task_id, role, content, author, stage,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"demo-m{i:02d}", task_by_team[team], role, content, author, msg_stage, _at(i)),
            )
        # 대화 탭 — 시각을 메시지 뒤에 이어 붙여 순서를 고정한다(list_chat_messages가
        # created_at으로 정렬하므로 여기서 어긋나면 문답이 뒤섞인다).
        for i, (role, author, content) in enumerate(CHAT):
            conn.execute(
                "INSERT INTO chat_messages (chat_message_id, institution_id, role, content,"
                " created_at, author) VALUES (?, ?, ?, ?, ?, ?)",
                (f"demo-c{i:02d}", institution_id, role, content,
                 _at(len(MESSAGES) + len(NOTIFICATIONS) + i), author),
            )
        for i, (ntf_stage, recipient, kind, content) in enumerate(NOTIFICATIONS):
            conn.execute(
                "INSERT INTO notifications (notification_id, recipient, kind, institution_id,"
                " content, stage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"demo-n{i:02d}", recipient, kind, institution_id, content, ntf_stage,
                 _at(len(MESSAGES) + i)),
            )
        conn.commit()
    finally:
        conn.close()

    task_by_team = seeded_tasks
    out_dir = os.path.join(output_root, name_ko)
    os.makedirs(out_dir, exist_ok=True)
    scoring = dict(SCORING, rfp_title=f"[데모] {name_ko} 금고 지정 계획 공고")
    with open(os.path.join(out_dir, "rfp_scoring.json"), "w", encoding="utf-8") as f:
        json.dump(scoring, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, "coverage_map.json"), "w", encoding="utf-8") as f:
        json.dump(COVERAGE, f, ensure_ascii=False, indent=2)
    for fname, body in DESIGN_FILES:
        task_files.save(output_root, name_ko, "demo-t-design", fname,
                        body.encode("utf-8"))
    for team, entries in TEAM_FILES.items():
        for fname, body in entries:
            task_files.save(output_root, name_ko, task_by_team[team], fname,
                            body.encode("utf-8"))
    return name_ko


def main() -> None:
    parser = argparse.ArgumentParser(description="워크플로 탭 화면 확인용 데모 데이터")
    parser.add_argument("--institution", default="dobong", help="기관 id (기본: dobong)")
    parser.add_argument("--stage", type=int, default=9, help="기관 진행 단계 (기본: 9)")
    parser.add_argument("--clear", action="store_true", help="데모 데이터를 지우기만 한다")
    parser.add_argument("--teams-done", action="store_true",
                        help="3팀 작업을 전부 '1차완료'로 — 디자이너 제출 차단을 풀어 본다")
    # REGISTRY_DB_PATH를 일부러 보지 않는다 — 그 환경변수는 운영 DB를 가리키므로,
    # 그걸 따르면 데모가 운영 자료에 섞인다(분리의 요점).
    parser.add_argument("--db", default=DEMO_DB_PATH)
    parser.add_argument("--output-root", default=DEMO_OUTPUT_ROOT)
    args = parser.parse_args()

    from backend.demo import _force_utf8_stdout   # cp949 콘솔에서 죽지 않게(demo.py와 동일)
    _force_utf8_stdout()

    init_db(args.db).close()          # 컬럼 마이그레이션까지 확실히 적용된 상태로 시작
    if args.clear:
        conn = get_connection(args.db)
        try:
            row = conn.execute(
                "SELECT name_ko FROM institutions WHERE institution_id = ?", (args.institution,)
            ).fetchone()
        finally:
            conn.close()
        clear(args.db, args.output_root, row["name_ko"] if row else None)
        print("데모 데이터를 삭제했습니다.")
        return

    name_ko = seed(args.db, args.output_root, args.institution, args.stage,
                   teams_done=args.teams_done)
    print(
        f"{name_ko}({args.institution})에 데모 투입 완료 — stage {args.stage}, "
        f"팀 {len(TEAMS)}건 / 메시지 {len(MESSAGES)}건 / 알림 {len(NOTIFICATIONS)}건 / "
        f"대화 {len(CHAT)}건. "
        "지우려면 --clear."
    )


if __name__ == "__main__":
    main()
