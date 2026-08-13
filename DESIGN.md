---
name: 금고은행 입찰 현황 히트맵
description: Korean securities-terminal (HTS) grammar for a national treasury-bank bid urgency board — dark, dense, hairline-gridded, data-first.
colors:
  board-black: "#07090e"
  chrome-deep: "#0a0e14"
  well: "#0a0f16"
  panel: "#0d1117"
  panel-raised: "#131a24"
  hairline: "#1f2733"
  hairline-strong: "#2b3646"
  ink: "#dbe4ee"
  ink-muted: "#7d8896"
  amber-signal: "#ffb020"
  ticker-amber: "#ffcf5e"
  watch-gold: "#ffe066"
  urgency-red: "#e5372e"
  urgency-orange: "#ef7d1a"
  urgency-yellow: "#d9b323"
  urgency-blue: "#2f66d8"
  urgency-gray: "#5b6572"
  map-red: "#c73528"
  map-orange: "#c26a12"
  map-yellow: "#a98e1c"
  map-blue: "#2c5cb8"
  map-gray: "#4a5462"
  map-inactive: "#c3cad9"
typography:
  title:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
  control:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
  data-mono:
    fontFamily: "Consolas, \"Cascadia Mono\", \"Malgun Gothic\", monospace"
    fontSize: "12px"
    fontFeature: "tabular-nums"
  caption:
    fontSize: "11px"
  micro-label:
    fontSize: "10px"
    letterSpacing: "0.06em"
rounded:
  sharp: "2px"
  flush: "0"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
components:
  button-default:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sharp}"
    padding: "5px 12px"
  button-default-hover:
    backgroundColor: "#182130"
  button-default-active:
    backgroundColor: "#0b0f16"
  input-field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sharp}"
    padding: "4px 8px"
  tab-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.flush}"
    padding: "0 16px"
  tab-item-active:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
  badge-status:
    typography: "{typography.caption}"
    rounded: "{rounded.sharp}"
    padding: "1px 7px"
  pin-watch:
    textColor: "{colors.amber-signal}"
    typography: "{typography.control}"
    rounded: "{rounded.sharp}"
    padding: "4px 10px"
  card-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.sharp}"
    padding: "10px"
---

# Design System: 금고은행 입찰 현황 히트맵

> **Scope.** Like `PRODUCT.md`, this document covers **`dashboard/` only** (the
> treasury-bank bid heatmap app). The rest of the repository (corpus/, plan/,
> corpus/reports/ deliverables) is a separate artifact family and is not governed
> by this system.
>
> Recorded 2026-08-13 from the shipped build (`dashboard/index.html` inline
> `<style>` + `dashboard/js/render.js`), after the finish review (disposition:
> ship). The world was chosen via decision page 2026-08-13, seed `6d3737b9`
> (code-led, degraded roll): **HTS 터미널**.

## Overview

**Creative North Star: "HTS 터미널" (The Securities Terminal)**

