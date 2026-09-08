# -*- coding: utf-8 -*-
"""DBA 제출용 컬럼정의 엑셀 생성.

    py -3 uploader/tools/gen_column_excel.py

출력: `uploader/docs/DBA제출_컬럼정의_YYYY-MM-DD.xlsx`

**정본은 `uploader/src/main/resources/schema-oracle.sql` 이다.** 이 스크립트는 그
스키마를 사람이 옮겨 적은 것이라, **스키마가 바뀌면 여기 ROWS 도 같은 커밋에서
고쳐야 한다.** 자동 파싱하지 않는 이유는 인포타입명·속성명·업무규칙처럼 DDL 에
없는 정보가 절반이기 때문이다.

양식(2026-09-08 사용자 확인):
  · A1 머리글 14개는 **순서·이름 모두 그대로** 두어야 업로드된다.
  · `업무인스턴스명`·`원천도출구분` 은 비운다(사용자 지시).
  · `PK여부` = 1/0, `널리티 구분` = NOT NULL/NULLABLE.
  · `타입` 은 인포타입이 정한다 — 명·내용=VARCHAR, 구분코드·년·일시=CHARACTER,
    일련번호=DECIMAL. `소수점` 은 DECIMAL 만 0, 나머지는 빈칸.
"""
import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HEADER = [
    "테이블명", "컬럼명", "속성명", "순서", "PK여부", "인포타입명", "타입",
    "길이", "소수점", "널리티 구분", "업무인스턴스명", "원천도출구분",
    "컬럼정의", "업무규칙",
]

# 인포타입 → (타입, 소수점). 사용자 확인값(2026-09-08).
INFOTYPE = {
    "일련번호16": ("DECIMAL", 16, 0),
    "명250":      ("VARCHAR", 250, None),
    "명260":      ("VARCHAR", 260, None),
    "구분코드2":  ("CHARACTER", 2, None),
    "년4":        ("CHARACTER", 4, None),
    "일시20":     ("CHARACTER", 20, None),
    "내용800":    ("VARCHAR", 800, None),
}

