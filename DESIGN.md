---
name: 금고은행 입찰 현황 히트맵
description: Premium dark chrome with a pastel urgency map — tinted-charcoal panels, grain and glass carry the frame; saturation belongs to the data.
colors:
  charcoal-base: "#0f1218"
  panel: "#151a22"
  panel-raised: "#1a2029"
  input-well: "#0d1117"
  hairline: "#232a35"
  hairline-strong: "#2e3745"
  ink: "#e2e7ee"
  ink-muted: "#8b94a3"
  teal-accent: "#57b8ad"
  on-accent-dark: "#0d1116"
  watch-gold: "#d8c47a"
  ember-red: "#e07856"
  clay-orange: "#d9a05b"
  reed-yellow: "#c9bd8f"
  slate-blue: "#7c93c4"
  storm-gray: "#5a6273"
  map-pastel-red: "#f0a6a9"
  map-pastel-orange: "#f3c795"
  map-pastel-yellow: "#e9e3a8"
  map-pastel-blue: "#a9c5ea"
  map-pastel-gray: "#7c8699"
  map-inactive: "#c3cad9"
typography:
  title:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  heading:
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "\"Malgun Gothic\", \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
  control:
    fontSize: "12px"
    fontWeight: 400
  caption:
    fontSize: "11px"
    fontWeight: 400
  micro-label:
    fontSize: "10px"
    letterSpacing: "0.08em"
  data-mono:
    fontFamily: "Consolas, \"Cascadia Mono\", \"Malgun Gothic\", monospace"
    fontSize: "12px"
    fontFeature: "tabular-nums"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  strip: "20px"
components:
  button-default:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-default-hover:
    backgroundColor: "#202836"
  input-field:
    backgroundColor: "{colors.input-well}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  tab-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.control}"
    rounded: "9px"
    padding: "6px 16px"
  tab-item-active:
    backgroundColor: "color-mix(in srgb, #57b8ad 16%, transparent)"
    textColor: "{colors.ink}"
  badge-status:
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
  pin-watch:
    textColor: "{colors.teal-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
  card-region:
    backgroundColor: "{colors.panel}"
    rounded: "12px"
    padding: "13px 14px"
  card-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
---

# Design System: 금고은행 입찰 현황 히트맵

> **Scope.** Like `PRODUCT.md`, this document covers **`dashboard/` only** (the
> treasury-bank bid heatmap app). The rest of the repository (corpus/, plan/,
> corpus/reports/ deliverables) is a separate artifact family and is not
> governed by this system.
>
> Recorded 2026-08-14 from the shipped build (`dashboard/index.html` inline
> `<style>` + `dashboard/js/render.js`), after the finish review (disposition:
> ship). This world replaces the former "HTS 터미널" system (shipped
> 2026-08-13): the user compared 8 variants across two comparison rounds and
> locked variant 7.1 on 2026-08-14; the reviewer shipped after a five-fix batch
> (map-stage width cap, ≤880px label shrink, SVG ticker triangle, label
> sub-line tone, 16px title).

## Overview

**Creative North Star: "프리미엄 다크 크롬 + 파스텔 지도" (Premium Dark Chrome, Pastel Map)**

