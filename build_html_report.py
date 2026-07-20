# -*- coding: utf-8 -*-
"""서울시 5개 구청 사업제안 기획안 - 사이드바 네비게이션 기반 HTML 생성 스크립트"""
import re
import html as htmllib

OUT_PATH = r"C:\claude_workspace\서울시_5개구청_사업제안기획안.html"

district_dirs = {
    "도봉구": "dobong",
    "노원구": "nowon",
    "광진구": "gwangjin",
    "동대문구": "dongdaemun",
    "동작구": "dongjak",
}

# 카테고리컬 팔레트(dataviz 스킬 참고, 고정 순서) - 5개 구청 식별색
district_colors = {
    "도봉구": {"main": "#2a78d6", "soft": "#eaf2fc", "dark": "#184f95"},
    "노원구": {"main": "#1f8a4c", "soft": "#e7f6ee", "dark": "#0f5c30"},
    "광진구": {"main": "#c8393c", "soft": "#fbeaea", "dark": "#8f2528"},
    "동대문구": {"main": "#5b4b9e", "soft": "#eeecf9", "dark": "#3a2f6e"},
    "동작구": {"main": "#c66a1f", "soft": "#faeee0", "dark": "#8f4a12"},
}

district_initial = {
    "도봉구": "도", "노원구": "노", "광진구": "광", "동대문구": "동대", "동작구": "동작",
}

trust_scores = {
    "도봉구": 74, "노원구": 88, "광진구": 88, "동대문구": 82, "동작구": 84,
}

budget_info = {
    "도봉구": ("약 20~30억원", "구 예산(7,919억원) 대비 약 0.25~0.4%"),
    "노원구": ("약 15~23억원", "구 예산(1조 3,625억원) 대비 약 0.11~0.17%"),
    "광진구": ("약 15~24억원", "구 예산(8,536.71억원) 대비 약 0.18~0.28%"),
    "동대문구": ("약 19~28억원", "구 예산(9,824.36억원) 대비 약 0.19~0.29%"),
    "동작구": ("약 17~25억원", "구 예산(9,331.3억원) 대비 약 0.18~0.27%"),
}

key_problems = {
    "도봉구": [
        "4개년계획 121개 사업 중 27%(약24개)가 홈페이지 검색으로 확인 불가",
        "민원 채널 4종 이상 파편화, '구청장에게 바란다'는 답변완료 표시 없이 처리경과 추적 곤란",
        "2026년 최다 민원: 창동역 민자역사 출입구·보행로 신설 요청 집중",
        "간판개선·언덕길 열선 등 소규모 생활사업은 예산 배정에도 검색 자체가 안 됨",
    ],
    "노원구": [
        "23개 표본 중 확인됨 65%이나, 다수가 구청 홈페이지가 아닌 의회 회의록(council.nowon.kr) 의존",
        "서브도메인 9개 이상 파편화(회의록·환경·공단·뉴스레터·법무·부동산·데이터광장 등)",
        "'구청장에게 바란다'는 처리 지연·비공개 마스킹 다수, 반면 구민고충처리위원회는 신속 처리",
        "재건축진단 비용지원(여론 1순위 35.9%)과 새활용센터(120억 투입)가 확인안됨",
    ],
    "광진구": [
        "44개 표본 중 부분확인 11개 다수가 2026년 신규 개관 사업(청년아지트·천천히편의점 등)에 집중",
        "민원 게시판 7종 이상 분산, 채널마다 처리상태 표기 체계 자체가 상이",
        "2026년 최다 민원: 모아타운 등 정비사업 민원(구의2동 재개발 반대 등) + 교통·보행 제안",
        "모아타운 등 26개 정비사업이 '예산 미표기' 민간사업 구조라 공식 진행상황이 회의록에만 존재",
    ],
    "동대문구": [
        "2024~2026년 주요업무계획 실물 PDF 부재, 홍보 동영상(mp4)만 게시되는 구조적 문서 공백",
        "122개 사업 중 확인율 52%(부분확인7%, 확인안됨41%), 생활밀착사업일수록 확인율 급감",
        "2026년 최다 민원: 신답극동아파트 리모델링조합 관련 안전진단·행정명령 촉구(상위 10건 중 8건)",
        "재정자립도 등 핵심 재정지표가 홈페이지에서 확인 불가",
    ],
    "동작구": [
        "22개 표본 중 확인안됨9%+부분확인32%, 2026년 신규 개관사업(JUMP1·동작청년센터 등)에 집중",
        "'구청장에게 바란다'·'옴부즈만 민원 신청' 게시판이 외부에서 완전 차단(WebFetch 2회 시도 모두 빈 페이지)",
        "동작구의회 회의록(assembly.dongjak.go.kr) 의존 구조 - 구 자체 통합 추적 페이지 부재",
        "세대별 39개 중점사업 대부분 예산액이 카드형 설명에 명시되지 않음",
    ],
}

