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

from backend.db import get_connection, init_db
from backend.demo_paths import DEMO_DB_PATH, DEMO_OUTPUT_ROOT

DEMO_BID_CASE = "demo-bc"

# 팀 → (task_id, 상태, 진행률, 담당자). RFI분석·취합·검증은 에이전트 몫이라 담당자가 없다.
TEAMS = [
    ("RFI분석", "demo-t-rfi", "1차완료", 100, None),
    ("영업", "demo-t-sales", "작성중", 40, "김 차장"),
    ("전산", "demo-t-it", "1차완료", 100, "권 차장"),
    ("예산", "demo-t-budget", "작성중", 65, "정 대리"),
    ("취합", "demo-t-pack", "1차완료", 100, None),
    ("검증", "demo-t-verify", "1차완료", 100, "박 수석"),
]

# (단계, 팀, role, 작성자, 본문) — 시각은 단계 순서대로 자동 부여한다.
MESSAGES = [
    (1, "RFI분석", "orchestrator", None, "도봉구 금고 계약 만료가 6개월 앞이다. 입찰 현황을 파악하라."),
    (1, "RFI분석", "agent", None, "직전 약정 만료일과 최근 3회 입찰 이력을 수집했다. 재지정 주기 4년."),
    (2, "RFI분석", "agent", None, "입찰 개시 신호 확인 — 구청 재정과 사전 수요조사 공고가 게시됐다."),
    (2, "영업", "human", "김 차장", "지점망 현황부터 정리해두겠습니다. 관내 4개 지점 운영 중입니다."),
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
    (8, "검증", "agent", None,
     "검증 완료 — 6항목 중 3항목 충족(49점), 미충족 2·미배정 1. 개인정보 의심 1건."),
    (8, "검증", "human", "박 수석", "최종 결재 — 박 수석"),
    (9, "검증", "orchestrator", None, "최종 결재 완료. 제출 대기(9단계) — 제출 후 완료 마킹하라."),
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
        out_dir = os.path.join(output_root, name_ko)
        if os.path.isdir(out_dir) and not os.listdir(out_dir):
            shutil.rmtree(out_dir)


def seed(db_path: str, output_root: str, institution_id: str, stage: int) -> str:
    """데모 데이터를 넣고 기관의 한글명을 돌려준다. 두 번 돌려도 같은 결과다(멱등)."""
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
        conn.execute(
            "INSERT INTO bid_cases (bid_case_id, institution_id, participation_status)"
            " VALUES (?, ?, '검토중')", (DEMO_BID_CASE, institution_id),
        )
        task_by_team = {}
        for team, task_id, status, pct, assignee in TEAMS:
            conn.execute(
                "INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, assignee)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (task_id, DEMO_BID_CASE, team, status, pct, assignee),
            )
            task_by_team[team] = task_id
        for i, (msg_stage, team, role, author, content) in enumerate(MESSAGES):
            conn.execute(
                "INSERT INTO messages (message_id, task_id, role, content, author, stage,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"demo-m{i:02d}", task_by_team[team], role, content, author, msg_stage, _at(i)),
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

    out_dir = os.path.join(output_root, name_ko)
    os.makedirs(out_dir, exist_ok=True)
    scoring = dict(SCORING, rfp_title=f"[데모] {name_ko} 금고 지정 계획 공고")
    with open(os.path.join(out_dir, "rfp_scoring.json"), "w", encoding="utf-8") as f:
        json.dump(scoring, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, "coverage_map.json"), "w", encoding="utf-8") as f:
        json.dump(COVERAGE, f, ensure_ascii=False, indent=2)
    return name_ko


def main() -> None:
    parser = argparse.ArgumentParser(description="워크플로 탭 화면 확인용 데모 데이터")
    parser.add_argument("--institution", default="dobong", help="기관 id (기본: dobong)")
    parser.add_argument("--stage", type=int, default=9, help="기관 진행 단계 (기본: 9)")
    parser.add_argument("--clear", action="store_true", help="데모 데이터를 지우기만 한다")
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

    name_ko = seed(args.db, args.output_root, args.institution, args.stage)
    print(
        f"{name_ko}({args.institution})에 데모 투입 완료 — stage {args.stage}, "
        f"팀 {len(TEAMS)}건 / 메시지 {len(MESSAGES)}건 / 알림 {len(NOTIFICATIONS)}건. "
        "지우려면 --clear."
    )


if __name__ == "__main__":
    main()
