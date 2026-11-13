import json

import pytest

from collector import cli
from collector.preview import (CAT_DIFF, CAT_DONE, CAT_MISSING, CAT_NEW, PreviewError, build_rows,
                               load_screen, run_preview)

INSTITUTIONS_JS = """// 머리말 주석 — it's a comment with 'quote
window.institutions = [
  // ── 날짜 확보 ──
  { name:"서울특별시", type:"지자체", region:"11", term:4, lastBid:"2026-04-03",
    sources:[
      "기준일=공고일(시금고 지정계획 공고)",
      "https://example.com/seoul",
    ], updatedAt:"2026-08-09" },
  { name:"부산광역시", type:"지자체", region:"26", term:4, lastBid:"2024-09-24",
    sources:["기준일=지정(선정)일 — 공고일 미상"], updatedAt:"2026-08-09" },
  { name:"대전광역시", type:"지자체", region:"30", term:3, lastBid:"2025-03-01", sources:[] },
  { name:"깨진기관", region:"99", lastBid: new Date() },
  { name:"동구", region:"28", lastBid:"2025-01-01" },
];
const SEOUL_GU = [["11110", "종로구"]];
window.institutions.push({ name:"생성됨" });
"""

NONMUNI_JS = """(function (root) {
  const E = function (o) { return Object.assign({ type: '교육청' }, o); };
  const G = function (o) { return Object.assign({ type: '공공기관' }, o); };
  const U = function (n, o) { return 'https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=' + n + '&bidPbancOrd=' + (o || '000'); };
  root.institutionsNonMuni = [
    // 주석
    G({ name: '한국승강기안전공단', region: '48', lastBid: '2026-01-14',
      sources: ['월/일 미확보 — 나라장터 공고 2026-01-14(R26BK01272452)', U('R26BK01272452')] }),
  ];
})(window);
"""


def _rec(nid, name, key=None, region=None, number=None, mgt_no=None, notice_at=None, term=None,
         url=None, title="금고 지정 공고"):
    fields = {}
    if notice_at:
        fields["notice_at"] = notice_at
    if term:
        fields["term"] = term
    notice = {}
    if key:
        notice["institution_key"] = key
    if number:
        notice["number"] = number
    if mgt_no:
        notice["mgt_no"] = mgt_no
    institution = {"name_ko": name, "type": "지자체"}
    if region:
        institution["region_code"] = region
    rec = {"notice_id": nid, "title": title, "institution": institution, "schedule": {},
           "attachments": [], "evidence": {"url": url} if url else {}, "notice": notice,
           "candidate": {"status": "후보", "role": "진행중", "fields": fields, "basis": []}}
    if notice_at:
        rec["schedule"]["posted_at"] = notice_at
    return rec


def _setup(tmp_path, records, batch_id="2026-11-12_0900_test"):
    root = tmp_path / "out"
    (root / batch_id).mkdir(parents=True)
    (root / batch_id / "manifest.json").write_text(json.dumps(
        {"schema_version": 1, "batch_id": batch_id, "collected_at": "2026-11-12T09:00:00+09:00",
         "source": {"slug": "test", "name_ko": "시험"}, "records": records}, ensure_ascii=False),
        encoding="utf-8")
    ij, nj = tmp_path / "institutions.js", tmp_path / "institutions_nonmuni.js"
    ij.write_text(INSTITUTIONS_JS, encoding="utf-8")
    nj.write_text(NONMUNI_JS, encoding="utf-8")
    return root, batch_id, ij, nj


def _four_records():
    return [
        _rec("a", "서울특별시", key="11|서울특별시", notice_at="2026-09-01"),                 # 새 소식
        _rec("b", "(재)한국승강기안전공단", number="R26BK01272452-000", mgt_no="R26BK01272452",
             notice_at="2026-01-14",
             url="https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01272452&bidPbancOrd=000"),  # 이미 반영
        _rec("c", "대전광역시", key="30|대전광역시", notice_at="2025-03-01", term=4),         # 값 다름(약정 연수)
        _rec("d", "부산광역시", key="26|부산광역시", notice_at="2024-09-10"),                 # 값 다름(날짜)
        _rec("e", "없는구청", key="99|없는구청", notice_at="2026-10-01"),                     # 기관 못 찾음
    ]


def test_four_categories_and_parse_counts(tmp_path):
    root, bid, ij, nj = _setup(tmp_path, _four_records())
    out = run_preview(bid, root, institutions_js=ij, nonmuni_js=nj)
    assert out["counts"] == {CAT_NEW: 1, CAT_DIFF: 2, CAT_DONE: 1, CAT_MISSING: 1}
    assert out["screen"]["institutions"] == 4 and out["screen"]["institutions_failed"] == 1
    assert out["screen"]["generated_blocks"] == 1 and out["screen"]["nonmuni"] == 1
    screens, _ = load_screen(ij, nj)
    cats = {r["id"]: (r["cat"], r["reason"]) for r in build_rows(_four_records(), screens)}
    assert cats["a"][0] == CAT_NEW
    assert cats["b"][0] == CAT_DONE
    assert cats["c"][0] == CAT_DIFF and "약정 연수" in cats["c"][1]
    assert cats["d"][0] == CAT_DIFF and "날짜 다름" in cats["d"][1]
    assert cats["e"][0] == CAT_MISSING


