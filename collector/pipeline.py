"""수집(원문 보관) → 추출+포장. 스케줄러·RPA·에이전트는 cli.main만 부른다."""

from __future__ import annotations

import datetime

from collector.batch import write_batch
from collector.extract.build import notice_from_raw
from collector.sources.base import RunReport, SourceError


def _now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def collect(source, state, store, *, since=None, hosts=None, limit=None, baseline=False) -> dict:
    slug, report, started = source.slug, RunReport(), _now_iso()
    new: list[str] = []
    skipped = 0
    failed: list[dict] = []
    for ref in source.list_new(state.index(slug), since, report, hosts):
        info = dict(title=ref.title, posted_at=ref.posted_at, first_seen=_now_iso(), batch_id=None)
        if baseline:               # 현재 목록을 '본 것'으로만 표시 — 첫 실행의 과거 글 폭주 방지
            state.mark_seen(slug, ref.key, baseline=True, **info)
            continue
        if not source.accepts(ref):
            state.mark_seen(slug, ref.key, skipped=True, **info)
            skipped += 1
            continue
        if limit is not None and len(new) >= limit:
            break
        try:
            raw = source.fetch_raw(ref, store)
        except SourceError as exc:
            failed.append({"key": ref.key, "error": str(exc)[:200]})
            continue
        state.mark_seen(slug, ref.key, raw=raw.rel, **info)   # 원문 보관에 성공한 뒤에만 '본 것'
        state.save()
        new.append(ref.key)
    summary = {"source": slug, "new": len(new), "new_keys": new, "skipped": skipped, "failed": failed,
               "hosts_ok": len(report.hosts_ok), "hosts_failed": report.hosts_failed}
    state.add_run(slug, dict(summary, started_at=started, finished_at=_now_iso(),
                             baseline=baseline, since=since))
    state.save()
    return summary


def extract_and_pack(source, state, store, out_root, *, redo_all=False, now=None) -> dict:
    slug = source.slug
    notices, keys, errors = [], [], []
    for key, info in state.with_raw(slug, include_packed=redo_all):
        try:
            notices.append(notice_from_raw(store.root / info["raw"], info["raw"]))
            keys.append(key)
        except (OSError, ValueError, KeyError, SourceError) as exc:
            errors.append({"key": key, "error": f"{type(exc).__name__}: {str(exc)[:150]}"})
    if not notices:
        return {"batch_id": None, "records": 0, "extract_errors": errors}
    result = write_batch(source, notices, out_root, now=now)   # 자기검사 실패 시 배치를 남기지 않고 예외
    for key in keys:
        state.set_batch(slug, key, result.batch_id)
    state.save()
    return {"batch_id": result.batch_id, "records": result.record_count, "extract_errors": errors}
