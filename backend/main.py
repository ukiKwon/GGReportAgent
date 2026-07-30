import os

from fastapi import FastAPI

from backend.db import init_db
from backend.orchestrator_service import OrchestratorService
from backend.routers.bidcases import router as bidcases_router
from backend.routers.chat import router as chat_router
from backend.routers.inbox import router as inbox_router
from backend.routers.institutions import router as institutions_router
from backend.routers.search import router as search_router
from backend.routers.tasks import router as tasks_router
from backend.routers.workflow import router as workflow_router


def create_app(
    db_path: str,
    output_root: str = "data/report_new",
    index_db_path: str = "data/corpus_index.db",
    inbox_root: str = "corpus/inbox",
    rfp_root: str = "corpus/rfp",
    batches_root: str = "data/batches",
    graph_db_path: str = "data/graph_checkpoints.db",
) -> FastAPI:
    app = FastAPI(title="입찰 워크플로우 레지스트리 API")
    app.state.db_path = db_path
    app.state.output_root = output_root
    app.state.index_db_path = index_db_path
    # 반입이 읽고 쓰는 세 곳. 파라미터로 빼두면 테스트가 tmp_path로 격리할 수 있다.
    app.state.inbox_root = inbox_root
    app.state.rfp_root = rfp_root
    app.state.batches_root = batches_root
    app.state.graph_db_path = graph_db_path
    init_db(db_path).close()
    app.state.orchestrator = OrchestratorService(db_path, graph_db_path, output_root)
    app.include_router(institutions_router)
    app.include_router(bidcases_router)
    app.include_router(tasks_router)
    app.include_router(chat_router)
    app.include_router(search_router)
    app.include_router(inbox_router)
    app.include_router(workflow_router)
    return app


app = create_app(os.environ.get("REGISTRY_DB_PATH", "data/registry.db"))
