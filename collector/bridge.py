"""반입 대행 CLI — 운영에서 사람이 USB로 하는 일을 테스트에서 대신한다.

이 도구는 **어느 쪽 서비스도 아니다**(설계 §③). collector 서비스도 server도
서로의 주소를 모르며, 주소를 아는 것은 이 브리지뿐이다. 운영에서는 이 자리에
사람이 들어간다 — 즉 운영과 테스트의 차이는 "누가 옮기는가" 하나로 국한된다.

    py -3.14 -m collector.bridge --batch 2026-07-29_0930_fixture

기본값: DMZ http://127.0.0.1:8001, 망 안 http://127.0.0.1:8000, inbox corpus/inbox

반입 API에는 batch_id만 넘긴다 — 파일을 다시 올리지 않는다. 그래서 `--inbox`는
**망 안 서버가 보는 inbox와 같은 자리**여야 한다(운영에서 사람이 USB로 배치를
그 자리에 놓는 것과 같다).
"""

from __future__ import annotations

import argparse
import io
import shutil
import sys
import zipfile
from pathlib import Path

import httpx

DEFAULT_DMZ = "http://127.0.0.1:8001"
DEFAULT_BACKEND = "http://127.0.0.1:8000"
DEFAULT_INBOX = "corpus/inbox"


class BridgeError(Exception):
    pass


def carry_batch(
    batch_id: str,
    *,
    dmz_url: str = DEFAULT_DMZ,
    backend_url: str = DEFAULT_BACKEND,
    inbox: str | Path = DEFAULT_INBOX,
    do_import: bool = True,
    client: httpx.Client | None = None,
) -> dict:
    """ⓐ DMZ에서 배치를 받아 ⓑ inbox에 풀고 검증하고 ⓒ 망 안에 반입한다."""
    from contract.batch_schema import validate_batch

    inbox = Path(inbox)
    target = inbox / batch_id
    if target.exists():
        raise BridgeError(f"이미 inbox에 있습니다: {target}")

    owns_client = client is None
    client = client or httpx.Client(timeout=30.0)
    try:
        archive = _download(client, dmz_url, batch_id)
        _extract(archive, target)

        errors = validate_batch(target)
        if errors:
            # 검증 실패한 배치를 inbox에 남기지 않는다 — 사람이 옮긴 뒤 발견하면 늦다.
            shutil.rmtree(target, ignore_errors=True)
            raise BridgeError("배치 검증 실패: " + "; ".join(errors))

        result = {"batch_id": batch_id, "inbox_path": str(target), "imported": None}
        if do_import:
            result["imported"] = _import_batch(client, backend_url, batch_id)
        return result
    finally:
        if owns_client:
            client.close()


def _download(client: httpx.Client, dmz_url: str, batch_id: str) -> bytes:
    response = client.get(f"{dmz_url.rstrip('/')}/batches/{batch_id}/archive")
    if response.status_code != 200:
        raise BridgeError(f"DMZ에서 배치를 받지 못했습니다 (HTTP {response.status_code})")
    return response.content


def _extract(archive: bytes, target: Path) -> None:
    target.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for name in zf.namelist():
            destination = (target / name).resolve()
            if not destination.is_relative_to(target.resolve()):
                shutil.rmtree(target, ignore_errors=True)
                raise BridgeError(f"zip 안에 경로 이탈 항목이 있습니다: {name}")
        zf.extractall(target)


def _import_batch(client: httpx.Client, backend_url: str, batch_id: str) -> dict:
    """batch_id만 넘긴다 — 파일은 이미 망 안 inbox에 놓여 있다.

    망 경계는 그대로다: 백엔드는 **자기 파일시스템의 corpus/inbox/만 읽는다.**
    망 밖을 향한 요청도, 역방향 콜백도 생기지 않는다(SCHEMA.md §⑩-5).
    """
    response = client.post(f"{backend_url.rstrip('/')}/inbox/{batch_id}/import")
    if response.status_code != 200:
        raise BridgeError(f"망 안 반입 실패 (HTTP {response.status_code}): {response.text}")
    return response.json()


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(prog="collector.bridge")
    parser.add_argument("--batch", required=True, help="옮길 batch_id")
    parser.add_argument("--dmz", default=DEFAULT_DMZ)
    parser.add_argument("--backend", default=DEFAULT_BACKEND)
    parser.add_argument("--inbox", default=DEFAULT_INBOX)
    parser.add_argument(
        "--no-import", action="store_true", help="inbox에 놓기만 하고 반입 API는 호출하지 않는다"
    )
    args = parser.parse_args(argv)

    try:
        result = carry_batch(
            args.batch,
            dmz_url=args.dmz,
            # `--backend` 플래그에서 나온 속성이다. 개명(⑦단계)에서 CLI 플래그는
            # 바꾸지 않기로 했으므로(호출부가 깨진다) 여기 이름도 그대로다.
            backend_url=args.backend,
            inbox=args.inbox,
            do_import=not args.no_import,
        )
    except BridgeError as exc:
        print(f"실패: {exc}", file=sys.stderr)
        return 1

    print(f"inbox에 놓음: {result['inbox_path']}")
    if result["imported"] is not None:
        imported = result["imported"]
        cases = imported.get("bid_cases") or {}
        print(
            f"망 안 반입 완료: 기관 {imported.get('imported_institutions')}건 "
            f"{imported.get('institution_ids')}"
        )
        print(
            f"  공고: 신규 {len(cases.get('created', []))}건 / "
            f"갱신 {len(cases.get('updated', []))}건, "
            f"첨부 {len(imported.get('rfp_files') or [])}건"
        )
        print(f"  배치 보관: {imported.get('archived_to')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
