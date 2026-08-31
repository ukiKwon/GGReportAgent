# -*- coding: utf-8 -*-
"""Maven 프로젝트(`uploader/`) → Eclipse Dynamic Web Project(WTP) 폴더로 내보내기.

    py -3 uploader/tools/export_wtp.py            # → dist/uploader-wtp/
    py -3 uploader/tools/export_wtp.py <출력경로>

내부망은 Eclipse WTP 배치(`src` / `WebContent` / `config`)를 쓰고, 외부망 리포는
Maven 배치를 쓴다. **Maven 쪽이 정본이다** — 테스트 62건과 빌드가 거기 붙어 있고,
그게 Oracle SQL·TimerManager처럼 외부망에서 확인 못 하는 것을 잡아 주는 유일한
그물이기 때문이다. 이 스크립트는 그 정본에서 내부망용 한 벌을 **파생**시킨다.

내부망에서 고친 것을 리포로 되돌릴 때는 `import_wtp.py` 를 쓴다.

⚠️ **테스트는 내보내지 않는다.** JUnit·Mockito·H2 는 test 스코프라
`WEB-INF/lib` 에 없고, 넣으면 운영 WAR 에 테스트 라이브러리가 실린다.
테스트는 외부망에서 돌린다.

만들어지는 배치:

    <출력>/
    ├── .classpath · .project · .settings/     ← Eclipse 가 바로 여는 데 필요
    ├── WebContent/WEB-INF/
    │   ├── classes/   ← Eclipse 의 컴파일 출력 자리(WAR 산출물을 미리 넣어 둔다)
    │   ├── lib/       ← 런타임 의존 jar
    │   ├── web.xml · weblogic.xml
    ├── config/application.properties          ← config-envs/prod 사본
    └── src/                                   ← 자바 + 리소스(평면)
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

UPLOADER = Path(__file__).resolve().parent.parent
WAR = UPLOADER / "target" / "uploader-1.0.0.war"

PROJECT_NAME = "uploader"
CONTEXT_ROOT = "uploader"

# WEB-INF/lib 에 절대 넣으면 안 되는 것 — WebLogic 이 자기 것을 쓴다.
# tomcat-embed-* 를 넣으면 서블릿 컨테이너가 두 벌이 되어 배포가 깨진다.
LIB_EXCLUDE = re.compile(r"^tomcat-embed-|^spring-boot-loader")


def die(msg):
    raise SystemExit(f"[중단] {msg}")


# ── Eclipse 프로젝트 파일 ────────────────────────────────────────────

DOT_PROJECT = f"""<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
  <name>{PROJECT_NAME}</name>
  <comment>Maven 리포(uploader/)에서 export_wtp.py 로 생성됨. 정본은 리포다.</comment>
  <projects/>
  <buildSpec>
    <buildCommand><name>org.eclipse.jdt.core.javabuilder</name><arguments/></buildCommand>
    <buildCommand><name>org.eclipse.wst.common.project.facet.core.builder</name><arguments/></buildCommand>
    <buildCommand><name>org.eclipse.wst.validation.validationbuilder</name><arguments/></buildCommand>
  </buildSpec>
  <natures>
    <nature>org.eclipse.jem.workbench.JavaEMFNature</nature>
    <nature>org.eclipse.wst.common.modulecore.ModuleCoreNature</nature>
    <nature>org.eclipse.jdt.core.javanature</nature>
    <nature>org.eclipse.wst.common.project.facet.core.nature</nature>
  </natures>
</projectDescription>
"""

# ⚠️ `org.eclipse.jst.j2ee.internal.web.container` 가 WebContent/WEB-INF/lib 의
#    jar 를 **자동으로** 클래스패스에 올린다. jar 를 하나하나 적지 않는 이유다.
DOT_CLASSPATH = """<?xml version="1.0" encoding="UTF-8"?>
<classpath>
  <classpathentry kind="src" path="src"/>
  <classpathentry kind="con" path="org.eclipse.jdt.launching.JRE_CONTAINER/org.eclipse.jdt.internal.debug.ui.launcher.StandardVMType/JavaSE-1.8"/>
  <classpathentry kind="con" path="org.eclipse.jst.j2ee.internal.web.container"/>
  <classpathentry kind="con" path="org.eclipse.jst.j2ee.internal.module.container"/>
  <classpathentry kind="output" path="WebContent/WEB-INF/classes"/>
</classpath>
"""

FACET_CORE = """<?xml version="1.0" encoding="UTF-8"?>
<faceted-project>
  <installed facet="java" version="1.8"/>
  <installed facet="jst.web" version="3.1"/>
</faceted-project>
"""

WST_COMPONENT = f"""<?xml version="1.0" encoding="UTF-8"?>
<project-modules id="moduleCoreId" project-version="1.5.0">
  <wb-module deploy-name="{PROJECT_NAME}">
    <wb-resource deploy-path="/" source-path="/WebContent" tag="defaultRootSource"/>
    <wb-resource deploy-path="/WEB-INF/classes" source-path="/src"/>
    <property name="context-root" value="{CONTEXT_ROOT}"/>
    <property name="java-output-path" value="/WebContent/WEB-INF/classes"/>
  </wb-module>