def test_files_written_and_data_untouched(tmp_path):
    root, bid, ij, nj = _setup(tmp_path, _four_records())
    before = (ij.read_bytes(), nj.read_bytes(), (root / bid / "manifest.json").read_bytes())
    run_preview(bid, root, institutions_js=ij, nonmuni_js=nj)
    assert (root / bid / "preview.html").is_file() and (root / bid / "preview.csv").is_file()
    assert not list((root / bid).glob("*.tmp"))
    assert before == (ij.read_bytes(), nj.read_bytes(), (root / bid / "manifest.json").read_bytes())
    head = (root / bid / "preview.html").read_text(encoding="utf-8")
    assert "생성 블록(push) 1곳" in head and "해석 실패 1" in head
    csv_text = (root / bid / "preview.csv").read_bytes().decode("utf-8-sig")
    assert csv_text.splitlines()[0].startswith("분류,사유,공고ID")
    assert len(csv_text.strip().splitlines()) == 6


def test_html_escape_no_external_resource_and_csv_injection(tmp_path):
    recs = [_rec("x", "서울특별시", key="11|서울특별시", notice_at="2026-09-01",
                 title='<script>alert(1)</script>"&'),
            _rec("y", "서울특별시", key="11|서울특별시", notice_at="2026-09-02", title="=HYPERLINK(\"x\")",
                 url="javascript:alert(1)")]
    root, bid, ij, nj = _setup(tmp_path, recs)
    run_preview(bid, root, institutions_js=ij, nonmuni_js=nj)
    page = (root / bid / "preview.html").read_text(encoding="utf-8")
    assert "<script" not in page and "&lt;script&gt;" in page
    assert "href=\"javascript" not in page and "<link" not in page
    csv_text = (root / bid / "preview.csv").read_bytes().decode("utf-8-sig")
    assert "'=HYPERLINK" in csv_text and ",=HYPERLINK" not in csv_text


def test_screen_json_suffix_match_and_no_false_dong_gu(tmp_path):
    screen = tmp_path / "screen.json"
    screen.write_text(json.dumps([
        {"name": "동작구", "region": "11", "lastBid": "2026-01-01", "term": 4},
        {"name": "동구", "region": "28", "lastBid": "2025-01-01"},
    ], ensure_ascii=False), encoding="utf-8")
    recs = [_rec("p", "동작구청", key="11|동작구청", notice_at="2026-11-05"),          # 청 뗀 이름으로 맞춤 → 새 소식
            _rec("q", "인천 남동구청", key="28|인천 남동구청", notice_at="2026-11-05")]  # 동구에 잘못 붙으면 안 됨
    root, bid, ij, nj = _setup(tmp_path, recs)
    out = run_preview(bid, root, screen_json=screen)
    assert out["screen"]["mode"] == "screen-json" and out["screen"]["screen_json"] == 2
    assert out["counts"] == {CAT_NEW: 1, CAT_DIFF: 0, CAT_DONE: 0, CAT_MISSING: 1}


def test_old_notice_is_already_reflected(tmp_path):
    root, bid, ij, nj = _setup(tmp_path, [_rec("o", "서울특별시", key="11|서울특별시", notice_at="2019-01-01")])
    out = run_preview(bid, root, institutions_js=ij, nonmuni_js=nj)
    assert out["counts"][CAT_DONE] == 1


def test_bad_batch_id_and_missing_batch(tmp_path):
    for bad in ("../x", "a/b", "", ".."):
        with pytest.raises(PreviewError):
            run_preview(bad, tmp_path)
    with pytest.raises(PreviewError):
        run_preview("nope", tmp_path)


def test_cli_preview(tmp_path, capsys):
    root, bid, ij, nj = _setup(tmp_path, _four_records())
    code = cli.main(["preview", "--batch", bid, "--out-root", str(root),
                     "--institutions-js", str(ij), "--nonmuni-js", str(nj)])
    assert code == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["records"] == 5 and summary["counts"][CAT_NEW] == 1
    assert cli.main(["preview", "--batch", "nope", "--out-root", str(root)]) == 1


def test_previous_round_not_reported_as_new_or_diff(tmp_path):
    screen = tmp_path / "screen.json"
    screen.write_text(json.dumps([{"name": "괴산군", "region": "43", "contractExpiry": "2028-12-31"},
                                  {"name": "영암군", "region": "46", "contractExpiry": "2027-12-31"}],
                                 ensure_ascii=False), encoding="utf-8")
    old_round = _rec("g", "괴산군청", key="43|괴산군청", notice_at="2018-02-21")
    old_round["candidate"]["fields"]["contract_end"] = "2020-12-31"
    very_old = _rec("y", "영암군청", key="46|영암군청", notice_at="2010-08-25")
    root, bid, ij, nj = _setup(tmp_path, [old_round, very_old])
    out = run_preview(bid, root, screen_json=screen)
    assert out["counts"] == {CAT_NEW: 0, CAT_DIFF: 0, CAT_DONE: 2, CAT_MISSING: 0}


def test_feb29_expiry_does_not_crash(tmp_path):
    screen = tmp_path / "screen.json"
    screen.write_text(json.dumps([{"name": "괴산군", "region": "43", "contractExpiry": "2028-02-29"}],
                                 ensure_ascii=False), encoding="utf-8")
    root, bid, ij, nj = _setup(tmp_path, [_rec("g", "괴산군청", key="43|괴산군청", notice_at="2010-01-01")])
    assert run_preview(bid, root, screen_json=screen)["counts"][CAT_DONE] == 1