# (테이블명, 컬럼명, 속성명, PK여부, 인포타입명, 널리티, 컬럼정의, 업무규칙)
ROWS = [
    ("TSKGIAF01", "업로드파일일련번호", "업로드파일일련번호", 1, "일련번호16", "NOT NULL",
     "업로드된 파일 1건을 식별하는 일련번호",
     "기본키. 애플리케이션이 시퀀스 TSKGIAF01_SEQ 에서 채번해 직접 입력한다(IDENTITY 미사용)"),
    ("TSKGIAF01", "기관명", "기관명", 0, "명250", "NULLABLE",
     "파일을 제출한 기관의 이름",
     "TSKGIAF02.기관명 과 문자열로 대조해 분류한다. 외래키는 걸지 않으며, "
     "TSKGIAF02 에 없는 이름이면 분류되지 않고 분류상태구분이 '01'(미분류)로 남는다"),
    ("TSKGIAF01", "기관구분", "기관구분코드", 0, "구분코드2", "NULLABLE",
     "기관의 유형 코드. TSKGIAF02.기관구분 에서 복사되어 들어온다",
     "01 지방자치단체 / 02 공공기관 / 03 대학교 / 04 병원 / 05 법원. 분류 전에는 값이 없다"),
    ("TSKGIAF01", "문서년", "문서년", 0, "년4", "NULLABLE",
     "문서의 기준 연도. 파일이 만들어진 해가 아니다",
     "YYYY 4자리 문자열(예: 2026). 연산에 쓰지 않는다"),
    ("TSKGIAF01", "분류상태구분", "분류상태구분코드", 0, "구분코드2", "NOT NULL",
     "파일의 분류 처리 상태 코드",
     "01 미분류 / 02 분류완료 / 03 반려 / 04 삭제. 기본값 '01'. CHECK 제약으로 강제한다. "
     "삭제는 소프트 삭제라 행이 지워지지 않고 상태만 '04'가 된다"),
    ("TSKGIAF01", "원본파일명", "원본파일명", 0, "명260", "NOT NULL",
     "사용자가 업로드한 원본 파일명",
     "파일시스템 상한이 255자(NTFS·ext4)라 260 으로 잡았다. 한글·공백·괄호가 그대로 들어온다"),
    ("TSKGIAF01", "업로드일시", "업로드일시", 0, "일시20", "NOT NULL",
     "파일이 업로드된 시각",
     "YYYYMMDDHH24MISS 14자를 채운다(20자는 여유). 자릿수가 고정이라 문자열 정렬이 곧 시간 정렬이다"),
    ("TSKGIAF01", "분류일시", "분류일시", 0, "일시20", "NULLABLE",
     "분류가 완료된 시각",
     "YYYYMMDDHH24MISS. 분류 전에는 값이 없어 NOT NULL 을 걸 수 없다"),
    ("TSKGIAF01", "저장경로", "저장경로내용", 0, "내용800", "NOT NULL",
     "서버 파일시스템의 저장 경로",
     "분류가 끝나면 값이 바뀐다(미분류 폴더 → classified/{기관구분}/{문서년}/{기관명}/). "
     "최악 경로가 약 591자라 800 으로 잡았다"),

    ("TSKGIAF02", "기관일련번호", "기관일련번호", 1, "일련번호16", "NOT NULL",
     "기관 1건을 식별하는 일련번호",
     "기본키. 애플리케이션이 시퀀스 TSKGIAF02_SEQ 에서 채번해 직접 입력한다"),
    ("TSKGIAF02", "기관명", "기관명", 0, "명250", "NOT NULL",
     "기관의 이름",
     "UNIQUE 제약. TSKGIAF01.기관명 과 대조하는 실질 키라 중복이 있으면 분류가 어긋난다"),
    ("TSKGIAF02", "기관구분", "기관구분코드", 0, "구분코드2", "NOT NULL",
     "기관의 유형 코드. 이 값이 파일의 분류 결과가 된다",
     "01 지방자치단체 / 02 공공기관 / 03 대학교 / 04 병원 / 05 법원"),
    ("TSKGIAF02", "수정일시", "수정일시", 0, "일시20", "NOT NULL",
     "기관 정보가 마지막으로 수정된 시각",
     "YYYYMMDDHH24MISS"),
]

WIDTH = [12, 20, 20, 6, 8, 12, 11, 7, 7, 12, 14, 12, 42, 60]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "컬럼정의"

    thin = Side(style="thin", color="BFC9CE")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.append(HEADER)
    head_fill = PatternFill("solid", fgColor="E8EDEF")
    for c in range(1, len(HEADER) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True, size=10)
        cell.fill = head_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    order = {}
    for table, col, attr, pk, infotype, nullity, define, rule in ROWS:
        order[table] = order.get(table, 0) + 1
        typ, length, scale = INFOTYPE[infotype]
        ws.append([
            table, col, attr, order[table], pk, infotype, typ,
            length, scale if scale is not None else "", nullity,
            "", "",              # 업무인스턴스명 · 원천도출구분 — 사용자 지시로 비움
            define, rule,
        ])

    for r in range(2, ws.max_row + 1):
        for c in range(1, len(HEADER) + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = border
            cell.font = Font(size=10)
            if c in (4, 5, 7, 8, 9, 10):
                cell.alignment = Alignment(horizontal="center", vertical="top")
            elif c in (13, 14):
                cell.alignment = Alignment(vertical="top", wrap_text=True)
            else:
                cell.alignment = Alignment(vertical="top")

    for i, w in enumerate(WIDTH, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(HEADER)), ws.max_row)

    out = Path(__file__).resolve().parent.parent / "docs" / (
        "DBA제출_컬럼정의_%s.xlsx" % datetime.date.today().isoformat())
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print("만들었다: %s" % out)
    print("  테이블 %d개 · 컬럼 %d행" % (len(order), ws.max_row - 1))


if __name__ == "__main__":
    main()
