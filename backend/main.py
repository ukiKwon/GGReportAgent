import os

from fastapi import FastAPI

from backend.db import init_db
from backend.routers.bidcases import router as bidcases_router
from backend.routers.institutions import router as institutions_router
from backend.routers.tasks import router as tasks_router


def create_app(db_path: str) -> FastAPI:
    app = FastAPI(title="입찰 워크플로우 레지스트리 API")
    app.state.db_path = db_path
    init_db(db_path).close()
    app.include_router(institutions_router)
    app.include_router(bidcases_router)
    app.include_router(tasks_router)
    return app


app = create_app(os.environ.get("REGISTRY_DB_PATH", "registry.db"))
