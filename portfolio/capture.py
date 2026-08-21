# -*- coding: utf-8 -*-
"""포트폴리오 캡처 재현 스크립트 (2026-08-05 세션의 Playwright + msedge 방식 복원).

    py -3.14 -m server.demo --port 8000     # 먼저 데모 서버를 띄운다
    py -3.14 capture.py [번호 ...]           # 인자 없으면 전부

기존 18장과 같은 조건: 1600×1000 뷰포트 / DSF 2 → 3200×2000 PNG.
실패한 장은 중단 없이 기록만 하고 마지막에 목록으로 알린다.

결과는 `portfolio/shots_new/`에 쌓인다 — 눈으로 확인한 뒤 `shots/`로 덮어쓴다
(빈 화면이 찍히는 실패가 예외 없이 조용히 지나가므로 확인 단계를 건너뛰지 말 것).
PART 4 리포트 4장(15~18)은 `corpus/reports/5-report_2.0.html` 정적 파일이라
여기서 찍지 않는다.

필요: `py -3.14 -m pip install playwright` (브라우저는 설치된 Edge를 그대로 쓴다).
"""
import sys, pathlib, traceback

BASE = "http://127.0.0.1:8000/"
OUT = pathlib.Path(__file__).parent / "shots_new"
OUT.mkdir(exist_ok=True)

from playwright.sync_api import sync_playwright

PROFILE = {"영업": {"name": "김 차장", "team": "영업팀"},
           "전산": {"name": "권 차장", "team": "전산팀"},
           "디자이너": {"name": "최 디자이너", "team": "디자이너"},
           "영업팀장": {"name": "김 팀장", "team": "영업팀장"}}


def shot(page, name, full=False, trim=False):
    path = OUT / (name + ".png")
    page.screenshot(path=str(path), full_page=full)
    if trim:
        crop_bottom(path)
    print("  saved", name, flush=True)


def crop_bottom(path, pad=48, tol=18):
    """아래쪽 빈 배경을 잘라낸다 — 짧은 화면(결재함·권한관리)이 여백만 커 보이지 않게.
    배경에 그레인 텍스처가 깔려 있어 완전 일치 비교로는 안 잘린다 → 허용오차 tol."""
    from PIL import Image
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = px[w - 6, h - 6]

    def busy(y):
        n = 0
        for x in range(0, w, 5):
            q = px[x, y]
            if max(abs(q[0] - bg[0]), abs(q[1] - bg[1]), abs(q[2] - bg[2])) > tol:
                n += 1
        return n

    last = h - 1
    while last > 300 and busy(last) < 3:
        last -= 1
    bottom = min(h, last + pad)
    if bottom < h:
        im.crop((0, 0, w, bottom)).save(path)


def set_profile(page, who):
    p = PROFILE[who]
    page.evaluate("""(p) => { window.store.saveProfile(p);
        if (window.app.showProfileRole) window.app.showProfileRole(p.team);
        document.getElementById('me-name').value = p.name;
        window.app.onProfileChanged(); }""", p)
    page.wait_for_timeout(900)


def open_app(page, who=None):
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#map-svg path", timeout=20000)
    if who:
        set_profile(page, who)
    page.wait_for_timeout(800)


TAB_ID = {"designer": "tasks"}          # 작업함만 버튼 id가 data-tab과 다르다


def go_tab(page, tab):
    page.click("#tab-btn-" + TAB_ID.get(tab, tab))
    page.wait_for_timeout(1800)


def seoul(page):
    page.evaluate("window.app.enterRegion('11')")
    page.wait_for_timeout(3000)


def open_workflow(page, inst="dobong"):
    """워크플로 탭 → 기관을 골라야 현황판이 그려진다."""
    go_tab(page, "workflow")
    page.wait_for_selector("#wf-inst", timeout=20000)
    page.select_option("#wf-inst", inst)
    page.wait_for_selector("#wf-panel .wf-step", timeout=20000)
    page.wait_for_timeout(2500)


def workflow_stage(page, n):
    """진행 표시줄에서 n단계를 누른다."""
    page.click("#wf-panel .wf-step[data-stage='%d']" % n)
    page.wait_for_timeout(1800)