top_projects = {
    "도봉구": [
        ("IT-2", "민원 처리 현황 통합 대시보드 & 알림톡 연동", "300~450백만원", "최우선"),
        ("IT-1", "도봉구 통합 사업정보 검색 플랫폼 구축", "450~600백만원", "최우선"),
        ("IT-3", "창동역 일대 공사구간 스마트 보행안전 시스템", "180~250백만원", "상"),
        ("FN-2", "창동역 공사기간 인근 상가 영업피해 완충 지원금", "300~500백만원", "상"),
    ],
    "노원구": [
        ("IT-1", "노원구 통합 사업추진현황 검색 포털 구축", "400~550백만원", "최우선"),
        ("IT-2", "민원 채널 통합 대시보드 & 알림톡 연동", "300~450백만원", "최우선"),
        ("FN-1", "재건축진단 비용지원 홍보·신청 프로세스 정비 지원금", "300~450백만원", "상"),
        ("FN-2", "석계역 일대 소상공인 간판개선·보행환경 연계 지원금", "250~400백만원", "상"),
    ],
    "광진구": [
        ("IT-1", "신설사업 전용페이지 패스트트랙 & 통합사업정보 검색", "350~500백만원", "최우선"),
        ("IT-2", "민원채널 처리상태 표준화 & 통합 조회 시스템", "300~450백만원", "최우선"),
        ("IT-3", "모아타운 등 정비사업 통합 진행상황 알림 플랫폼", "200~300백만원", "상"),
        ("FN-1", "모아타운 등 정비사업 예정지 주민 생활불편 완충 지원금", "300~500백만원", "상"),
    ],
    "동대문구": [
        ("IT-1", "주요업무계획 상시공개 및 마스터DB 구축", "350~500백만원", "최우선"),
        ("IT-3", "민원 채널 통합 대시보드 & 처리현황 알림 서비스", "300~450백만원", "최우선"),
        ("FN-1", "노후 소규모 공동주택 안전진단·보수 매칭 지원금", "400~600백만원", "상"),
        ("IT-4", "노후공동주택 안전이슈 조기경보 시스템", "150~220백만원", "상"),
    ],
    "동작구": [
        ("IT-2", "민원채널 접근성 복구 & 처리현황 공개 대시보드", "300~450백만원", "최우선"),
        ("IT-1", "신규사업 개시 알림형 통합 사업정보 페이지 구축", "350~500백만원", "최우선"),
        ("FN-2", "노후 소규모 공동주택·빌라 안전개선 지원 확대", "400~600백만원", "상"),
        ("IT-3", "동작구의회 회의록 연계 사업추적 검색 위젯", "120~180백만원", "상"),
    ],
}

verdicts = {
    "도봉구": "spec 조사에서 실제로 확인된 문제(검색 미확인 27%, 민원 채널 파편화, 창동역 민원 집중)를 충실히 근거로 사용했으며 인용 수치 대부분이 원문과 일치. 다만 IT-1이 기존 계획사업(5-3 스마트데이터 허브센터, 5,000백만원)과의 중복 검토 없이 완전 신규처럼 제안된 점이 최대 리스크로, 실행 전 사실확인 필요.",
    "노원구": "IT 4건은 spec 사업목록에 없는 완전 신규, FN 3건은 기존 계획사업(재건축진단지원·석계역 간판개선·새활용센터)의 확장으로 명확히 구분되어 '기존 사업을 신규처럼 포장'한 사례가 발견되지 않음. 5개 구청 중 근거 인용 정확성이 가장 높은 수준.",
    "광진구": "7개 사업 전부 spec 원문 대조 결과 수치·명칭·날짜 인용 오류 없음. 기존 사업(모아타운, 골목소통, 청년아지트, 천천히편의점)을 대체하지 않고 홍보·추적성·안정화를 보완하는 방식으로 설계되어 이미 실행 중인 사업의 신규 포장 사례 없음.",
    "동대문구": "정책문서 실물 부재라는 근본 문제를 정확히 포착해 IT-1의 핵심 근거로 삼은 점이 강점. 다만 IT-2가 spec에 없는 2026년 분야별 예산 배분을 있는 것처럼 병기한 오류, FN-2가 '확인안됨'을 '실행중'으로 과잉 해석한 부분은 수정이 필요.",
    "동작구": "재정자립도(28.87%)·예산 수치 등 인용 정확도가 높고, 민원채널 완전 차단이라는 5개 구청 중 가장 심각한 접근성 문제를 정확히 짚어냄. 다만 FN-1의 재원 성격(조기집행 vs 신규재원) 모호성과 일부 제안부서명의 실존 여부 미확정은 보완 필요.",
}

