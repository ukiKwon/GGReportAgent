---
name: rfp-locate
description: Use when starting proposal work for a new institution's RFP (공고문), when asked to find or locate an RFP PDF, or when asked to extract a scoring table (배점표) from an RFP document
---

# rfp-locate

## Overview

Finds the RFP (공고문) PDF for the institution being worked on, extracts its full text, and structures its scoring table (배점표: evaluation items and point weights) into JSON. Downstream proposal-writing work (requirement extraction, section/slide planning) consumes this skill's output rather than re-parsing the PDF.

## When to Use

- User says "RFP 찾아줘" or "배점표 추출해줘"
- Starting proposal work for a new local-government or public-institution RFP and no scoring table JSON exists yet for it

## Workflow

1. **Locate the PDF** — scan `RFP/` in the repo root.
   - Exactly one PDF present → use it.
   - Multiple PDFs → ask the user which one; never guess.
   - Empty folder → search the web for the institution's official announcement PDF by name; if found, download it into `RFP/` and confirm with the user before proceeding. If not found, ask the user to upload the file or provide a path — never fabricate content.
2. **Extract text** — run `scripts/extract_text.py <pdf_path>`. This returns `pages`, `full_text`, `avg_chars_per_page`, `is_abnormal`, `abnormal_reason`.
3. **Fallback if abnormal** — if `is_abnormal` is `true` (avg chars/page under 50, or over 1% replacement characters — typically a CID-font or image-embedded PDF), run `scripts/render_pages.py <pdf_path> <out_dir>` to render each page to PNG, then read each PNG with the Read tool (vision) to recover the text and scoring table by inspection. This is not a hypothetical case — 도봉구's 4개년계획 PDF required exactly this fallback (see `구청_log.md` 14:11–14:29).
4. **Structure the scoring table** — from the extracted (or vision-read) text, produce a JSON object matching `references/scoring_schema.json`'s shape: `institution`, `rfp_title`, `total_score`, and a `criteria` list of `{category, item, score, description}`. The raw extracted text does not preserve table column boundaries (verified on the sample RFP: the scoring table's 항목/세부항목/배점/비고 columns collapse into one text run) — this structuring step requires reading the text and reconstructing the table, not a mechanical parse.
5. **Save outputs**:
   - `report_new/{institution}/rfp_scoring.json` — the structured scoring table
   - `report_new/{institution}/rfp_text.txt` — the full extracted (or vision-read) text

## Error Handling

- Never guess a missing file or an unclear extraction result — always confirm with the user.
- A scoring table may not exist in every RFP. If none is found after a genuine attempt, save `"criteria": []` and tell the user no scoring table was found — an empty list is a valid result, not a failure.

## Reference

- `references/scoring_schema.json` — worked example using the 수원시 금고 지정 RFP's actual scoring table.
