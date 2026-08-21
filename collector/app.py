"""DMZ 수집 서비스 (망 밖). 기본 포트 8001 — 망 안 server(8000)와 포트로만 분리된다.

이 서비스는 망 안의 주소를 모른다. 배치를 만들어 자기 디스크에 두고 제공할 뿐이고,
가져가는 것은 운영자(또는 collector.bridge)의 몫이다 — 설계 §③.
"""

from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from collector.batch import COLLECTOR_VERSION, DEFAULT_OUT_ROOT, BatchError, write_batch
from collector.sources import get_source, list_sources
from collector.sources.base import SourceError
from contract.batch_schema import validate_batch


class CollectIn(BaseModel):
    source: str = "fixture"


def create_app(out_root: str = DEFAULT_OUT_ROOT) -> FastAPI:
    app = FastAPI(title="DMZ 공고 수집 서비스")
    app.state.out_root = out_root
    Path(out_root).mkdir(parents=True, exist_ok=True)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "version": COLLECTOR_VERSION}

    @app.get("/sources")
    def sources() -> list[dict]:
        return list_sources()

    @app.post("/collect")
    def collect(body: CollectIn, request: Request) -> dict:
        try:
            source = get_source(body.source)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"등록되지 않은 소스: {body.source}")
        try:
            notices = source.fetch()
            result = write_batch(source, notices, request.app.state.out_root)
        except (SourceError, BatchError) as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        return {
            "batch_id": result.batch_id,
            "records": result.record_count,
            "path": str(result.path),
        }

    @app.get("/batches")
    def batches(request: Request) -> list[dict]:
        root = Path(request.app.state.out_root)
        out = []
        for manifest_path in sorted(root.glob("*/manifest.json")):
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            out.append(
                {
                    "batch_id": manifest.get("batch_id", manifest_path.parent.name),
                    "collected_at": manifest.get("collected_at"),
                    "record_count": len(manifest.get("records", [])),
                }
            )
        return out

    @app.get("/batches/{batch_id}")
    def batch_manifest(batch_id: str, request: Request) -> dict:
        path = _batch_dir(request, batch_id) / "manifest.json"
        return json.loads(path.read_text(encoding="utf-8"))

    @app.get("/batches/{batch_id}/archive")
    def batch_archive(batch_id: str, request: Request) -> StreamingResponse:
        batch_dir = _batch_dir(request, batch_id)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(batch_dir.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(batch_dir).as_posix())
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{batch_id}.zip"'},
        )

    return app


def _batch_dir(request: Request, batch_id: str) -> Path:
    root = Path(request.app.state.out_root).resolve()
    candidate = (root / batch_id).resolve()
    # batch_id로 상위 경로를 타고 나가지 못하게 한다.
    if not candidate.is_relative_to(root) or not (candidate / "manifest.json").is_file():
        raise HTTPException(status_code=404, detail=f"배치를 찾을 수 없습니다: {batch_id}")
    errors = validate_batch(candidate)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    return candidate


app = create_app(os.environ.get("COLLECTOR_OUT_ROOT", DEFAULT_OUT_ROOT))
