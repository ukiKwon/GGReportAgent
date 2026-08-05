"""오케스트레이터의 기록 포트 — agent 층은 backend를 모른다(분리 관행).

그래프 노드는 이 포트로만 바깥에 말한다. backend가 DB 구현체(DbRecorder)를 주입하고,
그래프 단위테스트는 NullRecorder를 쓴다.
"""

from typing import Protocol


class Recorder(Protocol):
    def set_stage(self, stage: int) -> None: ...
    def task_update(self, team: str, status: str, progress_pct: int) -> None: ...
    # 그 팀의 Task 자리만 열어둔다(없으면 만들고, 있으면 **아무것도 바꾸지 않는다**).
    # task_update와 나뉘어 있는 이유: 노드가 재실행될 수 있는데(최종반려 → packager
    # 재실행) task_update는 status·progress를 덮어써서 사람이 해둔 작업을 되돌린다.
    def task_open(self, team: str) -> None: ...
    # author는 사람이 쓴 글의 실명(결재자 등). 단계는 구현체가 set_stage로 추적한다.
    # model은 이 보고를 남길 때 실제로 쓴 LLM 모델 — LLM을 쓴 노드만 넘긴다(Task 5).
    def message(
        self, team: str, role: str, content: str,
        author: str | None = None, model: str | None = None,
    ) -> None: ...
    def notify(self, recipient: str, kind: str, content: str) -> None: ...


class NullRecorder:
    def set_stage(self, stage: int) -> None: pass
    def task_update(self, team: str, status: str, progress_pct: int) -> None: pass
    def task_open(self, team: str) -> None: pass
    def message(
        self, team: str, role: str, content: str,
        author: str | None = None, model: str | None = None,
    ) -> None: pass
    def notify(self, recipient: str, kind: str, content: str) -> None: pass
