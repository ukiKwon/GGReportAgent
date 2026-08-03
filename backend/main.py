import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.db import init_db
from backend.orchestrator_service import OrchestratorService
from backend.routers.bidcases import router as bidcases_router
from backend.routers.chat import router as chat_router
from backend.routers.inbox import router as inbox_router
from backend.routers.accounts import router as accounts_router
from backend.routers.consistency import router as consistency_router
from backend.routers.institutions import router as institutions_router
from backend.routers.notifications import router as notifications_router
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
    archive_root: str = "data/report_archive",
    static_dir: str | None = None,
    demo: bool = False,
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
    app.state.archive_root = archive_root
    # 데모 여부는 화면이 QA용 계정 전환기를 띄울지 판단하는 데만 쓴다(운영에선 안 뜬다).
    app.state.demo = demo
    init_db(db_path).close()
    app.state.orchestrator = OrchestratorService(db_path, graph_db_path, output_root)
    app.include_router(institutions_router)
    app.include_router(bidcases_router)
    app.include_router(tasks_router)
    app.include_router(chat_router)
    app.include_router(search_router)
    app.include_router(inbox_router)
    app.include_router(workflow_router)
    app.include_router(notifications_router)
    app.include_router(accounts_router)
    app.include_router(consistency_router)
    if static_dir:
        if os.path.isdir(static_dir):
            # 라우터 등록 뒤에 마운트해야 /institutions 등 API 경로가 정적보다 우선한다.
            app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
        else:
            # repo 루트 밖에서 기동하면 dashboard/가 안 보인다 — API까지 죽이지는 않는다.
            print(f"[warn] 정적 디렉터리를 찾지 못해 마운트를 건너뜁니다: {static_dir}")
    return app


app = create_app(os.environ.get("REGISTRY_DB_PATH", "data/registry.db"), static_dir=os.environ.get("STATIC_DIR", "dashboard"))
