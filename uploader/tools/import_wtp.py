# -*- coding: utf-8 -*-
"""Eclipse WTP 폴더에서 고친 소스를 Maven 리포(`uploader/`)로 되돌리기.

    py -3 uploader/tools/import_wtp.py <WTP폴더>            # 미리보기(기본)
    py -3 uploader/tools/import_wtp.py <WTP폴더> --apply     # 실제 반영

`export_wtp.py` 의 역방향이다. 내부망에서 고친 것을 외부망 리포로 가져와
**`mvn test` 로 검증**하는 것이 목적이다.

경로 대응(패키지 구조는 양쪽이 같고 맨 앞만 다르다):

    WTP                                   Maven
    src/**.java                        →  src/main/java/**
    src/ (그 밖: mapper·schema·정적)    →  src/main/resources/**
    WebContent/WEB-INF/*.xml           →  src/main/webapp/WEB-INF/

⚠️ **되돌리지 않는 것**
  - `WebContent/WEB-INF/classes` · `lib` — 빌드 산출물이다. Maven 이 다시 만든다.
  - `config/application.properties` — 환경별 실제값이 든 작업 사본이라
    `.gitignore` 대상이다. 내부망 값이 리포로 새어 들어오면 안 된다.
    대신 `config-envs/prod` 와 **다른 점만 알려 준다** — 진짜 설정 변경이면
    `config-envs/prod` 를 직접 고칠 것.
  - `.project` · `.classpath` · `.settings` — Eclipse 전용이다.
  - **테스트** — 애초에 내보내지 않았으므로 건드릴 것이 없다.

⚠️ 기본이 **미리보기**다. 무엇이 바뀌는지 먼저 보고 `--apply` 로 반영한다.
반영 뒤에는 반드시 `cd uploader && mvn -o clean test` 를 돌릴 것.
"""
import filecmp
import shutil
import sys
from pathlib import Path

UPLOADER = Path(__file__).resolve().parent.parent

JAVA_DST = UPLOADER / "src/main/java"
RES_DST = UPLOADER / "src/main/resources"
WEB_DST = UPLOADER / "src/main/webapp"

SKIP_DIRS = {".settings", ".apt_generated", "config", "config-envs"}


def die(msg):
    raise SystemExit(f"[중단] {msg}")


def plan_sources(wtp):
    """(원본, 대상) 목록. java 는 java 로, 나머지는 resources 로."""
    src = wtp / "src"
    if not src.is_dir():
        die(f"WTP 폴더에 src/ 가 없다: {src}")
    pairs = []
    for path in sorted(src.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(src)
        dst = (JAVA_DST if path.suffix == ".java" else RES_DST) / rel
        pairs.append((path, dst))
    return pairs


def plan_webxml(wtp):
    pairs = []
    webinf = wtp / "WebContent" / "WEB-INF"
    for name in ("web.xml", "weblogic.xml"):
        path = webinf / name
        if path.is_file():
            pairs.append((path, WEB_DST / "WEB-INF" / name))
    return pairs


def classify(pairs):
    added, changed, same = [], [], []
    for src, dst in pairs:
        if not dst.exists():
            added.append((src, dst))
        elif not filecmp.cmp(src, dst, shallow=False):
            changed.append((src, dst))
        else:
            same.append((src, dst))
    return added, changed, same


def rel(p):
    try:
        return p.relative_to(UPLOADER.parent).as_posix()
    except ValueError:
        return p.as_posix()


def report_config(wtp):
    """설정은 복사하지 않고 차이만 알린다."""
    live = wtp / "config" / "application.properties"
    base = UPLOADER / "config-envs" / "prod" / "application.properties"
    if not live.is_file():
        return
    if filecmp.cmp(live, base, shallow=False):
        print("\n설정: config/application.properties 는 config-envs/prod 와 같다.")
        return
    print("\n⚠️ 설정이 다르다 — config/application.properties ↔ config-envs/prod")
    print("   (자동 반영하지 않는다. 실제값이 리포로 새는 것을 막기 위해서다.)")
    live_keys = _keys(live)
    base_keys = _keys(base)
    for k in sorted(set(live_keys) | set(base_keys)):
        if live_keys.get(k) != base_keys.get(k):
            # 값은 찍지 않는다 — 비밀번호가 들어 있을 수 있다.
            state = ("내부망에만 있음" if k not in base_keys else
                     "리포에만 있음" if k not in live_keys else "값이 다름")
            print(f"     · {k} — {state}")
    print("   진짜 설정 변경이면 config-envs/prod 를 직접 고칠 것.")


def _keys(path):
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main():
    if len(sys.argv) < 2:
        die(f"사용법: py -3 {Path(sys.argv[0]).name} <WTP폴더> [--apply]")

    wtp = Path(sys.argv[1]).resolve()
    apply = "--apply" in sys.argv[2:]
    if not wtp.is_dir():
        die(f"폴더가 없다: {wtp}")

    pairs = plan_sources(wtp) + plan_webxml(wtp)
    added, changed, same = classify(pairs)

    print(f"WTP 폴더: {wtp}")
    print(f"대상 리포: {UPLOADER}")
    print(f"\n같음 {len(same)} · 변경 {len(changed)} · 신규 {len(added)}")

    for label, group in (("변경", changed), ("신규", added)):
        for src, dst in group:
            print(f"  [{label}] {rel(dst)}")

    report_config(wtp)

    if not changed and not added:
        print("\n반영할 것이 없다.")
        return

    if not apply:
        print("\n미리보기다. 반영하려면 --apply 를 붙일 것.")
        return

    for src, dst in changed + added:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f"\n반영했다: {len(changed) + len(added)}개 파일")
    print("⚠️ 이제 반드시 검증할 것 —  cd uploader && mvn -o clean test")


if __name__ == "__main__":
    main()
