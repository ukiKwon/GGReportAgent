import csv
import io

from pydantic import ValidationError

from server.models import InstitutionImportRow

HEADER_MAP = {
    "기관명": "name_ko",
    "기관구분": "type",
    "지역코드": "region_code",
    "입찰주기": "term",
    "지난입찰일": "last_bid",
    "입찰예상일": "contract_end",
}


def parse_csv(raw: bytes) -> list[InstitutionImportRow]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp949")

    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row_num, record in enumerate(reader, start=1):
        try:
            mapped = {}
            for ko_header, field in HEADER_MAP.items():
                value = (record.get(ko_header) or "").strip()
                if not value:
                    continue
                mapped[field] = int(value) if field == "term" else value
            rows.append(InstitutionImportRow(**mapped))
        except (ValueError, ValidationError) as exc:
            raise ValueError(f"row {row_num}: {exc}") from exc
    return rows
