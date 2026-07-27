import csv
import io

from backend.models import InstitutionImportRow

HEADER_MAP = {
    "기관명": "name_ko",
    "기관구분": "type",
    "지역코드": "region_code",
    "입찰주기": "term",
    "지난입찰일": "last_bid",
    "입찰예상일": "contract_end",
}


def parse_csv(raw: bytes) -> list[InstitutionImportRow]:
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for record in reader:
        mapped = {}
        for ko_header, field in HEADER_MAP.items():
            value = (record.get(ko_header) or "").strip()
            if not value:
                continue
            mapped[field] = int(value) if field == "term" else value
        rows.append(InstitutionImportRow(**mapped))
    return rows
