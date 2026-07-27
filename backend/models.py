from pydantic import BaseModel


class Institution(BaseModel):
    institution_id: str
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
    stage: int = 1
    giganlist_dir: str | None = None
    rfp_path: str | None = None
    scoring_table: list[dict] | None = None
    pptx_path: str | None = None


class InstitutionImportRow(BaseModel):
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    term: int | None = None
    last_bid: str | None = None
    contract_end: str | None = None
