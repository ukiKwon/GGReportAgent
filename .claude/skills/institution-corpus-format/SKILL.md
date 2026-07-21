---
name: institution-corpus-format
description: Use when writing or reviewing spec/plan/bank_ideas_draft files for a local government or public institution, or when checking an existing district's files against the standard format
---

# institution-corpus-format

## Overview

Defines the standard file layout, section format, and citation rules for `giganlist/{institution}/spec/`, `giganlist/{institution}/plan/`, and `giganlist/{institution}/bank_ideas_draft.txt` — for any local government or public institution, not only the existing districts (도봉/노원/광진/동대문/동작 and those added since by the 25-district batch project). Every institution folder lives under `giganlist/`. This skill governs format only; researching and writing the actual content is separate work.

## When to Use

- Organizing web-research findings into `spec/` files for a new institution
- Writing or reviewing a `plan/` proposal document
- Drafting `bank_ideas_draft.txt`
- Double-checking an existing district's files still match the standard format

## `giganlist/{institution}/spec/` — raw research (numbering fixed, chapter names vary by institution)

| File | Content |
|---|---|
| `00_인덱스.txt` | One-line summary per file, plus a self-check: total item count and budget sum shown as chapter-sums = grand-total |
| `01_개요.txt` | Institution's plan overview, vision/goals, chapter structure, total budget |
| `0N_{장명}_사업목록_예산.txt` | Numbered items (`N-M`), budget, year-by-year table. Chapter names/count follow that institution's own plan structure — do not force district chapter names onto a different institution |
| `0N_홈페이지검색확인결과.txt` | Cross-check each project against the institution's own website. Classify as exactly one of **확인됨 / 부분확인 / 확인안됨** — "확인안됨" means a search limitation, not that the project was cancelled |
| `0N_민원게시판_YYYY년정리.txt` | Latest-year complaint-channel activity and pattern summary |

New institutions: gather this via web search. Districts already present under `giganlist/` are already-complete reference templates — do not re-research them.

## `giganlist/{institution}/plan/` — proposal documents (every claim cites spec)

| File | Content |
|---|---|
| `00_제안개요_및_배경.txt` | Proposal rationale and background |
| `01_제안사업_요약표.txt` | Table columns: 번호(`IT-N`/`FN-N`) / 사업명 / 우선순위 / 추정예산 / 담당(추정) / **연계 근거(spec/NN)** |
| `02_..._사업제안.txt`, `03_...` | Category-specific detail. Categories should follow the RFP's scoring-table categories (from `rfp-locate`'s `rfp_scoring.json`) when one exists — the dobong "IT디지털기획/금전적지원" 2-category split is an example, not a fixed schema |
| `04_실행로드맵_및_기대효과.txt` | Execution schedule, expected effects |
| `05_검증결과.txt` | Per-item **중복여부/타당성등급/판단근거/수정권고사항**, plus an overall trust score (/100). `판단근거` must cross-check citation accuracy against the spec source itself — if a citation is wrong or exaggerated, flag it in `수정권고사항` and lower the grade |

## `giganlist/{institution}/bank_ideas_draft.txt`

- Header states: "초안(draft) — 정식 반영 전, plan 반영 여부 별도 검토 필요"
- States its evidence scope: "근거자료: giganlist/{institution}/spec/00~NN, giganlist/{institution}/plan/00~NN"
- Organized by axis (소상공인금융/청년금융/IT협력/복지주택금융/SOC참여 — axes may be adapted per institution, but every idea must belong to one)
- Each idea has exactly 3 blocks, in order: `연계 구청사업/근거` (cites spec/plan) → `구체적 상품/협력 형태` → `은행 기대효과`
- Product names are generic categories (정책연계대출, 매칭적금, etc.), never real financial product brand names

## Citation Rule (applies throughout)

Every factual or numeric claim cites its source as `spec/NN`, `spec/NN(장-M)`, or `plan XX-N`. `05_검증결과.txt` cross-checks these citations against the actual spec text — a mismatch, exaggeration, or misquote lowers the grade and must be named in `수정권고사항` (example: dobong's IT-3 cited a project as "확인됨" when the spec source actually said "부분확인" — this exact kind of error is what `05_검증결과.txt` exists to catch).

## Reference

- `references/dobong_spec_sample.txt` — real `00_인덱스.txt` excerpt (format only, do not reuse the data)
- `references/dobong_plan_sample.txt` — real `00_제안개요_및_배경.txt` + `01_제안사업_요약표.txt` excerpt
- `references/dobong_bank_ideas_sample.txt` — real `bank_ideas_draft.txt` excerpt