The chrome is a quiet, premium dark instrument case: tinted charcoal (#0f1218)
rather than black, hairline-bordered panels, a faint SVG-noise grain over
everything, soft 8–14px corners, glassy overlays, and shadows tinted toward the
room's own blue-charcoal. On that near-achromatic stage, the national map is
the only saturated object — a pastel five-band urgency palette (inherited from
the 1.0 report's palette, user-themable) that reads instantly because nothing
around it competes. The thesis, from the direction contract: a dashboard whose
chrome is louder than its data is rejected; saturation is reserved for the
data (urgency).

One color speaks for interaction everywhere: teal (#57b8ad) — active-tab tint,
focus rings, selection ripples and municipality blink, watch pins, search
marks, caret, ::selection. It is the most saturated hue on screen precisely
because it appears in small doses. The story shape follows: a staff member
passes through colorless chrome straight to the colored map, clicks an
imminent region, and picks an institution from the ranking panel into the
workflow.

This remains an Operate-mode working tool as well as a demo. Density is kept —
a tight 10–16px type ramp, tabular Consolas for every figure — but the finish
is soft: 200ms lift-on-hover controls, one staggered entrance, real
backdrop-blur glass. Hard product constraints carry into the visuals: closed
network (no CDN, no webfonts — system faces only), vanilla JS, and DOM
ids/classes coupled to the node test suite (244 tests).

**Key Characteristics:**
- Tinted-charcoal chrome in three tonal steps + hairlines + grain overlay (0.045 opacity)
- Saturation monopoly: the pastel urgency map is the only saturated element; teal (#57b8ad) is the single interaction voice
- Two-tier urgency color: pastel tier for map fills (runtime-themable via `render.applyTheme()`), muted deep tier for chrome badges
- Real glass (blur + 1px white-alpha edge + inner highlight) and tinted shadows (`rgba(8,12,24,…)`), never pure black
- Soft geometry: 8/10/14px radius scale, pill segmented tabs; Malgun Gothic UI + Consolas tabular numerals

## Colors

A near-achromatic charcoal chrome carrying two tiers of the same five-band
urgency semantics: soft pastels on the map, muted deep tones in the chrome.

### Primary
- **Teal Accent** (`--accent-color`, #57b8ad): the only interaction color —
  chosen as the hue that pops best over the pastels. Active-tab 16% tint,
  focus outlines, ripple rings and municipality blink, selected-row bar and
  13% tint, watch pins, `<mark>` highlights, caret, form `accent-color`,
  ::selection background, ready-state borders, the h1 logo glyph. Overwritten
  at runtime by `render.applyTheme()` from user-saved themes — always
  reference the variable, never the hex.
- **On-Accent Dark** (#0d1116): text placed on teal (::selection, `<mark>`).

### Secondary — urgency scale, chrome tier
The five `:root` status variables, deliberately desaturated so badges and tags
whisper on the dark chrome. Reused for non-map status (workflow badges, notice
kinds, D-day tags):
- **Ember Red** (`--red`, #e07856): ≤6 months to bid — imminent. Also
  integrity-miss text, risk badges, the notify badge, error borders.
- **Clay Orange** (`--orange`, #d9a05b): ≤1 year; approval/gate states.
- **Reed Yellow** (`--yellow`, #c9bd8f): ≤2 years.
- **Slate Blue** (`--blue`, #7c93c4): 2 years+ — distant; done/sent/normal.
- **Storm Gray** (`--gray`, #5a6273): date unknown.

### Tertiary — map pastel tier (`render.DEFAULT_THEME`)
The same five bands lifted to pastels for the large map fills, so an overlaid
ripple/blink never drowns: **Map Pastel Red** (#f0a6a9), **Map Pastel Orange**
(#f3c795), **Map Pastel Yellow** (#e9e3a8), **Map Pastel Blue** (#a9c5ea),
**Map Pastel Gray** (#7c8699), plus **Map Inactive** (#c3cad9) for "준비중"
regions (hatched overlay) so the dark labels stay legible. All five bands and
the accent are user-themable; `render.DEFAULT_THEME` is the design's default,
and `render._safeColor()` hex-whitelists any stored value before it is
interpolated into markup.

### Neutral
- **Charcoal Base** (`--bg`, #0f1218): page background — charcoal tinted
  toward blue, never pure black.
- **Panel** (`--panel`, #151a22) / **Panel Raised** (`--panel2`, #1a2029):
  the two flat surface steps for panels, cards, buttons, tab housing.
- **Input Well** (#0d1117): recessed fill for text inputs and selects.
- **Hairline** (`--line`, #232a35) / **Hairline Strong** (`--line-strong`,
  #2e3745): row separators vs. component/panel borders; also the scrollbar
  thumb.
- **Ink** (`--fg`, #e2e7ee) / **Ink Muted** (`--muted`, #8b94a3): text
  hierarchy; muted also serves as the default icon stroke.
- **Watch Gold** (#d8c47a): watched-region outline (with its
  `rgba(216,196,122,.7)` glow) and the region-card star — the one
  non-teal, non-urgency signal color.

### Named Rules
**The Saturation Monopoly Rule.** Chrome stays tinted-achromatic. Full
saturation exists in exactly two places: the pastel map (data) and the teal
accent (interaction). Status color in chrome appears only as muted-tier text,
1px borders, and ≤18% tints — never as a solid saturated fill.

**The One Teal Rule.** Teal is reserved for selection, focus, and interaction.
It never encodes urgency; urgency hues never encode selection.

**The Two-Tier Urgency Rule.** Large fills (map faces) use the pastel tier;
small chrome (badges, tags, ticker, legend swatches) uses the muted deep tier.
Small text set in a band color over dark ground is lightened with
`color-mix(in srgb, <band> 70–72%, #ffffff)` — the legend and ticker both do
this; copy the pattern rather than brightening the token.

**The 18% Tint Rule.** Status chips are colored text + 1px same-color border +
`color-mix(in srgb, <band> 18%, transparent)` background. Status *rows* use
the same mix at 8–12%; teal selections use 13–16%. Status is never a solid
colored fill.

**The Variable-Name Freeze Rule.** The `:root` custom-property names (`--bg`,
`--panel`, `--panel2`, `--line`, `--line-strong`, `--fg`, `--muted`, `--red`,
`--orange`, `--yellow`, `--blue`, `--gray`, `--accent-color`,
`--ripple-duration`, `--mono`) are load-bearing: JS-generated inline markup
references them by name and `render.applyTheme()` writes `--accent-color` and
`--ripple-duration` at runtime. Change values to restyle; never rename.

## Typography

**Title/Body Font:** Malgun Gothic (with Segoe UI, sans-serif) — system Korean UI face
**Data/Mono Font:** Consolas (with Cascadia Mono, Malgun Gothic fallback), via `--mono`

**Character:** Quiet utilitarian type with a slight premium tightening: all
headings carry -0.01em letter-spacing, micro-captions open up to +0.08em, and
`font-variant-numeric: tabular-nums` on `body` makes every numeral tabular
even outside `--mono`. No display face exists and none is wanted (closed
network — system faces only).

### Hierarchy
- **Title** (700, 16px, -0.01em): the h1 app title only, paired with its
  14px teal SVG logo glyph.
- **Section Title** (700, 15px, -0.01em): in-page section headings
  (`.wf-cards-title`, `.dg-bucket h4`).
- **Heading** (700 default, 14px, -0.01em): modal `h3` headings.
- **Body** (400, 13px): default UI text, card names, chat, table cells,
  document view (1.6 line-height there).
- **Control** (400, 12px): buttons, inputs, tabs, filter labels, ticker
  (mono), breadcrumb region (mono), card metadata.
- **Caption** (400, 11px): badges, hints, timestamps, who-lines — `--mono`
  whenever the content is a count, date, or code.
- **Micro Label** (400, 10px, +0.08em, muted): strip titles ("기관 분류선택",
  legend title "입찰 임박도").

### Named Rules
**The Tabular Ledger Rule.** Anything that is a figure — D-day, dates, counts,
numbered badges, the ticker — is set in `--mono` (Consolas) so columns of data
align like a ledger.

**The Tight Operate Ramp Rule.** The type ramp is deliberately compressed to
10–16px (Operate-mode density; the 16px title is its ceiling, added at finish
review for demo presence). This is a committed decision, not an oversight: the
`flat-type-hierarchy` detector finding is suppressed as a sanctioned exception
in `.impeccable/config.json`. Do not introduce larger display sizes in app
chrome to "fix" hierarchy; use weight, color, and spacing.

## Layout

A locked full-viewport flex column (`body` overflow hidden) stacking: header
(title + right-aligned segmented tab pill, 12px 20px 10px padding, bottom
hairline) → control strip (`#topbar`, 10px 20px, bottom hairline) → TOP5
ticker band (6px 20px) → the active tab view, which flex-fills the remainder
at 14px 20px padding. Horizontal strip padding is a constant 20px; component
gaps run 6–16px; panel interiors sit at 9–14px; inter-panel gap is 14px.
Grids are `auto-fill, minmax(170–200px, 1fr)` card grids with 8–10px gaps.

The map tab centers a `#drill-wrap` split: map stage (flex 2) and ranking
panel (flex 1). In national view (ranking hidden) the stage width is capped to
`calc((100vh - 150px) * 1.3)` with `min-width: min(100%, 700px)` via a
`:has()` selector — a progressive enhancement (finish-review fix: the radial
stage absorbs side width inside the frame instead of leaving dead page
background); non-supporting browsers just get a wider stage.

**Motion (entrance):** one staggered `fadeUp` on load — header → topbar →
ticker → map stage at 0/60/120/180ms delays, 0.5s
`cubic-bezier(.22,.9,.3,1)`, fully disabled under
`prefers-reduced-motion: reduce`. All control state changes transition at
200ms. **The One Entrance Rule.** The page animates in once, lightly; nothing
re-animates on tab switches or data refresh.

**Responsive (≤880px):** the frame unlocks (`body` scrolls), the tab pill
takes its own full-width scrollable row, the control strip stacks vertically,
the ranking panel drops below the map (map min 52vh, ranking max 40vh) inside
a scrolling `#tab-map`, the designer list stacks above its pane, and map
labels shrink (13px→10px, halo 3px→2px) with the "준비중" sub-line hidden to
prevent collisions (finish-review fix). Structure folds; nothing is hidden.

## Elevation & Depth

A hybrid: tonal layering (charcoal-base → panel → panel-raised, separated by
hairlines) does the structural work, and **tinted ambient shadows** add the
premium float — every shadow is `rgba(8,12,24,…)`, the room's own
blue-charcoal, never neutral black. Framed surfaces (map stage, ranking
panel, modals, popover) rest under the shared `--shadow`; controls and cards
lift on hover (translateY(-1/-2px) + a lighter tinted shadow) and settle on
press (`scale(.98)`, shadow removed). Glass is real: the legend, popover,
sticky ranking header, and breadcrumb buttons use `backdrop-filter: blur`
over a translucent panel tone, with a 1px `rgba(255,255,255,.08)` edge and an
inset white top highlight on the legend. Two atmosphere layers complete the
depth: the fixed grain overlay (inline-SVG fractal noise at 0.045 opacity,
breaking flat sterility offline) and the map stage's radial gradient
(#171d28 → #101520 → #0d1119 from upper-left) with a radial cloud overlay
during drill-in.

### Shadow Vocabulary
- **Ambient panel** (`--shadow: 0 12px 32px rgba(8,12,24,.55)`): resting
  shadow for map stage, ranking panel, modal boxes, popover.
- **Button lift** (`0 6px 16px rgba(8,12,24,.4)` + translateY(-1px)): button
  hover; removed on :active.
- **Card lift** (`0 8px 20px rgba(8,12,24,.4)` + translateY(-2px)): region
  card hover, with border warming toward teal.
- **Glass legend** (`inset 0 1px 0 rgba(255,255,255,.06), 0 8px 24px
  rgba(8,12,24,.45)`): inner highlight + soft drop on the map legend.
- **Selection bar** (`inset 2px 0 0 var(--accent-color)`): left accent bar on
  the highlighted ranking row.
- **State ring** (`0 0 0 1px` accent/orange): current/gate workflow steps —
  an outline, not elevation.
- **Watch glow** (`filter: drop-shadow(0 0 6px rgba(216,196,122,.7))`): SVG
  glow on watched-region outlines; a signal, not elevation.

### Named Rules
**The Tinted Shadow Rule.** Every shadow in the system is cast in
`rgba(8,12,24,…)`. Never introduce a neutral `rgba(0,0,0,…)` drop shadow.

**The Real Glass Rule.** Glass surfaces are built from all three parts —
translucent panel tone + `backdrop-filter: blur(8–10px)` + 1px white-alpha
edge (plus inner highlight where floating). A translucent fill alone is not
glass.

## Shapes

Soft premium geometry on a three-step radius scale: **8px** (`--r-sm`:
inputs, workflow/task cards, badges), **10px** (`--r`: buttons, chat
surfaces, knowledge cards, pins), **14px** (`--r-lg`: framed panels — map
stage, ranking panel, modal boxes). Glass overlays and region cards sit at
12px; the segmented tab control is a pill-in-pill (12px housing, 9px inner
buttons, 3px inset); small inline chips and `<mark>`s run 3–8px. Every
surface is bounded by a 1px hairline (`--line-strong` for component edges,
`--line` for internal separators). Diagonal 45° hatching (4px period, SVG
pattern) is the "준비중 / guessed date" texture. Map marker silhouettes keep
the fixed shape-per-type code — municipality = filled polygon face,
▲ public agency, ■ public enterprise, ● university hospital, ⬟ university —
mirrored 1:1 by the `.fsw` stroke glyphs in the control strip.

## Components

### Buttons
- **Shape:** softly rounded (10px), 1px `--line-strong` border.
- **Default:** panel-raised (#1a2029) fill, ink text, 12px, 6px 14px padding.
- **Hover:** background #202836, border #3a4557, translateY(-1px) + button
  lift shadow, 200ms. **Active:** settles (`translateY(0) scale(.98)`, shadow
  off). **Disabled:** 45–55% opacity, no motion.
- **Focus:** 2px teal outline, 2px offset (global `:focus-visible`).
- **Primary (단일 예외, 2026-08-14):** `#ch-send`(대화 보내기)만 틸 원색 채움 +
  on-accent 잉크(#0d1116)/700 — 탭의 유일 주행동이라 사용자 확정으로 승격.
  hover는 82% 흰색 믹스로 밝힘, disabled 50%. 다른 곳에 채운 주버튼을 늘리지
  말 것(One Teal Rule — 상호작용 보이스는 소량이라 튄다).
- 그 외에는 filled "primary"가 없다 — hierarchy comes from placement.
  `.btn-like` wraps file inputs in the same skin.

### Inputs / Fields
- **Style:** recessed well (#0d1117), 1px `--line-strong` border, 8px radius,
  5px 10px padding, 12px text; teal caret and `accent-color`.
- **Focus:** the same global teal outline as buttons.
- **UA-drawn controls:** `:root` declares `color-scheme: dark`, so the controls
  the browser paints itself (checkboxes, scrollbars, date pickers) follow the
  dark chrome. `accent-color` alone is not enough — it only colors the *checked*
  state, leaving unchecked boxes white against the charcoal ground (measured
  2026-08-18 on the 권한관리 permission grid). Styled controls (`<select>`,
  text fields) are unaffected; this rule only reaches what CSS never touched.
  ⚠️ The light-skinned comparison files (`index_4.0/5.0/6.0`) must **not** get
  this declaration — light is their intent.

### Navigation (segmented tabs)
- A pill segment control in the header: panel housing (12px radius, 1px
  hairline, 3px padding) holding transparent 9px-radius buttons in muted
  text; hover brightens text only (no lift); active fills with a 16% teal
  tint and ink text. Server-only tabs are hidden, not disabled.

### Chips / Badges
- **Status badge** (`.wf-badge`, `.nt-kind`, `.dg-day`, `.dg-tag`): 11px, 1px
  6–7px padding, 6–8px radius, per The 18% Tint Rule; D-day and count badges
  in `--mono`.
- **Watch pin** (`.pin`): teal text + 55%-teal border over a 13% teal tint,
  10px radius; draggable (cursor:grab), hover lifts 1px.

### Cards / Containers
- **Corner:** 8px (dense work cards) or 12–14px (framed panels/region cards).
- **Background:** `--panel`; **Border:** 1px `--line` or `--line-strong`.
- **Padding:** 8–14px. **Shadow:** none at rest for small cards; framed
  panels carry `--shadow`.
- **Hover:** border warms toward teal (55% mix on region cards) with card
  lift; **Selected:** teal ring/outline or 13% teal tint.

### Modals & Popover
- `modal-box`: panel fill, 1px `--line-strong` border, 14px radius,
  `--shadow`, 18px padding, 6–8vh top margin, internal scroll region — over a
  blurred scrim (`rgba(8,11,17,.6)` + blur(4px)). Popover: fixed, 280px max,
  glass (rgba(21,26,34,.92) + blur(10px) + white-alpha edge), 12px radius.

### Icon Glyphs (signature)
`render.ICONS` (heart, star, warning triangle, rising triangle) and the
`.fsw` filter glyphs: inline SVG on a 12×12 viewBox, 1.2–1.4 stroke width,
`currentColor` (or `--muted` for filters), 9–12px rendered. **No emoji and no
character-glyph icons in chrome** — the ticker's rising mark is the drawn
`ICONS.up` triangle (finish-review fix), not the ▲ character. Sanctioned
character exceptions: the `!` integrity glyph on markers, `·` ticker
separators, and `←` in the breadcrumb back button.

### Map Board (signature)
The centerpiece and the only saturated field. Polygon faces filled by the
pastel tier over the radial-gradient stage; labels are dark ink (#141922,
13px/700) with a light halo (#eef2f8, 3px stroke, `paint-order:stroke`) and a
10px/600 sub-line (#333b4c) for "준비중"; collisions resolved by vertical
push; markers stroked in near-bg dark (#0f1420). Selection language: three
teal ripple rings phase-offset by thirds of `--ripple-duration` (default
2.2s) for markers; teal outline blink (`muni-blink`, same variable) for
municipality faces — one theme modal tunes both color and period. Drill zoom:
750ms fly-in with a 700ms radial cloud fade. Legend: bottom-right glass
instrument panel (blur(10px), white-alpha edge, inner highlight,
`pointer-events:none`), 11px `--mono`, live-theme swatches (12px, 4px radius)
with band-colored labels lightened 70% toward white.

### Ranking Panel (signature)
The drill-in institution ladder: 14px-radius framed panel under `--shadow`;
sticky glass header (82% panel color-mix + blur(8px)); rows separated by
`--line` hairlines, 9px 14px padding; hover slides 3px right on #1a2130;
selection is the inset 2px teal bar + 13% teal tint (`.hi`). Rows carry heart
toggles (ICONS, `--red`), name in 13px bold, type/date in 11px mono muted.

### Ticker Band (signature)
A quiet one-line quote strip under the controls: 12px `--mono` muted, `임박
TOP5` micro-caption (+0.08em), entries colored per urgency band lightened 72%
toward white via `color-mix`, the drawn `ICONS.up` triangle prefixed to
red-band items only, `·` separators in `--line-strong`, ellipsis overflow.

## Do's and Don'ts

### Do:
- **Do** reference tokens as `var(--…)` in generated markup — `--accent-color`
  and `--ripple-duration` change at runtime, and the five map bands come from
  `render.URGENCY_COLORS` (theme-merged, identity-stable), not from constants.
- **Do** pass any color that originated in localStorage through
  `render._safeColor()` before interpolating it into HTML/inline styles.
- **Do** keep every shadow tinted `rgba(8,12,24,…)`, hover lifts at
  translateY(-1/-2px), and state transitions at 200ms.
- **Do** set every figure, date, and D-day in `--mono`; signal status with
  colored text + 1px border + 8–18% `color-mix` tints.
- **Do** draw new icons as inline SVG stroke glyphs (1.2–1.4 stroke,
  `currentColor`, 12×12 grid) matching `render.ICONS`.
- **Do** run `node --test dashboard/test/*.test.js` before touching DOM ids,
  classes, or token names — 244 node tests are coupled to them.

### Don't:
- **Don't** rename any `:root` custom property (Variable-Name Freeze Rule) or
  hardcode #57b8ad where `var(--accent-color)` belongs.
- **Don't** let chrome compete with the map: no saturated chrome fills, no
  decorative gradients outside the map stage, no second accent hue
  (Saturation Monopoly Rule).
- **Don't** add external resources of any kind (fonts, CDNs, icon packages) —
  closed-network constraint; system faces only.
- **Don't** cast neutral-black shadows, use hard offset shadows, or drop
  surface radii below the 8px floor — the soft tinted finish is the world.
- **Don't** exceed the 10–16px type ramp in app chrome; hierarchy comes from
  weight, color, and the mono/sans split (Tight Operate Ramp Rule).
- ~~Don't canonize the two carried off-token literals in `render.js`~~ —
  **해소(2026-08-14)**: 클러스터 배지·geo-retry 배너를 현행 토큰
  (#1a2029 / #e2e7ee)으로 재도색 완료. 이월 결함 없음.