The dashboard treats treasury-bank bid tracking with the visual grammar of a
Korean home-trading-system (HTS) board: urgency is the market. A near-black
blue-tinted board (#07090e), hairline-gridded flat panels, and Korean market
color semantics — red rises (bid imminent), blue falls (bid distant) — turn the
national map into a quote board rather than an atlas. The single interactive
voice is amber (#ffb020): tab underlines, focus rings, selection ripples,
caret, text selection. Soft card-style admin layouts are explicitly rejected
(direction contract THESIS).

This is an Operate-mode surface: a working tool first, a demo second. Density
is deliberate — a tight 10–14px type ladder, 2px corners, 1px separations,
150ms state transitions, and tabular monospace numerals everywhere a figure,
date, or D-day appears. The system paints even the browser's own chrome
(scrollbars, ::selection, caret, form accent-color) so nothing breaks the
terminal illusion. Hard product constraints carry into the visuals: closed
network (no CDN, no webfonts — system faces only), vanilla JS, and DOM
ids/classes coupled to the node test suite.

**Key Characteristics:**
- Blue-black board with three-step tonal layering, no elevation shadows
- Korean market urgency semantics: red=imminent ↔ blue=distant, gray=unknown
- One amber interaction voice (#ffb020), runtime-themable via `render.applyTheme()`
- Consolas tabular numerals for all data; Malgun Gothic for Korean UI text
- 2px corners, hairline borders, inline-SVG stroke glyphs, zero emoji in chrome

## Colors

A two-tier dark palette: bright urgency hues for chrome (badges, ticker text,
D-day tags) and the same hues sunk one step toward the board for large map
fills.

### Primary
- **Amber Signal** (`--accent-color`, #ffb020): the only interaction color.
  Active-tab top border, focus outline, selection ripple rings and municipality
  blink, watch pins, search `<mark>` highlights, "ready" card borders, caret,
  ::selection background. Overwritten at runtime by `render.applyTheme()` from
  user-saved themes — always reference the variable, never the hex.
- **Ticker Amber** (#ffcf5e): brighter amber for the TOP5 ticker line and the
  date-unknown warning glyph strokes drawn on map faces.
- **Watch Gold** (#ffe066): watched-region outline and its glow, and the
  region-card star.

### Secondary — urgency scale (chrome tier)
The five semantic status variables; also reused for non-map status (workflow
badges, notice kinds, D-day tags). Meaning is positional, not decorative:
- **Urgency Red** (`--red`, #e5372e): ≤6 months to bid — imminent ("rising").
  Also: integrity-miss text, risk badges, notify badge, error borders.
- **Urgency Orange** (`--orange`, #ef7d1a): ≤1 year; approval/gate states.
- **Urgency Yellow** (`--yellow`, #d9b323): ≤2 years.
- **Urgency Blue** (`--blue`, #2f66d8): 2 years+ — distant ("falling"). Also:
  done/sent/normal states.
- **Urgency Gray** (`--gray`, #5b6572): date unknown.

### Tertiary — map board tier (`render.DEFAULT_THEME`)
The same five-band semantics deepened toward the board so the map reads as a
quote board, not an atlas (finish-review adjustment): **Map Red** (#c73528),
**Map Orange** (#c26a12), **Map Yellow** (#a98e1c), **Map Blue** (#2c5cb8),
**Map Gray** (#4a5462), plus **Map Inactive** (#c3cad9), a light neutral for
"준비중" regions (hatched overlay) so uniform dark labels stay legible. All
five bands are user-themable; `render.DEFAULT_THEME` is the design's default
and `render._safeColor()` hex-whitelists any stored value before it is
interpolated into markup.

### Neutral
- **Board Black** (`--bg`, #07090e): page background and map polygon strokes.
- **Chrome Deep** (#0a0e14): header and ticker-strip background; also the text
  color placed on amber (::selection, `<mark>`).
- **Well** (#0a0f16): input fields and the map stage — recessed surfaces.
- **Panel** (`--panel`, #0d1117) / **Panel Raised** (`--panel2`, #131a24):
  the two flat surface steps for panels, cards, buttons, active tabs.
- **Hairline** (`--line`, #1f2733) / **Hairline Strong** (`--line-strong`,
  #2b3646): row separators vs. component/panel borders.
- **Ink** (`--fg`, #dbe4ee) / **Ink Muted** (`--muted`, #7d8896): text
  hierarchy; muted also serves as the icon stroke default.

### Named Rules
**The Korean Market Rule.** Red means imminent/rising and blue means
distant/falling, per Korean securities convention. Never re-map to western
green-good/red-bad, and never use the urgency hues for interaction states.

**The One Amber Rule.** Amber (#ffb020) is reserved for selection, focus, and
interaction. It never encodes urgency; urgency hues never encode selection.

**The Deepened Board Rule.** Large fills (map faces) use the deepened tier;
small chrome (badges, ticker, legend) uses the bright tier. Small text set in
an urgency color over dark ground is lightened with
`color-mix(in srgb, <band> 70–72%, #ffffff)` — the legend and ticker both do
this; copy the pattern rather than brightening the token.

**The 18% Tint Rule.** Status chips are colored text + 1px same-color border +
`color-mix(in srgb, <band> 18%, transparent)` background. Status *rows* use the
same mix at 8–12%. Status is never a solid colored fill.

**The Variable-Name Freeze Rule.** The `:root` custom-property names (`--bg`,
`--panel`, `--panel2`, `--line`, `--line-strong`, `--fg`, `--muted`, `--red`,
`--orange`, `--yellow`, `--blue`, `--gray`, `--accent-color`,
`--ripple-duration`, `--mono`) are load-bearing: JS-generated inline markup
references them by name and `render.applyTheme()` writes two of them. Change
values to restyle; never rename.

## Typography

**Title/Body Font:** Malgun Gothic (with Segoe UI, sans-serif) — system Korean UI face
**Data/Mono Font:** Consolas (with Cascadia Mono, Malgun Gothic fallback), via `--mono`

**Character:** Utilitarian terminal type. No display face exists and none is
wanted; hierarchy is carried by weight, color (ink vs. muted), and the mono/
sans split rather than by size jumps. `font-variant-numeric: tabular-nums` is
set on `body`, so every numeral in the app is tabular even outside `--mono`.

### Hierarchy
- **Title** (700, 14px, 0.02em): app title (h1), modal headings, bucket
  headings. The largest text in the product.
- **Body** (400, 13px): default UI text, card names, chat, table cells.
- **Control** (400, 12px): buttons, inputs, tabs, filter labels, ticker items,
  breadcrumb region (mono), card metadata.
- **Caption** (400, 11px): badges, hints, timestamps, who-lines — mono
  (`--mono`) whenever the content is a count, date, or code.
- **Micro Label** (400, 10px, 0.06em, muted): strip titles ("기관 분류선택",
  legend title "입찰 임박도") — the terminal's tiny section captions.

### Named Rules
**The Tabular Ledger Rule.** Anything that is a figure — D-day, dates, counts,
badges with numbers, the ticker — is set in `--mono` (Consolas) so columns of
data align like a ledger.

**The Tight Ladder Rule.** The type scale is deliberately compressed to
10–14px (Operate-mode density). This is a committed decision, not an
oversight: the `flat-type-hierarchy` detector finding is suppressed as a
sanctioned exception in `.impeccable/config.json`. Do not introduce sizes
above 14px in app chrome to "fix" hierarchy; use weight, color, and spacing.

## Layout

A locked terminal frame: `body` is a full-viewport flex column
(`overflow:hidden`) stacking header (title + right-aligned tab strip) →
control strip (`#topbar`, 7px 14px padding, bottom hairline) → TOP5 ticker
band → the active tab view, which flex-fills the remainder (10px 14px
padding). The map tab splits into map stage (flex 2) and the ranking ladder
(flex 1); in national view (ladder hidden) the board width is capped to the
peninsula's aspect ratio via a `:has()` selector — a progressive enhancement
with no functional loss on non-supporting browsers.

Spacing rhythm is a 4–16px scale (4/6/8/10/12/14/16); panel interiors sit at
10px, inter-panel gaps at 10–12px, strip padding at 14px horizontal. Grids are
`auto-fill, minmax(160–200px, 1fr)` card grids with 8px gaps.

**Responsive (≤880px):** the frame unlocks (`body` scrolls), the tab strip
wraps to its own full-width scrollable row, the control strip stacks
vertically, the ranking ladder drops below the map (map min 52vh, ladder max
40vh) inside a scrolling `#tab-map`, and the designer list stacks above its
pane. Structure folds; nothing is hidden.

## Elevation & Depth

Flat. Depth is tonal, not cast: three background steps (board-black → panel →
panel-raised) plus hairline borders establish all layering. Panels, cards,
buttons, and modals cast **no shadows**. `box-shadow` appears only as
0-blur rings (`0 0 0 1px` accent/orange for current/gate/selected states —
outlines, not elevation) and inset selection tints. The two true depth
effects: the modal scrim (`rgba(2,4,8,.62)`) and the map's radial cloud
overlay used during drill-in.

### Shadow Vocabulary
- **Popover float** (`box-shadow: 0 6px 18px rgba(0,0,0,.5)`): the single
  elevation shadow in the system, on `#popover` only — it must read as above
  the map.
- **Watch glow** (`filter: drop-shadow(0 0 6px #ffe066)`): SVG glow on
  watched-region outlines; a signal, not elevation.

### Named Rules
**The Flat Board Rule.** Surfaces never cast shadows. If a state needs
emphasis, use a 1px ring (`box-shadow: 0 0 0 1px`), a border-color change, or
an 8–18% tint — never lift.

## Shapes

Angular terminal geometry: **2px border-radius on everything** — buttons,
inputs, cards, badges, pins, modals. Tabs are the one flush-square (0) element,
drawn as a strip with 1px vertical hairline separators and a 2px amber top
border on the active tab. Every component is bounded by a 1px hairline
(`--line-strong` for component edges, `--line` for internal row separators).
Diagonal 45° hatching (4px period) is the "no data / 준비중 / guessed date"
texture, applied as an SVG pattern overlay. Map marker silhouettes are a fixed
shape-per-type code: municipality=filled polygon face, ▲ public agency,
■ public enterprise, ● university hospital, ⬟ university — mirrored 1:1 by the
`.fsw` filter glyphs in the control strip.

## Components

### Buttons
- **Shape:** sharp (2px radius), 1px `--line-strong` border.
- **Default:** panel-raised (#131a24) fill, ink text, 12px, 5px 12px padding.
- **Hover / Active:** background lightens to #182130 (border #3c4a5e) /
  darkens to #0b0f16; 150ms background+border transition. Disabled: 45–55%
  opacity, no color change.
- **Focus:** 1px amber outline, 1px offset (global `:focus-visible`).
- There is no filled "primary" button — hierarchy comes from placement.

### Inputs / Fields
- **Style:** recessed well (#0a0f16), 1px `--line-strong` border, 2px radius,
  4px 8px padding, 12px text; amber caret and `accent-color`.
- **Focus:** same global amber outline as buttons.

### Navigation (tab strip)
- Transparent buttons in the header, muted text, hairline left separators,
  0 radius; hover fills panel; active fills panel-raised with ink text and a
  2px amber top border. Server-only tabs are hidden, not disabled.

### Chips / Badges
- **Status badge** (`.wf-badge`, `.nt-kind`, `.dg-day`, `.dg-tag`): 11px,
  1px 7px (or 1px 6px) padding, 2px radius, per The 18% Tint Rule; D-day and
  count badges in `--mono`.
- **Watch pin** (`.pin`): amber text + amber border over a 14% amber tint;
  draggable (cursor:grab).

### Cards / Containers
- **Corner:** 2px. **Background:** `--panel`. **Border:** 1px `--line-strong`.
- **Padding:** 10px (7–11px range). **Shadow:** none (Flat Board Rule).
- **Hover:** border-color shifts to amber, 150ms. **Selected:** amber ring or
  inset amber tint (see Ranking Ladder).

### Modals & Popover
- Angular `modal-box` (panel fill, hairline border, 16px padding, 6–8vh top
  margin, max-height with internal scroll region so actions never leave the
  viewport) over the `rgba(2,4,8,.62)` scrim. Popover: fixed, 280px max,
  panel fill, the system's only drop shadow.

### Icon Glyphs (signature)
`render.ICONS` (heart, star, warning triangle) and the `.fsw` filter glyphs:
inline SVG on a 12×12 viewBox, 1.2–1.4 stroke width, `currentColor` (or
`--muted` for filters), 10–12px rendered. **No emoji anywhere in chrome** —
the former 🔴🟠 legend and ⚠️ markers were replaced with drawn stroke glyphs.
Deliberate typographic exceptions where HTS grammar itself uses characters:
the `!` integrity glyph on markers, the ▲ rising mark in the ticker
(red-band items only), `·` ticker separators, and `←` in the breadcrumb
back button.

### Map Board (signature)
The centerpiece. Polygon faces filled by the deepened urgency tier, stroked
1px in board-black; labels are uniform dark ink (#10151d, 13px/700) with a
light halo (#eef3fa 3px stroke, `paint-order:stroke`) and a 10px "준비중"
sub-line; label collisions resolved by vertical push. Selection language:
amber triple ripple rings (phase-offset thirds of `--ripple-duration`, default
2.2s) for coordinate markers, amber outline blink (`muni-blink`, same
duration variable) for municipality faces — one settings UI tunes both. Drill
zoom: 750ms fly-in + 400ms hold. Legend: bottom-right mono instrument panel,
`pointer-events:none`, swatches from the live theme with band-colored labels.

### Ranking Ladder (signature)
The 호가창 (order-book) panel: sticky panel-raised header, zero-radius rows
separated by `--line` hairlines, 7px 10px padding; hover #141c28; selection is
an inset amber ring + 12% amber tint (`.hi`). Rows carry heart toggles
(ICONS), name in 13px bold, type/date in 11px mono muted.

### Ticker Band (signature)
A one-line quote strip under the controls on chrome-deep: 12px `--mono` in
ticker amber, `임박 TOP5` micro-caption, entries tinted per urgency band
(lightened 72% toward white), ▲ prefix on red-band items, `·` separators,
ellipsis overflow.

## Do's and Don'ts

### Do:
- **Do** reference tokens as `var(--…)` in generated markup — `--accent-color`
  and `--ripple-duration` change at runtime, and the five urgency bands come
  from `render.URGENCY_COLORS` (theme-merged), not from constants.
- **Do** pass any color that originated in localStorage through
  `render._safeColor()` before interpolating it into HTML/inline styles.
- **Do** set every figure, date, and D-day in `--mono`; keep 150ms transitions
  for hover/state; signal state with border-color and 8–18% tints.
- **Do** sink any new large-area color toward board-black (the map tier) and
  keep bright hues for small chrome.
- **Do** draw new icons as inline SVG stroke glyphs (1.2–1.4 stroke,
  `currentColor`, 12×12 grid), matching `render.ICONS`.
- **Do** check `dashboard/test/*.test.js` before touching DOM ids, classes, or
  the token names — 243 node tests are coupled to them.

### Don't:
- **Don't** rename any `:root` custom property (Variable-Name Freeze Rule) or
  hardcode #ffb020 where `var(--accent-color)` belongs.
- **Don't** introduce radii above 2px, panel shadows, gradients-as-decoration,
  or soft card-admin styling — the world rejects it by thesis.
- **Don't** add external resources of any kind (fonts, CDNs, icon packages) —
  closed-network constraint; system faces only.
- **Don't** use emoji in chrome, or use amber for urgency / urgency hues for
  selection.
- **Don't** exceed the 10–14px chrome type ladder; hierarchy comes from
  weight, color, and the mono/sans split (Tight Ladder Rule).
- **Don't** re-map the urgency semantics away from the Korean market
  convention (red=imminent, blue=distant).