# ---------------------------------------------------------------- 장면 정의
def s01(p):
    open_app(p, "영업"); p.wait_for_timeout(2500); shot(p, "01_전국지도")


def s02(p):
    open_app(p, "영업"); seoul(p); shot(p, "02_서울_지역뷰")


def s13(p):
    open_app(p, "영업"); p.click("#btn-theme"); p.wait_for_timeout(900)
    shot(p, "13_지도색상")


def s14(p):
    open_app(p, "영업"); seoul(p)
    p.evaluate("""() => {
        const all = window.render.allInstitutions();
        const rec = all.filter(r => r.name === '도봉구')[0] || all[0];
        window.app.openEdit(rec);
    }""")
    p.wait_for_timeout(1200); shot(p, "14_기관편집")


def s05(p):
    open_app(p, "영업"); open_workflow(p)
    shot(p, "05_워크플로_현황판")


def s07(p):
    open_app(p, "영업"); open_workflow(p)
    workflow_stage(p, 7); shot(p, "07_단계로그")


def s08(p):
    open_app(p, "영업"); open_workflow(p)
    workflow_stage(p, 7)
    p.locator("#wf-panel .wf-card[data-task-id]").first.click()
    p.wait_for_timeout(1800); shot(p, "08_팀작업로그")


def s12(p):
    open_app(p, "영업"); p.click("#btn-notify"); p.wait_for_timeout(1800)
    shot(p, "12_쪽지함")


def s19(p):
    p.set_viewport_size({"width": 1600, "height": 1400})   # 이관 패키지가 한 장에 다 들어가게
    open_app(p, "디자이너"); go_tab(p, "designer"); p.wait_for_timeout(2500)
    p.locator(".dg-item").first.click()          # 이관 패키지를 열어야 오른쪽이 채워진다
    p.wait_for_timeout(2000)
    shot(p, "19_작업함_디자이너", full=True, trim=True)
    p.set_viewport_size({"width": 1600, "height": 1000})


def s20(p):
    open_app(p, "영업팀장"); go_tab(p, "approvals"); p.wait_for_timeout(2000)
    shot(p, "20_결재함", full=True, trim=True)


def s21(p):
    open_app(p, "전산"); go_tab(p, "admin"); p.wait_for_timeout(2000)
    shot(p, "21_권한관리", full=True, trim=True)


def s09(p):
    open_app(p, "영업"); go_tab(p, "chat")
    p.wait_for_selector("#ch-inst", timeout=20000)
    p.select_option("#ch-inst", "dobong")     # 기관을 골라야 심어둔 2턴 대화가 뜬다
    p.wait_for_timeout(3000)
    shot(p, "09_대화탭")


def _search(p):
    open_app(p, "영업"); go_tab(p, "knowledge")
    p.fill("#kn-q", "청년 창업 지원"); p.click("#kn-go"); p.wait_for_timeout(4000)


def s11(p):
    _search(p); shot(p, "11_지식탭_검색결과")


def s11b(p):
    _search(p)
    p.locator("#kn-results >> text=원문 열기").first.click()
    p.wait_for_timeout(2500); shot(p, "11b_원문열기")


SHOTS = [("01", s01), ("02", s02), ("13", s13), ("14", s14),
         ("05", s05), ("07", s07), ("08", s08), ("12", s12),
         ("19", s19), ("20", s20), ("21", s21),
         ("09", s09), ("11", s11), ("11b", s11b)]


def main(only):
    failed = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000},
                                  device_scale_factor=2, locale="ko-KR")
        page = ctx.new_page()
        for num, fn in SHOTS:
            if only and num not in only:
                continue
            print(num, flush=True)
            try:
                fn(page)
            except Exception as exc:
                failed.append((num, type(exc).__name__ + ": " + str(exc).splitlines()[0]))
                print("  FAILED", failed[-1][1], flush=True)
        browser.close()
    print("\n=== 실패 ===" if failed else "\n=== 전부 성공 ===")
    for num, why in failed:
        print(" ", num, why)
    print("->", OUT)


if __name__ == "__main__":
    main(set(sys.argv[1:]))
