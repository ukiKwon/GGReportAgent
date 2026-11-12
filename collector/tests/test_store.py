import pathlib

import pytest

from collector.store import RawStore


def test_write_replaces_and_removes_bak(tmp_path):
    s = RawStore(tmp_path)
    s.write("eminwon", "h", "n1", b"v1", [], {})
    final = s.write("eminwon", "h", "n1", b"v2", [], {})
    assert (final / "detail.html").read_bytes() == b"v2"
    assert not (final.parent / ".bak-n1").exists()


def test_write_failure_restores_old_raw(tmp_path, monkeypatch):
    s = RawStore(tmp_path)
    final = s.write("eminwon", "h", "n1", b"v1", [], {})
    monkeypatch.setattr("collector.store.time.sleep", lambda sec: None)
    orig = pathlib.Path.rename

    def deny_tmp(self, target):
        if self.name.startswith(".tmp-"):
            raise PermissionError("locked")
        return orig(self, target)

    monkeypatch.setattr(pathlib.Path, "rename", deny_tmp)
    with pytest.raises(PermissionError):
        s.write("eminwon", "h", "n1", b"v2", [], {})
    assert (final / "detail.html").read_bytes() == b"v1"
    assert not (final.parent / ".bak-n1").exists()
