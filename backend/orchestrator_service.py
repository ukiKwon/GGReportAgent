"""그래프 실행 서비스 — 기관당 스레드 1개, 게이트에서 멈추고 결재로 재개한다."""

import sqlite3
import threading

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from agent.orchestrator.graph import build_workflow_graph
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
        # SqliteSaver(conn)은 커넥션 하나를 계속 물고 있는다 — 백그라운드 스레드에서
        # 열고 그 스레드 안에서만 쓰므로 check_same_thread=False가 필요하다(호출 스레드가
        # invoke를 부르는 스레드와 같다는 전제, 이 서비스의 _spawn 구조가 보장한다).
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
