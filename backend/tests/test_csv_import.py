from backend.csv_import import parse_csv


def test_parse_csv_maps_korean_headers_and_ignores_dashboard_only_columns():
    csv_text = (
        "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일,확정여부,경도,위도,출처,수정일\n"
        "테스트구청,지자체,11,4,2022-12-30,,,,,,\n"
    )
    raw = csv_text.encode("utf-8-sig")

    rows = parse_csv(raw)

    assert len(rows) == 1
    assert rows[0].name_ko == "테스트구청"
    assert rows[0].type == "지자체"
    assert rows[0].region_code == "11"
    assert rows[0].term == 4
    assert rows[0].last_bid == "2022-12-30"
    assert rows[0].contract_end is None


def test_parse_csv_handles_multiple_rows():
    csv_text = "기관명,기관구분\n가구청,지자체\n나구청,공기업\n"
    raw = csv_text.encode("utf-8-sig")

    rows = parse_csv(raw)

    assert [r.name_ko for r in rows] == ["가구청", "나구청"]
    assert [r.type for r in rows] == ["지자체", "공기업"]
