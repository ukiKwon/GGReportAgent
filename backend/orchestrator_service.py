"""그래프 실행 서비스 — 기관당 스레드 1개, 게이트에서 멈추고 결재로 재개한다."""

import sqlite3
import threading

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from agent.orchestrator.graph import build_workflow_graph
from agent.paths import DEFAULT_ARCHIVE_ROOT
from backend.db import get_connection
from backend.orchestrator_recorder import DbRecorder


class OrchestratorService:
    def __init__(self, db_path: str, graph_db_path: str, output_root: str) -> None:
        self.db_path = db_path
        self.graph_db_path = graph_db_path
        self.output_root = output_root
        self._lock = threading.Lock()
        self._running: dict[str, threading.Thread] = {}
        self._failed: set[str] = set()

    # -- 내부 도우미 ------------------------------------------------------
    def _graph(self, institution_id: str, bid_case_id: str):
        # SqliteSaver(conn)은 커넥션 하나를 계속 물고 있는다. start/resume에서는 이
        # 커넥션을 만드는 스레드(요청을 처리하는 호출 스레드)와 실제로 graph.invoke()가
        # 그 커넥션을 두드리는 스레드(_spawn이 띄우는 백그라운드 스레드)가 서로 다르다
        # — 다만 겹치지 않는 순차 교차-스레드 사용이다(생성 스레드는 커넥션을 만들자마자
        # 클로저에 실어 백그라운드 스레드로 넘기고 그 이후로는 다시 건드리지 않는다).
        # sqlite3 커넥션은 "동시에 여러 스레드가 건드리지만 않으면" 순서대로 다른
        # 스레드가 이어받아 써도 안전하므로 check_same_thread=False가 필요하다.
        # (pending_gate()처럼 생성과 사용이 같은 스레드에서 끝나는 경우도 물론 안전.)
        saver_conn = sqlite3.connect(self.graph_db_path, check_same_thread=False)
        recorder = DbRecorder(self.db_path, institution_id, bid_case_id)
        return build_workflow_graph(recorder, SqliteSaver(saver_conn))

    def _latest_bid_case(self, institution_id: str) -> str | None:
        conn = get_connection(self.db_path)
        try:
            row = conn.execute(
                "SELECT bid_case_id FROM bid_cases WHERE institution_id=? ORDER BY rowid DESC LIMIT 1",
                (institution_id,),
            ).fetchone()
            return row["bid_case_id"] if row else None
        finally:
            conn.close()

    def _spawn(self, institution_id: str, target) -> None:
        def runner():
            try:
                target()
            except Exception:
                self._failed.add(institution_id)
            finally:
                self._running.pop(institution_id, None)

        t = threading.Thread(target=runner, daemon=True)
        self._running[institution_id] = t
        t.start()

    # -- 공개 API ---------------------------------------------------------
    @staticmethod
    def build_run_input(
        institution, output_root: str, archive_root: str = DEFAULT_ARCHIVE_ROOT
    ) -> dict:
        """그래프 시작 입력. 실행 경로가 둘(POST /run, 참여확정 자동 시작)이라 한곳에 둔다.

        M-1: `archive_root`는 **호출부가 `app.state.archive_root`를 넘겨야 한다.**
        예전에는 여기서 `"report_archive"`를 박아 뒀는데 실제 뿌리는
        `data/report_archive`(데모는 `data/demo_report_archive`)라, 이전 회차 제안서를
        찾는 `institution_match_node`가 **늘 빈 폴더를 봤다.** 예외가 나지 않아
        "이전 제안서 없음"과 구별되지 않았던 종류의 조용한 오작동이다.
        """
        return {
            "institution_id": institution.institution_id,
            "institution_name": institution.name_ko,
            "giganlist_dir": "corpus/institutions",
            "report_new_dir": output_root,
            # 반입 안 됐으면 None 유지 — rfi_agent가 산출물 존재로 판단한다.
            "rfp_path": institution.rfp_path,
            "stage": institution.stage,
            "sections": [],
            # F6: institution_match_node에 명시 배선(기본값에 기대지 않는다).
            "archive_dir": archive_root,
        }

    def start(self, institution_id: str, run_input: dict) -> None:
        with self._lock:
            if institution_id in self._running:
                raise RuntimeError("already running")
            bid_case_id = self._latest_bid_case(institution_id)
            graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
            cfg = {"configurable": {"thread_id": institution_id}}
            self._failed.discard(institution_id)
            self._spawn(institution_id, lambda: graph.invoke(run_input, cfg))

    def resume(self, institution_id: str, approved: bool, by: str, comment: str | None) -> None:
        with self._lock:
            if institution_id in self._running:
                raise RuntimeError("still running")
            # Lock 비재진입: pending_gate에 락을 추가하면 데드락(이미 self._lock을
            # 쥔 채로 다시 획득을 시도하게 된다) — 이 lock 블록 안에서는 락 없이 호출한다.
            if not self.pending_gate(institution_id):
                raise LookupError("no pending gate")
            bid_case_id = self._latest_bid_case(institution_id)
            graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
            cfg = {"configurable": {"thread_id": institution_id}}
            self._spawn(
                institution_id,
                lambda: graph.invoke(
                    Command(resume={"approved": approved, "by": by, "comment": comment}), cfg
                ),
            )

    def pending_gate(self, institution_id: str) -> str | None:
        bid_case_id = self._latest_bid_case(institution_id)
        graph = self._graph(institution_id, bid_case_id or f"adhoc-{institution_id}")
        cfg = {"configurable": {"thread_id": institution_id}}
        state = graph.get_state(cfg)
        for task in getattr(state, "tasks", ()) or ():
            for intr in getattr(task, "interrupts", ()) or ():
                return intr.value["gate"]
        return None

    def is_running(self, institution_id: str) -> bool:
        return institution_id in self._running

    def has_failed(self, institution_id: str) -> bool:
        """직전 실행이 예외로 끝났는지 — start()가 재시작 시 _failed.discard로 지운다."""
        return institution_id in self._failed