</project-modules>
"""

JDT_PREFS = """eclipse.preferences.version=1
org.eclipse.jdt.core.compiler.codegen.targetPlatform=1.8
org.eclipse.jdt.core.compiler.compliance=1.8
org.eclipse.jdt.core.compiler.source=1.8
"""

# ⚠️ 한글이 든 소스가 많다. 이 파일이 없으면 Eclipse 가 OS 기본 인코딩(cp949)으로
#    읽어 주석·문자열이 깨진다.
RESOURCES_PREFS = f"""eclipse.preferences.version=1
encoding/<project>=UTF-8
encoding//src=UTF-8
encoding//WebContent=UTF-8
encoding//config=UTF-8
"""


def copy_tree(src, dst, only_suffix=None):
    """`src` 아래를 `dst` 로 복사하고 복사한 파일 수를 돌려준다."""
    count = 0
    for path in sorted(src.rglob("*")):
        if not path.is_file():
            continue
        if only_suffix and path.suffix != only_suffix:
            continue
        target = dst / path.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        count += 1
    return count


def extract_from_war(war, prefix, dst, exclude=None):
    """WAR 안 `prefix/` 아래를 `dst` 로 푼다."""
    count = 0
    with zipfile.ZipFile(war) as z:
        for name in z.namelist():
            if not name.startswith(prefix) or name.endswith("/"):
                continue
            rel = name[len(prefix):]
            if exclude and exclude.search(Path(rel).name):
                continue
            target = dst / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(name) as fin, open(target, "wb") as fout:
                shutil.copyfileobj(fin, fout)
            count += 1
    return count


def main():
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 \
        else UPLOADER.parent / "dist" / "uploader-wtp"

    if not WAR.exists():
        die(f"WAR 가 없다: {WAR}\n"
            f"       먼저 빌드할 것 —  cd uploader && mvn -o clean package")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # ── 소스: java 와 리소스를 한 폴더로 합친다(WTP 는 평면 src 다) ──
    n_java = copy_tree(UPLOADER / "src/main/java", out / "src")
    n_res = copy_tree(UPLOADER / "src/main/resources", out / "src")

    # ── 웹 루트 ──
    n_web = copy_tree(UPLOADER / "src/main/webapp", out / "WebContent")

    # ── 빌드 산출물: WAR 에서 그대로 가져온다 ──
    webinf = out / "WebContent" / "WEB-INF"
    n_lib = extract_from_war(WAR, "WEB-INF/lib/", webinf / "lib", exclude=LIB_EXCLUDE)
    n_cls = extract_from_war(WAR, "WEB-INF/classes/", webinf / "classes")

    # ── 설정: 운영(prod)을 기본으로 깔아 둔다 ──
    (out / "config").mkdir()
    shutil.copy2(UPLOADER / "config-envs/prod/application.properties",
                 out / "config" / "application.properties")

    # ── Eclipse 프로젝트 파일 ──
    (out / ".project").write_text(DOT_PROJECT, encoding="utf-8", newline="\n")
    (out / ".classpath").write_text(DOT_CLASSPATH, encoding="utf-8", newline="\n")
    settings = out / ".settings"
    settings.mkdir()
    (settings / "org.eclipse.wst.common.project.facet.core.xml").write_text(
        FACET_CORE, encoding="utf-8", newline="\n")
    (settings / "org.eclipse.wst.common.component").write_text(
        WST_COMPONENT, encoding="utf-8", newline="\n")
    (settings / "org.eclipse.jdt.core.prefs").write_text(
        JDT_PREFS, encoding="utf-8", newline="\n")
    (settings / "org.eclipse.core.resources.prefs").write_text(
        RESOURCES_PREFS, encoding="utf-8", newline="\n")

    # 다른 환경 설정도 참고용으로 함께 넣는다(복사해 쓰라는 뜻).
    envs = out / "config-envs"
    copy_tree(UPLOADER / "config-envs", envs)

    # 문서 2건도 함께 — 내부망에서 리포를 열어 볼 수 없다.
    shutil.copy2(Path(__file__).parent / "README-WTP.md", out / "README-WTP.md")
    shutil.copy2(UPLOADER / "DEPLOY.md", out / "DEPLOY.md")
    # 되돌리기 스크립트도 넣어 둔다 — 이 폴더만 들고 나와도 왕복이 된다.
    (out / "tools").mkdir()
    shutil.copy2(Path(__file__).parent / "import_wtp.py", out / "tools" / "import_wtp.py")

    print(f"내보냈다: {out}")
    print(f"  src/         java {n_java} + 리소스 {n_res}")
    print(f"  WebContent/  기술서 {n_web} · lib {n_lib} jar · classes {n_cls}")
    print(f"  config/      application.properties (prod)")
    print(f"  .project · .classpath · .settings 4개")


if __name__ == "__main__":
    main()