file_labels = [
    ("00_제안개요_및_배경.txt", "제안 개요 및 배경", "overview", "◇"),
    ("01_제안사업_요약표.txt", "제안사업 요약표", "summary", "▤"),
    ("02_IT디지털기획_사업제안.txt", "IT/디지털 기획 사업", "it", "▣"),
    ("03_금전적지원_사업제안.txt", "금전적 지원 사업", "fund", "◈"),
    ("04_실행로드맵_및_기대효과.txt", "실행 로드맵 및 기대효과", "roadmap", "→"),
    ("05_검증결과.txt", "타당성 검증 결과", "verify", "✓"),
]

# 은행 결합 아이디어 초안 (별도 경로: 기관/{구청}/bank_ideas_draft.txt, plan 폴더 밖)
bank_ideas_file = ("bank_ideas_draft.txt", "은행 결합 아이디어", "bank", "🏦")


def esc(s):
    return htmllib.escape(s, quote=False)


def text_to_html_blocks(content):
    """구분선/제목/불릿 패턴을 인식해 텍스트를 시맨틱 HTML 블록으로 변환"""
    lines = content.split("\n")
    out = []
    i = 0
    n = len(lines)
    table_lines = []

    def flush_table():
        nonlocal table_lines
        if not table_lines:
            return
        rows = [l for l in table_lines if "|" in l and not set(l.strip()) <= set("-| ")]
        if len(rows) >= 2:
            out.append('<div class="table-wrap"><table class="content-table">')
            for ri, row in enumerate(rows):
                cells = [c.strip() for c in row.strip().strip("|").split("|")]
                tag = "th" if ri == 0 else "td"
                out.append("<tr>" + "".join(f"<{tag}>{esc(c)}</{tag}>" for c in cells) + "</tr>")
            out.append("</table></div>")
        else:
            out.append('<pre class="raw-block">' + esc("\n".join(table_lines)) + "</pre>")
        table_lines = []

    after_divider = False
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if set(stripped) <= set("=") and len(stripped) > 5:
            after_divider = True
            i += 1
            continue

        if re.match(r"^\[[^\]]+\]\s*$", stripped) or re.match(r"^\[[가-힣A-Za-z0-9\-]+\]\s+", stripped):
            m = re.match(r"^\[([^\]]+)\]\s*(.*)$", stripped)
            title = m.group(1)
            rest = m.group(2)
            out.append(f'<h4 class="block-title">{esc(title)}</h4>')
            if rest:
                out.append(f"<p>{esc(rest)}</p>")
            after_divider = False
            i += 1
            continue

        if stripped.startswith("번호 |") or (i + 1 < n and set(lines[i + 1].strip()) <= set("-|") and "|" in stripped):
            table_lines = [line]
            i += 1
            while i < n and ("|" in lines[i] or set(lines[i].strip()) <= set("-| ")) and lines[i].strip() != "":
                table_lines.append(lines[i])
                i += 1
            flush_table()
            continue

        if stripped == "":
            out.append("<div class='sp'></div>")
            i += 1
            continue

        if re.match(r"^-\s", stripped) or re.match(r"^\*\s", stripped):
            items = []
            while i < n and (re.match(r"^-\s", lines[i].strip()) or re.match(r"^\*\s", lines[i].strip())):
                items.append(lines[i].strip()[2:].strip())
                i += 1
            rendered = []
            for it in items:
                m = re.match(
                    r"^(중복여부|타당성등급|판단근거|수정권고사항|근거|제안\s*내용|기대효과|"
                    r"연계\s*구청사업/근거|구체적\s*상품/협력\s*형태|은행\s*기대효과|은행\s*기대효도)"
                    r"\s*[:：]\s*(.*)$",
                    it,
                )
                if m:
                    rendered.append(f"<li><span class='kv-label'>{esc(m.group(1))}</span> {esc(m.group(2))}</li>")
                else:
                    rendered.append(f"<li>{esc(it)}</li>")
            out.append("<ul class='bullets'>" + "".join(rendered) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+\S", stripped) and len(stripped) <= 50:
            if after_divider:
                out.append(f'<h3 class="section-title">{esc(stripped)}</h3>')
                after_divider = False
            else:
                out.append(f'<h4 class="block-title">{esc(stripped)}</h4>')
            i += 1
            continue

        after_divider = False
        out.append(f"<p>{esc(line)}</p>")
        i += 1

    return "\n".join(out)


def donut_svg(score, color_main, color_track="#e7e5df", size=76, stroke=8):
    """신뢰도 점수를 원형 게이지(SVG)로 렌더링 - 시그니처 요소"""
    r = (size - stroke) / 2
    c = 2 * 3.14159265 * r
    offset = c * (1 - score / 100)
    cx = cy = size / 2
    return f'''<svg class="score-donut" width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="신뢰도 {score}점">
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color_track}" stroke-width="{stroke}"/>
  <circle class="score-donut-fill" cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color_main}" stroke-width="{stroke}"
    stroke-linecap="round" stroke-dasharray="{c:.2f}" stroke-dashoffset="{c:.2f}"
    data-target-offset="{offset:.2f}" transform="rotate(-90 {cx} {cy})"/>
  <text x="{cx}" y="{cy - 2}" text-anchor="middle" class="score-donut-num">{score}</text>
  <text x="{cx}" y="{cy + 14}" text-anchor="middle" class="score-donut-unit">/100</text>
</svg>'''


tab_ids = list(district_dirs.keys())

# ============================================================
# CSS
# ============================================================

css = """
@media (prefers-color-scheme: dark) { :root { color-scheme: light; } }

:root {
  color-scheme: light;
  --surface-0: #f2f0ea;
  --surface-1: #ffffff;
  --surface-2: #f9f7f2;
  --surface-sidebar: #1c1b1a;
  --border: #e4e0d6;
  --border-soft: #ece9df;
  --text-primary: #201f1c;
  --text-secondary: #5a564c;
  --text-muted: #928d80;
  --text-on-dark: #f2f0ea;
  --text-on-dark-muted: #9b968a;
  --shadow-sm: 0 1px 2px rgba(30,26,16,.05);
  --shadow-md: 0 4px 16px rgba(30,26,16,.08), 0 1px 3px rgba(30,26,16,.06);
  --shadow-lg: 0 12px 32px rgba(30,26,16,.12), 0 2px 8px rgba(30,26,16,.06);
  --radius-sm: 8px;
  --radius: 14px;
  --radius-lg: 20px;
  --ease: cubic-bezier(.22,.61,.36,1);
  --sidebar-w: 248px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

* { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
}

body {
  margin: 0; padding: 0;
  font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", -apple-system, sans-serif;
  background: var(--surface-0);
  color: var(--text-primary);
  line-height: 1.64;
  -webkit-font-smoothing: antialiased;
}

::selection { background: #d8cfae; color: #1c1b1a; }

:focus-visible {
  outline: 2.5px solid var(--dcolor, #2a78d6);
  outline-offset: 2px;
  border-radius: 4px;
}

a { color: inherit; }

/* ============ 레이아웃 ============ */
.app-shell {
  display: flex;
  min-height: 100vh;
  align-items: stretch;
}

.sidebar {
  width: var(--sidebar-w);
  flex: 0 0 var(--sidebar-w);
  background: var(--surface-sidebar);
  color: var(--text-on-dark);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 26px 16px 20px;
  z-index: 40;
}

.brand {
  padding: 4px 10px 22px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  margin-bottom: 18px;
}
.brand-eyebrow {
  font-family: "Georgia", "Noto Serif KR", serif;
  font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--text-on-dark-muted); margin-bottom: 6px;
}
.brand-title {
  font-family: "Georgia", "Noto Serif KR", serif;
  font-size: 19px; font-weight: 700; line-height: 1.35;
  color: var(--text-on-dark);
  letter-spacing: -0.01em;
}

.nav-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-on-dark-muted); padding: 0 10px; margin: 4px 0 10px;
}

.district-nav { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.district-nav li { margin: 0; }

.dnav-btn {
  all: unset;
  box-sizing: border-box;
  display: flex; align-items: center; gap: 11px;
  width: 100%; padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-on-dark-muted);
  transition: background-color .16s var(--ease), color .16s var(--ease), transform .12s var(--ease);
}
.dnav-btn:hover { background: rgba(255,255,255,.06); color: var(--text-on-dark); }
.dnav-btn:active { transform: scale(.98); }
.dnav-btn.active {
  background: var(--dcolor, #2a78d6);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.dnav-swatch {
  flex: 0 0 30px; width: 30px; height: 30px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800;
  background: var(--dcolor-soft, rgba(255,255,255,.1));
  color: var(--dcolor, #fff);
}
.dnav-btn.active .dnav-swatch { background: rgba(255,255,255,.22); color: #fff; }
.dnav-text { flex: 1; min-width: 0; text-align: left; }
.dnav-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dnav-score { font-size: 10.5px; opacity: .85; margin-top: 1px; font-variant-numeric: tabular-nums; }

.sidebar-foot {
  margin-top: auto; padding: 14px 10px 4px;
  border-top: 1px solid rgba(255,255,255,.08);
  font-size: 11px; color: var(--text-on-dark-muted); line-height: 1.6;
}

.main-col { flex: 1 1 auto; min-width: 0; }

.page-header {
  max-width: 1100px; margin: 0 auto; padding: 44px 32px 8px;
}
.page-header h1 {
  font-family: "Georgia", "Noto Serif KR", serif;
  font-size: 30px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.01em;
  color: var(--text-primary);
}
.page-header .sub {
  font-size: 14px; color: var(--text-secondary); margin: 0 0 4px; max-width: 74ch;
}
.page-header .date {
  font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums;
}

/* ============ 구청 패널 ============ */
.district-panel {
  display: none;
  animation: panelIn .32s var(--ease);
}
.district-panel.active { display: block; }
@keyframes panelIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.summary-card { max-width: 1100px; margin: 18px auto 0; padding: 0 32px; }

.summary-grid {
  display: grid; grid-template-columns: 1.1fr 1fr 1fr 1fr; gap: 14px;
  margin-bottom: 20px;
}
@media (max-width: 980px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }

.stat-tile {
  background: var(--surface-1); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow .18s var(--ease), transform .18s var(--ease);
}
.stat-tile:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }

.stat-tile.score-tile { display: flex; align-items: center; gap: 14px; }
.stat-tile.score-tile > div { min-width: 0; }

.score-donut { flex: 0 0 auto; }
.score-donut-fill {
  transition: stroke-dashoffset 1s var(--ease);
}
.score-donut-num {
  font-family: "Georgia", "Noto Serif KR", serif; font-size: 21px; font-weight: 700;
  fill: var(--text-primary);
}
.score-donut-unit { font-size: 9px; fill: var(--text-muted); font-weight: 600; }

.score-tile-label {
  font-size: 11px; color: var(--text-muted); font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px;
}
.score-tile-desc { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }

.stat-tile .label {
  font-size: 11px; color: var(--text-muted); font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px;
}
.stat-tile .value {
  font-family: "Georgia", "Noto Serif KR", serif;
  font-size: 22px; font-weight: 700; color: var(--dcolor-dark, #222);
  letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
}
.stat-tile .value .unit { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: 3px; font-family: inherit;}
.stat-tile .desc { font-size: 12px; color: var(--text-secondary); margin-top: 5px; }

.problem-box, .proj-box, .verdict-box {
  background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 22px 24px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
}
.problem-box h3, .proj-box h3, .verdict-box h3 {
  font-size: 12px; font-weight: 700; margin: 0 0 14px;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em;
  display: flex; align-items: center; gap: 8px;
}
.problem-box h3::before { content: '⚠'; color: var(--dcolor, #333); font-size: 13px; }
.proj-box h3::before { content: '★'; color: var(--dcolor, #333); font-size: 12px; }
.verdict-box h3::before { content: '✓'; color: var(--dcolor, #333); font-size: 13px; }

.problem-list { margin: 0; padding: 0; list-style: none; }
.problem-list li {
  position: relative; padding-left: 20px; margin-bottom: 10px; font-size: 13.6px; color: var(--text-primary);
}
.problem-list li::before {
  content: ''; position: absolute; left: 0; top: 8px; width: 6px; height: 6px;
  border-radius: 50%; background: var(--dcolor, #333);
}
.problem-list li:last-child { margin-bottom: 0; }

.proj-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.proj-table th {
  text-align: left; font-size: 10.5px; color: var(--text-muted); font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em;
  border-bottom: 1.5px solid var(--border); padding: 0 10px 10px;
}
.proj-table td { padding: 12px 10px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
.proj-table tr:last-child td { border-bottom: none; }
.proj-table tr:hover td { background: var(--surface-2); }

.code-chip {
  display: inline-block; font-weight: 700; font-size: 11.5px;
  font-family: "SF Mono", "Consolas", monospace;
  background: var(--dcolor-soft, #eee); color: var(--dcolor-dark, #333);
  padding: 3px 9px; border-radius: 6px; letter-spacing: .01em;
}
.pri-chip {
  display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
  letter-spacing: .01em;
}
.pri-최우선 { background:#fbe2e2; color:#9c2f31; }
.pri-상 { background:#faedd2; color:#8a5c0a; }
.pri-중 { background:#e9e6dd; color:#5c584c; }

.verdict-box { border-left: 4px solid var(--dcolor, #333); }
.verdict-box p { margin: 0; font-size: 13.8px; color: var(--text-primary); }

/* ============ 서브탭 (세그먼트 필) ============ */
.subtabs-wrap { max-width: 1100px; margin: 6px auto 64px; padding: 0 32px; }

.subtabs {
  display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap;
  padding: 5px; background: var(--surface-2); border: 1px solid var(--border-soft);
  border-radius: 999px; width: fit-content; max-width: 100%;
}
.stab {
  appearance: none; border: none; cursor: pointer; font-family: inherit;
  background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 13px;
  padding: 9px 16px; border-radius: 999px; white-space: nowrap;
  display: flex; align-items: center; gap: 7px;
  transition: background-color .16s var(--ease), color .16s var(--ease), box-shadow .16s var(--ease);
}
.stab-icon { font-size: 12px; opacity: .75; }
.stab:hover { color: var(--text-primary); background: rgba(0,0,0,.03); }
.stab.active {
  color: #fff; background: var(--dcolor, #222); box-shadow: var(--shadow-sm);
}
.stab.active .stab-icon { opacity: 1; }
.stab-bank { color: #8a6d1f; }
.stab-bank:hover { background: #fff3d1; }
.stab-bank.active { color: #fff; background: #b5871f; }

.subpanel { display: none; animation: fadeIn .22s var(--ease); }
.subpanel.active { display: block; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.doc-body-bank { border-top: 4px solid #d4a017; }
.bank-badge {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700;
  color: #8a6d1f; background: #fff3d1; border: 1px solid #f0dca0;
  padding: 5px 13px; border-radius: 999px; margin-bottom: 18px;
}
.bank-badge::before { content: '●'; font-size: 8px; }

.doc-body {
  background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 30px 34px; box-shadow: var(--shadow-sm);
}
.doc-body h4.block-title {
  font-size: 14.5px; font-weight: 700; margin: 24px 0 9px;
  color: var(--dcolor-dark, #222);
  padding-bottom: 7px; border-bottom: 1px solid var(--border);
}
.doc-body h4.block-title:first-child { margin-top: 0; }
.doc-body h3.section-title {
  font-family: "Georgia", "Noto Serif KR", serif;
  font-size: 17px; font-weight: 700; margin: 32px 0 15px;
  color: #ffffff; background: var(--dcolor, #333);
  padding: 10px 16px; border-radius: 9px;
  letter-spacing: -0.005em;
}
.doc-body h3.section-title:first-child { margin-top: 0; }
.doc-body p { margin: 4px 0; font-size: 13.4px; color: var(--text-primary); }
.doc-body .sp { height: 7px; }
.doc-body ul.bullets { margin: 4px 0 12px; padding-left: 21px; }
.doc-body ul.bullets li { font-size: 13.4px; margin-bottom: 5px; }
.doc-body .kv-label {
  display: inline-block; font-weight: 700; font-size: 11.5px;
  background: var(--dcolor-soft, #eee); color: var(--dcolor-dark, #333);
  padding: 2px 9px; border-radius: 6px; margin-right: 6px;
}
.doc-body pre.raw-block {
  white-space: pre-wrap; font-family: "SF Mono", Consolas, monospace; font-size: 12.4px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; overflow-x: auto; color: var(--text-secondary);
}
.table-wrap { overflow-x: auto; margin: 12px 0 18px; border-radius: 10px; border: 1px solid var(--border); }
table.content-table { border-collapse: collapse; width: 100%; font-size: 12.6px; min-width: 560px; }
table.content-table th {
  background: var(--surface-2); text-align: left; font-weight: 700;
  padding: 9px 12px; border-bottom: 1px solid var(--border); color: var(--text-secondary);
  font-size: 11.5px;
}
table.content-table td { padding: 9px 12px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
table.content-table tr:last-child td { border-bottom: none; }
table.content-table tr:hover td { background: var(--surface-2); }

footer.page-footer {
  max-width: 1100px; margin: 0 auto; padding: 8px 32px 60px;
  color: var(--text-muted); font-size: 11.5px;
}

/* 스킵 링크 */
.skip-link {
  position: absolute; left: -9999px; top: 0; z-index: 100;
  background: var(--text-primary); color: #fff; padding: 10px 16px; border-radius: 8px;
}
.skip-link:focus { left: 16px; top: 16px; }

/* ============ 모바일 ============ */
@media (max-width: 860px) {
  .app-shell { flex-direction: column; }
  .sidebar {
    position: sticky; top: 0; width: 100%; height: auto; flex: none;
    flex-direction: row; align-items: center; overflow-x: auto; overflow-y: hidden;
    padding: 12px 14px; gap: 10px;
  }
  .brand { display: none; }
  .nav-label { display: none; }
  .district-nav { flex-direction: row; margin: 0; gap: 8px; }
  .dnav-btn { width: auto; padding: 8px 12px; }
  .dnav-text { display: none; }
  .sidebar-foot { display: none; }
  .page-header { padding: 26px 18px 8px; }
  .page-header h1 { font-size: 22px; }
  .summary-card, .subtabs-wrap { padding: 0 18px; }
  .doc-body { padding: 20px 18px; }
}
"""

# ============================================================
# JS
# ============================================================

js = r"""
(function () {
  function animateDonuts(scope) {
    scope.querySelectorAll('.score-donut-fill').forEach(function (el) {
      var target = el.getAttribute('data-target-offset');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.strokeDashoffset = target; });
      });
    });
  }

  function showDistrict(id, opts) {
    opts = opts || {};
    document.querySelectorAll('.dnav-btn').forEach(function (el) {
      var isActive = el.dataset.target === id;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.district-panel').forEach(function (el) {
      el.classList.toggle('active', el.id === 'panel-' + id);
    });
    if (!opts.silent) window.scrollTo({ top: 0, behavior: 'instant' });
    history.replaceState(null, '', '#' + id);
    var panel = document.getElementById('panel-' + id);
    if (panel) animateDonuts(panel);
  }

  function showSub(distId, subId) {
    var scope = document.getElementById('panel-' + distId);
    if (!scope) return;
    scope.querySelectorAll('.stab').forEach(function (el) {
      var isActive = el.dataset.sub === subId;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    scope.querySelectorAll('.subpanel').forEach(function (el) {
      el.classList.toggle('active', el.dataset.sub === subId);
    });
  }

  // 이벤트 위임: 구청 네비게이션
  document.addEventListener('click', function (e) {
    var dbtn = e.target.closest('.dnav-btn');
    if (dbtn) { showDistrict(dbtn.dataset.target); return; }
    var sbtn = e.target.closest('.stab');
    if (sbtn) {
      var scope = sbtn.closest('.district-panel');
      if (scope) showSub(scope.id.replace('panel-', ''), sbtn.dataset.sub);
    }
  });

  // 키보드 네비게이션: 사이드바 내 화살표키로 구청 이동
  document.addEventListener('keydown', function (e) {
    if (!e.target.classList || !e.target.classList.contains('dnav-btn')) return;
    var items = Array.from(document.querySelectorAll('.dnav-btn'));
    var idx = items.indexOf(e.target);
    if (idx === -1) return;
    var horiz = window.matchMedia('(max-width: 860px)').matches;
    var nextKey = horiz ? 'ArrowRight' : 'ArrowDown';
    var prevKey = horiz ? 'ArrowLeft' : 'ArrowUp';
    if (e.key === nextKey) { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === prevKey) { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  });

  // 서브탭 좌우 화살표 네비게이션
  document.addEventListener('keydown', function (e) {
    if (!e.target.classList || !e.target.classList.contains('stab')) return;
    var scope = e.target.closest('.subtabs');
    if (!scope) return;
    var items = Array.from(scope.querySelectorAll('.stab'));
    var idx = items.indexOf(e.target);
    if (e.key === 'ArrowRight') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var hash = location.hash.replace('#', '');
    var valid = Array.from(document.querySelectorAll('.dnav-btn')).map(function (el) { return el.dataset.target; });
    showDistrict(valid.includes(hash) ? hash : valid[0], { silent: true });
  });
})();
"""

# ============================================================
# HTML 조립
# ============================================================

html_parts = []
html_parts.append(f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>서울시 5개 구청 사업제안 기획안</title>
<style>{css}</style>
</head>
<body>
<a href="#main-content" class="skip-link">본문으로 건너뛰기</a>
<div class="app-shell">
""")

# ---- 사이드바 ----
html_parts.append('<nav class="sidebar" aria-label="구청 선택">')
html_parts.append('''<div class="brand">
  <div class="brand-eyebrow">Bank × District Proposal</div>
  <div class="brand-title">서울시 5개 구청<br>사업제안 기획안</div>
</div>''')
html_parts.append('<div class="nav-label">구청 선택</div>')
html_parts.append('<ul class="district-nav" role="tablist">')
for name in tab_ids:
    c = district_colors[name]
    score = trust_scores[name]
    initial = district_initial[name]
    html_parts.append(f'''<li>
  <button class="dnav-btn" role="tab" data-target="{name}" tabindex="0"
    style="--dcolor:{c['main']};--dcolor-soft:{c['soft']}" aria-selected="false">
    <span class="dnav-swatch">{initial}</span>
    <span class="dnav-text">
      <span class="dnav-name">{name}</span>
      <span class="dnav-score">신뢰도 {score}점</span>
    </span>
  </button>
</li>''')
html_parts.append('</ul>')
html_parts.append('''<div class="sidebar-foot">
  근거: 4개년/주요업무계획 분석(spec)<br>홈페이지 검색확인 · 민원게시판 조사<br>plan 타당성 검증 · 은행 결합 초안
</div>''')
html_parts.append('</nav>')

# ---- 메인 컬럼 ----
html_parts.append('<div class="main-col" id="main-content">')
html_parts.append("""<div class="page-header">
  <h1>서울시 5개 구청 사업제안 기획안</h1>
  <p class="sub">도봉구 · 노원구 · 광진구 · 동대문구 · 동작구 — IT/디지털 기획 및 금전적 지원 사업 제안 · 타당성 검증 결과 · 은행 결합 아이디어(초안) 포함</p>
  <p class="date">작성일: 2026년 7월 16일 (은행 결합 아이디어 초안 추가 반영)</p>
</div>
""")

for name in tab_ids:
    c = district_colors[name]
    score = trust_scores[name]
    budget_total, budget_ratio = budget_info[name]
    dirname = district_dirs[name]

    html_parts.append(
        f'<section class="district-panel" id="panel-{name}" role="tabpanel" '
        f'style="--dcolor:{c["main"]};--dcolor-soft:{c["soft"]};--dcolor-dark:{c["dark"]}">'
    )

    # ---- 요약 대시보드 ----
    html_parts.append('<div class="summary-card">')
    html_parts.append('<div class="summary-grid">')

    html_parts.append(f'''
    <div class="stat-tile score-tile">
      {donut_svg(score, c["main"])}
      <div>
        <div class="score-tile-label">제안서 신뢰도</div>
        <div class="score-tile-desc">plan 검증 결과 기준</div>
      </div>
    </div>''')
    html_parts.append(f'''
    <div class="stat-tile">
      <div class="label">제안 총예산</div>
      <div class="value">{esc(budget_total)}</div>
      <div class="desc">{esc(budget_ratio)}</div>
    </div>''')
    html_parts.append(f'''
    <div class="stat-tile">
      <div class="label">IT/디지털 기획</div>
      <div class="value">4<span class="unit">건</span></div>
      <div class="desc">필수 포함 항목</div>
    </div>''')
    html_parts.append(f'''
    <div class="stat-tile">
      <div class="label">금전적 지원</div>
      <div class="value">3<span class="unit">건</span></div>
      <div class="desc">기존 사업 확장 + 신규 혼합</div>
    </div>''')
    html_parts.append('</div>')  # summary-grid

    html_parts.append('<div class="problem-box"><h3>spec 조사에서 확인된 핵심 문제</h3><ul class="problem-list">')
    for prob in key_problems[name]:
        html_parts.append(f"<li>{esc(prob)}</li>")
    html_parts.append('</ul></div>')

    html_parts.append('<div class="proj-box"><h3>핵심 제안사업 (우선순위 상위 4건)</h3>')
    html_parts.append('<table class="proj-table"><tr><th>코드</th><th>사업명</th><th>추정예산</th><th>우선순위</th></tr>')
    for code, pname, budget, pri in top_projects[name]:
        html_parts.append(
            f'<tr><td><span class="code-chip">{esc(code)}</span></td>'
            f'<td>{esc(pname)}</td><td>{esc(budget)}</td>'
            f'<td><span class="pri-chip pri-{pri}">{esc(pri)}</span></td></tr>'
        )
    html_parts.append('</table></div>')

    html_parts.append(f'<div class="verdict-box"><h3>검증 총평</h3><p>{esc(verdicts[name])}</p></div>')

    html_parts.append('</div>')  # summary-card

    # ---- 서브탭 ----
    html_parts.append('<div class="subtabs-wrap">')
    html_parts.append('<div class="subtabs" role="tablist">')
    for fname, label, subid, icon in file_labels:
        html_parts.append(
            f'<button class="stab" role="tab" data-sub="{subid}" tabindex="0" aria-selected="false">'
            f'<span class="stab-icon">{icon}</span>{esc(label)}</button>'
        )
    bfname, blabel, bsubid, bicon = bank_ideas_file
    html_parts.append(
        f'<button class="stab stab-bank" role="tab" data-sub="{bsubid}" tabindex="0" aria-selected="false">'
        f'<span class="stab-icon">{bicon}</span>{esc(blabel)}</button>'
    )
    html_parts.append('</div>')

    for fname, label, subid, icon in file_labels:
        fpath = fr"C:\claude_workspace\기관\{dirname}\plan\{fname}"
        with open(fpath, encoding="utf-8") as f:
            content = f.read()
        body_html = text_to_html_blocks(content)
        html_parts.append(
            f'<div class="subpanel" role="tabpanel" data-sub="{subid}"><div class="doc-body">{body_html}</div></div>'
        )

    bank_path = fr"C:\claude_workspace\기관\{dirname}\{bfname}"
    with open(bank_path, encoding="utf-8") as f:
        bank_content = f.read()
    bank_html = text_to_html_blocks(bank_content)
    html_parts.append(
        f'<div class="subpanel" role="tabpanel" data-sub="{bsubid}"><div class="doc-body doc-body-bank">'
        f'<div class="bank-badge">초안 · 정식 반영 전 검토 단계</div>{bank_html}</div></div>'
    )

    html_parts.append('</div>')  # subtabs-wrap
    html_parts.append('</section>')

html_parts.append("""
<footer class="page-footer">
  근거자료: 각 구청 4개년/주요업무계획 분석(spec) · 홈페이지 검색확인 결과 · 2026년 민원게시판 현황 조사 · plan 제안서 타당성 검증 결과 · 은행 결합 아이디어 초안(bank_ideas_draft)
</footer>
</div>
</div>
""")
html_parts.append(f"<script>{js}</script>\n</body>\n</html>")

with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(html_parts))

print("OK", OUT_PATH)
